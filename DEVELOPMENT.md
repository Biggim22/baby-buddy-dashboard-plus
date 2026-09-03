# Development guide

This document describes the development setup and the data-handling rules for Baby Buddy Dashboard Plus. It is written for contributors working on the GitHub repository and for maintainers preparing a Home Assistant add-on update.

## Project layout

| Path | Purpose |
| --- | --- |
| `baby-buddy-dashboard-plus/config.yaml` | Home Assistant add-on metadata, version, options and schema. |
| `baby-buddy-dashboard-plus/Dockerfile` | Add-on image. It copies the prebuilt frontend from `frontend/dist/`. |
| `baby-buddy-dashboard-plus/backend/` | FastAPI server, Baby Buddy API proxy and local SQLite data. |
| `baby-buddy-dashboard-plus/frontend/src/` | React user interface, translations, charts and form logic. |
| `baby-buddy-dashboard-plus/frontend/dist/` | Production frontend committed for Home Assistant builds. |
| `ROADMAP.md` | Planned improvements that are not yet released. |
| `CHANGELOG.md` | Released changes; keep it in English. |

## Data boundaries and privacy

Baby Buddy remains the source of truth for feedings, sleep, diapers, measurements, medication and notes. The dashboard reads or changes these records through the configured Baby Buddy API.

Plus-only features such as care entries, tasks, appointments, interface preferences and notification logs are stored in the Home Assistant app-data directory as `baby_buddy_dashboard_plus.db`. That directory is mounted into the container as `/data`; it is deliberately not part of this repository and must never be committed. Treat backups as personal family data.

Do not add real names, API keys, private URLs, screenshots containing private data, or exported databases to source control. The included screenshots use Baby Buddy demo data.

## Local setup

The root contains `run_local.sh` for a local development start. Create a local `.env` file from `.env.example`, then provide only your own development credentials:

```bash
cp .env.example .env
# Set BABY_BUDDY_URL and BABY_BUDDY_API_KEY in .env
./run_local.sh
```

For frontend work:

```bash
cd baby-buddy-dashboard-plus/frontend
npm ci
npm test
npm run build
```

The backend has intentionally few dependencies. A useful syntax check is:

```bash
python -m compileall baby-buddy-dashboard-plus/backend
```

## Form input contract

### Local date and time

HTML `datetime-local` values contain a wall-clock date and time but no timezone. All core Baby Buddy activity forms and local care entries must convert such values with `toApiDatetime` from `frontend/src/utils/formatters.js` before they are sent to an API.

`toApiDatetime` constructs the date from local components and emits an ISO UTC timestamp. It rejects malformed dates, impossible calendar days and local times skipped by daylight-saving changes. Do not replace it with `new Date(value).toISOString()` or append a timezone-less string: that can cause a Baby Buddy server in another timezone to save a different moment.

Tasks and appointments intentionally use local date and time fields because they are local scheduling concepts rather than Baby Buddy API timestamps.

### Decimal values

Use `parseLocalizedNumber` from the same module for user-entered decimal values. It accepts both decimal comma and decimal point, including common grouped forms such as `1.234,5` and `1,234.5`. Forms keep the original text while the user types and validate the parsed value before saving. New numeric forms should follow this pattern instead of relying on browser-specific `input type="number"` parsing.

## Frontend conventions

- Add user-visible strings to all supported locale files in `frontend/src/locales/`.
- Keep times formatted through the existing formatter functions so the independent 12/24-hour setting is respected.
- Preserve the established activity colours: breastfeeding amber, bottle green, diapers blue and sleep purple.
- Add or update unit tests when changing shared formatter or aggregation logic.
- Run a production build after frontend changes. The add-on Dockerfile does **not** run npm or Vite during installation; it copies the committed `frontend/dist/` files.

## Before opening a pull request or committing

1. Read `RELEASING.md` when the change changes the add-on version.
2. Run the relevant tests and build the frontend after any frontend source change.
3. Inspect `git diff --check` and `git status` for unintended files.
4. Ensure no secrets, databases or local development files are staged.
