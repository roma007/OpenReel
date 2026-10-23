import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MigrationDiskError, type MigrationProgress } from '@openreel/expo-db';
import { useThemeStore } from '@openreel/expo-ui';

import { initApp } from './src/init';
import { writePrefetchConcurrency } from './src/services/cache';
import { TVStartupOverlay } from './src/components/TVStartupOverlay';
import { TVFocusBridge } from './src/focus/TVFocusBridge';
import CollectProgressDialog from './src/components/CollectProgressDialog';
import { TVToast, showTVToast } from './src/components/TVToast';
import { TVExitConfirm } from './src/components/TVExitConfirm';
import BlurredBackground from './src/components/BlurredBackground';
import { useBackgroundImageStore } from './src/stores/backgroundImageStore';
import { restoreTvAppearanceSettings } from './src/stores/appearanceRestore';
import { fetchLatestRelease, compareVersions, getUpdateBadgeStore } from '@openreel/core';
import Constants from 'expo-constants';
import HomeScreen from './src/pages/HomeScreen';
import CategoryScreen from './src/pages/CategoryScreen';
import SearchScreen from './src/pages/SearchScreen';
import DetailScreen from './src/pages/DetailScreen';
import PlayScreen from './src/pages/PlayScreen';
import FavoritesScreen from './src/pages/FavoritesScreen';
import HistoryScreen from './src/pages/HistoryScreen';
import TaskListScreen from './src/pages/TaskListScreen';
import CollectConfigScreen from './src/pages/CollectConfigScreen';
import SourceManagerScreen from './src/pages/SourceManagerScreen';
import AiSourceImportScreen from './src/pages/AiSourceImportScreen';
import VideoManagementScreen from './src/pages/VideoManagementScreen';
import SettingsScreen from './src/pages/SettingsScreen';
import AppearanceSettingsScreen from './src/pages/AppearanceSettingsScreen';
import UsagePreferencesScreen from './src/pages/UsagePreferencesScreen';
import RecommendationSettingsScreen from './src/pages/RecommendationSettingsScreen';
import AboutScreen from './src/pages/AboutScreen';
import UpdateScreen from './src/pages/UpdateScreen';
import LicenseScreen from './src/pages/LicenseScreen';
import HelpCenterScreen from './src/pages/HelpCenterScreen';
import CollectGuideScreen from './src/pages/CollectGuideScreen';
import KidLockScreen from './src/pages/KidLockScreen';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  return (
    <>
      <StatusBar hidden />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          // 透明底：让根部 BlurredBackground 背景图层透出（页面自身不再铺不透明底色）
          contentStyle: { backgroundColor: 'transparent' },
          // TV 端手势/触摸不可靠，动画保持最短，避免遥控操作时等待
          animationDuration: 120,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ animation: 'none' }} />
        <Stack.Screen name="Category" component={CategoryScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Detail" component={DetailScreen} />
        <Stack.Screen name="Play" component={PlayScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="TaskList" component={TaskListScreen} />
        <Stack.Screen name="CollectConfig" component={CollectConfigScreen} />
        <Stack.Screen name="SourceManager" component={SourceManagerScreen} />
        <Stack.Screen name="AiSourceImport" component={AiSourceImportScreen} />
        <Stack.Screen name="VideoManagement" component={VideoManagementScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="AppearanceSettings" component={AppearanceSettingsScreen} />
        <Stack.Screen name="UsagePreferences" component={UsagePreferencesScreen} />
        <Stack.Screen name="RecommendationSettings" component={RecommendationSettingsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Update" component={UpdateScreen} />
        <Stack.Screen name="License" component={LicenseScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="CollectGuide" component={CollectGuideScreen} />
        <Stack.Screen name="KidLock" component={KidLockScreen} />
      </Stack.Navigator>
      {/* 焦点桥：无有效焦点时补焦点（页面初始焦点 / 焦点丢失恢复），全局只挂一次 */}
      <TVFocusBridge />
      {/* 增量采集进度窗口：全局浮层，collectSourceProgress 非空即在左下角弹出（对齐移动端） */}
      <CollectProgressDialog />
      {/* 全局 Toast：顶部靠右，自动消失，不抢焦点。任意页面 showTVToast(...) 即可 */}
      <TVToast />
      {/* 全局「再按一次退出」：栈底（首页）按返回键时提示，2 秒内再按退出，超时重新提示 */}
      <TVExitConfirm />
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [diskBlocked, setDiskBlocked] = useState<MigrationDiskError | null>(null);

  const initTheme = useThemeStore((s) => s.initTheme);
  const initColorMode = useThemeStore((s) => s.initColorMode);
  const initFontSizeScale = useThemeStore((s) => s.initFontSizeScale);
  const themeName = useThemeStore((s) => s.currentTheme);
  const colorScheme = useColorScheme();
  const bgImageUrl = useBackgroundImageStore((s) => s.imageUrl);

  useEffect(() => {
    Promise.all([
      initApp({ onMigrationProgress: setMigrationProgress }),
      initTheme(),
      initColorMode(),
      initFontSizeScale(),
      // TV 侧恢复外观数值项（卡片透明度/背景图缩放/背景图模糊/磨砂强度）——共享包的加载器与 TV 取值范围不一致，见该文件注释
      restoreTvAppearanceSettings(),
    ])
      .then(async () => {
        // TV 端分片预读并发降为 4（盒子网络/存储弱于手机），写入原生读取的文件桥
        await writePrefetchConcurrency();
        setReady(true);
      })
      .catch((err) => {
        console.error('TV 初始化失败:', err);
        if (err instanceof MigrationDiskError) {
          setDiskBlocked(err);
          return;
        }
        setReady(true);
      });

    // 冷启动自动检查更新（TV 端；失败静默，不阻塞启动）
    const currentVersion = Constants.expoConfig?.version ?? '';
    fetchLatestRelease()
      .then((release) => {
        if (currentVersion && compareVersions(release.version, currentVersion) > 0) {
          getUpdateBadgeStore().getState().setPendingUpdate(release.version);
          showTVToast(`发现新版本 v${release.version}，可到 设置 → 版本信息 查看`, 'info');
        }
      })
      .catch(() => {
        // 静默忽略：网络异常/无 Release 不打扰用户
      });
  }, []);

  const navTheme = themeName === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <BlurredBackground imageUrl={bgImageUrl}>
        {ready ? (
          <NavigationContainer theme={navTheme} documentTitle={{ enabled: false }}>
            <RootNavigator />
          </NavigationContainer>
        ) : (
          <TVStartupOverlay
            ready={ready}
            migrationProgress={migrationProgress}
            diskBlocked={diskBlocked}
          />
        )}
      </BlurredBackground>
    </SafeAreaProvider>
  );
}