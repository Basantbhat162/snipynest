# Next update: reliable web capture and predictable desktop behavior

Status: implementation started under the confirmed SnipyNest name. The 1.3.0 candidate implements the primary capture regressions, Pad lifecycle, bundled sound, bulk Trash and branding. It does not close the full plan. See VERIFICATION.md for outstanding work and the live-browser tooling block.

## 1. Outcome and order

The extension is the release blocker. A successful capture must represent the requested content, remain available if clipboard delivery fails, and restore the webpage. A small PNG from a large app is not proof of full-page success. Desktop surfaces must appear briefly, stay available during interaction, and get out of the way predictably.

Implement in order: reproduce and instrument extension failures; correct capture/session architecture; verify the actual unpacked extension in Brave; implement desktop surface behavior; bulk history actions and settings; approved sound; cross-app verification and packaging. Preserve the existing charcoal interface, blue accent, editor, history and native drag behavior. Use no subagents.

User evidence: Brave captures ChatGPT, while GitHub pages and Google sometimes report that scrolling stopped early. A Google retry can succeed. Exact failing routes and browser version remain to be recorded during reproduction; do not invent them. Prior 1.2.2 mocked tests and release compilation did not prove live browser compatibility.

## 2. What inspection establishes—and what it does not

| Current source | Confirmed behavior | Required change |
| --- | --- | --- |
| extension/capture-core.mjs | Reads total height once; tests scroll progress immediately after requesting movement, before its rendering wait; several invalid-position conditions share one error | Measure actual settled movement and distinguish bottom, transient stall, invalid geometry and interference |
| extension/background.js | Full-page mode scrolls window; inner panels require manual selection; mode/wait/tab/result state are mutable module globals | Automatic scroll-target discovery plus explicit session ownership |
| extension/background.js | Shortcut calls the default full-page/normal-wait path | Shared persisted preferences for shortcut and popup |
| extension/popup.js | Displays global capture status and loads latest result, independent of the active page | Page-scoped status, result identity and a fresh capture action after navigation |
| src/components/CapturePad.tsx and native surfaces | Pad supports arrival/always/off but no inactivity lifecycle | One native visibility owner with timed and interaction-aware transitions |
| src/App.tsx, MultiDropBar.tsx | Selected clips can already go to Trash, through a small icon; selection resets across pages; deletion invokes one command per clip | Labelled actions, explicit selection scope and atomic batch commands |
| HousekeepingModal.tsx | One long settings form; sound is Windows default; some saved-state and shortcut labels can become misleading | Grouped settings, consistent dirty state and actual configured shortcut labels |

These are inspected constraints, not a proven diagnosis of the reported Brave failure. Before choosing a fix, create a repeatable failure through the production browser adapter. Keep a failing test or captured trace that identifies the same error path and intended content.

## 3. Extension: first milestone and release gate

### 3.1 Reproduce before changing the algorithm

- Record installed extension version, Brave version, page URL, viewport, zoom, mode, page scroll position and whether invocation was shortcut or popup. Run with the final unpacked build, not just a development mock.
- Reproduce sequences: ChatGPT → GitHub → Google → retry Google → ChatGPT; cold worker versus warm worker; popup versus Alt+Shift+S; opening/closing popup during capture. Do not assume ChatGPT's small output includes a whole conversation.
- Build local fixture pages for a normal document, body/root height disagreement, nested app scroller, delayed image layout, shrinking/growing document, fractional scroll offsets, sticky header, scroll snapping, virtualized feed, transformed smooth scrolling and pinned canvas content.
- Save a bounded, local diagnostic trace: session ID, target type, requested/actual offsets, viewport and current height, coverage, capture timing, error code and cleanup outcome. Default reports omit page text, images, full URLs, titles, query strings and secrets. Export is deliberate and previewable; no telemetry upload.
- Require a failing production-path assertion before claiming a root cause. The investigation must distinguish incorrect target, premature measurement, changing geometry and stale page/session state rather than repeatedly changing error text.

Acceptance: the observed Brave failure is repeatable or its trace is replayable; one regression command catches it. If live access cannot reproduce it, record that blocker and do not label the extension fixed.

### 3.2 Give each capture an explicit session

Introduce a controller-owned session containing ID, source tab/window/document identity, selected target, settings snapshot, frame coverage, cancellation state and result ID. Content-script page operations and offscreen composition receive this identity; stale messages cannot mutate a newer capture.

Separate stages: preparing → capturing → composing → image ready → copied, with distinct cancelled, partial and failed outcomes. Clipboard denial is a delivery outcome, not capture failure. Report the stage and a specific recovery action.

Keep one active capture globally in the first release, with a clear busy response. Store compact recoverable metadata in extension session storage. On worker restart, reconcile with the offscreen result; either recover a completed image or terminate the interrupted job clearly. Do not attempt blind continuation with stale document handles. Use a bounded content-side cleanup watchdog so page styles are restored even if the controller disappears. Close idle offscreen resources after result expiry; no permanent keep-alive loop.

This accounts for the documented ephemeral service-worker lifecycle; globals cannot be the sole source of recoverable state. See [Chrome lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

### 3.3 Detect the thing that actually scrolls

Make **Full page (automatic)** the default. Resolve root scrolling versus the dominant visible inner content panel using geometry, overflow, available scroll range and a bounded reversible movement probe. Exclude small navigation lists, hidden containers and overlays. Traverse accessible open shadow roots; treat closed shadow roots and inaccessible frames as explicit limits.

If the document does not scroll but a dominant app panel does, capture that panel and label the scope. If multiple plausible panels exist, offer an outlined selection rather than silently choosing the wrong one. Keep Visible area, Loaded feed and Choose panel as explicit modes. A genuinely short document may correctly produce one screen; a long nested conversation must not be silently represented as a full-page one-screen image.

Retain screenshot-based capture for canvas/WebGL content; do not replace rendered pixels with DOM-to-image rendering. Do not add debugger access or broad host permissions by default. Evaluate an optional alternative capture engine only against a demonstrated fixture the regular engine cannot support, with its permission and maintenance cost documented separately.

Acceptance: fixtures identify the correct target; real ChatGPT conversation, GitHub issue/README and Google results captures contain identifiable content from top, middle and bottom, or explicitly identify a partial/limited scope.

### 3.4 Scroll, settle, measure, capture

Replace the single optimistic scroll-and-read with a bounded cycle:

1. Read current viewport, target bounds and available extent.
2. Request the next overlapping position on the selected target.
3. Wait for settled position/layout across animation frames, with a finite deadline; then re-read actual offset and extent.
4. Check for user interference, document replacement and scale changes.
5. Capture real pixels, validate geometry, and append only newly covered rows using actual positions.
6. Re-measure before choosing the next position and classifying completion.

Use pixel-derived rounding tolerance instead of exact integer assumptions. Near the true bottom, clamping and fractional offsets are valid. On a stall, re-measure and make at most two bounded recovery attempts; distinguish settled end, growing content, wrong scroller and interrupted movement. Never convert unexplained truncation into full success. If usable frames exist, offer **Save partial capture**, visibly marked partial, with no automatic partial clipboard overwrite.

Handle growth under fixed time/pixel/frame budgets. For feeds, state a bounded scope such as up to five screens rather than promising the entire timeline. Virtualized pages require per-frame coverage and visible-content checks; an unreachable historical portion is reported, not fabricated. Treat duplicate/blank frame detection as evidence with false-positive safeguards—legitimately white or repetitive pages must still work.

Preserve current ceilings initially: 32MP output, 32,767 pixels per side, 50 frames, 90-second capture-loop budget and 64MiB PNG. Preflight before allocation; when a limit is reached offer a smaller scope instead of crashing. Large-page segmented export is a later feature, not a reason to raise memory bounds blindly. Keep screenshot calls paced below the API quota and use bounded backoff for transient capture errors. See [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab).

### 3.5 Motion, lazy content and clean restoration

- Replace the arbitrary longer delay alone with bounded waits for visible image decoding, fonts and stable layout; never wait indefinitely for network idle or continuous animation.
- Offer Standard and Patient rendering. Patient allows more settling time within the total budget. Shortcut and popup honor the same saved choice.
- Preserve scroll-driven animation and large pinned scenes. Suppress only identified repeated navigation when safe; offer Keep sticky content for sites where suppression removes content. Handle overlays and cookie dialogs visibly instead of automatically dismissing consent UI.
- Record and restore each changed style with original priority, window/panel offsets and temporary listeners. Cleanup must be idempotent after success, failure, timeout, cancellation and navigation.
- Do not claim perfectly seam-free full-page captures for arbitrary moving video, WebGL scenes or virtual scrolling. Provide Visible area as a deliberate capture option for a particular rendered frame.

Acceptance: fixture pixels have no missing rows, duplicated seams or unexplained blank regions; page styles and offsets restore within rounding tolerance. Real animation sites get visual inspection, not only successful return codes.

### 3.6 Clipboard, results and extension UI

- Retain the last successful PNG while a new attempt runs, within a measured aggregate memory budget. If keeping both would exceed the budget, offer saving the previous result before replacement. A failed new attempt must not silently erase an otherwise retained image.
- Bind Copy/Save to a result ID. Display capture scope, dimensions, source and completion time. An older result remains labelled as previous, never as success on the current tab.
- Use the existing focused popup/result-page copy path. Update central delivery status and clear the ready badge only after confirmed clipboard write. Prevent duplicate automatic copies, result tabs and repeated focus-triggered clipboard overwrites.
- When switching pages, primary action becomes **Capture this page**, not a stale **Try again**. Retry creates a fresh session for the currently selected source after revalidation. Keep an old result available separately.
- Put Copy and Save above the preview, with accessible progress and cancellation. Error actions should be buttons—Capture visible area, Choose panel, Save partial, or Copy diagnostics—rather than a list of mode names in an error sentence.
- Test expiry while previewing/copying, worker restart, popup closure, interrupted messaging, low memory and clipboard denial. A successful clipboard write means Copied, not Saved in desktop history; desktop acknowledgement is not implemented.

Offscreen documents provide composition, not a focusable interaction surface; retain a focused delivery path. See [Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

## 4. Capture Pad and Sidebar: one behavior policy

Default proposal: **Auto-hide after 8 seconds**, configurable to 3, 5, 8, 15, 30 seconds or Never. Keep an independent Pad Off option. Migrate existing arrival mode to the 8-second default; preserve explicit Always visible as Never and Off as Off. Add **Show Pad when closing history**, default on.

| Event | Result |
| --- | --- |
| New external image is committed while history is closed | Show one Pad without focus theft; update latest image/count; start a fresh timeout |
| Another image arrives during timeout | Update the same Pad and reset its deadline; no stacked windows |
| Pointer enters, keyboard focus enters, move begins, menu opens or native image drag begins | Suspend auto-hide while interaction is active |
| Interaction ends | Start a fresh full timeout; no disappearance immediately after releasing a drag |
| Deadline expires without interaction | Hide Pad through its native visibility owner; keep history/count |
| Pad X or Escape | Hide immediately; stale timers/events cannot reopen it; a new capture may show it again |
| Pad click or history shortcut | Open Sidebar and hide Pad; mark displayed arrivals read |
| Sidebar X or shortcut toggle closes history | Show latest-image Pad if enabled and available; start timeout |
| Sidebar hides after Copy or Peek focus loss | Respect Show Pad when closing history, but never take focus; suppress Pad during snip, native drag, modal/editor transition or shutdown |
| Image arrives while Sidebar/editor is open | Update history/count without opening a second surface or interrupting editing |
| No latest image, Pad disabled, or app exiting | Do not create an empty Pad on Sidebar close |
| Monitor disconnect, DPI change or resume | Clamp to an available work area; expire overdue timers without resurrecting dismissed surfaces |

Implement a small native surface controller with explicit show/hide reasons and generation-tagged one-shot deadlines. Avoid interval polling and separate competing React/native timers. Route X, tray, shortcut, focus loss, drag restoration and Settings through this owner. Do not hide mid-drag or let a drag restoration guard override an explicit dismissal. Keep dirty-editor close prompts ahead of surface transitions.

Remember placement per monitor when identifiable, with a safe fallback when display identity changes. Arrival follows the monitor sampled for that capture, using mixed-DPI work-area geometry. Keep the distinction between the handle moving the Pad and thumbnail dragging an image. It remains a floating desktop utility beside the taskbar, not an embedded taskbar widget.

Acceptance: fake-clock transition tests plus real three-monitor tests for hover, keyboard focus, move, drag/cancel, repeated arrivals, X, shortcuts, sleep/resume and display disconnect. Never two competing surfaces or a timer hiding an active interaction.

## 5. Selection, bulk Trash and recovery

- Put a visible **Select** control above history, then a labelled selection bar: selected count, Select this page, Select all matching clips, Clear selection, Move to Trash and Export. Keep drag available. Enable Ctrl+A only when the history list owns focus; never hijack text selection in search/editor.
- Differentiate page selection from all matching results across pages. Show the exact scope and count. Changing the filter clears selection with clear feedback; new arrivals do not join a confirmed batch.
- For all matching results, create a database-side bounded snapshot of selected IDs and exclusions so newly captured/recopied items cannot silently enter the operation. Avoid sending every image or thousands of IDs through repeated IPC calls.
- Add one backend batch-trash transaction and one restore-batch command. Return a batch token and affected count. Undo restores that exact batch and does not overwrite intervening user changes. On failure roll back; refresh pagination/counts only from confirmed outcomes.
- Include pinned clips only when explicitly selected; Select all matching excludes pinned by default with an Include pinned option and visible count. Use a confirmation for bulk/all-history operations that states scope and recovery. Move to Trash stays recoverable; permanent deletion remains separate and always confirmed.
- Keep batch Delete always available as a basic feature. Preferences may control confirmation for small recoverable selections; all-history and permanent-delete confirmations remain mandatory. Empty Trash does not mean clear active history.

Acceptance: selections spanning multiple pages, active search, concurrent arrivals, pinned exclusion, empty/last-page deletion, undo, restart recovery via Trash and injected DB failure. A large batch must not freeze the UI or load all previews.

## 6. Approved sound and understandable settings

Use the user-approved clipboard-capture-soft-click.wav as the intended bundled capture sound. The sound is approved by the user; this plan does not claim its duration, encoding or levels have been analyzed. During implementation, stage the supplied file in the workspace, inspect format/duration/peaks, preserve an original and prepare a playback copy only if needed. Record its origin and redistribution terms before public release.

Replace MessageBeep with bundled asynchronous WAV playback that works while the UI is hidden. Play after successful external image storage, not on snip start, failure, own Copy, editing save or replaying an existing event. Coalesce rapid bursts to prevent overlapping audio; do not block clipboard ingestion. Honor Windows mute and app sound setting. Add Sound on/off, volume and a Play sample button; one desktop success sound, no duplicate extension chime. Test missing/corrupt resource handling without a crash or unexpected system beep.

Split Settings into clear groups:

| Group | Controls |
| --- | --- |
| Capture & Pad | Capture pause, Pad enabled, hide delay, show on closing history, preview privacy, sound toggle/volume/sample |
| Shortcuts & behavior | Current registered shortcuts, conflict feedback, drag translucency/hide, start at sign-in, reset Pad position |
| History & storage | Active/Trash counts, actual disk use, retention, open data folder, clear history to Trash, empty Trash |
| About & help | Desktop version, extension update instructions, shortcut help, local diagnostics export |

Use plain labels and examples. Show retention's actual application timing; change retention to take effect after a successful settings save and on startup, using bounded work. Show originals, previews, temporary drops, drafts and database disk use separately rather than presenting logical clip sizes as disk savings. Shared blob references must remain valid during cleanup. Provide safe cache/temp cleanup, never a misleading button that deletes history.

All edits mark settings unsaved; save failures preserve values and report errors. Use the configured shortcuts in help, not hard-coded defaults. Keep a visible Save action and warn before discarding unsaved settings. Preserve existing preferences during migration.

## 7. Additional quality work within this update

- Keep previews crisp and aspect-correct at mixed DPI; lazy-load only visible cards and bound decoded preview memory. Preserve originals and existing full-size editor modes.
- Audit window command errors and clipboard contention so failures remain recoverable without quitting from the tray. Test pause/resume, own-write exclusion and rapid ingestion; do not claim zero loss from mocks.
- Verify native image/text drops to Explorer, Codex and WhatsApp, complete Unicode text, multi-image payloads, cancelled drag restoration and click-through behavior. Changes to visibility must not break this seam.
- Keep focus rings, accessible names, keyboard actions and contrast in narrow layouts. One subtle 160–200ms arrival/dismiss transition when enabled; immediate transitions under reduced motion. Sound, motion and preview privacy are independent settings.
- No new analytics, cloud account, theme overhaul, auto-updater or taskbar embedding. Preserve user-approved visual direction and keep the update centered on reliability.

## 8. Verification and release definition

| Gate | Required evidence |
| --- | --- |
| Original browser defect | Reproduction and minimized production-path regression; then original Brave sequence passes |
| Browser fixtures | Pixel/coverage checks at 100%, 125%, 150%, 200% zoom; root/panel/dynamic/virtualized/canvas cases; deterministic finite pages pass repeated runs |
| Actual extension | Brave first, Chrome and Edge smoke checks; popup and shortcut, cold/warm worker, page changes, cancellation, copied PNG paste and saved PNG inspection |
| Real sites | ChatGPT long conversation, GitHub long issue/README, Google home and long results, loaded X feed, article, nested app and animation example; record exact route/version/date and scope |
| Failure recovery | Clipboard denial, worker/offscreen loss, page reload, tab switch, quota, size limits and expiry; retain usable results and restore page |
| Desktop | Native Pad lifecycle, three monitors/mixed DPI, sound/mute, shortcuts, no focus theft, OLE drops, editor save/close, bulk Trash/undo |
| Performance | Measure idle CPU target below 0.1%, aggregate app/WebView memory, 50 consecutive mixed clipboard items and repeated captures; set/check peak memory bounds before release |
| Upgrade | 1.2.2 → 1.3 migration preserves clips/preferences, install/uninstall behavior, separate extension update, package version consistency |

Automated seams remain useful, but mocked API success is not browser acceptance. Visual checks must confirm image contents, not merely nonempty PNGs. Protected page restrictions and inaccessible embedded content need honest unsupported states; no promise of every website. If native/browser access is unavailable, ship only an explicitly marked candidate, not a completed reliability fix.

Deliver updated desktop installer, unpacked extension ZIP, release notes, install/update instructions and a verification record linking each known issue to evidence and remaining limits. Run final checks on final sources and verify packaged bytes. No publishing during planning.

## 9. Naming and later open-source release

Keep OmniCopy identifiers stable during debugging. ezcopyss is the user's preferred candidate, not a checked available domain or cleared brand. Choose the final display name before public release; a rename must preserve the existing app data path, installer upgrade identity and clipboard history. Do not accidentally ship a second empty app profile.

After naming: repository name can match the selected lowercase name; description proposal: “A local Windows clipboard manager with screenshot editing, quick capture access, drag-and-drop, and a browser capture companion.” Audit generated sound/icon/dependency redistribution, choose an explicit open-source license, add build/contribution/security/issue docs and exclude local clipboard data, credentials, caches, tool runtimes and build output. Publish tested installers and extension ZIPs through releases. Creating or uploading the repository remains a later user-authorized action.

## 10. Completion sequence

1. Establish the live Brave failure and a regression that catches it.
2. Implement session isolation, target detection, settled geometry, bounded recovery and page restoration.
3. Complete result identity, clipboard recovery and useful extension error actions; prove the original site sequence.
4. Implement the Pad/Sidebar state machine and preferences, then verify native transitions.
5. Implement batch selection, transaction/undo and clearer settings/storage.
6. Integrate and test the approved sound; finish accessibility/motion/preview checks.
7. Run the browser/desktop/upgrade matrix, resolve failures, package and document evidence.

The first three steps are the priority. Do not declare another extension fix complete solely because compilation and mocked tests pass.
