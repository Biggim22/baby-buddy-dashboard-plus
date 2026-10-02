# Home Assistant care automations

Baby Buddy Dashboard Plus 2.4.5 can record an allow-listed local Care entry from a Home Assistant automation. This is intended for deliberately configured actions such as an Alexa routine, a Zigbee button or a dashboard button. It does not create a general write API and it does not change Baby Buddy records.

## Safety model

- The endpoint is off until a secret token is configured in the add-on options.
- Each child separately enables the specific Care types that may be recorded.
- The accepted types are `bath`, `full_wash`, `quick_wash`, `caraway_oil`, `nail_care`, `skin_care` and `custom`.
- A `custom` entry requires `category_label`.
- Every request has a `request_id`. Sending the same ID again returns the original entry instead of recording a duplicate.
- The token is never returned by the dashboard API and should be stored in Home Assistant `secrets.yaml`, not in an automation editor or a public export.

## One-time setup

1. Update the add-on to 2.4.5 or newer.
2. In the add-on **Configuration**, set `home_assistant_care_token` to a newly generated, high-entropy secret. Keep this value private.
3. Restart the add-on after saving the option.
4. Open **Care → Settings → Log care from Home Assistant** and select only the Care types that an automation may create for the active child. Save the Care settings.
5. Add the same token to Home Assistant's `secrets.yaml`:

   ```yaml
   baby_buddy_dashboard_plus_care_authorization: "Bearer replace-with-your-private-token"
   ```

6. Add the REST command below to `configuration.yaml`, then restart Home Assistant or reload REST commands.

`ADDON_HOSTNAME` is the internal hostname of this installed add-on. It varies by repository installation and is normally visible in the Supervisor/Docker add-on identifier. Do not copy this placeholder unchanged. The command can be tested from **Developer tools → Actions** after loading it.

```yaml
rest_command:
  baby_buddy_dashboard_plus_log_care:
    url: "http://ADDON_HOSTNAME:8099/api/ha/care"
    method: POST
    headers:
      authorization: !secret baby_buddy_dashboard_plus_care_authorization
    content_type: "application/json"
    payload: >-
      {{ {
        "child_id": child_id | int,
        "care_type": care_type,
        "category_label": category_label | default("", true),
        "notes": notes | default("", true),
        "time": time | default(now().isoformat(), true),
        "request_id": request_id | default(context.id, true)
      } | to_json }}
```

Home Assistant's built-in `rest_command` integration exposes this as the action `rest_command.baby_buddy_dashboard_plus_log_care`, supports request headers and templated JSON payloads. See the official [RESTful Command documentation](https://www.home-assistant.io/integrations/rest_command/) for general configuration and reload details.

## Example automation

This is a starting point for a Zigbee button. Replace the trigger with the actual event or device trigger from your own installation and set the real Baby Buddy child ID. A Home Assistant automation context ID is used as the idempotency ID, so retrying this action does not create a second entry.

```yaml
alias: Baby care – record a full bath
triggers:
  - trigger: event
    event_type: zha_event
    event_data:
      command: "on"
conditions: []
actions:
  - action: rest_command.baby_buddy_dashboard_plus_log_care
    data:
      child_id: 1
      care_type: bath
      notes: "Recorded by the bathroom button"
      request_id: "{{ context.id }}"
mode: single
```

For an Alexa routine, make the routine trigger a Home Assistant helper, webhook or exposed script and have that automation call the same action. Keep the care type fixed in the automation rather than passing arbitrary spoken text into the request.

## Test payload

After enabling `bath` for the intended child, call the REST action from Developer Tools with:

```yaml
child_id: 1
care_type: bath
notes: "Disposable integration test"
request_id: "manual-test-2026-10-02"
```

The response is HTTP 201 for a new record and includes `duplicate: false`. Calling it again with the same request ID returns the same entry with `duplicate: true`. Remove the disposable test entry through the Care edit dialog if you do not want to keep it.
