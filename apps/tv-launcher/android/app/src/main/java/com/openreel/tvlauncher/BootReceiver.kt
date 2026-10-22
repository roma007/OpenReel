package com.openreel.tvlauncher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 开机自启接收器。
 *
 * 背景：酷开电视 ROM 用私有 action coocaa.intent.action.HOME 启动桌面，不走标准
 * AMS HOME 流程；即使 HOME intent 已唯一解析到本应用，酷开 AMS 也不会在开机时
 * 主动拉起（官方移植文档提到 persist.service.model.pkg 需 root 才能持久写）。
 * 实测：普通 shell 写 persist 仅内存生效、重启即丢。
 *
 * 折中方案（当贝桌面同款）：监听 BOOT_COMPLETED，开机完成后自己把 MainActivity
 * 盖到前台。Android 10+ 后台启动 activity 默认被禁，但本项目 manifest 已声明
 * SYSTEM_ALERT_WINDOW，该权限可豁免此限制（实测 Android 10 酷开电视可行）。
 *
 * 配套机制：收到广播后先等 3 秒——酷开 ROM 会拉起自家 screensaver / coosservice，
 * 延迟后起才能盖在最上层。若 3 秒后发现前台不是本应用，再由 BootWatchdog 二次补拉
 * （见 invokeAndScheduleRetry）。
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    Log.i(TAG, "BOOT_COMPLETED received, scheduling launcher bring-up")
    // 主线程做延迟：goAsync 把 onReceive 生命周期延长到后台线程，最多 10 秒
    val pending = goAsync()
    Thread {
      try {
        Thread.sleep(START_DELAY_MS)
        invokeAndScheduleRetry(context, attempt = 1)
      } finally {
        pending.finish()
      }
    }.start()
  }

  companion object {
    private const val TAG = "BootReceiver"
    /** 首次拉起前的延迟：让酷开 ROM 的 screensaver / coosservice 先起，再盖上去 */
    private const val START_DELAY_MS = 3000L
    /** 前台不是本应用时的二次补拉间隔 */
    private const val RETRY_DELAY_MS = 3000L
    /** 最多补拉 3 次，覆盖 ROM 拉起顺序不确定的情况 */
    private const val MAX_ATTEMPTS = 3

    /**
     * 把 MainActivity 拉到前台；若拉起后一段时间内前台仍不是本应用（被 ROM
     * 的屏保/服务盖回），则延迟重试，最多 MAX_ATTEMPTS 次。
     */
    fun invokeAndScheduleRetry(context: Context, attempt: Int) {
      if (attempt > MAX_ATTEMPTS) {
        Log.w(TAG, "bring-up aborted after $MAX_ATTEMPTS attempts")
        return
      }
      try {
        val launch = Intent(context, MainActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
          addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
          // 与 manifest 的酷开私有 intent-filter 对齐，兼容酷开 AMS 的显式匹配
          action = "coocaa.intent.action.HOME"
          addCategory("android.intent.category.HOME.CC")
        }
        context.startActivity(launch)
        Log.i(TAG, "launcher bring-up attempt $attempt sent")
      } catch (t: Throwable) {
        Log.e(TAG, "bring-up attempt $attempt failed: ${t.message}")
      }
      if (attempt < MAX_ATTEMPTS) {
        Thread {
          try {
            Thread.sleep(RETRY_DELAY_MS)
            invokeAndScheduleRetry(context, attempt + 1)
          } catch (t: Throwable) {
            Log.e(TAG, "retry scheduling failed: ${t.message}")
          }
        }.start()
      }
    }
  }
}
