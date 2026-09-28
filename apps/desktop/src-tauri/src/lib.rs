mod video_fetch;
mod pip_window;
mod window_state;

use tauri::{Manager, WindowEvent};
use tauri_plugin_http::init as init_http;

/// 数据库 schema 现由 TypeScript 层（tauriSqlProvider.ts）管理，
/// 不再使用 tauri-plugin-sql 的 Rust 迁移机制。
/// schema 定义位于 packages/core/src/db/schema.ts（两端共享）。

/// 获取指定路径所在文件系统可用字节数（主键 INTEGER 迁移预检用，
/// 避免大规模重建期间磁盘写爆）。跨平台基于 fs2::free_space。
#[tauri::command]
fn disk_free_bytes(path: String) -> Result<u64, String> {
    fs2::free_space(&path).map_err(|e| e.to_string())
}

/// 递归统计目录占用字节（资源监控浮窗「存储」指标）。
/// 单项元信息读取失败跳过该条目，目录不可读返回 0，累加用 saturating 防溢出。
fn dir_size_bytes(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    for entry in entries.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let bytes = if meta.is_dir() {
            dir_size_bytes(&entry.path())
        } else if meta.is_file() {
            meta.len()
        } else {
            0
        };
        total = total.saturating_add(bytes);
    }
    total
}

/// App 数据目录总占用字节（数据库、窗口状态等）。语义对应移动端「App 沙盒根目录占用」。
#[tauri::command]
fn app_storage_bytes(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir_size_bytes(&dir))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(init_http())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // 窗口以 visible:false 创建，恢复几何后再显示，避免尺寸跳变
            window_state::apply_on_startup(app.handle());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                window_state::save_on_close(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            video_fetch::video_fetch,
            video_fetch::prewarm,
            video_fetch::log_line,
            window_state::get_window_state,
            window_state::set_window_remember,
            pip_window::style_pip_window,
            pip_window::animate_pip_appear,
            pip_window::show_pip,
            disk_free_bytes,
            app_storage_bytes
        ]);

    #[cfg(desktop)]
    let app = app.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    app
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
