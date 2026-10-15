# Verification — SnipyNest 1.5.0 preview, October 16, 2026

## Current redesign

- Windows NSIS build and local-path privacy check passed. Installer: 2,724,693 bytes. Companion ZIP: 24,017 bytes; all 13 extension source files plus two license notices matched committed content, and archive integrity passed. SHA-256 checksums were generated. These packages were not installed during this session.

- TypeScript check passed; 92 frontend/Companion tests passed, zero failures. New production-component regressions cover stale Settings saved feedback after Reset shortcuts, edits during a pending save, and the Pad history control during native sharing.
- Rust suite passed: 39 tests, zero failures, three intentionally ignored tests that mutate the live clipboard. Native capture/storage code is unchanged by this redesign.
- Core text/action/error palette pairs measured at least 5.48:1 contrast; this does not certify every state or screen-reader interaction.
- Production frontend build passed. No added runtime dependencies, remote fonts, blur layers or looping animation. Final generated assets are about 26.95 kB CSS and 335.38 kB JavaScript before compression. Bundle size does not establish runtime latency or memory use; no new performance benchmark is claimed.
- In-app browser fixture: history, search empty-state/recovery, selection disclosure, editor crop entry, keyboard left-edge resize (960 to 959 pixels), Apply crop and Save dispatch worked. The editor fit at 320 x 800 CSS pixels with all eight resize targets and footer actions. Final settings at 320px had no horizontal overflow and full-width select values. A 418 x 880 history view was also inspected.
- Pad fixture measured 216 x 88 CSS pixels, with an image target and three separate move/history/close controls; history and close dispatched the expected native commands. Existing tests preserve arrival ordering and sharing reentry protection. Browser fixtures simulate native IPC, so these checks do not prove actual cross-app drops or window behavior.
- Companion popup HTML/CSS was visually inspected over localhost, including the native Capture help disclosure. This is not a live extension capture test; all 47 Companion production-adapter regressions passed as part of the full suite.
- Browser access disconnected mid-review; a fresh in-app browser connection restored final visual checks. Temporary viewport overrides were reset. Preview screenshots contain only synthetic fixture data and remain local.
- Live Windows install/upgrade, mixed-DPI windows, actual Brave/Chrome/Edge capture and clipboard access, physical hibernate and long-running use remain unverified. Existing 1.4.0 limitations and the Linux-only glib advisory assessment below still apply. This is an unsigned preview, not a claim that every function is bug-free.

## Previous release

# Verification — SnipyNest 1.4.0 preview, October 15, 2026

## Current update

- Frontend/Companion: 89 tests passed. TypeScript check and frontend production build passed.
- Rust: 39 passed, zero failed, three live-clipboard tests intentionally ignored. Tests include an actual hidden Win32 test window receiving power/display broadcasts, bounded retry recovery, inaccessible clipboard sequences, pause privacy, shortcut migration/conflicts, capture limits and pixel conversion. A simulated 50-cycle suspend clock test is not a physical hibernate test.
- Observed failing regressions before fixes: locked crop edges/corners refusing to shrink; injected browser preparation errors becoming null viewportWidth; interrupted worker state blocking the next capture; repeated inner-panel sticky headers; old popup results overwriting newer clipboard content; stale startup/preview responses and wrong Copy acknowledgements; permanently abandoned clipboard reads after five failed attempts; transient sequence zero replaying completed content.
- Brave HTTP fixture: Crop opened selected with a full-image guide and all eight handles; keyboard left-edge resize changed 960 to 959 pixels; mouse left-edge drag changed width to 843 pixels; Apply crop updated the original-resolution canvas to 843 x 600. Compact Pad rendered at 216 x 88 logical pixels with one close control and working close/open-history command dispatch. Fixture native IPC is simulated. After recovering from a browser-control timeout, the 320 x 800 editor fixture displayed all crop tools, eight handles and footer controls without horizontal clipping. The viewport override was reset. Actual native maximizing remains unverified.
- Production dependency audit (`pnpm audit --prod`) reported no known vulnerabilities on October 15. This does not prove the absence of application vulnerabilities. GitHub flagged [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g) in glib 0.18.5. Locked target-specific dependency trees confirmed glib is absent from the shipped Windows x64 graph and present only through the Linux GTK stack. The alert remains open; Linux is unsupported and no Linux package is distributed.
- UI mechanical detector returned no findings for changed editor, Pad and settings surfaces. This is not an accessibility certification.
- Optimized Windows NSIS installer built and passed the local-path privacy check. Packaged installer: 2,726,026 bytes, identical to build output. Companion ZIP: 22,738 bytes, all 13 source files and two license notices verified; ZIP integrity and SHA-256 generation passed. These packages have not been installed during this session.
- Actual Brave/Search Console capture and clipboard permissions, Windows quick monitor capture, installed upgrade, cross-app native drops, mixed-DPI monitor changes, audible sound, Wispr interaction and multi-hour/hibernate reliability remain unverified. The unavailable native automation and blocked browser extension-management surface were not bypassed.
- Known remaining risks: custom/animated/virtualized pages may require a smaller mode; protected or hardware-rendered screen content can be blank; rapid clipboard overwrites can be coalesced; delayed clipboard rendering can change sequence IDs; an offscreen but visible Sidebar can suppress Pad arrivals. These changes address concrete tested defects, not every possible cause of a missing Pad.

## Earlier verification records

### SnipyNest 1.3.1 preview, October 13, 2026



- Retained result pages now copy only after an explicit Copy image click. A regression proved that loading/focusing the old result page previously attempted to write over newer clipboard content; the new behavior removes that delayed automatic write. This is a reproduced code path, not proof of the reported Wispr interaction.
- Observed red regression: shortcut clipboard failure opened a focused result tab despite the new requirement to remain on the page. The corrected regression passes.
- Frontend/Companion: 64 tests passed; TypeScript check and frontend production build passed.
- Rust 1.3.1 tests: 28 passed, zero failed, three live-clipboard tests intentionally ignored. Optimized Windows NSIS installer built successfully; public binary passed the local-path privacy check. Packaged installer: 2,706,874 bytes, identical to build output. Companion ZIP: 21,979 bytes; all 13 source files plus two license files matched, ZIP integrity passed, and SHA-256 checksums were generated.
- New coverage: focused-document fallback and focus loss, stale result/document guards, partial-result exclusion, recent-image notification suppression, bounded fingerprint cache, sequence coalescing, missed-event recovery and bounded retries after clipboard contention.
- Live browser control is now available, but policy rejected brave://extensions; reloading/testing the installed Companion through that surface was blocked. No alternative control path was used. Actual Brave/Chrome/Edge clipboard delivery remains unverified.
- Native clipboard tests that modify the user's clipboard remain ignored. Actual Wispr dictation/restoration, 2–3 hour soak, sleep/resume, multi-monitor Pad behavior, audible sound and installed upgrade remain unverified.
- Recent identical non-Windows-snip images are intentionally quiet (64 fingerprints, seeded from recent history). This is content-based suppression, not identification of Wispr or proof of its clipboard behavior. A genuinely new image from another producer still alerts. Clipboard history is never rewritten to preserve a dictation transcript.
- Recovery checks run every 500 ms; notification delivery is still primary. No measured real-time, zero CPU, zero-loss or all-websites guarantee.

## Earlier verification records

### SnipyNest 1.3.0 candidate, October 12, 2026

Status: update candidate. Automated verification is complete; live native/browser acceptance is not complete.

## Public preview publication

The maintainer authorized publishing the current project as an open-source preview on October 12, 2026, superseding the earlier completion-before-publication gate. Remaining checks below stay open and prevent a stable-release claim. Public packaging replaces the earlier supplied sound with an original synthesized cue; earlier candidate byte counts do not describe the public rebuild.

## SnipyNest 1.3.0 candidate

- Final frontend/Companion suite: 61 passed, zero failures. Combined with Rust: 85 passed, three skipped. TypeScript and optimized Windows/NSIS build passed.
- Packaged artifacts: SnipyNest_1.3.0_x64-setup.exe (2,718,201 bytes) and SnipyNest-Companion-1.3.0.zip (19,859 bytes). Installer copy matches build bytes; ZIP integrity and all 12 entries match final extension sources.
- Generated installer checks passed for SnipyNest product/publisher/version and legacy uninstall/install-location registry identity. This does not replace running the installer.

- Implemented SnipyNest display branding with legacy storage, mutex and installer upgrade identity. No GitHub publication. Installed upgrade not tested.
- Observed red regression tests for delayed scroll sampling, fractional bottom rounding, a nested main panel silently producing a one-screen image, and previous-result loss when a subsequent capture fails. Each was corrected and passed its regression.
- Added bounded scroll retries, explicitly partial output without automatic copying, shared shortcut settings, source-scoped status, result acknowledgement, cleanup watchdog and local diagnostics download.
- Added native Pad inactivity timeout (eight seconds default, configurable), optional Sidebar-close return, interaction pause, approved WAV with amplitude control/sample, and transactional snapshot-based bulk Trash/Undo.
- Rust tests: 24 passed, zero failed, three live-clipboard tests skipped (27 total). TypeScript checking passed. Sound test verifies PCM data and amplitude scaling; it does not prove audible Windows playback.
- UI static detector reported only an image without src in the extension result section. The entire section starts hidden; source is assigned before showing it. No live visual check is claimed.
- Browser-control initialization failed twice, including after resetting the kernel: “failed to write kernel assets: The system cannot find the path specified.” Browser inventory itself was inaccessible. Actual Brave/Chrome/Edge extension testing, native Pad gestures and installed app/upgrade checks could not be run. This prevents release certification.
- Remaining plan items: live original-site reproduction/verification; dynamic extent growth and arbitrary custom scrollers; persistent session recovery after worker restart; adaptive image/font settling; per-monitor Pad position memory; detailed on-disk storage breakdown/cleanup; unsaved-settings confirmation and measured performance/stress acceptance. Do not interpret candidate packaging as completion of these items.

## Previous desktop and Companion 1.2.2

- Final optimized Windows build and NSIS packaging passed after the last Settings correction. Installer: artifacts/OmniCopy_1.2.2_x64-setup.exe (2,661,905 bytes), verified identical to the build output. Companion: artifacts/OmniCopy-Companion-1.2.2.zip (17,062 bytes), ZIP integrity and all 12 entries verified against source. Packages have not been installed in this session.

- Frontend/Companion tests: 54 passed, zero failures. Rust backend: 22 passed, zero failures, three live-clipboard tests intentionally ignored (25 total). TypeScript and frontend production build passed.
- Observed failing regressions before fixes: popup retry delegated clipboard write to an unfocused offscreen document; inflated body offsetHeight caused a normal scrolling document to fail.
- New checks exercise focused popup delivery, focused result-tab creation only when the popup is absent, retained result-tab PNG and retry after clipboard denial, actual scrolling height, large pinned visual scenes, and longer render wait.
- Preview checks verify 768-pixel bounded regeneration, cached reuse, unchanged original bytes, and derived-file cleanup.
- The remaining Pad close defect was traced to mixing native show with framework cached visibility. Both close and Settings off now hide through Win32; close verifies actual native visibility. This is source-level diagnosis, not live reproduction on the user's displays. See ADR 0008.
- Capture sound uses the Windows default sound on stored image arrival, with a default-on preference. No sound, final native Pad appearance, live clipboard, or installed browser claim is made from the automated suite.

## Previous desktop 1.2.1 patch

- Optimized Rust compilation and NSIS packaging passed. The completed installer was copied to artifacts/OmniCopy_1.2.1_x64-setup.exe (2,653,774 bytes). It has not been installed in this session; prior 1.2.0 checksum files do not apply to this package.
- Final TypeScript and frontend production build passed. Frontend/Companion suite: 49 passed. Backend: 21 passed, three live-clipboard tests intentionally skipped (24 total).
- Observed failing tests before fixes: native text-only payload advertised CF_HDROP; drag pointer-down failed to suppress browser selection.
- Added production-seam checks for full Unicode native selections without file staging, mixed-selection rejection, absent Clips, image staging, movement guard reentry/cleanup, three-monitor placement with negative coordinates and mixed DPI, same-monitor preservation and work-area clamping.
- Brave browser fixture inspection confirmed the final 176x126 logical Pad layout, one close control, handle drag command dispatch, close after dragging, open history and Escape. Fixture IPC is simulated; these checks do not establish native move, hide, focus, or cross-app drop behavior.
- The user clarified that the intermittent “Cut” failure means X/close becoming unresponsive after moving a window. This is treated as a window movement/close defect, not a crop-tool defect. The actual Win32 failure has not been reproduced with native automation, which is unavailable in this session. ADR 0007 documents the concrete risks fixed and the remaining evidence limit.
- Native acceptance for this patch: move Sidebar and Pad repeatedly on all three displays; release, Escape/cancel, click X, reopen with Ctrl+Shift+V; check snips on each monitor and plain-text drops into target apps. Retest Peek blur and image-drop restoration. Installation/upgrade is not yet live-verified.
- Companion remains 1.2.0 and is unchanged by this desktop patch.

## Previous 1.2.0 baseline

- TypeScript checking and frontend production build passed.
- Frontend/Companion regression suite: 48 passed, zero failures. Production adapters run against simulated Chrome/DOM APIs. Coverage includes focus and hash changes, wrong-tab/document guards, manual scrolling during capture, visible/feed/selected-panel modes, restoration, bounded stitching, retained results after clipboard failure, crop geometry/pixels/ratio lock, redo, draft write ordering and cross-clip protection, drag gesture ownership/cancellation, and history query races.
- Rust backend: 16 passed, zero failures, three intentionally ignored tests that mutate the live clipboard (19 total). Coverage includes real storage/staging seams, original image isolation after a staged file is overwritten, complete Unicode payloads, native OLE advertised payload memory, preferences and shortcut parsing.
- Regressions were observed failing before fixes for independent drag copies, crop ratio resizing, and manual page movement during browser capture.
- Final optimized Windows compilation and NSIS packaging passed. The installer in artifacts/OmniCopy_1.2.0_x64-setup.exe matches the final build output byte for byte. All ten files in artifacts/OmniCopy-Companion-1.2.0.zip match the final extension source. SHA-256 hashes are recorded in artifacts/SHA256SUMS-1.2.0.txt. These are unsigned local packages; they have not been installed or live-certified.
- Earlier development fixture checks covered Sidebar at 380px, narrow settings/editor at 320px, paging/filter/search/error recovery and crop/undo. During this update, an existing loaded fixture showed the expanded editor at 1200x800 and the mode button changed to Return to sidebar. A subsequent refresh could not connect to the local preview through the browser tool. Final interactive draft/crop/Pad flows therefore remain unverified; the loaded fixture is not proof of the final native app.

## Live acceptance still required

- Install/update on a clean Windows account, preserving existing Clips and preferences; startup, duplicate launch, tray and uninstall behavior.
- Repeated Win+Shift+S and Ctrl+Shift+S capture, cancelled snips, paused capture, disk/queue failures, and quiet Pad arrival without stealing focus.
- The user's movement/close failure: native live reproduction is still required; the 1.2.1 movement fixes and 1.2.2 native hide correction address identified code defects but still require testing on the user's setup. Include Settings off, repeated X/Escape, sound on/off and Windows mute.
- One/five-image drops to Explorer, WhatsApp and Codex; valid target payloads; faded/hide presentation; click-through and exact restoration after cancellation without focus theft. Use the Hide during drag preference if layered-window behavior is unsuitable.
- Expanded/fullscreen native editing, dirty close, draft recovery after restart, crop handles and keyboard controls, saving/copying, and movement while a new image arrives.
- Mixed DPI at 100/125/150/200%, monitor disconnect, Pad snapping/position reset, and editor work-area bounds.
- Actual unpacked Companion in Brave, Chrome and Edge: popup/shortcut, static pages, X feeds, selected panels, browser zoom, cancellation, PNG download, clipboard denial/retry, popup closure and desktop ingestion. Protected browser pages require Windows snipping.
- Idle CPU below 0.1%, total memory including WebView2 processes, repeated editing/capture sessions, and 50 consecutive clipboard items. No measured runtime CPU/memory or zero-loss stress claim is made.

## Implemented bounds and deliberate limits

- One latest-image Pad; no automatic full Sidebar opening. It floats beside the taskbar, follows the cursor monitor sampled at the clipboard event, and remembers one desktop position, not a per-monitor layout or embedded taskbar widget. Windows toast integration is absent.
- One live editing document uses the same WebView across inline/window/fullscreen. Editor mode and bounds are not persisted. Explicit zoom remains absolute on resize, but checkpointed drafts do not preserve viewport/pan.
- Editor originals: 40MP, 32767px per side; undo history: 4 MiB accounting and 256 operations; one recovery draft: 64 MiB serialized and seven days. Saved Clips are flattened PNG, not editable project files.
- Companion output: 32MP, 32767px per side, 50 frames; one background result PNG up to 64 MiB retained five minutes or until next capture; each opened result tab owns its loaded PNG until closed. Feed mode captures at most five initial viewports. Dynamic content is not guaranteed seam-free. Cross-origin embedded scroll areas and protected browser pages are unsupported.
- Companion delivery is the system clipboard, not Native Messaging or desktop storage acknowledgement. The desktop installer does not update the extension.

Historical HANDOFF.md and walkthrough.md claims do not certify this version. ADRs 0006–0008 record the implemented architecture and subsequent corrections.
