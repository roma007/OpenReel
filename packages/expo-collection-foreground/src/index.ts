/**
 * 采集期前台服务（Android 专用，iOS/桌面为 no-op）。
 *
 * 用途：全量采集是小时级任务，移动端/TV 锁屏后进程会被系统回收。挂一个前台服务 +
 * 常驻通知可以显著降低被回收概率（Android 前台服务优先级远高于普通后台进程）。
 *
 * 注意：前台服务只是「降低被杀概率」，不是绝对保活；被系统回收后仍由
 * `recoverInterruptedTasks` + `autoResumeCollectTasks` 断点续采兜底。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeCollectionForeground = {
  start(title?: string, text?: string): boolean;
  stop(): boolean;
};

const nativeModule = requireOptionalNativeModule<NativeCollectionForeground>('ExpoCollectionForeground');

/** 开启采集期前台服务（重复调用安全） */
export function startCollectionForeground(title?: string, text?: string): void {
  try {
    nativeModule?.start(title, text);
  } catch {
    /* 前台服务失败不影响采集 */
  }
}

/** 结束采集期前台服务 */
export function stopCollectionForeground(): void {
  try {
    nativeModule?.stop();
  } catch {
    /* 同上 */
  }
}

/** 当前平台是否支持前台服务（仅 Android） */
export function isCollectionForegroundSupported(): boolean {
  return nativeModule != null;
}
