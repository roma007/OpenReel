import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useImportDialogStore } from '../themes/importDialogStore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 无视频源引导（三按钮：下次再说 / 手动添加 / AI 导入）。
 *
 * 与移动端首页的「添加视频源」引导同语义：
 * 启动时「选择你的使用方式」关闭后，若仍没有任何视频源则弹本引导（每次启动最多一次）。
 */
export function SourceGuideDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">添加视频源</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center mb-2">
          还没有视频源，使用 AI 智能导入可以快速添加
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            下次再说
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              navigate('/sources');
            }}
          >
            手动添加
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              useImportDialogStore.getState().openAiImport();
            }}
          >
            AI 导入
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
