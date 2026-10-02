//! 进程 CPU 差分采样（资源监控浮窗「CPU%」指标）。
//! 口径与移动端功能19 一致：进程占**整机全部逻辑核**的百分比（上限 100%）。
//! - 分子：进程累计 CPU 时间（user + system，跨核已累加）差分
//! - 分母：墙钟增量 × 逻辑核数
//! 首次调用只记录基线并返回 -1（调用方按 `pct >= 0` 过滤）。

use std::sync::Mutex;
use std::time::Instant;

/// 进程累计 CPU 时间（纳秒）。macOS 走 clock_gettime(CLOCK_PROCESS_CPUTIME_ID)（user+system）。
/// 不用 proc_pidinfo(PROC_PIDTASKINFO) 的 pti_total_user：实测在本机严重偏小
/// （2s 忙循环只读到 38ms，而 clock_gettime 读到 1.61s）；proc_pid_rusage 更是返回 0 且致进程退出段错误。
/// 与移动端 iOS 功能19 同一口径来源。
#[cfg(target_os = "macos")]
fn process_cpu_nanos() -> Option<u64> {
    let mut ts: libc::timespec = unsafe { std::mem::zeroed() };
    if unsafe { libc::clock_gettime(libc::CLOCK_PROCESS_CPUTIME_ID, &mut ts) } != 0 {
        return None;
    }
    Some((ts.tv_sec.max(0) as u64).saturating_mul(1_000_000_000) + ts.tv_nsec.max(0) as u64)
}

/// 进程累计 CPU 时间（纳秒）。Windows 走 kernel32 GetProcessTimes（FILETIME，100ns 单位）。
#[cfg(target_os = "windows")]
fn process_cpu_nanos() -> Option<u64> {
    use std::ffi::c_void;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn GetProcessTimes(
            h_process: *mut c_void,
            lp_creation_time: *mut u64,
            lp_exit_time: *mut u64,
            lp_kernel_time: *mut u64,
            lp_user_time: *mut u64,
        ) -> i32;
    }

    let (mut creation, mut exit, mut kernel, mut user) = (0u64, 0u64, 0u64, 0u64);
    let ok = unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        )
    };
    if ok == 0 {
        return None;
    }
    // FILETIME 为 100ns 单位，换算纳秒
    Some(
        kernel
            .saturating_add(user)
            .saturating_mul(100),
    )
}

/// 进程累计 CPU 时间（纳秒）。其余 unix 读 /proc/self/stat 的 utime+stime（jiffies）。
#[cfg(all(unix, not(target_os = "macos")))]
fn process_cpu_nanos() -> Option<u64> {
    let stat = std::fs::read_to_string("/proc/self/stat").ok()?;
    // 第 2 个字段（comm）可能含空格与括号，按最后一个 ')' 切分
    let close = stat.rfind(')')?;
    let fields: Vec<&str> = stat[close + 1..].split_whitespace().collect();
    // 切分后 fields[0] 为 state（第 3 字段），故 utime = 第 14 字段 = 下标 11，stime = 下标 12
    let utime: u64 = fields.get(11)?.parse().ok()?;
    let stime: u64 = fields.get(12)?.parse().ok()?;
    let hz = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
    if hz <= 0 {
        return None;
    }
    Some((utime.saturating_add(stime)).saturating_mul(1_000_000_000) / hz as u64)
}

#[cfg(not(any(unix, target_os = "windows")))]
fn process_cpu_nanos() -> Option<u64> {
    None
}

/// 上一次采样基线：(采样墙钟时刻, 进程累计 CPU 纳秒)
static LAST_SAMPLE: Mutex<Option<(Instant, u64)>> = Mutex::new(None);

/// 返回当前进程自上次调用以来的平均 CPU 占用率（占整机全部核的百分比，上限 100%）。
/// 首次调用返回 -1.0（仅建立基线）；平台不支持或读取失败返回错误。
#[tauri::command]
pub fn process_cpu_percent() -> Result<f64, String> {
    let cpu_now = process_cpu_nanos().ok_or_else(|| "读取进程 CPU 时间失败".to_string())?;
    let wall_now = Instant::now();
    let mut guard = LAST_SAMPLE
        .lock()
        .map_err(|_| "CPU 采样状态锁已损坏".to_string())?;
    let prev = *guard;
    *guard = Some((wall_now, cpu_now));
    let (prev_wall, prev_cpu) = match prev {
        Some(v) => v,
        None => return Ok(-1.0),
    };
    let dt = wall_now.duration_since(prev_wall).as_secs_f64();
    let d_cpu = cpu_now.saturating_sub(prev_cpu) as f64 / 1_000_000_000.0;
    if dt <= 1e-4 {
        return Ok(-1.0);
    }
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1);
    Ok((d_cpu / (dt * cores as f64)) * 100.0)
}
