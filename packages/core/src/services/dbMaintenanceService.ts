/**
 * 数据库维护服务（跨端统一）。
 *
 * 背景（实测）：全量采集一次会写入 30 万+ 行，并伴随大量「同片多源合并」UPDATE。
 * SQLite 的行是按写入时机散落的 —— 逻辑上按 id 有序，物理上在文件里跳跃。
 * 之后按索引回表（例如 `kid_safe=1 AND hidden=0` 命中 22.8 万行）会变成 22.8 万次随机跳页：
 * 实测同一份数据 1770ms → VACUUM 后 47ms。
 *
 * 策略（不做「每次启动都 VACUUM」）：
 *  - 事件触发：全量采集完成 / 迁移收尾失败 → 写 pending 标记；
 *  - 启动时（桌面延迟到 UI 就绪后）检查 pending 或 freelist 过大，满足磁盘条件才执行；
 *  - 设置页提供手动入口；
 *  - 成功写 lastVacuumAt 并清 pending；失败保留 pending，下次再试。
 */
import type { DatabaseProvider } from '../db/provider';
import { SystemConfigService } from './systemConfigService';
import { getFreeDiskBytes } from './storageGuard';

/** 小于这个体积不值得 VACUUM（收益低、耗时固定） */
export const MIN_VACUUM_DB_BYTES = 50 * 1024 * 1024;
/** VACUUM 需要约 2 倍库大小的临时空间，另留 256MB 余量 */
export const VACUUM_FREE_MARGIN_BYTES = 256 * 1024 * 1024;
/** freelist 超过该页数（默认 4KB/页 ≈ 78MB）视为需要回收（迁移删表后的典型场景） */
export const FREELIST_PAGES_THRESHOLD = 20000;

const PENDING_KEY = 'db.maintenance.pending';
const LAST_VACUUM_KEY = 'db.maintenance.lastVacuumAt';
const LAST_SIZE_KEY = 'db.maintenance.lastSizeBytes';

export interface DbSizeSnapshot {
  bytes: number;
  pageCount: number;
  pageSize: number;
  freelistPages: number;
  freelistBytes: number;
}

export interface AutoRunDecision {
  ok: boolean;
  reason: string;
  snapshot: DbSizeSnapshot;
  freeBytes: number | null;
  requiredBytes: number;
}

export interface VacuumResult {
  ok: boolean;
  error?: string;
  beforeBytes: number;
  afterBytes: number;
}

/** 触发原因（落库便于排查） */
export type MaintenanceReason = 'full-collect' | 'slim-migration' | 'manual' | 'startup' | 'unknown';

export class DbMaintenanceService {
  private config: SystemConfigService;
  private freeBytesFn: () => Promise<number | null>;

  constructor(private db: DatabaseProvider, opts?: { freeBytes?: () => Promise<number | null> }) {
    this.config = new SystemConfigService(db);
    // 允许调用方注入可用空间来源：移动端 DB init 阶段 storageGuard 的 provider 尚未注册
    this.freeBytesFn = opts?.freeBytes ?? (() => getFreeDiskBytes(true));
  }

  async getSnapshot(): Promise<DbSizeSnapshot> {
    const info = await this.db.getDbSizeInfo();
    const bytes = info.pageCount * info.pageSize;
    return {
      ...info,
      bytes,
      freelistBytes: info.freelistPages * info.pageSize,
    };
  }

  async markPending(reason: MaintenanceReason): Promise<void> {
    try {
      await this.config.setString(PENDING_KEY, reason);
    } catch {
      // 标记失败不阻断主流程
    }
  }

  async getPendingReason(): Promise<string> {
    try {
      return (await this.config.getString(PENDING_KEY, '')) || '';
    } catch {
      return '';
    }
  }

  async getLastVacuumAt(): Promise<string> {
    try {
      return (await this.config.getString(LAST_VACUUM_KEY, '')) || '';
    } catch {
      return '';
    }
  }

  async getLastSize(): Promise<number | null> {
    try {
      const v = await this.config.getNumber(LAST_SIZE_KEY, -1);
      return v >= 0 ? v : null;
    } catch {
      return null;
    }
  }

  /**
   * 判断启动时是否应该自动执行。
   * 条件：库 ≥ 50MB，且（有 pending 标记 或 freelist 超阈值），且磁盘 ≥ 2×库 + 256MB。
   */
  async shouldAutoRun(): Promise<AutoRunDecision> {
    const snapshot = await this.getSnapshot();
    const requiredBytes = snapshot.bytes * 2 + VACUUM_FREE_MARGIN_BYTES;
    const pending = await this.getPendingReason();

    if (snapshot.bytes < MIN_VACUUM_DB_BYTES) {
      return { ok: false, reason: '库体积较小，无需压缩', snapshot, freeBytes: null, requiredBytes };
    }
    const freelistBig = snapshot.freelistPages >= FREELIST_PAGES_THRESHOLD;
    if (!pending && !freelistBig) {
      return { ok: false, reason: '无待处理标记', snapshot, freeBytes: null, requiredBytes };
    }

    const freeBytes = await this.freeBytesFn();
    if (freeBytes !== null && freeBytes < requiredBytes) {
      return {
        ok: false,
        reason: `磁盘空间不足（需要约 ${Math.ceil(requiredBytes / 1048576)}MB，当前 ${Math.floor(freeBytes / 1048576)}MB）`,
        snapshot,
        freeBytes,
        requiredBytes,
      };
    }

    return {
      ok: true,
      reason: pending ? `待处理：${pending}` : `freelist ${snapshot.freelistPages} 页`,
      snapshot,
      freeBytes,
      requiredBytes,
    };
  }

  /**
   * 执行 VACUUM（不做磁盘校验，调用方按需先 shouldAutoRun）。
   * 成功：写 lastVacuumAt / lastSizeBytes 并清 pending；失败：保留 pending 供下次重试。
   */
  async runVacuum(): Promise<VacuumResult> {
    const before = await this.getSnapshot();
    try {
      await this.db.runVacuum();
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        beforeBytes: before.bytes,
        afterBytes: before.bytes,
      };
    }
    const after = await this.getSnapshot();
    try {
      await this.config.setString(LAST_VACUUM_KEY, new Date().toISOString());
      await this.config.setNumber(LAST_SIZE_KEY, after.bytes);
      await this.config.setString(PENDING_KEY, '');
    } catch {
      // 记录失败不影响压缩结果
    }
    return { ok: true, beforeBytes: before.bytes, afterBytes: after.bytes };
  }

  /** 自动执行入口：条件满足才跑，适合启动后台调用 */
  async runIfNeeded(): Promise<{ ran: boolean; decision: AutoRunDecision; result?: VacuumResult }> {
    const decision = await this.shouldAutoRun();
    if (!decision.ok) return { ran: false, decision };
    const result = await this.runVacuum();
    return { ran: true, decision, result };
  }
}
