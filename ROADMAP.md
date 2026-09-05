# Baby Buddy Dashboard Plus – Roadmap

This is a living planning document for features that are not yet implemented. Priorities may change based on feedback, implementation effort and the availability of safe, well-defined data from Baby Buddy.

Baby Buddy Dashboard Plus remains a dashboard and companion for [Baby Buddy](https://github.com/babybuddy/babybuddy). Feedings, sleep, diapers, medication and growth measurements continue to come from Baby Buddy; care, tasks and appointments are Plus-specific local extensions.

## Status legend

- **Planned** — agreed direction; implementation has not started.
- **Completed** — delivered in a released version; retained here as a record.
- **Research** — worth investigating before a product decision.
- **Candidate** — useful idea, but not committed to a release.

## 2.3.x – reliability and polish (completed in 2.3.3)

### Localised numeric input — Completed

Accept both a decimal comma and a decimal point when entering values such as weight, height, temperature, bottle volume and medication amounts. The stored value remains a normal number, independent of the active UI language.

### Form reliability and data integrity — Completed

- Show save and delete errors directly in the relevant dialog instead of failing silently.
- Ask for confirmation before saving implausibly long feeding, sleep or tummy-time entries.
- Audit date, time and time-zone handling for manually edited entries so the entered local time is preserved.

### Translation audit — Completed

Complete an end-to-end language review: tabs, card titles, dialogs, chart tooltips, settings, notifications, empty states and validation messages must consistently use the selected language. The changelog remains English.

## 2.4 – optional tracking and reporting

### Pumping / expressed milk — Candidate

Add an optional pumping workflow without changing existing breastfeeding or bottle tracking:

- quick start/stop timer and manual entry;
- volume, duration and optional note;
- recent pumping history and daily/weekly volume analytics;
- a separate card that can be hidden or reordered like every other card.

### Paediatric appointment summary — Research

Offer a user-triggered, privacy-conscious export for a selected period. The document could include growth measurements, temperature readings, medication history and selected Baby Buddy events, plus optional local care and appointment notes.

- Export is a factual record only, never medical advice or interpretation.
- The user selects the period and every included section before export.
- PDF generation, layout and language need to be evaluated before implementation.

### Optional elapsed-time reminders — Candidate

Allow configurable Home Assistant alerts when the time since the last feeding or diaper change exceeds a user-defined threshold.

- Disabled by default.
- Separate thresholds and quiet hours.
- Clear distinction between a convenience reminder and medical advice.

## Clothing-size planner — Research

An optional planner inspired by the diaper-size and stock calculator. Its job is to make buying ahead a little less guesswork, not to prescribe a size.

### Proposed first version

- Recommend a current clothing size primarily from the latest body length, with weight as supporting context.
- Use common EU length-based sizes (for example 50, 56, 62, 68) as the default mapping.
- Estimate the likely next size and an earliest, expected and latest changeover date from the recorded growth trend.
- Let users override the size ranges for a brand, cut or country-specific sizing system.
- Optionally maintain a small wardrobe inventory by size and garment type (for example bodysuits, trousers and sleepwear), rather than pretending clothing has a predictable daily consumption rate.
- Explain uncertainty clearly: cuts, proportions, preferences and growth spurts can make the prediction wrong.

### Open product decisions

- Which default size charts are suitable and may be referenced or reproduced?
- Should the first version support only EU centimetre sizes, or also UK/US age labels?
- How should users enter their existing wardrobe without turning the feature into a full inventory application?

## Later ideas

### Sleep sounds through Home Assistant media players — Research

Investigate an optional control for white noise or other sleep sounds through a user-selected `media_player`.

- Prefer a user-provided local media source, Home Assistant media library or explicitly licensed stream.
- Do not bundle copyrighted audio or rely on an unverified external stream.
- Keep playback separate from any claim that a sound improves a child's sleep.

## Explicit non-goals

- No automated feeding, medication, growth or clothing recommendations presented as medical advice.
- No cloud account, telemetry or publication of family data.
- No automatic copying of code from other forks; useful ideas are re-evaluated and integrated in a maintainable Plus-specific way.

## Contributions and feedback

Ideas and bug reports are welcome through [GitHub Issues](https://github.com/Biggim22/baby-buddy-dashboard-plus/issues). Please never include API keys, internal URLs, names or health data in public reports.
