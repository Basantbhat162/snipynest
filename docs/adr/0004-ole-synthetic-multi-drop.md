# ADR 0004: OLE Synthetic Multi-Drop Protocol for Windows Drag-and-Drop

## Context
A key differentiator requested by the user is seamless drag-and-drop: selecting multiple images or text clips from the Sidebar and dragging them directly into external software (Photoshop, File Explorer, Discord, Slack, email clients, text editors). Windows standard drag-and-drop relies on OLE COM interfaces (`IDataObject`, `IDropSource`). Most apps expect physical file paths in `CF_HDROP` to accept image drops, but pre-writing every clipboard item to permanent disk paths before dragging pollutes the user's filesystem and consumes I/O.

## Decision
We implement a native Win32 OLE Drag-and-Drop COM adapter in Rust with dynamic payload synthesis:
1. **Multi-Format Exposure:** The active `IDataObject` advertises `CF_HDROP`, `FileGroupDescriptorW` / `FileContents`, `CF_DIBV5`, `CF_UNICODETEXT`, and `text/uri-list`.
2. **Lazy File Materialization:** When dragging begins, the engine prepares a temporary staging directory (`%TEMP%\OmniCopy\drops\<session_id>\`). If the drop target queries `CF_HDROP`, the engine resolves the selected Clips, symlinks or writes the required PNG/TXT files immediately on drop confirmation, and supplies their paths in `DROPFILES`.
3. **Multi-Selection Bundling:** For multi-selection (e.g., 7 images selected), `CF_HDROP` contains all 7 file paths simultaneously. Target applications ingest all 7 items as a single bulk operation.

## Consequences
- Drops work reliably across every Windows app: file managers (Explorer, Total Commander), graphics editors (Photoshop, Figma, Illustrator), communication apps (Slack, Discord, Teams, WhatsApp), and web browsers.
- Temporary staged files are automatically cleaned up when the drop session finishes.
