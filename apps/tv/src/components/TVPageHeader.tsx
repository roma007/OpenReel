import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { TV_LAYOUT, tv } from '../theme/tokens';

/**
 * TV 页面统一头部：返回按钮 + 标题。
 * 遥控 BACK 键与界面「返回」按钮语义一致（都走 goBack，保持同一条返回路径）。
 */
export function TVPageHeader({
  title,
  backId = 'page-back',
  right,
  onBack,
  centerTitle = false,
}: {
  title: string;
  backId?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  /** 标题居中（对齐移动端页头；默认左侧标题，不影响其它页） */
  centerTitle?: boolean;
}) {
  const nav = useNavigation();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const handleBack = () => {
    if (onBack) onBack();
    else nav.goBack();
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.background, borderBottomColor: colors.border, paddingHorizontal: TV_LAYOUT.paddingX },
      ]}
    >
      <TVFocusable
        id={backId}
        onPress={handleBack}
        style={[styles.back, { backgroundColor: colors.surface }]}
        testID={`tv-${backId}`}
      >
        <Text style={{ color: colors.foreground, fontSize: scale(17), fontWeight: '600' }}>返回</Text>
      </TVFocusable>
      {centerTitle ? (
        <View style={styles.titleCenterWrap} pointerEvents="none">
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontSize: scale(23), fontWeight: '700' }}
          >
            {title}
          </Text>
        </View>
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground, fontSize: scale(23) }]}
        >
          {title}
        </Text>
      )}
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(14),
    borderBottomWidth: 1,
  },
  back: {
    paddingHorizontal: tv(22),
    paddingVertical: tv(9),
    borderRadius: tv(8),
  },
  title: { flex: 1, marginLeft: tv(18), fontWeight: '700' },
  titleCenterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: { flexDirection: 'row', alignItems: 'center' },
});

export default TVPageHeader;