import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors, useScaledFontSize, useThemeStore, hexToRgba } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { TVFocusable } from '../focus/TVFocusable';
import { showTVToast } from '../components/TVToast';
import { focusRegistry } from '../focus/registry';
import { TV_LAYOUT, tv } from '../theme/tokens';

interface FieldDef {
  key: string;
  label: string;
  desc: string;
  min: number;
  max: number;
  fallback: number;
}

const BASIC_FIELDS: FieldDef[] = [
  { key: 'minYear', label: '最小年份', desc: '只采集该年份及以后的影片', min: 1900, max: 2100, fallback: 2025 },
  { key: 'retryTimes', label: '失败重试次数', desc: '单个影片刮削失败后的重试次数', min: 0, max: 10, fallback: 3 },
  { key: 'pageSize', label: '每页大小', desc: '向源站请求的每页条数', min: 5, max: 100, fallback: 20 },
];

const LIMIT_FIELDS: FieldDef[] = [
  { key: 'maxPages', label: '全量最大页数', desc: '单次全量采集最多翻多少页', min: 1, max: 10000, fallback: 10 },
  { key: 'incrementalMaxPages', label: '增量最大页数', desc: '单次增量采集最多翻多少页', min: 1, max: 10000, fallback: 100 },
  {
    key: 'maxIncrementalHours',
    label: '增量最大追溯（小时）',
    desc: '增量只取该小时数内更新的内容',
    min: 0,
    max: 87600,
    fallback: 720,
  },
  { key: 'concurrency', label: '并发数量', desc: '同时处理的采集任务数', min: 1, max: 20, fallback: 6 },
];

type Draft = Record<string, string>;

function toDraft(cfg: Record<string, any> | null): Draft {
  const pick = (k: string, fb: number) => (cfg ? String(cfg[k] ?? fb) : String(fb));
  return {
    minYear: pick('minYear', 2025),
    retryTimes: pick('retryTimes', 3),
    pageSize: pick('pageSize', 20),
    maxPages: pick('maxPages', 10),
    incrementalMaxPages: pick('incrementalMaxPages', 100),
    maxIncrementalHours: pick('maxIncrementalHours', 720),
    concurrency: pick('concurrency', 6),
  };
}

const ALL_FIELDS: FieldDef[] = [...BASIC_FIELDS, ...LIMIT_FIELDS];

/** 文本是否为可解析的纯数字（避免把输入中间态/空串写库） */
const isDigits = (v: string | undefined) => /^\d+$/.test((v ?? '').trim());

/** 数值字段草稿是否全部可解析（缺一即视为输入中间态，暂不写库） */
const draftReady = (d: Draft) => ALL_FIELDS.every((f) => isDigits(d[f.key]));

/** 草稿 → 落库载荷（范围收敛语义与旧「保存配置」按钮一致） */
function buildPayload(d: Draft, autoOnStartup: boolean) {
  const num = (k: string, min: number, max: number, fallback: number) => {
    const n = parseInt(d[k] ?? '', 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    minYear: num('minYear', 1900, 2100, 2025),
    retryTimes: num('retryTimes', 0, 10, 3),
    pageSize: num('pageSize', 5, 100, 20),
    maxPages: num('maxPages', 1, 10000, 10),
    incrementalMaxPages: num('incrementalMaxPages', 1, 10000, 100),
    maxIncrementalHours: num('maxIncrementalHours', 0, 87600, 720),
    concurrency: num('concurrency', 1, 20, 6),
    autoOnStartup,
  };
}

/**
 * TV 采集配置页。
 *
 * 与手机端差异：
 *  - 手机端是 TextInput 数字键盘；TV 端全部改为 TVTextInput（digits 模式的应用内键盘）。
 *  - 自动采集区：TV 端**不启动后台调度**（用户明确砍掉），但开关/间隔照旧保存到库，
 *    并在页面上明示「电视端不会自动执行」，避免界面承诺与实际行为不符。
 */
export function CollectConfigScreen() {
  const colors = useThemeColors();
  // 卡片/面板底遵循「卡片透明度」，与移动端同名页面一致
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const scale = useScaledFontSize();

  const collectConfig = useAppStore((s) => s.collectConfig);
  const loadCollectConfig = useAppStore((s) => s.loadCollectConfig);
  const updateCollectConfig = useAppStore((s) => s.updateCollectConfig);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [autoOnStartup, setAutoOnStartup] = useState(false);
  const [savedTip, setSavedTip] = useState(false);
  // 即时保存：本地 state 为唯一编辑源，store 仅在首次水合时写入本地，
  // 避免写库后的 loadCollectConfig 回写打断正在输入的内容
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCollectConfig().catch(() => {});
    const t = setTimeout(() => focusRegistry.requestInitialFocus('cfg-back'), 120);
    return () => clearTimeout(t);
  }, [loadCollectConfig]);

  useEffect(() => {
    if (!collectConfig) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setDraft(toDraft(collectConfig as unknown as Record<string, any>));
    setAutoOnStartup(!!collectConfig.autoOnStartup);
  }, [collectConfig]);

  // 清理未触发的 debounce / 提示定时器
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
  }, []);

  const parsed = useMemo(() => {
    const out: Record<string, number> = {};
    const all = [...BASIC_FIELDS, ...LIMIT_FIELDS];
    for (const f of all) {
      const n = parseInt(draft[f.key] ?? '', 10);
      out[f.key] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.fallback;
    }
    return out;
  }, [draft]);

  const clampWarn = useMemo(() => {
    const all = [...BASIC_FIELDS, ...LIMIT_FIELDS];
    return all.filter((f) => String(parsed[f.key]) !== (draft[f.key] ?? '').trim()).map((f) => f.label);
  }, [draft, parsed]);

  /** 即时保存唯一写入口：落库 + 轻提示（页面已无手动保存按钮） */
  const persist = useCallback(async (d: Draft, startup: boolean) => {
    try {
      await updateCollectConfig(buildPayload(d, startup));
      setSavedTip(true);
      if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
      tipTimerRef.current = setTimeout(() => setSavedTip(false), 2000);
    } catch (e) {
      showTVToast(`保存失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, [updateCollectConfig]);

  /** 数值输入：500ms debounce 写库；输入中间态（空串/非纯数字）暂不写库 */
  const scheduleSave = useCallback((d: Draft, startup: boolean) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(d, startup);
    }, 500);
  }, [persist]);

  /** 立即写库（开关 / 恢复默认参数） */
  const saveNow = useCallback((d: Draft, startup: boolean) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void persist(d, startup);
  }, [persist]);

  const updateField = (key: string, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (!draftReady(next)) return;
    scheduleSave(next, autoOnStartup);
  };

  const toggleAutoOnStartup = () => {
    const next = !autoOnStartup;
    setAutoOnStartup(next);
    saveNow(draft, next);
  };

  const resetDefaults = () => {
    const next: Draft = {
      minYear: '2025',
      retryTimes: '3',
      pageSize: '20',
      maxPages: '100',
      incrementalMaxPages: '100',
      maxIncrementalHours: '720',
      concurrency: '6',
    };
    setDraft(next);
    saveNow(next, autoOnStartup);
  };

  const renderField = (f: FieldDef) => (
    <TVTextInput
      key={f.key}
      id={`cfg:${f.key}`}
      label={f.label}
      value={draft[f.key] ?? ''}
      mode="digits"
      maxLength={8}
      placeholder={`${f.fallback}（${f.min}~${f.max}）`}
      hint={`${f.desc}；超范围将自动截到 ${f.min}~${f.max}`}
      onChangeText={(v) => updateField(f.key, v)}
      testID={`tv-cfg-${f.key}`}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader
        title="采集配置"
        backId="cfg-back"
        right={savedTip ? <Text style={{ color: colors.mutedForeground, fontSize: scale(15) }}>已自动保存</Text> : null}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.section, { color: colors.foreground, fontSize: scale(19) }]}>基本设置</Text>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          {BASIC_FIELDS.map(renderField)}
        </View>

        <Text style={[styles.section, { color: colors.foreground, fontSize: scale(19) }]}>采集限制</Text>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          {LIMIT_FIELDS.map(renderField)}
        </View>

        <Text style={[styles.section, { color: colors.foreground, fontSize: scale(19) }]}>启动时自动采集</Text>
        <View style={[styles.card, { backgroundColor: hexToRgba(colors.surface, cardOpacity / 100), borderColor: colors.border }]}>
          <TVFocusable
            id="cfg:autoOnStartup"
            onPress={toggleAutoOnStartup}
            style={[styles.switchRow, { borderColor: colors.border }]}
            testID="tv-cfg-auto-startup"
          >
            <View style={styles.switchInfo}>
              <Text style={{ color: colors.foreground, fontSize: scale(17), fontWeight: '600' }}>启动时立即采集</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(3) }}>
                APP 启动后延迟数秒自动执行一次增量采集
              </Text>
            </View>
            <View
              style={[
                styles.switchBox,
                { backgroundColor: autoOnStartup ? colors.swiftActiveTrack : colors.swiftTrack },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: scale(15), fontWeight: '700' }}>
                {autoOnStartup ? '开' : '关'}
              </Text>
            </View>
          </TVFocusable>

          <Text style={[styles.note, { color: colors.mutedForeground, fontSize: scale(14) }]}>
            上次自动采集：
            {collectConfig?.autoLastRunAt ? new Date(collectConfig.autoLastRunAt).toLocaleString() : '从未执行'}
          </Text>
        </View>

        {clampWarn.length > 0 ? (
          <Text style={[styles.note, { color: colors.warning, fontSize: scale(15) }]}>
            以下字段超出合法范围，将自动截断到允许区间：{clampWarn.join('、')}
          </Text>
        ) : null}

        <View style={styles.btnRow}>
          <TVButton id="cfg-reset" label="恢复默认参数" onPress={resetDefaults} testID="tv-cfg-reset" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingTop: tv(16), paddingBottom: tv(44) },
  section: { fontWeight: '700', marginBottom: tv(10), marginTop: tv(6) },
  card: { padding: tv(18), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(20) },
  note: { lineHeight: tv(24), marginBottom: tv(10) },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: tv(12),
  },
  switchInfo: { flex: 1 },
  switchBox: {
    width: tv(56),
    height: tv(28),
    borderRadius: tv(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: tv(8) },
});

export default CollectConfigScreen;