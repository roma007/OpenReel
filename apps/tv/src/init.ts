import { ExpoSqliteProvider, type MigrationProgress } from '@openreel/expo-db';
import { DevSettings } from 'react-native';
import {
  createAppStore,
  CollectorService,
  getCurrentStoreApiVersion,
  getStoreApiVersion,
  type AppStore,
  type AppState,
} from '@openreel/core';

/**
 * TV 端单例容器。
 *
 * 与手机端 apps/mobile/src/init.ts 同结构，但**不启动后台自动采集调度**
 * （用户 2026-10-05 明确砍掉 TV 端后台自动采集：电视常驻待机，调度器常驻会拖高盒子功耗/内存）。
 * 采集改为：用户在 TV 端手动发起（Collect 页），或应用启动时由用户显式触发。
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
    const store = createAppStore(provider);
    const collector = new CollectorService(provider);
    s.store = store;
    s.collector = collector;

    // 清理僵尸采集任务（TV 端被系统杀掉后残留的 RUNNING/PENDING）
    try {
      const staleCount = await store.getState().resetStaleTasks();
      if (staleCount > 0) console.log(`[TV] 清理了 ${staleCount} 个僵尸采集任务`);
    } catch (err) {
      console.error('[TV] 清理僵尸任务失败:', err);
    }

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