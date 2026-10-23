import { create } from 'zustand';

/**
 * 版本更新状态 store：记录「是否存在可用新版本」，驱动入口红点与版本信息页两态。
 *
 * 使用模型（各端通用）：
 * 1. App 冷启动检查到新版本 → setPendingUpdate(version)。
 * 2. 只要 latestVersion 存在，入口即显示红点 + 「有新版」，版本信息页呈「有新版」态；
 *    进入页面查看不会清除（红点常亮直到升级完成或复查确认已是最新）。
 * 3. 复查确认已是最高版本 / 升级完成 → clear()。
 *
 * 注意：本 store 只维护内存状态，不做持久化。App 重启后冷启动检查会重新填充。
 */

export interface UpdateBadgeState {
  /** 检测到的最新版本号；null 表示当前没有已知新版本 */
  latestVersion: string | null;
  /** 是否有新版本（即 latestVersion !== null），驱动入口红点与「有新版」文案 */
  hasUpdate: boolean;
  /** 标记检测到新版本（启动检查 / 页面检查命中后调用） */
  setPendingUpdate: (version: string) => void;
  /** 清除（已升级或复查确认已是最新） */
  clear: () => void;
}

let _singleton: ReturnType<typeof createUpdateBadgeStore> | null = null;

function createUpdateBadgeStore() {
  return create<UpdateBadgeState>((set) => ({
    latestVersion: null,
    hasUpdate: false,
    setPendingUpdate: (version) => set({ latestVersion: version, hasUpdate: true }),
    clear: () => set({ latestVersion: null, hasUpdate: false }),
  }));
}

/** 单例 update badge store，供各端共享（Fast Refresh 安全） */
export function getUpdateBadgeStore() {
  if (!_singleton) {
    _singleton = createUpdateBadgeStore();
  }
  return _singleton;
}
