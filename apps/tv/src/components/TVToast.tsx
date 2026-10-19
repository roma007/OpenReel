import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { CheckCircle, XCircle, Info } from 'lucide-react-native';
import { useThemeColors, useScaledFontSize, hexToRgba } from '@openreel/expo-ui';

import { tv } from '../theme/tokens';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  message: string;
  type: ToastType;
}

/** 成功 2.5s、错误 3.5s、提示（含"再按一次确认"类）3.5s —— 与确认窗 3 秒对齐并略宽 */
const DURATION: Record<ToastType, number> = {
  success: 2500,
  error: 3500,
  info: 3500,
};

let globalToastFn: ((message: string, type?: ToastType) => void) | null = null;

/**
 * TV 全局 Toast。模块级 API，任意位置 `showTVToast('msg', 'error')` 即可。
 *
 * 与移动端 Toast 的差异：
 *  - 位置：顶部**靠右**（TV 屏幕大，顶部居中会遮挡内容标题；右上对齐桌面端心智）
 *  - 动画：从右侧滑入 + 淡入（对齐位置方向），不使用弹性
 *  - 不抢焦点：纯展示 View，不用 TVFocusable（页底 msgBox 时代的「按 OK 关闭」已废弃）
 *  - 新 Toast 覆盖旧 Toast（重置计时），与移动端/桌面端行为一致
 *  - 挂载：App.tsx 根部与 CollectProgressDialog 同级挂一次
 */
export function showTVToast(message: string, type: ToastType = 'success') {
  globalToastFn?.(message, type);
}

export function TVToast() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(40)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: 'absolute',
          top: tv(70),
          right: tv(24),
          maxWidth: tv(520),
          flexDirection: 'row',
          alignItems: 'center',
          gap: tv(10),
          paddingHorizontal: tv(18),
          paddingVertical: tv(12),
          borderRadius: tv(10),
          borderWidth: 1,
          zIndex: 9999,
          elevation: 9999,
        },
        text: {
          fontWeight: '500',
          flexShrink: 1,
        },
      }),
    [],
  );

  useEffect(() => {
    globalToastFn = (message: string, type: ToastType = 'success') => {
      setToast({ message, type });
    };
    return () => {
      globalToastFn = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    opacity.setValue(0);
    translateX.setValue(40);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 40, duration: 200, useNativeDriver: true }),
      ]).start(() => setToast(null));
      timerRef.current = null;
    }, DURATION[toast.type]);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toast, opacity, translateX]);

  if (!toast) return null;

  const accent =
    toast.type === 'success'
      ? colors.success
      : toast.type === 'error'
        ? colors.error
        : colors.mutedForeground;
  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: hexToRgba(accent, 0.4),
          opacity,
          transform: [{ translateX }],
        },
      ]}
    >
      <Icon size={tv(18)} color={accent} />
      <Text style={[styles.text, { color: colors.foreground, fontSize: scale(16) }]} numberOfLines={2}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

export default TVToast;
