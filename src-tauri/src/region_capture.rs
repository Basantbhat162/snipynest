//! One transient, in-memory screen selection. No clipboard/history write until an explicit action.
use base64::Engine;
use parking_lot::Mutex;
use tauri::{Emitter, Manager};
use std::sync::Arc;
use crate::{screen_capture::{CaptureGuard, CaptureFrame, capture_frame, desktop_rect, desktop_monitors, ScreenRect}, AppState};

struct Session {
    id: String,
    frame: Arc<CaptureFrame>,
    screens: Vec<ScreenRect>,
    active: Arc<std::sync::atomic::AtomicBool>,
    copying: Arc<std::sync::atomic::AtomicBool>,
    _guard: CaptureGuard,
}
#[derive(Default)]
pub struct RegionState(Mutex<Option<Session>>, std::sync::atomic::AtomicUsize);
#[derive(serde::Serialize)]
pub struct Snapshot { id: String, screens: Vec<ScreenRect> }

pub fn cancel(app: &tauri::AppHandle) {
    let ended = app.state::<RegionState>().0.lock().take();
    if let Some(session) = ended {
        session.active.store(false, std::sync::atomic::Ordering::SeqCst);
        if let Some(window) = app.get_webview_window("capture-overlay") { let _ = window.hide(); }
        let _ = app.emit_to("capture-overlay", "region-cleared", &session.id);
    }
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
            let rect = desktop_rect()?;
            let mut screens=desktop_monitors(rect);
            screens.sort_by_key(|screen| !(pointer.x>=screen.x && pointer.x<screen.x+screen.width && pointer.y>=screen.y && pointer.y<screen.y+screen.height));
            for screen in &mut screens {screen.x-=rect.x;screen.y-=rect.y;}
            let overlay = handle.get_webview_window("capture-overlay").ok_or("Area capture window is unavailable")?;
            crate::window::motion::disable_transitions(&overlay)?;
            overlay.set_position(tauri::PhysicalPosition::new(rect.x, rect.y)).map_err(|e| e.to_string())?;
            overlay.set_size(tauri::PhysicalSize::new(rect.width as u32, rect.height as u32)).map_err(|e| e.to_string())?;
            crate::quick_clipboard::dismiss(&handle, None)?;
            if let Some(main) = handle.get_webview_window("main") { crate::commands::hide_history_window(&main)?; }
            crate::window::hide_pad_native(&handle)?;
            Ok::<_, String>((rect,screens))
        })();
        let _ = send.send(result);
    }).map_err(|e| e.to_string())?;
    let (rect,screens) = tauri::async_runtime::spawn_blocking(move || receive.recv()).await.map_err(|e| e.to_string())?.map_err(|_| "Area capture preparation stopped")??;
    let frame = tauri::async_runtime::spawn_blocking(move || {
        // Allow the compositor to remove our surfaces before freezing the desktop.
        std::thread::sleep(std::time::Duration::from_millis(40));
        capture_frame(rect)
    }).await.map_err(|e| e.to_string())??;
    let id = uuid::Uuid::new_v4().to_string();
    *app.state::<RegionState>().0.lock() = Some(Session { id: id.clone(), frame: Arc::new(frame), screens, active:Arc::new(std::sync::atomic::AtomicBool::new(true)), copying:Arc::new(std::sync::atomic::AtomicBool::new(false)), _guard: guard });
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
    Ok(state.0.lock().as_ref().map(|session| Snapshot { id: session.id.clone(), screens:session.screens.clone() }))
}

#[tauri::command]
pub async fn get_region_capture_frame(window: tauri::WebviewWindow, state: tauri::State<'_, RegionState>, id: String) -> Result<tauri::ipc::Response, String> {
    require_overlay(&window)?;
    let frame = state.0.lock().as_ref().filter(|s| s.id == id).map(|s| s.frame.clone()).ok_or("This area capture has ended")?;
    Ok(tauri::ipc::Response::new(frame.bmp().to_vec()))
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
pub async fn copy_region_capture(app: tauri::AppHandle, window: tauri::WebviewWindow, id: String, data_base64: Option<String>, selection: Option<ScreenRect>) -> Result<(), String> {
    require_overlay(&window)?;
    let (active, copying) = {
        let state=app.state::<RegionState>();let current=state.0.lock();
        let session=current.as_ref().filter(|s|s.id==id).ok_or("This area capture has ended")?;
        (session.active.clone(),session.copying.clone())
    };
    if copying.swap(true,std::sync::atomic::Ordering::SeqCst){return Err("Copy is already running".into());}
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        struct Attempt(Arc<std::sync::atomic::AtomicBool>);
        impl Drop for Attempt{fn drop(&mut self){self.0.store(false,std::sync::atomic::Ordering::SeqCst);}}
        let _attempt=Attempt(copying);
        let png = if let Some(selection) = selection {
            let frame = handle.state::<RegionState>().0.lock().as_ref().filter(|s| s.id == id).map(|s| s.frame.clone()).ok_or("This area capture has ended")?;
            frame.png(selection)?
        } else {
            let data = data_base64.ok_or("The capture has no image")?;
            if data.len() > crate::storage::blob::MAX_ENCODED_IMAGE_BYTES * 4 / 3 + 128 { return Err("Image exceeds the 64 MiB limit".into()); }
            base64::engine::general_purpose::STANDARD.decode(data.split_once("base64,").map_or(data.as_str(), |(_, value)| value)).map_err(|e| e.to_string())?
        };
        let state = handle.state::<AppState>();
        // Do not write after the user dismissed or replaced the selection.
        if !crate::clipboard::win32::set_clipboard_image_if(&png, || active.load(std::sync::atomic::Ordering::SeqCst)) { return Err("Copy was cancelled or the clipboard is busy. Try Copy again.".into()); }
        let monitor = crate::window::active_monitor_work_area();
        let close_handle = handle.clone();
        let (sent, hidden) = std::sync::mpsc::channel();
        handle.run_on_main_thread(move || {
            if close_handle.state::<RegionState>().0.lock().as_ref().is_some_and(|s|s.id==id){cancel(&close_handle);}
            let _ = sent.send(());
        }).map_err(|e| e.to_string())?;
        hidden.recv_timeout(std::time::Duration::from_secs(2)).map_err(|_| "Image copied; capture window did not close in time")?;
        if !state.capture_paused.load(std::sync::atomic::Ordering::Relaxed) {
            archive(handle.clone(), png, monitor);
        }
        Ok::<_, String>(())
    }).await.map_err(|e| e.to_string())?
}

fn archive(app: tauri::AppHandle, png: Vec<u8>, monitor: crate::window::MonitorBounds) {
    use std::sync::atomic::Ordering;
    let weight = png.len();
    if app.state::<RegionState>().1.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |used| used.checked_add(weight).filter(|n| *n <= 64 * 1024 * 1024)).is_err() {
        let _ = app.emit("capture-error", serde_json::json!({"message":"Image copied. History queue is full; this capture was not archived."}));
        return;
    }
    type Job=(tauri::AppHandle,Vec<u8>,crate::window::MonitorBounds);
    static QUEUE:std::sync::OnceLock<std::sync::mpsc::SyncSender<Job>>=std::sync::OnceLock::new();
    let sender=QUEUE.get_or_init(||{
        let (sender,receiver)=std::sync::mpsc::sync_channel::<Job>(2);
        std::thread::spawn(move||while let Ok((app,png,monitor))=receiver.recv(){
            archive_one(app,png,monitor);
        });
        sender
    });
    if sender.try_send((app.clone(),png,monitor)).is_err(){
        app.state::<RegionState>().1.fetch_sub(weight,Ordering::SeqCst);
        let _=app.emit("capture-error",serde_json::json!({"message":"Image copied. History queue is full; this capture was not archived."}));
    }
}
fn archive_one(app:tauri::AppHandle,png:Vec<u8>,monitor:crate::window::MonitorBounds){
        let weight=png.len();
        let state = app.state::<AppState>();
        let result = state.db.insert_image(&png, Some("SnipyNest"), Some("Area capture"));
        app.state::<RegionState>().1.fetch_sub(weight, std::sync::atomic::Ordering::SeqCst);
        match result {
            Ok(clip) => {
                state.image_arrivals.lock().should_notify(&clip.hash, None);
                let _ = app.emit("new-clip", &clip);
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || crate::window::image_arrived(&handle, &clip, monitor));
            }
            Err(error) => { let _ = app.emit("capture-error", serde_json::json!({"message":format!("Image copied, but history could not save it: {error}")})); }
        }
}
