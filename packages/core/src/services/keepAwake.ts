/**
 * 采集期保活（跨端统一接口）。
 *
 * 背景：全量采集是长任务（6 源 63 万条，即使做了「一页一请求 + 跨页并发」也要小时级）。
 * 移动端/TV 端锁屏后进程会被系统回收，导致采集中断。这里提供一套与平台无关的
 * 「保活开关」，由各端在初始化时注册具体实现：
 *   - mobile / tv / tv-launcher：expo-keep-awake（保持屏幕常亮）
 *   - desktop：不注册（不需要）
 *
 * 采集入口统一用 `beginCollectKeepAwake()` / `endCollectKeepAwake()` 成对包裹，
 * 内部计数支持并发采集（collectLatest 多源并行、自动续采顺序执行），
 * 只有「从 0 个采集变成有采集」和「最后一个采集结束」时才真正切换平台保活。
 */
type KeepAwakeHandler = (active: boolean) => void;

let handler: KeepAwakeHandler | null = null;
let activeCount = 0;

/** 注册平台保活实现（各端 init 时调用一次） */
export function setCollectKeepAwakeHandler(next: KeepAwakeHandler | null): void {
  handler = next;
  // 若注册时已有采集在跑（如热更新重注册），立即同步一次当前状态
  if (handler && activeCount > 0) {
    try {
      handler(true);
    } catch {
      /* 保活失败不影响采集 */
    }
  }
}

/** 开始一次采集（计数 +1，首个采集触发平台保活） */
export function beginCollectKeepAwake(): void {
  activeCount++;
  if (activeCount === 1 && handler) {
    try {
      handler(true);
    } catch {
      /* 保活失败不影响采集 */
    }
  }
}

/** 结束一次采集（计数 -1，最后一个采集结束释放保活） */
export function endCollectKeepAwake(): void {
  if (activeCount > 0) activeCount--;
  if (activeCount === 0 && handler) {
    try {
      handler(false);
    } catch {
      /* 释放失败不影响采集 */
    }
  }
}

/** 当前是否有采集在跑（供诊断/UI 查询） */
export function isCollectKeepAwakeActive(): boolean {
  return activeCount > 0;
}
