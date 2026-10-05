import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initApp, testCollect } from './init';
import { MigrationDiskError, type MigrationProgress } from './db/tauriSqlProvider';
import { Layout } from './components/Layout';
import { PipWindow } from './pip/PipWindow';
import { SplashOverlay } from './components/SplashOverlay';
import { MigrationOverlay } from './components/MigrationOverlay';

import { ContextMenu } from './components/ContextMenu';
import { ResourceOverlay } from './components/ResourceOverlay';
import { ThemeProvider } from './themes/ThemeProvider';
import { FontSizeProvider } from './themes/FontSizeProvider';
import { ConfirmProvider } from './components/ConfirmProvider';
import HomePage from './pages/HomePage';
import MoviePage from './pages/MoviePage';
import TVPage from './pages/TVPage';
import VarietyPage from './pages/VarietyPage';
import AnimePage from './pages/AnimePage';
import DocumentaryPage from './pages/DocumentaryPage';
import SearchPage from './pages/SearchPage';
import SubtypePage from './pages/SubtypePage';
import PlayPage from './pages/PlayPage';
import FavoritesPage from './pages/FavoritesPage';
import HistoryPage from './pages/HistoryPage';
import SourceManagerPage from './pages/SourceManagerPage';
import TaskListPage from './pages/TaskListPage';
import SettingsPage from './pages/SettingsPage';
import CollectConfigPage from './pages/CollectConfigPage';
import CollectGuidePage from './pages/CollectGuidePage';
import AppearanceSettingsPage from './pages/AppearanceSettingsPage';
import UsagePreferencesPage from './pages/UsagePreferencesPage';
import RecommendationSettingsPage from './pages/RecommendationSettingsPage';
import KidLockPage from './pages/KidLockPage';
import VideoManagementPage from './pages/VideoManagementPage';
import TestCollectPage from './pages/TestCollectPage';
import HelpCenterPage from './pages/HelpCenterPage';
import AboutPage from './pages/AboutPage';
import LicensePage from './pages/LicensePage';
import DbToolPage from './pages/DbToolPage';

interface AppProps {
  /** 本次页面加载是否为刷新（reload）。刷新属页面级操作，不播欢迎页与初始广告。 */
  isReload?: boolean;
}

export default function App({ isReload = false }: AppProps) {
  const isPip =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'pip';
  if (isPip) return <PipWindow />;
  return <MainApp isReload={isReload} />;
}

function MainApp({ isReload }: { isReload: boolean }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 主键 INTEGER 升级进行中：全屏占位，且初始化超时窗口放宽（迁移可能数分钟）
  const [migrating, setMigrating] = useState(false);
  // 迁移进度（百分比 + 阶段文案），渲染升级进度条
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  // 磁盘空间不足：渲染升级引导页（不执行迁移、不进入应用）
  const [diskBlocked, setDiskBlocked] = useState<MigrationDiskError | null>(null);

  useEffect(() => {
    if (ready || error || diskBlocked) return;
    const timeoutId = setTimeout(() => {
      console.error('初始化超时');
      setError('初始化超时');
      setReady(true);
    }, migrating ? 30 * 60 * 1000 : 120000);

    // 静默初始化：不再显示「正在加载/数据库步骤」文字（冷启动由欢迎页覆盖层承接；
    // 刷新时为纯背景等待 init 完成）
    initApp(
      undefined,
      (running) => setMigrating(running),
      (p) => setMigrationProgress(p),
    )
      .then(() => {
        clearTimeout(timeoutId);
        console.log('初始化成功');
        setReady(true);
        setError(null);
      })
      .catch((err) => {
        console.error('初始化失败:', err);
        if (err instanceof MigrationDiskError) {
          setDiskBlocked(err);
          return;
        }
        setError(err?.message || String(err));
        setReady(true);
      });

    return () => {
      clearTimeout(timeoutId);
    };
  }, [ready, error, migrating, diskBlocked]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-2">
        <div className="text-destructive">初始化失败</div>
        <div className="text-muted-foreground text-sm">{error}</div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full">
        {ready && (
          <ThemeProvider>
            <FontSizeProvider>
              <ConfirmProvider>
                <BrowserRouter>
                  <ContextMenu />
                  {/* 资源监控浮窗：需在 Router 内取 useLocation 按页面归因；ready 门控使其不覆盖启动/迁移占位层 */}
                  <ResourceOverlay />
                  <Routes>
                    <Route element={<Layout />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/movie" element={<MoviePage />} />
                      <Route path="/tv" element={<TVPage />} />
                      <Route path="/variety" element={<VarietyPage />} />
                      <Route path="/anime" element={<AnimePage />} />
                      <Route path="/documentary" element={<DocumentaryPage />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/subtype/:type/:subType" element={<SubtypePage />} />
                      <Route path="/play/:episodeId" element={<PlayPage />} />
                      <Route path="/favorites" element={<FavoritesPage />} />
                      <Route path="/history" element={<HistoryPage />} />
                      <Route path="/sources" element={<SourceManagerPage />} />
                      <Route path="/tasks" element={<TaskListPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/settings/appearance" element={<AppearanceSettingsPage />} />
                      <Route path="/settings/preferences" element={<UsagePreferencesPage />} />
                      <Route path="/settings/recommendation" element={<RecommendationSettingsPage />} />
                      <Route path="/settings/kids" element={<KidLockPage />} />
                      <Route path="/settings/collect" element={<CollectConfigPage />} />
                      <Route path="/help/guide" element={<CollectGuidePage />} />
                      <Route path="/settings/video" element={<VideoManagementPage />} />
                      <Route path="/db-tool" element={<DbToolPage />} />
                      <Route path="/test-collect" element={<TestCollectPage />} />
                      <Route path="/help" element={<HelpCenterPage />} />
                      <Route path="/about" element={<AboutPage />} />
                      <Route path="/about/license" element={<LicensePage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </BrowserRouter>
              </ConfirmProvider>
            </FontSizeProvider>
          </ThemeProvider>
        )}
      </div>
      {/* 欢迎页 + 初始广告属于应用启动序列：刷新时（isReload）不重播 */}
      {!isReload && <SplashOverlay ready={ready} />}
      {/* 数据库升级/磁盘不足占位层不属于启动序列，刷新时同样显示 */}
      <MigrationOverlay migrating={migrating} migrationProgress={migrationProgress} diskBlocked={diskBlocked} />
    </>
  );
}