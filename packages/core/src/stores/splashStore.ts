import { create } from 'zustand';

export type SplashPhase = 'logo' | 'done';

interface SplashState {
  phase: SplashPhase;
  setPhase: (p: SplashPhase) => void;
  reset: () => void;
}

let _singleton: ReturnType<typeof createSplashStore> | null = null;

function createSplashStore() {
  return create<SplashState>((set) => ({
    phase: 'logo',
    setPhase: (p) => set({ phase: p }),
    reset: () => set({ phase: 'logo' }),
  }));
}

/**
 * 单例 splash store，供双端共享。
 * 移动端 Fast Refresh / 模块重执行时保持同一实例。
 */
export function getSplashStore() {
  if (!_singleton) {
    _singleton = createSplashStore();
  }
  return _singleton;
}
