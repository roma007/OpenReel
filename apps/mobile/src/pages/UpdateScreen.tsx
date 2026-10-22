import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchLatestRelease, compareVersions, pickApkAsset, getUpdateBadgeStore, type ReleaseAsset } from '@openreel/core';
import { useThemeColors } from '../themes/useThemeColors';
import { useThemeStore } from '../themes/store';
import { useScaledFontSize } from '../themes/useScaledFontSize';
import { hexToRgba } from '../themes/colorUtils';
import { radius } from '../themes/radiusTokens';
import BlurredBackground from '../components/BlurredBackground';
import { Button } from '../components/ui/Button';

interface Props {
  navigation: any;
}

/** 在线升级 APK 资产匹配前缀（build.gradle 铁律命名：app-release-v<version>.apk） */
const APK_ASSET_PREFIX = 'app-release-v';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string; notes: string; asset: ReleaseAsset }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

export default function UpdateScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const cardOpacity = useThemeStore((st) => st.cardOpacity);
  const cardBg = hexToRgba(colors.card, cardOpacity / 100);
  const s = useScaledFontSize();
  const badge = getUpdateBadgeStore();

  const currentVersion = Constants.expoConfig?.version ?? '';
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' });

  // 进入版本更新页即视为已读红点
  useEffect(() => {
    badge.getState().markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateState({ phase: 'checking' });
    try {
      const release = await fetchLatestRelease();
      if (compareVersions(release.version, currentVersion) <= 0) {
        setUpdateState({ phase: 'up-to-date' });
        badge.getState().clear();
        return;
      }
      const asset = pickApkAsset(release, APK_ASSET_PREFIX);
      if (!asset) {
        setUpdateState({ phase: 'error', message: `新版本 v${release.version} 未找到安装包` });
        return;
      }
      setUpdateState({ phase: 'available', version: release.version, notes: release.notes, asset });
    } catch (e) {
      setUpdateState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDownloadAndInstall = async (asset: ReleaseAsset) => {
    try {
      setUpdateState({ phase: 'downloading', percent: 0 });
      const targetUri = `${FileSystem.documentDirectory}${asset.name}`;
      const resumable = FileSystem.createDownloadResumable(
        asset.downloadUrl,
        targetUri,
        {},
        (progress) => {
          const total = progress.totalBytesExpectedToWrite;
          if (total > 0) {
            const percent = Math.min(99, Math.round((progress.totalBytesWritten / total) * 100));
            setUpdateState((prev) => (prev.phase === 'downloading' ? { phase: 'downloading', percent } : prev));
          }
        },
      );
      const result = await resumable.downloadAsync();
      if (!result?.uri) throw new Error('下载失败');
      setUpdateState({ phase: 'installing' });
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1 | 268435456, // GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
      });
      setUpdateState({ phase: 'idle' });
    } catch (e) {
      setUpdateState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: 50, paddingHorizontal: 15, paddingBottom: 15 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    title: { flex: 1, fontSize: s(18), fontWeight: 'bold', color: colors.text, textAlign: 'center' },
    placeholder: { width: 40 },
    content: { paddingHorizontal: 15, gap: 12, paddingTop: 15, paddingBottom: 30 },
    card: { backgroundColor: cardBg, borderRadius: radius.lg, padding: 16 },
    sectionTitle: { fontSize: s(15), fontWeight: '600', color: colors.text, marginBottom: 12 },
    updateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    updateInfo: { flex: 1, fontSize: s(13), color: colors.textSecondary, lineHeight: 19 },
    updateHighlight: { color: colors.text },
    updateProgressTrack: {
      marginTop: 12, height: 6, borderRadius: 3,
      backgroundColor: hexToRgba(colors.mutedForeground, 0.15), overflow: 'hidden',
    },
    updateProgressFill: { height: 6, borderRadius: 3, backgroundColor: colors.buttonPrimaryBg },
    updateNotes: { fontSize: s(12), color: colors.textSecondary, lineHeight: 18, marginTop: 12 },
  }), [colors, cardBg, s]);

  return (
    <BlurredBackground imageUrl={null}>
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Button variant="icon" size="sm" onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text} />
          </Button>
          <Text style={styles.title}>版本更新</Text>
          <View style={styles.placeholder} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>版本更新</Text>
          <View style={styles.updateRow}>
            <Text style={styles.updateInfo}>
              当前版本：{currentVersion || '…'}
              {updateState.phase === 'up-to-date' && <Text style={styles.updateHighlight}>　已是最新版本</Text>}
              {updateState.phase === 'checking' && <Text>　正在检查…</Text>}
              {updateState.phase === 'downloading' && <Text>　正在下载 {updateState.percent}%</Text>}
              {updateState.phase === 'installing' && <Text>　下载完成，正在调起安装…</Text>}
              {updateState.phase === 'error' && <Text>　{updateState.message}</Text>}
            </Text>
            {updateState.phase === 'available' ? (
              <Button
                size="sm"
                leftIcon={<RefreshCw size={14} color={colors.buttonPrimaryText} />}
                onPress={() => handleDownloadAndInstall(updateState.asset)}
              >
                下载安装 v{updateState.version}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onPress={handleCheckUpdate}
                disabled={updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'installing'}
              >
                检查更新
              </Button>
            )}
          </View>
          {updateState.phase === 'downloading' && (
            <View style={styles.updateProgressTrack}>
              <View style={[styles.updateProgressFill, { width: `${updateState.percent}%` }]} />
            </View>
          )}
          {updateState.phase === 'available' && !!updateState.notes && (
            <Text style={styles.updateNotes} numberOfLines={6}>{updateState.notes}</Text>
          )}
        </View>
      </View>
    </ScrollView>
    </BlurredBackground>
  );
}
