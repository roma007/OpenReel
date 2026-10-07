import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Episode, Media, PlaySource, WatchHistory } from '@openreel/core';
import { resolveDefaultPlayTarget } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider, getStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import { TV_EPISODE, TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 详情页。
 *
 * 布局：左侧海报 + 简介 + 操作按钮（播放/收藏/返回），右侧选集区。
 * 遥控交互：焦点初始落在「播放」；选集为横向行网格（左右换集、上下在「播放/收藏」与选集间移动）。
 *
 * 返回还原：由 route.params.from 决定返回目标（category/search/favorite/history/home），
 * 并携带进入时的页码/筛选/搜索词，保证「从哪来回哪去」。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Detail'>;

export function DetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const mediaId = route.params.mediaId;

  const [media, setMedia] = useState<Media | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [playSources, setPlaySources] = useState<PlaySource[]>([]);
  const [isFav, setIsFav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpId, setSelectedEpId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const provider = getProvider();
    try {
      const m = await provider.getMediaById(mediaId);
      if (!m) {
        setError('影片不存在或已删除');
        setMedia(null);
        return;
      }
      setMedia(m);

      const eps = await provider.getEpisodesByMediaId(mediaId);
      const sorted = [...(eps || [])].sort(
        (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
      );
      setEpisodes(sorted);

      // 续播位置：与手机端共用 resolveDefaultPlayTarget（同语义：最近观看未看完则续播）
      const target = await resolveDefaultPlayTarget(provider, m);
      if (target) {
        setSelectedEpId(target.episodeId);
        const srcs = await provider.getPlaySourcesByEpisodeId(target.episodeId);
        setPlaySources(srcs || []);
      }

      const fav = await provider.getAllFavorites();
      setIsFav((fav || []).some((f) => f.mediaId === mediaId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    load();
  }, [load]);

  // 切换剧集时更新其播放线路（线路与集强相关，不能沿用上一集）
  useEffect(() => {
    if (selectedEpId == null) return;
    getProvider()
      .getPlaySourcesByEpisodeId(selectedEpId)
      .then((srcs) => setPlaySources(srcs || []))
      .catch(() => setPlaySources([]));
  }, [selectedEpId]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => focusRegistry.requestInitialFocus('detail-play'), 120);
    return () => clearTimeout(t);
  }, [loading]);

  const goBack = useCallback(() => {
    const p = route.params || {};
    switch (p.from) {
      case 'category':
        // 回已挂载的分类页：用 pop（与遥控 BACK 同路径），分类页参数/筛选/滚动位置天然保留。
        // 不可用 navigate('Category', { title: p.title, ... }) —— Detail 的 title 是「视频名」，
        // 回填会覆盖分类页标题（实测返回后标题变成视频名）。
        nav.goBack();
        break;
      case 'search':
        nav.navigate('Search', { keyword: p.searchKeyword, page: p.page });
        break;
      case 'favorite':
        nav.navigate('Favorites', { page: p.page });
        break;
      case 'history':
        nav.navigate('History', { page: p.page });
        break;
      default:
        nav.goBack();
    }
  }, [nav, route.params]);

  const play = useCallback(
    (epId?: number, sourceId?: string) => {
      const ep = epId ?? selectedEpId ?? episodes[0]?.id;
      if (!ep) return;
      const src = sourceId ?? playSources.find((s) => s.url)?.sourceId;
      nav.navigate('Play', {
        mediaId,
        episodeId: ep,
        sourceId: src,
        title: media?.title,
      });
    },
    [selectedEpId, episodes, playSources, mediaId, nav, media?.title],
  );

  const toggleFav = useCallback(async () => {
    const store = getStore();
    const next = await store.getState().toggleFav(mediaId);
    setIsFav(!!next);
  }, [mediaId]);

  const sourcesForSelected = useMemo(
    () => playSources.filter((s) => s.url),
    [playSources],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontSize: scale(19) }}>正在加载…</Text>
      </View>
    );
  }

  if (error || !media) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.error, fontSize: scale(20) }}>{error || '影片不存在'}</Text>
        <View style={{ marginTop: tv(20) }}>
          <TVButton id="detail-error-back" label="返回" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="detail-back" label="返回" onPress={goBack} testID="tv-detail-back" />
        <Text
          numberOfLines={1}
          style={[styles.topTitle, { color: colors.foreground, fontSize: scale(22) }]}
        >
          {media.title}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.poster, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {media.posterUrl ? (
              <Image source={{ uri: media.posterUrl }} style={styles.posterImg} />
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>无封面</Text>
            )}
          </View>

          <View style={styles.heroInfo}>
            <Text style={[styles.title, { color: colors.foreground, fontSize: scale(30) }]}>
              {media.title}
            </Text>
            <Text style={[styles.meta, { color: colors.mutedForeground, fontSize: scale(17) }]}>
              {[media.year, media.type === 'MOVIE' ? '电影' : '剧集', ...(media.genres || [])]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {media.rating != null && media.rating > 0 ? (
              <Text style={[styles.rating, { color: colors.warning, fontSize: scale(19) }]}>
                {media.rating.toFixed(1)} 分
              </Text>
            ) : null}

            <View style={styles.actions}>
              <TVButton
                id="detail-play"
                label={selectedEpId != null ? '继续播放' : '播放'}
                variant="primary"
                scaleOnFocus
                onPress={() => play()}
                testID="tv-detail-play"
              />
              <TVButton
                id="detail-fav"
                label={isFav ? '取消收藏' : '收藏'}
                onPress={toggleFav}
                testID="tv-detail-fav"
              />
            </View>

            {media.description ? (
              <Text
                numberOfLines={4}
                style={[styles.desc, { color: colors.textSecondary, fontSize: scale(16) }]}
              >
                {media.description}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 播放线路：只有一集时也需要显示线路切换 */}
        {sourcesForSelected.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
              播放线路
            </Text>
            <View style={styles.rowWrap}>
              {sourcesForSelected.map((s) => (
                <TVFocusable
                  key={s.id}
                  id={`src:${s.id}`}
                  onPress={() => play(undefined, s.sourceId)}
                  style={[styles.sourceItem, { backgroundColor: colors.surface }]}
                  testID={`tv-detail-source-${s.id}`}
                >
                  <Text style={{ color: colors.foreground, fontSize: scale(16) }}>
                    {s.sourceName || s.sourceId}
                    {s.language ? ` · ${s.language}` : ''}
                  </Text>
                </TVFocusable>
              ))}
            </View>
          </View>
        ) : null}

        {/* 选集 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
            {media.type === 'MOVIE' ? '播放线路' : `选集 (${episodes.length})`}
          </Text>
          {episodes.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: scale(16) }}>
              暂无可播放剧集，请先采集该影片
            </Text>
          ) : (
            <View style={styles.epGrid}>
              {episodes.map((ep) => (
                <TVFocusable
                  key={ep.id}
                  id={`ep:${ep.id}`}
                  onPress={() => {
                    setSelectedEpId(ep.id);
                    play(ep.id);
                  }}
                  focusColor={colors.success}
                  style={[
                    styles.epItem,
                    {
                      backgroundColor:
                        selectedEpId === ep.id ? colors.buttonPrimaryBg : colors.surface,
                    },
                  ]}
                  testID={`tv-detail-episode-${ep.episodeNumber}`}
                >
                  <Text
                    style={{
                      color: selectedEpId === ep.id ? colors.buttonPrimaryText : colors.foreground,
                      fontSize: scale(17),
                      fontWeight: '600',
                    }}
                  >
                    {media.type === 'MOVIE' ? '正片' : `第${ep.episodeNumber}集`}
                  </Text>
                  {ep.title ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        color:
                          selectedEpId === ep.id
                            ? colors.buttonPrimaryText
                            : colors.mutedForeground,
                        fontSize: scale(13),
                        marginTop: 3,
                      }}
                    >
                      {ep.title}
                    </Text>
                  ) : null}
                </TVFocusable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(14),
    borderBottomWidth: 1,
  },
  topTitle: { marginLeft: tv(18), fontWeight: '700', flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(24), paddingBottom: tv(48) },
  hero: { flexDirection: 'row' },
  poster: {
    width: tv(280),
    height: tv(420),
    borderRadius: tv(10),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterImg: { width: '100%', height: '100%' },
  heroInfo: { flex: 1, marginLeft: tv(36), paddingRight: tv(20) },
  title: { fontWeight: '800', marginBottom: tv(8) },
  meta: { marginBottom: tv(8) },
  rating: { fontWeight: '700', marginBottom: tv(14) },
  actions: { flexDirection: 'row', marginBottom: tv(16), marginTop: tv(6) },
  desc: { lineHeight: tv(22) },
  section: { marginTop: tv(30) },
  sectionTitle: { fontWeight: '700', marginBottom: tv(12) },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  sourceItem: {
    paddingHorizontal: tv(18),
    paddingVertical: tv(10),
    borderRadius: tv(8),
    marginRight: tv(12),
    marginBottom: tv(12),
  },
  epGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // 负 margin 抵消 item 间距，保持与左侧信息区对齐
    marginHorizontal: -tv(4),
  },
  epItem: {
    width: TV_EPISODE.width,
    height: TV_EPISODE.height,
    borderRadius: tv(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: TV_EPISODE.gap,
    marginBottom: TV_EPISODE.gap,
    paddingHorizontal: tv(8),
  },
});

export default DetailScreen;