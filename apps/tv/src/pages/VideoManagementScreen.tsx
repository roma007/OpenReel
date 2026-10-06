import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { focusRegistry } from '../focus/registry';
import {
  formatBytes,
  getCacheSizeBytes,
  clearCache,
  isLowStorage,
  TV_LOW_STORAGE_BYTES,
} from '../services/cache';
import { tv } from '../theme/tokens';

/**
 * TV 视频与缓存管理。
 *
 * 与手机端差异：
 *  - 手机端用 Alert 确认框；TV 端无触摸，改成「两次确认」模式：
 *    第一次按删除 → 按钮变为「确认删除？」，3 秒内再按才真正执行，超时自动还原。
 *  - 新增「缓存占用 / 可用空间」展示（手机端无空间提示，见 plan 第九节取证）：
 *    电视盒子存储小，播放前就应能看到空间状况。
 */
export function VideoManagementScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const deleteAllMedia = useAppStore((s) => s.deleteAllMedia);
  const deleteMediaWithoutPlaySource = useAppStore((s) => s.deleteMediaWithoutPlaySource);
  const getHiddenMediaCount = useAppStore((s) => s.getHiddenMediaCount);
  const getUncategorizedCount = useAppStore((s) => s.getUncategorizedCount);

  const [cacheSize, setCacheSize] = useState(0);
  const [free, setFree] = useState<number | null>(null);
  const [lowStorage, setLowStorage] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setCacheSize(getCacheSizeBytes());
    const ls = await isLowStorage();
    setFree(ls.free);
    setLowStorage(ls.low);
    try {
      setHiddenCount(await getHiddenMediaCount());
      setUncategorizedCount(await getUncategorizedCount());
    } catch {
      // 统计失败不阻断本页
    }
  }, [getHiddenMediaCount, getUncategorizedCount]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('vm-back'), 120);
    return () => clearTimeout(t);
  }, []);

  // 两次确认的 3 秒窗口
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(t);
  }, [pending]);

  const runDestructive = useCallback(
    async (key: string, fn: () => Promise<number | void>, label: string) => {
      if (pending !== key) {
        setPending(key);
        setMessage(`再按一次「确认删除」以${label}（3 秒内有效）`);
        return;
      }
      setPending(null);
      setBusy(true);
      setMessage(`正在${label}…`);
      try {
        const n = await fn();
        setMessage(typeof n === 'number' ? `${label}完成，共处理 ${n} 条` : `${label}完成`);
        refresh();
      } catch (e) {
        setMessage(`${label}失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [pending, refresh],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="视频与缓存" backId="vm-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: tv(56) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 存储状况 */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          存储状况
        </Text>
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: colors.surface,
              borderColor: lowStorage ? colors.error : colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>
            缓存占用：{formatBytes(cacheSize)}
          </Text>
          {free != null ? (
            <Text
              style={{
                color: lowStorage ? colors.error : colors.textSecondary,
                fontSize: scale(16),
                marginTop: tv(6),
              }}
            >
              系统可用：{formatBytes(free)}
              {lowStorage ? `（低于 ${formatBytes(TV_LOW_STORAGE_BYTES)}，建议清理）` : ''}
            </Text>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(6) }}>
              无法读取系统可用空间
            </Text>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(6) }}>
            缓存为播放时自动产生的视频分片，清除后会重新下载
          </Text>
          <View style={styles.btnRow}>
            <TVButton
              id="vm-clear-cache"
              label="清理缓存"
              disabled={busy || cacheSize === 0}
              onPress={() => {
                setBusy(true);
                const removed = clearCache();
                setBusy(false);
                setMessage(`已清理 ${formatBytes(removed)}`);
                refresh();
              }}
              testID="tv-vm-clear-cache"
            />
            <TVButton id="vm-refresh" label="刷新" onPress={refresh} />
          </View>
        </View>

        {/* 数据统计 */}
        <Text
          style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19), marginTop: tv(28) }]}
        >
          数据统计
        </Text>
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>
            已隐藏影片：{hiddenCount} 部
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: scale(16), marginTop: tv(6) }}>
            未分类影片：{uncategorizedCount} 部
          </Text>
        </View>

        {/* 危险操作 */}
        <Text
          style={[styles.sectionTitle, { color: colors.error, fontSize: scale(19), marginTop: tv(28) }]}
        >
          删除影片数据
        </Text>
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: scale(15), marginBottom: tv(12) }}>
            删除操作不可恢复；视频源配置与采集设置不受影响
          </Text>
          <View style={styles.btnRow}>
            <TVButton
              id="vm-del-orphans"
              label={pending === 'orphans' ? '确认删除？' : '删除无播放源视频'}
              variant="danger"
              disabled={busy}
              onPress={() =>
                runDestructive('orphans', deleteMediaWithoutPlaySource, '删除无播放源视频')
              }
              testID="tv-vm-del-orphans"
            />
            <TVButton
              id="vm-del-all"
              label={pending === 'all' ? '确认删除？' : '删除所有视频'}
              variant="danger"
              disabled={busy}
              onPress={() => runDestructive('all', deleteAllMedia, '删除所有视频')}
              testID="tv-vm-del-all"
            />
          </View>
        </View>

        {message ? (
          <Text style={{ color: colors.foreground, fontSize: scale(16), marginTop: tv(20) }}>{message}</Text>
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
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: tv(14) },
});

export default VideoManagementScreen;