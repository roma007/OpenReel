import { create } from 'zustand';
import { hasAgreedPrivacy } from '../utils/privacyConsent';

interface PrivacyConsentState {
  /** 是否已同意当前版本的隐私政策。启动初值 true：等 refresh() 读到磁盘真实值前不闪弹窗 */
  agreed: boolean;
  /** 从磁盘重新读取同意状态 */
  refresh: () => Promise<void>;
  setAgreed: (agreed: boolean) => void;
}

/**
 * 隐私政策同意状态（全局可订阅）。
 * 用途：App 层据此渲染同意弹窗；首页据此延后「添加视频源 / 使用方式引导」等原生 Modal，
 * 避免 RN Modal 渲染在原生层、盖住隐私弹窗的正文与复选框。
 */
export const usePrivacyConsentStore = create<PrivacyConsentState>((set) => ({
  agreed: true,
  async refresh() {
    const agreed = await hasAgreedPrivacy();
    set({ agreed });
  },
  setAgreed(agreed) {
    set({ agreed });
  },
}));
