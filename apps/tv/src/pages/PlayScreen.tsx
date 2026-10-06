import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { VideoView, createVideoPlayer } from 'expo-video';
import type { Episode, Media, PlaySource } from '@openreel/core';
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
 *  - 控制条由**方向键**操控：OK 键播放/暂停，左右键快进/快退，上下键呼出/隐藏控制条
 *  - BACK 键 = 退出播放并保存进度（进度必须先落库再返回，见 cleanup）
 *
 * 播放器生命周期沿用手机端已验证的做法：createVideoPlayer 手动管理、换源用 replace 复用实例，
 * 卸载时先存进度再释放（AGENTS 记录的 iOS/Android 差异在 TV(仅 Android) 上不触发，
 * 但顺序保持一致以免后续踩坑）。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Play'>;

const SKIP_SECONDS = 30;
const PROGRESS_SAVE_INTERVAL_MS = 10_000;

export function PlayScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const { mediaId, title } = route.params;

  const [media, setMedia] = useState<Media | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpId, setCurrentEpId] = useState<number | null>(route.params.episodeId ?? null);
  const [sources, setSources] = useState<PlaySource[]>([]);
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(route.params.sourceId ?? null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<any>(null);
  // 进度落库所需参数用 ref 持有，保证 cleanup 时能读到最新值
  const saveRef = useRef<{
    mediaId: number;
    episodeId: number | null;
    sourceId: string | null;
    playSourceId: number | null;
  }>({ mediaId, episodeId: route.params.episodeId ?? null, sourceId: route.params.sourceId ?? null, playSourceId: null });

  const saveWatchProgress = useAppStore((s) => s.saveWatchProgress);

  // 载入媒体与剧集
  useEffect(() => {
    const provider = getProvider();
    (async () => {
      const m = await provider.getMediaById(mediaId);
      setMedia(m);
      provider
        .incrementViewCount(mediaId)
        .catch(() => {});
      const eps = await provider.getEpisodesByMediaId(mediaId);
      const sorted = [...(eps || [])].sort(
        (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
      );
      setEpisodes(sorted);
      if (!currentEpId && sorted.length > 0) {
        setCurrentEpId(sorted[0].id);
        saveRef.current.episodeId = sorted[0].id;
      }
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  // 选定集 → 解析线路 → 解析真实播放地址
  useEffect(() => {
    if (currentEpId == null) return;
    const provider = getProvider();
    let cancelled = false;
    (async () => {
      const srcs = await provider.getPlaySourcesByEpisodeId(currentEpId);
      if (cancelled) return;
      setSources(srcs || []);
      const picked =
        (currentSourceId && srcs.find((s) => s.sourceId === currentSourceId && s.url)) ||
        srcs.find((s) => s.url) ||
        srcs[0];
      if (!picked) {
        setError('该集没有可播放的线路');
        setVideoUrl(null);
        return;
      }
      setError(null);
      setVideoUrl(picked.url);
      setCurrentSourceId(picked.sourceId);
      saveRef.current = {
        mediaId,
        episodeId: currentEpId,
        sourceId: picked.sourceId,
        playSourceId: picked.id,
      };
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpId]);

  // 播放器实例生命周期（对齐手机端 PlayScreen 的手动管理方式）。
  // 2026-10-05 实测修正：原实现是 `useMemo(() => videoUrl ? createVideoPlayer(...) : null, [])`，
  // 依赖数组固定 [] 而首帧 videoUrl 必为 null（线路要异步查库），于是 player 永久为 null，
  // 播放页一直停在「正在加载视频…」（logcat 无任何 expo-video 日志佐证）。
  // 现改为 state + effect：首个 videoUrl 就绪时创建实例并 setState，之后换集/换线路用
  // replace 复用同一实例（重复创建在 ATV 上会黑屏）。
  const [player, setPlayer] = useState<any>(null);

  useEffect(() => {
    if (!videoUrl) return;
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
      // 进入即自动播放（对齐手机端；Android 无自动播放限制，play() 立即生效）。
      // 补一次 400ms 后的重试：createVideoPlayer 刚返回时底层 AVPlayer/ExoPlayer
      // 可能尚未 ready，首调 play() 会被丢弃。
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

  // 轮询播放进度：TV 端不上报原生分片事件，只取播放位置驱动进度条与落库。
  // UI 刷新 1s 一次（遥控没有连续拖拽，1s 足够且不刺眼），落库仍按 10s 节流。
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

  // 卸载：先落库进度，再释放播放器（顺序铁律：存进度 → 置空 ref → 释放）
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

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      // 不用 `setPaused(!p.playing)`：pause()/play() 是异步派发到 native 的，
      // 紧接着读 p.playing 往往还是旧值，UI 会显示错误的按钮文案（实测已复现）。
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

  const gotoEpisode = useCallback(
    (epId: number) => {
      setCurrentEpId(epId);
      // 换集时重置进度显示，避免沿用上一集的数字
      setPosition(0);
      setDuration(0);
      try {
        playerRef.current?.seekBy(0);
      } catch {}
    },
    [],
  );

  // 初始焦点落在「播放/暂停」：电视端 OK 就是「对当前焦点元素操作」，
  // 不做全屏热区（曾用 absoluteFill 热区，方向键在其下方找不到任何元素，
  // 实测 DOWN/RIGHT 焦点都卡在热区不动，用户既不能跳集也不能快进）。
  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('play-play'), 1200);
    return () => clearTimeout(t);
  }, []);

  // BACK = 退出播放（进度已在 cleanup 落库）
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      nav.goBack();
      return true;
    });
    return () => sub.remove();
  }, [nav]);

  const currentIndex = episodes.findIndex((e) => e.id === currentEpId);
  const prevEp = currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEp = currentIndex >= 0 && currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : null;

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
          // TV 端必须用 TextureView（2026-10-05 实测）：
          // 默认的 surfaceView 是独立图层，会打断 Android 原生焦点搜索 ——
          // 表现为播放页控制条内方向键完全失效（uiautomator 显示焦点卡在 tv-play-back，
          // 按 RIGHT/LEFT/DOWN 都不动），已用「去掉 VideoView 即恢复」做了隔离对照。
          // TextureView 参与常规视图层级，代价是 CPU/功耗略高，TV 上可接受。
          surfaceType="textureView"
        />
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground, fontSize: scale(18) }}>正在加载视频…</Text>
        </View>
      )}

      {/* 控制条常驻、不做淡出（2026-10-05 实测修正，两条实证）：
          1) 原实现 `showControls ? <控制条/> : null` 超时后把按钮从原生树里卸载，
             播放页按 DOWN 找不到任何下方可聚焦元素（TV 上没有触摸，致命）。
          2) 改成「常驻 + 超时降到 0.3 不透明度」仍然不行：logcat 实证 RIGHT 已把焦点
             移到 play-play（09:20:29.619 FOCUS），5.1s 后控制条淡出那一刻
             play-play BLUR、焦点被 TVFocusBridge 补回首元素 play-back。
             即**改 opacity 会让已聚焦的原生视图失焦**。
          故控制条常驻满不透明度：电视上没有指针，操作全靠遥控，常显控制条心智最省。*/}
      <View
        style={[styles.controls, { backgroundColor: colors.playerHeader }]}
        pointerEvents="box-none"
      >
          <View style={styles.controlRow}>
            <TVButton id="play-back" label="返回" onPress={() => nav.goBack()} testID="tv-play-back" />
            <TVButton
              id="play-play"
              label={paused ? '播放' : '暂停'}
              variant="primary"
              onPress={togglePlay}
              testID="tv-play-playpause"
            />
            <TVButton id="play-prev" label={`上一集 (${fmt(30)})`} onPress={() => seek(-SKIP_SECONDS)} testID="tv-play-seekback" />
            <TVButton id="play-next" label={`下一集 (${fmt(30)})`} onPress={() => seek(SKIP_SECONDS)} testID="tv-play-seekforward" />
            <TVButton
              id="play-prev-ep"
              label="上一集"
              disabled={!prevEp}
              onPress={() => prevEp && gotoEpisode(prevEp.id)}
              testID="tv-play-prevepisode"
            />
            <TVButton
              id="play-next-ep"
              label="下一集"
              disabled={!nextEp}
              onPress={() => nextEp && gotoEpisode(nextEp.id)}
              testID="tv-play-nextepisode"
            />
          </View>

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
              ? `  第 ${episodes[currentIndex].episodeNumber} 集`
              : ''}
          </Text>
      </View>
    </View>
  );
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tv(40),
    paddingTop: tv(18),
    paddingBottom: tv(24),
  },
  controlRow: { flexDirection: 'row', alignItems: 'center', marginBottom: tv(14) },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: tv(10) },
  time: { fontSize: tv(15), marginHorizontal: tv(10), minWidth: tv(70), textAlign: 'center' },
  track: { flex: 1, height: tv(8), borderRadius: tv(4), overflow: 'hidden' },
  trackFill: { height: '100%' },
  title: { fontSize: tv(17), fontWeight: '600' },
});

export default PlayScreen;