import React, { useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVFocusable } from '../focus/TVFocusable';
import { TV_LAYOUT, tv } from '../theme/tokens';

const FAQ_GROUPS: Array<{ title: string; items: Array<{ q: string; a: string }> }> = [
  {
    title: '新手入门',
    items: [
      {
        q: '视频从哪来？',
        a: '视频内容来源于您添加的视频源（CMS 资源站）。添加视频源并采集后，即可浏览和播放视频。采集教程中有详细的配置方法。',
      },
      {
        q: '怎么看视频？',
        a: '在首页浏览或搜索视频，点击进入详情页，选择剧集后即可播放。如果您还没有视频数据，请先添加视频源并采集。',
      },
      {
        q: '如何添加视频源？',
        a: '进入「设置」→「视频源管理」，可「手动添加」填写编码、名称和 API 地址，也可用「AI 导入」批量添加。详见采集教程。',
      },
      {
        q: '电视上怎么打字？',
        a: '任意输入框获得焦点后按 OK，会打开应用内键盘，用方向键选择字符即可输入；也可以点「粘贴」从剪贴板读取，或点「系统键盘」使用设备自带输入法。',
      },
    ],
  },
  {
    title: '采集相关',
    items: [
      {
        q: '全量、增量采集有什么区别？',
        a: '全量采集拉取源站全部数据，耗时较长，适合首次使用；增量采集只采集新增内容，适合日常追新。详见采集教程。',
      },
      {
        q: '采集到的数据不全或重复怎么办？',
        a: '本应用使用指纹去重机制，相同名称和年份的视频会自动去重。数据不全可能是视频源 API 限制了返回数量，可在「采集配置」调整页数参数。',
      },
      {
        q: '采集时提示“无法连接视频源”怎么办？',
        a: '请检查 API 地址是否正确、网络能否访问，并用「检测」功能验证。部分站点需要特殊网络环境才能访问。',
      },
      {
        q: '为什么电视端没有“自动采集”？',
        a: '电视盒子长期待机挂机，后台定时采集会持续占用网络与内存，因此电视端不自动执行自动采集，请在「视频源管理」手动点击「增量采集」。相关参数仍可在「采集配置」中保存。',
      },
    ],
  },
  {
    title: '播放相关',
    items: [
      {
        q: '播放不了怎么办？',
        a: '尝试切换其他播放线路，或稍后再试。如果所有线路都不可用，可能是视频源失效，建议重新采集或更换视频源。',
      },
      {
        q: '播放缓冲卡顿怎么调？',
        a: '在「使用偏好」中可调整「播放缓冲并发数」和「播放缓冲内存上限」。电视端默认并发较低（盒子网络与存储弱于手机）。',
      },
      {
        q: '电视上提示空间不足怎么办？',
        a: '在「设置 → 视频与缓存」中可查看缓存占用与系统可用空间，并一键清理缓存。缓存是播放分片，清理后会重新下载。',
      },
    ],
  },
  {
    title: '遥控操作',
    items: [
      {
        q: '方向键失灵/焦点不动怎么办？',
        a: '先按一次 OK 或返回键让焦点回到页面；若焦点落在输入键盘内，按返回键会先关闭键盘而不是退出页面。',
      },
      {
        q: '删除操作为什么要点两次？',
        a: '电视没有触摸确认按钮，删除类操作改为“再按一次确认”的两次确认模式（3 秒内有效），避免误触。',
      },
    ],
  },
  {
    title: '常用功能',
    items: [
      {
        q: '如何收藏视频？',
        a: '在视频详情页点击收藏按钮，即可加入收藏列表。收藏的视频会在首页快捷显示。',
      },
      {
        q: '观看历史在哪里？如何清除？',
        a: '首页会展示观看记录并支持断点续播。可在设置中进入「视频与缓存」清理影片数据。',
      },
      {
        q: '首页显示哪些内容怎么调整？',
        a: '在「使用偏好」的首页偏好中可多选「搜索优先」「追新电影」「追剧/综艺」，首页会根据偏好展示对应卡片。',
      },
    ],
  },
];

/**
 * TV 帮助中心。
 * 手机端是点开/收起的手风琴；TV 端每个问题本身就是可聚焦行（按 OK 就地展开答案），
 * 避免再点一层「展开按钮」。
 */
export function HelpCenterScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const nav = useNavigation<any>();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="帮助中心" backId="help-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <TVFocusable
          id="help-to-guide"
          onPress={() => nav.navigate('CollectGuide')}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="tv-help-to-guide"
        >
          <View style={styles.rowMain}>
            <Text style={{ color: colors.foreground, fontSize: scale(19), fontWeight: '700' }}>采集教程</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(15), marginTop: tv(4) }}>
              视频源配置 · 全量采集 · 增量采集
            </Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: scale(22) }}>›</Text>
        </TVFocusable>

        {FAQ_GROUPS.map((group, gi) => (
          <View
            key={group.title}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.groupTitle, { color: colors.foreground, fontSize: scale(19) }]}>
              {group.title}
            </Text>
            {group.items.map((faq, fi) => {
              const key = `${gi}-${fi}`;
              const open = !!expanded[key];
              return (
                <View key={key} style={fi > 0 ? styles.divider : undefined}>
                  <TVFocusable
                    id={`help:${key}`}
                    onPress={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={styles.faqHeader}
                    testID={`tv-help-${key}`}
                  >
                    <View style={styles.faqHeaderRow}>
                      <Text style={{ color: colors.foreground, fontSize: scale(17), flex: 1 }}>{faq.q}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: scale(20) }}>{open ? '▾' : '▸'}</Text>
                    </View>
                  </TVFocusable>
                  {open ? (
                    <Text style={[styles.answer, { color: colors.textSecondary, fontSize: scale(16) }]}>
                      {faq.a}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

        <Text style={[styles.footer, { color: colors.mutedForeground, fontSize: scale(15) }]}>
          更多问题请联系管理员
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(24),
    paddingVertical: tv(18),
    borderRadius: tv(10),
    borderWidth: 1,
    marginBottom: tv(16),
  },
  rowMain: { flex: 1 },
  card: { padding: tv(20), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(16) },
  groupTitle: { fontWeight: '700', marginBottom: tv(8) },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.35)', marginTop: tv(10) },
  faqHeader: { paddingVertical: tv(10) },
  faqHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  answer: { lineHeight: tv(25), paddingBottom: tv(12) },
  footer: { textAlign: 'center', paddingVertical: tv(10) },
});

export default HelpCenterScreen;