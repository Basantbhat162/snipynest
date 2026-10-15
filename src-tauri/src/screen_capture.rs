use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::Graphics::Gdi::*;
static CAPTURING: AtomicBool = AtomicBool::new(false);
pub struct CaptureGuard;
impl CaptureGuard {
    pub fn begin() -> Result<Self, String> {
        if CAPTURING.swap(true, Ordering::SeqCst) {
            Err("A screen capture is already in progress".into())
        } else {
            Ok(Self)
        }
    }
}
impl Drop for CaptureGuard {
    fn drop(&mut self) {
        CAPTURING.store(false, Ordering::SeqCst);
    }
}
#[derive(Clone, Copy)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}
/// Snapshot the complete monitor under the pointer, including its taskbar.
pub fn monitor_at(cursor: (i32, i32)) -> Result<ScreenRect, String> {
    unsafe {
        let monitor = MonitorFromPoint(
            POINT {
                x: cursor.0,
                y: cursor.1,
            },
            MONITOR_DEFAULTTONEAREST,
        );
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if monitor.is_null() || GetMonitorInfoW(monitor, &mut info) == 0 {
            return Err("Windows could not find the monitor to capture".into());
        }
        Ok(ScreenRect {
            x: info.rcMonitor.left,
            y: info.rcMonitor.top,
            width: info.rcMonitor.right - info.rcMonitor.left,
            height: info.rcMonitor.bottom - info.rcMonitor.top,
        })
    }
}
fn pixel_length(width: i32, height: i32) -> Result<usize, String> {
    if width <= 0 || height <= 0 || (width as u64) * (height as u64) > 32_000_000 {
        return Err("This monitor exceeds the 32 megapixel capture limit".into());
    }
    Ok(width as usize * height as usize * 4)
}
struct GdiCapture {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
}
impl Drop for GdiCapture {
    fn drop(&mut self) {
        unsafe {
            if !self.previous.is_null() {
                SelectObject(self.memory, self.previous);
            }
            if !self.bitmap.is_null() {
                DeleteObject(self.bitmap as _);
            }
            if !self.memory.is_null() {
                DeleteDC(self.memory);
            }
            if !self.screen.is_null() {
                ReleaseDC(std::ptr::null_mut(), self.screen);
            }
        }
    }
}
fn bgra_to_rgba(pixels: &mut [u8]) {
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
}
pub fn capture_png(rect: ScreenRect) -> Result<Vec<u8>, String> {
    let length = pixel_length(rect.width, rect.height)?;
    let mut capture = GdiCapture {
        screen: std::ptr::null_mut(),
        memory: std::ptr::null_mut(),
        bitmap: std::ptr::null_mut(),
        previous: std::ptr::null_mut(),
    };
    unsafe {
        capture.screen = GetDC(std::ptr::null_mut());
        if capture.screen.is_null() {
            return Err("Windows screen capture is unavailable in this session".into());
        }
        capture.memory = CreateCompatibleDC(capture.screen);
        capture.bitmap = CreateCompatibleBitmap(capture.screen, rect.width, rect.height);
        if capture.memory.is_null() || capture.bitmap.is_null() {
            return Err("Windows could not allocate the screen capture".into());
        }
        capture.previous = SelectObject(capture.memory, capture.bitmap as _);
        if capture.previous.is_null() || capture.previous as isize == -1 {
            capture.previous = std::ptr::null_mut();
            return Err("Windows could not prepare the screen capture".into());
        }
        if BitBlt(
            capture.memory,
            0,
            0,
            rect.width,
            rect.height,
            capture.screen,
            rect.x,
            rect.y,
            SRCCOPY | CAPTUREBLT,
        ) == 0
        {
            return Err("Windows could not capture this screen".into());
        }
        SelectObject(capture.memory, capture.previous);
        capture.previous = std::ptr::null_mut();
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = rect.width;
        info.bmiHeader.biHeight = -rect.height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        let mut pixels = vec![0; length];
        if GetDIBits(
            capture.memory,
            capture.bitmap,
            0,
            rect.height as u32,
            pixels.as_mut_ptr() as _,
            &mut info,
            DIB_RGB_COLORS,
        ) != rect.height
        {
            return Err("Windows could not read the screen pixels".into());
        }
        // Pixel transfer is complete; release the native bitmap before PNG encoding.
        drop(capture);
        bgra_to_rgba(&mut pixels);
        let image = image::RgbaImage::from_raw(rect.width as u32, rect.height as u32, pixels)
            .ok_or("Invalid screen dimensions")?;
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        if bytes.len() > crate::storage::blob::MAX_ENCODED_IMAGE_BYTES {
            return Err(
                "This screenshot exceeds the 64 MiB image limit. Use a smaller screen snip.".into(),
            );
        }
        Ok(bytes)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_guard_rejects_reentry_and_releases_on_drop() {
        let first = CaptureGuard::begin().unwrap();
        assert!(CaptureGuard::begin().is_err());
        drop(first);
        assert!(CaptureGuard::begin().is_ok());
    }
    #[test]
    fn capture_dimensions_are_bounded_without_coordinate_assumptions() {
        assert_eq!(pixel_length(3840, 2160).unwrap(), 3840 * 2160 * 4);
        assert!(pixel_length(0, 10).is_err());
        assert!(pixel_length(-1, 10).is_err());
        assert!(pixel_length(i32::MAX, i32::MAX).is_err());
        assert!(pixel_length(8000, 8000).is_err());
    }
    #[test]
    fn screen_pixels_preserve_rgb_and_are_opaque() {
        let mut pixels = [10, 20, 30, 0, 100, 110, 120, 0];
        bgra_to_rgba(&mut pixels);
        assert_eq!(pixels, [30, 20, 10, 255, 120, 110, 100, 255]);
    }
}

#[tauri::command]
pub async fn capture_monitor(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    let _guard = CaptureGuard::begin()?;
    let state = app.state::<crate::AppState>();
    if state.native_drag_active.load(Ordering::Relaxed)
        || state.window_move_active.load(Ordering::Relaxed)
    {
        return Err("Finish the current drag before capturing the screen".into());
    }
    let (send, receive) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            let mut cursor = POINT { x: 0, y: 0 };
            if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut cursor) }
                == 0
            {
                return Err("Windows could not locate the pointer".to_string());
            }
            let rect = monitor_at((cursor.x, cursor.y))?;
            let area = crate::window::monitor_work_area_at((cursor.x, cursor.y));
            if let Some(main) = handle.get_webview_window("main") {
                crate::commands::hide_history_window(&main)?;
            }
            if handle.get_webview_window("capture-pad").is_some() {
                crate::window::hide_pad_native(&handle)?;
            }
            Ok((rect, area))
        })();
        let _ = send.send(result);
    })
    .map_err(|e| e.to_string())?;
    let (rect, area) = tauri::async_runtime::spawn_blocking(move || receive.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Screen preparation did not complete")??;
    let db = state.db.clone();
    let paused = state.capture_paused.clone();
    let arrivals = state.image_arrivals.clone();
    let (clip, copied) = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        let png = capture_png(rect)?;
        let copied = crate::clipboard::win32::set_clipboard_image(&png);
        let clip = if paused.load(Ordering::Relaxed) {
            None
        } else {
            let clip = db
                .insert_image(&png, Some("SnipyNest"), None)
                .map_err(|e| {
                    if copied {
                        format!("Screenshot copied, but history could not save it: {e}")
                    } else {
                        format!("Screenshot could not be copied or saved: {e}")
                    }
                })?;
            // Own clipboard writes are ignored. Remember this explicit capture to avoid replaying restored images.
            arrivals.lock().should_notify(&clip.hash, None);
            Some(clip)
        };
        Ok::<_, String>((clip, copied))
    })
    .await
    .map_err(|e| e.to_string())??;
    let retained = clip.is_some();
    if let Some(clip) = clip {
        let _ = app.emit("new-clip", &clip);
        let handle = app.clone();
        app.run_on_main_thread(move || crate::window::image_arrived(&handle, &clip, area))
            .map_err(|e| e.to_string())?;
    }
    if copied {
        Ok(())
    } else if retained {
        Err("Screenshot saved in history, but the clipboard is busy. Open history and choose Copy again.".into())
    } else {
        Err("The clipboard is busy and monitoring is paused. Retry quick capture.".into())
    }
}
