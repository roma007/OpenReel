import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { Media } from '@openreel/core';
import { useThemeColors, radius, useScaledFontSize } from '@openreel/expo-ui';
import PosterImage from './PosterImage';

/**
 * TV 海报卡片（2:3 海报 + 标题）。
 * 焦点环不在此绘制——由外层 TVFocusable 统一负责，保证列表/详情页焦点视觉一致。
 */
export interface MediaCardProps {
  media: Media;
  width?: number;
  height?: number;
  showYear?: boolean;
  showRating?: boolean;
}

export function MediaCard({
  media,
  width = 150,
  height = 224,
  showYear = true,
  showRating = true,
}: MediaCardProps) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const posterHeight = Math.round(height * 0.76);

  return (
    <View style={{ width }}>
      <View
        style={[
          styles.posterWrap,
          {
            width,
            height: posterHeight,
            backgroundColor: colors.surface,
            borderRadius: radius.sm,
          },
        ]}
      >
        <PosterImage
          uri={media.posterUrl}
          style={{ width: '100%', height: '100%', borderRadius: radius.sm }}
        />
        {showRating && media.rating != null && media.rating > 0 ? (
          <View style={[styles.ratingBadge, { backgroundColor: colors.background }]}>
            <Text style={[styles.ratingText, { color: colors.foreground, fontSize: scale(13) }]}>
              {media.rating.toFixed(1)}
            </Text>
          </View>
        ) : null}
        {media.totalEpisodes && media.totalEpisodes > 1 ? (
          <View style={[styles.epBadge, { backgroundColor: colors.background }]}>
            <Text style={[styles.epText, { color: colors.foreground, fontSize: scale(12) }]}>
              {media.currentEpisodes ?? 0}/{media.totalEpisodes}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.title, { color: colors.foreground, fontSize: scale(15) }]}
      >
        {media.title}
      </Text>
      {showYear ? (
        <Text style={[styles.sub, { color: colors.mutedForeground, fontSize: scale(13) }]}>
          {[media.year, media.genres?.[0]].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  posterWrap: {
    overflow: 'hidden',
  },
  title: {
    fontWeight: '600',
    marginTop: 8,
  },
  sub: {
    marginTop: 2,
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  ratingText: {
    fontWeight: '700',
  },
  epBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  epText: {
    fontWeight: '600',
  },
});

export default MediaCard;