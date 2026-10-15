# ADR 0010: Quiet capture feedback and non-disruptive clipboard delivery

Date: 2026-10-13. Status: implemented for 1.3.1 preview; live acceptance pending.

## Desktop

WM_CLIPBOARDUPDATE and a 500 ms recovery timer signal a dedicated clipboard reader through a one-slot bounded channel. The reader checks GetClipboardSequenceNumber and coalesces repeated messages, attempts a changed snapshot five times quickly and up to twelve additional times at five-second intervals (1.4.0), and does not replay paused or startup contents. An outer listener loop recreates a failed window/message loop. In 1.4.0, synchronous power/display broadcasts are forwarded into that loop to re-register notifications and timers. Resume re-arms only failed reads; completed, startup and paused contents remain quiet. An inaccessible zero sequence preserves prior state. Clipboard image decoding cannot block the hotkey thread. Bitmap bytes are copied before releasing the Windows clipboard; conversion and encoding then run without holding the global clipboard lock. Snapshot notifications are coalesced, so this is not a zero-loss history guarantee for rapid overwrites.

A session cache retains 64 normalized image fingerprints, seeded from recent image history. A repeated fingerprint still updates history but does not replay sound or Pad arrivals. SnippingTool.exe and ScreenClippingHost.exe are explicit capture producers and may notify for identical pixels. This also quiets deliberate repeated copies in other apps; it is a documented tradeoff, not a claim that the clipboard exposes the intent of a third-party dictation app. No new clipboard content logs or telemetry are added.

One pending Pad arrival replaces older pending arrivals. A native move/drop defers presentation for up to 30 seconds, checked every 250 ms only while pending. Dismissal and newer arrivals invalidate stale callbacks. Presentation and sound remain separate, so retrying display never repeats sound. Native visibility, rather than framework cached visibility, controls drag presentation and arrival checks.

## Companion

This supersedes ADR 0008's automatic result-tab fallback. Complete images first use offscreen copying. If denied, an isolated-world function in the still-focused captured document attempts Clipboard API delivery. The capture token prevents copying after document replacement; focus is checked immediately before writing. Base64 transfer is limited to 16 MiB of PNG bytes, while the retained popup result remains limited to 64 MiB. No new permissions, page-world scripts, focus changes or native bridge are introduced.

Failure keeps the existing PNG badge and popup Copy/Save controls. Partial images are never automatically copied. There is no delayed automatic copy on a later focus event in the captured page. The legacy result page remains usable when explicitly opened, but is never opened by capture completion.

Clipboard API context behavior is documented in [MDN's extension clipboard guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard). Actual browser permission behavior still needs live acceptance.

## Evidence and limits

The former production-adapter test expected a focused result tab. Requiring no new tab failed before the fix and passes after it. Tests cover focused-page copy, lost focus, stale document/result identity, partial output, restored image feedback, bounded fingerprints, duplicate sequence notifications, bounded retries and pause semantics. These tests do not reproduce Wispr's real clipboard restoration or certify multi-hour Windows behavior. See ../VERIFICATION.md.

Retained result pages now copy only after an explicit Copy image click. A regression proved that loading/focusing the old result page previously attempted to write over newer clipboard content; the new behavior removes that delayed automatic write. This is a reproduced code path, not proof of the reported Wispr interaction.


## 1.4.0 follow-up

Native window changes from asynchronous commands are dispatched to the UI thread. Resume reconciles Pad placement, topmost visibility and inactivity timing without rewriting clipboard contents. Minimized history does not count as a visible Sidebar. The new explicit quick monitor capture uses bounded GDI pixels (32 megapixels, 64 MiB encoded maximum), copies PNG/DIB and stores a Clip when monitoring is enabled. Monitoring pause means clipboard-only capture. Its own image fingerprint enters the shared arrival cache, so later restoration is quiet.

Companion injection errors travel as structured results because thrown page-side exceptions may arrive without a result. Missing replies are validated before accessing metrics. Retained capture state restores before a new worker session; pinned elements are measured relative to the selected panel. Popup result snapshots bind image bytes, URL and identity; stale loads cannot repaint newer results, and Copy acknowledges the image actually written. Merely reopening a popup cannot authorize an old capture to overwrite newer clipboard data.
