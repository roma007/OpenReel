import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../useAppStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, RefreshCw } from 'lucide-react';
import { useBackgroundStore } from '../themes/backgroundStore';
import { Switch } from '@/components/ui/switch';

export default function CollectConfigPage() {
  const clearBgImage = useBackgroundStore((s) => s.clearBgImage);
  useEffect(() => { clearBgImage(); }, [clearBgImage]);
  const navigate = useNavigate();
  const { collectConfig, loadCollectConfig, updateCollectConfig } = useAppStore();
  const [localConfig, setLocalConfig] = useState({
    minYear: 2025,
    retryTimes: 3,
    pageSize: 20,
    maxPages: 10,
    incrementalMaxPages: 100,
    maxIncrementalHours: 720,
    concurrency: 1,
    autoEnabled: false,
    autoIntervalHours: 24,
    autoOnStartup: false,
  });
  const [autoLastRunAt, setAutoLastRunAt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedConfigRef = useRef('');
  // 即时保存：本地 state 为唯一编辑源，store 仅在首次水合时写入本地，避免写库后的回写打断正在输入的值
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCollectConfig();
  }, []);

  useEffect(() => {
    if (collectConfig) {
      // autoLastRunAt 可能由自动采集在别处更新，始终同步
      setAutoLastRunAt(collectConfig.autoLastRunAt);
      if (hydratedRef.current) return;
      hydratedRef.current = true;
      savedConfigRef.current = JSON.stringify({
        minYear: collectConfig.minYear,
        retryTimes: collectConfig.retryTimes,
        pageSize: collectConfig.pageSize,
        maxPages: collectConfig.maxPages,
        incrementalMaxPages: collectConfig.incrementalMaxPages,
        maxIncrementalHours: collectConfig.maxIncrementalHours,
        concurrency: collectConfig.concurrency,
        autoEnabled: collectConfig.autoEnabled,
        autoIntervalHours: collectConfig.autoIntervalHours,
        autoOnStartup: collectConfig.autoOnStartup,
      });
      setLocalConfig({
        minYear: collectConfig.minYear,
        retryTimes: collectConfig.retryTimes,
        pageSize: collectConfig.pageSize,
        maxPages: collectConfig.maxPages,
        incrementalMaxPages: collectConfig.incrementalMaxPages,
        maxIncrementalHours: collectConfig.maxIncrementalHours,
        concurrency: collectConfig.concurrency,
        autoEnabled: collectConfig.autoEnabled,
        autoIntervalHours: collectConfig.autoIntervalHours,
        autoOnStartup: collectConfig.autoOnStartup,
      });
    }
  }, [collectConfig]);

  const hasChanges = useMemo(() => {
    if (!collectConfig || !savedConfigRef.current) return false;
    const current = JSON.stringify({
      minYear: localConfig.minYear,
      retryTimes: localConfig.retryTimes,
      pageSize: localConfig.pageSize,
      maxPages: localConfig.maxPages,
      incrementalMaxPages: localConfig.incrementalMaxPages,
      maxIncrementalHours: Math.max(0, localConfig.maxIncrementalHours),
      concurrency: localConfig.concurrency,
      autoEnabled: localConfig.autoEnabled,
      autoIntervalHours: localConfig.autoIntervalHours,
      autoOnStartup: localConfig.autoOnStartup,
    });
    return current !== savedConfigRef.current;
  }, [localConfig, collectConfig]);

  // 桌面端关闭窗口兜底：有未落库变更时拦截
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  // 清理未触发的 debounce / 提示定时器
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
  }, []);

  /** 落库（即时保存的唯一写入口） */
  const persist = useCallback(async (cfg: typeof localConfig) => {
    const payload = { ...cfg, maxIncrementalHours: Math.max(0, cfg.maxIncrementalHours) };
    await updateCollectConfig(payload);
    savedConfigRef.current = JSON.stringify(payload);
    setSaved(true);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }, [updateCollectConfig]);

  /** 数值输入：本地即时更新 + 500ms debounce 写库 */
  const scheduleSave = useCallback((cfg: typeof localConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(cfg);
    }, 500);
  }, [persist]);

  /** 字段变更：immediate=true（开关/重置）立即写库，否则 debounce */
  const update = useCallback((patch: Partial<typeof localConfig>, immediate = false) => {
    const next = { ...localConfig, ...patch };
    setLocalConfig(next);
    if (immediate) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void persist(next);
    } else {
      scheduleSave(next);
    }
  }, [localConfig, persist, scheduleSave]);

  const handleReset = () => {
    update({
      minYear: 2025,
      retryTimes: 3,
      pageSize: 20,
      maxPages: 100,
      incrementalMaxPages: 100,
      maxIncrementalHours: 720,
      concurrency: 6,
      autoEnabled: false,
      autoIntervalHours: 24,
      autoOnStartup: false,
    }, true);
  };

  const handleBack = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      void persist(localConfig);
    }
    navigate('/settings');
  }, [localConfig, navigate, persist]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="sticky top-0 z-10 -mx-6 px-6 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBack} className="hover:text-text">
            <ArrowLeft className="size-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">采集配置</h1>
          <div className="flex-1" />
          <Button size="sm" onClick={handleReset}>
            <RotateCcw className="size-3.5 mr-1.5" />
            重置默认
          </Button>
          <span className={`text-sm text-muted-foreground transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`}>
            已自动保存
          </span>
        </div>
      </div>

      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="maxPages">全量采集最大页数</Label>
            <Input
              id="maxPages"
              type="number"
              min="1"
              value={localConfig.maxPages}
              onChange={(e) => update({ maxPages: Math.max(1, parseInt(e.target.value) || 10) })}
            />
            <p className="text-xs text-muted-foreground">全量采集时最多采集多少页数据</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="incrementalMaxPages">增量采集最大页数</Label>
            <Input
              id="incrementalMaxPages"
              type="number"
              min="1"
              value={localConfig.incrementalMaxPages}
              onChange={(e) => update({ incrementalMaxPages: Math.max(1, parseInt(e.target.value) || 10) })}
            />
            <p className="text-xs text-muted-foreground">断点和定额模式均受此限制</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxIncrementalHours">增量最大追溯时间（小时）</Label>
            <Input
              id="maxIncrementalHours"
              type="number"
              min="0"
              max="8760"
              value={localConfig.maxIncrementalHours}
              onChange={(e) => update({ maxIncrementalHours: Math.max(0, parseInt(e.target.value) || 0) })}
            />
            <p className="text-xs text-muted-foreground">0=不限，断点续采时 h 的最大值（全量采集不受影响）</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="concurrency">并发处理数量</Label>
            <Input
              id="concurrency"
              type="number"
              min="1"
              max="20"
              value={localConfig.concurrency}
              onChange={(e) => update({ concurrency: Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) })}
            />
            <p className="text-xs text-muted-foreground">同时处理多少个项目（过高可能触发反爬）</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pageSize">每页大小</Label>
            <Input
              id="pageSize"
              type="number"
              min="5"
              max="100"
              value={localConfig.pageSize}
              onChange={(e) => update({ pageSize: Math.min(100, Math.max(5, parseInt(e.target.value) || 20)) })}
            />
            <p className="text-xs text-muted-foreground">每页返回的数据条数</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minYear">最小年份过滤</Label>
            <Input
              id="minYear"
              type="number"
              value={localConfig.minYear}
              onChange={(e) => update({ minYear: parseInt(e.target.value) || 2025 })}
            />
            <p className="text-xs text-muted-foreground">低于此年份的内容将被跳过</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="retryTimes">重试次数</Label>
            <Input
              id="retryTimes"
              type="number"
              min="0"
              max="10"
              value={localConfig.retryTimes}
              onChange={(e) => update({ retryTimes: Math.min(10, Math.max(0, parseInt(e.target.value) || 3)) })}
            />
            <p className="text-xs text-muted-foreground">采集失败时的重试次数</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 mt-4 space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <RefreshCw className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">自动增量采集</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            满足条件自动执行增量采集，有启用视频源且无手动采集任务时才执行。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-sm font-medium">启用自动采集</div>
            <Switch
              checked={localConfig.autoEnabled}
              onCheckedChange={(checked) =>
                update({
                  autoEnabled: checked,
                  // 关闭总开关时联动关闭「启动时立即采集」；重新打开不联动打开（保持原值）
                  autoOnStartup: checked ? localConfig.autoOnStartup : false,
                }, true)
              }
            />
            <p className="text-xs text-muted-foreground">关闭后定时与启动触发均不执行</p>
          </div>

          <div className={`space-y-2 transition-opacity ${localConfig.autoEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div className="text-sm font-medium">启动时立即采集</div>
            <Switch
              checked={localConfig.autoOnStartup}
              onCheckedChange={(checked) => update({ autoOnStartup: checked }, true)}
              disabled={!localConfig.autoEnabled}
            />
            <p className="text-xs text-muted-foreground">应用启动后延迟数秒自动执行一次增量采集</p>
          </div>

          <div className={`space-y-2 transition-opacity ${localConfig.autoEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <Label htmlFor="autoIntervalHours">定时采集间隔（小时）</Label>
            <Input
              id="autoIntervalHours"
              type="number"
              min="1"
              max="8760"
              value={localConfig.autoIntervalHours}
              onChange={(e) => update({ autoIntervalHours: Math.min(8760, Math.max(1, parseInt(e.target.value) || 24)) })}
            />
            <p className="text-xs text-muted-foreground">距上次自动采集达到该间隔后触发</p>
          </div>

          <div className={`space-y-2 transition-opacity ${localConfig.autoEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div className="text-sm font-medium">上次自动采集时间</div>
            <div className="h-9 px-3 py-2 text-sm text-muted-foreground bg-muted/40 rounded-md border border-transparent">
              {autoLastRunAt ? new Date(autoLastRunAt).toLocaleString() : '从未执行'}
            </div>
            <p className="text-xs text-muted-foreground">用于跨启动判断间隔与断点追溯</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
