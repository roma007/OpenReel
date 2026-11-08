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
import type { Episode, PlaySource } from '../types';
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
    for (const src of ordered) {
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
        const response = await adapter.getDetail(src.vodId);
        const item = response.list?.[0];
        if (!item) {
          lastError = `源站未返回该影片详情`;
          continue;
        }
        await this.writeDetail(mediaId, src.sourceId, item.vod_play_from || '', item.vod_play_url || '', item.vod_content || '');
        await this.db.pruneMediaDetailCache(DETAIL_CACHE_KEEP_MEDIA).catch(() => 0);
        return { ok: true, sourceId: src.sourceId, cached: false };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[MediaDetail] 拉取详情失败 media=${mediaId} source=${src.sourceId}: ${lastError}`);
      }
    }

    return { ok: false, sourceId: null, cached: false, error: lastError || '所有视频源均无法获取播放地址' };
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
