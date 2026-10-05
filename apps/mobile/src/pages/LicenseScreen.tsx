import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ArrowLeft, Scale, ShieldCheck, CodeXml, Users } from 'lucide-react-native';
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

export default function LicenseScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const cardOpacity = useThemeStore((st) => st.cardOpacity);
  const cardBg = hexToRgba(colors.card, cardOpacity / 100);
  const s = useScaledFontSize();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: 50, paddingHorizontal: 15, paddingBottom: 15 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    title: { flex: 1, fontSize: s(18), fontWeight: 'bold', color: colors.text, textAlign: 'center' },
    placeholder: { width: 40 },
    content: { paddingHorizontal: 15, gap: 12, paddingTop: 15, paddingBottom: 30 },
    card: { backgroundColor: cardBg, borderRadius: radius.lg, padding: 16 },
    sectionTitle: { fontSize: s(15), fontWeight: '600', color: colors.text, marginBottom: 10 },
    highlightRow: { flexDirection: 'row', alignItems: 'flex-start' },
    highlightIcon: {
      width: 36, height: 36, borderRadius: radius.lg,
      backgroundColor: colors.buttonPrimaryBg, alignItems: 'center', justifyContent: 'center',
    },
    highlightInfo: { flex: 1, marginLeft: 12 },
    highlightTitle: { fontSize: s(16), fontWeight: '600', color: colors.text },
    highlightDesc: { fontSize: s(13), color: colors.textSecondary, lineHeight: 19, marginTop: 6 },
    para: { fontSize: s(13), color: colors.textSecondary, lineHeight: 20, marginTop: 10 },
    inlineRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
    inlineIcon: { width: 20, marginTop: 1 },
    inlineInfo: { flex: 1, marginLeft: 10 },
    inlineTitle: { fontSize: s(14), fontWeight: '600', color: colors.text },
    inlineDesc: { fontSize: s(13), color: colors.textSecondary, lineHeight: 20, marginTop: 3 },
    licenseLine: { fontSize: s(13), color: colors.textSecondary, lineHeight: 20, marginTop: 10 },
    footer: { textAlign: 'center', color: colors.disabledForeground, fontSize: s(12), paddingVertical: 10 },
  }), [colors, cardBg, s]);

  return (
    <BlurredBackground imageUrl={null}>
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Button variant="icon" size="sm" onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text} />
          </Button>
          <Text style={styles.title}>版权声明</Text>
          <View style={styles.placeholder} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.highlightRow}>
            <View style={styles.highlightIcon}>
              <Scale size={18} color="#fff" />
            </View>
            <View style={styles.highlightInfo}>
              <Text style={styles.highlightTitle}>内容与责任</Text>
              <Text style={styles.highlightDesc}>
                本应用不提供任何内容资源，片源由使用者自行添加。
              </Text>
            </View>
          </View>
          <Text style={styles.para}>
            OpenReel 是一个播放客户端，不内置、不预置、不分发任何影视内容、播放源或资源文件。
            应用内出现的所有片源配置、影视元数据、海报与视频内容，均由使用者自行添加并自行管理。
          </Text>
          <Text style={styles.para}>
            本应用仅提供采集、整理、播放与推荐等工具能力。片源的选择、使用及由此产生的一切后果，
            由使用者本人负责。请在所在地区法律允许的范围内使用。
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inlineRow}>
            <CodeXml size={18} color={colors.mutedForeground} style={styles.inlineIcon} />
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineTitle}>软件许可</Text>
              <Text style={styles.inlineDesc}>
                本软件以 MIT 协议开源。软件代码的许可协议仅适用于代码本身，
                不涉及使用者自行添加的片源内容及第三方资源的权利归属。
              </Text>
              <Text style={styles.licenseLine}>MIT License · Copyright © 2026 roma</Text>
              <Text style={styles.licenseLine}>
                完整许可条款见仓库根目录的 LICENSE 文件。
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.inlineRow}>
            <Users size={18} color={colors.mutedForeground} style={styles.inlineIcon} />
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineTitle}>第三方资源</Text>
              <Text style={styles.inlineDesc}>
                本应用使用的片源接口、海报与元数据服务均由第三方提供，其内容与权利归属由各自权利人所有。
                若你认为自己提供的接口或内容侵犯了他人权利，请通过仓库 Issue 与我们联系。
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.highlightRow}>
          <ShieldCheck size={14} color={colors.disabledForeground} />
          <Text style={[styles.para, { flex: 1, marginTop: 0, marginLeft: 6 }]}>
            请在所在地区法律允许的范围内使用本应用。
          </Text>
        </View>

        <Text style={styles.footer}>Copyright © 2026 roma</Text>
      </View>
    </ScrollView>
    </BlurredBackground>
  );
}