# Release process

This repository is a Home Assistant add-on repository. A normal GitHub push is enough for Home Assistant to discover an update; a separate GitHub Release is optional and not required for installation.

## Prepare the release

1. Start from the intended branch and inspect the working tree:

   ```bash
   git status
   git log --oneline -5
   ```

2. Set the release version in `baby-buddy-dashboard-plus/config.yaml`. Home Assistant uses this value to detect the add-on update.
3. Add a clear, English release section to `baby-buddy-dashboard-plus/CHANGELOG.md`.
4. Update `run.sh`'s startup log version if it is displayed there.
5. If the public behaviour or development workflow changed, update `README.md`, `DEVELOPMENT.md` or `ROADMAP.md` in the same change.

## Verify it

From `baby-buddy-dashboard-plus/frontend`:

```bash
npm ci
npm test
npm run build
```

The build regenerates `frontend/dist/`. Check that the new build output is visible in `git status`; these files are intentionally versioned because the Home Assistant Docker build copies them directly and does not install Node dependencies.

Also run a backend syntax check from the repository root:

```bash
python -m compileall baby-buddy-dashboard-plus/backend
```

Before committing:

```bash
git diff --check
git status
```

For a release that changes data storage, create a Home Assistant backup first and document the migration. Version 2.3.2 changes neither the schema nor existing stored records.

## Commit and publish

```bash
git add README.md DEVELOPMENT.md RELEASING.md ROADMAP.md baby-buddy-dashboard-plus
git commit -m "Release 2.3.2"
git push origin main
```

Use a concise message matching the actual version. Review the staged diff before committing; never use a blanket add command if there are unrelated local files.

## Install and smoke-test in Home Assistant

1. Open **Settings → Apps → App Store** and refresh the repository, if necessary.
2. Open **Baby Buddy Dashboard Plus** and choose **Update**. Home Assistant builds the add-on from the repository's `config.yaml`, Dockerfile and committed frontend build.
3. Start the app and confirm the start log shows the expected version.
4. Check the dashboard's version information, then perform a focused smoke test for the release.

For 2.3.2, enter a disposable measurement such as `3,25` (or `3.25`) and verify that it is accepted and displayed correctly. Create or edit a test record with the current local time and verify it is neither shifted by hours nor rejected as future-dated. Remove the test record afterwards if it should not remain in Baby Buddy.

If an update fails during image build, open the Home Assistant Supervisor log. The most useful lines are the first actual `ERROR`, `failed`, or `exit code` line before the generic “unknown error occurred while trying to build the image” message.

## Rollback

Keep a Home Assistant backup before releases that alter data. For a simple application regression without a schema migration, reinstalling or selecting the previous add-on version/source restores application code but does not erase the `/data` database. Do not delete the app-data directory as part of a rollback unless you explicitly intend to discard local care, tasks, appointments and settings.
