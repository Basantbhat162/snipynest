# Copy Tool (OmniCopy) Product & Architecture Specification

## Problem Statement
The standard Windows clipboard (including `Win + V`) suffers from severe functional limitations that interrupt user workflows:
1. **Volatile & Dismissive UI:** Clicking anywhere outside the `Win + V` flyout immediately dismisses it, making multi-item copy-pasting, visual comparison, and complex drag-and-drop operations tedious.
2. **No In-Place Manipulation:** Copied images cannot be cropped, annotated, redacted, or edited without opening external photo editors (Paint, Photoshop), manually saving a file, and re-copying.
3. **Restricted & Ephemeral History:** Standard clipboard history has low item limits, loses data on reboots unless cloud clipboard is enabled, and offers no robust recovery or trash bin for accidentally removed items.
4. **Poor File Materialization & Drag-and-Drop:** Dragging images and text directly into apps (Figma, Photoshop, Discord, File Explorer) is unsupported or clumsy, and bulk-dragging multiple items at once is impossible.
5. **Disconnected Web Capture:** Capturing full-page websites currently requires third-party browser extensions (such as GoFullPage), which cannot directly bridge captured content into a unified desktop clipboard history or drag-and-drop workspace.

---

## Solution
Copy Tool (**OmniCopy**) is a high-performance Windows background utility and sidebar workspace built on Rust and Tauri v2. It provides:
1. **Uninterrupted Vertical Sidebar:** A slide-out panel that opens via global hotkey (`Win + Shift + V`), offering both **Peek Mode** (auto-dismiss on focus loss) and **Pinned Mode** (persists on screen across clicks).
2. **Persistent Hybrid Storage:** Stores unlimited text, code, rich text, and images in a high-speed SQLite database with a content-addressable local Blob Store, deduplicated by SHA-256.
3. **Native Multi-Drop:** First-class OLE drag-and-drop support allowing single or bulk selection of images and text to be dragged directly into any Windows software or folder.
4. **Instant In-Place Annotator:** Captures and clips open instantly in an embedded vector canvas for cropping, drawing, arrows, text, and sensitive-data blurring with zero pre-saving required.
5. **HD Full-Page Web Snip:** Direct browser integration via a lightweight Companion extension and native scrolling capture to grab entire webpages in native device pixel ratio and immediately feed them into the Sidebar.
6. **Zero-Idle CPU Footprint:** Native Win32 event listeners consume 0.0% CPU when idle and maintain less than 35MB RAM usage.

---

## User Stories

### Clipboard Ingestion & History
1. As a developer, I want all copied text, code snippets, and terminal outputs saved automatically in the background, so that I never lose previously copied code.
2. As a designer, I want copied image assets, screenshots, and graphics saved with full fidelity into the Blob Store, so that I can access them hours or weeks later.
3. As a researcher, I want my clipboard history to persist across system restarts, so that my research clippings remain available.
4. As a user, I want the system to ignore sensitive credentials copied from password managers, so that master passwords and tokens are never stored in history.
5. As a power user, I want effectively unlimited history with optional housekeeping prompts, so that I can keep everything without running out of disk space.
6. As a user who accidentally deletes a Clip, I want a dedicated Trash bin with a 30-day retention window, so that I can restore accidentally deleted items.
7. As a user with frequent boilerplate messages, I want to pin items to a Favorites section, so that they remain permanently accessible at the top of the Sidebar.
8. As a user with thousands of past Clips, I want instant full-text search with fuzzy matching and syntax highlighting, so that I can locate any snippet in milliseconds.
9. As a visual creator, I want separate category tabs for All, Images, Text, Links, and Pinned, so that I can filter my history effortlessly.

### Sidebar & Multi-Monitor Interaction
10. As a multitasking worker, I want to toggle the Sidebar with a single global shortcut (`Win + Shift + V`), so that it appears instantly without breaking my flow.
11. As a user with multiple monitors, I want the Sidebar to appear on whichever monitor currently hosts my mouse cursor, so that I do not have to look across displays.
12. As a user on mixed-DPI displays (e.g. 4K laptop + 1080p monitor), I want the Sidebar to adapt its DPI scaling seamlessly, so that the UI never blurs or shifts off-screen.
13. As a content creator, I want to toggle Pinned Mode on the Sidebar, so that it stays open while I click back and forth between multiple applications.
14. As a fast typist, I want Peek Mode to dismiss the Sidebar as soon as I click back into my document, so that it never gets in the way of my active typing.
15. As a keyboard user, I want full arrow-key navigation and number shortcuts (1-9) to paste items instantly, so that I don't have to reach for my mouse.

### Drag-and-Drop & File Materialization
16. As a digital artist, I want to drag an image Clip directly from the Sidebar into Photoshop, so that it opens as a layer without me having to save it to disk first.
17. As an office worker, I want to drag an image Clip into Windows File Explorer, so that it materializes as a standard `.png` file in that folder.
18. As a community manager, I want to multi-select 7 images in the Sidebar and drag them simultaneously into Discord, so that all 7 images upload in one message.
19. As a writer, I want to drag text Clips directly into Word or a web form, so that the text is inserted cleanly at the drop cursor.
20. As a user who prefers context menus, I want right-click options to "Copy to Clipboard", "Save to Folder...", or "Open in Default App", so that I have multiple ways to interact with content.

### Screen Capture, Full-Page Web Snip & Annotation
21. As a QA tester, I want to press a global shortcut (`Alt + Shift + S`) to capture a full webpage from top to bottom in HD, so that I don't need a standalone extension like GoFullPage.
22. As a web developer, I want captured webpages to preserve full device pixel ratio (retina quality), so that small text and fine UI details remain razor-sharp.
23. As a user capturing non-browser scrolling windows, I want an automated scrolling Snip feature, so that I can capture long documents or chats outside of web browsers.
24. As a technical writer, I want captured Snips to appear instantly in the Sidebar without prompting me for a file destination, so that I can continue working without friction.
25. As a collaborator, I want to crop any captured image directly inside the Annotator, so that I can remove unwanted window borders or desktop areas.
26. As a customer support lead, I want to draw arrows, boxes, and step numbers on a screenshot, so that I can create clear tutorials for customers.
27. As a privacy-conscious user, I want a blur and pixelation tool in the Annotator, so that I can redact sensitive account numbers or personal details before sharing.
28. As an analyst, I want to export annotated images as PNG, JPG, or PDF with a single click, so that I can share them in whichever format my team requires.

### System Performance & Reliability
29. As a gamer and heavy workstation user, I want Copy Tool to consume 0.0% CPU when idle, so that it never impacts gaming framerates or heavy background renders.
30. As a laptop user on battery power, I want the clipboard listener to operate strictly on Windows OS push notifications (`WM_CLIPBOARDUPDATE`), so that the CPU is never woken up by polling loops.
31. As a user copying massive 50MB images or entire spreadsheets, I want background processing to handle ingestion asynchronously without freezing the UI thread, so that the operating system remains responsive.

---

## Implementation Decisions

### 1. High-Level Subsystems and Seams
- **Core Engine (Rust):**
  - Manages Win32 window handles, system tray integration, global keyboard hooks (`RegisterHotKey`), and OS clipboard format listener (`AddClipboardFormatListener`).
  - Implements the Windows OLE COM interfaces (`IDataObject`, `IDropSource`) for drag-and-drop operations.
  - Manages the SQLite database connection pool and filesystem Blob Store.
- **Frontend Layer (Tauri Webview):**
  - High-performance UI built with React, TypeScript, and Tailwind CSS.
  - Virtualized list rendering via `@tanstack/react-virtual` to smoothly handle 100,000+ Clips without DOM degradation.
  - Vector annotation canvas utilizing HTML5 Canvas/Fabric.js with non-destructive layers for crop, arrows, shapes, text, and blur filters.
- **Native Messaging Companion Extension:**
  - Manifest V3 browser extension for Google Chrome, Microsoft Edge, Brave, and Mozilla Firefox.
  - Connects to the desktop host via standard OS Native Messaging (`omnicopy_companion.json`).
  - Utilizes `chrome.debugger` (`Page.captureScreenshot` with `captureBeyondViewport: true`) to deliver pixel-perfect full-page screenshots at native DPI.

### 2. Database Schema (SQLite)
The relational schema comprises four primary tables:
- `clips`: Core metadata (`id`, `hash`, `type`, `text_content`, `char_count`, `byte_size`, `dimensions`, `source_app`, `source_title`, `created_at`, `is_pinned`, `is_deleted`, `deleted_at`, `thumbnail_blob`).
- `blobs`: Physical file mappings (`hash`, `extension`, `file_size`, `mime_type`, `file_path`, `ref_count`).
- `tags`: User-defined labels and collections (`id`, `name`, `color`).
- `clip_tags`: Many-to-many junction table linking clips to tags.
- Full-text search index created via SQLite `FTS5` on `text_content`, `source_app`, and OCR metadata.

### 3. Drag-and-Drop Synthetic Protocol
- When the user initiates a drag gesture on one or more Clips:
  - If target is a file system location (e.g. Explorer) or external app accepting files, the engine writes temporary files to `%TEMP%\OmniCopy\drops\<session_id>\` and populates the `CF_HDROP` structure with the absolute file paths.
  - If target accepts text, `CF_UNICODETEXT` provides the plain text.
  - If target accepts raw image bitmaps, `CF_DIBV5` provides the in-memory bitmap stream.
  - On drag completion (`DRAGDROP_S_DROP`), temporary drop sessions are cleaned up asynchronously.

### 4. Window Positioning & Multi-Monitor Logic
- The Sidebar window is configured as a borderless utility window with `WS_EX_TOOLWINDOW` and stripping `WS_EX_APPWINDOW`, fully excluding it from the Windows Alt+Tab switcher.
- When toggled, the app calls `GetCursorPos` and `MonitorFromPoint` to identify the active display's work area (`GetMonitorInfoW`).
- Querying `GetDpiForMonitor(hMonitor, MDT_EFFECTIVE_DPI)` dynamically calculates the exact scale factor of the target display, ensuring the sidebar scales to physical coordinates crisply across mixed-DPI screens (e.g. 4K 150% + 1080p 100%).
- The Sidebar positions itself flush against the right edge of that display, adjusting height to match `rcWork.bottom - rcWork.top`.
- In Peek Mode, focus loss triggers automatic hiding unless Pinned Mode is toggled.

### 5. High-Resolution Ingestion & In-Place Studio
- Full-fidelity PNGs are stored in the content-addressable Blob Store and queried directly via `get_clip_full_image` for the Annotator canvas, bypassing thumbnail downscaling for 4K/retina clarity.
- The canvas supports CleanShot X-style auto-incrementing numbered badge pills (`Step` tool), drawing high-contrast pills with white borders and shadow elevation. Step counters are synchronized in the history undo stack so non-step actions (drawing arrows, rectangles) never corrupt the step numbering.
- Clipboard image write-back (`copy_clip_to_clipboard` / `copy_image_base64_to_clipboard` / `set_clipboard_image`) synthesizes both 32-bit `CF_DIBV5` (with alpha channel bitmasks and sRGB profile) and registered `"PNG"`, ensuring seamless pasting into Discord, Slack, Photoshop, and Paint.
- Ingestion checks registered `"PNG"` format first, acquiring losslessly preserved PNG bytes directly from modern applications without transcoding.
- Security Invariant: Detects and respects private clipboard formats (`Clipboard Viewer Ignore`, `ExcludeClipboardContentFromMonitor`, and `CanIncludeInClipboardHistory = 0`) to prevent storing sensitive password manager credentials.

### 6. Process Executable Name Resolution
- Active foreground window process IDs are resolved to actual executable filenames (e.g. `chrome.exe`, `Code.exe`) using Win32 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` and `QueryFullProcessImageNameW`, falling back to `PID:####` only if process handle access is restricted.

---

## Testing Decisions

### What Makes a Good Test
- Tests must verify external behavior and invariants across public seams, never private internal functions.
- Unit tests run against SQLite and Blob Store using in-memory databases and isolated temporary directories.
- Win32 API adapters are tested via seam wrappers that verify payload construction and retry semantics under simulated locks.

### Modules Tested
1. **`storage_engine` Tests:**
   - Insertion and retrieval of text, code, and image Clips.
   - Deduplication verification: inserting identical payloads yields the same hash and does not duplicate blob files.
   - Soft-delete and Trash restoration: marking an item deleted excludes it from regular queries; restoring returns it; purging permanently deletes record and blob.
   - FTS5 search accuracy and speed on 10,000 synthetic records.
2. **`clipboard_engine` Tests:**
   - Parsing of `CF_UNICODETEXT`, `CF_HDROP`, and `CF_DIBV5`.
   - Ignored format detection: verify that clipboard payloads marked with `Clipboard Viewer Ignore` or `ExcludeClipboardContentFromMonitor` are discarded.
   - Exponential backoff retry loop when `OpenClipboard` returns error code 5 (`ACCESS_DENIED`).
3. **`drag_drop_engine` Tests:**
   - Multi-item payload assembly: verify `DROPFILES` structure contains correct null-terminated file lists.
   - Session directory cleanup after drop events.
4. **`annotator_canvas` Tests:**
   - Crop boundary calculation and export dimensions.
   - Non-destructive vector layer serialization and re-rendering.
   - Blur/pixelation filter bounding box coverage.

---

## Out of Scope
1. Cloud synchronization and peer-to-peer sync (all data remains 100% local for privacy and speed).
2. Mobile companion apps (Android/iOS).
3. Linux and macOS desktop builds (this version is exclusively optimized for Windows 10/11 Win32 APIs).
4. Audio or video stream clipboard recording.

---

## Further Notes
- **Extensibility:** The internal event hub is designed to accommodate future plugin abilities (e.g. local offline OCR via Tesseract/Windows Media OCR, QR code generator/reader, regex transformation tools).
- **Security:** Database encryption at rest via SQLCipher is a planned optional enhancement for enterprise users handling classified text.
