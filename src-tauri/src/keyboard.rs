//! Opt-in keys owned by a dedicated Windows message thread. No hook or key log.
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, MOD_NOREPEAT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetMessageW, PeekMessageW, PostThreadMessageW, MSG, PM_NOREMOVE, PM_REMOVE, WM_APP, WM_HOTKEY,
    WM_QUIT,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Snip,
    Snapshot,
    History,
    BrowserVisible,
    BrowserFull,
    BrowserPdf,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Binding {
    pub key: String,
    pub action: Action,
}

pub fn key_code(key: &str) -> Result<u32, String> {
    Ok(match key {
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "Home" => 0x24,
        "End" => 0x23,
        "Insert" => 0x2d,
        "PrintScreen" => 0x2c,
        "Pause" => 0x13,
        "ContextMenu" => 0x5d,
        "Backquote" => 0xc0,
        key if key.starts_with('F') => {
            let number: u32 = key[1..].parse().map_err(|_| "Unsupported function key")?;
            if !(1..=11).contains(&number) {
                return Err("Use F1–F11. F12 is reserved by Windows.".into());
            }
            0x6f + number
        }
        _ => {
            return Err(
                "Choose a navigation key, F1–F11, Print Screen, Pause, Menu or the key beside 1."
                    .into(),
            )
        }
    })
}
pub fn validate(bindings: &[Binding]) -> Result<(), String> {
    if bindings.len() > 6 {
        return Err("Assign at most six capture keys".into());
    }
    let mut keys = std::collections::HashSet::new();
    for binding in bindings {
        if !keys.insert(key_code(&binding.key)?) {
            return Err("Each key can have only one action".into());
        }
    }
    Ok(())
}

type Request = (
    Vec<Binding>,
    mpsc::Sender<Result<(), String>>,
    Arc<parking_lot::Mutex<bool>>,
);
pub struct Service {
    sender: mpsc::Sender<Request>,
    thread_id: u32,
    handle: Option<std::thread::JoinHandle<()>>,
    armed: Arc<AtomicBool>,
}
impl Service {
    pub fn start(callback: impl Fn(Action) + Send + 'static) -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel::<Request>();
        let (ready, started) = mpsc::channel();
        let armed = Arc::new(AtomicBool::new(false));
        let thread_armed = armed.clone();
        let handle = std::thread::spawn(move || unsafe {
            let mut message: MSG = std::mem::zeroed();
            PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
            let _ = ready.send(GetCurrentThreadId());
            let mut current: Vec<Binding> = Vec::new();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                if message.message == WM_APP + 42 {
                    while let Ok((next, reply, pending)) = receiver.try_recv() {
                        let pending = pending.lock();
                        if !*pending {
                            continue;
                        }
                        let mut old: MSG = std::mem::zeroed();
                        while PeekMessageW(
                            &mut old,
                            std::ptr::null_mut(),
                            WM_HOTKEY,
                            WM_HOTKEY,
                            PM_REMOVE,
                        ) != 0
                        {}
                        let result = replace(
                            &mut current,
                            next,
                            |id, key| {
                                RegisterHotKey(std::ptr::null_mut(), id, MOD_NOREPEAT, key) != 0
                            },
                            |id| {
                                UnregisterHotKey(std::ptr::null_mut(), id);
                            },
                        );
                        thread_armed.store(!current.is_empty(), Ordering::SeqCst);
                        let _ = reply.send(result);
                    }
                } else if message.message == WM_HOTKEY {
                    if let Some(binding) = current.get(message.wParam.saturating_sub(100)) {
                        if key_code(&binding.key).ok() == Some((message.lParam as u32) >> 16) {
                            callback(binding.action.clone());
                        }
                    }
                }
            }
            for index in 0..current.len() {
                UnregisterHotKey(std::ptr::null_mut(), 100 + index as i32);
            }
            thread_armed.store(false, Ordering::SeqCst);
        });
        Ok(Self {
            sender,
            thread_id: started
                .recv()
                .map_err(|_| "Keyboard service could not start")?,
            handle: Some(handle),
            armed,
        })
    }
    pub fn is_armed(&self) -> bool {
        self.armed.load(Ordering::SeqCst)
    }
    pub fn apply(&self, enabled: bool, bindings: &[Binding]) -> Result<(), String> {
        validate(bindings)?;
        let (reply, result) = mpsc::channel();
        let pending = Arc::new(parking_lot::Mutex::new(true));
        self.sender
            .send((
                if enabled {
                    bindings.to_vec()
                } else {
                    Vec::new()
                },
                reply,
                pending.clone(),
            ))
            .map_err(|_| "Keyboard service stopped")?;
        if unsafe { PostThreadMessageW(self.thread_id, WM_APP + 42, 0, 0) } == 0 {
            *pending.lock() = false;
            return Err("Keyboard service is unavailable".into());
        }
        match result.recv_timeout(std::time::Duration::from_secs(3)) {
            Ok(result) => result,
            Err(_) => {
                *pending.lock() = false;
                result.try_recv().unwrap_or_else(|_| {
                    Err("Key registration timed out; previous assignments retained".into())
                })
            }
        }
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        unsafe {
            PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0);
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
#[tauri::command]
pub fn disarm(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    let state = app.state::<crate::AppState>();
    // Always release first, even if settings cannot be persisted.
    state.single_keys.apply(false, &[])?;
    let mut prefs = state.preferences.write();
    prefs.single_key_enabled = false;
    let _ = app.emit("preferences-changed", &*prefs);
    state
        .db
        .save_preferences(&prefs)
        .map_err(|e| format!("Keys released, but settings could not save: {e}"))
}

// The same transaction is tested with a failing production adapter seam.
fn replace(
    current: &mut Vec<Binding>,
    next: Vec<Binding>,
    mut register: impl FnMut(i32, u32) -> bool,
    mut unregister: impl FnMut(i32),
) -> Result<(), String> {
    validate(&next)?;
    if *current == next {
        return Ok(());
    }
    for index in 0..current.len() {
        unregister(100 + index as i32);
    }
    for (index, binding) in next.iter().enumerate() {
        if !register(100 + index as i32, key_code(&binding.key)?) {
            for slot in 0..index {
                unregister(100 + slot as i32);
            }
            let restored = current.iter().enumerate().all(|(index, binding)| {
                register(100 + index as i32, key_code(&binding.key).unwrap())
            });
            if !restored {
                for index in 0..current.len() {
                    unregister(100 + index as i32);
                }
                current.clear();
                return Err("Key conflict and previous assignments could not be restored. Single-key mode is disarmed; disable it in Settings and retry.".into());
            }
            return Err(format!(
                "{} is unavailable or used by another app. Previous assignments retained.",
                binding.key
            ));
        }
    }
    *current = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn binding(key: &str) -> Binding {
        Binding {
            key: key.into(),
            action: Action::Snapshot,
        }
    }
    #[test]
    fn validates_named_keys_without_typing_or_reserved_keys() {
        for key in [
            "PageUp",
            "PageDown",
            "Home",
            "End",
            "Insert",
            "PrintScreen",
            "Pause",
            "ContextMenu",
            "Backquote",
            "F1",
            "F8",
            "F11",
        ] {
            assert!(key_code(key).is_ok(), "{key}");
        }
        for key in ["F12", "F0", "F99", "Control", "A", "Fn", ""] {
            assert!(key_code(key).is_err(), "{key}");
        }
        assert!(validate(&[binding("Home"), binding("Home")]).is_err());
    }
    #[test]
    fn registration_conflict_rolls_back_and_disable_releases_every_key() {
        let mut current = vec![binding("PageUp")];
        let removed = std::cell::RefCell::new(Vec::new());
        let added = std::cell::RefCell::new(Vec::new());
        assert!(replace(
            &mut current,
            vec![binding("Home")],
            |id, key| {
                added.borrow_mut().push((id, key));
                key != 0x24
            },
            |id| removed.borrow_mut().push(id)
        )
        .is_err());
        assert_eq!(current, vec![binding("PageUp")]);
        assert_eq!(added.borrow().last(), Some(&(100, 0x21)));
        replace(
            &mut current,
            Vec::new(),
            |_, _| true,
            |id| removed.borrow_mut().push(id),
        )
        .unwrap();
        assert!(current.is_empty());
    }
}
