const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// monorepo: 监听根目录，解析 workspace 包（@openreel/core、@openreel/expo-db）
config.watchFolders = [...(config.watchFolders || []), monorepoRoot];

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