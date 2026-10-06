import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Media } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider, getStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { TVRow } from '../focus/TVRow';
import { focusRegistry } from '../focus/registry';
import MediaCard from '../components/MediaCard';
import { TVNavBar } from '../components/TVNavBar';
import { TV_CARD, TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 首页。
 *
 * 结构：顶部导航条（分类入口 + 我的/采集/设置）+ 内容区（继续观看 + 各类型高分行）。
 * 数据全部来自本地 SQLite，不请求网络。
 *
 * 遥控焦点：页面数据就绪后把初始焦点给「继续观看」首项（若有），否则给第一行首项，
 * 保证方向键按下时一定有确定去处（不留焦点黑洞）。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 20;

/** 首页各内容行定义：不同类型/排序由真实 store 查询提供，不在前端拼凑 */
const ROW_DEFS: Array<{ rowId: string; title: string; params: any }> = [
  { rowId: 'row-movie', title: '高分电影', params: { sort: 'rating', type: 'MOVIE' } },
  { rowId: 'row-tv', title: '高分剧集', params: { sort: 'rating', type: 'TV' } },
  { rowId: 'row-anime', title: '高分动漫', params: { sort: 'rating', type: 'ANIME' } },
  { rowId: 'row-variety', title: '高分综艺', params: { sort: 'rating', type: 'VARIETY' } },
  { rowId: 'row-doc', title: '高分纪录片', params: { sort: 'rating', type: 'DOCUMENTARY' } },
  { rowId: 'row-hot', title: '最近热门', params: { sort: 'hot' } },
  { rowId: 'row-latest', title: '最近更新', params: { sort: 'latest' } },
];

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const isLoading = useAppStore((s) => s.isLoading);
  const watchHistory = useAppStore((s) => s.watchHistory);
  const loadWatchHistory = useAppStore((s) => s.loadWatchHistory);
  const favorites = useAppStore((s) => s.favorites);
  const loadFavorites = useAppStore((s) => s.loadFavorites);

  const [rows, setRows] = useState<Record<string, Media[]>>({});
  const [historyMedia, setHistoryMedia] = useState<Media[]>([]);
  const [ready, setReady] = useState(false);

  /**
   * 首页各行直接走 provider 查询而非 store.loadMediaList：
   * loadMediaList 写的是同一份 mediaList，多行并发会互相覆盖，无法分行渲染。
   * 收藏/历史仍走 store（其数据量小、需要跨页复用）。
   */
  const loadHome = useCallback(async () => {
    setReady(false);
    await Promise.all([loadWatchHistory(1), loadFavorites()]);

    const provider = getProvider();
    const results = await Promise.all(
      ROW_DEFS.map(async (def) => {
        try {
          const r = await provider.listMedia({ page: 1, pageSize: PAGE_SIZE, ...def.params });
          return [def.rowId, r.items as Media[]] as const;
        } catch {
          return [def.rowId, [] as Media[]] as const;
        }
      }),
    );
    setRows(Object.fromEntries(results));

    // 继续观看：watch_history 只存 mediaId，标题/封面需回查 media 表
    const history = getStore().getState().watchHistory || [];
    const hist = await Promise.all(
      history.slice(0, 10).map((h) => provider.getMediaById(h.mediaId).catch(() => null)),
    );
    setHistoryMedia(hist.filter(Boolean) as Media[]);

    setReady(true);
  }, [loadWatchHistory, loadFavorites]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // 初始焦点：优先「继续观看」首项
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      focusRegistry.requestInitialFocus(historyMedia.length > 0 ? 'row-continue:0' : 'row-movie:0');
    }, 150);
    return () => clearTimeout(t);
  }, [ready, historyMedia.length]);

  const openDetail = useCallback(
    (media: Media) => nav.navigate('Detail', { mediaId: media.id, title: media.title, from: 'home' }),
    [nav],
  );

  const navItems = [
    { key: 'home', label: '首页', onPress: () => {} },
    { key: 'movie', label: '电影', onPress: () => nav.navigate('Category', { type: 'MOVIE', title: '电影' }) },
    { key: 'tv', label: '电视剧', onPress: () => nav.navigate('Category', { type: 'TV', title: '电视剧' }) },
    { key: 'anime', label: '动漫', onPress: () => nav.navigate('Category', { type: 'ANIME', title: '动漫' }) },
    { key: 'variety', label: '综艺', onPress: () => nav.navigate('Category', { type: 'VARIETY', title: '综艺' }) },
    { key: 'doc', label: '纪录片', onPress: () => nav.navigate('Category', { type: 'DOCUMENTARY', title: '纪录片' }) },
    { key: 'fav', label: '收藏', onPress: () => nav.navigate('Favorites', {}), badge: favorites?.length },
    { key: 'collect', label: '采集', onPress: () => nav.navigate('Collect') },
    { key: 'settings', label: '设置', onPress: () => nav.navigate('Settings') },
  ];

  // 空库判定用真实 media 表计数，不依赖任何一行的分页结果
  const empty = ready && Object.values(rows).every((r) => r.length === 0) && historyMedia.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVNavBar items={navItems} title="OpenReel TV" onSearch={() => nav.navigate('Search', {})} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {!ready ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            正在加载…
          </Text>
        ) : empty ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: scale(22) }]}>
              还没有影片数据
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground, fontSize: scale(17), maxWidth: tv(760) }]}>
              先去「采集」添加片单，采集完成后即可在电视上浏览观看
            </Text>
            <TVFocusable
              id="empty-go-collect"
              onPress={() => nav.navigate('Collect')}
              style={[styles.emptyBtn, { backgroundColor: colors.buttonPrimaryBg }]}
              testID="tv-home-empty-collect"
            >
              <Text style={[styles.emptyBtnText, { color: colors.buttonPrimaryText, fontSize: scale(18) }]}>
                去采集
              </Text>
            </TVFocusable>
          </View>
        ) : (
          <>
            {historyMedia.length > 0 ? (
              <TVRow
                rowId="row-continue"
                title="继续观看"
                onTitlePress={() => nav.navigate('History', {})}
                data={historyMedia}
                keyExtractor={(m) => String(m.id)}
                itemWidth={TV_CARD.width}
                itemHeight={TV_CARD.height}
                onItemPress={openDetail}
                renderItem={(m) => (
                  <MediaCard media={m} width={TV_CARD.width} height={TV_CARD.height} showRating={false} />
                )}
              />
            ) : null}
            {ROW_DEFS.map((def) => (
              <TVRow
                key={def.rowId}
                rowId={def.rowId}
                title={def.title}
                data={rows[def.rowId] || []}
                keyExtractor={(m) => String(m.id)}
                itemWidth={TV_CARD.width}
                itemHeight={TV_CARD.height}
                emptyText="暂无内容"
                onItemPress={openDetail}
                renderItem={(m) => (
                  <MediaCard media={m} width={TV_CARD.width} height={TV_CARD.height} />
                )}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: TV_LAYOUT.paddingY,
    paddingBottom: TV_LAYOUT.paddingY * 2,
  },
  status: { paddingVertical: tv(40), textAlign: 'center' },
  emptyBox: {
    marginTop: tv(40),
    padding: tv(32),
    borderRadius: tv(12),
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyTitle: { fontWeight: '700', marginBottom: tv(10) },
  emptyDesc: { marginBottom: tv(24), textAlign: 'center' },
  emptyBtn: {
    paddingHorizontal: tv(32),
    paddingVertical: tv(12),
    borderRadius: tv(8),
  },
  emptyBtnText: { fontWeight: '700' },
});

export default HomeScreen;