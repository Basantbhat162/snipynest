# Privacy and local data

SnipyNest stores clipboard text, source application metadata and images locally so you can retrieve them later. History is not an encrypted vault. Anyone with access to your Windows account or its backups may be able to read it.

The current desktop and Companion have no project-operated upload service, analytics or account system. The extension captures pixels from the active page, composes the PNG locally and copies it to the Windows clipboard or downloads it. Other applications and clipboard sync services may read clipboard contents; SnipyNest does not control them.

The desktop retains the legacy OmniCopy application-data location for upgrade compatibility. Settings provides storage information. Pause monitoring before copying sensitive information. Supported clipboard privacy flags are respected, but applications may omit those flags. Moving a clip to Trash is reversible; emptying Trash removes it from the app, not necessarily from backups or storage recovery tools.

The Capture Pad can expose previews on screen. Disable it or hide it when sharing a desktop. Browser diagnostics are downloaded only when requested and contain capture stages, coordinates and errors; review files before attaching them publicly. No automatic diagnostic upload is implemented.

The Companion requests activeTab, scripting, tabs, offscreen, clipboardWrite and storage permissions to capture an invoked page, compose images, copy results and remember capture preferences. The tabs permission is used for active-tab identity and capture status. See extension/manifest.json for the authoritative permission list. Protected browser pages and some embedded/custom scrolling content cannot be captured fully.

Single-key mode stores only chosen key/action assignments and uses Windows hotkey registration. It does not record typed text, install a keyboard driver, change firmware or collect a keyboard hardware identity. Assigned keys are reserved only while the desktop process runs; mode is off after restarting unless startup resume was explicitly enabled.

The optional desktop-to-browser connection requests nativeMessaging and all-site access separately. This permits capture of a newly opened page when triggered from desktop without a browser click. Standard captures do not require these extra permissions. The local helper exchanges temporary session IDs, numeric tab IDs, focus/readiness and capture action codes; it sends no page URL, screenshot or PDF through that control channel and opens no network port. Disconnect in Companion Settings to remove optional access. Endpoint metadata, helper executables and the current-user browser registration remain local; uninstall removes the app-owned registration and helper files while retaining clipboard history.

GitHub is a separate service. Public issues, pull requests, commit identities and attachments are visible to everyone. Never upload real clipboard history, private webpages, passwords or personal screenshots to this repository.
