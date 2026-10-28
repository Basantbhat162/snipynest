# SnipyNest Companion 1.6.0 development build

Capture supported webpages as PNG or PDF, copy, or save the completed file. SnipyNest desktop must be running with monitoring enabled to collect the clipboard capture. Copied does not mean desktop storage acknowledged it. Optional Native Messaging carries desktop-key control messages; image and PDF bytes still use the bounded clipboard bridge.

PDF output also carries the capture through a bounded custom clipboard format understood by desktop 1.6.0. The normal PNG remains available to paste into image editors, chats and documents. An older desktop can collect only the PNG.

## Install or update

Requires Chromium extension APIs equivalent to Chrome 116 or later. Chrome, Edge and Brave require live acceptance testing for this build. Load this directory with Load unpacked in extension management, or reload the existing unpacked extension after updating its files. The desktop installer does not update the extension.

This build adds a stable public extension key for the optional desktop connection. Its ID is `boihglcaihdnnnpfkojeaaoicdnjdcbh`. Existing unpacked entries without that key may need to be removed and loaded again. Review actual shortcut assignments afterward; browser settings and saved theme preferences may reset for the new ID. The manifest contains only a public key, not a private signing key.

The popup has **Quick snapshot**, **Scrolling image** and **Scrolling PDF** buttons. **More capture options** contains area, output and extra-rendering-time controls. **Settings** contains the theme, actual shortcut assignments and the optional desktop connection. Change shortcut assignments in the browser’s extension-shortcut page; the extension cannot assign arbitrary browser commands itself.

Enable file URL access separately for local HTML. Browser settings, extension stores and protected documents cannot use scrolling capture; use Win+Shift+S there.

## Modes

- Full page: finite documents; automatically detects a dominant visible inner scrolling panel. Ambiguous panels require explicit selection.
- Visible area: one viewport at the current scroll position.
- Feed: starts at the top, capped at the initial document height or five viewports. This does not capture an infinite timeline completely.
- Scrolling panel: click inside a panel with its own scrollbar. Its entire viewport must be visible in the browser. Escape cancels selection, which also times out after 30 seconds. Cross-origin embedded scrollers are unsupported.

**Alt+Shift+S** takes a quick visible-area PNG at the current scroll position and copies it automatically. **Alt+Shift+L** captures a full scrolling page as PNG. **Alt+Shift+P** captures a full scrolling page as PDF and also copies its PNG. These shortcuts choose their own area and output regardless of saved popup mode. The old Alt+Shift+S command identity is retained for existing installations; its behavior is now visible capture. Existing custom assignments remain in place; new shortcuts may be unassigned if another extension uses them. The popup shows the actual assignments and links to shortcut settings. Desktop Ctrl+Shift+S starts Windows snipping; Ctrl+Alt+S captures the monitor under the pointer.

Keep the captured tab selected, the browser restored, and size/zoom unchanged. The popup may close while capture continues. Focus and same-document URL changes no longer automatically fail capture; changing tabs or replacing the document does. Cancel restores scroll and temporary styles. Dynamic content can still cause seams; use Visible area or Windows snipping when coverage is unreliable.

Enable **Wait longer for animations and lazy images** for slower pages. Capture leaves page animations running and preserves large pinned visual scenes. This improves opportunities for content to render but cannot guarantee every WebGL scene, custom scroll engine, or scroll-driven transition; Visible area is the reliable fallback for a particular frame. Full page measures the actual scrolling element to avoid false end-of-page failures.

## Results and limits

Choose **More capture options → Output → PDF + PNG clipboard image** for a PDF of the chosen capture area, or use **Scrolling PDF** / its shortcut. PDFs use A4 image pages with JPEG encoding at quality 0.95; text is not selectable or searchable. The limit is 100 pages, 32 MiB PDF, and 64 MiB combined retained PNG/PDF. Page content stays local; PDF generation needs no external service, debugger or download permission. Save PDF and Save PNG are available in the popup for five minutes. Partial results stay PNG-only and are never automatically copied as complete captures.

## Optional desktop keys

In desktop **Settings → Browser keys**, select your browser and set up the connection. This registers `com.snipynest.companion` under the current Windows account and prepares a versioned local helper. In Companion **Settings**, enable desktop-key access. Its permission prompt requests Native Messaging and all-site capture access because an external desktop key does not grant activeTab for a newly opened page. Ordinary popup capture and browser shortcuts keep working without this permission grant.

Assign spare keys in desktop **Single-key capture**, enable the mode and save. Browser visible PNG always captures one viewport; Browser full PNG and Browser full PDF always scroll the full bounded page, independently of saved popup options. A focused normal tab and an idle capture service are required. Focus loss or tab changes cancel pending control requests. The control channel carries only action codes, temporary session IDs, tab IDs and readiness, never page URLs or captured pixels. It uses local Windows messages, without a TCP listener. Native messages are bounded to 4 KiB.

**Disconnect and remove extra access** closes the port and removes the optional permissions. Closing the desktop restores reserved keys; the helper cannot restart the app or capture by itself. App startup refreshes an existing helper registration. After an upgrade, disconnect and reconnect Companion if its old helper port remains open. The helper is user-installed code, not a hardware driver.

With desktop 1.6.0 running and monitoring enabled, a copied PDF capture appears as a PDF in Capture Pad and All history. Drag its preview or grip to a compatible file-drop destination; not every app accepts PDFs. The PDF is copied into staging before sharing, preserving the stored original. Desktop monitoring pause prevents collection. Clipboard success alone does not certify that desktop stored the PDF. If copying fails, keep the captured page active or reopen the popup and choose Copy PNG + PDF, or Save PDF.

The latest completed PNG stays available for five minutes or until a replacement capture succeeds. Reopen the popup for preview, Copy retry or Save PNG. Copy runs from the focused popup. When offscreen copying fails, the extension tries the still-focused captured page in its isolated extension context. It never opens or focuses a result tab automatically. If copying is denied, the page loses focus, or the PNG exceeds the 16 MiB automatic-transfer limit, open the popup and use Copy image or Save PNG. The retained result limit remains 64 MiB. Clipboard failure preserves the result; a PNG toolbar badge marks an uncopied result.

Limits: 32 million pixels, 32,767 pixels per side, 50 frames, at least 550 ms between frames, a 90-second capture-loop deadline, a 20-second image-processing request timeout, and 64 MiB completed PNG. Raw canvas memory can reach 128 MB plus temporary bitmap/encoding memory. Horizontal overflow is omitted. The offscreen document closes on failure/cancellation; successful captures retain the bounded result.

## Verification

Run node --test extension/tests/*.test.mjs. Tests execute production adapters through simulated Chrome/DOM APIs, including focus/hash handling, active-tab/document protection, capture modes, cleanup, stitching and clipboard failure recovery. They do not certify live browsers.

Live acceptance still requires Chrome/Edge/Brave popup and shortcut captures, nested panels, feeds, zoom/DPI, cancellation, clipboard denial, PNG download and installed desktop ingestion. See docs/VERIFICATION.md in the project.

## 1.3.0 recovery

Scroll offsets are measured after settling. Fractional bottom rounding is tolerated, and stalls get two bounded retries. A permanent stall with captured frames produces an explicitly partial image that is not automatically copied. Capture visible area and Choose scrolling panel are directly available after errors. Save capture diagnostics downloads a local bounded trace without page text or screenshots. No diagnostics are uploaded.

This is a public preview. Production-adapter regressions do not certify actual Brave/Chrome/Edge clipboard permission behavior. Browser automation could inspect its inventory, but policy blocked access to extension management to reload and verify this build. No claim of all-website support or live certification is made.

Opening the popup does not automatically copy an older retained result over your current clipboard. Use **Copy image** for that result; a new capture started in the popup can still finish copying automatically while focused. Interrupted capture state is restored before retrying. If a page has several similar scrolling panels, use **Choose scrolling panel** to select the intended content.

### Appearance

Choose Light or Dark from the Theme selector in Companion Settings. The selection persists for extension pages independently of the desktop app. Screenshots retain their original colors.
