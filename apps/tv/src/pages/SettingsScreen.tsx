import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';

import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TV_LAYOUT, tv } from '../theme/tokens';
import { useAppStore } from '../useAppStore';
import { showTVToast } from '../components/TVToast';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

interface Entry {
  key: string;
  label: string;
  route: keyof RootStackParamList;
  desc: string;
}

// 条目、顺序、文案、三组分组均对齐移动端 Sidebar（apps/mobile/src/components/Sidebar.tsx）；
// 移动端「测试采集」因 TV 端无对应页面暂不加入（用户 2026-10-16 确认）。
// desc 描述与遥控焦点为 TV 特色，保留。
const MAIN_ENTRIES: Entry[] = [
  { key: 'usage', label: '使用偏好', route: 'UsagePreferences', desc: '播放行为与默认设置' },
  { key: 'appearance', label: '外观设置', route: 'AppearanceSettings', desc: '颜色模式、字体大小、背景图设置、透明度' },
  { key: 'sources', label: '管理视频源', route: 'SourceManager', desc: '增删改查采集源' },
  { key: 'collectcfg', label: '采集配置', route: 'CollectConfig', desc: '采集范围与并发参数' },
  { key: 'tasklist', label: '采集任务', route: 'TaskList', desc: '查看采集进度与任务记录' },
  { key: 'video', label: '视频管理', route: 'VideoManagement', desc: '缓存占用、清理缓存、删除影片' },
  { key: 'recommend', label: '推荐偏好', route: 'RecommendationSettings', desc: '推荐依据与不感兴趣内容' },
  { key: 'kidlock', label: '儿童锁', route: 'KidLock', desc: '儿童模式与密码' },
];

const HELP_ENTRIES: Entry[] = [
  { key: 'help', label: '帮助中心', route: 'HelpCenter', desc: '常见问题与使用说明' },
  { key: 'about', label: '关于我们', route: 'About', desc: '版本信息' },
  { key: 'license', label: '版权声明', route: 'License', desc: '开源许可' },
];

/** TV 设置主页：三组卡片（对齐移动端 Sidebar 分组），所有项均为可聚焦行，遥控上下遍历 */
export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  // 卡片/行底遵循「卡片透明度」，与移动端 Sidebar 一致（hexToRgba(colors.card, cardOpacity/100)）
  const cardOpacity = useThemeStore((s) => s.cardOpacity);

  const clearHistory = useAppStore((s) => s.clearHistory);
  // 清除观看历史：3 秒内两次确认（沿用 HistoryScreen/VideoManagement 危险操作惯例，不弹 Alert）
  const [clearPending, setClearPending] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('settings-back'), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!clearPending) return;
    const t = setTimeout(() => setClearPending(false), 3000);
    return () => clearTimeout(t);
  }, [clearPending]);

  const handleClearHistory = async () => {
    if (clearBusy) return;
    if (!clearPending) {
      setClearPending(true);
      showTVToast('再按一次「清除观看历史」以确认清空（3秒内有效）', 'info');
      return;
    }
    setClearPending(false);
    setClearBusy(true);
    showTVToast('正在清除…', 'info');
    try {
      await clearHistory();
      showTVToast('已清除全部观看历史', 'success');
    } catch (e) {
      showTVToast(`清除失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setClearBusy(false);
    }
  };

  const cardBg = hexToRgba(colors.card, cardOpacity / 100);

  const renderRow = (e: Entry) => (
    <TVFocusable
      key={e.key}
      id={`settings:${e.key}`}
      onPress={() => nav.navigate(e.route as any)}
      style={styles.row}
      testID={`tv-settings-${e.key}`}
    >
      <View style={styles.rowMain}>
        <Text style={{ color: colors.foreground, fontSize: scale(19), fontWeight: '600' }}>
          {e.label}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: scale(15), marginTop: 3 }}>
          {e.desc}
        </Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: scale(22) }}>›</Text>
    </TVFocusable>
  );

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVFocusable
          id="settings-back"
          onPress={() => nav.goBack()}
          style={[styles.backBtn, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100) }]}
          testID="tv-settings-back"
        >
          <Text style={{ color: colors.foreground, fontSize: scale(17), fontWeight: '600' }}>返回</Text>
        </TVFocusable>
        <Text style={[styles.topTitle, { color: colors.foreground, fontSize: scale(23) }]}>设置</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 组1：功能（对齐移动端 Sidebar 首组） */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {MAIN_ENTRIES.map((e) => renderRow(e))}
          {/* 清除观看历史：动作项，非跳转 */}
          <TVFocusable
            id="settings:clear-history"
            onPress={handleClearHistory}
            style={styles.row}
            testID="tv-settings-clear-history"
          >
            <View style={styles.rowMain}>
              <Text
                style={{
                  color: clearPending ? colors.error : colors.foreground,
                  fontSize: scale(19),
                  fontWeight: '600',
                }}
              >
                {clearPending ? '确认清除观看历史？' : '清除观看历史'}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: scale(15), marginTop: 3 }}>
                {clearBusy ? '正在清除…' : '清空全部观看历史记录'}
              </Text>
            </View>
          </TVFocusable>
        </View>

        {/* 组2：帮助与关于（对齐移动端 Sidebar 第二组） */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {HELP_ENTRIES.map((e) => renderRow(e))}
        </View>

        {/* 组3：版本（对齐移动端 Sidebar 底部版本组） */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.row}>
            <Text style={{ color: colors.foreground, fontSize: scale(17) }}>版本</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(16) }}>{APP_VERSION}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(14),
    borderBottomWidth: 1,
  },
  backBtn: {
    paddingHorizontal: tv(22),
    paddingVertical: tv(9),
    borderRadius: tv(8),
  },
  topTitle: { marginLeft: tv(18), fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(20), paddingBottom: tv(44) },
  // 组卡片：对齐移动端 Sidebar section（纯背景色+圆角，无边框、行间无分隔线）
  card: {
    borderRadius: tv(12),
    overflow: 'hidden',
    marginBottom: tv(16),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(24),
    paddingVertical: tv(18),
  },
  rowMain: { flex: 1 },
});

export default SettingsScreen;
