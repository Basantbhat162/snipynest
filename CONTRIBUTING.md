# Contributing to SnipyNest

Bug reports, documentation fixes and code contributions are welcome. You need a free GitHub account to open an issue or pull request; downloading does not require one.

## Report a problem or request a feature

Use the repository's Issues tab and choose Bug report or Feature request. Search existing issues first. Include the desktop/extension versions, Windows/browser version, steps, expected result and actual result. For browser capture, specify the mode and whether you used the popup or shortcut. Share a public reproducible page or synthetic example. Remove account names, private messages and sensitive URLs from attachments. Security problems use SECURITY.md instead.

## Build on Windows

Install Git, Node.js 22.18 or newer, pnpm 11.13.1, the stable Rust MSVC toolchain, Visual Studio Build Tools with Desktop development with C++, and Microsoft Edge WebView2 Runtime. The desktop is Windows-only; browser tests can run separately.

```powershell
git clone https://github.com/Basantbhat162/snipynest.git
cd snipynest
pnpm install --frozen-lockfile
pnpm tauri dev
```

Checks:

```powershell
pnpm check
pnpm test
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Three backend tests deliberately modify the live clipboard and are ignored by default. Run them only in a disposable Windows test account after reviewing them. For frontend layout use `/tests/ui-harness.html` on the development server; it uses synthetic data and mocked IPC, not native integration.

## Send a pull request

1. Fork the repository to your account and clone your fork.
2. Create a branch such as `fix/capture-scroll`.
3. Make a focused change and add a regression for bug fixes.
4. Run the relevant checks and inspect your diff for private information.
5. Push to your fork and open a pull request into this repository's main branch.

Explain what changed, why, how you tested it and any remaining limits. Maintainers review before merging; a PR is a proposal, not immediate permission to modify the project. Discuss large changes in an issue first. Contributions are submitted under the project's MIT license; retain third-party notices. See AGENTS.md for engineering rules.

Use GitHub's private noreply email for public commits. Never include clipboard databases, personal screenshots, credentials or local session notes. Dependencies are pinned through committed lockfiles. Update them deliberately and explain relevant compatibility changes.
