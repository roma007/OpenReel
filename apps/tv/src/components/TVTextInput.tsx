import React, { useCallback, useState } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { TVKeypad, type TVKeypadMode } from './TVKeypad';
import { tv } from '../theme/tokens';

export interface TVTextInputProps {
  /** 稳定 id：横向列表/几何兜底依赖它，必须传 */
  id: string;
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  mode?: TVKeypadMode;
  maxLength?: number;
  /** 密码态：只显示圆点，仍走键盘输入（不经过明文 TextInput） */
  secure?: boolean;
  multiline?: boolean;
  hint?: string;
  /** 外层容器样式（如嵌在顶栏里需去掉下边距） */
  containerStyle?: StyleProp<ViewStyle>;
  /** 字段本体样式 */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * TV 端文本输入字段。
 *
 * 手机端直接用 TextInput + 软键盘；TV 端改为「可聚焦字段 + 应用内键盘面板」，
 * 保证任何 ATV 设备（不一定带可遥控 IME）都能用方向键完成输入。
 * 键盘面板由 TVKeypad 承担（含剪贴板粘贴 / 系统键盘补充通道 / BACK 优先关闭）。
 */
export function TVTextInput({
  id,
  label,
  value,
  onChangeText,
  placeholder,
  mode = 'alnum',
  maxLength,
  secure,
  multiline,
  hint,
  containerStyle,
  style,
  testID,
}: TVTextInputProps) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const openKeypad = useCallback(() => {
    setDraft(value);
    setOpen(true);
  }, [value]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const submit = useCallback(
    (v: string) => {
      onChangeText(v);
      setOpen(false);
    },
    [onChangeText],
  );

  const display = value ? (secure ? '•'.repeat(value.length) : value) : '';
  const shown = open ? draft : display;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TVFocusable
        id={id}
        onPress={openKeypad}
        style={[
          styles.field,
          { backgroundColor: colors.input, borderColor: open ? colors.borderHighlight : colors.border },
          style,
        ]}
        testID={testID ?? `tv-input-${id}`}
      >
        <View style={styles.row}>
          {label ? (
            <Text style={[styles.label, { color: colors.foreground, fontSize: scale(17) }]}>{label}</Text>
          ) : null}
          <Text
            numberOfLines={multiline ? 3 : 1}
            style={[
              styles.value,
              {
                color: shown ? colors.foreground : colors.disabledForeground,
                fontSize: scale(17),
              },
            ]}
          >
            {shown || placeholder || '（未填写）按 OK 用键盘输入'}
          </Text>
        </View>
      </TVFocusable>

      <TVKeypad
        visible={open}
        title={label ? `输入${label}` : '输入内容'}
        value={draft}
        mode={mode}
        maxLength={maxLength}
        multiline={multiline}
        hint={hint}
        onChange={setDraft}
        onSubmit={submit}
        onCancel={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: tv(12) },
  field: { borderWidth: 1, borderRadius: tv(10), paddingHorizontal: tv(16), paddingVertical: tv(11) },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { width: tv(190), fontWeight: '600' },
  value: { flex: 1 },
});

export default TVTextInput;