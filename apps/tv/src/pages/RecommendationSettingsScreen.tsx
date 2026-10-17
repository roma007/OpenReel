import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Search,
  Eye,
  Ban,
  RefreshCw,
  RotateCcw,
} from 'lucide-react-native';
import {
  type RecommendationOverview,
  type DislikedMediaItem,
  type TagBlacklistItem,
} from '@openreel/core';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVFocusable } from '../focus/TVFocusable';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { focusRegistry } from '../focus/registry';
import { tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TAG_TYPE_LABEL: Record<TagBlacklistItem['tagType'], string> = {
  genre: '类型',
  director: '导演',
  actor: '演员',
  keyword: '关键词',
};

const TAG_TYPE_OPTIONS: TagBlacklistItem['tagType'][] = ['genre', 'director', 'actor', 'keyword'];

/** 统计宫格图标按位对齐移动端（组件类型：lucide 图标节点） */
type StatIcon = React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number }>;

/**
 * TV 推荐偏好：卡片结构参考移动端 RecommendationSettingsScreen（7 张卡片一一对应），
 * 只改交互形态（遥控 列表行 + TVButton/TVFocusable/TVTextInput，不做下拉刷新与滑动手势）。
 *
 * 卡片清单（与移动端同序）：说明 → 5 宫格统计 → 当前高评分 → 子分类弃看统计 →
 * 已屏蔽兴趣标签（含添加）→ 不感兴趣影片 → 操作（重新计算 / 从头学习）。
 * 数据统一走 store（store 内部已接 RecommendationService 并负责缓存失效）。
 */
export function RecommendationSettingsScreen() {
  const colors = useThemeColors();
  // 卡片/面板底遵循「卡片透明度」，与移动端同名页面一致
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const scale = useScaledFontSize();
  const nav = useNavigation<Nav>();

  const [overview, setOverview] = useState<RecommendationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [disliked, setDisliked] = useState<DislikedMediaItem[]>([]);
  const [tags, setTags] = useState<TagBlacklistItem[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newTagType, setNewTagType] = useState<TagBlacklistItem['tagType']>('genre');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const getOverviewFn = useAppStore((s) => s.getRecommendationOverview);
  const getDislikedFn = useAppStore((s) => s.getDislikedMedia);
  const listTagsFn = useAppStore((s) => s.listInterestTagBlacklist);
  const toggleDislikeFn = useAppStore((s) => s.toggleDislike);
  const toggleTagFn = useAppStore((s) => s.toggleInterestTagBlacklist);
  const resetLearning = useAppStore((s) => s.resetRecommendationLearning);
  const flushRecompute = useAppStore((s) => s.flushRecommendationRecompute);

  const load = useCallback(async () => {
    const [ov, dis, tg] = await Promise.all([
      getOverviewFn().catch(() => null),
      getDislikedFn().catch(() => [] as DislikedMediaItem[]),
      listTagsFn().catch(() => [] as TagBlacklistItem[]),
    ]);
    setOverview(ov as RecommendationOverview | null);
    setDisliked(dis as DislikedMediaItem[]);
    setTags(tg as TagBlacklistItem[]);
    setLoading(false);
  }, [getOverviewFn, getDislikedFn, listTagsFn]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('rec-back'), 120);
    return () => clearTimeout(t);
  }, []);

  /** 点影片行进详情页（TV 端惯例：所有列表一律先进详情；from:'recommend' 返回回本页） */
  const openDetail = useCallback(
    (mediaId: number, title: string) => {
      nav.navigate('Detail', { mediaId, title, from: 'recommend' });
    },
    [nav],
  );

  const doResetLearning = async () => {
    setBusy(true);
    setMessage('正在从头学习…');
    try {
      await resetLearning();
      setMessage('已从头学习，推荐将从你的新观看行为重新积累');
      load();
    } catch (e) {
      setMessage(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doRecalculate = async () => {
    setBusy(true);
    setMessage('正在重新计算推荐分…');
    try {
      await flushRecompute();
      setMessage('推荐分已重新计算');
      load();
    } catch (e) {
      setMessage(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    try {
      await toggleTagFn(tag, newTagType);
      setNewTag('');
      setMessage(`已屏蔽 ${TAG_TYPE_LABEL[newTagType]}「${tag}」`);
      load();
    } catch (e) {
      setMessage(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRemoveTag = async (item: TagBlacklistItem) => {
    try {
      await toggleTagFn(item.tag, item.tagType);
      setMessage(`已取消屏蔽 ${TAG_TYPE_LABEL[item.tagType]}「${item.tag}」`);
      load();
    } catch {}
  };

  const handleRemoveDislike = async (mediaId: number) => {
    try {
      await toggleDislikeFn(mediaId);
      setMessage('已取消不感兴趣');
      load();
    } catch {}
  };

  const cardStyle = [
    styles.card,
    {
      backgroundColor: hexToRgba(colors.surface, cardOpacity / 100),
      borderColor: colors.border,
    },
  ];

  const stats: Array<{ icon: StatIcon; value: number; label: string; color: string }> = [
    { icon: ThumbsUp, value: overview?.completedCount ?? 0, label: '完播影片', color: colors.success },
    { icon: ThumbsDown, value: overview?.giveUpCount ?? 0, label: '点开弃看', color: colors.error },
    { icon: Search, value: overview?.searchKeywordCount ?? 0, label: '搜索关键词', color: colors.mutedForeground },
    { icon: Eye, value: overview?.impressionMediaCount ?? 0, label: '展示追踪', color: colors.mutedForeground },
    { icon: Ban, value: overview?.dislikedMediaCount ?? 0, label: '不感兴趣', color: colors.error },
  ];

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="推荐偏好" backId="rec-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: tv(56) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 说明卡（与移动端 intro 同文案） */}
        <View style={cardStyle}>
          <Text style={{ color: colors.textSecondary, fontSize: scale(16), lineHeight: scale(24) }}>
            「越看越懂你」会根据你的观看行为自动学习偏好：完播一部 +10、连续追多集 +5、收藏 +20、
            搜索命中 +3。展示多次未点开、点开即退仅作统计展示，不影响推荐打分。
            所有信号都来自应用自身数据，可随时「从头学习」。
          </Text>
        </View>

        {loading || !overview ? (
          <View style={cardStyle}>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(16) }}>加载中…</Text>
          </View>
        ) : (
          <>
            {/* 2. 统计卡：5 宫格（与移动端一致） */}
            <View style={cardStyle}>
              <View style={styles.statsRow}>
                {stats.map((st) => {
                  const Icon = st.icon;
                  return (
                    <View key={st.label} style={[styles.statCard, { backgroundColor: hexToRgba(colors.cardAccent, (cardOpacity / 100) * 0.35) }]}>
                      <Icon size={20} color={st.color} />
                      <View>
                        <Text style={[styles.statValue, { color: colors.foreground, fontSize: scale(24) }]}>
                          {st.value}
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                          {st.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 3. 当前高评分卡 */}
            <View style={cardStyle}>
              <View style={styles.sectionTitleRow}>
                <Sparkles size={18} color={colors.mutedForeground} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
                  当前高评分（为你推荐靠前）
                </Text>
              </View>
              {overview.topMedia.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  暂无学习数据。多看一些影片后，这里会显示你的高分偏好。
                </Text>
              ) : (
                overview.topMedia.map((m) => (
                  <TVFocusable
                    key={m.id}
                    id={`rec-top:${m.id}`}
                    onPress={() => openDetail(m.id, m.title)}
                    style={[styles.rowItem, { backgroundColor: hexToRgba(colors.surface, (cardOpacity / 100) * 0.6) }]}
                    testID={`tv-rec-top-${m.id}`}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.foreground, fontSize: scale(17), flex: 1, marginRight: tv(12) }}
                    >
                      {m.title}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>+{m.score}</Text>
                  </TVFocusable>
                ))
              )}
            </View>

            {/* 4. 子分类弃看统计卡 */}
            <View style={cardStyle}>
              <View style={styles.sectionTitleRow}>
                <ThumbsDown size={18} color={colors.mutedForeground} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
                  子分类弃看统计
                </Text>
              </View>
              {overview.penalizedSubtypes.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  暂无弃看率偏高的子分类。该统计仅供信息展示，不影响推荐打分。
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {overview.penalizedSubtypes.map((g) => (
                    <View
                      key={g}
                      style={[styles.chip, { backgroundColor: hexToRgba(colors.mutedForeground, (cardOpacity / 100) * 0.15) }]}
                    >
                      <Text style={{ color: colors.foreground, fontSize: scale(15) }}>{g}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 5. 已屏蔽的兴趣标签卡（含添加：输入 + 类型单选） */}
            <View style={cardStyle}>
              <View style={styles.sectionTitleRow}>
                <Ban size={18} color={colors.mutedForeground} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
                  已屏蔽的兴趣标签（{tags.length}）
                </Text>
              </View>
              <Text
                numberOfLines={3}
                style={{ color: colors.mutedForeground, fontSize: scale(14), lineHeight: scale(21), marginBottom: tv(12) }}
              >
                被屏蔽的标签不再参与推荐学习与打分。影片详情页点「不感兴趣」会自动降低其类型/导演/演员类内容的权重。
              </Text>

              <TVTextInput
                id="rec-tag-input"
                value={newTag}
                onChangeText={setNewTag}
                placeholder="输入要屏蔽的标签名（如：恐怖）"
                testID="tv-rec-tag-input"
              />
              <View style={styles.typeRow}>
                {TAG_TYPE_OPTIONS.map((t) => {
                  const on = newTagType === t;
                  return (
                    <TVFocusable
                      key={t}
                      id={`rec-tag-type:${t}`}
                      onPress={() => setNewTagType(t)}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: on
                            ? hexToRgba(colors.buttonPrimaryBg, cardOpacity / 100)
                            : hexToRgba(colors.mutedForeground, (cardOpacity / 100) * 0.15),
                        },
                      ]}
                      testID={`tv-rec-tag-type-${t}`}
                    >
                      <Text
                        style={{
                          color: on ? colors.buttonPrimaryText : colors.textSecondary,
                          fontSize: scale(15),
                          fontWeight: '600',
                        }}
                      >
                        {TAG_TYPE_LABEL[t]}
                      </Text>
                    </TVFocusable>
                  );
                })}
                <TVButton
                  id="rec-tag-add"
                  label="添加"
                  variant="primary"
                  leftIcon={null}
                  disabled={!newTag.trim()}
                  onPress={handleAddTag}
                  testID="tv-rec-tag-add"
                />
              </View>

              <View style={[styles.chipRow, { marginTop: tv(8) }]}>
                {tags.map((t) => (
                  <TVFocusable
                    key={`${t.tagType}:${t.tag}`}
                    id={`rec-tag:${t.tagType}:${t.tag}`}
                    onPress={() => handleRemoveTag(t)}
                    style={[styles.chip, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100) }]}
                    testID={`tv-rec-tag-${t.tag}`}
                  >
                    <Text style={{ color: colors.foreground, fontSize: scale(15) }}>
                      {TAG_TYPE_LABEL[t.tagType]}：{t.tag} ✕
                    </Text>
                  </TVFocusable>
                ))}
                {tags.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>暂无已屏蔽标签。</Text>
                ) : null}
              </View>
            </View>

            {/* 6. 不感兴趣影片卡 */}
            <View style={cardStyle}>
              <View style={styles.sectionTitleRow}>
                <ThumbsDown size={18} color={colors.error} />
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
                  不感兴趣影片（{disliked.length}）
                </Text>
              </View>
              {disliked.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  暂无。在影片详情页点「不感兴趣」即可加入，这类影片将不再出现在推荐列表中。
                </Text>
              ) : (
                disliked.slice(0, 30).map((d) => (
                  <View key={d.mediaId} style={styles.itemRow}>
                    <TVFocusable
                      id={`rec-dislike:${d.mediaId}`}
                      onPress={() => openDetail(d.mediaId, d.title)}
                      style={styles.itemTitle}
                      testID={`tv-rec-dislike-${d.mediaId}`}
                    >
                      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: scale(17) }}>
                        {d.title || `影片 #${d.mediaId}`}
                      </Text>
                    </TVFocusable>
                    <TVButton
                      id={`rec-undo:${d.mediaId}`}
                      label="移除"
                      onPress={() => handleRemoveDislike(d.mediaId)}
                    />
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* 7. 操作卡：重新计算推荐分 + 从头学习（与移动端一致） */}
        <View style={cardStyle}>
          <View style={styles.actionRow}>
            <TVButton
              id="rec-recalc"
              label="重新计算推荐分"
              leftIcon={<RefreshCw size={16} color={colors.foreground} />}
              disabled={busy}
              onPress={doRecalculate}
              testID="tv-rec-recalc"
            />
            <TVButton
              id="rec-reset"
              label="从头学习"
              variant="danger"
              leftIcon={<RotateCcw size={16} color={colors.error} />}
              disabled={busy}
              onPress={doResetLearning}
              testID="tv-rec-reset"
            />
          </View>
          {message ? (
            <Text style={{ color: colors.foreground, fontSize: scale(16), marginTop: tv(12) }}>{message}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  card: {
    padding: tv(20),
    borderRadius: tv(10),
    borderWidth: 1,
    marginBottom: tv(16),
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: tv(8), marginBottom: tv(12) },
  sectionTitle: { fontWeight: '700' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tv(12) },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv(10),
    padding: tv(14),
    borderRadius: tv(8),
    flexGrow: 1,
    minWidth: '18%',
  },
  statValue: { fontWeight: '700', lineHeight: undefined },
  statLabel: { marginTop: 2 },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tv(10),
    paddingHorizontal: tv(12),
    borderRadius: tv(8),
    marginBottom: tv(6),
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(6),
  },
  itemTitle: {
    flex: 1,
    marginRight: tv(12),
    paddingVertical: tv(6),
    paddingHorizontal: tv(10),
    borderRadius: tv(8),
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: tv(16),
    paddingVertical: tv(9),
    borderRadius: tv(8),
    marginRight: tv(12),
    marginBottom: tv(12),
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: tv(14),
    paddingVertical: tv(9),
    borderRadius: tv(8),
    marginRight: tv(12),
    marginBottom: tv(4),
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  emptyText: {},
});

export default RecommendationSettingsScreen;
