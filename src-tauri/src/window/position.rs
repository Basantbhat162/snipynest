use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows_sys::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

#[derive(Debug, Clone, Copy)]
pub struct MonitorBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub scale_factor: f64,
}

/// Calculate exact screen coordinates to dock the sidebar flush to the active display edge,
/// dynamically scaling width according to the monitor's effective DPI.
pub fn get_active_monitor_sidebar_bounds(logical_sidebar_width: i32) -> MonitorBounds {
    let mut b = active_monitor_work_area();
    let width = ((logical_sidebar_width as f64 * b.scale_factor).round() as i32).min(b.width);
    b.x += b.width - width;
    b.width = width;
    b
}

pub fn active_monitor_work_area() -> MonitorBounds {
    let mut cursor = POINT { x: 0, y: 0 };
    unsafe {
        GetCursorPos(&mut cursor);
    }
    monitor_work_area_at((cursor.x, cursor.y))
}

pub fn monitor_work_area_at(cursor: (i32, i32)) -> MonitorBounds {
    unsafe {
        let cursor_pt = POINT {
            x: cursor.0,
            y: cursor.1,
        };
        let h_monitor = MonitorFromPoint(cursor_pt, MONITOR_DEFAULTTONEAREST);

        let mut scale_factor = 1.0;
        if !h_monitor.is_null() {
            let mut dpi_x = 96u32;
            let mut dpi_y = 96u32;
            if GetDpiForMonitor(h_monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) == 0
                && dpi_x > 0
            {
                scale_factor = dpi_x as f64 / 96.0;
            }
        }

        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;

        if !h_monitor.is_null() && GetMonitorInfoW(h_monitor, &mut mi) != 0 {
            let work_area = mi.rcWork;
            let work_width = work_area.right - work_area.left;
            let work_height = work_area.bottom - work_area.top;

            let x = work_area.left;
            let y = work_area.top;

            MonitorBounds {
                x,
                y,
                width: work_width,
                height: work_height,
                scale_factor,
            }
        } else {
            // Safe fallback
            MonitorBounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor,
            }
        }
    }
}

pub const PAD_WIDTH: f64 = 216.0;
pub const PAD_HEIGHT: f64 = 112.0;

/// Preserve a user's position on this monitor; follow arrivals to a different one.
pub fn pad_placement(
    area: MonitorBounds,
    previous: Option<(i32, i32, u32, u32)>,
) -> (i32, i32, u32, u32) {
    let width = ((PAD_WIDTH * area.scale_factor).round() as i32)
        .min(area.width)
        .max(1);
    let height = ((PAD_HEIGHT * area.scale_factor).round() as i32)
        .min(area.height)
        .max(1);
    let max_x = (area.x + area.width - width).max(area.x);
    let max_y = (area.y + area.height - height).max(area.y);
    let margin = (16.0 * area.scale_factor).round() as i32;
    let (x, y) = previous
        .filter(|&(x, y, w, h)| {
            let cx = x + w as i32 / 2;
            let cy = y + h as i32 / 2;
            cx >= area.x && cx < area.x + area.width && cy >= area.y && cy < area.y + area.height
        })
        .map(|(x, y, _, _)| (x, y))
        .unwrap_or((max_x - margin, max_y - margin));
    (
        x.clamp(area.x, max_x),
        y.clamp(area.y, max_y),
        width as u32,
        height as u32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pad_follows_three_monitors_with_negative_coordinates_and_mixed_dpi() {
        let areas = [
            MonitorBounds {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1040,
                scale_factor: 1.0,
            },
            MonitorBounds {
                x: 0,
                y: 0,
                width: 3840,
                height: 2080,
                scale_factor: 1.5,
            },
            MonitorBounds {
                x: 3840,
                y: -1080,
                width: 1920,
                height: 1040,
                scale_factor: 1.25,
            },
        ];
        let mut previous = None;
        for area in areas {
            let p = pad_placement(area, previous);
            assert!(p.0 >= area.x && p.0 + p.2 as i32 <= area.x + area.width);
            assert!(p.1 >= area.y && p.1 + p.3 as i32 <= area.y + area.height);
            assert_eq!(p.2, (PAD_WIDTH * area.scale_factor).round() as u32);
            assert_eq!(pad_placement(area, Some(p)), p);
            previous = Some(p);
        }
    }
    #[test]
    fn pad_preserves_manual_position_and_clamps_when_work_area_shrinks() {
        let area = MonitorBounds {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            scale_factor: 2.0,
        };
        assert_eq!(
            pad_placement(area, Some((200, 100, 432, 176))),
            (200, 100, 432, 224)
        );
        assert_eq!(
            pad_placement(area, Some((550, 450, 432, 176))),
            (368, 376, 432, 224)
        );
        let tiny = MonitorBounds {
            width: 100,
            height: 100,
            ..area
        };
        assert_eq!(pad_placement(tiny, None), (0, 0, 100, 100));
    }
}
