import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { getUpdateBadgeStore } from '@openreel/core';

/**
 * 弱提醒：右上角浮动横幅，提示有新版本，可点击跳转到版本信息页。
 * App 冷启动检查到有新版本时由 App.tsx 触发挂载。
 * 非阻塞、可手动关闭。
 */
export function UpdateHint() {
  const navigate = useNavigate();
  const badge = getUpdateBadgeStore();
  const hasUpdate = badge((s) => s.hasUpdate);
  const pendingVersion = badge((s) => s.latestVersion);
  const [dismissed, setDismissed] = useState(false);

  if (!hasUpdate || dismissed || !pendingVersion) return null;

  return (
    <button
      onClick={() => {
        navigate('/settings/update');
      }}
      className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border shadow-lg hover:bg-secondary/50 transition-colors text-left"
    >
      <span className="size-2 rounded-full bg-destructive shrink-0" />
      <div className="text-sm">
        <div className="font-medium">发现新版本 v{pendingVersion}</div>
        <div className="text-xs text-muted-foreground">点击查看详情并升级</div>
      </div>
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          setDismissed(true);
        }}
        className="ml-2 p-1 rounded hover:bg-secondary"
        aria-label="关闭"
      >
        <X className="size-3.5" />
      </span>
    </button>
  );
}
