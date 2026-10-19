import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba, radius } from '@openreel/expo-ui';
import type { VideoSource, CollectTask } from '@openreel/core';

import { useAppStore, getProvider } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TV_LAYOUT, tv } from '../theme/tokens';

type FormMode = null | 'add' | 'edit';

function formatCheckTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '从未';
  try {
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return timestamp;
  }
}

/**
 * TV 视频源管理。
 *
 * 与手机端差异：
 *  - 手机端「手动添加 / 编辑」用 Modal + 软键盘；TV 改为**页内展开表单** + 应用内键盘，
 *    避免模态层与焦点桥互相干扰（键盘自身才是模态层）。
 *  - 删除类操作改两次确认（3 秒窗口），无触摸确认按钮。
 *  - 顶部操作行入口（手动添加 / AI 导入）均为可聚焦行。
 */
export function SourceManagerScreen() {
  const colors = useThemeColors();
  // 卡片/面板底遵循「卡片透明度」，与移动端同名页面一致
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const scale = useScaledFontSize();
  const nav = useNavigation<any>();

  const videoSources = useAppStore((s) => s.videoSources);
  const loadVideoSources = useAppStore((s) => s.loadVideoSources);
  const toggleSourceEnabled = useAppStore((s) => s.toggleSourceEnabled);
  const removeVideoSource = useAppStore((s) => s.removeVideoSource);
  const addVideoSource = useAppStore((s) => s.addVideoSource);
  const checkVideoSource = useAppStore((s) => s.checkVideoSource);
  const collectSourceLatest = useAppStore((s) => s.collectSourceLatest);
  const collectSourceAll = useAppStore((s) => s.collectSourceAll);
  const collectTasks = useAppStore((s) => s.collectTasks);
  const loadRunningCollectTasks = useAppStore((s) => s.loadRunningCollectTasks);

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Record<string, 'increment' | 'full'>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasRunningTaskRef = useRef(false);

  // 顶部操作行「向下」焦点钉死目标：首个源卡片的第一个按钮（增量采集）。
  // 无源时不设，FocusFinder 走几何兜底（自然落到表单或提示）。
  const firstSourceFirstBtnId = videoSources.length > 0 ? `src-inc:${videoSources[0].id}` : undefined;

  useEffect(() => {
    loadVideoSources().catch(() => {});
    loadRunningCollectTasks().catch(() => {});
    const t = setTimeout(() => focusRegistry.requestInitialFocus('src-back'), 120);
    return () => clearTimeout(t);
  }, [loadVideoSources, loadRunningCollectTasks]);

  useEffect(() => {
    hasRunningTaskRef.current = collectTasks.some(
      (t: CollectTask) => t.status === 'PENDING' || t.status === 'RUNNING',
    );
  }, [collectTasks]);

  useEffect(() => {
    const interval = setInterval(async () => {
      await loadRunningCollectTasks().catch(() => {});
      if (hasRunningTaskRef.current) await loadVideoSources().catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [loadRunningCollectTasks, loadVideoSources]);

  // 两次确认的 3 秒窗口（删源 / 删视频共用一个 pending key）
  useEffect(() => {
    if (!pendingDelete) return;
    const t = setTimeout(() => setPendingDelete(null), 3000);
    return () => clearTimeout(t);
  }, [pendingDelete]);

  const isSourceCollecting = (sourceCode: string) =>
    collectTasks.some((t: CollectTask) => t.sourceCode === sourceCode && (t.status === 'PENDING' || t.status === 'RUNNING'));

  const getProgress = (sourceCode: string) => {
    const task = collectTasks.find(
      (t: CollectTask) => t.sourceCode === sourceCode && (t.status === 'PENDING' || t.status === 'RUNNING'),
    );
    if (!task || !task.totalPages) return 0;
    return Math.round((task.currentPage / task.totalPages) * 100);
  };

  const healthLabel = (source: VideoSource): { label: string; color: string } => {
    const failCount = source.failCount || 0;
    const total = source.totalRequests || 0;
    const failRate = total > 0 ? (failCount / total) * 100 : 0;
    if (source.healthStatus === 'DOWN' || source.healthStatus === 'unhealthy') {
      return { label: '不可用，请检查', color: colors.error };
    }
    if (failRate > 20) return { label: '失败率较高', color: colors.error };
    if (source.healthStatus === 'DEGRADED' || source.healthStatus === 'degraded' || failRate > 10) {
      return { label: '不稳定', color: colors.warning };
    }
    return { label: '稳定', color: colors.success };
  };

  const openAdd = useCallback(() => {
    setFormMode('add');
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormBaseUrl('');
    setMessage('');
  }, []);

  const openEdit = useCallback((source: VideoSource) => {
    setFormMode('edit');
    setEditingId(source.id);
    setFormCode(source.code);
    setFormName(source.name);
    setFormBaseUrl(source.baseUrl);
    setMessage('');
  }, []);

  const closeForm = useCallback(() => {
    setFormMode(null);
    setEditingId(null);
  }, []);

  const submitForm = useCallback(async () => {
    const code = formCode.trim();
    const name = formName.trim();
    const baseUrl = formBaseUrl.trim();
    if (!name || !baseUrl) {
      setMessage('名称和 API 地址不能为空');
      return;
    }
    try {
      if (formMode === 'edit' && editingId) {
        const origin = videoSources.find((s) => s.id === editingId);
        if (!origin) {
          setMessage('视频源不存在，请刷新后重试');
          return;
        }
        await addVideoSource({ ...origin, name, baseUrl });
        setMessage(`「${name}」已更新`);
      } else {
        if (!code) {
          setMessage('请填写编码（唯一标识）');
          return;
        }
        await addVideoSource({
          id: `source_${code}`,
          code,
          name,
          baseUrl,
          type: 'CMS',
          isEnabled: true,
          healthStatus: null,
          lastCheckAt: null,
        } as VideoSource);
        setMessage(`「${name}」已添加`);
      }
      closeForm();
    } catch (e) {
      setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [addVideoSource, closeForm, editingId, formBaseUrl, formCode, formMode, formName, videoSources]);

  const doCheck = useCallback(
    async (source: VideoSource) => {
      setChecking(source.code);
      try {
        const r = await checkVideoSource(source.id);
        setMessage(
          r.healthy
            ? `「${source.name}」连接正常，响应时间 ${r.responseTime}ms`
            : `「${source.name}」连接失败`,
        );
      } catch (e) {
        setMessage(`「${source.name}」${e instanceof Error ? e.message : '无法连接'}`);
      } finally {
        setChecking(null);
      }
    },
    [checkVideoSource],
  );

  const doCollect = useCallback(
    async (source: VideoSource, type: 'increment' | 'full') => {
      const label = type === 'increment' ? '增量' : '全量';
      setSubmitting((p) => ({ ...p, [source.code]: type }));
      try {
        const fn = type === 'increment' ? collectSourceLatest : collectSourceAll;
        const r = await fn(source.code);
        setMessage(
          r && !r.success
            ? `${source.name}${label}采集失败：${r.error || '未知错误'}`
            : `${source.name}${label}采集已建任务`,
        );
      } catch (e) {
        setMessage(`${source.name}${label}采集失败：${e instanceof Error ? e.message : '未知错误'}`);
      } finally {
        setSubmitting((p) => {
          const next = { ...p };
          delete next[source.code];
          return next;
        });
        await loadVideoSources().catch(() => {});
      }
    },
    [collectSourceAll, collectSourceLatest, loadVideoSources],
  );

  const doRemoveSource = useCallback(
    async (source: VideoSource) => {
      try {
        await removeVideoSource(source.id);
        setMessage(`已删除视频源「${source.name}」（已采集数据保留）`);
      } catch (e) {
        setMessage(`删除失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await loadVideoSources().catch(() => {});
      }
    },
    [loadVideoSources, removeVideoSource],
  );

  const doRemovePlaySources = useCallback(
    async (source: VideoSource) => {
      try {
        await getProvider().deletePlaySourcesBySourceId(source.id);
        setMessage(`「${source.name}」的播放源已删除`);
      } catch (e) {
        setMessage(`删除失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await loadVideoSources().catch(() => {});
      }
    },
    [loadVideoSources],
  );

  const pressDeleteSource = useCallback(
    (source: VideoSource) => {
      if (pendingDelete !== `src:${source.id}`) {
        setPendingDelete(`src:${source.id}`);
        setMessage(`再按一次「确认删源」以删除「${source.name}」（3 秒内有效，采集数据保留）`);
        return;
      }
      setPendingDelete(null);
      void doRemoveSource(source);
    },
    [doRemoveSource, pendingDelete],
  );

  const pressDeletePlaySources = useCallback(
    (source: VideoSource) => {
      if (pendingDelete !== `data:${source.id}`) {
        setPendingDelete(`data:${source.id}`);
        setMessage(
          `再按一次「确认删视频」以删除「${source.name}」的所有播放源（无其它播放源的视频会一并删除）`,
        );
        return;
      }
      setPendingDelete(null);
      void doRemovePlaySources(source);
    },
    [doRemovePlaySources, pendingDelete],
  );

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="视频源管理" backId="src-back" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 顶部操作行：外观照搬移动端 actionCard（卡片底 + 圆角 + 内边距 + 按钮等宽等距），
            但按钮文案与入口保持 TV 现有三个（手动添加 / AI 导入 / 任务列表） */}
        <View style={[styles.actionCard, { backgroundColor: hexToRgba(colors.card, cardOpacity / 100) }]}>
          <View style={styles.actionRow}>
            <TVButton
              id="src-tasks"
              label="任务列表"
              variant="primary"
              labelFontSize={scale(14)}
              style={styles.actionBtn}
              onPress={() => nav.navigate('TaskList')}
              testID="tv-src-tasks"
              nextFocusDownId={firstSourceFirstBtnId}
            />
            <TVButton
              id="src-ai"
              label="AI 导入"
              variant="primary"
              labelFontSize={scale(14)}
              style={styles.actionBtn}
              onPress={() => nav.navigate('AiSourceImport')}
              testID="tv-src-ai"
              nextFocusDownId={firstSourceFirstBtnId}
            />
            <TVButton
              id="src-add"
              label="手动添加"
              variant="primary"
              labelFontSize={scale(14)}
              style={styles.actionBtn}
              onPress={openAdd}
              testID="tv-src-add"
              nextFocusDownId={firstSourceFirstBtnId}
            />
          </View>
        </View>

        {formMode ? (
          <View style={[styles.formCard, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100), borderColor: colors.borderHighlight }]}>
            <Text style={[styles.formTitle, { color: colors.foreground, fontSize: scale(19) }]}>
              {formMode === 'add' ? '添加视频源' : '编辑视频源'}
            </Text>
            <TVTextInput
              id="src-form-code"
              label="编码"
              value={formCode}
              mode="alnum"
              placeholder="唯一标识，如 mysite"
              hint={formMode === 'edit' ? '编码为唯一标识，创建后不可修改' : '建议用英文小写，作为源的唯一标识'}
              onChangeText={setFormCode}
              testID="tv-src-form-code"
            />
            <TVTextInput
              id="src-form-name"
              label="名称"
              value={formName}
              mode="alnum"
              placeholder="显示名称"
              onChangeText={setFormName}
              testID="tv-src-form-name"
            />
            <TVTextInput
              id="src-form-url"
              label="API 地址"
              value={formBaseUrl}
              mode="url"
              placeholder="http://你的域名/api.php/provide/vod/at/xml/"
              hint="输入框按 OK 打开电视键盘；含 : / . 符号，用键盘上的符号键或「粘贴」"
              onChangeText={setFormBaseUrl}
              testID="tv-src-form-url"
            />
            <View style={styles.formActionRow}>
              <TVButton id="src-form-cancel" label="取消" onPress={closeForm} testID="tv-src-form-cancel" />
              <TVButton
                id="src-form-submit"
                label="保存"
                variant="primary"
                onPress={submitForm}
                testID="tv-src-form-submit"
              />
            </View>
          </View>
        ) : null}

        {videoSources.length === 0 && formMode === null ? (
          <Text style={{ color: colors.mutedForeground, fontSize: scale(18), marginTop: tv(30) }}>
            还没有视频源。点「手动添加」或「AI 导入」添加片源后才能采集。
          </Text>
        ) : null}

        {/* 源卡片列表：结构与尺寸照搬移动端 sourceCard / list（gap 12） */}
        <View style={styles.list}>
          {videoSources.map((source: VideoSource, sourceIndex: number) => {
            const health = healthLabel(source);
            const collecting = isSourceCollecting(source.code);
            const progress = getProgress(source.code);
            const checkingNow = checking === source.code;
            const busy = !!submitting[source.code];
            const busyType = submitting[source.code];
            // 「进入卡片落第一个按钮（增量采集）」的钉死目标：
            // 上/下一卡片存在时，本卡所有按钮把 上/下 方向钉到邻卡 src-inc。
            const prevSource = sourceIndex > 0 ? videoSources[sourceIndex - 1] : null;
            const nextSource = sourceIndex < videoSources.length - 1 ? videoSources[sourceIndex + 1] : null;
            const focusUpId = prevSource ? `src-inc:${prevSource.id}` : undefined;
            const focusDownId = nextSource ? `src-inc:${nextSource.id}` : undefined;

            return (
              <View
                key={source.id}
                style={[styles.sourceCard, { backgroundColor: hexToRgba(colors.card, cardOpacity / 100) }]}
              >
                <View style={styles.sourceHeader}>
                  <Text
                    style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600', flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {source.name}
                  </Text>
                  <Text
                    style={[styles.healthBadge, { color: health.color, borderColor: health.color, fontSize: scale(10) }]}
                    numberOfLines={1}
                  >
                    {health.label}
                  </Text>
                </View>

                <View style={styles.sourceActions}>
                  <TVButton
                    id={`src-inc:${source.id}`}
                    label={busyType === 'increment' ? '建任务中…' : '增量采集'}
                    sublabel={
                      source.lastIncrementalCollectedAt ? formatCheckTime(source.lastIncrementalCollectedAt) : '从未'
                    }
                    variant="secondary"
                    labelFontSize={scale(12)}
                    sublabelFontSize={scale(11)}
                    sublabelColor={colors.disabledForeground}
                    disabled={collecting || busy}
                    style={styles.sourceActionBtn}
                    onPress={() => doCollect(source, 'increment')}
                    testID={`tv-src-inc-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                  <TVButton
                    id={`src-full:${source.id}`}
                    label={busyType === 'full' ? '建任务中…' : '全量采集'}
                    sublabel={source.lastCollectedAt ? formatCheckTime(source.lastCollectedAt) : '从未'}
                    variant="secondary"
                    labelFontSize={scale(12)}
                    sublabelFontSize={scale(11)}
                    sublabelColor={colors.disabledForeground}
                    disabled={collecting || busy}
                    style={styles.sourceActionBtn}
                    onPress={() => doCollect(source, 'full')}
                    testID={`tv-src-full-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                  <TVButton
                    id={`src-check:${source.id}`}
                    label={checkingNow ? '检测中…' : '检测'}
                    sublabel={source.lastCheckAt ? formatCheckTime(source.lastCheckAt) : '从未'}
                    variant="secondary"
                    labelFontSize={scale(12)}
                    sublabelFontSize={scale(11)}
                    sublabelColor={colors.disabledForeground}
                    disabled={checkingNow}
                    style={styles.sourceActionBtn}
                    onPress={() => doCheck(source)}
                    testID={`tv-src-check-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                  <TVButton
                    id={`src-edit:${source.id}`}
                    label="编辑"
                    variant="secondary"
                    labelFontSize={scale(12)}
                    style={styles.sourceActionBtn}
                    onPress={() => openEdit(source)}
                    testID={`tv-src-edit-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                  <TVButton
                    id={`src-toggle:${source.id}`}
                    label={source.isEnabled ? '禁用' : '启用'}
                    variant="secondary"
                    labelFontSize={scale(12)}
                    style={styles.sourceActionBtn}
                    onPress={() => toggleSourceEnabled(source.id, !source.isEnabled)}
                    testID={`tv-src-toggle-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                  <TVButton
                    id={`src-delp:${source.id}`}
                    label={pendingDelete === `data:${source.id}` ? '确认删视频？' : '删视频'}
                    variant="secondary"
                    labelColor={colors.warning}
                    labelFontSize={scale(12)}
                    style={styles.sourceActionBtn}
                    onPress={() => pressDeletePlaySources(source)}
                    testID={`tv-src-delp-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                  <TVButton
                    id={`src-del:${source.id}`}
                    label={pendingDelete === `src:${source.id}` ? '确认删源？' : '删源'}
                    variant="secondary"
                    labelColor={colors.error}
                    labelFontSize={scale(12)}
                    style={styles.sourceActionBtn}
                    onPress={() => pressDeleteSource(source)}
                    testID={`tv-src-del-${source.id}`}
                    nextFocusUpId={focusUpId}
                    nextFocusDownId={focusDownId}
                  />
                </View>

                {collecting || busy ? (
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { backgroundColor: colors.trackBg }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${busy ? 0 : Math.min(100, progress)}%`, backgroundColor: colors.mutedForeground },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: colors.mutedForeground, fontSize: scale(11) }]}>
                      {busy ? '正在建立任务…' : `采集中… ${progress}%`}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {message ? (
          <TVFocusable id="src-msg" onPress={() => setMessage(null)} style={styles.msgBox} testID="tv-src-msg">
            <Text style={{ color: colors.foreground, fontSize: scale(16) }}>{message}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: scale(13), marginTop: tv(4) }}>
              （按 OK 关闭提示）
            </Text>
          </TVFocusable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },

  /* 顶部操作行（外观照搬移动端 actionCard / actionRow / actionBtn 的数值） */
  actionCard: { borderRadius: radius.lg, padding: 12, marginTop: 12, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, marginRight: 0 },

  /* 页内表单卡片（保持 TV 原有外观，不在本次照搬范围） */
  formCard: { padding: tv(18), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(14) },
  formTitle: { fontWeight: '700', marginBottom: tv(12) },
  formActionRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: tv(10) },

  /* 源卡片：数值照搬移动端 sourceCard / list */
  list: { gap: 12 },
  sourceCard: { borderRadius: radius.lg, padding: 12 },
  sourceHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  healthBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: 8,
  },
  sourceActions: { flexDirection: 'row', gap: 6 },
  sourceActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    minHeight: 40,
    marginRight: 0,
  },
  progressContainer: { marginTop: 10 },
  progressBar: { height: 4, borderRadius: radius.progress, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.progress },
  progressText: { marginTop: 4, textAlign: 'center' },

  msgBox: { marginTop: tv(10), padding: tv(14), borderRadius: tv(8) },
});

export default SourceManagerScreen;