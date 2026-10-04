import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Cast } from 'lucide-react-native';
// roundedWhite 分支（播放页右侧竖排按钮栏）改用实心图标：
// lucide Cast 是描边风格（3 条开放 path + 1 条 line），无法靠 fill 变实心，故用 MaterialCommunityIcons 实心 cast。
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../themes/useThemeColors';
import { useCastStore } from '../../stores/castStore';
import { radius } from '../../themes/radiusTokens';
import { DevicePickerSheet } from './DevicePickerSheet';

interface Props {
  onDeviceSelect: (device: { id: string; name: string; protocol: string }) => void;
  onSearch?: () => void;
  style?: any;
  /** 白底圆样式：用于右侧竖排放大白底圆列（参照悬浮语音键） */
  roundedWhite?: boolean;
}

export function CastButton({ onDeviceSelect, onSearch, style, roundedWhite }: Props) {
  const colors = useThemeColors();
  const { isCasting, castDevice, availableDevices, isSearching } = useCastStore();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    onSearch?.();
    setSearched(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyState = searched && !isSearching && availableDevices.length === 0 && !isCasting;

  const handlePress = () => {
    onSearch?.();
    setPickerVisible(true);
  };

  const handleDeviceSelect = (device: { id: string; name: string; protocol: string }) => {
    setPickerVisible(false);
    onDeviceSelect(device);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        style={[styles.container, style]}
      >
        <View style={roundedWhite ? styles.iconWrapWhite : styles.iconWrap}>
          {/* 图标：roundedWhite 场景（播放页右侧竖排按钮栏）按用户要求用实心图标 + 去掉白圆底，
              故走 MaterialCommunityIcons 实心 cast；非 roundedWhite 场景（横屏全屏控制条）
              保持原 lucide 描边 Cast 不变，避免影响既有横屏观感。
              颜色：空设备#777 / 投屏中 #4ade80 / 常态 #fff（白圆底已去掉，必须用白色才能在深色视频上可见）。*/}
          {roundedWhite ? (
            <MaterialCommunityIcons
              name="cast"
              size={33}
              color={emptyState ? '#777' : isCasting ? '#4ade80' : '#fff'}
            />
          ) : (
            <Cast size={18} color={emptyState ? '#777' : isCasting ? '#4ade80' : '#fff'} />
          )}
          {isCasting && (
            <View style={[styles.dot, { backgroundColor: '#4ade80' }]} />
          )}
        </View>
        {isCasting && castDevice && (
          <Text style={[styles.deviceName, { color: '#4ade80' }]} numberOfLines={1}>
            {castDevice.name}
          </Text>
        )}
      </TouchableOpacity>
      <DevicePickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleDeviceSelect}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // roundedWhite（播放页右侧竖排按钮栏）：46×46 透明居中盒，仅占位居中。
  // 2026-10-04 按用户要求去掉白色圆底（原 backgroundColor rgba(255,255,255,0.92)），
  // 保留尺寸是为了与该栏其余按钮的图标盒（toolbarIconRound 46×46）对齐。
  // 同日按用户要求「图标放大、按钮不放大」：图标 22→33（1.5 倍，曾试 44 即 2 倍嫌过大），
  // 盒仍 46（33 < 46 不溢出），按钮仍 60×60。
  // 注意：投屏状态小绿点 dot 为 top:4/right:4 的绝对定位，图标放大后可能压在字形右上角，
  // 需真实投屏设备才能复现，暂未处理（见 .trae/documents/play_toolbar_icon_size_plan.md）。
  iconWrapWhite: {
    position: 'relative',
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deviceName: {
    fontSize: 11,
    maxWidth: 60,
  },
});
