import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { focusRegistry } from './registry';
import { useThemeColors } from '@openreel/expo-ui';
import { TV_FIXED } from '../theme/tokens';

/**
 * TV 可聚焦元素容器。
 *
 * 真实焦点来自 RN 原生 onFocus/onBlur（Android TV 上方向键由系统派发到 focusable 视图），
 * 本组件只做两件事：把焦点状态注册到 focusRegistry、提供焦点视觉。
 *
 * 焦点视觉沿用现有主题 token（不另造视觉体系）：焦点时叠 3dp 主色描边，可选轻微放大；
 * 电视观看距离远，故焦点态对比度比手机端更强。
 */
export interface TVFocusableProps {
  /** 稳定 id：焦点恢复（TVFocusBridge）据此定位目标 */
  id?: string;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** 获得焦点时回调（横向行据此把目标滚动到可视区） */
  onFocus?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 焦点态附加样式（如卡片放大） */
  focusStyle?: StyleProp<ViewStyle>;
  /** 焦点环颜色，默认主色 */
  focusColor?: string;
  showFocusRing?: boolean;
  hitSlop?: number;
  testID?: string;
  /**
   * 原生按键事件（RN `enableKeyEvents` 打开后可用）。
   * 事件只在**该元素获得原生焦点**时派发（target = 聚焦视图），`nativeEvent.code`
   * 形如 `ArrowLeft`/`ArrowRight`/`Enter`。注意：JS 收到事件**不能消费按键**，
   * 原生焦点移动仍会发生 —— 故仅用于「左/右无横向邻居」的播放区做快进快退。
   */
  onKeyDown?: (e: any) => void;
  /**
   * 透传到 Pressable 的 onLayout。
   *
   * TVRow 用它记录卡片在「ScrollView 内容容器」坐标系里的 x —— 必须挂在
   * Pressable（内容容器的直接子节点）上，`layout.x` 才是相对内容的真实偏移；
   * 若挂在卡片内层 View 上，x 恒为 0，会导致横向滚动跟随失效。
   */
  onLayout?: (e: LayoutChangeEvent) => void;
}

let seq = 0;

export function TVFocusable({
  id,
  disabled,
  onPress,
  onLongPress,
  onFocus,
  children,
  style,
  focusStyle,
  focusColor,
  showFocusRing = true,
  hitSlop,
  testID,
  onLayout,
  onKeyDown,
}: TVFocusableProps) {
  const colors = useThemeColors();
  const nodeRef = useRef<React.ElementRef<typeof Pressable> | null>(null);
  const autoIdRef = useRef<string>(`tv-focus-auto-${(seq += 1)}`);
  const realId = id || autoIdRef.current;

  // 用 ref 承载回调，避免注册表持有过期闭包
  const handlersRef = useRef({ onFocus, onPress });
  handlersRef.current = { onFocus, onPress };

  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    focusRegistry.register({
      id: realId,
      // 供 TVFocusBridge 主动补焦点（页面初始焦点 / 焦点丢失恢复）时调用原生 focus()
      getNode: () => nodeRef.current as any,
      onFocus: () => {
        setIsFocused(true);
        handlersRef.current.onFocus?.();
      },
    });
    focusRegistry.setDisabled(realId, !!disabled);
    return () => focusRegistry.unregister(realId);
  }, [realId, disabled]);

  // 订阅 registry：焦点因别处移动/元素被禁用而丢失时，同步本地态
  useEffect(
    () =>
      focusRegistry.subscribe(() => {
        setIsFocused(focusRegistry.isFocused(realId));
      }),
    [realId],
  );

  const handleFocus = useCallback(() => {
    focusRegistry.handleFocus(realId);
  }, [realId]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    focusRegistry.handleBlur(realId);
  }, [realId]);

  const ring =
    showFocusRing && isFocused
      ? {
          borderWidth: TV_FIXED.focusRingWidth,
          // 主题无 primary token，沿用现有高亮语义色 cardAccent（与手机端卡片语言一致）
          borderColor: focusColor || colors.buttonPrimaryBg,
          borderRadius: TV_FIXED.radius,
        }
      : null;

  return (
    <Pressable
      testID={testID}
      ref={nodeRef as any}
      // Android TV：focusable 声明该节点可被方向键聚焦
      focusable={!disabled}
      onLayout={onLayout}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...(onKeyDown ? ({ onKeyDown } as any) : null)}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        style,
        isFocused ? focusStyle : null,
        ring,
      ]}
    >
      {children}
    </Pressable>
  );
}

export default TVFocusable;