import React from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TV_LAYOUT, tv } from '../theme/tokens';

const CMS_REFS = [
  {
    name: '海洋CMS（HYCMS）',
    apiFormat: 'http://你的域名/api.php/provide/vod/at/xml/',
    tip: '最常用，稳定性好，推荐优先使用',
  },
  {
    name: '苹果CMS8（MacCMS8）',
    apiFormat: 'http://你的域名/index.php/api.php/provide/vod/at/xml/',
    tip: '兼容性好，建议升级到 MacCMS10',
  },
  {
    name: '苹果CMS10（MacCMS10）',
    apiFormat: 'http://你的域名/index.php/api.php/provide/vod/at/xml/',
    tip: '最主流，功能完善，系统自动适配',
  },
];

const MANUAL_CONFIG_STEPS = [
  '打开「设置」页面，进入「视频源管理」',
  '点击「手动添加」，填写编码、名称、API 地址（输入框按 OK 打开电视键盘）',
  '保存后视频源出现在列表中',
  '点击「检测」确认源可用，用开关启用/禁用',
];

const AI_IMPORT_STEPS = [
  '在「视频源管理」中点击「AI 导入片单」',
  '复制提示词发给 AI 助手（如 ChatGPT、Claude）',
  '将 AI 返回的数据用「粘贴」贴进来，点击「解析并预览」',
  '确认预览结果（重复源自动跳过），点击「导入」',
];

const FULL_COLLECT_POINTS = [
  { label: '适用场景', text: '首次添加视频源，或需要建立完整片库' },
  { label: '操作方式', text: '视频源管理中对对应源点击「全量采集」' },
  { label: '参数调整', text: '「采集配置」中可设置全量采集最大页数' },
  { label: '特点', text: '采集全部数据，耗时较长，建议初期执行一次' },
];

const INCREMENTAL_COLLECT_POINTS = [
  { label: '适用场景', text: '日常追新，只采集新增的视频内容' },
  { label: '操作方式', text: '视频源管理点击「增量采集」，或首页「追新电影」一键采集' },
  { label: '参数调整', text: '「采集配置」中可设置增量采集最大页数与断点小时数' },
  { label: '特点', text: '速度快、资源消耗小，建议定期执行保持数据最新' },
];

const AUTO_COLLECT_POINTS = [
  { label: '电视端现状', text: '电视端不启动后台自动采集调度（盒子长期待机，定时采集会持续占用网络与内存）' },
  { label: '替代方式', text: '请在「视频源管理」手动点击「增量采集」；或在「采集」页用关键词采集' },
  { label: '参数保留', text: '「采集配置」中的自动采集开关与间隔仍可配置并保存，但电视端不会自动执行' },
  { label: '任务查看', text: '采集进度与失败明细可在「视频源管理」或「任务列表」查看' },
];

/** TV 采集教程（内容同手机端 CollectGuide，第四节按 TV 实际行为改写，不照抄手机端文案） */
export function CollectGuideScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const steps = (list: string[]) =>
    list.map((step, i) => (
      <View key={i} style={styles.stepRow}>
        <View style={[styles.stepBadge, { backgroundColor: colors.buttonPrimaryBg }]}>
          <Text style={[styles.stepBadgeText, { color: colors.buttonPrimaryText }]}>{i + 1}</Text>
        </View>
        <Text style={[styles.stepText, { color: colors.textSecondary, fontSize: scale(16) }]}>{step}</Text>
      </View>
    ));

  const points = (list: Array<{ label: string; text: string }>) =>
    list.map((p, i) => (
      <View key={i} style={styles.pointRow}>
        <Text style={[styles.pointLabel, { color: colors.foreground, fontSize: scale(16) }]}>{p.label}</Text>
        <Text style={[styles.pointText, { color: colors.textSecondary, fontSize: scale(16) }]}>{p.text}</Text>
      </View>
    ));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="采集教程" backId="guide-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>采集教程</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(16) }]}>
            从配置视频源到全量、增量采集，本教程带你完整掌握电视端的采集功能。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>一、视频源配置</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(16) }]}>
            采集前必须先添加视频源，支持手动配置和 AI 导入两种方式。
          </Text>

          <Text style={[styles.subTitle, { color: colors.foreground, fontSize: scale(18) }]}>1. 手动配置</Text>
          {steps(MANUAL_CONFIG_STEPS)}

          <Text style={[styles.subTitle, { color: colors.foreground, fontSize: scale(18) }]}>
            常见 CMS 接口格式参考
          </Text>
          {CMS_REFS.map((cms) => (
            <View
              key={cms.name}
              style={[styles.subCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <Text style={[styles.pointTitle, { color: colors.foreground, fontSize: scale(17) }]}>{cms.name}</Text>
              <Text style={[styles.code, { color: colors.mutedForeground, fontSize: scale(15) }]}>
                {cms.apiFormat}
              </Text>
              <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(16) }]}>{cms.tip}</Text>
            </View>
          ))}

          <Text style={[styles.subTitle, { color: colors.foreground, fontSize: scale(18) }]}>2. AI 导入</Text>
          {steps(AI_IMPORT_STEPS)}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>二、全量采集</Text>
          {points(FULL_COLLECT_POINTS)}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>三、手动增量采集</Text>
          {points(INCREMENTAL_COLLECT_POINTS)}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>四、关于自动采集</Text>
          {points(AUTO_COLLECT_POINTS)}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  card: { padding: tv(20), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(18) },
  subCard: { padding: tv(16), borderRadius: tv(8), borderWidth: 1, marginTop: tv(10), marginBottom: tv(6) },
  cardTitle: { fontWeight: '700', marginBottom: tv(6) },
  subTitle: { fontWeight: '700', marginTop: tv(16), marginBottom: tv(8) },
  para: { lineHeight: tv(25) },
  code: { fontFamily: 'monospace', marginTop: tv(8), marginBottom: tv(6) },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: tv(10) },
  stepBadge: { width: tv(24), height: tv(24), borderRadius: tv(12), alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { fontWeight: '800', fontSize: tv(14) },
  stepText: { flex: 1, marginLeft: tv(12), lineHeight: tv(25) },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: tv(10) },
  pointLabel: { width: tv(96), fontWeight: '700' },
  pointText: { flex: 1, lineHeight: tv(25) },
  pointTitle: { fontWeight: '700' },
});

export default CollectGuideScreen;