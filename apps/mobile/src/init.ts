import { ExpoSqliteProvider, type MigrationProgress } from './db/expoSqliteProvider';
import { DevSettings } from 'react-native';
import { createAppStore, CollectorService, SystemConfigService, getCurrentStoreApiVersion, getStoreApiVersion, setCollectKeepAwakeHandler, type AppStore, type AppState, type CollectTask } from '@openreel/core';

/**
 * 单例容器挂在 globalThis 上，保证 RN Fast Refresh（模块重执行）后单例不丢失。
 * 若使用模块级变量，Metro Fast Refresh 重执行 init.ts 时 _store/_initPromise 会被重置
 * 而 App 组件不会重新挂载（ready 仍为 true），触发
 * "initApp() must be called before getStore()"。
 */
const SINGLETONS_KEY = '__MOVIE_APP_SINGLETONS__';

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

/**
 * 初始化应用：创建 DatabaseProvider → 建表 → 注入 store 和 collector。
 * 幂等：多次调用返回同一个 Promise。
 */
export async function initApp(options?: { onMigrationProgress?: (p: MigrationProgress) => void }): Promise<void> {
  const s = getSingletons();
  if (s.initPromise) return s.initPromise;
  s.initPromise = (async () => {
    const provider = new ExpoSqliteProvider(options);
    await provider.init();
    s.provider = provider;
    const store = createAppStore(provider);
    const collector = new CollectorService(provider);
    s.store = store;
    s.collector = collector;

    // 采集期保活：全量采集是小时级长任务，锁屏后系统会回收进程。这里注册 expo-keep-awake，
    // 采集开始保持屏幕常亮、结束自动释放（桌面端不注册，不产生副作用）。
    try {
      const { activateKeepAwakeAsync, deactivateKeepAwake } = await import('expo-keep-awake');
      setCollectKeepAwakeHandler((active) => {
        if (active) {
          activateKeepAwakeAsync('openreel-collect').catch(() => {});
        } else {
          deactivateKeepAwake('openreel-collect');
        }
      });
    } catch (err) {
      console.warn('[INIT] 采集保活不可用（不影响采集）:', err);
    }

    // 启动恢复：上次进程被系统杀掉时残留的 RUNNING/PENDING 任务不再直接判死，
    // 复位为可续采并排队自动续采（采集可能跨多次启动拼完）。
    let interruptedTasks: CollectTask[] = [];
    try {
      interruptedTasks = await store.getState().recoverInterruptedTasks();
      if (interruptedTasks.length > 0) {
        console.log(`[INIT] 发现 ${interruptedTasks.length} 个被中断的采集任务，将自动续采`);
      }
    } catch (err) {
      console.error('[INIT] 恢复中断任务失败:', err);
    }

    // 启动时自动采集检查（有需续采的任务时让位给续采，避免两个采集并发抢源站/写锁）
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
              console.log('[INIT] 启动时自动采集完成');
            } catch (err) {
              console.error('[INIT] 启动时自动采集失败:', err);
            }
          }, 5000);
        }
      }
    } catch (err) {
      console.error('[INIT] 启动时自动采集检查失败:', err);
    }

    // 自动续采：延迟到界面稳定、DB 初始化维护跑完之后，顺序逐个源续采
    if (interruptedTasks.length > 0) {
      const toResume = interruptedTasks;
      setTimeout(() => {
        store
          .getState()
          .autoResumeCollectTasks(toResume)
          .then(({ resumed, failed }) => {
            console.log(`[INIT] 自动续采结束：成功 ${resumed} 个，失败 ${failed} 个`);
          })
          .catch((err) => console.error('[INIT] 自动续采失败:', err));
      }, 8000);
    }

    // 索引体检：收藏 + 观看历史里的片子提前校验/自愈（后台串行，失败静默，不阻塞启动）
    setTimeout(() => {
      store
        .getState()
        .repairUserMediaIndex()
        .then((r) => {
          if (r.checked > 0) {
            console.log(`[INIT] 索引体检：处理 ${r.checked}/${r.total}，修复 ${r.healed}，失败 ${r.failed}`);
          }
        })
        .catch((err) => console.warn('[INIT] 索引体检失败:', err));
    }, 12000);

    // 「越看越懂你」：仅当有变化或尚无推荐快照时才在后台重建一次，
    // 避免每次启动都跑全量重算（其打分循环在大数据量下会占满主线程导致卡顿）
    try {
      const need = await store.getState().recommendationNeedsStartupRecompute();
      if (need) {
        setTimeout(() => {
          store.getState().flushRecommendationRecompute().then((changed) => {
            if (changed > 0) console.log(`[INIT] 推荐分重建完成（${changed} 条变化）`);
          }).catch((err) => {
            console.error('[INIT] 推荐分重建失败:', err);
          });
        }, 3000);
      }
    } catch (err) {
      console.error('[INIT] 启动推荐分重建调度失败:', err);
    }
  })();
  return s.initPromise;
}

export function getStore(): AppStore {
  const store = getSingletons().store;
  if (!store) throw new Error('initApp() must be called before getStore()');
  // store 单例由 globalThis 承载，Fast Refresh 不会重建它。若 core 的 store API 版本已升级
  //（createStore.ts 被热更新替换），旧单例缺少新方法，须整包重载重建。
  const current = getCurrentStoreApiVersion();
  if (typeof current === 'string' && getStoreApiVersion(store) !== current) {
    if (__DEV__) {
      DevSettings.reload();
    }
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
