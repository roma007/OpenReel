import { Dimensions, PixelRatio } from 'react-native';

/**
 * TV 端版式 token。
 *
 * 依据（tvhome-tv 实测）：1920x1080 @ 320dpi → 逻辑分辨率 960×540 dp。
 * 电视观看距离约 2–3 米，1080p 下手机端版式（正文 13–15sp、行高紧贴）不可读，
 * 故 TV 端统一放大：正文 18sp 起、标题 20–28sp、卡片加大到 200×300dp。
 *
 * 全部数值以 960×540 为基准；若实机为 1080p（1920x1080@320dpi 之外的其他 TV 密度）
 * 用 scale() 做等比放大，避免小屏 TV 上溢出、大屏 TV 上留白过多。
 */
const BASE_W = 960;
const BASE_H = 540;

const { width, height } = Dimensions.get('window');

/** 等比缩放系数：以宽度为主，限制在 [0.85, 1.35]，避免极端密度下溢出或过小 */
export const TV_SCALE = Math.min(
  1.35,
  Math.max(0.85, Math.min(width / BASE_W, height / BASE_H)),
);

/** 版式尺度：所有间距/字号经此缩放 */
export function tv<T extends number>(v: T): T {
  return Math.round(v * TV_SCALE) as T;
}

/** 不随屏幕缩放的间距（焦点环等固定视觉） */
export const TV_FIXED = {
  focusRingWidth: 3,
  radius: 10,
} as const;

export const TV_LAYOUT = {
  /** 左右安全边距（电视 overscan 安全区） */
  paddingX: tv(56),
  paddingY: tv(28),
  /** 顶部焦点导航条高度 */
  navBarHeight: tv(64),
  /** 焦点环外扩，保证不被相邻卡片裁切 */
  focusMargin: tv(6),
} as const;

/** 海报卡片基准尺寸（2:3 海报） */
export const TV_CARD = {
  width: tv(200),
  height: tv(300),
  posterRatio: 0.75,
  gap: tv(20),
} as const;

/** 首屏大卡片（推荐位） */
export const TV_CARD_LARGE = {
  width: tv(300),
  height: tv(450),
  gap: tv(24),
} as const;

/** 剧集格（详情页选集，4:3 缩略） */
export const TV_EPISODE = {
  width: tv(230),
  height: tv(150),
  gap: tv(18),
} as const;

export const TV_SCREEN = { width, height } as const;

/** 是否为低分辨率（<1280 宽）电视：据此决定是否降级图片质量 */
export const TV_LOW_RES = width < 1280 || PixelRatio.get() < 2;