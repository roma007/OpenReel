import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Info, Github, Scale, Monitor, Smartphone, Apple, FolderTree, RefreshCw } from 'lucide-react';
import { useBackgroundStore } from '../themes/backgroundStore';
import { check } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';

const REPO_URL = 'https://github.com/roma007/OpenReel';

// 在线升级目前仅支持 Windows（macOS 不在范围内）
const IS_WINDOWS = navigator.userAgent.includes('Windows');

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string; notes?: string }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

const platforms = [
  { icon: Monitor, name: '桌面端', detail: 'macOS · Windows' },
  { icon: Smartphone, name: '移动端', detail: 'Android · iOS' },
];

const principles = [
  {
    icon: FolderTree,
    title: '片源自备',
    desc: '应用不内置、不分发任何内容资源。片源由使用者自行添加和管理。',
  },
  {
    icon: Scale,
    title: '数据本地',
    desc: '片库、观看记录、收藏全部只存在你自己的设备上，不经过任何服务器。',
  },
  {
    icon: Github,
    title: '开源共建',
    desc: '遵循 MIT 协议公开源代码，欢迎反馈问题与提交改进。',
  },
];

export default function AboutPage() {
  const clearBgImage = useBackgroundStore((s) => s.clearBgImage);
  useEffect(() => { clearBgImage(); }, [clearBgImage]);
  const navigate = useNavigate();

  const [currentVersion, setCurrentVersion] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' });

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
      // Windows: 下载完成后安装器以 passive 模式自动运行并重启应用，无需手动 relaunch
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
          <h1 className="text-2xl font-bold">关于我们</h1>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Info className="size-8 text-muted-foreground shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold mb-2">OpenReel</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              把散落的片源，收进自己的片库。
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              OpenReel 是一个自托管的影视聚合播放客户端。你把自己喜欢的片源接进来，
              它负责采集、刮削、归类、推荐，然后把片子收进一个属于你自己的片库。
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">设计原则</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {principles.map((p) => (
            <div key={p.title} className="flex flex-col gap-2">
              <p.icon className="size-5 text-muted-foreground" />
              <div className="font-medium text-sm">{p.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">支持平台</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {platforms.map((p) => (
            <div key={p.name} className="flex items-center gap-3">
              <p.icon className="size-5 text-muted-foreground shrink-0" />
              <div>
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-sm text-muted-foreground">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          <Apple className="size-3 inline align-[-1px] mr-1" />
          桌面端与移动端共用同一套业务逻辑，但各自独立存储数据：
          桌面端建立的片库不会自动同步到手机，如需在手机上观看请在手机端自行采集一次。
        </p>
      </Card>

      {IS_WINDOWS && (
        <Card className="p-6">
          <h2 className="font-semibold mb-4">版本更新</h2>
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

      <Card className="p-6">
        <h2 className="font-semibold mb-2">源代码</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          本应用遵循 MIT 协议开源。遇到问题或有改进建议，欢迎到仓库提交 Issue 或 Pull Request。
        </p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 text-sm hover:text-text transition-colors break-all"
        >
          <Github className="size-4 shrink-0" />
          {REPO_URL}
        </a>
      </Card>

      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => navigate('/about/license')}>
          <Scale className="size-4 mr-2" />
          查看版权声明
        </Button>
      </div>
    </div>
  );
}