/**
 * 本次页面加载是否为「刷新」（reload）。
 *
 * 判据取浏览器标准导航类型（Navigation Timing）：
 * - 'navigate'     全新加载（应用冷启动）→ 属于启动序列，播欢迎页 + 广告
 * - 'reload'       location.reload() / 右键刷新 → 属页面级操作，与启动序列无关
 * - 'back_forward' 历史前进后退恢复 → 同上，非启动
 *
 * 旧版 WebKit 无 PerformanceNavigationTiming 时，回退已废弃的
 * performance.navigation.type（1 = TYPE_RELOAD）。两者都取不到时按冷启动处理，
 * 保持原有行为不变。
 */
export function isReloadNavigation(): boolean {
  try {
    const entry = performance.getEntriesByType?.('navigation')?.[0] as { type?: string } | undefined;
    if (entry?.type) return entry.type === 'reload';
  } catch {
    /* ignore */
  }
  const legacy = (performance as { navigation?: { type?: number } }).navigation;
  if (typeof legacy?.type === 'number') return legacy.type === 1;
  return false;
}
