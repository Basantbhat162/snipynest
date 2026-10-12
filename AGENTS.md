# SnipyNest contributor instructions

SnipyNest is a Windows desktop clipboard workspace (Tauri, Rust, React) with a Chromium screenshot extension. Work inside the repository checkout. Local agent tools are optional and are not project dependencies.

## Before changing code

Read README.md and docs/VERIFICATION.md. For capture or delivery changes, read extension/README.md and ADRs 0005 and 0009 in docs/adr/. For window behavior, read ADRs 0006–0008. Historical specifications describe targets; source and verification records define implemented behavior.

Keep modules separated across clipboard ingestion, storage, native drag/drop, window management, and browser capture. Use small public interfaces and test those interfaces. Preserve legacy application identifiers and data paths until an explicit, tested migration replaces them.

## Implementation and verification

- Reproduce bugs with a failing regression before changing their cause where practical. Test production adapters, not a duplicate implementation.
- Keep image originals intact, editing memory bounded, clipboard retry bounded, and browser capture cancellable. Restore temporary page styles and scroll positions after failures.
- Keep native window operations on the required thread. Verify X, Escape, shortcuts, focus loss and drag cancellation when window behavior changes.
- UI controls need keyboard access, accessible names, visible focus, and reduced-motion support. Test narrow layouts and mixed display DPI. Feedback should be immediate; animations should be brief and optional.
- Run `pnpm check`, `pnpm test`, `pnpm build` and `cargo test --locked --manifest-path src-tauri/Cargo.toml`. Build the Windows installer for native/release changes. Follow CONTRIBUTING.md for setup.
- Record what ran and what did not. Simulated browser tests do not certify Brave, Chrome or Edge. Compilation does not certify a Windows installer, clipboard, sound or native drop.
- Performance targets require measurements, including WebView processes. Do not claim zero CPU or zero-loss ingestion without evidence.

## Public repository boundaries

Stage explicit source paths and inspect the staged diff before committing. Keep credentials, clipboard databases, screenshots of private pages, personal paths, logs, session notes, local runtimes and generated installers out of Git. Use synthetic test data. Keep personal email out of commits using a GitHub noreply identity.

PRs describe the problem, behavior change, verification and remaining limits. Use feature branches and maintainer review; never push to a contributor's branch or publish a release without authorization. CI from forks must receive no secrets and only read permissions. Never run untrusted PR code in a privileged workflow.

Update user instructions when controls change, docs/VERIFICATION.md when evidence changes, GLOSSARY.md for new domain terms, and docs/adr/ for architectural decisions. Keep versions aligned across package.json, Cargo.toml, tauri.conf.json and extension/manifest.json. Use docs/RELEASING.md before distributing builds.
