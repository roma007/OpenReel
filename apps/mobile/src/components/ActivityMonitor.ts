import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { requireNativeModule } from 'expo';

export interface FuncRow {
  page: string;
  busy_pct: number | null;
  seconds: number;
}

export interface LocalMetrics {
  totalBusyPct: number | null;
  totalCpuPct: number | null;
  cpuActive: boolean;
  funcs: FuncRow[];
  since: string;
  fps: number;
  storageMB: number | null;
}

const TICK_MS = 250;
const EMIT_MS = 5000;
const CPU_TICK_MS = 500;
const INACTIVE_TTL = 30000;
const STORAGE_REFRESH_MS = 30000;

interface PageAgg {
  busySum: number;
  winSum: number;
  lastActive: number;
}

// 双端原生模块（功能19 补丁）：进程 CPU 差分采样，返回自上次调用以来的平均 CPU 占用率。
// 口径 = 该进程占整机全部逻辑核的百分比（分母含核数，上限 100%）。
// iOS/Android 均通过 expo-video-cache 补丁暴露 processCpuPercent，直接取用、不做存在性回退。
function resolveNativeCpu(): any {
  return requireNativeModule('ExpoVideoCache');
}

// 递归统计沙盒目录占用（KB->MB 调用方换算）
async function dirSizeBytes(uri: string): Promise<number> {
  let total = 0;
  try {
    const entries = await FileSystem.readDirectoryAsync(uri);
    for (const name of entries) {
      const p = `${uri}${name}`;
      const it = await FileSystem.getInfoAsync(p);
      if (!it.exists) continue;
      try {
        if (it.isDirectory) {
          total += await dirSizeBytes(`${p}/`);
        } else {
          total += it.size as number;
        }
      } catch {
        total += it.size as number;
      }
    }
  } catch {
    return 0;
  }
  return total;
}

// iPhone：App 沙盒根目录（含 Documents/Library/tmp）总占用，即「占用存储空间」
async function calcAppStorageMB(): Promise<number | null> {
  try {
    const doc = FileSystem.documentDirectory;
    if (!doc) return null;
    const root = doc.replace(/\/Documents\/?$/, '');
    const bytes = await dirSizeBytes(root.endsWith('/') ? root : `${root}/`);
    return bytes > 0 ? bytes / 1048576 : null;
  } catch {
    return null;
  }
}

// 移动端资源监控数据源（App 内自包含本地聚合，不依赖 monitor.py）：
// - 「CPU%」（真实进程占用，iOS）：功能19 原生模块差分采样（clock_gettime，500ms/次），
//   JS 只做缓冲区均值与页面占比（不重组权重，避免原生差分窗口与 JS 计时不一致导致的放大）；
//   总 CPU% = 近 10s 样本均值；页面 busy_pct = 该页样本和/样本数，之和恒 = 总 CPU%，与主行一致。
// - 「主线程忙%」（JS 调度滞后探针）：250ms 期望时刻漂移法，按页面归因；仅 Android/无原生时回退用。
// - 不活跃页面 30s 自动消失；FPS 用 requestAnimationFrame 每秒帧计数。
// - iOS 沙盒无 App 级内存 API => 不采集，由 UI 文案注明。
export function useActivityMonitor(routeRef: { current: string }): LocalMetrics {
  const pagesRef = useRef(new Map<string, PageAgg>());
  const busyRef = useRef({ busyMs: 0, started: Date.now(), lastEmit: Date.now() });
  const cpuRef = useRef<{ samples: { pct: number; page: string }[] }>({ samples: [] });
  const nativeCpu = useRef<any>(resolveNativeCpu());
  const startAt = useRef(Date.now());
  const [metrics, setMetrics] = useState<LocalMetrics>(() => ({
    totalBusyPct: null,
    totalCpuPct: null,
    cpuActive: false,
    funcs: [],
    since: '',
    fps: 0,
    storageMB: null,
  }));

  useEffect(() => {
    const s = busyRef.current;
    const cpu = cpuRef.current;
    const cpuModule = nativeCpu.current;
    const cpuActive = cpuModule != null;
    const emit = () => {
      const now = Date.now();
      const r = routeRef.current || 'Home';
      const win = Math.max(1, now - s.started);
      const agg = pagesRef.current.get(r) ?? { busySum: 0, winSum: 0, lastActive: now };
      agg.busySum += s.busyMs;
      agg.winSum += win;
      agg.lastActive = now;
      pagesRef.current.set(r, agg);
      s.busyMs = 0;
      s.started = now;
      s.lastEmit = now;

      for (const [k, a] of pagesRef.current) {
        if (now - a.lastActive > INACTIVE_TTL) pagesRef.current.delete(k);
        else if (a.busySum <= 0 && a.winSum <= 0) pagesRef.current.delete(k);
      }

      let totalWin = 0;
      let totalBusy = 0;
      for (const a of pagesRef.current.values()) {
        totalWin += a.winSum;
        totalBusy += a.busySum;
      }

      // CPU 归因：最近 emit 窗口的样本均值（环形缓冲，无竞态）。
      // 原生返回的是「自上次调用以来」平均 CPU%，与 JS 计时无关，直接统计样本即可。
      const samples = cpu.samples;
      let totalCpuPct: number | null = null;
      if (cpuActive && samples.length > 0) {
        const sum = samples.reduce((acc, s) => acc + s.pct, 0);
        totalCpuPct = sum / samples.length;
      }

      // 页面归因：该页 CPU 样本占所有样本比例 × 总 CPU%（之和恒 = 总 CPU%）
      const pageCpuSum = new Map<string, number>();
      for (const smp of samples) {
        pageCpuSum.set(smp.page, (pageCpuSum.get(smp.page) ?? 0) + smp.pct);
      }

      // busy_pct 归因源：CPU 活跃(iOS)时用该页 CPU 权重，否则用 JS 调度滞后
      const totalWinSource = cpuActive ? Math.max(1, samples.length) : totalWin;
      const funcs: FuncRow[] = [
        ...[...pagesRef.current.entries()].map(([page, a]) => {
          if (cpuActive) {
            // 页面 CPU% = 该页样本和 / 样本数；总和 = ΣpageCpuSum/N = totalCpuPct，与主行一致
            const cpuShare = (pageCpuSum.get(page) ?? 0) / totalWinSource;
            return {
              page,
              busy_pct: cpuShare > 0 ? Math.round(cpuShare * 10) / 10 : null,
              seconds: Math.round(a.winSum / 1000),
            };
          }
          return {
            page,
            busy_pct: totalWin > 0 ? Math.round((a.busySum / totalWin) * 1000) / 10 : null,
            seconds: Math.round(a.winSum / 1000),
          };
        }),
      ]
        .filter((x) => x.busy_pct != null || x.seconds > 0)
        .sort((x, y) => (y.busy_pct ?? 0) - (x.busy_pct ?? 0));

      setMetrics((m) => ({
        totalBusyPct: totalWin > 0 ? Math.round((totalBusy / totalWin) * 1000) / 10 : null,
        totalCpuPct: totalCpuPct != null ? Math.round(totalCpuPct * 10) / 10 : null,
        cpuActive,
        funcs,
        since: new Date(startAt.current).toISOString(),
        fps: m.fps,
        storageMB: m.storageMB,
      }));
    };

    let expected = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const lag = now - expected;
      expected = now + TICK_MS;
      if (lag > TICK_MS + 10) s.busyMs += lag - TICK_MS;
      if (now - s.lastEmit >= EMIT_MS) emit();
    }, TICK_MS);

    // iOS: 原生进程 CPU 差分采样（fire-and-forget，缓存最新值，emit 时归因）
    let cpuAlive = true;
    const sampleCpu = () => {
      if (!cpuAlive || !cpuModule) return;
      cpuModule
        .processCpuPercent()
        .then((pct: number) => {
          if (!cpuAlive) return;
          if (typeof pct === 'number' && pct >= 0) {
            const page = routeRef.current || 'Home';
            cpu.samples.push({ pct, page });
            if (cpu.samples.length > 20) cpu.samples.shift();
          }
        })
        .catch(() => {})
        .finally(() => {
          if (cpuAlive) setTimeout(sampleCpu, CPU_TICK_MS);
        });
    };
    if (cpuModule) sampleCpu();

    let frames = 0;
    let rafAlive = true;
    const rafLoop = () => {
      if (!rafAlive) return;
      frames++;
      requestAnimationFrame(rafLoop);
    };
    requestAnimationFrame(rafLoop);
    const fpsTimer = setInterval(() => {
      setMetrics((m) => ({ ...m, fps: frames }));
      frames = 0;
    }, 1000);

    return () => {
      cpuAlive = false;
      clearInterval(timer);
      clearInterval(fpsTimer);
      rafAlive = false;
    };
  }, [routeRef]);

  // 存储占用：沙盒遍历较贵，启动算一次 + 每 30s 重算
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const refresh = () => {
      if (inFlight) return;
      inFlight = true;
      calcAppStorageMB()
        .then((mb) => {
          if (alive && mb != null) setMetrics((m) => ({ ...m, storageMB: mb }));
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };
    refresh();
    const t = setInterval(refresh, STORAGE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return metrics;
}