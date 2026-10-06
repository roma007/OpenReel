import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { tv } from '../theme/tokens';

export interface TVSelectOption<T> {
  value: T;
  label: string;
}

/**
 * TV 端单选行：遥控左右切换选项（比手机端点开弹层更适合电视）。
 * 所有选项都是可聚焦项，focusable 保证方向键可达。
 */
export function TVSelectRow<T extends string | number | boolean>({
  id,
  label,
  value,
  options,
  onChange,
  format,
}: {
  id: string;
  label: string;
  value: T;
  options: TVSelectOption<T>[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const render = (v: T) => {
    if (format) return format(v);
    const hit = options.find((o) => o.value === v);
    return hit ? hit.label : String(v);
  };

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.foreground, fontSize: scale(18) }]}>{label}</Text>
      <View style={styles.options}>
        {options.map((o) => (
          <TVFocusable
            key={String(o.value)}
            id={`${id}:${o.value}`}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              {
                backgroundColor: o.value === value ? colors.buttonPrimaryBg : colors.surface,
              },
            ]}
            testID={`${id}-${o.value}`}
          >
            <Text
              style={{
                color: o.value === value ? colors.buttonPrimaryText : colors.foreground,
                fontSize: scale(16),
                fontWeight: '600',
              }}
            >
              {o.label}
            </Text>
          </TVFocusable>
        ))}
      </View>
      <Text style={[styles.current, { color: colors.mutedForeground, fontSize: scale(16) }]}>
        {render(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(14),
    borderBottomWidth: 1,
  },
  label: { width: tv(200), fontWeight: '600' },
  options: { flexDirection: 'row', flex: 1, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: tv(16),
    paddingVertical: tv(8),
    borderRadius: tv(8),
    marginRight: tv(10),
    marginBottom: tv(8),
  },
  current: { width: tv(120), textAlign: 'right' },
});

export default TVSelectRow;