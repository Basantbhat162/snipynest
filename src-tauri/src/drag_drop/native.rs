//! Windows OLE adapter. Payloads own their bytes; each GetData transfers a fresh
//! movable HGLOBAL to the consumer, which releases it with ReleaseStgMedium.
use std::ffi::c_void;
use std::path::PathBuf;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicU32, Ordering};
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

type Hr = i32;
const E_POINTER: Hr = 0x80004003u32 as i32;
const E_NOINTERFACE: Hr = 0x80004002u32 as i32;
const E_NOTIMPL: Hr = 0x80004001u32 as i32;
const DV_E_FORMATETC: Hr = 0x80040064u32 as i32;
const OLE_E_ADVISENOTSUPPORTED: Hr = 0x80040003u32 as i32;
const DROP: Hr = 0x00040100;
const CANCEL: Hr = 0x00040101;

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq)]
struct Guid {
    a: u32,
    b: u16,
    c: u16,
    d: [u8; 8],
}
const fn iid(a: u32) -> Guid {
    Guid {
        a,
        b: 0,
        c: 0,
        d: [0xc0, 0, 0, 0, 0, 0, 0, 0x46],
    }
}
const UNKNOWN: Guid = iid(0);
const DATA_OBJECT: Guid = iid(0x10e);
const ENUM_FORMAT: Guid = iid(0x103);
const DROP_SOURCE: Guid = iid(0x121);

#[repr(C)]
#[derive(Clone, Copy)]
struct Format {
    format: u16,
    target: *mut c_void,
    aspect: u32,
    index: i32,
    medium: u32,
}
impl Format {
    fn new(format: u16) -> Self {
        Self {
            format,
            target: null_mut(),
            aspect: 1,
            index: -1,
            medium: 1,
        }
    }
}
#[repr(C)]
struct Medium {
    kind: u32,
    handle: *mut c_void,
    release: *mut c_void,
}
#[repr(C)]
struct UnknownVtable {
    query: unsafe extern "system" fn(*mut c_void, *const Guid, *mut *mut c_void) -> Hr,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
}
#[repr(C)]
struct DataVtable {
    unknown: UnknownVtable,
    get: unsafe extern "system" fn(*mut c_void, *const Format, *mut Medium) -> Hr,
    get_here: unsafe extern "system" fn(*mut c_void, *const Format, *mut Medium) -> Hr,
    query_get: unsafe extern "system" fn(*mut c_void, *const Format) -> Hr,
    canonical: unsafe extern "system" fn(*mut c_void, *const Format, *mut Format) -> Hr,
    set: unsafe extern "system" fn(*mut c_void, *const Format, *const Medium, i32) -> Hr,
    enumerate: unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> Hr,
    advise: unsafe extern "system" fn(*mut c_void, *const Format, u32, *mut c_void, *mut u32) -> Hr,
    unadvise: unsafe extern "system" fn(*mut c_void, u32) -> Hr,
    enum_advise: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> Hr,
}
#[repr(C)]
struct Data {
    vtable: *const DataVtable,
    refs: AtomicU32,
    payloads: Vec<(u16, Vec<u8>)>,
}

unsafe extern "system" fn data_query(p: *mut c_void, id: *const Guid, out: *mut *mut c_void) -> Hr {
    if id.is_null() || out.is_null() {
        return E_POINTER;
    }
    *out = null_mut();
    if *id != UNKNOWN && *id != DATA_OBJECT {
        return E_NOINTERFACE;
    }
    *out = p;
    data_add(p);
    0
}
unsafe extern "system" fn data_add(p: *mut c_void) -> u32 {
    (*(p as *mut Data)).refs.fetch_add(1, Ordering::Relaxed) + 1
}
unsafe extern "system" fn data_release(p: *mut c_void) -> u32 {
    let remaining = (*(p as *mut Data)).refs.fetch_sub(1, Ordering::AcqRel) - 1;
    if remaining == 0 {
        drop(Box::from_raw(p as *mut Data));
    }
    remaining
}
unsafe extern "system" fn data_query_get(p: *mut c_void, f: *const Format) -> Hr {
    if f.is_null() {
        return E_POINTER;
    }
    let f = &*f;
    if f.aspect != 1 || f.index != -1 || f.medium & 1 == 0 {
        return DV_E_FORMATETC;
    }
    if (*(p as *mut Data))
        .payloads
        .iter()
        .any(|(format, _)| *format == f.format)
    {
        0
    } else {
        DV_E_FORMATETC
    }
}
unsafe extern "system" fn data_get(p: *mut c_void, f: *const Format, out: *mut Medium) -> Hr {
    if out.is_null() {
        return E_POINTER;
    }
    *out = Medium {
        kind: 0,
        handle: null_mut(),
        release: null_mut(),
    };
    let result = data_query_get(p, f);
    if result != 0 {
        return result;
    }
    let Some((_, bytes)) = (*(p as *mut Data))
        .payloads
        .iter()
        .find(|(format, _)| *format == (*f).format)
    else {
        return DV_E_FORMATETC;
    };
    let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
    if handle.is_null() {
        return 0x8007000eu32 as i32;
    }
    let memory = GlobalLock(handle);
    if memory.is_null() {
        GlobalFree(handle);
        return 0x8007000eu32 as i32;
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), memory as *mut u8, bytes.len());
    GlobalUnlock(handle);
    *out = Medium {
        kind: 1,
        handle,
        release: null_mut(),
    };
    0
}
unsafe extern "system" fn get_here(_: *mut c_void, _: *const Format, _: *mut Medium) -> Hr {
    E_NOTIMPL
}
unsafe extern "system" fn canonical(_: *mut c_void, _: *const Format, out: *mut Format) -> Hr {
    if out.is_null() {
        return E_POINTER;
    }
    (*out).target = null_mut();
    E_NOTIMPL
}
unsafe extern "system" fn set(_: *mut c_void, _: *const Format, _: *const Medium, _: i32) -> Hr {
    E_NOTIMPL
}
unsafe extern "system" fn advise(
    _: *mut c_void,
    _: *const Format,
    _: u32,
    _: *mut c_void,
    _: *mut u32,
) -> Hr {
    OLE_E_ADVISENOTSUPPORTED
}
unsafe extern "system" fn unadvise(_: *mut c_void, _: u32) -> Hr {
    OLE_E_ADVISENOTSUPPORTED
}
unsafe extern "system" fn enum_advise(_: *mut c_void, out: *mut *mut c_void) -> Hr {
    if !out.is_null() {
        *out = null_mut();
    }
    OLE_E_ADVISENOTSUPPORTED
}
unsafe extern "system" fn enumerate(p: *mut c_void, direction: u32, out: *mut *mut c_void) -> Hr {
    if out.is_null() {
        return E_POINTER;
    }
    *out = null_mut();
    if direction != 1 {
        return E_NOTIMPL;
    }
    *out = make_enum(
        (*(p as *mut Data))
            .payloads
            .iter()
            .map(|(format, _)| Format::new(*format))
            .collect(),
        0,
    );
    0
}
static DATA_VTABLE: DataVtable = DataVtable {
    unknown: UnknownVtable {
        query: data_query,
        add_ref: data_add,
        release: data_release,
    },
    get: data_get,
    get_here,
    query_get: data_query_get,
    canonical,
    set,
    enumerate,
    advise,
    unadvise,
    enum_advise,
};

#[repr(C)]
struct EnumVtable {
    unknown: UnknownVtable,
    next: unsafe extern "system" fn(*mut c_void, u32, *mut Format, *mut u32) -> Hr,
    skip: unsafe extern "system" fn(*mut c_void, u32) -> Hr,
    reset: unsafe extern "system" fn(*mut c_void) -> Hr,
    clone: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> Hr,
}
#[repr(C)]
struct Enumerator {
    vtable: *const EnumVtable,
    refs: AtomicU32,
    formats: Vec<Format>,
    cursor: usize,
}
fn make_enum(formats: Vec<Format>, cursor: usize) -> *mut c_void {
    Box::into_raw(Box::new(Enumerator {
        vtable: &ENUM_VTABLE,
        refs: AtomicU32::new(1),
        formats,
        cursor,
    })) as _
}
unsafe extern "system" fn enum_query(p: *mut c_void, id: *const Guid, out: *mut *mut c_void) -> Hr {
    if id.is_null() || out.is_null() {
        return E_POINTER;
    }
    *out = null_mut();
    if *id != UNKNOWN && *id != ENUM_FORMAT {
        return E_NOINTERFACE;
    }
    *out = p;
    enum_add(p);
    0
}
unsafe extern "system" fn enum_add(p: *mut c_void) -> u32 {
    (*(p as *mut Enumerator))
        .refs
        .fetch_add(1, Ordering::Relaxed)
        + 1
}
unsafe extern "system" fn enum_release(p: *mut c_void) -> u32 {
    let remaining = (*(p as *mut Enumerator))
        .refs
        .fetch_sub(1, Ordering::AcqRel)
        - 1;
    if remaining == 0 {
        drop(Box::from_raw(p as *mut Enumerator));
    }
    remaining
}
unsafe extern "system" fn enum_next(
    p: *mut c_void,
    count: u32,
    out: *mut Format,
    fetched: *mut u32,
) -> Hr {
    if out.is_null() || (count != 1 && fetched.is_null()) {
        return E_POINTER;
    }
    let e = &mut *(p as *mut Enumerator);
    let take = (count as usize).min(e.formats.len() - e.cursor);
    for i in 0..take {
        *out.add(i) = e.formats[e.cursor + i];
    }
    e.cursor += take;
    if !fetched.is_null() {
        *fetched = take as u32;
    }
    if take == count as usize {
        0
    } else {
        1
    }
}
unsafe extern "system" fn enum_skip(p: *mut c_void, count: u32) -> Hr {
    let e = &mut *(p as *mut Enumerator);
    let remaining = e.formats.len() - e.cursor;
    e.cursor += (count as usize).min(remaining);
    if count as usize <= remaining {
        0
    } else {
        1
    }
}
unsafe extern "system" fn enum_reset(p: *mut c_void) -> Hr {
    (*(p as *mut Enumerator)).cursor = 0;
    0
}
unsafe extern "system" fn enum_clone(p: *mut c_void, out: *mut *mut c_void) -> Hr {
    if out.is_null() {
        return E_POINTER;
    }
    let e = &*(p as *mut Enumerator);
    *out = make_enum(e.formats.clone(), e.cursor);
    0
}
static ENUM_VTABLE: EnumVtable = EnumVtable {
    unknown: UnknownVtable {
        query: enum_query,
        add_ref: enum_add,
        release: enum_release,
    },
    next: enum_next,
    skip: enum_skip,
    reset: enum_reset,
    clone: enum_clone,
};

#[repr(C)]
struct SourceVtable {
    unknown: UnknownVtable,
    continue_drag: unsafe extern "system" fn(*mut c_void, i32, u32) -> Hr,
    feedback: unsafe extern "system" fn(*mut c_void, u32) -> Hr,
}
#[repr(C)]
struct Source {
    vtable: *const SourceVtable,
    refs: AtomicU32,
}
unsafe extern "system" fn source_query(
    p: *mut c_void,
    id: *const Guid,
    out: *mut *mut c_void,
) -> Hr {
    if id.is_null() || out.is_null() {
        return E_POINTER;
    }
    *out = null_mut();
    if *id != UNKNOWN && *id != DROP_SOURCE {
        return E_NOINTERFACE;
    }
    *out = p;
    source_add(p);
    0
}
unsafe extern "system" fn source_add(p: *mut c_void) -> u32 {
    (*(p as *mut Source)).refs.fetch_add(1, Ordering::Relaxed) + 1
}
unsafe extern "system" fn source_release(p: *mut c_void) -> u32 {
    let remaining = (*(p as *mut Source)).refs.fetch_sub(1, Ordering::AcqRel) - 1;
    if remaining == 0 {
        drop(Box::from_raw(p as *mut Source));
    }
    remaining
}
unsafe extern "system" fn continue_drag(_: *mut c_void, escape: i32, keys: u32) -> Hr {
    if escape != 0 {
        CANCEL
    } else if keys & 1 == 0 {
        DROP
    } else {
        0
    }
}
unsafe extern "system" fn feedback(_: *mut c_void, _: u32) -> Hr {
    0x00040102
}
static SOURCE_VTABLE: SourceVtable = SourceVtable {
    unknown: UnknownVtable {
        query: source_query,
        add_ref: source_add,
        release: source_release,
    },
    continue_drag,
    feedback,
};

#[link(name = "ole32")]
extern "system" {
    fn OleInitialize(reserved: *const c_void) -> Hr;
    fn OleUninitialize();
    fn DoDragDrop(data: *mut c_void, source: *mut c_void, effects: u32, effect: *mut u32) -> Hr;
    fn CoTaskMemFree(memory: *const c_void);
}

#[repr(C)]
struct BrowseInfo {
    owner: *mut c_void,
    root: *const c_void,
    display: *mut u16,
    title: *const u16,
    flags: u32,
    callback: *const c_void,
    param: isize,
    image: i32,
}
#[link(name = "shell32")]
extern "system" {
    fn SHBrowseForFolderW(info: *const BrowseInfo) -> *mut c_void;
    fn SHGetPathFromIDListEx(id: *const c_void, path: *mut u16, size: u32, flags: u32) -> i32;
}

pub fn launch_screen_snip() -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN, VK_SHIFT,
    };
    // Use Windows' documented interactive snipping shortcut. The URI callback
    // protocol requires MSIX identity; this NSIS application has none.
    let key = |code, up| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [
        key(VK_LWIN, false),
        key(VK_SHIFT, false),
        key(0x53, false),
        key(0x53, true),
        key(VK_SHIFT, true),
        key(VK_LWIN, true),
    ];
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent != inputs.len() as u32 {
        Err("Windows blocked the screen snipping shortcut".into())
    } else {
        Ok(())
    }
}

pub fn choose_folder(owner: isize) -> Result<Option<PathBuf>, String> {
    unsafe {
        let initialized = OleInitialize(null());
        if initialized < 0 {
            return Err("Could not initialize the folder picker".into());
        }
        let title: Vec<u16> = "Choose a folder to export selected clips\0"
            .encode_utf16()
            .collect();
        let mut display = vec![0u16; 32768];
        let info = BrowseInfo {
            owner: owner as _,
            root: null(),
            display: display.as_mut_ptr(),
            title: title.as_ptr(),
            flags: 0x41,
            callback: null(),
            param: 0,
            image: 0,
        };
        let id = SHBrowseForFolderW(&info);
        if id.is_null() {
            OleUninitialize();
            return Ok(None);
        }
        let mut path = vec![0u16; 32768];
        let valid = SHGetPathFromIDListEx(id, path.as_mut_ptr(), path.len() as u32, 0);
        CoTaskMemFree(id);
        OleUninitialize();
        if valid == 0 {
            return Err("The selected location is not a filesystem folder".into());
        }
        let end = path.iter().position(|c| *c == 0).unwrap_or(path.len());
        Ok(Some(PathBuf::from(String::from_utf16_lossy(&path[..end]))))
    }
}

fn wide_bytes(text: &str) -> Vec<u8> {
    text.encode_utf16()
        .chain(Some(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}
fn drop_files(paths: &[PathBuf]) -> Vec<u8> {
    // DROPFILES: pFiles, POINT x/y, fNC, fWide; followed by double-NUL paths.
    let mut bytes = vec![0; 20];
    bytes[0..4].copy_from_slice(&20u32.to_le_bytes());
    bytes[16..20].copy_from_slice(&1u32.to_le_bytes());
    for path in paths {
        bytes.extend(wide_bytes(&path.to_string_lossy()));
    }
    bytes.extend([0, 0]);
    bytes
}

pub struct DragPayload(Vec<(u16, Vec<u8>)>);

/// Performs filesystem and image work on a background worker before the OLE loop.
pub fn prepare_payload(paths: &[PathBuf], text: Option<String>) -> Result<DragPayload, String> {
    let mut payloads = Vec::new();
    if !paths.is_empty() {
        payloads.push((15, drop_files(paths)));
    }
    if paths.len() == 1
        && paths[0]
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("png"))
    {
        let png = std::fs::read(&paths[0]).map_err(|e| e.to_string())?;
        let img = crate::storage::blob::decode_image(&png)
            .map_err(|e| e.to_string())?
            .to_rgba8();
        let mut dib = vec![0u8; 124];
        dib[0..4].copy_from_slice(&124u32.to_le_bytes());
        dib[4..8].copy_from_slice(&(img.width() as i32).to_le_bytes());
        dib[8..12].copy_from_slice(&(-(img.height() as i32)).to_le_bytes());
        dib[12..14].copy_from_slice(&1u16.to_le_bytes());
        dib[14..16].copy_from_slice(&32u16.to_le_bytes());
        dib[16..20].copy_from_slice(&3u32.to_le_bytes());
        dib[20..24].copy_from_slice(&(img.as_raw().len() as u32).to_le_bytes());
        for (offset, mask) in [
            (40, 0x00ff0000u32),
            (44, 0x0000ff00),
            (48, 0x000000ff),
            (52, 0xff000000),
            (56, 0x73524742),
        ] {
            dib[offset..offset + 4].copy_from_slice(&mask.to_le_bytes());
        }
        for pixel in img.pixels() {
            dib.extend([pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        payloads.push((17, dib));
        let format_name: Vec<u16> = "PNG\0".encode_utf16().collect();
        let format = unsafe {
            windows_sys::Win32::System::DataExchange::RegisterClipboardFormatW(format_name.as_ptr())
        };
        if format != 0 {
            payloads.push((format as u16, png));
        }
    }
    if let Some(text) = text {
        payloads.push((13, wide_bytes(&text)));
    }
    if payloads.is_empty() {
        return Err("Select a clip to drag".into());
    }
    Ok(DragPayload(payloads))
}

/// Must run on the window's STA thread while the initiating mouse button is held.
pub fn start_drag(payload: DragPayload) -> Result<bool, String> {
    unsafe {
        if windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(1) >= 0 {
            return Ok(false);
        }
        let initialized = OleInitialize(null());
        if initialized < 0 {
            return Err(format!(
                "OLE initialization failed: 0x{:08x}",
                initialized as u32
            ));
        }
        let data = Box::into_raw(Box::new(Data {
            vtable: &DATA_VTABLE,
            refs: AtomicU32::new(1),
            payloads: payload.0,
        })) as *mut c_void;
        let source = Box::into_raw(Box::new(Source {
            vtable: &SOURCE_VTABLE,
            refs: AtomicU32::new(1),
        })) as *mut c_void;
        let mut effect = 0;
        let result = DoDragDrop(data, source, 1, &mut effect); // Copy only: never delete history.
        data_release(data);
        source_release(source);
        OleUninitialize();
        if result < 0 {
            Err(format!("Native drag failed: 0x{:08x}", result as u32))
        } else {
            Ok(result == DROP && effect != 0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn text_drag_does_not_advertise_a_file_attachment() {
        let payload = prepare_payload(&[], Some("Hello 雪".into())).unwrap();
        assert_eq!(payload.0.len(), 1);
        assert_eq!(payload.0[0], (13, wide_bytes("Hello 雪")));
        assert!(prepare_payload(&[], None).is_err());
    }
    #[test]
    fn ole_data_object_serves_unicode_text_and_multiple_file_paths() {
        let paths = vec![PathBuf::from("F:\\one.png"), PathBuf::from("F:\\two.png")];
        let bytes = drop_files(&paths);
        assert_eq!(&bytes[..4], &20u32.to_le_bytes());
        let names: Vec<u16> = bytes[20..]
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        assert_eq!(
            String::from_utf16_lossy(&names),
            "F:\\one.png\0F:\\two.png\0\0"
        );
        unsafe {
            let object = Box::into_raw(Box::new(Data {
                vtable: &DATA_VTABLE,
                refs: AtomicU32::new(1),
                payloads: vec![(13, wide_bytes("雪❄"))],
            })) as *mut c_void;
            let mut medium = Medium {
                kind: 0,
                handle: null_mut(),
                release: null_mut(),
            };
            assert_eq!(data_get(object, &Format::new(13), &mut medium), 0);
            let p = GlobalLock(medium.handle);
            let content = std::slice::from_raw_parts(p as *const u16, 3);
            assert_eq!(String::from_utf16_lossy(content), "雪❄\0");
            GlobalUnlock(medium.handle);
            GlobalFree(medium.handle);
            data_release(object);
        }
    }
}
