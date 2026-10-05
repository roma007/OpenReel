import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { ArrowLeft, Info, GitPullRequest, Scale, FolderTree, ShieldCheck, CodeXml, ChevronRight } from 'lucide-react-native';
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

const REPO_URL = 'https://github.com/roma007/OpenReel';

const PRINCIPLES = [
  {
    icon: FolderTree,
    title: '片源自备',
    desc: '应用不内置、不分发任何内容资源。片源由使用者自行添加和管理。',
  },
  {
    icon: ShieldCheck,
    title: '数据本地',
    desc: '片库、观看记录、收藏全部只存在你自己的设备上，不经过任何服务器。',
  },
  {
    icon: GitPullRequest,
    title: '开源共建',
    desc: '遵循 MIT 协议公开源代码，欢迎反馈问题与提交改进。',
  },
];

export default function AboutScreen({ navigation }: Props) {
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
    sectionTitle: { fontSize: s(15), fontWeight: '600', color: colors.text, marginBottom: 12 },
    brandRow: { flexDirection: 'row', alignItems: 'flex-start' },
    brandIcon: {
      width: 36, height: 36, borderRadius: radius.lg,
      backgroundColor: colors.buttonPrimaryBg, alignItems: 'center', justifyContent: 'center',
    },
    brandInfo: { flex: 1, marginLeft: 12 },
    brandName: { fontSize: s(16), fontWeight: '600', color: colors.text },
    tagline: { fontSize: s(13), color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
    intro: { fontSize: s(13), color: colors.textSecondary, lineHeight: 20, marginTop: 10 },
    principle: { flexDirection: 'row', alignItems: 'flex-start' },
    principleIcon: { width: 22, marginTop: 1 },
    principleInfo: { flex: 1, marginLeft: 10 },
    principleTitle: { fontSize: s(14), fontWeight: '600', color: colors.text },
    principleDesc: { fontSize: s(13), color: colors.textSecondary, lineHeight: 19, marginTop: 3 },
    principleSpacer: { height: 14 },
    platformRow: { flexDirection: 'row', alignItems: 'center' },
    platformText: { fontSize: s(14), fontWeight: '500', color: colors.text },
    platformDetail: { fontSize: s(13), color: colors.textSecondary, marginTop: 2 },
    note: { fontSize: s(12), color: colors.textSecondary, lineHeight: 18, marginTop: 12 },
    repoLink: { flexDirection: 'row', alignItems: 'center' },
    repoText: { fontSize: s(13), color: colors.text, marginLeft: 8, flex: 1 },
    licenseEntry: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: cardBg, borderRadius: radius.lg, paddingVertical: 14,
    },
    licenseText: { fontSize: s(14), color: colors.text, marginHorizontal: 6 },
  }), [colors, cardBg, s]);

  return (
    <BlurredBackground imageUrl={null}>
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Button variant="icon" size="sm" onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text} />
          </Button>
          <Text style={styles.title}>关于我们</Text>
          <View style={styles.placeholder} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Info size={18} color="#fff" />
            </View>
            <View style={styles.brandInfo}>
              <Text style={styles.brandName}>OpenReel</Text>
              <Text style={styles.tagline}>把散落的片源，收进自己的片库。</Text>
            </View>
          </View>
          <Text style={styles.intro}>
            OpenReel 是一个自托管的影视聚合播放客户端。你把自己喜欢的片源接进来，
            它负责采集、刮削、归类、推荐，然后把片子收进一个属于你自己的片库。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>设计原则</Text>
          {PRINCIPLES.map((p, i) => (
            <View key={p.title}>
              {i > 0 && <View style={styles.principleSpacer} />}
              <View style={styles.principle}>
                <p.icon size={18} color={colors.mutedForeground} style={styles.principleIcon} />
                <View style={styles.principleInfo}>
                  <Text style={styles.principleTitle}>{p.title}</Text>
                  <Text style={styles.principleDesc}>{p.desc}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>关于数据</Text>
          <Text style={styles.note}>
            桌面端与移动端共用同一套业务逻辑，但各自独立存储数据：
            桌面端建立的片库不会自动同步到手机，如需在手机上观看请在手机端自行采集一次。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>源代码</Text>
          <Text style={styles.note}>
            本应用遵循 MIT 协议开源。遇到问题或有改进建议，欢迎到仓库提交 Issue 或 Pull Request。
          </Text>
          <TouchableOpacity
            style={[styles.repoLink, { marginTop: 10 }]}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(REPO_URL)}
          >
            <GitPullRequest size={16} color={colors.text} />
            <Text style={styles.repoText}>{REPO_URL}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.licenseEntry}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('License')}
        >
          <Scale size={18} color={colors.textSecondary} />
          <Text style={styles.licenseText}>查看版权声明</Text>
          <ChevronRight size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </ScrollView>
    </BlurredBackground>
  );
}