import React from 'react';
import { Linking, Text, View, StyleSheet, ScrollView } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchLatestRelease, compareVersions, pickApkAsset, type ReleaseAsset } from '@openreel/core';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVFocusable } from '../focus/TVFocusable';
import { TV_LAYOUT, tv } from '../theme/tokens';

const REPO_URL = 'https://github.com/roma007/OpenReel';

/** 在线升级 APK 资产匹配前缀（CI 重命名：openreel-tv-release-v<version>.apk，避免与手机端同名冲突） */
const APK_ASSET_PREFIX = 'openreel-tv-release-v';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string; notes: string; asset: ReleaseAsset }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

const PRINCIPLES: Array<{ title: string; desc: string }> = [
  { title: '片源自备', desc: '应用不内置、不分发任何内容资源。片源由使用者自行添加和管理。' },
  { title: '数据本地', desc: '片库、观看记录、收藏全部只存在你自己的设备上，不经过任何服务器。' },
  { title: '开源共建', desc: '遵循 MIT 协议公开源代码，欢迎反馈问题与提交改进。' },
];

/**
 * TV 关于我们页。
 * 与手机端差异：源码链接在电视上无法点开浏览器，改为「显示仓库地址 + 可复制」
 * （复制走剪贴板，供用户在电脑上查看），版权声明入口仍是可聚焦行。
 */
export function AboutScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const nav = useNavigation<any>();
  // 卡片/行底遵循「卡片透明度」，与移动端 AboutScreen 一致（按钮不套，移动端按钮亦未套）
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const [copyNote, setCopyNote] = React.useState<string | null>(null);

  const currentVersion = Constants.expoConfig?.version ?? '';
  const [updateState, setUpdateState] = React.useState<UpdateState>({ phase: 'idle' });

  const handleCheckUpdate = async () => {
    setUpdateState({ phase: 'checking' });
    try {
      const release = await fetchLatestRelease();
      if (compareVersions(release.version, currentVersion) <= 0) {
        setUpdateState({ phase: 'up-to-date' });
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
      // 系统安装器已调起，回到应用后重置为 idle 允许重新检查
      setUpdateState({ phase: 'idle' });
    } catch (e) {
      setUpdateState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="关于我们" backId="about-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.brand, { color: colors.foreground, fontSize: scale(24) }]}>OpenReel</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary, fontSize: scale(18) }]}>
            把散落的片源，收进自己的片库。
          </Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            OpenReel 是一个自托管的影视聚合播放客户端。你把自己喜欢的片源接进来，它负责采集、刮削、归类、推荐，然后把片子收进一个属于你自己的片库。
          </Text>
          <Text style={[styles.para, { color: colors.mutedForeground, fontSize: scale(15) }]}>
            本页面为 Android TV 客户端版本。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>设计原则</Text>
          {PRINCIPLES.map((p) => (
            <View key={p.title} style={styles.pointRow}>
              <Text style={[styles.pointTitle, { color: colors.foreground, fontSize: scale(18) }]}>{p.title}</Text>
              <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>{p.desc}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>关于数据</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            桌面端、手机端与电视端共用同一套业务逻辑，但各自独立存储数据：任一端建立的片库不会自动同步到其它端，如需在电视端观看请在电视端自行采集一次。
          </Text>
        </View>

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
                id="about-download-update"
                onPress={() => handleDownloadAndInstall(updateState.asset)}
                style={[styles.btn, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100) }]}
                testID="tv-about-download-update"
              >
                <View style={styles.btnInner}>
                  <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>
                    下载安装 v{updateState.version}
                  </Text>
                </View>
              </TVFocusable>
            ) : (
              <TVFocusable
                id="about-check-update"
                onPress={handleCheckUpdate}
                disabled={updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'installing'}
                style={[styles.btn, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100) }]}
                testID="tv-about-check-update"
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

        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>源代码</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            本应用遵循 MIT 协议开源。遇到问题或有改进建议，欢迎到仓库提交 Issue 或 Pull Request。
          </Text>
          <Text style={[styles.mono, { color: colors.foreground, fontSize: scale(16) }]}>{REPO_URL}</Text>
          <View style={styles.btnRow}>
            <TVFocusable
              id="about-copy-repo"
              onPress={async () => {
                try {
                  await Clipboard.setString(REPO_URL);
                  setCopyNote('仓库地址已复制到剪贴板');
                } catch (e) {
                  setCopyNote(`复制失败：${e instanceof Error ? e.message : String(e)}`);
                }
              }}
              style={[styles.btn, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100) }]}
              testID="tv-about-copy-repo"
            >
              <View style={styles.btnInner}>
                <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>复制仓库地址</Text>
              </View>
            </TVFocusable>
            <TVFocusable
              id="about-open-repo"
              onPress={() => {
                Linking.openURL(REPO_URL).catch(() => setCopyNote('电视上无法打开浏览器，请复制地址到电脑查看'));
              }}
              style={[styles.btn, { backgroundColor: hexToRgba(colors.surfaceElevated, cardOpacity / 100) }]}
              testID="tv-about-open-repo"
            >
              <View style={styles.btnInner}>
                <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>尝试打开链接</Text>
              </View>
            </TVFocusable>
          </View>
          {copyNote ? (
            <Text style={[styles.para, { color: colors.mutedForeground, fontSize: scale(15) }]}>{copyNote}</Text>
          ) : null}
        </View>

        <TVFocusable
          id="about-to-license"
          onPress={() => nav.navigate('License')}
          style={[styles.row, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}
          testID="tv-about-to-license"
        >
          <View style={styles.rowMain}>
            <Text style={{ color: colors.foreground, fontSize: scale(18), fontWeight: '600' }}>查看版权声明</Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: scale(22) }}>›</Text>
        </TVFocusable>
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
  brand: { fontWeight: '800' },
  tagline: { marginTop: tv(4) },
  para: { lineHeight: tv(27), marginTop: tv(8) },
  pointRow: { marginTop: tv(12) },
  pointTitle: { fontWeight: '700' },
  mono: { marginTop: tv(12), fontFamily: 'monospace' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: tv(14) },
  btn: { paddingHorizontal: tv(20), paddingVertical: tv(10), borderRadius: tv(8), marginRight: tv(12), marginBottom: tv(8) },
  btnInner: { alignItems: 'center', justifyContent: 'center' },
  progressTrack: { marginTop: tv(14), height: tv(8), borderRadius: tv(4), overflow: 'hidden' },
  progressFill: { height: tv(8), borderRadius: tv(4) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(24),
    paddingVertical: tv(18),
    borderRadius: tv(10),
    borderWidth: 1,
  },
  rowMain: { flex: 1 },
});

export default AboutScreen;