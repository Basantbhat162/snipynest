use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

enum Timer {
    Arm(u64, u64),
    Stop,
    Arrival(super::MonitorBounds, u64, u8),
}
static SENDER: OnceLock<Sender<Timer>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static ARRIVAL_GENERATION: AtomicU64 = AtomicU64::new(0);
static INTERACTING: AtomicBool = AtomicBool::new(false);

pub fn initialize(app: AppHandle) {
    let (send, receive) = mpsc::channel();
    if SENDER.set(send).is_err() {
        return;
    }
    std::thread::spawn(move || {
        let mut armed: Option<(Instant, u64)> = None;
        let mut pending: Option<(Instant, super::MonitorBounds, u64, u8)> = None;
        loop {
            let deadline = armed
                .map(|v| v.0)
                .into_iter()
                .chain(pending.map(|v| v.0))
                .min();
            let event = match deadline {
                Some(deadline) => {
                    receive.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                }
                None => receive
                    .recv()
                    .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
            };
            match event {
                Ok(Timer::Arm(seconds, generation)) => {
                    armed = Some((Instant::now() + Duration::from_secs(seconds), generation))
                }
                Ok(Timer::Stop) => armed = None,
                Ok(Timer::Arrival(area, generation, attempts)) => {
                    pending = Some((
                        Instant::now() + Duration::from_millis(250),
                        area,
                        generation,
                        attempts,
                    ))
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let now = Instant::now();
                    if pending.is_some_and(|v| v.0 <= now) {
                        let (_, area, generation, attempts) = pending.take().unwrap();
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            if ARRIVAL_GENERATION.load(Ordering::SeqCst) != generation {
                                return;
                            }
                            if !super::present_arrival(&handle, area) && attempts > 0 {
                                if let Some(send) = SENDER.get() {
                                    let _ =
                                        send.send(Timer::Arrival(area, generation, attempts - 1));
                                }
                            }
                        });
                    }
                    if armed.is_some_and(|v| v.0 <= now) {
                        let (_, generation) = armed.take().unwrap();
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
                    }
                }
            }
        }
    });
}
pub fn arrival(app: &AppHandle, area: super::MonitorBounds) {
    let generation = ARRIVAL_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if !super::present_arrival(app, area) {
        if let Some(send) = SENDER.get() {
            let _ = send.send(Timer::Arrival(area, generation, 120));
        }
    }
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
    ARRIVAL_GENERATION.fetch_add(1, Ordering::SeqCst);
    INTERACTING.store(false, Ordering::SeqCst);
    stop();
}

/// A suspended WebView may never deliver pointerleave/blur. Invalidate old expiry
/// callbacks and reset hover state; preserve any pending new capture arrival.
pub fn resumed(app: &AppHandle) {
    INTERACTING.store(false, Ordering::SeqCst);
    restart(app);
}
