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
import { extractLanguage } from '../utils/versionMerge';
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
    const eps = await this.db.getEpisodesByMediaId(mediaId, 1, sourceId);
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
    if (sources.length === 0) {
      return { ok: false, sourceId: null, cached: false, error: '该影片没有关联的视频源，请重新采集' };
    }

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
        const item = await this.fetchVerifiedItem(adapter, src.sourceId, src.vodId, media, mediaId);
        if (!item) {
          lastError = `源站无该影片详情（源=${src.sourceId}）`;
          continue;
        }
        // 自愈结果回写索引：下次直接用正确的 vod_id，零额外请求
        await this.db
          .upsertMediaSource(mediaId, src.sourceId, String(item.vod_id), new Date().toISOString())
          .catch(() => undefined);
        await this.writeDetail(mediaId, src.sourceId, item.vod_play_from || '', item.vod_play_url || '', item.vod_content || '');
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
            const item = await this.searchVerifiedItem(adapter, media, mediaId);
            if (!item) continue;
            console.log(`[MediaDetail] 换源自愈 media=${mediaId} 新源=${vs.id} vod_id=${item.vod_id}`);
            await this.db
              .upsertMediaSource(mediaId, vs.id, String(item.vod_id), new Date().toISOString())
              .catch(() => undefined);
            await this.writeDetail(mediaId, vs.id, item.vod_play_from || '', item.vod_play_url || '', item.vod_content || '');
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
  private async fetchVerifiedItem(
    adapter: CMSAdapter,
    sourceId: string,
    vodId: string,
    media: Media | null,
    mediaId: number
  ): Promise<CMSMediaItem | null> {
    if (vodId) {
      try {
        const response = await adapter.getDetail(vodId);
        const item = response.list?.[0];
        if (item) {
          const matched = await this.matchesMedia(item, media);
          if (matched) return item;
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
    return this.searchVerifiedItem(adapter, media, mediaId);
  }

  /** 按片名在该源搜索，返回标题校验通过的条目（同年优先；仅一个候选且标题一致才用） */
  private async searchVerifiedItem(
    adapter: CMSAdapter,
    media: Media | null,
    mediaId: number
  ): Promise<CMSMediaItem | null> {
    const title = media?.title;
    if (!title) return null;
    const response = await adapter.getDetailByKeyword(title);
    const list = response.list ?? [];
    if (list.length === 0) return null;

    const candidates: CMSMediaItem[] = [];
    for (const item of list) {
      if (await this.matchesMedia(item, media)) candidates.push(item);
    }
    if (candidates.length === 0) return null;
    // 年份最接近者优先（源站年份标注常有 ±1 偏差）
    const yearOf = (v: CMSMediaItem): number => Number.parseInt(String(v.vod_year ?? ''), 10) || 0;
    candidates.sort(
      (a, b) => Math.abs(yearOf(a) - (media?.year ?? 0)) - Math.abs(yearOf(b) - (media?.year ?? 0))
    );
    const picked = candidates[0];
    if (candidates.length > 1) {
      console.log(`[MediaDetail] 片名命中 ${candidates.length} 条，取 id=${picked.vod_id} 《${picked.vod_name}》 media=${mediaId}`);
    }
    return picked;
  }

  /** 标题是否与库内媒体一致（规范化后逐字相等；年份只作排序参考，不作硬性拒绝） */
  private async matchesMedia(item: CMSMediaItem, media: Media | null): Promise<boolean> {
    if (!media?.title || !item?.vod_name) return false;
    return (await this.titleKey(item.vod_name)) === (await this.titleKey(media.title));
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
    mediaId: number,
    sourceId: string,
    vodPlayFrom: string,
    vodPlayUrl: string,
    vodContent: string
  ): Promise<void> {
    const { sources, episodes: epGroups } = parsePlayUrlGroups(vodPlayFrom, vodPlayUrl);
    const seasonNumber = 1;
    const sourceName = SOURCE_ID_TO_NAME_MAP[sourceId] || '未知源';

    const episodesBatch: Episode[] = [];
    const playSourcesBatch: PlaySource[] = [];
    const keys: string[] = [];

    for (let g = 0; g < epGroups.length; g++) {
      const lineName = sources[g] || `线路${g + 1}`;
      const quality = PLAY_SOURCE_TYPE_MAP[lineName] || null;
      const eps = epGroups[g];
      for (let i = 0; i < eps.length; i++) {
        const ep = eps[i];
        const epNumber = i + 1;
        episodesBatch.push({
          id: 0,
          mediaId,
          seasonNumber,
          episodeNumber: epNumber,
          title: ep.title || null,
          duration: null,
          sourceId,
        });
        playSourcesBatch.push({
          id: 0,
          episodeId: 0,
          sourceId,
          sourceName,
          url: ep.url,
          quality,
          language: extractLanguage(ep.title, quality ?? undefined) ?? null,
        });
        keys.push(`${seasonNumber}:${epNumber}:${sourceId}`);
      }
    }

    const description = vodContent ? await normalizer.normalizeDescription(vodContent) : null;

    await this.db.withTransactionAsync(async () => {
      await this.db.deleteEpisodesByMediaIdAndSourceId(mediaId, sourceId);
      if (episodesBatch.length > 0) {
        const epIdMap = await this.db.upsertEpisodesBatch(episodesBatch);
        const resolvable = playSourcesBatch.filter((_, i) => epIdMap.has(keys[i]));
        for (let i = 0; i < resolvable.length; i++) {
          resolvable[i].episodeId = epIdMap.get(keys[i])!;
        }
        if (resolvable.length > 0) {
          await this.db.upsertPlaySourcesBatch(resolvable);
        }
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
