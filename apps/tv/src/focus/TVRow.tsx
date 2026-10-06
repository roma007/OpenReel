import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View, StyleSheet, Text } from 'react-native';
import { useThemeColors, useScaledFontSize, radius } from '@openreel/expo-ui';
import { TVFocusable } from './TVFocusable';

/**
 * TV 横向内容行（海报墙 / 分类行）。
 *
 * 解决两件手机端不存在的问题：
 *  1. 焦点移出可视区 → 用 scrollTo 保证焦点目标始终可见（onFocus 回调内驱动）
 *  2. 焦点移到行首/行尾 → 由 focusRegistry 的行内几何兜底交给上下相邻行（rowId 机制）
 */
export interface TVRowProps {
  /** 行 id（同一行共享，供上下切换时对齐列） */
  rowId: string;
  title?: string;
  /**
   * 标题点击回调：传入时标题渲染成可聚焦的「xxx ›」入口。
   * TV 端没有手势下拉，行标题是唯一的「查看全部」入口（如首页「继续观看 ›」→ 观看历史页）。
   */
  onTitlePress?: () => void;
  /** 行首是否带「查看全部」等尾部动作元素 */
  trailing?: React.ReactNode;
  data: readonly any[];
  keyExtractor: (item: any, index: number) => string;
  renderItem: (item: any, index: number) => React.ReactNode;
  /** 行内卡片宽度(dp) */
  itemWidth?: number;
  /** 行内卡片高度(dp) */
  itemHeight?: number;
  onItemPress?: (item: any, index: number) => void;
  onFocusIndexChange?: (index: number) => void;
  /** 空列表时的提示文案 */
  emptyText?: string;
}

export function TVRow({
  rowId,
  title,
  onTitlePress,
  trailing,
  data,
  keyExtractor,
  renderItem,
  itemWidth = 150,
  itemHeight = 224,
  onItemPress,
  onFocusIndexChange,
  emptyText = '暂无内容',
}: TVRowProps) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<Map<number, { x: number; w: number }>>(new Map());

  // 记录每项 x 偏移，onFocus 时精确滚动（不用估算，避免滚动后焦点仍在视区外）
  const onItemLayout = useCallback((index: number, x: number, width: number) => {
    offsetsRef.current.set(index, { x, w: width });
  }, []);

  const ensureVisible = useCallback((index: number) => {
    const info = offsetsRef.current.get(index);
    if (!info || !scrollRef.current) return;
    // 让目标卡片居中偏左，右侧留出下一张的提示，符合电视浏览习惯
    const target = Math.max(0, info.x - 80);
    scrollRef.current.scrollTo({ x: target, animated: true });
  }, []);

  useEffect(() => {
    offsetsRef.current.clear();
  }, [rowId, data.length]);

  if (data.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        {title ? <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text> : null}
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {title ? (
        onTitlePress ? (
          <TVFocusable
            id={`${rowId}:title`}
            rowId={rowId}
            onPress={onTitlePress}
            style={styles.titleWrap}
            testID={`tv-row-${rowId}-title`}
          >
            <Text style={[styles.titleLink, { color: colors.foreground, fontSize: scale(20) }]}>
              {title} ›
            </Text>
          </TVFocusable>
        ) : (
          <Text style={[styles.title, { color: colors.foreground, fontSize: scale(20) }]}>{title}</Text>
        )
      ) : null}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        // 电视端无触摸，禁用惯性 fling 之外的触摸滚动干扰：仍保留 scrollEnabled 供焦点滚动
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {data.map((item, index) => (
          <TVFocusable
            key={`${rowId}-${keyExtractor(item, index)}`}
            id={`${rowId}:${keyExtractor(item, index)}`}
            rowId={rowId}
            onFocus={() => {
              ensureVisible(index);
              onFocusIndexChange?.(index);
            }}
            onPress={() => onItemPress?.(item, index)}
            style={{ width: itemWidth, marginRight: 16 }}
            testID={`tv-row-${rowId}-${index}`}
          >
            <View
              onLayout={(e) => onItemLayout(index, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
              style={{ width: itemWidth, height: itemHeight }}
            >
              {renderItem(item, index)}
            </View>
          </TVFocusable>
        ))}
        {trailing ? <View style={{ marginRight: 24 }}>{trailing}</View> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 48,
    paddingVertical: 8,
  },
  title: {
    fontWeight: '700',
    paddingHorizontal: 48,
    marginBottom: 10,
  },
  titleWrap: {
    paddingHorizontal: 48,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  titleLink: {
    fontWeight: '700',
  },
  emptyWrap: {
    paddingHorizontal: 48,
    paddingVertical: 12,
    marginBottom: 24,
    borderRadius: radius.md,
  },
  empty: {
    fontSize: 15,
  },
});

export default TVRow;