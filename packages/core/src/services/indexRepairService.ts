/**
 * 索引体检 / 自愈：把「用户真正在意的片子」（收藏 + 观看历史）的播放地址提前校验并修好。
 *
 * 背景：旧库迁移时 `media_source` 的 (source_id, vod_id) 可能错配（vod_id 属于另一个源），
 * 真实库抽样约 23% 的行存在问题。运行时 `MediaDetailService.ensureDetail` 已做
 * 「标题校验 + 同源按名自愈」，但只有用户点开那一部时才会触发。
 *
 * 这里在启动后台（界面就绪后）把收藏与观看历史这批「用户会回头看的片子」跑一遍：
 *  - 命中缓存的条目只查本地库，几乎没有成本（详情缓存对「有观看进度」的媒体永不淘汰）；
 *  - 错配/缺详情的一次性修好并回写 vod_id，之后点开即秒播；
 *  - 串行 + 间隔，避免与采集/播放抢带宽与写锁；
 *  - 单次上限默认 200 条，进程内只跑一次；失败静默。
 */
import type { DatabaseProvider } from '../db/provider';
import { MediaDetailService } from './mediaDetailService';

/** 单次体检上限（收藏 + 历史去重后） */
const DEFAULT_LIMIT = 200;
/** 每条之间的间隔，避免连续打源站 */
const INTERVAL_MS = 250;
/** 观看历史分页大小 */
const HISTORY_PAGE = 200;

export interface IndexRepairResult {
  /** 候选媒体数（收藏 ∪ 观看历史，去重后，受 limit 限制） */
  total: number;
  /** 实际处理数（中途取消会小于 total） */
  checked: number;
  /** 本次真正联网拉取并修好的条数（命中缓存的不计） */
  healed: number;
  /** 全部源都拿不到的条数 */
  failed: number;
}

/** 进程内防重入：同一时刻只允许一次体检 */
let running = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 收集候选：收藏 ∪ 观看历史（按最近观看优先，受 limit 限制） */
export async function collectRepairCandidates(
  provider: DatabaseProvider,
  limit: number = DEFAULT_LIMIT
): Promise<number[]> {
  const ids = new Set<number>();

  try {
    const favorites = await provider.getAllFavorites();
    for (const f of favorites) {
      if (f.mediaId) ids.add(f.mediaId);
      if (ids.size >= limit) return [...ids];
    }
  } catch (err) {
    console.warn('[IndexRepair] 读取收藏失败:', err instanceof Error ? err.message : String(err));
  }

  try {
    const total = await provider.getWatchHistoryCount();
    const pages = Math.ceil(total / HISTORY_PAGE);
    for (let page = 1; page <= pages && ids.size < limit; page++) {
      const rows = await provider.getAllWatchHistory(page, HISTORY_PAGE);
      for (const h of rows) {
        if (h.mediaId) ids.add(h.mediaId);
        if (ids.size >= limit) break;
      }
      if (rows.length < HISTORY_PAGE) break;
    }
  } catch (err) {
    console.warn('[IndexRepair] 读取观看历史失败:', err instanceof Error ? err.message : String(err));
  }

  return [...ids];
}

/**
 * 对收藏 + 观看历史批量执行「校验 + 自愈」。
 * 返回统计；失败不抛（调用方 fire-and-forget 即可）。
 */
export async function repairUserMediaIndex(
  provider: DatabaseProvider,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<IndexRepairResult> {
  const empty: IndexRepairResult = { total: 0, checked: 0, healed: 0, failed: 0 };
  if (running) return empty;
  running = true;
  try {
    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const ids = await collectRepairCandidates(provider, limit);
    if (ids.length === 0) return empty;

    console.log(`[IndexRepair] 开始体检：候选 ${ids.length} 条（收藏 + 观看历史）`);
    const service = new MediaDetailService(provider);
    let checked = 0;
    let healed = 0;
    let failed = 0;

    for (const mediaId of ids) {
      if (opts?.signal?.aborted) break;
      try {
        const result = await service.ensureDetail(mediaId);
        checked++;
        if (result.ok && !result.cached) {
          healed++;
          console.log(`[IndexRepair] 已修复 media=${mediaId} source=${result.sourceId}`);
        } else if (!result.ok) {
          failed++;
        }
      } catch (err) {
        failed++;
        console.warn(`[IndexRepair] media=${mediaId} 体检异常:`, err instanceof Error ? err.message : String(err));
      }
      await sleep(INTERVAL_MS);
    }

    console.log(`[IndexRepair] 完成：候选 ${ids.length}，处理 ${checked}，修复 ${healed}，失败 ${failed}`);
    return { total: ids.length, checked, healed, failed };
  } finally {
    running = false;
  }
}
