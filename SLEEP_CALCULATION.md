# Sleep calculation (2.6)

The shared calculation was published and installed for testing in 2.6.0-rc.1.
The original implementation notes below are historical, not the current release status.

## Follow-up included in 2.6.0

- Overview sleep history now includes explicit start/end dates. Analytics labels
  include dates and explain that calendar days split nights at midnight.
- A gap between completed records is unrecorded time, not proof of wakefulness.
  It contributes no recorded sleep; the dashboard must never invent a missing
  interval or extend a record automatically.
- Added synthetic regression tests for overnight gaps and date labels. The shared
  calculation itself is unchanged. Private diagnostic records are not stored here.
- Full frontend suite: 203 tests passed in Europe/Berlin; production build passed.
  These follow-up changes are included in the stable 2.6.0 publication.

## Shared rules

- `frontend/src/utils/sleep.js` is the common calculation for Overview,
  Analytics, the daily report and the paediatric report.
- Completed intervals are clipped to the requested window and current time.
  Invalid/reversed intervals and unfinished records are excluded. Running timers
  remain separate; they do not become saved sleep implicitly.
- Calendar days use device-local midnight boundaries, including 23/25-hour DST
  days. Rolling windows are exactly 24 elapsed hours and do not overlap.
- Day is 06:00–20:00 device-local time; night is the remainder. Baby Buddy's
  `nap` flag does not determine this split. Day and night retain fractional
  minutes internally and add up to the total before display rounding.
- Overlapping/duplicate intervals count once. No source records are modified.
- Today's incomplete calendar day is marked with an asterisk and explained.
- Sleep requests use `end_min` and `start_max`, so records beginning before the
  window are included. Sleep pagination is exhausted through the local proxy;
  stalled/incomplete pagination raises an error rather than reporting success.
- The paediatric report now reports actual sleep hours, not record count, and
  retains its loaded period when the date inputs are edited before refreshing.

## Verification

Run the frontend suite with `TZ=Europe/Berlin` to exercise both DST transitions.
Tests cover clipping at midnight, 06:00/20:00 boundaries, overlapping records,
invalid and unfinished intervals, partial today, contiguous rolling windows,
shared totals across report/overview, and paginated reads. Also run in UTC.

No release version has been bumped: this is the first local implementation block
for 2.6, not a published release. No Home Assistant installation or data changes.
Device UI checks and maintainer acceptance against a completed live day/night
remain separate, pending steps. Only synthetic records belong in tests.

Local verification on 2026-11-02:
- Full frontend suite, Europe/Berlin: 176 tests passed (20 files), including both
  DST transitions and the rendered paediatric report regression.
- Sleep and paediatric report tests, UTC: 7 passed; the 2 Berlin-only DST tests
  intentionally skipped (they passed in the full Berlin run).
- Vite production build succeeded. Existing bundle-size warning remains.
- No push, release or live update; changes remain uncommitted locally.
