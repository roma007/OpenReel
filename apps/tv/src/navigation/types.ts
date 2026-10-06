import type { MediaNavState } from '@openreel/core';

/**
 * TV 端路由表。
 *
 * 与手机端差异：
 *  - 播放页用 modal 表现（电视上「全屏」即当前层）
 *  - 每页 state 均携带 MediaNavState，保证 BACK 返回时还原同一页码/筛选/搜索词
 *    （AGENTS「导航返回铁律」在 TV 端同样生效，且遥控 BACK 是主要返回手段）
 */
export type RootStackParamList = {
  Home: undefined;
  Category: {
    type?: string;
    title?: string;
  } & MediaNavState;
  Search: { keyword?: string } & MediaNavState;
  Detail: {
    mediaId: number;
    title?: string;
    /** 进入来源：分类页/子类型页/搜索结果/收藏/历史，返回时各自还原 */
    from?: 'home' | 'category' | 'search' | 'favorite' | 'history' | 'recommend';
  } & MediaNavState;
  Play: {
    mediaId: number;
    episodeId?: number;
    season?: number;
    sourceId?: string;
    startPosition?: number;
    title?: string;
  };
  Favorites: MediaNavState;
  History: { page?: number } & MediaNavState;
  Collect: undefined;
  CollectConfig: undefined;
  TaskList: undefined;
  SourceManager: undefined;
  AiSourceImport: undefined;
  VideoManagement: undefined;
  Settings: undefined;
  AppearanceSettings: undefined;
  UsagePreferences: undefined;
  RecommendationSettings: undefined;
  About: undefined;
  License: undefined;
  HelpCenter: undefined;
  CollectGuide: undefined;
  KidLock: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}