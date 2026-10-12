# Copy Tool Domain Glossary

The ubiquitous language for Copy Tool (SnipyNest), establishing precise definitions for all domain concepts across planning, specifications, and code.

## Language

**Clip**:
An individual captured item (text, image, link, or file reference) along with its associated metadata, timestamp, source application, and hash.
_Avoid_: Snippet, clipboard item, record, entry

**Sidebar**:
The vertical desktop surface housing Clip history, categorization, search, and action triggers.
_Avoid_: Flyout, drawer, popup, floating window

**Peek Mode**:
Window state where the Sidebar automatically dismisses when user focuses another application or clicks outside.
_Avoid_: Auto-hide, dismissible mode, ephemeral mode

**Pinned Mode**:
Window state where the Sidebar stays visible and anchored across external clicks and focus shifts.
_Avoid_: Always-on-top, sticky mode, persistent window

**Blob Store**:
The content-addressable local filesystem storage holding binary image payloads indexed by their SHA-256 hash.
_Avoid_: Cache, media directory, assets folder, file store

**Clip History**:
The persistent chronological SQLite-backed archive of all captured Clips.
_Avoid_: Clipboard log, paste history, database records

**Multi-Drop**:
The drag-and-drop gesture where multiple selected Clips materialize simultaneously into an external target application or file path.
_Avoid_: Bulk drag, mass paste, multi drag-and-drop

**Snip**:
A localized screen-region or window capture initiated by shortcut or toolbar action.
_Avoid_: Screenshot, screen grab, print screen

**Page Snip**:
A high-definition capture of an entire webpage or scrolling document from top to bottom.
_Avoid_: Full page screenshot, scrolling capture, web grab

**Annotator**:
The inline, windowed or fullscreen image workspace for cropping, highlighting, drawing, text, numbered steps, and opaque redaction; saving creates a new Clip while keeping the original.
_Avoid_: Editor, paint tool, markup screen

**Companion**:
The browser extension that captures supported page regions at native device resolution and writes PNG to the clipboard. Clip History ingestion requires the desktop listener; clipboard success alone does not acknowledge storage.
_Avoid_: Plugin, browser add-on, web scraper

**Trash**:
The soft-delete quarantine area retaining removed Clips for a configurable recovery window before permanent purging.
_Avoid_: Recycle bin, deleted items, archive

**Capture Pad**:
The movable utility surface showing the latest image and unread count. Click opens Sidebar; drag the thumbnail to share; move the dedicated handle to reposition. It follows the cursor monitor sampled when an image reaches the clipboard, preserving manual placement on that monitor. It can dock beside the taskbar but is not an embedded taskbar widget.

**Draft**:
One bounded local recovery checkpoint for an unfinished Annotator session, distinct from a saved Clip. It expires after seven days and never silently replaces another image's unfinished edit.

**Capture result**:
The Companion's completed PNG retained for retrying clipboard copy or saving a file. The background copy expires after five minutes or when a replacement capture succeeds. A focused result tab retains its loaded PNG independently until closed, allowing clipboard retry and file saving.
