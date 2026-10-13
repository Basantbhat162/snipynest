# Changelog

## 1.3.1 — 2026-10-13 (public preview)

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
