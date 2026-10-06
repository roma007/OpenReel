import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ENTRIES: Array<{ key: string; label: string; route: keyof RootStackParamList; desc: string }> = [
  { key: 'appearance', label: '外观与主题', route: 'AppearanceSettings', desc: '主题色、字号、图片质量' },
  { key: 'usage', label: '使用偏好', route: 'UsagePreferences', desc: '播放行为与默认设置' },
  { key: 'recommend', label: '推荐偏好', route: 'RecommendationSettings', desc: '推荐依据与不感兴趣内容' },
  { key: 'video', label: '视频与缓存', route: 'VideoManagement', desc: '缓存占用、清理缓存、删除影片' },
  { key: 'sources', label: '视频源管理', route: 'SourceManager', desc: '增删改查采集源' },
  { key: 'ai', label: 'AI 导入片单', route: 'AiSourceImport', desc: '用 AI 生成片单文本导入' },
  { key: 'collectcfg', label: '采集配置', route: 'CollectConfig', desc: '采集范围与并发参数' },
  { key: 'kidlock', label: '儿童锁', route: 'KidLock', desc: '儿童模式与密码' },
  { key: 'help', label: '帮助中心', route: 'HelpCenter', desc: '常见问题与使用说明' },
  { key: 'about', label: '关于', route: 'About', desc: '版本信息' },
  { key: 'license', label: '版权声明', route: 'License', desc: '开源许可' },
];

/** TV 设置主页：所有项均为可聚焦行，遥控上下遍历 */
export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('settings-back'), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVFocusable
          id="settings-back"
          onPress={() => nav.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface }]}
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
        {ENTRIES.map((e) => (
          <TVFocusable
            key={e.key}
            id={`settings:${e.key}`}
            onPress={() => nav.navigate(e.route as any)}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
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
        ))}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(24),
    paddingVertical: tv(18),
    borderRadius: tv(10),
    borderWidth: 1,
    marginBottom: tv(14),
  },
  rowMain: { flex: 1 },
});

export default SettingsScreen;