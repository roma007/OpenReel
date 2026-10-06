import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Clipboard,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import { tv } from '../theme/tokens';

export type TVKeypadMode = 'digits' | 'alnum' | 'url' | 'text';

/** 键盘元素 id 前缀，同时用作焦点监狱的作用域前缀 */
const KEYPAD_SCOPE = 'kp:';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SYMBOLS: Record<TVKeypadMode, string[]> = {
  digits: [],
  alnum: ['.', '-', '_', '#', '@'],
  url: ['.', ':', '/', '-', '_'],
  text: ['.', ',', '-', '_', '@', ':'],
};

/**
 * TV 应用内键盘（主输入通道）。
 *
 * 为什么必须自建（证据见 plan 第十节）：ATV 上「聚焦 TextInput 调起系统键盘」依赖设备自带
 * 可遥控 IME，实测本机 AVD `tvhome-tv` 带 LatinIME，但市面 ATV 盒子普遍不带 —— 把系统 IME
 * 当唯一输入通道等于赌设备。故数字/字母/URL 符号全部用可聚焦按键，任何 ATV 必然可用；
 * 同时保留「系统键盘」按钮作为设备有 IME 时的补充通道。
 *
 * 焦点：每个键都是 TVFocusable，同一行共享 rowId（左右不跳行）；打开时 pushScope 开启
 * 焦点监狱，方向键不会跳出键盘落到下层页面；Android BACK 优先关键盘而非退出页面。
 * 不透明度：面板底色为不透明 colors.background（AGENTS 弹窗不透明度规则）。
 */
export interface TVKeypadProps {
  visible: boolean;
  title: string;
  value: string;
  mode?: TVKeypadMode;
  maxLength?: number;
  /** 多行输入（粘贴 JSON 用）：值区域可滚动，并提供「⏎」换行键 */
  multiline?: boolean;
  hint?: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}

export function TVKeypad({
  visible,
  title,
  value,
  mode = 'alnum',
  maxLength,
  multiline,
  hint,
  onChange,
  onSubmit,
  onCancel,
}: TVKeypadProps) {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const inputRef = useRef<TextInput>(null);

  const [upper, setUpper] = useState(false);
  const [imeOpen, setImeOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // 打开时把焦点给到首个键，并开启焦点监狱（焦点不许掉回下层页面）
  useEffect(() => {
    if (!visible) return;
    setNote(null);
    const firstKey = `${KEYPAD_SCOPE}${mode}:0:0`;
    focusRegistry.pushScope(KEYPAD_SCOPE);
    focusRegistry.requestInitialFocus(firstKey);
    const t = setTimeout(() => focusRegistry.focusNode(firstKey), 80);
    return () => {
      clearTimeout(t);
      focusRegistry.popScope();
    };
  }, [visible, mode]);

  // 关闭时清掉 IME 状态，避免下次打开残留
  useEffect(() => {
    if (visible) return;
    setImeOpen(false);
    setNote(null);
  }, [visible]);

  // Android BACK：键盘打开时优先关键盘，而不是退出页面
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, onCancel]);

  const append = useCallback(
    (s: string) => {
      const next = maxLength && value.length + s.length > maxLength ? value : value + s;
      onChange(next);
    },
    [maxLength, onChange, value],
  );

  const backspace = useCallback(() => onChange(value.slice(0, -1)), [onChange, value]);
  const clear = useCallback(() => {
    onChange('');
    setNote('已清空');
  }, [onChange]);

  const paste = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (!text) {
        setNote('剪贴板为空');
        return;
      }
      // JSON 片单是多行文本，粘贴时不按 maxLength 截断（maxLength 仅约束逐键输入）
      onChange(multiline ? text : text.slice(0, maxLength));
      setNote(`已粘贴 ${text.length} 个字符`);
    } catch (e) {
      setNote(`读取剪贴板失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [maxLength, multiline, onChange]);

  const rows = useMemo(() => buildRows(mode, upper, multiline), [mode, upper, multiline]);

  const pressKey = useCallback(
    (k: string) => {
      if (k === '退格') return backspace();
      if (k === '清空') return clear();
      if (k === '粘贴') return void paste();
      if (k === '大写') return setUpper(true);
      if (k === '小写') return setUpper(false);
      if (k === '⏎') return append('\n');
      if (k === ' ') return append(' ');
      return append(k);
    },
    [append, backspace, clear, paste],
  );

  const openIme = useCallback(() => {
    setImeOpen(true);
    // 真实 TextInput 就在面板内，聚焦它即调起设备自带 IME（设备无 IME 时无副作用）
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  if (!visible) return null;

  // 必须用 Modal：TVKeypad 挂在字段容器内部，普通 absolute 定位会被父容器裁剪
  // （2026-10-05 实测：键盘只渲染在输入框那一小块区域，按键网格不可见）。
  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.background }]}>
        <View style={[styles.panel, { paddingHorizontal: tv(40), paddingVertical: tv(18) }]}>
        <Text style={{ color: colors.foreground, fontSize: scale(22), fontWeight: '700' }}>{title}</Text>
        {hint ? (
          <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(4) }}>{hint}</Text>
        ) : null}

        {/* 值显示区：既是系统 IME 的挂载点，也是粘贴结果的回显 */}
        <View style={[styles.valueBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChange}
            editable={imeOpen}
            multiline={multiline}
            showSoftInputOnFocus={imeOpen}
            onFocus={() => setImeOpen(true)}
            onBlur={() => setImeOpen(false)}
            placeholder={value ? '' : '（空）方向键选字符，按 OK 输入；或点「系统键盘」「粘贴」'}
            placeholderTextColor={colors.disabledForeground}
            style={[
              styles.valueText,
              {
                color: colors.foreground,
                fontSize: scale(17),
                minHeight: multiline ? tv(72) : tv(38),
              },
            ]}
            testID="tv-keypad-value"
          />
        </View>

        {note ? (
          <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(4) }}>{note}</Text>
        ) : null}

        <ScrollView style={styles.keys} contentContainerStyle={styles.keysContent} showsVerticalScrollIndicator={false}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((k, ki) => (
                <TVFocusable
                  key={`${ri}-${ki}`}
                  id={`${KEYPAD_SCOPE}${mode}:${ri}:${ki}`}
                  rowId={`${KEYPAD_SCOPE}${mode}:${ri}`}
                  onPress={() => pressKey(k)}
                  style={[styles.key, { backgroundColor: keyBg(k, colors.surface, colors.surfaceElevated, colors.buttonPrimaryBg) }]}
                  focusColor={colors.borderHighlight}
                  testID={`tv-keypad-${mode}-${ri}-${ki}`}
                >
                  <View style={styles.keyInner}>
                    <Text
                      style={{
                        color: k === '确定' ? colors.buttonPrimaryText : colors.foreground,
                        fontSize: scale(k.length > 1 ? 15 : 19),
                        fontWeight: '600',
                      }}
                    >
                      {k}
                    </Text>
                  </View>
                </TVFocusable>
              ))}
            </View>
          ))}

          {/* 底部动作行：取消 / 系统键盘 / 确定 */}
          <View style={styles.keyRow}>
            <TVFocusable
              id={`${KEYPAD_SCOPE}action:cancel`}
              rowId={`${KEYPAD_SCOPE}action`}
              onPress={onCancel}
              style={[styles.key, styles.keyWide, { backgroundColor: colors.surfaceElevated }]}
              focusColor={colors.borderHighlight}
              testID="tv-keypad-cancel"
            >
              <View style={styles.keyInner}>
                <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>取消</Text>
              </View>
            </TVFocusable>
            <TVFocusable
              id={`${KEYPAD_SCOPE}action:ime`}
              rowId={`${KEYPAD_SCOPE}action`}
              onPress={openIme}
              style={[styles.key, styles.keyWide, { backgroundColor: colors.surfaceElevated }]}
              focusColor={colors.borderHighlight}
              testID="tv-keypad-ime"
            >
              <View style={styles.keyInner}>
                <Text style={{ color: colors.foreground, fontSize: scale(16), fontWeight: '600' }}>系统键盘</Text>
              </View>
            </TVFocusable>
            <TVFocusable
              id={`${KEYPAD_SCOPE}action:ok`}
              rowId={`${KEYPAD_SCOPE}action`}
              onPress={() => onSubmit(value)}
              style={[styles.key, styles.keyWide, { backgroundColor: colors.buttonPrimaryBg }]}
              focusColor={colors.borderHighlight}
              testID="tv-keypad-ok"
            >
              <View style={styles.keyInner}>
                <Text style={{ color: colors.buttonPrimaryText, fontSize: scale(16), fontWeight: '700' }}>确定</Text>
              </View>
            </TVFocusable>
          </View>
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function keyBg(k: string, surface: string, elevated: string, primary: string): string {
  if (k === '确定') return primary;
  if (['退格', '清空', '粘贴', '大写', '小写'].includes(k)) return elevated;
  return surface;
}

/**
 * 按键布局：一律 10 列。
 *
 * 2026-10-05 实测修正：原布局数字用九宫格（4 行）、字母用 10 列（3 行）+ 功能行 + 空格行，
 * 共 10 行 × 48dp ≈ 480dp，加头部后超出 960×540 基准的可用高度，「取消/系统键盘/确定」
 * 被挤出屏幕（OCR 取证：最后一排只有「大写/粘贴/清空/退格」在 y≈506dp）。改为统一 10 列后
 * 共 7 行，方向键横向遍历也更短。
 */
function buildRows(mode: TVKeypadMode, upper: boolean, multiline?: boolean): string[][] {
  const rows: string[][] = [];
  rows.push(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  if (mode === 'digits') {
    rows.push(['清空', '退格']);
    return rows;
  }
  const letters = upper ? UPPER : LOWER;
  const syms = SYMBOLS[mode];
  rows.push(letters.slice(0, 10));
  rows.push(letters.slice(10, 20));
  rows.push([...letters.slice(20), ...syms.slice(0, 4)].slice(0, 10));
  rows.push([...syms.slice(4), upper ? '小写' : '大写', '粘贴', '清空', '退格']);
  rows.push(multiline ? ['空格', '⏎'] : ['空格']);
  return rows;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 24,
    justifyContent: 'center',
  },
  panel: { flex: 1 },
  valueBox: {
    marginTop: tv(12),
    borderWidth: 1,
    borderRadius: tv(10),
    paddingHorizontal: tv(16),
    paddingVertical: tv(10),
  },
  valueText: { padding: 0 },
  keys: { flex: 1, marginTop: tv(10) },
  keysContent: { paddingBottom: tv(12) },
  keyRow: { flexDirection: 'row', marginBottom: tv(5) },
  key: { flex: 1, minHeight: tv(36), marginRight: tv(6), borderRadius: tv(8) },
  keyWide: { flex: 2 },
  keyInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default TVKeypad;