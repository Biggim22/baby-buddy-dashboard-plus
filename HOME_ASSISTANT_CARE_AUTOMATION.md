# Home Assistant care actions

Starting with Baby Buddy Dashboard Plus 2.4.6, Care entries can be recorded through a native Home Assistant action. The setup uses Home Assistant's UI: no `configuration.yaml`, `secrets.yaml`, Docker hostname or user-managed token is required.

## What this enables

Once paired, Home Assistant provides the action:

```text
baby_buddy_dashboard_plus.log_care
```

It can be selected from the normal automation editor and used by a Zigbee button, a dashboard button, an Alexa-triggered helper or any other Home Assistant automation. The action offers a fixed Care-type selection, optional note and optional timestamp.

## One-time setup

1. Update Baby Buddy Dashboard Plus to 2.4.6 or newer.
2. In HACS, add `https://github.com/Biggim22/baby-buddy-dashboard-plus` as an **Integration** custom repository, then download **Baby Buddy Dashboard Plus**. HACS is a separate, one-time prerequisite; installing the add-on alone does not install this integration.
3. Restart Home Assistant when HACS requests it.
4. In Dashboard Plus, open **Care → Settings → Log care from Home Assistant** through Home Assistant's sidebar.
5. Enable only the Care types that Home Assistant may record for the current child and save the Care settings.
6. Select **Create one-time pairing code**. The code is valid for ten minutes and is not a permanent secret. Generate it after installation and restart, not before.
7. Go to **Settings → Devices & services → Add integration**, choose **Baby Buddy Dashboard Plus**, and enter the displayed pairing code.

Home Assistant receives an internal credential during this short pairing step. It is not shown in the dashboard, is not stored in YAML, and is not entered into automations.

## Create an automation

In an automation, add the action **Baby Buddy Dashboard Plus: Log care**. Choose a Care type that was enabled in Dashboard Plus. For `custom`, enter a custom category as well. Leave Time empty to use the current time.

Example YAML shown by Home Assistant's automation editor:

```yaml
actions:
  - action: baby_buddy_dashboard_plus.log_care
    data:
      care_type: bath
      notes: Recorded by the bathroom button
```

Each service invocation receives its own request ID, including multiple actions in the same automation. Replaying the exact API payload keeps a single Care entry. Running an automation again intentionally creates a new entry; it is not treated as a transport retry.

This initial integration pairs one child with one Dashboard Plus add-on on the same Home Assistant installation. Select that child before generating the code. Multiple children, remote standalone servers and simultaneous local/GitHub add-on pairings are not supported by this integration yet.

## Safety boundaries

- The Dashboard Plus Care settings are the allow-list. Disabled types are rejected even when an automation requests them.
- The integration accepts only the documented Care types, optional timestamp, optional note and custom-category label.
- The native action records only local Plus Care data. It cannot run arbitrary Home Assistant services, execute code, or change Baby Buddy medication records.
- Pairing codes expire after ten minutes and are invalidated as soon as pairing succeeds. Creating a new pairing rotates the previous integration credential for that child.
- In Supervisor mode, local settings and code creation accept only the actual ingress proxy peer. The integration endpoints remain reachable internally but require a one-time code or the paired credential. Standalone development requires a trusted network; it is not a public authenticated server.

## Tasks, measurements and Care queries (2.4.7)

The following actions require **both the add-on and HACS integration at 2.4.7 or newer**. Updating only one component is not sufficient. The actions do not install or activate an Alexa Skill by themselves.

Permissions are selected for the intended child under **Care → Settings → Log care from Home Assistant**. Care types remain a fixed allow-list. Active ordinary tasks are listed by title and ID and must be explicitly selected; appointments are not eligible. Measurement types default to disabled. Existing pairing credentials remain bound to their original child and can use only the permissions enabled for that child. Pairing also works when only a task or measurement type is enabled.

| Home Assistant action | Input | Success response |
| --- | --- | --- |
| `baby_buddy_dashboard_plus.complete_task` | Required positive integer `task_id`; optional ISO `due_date` | `status: saved` or `already_saved`, `message`, `task_id`, `due_date`, `completed: true`, `completed_at` |
| `baby_buddy_dashboard_plus.log_measurement` | Required `measurement_type` (`temperature`, `height`, `weight`), numeric `value`, `unit` (`C`, `cm`, `kg`, `g`), unique `request_id`; optional ISO `time` | `status: saved` or `already_saved`, `message`, Baby Buddy `record_id` |
| `baby_buddy_dashboard_plus.get_last_care` | Required enabled `care_type`; `category_label` required for `custom` | `status: answer`, `message`, `care_type`, `last_at` (ISO timestamp or null) |

All three actions support optional Home Assistant response data (`SupportsResponse.OPTIONAL` / `response_variable`). Service errors use `ServiceValidationError` with translated, narrow error keys; they are not successful confirmations. No caller supplies a child ID or a Baby Buddy credential.

### Explicit task completion, including a user-selected Vitamin D task

Select the actual task in Dashboard Plus rather than matching a title in an external script. `complete_task` defaults to today's date in the add-on timezone. It rejects foreign-child/missing tasks, tasks not enabled for Home Assistant, inactive tasks, appointments, days on which the task is not due, and future dates. Repeating the same task/date returns `already_saved` and the original `completed_at`, without creating another row or undoing the checkbox. There is no blind toggle. The dashboard's own repeated checked-state write also preserves the first timestamp; deliberately unchecking and later checking remains a new confirmation.

A task named Vitamin D is only a family checklist item. Completion does not select a medication, infer a dose, call Baby Buddy's medication API or recommend treatment. The published dashboard's existing task template is not automatically exposed to Home Assistant.

### Measurement data source, units and retries

The configured Baby Buddy client writes the existing endpoints [`/api/temperature/`, `/api/height/`, `/api/weight/`](https://docs.baby-buddy.net/api/). There is no second measurement database. Temperature uses `child`, `temperature` and a timezone-aware `time`; height/weight use `child`, `height`/`weight` and `date`, as in the existing dashboard forms.

- Temperature input uses `unit: C`; height uses `cm`; weight uses `kg` or `g` (grams are divided by 1000).
- The configured add-on `unit_system` must match the units used by the existing Baby Buddy data. Metric output is C/cm/kg; imperial output is converted to F/in/lb before saving. Do not change this setting merely to match a spoken unit.
- Optional `time` defaults to now. Naive timestamps use the add-on timezone; aware timestamps are converted to it. Height and weight retain only the resulting local date because Baby Buddy's native models have date fields, not full measurement timestamps.
- Values are explicit, finite and positive, and must fit the existing dashboard form limits (temperature 30–45 C, height up to 200 cm, weight up to 30 kg). These are input checks, not a medical assessment or a recommendation. Unsupported units, missing values and invalid IDs are rejected. Native Baby Buddy validation remains authoritative.
- Keep the same `request_id` and exact input for retries. An acknowledged write returns `already_saved` with the original remote ID. Different input under the same ID raises `request_conflict`. A new genuine measurement gets a new ID.
- Baby Buddy POST does not provide a native idempotency key. The local request ledger reserves the ID before sending. A timeout, uncertain 5xx, interrupted write or malformed success response leaves it `pending`; repeats raise `measurement_pending` and never resend automatically. Check Baby Buddy before any deliberate new request. There is intentionally no automatic pending-ledger cleanup or replay.
- The local ledger contains only paired child ID, request ID, input hash, pending/saved status and remote record ID, not numeric measurements. Demo-mode outbound writes are disabled. Version 2.4.7 adds this table without modifying existing family records; back up app data before upgrading.

### Read-only Care query

`get_last_care` queries the exact enabled Care type for the paired child, with an explicit category filter for custom Care. It returns only a timestamp and a short answer, no notes, medication records or measurements. An empty history returns `last_at: null`, not an invented event. It does not infer a wash from a different Care type.

The local Alexa Skill/dispatcher project owns speech parsing, user confirmation, the optional Skill account linkage and converting the response into speech. Existing fixed Routine/Matter paths do not parse free numeric measurements. These actions do not install or expose an Alexa Skill by themselves.

## Troubleshooting (published 2.4.6)

- **Integration cannot be reached:** ensure that the Baby Buddy Dashboard Plus add-on is installed and running, then create a new pairing code.
- **Care type is rejected:** enable that type in **Care → Settings → Log care from Home Assistant** and save before using the action.
- **Pairing code expired:** generate a new code. The old code cannot be reused.
- **Legacy 2.4.5 REST command:** remove any experimental `rest_command` and related secret from Home Assistant. They are not required by 2.4.6.
- **Missing integration icon:** the integration includes the Plus icon and logo in its own `brand/` directory, supported by Home Assistant 2026.3 and newer. If you installed a revision without these files, download the latest integration revision through HACS and restart Home Assistant. If necessary, refresh the browser. Updating only the app does not update the integration's images. See [Home Assistant's local brand-image documentation](https://developers.home-assistant.io/blog/2026/02/24/brands-proxy-api/).
