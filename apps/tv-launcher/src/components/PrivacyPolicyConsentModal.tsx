import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeColors, useScaledFontSize, hexToRgba } from '@openreel/expo-ui';
import { agreePrivacy } from '../utils/privacyConsent';
import { TVFocusable } from '../focus/TVFocusable';
import { tv } from '../theme/tokens';

interface Props {
  visible: boolean;
  onAgreed: () => void;
  onViewPolicy: () => void;
}

/**
 * TV 启动桌面端隐私政策同意弹窗。
 *
 * 与 apps/tv/src/components/PrivacyPolicyConsentModal.tsx 内容一致（同构组件）。
 * 对齐桌面端 PrivacyPolicyConsentModal 语义：
 *  - 未同意前全屏覆盖，阻止用户进入主界面
 *  - 复选框「我已阅读并理解」+ 同意/不同意按钮
 *  - 「查看完整隐私政策」链接可聚焦，点击跳转隐私政策页
 *  - 遥控 BACK 键在弹窗期间拦截（必须同意或退出）
 *
 * 弹窗面板背景使用 colors.card 实色（不透明），符合 UI 规范；
 * 遮罩层用半透明黑底（允许）。
 */
export function PrivacyPolicyConsentModal({ visible, onAgreed, onViewPolicy }: Props) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // TV 遥控 BACK 键在同意前拦截：必须同意或退出
    const { BackHandler } = require('react-native');
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible]);

  if (!visible) return null;

  const handleAgree = async () => {
    if (!checked) return;
    await agreePrivacy();
    onAgreed();
  };

  const handleExit = () => {
    const { BackHandler } = require('react-native');
    try { BackHandler.exitApp(); } catch {}
  };

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontSize: scale(26) }]}>隐私政策提示</Text>
        <Text style={[styles.content, { color: colors.textSecondary, fontSize: scale(19), lineHeight: scale(27) }]}>
          感谢您使用 OpenReel。为了更好地保护您的隐私，请您在使用前阅读并同意《隐私政策》。
        </Text>
        <Text style={[styles.content, { color: colors.textSecondary, fontSize: scale(18), lineHeight: scale(26), marginTop: tv(10) }]}>
          本应用为本地优先工具，不要求注册登录，片库、观看记录等数据仅存储在您的设备本地。
        </Text>

        <View style={styles.linkWrap}>
          <TVFocusable id="privacy-consent-view-policy" onPress={onViewPolicy}>
            <Text style={[styles.link, { color: colors.buttonPrimaryBg, fontSize: scale(18) }]}>查看完整隐私政策</Text>
          </TVFocusable>
        </View>

        <TouchableOpacity activeOpacity={0.7} onPress={() => setChecked((c) => !c)} style={styles.checkRow}>
          <View style={[styles.checkbox, checked && { backgroundColor: colors.buttonPrimaryBg }]}>
            {checked ? <Text style={{ color: '#fff', fontSize: scale(16) }}>✓</Text> : null}
          </View>
          <Text style={[styles.checkText, { color: colors.textSecondary, fontSize: scale(17) }]}>我已阅读并理解《OpenReel 隐私政策》</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TVFocusable
            id="privacy-consent-disagree"
            onPress={handleExit}
            disabled={!checked}
          >
            <View style={[styles.btn, { borderColor: colors.border, opacity: checked ? 1 : 0.5 }]}>
              <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: scale(18) }]}>不同意并退出</Text>
            </View>
          </TVFocusable>
          <TVFocusable
            id="privacy-consent-agree"
            onPress={handleAgree}
            disabled={!checked}
          >
            <View style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.buttonPrimaryBg, opacity: checked ? 1 : 0.5 }]}>
              <Text style={[styles.btnText, { color: colors.buttonPrimaryText, fontSize: scale(18) }]}>同意并继续</Text>
            </View>
          </TVFocusable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tv(80),
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 720,
    borderRadius: tv(14),
    padding: tv(36),
    borderWidth: 1,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: tv(16),
  },
  content: {
    textAlign: 'center',
    marginTop: tv(8),
  },
  linkWrap: {
    marginTop: tv(14),
    alignItems: 'center',
  },
  link: {
    fontWeight: '500',
    textAlign: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv(10),
    marginTop: tv(22),
    justifyContent: 'center',
  },
  checkbox: {
    width: tv(26),
    height: tv(26),
    borderRadius: tv(6),
    borderWidth: 2,
    borderColor: '#888',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    flex: 1,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: tv(16),
    marginTop: tv(28),
    justifyContent: 'center',
  },
  btn: {
    borderWidth: 1,
    borderRadius: tv(10),
    paddingHorizontal: tv(36),
    paddingVertical: tv(16),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: tv(200),
  },
  btnPrimary: {
    borderWidth: 0,
  },
  btnText: {
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PrivacyPolicyConsentModal;