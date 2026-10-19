import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  View,
  findNodeHandle,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { focusRegistry } from './registry';
import { useThemeColors } from '@openreel/expo-ui';
import { TV_FIXED } from '../theme/tokens';

/**
 * TV 可聚焦元素容器。
 *
 * 真实焦点来自 RN 原生 onFocus/onBlur（Android TV 上方向键由系统派发到 focusable 视图），
 * 本组件只做两件事：把焦点状态注册到 focusRegistry、提供焦点视觉。
 *
 * 焦点视觉沿用现有主题 token（不另造视觉体系）：焦点时叠 3dp 主色描边，可选轻微放大；
 * 电视观看距离远，故焦点态对比度比手机端更强。
 *
 * 焦点环用「外扩覆盖层」绘制（absolute 负 inset，不占布局空间）：
 * 若直接用 borderWidth，Yoga 会把内容区收窄环宽，而调用方普遍给子卡传固定全宽，
 * 卡片会向右溢出恰好盖住右边框（实测分类页卡片焦点环右边缺失，只有上/下/左三条边）。
 * 覆盖层画在子内容之上（children 之后渲染），四条边均不会被卡片内容遮挡；
 * 外扩量 = 环宽，圆角半径同步 + 环宽，保持与卡片圆角同心。
 */
export interface TVFocusableProps {
  /** 稳定 id：焦点恢复（TVFocusBridge）据此定位目标 */
  id?: string;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** 获得焦点时回调（横向行据此把目标滚动到可视区） */
  onFocus?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 焦点态附加样式（如卡片放大） */
  focusStyle?: StyleProp<ViewStyle>;
  /** 焦点环颜色，默认主色 */
  focusColor?: string;
  showFocusRing?: boolean;
  hitSlop?: number;
  testID?: string;
  /**
   * 原生按键事件（RN `enableKeyEvents` 打开后可用）。
   * 事件只在**该元素获得原生焦点**时派发（target = 聚焦视图），`nativeEvent.code`
   * 形如 `ArrowLeft`/`ArrowRight`/`Enter`。注意：JS 收到事件**不能消费按键**，
   * 原生焦点移动仍会发生 —— 故仅用于「左/右无横向邻居」的播放区做快进快退。
   */
  onKeyDown?: (e: any) => void;
  /**
   * 透传到 Pressable 的 onLayout。
   *
   * TVRow 用它记录卡片在「ScrollView 内容容器」坐标系里的 x —— 必须挂在
   * Pressable（内容容器的直接子节点）上，`layout.x` 才是相对内容的真实偏移；
   * 若挂在卡片内层 View 上，x 恒为 0，会导致横向滚动跟随失效。
   */
  onLayout?: (e: LayoutChangeEvent) => void;
  /**
   * 「向下」焦点目标（registry id，非必填）。
   *
   * 背景：Android 原生 FocusFinder 按几何就近选目标，首页这类「栏头按钮（右对齐）+
   * 卡片行（左起）」布局里，向下常命中右对齐按钮而非卡片行。此 prop 把「按下」的
   * 目标钉死为指定 registry 元素（如某栏首个视频卡），解决「进入一栏落在栏头按钮」。
   * 目标常与自身同帧挂载，注册表里暂无节点，故订阅 registry 变化延迟解析 reactTag；
   * 解析不到时不设原生属性，回落几何搜索（与旧行为一致）。
   */
  nextFocusDownId?: string;
  /**
   * 「向上」焦点目标（registry id，非必填）。机制与 `nextFocusDownId` 对称。
   *
   * 典型场景：源卡片列表要求「进入卡片时焦点落在卡片第一个按钮」，下方卡片
   * 的所有按钮都需把「向上」钉死为上一卡片的首按钮，避免 FocusFinder 按
   * 几何 x 就近选到上一卡片中间的按钮。
   */
  nextFocusUpId?: string;
}

let seq = 0;

export function TVFocusable({
  id,
  disabled,
  onPress,
  onLongPress,
  onFocus,
  children,
  style,
  focusStyle,
  focusColor,
  showFocusRing = true,
  hitSlop,
  testID,
  onLayout,
  onKeyDown,
  nextFocusDownId,
  nextFocusUpId,
}: TVFocusableProps) {
  const colors = useThemeColors();
  const nodeRef = useRef<React.ElementRef<typeof Pressable> | null>(null);
  const autoIdRef = useRef<string>(`tv-focus-auto-${(seq += 1)}`);
  const realId = id || autoIdRef.current;

  // 用 ref 承载回调，避免注册表持有过期闭包
  const handlersRef = useRef({ onFocus, onPress });
  handlersRef.current = { onFocus, onPress };

  const [isFocused, setIsFocused] = useState(false);
  // 「向下」目标的原生 reactTag：nextFocusDown 需要数字 tag，而目标节点可能
  // 与自身同帧挂载（渲染期 registry 里还没有），故挂载后订阅 registry 延迟解析。
  const [nextFocusDownTag, setNextFocusDownTag] = useState<number | undefined>(undefined);
  // 「向上」目标的原生 reactTag，机制同 nextFocusDownTag。
  const [nextFocusUpTag, setNextFocusUpTag] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!nextFocusDownId) {
      setNextFocusDownTag(undefined);
      return;
    }
    const resolve = () => {
      const node = focusRegistry.node(nextFocusDownId);
      const tag = node ? findNodeHandle(node as unknown as React.Component) : null;
      setNextFocusDownTag(tag ?? undefined);
    };
    resolve();
    // 目标 register/unregister 时 registry 会 emit，借机补解析/清失效 tag
    return focusRegistry.subscribe(resolve);
  }, [nextFocusDownId]);

  useEffect(() => {
    if (!nextFocusUpId) {
      setNextFocusUpTag(undefined);
      return;
    }
    const resolve = () => {
      const node = focusRegistry.node(nextFocusUpId);
      const tag = node ? findNodeHandle(node as unknown as React.Component) : null;
      setNextFocusUpTag(tag ?? undefined);
    };
    resolve();
    return focusRegistry.subscribe(resolve);
  }, [nextFocusUpId]);

  useEffect(() => {
    focusRegistry.register({
      id: realId,
      // 供 TVFocusBridge 主动补焦点（页面初始焦点 / 焦点丢失恢复）时调用原生 focus()
      getNode: () => nodeRef.current as any,
      onFocus: () => {
        setIsFocused(true);
        handlersRef.current.onFocus?.();
      },
    });
    focusRegistry.setDisabled(realId, !!disabled);
    return () => focusRegistry.unregister(realId);
  }, [realId, disabled]);

  // 订阅 registry：焦点因别处移动/元素被禁用而丢失时，同步本地态
  useEffect(
    () =>
      focusRegistry.subscribe(() => {
        setIsFocused(focusRegistry.isFocused(realId));
      }),
    [realId],
  );

  const handleFocus = useCallback(() => {
    focusRegistry.handleFocus(realId);
  }, [realId]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    focusRegistry.handleBlur(realId);
  }, [realId]);

  const ringColor = focusColor || colors.buttonPrimaryBg;

  return (
    <Pressable
      testID={testID}
      ref={nodeRef as any}
      // Android TV：focusable 声明该节点可被方向键聚焦
      focusable={!disabled}
      nextFocusDown={nextFocusDownTag}
      nextFocusUp={nextFocusUpTag}
      onLayout={onLayout}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...(onKeyDown ? ({ onKeyDown } as any) : null)}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[style, isFocused ? focusStyle : null]}
    >
      {children}
      {showFocusRing && isFocused ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -TV_FIXED.focusRingWidth,
            left: -TV_FIXED.focusRingWidth,
            right: -TV_FIXED.focusRingWidth,
            bottom: -TV_FIXED.focusRingWidth,
            borderWidth: TV_FIXED.focusRingWidth,
            borderColor: ringColor,
            borderRadius: TV_FIXED.radius + TV_FIXED.focusRingWidth,
          }}
        />
      ) : null}
    </Pressable>
  );
}

export default TVFocusable;