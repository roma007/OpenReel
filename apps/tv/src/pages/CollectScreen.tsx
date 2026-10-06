import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CollectTask, VideoSource } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * TV 采集页。
 *
 * 用户确认 TV 版**不含后台自动采集**（电视常驻待机，调度器常驻耗电），
 * 故本页只提供手动采集入口：
 *   1. 关键词采集（按 OK 打开电视键盘输入，不依赖设备 IME）
 *   2. 按视频源全量采集
 *   3. 跳转任务列表查看进度
 *
 * 采集结果写入 TV 端自己的 SQLite（与手机/桌面端各自独立，符合用户选择）。
 */
export function CollectScreen() {
  const nav = useNavigation<Nav>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const sources = useAppStore((s) => s.videoSources);
  const loadVideoSources = useAppStore((s) => s.loadVideoSources);
  const collectByKeyword = useAppStore((s) => s.collectByKeyword);
  const collectSourceAll = useAppStore((s) => s.collectSourceAll);
  const collectLatest = useAppStore((s) => s.collectLatest);
  const tasks = useAppStore((s) => s.collectTasks);
  const loadCollectTasks = useAppStore((s) => s.loadCollectTasks);

  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadVideoSources();
    loadCollectTasks();
  }, [loadVideoSources, loadCollectTasks]);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('collect-back'), 120);
    return () => clearTimeout(t);
  }, []);

  const runKeywordCollect = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setMessage('请输入关键词');
      return;
    }
    setBusy(true);
    setMessage(`正在采集「${kw}」…`);
    try {
      const n = await collectByKeyword(kw);
      setMessage(`采集完成，共 ${n} 条`);
      loadCollectTasks();
    } catch (e) {
      setMessage(`采集失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [keyword, collectByKeyword, loadCollectTasks]);

  const runLatest = useCallback(async () => {
    setBusy(true);
    setMessage('正在更新各源最新内容…');
    try {
      const n = await collectLatest('manual');
      setMessage(`更新完成，共 ${n} 条`);
      loadCollectTasks();
    } catch (e) {
      setMessage(`更新失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [collectLatest, loadCollectTasks]);

  const runSourceAll = useCallback(
    async (source: VideoSource) => {
      setBusy(true);
      setMessage(`正在全量采集「${source.name}」…`);
      try {
        const r = await collectSourceAll(source.code);
        setMessage(
          r?.success
            ? `「${source.name}」采集完成：${r.collected} 条 / ${r.pages} 页`
            : `「${source.name}」采集失败：${r?.error || '未知错误'}`,
        );
        loadCollectTasks();
      } catch (e) {
        setMessage(`采集失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [collectSourceAll, loadCollectTasks],
  );

  const runningTasks = tasks.filter((t: CollectTask) => t.status === 'RUNNING' || t.status === 'PENDING');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="collect-back" label="返回" onPress={() => nav.goBack()} testID="tv-collect-back" />
        <Text style={[styles.topTitle, { color: colors.foreground, fontSize: scale(23) }]}>
          采集
        </Text>
        <TVButton id="collect-tasks" label="任务列表" onPress={() => nav.navigate('TaskList')} testID="tv-collect-tasks" />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 关键词采集 */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          关键词采集
        </Text>
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <TVTextInput
              id="collect-keyword-input"
              containerStyle={styles.inputContainer}
              value={keyword}
              mode="text"
              placeholder="输入片名或关键词"
              hint="按 OK 打开电视键盘输入"
              onChangeText={setKeyword}
              testID="tv-collect-input"
            />
          </View>
          <TVButton
            id="collect-keyword"
            label="开始采集"
            variant="primary"
            disabled={busy}
            onPress={runKeywordCollect}
            testID="tv-collect-keyword"
          />
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: scale(15) }]}>
          电视遥控输入较长，建议只输入片名关键词
        </Text>

        {/* 最新更新 */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19), marginTop: tv(24) }]}>
          最新更新
        </Text>
        <TVButton
          id="collect-latest"
          label={busy ? '进行中…' : '更新各源最新内容'}
          disabled={busy}
          onPress={runLatest}
          testID="tv-collect-latest"
        />

        {/* 按源全量采集 */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19), marginTop: tv(24) }]}>
          按视频源全量采集
        </Text>
        {sources.length === 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: scale(16) }]}>
            还没有视频源，请先到「视频源管理」添加
          </Text>
        ) : (
          <View style={styles.sourceGrid}>
            {sources.map((s: VideoSource) => (
              <TVFocusable
                key={s.id}
                id={`src-collect:${s.id}`}
                disabled={busy || !s.isEnabled}
                onPress={() => runSourceAll(s)}
                style={[styles.sourceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                testID={`tv-collect-source-${s.code}`}
              >
                <Text
                  style={{
                    color: s.isEnabled ? colors.foreground : colors.disabledForeground,
                    fontSize: scale(17),
                    fontWeight: '600',
                  }}
                >
                  {s.name}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: scale(13), marginTop: 3 }}>
                  {s.isEnabled ? `已收录 ${s.mediaCount ?? 0} 部` : '已停用'}
                </Text>
              </TVFocusable>
            ))}
          </View>
        )}

        {/* 运行中任务与结果提示 */}
        {message ? (
          <Text style={[styles.message, { color: colors.foreground, fontSize: scale(17) }]}>{message}</Text>
        ) : null}
        {runningTasks.length > 0 ? (
          <Text style={[styles.hint, { color: colors.warning, fontSize: scale(16) }]}>
            有 {runningTasks.length} 个采集任务进行中，可在任务列表查看进度
          </Text>
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
  topTitle: { flex: 1, marginLeft: tv(18), fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(22), paddingBottom: tv(44) },
  sectionTitle: { fontWeight: '700', marginBottom: tv(12) },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputWrap: { flex: 1, marginRight: tv(16) },
  inputContainer: { marginBottom: 0 },
  hint: { marginTop: tv(10) },
  sourceGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  sourceCard: {
    width: tv(240),
    padding: tv(16),
    borderRadius: tv(8),
    borderWidth: 1,
    marginRight: tv(14),
    marginBottom: tv(14),
  },
  message: { marginTop: tv(24) },
});

export default CollectScreen;