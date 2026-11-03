//! One transient, in-memory screen selection. No clipboard/history write until an explicit action.
use base64::Engine;
use parking_lot::Mutex;
use tauri::{Emitter, Manager};
use crate::{screen_capture::{CaptureGuard, capture_png, monitor_at}, AppState};

struct Session {
    id: String,
    image: String,
    _guard: CaptureGuard,
}
#[derive(Default)]
pub struct RegionState(Mutex<Option<Session>>);
#[derive(serde::Serialize)]
pub struct Snapshot { id: String, image: String }

pub fn cancel(app: &tauri::AppHandle) {
    app.state::<RegionState>().0.lock().take();
    if let Some(window) = app.get_webview_window("capture-overlay") { let _ = window.hide(); }
    let _ = app.emit_to("capture-overlay", "region-cleared", ());
}

pub async fn start(app: tauri::AppHandle) -> Result<(), String> {
    let guard = CaptureGuard::begin()?;
    let state = app.state::<AppState>();
    if state.native_drag_active.load(std::sync::atomic::Ordering::Relaxed)
        || state.window_move_active.load(std::sync::atomic::Ordering::Relaxed)
        || state.interaction_active.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Finish the current edit or drag before starting an area capture".into());
    }
    let (send, receive) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            let mut pointer = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
            if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pointer) } == 0 { return Err("Windows could not locate the pointer".to_string()); }
            let rect = monitor_at((pointer.x, pointer.y), false)?;
            let overlay = handle.get_webview_window("capture-overlay").ok_or("Area capture window is unavailable")?;
            overlay.set_position(tauri::PhysicalPosition::new(rect.x, rect.y)).map_err(|e| e.to_string())?;
            overlay.set_size(tauri::PhysicalSize::new(rect.width as u32, rect.height as u32)).map_err(|e| e.to_string())?;
            if let Some(main) = handle.get_webview_window("main") { crate::commands::hide_history_window(&main)?; }
            crate::window::hide_pad_native(&handle)?;
            Ok::<_, String>(rect)
        })();
        let _ = send.send(result);
    }).map_err(|e| e.to_string())?;
    let rect = tauri::async_runtime::spawn_blocking(move || receive.recv()).await.map_err(|e| e.to_string())?.map_err(|_| "Area capture preparation stopped")??;
    let image = tauri::async_runtime::spawn_blocking(move || {
        // Allow the compositor to remove our surfaces before freezing the desktop.
        std::thread::sleep(std::time::Duration::from_millis(40));
        let png = capture_png(rect)?;
        Ok::<_, String>(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
    }).await.map_err(|e| e.to_string())??;
    let id = uuid::Uuid::new_v4().to_string();
    *app.state::<RegionState>().0.lock() = Some(Session { id: id.clone(), image, _guard: guard });
    if let Err(error) = app.emit_to("capture-overlay", "region-start", &id) { cancel(&app); return Err(error.to_string()); }
    // A failed WebView load cannot retain the screenshot/capture reservation forever.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let pending = handle.state::<RegionState>().0.lock().as_ref().is_some_and(|session| session.id == id);
            if pending && handle.get_webview_window("capture-overlay").is_some_and(|window| !window.is_visible().unwrap_or(false)) { cancel(&handle); }
        });
    });
    Ok(())
}

fn require_overlay(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "capture-overlay" { return Err("This action belongs to area capture".into()); }
    Ok(())
}

#[tauri::command]
pub fn get_region_capture_snapshot(window: tauri::WebviewWindow, state: tauri::State<'_, RegionState>) -> Result<Option<Snapshot>, String> {
    require_overlay(&window)?;
    Ok(state.0.lock().as_ref().map(|session| Snapshot { id: session.id.clone(), image: session.image.clone() }))
}

#[tauri::command]
pub fn show_region_capture(window: tauri::WebviewWindow, state: tauri::State<'_, RegionState>, id: String) -> Result<(), String> {
    require_overlay(&window)?;
    if !state.0.lock().as_ref().is_some_and(|session| session.id == id) { return Err("This area capture has ended".into()); }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_region_capture(app: tauri::AppHandle, window: tauri::WebviewWindow, id: String) -> Result<(), String> {
    require_overlay(&window)?;
    if app.state::<RegionState>().0.lock().as_ref().is_some_and(|session| session.id == id) { cancel(&app); }
    Ok(())
}

#[tauri::command]
pub fn finish_region_capture(app: tauri::AppHandle, window: tauri::WebviewWindow, id: String, clip_id: Option<String>) -> Result<(), String> {
    require_overlay(&window)?;
    if !app.state::<RegionState>().0.lock().as_ref().is_some_and(|session| session.id == id) { return Err("This area capture has ended".into()); }
    cancel(&app);
    if let Some(id) = clip_id {
        if let Some(clip) = app.state::<AppState>().db.get_clip(&id).map_err(|e| e.to_string())? {
            crate::window::image_arrived(&app, &clip, crate::window::active_monitor_work_area());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn copy_region_capture(app: tauri::AppHandle, window: tauri::WebviewWindow, id: String, data_base64: String) -> Result<Option<crate::storage::Clip>, String> {
    require_overlay(&window)?;
    if !app.state::<RegionState>().0.lock().as_ref().is_some_and(|session| session.id == id) { return Err("This area capture has ended".into()); }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if data_base64.len() > crate::storage::blob::MAX_ENCODED_IMAGE_BYTES * 4 / 3 + 128 { return Err("Image exceeds the 64 MiB limit".into()); }
        let png = base64::engine::general_purpose::STANDARD.decode(data_base64.split_once("base64,").map_or(data_base64.as_str(), |(_, value)| value)).map_err(|e| e.to_string())?;
        let state = handle.state::<AppState>();
        // Do not write after the user dismissed or replaced the selection.
        let session = handle.state::<RegionState>();
        let current = session.0.lock();
        if !current.as_ref().is_some_and(|session| session.id == id) { return Err("This area capture has ended".into()); }
        if !crate::clipboard::win32::set_clipboard_image(&png) { return Err("The clipboard is busy. Try Copy again.".into()); }
        if !state.capture_paused.load(std::sync::atomic::Ordering::Relaxed) {
            let clip = state.db.insert_image(&png, Some("SnipyNest"), Some("Area capture")).map_err(|e| format!("Image copied, but history could not save it: {e}"))?;
            state.image_arrivals.lock().should_notify(&clip.hash, None);
            let _ = handle.emit("new-clip", &clip);
            return Ok(Some(clip));
        }
        Ok::<_, String>(None)
    }).await.map_err(|e| e.to_string())?
}
