import { useEffect, useRef, useState } from 'react';

export interface FuncRow {
  /** 页面中文名（桌面端由路由 path 分桶得到，保证聚合 key 有限）。 */
  page: string;
  busy_pct: number | null;
  seconds: number;
}

export interface LocalMetrics {
  totalBusyPct: number | null;
  funcs: FuncRow[];
  since: string;
  storageMB: number | null;
}

const TICK_MS = 250;
const EMIT_MS = 5000;
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

// 资源监控数据源（App 内自包含本地聚合，与移动端同算法同常量）：
// - 主线程忙%：250ms 调度滞后累积（长任务真实阻塞主线程），按当前页面归因；
//   各页贡献占比 = 该页 busy / 全体窗口，之和恒 = 总忙%。
// - 不活跃页面 30s 自动消失。
// - 桌面端不采集帧率：macOS WKWebView（Tauri 2）会把 requestAnimationFrame 限流到约 1Hz，
//   rAF 帧计数恒为 0，属平台限制而非真实渲染帧率，故不展示（不用 native vsync 等代理值顶替）。
export function useActivityMonitor(routeRef: { current: string }): LocalMetrics {
  const pagesRef = useRef(new Map<string, { busySum: number; winSum: number; lastActive: number }>());
  const busyRef = useRef({ busyMs: 0, started: Date.now(), lastEmit: Date.now() });
  const startAt = useRef(Date.now());
  const [metrics, setMetrics] = useState<LocalMetrics>(() => ({
    totalBusyPct: null,
    funcs: [],
    since: '',
    storageMB: null,
  }));

  useEffect(() => {
    const s = busyRef.current;
    const emit = () => {
      const now = Date.now();
      const r = routeRef.current || '其它';
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
      const funcs: FuncRow[] = [...pagesRef.current.entries()]
        .filter(([, a]) => a.winSum > 0 || a.busySum > 0)
        .map(([page, a]) => ({
          page,
          busy_pct: totalWin > 0 ? Math.round((a.busySum / totalWin) * 1000) / 10 : null,
          seconds: Math.round(a.winSum / 1000),
        }))
        .sort((x, y) => (y.busy_pct ?? 0) - (x.busy_pct ?? 0));

      setMetrics((m) => ({
        totalBusyPct: totalWin > 0 ? Math.round((totalBusy / totalWin) * 1000) / 10 : null,
        funcs,
        since: new Date(startAt.current).toISOString(),
        storageMB: m.storageMB,
      }));
    };

    // 忙% 探针：setInterval 期望时刻漂移法 —— 滞后 > TICK+10ms 视为被长任务占用
    let expected = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const lag = now - expected;
      expected = now + TICK_MS;
      if (lag > TICK_MS + 10) s.busyMs += lag - TICK_MS;
      if (now - s.lastEmit >= EMIT_MS) emit();
    }, TICK_MS);

    return () => {
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
