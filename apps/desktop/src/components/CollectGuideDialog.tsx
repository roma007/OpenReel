import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getStore } from '../useAppStore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 已添加视频源、但片库还是空的时候，引导用户去采集。
 *
 * 与「选择使用方式 / 添加视频源」同一套会话规则：每次启动最多一次。
 * （TV 端空库态已有自己的引导盒，不弹本弹窗。）
 */
export function CollectGuideDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">去采集视频</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center mb-2">
          视频源已就绪，但片库还是空的。现在执行一次全量采集，把视频拉取到本地？
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            稍后再说
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              navigate('/help/guide');
            }}
          >
            查看采集教程
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              // 全量采集的进度统一在「任务列表」页展示（数据源是 collect_task 逐页真值），
              // 先跳过去再启动，用户立刻能看到 FULL 任务行；from 用于返回时回到首页。
              navigate('/tasks', { state: { from: '/' } });
              void getStore().getState().collectAll();
            }}
          >
            立即全量采集
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
