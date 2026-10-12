//! Own the entire native move loop, including capture cleanup and blur suppression.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Manager, WebviewWindow};
use windows_sys::Win32::UI::{
    Input::KeyboardAndMouse::{GetAsyncKeyState, ReleaseCapture},
    WindowsAndMessaging::*,
};

/// Ignore delayed WebView blur notifications while this top-level window is
/// still the foreground window. Native movement can generate transient blur.
pub fn has_native_focus(window: &tauri::Window) -> bool {
    window
        .hwnd()
        .is_ok_and(|hwnd| unsafe { GetForegroundWindow() == hwnd.0 as _ })
}

pub struct MoveSession(Arc<AtomicBool>);
impl MoveSession {
    pub fn begin(active: Arc<AtomicBool>) -> Result<Self, String> {
        if active.swap(true, Ordering::SeqCst) {
            return Err("A window is already moving".into());
        }
        Ok(Self(active))
    }
}
impl Drop for MoveSession {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn move_utility_window(window: WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "main" | "capture-pad") {
        return Err("Unknown utility window".into());
    }
    let guard = MoveSession::begin(window.state::<crate::AppState>().window_move_active.clone())?;
    let dispatch = window.clone();
    let (send, receive) = std::sync::mpsc::channel();
    dispatch
        .run_on_main_thread(move || {
            let result = (|| {
                let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as _;
                unsafe {
                    // IPC may arrive after a quick release. Never enter keyboard move mode then.
                    if GetAsyncKeyState(1) >= 0 {
                        return Ok(());
                    }
                    ReleaseCapture();
                    // DefWindowProc completes only when the move loop ends. Do not infer
                    // completion from WebView pointerup or a debounce of window-moved events.
                    DefWindowProcW(
                        hwnd,
                        WM_SYSCOMMAND,
                        (SC_MOVE | HTCAPTION as u32) as usize,
                        0,
                    );
                    ReleaseCapture();
                }
                if window.label() == "capture-pad" {
                    super::settle_capture_pad(window.app_handle().clone())?;
                }
                Ok(())
            })();
            drop(guard);
            let _ = send.send(result);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Window move did not finish".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn move_guard_rejects_reentry_and_recovers_after_early_return() {
        let active = Arc::new(AtomicBool::new(false));
        {
            let _session = MoveSession::begin(active.clone()).unwrap();
            assert!(active.load(Ordering::SeqCst));
            assert!(MoveSession::begin(active.clone()).is_err());
        }
        assert!(!active.load(Ordering::SeqCst));
        assert!(MoveSession::begin(active.clone()).is_ok());
        assert!(!active.load(Ordering::SeqCst));
    }
}
