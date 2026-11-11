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
import type { CMSMediaItem, Media } from '../types';
import { MediaDetailService } from './mediaDetailService';
import { CMSAdapter } from './cmsAdapter';
import { normalizer } from '../utils/normalizer';

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
  /** 补齐索引时新增的「媒体 × 源」条数（见 backfillUserMediaSources） */
  sourcesAdded?: number;
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

    // 详情体检之后再补一次「缺失的源索引」：详情修好了但播放页只显示部分源，是索引漏登记导致的，
    // 采集侧已改为按源水位判定，存量数据靠这里补（只覆盖收藏 + 观看历史，宁缺勿错）。
    let sourcesAdded: number | undefined;
    try {
      const backfill = await backfillUserMediaSources(provider, { limit: Math.min(ids.length, BACKFILL_LIMIT), signal: opts?.signal });
      sourcesAdded = backfill.added;
    } catch (err) {
      console.warn('[IndexRepair] 源索引补齐失败（不影响详情体检）:', err instanceof Error ? err.message : String(err));
    }

    return { total: ids.length, checked, healed, failed, sourcesAdded };
  } finally {
    running = false;
  }
}

/** 补齐索引：收藏 + 观看历史里「明明别的源也有、但没登记」的源 */
export interface BackfillSourcesResult {
  /** 候选媒体数 */
  total: number;
  /** 实际检查过的媒体数 */
  checked: number;
  /** 新登记的「媒体 × 源」条数 */
  added: number;
  /** 单个源搜索失败的次数（不影响其它源） */
  failed: number;
}

/** 补齐时单次最多处理多少部片（收藏 + 历史去重后） */
const BACKFILL_LIMIT = 30;
/** 每次源站搜索之间的间隔 */
const BACKFILL_INTERVAL_MS = 300;

/** 进程内防重入 */
let backfilling = false;

/** 标题归一：简繁统一 + 去括号内容 + 去标点/空白/更新集数后缀（与按需详情的标题校验同口径） */
async function titleKey(title: string): Promise<string> {
  const simplified = await normalizer.normalizeTitle(title);
  return simplified
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, '')
    .replace(/更新到?第?[一二三四五六七八九十百千\d]+集$/i, '')
    .replace(/第[一二三四五六七八九十百千\d]+季$/i, '')
    .replace(/season\s*\d+$/i, '')
    .trim();
}

function yearOf(item: CMSMediaItem): number {
  return Number.parseInt(String(item.vod_year ?? ''), 10) || 0;
}

/**
 * 给「收藏 + 观看历史」的片子补齐 `media_source`。
 *
 * 背景：采集时的「源未变跳过」过去用跨源共享水位（`media.source_updated_at`）比较，
 * 导致某些源的同片被整条跳过、索引没登记，播放页只显示部分源（实测《伟大的长征》6 源里 5 源有片，
 * 只登记 2 源）。采集侧已改为按源水位，但**存量数据不会自己长回来**，这里做一次性补齐。
 *
 * 校验口径宁严勿宽（宁可漏一个源，不可挂错片）：
 *  - 归一化标题必须完全一致（含去掉括号内容、集数/季数后缀）；
 *  - 两侧都有年份时必须**完全相等**（不做 ±1 容忍，避免把同名不同剧挂进来）；
 *  - 季号必须一致；
 *  - 版本条目（国语/粤语/普通话版）不参与补齐，避免把版本 variant 当独立源。
 */
export async function backfillUserMediaSources(
  provider: DatabaseProvider,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<BackfillSourcesResult> {
  const empty: BackfillSourcesResult = { total: 0, checked: 0, added: 0, failed: 0 };
  if (backfilling) return empty;
  backfilling = true;
  try {
    const limit = opts?.limit ?? BACKFILL_LIMIT;
    const ids = await collectRepairCandidates(provider, limit);
    if (ids.length === 0) return empty;

    const sources = await provider.getEnabledVideoSources();
    if (sources.length === 0) return empty;

    console.log(`[IndexBackfill] 开始补齐：候选 ${ids.length} 部（收藏 + 观看历史），启用源 ${sources.length} 个`);
    let checked = 0;
    let added = 0;
    let failed = 0;

    for (const mediaId of ids) {
      if (opts?.signal?.aborted) break;
      const media: Media | null = await provider.getMediaById(mediaId);
      if (!media?.title) continue;
      checked++;

      const registered = new Set((await provider.getMediaSourcesByMediaId(mediaId)).map((m) => m.sourceId));
      const missing = sources.filter((s) => s.isEnabled && s.baseUrl && !registered.has(s.id));
      if (missing.length === 0) continue;

      const mediaKey = await titleKey(media.title);
      const mediaSeason = media.seriesSeason || normalizer.extractSeasonNumber(media.title) || 1;

      for (const source of missing) {
        if (opts?.signal?.aborted) break;
        try {
          const adapter = new CMSAdapter(source.baseUrl);
          const resp = await adapter.getDetailByKeyword(media.title);
          const hit = (resp.list || []).find((it) => {
            if (!it?.vod_name) return false;
            const season = normalizer.extractSeasonNumber(it.vod_name) || 1;
            if (season !== mediaSeason) return false;
            const iy = yearOf(it);
            if (media.year && iy && iy !== media.year) return false;
            return true;
          });
          if (!hit) continue;
          // 标题归一后必须严格一致（find 里只做了季号/年份，这里补标题）
          if ((await titleKey(hit.vod_name)) !== mediaKey) continue;
          if (hit.vod_id == null) continue;

          await provider.upsertMediaSource(mediaId, source.id, String(hit.vod_id), new Date().toISOString());
          added++;
          console.log(`[IndexBackfill] media=${mediaId}《${media.title}》补登记源 ${source.name}（vod_id=${hit.vod_id}）`);
        } catch (err) {
          failed++;
          console.warn(
            `[IndexBackfill] media=${mediaId} 源 ${source.name} 搜索失败:`,
            err instanceof Error ? err.message : String(err)
          );
        }
        await sleep(BACKFILL_INTERVAL_MS);
      }
    }

    console.log(`[IndexBackfill] 完成：候选 ${ids.length}，检查 ${checked}，新增 ${added} 条源索引，失败 ${failed}`);
    return { total: ids.length, checked, added, failed };
  } finally {
    backfilling = false;
  }
}
