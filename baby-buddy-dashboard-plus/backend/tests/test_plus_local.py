from datetime import datetime

import pytest
from pydantic import ValidationError

import backend.plus_local as plus_local


def use_temp_database(monkeypatch, tmp_path):
    monkeypatch.setattr(plus_local, "DATA_DIR", tmp_path)
    monkeypatch.setattr(plus_local, "DB_PATH", tmp_path / "baby_buddy_dashboard_plus.db")
    plus_local.init_database()


async def test_medication_list_starts_empty_and_keeps_family_order(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    assert (await plus_local.get_local_settings(1))["medication_presets"] == []

    patch = plus_local.SettingsPatch(medication_presets=[
        {"id": "b", "name": "  Second  ", "unit": "", "hidden": True},
        {"id": "a", "name": "First", "unit": "ml"},
    ])
    saved = await plus_local.patch_local_settings(1, patch)

    assert saved["medication_presets"] == [
        {"id": "b", "name": "Second", "unit": "", "hidden": True},
        {"id": "a", "name": "First", "unit": "ml", "hidden": False},
    ]
    assert (await plus_local.get_local_settings(2))["medication_presets"] == []


@pytest.mark.parametrize("preset", [
    {"id": "a", "name": "Example", "dosage": 2.5},
    {"id": "a", "name": "Example", "interval_hours": 6},
    {"id": "a", "name": "   "},
    {"id": "a", "name": "Example", "unit": "suppositories"},
])
def test_medication_list_rejects_doses_rules_and_invalid_values(preset):
    with pytest.raises(ValidationError):
        plus_local.SettingsPatch(medication_presets=[preset])


def test_medication_list_rejects_duplicate_ids():
    with pytest.raises(ValidationError):
        plus_local.SettingsPatch(medication_presets=[{"id": "a", "name": "One"}, {"id": "a", "name": "Two"}])


async def test_care_list_can_be_filtered_by_type(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    for care_type in ("bath", "caraway_suppository", "caraway_oil"):
        await plus_local.create_care(plus_local.CareEntryIn(child_id=1, care_type=care_type, time=datetime(2026, 9, 1, 8, 0)))

    filtered = await plus_local.list_care(1, limit=100, care_type="caraway_suppository")
    unfiltered = await plus_local.list_care(1, limit=100, care_type=None)

    assert [entry["care_type"] for entry in filtered["results"]] == ["caraway_suppository"]
    assert len(unfiltered["results"]) == 3


async def test_home_assistant_pairing_requires_type_opt_in_and_care_is_idempotent(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    monkeypatch.setattr(plus_local, "make_pairing_code", lambda: "ABCD2345")
    entry = plus_local.HomeAssistantCareEntryIn(
        care_type="bath",
        notes="Recorded from a button",
        request_id="automation-context-1",
    )

    with pytest.raises(plus_local.HTTPException) as denied:
        await plus_local.create_home_assistant_pairing(1)
    assert denied.value.status_code == 409

    await plus_local.patch_local_settings(
        1, plus_local.SettingsPatch(ha_care_allowed_types=["bath"])
    )
    pairing = await plus_local.create_home_assistant_pairing(1)
    assert pairing["pairing_code"] == "ABCD2345"
    paired = await plus_local.pair_home_assistant_integration(
        plus_local.HomeAssistantPairingIn(pairing_code="ABCD2345")
    )
    first = await plus_local.create_care_from_home_assistant(entry, paired["integration_token"])
    second = await plus_local.create_care_from_home_assistant(entry, paired["integration_token"])

    assert first["duplicate"] is False
    assert first["entry"]["care_type"] == "bath"
    assert second["duplicate"] is True
    assert second["entry"]["id"] == first["entry"]["id"]
    assert len((await plus_local.list_care(1, limit=100, care_type=None))["results"]) == 1


async def test_home_assistant_pairing_and_care_reject_invalid_or_expired_credentials(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    entry = plus_local.HomeAssistantCareEntryIn(care_type="bath", request_id="one")
    with pytest.raises(plus_local.HTTPException) as disabled:
        await plus_local.pair_home_assistant_integration(
            plus_local.HomeAssistantPairingIn(pairing_code="ABCD2345")
        )
    assert disabled.value.status_code == 401

    with pytest.raises(plus_local.HTTPException) as unauthorized:
        await plus_local.create_care_from_home_assistant(entry, "wrong-token")
    assert unauthorized.value.status_code == 401


def test_home_assistant_care_payload_cannot_carry_arbitrary_fields_or_blank_custom_label():
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantCareEntryIn(care_type="custom", request_id="one")
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantCareEntryIn(care_type="custom", request_id="one", category_label="   ")
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantCareEntryIn(
            child_id=1, care_type="custom", request_id="one", category_label="   "
        )
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantCareEntryIn(
            child_id=1, care_type="bath", request_id="one", unexpected="value"
        )


async def test_pairing_expiry_single_use_rotation_and_allowlist(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    await plus_local.patch_local_settings(1, plus_local.SettingsPatch(ha_care_allowed_types=["bath"]))
    now = plus_local.local_now()
    monkeypatch.setattr(plus_local, "local_now", lambda: now)
    code = await plus_local.create_home_assistant_pairing(1)
    monkeypatch.setattr(plus_local, "local_now", lambda: now + plus_local.PAIRING_CODE_LIFETIME)
    with pytest.raises(plus_local.HTTPException) as expired:
        await plus_local.pair_home_assistant_integration(plus_local.HomeAssistantPairingIn(**{"pairing_code": code["pairing_code"]}))
    assert expired.value.status_code == 401
    code = await plus_local.create_home_assistant_pairing(1)
    payload = plus_local.HomeAssistantPairingIn(pairing_code=code["pairing_code"])
    paired = await plus_local.pair_home_assistant_integration(payload)
    with pytest.raises(plus_local.HTTPException):
        await plus_local.pair_home_assistant_integration(payload)
    second_code = await plus_local.create_home_assistant_pairing(1)
    await plus_local.pair_home_assistant_integration(plus_local.HomeAssistantPairingIn(pairing_code=second_code["pairing_code"]))
    with pytest.raises(plus_local.HTTPException):
        plus_local.paired_child_for_token(paired["integration_token"])
    await plus_local.patch_local_settings(1, plus_local.SettingsPatch(ha_care_allowed_types=[]))
    with pytest.raises(plus_local.HTTPException) as disabled:
        plus_local.record_home_assistant_care(1, plus_local.HomeAssistantCareEntryIn(care_type="bath", request_id="new"))
    assert disabled.value.status_code == 403


async def test_conflicting_request_id_is_rejected_without_losing_data(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    await plus_local.patch_local_settings(1, plus_local.SettingsPatch(ha_care_allowed_types=["bath", "nail_care"]))
    first = plus_local.record_home_assistant_care(1, plus_local.HomeAssistantCareEntryIn(care_type="bath", request_id="same"))
    with pytest.raises(plus_local.HTTPException) as conflict:
        plus_local.record_home_assistant_care(1, plus_local.HomeAssistantCareEntryIn(care_type="nail_care", request_id="same"))
    assert conflict.value.status_code == 409
    assert len((await plus_local.list_care(1, limit=100, care_type=None))["results"]) == 1
    assert first["entry"]["care_type"] == "bath"


@pytest.mark.parametrize("peer,allowed", [("172.30.32.2", True), ("172.30.32.1", False)])
async def test_supervisor_local_admin_requires_real_ingress_peer(monkeypatch, tmp_path, peer, allowed):
    from fastapi import FastAPI
    import httpx

    use_temp_database(monkeypatch, tmp_path)
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test-only")
    await plus_local.patch_local_settings(1, plus_local.SettingsPatch(ha_care_allowed_types=["bath"]))
    app = FastAPI()
    app.include_router(plus_local.router)
    transport = httpx.ASGITransport(app=app, client=(peer, 1234))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/local/care-pairing/1", headers={"X-Forwarded-For": "172.30.32.2", "X-Ingress-Path": "/fake"})
        assert response.status_code == (200 if allowed else 403)
        # Native endpoints must stay reachable without ingress, but not without credentials.
        response = await client.post("/api/ha/integration/care", json={"care_type": "bath", "request_id": "test"})
        assert response.status_code == 401


async def test_bath_reminders_ignore_orphaned_local_child_records(monkeypatch, tmp_path):
    """A migration may retain child 1 locally after Baby Buddy now exposes child 2."""
    monkeypatch.setattr(plus_local, "DATA_DIR", tmp_path)
    monkeypatch.setattr(plus_local, "DB_PATH", tmp_path / "baby_buddy_dashboard_plus.db")
    monkeypatch.setattr(plus_local, "local_now", lambda: datetime(2026, 9, 13, 10, 0))
    plus_local.init_database()
    plus_local.ensure_child_defaults(1)  # Default 10:00 and no full-bath entry.

    sent = []

    async def capture_notification(child_id, title, message):
        sent.append((child_id, title, message))
        return True

    monkeypatch.setattr(plus_local, "send_ha_notification", capture_notification)

    await plus_local.check_bath_reminders(active_child_ids={2})
    assert sent == []

    # The filter does not disable valid reminders: it only excludes the stale child ID.
    await plus_local.check_bath_reminders(active_child_ids={1})
    assert sent == [(1, "Baby Buddy – Vollbad", "Es wurde noch kein Vollbad erfasst.")]


async def test_reminders_are_sent_in_italian(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    monkeypatch.setattr(plus_local, "local_now", lambda: datetime(2026, 9, 13, 10, 0, tzinfo=plus_local.LOCAL_TIMEZONE))
    await plus_local.patch_local_settings(1, plus_local.SettingsPatch(language="it"))
    await plus_local.create_task(plus_local.TaskIn(
        child_id=1, title="Visita", task_kind="appointment", start_date=datetime(2026, 9, 14).date(),
        appointment_time="09:30", reminder_time="10:00", reminder_days_before=1,
    ))
    sent = []

    async def capture_notification(child_id, title, message):
        sent.append((child_id, title, message))
        return True

    monkeypatch.setattr(plus_local, "send_ha_notification", capture_notification)
    await plus_local.check_bath_reminders(active_child_ids={1})
    await plus_local.check_task_reminders(active_child_ids={1})

    assert sent == [
        (1, "Baby Buddy – Bagno completo", "Non è ancora stato registrato alcun bagno completo."),
        (1, "Baby Buddy – Promemoria", "Promemoria: «Visita è domani alle 09:30.»"),
    ]


async def test_calendar_import_is_idempotent_and_keeps_an_appointment(monkeypatch, tmp_path):
    monkeypatch.setattr(plus_local, "DATA_DIR", tmp_path)
    monkeypatch.setattr(plus_local, "DB_PATH", tmp_path / "baby_buddy_dashboard_plus.db")
    plus_local.init_database()
    event = plus_local.CalendarImportIn(
        child_id=2,
        calendar_entity_id="calendar.family",
        summary="Paediatric check-up",
        start="2026-10-10T09:30:00+02:00",
        description="Bring vaccination record",
        location="Practice",
    )

    first = await plus_local.import_calendar_event(event)
    second = await plus_local.import_calendar_event(event)

    assert first["task_kind"] == "appointment"
    assert first["appointment_time"] == "09:30"
    assert "Practice" in first["notes"]
    assert first["already_imported"] is False
    assert second["id"] == first["id"]
    assert second["already_imported"] is True


async def pair_for_actions(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    now = datetime(2026, 10, 2, 12, 0, tzinfo=plus_local.LOCAL_TIMEZONE)
    monkeypatch.setattr(plus_local, "local_now", lambda: now)
    # Explicit test fixture, never a live family task.
    task = await plus_local.create_task(plus_local.TaskIn(child_id=2, title="Test confirmation", start_date=now.date()))
    await plus_local.patch_local_settings(2, plus_local.SettingsPatch(ha_task_allowed_ids=[task["id"]], ha_measurement_allowed_types=["temperature", "height", "weight"]))
    code = await plus_local.create_home_assistant_pairing(2)
    token = (await plus_local.pair_home_assistant_integration(plus_local.HomeAssistantPairingIn(pairing_code=code["pairing_code"])))["integration_token"]
    return task, token, now


async def test_explicit_task_completion_preserves_first_timestamp(monkeypatch, tmp_path):
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    entry = plus_local.HomeAssistantTaskCompleteIn(task_id=task["id"])
    first = await plus_local.complete_task_from_home_assistant(entry, token)
    monkeypatch.setattr(plus_local, "local_now", lambda: now.replace(hour=15))
    second = await plus_local.complete_task_from_home_assistant(entry, token)
    assert first["status"] == "saved" and second["status"] == "already_saved"
    assert first["completed_at"] == second["completed_at"]
    await plus_local.toggle_task(task["id"], plus_local.ToggleIn(due_date=now.date(), completed=True))
    with plus_local.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM task_completions WHERE task_id = ?", (task["id"],)).fetchone()[0] == 1
        assert conn.execute("SELECT completed_at FROM task_completions WHERE task_id = ?", (task["id"],)).fetchone()[0] == first["completed_at"]
        assert conn.execute("SELECT COUNT(*) FROM care_entries").fetchone()[0] == 0


@pytest.mark.parametrize("case,status", [("other_child", 404), ("inactive", 422), ("appointment", 422), ("disabled", 403), ("not_due", 422), ("future", 422)])
async def test_task_confirmation_rejects_wrong_or_disabled_targets(monkeypatch, tmp_path, case, status):
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    due = now.date()
    if case == "other_child":
        task = await plus_local.create_task(plus_local.TaskIn(child_id=3, title="Other test", start_date=due))
    elif case == "inactive":
        await plus_local.patch_task(task["id"], plus_local.TaskPatch(active=False))
    elif case == "appointment":
        await plus_local.patch_task(task["id"], plus_local.TaskPatch(task_kind="appointment"))
    elif case == "disabled":
        await plus_local.patch_local_settings(2, plus_local.SettingsPatch(ha_task_allowed_ids=[]))
    elif case == "not_due":
        await plus_local.patch_task(task["id"], plus_local.TaskPatch(recurrence_type="once", start_date=due.replace(day=1)))
    else:
        due = due.replace(day=3)
    with pytest.raises(plus_local.HTTPException) as err:
        await plus_local.complete_task_from_home_assistant(plus_local.HomeAssistantTaskCompleteIn(task_id=task["id"], due_date=due), token)
    assert err.value.status_code == status
    with plus_local.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM task_completions").fetchone()[0] == 0


async def test_task_allowlist_rejects_foreign_child(monkeypatch, tmp_path):
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    with pytest.raises(plus_local.HTTPException):
        await plus_local.patch_local_settings(3, plus_local.SettingsPatch(ha_task_allowed_ids=[task["id"]]))
    for ids in ([True], ["1"], [0], [1, 1]):
        with pytest.raises(ValidationError):
            plus_local.SettingsPatch(ha_task_allowed_ids=ids)


@pytest.mark.parametrize("kind,value,unit,field,expected", [("temperature", 37.2, "C", "temperature", "37.20"), ("height", 62.5, "cm", "height", "62.50"), ("weight", 5750, "g", "weight", "5.75")])
async def test_measurement_uses_baby_buddy_and_deduplicates(monkeypatch, tmp_path, kind, value, unit, field, expected):
    import httpx
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    calls = []
    def capture(request):
        import json
        calls.append((request.url.path, json.loads(request.content)))
        return httpx.Response(201, json={"id": 17})
    async with httpx.AsyncClient(transport=httpx.MockTransport(capture), base_url="http://test") as client:
        monkeypatch.setattr(plus_local, "measurement_client", client)
        monkeypatch.setattr(plus_local, "measurement_unit_system", "metric")
        entry = plus_local.HomeAssistantMeasurementIn(measurement_type=kind, value=value, unit=unit, request_id="test-request")
        first = await plus_local.log_measurement_from_home_assistant(entry, token)
        second = await plus_local.log_measurement_from_home_assistant(entry, token)
    assert first["status"] == "saved" and second["status"] == "already_saved"
    assert first["record_id"] == second["record_id"] == 17
    assert len(calls) == 1 and calls[0][0] == f"/api/{kind}/"
    assert calls[0][1]["child"] == 2 and calls[0][1][field] == expected
    assert ("time" if kind == "temperature" else "date") in calls[0][1]
    with plus_local.db() as conn:
        row = dict(conn.execute("SELECT * FROM ha_measurement_requests").fetchone())
    assert set(row) == {"child_id", "request_id", "payload_hash", "status", "record_id"}


@pytest.mark.parametrize("mode", ["timeout", "server_error", "invalid_response"])
async def test_uncertain_measurement_never_posts_again(monkeypatch, tmp_path, mode):
    import httpx
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    calls = []
    def fail(request):
        calls.append(request)
        if mode == "timeout":
            raise httpx.ReadTimeout("test", request=request)
        return httpx.Response(500 if mode == "server_error" else 201, json={})
    async with httpx.AsyncClient(transport=httpx.MockTransport(fail), base_url="http://test") as client:
        monkeypatch.setattr(plus_local, "measurement_client", client)
        monkeypatch.setattr(plus_local, "measurement_unit_system", "metric")
        entry = plus_local.HomeAssistantMeasurementIn(measurement_type="weight", value=5.75, unit="kg", request_id="one")
        for _ in range(2):
            with pytest.raises(plus_local.HTTPException) as err:
                await plus_local.log_measurement_from_home_assistant(entry, token)
            assert err.value.detail == "measurement_pending"
        with pytest.raises(plus_local.HTTPException) as err:
            await plus_local.log_measurement_from_home_assistant(entry.model_copy(update={"value": 5.8}), token)
        assert err.value.detail == "request_conflict"
    assert len(calls) == 1


@pytest.mark.parametrize("kwargs", [
    {"measurement_type": "weight", "value": 0, "unit": "kg"},
    {"measurement_type": "weight", "value": True, "unit": "kg"},
    {"measurement_type": "weight", "value": float("nan"), "unit": "kg"},
    {"measurement_type": "temperature", "value": 37, "unit": "kg"},
    {"measurement_type": "weight", "value": 5.7, "unit": "kg", "child_id": 1},
    {"measurement_type": "weight", "unit": "kg"},
])
def test_measurement_requires_explicit_valid_input(kwargs):
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantMeasurementIn(**kwargs, request_id="one")


def test_imperial_conversion_and_local_measurement_date(monkeypatch):
    monkeypatch.setattr(plus_local, "measurement_unit_system", "imperial")
    time = datetime.fromisoformat("2026-10-01T23:30:00+00:00")
    entry = plus_local.HomeAssistantMeasurementIn(measurement_type="weight", value=1000, unit="g", request_id="one", time=time)
    result = plus_local.measurement_payload(entry, 2)
    assert result["weight"] == "2.20" and result["date"] == "2026-10-02"


async def test_last_care_is_read_only_child_bound_and_opted_in(monkeypatch, tmp_path):
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    query = plus_local.HomeAssistantCareQueryIn(care_type="bath")
    with pytest.raises(plus_local.HTTPException) as err:
        await plus_local.last_care_from_home_assistant(query, token)
    assert err.value.status_code == 403
    await plus_local.patch_local_settings(2, plus_local.SettingsPatch(ha_care_allowed_types=["bath"]))
    assert (await plus_local.last_care_from_home_assistant(query, token))["last_at"] is None
    await plus_local.create_care(plus_local.CareEntryIn(child_id=3, care_type="bath", time=now))
    assert (await plus_local.last_care_from_home_assistant(query, token))["last_at"] is None
    await plus_local.create_care(plus_local.CareEntryIn(child_id=2, care_type="bath", time=now))
    response = await plus_local.last_care_from_home_assistant(query, token)
    assert response["status"] == "answer" and response["last_at"] == now.isoformat()
    assert set(response) == {"status", "message", "last_at", "care_type"}


async def test_disabled_measurements_and_invalid_token_do_not_write(monkeypatch, tmp_path):
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    entry = plus_local.HomeAssistantMeasurementIn(measurement_type="weight", value=5.7, unit="kg", request_id="one")
    with pytest.raises(plus_local.HTTPException) as err:
        await plus_local.log_measurement_from_home_assistant(entry, "wrong-test-token")
    assert err.value.status_code == 401
    await plus_local.patch_local_settings(2, plus_local.SettingsPatch(ha_measurement_allowed_types=[]))
    with pytest.raises(plus_local.HTTPException) as err:
        await plus_local.log_measurement_from_home_assistant(entry, token)
    assert err.value.status_code == 403
    with plus_local.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM ha_measurement_requests").fetchone()[0] == 0


async def test_native_rejection_can_be_corrected_without_duplicate_post(monkeypatch, tmp_path):
    import httpx
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(400, json={"error": "test"}) if len(calls) == 1 else httpx.Response(201, json={"id": 9})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond), base_url="http://test") as client:
        monkeypatch.setattr(plus_local, "measurement_client", client)
        monkeypatch.setattr(plus_local, "measurement_unit_system", "metric")
        entry = plus_local.HomeAssistantMeasurementIn(measurement_type="weight", value=5.75, unit="kg", request_id="one")
        with pytest.raises(plus_local.HTTPException) as err:
            await plus_local.log_measurement_from_home_assistant(entry, token)
        assert err.value.detail == "measurement_rejected"
        result = await plus_local.log_measurement_from_home_assistant(entry, token)
    assert len(calls) == 2 and result["status"] == "saved"


async def test_in_flight_duplicate_never_starts_second_baby_buddy_write(monkeypatch, tmp_path):
    import asyncio
    import httpx
    task, token, now = await pair_for_actions(monkeypatch, tmp_path)
    started, finish = asyncio.Event(), asyncio.Event()
    calls = []
    async def wait(request):
        calls.append(request)
        started.set()
        await finish.wait()
        return httpx.Response(201, json={"id": 11})
    async with httpx.AsyncClient(transport=httpx.MockTransport(wait), base_url="http://test") as client:
        monkeypatch.setattr(plus_local, "measurement_client", client)
        monkeypatch.setattr(plus_local, "measurement_unit_system", "metric")
        entry = plus_local.HomeAssistantMeasurementIn(measurement_type="weight", value=5.75, unit="kg", request_id="one")
        first = asyncio.create_task(plus_local.log_measurement_from_home_assistant(entry, token))
        await started.wait()
        try:
            with pytest.raises(plus_local.HTTPException) as err:
                await plus_local.log_measurement_from_home_assistant(entry, token)
            assert err.value.detail == "measurement_pending"
        finally:
            finish.set()
            await first
    assert len(calls) == 1


def test_calendar_service_events_normalizes_supervisor_response():
    events = plus_local.calendar_service_events(
        {"response": {"calendar.family": {"events": [{"summary": "Check-up", "start": "2026-10-10T09:30:00+02:00"}]}}},
        ["calendar.family"],
    )
    assert events == [{
        "calendar_entity_id": "calendar.family",
        "summary": "Check-up",
        "start": "2026-10-10T09:30:00+02:00",
        "end": "",
        "description": "",
        "location": "",
    }]
