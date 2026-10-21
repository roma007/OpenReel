import { getStore } from './init';
import type { AppState } from '@openreel/core';

/**
 * Zustand store hook（TV 端）。
 * 支持两种用法：
 *   const { mediaList } = useAppStore();              // 返回整个 state
 *   const mediaList = useAppStore(s => s.mediaList);  // 选择器订阅
 * 必须在 initApp() 完成后使用（App.tsx 已确保）。
 * 与手机端 apps/mobile/src/useAppStore.ts 同语义，只是绑定 TV 自己的 store 单例。
 */
export function useAppStore<T = AppState>(selector?: (state: AppState) => T): T {
  const store = getStore();
  return selector ? store(selector) : (store as unknown as () => T)();
}

export { getStore, getCollector, getProvider, initApp } from './init';