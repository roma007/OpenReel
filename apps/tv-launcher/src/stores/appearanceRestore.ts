import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '@openreel/expo-ui';

/**
 * TV 端外观设置的持久化恢复。
 *
 * 为什么 TV 要自己读、不复用 `@openreel/expo-ui` 的 init*：
 * 1. 共享 store 的 `loadCardOpacityFromStorage()` 下限写死 10，会**拒掉 TV 允许的 0%**；
 * 2. 共享 store 的 `loadImageScaleFromStorage()` 用 `parseInt`，会把 TV 允许的 **1.5 截成 1**。
 * 共享包同时被移动端/桌面端消费，不允许为 TV 修改，因此在 TV 侧按 TV 自身的取值范围精确恢复。
 *
 * 说明：存储 key 必须与共享 store（packages/expo-ui/src/themes/store.ts）保持一致；
 * 若共享侧改了 key，这里要同步改。
 */
const KEY = {
  cardOpacity: 'movie-app-card-opacity',
  imageScale: 'movie-app-image-scale',
  imageBlur: 'movie-app-image-blur',
  blurIntensity: 'movie-app-blur-intensity',
} as const;

async function readNumber(
  key: string,
  min: number,
  max: number,
  integer: boolean,
): Promise<number | null> {
  try {
    const saved = await AsyncStorage.getItem(key);
    if (saved === null) return null;
    const v = integer ? parseInt(saved, 10) : parseFloat(saved);
    if (Number.isFinite(v) && v >= min && v <= max) return v;
  } catch {}
  return null;
}

/**
 * 恢复 TV 外观设置的 4 个数值项。读取失败/越界/无记录时保持 store 默认值不动。
 * 取值范围与 TV「外观设置」页的选项一致（卡片透明度 0–100，背景图缩放 1–50 且允许小数）。
 */
export async function restoreTvAppearanceSettings(): Promise<void> {
  const { setCardOpacity, setImageScale, setImageBlur, setBlurIntensity } = useThemeStore.getState();
  const [cardOpacity, imageScale, imageBlur, blurIntensity] = await Promise.all([
    readNumber(KEY.cardOpacity, 0, 100, true),
    readNumber(KEY.imageScale, 1, 50, false),
    readNumber(KEY.imageBlur, 0, 100, true),
    readNumber(KEY.blurIntensity, 0, 100, true),
  ]);
  if (cardOpacity !== null) setCardOpacity(cardOpacity);
  if (imageScale !== null) setImageScale(imageScale);
  if (imageBlur !== null) setImageBlur(imageBlur);
  if (blurIntensity !== null) setBlurIntensity(blurIntensity);
}
