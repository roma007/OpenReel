/**
 * 存储守卫（跨端统一）。
 *
 * 背景：全量采集会写入大量数据；TV/低端机磁盘本来就紧张，写爆磁盘会直接导致
 * SQLite 写入失败、采集任务异常、甚至应用起不来。这里在「采集开始前」做一次可用空间检查，
 * 空间不足时直接拒绝启动并给出可读原因，而不是写到一半失败。
 *
 * 平台差异由各端在 init 时注册取值函数（与 keepAwake 同一模式）：
 *   - mobile / tv / tv-launcher：expo-file-system/legacy `getFreeDiskStorageAsync()`
 *   - desktop：Tauri 命令 `disk_free_bytes(appDataDir)`
 *   - 未注册或取值失败：视为「未知」，不拦截采集（保持旧行为，不做静默降级判断）
 */
type FreeDiskProvider = () => Promise<number | null>;

/** 低于该值直接拒绝启动采集：一次详情/索引写入 + WAL 增长就足以写爆 */
export const MIN_FREE_BYTES_FOR_COLLECT = 300 * 1024 * 1024;
/** 低于该值在启动时告警并顺手清理详情缓存 */
export const LOW_FREE_BYTES_WARN = 1024 * 1024 * 1024;
/** 可用空间缓存时长：避免每页采集都去问一次文件系统 */
const CACHE_TTL_MS = 10_000;

let provider: FreeDiskProvider | null = null;
let cachedFree: number | null = null;
let cachedAt = 0;

export function setFreeDiskProvider(fn: FreeDiskProvider | null): void {
  provider = fn;
  cachedFree = null;
  cachedAt = 0;
}

/** 当前可用字节数；无法获取时返回 null */
export async function getFreeDiskBytes(force = false): Promise<number | null> {
  if (!provider) return null;
  if (!force && cachedFree !== null && Date.now() - cachedAt < CACHE_TTL_MS) return cachedFree;
  try {
    const value = await provider();
    cachedFree = typeof value === 'number' && Number.isFinite(value) ? value : null;
    cachedAt = Date.now();
    return cachedFree;
  } catch {
    cachedFree = null;
    cachedAt = Date.now();
    return null;
  }
}

export interface StorageCheckResult {
  ok: boolean;
  freeBytes: number | null;
  /** ok=false 时给用户看的原因 */
  message?: string;
}

/** 采集前检查：空间不足直接返回 ok=false（调用方抛错/提示） */
export async function ensureStorageForCollect(): Promise<StorageCheckResult> {
  const free = await getFreeDiskBytes(true);
  if (free === null) return { ok: true, freeBytes: null };
  if (free < MIN_FREE_BYTES_FOR_COLLECT) {
    const mb = Math.max(0, Math.round(free / (1024 * 1024)));
    return {
      ok: false,
      freeBytes: free,
      message: `磁盘空间不足（剩余约 ${mb}MB），请清理后再采集`,
    };
  }
  return { ok: true, freeBytes: free };
}

/** 供 UI/诊断展示（字节转可读文本） */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '未知';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}
