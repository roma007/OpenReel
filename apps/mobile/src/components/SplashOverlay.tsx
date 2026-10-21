import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, Platform, BackHandler, Alert } from 'react-native';
import { getSplashStore } from '@openreel/core';
import type { MigrationProgress, MigrationDiskError } from '../db/expoSqliteProvider';

interface SplashOverlayProps {
  /** initApp 是否已完成（主应用可渲染、数据库就绪）。 */
  ready: boolean;
  /** 主键 INTEGER 升级进度：未就绪期间全屏展示进度条。 */
  migrationProgress?: MigrationProgress | null;
  /** 磁盘空间不足：全屏升级引导页（不执行迁移、不进入应用）。 */
  diskBlocked?: MigrationDiskError | null;
}

const LOGO_MS = 1500;
const FADE_OUT_MS = 400;

/**
 * 启动欢迎页覆盖层（移动端）。
 * - 欢迎页：logo 居中展示，至少 LOGO_MS；init 就绪后淡出进入主应用；
 * - 主应用渲染在其下层，首页数据在欢迎页展示期间后台加载。
 */
export function SplashOverlay({ ready, migrationProgress, diskBlocked }: SplashOverlayProps) {
  const phase = getSplashStore()((s) => s.phase);
  const setPhase = getSplashStore()((s) => s.setPhase);

  const [gone, setGone] = useState(false);
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const mountAtRef = useRef(Date.now());

  // logo：至少 LOGO_MS，且 init 就绪后开始淡出
  useEffect(() => {
    if (phase !== 'logo' || !ready) return;
    const until = mountAtRef.current + LOGO_MS;
    const delay = Math.max(0, until - Date.now());
    const t = setTimeout(() => {
      Animated.timing(logoOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(() => {
        setPhase('done');
      });
    }, delay);
    return () => clearTimeout(t);
  }, [phase, ready, logoOpacity, setPhase]);

  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => setGone(true), FADE_OUT_MS + 50);
    return () => clearTimeout(t);
  }, [phase]);

  if (gone) return null;

  const progress = migrationProgress?.percent ?? 0;
  const stageLabel = migrationProgress?.label ?? '';
  const gb = (n: number) => `${(n / 1073741824).toFixed(1)}GB`;

  const exitApp = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    } else {
      Alert.alert('提示', '请按 Home 键返回桌面并在后台关闭本应用，再安装旧版本继续使用。');
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {!diskBlocked && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.logoLayer, { opacity: logoOpacity }]}
          pointerEvents={phase === 'done' ? 'none' : 'auto'}
        >
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>OpenReel</Text>
        </Animated.View>
      )}

      {/* 数据库升级进度层：未就绪且迁移有进度时全屏展示（不透明，遮挡欢迎页） */}
      {!diskBlocked && !ready && migrationProgress && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <View style={styles.migrateLayer}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>OpenReel</Text>
            <Text style={styles.migrateDesc}>
              {stageLabel
                ? `正在升级数据库（${progress}%）：${stageLabel}`
                : '正在升级数据库，请勿关闭应用…'}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.trackPercent}>{progress}%</Text>
          </View>
        </View>
      )}

      {/* 磁盘空间不足升级引导页：不透明全屏，告知升级好处/为何需 2 倍空间/装回旧版指引 */}
      {diskBlocked && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <View style={styles.guideLayer}>
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>需要升级数据库，当前空间不足</Text>
              <View style={styles.guideBody}>
                <Text style={styles.guideParagraph}>
                  本次免费升级将带来：{'\n'}
                  ① 数据库体积大幅缩小（实测同量级数据约 5.9GB → 1.3GB）；{'\n'}
                  ② 数据读取更快更稳定；{'\n'}
                  ③ 修复观看历史、我的追剧错乱。升级全程自动完成，可中断续跑。
                </Text>
                <Text style={styles.guideParagraph}>
                  升级需要约 <Text style={styles.guideHighlight}>{gb(diskBlocked.need)}</Text> 临时空间：
                  迁移过程需同时容纳新旧两套数据的重建（约为数据库大小 ×2），属于一次性成本，升级完成后会自动回收。
                </Text>
                <Text style={[styles.guideParagraph, styles.guideHighlight]}>
                  当前：需要约 {gb(diskBlocked.need)}，可用 {gb(diskBlocked.free)}。
                </Text>
                <Text style={styles.guideParagraph}>
                  请先安装回旧版本继续正常使用；待腾出约 {gb(diskBlocked.need)} 空间后，再安装本新版本并打开，应用将自动完成升级。
                </Text>
              </View>
              <TouchableOpacity style={styles.guideButton} onPress={exitApp}>
                <Text style={styles.guideButtonText}>
                  {Platform.OS === 'android' ? '我知道了（退出应用）' : '我知道了'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logoLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0f19',
  },
  logo: {
    width: 112,
    height: 112,
    borderRadius: 24,
  },
  logoText: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1,
  },
  migrateLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0f19',
  },
  migrateDesc: {
    marginTop: 22,
    maxWidth: 300,
    textAlign: 'center',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },
  track: {
    marginTop: 18,
    width: 280,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  trackPercent: {
    marginTop: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  guideLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0f19',
    paddingHorizontal: 28,
  },
  guideCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    backgroundColor: '#141a2e',
    padding: 24,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  guideBody: {
    marginTop: 14,
  },
  guideParagraph: {
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.85)',
  },
  guideHighlight: {
    color: '#fbbf24',
  },
  guideButton: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  guideButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.95)',
  },
});
