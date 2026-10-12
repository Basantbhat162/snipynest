# Revamp scope and acceptance

The requested outcome is a usable, supportable desktop clipboard workspace and companion, not merely a changed theme. Implementation proceeds at the existing clipboard, storage, native drop, frontend IPC and annotation seams.

## Acceptance criteria

- Image and multi-item drags initiate a native Windows data object while the primary pointer is held; no database ID or image path is substituted as text.
- History queries are bounded, paginated, and protected from stale asynchronous results. New clips respect current filters. Copy failures stay visible.
- Crop geometry clamps to original pixels; guides are excluded from export; undo is bounded; full-resolution export awaits successful storage/clipboard delivery.
- Companion runs under MV3 CSP, respects capture quota, restores modified page state on failure/cancellation, streams frames with pixel limits, and reports delivery failures.
- Layout remains usable at 320px and 380px. Keyboard focus, modal containment, error states, recovery, and busy states are observable.

## Verification

Run package test/check/build scripts and the Rust suite. Browser fixture tests use tests/ui-harness.html and the official Tauri mock IPC helper; they verify frontend behavior but cannot prove native Windows clipboard, drag targets, hotkeys or real extension permissions. Record those distinctions in docs/VERIFICATION.md.
