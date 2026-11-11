import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors } from '../themes/useThemeColors';
import { useThemeStore } from '../themes/store';
import { useScaledFontSize } from '../themes/useScaledFontSize';
import { radius } from '../themes/radiusTokens';
import { hexToRgba } from '../themes/colorUtils';
import { Button } from './ui/Button';
import { useAppStore } from '../useAppStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * 「去采集」引导：已添加视频源但片库为空时展示。
 *
 * 与「选择使用方式 / 添加视频源」同一规则：每次启动最多一次。
 * 立即采集走 store.collectAll（与首页「增量采集」同一套进度/任务体系）。
 */
export default function CollectGuideModal({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const s = useScaledFontSize();
  const navigation = useNavigation<any>();
  const collectAll = useAppStore((st) => st.collectAll);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.8)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 30,
        },
        container: {
          width: '100%',
          backgroundColor: colors.background,
          borderRadius: radius.xl,
          padding: 24,
        },
        title: {
          fontSize: s(20),
          fontWeight: 'bold',
          color: colors.text,
          textAlign: 'center',
          marginBottom: 8,
        },
        subtitle: {
          fontSize: s(13),
          color: colors.mutedForeground,
          textAlign: 'center',
          marginBottom: 20,
          lineHeight: 19,
        },
        btnRow: {
          gap: 10,
        },
        btnGap: { height: 10 },
        secondaryText: {
          textAlign: 'center',
          color: colors.mutedForeground,
          fontSize: s(13),
          paddingVertical: 6,
        },
      }),
    [colors, cardOpacity, s],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>去采集视频</Text>
          <Text style={styles.subtitle}>
            视频源已就绪，但片库还是空的。{'\n'}现在执行一次全量采集，把视频拉取到本地？
          </Text>
          <View style={styles.btnRow}>
            <Button
              onPress={() => {
                onClose();
                // 全量采集进度统一在任务列表页展示（数据源是 collect_task 逐页真值），
                // 先跳过去再启动，用户立刻能看到 FULL 任务行；返回键自然回首页。
                navigation.navigate('TaskList');
                void collectAll();
              }}
            >
              立即全量采集
            </Button>
            <View style={styles.btnGap} />
            <Button
              variant="secondary"
              onPress={() => {
                onClose();
                navigation.navigate('CollectGuide');
              }}
            >
              查看采集教程
            </Button>
            <View style={styles.btnGap} />
            <Pressable onPress={onClose} style={{ paddingVertical: 10 }}>
              <Text style={styles.secondaryText}>稍后再说</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
