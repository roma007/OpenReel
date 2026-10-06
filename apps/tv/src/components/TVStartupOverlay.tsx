import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import type { MigrationProgress, MigrationDiskError } from '@openreel/expo-db';
import { useThemeColors } from '@openreel/expo-ui';
import { TV_SCALE, tv } from '../theme/tokens';

/**
 * TV 端启动覆盖层。
 *
 * 与手机端 SplashOverlay 的差异（均为 TV 端有意为之）：
 *  - **不含全屏广告**：用户 2026-10-05 确认 TV 版砍掉广告浮层，电视端不做开屏广告。
 *  - 进度条更粗、字号更大（电视观看距离远），并直接展示阶段文案。
 *  - 磁盘空间不足引导页沿用手机端语义（共享 expoSqliteProvider 的 MigrationDiskError）。
 */
export interface TVStartupOverlayProps {
  ready: boolean;
  migrationProgress?: MigrationProgress | null;
  diskBlocked?: MigrationDiskError | null;
}

export function TVStartupOverlay({ ready, migrationProgress, diskBlocked }: TVStartupOverlayProps) {
  const colors = useThemeColors();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (ready || diskBlocked) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, ready, diskBlocked]);

  if (diskBlocked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.error, fontSize: tv(26) }]}>存储空间不足</Text>
        <Text style={[styles.body, { color: colors.foreground, fontSize: tv(19) }]}>
          无法完成数据库升级
        </Text>
        <Text style={[styles.bodyDim, { color: colors.mutedForeground, fontSize: tv(18) }]}>
          需要约 {format(diskBlocked.need)}，当前可用 {format(diskBlocked.free)}
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground, fontSize: tv(17) }]}>
          请清理电视存储空间后重新启动本应用
        </Text>
      </View>
    );
  }

  const percent = migrationProgress?.percent ?? null;
  const label = migrationProgress?.label ?? '正在启动…';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.Text style={[styles.logo, { color: colors.buttonPrimaryBg, opacity: pulse, fontSize: tv(40) }]}>
        OpenReel
      </Animated.Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontSize: tv(18) }]}>
        TV 版
      </Text>

      <View style={[styles.barTrack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: colors.buttonPrimaryBg,
              width: percent != null ? `${Math.max(2, Math.min(100, percent))}%` : '35%',
            },
          ]}
        />
      </View>

      <Text style={[styles.label, { color: colors.foreground, fontSize: tv(18) }]}>
        {label}
        {percent != null ? ` ${percent}%` : ''}
      </Text>
    </View>
  );
}

function format(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: TV_SCALE ? undefined : undefined,
  },
  logo: {
    fontWeight: '800',
    letterSpacing: 2,
  },
  subtitle: {
    marginTop: 8,
    letterSpacing: 6,
  },
  barTrack: {
    marginTop: 40,
    width: tv(560),
    height: tv(10),
    borderRadius: tv(5),
    borderWidth: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: tv(5),
  },
  label: {
    marginTop: 18,
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    marginBottom: 8,
  },
  bodyDim: {
    marginBottom: 20,
  },
  hint: {
    opacity: 0.8,
  },
});

export default TVStartupOverlay;