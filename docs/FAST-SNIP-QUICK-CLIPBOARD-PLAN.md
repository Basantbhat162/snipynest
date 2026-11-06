# Fast Screen snip and Quick Clipboard: proposed implementation plan

Date: 2026-11-06
Status: implemented in the 1.7.0 development candidate. This file records the original plan; [verification evidence and remaining acceptance checks](VERIFICATION.md) describe the result. Performance figures below remain proposed targets, not measured guarantees.

## Product decision

Prioritize Screen snip response time, then add a small clipboard-only Quick Clipboard view. Keep the existing detailed Sidebar as the full workspace. Preserve its user-configured shortcut. The new view should support choosing and pasting a Clip in one action, with a copy-only fallback.

No emoji, GIF, AI transformations, inline annotation editor, cloud synchronization or duplicate storage system in this scope. No open/close scale, slide or fade effects in Screen snip or Quick Clipboard. Hover/focus feedback can remain immediate and static.

Research and first-person issue evidence: [Clipboard research](CLIPBOARD-QUICK-PASTE-RESEARCH-2026-11-06.md). Individual issue reports inform design; they are not a representative user survey.

## 1. What the current source establishes

| Finding | Evidence | Implication |
| --- | --- | --- |
| The capture overlay is already created hidden at startup. | `src-tauri/tauri.conf.json`, `capture-overlay` | Reuse this shell; do not claim that merely keeping a window warm is a new optimization. |
| Opening waits for a 40 ms delay, full-desktop GDI capture, PNG encoding, base64 encoding and a snapshot command before image loading. | `src-tauri/src/region_capture.rs`: `start`, `get_region_capture_snapshot`; `screen_capture.rs`: `capture_png` | Measure every stage and reduce the work before the first correct selectable frame. |
| The frontend decodes an image, builds a full-size baseline and mutable canvas, then requests that the native window be shown. | `AnnotatorModal.tsx`: image-load effect and `show_region_capture`; `annotation/document.ts`: constructor/rebuild | There are full-image copies and initialization costs before selection can begin. |
| Copy waits for synchronous canvas PNG export, native clipboard work and image insertion/thumbnail work before the overlay finishes. | `AnnotatorModal.tsx`: `exportImage`; `region_capture.rs`: `copy_region_capture`; `RegionCapture.tsx`: copy callback | Clipboard readiness and archive completion need separate outcomes. Slow disk work should not hold the selection overlay open. |
| The inspected snip CSS contains no entry/exit scale animation. Native show/hide calls do not set a per-window DWM transition policy. | `Annotator.css`; `region_capture.rs`: show/cancel | The reported zoom is not yet reproduced. A native transition is a hypothesis, not a verified root cause. |
| Existing native commands copy Clips but do not implement destination-tracked automatic paste. Keyboard services use `RegisterHotKey`, not a low-level hook. | `commands.rs`: `copy_clip_to_clipboard`; `keyboard.rs`; `clipboard/listener.rs` | Quick paste and optional Win+V interception are new native behavior requiring their own tests. |

## 2. Screen snip: no motion and less startup work

### Establish the baseline

Record hotkey receipt, preparation, compositor settling, pixel capture, encoding, transport, frontend decode, document initialization and first selectable frame. Record Copy-to-clipboard-ready, Copy-to-hidden and Cancel-to-hidden separately. Use monotonic durations and image dimensions; do not log clipboard contents, page titles or screenshots of personal pages.

Compare at least 50 warm captures and 10 cold starts on synthetic 1080p, 4K and extended-desktop layouts, with simple and detailed imagery. Report p50/p95, peak private memory and all WebView descendants. Repeat representative cases under CPU/disk contention. Compare the user's Lightshot workflow on the same machine when a permitted live test is available.

### Remove entry and exit motion

Apply the Windows per-window DWM transition-disable attribute to the capture overlay before showing it; check return values. Use fixed physical bounds and avoid maximize/minimize/fullscreen transitions in this path. Check Copy, Save, right-click Cancel, Escape, native X, focus loss and rapid reopen. The full desktop must not visibly scale or shift during any of them. Do not change Windows-wide animation/accessibility settings.

Microsoft documents [`DWMWA_TRANSITIONS_FORCEDISABLED`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute) and the per-window [`DwmSetWindowAttribute`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmsetwindowattribute) call. These provide an implementation candidate; native recording must establish whether they eliminate this reported effect.

### Reduce the critical path

1. Retain the warm shell and prepare its static resources without continuously capturing the screen.
2. Prototype a bounded, session-owned native pixel frame with an opaque handle. Compare fast PNG transport with a scoped binary image response that avoids base64/JSON and PNG compression before selection. Choose from measured latency and memory, not an assumption that raw pixels are always cheaper.
3. Restrict frame access to the active capture session and intended app surface; invalidate it on close/replacement. Preserve the current physical-pixel geometry and 32-megapixel bound.
4. Make selection available from one correctly rendered frozen frame. Defer unnecessary mutable/baseline canvas copies until markup needs them; retain the existing annotation implementation rather than creating a second editor.
5. For an unannotated selection, crop the native frame and encode only the selected area when copying/saving. Preserve PNG and Windows DIB compatibility. Annotated exports must retain identical crop/markup pixels.
6. Close promptly after a confirmed clipboard write. Archive/thumbnail work can finish on a bounded worker; report a later archive failure outside the hidden overlay. Clipboard success must not be falsely described as history-save success. Cancellation hides promptly and releases the session without a clipboard/history write.
7. Revisit the fixed 40 ms compositor wait only with a tested replacement. Self-capture, stale frames or black flashes are regressions. [`DwmFlush`](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmflush) flushes the caller's queued changes, not the entire session. [`WDA_EXCLUDEFROMCAPTURE`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity) has OS-version limits. Neither is an unconditional reason to delete the wait.

Do not show an empty overlay early merely to improve a window-visible timer. The measured endpoint is a correct frame that accepts selection.

## 3. Quick Clipboard interaction

Start around **360 × 480 logical pixels**, clamped to the active monitor work area; adapt height on smaller displays. Show approximately five or six text rows, fewer when image previews are present. Initially place it near the pointer with a stable fallback; reliable caret anchoring can follow later.

```text
Clipboard                          Clear…  Open full ↗
[ Search clips…                                  ]
[All] [Images] [Text] [Code] [Links]       Pinned ◇
--------------------------------------------------
  Text preview / small thumbnail            Pin ◇
  App · recent time
  … a short, scrollable list …
--------------------------------------------------
↑↓ Select    Enter Paste    Ctrl+C Copy    Esc Close
```

- Search is immediately available. Arrow keys move the active row; Enter or the row's primary click pastes once and closes. Escape, outside click and pressing the activation shortcut again dismiss without paste.
- Preserve normal text-editing shortcuts in the search field; Ctrl+C copies a Clip when the list has focus. Enter during IME composition must finish composition rather than trigger paste. Never forward the popup's Enter to the destination or automatically submit anything there.
- **All / Images / Text / Code / Links** are the only category tabs. A separate pinned-only toggle avoids burying every new Clip beneath old pins. Default ordering is most-recent first; keep the detailed Sidebar's existing ordering independent.
- Pin and overflow controls do not paste. Support keyboard focus, accessible names and visible focus. Do not rely on hover-only actions.
- Source-app and short time context distinguish similar entries; no large branding/header, big metadata blocks or annotation toolbar.
- Copy-only remains available. Stored text/code/links are already plain text, so do not add a redundant “Paste as plain text” operation unless rich formats are actually retained. Paste links as text; do not open them automatically.
- Existing PDF/file Clips can appear in All with a file badge and correct native file-copy behavior. Do not silently turn them into text paths or claim every destination can paste them.
- **Open full** switches to the existing Sidebar and can reveal the selected Clip there. Keep editing, bulk selection/export, storage and settings in that workspace.
- Clear opens a count-confirmed action: move all unpinned SnipyNest Clips to Trash, across categories, with Undo. Pinned Clips remain. Label its scope explicitly; it does not clear Windows history or the current system clipboard. Reuse the existing batch snapshot service.

## 4. Native paste and Win+V

### One-action paste

Create a small native PasteSession service: remember the external destination before opening, resolve the selected Clip's complete payload, write it once, hide the popup, restore and verify the original target, wait for activation modifiers to be released, then dispatch one paste chord. Use the session identity to reject late actions and changes of destination.

If focus is refused, the destination closed or an elevated target cannot receive injected input, keep the Clip copied and expose the manual-paste fallback. Do not paste into a different foreground app, send repeated blind input, elevate the app or report that the target accepted data merely because input was sent. Preserve self-ingestion suppression so a quick paste does not become another capture notification. See the research report's [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow) and [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput) sources.

Double-click/repeated Enter consumes only one action. Immediately before dispatch, recheck both destination focus and the app's published clipboard sequence; if another app changed the clipboard during the wait, cancel automatic paste rather than overwrite that newer content. An outside-click dismissal must not steal focus back from the app the user just clicked.

### Optional Win+V takeover

Preserve the current full-history shortcut, including a user's custom assignment. Add a separate conflict-checked Quick Clipboard shortcut. Do not make Ctrl+B a new global default; it conflicts with Bold.

Windows reserves Win-key chords under [`RegisterHotKey`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey). Prototype **Use SnipyNest for Win+V while running** as an opt-in compatibility feature. A minimal dedicated low-level hook is a candidate only if ordinary registration cannot provide the required behavior. The callback must only detect the enabled chord and queue work; no content logging, database work, rendering or blocking IPC.

Test both Win keys, both release orders, repeat, IME/layouts, other Win shortcuts, Start-menu behavior, remappers, dictation, sleep/resume and app exit/crash. Disabled/exited must restore Windows behavior. Do not automatically disable Windows history, edit registry mappings or change cloud settings. Any double panel, stuck modifier or interference with other shortcuts blocks shipping takeover as working. Retain the fallback shortcut even if takeover passes.

The current keyboard architecture explicitly uses registration without a hook. If a hook is needed, document that capability change in an ADR and `PRIVACY.md` before distribution; do not retain a misleading no-hook description.

Win-key acceptance requires an appropriately permitted manual/native test environment. Browser mocks and a saved shortcut setting do not certify interception.

### Concrete exclusion-marker check

Current `is_clipboard_ignored` registers `ExcludeClipboardContentFromMonitor`; Microsoft documents `ExcludeClipboardContentFromMonitorProcessing`. Before expanding clipboard behavior, add a synthetic producer regression and handle the canonical marker, retaining legacy compatibility where appropriate. Existing DWORD-zero `CanIncludeInClipboardHistory` handling remains. This source mismatch does not establish that any particular private item was collected. [Microsoft Clipboard Formats](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats).

## 5. Performance and module boundaries

- Reuse the main WebView with a lightweight Quick Clipboard surface where feasible; do not add another permanently resident WebView by default. Keep Quick Clipboard and Sidebar state independent. Do not interrupt an active editor, native drag or window move. Preserve saved Pinned Mode when changing transient surfaces.
- Snapshot and restore native bounds, minimum size, presentation mode and visibility consistently. The main window currently has a 480px minimum height, so the quick surface's small-screen bounds need an explicit temporary constraint rather than a CSS-only size change.
- Query a bounded first page of metadata (proposed 40 Clips); render only visible rows. Do not load full text/images, regenerate large thumbnails, count the whole archive or scan blob directories while opening.
- Cache a small metadata page and bounded tiny previews; refresh asynchronously. Load complete payloads only on selection. Keep at most one active search and one latest queued search; discard stale results and prevent Enter from pasting a previous query's selection.
- Keep selected Clip identity stable when new captures arrive. Do not reorder a row under the pointer; offer a small new-items indicator until refresh/reopen.
- Reuse storage, pinning, Trash/Undo, native clipboard formats and existing preview services. Separate native window/keyboard/paste lifecycle from React presentation. No second clipboard database.

Provisional targets on a stated reference machine: warm snip p95 ≤150 ms at 1080p and ≤250 ms at 4K; cancel-to-hidden p95 ≤50 ms; warm Quick Clipboard selectable content p95 ≤100 ms. Record cold starts and extended-desktop results separately. Baseline first and revise targets openly if hardware/compatibility evidence requires it. No claim of instant behavior under exhausted RAM or of zero idle CPU.

## 6. Execution order and release gates

1. **Reproduce and measure:** native animation recording, stage timings and aggregate process/memory baseline; add the synthetic exclusion-marker regression. Resolve the earlier Windows automation-helper failure or establish a permitted manual loop.
2. **Remove snip motion and optimize:** establish a passing no-animation lifecycle test; measure transport/canvas/copy changes independently. Preserve quality, cancellation, multi-monitor coordinates and all existing markup/PDF behavior.
3. **Prove paste and shortcut compatibility:** prototype destination-safe paste and optional Win+V interception with a minimal shell before polishing the popup. Keep fallback behavior usable if takeover fails.
4. **Build the compact view:** add the five tabs, search, pinning, Clear/Undo and Open full over the existing services. Verify empty/loading/error/long-text/image/PDF states, 100–200% DPI, small screens and keyboard-only use.
5. **Verify and distribute:** run project checks (`pnpm check`, `pnpm test`, `pnpm build`, locked Rust tests) and build the Windows installer. Perform actual application paste, conflict, low-resource and capture lifecycle tests; record unverified cases separately. Update user docs, versions and verification records, inspect public files, then use a feature PR and maintainer review. A future main/release override requires new authorization; the earlier exception was for PR #14 only.

No product code, Windows settings, shortcut assignments or installed executables were changed during this planning round. No native latency or Win+V compatibility result has been measured yet.
