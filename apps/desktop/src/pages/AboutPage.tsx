import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Info, Github, Scale, Monitor, Smartphone, Apple, FolderTree } from 'lucide-react';
import { useBackgroundStore } from '../themes/backgroundStore';

const REPO_URL = 'https://github.com/roma007/OpenReel';

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