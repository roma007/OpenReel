/**
 * 设备资源体检（跨端统一）。
 *
 * 用途：启动时决定**要不要自动续采**被中断的采集任务。
 * 规则要求「要么全部自动续采，要么全部保持中断」，所以这里只做一个布尔判定，
 * 不参与任务内部的并发调度。
 *
 * 信号来源与平台差异（与 storageGuard 同一套 provider 注入模式）：
 *   - 可用磁盘：所有端都有（storageGuard.getFreeDiskBytes）；
 *   - 本进程 CPU：仅桌面端注册（Tauri 命令 process_cpu_percent）；移动/TV 未注册视为「未知」，
 *     未知不拦截（与存储守卫一致：拿不到就不做静默降级判断）。
 */
import { getFreeDiskBytes, formatBytes } from './storageGuard';

type CpuUsageProvider = () => Promise<number | null>;

let cpuProvider: CpuUsageProvider | null = null;

export function setCpuUsageProvider(fn: CpuUsageProvider | null): void {
  cpuProvider = fn;
}

/**
 * 单次采样。桌面的 process_cpu_percent 首次调用返回 -1（只建立基线），
 * 这里统一归一为 null，由 sampleCpuPercent 负责补一次采样。
 */
async function sampleOnce(): Promise<number | null> {
  if (!cpuProvider) return null;
  try {
    const v = await cpuProvider();
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 取一个可用的 CPU 占用率样本（0~100）。
 *
 * process_cpu_percent 是「自上次调用以来」的均值：首次必然是 -1，因此这里最多采两次，
 * 中间隔 600ms，让第二次有真实的采样窗口。拿不到就返回 null（调用方按「不拦截」处理）。
 */
export async function sampleCpuPercent(): Promise<number | null> {
  const first = await sampleOnce();
  if (first !== null) return first;
  if (!cpuProvider) return null;
  await new Promise((resolve) => setTimeout(resolve, 600));
  return sampleOnce();
}

export interface AutoResumeDecision {
  /** true = 允许自动续采（全部任务并行续采）；false = 全部保持中断 */
  ok: boolean;
  /** 不允许时的可读原因（写入日志/界面提示） */
  reason?: string;
  freeBytes: number | null;
  cpuPercent: number | null;
}

/**
 * 自动续采前的资源体检。
 *
 * 判据（阈值来自采集配置，默认 5GB / 50%）：
 *   - 可用磁盘 < minFreeGb → 不续采（磁盘先耗尽比 CPU 更致命）；
 *   - 本进程 CPU > maxCpuPercent → 不续采（机器已经被压满时再加采集只会更糟）；
 *   - 信号拿不到（null）→ 该条不拦截，保持旧行为。
 */
export async function evaluateAutoResume(opts: {
  minFreeGb: number;
  maxCpuPercent: number;
}): Promise<AutoResumeDecision> {
  const freeBytes = await getFreeDiskBytes(true);
  if (freeBytes !== null && freeBytes < opts.minFreeGb * 1024 ** 3) {
    return {
      ok: false,
      reason: `磁盘剩余 ${formatBytes(freeBytes)}，低于自动续采下限 ${opts.minFreeGb}GB`,
      freeBytes,
      cpuPercent: null,
    };
  }
  const cpuPercent = await sampleCpuPercent();
  if (cpuPercent !== null && cpuPercent > opts.maxCpuPercent) {
    return {
      ok: false,
      reason: `进程 CPU 占用 ${cpuPercent.toFixed(0)}%，高于自动续采上限 ${opts.maxCpuPercent}%`,
      freeBytes,
      cpuPercent,
    };
  }
  return { ok: true, freeBytes, cpuPercent };
}
