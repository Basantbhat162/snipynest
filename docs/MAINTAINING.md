# Maintaining the public project

## Issues and pull requests

An issue is a report or suggestion. It cannot change your code. Ask for reproduction steps and sanitized evidence, then label it bug, enhancement or documentation. Close duplicates with a link to the existing discussion.

A pull request proposes a code change. Read its Files changed tab and verification notes, wait for the Windows checks result, and test behavior affected by native/browser changes. Request changes if needed. Merge only changes you understand, using Squash and merge to keep one clear commit. Never run unknown code on a computer holding private clipboard data or credentials.

The main branch requires CI, resolved conversations and maintainer review, and rejects force pushes/deletion. The repository administrator retains a bypass for recovery and initial setup; routine changes should use PRs. As the sole maintainer, you cannot approve your own PR: use a trusted second reviewer or an explicit administrator merge after checks pass. CODEOWNERS routes reviews to the maintainer.

Dependabot proposes dependency updates monthly. These are still PRs to review and test, not automatic upgrades. CI receives read-only permissions and no publication credentials.

## Versions and downloads

A commit updates source code; it does not update an installed app. A GitHub Release publishes downloadable packages. Desktop and Companion update separately. Follow RELEASING.md and publish a new version for changed binaries; keep old release files immutable.

The first 1.3.0 release is a public preview. Known incomplete browser/native checks are documented in VERIFICATION.md. Reports from friends are useful evidence but do not imply all websites or display setups are supported.

## Privacy

Your GitHub account name is public as the repository owner. Public commits use a GitHub noreply email. Set GitHub Settings → Emails → Keep my email addresses private. When merging with the CLI, explicitly use `--author-email` with your GitHub noreply address; local Git settings alone do not control squash-merge identity. Verify the merged commit author before releasing. Local historical commits and working files were not included in the initial public history. Only push the intended branch; never use `git push --all` or `--mirror` from the development checkout.

Review attachments before publishing. If a real credential is ever exposed, revoke/rotate it first; deleting a public commit does not undo copies. Use GitHub's private vulnerability reporting for security reports.
