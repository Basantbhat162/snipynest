# ADR 0009: SnipyNest identity and interaction reliability

Date: October 12, 2026. Status: implemented as a 1.3.0 candidate; live acceptance blocked.

## Identity

The user selected SnipyNest. Desktop and extension display names, tray actions, titles, downloads and release packaging use it. Data directory, application identifier, mutex and Rust executable identity remain compatible with OmniCopy. A pinned Tauri 2.12.1 NSIS template retains the legacy uninstall and install-location registry keys while displaying SnipyNest. The installer removes only legacy shortcuts targeting its own binary. Startup registration moves to SnipyNest when refreshed; the old value is removed only after the new operation succeeds. Public preview publication was subsequently authorized; see VERIFICATION.md.

The template derives from the upstream Tauri installer, with its source URL in the first line. Upgrade recognition can be checked in the generated NSIS script; successful compilation is not an installed-upgrade test.

## Capture seam

Production-adapter tests reproduced the user's error text with delayed scrolling and fractional bottom offsets. A separate fixture proved that a nested main panel was silently captured as one viewport. The adapter now settles scroll position, detects a dominant visible panel and rejects ambiguous targets. The controller tolerates subpixel end rounding, retries transient stalls twice and exposes permanent-stall results as partial. The offscreen composer crops partial output to covered rows; neither it nor focused delivery automatically copies a partial capture.

Capture settings persist through extension storage; shortcut and popup share them. Status carries source tab/URL identity so the popup can distinguish previous-page status. Result identity guards clipboard acknowledgement. A failed new attempt retains the last completed PNG until its existing expiry; successful replacement revokes it. A bounded in-memory diagnostic trace can be downloaded locally. Page-side restoration has an independent 180-second watchdog if the worker disappears.

This does not implement arbitrary custom scroll engines, dynamic extent growth, full worker-session resumption, or guaranteed animation fidelity. Source URL is used locally for status scoping, not included in the diagnostic trace. No cloud telemetry or new host/debugger permission was added.

## Desktop behavior

One waiting native timer worker receives Arm/Stop messages; idle operation blocks rather than polling. Generation checks prevent stale timeout callbacks from hiding a refreshed Pad. Hover/focus suspend expiry, native moves/drags defer expiry, and manual dismissal cancels it. Default arrival timeout is eight seconds. Always-visible and Off preferences remain meaningful. Opening history hides Pad; closing history optionally shows the latest image Pad again without focus theft. Snipping hides surfaces directly rather than triggering the history-close transition.

The public build uses an original synthesized 0.54-second mono WAV is bundled as 48kHz 16-bit PCM. Playback runs on a short-lived worker, scales amplitude for app volume, coalesces overlap and suppresses system fallback sounds. Sound is emitted only for committed external image arrivals; sample playback is an explicit Settings action.

Bulk selection is a database snapshot, not a list of image objects sent through IPC. Prepared IDs and revisions are stored in clip_batches. Trash is atomic, skips clips recopied since selection, and Undo restores only that batch's deletion timestamp. One current snapshot/Undo is retained; ordinary Trash remains available after another selection replaces it. Search/category and pinned inclusion are explicit; new arrivals never enter a prepared batch.

## Evidence limits

Native timer/hover/window focus, actual sound playback, installed upgrade and live extension captures need live acceptance. The computer-use kernel failed twice (including after reset) before browser access. Do not translate the mocked regression results into a statement that GitHub, Google or ChatGPT is fixed in Brave. The remaining acceptance matrix is in ../VERIFICATION.md.
