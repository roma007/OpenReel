import React from 'react';
import { View } from 'react-native';
import { TVFocusable } from './TVFocusable';

/**
 * TV 二维网格（X 排 Y 列）。
 *
 * 与 TVRow（一条横向行）对应：分类页这类「查看全部」浏览页用网格更合适 ——
 * 一屏能看多行多列，符合手机端 `FlatList numColumns` 的浏览模型。
 *
 * 行高由行内最高卡片**自适应撑起**（对齐移动端 FlatList：行底边对齐、内容不溢出），
 * 不固定 cell 高度；列宽 `itemWidth` 等宽固定，保证跨排上下对位与焦点几何稳定。
 *
 * 焦点交给原生 FocusFinder：同排 LEFT/RIGHT、跨排 UP/DOWN（各列等宽对齐，几何命中稳定）；
 * 竖向滚出可视区的跟随由外层的 TVScrollContainer 负责（实时 measureInWindow，不依赖固定行高）。
 */
export interface TVGridProps {
  /** 焦点 id 前缀（同一页唯一即可） */
  idPrefix: string;
  data: readonly any[];
  keyExtractor: (item: any, index: number) => string;
  renderItem: (item: any, index: number) => React.ReactNode;
  /** 列数 */
  columns: number;
  /** 单元格宽(dp)：各行等宽以保证上下对齐；高由内容自适应 */
  itemWidth: number;
  /** 单元格间距(dp) */
  gap?: number;
  onItemPress?: (item: any, index: number) => void;
  /** 某单元格获得焦点（分类页据此在触底时加载下一页） */
  onItemFocus?: (index: number) => void;
}

export function TVGrid({
  idPrefix,
  data,
  keyExtractor,
  renderItem,
  columns,
  itemWidth,
  gap = 16,
  onItemPress,
  onItemFocus,
}: TVGridProps) {
  const rows: any[][] = [];
  for (let i = 0; i < data.length; i += columns) {
    rows.push(data.slice(i, i + columns));
  }

  return (
    <View>
      {rows.map((row, rowIndex) => (
        <View
          key={`${idPrefix}-row-${rowIndex}`}
          // alignItems: 'stretch'：与移动端 FlatList numColumns 列容器默认行为一致 —
          // 行内卡片拉伸到行内最高卡片高度，视觉等高（矮卡片仅内容顶部对齐、底部留白）。
          style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: gap }}
        >
          {row.map((item, colIndex) => {
            const index = rowIndex * columns + colIndex;
            const key = keyExtractor(item, index);
            return (
              <TVFocusable
                key={`${idPrefix}-${key}`}
                id={`${idPrefix}:${key}`}
                onFocus={() => onItemFocus?.(index)}
                onPress={() => onItemPress?.(item, index)}
                style={{
                  width: itemWidth,
                  marginRight: colIndex < row.length - 1 ? gap : 0,
                }}
                testID={`tv-grid-${idPrefix}-${index}`}
              >
                {renderItem(item, index)}
              </TVFocusable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default TVGrid;