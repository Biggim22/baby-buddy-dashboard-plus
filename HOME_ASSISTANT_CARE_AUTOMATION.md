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
2. In Dashboard Plus, open **Care → Settings → Log care from Home Assistant**.
3. Enable only the Care types that Home Assistant may record for the current child and save the Care settings.
4. Select **Create one-time pairing code**. The code is valid for ten minutes and is not a permanent secret.
5. In HACS, add this repository as an **Integration** custom repository if it is not already available there, then download **Baby Buddy Dashboard Plus**.
6. Restart Home Assistant when HACS requests it.
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

Each invocation automatically carries Home Assistant's context ID. If Home Assistant retries the same automation action, Dashboard Plus keeps a single Care entry instead of creating duplicates.

## Safety boundaries

- The Dashboard Plus Care settings are the allow-list. Disabled types are rejected even when an automation requests them.
- The integration accepts only the documented Care types, optional timestamp, optional note and custom-category label.
- The native action records only local Plus Care data. It cannot run arbitrary Home Assistant services, execute code, or change Baby Buddy medication records.
- Pairing codes expire after ten minutes and are invalidated as soon as pairing succeeds. Creating a new pairing rotates the previous integration credential for that child.

## Troubleshooting

- **Integration cannot be reached:** ensure that the Baby Buddy Dashboard Plus add-on is installed and running, then create a new pairing code.
- **Care type is rejected:** enable that type in **Care → Settings → Log care from Home Assistant** and save before using the action.
- **Pairing code expired:** generate a new code. The old code cannot be reused.
- **Legacy 2.4.5 REST command:** remove any experimental `rest_command` and related secret from Home Assistant. They are not required by 2.4.6.
