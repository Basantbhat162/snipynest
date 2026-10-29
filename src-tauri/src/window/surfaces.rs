use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows_sys::Win32::UI::WindowsAndMessaging::*;

pub fn is_native_visible(window: &WebviewWindow) -> bool {
    window.hwnd().is_ok_and(|hwnd| unsafe {
        IsWindowVisible(hwnd.0 as _) != 0 && IsIconic(hwnd.0 as _) == 0
    })
}

fn show_quiet(window: &WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            ShowWindow(hwnd.0 as _, SW_SHOWNOACTIVATE);
            if window.label() == "capture-pad" {
                SetWindowPos(
                    hwnd.0 as _,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }
}

pub struct DragPresentation {
    windows: Vec<(WebviewWindow, isize, bool)>,
}
impl DragPresentation {
    pub fn begin(app: &AppHandle) -> Self {
        let mut windows = Vec::new();
        let hide = app
            .state::<crate::AppState>()
            .preferences
            .read()
            .hide_during_drag;
        for label in ["main", "capture-pad"] {
            if let Some(window) = app.get_webview_window(label) {
                if !is_native_visible(&window) {
                    continue;
                }
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        let h = hwnd.0 as _;
                        let style = GetWindowLongPtrW(h, GWL_EXSTYLE);
                        SetWindowLongPtrW(
                            h,
                            GWL_EXSTYLE,
                            style | WS_EX_LAYERED as isize | WS_EX_TRANSPARENT as isize,
                        );
                        let faded = !hide
                            && label == "main"
                            && SetLayeredWindowAttributes(h, 0, 30, LWA_ALPHA) != 0;
                        if !faded {
                            ShowWindow(h, SW_HIDE);
                        }
                        windows.push((window, style, !faded));
                    }
                }
            }
        }
        Self { windows }
    }
}
impl Drop for DragPresentation {
    fn drop(&mut self) {
        for (window, style, hidden) in &self.windows {
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    SetLayeredWindowAttributes(hwnd.0 as _, 0, 255, LWA_ALPHA);
                    SetWindowLongPtrW(hwnd.0 as _, GWL_EXSTYLE, *style);
                }
            }
            if *hidden {
                show_quiet(window);
            }
        }
    }
}

pub fn ensure_pad(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("capture-pad") {
        return Ok(window);
    }
    let pad = WebviewWindowBuilder::new(app, "capture-pad", WebviewUrl::App("index.html".into()))
        .title("SnipyNest Capture Pad")
        .inner_size(super::PAD_WIDTH, super::PAD_HEIGHT)
        .resizable(false)
        .decorations(false)
        .shadow(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;
    if let Ok(hwnd) = pad.hwnd() {
        unsafe {
            let h = hwnd.0 as _;
            let style = GetWindowLongPtrW(h, GWL_EXSTYLE);
            SetWindowLongPtrW(
                h,
                GWL_EXSTYLE,
                (style | WS_EX_TOOLWINDOW as isize) & !(WS_EX_APPWINDOW as isize),
            );
            SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
        }
    }
    reset_pad_position(&pad);
    let position_path = app
        .state::<crate::AppState>()
        .data_dir
        .join("pad-position.json");
    if let Ok(bytes) = std::fs::read(position_path) {
        if let Ok((x, y)) = serde_json::from_slice::<(i32, i32)>(&bytes) {
            let _ = pad.set_position(tauri::PhysicalPosition::new(x, y));
            let _ = settle_capture_pad(app.clone());
        }
    }
    Ok(pad)
}
fn reset_pad_position(pad: &WebviewWindow) {
    place_pad(pad, super::active_monitor_work_area(), false);
}
fn place_pad(pad: &WebviewWindow, area: super::MonitorBounds, preserve: bool) {
    let previous = if preserve {
        pad.outer_position()
            .ok()
            .zip(pad.outer_size().ok())
            .map(|(p, s)| (p.x, p.y, s.width, s.height))
    } else {
        None
    };
    let (x, y, width, height) = super::pad_placement(area, previous);
    let _ = pad.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = pad.set_size(tauri::PhysicalSize::new(width, height));
}
pub fn image_arrived(app: &AppHandle, clip: &crate::storage::Clip, monitor: super::MonitorBounds) {
    let state = app.state::<crate::AppState>();
    if !matches!(
        clip.clip_type,
        crate::storage::ClipType::Image | crate::storage::ClipType::File
    ) {
        return;
    }
    state.pad_unread.fetch_add(1, Ordering::Relaxed);
    if state.preferences.read().capture_sound {
        crate::sound::play(state.preferences.read().sound_volume);
    }
    let _ = app.emit("pad-updated", ());
    super::pad_timer::arrival(app, monitor);
}

// Returns false only while a native interaction temporarily prevents placement.
pub fn present_arrival(app: &AppHandle, monitor: super::MonitorBounds) -> bool {
    let state = app.state::<crate::AppState>();
    if state.preferences.read().pad_mode == "off"
        || app
            .get_webview_window("main")
            .is_some_and(|w| is_native_visible(&w))
    {
        return true;
    }
    if state.native_drag_active.load(Ordering::Relaxed)
        || state.window_move_active.load(Ordering::Relaxed)
    {
        return false;
    }
    match ensure_pad(app) {
        Ok(pad) => {
            place_pad(&pad, monitor, true);
            show_quiet(&pad);
            super::pad_timer::restart(app);
        }
        Err(error) => {
            let _ = app.emit("capture-error", serde_json::json!({"message":format!("Image saved, but Capture Pad could not open: {error}")}));
        }
    }
    true
}

#[tauri::command]
pub fn show_capture_pad(app: AppHandle) -> Result<(), String> {
    let pad = ensure_pad(&app)?;
    place_pad(&pad, super::active_monitor_work_area(), true);
    show_quiet(&pad);
    super::pad_timer::restart(&app);
    Ok(())
}
#[tauri::command]
pub fn reset_capture_pad(app: AppHandle) -> Result<(), String> {
    let pad = ensure_pad(&app)?;
    reset_pad_position(&pad);
    show_quiet(&pad);
    super::pad_timer::restart(&app);
    Ok(())
}
#[tauri::command]
pub async fn dismiss_capture_pad(app: AppHandle) -> Result<(), String> {
    let (send, receive) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = send.send(hide_pad_native(&handle));
    })
    .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Pad close did not complete".to_string())?
}

/// Pad is shown with ShowWindow, so hide with the same native visibility owner.
/// Framework hide can be skipped when its cached visibility is still false.
pub fn hide_pad_native(app: &AppHandle) -> Result<(), String> {
    super::pad_timer::dismissed();
    let pad = app
        .get_webview_window("capture-pad")
        .ok_or("Capture Pad is unavailable")?;
    let hwnd = pad.hwnd().map_err(|e| e.to_string())?.0 as _;
    unsafe {
        ShowWindow(hwnd, SW_HIDE);
        if IsWindowVisible(hwnd) != 0 {
            return Err("Windows did not hide Capture Pad. Try the tray reset.".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn open_from_pad(app: AppHandle, quick_crop_id: Option<String>) -> Result<(), String> {
    if let Some(id) = quick_crop_id.as_ref() {
        let clip = app
            .state::<crate::AppState>()
            .db
            .get_clip(id)
            .map_err(|e| e.to_string())?
            .filter(|clip| !clip.is_deleted && clip.clip_type == crate::storage::ClipType::Image)
            .ok_or("The image is no longer available for cropping")?;
        app.emit("quick-crop-request", clip)
            .map_err(|e| e.to_string())?;
    }
    let _ = hide_pad_native(&app);
    app.state::<crate::AppState>()
        .pad_unread
        .store(0, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("main") {
        if !app
            .state::<crate::AppState>()
            .editor_expanded
            .load(Ordering::Relaxed)
        {
            crate::commands::reposition_sidebar_to_active_display(&w);
        }
        w.show().map_err(|e| e.to_string())?;
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    let _ = app.emit("pad-read", ());
    Ok(())
}
#[tauri::command]
pub fn get_pad_unread(app: AppHandle) -> usize {
    app.state::<crate::AppState>()
        .pad_unread
        .load(Ordering::Relaxed)
}

// Enlarge the existing host: the document never unmounts and no cross-WebView copy can lose undo.
#[tauri::command]
pub fn set_editor_mode(app: AppHandle, mode: String) -> Result<(), String> {
    if !["inline", "window", "fullscreen"].contains(&mode.as_str()) {
        return Err("Invalid editor mode".into());
    }
    let w = app
        .get_webview_window("main")
        .ok_or("Editor window missing")?;
    let expanded = mode != "inline";
    app.state::<crate::AppState>()
        .editor_expanded
        .store(expanded, Ordering::Relaxed);
    w.set_fullscreen(false).map_err(|e| e.to_string())?;
    w.unmaximize().map_err(|e| e.to_string())?;
    w.set_decorations(expanded).map_err(|e| e.to_string())?;
    w.set_skip_taskbar(!expanded).map_err(|e| e.to_string())?;
    w.set_always_on_top(!expanded).map_err(|e| e.to_string())?;
    if let Ok(hwnd) = w.hwnd() {
        unsafe {
            let h = hwnd.0 as _;
            let mut style = GetWindowLongPtrW(h, GWL_EXSTYLE);
            if expanded {
                style = (style & !(WS_EX_TOOLWINDOW as isize)) | WS_EX_APPWINDOW as isize;
            } else {
                style = (style | WS_EX_TOOLWINDOW as isize) & !(WS_EX_APPWINDOW as isize);
            }
            SetWindowLongPtrW(h, GWL_EXSTYLE, style);
        }
    }
    if expanded {
        let b = super::get_active_monitor_sidebar_bounds(1200);
        w.set_size(tauri::PhysicalSize::new(
            b.width.max(320) as u32,
            (b.height - 64).max(480) as u32,
        ))
        .map_err(|e| e.to_string())?;
        w.set_position(tauri::PhysicalPosition::new(b.x, b.y + 24))
            .map_err(|e| e.to_string())?;
        if mode == "fullscreen" {
            w.set_fullscreen(true).map_err(|e| e.to_string())?;
        } else {
            w.maximize().map_err(|e| e.to_string())?;
        }
    } else {
        crate::commands::reposition_sidebar_to_active_display(&w);
    }
    Ok(())
}

#[tauri::command]
pub fn settle_capture_pad(app: AppHandle) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    let pad = app.get_webview_window("capture-pad").ok_or("Pad missing")?;
    let position = pad.outer_position().map_err(|e| e.to_string())?;
    let size = pad.outer_size().map_err(|e| e.to_string())?;
    let mut x = position.x;
    let mut y = position.y;
    if let Ok(hwnd) = pad.hwnd() {
        unsafe {
            let monitor = MonitorFromWindow(hwnd.0 as _, MONITOR_DEFAULTTONEAREST);
            let mut info: MONITORINFO = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(monitor, &mut info) != 0 {
                let rect = info.rcWork;
                let max_x = (rect.right - size.width as i32).max(rect.left);
                let max_y = (rect.bottom - size.height as i32).max(rect.top);
                x = x.clamp(rect.left, max_x);
                y = y.clamp(rect.top, max_y);
                let threshold = (24.0 * pad.scale_factor().unwrap_or(1.0)) as i32;
                if x - rect.left < threshold {
                    x = rect.left;
                } else if max_x - x < threshold {
                    x = max_x;
                }
                if y - rect.top < threshold {
                    y = rect.top;
                } else if max_y - y < threshold {
                    y = max_y;
                }
            }
        }
    }
    if x != position.x || y != position.y {
        pad.set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }
    std::fs::write(
        app.state::<crate::AppState>()
            .data_dir
            .join("pad-position.json"),
        serde_json::to_vec(&(x, y)).unwrap(),
    )
    .map_err(|e| e.to_string())
}

pub fn history_closed(app: &AppHandle) {
    let state = app.state::<crate::AppState>();
    if !state.preferences.read().pad_on_history_close
        || state.preferences.read().pad_mode == "off"
        || state.native_drag_active.load(Ordering::Relaxed)
        || state.window_move_active.load(Ordering::Relaxed)
        || state.editor_expanded.load(Ordering::Relaxed)
    {
        return;
    }
    if state
        .db
        .query_clips(&crate::storage::ClipFilter {
            clip_type: Some("image".into()),
            limit: Some(1),
            ..Default::default()
        })
        .map_or(false, |clips| !clips.is_empty())
    {
        let _ = show_capture_pad(app.clone());
    }
}

/// Called on the UI thread after sleep/resume or display topology changes.
/// Do not replay history, rewrite the clipboard or clear an active native-operation guard.
pub fn recover_after_resume(app: &AppHandle) {
    for label in ["main", "capture-pad"] {
        if let Some(window) = app.get_webview_window(label) {
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    PostMessageW(hwnd.0 as _, WM_CANCELMODE, 0, 0);
                }
            }
        }
    }
    if let Some(pad) = app.get_webview_window("capture-pad") {
        let state = app.state::<crate::AppState>();
        if !state.native_drag_active.load(Ordering::Relaxed)
            && !state.window_move_active.load(Ordering::Relaxed)
        {
            let _ = settle_capture_pad(app.clone());
            if is_native_visible(&pad) {
                show_quiet(&pad);
            }
        }
    }
    super::pad_timer::resumed(app);
    let _ = app.emit("pad-updated", ());
}
