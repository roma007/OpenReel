import { NativeModules } from 'react-native';

/**
 * 已安装应用列表（TV Launcher「应用列表区」）JS 封装。
 * 原生实现：android/app/src/main/java/com/movie/app/launcher/InstalledAppsModule.kt
 */

export interface InstalledApp {
  packageName: string;
  label: string;
  /** 96x96 PNG base64 data URI（原生压缩；取图标失败时为空串） */
  icon: string;
}

interface InstalledAppsNativeModule {
  getLaunchableApps?: () => Promise<InstalledApp[]>;
  launchApp?: (packageName: string) => Promise<null>;
}

const mod: InstalledAppsNativeModule | undefined = (NativeModules as any).InstalledApps;

/** 查询可启动应用（已过滤本应用自身；按应用名中文拼音序）。原生模块缺失时返回空数组。 */
export async function getLaunchableApps(): Promise<InstalledApp[]> {
  if (!mod?.getLaunchableApps) return [];
  try {
    return (await mod.getLaunchableApps()) as InstalledApp[];
  } catch {
    return [];
  }
}

/** 启动指定包名的应用。 */
export async function launchApp(packageName: string): Promise<void> {
  if (!mod?.launchApp) return;
  await mod.launchApp(packageName);
}
