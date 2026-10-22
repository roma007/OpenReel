import { create } from 'zustand';

/**
 * 版本更新红点 store：管理「有新版本」的可提醒状态。
 *
 * 使用模型（各端通用）：
 * 1. App 冷启动后调用端调用 setPendingUpdate(version) 标记有新版本
 *    → 设置页/版本更新入口红点 + 弱提醒各端自行实现（toast/banner）。
 * 2. 用户进入版本更新页查看详情后，调用端调用 markSeen(version)
 *    → 该版本不再视为「未读」，红点消失。
 * 3. 检测到更高版本时重新 setPendingUpdate → 红点恢复。
 *
 * 注意：本 store 只维护「当前是否处于待更新状态」，不做持久化。
 * App 重启后冷启动检查会再次调 setPendingUpdate，红点逻辑自然恢复。
 */

export interface UpdateBadgeState {
  /** 待更新的版本号（仅当 hasUpdate=true 时有意义） */
  pendingVersion: string | null;
  /** 是否处于「有新版本未查看」状态，驱动红点显示 */
  hasUpdate: boolean;
  /** 标记有新版本（启动检查后调用） */
  setPendingUpdate: (version: string) => void;
  /** 用户已查看该版本详情（进入版本更新页调用） */
  markSeen: () => void;
  /** 清除（已升级或主动重置） */
  clear: () => void;
}

let _singleton: ReturnType<typeof createUpdateBadgeStore> | null = null;

function createUpdateBadgeStore() {
  return create<UpdateBadgeState>((set) => ({
    pendingVersion: null,
    hasUpdate: false,
    setPendingUpdate: (version) => set({ pendingVersion: version, hasUpdate: true }),
    markSeen: () => set({ hasUpdate: false }),
    clear: () => set({ pendingVersion: null, hasUpdate: false }),
  }));
}

/** 单例 update badge store，供双端共享（Fast Refresh 安全） */
export function getUpdateBadgeStore() {
  if (!_singleton) {
    _singleton = createUpdateBadgeStore();
  }
  return _singleton;
}
