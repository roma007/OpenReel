import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Check, CheckCircle, XCircle, Minus, X } from 'lucide-react-native';
import { useThemeColors, useScaledFontSize, hexToRgba } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { tv } from '../theme/tokens';

/** 手动触发后自动折叠为药丸的时长（与移动端一致） */
const AUTO_COLLAPSE_MS = 5000;
/** 全部完成后自动消失的时长（与移动端一致） */
const ALL_DONE_DISMISS_MS = 2000;
/**
 * 展开态面板宽度（dp）。
 * 依据 1920×1080 实测：最宽内容为 header（标题 + 两个按钮）约 561px，
 * 明细行「第 x/y 页 · 已采集 n 部」约 469px；故取 320dp（=640px，占屏宽 1/3）已足够，
 * 不再使用早前偏大的 600dp（=1200px、占屏宽 62.5%，右侧约 2/3 全是空白）。
 */
const PANEL_WIDTH = 320;

/**
 * TV 增量采集进度窗口（参考移动端 CollectProgressDialog，语义一致，只改交互形态）。
 *
 * 数据源：store `collectSourceProgress` / `collectTrigger`（collectLatest 维护）。
 * 行为对齐移动端：
 *  - collectSourceProgress 非空即在左下角弹出（全局挂载，任意页面可见）
 *  - manual 触发展开 + 5 秒自动折叠；auto 触发直接折叠为药丸
 *  - 展开态：标题 + 收起/关闭按钮 + 每源进度行 + 底部汇总
 *  - 药丸态：点按重新展开
 *  - 全部完成（done|failed）2 秒后自动消失
 * TV 形态差异：
 *  - 按钮/药丸用 TVFocusable（遥控 + 触摸均可点），但不申请初始焦点（不抢页面焦点）
 *  - 面板主体 colors.card 不透明底（遵守「弹窗不透明度规则」）
 *  - 不用 LayoutAnimation / SafeAreaInsets（TV 动画保持最短）
 */
export function CollectProgressDialog() {
  const collectSourceProgress = useAppStore((s) => s.collectSourceProgress);
  const collectTrigger = useAppStore((s) => s.collectTrigger);
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevVisibleRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const startCollapseTimer = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setExpanded(false);
      collapseTimerRef.current = null;
    }, AUTO_COLLAPSE_MS);
  };

  const clearCollapseTimer = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  // 可见性上升沿：重置状态；manual 展开并启动自动折叠，auto 直接药丸（与移动端一致）
  useEffect(() => {
    const visible = !!collectSourceProgress && collectSourceProgress.length > 0;
    if (visible && !prevVisibleRef.current) {
      setDismissed(false);
      if (collectTrigger === 'auto') {
        setExpanded(false);
      } else {
        setExpanded(true);
        startCollapseTimer();
      }
    }
    prevVisibleRef.current = visible;
  }, [collectSourceProgress, collectTrigger]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  const visible = !!collectSourceProgress && collectSourceProgress.length > 0 && !dismissed;
  const allDone =
    visible &&
    collectSourceProgress.every((s) => s.status === 'done' || s.status === 'failed');

  // 全部完成：停止自动折叠，2 秒后自动消失（语义同移动端，用 effect 保证可清理）
  useEffect(() => {
    if (!visible || !allDone) return;
    clearCollapseTimer();
    const t = setTimeout(() => {
      setDismissed(true);
      setExpanded(false);
    }, ALL_DONE_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible, allDone]);

  if (!visible) return null;

  const totalCollected = collectSourceProgress.reduce((sum, s) => sum + s.collected, 0);
  const doneCount = collectSourceProgress.filter((s) => s.status === 'done').length;
  const failedCount = collectSourceProgress.filter((s) => s.status === 'failed').length;
  const runningCount = collectSourceProgress.filter((s) => s.status === 'running').length;

  const panelBg = colors.card; // 弹窗主体必须不透明（项目规则：弹窗不透明度规则）
  const headerTitle = allDone
    ? '采集完成'
    : runningCount > 0
      ? `增量采集中 (${runningCount}源)`
      : '增量采集';

  const handleExpand = () => {
    setExpanded(true);
    startCollapseTimer();
  };

  const handleCollapse = () => {
    clearCollapseTimer();
    setExpanded(false);
  };

  const handleDismiss = () => {
    clearCollapseTimer();
    setDismissed(true);
  };

  if (!expanded) {
    // 折叠态：药丸，点按重新展开
    return (
      <View style={styles.overlay}>
        <TVFocusable
          id="collect-pill"
          onPress={handleExpand}
          style={[styles.pill, { backgroundColor: panelBg, borderColor: colors.border }]}
          testID="tv-collect-pill"
        >
          {allDone ? (
            <Check size={tv(18)} color={colors.success} />
          ) : (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          )}
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}
          >
            {allDone ? '采集完成' : `采集中 ${doneCount + failedCount}/${collectSourceProgress.length}`}
          </Text>
          {totalCollected > 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>
              · {totalCollected}部
            </Text>
          ) : null}
        </TVFocusable>
      </View>
    );
  }

  // 展开态：进度面板
  return (
    <View style={styles.overlay}>
      <View
        style={[
          styles.panel,
          { backgroundColor: panelBg, borderColor: colors.border, width: tv(PANEL_WIDTH) },
        ]}
      >
        <View style={styles.header}>
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontSize: scale(19), fontWeight: '700', flex: 1 }}
          >
            {headerTitle}
          </Text>
          <View style={styles.headerActions}>
            <TVFocusable
              id="collect-collapse"
              onPress={handleCollapse}
              style={[styles.headerBtn, { backgroundColor: hexToRgba(colors.mutedForeground, 0.15) }]}
              testID="tv-collect-collapse"
            >
              <Minus size={tv(18)} color={colors.mutedForeground} />
            </TVFocusable>
            <TVFocusable
              id="collect-dismiss"
              onPress={handleDismiss}
              style={[styles.headerBtn, { backgroundColor: hexToRgba(colors.mutedForeground, 0.15) }]}
              testID="tv-collect-dismiss"
            >
              <X size={tv(18)} color={colors.mutedForeground} />
            </TVFocusable>
          </View>
        </View>

        <View style={styles.list}>
          {collectSourceProgress.map((item, i) => {
            const rowBg =
              item.status === 'failed'
                ? hexToRgba(colors.error, 0.05)
                : item.status === 'done'
                  ? hexToRgba(colors.success, 0.05)
                  : hexToRgba(colors.mutedForeground, 0.1);
            return (
              <View key={`${item.sourceCode}:${i}`} style={[styles.item, { backgroundColor: rowBg }]}>
                <View style={styles.itemIcon}>
                  {item.status === 'running' ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : item.status === 'done' ? (
                    <CheckCircle size={tv(16)} color={colors.success} />
                  ) : (
                    <XCircle size={tv(16)} color={colors.error} />
                  )}
                </View>
                <View style={styles.itemContent}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}
                  >
                    {item.sourceName}
                  </Text>
                  {item.status === 'failed' ? (
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.error, fontSize: scale(14), marginTop: tv(3) }}
                    >
                      {item.error || '采集失败'}
                    </Text>
                  ) : item.status === 'done' ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(3) }}>
                      完成 · 共采集 {item.collected} 部
                    </Text>
                  ) : item.totalPages === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(3) }}>
                      正在读取待采集量...
                    </Text>
                  ) : (
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(3) }}>
                      第 {item.currentPage}/{item.totalPages} 页 · 已采集 {item.collected} 部
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Text style={{ color: colors.mutedForeground, fontSize: scale(14) }}>
            共采集 {totalCollected} 部
            {doneCount > 0 ? ` · ${doneCount} 源完成` : ''}
            {failedCount > 0 ? ` · ${failedCount} 源失败` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: tv(40),
    left: tv(56),
    zIndex: 999,
    elevation: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv(8),
    paddingHorizontal: tv(18),
    paddingVertical: tv(12),
    borderRadius: tv(24),
    borderWidth: 1,
  },
  panel: {
    borderRadius: tv(10),
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(18),
    paddingVertical: tv(14),
  },
  headerActions: {
    flexDirection: 'row',
    gap: tv(10),
    marginLeft: tv(12),
  },
  headerBtn: {
    width: tv(38),
    height: tv(38),
    borderRadius: tv(19),
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: tv(12),
    paddingBottom: tv(6),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(14),
    paddingVertical: tv(11),
    borderRadius: tv(8),
    marginBottom: tv(6),
  },
  itemIcon: {
    width: tv(26),
    alignItems: 'center',
    marginRight: tv(10),
  },
  itemContent: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: tv(18),
    paddingVertical: tv(12),
  },
});

export default CollectProgressDialog;
