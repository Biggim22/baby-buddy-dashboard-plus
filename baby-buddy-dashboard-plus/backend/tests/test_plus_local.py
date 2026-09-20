from datetime import datetime

import backend.plus_local as plus_local


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
