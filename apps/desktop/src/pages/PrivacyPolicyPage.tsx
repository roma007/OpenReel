import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { hasAgreedPrivacy, agreePrivacy } from '@/utils/privacyConsent';

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="sticky top-0 z-10 -mx-6 px-6 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="hover:text-text">
            <ArrowLeft className="size-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">隐私政策</h1>
        </div>
      </div>
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6" />
          <h2 className="text-lg font-semibold">OpenReel 隐私政策</h2>
        </div>
        <p className="text-sm text-muted-foreground">本政策适用于 OpenReel Android/iOS/桌面端应用。更新日期：2026-10-27</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          OpenReel 是一款本地优先的影视聚合播放客户端。所有业务数据仅存储在您的设备本地，不要求注册登录。
        </p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">1. 我们收集哪些信息</h2>
        <p className="text-sm text-muted-foreground">• 设备信息：仅用于应用正常运行，不会主动上传。</p>
        <p className="text-sm text-muted-foreground">• 本地数据：片库、收藏、观看记录、搜索历史全部存储在您的设备本地。</p>
        <p className="text-sm text-muted-foreground">• 配置信息：片源配置等仅保存在本地数据库中。</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">2. 数据使用与存储</h2>
        <p className="text-sm text-muted-foreground">• 数据本地存储：所有业务数据均仅存在于您的设备上。</p>
        <p className="text-sm text-muted-foreground">• 不上传服务器：本应用无自有内容分发服务器。</p>
        <p className="text-sm text-muted-foreground">• 片源自备：应用不内置、不分发任何内容资源。</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">3. 第三方服务</h2>
        <p className="text-sm text-muted-foreground">您添加的片源接口、海报、元数据等可能由第三方提供。</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">4. 权限说明</h2>
        <p className="text-sm text-muted-foreground">• 网络权限：用于访问您自行配置的片源、检查更新。</p>
        <p className="text-sm text-muted-foreground">• 存储权限：仅用于本地数据读写。</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">5. 您的权利</h2>
        <p className="text-sm text-muted-foreground">• 数据控制：您可随时清空本地数据、删除片源或卸载应用。</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">6. 隐私政策更新</h2>
        <p className="text-sm text-muted-foreground">本隐私政策可能随版本迭代更新，重大变更会在应用内提示。</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">7. 联系我们</h2>
        <p className="text-sm text-muted-foreground">可通过 GitHub 仓库 Issues 联系：https://github.com/roma007/OpenReel</p>
      </Card>
      <div className="flex justify-center gap-2">
        {!hasAgreedPrivacy() && (
          <>
            <Button variant="outline" onClick={() => getCurrentWindow().close()}>不同意并退出</Button>
            <Button onClick={() => { agreePrivacy(); window.location.href = '/'; }}>同意并继续</Button>
          </>
        )}
      </div>
    </div>
  );
}
