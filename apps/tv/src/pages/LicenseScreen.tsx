import React from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TV_LAYOUT, tv } from '../theme/tokens';

/**
 * TV 版权声明页（纯文案，与手机端 AboutScreen → License 同源）。
 * TV 端差异：去掉图标（遥控下图标无信息量），改为标题 + 正文大字号单列排版。
 */
export function LicenseScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="版权声明" backId="license-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>
            内容与责任
          </Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            本应用不提供任何内容资源，片源由使用者自行添加。
          </Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            OpenReel 是一个播放客户端，不内置、不预置、不分发任何影视内容、播放源或资源文件。应用内出现的所有片源配置、影视元数据、海报与视频内容，均由使用者自行添加并自行管理。
          </Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            本应用仅提供采集、整理、播放与推荐等工具能力。片源的选择、使用及由此产生的一切后果，由使用者本人负责。请在所在地区法律允许的范围内使用。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>软件许可</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            本软件以 MIT 协议开源。软件代码的许可协议仅适用于代码本身，不涉及使用者自行添加的片源内容及第三方资源的权利归属。
          </Text>
          <Text style={[styles.para, { color: colors.foreground, fontSize: scale(17), fontWeight: '600' }]}>
            MIT License · Copyright © 2026 roma
          </Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            完整许可条款见仓库根目录的 LICENSE 文件。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>第三方资源</Text>
          <Text style={[styles.para, { color: colors.textSecondary, fontSize: scale(17) }]}>
            本应用使用的片源接口、海报与元数据服务均由第三方提供，其内容与权利归属由各自权利人所有。若你认为自己提供的接口或内容侵犯了他人权利，请通过仓库 Issue 与我们联系。
          </Text>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground, fontSize: scale(15) }]}>
          请在所在地区法律允许的范围内使用本应用。
        </Text>
        <Text style={[styles.footer, { color: colors.disabledForeground, fontSize: scale(14) }]}>
          Copyright © 2026 roma
        </Text>
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
});

export default LicenseScreen;