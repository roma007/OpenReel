import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Media, Episode, WatchHistory } from '@openreel/core';
import { useThemeColors, useScaledFontSize, radius, useThemeStore } from '@openreel/expo-ui';
import { Film, Tv, Clock, Heart } from 'lucide-react-native';

import { useAppStore, getProvider, getStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { TVRow } from '../focus/TVRow';
import { focusRegistry } from '../focus/registry';
import { useBackgroundImageStore } from '../stores/backgroundImageStore';
import MediaCard from '../components/MediaCard';
import PosterImage from '../components/PosterImage';
import { TVButton } from '../components/TVButton';
import { TVNavBar } from '../components/TVNavBar';
import { TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { hexToRgba } from '@openreel/expo-ui';

/**
 * TV 首页。
 *
 * 结构：顶部导航条（分类入口 + 我的/设置）+ 使用偏好卡片（对齐桌面/移动：
 * 追新电影 / 我的追剧 / 观看历史 / 我的收藏）+ 内容行（继续观看）。
 * 数据全部来自本地 SQLite，不请求网络。
 *
 * 遥控焦点：页面数据就绪后把初始焦点给「继续观看」首项（若有），否则给第一行首项 /
 * 空态按钮，保证方向键按下时一定有确定去处（不留焦点黑洞）。
 *
 * 数据刷新：loadHome 在挂载与每次首页获得焦点（采集/AI 导入返回）时执行，
 * 采集入库后回首页立即可见（焦点已在的元素不重置，静默换数据）。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 20;
/** 追新电影卡条数（对齐桌面 pageSize=10） */
const LATEST_PAGE_SIZE = 10;

/** 首页各内容行定义：不同类型/排序由真实 store 查询提供，不在前端拼凑 */
const ROW_DEFS: Array<{ rowId: string; title: string; params: any }> = [];

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const cardOpacity = useThemeStore((s) => s.cardOpacity);

  const isLoading = useAppStore((s) => s.isLoading);
  const watchHistory = useAppStore((s) => s.watchHistory);
  const watchHistoryCount = useAppStore((s) => s.watchHistoryCount);
  const loadWatchHistory = useAppStore((s) => s.loadWatchHistory);
  const favorites = useAppStore((s) => s.favorites);
  const loadFavorites = useAppStore((s) => s.loadFavorites);
  const userUsageTypes = useAppStore((s) => s.userUsageTypes);
  const loadUserUsageTypes = useAppStore((s) => s.loadUserUsageTypes);
  const collectLatest = useAppStore((s) => s.collectLatest);
  const isCollecting = useAppStore((s) => s.isCollecting);
  const videoSources = useAppStore((s) => s.videoSources);
  const loadVideoSources = useAppStore((s) => s.loadVideoSources);

  const [rows, setRows] = useState<Record<string, Media[]>>({});
  const [historyMedia, setHistoryMedia] = useState<Media[]>([]);
  const [ready, setReady] = useState(false);
  // 「还没有影片数据」空态判定依据：media 表真实计数。
  // null = 未知/取数失败（不误报空态，降级为不显示）。
  const [mediaTotal, setMediaTotal] = useState<number | null>(null);

  // —— 使用偏好卡片数据 ——
  const [latestMedia, setLatestMedia] = useState<Media[]>([]);
  const [favMediaList, setFavMediaList] = useState<Media[]>([]);
  // 我的追剧卡：剧集进度明细（对齐移动端 HomeScreen 同名 maps）
  const [episodeMap, setEpisodeMap] = useState<Record<string, Episode>>({});
  const [watchedHistoryMap, setWatchedHistoryMap] = useState<Record<string, WatchHistory[]>>({});
  const [episodeTotalMap, setEpisodeTotalMap] = useState<Record<string, number>>({});
  const [sourceTotalMap, setSourceTotalMap] = useState<Record<string, Record<string, number>>>({});

  /**
   * 首页各行直接走 provider 查询而非 store.loadMediaList：
   * loadMediaList 写的是同一份 mediaList，多行并发会互相覆盖，无法分行渲染。
   * 收藏/历史仍走 store（其数据量小、需要跨页复用）。
   *
   * 不重置 ready（静默刷新）：初始 ready=false 本身就显示加载态；
   * 回焦点刷新时保留页面与焦点，避免每次回首页闪「正在加载…」并丢焦点。
   */
  const loadHome = useCallback(async () => {
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

    // 空态判定：取 media 表真实计数（pageSize=1 只取 meta.total，与「可浏览内容」语义一致）。
    try {
      const r = await provider.listMedia({ page: 1, pageSize: 1 });
      setMediaTotal(r.meta.total);
    } catch {
      setMediaTotal(null);
    }

    setReady(true);
  }, [loadWatchHistory, loadFavorites]);

  // 挂载 + 每次回到首页：静默刷新（采集/导入返回后新数据立即可见）
  useFocusEffect(
    useCallback(() => {
      loadHome();
      loadUserUsageTypes();
    }, [loadHome, loadUserUsageTypes]),
  );

  // 背景图：聚焦时用首页第一条最新影片海报，失焦清空回落到默认背景图（对齐移动端 bgImageUrl）
  const setBackgroundImage = useBackgroundImageStore((s) => s.setImageUrl);
  useFocusEffect(
    useCallback(() => {
      setBackgroundImage(latestMedia[0]?.posterUrl ?? null);
      return () => setBackgroundImage(null);
    }, [latestMedia, setBackgroundImage]),
  );

  const openDetail = useCallback(
    (media: Media) => nav.navigate('Detail', { mediaId: media.id, title: media.title, from: 'home' }),
    [nav],
  );

  // —— 追新电影卡：最新影片 ——
  useEffect(() => {
    if (userUsageTypes.includes('NEW_MOVIES')) {
      getProvider()
        .listMedia({ type: 'MOVIE', page: 1, pageSize: LATEST_PAGE_SIZE, sort: 'latest' })
        .then((r) => setLatestMedia(r.items as Media[]))
        .catch(() => {});
    } else {
      setLatestMedia([]);
    }
  }, [userUsageTypes]);

  // —— 我的收藏卡：favorites 只存 mediaId，回查 media 表（对齐移动端） ——
  useEffect(() => {
    if (favorites.length === 0) {
      setFavMediaList([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      favorites.slice(0, 10).map((f) => getProvider().getMediaById(f.mediaId).catch(() => null)),
    ).then((list) => {
      if (!cancelled) setFavMediaList(list.filter(Boolean) as Media[]);
    });
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  // —— 我的追剧卡：历史里 TV/综艺的观看进度明细（移植自移动端 378-414） ——
  useEffect(() => {
    const tvList = historyMedia.filter((m) => m.type === 'TV' || m.type === 'VARIETY');
    if (tvList.length === 0) {
      setWatchedHistoryMap({});
      setEpisodeTotalMap({});
      setSourceTotalMap({});
      setEpisodeMap({});
      return;
    }
    let cancelled = false;
    const provider = getProvider();
    Promise.all(
      tvList.map(async (m) => {
        const history = await provider.getAllWatchHistoryByMediaId(m.id).catch(() => [] as WatchHistory[]);
        let total: number | undefined;
        const sourceCounts: Record<string, number> = {};
        const eps = await provider.getEpisodesByMediaId(m.id).catch(() => [] as Episode[]);
        const seenBySource: Record<string, Set<string>> = {};
        for (const e of eps) {
          if (!e.sourceId) continue;
          (seenBySource[e.sourceId] ??= new Set()).add(`${e.seasonNumber}:${e.episodeNumber}`);
        }
        for (const [sid, set] of Object.entries(seenBySource)) sourceCounts[sid] = set.size;
        if (m.totalEpisodes == null && m.currentEpisodes == null) {
          total = new Set(eps.map((e) => `${e.seasonNumber}:${e.episodeNumber}`)).size;
        }
        return { id: m.id, history, total, sourceCounts } as const;
      }),
    ).then(async (list) => {
      if (cancelled) return;
      setWatchedHistoryMap(Object.fromEntries(list.map((i) => [i.id, i.history])));
      setEpisodeTotalMap(
        Object.fromEntries(list.filter((i) => i.total != null).map((i) => [i.id, i.total as number])),
      );
      setSourceTotalMap(Object.fromEntries(list.map((i) => [i.id, i.sourceCounts])));
      const allEpIds = [
        ...new Set(list.flatMap((i) => i.history.map((wh) => wh.episodeId).filter(Boolean))),
      ] as number[];
      const epEntries = await Promise.all(
        allEpIds.map((id) => provider.getEpisodeById(id).catch(() => null)),
      );
      if (cancelled) return;
      const map: Record<string, Episode> = {};
      epEntries.forEach((ep) => {
        if (ep) map[ep.id] = ep;
      });
      setEpisodeMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [historyMedia]);

  // —— 增量采集（追新/追剧卡共用）：对齐桌面 handleCollectLatest ——
  const handleCollectLatest = useCallback(async () => {
    if (videoSources.length === 0) {
      nav.navigate('AiSourceImport');
      return;
    }
    await collectLatest();
    if (userUsageTypes.includes('NEW_MOVIES')) {
      getProvider()
        .listMedia({ type: 'MOVIE', page: 1, pageSize: LATEST_PAGE_SIZE, sort: 'latest' })
        .then((r) => setLatestMedia(r.items as Media[]))
        .catch(() => {});
    }
    // 采集入库后刷新首页各行
    loadHome();
  }, [collectLatest, userUsageTypes, videoSources.length, nav, loadHome]);

  const navItems = [
    { key: 'home', label: '首页', onPress: () => {} },
    { key: 'movie', label: '电影', onPress: () => nav.navigate('Category', { type: 'MOVIE', title: '电影' }) },
    { key: 'tv', label: '电视剧', onPress: () => nav.navigate('Category', { type: 'TV', title: '电视剧' }) },
    { key: 'anime', label: '动漫', onPress: () => nav.navigate('Category', { type: 'ANIME', title: '动漫' }) },
    { key: 'variety', label: '综艺', onPress: () => nav.navigate('Category', { type: 'VARIETY', title: '综艺' }) },
    { key: 'doc', label: '纪录片', onPress: () => nav.navigate('Category', { type: 'DOCUMENTARY', title: '纪录片' }) },
    { key: 'settings', label: '设置', onPress: () => nav.navigate('Settings') },
  ];

  // 空库判定用真实 media 表计数，不依赖任何一行的分页结果
  const empty = ready && mediaTotal === 0 && historyMedia.length === 0;
  // 视频源状态直接订阅 store；useFocusEffect 保证每次首页获得焦点（含从采集/AI导入返回）都重新从本地 DB 加载，
  // 避免导入/删除视频源返回首页后空态引导判断用到过期数据
  const [sourcesChecked, setSourcesChecked] = useState(false);
  const [sourceGuideShownRef] = useState({ current: false });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadVideoSources()
        .then(() => {
          if (active) setSourcesChecked(true);
        })
        .catch((e) => {
          console.warn('[TV-Home] loadVideoSources failed:', e);
          if (active) setSourcesChecked(true);
        });
      return () => {
        active = false;
      };
    }, [loadVideoSources])
  );

  const showSourceGuide = ready && sourcesChecked && videoSources.length === 0 && !sourceGuideShownRef.current;
  useEffect(() => {
    if (showSourceGuide) {
      sourceGuideShownRef.current = true;
    }
  }, [showSourceGuide]);

  // 初始焦点（2026-10-08 uiautomator 实证后重写）：
  //  - 旧写死 `row-continue:0` / `row-movie:0`：TVRow item id 实为 `${rowId}:${media.id}`
  //    （media.id 1~7466，id=0 不存在），pending 永远无效 → recoverFocus 返回无效 id
  //    反复空转，启动后 0 持焦节点（按键才 fallback 到 tv-nav-home）。
  //  - 改用真实 id 后实证：目标 `row-movie:7466 has=true` 但该行在五张卡之后
  //    （屏幕深处 y≈2000），原生 View.focus() 对屏幕外视图静默失败，重试 6 次后放弃
  //    → 仍 0 持焦。故初始焦点改为「首屏可见的卡片区域第一可聚焦元素」（按卡片渲染
  //    顺序探测）；引导态首屏只有引导盒，给 empty-go-ai。空库态空态盒已上移到内容区首块。
  //  - 依赖只含 ready / showSourceGuide：不含 rows 静默刷新、不含 userUsageTypes
  //    （usage 回焦重读会换数组引用，若在 deps 里，回首页会把用户焦点抢回首卡）。
  //    candidates 不做门控判断，直接按「卡片渲染顺序」探测注册表真实存在性，
  //    运行时渲染了哪张卡就自然命中哪张（2026-10-09 实证：开启偏好后
  //    home-new-collect 等依次注册成功）。
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      let target: string;
      if (showSourceGuide) {
        target = 'empty-go-ai';
      } else {
        const candidates = [
          'home-new-collect', // 追新电影卡（增量采集按钮）
          'home-tv-collect', // 我的追剧卡（增量采集按钮）
          'home-hist-more', // 观看历史卡（无门控恒渲染，兜底必中）
          'home-fav-more', // 我的收藏卡
        ];
        target = candidates.find((id) => focusRegistry.has(id)) ?? 'nav:home';
      }
      focusRegistry.requestInitialFocus(target);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, showSourceGuide]);

  // —— 我的追剧：历史中的 TV/综艺条目 ——
  const tvWatchHistory = watchHistory.filter((h) => {
    const media = historyMedia.find((m) => m.id === h.mediaId);
    return media && (media.type === 'TV' || media.type === 'VARIETY');
  });

  const cardHeaderStyle = [
    styles.card,
    { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border },
  ];
  const cardTitleStyle = [styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }];
  const emptyCardTextStyle = [styles.emptyCardText, { color: colors.mutedForeground, fontSize: scale(16) }];
  const iconColor = colors.mutedForeground;
  const iconSize = tv(20);

  const renderNewMoviesCard = () => (
    <View style={cardHeaderStyle}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Film size={iconSize} color={iconColor} />
          <Text style={cardTitleStyle}>追新电影</Text>
        </View>
        <TVButton
          id="home-new-collect"
          label={isCollecting ? '采集中' : '增量采集'}
          variant="primary"
          disabled={isCollecting}
          onPress={handleCollectLatest}
          testID="tv-home-new-collect"
        />
      </View>
      {latestMedia.length > 0 ? (
        <TVRow
          rowId="row-latesthome"
          data={latestMedia}
          keyExtractor={(m) => String(m.id)}
          itemWidth={100}
          itemHeight={164}
          onItemPress={openDetail}
          renderItem={(m) => (
            <MediaCard media={m} compact />
          )}
        />
      ) : (
        <Text style={emptyCardTextStyle}>暂无内容，点「增量采集」获取各源最新影片</Text>
      )}
    </View>
  );

  const renderTvSeriesCard = () => {
    const items = tvWatchHistory.slice(0, 10);
    return (
      <View style={cardHeaderStyle}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Tv size={iconSize} color={iconColor} />
            <Text style={cardTitleStyle}>我的追剧</Text>
          </View>
          <TVButton
            id="home-tv-collect"
            label={isCollecting ? '采集中' : '增量采集'}
            variant="primary"
            disabled={isCollecting}
            onPress={handleCollectLatest}
            testID="tv-home-tv-collect"
          />
        </View>
        {items.length === 0 ? (
          <Text style={emptyCardTextStyle}>暂无追剧记录，观看电视剧或综艺后会显示在这里</Text>
        ) : (
          <TVRow
            rowId="row-tvhome"
            data={items}
            keyExtractor={(h) => String(h.id)}
            itemWidth={100}
            itemHeight={200}
            onItemPress={(h) => {
              const media = historyMedia.find((m) => m.id === h.mediaId);
              if (media) openDetail(media);
            }}
            renderItem={(h) => {
              const media = historyMedia.find((m) => m.id === h.mediaId);
              if (!media) return null;
              const history = watchedHistoryMap[media.id] ?? [];
              let recentSourceId: string | null = null;
              for (const wh of history) {
                if (wh.episodeId) {
                  const e = episodeMap[wh.episodeId];
                  if (e?.sourceId) {
                    recentSourceId = e.sourceId;
                    break;
                  }
                }
              }
              const sourceCount = recentSourceId ? (sourceTotalMap[media.id]?.[recentSourceId] ?? 0) : 0;
              const recentWh = history[0];
              const recentEp = recentWh?.episodeId ? episodeMap[recentWh.episodeId] : null;
              const watchedCount = recentEp ? recentEp.episodeNumber : 0;
              const totalCount =
                sourceCount > 0
                  ? sourceCount
                  : (media.totalEpisodes ?? media.currentEpisodes ?? episodeTotalMap[media.id] ?? 0);
              const progressPct =
                totalCount > 0
                  ? Math.min(Math.round((watchedCount / totalCount) * 100), 100)
                  : h.duration > 0
                    ? Math.min(Math.round((h.progress / h.duration) * 100), 100)
                    : 0;
              const ep = h.episodeId ? episodeMap[h.episodeId] : null;
              const epLabel = ep ? ep.title || `第${ep.episodeNumber}集` : null;
              return (
                <View style={{ width: 100 }}>
                  <View
                    style={{
                      width: 100,
                      height: 150,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      backgroundColor: hexToRgba(colors.surface, cardOpacity / 100),
                    }}
                  >
                    <PosterImage
                      uri={media.posterUrl}
                      style={{ width: '100%', height: '100%', borderRadius: radius.md }}
                    />
                  </View>
                  <View style={{ paddingHorizontal: 6, paddingTop: 6 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.text, fontSize: scale(12) }}
                    >
                      {media.title}
                    </Text>
                    {epLabel ? (
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.textSecondary, fontSize: scale(10), marginTop: 2 }}
                      >
                        {epLabel}
                      </Text>
                    ) : null}
                    <View
                      style={{
                        height: 4,
                        backgroundColor: colors.trackBg,
                        borderRadius: radius.progress,
                        overflow: 'hidden',
                        marginTop: 4,
                      }}
                    >
                      <View
                        style={{
                          height: '100%',
                          width: `${progressPct}%`,
                          backgroundColor: colors.mutedForeground,
                        }}
                      />
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
        {tvWatchHistory.length > 10 ? (
          <View style={{ marginTop: tv(4) }}>
            <TVButton
              id="home-tv-more"
              label="查看全部追剧"
              variant="ghost"
              onPress={() => nav.navigate('History', {})}
              testID="tv-home-tv-more"
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderHistoryCard = () => (
    <View style={cardHeaderStyle}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Clock size={iconSize} color={iconColor} />
          <Text style={cardTitleStyle}>观看历史 ({watchHistoryCount})</Text>
        </View>
        <TVButton
          id="home-hist-more"
          label="更多"
          variant="ghost"
          onPress={() => nav.navigate('History', {})}
          testID="tv-home-hist-more"
        />
      </View>
      {historyMedia.length === 0 ? (
        <Text style={emptyCardTextStyle}>暂无观看历史</Text>
      ) : (
        <TVRow
          rowId="row-histhome"
          data={historyMedia}
          keyExtractor={(m) => String(m.id)}
          itemWidth={100}
          itemHeight={164}
          onItemPress={openDetail}
          renderItem={(m) => (
            <MediaCard media={m} compact />
          )}
        />
      )}
    </View>
  );

  const renderFavoritesCard = () => (
    <View style={cardHeaderStyle}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Heart size={iconSize} color={colors.favorite} />
          <Text style={cardTitleStyle}>我的收藏 ({favorites.length})</Text>
        </View>
        <TVButton
          id="home-fav-more"
          label="更多"
          variant="ghost"
          onPress={() => nav.navigate('Favorites', {})}
          testID="tv-home-fav-more"
        />
      </View>
      {favMediaList.length === 0 ? (
        <Text style={emptyCardTextStyle}>暂无收藏</Text>
      ) : (
        <TVRow
          rowId="row-favhome"
          data={favMediaList}
          keyExtractor={(m) => String(m.id)}
          itemWidth={100}
          itemHeight={164}
          onItemPress={openDetail}
          renderItem={(m) => (
            <MediaCard media={m} compact />
          )}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
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
        ) : showSourceGuide ? (
          <View
            style={[styles.emptyBox, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}
          >
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: scale(22) }]}>
              还没有视频源
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground, fontSize: scale(17), maxWidth: tv(760) }]}>
              使用 AI 智能导入可以快速添加视频源
            </Text>
            <View style={{ flexDirection: 'row', gap: tv(12) }}>
              <TVFocusable
                id="empty-go-ai"
                onPress={() => nav.navigate('AiSourceImport')}
                style={[styles.emptyBtn, { backgroundColor: colors.buttonPrimaryBg }]}
                testID="tv-home-empty-ai"
              >
                <Text style={[styles.emptyBtnText, { color: colors.buttonPrimaryText, fontSize: scale(18) }]}>
                  AI 导入
                </Text>
              </TVFocusable>
              <TVFocusable
                id="empty-go-source"
                onPress={() => nav.navigate('SourceManager')}
                style={[
                  styles.emptyBtn,
                  { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100), borderWidth: 1, borderColor: colors.border },
                ]}
                testID="tv-home-empty-source"
              >
                <Text style={[styles.emptyBtnText, { color: colors.foreground, fontSize: scale(18) }]}>
                  手动添加
                </Text>
              </TVFocusable>
            </View>
          </View>
        ) : (
          <>
            {empty ? (
              <View style={[styles.emptyBox, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
                <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: scale(22) }]}>
                  还没有影片数据
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground, fontSize: scale(17), maxWidth: tv(760) }]}>
                  先到「视频源管理」添加视频源并采集片单，采集完成后即可在电视上浏览观看
                </Text>
                <TVFocusable
                  id="empty-go-collect"
                  onPress={() => nav.navigate('SourceManager')}
                  style={[styles.emptyBtn, { backgroundColor: colors.buttonPrimaryBg }]}
                  testID="tv-home-empty-collect"
                >
                  <Text style={[styles.emptyBtnText, { color: colors.buttonPrimaryText, fontSize: scale(18) }]}>
                    视频源管理
                  </Text>
                </TVFocusable>
              </View>
            ) : null}
            {userUsageTypes.includes('NEW_MOVIES') && renderNewMoviesCard()}
            {userUsageTypes.includes('TV_SERIES') && renderTvSeriesCard()}
            {renderHistoryCard()}
            {renderFavoritesCard()}
            {!empty ? (
              <>
                {historyMedia.length > 0 ? (
                  <TVRow
                    rowId="row-continue"
                    title="继续观看"
                    onTitlePress={() => nav.navigate('History', {})}
                    data={historyMedia}
                    keyExtractor={(m) => String(m.id)}
                    itemWidth={100}
                    itemHeight={164}
                    onItemPress={openDetail}
                    renderItem={(m) => (
                      <MediaCard media={m} compact />
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
                    itemWidth={100}
                    itemHeight={164}
                    emptyText="暂无内容"
                    onItemPress={openDetail}
                    renderItem={(m) => (
                      <MediaCard media={m} compact />
                    )}
                  />
                ))}
              </>
            ) : null}
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
  card: {
    borderRadius: tv(12),
    borderWidth: 1,
    padding: tv(20),
    marginBottom: tv(16),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tv(12),
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv(8),
  },
  cardTitle: { fontWeight: '700' },
  emptyCardText: {
    textAlign: 'center',
    paddingVertical: tv(16),
  },
  emptyBox: {
    marginTop: tv(40),
    marginBottom: tv(16),
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
