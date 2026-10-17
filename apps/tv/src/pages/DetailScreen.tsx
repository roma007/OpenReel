import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Modal } from 'react-native';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Episode, Media, PlaySource, VideoSource, WatchHistory } from '@openreel/core';
import { resolveDefaultPlayTarget, UNCATEGORIZED_GENRE } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider, getStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import { TVChipMultiSelect } from '../components/TVChipMultiSelect';
import { useBackgroundImageStore } from '../stores/backgroundImageStore';
import { TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 详情页。
 *
 * 布局：标题栏显示视频名，右上角为「收藏 / 隐藏」操作按钮；左侧海报 + 右侧信息列（年份/类型、评分、简介、导演/演员、播放线路），
 * 下方为选集区（对齐桌面端 PlayPage：多季时「第 N 季」按钮行 + 嵌合面板——左竖排视频源 tab + 右剧集 flex-wrap 网格；电影不显示面板，可播入口为信息列播放线路 chips）。
 * 遥控交互：焦点初始落在标题栏右上角「收藏」。
 *
 * 返回还原：由 route.params.from 决定返回目标（category/search/favorite/history/home），
 * 并携带进入时的页码/筛选/搜索词，保证「从哪来回哪去」。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Detail'>;

/**
 * 信息区「标签列」宽度与列间距。
 * 隐藏测量文本的 left 偏移必须与之相等，才能保证「测量列宽 == 可见文本列宽」，行数判定才准。
 */
const DETAIL_TAG_W = tv(84);
const DETAIL_GAP = tv(10);

/**
 * 「隐藏」弹层的焦点监狱前缀（与移动端播放页「隐藏」同语义：多选子类型 → 批量隐藏）。
 * 弹层打开期间焦点只能落在 `hide:` 开头的元素上（同 PlayScreen 面板做法）。
 */
const HIDE_SCOPE = 'hide:';

/**
 * 剧集按钮文案：显示「集标题」（用户决策）；标题为空时兜底为「正片」(电影) /「第N集」(剧集)，
 * 避免空白按钮（数据实查：577743 条剧集中仅 4035 条标题为空，占 0.7%）。
 */
function episodeLabel(ep: Episode, type: Media['type']): string {
  const title = ep.title?.trim();
  if (title) return title;
  return type === 'MOVIE' ? '正片' : `第${ep.episodeNumber}集`;
}

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
  // 简介 / 导演演员「各自独立」的收缩-展开态（需求：分别默认收缩，点「展开」显示完整内容，就地展开）
  const [introExpanded, setIntroExpanded] = useState(false);
  const [castExpanded, setCastExpanded] = useState(false);
  // 溢出判定：照搬移动端做法（隐藏测量文本 onTextLayout 测真实行数），仅真正溢出才给「展开」入口
  const [introOverflow, setIntroOverflow] = useState(false);
  const [castOverflow, setCastOverflow] = useState(false);
  // 「隐藏」弹层（与移动端播放页「隐藏」按钮同功能：多选子类型 → 批量隐藏）
  const [hideOpen, setHideOpen] = useState(false);
  const [hideGenres, setHideGenres] = useState<string[]>([]);
  const [hiding, setHiding] = useState(false);
  // TV 端不用 RN Alert（遥控对焦点不友好，见 VideoManagementScreen 注释），结果用页内文本
  const [notice, setNotice] = useState<string | null>(null);
  // 视频源 + 剧集（对齐桌面 PlayPage 嵌合面板：左竖排源 tab + 右剧集网格）
  const [episodeSources, setEpisodeSources] = useState<VideoSource[]>([]);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);
  const [sourceEpisodes, setSourceEpisodes] = useState<Episode[]>([]);
  // 季（对齐桌面：displaySeasons = seriesMedia 季列表优先，否则 db seasons；跨 media 季跳目标影片）
  const [currentSeason, setCurrentSeason] = useState(1);
  // 剧集面板加载态（对齐桌面「剧集加载中...」）
  const [epsLoading, setEpsLoading] = useState(false);
  // 已看集（观看历史 episodeId 集合，对齐桌面已看集半透明）
  const [watchedEpIds, setWatchedEpIds] = useState<Set<number>>(new Set());
  // 电影播放线路：遍历所有集拍平（对齐桌面 movieLines），多语言时 selectedLanguage 筛选
  const [movieLines, setMovieLines] = useState<{ episodeId: number; source: PlaySource }[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const seasons = useAppStore((s) => s.seasons);
  const seriesMedia = useAppStore((s) => s.seriesMedia);

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

      // 季数据（对齐桌面 PlayPage loadSeasons + loadSeriesMedia：store 共享 state）
      const st = getStore().getState();
      st.loadSeasons(mediaId);
      st.loadSeriesMedia(mediaId);

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

      // 当前季：默认续播集所在季（对齐桌面 currentSeason 语义），无续播则 1
      const targetEp = target ? sorted.find((e) => e.id === target.episodeId) : undefined;
      const season0 = targetEp?.seasonNumber ?? 1;
      setCurrentSeason(season0);

      // 视频源列表（对齐桌面 loadEpisodeSources(media.id, currentSeason)：按季 DISTINCT 可播源）
      const srcList = (await provider.getEpisodeSourcesByMediaId(mediaId, season0)) || [];
      setEpisodeSources(srcList);

      // 默认视频源：优先续播目标集所属源（与移动端「恢复上次播放源」同语义），否则第一个源
      const defaultSrc =
        targetEp?.sourceId && srcList.some((s) => s.id === targetEp.sourceId)
          ? targetEp.sourceId
          : (srcList[0]?.id ?? null);
      setCurrentSourceId(defaultSrc);

      // 已看集：观看历史 episodeId 集合（对齐桌面已看集半透明）
      const hist = await provider.getAllWatchHistoryByMediaId(mediaId).catch(() => [] as WatchHistory[]);
      setWatchedEpIds(new Set((hist || []).map((h) => h.episodeId).filter(Boolean) as number[]));

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

  // 背景图：聚焦时用当前影片海报，失焦清空回落到默认背景图（页面有视频图即用它）
  const setBackgroundImage = useBackgroundImageStore((s) => s.setImageUrl);
  useFocusEffect(
    useCallback(() => {
      setBackgroundImage(media?.posterUrl ?? null);
      return () => setBackgroundImage(null);
    }, [media, setBackgroundImage]),
  );

  // 切换剧集时更新其播放线路（线路与集强相关，不能沿用上一集）
  useEffect(() => {
    if (selectedEpId == null) return;
    getProvider()
      .getPlaySourcesByEpisodeId(selectedEpId)
      .then((srcs) => setPlaySources(srcs || []))
      .catch(() => setPlaySources([]));
  }, [selectedEpId]);

  // 电影：遍历所有集拍平播放线路（对齐桌面 PlayPage movieLines effect）
  useEffect(() => {
    if (media?.type !== 'MOVIE' || episodes.length === 0) {
      setMovieLines([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const provider = getProvider();
        const lists = await Promise.all(
          episodes.map(async (ep) => {
            const ps = await provider.getPlaySourcesByEpisodeId(ep.id);
            return ps.map((s) => ({ episodeId: ep.id, source: s }));
          }),
        );
        if (!alive) return;
        setMovieLines(lists.flat().filter((l) => !!l.source.url));
        const unique = [...new Set(lists.flat().map((l) => l.source.language).filter(Boolean))] as string[];
        if (unique.length > 1) {
          setSelectedLanguage((prev) => (prev && unique.includes(prev) ? prev : unique[0]));
        } else {
          setSelectedLanguage(null);
        }
      } catch {
        if (alive) setMovieLines([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [media?.type, episodes]);

  // 切季时按季重查可播源（对齐桌面 loadEpisodeSources(media.id, currentSeason)），
  // 当前源失效时回落到该季第一个源（对齐桌面 PlayPage 源校正 effect）。
  useEffect(() => {
    let alive = true;
    getProvider()
      .getEpisodeSourcesByMediaId(mediaId, currentSeason)
      .then((srcList) => {
        if (!alive) return;
        const list = srcList || [];
        setEpisodeSources(list);
        setCurrentSourceId((prev) =>
          prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? null),
        );
      })
      .catch(() => {
        if (alive) setEpisodeSources([]);
      });
    return () => {
      alive = false;
    };
  }, [mediaId, currentSeason]);

  // 切换视频源/季时重载该源剧集（对齐桌面 loadEpisodes(media.id, currentSeason, selectedSourceId)）
  useEffect(() => {
    let alive = true;
    setEpsLoading(true);
    const provider = getProvider();
    const req = currentSourceId
      ? provider.getEpisodesByMediaId(mediaId, currentSeason, currentSourceId)
      : provider.getEpisodesByMediaId(mediaId, currentSeason);
    req
      .then((eps) => {
        if (!alive) return;
        const sorted = [...(eps || [])].sort((a, b) => a.episodeNumber - b.episodeNumber);
        setSourceEpisodes(sorted);
      })
      .catch(() => {
        if (alive) setSourceEpisodes([]);
      })
      .finally(() => {
        if (alive) setEpsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mediaId, currentSeason, currentSourceId]);

  // 季→media 映射与季列表（复刻桌面 PlayPage L423-435：seriesMedia 季列表优先，否则 db seasons）
  const seasonToMediaMap = useMemo(() => {
    const map = new Map<number, number>();
    seriesMedia.forEach((m) => {
      if (m.seriesSeason) map.set(m.seriesSeason, m.id);
    });
    return map;
  }, [seriesMedia]);

  const seasonsFromSeries = useMemo(
    () => [...new Set(seriesMedia.map((m) => m.seriesSeason ?? 1))].sort((a, b) => a - b),
    [seriesMedia],
  );
  const displaySeasons = seasonsFromSeries.length > 0 ? seasonsFromSeries : seasons;

  // 点季：跨 media 季跳目标影片详情（保留原返回链参数），同 media 内就地切季（对齐桌面 handleSeasonClick）
  const handleSeasonClick = useCallback(
    async (s: number) => {
      const targetId = seasonToMediaMap.get(s);
      if (targetId && targetId !== mediaId) {
        const targetMedia = await getProvider().getMediaById(targetId).catch(() => null);
        if (targetMedia) {
          nav.replace('Detail', { ...route.params, mediaId: targetId, title: targetMedia.title });
          return;
        }
      }
      setCurrentSeason(s);
    },
    [seasonToMediaMap, mediaId, nav, route.params],
  );

  useEffect(() => {
    if (loading) return;
    // 播放按钮已按需求删除（起播改为点「选集 / 线路」），初始焦点落到标题栏右上角「收藏」
    const t = setTimeout(() => focusRegistry.requestInitialFocus('detail-fav'), 120);
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
      const ep = epId ?? selectedEpId ?? sourceEpisodes[0]?.id ?? episodes[0]?.id;
      if (!ep) return;
      const src = sourceId ?? currentSourceId ?? playSources.find((s) => s.url)?.sourceId;
      nav.navigate('Play', {
        mediaId,
        episodeId: ep,
        sourceId: src,
        title: media?.title,
      });
    },
    [selectedEpId, sourceEpisodes, episodes, currentSourceId, playSources, mediaId, nav, media?.title],
  );

  // 点集 → 选中 + 起播（携带当前视频源）
  const pickEpisode = useCallback(
    (ep: Episode) => {
      setSelectedEpId(ep.id);
      play(ep.id, currentSourceId ?? undefined);
    },
    [play, currentSourceId],
  );

  const toggleFav = useCallback(async () => {
    const store = getStore();
    const next = await store.getState().toggleFav(mediaId);
    setIsFav(!!next);
  }, [mediaId]);

  // 播放线路条目（对齐桌面 lineEntries）：电影用 movieLines（多语言按选中语言过滤），
  // 其它类型/电影无 movieLines 时用当前选中集线路
  const lineEntries = useMemo(() => {
    if (media?.type === 'MOVIE' && movieLines.length > 0) {
      const langs = [...new Set(movieLines.map((l) => l.source.language).filter(Boolean))] as string[];
      if (langs.length > 1 && selectedLanguage && langs.includes(selectedLanguage)) {
        return movieLines.filter((l) => (l.source.language ?? null) === selectedLanguage);
      }
      return movieLines;
    }
    const epId = selectedEpId ?? episodes[0]?.id ?? 0;
    return playSources.filter((s) => s.url).map((s) => ({ episodeId: epId, source: s }));
  }, [media?.type, movieLines, selectedLanguage, playSources, selectedEpId, episodes]);

  // 电影可选语言（>1 时显示语言筛选行，对齐桌面）
  const movieLanguages = useMemo(
    () =>
      media?.type === 'MOVIE'
        ? ([...new Set(movieLines.map((l) => l.source.language).filter(Boolean))] as string[])
        : [],
    [media?.type, movieLines],
  );

  // ─── 隐藏（与移动端播放页「隐藏」一致：多选当前影片的子类型并批量隐藏） ───
  // 子类型来源：影片自身 genres；为空时用「未分类」，与移动端 PlayScreen 同逻辑。
  const hideGenreItems = useMemo(
    () => (media?.genres?.length ? media.genres : [UNCATEGORIZED_GENRE]),
    [media],
  );

  const openHide = useCallback(() => {
    setNotice(null);
    setHideGenres([]);
    setHideOpen(true);
  }, []);

  const closeHide = useCallback(() => setHideOpen(false), []);

  const toggleHideGenre = useCallback((g: string) => {
    setHideGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }, []);

  const confirmHide = useCallback(async () => {
    if (hideGenres.length === 0 || hiding) return;
    setHiding(true);
    try {
      const r = await getStore().getState().hideMediaByGenres(hideGenres);
      setHideOpen(false);
      setNotice(`已隐藏 ${r.hidden} 个「${hideGenres.join('/')}」类视频`);
    } catch (e) {
      setHideOpen(false);
      setNotice(`隐藏失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setHiding(false);
    }
  }, [hideGenres, hiding]);

  // 弹层焦点监狱：打开时锁定在 hide: 前缀内，关闭后焦点还给「隐藏」按钮
  const hideFirstId = hideGenreItems.length
    ? `${HIDE_SCOPE}genre:${hideGenreItems[0]}`
    : `${HIDE_SCOPE}cancel`;
  const hideFirstIdRef = useRef(hideFirstId);
  hideFirstIdRef.current = hideFirstId;

  useEffect(() => {
    if (!hideOpen) return;
    const first = hideFirstIdRef.current;
    focusRegistry.pushScope(HIDE_SCOPE);
    focusRegistry.requestInitialFocus(first);
    const t = setTimeout(() => focusRegistry.focusNode(first), 80);
    return () => {
      clearTimeout(t);
      focusRegistry.popScope();
      focusRegistry.requestInitialFocus('detail-hide');
    };
  }, [hideOpen]);

  // ─── 选集：页面直接平铺，无需弹层状态与焦点监狱 ───

  // 导演/演员文案：与移动端播放页同格式（`导演：A、B` 换行 `主演：C、D`，缺项省略该行）
  const castText = useMemo(() => {
    if (!media) return '';
    const d = media.directors?.length ? `导演：${media.directors.join('、')}` : '';
    const a = media.actors?.length ? `主演：${media.actors.join('、')}` : '';
    return [d, a].filter(Boolean).join('\n');
  }, [media]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: 'transparent' }]}>
        <Text style={{ color: colors.mutedForeground, fontSize: scale(19) }}>正在加载…</Text>
      </View>
    );
  }

  if (error || !media) {
    return (
      <View style={[styles.center, { backgroundColor: 'transparent' }]}>
        <Text style={{ color: colors.error, fontSize: scale(20) }}>{error || '影片不存在'}</Text>
        <View style={{ marginTop: tv(20) }}>
          <TVButton id="detail-error-back" label="返回" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="detail-back" label="返回" onPress={goBack} testID="tv-detail-back" />
        <Text
          numberOfLines={1}
          style={[styles.topTitle, { color: colors.foreground, fontSize: scale(22) }]}
        >
          {media.title}
        </Text>
        {/* 收藏 / 隐藏：按需求移到标题栏右上角（id/testID 不变，初始焦点与弹层还焦逻辑不受影响） */}
        <View style={styles.topActions}>
          <TVButton
            id="detail-fav"
            label={isFav ? '取消收藏' : '收藏'}
            onPress={toggleFav}
            testID="tv-detail-fav"
          />
          <TVButton
            id="detail-hide"
            label="隐藏"
            onPress={openHide}
            style={styles.lastTopAction}
            testID="tv-detail-hide"
          />
        </View>
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

            {notice ? (
              <Text
                style={{ color: colors.foreground, fontSize: scale(16), marginBottom: tv(10) }}
                testID="tv-detail-notice"
              >
                {notice}
              </Text>
            ) : null}

            {/* 简介：默认收缩 1 行；仅溢出时给「展开」入口，点按就地展开/收起（与移动端播放页同形态） */}
            {media.description ? (
              <View style={styles.detailSection}>
                {/* 隐藏测量文本：与可见文本同列宽，测真实行数，超 1 行才算溢出 */}
                <Text
                  style={[
                    styles.detailMeasure,
                    { left: DETAIL_TAG_W + DETAIL_GAP, fontSize: scale(16) },
                  ]}
                  onTextLayout={(e) => setIntroOverflow(e.nativeEvent.lines.length > 1)}
                >
                  {media.description}
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailTag, { color: colors.foreground, fontSize: scale(16) }]}>
                    简介
                  </Text>
                  <Text
                    numberOfLines={introExpanded ? undefined : 1}
                    style={[styles.detailText, { color: colors.textSecondary, fontSize: scale(16) }]}
                  >
                    {media.description}
                  </Text>
                  {introOverflow ? (
                    <TVFocusable
                      id="detail-intro-toggle"
                      onPress={() => setIntroExpanded((v) => !v)}
                      style={[styles.togglePill, { backgroundColor: colors.surface }]}
                      testID="tv-detail-intro-toggle"
                    >
                      <Text style={{ color: colors.foreground, fontSize: scale(15) }}>
                        {introExpanded ? '收起' : '展开'}
                      </Text>
                    </TVFocusable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* 导演/演员：默认收缩 2 行；溢出才给「展开」入口 */}
            {castText ? (
              <View style={styles.detailSection}>
                {/* 隐藏测量文本：与可见文本同列宽，测真实行数，超 2 行才算溢出 */}
                <Text
                  style={[
                    styles.detailMeasure,
                    { left: DETAIL_TAG_W + DETAIL_GAP, fontSize: scale(16) },
                  ]}
                  onTextLayout={(e) => setCastOverflow(e.nativeEvent.lines.length > 2)}
                >
                  {castText}
                </Text>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailTag, { color: colors.foreground, fontSize: scale(16) }]}>
                    导演/演员
                  </Text>
                  <Text
                    numberOfLines={castExpanded ? undefined : 2}
                    style={[styles.detailText, { color: colors.textSecondary, fontSize: scale(16) }]}
                  >
                    {castText}
                  </Text>
                  {castOverflow ? (
                    <TVFocusable
                      id="detail-cast-toggle"
                      onPress={() => setCastExpanded((v) => !v)}
                      style={[styles.togglePill, { backgroundColor: colors.surface }]}
                      testID="tv-detail-cast-toggle"
                    >
                      <Text style={{ color: colors.foreground, fontSize: scale(15) }}>
                        {castExpanded ? '收起' : '展开'}
                      </Text>
                    </TVFocusable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* 播放线路：按需求移到「导演/演员」下面，与简介/导演演员同列（标签列对齐）。
                只有一集时也需要显示线路切换。对齐桌面：电影遍历所有集拍平 + 「源 · 画质 (序号)」文案
                + 多语言时语言筛选行。 */}
            {movieLanguages.length > 1 ? (
              <View style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailTag, { color: colors.foreground, fontSize: scale(16) }]}>
                    语言
                  </Text>
                  <View style={styles.sourceWrap}>
                    {movieLanguages.map((lang) => {
                      const active = selectedLanguage === lang;
                      return (
                        <TVFocusable
                          key={lang}
                          id={`lang:${lang}`}
                          onPress={() => setSelectedLanguage(lang)}
                          style={[
                            styles.sourceItem,
                            { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                          ]}
                          testID={`tv-detail-lang-${lang}`}
                        >
                          <Text
                            style={{
                              color: active ? colors.buttonPrimaryText : colors.foreground,
                              fontSize: scale(16),
                            }}
                          >
                            {lang}
                          </Text>
                        </TVFocusable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}
            {lineEntries.length > 0 ? (
              <View style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailTag, { color: colors.foreground, fontSize: scale(16) }]}>
                    播放线路
                  </Text>
                  <View style={styles.sourceWrap}>
                    {(() => {
                      // 对齐桌面 chips 文案算法：同名同画质多条时追加 (序号)
                      const sourceKeyMap = new Map<string, number>();
                      lineEntries.forEach(({ source }) => {
                        const key = `${source.sourceName || ''}_${source.quality || ''}`;
                        sourceKeyMap.set(key, (sourceKeyMap.get(key) || 0) + 1);
                      });
                      const keyIndexMap = new Map<string, number>();
                      return lineEntries.map(({ episodeId, source }, i) => {
                        const key = `${source.sourceName || ''}_${source.quality || ''}`;
                        const count = sourceKeyMap.get(key) || 1;
                        const idx = (keyIndexMap.get(key) || 0) + 1;
                        keyIndexMap.set(key, idx);
                        const baseName = source.sourceName || `线路${i + 1}`;
                        const qualityStr = source.quality ? ` · ${source.quality}` : '';
                        const suffix = count > 1 ? ` (${idx})` : '';
                        return (
                          <TVFocusable
                            key={`${episodeId}-${source.id}`}
                            id={`src:${source.id}`}
                            onPress={() => play(episodeId, source.sourceId)}
                            style={[styles.sourceItem, { backgroundColor: colors.surface }]}
                            testID={`tv-detail-source-${source.id}`}
                          >
                            <Text style={{ color: colors.foreground, fontSize: scale(16) }}>
                              {baseName}
                              {qualityStr}
                              {suffix}
                            </Text>
                          </TVFocusable>
                        );
                      });
                    })()}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* 选集区：对齐桌面 PlayPage——多季时「第 N 季」行 + 嵌合面板（左竖排源 tab + 右剧集网格）。
            电影不渲染面板（桌面同规则），可播入口为信息列「播放线路」chips。 */}
        {episodes.length === 0 ? (
          <View style={styles.section}>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(16) }}>
              无可播放的剧集或线路
            </Text>
          </View>
        ) : media.type !== 'MOVIE' ? (
          <View style={styles.section}>
            {/* 季按钮行（多季时显示，对齐桌面 displaySeasons 行） */}
            {displaySeasons.length > 1 ? (
              <View style={styles.seasonRow}>
                {displaySeasons.map((s) => {
                  const isCurrent =
                    seasonToMediaMap.get(s) === mediaId ||
                    (!seasonToMediaMap.has(s) && currentSeason === s);
                  return (
                    <TVFocusable
                      key={s}
                      id={`season:${s}`}
                      onPress={() => handleSeasonClick(s)}
                      style={[
                        styles.seasonBtn,
                        { backgroundColor: isCurrent ? colors.buttonPrimaryBg : colors.surface },
                      ]}
                      testID={`tv-detail-season-${s}`}
                    >
                      <Text
                        style={{
                          color: isCurrent ? colors.buttonPrimaryText : colors.foreground,
                          fontSize: scale(15),
                          fontWeight: isCurrent ? '700' : '500',
                        }}
                      >
                        第 {s} 季
                      </Text>
                    </TVFocusable>
                  );
                })}
              </View>
            ) : null}

            {/* 嵌合面板：左竖排视频源 tab（多源时）+ 右剧集网格（同一圆角容器） */}
            <View style={styles.epPanel}>
              <View style={styles.epPanelRow}>
                {episodeSources.length > 1 ? (
                  <View style={styles.srcTabCol}>
                    {episodeSources.map((s) => {
                      const active = s.id === currentSourceId;
                      return (
                        <TVFocusable
                          key={s.id}
                          id={`vsrc:${s.id}`}
                          onPress={() => setCurrentSourceId(s.id)}
                          style={[
                            styles.srcTab,
                            {
                              backgroundColor: active ? colors.cardAccent : colors.cardDim,
                              width: active ? tv(150) : tv(120),
                            },
                          ]}
                          testID={`tv-detail-vsrc-${s.id}`}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: active ? colors.buttonPrimaryText : colors.textSecondary,
                              fontSize: scale(14),
                              fontWeight: active ? '700' : '500',
                            }}
                          >
                            {s.name}
                          </Text>
                        </TVFocusable>
                      );
                    })}
                  </View>
                ) : null}
                <View style={[styles.epPanelBody, { backgroundColor: colors.cardAccent }]}>
                  {epsLoading ? (
                    <Text style={{ color: colors.textSecondary, fontSize: scale(15) }}>
                      剧集加载中...
                    </Text>
                  ) : sourceEpisodes.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>
                      暂无剧集
                    </Text>
                  ) : (
                    <View style={styles.epGrid}>
                      {sourceEpisodes.map((ep) => {
                        const isCur = ep.id === selectedEpId;
                        const watched = watchedEpIds.has(ep.id);
                        const dur =
                          typeof ep.duration === 'number' && ep.duration > 0 ? ep.duration : null;
                        return (
                          <TVFocusable
                            key={ep.id}
                            id={`ep:${ep.id}`}
                            onPress={() => pickEpisode(ep)}
                            focusColor={colors.success}
                            style={[
                              styles.epItem,
                              {
                                backgroundColor: isCur ? colors.buttonPrimaryBg : colors.cardDim,
                                opacity: watched && !isCur ? 0.5 : 1,
                              },
                            ]}
                            testID={`tv-detail-episode-${ep.episodeNumber}`}
                          >
                            <Text
                              numberOfLines={2}
                              style={{
                                color: isCur ? colors.buttonPrimaryText : colors.textSecondary,
                                fontSize: scale(15),
                                lineHeight: scale(19),
                                fontWeight: '600',
                                textAlign: 'center',
                              }}
                            >
                              {episodeLabel(ep, media.type)}
                              {dur ? (
                                <Text
                                  style={{
                                    fontSize: scale(11),
                                    color: colors.mutedForeground,
                                    fontWeight: '400',
                                  }}
                                >
                                  {` ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`}
                                </Text>
                              ) : null}
                            </Text>
                          </TVFocusable>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* 隐藏弹层：与移动端播放页「隐藏」一致（多选子类型 → 批量隐藏）。
          遵守「弹窗不透明度规则」：面板底色用不透明 colors.background。 */}
      <Modal
        visible={hideOpen}
        transparent
        animationType="none"
        onRequestClose={closeHide}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: scale(22) }]}>
              隐藏
            </Text>
            <Text
              style={[styles.modalDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}
            >
              选择要隐藏的子类型，隐藏后此类视频将不再显示。
            </Text>

            <TVChipMultiSelect
              idPrefix={`${HIDE_SCOPE}genre`}
              items={hideGenreItems}
              selected={hideGenres}
              onToggle={toggleHideGenre}
              tone="warning"
              emptyText="该影片暂无子类型"
              testIDPrefix="tv-detail-hide-genre"
            />

            <View style={styles.modalActions}>
              <TVButton
                id={`${HIDE_SCOPE}cancel`}
                label="取消"
                onPress={closeHide}
                testID="tv-detail-hide-cancel"
              />
              <TVButton
                id={`${HIDE_SCOPE}confirm`}
                label={hiding ? '隐藏中…' : `隐藏 (${hideGenres.length})`}
                variant="primary"
                disabled={hiding || hideGenres.length === 0}
                onPress={confirmHide}
                testID="tv-detail-hide-confirm"
              />
            </View>
          </View>
        </View>
      </Modal>
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
  // 标题栏右上角操作按钮组（收藏 / 隐藏）；TVButton 自带 marginRight:tv(14)，末按钮清零贴齐右内边距
  topActions: { flexDirection: 'row', alignItems: 'center' },
  lastTopAction: { marginRight: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(24), paddingBottom: tv(48) },
  hero: { flexDirection: 'row' },
  poster: {
    // 海报尺寸 = 原 280×420(dp) 的 2/3（用户要求：缩小视频详情页视频图至当前 2/3）
    width: tv((280 * 2) / 3),
    height: tv((420 * 2) / 3),
    borderRadius: tv(10),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterImg: { width: '100%', height: '100%' },
  heroInfo: { flex: 1, marginLeft: tv(36), paddingRight: tv(20) },
  meta: { marginBottom: tv(8) },
  rating: { fontWeight: '700', marginBottom: tv(14) },
  // 简介 / 导演演员信息区：标签列 + 文本列 + 「展开/收起」入口
  detailSection: { marginTop: tv(10) },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: DETAIL_GAP },
  detailTag: { width: DETAIL_TAG_W, fontWeight: '600' },
  detailText: { flex: 1, lineHeight: tv(24) },
  // 隐藏测量文本：占满文本列宽、高度 0、透明，仅用于 onTextLayout 取真实行数
  detailMeasure: { position: 'absolute', right: 0, opacity: 0, height: 0 },
  togglePill: {
    paddingHorizontal: tv(14),
    paddingVertical: tv(5),
    borderRadius: tv(8),
    marginTop: tv(1),
  },
  section: { marginTop: tv(30) },
  // 播放线路 chips 容器（在信息列文本列内换行）
  sourceWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  sourceItem: {
    paddingHorizontal: tv(18),
    paddingVertical: tv(10),
    borderRadius: tv(8),
    marginRight: tv(12),
    marginBottom: tv(12),
  },
  // 隐藏弹层（面板不透明，遮罩半透明）
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '70%',
    maxWidth: tv(700),
    borderRadius: tv(16),
    paddingHorizontal: tv(40),
    paddingVertical: tv(32),
  },
  modalTitle: { fontWeight: '700' },
  modalDesc: { marginTop: tv(8), marginBottom: tv(20), lineHeight: tv(22) },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: tv(20), gap: tv(16) },
  // 选集嵌合面板（对齐桌面 PlayPage：块级撑满整行，圆角容器，左竖排源 tab 列 + 右剧集面板）
  epPanel: {
    borderRadius: tv(10),
    overflow: 'hidden',
  },
  epPanelRow: { flexDirection: 'row', alignItems: 'stretch' },
  srcTabCol: { flexShrink: 0 },
  srcTab: {
    justifyContent: 'center',
    paddingVertical: tv(10),
    paddingHorizontal: tv(12),
    marginBottom: tv(6),
    borderRadius: tv(6),
  },
  epPanelBody: {
    flex: 1,
    minWidth: 0,
    padding: tv(16),
  },
  // 季按钮行（多季时显示，对齐桌面「第 N 季」行）
  seasonRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: tv(14) },
  seasonBtn: {
    paddingHorizontal: tv(16),
    paddingVertical: tv(8),
    borderRadius: tv(8),
    marginRight: tv(10),
    marginBottom: tv(10),
  },
  epGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  epItem: {
    paddingHorizontal: tv(12),
    paddingVertical: tv(8),
    borderRadius: tv(6),
    marginRight: tv(6),
    marginBottom: tv(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DetailScreen;