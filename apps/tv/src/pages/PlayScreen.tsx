import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  Modal,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { VideoView, createVideoPlayer } from 'expo-video';
import type { Episode, Media, PlaySource, VideoSource } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import { tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 播放页。
 *
 * 与手机端的关键差异：
 *  - **无 PiP / 无投屏 / 无广告浮层**（用户 2026-10-05 确认 TV 版砍掉）
 *  - 遥控交互（2026-10-07 用户定稿）：左/右=快退/快进 30s，上/下=上一集/下一集，
 *    OK=播放/暂停，BACK=返回，菜单键=唤出功能面板（选集/播放线路/播放源/倍速）。
 *    播放页**不放任何按钮**，只有唯一可聚焦的「播放区」承载按键 —— JS 无法消费方向键，
 *    一旦存在别的可聚焦按钮，上/下会被夺去移动焦点而无法切集。
 *
 * 数据层级（用户 2026-10-07 澄清）：
 *  视频(media) → 一个视频可有多个视频源(VideoSource) → 一个视频源有多集(Episode)
 *  → 一集有多条播放线路(PlaySource)；一个视频还可能有关联的其他季(seriesGroup)。
 *
 * 面板按键语义与应用路径：菜单键（原生 KEYCODE_MENU）转发到 JS 打开面板。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Play'>;

const SKIP_SECONDS = 30;
const PROGRESS_SAVE_INTERVAL_MS = 10_000;
/** 面板焦点监狱前缀：面板打开期间焦点只能落在 panel: 开头的元素上 */
const PANEL_SCOPE = 'panel:';
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  // 当前播放的视频（切到「关联的其他季」时可能变成另一个 mediaId）
  const [activeMediaId, setActiveMediaId] = useState(route.params.mediaId);
  // 详情页带入的目标集：解析出所属季后消费一次
  const wantEpIdRef = useRef<number | null>(route.params.episodeId ?? null);

  const [media, setMedia] = useState<Media | null>(null);
  const [title, setTitle] = useState(route.params.title || '');
  const [seasons, setSeasons] = useState<number[]>([]);
  const [seriesMedia, setSeriesMedia] = useState<Media[]>([]);
  const [currentSeason, setCurrentSeason] = useState<number>(route.params.season ?? 1);
  const [episodeSources, setEpisodeSources] = useState<VideoSource[]>([]);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(route.params.sourceId ?? null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpId, setCurrentEpId] = useState<number | null>(route.params.episodeId ?? null);
  const [playSources, setPlaySources] = useState<PlaySource[]>([]);
  const [activePlayIdx, setActivePlayIdx] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [player, setPlayer] = useState<any>(null);

  const playerRef = useRef<any>(null);
  const initedRef = useRef<number | null>(null);
  const curEpRef = useRef<number | null>(currentEpId);
  curEpRef.current = currentEpId;

  // 进度落库参数用 ref 持有，保证卸载 cleanup 能读到最新值
  const saveRef = useRef<{
    mediaId: number;
    episodeId: number | null;
    sourceId: string | null;
    playSourceId: number | null;
  }>({
    mediaId: route.params.mediaId,
    episodeId: route.params.episodeId ?? null,
    sourceId: route.params.sourceId ?? null,
    playSourceId: null,
  });

  const saveWatchProgress = useAppStore((s) => s.saveWatchProgress);

  // ─── 派生：季列表（优先关联其他季）/ 季→mediaId / 面板首个焦点 ───
  const seriesSeasons = useMemo(
    () => Array.from(new Set(seriesMedia.map((m) => m.seriesSeason ?? 1))).sort((a, b) => a - b),
    [seriesMedia],
  );
  const displaySeasons = seriesSeasons.length > 0 ? seriesSeasons : seasons;
  const seasonToMediaMap = useMemo(() => {
    const map = new Map<number, number>();
    seriesMedia.forEach((m) => {
      if (m.seriesSeason) map.set(m.seriesSeason, m.id);
    });
    return map;
  }, [seriesMedia]);

  const currentIndex = episodes.findIndex((e) => e.id === currentEpId);
  const prevEp = currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEp =
    currentIndex >= 0 && currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : null;

  // ─── 载入视频 / 季列表 / 关联其他季 ───
  useEffect(() => {
    const provider = getProvider();
    let cancelled = false;
    (async () => {
      const m = await provider.getMediaById(activeMediaId);
      if (cancelled) return;
      setMedia(m);
      // 切季可能切到「关联的其他季」的另一个 media，标题必须以实际加载到的 media 为准
      setTitle(m?.title || route.params.title || '');
      provider.incrementViewCount(activeMediaId).catch(() => {});

      const ss = await provider.getSeasonsByMediaId(activeMediaId);
      if (cancelled) return;
      setSeasons(ss || []);

      let sm: Media[] = [];
      if (m?.seriesGroup) {
        try {
          sm = await provider.getMediaBySeriesGroup(m.seriesGroup);
        } catch {
          sm = [];
        }
      }
      if (cancelled) return;
      setSeriesMedia(sm || []);

      // 首次进入：解析初始季（带入集所属季 > 路由季 > 视频自身季 > 首个季）
      if (initedRef.current !== activeMediaId) {
        initedRef.current = activeMediaId;
        let season = route.params.season ?? m?.seriesSeason ?? (ss && ss[0]) ?? 1;
        if (wantEpIdRef.current) {
          try {
            const ep = await provider.getEpisodeById(wantEpIdRef.current);
            if (ep && ep.seasonNumber) season = ep.seasonNumber;
          } catch {
            // 集查不到则用上面的兜底季
          }
        }
        if (!cancelled) setCurrentSeason(season || 1);
      }
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMediaId]);

  // ─── 季 → 视频源（采集站）列表 ───
  useEffect(() => {
    if (!activeMediaId || !currentSeason) return;
    const provider = getProvider();
    let cancelled = false;
    (async () => {
      const srcs = await provider.getEpisodeSourcesByMediaId(activeMediaId, currentSeason);
      if (cancelled) return;
      const list = srcs || [];
      setEpisodeSources(list);
      // 当前源仍在则保留，否则落到首个源
      setCurrentSourceId((prev) =>
        prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? null),
      );
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [activeMediaId, currentSeason]);

  // ─── 季 + 视频源 → 集列表 ───
  useEffect(() => {
    if (!activeMediaId || !currentSeason || !currentSourceId) return;
    const provider = getProvider();
    let cancelled = false;
    (async () => {
      const eps = await provider.getEpisodesByMediaId(activeMediaId, currentSeason, currentSourceId);
      if (cancelled) return;
      const sorted = [...(eps || [])].sort((a, b) => a.episodeNumber - b.episodeNumber);
      setEpisodes(sorted);
      const prev = curEpRef.current;
      const want = wantEpIdRef.current;
      let next: number | null;
      if (prev && sorted.some((e) => e.id === prev)) next = prev;
      else if (want && sorted.some((e) => e.id === want)) next = want;
      else next = sorted[0]?.id ?? null;
      wantEpIdRef.current = null;
      setCurrentEpId(next);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [activeMediaId, currentSeason, currentSourceId]);

  // ─── 集 → 播放线路 ───
  useEffect(() => {
    if (!currentEpId) {
      setPlaySources([]);
      setActivePlayIdx(0);
      return;
    }
    const provider = getProvider();
    let cancelled = false;
    (async () => {
      const srcs = await provider.getPlaySourcesByEpisodeId(currentEpId);
      if (cancelled) return;
      const playable = (srcs || []).filter((s) => !!s.url);
      setPlaySources(playable.length > 0 ? playable : srcs || []);
      setActivePlayIdx(0);
      setPosition(0);
      setDuration(0);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [currentEpId]);

  // ─── 线路 → 真实播放地址 ───
  useEffect(() => {
    const picked = playSources[activePlayIdx];
    if (!picked || !picked.url) {
      if (playSources.length > 0) setError('该集没有可播放的线路');
      return;
    }
    setError(null);
    saveRef.current = {
      mediaId: activeMediaId,
      episodeId: currentEpId,
      sourceId: picked.sourceId,
      playSourceId: picked.id,
    };
    setVideoUrl(picked.url);
  }, [playSources, activePlayIdx, activeMediaId, currentEpId]);

  // ─── 播放器实例生命周期（复用单实例，切源 replace）───
  useEffect(() => {
    if (!videoUrl) return;
    setCurrentSpeed(1); // 换集/换线路后底层速率复位，UI 同步
    let p = playerRef.current;
    if (!p) {
      try {
        p = createVideoPlayer({ uri: videoUrl });
        p.loop = false;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[TV][Play] 创建播放器失败:', msg);
        setError(`播放器创建失败：${msg}`);
        return;
      }
      playerRef.current = p;
      setPlayer(p);
      try {
        p.play();
      } catch {}
      setTimeout(() => {
        try {
          if (playerRef.current && !playerRef.current.playing) playerRef.current.play();
        } catch {}
      }, 400);
      return;
    }
    try {
      p.replace({ uri: videoUrl }, true);
    } catch (e) {
      console.warn('[TV][Play] 换源失败:', e instanceof Error ? e.message : String(e));
    }
  }, [videoUrl]);

  // 倍速应用到播放器
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.playbackRate = currentSpeed;
    } catch {}
  }, [currentSpeed, player]);

  // ─── 轮询播放进度 ───
  useEffect(() => {
    let lastSaveAt = 0;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = p.currentTime ?? 0;
        const dur = p.duration ?? 0;
        setPosition(cur);
        setDuration(dur);
        setPaused(!p.playing);
        const now = Date.now();
        if (cur > 0 && dur > 0 && now - lastSaveAt >= PROGRESS_SAVE_INTERVAL_MS) {
          lastSaveAt = now;
          saveWatchProgress(
            saveRef.current.mediaId,
            saveRef.current.episodeId,
            cur,
            dur,
            saveRef.current.sourceId,
            saveRef.current.playSourceId,
          ).catch(() => {});
        }
      } catch {
        // 播放器尚未就绪/已释放：忽略本轮
      }
    }, 1000);
    return () => clearInterval(t);
  }, [saveWatchProgress]);

  // ─── 卸载：先落库进度，再释放播放器 ───
  useEffect(() => {
    return () => {
      const p = playerRef.current;
      const s = saveRef.current;
      if (p && (p.duration || 0) > 0 && (p.currentTime || 0) > 0) {
        try {
          saveWatchProgress(
            s.mediaId,
            s.episodeId,
            p.currentTime,
            p.duration,
            s.sourceId,
            s.playSourceId,
          )?.catch?.(() => {});
        } catch {
          // 释放中读取可能抛错，忽略
        }
      }
      playerRef.current = null;
      try {
        p?.pause?.();
      } catch {}
    };
  }, [saveWatchProgress]);

  // ─── 播放控制 ───
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.playing) {
        p.pause();
        setPaused(true);
      } else {
        p.play();
        setPaused(false);
      }
    } catch {}
  }, []);

  const seek = useCallback((delta: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const target = Math.max(0, (p.currentTime || 0) + delta);
      p.currentTime = target;
      setPosition(target);
    } catch {}
  }, []);

  // ─── 面板选择 ───
  const switchSeason = useCallback(
    (season: number) => {
      const targetMediaId = seasonToMediaMap.get(season);
      wantEpIdRef.current = null;
      setEpisodes([]);
      setCurrentEpId(null);
      setPlaySources([]);
      setVideoUrl(null);
      setPosition(0);
      setDuration(0);
      if (targetMediaId && targetMediaId !== activeMediaId) {
        setActiveMediaId(targetMediaId);
        setCurrentSourceId(null);
        setCurrentSeason(season);
      } else {
        setCurrentSeason(season);
        setCurrentSourceId(null);
      }
    },
    [seasonToMediaMap, activeMediaId],
  );

  const switchSource = useCallback((sourceId: string) => {
    wantEpIdRef.current = null;
    setCurrentSourceId(sourceId);
    setCurrentEpId(null);
    setPlaySources([]);
    setPosition(0);
    setDuration(0);
  }, []);

  const switchEpisode = useCallback((epId: number) => {
    wantEpIdRef.current = null;
    setCurrentEpId(epId);
    setPlaySources([]);
    setPosition(0);
    setDuration(0);
  }, []);

  const switchLine = useCallback((idx: number) => {
    setActivePlayIdx(idx);
  }, []);

  // ─── 菜单键：原生 MainActivity 转发 tvMenuKey → 打开/收起面板 ───
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('tvMenuKey', () => setPanelOpen((v) => !v));
    return () => sub.remove();
  }, []);

  // ─── 面板焦点监狱 ───
  const panelFirstId = useMemo(() => {
    if (displaySeasons.length > 1) return `${PANEL_SCOPE}season:${currentSeason}`;
    if (episodeSources.length > 1) return `${PANEL_SCOPE}source:${currentSourceId}`;
    if (episodes.length > 0) return `${PANEL_SCOPE}ep:${currentEpId}`;
    if (playSources.length > 0) return `${PANEL_SCOPE}line:0`;
    return `${PANEL_SCOPE}speed:1`;
  }, [
    displaySeasons,
    currentSeason,
    episodeSources,
    currentSourceId,
    episodes,
    currentEpId,
    playSources,
  ]);
  const panelFirstIdRef = useRef(panelFirstId);
  panelFirstIdRef.current = panelFirstId;

  useEffect(() => {
    if (!panelOpen) return;
    const first = panelFirstIdRef.current;
    focusRegistry.pushScope(PANEL_SCOPE);
    focusRegistry.requestInitialFocus(first);
    const t = setTimeout(() => focusRegistry.focusNode(first), 80);
    return () => {
      clearTimeout(t);
      focusRegistry.popScope();
      // 面板关闭后把焦点还给播放区
      focusRegistry.requestInitialFocus('play-surface');
    };
  }, [panelOpen]);

  // ─── BACK：面板开着先关面板，否则退出播放 ───
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panelOpen) {
        setPanelOpen(false);
        return true;
      }
      nav.goBack();
      return true;
    });
    return () => sub.remove();
  }, [panelOpen, nav]);

  // 初始焦点落在「播放区」
  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('play-surface'), 1200);
    return () => clearTimeout(t);
  }, []);

  // 播放区按键：左/右=快退/快进 30s，上/下=上一集/下一集。
  // OK(Enter) 不在此处理，交给 Pressable 的 onPress(togglePlay)，否则会重复触发。
  const onSurfaceKey = useCallback(
    (e: any) => {
      const code = e?.nativeEvent?.code;
      if (code === 'ArrowLeft') seek(-SKIP_SECONDS);
      else if (code === 'ArrowRight') seek(SKIP_SECONDS);
      else if (code === 'ArrowUp') {
        if (prevEp) switchEpisode(prevEp.id);
      } else if (code === 'ArrowDown') {
        if (nextEp) switchEpisode(nextEp.id);
      }
    },
    [seek, prevEp, nextEp, switchEpisode],
  );

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.playerBg }]}>
        <Text style={{ color: colors.error, fontSize: scale(20) }}>{error}</Text>
        <View style={{ marginTop: tv(20) }}>
          <TVButton id="play-error-back" label="返回" onPress={() => nav.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.playerBg }]}>
      {player ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={false}
          // TV 端必须用 TextureView：默认 surfaceView 是独立图层，会打断原生焦点搜索。
          surfaceType="textureView"
        />
      ) : (
        <View style={[styles.center, StyleSheet.absoluteFill]}>
          <Text style={{ color: colors.mutedForeground, fontSize: scale(18) }}>正在加载视频…</Text>
        </View>
      )}

      {/* 播放页唯一的可聚焦元素「播放区」：承载全部遥控按键。
          面板打开时禁用，避免方向键把焦点从面板抢回播放区。*/}
      <TVFocusable
        id="play-surface"
        showFocusRing={false}
        disabled={panelOpen}
        style={styles.surface}
        onPress={togglePlay}
        onKeyDown={onSurfaceKey}
      >
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.progressRow}>
            <Text style={[styles.time, { color: colors.foreground }]}>{fmt(position)}</Text>
            <View style={[styles.track, { backgroundColor: colors.trackBg }]}>
              <View
                style={[
                  styles.trackFill,
                  {
                    backgroundColor: colors.buttonPrimaryBg,
                    width: duration > 0 ? `${Math.min(100, (position / duration) * 100)}%` : '0%',
                  },
                ]}
              />
            </View>
            <Text style={[styles.time, { color: colors.foreground }]}>{fmt(duration)}</Text>
          </View>

          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
            {title || media?.title || ''}
            {episodes.length > 0 && currentIndex >= 0
              ? `  ${epTitle(episodes[currentIndex])}`
              : ''}
          </Text>

          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {paused ? '⏸ 已暂停　' : '▶ 播放中　'}← → 快进快退　↑ ↓ 切集　OK 播放/暂停　菜单 更多
          </Text>
        </View>
      </TVFocusable>

      {/* ─── 功能面板（菜单键唤出）：季 / 播放源 / 选集 / 播放线路 / 倍速 ─── */}
      <Modal
        visible={panelOpen}
        transparent
        animationType="none"
        onRequestClose={() => setPanelOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.panelBackdrop}>
          <View style={[styles.panel, { backgroundColor: colors.background }]}>
            <Text style={[styles.panelTitle, { color: colors.foreground, fontSize: scale(22) }]}>
              播放设置
            </Text>
            <Text style={[styles.panelHint, { color: colors.mutedForeground, fontSize: scale(13) }]}>
              方向键选择　OK 确认　BACK 关闭
            </Text>

            <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelBody}>
              {displaySeasons.length > 1 ? (
                <View style={styles.panelSection}>
                  <Text
                    style={[styles.panelLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}
                  >
                    季
                  </Text>
                  <View style={styles.chipWrap}>
                    {displaySeasons.map((s) => {
                      const active = currentSeason === s;
                      return (
                        <TVFocusable
                          key={s}
                          id={`${PANEL_SCOPE}season:${s}`}
                          onPress={() => switchSeason(s)}
                          style={[
                            styles.chip,
                            { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                          ]}
                          testID={`tv-panel-season-${s}`}
                        >
                          <Text
                            style={{
                              color: active ? colors.buttonPrimaryText : colors.foreground,
                              fontSize: scale(15),
                              fontWeight: '600',
                            }}
                          >
                            第{s}季
                          </Text>
                        </TVFocusable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {episodeSources.length > 1 ? (
                <View style={styles.panelSection}>
                  <Text
                    style={[styles.panelLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}
                  >
                    播放源
                  </Text>
                  <View style={styles.chipWrap}>
                    {episodeSources.map((s) => {
                      const active = currentSourceId === s.id;
                      return (
                        <TVFocusable
                          key={s.id}
                          id={`${PANEL_SCOPE}source:${s.id}`}
                          onPress={() => switchSource(s.id)}
                          style={[
                            styles.chip,
                            { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                          ]}
                          testID={`tv-panel-source-${s.id}`}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: active ? colors.buttonPrimaryText : colors.foreground,
                              fontSize: scale(15),
                              fontWeight: '600',
                            }}
                          >
                            {s.name}
                          </Text>
                        </TVFocusable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.panelSection}>
                <Text
                  style={[styles.panelLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}
                >
                  选集（{episodes.length}）
                </Text>
                <View style={styles.chipWrap}>
                  {episodes.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>
                      暂无剧集
                    </Text>
                  ) : (
                    episodes.map((ep) => {
                      const active = ep.id === currentEpId;
                      return (
                        <TVFocusable
                          key={ep.id}
                          id={`${PANEL_SCOPE}ep:${ep.id}`}
                          onPress={() => switchEpisode(ep.id)}
                          style={[
                            styles.chip,
                            styles.chipWide,
                            { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                          ]}
                          testID={`tv-panel-ep-${ep.episodeNumber}`}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: active ? colors.buttonPrimaryText : colors.foreground,
                              fontSize: scale(15),
                              fontWeight: '600',
                            }}
                          >
                            {epTitle(ep)}
                          </Text>
                        </TVFocusable>
                      );
                    })
                  )}
                </View>
              </View>

              <View style={styles.panelSection}>
                <Text
                  style={[styles.panelLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}
                >
                  播放线路（{playSources.length}）
                </Text>
                <View style={styles.chipWrap}>
                  {playSources.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>无</Text>
                  ) : (
                    playSources.map((s, i) => {
                      const active = i === activePlayIdx;
                      return (
                        <TVFocusable
                          key={s.id}
                          id={`${PANEL_SCOPE}line:${i}`}
                          onPress={() => switchLine(i)}
                          style={[
                            styles.chip,
                            { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                          ]}
                          testID={`tv-panel-line-${i}`}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: active ? colors.buttonPrimaryText : colors.foreground,
                              fontSize: scale(15),
                              fontWeight: '600',
                            }}
                          >
                            {lineLabel(s, i)}
                          </Text>
                        </TVFocusable>
                      );
                    })
                  )}
                </View>
              </View>

              <View style={styles.panelSection}>
                <Text
                  style={[styles.panelLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}
                >
                  倍速
                </Text>
                <View style={styles.chipWrap}>
                  {SPEED_OPTIONS.map((rate) => {
                    const active = currentSpeed === rate;
                    return (
                      <TVFocusable
                        key={rate}
                        id={`${PANEL_SCOPE}speed:${rate}`}
                        onPress={() => setCurrentSpeed(rate)}
                        style={[
                          styles.chip,
                          { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                        ]}
                        testID={`tv-panel-speed-${rate}`}
                      >
                        <Text
                          style={{
                            color: active ? colors.buttonPrimaryText : colors.foreground,
                            fontSize: scale(15),
                            fontWeight: '600',
                          }}
                        >
                          {rate}x
                        </Text>
                      </TVFocusable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** 集标题：优先剧集标题，否则「第N集」 */
function epTitle(ep: Episode): string {
  return ep.title || `第${ep.episodeNumber}集`;
}

/** 线路名：以序号标识，语言不同则附带语言（不涉及清晰度） */
function lineLabel(s: PlaySource, i: number): string {
  return s.language ? `线路${i + 1} · ${s.language}` : `线路${i + 1}`;
}

/** 秒 → mm:ss / h:mm:ss */
function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const rounded = Math.floor(seconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default PlayScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  surface: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // 不可聚焦 overlay：进度条 + 标题 + 键位提示
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 48,
    paddingBottom: 36,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  time: { fontSize: 20, fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 6, marginHorizontal: 16, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%' },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 18 },

  panelBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  panel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  panelTitle: { fontWeight: '700' },
  panelHint: { marginBottom: 16 },
  panelScroll: { flexGrow: 0 },
  panelBody: { paddingBottom: 8 },
  panelSection: { marginBottom: 18 },
  panelLabel: { marginBottom: 10, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    minWidth: 96,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWide: { minWidth: 120 },
});