"""Native Home Assistant action for paired Baby Buddy Dashboard Plus Care."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .const import (
    ATTR_CATEGORY_LABEL,
    ATTR_CARE_TYPE,
    ATTR_NOTES,
    ATTR_TIME,
    CARE_PATH,
    CARE_TYPES,
    CONF_ADDON_URL,
    CONF_INTEGRATION_TOKEN,
    DOMAIN,
    SERVICE_LOG_CARE,
)

_LOGGER = logging.getLogger(__name__)

SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CARE_TYPE): vol.In(CARE_TYPES),
        vol.Optional(ATTR_CATEGORY_LABEL, default=""): cv.string,
        vol.Optional(ATTR_NOTES, default=""): cv.string,
        vol.Optional(ATTR_TIME): cv.datetime,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the action even before a paired entry is loaded."""
    if hass.services.has_service(DOMAIN, SERVICE_LOG_CARE):
        return True

    async def async_log_care(call: ServiceCall) -> None:
        entries = hass.config_entries.async_entries(DOMAIN)
        if len(entries) != 1:
            raise ServiceValidationError(
                "Baby Buddy Dashboard Plus has not been paired yet",
                translation_domain=DOMAIN,
                translation_key="not_paired",
            )
        entry = entries[0]
        if entry.state is not ConfigEntryState.LOADED:
            raise ServiceValidationError(
                "Baby Buddy Dashboard Plus is not available",
                translation_domain=DOMAIN,
                translation_key="not_available",
            )
        payload: dict[str, Any] = {
            ATTR_CARE_TYPE: call.data[ATTR_CARE_TYPE],
            ATTR_CATEGORY_LABEL: call.data[ATTR_CATEGORY_LABEL].strip(),
            ATTR_NOTES: call.data[ATTR_NOTES].strip(),
            "request_id": call.context.id,
        }
        if value := call.data.get(ATTR_TIME):
            payload[ATTR_TIME] = value.isoformat() if isinstance(value, datetime) else str(value)
        session = async_get_clientsession(hass)
        url = entry.data[CONF_ADDON_URL].rstrip("/") + CARE_PATH
        try:
            async with session.post(
                url,
                json=payload,
                headers={"X-Baby-Buddy-Integration-Token": entry.data[CONF_INTEGRATION_TOKEN]},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status >= 400:
                    _LOGGER.warning("Dashboard Plus rejected a Care action: HTTP %s", response.status)
                    raise ServiceValidationError(
                        "The selected Care type is not enabled in Dashboard Plus",
                        translation_domain=DOMAIN,
                        translation_key="care_not_allowed",
                    )
        except aiohttp.ClientError as err:
            raise ServiceValidationError(
                "Cannot reach Baby Buddy Dashboard Plus",
                translation_domain=DOMAIN,
                translation_key="cannot_connect",
            ) from err

    hass.services.async_register(DOMAIN, SERVICE_LOG_CARE, async_log_care, schema=SERVICE_SCHEMA)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Mark the paired service entry ready; the action itself is registered globally."""
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """No per-entry resources are allocated."""
    return True
