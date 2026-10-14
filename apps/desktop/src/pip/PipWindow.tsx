import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MediaPlayerInstance } from '@vidstack/react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { ExternalLink, Maximize2, Shrink, X } from 'lucide-react';
import type { PlaySource } from '@openreel/core';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { PlayerOverlays } from '../components/player/PlayerOverlays';
import { ThemeProvider } from '../themes/ThemeProvider';
import { FontSizeProvider } from '../themes/FontSizeProvider';
import type { PipAnim } from '../stores/playerStore';
import { readPipPayload } from './pipWindowManager';

const HEADER_H = 36;
const TIME_EMIT_MS = 5000;
const BOOT_FRAME_KEY = 'movie-app-pip-boot-frame';
const APPEAR_ANIM_MS = 350;
const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
/** 收缩态：窗口缩到只够放一个还原按钮的尺寸，贴到所在显示器右下角。 */
const DOCK_SIZE = 44;
const DOCK_MARGIN = 24;
/** dock 态按钮区拖动判定阈值（px）：位移小于它算点击（还原），超过算拖动 */
const DRAG_THRESHOLD = 3;
/** 收缩/还原动画期间 + 之后一段时间内不上报几何，防止 dock 尺寸污染主窗口记忆 */
const GEO_SUPPRESS_PAD_MS = 800;
/** 正常态最小视频区高度（px）：按比例锁比后据此推导窗口最小宽高，防止被拖成不可用的小方块 */
const MIN_VIDEO_AREA_H = 90;
/** JS 主导缩放的「边」命中阈值（px）：距窗口边这个距离内按下即进入缩放 */
const RESIZE_EDGE = 6;
/** 「角」命中阈值（px）：角区域比边区域宽，便于抓角 */
const RESIZE_CORNER = 14;
/** 角拖动时「主导轴」切换滞回（px）：避免斜向拖动时推导轴来回反复切换 */
const RESIZE_AXIS_HYSTERESIS = 8;

interface PipNextEpisode {
  id: string;
  title?: string | null;
  episodeNumber: number;
}

export interface PipPayload {
  episodeId: string;
  title: string;
  episodeLabel: string;
  sources: PlaySource[];
  playSourceId: number | null;
  currentTime: number;
  volume: number;
  muted: boolean;
  nextEpisode: PipNextEpisode | null;
  outroThresholdMinutes: number;
  showNextEpisodeOverlay: boolean;
  anim?: PipAnim;
  openSeq?: number;
  videoWidth?: number;
  videoHeight?: number;
  videoRatio?: number;
}

/** 读取主窗口写入的弹出过渡帧（读后即删，避免残留）。 */
function readBootFrame(): string | null {
  try {
    const v = localStorage.getItem(BOOT_FRAME_KEY);
    if (v) localStorage.removeItem(BOOT_FRAME_KEY);
    return v;
  } catch {
    return null;
  }
}

/** 主屏幕逻辑高度（macOS 左上→左下坐标换算用）。 */
async function primaryScreenHeight(): Promise<number> {
  try {
    const { availableMonitors } = await import('@tauri-apps/api/window');
    const mons = await availableMonitors();
    const primary = mons.find((m) => m.position.x === 0 && m.position.y === 0) ?? mons[0];
    if (primary) return primary.size.height / primary.scaleFactor;
  } catch {}
  return window.screen.availHeight || 900;
}

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

/** pip 弹出动画统一入口：mac 走原生 NSAnimationContext，Windows 走 rAF 逐帧插值。 */
async function runPipAppearAnimation(
  win: ReturnType<typeof getCurrentWebviewWindow>,
  from: PipAnim['from'],
  to: PipAnim['to'],
): Promise<void> {
  if (IS_MAC) {
    const screenH = await primaryScreenHeight();
    await invoke('animate_pip_appear', {
      from: [from.x, from.y, from.w, from.h],
      to: [to.x, to.y, to.w, to.h],
      screenH,
      durationMs: APPEAR_ANIM_MS,
    });
    return;
  }
  const start = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - start) / APPEAR_ANIM_MS);
    const e = easeOutCubic(t);
    void win.setPosition(
      new LogicalPosition(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e),
    );
    void win.setSize(new LogicalSize(from.w + (to.w - from.w) * e, from.h + (to.h - from.h) * e));
    if (t >= 1) break;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  await win.setPosition(new LogicalPosition(to.x, to.y));
  await win.setSize(new LogicalSize(to.w, to.h));
}

type ResizeDir = 'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest' | 'SouthEast' | 'SouthWest';

/** 缩放方向对应的鼠标光标 */
function cursorForResizeDir(dir: ResizeDir | null): string {
  switch (dir) {
    case 'North':
    case 'South':
      return 'ns-resize';
    case 'East':
    case 'West':
      return 'ew-resize';
    case 'NorthWest':
    case 'SouthEast':
      return 'nwse-resize';
    case 'NorthEast':
    case 'SouthWest':
      return 'nesw-resize';
    default:
      return '';
  }
}

/**
 * 命中缩放方向：坐标相对窗口内容区（逻辑像素）。
 * 靠近边（RESIZE_EDGE 内）或靠近角（RESIZE_CORNER 内，且另一轴也在角区内）即命中；都不命中返回 null。
 */
function hitResizeDir(px: number, py: number, w: number, h: number): ResizeDir | null {
  const inCornerX = px <= RESIZE_CORNER || px >= w - RESIZE_CORNER;
  const inCornerY = py <= RESIZE_CORNER || py >= h - RESIZE_CORNER;
  const edgeY = inCornerX ? RESIZE_CORNER : RESIZE_EDGE;
  const edgeX = inCornerY ? RESIZE_CORNER : RESIZE_EDGE;
  const vp: 'N' | 'S' | null = py <= edgeY ? 'N' : py >= h - edgeY ? 'S' : null;
  const hp: 'W' | 'E' | null = px <= edgeX ? 'W' : px >= w - edgeX ? 'E' : null;
  if (vp && hp) return `${vp === 'N' ? 'North' : 'South'}${hp === 'W' ? 'West' : 'East'}` as ResizeDir;
  if (vp) return (vp === 'N' ? 'North' : 'South') as ResizeDir;
  if (hp) return (hp === 'W' ? 'West' : 'East') as ResizeDir;
  return null;
}

export function PipWindow() {
  return (
    <ThemeProvider>
      <FontSizeProvider>
        <PipRoot />
      </FontSizeProvider>
    </ThemeProvider>
  );
}

function PipRoot() {
  const win = useMemo(() => getCurrentWebviewWindow(), []);
  const initialData = useMemo(() => readPipPayload<PipPayload>(), []);
  const [data, setData] = useState<PipPayload | null>(initialData);
  const [playSourceId, setPlaySourceId] = useState<number | null>(initialData?.playSourceId ?? null);
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [videoRatio, setVideoRatio] = useState<number>(() => {
    const r = initialData?.videoRatio;
    if (typeof r === 'number' && Number.isFinite(r) && r > 0) return r;
    const vw = initialData?.videoWidth;
    const vh = initialData?.videoHeight;
    if (typeof vw === 'number' && typeof vh === 'number' && vw > 0 && vh > 0) return vw / vh;
    return 16 / 9;
  });
  const lastAppliedRectRef = useRef<{ w: number; h: number } | null>(null);
  const applyingCorrectionRef = useRef(false);
  /** 供 applyOpen（弹出动画结束后）主动触发一次比例回正 */
  const correctRef = useRef<(() => void) | null>(null);
  const videoRatioRef = useRef(videoRatio);
  const lastTimeEmitRef = useRef(0);
  const lastNextEmitRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const lastCloseEmitRef = useRef(0);

  // ── 靠边收缩（dock）：缩成右下角一个按钮，视频继续播放 ──
  const [pipDocked, setPipDocked] = useState(false);
  const dockedRef = useRef(false);
  const restoreRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  /** dock 态当前矩形（收缩/吸附后同步），供拖动增量计算用，避免 pointerdown 里异步取位置 */
  const dockRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const suppressGeoUntilRef = useRef(0);
  const dockBusyRef = useRef(false);
  const dockDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  /** JS 主导缩放（替代系统缩放）的拖动状态 */
  const resizeDragRef = useRef<{
    pointerId: number;
    dir: ResizeDir;
    /** 按下时的指针屏幕坐标（逻辑点，绝对坐标；不受窗口自身移动影响） */
    startScreenX: number;
    startScreenY: number;
    /** 按下时的窗口矩形（逻辑点、全局坐标） */
    rect: { x: number; y: number; w: number; h: number };
    /** 上一次已应用的矩形（省掉重复 set） */
    cur: { x: number; y: number; w: number; h: number };
    /** 角拖动时上一次选中的主导轴 */
    axis: 'w' | 'h';
  } | null>(null);

  // 弹出过渡帧：动画期间盖住正在加载的播放器，就绪后淡出
  const [bootFrame, setBootFrame] = useState<string | null>(() => readBootFrame());
  const [frameFading, setFrameFading] = useState(false);
  const hideFrameRef = useRef(false);
  const animStartedRef = useRef(false);
  const lastSeqRef = useRef(0);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const overlayDismissedRef = useRef(false);
  const reachedOutroRef = useRef(false);
  const [skipForwardVisible, setSkipForwardVisible] = useState(false);
  const skipDismissedRef = useRef(false);
  const skipEligibleRef = useRef((initialData?.currentTime ?? 0) < 2 * 60);
  const lastTimeRef = useRef(initialData?.currentTime ?? 0);

  useEffect(() => {
    videoRatioRef.current = videoRatio;
    // 比例变化（首帧元数据到达 / 切集换片）时，把已打开的窗口回正到新比例
    if (!dockedRef.current) correctRef.current?.();
  }, [videoRatio]);

  useEffect(() => {
    // 顺序不可调换：先让原生层套「圆角 + 贴合阴影」，再关掉系统缩放。
    // 缩放完全由 JS 主导（见 onRootPointerDownCapture）：系统缩放若开着，拖动时会先把自己
    // 「不合比例」的矩形贴上去、再由 JS 事后回正（实测每个鼠标事件两帧，全程抖动），
    // 并与系统最小尺寸（44x44，dock 收缩态需要）互搏。
    void (async () => {
      try {
        await invoke('style_pip_window');
      } catch (err) {
        console.error('[PipWindow] style_pip_window 失败:', err);
      }
      try {
        await win.setResizable(false);
      } catch (err) {
        console.error('[PipWindow] setResizable 失败:', err);
      }
    })();
  }, [win]);

  const hideBootFrame = useCallback(() => {
    if (hideFrameRef.current || !bootFrame) return;
    hideFrameRef.current = true;
    setFrameFading(true);
    window.setTimeout(() => setBootFrame(null), 350);
  }, [bootFrame]);

  // 弹出动画：帧图加载/解码完成后飞（mac 原生 NSAnimationContext / win rAF），失败跳位兜底。
  useEffect(() => {
    const anim = data?.anim;
    if (!anim || !bootFrame || animStartedRef.current) return;
    let hard: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (animStartedRef.current) return;
      animStartedRef.current = true;
      if (hard) window.clearTimeout(hard);
      void (async () => {
        try {
          await runPipAppearAnimation(win, anim.from, anim.to);
        } catch (err) {
          console.error('[PipWindow] 弹出动画失败，直接跳到目标位置:', err);
          try {
            await win.setPosition(new LogicalPosition(anim.to.x, anim.to.y));
            await win.setSize(new LogicalSize(anim.to.w, anim.to.h));
          } catch {}
        }
      })();
    };
    const img = new Image();
    img.onload = start;
    img.onerror = start;
    img.src = bootFrame;
    hard = window.setTimeout(start, 800);
    return () => {
      img.onload = null;
      img.onerror = null;
      if (hard) window.clearTimeout(hard);
    };
  }, [win, data?.anim, bootFrame]);

  // 过渡帧淡出：播放器就绪且已到目标时间附近即撤帧；12s 硬兜底防卡住。
  useEffect(() => {
    if (!bootFrame) return;
    const want = data?.currentTime ?? 0;
    const iv = window.setInterval(() => {
      if (hideFrameRef.current) return;
      const video = playerRef.current?.el?.querySelector('video');
      if (video && video.readyState >= 2 && video.currentTime >= want - 0.5) hideBootFrame();
    }, 250);
    const hard = window.setTimeout(() => hideBootFrame(), 12000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(hard);
    };
  }, [bootFrame, data?.currentTime, hideBootFrame]);

  // 应用一次「打开画中画」：重置开场状态 → 读新过渡帧 → 显示窗口 → 由动画 effect 驱动飞出。
  const applyOpen = useCallback(
    (payload: PipPayload) => {
      if (payload.openSeq !== undefined && lastSeqRef.current === payload.openSeq) return;
      if (payload.openSeq !== undefined) lastSeqRef.current = payload.openSeq;
      hideFrameRef.current = false;
      animStartedRef.current = false;
      setFrameFading(false);
      setPlaySourceId(payload.playSourceId ?? null);
      // 新一轮打开：回到常规浮窗形态，收缩态不复用
      dockedRef.current = false;
      setPipDocked(false);
      restoreRectRef.current = null;
      skipEligibleRef.current = (payload.currentTime ?? 0) < 2 * 60;
      lastTimeRef.current = payload.currentTime ?? 0;
      const r = payload.videoRatio;
      if (typeof r === 'number' && Number.isFinite(r) && r > 0) {
        setVideoRatio(r);
        videoRatioRef.current = r;
      } else {
        const vw = payload.videoWidth;
        const vh = payload.videoHeight;
        if (typeof vw === 'number' && typeof vh === 'number' && vw > 0 && vh > 0) {
          const rr = vw / vh;
          setVideoRatio(rr);
          videoRatioRef.current = rr;
        }
      }
      const frame = readBootFrame();
      setBootFrame(frame);
      const a = payload.anim;
      if (a) {
        // 动画终点即本次打开的目标矩形，作为后续「主导轴」判定的基准，避免首次拖动误判
        lastAppliedRectRef.current = { w: a.to.w, h: a.to.h };
      }
      if (!frame && a) {
        void win.setPosition(new LogicalPosition(a.to.x, a.to.y));
        void win.setSize(new LogicalSize(a.to.w, a.to.h));
      }
      setData(payload);
      // 弹出动画（最多 800ms 等帧 + 350ms 飞行）期间豁免比例回正与几何上报；
      // 动画结束后补一次回正：记忆尺寸若与当前视频比例不符，此时收敛到正确比例。
      suppressGeoUntilRef.current = Math.max(
        suppressGeoUntilRef.current,
        Date.now() + APPEAR_ANIM_MS + 900,
      );
      window.setTimeout(() => {
        if (!dockedRef.current) correctRef.current?.();
      }, APPEAR_ANIM_MS + 950);
      void win.show().catch(() => {});
      void win.setFocus().catch(() => {});
      window.setTimeout(() => {
        void win
          .isVisible()
          .then((v) => {
            if (!v) void invoke('show_pip').catch(() => {});
          })
          .catch(() => {});
      }, 700);
    },
    [win],
  );

  // 关闭画中画：卸载播放器停流 + 隐藏常驻窗口（不销毁，供下次复用）。
  const hidePip = useCallback(() => {
    hideFrameRef.current = false;
    animStartedRef.current = false;
    setFrameFading(false);
    setBootFrame(null);
    setPlaySourceId(null);
    setData(null);
    // 复位收缩态：下次打开必须是常规浮窗，不能残留 44x44 停靠态
    dockedRef.current = false;
    setPipDocked(false);
    restoreRectRef.current = null;
    void win.hide().catch(() => {});
  }, [win]);

  // 常驻窗口挂载即读到的兜底 payload（仅当监听未就绪时主窗口才依赖此路径）。
  useEffect(() => {
    if (initialData) applyOpen(initialData);
  }, [initialData, applyOpen]);

  useEffect(() => {
    let un: (() => void) | undefined;
    listen<PipPayload>('pip://open', (e) => applyOpen(e.payload)).then((f) => (un = f));
    listen<PipPayload>('pip://episode', (e) => {
      setData(e.payload);
      setPlaySourceId(e.payload.playSourceId ?? null);
      const p = e.payload;
      const r = p.videoRatio;
      if (typeof r === 'number' && Number.isFinite(r) && r > 0) {
        setVideoRatio(r);
        videoRatioRef.current = r;
      } else {
        const vw = p.videoWidth;
        const vh = p.videoHeight;
        if (typeof vw === 'number' && typeof vh === 'number' && vw > 0 && vh > 0) {
          const rr = vw / vh;
          setVideoRatio(rr);
          videoRatioRef.current = rr;
        }
      }
    }).then((f) => {
      const prev = un;
      un = () => {
        f();
        prev?.();
      };
    });
    listen('pip://close', () => {
      const video = playerRef.current?.el?.querySelector('video');
      const { t, d } = video ? { t: video.currentTime, d: video.duration || 0 } : { t: 0, d: 0 };
      lastCloseEmitRef.current = Date.now();
      void emit('pip://closing', { t, d });
      hidePip();
    }).then((f) => {
      const prev = un;
      un = () => {
        f();
        prev?.();
      };
    });
    return () => un?.();
  }, [win, applyOpen, hidePip]);

  useEffect(() => {
    setOverlayVisible(false);
    overlayDismissedRef.current = false;
    reachedOutroRef.current = false;
    skipEligibleRef.current = (data?.currentTime ?? 0) < 2 * 60;
    setSkipForwardVisible(false);
    skipDismissedRef.current = false;
    lastTimeRef.current = data?.currentTime ?? 0;
  }, [data?.episodeId]);

  const readVideoTime = useCallback(() => {
    const video = playerRef.current?.el?.querySelector('video');
    return video ? { t: video.currentTime, d: video.duration || 0 } : { t: 0, d: 0 };
  }, []);

  const handleTimeUpdate = useCallback(
    (t: number, d: number) => {
      const now = Date.now();
      if (now - lastTimeEmitRef.current >= TIME_EMIT_MS) {
        lastTimeEmitRef.current = now;
        void emit('pip://time', { t, d });
      }
      const threshold = (data?.outroThresholdMinutes ?? 10) * 60;
      // 短片（时长 ≤ 预热阈值）在剩余 60s 内触发；长片沿用阈值窗口
      const outroWindow = d <= threshold ? 60 : threshold;
      const reached = d > 0 && t > 0 && d - t <= outroWindow;
      reachedOutroRef.current = reached;
      const canShow =
        !overlayDismissedRef.current &&
        reached &&
        data?.showNextEpisodeOverlay !== false &&
        data?.nextEpisode != null;
      if (canShow) {
        setOverlayVisible(true);
        setSkipForwardVisible(false);
        skipDismissedRef.current = true;
      }
      // 主动向后拖动（currentTime 明显回落）：离开片尾隐藏下一集浮窗，并恢复快进浮窗可选性
      const backwardSeek = lastTimeRef.current - t >= 3;
      lastTimeRef.current = t;
      if (!reached) {
        setOverlayVisible(false);
      }
      if (backwardSeek) {
        skipDismissedRef.current = false;
        skipEligibleRef.current = t < 2 * 60;
      }
      if (t >= 2 * 60) {
        setSkipForwardVisible(false);
      } else if (
        skipEligibleRef.current &&
        !skipDismissedRef.current &&
        !skipForwardVisible &&
        t > 0
      ) {
        setSkipForwardVisible(true);
      }
    },
    [
      data?.outroThresholdMinutes,
      data?.showNextEpisodeOverlay,
      data?.nextEpisode,
      skipForwardVisible,
    ],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    const send = async () => {
      // 收缩态（44x44）与收缩/还原动画过程中的几何一律不上报，
      // 否则会污染主窗口记忆的「原位」，导致下次打开 pip 变成小方块。
      if (dockedRef.current || Date.now() < suppressGeoUntilRef.current) return;
      try {
        const [pos, size, sf] = await Promise.all([
          win.outerPosition(),
          win.innerSize(),
          win.scaleFactor(),
        ]);
        void emit('pip://geometry', {
          x: pos.x / sf,
          y: pos.y / sf,
          w: size.width / sf,
          h: size.height / sf,
        });
      } catch {}
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, 400);
    };
    win.onMoved(schedule).then((f) => (un1 = f));
    win.onResized(schedule).then((f) => (un2 = f));
    return () => {
      if (timer) clearTimeout(timer);
      un1?.();
      un2?.();
    };
  }, [win]);

  useEffect(() => {
    let unResized: (() => void) | undefined;
    let pending = false;
    const correctOnce = async () => {
      if (applyingCorrectionRef.current) {
        pending = true;
        return;
      }
      applyingCorrectionRef.current = true;
      try {
        let guard = 0;
        do {
          if (++guard > 4) break;
          pending = false;
          // 豁免：dock 收缩/还原动画、弹出动画期间、JS 主导缩放过程中的程序化尺寸变化
          if (dockedRef.current || dockBusyRef.current) continue;
          if (resizeDragRef.current) continue;
          if (Date.now() < suppressGeoUntilRef.current) continue;
          const r = videoRatioRef.current;
          if (!(r > 0)) continue;
          const [size, sf] = await Promise.all([win.innerSize(), win.scaleFactor()]);
          const w = size.width / sf;
          const h = size.height / sf;
          const minW = Math.round(MIN_VIDEO_AREA_H * r);
          const minH = MIN_VIDEO_AREA_H + HEADER_H;
          const last = lastAppliedRectRef.current;
          const dw = last ? Math.abs(w - last.w) : Infinity;
          const dh = last ? Math.abs(h - last.h) : 0;
          let nw = w;
          let nh = h;
          // 以「变化更多的那一轴」为主导轴，推导另一轴，保证被拖的那条边跟手
          if (dw >= dh) nh = Math.round(Math.max(w, minW) / r + HEADER_H);
          else nw = Math.round(Math.max(h - HEADER_H, MIN_VIDEO_AREA_H) * r);
          if (nw < minW || nh < minH) {
            nw = Math.max(nw, minW);
            nh = Math.max(nh, minH);
          }
          if (Math.abs(nw - w) > 1 || Math.abs(nh - h) > 1) {
            await win.setSize(new LogicalSize(nw, nh));
          }
          lastAppliedRectRef.current = { w: nw, h: nh };
        } while (pending);
      } catch {}
      applyingCorrectionRef.current = false;
    };
    win
      .onResized(() => {
        void correctOnce();
      })
      .then((f) => (unResized = f));
    correctRef.current = () => void correctOnce();
    return () => {
      correctRef.current = null;
      unResized?.();
    };
  }, [win]);

  // mac 元素全屏会创建原生全屏空间；pip 窗口若保持置顶，旧尺寸窗口会浮在全屏画面之上。
  // 进入元素全屏时临时取消置顶让窗口沉到全屏后面，退出时恢复。
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      win.setAlwaysOnTop(!fs).catch((err) => console.error('[PipWindow] setAlwaysOnTop 失败:', err));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [win]);

  useEffect(() => {
    let un: (() => void) | undefined;
    (async () => {
      try {
        un = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          if (Date.now() - lastCloseEmitRef.current >= 1000) {
            lastCloseEmitRef.current = Date.now();
            const { t, d } = readVideoTime();
            await emit('pip://closing', { t, d });
          }
          hidePip();
        });
      } catch {}
    })();
    return () => un?.();
  }, [win, readVideoTime, hidePip]);

  const closePip = useCallback(() => {
    lastCloseEmitRef.current = Date.now();
    const { t, d } = readVideoTime();
    void emit('pip://closing', { t, d });
    hidePip();
  }, [readVideoTime, hidePip]);

  const handleBack = useCallback(() => {
    lastCloseEmitRef.current = Date.now();
    const { t, d } = readVideoTime();
    const emitP = emit('pip://back', { t, d }).then(
      () => {},
      (err) => console.error('[PipWindow] back emit err:', err),
    );
    void Promise.race([emitP, new Promise((r) => setTimeout(r, 800))]).finally(() => hidePip());
  }, [readVideoTime, hidePip]);

  const handleNext = useCallback(() => {
    if (!data?.nextEpisode) return;
    const now = Date.now();
    const target = data.nextEpisode.id;
    if (lastNextEmitRef.current.id === target && now - lastNextEmitRef.current.at < 1000) {
      return;
    }
    lastNextEmitRef.current = { id: target, at: now };
    void emit('pip://next', { episodeId: target });
  }, [data?.nextEpisode, data?.episodeId]);

  const handleFullscreen = () => {
    const p = playerRef.current;
    if (!p) return;
    if (document.fullscreenElement) {
      p.exitFullscreen().catch(() => {});
    } else {
      p.enterFullscreen().catch(() => {});
    }
  };

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, select')) return;
    win.startDragging().catch((err) => console.error('[PipWindow] startDragging 失败:', err));
  };

  // ── JS 主导缩放（mac / win 通用）──
  // 语义：被拖边跟指针；该轴的**对边固定**；未拖的另一轴保持起始锚点；尺寸始终满足
  // h = round(w / videoRatio) + HEADER_H（与 correctOnce 判据一致，避免互相纠正）。
  // 做法：pointerdown 判定方向并捕获指针 → 每次 pointermove 一次算出目标矩形 →
  // 同一 tick 内 setSize + setPosition（两个 IPC 背靠背处理，不出现「只改尺寸/只改位置」的中间帧）。
  const onRootPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (dockedRef.current || dockBusyRef.current) return;
    if (document.fullscreenElement) return;
    if (Date.now() < suppressGeoUntilRef.current) return;
    if (resizeDragRef.current) return;
    if (!(videoRatioRef.current > 0)) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dir = hitResizeDir(e.clientX, e.clientY, w, h);
    if (!dir) return;
    // 命中缩放区：拦住事件，避免触发标题栏拖动 / 视频控制条。
    e.preventDefault();
    e.stopPropagation();
    // screenX/screenY 与 clientX/clientY 之差 = 窗口内容区在屏幕上的原点（逻辑点）
    const rect = {
      x: Math.round(e.screenX - e.clientX),
      y: Math.round(e.screenY - e.clientY),
      w,
      h,
    };
    resizeDragRef.current = {
      pointerId: e.pointerId,
      dir,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      rect,
      cur: { ...rect },
      axis: 'w',
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const applyResizeDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = resizeDragRef.current;
    if (!d) return;
    const r = videoRatioRef.current;
    if (!(r > 0)) return;
    // 最小尺寸：以宽度为基准推导高度，保证 h = round(w / r) + HEADER_H 恒成立
    const minW = Math.round(MIN_VIDEO_AREA_H * r);
    const minH = Math.round(minW / r) + HEADER_H;
    const canon = (w: number) => {
      const nw = Math.max(Math.round(w), minW);
      return { w: nw, h: Math.max(Math.round(nw / r) + HEADER_H, minH) };
    };
    const { rect, dir } = d;
    const dx = e.screenX - d.startScreenX;
    const dy = e.screenY - d.startScreenY;
    const east = dir.includes('East');
    const west = dir.includes('West');
    const north = dir.includes('North');
    const south = dir.includes('South');
    // 被拖边按指针算出的候选尺寸（未拖轴保持起始值）
    const wCand = east ? rect.w + dx : west ? rect.w - dx : rect.w;
    const hCand = south ? rect.h + dy : north ? rect.h - dy : rect.h;
    let w: number;
    let h: number;
    let axis: 'w' | 'h' = 'w';
    if ((east || west) && (north || south)) {
      // 角拖动：两种候选（按宽规范化 / 按高规范化），取「被拖边更贴合指针」的那个；
      // 相差不超过滞回值就沿用上一次的主轴，避免斜向拖动时来回切换。
      const byW = canon(wCand);
      const byH = canon((Math.max(Math.round(hCand), minH) - HEADER_H) * r);
      const missW = Math.abs(hCand - byW.h);
      const missH = Math.abs(wCand - byH.w);
      if (missW < missH - RESIZE_AXIS_HYSTERESIS) axis = 'w';
      else if (missH < missW - RESIZE_AXIS_HYSTERESIS) axis = 'h';
      else axis = d.axis;
      const pick = axis === 'w' ? byW : byH;
      w = pick.w;
      h = pick.h;
    } else if (east || west) {
      const pick = canon(wCand);
      w = pick.w;
      h = pick.h;
    } else {
      const pick = canon((Math.max(Math.round(hCand), minH) - HEADER_H) * r);
      w = pick.w;
      h = pick.h;
      axis = 'h';
    }
    d.axis = axis;
    // 被拖轴的对边固定；未拖轴锚在起始位置（与原生的贴边语义一致）
    const x = west ? rect.x + rect.w - w : rect.x;
    const y = north ? rect.y + rect.h - h : rect.y;
    if (w === d.cur.w && h === d.cur.h && x === d.cur.x && y === d.cur.y) return;
    d.cur = { x, y, w, h };
    void win.setSize(new LogicalSize(w, h));
    void win.setPosition(new LogicalPosition(x, y));
  };

  const onRootPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current) {
      if (resizeDragRef.current.pointerId !== e.pointerId) return;
      applyResizeDrag(e);
      return;
    }
    // 未拖动时只负责光标反馈（缩放已无系统边框，光标全靠这里提示）
    if (dockedRef.current || dockBusyRef.current || document.fullscreenElement) return;
    const dir = hitResizeDir(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    const cursor = cursorForResizeDir(dir);
    const el = e.currentTarget;
    if (el.style.cursor !== cursor) el.style.cursor = cursor;
  };

  const finishResizeDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = resizeDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    resizeDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (!cancelled && d.cur.w > 0) lastAppliedRectRef.current = { w: d.cur.w, h: d.cur.h };
  };

  const onRootPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => finishResizeDrag(e, false);
  const onRootPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => finishResizeDrag(e, true);
  const onRootPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current) return;
    if (e.currentTarget.style.cursor) e.currentTarget.style.cursor = '';
  };

  const handleSourceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const src = data?.sources.find((s) => s.id === Number(e.target.value));
    if (!src || !data) return;
    void emit('pip://source', { id: src.id, sourceId: src.sourceId });
  };

  const handleVolumeChange = useCallback(
    (v: number, m: boolean) => {
      void emit('pip://volume', { v, m });
    },
    [],
  );

  /** pip 窗口当前几何（逻辑点、左上原点的全局坐标）。 */
  const readGeometry = useCallback(async () => {
    const [pos, size, sf] = await Promise.all([
      win.outerPosition(),
      win.innerSize(),
      win.scaleFactor(),
    ]);
    return { x: pos.x / sf, y: pos.y / sf, w: size.width / sf, h: size.height / sf };
  }, [win]);

  /** 逻辑点坐标系下包含 (cx,cy) 的显示器矩形；找不到则退到窗口 screen 兜底矩形。 */
  const findMonitorRect = useCallback(async (cx: number, cy: number) => {
    const fallback = {
      x: 0,
      y: 0,
      w: window.screen.availWidth || 1440,
      h: window.screen.availHeight || 900,
    };
    try {
      const { availableMonitors } = await import('@tauri-apps/api/window');
      const mons = await availableMonitors();
      for (const m of mons) {
        const sf = m.scaleFactor || 1;
        const mx = m.position.x / sf;
        const my = m.position.y / sf;
        const mw = m.size.width / sf;
        const mh = m.size.height / sf;
        if (cx >= mx && cx <= mx + mw && cy >= my && cy <= my + mh) {
          return { x: mx, y: my, w: mw, h: mh };
        }
      }
    } catch {}
    return fallback;
  }, []);

  /** 收缩目标：pip 窗口所在显示器的右下角，距右/下各 DOCK_MARGIN。 */
  const computeDockRect = useCallback(
    async (self: { x: number; y: number; w: number; h: number }) => {
      const m = await findMonitorRect(self.x + self.w / 2, self.y + self.h / 2);
      return {
        x: Math.round(m.x + m.w - DOCK_SIZE - DOCK_MARGIN),
        y: Math.round(m.y + m.h - DOCK_SIZE - DOCK_MARGIN),
        w: DOCK_SIZE,
        h: DOCK_SIZE,
      };
    },
    [findMonitorRect],
  );

  /** 把矩形夹回目标所在显示器内（防还原时目标落在已拔掉的显示器上跑出屏幕）。 */
  const clampRect = useCallback(
    async (rect: { x: number; y: number; w: number; h: number }) => {
      const m = await findMonitorRect(rect.x + rect.w / 2, rect.y + rect.h / 2);
      const w = Math.min(rect.w, m.w);
      const h = Math.min(rect.h, m.h);
      return {
        x: Math.round(Math.min(Math.max(rect.x, m.x), m.x + m.w - w)),
        y: Math.round(Math.min(Math.max(rect.y, m.y), m.y + m.h - h)),
        w,
        h,
      };
    },
    [findMonitorRect],
  );

  /** 收缩 ↔ 还原：复用弹出动画做双向移动+缩放，视频不卸载、继续播放。 */
  const toggleDock = useCallback(async () => {
    if (dockBusyRef.current) return;
    dockBusyRef.current = true;
    try {
      const from = await readGeometry();
      suppressGeoUntilRef.current = Date.now() + APPEAR_ANIM_MS + GEO_SUPPRESS_PAD_MS;
      if (dockedRef.current) {
        const back = await clampRect(restoreRectRef.current ?? from);
        restoreRectRef.current = null;
        dockedRef.current = false;
        setPipDocked(false);
        await runPipAppearAnimation(win, from, back);
        return;
      }
      restoreRectRef.current = from;
      const to = await computeDockRect(from);
      dockRectRef.current = to;
      dockedRef.current = true;
      setPipDocked(true);
      await runPipAppearAnimation(win, from, to);
    } catch (err) {
      console.error('[PipWindow] 收缩/还原失败:', err);
      dockedRef.current = false;
      setPipDocked(false);
      restoreRectRef.current = null;
    } finally {
      dockBusyRef.current = false;
    }
  }, [win, readGeometry, computeDockRect, clampRect]);

  /** dock 态拖动松手后：贴到所在显示器最近的一条边（距边 DOCK_MARGIN）。 */
  const snapDockToNearestEdge = useCallback(async () => {
    if (dockBusyRef.current) return;
    dockBusyRef.current = true;
    try {
      const cur = await readGeometry();
      const m = await findMonitorRect(cur.x + cur.w / 2, cur.y + cur.h / 2);
      const to: { x: number; y: number; w: number; h: number } = {
        x: cur.x,
        y: cur.y,
        w: DOCK_SIZE,
        h: DOCK_SIZE,
      };
      const near = [
        { d: cur.x - m.x, axis: 'x' as const, edge: 'left' as const },
        { d: m.x + m.w - (cur.x + cur.w), axis: 'x' as const, edge: 'right' as const },
        { d: cur.y - m.y, axis: 'y' as const, edge: 'top' as const },
        { d: m.y + m.h - (cur.y + cur.h), axis: 'y' as const, edge: 'bottom' as const },
      ].sort((a, b) => a.d - b.d)[0];
      if (near.axis === 'x') {
        to.x =
          near.edge === 'left'
            ? Math.round(m.x + DOCK_MARGIN)
            : Math.round(m.x + m.w - DOCK_SIZE - DOCK_MARGIN);
      } else {
        to.y =
          near.edge === 'top'
            ? Math.round(m.y + DOCK_MARGIN)
            : Math.round(m.y + m.h - DOCK_SIZE - DOCK_MARGIN);
      }
      dockRectRef.current = to;
      suppressGeoUntilRef.current = Date.now() + APPEAR_ANIM_MS + GEO_SUPPRESS_PAD_MS;
      await runPipAppearAnimation(win, cur, to);
      console.log('[PipWindow] dock 吸附到最近边', near.edge, JSON.stringify(to));
    } catch (err) {
      console.error('[PipWindow] dock 吸附失败:', err);
    } finally {
      dockBusyRef.current = false;
    }
  }, [win, readGeometry, findMonitorRect]);

  // dock 态按钮区：指针按下自行跟手移动（不用 startDragging，以便区分点击/拖动）。
  // 位移 < DRAG_THRESHOLD → 视为点击 = 还原；超过则拖动窗口，松手自动贴最近边。
  const onDockPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const base = dockRectRef.current ?? { x: 0, y: 0, w: DOCK_SIZE, h: DOCK_SIZE };
    dockDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: base.x,
      originY: base.y,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onDockPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dockDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    void win.setPosition(
      new LogicalPosition(Math.round(d.originX + dx), Math.round(d.originY + dy)),
    );
  };

  const finishDockPointer = (e: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = dockDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dockDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (cancelled) return;
    if (!d.moved) {
      void toggleDock();
      return;
    }
    void snapDockToNearestEdge();
  };

  const onDockPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => finishDockPointer(e, false);
  const onDockPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => finishDockPointer(e, true);

  // P 键收缩/还原：仅 pip 窗口有焦点时生效（不进全局快捷键，避免劫持其它应用的 P 键）；
  // vidstack 默认键为 k/m/f/i/c/j/l/方向键/>/<，p 未被占用。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'p' && e.key !== 'P') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return;
      e.preventDefault();
      void toggleDock();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleDock]);

  if (!data) {
    return <div className="h-screen w-screen bg-black" />;
  }

  const nextEpisodeTitle = data.nextEpisode
    ? `下一集${data.nextEpisode.title ? ` · ${data.nextEpisode.title}` : ''}`
    : '';

  const headerCls =
    'flex items-center gap-1 bg-black/90 text-white/90 text-xs px-2 cursor-move touch-none';

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-black select-none"
      onPointerDownCapture={onRootPointerDownCapture}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerCancel}
      onPointerLeave={onRootPointerLeave}
    >
      {bootFrame && (
        <img
          src={bootFrame}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute inset-0 z-50 h-full w-full object-contain bg-black transition-opacity duration-300 ${
            pipDocked ? 'hidden' : frameFading ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}
      <div
        className={`${headerCls} ${pipDocked ? 'hidden' : ''}`}
        style={{ height: HEADER_H }}
        onPointerDown={onHeaderPointerDown}
      >
        <div className="flex-1 min-w-0 truncate text-left px-1">
          {data.title ? `${data.title} · ${data.episodeLabel}` : data.episodeLabel}
        </div>
        <button
          type="button"
          onClick={handleBack}
          title="返回播放页"
          className="shrink-0 p-1 rounded hover:bg-white/10"
        >
          <ExternalLink className="size-3.5" />
        </button>
        {data.sources.length > 1 && (
          <select
            value={playSourceId ?? ''}
            onChange={handleSourceSelect}
            className="shrink-0 max-w-28 bg-black/60 text-white/90 text-xs rounded px-1 py-0.5 cursor-pointer outline-none"
            title="切换线路"
          >
            {data.sources.map((s, i) => (
              <option key={s.id} value={s.id}>
                {s.sourceName || `线路${i + 1}`}
                {s.quality ? ` · ${s.quality}` : ''}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={handleFullscreen}
          title="全屏"
          className="shrink-0 p-1 rounded hover:bg-white/10"
        >
          <Maximize2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void toggleDock()}
          title="收缩到右下角（P）"
          className="shrink-0 p-1 rounded hover:bg-white/10"
        >
          <Shrink className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={closePip}
          title="关闭画中画"
          className="shrink-0 p-1 rounded hover:bg-white/10"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* 收缩态：只露出一个按钮。单击 = 还原到原位；按住拖动 = 移动小窗，松手自动贴最近边。
          视频/标题栏/手柄用 hidden 隐藏而非卸载，保证 video 元素一直在 DOM 里持续播放。 */}
      {pipDocked && (
        <button
          type="button"
          onPointerDown={onDockPointerDown}
          onPointerMove={onDockPointerMove}
          onPointerUp={onDockPointerUp}
          onPointerCancel={onDockPointerCancel}
          title="单击还原（P）· 按住拖动可移动"
          aria-label="还原画中画，按住拖动可移动"
          className="absolute inset-0 z-40 flex cursor-grab touch-none select-none items-center justify-center bg-transparent active:cursor-grabbing"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white/90 transition-colors hover:bg-white/30">
            <Maximize2 className="size-4" />
          </span>
        </button>
      )}

      <div
        className={`relative flex flex-1 min-h-0 items-center justify-center bg-black ${
          pipDocked ? 'hidden' : ''
        }`}
      >
        <div
          className="max-h-full max-w-full"
          style={{ width: `min(100%, calc((100vh - ${HEADER_H}px) * ${videoRatio}))` }}
        >
          <VideoPlayer
            playerRef={playerRef}
            key={`${data.episodeId}:${data.playSourceId}`}
            keyTarget="document"
            aspectRatio={videoRatio}
            onLoadedMetadata={() => {
              const v = playerRef.current?.el?.querySelector('video') as HTMLVideoElement | null | undefined;
              if (v && v.videoWidth > 0 && v.videoHeight > 0) {
                const r = v.videoWidth / v.videoHeight;
                if (Number.isFinite(r) && r > 0) {
                  setVideoRatio(r);
                  videoRatioRef.current = r;
                }
              }
            }}
            onSpaceToggle={() => {
              const p = playerRef.current;
              if (p) (p.paused ? void p.play().catch(() => {}) : p.pause());
            }}
            sources={data.sources}
            initialSourceId={playSourceId ?? undefined}
            initialCurrentTime={data.currentTime}
            volume={data.volume}
            muted={data.muted}
            onTimeUpdate={handleTimeUpdate}
            onVolumeChange={handleVolumeChange}
            overlays={
              <PlayerOverlays
                nextEpisodeTitle={nextEpisodeTitle}
                overlayVisible={overlayVisible}
                onNext={handleNext}
                onClose={() => {
                  setOverlayVisible(false);
                  overlayDismissedRef.current = true;
                }}
                skipForwardVisible={skipForwardVisible}
                onSkipForward={(delta) => {
                  const video = playerRef.current?.el?.querySelector('video');
                  if (!video) return;
                  const target = Math.min(
                    video.currentTime + delta,
                    video.duration || video.currentTime + delta,
                  );
                  video.currentTime = target;
                }}
                onSkipForwardClose={() => {
                  setSkipForwardVisible(false);
                  skipDismissedRef.current = true;
                }}
              />
            }
          />
        </div>
      </div>

      {/* 缩放手柄已取消：缩放命中判定与光标反馈统一由根容器的 pointer 事件负责
          （见 onRootPointerDownCapture / onRootPointerMove），不再用覆盖层 div，
          避免底部命中区遮挡 vidstack 控制条。 */}
    </div>
  );
}
