// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use font_kit::source::SystemSource;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    AppHandle, Manager, State,
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

// Get portable data path (next to executable)
fn get_portable_data_path() -> PathBuf {
    let exe_path = std::env::current_exe().expect("Failed to get executable path");
    let exe_dir = exe_path.parent().expect("Failed to get executable directory");
    exe_dir.join("data")
}

// Toggle window visibility with animation skip
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
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
                        let _ = window.set_size(tauri::LogicalSize::new(bounds.width, bounds.height));
                        if let (Some(x), Some(y)) = (bounds.x, bounds.y) {
                            let _ = window.set_position(tauri::LogicalPosition::new(x, y));
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
            if let Err(e) = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                toggle_window(&app_handle);
            }) {
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
