import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { focusRegistry } from './registry';
import { useThemeColors } from '@openreel/expo-ui';
import { TV_FIXED } from '../theme/tokens';

/**
 * TV 可聚焦元素容器。
 *
 * 真实焦点来自 RN 原生 onFocus/onBlur（Android TV 上方向键由系统派发到 focusable 视图），
 * 本组件只做三件事：把焦点状态注册到 focusRegistry、提供焦点视觉、提供 measure 供几何兜底。
 *
 * 焦点视觉沿用现有主题 token（不另造视觉体系）：焦点时叠 3dp 主色描边，可选轻微放大；
 * 电视观看距离远，故焦点态对比度比手机端更强。
 */
export interface TVFocusableProps {
  /** 稳定 id：横向列表必须显式传，否则卸载重挂后几何兜底会选错目标 */
  id?: string;
  /** 所属横向行：同一 rowId 内左右移动不会跳到别的行 */
  rowId?: string;
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
}

let seq = 0;

export function TVFocusable({
  id,
  rowId,
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
}: TVFocusableProps) {
  const colors = useThemeColors();
  const nodeRef = useRef<React.ElementRef<typeof Pressable> | null>(null);
  const autoIdRef = useRef<string>(`tv-focus-auto-${(seq += 1)}`);
  const realId = id || autoIdRef.current;

  // 用 ref 承载回调，避免注册表持有过期闭包
  const handlersRef = useRef({ onFocus, onPress });
  handlersRef.current = { onFocus, onPress };

  const [isFocused, setIsFocused] = useState(false);

  const measure = useCallback(() => {
    nodeRef.current?.measureInWindow((x, y, width, height) => {
      if (typeof width === 'number' && width > 0) {
        focusRegistry.updateRect(realId, { x, y, width, height });
      }
    });
  }, [realId]);

  useEffect(() => {
    focusRegistry.register({
      id: realId,
      rowId,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      // 供 TVFocusBridge 主动补焦点（页面初始焦点 / 焦点丢失恢复）时调用原生 focus()
      getNode: () => nodeRef.current as any,
      onFocus: () => {
        setIsFocused(true);
        handlersRef.current.onFocus?.();
      },
    });
    focusRegistry.setDisabled(realId, !!disabled);
    return () => focusRegistry.unregister(realId);
  }, [realId, rowId, disabled]);

  // 订阅 registry：焦点因别处移动/元素被禁用而丢失时，同步本地态
  useEffect(
    () =>
      focusRegistry.subscribe(() => {
        setIsFocused(focusRegistry.isFocused(realId));
      }),
    [realId],
  );

  // 获得焦点后刷新矩形，供后续方向键几何兜底使用
  useEffect(() => {
    if (!isFocused) return;
    const t = setTimeout(measure, 0);
    return () => clearTimeout(t);
  }, [isFocused, measure]);

  const handleFocus = useCallback(() => {
    focusRegistry.handleFocus(realId);
    measure();
  }, [realId, measure]);

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
      onFocus={handleFocus}
      onBlur={handleBlur}
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