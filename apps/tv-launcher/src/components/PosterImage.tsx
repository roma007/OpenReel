import { useState, type ReactNode } from 'react';
import { Image, Text, View, type ImageStyle, type StyleProp } from 'react-native';
import { useThemeColors } from '@openreel/expo-ui';

interface PosterImageProps {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  placeholder?: ReactNode;
}

/**
 * 海报图：与手机端同语义（失败显示「无封面」），但 TV 端额外支持焦点态边框位置。
 * 不在此处画焦点环——焦点环统一由 TVFocusable 负责，避免双层描边。
 */
export default function PosterImage({ uri, style, placeholder }: PosterImageProps) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    const viewStyle = [style as any, { justifyContent: 'center', alignItems: 'center' }];
    if (placeholder) {
      return <View style={viewStyle}>{placeholder}</View>;
    }
    return (
      <View style={[...viewStyle, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 15, color: colors.mutedForeground }}>无封面</Text>
      </View>
    );
  }

  return <Image source={{ uri }} style={style} onError={() => setFailed(true)} />;
}