import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SystemConfigService, type UserUsageType } from '@openreel/core';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore, getProvider } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVSelectRow, type TVSelectOption } from '../components/TVSelectRow';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { writePrefetchConcurrency } from '../services/cache';
import { tv } from '../theme/tokens';

const USAGE_OPTIONS: Array<{ type: UserUsageType; label: string }> = [
  { type: 'SEARCH_FIRST', label: '搜索优先' },
  { type: 'NEW_MOVIES', label: '追新电影' },
  { type: 'TV_SERIES', label: '追剧/综艺' },
];

/**
 * TV 使用偏好。
 *
 * 与手机端差异：滑杆在遥控端无法精细拖动，故「预读并发」改为单选（1/2/3/4），
 * 并在保存时同步写入原生读取的文件桥 cacheDir/prefetch_concurrency。
 */
export function UsagePreferencesScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const userUsageTypes = useAppStore((s) => s.userUsageTypes);
  const loadUserUsageTypes = useAppStore((s) => s.loadUserUsageTypes);
  const setUserUsageTypes = useAppStore((s) => s.setUserUsageTypes);

  const [prefetch, setPrefetch] = useState(4);

  useEffect(() => {
    loadUserUsageTypes();
    const svc = new SystemConfigService(getProvider());
    svc
      .getPlaybackConfig()
      .then((cfg: any) => {
        if (typeof cfg?.prefetchConcurrency === 'number') setPrefetch(cfg.prefetchConcurrency);
      })
      .catch(() => {});
  }, [loadUserUsageTypes]);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('usage-back'), 120);
    return () => clearTimeout(t);
  }, []);

  const applyPrefetch = async (n: number) => {
    setPrefetch(n);
    const svc = new SystemConfigService(getProvider());
    await svc.setPlaybackConfig({ prefetchConcurrency: n }).catch(() => {});
    // 同步原生文件桥，否则改了配置要重启才生效
    await writePrefetchConcurrency(n);
  };

  const toggleUsage = async (type: UserUsageType) => {
    const next = userUsageTypes.includes(type)
      ? userUsageTypes.filter((t) => t !== type)
      : [...userUsageTypes, type];
    // 与手机端一致：至少保留一项，避免推荐无任何依据
    if (next.length === 0) return;
    await setUserUsageTypes(next);
  };

  const prefetchOptions: TVSelectOption<number>[] = [
    { value: 1, label: '1（最省流量）' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4（默认）' },
    { value: 6, label: '6（最快）' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="使用偏好" backId="usage-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: tv(56) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: scale(19) }]}>
          我的使用方式（可多选）
        </Text>
        <View style={styles.usageRow}>
          {USAGE_OPTIONS.map((o) => {
            const active = userUsageTypes.includes(o.type);
            return (
              <TVFocusable
                key={o.type}
                id={`usage-type:${o.type}`}
                onPress={() => toggleUsage(o.type)}
                style={[
                  styles.usageChip,
                  { backgroundColor: active ? colors.buttonPrimaryBg : colors.surface },
                ]}
                testID={`tv-usage-${o.type}`}
              >
                <Text
                  style={{
                    color: active ? colors.buttonPrimaryText : colors.foreground,
                    fontSize: scale(17),
                    fontWeight: '600',
                  }}
                >
                  {o.label}
                </Text>
              </TVFocusable>
            );
          })}
        </View>

        <TVSelectRow<number>
          id="prefetch"
          label="分片预读并发"
          value={prefetch}
          options={prefetchOptions}
          onChange={(v) => applyPrefetch(v)}
        />

        <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: scale(15) }]}>
          电视盒子网络与存储通常弱于手机，建议 3–4。数值越大加载越快，但占用更多流量与临时空间。
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  sectionTitle: { fontWeight: '700', marginBottom: tv(12) },
  usageRow: { flexDirection: 'row', marginBottom: tv(18) },
  usageChip: {
    paddingHorizontal: tv(22),
    paddingVertical: tv(11),
    borderRadius: tv(8),
    marginRight: tv(14),
  },
  hint: { marginTop: tv(14), lineHeight: tv(24) },
});

export default UsagePreferencesScreen;