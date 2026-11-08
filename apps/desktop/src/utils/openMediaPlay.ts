import { getProvider } from '../init';
import { resolveDefaultPlayTarget } from '@openreel/core';
import type { Media, MediaNavState } from '@openreel/core';

/**
 * 全局 toast 回调。openMediaPlay 是普通函数（不在 React 树内），
 * 由 Layout 的 ToastProvider 挂载时注册，用于「解析不到播放地址」时给出可见反馈。
 */
type ToastHandler = (message: string, type?: 'success' | 'error') => void;
let toastHandler: ToastHandler | null = null;

export function setPlayToastHandler(fn: ToastHandler | null): void {
  toastHandler = fn;
}

/**
 * 点击卡片后直接进入播放页：解析默认播放目标（续播/首集 + 首个线路）。
 * 详情页已移除，解析失败不再回退详情页。
 *
 * 索引采集模式下播放地址按需拉取（resolveDefaultPlayTarget 内部触发），
 * 首次点击需要等待网络，因此调用方通常在点击时置 loading 态。
 */
export async function openMediaPlay(
  navigate: (to: string, opts?: { state?: unknown; replace?: boolean }) => void,
  media: Media,
  navigateState?: MediaNavState,
  opts?: { replace?: boolean },
): Promise<void> {
  try {
    const provider = getProvider();
    const target = await resolveDefaultPlayTarget(provider, media);
    if (target) {
      const lineQuery = target.playSourceId ? `&line=${encodeURIComponent(target.playSourceId)}` : '';
      navigate(`/play/${target.episodeId}?sourceId=${encodeURIComponent(target.sourceId)}${lineQuery}`, {
        state: navigateState,
        replace: opts?.replace,
      });
      return;
    }
    // 解析不到可播放线路必须给出反馈，否则点击卡片「毫无反应」
    toastHandler?.('无法获取播放地址，请检查网络或稍后重试', 'error');
  } catch (err) {
    console.warn('[openMediaPlay] 解析播放目标失败:', err);
    toastHandler?.('打开失败，请检查网络后重试', 'error');
  }
}
