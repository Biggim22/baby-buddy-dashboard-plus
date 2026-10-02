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


async def test_home_assistant_care_entry_requires_token_type_opt_in_and_is_idempotent(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    monkeypatch.setenv("HOME_ASSISTANT_CARE_TOKEN", "private-test-token")
    entry = plus_local.HomeAssistantCareEntryIn(
        child_id=1,
        care_type="bath",
        notes="Recorded from a button",
        request_id="automation-context-1",
    )

    with pytest.raises(plus_local.HTTPException) as denied:
        await plus_local.create_care_from_home_assistant(entry, "Bearer private-test-token")
    assert denied.value.status_code == 403

    await plus_local.patch_local_settings(
        1, plus_local.SettingsPatch(ha_care_allowed_types=["bath"])
    )
    first = await plus_local.create_care_from_home_assistant(entry, "Bearer private-test-token")
    second = await plus_local.create_care_from_home_assistant(entry, "Bearer private-test-token")

    assert first["duplicate"] is False
    assert first["entry"]["care_type"] == "bath"
    assert second["duplicate"] is True
    assert second["entry"]["id"] == first["entry"]["id"]
    assert len((await plus_local.list_care(1, limit=100, care_type=None))["results"]) == 1


async def test_home_assistant_care_entry_rejects_missing_or_invalid_token(monkeypatch, tmp_path):
    use_temp_database(monkeypatch, tmp_path)
    entry = plus_local.HomeAssistantCareEntryIn(child_id=1, care_type="bath", request_id="one")
    with pytest.raises(plus_local.HTTPException) as disabled:
        await plus_local.create_care_from_home_assistant(entry, None)
    assert disabled.value.status_code == 503

    monkeypatch.setenv("HOME_ASSISTANT_CARE_TOKEN", "private-test-token")
    with pytest.raises(plus_local.HTTPException) as unauthorized:
        await plus_local.create_care_from_home_assistant(entry, "Bearer wrong-token")
    assert unauthorized.value.status_code == 401


def test_home_assistant_care_payload_cannot_carry_arbitrary_fields_or_blank_custom_label():
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantCareEntryIn(
            child_id=1, care_type="custom", request_id="one", category_label="   "
        )
    with pytest.raises(ValidationError):
        plus_local.HomeAssistantCareEntryIn(
            child_id=1, care_type="bath", request_id="one", unexpected="value"
        )


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
