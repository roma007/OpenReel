package com.openreel.tvlauncher

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import java.io.ByteArrayOutputStream
import java.text.Collator
import java.util.Locale

/**
 * 已安装应用列表模块（TV Launcher「应用列表区」数据源）。
 *
 * 查询带 LAUNCHER / LEANBACK_LAUNCHER intent-filter 的可启动应用（两者取并集去重，
 * 酷开等盒子上部分应用只带 LAUNCHER、部分只带 LEANBACK_LAUNCHER），过滤掉本应用自身。
 * 图标压缩为 96x96 PNG base64 data URI 跨桥传递（TV 端应用数量有限，一次拉全量可接受）。
 * Android 11+ 查询全部包依赖 manifest 的 QUERY_ALL_PACKAGES 权限。
 */
class InstalledAppsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "InstalledApps"

  @ReactMethod
  fun getLaunchableApps(promise: Promise) {
    Thread {
      try {
        val pm = reactContext.packageManager
        val self = reactContext.packageName

        // LAUNCHER 与 LEANBACK_LAUNCHER 两个 intent-filter 取并集，按包名去重
        val seen = LinkedHashMap<String, android.content.pm.ResolveInfo>()
        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        pm.queryIntentActivities(launcherIntent, 0).forEach {
          if (it.activityInfo != null) seen[it.activityInfo.packageName] = it
        }
        val leanbackIntent = Intent(Intent.ACTION_MAIN).addCategory("android.intent.category.LEANBACK_LAUNCHER")
        pm.queryIntentActivities(leanbackIntent, 0).forEach {
          if (it.activityInfo != null) seen.putIfAbsent(it.activityInfo.packageName, it)
        }

        val collator = Collator.getInstance(Locale.CHINA)
        val entries = seen.entries
          .filter { it.key != self }
          // 过滤系统设置类应用：系统设置入口收敛到设置页「电视系统」组（2026-10-20 用户确认），
          // 首页应用卡片不再展示。label 精确匹配避免误伤名称含「设置」的普通应用。
          .filter { !isSettingsApp(safeLabel(pm, it.value), it.key) }
          .map { (pkg, info) ->
            val label = safeLabel(pm, info)
            Triple(pkg, label, info.activityInfo.applicationInfo)
          }
          .sortedWith(Comparator { a, b -> collator.compare(a.second, b.second) })

        val arr = WritableNativeArray()
        for ((pkg, label, appInfo) in entries) {
          val map = WritableNativeMap()
          map.putString("packageName", pkg)
          map.putString("label", label)
          map.putString("icon", iconToDataUri(appInfo.loadIcon(pm)))
          arr.pushMap(map)
        }
        promise.resolve(arr)
      } catch (e: Exception) {
        promise.reject("GET_APPS_FAILED", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun launchApp(packageName: String, promise: Promise) {
    try {
      val pm = reactContext.packageManager
      // 优先 LAUNCHER 入口，其次 LEANBACK_LAUNCHER（leanback-only 应用）
      val resolveInfo =
        pm.queryIntentActivities(
          Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(packageName),
          0,
        ).firstOrNull()
          ?: pm.queryIntentActivities(
            Intent(Intent.ACTION_MAIN).addCategory("android.intent.category.LEANBACK_LAUNCHER").setPackage(packageName),
            0,
          ).firstOrNull()

      if (resolveInfo?.activityInfo == null) {
        promise.reject("NOT_LAUNCHABLE", "应用无启动入口: $packageName")
        return
      }
      val intent = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_LAUNCHER)
        .setClassName(resolveInfo.activityInfo.packageName, resolveInfo.activityInfo.name)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("LAUNCH_FAILED", e.message, e)
    }
  }

  private fun safeLabel(pm: android.content.pm.PackageManager, info: android.content.pm.ResolveInfo): String {
    return try {
      info.loadLabel(pm)?.toString() ?: info.activityInfo.packageName
    } catch (e: Exception) {
      info.activityInfo.packageName
    }
  }

  /**
   * 系统设置类应用判定：应用名精确命中常见设置文案，或包名为 AOSP/Android TV 设置。
   * 仅用于首页应用列表过滤；设置页「电视系统」组不受影响。
   */
  private fun isSettingsApp(label: String, packageName: String): Boolean {
    if (packageName.startsWith("com.android.settings") ||
      packageName.startsWith("com.android.tv.settings")
    ) {
      return true
    }
    return label == "设置" ||
      label == "系统设置" ||
      label.equals("Settings", ignoreCase = true) ||
      label.equals("System Settings", ignoreCase = true)
  }

  private fun iconToDataUri(drawable: Drawable): String {
    return try {
      val bitmap = drawableToBitmap(drawable)
      val scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true)
      val out = ByteArrayOutputStream()
      scaled.compress(Bitmap.CompressFormat.PNG, 100, out)
      "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
      ""
    }
  }

  private fun drawableToBitmap(drawable: Drawable): Bitmap {
    if (drawable is BitmapDrawable && drawable.bitmap != null) return drawable.bitmap
    val w = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
    val h = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)
    return bmp
  }
}
