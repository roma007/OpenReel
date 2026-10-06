import React, { useCallback, useEffect, useState } from 'react';
import { Clipboard, Text, View, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, useScaledFontSize } from '@openreel/expo-ui';
import {
  SourceImportService,
  AI_SOURCE_PROMPT,
  AI_SOURCE_IMPORT_SAMPLE,
  type ParsedImportSource,
} from '@openreel/core';

import { useAppStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { focusRegistry } from '../focus/registry';
import { TV_LAYOUT, tv } from '../theme/tokens';

type Step = 'prompt' | 'paste' | 'preview';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'prompt', label: '1 复制提示词' },
  { key: 'paste', label: '2 粘贴数据' },
  { key: 'preview', label: '3 预览导入' },
];

function statusStyle(status: string): { label: string; color: string } {
  switch (status) {
    case 'valid':
      return { label: '可导入', color: '#22c55e' };
    case 'code_exists':
    case 'url_exists':
      return { label: '将覆盖已有源', color: '#eab308' };
    case 'duplicate_in_list':
      return { label: '本次数据内重复', color: '#eab308' };
    default:
      return { label: '字段不合法', color: '#ef4444' };
  }
}

/**
 * TV 添加视频源（AI 导入）。
 *
 * 与手机端差异：
 *  - 手机端靠长按/剪贴板按钮 + 软键盘；TV 端主通道为**剪贴板**（「复制提示词」「粘贴」两个动作
 *    都能用方向键触发），文本区改用 TVTextInput 的 multiline 模式 + 应用内键盘兜底。
 *  - Alert 提示改为页内状态文本（无触摸弹窗）。
 */
export function AiSourceImportScreen() {
  const colors = useThemeColors();
  const scale = useScaledFontSize();
  const nav = useNavigation<any>();

  const batchImportSources = useAppStore((s) => s.batchImportSources);
  const validateImportSources = useAppStore((s) => s.validateImportSources);

  const [step, setStep] = useState<Step>('prompt');
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<ParsedImportSource[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('ai-back'), 120);
    return () => clearTimeout(t);
  }, []);

  const validCount = preview.filter((p) => p.status === 'valid').length;

  const copyPrompt = useCallback(async () => {
    try {
      await Clipboard.setString(AI_SOURCE_PROMPT);
      setMessage('提示词已复制到剪贴板：把它发给 AI 助手，再把 AI 返回的结果复制回来');
    } catch (e) {
      setMessage(`复制失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (!text) {
        setMessage('剪贴板为空');
        return;
      }
      setPasted(text);
      setMessage(`已粘贴 ${text.length} 个字符`);
    } catch (e) {
      setMessage(`读取剪贴板失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const parse = useCallback(async () => {
    if (!pasted.trim()) {
      setMessage('请先粘贴 AI 返回的数据');
      return;
    }
    const parsed = SourceImportService.parseJson(pasted.trim());
    if (parsed.errors.length > 0) {
      setMessage(`解析失败：${parsed.errors[0].message}`);
      return;
    }
    if (parsed.items.length === 0) {
      setMessage('未解析到有效数据');
      return;
    }
    const p = await validateImportSources(parsed.items);
    setPreview(p);
    setStep('preview');
    setMessage(null);
  }, [pasted, validateImportSources]);

  const doImport = useCallback(async () => {
    const validItems = preview.filter((p) => p.status === 'valid').map((p) => p.item);
    if (validItems.length === 0) {
      setMessage('没有可导入的有效视频源');
      return;
    }
    setImporting(true);
    try {
      const r = await batchImportSources(validItems);
      setResult({ imported: r.imported, skipped: r.skipped });
      setMessage(r.imported > 0 ? `成功导入 ${r.imported} 个视频源` : `导入失败，${r.skipped} 个被跳过`);
    } catch (e) {
      setMessage(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }, [batchImportSources, preview]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TVPageHeader
        title="添加视频源（AI 导入）"
        backId="ai-back"
        onBack={() => {
          if (step === 'prompt') nav.goBack();
          else setStep(step === 'paste' ? 'prompt' : 'paste');
        }}
      />

      <View style={[styles.stepBar, { paddingHorizontal: TV_LAYOUT.paddingX }]}>
        {STEPS.map((s) => (
          <View
            key={s.key}
            style={[
              styles.stepChip,
              {
                backgroundColor: step === s.key ? colors.buttonPrimaryBg : colors.surface,
              },
            ]}
          >
            <Text
              style={{
                color: step === s.key ? colors.buttonPrimaryText : colors.mutedForeground,
                fontSize: scale(15),
                fontWeight: step === s.key ? '700' : '500',
              }}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: TV_LAYOUT.paddingX }]}
        showsVerticalScrollIndicator={false}
      >
        {step === 'prompt' ? (
          <>
            <Text style={[styles.desc, { color: colors.textSecondary, fontSize: scale(17) }]}>
              点「复制提示词」把它复制到剪贴板，发给 AI 助手（如 ChatGPT、Claude 等），再把 AI 返回的结果复制回来，下一步粘贴。
            </Text>
            <View style={[styles.promptBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.promptText, { color: colors.textSecondary, fontSize: scale(14) }]}>
                {AI_SOURCE_PROMPT}
              </Text>
            </View>
          </>
        ) : null}

        {step === 'paste' ? (
          <>
            <Text style={[styles.desc, { color: colors.textSecondary, fontSize: scale(17) }]}>
              点「从剪贴板粘贴」把 AI 返回的 JSON 贴进来，再点「解析并预览」。也可以用下方输入框手动输入（按 OK 打开电视键盘）。
            </Text>
            <View style={styles.actionRow}>
              <TVButton id="ai-paste" label="从剪贴板粘贴" variant="primary" onPress={pasteFromClipboard} testID="tv-ai-paste" />
              <TVButton
                id="ai-sample"
                label="填入示例"
                onPress={() => setPasted(AI_SOURCE_IMPORT_SAMPLE)}
                testID="tv-ai-sample"
              />
            </View>
            <TVTextInput
              id="ai-text"
              label="AI 返回数据"
              value={pasted}
              mode="text"
              multiline
              placeholder="在此粘贴 AI 返回的 JSON 数据…"
              hint="多行文本；键盘内有「粘贴」键可直接读取剪贴板"
              onChangeText={setPasted}
              testID="tv-ai-text"
            />
          </>
        ) : null}

        {step === 'preview' ? (
          result ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text
                style={{
                  color: result.imported > 0 ? colors.success : colors.error,
                  fontSize: scale(22),
                  fontWeight: '700',
                }}
              >
                {result.imported > 0 ? `成功导入 ${result.imported} 个视频源` : '导入失败'}
              </Text>
              {result.skipped > 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: scale(17), marginTop: tv(6) }}>
                  {result.skipped} 个被跳过
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={[styles.desc, { color: colors.textSecondary, fontSize: scale(17) }]}>
                共解析 {preview.length} 个视频源，{validCount} 个可导入
              </Text>
              {preview.map((p, idx) => {
                const st = statusStyle(p.status);
                return (
                  <View
                    key={idx}
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: st.color }]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={{ color: colors.foreground, fontSize: scale(18), fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {p.item.name || '未命名'}（{p.item.code}）
                      </Text>
                      <Text style={{ color: st.color, fontSize: scale(15), fontWeight: '700' }}>{st.label}</Text>
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: scale(14), marginTop: tv(4) }} numberOfLines={1}>
                      {p.item.baseUrl}
                    </Text>
                    {p.errors.length > 0 ? (
                      <Text style={{ color: colors.error, fontSize: scale(14), marginTop: tv(4) }}>{p.errors[0]}</Text>
                    ) : null}
                    {p.existingSource ? (
                      <Text style={{ color: colors.warning, fontSize: scale(14), marginTop: tv(4) }}>
                        已在库：{p.existingSource.name}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </>
          )
        ) : null}

        {message ? (
          <Text style={{ color: colors.warning, fontSize: scale(16), marginTop: tv(12) }}>{message}</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingHorizontal: TV_LAYOUT.paddingX }]}>
        {step === 'prompt' ? (
          <>
            <TVButton id="ai-copy" label="复制提示词" variant="primary" onPress={copyPrompt} testID="tv-ai-copy" />
            <TVButton id="ai-next" label="下一步" onPress={() => setStep('paste')} testID="tv-ai-next" />
          </>
        ) : null}
        {step === 'paste' ? (
          <>
            <TVButton id="ai-back2" label="上一步" onPress={() => setStep('prompt')} testID="tv-ai-back2" />
            <TVButton
              id="ai-parse"
              label="解析并预览"
              variant="primary"
              disabled={!pasted.trim()}
              onPress={parse}
              testID="tv-ai-parse"
            />
          </>
        ) : null}
        {step === 'preview' ? (
          result ? (
            <TVButton id="ai-finish" label="完成" variant="primary" onPress={() => nav.goBack()} testID="tv-ai-finish" />
          ) : (
            <>
              <TVButton id="ai-back3" label="返回修改" onPress={() => setStep('paste')} testID="tv-ai-back3" />
              <TVButton
                id="ai-import"
                label={importing ? '导入中…' : `导入 ${validCount} 个`}
                variant="primary"
                disabled={importing || validCount === 0}
                onPress={doImport}
                testID="tv-ai-import"
              />
            </>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepBar: { flexDirection: 'row', paddingVertical: tv(12) },
  stepChip: { paddingHorizontal: tv(16), paddingVertical: tv(6), borderRadius: tv(8), marginRight: tv(10) },
  scroll: { flex: 1 },
  content: { paddingTop: tv(8), paddingBottom: tv(24) },
  desc: { lineHeight: tv(26), marginBottom: tv(12) },
  promptBox: { padding: tv(18), borderRadius: tv(10), borderWidth: 1 },
  promptText: { lineHeight: tv(22) },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: tv(10) },
  card: { padding: tv(16), borderRadius: tv(10), borderWidth: 1, marginBottom: tv(10) },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  footer: { flexDirection: 'row', paddingVertical: tv(14), borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.35)' },
});

export default AiSourceImportScreen;