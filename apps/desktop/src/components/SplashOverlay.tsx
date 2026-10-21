import { useEffect, useRef, useState } from 'react';
import { getSplashStore } from '@openreel/core';

interface SplashOverlayProps {
  /** initApp 是否已完成（主应用可渲染、数据库就绪）。 */
  ready: boolean;
}

const LOGO_MS = 1500;
const FADE_OUT_MS = 400;

/**
 * 启动欢迎页覆盖层（桌面端）——**仅属于应用启动序列**。
 * - 欢迎页：logo 居中展示，至少 LOGO_MS；init 就绪后淡出进入主应用；
 * - 主应用渲染在其下层，首页数据在欢迎页展示期间后台加载。
 * - 刷新（reload）不属启动序列，由调用方（App.tsx）不挂载本组件。
 * - 数据库升级占位层已拆分到 MigrationOverlay，不受刷新影响。
 */
export function SplashOverlay({ ready }: SplashOverlayProps) {
  const phase = getSplashStore()((s) => s.phase);
  const setPhase = getSplashStore()((s) => s.setPhase);

  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const mountAtRef = useRef(Date.now());

  // logo：至少 LOGO_MS，且 init 就绪后开始淡出
  useEffect(() => {
    if (phase !== 'logo' || !ready) return;
    const until = mountAtRef.current + LOGO_MS;
    const delay = Math.max(0, until - Date.now());
    const t = setTimeout(() => setLeaving(true), delay);
    return () => clearTimeout(t);
  }, [phase, ready]);

  // leaving → 淡出 → 卸载
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => { setGone(true); setPhase('done'); }, FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [leaving, setPhase]);

  if (gone) return null;

  return (
    <div className="fixed inset-0 z-[999] select-none">
      {/* 欢迎页（logo）layer */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0f19] transition-opacity duration-300"
        style={{ opacity: leaving ? 0 : 1 }}
      >
        <img
          src="/logo.png"
          alt="logo"
          draggable={false}
          className="h-28 w-28 rounded-2xl object-cover shadow-2xl"
        />
        <div className="mt-4 text-lg font-bold tracking-wide text-white/90">OpenReel</div>
      </div>
    </div>
  );
}
