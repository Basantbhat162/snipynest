//! Utility surfaces have no native entry/exit transitions. Never change system preferences.
pub fn disable_transitions(window: &tauri::WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let disabled: i32 = 1;
    let result = unsafe {
        windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(
            hwnd.0 as _, windows_sys::Win32::Graphics::Dwm::DWMWA_TRANSITIONS_FORCEDISABLED as _,
            &disabled as *const _ as _, std::mem::size_of_val(&disabled) as u32,
        )
    };
    if result < 0 { Err(format!("Windows could not disable capture transitions ({result:#x})")) } else { Ok(()) }
}
