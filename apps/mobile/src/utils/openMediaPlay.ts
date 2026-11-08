import { getProvider } from '../init';
import { resolveDefaultPlayTarget } from '@openreel/core';
import type { Media } from '@openreel/core';
import { showToast } from '../components/Toast';

/**
 * 播放来源上下文：决定播放页上下滑切换的行为。
 * - list/search/recommend：按 mediaIds 有序列表顺序切换，边界处随机（当前类型）。
 * - random：每次随机（当前类型）；无 mediaIds。
 */
export interface PlayContext {
  type: 'list' | 'search' | 'recommend' | 'random';
  mediaIds?: number[];
  currentIndex?: number;
}

/**
 * 播放目标解析在「未缓存」时要联网（1~4s）。短于 600ms 的解析（命中缓存）不打扰用户，
 * 超过则显示一次「正在获取播放地址」。
 */
async function withPendingHint<T>(run: () => Promise<T>): Promise<T> {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) showToast('正在获取播放地址…', 'info');
  }, 600);
  try {
    return await run();
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}

/**
 * 点击卡片后直接进播放页：解析默认播放目标（续播/首集 + 首个线路），
 * 解析失败则回退到详情页。
 * ctx：来源列表上下文（分类/搜索/推荐按序切换；首页等不传则随机）。
 */
export async function openMediaPlay(
  navigation: any,
  media: Media,
  ctx?: PlayContext,
): Promise<void> {
  try {
    const provider = getProvider();
    // 索引采集模式下首点需联网拉取播放地址（1~4s），先给出「正在获取」提示，
    // 否则用户会以为卡片点不动。
    const target = await withPendingHint(() => resolveDefaultPlayTarget(provider, media));
    if (target) {
      navigation.navigate('Play', {
        episodeId: target.episodeId,
        mediaId: media.id,
        sourceId: target.sourceId,
        playSourceId: target.playSourceId ?? null,
        title: media.title,
        playContext: ctx ?? null,
      });
      return;
    }
    // 解析不到可播放线路必须给出反馈，否则点击卡片「毫无反应」
    showToast('无法获取播放地址，请检查网络或稍后重试', 'error');
  } catch (err) {
    console.warn('[openMediaPlay] 解析播放目标失败:', err);
    showToast('打开失败，请检查网络后重试', 'error');
  }
}