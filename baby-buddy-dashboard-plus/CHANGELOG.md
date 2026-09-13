# Changelog

## 2.3.4 (Reminder integrity)

- Prevented stale, locally persisted child records from sending full-bath, task or appointment reminders after a Baby Buddy migration or child removal.
- Reminder delivery now verifies the current Baby Buddy child list before each cycle. If Baby Buddy cannot be reached, that cycle is safely skipped instead of risking a notification for stale local data.
- Kept orphaned local records intact for recovery; they are excluded from notification delivery rather than silently deleted.

## 2.3.3 (WHO alignment, reliability and translations)

- Fixed WHO percentile tooltips so the displayed week always matches the discrete WHO reference row that supplied the percentile values.
- Added local validation that end time follows start time for manually entered feeding, sleep and tummy-time records.
- Added a confirmation for unusually long manual entries: more than 4 hours for feeding, 18 hours for sleep, or 2 hours for tummy time.
- Made task, appointment and care save/delete failures visible in the relevant dialog or list and retained the technical detail in the error log.
- Completed the Italian Plus translation catalog and added an automated test that keeps all three language catalogs structurally aligned.

## 2.3.2 (Local number and date/time safety)

- Accepted decimal commas and decimal points for manually entered measurements, bottle amounts, medication doses and medication intervals.
- Normalized numeric input only when saving, including common thousands-separator formats, so stored Baby Buddy values remain plain numbers.
- Centralized local date/time conversion for Baby Buddy and local care entries; submissions now use explicit UTC timestamps.
- Rejected malformed calendar dates and local times that do not exist during a daylight-saving transition rather than silently changing the selected time.
- Added regression tests for localized number parsing and invalid local date/time input.

## 2.3.1 (Care editing, forecast dates and publication cleanup)

- Moved deletion of care-history entries into the edit dialog.
- Added estimated transition dates to the lower, expected and upper diaper-stock forecasts.
- Replaced private child-specific panel and reminder wording with publication-safe generic wording.
- Changed the Home Assistant sidebar title to `Baby Buddy Dashboard Plus`.

## 2.3.0 (Diaper planning and card ordering)

- Added an optional diaper-size and stock calculator to Analytics.
- Added the current German Pampers weight ranges as a preset and fully editable custom brand ranges.
- Added overlap preferences and a transparent weight/BMI-trend recommendation with fit guidance.
- Added lower, expected and upper stock estimates based on observed diaper use and recent weight-gain rates.
- Added data-quality messaging instead of producing estimates when too few diaper days or weight measurements are available.
- Added persistent card ordering alongside per-tab card visibility settings.

## 2.2.5 (Notification lab, tab controls and scheduled appearance)

- Added collapsible notification target selection and an interactive test builder with per-target results.
- Added three media-player delivery modes: Home Assistant `play_media`, Alexa Media TTS and Alexa Media announcement.
- Added a card setting for switching sleep analytics between rolling 24-hour windows and calendar days.
- Added per-tab visibility settings for analytics, timeline, growth, care, tasks, appointments, medications and notes.
- Added Nord, Dracula and Solarized Light display modes.
- Added scheduled appearance profiles with independent theme, accent, start and end times, including overnight schedules.
- Expanded the in-app product description and version information.

## 2.2.4 (Analytics, appointments and notifications)

- Standardized analytics colors: feeding uses amber, bottles green, diapers blue and sleep purple.
- Standardized seven-day charts so the newest value is on the right, while list-style summaries keep today at the top.
- Reworked rolling sleep analytics into seven independent 24-hour windows with weekday labels, exact date/time ranges in tooltips and enough source data for a complete oldest window.
- Added a separate appointment time in addition to the configurable reminder day and reminder time.
- Moved notification targets into the dashboard settings, with multi-select support for Home Assistant notify services and optional voice announcements through media players.
- Kept bath reminder interval and time in the Care page settings and made the enhanced interface the only interface.
- Expanded and corrected English translations across analytics, navigation, overview, care, tasks and settings.
- Expanded the Home Assistant app description and removed the placeholder project link.

## 2.2.3.1 (Installation hotfix)

- Ship the compiled frontend with the release and no longer run npm/Vite while Home Assistant builds the app image.
- Accept legacy preview and bath-reminder options so upgraded installations no longer emit Supervisor schema warnings.

## 2.2.3 (Analytics and appointments)

- Restored the former Growth activity summaries in Analytics: 30-day daily feeding count/duration, feeding gap, breast-feeding duration, sleep and diaper averages.
- Reordered the breastfeeding and diaper seven-day rows so today is shown first and older days follow below.
- Split Tasks and Appointments into separate lists. Appointments are always one-off events and no longer expose task visibility or “open task” reminder controls.
- Appointment reminders use only the selected reminder day and time.

## 2.2.2 (Daily timeline)

- Added a dedicated, day-by-day Timeline tab modelled after the Baby Buddy web interface, with previous/next-day navigation.
- Timeline entries cover feed start/end, sleep start/end, diaper changes, tummy time, medications and notes; each editable event links directly to its existing edit form.
- Kept Growth limited to body measurements, BMI and WHO percentile curves; feeding, diaper and sleep analysis remains in Reports.

## 2.2.1 (Localization, care headers, and appointments)

- Added a user-selectable 12-hour or 24-hour clock format that is independent of the selected interface language.
- Added configurable Care header cards. Any built-in care category, including caraway-oil care and nail care, can now be selected for the header.
- Made appointments a first-class action in Tasks, with a dedicated “Add appointment” button and appointment reminder options.
- Moved all feeding, diaper and sleep metrics and charts out of Growth; Growth now focuses exclusively on body measurements, BMI and WHO curves.
- Continued consolidating Dashboard Plus interface strings in the translation catalog and aligned the version panel with the current release.
- Standardized all changelog headings and release notes in English.

## 2.2.0 (Page settings and care)

- Moved overview order/visibility, Growth feeding metrics and bath reminders out of global settings into their respective page-level settings dialogs.
- Added a global version panel with the Baby Buddy Dashboard 1.7.7 upstream link.
- Added “Log care” to the quick-action menu and a compact care settings button in the Care header.
- Made German the default language, update the document language consistently and use the language store directly in the settings selector.
- Simplified overview setting labels by removing the redundant “Letzte” prefix.
- Ensure WHO percentile controls are available when an upstream child-sex setting is absent.

## 2.1.9 (Appointments, care, and time windows)

- Fixed task reminders: the scheduler now tolerates its own minute offset and defaults to the valid `notify.notify` service instead of the previous typo.
- Added appointment tasks for U examinations, vaccinations and similar dates, including reminders on the day before (or up to three days before).
- Reworked sleep analytics into seven non-overlapping 24-hour windows rather than cumulative 24/48/72-hour totals.
- Made care summaries hierarchical: a full bath also satisfies a full-body wash and a quick wash; removed the misleading care activity chart and added nail/skin care categories.
- Feeding-gap calculation now joins breast switches within 15 minutes into one feeding session.
- Added human-readable duration labels and hour/minute formatting to the Daily Feeding tooltip.
- WHO percentile overlays for weight, height, head circumference and BMI remain available in Growth for the selected sex and birth date.

## 2.1.8.3 (Reports and lists)

- Overview charts now appear immediately after saving the setting and extend their respective history cards instead of appearing as separate cards.
- Reworked the seven-day breastfeeding and diaper reports into Baby Buddy-style proportional daily bars; the breastfeeding gear still switches between counts and duration.
- BMI is now reconciled retrospectively for weight and height measurements up to 24 hours apart, including entries made across midnight.
- Long histories now reveal ten entries at a time and only offer "Alles anzeigen" after two additional batches.
- ZIP archives now contain one top-level versioned add-on folder.

## 2.1.8.2 (UI and Growth hotfix)

- Fixed the black Growth view caused by an uninitialised duration accumulator and added a permanent Growth rendering regression test plus a tab-level recovery boundary.
- Moved all Dashboard Plus options into the original top-right settings dialog and removed the duplicate settings tab.
- Fixed long task and care dialogs on mobile by rendering modals at document level with their own scrolling area.
- Removed the unreliable medication follow-up backlog and "Mark as taken" controls from Notes & Meds; actual medication records remain in the history.
- Made the compact latest-event cards follow the configured overview visibility and order, added distinct section titles, and made compact seven-day overview charts optional.
- Added selectable breastfeeding duration/count charts, rounded temperature values to one decimal place, and expanded Care with summary cards and a 14-day activity chart.

## 2.1.8.1 (Startup hotfix)

- Fixed Home Assistant startup loops caused by Windows CRLF line endings in `run.sh` (`unable to exec bashio\r`). The archive now contains LF line endings and the Docker build normalises the script again defensively.

## 2.1.7 (Dashboard Plus upstream rebase)

- Rebased Dashboard Plus on Baby Buddy Dashboard 1.7.7, retaining its medication backlog, UTC timestamp fixes, automatic BMI, WHO percentile charts, translations, themes, temperature tracking, and edit/delete support.
- Added a compact, configurable overview with today's open tasks, latest feeding/diaper/sleep/medication/tummy-time cards, recent lists, and the latest solid diaper timestamp. Charts now live in Analytics.
- Added rolling 24/48/72-hour sleep analytics with day/night/total modes, separate breastfeeding and bottle charts, diaper, temperature, and tummy-time charts. Breastfeeding durations use hours and minutes.
- Added local care tracking for full baths, full/quick washes, caraway-oil care, and custom free-text categories, including edit/delete history and a configurable day-before bath reminder.
- Added recurring daily/weekday/interval/one-off tasks with a Vitamin D default, calendar-day completion, optional overview display times, and Home Assistant reminders through the configured notify service.
- Added hygiene-only diaper changes, selectable feeding duration/volume/frequency metrics, light/dark/pastel appearance controls, accent colors, mobile tab scrolling, a database health endpoint, Supervisor watchdog support, and hardened proxy/reminder error handling.

## 1.7.7 (Baby Buddy Dashboard main branch)

- Added a second overdue-medication row: if a dose's window has fully
  passed without being logged before the next one comes due, it now
  shows as its own "Overdue by..." row, separate from the still-open
  current dose (which stays in its normal state until it, too,
  elapses). Each row has its own "Mark as taken" button. Marking a
  missed row as taken always logs it for the actual current time
  (never backdated), with an automatic note recording that it was
  logged late and when it was originally due - by design, this never
  suggests giving two doses at once. Capped at 10 backlog rows per
  medication so a long-neglected recurring medication can't produce
  an unbounded list.
- Added a device-vs-server clock comparison to the error log for
  failed saves (e.g. "Date/time can not be in the future"), to tell
  apart a genuine clock skew from a code bug going forward. Fixed a
  bug found while building this: the backend was forwarding Baby
  Buddy's `Date` response header under the same name uvicorn already
  uses for its own, producing two "Date" headers that browsers merge
  into one unparseable value - now forwarded as `X-Baby-Buddy-Date`
  instead.

## 1.7.6 (Baby Buddy Dashboard main branch)

- Fixed a real-world bug where saving or editing a Feeding (or Sleep,
  Diaper, Tummy Time, Temperature, Medication, Note, or a running
  timer) could fail with "Date/time can not be in the future" or a
  bogus overlap conflict, even for an entry logged seconds ago. Every
  form sent its date/time to Baby Buddy as a plain local string with
  no timezone info; Baby Buddy's API (at least for token-authenticated
  requests, which this add-on always uses) parses that as UTC
  regardless of the household's actual timezone or Baby Buddy's own
  per-user timezone setting - a couple of hours off was enough to look
  like "the future". Every form now sends an explicit, unambiguous UTC
  timestamp instead.
- Added automatic BMI calculation: saving a Weight or Height entry now
  checks for a matching entry (the other measurement, same date) and
  creates or updates the corresponding BMI entry on Baby Buddy to
  match - no more logging BMI a third time by hand when it's fully
  determined by two measurements you already took. Respects the
  add-on's configured unit system for the conversion (Baby Buddy
  itself has no unit concept - weight/height are just numbers).

## 1.7.5 (Baby Buddy Dashboard main branch)

- Fixed a custom theme (1.7.0) briefly flashing the default dark
  colors on every page load, even in light mode, before switching to
  the configured light theme. Two causes, both fixed:
  - `index.html` had a hardcoded `body { background: #0F1117; }`
    (the built-in dark color) meant to avoid a white flash before the
    stylesheet loads - it didn't know about theme overrides, so it
    painted dark first regardless of configuration. Now uses
    `var(--bg, #0F1117)`, same fallback, but themed once a value is
    available.
  - The backend now inlines the resolved theme directly into
    `index.html`'s `<head>` on every request (instead of waiting on
    the client's own config fetch after mount), so the right colors
    are already known before the page paints at all - caught and
    fixed a real bug in this while testing locally, where the
    override was landing before the built stylesheet's `<link>` and
    silently losing the CSS cascade to the stylesheet's unthemed
    defaults every time.

## 1.7.4 (Baby Buddy Dashboard main branch)

- Fixed the app being able to get stuck on the "Loading..." screen
  forever with no way to recover short of a manual page reload. Every
  API request (including the very first one, which fetches the
  add-on's config and gates the loading spinner) used a plain
  `fetch()` with no timeout - if a request just stalled instead of
  failing outright (flaky wifi, a backgrounded mobile browser tab, an
  ingress proxy that silently drops the response), its promise never
  settled, so the code that clears the spinner never ran. Requests
  now abort after 15s and surface as a normal connection error - the
  existing "Connection error" header banner and empty-state UI, which
  already existed for a failed request, now also cover a hung one.

## 1.7.3 (Baby Buddy Dashboard main branch)

- Added a "Color Preset" add-on option (`color_preset`) that fills in
  the 14 `theme_*` fields (added in 1.7.0) for you: pick
  `teal_terracotta` - a warm cream/near-black scheme with a teal
  accent, for light and dark mode - instead of typing all 14 colors
  by hand. Any individual `theme_*` field you also set overrides the
  preset's value for that one field only, so you can start from a
  preset and tweak just what you want. Leave it unset and nothing
  changes.

## 1.7.2 (Baby Buddy Dashboard main branch)

- Fixed custom theme colors (added in 1.7.0) rendering cards with no
  visible contrast against the page background on some Home Assistant
  Supervisor versions. Root cause: a leftover, unconfigured theme
  option (e.g. `theme_light_border`) could be read back as the
  literal text "null" instead of empty - the add-on then emitted
  invalid CSS like `--card-bg: null;`, which browsers silently
  resolve to transparent rather than falling back to the built-in
  theme. Unset theme fields are now always treated as empty,
  regardless of how the Supervisor reports them.

## 1.7.1 (Baby Buddy Dashboard main branch)

- Added breastfeeding session duration. Recent Feedings entries for
  left/right/both-breast feeds now show how long the session lasted
  (e.g. "Left Breast · 20m") - bottle feeds are unaffected since the
  mL amount is already the more meaningful number there. The Growth
  tab's Avg Feeding card also gains a "~15m avg breast duration" line
  alongside the existing average gap.

## 1.7.0 (Baby Buddy Dashboard main branch)

- Added custom theme colors and a CI test workflow.
  - 14 new optional add-on options let you match the dashboard to
    your own Home Assistant theme: background, card background,
    border, text, muted text, dim text, and an accent color, each for
    light and dark mode separately (e.g. `theme_light_bg`,
    `theme_dark_accent`). Light/dark switching follows the device's
    own color-scheme setting automatically. Per-category colors
    (feeding, sleep, diaper, ...) are intentionally not affected -
    they're functional, not decorative. Leave everything unset (the
    default) and nothing changes from today's look; a mode is only
    overridden once all seven of its fields are filled in, to avoid
    an unreadable half-themed page.
  - Added `.github/workflows/test.yml`: runs the full frontend
    (Vitest) and backend (pytest) suites, plus a production build, on
    every push and pull request.

## 1.6.0 (Baby Buddy Dashboard main branch)

- Added WHO growth-standard percentile overlays to the Weight, Height,
  Head Circumference, and BMI trend charts. Toggle "WHO percentiles"
  on any of them to switch that chart from a calendar-date axis to
  age-in-weeks, with P3-P97 and P15-P85 shaded bands and a P50 median
  reference line from the official WHO Child Growth Standards behind
  your child's own measurements. Requires the new "Child's Sex"
  add-on option (Baby Buddy itself doesn't store this) - leave it
  unset and the toggle simply doesn't appear.
- Fixed a bug where the "Medication Alerts" add-on option (added in
  1.4.0) never actually reached the running add-on - `run.sh` was
  missing the line that exports it as an environment variable, so it
  silently no-opped even when enabled in the add-on's configuration.

## 1.5.0 (Baby Buddy Dashboard main branch)

- Added full translation support: English, Italian, and German. A
  language selector now lives in the Settings panel; the choice is
  saved on the device (not a shared add-on setting), defaults to
  English, and falls back to English for any string a language is
  missing. Covers every screen - tabs, all 11 entry forms, reports,
  the medication log, chart labels, and relative-time text ("43m
  ago", "Overdue by 3h 20m", age display) - plus locale-aware date
  and number formatting (e.g. Italian "22 giu" / German "22. Jun"
  instead of always English month names). Built as a `locales/`
  folder with one file per language, so anyone can contribute another
  language later with just a new file, the same approach used by an
  existing community PR for German that this implementation is
  compatible with in spirit (dependency-free, English-fallback `t()`
  helper).

## 1.4.2 (Baby Buddy Dashboard main branch)

- Added an "avg gap" line to the Growth tab's Avg Feeding card (e.g.
  "~4h 39m avg gap") - the actual average time between consecutive
  feedings over the last 30 days, not just a derived "feedings/day"
  count.

## 1.4.1 (Baby Buddy Dashboard main branch)

- Fixed the Recent Feedings list showing "X ago" (time since now) on
  every entry, which was redundant past the first one. Only the most
  recent feeding now shows time-since-now; every other entry shows
  the gap to the next (more recent) feeding instead, e.g. "43m gap" -
  the actual spacing between feeds, not a second "ago" for the same
  moment in time.

## 1.4.0 (Baby Buddy Dashboard main branch)

- Replaced the two separate header icons (manual refresh, error log)
  with a single Settings panel: a connection-status row ("Connected"
  in green with last sync time, or the error in red) followed by the
  error log/export/clear section that used to be its own popup.
- Temperature entries can now be edited and deleted, like every other
  metric - previously there was no edit mode at all. Added a
  Temperature card (Notes & Meds tab, next to Medications) with a
  48h/72h/96h trend chart, since a short high-resolution window
  matters more than a 30-day trend when tracking a fever.
- Added a small pulsing red dot on the "Notes & Meds" tab button
  whenever any medication is currently overdue, so it's visible
  without opening the tab.
- Added an opt-in "Medication Alerts" option that exposes a single
  `binary_sensor.baby_buddy_medication_overdue` entity in Home
  Assistant (via the Supervisor's Core API, no MQTT broker needed),
  reflecting whether any medication is currently overdue across all
  children. Off by default; build your own automation/notification
  on top of it once enabled.
- Added an automated test suite: Vitest for the frontend, pytest for
  the backend, both fully mocked with zero live calls to a real Baby
  Buddy or Home Assistant instance.

## 1.3.4 (Baby Buddy Dashboard main branch)

- Added the ability to delete an entry when editing it - every "Edit"
  form (Feeding, Sleep, Diaper, Tummy Time, Weight, Height, Head
  Circumference, BMI, Medication, Note) now has a "Delete" link above
  the update button, with an inline "Delete this entry? / Cancel"
  confirmation step before anything is actually removed. Previously
  there was no way to undo a mis-logged entry short of editing it
  into something else.

## 1.3.3 (Baby Buddy Dashboard main branch)

- Added a "Mark as taken" quick-log button to each medication's status
  badge (Notes & Meds tab) - one tap logs a new dose reusing the same
  name/dosage/unit/interval as the last one, timestamped now, instead
  of opening the full form.
- The "next dose due" badge now shows how late a dose is ("Overdue by
  3h 20m") and which day the next one is due ("Next: Tomorrow at
  19:00") instead of just a bare time with no date context.
- Added a way to manually set the next dose time (clock icon next to
  the badge) - pick a date/time and it recalculates the underlying
  interval on the last logged dose accordingly.
- Added a 30-day Medication Log (date-range selectable, CSV export)
  under the Medications card, so you can review or export what was
  actually given over time.

## 1.3.2 (Baby Buddy Dashboard main branch)

- Fixed the Feedings card on Overview showing the count twice (big
  number "9" plus a redundant "9 today" line below it). Now shows
  "9 Today" as the headline value and "Last: 1h 59m ago" underneath.

## 1.3.1 (Baby Buddy Dashboard main branch)

- Split the single "Daily Report" into two focused reports: "Daily
  Report — Growth" (feeding, diaper, sleep, tummy time) and "Daily
  Report — Measure" (weight, height, head circumference, BMI).
  Weight/Height/Head Circ./BMI stat cards now open the Measure
  report instead of a report that never included their own data.
- Added an "Avg Diapers" stat card to the Growth tab, matching the
  existing Avg Feeding/Avg Sleep cards.
- Fixed a mobile layout bug where the quick-stat grid rendered 1 or 2
  columns inconsistently depending on the exact phone width (e.g.
  iPhone 12 vs iPhone 16, both ~390px, would render differently).
  It's now a fixed 2-column layout on mobile regardless of device.
- Added BMI, head circumference, and medication tracking, backed by
  Baby Buddy's existing `/api/bmi/`, `/api/head-circumference/`, and
  `/api/medication/` endpoints. New FAB actions, Growth tab trend
  charts, and a combined "Notes & Meds" tab with a Medications card
  showing recent doses and a "next dose due" / "overdue" indicator.
- Feeding charts (Overview weekly, Growth 30-day) now show feeding
  count alongside amount, with a settings toggle to pick which
  metric(s) to display.
- Fixed forms failing silently on a network error - a failed save
  now shows an inline error banner and logs to a small, exportable
  error log (new header button with an unread-count badge).
- Fixed `timeAgo()` truncating to whole hours/days (e.g. "1h ago" for
  anything between 60-119 minutes); now shows "1h 32m ago".
- Fixed the Report view failing when Demo Mode is enabled - it now
  builds report rows from the bundled demo data instead of calling
  the (nonexistent, in demo mode) live API.
- Accessibility: added `aria-label`s to icon-only buttons and
  keyboard support (Enter/Space) to click-to-edit rows and cards.
- Hardened the backend's static file path check against path
  traversal.

## 1.2.9 (Baby Buddy Dashboard main branch)

- Fixed the quick-stat and section-card grids collapsing to a single
  column on phone-width screens instead of keeping a readable
  multi-column layout.
## 2.1.6

- Connected visibility and order preferences from Settings to the Overview page.
- Made it possible to hide Tummy Time and other Overview sections.
- Added a Tasks tab with create, edit, delete and calendar-day completion.
- Tasks can optionally appear on the Overview after a selected time.
- Completed tasks disappear from the Overview for the respective calendar day.
- Open tasks can be reminded once per day through the configured Home Assistant notify service.
- Safely migrated existing tasks with overview, display-time and reminder fields.

## 2.1.5

- Kept the stable 2.0.4 interface unchanged by default.
- Added a separately enabled React preview through `preview_ui`.
- Preview: Care tab with freely named categories, edit and delete.
- Preview: Notes restored as a dedicated tab.
- Preview: Settings foundation for language, mode, accent color, and Overview visibility and order.
- Safely migrated existing care entries with the `category_label` field.
- Fixed the previous 2.1 settings-route 500 error.

## 2.1.3

- Restored the exact ingress-relative `./api/...` calls used by the working 2.0 interface.
- Returns the URL, content type and response start for non-JSON responses to make diagnosis unambiguous.

## 2.1.2

- Derives the API base path directly from the current Home Assistant ingress path.
- Shows the actual requested URL for API-error diagnosis.

## 2.1.1

- Fixed Home Assistant ingress 401 errors through relative API and media URLs.

## 2.1.0

- Custom care categories with optional free text.
- Configurable Overview sections, including visibility and order.
- Optional tasks on the Overview with display time and Home Assistant reminders.
- Rolling sleep comparisons for 24, 48 and 72 hours, plus day, night and total sleep.
- Separate breastfeeding and bottle-feeding reports.
- Daily/average feeding selectable by duration, volume or frequency.
- BMI calculated from weight and height; no manual BMI entry needed.
- WHO growth curves for weight, length/height, head circumference and BMI.
- Notes restored as a dedicated tab with create, edit and delete.
- Dark, light and pastel themes plus five accent colors.
- German and English selectable as interface languages.
- Migrated existing 2.0 databases for custom care categories.
