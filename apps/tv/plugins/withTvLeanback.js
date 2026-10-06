/**
 * Expo config plugin：把 Android 清单改造成 Android TV 应用。
 *
 * 依据（2026-10-05 tvhome-tv 实测）：该设备 `android.software.leanback_only=true`，
 * 即设备只认 Leanback 应用。若缺少 LEANBACK_LAUNCHER intent-filter，电视启动器
 * 不会展示本应用（也进不了商店 TV 分类）。故以下声明是硬要求：
 *   1. uses-feature android.software.leanback  required=false
 *   2. uses-feature android.hardware.touchscreen  required=false（电视无触摸）
 *   3. MainActivity 增加 LEANBACK_LAUNCHER intent-filter
 *   4. MainActivity 强制横屏（screenOrientation=landscape）
 *   5. 不声明 touchscreen，摇杆/键盘依赖交给系统默认
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const LEANBACK_LAUNCHER_CATEGORY =
  'android.intent.category.LEANBACK_LAUNCHER';
const LEANBACK_CATEGORY = 'android.intent.category.LANDSCAPE';

/** 把 {intent-filter} 插到 launchMode/screenOrientation 之后、</activity> 之前 */
function addLeanbackFilter(activity) {
  const list = activity['intent-filter'] || (activity['intent-filter'] = []);
  const exists = list.some((f) =>
    (f.category || []).some((c) => c?.$?.['android:name'] === LEANBACK_LAUNCHER_CATEGORY),
  );
  if (exists) return;

  list.push({
    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
    category: [
      { $: { 'android:name': LEANBACK_LAUNCHER_CATEGORY } },
      { $: { 'android:name': LEANBACK_CATEGORY } },
    ],
  });
}

const withTvLeanback = (config) =>
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

    // 3) MainActivity：横屏 + LEANBACK_LAUNCHER
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
    addLeanbackFilter(activity);

    // 4) 允许明文 HTTP：CMS 片源接口大量仍是 http://（与手机端同策略）
    //    放在本插件里做，避免为了一个属性再引 expo-build-properties 依赖
    application.$ = {
      ...(application.$ || {}),
      'android:usesCleartextTraffic': 'true',
    };

    return cfg;
  });

module.exports = withTvLeanback;