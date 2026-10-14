import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';
import type { CollectTask, FailedItem } from '@openreel/core';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { TV_LAYOUT, tv } from '../theme/tokens';

function typeLabel(type: string): string {
  switch (type) {
    case 'INCREMENTAL':
      return '增量采集';
    case 'FULL':
      return '全量采集';
    case 'KEYWORD':
      return '关键词采集';
    case 'REPROBE':
      return '长短剧探测';
    default:
      return type;
  }
}

function parseFailedItems(task: CollectTask): FailedItem[] {
  if (!task.failedItems) return [];
  try {
    const parsed = JSON.parse(task.failedItems);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * TV 任务列表。
 *
 * 与手机端差异：
 *  - 手机端用 Alert 做删除确认；TV 端无触摸确认按钮，改「两次确认」（再按一次，3 秒内有效）。
 *  - 手机端滚动触底分页；TV 端无触摸滚动，改为「加载更多」按钮 + 自动追加到可见上限。
 *  - 失败明细展开改为焦点行（手机端点文字展开）。
 */
export function TaskListScreen() {
  const colors = useThemeColors();
  // 卡片/面板底遵循「卡片透明度」，与移动端同名页面一致
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const scale = useScaledFontSize();

  const collectTasks = useAppStore((s) => s.collectTasks);
  const loadCollectTasks = useAppStore((s) => s.loadCollectTasks);
  const deleteCollectTask = useAppStore((s) => s.deleteCollectTask);
  const deleteOldTasks = useAppStore((s) => s.deleteOldTasks);
  const resumeCollectTask = useAppStore((s) => s.resumeCollectTask);
  const retryFailedItems = useAppStore((s) => s.retryFailedItems);

  const PAGE_STEP = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const isFocused = useIsFocused();

  useEffect(() => {
    loadCollectTasks().catch(() => {});
    const t = setTimeout(() => focusRegistry.requestInitialFocus('task-back'), 120);
    return () => clearTimeout(t);
  }, [loadCollectTasks]);

  useEffect(() => {
    if (!isFocused) return;
    loadCollectTasks().catch(() => {});
  }, [isFocused, loadCollectTasks]);

  // 有进行中的任务时轮询刷新进度（与手机端一致）
  useEffect(() => {
    if (!isFocused) return;
    const hasActive = collectTasks.some((t) => t.status === 'RUNNING' || t.status === 'PENDING');
    if (!hasActive && !busyId) return;
    const id = setInterval(() => {
      loadCollectTasks().catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [isFocused, collectTasks, busyId, loadCollectTasks]);

  // 两次确认的 3 秒窗口
  useEffect(() => {
    if (!pendingDelete) return;
    const t = setTimeout(() => setPendingDelete(null), 3000);
    return () => clearTimeout(t);
  }, [pendingDelete]);

  const refresh = useCallback(() => {
    loadCollectTasks().catch(() => {});
  }, [loadCollectTasks]);

  const doDelete = useCallback(
    async (task: CollectTask) => {
      setBusyId(task.taskId);
      try {
        await deleteCollectTask(task.taskId);
        setMessage(`已删除任务（${task.sourceName || task.sourceCode}）`);
        refresh();
      } catch (e) {
        setMessage(`删除失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusyId(null);
      }
    },
    [deleteCollectTask, refresh],
  );

  const pressDelete = useCallback(
    (task: CollectTask) => {
      if (pendingDelete !== task.taskId) {
        setPendingDelete(task.taskId);
        setMessage('再按一次「确认删除」以删除该任务（3 秒内有效）');
        return;
      }
      setPendingDelete(null);
      void doDelete(task);
    },
    [doDelete, pendingDelete],
  );

  const pressResume = useCallback(
    async (task: CollectTask) => {
      setBusyId(task.taskId);
      setMessage(`正在继续「${task.sourceName || task.sourceCode}」的采集…`);
      try {
        const r = await resumeCollectTask(task.taskId);
        setMessage(r.success ? `续采完成，新增 ${r.collected} 条` : `续采失败：${r.error || '未知错误'}`);
      } catch (e) {
        setMessage(`续采失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh, resumeCollectTask],
  );

  const pressRetry = useCallback(
    async (task: CollectTask) => {
      setBusyId(task.taskId);
      setMessage(`正在重试「${task.sourceName || task.sourceCode}」的失败条目…`);
      try {
        const r = await retryFailedItems(task.taskId);
        setMessage(
          r.success ? `重试完成：成功 ${r.successCount} 条，仍失败 ${r.failed} 条` : `重试失败：${r.error || '未知错误'}`,
        );
      } catch (e) {
        setMessage(`重试失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh, retryFailedItems],
  );

  const clearAll = useCallback(async () => {
    setClearingAll(true);
    try {
      await deleteOldTasks(999999);
      setMessage('已清理全部任务记录');
      setVisibleCount(PAGE_STEP);
      refresh();
    } catch (e) {
      setMessage(`清理失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setClearingAll(false);
    }
  }, [deleteOldTasks, refresh]);

  const visible = collectTasks.slice(0, visibleCount);

  const statusStyle = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'PENDING':
        return { label: '等待中', color: colors.mutedForeground };
      case 'RUNNING':
        return { label: '运行中', color: colors.foreground };
      case 'COMPLETED':
        return { label: '已完成', color: colors.success };
      case 'FAILED':
        return { label: '失败', color: colors.error };
      default:
        return { label: status, color: colors.mutedForeground };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader
        title="任务列表"
        backId="task-back"
        right={
          <>
            <TVButton id="task-refresh" label="刷新" onPress={refresh} testID="tv-task-refresh" />
            <TVButton
              id="task-clear-all"
              label="清空全部"
              variant="danger"
              disabled={clearingAll || collectTasks.length === 0}
              onPress={clearAll}
              testID="tv-task-clear-all"
            />
          </>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {collectTasks.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: scale(18), marginTop: tv(40) }}>
            暂无采集任务
          </Text>
        ) : null}

        {visible.map((task) => {
          const st = statusStyle(task.status);
          const failedItems = parseFailedItems(task);
          const isReprobe = task.type === 'REPROBE';
          const progress = task.totalPages > 0 ? Math.round((task.currentPage / task.totalPages) * 100) : 0;
          const busy = busyId === task.taskId;
          const canRetry = failedItems.length > 0 && (task.status === 'COMPLETED' || task.status === 'FAILED');
          const canResume = task.status === 'FAILED' && (task.type === 'INCREMENTAL' || task.type === 'FULL');

          return (
            <View
              key={task.taskId || String(task.id)}
              style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100) }]}
            >
              {/* 头部行：源名 + 类型 + 日期（右对齐）——排列对齐移动端 taskHeader */}
              <View style={styles.headerRow}>
                <Text style={[styles.source, { color: colors.foreground, fontSize: scale(19) }]} numberOfLines={1}>
                  {task.sourceName || task.sourceCode}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scale(15) }}>{typeLabel(task.type)}</Text>
                <Text style={[styles.date, { color: colors.mutedForeground, fontSize: scale(14) }]}>
                  {new Date(task.createdAt).toLocaleString()}
                </Text>
              </View>

              {((task.status === 'RUNNING' || task.status === 'PENDING') || isReprobe) && (
                <View style={styles.progressWrap}>
                  <View style={[styles.progressBar, { backgroundColor: colors.trackBg }]}>
                    <View
                      style={[styles.progressFill, { width: `${Math.min(100, progress)}%`, backgroundColor: st.color }]}
                    />
                  </View>
                  {/* 进度文字右对齐、去百分比——排列与文案对齐移动端 progressText */}
                  <Text style={[styles.progressText, { color: colors.mutedForeground, fontSize: scale(14) }]}>
                    {task.currentPage}/{task.totalPages} {isReprobe ? '部' : '页'}
                  </Text>
                </View>
              )}

              {/* 统计 + 状态徽章 + 操作按钮 同一行、按钮靠右——排列对齐移动端 taskMeta/taskRight */}
              <View style={styles.metaRow}>
                {isReprobe ? (
                  <>
                    <Text style={{ color: colors.success, fontSize: scale(15) }}>短剧: {task.shortDramaCount || 0}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: scale(15) }}>长剧: {task.longDramaCount || 0}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: scale(15) }}>成功: {task.collectedCount}</Text>
                    <Text style={{ color: task.failedCount > 0 ? colors.error : colors.textSecondary, fontSize: scale(15) }}>
                      失败: {task.failedCount}
                    </Text>
                  </>
                ) : null}
                <View style={styles.rightGroup}>
                  <Text style={[styles.badge, { borderColor: st.color }]}>
                    <Text style={{ color: st.color, fontSize: scale(14), fontWeight: '600' }}>{st.label}</Text>
                  </Text>
                  {canRetry ? (
                    <TVButton
                      id={`task-retry:${task.taskId}`}
                      label={busy ? '重试中…' : `重试失败项(${failedItems.length})`}
                      disabled={busy}
                      onPress={() => pressRetry(task)}
                      testID={`tv-task-retry-${task.taskId}`}
                    />
                  ) : null}
                  {canResume ? (
                    <TVButton
                      id={`task-resume:${task.taskId}`}
                      label={busy ? '续采中…' : '继续'}
                      disabled={busy}
                      onPress={() => pressResume(task)}
                      testID={`tv-task-resume-${task.taskId}`}
                    />
                  ) : null}
                  <TVButton
                    id={`task-delete:${task.taskId}`}
                    label={pendingDelete === task.taskId ? '确认删除？' : '删除'}
                    variant="danger"
                    disabled={busy}
                    onPress={() => pressDelete(task)}
                    testID={`tv-task-delete-${task.taskId}`}
                  />
                </View>
              </View>

              {/* 失败明细区：仅 INCREMENTAL/FULL；统计「有失败才显示」规则照搬移动端 failedRow */}
              {task.type === 'INCREMENTAL' || task.type === 'FULL' ? (
                <View style={[styles.failedRow, { borderTopColor: colors.border }]}>
                  {failedItems.length > 0 ? (
                    <>
                      <View style={styles.metaRow}>
                        <Text style={{ color: colors.textSecondary, fontSize: scale(15) }}>
                          成功: {task.collectedCount}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: scale(15) }}>
                          失败: {task.failedCount}
                        </Text>
                        <TVFocusable
                          id={`task-failed-toggle:${task.taskId}`}
                          onPress={() => setExpanded(expanded === task.taskId ? null : task.taskId)}
                          style={styles.failedToggle}
                          testID={`tv-task-failed-toggle-${task.taskId}`}
                        >
                          <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>
                            {expanded === task.taskId ? '▾ 收起失败明细' : `▸ 查看失败明细（${failedItems.length} 条）`}
                          </Text>
                        </TVFocusable>
                      </View>
                      {expanded === task.taskId ? (
                        <View style={styles.failedList}>
                          {failedItems.map((fi, idx) => (
                            <View key={`${fi.vodId}-${idx}`} style={styles.failedItem}>
                              <Text style={{ color: colors.foreground, fontSize: scale(15) }}>
                                {idx + 1}. {fi.title}
                              </Text>
                              <Text style={{ color: colors.error, fontSize: scale(14) }}>{fi.error}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : task.failedItems ? (
                    <Text style={{ color: colors.success, fontSize: scale(15) }}>本次无失败条目</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {visibleCount < collectTasks.length ? (
          <TVButton
            id="task-load-more"
            label={`加载更多（还有 ${collectTasks.length - visibleCount} 条）`}
            onPress={() => setVisibleCount((c) => Math.min(c + PAGE_STEP, collectTasks.length))}
            testID="tv-task-load-more"
          />
        ) : collectTasks.length > 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: scale(15), textAlign: 'center', marginTop: tv(10) }}>
            已显示全部 {collectTasks.length} 条任务
          </Text>
        ) : null}

        {message ? (
          <Text style={{ color: colors.foreground, fontSize: scale(16), marginTop: tv(18) }}>{message}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  card: { padding: tv(18), borderRadius: tv(10), marginBottom: tv(14) },
  // 头部行：源名 + 类型 + 日期（日期靠右）——对齐移动端 taskHeader
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: tv(10), marginBottom: tv(8) },
  source: { fontWeight: '700', flexShrink: 1 },
  date: { marginLeft: 'auto' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: tv(8) },
  // 状态徽章 + 操作按钮靠右成组——对齐移动端 taskRight
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: tv(8), marginLeft: 'auto' },
  badge: { borderWidth: 1, borderRadius: tv(6), paddingHorizontal: tv(8), paddingVertical: tv(2) },
  progressWrap: { marginTop: tv(10) },
  progressBar: { height: tv(6), borderRadius: tv(3), overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressText: { marginTop: tv(4), textAlign: 'right' },
  // 失败明细区（对齐移动端 failedRow）：顶部分隔线 + 统计/开关同行
  failedRow: { marginTop: tv(10), borderTopWidth: 1, paddingTop: tv(8) },
  failedToggle: { paddingVertical: tv(8), marginLeft: 'auto' },
  failedList: { marginTop: tv(6), maxHeight: tv(220) },
  failedItem: { paddingVertical: tv(4) },
});

export default TaskListScreen;