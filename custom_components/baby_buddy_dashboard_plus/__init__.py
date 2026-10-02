"""Native Home Assistant action for paired Baby Buddy Dashboard Plus Care."""

from __future__ import annotations

import logging
from uuid import uuid4
from datetime import datetime
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
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
    SERVICE_COMPLETE_TASK,
    SERVICE_LOG_MEASUREMENT,
    TASK_COMPLETE_PATH,
    MEASUREMENT_PATH,
    SERVICE_GET_LAST_CARE,
    LAST_CARE_PATH,
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
TASK_SCHEMA = vol.Schema({vol.Required("task_id"): vol.All(int, vol.Range(min=1)), vol.Optional("due_date"): cv.date})
MEASUREMENT_SCHEMA = vol.Schema({
    vol.Required("measurement_type"): vol.In(("temperature", "height", "weight")),
    vol.Required("value"): vol.All(vol.Coerce(float), vol.Range(min=0, min_included=False)),
    vol.Required("unit"): vol.In(("C", "cm", "kg", "g")),
    vol.Required("request_id"): cv.string,
    vol.Optional("time"): cv.datetime,
})
CARE_QUERY_SCHEMA = vol.Schema({vol.Required("care_type"): vol.In(CARE_TYPES), vol.Optional("category_label", default=""): cv.string})


async def async_post_action(hass, path, payload):
    """Return response data and report safe, translated errors to automations."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if len(entries) != 1:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_paired")
    entry = entries[0]
    if entry.state is not ConfigEntryState.LOADED:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_available")
    try:
        async with async_get_clientsession(hass).post(
            entry.data[CONF_ADDON_URL].rstrip("/") + path, json=payload,
            headers={"X-Baby-Buddy-Integration-Token": entry.data[CONF_INTEGRATION_TOKEN]},
            timeout=aiohttp.ClientTimeout(total=25),
        ) as response:
            data = await response.json()
            if response.status >= 400:
                safe_errors = {"task_not_allowed", "task_not_found", "task_not_due", "measurement_not_allowed", "care_not_allowed",
                               "measurement_pending", "request_conflict", "measurement_rejected", "measurement_api_unavailable", "measurement_configuration_missing"}
                detail = data.get("detail") if isinstance(data, dict) else None
                key = detail if isinstance(detail, str) and detail in safe_errors else {
                    401: "invalid_auth", 422: "invalid_action", 403: "action_not_allowed",
                }.get(response.status, "cannot_connect")
                raise ServiceValidationError(translation_domain=DOMAIN, translation_key=key)
            if not isinstance(data, dict) or data.get("status") not in ("saved", "already_saved", "answer"):
                raise ValueError("Invalid action response")
            return data
    except (aiohttp.ClientError, TimeoutError, ValueError) as err:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="cannot_connect") from err


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the action even before a paired entry is loaded."""

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
            # Several actions in one automation share a context. Each service
            # call must remain distinct; transport retries reuse this payload.
            "request_id": uuid4().hex,
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
                    key = {
                        401: "invalid_auth",
                        403: "care_not_allowed",
                        422: "invalid_care",
                    }.get(response.status, "cannot_connect")
                    raise ServiceValidationError(translation_domain=DOMAIN, translation_key=key)
        except (aiohttp.ClientError, TimeoutError) as err:
            raise ServiceValidationError(
                "Cannot reach Baby Buddy Dashboard Plus",
                translation_domain=DOMAIN,
                translation_key="cannot_connect",
            ) from err

    async def async_complete_task(call: ServiceCall):
        payload = {"task_id": call.data["task_id"]}
        if call.data.get("due_date") is not None:
            payload["due_date"] = call.data["due_date"].isoformat()
        return await async_post_action(hass, TASK_COMPLETE_PATH, payload)

    async def async_log_measurement(call: ServiceCall):
        payload = {key: call.data[key] for key in ("measurement_type", "value", "unit", "request_id")}
        if call.data.get("time") is not None:
            payload["time"] = call.data["time"].isoformat()
        return await async_post_action(hass, MEASUREMENT_PATH, payload)

    async def async_get_last_care(call: ServiceCall):
        return await async_post_action(hass, LAST_CARE_PATH, {"care_type": call.data["care_type"], "category_label": call.data["category_label"].strip()})

    for name, handler, schema, response in (
        (SERVICE_LOG_CARE, async_log_care, SERVICE_SCHEMA, SupportsResponse.NONE),
        (SERVICE_COMPLETE_TASK, async_complete_task, TASK_SCHEMA, SupportsResponse.OPTIONAL),
        (SERVICE_LOG_MEASUREMENT, async_log_measurement, MEASUREMENT_SCHEMA, SupportsResponse.OPTIONAL),
        (SERVICE_GET_LAST_CARE, async_get_last_care, CARE_QUERY_SCHEMA, SupportsResponse.OPTIONAL),
    ):
        if not hass.services.has_service(DOMAIN, name):
            hass.services.async_register(DOMAIN, name, handler, schema=schema, supports_response=response)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Mark the paired service entry ready; the action itself is registered globally."""
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """No per-entry resources are allocated."""
    return True
