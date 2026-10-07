import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNavigationContainerRef } from '@react-navigation/native';
import { focusRegistry } from './registry';

/**
 * TV 焦点桥（全局挂载一次）。
 *
 * 背景（自查发现，非推测）：`focusRegistry.requestInitialFocus()` 与 `recoverFocus()`
 * 在未接线前无人调用，页面里「挂载后申请初始焦点」是空动作；方向键切换页面后
 * 原焦点视图已随页面卸载，若不补焦点，遥控会「按了没反应」。
 *
 * 职责边界：
 *  - **不接管方向键**：DPAD 目标搜索交给 Android 原生 FocusFinder（RN 已实现），
 *    本模块只在「当前没有有效焦点」时补一次焦点，避免两套搜索互相打架。
 *  - 补焦点的时机：registry 变化（元素注册/注销/焦点变化）、页面切换完成、
 *    应用从后台回前台，以及**焦点看门狗**兜底（见下）。
 *  - 焦点看门狗：原生 FocusFinder 在「目标方向上没有候选元素」时会静默丢弃焦点，
 *    此时没有任何 registry / 导航 / 前后台事件可触发补焦点。实测长时间乱序操作后
 *    会出现「连续按方向键都无焦点环、且不自愈」。故周期性检测「当前无有效焦点」，
 *    一旦发现就按 recoverFocus 规则（当前 → pending → lastFocusedId → 首元素）补回。
 */
export function TVFocusBridge() {
  const navRef = useNavigationContainerRef();

  useEffect(() => {
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // 重试链持有的目标：必须存在闭包里而不是每次重读 pendingFocusId，
    // 因为原生在页面挂载后会先把焦点给「另一个」元素（如 search-back），
    // handleFocus 会顺手把 pendingFocusId 清空 —— 若重试时重读，重试链当场断掉，
    // 页面声明的初始焦点永远等不到（2026-10-05 logcat 实证）。
    let retryTarget: string | null = null;
    let attempts = 0;

    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const stopRetry = () => {
      clearRetry();
      retryTarget = null;
      attempts = 0;
    };

    const tryFocus = (target: string) => {
      const requested = focusRegistry.focusNode(target);
      // View.focus() 对尚未 attach / 未 layout 的原生视图会静默失败，RN 侧收不到 onFocus。
      // 2026-10-05 实测：进入详情页时 ensure 两次都返回 ok=true，但焦点始终没落到
      // detail-play（logcat 无 `[TVFocus] focus ->`）。故按递增间隔重试若干次，
      // 直到 registry 真的记录到焦点，或元素已不存在。
      if (!requested) return;
      if (focusRegistry.isFocused(target)) {
        stopRetry();
        return;
      }
      attempts += 1;
      if (attempts > 6 || !focusRegistry.has(target)) {
        // 目标已消失：若它是页面声明的初始焦点，放弃声明，别一直抢
        if (focusRegistry.getPendingFocusId() === target) focusRegistry.clearPendingFocus();
        stopRetry();
        return;
      }
      clearRetry();
      retryTimer = setTimeout(() => {
        if (retryTarget && focusRegistry.has(retryTarget)) tryFocus(retryTarget);
        else stopRetry();
      }, attempts * 120);
    };

    const ensureFocus = () => {
      // 待生效的初始焦点优先于「当前焦点」：页面挂载后原生 FocusFinder 会先给某个
      // 可聚焦元素，此时 focusedId 已非空，若直接返回，页面声明的初始焦点永不生效。
      const pending = focusRegistry.getPendingFocusId();
      if (pending && focusRegistry.has(pending)) {
        if (pending !== retryTarget) {
          clearRetry();
          retryTarget = pending;
          attempts = 0;
        }
        tryFocus(pending);
        return;
      }

      // 重试链还在跑：继续追同一个目标，不被其他元素的焦点变化打断
      if (retryTarget) {
        if (focusRegistry.has(retryTarget) && !focusRegistry.isFocused(retryTarget)) tryFocus(retryTarget);
        else stopRetry();
        return;
      }

      const cur = focusRegistry.getFocusedId();
      // 已有有效焦点：不干预（原生焦点才是唯一事实来源）
      if (cur && focusRegistry.has(cur)) return;
      const target = focusRegistry.recoverFocus();
      if (!target) return;
      retryTarget = target;
      attempts = 0;
      tryFocus(target);
    };

    // 合并同一帧内的多次 registry 变化，避免布局未完成就抢焦点
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (timer) clearTimeout(timer);
        timer = setTimeout(ensureFocus, 0);
      });
    };

    const unsubscribe = focusRegistry.subscribe(schedule);
    schedule();

    // 页面切换完成后再兜一次：新页面元素注册与转场动画不同步
    const unsubState = navRef.addListener('state', schedule);

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') schedule();
    });

    // 焦点看门狗：详见文件头「焦点看门狗」说明。
    // 只在「当前无有效焦点」时触发，避免与原生 FocusFinder 争抢方向键。
    const watchdog = setInterval(() => {
      if (!focusRegistry.getFocusedId()) schedule();
    }, 600);

    return () => {
      unsubscribe();
      unsubState();
      appSub.remove();
      clearInterval(watchdog);
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      stopRetry();
    };
  }, [navRef]);

  return null;
}

export default TVFocusBridge;