import React from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVFocusable } from '../focus/TVFocusable';
import { TV_LAYOUT, tv } from '../theme/tokens';
import { hasAgreedPrivacy, agreePrivacy } from '../utils/privacyConsent';

export function PrivacyPolicyScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const nav = useNavigation<any>();

  const handleAgree = async () => {
    await agreePrivacy();
    nav.goBack();
  };

  const handleExit = () => {
    const { BackHandler } = require('react-native');
    try { BackHandler.exitApp(); } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="隐私政策" backId="privacy-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>OpenReel 隐私政策</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            本政策适用于 OpenReel Android/iOS/桌面端应用。更新日期：2026-10-27
          </Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            OpenReel 是一款本地优先的影视聚合播放客户端。所有业务数据仅存储在您的设备本地，不要求注册登录。
          </Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>1. 我们收集哪些信息</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 设备信息：仅用于应用正常运行，不会主动上传。</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 本地数据：片库、收藏、观看记录、搜索历史全部存储在您的设备本地。</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 配置信息：片源配置等仅保存在本地数据库中。</Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>2. 数据使用与存储</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 数据本地存储：所有业务数据均仅存在于您的设备上。</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 不上传服务器：本应用无自有内容分发服务器。</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 片源自备：应用不内置、不分发任何内容资源。</Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>3. 第三方服务</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>您添加的片源接口、海报、元数据等可能由第三方提供。</Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>4. 权限说明</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 网络权限：用于访问您自行配置的片源、检查更新。</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 存储权限：仅用于本地数据读写。</Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>5. 您的权利</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>• 数据控制：您可随时清空本地数据、删除片源或卸载应用。</Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>6. 隐私政策更新</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>本隐私政策可能随版本迭代更新，重大变更会在应用内提示。</Text>
        </View>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>7. 联系我们</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>可通过 GitHub 仓库 Issues 联系：https://github.com/roma007/OpenReel</Text>
        </View>
        <View style={styles.footerActions}>
          <TVFocusable id="privacy-policy-disagree" onPress={handleExit}>
            <View style={[styles.btn, { borderColor: colors.border, backgroundColor: hexToRgba(colors.surface, cardOpacity / 100) }]}>
              <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: scale(18) }]}>不同意并退出</Text>
            </View>
          </TVFocusable>
          <TVFocusable id="privacy-policy-agree" onPress={handleAgree}>
            <View style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.buttonPrimaryBg }]}>
              <Text style={[styles.btnText, { color: colors.buttonPrimaryText, fontSize: scale(18) }]}>同意并继续</Text>
            </View>
          </TVFocusable>
        </View>
        <Text style={[styles.footer, { color: colors.disabledForeground, fontSize: scale(14) }]}>Copyright © 2026 roma</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  card: { padding: tv(20), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(18) },
  cardTitle: { fontWeight: '700', marginBottom: tv(8) },
  para: { lineHeight: tv(27), marginTop: tv(8) },
  footer: { textAlign: 'center', paddingVertical: tv(6) },
  footerActions: {
    flexDirection: 'row',
    gap: tv(16),
    marginTop: tv(24),
    marginBottom: tv(18),
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btn: {
    borderWidth: 1,
    borderRadius: tv(10),
    paddingHorizontal: tv(40),
    paddingVertical: tv(16),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: tv(220),
  },
  btnPrimary: {
    borderWidth: 0,
  },
  btnText: {
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PrivacyPolicyScreen;
