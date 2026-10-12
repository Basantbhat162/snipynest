use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE,
};

/// Acquired before opening storage or registering listeners. The handle remains
/// owned for the entire application lifetime; second launches have no side effects.
pub struct InstanceGuard(HANDLE);
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

pub fn acquire_instance(background: bool) -> Result<Option<InstanceGuard>, String> {
    let name: Vec<u16> = "Local\\com.omnicopy.app\0".encode_utf16().collect();
    unsafe {
        let mutex = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if mutex.is_null() {
            return Err(format!(
                "Could not initialize the application lock (Windows error {})",
                GetLastError()
            ));
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            CloseHandle(mutex);
            if !background {
                let title: Vec<u16> = "SnipyNest\0".encode_utf16().collect();
                let mut window = FindWindowW(std::ptr::null(), title.as_ptr());
                if window.is_null() {
                    let legacy: Vec<u16> = "OmniCopy\0".encode_utf16().collect();
                    window = FindWindowW(std::ptr::null(), legacy.as_ptr());
                }
                if !window.is_null() {
                    ShowWindow(window, SW_RESTORE);
                    SetForegroundWindow(window);
                }
            }
            Ok(None)
        } else {
            Ok(Some(InstanceGuard(mutex)))
        }
    }
}
