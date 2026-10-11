import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors, useScaledFontSize, radius } from '@openreel/expo-ui';
import { Check } from 'lucide-react-native';
import type { CollectPreviewItem } from '@openreel/core';

import { useAppStore, getStore } from '../useAppStore';
import { TVPageHeader } from '../components/TVPageHeader';
import { TVButton } from '../components/TVButton';
import { TVTextInput } from '../components/TVTextInput';
import { TVFocusable } from '../focus/TVFocusable';
import { focusRegistry } from '../focus/registry';
import PosterImage from '../components/PosterImage';
import { TV_LAYOUT, tv } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'KeywordCollect'>;

/** 页内消息（TV 端无 toast/Alert 用例，沿用页面内 message 的既有模式） */
interface PageMessage {
  text: string;
  tone: 'info' | 'error' | 'success';
}

/**
 * TV 关键词搜索采集（预览选择式）。
 *
 * 与移动端 KeywordCollectScreen 同构：`searchKeywordPreview` → 预览列表勾选
 * → `saveSelectedPreviewItems`；差异仅在交互层——
 *  - 输入走 TVTextInput + TVKeypad（TV 无可遥控 IME）
 *  - 「不限年份」用可聚焦 chip（无 Switch 触摸）
 *  - 反馈用页内 message 文本（无 Alert/Toast），保存成功后留在页内展示结果，
 *    用户再按「返回」回上一页（遥控上需要看得见的确认）
 *  - 隐藏子类型的「取消隐藏」由弹窗按钮改为页内 TVFocusable 按钮
 */
export function KeywordCollectScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const colors = useThemeColors();
  const scale = useScaledFontSize();

  const previewResults = useAppStore((s) => s.previewResults);
  const previewLoading = useAppStore((s) => s.previewLoading);
  const searchKeywordPreview = useAppStore((s) => s.searchKeywordPreview);
  const saveSelectedPreviewItems = useAppStore((s) => s.saveSelectedPreviewItems);
  const clearPreviewResults = useAppStore((s) => s.clearPreviewResults);
  const unhideMediaByGenres = useAppStore((s) => s.unhideMediaByGenres);

  const [keywordInput, setKeywordInput] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [relaxYear, setRelaxYear] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<PageMessage | null>(null);
  /** 保存结果里被隐藏的子类型：非空时显示「取消隐藏」按钮 */
  const [pendingUnhideGenres, setPendingUnhideGenres] = useState<string[] | null>(null);

  // 初始焦点：搜索输入框（页面第一可聚焦元素）
  useEffect(() => {
    const t = setTimeout(() => focusRegistry.requestInitialFocus('kc-input'), 120);
    return () => clearTimeout(t);
  }, []);

  const runSearch = useCallback(
    async (kw: string, relax: boolean) => {
      setHasSearched(true);
      setSelectedIds(new Set());
      setMessage(null);
      setPendingUnhideGenres(null);
      try {
        await searchKeywordPreview(kw, { unlimitedYear: relax });
        // 搜索完成后默认全选（对齐移动端）
        setSelectedIds(new Set(getStore().getState().previewResults.map((r) => r.previewId)));
      } catch (err) {
        console.error('[TV-KeywordCollect] 关键词搜索失败:', err);
        setMessage({ text: '搜索失败，请重试', tone: 'error' });
      }
    },
    [searchKeywordPreview],
  );

  const handleSearch = useCallback(() => {
    const kw = keywordInput.trim();
    if (!kw) {
      setMessage({ text: '请输入关键词后再搜索', tone: 'error' });
      return;
    }
    runSearch(kw, relaxYear);
  }, [keywordInput, relaxYear, runSearch]);

  // 带参进入（首页快速搜索采集卡）：自动执行一次搜索
  const routeKeyword = route.params?.keyword;
  const routeRelaxYear = route.params?.relaxYear;
  useEffect(() => {
    const relax = routeRelaxYear ?? false;
    if (relax) setRelaxYear(true);
    if (routeKeyword) {
      setKeywordInput(routeKeyword);
      runSearch(routeKeyword, relax);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKeyword, routeRelaxYear]);

  const handleToggleItem = useCallback((previewId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(previewId)) next.delete(previewId);
      else next.add(previewId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === previewResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(previewResults.map((r) => r.previewId)));
    }
  }, [selectedIds, previewResults]);

  const isAllSelected = previewResults.length > 0 && selectedIds.size === previewResults.length;
  const selectedCount = selectedIds.size;

  const handleClose = useCallback(() => {
    clearPreviewResults();
    if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.navigate('Home');
    }
  }, [clearPreviewResults, nav]);

  const handleSave = useCallback(async () => {
    const items = previewResults.filter((p) => selectedIds.has(p.previewId));
    if (items.length === 0) {
      setMessage({ text: '请至少选择一个视频', tone: 'error' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const result = await saveSelectedPreviewItems(items, { unlimitedYear: relaxYear });
      if (result.saved > 0) {
        setMessage({ text: `采集完成，成功采集 ${result.saved} 部视频`, tone: 'success' });
        clearPreviewResults();
        setHasSearched(false);
        setKeywordInput('');
        setSelectedIds(new Set());
        if (result.hiddenItems.length > 0) {
          const genres = [...new Set(result.hiddenItems.flatMap((h) => h.genres))];
          setPendingUnhideGenres(genres);
        } else {
          setPendingUnhideGenres(null);
        }
      } else {
        setMessage({ text: '采集失败，请重试', tone: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err?.message || '保存失败，请重试', tone: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [previewResults, selectedIds, saveSelectedPreviewItems, clearPreviewResults, relaxYear]);

  const handleUnhide = useCallback(async () => {
    if (!pendingUnhideGenres || pendingUnhideGenres.length === 0) return;
    const genres = pendingUnhideGenres;
    try {
      const res = await unhideMediaByGenres(genres);
      setMessage({
        text: `已恢复显示「${genres.join('、')}」类 ${res.unhidden} 部视频`,
        tone: 'success',
      });
    } catch (err) {
      console.error('[TV-KeywordCollect] 取消隐藏子类型失败:', err);
      setMessage({ text: '取消隐藏失败，请重试', tone: 'error' });
    } finally {
      setPendingUnhideGenres(null);
    }
  }, [pendingUnhideGenres, unhideMediaByGenres]);

  const messageColor =
    message?.tone === 'error'
      ? colors.error
      : message?.tone === 'success'
        ? colors.success
        : colors.mutedForeground;

  const renderPreviewItem = (item: CollectPreviewItem) => {
    const selected = selectedIds.has(item.previewId);
    return (
      <TVFocusable
        key={item.previewId}
        id={`kc-item:${item.previewId}`}
        onPress={() => handleToggleItem(item.previewId)}
        style={[
          styles.previewItem,
          selected && {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.buttonPrimaryBg,
          },
        ]}
        testID={`tv-kc-item-${item.previewId}`}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: selected ? colors.buttonPrimaryBg : colors.disabledForeground },
            selected && {
              backgroundColor: colors.buttonPrimaryBg,
              borderColor: colors.buttonPrimaryBg,
            },
          ]}
        >
          {selected ? <Check size={tv(18)} color={colors.buttonPrimaryText} /> : null}
        </View>
        {item.posterUrl ? (
          <PosterImage
            uri={item.posterUrl}
            style={[styles.previewPoster, { backgroundColor: colors.surface }]}
          />
        ) : null}
        <View style={styles.itemInfo}>
          <Text
            numberOfLines={1}
            style={[styles.itemTitle, { color: colors.foreground, fontSize: scale(17) }]}
          >
            {item.title} ({item.year})
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.itemMeta, { color: colors.mutedForeground, fontSize: scale(15) }]}
          >
            {item.type} · {item.area} · {item.sourceName}
          </Text>
          {item.directors.length > 0 ? (
            <Text
              numberOfLines={1}
              style={[styles.itemDetail, { color: colors.disabledForeground, fontSize: scale(13) }]}
            >
              导演: {item.directors.join(', ')}
            </Text>
          ) : null}
        </View>
      </TVFocusable>
    );
  };

  const renderPreviewBody = () => {
    if (previewLoading) {
      return (
        <Text style={[styles.bodyHint, { color: colors.mutedForeground, fontSize: scale(17) }]}>
          搜索中…
        </Text>
      );
    }
    if (hasSearched && previewResults.length === 0) {
      return (
        <Text style={[styles.bodyHint, { color: colors.disabledForeground, fontSize: scale(17) }]}>
          未找到相关结果
        </Text>
      );
    }
    if (previewResults.length > 0) {
      return (
        <>
          <View style={styles.listHeader}>
            <TVButton
              id="kc-all"
              label={isAllSelected ? '取消全选' : `全选 (${previewResults.length})`}
              onPress={handleSelectAll}
              testID="tv-kc-all"
            />
            <Text style={{ color: colors.mutedForeground, fontSize: scale(16) }}>
              已选 {selectedCount} 项
            </Text>
          </View>
          {previewResults.map(renderPreviewItem)}
        </>
      );
    }
    return (
      <Text style={[styles.bodyHint, { color: colors.disabledForeground, fontSize: scale(17) }]}>
        输入关键词后点击搜索
      </Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <TVPageHeader title="关键词搜索采集" backId="kc-back" onBack={handleClose} />

      <View style={styles.searchArea}>
        <View style={styles.searchRow}>
          <TVTextInput
            id="kc-input"
            value={keywordInput}
            onChangeText={setKeywordInput}
            placeholder="输入电影/电视剧名称..."
            mode="text"
            containerStyle={{ flex: 1, marginBottom: 0 }}
            testID="tv-kc-input"
          />
          <TVButton
            id="kc-search"
            label="搜索"
            variant="primary"
            onPress={handleSearch}
            disabled={previewLoading}
            testID="tv-kc-search"
          />
        </View>

        <View style={styles.optionRow}>
          <TVFocusable
            id="kc-relax"
            onPress={() => setRelaxYear((v) => !v)}
            style={[
              styles.chip,
              {
                backgroundColor: relaxYear ? colors.buttonPrimaryBg : colors.surface,
                borderColor: relaxYear ? colors.buttonPrimaryBg : colors.border,
              },
            ]}
            testID="tv-kc-relax"
          >
            <Text
              style={{
                color: relaxYear ? colors.buttonPrimaryText : colors.foreground,
                fontSize: scale(16),
                fontWeight: '600',
              }}
            >
              不限年份
            </Text>
            {relaxYear ? (
              <Check size={tv(16)} color={colors.buttonPrimaryText} style={{ marginLeft: tv(6) }} />
            ) : null}
          </TVFocusable>
        </View>

        {message ? (
          <Text style={[styles.message, { color: messageColor, fontSize: scale(16) }]}>
            {message.text}
          </Text>
        ) : null}
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {renderPreviewBody()}
      </ScrollView>

      <View style={styles.footer}>
        <TVButton id="kc-cancel" label="取消" onPress={handleClose} testID="tv-kc-cancel" />
        {pendingUnhideGenres && pendingUnhideGenres.length > 0 ? (
          <TVButton
            id="kc-unhide"
            label="取消隐藏"
            variant="primary"
            onPress={handleUnhide}
            testID="tv-kc-unhide"
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <TVButton
          id="kc-save"
          label={`保存选中 (${selectedCount})`}
          variant="primary"
          onPress={handleSave}
          disabled={isSaving || previewLoading}
          testID="tv-kc-save"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchArea: {
    paddingHorizontal: TV_LAYOUT.paddingX,
    paddingTop: tv(18),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv(12),
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv(12),
    marginTop: tv(14),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tv(18),
    paddingVertical: tv(10),
    borderRadius: tv(10),
    borderWidth: 1,
  },
  message: {
    marginTop: tv(12),
    fontWeight: '600',
  },
  listScroll: { flex: 1 },
  listContent: {
    paddingHorizontal: TV_LAYOUT.paddingX,
    paddingTop: tv(16),
    paddingBottom: tv(12),
  },
  bodyHint: {
    textAlign: 'center',
    paddingVertical: tv(36),
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tv(8),
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tv(14),
    paddingHorizontal: tv(16),
    borderRadius: radius.md,
    gap: tv(14),
    marginBottom: tv(6),
    borderWidth: 1,
    borderColor: 'transparent',
  },
  checkbox: {
    width: tv(28),
    height: tv(28),
    borderRadius: tv(6),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPoster: {
    width: tv(74),
    height: tv(108),
    borderRadius: radius.sm,
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontWeight: '600', marginBottom: tv(4) },
  itemMeta: { marginBottom: tv(2) },
  itemDetail: {},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TV_LAYOUT.paddingX,
    paddingTop: tv(12),
    paddingBottom: TV_LAYOUT.paddingY,
  },
});

export default KeywordCollectScreen;
