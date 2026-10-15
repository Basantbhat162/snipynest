# Changelog

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
