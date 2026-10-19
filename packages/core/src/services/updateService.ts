import { getHttpClient } from '../utils/httpClient';

/**
 * GitHub Releases 在线升级检查服务（移动端 Android / TV 共用）。
 *
 * 数据源：https://api.github.com/repos/roma007/openreel/releases/latest
 * - 当前版本号由调用端提供（RN 侧 Constants.expoConfig.version）。
 * - APK 资产匹配前缀区分端：
 *   - 移动端：`app-release-v`（build.gradle 铁律命名）
 *   - TV 端：`openreel-tv-release-v`（CI 重命名，避免与移动端同名冲突）
 */

export const GITHUB_REPO = 'roma007/openreel';

export interface LatestRelease {
  /** 形如 1.0.192（已去掉 v 前缀） */
  version: string;
  /** release 说明 */
  notes: string;
  /** 全部资产 */
  assets: ReleaseAsset[];
}

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

interface GithubReleaseResponse {
  tag_name?: string;
  body?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    size?: number;
  }>;
}

/** 拉取 GitHub 最新 Release 信息 */
export async function fetchLatestRelease(): Promise<LatestRelease> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await getHttpClient().get(url, {
    mode: 'cors',
    headers: { Accept: 'application/vnd.github+json' },
    timeout: 15000,
  });
  const data = res.data as GithubReleaseResponse;
  const tag = typeof data?.tag_name === 'string' ? data.tag_name : '';
  if (!tag) throw new Error('未获取到版本信息');
  return {
    version: tag.replace(/^v/i, ''),
    notes: typeof data.body === 'string' ? data.body : '',
    assets: (Array.isArray(data.assets) ? data.assets : [])
      .filter((a) => a && typeof a.name === 'string' && typeof a.browser_download_url === 'string')
      .map((a) => ({
        name: a.name as string,
        downloadUrl: a.browser_download_url as string,
        size: typeof a.size === 'number' ? a.size : 0,
      })),
  };
}

/**
 * 比较两个语义化版本号。
 * 返回 1 表示 a 更新，-1 表示 b 更新，0 表示相等。
 * 非数字段按 0 处理（如 1.0.192-beta 视为 1.0.192）。
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((s) => parseInt(s, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/** 按文件名前缀挑选 APK 资产（移动端传 'app-release-v'，TV 传 'openreel-tv-release-v'） */
export function pickApkAsset(release: LatestRelease, prefix: string): ReleaseAsset | null {
  return release.assets.find((a) => a.name.startsWith(prefix) && a.name.endsWith('.apk')) ?? null;
}
