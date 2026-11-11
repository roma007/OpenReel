// 类型
export * from './types';

// 工具
export { DataNormalizer, normalizer } from './utils/normalizer';
export { NOISE_SUBTYPES, isNoiseSubtype, expandSubTypes, extractFirstSubtypes } from './utils/genreSubtypes';
export { DEAD_IMAGE_HOSTS, extractImageHost, isKnownDeadPosterUrl, isUsablePosterUrl } from './utils/posterHost';
export {
  isAiDrama,
  mapType,
  needsShortDramaCheck,
  isVersionTitle,
  refineTypeByEpisodes,
} from './utils/typeMapper';
export {
  MEDIA_FILE_EXTENSIONS,
  isPlayableMediaUrl,
  AI_SOURCE_PROMPT,
  AI_SOURCE_IMPORT_SAMPLE,
  INTERRUPTED_TASK_MESSAGE,
} from './utils/constants';
export { getHttpClient, setHttpClient, type HttpClient } from './utils/httpClient';
export { isChildSafe } from './utils/kidSafe';
export {
  computeBaseTitle,
  extractLanguage,
  inferLanguageForUnlabeled,
  regionDefaultLanguage,
  regionLanguageCandidates,
  shortUrlHash,
  stripTrailingYear,
  stripVersionSuffix,
} from './utils/versionMerge';

// 服务
export { CMSAdapter } from './services/cmsAdapter';
export { CollectorService } from './services/collectorService';
export { MediaDetailService, loadEpisodesForSource, type EnsureDetailResult } from './services/mediaDetailService';
export { DbMaintenanceService, MIN_VACUUM_DB_BYTES, VACUUM_FREE_MARGIN_BYTES, FREELIST_PAGES_THRESHOLD } from './services/dbMaintenanceService';
export {
  setCollectKeepAwakeHandler,
  beginCollectKeepAwake,
  endCollectKeepAwake,
  isCollectKeepAwakeActive,
} from './services/keepAwake';
export { SystemConfigService, type CollectConfig, type ShortDramaConfig } from './services/systemConfigService';
export { KidLockService } from './services/kidLockService';
export { VideoDurationService, setVideoFetchFn, getVideoFetchFn } from './services/videoDurationService';
export { SourceImportService, exportSourcesToJson } from './services/sourceImportService';
export { RecommendationService, type RecommendationOverview, type DislikedMediaItem, type TagBlacklistItem } from './services/recommendationService';
export { resolveDefaultPlayTarget, type DefaultPlayTarget } from './services/playbackTarget';
export { prefetchPlayTargets, resetPlayPrefetchCache } from './services/playPrefetch';
export { repairUserMediaIndex, collectRepairCandidates, type IndexRepairResult } from './services/indexRepairService';
export {
  setFreeDiskProvider,
  getFreeDiskBytes,
  ensureStorageForCollect,
  formatBytes,
  MIN_FREE_BYTES_FOR_COLLECT,
  LOW_FREE_BYTES_WARN,
} from './services/storageGuard';
export {
  setCpuUsageProvider,
  sampleCpuPercent,
  evaluateAutoResume,
  type AutoResumeDecision,
} from './services/deviceGuard';
export {
  fetchLatestRelease,
  compareVersions,
  pickApkAsset,
  GITHUB_REPO,
  type LatestRelease,
  type ReleaseAsset,
} from './services/updateService';

// 数据库抽象层
export { PRAGMA_SQL, SCHEMA_SQL, DROP_SYNC_REMNANTS_SQL, FAVORITE_UNIQUE_MIGRATE_SQL, splitSqlStatements } from './db/schema';
export { type DatabaseProvider, UNCATEGORIZED_GENRE, mediaMatchesFilters, resolveCollectTaskCutoff } from './db/provider';
export {
  rowToMedia,
  rowToEpisode,
  rowToPlaySource,
  rowToVideoSource,
  rowToFavorite,
  rowToWatchHistory,
  rowToCollectTask,
} from './db/rowMappers';

// 状态管理
export { createAppStore, getCurrentStoreApiVersion, getStoreApiVersion, type AppState, type AppStore } from './store/createStore';
export { getSplashStore, type SplashPhase } from './stores/splashStore';
export { getUpdateBadgeStore, type UpdateBadgeState } from './stores/updateBadgeStore';
