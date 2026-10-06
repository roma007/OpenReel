/**
 * TV 焦点系统：注册表 + 空间方向几何兜底。
 *
 * 依据：tvhome-tv 实测 `leanback_only=true`（无触摸），故 DPAD 是唯一输入。
 * RN 自带 `focusable` / `nextFocusUp|Down|Left|Right` 为第一优先路径；
 * 但横向长列表中「焦点移出可视区」时 RN 无法给出行外目标，本模块负责：
 *   1. 记录每个可聚焦元素当前屏幕矩形（measure + 焦点变化时刷新）
 *   2. DPAD 事件到来时，按几何最近邻（加权距离 + 方向锥角过滤）选出目标
 *   3. 目标优先取「同行且在目标方向上最靠边」的元素，实现纵向列表行切换
 *
 * 明确不做：不伪造任何焦点状态；焦点真实来自 RN 的 onFocus/onBlur 回调。
 */

export type FocusDir = 'up' | 'down' | 'left' | 'right';

export interface FocusEntry {
  id: string;
  /** measured in window coords (dp) */
  rect: { x: number; y: number; width: number; height: number };
  /** 所属横向行 id：同一行内做左右移动，不跳出该行 */
  rowId?: string;
  disabled?: boolean;
  onFocus?: () => void;
  /** 取原生节点（用于 requestInitialFocus / 焦点恢复时主动 .focus()） */
  getNode?: () => { focus?: () => void } | null;
}

interface RegistryEntry extends FocusEntry {
  focused: boolean;
}

type Listener = () => void;

/** 方向向量 */
const DIR_VEC: Record<FocusDir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

class FocusRegistry {
  private entries = new Map<string, RegistryEntry>();
  private focusedId: string | null = null;
  /** 最近一次真正拿到焦点的 id（失焦后不清），用于「焦点丢失时恢复原位」 */
  private lastFocusedId: string | null = null;
  private listeners = new Set<Listener>();
  /** 元素注册后主动申请焦点的标记（首个可聚焦元素 / 页面切换后的初始焦点） */
  private pendingFocusId: string | null = null;
  /** 焦点监狱：模态层（键盘/面板）打开期间，焦点不得落到 id 不以栈顶前缀开头的元素 */
  private scopes: Array<{ prefix: string; focusId: string | null }> = [];

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  register(entry: FocusEntry) {
    const prev = this.entries.get(entry.id);
    this.entries.set(entry.id, {
      ...entry,
      // 已注册过则保留 focused 状态，避免列表重渲染导致焦点闪断
      focused: prev?.focused ?? false,
    });
    this.emit();
  }

  unregister(id: string) {
    if (!this.entries.has(id)) return;
    this.entries.delete(id);
    if (this.focusedId === id) this.focusedId = null;
    this.emit();
  }

  /** 更新矩形（由 onLayout / measure 回调写入） */
  updateRect(id: string, rect: FocusEntry['rect']) {
    const e = this.entries.get(id);
    if (!e) return;
    // 容差 0.5dp：亚像素抖动不应触发无谓重排
    if (
      Math.abs(e.rect.x - rect.x) < 0.5 &&
      Math.abs(e.rect.y - rect.y) < 0.5 &&
      Math.abs(e.rect.width - rect.width) < 0.5 &&
      Math.abs(e.rect.height - rect.height) < 0.5
    ) {
      return;
    }
    e.rect = rect;
  }

  setDisabled(id: string, disabled: boolean) {
    const e = this.entries.get(id);
    if (!e || e.disabled === disabled) return;
    e.disabled = disabled;
    if (disabled && this.focusedId === id) this.focusedId = null;
    this.emit();
  }

  /** RN onFocus 回调 */
  handleFocus(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    const scope = this.scopes[this.scopes.length - 1];
    if (scope && !id.startsWith(scope.prefix)) {
      // 焦点监狱：原生焦点已经跑出模态层，把焦点弹回层内最后一次聚焦的元素
      const back =
        (scope.focusId && this.entries.get(scope.focusId) ? scope.focusId : null) ||
        (this.pendingFocusId?.startsWith(scope.prefix) ? this.pendingFocusId : null) ||
        this.firstInScope(scope.prefix);
      if (back && back !== id) this.focusNode(back);
      return;
    }
    this.entries.forEach((x) => {
      x.focused = x.id === id;
    });
    this.focusedId = id;
    this.lastFocusedId = id;
    // 只有「待生效目标真的拿到焦点」才清声明。若被别的元素（原生 FocusFinder 在页面
    // 挂载时会先给 search-back 这类元素）抢走就清掉，声明会永久失效 —— 2026-10-05
    // 实测搜索页初始焦点 search-input 因此从未生效。剩余声明由 TVFocusBridge 的
    // 重试链负责：拿到焦点、或元素消失、或重试超限时才清。
    if (!this.pendingFocusId || this.pendingFocusId === id) this.pendingFocusId = null;
    if (scope) scope.focusId = id;
    e.onFocus?.();
    this.emit();
  }

  handleBlur(id: string) {
    const e = this.entries.get(id);
    if (!e || !e.focused) return;
    e.focused = false;
    if (this.focusedId === id) this.focusedId = null;
    this.emit();
  }

  isFocused(id: string): boolean {
    return this.focusedId === id;
  }

  getFocusedId(): string | null {
    return this.focusedId;
  }

  /** 页面挂载时请求初始焦点（页面级第一个可聚焦元素） */
  requestInitialFocus(id: string) {
    this.pendingFocusId = id;
    this.emit();
  }

  /**
   * 读待生效的初始焦点。
   *
   * 必须由 TVFocusBridge **优先**于「当前焦点」判断：页面挂载后原生 FocusFinder 会先
   * 给某个可聚焦元素（实测搜索页先给 `search-back`），此时 focusedId 已非空，
   * 若按 focusedId 直接返回，页面声明的初始焦点就永远不会生效。
   */
  getPendingFocusId(): string | null {
    return this.pendingFocusId;
  }

  /** 放弃待生效的初始焦点（原生 focus 反复失败超过重试上限时调用，避免死循环抢焦点） */
  clearPendingFocus() {
    this.pendingFocusId = null;
  }

  /** 取注册表里第一个可聚焦元素 id（用于列表为空时的兜底目标） */
  firstFocusableId(): string | null {
    for (const e of this.entries.values()) {
      if (!e.disabled) return e.id;
    }
    return null;
  }

  /** 前缀内的第一个可聚焦元素 */
  private firstInScope(prefix: string): string | null {
    for (const e of this.entries.values()) {
      if (!e.disabled && e.id.startsWith(prefix)) return e.id;
    }
    return null;
  }

  /** 打开模态层（焦点监狱）：焦点只能落在 id 以 prefix 开头的元素上 */
  pushScope(prefix: string) {
    this.scopes.push({ prefix, focusId: null });
  }

  /** 关闭模态层 */
  popScope() {
    if (this.scopes.length > 0) this.scopes.pop();
  }

  private center(e: RegistryEntry) {
    return {
      x: e.rect.x + e.rect.width / 2,
      y: e.rect.y + e.rect.height / 2,
    };
  }

  /**
   * 空间最近邻选焦点。
   * 规则：
   *  - 只考虑目标方向锥角内的元素（方向点积 > 0，支持斜向容差）
   *  - 同行（rowId 相同）时优先同行元素，实现左右移动不跳行
   *  - 排序：同行优先 → 轴向距离小 → 交叉轴偏移小
   */
  resolveDirection(fromId: string, dir: FocusDir): string | null {
    const from = this.entries.get(fromId);
    if (!from) return null;
    const fc = this.center(from);
    const [vx, vy] = DIR_VEC[dir];

    const candidates = Array.from(this.entries.values()).filter((e) => {
      if (e.id === fromId || e.disabled) return false;
      const c = this.center(e);
      const dx = c.x - fc.x;
      const dy = c.y - fc.y;
      // 必须在目标方向上（点积为正）；留 0.25 容差允许斜向元素
      const dot = dx * vx + dy * vy;
      if (dot <= 0) return false;
      // 交叉轴偏移不能超过主轴距离（避免横向移动跳到很远的行）
      const cross = Math.abs(vx === 0 ? dx : dy);
      const main = Math.abs(vx === 0 ? dy : dx);
      if (main <= 0.5) return false;
      if (cross > main * 2.5) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    const scored = candidates.map((e) => {
      const c = this.center(e);
      const dx = c.x - fc.x;
      const dy = c.y - fc.y;
      const main = Math.abs(vx === 0 ? dy : dx);
      const cross = Math.abs(vx === 0 ? dx : dy);
      const sameRow = !!from.rowId && e.rowId === from.rowId;
      // 权重：主轴 1.0，交叉轴 1.6（惩罚斜向），同行额外 +6 奖励
      const score = main + cross * 1.6 - (sameRow ? 6 : 0);
      return { id: e.id, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored[0].id;
  }

  /** 兜底：当前无焦点时给出可恢复的目标 */
  recoverFocus(): string | null {
    if (this.focusedId && this.entries.get(this.focusedId)) return this.focusedId;
    if (this.pendingFocusId && this.entries.get(this.pendingFocusId)?.disabled !== true) {
      return this.pendingFocusId;
    }
    // 优先恢复「上次拿到焦点的元素」，而不是直接跳回首元素。
    // 实测（2026-10-05 logcat + uiautomator）：任何导致原生视图重建的更新
    // （改 opacity、按钮 disabled 翻转、换集重渲染…）都会让已聚焦的视图丢掉焦点，
    // 桥只能补焦点。若一律补到首元素，用户会发现「按完下一集，焦点莫名跳回返回键」。
    const last = this.lastFocusedId ? this.entries.get(this.lastFocusedId) : undefined;
    if (last && last.disabled !== true) return last.id;
    return this.firstFocusableId();
  }

  /** 该 id 当前是否仍注册（用于焦点恢复判断） */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * 主动把焦点给到指定 id（页面初始焦点 / 焦点丢失恢复）。
   * 返回是否成功派发，供调用方决定是否继续等待。
   */
  focusNode(id: string): boolean {
    const e = this.entries.get(id);
    if (!e || e.disabled) return false;
    const node = e.getNode?.();
    if (!node || typeof node.focus !== 'function') return false;
    node.focus();
    return true;
  }

  /** 仅测试/诊断用：快照 */
  snapshot() {
    return {
      focusedId: this.focusedId,
      pendingFocusId: this.pendingFocusId,
      count: this.entries.size,
    };
  }
}

export const focusRegistry = new FocusRegistry();