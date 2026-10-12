# SnipyNest

A Windows clipboard workspace with searchable history, screenshot editing, a small Capture Pad, and a browser companion for webpage screenshots.

**Public preview — 1.3.0.** This is usable development software, not a certified stable release. Automated checks pass, but live browser and Windows acceptance remain incomplete. Some pages with custom scrolling, infinite feeds or animations will need a smaller capture mode. Read the [known limits](docs/VERIFICATION.md).

## Download and install

Open [Releases](https://github.com/Basantbhat162/snipynest/releases) and select the **1.3.0 public preview** (prereleases may not appear as “latest”). Download the Windows x64 installer and Companion ZIP separately. “Source code” downloads are for developers, not installers.

1. Run `SnipyNest_1.3.0_x64-setup.exe` on Windows 10/11 x64 with WebView2 installed. This preview is unsigned; verify its published SHA-256 checksum before deciding whether to run it. Do not disable antivirus protections.
2. Launch SnipyNest. Its tray icon remains available when the window is closed. Press **Ctrl+Shift+V** to open history.
3. Copy text or take a Windows screenshot. With monitoring enabled, it appears in history. Pause monitoring before handling sensitive clipboard data.

The app retains the legacy OmniCopy data and installer identity for existing users. Back up important history before trying an upgrade. Upgrade installation has not yet passed live acceptance testing.

## Install the browser companion

The extension is currently distributed unpacked, not through a browser store.

1. Extract `SnipyNest-Companion-1.3.0.zip` into a permanent folder.
2. Open `brave://extensions`, `chrome://extensions`, or `edge://extensions` in your browser.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin SnipyNest Companion to the toolbar. Open a normal webpage, choose a capture mode and click **Capture**. Keep that tab active while it runs.
5. Use **Copy image** or **Save PNG**. Keep the desktop app running with monitoring enabled if you want copied captures saved in history.

For updates, extract the new ZIP, reload the extension in browser extension management, and refresh the page before capturing. Desktop installation does not update the extension. See the [Companion guide](extension/README.md) for modes, errors and limits.

## Everyday use

| Action | Shortcut or control |
| --- | --- |
| Open or hide history | Ctrl+Shift+V; alternative Alt+Shift+V |
| Start a Windows screen snip | Ctrl+Shift+S or Windows+Shift+S |
| Capture a webpage | Alt+Shift+S in the browser; check browser shortcut settings for conflicts |
| Search history | Ctrl+K in the app |
| Open screenshot editor | Crop/edit control on an image card |
| Editor fullscreen / fit / 100% | F11 / Ctrl+0 / Ctrl+1 |
| Save an edited copy | Ctrl+S inside the editor |

Desktop shortcuts can be changed in Settings. Click the Capture Pad to open history, drag its handle to move it, or drag its thumbnail into a compatible app. By default it hides after eight seconds of inactivity; hover, focus and drag pause the timer. Settings controls Pad visibility, sound and return after closing history. The Pad floats near the taskbar; it is not embedded in it.

Select clips using their checkboxes. **Select this page** or **Select all matching** supports bulk Trash with confirmation and Undo. All matching excludes pinned clips unless you include them. Images drag as files; text drags as text. For a mixed selection, use Export. Editing saves a new image and preserves the original.

## When capture fails

Try **Visible area** for one screen, **Feed** for bounded loaded content, or **Scrolling panel** for a page with an inner scrollbar. An explicitly partial result is not a complete page. Clipboard failure should leave a PNG available to copy again or save; reopen the popup or result tab. Protected browser pages require Windows snipping. No extension can guarantee every animation or custom scrolling site.

## Privacy, help and contributing

History is local and is not encrypted. Read [Privacy](PRIVACY.md) before use or sharing diagnostics.

- [Report a bug or request a feature](https://github.com/Basantbhat162/snipynest/issues/new/choose).
- [Contribute code or documentation](CONTRIBUTING.md); pull requests are reviewed by maintainers.
- [Report a security vulnerability privately](SECURITY.md).
- [Build and test from source](CONTRIBUTING.md#build-on-windows).
- [Verification](docs/VERIFICATION.md), [changelog](CHANGELOG.md) and [release checklist](docs/RELEASING.md).

Licensed under [MIT](LICENSE), with [third-party notices](THIRD_PARTY_NOTICES.md). This repository distributes the Windows app and browser extension; it is not a hosted web app.
