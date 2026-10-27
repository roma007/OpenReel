import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
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

export default function PrivacyPolicyScreen({ navigation }: Props) {
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
    highlightRow: { flexDirection: 'row', alignItems: 'flex-start' },
    highlightIcon: {
      width: 36, height: 36, borderRadius: radius.lg,
      backgroundColor: colors.buttonPrimaryBg, alignItems: 'center', justifyContent: 'center',
    },
    highlightInfo: { flex: 1, marginLeft: 12 },
    highlightTitle: { fontSize: s(16), fontWeight: '600', color: colors.text },
    highlightDesc: { fontSize: s(13), color: colors.textSecondary, lineHeight: 19, marginTop: 6 },
    sectionTitle: { fontSize: s(15), fontWeight: '600', color: colors.text, marginBottom: 8 },
    para: { fontSize: s(13), color: colors.textSecondary, lineHeight: 20, marginTop: 10 },
    listItem: { fontSize: s(13), color: colors.textSecondary, lineHeight: 20, marginTop: 6 },
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
            <Text style={styles.title}>隐私政策</Text>
            <View style={styles.placeholder} />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.highlightRow}>
              <View style={styles.highlightIcon}>
                <ShieldCheck size={18} color="#fff" />
              </View>
              <View style={styles.highlightInfo}>
                <Text style={styles.highlightTitle}>OpenReel 隐私政策</Text>
                <Text style={styles.highlightDesc}>
                  本政策适用于 OpenReel Android/iOS/桌面端应用。
                </Text>
              </View>
            </View>
            <Text style={styles.para}>
              更新日期：2026-10-27
            </Text>
            <Text style={styles.para}>
              OpenReel（以下简称"本应用"）是一款本地优先的影视聚合播放客户端。我们高度重视您的隐私，秉持最小化原则，仅在必要范围内处理数据。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. 我们收集哪些信息</Text>
            <Text style={styles.listItem}>• 设备信息：仅用于应用正常运行所需的必要信息，不会主动上传。</Text>
            <Text style={styles.listItem}>• 本地数据：片库、收藏、观看记录、搜索历史等全部存储在您的设备本地。</Text>
            <Text style={styles.listItem}>• 配置信息：片源配置等仅保存在本地数据库中。</Text>
            <Text style={styles.para}>
              本应用不要求注册、登录，不收集姓名、手机号、邮箱等个人身份信息。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2. 数据使用与存储</Text>
            <Text style={styles.listItem}>• 数据本地存储：所有业务数据均仅存在于您的设备上。</Text>
            <Text style={styles.listItem}>• 不上传服务器：本应用无自有内容分发服务器，不会将您的片库、观看记录上传至第三方服务器。</Text>
            <Text style={styles.listItem}>• 片源自备：应用不内置、不分发任何内容资源，片源由您自行添加。</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>3. 第三方服务</Text>
            <Text style={styles.para}>
              您添加的片源接口、海报、元数据等可能由第三方提供。请您在使用时遵守相关第三方的服务条款与隐私政策。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>4. 权限说明</Text>
            <Text style={styles.listItem}>• 网络权限：用于访问您自行配置的片源、检查更新等必要网络请求。</Text>
            <Text style={styles.listItem}>• 存储权限（如需要）：仅用于本地数据读写，不会读取与本应用无关的文件。</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>5. 您的权利</Text>
            <Text style={styles.listItem}>• 数据控制：您可随时清空本地数据、删除片源或卸载应用。</Text>
            <Text style={styles.listItem}>• 自主决定：您可自主选择是否添加片源、是否使用相关功能。</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>6. 隐私政策更新</Text>
            <Text style={styles.para}>
              本隐私政策可能随版本迭代更新。重大变更会在应用内适当方式提示。您可随时在应用内「关于我们」页面查看最新版本的隐私政策。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>7. 联系我们</Text>
            <Text style={styles.para}>
              如有隐私相关疑问，可通过 GitHub 仓库 Issues 联系我们：https://github.com/roma007/OpenReel
            </Text>
          </View>

          <Text style={styles.footer}>Copyright © 2026 roma</Text>
        </View>
      </ScrollView>
    </BlurredBackground>
  );
}
