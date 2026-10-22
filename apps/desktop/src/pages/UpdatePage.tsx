import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useBackgroundStore } from '../themes/backgroundStore';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { getUpdateBadgeStore } from '@openreel/core';

const IS_WINDOWS = navigator.userAgent.includes('Windows');

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string; notes?: string }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

export default function UpdatePage() {
  const clearBgImage = useBackgroundStore((s) => s.clearBgImage);
  useEffect(() => { clearBgImage(); }, [clearBgImage]);
  const navigate = useNavigate();
  const badge = getUpdateBadgeStore();

  const [currentVersion, setCurrentVersion] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' });

  // 进入版本更新页即视为已读红点
  useEffect(() => {
    badge.getState().markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (IS_WINDOWS) {
      getVersion().then(setCurrentVersion).catch(() => {});
    }
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateState({ phase: 'checking' });
    try {
      const update = await check();
      if (!update) {
        setUpdateState({ phase: 'up-to-date' });
        badge.getState().clear();
        return;
      }
      setUpdateState({ phase: 'available', version: update.version, notes: update.body });
    } catch (e) {
      setUpdateState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDownloadAndInstall = async () => {
    try {
      const update = await check();
      if (!update) {
        setUpdateState({ phase: 'up-to-date' });
        return;
      }
      setUpdateState({ phase: 'downloading', percent: 0 });
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setUpdateState({ phase: 'downloading', percent: Math.min(99, Math.round((downloaded / total) * 100)) });
          }
        } else if (event.event === 'Finished') {
          setUpdateState({ phase: 'installing' });
        }
      });
      setUpdateState({ phase: 'installing' });
    } catch (e) {
      setUpdateState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="sticky top-0 z-10 -mx-6 px-6 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="hover:text-text">
            <ArrowLeft className="size-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">版本更新</h1>
        </div>
      </div>

      {!IS_WINDOWS ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            当前平台（macOS）不支持应用内在线升级，请前往源代码仓库下载最新版本。
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">
              当前版本：{currentVersion || '…'}
              {updateState.phase === 'up-to-date' && <span className="ml-2 text-text">已是最新版本</span>}
              {updateState.phase === 'checking' && <span className="ml-2">正在检查…</span>}
              {updateState.phase === 'downloading' && <span className="ml-2">正在下载 {updateState.percent}%</span>}
              {updateState.phase === 'installing' && <span className="ml-2">下载完成，安装程序即将启动，应用会自动重启</span>}
              {updateState.phase === 'error' && <span className="ml-2">检查失败：{updateState.message}</span>}
            </div>
            {updateState.phase === 'available' ? (
              <Button onClick={handleDownloadAndInstall}>
                <RefreshCw className="size-4 mr-2" />
                下载并安装 v{updateState.version}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleCheckUpdate}
                disabled={updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'installing'}
              >
                <RefreshCw className="size-4 mr-2" />
                检查更新
              </Button>
            )}
          </div>
          {updateState.phase === 'downloading' && (
            <div className="mt-3 h-2 rounded-full bg-muted-foreground/10 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${updateState.percent}%` }}
              />
            </div>
          )}
          {updateState.phase === 'available' && updateState.notes && (
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed whitespace-pre-wrap">{updateState.notes}</p>
          )}
        </Card>
      )}
    </div>
  );
}
