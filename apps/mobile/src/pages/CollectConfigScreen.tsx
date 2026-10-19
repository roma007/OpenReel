import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useAppStore } from '../useAppStore';
import { ArrowLeft, RotateCcw } from 'lucide-react-native';
import { useThemeColors } from '../themes/useThemeColors';
import { useThemeStore } from '../themes/store';
import { useScaledFontSize } from '../themes/useScaledFontSize';
import { hexToRgba } from '../themes/colorUtils';
import { radius } from '../themes/radiusTokens';
import BlurredBackground from '../components/BlurredBackground';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface Props {
  navigation: any;
}

type LocalConfig = {
  minYear: string;
  retryTimes: string;
  pageSize: string;
  maxPages: string;
  incrementalMaxPages: string;
  maxIncrementalHours: string;
  concurrency: string;
  autoOnStartup: boolean;
};

const NUMERIC_KEYS = [
  'minYear', 'retryTimes', 'pageSize', 'maxPages',
  'incrementalMaxPages', 'maxIncrementalHours', 'concurrency',
] as const;

/** 字符串草稿 → 落库数值（范围收敛语义与旧「保存」按钮保持一致） */
function toPayload(c: LocalConfig) {
  return {
    minYear: parseInt(c.minYear) || 2025,
    retryTimes: Math.min(10, Math.max(0, parseInt(c.retryTimes) || 3)),
    pageSize: Math.min(100, Math.max(5, parseInt(c.pageSize) || 20)),
    maxPages: Math.max(1, parseInt(c.maxPages) || 10),
    incrementalMaxPages: Math.max(1, parseInt(c.incrementalMaxPages) || 100),
    maxIncrementalHours: Math.max(0, parseInt(c.maxIncrementalHours) || 720),
    concurrency: Math.min(20, Math.max(1, parseInt(c.concurrency) || 1)),
    autoOnStartup: c.autoOnStartup,
  };
}

/** 文本是否为可解析的纯数字（避免把输入中间态/空串写库） */
const isNumericText = (t: string) => /^\d+$/.test(t.trim());

export default function CollectConfigScreen({ navigation }: Props) {
  const { collectConfig, loadCollectConfig, updateCollectConfig } = useAppStore();
  const colors = useThemeColors();
  const cardOpacity = useThemeStore((s) => s.cardOpacity);
  const cardBg = hexToRgba(colors.card, cardOpacity / 100);
  const surfaceBg = hexToRgba(colors.surface, cardOpacity / 100);
  const s = useScaledFontSize();

  const [localConfig, setLocalConfig] = useState({
    minYear: '2025',
    retryTimes: '3',
    pageSize: '20',
    maxPages: '10',
    incrementalMaxPages: '100',
    maxIncrementalHours: '720',
    concurrency: '1',
    autoOnStartup: false,
  });
  const [autoLastRunAt, setAutoLastRunAt] = useState<string | null>(null);
  const [savedTip, setSavedTip] = useState(false);
  const savedConfigRef = useRef('');
  // 即时保存：本地 state 为唯一编辑源，store 仅在首次水合时写入本地，
  // 避免写库后的 loadCollectConfig 回写打断正在输入的内容
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCollectConfig();
  }, []);

  useEffect(() => {
    if (!collectConfig) return;
    // autoLastRunAt 由启动采集在别处更新，始终同步
    setAutoLastRunAt(collectConfig.autoLastRunAt);
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    savedConfigRef.current = JSON.stringify({
      minYear: collectConfig.minYear,
      retryTimes: collectConfig.retryTimes,
      pageSize: collectConfig.pageSize,
      maxPages: collectConfig.maxPages,
      incrementalMaxPages: collectConfig.incrementalMaxPages,
      maxIncrementalHours: collectConfig.maxIncrementalHours,
      concurrency: collectConfig.concurrency,
      autoOnStartup: collectConfig.autoOnStartup,
    });
    setLocalConfig({
      minYear: String(collectConfig.minYear),
      retryTimes: String(collectConfig.retryTimes),
      pageSize: String(collectConfig.pageSize),
      maxPages: String(collectConfig.maxPages),
      incrementalMaxPages: String(collectConfig.incrementalMaxPages),
      maxIncrementalHours: String(collectConfig.maxIncrementalHours),
      concurrency: String(collectConfig.concurrency),
      autoOnStartup: collectConfig.autoOnStartup,
    });
  }, [collectConfig]);

  const hasChanges = useMemo(() => {
    if (!collectConfig || !savedConfigRef.current) return false;
    const current = JSON.stringify({
      minYear: parseInt(localConfig.minYear) || 2025,
      retryTimes: parseInt(localConfig.retryTimes) || 3,
      pageSize: parseInt(localConfig.pageSize) || 20,
      maxPages: parseInt(localConfig.maxPages) || 10,
      incrementalMaxPages: parseInt(localConfig.incrementalMaxPages) || 100,
      maxIncrementalHours: parseInt(localConfig.maxIncrementalHours) || 720,
      concurrency: parseInt(localConfig.concurrency) || 1,
      autoOnStartup: localConfig.autoOnStartup,
    });
    return current !== savedConfigRef.current;
  }, [localConfig, collectConfig]);

  // 清理未触发的 debounce / 提示定时器
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
  }, []);

  /** 即时保存唯一写入口：落库 + 轻提示（无弹窗） */
  const persist = useCallback(async (c: LocalConfig) => {
    const payload = toPayload(c);
    await updateCollectConfig(payload);
    savedConfigRef.current = JSON.stringify(payload);
    setSavedTip(true);
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setSavedTip(false), 2000);
  }, [updateCollectConfig]);

  /** 数值输入：500ms debounce 写库 */
  const scheduleSave = useCallback((c: LocalConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(c);
    }, 500);
  }, [persist]);

  /**
   * 字段变更：immediate=true（开关/重置）立即写库，否则 debounce。
   * 数值字段处于输入中间态（空串/非纯数字）时只更新本地，不写库。
   */
  const update = useCallback((patch: Partial<LocalConfig>, immediate = false) => {
    const next = { ...localConfig, ...patch };
    setLocalConfig(next);
    if (!NUMERIC_KEYS.every((k) => isNumericText(next[k]))) return;
    if (immediate) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void persist(next);
    } else {
      scheduleSave(next);
    }
  }, [localConfig, persist, scheduleSave]);

  const handleReset = () => {
    update({
      minYear: '2025',
      retryTimes: '3',
      pageSize: '20',
      maxPages: '100',
      incrementalMaxPages: '100',
      maxIncrementalHours: '720',
      concurrency: '6',
      autoOnStartup: false,
    }, true);
  };

  // 兜底：离开页面时把未触发的 debounce 立即落库；若仍有未落库变更（异常路径）则保存后再离开
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void persist(localConfig);
        return;
      }
      if (!hasChanges) return;
      e.preventDefault();
      void persist(localConfig).then(() => navigation.dispatch(e.data.action));
    });
    return () => unsubscribe();
  }, [hasChanges, navigation, localConfig, persist]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: 50, paddingHorizontal: 15, paddingBottom: 15 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    title: { flex: 1, fontSize: s(18), fontWeight: 'bold', color: colors.text, textAlign: 'center' },
    headerActions: { flexDirection: 'row', gap: 8 },
    content: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 30 },
    card: {
      backgroundColor: cardBg,
      borderRadius: radius.lg,
      overflow: 'hidden',
      marginBottom: 20,
    },
    cardTitle: {
      fontSize: s(15),
      fontWeight: '600',
      color: colors.text,
      paddingHorizontal: 15,
      paddingTop: 15,
      paddingBottom: 10,
    },
    fieldRow: {
      flexDirection: 'row',
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    fieldCol: { flex: 1 },
    fieldColLeft: {
      flex: 1,
      paddingRight: 10,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: hexToRgba(colors.disabledForeground, 0.15),
    },
    fieldColRight: { flex: 1, paddingLeft: 10 },
    fieldLabel: { fontSize: s(13), color: colors.mutedForeground, marginBottom: 6 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    switchInfo: { flex: 1, paddingRight: 12 },
    switchTitle: { fontSize: s(14), fontWeight: '500', color: colors.text },
    switchDesc: { fontSize: s(12), color: colors.mutedForeground, marginTop: 3 },
    lastRunBox: {
      paddingHorizontal: 15,
      paddingVertical: 6,
    },
    lastRunText: {
      fontSize: s(12),
      color: colors.mutedForeground,
      backgroundColor: surfaceBg,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      overflow: 'hidden',
    },
  }), [colors, cardBg, surfaceBg, s]);

  return (
    <BlurredBackground imageUrl={null}>
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Button variant="icon" size="sm" onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text} />
          </Button>
          <Text style={styles.title}>采集配置</Text>
          <View style={styles.headerActions}>
            {savedTip ? (
              <Text style={{ color: colors.mutedForeground, fontSize: s(12) }}>已自动保存</Text>
            ) : null}
            <Button variant="secondary" size="sm" onPress={handleReset}>
              <RotateCcw size={16} color={colors.text} />
            </Button>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>基本设置</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldColLeft}>
              <Text style={styles.fieldLabel}>最小年份</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.minYear}
                onChangeText={(text) => update({ minYear: text })}
              />
            </View>
            <View style={styles.fieldColRight}>
              <Text style={styles.fieldLabel}>失败重试次数</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.retryTimes}
                onChangeText={(text) => update({ retryTimes: text })}
              />
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>每页大小</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.pageSize}
                onChangeText={(text) => update({ pageSize: text })}
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>采集限制</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldColLeft}>
              <Text style={styles.fieldLabel}>全量最大页数</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.maxPages}
                onChangeText={(text) => update({ maxPages: text })}
              />
            </View>
            <View style={styles.fieldColRight}>
              <Text style={styles.fieldLabel}>增量最大页数</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.incrementalMaxPages}
                onChangeText={(text) => update({ incrementalMaxPages: text })}
              />
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldColLeft}>
              <Text style={styles.fieldLabel}>增量最大追溯时间（小时）</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.maxIncrementalHours}
                onChangeText={(text) => update({ maxIncrementalHours: text })}
              />
            </View>
            <View style={styles.fieldColRight}>
              <Text style={styles.fieldLabel}>并发数量</Text>
              <Input
                size="sm"
                keyboardType="numeric"
                value={localConfig.concurrency}
                onChangeText={(text) => update({ concurrency: text })}
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>启动时自动采集</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchTitle}>启动时立即采集</Text>
              <Text style={styles.switchDesc}>APP 启动后自动执行一次增量采集</Text>
            </View>
            <Switch
              value={localConfig.autoOnStartup}
              onValueChange={(checked) => update({ autoOnStartup: checked }, true)}
              trackColor={{ false: colors.swiftTrack, true: colors.swiftActiveTrack }}
              thumbColor={colors.swiftThumb}
            />
          </View>

          <View style={styles.lastRunBox}>
            <Text style={styles.lastRunText}>
              上次自动采集：{autoLastRunAt ? new Date(autoLastRunAt).toLocaleString() : '从未执行'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
    </BlurredBackground>
  );
}
