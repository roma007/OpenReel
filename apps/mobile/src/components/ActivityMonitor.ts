import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { requireNativeModule } from 'expo';

export interface FuncRow {
  page: string;
  cpu_pct: number | null;
  seconds: number;
}

export interface LocalMetrics {
  totalCpuPct: number | null;
  funcs: FuncRow[];
  since: string;
  fps: number;
  storageMB: number | null;
}

const EMIT_MS = 5000;
const CPU_TICK_MS = 500;
const MAX_SAMPLES = 20;
const INACTIVE_TTL = 30000;
const STORAGE_REFRESH_MS = 30000;

interface PageAgg {
  winSum: number;
  lastActive: number;
}

// 双端原生模块（功能19 补丁）：进程 CPU 差分采样，返回自上次调用以来的平均 CPU 占用率。
// 口径 = 该进程占整机全部逻辑核的百分比（分母含核数，上限 100%）。
// iOS/Android 均通过 expo-video-cache 补丁暴露 processCpuPercent，直接取用；
// 模块缺失（补丁未打）时返回 null，浮窗显示 CPU -，不回退任何其它口径。
function resolveNativeCpu(): any {
  try {
    return requireNativeModule('ExpoVideoCache');
  } catch {
    return null;
  }
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

// 移动端资源监控数据源（App 内自包含本地聚合，不依赖外部服务）：
// - 「CPU%」（真实进程占用）：功能19 原生模块差分采样（clock_gettime，500ms/次），
//   JS 只做缓冲区均值与页面占比（不重组权重，避免原生差分窗口与 JS 计时不一致导致的放大）；
//   总 CPU% = 近 10s 样本均值；页面 cpu_pct = 该页样本和/样本数，之和恒 = 总 CPU%，与主行一致。
// - 不活跃页面 30s 自动消失；FPS 用 requestAnimationFrame 每秒帧计数。
// - iOS 沙盒无 App 级内存 API => 不采集，由 UI 文案注明。
export function useActivityMonitor(routeRef: { current: string }): LocalMetrics {
  const pagesRef = useRef(new Map<string, PageAgg>());
  const cpuRef = useRef<{ pct: number; page: string }[]>([]);
  const winRef = useRef({ started: Date.now(), lastEmit: Date.now() });
  const nativeCpu = useRef<any>(resolveNativeCpu());
  const startAt = useRef(Date.now());
  const [metrics, setMetrics] = useState<LocalMetrics>(() => ({
    totalCpuPct: null,
    funcs: [],
    since: '',
    fps: 0,
    storageMB: null,
  }));

  useEffect(() => {
    const w = winRef.current;
    const cpuModule = nativeCpu.current;
    const emit = () => {
      const now = Date.now();
      const r = routeRef.current || 'Home';
      const agg = pagesRef.current.get(r) ?? { winSum: 0, lastActive: now };
      agg.winSum += Math.max(1, now - w.started);
      agg.lastActive = now;
      pagesRef.current.set(r, agg);
      w.started = now;
      w.lastEmit = now;

      for (const [k, a] of pagesRef.current) {
        if (now - a.lastActive > INACTIVE_TTL) pagesRef.current.delete(k);
      }

      // CPU 归因：最近 emit 窗口的样本均值（环形缓冲，无竞态）。
      // 原生返回的是「自上次调用以来」平均 CPU%，与 JS 计时无关，直接统计样本即可。
      const samples = cpuRef.current;
      const n = samples.length;
      const total = n > 0 ? samples.reduce((acc, s) => acc + s.pct, 0) / n : null;
      const pageCpuSum = new Map<string, number>();
      for (const smp of samples) {
        pageCpuSum.set(smp.page, (pageCpuSum.get(smp.page) ?? 0) + smp.pct);
      }

      // 页面 CPU% = 该页样本和 / 样本数；各页之和 = ΣpageCpuSum/N = 总 CPU%，与主行一致
      const funcs: FuncRow[] = [...pagesRef.current.entries()]
        .map(([page, a]) => {
          const avg = n > 0 ? (pageCpuSum.get(page) ?? 0) / n : 0;
          return {
            page,
            cpu_pct: avg > 0 ? Math.round(avg * 10) / 10 : null,
            seconds: Math.round(a.winSum / 1000),
          };
        })
        .filter((x) => x.cpu_pct != null || x.seconds > 0)
        .sort((x, y) => (y.cpu_pct ?? 0) - (x.cpu_pct ?? 0));

      setMetrics((m) => ({
        totalCpuPct: total != null ? Math.round(total * 10) / 10 : null,
        funcs,
        since: new Date(startAt.current).toISOString(),
        fps: m.fps,
        storageMB: m.storageMB,
      }));
    };

    // 原生进程 CPU 差分采样（fire-and-forget，缓存最新值，emit 时归因）
    let cpuAlive = true;
    const sampleCpu = () => {
      if (!cpuAlive || !cpuModule) return;
      cpuModule
        .processCpuPercent()
        .then((pct: number) => {
          if (!cpuAlive) return;
          if (typeof pct === 'number' && pct >= 0) {
            const samples = cpuRef.current;
            samples.push({ pct, page: routeRef.current || 'Home' });
            if (samples.length > MAX_SAMPLES) samples.shift();
          }
        })
        .catch(() => {})
        .finally(() => {
          if (cpuAlive) setTimeout(sampleCpu, CPU_TICK_MS);
        });
    };
    if (cpuModule) sampleCpu();

    const timer = setInterval(() => {
      if (Date.now() - w.lastEmit >= EMIT_MS) emit();
    }, CPU_TICK_MS);

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
