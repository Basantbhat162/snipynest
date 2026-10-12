use std::io::Cursor;
use std::thread::sleep;
use std::time::Duration;

use image::ImageFormat;
use windows_sys::Win32::Foundation::{CloseHandle, GlobalFree, HANDLE, HGLOBAL, HWND};
use windows_sys::Win32::Graphics::Gdi::{BITMAPINFOHEADER, BITMAPV5HEADER, BI_BITFIELDS};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardOwner,
    IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};

pub const CF_TEXT: u32 = 1;
pub const CF_BITMAP: u32 = 2;
pub const CF_DIB: u32 = 8;
pub const CF_UNICODETEXT: u32 = 13;
pub const CF_HDROP: u32 = 15;
pub const CF_DIBV5: u32 = 17;

pub struct ClipboardItem {
    pub text: Option<String>,
    pub image_png: Option<Vec<u8>>,
    pub source_app: Option<String>,
    pub source_title: Option<String>,
}

/// Safely open clipboard with retry loop to handle external process locks
pub fn open_clipboard_with_retry(hwnd: HWND, max_retries: usize) -> bool {
    for attempt in 0..=max_retries {
        unsafe {
            if OpenClipboard(hwnd) != 0 {
                return true;
            }
        }
        if attempt < max_retries {
            sleep(Duration::from_millis(10 * (1u64 << attempt.min(4))));
        }
    }
    false
}

/// Check if clipboard content is flagged as sensitive (password managers)
pub fn is_clipboard_ignored() -> bool {
    let ignore_name: Vec<u16> = "Clipboard Viewer Ignore\0".encode_utf16().collect();
    let exclude_name: Vec<u16> = "ExcludeClipboardContentFromMonitor\0"
        .encode_utf16()
        .collect();

    unsafe {
        let fmt1 = RegisterClipboardFormatW(ignore_name.as_ptr());
        let fmt2 = RegisterClipboardFormatW(exclude_name.as_ptr());

        (fmt1 != 0 && IsClipboardFormatAvailable(fmt1) != 0)
            || (fmt2 != 0 && IsClipboardFormatAvailable(fmt2) != 0)
    }
}

/// Query active foreground window title and real executable name
pub fn get_foreground_app_info() -> (Option<String>, Option<String>) {
    get_window_app_info(unsafe { GetForegroundWindow() })
}

fn get_window_app_info(hwnd: HWND) -> (Option<String>, Option<String>) {
    unsafe {
        if hwnd.is_null() {
            return (None, None);
        }

        // Get window title
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 512);
        let title = if len > 0 {
            Some(String::from_utf16_lossy(&title_buf[..len as usize]))
        } else {
            None
        };

        // Get process ID
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);

        let app_name = if process_id != 0 {
            let mut resolved_name = None;
            let process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if !process_handle.is_null() {
                let mut path_buf = [0u16; 1024];
                let mut size = 1024u32;
                if QueryFullProcessImageNameW(process_handle, 0, path_buf.as_mut_ptr(), &mut size)
                    != 0
                    && size > 0
                {
                    let full_path = String::from_utf16_lossy(&path_buf[..size as usize]);
                    if let Some(file_name) = std::path::Path::new(&full_path).file_name() {
                        resolved_name = Some(file_name.to_string_lossy().to_string());
                    } else {
                        resolved_name = Some(full_path);
                    }
                }
                CloseHandle(process_handle);
            }
            resolved_name.or_else(|| Some(format!("PID:{}", process_id)))
        } else {
            None
        };

        (app_name, title)
    }
}

/// Read current clipboard content (text or image)
pub fn read_clipboard_content() -> Option<ClipboardItem> {
    if !open_clipboard_with_retry(std::ptr::null_mut(), 5) {
        return None;
    }

    if is_clipboard_ignored() {
        unsafe {
            CloseClipboard();
        }
        return None;
    }
    let owner = unsafe { GetClipboardOwner() };
    let (source_app, source_title) = if owner.is_null() {
        get_foreground_app_info()
    } else {
        get_window_app_info(owner)
    };
    let mut item = None;

    unsafe {
        // Security Invariant: Respect CanIncludeInClipboardHistory == 0 (password managers)
        let can_include_name: Vec<u16> = "CanIncludeInClipboardHistory\0".encode_utf16().collect();
        let fmt_history = RegisterClipboardFormatW(can_include_name.as_ptr());
        if fmt_history != 0 && IsClipboardFormatAvailable(fmt_history) != 0 {
            let handle = GetClipboardData(fmt_history);
            if !handle.is_null() {
                let ptr = GlobalLock(handle as HGLOBAL);
                if !ptr.is_null() {
                    let size = GlobalSize(handle as HGLOBAL);
                    if size >= 4 {
                        let val = *(ptr as *const u32);
                        GlobalUnlock(handle as HGLOBAL);
                        if val == 0 {
                            CloseClipboard();
                            return None;
                        }
                    } else {
                        GlobalUnlock(handle as HGLOBAL);
                    }
                }
            }
        }

        // Priority 1: Check for registered PNG ("image/png" for Chrome/Brave/Edge and "PNG" for Office/Photoshop)
        let png_fmt_names = ["image/png\0", "PNG\0"];
        for name in &png_fmt_names {
            if item.is_some() {
                break;
            }
            let wide_name: Vec<u16> = name.encode_utf16().collect();
            let cf_png = RegisterClipboardFormatW(wide_name.as_ptr());
            if cf_png != 0 && IsClipboardFormatAvailable(cf_png) != 0 {
                let handle = GetClipboardData(cf_png);
                if !handle.is_null() {
                    let ptr = GlobalLock(handle as HGLOBAL);
                    if !ptr.is_null() {
                        let size = GlobalSize(handle as HGLOBAL);
                        let slice = std::slice::from_raw_parts(
                            ptr as *const u8,
                            size.min(crate::storage::blob::MAX_ENCODED_IMAGE_BYTES),
                        );
                        // Verify standard PNG magic signature: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A
                        if slice.len() > 8
                            && slice.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
                        {
                            let clean_bytes = slice.to_vec();

                            item = Some(ClipboardItem {
                                text: None,
                                image_png: Some(clean_bytes),
                                source_app: source_app.clone(),
                                source_title: source_title.clone(),
                            });
                        }
                        GlobalUnlock(handle as HGLOBAL);
                    }
                }
            }
        }

        // Priority 2: Check CF_DIBV5 (32-bit alpha direct pixel extraction) or standard CF_DIB
        if item.is_none() && IsClipboardFormatAvailable(CF_DIBV5) != 0 {
            let handle = GetClipboardData(CF_DIBV5);
            if !handle.is_null() {
                let ptr = GlobalLock(handle as HGLOBAL);
                if !ptr.is_null() {
                    let size = GlobalSize(handle as HGLOBAL);
                    let header_min = std::mem::size_of::<BITMAPV5HEADER>();
                    if size >= header_min {
                        let v5 = &*(ptr as *const BITMAPV5HEADER);
                        let bi_size = v5.bV5Size as usize;
                        let width = v5.bV5Width;
                        let height = v5.bV5Height;
                        let bit_count = v5.bV5BitCount;

                        if bit_count == 32
                            && width > 0
                            && height != 0
                            && bi_size >= header_min
                            && bi_size <= size
                            && (width as u64) * (height.unsigned_abs() as u64) <= 32_000_000
                        {
                            let u_width = width as u32;
                            let u_height = height.unsigned_abs();
                            let pixel_data_len = (u_width as usize) * (u_height as usize) * 4;
                            if size >= bi_size + pixel_data_len {
                                let pixels_ptr = (ptr as *const u8).add(bi_size);
                                let is_bottom_up = height > 0;
                                let mut rgba_img = image::RgbaImage::new(u_width, u_height);
                                let mut has_non_zero_alpha = false;

                                for y in 0..u_height {
                                    let src_y = if is_bottom_up { u_height - 1 - y } else { y };
                                    let row_offset = (src_y as usize) * (u_width as usize) * 4;
                                    for x in 0..u_width {
                                        let px_offset = row_offset + (x as usize) * 4;
                                        let b = *pixels_ptr.add(px_offset);
                                        let g = *pixels_ptr.add(px_offset + 1);
                                        let r = *pixels_ptr.add(px_offset + 2);
                                        let a = *pixels_ptr.add(px_offset + 3);
                                        if a > 0 {
                                            has_non_zero_alpha = true;
                                        }
                                        rgba_img.put_pixel(x, y, image::Rgba([r, g, b, a]));
                                    }
                                }

                                // If legacy Windows producer left all alpha bytes as 0, make opaque
                                if !has_non_zero_alpha && v5.bV5AlphaMask == 0 {
                                    for pixel in rgba_img.pixels_mut() {
                                        pixel[3] = 255;
                                    }
                                }

                                let mut png_bytes = Vec::new();
                                if rgba_img
                                    .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
                                    .is_ok()
                                {
                                    item = Some(ClipboardItem {
                                        text: None,
                                        image_png: Some(png_bytes),
                                        source_app: source_app.clone(),
                                        source_title: source_title.clone(),
                                    });
                                }
                            }
                        }
                    }
                    GlobalUnlock(handle as HGLOBAL);
                }
            }
        }

        // Priority 2b: Check standard CF_DIB (40-byte BITMAPINFOHEADER BMP fallback)
        if item.is_none() && IsClipboardFormatAvailable(CF_DIB) != 0 {
            let handle = GetClipboardData(CF_DIB);
            if !handle.is_null() {
                let ptr = GlobalLock(handle as HGLOBAL);
                if !ptr.is_null() {
                    let size = GlobalSize(handle as HGLOBAL);
                    let dib_slice = std::slice::from_raw_parts(
                        ptr as *const u8,
                        size.min(crate::storage::blob::MAX_ENCODED_IMAGE_BYTES),
                    );

                    if size >= std::mem::size_of::<BITMAPINFOHEADER>() {
                        let header = &*(ptr as *const BITMAPINFOHEADER);
                        let bi_size = header.biSize;
                        let clr_used = header.biClrUsed;
                        let bit_count = header.biBitCount;

                        let palette_size = if clr_used > 0 {
                            clr_used.saturating_mul(4) as usize
                        } else if bit_count <= 8 {
                            ((1 << bit_count) * 4) as usize
                        } else {
                            0
                        };

                        let off_bits = 14 + bi_size as usize + palette_size;
                        let file_size = 14 + dib_slice.len();

                        let mut bmp_bytes = Vec::with_capacity(file_size);
                        bmp_bytes.extend_from_slice(b"BM");
                        bmp_bytes.extend_from_slice(&(file_size as u32).to_le_bytes());
                        bmp_bytes.extend_from_slice(&[0, 0, 0, 0]); // Reserved
                        bmp_bytes.extend_from_slice(&(off_bits as u32).to_le_bytes());
                        bmp_bytes.extend_from_slice(dib_slice);

                        if let Ok(img) = crate::storage::blob::decode_image(&bmp_bytes) {
                            let mut png_bytes = Vec::new();
                            if img
                                .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
                                .is_ok()
                            {
                                item = Some(ClipboardItem {
                                    text: None,
                                    image_png: Some(png_bytes),
                                    source_app: source_app.clone(),
                                    source_title: source_title.clone(),
                                });
                            }
                        }
                    }

                    GlobalUnlock(handle as HGLOBAL);
                }
            }
        }

        // Priority 3: Check for Unicode Text (CF_UNICODETEXT)
        if item.is_none() && IsClipboardFormatAvailable(CF_UNICODETEXT) != 0 {
            let handle = GetClipboardData(CF_UNICODETEXT);
            if !handle.is_null() {
                let ptr = GlobalLock(handle as HGLOBAL);
                if !ptr.is_null() {
                    let wide_ptr = ptr as *const u16;
                    let mut len = 0;
                    let max_len = (GlobalSize(handle as HGLOBAL) / 2).min(2 * 1024 * 1024);
                    while len < max_len && *wide_ptr.add(len) != 0 {
                        len += 1;
                    }

                    let slice = std::slice::from_raw_parts(wide_ptr, len);
                    let text = String::from_utf16_lossy(slice);

                    GlobalUnlock(handle as HGLOBAL);

                    if !text.trim().is_empty() {
                        item = Some(ClipboardItem {
                            text: Some(text),
                            image_png: None,
                            source_app,
                            source_title,
                        });
                    }
                }
            }
        }

        CloseClipboard();
    }

    item
}

// A clipboard writer must own its HWND. Using the foreground application's
// HWND can block on that application and gives clipboard updates the wrong owner.
struct ClipboardOwner(HWND);
impl ClipboardOwner {
    fn new() -> Self {
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{CreateWindowExW, HWND_MESSAGE};
            let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
            Self(CreateWindowExW(
                0,
                class.as_ptr(),
                std::ptr::null(),
                0,
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            ))
        }
    }
}
impl Drop for ClipboardOwner {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::DestroyWindow(self.0);
            }
        }
    }
}
unsafe fn mark_own_clipboard() {
    let name: Vec<u16> = "Clipboard Viewer Ignore\0".encode_utf16().collect();
    let format = RegisterClipboardFormatW(name.as_ptr());
    let handle = GlobalAlloc(GMEM_MOVEABLE, 4);
    if format != 0 && !handle.is_null() {
        let ptr = GlobalLock(handle);
        if !ptr.is_null() {
            *(ptr as *mut u32) = 1;
            GlobalUnlock(handle);
        }
        if SetClipboardData(format, handle as HANDLE).is_null() {
            GlobalFree(handle);
        }
    }
}

/// Set Unicode text to the Windows clipboard
pub fn set_clipboard_text(text: &str) -> bool {
    let owner = ClipboardOwner::new();
    if owner.0.is_null() || !open_clipboard_with_retry(owner.0, 5) {
        return false;
    }

    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes_len = wide.len() * 2;
    let mut success = false;

    unsafe {
        EmptyClipboard();

        let h_mem = GlobalAlloc(GMEM_MOVEABLE, bytes_len);
        if !h_mem.is_null() {
            let ptr = GlobalLock(h_mem);
            if !ptr.is_null() {
                std::ptr::copy_nonoverlapping(
                    wide.as_ptr() as *const u8,
                    ptr as *mut u8,
                    bytes_len,
                );
                GlobalUnlock(h_mem);
                if !SetClipboardData(CF_UNICODETEXT, h_mem as HANDLE).is_null() {
                    success = true;
                } else {
                    GlobalFree(h_mem);
                }
            } else {
                GlobalFree(h_mem);
            }
        }

        if success {
            mark_own_clipboard();
        }
        CloseClipboard();
    }

    success
}

/// Set image to Windows clipboard supporting registered PNG, CF_DIBV5, and CF_DIB
pub fn set_clipboard_image(bytes: &[u8]) -> bool {
    let Ok(decoded) = crate::storage::blob::decode_image(bytes) else {
        return false;
    };
    let owner = ClipboardOwner::new();
    if owner.0.is_null() || !open_clipboard_with_retry(owner.0, 5) {
        return false;
    }

    let mut set_any = false;

    unsafe {
        EmptyClipboard();

        // 1. Registered "PNG" format (preserves alpha channel and full PNG compression for modern apps)
        let png_fmt_name: Vec<u16> = "PNG\0".encode_utf16().collect();
        let cf_png = RegisterClipboardFormatW(png_fmt_name.as_ptr());
        if cf_png != 0 {
            let h_png = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            if !h_png.is_null() {
                let ptr = GlobalLock(h_png);
                if !ptr.is_null() {
                    std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr as *mut u8, bytes.len());
                    GlobalUnlock(h_png);
                    if !SetClipboardData(cf_png, h_png as HANDLE).is_null() {
                        set_any = true;
                    } else {
                        GlobalFree(h_png);
                    }
                } else {
                    GlobalFree(h_png);
                }
            }
        }

        // 2. CF_DIBV5 format (for 32-bit alpha support and native Windows pasting)
        {
            let img = decoded;
            let rgba = img.to_rgba8();
            let width = rgba.width();
            let height = rgba.height();

            let header_size = std::mem::size_of::<BITMAPV5HEADER>();
            let pixel_bytes_len = (width as usize) * (height as usize) * 4;
            let total_size = header_size + pixel_bytes_len;

            let h_dibv5 = GlobalAlloc(GMEM_MOVEABLE, total_size);
            if !h_dibv5.is_null() {
                let ptr = GlobalLock(h_dibv5);
                if !ptr.is_null() {
                    let mut v5: BITMAPV5HEADER = std::mem::zeroed();
                    v5.bV5Size = header_size as u32;
                    v5.bV5Width = width as i32;
                    v5.bV5Height = height as i32; // Bottom-up DIB
                    v5.bV5Planes = 1;
                    v5.bV5BitCount = 32;
                    v5.bV5Compression = BI_BITFIELDS;
                    v5.bV5SizeImage = pixel_bytes_len as u32;
                    v5.bV5RedMask = 0x00FF0000;
                    v5.bV5GreenMask = 0x0000FF00;
                    v5.bV5BlueMask = 0x000000FF;
                    v5.bV5AlphaMask = 0xFF000000;
                    v5.bV5CSType = 0x73524742; // 'sRGB'

                    std::ptr::copy_nonoverlapping(
                        &v5 as *const _ as *const u8,
                        ptr as *mut u8,
                        header_size,
                    );

                    let dest_pixels = (ptr as *mut u8).add(header_size);
                    let raw_rgba = rgba.as_raw();

                    // Windows DIBs are bottom-up: rows ordered from height-1 down to 0
                    for y in 0..height {
                        let src_row = (height - 1 - y) as usize;
                        let src_offset = src_row * (width as usize) * 4;
                        let dest_offset = (y as usize) * (width as usize) * 4;

                        for x in 0..(width as usize) {
                            let src_px = src_offset + x * 4;
                            let dest_px = dest_offset + x * 4;
                            let r = raw_rgba[src_px];
                            let g = raw_rgba[src_px + 1];
                            let b = raw_rgba[src_px + 2];
                            let a = raw_rgba[src_px + 3];

                            // Store in BGRA order
                            *dest_pixels.add(dest_px) = b;
                            *dest_pixels.add(dest_px + 1) = g;
                            *dest_pixels.add(dest_px + 2) = r;
                            *dest_pixels.add(dest_px + 3) = a;
                        }
                    }

                    GlobalUnlock(h_dibv5);
                    if !SetClipboardData(CF_DIBV5, h_dibv5 as HANDLE).is_null() {
                        set_any = true;
                    } else {
                        GlobalFree(h_dibv5);
                    }
                } else {
                    GlobalFree(h_dibv5);
                }
            }

            // Also provide standard CF_DIB as fallback using BMP encoding
            let mut bmp_bytes = Vec::new();
            if img
                .write_to(&mut Cursor::new(&mut bmp_bytes), ImageFormat::Bmp)
                .is_ok()
                && bmp_bytes.len() > 14
            {
                let dib_slice = &bmp_bytes[14..];
                let h_dib = GlobalAlloc(GMEM_MOVEABLE, dib_slice.len());
                if !h_dib.is_null() {
                    let ptr = GlobalLock(h_dib);
                    if !ptr.is_null() {
                        std::ptr::copy_nonoverlapping(
                            dib_slice.as_ptr(),
                            ptr as *mut u8,
                            dib_slice.len(),
                        );
                        GlobalUnlock(h_dib);
                        if !SetClipboardData(CF_DIB, h_dib as HANDLE).is_null() {
                            set_any = true;
                        } else {
                            GlobalFree(h_dib);
                        }
                    } else {
                        GlobalFree(h_dib);
                    }
                }
            }
        }

        if set_any {
            mark_own_clipboard();
        }
        CloseClipboard();
    }

    set_any
}

#[cfg(test)]
mod tests {
    use super::*;

    static CLIPBOARD_TEST_LOCK: parking_lot::Mutex<()> = parking_lot::Mutex::new(());

    #[test]
    #[ignore = "Mutates the live Windows clipboard; run explicitly in a disposable desktop session"]
    fn test_own_text_is_pasteable_but_not_recaptured() {
        let _guard = CLIPBOARD_TEST_LOCK.lock();
        let test_str = format!("omnicopy_test_{}", uuid::Uuid::new_v4());
        assert!(set_clipboard_text(&test_str));
        assert!(unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT) } != 0);
        assert!(
            read_clipboard_content().is_none(),
            "Own copies must not be re-ingested"
        );
    }

    #[test]
    #[ignore = "Mutates the live Windows clipboard; run explicitly in a disposable desktop session"]
    fn test_own_image_is_pasteable_but_not_recaptured() {
        let _guard = CLIPBOARD_TEST_LOCK.lock();
        let img = image::RgbaImage::new(2, 2);
        let mut png_bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .unwrap();

        assert!(set_clipboard_image(&png_bytes));
        assert!(unsafe { IsClipboardFormatAvailable(CF_DIBV5) } != 0);
        assert!(
            read_clipboard_content().is_none(),
            "Own images must not trigger another arrival"
        );
    }

    #[test]
    #[ignore = "Mutates the live Windows clipboard; run explicitly in a disposable desktop session"]
    fn test_clipboard_image_png_mime_roundtrip() {
        let _guard = CLIPBOARD_TEST_LOCK.lock();
        let img = image::RgbaImage::new(3, 3);
        let mut png_bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .unwrap();

        // Write directly with registered "image/png" format (mimicking Chrome / Brave)
        let owner = ClipboardOwner::new();
        assert!(!owner.0.is_null());
        unsafe {
            assert!(open_clipboard_with_retry(owner.0, 5));
            {
                EmptyClipboard();
                let fmt_name: Vec<u16> = "image/png\0".encode_utf16().collect();
                let cf = RegisterClipboardFormatW(fmt_name.as_ptr());
                assert_ne!(cf, 0);

                let h_mem = GlobalAlloc(GMEM_MOVEABLE, png_bytes.len());
                assert!(!h_mem.is_null());
                let ptr = GlobalLock(h_mem);
                std::ptr::copy_nonoverlapping(png_bytes.as_ptr(), ptr as *mut u8, png_bytes.len());
                GlobalUnlock(h_mem);
                assert!(!SetClipboardData(cf, h_mem as HANDLE).is_null());
                CloseClipboard();
            }
        }

        let item = read_clipboard_content();
        assert!(
            item.is_some(),
            "read_clipboard_content should detect image/png"
        );
        let item = item.unwrap();
        assert!(item.image_png.is_some());
        let read_png = item.image_png.unwrap();
        assert!(read_png.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    }
}
