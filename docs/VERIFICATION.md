# Verification — SnipyNest 1.6.1 key-recording fix, October 29, 2026

- Reproduced a settings regression in the production KeyboardSettings component: recording changed an enabled draft to disabled, so the next Save persisted mode off even though assignments remained. The regression failed before the fix and passed after replacing permanent disarm with token-scoped temporary recording suspension.
- Frontend/Companion suite passed 112 tests and TypeScript check passed. Coverage includes preserving the enabled setting after recording, Escape, closing Settings, and distinguishing an enabled draft from inactive Windows registrations. Production frontend build passed.
- Rust source suite passed 50 tests, with three live-clipboard tests intentionally ignored. A new test uses the actual Windows registration thread: reserve F11, suspend, reject a stale recording token, restore, explicitly disarm without a late resume, and reclaim the key from a fresh service after Drop. This extends the previous simulated registration-adapter coverage; it does not inject keyboard input or capture screenshots.
- In the running Windows app, inspected the saved key configuration without reading clipboard contents, enabled the existing assignments and saved through the native Settings UI. A real Page Up key press through Windows input hid SnipyNest and launched a process with the title `Snipping Tool Overlay`. No capture region was selected by the agent. This verifies one live snip trigger; it does not certify physical keyboard variants, modified chords, monitor PNG clipboard output or browser actions. Private UI captures and local configuration remain outside Git.
- The 1.6.1 x64 NSIS installer built and passed the local-path binary scan. Installer/extension copies and ZIP entries were verified and SHA-256 listings generated; the release executable passed native-host stdio smoke checks. The local app executable was backed up, replaced with a byte-verified 1.6.1 build and restarted, preserving its existing data folder and saved enabled configuration. An initial copy hit a transient executable lock and restored/restarted the previous build; a bounded retry completed successfully. This was an executable update, not an installer-upgrade acceptance test. The final native UI recheck was interrupted by the user's physical Escape key; further Computer Use stopped, so recording/Save in the updated running UI is not claimed as live-verified.

## Earlier 1.6.0 implementation verification — October 29, 2026

- Added taskbar exclusion, opt-in spare keys and the optional desktop/browser control connection. TypeScript check and production frontend build passed. The final full frontend/Companion run passed 110 tests, including the public-extension-ID/host-allowlist and adjacent browser-setup feedback regressions. The first final run exposed a fixed 30 ms wait in the quick-crop test under build load; the test now waits for the actual export result with a bounded deadline and passed the full rerun.
- Rust passed 49 tests, zero failures, with three live-clipboard tests intentionally ignored. Coverage now includes allowed/reserved keys, registration conflict rollback/release, all work-area edges and negative monitor coordinates, revealed auto-hide taskbar trimming, bounded native frames, browser registry namespaces, nonce/focus guards and cancellation on tab change. These adapter tests do not certify physical key suppression or physical mixed-DPI displays.
- Built the x64 NSIS installer with the public path-remapping build and passed its local-user/checkout-path binary check. Packaged installer and Companion ZIP, verified ZIP layout and byte-for-byte source/installer copies, and generated SHA-256 checksums. The actual release GUI executable, copied under the helper name in an ignored test folder, passed framed JSON stdio roundtrip, oversized-message rejection and disallowed-origin rejection. The smoke test sent readiness=false and requested no capture or keyboard registration.
- Bundled Chromium loaded the actual unpacked MV3 extension under its expected public ID. Real extension APIs returned three capture commands, optional desktop permissions were off by default, the popup opened the settings page, and a theme change persisted without page errors. This exercised the extension runtime without capture or clipboard writes; it does not certify installed Brave, Chrome or Edge.
- Synthetic browser layout checks covered popup Light/Dark at 320 and 360 pixels, Companion Settings and desktop keyboard settings at 320 pixels. No horizontal select overflow or page errors were found. Visual inspection confirmed readable direct capture actions and narrow keyboard controls. The design detector flagged existing small helper text, an intentionally source-less preview hidden until a capture loads, and existing error styling; shortcut/result functional text was increased. No private screenshots were used or staged.
- Remaining acceptance: physical bare keys and their modifier combinations, conflicts with Windows Print Screen/vendor software, tray release/restart/crash recovery, per-user Native Messaging setup/upgrade/uninstall in Brave/Chrome/Edge, actual all-site permission grant/revocation, active-tab/focus races, taskbar auto-hide and mixed DPI, PDF clipboard ingestion and file paste/drop into target apps. Idle overhead from the optional polling connection has not been measured. Native automation could not initialize in this session; no claim of completed live desktop acceptance is made. Maintainer review is required before a main-branch release; this remains an unsigned preview candidate.

## Earlier 1.6.0 capture verification — October 28, 2026

- TypeScript check passed. Frontend/Companion suite: 103 passed, zero failures. After retaining the legacy command identity for the new visible shortcut, the affected browser-adapter suite passed again (18 passed), followed by a final full run (103 passed). Coverage includes shortcut routing independent of saved mode, page restoration, direct pending crop export with original/undo preservation, Ctrl+C/Ctrl+S, Escape, Pad crop targeting, PDF assembly/strip coverage and combined PNG/PDF clipboard payloads.
- Rust suite passed: 41 passed, zero failed; three live-clipboard tests intentionally ignored. Added bounds/mapping checks and production storage/staging lifecycle coverage for PDF ingestion, deduplication, query paths, file dragging, Trash rejection and original preservation after editing staged files. Updated mixed-DPI placement regression for the Pad's 112 logical pixel height. The first run exposed the prior 88px expectation; the corrected run passed.
- Production frontend build passed as part of the privacy-remapped Windows build. Optimized NSIS installer built and passed the local-path privacy check. Packaged installer: 2,751,813 bytes. Companion ZIP: 28,615 bytes; all 15 source files plus license notices matched, and ZIP integrity passed. SHA-256 checksums generated locally. These are local development artifacts, not a published release; neither installer nor extension was installed during verification.
- Synthetic in-app-browser fixture: Quick crop opened at original 960 × 600 dimensions, keyboard left-edge resize selected 950 × 600, and Copy exported a PNG with exactly 950 × 600 pixels without Apply crop. Ctrl+S dispatched save/close. At 320 × 800, the editor had equal client/scroll width of 320px with eight crop handles and Copy/Save controls reachable. The 216 × 112 Pad displayed all four controls and Quick crop dispatched open_from_pad. IPC was simulated; these checks do not certify native window or clipboard behavior.
- A real 960 × 2400 synthetic canvas was encoded using production screenshotPdf in Chromium. Independent strict pypdf parsing verified two A4 pages with 1,357 and 1,043 image rows, preserving all 2,400 rows. Both pages were rendered with bundled Poppler and visually inspected: top, middle and bottom content remained in order, without missing strips or malformed PDF objects. PDF text is rasterized, and JPEG encoding is lossy.
- Initial browser connection was refused while the development server was starting, followed by a navigation timeout; attaching to the completed fixture restored verification. Temporary viewport overrides were reset. Browser policy prevented opening a local file URL; PDF verification used offline parsing/rendering instead. Only synthetic verification data and screenshots were used, kept outside tracked source.
- Still unverified: actual installed Brave/Chrome/Edge shortcut assignment and capture, custom PDF/PNG clipboard delivery into the updated desktop, monitoring-pause acceptance, PDF file paste/drop into target apps, installed upgrade/data preservation, native X/Escape/focus/drag cancellation, physical multi-monitor/mixed-DPI behavior, sound, hibernate and prolonged use. Passing mocks and compilation do not certify those paths. No performance improvement or all-website support is claimed.

## Previous release

# Verification — SnipyNest 1.5.1 preview, October 16, 2026

- Optimized Windows NSIS build passed the local-path privacy check. Installer: 2,725,407 bytes; Companion ZIP: 25,271 bytes with 14 source files and two license notices verified. Packages were not installed during this session.
- Core dark text/action/error contrast pairs measured at least 6.75:1; this is not a full accessibility certification. Public-file scan: 165 indexed files, zero findings.
- TypeScript and production frontend build passed. Frontend/Companion tests: 95 passed, zero failures. New shared-theme tests exercise persisted restore, sibling-window storage events, invalid values, listener cleanup, selector persistence and failed-storage feedback.
- Rust tests passed: 39 passed, three live-clipboard tests intentionally ignored. Native behavior is unchanged; this run preceded the version-only bump.
- Browser fixture checked Light/Dark switching, persistence after reload, Pinned/Trash navigation and one-row filters at 320px. Settings dialog had equal client/scroll width (290px), with no horizontal overflow. Light history was inspected at 380px. Companion theme control and dark layout were inspected over localhost, not an installed extension.
- Dark editor and Capture Pad were visually inspected with a synthetic image: the original image colors stayed intact, all eight crop handles remained visible, and the Pad retained its three controls.
- Desktop windows use origin-local storage events for appearance only. Browser extension pages have a separate saved preference. Image pixels and clipboard ingestion are unchanged.
- Native installed upgrade, actual Brave extension operation, multi-monitor and hibernate acceptance remain unverified. This is an unsigned preview.

## Previous release

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
