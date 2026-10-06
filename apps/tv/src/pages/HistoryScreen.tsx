import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Media, WatchHistory } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider } from '../useAppStore';
import { TVRow } from '../focus/TVRow';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import MediaCard from '../components/MediaCard';
import { TV_CARD, TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'History'>;

const PAGE_SIZE = 30;

/** TV 观看历史：按 updatedAt 倒序，回查 media 渲染；返回时还原页码 */
export function HistoryScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const [page, setPage] = useState(route.params?.page ?? 1);
  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const provider = getProvider();
    const hist = await provider.getAllWatchHistory(page, PAGE_SIZE);
    // watch_history 是「影片 × 剧集」粒度（id = wh_<mediaId>_<episodeId>），同一部影片看过多集会
    // 产生多行；此处按 mediaId 去重只留最近一条，否则 TVRow 会拿到重复 key，
    // React 直接抛 "Encountered two children with the same key"（2026-10-05 实测）。
    const byMedia = new Map<number, WatchHistory>();
    for (const h of hist) if (!byMedia.has(h.mediaId)) byMedia.set(h.mediaId, h);
    const uniq = [...byMedia.values()];
    setTotal(uniq.length);
    const list = await Promise.all(uniq.map((h) => provider.getMediaById(h.mediaId).catch(() => null)));
    setItems(list.filter(Boolean) as Media[]);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => focusRegistry.requestInitialFocus('hist-back'), 120);
    return () => clearTimeout(t);
  }, [loading]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="hist-back" label="返回" onPress={() => nav.goBack()} testID="tv-history-back" />
        <Text style={[styles.topTitle, { color: colors.foreground, fontSize: scale(23) }]}>
          观看历史
        </Text>
        <Text style={[styles.count, { color: colors.mutedForeground, fontSize: scale(16) }]}>
          {total}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: TV_LAYOUT.paddingX, paddingTop: tv(16) }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            正在加载…
          </Text>
        ) : items.length === 0 ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            还没有观看记录
          </Text>
        ) : (
          <TVRow
            rowId="hist-items"
            data={items}
            keyExtractor={(m) => String(m.id)}
            itemWidth={TV_CARD.width}
            itemHeight={TV_CARD.height}
            onItemPress={(m) =>
              nav.navigate('Detail', { mediaId: m.id, title: m.title, from: 'history', page })
            }
            renderItem={(m) => (
              <MediaCard media={m} width={TV_CARD.width} height={TV_CARD.height} showRating={false} />
            )}
          />
        )}

        {totalPages > 1 ? (
          <View style={[styles.pager, { borderTopColor: colors.border }]}>
            <TVButton
              id="hist-prev"
              label="上一页"
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            />
            <Text style={{ color: colors.foreground, fontSize: scale(18), marginHorizontal: tv(18) }}>
              第 {page} / {totalPages} 页
            </Text>
            <TVButton
              id="hist-next"
              label="下一页"
              disabled={page >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </View>
        ) : null}
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
  topTitle: { marginLeft: tv(18), fontWeight: '700' },
  count: { marginLeft: tv(12) },
  scroll: { flex: 1 },
  status: { paddingVertical: tv(40), textAlign: 'center' },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tv(20),
    paddingTop: tv(18),
    borderTopWidth: 1,
  },
});

export default HistoryScreen;