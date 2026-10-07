import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Media } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { getProvider, getStore } from '../useAppStore';
import { TVGrid } from '../focus/TVGrid';
import { TVScrollContainer } from '../focus/TVScrollContainer';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import MediaCard from '../components/MediaCard';
import { TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 分类页（电影/剧集/动漫/综艺/纪录片）。
 *
 * 遵守「导航返回铁律」：页码、类型、年份等筛选写入 route.params（由上游 Detail 返回时带回），
 * 本页从 route 恢复初始值，不硬编码回第 1 页。
 *
 * 遥控交互：筛选条是一排可聚焦项；结果区是 X 排 Y 列网格（TVGrid），
 * 同排左右移动、跨排上下移动，焦点落到最后一排时自动加载下一页（对齐手机端 onEndReached）。
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

/** 分类页网格：1080p 横屏 6 列，卡片沿用 2:3 海报比例（由可用宽度反算） */
const GRID_COLUMNS = 6;
const GRID_GAP = tv(16);
const GRID_CARD_WIDTH = Math.floor(
  (Dimensions.get('window').width - TV_LAYOUT.paddingX * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
    GRID_COLUMNS,
);
const GRID_CARD_HEIGHT = Math.round(GRID_CARD_WIDTH * 1.5);

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

  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const hasMore = items.length < total;

  /**
   * 替换式加载前 N 页（首次进入 / 筛选变更 / 从详情返回）。
   *
   * 结果区是网格 + 触底自动加载，「返回时恢复」需把回来前的页数 1..N 一次性补齐
   * （只加载第 N 页会让网格顶部缺页）。restorePageRef 由路由参数初始化，用完归 1，
   * 后续筛选变更只加载第 1 页。
   */
  const restorePageRef = useRef(Math.max(1, Number(route.params?.page) || 1));

  const loadPage = useCallback(
    async (target: number) => {
      setLoading(true);
      try {
        const pages = Math.max(1, target);
        const collected: Media[] = [];
        let next = 0;
        for (let p = 1; p <= pages; p += 1) {
          const r = await getProvider().listMedia({
            page: p,
            pageSize: 20,
            sort: sort as any,
            type: initialType,
            subType,
            year,
          });
          collected.push(...(r.items as Media[]));
          next = r.meta.total;
          if (r.items.length < 20) break; // 已到最后一页
        }
        setItems(collected);
        setTotal(next);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [sort, initialType, subType, year],
  );

  /** 触底加载下一页（追加，不替换），对应手机端 onEndReached */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || items.length >= total) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const r = await getProvider().listMedia({
        page: page + 1,
        pageSize: 20,
        sort: sort as any,
        type: initialType,
        subType,
        year,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...(r.items as Media[]).filter((x: Media) => !seen.has(x.id))];
      });
      setTotal(r.meta.total);
      setPage((p) => p + 1);
    } catch {
      // 失败保持现状，下次触底再试
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [page, items.length, total, sort, initialType, subType, year]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    const target = restorePageRef.current;
    restorePageRef.current = 1;
    loadPage(target);
  }, [loadPage]);

  // 折叠筛选：默认全部收缩，同一时刻只展开一个筛选类
  const [expandedFilter, setExpandedFilter] = useState<'sort' | 'subType' | 'year' | null>(null);

  const toggleFilter = useCallback((key: 'sort' | 'subType' | 'year') => {
    setExpandedFilter((prev) => (prev === key ? null : key));
  }, []);

  /**
   * 收起面板后把焦点还原到刚操作的触发器。
   *
   * 只需声明一次：页面「初始焦点」effect 已改为仅首次生效（见 didInitFocus），
   * 不会再因列表重载把焦点抢回「排序」。
   */
  const restoreFocus = useCallback((id: string) => {
    focusRegistry.requestInitialFocus(id);
  }, []);

  // 页面数据就绪后给初始焦点（默认收缩 → 指向排序触发器）。
  // 只做一次：筛选变更也会触发 loading 变化，若每次都跑会把焦点从触发器抢回「排序」。
  const didInitFocus = useRef(false);
  useEffect(() => {
    if (loading || didInitFocus.current) return;
    didInitFocus.current = true;
    const t = setTimeout(() => focusRegistry.requestInitialFocus('cat-filter:sort'), 120);
    return () => clearTimeout(t);
  }, [loading]);

  // 筛选变更 → 页码回到第 1（与手机端一致：换筛选不应停留在旧页）；收起面板并把焦点还给触发器
  const applySort = useCallback((s: string) => {
    setSort(s);
    setPage(1);
    setExpandedFilter(null);
    restoreFocus('cat-filter:sort');
  }, [restoreFocus]);
  const applySubType = useCallback((s?: string) => {
    setSubType(s);
    setPage(1);
    setExpandedFilter(null);
    restoreFocus('cat-filter:subType');
  }, [restoreFocus]);
  const applyYear = useCallback((y?: number) => {
    setYear(y);
    setPage(1);
    setExpandedFilter(null);
    restoreFocus('cat-filter:year');
  }, [restoreFocus]);

  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '推荐';
  const subTypeLabel = subType ?? '全部';
  const yearLabel = year != null ? String(year) : '全部';

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

      {/* 折叠筛选条 + 结果区：整体可滚动；原生在 TV 上不可靠，用 TVScrollContainer 主动跟随焦点 */}
      <TVScrollContainer
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
      >
        {/* 筛选条：默认全部收缩；点某个触发器只展开该类，其余自动收缩 */}
        <View style={styles.filterBar}>
          <View style={styles.filterRow}>
            <TVButton
              id="cat-filter:sort"
              label={`排序：${sortLabel}`}
              variant={expandedFilter === 'sort' ? 'primary' : 'ghost'}
              onPress={() => toggleFilter('sort')}
              testID="tv-category-filter-sort"
            />
            {subTypes.length > 0 ? (
              <TVButton
                id="cat-filter:subType"
                label={`分类：${subTypeLabel}`}
                variant={expandedFilter === 'subType' ? 'primary' : 'ghost'}
                onPress={() => toggleFilter('subType')}
                testID="tv-category-filter-subtype"
              />
            ) : null}
            {years.length > 0 ? (
              <TVButton
                id="cat-filter:year"
                label={`年份：${yearLabel}`}
                variant={expandedFilter === 'year' ? 'primary' : 'ghost'}
                onPress={() => toggleFilter('year')}
                testID="tv-category-filter-year"
              />
            ) : null}
          </View>

          {expandedFilter === 'sort' ? (
            <View style={styles.optionRow}>
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
          ) : null}

          {expandedFilter === 'subType' ? (
            <View style={styles.optionRow}>
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
          ) : null}

          {expandedFilter === 'year' ? (
            <View style={styles.optionRow}>
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
          ) : null}
        </View>

        {/* 结果区：X 排 Y 列网格；焦点落到最后一排时自动加载下一页（对齐手机端 onEndReached） */}
        {loading ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>正在加载…</Text>
        ) : items.length === 0 ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            没有符合条件的影片
          </Text>
        ) : (
          <TVGrid
            idPrefix="cat-items"
            data={items}
            keyExtractor={(m) => String(m.id)}
            columns={GRID_COLUMNS}
            itemWidth={GRID_CARD_WIDTH}
            itemHeight={GRID_CARD_HEIGHT}
            gap={GRID_GAP}
            onItemPress={openDetail}
            onItemFocus={(index) => {
              if (index >= items.length - GRID_COLUMNS) loadMore();
            }}
            renderItem={(m) => (
              <MediaCard media={m} width={GRID_CARD_WIDTH} height={GRID_CARD_HEIGHT} />
            )}
          />
        )}

        {/* 「加载更多」由焦点触底自动触发，这里只给状态反馈 */}
        {!loading && items.length > 0 ? (
          <Text style={[styles.statusSmall, { color: colors.mutedForeground, fontSize: scale(16) }]}>
            {loadingMore ? '正在加载更多…' : hasMore ? '继续向下浏览可加载更多' : '没有更多了'}
          </Text>
        ) : null}
      </TVScrollContainer>
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
  filterBar: { paddingVertical: tv(10) },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: tv(10),
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(8), paddingBottom: tv(40) },
  status: { paddingVertical: tv(36), textAlign: 'center' },
  statusSmall: { paddingVertical: tv(18), textAlign: 'center' },
});

export default CategoryScreen;