use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use crate::clipboard::win32::{set_clipboard_image, set_clipboard_text};
use crate::storage::{Clip, ClipFilter, ClipType, StorageStats};
use crate::window::get_active_monitor_sidebar_bounds;
use crate::AppState;

pub fn hide_history_window(window: &WebviewWindow) -> Result<(), String> {
    // Synchronize the framework state and also cover native reactivation paths.
    window.hide().map_err(|e| e.to_string())?;
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                hwnd.0 as _,
                windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE,
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn prepare_clip_batch(
    state: State<'_, AppState>,
    filter: Option<ClipFilter>,
    ids: Vec<String>,
    include_pinned: bool,
) -> Result<crate::storage::batch::ClipBatch, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.prepare_batch(filter, ids, include_pinned)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn trash_clip_batch(state: State<'_, AppState>, token: String) -> Result<usize, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.trash_batch(&token).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn undo_clip_batch(state: State<'_, AppState>, token: String) -> Result<usize, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.undo_batch(&token).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_clips(state: State<'_, AppState>, filter: ClipFilter) -> Result<Vec<Clip>, String> {
    state.db.query_clips(&filter).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_clip_preview(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let clip = db.get_clip(&id).map_err(|e| e.to_string())?;
        match clip.filter(|clip| clip.clip_type == ClipType::Image) {
            Some(clip) => db
                .get_blob_store()
                .preview(&clip.hash)
                .map(Some)
                .map_err(|e| e.to_string()),
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_clip_by_id(state: State<'_, AppState>, id: String) -> Result<Option<Clip>, String> {
    state.db.get_clip(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_clip_full_image(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(clip) = db.get_clip(&id).map_err(|e| e.to_string())? {
            if clip.clip_type == ClipType::Image {
                let path = db.get_blob_store().get_blob_path(&clip.hash);
                if path.exists() {
                    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
                    let b64 = BASE64.encode(&bytes);
                    return Ok(Some(format!("data:image/png;base64,{}", b64)));
                }
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_clip_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let clip = db
            .get_clip(&id)
            .map_err(|e| e.to_string())?
            .ok_or("Capture no longer exists")?;
        if clip.is_deleted || clip.clip_type != ClipType::File {
            return Err("Only an available PDF capture can be opened".into());
        }
        // Open an independent staged copy: PDF applications must never edit the original blob.
        let state = app.state::<AppState>();
        let paths = state
            .stager
            .prepare_drag_files(&db, &[id])
            .map_err(|e| e.to_string())?;
        app.opener()
            .open_path(paths[0].to_string_lossy().as_ref(), None::<&str>)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_clip_file_path(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, String> {
    if let Some(clip) = state.db.get_clip(&id).map_err(|e| e.to_string())? {
        if matches!(clip.clip_type, ClipType::Image | ClipType::File) {
            let path = if clip.clip_type == ClipType::File {
                state.db.get_blob_store().get_pdf_path(&clip.hash)
            } else {
                state.db.get_blob_store().get_blob_path(&clip.hash)
            };
            if path.exists() {
                return Ok(Some(path.to_string_lossy().to_string()));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn toggle_clip_pin(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.db.toggle_pin(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn trash_clip(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.move_to_trash(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_clip(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.restore_from_trash(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_clip_permanently(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_permanently(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> Result<usize, String> {
    state.db.empty_trash().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_storage_stats(state: State<'_, AppState>) -> Result<StorageStats, String> {
    state.db.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_clip_to_clipboard(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let db = state.db.clone();
    let stager = state.stager.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(clip) = db.get_clip(&id).map_err(|e| e.to_string())? {
            match clip.clip_type {
                ClipType::File => {
                    let paths = stager
                        .prepare_drag_files(&db, &[clip.id])
                        .map_err(|e| e.to_string())?;
                    return Ok(crate::clipboard::set_clipboard_file(
                        paths.first().ok_or("The PDF is missing")?,
                    ));
                }
                ClipType::Image => {
                    let path = db.get_blob_store().get_blob_path(&clip.hash);
                    if path.exists() {
                        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
                        return Ok(set_clipboard_image(&bytes));
                    }
                }
                _ => {
                    if let Some(text) = clip.text_content {
                        return Ok(set_clipboard_text(&text));
                    }
                }
            }
        }
        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_image_base64_to_clipboard(data_base64: String) -> Result<bool, String> {
    if data_base64.len() > crate::storage::blob::MAX_ENCODED_IMAGE_BYTES * 4 / 3 + 128 {
        return Err("Image payload exceeds the 64 MB limit".into());
    }
    let clean_b64 = if let Some(idx) = data_base64.find("base64,") {
        &data_base64[idx + 7..]
    } else {
        &data_base64
    };

    let bytes = BASE64.decode(clean_b64).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || set_clipboard_image(&bytes))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_annotated_image(
    app: AppHandle,
    state: State<'_, AppState>,
    data_base64: String,
    original_id: Option<String>,
) -> Result<Clip, String> {
    let db = state.db.clone();
    let clip = tauri::async_runtime::spawn_blocking(move || {
        let _ = original_id; // Saves a new clip; the original remains recoverable.
        if data_base64.len() > crate::storage::blob::MAX_ENCODED_IMAGE_BYTES * 4 / 3 + 128 {
            return Err("Image payload exceeds the 64 MB limit".into());
        }
        let clean_b64 = if let Some(idx) = data_base64.find("base64,") {
            &data_base64[idx + 7..]
        } else {
            &data_base64
        };

        let bytes = BASE64.decode(clean_b64).map_err(|e| e.to_string())?;
        db.insert_image(
            &bytes,
            Some("SnipyNest Annotator"),
            Some("Annotated Capture"),
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = app.emit("new-clip", &clip);
    Ok(clip)
}

#[tauri::command]
pub fn prepare_drag_drop(
    state: State<'_, AppState>,
    clip_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let paths = state
        .stager
        .prepare_drag_files(&state.db, &clip_ids)
        .map_err(|e| e.to_string())?;

    Ok(paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn start_native_drag(
    app: AppHandle,
    state: State<'_, AppState>,
    clip_ids: Vec<String>,
) -> Result<bool, String> {
    if state.native_drag_active.swap(true, Ordering::SeqCst) {
        return Err("A native interaction is already active".into());
    }
    let busy = state.native_drag_active.clone();
    let db = state.db.clone();
    let stager = state.stager.clone();
    let stager_for_drag = stager.clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let (paths, text) = stager.prepare_native_selection(&db, &clip_ids)?;
        let payload = match crate::drag_drop::native::prepare_payload(&paths, text) {
            Ok(payload) => payload,
            Err(error) => {
                stager.discard_session(&paths);
                return Err(error);
            }
        };
        Ok::<_, String>((paths, payload))
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|result| result);
    let (paths, payload) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => {
            busy.store(false, Ordering::SeqCst);
            return Err(error);
        }
    };
    let app_for_drag = app.clone();
    let reset_on_error = busy.clone();
    let (send, receive) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let unread_before = app_for_drag
            .state::<AppState>()
            .pad_unread
            .load(Ordering::Relaxed);
        let presentation = crate::window::DragPresentation::begin(&app_for_drag);
        let result = crate::drag_drop::native::start_drag(payload);
        drop(presentation);
        if !matches!(result, Ok(true)) {
            stager_for_drag.discard_session(&paths);
        }
        busy.store(false, Ordering::SeqCst);
        let state = app_for_drag.state::<AppState>();
        if state.pad_unread.load(Ordering::Relaxed) > unread_before
            && state.preferences.read().pad_mode != "off"
        {
            let _ = crate::window::show_capture_pad(app_for_drag.clone());
        }
        let _ = send.send(result.clone());
        let payload = match result {
            Ok(dropped) => serde_json::json!({ "dropped": dropped }),
            Err(error) => serde_json::json!({ "dropped": false, "error": error }),
        };
        let _ = app_for_drag.emit("native-drag-end", payload);
    })
    .map_err(|error| {
        reset_on_error.store(false, Ordering::SeqCst);
        error.to_string()
    })?;
    tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Drag completion channel closed".to_string())?
}

#[tauri::command]
pub async fn export_clips_with_picker(
    app: AppHandle,
    state: State<'_, AppState>,
    clip_ids: Vec<String>,
) -> Result<Option<usize>, String> {
    if clip_ids.is_empty() {
        return Err("Select clips to export".into());
    }
    if state.native_drag_active.swap(true, Ordering::SeqCst) {
        return Err("A native interaction is already active".into());
    }
    let db = state.db.clone();
    let stager = state.stager.clone();
    let busy = state.native_drag_active.clone();
    let reset_on_error = busy.clone();
    let owner = app
        .get_webview_window("main")
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as isize)
        .unwrap_or(0);
    let (send, receive) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = crate::drag_drop::native::choose_folder(owner);
        busy.store(false, Ordering::SeqCst);
        let _ = send.send(result);
    })
    .map_err(|error| {
        reset_on_error.store(false, Ordering::SeqCst);
        error.to_string()
    })?;
    let folder = tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Folder picker closed unexpectedly".to_string())??;
    if let Some(folder) = folder {
        tauri::async_runtime::spawn_blocking(move || {
            stager
                .export_clips_to_dir(&db, &clip_ids, &folder)
                .map(Some)
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn hide_sidebar(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        hide_history_window(&window)?;
        crate::window::history_closed(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn set_interaction_active(state: State<'_, AppState>, active: bool) {
    state.interaction_active.store(active, Ordering::Relaxed);
}

#[tauri::command]
pub async fn capture_screen(app: AppHandle) -> Result<(), String> {
    if app
        .state::<AppState>()
        .native_drag_active
        .load(Ordering::Relaxed)
    {
        return Err("Finish the current drag before snipping".into());
    }
    let (send, receive) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            if let Some(window) = handle.get_webview_window("main") {
                hide_history_window(&window)?;
            }
            if handle.get_webview_window("capture-pad").is_some() {
                crate::window::hide_pad_native(&handle)?;
            }
            Ok::<(), String>(())
        })();
        let _ = send.send(result);
    })
    .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Snip preparation did not complete")??;
    tauri::async_runtime::spawn_blocking(|| {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        for _ in 0..100 {
            if unsafe {
                GetAsyncKeyState(0x11) >= 0
                    && GetAsyncKeyState(0x10) >= 0
                    && GetAsyncKeyState(0x12) >= 0
            } {
                return Ok::<(), String>(());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        Err("Release Ctrl, Shift and Alt before starting another snip".into())
    })
    .await
    .map_err(|e| e.to_string())??;
    if let Err(error) = crate::drag_drop::native::launch_screen_snip() {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> crate::preferences::Preferences {
    state.preferences.read().clone()
}

#[tauri::command]
pub async fn update_preferences(
    app: AppHandle,
    preferences: crate::preferences::Preferences,
) -> Result<crate::preferences::Preferences, String> {
    tauri::async_runtime::spawn_blocking(move || update_preferences_inner(app, preferences))
        .await
        .map_err(|e| e.to_string())?
}

fn restore_single_keys(
    app: &AppHandle,
    state: &AppState,
    current: &mut crate::preferences::Preferences,
) {
    if state
        .single_keys
        .apply(current.single_key_enabled, &current.single_key_bindings)
        .is_err()
    {
        // A failed rollback must not leave newly assigned keys silently reserved.
        let _ = state.single_keys.apply(false, &[]);
        current.single_key_enabled = false;
        let _ = state.db.save_preferences(current);
        let _ = app.emit("preferences-changed", &*current);
    }
}
fn update_preferences_inner(
    app: AppHandle,
    preferences: crate::preferences::Preferences,
) -> Result<crate::preferences::Preferences, String> {
    let state = app.state::<AppState>();
    preferences.validate()?;
    let mut current = state.preferences.write();
    state.single_keys.cancel_recording();
    let bindings_changed = current.snip_shortcut != preferences.snip_shortcut
        || current.history_shortcut != preferences.history_shortcut
        || current.quick_capture_shortcut != preferences.quick_capture_shortcut;
    if bindings_changed {
        if let Some(listener) = state._listener.read().as_ref() {
            listener.update_shortcuts(
                preferences.snip_shortcut.clone(),
                preferences.history_shortcut.clone(),
                preferences.quick_capture_shortcut.clone(),
            )?;
        }
    }
    let keys_changed = current.single_key_enabled != preferences.single_key_enabled
        || current.single_key_bindings != preferences.single_key_bindings
        || state.single_keys.is_armed() != preferences.single_key_enabled;
    if keys_changed {
        if let Err(error) = state.single_keys.apply(
            preferences.single_key_enabled,
            &preferences.single_key_bindings,
        ) {
            if !state.single_keys.is_armed() && current.single_key_enabled {
                current.single_key_enabled = false;
                let _ = state.db.save_preferences(&current);
                let _ = app.emit("preferences-changed", &*current);
            }
            if bindings_changed {
                if let Some(listener) = state._listener.read().as_ref() {
                    let _ = listener.update_shortcuts(
                        current.snip_shortcut.clone(),
                        current.history_shortcut.clone(),
                        current.quick_capture_shortcut.clone(),
                    );
                }
            }
            return Err(error);
        }
    }
    if current.start_at_login != preferences.start_at_login {
        if let Err(error) = crate::preferences::set_start_at_login(preferences.start_at_login) {
            if keys_changed {
                restore_single_keys(&app, &state, &mut current);
            }
            if bindings_changed {
                if let Some(listener) = state._listener.read().as_ref() {
                    let _ = listener.update_shortcuts(
                        current.snip_shortcut.clone(),
                        current.history_shortcut.clone(),
                        current.quick_capture_shortcut.clone(),
                    );
                }
            }
            return Err(error);
        }
    }
    if let Err(error) = state.db.save_preferences(&preferences) {
        if keys_changed {
            restore_single_keys(&app, &state, &mut current);
        }
        if bindings_changed {
            if let Some(listener) = state._listener.read().as_ref() {
                let _ = listener.update_shortcuts(
                    current.snip_shortcut.clone(),
                    current.history_shortcut.clone(),
                    current.quick_capture_shortcut.clone(),
                );
            }
        }
        if current.start_at_login != preferences.start_at_login {
            let _ = crate::preferences::set_start_at_login(current.start_at_login);
        }
        return Err(error.to_string());
    }
    state
        .capture_paused
        .store(preferences.capture_paused, Ordering::Relaxed);
    *current = preferences.clone();
    drop(current);
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        let mode = handle.state::<AppState>().preferences.read().pad_mode.clone();
        let result = match mode.as_str() {
            "off" if handle.get_webview_window("capture-pad").is_some() => crate::window::hide_pad_native(&handle),
            "always" => crate::window::show_capture_pad(handle.clone()),
            _ => Ok(()),
        };
        if let Err(error) = result {
            let _ = handle.emit("capture-error", serde_json::json!({"message":format!("Settings saved, but Capture Pad could not update: {error}")}));
        }
    }) {
        let _ = app.emit("capture-error", serde_json::json!({"message":format!("Settings saved, but Capture Pad could not update: {error}")}));
    }
    let _ = app.emit("preferences-changed", &preferences);
    Ok(preferences)
}

#[tauri::command]
pub fn export_clips(
    state: State<'_, AppState>,
    clip_ids: Vec<String>,
    target_dir: String,
) -> Result<usize, String> {
    let target_path = PathBuf::from(target_dir);
    state
        .stager
        .export_clips_to_dir(&state.db, &clip_ids, &target_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_sidebar(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        toggle_window_visibility(&window);
    }
    Ok(())
}

pub fn toggle_window_visibility(window: &WebviewWindow) {
    if window
        .state::<AppState>()
        .editor_expanded
        .load(Ordering::Relaxed)
    {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let is_minimized = window.is_minimized().unwrap_or(false);
    let is_visible = window.is_visible().unwrap_or(false);

    if is_visible && !is_minimized {
        let _ = hide_history_window(window);
        crate::window::history_closed(window.app_handle());
    } else {
        let _ = crate::window::hide_pad_native(window.app_handle());
        reposition_sidebar_to_active_display(window);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn set_sidebar_pinned(state: State<'_, AppState>, pinned: bool) -> Result<(), String> {
    state.is_pinned.store(pinned, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn get_sidebar_pinned(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.is_pinned.load(Ordering::Relaxed))
}

pub fn reposition_sidebar_to_active_display(window: &WebviewWindow) {
    let bounds = get_active_monitor_sidebar_bounds(380);
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: bounds.x,
        y: bounds.y,
    }));
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: bounds.width as u32,
        height: bounds.height as u32,
    }));
}

#[tauri::command]
pub fn get_interaction_status(state: State<'_, AppState>) -> bool {
    state.native_drag_active.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn get_shortcut_error(state: State<'_, AppState>) -> Option<String> {
    state
        ._listener
        .read()
        .as_ref()
        .and_then(|l| l.shortcut_error.lock().clone())
}
