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

## Troubleshooting

- **Integration cannot be reached:** ensure that the Baby Buddy Dashboard Plus add-on is installed and running, then create a new pairing code.
- **Care type is rejected:** enable that type in **Care → Settings → Log care from Home Assistant** and save before using the action.
- **Pairing code expired:** generate a new code. The old code cannot be reused.
- **Legacy 2.4.5 REST command:** remove any experimental `rest_command` and related secret from Home Assistant. They are not required by 2.4.6.
- **Missing integration icon:** the integration includes the Plus icon and logo in its own `brand/` directory, supported by Home Assistant 2026.3 and newer. If you installed a revision without these files, download the latest integration revision through HACS and restart Home Assistant. If necessary, refresh the browser. Updating only the app does not update the integration's images. See [Home Assistant's local brand-image documentation](https://developers.home-assistant.io/blog/2026/02/24/brands-proxy-api/).
