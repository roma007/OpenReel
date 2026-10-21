import { create } from 'zustand';
import { KidLockService } from '@openreel/core';
import { getProvider } from '../useAppStore';

/** 与手机端同语义的儿童锁 service 工厂（绑定 TV 自己的 provider）。 */
export function getKidLockService(): KidLockService {
  return new KidLockService(getProvider());
}

interface KidLockState {
  active: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  setActive: (active: boolean) => void;
}

export const useKidLockStore = create<KidLockState>((set) => ({
  active: false,
  loaded: false,
  async refresh() {
    const active = await getProvider().getKidModeActive();
    set({ active, loaded: true });
  },
  setActive(active) {
    set({ active });
  },
}));