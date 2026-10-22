import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useThemeColors, useThemeStore, hexToRgba, radius } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { tv } from '../theme/tokens';

export interface TVButtonProps {
  id?: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** 焦点时是否放大（默认否，避免密集按钮跳动） */
  scaleOnFocus?: boolean;
  focused?: boolean;
  style?: any;
  testID?: string;
  /**
   * 以下均为可选扩展（默认不传时与旧行为完全一致），用于让某些页面的按钮
   * 与移动端 `components/ui/Button` 完全对齐（如视频源管理页的源卡片）。
   */
  /** 左侧图标（如 lucide 图标节点） */
  leftIcon?: React.ReactNode;
  /** 第二行小字（如采集时间），居中显示在标题下方 */
  sublabel?: string;
  /** 覆盖标题文字颜色（默认按 variant 取色） */
  labelColor?: string;
  /** 覆盖第二行文字颜色（默认 mutedForeground） */
  sublabelColor?: string;
  /** 覆盖标题字号（默认 tv(18)） */
  labelFontSize?: number;
  /** 覆盖第二行字号（默认 tv(14)） */
  sublabelFontSize?: number;
  /** 追加到标题 Text 的样式 */
  labelStyle?: any;
  /** 钉死「向下」焦点目标（registry id），透传到 TVFocusable */
  nextFocusDownId?: string;
  /** 钉死「向上」焦点目标（registry id），透传到 TVFocusable */
  nextFocusUpId?: string;
}

/**
 * TV 端按钮。
 *
 * 电视上按钮需要比手机端更大更「重」：内边距、字号都放大一档；
 * 焦点态用主题高亮色底 + 黑色文字，保证遥控操作时的选中态足够醒目。
 */
export function TVButton({
  id,
  label,
  onPress,
  disabled,
  variant = 'secondary',
  scaleOnFocus = false,
  style,
  testID,
  leftIcon,
  sublabel,
  labelColor,
  sublabelColor,
  labelFontSize,
  sublabelFontSize,
  labelStyle,
  nextFocusDownId,
  nextFocusUpId,
}: TVButtonProps) {
  const colors = useThemeColors();
  // 按钮底遵循「卡片透明度」，与移动端 ui/Button 一致（移动端也乘 cardOpacity）
  const cardOpacity = useThemeStore((s) => s.cardOpacity);

  const bg =
    variant === 'primary'
      ? hexToRgba(colors.buttonPrimaryBg, cardOpacity / 100)
      : variant === 'danger'
        ? hexToRgba(colors.error, cardOpacity / 100 * 0.15)
        : variant === 'ghost'
          ? 'transparent'
          : hexToRgba(colors.surface, cardOpacity / 100);
  const fg =
    variant === 'primary'
      ? colors.buttonPrimaryText
      : variant === 'danger'
        ? colors.error
        : colors.foreground;

  return (
    <TVFocusable
      id={id}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      focusStyle={scaleOnFocus ? styles.focusScale : undefined}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}
      nextFocusDownId={nextFocusDownId}
      nextFocusUpId={nextFocusUpId}
    >
      <View style={styles.inner}>
        {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
        <View style={styles.labels}>
          <Text
            style={[
              styles.text,
              { color: labelColor ?? fg },
              labelFontSize !== undefined ? { fontSize: labelFontSize } : null,
              labelStyle,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {sublabel ? (
            <Text
              style={[
                styles.sublabel,
                { color: sublabelColor ?? colors.mutedForeground },
                sublabelFontSize !== undefined ? { fontSize: sublabelFontSize } : null,
              ]}
              numberOfLines={1}
            >
              {sublabel}
            </Text>
          ) : null}
        </View>
      </View>
    </TVFocusable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: tv(26),
    paddingVertical: tv(12),
    borderRadius: radius.md,
    marginRight: tv(14),
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labels: {
    alignItems: 'center',
  },
  text: {
    fontSize: tv(18),
    fontWeight: '600',
  },
  sublabel: {
    fontSize: tv(14),
    marginTop: 2,
  },
  focusScale: {
    transform: [{ scale: 1.06 }],
  },
});

export default TVButton;