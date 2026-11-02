# 2.6.2 — day-specific History filters and guarded backfill

## Implementation plan

1. Derive category availability and distinct record counts from all day-clipped
   events before applying filters. Reuse timeline icons/colours; use plain labels.
2. Add a session-only backfill toggle, off by default and reset on child/day
   changes. Only explicit buttons open forms; no row, hover or drag gesture.
3. Show a general add button and time-span buttons between distinct visible
   timestamps. Explain hidden events using the unfiltered records, not just
   visible endpoints. Never interpret a gap as missing sleep.
4. Reuse existing create forms with a separate initial-values prop, never an
   edit record. Include care; tasks retain their existing confirmation flow.
   Allow empty-day and boundary additions, editable dates and explicit saving.
5. For sleep backfills, warn about existing overlapping records and recheck the
   selected interval against fresh paginated sleep data before saving. Do not
   create an overlapping interval or modify existing records automatically.
6. Refresh History after successful creation without resetting day/sort/filter;
   reveal the new category. Test filters, toggle, time spans, hidden records,
   create-vs-edit behavior, overlap safety and retained navigation state.
7. Run full tests and build; release app 2.6.2, update docs, commit and push.
   No live Home Assistant update. Integration remains unchanged at 2.6.0.

## Acceptance

Implementation completed locally, including the additional header sync-age display.
Sync age uses the last successful refresh timestamp and ticks without network requests.

Release verification: 217 frontend tests passed (Europe/Berlin), 132 backend/
integration tests passed, and the production build succeeded with the existing
bundle-size warning. No private records were created or changed for testing.

- Mouse, keyboard and touch use the same visible controls (44px targets).
- Categories absent from a day cannot be toggled, but remain available for creation.
- No health data or credentials in tests/docs; use synthetic fixtures only.
- Actual mobile visual acceptance remains with the maintainer after installation.
