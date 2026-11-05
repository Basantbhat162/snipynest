# ADR 0014: Direct area capture and lossless editor PDFs

Date: 2026-11-03
Status: implemented in 1.6.3 development source; live acceptance recorded separately.

## Decision

The desktop Screen snip action now freezes the monitor under the pointer and opens a pre-created, hidden WebView over that monitor. It no longer injects Windows' snipping shortcut or launches Snipping Tool. The existing Annotator owns the selection and markup; there is one document implementation. The native session keeps one bounded PNG in memory, with a capture reservation and a random session ID. Selecting a rectangle writes neither clipboard nor history. Copy, Save image and Save PDF are explicit actions. Escape, close and focus loss release the session and its screenshot. A failed initial load releases its reservation after a bounded timeout.

The capture window is sized and positioned in physical monitor coordinates on the UI thread. React maps selection coordinates to the original physical pixels. This avoids assuming a primary display origin or a fixed DPI. The first implementation selects within the monitor under the pointer; spanning monitors requires another capture. A protected screen may be blank. Keeping the capture WebView warm is an implementation choice, not a measured latency or memory guarantee.

Editor Ctrl-plus/minus and Ctrl-wheel change the image scale, not the WebView page zoom. Ctrl+0 fits the image and Ctrl+1 sets actual pixels. The same guards as pointer zoom prevent scale changes during a drawing or export. Line joins the existing annotation tools. Quick edit undo preserves its pending selection.

Save PDF uses the pending selection and committed markup, even without Apply crop. The native encoder flattens transparency onto white and writes full-resolution RGB strips into A4 PDF pages using PNG-compatible Flate compression. Long images are split by rows; no JPEG recompression or image downsampling occurs. The PDF is limited to 100 pages and 32 MiB and becomes a file Clip with a thumbnail. Existing staged file export and dragging share independent copies. This does not make raster text selectable or recover detail lost before import. Companion's existing JPEG PDF encoder remains separate.

## Duplicate images

A production database regression reproduced two active image Clips from identical RGB and opaque RGBA PNGs. Blob normalization now uses RGBA before hashing. A separate alias table recognizes up to 64 matching-dimension legacy candidates per insert without rewriting their original blobs or IDs. Existing duplicate rows are not automatically deleted. Content changes, including alpha changes, remain separate images. This addresses a reproducible history duplication cause; it does not certify Windows Terminal or Claude Code's own paste/drop behavior.

## 1.6.4 compact capture controls

Area capture has a separate compact presentation over the same Annotator document and handlers. A 34-pixel-wide strip follows the selection's side; a 174 × 34 action row follows its bottom. Placement clamps to the viewport and avoids overlap between the strips. At screen edges the controls can sit inside the selection. Color/stroke, text and less-used tools appear only on request. The full editor remains the presentation for existing images and Capture Pad Quick edit. Popup Escape restores its trigger focus; Escape outside a popup cancels capture. Tool strips are excluded from exported canvas pixels.

## Verification

See [VERIFICATION.md](../VERIFICATION.md). Browser fixtures use synthetic images and simulated native IPC; they do not establish native window, clipboard, hotkey, mixed-DPI or external-drop acceptance.
