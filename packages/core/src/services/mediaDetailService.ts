/**
 * 按需详情服务：采集只落索引（media + media_source），播放地址/剧集在用户真正打开时拉取。
 *
 * 缓存策略：
 *  - `media_detail` 登记「哪条媒体在哪个源已抓过详情」+ 简介文本，按 fetched_at 做 TTL 与 LRU；
 *  - `episode` / `play_source` 只保留最近 `DETAIL_CACHE_KEEP_MEDIA` 条媒体的明细，
 *    超出后由 `pruneMediaDetailCache` 淘汰（有播放进度的媒体永不淘汰，避免续播位置丢失）。
 *
 * 失败切源：优先用调用方指定的源，失败后自动尝试该媒体的其它 media_source。
 */
import type { DatabaseProvider } from '../db/provider';
import type { CMSMediaItem, Episode, Media, PlaySource } from '../types';
import { CMSAdapter } from './cmsAdapter';
import { SOURCE_ID_TO_NAME_MAP, PLAY_SOURCE_TYPE_MAP, isPlayableMediaUrl } from '../utils/constants';
import { isVersionTitle } from '../utils/typeMapper';
import { computeBaseTitle, extractLanguage } from '../utils/versionMerge';
import { normalizer } from '../utils/normalizer';

/** 详情缓存有效期：超过则重新拉取（保留旧缓存，拉取失败时不至于没得播） */
const DETAIL_TTL_MS = 6 * 60 * 60 * 1000;
/** 详情缓存保留的媒体条数（LRU） */
const DETAIL_CACHE_KEEP_MEDIA = 300;

export interface EnsureDetailResult {
  ok: boolean;
  /** 实际拿到详情的源 id（失败时为 null） */
  sourceId: string | null;
  /** 是否命中缓存（未发网络请求） */
  cached: boolean;
  error?: string;
}

/** 解析 CMS 的 `vod_play_from` / `vod_play_url`（与采集链路同一套规则） */
export function parsePlayUrlGroups(vodPlayFrom: string, vodPlayUrl: string): { sources: string[]; episodes: { title: string; url: string }[][] } {
  const sources = vodPlayFrom ? vodPlayFrom.split('$$$').map((s) => s.trim()).filter(Boolean) : [];
  const urlGroups = vodPlayUrl ? vodPlayUrl.split('$$$').map((s) => s.trim()).filter(Boolean) : [];
  const episodes: { title: string; url: string }[][] = [];
  for (const group of urlGroups) {
    const list: { title: string; url: string }[] = [];
    for (const line of group.split('#').filter(Boolean)) {
      const idx = line.lastIndexOf('$');
      if (idx > 0) {
        const title = line.substring(0, idx).trim();
        const url = line.substring(idx + 1).trim();
        if (url && isPlayableMediaUrl(url)) list.push({ title, url });
      }
    }
    episodes.push(list);
  }
  return { sources, episodes };
}

export class MediaDetailService {
  constructor(private db: DatabaseProvider) {}

  private async hasCachedEpisodes(mediaId: number, sourceId: string): Promise<boolean> {
    // 不限定季号：`series_season>1` 的媒体剧集应落在该季，固定查 season 1 会误判「未缓存」反复联网
    const eps = await this.db.getEpisodesByMediaId(mediaId, undefined, sourceId);
    return eps.length > 0;
  }

  /**
   * 确保该媒体的播放明细已就位。
   * 命中（TTL 内 + 有剧集）直接返回；否则按源顺序拉取，首个成功即用。
   */
  async ensureDetail(mediaId: number, opts?: { sourceId?: string; force?: boolean }): Promise<EnsureDetailResult> {
    // 同一媒体并发调用复用同一个飞行中请求：播放页预取与用户真正切换可能同时触发，
    // 不去重会发两次 ac=detail（浪费带宽、可能互相覆盖写入）。force 显式重拉时不复用。
    if (!opts?.force) {
      const existing = MediaDetailService.inflight.get(mediaId);
      if (existing) return existing;
    }
    const task = this.ensureDetailInternal(mediaId, opts);
    MediaDetailService.inflight.set(mediaId, task);
    void task
      .catch(() => undefined)
      .then(() => {
        // 仅当仍是自己时清除，避免被后续 force 请求覆盖后误删
        if (MediaDetailService.inflight.get(mediaId) === task) MediaDetailService.inflight.delete(mediaId);
      });
    return task;
  }

  /** 同一媒体的飞行中拉取（进程级） */
  private static readonly inflight = new Map<number, Promise<EnsureDetailResult>>();

  private async ensureDetailInternal(
    mediaId: number,
    opts?: { sourceId?: string; force?: boolean }
  ): Promise<EnsureDetailResult> {
    const media = await this.db.getMediaById(mediaId);
    const sources = await this.db.getMediaSourcesByMediaId(mediaId);
    // 注意：sources 为空不能直接失败。老库迁移时 vod_id 为空的 media 不会回填 media_source，
    // 若这里早退，跨源「按片名自愈」分支永远走不到，那些影片就彻底不可播。

    // 指定源优先，其余按 updated_at 降序兜底
    const ordered = opts?.sourceId
      ? [
          ...sources.filter((s) => s.sourceId === opts.sourceId),
          ...sources.filter((s) => s.sourceId !== opts.sourceId),
        ]
      : sources;

    let lastError = '';
    const tried = new Set<string>();
    for (const src of ordered) {
      tried.add(src.sourceId);
      if (!opts?.force) {
        const meta = await this.db.getMediaDetailMeta(mediaId, src.sourceId);
        if (meta) {
          const age = Date.now() - Date.parse(meta.fetchedAt);
          if (!Number.isNaN(age) && age < DETAIL_TTL_MS && (await this.hasCachedEpisodes(mediaId, src.sourceId))) {
            return { ok: true, sourceId: src.sourceId, cached: true };
          }
        }
      }

      const videoSource = await this.db.getVideoSourceById(src.sourceId);
      if (!videoSource || !videoSource.baseUrl) {
        lastError = `视频源「${src.sourceId}」不可用`;
        continue;
      }

      try {
        const adapter = new CMSAdapter(videoSource.baseUrl);
        const items = await this.fetchVerifiedItems(adapter, src.sourceId, src.vodId, media, mediaId);
        if (items.length === 0) {
          lastError = `源站无该影片详情（源=${src.sourceId}）`;
          continue;
        }
        // 自愈结果回写索引：单条目固化 vod_id（下次零额外请求）；
        // 多版本归并（同源国语+粤语等）不能只固化一个，否则下次只会拉到一个版本 → 置空强制重新搜索。
        const vodIdToSave = items.length === 1 ? String(items[0].vod_id) : '';
        await this.db
          .upsertMediaSource(mediaId, src.sourceId, vodIdToSave, new Date().toISOString())
          .catch(() => undefined);
        await this.writeDetail(media, mediaId, src.sourceId, items);
        await this.db.pruneMediaDetailCache(DETAIL_CACHE_KEEP_MEDIA).catch(() => 0);
        return { ok: true, sourceId: src.sourceId, cached: false };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[MediaDetail] 拉取详情失败 media=${mediaId} source=${src.sourceId}: ${lastError}`);
      }
    }

    // 已知源全部失败 → 在「其它已启用源」按片名兜底（源站整库重建/下架时唯一出路）。
    // 命中后会新增一条正确的 media_source（源 + vod_id），下次直接命中该行。
    if (media?.title) {
      try {
        const enabled = await this.db.getEnabledVideoSources();
        for (const vs of enabled) {
          if (!vs.baseUrl || tried.has(vs.id)) continue;
          try {
            const adapter = new CMSAdapter(vs.baseUrl);
            const items = await this.searchVerifiedItems(adapter, media, mediaId);
            if (items.length === 0) continue;
            console.log(`[MediaDetail] 换源自愈 media=${mediaId} 新源=${vs.id} 条目=${items.map((i) => i.vod_id).join(',')}`);
            const vodIdToSave = items.length === 1 ? String(items[0].vod_id) : '';
            await this.db
              .upsertMediaSource(mediaId, vs.id, vodIdToSave, new Date().toISOString())
              .catch(() => undefined);
            await this.writeDetail(media, mediaId, vs.id, items);
            await this.db.pruneMediaDetailCache(DETAIL_CACHE_KEEP_MEDIA).catch(() => 0);
            return { ok: true, sourceId: vs.id, cached: false };
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }
        }
      } catch (err) {
        console.warn(`[MediaDetail] 跨源兜底失败 media=${mediaId}:`, err instanceof Error ? err.message : String(err));
      }
    }

    return { ok: false, sourceId: null, cached: false, error: lastError || '所有视频源均无法获取播放地址' };
  }

  /**
   * 取「标题校验通过」的详情条目：先按 vod_id 拉，失败/不匹配再按片名搜索。
   *
   * 必须校验标题的原因（真实数据实测）：库里的 (source_id, vod_id) 可能是错配的
   * （旧库迁移用 `MIN(episode.source_id)` 配 `media.vod_id`，两者不一定同源），
   * 按错配 id 拉回来的会是**别的影片**；若不校验就会把别人的播放地址写到本片名下。
   */
  private async fetchVerifiedItems(
    adapter: CMSAdapter,
    sourceId: string,
    vodId: string,
    media: Media | null,
    mediaId: number
  ): Promise<CMSMediaItem[]> {
    if (vodId) {
      try {
        const response = await adapter.getDetail(vodId);
        const item = response.list?.[0];
        if (item) {
          const matched = await this.matchesMedia(item, media);
          if (matched) return [item];
          console.warn(
            `[MediaDetail] vod_id 指向别的影片，改按片名解析 media=${mediaId} source=${sourceId} vod_id=${vodId} 期望《${media?.title}》实得《${item.vod_name}》`
          );
        }
      } catch (err) {
        console.warn(
          `[MediaDetail] 按 vod_id 拉详情失败 media=${mediaId} source=${sourceId} vod_id=${vodId}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
    return this.searchVerifiedItems(adapter, media, mediaId);
  }

  /**
   * 按片名在该源搜索，返回需要写入的条目（可能多条）。
   *
   * 规则（对齐精简前采集的版本归并语义）：
   *  - 只接受「同一季」且「同年（两侧都有年份时）」的条目；
   *  - 非版本条目必须与库内标题严格同名（避免把《谷雨（预告片）》《吞噬星空第四季》并进来）；
   *  - 同名重复条目只取一条（优先集数多的），版本条目（国语/粤语/普通话版…）全部保留并归并。
   */
  private async searchVerifiedItems(
    adapter: CMSAdapter,
    media: Media | null,
    mediaId: number
  ): Promise<CMSMediaItem[]> {
    const title = media?.title;
    if (!title) return [];
    const yearOf = (v: CMSMediaItem): number => Number.parseInt(String(v.vod_year ?? ''), 10) || 0;
    const mediaYear = media?.year ?? 0;
    const mediaSeason = media?.seriesSeason || normalizer.extractSeasonNumber(title) || 1;
    const mediaBase = computeBaseTitle(title, mediaYear || undefined);
    const mediaBaseKey = await this.titleKey(mediaBase.baseTitle || title);
    const mediaRawTitle = (await normalizer.normalizeTitle(title)).trim();

    let pool: CMSMediaItem[] = [];
    const pushPool = (items: CMSMediaItem[]) => {
      for (const it of items) {
        if (!pool.some((x) => String(x.vod_id) === String(it.vod_id))) pool.push(it);
      }
    };

    try {
      pushPool((await adapter.getDetailByKeyword(title)).list ?? []);
    } catch {
      // 搜索失败：继续尝试基准标题
    }
    // 版本条目（普通话版/国语/粤语/尾部年份…）源站通常只收录「基准标题」，全称搜不到
    if (mediaBase.baseTitle && mediaBase.baseTitle !== title) {
      try {
        pushPool((await adapter.getDetailByKeyword(mediaBase.baseTitle)).list ?? []);
      } catch {
        // 保持已有 pool
      }
    }

    // 过滤：季号 / 年份 / 基准标题
    const sameSeason = (name: string): boolean => {
      const s = normalizer.extractSeasonNumber(name) || 1;
      return s === mediaSeason;
    };
    const baseOf = async (name: string, y: number | null) => {
      const { baseTitle, isVersionItem } = computeBaseTitle(name, y ?? undefined);
      return { key: await this.titleKey(baseTitle || name), isVersionItem };
    };

    const exact: CMSMediaItem[] = [];
    const versions: CMSMediaItem[] = [];
    for (const item of pool) {
      if (!item?.vod_name) continue;
      if (!sameSeason(item.vod_name)) continue;
      const iy = yearOf(item);
      if (mediaYear && iy && iy !== mediaYear) continue;
      const { key, isVersionItem } = await baseOf(item.vod_name, iy || null);
      if (key !== mediaBaseKey) continue;

      const raw = (await normalizer.normalizeTitle(item.vod_name)).trim();
      if (raw === mediaRawTitle) {
        exact.push(item);
      } else if (isVersionItem) {
        // 版本条目（语言/年份后缀）：同一版本只保留一条
        if (!versions.some((v) => String(v.vod_id) === String(item.vod_id))) {
          versions.push(item);
        }
      }
      // 既非同名、也不是版本条目（如《谷雨（预告片）》）→ 丢弃
    }

    // 同名重复条目：只取一条（优先集数多的，近似「更新至 N 集」）
    const groupEps = (item: CMSMediaItem): number => {
      const { episodes } = parsePlayUrlGroups(item.vod_play_from || '', item.vod_play_url || '');
      return episodes.reduce((m, g) => Math.max(m, g.length), 0);
    };
    const dedupeByName = async (list: CMSMediaItem[]): Promise<CMSMediaItem[]> => {
      const byName = new Map<string, CMSMediaItem>();
      for (const it of list) {
        const raw = (await normalizer.normalizeTitle(it.vod_name)).trim();
        const prev = byName.get(raw);
        if (!prev || groupEps(it) > groupEps(prev)) byName.set(raw, it);
      }
      return [...byName.values()];
    };

    const exactPicked = await dedupeByName(exact);
    const versionsPicked = await dedupeByName(versions);

    let result: CMSMediaItem[] = [];
    if (exactPicked.length > 0) {
      exactPicked.sort((a, b) => Math.abs(yearOf(a) - mediaYear) - Math.abs(yearOf(b) - mediaYear));
      result = [exactPicked[0]];
    }
    result.push(...versionsPicked);
    if (result.length === 0) return [];

    console.log(
      `[MediaDetail] 命中 ${result.length} 条（同名主 + 版本）：${result.map((c) => `${c.vod_id}《${c.vod_name}》`).join(', ')} media=${mediaId}`
    );
    return result;
  }

  /** 标题是否与库内媒体一致（规范化后逐字相等；年份只作排序参考，不作硬性拒绝） */
  private async matchesMedia(item: CMSMediaItem, media: Media | null): Promise<boolean> {
    if (!media?.title || !item?.vod_name) return false;
    return (await this.titleKey(item.vod_name)) === (await this.titleKey(media.title));
  }

  /** 基准标题归一化：先剥离版本后缀（国语/粤语/普通话版/尾部年份），再走 titleKey */
  private async baseTitleKey(title: string, year?: number | null): Promise<string> {
    if (!title) return '';
    const { baseTitle } = computeBaseTitle(title, year ?? undefined);
    return this.titleKey(baseTitle);
  }

  /** 标题归一化：简繁统一 + 去标点/空格/括号内容 + 去更新集数/季数后缀 */
  private async titleKey(title: string): Promise<string> {
    const simplified = await normalizer.normalizeTitle(title);
    return simplified
      .replace(/[（(【\[].*?[）)】\]]/g, '')
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, '')
      .replace(/更新到第[一二三四五六七八九十百千\d]+集$/i, '')
      .replace(/更新至第[一二三四五六七八九十百千\d]+集$/i, '')
      .replace(/更新\d+集$/i, '')
      .replace(/第[一二三四五六七八九十百千\d]+季$/i, '')
      .replace(/season\s*\d+$/i, '')
      .trim();
  }

  /** 把一页详情写成 episode / play_source / media_detail（覆盖该媒体在该源下的旧明细） */
  private async writeDetail(
    media: Media | null,
    mediaId: number,
    sourceId: string,
    items: CMSMediaItem[]
  ): Promise<void> {
    if (items.length === 0) return;
    // 季号必须沿用旧采集语义（title 的季号 == media.seriesSeason）：
    // 写死 1 会让 series_season>1 的影片剧集全落到第 1 季，播放页按 currentSeason 查不到（实测第五季 → 0 集）。
    const seasonNumber = media?.seriesSeason || normalizer.extractSeasonNumber(media?.title || '') || 1;
    const isMovie = media?.type === 'MOVIE';
    const sourceName = SOURCE_ID_TO_NAME_MAP[sourceId] || '未知源';

    const episodesBatch: Episode[] = [];
    const playSourcesBatch: PlaySource[] = [];
    const keys: string[] = [];
    let descriptionSource = '';

    for (const item of items) {
      // 版本归并条目：语言从条目名取（集标题通常只是「第01集」）
      const itemLanguage = extractLanguage(item.vod_name);
      if (!descriptionSource && item.vod_content) descriptionSource = item.vod_content;
      const { sources, episodes: epGroups } = parsePlayUrlGroups(item.vod_play_from || '', item.vod_play_url || '');

      for (let g = 0; g < epGroups.length; g++) {
        const lineName = sources[g] || `线路${g + 1}`;
        const quality = PLAY_SOURCE_TYPE_MAP[lineName] || null;
        const eps = epGroups[g];
        for (let i = 0; i < eps.length; i++) {
          const ep = eps[i];
          // 电影版本集归并（与旧采集一致）：同一部电影的多版本（HD/国语/粤语…）归到第 1 集，版本名落到 quality
          const isVersion = isMovie && isVersionTitle(ep.title);
          const epNumber = isVersion ? 1 : i + 1;
          episodesBatch.push({
            id: 0,
            mediaId,
            seasonNumber,
            episodeNumber: epNumber,
            title: isVersion ? null : ep.title || null,
            duration: null,
            sourceId,
          });
          playSourcesBatch.push({
            id: 0,
            episodeId: 0,
            sourceId,
            sourceName,
            url: ep.url,
            quality: isVersion ? ep.title : quality,
            language: extractLanguage(ep.title, quality ?? undefined) ?? itemLanguage ?? null,
          });
          keys.push(`${seasonNumber}:${epNumber}:${sourceId}`);
        }
      }
    }

    const description = descriptionSource ? await normalizer.normalizeDescription(descriptionSource) : null;

    await this.db.withTransactionAsync(async () => {
      // 【必须 upsert 优先，不能先删后插】episode 是 INTEGER PRIMARY KEY（rowid），
      // 先删会让全部剧集换新 id，而 watch_history / watch_line_progress 按 episode_id /
      // play_source_id 记忆进度 —— 每次详情刷新都会把该片所有进度变成孤儿（实测刷新后 49 行历史全部失效）。
      const epIdMap = episodesBatch.length > 0 ? await this.db.upsertEpisodesBatch(episodesBatch) : new Map<string, number>();

      const urlsByEpisode = new Map<number, string[]>();
      for (let i = 0; i < playSourcesBatch.length; i++) {
        const epId = epIdMap.get(keys[i]);
        if (!epId) continue;
        playSourcesBatch[i].episodeId = epId;
        const arr = urlsByEpisode.get(epId);
        if (arr) arr.push(playSourcesBatch[i].url);
        else urlsByEpisode.set(epId, [playSourcesBatch[i].url]);
      }
      const resolvable = playSourcesBatch.filter((p) => p.episodeId > 0);
      if (resolvable.length > 0) {
        await this.db.upsertPlaySourcesBatch(resolvable);
      }
      // 只清理源站已下线的剧集/线路（多版本条目本轮都写入了，union 内不会被误删）。
      // 解析结果为空（源站临时异常/风控返回空列表）时绝不清理，否则会把可播数据清空。
      if (keys.length > 0) {
        await this.db.deleteEpisodesNotInKeys(mediaId, sourceId, keys);
        for (const [epId, urls] of urlsByEpisode) {
          await this.db.deletePlaySourcesNotInUrls(epId, urls);
        }
      }
      // 回写已更新集数（只增不减）：卡片「更新至第 N 集」不停留在采集时旧值
      if (episodesBatch.length > 0) {
        const currentEpisodes = Math.max(...episodesBatch.map((e) => e.episodeNumber));
        await this.db.updateMediaCurrentEpisodes(mediaId, currentEpisodes).catch(() => undefined);
      }
      await this.db.upsertMediaDetail(mediaId, sourceId, new Date().toISOString(), description);
    });
  }
}

/**
 * 取「媒体 + 季 + 源」的剧集；该源尚未缓存剧集时按需拉详情再回查。
 *
 * 与 `store.loadEpisodes` 同语义，供直接用 provider 的页面（TV 详情/播放页）复用，
 * 避免「切到未缓存的源 → 空剧集列表」。
 */
export async function loadEpisodesForSource(
  db: DatabaseProvider,
  mediaId: number,
  season: number | undefined,
  sourceId?: string | null
): Promise<Episode[]> {
  const cached = await db.getEpisodesByMediaId(mediaId, season, sourceId ?? undefined);
  if (cached.length > 0) return cached;
  // 未缓存：按需拉该源详情（ensureDetail 内部有飞行中去重；失败会自动尝试其它源）
  const detail = await new MediaDetailService(db).ensureDetail(mediaId, sourceId ? { sourceId } : undefined);
  if (!detail.ok) return [];
  return db.getEpisodesByMediaId(mediaId, season, detail.sourceId ?? sourceId ?? undefined);
}
