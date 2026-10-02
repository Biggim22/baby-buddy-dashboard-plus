"""UI pairing flow for Baby Buddy Dashboard Plus."""

from __future__ import annotations

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_ADDON_URL, CONF_INTEGRATION_TOKEN, CONF_PAIRING_CODE, DEFAULT_ADDON_URL, DOMAIN, PAIR_PATH


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Pair the native action with a short code generated in Dashboard Plus."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Receive the one-time code from the dashboard's Care settings."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        errors = {}
        if user_input is not None:
            code = "".join(user_input[CONF_PAIRING_CODE].upper().split())
            session = async_get_clientsession(self.hass)
            try:
                async with session.post(
                    DEFAULT_ADDON_URL + PAIR_PATH,
                    json={CONF_PAIRING_CODE: code},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status in (401, 422):
                        errors["base"] = "invalid_pairing_code"
                    elif response.status >= 400:
                        errors["base"] = "cannot_connect"
                    else:
                        payload = await response.json()
                        if (not isinstance(payload, dict)
                            or not isinstance(payload.get("child_id"), int)
                            or not isinstance(payload.get("integration_token"), str)
                            or not payload["integration_token"]):
                            raise ValueError("Invalid pairing response")
                        await self.async_set_unique_id(f"{DOMAIN}-{payload['child_id']}")
                        self._abort_if_unique_id_configured()
                        return self.async_create_entry(
                            title="Baby Buddy Dashboard Plus",
                            data={
                                CONF_ADDON_URL: DEFAULT_ADDON_URL,
                                CONF_INTEGRATION_TOKEN: payload["integration_token"],
                            },
                        )
            except (aiohttp.ClientError, TimeoutError, ValueError):
                errors["base"] = "cannot_connect"
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_PAIRING_CODE): str}),
            errors=errors,
        )
