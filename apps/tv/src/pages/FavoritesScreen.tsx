import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Favorite, Media } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider } from '../useAppStore';
import { TVRow } from '../focus/TVRow';
import { focusRegistry } from '../focus/registry';
import { TVButton } from '../components/TVButton';
import MediaCard from '../components/MediaCard';
import { TV_CARD, TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** TV 收藏页：从 favorite 表取 mediaId 后回查 media 渲染海报墙 */
export function FavoritesScreen() {
  const nav = useNavigation<Nav>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const loadFavorites = useAppStore((s) => s.loadFavorites);
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await loadFavorites();
    const provider = getProvider();
    const favs = (await provider.getAllFavorites()) as Favorite[];
    const list = await Promise.all(
      favs.slice(0, 60).map((f) => provider.getMediaById(f.mediaId).catch(() => null)),
    );
    setItems(list.filter(Boolean) as Media[]);
    setLoading(false);
  }, [loadFavorites]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => focusRegistry.requestInitialFocus('fav-back'), 120);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX }]}>
        <TVButton id="fav-back" label="返回" onPress={() => nav.goBack()} testID="tv-favorites-back" />
        <Text style={[styles.topTitle, { color: colors.foreground, fontSize: scale(23) }]}>
          我的收藏
        </Text>
        <Text style={[styles.count, { color: colors.mutedForeground, fontSize: scale(16) }]}>
          {items.length}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: TV_LAYOUT.paddingX, paddingTop: tv(16) }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            正在加载…
          </Text>
        ) : items.length === 0 ? (
          <Text style={[styles.status, { color: colors.mutedForeground, fontSize: scale(18) }]}>
            还没有收藏内容
          </Text>
        ) : (
          <TVRow
            rowId="fav-items"
            data={items}
            keyExtractor={(m) => String(m.id)}
            itemWidth={TV_CARD.width}
            itemHeight={TV_CARD.height}
            onItemPress={(m) =>
              nav.navigate('Detail', { mediaId: m.id, title: m.title, from: 'favorite' })
            }
            renderItem={(m) => (
              <MediaCard media={m} width={TV_CARD.width} height={TV_CARD.height} />
            )}
          />
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
  topTitle: { marginLeft: tv(18), fontWeight: '700' },
  count: { marginLeft: tv(12) },
  scroll: { flex: 1 },
  status: { paddingVertical: tv(40), textAlign: 'center' },
});

export default FavoritesScreen;