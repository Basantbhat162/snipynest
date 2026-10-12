# Privacy and local data

SnipyNest stores clipboard text, source application metadata and images locally so you can retrieve them later. History is not an encrypted vault. Anyone with access to your Windows account or its backups may be able to read it.

The current desktop and Companion have no project-operated upload service, analytics or account system. The extension captures pixels from the active page, composes the PNG locally and copies it to the Windows clipboard or downloads it. Other applications and clipboard sync services may read clipboard contents; SnipyNest does not control them.

The desktop retains the legacy OmniCopy application-data location for upgrade compatibility. Settings provides storage information. Pause monitoring before copying sensitive information. Supported clipboard privacy flags are respected, but applications may omit those flags. Moving a clip to Trash is reversible; emptying Trash removes it from the app, not necessarily from backups or storage recovery tools.

The Capture Pad can expose previews on screen. Disable it or hide it when sharing a desktop. Browser diagnostics are downloaded only when requested and contain capture stages, coordinates and errors; review files before attaching them publicly. No automatic diagnostic upload is implemented.

The Companion requests activeTab, scripting, tabs, offscreen, clipboardWrite and storage permissions to capture an invoked page, compose images, copy results and remember capture preferences. The tabs permission is used for active-tab identity and capture status. See extension/manifest.json for the authoritative permission list. Protected browser pages and some embedded/custom scrolling content cannot be captured fully.

GitHub is a separate service. Public issues, pull requests, commit identities and attachments are visible to everyone. Never upload real clipboard history, private webpages, passwords or personal screenshots to this repository.
