/**
 * Expo config plugin：把 Android 清单改造成 Android TV 启动桌面（Launcher）。
 *
 * 在 TV 端 withTvLeanback.js 基础上追加 Launcher 能力：
 *   1. uses-feature android.software.leanback  required=false
 *   2. uses-feature android.hardware.touchscreen  required=false（电视无触摸）
 *   3. MainActivity 增加 LEANBACK_LAUNCHER intent-filter（电视启动器列表可见）
 *   4. MainActivity 强制横屏（screenOrientation=landscape）
 *   5. MainActivity 增加 HOME + DEFAULT intent-filter（成为系统可选「主屏幕应用」，
 *      按 HOME 键/开机时系统会列出本应用供用户选择为默认桌面）
 *   6. 允许明文 HTTP：CMS 片源接口大量仍是 http://（与手机端同策略）
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const LEANBACK_LAUNCHER_CATEGORY =
  'android.intent.category.LEANBACK_LAUNCHER';
const LANDSCAPE_CATEGORY = 'android.intent.category.LANDSCAPE';
const HOME_CATEGORY = 'android.intent.category.HOME';
const DEFAULT_CATEGORY = 'android.intent.category.DEFAULT';

/** 把 {intent-filter} 插到 launchMode/screenOrientation 之后、</activity> 之前 */
function addFilterIfMissing(activity, categories) {
  const list = activity['intent-filter'] || (activity['intent-filter'] = []);
  const exists = list.some((f) =>
    (f.category || []).some(
      (c) => c?.$?.['android:name'] === categories[0],
    ),
  );
  if (exists) return;

  list.push({
    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
    category: categories.map((name) => ({ $: { 'android:name': name } })),
  });
}

const withTvLauncher = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // 1) 触摸/leanback 特性声明：required=false 保证可装到无触摸电视与手机上
    const features = manifest['uses-feature'] || (manifest['uses-feature'] = []);
    const upsert = (name, required) => {
      let f = features.find((x) => x?.$?.['android:name'] === name);
      if (!f) {
        f = { $: { 'android:name': name } };
        features.push(f);
      }
      f.$['android:required'] = required;
    };
    upsert('android.software.leanback', 'false');
    upsert('android.hardware.touchscreen', 'false');

    // 2) 关闭触摸必需标记（TV 上没有触屏）
    cfg.modResults.manifest.$ = {
      ...(manifest.$ || {}),
      'xmlns:tools': 'http://schemas.android.com/tools',
    };

    // 3) MainActivity：横屏 + LEANBACK_LAUNCHER + HOME/DEFAULT（替代系统桌面）
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    // 注意：getMainActivityOrThrow 吃的是整个 manifest 对象（内部会再取 .manifest.application），
    // 传 application 会取不到 activity。
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$ = {
      ...(activity.$ || {}),
      'android:screenOrientation': 'landscape',
      'android:exported': 'true',
      // TV 无触摸，禁用 resizeable 以适配电视固定分辨率
      'android:resizeableActivity': 'false',
    };
    addFilterIfMissing(activity, [LEANBACK_LAUNCHER_CATEGORY, LANDSCAPE_CATEGORY]);
    addFilterIfMissing(activity, [HOME_CATEGORY, DEFAULT_CATEGORY]);

    // 4) 允许明文 HTTP：CMS 片源接口大量仍是 http://（与手机端同策略）
    //    放在本插件里做，避免为了一个属性再引 expo-build-properties 依赖
    application.$ = {
      ...(application.$ || {}),
      'android:usesCleartextTraffic': 'true',
    };

    return cfg;
  });

module.exports = withTvLauncher;
