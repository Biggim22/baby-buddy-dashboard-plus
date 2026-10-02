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

### Medication presets and custom medicine list — Completed in 2.4.4

Moved caraway-oil suppositories out of the local Care categories and into Baby Buddy's medication history. Added an optional, editable personal medicine list so logging a medicine that the family already uses is quicker while every actual dose remains a normal Baby Buddy medication entry.

- There are no shipped medication presets and no recommendations. Every list entry is created, named, changed and removed by the family.
- Families add, rename, reorder and hide their own entries in the Notes & medication display settings. The list is empty on first use.
- A list entry contains only a name and an optional preferred dosage unit; the backend rejects any other field. It never contains an age-, weight- or condition-based dose, frequency, treatment suggestion or automated reminder.
- The logging form continues to require the caregiver to enter the actual amount and follows Baby Buddy's existing medication-history model.
- Existing care entries for caraway-oil suppositories stay visible until the family starts an explicit, one-time transfer in the Care tab. Each care entry is removed only after its medication entry was saved; nothing is reclassified or deleted without that confirmation, and repeated transfers do not create duplicates.
- Medicines discussed as examples during planning are not included in the app.

### Diaper calculator size browsing — Completed in 2.4.4

When several sizes fit the current weight, families can browse to each one and see its own stock forecast, for example to buy the next size ahead of time.

### Home Assistant quick controls on Overview — Next

Allow an optional Overview card with a small, user-selected set of Home Assistant entities that are useful in a care routine, for example switching a night light on or off.

- The user explicitly chooses every entity in Dashboard Plus settings; nothing from Home Assistant appears automatically.
- The first scope is limited to safe, directly controllable entity types such as `light`, `switch`, `scene` and `script`. The card displays its current state and exposes the appropriate on/off or activate action.
- Entities remain Home Assistant entities. Dashboard Plus does not duplicate device credentials, states or automations.
- The card follows the existing per-tab visibility and ordering controls and is disabled by default.
- Device and service names are shown exactly as supplied by Home Assistant; the UI makes no claim that an entity is medically relevant or safe for unattended operation.

### Care on Overview — Planned with the Overview controls

Offer Care as an optional Overview section, so families can see the selected latest care entries alongside the existing last-event cards without first switching to the Care tab.

- Disabled by default and enabled through the existing Overview visibility and ordering settings.
- Reuse the care-header selection: only the care categories that the family selected for the Care page header appear in the compact Overview section.
- Each displayed item links to its editable care entry; no duplicate local care data or separate summary state is created.
- The compact section must remain useful on mobile and must not replace the existing Care history.

### Home Assistant care logging — Completed in 2.4.5

Home Assistant automations, voice assistants and physical buttons can create an explicit local Plus Care entry using the documented `rest_command.baby_buddy_dashboard_plus_log_care` action.

- The add-on endpoint is disabled without a private, user-configured token.
- Each call contains an explicit child, a fixed supported care type, an optional timestamp/note and an idempotency ID. Arbitrary data and arbitrary service execution are not accepted.
- The Care settings contain a per-child allow-list: families opt in to every care type that Home Assistant may record.
- The setup guide includes an isolated REST command, test payload and a Zigbee-button example, but never ships credentials, personal entity IDs or a default automation.

### Home Assistant routine completion — Planned

Extend the same safety model to the existing task/routine model, without inventing a second medication history.

- Vitamin D remains a medication/routine completion rather than a Care category.
- A future action must use a separate fixed routine allow-list, child ID and idempotency ID, then mark only an existing local task/routine as completed.

### Home Assistant calendar bridge — Completed in 2.4.1

Connect the existing Tasks & appointments area to calendars already configured in Home Assistant, including CalDAV integrations, without collecting calendar credentials in Dashboard Plus.

- Users choose one or more `calendar.*` entities in Settings.
- The app shows upcoming external events and supports a deliberate one-time import as a local appointment.
- Local appointments can be exported explicitly to one selected Home Assistant calendar.
- Automatic two-way synchronization is intentionally out of scope: recurring exceptions, edits and deletion conflicts must remain explicit and predictable.

### Pumping / expressed milk — Completed in 2.4.3

Add an optional pumping workflow without changing existing breastfeeding or bottle tracking:

- manual entry using Baby Buddy's native pumping records;
- volume, duration and optional note;
- recent pumping history and seven-day volume analytics;
- a separate card that can be hidden or reordered like every other card.

### Paediatric appointment summary — Completed in 2.4.2

Offer a user-triggered, privacy-conscious export for a selected period. The document could include growth measurements, temperature readings, medication history and selected Baby Buddy events, plus optional local care and appointment notes.

- Export is a factual record only, never medical advice or interpretation.
- The user selects the period and every included section before export.
- The first version uses a browser print view (including “Save as PDF”) and a text download, both generated locally. A dedicated PDF renderer can be considered later only if it adds a concrete benefit.

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

## 3.0 – Standalone self-hosting without Home Assistant — Planned (low priority)

Make Dashboard Plus usable for families who do not run Home Assistant, for example on an old laptop, mini PC or NAS at home. Baby Buddy and Dashboard Plus run side by side via Docker; everything stays on the family's own hardware.

### Distribution

- Publish a multi-architecture (amd64/arm64) standalone image built from the existing root `Dockerfile`, under a Plus-owned image name. Prefer GitHub Container Registry so no additional Docker Hub account is required.
- Build and publish only on release tags or a manual workflow trigger, never on every push. Registry credentials live exclusively in GitHub repository secrets.
- An upstream Docker Hub workflow exists in the original project's history (commit `8f53981`). It targets the original project's paths and image and is not copied; the idea is re-implemented for Plus.

### Safe defaults for standalone use

- Persist local Plus data: the `docker-compose.yml` example must mount a volume at `/data`. Today the standalone container keeps care entries, tasks, appointments, settings and the medication list inside the container, so they would be lost when it is recreated.
- Access protection: inside Home Assistant, ingress authenticates every request. A standalone installation has no such layer, so anyone on the same network could read and change baby data through the dashboard and its Baby Buddy proxy. Before 3.0 is published, add a simple built-in login or require and document an authenticating reverse proxy; the default must never be an open dashboard.
- Graceful degradation without Home Assistant: notifications, voice output, the calendar bridge, the medication-overdue entity and all Home Assistant controls/actions are hidden or clearly marked as unavailable when no Supervisor token exists, instead of failing repeatedly in the background.
- Sensible defaults: time zone taken from the host or asked during setup instead of a fixed example zone.

### Setup and documentation

- A complete `docker-compose.yml` example for Baby Buddy plus Dashboard Plus with persistent volumes for both.
- A beginner-friendly guide in German and English: installing Docker, starting the stack, creating the first Baby Buddy user and API key, connecting Dashboard Plus, backups and updates.
- Backup and restore instructions covering both the Baby Buddy database and the Plus `/data` volume.

### Later, separately evaluated

- Research: a notification path that does not need Home Assistant (for example ntfy, Gotify or e-mail) as an explicit opt-in feature.

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
