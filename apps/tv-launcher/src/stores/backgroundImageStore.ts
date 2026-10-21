import { create } from 'zustand';

/**
 * 全局背景图 URL。
 *
 * 参考移动端：有内容海报的页面（首页/分类/搜索/详情/播放）在获得焦点时，
 * 把当前内容的海报 URL 写入本 store，根部 BlurredBackground 读取并作为背景图渲染；
 * 页面失焦时清空，回落到默认背景图。
 */
interface BackgroundImageState {
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;
}

export const useBackgroundImageStore = create<BackgroundImageState>((set) => ({
  imageUrl: null,
  setImageUrl: (url) => set({ imageUrl: url }),
}));
