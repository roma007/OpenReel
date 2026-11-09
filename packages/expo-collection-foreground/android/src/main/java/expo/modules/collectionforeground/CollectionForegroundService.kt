package expo.modules.collectionforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * 采集期前台服务：让全量采集在锁屏/切后台时继续跑。
 *
 * 只做两件事：
 *  - startForeground 挂一个常驻通知（Android 8+ 需要渠道；14+ 需要 dataSync 类型）；
 *  - 被系统回收后 START_STICKY 重启（通知文案重置为默认，进程内采集状态由 JS 侧断点续采恢复）。
 */
class CollectionForegroundService : Service() {

  companion object {
    private const val CHANNEL_ID = "openreel_collection"
    private const val NOTIFICATION_ID = 10021
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"

    fun start(context: Context, title: String?, text: String?) {
      val intent = Intent(context, CollectionForegroundService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_TEXT, text)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, CollectionForegroundService::class.java))
    }
  }

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    startForeground(NOTIFICATION_ID, buildNotification(null, null))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE)
    val text = intent?.getStringExtra(EXTRA_TEXT)
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification(title, text))
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "采集任务",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "正在后台采集片库时显示"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(title: String?, text: String?): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle(title ?: "正在采集片库")
      .setContentText(text ?: "采集会在后台继续，完成后自动结束")
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }
}
