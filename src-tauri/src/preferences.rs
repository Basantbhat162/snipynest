use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub capture_paused: bool,
    pub trash_retention_days: u16,
    pub start_at_login: bool,
    pub snip_shortcut: String,
    pub history_shortcut: String,
    pub pad_mode: String,
    pub pad_privacy: bool,
    pub hide_during_drag: bool,
    pub capture_sound: bool,
    pub sound_volume: u8,
    pub pad_hide_seconds: u16,
    pub pad_on_history_close: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            capture_paused: false,
            trash_retention_days: 30,
            start_at_login: false,
            snip_shortcut: "Ctrl+Shift+S".into(),
            history_shortcut: "Ctrl+Shift+V".into(),
            pad_mode: "arrival".into(),
            pad_privacy: false,
            hide_during_drag: false,
            capture_sound: true,
            sound_volume: 70,
            pad_hide_seconds: 8,
            pad_on_history_close: true,
        }
    }
}
impl Preferences {
    pub fn validate(&self) -> Result<(), String> {
        if self.sound_volume > 100 {
            return Err("Sound volume must be between 0 and 100".into());
        }
        if ![0, 3, 5, 8, 15, 30].contains(&self.pad_hide_seconds) {
            return Err("Choose a supported Pad hide delay".into());
        }
        if !(1..=365).contains(&self.trash_retention_days) {
            return Err("Trash retention must be between 1 and 365 days".into());
        }
        if !["arrival", "always", "off"].contains(&self.pad_mode.as_str()) {
            return Err("Invalid Capture Pad mode".into());
        }
        let a = crate::clipboard::listener::parse_shortcut(&self.snip_shortcut)?;
        let b = crate::clipboard::listener::parse_shortcut(&self.history_shortcut)?;
        if a == b {
            return Err("Snip and history shortcuts must be different".into());
        }
        Ok(())
    }
}

/// Changes only OmniCopy's own per-user Run value, after explicit user opt-in.
pub fn set_start_at_login(enabled: bool) -> Result<(), String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_SZ,
    };
    let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0"
        .encode_utf16()
        .collect();
    let name: Vec<u16> = "SnipyNest\0".encode_utf16().collect();
    let command = if enabled {
        Some(format!(
            "\"{}\" --background",
            std::env::current_exe()
                .map_err(|e| e.to_string())?
                .display()
        ))
    } else {
        None
    };
    unsafe {
        let mut key = std::ptr::null_mut();
        let result = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            key_path.as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut key,
            std::ptr::null_mut(),
        );
        if result != 0 {
            return Err(format!(
                "Windows could not open startup settings (error {})",
                result
            ));
        }
        let result = if let Some(command) = command {
            let bytes: Vec<u8> = command
                .encode_utf16()
                .chain(Some(0))
                .flat_map(u16::to_le_bytes)
                .collect();
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                bytes.as_ptr(),
                bytes.len() as u32,
            )
        } else {
            RegDeleteValueW(key, name.as_ptr())
        };
        if result == 0 || result == 2 {
            let legacy: Vec<u16> = "OmniCopy\0".encode_utf16().collect();
            RegDeleteValueW(key, legacy.as_ptr());
        }
        RegCloseKey(key);
        if result != 0 && result != 2 {
            Err(format!(
                "Windows could not update startup settings (error {})",
                result
            ))
        } else {
            Ok(())
        }
    }
}
