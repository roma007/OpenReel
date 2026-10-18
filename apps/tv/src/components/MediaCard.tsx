import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { Media } from '@openreel/core';
import { radius, useScaledFontSize, useThemeColors, useThemeStore, hexToRgba } from '@openreel/expo-ui';
import { Star } from 'lucide-react-native';
import PosterImage from './PosterImage';

/**
 * TV 海报卡片（2:3 海报 + 标题）。
 * 焦点环不在此绘制——由外层 TVFocusable 统一负责，保证列表/详情页焦点视觉一致。
 *
 * 卡片底色遵循「外观设置」的卡片透明度配置（cardOpacity），与移动端 MediaCard 一致：
 * 卡片底 = hexToRgba(colors.card, opacity)，海报容器底 = hexToRgba(colors.surface, opacity*0.85)；
 * 文字随主题着色，保证半透明暗底上可读。
 */
export interface MediaCardProps {
  media: Media;
  width?: number;
  height?: number;
  showYear?: boolean;
  showRating?: boolean;
  /** 移动端 compact 迷你卡模式（首页小卡）：100 宽 / 海报 100×140 / 标题 s(12) 居中，外观与移动端完全一致 */
  compact?: boolean;
}

export function MediaCard({
  media,
  width = 150,
  height = 224,
  showYear = true,
  showRating = true,
  compact = false,
}: MediaCardProps) {
  const s = useScaledFontSize();
  const colors = useThemeColors();
  const cardOpacity = useThemeStore((state) => state.cardOpacity);
  const posterHeight = Math.round(height * 0.76);

  if (compact) {
    return (
      <View style={styles.compactCard}>
        <View style={styles.compactPosterWrap}>
          <View
            style={[
              styles.compactPoster,
              { backgroundColor: hexToRgba(colors.surface, (cardOpacity / 100) * 0.85) },
            ]}
          >
            {media.posterUrl ? (
              <PosterImage
                uri={media.posterUrl}
                style={styles.compactPosterImg}
                placeholder={
                  <Text style={[styles.placeholderText, { color: colors.disabledForeground, fontSize: s(28) }]}>
                    {media.title?.[0] || '?'}
                  </Text>
                }
              />
            ) : (
              <View style={[styles.compactPlaceholder, styles.compactPosterImg]}>
                <Text style={[styles.placeholderText, { color: colors.disabledForeground, fontSize: s(28) }]}>
                  {media.title?.[0] || '?'}
                </Text>
              </View>
            )}
          </View>
          {showRating && media.rating != null && media.rating > 0 && (
            <View style={styles.ratingBadgeContainer}>
              <Star size={11} color="#f59e0b" fill="#f59e0b" />
              <Text style={[styles.ratingBadgeText, { color: '#f59e0b', fontSize: s(11) }]}>
                {media.rating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.compactTitle, { color: colors.textSecondary, fontSize: s(12) }]} numberOfLines={1}>
          {media.title}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          width,
          backgroundColor: hexToRgba(colors.card, cardOpacity / 100),
        },
      ]}
    >
      <View
        style={[
          styles.posterContainer,
          {
            width,
            height: posterHeight,
            backgroundColor: hexToRgba(colors.surface, (cardOpacity / 100) * 0.85),
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

      <Text style={[styles.title, { color: colors.text, fontSize: s(14), lineHeight: s(18) }]} numberOfLines={1}>
        {media.title}
      </Text>

      {media.actors.length > 0 && (
        <Text style={[styles.actors, { color: colors.textSecondary, fontSize: s(12) }]} numberOfLines={1}>
          {media.actors.slice(0, 2).join(' / ')}
        </Text>
      )}

      {showYear && (
        <Text style={[styles.year, { color: colors.textSecondary, fontSize: s(12) }]}>
          {media.year} · {media.area || '未知'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // flex: 1 — 与移动端一致：卡片在外层（FlatList 列容器 / TVGrid 行）被 stretch 拉伸时，
    // 背景填满整行高度，保证同排卡片视觉等高（矮卡片内容顶部对齐、底部留白由背景承接）。
    // 间距不在此处加 marginBottom：卡片视觉底即容器底，行间距由 TVGrid/TVRow 的 gap 统一承担
    // （此前 marginBottom 14 与 gap 叠加成 30dp，且焦点环下边会因此悬空一节）。
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  posterContainer: {
    // 图片区只留上两角圆角（随卡片外框顶部圆角），下两角直角：
    // 卡片外框自身 radius.md + overflow hidden 已保证四角圆弧，图内不再重复圆角（2026-10-18 用户需求）
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
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
    paddingBottom: 8,
  },
  compactCard: {
    width: '100%',
  },
  compactPosterWrap: {
    position: 'relative',
  },
  compactPoster: {
    width: '100%',
    height: 140,
    // 图框即小卡的视觉主体：只留上两角圆角、下两角直角（2026-10-18 用户需求，与标准卡统一）
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    overflow: 'hidden',
  },
  compactPosterImg: {
    width: '100%',
    height: '100%',
  },
  compactPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactTitle: {
    marginTop: 4,
    textAlign: 'center',
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
