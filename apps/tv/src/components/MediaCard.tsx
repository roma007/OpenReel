import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { Media } from '@openreel/core';
import { radius, useScaledFontSize } from '@openreel/expo-ui';
import { Star } from 'lucide-react-native';
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
  const s = useScaledFontSize();
  const posterHeight = Math.round(height * 0.76);

  return (
    <View
      style={[
        styles.card,
        {
          width,
          backgroundColor: '#ffffff',
        },
      ]}
    >
      <View
        style={[
          styles.posterContainer,
          {
            width,
            height: posterHeight,
            backgroundColor: '#ffffff',
          },
        ]}
      >
        {media.posterUrl ? (
          <PosterImage
            uri={media.posterUrl}
            style={styles.poster}
          />
        ) : (
          <View style={[styles.placeholder, styles.poster]}>
            <Text style={[styles.placeholderText, { color: '#9ca3af', fontSize: s(28) }]}>
              {media.title?.[0] || '?'}
            </Text>
          </View>
        )}

        {showRating && media.rating != null && media.rating > 0 && (
          <View style={styles.ratingBadgeContainer}>
            <Star size={11} color="#f59e0b" fill="#f59e0b" />
            <Text style={[styles.ratingBadgeText, { color: '#f59e0b', fontSize: s(11) }]}>
              {media.rating.toFixed(1)}
            </Text>
          </View>
        )}

        {(media.status === 'ONGOING' || media.status === 'PUBLISHED') && media.type !== 'VARIETY' && media.currentEpisodes && (
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, styles.badgePrimary]}>
              <Text style={[styles.badgeText, { fontSize: s(11) }]}>更新至第{media.currentEpisodes}集</Text>
            </View>
          </View>
        )}

        {(media.status === 'ONGOING' || media.status === 'PUBLISHED') && media.type === 'VARIETY' && media.remarks && (
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, styles.badgePrimary]}>
              <Text style={[styles.badgeText, { fontSize: s(11) }]}>{media.remarks}</Text>
            </View>
          </View>
        )}

        {media.status === 'COMPLETED' && media.type !== 'VARIETY' && media.totalEpisodes != null && (
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, styles.badgeMuted]}>
              <Text style={[styles.badgeText, { fontSize: s(11) }]}>完结 全{media.totalEpisodes}集</Text>
            </View>
          </View>
        )}

        {media.status === 'COMPLETED' && media.type !== 'VARIETY' && media.totalEpisodes == null && (
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, styles.badgeMuted]}>
              <Text style={[styles.badgeText, { fontSize: s(11) }]}>已完结</Text>
            </View>
          </View>
        )}

        {media.status === 'COMPLETED' && media.type === 'VARIETY' && media.remarks && (
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, styles.badgeMuted]}>
              <Text style={[styles.badgeText, { fontSize: s(11) }]}>{media.remarks}</Text>
            </View>
          </View>
        )}
      </View>

      <Text style={[styles.title, { color: '#111827', fontSize: s(14), lineHeight: s(18) }]} numberOfLines={1}>
        {media.title}
      </Text>

      {media.actors.length > 0 && (
        <Text style={[styles.actors, { color: '#6b7280', fontSize: s(12) }]} numberOfLines={1}>
          {media.actors.slice(0, 2).join(' / ')}
        </Text>
      )}

      {showYear && (
        <Text style={[styles.year, { color: '#6b7280', fontSize: s(12) }]}>
          {media.year} · {media.area || '未知'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  posterContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontWeight: 'bold',
  },
  title: {
    marginTop: 6,
    paddingHorizontal: 8,
    fontWeight: '600',
  },
  actors: {
    marginTop: 2,
    paddingHorizontal: 8,
  },
  year: {
    marginTop: 2,
    paddingHorizontal: 8,
  },
  badgeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  badgePrimary: {
    backgroundColor: 'rgba(115, 115, 115, 0.8)',
  },
  badgeMuted: {
    backgroundColor: 'rgba(115, 115, 115, 0.8)',
  },
  badgeText: {
    color: '#ffffff',
  },
  ratingBadgeContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  ratingBadgeText: {
    fontWeight: 'bold',
    marginLeft: 2,
  },
});

export default MediaCard;
