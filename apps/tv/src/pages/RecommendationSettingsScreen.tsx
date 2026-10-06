import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { type RecommendationOverview, type DislikedMediaItem, type TagBlacklistItem } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVFocusable } from '../focus/TVFocusable';
import { TVButton } from '../components/TVButton';
import { focusRegistry } from '../focus/registry';
import { tv } from '../theme/tokens';

/**
 * TV 推荐偏好：查看推荐依据、清除不感兴趣内容、重建推荐分。
 *
 * 与手机端同服务（RecommendationService），TV 端只改交互形态：
 * 遥控端用列表行 + 按钮，不做下拉刷新与滑动手势。
 */
export function RecommendationSettingsScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const [overview, setOverview] = useState<RecommendationOverview | null>(null);
  const [disliked, setDisliked] = useState<DislikedMediaItem[]>([]);
  const [tags, setTags] = useState<Array<{ tag: string; tagType: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 推荐相关读写统一走 store（store 内部已接 RecommendationService 并负责缓存失效）
  const getOverviewFn = useAppStore((s) => s.getRecommendationOverview);
  const getDislikedFn = useAppStore((s) => s.getDislikedMedia);
  const listTagsFn = useAppStore((s) => s.listInterestTagBlacklist);
  const toggleDislikeFn = useAppStore((s) => s.toggleDislike);
  const toggleTagFn = useAppStore((s) => s.toggleInterestTagBlacklist);
  const resetLearning = useAppStore((s) => s.resetRecommendationLearning);

  const load = useCallback(async () => {
    const [ov, dis, tg] = await Promise.all([
      getOverviewFn().catch(() => null),
      getDislikedFn().catch(() => [] as DislikedMediaItem[]),
      listTagsFn().catch(() => [] as TagBlacklistItem[]),
    ]);
    setOverview(ov as RecommendationOverview | null);
    setDisliked(dis as DislikedMediaItem[]);
    setTags((tg as TagBlacklistItem[]).map((t) => ({ tag: t.tag, tagType: t.tagType })));
  }, [getOverviewFn, getDislikedFn, listTagsFn]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('rec-back'), 120);
    return () => clearTimeout(t);
  }, []);

  const doResetLearning = async () => {
    setBusy(true);
    setMessage('正在重置推荐学习数据…');
    try {
      await resetLearning();
      setMessage('已重置，将基于最新行为重新学习');
      load();
    } catch (e) {
      setMessage(`重置失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeDislike = async (mediaId: number) => {
    try {
      await toggleDislikeFn(mediaId);
      load();
    } catch {}
  };

  const doToggleTag = async (tag: string, tagType: string) => {
    try {
      await toggleTagFn(tag, tagType as any);
      load();
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="推荐偏好" backId="rec-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: tv(56) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          推荐学习概况
        </Text>
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>
            看完 {overview?.completedCount ?? 0} 部 · 中途放弃 {overview?.giveUpCount ?? 0} 部
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: scale(16), marginTop: tv(6) }}>
            搜索过 {overview?.searchKeywordCount ?? 0} 次 · 曝光 {overview?.impressionMediaCount ?? 0} 部
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: scale(16), marginTop: tv(6) }}>
            兴趣标签 {overview?.topInterestTags?.length ?? 0} 个 · 已屏蔽 {tags.length} 个
          </Text>
          {(overview?.penalizedSubtypes?.length ?? 0) > 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(6) }}>
              降权类型：{overview!.penalizedSubtypes.join('、')}
            </Text>
          ) : null}
          <View style={{ marginTop: tv(14) }}>
            <TVButton
              id="rec-reset"
              label="重置推荐学习"
              variant="danger"
              disabled={busy}
              onPress={doResetLearning}
              testID="tv-rec-reset"
            />
          </View>
        </View>

        <Text
          style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19), marginTop: tv(26) }]}
        >
          不感兴趣的影片（{disliked.length}）
        </Text>
        {disliked.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: scale(16) }}>
            暂无；在影片详情页标记「不感兴趣」后会出现在这里
          </Text>
        ) : (
          <View>
            {disliked.slice(0, 30).map((d) => (
              <View key={d.mediaId} style={styles.itemRow}>
                <Text style={{ color: colors.foreground, fontSize: scale(17), flex: 1 }}>
                  {d.title || `影片 #${d.mediaId}`}
                </Text>
                <TVButton
                  id={`rec-undo:${d.mediaId}`}
                  label="移除"
                  onPress={() => removeDislike(d.mediaId)}
                />
              </View>
            ))}
          </View>
        )}

        {tags.length > 0 ? (
          <>
            <Text
              style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19), marginTop: tv(26) }]}
            >
              已屏蔽的兴趣标签（{tags.length}）
            </Text>
            <View style={styles.tagWrap}>
              {tags.map((t) => (
                <TVFocusable
                  key={`${t.tagType}:${t.tag}`}
                  id={`rec-tag:${t.tagType}:${t.tag}`}
                  onPress={() => doToggleTag(t.tag, t.tagType)}
                  style={[styles.tag, { backgroundColor: colors.surface }]}
                  testID={`tv-rec-tag-${t.tag}`}
                >
                  <Text style={{ color: colors.foreground, fontSize: scale(15) }}>
                    {t.tag} ✕
                  </Text>
                </TVFocusable>
              ))}
            </View>
          </>
        ) : null}

        {message ? (
          <Text style={{ color: colors.foreground, fontSize: scale(16), marginTop: tv(20) }}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  sectionTitle: { fontWeight: '700', marginBottom: tv(12) },
  infoBox: { padding: tv(20), borderRadius: tv(10), borderWidth: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(10),
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: tv(16),
    paddingVertical: tv(9),
    borderRadius: tv(8),
    marginRight: tv(12),
    marginBottom: tv(12),
  },
});

export default RecommendationSettingsScreen;