# Changelog

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
