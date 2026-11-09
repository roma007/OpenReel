package expo.modules.collectionforeground

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS 侧入口：采集开始/结束时开关前台服务。
 * 调用失败（如系统限制）不抛给 JS，避免影响采集主链路。
 */
class ExpoCollectionForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoCollectionForeground")

    Function("start") { title: String?, text: String? ->
      val context = appContext.reactContext ?: return@Function false
      runCatching {
        CollectionForegroundService.start(context, title, text)
        true
      }.getOrDefault(false)
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      runCatching {
        CollectionForegroundService.stop(context)
        true
      }.getOrDefault(false)
    }
  }
}
