import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Scale } from 'lucide-react';
import { useBackgroundStore } from '../themes/backgroundStore';

export default function LicensePage() {
  const clearBgImage = useBackgroundStore((s) => s.clearBgImage);
  useEffect(() => { clearBgImage(); }, [clearBgImage]);
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="sticky top-0 z-10 -mx-6 px-6 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="hover:text-text">
            <ArrowLeft className="size-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">版权声明</h1>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <Scale className="size-8 text-muted-foreground shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">内容与责任</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              本应用不提供任何内容资源，片源由使用者自行添加。
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            OpenReel 是一个播放客户端，不内置、不预置、不分发任何影视内容、播放源或资源文件。
            应用内出现的所有片源配置、影视元数据、海报与视频内容，均由使用者自行添加并自行管理。
          </p>
          <p>
            本应用仅提供采集、整理、播放与推荐等工具能力。片源的选择、使用及由此产生的一切后果，
            由使用者本人负责。请在所在地区法律允许的范围内使用。
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">软件许可</h2>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            本软件以 MIT 协议开源。软件代码的许可协议仅适用于代码本身，
            不涉及使用者自行添加的片源内容及第三方资源的权利归属。
          </p>
          <p>MIT License · Copyright © 2026 roma</p>
          <p>
            完整许可条款见仓库根目录的 <span className="text-text font-medium">LICENSE</span> 文件。
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">第三方资源</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          本应用使用的片源接口、海报与元数据服务均由第三方提供，其内容与权利归属由各自权利人所有。
          若你认为自己提供的接口或内容侵犯了他人权利，请通过仓库 Issue 与我们联系。
        </p>
      </Card>

      <p className="text-xs text-muted-foreground text-center pt-2">
        Copyright © 2026 roma
      </p>
    </div>
  );
}