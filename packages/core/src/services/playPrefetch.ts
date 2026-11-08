/**
 * 播放页相邻预取：把「上下滑动将要播放的那一条」的播放地址提前准备好。
 *
 * 背景（索引优先存储重构后）：`episode` / `play_source` 只在用户真正打开时按需拉取，
 * 播放页上下滑动换片时如果目标片没拉过详情，就要在滑动瞬间发 `ac=detail` 并等落库，
 * 表现为「滑下去要转圈 / 卡一下」。这里在**当前播放时**就把相邻目标预热好。
 *
 * 设计约束：
 *  - 并发 2：不与正在播放的流抢带宽，同时避免一条慢源把后面全堵住；
 *  - 单条 10s 超时：慢源不拖住队列（超时后后台请求仍会继续落库，下次切换照样命中）；
 *  - 失败静默：预取只是加速，失败时滑动手感回到原状，不弹错；
 *  - 10 分钟内同一媒体不重复预取：避免连续滑动反复请求；
 *  - 只做详情 + 目标集 m3u8 时长探测两件事（正是切换瞬间原本要做的全部网络工作）。
 */
import type { DatabaseProvider } from '../db/provider';
import { resolveDefaultPlayTarget } from './playbackTarget';
import { VideoDurationService } from './videoDurationService';

/** 同一媒体预取结果复用时间窗 */
const PREFETCH_TTL_MS = 10 * 60 * 1000;
/** 单条预取超时（详情接口慢源可达数秒，超时后放弃等待，后台请求仍会落库） */
const PREFETCH_TIMEOUT_MS = 10_000;
/** 并发上限：两条详情请求并行，既快又不至于和播放抢带宽 */
const MAX_CONCURRENT = 2;

/** mediaId → 上次预取完成时间 */
const prefetchedAt = new Map<number, number>();
/** 已入队/进行中的 mediaId（防止同一媒体被排入多次） */
const queued = new Set<number>();
/** 待执行队列 */
const queue: number[] = [];
let active = 0;
/** 队列彻底空闲时兑现（供测试/需要等待的场景） */
let idleResolvers: Array<() => void> = [];
/** 队列服务的 provider（最近一次调用传入，同一进程内一致） */
let queueProvider: DatabaseProvider | null = null;

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    task.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    );
  });
}

async function prefetchOne(provider: DatabaseProvider, mediaId: number): Promise<void> {
  const media = await provider.getMediaById(mediaId);
  if (!media) return;

  // 详情 + 默认播放目标（命中缓存时 ensureDetail 零网络）
  const target = await withTimeout(resolveDefaultPlayTarget(provider, media), PREFETCH_TIMEOUT_MS);
  if (!target) {
    console.log(`[Prefetch] media=${mediaId} 未取到播放目标（超时或无可用线路）`);
    return;
  }

  // 目标集时长：与切换瞬间 PlayScreen 要做的探测一致，先探好避免抢首帧带宽
  try {
    const episodes = await provider.getEpisodesByMediaId(mediaId);
    const ep = episodes.find((e) => e.id === target.episodeId);
    if (ep && !ep.duration) {
      const sources = await provider.getPlaySourcesByEpisodeId(ep.id);
      const m3u8 = sources.find((s) => s.url.includes('m3u8'));
      if (m3u8) {
        const duration = await withTimeout(new VideoDurationService().getDurationFromM3U8(m3u8.url), PREFETCH_TIMEOUT_MS);
        if (typeof duration === 'number' && duration > 0) {
          await provider.updateEpisodeDuration(ep.id, duration);
        }
      }
    }
  } catch (err) {
    console.log(`[Prefetch] media=${mediaId} 时长探测失败:`, err instanceof Error ? err.message : String(err));
  }

  console.log(`[Prefetch] ok media=${mediaId} ep=${target.episodeId} source=${target.sourceId}`);
}

function drainIdle(): void {
  if (active === 0 && queue.length === 0) {
    const resolvers = idleResolvers;
    idleResolvers = [];
    resolvers.forEach((fn) => fn());
  }
}

function pump(): void {
  const provider = queueProvider;
  if (!provider) return;
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const mediaId = queue.shift()!;
    active++;
    void prefetchOne(provider, mediaId)
      .catch((err) => {
        console.log('[Prefetch] 预取异常:', err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        active--;
        prefetchedAt.set(mediaId, Date.now());
        queued.delete(mediaId);
        pump();
        drainIdle();
      });
  }
  drainIdle();
}

/**
 * 预取若干媒体的播放地址（并发 2、去重、可重复调用）。
 * 调用方通常 fire-and-forget；返回的 Promise 在队列空闲时兑现。
 */
export function prefetchPlayTargets(
  provider: DatabaseProvider,
  mediaIds: Array<number | null | undefined>,
  opts?: { force?: boolean }
): Promise<void> {
  queueProvider = provider;
  const now = Date.now();
  for (const raw of mediaIds) {
    const mediaId = Number(raw);
    if (!Number.isFinite(mediaId) || mediaId <= 0) continue;
    if (queued.has(mediaId)) continue;
    const at = prefetchedAt.get(mediaId);
    if (!opts?.force && at && now - at < PREFETCH_TTL_MS) continue;

    queued.add(mediaId);
    queue.push(mediaId);
    console.log(`[Prefetch] queue media=${mediaId}`);
  }

  const idle = new Promise<void>((resolve) => idleResolvers.push(resolve));
  pump();
  return idle;
}

/** 清空预取记录（测试/切换用户等场景使用；正常播放不需要调用） */
export function resetPlayPrefetchCache(): void {
  prefetchedAt.clear();
  queued.clear();
  queue.length = 0;
  queueProvider = null;
  drainIdle();
}
