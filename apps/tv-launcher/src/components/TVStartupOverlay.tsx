import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { MigrationProgress, MigrationDiskError } from '@openreel/expo-db';
import { useThemeColors } from '@openreel/expo-ui';
import { TV_SCALE, tv } from '../theme/tokens';

/**
 * TV 端启动覆盖层。
 *
 * 与手机端 SplashOverlay 保持一致：
 *  - 首屏只显示 APP 小 logo（与移动端图标一致的绿色方块，112×112 圆角）+ 下方 OpenReel TV桌面版。
 *  - 仅在数据库升级时展示阶段文案与进度条。
 *  - **不含全屏广告**：用户 2026-10-05 确认 TV 版砍掉广告浮层，电视端不做开屏广告。
 *  - 磁盘空间不足引导页沿用手机端语义（共享 expoSqliteProvider 的 MigrationDiskError）。
 */
export interface TVStartupOverlayProps {
  ready: boolean;
  migrationProgress?: MigrationProgress | null;
  diskBlocked?: MigrationDiskError | null;
}

export function TVStartupOverlay({ migrationProgress, diskBlocked }: TVStartupOverlayProps) {
  const colors = useThemeColors();

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
  const label = migrationProgress?.label ?? '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* logo 固定在屏幕中心，与原生启动页的位置/尺寸一致；文字在其下方淡入，避免 logo 位移 */}
      <View style={styles.centerAnchor}>
        <View style={styles.logoBox} />
        <Text style={styles.logoText}>OpenReel TV桌面版</Text>

        {percent != null && (
          <>
            <View style={[styles.barTrack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: colors.buttonPrimaryBg,
                    width: `${Math.max(2, Math.min(100, percent))}%`,
                  },
                ]}
              />
            </View>

            <Text style={[styles.label, { color: colors.foreground, fontSize: tv(18) }]}>
              {label}
              {` ${percent}%`}
            </Text>
          </>
        )}
      </View>
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
  centerAnchor: {
    position: 'absolute',
    top: '50%',
    marginTop: -56,
    alignItems: 'center',
  },
  logoBox: {
    width: 112,
    height: 112,
    borderRadius: 24,
    backgroundColor: 'rgba(0,255,0,0.5)',
  },
  logoText: {
    marginTop: tv(14),
    fontSize: tv(20),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1,
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