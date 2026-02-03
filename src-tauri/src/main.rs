// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use font_kit::source::SystemSource;
use hex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    http::Response,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipArchive;

// App state for portable mode paths
struct AppState {
    #[allow(dead_code)]
    data_path: PathBuf,
    images_path: PathBuf,
}

static SHORTCUT_HELD: AtomicBool = AtomicBool::new(false);

// Settings structure matching electron-store schema
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub auto_launch: bool,
    pub always_on_top: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_launch: false,
            always_on_top: false,
        }
    }
}

// Window bounds structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowBounds {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
}

impl Default for WindowBounds {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            width: 800,
            height: 600,
        }
    }
}

// Backup settings structure
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    pub backup_directory: Option<String>,
    pub max_backups: u32,
    pub auto_backup_enabled: bool,
    pub auto_backup_interval: u32,
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            backup_directory: get_default_backup_directory(),
            max_backups: 5,
            auto_backup_enabled: false,
            auto_backup_interval: 30,
        }
    }
}

// Backup info for listing backups
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub filename: String,
    pub created_at: i64,
    pub size: u64,
}

// Path validation result
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathValidationResult {
    pub is_valid: bool,
    pub exists: bool,
    pub is_writable: bool,
    pub error_code: Option<String>,
}

// Update check structures
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
}

// GitHub API Release Response (只需要部分字段)
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: String,
}

// Compare versions (遵循 semver)
fn compare_versions(current: &str, latest: &str) -> bool {
    let current_parts: Vec<u32> = current
        .trim_start_matches('v')
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();

    let latest_parts: Vec<u32> = latest
        .trim_start_matches('v')
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();

    for i in 0..3 {
        let c = current_parts.get(i).unwrap_or(&0);
        let l = latest_parts.get(i).unwrap_or(&0);
        if l > c {
            return true;
        } else if l < c {
            return false;
        }
    }
    false
}

// Get default backup directory (Documents/LitePad/Backups)
fn get_default_backup_directory() -> Option<String> {
    dirs::document_dir().map(|p| {
        p.join("LitePad")
            .join("Backups")
            .to_string_lossy()
            .to_string()
    })
}

const MIN_WINDOW_WIDTH: u32 = 400;
const MIN_WINDOW_HEIGHT: u32 = 300;

fn rect_intersects_monitor(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    monitor: &tauri::Monitor,
) -> bool {
    let pos = monitor.position();
    let size = monitor.size();
    let mx1 = pos.x;
    let my1 = pos.y;
    let mx2 = mx1 + size.width as i32;
    let my2 = my1 + size.height as i32;
    let x2 = x + width as i32;
    let y2 = y + height as i32;

    x < mx2 && x2 > mx1 && y < my2 && y2 > my1
}

fn ensure_window_on_screen(window: &WebviewWindow) -> bool {
    let position = window.outer_position().ok();
    let size = window.outer_size().ok();
    let monitors = window.available_monitors().unwrap_or_default();

    if let (Some(pos), Some(size)) = (position, size) {
        if monitors
            .iter()
            .any(|m| rect_intersects_monitor(pos.x, pos.y, size.width, size.height, m))
        {
            return false;
        }
    }

    let _ = window.center();
    true
}

// Get portable data path (next to executable)
fn get_portable_data_path() -> PathBuf {
    let exe_path = std::env::current_exe().expect("Failed to get executable path");
    let exe_dir = exe_path
        .parent()
        .expect("Failed to get executable directory");
    exe_dir.join("data")
}

// Toggle window visibility
// Strategy: if window is visible (and not minimized), hide it; otherwise show and focus it
fn toggle_window(app: &AppHandle) {
    let window = app.get_webview_window("main");

    if let Some(window) = window {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_minimized = window.is_minimized().unwrap_or(false);

        if is_visible && !is_minimized {
            // 窗口可见，隐藏它
            let _ = window.hide();
        } else {
            // 窗口不可见/最小化，显示并聚焦
            ensure_window_on_screen(&window);
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            // Re-apply always on top after show
            if let Ok(store) = app.store("config.json") {
                if let Some(settings) = store.get("settings") {
                    if let Ok(s) = serde_json::from_value::<Settings>(settings) {
                        if s.always_on_top {
                            let _ = window.set_always_on_top(true);
                        }
                    }
                }
            }
        }
    }
}

// Commands exposed to frontend

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;

    if let Some(value) = store.get("settings") {
        serde_json::from_value(value).map_err(|e| e.to_string())
    } else {
        Ok(Settings::default())
    }
}

#[tauri::command]
async fn set_auto_launch(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }

    // Save to store
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let mut settings: Settings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    settings.auto_launch = enabled;
    store.set("settings", serde_json::to_value(&settings).unwrap());
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }

    // Save to store
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let mut settings: Settings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    settings.always_on_top = enabled;
    store.set("settings", serde_json::to_value(&settings).unwrap());
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut fonts: Vec<String> = source
        .all_families()
        .unwrap_or_default()
        .into_iter()
        .filter(|name| !name.starts_with('.') && !name.starts_with('@'))
        .collect();
    fonts.sort();
    fonts.dedup();

    // Fallback if empty
    if fonts.is_empty() {
        fonts = vec![
            "SimSun".to_string(),
            "Microsoft YaHei".to_string(),
            "SimHei".to_string(),
            "KaiTi".to_string(),
            "FangSong".to_string(),
            "Consolas".to_string(),
            "Segoe UI".to_string(),
        ];
    }

    fonts
}

// 图片保存结果，包含 hash 和 URL
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageResult {
    pub hash: String,
    pub url: String,
    pub size: usize,
    pub ext: String,
}

#[tauri::command]
async fn save_image(
    state: State<'_, Mutex<AppState>>,
    buffer: Vec<u8>,
    ext: String,
) -> Result<SaveImageResult, String> {
    // 计算 SHA-256 hash
    let mut hasher = Sha256::new();
    hasher.update(&buffer);
    let hash = hex::encode(hasher.finalize());

    let state = state.lock().unwrap();
    // 使用 hash 作为文件名（去重）
    let filename = format!("{}{}", hash, ext);
    let file_path = state.images_path.join(&filename);

    // 如果文件已存在（相同 hash），直接返回，不重复写入
    if !file_path.exists() {
        fs::write(&file_path, &buffer).map_err(|e| e.to_string())?;
    }

    // 返回 litepad:// 协议 URL
    Ok(SaveImageResult {
        hash: hash.clone(),
        url: format!("litepad://images/{}{}", hash, ext),
        size: buffer.len(),
        ext: ext.clone(),
    })
}

// 根据 hash 获取图片路径（用于 litepad:// 协议）
#[tauri::command]
fn get_image_path(state: State<'_, Mutex<AppState>>, hash: String, ext: String) -> Result<String, String> {
    let state = state.lock().unwrap();
    let filename = format!("{}{}", hash, ext);
    let file_path = state.images_path.join(&filename);

    if file_path.exists() {
        Ok(file_path.to_string_lossy().to_string())
    } else {
        Err(format!("Image not found: {}", filename))
    }
}

// 检查图片是否存在
#[tauri::command]
fn has_image(state: State<'_, Mutex<AppState>>, hash: String, ext: String) -> bool {
    let state = state.lock().unwrap();
    let filename = format!("{}{}", hash, ext);
    let file_path = state.images_path.join(&filename);
    file_path.exists()
}

// 保存从服务器下载的图片
#[tauri::command]
async fn save_downloaded_image(
    state: State<'_, Mutex<AppState>>,
    hash: String,
    ext: String,
    buffer: Vec<u8>,
) -> Result<String, String> {
    let state = state.lock().unwrap();
    let filename = format!("{}{}", hash, ext);
    let file_path = state.images_path.join(&filename);

    // 验证 hash
    let mut hasher = Sha256::new();
    hasher.update(&buffer);
    let computed_hash = hex::encode(hasher.finalize());

    if computed_hash != hash {
        return Err(format!(
            "Hash mismatch: expected {}, got {}",
            hash, computed_hash
        ));
    }

    fs::write(&file_path, &buffer).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

// 读取本地图片文件（用于上传到服务器）
#[tauri::command]
fn read_image(state: State<'_, Mutex<AppState>>, hash: String, ext: String) -> Result<Vec<u8>, String> {
    let state = state.lock().unwrap();
    let filename = format!("{}{}", hash, ext);
    let file_path = state.images_path.join(&filename);

    fs::read(&file_path).map_err(|e| e.to_string())
}

// 迁移结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateImageResult {
    pub hash: String,
    pub ext: String,
    pub size: usize,
    pub new_url: String,
}

// 迁移旧格式图片到新的 hash-based 格式
#[tauri::command]
fn migrate_old_image(
    state: State<'_, Mutex<AppState>>,
    old_path: String,
) -> Result<MigrateImageResult, String> {
    // 尝试读取旧文件
    let old_path = old_path.replace('/', "\\").replace("\\\\", "\\");
    let old_file = std::path::Path::new(&old_path);

    if !old_file.exists() {
        return Err(format!("文件不存在: {}", old_path));
    }

    // 读取文件内容
    let buffer = fs::read(old_file).map_err(|e| format!("读取文件失败: {}", e))?;

    // 计算 hash
    let mut hasher = Sha256::new();
    hasher.update(&buffer);
    let hash = hex::encode(hasher.finalize());

    // 获取扩展名
    let ext = old_file
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_else(|| ".png".to_string());

    let state = state.lock().unwrap();
    let new_filename = format!("{}{}", hash, ext);
    let new_path = state.images_path.join(&new_filename);

    // 如果新文件不存在，复制过去
    if !new_path.exists() {
        fs::write(&new_path, &buffer).map_err(|e| format!("写入文件失败: {}", e))?;
    }

    Ok(MigrateImageResult {
        hash: hash.clone(),
        ext: ext.clone(),
        size: buffer.len(),
        new_url: format!("litepad://images/{}{}", hash, ext),
    })
}

// 批量检查旧图片是否存在
#[tauri::command]
fn check_old_images_exist(paths: Vec<String>) -> Vec<bool> {
    paths
        .iter()
        .map(|p| {
            let path = p.replace('/', "\\").replace("\\\\", "\\");
            std::path::Path::new(&path).exists()
        })
        .collect()
}

#[tauri::command]
fn minimize_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn maximize_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn close_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

// Check if path is inside installation directory
fn is_inside_install_dir(path: &std::path::Path) -> bool {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            return path.starts_with(exe_dir);
        }
    }
    false
}

// Select backup directory with installation directory check
#[tauri::command]
async fn select_backup_directory(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app.dialog().file().blocking_pick_folder();

    match folder {
        Some(file_path) => {
            let path_buf = file_path.into_path().map_err(|e| e.to_string())?;
            if is_inside_install_dir(&path_buf) {
                Err("Cannot select installation directory as backup location".to_string())
            } else {
                Ok(Some(path_buf.to_string_lossy().to_string()))
            }
        }
        None => Ok(None),
    }
}

// Get backup settings
#[tauri::command]
async fn get_backup_settings(app: AppHandle) -> Result<BackupSettings, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    if let Some(value) = store.get("backupSettings") {
        serde_json::from_value(value).map_err(|e| e.to_string())
    } else {
        Ok(BackupSettings::default())
    }
}

// Save backup settings
#[tauri::command]
async fn set_backup_settings(app: AppHandle, settings: BackupSettings) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.set("backupSettings", serde_json::to_value(&settings).unwrap());
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// Clean up old backups
fn cleanup_old_backups(backup_dir: &str, max_backups: u32) -> Result<(), String> {
    let mut backups: Vec<_> = fs::read_dir(backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.starts_with("litepad_backup_") && name.ends_with(".zip")
        })
        .collect();

    // Sort by filename descending (newest first)
    backups.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    // Delete excess backups
    for backup in backups.iter().skip(max_backups as usize) {
        let _ = fs::remove_file(backup.path());
    }

    Ok(())
}

// Perform backup
#[tauri::command]
async fn perform_backup(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
    data: String,
) -> Result<String, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let settings: BackupSettings = store
        .get("backupSettings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let backup_dir = settings
        .backup_directory
        .ok_or("Backup directory not configured")?;
    let backup_path = std::path::Path::new(&backup_dir);

    if !backup_path.exists() {
        fs::create_dir_all(backup_path).map_err(|e| e.to_string())?;
    }

    // Generate filename with timestamp
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("litepad_backup_{}.zip", timestamp);
    let zip_path = backup_path.join(&filename);

    // Get images path
    let images_path = {
        let state = state.lock().unwrap();
        state.images_path.clone()
    };

    // Create ZIP file
    let file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Add data.json
    zip.start_file("data.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(data.as_bytes()).map_err(|e| e.to_string())?;

    // Add images directory
    if images_path.exists() {
        for entry in WalkDir::new(&images_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                if let Ok(relative) = path.strip_prefix(&images_path) {
                    let zip_path_str =
                        format!("images/{}", relative.to_string_lossy().replace('\\', "/"));

                    zip.start_file(&zip_path_str, options)
                        .map_err(|e| e.to_string())?;
                    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
                    let mut buffer = Vec::new();
                    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
                    zip.write_all(&buffer).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;

    // Clean up old backups
    cleanup_old_backups(&backup_dir, settings.max_backups)?;

    Ok(filename)
}

// Get backup list
#[tauri::command]
async fn get_backup_list(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let settings: BackupSettings = store
        .get("backupSettings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let backup_dir = match settings.backup_directory {
        Some(dir) => dir,
        None => return Ok(vec![]),
    };

    let backup_path = std::path::Path::new(&backup_dir);
    if !backup_path.exists() {
        return Ok(vec![]);
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(&backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let filename = entry.file_name().to_string_lossy().to_string();

        if filename.starts_with("litepad_backup_") && filename.ends_with(".zip") {
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let created_at = metadata
                .created()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64)
                .unwrap_or(0);

            backups.push(BackupInfo {
                filename,
                created_at,
                size: metadata.len(),
            });
        }
    }

    // Sort by created_at descending
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}

// Restore backup
#[tauri::command]
async fn restore_backup(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
    filename: String,
) -> Result<String, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let settings: BackupSettings = store
        .get("backupSettings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let backup_dir = settings
        .backup_directory
        .ok_or("Backup directory not configured")?;
    let zip_path = std::path::Path::new(&backup_dir).join(&filename);

    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Extract data.json
    let mut data_json = String::new();
    {
        let mut data_file = archive.by_name("data.json").map_err(|e| e.to_string())?;
        data_file
            .read_to_string(&mut data_json)
            .map_err(|e| e.to_string())?;
    }

    // Extract images
    let images_path = {
        let state = state.lock().unwrap();
        state.images_path.clone()
    };

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        if name.starts_with("images/") && !name.ends_with('/') {
            if let Some(relative) = name.strip_prefix("images/") {
                let dest_path = images_path.join(relative);

                if let Some(parent) = dest_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                let mut dest_file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut dest_file).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(data_json)
}

// Delete backup
#[tauri::command]
async fn delete_backup(app: AppHandle, filename: String) -> Result<(), String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let settings: BackupSettings = store
        .get("backupSettings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let backup_dir = settings
        .backup_directory
        .ok_or("Backup directory not configured")?;
    let file_path = std::path::Path::new(&backup_dir).join(&filename);

    fs::remove_file(file_path).map_err(|e| e.to_string())?;
    Ok(())
}

// Get default backup directory
#[tauri::command]
fn get_default_backup_dir() -> Option<String> {
    get_default_backup_directory()
}

// Validate backup path
#[tauri::command]
fn validate_backup_path(path: String) -> PathValidationResult {
    let path = std::path::Path::new(&path);

    // Check if path exists
    let exists = path.exists();

    // Check if writable
    let is_writable = if exists {
        // Try to create a test file
        let test_file = path.join(".litepad_write_test");
        match fs::File::create(&test_file) {
            Ok(_) => {
                let _ = fs::remove_file(&test_file);
                true
            }
            Err(_) => false,
        }
    } else {
        // Path doesn't exist, check if parent directory exists and is writable
        if let Some(parent) = path.parent() {
            if parent.exists() {
                let test_file = parent.join(".litepad_write_test");
                match fs::File::create(&test_file) {
                    Ok(_) => {
                        let _ = fs::remove_file(&test_file);
                        true
                    }
                    Err(_) => false,
                }
            } else {
                false
            }
        } else {
            false
        }
    };

    let (is_valid, error_code) = match (exists, is_writable) {
        (true, true) => (true, None),
        (true, false) => (false, Some("NO_WRITE_PERMISSION".to_string())),
        (false, true) => (true, None), // Can be created
        (false, false) => (false, Some("PATH_NOT_ACCESSIBLE".to_string())),
    };

    PathValidationResult {
        is_valid,
        exists,
        is_writable,
        error_code,
    }
}

// Check for updates
#[tauri::command]
async fn check_for_updates() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION");

    // GitHub API URL (使用官方 REST API v3)
    let url = "https://api.github.com/repos/L0dyv/LitePad/releases/latest";

    // 创建 HTTP 客户端
    let client = reqwest::blocking::Client::builder()
        .user_agent("LitePad-Update-Checker")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // 发送请求
    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("Network error: {}", e))?;

    // 检查响应状态
    if !response.status().is_success() {
        return Err(format!("GitHub API error: {}", response.status()));
    }

    // 解析 JSON
    let release: GitHubRelease = response
        .json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // 比较版本
    let has_update = compare_versions(current_version, &release.tag_name);

    Ok(UpdateInfo {
        has_update,
        current_version: current_version.to_string(),
        latest_version: Some(release.tag_name),
        release_url: Some(release.html_url),
        release_notes: release.body,
        published_at: Some(release.published_at),
    })
}

fn main() {
    // Setup portable data path
    let data_path = get_portable_data_path();
    let images_path = data_path.join("images");

    // Ensure directories exist
    fs::create_dir_all(&data_path).expect("Failed to create data directory");
    fs::create_dir_all(&images_path).expect("Failed to create images directory");

    let app_state = AppState {
        data_path: data_path.clone(),
        images_path,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When second instance is launched, show and focus existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        // 注册 litepad:// 协议处理器
        .register_uri_scheme_protocol("litepad", move |_ctx, request| {
            let uri = request.uri();
            let path = uri.path();

            // 解析路径：/images/{hash}{ext}
            if path.starts_with("/images/") {
                let filename = &path[8..]; // 去掉 "/images/" 前缀

                // 从可执行文件路径获取 images 目录
                let exe_path = std::env::current_exe().expect("Failed to get executable path");
                let exe_dir = exe_path.parent().expect("Failed to get executable directory");
                let images_path = exe_dir.join("data").join("images");
                let file_path = images_path.join(filename);

                if file_path.exists() {
                    match std::fs::read(&file_path) {
                        Ok(content) => {
                            // 根据扩展名设置 MIME 类型
                            let ext = file_path
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("png");
                            let mime_type = match ext {
                                "png" => "image/png",
                                "jpg" | "jpeg" => "image/jpeg",
                                "gif" => "image/gif",
                                "webp" => "image/webp",
                                "svg" => "image/svg+xml",
                                "bmp" => "image/bmp",
                                _ => "application/octet-stream",
                            };

                            return Response::builder()
                                .status(200)
                                .header("Content-Type", mime_type)
                                .header("Cache-Control", "max-age=31536000, immutable")
                                .body(content)
                                .expect("Failed to build response");
                        }
                        Err(_) => {
                            return Response::builder()
                                .status(500)
                                .body(Vec::new())
                                .expect("Failed to build error response");
                        }
                    }
                }
            }

            // 404 Not Found
            Response::builder()
                .status(404)
                .body(Vec::new())
                .expect("Failed to build 404 response")
        })
        .manage(Mutex::new(app_state))
        .invoke_handler(tauri::generate_handler![
            get_version,
            get_settings,
            set_auto_launch,
            set_always_on_top,
            get_system_fonts,
            save_image,
            get_image_path,
            has_image,
            save_downloaded_image,
            read_image,
            migrate_old_image,
            check_old_images_exist,
            minimize_window,
            maximize_window,
            close_window,
            select_backup_directory,
            get_backup_settings,
            set_backup_settings,
            perform_backup,
            get_backup_list,
            restore_backup,
            delete_backup,
            get_default_backup_dir,
            validate_backup_path,
            check_for_updates,
        ])
        .setup(|app| {
            // Get window and configure
            let window = app.get_webview_window("main").unwrap();

            // Load saved window bounds
            if let Ok(store) = app.store("config.json") {
                if let Some(bounds_value) = store.get("windowBounds") {
                    if let Ok(bounds) = serde_json::from_value::<WindowBounds>(bounds_value) {
                        let mut width = bounds.width.max(MIN_WINDOW_WIDTH);
                        let mut height = bounds.height.max(MIN_WINDOW_HEIGHT);
                        let mut pos = bounds.x.zip(bounds.y);

                        if let Ok(Some(monitor)) = window.primary_monitor() {
                            let monitor_pos = monitor.position();
                            let monitor_size = monitor.size();
                            width = width.min(monitor_size.width);
                            height = height.min(monitor_size.height);

                            if let Some((x, y)) = pos {
                                let max_x = monitor_pos.x + monitor_size.width as i32 - width as i32;
                                let max_y = monitor_pos.y + monitor_size.height as i32 - height as i32;
                                let clamped_x = x.clamp(monitor_pos.x, max_x);
                                let clamped_y = y.clamp(monitor_pos.y, max_y);
                                pos = Some((clamped_x, clamped_y));
                            }
                        }

                        let _ = window.set_size(PhysicalSize::new(width, height));
                        if let Some((x, y)) = pos {
                            let _ = window.set_position(PhysicalPosition::new(x, y));
                        }
                    }
                }

                // Apply always on top setting
                if let Some(settings_value) = store.get("settings") {
                    if let Ok(settings) = serde_json::from_value::<Settings>(settings_value) {
                        if settings.always_on_top {
                            let _ = window.set_always_on_top(true);
                        }
                    }
                }
            }

            // Setup tray
            let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide (Alt+X)", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("LitePad - Alt+X to toggle")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show_hide" => toggle_window(app),
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Register global shortcut Alt+X
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyX);
            let app_handle = app.handle().clone();
            let register_result = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                match event.state {
                    ShortcutState::Pressed => {
                        // 防止按住触发重复 Pressed；并避免 Pressed/Released 双触发导致“闪一下”
                        let was_held = SHORTCUT_HELD.swap(true, Ordering::Relaxed);
                        if was_held {
                            return;
                        }
                        toggle_window(&app_handle);
                    }
                    ShortcutState::Released => {
                        SHORTCUT_HELD.store(false, Ordering::Relaxed);
                    }
                }
            });

            if let Err(e) = register_result {
                eprintln!("Warning: Failed to register Alt+X shortcut: {}. Another application may be using it.", e);
            }

            // Save window bounds on resize/move
            let window_clone = window.clone();
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                match event {
                    WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                        if let Ok(store) = app_handle.store("config.json") {
                            if let (Ok(size), Ok(pos)) = (window_clone.outer_size(), window_clone.outer_position()) {
                                let bounds = WindowBounds {
                                    x: Some(pos.x),
                                    y: Some(pos.y),
                                    width: size.width,
                                    height: size.height,
                                };
                                store.set("windowBounds", serde_json::to_value(&bounds).unwrap());
                                let _ = store.save();
                            }
                        }
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        // Hide instead of close
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
