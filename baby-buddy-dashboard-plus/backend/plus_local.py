"""Local Plus features layered on top of the upstream Baby Buddy dashboard."""
from __future__ import annotations
import asyncio
import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo
import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger("baby-buddy-dashboard-plus")
SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
NOTIFY_SERVICE = os.environ.get("NOTIFY_SERVICE", "notify.notify")
LOCAL_TIMEZONE = ZoneInfo(os.environ.get("TZ", "Europe/Berlin"))
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data" if Path("/data").exists() else ".data"))
DB_PATH = DATA_DIR / "baby_buddy_dashboard_plus.db"
DEFAULT_BATH_DAYS = 7
DEFAULT_BATH_TIME = "10:00"

@contextmanager
def db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def local_now() -> datetime:
    return datetime.now(LOCAL_TIMEZONE)


def init_database() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS care_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id INTEGER NOT NULL,
                care_type TEXT NOT NULL,
                category_label TEXT NOT NULL DEFAULT '',
                time TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_care_child_time
                ON care_entries(child_id, time DESC);

            CREATE TABLE IF NOT EXISTS task_definitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                recurrence_type TEXT NOT NULL DEFAULT 'daily'
                    CHECK(recurrence_type IN ('daily', 'weekdays', 'interval', 'once')),
                weekdays TEXT NOT NULL DEFAULT '[]',
                interval_days INTEGER NOT NULL DEFAULT 1,
                start_date TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                show_overview INTEGER NOT NULL DEFAULT 1,
                display_after TEXT NOT NULL DEFAULT '00:00',
                reminder_time TEXT NOT NULL DEFAULT '',
                appointment_time TEXT NOT NULL DEFAULT '',
                task_kind TEXT NOT NULL DEFAULT 'task',
                reminder_days_before INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS task_completions (
                task_id INTEGER NOT NULL REFERENCES task_definitions(id) ON DELETE CASCADE,
                due_date TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                PRIMARY KEY(task_id, due_date)
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                child_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY(child_id, key)
            );

            CREATE TABLE IF NOT EXISTS notification_log (
                child_id INTEGER NOT NULL,
                notification_type TEXT NOT NULL,
                sent_date TEXT NOT NULL,
                PRIMARY KEY(child_id, notification_type, sent_date)
            );
            """
        )
        care_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(care_entries)")
        }
        if "category_label" not in care_columns:
            connection.execute(
                "ALTER TABLE care_entries ADD COLUMN category_label TEXT NOT NULL DEFAULT ''"
            )
        task_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(task_definitions)")
        }
        for name, definition in (
            ("show_overview", "INTEGER NOT NULL DEFAULT 1"),
            ("display_after", "TEXT NOT NULL DEFAULT '00:00'"),
            ("reminder_time", "TEXT NOT NULL DEFAULT ''"),
            ("appointment_time", "TEXT NOT NULL DEFAULT ''"),
            ("task_kind", "TEXT NOT NULL DEFAULT 'task'"),
            ("reminder_days_before", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if name not in task_columns:
                connection.execute(
                    f"ALTER TABLE task_definitions ADD COLUMN {name} {definition}"
                )
        care_schema_row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'care_entries'"
        ).fetchone()
        care_schema = care_schema_row["sql"] if care_schema_row else ""
        if "CHECK(care_type" in care_schema.replace(" ", ""):
            connection.executescript(
                """
                ALTER TABLE care_entries RENAME TO care_entries_restricted;
                CREATE TABLE care_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    child_id INTEGER NOT NULL,
                    care_type TEXT NOT NULL,
                    category_label TEXT NOT NULL DEFAULT '',
                    time TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                INSERT INTO care_entries
                    (id, child_id, care_type, category_label, time, notes, created_at)
                SELECT id, child_id, care_type, category_label, time, notes, created_at
                FROM care_entries_restricted;
                DROP TABLE care_entries_restricted;
                CREATE INDEX idx_care_child_time ON care_entries(child_id, time DESC);
                """
            )


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def get_setting(connection: sqlite3.Connection, child_id: int, key: str, default: str) -> str:
    row = connection.execute(
        "SELECT value FROM app_settings WHERE child_id = ? AND key = ?",
        (child_id, key),
    ).fetchone()
    return row["value"] if row else default


def ensure_child_defaults(child_id: int) -> None:
    today = local_now().date().isoformat()
    with db() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO app_settings(child_id, key, value) VALUES (?, 'bath_reminder_days', ?)",
            (child_id, str(DEFAULT_BATH_DAYS)),
        )
        connection.execute(
            "INSERT OR IGNORE INTO app_settings(child_id, key, value) VALUES (?, 'bath_reminder_time', ?)",
            (child_id, DEFAULT_BATH_TIME),
        )
        defaults = {
            "language": "de",
            "theme": "dark",
            "accent": "amber",
            "overview_sections": json.dumps(
                ["latest", "feeding", "sleep", "diapers", "medication", "tummy"]
            ),
            "overview_hidden": json.dumps([]),
            "overview_show_charts": "false",
            "feeding_daily_metric": "duration",
            "feeding_average_metric": "duration",
            "time_format": "24h",
            "care_header_types": json.dumps(["bath", "full_wash", "quick_wash"]),
            "notification_targets": json.dumps([NOTIFY_SERVICE]),
            "media_player_targets": json.dumps([]),
            "media_player_mode": "custom",
            "analytics_sleep_period_mode": "rolling",
            "tab_hidden_cards": json.dumps({}),
            "tab_card_order": json.dumps({}),
            "analytics_diaper_calculator_enabled": "false",
            "diaper_size_profile": "pampers_de",
            "diaper_size_ranges": json.dumps([]),
            "diaper_fit_preference": "auto",
            "appearance_schedule_enabled": "false",
            "appearance_schedule_start": "20:00",
            "appearance_schedule_end": "06:00",
            "appearance_schedule_theme": "dark",
            "appearance_schedule_accent": "rose",
        }
        for key, value in defaults.items():
            connection.execute(
                "INSERT OR IGNORE INTO app_settings(child_id, key, value) VALUES (?, ?, ?)",
                (child_id, key, value),
            )
        count = connection.execute(
            "SELECT COUNT(*) AS n FROM task_definitions WHERE child_id = ?", (child_id,)
        ).fetchone()["n"]
        if count == 0:
            connection.execute(
                """INSERT INTO task_definitions
                   (child_id, title, recurrence_type, start_date, sort_order, notes)
                   VALUES (?, 'Vitamin D', 'daily', ?, 10, 'Tägliche Gabe abhaken')""",
                (child_id, today),
            )


class CareEntryIn(BaseModel):
    child_id: int
    care_type: str = Field(min_length=1, max_length=80)
    category_label: str = Field(default="", max_length=120)
    time: datetime
    notes: str = ""


class CareEntryPatch(BaseModel):
    care_type: str | None = Field(default=None, min_length=1, max_length=80)
    category_label: str | None = Field(default=None, max_length=120)
    time: datetime | None = None
    notes: str | None = None


class TaskIn(BaseModel):
    child_id: int
    title: str = Field(min_length=1, max_length=120)
    recurrence_type: Literal["daily", "weekdays", "interval", "once"] = "daily"
    weekdays: list[int] = Field(default_factory=list)
    interval_days: int = Field(default=1, ge=1, le=365)
    start_date: date = Field(default_factory=date.today)
    active: bool = True
    sort_order: int = 0
    notes: str = ""
    show_overview: bool = True
    display_after: str = Field(default="00:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    reminder_time: str = Field(default="", pattern=r"^(?:$|[01]\d:[0-5]\d|2[0-3]:[0-5]\d)$")
    appointment_time: str = Field(default="", pattern=r"^(?:$|[01]\d:[0-5]\d|2[0-3]:[0-5]\d)$")
    task_kind: Literal["task", "appointment"] = "task"
    reminder_days_before: int = Field(default=0, ge=0, le=14)


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    recurrence_type: Literal["daily", "weekdays", "interval", "once"] | None = None
    weekdays: list[int] | None = None
    interval_days: int | None = Field(default=None, ge=1, le=365)
    start_date: date | None = None
    active: bool | None = None
    sort_order: int | None = None
    notes: str | None = None
    show_overview: bool | None = None
    display_after: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    reminder_time: str | None = Field(default=None, pattern=r"^(?:$|[01]\d:[0-5]\d|2[0-3]:[0-5]\d)$")
    appointment_time: str | None = Field(default=None, pattern=r"^(?:$|[01]\d:[0-5]\d|2[0-3]:[0-5]\d)$")
    task_kind: Literal["task", "appointment"] | None = None
    reminder_days_before: int | None = Field(default=None, ge=0, le=14)


class ToggleIn(BaseModel):
    due_date: date
    completed: bool


class SettingsPatch(BaseModel):
    bath_reminder_days: int | None = Field(default=None, ge=1, le=60)
    bath_reminder_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    language: Literal["de", "en", "it"] | None = None
    theme: Literal["dark", "light", "pastel", "nord", "dracula", "solarized"] | None = None
    accent: Literal["amber", "mint", "blue", "rose", "violet"] | None = None
    overview_sections: list[str] | None = None
    overview_hidden: list[str] | None = None
    overview_show_charts: bool | None = None
    feeding_daily_metric: Literal["volume", "duration", "frequency"] | None = None
    feeding_average_metric: Literal["volume", "duration", "frequency"] | None = None
    time_format: Literal["12h", "24h"] | None = None
    care_header_types: list[str] | None = None
    notification_targets: list[str] | None = None
    media_player_targets: list[str] | None = None
    media_player_mode: Literal["custom", "alexa_tts", "alexa_announce"] | None = None
    analytics_sleep_period_mode: Literal["rolling", "calendar"] | None = None
    tab_hidden_cards: dict[str, list[str]] | None = None
    tab_card_order: dict[str, list[str]] | None = None
    analytics_diaper_calculator_enabled: bool | None = None
    diaper_size_profile: Literal["pampers_de", "custom"] | None = None
    diaper_size_ranges: list[dict[str, Any]] | None = None
    diaper_fit_preference: Literal["auto", "smaller", "larger"] | None = None
    appearance_schedule_enabled: bool | None = None
    appearance_schedule_start: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    appearance_schedule_end: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    appearance_schedule_theme: Literal["dark", "light", "pastel", "nord", "dracula", "solarized"] | None = None
    appearance_schedule_accent: Literal["amber", "mint", "blue", "rose", "violet"] | None = None


class NotificationTestIn(BaseModel):
    child_id: int
    title: str = Field(default="Baby Buddy Dashboard Plus", max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    notification_targets: list[str] = []
    media_player_targets: list[str] = []
    media_player_mode: Literal["custom", "alexa_tts", "alexa_announce"] = "custom"


def task_due(task: dict[str, Any], due: date) -> bool:
    start = date.fromisoformat(task["start_date"])
    if due < start:
        return False
    recurrence = task["recurrence_type"]
    if recurrence == "daily":
        return True
    if recurrence == "once":
        return due == start
    if recurrence == "interval":
        return (due - start).days % max(1, int(task["interval_days"])) == 0
    weekdays = json.loads(task.get("weekdays") or "[]")
    return due.weekday() in weekdays


def notification_targets(child_id: int) -> tuple[list[str], list[str], str]:
    with db() as connection:
        raw_notify = get_setting(connection, child_id, "notification_targets", json.dumps([NOTIFY_SERVICE]))
        raw_media = get_setting(connection, child_id, "media_player_targets", "[]")
        media_mode = get_setting(connection, child_id, "media_player_mode", "custom")
    try:
        notify = [item for item in json.loads(raw_notify) if isinstance(item, str) and item.startswith("notify.")]
    except (json.JSONDecodeError, TypeError):
        notify = [NOTIFY_SERVICE]
    try:
        media = [item for item in json.loads(raw_media) if isinstance(item, str) and item.startswith("media_player.")]
    except (json.JSONDecodeError, TypeError):
        media = []
    if media_mode not in {"custom", "alexa_tts", "alexa_announce"}:
        media_mode = "custom"
    return notify or ["notify.notify"], media, media_mode


async def dispatch_ha_notification(title: str, message: str, notify: list[str], media: list[str], media_mode: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if not SUPERVISOR_TOKEN:
        return [{"target": "Home Assistant", "ok": False, "error": "Supervisor token unavailable"}]
    headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            for target in notify:
                if not target.startswith("notify."):
                    continue
                domain, service = target.split(".", 1)
                response = await client.post(
                    f"http://supervisor/core/api/services/{domain}/{service}",
                    headers=headers,
                    json={"title": title, "message": message},
                )
                results.append({"target": target, "ok": response.is_success, "status": response.status_code, "error": "" if response.is_success else response.text[:300]})
            if media and media_mode in {"alexa_tts", "alexa_announce"}:
                response = await client.post(
                    "http://supervisor/core/api/services/notify/alexa_media",
                    headers=headers,
                    json={"title": title, "message": message, "target": media, "data": {"type": "tts" if media_mode == "alexa_tts" else "announce"}},
                )
                results.append({"target": f"notify.alexa_media ({len(media)})", "ok": response.is_success, "status": response.status_code, "error": "" if response.is_success else response.text[:300]})
            else:
                for entity_id in media:
                    response = await client.post(
                        "http://supervisor/core/api/services/media_player/play_media",
                        headers=headers,
                        json={"entity_id": entity_id, "media_content_id": message, "media_content_type": "custom"},
                    )
                    results.append({"target": entity_id, "ok": response.is_success, "status": response.status_code, "error": "" if response.is_success else response.text[:300]})
    except httpx.HTTPError as exc:
        logger.exception("Home Assistant notification failed")
        results.append({"target": "Home Assistant", "ok": False, "error": str(exc)})
    return results


async def send_ha_notification(child_id: int, title: str, message: str) -> bool:
    notify, media, media_mode = notification_targets(child_id)
    results = await dispatch_ha_notification(title, message, notify, media, media_mode)
    return any(result.get("ok") for result in results)


async def check_bath_reminders() -> None:
    now = local_now()
    today = now.date()
    pending: list[tuple[int, str]] = []
    with db() as connection:
        child_rows = connection.execute(
            "SELECT DISTINCT child_id FROM app_settings"
        ).fetchall()
        for child_row in child_rows:
            child_id = child_row["child_id"]
            reminder_time = get_setting(
                connection, child_id, "bath_reminder_time", DEFAULT_BATH_TIME
            )
            if now.strftime("%H:%M") != reminder_time:
                continue
            already_sent = connection.execute(
                """SELECT 1 FROM notification_log
                   WHERE child_id = ? AND notification_type = 'bath' AND sent_date = ?""",
                (child_id, today.isoformat()),
            ).fetchone()
            if already_sent:
                continue
            threshold = int(
                get_setting(
                    connection, child_id, "bath_reminder_days", str(DEFAULT_BATH_DAYS)
                )
            )
            language = get_setting(connection, child_id, "language", "de")
            latest = connection.execute(
                """SELECT time FROM care_entries
                   WHERE child_id = ? AND care_type = 'bath'
                   ORDER BY time DESC LIMIT 1""",
                (child_id,),
            ).fetchone()
            if latest:
                last_date = datetime.fromisoformat(latest["time"]).date()
                age_days = (today - last_date).days
                should_notify = age_days >= max(0, threshold - 1)
                remaining = threshold - age_days
                if remaining > 0:
                    message = (f"The next full bath is due tomorrow. The last full bath was {age_days} days ago." if language == "en" else f"Das nächste Vollbad ist morgen fällig. Das letzte Vollbad war vor {age_days} Tagen.")
                elif remaining == 0:
                    message = (f"The next full bath is due today. The last full bath was {age_days} days ago." if language == "en" else f"Das nächste Vollbad ist heute fällig. Das letzte Vollbad war vor {age_days} Tagen.")
                else:
                    message = (f"The next full bath is {abs(remaining)} day(s) overdue. The last full bath was {age_days} days ago." if language == "en" else f"Das nächste Vollbad ist seit {abs(remaining)} Tag(en) überfällig. Das letzte Vollbad war vor {age_days} Tagen.")
            else:
                should_notify = True
                message = "No full bath has been recorded yet." if language == "en" else "Es wurde noch kein Vollbad erfasst."
            if should_notify:
                pending.append((child_id, message))

    for child_id, message in pending:
        with db() as connection:
            language = get_setting(connection, child_id, "language", "de")
        sent = await send_ha_notification(child_id, "Baby Buddy – Full bath" if language == "en" else "Baby Buddy – Vollbad", message)
        if sent:
            with db() as connection:
                connection.execute(
                    "INSERT OR IGNORE INTO notification_log VALUES (?, 'bath', ?)",
                    (child_id, today.isoformat()),
                )


async def check_task_reminders() -> None:
    now = local_now()
    today = now.date()
    # The loop starts at add-on startup and is not aligned to a full minute. Check
    # the current and previous minute so a reminder at 10:00 is never skipped at 10:00:37.
    minute_candidates = {now.strftime("%H:%M"), (now - timedelta(minutes=1)).strftime("%H:%M")}
    pending: list[tuple[int, int, str]] = []
    with db() as connection:
        rows = connection.execute(
            """SELECT * FROM task_definitions
               WHERE active = 1 AND reminder_time != '' AND reminder_time IN (?, ?)""",
            tuple(minute_candidates),
        ).fetchall()
        for row in rows:
            task = dict(row)
            language = get_setting(connection, task["child_id"], "language", "de")
            days_before = int(task.get("reminder_days_before") or 0)
            due_for_reminder = today + timedelta(days=days_before)
            if not task_due(task, due_for_reminder):
                continue
            completed = connection.execute(
                "SELECT 1 FROM task_completions WHERE task_id = ? AND due_date = ?",
                (task["id"], due_for_reminder.isoformat()),
            ).fetchone()
            notification_type = f"task:{task['id']}"
            already_sent = connection.execute(
                """SELECT 1 FROM notification_log
                   WHERE child_id = ? AND notification_type = ? AND sent_date = ?""",
                (task["child_id"], notification_type, today.isoformat()),
            ).fetchone()
            # Appointments are fixed date/time reminders, not open tasks. Their reminder
            # must still fire at the selected time even if somebody marked the event.
            if (task.get("task_kind") != "appointment" and completed) or already_sent:
                continue
            if language == "en":
                suffix = " is tomorrow" if days_before == 1 else (f" is in {days_before} days" if days_before else " is today")
                event_time = f" at {task['appointment_time']}" if task.get("task_kind") == "appointment" and task.get("appointment_time") else ""
            else:
                suffix = " ist morgen" if days_before == 1 else (f" ist in {days_before} Tagen" if days_before else " ist heute")
                event_time = f" um {task['appointment_time']} Uhr" if task.get("task_kind") == "appointment" and task.get("appointment_time") else ""
            pending.append((task["child_id"], task["id"], f"{task['title']}{suffix}{event_time}."))

    for child_id, task_id, title in pending:
        with db() as connection:
            language = get_setting(connection, child_id, "language", "de")
        sent = await send_ha_notification(
                child_id, "Baby Buddy – Reminder" if language == "en" else "Baby Buddy – Erinnerung",
                f"Reminder: “{title}”" if language == "en" else f"Erinnerung: „{title}“",
            )
        if sent:
            with db() as connection:
                connection.execute(
                    "INSERT OR IGNORE INTO notification_log VALUES (?, ?, ?)",
                    (child_id, f"task:{task_id}", today.isoformat()),
                )


async def reminder_loop() -> None:
    while True:
        try:
            await check_bath_reminders()
            await check_task_reminders()
        except asyncio.CancelledError:
            raise
        except Exception:
            # The dashboard must remain available even if HA notifications fail.
            logger.exception("Reminder loop failed")
        await asyncio.sleep(60)


@router.post("/api/local/bootstrap/{child_id}")
async def bootstrap_child(child_id: int):
    ensure_child_defaults(child_id)
    return {"ok": True}


@router.get("/api/local/care")
async def list_care(child_id: int, limit: int = Query(100, ge=1, le=1000)):
    ensure_child_defaults(child_id)
    with db() as connection:
        rows = connection.execute(
            "SELECT * FROM care_entries WHERE child_id = ? ORDER BY time DESC LIMIT ?",
            (child_id, limit),
        ).fetchall()
    return {"results": [dict(row) for row in rows]}


@router.post("/api/local/care", status_code=201)
async def create_care(entry: CareEntryIn):
    with db() as connection:
        cursor = connection.execute(
            """INSERT INTO care_entries
               (child_id, care_type, category_label, time, notes)
               VALUES (?, ?, ?, ?, ?)""",
            (
                entry.child_id,
                entry.care_type.strip(),
                entry.category_label.strip(),
                entry.time.isoformat(),
                entry.notes.strip(),
            ),
        )
        row = connection.execute(
            "SELECT * FROM care_entries WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return row_dict(row)


@router.patch("/api/local/care/{entry_id}")
async def patch_care(entry_id: int, patch: CareEntryPatch):
    changes = patch.model_dump(exclude_unset=True)
    if "time" in changes:
        changes["time"] = changes["time"].isoformat()
    if not changes:
        raise HTTPException(400, "No changes supplied")
    columns = ", ".join(f"{key} = ?" for key in changes)
    with db() as connection:
        cursor = connection.execute(
            f"UPDATE care_entries SET {columns} WHERE id = ?", (*changes.values(), entry_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Care entry not found")
        row = connection.execute(
            "SELECT * FROM care_entries WHERE id = ?", (entry_id,)
        ).fetchone()
    return row_dict(row)


@router.delete("/api/local/care/{entry_id}", status_code=204)
async def delete_care(entry_id: int):
    with db() as connection:
        cursor = connection.execute("DELETE FROM care_entries WHERE id = ?", (entry_id,))
    if cursor.rowcount == 0:
        raise HTTPException(404, "Care entry not found")


@router.get("/api/local/tasks")
async def list_tasks(
    child_id: int,
    due_date: date = Query(default_factory=date.today),
    include_all: bool = False,
):
    ensure_child_defaults(child_id)
    with db() as connection:
        rows = connection.execute(
            "SELECT * FROM task_definitions WHERE child_id = ? ORDER BY sort_order, id",
            (child_id,),
        ).fetchall()
        completions = {
            row["task_id"]: row["completed_at"]
            for row in connection.execute(
                "SELECT task_id, completed_at FROM task_completions WHERE due_date = ?",
                (due_date.isoformat(),),
            ).fetchall()
        }
    results = []
    for row in rows:
        task = dict(row)
        task["weekdays"] = json.loads(task["weekdays"] or "[]")
        is_due = task_due({**task, "weekdays": json.dumps(task["weekdays"])}, due_date)
        if include_all or (task["active"] and is_due):
            task["due"] = is_due
            task["completed"] = task["id"] in completions
            task["completed_at"] = completions.get(task["id"])
            results.append(task)
    return {"date": due_date.isoformat(), "results": results}


@router.post("/api/local/tasks", status_code=201)
async def create_task(task: TaskIn):
    is_appointment = task.task_kind == "appointment"
    with db() as connection:
        cursor = connection.execute(
            """INSERT INTO task_definitions
               (child_id, title, recurrence_type, weekdays, interval_days, start_date,
                active, sort_order, notes, show_overview, display_after, reminder_time, appointment_time, task_kind, reminder_days_before)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                task.child_id,
                task.title.strip(),
                "once" if is_appointment else task.recurrence_type,
                json.dumps(task.weekdays),
                task.interval_days,
                task.start_date.isoformat(),
                int(task.active),
                task.sort_order,
                task.notes.strip(),
                int(task.show_overview) if not is_appointment else 0,
                task.display_after if not is_appointment else "00:00",
                task.reminder_time,
                task.appointment_time if is_appointment else "",
                task.task_kind,
                task.reminder_days_before,
            ),
        )
        row = connection.execute(
            "SELECT * FROM task_definitions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    result = dict(row)
    result["weekdays"] = json.loads(result["weekdays"])
    return result


@router.patch("/api/local/tasks/{task_id}")
async def patch_task(task_id: int, patch: TaskPatch):
    changes = patch.model_dump(exclude_unset=True)
    with db() as connection:
        current = connection.execute(
            "SELECT task_kind FROM task_definitions WHERE id = ?", (task_id,)
        ).fetchone()
    if current is None:
        raise HTTPException(404, "Task not found")
    effective_kind = changes.get("task_kind", current["task_kind"])
    if effective_kind == "appointment":
        changes["recurrence_type"] = "once"
        changes["show_overview"] = 0
        changes["display_after"] = "00:00"
    if "weekdays" in changes:
        changes["weekdays"] = json.dumps(changes["weekdays"])
    if "start_date" in changes:
        changes["start_date"] = changes["start_date"].isoformat()
    if "active" in changes:
        changes["active"] = int(changes["active"])
    if "show_overview" in changes:
        changes["show_overview"] = int(changes["show_overview"])
    if not changes:
        raise HTTPException(400, "No changes supplied")
    columns = ", ".join(f"{key} = ?" for key in changes)
    with db() as connection:
        cursor = connection.execute(
            f"UPDATE task_definitions SET {columns} WHERE id = ?", (*changes.values(), task_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Task not found")
        row = connection.execute(
            "SELECT * FROM task_definitions WHERE id = ?", (task_id,)
        ).fetchone()
    result = dict(row)
    result["weekdays"] = json.loads(result["weekdays"])
    return result


@router.post("/api/local/tasks/{task_id}/toggle")
async def toggle_task(task_id: int, toggle: ToggleIn):
    with db() as connection:
        exists = connection.execute(
            "SELECT 1 FROM task_definitions WHERE id = ?", (task_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(404, "Task not found")
        if toggle.completed:
            connection.execute(
                """INSERT OR REPLACE INTO task_completions(task_id, due_date, completed_at)
                   VALUES (?, ?, ?)""",
                (task_id, toggle.due_date.isoformat(), local_now().isoformat()),
            )
        else:
            connection.execute(
                "DELETE FROM task_completions WHERE task_id = ? AND due_date = ?",
                (task_id, toggle.due_date.isoformat()),
            )
    return {"completed": toggle.completed}


@router.delete("/api/local/tasks/{task_id}", status_code=204)
async def delete_task(task_id: int):
    with db() as connection:
        cursor = connection.execute("DELETE FROM task_definitions WHERE id = ?", (task_id,))
    if cursor.rowcount == 0:
        raise HTTPException(404, "Task not found")


@router.get("/api/local/settings/{child_id}")
async def get_local_settings(child_id: int):
    ensure_child_defaults(child_id)
    with db() as connection:
        days = int(get_setting(connection, child_id, "bath_reminder_days", str(DEFAULT_BATH_DAYS)))
        time_value = get_setting(connection, child_id, "bath_reminder_time", DEFAULT_BATH_TIME)
        latest = connection.execute(
            """SELECT time FROM care_entries WHERE child_id = ? AND care_type = 'bath'
               ORDER BY time DESC LIMIT 1""",
            (child_id,),
        ).fetchone()
        setting_rows = connection.execute(
            "SELECT key, value FROM app_settings WHERE child_id = ?", (child_id,)
        ).fetchall()
    last_bath = latest["time"] if latest else None
    due_date = None
    warning = True
    if last_bath:
        due = datetime.fromisoformat(last_bath).date() + timedelta(days=days)
        due_date = due.isoformat()
        warning = local_now().date() >= due - timedelta(days=1)
    settings = {row["key"]: row["value"] for row in setting_rows}
    for key in ("overview_sections", "overview_hidden", "care_header_types", "notification_targets", "media_player_targets"):
        try:
            settings[key] = json.loads(settings.get(key, "[]"))
        except (json.JSONDecodeError, TypeError):
            settings[key] = []
    for key in ("tab_hidden_cards", "tab_card_order"):
        try:
            settings[key] = json.loads(settings.get(key, "{}"))
        except (json.JSONDecodeError, TypeError):
            settings[key] = {}
    try:
        settings["diaper_size_ranges"] = json.loads(settings.get("diaper_size_ranges", "[]"))
    except (json.JSONDecodeError, TypeError):
        settings["diaper_size_ranges"] = []
    return {
        **settings,
        "bath_reminder_days": days,
        "bath_reminder_time": time_value,
        "last_bath": last_bath,
        "bath_due_date": due_date,
        "bath_warning": warning,
        "notify_service": NOTIFY_SERVICE,
    }


@router.get("/api/local/ha-targets")
async def get_ha_targets():
    """Return selectable Home Assistant notification services and media players."""
    if not SUPERVISOR_TOKEN:
        return {"notify": ["notify.notify"], "media_players": []}
    headers = {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            services_response, states_response = await asyncio.gather(
                client.get("http://supervisor/core/api/services", headers=headers),
                client.get("http://supervisor/core/api/states", headers=headers),
            )
        services_response.raise_for_status()
        states_response.raise_for_status()
        notify = {"notify.notify"}
        for domain in services_response.json():
            if domain.get("domain") == "notify":
                notify.update(f"notify.{name}" for name in domain.get("services", {}))
        media_players = [
            {"entity_id": state["entity_id"], "name": state.get("attributes", {}).get("friendly_name", state["entity_id"])}
            for state in states_response.json()
            if state.get("entity_id", "").startswith("media_player.")
        ]
        return {"notify": sorted(notify), "media_players": sorted(media_players, key=lambda item: item["name"].lower())}
    except (httpx.HTTPError, ValueError, TypeError):
        logger.exception("Could not load Home Assistant notification targets")
        return {"notify": ["notify.notify"], "media_players": []}


@router.post("/api/local/test-notification")
async def test_notification(test: NotificationTestIn):
    notify = [item for item in test.notification_targets if item.startswith("notify.")]
    media = [item for item in test.media_player_targets if item.startswith("media_player.")]
    results = await dispatch_ha_notification(test.title, test.message, notify, media, test.media_player_mode)
    return {"ok": bool(results) and all(item.get("ok") for item in results), "results": results}


@router.patch("/api/local/settings/{child_id}")
async def patch_local_settings(child_id: int, patch: SettingsPatch):
    ensure_child_defaults(child_id)
    changes = patch.model_dump(exclude_unset=True)
    with db() as connection:
        for key, value in changes.items():
            if isinstance(value, (list, dict)):
                value = json.dumps(value)
            connection.execute(
                "INSERT OR REPLACE INTO app_settings(child_id, key, value) VALUES (?, ?, ?)",
                (child_id, key, str(value)),
            )
    return await get_local_settings(child_id)


def database_health() -> dict[str, str]:
    with db() as connection:
        connection.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "ok"}
