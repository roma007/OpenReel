import React from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchLatestRelease, compareVersions, pickApkAsset, getUpdateBadgeStore, type ReleaseAsset } from '@openreel/core';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVFocusable } from '../focus/TVFocusable';
import { TV_LAYOUT, tv } from '../theme/tokens';

/** 在线升级 APK 资产匹配前缀（CI 重命名：openreel-tv-release-v<version>.apk） */
const APK_ASSET_PREFIX = 'openreel-tv-release-v';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string; notes: string; asset: ReleaseAsset }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

/** TV 版本更新页：检查 + 下载 + 调起系统安装器。 */
export function UpdateScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const nav = useNavigation<any>();
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const badge = getUpdateBadgeStore();

  const currentVersion = Constants.expoConfig?.version ?? '';
  const [updateState, setUpdateState] = React.useState<UpdateState>({ phase: 'idle' });

  // 进入版本更新页即视为已读红点
  React.useEffect(() => {
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

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="版本更新" backId="update-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>版本更新</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            当前版本：{currentVersion || '…'}
            {updateState.phase === 'up-to-date' ? '　已是最新版本' : ''}
            {updateState.phase === 'checking' ? '　正在检查…' : ''}
            {updateState.phase === 'downloading' ? `　正在下载 ${updateState.percent}%` : ''}
            {updateState.phase === 'installing' ? '　下载完成，正在调起安装…' : ''}
            {updateState.phase === 'error' ? `　${updateState.message}` : ''}
          </Text>
          <View style={styles.btnRow}>
            {updateState.phase === 'available' ? (
              <TVFocusable
                id="update-download"
                onPress={() => handleDownloadAndInstall(updateState.asset)}
                style={[styles.btn, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100) }]}
                testID="tv-update-download"
              >
                <View style={styles.btnInner}>
                  <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>
                    下载安装 v{updateState.version}
                  </Text>
                </View>
              </TVFocusable>
            ) : (
              <TVFocusable
                id="update-check"
                onPress={handleCheckUpdate}
                disabled={updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'installing'}
                style={[styles.btn, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100) }]}
                testID="tv-update-check"
              >
                <View style={styles.btnInner}>
                  <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>检查更新</Text>
                </View>
              </TVFocusable>
            )}
          </View>
          {updateState.phase === 'downloading' ? (
            <View style={[styles.progressTrack, { backgroundColor: hexToRgba(colors.mutedForeground, 0.15) }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.buttonPrimaryBg, width: `${updateState.percent}%` }]} />
            </View>
          ) : null}
          {updateState.phase === 'available' && !!updateState.notes ? (
            <Text style={[styles.para, { color: colors.mutedForeground, fontSize: scale(15) }]} numberOfLines={6}>
              {updateState.notes}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  card: { padding: tv(20), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(18) },
  cardTitle: { fontWeight: '700', marginBottom: tv(6) },
  para: { lineHeight: tv(27), marginTop: tv(8) },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: tv(14) },
  btn: { paddingHorizontal: tv(20), paddingVertical: tv(10), borderRadius: tv(8), marginRight: tv(12), marginBottom: tv(8) },
  btnInner: { alignItems: 'center', justifyContent: 'center' },
  progressTrack: { marginTop: tv(14), height: tv(8), borderRadius: tv(4), overflow: 'hidden' },
  progressFill: { height: tv(8), borderRadius: tv(4) },
});

export default UpdateScreen;
