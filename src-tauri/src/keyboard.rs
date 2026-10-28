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
    recording: parking_lot::Mutex<Option<String>>,
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
            recording: parking_lot::Mutex::new(None),
        })
    }
    pub fn is_armed(&self) -> bool {
        self.armed.load(Ordering::SeqCst)
    }
    pub fn begin_recording(&self) -> Result<String, String> {
        let mut recording = self.recording.lock();
        if recording.is_some() {
            return Err("Finish the current key recording first".into());
        }
        self.apply(false, &[])?;
        let token = uuid::Uuid::new_v4().to_string();
        *recording = Some(token.clone());
        Ok(token)
    }
    pub fn finish_recording(
        &self,
        token: &str,
        enabled: bool,
        bindings: &[Binding],
    ) -> Result<(), String> {
        let mut recording = self.recording.lock();
        if recording.as_deref() != Some(token) {
            return Ok(());
        }
        *recording = None;
        self.apply(enabled, bindings)
    }
    pub fn cancel_recording(&self) {
        self.recording.lock().take();
    }
    pub fn is_recording(&self) -> bool {
        self.recording.lock().is_some()
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
    let mut prefs = state.preferences.write();
    // Use the same lock order as Save/recording so a late resume cannot undo disarm.
    state.single_keys.cancel_recording();
    state.single_keys.apply(false, &[])?;
    prefs.single_key_enabled = false;
    let _ = app.emit("preferences-changed", &*prefs);
    state
        .db
        .save_preferences(&prefs)
        .map_err(|e| format!("Keys released, but settings could not save: {e}"))
}

#[derive(Serialize)]
pub struct Status {
    active: bool,
    recording: bool,
}
#[tauri::command]
pub fn single_key_status(state: tauri::State<'_, crate::AppState>) -> Status {
    Status {
        active: state.single_keys.is_armed(),
        recording: state.single_keys.is_recording(),
    }
}
#[tauri::command]
pub async fn begin_key_recording(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<crate::AppState>();
        let _prefs = state.preferences.read();
        state.single_keys.begin_recording()
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn finish_key_recording(app: tauri::AppHandle, token: String) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<crate::AppState>();
        let mut prefs=state.preferences.write();
        if let Err(error)=state.single_keys.finish_recording(&token,prefs.single_key_enabled,&prefs.single_key_bindings) {
            prefs.single_key_enabled=false;
            let _=state.db.save_preferences(&prefs);
            let _=app.emit("preferences-changed",&*prefs);
            return Err(format!("Could not restore keys after recording: {error}. Single-key mode is off; enable and save it again."));
        }
        Ok(())
    }).await.map_err(|e|e.to_string())?
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
    #[test]
    fn native_registration_recording_restore_and_explicit_disarm_are_distinct() {
        let service = Service::start(|_| {}).unwrap();
        let bindings = vec![binding("F11")];
        service.apply(true, &bindings).unwrap();
        assert!(service.is_armed());
        let token = service.begin_recording().unwrap();
        assert!(!service.is_armed());
        assert!(service.is_recording());
        assert!(service.begin_recording().is_err());
        service
            .finish_recording("stale-token", true, &bindings)
            .unwrap();
        assert!(!service.is_armed());
        assert!(service.is_recording());
        service.finish_recording(&token, true, &bindings).unwrap();
        assert!(service.is_armed());
        assert!(!service.is_recording());
        let token = service.begin_recording().unwrap();
        service.cancel_recording();
        service.apply(false, &[]).unwrap();
        service.finish_recording(&token, true, &bindings).unwrap();
        assert!(!service.is_armed());
        service.apply(true, &bindings).unwrap();
        drop(service);
        // A fresh message thread must be able to reclaim the key after exit.
        let next = Service::start(|_| {}).unwrap();
        next.apply(true, &bindings).unwrap();
        next.apply(false, &[]).unwrap();
        assert!(!next.is_armed());
    }
}
