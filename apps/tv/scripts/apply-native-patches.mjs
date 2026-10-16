// TV 端（apps/tv）需要的 expo-video Android 原生补丁。
// 与手机端 apps/mobile/scripts/apply-native-patches.mjs 同源逻辑，但只取 TV 必需的项：
//   1. N 并发分片读取（DataSourceUtils.kt 读 cacheDir/prefetch_concurrency）
//   2. 预读分片进度（VideoPlayer.kt 写 cacheDir/segment_progress.json，JS 轮询渲染）
// TV 端不需要的：PiP 相关全部补丁（TV 版已砍画中画）、CPU 采样浮窗（诊断用桌面/手机专用）、
// 所有 iOS 补丁（TV 端仅 Android）。任何异常不抛出，避免阻断安装。
//
// 依据：AGENTS.md「移动端构建同步铁律」——依赖 node_modules 补丁的能力在重装/重编时有丢失风险，
// 故 TV 端同样在 postinstall 自动重打。

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function resolvePkg(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

// ---------- 并发保护 ----------
// apps/tv 与 apps/mobile 的 postinstall 会补丁同一份被 pnpm hoist 的 node_modules/expo-video，
// 而 pnpm 可能并发执行两个 package 的 postinstall。两个进程同时读-改-写同一文件会互相覆盖
// （lost update）并因非原子写产生残渣——曾把 VideoPlayer.kt 写坏（多出 2 行残渣），Kotlin 编译失败。
// 故用目录锁把整个补丁流程串行化（Node 主线程可用 Atomics.wait 同步等待）。
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function patchLockDir() {
  for (const name of ['expo-video', 'expo-video-cache', 'expo-file-system']) {
    const pkgDir = resolvePkg(name);
    if (pkgDir) return join(dirname(pkgDir), '.apply-native-patches.lock');
  }
  return null;
}

function withPatchLock(fn) {
  const dir = patchLockDir();
  if (!dir) {
    fn();
    return;
  }
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(dir);
      break;
    } catch (e) {
      if (e && e.code !== 'EEXIST') {
        fn(); // 无法加锁也不阻断安装
        return;
      }
      try {
        // 陈旧锁（上次进程被强杀）超 5 分钟则接管
        if (Date.now() - statSync(dir).mtimeMs > 5 * 60 * 1000) {
          rmSync(dir, { recursive: true, force: true });
          continue;
        }
      } catch {}
      if (Date.now() - started > 10 * 60 * 1000) {
        console.log('[tv-patch] 等待补丁锁超时（跳过，可手动重跑本脚本）');
        return;
      }
      sleepSync(100);
    }
  }
  try {
    fn();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- Android: N 并发分片读取 ----------
function patchConcurrency() {
  const pkgDir = resolvePkg('expo-video');
  if (!pkgDir) {
    console.log('[tv-patch] expo-video 未安装，跳过并发补丁');
    return;
  }
  const file = join(pkgDir, 'android/src/main/java/expo/modules/video/utils/DataSourceUtils.kt');
  if (!existsSync(file)) {
    console.log('[tv-patch] DataSourceUtils.kt 未找到，跳过并发补丁');
    return;
  }
  let content = readFileSync(file, 'utf8');
  // 幂等标记：两端同源补丁共用功能标记，避免顺序/并发不同导致重复注入或误报
  if (
    content.includes('N 并发分片读取') ||
    content.includes('功能12') ||
    content.includes('prefetch_concurrency')
  ) {
    console.log('[tv-patch] Android 并发补丁已存在（TV 或移动端脚本注入），跳过');
    return;
  }
  if (!content.includes('import okhttp3.Dispatcher')) {
    content = content.replace(
      'import okhttp3.OkHttpClient\n',
      'import okhttp3.OkHttpClient\nimport okhttp3.Dispatcher\nimport java.io.File\n',
    );
  }
  const origLine = '  val client = OkHttpClient.Builder().build()';
  if (!content.includes(origLine)) {
    console.log('[tv-patch][Android] 未匹配到 OkHttpClient 构建行，跳过');
    return;
  }
  const patched = `  // TV 端 N 并发分片读取：并发数由 JS 写入 cacheDir/prefetch_concurrency。
  // TV 盒子存储与网络通常弱于手机，故默认取 4（手机端默认 6，由 JS 侧按端覆盖）。
  val prefetchFile = File(context.cacheDir, "prefetch_concurrency")
  val maxRequests = if (prefetchFile.exists()) {
    try {
      prefetchFile.readText().trim().toIntOrNull()?.coerceAtLeast(1) ?: 4
    } catch (e: Exception) {
      4
    }
  } else {
    4
  }
  val client = OkHttpClient.Builder()
    .dispatcher(Dispatcher().apply { maxRequestsPerHost = maxRequests })
    .build()`;
  content = content.replace(origLine, patched);
  writeFileSync(file, content);
  console.log('[tv-patch] Android DataSourceUtils.kt 已注入并发补丁');
}

// ---------- Android: 预读分片进度 ----------
function patchSegmentProgress() {
  const pkgDir = resolvePkg('expo-video');
  if (!pkgDir) return;
  const file = join(pkgDir, 'android/src/main/java/expo/modules/video/player/VideoPlayer.kt');
  if (!existsSync(file)) {
    console.log('[tv-patch] VideoPlayer.kt 未找到，跳过分片进度补丁');
    return;
  }
  let content = readFileSync(file, 'utf8');
  // 幂等标记：两端同源补丁共用功能标记
  if (
    content.includes('预读分片进度') ||
    content.includes('功能13') ||
    content.includes('segment_progress.json')
  ) {
    console.log('[tv-patch] Android 分片进度补丁已存在（TV 或移动端脚本注入），跳过');
    return;
  }
  if (!content.includes('import java.io.File\n')) {
    content = content.replace(
      'import java.io.FileInputStream\n',
      'import java.io.FileInputStream\nimport java.io.File\nimport org.json.JSONArray\nimport org.json.JSONObject\n',
    );
  }
  const anchor =
    '    override fun onVideoInputFormatChanged(eventTime: AnalyticsListener.EventTime, format: Format, decoderReuseEvaluation: DecoderReuseEvaluation?) {\n      currentVideoTrack = availableVideoTracks.firstOrNull { it.format?.id == format.id }\n      super.onVideoInputFormatChanged(eventTime, format, decoderReuseEvaluation)\n    }\n  }';
  if (!content.includes(anchor)) {
    console.log('[tv-patch][Android] 未匹配到 analyticsListener 锚点，跳过分片进度补丁');
    return;
  }
  const injected = `    override fun onVideoInputFormatChanged(eventTime: AnalyticsListener.EventTime, format: Format, decoderReuseEvaluation: DecoderReuseEvaluation?) {
      currentVideoTrack = availableVideoTracks.firstOrNull { it.format?.id == format.id }
      super.onVideoInputFormatChanged(eventTime, format, decoderReuseEvaluation)
    }

    // TV 端「预读分片进度」：以真实分片加载事件驱动，禁止伪造。
    // 状态写入 cacheDir/segment_progress.json，JS 轮询读取渲染。
    private val segmentStates = java.util.concurrent.ConcurrentHashMap<String, Int>()
    private val segmentProgress = java.util.concurrent.ConcurrentHashMap<String, Double>()
    private var lastSegmentFlush = 0L

    private fun isMediaSegment(uri: String?): Boolean {
      if (uri == null) return false
      val u = uri.lowercase()
      if (u.contains(".m3u8") || u.contains("init.mp4") || u.contains(".mpd")) return false
      return true
    }

    private fun flushSegmentStates() {
      val now = System.currentTimeMillis()
      if (now - lastSegmentFlush < 400) return
      lastSegmentFlush = now
      try {
        val arr = JSONArray()
        segmentStates.forEach { (uri, state) ->
          val o = JSONObject()
          o.put("url", uri)
          o.put("state", state) // 0=loading 1=done 2=error
          o.put("progress", segmentProgress[uri] ?: if (state == 1) 1.0 else 0.0)
          arr.put(o)
        }
        val root = JSONObject()
        root.put("updatedAt", now)
        root.put("segments", arr)
        val file = File(context.cacheDir, "segment_progress.json")
        file.writeText(root.toString())
      } catch (e: Exception) {
        // best-effort，不阻断播放
      }
    }

    override fun onLoadStarted(eventTime: AnalyticsListener.EventTime, loadEventInfo: androidx.media3.exoplayer.source.LoadEventInfo, mediaLoadData: androidx.media3.exoplayer.source.MediaLoadData) {
      if (isMediaSegment(loadEventInfo.uri?.toString())) {
        segmentStates[loadEventInfo.uri.toString()] = 0
        flushSegmentStates()
      }
      super.onLoadStarted(eventTime, loadEventInfo, mediaLoadData)
    }

    override fun onLoadCompleted(eventTime: AnalyticsListener.EventTime, loadEventInfo: androidx.media3.exoplayer.source.LoadEventInfo, mediaLoadData: androidx.media3.exoplayer.source.MediaLoadData) {
      if (isMediaSegment(loadEventInfo.uri?.toString())) {
        segmentStates[loadEventInfo.uri.toString()] = 1
        segmentProgress[loadEventInfo.uri.toString()] = 1.0
        flushSegmentStates()
      }
      super.onLoadCompleted(eventTime, loadEventInfo, mediaLoadData)
    }

    override fun onLoadError(eventTime: AnalyticsListener.EventTime, loadEventInfo: androidx.media3.exoplayer.source.LoadEventInfo, mediaLoadData: androidx.media3.exoplayer.source.MediaLoadData, error: java.io.IOException, wasCanceled: Boolean) {
      if (isMediaSegment(loadEventInfo.uri?.toString())) {
        segmentStates[loadEventInfo.uri.toString()] = 2
        flushSegmentStates()
      }
      super.onLoadError(eventTime, loadEventInfo, mediaLoadData, error, wasCanceled)
    }
  }`;
  content = content.replace(anchor, injected);
  writeFileSync(file, content);
  console.log('[tv-patch] Android VideoPlayer.kt 已注入分片进度补丁');
}

withPatchLock(() => {
  try {
    patchConcurrency();
    patchSegmentProgress();
  } catch (e) {
    console.log('[tv-patch] 补丁过程异常（已忽略）:', e?.message || String(e));
  }
});