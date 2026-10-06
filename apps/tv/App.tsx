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
import HomeScreen from './src/pages/HomeScreen';
import CategoryScreen from './src/pages/CategoryScreen';
import SearchScreen from './src/pages/SearchScreen';
import DetailScreen from './src/pages/DetailScreen';
import PlayScreen from './src/pages/PlayScreen';
import FavoritesScreen from './src/pages/FavoritesScreen';
import HistoryScreen from './src/pages/HistoryScreen';
import CollectScreen from './src/pages/CollectScreen';
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
        <Stack.Screen name="Collect" component={CollectScreen} />
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
        <Stack.Screen name="License" component={LicenseScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="CollectGuide" component={CollectGuideScreen} />
        <Stack.Screen name="KidLock" component={KidLockScreen} />
      </Stack.Navigator>
      {/* 焦点桥：无有效焦点时补焦点（页面初始焦点 / 焦点丢失恢复），全局只挂一次 */}
      <TVFocusBridge />
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

  useEffect(() => {
    Promise.all([initApp({ onMigrationProgress: setMigrationProgress }), initTheme(), initColorMode(), initFontSizeScale()])
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
  }, []);

  const navTheme = themeName === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}