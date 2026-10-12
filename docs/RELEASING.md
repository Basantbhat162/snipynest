# Release checklist

Use a reviewed main-branch commit. Preview releases may document incomplete live acceptance; stable releases must complete the applicable checks in VERIFICATION.md. Never present packaging or simulated API tests as proof of native/browser reliability.

1. Align all four versions and update CHANGELOG.md and verification evidence.
2. From a clean Windows checkout, install frozen dependencies and run CONTRIBUTING.md checks. Test actual Brave/Chrome/Edge popup and shortcut capture, cancellation, clipboard retry and PNG download. Test native close after movement, all monitors, Pad timeout, sound, editor, drag and upgrade data preservation.
3. Inspect source and assets for personal data and confirm redistribution notices. Exclude local history, credentials and user captures. Check the staged file manifest and commit email.
4. Run `python scripts/build-public.py` to remap local paths out of Rust diagnostics, then `python scripts/package-release.py`. Generate SHA-256 hashes of the exact installer and extension ZIP being uploaded. Include license notices in packages.
5. Publish a GitHub Release from the reviewed commit with the installer, extension ZIP, checksums, installation instructions and known limitations. Mark incomplete acceptance builds as prereleases. Unsigned builds must be labeled unsigned. Never replace release assets silently; issue a new version.
6. Download published assets and compare hashes. Check links, extension ZIP layout and clean Windows installation. Record CI run and release URL.

Use feature branches and pull requests for future work. Keep the default branch protected against force pushes/deletion. CI uses read-only permissions and does not publish automatically. Maintainers own release approval; avoid workflows that execute fork code with repository secrets.
