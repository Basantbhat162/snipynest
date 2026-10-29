# ADR 0011: Direct crop export and clipboard-delivered PDF captures

Date: 2026-10-28
Status: implemented in 1.6.0 development source; live browser/native acceptance pending.

## Decision

Keep Ctrl+Alt+S as the existing monitor-under-pointer snapshot and Ctrl+Shift+S as Windows region snipping. The Companion's existing Alt+Shift+S command identity now always captures the visible viewport; separate new commands capture a full scrolling PNG (Alt+Shift+L) or full scrolling PDF (Alt+Shift+P). Commands do not inherit the popup's saved capture mode. Actual browser bindings remain visible and user-configurable.

Capture Pad opens Quick crop in the existing main WebView using the displayed image's exact Clip ID. The regular editor cannot be silently replaced. Quick crop reuses the crop geometry and original-resolution document; export reads the pending crop into a temporary canvas without committing it or changing undo state. Ctrl+C copies; Ctrl+S saves a new Clip. Closing is immediate because the original is unchanged. Quick crop neither restores, writes nor discards the regular editor's single Draft. Regular-editor Apply crop and draft confirmation remain available.

PDF uses the same bounded scrolling capture as PNG, split into A4 raster pages with JPEG encoding, rather than a print dialog or browser debugger. It is limited to 100 pages, 32 MiB PDF and 64 MiB retained PNG plus PDF. The offscreen result owns both Blob URLs for five minutes; replacement/expiry revokes both, failed captures preserve the prior result, and partial output is PNG-only. Existing capture cancellation, page restoration, processing timeout and dimension limits remain in force.

One clipboard write contains standard image/png plus `web application/x-snipynest-capture-pdf`. Chromium's [custom-format API](https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api/) supports explicit nonstandard payloads; its [Windows format mapping](https://chromium.googlesource.com/chromium/src/+/main/ui/base/clipboard/clipboard_format_type_win.cc) and [writer](https://chromium.googlesource.com/chromium/src/+/main/ui/base/clipboard/scoped_clipboard_writer.cc) describe the JSON format map and numbered native slots. Native ingestion recognizes only the exact capture MIME, a bounded numbered slot and bounded PDF bytes with header/EOF. It does not accept clipboard paths, execute content or add a native messaging host. This is a format bridge, not sender authentication.

PDF ingestion precedes ordinary PNG ingestion for that clipboard item. The desktop stores the PDF as a content-addressed file Clip with an optional PNG thumbnail; the standard PNG remains on the clipboard for paste. Copy on a stored PDF materializes an independent staged file and publishes CF_HDROP. Dragging and Export likewise use independent `.pdf` copies, so receiving apps cannot change the canonical blob. Trash and blob cleanup include PDFs. Capture Pad queries recent image/file captures without pinned-first sorting. Its fourth control increases height to 112 logical pixels.

## Evidence and limits

Production regressions cover direct crop pixels and unchanged originals, component keyboard commands, shortcut routing, PDF strip coverage and byte offsets, combined clipboard representation, bounds checks and PDF storage/staging lifecycle. See ../VERIFICATION.md for executed checks.

Browser mocks cannot certify Chromium custom clipboard mapping, permissions or live capture. Native clipboard and target-app drag interoperability, installed upgrade, mixed-DPI presentation and physical monitor screenshots require live acceptance. Clipboard success does not acknowledge desktop storage. PDF image pages have no searchable text, and JPEG introduces lossy encoding. No claim of arbitrary-app PDF support is made.
