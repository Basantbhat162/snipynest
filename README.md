# SnipyNest

A Windows clipboard workspace with searchable history, screenshot editing, a small Capture Pad, and a browser companion for webpage screenshots.

## Download for Windows

**[Download Windows installer (.exe)](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.0-preview/SnipyNest_1.5.0_x64-setup.exe)**

Windows 10/11 **64-bit (x64)** desktop only. No macOS, Linux, mobile or native ARM64 installer is currently provided. The browser extension is optional and installed separately.

| Download | What to do with it |
| --- | --- |
| [Windows installer — 1.5.0](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.0-preview/SnipyNest_1.5.0_x64-setup.exe) | Run the `.exe` to install the desktop app. |
| [Browser extension — ZIP](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.0-preview/SnipyNest-Companion-1.5.0.zip) | Extract it, then follow the [Load unpacked guide](#install-the-browser-companion). |
| [SHA-256 checksums](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.0-preview/SHA256SUMS-1.5.0.txt) | Verify the downloaded files. |

[Release notes and all files](https://github.com/Basantbhat162/snipynest/releases/tag/v1.5.0-preview). You do not need Git, a GitHub account or the source-code ZIP to install the app.

**Public preview — 1.5.0.** This is usable development software, not a certified stable release. Automated checks pass, but live browser and Windows acceptance remain incomplete. Some pages with custom scrolling, infinite feeds or animations will need a smaller capture mode. Read the [known limits](docs/VERIFICATION.md).

## Download and install

Use the Windows installer link above, or open the [1.5.0 release](https://github.com/Basantbhat162/snipynest/releases/tag/v1.5.0-preview) and expand **Assets**. Choose the `.exe` for the desktop app; the Companion ZIP is a separate optional download. GitHub’s automatically generated “Source code” archives are for developers.

1. Run `SnipyNest_1.5.0_x64-setup.exe` on Windows 10/11 x64 with WebView2 installed. This preview is unsigned; verify its published SHA-256 checksum before deciding whether to run it. Do not disable antivirus protections.
2. Launch SnipyNest. Its tray icon remains available when the window is closed. Press **Ctrl+Shift+V** to open history.
3. Copy text or take a Windows screenshot. With monitoring enabled, it appears in history. Pause monitoring before handling sensitive clipboard data.

The app retains the legacy OmniCopy data and installer identity for existing users. Back up important history before trying an upgrade. Upgrade installation has not yet passed live acceptance testing.

## Install the browser companion

The extension is currently distributed unpacked, not through a browser store.

1. [Download the extension ZIP](https://github.com/Basantbhat162/snipynest/releases/download/v1.5.0-preview/SnipyNest-Companion-1.5.0.zip), right-click it in Windows Explorer, choose **Extract All**, and keep the extracted folder in a permanent location.
2. Open `brave://extensions`, `chrome://extensions`, or `edge://extensions` in your browser.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin SnipyNest Companion to the toolbar. Open a normal webpage, choose a capture mode and click **Capture**. Keep that tab active while it runs.
5. Use **Copy image** or **Save PNG**. Keep the desktop app running with monitoring enabled if you want copied captures saved in history.

For updates, extract the new ZIP into the existing extension folder (or remove the old unpacked entry and load the new folder). Click **Reload** in browser extension management, confirm version **1.5.0**, and refresh the page before capturing. Desktop installation does not update the extension. See the [Companion guide](extension/README.md) for modes, errors and limits.

## Everyday use

| Action | Shortcut or control |
| --- | --- |
| Open or hide history | Ctrl+Shift+V; alternative Alt+Shift+V |
| Start a Windows screen snip | Ctrl+Shift+S or Windows+Shift+S |
| Copy the whole monitor under the pointer | Ctrl+Alt+S, then Ctrl+V in your destination |
| Capture a webpage | Alt+Shift+S in the browser; check browser shortcut settings for conflicts |
| Search history | Ctrl+K in the app |
| Open screenshot editor | Crop/edit control on an image card |
| Editor fullscreen / fit / 100% | F11 / Ctrl+0 / Ctrl+1 |
| Save an edited copy | Ctrl+S inside the editor |

Restoring one of the 64 most recently seen images updates history quietly instead of replaying capture sound or reopening the Pad. Explicit Windows snips still notify, even with identical pixels.

Desktop shortcuts can be changed in Settings. The Capture Pad is a thumbnail shelf: click the image or history control to open history, drag the grip to move it, or drag the image into a compatible app. The count badge shows new captures; X hides the Pad. By default it hides after eight seconds of inactivity; hover, focus and drag pause the timer. Settings controls Pad visibility, sound and return after closing history. The Pad floats near the taskbar; it is not embedded in it.

Select clips using their checkboxes. Open **Select** for **Select this page** and **Trash all matching…**. Bulk Trash requires confirmation and supports Undo. All matching excludes pinned clips unless you include them. A successful drop clears the transferred selection; cancelling keeps it selected. Images drag as files; text drags as text. For a mixed selection, use Export. Editing saves a new image and preserves the original.

Crop opens with a full-image guide. Drag any edge or corner, or choose **Draw area** to draw a new selection. Focus a handle and use arrow keys for one-pixel adjustments (Shift for ten pixels), then choose **Apply crop**. **Open maximized window** gives the editor the full working area of its current monitor. Originals stay unchanged.

Quick monitor capture includes the taskbar and hides SnipyNest surfaces first. When monitoring is paused it copies only to the clipboard, without adding history or playing capture feedback. Protected content may appear blank.

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
