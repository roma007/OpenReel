import type { DatabaseProvider } from '../db/provider';
import type { Media, WatchHistory } from '../types';
import { MediaDetailService } from './mediaDetailService';

export interface DefaultPlayTarget {
  episodeId: number;
  sourceId: string;
  playSourceId?: number | null;
}

/**
 * 解析点击卡片后默认播放的目标（集 + 线路），实现「精准续播」。
 *
 * 优先级：
 * 1. 续播：取「最近观看的集」（按各集最新观看记录的 updatedAt 取最大者）：
 *    - 该集未看完（progress > 0 且未到片尾 nearEnd）→ 直接续播该集；
 *    - 该集已看完（nearEnd）→ 续到按季/集序号排序的下一集；没有下一集则重播该集。
 *    该集的源/线路按观看记录的 sourceId/playSourceId 精确匹配（与 openPlayback 的
 *    续播时间戳恢复逻辑一致），匹配不到则回退到首个有 url 的线路。
 * 2. 无任何进度记录时取第一季第一集，源取首个有 url 的线路。
 *
 * 说明：按「最近观看」而非「进度最大」选集，避免已追到第 N 集后因早期某一集
 * 断在看了一半（进度最大但未看完）而从老集续播。
 *
 * 返回 null 表示该媒体无可播放的集或线路。
 */
export async function resolveDefaultPlayTarget(
  provider: DatabaseProvider,
  media: Media,
): Promise<DefaultPlayTarget | null> {
  let episodes = await provider.getEpisodesByMediaId(media.id);

  // 索引采集模式下 episode/play_source 只是「最近打开过的 300 条」缓存，未缓存的片子
  // 这里必须先按需联网拉取，否则点击卡片会解析不到任何剧集 → 静默无反应（实测回归）。
  // 命中缓存时无网络请求；拉到后按「实际命中的源」限定剧集，避免多源同名集数叠加。
  if (!episodes || episodes.length === 0) {
    try {
      const detail = await new MediaDetailService(provider).ensureDetail(media.id);
      if (detail.ok) {
        episodes = await provider.getEpisodesByMediaId(media.id, undefined, detail.sourceId ?? undefined);
      }
    } catch (err) {
      console.warn(`[PlayTarget] 按需详情拉取失败 media=${media.id}:`, err instanceof Error ? err.message : String(err));
    }
  }

  if (!episodes || episodes.length === 0) return null;

  const sorted = [...episodes].sort(
    (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
  );

  let chosen: (typeof sorted)[number] | null = null;
  let preferredSourceId: string | null = null;
  let preferredPlaySourceId: number | null = null;

  try {
    const history = await provider.getAllWatchHistoryByMediaId(media.id);
    const lastByEpisode = new Map<number, WatchHistory>();
    for (const h of history) {
      if (!h.episodeId || h.episodeId === media.id) continue;
      if (h.progress <= 0) continue;
      const prev = lastByEpisode.get(h.episodeId);
      if (!prev || h.updatedAt > prev.updatedAt) lastByEpisode.set(h.episodeId, h);
    }
    const latest = [...lastByEpisode.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
    if (latest) {
      const latestEp = sorted.find((e) => e.id === latest.episodeId);
      if (latestEp) {
        const nearEnd = latest.duration > 0 && latest.progress >= latest.duration - 5;
        if (!nearEnd) {
          chosen = latestEp;
        } else {
          const idx = sorted.indexOf(latestEp);
          chosen = sorted[idx + 1] ?? latestEp;
        }
      }
    }
    if (chosen) {
      const prefer = lastByEpisode.get(chosen.id);
      if (prefer) {
        preferredSourceId = prefer.sourceId ?? null;
        preferredPlaySourceId = prefer.playSourceId ?? null;
      }
    }
  } catch {
    // 续播解析失败不影响默认播放首集
  }

  if (!chosen) chosen = sorted[0];

  const chosenSources = await provider.getPlaySourcesByEpisodeId(chosen.id);
  const chosenPick =
    (preferredPlaySourceId && chosenSources.find((s) => s.url && s.id === preferredPlaySourceId)) ||
    (preferredSourceId && chosenSources.find((s) => s.url && s.sourceId === preferredSourceId)) ||
    chosenSources.find((s) => s.url) ||
    chosenSources[0];
  if (chosenPick) {
    return { episodeId: chosen.id, sourceId: chosenPick.sourceId, playSourceId: chosenPick.id };
  }

  for (const ep of sorted) {
    if (ep.id === chosen.id) continue;
    const sources = await provider.getPlaySourcesByEpisodeId(ep.id);
    const src = sources.find((s) => s.url) ?? sources[0];
    if (src) return { episodeId: ep.id, sourceId: src.sourceId, playSourceId: src.id };
  }

  return null;
}
