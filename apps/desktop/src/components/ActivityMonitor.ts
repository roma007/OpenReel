import { useEffect, useRef, useState } from 'react';

export interface FuncRow {
  /** 页面中文名（桌面端由路由 path 分桶得到，保证聚合 key 有限）。 */
  page: string;
  cpu_pct: number | null;
  seconds: number;
}

export interface LocalMetrics {
  totalCpuPct: number | null;
  funcs: FuncRow[];
  since: string;
  storageMB: number | null;
}

const CPU_TICK_MS = 500;
const EMIT_MS = 5000;
const MAX_SAMPLES = 20;
const INACTIVE_TTL = 30000;
const STORAGE_REFRESH_MS = 30000;

// 存储占用：App 数据目录递归求和（Rust command），语义对应移动端沙盒遍历
async function calcAppStorageMB(): Promise<number | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = await invoke<number>('app_storage_bytes');
    return bytes > 0 ? bytes / 1048576 : null;
  } catch {
    return null;
  }
}

// 进程 CPU 差分采样（Rust command）：返回自上次调用以来的平均 CPU 占用率，
// 口径 = 该进程占整机全部逻辑核的百分比（上限 100%），与移动端一致。
async function sampleProcessCpu(): Promise<number | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const pct = await invoke<number>('process_cpu_percent');
    return typeof pct === 'number' && pct >= 0 ? pct : null;
  } catch {
    return null;
  }
}

// 资源监控数据源（App 内自包含本地聚合，与移动端同算法同常量）：
// - CPU%：Rust 侧进程 CPU 差分采样（500ms/次，20 样本环形缓冲），JS 只做样本均值与页面占比；
//   总 CPU% = 样本均值；页 cpu_pct = 该页样本和 / 样本数，之和恒 = 总 CPU%，与主行一致。
// - 不活跃页面 30s 自动消失。
// - 桌面端不采集帧率：macOS WKWebView（Tauri 2）会把 requestAnimationFrame 限流到约 1Hz，
//   rAF 帧计数恒为 0，属平台限制而非真实渲染帧率，故不展示（不用 native vsync 等代理值顶替）。
export function useActivityMonitor(routeRef: { current: string }): LocalMetrics {
  const pagesRef = useRef(new Map<string, { winSum: number; lastActive: number }>());
  const cpuRef = useRef<{ pct: number; page: string }[]>([]);
  const winRef = useRef({ started: Date.now(), lastEmit: Date.now() });
  const startAt = useRef(Date.now());
  const [metrics, setMetrics] = useState<LocalMetrics>(() => ({
    totalCpuPct: null,
    funcs: [],
    since: '',
    storageMB: null,
  }));

  useEffect(() => {
    const w = winRef.current;
    const emit = () => {
      const now = Date.now();
      const r = routeRef.current || '其它';
      const agg = pagesRef.current.get(r) ?? { winSum: 0, lastActive: now };
      agg.winSum += Math.max(1, now - w.started);
      agg.lastActive = now;
      pagesRef.current.set(r, agg);
      w.started = now;
      w.lastEmit = now;

      for (const [k, a] of pagesRef.current) {
        if (now - a.lastActive > INACTIVE_TTL) pagesRef.current.delete(k);
      }

      // CPU 归因：环形缓冲样本均值（无竞态）；原生返回的是「自上次调用以来」平均 CPU%
      const samples = cpuRef.current;
      const n = samples.length;
      const total = n > 0 ? samples.reduce((acc, s) => acc + s.pct, 0) / n : null;
      const pageCpuSum = new Map<string, number>();
      for (const s of samples) {
        pageCpuSum.set(s.page, (pageCpuSum.get(s.page) ?? 0) + s.pct);
      }

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
        storageMB: m.storageMB,
      }));
    };

    let alive = true;
    const tick = () => {
      if (!alive) return;
      void sampleProcessCpu().then((pct) => {
        if (!alive || pct == null) return;
        const samples = cpuRef.current;
        samples.push({ pct, page: routeRef.current || '其它' });
        if (samples.length > MAX_SAMPLES) samples.shift();
      });
      if (Date.now() - w.lastEmit >= EMIT_MS) emit();
    };
    tick();
    const timer = setInterval(tick, CPU_TICK_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [routeRef]);

  // 存储占用：目录遍历较贵，启动算一次 + 每 30s 重算（inFlight 去重防并发）
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
