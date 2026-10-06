import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { focusRegistry } from '../focus/registry';
import { useKidLockStore, getKidLockService } from '../stores/kidLockStore';
import { hashPin, randomSalt } from '../utils/kidLockCrypto';
import { TV_LAYOUT, tv } from '../theme/tokens';

type Action = 'setup' | 'enable' | 'disable' | null;

function validatePin(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return '请输入 4~6 位数字密码';
  return null;
}

/**
 * TV 儿童锁。
 *
 * 与手机端差异：
 *  - 手机端密码用 number-pad 软键盘；TV 端用 TVTextInput（digits 模式应用内键盘）。
 *  - Alert 提示改为页内状态文本（无触摸弹窗）。
 *  - 逻辑完全复用 core 的 KidLockService（同一 hash/salt 格式，桌面/手机/TV 互认）。
 */
export function KidLockScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const active = useKidLockStore((s) => s.active);
  const loaded = useKidLockStore((s) => s.loaded);
  const refresh = useKidLockStore((s) => s.refresh);
  const setActive = useKidLockStore((s) => s.setActive);

  const [hasPin, setHasPin] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [pinA, setPinA] = useState('');
  const [pinB, setPinB] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const svc = getKidLockService();

  useEffect(() => {
    void refresh();
    void svc.hasPin().then(setHasPin).catch(() => {});
    const t = setTimeout(() => focusRegistry.requestInitialFocus('kid-back'), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const runBackfillIfNeeded = useCallback(async () => {
    if (await svc.isBackfilled()) return;
    setBackfilling(true);
    setProgress(null);
    try {
      await svc.backfillKidSafe((done, total) => setProgress({ done, total }));
    } finally {
      setBackfilling(false);
    }
  }, [svc]);

  const saveAndEnable = useCallback(async () => {
    const err = validatePin(pinA);
    setError(err || '');
    if (err) return;
    if (pinA !== pinB) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      const salt = await randomSalt();
      const hash = await hashPin(pinA, salt);
      await svc.setPin(hash, salt);
      await svc.enable();
      await runBackfillIfNeeded();
      setHasPin(true);
      setActive(true);
      setAction(null);
      setPinA('');
      setPinB('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [pinA, pinB, runBackfillIfNeeded, setActive, svc]);

  const verifyAnd = useCallback(
    async (kind: 'enable' | 'disable') => {
      const err = validatePin(pinA);
      setError(err || '');
      if (err) return;
      setBusy(true);
      try {
        const salt = await svc.getSalt();
        const hash = await hashPin(pinA, salt);
        if (!(await svc.verifyPin(hash))) {
          setError('密码错误，请重试');
          return;
        }
        if (kind === 'enable') {
          await svc.enable();
          await runBackfillIfNeeded();
          setActive(true);
        } else {
          await svc.disable();
          setActive(false);
        }
        setPinA('');
        setAction(null);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [pinA, runBackfillIfNeeded, setActive, svc],
  );

  const openAction = (a: Action) => {
    setError('');
    setPinA('');
    setPinB('');
    setAction(a);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader title="儿童锁" backId="kid-back" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: scale(20) }]}>儿童锁</Text>
          <Text style={[styles.desc, { color: colors.textSecondary, fontSize: scale(16) }]}>
            开启后仅显示适合儿童观看的内容，关闭儿童模式需要输入密码。
          </Text>

          <View style={[styles.statusBox, { backgroundColor: colors.surfaceElevated }]}>
            {!loaded ? (
              <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>加载中…</Text>
            ) : active ? (
              <Text style={{ color: colors.success, fontSize: scale(16), fontWeight: '600' }}>
                儿童模式已开启：全站仅显示适合儿童的内容
              </Text>
            ) : hasPin ? (
              <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>儿童模式未开启</Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: scale(16) }}>尚未设置儿童锁密码</Text>
            )}
          </View>

          {backfilling ? (
            <View style={{ marginTop: tv(12) }}>
              <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>
                正在为现有内容打适龄标记，请稍候…
              </Text>
              {progress ? (
                <Text style={{ color: colors.mutedForeground, fontSize: scale(15), marginTop: tv(4) }}>
                  进度：{progress.done} / {progress.total}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.btnRow}>
            {!hasPin ? (
              <TVButton
                id="kid-setup-open"
                label="设置儿童锁密码"
                variant="primary"
                onPress={() => openAction('setup')}
                testID="tv-kid-setup-open"
              />
            ) : null}
            {hasPin && !active ? (
              <TVButton
                id="kid-enable-open"
                label="开启儿童模式"
                variant="primary"
                onPress={() => openAction('enable')}
                testID="tv-kid-enable-open"
              />
            ) : null}
            {active ? (
              <TVButton
                id="kid-disable-open"
                label="关闭儿童模式"
                onPress={() => openAction('disable')}
                testID="tv-kid-disable-open"
              />
            ) : null}
          </View>

          {action ? (
            <View style={[styles.form, { borderTopColor: colors.border }]}>
              {action === 'setup' ? (
                <>
                  <Text style={[styles.formLabel, { color: colors.foreground, fontSize: scale(17) }]}>
                    设置密码（4~6 位数字）
                  </Text>
                  <TVTextInput
                    id="kid-pin-a"
                    label="新密码"
                    value={pinA}
                    mode="digits"
                    maxLength={6}
                    secure
                    placeholder="4~6 位数字"
                    onChangeText={setPinA}
                    testID="tv-kid-pin-a"
                  />
                  <TVTextInput
                    id="kid-pin-b"
                    label="确认密码"
                    value={pinB}
                    mode="digits"
                    maxLength={6}
                    secure
                    placeholder="再次输入密码"
                    onChangeText={setPinB}
                    testID="tv-kid-pin-b"
                  />
                  <TVButton
                    id="kid-setup-submit"
                    label="保存并开启儿童模式"
                    variant="primary"
                    disabled={busy || backfilling}
                    onPress={saveAndEnable}
                    testID="tv-kid-setup-submit"
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.formLabel, { color: colors.foreground, fontSize: scale(17) }]}>
                    {action === 'enable' ? '输入密码开启儿童模式' : '输入密码关闭儿童模式'}
                  </Text>
                  <TVTextInput
                    id="kid-pin-verify"
                    label="密码"
                    value={pinA}
                    mode="digits"
                    maxLength={6}
                    secure
                    placeholder="请输入密码"
                    onChangeText={setPinA}
                    testID="tv-kid-pin-verify"
                  />
                  <TVButton
                    id="kid-verify-submit"
                    label={action === 'enable' ? '开启儿童模式' : '关闭儿童模式'}
                    variant="primary"
                    disabled={busy || backfilling}
                    onPress={() => verifyAnd(action)}
                    testID="tv-kid-verify-submit"
                  />
                </>
              )}

              {error ? (
                <Text style={{ color: colors.error, fontSize: scale(16), marginTop: tv(10) }}>{error}</Text>
              ) : null}
            </View>
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
  card: { padding: tv(20), borderRadius: tv(10), borderWidth: 1 },
  cardTitle: { fontWeight: '700' },
  desc: { lineHeight: tv(25), marginTop: tv(6) },
  statusBox: { marginTop: tv(12), padding: tv(12), borderRadius: tv(8) },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: tv(14) },
  form: { borderTopWidth: 1, marginTop: tv(16), paddingTop: tv(14) },
  formLabel: { fontWeight: '600', marginBottom: tv(8) },
});

export default KidLockScreen;