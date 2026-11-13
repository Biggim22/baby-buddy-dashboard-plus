# Project rules for Baby Buddy Dashboard Plus

These rules apply to every contributor and coding agent working in this repository. Personal access details (SSH, Home Assistant instance, API keys) are never stored here.

## Communication and data protection

- Communicate with the maintainer in German; the changelog and public documentation stay in English.
- Never publish private family, health, API or Home Assistant data in output, commits, issues or documentation.
- Never overwrite existing user changes or unrelated local modifications.

## Check both `main` branches

Before starting work and again before every push:

1. **Own repository:** run `git fetch origin`, then compare `git log --oneline HEAD..origin/main` and `git log --oneline origin/main..HEAD`. Review every new commit on `origin/main` (author, message, changed files, diff) before building on it. Report unexpected or foreign commits to the maintainer. Never force-push.
2. **Original project:** the fork is based on [mbentancour/baby-buddy-dashboard](https://github.com/mbentancour/baby-buddy-dashboard). Keep it as a fetch-only remote (`git remote add upstream https://github.com/mbentancour/baby-buddy-dashboard.git` and `git remote set-url --push upstream DISABLED`), run `git fetch upstream main` and list new commits with `git log --oneline origin/main..upstream/main`. Evaluate each new commit for Plus and report it with a recommendation. Upstream code is never merged or cherry-picked automatically; useful ideas are re-implemented for Plus paths and conventions.
3. After the review, update the table below with the newest reviewed upstream commit and the decision.

A commit link under this repository's GitHub URL can also belong to the original project or another fork (GitHub shares objects across a fork network). Confirm with `git branch -r --contains <sha>` or `git ls-remote` before treating it as part of this repository.

| Last reviewed upstream commit | Reviewed | Decision |
| --- | --- | --- |
| `d947d2f` Merge PR #12 (HA add-on 1.7.8 for the DST fix) | 2026-11-13 | Rechecked for 2.6.3; no new upstream commits. `b5fc0e9` (sleep-history cutoff as UTC instant, avoids the ambiguous hour at the DST fallback): Plus had the same code; re-implemented in 2.5.4 at the maintainer's request (2026-11-02). `81037c0` and the merges only bump the upstream add-on version: not relevant. |

## Product rules

- Dashboard Plus never gives medical advice or medication recommendations. The personal medication list ships empty and contains only family-defined names and optional preferred units — never doses, intervals, age/weight rules or treatment hints.
- Existing records are never silently deleted or reclassified. Migrations are explicit, one-time, traceable user actions.
- Home Assistant updates are never installed automatically unless the maintainer explicitly asks. Before touching a live instance, check repository state, add-on version, backup status and the maintainer's intent.

## Development workflow

- German, English and Italian translations (`frontend/src/locales/`) must stay structurally identical.
- After frontend changes: run the frontend tests and the Vite production build. After backend changes: run the backend tests.
- Every version updates `config.yaml`, `run.sh`, `CHANGELOG.md`, README/ROADMAP where relevant and the versioned `frontend/dist` build. See `RELEASING.md`.
- Before committing: `git diff --check`, stage files explicitly (no blanket `git add .`), review the staged diff for private data.
- Commit first, push to `origin/main` only when the maintainer wants the change published.
