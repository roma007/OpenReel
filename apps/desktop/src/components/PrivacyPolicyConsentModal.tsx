import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { agreePrivacy } from '@/utils/privacyConsent';

export function PrivacyPolicyConsentModal({ visible, onAgreed, onViewPolicy }: { visible: boolean; onAgreed: () => void; onViewPolicy: () => void }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  if (!visible) return null;
  const handleAgree = () => { if (!checked) return; agreePrivacy(); onAgreed(); };
  const handleExit = () => { getCurrentWindow().close(); };
  const handleView = () => { onViewPolicy(); navigate('/about/privacy'); };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
      <Card className="max-w-md w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-center">隐私政策提示</h2>
        <p className="text-sm text-muted-foreground">感谢您使用 OpenReel。为了更好地保护您的隐私，请您在使用前阅读并同意《隐私政策》。</p>
        <p className="text-sm text-muted-foreground">本应用为本地优先工具，不要求注册登录，片库、观看记录等数据仅存储在您的设备本地。</p>
        <button className="text-sm text-primary underline cursor-pointer" onClick={handleView}>查看完整隐私政策</button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          我已阅读并理解《OpenReel 隐私政策》
        </label>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={!checked} onClick={handleExit}>不同意并退出</Button>
          <Button className="flex-1" disabled={!checked} onClick={handleAgree}>同意并继续</Button>
        </div>
      </Card>
    </div>
  );
}
