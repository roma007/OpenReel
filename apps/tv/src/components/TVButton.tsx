import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useThemeColors, radius } from '@openreel/expo-ui';
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
}: TVButtonProps) {
  const colors = useThemeColors();

  const bg =
    variant === 'primary'
      ? colors.buttonPrimaryBg
      : variant === 'danger'
        ? colors.buttonDestructiveBg
        : variant === 'ghost'
          ? 'transparent'
          : colors.surface;
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
      focusColor={variant === 'ghost' ? colors.cardAccent : undefined}
    >
      <View style={styles.inner}>
        <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: tv(18),
    fontWeight: '600',
  },
  focusScale: {
    transform: [{ scale: 1.06 }],
  },
});

export default TVButton;