# OmniCopy next update: capture, reach, edit, drop

Status: original design plan, October 11, 2026. Implementation decisions and remaining limits are recorded in ADR 0006 and docs/VERIFICATION.md; this plan is not a completion checklist. The user's subsequent clarification changes Pad click behavior to opening Sidebar directly, replacing the intermediate shelf below.

## Outcome

Take a snip, receive quiet confirmation, reach recent images without searching, edit at a usable size, and drag into another app without OmniCopy blocking the destination. Keep the existing local Clip History, originals, privacy exclusions, bounded storage and native file payloads.

The update preserves the existing charcoal/blue visual language. The new surfaces are functional Windows utilities, with brief feedback rather than a decorative pet or continuous animation.

## What is known

| Symptom | Evidence | Conclusion |
|---|---|---|
| Ctrl+Shift+S opens/closes Sidebar | All three registered global shortcuts currently invoke the same toggle callback | Existing behavior; change the action mapping intentionally. Ctrl+S alone is not registered as a global shortcut. |
| No OmniCopy acknowledgement after a snip | New-clip handler refreshes history; no capture acknowledgement surface exists | Missing workflow, not proof the image was lost. Windows Snipping Tool's own notification is separately controlled by Windows. |
| Sidebar covers destination during drag | Native drag prevents Peek dismissal but never changes opacity/hit-testing | Add a native drag presentation lifecycle. CSS opacity alone would still block interaction. |
| Tiny editor | Annotator is mounted inside the only native Sidebar window | Zoom alone cannot solve the constrained workspace. Add an expanded editing surface. |
| Companion scrolls but produces no image | Actual production adapter exercised by tests/debug/extension-guard-repro.mjs | Focus=false and hash-only URL changes each reproduce the exact error after scrolling, with zero capture calls and zero clipboard completion calls. This is not proof of which condition occurred in the user's Brave session. |
| Brave settings fails | Current extension rejects non-http(s)/file schemes before scripting | A full-page scrolling capture of browser settings is outside this injection-based capture method. Provide a truthful fallback. |
| X fails | No live trace yet | Investigate separately: the generic guard, dynamic routes, virtualized content, inner scrolling and delivery can produce different failures. Do not claim one confirmed cause. |

Diagnostic command already run: `node tests/debug/extension-guard-repro.mjs`. Seven deterministic scenarios exercise the production background adapter: normal popup and shortcut succeed; focus=false, hash URL change and actual tab switch reproduce the error; Brave settings rejects before scrolling. This harness simulates Chrome APIs and is not live Brave certification.

## Priority zero: protect originals during drag

The current stager uses `fs::hard_link` for PNG files with copy only as a fallback. A hardlinked staging file is not an isolated export: an application that rewrites it in place can modify the stored original and invalidate its content hash. Replace this with an independent copy before the new drag presentation work. Add a regression through the real staging seam that overwrites the staged file and verifies the canonical blob bytes and hash are unchanged. A disposable-file reproduction inside the workspace confirmed that an in-place write through the staged hardlink changed the canonical file; no user blobs were touched. The full staging-seam regression remains an implementation requirement. This is a data-integrity fix, not animation polish.

## 1. Separate capture from navigation

Proposed default mapping:

| Shortcut | Action |
|---|---|
| Ctrl+Shift+V | Toggle Sidebar |
| Ctrl+Shift+S | Start a screen snip, replacing its redundant Sidebar toggle |
| Alt+Shift+V | Retained alternative Sidebar toggle |
| Win+Shift+S | Keep Windows' native snipping behavior |
| Alt+Shift+S | Companion Page Snip while in the browser; show the actual assigned browser shortcut |
| F11 in Annotator | Enter/leave fullscreen |
| Ctrl+0 / Ctrl+1 in Annotator | Fit / 100% |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo, except while editing text normally |
| Ctrl+S in Annotator | Save a new edited Clip; do not capture this globally |

Add configurable native shortcuts, conflict detection, an in-app explanation of unavailable shortcuts and Reset defaults. Show a one-time migration note for Ctrl+Shift+S. Never silently steal a browser or application shortcut. If a requested shortcut cannot register, keep the prior working mapping and make the failure visible.

Before an OmniCopy-triggered snip, suppress its capture-facing windows, relinquish focus, then launch Windows snipping. Cancelled snips create no Clip or arrival animation. External Win+Shift+S remains supported through clipboard ingestion; do not hook every keyboard event merely to infer intent.

## 2. Introduce Capture Pad

Capture Pad is a proposed domain term: a compact movable access surface for recent image Clips. It is not a separate copy of history or an animated character.

Default placement is near the lower-right work-area edge of the active monitor, above the taskbar. It shows a latest-image thumbnail and a small new-image count. It appears without activating itself or stealing keyboard focus. Users can move it with a dedicated handle; dragging the thumbnail exports the image. These must be distinct gestures.

Click opens a small recent-images shelf with up to six recent image previews and visible Copy, Edit and View history actions. Clicking View history opens Sidebar deliberately. Users can drag directly from the collapsed thumbnail or the shelf. Copy/export and a keyboard-accessible menu remain alternatives to dragging.

The Pad can snap to desktop edges, remember position per display, and reset to a visible work area after resolution changes or a monitor disconnect. Offer always-visible, show-on-new-image and off modes; default show-on-new-image remains until dismissed or acknowledged. Closing the Pad does not quit OmniCopy; the tray still provides access and an explicit Quit action.

Do not promise a custom widget embedded inside the Windows taskbar. Support a tray icon, a normal application shortcut that the user can pin, and a floating Pad that docks above the taskbar. Avoid shell injection or replacing Windows taskbar behavior.

### Arrival behavior

| Situation | Behavior |
|---|---|
| First external image is successfully stored | Update Pad thumbnail/count; one short arrival pulse; no Sidebar or editor auto-open |
| Many screenshots in a burst | Coalesce visual feedback, update latest image and count; do not stack notifications or spawn windows |
| Ordinary text copy | Update history silently by default |
| Copying an existing Clip from OmniCopy | No new arrival pulse or false unread count |
| Edited image saved by the user | Show save confirmation in Annotator; update Pad quietly, avoiding a duplicate interruption |
| Capture monitoring paused | Pad visibly indicates pause; no false received/saved signal |
| Storage fails | Show one actionable error; never play the success animation |
| App restart | Restore bounded recent metadata without replaying historical arrivals |
| Presentation/privacy mode | Hide thumbnail contents and use an icon/count; disable arrival animation |

Use committed storage events carrying Clip ID, kind, origin/intent where known, and a monotonic arrival identifier. Process/application names alone cannot reliably prove that every image is a snip. Until an origin is trustworthy, label the event as a new image. External image arrivals may therefore include copied pictures as well as screenshots.

Default feedback is the Pad, not a Windows toast plus Pad plus Sidebar. Optional Windows notifications are grouped and off by default. Interaction should remain useful when Windows notifications are disabled. Unread count clears when recent items are viewed, not merely when an animation ends.

A small settle/pulse animation, approximately 180–220 ms, communicates arrival. No endless bouncing, idle polling or full-screen flying image. Reduced-motion mode uses a count/outline change. Explore a short thumbnail-to-Pad transition only when a trustworthy source position is known; never fabricate its path.

## 3. Make native dragging unobstructed

Once a deliberate drag has actually entered native OLE, fade the source utility surface to approximately 10–15% opacity and make it non-interactive to the drag target. Keep a compact drag thumbnail/count with the pointer where native support permits. Also offer Hide during drag for users who prefer no residual surface.

First prove opacity and OLE cursor pass-through on the actual WebView2/native window; Windows layered-window composition can differ from a CSS preview. If opacity is unreliable, retain the documented Hide during drag fallback instead of shipping a stuck or blocking translucent window.

Implement this in a native DragSession guard, not solely React state. Save the previous visibility, opacity, hit-testing, position, pinned state and owning window. Restore them on successful drop, cancellation, preparation failure, OLE error and window teardown. Avoid changing persistent Pinned Mode as a side effect.

Do not fade on click or before the movement threshold. Stage payloads before entering the presentation transition; if the button is released during preparation, cancel cleanly. Pad and Sidebar must not cover the destination or intercept its drop. Never focus OmniCopy after a drop: restore visually without taking typing focus from WhatsApp/Codex/Explorer. Preserve the user's prior visibility rather than opening a previously hidden Sidebar.

A new capture arriving during drag updates stored state and is presented after the drag; it must not reactivate or expand a window. Escape cancels the drag and restores the surface. Dragging is a copy operation; it must not remove the source Clip.

## 4. Add a proper expanded Annotator

Keep quick inline editing. Add an obvious Open in window control beside the editor title. Expanded mode is resizable, starts centered on the relevant monitor at a useful size constrained to its work area, and offers maximize and fullscreen. Remember the user's preferred editing mode and last valid window bounds. A separate Annotator participates in Alt+Tab; the utility Sidebar and Pad do not.

Use one editing session across inline, windowed and fullscreen modes. Preserve operations, crop selection, undo/redo history, tool, color, zoom and pan when changing mode. Do not reload the original and lose edits. Permit one owning editing surface per session; do not run two independent writable canvases for the same draft.

The existing component disposes its canvases on unmount. Introduce AnnotationDocument snapshot/restore (baked baseline, retained operations and step numbering), EditorSession (document plus tool/crop/text/viewport state), a bounded checkpoint store, and EditorHost. For a window handoff, resolve the active pointer gesture, freeze edits, checkpoint, restore the destination hidden, then show and acknowledge it before releasing the source. A failed handoff leaves the original session intact. Fullscreen changes the existing host; it must not remount the document. Store viewport state as Fit or absolute image scale plus image-space center, not fit-relative zoom and raw scroll offsets.

On narrow displays, wrap tools and keep save/copy visible. In expanded mode, give the image most of the space, center small fitted images, expose actual zoom, support zoom-to-pointer and Space-to-pan, and offer Fit and 100% as explicit actions. Crop gains visible resize handles, move-selection, pixel dimensions, optional aspect lock, keyboard nudging and clear Apply/Cancel.

Escape first cancels the active drawing/crop gesture, then leaves fullscreen; closing a dirty session requires Save/Discard/Cancel. Save failure preserves the draft. Save always creates a new Clip, preserving the original. A draft checkpoint must be acknowledged before claiming Draft kept; checkpoint failure leaves the editor open. Bound recovery to a documented storage budget and retention period with explicit discard controls. Saving a Clip and refreshing Sidebar are separate outcomes: the current callback can report a refresh failure after insertion as if saving failed, so return and retain the created Clip ID before refreshing. Copy is not the same as saving a draft. Add bounded draft recovery so an editor crash/restart is not silently treated as a successful save.

Reuse the full-resolution document engine and existing image/undo limits. Window size must not change exported pixel dimensions. Preserve original-resolution crop/redaction regression tests and add mode-transfer and draft-recovery tests.

## 5. Repair Companion capture and delivery

### Diagnose before changing the guard

Bind a request to its explicit tab ID and window ID at invocation. Record bounded, redacted stage diagnostics: trigger, document identity, guard reason, dimensions, frame count, browser/version, capture error and clipboard outcome. Do not record page contents, full browsing URLs, credentials or image bytes in logs.

Replace the merged generic message with separate conditions. A harmless same-document URL/hash change is not navigation. Use document identity/session token checks to distinguish it from a replaced page. An OS focus flag alone must not automatically invalidate a capture of a known window's active tab; validate the real browser behavior before relaxing it. Retain target-tab, document, viewport and scroll-position protections so another page cannot enter the output. Check readiness before modifying/scrolling the page.

A popup closing must not cancel or orphan the capture. Return a session acknowledgement promptly, keep work in the background, and reconnect the popup to that session's status. Cancellation, browser shutdown, tab closure, navigation and worker/offscreen failure need explicit terminal states and cleanup. Do not keep a progress indicator running forever.

### Define supported capture modes

- Full page: finite pages with stable document scrolling.
- Visible area: a reliable fallback for complex apps when the relevant browser API permits it.
- Selected scroll area: add support for a clearly chosen nested scroller, with boundary and coverage checks; do not silently select the wrong panel.
- Bounded feed capture: for dynamic/infinite feeds such as X, state the captured range or limit. Never advertise capture of an infinite timeline as a complete page. If reliable coverage cannot be established, offer visible-area capture or a Windows snip rather than a corrupted image.
- Browser settings/store/protected surfaces: disable unsupported full-page mode before scrolling, explain why, and offer Windows snipping. Visible-area API support can vary and must be verified per browser/version; do not bypass page restrictions.

Keep pacing below the browser screenshot quota. Wait for layout/image readiness within a bounded deadline, verify each frame covers the expected region, cap frames/pixels/time, and restore scroll positions and temporary styles on every terminal path. Detect content changes rather than stretching incompatible frames into a plausible-looking PNG.

### Make delivery observable

Separate Capturing, Image ready, Copied and Saved in OmniCopy. Clipboard success does not prove the desktop stored a Clip. Keep the last completed PNG in one bounded, expiring result slot with a visible preview and retryable Copy / Save PNG actions. Clipboard rejection must not destroy an otherwise good capture or force a full recapture.

The current update can retain the clipboard bridge with truthful messaging. Direct desktop acknowledgement through Native Messaging is a separately gated integration milestone after capture works; it requires a real installed host, per-browser registration, source validation and a versioned protocol. Do not claim it exists or add a broad localhost service as a shortcut.

Include Brave explicitly in the live test matrix, not only Chrome/Edge. Diagnose shortcut conflicts separately: show actual assignment and offer the browser's supported shortcut settings, without claiming that the suggested key is always available.

## 6. Native architecture and ownership

Create a WindowManager seam with explicit Sidebar, CapturePad and Annotator roles. Scope Peek blur handling to Sidebar; the current application-wide blur handler would incorrectly hide new windows. Window role owns focus, taskbar visibility, bounds, DPI, capture suppression and permitted IPC capabilities.

Use an InteractionCoordinator for native dragging, snipping and editing instead of adding shared global booleans. Each interaction has a token/guard and a deterministic restore path. Rust owns native visibility/hit-testing and committed arrival events. Frontend owns presentation and the annotation session via a narrow session interface. Route content using Clip/session IDs, not PNG data in URLs.

Lazy-create extra WebViews; do not hold several full-resolution canvases or idle rendering loops in memory. Keep Pad metadata/thumbnails bounded. Persist preferences with versioned migration/defaults; preserve the existing database and Clips. Add proposed terms to GLOSSARY and document final window/session decisions in ADRs when implementation is accepted.

## 7. Implementation order and completion gates

0. Isolate drag staging files from original blobs and lock this down with a mutation-isolation regression.
1. Companion diagnostics and reproductions: promote the specific guard regressions into normal tests; obtain live Brave evidence; separate failure categories and provide a result fallback. Gate: popup and shortcut both produce a usable image on a stable page, and genuine navigation cannot contaminate it.
2. Window/interaction foundation and unobstructed native drag. Gate: real single/multi-image drops into Explorer, WhatsApp and Codex; cancellation restores the exact previous surface without stealing focus.
3. Expanded Annotator and session preservation. Gate: crop, annotate, switch inline/window/fullscreen, undo/redo, save; pixel output remains correct and drafts survive failures.
4. Capture Pad, committed-arrival events, shortcut remapping/settings and tray access. Gate: burst capture is quiet, immediately reachable, and never opens the full Sidebar automatically.
5. Supported-page capture modes and resilience, migration/package verification, documentation and live acceptance matrix. Animation polish follows verified behavior.

Do not use an installer build or a passing mock suite as the release gate for native behavior. Preserve a reproducible UI fixture for fast iteration, then test the installed app and actual unpacked extension together.

## Acceptance matrix

| Scenario | Required result |
|---|---|
| Ten consecutive Win+Shift+S snips | All completed clips available; one Pad; coalesced feedback; zero stolen-focus Sidebar openings |
| Cancel a snip | No phantom image/count/success signal |
| Capture while paused or disk write fails | Visible truthful state; no success animation |
| Image arrives while annotating | Draft preserved; Pad updates without focus theft |
| One/five images dragged to Explorer, WhatsApp, Codex | Valid image attachments/files where target supports them; source surface unobtrusive; exact restoration |
| Target application overwrites a staged drag file | Original stored blob and content hash remain unchanged |
| Escape/rejected target/release during preparation | No stuck transparent or click-through window; no deleted source |
| Pad moved vs thumbnail dragged | Distinct predictable gestures; keyboard and menu alternatives work |
| Inline to window to fullscreen and back | Same draft, crop, history and full-resolution pixels |
| Dirty close, save failure, app restart | Recoverable draft; no false saved state |
| Window creation/checkpoint failure, stale handoff, repeated expand clicks | Original session remains available; only one editable owner |
| Clip insertion succeeds but Sidebar refresh fails | Report saved Clip correctly; retry refresh rather than duplicating the save |
| 100/125/150/200% DPI and monitor disconnect | Reachable Pad/editor and correct pointer-to-image crop mapping |
| Chrome/Edge/Brave, popup and shortcut | Real capture and explicit final delivery state |
| Same-document URL change vs navigation/tab switch | Benign change handled; wrong-document frames excluded |
| Finite page, nested scroller, X feed, browser settings | Correct mode/support message; no misleading complete image |
| Popup closed, clipboard denied, app not running | Capture state remains understandable; finished PNG recoverable/downloadable |
| Theme/high contrast/reduced motion/keyboard only | Readable controls, visible focus and fully operable actions |
| Idle and sustained use | Event-driven idle target under 0.1% measured CPU; bounded WebView/canvas memory; no growth after repeated sessions |
| Upgrade/install/uninstall | Existing Clips/preferences preserved as intended; no extra startup entry or orphan capture UI |

Live native tests unavailable to an agent must remain explicitly unverified, not converted into claims of completion.

## Platform references

- Chrome activeTab grants temporary access and restricts injection into protected pages: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Chrome tabs API documents captureVisibleTab for a specified window and its special-page/permission rules: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Windows capture exclusion is available through SetWindowDisplayAffinity on supported Windows versions, but is not a universal guarantee against every capture method: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity

Evaluate capture exclusion for the Pad and utility surfaces so they do not contaminate snips, with a tested fallback that hides them for OmniCopy-initiated capture. Do not promise interception or cancellation detection for every externally triggered Windows snip.
