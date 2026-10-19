import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';
import { UNCATEGORIZED_GENRE } from '@openreel/core';
import type { ShortDramaConfig } from '@openreel/core';

import { useAppStore, getProvider } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { TVSelectRow } from '../components/TVSelectRow';
import { TVChipMultiSelect } from '../components/TVChipMultiSelect';
import { TVFocusable } from '../focus/TVFocusable';
import { showTVToast } from '../components/TVToast';
import { focusRegistry } from '../focus/registry';
import {
  formatBytes,
  getCacheSizeBytes,
  clearCache,
  isLowStorage,
  TV_LOW_STORAGE_BYTES,
} from '../services/cache';
import { TV_LAYOUT, tv } from '../theme/tokens';

const MEDIA_TYPES = [
  { value: '', label: '全部' },
  { value: 'MOVIE', label: '电影' },
  { value: 'TV', label: '电视剧' },
  { value: 'VARIETY', label: '综艺' },
  { value: 'ANIME', label: '动漫' },
  { value: 'DOCUMENTARY', label: '纪录片' },
];

const CONFIG_TABS = [
  { id: 1, badge: '①', label: '匹配模板' },
  { id: 2, badge: '②', label: '探测时长' },
  { id: 3, badge: '③', label: '关键词' },
];

/** 与移动端 mediaTypeLabel 逐字一致 */
function mediaTypeLabel(type: string): string {
  switch (type) {
    case 'MOVIE': return '电影';
    case 'TV': return '电视剧';
    case 'VARIETY': return '综艺';
    case 'ANIME': return '动漫';
    case 'DOCUMENTARY': return '纪录片';
    default: return '其他';
  }
}

/** 全选 / 反选 / 清空（对齐移动端 QuickActions；TV 端改为可聚焦按钮） */
function QuickActions({
  idPrefix,
  onAll,
  onInvert,
  onClear,
}: {
  idPrefix: string;
  onAll: () => void;
  onInvert: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.quickRow}>
      <TVButton id={`${idPrefix}-all`} label="全选" variant="ghost" onPress={onAll} />
      <TVButton id={`${idPrefix}-invert`} label="反选" variant="ghost" onPress={onInvert} />
      <TVButton id={`${idPrefix}-clear`} label="清空" variant="ghost" onPress={onClear} />
    </View>
  );
}

/** 已选/已有项 chips（点按移除），与移动端 TagEditor / 待删除项语义一致 */
function RemovableChips({
  idPrefix,
  items,
  onRemove,
  tone,
  testIDPrefix,
}: {
  idPrefix: string;
  items: string[];
  onRemove: (v: string) => void;
  tone: 'destructive' | 'warning' | 'neutral';
  testIDPrefix?: string;
}) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const accent =
    tone === 'destructive' ? colors.error : tone === 'warning' ? colors.warning : colors.foreground;
  const unique = [...new Set(items)];
  if (unique.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      {unique.map((item) => (
        <TVFocusable
          key={item}
          id={`${idPrefix}:${item}`}
          onPress={() => onRemove(item)}
          style={[styles.chip, { backgroundColor: hexToRgba(accent, 0.15) }]}
          testID={testIDPrefix ? `${testIDPrefix}-${item}` : undefined}
        >
          <View style={styles.chipInner}>
            <Text style={{ color: accent, fontSize: scale(16), fontWeight: '600' }}>{item}</Text>
            <X size={tv(16)} color={accent} />
          </View>
        </TVFocusable>
      ))}
    </View>
  );
}

/**
 * TV 视频管理。
 *
 * 与移动端（apps/mobile/src/pages/VideoManagementScreen.tsx）功能与文案同步：
 *  存储状况（TV 特色） / 数据统计 / 长短剧判断配置 / 批量重新探测长短剧 /
 *  按子类型删除视频 / 按子类型隐藏视频 / 删除所有视频 / 删除无播放源视频
 *
 * TV 端刻意保留的差异（用户 2026-10-16 确认「全部保留」）：
 *  - 存储状况卡片：额外展示系统可用空间与低存储告警（电视盒子存储小）。
 *  - 危险操作一律「3 秒内两次确认」，不弹 RN Alert（遥控对 Alert 焦点不友好）。
 *  - 子类型多选 chips 首屏限量 + 「显示全部」（遥控遍历成本高于手指滑动）。
 */
export function VideoManagementScreen() {
  const colors = useThemeColors();
  // 卡片/面板底遵循「卡片透明度」，与移动端同名页面一致
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const scale = useScaledFontSize();
  const cardBg = hexToRgba(colors.card, cardOpacity / 100);
  const surfaceBg = hexToRgba(colors.surface, cardOpacity / 100);
  const statBoxBg = hexToRgba(colors.mutedForeground, 0.12);

  const {
    deleteAllMedia,
    deleteMediaWithoutPlaySource,
    deleteMediaByGenres,
    getSubTypesByType,
    getHiddenMediaCount,
    getHiddenGenres,
    getUncategorizedCount,
    hideMediaByGenres,
    unhideMediaByGenres,
    shortDramaConfig,
    loadShortDramaConfig,
    updateShortDramaConfig,
    getDefaultShortDramaConfig,
    reprobeMediaList,
    loadReprobeMediaList,
    loadRunningReprobeTask,
    runningReprobeTask,
    startReprobeTask,
    cancelReprobeTask,
    reprobePoll,
    startReprobePolling,
    videoManageDeleteType: deleteMediaType,
    setVideoManageDeleteType,
    videoManageHideType: hideMediaType,
    setVideoManageHideType,
  } = useAppStore();

  // —— TV 特色：存储状况 ——
  const [cacheSize, setCacheSize] = useState(0);
  const [free, setFree] = useState<number | null>(null);
  const [lowStorage, setLowStorage] = useState(false);

  // —— 数据统计 ——
  const [mediaStats, setMediaStats] = useState<{
    total: number;
    byType: { type: string; count: number }[];
  } | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

  // —— 子类型删除 / 隐藏 ——
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [visibleGenres, setVisibleGenres] = useState<string[]>([]);
  const [hiddenGenres, setHiddenGenres] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVisibleGenres, setSelectedVisibleGenres] = useState<string[]>([]);
  const [selectedHiddenGenres, setSelectedHiddenGenres] = useState<string[]>([]);

  // —— 长短剧判断配置 ——
  const [localConfig, setLocalConfig] = useState<ShortDramaConfig | null>(null);
  const [patternInput, setPatternInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [activeLayer, setActiveLayer] = useState(1);

  // —— 危险操作两次确认 / 提示 ——
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStats = useCallback(async () => {
    setCacheSize(getCacheSizeBytes());
    const ls = await isLowStorage();
    setFree(ls.free > 0 ? ls.free : null);
    setLowStorage(ls.low);
    try {
      const provider = getProvider();
      const [totalRow, byType] = await Promise.all([
        provider.selectOne<{ count: number }>('SELECT COUNT(*) as count FROM media'),
        provider.select<{ type: string; count: number }>(
          'SELECT type, COUNT(*) as count FROM media GROUP BY type',
        ),
      ]);
      setMediaStats({ total: totalRow?.count || 0, byType: byType || [] });
      setHiddenCount(await getHiddenMediaCount());
    } catch (e) {
      showTVToast(`统计加载失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, [getHiddenMediaCount]);

  const loadDeleteGenres = useCallback(async () => {
    try {
      setAllGenres(await getSubTypesByType(deleteMediaType || undefined, true));
    } catch {
      // 子类型加载失败不阻断本页
    }
  }, [getSubTypesByType, deleteMediaType]);

  const loadHideGenres = useCallback(async () => {
    const [all, visible, hiddenRaw, uncatVisible, uncatAll] = await Promise.all([
      getSubTypesByType(hideMediaType || undefined, true),
      getSubTypesByType(hideMediaType || undefined, false),
      getHiddenGenres(),
      getUncategorizedCount(hideMediaType || undefined, false),
      getUncategorizedCount(hideMediaType || undefined, true),
    ]);
    const hidden = hiddenRaw.filter((h) => h !== UNCATEGORIZED_GENRE && all.includes(h));
    if (hiddenRaw.includes(UNCATEGORIZED_GENRE) && uncatAll > 0) hidden.push(UNCATEGORIZED_GENRE);
    setVisibleGenres([...new Set([...visible, ...(uncatVisible > 0 ? [UNCATEGORIZED_GENRE] : [])])]);
    setHiddenGenres(hidden);
  }, [getSubTypesByType, getHiddenGenres, getUncategorizedCount, hideMediaType]);

  useEffect(() => {
    loadShortDramaConfig().catch(() => {});
    loadReprobeMediaList().catch(() => {});
    loadRunningReprobeTask().catch(() => {});
    refreshStats().catch(() => {});
    const t = setTimeout(() => focusRegistry.requestInitialFocus('vm-back'), 120);
    return () => clearTimeout(t);
  }, [loadShortDramaConfig, loadReprobeMediaList, loadRunningReprobeTask, refreshStats]);

  useEffect(() => {
    loadDeleteGenres().catch(() => {});
  }, [loadDeleteGenres]);

  useEffect(() => {
    loadHideGenres().catch(() => {});
  }, [loadHideGenres]);

  // 返回本页时刷新隐藏统计（与移动端 useFocusEffect 同义）
  useFocusEffect(
    useCallback(() => {
      setSelectedVisibleGenres([]);
      setSelectedHiddenGenres([]);
      loadHideGenres().catch(() => {});
      getHiddenMediaCount().then(setHiddenCount).catch(() => {});
    }, [loadHideGenres, getHiddenMediaCount]),
  );

  useEffect(() => {
    if (shortDramaConfig) setLocalConfig({ ...shortDramaConfig });
  }, [shortDramaConfig]);

  // —— 重新探测任务 ——
  const reprobing = !!reprobePoll && reprobePoll.status === 'running';
  const reprobeResult = reprobePoll ? reprobePoll.result : null;
  const reprobeProgress = reprobePoll?.progress ?? null;

  const prevPollStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = reprobePoll?.status ?? null;
    if (prevPollStatusRef.current === 'running' && status && status !== 'running') {
      if (status === 'done') showTVToast('探测任务已完成', 'success');
      else if (status === 'failed') showTVToast('探测任务失败', 'error');
    }
    prevPollStatusRef.current = status;
  }, [reprobePoll?.status]);

  useEffect(() => {
    if (runningReprobeTask) startReprobePolling(runningReprobeTask.taskId);
  }, [runningReprobeTask, startReprobePolling]);

  // 两次确认的 3 秒窗口
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(t);
  }, [pending]);

  /** 危险操作统一入口：首次按只提示，3 秒内再按才执行 */
  const confirmOrRun = useCallback(
    async (key: string, label: string, fn: () => Promise<string | number | void>) => {
      if (pending !== key) {
        setPending(key);
        showTVToast(`再按一次以${label}（3 秒内有效）`, 'info');
        return;
      }
      setPending(null);
      setBusy(true);
      showTVToast(`正在${label}…`, 'info');
      try {
        const result = await fn();
        const okText =
          typeof result === 'string'
            ? result
            : typeof result === 'number'
              ? `${label}完成，共处理 ${result} 条`
              : `${label}完成`;
        showTVToast(okText, 'success');
        await refreshStats();
      } catch (e) {
        showTVToast(`${label}失败：${e instanceof Error ? e.message : String(e)}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [pending, refreshStats],
  );

  const handleClearCache = useCallback(() => {
    if (pending !== 'cache') {
      setPending('cache');
      showTVToast('再按一次以清理缓存（3 秒内有效）', 'info');
      return;
    }
    setPending(null);
    const removed = clearCache();
    showTVToast(`已清理 ${formatBytes(removed)}`, 'success');
    refreshStats().catch(() => {});
  }, [pending, refreshStats]);

  const handleDeleteByGenre = useCallback(() => {
    if (selectedGenres.length === 0) return;
    confirmOrRun('del-genres', `删除子类型「${selectedGenres.join('、')}」下的所有视频`, async () => {
      const r = await deleteMediaByGenres(selectedGenres);
      setSelectedGenres([]);
      return r.deleted > 0 ? `删除完成：成功删除 ${r.deleted} 部视频` : '没有匹配的视频';
    });
  }, [confirmOrRun, deleteMediaByGenres, selectedGenres]);

  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }, []);

  const toggleVisibleGenre = useCallback((genre: string) => {
    setSelectedVisibleGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }, []);

  const toggleHiddenGenre = useCallback((genre: string) => {
    setSelectedHiddenGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }, []);

  // 隐藏/取消隐藏在移动端无二次确认（直接执行），此处保持一致
  const handleHideSelected = useCallback(async () => {
    if (selectedVisibleGenres.length === 0) return;
    setBusy(true);
    showTVToast('正在隐藏所选子类型…', 'info');
    try {
      const r = await hideMediaByGenres(selectedVisibleGenres);
      setSelectedVisibleGenres([]);
      await loadHideGenres();
      await refreshStats();
      showTVToast(`隐藏完成：已隐藏 ${r.hidden} 部视频`, 'success');
    } catch (e) {
      showTVToast(`隐藏失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [selectedVisibleGenres, hideMediaByGenres, loadHideGenres, refreshStats]);

  const handleUnhideSelected = useCallback(async () => {
    if (selectedHiddenGenres.length === 0) return;
    setBusy(true);
    showTVToast('正在恢复所选子类型…', 'info');
    try {
      const r = await unhideMediaByGenres(selectedHiddenGenres);
      setSelectedHiddenGenres([]);
      await loadHideGenres();
      await refreshStats();
      showTVToast(`恢复完成：已恢复 ${r.unhidden} 部视频`, 'success');
    } catch (e) {
      showTVToast(`恢复失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [selectedHiddenGenres, unhideMediaByGenres, loadHideGenres, refreshStats]);

  // —— 长短剧配置 ——
  const applyLocalConfig = useCallback(
    (next: ShortDramaConfig) => {
      setLocalConfig(next);
      updateShortDramaConfig(next).catch((e) =>
        showTVToast(`保存失败：${e instanceof Error ? e.message : String(e)}`, 'error'),
      );
    },
    [updateShortDramaConfig],
  );

  const addPattern = useCallback(() => {
    const v = patternInput.trim();
    if (!v || !localConfig || localConfig.summaryPatterns.includes(v)) return;
    applyLocalConfig({ ...localConfig, summaryPatterns: [...localConfig.summaryPatterns, v] });
    setPatternInput('');
  }, [patternInput, localConfig, applyLocalConfig]);

  const removePattern = useCallback(
    (pattern: string) => {
      if (!localConfig) return;
      applyLocalConfig({
        ...localConfig,
        summaryPatterns: localConfig.summaryPatterns.filter((p) => p !== pattern),
      });
    },
    [localConfig, applyLocalConfig],
  );

  const addKeyword = useCallback(() => {
    const v = keywordInput.trim();
    if (!v || !localConfig || localConfig.metaKeywords.includes(v)) return;
    applyLocalConfig({ ...localConfig, metaKeywords: [...localConfig.metaKeywords, v] });
    setKeywordInput('');
  }, [keywordInput, localConfig, applyLocalConfig]);

  const removeKeyword = useCallback(
    (kw: string) => {
      if (!localConfig) return;
      applyLocalConfig({
        ...localConfig,
        metaKeywords: localConfig.metaKeywords.filter((k) => k !== kw),
      });
    },
    [localConfig, applyLocalConfig],
  );

  // 与移动端同款取值范围（parseInt || 默认值，最小 1）
  const setThreshold = useCallback(
    (text: string) => {
      if (!localConfig) return;
      applyLocalConfig({
        ...localConfig,
        durationThresholdMinutes: Math.max(1, parseInt(text) || 30),
      });
    },
    [localConfig, applyLocalConfig],
  );

  const setProbeCount = useCallback(
    (text: string) => {
      if (!localConfig) return;
      applyLocalConfig({ ...localConfig, probeEpisodeCount: Math.max(1, parseInt(text) || 8) });
    },
    [localConfig, applyLocalConfig],
  );

  const handleResetConfig = useCallback(() => {
    applyLocalConfig(getDefaultShortDramaConfig());
    showTVToast('已恢复默认配置', 'success');
  }, [applyLocalConfig, getDefaultShortDramaConfig]);

  const handleStartReprobe = useCallback(() => {
    if (reprobeMediaList.length === 0) return;
    confirmOrRun('reprobe', '开始批量重新探测', async () => {
      await startReprobeTask();
      return '探测任务已开始';
    });
  }, [confirmOrRun, reprobeMediaList.length, startReprobeTask]);

  const handleCancelReprobe = useCallback(() => {
    if (!runningReprobeTask) return;
    confirmOrRun('cancel-reprobe', '取消探测任务', async () => {
      await cancelReprobeTask(runningReprobeTask.taskId);
      await loadReprobeMediaList();
      return '已取消探测任务';
    });
  }, [confirmOrRun, runningReprobeTask, cancelReprobeTask, loadReprobeMediaList]);

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="视频管理" backId="vm-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== 存储状况（TV 特色：可用空间 + 低存储告警） ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          存储状况
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: surfaceBg, borderColor: lowStorage ? colors.error : colors.border },
          ]}
        >
          {free != null ? (
            <Text
              style={{
                color: lowStorage ? colors.error : colors.textSecondary,
                fontSize: scale(16),
              }}
            >
              系统可用：{formatBytes(free)}
              {lowStorage ? `（低于 ${formatBytes(TV_LOW_STORAGE_BYTES)}，建议清理）` : ''}
            </Text>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>
              无法读取系统可用空间
            </Text>
          )}
          <View style={styles.btnRow}>
            <TVButton id="vm-refresh" label="刷新" onPress={() => refreshStats()} testID="tv-vm-refresh" />
          </View>
        </View>

        {/* ===== 数据统计（对齐移动端文案） ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          数据统计
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            查看视频数据统计与应用缓存占用
          </Text>

          {mediaStats ? (
            <View style={styles.statsWrap}>
              <View style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                <Text style={{ color: colors.foreground, fontSize: scale(20), fontWeight: '700' }}>
                  {mediaStats.total}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                  总视频数
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                <Text style={{ color: colors.foreground, fontSize: scale(20), fontWeight: '700' }}>
                  {hiddenCount}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                  已隐藏
                </Text>
              </View>
              {mediaStats.byType.map((item) => (
                <View key={item.type || 'unknown'} style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                  <Text style={{ color: colors.foreground, fontSize: scale(20), fontWeight: '700' }}>
                    {item.count}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                    {mediaTypeLabel(item.type)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.cacheRow}>
            <View style={styles.flex1}>
              <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>
                缓存大小：
                <Text style={{ color: colors.foreground, fontWeight: '700' }}>
                  {formatBytes(cacheSize)}
                </Text>
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(4) }}>
                视频分片等临时文件，清理后播放时自动重建
              </Text>
            </View>
            <TVButton
              id="vm-clear-cache"
              label={pending === 'cache' ? '确认清理？' : '清理缓存'}
              disabled={busy || cacheSize === 0}
              onPress={handleClearCache}
              testID="tv-vm-clear-cache"
            />
          </View>
        </View>

        {/* ===== 长短剧判断配置 ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          长短剧判断配置
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            配置三层判断逻辑的参数。修改配置后需重新探测才能生效。
          </Text>

          {localConfig && (
            <>
              <View style={styles.segmentRow}>
                {CONFIG_TABS.map((tab) => {
                  const isActive = activeLayer === tab.id;
                  return (
                    <TVFocusable
                      key={tab.id}
                      id={`vm-layer:${tab.id}`}
                      onPress={() => setActiveLayer(tab.id)}
                      style={[
                        styles.segment,
                        isActive && styles.segmentActive,
                        {
                          backgroundColor: hexToRgba(
                            isActive ? colors.cardAccent : colors.cardDim,
                            cardOpacity / 100,
                          ),
                        },
                      ]}
                      testID={`tv-vm-layer-${tab.id}`}
                    >
                      <View style={styles.segmentBadge}>
                        <Text
                          style={[
                            styles.segmentBadgeText,
                            {
                              color: isActive ? colors.buttonPrimaryText : colors.buttonSecondaryText,
                              fontSize: scale(18),
                            },
                          ]}
                        >
                          {tab.badge}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.segmentText,
                          isActive && styles.segmentTextActive,
                          {
                            color: isActive ? colors.buttonPrimaryText : colors.buttonSecondaryText,
                            fontSize: scale(16),
                          },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TVFocusable>
                  );
                })}
              </View>

              <View
                style={[
                  styles.configPanel,
                  { backgroundColor: hexToRgba(colors.cardAccent, cardOpacity / 100) },
                ]}
              >
                {activeLayer === 1 && (
                  <>
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
                      用 {'{N}'} 代表数字，例如「{'{N}'}分钟」可匹配"30分钟"、"每集30分钟"等文本中的时长
                    </Text>
                    <RemovableChips
                      idPrefix="vm-pattern"
                      items={localConfig.summaryPatterns}
                      onRemove={removePattern}
                      tone="neutral"
                      testIDPrefix="tv-vm-pattern"
                    />
                    <TVTextInput
                      id="vm-pattern-input"
                      value={patternInput}
                      mode="text"
                      maxLength={60}
                      placeholder="输入模板，如 {N}分钟"
                      hint="输入完成后点「添加」写入模板列表"
                      onChangeText={setPatternInput}
                      testID="tv-vm-pattern-input"
                    />
                    <View style={styles.btnRow}>
                      <TVButton id="vm-pattern-add" label="添加" variant="primary" onPress={addPattern} testID="tv-vm-pattern-add" />
                    </View>
                  </>
                )}

                {activeLayer === 2 && (
                  <>
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
                      逐集探测视频流时长，成功1集即止；根据探测结果与下方阈值判断长短剧
                    </Text>
                    <TVTextInput
                      id="vm-threshold"
                      label="短剧判定阈值（分钟）"
                      value={String(localConfig.durationThresholdMinutes)}
                      mode="digits"
                      maxLength={4}
                      hint="单集时长低于阈值为短剧"
                      onChangeText={setThreshold}
                      testID="tv-vm-threshold"
                    />
                    <TVTextInput
                      id="vm-probe-count"
                      label="探测集数上限"
                      value={String(localConfig.probeEpisodeCount)}
                      mode="digits"
                      maxLength={4}
                      hint="最多探测N集视频流"
                      onChangeText={setProbeCount}
                      testID="tv-vm-probe-count"
                    />
                  </>
                )}

                {activeLayer === 3 && (
                  <>
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
                      当第1、2层均未命中时，根据简介、标题、类型中是否包含这些关键词来判断
                    </Text>
                    <RemovableChips
                      idPrefix="vm-keyword"
                      items={localConfig.metaKeywords}
                      onRemove={removeKeyword}
                      tone="neutral"
                      testIDPrefix="tv-vm-keyword"
                    />
                    <TVTextInput
                      id="vm-keyword-input"
                      value={keywordInput}
                      mode="text"
                      maxLength={40}
                      placeholder="输入关键词"
                      hint="输入完成后点「添加」写入关键词列表"
                      onChangeText={setKeywordInput}
                      testID="tv-vm-keyword-input"
                    />
                    <View style={styles.btnRow}>
                      <TVButton id="vm-keyword-add" label="添加" variant="primary" onPress={addKeyword} testID="tv-vm-keyword-add" />
                    </View>
                  </>
                )}
              </View>

              <View
                style={[styles.panelDivider, { backgroundColor: hexToRgba(colors.mutedForeground, 0.2) }]}
              />
              <View style={styles.btnRow}>
                <TVButton
                  id="vm-config-reset"
                  label="恢复默认配置"
                  onPress={handleResetConfig}
                  testID="tv-vm-config-reset"
                />
              </View>
            </>
          )}
        </View>

        {/* ===== 批量重新探测长短剧 ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          批量重新探测长短剧
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            对所有经过三级降级判断后仍为兜底状态（FALLBACK）或未判断的电视剧进行重新探测。
            此操作将实际探测视频流时长，准确判断长短剧分类。任务在后台运行，可以跳转到其他页面。
          </Text>

          <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>
            待探测：
            <Text style={{ color: colors.foreground, fontWeight: '700' }}>
              {reprobeMediaList.length} 部电视剧
            </Text>
          </Text>

          {runningReprobeTask && (
            <View style={[styles.runningBox, { backgroundColor: hexToRgba(colors.mutedForeground, 0.15) }]}>
              <View style={styles.runningHead}>
                <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>
                  探测任务运行中
                </Text>
                <TVButton
                  id="vm-reprobe-cancel"
                  label={pending === 'cancel-reprobe' ? '确认取消？' : '取消'}
                  variant="ghost"
                  disabled={busy}
                  onPress={handleCancelReprobe}
                  testID="tv-vm-reprobe-cancel"
                />
              </View>

              {reprobing && reprobeProgress && (
                <>
                  <View style={[styles.progressBar, { backgroundColor: colors.trackBg }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: colors.mutedForeground,
                          width: `${reprobeProgress.total > 0 ? (reprobeProgress.processed / reprobeProgress.total) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressText, { color: colors.mutedForeground, fontSize: scale(14) }]}>
                    {reprobeProgress.processed}/{reprobeProgress.total}
                  </Text>
                  <View style={styles.statsWrap}>
                    <View style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                      <Text style={{ color: colors.foreground, fontSize: scale(20), fontWeight: '700' }}>
                        {reprobeProgress.processed}
                      </Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                        已处理
                      </Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                      <Text style={{ color: colors.success, fontSize: scale(20), fontWeight: '700' }}>
                        {reprobeProgress.shortDrama}
                      </Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                        短剧
                      </Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                      <Text style={{ color: colors.textSecondary, fontSize: scale(20), fontWeight: '700' }}>
                        {reprobeProgress.longDrama}
                      </Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                        长剧
                      </Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: statBoxBg }]}>
                      <Text style={{ color: colors.error, fontSize: scale(20), fontWeight: '700' }}>
                        {reprobeProgress.failed}
                      </Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontSize: scale(13) }]}>
                        失败
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {reprobeResult && !reprobing && (
            <View style={[styles.resultBox, { backgroundColor: statBoxBg }]}>
              <Text style={{ color: colors.textSecondary, fontSize: scale(15), lineHeight: tv(24) }}>
                探测完成：共处理 {reprobeResult.total} 部{'\n'}
                短剧: {reprobeResult.shortDrama}  长剧: {reprobeResult.longDrama}  失败: {reprobeResult.failed}
              </Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <TVButton
              id="vm-reprobe-start"
              label={
                pending === 'reprobe'
                  ? '确认开始？'
                  : `开始批量重新探测 (${reprobeMediaList.length})`
              }
              variant="primary"
              disabled={reprobing || reprobeMediaList.length === 0 || !!runningReprobeTask || busy}
              onPress={handleStartReprobe}
              testID="tv-vm-reprobe-start"
            />
          </View>
        </View>

        {/* ===== 按子类型删除视频 ===== */}
        <Text style={[styles.sectionTitle, { color: colors.error, fontSize: scale(19) }]}>
          按子类型删除视频
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            先选择大类，再选择该大类下的子类型进行删除。此操作不可恢复。
          </Text>

          <TVSelectRow<string>
            id="vm-del-type"
            label=""
            hideLabel
            value={deleteMediaType}
            options={MEDIA_TYPES}
            onChange={(v) => {
              setSelectedGenres([]);
              setVideoManageDeleteType(v);
            }}
          />

          <View style={styles.sectionRow}>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(15), fontWeight: '500' }}>
              可选子类型 ({allGenres.length})
            </Text>
            <QuickActions
              idPrefix="vm-del-quick"
              onAll={() => setSelectedGenres([...allGenres])}
              onInvert={() => setSelectedGenres((prev) => allGenres.filter((g) => !prev.includes(g)))}
              onClear={() => setSelectedGenres([])}
            />
          </View>
          <TVChipMultiSelect
            idPrefix="vm-del-genre"
            items={allGenres}
            selected={selectedGenres}
            onToggle={toggleGenre}
            tone="destructive"
            emptyText="暂无子类型数据"
            testIDPrefix="tv-vm-del-genre"
          />

          <View style={[styles.pendingBox, { backgroundColor: hexToRgba(colors.error, 0.05) }]}>
            <Text style={{ color: colors.error, fontSize: scale(15), fontWeight: '500' }}>
              待删除子类 ({selectedGenres.length})
            </Text>
            {selectedGenres.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: scale(14) }}>
                请在上方各分类中选择要删除的子类型
              </Text>
            ) : (
              <RemovableChips
                idPrefix="vm-del-selected"
                items={selectedGenres}
                onRemove={toggleGenre}
                tone="destructive"
                testIDPrefix="tv-vm-del-selected"
              />
            )}
          </View>

          <View style={styles.btnRow}>
            <TVButton
              id="vm-del-submit"
              label={
                pending === 'del-genres'
                  ? '确认删除？'
                  : `删除所选子类型 (${selectedGenres.length})`
              }
              variant="danger"
              disabled={busy || selectedGenres.length === 0}
              onPress={handleDeleteByGenre}
              testID="tv-vm-del-submit"
            />
          </View>
        </View>

        {/* ===== 按子类型隐藏视频 ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          按子类型隐藏视频
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            先选择子类型，再点击下方按钮一次性批量隐藏或恢复，避免逐个等待。
          </Text>

          <TVSelectRow<string>
            id="vm-hide-type"
            label=""
            hideLabel
            value={hideMediaType}
            options={MEDIA_TYPES}
            onChange={(v) => {
              setSelectedVisibleGenres([]);
              setSelectedHiddenGenres([]);
              setVideoManageHideType(v);
            }}
          />

          <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>
            当前已隐藏：
            <Text style={{ color: colors.foreground, fontWeight: '700' }}>{hiddenCount} 部视频</Text>
          </Text>

          <View style={styles.sectionRow}>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(15), fontWeight: '500' }}>
              未隐藏 ({visibleGenres.length})
            </Text>
            <QuickActions
              idPrefix="vm-visible-quick"
              onAll={() => setSelectedVisibleGenres([...visibleGenres])}
              onInvert={() =>
                setSelectedVisibleGenres((prev) => visibleGenres.filter((g) => !prev.includes(g)))
              }
              onClear={() => setSelectedVisibleGenres([])}
            />
          </View>
          <TVChipMultiSelect
            idPrefix="vm-hide-visible"
            items={visibleGenres}
            selected={selectedVisibleGenres}
            onToggle={toggleVisibleGenre}
            tone="warning"
            emptyText="暂无未隐藏的子类型"
            testIDPrefix="tv-vm-hide-visible"
          />

          <View style={styles.btnRow}>
            <TVButton
              id="vm-hide-submit"
              label={`隐藏所选子类型 (${selectedVisibleGenres.length})`}
              disabled={busy || selectedVisibleGenres.length === 0}
              onPress={handleHideSelected}
              testID="tv-vm-hide-submit"
            />
          </View>

          <View style={[styles.pendingBox, { backgroundColor: hexToRgba(colors.warning, 0.05) }]}>
            <View style={styles.sectionRow}>
              <Text style={{ color: colors.warning, fontSize: scale(15), fontWeight: '500' }}>
                已隐藏子类 ({hiddenGenres.length})
              </Text>
              <QuickActions
                idPrefix="vm-hidden-quick"
                onAll={() => setSelectedHiddenGenres([...hiddenGenres])}
                onInvert={() =>
                  setSelectedHiddenGenres((prev) => hiddenGenres.filter((g) => !prev.includes(g)))
                }
                onClear={() => setSelectedHiddenGenres([])}
              />
            </View>
            <TVChipMultiSelect
              idPrefix="vm-hidden"
              items={hiddenGenres}
              selected={selectedHiddenGenres}
              onToggle={toggleHiddenGenre}
              tone="warning-solid"
              emptyText="暂无已隐藏的子类型"
              testIDPrefix="tv-vm-hidden"
            />
            <View style={styles.btnRow}>
              <TVButton
                id="vm-unhide-submit"
                label={`取消隐藏所选子类型 (${selectedHiddenGenres.length})`}
                disabled={busy || selectedHiddenGenres.length === 0}
                onPress={handleUnhideSelected}
                testID="tv-vm-unhide-submit"
              />
            </View>
          </View>
        </View>

        {/* ===== 删除所有视频 ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          删除所有视频
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            删除所有视频数据，包括剧集播放线路、收藏和观看历史。已配置的视频源与采集设置不受影响。此操作无法撤销。
          </Text>
          <View style={styles.btnRow}>
            <TVButton
              id="vm-del-all"
              label={pending === 'del-all' ? '确认删除？' : '删除所有视频'}
              variant="danger"
              disabled={busy}
              onPress={() =>
                confirmOrRun('del-all', '删除所有视频', async () => {
                  await deleteAllMedia();
                  return '所有视频已删除';
                })
              }
              testID="tv-vm-del-all"
            />
          </View>
        </View>

        {/* ===== 删除无播放源视频 ===== */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          删除无播放源视频
        </Text>
        <View style={[styles.card, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            删除所有没有播放源的视频。此操作无法撤销。
          </Text>
          <View style={styles.btnRow}>
            <TVButton
              id="vm-del-orphans"
              label={pending === 'del-orphans' ? '确认删除？' : '删除无播放源视频'}
              variant="danger"
              disabled={busy}
              onPress={() =>
                confirmOrRun('del-orphans', '删除无播放源视频', async () => {
                  const n = await deleteMediaWithoutPlaySource();
                  return `已删除 ${n} 个无播放源的视频`;
                })
              }
              testID="tv-vm-del-orphans"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  sectionTitle: { fontWeight: '700', marginBottom: tv(12), marginTop: tv(6) },
  card: { padding: tv(20), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(22) },
  cardDesc: { lineHeight: tv(24), marginBottom: tv(12) },
  segmentRow: { flexDirection: 'row', gap: tv(6), alignItems: 'flex-end' },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tv(6),
    paddingVertical: tv(8),
    borderTopLeftRadius: tv(10),
    borderTopRightRadius: tv(10),
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  segmentActive: { paddingVertical: tv(11) },
  segmentBadge: {
    width: tv(30),
    height: tv(30),
    borderRadius: tv(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: { fontWeight: '700' },
  segmentText: { fontWeight: '500' },
  segmentTextActive: { fontWeight: '600' },
  configPanel: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: tv(10),
    borderBottomRightRadius: tv(10),
    padding: tv(14),
  },
  panelDivider: { height: StyleSheet.hairlineWidth, marginVertical: tv(4) },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: tv(14) },
  quickRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: tv(10),
  },
  flex1: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tv(10), marginBottom: tv(12) },
  chip: { paddingHorizontal: tv(16), paddingVertical: tv(9), borderRadius: tv(8) },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: tv(8) },
  statsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: tv(10), marginBottom: tv(14) },
  statBox: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: tv(12),
    borderRadius: tv(8),
  },
  statLabel: { marginTop: tv(4) },
  cacheRow: { flexDirection: 'row', alignItems: 'center', gap: tv(14) },
  runningBox: { padding: tv(14), borderRadius: tv(8), marginBottom: tv(14), gap: tv(10) },
  runningHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  progressBar: { height: tv(8), borderRadius: tv(4), overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: tv(4) },
  progressText: { textAlign: 'center' },
  resultBox: { padding: tv(14), borderRadius: tv(8), marginBottom: tv(14) },
  pendingBox: {
    padding: tv(14),
    borderRadius: tv(8),
    marginTop: tv(6),
    marginBottom: tv(6),
    gap: tv(8),
  },
});

export default VideoManagementScreen;
