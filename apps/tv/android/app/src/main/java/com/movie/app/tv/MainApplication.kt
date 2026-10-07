package com.movie.app.tv

import android.app.Application
import android.content.res.Configuration

import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)

    // TV 焦点系统必需：RN 0.86 默认关闭 `enableImperativeFocus`，
    // 即 `ref.focus()` 对非 TextInput 视图是空实现（ReactViewManager.handleFocus 内
    // `if (ReactNativeFeatureFlags.enableImperativeFocus())` 才调 requestFocusFromJS()），
    // 而 RNOSS Stable/Canary/Experimental 三档覆盖都没开这个 flag。
    // 不开的后果（2026-10-05 logcat + uiautomator 实测）：页面声明的初始焦点
    // （如搜索页 search-input）永远拿不到焦点，焦点只能停在原生 FocusFinder 选出的
    // 第一个可聚焦元素上（search-back）。
    try {
      // loadReactNative 内部已 override 过一次，直接再 override 会抛
      // "Feature flags cannot be overridden more than once"（实测），故先 reset 再覆盖。
      // reset 会清掉 accessor 的缓存值；enableImperativeFocus 是懒读取的，
      // 此处尚未被读过，覆盖后能生效。
      ReactNativeFeatureFlags.dangerouslyReset()
      ReactNativeFeatureFlags.override(
        object : ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android() {
          override fun enableImperativeFocus(): Boolean = true

          // 播放页「左/右键快进快退」必需：RN 0.86 默认关闭 enableKeyEvents，
          // 关闭时 ReactRootView.dispatchJSKeyEvent 直接 return，JS 的 View.onKeyDown 永不触发。
          // 开启后，聚焦视图收到按键会派发 topKeyDown → JS `onKeyDown`（nativeEvent.code = ArrowLeft/ArrowRight/Enter）。
          // 注意：该派发**不消费**按键，原生 FocusFinder 仍会移动焦点，
          // 故播放页用一个「播放区」作为默认焦点（左右无相邻可聚焦元素，焦点不动），
          // 控制条按钮改用上/下键进入。
          override fun enableKeyEvents(): Boolean = true
        },
      )
    } catch (e: Throwable) {
      // 覆盖失败只影响「主动补焦点」体验（方向键仍由原生 FocusFinder 正常工作），不致命
      Log.w("TvFeatureFlags", "enableImperativeFocus override failed: $e")
    }

    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
