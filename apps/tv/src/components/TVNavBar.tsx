import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { TV_LAYOUT, tv } from '../theme/tokens';

export interface TVNavItem {
  key: string;
  label: string;
  onPress: () => void;
  badge?: number;
}

/**
 * TV 顶部导航条。
 *
 * 遥控端没有「点击任意位置切换」的滑动习惯，导航必须是显式可聚焦项，
 * 且首项自动获得初始焦点（页面级 focusRegistry.requestInitialFocus）。
 */
export function TVNavBar({
  items,
  initialFocusKey,
  title,
  onSearch,
}: {
  items: TVNavItem[];
  initialFocusKey?: string;
  title?: string;
  /** 搜索入口：遥控端没有系统级搜索手势，必须显式可聚焦 */
  onSearch?: () => void;
}) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          paddingHorizontal: TV_LAYOUT.paddingX,
          height: TV_LAYOUT.navBarHeight,
        },
      ]}
    >
      <Text style={[styles.brand, { color: colors.foreground, fontSize: scale(22) }]}>
        {title || 'OpenReel'}
      </Text>
      <View style={styles.items}>
        {items.map((it) => (
          <TVFocusable
            key={it.key}
            id={`nav:${it.key}`}
            onPress={it.onPress}
            focusStyle={styles.focusedItem}
            testID={`tv-nav-${it.key}`}
            style={[styles.itemWrap, { backgroundColor: colors.surface }]}
          >
            <View style={styles.itemInner}>
              <Text style={[styles.itemText, { color: colors.foreground, fontSize: scale(17) }]}>
                {it.label}
              </Text>
              {it.badge != null && it.badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.error }]}>
                  <Text style={[styles.badgeText, { color: '#ffffff', fontSize: scale(13) }]}>
                    {it.badge > 99 ? '99+' : it.badge}
                  </Text>
                </View>
              ) : null}
            </View>
          </TVFocusable>
        ))}
      </View>
      {onSearch ? (
        <TVFocusable
          id="nav:search"
          onPress={onSearch}
          focusStyle={styles.focusedSearch}
          testID="tv-nav-search"
          style={[styles.searchBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Text style={[styles.searchIcon, { color: colors.foreground, fontSize: scale(20) }]}>⌕ 搜索</Text>
        </TVFocusable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  brand: {
    fontWeight: '800',
    letterSpacing: 1,
    marginRight: tv(16),
  },
  items: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBtn: {
    marginLeft: tv(10),
    paddingHorizontal: tv(14),
    paddingVertical: tv(8),
    borderRadius: tv(8),
    borderWidth: 1,
  },
  focusedSearch: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  searchIcon: {
    fontWeight: '600',
  },
  itemWrap: {
    paddingHorizontal: tv(12),
    paddingVertical: tv(8),
    marginRight: tv(6),
  },
  focusedItem: {
    backgroundColor: 'transparent',
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemText: {
    fontWeight: '600',
  },
  badge: {
    marginLeft: 6,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: tv(10),
    alignItems: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
});

export default TVNavBar;