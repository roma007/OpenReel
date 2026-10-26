import { useEffect, useRef, useState } from 'react';
import { BackHandler, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize, hexToRgba } from '@openreel/expo-ui';

import { tv } from '../theme/tokens';

/** 双击返回退出窗口时长（业界惯例 2 秒，超时后重新提示而非退出） */
const EXIT_WINDOW_MS = 2000;

/**
 * TV 全局「再按一次退出」确认（业界通用双击返回退出惯例）：
 *  - 仅当返回键已无可退路由（栈底首页）时拦截；其余页面放行默认返回；
 *  - 第一次按返回 → 底部居中提示「再按一次退出应用」，同时开启 2 秒退出窗口；
 *  - 窗口内再按 → BackHandler.exitApp() 退出；
 *  - 超时后窗口关闭，再次按返回重新提示（不会误触退出）。
 *
 * 提示浮层与退出窗口严格同开同关，避免「提示还在但窗口已过期」的歧义。
 * 不抢焦点（pointerEvents="none"），与 TVToast 同级挂载于 RootNavigator。
 * 播放页/键盘等页面级 BackHandler 后注册先执行（返回 true 自行消化），不受影响。
 */
export function TVExitConfirm() {
  const navigation = useNavigation();
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const armedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // 有历史栈（详情/分类/设置等）→ 放行默认返回，不提示
      try {
        if (navigation.canGoBack && navigation.canGoBack()) {
          return false;
        }
      } catch {}
      const state = navigation.getState?.();
      if (state && typeof state.index === 'number' && state.index > 0) {
        return false;
      }

      if (armedRef.current) {
        try {
          BackHandler.exitApp();
        } catch {}
        return true;
      }
      armedRef.current = true;
      setVisible(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        armedRef.current = false;
        setVisible(false);
        timerRef.current = null;
      }, EXIT_WINDOW_MS);
      return true;
    });
    return () => {
      sub.remove();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [navigation]);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      opacity.setValue(0);
    }
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={styles.wrapper}>
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: colors.card,
            borderColor: hexToRgba(colors.mutedForeground, 0.4),
            opacity,
          },
        ]}
      >
        <Text style={{ color: colors.foreground, fontSize: scale(16) }}>再按一次退出应用</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: tv(56),
    alignItems: 'center',
  },
  container: {
    paddingHorizontal: tv(20),
    paddingVertical: tv(12),
    borderRadius: tv(10),
    borderWidth: 1,
  },
});

export default TVExitConfirm;
