// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use font_kit::source::SystemSource;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

// App state for portable mode paths
struct AppState {
    #[allow(dead_code)]
    data_path: PathBuf,
    images_path: PathBuf,
}

static LAST_SHORTCUT_MS: AtomicU64 = AtomicU64::new(0);
const SHORTCUT_DEBOUNCE_MS: u64 = 300;

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
        if monitors.iter().any(|m| rect_intersects_monitor(pos.x, pos.y, size.width, size.height, m)) {
            return false;
        }
    }

    let _ = window.center();
    true
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Get portable data path (next to executable)
fn get_portable_data_path() -> PathBuf {
    let exe_path = std::env::current_exe().expect("Failed to get executable path");
    let exe_dir = exe_path.parent().expect("Failed to get executable directory");
    exe_dir.join("data")
}

// Toggle window visibility
// Strategy: if window has focus, hide it; otherwise show and focus it
fn toggle_window(app: &AppHandle) {
    let window = app.get_webview_window("main");

    if let Some(window) = window {
        // 检查窗口是否有焦点
        let has_focus = window.is_focused().unwrap_or(false);

        if has_focus {
            // 窗口有焦点，隐藏它
            let _ = window.hide();
        } else {
            // 窗口无焦点（隐藏/最小化/后台），显示并聚焦
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
    let mut settings: Settings = store.get("settings")
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
        window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    }

    // Save to store
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let mut settings: Settings = store.get("settings")
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

#[tauri::command]
async fn save_image(
    state: State<'_, Mutex<AppState>>,
    buffer: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    let state = state.lock().unwrap();
    let filename = format!("{}{}", Uuid::new_v4(), ext);
    let file_path = state.images_path.join(&filename);

    fs::write(&file_path, buffer).map_err(|e| e.to_string())?;

    // Return asset protocol URL
    Ok(format!("asset://localhost/{}", file_path.to_string_lossy().replace('\\', "/")))
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
        .manage(Mutex::new(app_state))
        .invoke_handler(tauri::generate_handler![
            get_version,
            get_settings,
            set_auto_launch,
            set_always_on_top,
            get_system_fonts,
            save_image,
            minimize_window,
            maximize_window,
            close_window,
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
            let register_result = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                let now_ms = now_ms();
                let last_ms = LAST_SHORTCUT_MS.load(Ordering::Relaxed);
                let delta_ms = now_ms.saturating_sub(last_ms);
                let accepted = delta_ms >= SHORTCUT_DEBOUNCE_MS;
                if !accepted {
                    return;
                }
                LAST_SHORTCUT_MS.store(now_ms, Ordering::Relaxed);
                toggle_window(&app_handle);
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
