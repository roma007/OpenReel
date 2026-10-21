const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 关键修复：显式设置 server root 为当前 app 目录。
// Expo monorepo 下 Metro 默认用 monorepo 根作为 server root，index.bundle 会
// 被解析成 mobile 的入口（因为 Expo 在根目录放了 .virtual-metro-entry）。
// 必须显式设 server.root = projectRoot，让 index.bundle 指向当前 app 的 index.ts。
config.server = config.server || {};
config.server.root = projectRoot;

// 关键修复：覆盖 Expo 默认的 watchFolders。
// getDefaultConfig 在 monorepo 下会把所有 workspace 的 expo app（mobile、tv、desktop）
// 都加进 watchFolders，导致 Metro 默认入口被解析成 mobile 的 index.bundle！
// 显式限制为当前 app + 共享 workspace 包（不含其他 app）。
config.watchFolders = [
  projectRoot,
  monorepoRoot,
  path.resolve(monorepoRoot, 'packages/core'),
  path.resolve(monorepoRoot, 'packages/expo-db'),
  path.resolve(monorepoRoot, 'packages/expo-ui'),
  path.resolve(monorepoRoot, 'packages/expo-dlna-cast'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// 单例锁定，避免 RN/Expo 在 monorepo 下出现多实例与 "Invalid hook call"
const singletons = [
  'react',
  'react-native',
  'expo',
  'expo-modules-core',
  'expo-constants',
  'expo-sqlite',
  'expo-file-system',
];
config.resolver.extraNodeModules = singletons.reduce((acc, name) => {
  acc[name] = path.resolve(projectRoot, 'node_modules', name);
  return acc;
}, {});

module.exports = config;
