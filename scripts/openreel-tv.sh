#!/usr/bin/env bash
# openreel-tv.sh —— 一键把 TV 端跑起来（Metro + Android TV 模拟器 + 应用）。
#
# 形态与 /Applications/movie.app 同源：由 /Applications/openreel-tv.app（Automator
# 「运行 Shell 脚本」动作）调用，也可在终端单独执行。干完即退出；Metro 与模拟器
# 作为后台进程继续存活（本脚本是「启动器」，不是常驻 dev server）。
#
# 幂等：Metro 已在跑则跳过启动；已有在线 Android 设备则复用，不再新起模拟器。
# 全程不调用需要 TCC 辅助功能权限的接口（不 osascript System Events set frontmost）。
set -uo pipefail

REPO_DIR="/Users/mengfeng/我的文档/源码/openreel"
LOG_DIR="$HOME/Library/Logs/openreel-tv"
METRO_LOG="$LOG_DIR/metro.log"
LAUNCH_LOG="$LOG_DIR/launcher.log"
AVD_NAME="tvhome-tv"
DNS_SERVER="8.8.8.8,8.8.4.4"
APP_ID="com.movie.app.tv"
ACTIVITY="$APP_ID/.MainActivity"
METRO_PORT=8081

mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LAUNCH_LOG"
}

# 后台发送，不阻塞主流程；display notification 不需要辅助功能权限（≠ System Events）。
notify() {
  ( osascript -e "display notification \"$1\" with title \"openreel-tv\"" >/dev/null 2>&1 || true ) &
}

# PATH 兜底：Automator 直接 bash 调用时未必继承交互式 shell 的 PATH。
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:/opt/homebrew/bin:/usr/local/bin:$PATH"

ADB="$(command -v adb || echo "$ANDROID_HOME/platform-tools/adb")"
EMULATOR="$(command -v emulator || echo "$ANDROID_HOME/emulator/emulator")"

metro_ready() {
  curl -fsS "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"
}

first_online_device() {
  "$ADB" devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}'
}

cd "$REPO_DIR" 2>/dev/null || { log "仓库目录不存在: $REPO_DIR"; notify "启动失败：仓库目录不存在"; exit 1; }

# —— 1. 确保 Metro（8081）在跑 ——
if metro_ready; then
  log "Metro 已在运行（:$METRO_PORT），跳过启动"
else
  log "Metro 未运行，后台启动 expo start --port $METRO_PORT（日志 $METRO_LOG）"
  # 关键：& 在外层、子 shell 内 exec，彻底脱离，避免子 shell 遗留 wait4 阻塞脚本退出。
  ( cd "$REPO_DIR/apps/tv" && exec nohup npx --no-install expo start --port "$METRO_PORT" >>"$METRO_LOG" 2>&1 ) &
  for i in $(seq 1 90); do
    if metro_ready; then
      log "Metro 就绪（等待 ${i}s）"
      break
    fi
    sleep 1
  done
  if ! metro_ready; then
    log "Metro 90s 内未就绪，放弃"
    notify "启动失败：Metro 未就绪"
    exit 1
  fi
fi

# —— 2. 确保 Android 设备在线 ——
DEV="$(first_online_device)"
if [ -n "$DEV" ]; then
  log "检测到在线设备: $DEV"
else
  log "无在线设备，后台启动模拟器（AVD $AVD_NAME，DNS $DNS_SERVER）"
  nohup "$EMULATOR" -avd "$AVD_NAME" -dns-server "$DNS_SERVER" >>"$LAUNCH_LOG" 2>&1 &
  for i in $(seq 1 360); do
    DEV="$(first_online_device)"
    [ -n "$DEV" ] && break
    sleep 1
  done
  if [ -z "$DEV" ]; then
    log "360s 内未检测到在线设备，放弃"
    notify "启动失败：模拟器未连接"
    exit 1
  fi
  log "设备已连接: $DEV（等待 ${i}s）"
fi

# —— 3. 等待系统启动完成（sys.boot_completed=1，≤360s） ——
BOOTED=""
for i in $(seq 1 360); do
  BOOTED="$("$ADB" -s "$DEV" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  [ "$BOOTED" = "1" ] && break
  sleep 1
done
if [ "$BOOTED" != "1" ]; then
  log "设备 $DEV 系统未在预期时间内启动完成"
  notify "启动失败：系统未就绪"
  exit 1
fi
log "系统已启动完成（boot_completed=1）"

# —— 4. adb reverse：把设备的 8081 转发到 Mac 的 Metro ——
if "$ADB" -s "$DEV" reverse tcp:"$METRO_PORT" tcp:"$METRO_PORT" >>"$LAUNCH_LOG" 2>&1; then
  log "adb reverse tcp:$METRO_PORT 完成"
else
  log "adb reverse 失败（继续尝试启动应用）"
fi

# —— 5. 拉起 TV 端应用 ——
"$ADB" -s "$DEV" shell am force-stop "$APP_ID" >>"$LAUNCH_LOG" 2>&1
"$ADB" -s "$DEV" shell am start -n "$ACTIVITY" >>"$LAUNCH_LOG" 2>&1
log "已启动 $ACTIVITY（设备 $DEV）"

notify "已启动 TV 端应用（$DEV）"
log "完成"
exit 0
