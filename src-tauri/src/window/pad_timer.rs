use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Manager};

enum Timer {
    Arm(u64, u64),
    Stop,
}
static SENDER: OnceLock<Sender<Timer>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static INTERACTING: AtomicBool = AtomicBool::new(false);

pub fn initialize(app: AppHandle) {
    let (send, receive) = mpsc::channel();
    if SENDER.set(send).is_err() {
        return;
    }
    std::thread::spawn(move || {
        let mut armed: Option<(u64, u64)> = None;
        loop {
            let event = match armed {
                Some((seconds, generation)) => {
                    match receive.recv_timeout(Duration::from_secs(seconds)) {
                        Ok(event) => event,
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            let handle = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                let state = handle.state::<crate::AppState>();
                                if GENERATION.load(Ordering::SeqCst) == generation {
                                    if state.native_drag_active.load(Ordering::Relaxed)
                                        || state.window_move_active.load(Ordering::Relaxed)
                                    {
                                        restart(&handle);
                                    } else {
                                        let _ = super::hide_pad_native(&handle);
                                    }
                                }
                            });
                            armed = None;
                            continue;
                        }
                        Err(_) => break,
                    }
                }
                None => match receive.recv() {
                    Ok(event) => event,
                    Err(_) => break,
                },
            };
            armed = match event {
                Timer::Arm(seconds, generation) => Some((seconds, generation)),
                Timer::Stop => None,
            };
        }
    });
}
pub fn stop() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(send) = SENDER.get() {
        let _ = send.send(Timer::Stop);
    }
}
pub fn restart(app: &AppHandle) {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let state = app.state::<crate::AppState>();
    let prefs = state.preferences.read();
    if let Some(send) = SENDER.get() {
        let event = if !INTERACTING.load(Ordering::SeqCst)
            && prefs.pad_mode == "arrival"
            && prefs.pad_hide_seconds > 0
        {
            Timer::Arm(prefs.pad_hide_seconds as u64, generation)
        } else {
            Timer::Stop
        };
        let _ = send.send(event);
    }
}
#[tauri::command]
pub fn set_pad_interacting(app: AppHandle, active: bool) {
    INTERACTING.store(active, Ordering::SeqCst);
    if active {
        stop();
    } else {
        restart(&app);
    }
}
pub fn dismissed() {
    INTERACTING.store(false, Ordering::SeqCst);
    stop();
}
