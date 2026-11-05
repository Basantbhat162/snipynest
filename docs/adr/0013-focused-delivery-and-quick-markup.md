# ADR 0013: Focused delivery fallback and quick markup

Date: 2026-10-30
Status: implemented in 1.6.2 development source; acceptance limits in VERIFICATION.md.

## Decision

Brave rejected a real PNG/PDF write from the production offscreen document in an isolated browser profile. A focused extension page could write the same representations. After offscreen and captured-page attempts, delivery first asks the focused action popup. If unavailable, it opens a small extension window only while the captured tab remains selected in the focused browser. A result-bound, one-use lease expires after 30 seconds and is invalidated by a new capture or acknowledged copy. The delivery page makes one automatic attempt, closes after success, and keeps explicit Copy/Save after failure. Generation checks prevent a delayed completion from opening a window for a replacement capture. Reopened, expired and partial results never automatically overwrite the clipboard. This amends ADRs 0008 and 0011; result bytes retain their existing bounds and expiry. Browser copying still does not acknowledge desktop storage.

Quick crop is now labelled Quick edit and exposes all existing Annotator tools while starting on Crop. Its pending selection survives tool switches and is hidden during drawing so it cannot intercept pointer events. Export reads the selection from the marked-up document without committing crop or touching the original or regular-editor Draft. Ctrl+C copies; Ctrl+S saves a new Clip. Close retains the existing immediate transient-session behavior.

Capture Pad/history preview clicks open an image editor or a PDF in the default PDF application. PDF opening uses an independent staged copy from the existing file-sharing service, never the canonical blob or a frontend-supplied path. Native drag gestures suppress their following preview click. Thumbnail dragging remains; image/PDF drag icons and the Pad move icon are removed. The Pad's top edge retains movement. Text content and its grip both use the existing complete Unicode native payload; double-click selects displayed text.

Companion fixes its intrinsic width at 400 logical pixels rather than constraining the initial popup to a provisional viewport. Default actions and a compact retained result fit Chromium's popup height. Advanced settings remain disclosed separately; very tall expanded/error states can still scroll. The loaded version is visible, and old unpacked installations must be explicitly updated. The stable public ID remains authoritative for the optional desktop helper.

## Evidence limits

Production adapter tests cover copy denial, focus loss, one-use/stale leases, replacement races and transient crop/markup behavior. Isolated Brave exercises real offscreen composition, PNG/PDF encoding and focused clipboard writes; a simulated lease checks automatic write/close separately. Those checks do not certify real shortcut dispatch, all websites, desktop ingestion or arbitrary PDF applications. See VERIFICATION.md for any additional live evidence.
