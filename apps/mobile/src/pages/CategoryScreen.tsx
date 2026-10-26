import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Dimensions, Animated, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getProvider, getStore } from '../useAppStore';
import { useThemeColors } from '../themes/useThemeColors';
import { useScaledFontSize } from '../themes/useScaledFontSize';
import MediaCard from '../components/MediaCard';
import { openMediaPlay } from '../utils/openMediaPlay';
import CategoryHeader from '../components/CategoryHeader';
import FilterDropdown from '../components/FilterDropdown';
import BlurredBackground from '../components/BlurredBackground';
import { getFilterCache, setFilterCache, getShortDramaCache, setShortDramaCache } from '../categoryFilterCache';
import type { Media, PaginatedMeta } from '@openreel/core';

const PAGE_SIZE = 20;

const DEFAULT_FILTER_KEY_PREFIX = 'category_default_filter_';

interface CategoryDefaultFilter {
  subType?: string;
  year?: number;
  area?: string;
  episodeType?: 'short' | 'long';
}

async function getDefaultFilter(type: string): Promise<CategoryDefaultFilter> {
  try {
    const raw = await AsyncStorage.getItem(`${DEFAULT_FILTER_KEY_PREFIX}${type}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

async function saveDefaultFilter(type: string, filter: CategoryDefaultFilter): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DEFAULT_FILTER_KEY_PREFIX}${type}`, JSON.stringify(filter));
  } catch {}
}

async function clearDefaultFilter(type: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${DEFAULT_FILTER_KEY_PREFIX}${type}`);
  } catch {}
}

function useDebounce(fn: () => void, delay: number, deps: any[]) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, deps);
}

const typeNames: Record<string, string> = {
  MOVIE: '电影',
  TV: '电视剧',
  VARIETY: '综艺',
  ANIME: '动漫',
  DOCUMENTARY: '纪录片',
};

interface CategoryScreenProps {
  type: string;
}

export default function CategoryScreen({ type }: CategoryScreenProps) {
  const navigation = useNavigation<any>();
  const provider = getProvider();
  const colors = useThemeColors();
  const s = useScaledFontSize();

  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const metaRef = useRef<PaginatedMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [subTypes, setSubTypes] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedSubType, setSelectedSubType] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedEpisodeType, setSelectedEpisodeType] = useState<'short' | 'long' | undefined>();
  const [sort, setSort] = useState<'latest' | 'recommend'>('recommend');
  const [showShortDramaFilter, setShowShortDramaFilter] = useState(false);
  const [showDefaultFilterModal, setShowDefaultFilterModal] = useState(false);
  const [defaultFilterDraft, setDefaultFilterDraft] = useState<CategoryDefaultFilter>({});
  const defaultFilterAppliedRef = useRef(false);
  const [expandedFilter, setExpandedFilter] = useState<string | null>(null);

  const isLoadingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const tabsHidden = useRef(new Animated.Value(0)).current;
  const prevScrollY = useRef(0);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);

  const loadList = useCallback(async (pageNum: number, replace: boolean) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const params: Record<string, any> = { page: pageNum, pageSize: PAGE_SIZE, type, sort };
      // 翻页（加载更多）复用总命中数，跳过 COUNT 全表/快照序扫描；筛选/排序变更时必重计。
      if (pageNum > 1 && !replace) params.knownTotal = metaRef.current?.total;
      if (selectedSubType) params.subType = selectedSubType;
      if (selectedYear) params.year = selectedYear;
      if (selectedArea) params.area = selectedArea;
      if (selectedEpisodeType === 'short') params.isShortDrama = true;
      else if (selectedEpisodeType === 'long') params.isShortDrama = false;

      const result = await provider.listMedia(params);

      setLoadError(false);

      // 「越看越懂你」：浏览模式记录每页展示；到达惩罚边界则触发重算
      if (result.items.length > 0) {
        const shownAt = new Date().toISOString();
        provider.recordImpressions(result.items.map((m: Media) => ({ mediaId: m.id, shownAt })))
          .then(() => {
            getStore().getState().scheduleRecommendationRecompute();
          })
          .catch((e: any) => console.error('记录列表展示失败:', e));
      }

      if (replace) {
        setMediaList(result.items);
      } else {
        setMediaList(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newItems = result.items.filter((m: Media) => !existingIds.has(m.id));
          return [...prev, ...newItems];
        });
      }
      setMeta(result.meta);
      metaRef.current = result.meta;
      setPage(pageNum);
    } catch (err) {
      console.error('loadMediaList failed:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [type, sort, selectedSubType, selectedYear, selectedArea, selectedEpisodeType, provider]);

  const loadFilterOptions = useCallback(async () => {
    const kid = (await provider.getKidModeActive()) ? '1' : '0';
    const cached = getFilterCache(type, kid);
    if (cached) {
      setSubTypes(cached.subTypes);
      setYears(cached.years);
      setAreas(cached.areas);
      return;
    }
    try {
      const [subs, yrs, areasList] = await Promise.all([
        provider.getSubTypesByType(type, undefined, true),
        provider.getYearsByType(type),
        provider.getAreasByType(type),
      ]);
      setFilterCache(type, kid, { subTypes: subs, years: yrs, areas: areasList });
      setSubTypes(subs);
      setYears(yrs);
      setAreas(areasList);
    } catch (err) {
      console.error('loadFilterOptions failed:', err);
    }
  }, [type, provider]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  useFocusEffect(
    useCallback(() => {
      loadFilterOptions();
    }, [loadFilterOptions])
  );

  useEffect(() => {
    if (type === 'TV') {
      provider.getKidModeActive().then((on) => {
        const kid = on ? '1' : '0';
        const cached = getShortDramaCache(type, kid);
        if (cached !== undefined) {
          setShowShortDramaFilter(cached);
          return;
        }
        return provider.hasShortDrama('TV').then((has) => {
          setShortDramaCache(type, kid, has);
          setShowShortDramaFilter(has);
        });
      }).catch(() => setShowShortDramaFilter(false));
    } else {
      setShowShortDramaFilter(false);
    }
  }, [type, provider]);

  // 应用默认筛选：仅在直接进入（无路由传入的筛选参数）且未应用过时生效
  useEffect(() => {
    if (defaultFilterAppliedRef.current) return;
    const hasRouteFilter = routeSubType || route.params?.year || route.params?.area || route.params?.episodeType;
    if (hasRouteFilter) {
      defaultFilterAppliedRef.current = true;
      return;
    }
    getDefaultFilter(type).then((def) => {
      if (defaultFilterAppliedRef.current) return;
      if (!def || (!def.subType && typeof def.year !== 'number' && !def.area && !def.episodeType)) {
        defaultFilterAppliedRef.current = true;
        return;
      }
      const needSub = !!def.subType && subTypes.length === 0;
      const needYear = typeof def.year === 'number' && years.length === 0;
      const needArea = !!def.area && areas.length === 0;
      if (needSub || needYear || needArea) {
        return;
      }
      if (def.subType && subTypes.includes(def.subType) && !selectedSubType) {
        setSelectedSubType(def.subType);
      }
      if (typeof def.year === 'number' && years.includes(def.year) && selectedYear === undefined) {
        setSelectedYear(def.year);
      }
      if (def.area && areas.includes(def.area) && !selectedArea) {
        setSelectedArea(def.area);
      }
      if (def.episodeType && (def.episodeType === 'short' || def.episodeType === 'long') && selectedEpisodeType === undefined) {
        setSelectedEpisodeType(def.episodeType);
      }
      defaultFilterAppliedRef.current = true;
    }).catch(() => {
      defaultFilterAppliedRef.current = true;
    });
  }, [type, subTypes, years, areas]);

  useDebounce(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    loadList(1, true);
  }, 200, [selectedSubType, selectedYear, selectedArea, selectedEpisodeType, sort, loadList]);

  const route = useRoute<any>();
  const refreshStamp = route.params?.refresh;
  const routeSubType = route.params?.subType as string | undefined;
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;

  useEffect(() => {
    if (routeSubType) setSelectedSubType(routeSubType);
  }, [routeSubType]);

  useEffect(() => {
    if (refreshStamp) loadListRef.current(1, true);
  }, [refreshStamp]);

  const handleScroll = useCallback((event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const dy = currentY - prevScrollY.current;
    if (dy > 30 && currentY > 40) {
      Animated.timing(tabsHidden, { toValue: 1, duration: 150, useNativeDriver: false }).start();
    } else if (dy < -10) {
      Animated.timing(tabsHidden, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    }
    prevScrollY.current = currentY;
  }, [tabsHidden]);

  const handleEndReached = () => {
    if (isLoadingRef.current || !meta || page >= meta.totalPages) return;
    loadList(page + 1, false);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadList(1, true).finally(() => setIsRefreshing(false));
  };

  const toggleFilter = (name: string) => {
    setExpandedFilter(prev => prev === name ? null : name);
  };

  const subTypeOptions = useMemo(() => {
    const list = selectedSubType && !subTypes.includes(selectedSubType)
      ? [selectedSubType, ...subTypes]
      : subTypes;
    return list.map(s => ({ label: s, value: s }));
  }, [subTypes, selectedSubType]);

  const yearOptions = useMemo(() =>
    years.map(y => ({ label: String(y), value: y })),
  [years]);

  const areaOptions = useMemo(() =>
    areas.map(a => ({ label: a, value: a })),
  [areas]);

  const episodeOptions = useMemo(() => [
    { label: '短剧', value: 'short' },
    { label: '长剧', value: 'long' },
  ], []);

  const hasAnyFilter = subTypes.length > 0 || years.length > 0 || areas.length > 0 || showShortDramaFilter;

  const renderHeader = () => (
    <View />
  );

  const renderFooter = () => {
    if (!isLoading || mediaList.length === 0) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.mutedForeground} />
        <Text style={styles.footerText}>加载中...</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loadError) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>加载失败</Text>
        </View>
      );
    }
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text style={styles.emptyText}>加载中...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>暂无数据</Text>
      </View>
    );
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
    },
    dropdownOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5,
      elevation: 5,
    },
    fixedHeader: {
      zIndex: 10,
    },
    listContent: {
      paddingBottom: 20,
    },
    filterBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 15,
      marginTop: 0,
      paddingVertical: 6,
      alignItems: 'center',
    },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
    },
    filterBtnText: {
      fontWeight: '500',
    },
    row: {
      paddingHorizontal: 15,
      gap: 10,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 20,
      gap: 8,
    },
    footerText: {
      fontSize: s(13),
      color: colors.mutedForeground,
    },
    emptyContainer: {
      paddingVertical: 60,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: s(16),
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '80%',
      borderRadius: 10,
      borderWidth: 1,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontWeight: '600',
    },
    modalBody: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      maxHeight: 400,
    },
    filterSection: {
      marginBottom: 14,
    },
    filterSectionTitle: {
      marginBottom: 6,
    },
    filterChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    filterChipText: {
      fontWeight: '500',
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    modalBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    modalBtnText: {
      fontWeight: '500',
    },
  }), [colors, s]);

  useEffect(() => {
    const first = mediaList[0];
    if (!first?.posterUrl) {
      setBgImageUrl(null);
      return;
    }
    setBgImageUrl(first.posterUrl);
  }, [mediaList]);

  return (
    <BlurredBackground imageUrl={bgImageUrl}>
    <View style={styles.container}>
      {expandedFilter && (
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setExpandedFilter(null)}
        />
      )}
      <View style={styles.fixedHeader}>
        <CategoryHeader activeType={typeNames[type] || type} tabsHiddenAnim={tabsHidden} />

        {hasAnyFilter && (
          <View style={styles.filterBar}>
            <TouchableOpacity
              style={[styles.filterBtn, { borderColor: colors.border, backgroundColor: colors.card } as any]}
              onPress={async () => {
                const def = await getDefaultFilter(type);
                setDefaultFilterDraft(def || {});
                setShowDefaultFilterModal(true);
                setExpandedFilter(null);
              }}
            >
              <MaterialCommunityIcons name="cog-outline" size={16} color={colors.text} />
              <Text style={[styles.filterBtnText, { color: colors.text }, { fontSize: s(12) }]}>设置默认筛选</Text>
            </TouchableOpacity>
            <FilterDropdown
              label="排序"
              options={[
                { label: '推荐', value: 'recommend' },
                { label: '最新', value: 'latest' },
              ]}
              selected={sort}
              onSelect={(v) => { setSort((v as 'latest' | 'recommend') || 'recommend'); setExpandedFilter(null); }}
              isExpanded={expandedFilter === 'sort'}
              onToggle={() => toggleFilter('sort')}
            />
            {subTypes.length > 0 && (
              <FilterDropdown
                label="分类"
                options={subTypeOptions}
                selected={selectedSubType || undefined}
                onSelect={(v) => { setSelectedSubType((v as string) || ''); setExpandedFilter(null); }}
                isExpanded={expandedFilter === 'subType'}
                onToggle={() => toggleFilter('subType')}
              />
            )}
            {years.length > 0 && (
              <FilterDropdown
                label="年份"
                options={yearOptions}
                selected={selectedYear}
                onSelect={(v) => { setSelectedYear(v as number | undefined); setExpandedFilter(null); }}
                isExpanded={expandedFilter === 'year'}
                onToggle={() => toggleFilter('year')}
                grouped
              />
            )}
            {areas.length > 0 && (
              <FilterDropdown
                label="地区"
                options={areaOptions}
                selected={selectedArea || undefined}
                onSelect={(v) => { setSelectedArea((v as string) || ''); setExpandedFilter(null); }}
                isExpanded={expandedFilter === 'area'}
                onToggle={() => toggleFilter('area')}
              />
            )}
            {showShortDramaFilter && (
              <FilterDropdown
                label="剧集"
                options={episodeOptions}
                selected={selectedEpisodeType}
                onSelect={(v) => { setSelectedEpisodeType(v as 'short' | 'long' | undefined); setExpandedFilter(null); }}
                isExpanded={expandedFilter === 'episode'}
                onToggle={() => toggleFilter('episode')}
              />
            )}
          </View>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={mediaList}
        renderItem={({ item, index }) => (
          <MediaCard
            media={item}
            onPress={() => openMediaPlay(navigation, item, {
              type: 'list',
              mediaIds: mediaList.map((m: Media) => m.id),
              currentIndex: index,
            })}
          />
        )}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
<Modal visible={showDefaultFilterModal} transparent animationType="fade" onRequestClose={() => setShowDefaultFilterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }] as any}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }, { fontSize: s(16) }]}>设置默认筛选（{typeNames[type] || type}）</Text>
              <TouchableOpacity onPress={() => setShowDefaultFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {showShortDramaFilter && (
                <View style={styles.filterSection}>
                  <Text style={[styles.filterSectionTitle, { color: colors.mutedForeground }, { fontSize: s(12) }]}>长短剧</Text>
                  <View style={styles.filterChips}>
                    <TouchableOpacity onPress={() => setDefaultFilterDraft(prev => ({ ...prev, episodeType: undefined }))} style={[styles.filterChip, !defaultFilterDraft.episodeType ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                      <Text style={[styles.filterChipText, !defaultFilterDraft.episodeType ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>全部</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDefaultFilterDraft(prev => ({ ...prev, episodeType: 'short' }))} style={[styles.filterChip, defaultFilterDraft.episodeType === 'short' ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                      <Text style={[styles.filterChipText, defaultFilterDraft.episodeType === 'short' ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>短剧</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDefaultFilterDraft(prev => ({ ...prev, episodeType: 'long' }))} style={[styles.filterChip, defaultFilterDraft.episodeType === 'long' ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                      <Text style={[styles.filterChipText, defaultFilterDraft.episodeType === 'long' ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>长剧</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {subTypes.length > 0 && (
                <View style={styles.filterSection}>
                  <Text style={[styles.filterSectionTitle, { color: colors.mutedForeground }, { fontSize: s(12) }]}>分类</Text>
                  <View style={styles.filterChips}>
                    <TouchableOpacity onPress={() => setDefaultFilterDraft(prev => ({ ...prev, subType: undefined }))} style={[styles.filterChip, !defaultFilterDraft.subType ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                      <Text style={[styles.filterChipText, !defaultFilterDraft.subType ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>全部</Text>
                    </TouchableOpacity>
                    {(selectedSubType && !subTypes.includes(selectedSubType) ? [selectedSubType, ...subTypes] : subTypes).map((g) => (
                      <TouchableOpacity key={g} onPress={() => setDefaultFilterDraft(prev => ({ ...prev, subType: g }))} style={[styles.filterChip, defaultFilterDraft.subType === g ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                        <Text style={[styles.filterChipText, defaultFilterDraft.subType === g ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {years.length > 0 && (
                <View style={styles.filterSection}>
                  <Text style={[styles.filterSectionTitle, { color: colors.mutedForeground }, { fontSize: s(12) }]}>年份</Text>
                  <View style={styles.filterChips}>
                    <TouchableOpacity onPress={() => setDefaultFilterDraft(prev => ({ ...prev, year: undefined }))} style={[styles.filterChip, defaultFilterDraft.year === undefined ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                      <Text style={[styles.filterChipText, defaultFilterDraft.year === undefined ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>全部</Text>
                    </TouchableOpacity>
                    {years.map((y) => (
                      <TouchableOpacity key={y} onPress={() => setDefaultFilterDraft(prev => ({ ...prev, year: y }))} style={[styles.filterChip, defaultFilterDraft.year === y ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                        <Text style={[styles.filterChipText, defaultFilterDraft.year === y ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>{y}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {areas.length > 0 && (
                <View style={styles.filterSection}>
                  <Text style={[styles.filterSectionTitle, { color: colors.mutedForeground }, { fontSize: s(12) }]}>地区</Text>
                  <View style={styles.filterChips}>
                    <TouchableOpacity onPress={() => setDefaultFilterDraft(prev => ({ ...prev, area: undefined }))} style={[styles.filterChip, !defaultFilterDraft.area ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                      <Text style={[styles.filterChipText, !defaultFilterDraft.area ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>全部</Text>
                    </TouchableOpacity>
                    {areas.map((a) => (
                      <TouchableOpacity key={a} onPress={() => setDefaultFilterDraft(prev => ({ ...prev, area: a }))} style={[styles.filterChip, defaultFilterDraft.area === a ? { backgroundColor: colors.mutedForeground } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }] as any}>
                        <Text style={[styles.filterChipText, defaultFilterDraft.area === a ? { color: '#fff' } : { color: colors.text }, { fontSize: s(12) }]}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={async () => { await clearDefaultFilter(type); setDefaultFilterDraft({}); setShowDefaultFilterModal(false); }}>
                <Text style={[styles.modalBtnText, { color: colors.text }, { fontSize: s(13) }]}>清空默认筛选</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setShowDefaultFilterModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.text }, { fontSize: s(13) }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.mutedForeground }]} onPress={async () => { await saveDefaultFilter(type, defaultFilterDraft); setShowDefaultFilterModal(false); }}>
                <Text style={[styles.modalBtnText, { color: '#fff' }, { fontSize: s(13) }]}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </BlurredBackground>
  );
}

      
