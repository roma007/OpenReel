import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useThemeStore, useThemeColors, useScaledFontSize, type ThemeId } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVSelectRow } from '../components/TVSelectRow';
import { focusRegistry } from '../focus/registry';
import { tv } from '../theme/tokens';

/**
 * TV 外观设置。
 *
 * 与手机端的差异：TV 端**不提供**毛玻璃强度/图片模糊/卡片透明度等项——
 * 这些是触摸端为弥补小屏质感而设，电视大屏不需要；仅保留主题与字号（遥控阅读距离需要）。
 */
const FONT_SIZES = [
  { value: 0.9, label: '小' },
  { value: 1.0, label: '标准' },
  { value: 1.15, label: '大' },
  { value: 1.3, label: '特大' },
];

export function AppearanceSettingsScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const currentTheme = useThemeStore((s) => s.currentTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const colorMode = useThemeStore((s) => s.colorMode);
  const setColorMode = useThemeStore((s) => s.setColorMode);
  const fontSizeScale = useThemeStore((s) => s.fontSizeScale);
  const setFontSizeScale = useThemeStore((s) => s.setFontSizeScale);
  const imageScale = useThemeStore((s) => s.imageScale);
  const setImageScale = useThemeStore((s) => s.setImageScale);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('appearance-back'), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="外观与主题" backId="appearance-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: tv(56) }]}
        showsVerticalScrollIndicator={false}
      >
        <TVSelectRow<ThemeId>
          id="theme"
          label="主题"
          value={currentTheme}
          options={[
            { value: 'dark', label: '暗夜黑' },
            { value: 'light', label: '晨曦白' },
          ]}
          onChange={(v) => setTheme(v)}
        />
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
          options={FONT_SIZES}
          onChange={(v) => setFontSizeScale(v)}
        />
        <TVSelectRow
          id="imageScale"
          label="图片质量"
          value={imageScale}
          options={[
            { value: 0.9, label: '流畅' },
            { value: 1, label: '标准' },
            { value: 1.1, label: '高清' },
          ]}
          onChange={(v) => setImageScale(v)}
        />

        <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontSize: scale(24), fontWeight: '700' }}>
            预览示例
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: scale(18), marginTop: tv(8) }}>
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