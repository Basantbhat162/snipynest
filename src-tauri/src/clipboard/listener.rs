use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::DataExchange::{
    AddClipboardFormatListener, GetClipboardSequenceNumber, RemoveClipboardFormatListener,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, KillTimer,
    PostMessageW, RegisterClassW, SetTimer, TranslateMessage, MSG, WM_CLIPBOARDUPDATE, WM_HOTKEY,
    WM_TIMER, WM_USER, WNDCLASSW, WS_OVERLAPPED,
};

use super::win32::{read_clipboard_content, ClipboardItem};

const WM_UPDATE_SHORTCUTS: u32 = WM_USER + 102;
type ShortcutRequest = (
    String,
    String,
    std::sync::mpsc::Sender<Result<(), String>>,
    Arc<parking_lot::Mutex<bool>>,
);
pub fn parse_shortcut(value: &str) -> Result<(u32, u32), String> {
    let mut modifiers = MOD_NOREPEAT;
    let mut key = None;
    for part in value.split('+') {
        match part.trim().to_ascii_lowercase().as_str() {
            "ctrl" => modifiers |= MOD_CONTROL,
            "shift" => modifiers |= MOD_SHIFT,
            "alt" => modifiers |= MOD_ALT,
            k if k.len() == 1 && k.as_bytes()[0].is_ascii_alphanumeric() => {
                if key.is_some() {
                    return Err("Use one letter or number in a shortcut".into());
                }
                key = Some(k.as_bytes()[0].to_ascii_uppercase() as u32);
            }
            _ => return Err("Use Ctrl, Shift or Alt plus a letter or number".into()),
        }
    }
    if modifiers & (MOD_CONTROL | MOD_ALT) == 0 {
        return Err("A shortcut must include Ctrl or Alt".into());
    }
    Ok((modifiers, key.ok_or("A shortcut needs a letter or number")?))
}

const WM_STOP_LISTENER: u32 = WM_USER + 101;

pub struct ClipboardListener {
    updates: std::sync::mpsc::Sender<ShortcutRequest>,
    pub shortcut_error: Arc<parking_lot::Mutex<Option<String>>>,
    running: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    window_hwnd: Arc<parking_lot::Mutex<Option<isize>>>,
}

impl ClipboardListener {
    pub fn start<F, H>(
        on_clip: F,
        on_hotkey: H,
        paused: Arc<AtomicBool>,
        snip: String,
        history: String,
    ) -> Self
    where
        F: Fn(ClipboardItem, (i32, i32)) + Send + 'static,
        H: Fn(usize) + Send + 'static,
    {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let window_hwnd = Arc::new(parking_lot::Mutex::new(None));
        let window_hwnd_clone = window_hwnd.clone();

        let (updates, receiver) = std::sync::mpsc::channel::<ShortcutRequest>();
        let shortcut_error = Arc::new(parking_lot::Mutex::new(None));
        let error_in_thread = shortcut_error.clone();
        // Clipboard decoding must not block the hotkey/message thread. Signals coalesce;
        // the worker snapshots the current sequence, never a stale queued payload.
        let (snapshots, snapshot_requests) = std::sync::mpsc::sync_channel::<(i32, i32)>(1);
        let reader_running = running.clone();
        let initial_sequence = unsafe { GetClipboardSequenceNumber() };
        let reader = thread::spawn(move || {
            let mut gate = super::arrival::SequenceGate::new(initial_sequence);
            while let Ok(cursor) = snapshot_requests.recv() {
                if !reader_running.load(Ordering::Relaxed) {
                    break;
                }
                let sequence = unsafe { GetClipboardSequenceNumber() };
                if gate.attempt(sequence, paused.load(Ordering::Relaxed)) {
                    if let Some(item) = read_clipboard_content() {
                        gate.completed();
                        on_clip(item, cursor);
                    }
                }
            }
        });
        let handle = thread::spawn(move || {
            let mut current = [
                parse_shortcut(&snip).unwrap(),
                parse_shortcut(&history).unwrap(),
            ];
            while running_clone.load(Ordering::Relaxed) {
                unsafe {
                    let hinstance = GetModuleHandleW(std::ptr::null());
                    let class_name: Vec<u16> =
                        "OmniCopyClipboardListenerClass\0".encode_utf16().collect();

                    let wc = WNDCLASSW {
                        style: 0,
                        lpfnWndProc: Some(DefWindowProcW),
                        cbClsExtra: 0,
                        cbWndExtra: 0,
                        hInstance: hinstance,
                        hIcon: std::ptr::null_mut(),
                        hCursor: std::ptr::null_mut(),
                        hbrBackground: std::ptr::null_mut(),
                        lpszMenuName: std::ptr::null(),
                        lpszClassName: class_name.as_ptr(),
                    };

                    RegisterClassW(&wc);

                    let hwnd = CreateWindowExW(
                        0,
                        class_name.as_ptr(),
                        std::ptr::null(),
                        WS_OVERLAPPED,
                        0,
                        0,
                        0,
                        0,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        hinstance,
                        std::ptr::null_mut(),
                    );

                    if hwnd.is_null() {
                        *error_in_thread.lock() = Some(
                            "Clipboard listener is restarting. Use the tray while it recovers."
                                .into(),
                        );
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        continue;
                    }

                    *window_hwnd_clone.lock() = Some(hwnd as isize);

                    // Register listener with Windows OS
                    if AddClipboardFormatListener(hwnd) == 0 {
                        *error_in_thread.lock() = Some("Clipboard notifications are unavailable; checking for changes periodically.".into());
                    }
                    // Event delivery is primary. A cheap sequence check recovers lost notifications
                    // after sleep/resume and retries a clipboard temporarily locked by another app.
                    if SetTimer(hwnd, 1, 500, None) == 0 {
                        RemoveClipboardFormatListener(hwnd);
                        DestroyWindow(hwnd);
                        *window_hwnd_clone.lock() = None;
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        continue;
                    }
                    for (index, (modifiers, key)) in current.iter().enumerate() {
                        if RegisterHotKey(hwnd, index as i32 + 1, *modifiers, *key) == 0 {
                            *error_in_thread.lock()=Some("A shortcut is used by another app. Change it in Settings or use the tray.".into());
                        }
                    }
                    let fallback = (MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, 0x56);
                    if !current.contains(&fallback) {
                        RegisterHotKey(hwnd, 3, fallback.0, fallback.1);
                    }

                    let mut msg: MSG = std::mem::zeroed();

                    // Blocking message loop; timer checks metadata only when content is unchanged.
                    while running_clone.load(Ordering::Relaxed)
                        && GetMessageW(&mut msg, hwnd, 0, 0) > 0
                    {
                        if msg.message == WM_STOP_LISTENER {
                            break;
                        }

                        if msg.message == WM_UPDATE_SHORTCUTS {
                            while let Ok((snip, history, reply, pending)) = receiver.try_recv() {
                                let pending = pending.lock();
                                if !*pending {
                                    continue;
                                }
                                let next = parse_shortcut(&snip)
                                    .and_then(|a| parse_shortcut(&history).map(|b| [a, b]));
                                let result = next.and_then(|next| {
                                    UnregisterHotKey(hwnd, 1);
                                    UnregisterHotKey(hwnd, 2);
                                    UnregisterHotKey(hwnd, 3);
                                    let first = RegisterHotKey(hwnd, 1, next[0].0, next[0].1) != 0;
                                    let second = RegisterHotKey(hwnd, 2, next[1].0, next[1].1) != 0;
                                    if first && second {
                                        current = next;
                                        *error_in_thread.lock() = None;
                                        Ok(())
                                    } else {
                                        UnregisterHotKey(hwnd, 1);
                                        UnregisterHotKey(hwnd, 2);
                                        RegisterHotKey(hwnd, 1, current[0].0, current[0].1);
                                        RegisterHotKey(hwnd, 2, current[1].0, current[1].1);
                                        Err("Shortcut conflict. Previous bindings were retained."
                                            .into())
                                    }
                                });
                                if !current.contains(&fallback) {
                                    RegisterHotKey(hwnd, 3, fallback.0, fallback.1);
                                }
                                let _ = reply.send(result);
                            }
                        }
                        if msg.message == WM_HOTKEY {
                            on_hotkey(msg.wParam);
                        }

                        if msg.message == WM_CLIPBOARDUPDATE || msg.message == WM_TIMER {
                            let mut cursor = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
                            windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut cursor);
                            let _ = snapshots.try_send((cursor.x, cursor.y));
                        }

                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }

                    UnregisterHotKey(hwnd, 1);
                    UnregisterHotKey(hwnd, 2);
                    UnregisterHotKey(hwnd, 3);
                    KillTimer(hwnd, 1);
                    RemoveClipboardFormatListener(hwnd);
                    DestroyWindow(hwnd);
                    *window_hwnd_clone.lock() = None;
                }
                if running_clone.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
            drop(snapshots);
            let _ = reader.join();
        });

        Self {
            updates,
            shortcut_error,
            running,
            handle: Some(handle),
            window_hwnd,
        }
    }

    pub fn update_shortcuts(&self, snip: String, history: String) -> Result<(), String> {
        parse_shortcut(&snip)?;
        parse_shortcut(&history)?;
        let hwnd = self
            .window_hwnd
            .lock()
            .ok_or("Shortcut listener is not ready")?;
        let (send, receive) = std::sync::mpsc::channel();
        let pending = Arc::new(parking_lot::Mutex::new(true));
        self.updates
            .send((snip, history, send, pending.clone()))
            .map_err(|_| "Shortcut listener stopped")?;
        if unsafe { PostMessageW(hwnd as HWND, WM_UPDATE_SHORTCUTS, 0, 0) } == 0 {
            *pending.lock() = false;
            return Err("Shortcut listener is unavailable".into());
        }
        match receive.recv_timeout(std::time::Duration::from_secs(3)) {
            Ok(result) => result,
            Err(_) => {
                // Synchronize with registration so a timed-out queued request cannot apply later.
                *pending.lock() = false;
                receive.try_recv().unwrap_or_else(|_| {
                    Err("Shortcut update timed out; previous bindings retained".into())
                })
            }
        }
    }
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(raw_hwnd) = *self.window_hwnd.lock() {
            unsafe {
                let hwnd = raw_hwnd as HWND;
                PostMessageW(hwnd, WM_STOP_LISTENER, 0, 0);
            }
        }
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for ClipboardListener {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod shortcut_tests {
    use super::*;
    #[test]
    fn validates_bindings() {
        assert_eq!(parse_shortcut("Ctrl+Shift+S").unwrap().1, 0x53);
        assert!(parse_shortcut("S").is_err());
        assert!(parse_shortcut("Ctrl+S+V").is_err());
    }
}
