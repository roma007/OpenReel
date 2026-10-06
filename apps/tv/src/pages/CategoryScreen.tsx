import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Media } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { getProvider, getStore } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { TVRow } from '../focus/TVRow';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import MediaCard from '../components/MediaCard';
import { TV_CARD, TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 分类页（电影/剧集/动漫/综艺/纪录片）。
 *
 * 遵守「导航返回铁律」：页码、类型、年份等筛选写入 route.params（由上游 Detail 返回时带回），
 * 本页从 route 恢复初始值，不硬编码回第 1 页。
 *
 * 遥控交互：筛选条是一排可聚焦项；结果区是横向行（TVRow），上下切换行、左右切换卡片。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Category'>;

const SORTS: Array<{ key: string; label: string }> = [
  { key: 'recommend', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'rating', label: '评分' },
  { key: 'hot', label: '热门' },
  { key: 'year', label: '年份' },
];

export function CategoryScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const initialType = route.params?.type;
  const initialTitle = route.params?.title;

  // 筛选状态全部来自 route.params（可被返回还原），缺省才用本地默认值
  const [page, setPage] = useState(route.params?.page ?? 1);
  const [sort, setSort] = useState<string>(route.params?.sort ?? 'recommend');
  const [subType, setSubType] = useState<string | undefined>(route.params?.subType);
  const [year, setYear] = useState<number | undefined>(route.params?.year);

  const [subTypes, setSubTypes] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadFilters = useCallback(async () => {
    const store = getStore();
    const [subs, ys] = await Promise.all([
      store.getState().getSubTypesByType(initialType, false, false),
      store.getState().getYearsByType(initialType),
    ]);
    setSubTypes((subs || []) as string[]);
    setYears((ys || []) as number[]);
  }, [initialType]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getProvider().listMedia({
        page,
        pageSize: 20,
        sort: sort as any,
        type: initialType,
        subType,
        year,
      });
      setItems(r.items as Media[]);
      setTotal(r.meta.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, sort, initialType, subType, year]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 页面数据就绪后给初始焦点
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => focusRegistry.requestInitialFocus(`cat-sort:${sort}`), 120);
    return () => clearTimeout(t);
  }, [loading, sort]);

  // 筛选变更 → 页码回到第 1（与手机端一致：换筛选不应停留在旧页）
  const applySort = useCallback((s: string) => {
    setSort(s);
    setPage(1);
  }, []);
  const applySubType = useCallback((s?: string) => {
    setSubType(s);
    setPage(1);
  }, []);
  const applyYear = useCallback((y?: number) => {
    setYear(y);
    setPage(1);
  }, []);

  const openDetail = useCallback(
    (m: Media) => {
      nav.navigate('Detail', {
        mediaId: m.id,
        title: m.title,
        from: 'category',
        page,
        sort: sort as any,
        type: initialType,
        subType,
        year,
        subtypePage: !!subType,
      });
    },
    [nav, page, sort, initialType, subType, year],
  );

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const header = useMemo(
    () => (
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: scale(26) }]}>
          {initialTitle || '全部'}
        </Text>
        <Text style={[styles.count, { color: colors.mutedForeground, fontSize: scale(16) }]}>
          共 {total} 部
        </Text>
      </View>
    ),
    [initialTitle, total, colors, scale],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="cat-back" label="返回" onPress={() => nav.goBack()} testID="tv-category-back" />
        {header}
      </View>

      {/* 筛选条：排序 / 子类型 / 年份 */}
      <View style={{ paddingHorizontal: TV_LAYOUT.paddingX, paddingVertical: tv(12) }}>
        <Text style={[styles.filterLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}>
          排序
        </Text>
        <View style={styles.filterRow}>
          {SORTS.map((s) => (
            <TVButton
              key={s.key}
              id={`cat-sort:${s.key}`}
              label={s.label}
              variant={sort === s.key ? 'primary' : 'ghost'}
              onPress={() => applySort(s.key)}
              testID={`tv-category-sort-${s.key}`}
            />
          ))}
        </View>

        {subTypes.length > 0 ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}>
              类型
            </Text>
            <View style={styles.filterRow}>
              <TVButton
                id="cat-sub:all"
                label="全部"
                variant={!subType ? 'primary' : 'ghost'}
                onPress={() => applySubType(undefined)}
              />
              {subTypes.map((s) => (
                <TVButton
                  key={s}
                  id={`cat-sub:${s}`}
                  label={s}
                  variant={subType === s ? 'primary' : 'ghost'}
                  onPress={() => applySubType(s)}
                />
              ))}
            </View>
          </>
        ) : null}

        {years.length > 0 ? (
          <>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground, fontSize: scale(15) }]}>
              年份
            </Text>
            <View style={styles.filterRow}>
              <TVButton
                id="cat-year:all"
                label="全部"
                variant={year == null ? 'primary' : 'ghost'}
                onPress={() => applyYear(undefined)}
              />
              {years.slice(0, 20).map((y) => (
                <TVButton
                  key={y}
                  id={`cat-year:${y}`}
                  label={String(y)}
                  variant={year === y ? 'primary' : 'ghost'}
                  onPress={() => applyYear(y)}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {/* 结果区：按页横向排列 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>正在加载…</Text>
        ) : items.length === 0 ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            没有符合条件的影片
          </Text>
        ) : (
          <TVRow
            rowId="cat-items"
            title=""
            data={items}
            keyExtractor={(m) => String(m.id)}
            itemWidth={TV_CARD.width}
            itemHeight={TV_CARD.height}
            onItemPress={openDetail}
            renderItem={(m) => <MediaCard media={m} width={TV_CARD.width} height={TV_CARD.height} />}
          />
        )}

        {/* 翻页：电视上一次翻一页即可，页码信息常驻 */}
        {totalPages > 1 ? (
          <View style={[styles.pager, { borderTopColor: colors.border }]}>
            <TVButton
              id="cat-prev"
              label="上一页"
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            />
            <Text style={[styles.pageInfo, { color: colors.foreground, fontSize: scale(18) }]}>
              第 {page} / {totalPages} 页
            </Text>
            <TVButton
              id="cat-next"
              label="下一页"
              disabled={page >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: tv(20),
  },
  pageTitle: { fontWeight: '800' },
  count: { marginLeft: tv(14) },
  filterLabel: { marginBottom: tv(6), marginTop: tv(4) },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: tv(4),
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(8), paddingBottom: tv(40) },
  status: { paddingVertical: tv(36), textAlign: 'center' },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tv(20),
    paddingTop: tv(18),
    borderTopWidth: 1,
  },
  pageInfo: { marginHorizontal: tv(18) },
});

export default CategoryScreen;