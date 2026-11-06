# Quick clipboard popup: research and compatibility boundaries

Researched: 2026-11-06. Sources were accessed on that date. This is planning evidence, not a completed implementation or a Windows compatibility certification. Public issue reports below describe individual workflows; they are not a representative survey or proof that a reported problem affects every current Windows build.

## Recommendation

Build a small, keyboard-first quick-paste view over SnipyNest's existing local Clip History. Keep the detailed Sidebar available through a separate action. Prioritize reliable destination focus, one-action paste, search, the five requested categories, pinning and safe clearing. Treat taking over Win+V as an optional compatibility feature with a fallback shortcut. Exclude emoji, GIF, AI transforms and inline editing from this first scope.

## What Windows documents

Microsoft documents a clipboard history limit of 25 entries and a 4 MB per-item limit. Supported history formats include text, HTML and bitmaps. Unpinned history is cleared on restart; pinned items remain. Clear all preserves pinned items. Cloud synchronization is tied to an account and is separately configurable. These are concrete differentiation opportunities for an existing persistent local history; they do not establish that Windows lacks every other feature on every build. [Microsoft Support: Using the clipboard](https://support.microsoft.com/en-us/windows/apps/using-the-clipboard).

Microsoft's current Advanced Paste documentation also demonstrates configurable activation shortcuts, access to clipboard history and a direct plain-text paste action. Its default activation is Win+Shift+V. These are useful interaction precedents; the much broader conversion/AI feature set is outside this popup's proposed scope. [Microsoft Learn: Advanced Paste](https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste).

## First-person needs and failure reports

| Evidence | What the author reported or requested | Planning implication |
| --- | --- | --- |
| [PowerToys #33820](https://github.com/microsoft/PowerToys/issues/33820), opened 2024-07-13 | Type-to-search history from a shortcut; avoid scrolling similar-looking entries; possible Win+V replacement. | Put search directly in the compact view. Do not require opening the detailed Sidebar to find text. |
| [PowerToys #41931](https://github.com/microsoft/PowerToys/issues/41931), opened 2025-09-22 | Search, type/pinned filtering, optional stay-open after paste and inline editing. | Search/filtering fit this MVP. Defer repeated-paste mode and editing so the default remains one selection, one paste, then close. |
| [PowerToys #43824](https://github.com/microsoft/PowerToys/issues/43824), opened 2025-11-23 | Focus was lost after pasting through Command Palette's clipboard extension. The issue is marked fix committed. | Destination focus is part of correctness. This is a historical failure example, not a claim that current PowerToys still has it. |
| [PowerToys #33110](https://github.com/microsoft/PowerToys/issues/33110), opened 2024-05-28 | A private-copy workflow that avoids history retention and can expire clipboard contents. | Preserve capture pause and producer privacy markers; avoid expanding this task into a new secret-storage product. |
| [CopyQ discussion #3588](https://github.com/hluk/CopyQ/discussions/3588), asked 2026-05-04 | The Windows panel intercepted Win+V in the shortcut editor even with clipboard history disabled. | Disabling Windows history is not evidence that the shortcut becomes available. Do not promise takeover based on a hotkey setting alone. |

The CopyQ replies suggest remapping tools or registry edits. Those are community suggestions, not a Microsoft-supported takeover contract, and are not recommended as automatic app behavior.

## Can SnipyNest replace Win+V?

`RegisterHotKey` documents Windows-key shortcuts as reserved for the operating system; registrations generally fail when another hotkey already owns a chord. A normal registration cannot guarantee overriding the built-in panel. [RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey).

A low-level keyboard hook can return a nonzero result to suppress an event. Its callback must remain fast, use the installing thread's message loop and forward unrelated events. Windows can silently remove a timed-out hook. This makes a dedicated, minimal hook a candidate to test, not proof of dependable Win+V replacement. [LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc). Hook events identify injected input, which can help prevent the app handling its own generated input recursively. [KBDLLHOOKSTRUCT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-kbdllhookstruct).

Recommended product contract:

- A configurable, conflict-checked quick-popup shortcut always remains available. Preserve the user's current full-history assignment. Do not silently install Ctrl+B globally: it is commonly used for Bold.
- Offer **Use SnipyNest for Win+V while running** only after a compatibility spike passes. Default it off initially; explain the fallback. Closing the popup does not disarm it, but disabling takeover or exiting must restore ordinary Windows behavior.
- Intercept only the explicitly enabled chord. Do not collect keystroke text, rewrite registry hotkey settings, disable Windows history, change cloud settings or request elevation merely to claim compatibility.
- Reuse the app's keyboard-service boundary where feasible; do not add a competing hook or do database, image or UI work inside the callback. Hook lifecycle, crashes, sleep/resume and other keyboard utilities need acceptance coverage.

These are design recommendations, not statements that this hook path is implemented or universally supported.

## One-action paste must target the right app

Capture the foreground destination before opening the popup. On selection, validate the Clip, write the complete stored payload, dismiss the popup and restore the original destination. Confirm that destination is foreground immediately before issuing paste. If the target closed, changed or refused focus, leave the Clip copied and show a clear manual-paste fallback; never inject into whichever window happens to be active.

Windows restricts `SetForegroundWindow`, and a call can be denied even when its documented conditions appear satisfied. [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow). `SendInput` is limited by process integrity levels, does not reset held-key state, and its error result does not specifically identify UIPI blocking. Wait for activation modifiers to be released and do not silently elevate or repeatedly inject input. A successful call is not proof that a destination accepted the intended content. [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).

Microsoft defines `CanIncludeInClipboardHistory` and `CanUploadToCloudClipboard` with a serialized DWORD value of zero to exclude history and cloud respectively. `ExcludeClipboardContentFromMonitorProcessing` excludes both regardless of its data. Respect the exact registered names; do not rely on a heuristic password detector. App-owned clipboard writes also need ingestion-loop suppression. [Clipboard Formats](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats).

## Proposed compact MVP

- One search field; **All / Images / Text / Code / Links** in a compact row; a pinned-only control, clear action and **Open full history** entry.
- A short virtualized list with bounded text previews and image thumbnails. Display enough source/time context to distinguish similar clips without large headers or metadata blocks.
- Arrow keys move selection; Enter or a primary click pastes once and closes. Escape and outside click dismiss without paste. Pin/menu actions never accidentally paste. Preserve complete text even when its preview is truncated.
- A secondary copy-only action and a plain-text paste action for text-like Clips. Image/file behavior must use the proper native clipboard formats; PDF/file Clips can remain in All rather than adding another category.
- Clear means a confirmed, undoable removal of unpinned SnipyNest history, with explicit wording about its scope. It must not clear the current system clipboard or Windows history implicitly.
- Instant open/close: no scale, slide or fade animation. Load bounded results asynchronously, avoid decoding originals on open, cancel stale search results and reuse existing storage/clipboard services. Measure warm/cold opening and all WebView processes before setting performance claims.

## Compatibility gate before enabling takeover

Test left/right Win keys, both modifier-release orders, key repeat, keyboard layouts, IME, Sticky Keys, other Win shortcuts and the Start menu. Include PowerToys/remappers, dictation tools, browser/editor/terminal destinations, elevated destinations, canceled paste, focus changes, app exit/crash and suspend/resume. Test Windows history both enabled and disabled without changing it automatically. Measure popup readiness and key-to-paste completion under CPU and disk contention; CPU throttling alone does not certify low-memory or GPU behavior. Any double panel, stuck modifier, wrong-target paste or lost recovery path blocks enabling Win+V takeover by default.
