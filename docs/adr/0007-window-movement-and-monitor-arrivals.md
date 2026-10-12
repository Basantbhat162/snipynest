# ADR 0007: Window movement, monitor arrivals, and text drops

Date: 2026-10-12
Status: implemented in desktop 1.2.1; live Windows acceptance pending

## Evidence and decision

The user reports that moving Sidebar disables X and the history shortcut until a tray action resets it. Moving Capture Pad also selects content, its close controls appear inconsistent, and new screenshots keep appearing on the old monitor. Text drops arrive as snippet files.

The text failure is reproduced at the production payload seam: a text-only payload advertised CF_HDROP. The pointer gesture also failed a regression requiring browser selection suppression. Native movement failure cannot be reproduced through the available browser-only automation. The existing code combined unguarded startDragging with blur hiding and could snap Pad while the move was still active; these are addressed without claiming live certification.

Window movement now has one native command bound to the calling window. The shared pointer threshold releases DOM capture before handoff and suppresses browser selection. A scoped guard suspends Peek hiding throughout Windows' move loop. A held-button check prevents a delayed command from starting a move after release. Native mouse capture is released before and after the loop; position snapping/persistence happens after completion. Transient blur events do not hide a window that remains the native foreground window. This follows Microsoft's documented [move-loop lifetime](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-entersizemove) and [mouse capture ownership](https://learn.microsoft.com/en-us/windows/win32/learnwin32/mouse-movement). Tauri has a related [Windows focus/mouse-event report](https://github.com/tauri-apps/tauri/issues/10767); it is supporting evidence, not confirmation of this user's root cause.

Capture Pad uses the native window label to choose its frontend, rather than depending on a URL query. It has one 34px close button and a broad movement bar. Quiet arrivals use SW_SHOWNOACTIVATE, but the window may activate when explicitly clicked; WS_EX_NOACTIVATE no longer interferes with user interaction. Escape and native close hide the Pad without destroying it. No move-event timer snaps or writes the position during a drag.

The clipboard listener samples the cursor location at WM_CLIPBOARDUPDATE, before decoding or storage. The worker carries its monitor work area with the Clip. An image arrival keeps a manually chosen Pad position on the same monitor, or places it near the destination monitor's taskbar edge with physical dimensions derived from that monitor's DPI. Arrivals do not reposition a surface during an active native drag or move. One desktop position is persisted; separate positions per monitor are not maintained. The cursor-at-clipboard-event heuristic cannot identify an offscreen screenshot or reconstruct an arbitrary third-party capture rectangle.

Native selections are validated before staging. Text/code/link selections offer only CF_UNICODETEXT, preserving full content and joining multiple items with CRLF. Image selections offer real PNG files and the existing image representations. Mixed text/image drops report an actionable error because targets commonly select only one format; explicit Export still writes both images and text files. No text-only drag session writes temporary files.

## Verification

Tests cover pointer ownership/cancellation/selection suppression, full Unicode text selection, empty/missing/mixed selections, native payload formats, scoped movement cleanup, three-monitor geometry with negative coordinates, mixed DPI, and work-area clamping. Browser fixture checks confirm one Pad close control and successful move/close/open-history/Escape command dispatch. These do not run the actual Win32 move loop or external application drop targets. See docs/VERIFICATION.md for current results and remaining native checks.
