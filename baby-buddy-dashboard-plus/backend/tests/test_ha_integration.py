"""Exercise integration behavior with small HA API doubles, not a live HA install."""
import importlib.util
import sys
from datetime import datetime
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
import voluptuous as vol

ROOT = Path(__file__).resolve().parents[3]


class ValidationError(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args)
        self.key = kwargs.get("translation_key")


class Response:
    def __init__(self, status=201, payload=None, error=None):
        self.status, self.payload, self.error = status, payload, error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self

    async def __aexit__(self, *args):
        return False

    async def json(self):
        return self.payload


class Session:
    def __init__(self):
        self.response, self.calls = Response(), []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


@pytest.fixture
def integration(monkeypatch):
    loaded = object()
    session = Session()
    registered = {}
    entry = SimpleNamespace(state=loaded, data={"addon_url": "http://addon:8099", "integration_token": "test-token"})
    hass = SimpleNamespace(
        services=SimpleNamespace(has_service=lambda *a: False, async_register=lambda domain, name, handler, **kw: registered.update(handler=handler, schema=kw["schema"])),
        config_entries=SimpleNamespace(async_entries=lambda domain: [entry]),
    )
    class Flow:
        def __init_subclass__(cls, **kwargs):
            pass
        def _async_current_entries(self):
            return []
        async def async_set_unique_id(self, value):
            self.unique_id = value
        def _abort_if_unique_id_configured(self):
            pass
        def async_create_entry(self, **kwargs):
            return {"type": "create_entry", **kwargs}
        def async_show_form(self, **kwargs):
            return {"type": "form", **kwargs}
        def async_abort(self, **kwargs):
            return {"type": "abort", **kwargs}
    modules = {
        "homeassistant": {"config_entries": SimpleNamespace(ConfigFlow=Flow)},
        "homeassistant.config_entries": {"ConfigEntryState": SimpleNamespace(LOADED=loaded)},
        "homeassistant.core": {"HomeAssistant": object, "ServiceCall": object},
        "homeassistant.exceptions": {"ServiceValidationError": ValidationError},
        "homeassistant.helpers": {},
        "homeassistant.helpers.config_validation": {"string": str, "datetime": lambda v: v if isinstance(v, datetime) else datetime.fromisoformat(v)},
        "homeassistant.helpers.aiohttp_client": {"async_get_clientsession": lambda hass: session},
        "homeassistant.helpers.typing": {"ConfigType": dict},
    }
    for name, attrs in modules.items():
        module = ModuleType(name)
        module.__dict__.update(attrs)
        monkeypatch.setitem(sys.modules, name, module)
    name = "care_integration_test"
    path = ROOT / "custom_components" / "baby_buddy_dashboard_plus"
    spec = importlib.util.spec_from_file_location(name, path / "__init__.py", submodule_search_locations=[str(path)])
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, name, module)
    spec.loader.exec_module(module)
    flow_spec = importlib.util.spec_from_file_location(name + ".config_flow", path / "config_flow.py")
    flow_module = importlib.util.module_from_spec(flow_spec)
    flow_spec.loader.exec_module(flow_module)
    yield SimpleNamespace(module=module, flow=flow_module, hass=hass, session=session, registered=registered, entry=entry)
    sys.modules.pop(name + ".const", None)


async def test_actions_with_same_context_are_independent(integration):
    i = integration
    await i.module.async_setup(i.hass, {})
    schema = i.registered["schema"]
    with pytest.raises(vol.Invalid):
        schema({"care_type": "arbitrary"})
    for kind in ("bath", "nail_care"):
        call = SimpleNamespace(data=schema({"care_type": kind, "notes": "  test  "}), context=SimpleNamespace(id="shared-context"))
        await i.registered["handler"](call)
    first, second = [call[1]["json"] for call in i.session.calls]
    assert first["request_id"] != second["request_id"]
    assert first["notes"] == "test"
    assert "child_id" not in first


@pytest.mark.parametrize("status,key", [(401, "invalid_auth"), (403, "care_not_allowed"), (422, "invalid_care"), (500, "cannot_connect")])
async def test_service_error_mapping(integration, status, key):
    i = integration
    await i.module.async_setup(i.hass, {})
    i.session.response = Response(status)
    call = SimpleNamespace(data=i.registered["schema"]({"care_type": "bath"}))
    with pytest.raises(ValidationError) as error:
        await i.registered["handler"](call)
    assert error.value.key == key


async def test_service_timeout_is_readable(integration):
    i = integration
    await i.module.async_setup(i.hass, {})
    i.session.response = Response(error=TimeoutError())
    with pytest.raises(ValidationError) as error:
        await i.registered["handler"](SimpleNamespace(data=i.registered["schema"]({"care_type": "bath"})))
    assert error.value.key == "cannot_connect"


@pytest.mark.parametrize("state,key", [("missing", "not_paired"), ("unloaded", "not_available")])
async def test_unavailable_integration_does_not_send_requests(integration, state, key):
    i = integration
    await i.module.async_setup(i.hass, {})
    if state == "missing":
        i.hass.config_entries.async_entries = lambda domain: []
    else:
        i.entry.state = object()
    with pytest.raises(ValidationError) as error:
        await i.registered["handler"](SimpleNamespace(data=i.registered["schema"]({"care_type": "bath"})))
    assert error.value.key == key
    assert not i.session.calls


@pytest.mark.parametrize("status,payload,error", [(401, None, "invalid_pairing_code"), (422, None, "invalid_pairing_code"), (500, None, "cannot_connect"), (200, {}, "cannot_connect")])
async def test_pairing_errors_remain_in_ui(integration, status, payload, error):
    i = integration
    i.session.response = Response(status, payload)
    flow = i.flow.ConfigFlow()
    flow.hass = i.hass
    result = await flow.async_step_user({"pairing_code": "abcd 2345"})
    assert result["type"] == "form"
    assert result["errors"]["base"] == error


async def test_pairing_creates_entry_without_user_managed_token(integration):
    i = integration
    i.session.response = Response(200, {"child_id": 2, "integration_token": "internal-test-token"})
    flow = i.flow.ConfigFlow()
    flow.hass = i.hass
    result = await flow.async_step_user({"pairing_code": "abcd 2345"})
    assert result["type"] == "create_entry"
    assert result["data"]["integration_token"] == "internal-test-token"
    assert i.session.calls[0][1]["json"] == {"pairing_code": "ABCD2345"}
