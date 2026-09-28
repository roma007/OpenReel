import type { MigrationProgress, MigrationDiskError } from '../db/tauriSqlProvider';

interface MigrationOverlayProps {
  /** 主键 INTEGER 数据库升级进行中：全屏占位（不透明背景 + 提示文案 + 进度条）。 */
  migrating?: boolean;
  /** 迁移进度（百分比 + 阶段文案）。 */
  migrationProgress?: MigrationProgress | null;
  /** 磁盘空间不足：渲染升级引导页（不执行迁移、不进入应用）。 */
  diskBlocked?: MigrationDiskError | null;
}

/**
 * 数据库升级占位层（桌面端）。
 *
 * 与欢迎页/初始广告（应用启动序列，SplashOverlay）**分离**：本组件不属于启动序列，
 * 任何时候只要处于迁移中或磁盘空间不足都必须显示，刷新（reload）也不例外。
 */
export function MigrationOverlay({ migrating = false, migrationProgress, diskBlocked }: MigrationOverlayProps) {
  if (!migrating && !diskBlocked) return null;

  // 磁盘空间不足引导页：关闭窗口退出应用（新版不提供"用旧库半残继续"）
  const closeWindow = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      /* ignore */
    }
  };
  const gb = (n: number) => `${(n / 1073741824).toFixed(1)}GB`;
  const progress = migrationProgress?.percent ?? 0;
  const stageLabel = migrationProgress?.label ?? '';

  return (
    <div className="fixed inset-0 z-[1001] select-none">
      {/* 数据库升级占位层（主键 INTEGER 迁移期间）：不透明全屏，禁止误关闭 */}
      {migrating && (
        <div className="absolute inset-0 z-[1002] flex flex-col items-center justify-center bg-[#0b0f19]">
          <img
            src="/logo.png"
            alt="logo"
            draggable={false}
            className="h-28 w-28 rounded-2xl object-cover shadow-2xl"
          />
          <div className="mt-4 text-lg font-bold tracking-wide text-white/90">MovieApp</div>
          <div className="mt-6 max-w-md text-center text-sm text-white/80">
            {stageLabel
              ? `正在升级数据库（${progress}%）：${stageLabel}`
              : '正在升级数据库，请勿关闭应用…'}
          </div>
          <div className="mt-5 h-2 w-80 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/90 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-white/50">{progress}%</div>
        </div>
      )}

      {/* 磁盘空间不足升级引导页：不透明全屏，告知升级好处/为何需 2 倍空间/装回旧版指引 */}
      {diskBlocked && (
        <div className="absolute inset-0 z-[1003] flex items-center justify-center bg-[#0b0f19] p-8">
          <div className="max-w-md rounded-2xl bg-[#141a2e] p-8 shadow-2xl">
            <div className="text-lg font-bold text-white/95">需要升级数据库，当前空间不足</div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/85">
              <p>
                本次免费升级将带来：<br />
                ① 数据库体积大幅缩小（实测同量级数据约 5.9GB → 1.3GB）；<br />
                ② 数据读取更快更稳定；<br />
                ③ 修复观看历史、我的追剧错乱。升级全程自动完成，可中断续跑。
              </p>
              <p>
                升级需要约 <span className="text-amber-300">{gb(diskBlocked.need)}</span>{' '}
                临时空间：迁移过程需同时容纳新旧两套数据的重建（约为数据库大小 ×2），
                属于一次性成本，升级完成后会自动回收。
              </p>
              <p className="text-amber-300">
                当前：需要约 {gb(diskBlocked.need)}，可用 {gb(diskBlocked.free)}。
              </p>
              <p>
                请先安装回旧版本继续正常使用；待腾出约 {gb(diskBlocked.need)}{' '}
                空间后，再安装本新版本并打开，应用将自动完成升级。
              </p>
            </div>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium text-white/95 transition-colors hover:bg-white/15"
              onClick={closeWindow}
            >
              我知道了（退出应用）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
