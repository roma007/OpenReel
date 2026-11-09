import { ExpoSqliteProvider, type MigrationProgress } from '@openreel/expo-db';
import { DevSettings } from 'react-native';
import {
  createAppStore,
  CollectorService,
  SystemConfigService,
  getCurrentStoreApiVersion,
  getStoreApiVersion,
  setCollectKeepAwakeHandler,
  type AppStore,
  type AppState,
  type CollectTask,
  setFreeDiskProvider,
  getFreeDiskBytes,
  formatBytes,
  LOW_FREE_BYTES_WARN,
} from '@openreel/core';
import { initialsOfMedia } from './services/initials';

/**
 * TV 端单例容器。
 *
 * 与手机端 apps/mobile/src/init.ts 同结构。启动时自动采集逻辑已在三端统一
 * （延迟 5s 检查 autoOnStartup，开启则执行一次增量采集，无常驻定时器）。
 */
const SINGLETONS_KEY = '__OPENREEL_TV_SINGLETONS__';

interface AppSingletons {
  provider: ExpoSqliteProvider | null;
  store: AppStore | null;
  collector: CollectorService | null;
  initPromise: Promise<void> | null;
}

function getSingletons(): AppSingletons {
  const g = globalThis as any;
  if (!g[SINGLETONS_KEY]) {
    g[SINGLETONS_KEY] = { provider: null, store: null, collector: null, initPromise: null };
  }
  return g[SINGLETONS_KEY];
}

export async function initApp(options?: {
  onMigrationProgress?: (p: MigrationProgress) => void;
}): Promise<void> {
  const s = getSingletons();
  if (s.initPromise) return s.initPromise;
  s.initPromise = (async () => {
    const provider = new ExpoSqliteProvider(options);
    await provider.init();
    s.provider = provider;

    // TV 端首字母搜索索引（拼音/首字母）：建表 + 启动后 5s 后台回填存量。
    // 建表/回填失败仅记录日志，不影响应用启动与原有搜索路径。
    try {
      await provider.enableInitialsSearch(initialsOfMedia);
      setTimeout(() => {
        provider
          .backfillInitials()
          .then((n) => {
            if (n > 0) console.log(`[TV] 首字母索引回填完成（${n} 条）`);
          })
          .catch((err) => console.error('[TV] 首字母索引回填失败:', err));
      }, 5000);
    } catch (err) {
      console.error('[TV] 首字母搜索索引初始化失败:', err);
    }

    const store = createAppStore(provider);
    const collector = new CollectorService(provider);
    s.store = store;
    s.collector = collector;

    // 采集期保活：全量采集是小时级长任务，锁屏后系统会回收进程。这里注册 expo-keep-awake，
    // 采集开始保持屏幕常亮、结束自动释放（桌面端不注册，不产生副作用）。
    try {
      const { activateKeepAwakeAsync, deactivateKeepAwake } = await import('expo-keep-awake');
      // Android 额外挂前台服务：锁屏/切后台时进程优先级更高，采集不易被系统回收。
      // iOS 无此模块（requireOptionalNativeModule 返回 null），自动退化为仅 keep-awake。
      const { startCollectionForeground, stopCollectionForeground } = await import('expo-collection-foreground');
      setCollectKeepAwakeHandler((active) => {
        if (active) {
          activateKeepAwakeAsync('openreel-collect').catch(() => {});
          startCollectionForeground('正在采集片库', '采集会在后台继续，完成后自动结束');
        } else {
          deactivateKeepAwake('openreel-collect');
          stopCollectionForeground();
        }
      });
    } catch (err) {
      console.warn('[TV] 采集保活不可用（不影响采集）:', err);
    }

    // 存储守卫：注册可用空间查询；空间偏低时顺手清理详情缓存（采集前还会再校验）
    try {
      const { getFreeDiskStorageAsync } = await import('expo-file-system/legacy');
      setFreeDiskProvider(async () => {
        const v = await getFreeDiskStorageAsync();
        return Number.isFinite(Number(v)) ? Number(v) : null;
      });
      const free = await getFreeDiskBytes(true);
      if (free !== null && free < LOW_FREE_BYTES_WARN) {
        console.warn(`[TV] 磁盘空间偏低（可用 ${formatBytes(free)}），清理详情缓存`);
        await getProvider().pruneMediaDetailCache(50).catch(() => 0);
      }
    } catch (err) {
      console.warn('[TV] 存储守卫不可用（不影响采集）:', err);
    }

    // 启动恢复：上次进程被杀残留的 RUNNING/PENDING 任务复位为可续采并排队自动续采
    let interruptedTasks: CollectTask[] = [];
    try {
      interruptedTasks = await store.getState().recoverInterruptedTasks();
      if (interruptedTasks.length > 0) {
        console.log(`[TV] 发现 ${interruptedTasks.length} 个被中断的采集任务，将自动续采`);
      }
    } catch (err) {
      console.error('[TV] 恢复中断任务失败:', err);
    }

    // 启动时自动采集检查（有需续采的任务时让位给续采）
    try {
      const cfgService = new SystemConfigService(provider);
      const config = await cfgService.getCollectConfig();
      if (config.autoOnStartup && interruptedTasks.length === 0) {
        const sources = await provider.getEnabledVideoSources();
        if (sources.length > 0) {
          // 延迟触发启动采集，等待网络与界面稳定
          setTimeout(async () => {
            try {
              await cfgService.setString('collect.autoLastRunAt', new Date().toISOString());
              await store.getState().collectLatest('auto');
              console.log('[TV] 启动时自动采集完成');
            } catch (err) {
              console.error('[TV] 启动时自动采集失败:', err);
            }
          }, 5000);
        }
      }
    } catch (err) {
      console.error('[TV] 启动时自动采集检查失败:', err);
    }

    // 自动续采：延迟到界面稳定、DB 维护跑完之后，顺序逐个源续采
    if (interruptedTasks.length > 0) {
      const toResume = interruptedTasks;
      setTimeout(() => {
        store
          .getState()
          .autoResumeCollectTasks(toResume)
          .then(({ resumed, failed }) => {
            console.log(`[TV] 自动续采结束：成功 ${resumed} 个，失败 ${failed} 个`);
          })
          .catch((err) => console.error('[TV] 自动续采失败:', err));
      }, 8000);
    }

    // 索引体检：收藏 + 观看历史里的片子提前校验/自愈（后台串行，失败静默，不阻塞启动）
    setTimeout(() => {
      store
        .getState()
        .repairUserMediaIndex()
        .then((r) => {
          if (r.checked > 0) {
            console.log(`[TV] 索引体检：处理 ${r.checked}/${r.total}，修复 ${r.healed}，失败 ${r.failed}`);
          }
        })
        .catch((err) => console.warn('[TV] 索引体检失败:', err));
    }, 12000);

    // 「越看越懂你」：有变化或无推荐快照时后台重建一次（沿用手机端逻辑，仍属用户可见功能）
    try {
      const need = await store.getState().recommendationNeedsStartupRecompute();
      if (need) {
        setTimeout(() => {
          store
            .getState()
            .flushRecommendationRecompute()
            .then((changed) => {
              if (changed > 0) console.log(`[TV] 推荐分重建完成（${changed} 条变化）`);
            })
            .catch((err) => console.error('[TV] 推荐分重建失败:', err));
        }, 3000);
      }
    } catch (err) {
      console.error('[TV] 启动推荐分重建调度失败:', err);
    }
  })();
  return s.initPromise;
}

export function getStore(): AppStore {
  const store = getSingletons().store;
  if (!store) throw new Error('initApp() must be called before getStore()');
  const current = getCurrentStoreApiVersion();
  if (typeof current === 'string' && getStoreApiVersion(store) !== current) {
    if (__DEV__) DevSettings.reload();
  }
  return store;
}

export function getCollector(): CollectorService {
  const collector = getSingletons().collector;
  if (!collector) throw new Error('initApp() must be called before getCollector()');
  return collector;
}

export function getProvider(): ExpoSqliteProvider {
  const provider = getSingletons().provider;
  if (!provider) throw new Error('initApp() must be called before getProvider()');
  return provider;
}

export type { AppState };