//! Opt-in chord interception only. No typed content is retained or logged.
use std::cell::{Cell, RefCell};
use windows_sys::Win32::{Foundation::*, UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*}, System::LibraryLoader::GetModuleHandleW};

#[derive(Default)]
pub struct Chord { left:bool, right:bool, v:bool, held:bool }
impl Chord {
    /// (suppress, first activation). Modifier combinations other than Win+V pass through.
    pub fn event(&mut self,key:u32,down:bool,injected:bool,other_modifiers:bool)->(bool,bool){
        if injected{return(false,false);}
        match key {
            0x5b=>{self.left=down;(false,false)}
            0x5c=>{self.right=down;(false,false)}
            0x56=>{
                if !down {
                    let consumed=self.v;self.v=false;self.held=false;return(consumed,false);
                }
                if self.held{return(self.v,false);}
                self.held=true;
                if (self.left||self.right) && !other_modifiers{
                    self.v=true;(true,true)
                }else{(false,false)}
            }
            _=>(false,false)
        }
    }
}
thread_local!{
    static CHORD:RefCell<Chord>=RefCell::new(Chord::default());
    static THREAD:Cell<u32>=const{Cell::new(0)};
}
unsafe extern "system" fn hook(code:i32,wparam:WPARAM,lparam:LPARAM)->LRESULT{
    if code==0 {
        let event=&*(lparam as *const KBDLLHOOKSTRUCT);
        let down=matches!(wparam as u32,WM_KEYDOWN|WM_SYSKEYDOWN);
        let up=matches!(wparam as u32,WM_KEYUP|WM_SYSKEYUP);
        if down||up {
            let modifiers=[VK_CONTROL,VK_MENU,VK_SHIFT].iter().any(|k|GetAsyncKeyState(i32::from(*k))<0);
            let (consume,trigger)=CHORD.with(|chord|chord.borrow_mut().event(event.vkCode,down,event.flags&LLKHF_INJECTED!=0,modifiers));
            if trigger {
                // A harmless non-character key marks Win as used, preventing Start on release.
                // No Ctrl/Alt/Shift state is changed. Injected events bypass this hook's detector.
                let input=|flags|INPUT{r#type:INPUT_KEYBOARD,Anonymous:INPUT_0{ki:KEYBDINPUT{wVk:VK_NONAME,wScan:0,dwFlags:flags,time:0,dwExtraInfo:0}}};
                let keys=[input(0),input(KEYEVENTF_KEYUP)];
                SendInput(2,keys.as_ptr(),std::mem::size_of::<INPUT>() as i32);
                THREAD.with(|thread|{PostThreadMessageW(thread.get(),WM_APP+87,0,0);});
            }
            if consume{return 1;}
        }
    }
    CallNextHookEx(std::ptr::null_mut(),code,wparam,lparam)
}
pub unsafe fn install(thread:u32)->Result<HHOOK,String>{
    THREAD.with(|value|value.set(thread));
    CHORD.with(|value|*value.borrow_mut()=Chord{
        left:GetAsyncKeyState(VK_LWIN as i32)<0,right:GetAsyncKeyState(VK_RWIN as i32)<0,v:false,held:GetAsyncKeyState(0x56)<0
    });
    let result=SetWindowsHookExW(WH_KEYBOARD_LL,Some(hook),GetModuleHandleW(std::ptr::null()),0);
    if result.is_null(){Err("Windows could not enable Win+V replacement. Keep using your Quick Clipboard shortcut.".into())}else{Ok(result)}
}
pub unsafe fn remove(hook:HHOOK){
    if !hook.is_null(){UnhookWindowsHookEx(hook);}
    CHORD.with(|value|*value.borrow_mut()=Chord::default());
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn consumes_once_with_both_win_keys_repeat_and_either_release_order(){
        for win in [0x5b,0x5c] {
            for win_first in [true,false]{
                let mut chord=Chord::default();
                assert_eq!(chord.event(win,true,false,false),(false,false));
                assert_eq!(chord.event(0x56,true,false,false),(true,true));
                assert_eq!(chord.event(0x56,true,false,false),(true,false));
                if win_first{chord.event(win,false,false,false);}
                assert_eq!(chord.event(0x56,false,false,false),(true,false));
                if !win_first{chord.event(win,false,false,false);}
                assert_eq!(chord.event(0x56,true,false,false),(false,false));
            }
        }
    }
    #[test]fn leaves_other_shortcuts_injected_input_and_ordinary_typing_alone(){
        let mut chord=Chord::default();
        assert_eq!(chord.event(0x56,true,false,false),(false,false));
        chord.event(0x56,false,false,false);
        chord.event(0x5b,true,false,false);
        assert_eq!(chord.event(0x56,true,false,true),(false,false));
        assert_eq!(chord.event(0x56,true,false,false),(false,false));
        assert_eq!(chord.event(0x56,true,true,false),(false,false));
        assert_eq!(chord.event(0x45,true,false,false),(false,false));
    }
}
