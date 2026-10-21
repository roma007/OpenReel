import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { TVButton } from './TVButton';
import { tv } from '../theme/tokens';

/**
 * TV 首屏 chip 上限。
 *
 * 移动端同类交互为 `CHIP_LIMIT = 200`（一次铺开 + 「显示全部」）；电视用遥控逐项遍历，
 * 200 个 chip 需按几十次方向键才能横穿，故收紧到 60（约 6–8 行），超出用「显示全部」展开。
 * 交互机制与移动端一致（多选 + 全选/反选/清空由调用方提供），仅首屏数量不同。
 */
export const TV_CHIP_LIMIT = 60;

export type TVChipTone = 'destructive' | 'warning' | 'warning-solid';

export interface TVChipMultiSelectProps {
  /** 焦点 id 前缀，最终 id 为 `${idPrefix}:${item}`（保证遥控遍历唯一） */
  idPrefix: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  /** 选中强调色语义：删除用 destructive（error），隐藏用 warning */
  tone?: TVChipTone;
  /** 首屏展示上限，默认 TV_CHIP_LIMIT */
  limit?: number;
  /** 无数据时文案 */
  emptyText?: string;
  /** 透传 testID 前缀，便于 UI 验收 */
  testIDPrefix?: string;
}

/**
 * TV 多选 chips（对齐移动端「子类型多选」交互：多选 + 折叠「显示全部」）。
 *
 * 与移动端 `GenreChip` 的视觉语义一致：
 *  - destructive：选中实底 error 强调；未选中 surface 底
 *  - warning / warning-solid：选中/未选中 warning 不同透明度底
 * 焦点态由 TVFocusable 统一处理（3dp 主色描边）。
 */
export function TVChipMultiSelect({
  idPrefix,
  items,
  selected,
  onToggle,
  tone = 'warning',
  limit = TV_CHIP_LIMIT,
  emptyText = '暂无数据',
  testIDPrefix,
}: TVChipMultiSelectProps) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  // chip 底遵循「卡片透明度」，与移动端按钮/选项底一致
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const [showAll, setShowAll] = useState(false);

  // 与移动端一致：同名项去重后再渲染（避免重复 key / 重复焦点 id）
  const unique = useMemo(() => [...new Set(items)], [items]);

  const accent = tone === 'destructive' ? colors.error : colors.warning;
  const shown = showAll ? unique : unique.slice(0, limit);

  /** 底/字色与移动端 GenreChip 三档 tone 对齐 */
  const chipColors = (on: boolean) => {
    if (on) return { bg: hexToRgba(accent, 0.35), fg: accent };
    if (tone === 'warning-solid') return { bg: hexToRgba(accent, 0.1), fg: accent };
    return { bg: hexToRgba(colors.surface, cardOpacity / 100), fg: colors.foreground };
  };

  if (unique.length === 0) {
    return (
      <Text style={{ color: colors.mutedForeground, fontSize: scale(15), marginBottom: tv(8) }}>
        {emptyText}
      </Text>
    );
  }

  return (
    <>
      <View style={styles.row}>
        {shown.map((item) => {
          const on = selected.includes(item);
          const { bg, fg } = chipColors(on);
          return (
            <TVFocusable
              key={item}
              id={`${idPrefix}:${item}`}
              onPress={() => onToggle(item)}
              style={[styles.chip, { backgroundColor: bg }]}
              testID={testIDPrefix ? `${testIDPrefix}-${item}` : undefined}
            >
              <Text style={[styles.chipText, { color: fg, fontSize: scale(16) }]}>{item}</Text>
            </TVFocusable>
          );
        })}
      </View>

      {unique.length > limit ? (
        <View style={styles.moreRow}>
          <TVButton
            id={`${idPrefix}-toggle-all`}
            label={showAll ? '收起' : `显示全部 (${unique.length})`}
            variant="ghost"
            onPress={() => setShowAll((v) => !v)}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tv(10), marginBottom: tv(8) },
  chip: { paddingHorizontal: tv(16), paddingVertical: tv(9), borderRadius: tv(8) },
  chipText: { fontWeight: '600' },
  moreRow: { flexDirection: 'row', marginBottom: tv(4) },
});

export default TVChipMultiSelect;
