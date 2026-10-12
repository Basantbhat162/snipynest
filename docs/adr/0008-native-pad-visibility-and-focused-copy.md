# ADR 0008: Native Pad visibility and focused Companion delivery

Status: implemented in 1.2.2; live Windows/browser acceptance remains pending.

## Failure and decision

Capture Pad is shown with Win32 ShowWindow(SW_SHOWNOACTIVATE) to avoid stealing focus. Framework hide relied on a cached visibility flag that could remain false after this native show. Tao's visibility implementation can skip the native call when the requested flag matches its cache. Pad dismissal now uses ShowWindow(SW_HIDE) on the UI thread and checks IsWindowVisible. Settings and native close use the same native owner. The Pad's native shadow is disabled to remove the extra outer edge.

Source evidence: [Tao window visibility](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/windows/window.rs) and [window flag application](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/windows/window_state.rs). This explains the code path; it does not replace testing on the user's three monitors.

Companion offscreen clipboard permission does not guarantee a focused document. Copy retry now writes from the popup itself. If offscreen delivery fails and the popup is absent, the background opens a focused extension result tab. That tab owns a loaded PNG independently of the five-minute offscreen lifetime and offers direct Copy and Save. A clipboard rejection never discards a successful capture. No new permissions or Native Messaging bridge were added.

Full-page height uses the scrolling element's scrollHeight, avoiding false failures from body offsetHeight. Page animations remain running; large pinned scenes are not removed as repeated headers. An optional longer render wait supports lazy and animated content within existing frame, pixel and time bounds. Arbitrary animation engines, protected pages and infinite capture remain outside the guarantee.

## Image feedback

Image arrival plays the default Windows sound when the capture-sound preference is enabled. Windows mute and sound scheme remain authoritative. It signals stored image arrival, not the beginning of a snip.

Previews are bounded at 768 pixels per side, preserve aspect ratio and never upscale. Existing small previews are lazily replaced from original blobs into a versioned disk cache. Decoding is serialized; original image bytes remain unchanged. Original deletion also removes its derived preview. Full-resolution content remains available in the Annotator.

## Verification

Regression tests cover focused popup copy, independent result-tab retention and retry, actual scrolling height, pinned scene preservation, and original-preserving preview regeneration. Native visibility is checked at runtime. Automated tests do not establish native focus, sound, mixed-DPI movement, live browser clipboard delivery or animation fidelity. See ../VERIFICATION.md for exact results and remaining acceptance.
