import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useActivityMonitor } from './ActivityMonitor';

// 资源监控悬浮层（桌面端自包含本地聚合）：
// - 数据来自 ActivityMonitor：250ms 调度滞后探针归因主线程忙%、App 数据目录占用
//   （不展示帧率：macOS WKWebView 把 rAF 限流到约 1Hz，rAF 计数恒 0，见 ActivityMonitor 注释）
// - 按住面板任意位置拖动（松手记忆位置，下次启动恢复）；右上角 x 隐藏（仅本次运行）
// - 点击面板内容弹出「功能资源占用」明细：各页面的忙%贡献与停留时长
const POS_KEY = 'movie-app-resource-overlay-pos';
const DEFAULT_POS = { top: 42, left: 10 };
/** 位移阈值（px）：未超过视为点击开明细，超过视为拖动 */
const DRAG_THRESHOLD = 3;

const fmtStg = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb.toFixed(0)}M`);

interface Pos {
  top: number;
  left: number;
}

// 桌面端路由 path → 页面中文名。顺序敏感：带动态段的路由（/subtype/:type/:subType、/play/:episodeId）
// 必须在此分桶后再进聚合 Map，否则每次不同参数都会新增 key，导致明细面板条目无限增长。
const PAGE_NAMES: [RegExp, string][] = [
  [/^\/$/, '首页'],
  [/^\/movie$/, '电影'],
  [/^\/tv$/, '电视剧'],
  [/^\/variety$/, '综艺'],
  [/^\/anime$/, '动漫'],
  [/^\/documentary$/, '纪录片'],
  [/^\/search$/, '搜索'],
  [/^\/subtype\//, '分类'],
  [/^\/play\//, '播放'],
  [/^\/favorites$/, '收藏'],
  [/^\/history$/, '历史'],
  [/^\/sources$/, '视频源'],
  [/^\/tasks$/, '任务'],
  [/^\/settings$/, '设置'],
  [/^\/settings\/appearance$/, '外观设置'],
  [/^\/settings\/preferences$/, '使用偏好'],
  [/^\/settings\/recommendation$/, '推荐设置'],
  [/^\/settings\/kids$/, '儿童锁'],
  [/^\/settings\/collect$/, '采集配置'],
  [/^\/settings\/video$/, '视频管理'],
  [/^\/help\/guide$/, '采集引导'],
  [/^\/help$/, '帮助中心'],
  [/^\/db-tool$/, '数据库工具'],
  [/^\/test-collect$/, '采集测试'],
];

function pageLabelOf(pathname: string): string {
  for (const [re, label] of PAGE_NAMES) if (re.test(pathname)) return label;
  return '其它';
}

/**
 * 把当前路由 path 转成页面名写入稳定 ref 供采样归因读取。
 * 用 ref 而非 state：路由变化不触发本组件重渲染，也不重启采样 effect（避免 busy 累积被重置）。
 */
function usePageLabelRef(): { current: string } {
  const { pathname } = useLocation();
  const ref = useRef(pageLabelOf(pathname));
  useEffect(() => {
    ref.current = pageLabelOf(pathname);
  }, [pathname]);
  return ref;
}

interface DragState {
  origin: Pos;
  startX: number;
  startY: number;
  moved: boolean;
}

export function ResourceOverlay() {
  const routeRef = usePageLabelRef();
  const local = useActivityMonitor(routeRef);
  const [hidden, setHidden] = useState(false);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [showDetail, setShowDetail] = useState(false);
  const posRef = useRef<Pos>(DEFAULT_POS);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const clampPos = useCallback((top: number, left: number): Pos => {
    const w = boxRef.current?.offsetWidth ?? 0;
    const h = boxRef.current?.offsetHeight ?? 0;
    const maxLeft = Math.max(0, window.innerWidth - 4 - w);
    const maxTop = Math.max(0, window.innerHeight - 4 - h);
    return { top: Math.max(0, Math.min(maxTop, top)), left: Math.max(0, Math.min(maxLeft, left)) };
  }, []);

  const persistPos = useCallback((p: Pos) => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(p));
    } catch {
      // 存储不可用（隐私模式等）静默忽略
    }
  }, []);

  const applyPos = useCallback(
    (next: Pos) => {
      posRef.current = next;
      setPos(next);
    },
    [],
  );

  // 启动恢复位置；挂载时盒尺寸尚未就绪，延到下一轮任务再按真实尺寸夹取一次
  // （用 setTimeout 而非 rAF：本项目 WKWebView 会把 rAF 限流到约 1Hz，rAF 不可靠）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.top === 'number' && typeof p?.left === 'number') {
          applyPos(clampPos(p.top, p.left));
        }
      }
    } catch {
      // 存储缺失/损坏/失败一律静默回退默认位置
    }
    const t = setTimeout(() => applyPos(clampPos(posRef.current.top, posRef.current.left)), 0);
    return () => clearTimeout(t);
  }, [applyPos, clampPos]);

  // 窗口缩放/最大化后重新夹取，避免浮窗停在可视区外
  useEffect(() => {
    const onResize = () => applyPos(clampPos(posRef.current.top, posRef.current.left));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyPos, clampPos]);

  // 指针捕获保证移出盒外仍能收到 move/up；3px 阈值区分点击与拖动
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { origin: posRef.current, startX: e.clientX, startY: e.clientY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    applyPos(clampPos(d.origin.top + dy, d.origin.left + dx));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d) return;
    if (d.moved) persistPos(posRef.current);
    else setShowDetail(true);
  };

  if (hidden) return null;
  const busy = local.totalBusyPct;
  const storage = local.storageMB;
  const displayFuncs = local.funcs;
  const sinceLabel = local.since ? local.since.replace('T', ' ').slice(5, 16) : '';

  return (
    <>
      <div
        ref={boxRef}
        style={{ top: pos.top, left: pos.left }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="按住拖动 · 点击查看功能资源占用"
        className="fixed z-[1005] min-w-[132px] cursor-move select-none rounded-md border border-white/25 bg-[rgba(16,16,22,0.92)] py-1 pl-2 pr-5 shadow-lg"
      >
        <button
          type="button"
          aria-label="关闭监控浮窗"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setHidden(true)}
          className="absolute right-0.5 top-0 px-1 text-sm leading-4 text-[#99a] hover:text-white"
        >
          ×
        </button>
        <div className="mb-0.5 text-[10px] font-semibold text-[#8fb3ff]">实时监控</div>
        <div className="text-[11px] leading-[15px] text-[#e8e8ee] tabular-nums">
          <span className="text-[#7f8794]">主线程忙 </span>
          {busy != null ? `${busy.toFixed(1)}%` : '-'}
        </div>
        <div className="text-[11px] leading-[15px] text-[#e8e8ee] tabular-nums">
          <span className="text-[#7f8794]">存储 </span>
          {storage != null ? fmtStg(storage) : '-'}
        </div>
      </div>

      {showDetail && (
        <>
          <div className="fixed inset-0 z-[1006] bg-black/45" onClick={() => setShowDetail(false)} />
          {/* 弹窗主体不透明（#131722），符合弹窗不透明度规则；固定宽度够用即可，不随窗口拉伸 */}
          <div className="fixed left-4 top-24 z-[1007] w-[440px] max-w-[calc(100vw-2rem)] rounded-lg border border-white/[0.18] bg-[#131722] p-2.5 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[13px] font-bold text-[#e8e8ee]">功能资源占用</div>
              <button
                type="button"
                aria-label="关闭明细"
                onClick={() => setShowDetail(false)}
                className="px-1 text-sm leading-4 text-[#99a] hover:text-white"
              >
                ×
              </button>
            </div>
            {sinceLabel ? (
              <div className="mb-1.5 text-[9px] leading-3 text-[#7f8794]">
                {`统计自 ${sinceLabel} · 忙% = 该功能对总忙碌的贡献占比，之和恒 = 总主线程忙`}
              </div>
            ) : null}
            <div className="max-h-[300px] overflow-y-auto">
              {displayFuncs.length === 0 ? (
                <div className="py-3.5 text-center text-[11px] text-[#7f8794]">暂无数据，稍候自动刷新</div>
              ) : (
                displayFuncs.map((f) => (
                  <div
                    key={f.page}
                    className="flex items-center justify-between border-b border-white/[0.08] py-1.5"
                  >
                    <div className="mr-2 min-w-0 truncate text-[12px] text-[#8fb3ff]">{f.page}</div>
                    <div className="shrink-0 text-[11px] text-[#e8e8ee] tabular-nums">
                      忙 {f.busy_pct != null ? `${f.busy_pct.toFixed(1)}%` : '-'}&nbsp;&nbsp;停留 {f.seconds}s
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
