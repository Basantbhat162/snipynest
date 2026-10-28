# SnipyNest

A Windows clipboard workspace with searchable history, screenshot editing, a small Capture Pad, and a browser companion for webpage screenshots.

**Current source: 1.6.0 development build.** Quick crop, PDF capture, taskbar exclusion and single-key controls described below require this build and an updated Companion. The public downloads below remain 1.5.1.

## Download for Windows

**[Download Windows installer (.exe)](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.1-preview/SnipyNest_1.5.1_x64-setup.exe)**

Windows 10/11 **64-bit (x64)** desktop only. No macOS, Linux, mobile or native ARM64 installer is currently provided. The browser extension is optional and installed separately.

| Download | What to do with it |
| --- | --- |
| [Windows installer — 1.5.1](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.1-preview/SnipyNest_1.5.1_x64-setup.exe) | Run the `.exe` to install the desktop app. |
| [Browser extension — ZIP](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.1-preview/SnipyNest-Companion-1.5.1.zip) | Extract it, then follow the [Load unpacked guide](#install-the-browser-companion). |
| [SHA-256 checksums](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.1-preview/SHA256SUMS-1.5.1.txt) | Verify the downloaded files. |

[Release notes and all files](https://github.com/Basantbhat162/snipynest/releases/tag/v1.5.1-preview). You do not need Git, a GitHub account or the source-code ZIP to install the app.

**Public preview — 1.5.1.** This is usable development software, not a certified stable release. Automated checks pass, but live browser and Windows acceptance remain incomplete. Some pages with custom scrolling, infinite feeds or animations will need a smaller capture mode. Read the [known limits](docs/VERIFICATION.md).

## Download and install

Use the Windows installer link above, or open the [1.5.1 release](https://github.com/Basantbhat162/snipynest/releases/tag/v1.5.1-preview) and expand **Assets**. Choose the `.exe` for the desktop app; the Companion ZIP is a separate optional download. GitHub’s automatically generated “Source code” archives are for developers.

1. Run `SnipyNest_1.5.1_x64-setup.exe` on Windows 10/11 x64 with WebView2 installed. This preview is unsigned; verify its published SHA-256 checksum before deciding whether to run it. Do not disable antivirus protections.
2. Launch SnipyNest. Its tray icon remains available when the window is closed. Press **Ctrl+Shift+V** to open history.
3. Copy text or take a Windows screenshot. With monitoring enabled, it appears in history. Pause monitoring before handling sensitive clipboard data.

The app retains the legacy OmniCopy data and installer identity for existing users. Back up important history before trying an upgrade. Upgrade installation has not yet passed live acceptance testing.

## Install the browser companion

The extension is currently distributed unpacked, not through a browser store.

1. [Download the extension ZIP](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.1-preview/SnipyNest-Companion-1.5.1.zip), right-click it in Windows Explorer, choose **Extract All**, and keep the extracted folder in a permanent location.
2. Open `brave://extensions`, `chrome://extensions`, or `edge://extensions` in your browser.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin SnipyNest Companion to the toolbar. Open a normal webpage, choose a capture mode and click **Capture**. Keep that tab active while it runs.
5. Use **Copy image** or **Save PNG**. Keep the desktop app running with monitoring enabled if you want copied captures saved in history.

For updates, extract the new ZIP into the existing extension folder (or remove the old unpacked entry and load the new folder). Click **Reload** in browser extension management, confirm version **1.5.1**, and refresh the page before capturing. Desktop installation does not update the extension. See the [Companion guide](extension/README.md) for modes, errors and limits.

## Appearance

Open **Settings & storage → Appearance → Theme** and choose **Light** or **Dark**. The choice saves immediately and applies to history, Capture Pad and the editor. Companion has its own theme selector in **Settings**; its choice is saved separately.

History filters share one compact row. The pin and trash icons beside Links open Pinned and Trash; hover or keyboard focus exposes their accessible names.

## Everyday use

| Action | Shortcut or control |
| --- | --- |
| Open or hide history | Ctrl+Shift+V; alternative Alt+Shift+V |
| Start a Windows screen snip | Ctrl+Shift+S or Windows+Shift+S |
| Copy the monitor under the pointer | Ctrl+Alt+S, then Ctrl+V in your destination; taskbar excluded by default |
| Copy the visible browser area as PNG | Alt+Shift+S; captures the current viewport without scrolling |
| Copy a full scrolling webpage as PNG | Alt+Shift+L |
| Capture a full scrolling webpage as PDF and copy its PNG | Alt+Shift+P |
| Search history | Ctrl+K in the app |
| Open screenshot editor | Crop/edit control on an image card |
| Editor fullscreen / fit / 100% | F11 / Ctrl+0 / Ctrl+1 |
| Copy / save a quick crop | Crop button on Capture Pad, then Ctrl+C / Ctrl+S |
| Save an edited copy | Ctrl+S inside the editor |

Restoring one of the 64 most recently seen images updates history quietly instead of replaying capture sound or reopening the Pad. Explicit Windows snips still notify, even with identical pixels.

Desktop shortcuts can be changed in Settings. The Capture Pad is a thumbnail shelf: click the image or history control to open history, drag the grip to move it, or drag the image into a compatible app. The count badge shows new captures; X hides the Pad. By default it hides after eight seconds of inactivity; hover, focus and drag pause the timer. Settings controls Pad visibility, sound and return after closing history. The Pad floats near the taskbar; it is not embedded in it.

Select clips using their checkboxes. Open **Select** for **Select this page** and **Trash all matching…**. Bulk Trash requires confirmation and supports Undo. All matching excludes pinned clips unless you include them. A successful drop clears the transferred selection; cancelling keeps it selected. Images drag as files; text drags as text. For a mixed selection, use Export. Editing saves a new image and preserves the original.

Crop opens with a full-image guide. Drag any edge or corner, or choose **Draw area** to draw a new selection. Focus a handle and use arrow keys for one-pixel adjustments (Shift for ten pixels), then choose **Apply crop**. **Open maximized window** gives the editor the full working area of its current monitor. Originals stay unchanged.

For a faster crop, use the small **Quick crop** button on Capture Pad. Resize the guide or draw an area, then press **Ctrl+C** to copy that selection immediately. **Ctrl+S** saves the selection as a new image in history. Neither needs Apply crop first. Escape or Close leaves the original unchanged and closes without a discard prompt. Quick crop leaves any unfinished regular-editor draft alone; the regular image editor keeps its existing draft and discard controls.

In Companion, choose **PDF + PNG clipboard image** or press **Alt+Shift+P** for a full scrolling capture. The PDF contains image pages rather than selectable webpage text. The same capture copies a PNG for pasting. With the updated desktop running and monitoring enabled, the PDF appears in Capture Pad and All history; drag it to an app that accepts PDF files. Copy on a PDF history card copies the PDF as a file. Use **Save PDF** in the extension popup if clipboard delivery is blocked. Browser shortcut settings show actual assignments and conflicts. The extension captures page content, without browser chrome; use Ctrl+Alt+S for the whole monitor under the pointer.

Quick monitor capture hides SnipyNest surfaces first. **Settings → Global shortcuts → Exclude taskbar** is on by default; turn it off to include the entire monitor. It uses Windows work-area coordinates and trims a revealed auto-hide taskbar. When monitoring is paused it copies only to the clipboard, without adding history or playing capture feedback. Protected content may appear blank.

### Use spare keys

In **Settings → Single-key capture**, choose a key beside each action, or use **Record**. For example, assign Page Up to Screen snip and Page Down to Quick snapshot. Enable single-key mode, then **Save settings**. Only assigned keys are reserved while the app runs, including in the tray; modifier combinations keep their normal behavior. Recording releases existing assignments first. Conflicts are reported instead of silently replacing another app’s reservation.

Use **Release keys now**, the tray’s **Disable single-key mode**, or Exit to restore those keys. Mappings are remembered, but mode starts off after restarting unless **Enable again at app startup** is selected. Navigation keys, F1–F11, Print Screen, Pause, Menu/Application and the physical key beside 1 are supported. Fn is handled by keyboard firmware; F12 is reserved by Windows. Print Screen can conflict with Windows snipping. No vendor keyboard utility or hardware identity is required.

For browser actions, choose Brave, Chrome or Edge in **Browser keys** and click **Set up browser connection**. In Companion **Settings**, choose **Enable desktop-key access** and accept the optional local-native and site-access permissions. Then assign Browser visible PNG, Browser full PNG or Browser full PDF in desktop Settings. Keep the target browser tab focused. Multiple focused/ambiguous connections, tab changes and busy capture requests are refused. Disconnect in Companion Settings to remove the extra permissions. Normal browser shortcuts are changed in the browser’s shortcut settings; Companion displays their actual assignments and links there.

## When capture fails

Try **Visible area** for one screen, **Feed** for bounded loaded content, or **Scrolling panel** for a page with an inner scrollbar. An explicitly partial result is not a complete page. Clipboard failure should leave a PNG available to copy again or save; reopen the extension popup. Shortcut capture never opens a result tab automatically. Protected browser pages require Windows snipping. No extension can guarantee every animation or custom scrolling site.

## Privacy, help and contributing

History is local and is not encrypted. Read [Privacy](PRIVACY.md) before use or sharing diagnostics.

- [Report a bug or request a feature](https://github.com/Basantbhat162/snipynest/issues/new/choose).
- [Contribute code or documentation](CONTRIBUTING.md); pull requests are reviewed by maintainers.
- [Report a security vulnerability privately](SECURITY.md).
- [Build and test from source](CONTRIBUTING.md#build-on-windows).
- [Maintainer guide](docs/MAINTAINING.md) for reviewing requests and publishing updates.
- [Verification](docs/VERIFICATION.md), [changelog](CHANGELOG.md) and [release checklist](docs/RELEASING.md).

Licensed under [MIT](LICENSE), with [third-party notices](THIRD_PARTY_NOTICES.md). This repository distributes the Windows app and browser extension; it is not a hosted web app.
