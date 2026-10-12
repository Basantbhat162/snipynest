# ADR 0006: Capture Pad, native drag presentation, and expanded editing

Date: 2026-10-11
Status: implemented in 1.2.0; movement, activation, monitor placement and text drops amended by ADR 0007 in desktop 1.2.1. Native acceptance remains unverified.

## Decision

Capture Pad is a small utility WebView showing one latest image and an unread count. Arrivals show it without activation; an explicit click can activate it. Clicking opens Sidebar, following the user's clarification; there is no intermediate shelf. Moving its handle and dragging its image are separate gestures. Its last desktop position is clamped and snapped to a monitor work area. It floats beside the Windows taskbar, not inside it. The tray provides Show and Reset actions. Arrival, always-visible, off, and thumbnail privacy preferences are persisted with backwards-compatible defaults.

Only committed external image ingestion increments arrivals. Ordinary text and OmniCopy clipboard write-back do not. Write-back includes the standard clipboard-monitor exclusion marker. A burst updates the existing Pad rather than creating windows or opening Sidebar. The Pad is excluded from supported Windows screen capture through display affinity; this is not a guarantee for every capture tool.

Native drag completion is a command result, with an additional notification event. A native scoped presentation guard fades Sidebar and makes it transparent to mouse input, hides Pad, then restores surfaces without activating them. Hide during drag is the explicit fallback preference. Staged images are independent copies: editing an exported file cannot modify a canonical blob.

Expanded Annotator reuses the existing main WebView. Switching inline/window/fullscreen does not serialize or remount the live document. Expanded mode gets window decorations and taskbar participation; utility blur hiding is suspended. This intentionally replaces the proposed second editing WebView and cross-window handoff protocol with a single document owner. Fit adapts to the viewport; explicit zoom stores absolute image scale. Resizing does not change exported pixel dimensions.

A single IndexedDB draft retains the baked baseline, bounded undo/redo, crop and tool settings, with a 64 MiB serialized budget and seven-day expiry. Writes are serialized, and a different Clip cannot silently replace or discard an existing draft. Save to history and cleanup/refresh are separate outcomes. Drafts contain image data and remain local to the app's WebView profile.

Ctrl+Shift+S starts Windows snipping. Ctrl+Shift+V opens Sidebar. Alt+Shift+V remains a fallback unless assigned to another configured action. Shortcut registration occurs on the listener thread; conflicts roll back, and timed-out queued changes cannot apply later. Clipboard writes, image loads/saves and preference updates use blocking workers rather than occupying the UI thread.

Companion binds capture to a tab and document token, tolerates focus and same-document URL changes, restores temporary page changes, and supports finite full pages, visible area, five-viewport feeds and a user-selected visible scroll panel. The offscreen document retains one completed PNG for five minutes or until the next capture, capped at 64 MiB. Clipboard failure does not destroy it. Delivery is still the clipboard bridge, not an acknowledgement from desktop storage.

## Limits and follow-up gates

- Native drag hit-testing, target compatibility, focus restoration, Win+Shift+S bursts and mixed-DPI behavior need live Windows tests.
- Browser mocks execute production adapters but do not certify Brave, Chrome, Edge, X or browser permission behavior.
- Browser settings and other protected pages require Windows snipping; injection restrictions are not bypassed.
- Pad remembers one desktop position, not a per-monitor layout. Expanded editor bounds and editing mode are not persisted between app sessions. No Windows toast integration or taskbar-embedded widget is shipped.
- Draft recovery is one bounded session, not a project format. Zoom/pan positions are not part of the persisted checkpoint.
- The reported intermittent Cut/copy failure has not been reproduced in a live session. Async native work and command-based drag completion remove concrete blocking/stuck-state risks; they are not proof that every cause of that report is resolved.
- Idle CPU, aggregate WebView memory, stress ingestion and upgrade/uninstall remain measurement gates in `docs/VERIFICATION.md`.

1.2.2 amendment: see [ADR 0008](0008-native-pad-visibility-and-focused-copy.md) for native Pad visibility ownership, focused browser clipboard delivery, capture sound and preview regeneration.
