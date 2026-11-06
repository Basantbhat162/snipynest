//! Destination/clipboard guards around one paste dispatch. Never retries input or elevates.
use windows_sys::Win32::{Foundation::HWND, System::{DataExchange::GetClipboardSequenceNumber, Threading::GetCurrentProcessId}, UI::{WindowsAndMessaging::*, Input::KeyboardAndMouse::*}};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Destination { pub hwnd: usize, pub process: u32, pub thread: u32 }
impl Destination {
    pub fn current() -> Option<Self> {
        unsafe {
            let hwnd = GetForegroundWindow();
            let mut process = 0;
            let thread = GetWindowThreadProcessId(hwnd, &mut process);
            if hwnd.is_null() || process == 0 || process == GetCurrentProcessId() { None }
            else { Some(Self {hwnd:hwnd as usize, process, thread}) }
        }
    }
    pub fn exists(self) -> bool {
        unsafe {
            let mut process = 0;
            let thread = GetWindowThreadProcessId(self.hwnd as HWND, &mut process);
            IsWindow(self.hwnd as HWND) != 0 && process == self.process && thread == self.thread
        }
    }
}
pub trait Adapter {
    fn destination_exists(&self) -> bool;
    fn foreground_matches(&self) -> bool;
    fn sequence(&self) -> u32;
    fn modifiers_released(&self) -> bool;
    fn dispatch(&mut self) -> bool;
}
/// Final gate is used by the real Windows adapter and deterministic race tests.
pub fn dispatch_once(adapter: &mut impl Adapter, sequence: u32) -> Result<(), &'static str> {
    if !adapter.destination_exists() { return Err("The original app closed. The Clip is copied; paste it manually."); }
    if !adapter.foreground_matches() { return Err("Windows did not return focus to the original app. The Clip is copied; paste it manually."); }
    if !adapter.modifiers_released() { return Err("Release the shortcut keys, then paste the copied Clip manually."); }
    if sequence == 0 || adapter.sequence() != sequence { return Err("The clipboard changed. Automatic paste was cancelled."); }
    if !adapter.dispatch() { return Err("Windows blocked paste input. The Clip is copied; paste it manually."); }
    Ok(())
}
pub fn keys_released() -> bool {
    [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN, VK_RETURN, VK_LBUTTON, 0x56]
        .iter().all(|key| unsafe { GetAsyncKeyState(i32::from(*key)) } >= 0)
}
pub struct WindowsAdapter(pub Destination);
impl Adapter for WindowsAdapter {
    fn destination_exists(&self) -> bool { self.0.exists() }
    fn foreground_matches(&self) -> bool { unsafe { GetForegroundWindow() as usize == self.0.hwnd } }
    fn sequence(&self) -> u32 { unsafe { GetClipboardSequenceNumber() } }
    fn modifiers_released(&self) -> bool { keys_released() }
    fn dispatch(&mut self) -> bool {
        unsafe {
            let input = |key, flags| INPUT { r#type:INPUT_KEYBOARD, Anonymous:INPUT_0 {ki:KEYBDINPUT {wVk:key,wScan:0,dwFlags:flags,time:0,dwExtraInfo:0}} };
            let keys = [input(VK_CONTROL,0),input(0x56,0),input(0x56,KEYEVENTF_KEYUP),input(VK_CONTROL,KEYEVENTF_KEYUP)];
            let count = SendInput(keys.len() as u32,keys.as_ptr(),std::mem::size_of::<INPUT>() as i32);
            if count != keys.len() as u32 && count > 0 {
                // Release only injected keys after a partial dispatch. Never resend paste.
                let releases = [input(0x56,KEYEVENTF_KEYUP),input(VK_CONTROL,KEYEVENTF_KEYUP)];
                SendInput(2,releases.as_ptr(),std::mem::size_of::<INPUT>() as i32);
            }
            count == keys.len() as u32
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    struct Fake { exists:bool, focused:bool, sequence:u32, released:bool, sent:u8 }
    impl Adapter for Fake {
        fn destination_exists(&self)->bool{self.exists}
        fn foreground_matches(&self)->bool{self.focused}
        fn sequence(&self)->u32{self.sequence}
        fn modifiers_released(&self)->bool{self.released}
        fn dispatch(&mut self)->bool{self.sent+=1;true}
    }
    #[test]
    fn a_changed_clipboard_focus_or_held_modifier_never_receives_input() {
        for failure in 0..4 {
            let mut os = Fake {exists:failure!=0,focused:failure!=1,sequence:if failure==2 {8}else{7},released:failure!=3,sent:0};
            assert!(dispatch_once(&mut os,7).is_err()); assert_eq!(os.sent,0);
        }
        let mut os = Fake {exists:true,focused:true,sequence:7,released:true,sent:0};
        assert!(dispatch_once(&mut os,7).is_ok()); assert_eq!(os.sent,1);
    }
}
