# ADR 0002: Rust + Tauri v2 Desktop Engine for Zero-Idle Overhead

## Context
A background clipboard manager and screen utility must run continuously in the Windows system tray without degrading gaming, compiling, or battery performance. The user explicitly required: *"It should be very smooth and use very little CPU."* Electron apps typically consume 150–300MB RAM and produce background CPU polling. Conversely, writing a complex vector-based visual annotator, cropping tool, and fluid animated sidebar entirely in Win32 C++ or WPF is extremely slow to develop and prone to maintenance overhead.

## Decision
We select **Rust + Tauri v2** with a modern webview frontend (React/TypeScript + Tailwind + Canvas):
1. **Rust Core:** Directly calls native Win32 APIs (`AddClipboardFormatListener`, `RegisterHotKey`, `SetWindowPos`, `MonitorFromPoint`, OLE `IDataObject` COM interfaces) with zero runtime baggage. Consumes <35MB RAM and 0.0% CPU when idle.
2. **Frontend Layer:** Delivers 60–120fps smooth animations, fluid drag-and-drop handles, multi-display responsiveness, and a high-performance vector annotation canvas for cropping, drawing, and redaction.

## Consequences
- Windows hooks and clipboard event listeners run in dedicated native OS threads with zero GC pauses.
- Instant startup (<250ms) compared to multi-second Electron cold starts.
- Webview window can be hidden without tearing down the background Rust clipboard listener.
