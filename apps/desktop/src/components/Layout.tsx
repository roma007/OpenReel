import { NavLink, Link, Outlet } from 'react-router-dom';
import { UsageGuideDialog } from './UsageGuideDialog';
import { SourceGuideDialog } from './SourceGuideDialog';
import { CollectGuideDialog } from './CollectGuideDialog';
import { AiSourceImportDialog } from './AiSourceImportDialog';
import { CollectProgressDialog } from './CollectProgressDialog';
import { BackgroundLayer } from './BackgroundLayer';
import { KidLockBanner } from './KidLockBanner';
import { PlayerHost } from './player/PlayerHost';
import { useImportDialogStore } from '../themes/importDialogStore';
import { setPlayToastHandler } from '../utils/openMediaPlay';
import {
  Home,
  Settings,
  Film,
  Tv,
  Music,
  BookOpen,
  Camera,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useAppStore, getStore, getProvider } from '../useAppStore';
import { getKidLockService } from '../stores/kidLockStore';
import { getUpdateBadgeStore } from '@openreel/core';

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/movie', label: '电影', icon: Film },
  { to: '/tv', label: '电视剧', icon: Tv },
  { to: '/variety', label: '综艺', icon: Music },
  { to: '/anime', label: '动漫', icon: BookOpen },
  { to: '/documentary', label: '纪录片', icon: Camera },
  { to: '/settings', label: '设置', icon: Settings },
];

interface ToastMessage {
  message: string;
  type: 'success' | 'error';
}

type ToastFn = (message: string, type?: 'success' | 'error') => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) {
    return (message, type) => console.log(`[${type}] ${message}`);
  }
  return fn;
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = useCallback<ToastFn>((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  // openMediaPlay 在 React 树外「解析不到播放地址」时也要能提示，这里注册全局回调
  useEffect(() => {
    setPlayToastHandler(showToast);
    return () => setPlayToastHandler(null);
  }, [showToast]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-70 transition-opacity"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

// 引导展示规则（用户确认的设计）：App 每次启动展示一次，本次运行内不重复。
// 必须用模块级变量而不是 localStorage/数据库标记：后者会“装过一次就永远不弹”。
// 进程重启 → 模块重新加载 → 标记归零 → 下次打开必弹。
let launchGuideShown = false;
let usageGuideShownThisLaunch = false;
let sourceGuideShownThisLaunch = false;
let collectGuideShownThisLaunch = false;

export function Layout() {
  const [appVersion, setAppVersion] = useState('1.0.232');
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [showUsageGuide, setShowUsageGuide] = useState(false);
  const [showSourceGuide, setShowSourceGuide] = useState(false);
  const [showCollectGuide, setShowCollectGuide] = useState(false);
  // 「选择使用方式」是否已结束（结束后才轮到添加源/去采集引导）
  const [usageGuideDone, setUsageGuideDone] = useState(false);
  const aiImportOpen = useImportDialogStore((s) => s.aiImportOpen);
  const closeAiImport = useImportDialogStore((s) => s.closeAiImport);
  const { loadVideoSources, videoSources } = useAppStore();
  const hasUpdate = getUpdateBadgeStore()((s) => s.hasUpdate);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    loadVideoSources().then(() => setSourcesLoaded(true));
    // 启动静默检查：若词表升级或残留 NULL，自动全量重标（isBackfilled 幂等，无进度 UI）
    getKidLockService().backfillKidSafe().catch(() => {});
  }, []);

  // 使用方式引导关闭后：本次启动还没弹过「添加视频源」且确实没有任何源 → 补弹
  const maybeShowSourceGuide = () => {
    if (sourceGuideShownThisLaunch) return;
    const count = getStore().getState().videoSources.length;
    if (count === 0) {
      sourceGuideShownThisLaunch = true;
      setShowSourceGuide(true);
    }
  };

  // 有源但片库为空 → 「去采集」引导（每次启动最多一次）
  const maybeShowCollectGuide = async () => {
    if (collectGuideShownThisLaunch) return;
    try {
      const res = await getProvider().listMedia({ page: 1, pageSize: 1 });
      if ((res.meta?.total ?? 0) === 0) {
        collectGuideShownThisLaunch = true;
        setShowCollectGuide(true);
      }
    } catch {
      // 取不到计数时不误报，等下次触发
    }
  };

  const handleUsageGuideClosed = () => {
    setUsageGuideDone(true);
    setTimeout(() => {
      const count = getStore().getState().videoSources.length;
      if (count === 0) {
        if (!sourceGuideShownThisLaunch) {
          sourceGuideShownThisLaunch = true;
          setShowSourceGuide(true);
        }
      } else {
        void maybeShowCollectGuide();
      }
    }, 250);
  };

  useEffect(() => {
    if (!sourcesLoaded) return;
    if (launchGuideShown) return;
    launchGuideShown = true;
    // 每次启动都先弹「选择你的使用方式」；关闭后再按有无源依次补弹
    usageGuideShownThisLaunch = true;
    setShowUsageGuide(true);
  }, [sourcesLoaded]);

  // 添加源/导入完成后（videoSources 变化）：若已无其他引导且片库仍为空 → 补弹「去采集」
  useEffect(() => {
    if (!sourcesLoaded || !usageGuideDone) return;
    if (showUsageGuide || showSourceGuide || showCollectGuide) return;
    if (collectGuideShownThisLaunch) return;
    if (videoSources.length === 0) return;
    void maybeShowCollectGuide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSources.length, sourcesLoaded, usageGuideDone, showUsageGuide, showSourceGuide, showCollectGuide]);

  const handleImportClosed = (open: boolean) => {
    if (open) return;
    closeAiImport();
    // 导入完成后刷新源列表，供后续判断/页面使用
    void loadVideoSources();
  };

  return (
    <ToastProvider>
      <BackgroundLayer />
      <UsageGuideDialog
        open={showUsageGuide}
        onOpenChange={(v) => {
          setShowUsageGuide(v);
          if (!v) handleUsageGuideClosed();
        }}
      />
      <SourceGuideDialog open={showSourceGuide} onOpenChange={setShowSourceGuide} />
      <CollectGuideDialog open={showCollectGuide} onOpenChange={setShowCollectGuide} />
      <AiSourceImportDialog
        open={aiImportOpen}
        onOpenChange={handleImportClosed}
      />
      <CollectProgressDialog />
      <PlayerHost />
      <div className="flex h-full">
        <aside className="w-56 shrink-0 flex flex-col bg-[var(--color-sidebar-alpha)] backdrop-blur-md">
          <div className="flex items-center gap-2 px-5 h-14">
            <img src="/logo.png" alt="OpenReel" className="size-6 rounded-md" />
            <span className="font-semibold tracking-tight text-lg">OpenReel</span>
          </div>
          <nav className="flex-1 py-3">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-5 py-2.5 text-sm transition-all duration-200',
                  isActive
                    ? 'bg-muted-foreground/20 text-text'
                    : 'text-text-secondary hover:text-text hover:bg-hover'
                )}
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <Link
            to="/settings/update"
            className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground hover:text-text hover:bg-hover transition-colors"
          >
            <span className="flex items-center gap-1.5">
              版本 {appVersion}
              {hasUpdate && <span className="size-2 rounded-full bg-destructive" aria-label="有新版本" />}
            </span>
            <span className="flex items-center gap-2">
              {hasUpdate && <span className="text-destructive">有新版</span>}
              <span aria-hidden>›</span>
            </span>
          </Link>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <KidLockBanner />
          <main id="main-content" className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
          <footer className="shrink-0 px-6 py-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link to="/help" className="hover:text-text transition-colors">帮助中心</Link>
                <span className="text-muted-foreground">|</span>
                <Link to="/about" className="hover:text-text transition-colors">关于我们</Link>
                <span className="text-muted-foreground">|</span>
                <Link to="/about/license" className="hover:text-text transition-colors">版权声明</Link>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}