//! Quick Clipboard's own registration thread; Windows reservations are reported, never silently saved.
use std::sync::{mpsc, Arc};
use parking_lot::Mutex;
use windows_sys::Win32::{System::Threading::GetCurrentThreadId, UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*}};
type Request = (String, bool, mpsc::Sender<Result<(), String>>, Arc<Mutex<bool>>);
pub struct Service {
    pub error: Arc<Mutex<Option<String>>>,
    sender: mpsc::Sender<Request>,
    thread: u32,
    handle: Option<std::thread::JoinHandle<()>>,
}
impl Service {
    pub fn start(callback: impl Fn() + Send + 'static) -> Result<Self, String> {
        let error=Arc::new(Mutex::new(None));
        let thread_error=error.clone();
        let (sender, requests) = mpsc::channel::<Request>();
        let (ready, started) = mpsc::channel();
        let handle = std::thread::spawn(move || unsafe {
            let mut msg: MSG = std::mem::zeroed();
            PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
            let _ = ready.send(GetCurrentThreadId());
            let mut current: Option<(u32,u32)> = None;
            let mut win_v = false;
            let mut hook = std::ptr::null_mut();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                if msg.message == WM_APP + 86 {
                    while let Ok((shortcut, takeover, reply, pending)) = requests.try_recv() {
                        let pending = pending.lock();
                        if !*pending { continue; }
                        let next = crate::clipboard::listener::parse_shortcut(&shortcut);
                        let result = next.and_then(|next| {
                            if current != Some(next) {
                                if current.is_some() { UnregisterHotKey(std::ptr::null_mut(), 801); }
                                if RegisterHotKey(std::ptr::null_mut(), 801, next.0 | MOD_NOREPEAT, next.1) == 0 {
                                    if let Some(old) = current { RegisterHotKey(std::ptr::null_mut(), 801, old.0 | MOD_NOREPEAT, old.1); }
                                    return Err("Quick Clipboard shortcut is already used. Choose another shortcut.".into());
                                }
                            }
                            if takeover != win_v {
                                if takeover {
                                    match crate::win_v::install(GetCurrentThreadId()) {
                                        Ok(value) => hook = value,
                                        Err(error) => {
                                            UnregisterHotKey(std::ptr::null_mut(), 801);
                                            if let Some(old) = current { RegisterHotKey(std::ptr::null_mut(), 801, old.0 | MOD_NOREPEAT, old.1); }
                                            return Err(error);
                                        }
                                    }
                                }
                                if !takeover { crate::win_v::remove(hook); hook=std::ptr::null_mut(); }
                            }
                            current = Some(next); win_v = takeover; Ok(())
                        });
                        *thread_error.lock()=result.as_ref().err().cloned();
                        let _ = reply.send(result);
                    }
                } else if msg.message == WM_APP+88 && win_v {
                    crate::win_v::remove(hook);
                    match crate::win_v::install(GetCurrentThreadId()) {
                        Ok(value)=>hook=value,
                        Err(error)=>{hook=std::ptr::null_mut();win_v=false;*thread_error.lock()=Some(error);}
                    }
                } else if (msg.message == WM_HOTKEY && msg.wParam == 801) || (msg.message == WM_APP+87 && win_v) {
                    callback();
                }
            }
            UnregisterHotKey(std::ptr::null_mut(), 801);
            crate::win_v::remove(hook);
        });
        Ok(Self { error, sender, thread: started.recv().map_err(|_| "Quick Clipboard keyboard service could not start")?, handle: Some(handle) })
    }
    pub fn apply(&self, shortcut: &str, win_v: bool) -> Result<(), String> {
        crate::clipboard::listener::parse_shortcut(shortcut)?;
        let (sent, received) = mpsc::channel();
        let pending = Arc::new(Mutex::new(true));
        self.sender.send((shortcut.into(), win_v, sent, pending.clone())).map_err(|_| "Quick Clipboard keyboard service stopped")?;
        if unsafe { PostThreadMessageW(self.thread, WM_APP + 86, 0, 0) } == 0 { *pending.lock() = false; return Err("Quick Clipboard keyboard service is unavailable".into()); }
        match received.recv_timeout(std::time::Duration::from_secs(3)) {
            Ok(result) => result,
            Err(_) => { *pending.lock() = false; received.try_recv().unwrap_or_else(|_| Err("Quick Clipboard shortcut registration timed out".into())) }
        }
    }
    pub fn resumed(&self) { unsafe { PostThreadMessageW(self.thread,WM_APP+88,0,0); } }
}
impl Drop for Service {
    fn drop(&mut self) {
        unsafe { PostThreadMessageW(self.thread, WM_QUIT, 0, 0); }
        if let Some(handle) = self.handle.take() { let _ = handle.join(); }
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn native_quick_shortcut_conflicts_roll_back_and_drop_releases_registration() {
        let a=super::Service::start(||{}).unwrap();
        let b=super::Service::start(||{}).unwrap();
        let c=super::Service::start(||{}).unwrap();
        let mut keys=Vec::new();
        for key in ["Ctrl+Alt+7","Ctrl+Alt+8","Ctrl+Alt+9","Ctrl+Alt+0"] {
            if a.apply(key,false).is_ok(){keys.push(key);break;}
        }
        for key in ["Ctrl+Alt+7","Ctrl+Alt+8","Ctrl+Alt+9","Ctrl+Alt+0"] {
            if !keys.contains(&key)&&b.apply(key,false).is_ok(){keys.push(key);break;}
        }
        assert_eq!(keys.len(),2,"Two unused test shortcuts are required");
        assert!(b.apply(keys[0],false).is_err());
        assert!(c.apply(keys[1],false).is_err(),"The previous assignment must survive a conflict");
        drop(b);assert!(c.apply(keys[1],false).is_ok());
        drop(a);assert!(c.apply(keys[0],false).is_ok());
    }
}
