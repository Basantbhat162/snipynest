//! Optional control messages only. Pixels continue through the clipboard bridge.
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::OnceLock,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::*,
    System::{DataExchange::COPYDATASTRUCT, LibraryLoader::GetModuleHandleW},
    UI::WindowsAndMessaging::*,
};
pub const HOST: &str = "com.snipynest.companion";
pub const EXTENSION_ID: &str = include_str!("companion_id.txt");
const MAX_MESSAGE: usize = 4096;
struct Session {
    seen: Instant,
    focused: bool,
    ready: bool,
    tab_id: Option<i64>,
}
#[derive(Default)]
struct State {
    sessions: HashMap<String, Session>,
    pending: Option<(String, Option<i64>, u32, Instant)>,
}
static STATE: OnceLock<Mutex<State>> = OnceLock::new();
static NONCE: OnceLock<String> = OnceLock::new();
#[derive(Serialize, Deserialize)]
struct Endpoint {
    hwnd: usize,
    nonce: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Poll {
    nonce: String,
    session: String,
    focused: bool,
    ready: bool,
    tab_id: Option<i64>,
}
fn directory() -> std::path::PathBuf {
    directories::ProjectDirs::from("com", "omnicopy", "OmniCopy")
        .expect("Windows profile unavailable")
        .data_dir()
        .join("browser-control")
}
fn process(state: &mut State, poll: Poll, nonce: &str) -> u32 {
    if poll.nonce != nonce
        || poll.session.len() != 36
        || uuid::Uuid::parse_str(&poll.session).is_err()
    {
        return 0;
    }
    state
        .sessions
        .retain(|_, s| s.seen.elapsed() < Duration::from_secs(3));
    if state.sessions.len() >= 16 && !state.sessions.contains_key(&poll.session) {
        return 0;
    }
    state.sessions.insert(
        poll.session.clone(),
        Session {
            seen: Instant::now(),
            focused: poll.focused,
            ready: poll.ready,
            tab_id: poll.tab_id,
        },
    );
    if let Some((target, tab_id, action, at)) = &state.pending {
        if at.elapsed() > Duration::from_secs(2) {
            state.pending = None;
        } else if target == &poll.session {
            let action = if poll.focused && poll.ready && tab_id.is_some() && *tab_id == poll.tab_id
            {
                *action
            } else {
                0
            };
            state.pending = None;
            return action;
        }
    }
    0
}
unsafe extern "system" fn procedure(
    hwnd: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    if message == WM_COPYDATA && lparam != 0 {
        let data = &*(lparam as *const COPYDATASTRUCT);
        if data.dwData != 0x534e4950 || data.cbData as usize > MAX_MESSAGE || data.lpData.is_null()
        {
            return 0;
        }
        let bytes = std::slice::from_raw_parts(data.lpData as *const u8, data.cbData as usize);
        if let Ok(poll) = serde_json::from_slice::<Poll>(bytes) {
            return process(
                &mut STATE.get_or_init(Default::default).lock(),
                poll,
                NONCE.get().map(String::as_str).unwrap_or(""),
            ) as isize;
        }
        return 0;
    }
    DefWindowProcW(hwnd, message, wparam, lparam)
}
pub fn start() -> Result<(), String> {
    if directory().join("host.json").exists() {
        prepare_host()?;
    }
    let nonce = uuid::Uuid::new_v4().to_string();
    let _ = NONCE.set(nonce.clone());
    let (send, receive) = std::sync::mpsc::channel();
    std::thread::spawn(move || unsafe {
        let name: Vec<u16> = "SnipyNestBrowserControl\0".encode_utf16().collect();
        let instance = GetModuleHandleW(std::ptr::null());
        let class = WNDCLASSW {
            lpfnWndProc: Some(procedure),
            hInstance: instance,
            lpszClassName: name.as_ptr(),
            ..std::mem::zeroed()
        };
        RegisterClassW(&class);
        let hwnd = CreateWindowExW(
            0,
            name.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            let _ = send.send(Err("Browser control window could not start".to_string()));
            return;
        }
        let result = (|| {
            std::fs::create_dir_all(directory())?;
            std::fs::write(
                directory().join("endpoint.json"),
                serde_json::to_vec(&Endpoint {
                    hwnd: hwnd as usize,
                    nonce,
                })?,
            )
        })()
        .map_err(|e: std::io::Error| e.to_string());
        let _ = send.send(result);
        let mut message: MSG = std::mem::zeroed();
        while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
            DispatchMessageW(&message);
        }
        DestroyWindow(hwnd);
    });
    receive
        .recv()
        .map_err(|_| "Browser control did not start".to_string())?
}
pub fn request(action: crate::keyboard::Action) -> Result<(), String> {
    let action = match action {
        crate::keyboard::Action::BrowserVisible => 1,
        crate::keyboard::Action::BrowserFull => 2,
        crate::keyboard::Action::BrowserPdf => 3,
        _ => return Err("Unsupported browser action".into()),
    };
    let mut state = STATE.get_or_init(Default::default).lock();
    let sessions: Vec<_> = state
        .sessions
        .iter()
        .filter(|(_, s)| s.focused && s.ready && s.seen.elapsed() < Duration::from_secs(2))
        .map(|(id, _)| id.clone())
        .collect();
    if let Some(message) = unavailable_message(&state, sessions.len()) {
        return Err(message.into());
    }
    if state
        .pending
        .as_ref()
        .is_some_and(|(_, _, _, at)| at.elapsed() < Duration::from_secs(2))
    {
        return Err("A browser capture request is already pending".into());
    }
    let tab_id = state.sessions[&sessions[0]].tab_id;
    state.pending = Some((sessions[0].clone(), tab_id, action, Instant::now()));
    Ok(())
}
fn unavailable_message(state: &State, ready_count: usize) -> Option<&'static str> {
    if ready_count == 1 {
        return None;
    }
    if ready_count > 1 {
        return Some("More than one browser session is ready. Focus just one browser window and try this desktop key again.");
    }
    let mut fresh = state
        .sessions
        .values()
        .filter(|s| s.seen.elapsed() < Duration::from_secs(3))
        .peekable();
    if fresh.peek().is_none() {
        return Some("This desktop browser key needs Companion connected. In SnipyNest Settings, set up Browser keys, then enable desktop-key access in Companion Settings. Browser Ctrl/Alt shortcuts work without that connection.");
    }
    if fresh.any(|s| s.focused) {
        Some("Companion is connected, but this tab is not ready. Finish the current capture or open a normal webpage, then try again.")
    } else {
        Some("Companion is connected. Focus the webpage you want to capture, then press the desktop key again.")
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    connected: bool,
    ready: bool,
}
#[tauri::command]
pub fn browser_control_status() -> Status {
    let state = STATE.get_or_init(Default::default).lock();
    Status {
        connected: state
            .sessions
            .values()
            .any(|s| s.seen.elapsed() < Duration::from_secs(3)),
        ready: state
            .sessions
            .values()
            .any(|s| s.ready && s.seen.elapsed() < Duration::from_secs(2)),
    }
}
#[tauri::command]
pub async fn install_browser_control(browser: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || register_browser(&browser))
        .await
        .map_err(|e| e.to_string())?
}
fn registry_vendor(browser: &str) -> Result<&'static str, String> {
    match browser {
        // Brave on Windows uses Chromium's Chrome host registration.
        "chrome" | "brave" => Ok("Google\\Chrome"),
        "edge" => Ok("Microsoft\\Edge"),
        _ => Err("Choose Chrome, Edge or Brave".into()),
    }
}
fn register_browser(browser: &str) -> Result<String, String> {
    use windows_sys::Win32::System::Registry::*;
    let vendor = registry_vendor(browser)?;
    std::fs::create_dir_all(directory()).map_err(|e| e.to_string())?;
    let manifest = prepare_host()?;
    let path: Vec<u16> = format!("Software\\{vendor}\\NativeMessagingHosts\\{HOST}\0")
        .encode_utf16()
        .collect();
    let value: Vec<u16> = manifest
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    unsafe {
        let mut key = std::ptr::null_mut();
        let result = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            path.as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut key,
            std::ptr::null_mut(),
        );
        if result != 0 {
            return Err(format!("Browser registration failed ({result})"));
        }
        let result = RegSetValueExW(
            key,
            std::ptr::null(),
            0,
            REG_SZ,
            value.as_ptr() as *const u8,
            (value.len() * 2) as u32,
        );
        RegCloseKey(key);
        if result != 0 {
            return Err(format!("Browser registration failed ({result})"));
        }
    }
    Ok("Browser helper registered for your Windows account. Enable desktop keys in Companion Settings.".into())
}
fn prepare_host() -> Result<std::path::PathBuf, String> {
    // Versioned per-user helper permits upgrades while an older browser port is open.
    let folder = directory().join(env!("CARGO_PKG_VERSION"));
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let host = folder.join("SnipyNestBrowserHost.exe");
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let source = std::fs::read(&exe).map_err(|e| e.to_string())?;
    if std::fs::read(&host).ok().as_deref() != Some(source.as_slice()) {
        std::fs::write(&host, source).map_err(|e| {
            format!("Could not update browser helper. Disconnect Companion and retry: {e}")
        })?;
    }
    let manifest = directory().join("host.json");
    let document = serde_json::json!({"name":HOST,"description":"SnipyNest browser capture control","path":host,"type":"stdio","allowed_origins":[format!("chrome-extension://{}/",EXTENSION_ID.trim())]});
    std::fs::write(
        &manifest,
        serde_json::to_vec_pretty(&document).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(manifest)
}
fn frame(reader: &mut impl Read) -> std::io::Result<Option<serde_json::Value>> {
    let mut length = [0; 4];
    match reader.read_exact(&mut length) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let size = u32::from_le_bytes(length) as usize;
    if size == 0 || size > MAX_MESSAGE {
        return Err(std::io::Error::other("Invalid native message size"));
    }
    let mut bytes = vec![0; size];
    reader.read_exact(&mut bytes)?;
    Ok(Some(serde_json::from_slice(&bytes)?))
}
pub fn is_host() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| {
            p.file_name().map(|v| {
                v.to_string_lossy()
                    .eq_ignore_ascii_case("SnipyNestBrowserHost.exe")
            })
        })
        .unwrap_or(false)
}
pub fn run_host() -> std::io::Result<()> {
    let expected = format!("chrome-extension://{}/", EXTENSION_ID.trim());
    if std::env::args().nth(1).as_deref() != Some(&expected) {
        return Err(std::io::Error::other("Unrecognized Companion origin"));
    }
    let session = uuid::Uuid::new_v4().to_string();
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    while let Some(message) = frame(&mut input)? {
        if message.get("action").and_then(|v| v.as_str()) != Some("poll") {
            return Err(std::io::Error::other("Unsupported browser control request"));
        }
        let endpoint = std::fs::File::open(directory().join("endpoint.json"))
            .ok()
            .and_then(|file| {
                let mut bytes = Vec::new();
                file.take(1024).read_to_end(&mut bytes).ok()?;
                serde_json::from_slice::<Endpoint>(&bytes).ok()
            });
        let mut action = 0;
        let connected = if let Some(endpoint) = endpoint {
            let bytes = serde_json::to_vec(
                &serde_json::json!({"nonce":endpoint.nonce,"session":session,"focused":message.get("focused").and_then(|v|v.as_bool()).unwrap_or(false),"ready":message.get("ready").and_then(|v|v.as_bool()).unwrap_or(false),"tabId":message.get("tabId").and_then(|v|v.as_i64())}),
            )?;
            let data = COPYDATASTRUCT {
                dwData: 0x534e4950,
                cbData: bytes.len() as u32,
                lpData: bytes.as_ptr() as *mut _,
            };
            unsafe {
                SendMessageTimeoutW(
                    endpoint.hwnd as HWND,
                    WM_COPYDATA,
                    0,
                    &data as *const _ as isize,
                    SMTO_ABORTIFHUNG,
                    100,
                    &mut action,
                ) != 0
            }
        } else {
            false
        };
        let reply = serde_json::to_vec(
            &serde_json::json!({"connected":connected,"tabId":message.get("tabId"),"capture":match action{1=>Some("visible"),2=>Some("full"),3=>Some("pdf"),_=>None}}),
        )?;
        output.write_all(&(reply.len() as u32).to_le_bytes())?;
        output.write_all(&reply)?;
        output.flush()?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_key_errors_distinguish_connection_focus_and_readiness() {
        let mut state = State::default();
        assert!(unavailable_message(&state, 0)
            .unwrap()
            .contains("needs Companion connected"));
        state.sessions.insert(
            "test".into(),
            Session {
                seen: Instant::now(),
                focused: false,
                ready: true,
                tab_id: Some(1),
            },
        );
        assert!(unavailable_message(&state, 0)
            .unwrap()
            .contains("Focus the webpage"));
        state.sessions.get_mut("test").unwrap().focused = true;
        assert!(unavailable_message(&state, 0)
            .unwrap()
            .contains("tab is not ready"));
        assert!(unavailable_message(&state, 2)
            .unwrap()
            .contains("More than one"));
        assert!(unavailable_message(&state, 1).is_none());
    }
    #[test]
    fn browser_registration_uses_the_windows_vendor_namespaces() {
        assert_eq!(
            registry_vendor("brave").unwrap(),
            registry_vendor("chrome").unwrap()
        );
        assert_eq!(registry_vendor("edge").unwrap(), "Microsoft\\Edge");
        assert!(registry_vendor("unsupported").is_err());
    }
    #[test]
    fn native_frames_are_bounded_and_commands_are_not_executable_strings() {
        let mut bytes = std::io::Cursor::new(vec![0xff; 4]);
        assert!(frame(&mut bytes).is_err());
        let mut bytes = std::io::Cursor::new(Vec::<u8>::new());
        assert!(frame(&mut bytes).unwrap().is_none());
    }
    #[test]
    fn stale_or_unfocused_sessions_cannot_receive_capture() {
        let mut state = State::default();
        let session = uuid::Uuid::new_v4().to_string();
        let poll = |focused| Poll {
            nonce: "token".into(),
            session: session.clone(),
            focused,
            ready: true,
            tab_id: Some(1),
        };
        state.pending = Some((session.clone(), Some(1), 3, Instant::now()));
        assert_eq!(process(&mut state, poll(true), "wrong"), 0);
        assert_eq!(process(&mut state, poll(false), "token"), 0);
        assert_eq!(process(&mut state, poll(true), "token"), 0);
        state.pending = Some((session.clone(), Some(1), 3, Instant::now()));
        assert_eq!(process(&mut state, poll(true), "token"), 3);
        assert_eq!(process(&mut state, poll(true), "token"), 0);
    }
    #[test]
    fn changing_tabs_cancels_a_pending_capture() {
        let mut state = State::default();
        let session = uuid::Uuid::new_v4().to_string();
        state.pending = Some((session.clone(), Some(1), 2, Instant::now()));
        assert_eq!(
            process(
                &mut state,
                Poll {
                    nonce: "n".into(),
                    session,
                    focused: true,
                    ready: true,
                    tab_id: Some(2)
                },
                "n"
            ),
            0
        );
        assert!(state.pending.is_none());
    }
}
