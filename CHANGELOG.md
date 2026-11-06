# Changelog

## 1.7.0 — unreleased

- Added Quick Clipboard: a compact, keyboard-accessible view with search, five type filters, pins, copy-only, Clear/Undo and Open full workspace. It reuses the main WebView and queries bounded metadata.
- Added destination-checked one-action paste, with clipboard-sequence and modifier guards and a manual-paste fallback. The full Sidebar shortcut remains independent.
- Added a configurable Quick Clipboard shortcut and experimental opt-in Win+V replacement while the app runs. No Windows history or registry remapping changes are made.
- Screen snip disables per-window DWM transitions, sends a bounded bitmap through binary IPC, defers its undo baseline until needed, and encodes only the selected region for unannotated Copy. Confirmed clipboard success closes the overlay before bounded archival work.
- Corrected the canonical Windows clipboard-monitor exclusion marker while retaining legacy marker compatibility.

## 1.6.5 — unreleased

- Added Show in history on search results, with destination-page scrolling and a visible position outline. Stale results clear as search changes.
- Added inclusive Shift-click checkbox ranges and Copy text for complete selected text, code and links in displayed order.
- Screen snip covers the extended desktop, including negative display origins, with tools placed on a real display. Right-click offers Cancel capture. The existing 32-megapixel memory limit remains.
- Corrected Windows packed-bitmap mask offsets that could shift clipboard pixels and create different image identities. Sequence-bound reads avoid processing a newer clipboard under an older event.
- Similar recompressed paste/dictation restores no longer replay capture feedback; altered images remain in history. Deliberate Lightshot/Windows snips still notify.
- Indexed history ordering, moved history/statistics queries off the UI thread, coalesced arrival statistics, skipped repeat image encoding and released the database connection during legacy image decoding. Capture Pad uses a bounded preview/control grid.

## 1.6.4 — unreleased

- Replaced the large area-capture editor panel with a narrow icon strip beside the selection and a small action row underneath it. Controls move inside the screen at its edges.
- Color/stroke, text entry and extra tools open only when requested. Copy, image save, PDF save, undo/redo and cancel remain available without the full editor panel.

## 1.6.3 — unreleased

- Screen snip opens SnipyNest's own area-selection overlay on the monitor under the pointer. Select first, add markup, then copy, save an image or save a PDF. Escape and focus loss cancel.
- Added Ctrl-plus/minus and Ctrl-wheel image zoom, plus a straight Line tool. Quick edit keeps its pending crop when undoing markup.
- Added Save PDF / Ctrl+P to the image editor. It exports the selection and markup as full-resolution, losslessly compressed image pages into history and Capture Pad.
- Fixed identical RGB and opaque RGBA clipboard images becoming duplicate history entries when another app rewrites the image. Legacy originals remain intact; existing duplicate rows are not removed automatically.

## 1.6.2 — unreleased

- Quick edit from Capture Pad now includes pen, arrows, shapes, highlight, text, steps and redaction. A pending crop survives tool switches and Ctrl+C/Ctrl+S includes the markup without Apply crop.
- Browser clipboard denial opens a small focused delivery window for a one-time automatic PNG/PDF copy. It closes after success and retains Copy/Save after failure; stale or partial captures are never automatically delivered.
- Companion has an explicit 400px popup width, compact result layout and visible version. Advanced options and help remain available without crowding the default capture view.
- Clicking image previews opens the editor; PDF previews open independent staged copies in the default PDF app. Image/PDF drag buttons and the Pad move icon are removed; thumbnail dragging and movement from the Pad edge remain.
- Text content is draggable, double-click selects its displayed text, and the text drag control remains available. Browser-key errors now distinguish missing connection, focus and tab readiness.

## 1.6.1 — unreleased

- Fixed key recording permanently disabling single-key mode: recording now suspends and restores registrations while preserving the enabled setting, including cancel/close. Settings shows actual Windows registration status, and Save reconciles missing registrations.

## 1.6.0 — unreleased
- Added Capture Pad Quick crop: Ctrl+C copies a pending selection and Ctrl+S saves it directly, preserving the original and regular-editor drafts.
- Split browser shortcuts into visible PNG (Alt+Shift+S), full scrolling PNG (Alt+Shift+L) and full scrolling PDF plus clipboard PNG (Alt+Shift+P).
- Added local paginated PDF output, popup PDF download, bounded clipboard delivery to desktop, PDF storage and native file dragging from Capture Pad/history.
- Kept the existing Ctrl+Alt+S monitor snapshot shortcut and separate Ctrl+Shift+S Windows region snipping.
- Added default-on taskbar exclusion for monitor snapshots, including revealed auto-hide taskbars.
- Added opt-in spare-key assignments, recording, conflict recovery, immediate release and optional startup resume for standard Windows keyboards.
- Added an optional per-user browser control helper for spare-key visible PNG, full PNG and full PDF captures. Permissions are requested separately and can be removed from Companion Settings.
- Rebuilt Companion around three direct capture actions, folded advanced options, actual shortcut badges and a separate settings page. Added a stable public extension ID for local host registration.

## 1.5.1 — October 16, 2026

- Added persistent Light and Dark themes to desktop history, settings, Capture Pad, editor and browser Companion. Theme changes apply immediately; desktop and extension choices are separate.
- Compacted history filters to one row with Pinned and Trash icon controls and accessible names.


## 1.5.0 — October 16, 2026

- Rebuilt desktop and Companion presentation as a light capture workbench with slate text and teal controls.
- Thumbnail-first Capture Pad removes repeated labels and separates move, history and close controls.
- History uses grouped filters and an optional Select toolbar; bulk deletion is explicitly labelled Trash all matching.
- Editor and settings use responsive controls, semantic groups and clear keyboard focus.
- Fixed stale Settings saved feedback after resetting shortcuts, and blocked edits during pending saves.
- No new runtime dependency, remote font or image service. Native capture and storage behavior remain unchanged.


## 1.4.0 — 2026-10-15 (public preview)

- Crop opens with adjustable full-image edges and corners; Draw area remains available. Fixed shrinking locked ratios, cancelled gestures and maximized editor opening.
- Added configurable Ctrl+Alt+S quick capture of the monitor under the pointer, copied ready to paste.
- Added bounded recovery after clipboard contention, sleep/resume and display changes; minimized history no longer suppresses the Capture Pad.
- Made the Pad a compact horizontal surface with one close control, a thumbnail and an explicit Open history label.
- Successful multi-image drops clear their selection; cancelled drops preserve it.
- Fixed lost browser injection errors, stale interrupted capture state and repeating sticky headers inside scrolling panels.
- Opening the extension no longer copies old captures over newer clipboard contents; asynchronous preview and Copy results keep their image identity.
- Live Windows hibernate/long-duration use, installer upgrades and actual Brave/Search Console capture remain acceptance checks, not certified by simulated tests.

## 1.3.1 — 2026-10-13 (public preview)

- Retained result pages now copy only after an explicit Copy image click. A regression proved that loading/focusing the old result page previously attempted to write over newer clipboard content; the new behavior removes that delayed automatic write. This is a reproduced code path, not proof of the reported Wispr interaction.
- Keep shortcut captures on the current page; retry image copying in the focused captured document instead of opening a result tab. Keep Copy/Save in the popup when automatic copying is unavailable.
- Quietly record recently restored images without repeating capture sound/Pad alerts. Explicit Windows snips still notify.
- Coalesce duplicate clipboard sequences, retry temporarily unavailable snapshots, and check for missed notifications every 500 ms. Recreate failed listener windows and keep image decoding off the hotkey thread.
- Release the Windows clipboard before bitmap conversion/PNG encoding.
- Defer Pad arrivals during native moves/drags and use native visibility when restoring drag surfaces.
- Live Wispr interaction, multi-hour reliability, installation and actual browser clipboard delivery still require acceptance testing.


## 1.3.0 — public preview

- Renamed desktop and Companion to SnipyNest, retaining legacy local-data and upgrade identities.
- Added bounded scroll retries, settled scroll measurements, dominant-panel detection and explicitly partial capture recovery.
- Retained successful PNGs after failed attempts and improved focused clipboard retry.
- Added Capture Pad inactivity settings, capture sound volume/sample and bulk Trash/Undo.
- Added public installation, privacy, contribution and release documentation.

Automated checks pass; live browser/native acceptance remains incomplete. See docs/VERIFICATION.md. This preview does not promise support for every website or animation.
