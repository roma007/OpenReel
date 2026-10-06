import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { TVFocusable } from '../focus/TVFocusable';
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
    autoIntervalHours: pick('autoIntervalHours', 24),
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
  const scale = useScaledFontSize();

  const collectConfig = useAppStore((s) => s.collectConfig);
  const loadCollectConfig = useAppStore((s) => s.loadCollectConfig);
  const updateCollectConfig = useAppStore((s) => s.updateCollectConfig);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoOnStartup, setAutoOnStartup] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCollectConfig().catch(() => {});
    const t = setTimeout(() => focusRegistry.requestInitialFocus('cfg-back'), 120);
    return () => clearTimeout(t);
  }, [loadCollectConfig]);

  useEffect(() => {
    if (!collectConfig) return;
    setDraft(toDraft(collectConfig as unknown as Record<string, any>));
    setAutoEnabled(!!collectConfig.autoEnabled);
    setAutoOnStartup(!!collectConfig.autoOnStartup);
  }, [collectConfig]);

  const parsed = useMemo(() => {
    const out: Record<string, number> = {};
    const all = [...BASIC_FIELDS, ...LIMIT_FIELDS];
    for (const f of all) {
      const n = parseInt(draft[f.key] ?? '', 10);
      out[f.key] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.fallback;
    }
    const interval = parseInt(draft.autoIntervalHours ?? '', 10);
    out.autoIntervalHours = Number.isFinite(interval) ? Math.min(8760, Math.max(1, interval)) : 24;
    return out;
  }, [draft]);

  const clampWarn = useMemo(() => {
    const all = [...BASIC_FIELDS, ...LIMIT_FIELDS];
    return all.filter((f) => String(parsed[f.key]) !== (draft[f.key] ?? '').trim()).map((f) => f.label);
  }, [draft, parsed]);

  const save = async () => {
    setSaving(true);
    try {
      await updateCollectConfig({
        minYear: parsed.minYear,
        retryTimes: parsed.retryTimes,
        pageSize: parsed.pageSize,
        maxPages: parsed.maxPages,
        incrementalMaxPages: parsed.incrementalMaxPages,
        maxIncrementalHours: parsed.maxIncrementalHours,
        concurrency: parsed.concurrency,
        autoEnabled,
        autoIntervalHours: parsed.autoIntervalHours,
        autoOnStartup: autoOnStartup && autoEnabled,
      });
      setMessage('配置已保存');
    } catch (e) {
      setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setDraft({
      minYear: '2025',
      retryTimes: '3',
      pageSize: '20',
      maxPages: '100',
      incrementalMaxPages: '100',
      maxIncrementalHours: '720',
      concurrency: '6',
      autoIntervalHours: '24',
    });
    setMessage('已填入默认参数，按「保存配置」生效');
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
      onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
      testID={`tv-cfg-${f.key}`}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader
        title="采集配置"
        backId="cfg-back"
        right={<TVButton id="cfg-save" label={saving ? '保存中…' : '保存配置'} variant="primary" disabled={saving} onPress={save} testID="tv-cfg-save" />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.section, { color: colors.foreground, fontSize: scale(19) }]}>基本设置</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {BASIC_FIELDS.map(renderField)}
        </View>

        <Text style={[styles.section, { color: colors.foreground, fontSize: scale(19) }]}>采集限制</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {LIMIT_FIELDS.map(renderField)}
        </View>

        <Text style={[styles.section, { color: colors.foreground, fontSize: scale(19) }]}>自动增量采集</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.note, { color: colors.warning, fontSize: scale(15) }]}>
            电视端不启动后台自动采集调度（盒子长期待机，定时采集会持续占用网络与内存）。
            下列开关与间隔仍会保存到数据库，但电视端不会自动执行，请手动点「增量采集」。
          </Text>

          <TVFocusable
            id="cfg:autoEnabled"
            onPress={() => {
              const next = !autoEnabled;
              setAutoEnabled(next);
              if (!next) setAutoOnStartup(false);
            }}
            style={[styles.switchRow, { borderColor: colors.border }]}
            testID="tv-cfg-auto-enabled"
          >
            <View style={styles.switchInfo}>
              <Text style={{ color: colors.foreground, fontSize: scale(17), fontWeight: '600' }}>启用自动采集</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(3) }}>
                仅记录配置，电视端不自动触发
              </Text>
            </View>
            <View
              style={[
                styles.switchBox,
                { backgroundColor: autoEnabled ? colors.swiftActiveTrack : colors.swiftTrack },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: scale(15), fontWeight: '700' }}>
                {autoEnabled ? '开' : '关'}
              </Text>
            </View>
          </TVFocusable>

          <TVTextInput
            id="cfg:autoIntervalHours"
            label="采集间隔（小时）"
            value={draft.autoIntervalHours}
            mode="digits"
            maxLength={6}
            placeholder="24（1~8760）"
            hint="距上次自动采集达到该间隔后触发（电视端仅记录）"
            onChangeText={(v) => setDraft((d) => ({ ...d, autoIntervalHours: v }))}
            testID="tv-cfg-auto-interval"
          />

          <TVFocusable
            id="cfg:autoOnStartup"
            onPress={() => {
              if (!autoEnabled) {
                setMessage('需先开启「启用自动采集」');
                return;
              }
              setAutoOnStartup((v) => !v);
            }}
            style={[styles.switchRow, { borderColor: colors.border, opacity: autoEnabled ? 1 : 0.5 }]}
            testID="tv-cfg-auto-startup"
          >
            <View style={styles.switchInfo}>
              <Text style={{ color: colors.foreground, fontSize: scale(17), fontWeight: '600' }}>启动时立即采集</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(3) }}>
                仅记录配置，电视端不自动触发
              </Text>
            </View>
            <View
              style={[
                styles.switchBox,
                { backgroundColor: autoOnStartup && autoEnabled ? colors.swiftActiveTrack : colors.swiftTrack },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: scale(15), fontWeight: '700' }}>
                {autoOnStartup && autoEnabled ? '开' : '关'}
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
            以下字段超出合法范围，保存时按范围截断：{clampWarn.join('、')}
          </Text>
        ) : null}

        <View style={styles.btnRow}>
          <TVButton id="cfg-reset" label="恢复默认参数" onPress={resetDefaults} testID="tv-cfg-reset" />
          <TVButton
            id="cfg-save-bottom"
            label={saving ? '保存中…' : '保存配置'}
            variant="primary"
            disabled={saving}
            onPress={save}
            testID="tv-cfg-save-bottom"
          />
        </View>

        {message ? (
          <Text style={{ color: colors.foreground, fontSize: scale(16), marginTop: tv(12) }}>{message}</Text>
        ) : null}
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