import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useThemeStore, useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVSelectRow } from '../components/TVSelectRow';
import { focusRegistry } from '../focus/registry';
import { tv } from '../theme/tokens';

/**
 * TV 外观设置。
 * 对齐移动端的配置项：配色模式、字号（大小随选项值变化）、背景图模糊、背景图缩放、磨砂强度、卡片透明度。
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

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('appearance-back'), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="外观与主题" backId="appearance-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: tv(56) }]}
        showsVerticalScrollIndicator={false}
      >

        <TVSelectRow
          id="colorMode"
          label="配色模式"
          value={colorMode}
          options={[
            { value: 'system', label: '跟随系统' },
            { value: 'dark', label: '深色' },
            { value: 'light', label: '浅色' },
          ]}
          onChange={(v) => setColorMode(v as any)}
        />
        <TVSelectRow
          id="fontSize"
          label="字号"
          value={fontSizeScale}
          options={FONT_SIZES.map((item) => ({
            ...item,
            label: item.label,
            style: { fontSize: Math.round(scale(18) * item.value) },
          }))}
          onChange={(v) => setFontSizeScale(v)}
        />
        <TVSelectRow
          id="imageScale"
          label="背景图缩放"
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
          id="imageBlur"
          label="背景图模糊"
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
          id="blurIntensity"
          label="磨砂强度"
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
          label="卡片透明度"
          value={cardOpacity}
          options={[
            { value: 60, label: '60%' },
            { value: 70, label: '70%' },
            { value: 80, label: '80%' },
            { value: 90, label: '90%' },
            { value: 100, label: '100%' },
          ]}
          onChange={(v) => setCardOpacity(v)}
        />

        <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontSize: scale(24), fontWeight: '700' }}>
            预览示例
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: scale(18) * fontSizeScale, marginTop: tv(8) }}>
            这是电视端的正文显示效果，用于确认字号是否合适。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(10), paddingBottom: tv(44) },
  preview: {
    marginTop: tv(28),
    padding: tv(24),
    borderRadius: tv(10),
    borderWidth: 1,
  },
});

export default AppearanceSettingsScreen;