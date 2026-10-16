import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useThemeStore, useThemeColors, useScaledFontSize, hexToRgba, radius } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVSelectRow } from '../components/TVSelectRow';
import { focusRegistry } from '../focus/registry';
import { tv } from '../theme/tokens';

/**
 * TV 外观设置。
 *
 * 页面骨架对齐移动端 AppearanceSettingsScreen：居中标题 + 分组卡片
 * （颜色模式 / 背景 / 字体大小），卡片底遵循「卡片透明度」（hexToRgba(colors.card, cardOpacity/100)）。
 * 「具体选项」保留 TV 遥控形态（左右切换 chips，见 TVSelectRow 注释）——
 * 即：除具体选项外，其余（页头、卡片、分组、间距、配色、字体层级）与移动端一致。
 */
const FONT_SIZES = [
  { value: 0.85, label: '小' },
  { value: 1.0, label: '默认' },
  { value: 1.15, label: '大' },
  { value: 1.3, label: '特大' },
];

export function AppearanceSettingsScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const colorMode = useThemeStore((s) => s.colorMode);
  const setColorMode = useThemeStore((s) => s.setColorMode);
  const fontSizeScale = useThemeStore((s) => s.fontSizeScale);
  const setFontSizeScale = useThemeStore((s) => s.setFontSizeScale);
  const imageScale = useThemeStore((s) => s.imageScale);
  const setImageScale = useThemeStore((s) => s.setImageScale);
  const imageBlur = useThemeStore((s) => s.imageBlur);
  const setImageBlur = useThemeStore((s) => s.setImageBlur);
  const blurIntensity = useThemeStore((s) => s.blurIntensity);
  const setBlurIntensity = useThemeStore((s) => s.setBlurIntensity);
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const setCardOpacity = useThemeStore((s) => s.setCardOpacity);

  // 卡片底 = 卡片透明度，与移动端卡片一致
  const cardBg = hexToRgba(colors.card, cardOpacity / 100);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('appearance-back'), 120);
    return () => clearTimeout(t);
  }, []);

  const cardTitleStyle = [styles.cardTitle, { color: colors.text, fontSize: scale(15) }];

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="外观设置" backId="appearance-back" centerTitle />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 颜色模式 */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={cardTitleStyle}>颜色模式</Text>
          <TVSelectRow
            id="colorMode"
            hideLabel
            label="颜色模式"
            style={styles.cardRow}
            value={colorMode}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'dark', label: '深色模式' },
              { value: 'light', label: '浅色模式' },
            ]}
            onChange={(v) => setColorMode(v as any)}
          />
        </View>

        {/* 背景 */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={cardTitleStyle}>背景</Text>
          <TVSelectRow
            id="imageBlur"
            label="背景图模糊"
            style={styles.cardRow}
            value={imageBlur}
            options={[
              { value: 0, label: '无' },
              { value: 10, label: '弱' },
              { value: 20, label: '中' },
              { value: 40, label: '强' },
              { value: 60, label: '极强' },
            ]}
            onChange={(v) => setImageBlur(v)}
          />
          <TVSelectRow
            id="imageScale"
            label="背景图缩放"
            style={styles.cardRow}
            value={imageScale}
            options={[
              { value: 1, label: '1x' },
              { value: 1.5, label: '1.5x' },
              { value: 2, label: '2x' },
              { value: 3, label: '3x' },
            ]}
            onChange={(v) => setImageScale(v)}
          />
          <TVSelectRow
            id="blurIntensity"
            label="磨砂强度"
            style={styles.cardRow}
            value={blurIntensity}
            options={[
              { value: 0, label: '无' },
              { value: 20, label: '弱' },
              { value: 40, label: '中' },
              { value: 60, label: '较强' },
              { value: 80, label: '强' },
            ]}
            onChange={(v) => setBlurIntensity(v)}
          />
          <TVSelectRow
            id="cardOpacity"
            label="透明度"
            style={styles.cardRow}
            value={cardOpacity}
            options={[
              { value: 0, label: '0%' },
              { value: 10, label: '10%' },
              { value: 20, label: '20%' },
              { value: 30, label: '30%' },
              { value: 40, label: '40%' },
              { value: 50, label: '50%' },
              { value: 60, label: '60%' },
              { value: 70, label: '70%' },
              { value: 80, label: '80%' },
              { value: 90, label: '90%' },
              { value: 100, label: '100%' },
            ]}
            onChange={(v) => setCardOpacity(v)}
          />
        </View>

        {/* 字体大小 */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={cardTitleStyle}>字体大小</Text>
          <TVSelectRow
            id="fontSize"
            hideLabel
            label="字体大小"
            style={styles.cardRow}
            value={fontSizeScale}
            options={FONT_SIZES.map((item) => ({
              ...item,
              // 字号预览只乘该预设自身系数，不乘当前全局 scale：
              // 否则变更当前选中值时，四个选项标签会一起变大/变小（移动端不这样）。
              style: { fontSize: Math.round(18 * item.value) },
            }))}
            onChange={(v) => setFontSizeScale(v)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: tv(56), paddingTop: tv(15), paddingBottom: tv(44) },
  card: { borderRadius: tv(radius.lg), overflow: 'hidden', marginBottom: tv(20) },
  cardTitle: {
    fontWeight: '600',
    paddingHorizontal: tv(15),
    paddingTop: tv(15),
    paddingBottom: tv(10),
  },
  cardRow: { paddingHorizontal: tv(15) },
});

export default AppearanceSettingsScreen;
