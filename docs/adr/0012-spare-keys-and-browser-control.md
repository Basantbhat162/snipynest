# ADR 0012: Optional spare keys and local browser control

Status: Accepted for the 1.6.0 preview implementation; live acceptance pending.

## Context

Users want spare navigation/function keys to trigger capture without modifier chords, on standard Windows keyboards. Browser command shortcuts require modifiers and can conflict with other extensions. A desktop key does not grant the browser's activeTab permission on a freshly opened page.

## Decision

- Reserve explicitly assigned bare keys with RegisterHotKey on a dedicated message thread, using MOD_NOREPEAT. Do not install a keyboard hook, vendor driver, firmware mapping or key logger. Limit the UI to navigation keys, F1–F11, Print Screen, Pause, Menu and Backquote. Reject F12, modifier keys and ordinary typing keys. Windows or another app can refuse a reservation; report the conflict and restore previous reservations. If restoration fails, release all keys and disarm the mode.
- Keep mappings in existing Preferences. Mode is off by default and starts disarmed unless startup resume was explicitly enabled. Recording first releases reservations. Settings and the tray provide immediate disarm; process exit releases thread hotkeys. Modifier chords remain separate.
- Use the monitor's physical work-area bounds for default-on taskbar exclusion. A revealed auto-hide shell taskbar is trimmed at the intersecting edge. Do not change the display, taskbar or keyboard configuration.
- Provide three independent browser actions: visible PNG, full scrolling PNG and full scrolling PDF plus PNG. Keep the legacy visible command ID so existing browser shortcut assignments remain associated with it. Read actual assignments through commands.getAll and link to browser-managed editing.
- Offer Native Messaging only after opt-in. The extension requests optional nativeMessaging and all-site access together; ordinary browser actions remain usable without them. Explain why external actions need the site grant, and provide permission removal.
- Register a per-user native host restricted to the Companion's stable public extension ID. Use a versioned copy of the same app executable in host-only mode, entered before application startup/single-instance checks. It never starts the desktop workspace. The manifest public key establishes unpacked identity; no signing private key is distributed.
- The stdio host accepts bounded 4 KiB framed JSON polling messages. It forwards only transient session/tab identity, focus/readiness and action codes to a message-only desktop window using WM_COPYDATA. A per-run nonce is stored in the existing Windows user-data area. No TCP listener, command strings, page URLs or captured content enter this channel. Files inherit the current user's profile permissions; this is not isolation from code already running as that user.
- Choose exactly one fresh, focused and ready browser session. Requests expire after two seconds and are consumed once. Recheck focus, tab identity, permissions and capture availability before execution. Reject ambiguity and changed tabs. The existing cancellable capture controller remains the only browser capture implementation.
- Continue delivering PNG/PDF bytes through ADR 0011's clipboard bridge. Native control does not acknowledge history ingestion. Disconnect removes optional browser permissions; uninstall removes only matching app-owned registry entries and generated helper files, preserving history. Updates preserve registration and refresh the helper manifest on startup.

## Consequences

No keyboard-specific utility or hardware fingerprint is needed. Bare Print Screen can conflict with Windows; Fn is firmware-managed, and F12 stays unavailable. The optional connection polls while enabled, so runtime overhead requires measurement. Existing unpacked extensions may acquire a new ID on the first update and require reloading and shortcut reassignment. Browser-store distribution will need a host allowlist update for its verified store ID. Live browser registration, physical keys, taskbar auto-hide/mixed DPI and installed upgrade/uninstall remain acceptance requirements, separate from unit tests and packaging.

## References

- [Windows RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey)
- [Chromium extension commands](https://developer.chrome.com/docs/extensions/reference/api/commands)
- [Chromium Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Windows Brave/Chrome host registration in KeePassXC's production installer](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp) — both use the Google/Chrome native-host namespace; Edge uses Microsoft/Edge.
