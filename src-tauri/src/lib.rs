pub mod browser_bridge;
pub mod clipboard;
pub mod commands;
pub mod drag_drop;
pub mod keyboard;
pub mod lifecycle;
pub mod preferences;
pub mod screen_capture;
pub mod sound;
pub mod storage;
pub mod window;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use directories::ProjectDirs;
use parking_lot::RwLock;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use clipboard::ClipboardListener;
use commands::reposition_sidebar_to_active_display;
use drag_drop::DragDropStager;
use storage::{ClipType, Database};

pub struct AppState {
    pub data_dir: PathBuf,
    pub editor_expanded: Arc<AtomicBool>,
    pub pad_unread: std::sync::atomic::AtomicUsize,
    pub image_arrivals: Arc<parking_lot::Mutex<clipboard::arrival::ImageArrivals>>,
    pub db: Arc<Database>,
    pub stager: Arc<DragDropStager>,
    pub is_pinned: Arc<AtomicBool>,
    pub interaction_active: Arc<AtomicBool>,
    pub native_drag_active: Arc<AtomicBool>,
    pub window_move_active: Arc<AtomicBool>,
    pub capture_paused: Arc<AtomicBool>,
    pub preferences: Arc<RwLock<preferences::Preferences>>,
    pub _listener: Arc<RwLock<Option<ClipboardListener>>>,
    pub single_keys: keyboard::Service,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if browser_bridge::is_host() {
        let _ = browser_bridge::run_host();
        return;
    }
    let _instance =
        match lifecycle::acquire_instance(std::env::args().any(|arg| arg == "--background")) {
            Ok(Some(guard)) => guard,
            Ok(None) => return,
            Err(error) => {
                eprintln!("{error}");
                return;
            }
        };
    let data_dir = if cfg!(debug_assertions) {
        std::env::var_os("OMNICOPY_DATA_DIR").map(PathBuf::from)
    } else {
        None
    }
    .unwrap_or_else(|| {
        ProjectDirs::from("com", "omnicopy", "OmniCopy")
            .map(|dirs| dirs.data_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("data"))
    });

    let _ = std::fs::create_dir_all(&data_dir);
    let db_path = data_dir.join("clips.db");
    let blob_dir = data_dir.join("blobs");

    let db =
        Arc::new(Database::new(&db_path, &blob_dir).expect("Failed to initialize SQLite database"));
    let mut preferences = match db.load_preferences() {
        Ok(preferences) => {
            let _ = db.prune_old_trash(i64::from(preferences.trash_retention_days));
            preferences
        }
        Err(error) => {
            eprintln!(
                "Preferences could not be read; preserving Trash and using defaults: {error}"
            );
            Default::default()
        }
    };
    if !preferences.single_key_resume {
        preferences.single_key_enabled = false;
    }
    let capture_paused = Arc::new(AtomicBool::new(preferences.capture_paused));
    let stager = Arc::new(DragDropStager::new(data_dir.join("drops")));
    stager.cleanup_old_sessions();
    let is_pinned = Arc::new(AtomicBool::new(false));
    let interaction_active = Arc::new(AtomicBool::new(false));
    let native_drag_active = Arc::new(AtomicBool::new(false));
    let busy_on_blur = interaction_active.clone();
    let drag_on_blur = native_drag_active.clone();
    let listener_holder = Arc::new(RwLock::new(None));

    let image_arrivals = Arc::new(parking_lot::Mutex::new(
        clipboard::arrival::ImageArrivals::default(),
    ));
    let arrivals_for_worker = image_arrivals.clone();
    let db_for_listener = db.clone();
    let app_handle_holder = Arc::new(RwLock::new(None::<AppHandle>));
    let app_handle_for_listener = app_handle_holder.clone();
    let app_handle_for_hotkey = app_handle_holder.clone();
    let (capture_sender, capture_receiver) =
        std::sync::mpsc::sync_channel::<(clipboard::ClipboardItem, window::MonitorBounds)>(8);
    let pending_bytes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let bytes_for_worker = pending_bytes.clone();
    let app_for_queue_errors = app_handle_holder.clone();

    // Snapshot clipboard events promptly; encoding and SQLite work live on an
    // event-driven worker with a strict 64 MB pending payload budget.
    std::thread::spawn(move || {
        let arrivals = arrivals_for_worker;
        // Seed fingerprints only: restoring recent history after restart stays quiet.
        if let Ok(clips) = db_for_listener.query_clips(&storage::ClipFilter {
            clip_type: Some("image".into()),
            limit: Some(64),
            ..Default::default()
        }) {
            for clip in clips.iter().rev() {
                arrivals.lock().should_notify(&clip.hash, None);
            }
        }
        while let Ok((item, monitor)) = capture_receiver.recv() {
            let weight = item.pdf.as_ref().map_or(0, |pdf| pdf.len())
                + item.text.as_ref().map_or(0, |text| text.len())
                + item.image_png.as_ref().map_or(0, |image| image.len());
            let inserted = if let Some(pdf) = item.pdf {
                db_for_listener.insert_pdf(
                    &pdf,
                    item.image_png.as_deref(),
                    item.source_app.as_deref(),
                    item.source_title.as_deref(),
                )
            } else if let Some(text) = item.text {
                let candidate = text.trim();
                let clip_type = if (candidate.starts_with("http://")
                    || candidate.starts_with("https://"))
                    && !candidate.chars().any(char::is_whitespace)
                {
                    ClipType::Link
                } else if text.contains('{') && text.contains('}')
                    || text.contains("fn ")
                    || text.contains("const ")
                {
                    ClipType::Code
                } else {
                    ClipType::Text
                };

                db_for_listener.insert_text(
                    &text,
                    clip_type,
                    item.source_app.as_deref(),
                    item.source_title.as_deref(),
                )
            } else if let Some(image_bytes) = item.image_png {
                db_for_listener.insert_image(
                    &image_bytes,
                    item.source_app.as_deref(),
                    item.source_title.as_deref(),
                )
            } else {
                bytes_for_worker.fetch_sub(weight, Ordering::Relaxed);
                continue;
            };
            bytes_for_worker.fetch_sub(weight, Ordering::Relaxed);
            if let Some(app) = app_handle_for_listener.read().as_ref() {
                match inserted {
                    Ok(mut clip) => {
                        if let Some(text) = clip.text_content.as_mut() {
                            *text = text.chars().take(4096).collect();
                        }
                        if matches!(clip.clip_type, ClipType::Image | ClipType::File)
                            && arrivals
                                .lock()
                                .should_notify(&clip.hash, clip.source_app.as_deref())
                        {
                            let app2 = app.clone();
                            let arrival = clip.clone();
                            let _ = app.run_on_main_thread(move || {
                                window::image_arrived(&app2, &arrival, monitor)
                            });
                        }
                        let _ = app.emit("new-clip", clip);
                    }
                    Err(error) => {
                        let _ = app.emit("capture-error", serde_json::json!({"message": format!("Clipboard capture could not be saved: {}", error)}));
                    }
                }
            }
        }
    });
    let listener = ClipboardListener::start(
        move |item, cursor| {
            let weight = item.pdf.as_ref().map_or(0, |pdf| pdf.len())
                + item.text.as_ref().map_or(0, |text| text.len())
                + item.image_png.as_ref().map_or(0, |image| image.len());
            let reserved = pending_bytes
                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |used| {
                    used.checked_add(weight)
                        .filter(|total| *total <= 64 * 1024 * 1024)
                })
                .is_ok();
            let monitor = window::monitor_work_area_at(cursor);
            let queued = reserved && capture_sender.try_send((item, monitor)).is_ok();
            if !queued {
                if reserved {
                    pending_bytes.fetch_sub(weight, Ordering::Relaxed);
                }
                if let Some(app) = app_for_queue_errors.read().as_ref() {
                    let _ = app.emit("capture-error", serde_json::json!({"message": "Clipboard capture queue is full. Copy the item again after saving finishes."}));
                }
            }
        },
        move |action| {
            // Global hotkey toggles OmniCopy sidebar from anywhere in Windows
            if let Some(app) = app_handle_for_hotkey.read().as_ref() {
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if action == 0 {
                        window::recover_after_resume(&app2);
                    } else if action == 4 {
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = screen_capture::capture_monitor(app2.clone()).await
                            {
                                let _ = app2
                                    .emit("capture-error", serde_json::json!({"message":error}));
                            }
                        });
                    } else if action == 1 {
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = commands::capture_screen(app2.clone()).await {
                                let _ = app2
                                    .emit("capture-error", serde_json::json!({"message":error}));
                            }
                        });
                    } else if let Some(window) = app2.get_webview_window("main") {
                        commands::toggle_window_visibility(&window);
                    }
                });
            }
        },
        capture_paused.clone(),
        preferences.snip_shortcut.clone(),
        preferences.history_shortcut.clone(),
        preferences.quick_capture_shortcut.clone(),
    );

    *listener_holder.write() = Some(listener);

    let app_for_keys = app_handle_holder.clone();
    let single_keys = keyboard::Service::start(move |action| {
        if let Some(app) = app_for_keys.read().as_ref() {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let result = match action {
                    keyboard::Action::Snip => commands::capture_screen(app.clone()).await,
                    keyboard::Action::Snapshot => {
                        screen_capture::capture_monitor(app.clone()).await
                    }
                    keyboard::Action::History => {
                        let app2 = app.clone();
                        app.run_on_main_thread(move || {
                            if let Some(window) = app2.get_webview_window("main") {
                                commands::toggle_window_visibility(&window);
                            }
                        })
                        .map_err(|e| e.to_string())
                    }
                    action => browser_bridge::request(action),
                };
                if let Err(message) = result {
                    let _ = app.emit("capture-error", serde_json::json!({"message":message}));
                }
            });
        }
    })
    .expect("Keyboard service unavailable");
    if let Err(error) = single_keys.apply(
        preferences.single_key_enabled,
        &preferences.single_key_bindings,
    ) {
        preferences.single_key_enabled = false;
        eprintln!("Single-key mode is disarmed: {error}");
    }

    let state = AppState {
        single_keys,
        data_dir,
        editor_expanded: Arc::new(AtomicBool::new(false)),
        pad_unread: std::sync::atomic::AtomicUsize::new(0),
        image_arrivals,
        db,
        stager,
        is_pinned: is_pinned.clone(),
        interaction_active,
        native_drag_active,
        window_move_active: Arc::new(AtomicBool::new(false)),
        capture_paused,
        preferences: Arc::new(RwLock::new(preferences)),
        _listener: listener_holder,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            if let Err(message) = browser_bridge::start() {
                let _ = app_handle.emit("capture-error", serde_json::json!({"message":message}));
            }
            window::pad_timer::initialize(app_handle.clone());
            if app.state::<AppState>().preferences.read().start_at_login {
                let _ = preferences::set_start_at_login(true);
            }
            *app_handle_holder.write() = Some(app_handle.clone());

            // Create System Tray Menu
            let toggle_item = MenuItem::with_id(app, "toggle", "Show history", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit SnipyNest", true, None::<&str>)?;
            let snip_item = MenuItem::with_id(app, "snip", "Screen snip", true, None::<&str>)?;
            let pad_item = MenuItem::with_id(app, "pad", "Show Capture Pad", true, None::<&str>)?;
            let reset_item =
                MenuItem::with_id(app, "reset-pad", "Reset Pad position", true, None::<&str>)?;
            let disarm_item = MenuItem::with_id(
                app,
                "disarm-keys",
                "Disable single-key mode",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(
                app,
                &[
                    &toggle_item,
                    &snip_item,
                    &pad_item,
                    &reset_item,
                    &disarm_item,
                    &quit_item,
                ],
            )?;

            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _tray = tray_builder
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            commands::toggle_window_visibility(&window);
                        }
                    }
                    "snip" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = commands::capture_screen(app.clone()).await {
                                let _ =
                                    app.emit("capture-error", serde_json::json!({"message":error}));
                            }
                        });
                    }
                    "pad" => {
                        let _ = window::show_capture_pad(app.clone());
                    }
                    "reset-pad" => {
                        let _ = window::reset_capture_pad(app.clone());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    "disarm-keys" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            let _ = keyboard::disarm(app);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } => {
                        if button == tauri::tray::MouseButton::Left
                            && button_state == tauri::tray::MouseButtonState::Up
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                commands::toggle_window_visibility(&window);
                            }
                        }
                    }
                    TrayIconEvent::DoubleClick { button, .. } => {
                        if button == tauri::tray::MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if !app
                                    .state::<AppState>()
                                    .editor_expanded
                                    .load(Ordering::Relaxed)
                                {
                                    commands::reposition_sidebar_to_active_display(&window);
                                }
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Configure Main Window
            if let Some(window) = app.get_webview_window("main") {
                reposition_sidebar_to_active_display(&window);
                #[cfg(windows)]
                if let Ok(hwnd) = window.hwnd() {
                    let raw_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
                    unsafe {
                        use windows_sys::Win32::UI::WindowsAndMessaging::{
                            GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_APPWINDOW,
                            WS_EX_TOOLWINDOW,
                        };
                        let style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
                        let new_style =
                            (style | (WS_EX_TOOLWINDOW as isize)) & !(WS_EX_APPWINDOW as isize);
                        SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, new_style);
                    }
                }
                if !std::env::args().any(|arg| arg == "--background") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            let _ = window::ensure_pad(app.handle());
            if app.state::<AppState>().preferences.read().pad_mode == "always" {
                let _ = window::show_capture_pad(app.handle().clone());
            }
            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() == "capture-pad" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window::hide_pad_native(window.app_handle());
                }
                return;
            }
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window
                    .state::<AppState>()
                    .interaction_active
                    .load(Ordering::Relaxed)
                {
                    let _ = window.emit("editor-close-request", ());
                } else {
                    if let Some(webview) = window.app_handle().get_webview_window("main") {
                        let _ = commands::hide_history_window(&webview);
                    }
                    window::history_closed(window.app_handle());
                }
            }
            if let tauri::WindowEvent::Focused(focused) = event {
                // Peek Mode: auto-hide on blur if not pinned
                if !focused
                    && !window::has_native_focus(window)
                    && !window
                        .state::<AppState>()
                        .editor_expanded
                        .load(Ordering::Relaxed)
                    && !is_pinned.load(Ordering::Relaxed)
                    && !busy_on_blur.load(Ordering::Relaxed)
                    && !drag_on_blur.load(Ordering::Relaxed)
                    && !window
                        .state::<AppState>()
                        .window_move_active
                        .load(Ordering::Relaxed)
                {
                    if let Some(webview) = window.app_handle().get_webview_window("main") {
                        let _ = commands::hide_history_window(&webview);
                    }
                    window::history_closed(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            browser_bridge::browser_control_status,
            browser_bridge::install_browser_control,
            keyboard::disarm,
            commands::prepare_clip_batch,
            commands::trash_clip_batch,
            commands::undo_clip_batch,
            sound::preview_capture_sound,
            window::pad_timer::set_pad_interacting,
            window::move_utility_window,
            window::settle_capture_pad,
            window::show_capture_pad,
            window::reset_capture_pad,
            window::dismiss_capture_pad,
            window::open_from_pad,
            window::get_pad_unread,
            window::set_editor_mode,
            commands::get_shortcut_error,
            commands::get_interaction_status,
            commands::get_clips,
            commands::get_clip_preview,
            commands::get_clip_by_id,
            commands::get_clip_full_image,
            commands::get_clip_file_path,
            commands::toggle_clip_pin,
            commands::trash_clip,
            commands::restore_clip,
            commands::delete_clip_permanently,
            commands::empty_trash,
            commands::get_storage_stats,
            commands::copy_clip_to_clipboard,
            commands::copy_image_base64_to_clipboard,
            commands::save_annotated_image,
            commands::prepare_drag_drop,
            commands::export_clips,
            commands::toggle_sidebar,
            commands::set_sidebar_pinned,
            commands::get_sidebar_pinned,
            commands::hide_sidebar,
            commands::set_interaction_active,
            commands::start_native_drag,
            commands::export_clips_with_picker,
            commands::capture_screen,
            screen_capture::capture_monitor,
            commands::get_preferences,
            commands::update_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
