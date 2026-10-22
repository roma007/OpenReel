import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { getUpdateBadgeStore } from '@openreel/core';
import { useThemeColors } from '../themes/useThemeColors';
import { hexToRgba } from '../themes/colorUtils';
import { radius } from '../themes/radiusTokens';
import { useScaledFontSize } from '../themes/useScaledFontSize';

/**
 * 移动端弱提醒：屏幕顶部居中浮动横幅，提示有新版本。
 * 点击进入版本更新页。可手动关闭。
 * 仅 Android 显示（iOS 不在在线升级范围）。
 */
export function UpdateHint() {
  const navigation = useNavigation<any>();
  const badge = getUpdateBadgeStore();
  const hasUpdate = badge((s) => s.hasUpdate);
  const pendingVersion = badge((s) => s.pendingVersion);
  const [dismissed, setDismissed] = useState(false);
  const colors = useThemeColors();
  const s = useScaledFontSize();

  if (Platform.OS !== 'android' || !hasUpdate || dismissed || !pendingVersion) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          badge.getState().markSeen();
          navigation.navigate('Update');
        }}
        style={[
          styles.banner,
          {
            backgroundColor: hexToRgba(colors.card, 0.95),
            borderColor: colors.border,
            borderRadius: radius.lg,
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.text }}>
            发现新版本 v{pendingVersion}
          </Text>
          <Text style={{ fontSize: s(11), color: colors.mutedForeground, marginTop: 2 }}>
            点击查看详情并升级
          </Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginHorizontal: 20,
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
