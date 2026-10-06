/**
 * TV 端缓存管理（与手机端同语义：统计 Paths.cache 占用 + 清理）。
 *
 * 依据取证（2026-10-05）：
 *  - 手机端 `apps/mobile/src/services/cacheManager.ts` 只有「统计 + 清理」，无离线下载
 *  - 电视盒子存储通常 8–32GB 且系统占用大，故 TV 端额外提供：
 *    · watchLowStorage：可用空间低于阈值时给出提示（手机端目前无此能力，属 TV 端新增）
 *    · prefetch concurrency 默认降为 4（手机端 6），减少同时占用的临时空间
 */
import { Directory, File, Paths } from 'expo-file-system';
import { getFreeDiskStorageAsync } from 'expo-file-system/legacy';

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function dirSize(dir: Directory): number {
  let total = 0;
  try {
    for (const item of dir.list()) {
      if (item instanceof Directory) total += dirSize(item);
      else if (item instanceof File) total += item.size || 0;
    }
  } catch {
    // 单个子目录读取失败不中断整体统计
  }
  return total;
}

export function getCacheSizeBytes(): number {
  const root = Paths.cache;
  if (!root.exists) return 0;
  let total = 0;
  try {
    for (const item of root.list()) {
      if (item instanceof Directory) total += dirSize(item);
      else if (item instanceof File) total += item.size || 0;
    }
  } catch {
    return 0;
  }
  return total;
}

export function clearCache(): number {
  const root = Paths.cache;
  if (!root.exists) return 0;
  let removedBytes = 0;
  try {
    for (const item of root.list()) {
      const size =
        item instanceof Directory ? item.size || 0 : item instanceof File ? item.size || 0 : 0;
      try {
        item.delete();
        removedBytes += size;
      } catch {
        // 单文件删除失败（被占用）不中断整体清理
      }
    }
  } catch {
    return removedBytes;
  }
  return removedBytes;
}

/** TV 端默认预读并发：盒子网络/存储通常弱于手机，降为 4（手机端为 6） */
export const TV_PREFETCH_CONCURRENCY = 4;

/**
 * 把 N 并发写入 cacheDir/prefetch_concurrency，供 expo-video 原生读取
 * （补丁见 apps/tv/scripts/apply-native-patches.mjs）。
 */
export async function writePrefetchConcurrency(n: number = TV_PREFETCH_CONCURRENCY) {
  try {
    const f = new File(Paths.cache, 'prefetch_concurrency');
    try {
      f.create({ overwrite: true });
    } catch {}
    f.write(String(Math.max(1, Math.floor(n))));
    return true;
  } catch (err) {
    console.warn('[TV] 写入预读并发失败:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** 读取分片加载状态（原生 VideoPlayer.kt 写入 segment_progress.json） */
export interface NativeSegmentState {
  url: string;
  state: 0 | 1 | 2;
  progress: number;
}

export function readNativeSegmentStates(): Record<string, NativeSegmentState> {
  try {
    const f = new File(Paths.cache, 'segment_progress.json');
    if (!f.exists) return {};
    const raw = JSON.parse(f.textSync());
    const map: Record<string, NativeSegmentState> = {};
    for (const s of raw.segments || []) map[s.url] = s;
    return map;
  } catch {
    return {};
  }
}

/** 可用空间是否低于阈值（TV 端新增能力，手机端无） */
export const TV_LOW_STORAGE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export async function isLowStorage(
  threshold: number = TV_LOW_STORAGE_BYTES,
): Promise<{ low: boolean; free: number }> {
  try {
    const free = await getFreeDiskStorageAsync();
    if (typeof free !== 'number' || !isFinite(free)) return { low: false, free: 0 };
    return { low: free < threshold, free };
  } catch {
    // 无法判定不等于空间充足，故返回 low=false 但不谎报 free 值
    return { low: false, free: 0 };
  }
}