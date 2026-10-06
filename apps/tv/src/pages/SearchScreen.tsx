import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Media } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { getProvider } from '../useAppStore';
import { TVFocusable } from '../focus/TVFocusable';
import { TVRow } from '../focus/TVRow';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { focusRegistry } from '../focus/registry';
import MediaCard from '../components/MediaCard';
import { TV_CARD, TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/**
 * TV 搜索页。
 *
 * 遥控端输入策略（不依赖设备 IME，见 plan 第十节取证）：
 *  - 搜索框是可聚焦字段，按 OK 打开**应用内键盘**（任何 ATV 设备都可用），
 *    键盘内另有「系统键盘」「粘贴」补充通道
 *  - 同时提供「最近搜索」快捷项，遥控用户可一键复用历史词
 *  - 提交走「搜索」按钮（遥控 OK 直达，不依赖回车键）
 *
 * 返回还原：从 Search 进 Detail 再返回时，恢复本关键词与页码（route.params）。
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Search'>;

const PAGE_SIZE = 20;
const RECENT_KEY = 'tv-recent-searches';

export function SearchScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const [keyword, setKeyword] = useState(route.params?.keyword ?? '');
  const [submitted, setSubmitted] = useState(route.params?.keyword ?? '');
  const [page, setPage] = useState(route.params?.page ?? 1);
  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  // 最近搜索：TV 端用 AsyncStorage 单独存一份（与手机端不共享，各自设备各自历史）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem(RECENT_KEY);
        if (alive && raw) setRecent(JSON.parse(raw));
      } catch {
        // 读失败不影响搜索
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pushRecent = useCallback(async (kw: string) => {
    if (!kw.trim()) return;
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const next = [kw, ...recent.filter((r) => r !== kw)].slice(0, 10);
      setRecent(next);
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // 写失败不阻塞搜索
    }
  }, [recent]);

  const doSearch = useCallback(
    async (kw: string, p: number) => {
      const q = kw.trim();
      if (!q) {
        setItems([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      try {
        const r = await getProvider().searchMedia(q, { page: p, pageSize: PAGE_SIZE });
        setItems(r.items as Media[]);
        setTotal(r.meta.total);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (route.params?.keyword) {
      doSearch(route.params.keyword, route.params?.page ?? 1);
    }
    // 仅在从别处带关键词进入时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.keyword, route.params?.page]);

  const submit = useCallback(() => {
    const kw = keyword.trim();
    if (!kw) return;
    setSubmitted(kw);
    setPage(1);
    pushRecent(kw);
    doSearch(kw, 1);
  }, [keyword, pushRecent, doSearch]);

  // 初始焦点给搜索框：搜索页的主要动作就是输入，首焦点必须是输入框。
  // 延后到 400ms：实测 TVPageHeader 与输入框同处一屏时，120~150ms 时原生视图尚未
  // attach，View.focus() 静默失败，焦点会落到 search-back（logcat 实证）。
  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('search-input'), 400);
    return () => clearTimeout(t);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="search-back" label="返回" onPress={() => nav.goBack()} testID="tv-search-back" />

        <View style={styles.inputWrap}>
          <TVTextInput
            id="search-input"
            containerStyle={styles.inputContainer}
            value={keyword}
            mode="text"
            placeholder="输入片名搜索"
            hint="按 OK 打开电视键盘输入；也可用下方最近搜索"
            onChangeText={setKeyword}
            testID="tv-search-input"
          />
        </View>

        <TVButton id="search-go" label="搜索" variant="primary" onPress={submit} testID="tv-search-go" />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!submitted ? (
          recent.length > 0 ? (
            <View style={styles.recentWrap}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
                最近搜索
              </Text>
              <View style={styles.recentRow}>
                {recent.map((r) => (
                  <TVFocusable
                    key={r}
                    id={`recent:${r}`}
                    onPress={() => {
                      setKeyword(r);
                      setSubmitted(r);
                      setPage(1);
                      doSearch(r, 1);
                    }}
                    style={[styles.recentItem, { backgroundColor: colors.surface }]}
                    testID={`tv-search-recent-${r}`}
                  >
                    <Text style={{ color: colors.foreground, fontSize: scale(17) }}>{r}</Text>
                  </TVFocusable>
                ))}
              </View>
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: scale(18) }]}>
              按 OK 聚焦上方搜索框，用电视键盘输入片名开始搜索
            </Text>
          )
        ) : loading ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: scale(18) }]}>正在搜索…</Text>
        ) : items.length === 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            没有找到「{submitted}」相关影片
          </Text>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontSize: scale(16) }]}>
              共 {total} 条结果
            </Text>
            <TVRow
              rowId="search-items"
              data={items}
              keyExtractor={(m) => String(m.id)}
              itemWidth={TV_CARD.width}
              itemHeight={TV_CARD.height}
              onItemPress={(m) =>
                nav.navigate('Detail', {
                  mediaId: m.id,
                  title: m.title,
                  from: 'search',
                  searchKeyword: submitted,
                  page,
                })
              }
              renderItem={(m) => (
                <MediaCard media={m} width={TV_CARD.width} height={TV_CARD.height} />
              )}
            />
            {totalPages > 1 ? (
              <View style={[styles.pager, { borderTopColor: colors.border }]}>
                <TVButton
                  id="search-prev"
                  label="上一页"
                  disabled={page <= 1}
                  onPress={() => {
                    const p = Math.max(1, page - 1);
                    setPage(p);
                    doSearch(submitted, p);
                  }}
                />
                <Text style={{ color: colors.foreground, fontSize: scale(18), marginHorizontal: tv(18) }}>
                  第 {page} / {totalPages} 页
                </Text>
                <TVButton
                  id="search-next"
                  label="下一页"
                  disabled={page >= totalPages}
                  onPress={() => {
                    const p = Math.min(totalPages, page + 1);
                    setPage(p);
                    doSearch(submitted, p);
                  }}
                />
              </View>
            ) : null}
          </>
        )}
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
  inputWrap: {
    flex: 1,
    marginHorizontal: tv(16),
  },
  inputContainer: {
    marginBottom: 0,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tv(20), paddingBottom: tv(40) },
  hint: { paddingVertical: tv(36), textAlign: 'center' },
  sectionTitle: { marginBottom: tv(12) },
  recentWrap: { marginTop: tv(10) },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap' },
  recentItem: {
    paddingHorizontal: tv(18),
    paddingVertical: tv(10),
    borderRadius: tv(8),
    marginRight: tv(12),
    marginBottom: tv(12),
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tv(20),
    paddingTop: tv(18),
    borderTopWidth: 1,
  },
});

export default SearchScreen;