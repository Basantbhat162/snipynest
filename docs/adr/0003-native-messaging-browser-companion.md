# ADR 0003: Native Messaging Companion for HD Full-Page Browser Capture

## Context
Capturing a full webpage (like the GoFullPage browser extension) from an external desktop process without browser cooperation requires synthetic mouse-wheel scrolling, screen grabs, and image stitching. In practice, this technique fails on modern web layouts: sticky navigation headers duplicate across seams, infinite scroll pages trigger infinite loops, CSS transforms distort, and pixel ratios are clamped to display resolution rather than crisp high-DPI canvas dimensions.

## Decision
We architect a two-tier capture capability:
1. **Primary HD Mechanism (Companion Extension):** A lightweight browser companion extension for Chromium (Chrome, Edge, Brave) and Firefox that integrates with Copy Tool via the standard Chromium Native Messaging API (`stdin`/`stdout`). When the user presses the dedicated capture shortcut, the extension invokes `chrome.debugger` (`Page.captureScreenshot` with `captureBeyondViewport: true`) or full-height scroll-and-stitch in memory at full device pixel ratio, and streams the uncompressed PNG directly into Copy Tool's IPC stream.
2. **Fallback Native Window Mechanism:** For non-browser native windows (PDF readers, long code listings, documents), Copy Tool provides an automated scrolling capture driver using Win32 `WM_VSCROLL` and edge-blending image alignment.

## Consequences
- Produces flawless, 100% crisp HD full-page captures identical to GoFullPage without browser window distortions.
- The captured webpage immediately materializes inside the Copy Tool Sidebar and Annotator without intermediate file-save prompts.
