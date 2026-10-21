import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { useAppStore } from '../useAppStore';
import { useThemeColors } from '../themes/useThemeColors';
import { useThemeStore } from '../themes/store';
import { useScaledFontSize } from '../themes/useScaledFontSize';
import { hexToRgba } from '../themes/colorUtils';
import { radius } from '../themes/radiusTokens';
import BlurredBackground from '../components/BlurredBackground';
import Spinner from '../components/Spinner';
import { Button } from '../components/ui/Button';
import type { CollectTask, FailedItem } from '@openreel/core';

interface Props {
  navigation: any;
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'INCREMENTAL': return '增量采集';
    case 'FULL': return '全量采集';
    case 'KEYWORD': return '关键词采集';
    case 'REPROBE': return '长短剧探测';
    default: return type;
  }
}

export default function TaskListScreen({ navigation }: Props) {
  const { collectTasks, loadCollectTasks, deleteCollectTask, deleteOldTasks, resumeCollectTask, retryFailedItems } = useAppStore();
  const colors = useThemeColors();
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const cardBg = hexToRgba(colors.card, cardOpacity / 100);
  const surfaceBg = hexToRgba(colors.surface, cardOpacity / 100);
  const s = useScaledFontSize();
  const [deletingAll, setDeletingAll] = useState(false);
  // 按任务独立记录忙碌状态（集合），避免多个任务并行操作时互相覆盖「续采中/重试中/删除中」
  const [resumingIds, setResumingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // 像视频列表页一样分页：先渲染 PAGE_STEP 条，滚动触底「上拉显示更多」追加
  const PAGE_STEP = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    setVisibleCount((c) => {
      const total = collectTasks.length;
      if (c >= total) return c;
      loadingMoreRef.current = true;
      setTimeout(() => { loadingMoreRef.current = false; }, 400);
      return Math.min(c + PAGE_STEP, total);
    });
  }, [collectTasks.length]);
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 80) {
      loadMore();
    }
  }, [loadMore]);

  function parseFailedItems(task: CollectTask): FailedItem[] {
    if (!task.failedItems) return [];
    try {
      const parsed = JSON.parse(task.failedItems);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'PENDING':
        return { label: '等待中', color: colors.mutedForeground };
      case 'RUNNING':
        return { label: '运行中', color: colors.text };
      case 'COMPLETED':
        return { label: '已完成', color: colors.success };
      case 'FAILED':
        return { label: '失败', color: colors.error };
      default:
        return { label: status, color: colors.mutedForeground };
    }
  }

  function getErrorTypeLabel(errorType: string | null): { label: string; color: string } {
    switch (errorType) {
      case 'NETWORK': return { label: '网络错误', color: '#f97316' };
      case 'TIMEOUT': return { label: '请求超时', color: colors.warning };
      case 'RATE_LIMIT': return { label: '限流', color: colors.error };
      case 'PARSE': return { label: '解析错误', color: '#a855f7' };
      case 'DB': return { label: '数据库错误', color: '#ec4899' };
      case 'CANCELLED': return { label: '已取消', color: colors.mutedForeground };
      default: return { label: '', color: colors.mutedForeground };
    }
  }

  useEffect(() => {
    // 不阻塞渲染：先展示现有 collectTasks（源管理页同款行为），查询到数据后静默刷新
    loadCollectTasks().catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCollectTasks().catch(() => {});
    }, [loadCollectTasks])
  );

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const hasActive = collectTasks.some((t) => t.status === 'RUNNING' || t.status === 'PENDING');
    if (!hasActive && resumingIds.size === 0 && retryingIds.size === 0) return;
    const id = setInterval(() => {
      loadCollectTasks();
    }, 2000);
    return () => clearInterval(id);
  }, [isFocused, collectTasks, resumingIds, retryingIds, loadCollectTasks]);

  // 续采任务已在库中真实开跑（状态离开 FAILED）时，提前解除该任务的「续采中」按钮态
  useEffect(() => {
    if (resumingIds.size === 0) return;
    const done = [...resumingIds].filter((id) => {
      const task = collectTasks.find((t) => t.taskId === id);
      return task && task.status !== 'FAILED';
    });
    if (done.length === 0) return;
    setResumingIds((prev) => {
      const next = new Set(prev);
      done.forEach((id) => next.delete(id));
      return next;
    });
  }, [collectTasks, resumingIds]);

  // 重试任务已在库中结束（COMPLETED/FAILED）时，提前解除该任务的「重试中」按钮态
  useEffect(() => {
    if (retryingIds.size === 0) return;
    const done = [...retryingIds].filter((id) => {
      const task = collectTasks.find((t) => t.taskId === id);
      return task && (task.status === 'COMPLETED' || task.status === 'FAILED');
    });
    if (done.length === 0) return;
    setRetryingIds((prev) => {
      const next = new Set(prev);
      done.forEach((id) => next.delete(id));
      return next;
    });
  }, [collectTasks, retryingIds]);

  // 删除期间 SQLite 写队列会排队（实测 125ms~2710ms），需禁用按钮并给出反馈，
  // 否则用户会以为点击无效而重复点击
  const doDelete = async (task: CollectTask) => {
    setDeletingIds((prev) => new Set(prev).add(task.taskId));
    try {
      await deleteCollectTask(task.taskId);
    } finally {
      setDeletingIds((prev) => {
        if (!prev.has(task.taskId)) return prev;
        const next = new Set(prev);
        next.delete(task.taskId);
        return next;
      });
    }
  };

  const handleDelete = (task: CollectTask) => {
    if (task.status === 'RUNNING' || task.status === 'PENDING') {
      Alert.alert('删除任务', `确定要删除此${task.status === 'RUNNING' ? '运行中' : '等待中'}的任务吗？`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => doDelete(task) },
      ]);
    } else {
      doDelete(task);
    }
  };

  const handleResume = (task: CollectTask) => {
    setResumingIds((prev) => new Set(prev).add(task.taskId));
    resumeCollectTask(task.taskId)
      .then((result) => {
        if (!result.success) {
          Alert.alert('续采失败', result.error || '未知错误');
        }
        setResumingIds((cur) => {
          if (!cur.has(task.taskId)) return cur;
          const next = new Set(cur);
          next.delete(task.taskId);
          return next;
        });
      })
      .catch((err: any) => {
        Alert.alert('续采失败', err.message || '未知错误');
        setResumingIds((cur) => {
          if (!cur.has(task.taskId)) return cur;
          const next = new Set(cur);
          next.delete(task.taskId);
          return next;
        });
      });
    loadCollectTasks().catch(() => {});
  };

  const handleRetryFailed = (task: CollectTask) => {
    const items = parseFailedItems(task);
    if (items.length === 0) {
      Alert.alert('重试失败项', '没有需要重试的失败条目');
      return;
    }
    setRetryingIds((prev) => new Set(prev).add(task.taskId));
    retryFailedItems(task.taskId)
      .then((result) => {
        if (!result.success) {
          Alert.alert('重试失败项失败', result.error || '未知错误');
        } else {
          Alert.alert('重试完成', `成功${result.successCount}条，仍失败${result.failed}条`);
        }
        setRetryingIds((cur) => {
          if (!cur.has(task.taskId)) return cur;
          const next = new Set(cur);
          next.delete(task.taskId);
          return next;
        });
      })
      .catch((err: any) => {
        Alert.alert('重试失败项失败', err.message || '未知错误');
        setRetryingIds((cur) => {
          if (!cur.has(task.taskId)) return cur;
          const next = new Set(cur);
          next.delete(task.taskId);
          return next;
        });
      });
    loadCollectTasks().catch(() => {});
  };

  const handleClearAll = () => {
    Alert.alert('清理所有任务', '确定要删除所有任务记录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: async () => {
        setDeletingAll(true);
        try {
          await deleteOldTasks(999999);
          await loadCollectTasks();
          Alert.alert('完成', '删除完成');
        } finally {
          setDeletingAll(false);
        }
      }},
    ]);
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: 50, paddingHorizontal: 15, paddingBottom: 15 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    title: { flex: 1, fontSize: s(18), fontWeight: 'bold', color: colors.text, textAlign: 'center' },
    headerActions: { flexDirection: 'row', gap: 8 },
    empty: { color: colors.mutedForeground, textAlign: 'center', marginTop: 60, fontSize: s(16) },
    taskList: { paddingHorizontal: 15, gap: 10, paddingBottom: 30 },
    taskCard: { backgroundColor: cardBg, borderRadius: radius.lg, padding: 15 },
    taskHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    taskSource: { fontSize: s(16), fontWeight: '600', color: colors.text },
    taskType: { fontSize: s(12), color: colors.mutedForeground },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
    statusText: { fontSize: s(12), fontWeight: '500' },
    taskProgress: { marginBottom: 10 },
    progressBar: { height: 4, backgroundColor: colors.trackBg, borderRadius: radius.progress, overflow: 'hidden', marginBottom: 4 },
    progressFill: { height: '100%', backgroundColor: colors.mutedForeground, borderRadius: radius.progress },
    progressText: { fontSize: s(11), color: colors.disabledForeground, textAlign: 'right' },
    taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    taskStat: { fontSize: s(12), color: colors.mutedForeground },
    taskDate: { fontSize: s(11), color: colors.disabledForeground, marginLeft: 'auto' },
    taskRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
    failedRow: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
    failedToggle: { flexDirection: 'row', alignItems: 'center', fontSize: s(12), color: colors.mutedForeground, paddingVertical: 4 },
    failedList: { marginTop: 6, maxHeight: 160 },
    failedItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3, gap: 6 },
    failedTitle: { fontSize: s(12), color: colors.text, fontWeight: '500', flexShrink: 1 },
    failedError: { fontSize: s(11), color: colors.mutedForeground, flexShrink: 1 },
    failedEmpty: { fontSize: s(12), color: colors.success, paddingVertical: 2 },
    footer: { paddingVertical: 18, alignItems: 'center' },
    footerText: { fontSize: s(12), color: colors.mutedForeground },
  }), [colors, cardBg, surfaceBg, s]);

  return (
    <BlurredBackground imageUrl={null}>
    <ScrollView style={styles.container} onScroll={handleScroll} scrollEventThrottle={200}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Button variant="icon" size="sm" onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text} />
          </Button>
          <Text style={styles.title}>任务列表</Text>
          <View style={styles.headerActions}>
            <Button variant="secondary" size="sm" onPress={handleClearAll} disabled={deletingAll}>
              {deletingAll ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Trash2 size={16} color={colors.text} />
              )}
            </Button>
          </View>
        </View>
      </View>

      {collectTasks.length === 0 ? (
        <Text style={styles.empty}>暂无采集任务</Text>
      ) : (
        <View style={styles.taskList}>
          {collectTasks.slice(0, visibleCount).map((task: CollectTask) => {
            const statusStyle = getStatusStyle(task.status);
            const isReprobe = task.type === 'REPROBE';
            // REPROBE 的 current_page/total_pages 承载的是「已探测/待探测部数」，单位为部
            const progress = task.totalPages > 0 ? Math.round((task.currentPage / task.totalPages) * 100) : 0;
            return (
              <View key={task.taskId || task.id} style={styles.taskCard}>
                <View style={styles.taskHeader}>
                  <Text style={styles.taskSource}>{task.sourceName || task.sourceCode}</Text>
                  <Text style={styles.taskType}>{getTypeLabel(task.type)}</Text>
                  <Text style={styles.taskDate}>{new Date(task.createdAt).toLocaleString()}</Text>
                </View>

                {((task.status === 'RUNNING' || task.status === 'PENDING') || isReprobe) && (
                  <View style={styles.taskProgress}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{task.currentPage}/{task.totalPages} {isReprobe ? '部' : '页'}</Text>
                  </View>
                )}

<View style={styles.taskMeta}>
                  {isReprobe ? (
                    <>
                      <Text style={[styles.taskStat, { color: colors.success }]}>短剧: {task.shortDramaCount || 0}</Text>
                      <Text style={[styles.taskStat, { color: colors.textSecondary }]}>长剧: {task.longDramaCount || 0}</Text>
                      <Text style={styles.taskStat}>成功: {task.collectedCount}</Text>
                      <Text style={styles.taskStat}>失败: {task.failedCount}</Text>
                    </>
                  ) : null}
                  <View style={styles.taskRight}>
                      <View style={[styles.statusBadge, { borderColor: statusStyle.color }]}>
                        {task.status === 'RUNNING' && <Spinner size={10} color={statusStyle.color} strokeWidth={2} style={{ marginRight: 4 }} />}
                        <Text style={[styles.statusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                      </View>
                      {task.failedItems && parseFailedItems(task).length > 0 && (task.status === 'COMPLETED' || task.status === 'FAILED') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => handleRetryFailed(task)}
                          disabled={retryingIds.has(task.taskId) || resumingIds.has(task.taskId)}
                        >
                          {retryingIds.has(task.taskId) ? (
                            <Spinner size={12} color={colors.text} strokeWidth={2} style={{ marginRight: 4 }} />
                          ) : null}
                          {retryingIds.has(task.taskId) ? '重试中...' : `重试失败项(${parseFailedItems(task).length})`}
                        </Button>
                      )}
                      {task.status === 'FAILED' && (task.type === 'INCREMENTAL' || task.type === 'FULL') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => handleResume(task)}
                          disabled={resumingIds.has(task.taskId) || retryingIds.has(task.taskId)}
                        >
                          {resumingIds.has(task.taskId) ? (
                            <Spinner size={12} color={colors.text} strokeWidth={2} style={{ marginRight: 4 }} />
                          ) : null}
                          {resumingIds.has(task.taskId) ? '续采中...' : '继续'}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => handleDelete(task)}
                        disabled={deletingIds.has(task.taskId) || resumingIds.has(task.taskId) || retryingIds.has(task.taskId)}
                      >
                        {deletingIds.has(task.taskId) ? '删除中...' : '删除'}
                      </Button>
                    </View>
                </View>

                {(task.type === 'INCREMENTAL' || task.type === 'FULL') && (
                  <View style={styles.failedRow}>
                    {parseFailedItems(task).length > 0 ? (
                      <>
                        <View style={styles.taskMeta}>
                          <Text style={styles.taskStat}>成功: {task.collectedCount}</Text>
                          <Text style={styles.taskStat}>失败: {task.failedCount}</Text>
                          <Text style={[styles.failedToggle, { marginLeft: 'auto' }]} onPress={() => setExpandedTaskId(expandedTaskId === task.taskId ? null : task.taskId)}>
                            {expandedTaskId === task.taskId ? '▾ 收起失败明细' : `▸ 查看失败明细（${parseFailedItems(task).length}条）`}
                          </Text>
                        </View>
                        {expandedTaskId === task.taskId && (
                          <ScrollView style={styles.failedList} nestedScrollEnabled>
                            {parseFailedItems(task).map((fi, idx) => (
                              <View key={`${fi.vodId}-${idx}`} style={styles.failedItem}>
                                <Text style={[styles.failedTitle, { color: colors.text }]}>{idx + 1}. {fi.title}</Text>
                                <Text style={styles.failedError}>{fi.error}</Text>
                              </View>
                            ))}
                          </ScrollView>
                        )}
                      </>
                    ) : task.failedItems ? (
                      <Text style={styles.failedEmpty}>本次无失败条目</Text>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      {collectTasks.length > 0 && (
        <View style={styles.footer}>
          {visibleCount >= collectTasks.length ? (
            <Text style={styles.footerText}>已显示全部 {collectTasks.length} 条任务</Text>
          ) : (
            <Text style={styles.footerText}>上拉显示更多</Text>
          )}
        </View>
      )}
    </ScrollView>
    </BlurredBackground>
  );
}
