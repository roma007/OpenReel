import React, { useEffect, useRef } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { focusRegistry } from './registry';

/**
 * TV 竖向可滚动容器：焦点移出可视区时，用 JS 主动把焦点节点滚回视野。
 *
 * 依据（2026-10-06 实测，tvhome-tv + uiautomator + logcat）：
 * RN 的 ScrollView 在 Android TV 上**不会**可靠地把聚焦子视图滚入可视区 ——
 * 分类页展开「分类」后，聚焦的标签停在屏外（bounds top≈2339，logcat `visible: false`），
 * 且 UP/LEFT 均无法恢复（死锁）。故与 TVRow 同思路，用 JS 主动滚动：
 * 订阅焦点变化 → measureInWindow 测量焦点节点与容器 → scrollTo 补齐差值。
 *
 * 只做「焦点跟随」一件事；内容、样式全部由调用方给。
 */
export interface TVScrollContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** 焦点节点与容器边缘至少保留的间距(dp)，避免焦点环贴边被裁 */
  focusMargin?: number;
}

export function TVScrollContainer({
  children,
  style,
  contentContainerStyle,
  focusMargin = 56,
}: TVScrollContainerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const wrapRef = useRef<View>(null);
  /** 当前滚动位置（onScroll 持续更新），用于叠加增量 */
  const offsetRef = useRef(0);
  /** 上一次已处理的焦点 id，避免同一焦点反复滚动 */
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let verifyTimer: ReturnType<typeof setTimeout> | null = null;

    const runFollow = () => {
      const id = focusRegistry.getFocusedId();
      if (!id) return;
      const node = focusRegistry.node(id) as any;
      const wrap = wrapRef.current as any;
      if (!node?.measureInWindow || !wrap?.measureInWindow) return;

      wrap.measureInWindow((_wx: number, wy: number, _ww: number, wh: number) => {
        node.measureInWindow((_nx: number, ny: number, _nw: number, nh: number) => {
          if (!nh && !_nw) return; // 尚未布局
          const top = wy + focusMargin;
          const bottom = wy + wh - focusMargin;
          let delta = 0;
          if (ny < top) delta = ny - top;
          else if (ny + nh > bottom) delta = ny + nh - bottom;
          if (delta === 0) return;
          // 用非动画滚动：遥控器长按会连续触发焦点变化，动画滚动期间 measureInWindow/onScroll
          // 与滚动位置产生竞态，快速连按时焦点会滚不到位而停在屏外（实测 0.9s 间隔复现）。
          // 非动画让 offsetRef 在下一次按键前即更新完毕，跟随确定性。
          const next = Math.max(0, offsetRef.current + delta);
          scrollRef.current?.scrollTo({ y: next, animated: false });
        });
      });
    };

    const unsub = focusRegistry.subscribe(() => {
      const id = focusRegistry.getFocusedId();
      if (!id || id === lastIdRef.current) return;
      lastIdRef.current = id;

      if (timer) clearTimeout(timer);
      // 等一帧：新展开的面板/重建的节点需要先完成布局，measureInWindow 才准
      timer = setTimeout(runFollow, 60);

      // 二次复检：追加下一页时新行可能尚未完成布局（measureInWindow 返回 0 被跳过），
      // 或重渲染抖动导致首轮滚动落空；焦点未变则再补一次，保证最终可见。
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = setTimeout(() => {
        if (focusRegistry.getFocusedId() === id) runFollow();
      }, 280);
    });

    return () => {
      if (timer) clearTimeout(timer);
      if (verifyTimer) clearTimeout(verifyTimer);
      unsub();
    };
  }, [focusMargin]);

  return (
    <View ref={wrapRef as any} style={style} collapsable={false}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          offsetRef.current = e.nativeEvent.contentOffset.y;
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export default TVScrollContainer;