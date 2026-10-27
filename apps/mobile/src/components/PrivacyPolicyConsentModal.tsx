import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Platform } from 'react-native';
import { useThemeColors } from '../themes/useThemeColors';
import { radius } from '../themes/radiusTokens';
import { agreePrivacy } from '../utils/privacyConsent';

interface Props {
  visible: boolean;
  onAgreed: () => void;
  onViewPolicy: () => void;
}

export function PrivacyPolicyConsentModal({ visible, onAgreed, onViewPolicy }: Props) {
  const colors = useThemeColors();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // 首次同意前禁止返回，必须同意或退出
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  if (!visible) return null;

  const handleAgree = async () => {
    if (exiting) return;
    setExiting(true);
    await agreePrivacy();
    onAgreed();
  };

  const handleExit = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
    // iOS 无法直接退出应用，按平台常规做法仅拦截返回键
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="auto">
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>隐私政策提示</Text>
        <Text style={[styles.content, { color: colors.textSecondary }]}>
          感谢您使用 OpenReel。为了更好地保护您的隐私，请您在使用前阅读并同意《隐私政策》。
        </Text>
        <Text style={[styles.content, { color: colors.textSecondary, marginTop: 10 }]}>
          本应用为本地优先工具，不要求注册登录，片库、观看记录等数据仅存储在您的设备本地。
        </Text>
        <TouchableOpacity activeOpacity={0.7} onPress={onViewPolicy} style={styles.linkWrap}>
          <Text style={[styles.link, { color: colors.buttonPrimaryBg }]}>查看完整隐私政策</Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          我已阅读并理解《OpenReel 隐私政策》
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleExit}
            style={[styles.btn, { borderColor: colors.border }]}
          >
            <Text style={[styles.btnText, { color: colors.textSecondary }]}>不同意并退出</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleAgree}
            disabled={exiting}
            style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.buttonPrimaryBg }]}
          >
            <Text style={[styles.btnText, { color: '#fff' }]}>同意并继续</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  content: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  linkWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  link: {
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    borderWidth: 0,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
