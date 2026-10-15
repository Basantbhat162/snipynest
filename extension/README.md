# SnipyNest Companion 1.5.0

Capture supported webpages as PNG, copy, or save the completed file. SnipyNest desktop must be running with monitoring enabled to collect the clipboard image. Copied does not mean desktop storage acknowledged it. Native Messaging is not implemented.

## Install or update

Requires Chromium extension APIs equivalent to Chrome 116 or later. Chrome, Edge and Brave require live acceptance testing for this build. Load this directory with Load unpacked in extension management, or reload the existing unpacked extension after updating its files. The desktop installer does not update the extension.

Enable file URL access separately for local HTML. Browser settings, extension stores and protected documents cannot use scrolling capture; use Win+Shift+S there.

## Modes

- Full page: finite documents; automatically detects a dominant visible inner scrolling panel. Ambiguous panels require explicit selection.
- Visible area: one viewport at the current scroll position.
- Feed: starts at the top, capped at the initial document height or five viewports. This does not capture an infinite timeline completely.
- Scrolling panel: click inside a panel with its own scrollbar. Its entire viewport must be visible in the browser. Escape cancels selection, which also times out after 30 seconds. Cross-origin embedded scrollers are unsupported.

Alt+Shift+S uses the most recently saved capture mode and rendering wait (manual panel selection falls back to automatic full page for the shortcut). The popup shows the actual browser assignment and links to shortcut settings. Desktop Ctrl+Shift+S starts Windows snipping instead.

Keep the captured tab selected, the browser restored, and size/zoom unchanged. The popup may close while capture continues. Focus and same-document URL changes no longer automatically fail capture; changing tabs or replacing the document does. Cancel restores scroll and temporary styles. Dynamic content can still cause seams; use Visible area or Windows snipping when coverage is unreliable.

Enable **Wait longer for animations and lazy images** for slower pages. Capture leaves page animations running and preserves large pinned visual scenes. This improves opportunities for content to render but cannot guarantee every WebGL scene, custom scroll engine, or scroll-driven transition; Visible area is the reliable fallback for a particular frame. Full page measures the actual scrolling element to avoid false end-of-page failures.

## Results and limits

The latest completed PNG stays available for five minutes or until a replacement capture succeeds. Reopen the popup for preview, Copy retry or Save PNG. Copy runs from the focused popup. When offscreen copying fails, the extension tries the still-focused captured page in its isolated extension context. It never opens or focuses a result tab automatically. If copying is denied, the page loses focus, or the PNG exceeds the 16 MiB automatic-transfer limit, open the popup and use Copy image or Save PNG. The retained result limit remains 64 MiB. Clipboard failure preserves the result; a PNG toolbar badge marks an uncopied result.

Limits: 32 million pixels, 32,767 pixels per side, 50 frames, at least 550 ms between frames, a 90-second capture-loop deadline, a 20-second image-processing request timeout, and 64 MiB completed PNG. Raw canvas memory can reach 128 MB plus temporary bitmap/encoding memory. Horizontal overflow is omitted. The offscreen document closes on failure/cancellation; successful captures retain the bounded result.

## Verification

Run node --test extension/tests/*.test.mjs. Tests execute production adapters through simulated Chrome/DOM APIs, including focus/hash handling, active-tab/document protection, capture modes, cleanup, stitching and clipboard failure recovery. They do not certify live browsers.

Live acceptance still requires Chrome/Edge/Brave popup and shortcut captures, nested panels, feeds, zoom/DPI, cancellation, clipboard denial, PNG download and installed desktop ingestion. See docs/VERIFICATION.md in the project.

## 1.3.0 recovery

Scroll offsets are measured after settling. Fractional bottom rounding is tolerated, and stalls get two bounded retries. A permanent stall with captured frames produces an explicitly partial image that is not automatically copied. Capture visible area and Choose scrolling panel are directly available after errors. Save capture diagnostics downloads a local bounded trace without page text or screenshots. No diagnostics are uploaded.

This is a public preview. Production-adapter regressions do not certify actual Brave/Chrome/Edge clipboard permission behavior. Browser automation could inspect its inventory, but policy blocked access to extension management to reload and verify this build. No claim of all-website support or live certification is made.

Opening the popup does not automatically copy an older retained result over your current clipboard. Use **Copy image** for that result; a new capture started in the popup can still finish copying automatically while focused. Interrupted capture state is restored before retrying. If a page has several similar scrolling panels, use **Choose scrolling panel** to select the intended content.
