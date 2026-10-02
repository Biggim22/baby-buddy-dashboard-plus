"""Local Plus features layered on top of the upstream Baby Buddy dashboard."""
from __future__ import annotations
import asyncio
import hashlib
import json
import logging
import os
import secrets
import sqlite3
from hmac import compare_digest
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal
from zoneinfo import ZoneInfo
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

def require_dashboard_ingress(request: Request) -> None:
    """Local administration must come from Supervisor, not another container.

    Standalone development has no Supervisor authentication and must run on a
    trusted network. Do not trust client-supplied X-Ingress/X-Forwarded headers.
    """
    if os.environ.get("SUPERVISOR_TOKEN") and request.url.path.startswith("/api/local/"):
        if request.client is None or request.client.host != "172.30.32.2":
            raise HTTPException(403, "Open Dashboard Plus through Home Assistant ingress")


router = APIRouter(dependencies=[Depends(require_dashboard_ingress)])
logger = logging.getLogger("baby-buddy-dashboard-plus")
SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
NOTIFY_SERVICE = os.environ.get("NOTIFY_SERVICE", "notify.notify")
LOCAL_TIMEZONE = ZoneInfo(os.environ.get("TZ", "Europe/Berlin"))
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data" if Path("/data").exists() else ".data"))
DB_PATH = DATA_DIR / "baby_buddy_dashboard_plus.db"
DEFAULT_BATH_DAYS = 7
DEFAULT_BATH_TIME = "10:00"
# This is deliberately a small fixed vocabulary.  An external Home Assistant
# automation may add a care record, but it must never turn the add-on into a
# generic write endpoint for arbitrary local data.
HA_CARE_TYPES = ("bath", "full_wash", "quick_wash", "caraway_oil", "nail_care", "skin_care", "custom")
PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PAIRING_CODE_LIFETIME = timedelta(minutes=10)
measurement_client: httpx.AsyncClient | None = None
measurement_unit_system: str | None = None
measurement_demo_mode = False


def configure_measurement_api(client, unit_system: str, demo_mode: bool = False) -> None:
    """Reuse the configured Baby Buddy client; never allocate another data store."""
    global measurement_client, measurement_unit_system, measurement_demo_mode
    measurement_client, measurement_unit_system, measurement_demo_mode = client, unit_system, demo_mode

BATH_TEXTS = {
    "de": {
        "title": "Baby Buddy – Vollbad",
        "tomorrow": "Das nächste Vollbad ist morgen fällig. Das letzte Vollbad war vor {age} Tagen.",
        "today": "Das nächste Vollbad ist heute fällig. Das letzte Vollbad war vor {age} Tagen.",
        "overdue": "Das nächste Vollbad ist seit {overdue} Tag(en) überfällig. Das letzte Vollbad war vor {age} Tagen.",
        "none": "Es wurde noch kein Vollbad erfasst.",
    },
    "en": {
        "title": "Baby Buddy – Full bath",
        "tomorrow": "The next full bath is due tomorrow. The last full bath was {age} days ago.",
        "today": "The next full bath is due today. The last full bath was {age} days ago.",
        "overdue": "The next full bath is {overdue} day(s) overdue. The last full bath was {age} days ago.",
        "none": "No full bath has been recorded yet.",
    },
    "it": {
        "title": "Baby Buddy – Bagno completo",
        "tomorrow": "Il prossimo bagno completo è previsto per domani. L'ultimo bagno completo risale a {age} giorni fa.",
        "today": "Il prossimo bagno completo è previsto per oggi. L'ultimo bagno completo risale a {age} giorni fa.",
        "overdue": "Il prossimo bagno completo è in ritardo di {overdue} giorno/i. L'ultimo bagno completo risale a {age} giorni fa.",
        "none": "Non è ancora stato registrato alcun bagno completo.",
    },
}

TASK_TEXTS = {
    "de": {"title": "Baby Buddy – Erinnerung", "message": "Erinnerung: „{title}“", "today": " ist heute", "tomorrow": " ist morgen", "in_days": " ist in {days} Tagen", "at": " um {time} Uhr"},
    "en": {"title": "Baby Buddy – Reminder", "message": "Reminder: “{title}”", "today": " is today", "tomorrow": " is tomorrow", "in_days": " is in {days} days", "at": " at {time}"},
    "it": {"title": "Baby Buddy – Promemoria", "message": "Promemoria: «{title}»", "today": " è oggi", "tomorrow": " è domani", "in_days": " è tra {days} giorni", "at": " alle {time}"},
}


def notification_language(language: str) -> str:
    return language if language in BATH_TEXTS else "de"

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

            CREATE TABLE IF NOT EXISTS ha_care_requests (
                child_id INTEGER NOT NULL,
                request_id TEXT NOT NULL,
                care_entry_id INTEGER NOT NULL REFERENCES care_entries(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(child_id, request_id)
            );
            CREATE TABLE IF NOT EXISTS ha_measurement_requests (
                child_id INTEGER NOT NULL,
                request_id TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'saved')),
                record_id INTEGER,
                PRIMARY KEY(child_id, request_id)
            );

            CREATE TABLE IF NOT EXISTS ha_care_pairings (
                child_id INTEGER PRIMARY KEY,
                code_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ha_care_integrations (
                child_id INTEGER PRIMARY KEY,
                token_hash TEXT NOT NULL,
                paired_at TEXT NOT NULL
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
            ("calendar_entity_id", "TEXT NOT NULL DEFAULT ''"),
            ("calendar_exported_at", "TEXT NOT NULL DEFAULT ''"),
            ("calendar_source_event", "TEXT NOT NULL DEFAULT ''"),
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
            "calendar_entities": json.dumps([]),
            "analytics_sleep_period_mode": "rolling",
            "tab_hidden_cards": json.dumps({}),
            "tab_card_order": json.dumps({}),
            "analytics_diaper_calculator_enabled": "false",
            "diaper_size_profile": "pampers_de",
            "diaper_size_ranges": json.dumps([]),
            "diaper_fit_preference": "auto",
            "medication_presets": json.dumps([]),
            "appearance_schedule_enabled": "false",
            "appearance_schedule_start": "20:00",
            "appearance_schedule_end": "06:00",
            "appearance_schedule_theme": "dark",
            "appearance_schedule_accent": "rose",
            "ha_care_allowed_types": json.dumps([]),
            "ha_task_allowed_ids": json.dumps([]),
            "ha_measurement_allowed_types": json.dumps([]),
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


class HomeAssistantCareEntryIn(BaseModel):
    """Narrow, idempotent payload accepted from the paired HA integration."""

    model_config = ConfigDict(extra="forbid")
    care_type: Literal["bath", "full_wash", "quick_wash", "caraway_oil", "nail_care", "skin_care", "custom"]
    category_label: str = Field(default="", max_length=120, validate_default=True)
    time: datetime | None = None
    notes: str = Field(default="", max_length=2000)
    request_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")

    @field_validator("category_label")
    @classmethod
    def custom_category_needs_label(cls, value: str, info) -> str:
        value = value.strip()
        if info.data.get("care_type") == "custom" and not value:
            raise ValueError("Custom care entries need a category label")
        return value


class HomeAssistantPairingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pairing_code: str = Field(min_length=8, max_length=32)

    @field_validator("pairing_code")
    @classmethod
    def normalized_code(cls, value: str) -> str:
        value = "".join(value.upper().split())
        if len(value) != 8 or any(char not in PAIRING_CODE_ALPHABET for char in value):
            raise ValueError("Invalid pairing code")
        return value


class HomeAssistantTaskCompleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: int = Field(gt=0, strict=True)
    due_date: date | None = None


class HomeAssistantCareQueryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    care_type: Literal["bath", "full_wash", "quick_wash", "caraway_oil", "nail_care", "skin_care", "custom"]
    category_label: str = Field(default="", max_length=120)

    @model_validator(mode="after")
    def explicit_custom_category(self):
        self.category_label = self.category_label.strip()
        if self.care_type == "custom" and not self.category_label:
            raise ValueError("Select an explicit custom category")
        return self


class HomeAssistantMeasurementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    measurement_type: Literal["temperature", "height", "weight"]
    value: float = Field(gt=0, allow_inf_nan=False, strict=True)
    unit: Literal["C", "cm", "kg", "g"]
    time: datetime | None = None
    request_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$")

    @model_validator(mode="after")
    def validate_measurement(self):
        expected = {"temperature": {"C"}, "height": {"cm"}, "weight": {"kg", "g"}}
        if self.unit not in expected[self.measurement_type]:
            raise ValueError("Unit does not match measurement type")
        metric = self.value / 1000 if self.unit == "g" else self.value
        # Same input limits as existing dashboard forms, not a health assessment.
        low, high = {"temperature": (30, 45), "height": (0, 200), "weight": (0, 30)}[self.measurement_type]
        if metric < low or metric > high:
            raise ValueError("Value is outside the dashboard's input limits")
        return self


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


class MedicationPreset(BaseModel):
    # extra="forbid" keeps dose, interval or age/weight rules out of the family list by design.
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    name: str = Field(min_length=1, max_length=80)
    unit: Literal["", "mg", "ml", "tablets", "drops"] = ""
    hidden: bool = False

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Medication name must not be blank")
        return value


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
    ha_care_allowed_types: list[Literal["bath", "full_wash", "quick_wash", "caraway_oil", "nail_care", "skin_care", "custom"]] | None = None
    ha_task_allowed_ids: list[int] | None = Field(default=None, max_length=100)
    ha_measurement_allowed_types: list[Literal["temperature", "height", "weight"]] | None = None
    notification_targets: list[str] | None = None
    media_player_targets: list[str] | None = None
    media_player_mode: Literal["custom", "alexa_tts", "alexa_announce"] | None = None
    calendar_entities: list[str] | None = None
    analytics_sleep_period_mode: Literal["rolling", "calendar"] | None = None
    tab_hidden_cards: dict[str, list[str]] | None = None
    tab_card_order: dict[str, list[str]] | None = None
    analytics_diaper_calculator_enabled: bool | None = None
    diaper_size_profile: Literal["pampers_de", "custom"] | None = None
    diaper_size_ranges: list[dict[str, Any]] | None = None
    diaper_fit_preference: Literal["auto", "smaller", "larger"] | None = None
    medication_presets: list[MedicationPreset] | None = Field(default=None, max_length=50)
    appearance_schedule_enabled: bool | None = None
    appearance_schedule_start: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    appearance_schedule_end: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    appearance_schedule_theme: Literal["dark", "light", "pastel", "nord", "dracula", "solarized"] | None = None
    appearance_schedule_accent: Literal["amber", "mint", "blue", "rose", "violet"] | None = None

    @field_validator("medication_presets")
    @classmethod
    def unique_preset_ids(cls, value: list[MedicationPreset] | None) -> list[MedicationPreset] | None:
        if value is not None and len({preset.id for preset in value}) != len(value):
            raise ValueError("Medication list entries need unique IDs")
        return value

    @field_validator("ha_care_allowed_types")
    @classmethod
    def unique_ha_care_types(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("Home Assistant care types must be unique")
        return value

    @field_validator("ha_task_allowed_ids", mode="before")
    @classmethod
    def task_ids_are_explicit(cls, value):
        if value is not None and (not isinstance(value, list) or any(type(v) is not int or v <= 0 for v in value) or len(set(value)) != len(value)):
            raise ValueError("Select unique positive task IDs")
        return value

    @field_validator("ha_measurement_allowed_types")
    @classmethod
    def measurement_types_are_unique(cls, value):
        if value is not None and len(set(value)) != len(value):
            raise ValueError("Select unique measurement types")
        return value


class NotificationTestIn(BaseModel):
    child_id: int
    title: str = Field(default="Baby Buddy Dashboard Plus", max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    notification_targets: list[str] = []
    media_player_targets: list[str] = []
    media_player_mode: Literal["custom", "alexa_tts", "alexa_announce"] = "custom"


class CalendarExportIn(BaseModel):
    child_id: int
    task_id: int
    calendar_entity_id: str = Field(pattern=r"^calendar\.[a-z0-9_]+$")


class CalendarImportIn(BaseModel):
    child_id: int
    calendar_entity_id: str = Field(pattern=r"^calendar\.[a-z0-9_]+$")
    summary: str = Field(min_length=1, max_length=120)
    start: str = Field(min_length=1, max_length=80)
    end: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=4000)
    location: str = Field(default="", max_length=300)


def calendar_datetime(value: str) -> datetime:
    """Convert the Home Assistant calendar date/datetime representation safely."""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.combine(date.fromisoformat(value), time.min)
        except ValueError as exc:
            raise HTTPException(422, "Invalid calendar date") from exc
    return parsed.replace(tzinfo=LOCAL_TIMEZONE) if parsed.tzinfo is None else parsed.astimezone(LOCAL_TIMEZONE)


def calendar_export_payload(task: dict[str, Any]) -> dict[str, str]:
    if task.get("task_kind") != "appointment":
        raise HTTPException(400, "Only appointments can be exported to a calendar")
    start_date = date.fromisoformat(task["start_date"])
    event_time = task.get("appointment_time") or "09:00"
    start = datetime.combine(start_date, time.fromisoformat(event_time), LOCAL_TIMEZONE)
    end = start + timedelta(hours=1)
    return {
        "summary": task["title"],
        "description": task.get("notes") or "",
        "start_date_time": start.isoformat(),
        "end_date_time": end.isoformat(),
    }


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


async def check_bath_reminders(active_child_ids: set[int] | None = None) -> None:
    """Send full-bath reminders only for children that still exist in Baby Buddy.

    Local Plus data intentionally survives add-on reinstalls and migrations. That can
    leave settings for an old Baby Buddy child ID behind. Such an orphan must never
    result in a family notification, while its local data stays recoverable.
    """
    now = local_now()
    today = now.date()
    pending: list[tuple[int, str]] = []
    with db() as connection:
        child_rows = connection.execute(
            "SELECT DISTINCT child_id FROM app_settings"
        ).fetchall()
        for child_row in child_rows:
            child_id = child_row["child_id"]
            if active_child_ids is not None and child_id not in active_child_ids:
                logger.info("Skipping bath reminder for orphaned local child ID %s", child_id)
                continue
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
            texts = BATH_TEXTS[notification_language(get_setting(connection, child_id, "language", "de"))]
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
                key = "tomorrow" if remaining > 0 else "today" if remaining == 0 else "overdue"
                message = texts[key].format(age=age_days, overdue=abs(remaining))
            else:
                should_notify = True
                message = texts["none"]
            if should_notify:
                pending.append((child_id, texts["title"], message))

    for child_id, title, message in pending:
        sent = await send_ha_notification(child_id, title, message)
        if sent:
            with db() as connection:
                connection.execute(
                    "INSERT OR IGNORE INTO notification_log VALUES (?, 'bath', ?)",
                    (child_id, today.isoformat()),
                )


async def check_task_reminders(active_child_ids: set[int] | None = None) -> None:
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
            if active_child_ids is not None and task["child_id"] not in active_child_ids:
                logger.info("Skipping task reminder for orphaned local child ID %s", task["child_id"])
                continue
            texts = TASK_TEXTS[notification_language(get_setting(connection, task["child_id"], "language", "de"))]
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
            suffix = texts["tomorrow"] if days_before == 1 else (texts["in_days"].format(days=days_before) if days_before else texts["today"])
            event_time = texts["at"].format(time=task["appointment_time"]) if task.get("task_kind") == "appointment" and task.get("appointment_time") else ""
            summary = f"{task['title']}{suffix}{event_time}."
            pending.append((task["child_id"], task["id"], texts["title"], texts["message"].format(title=summary)))

    for child_id, task_id, title, message in pending:
        sent = await send_ha_notification(child_id, title, message)
        if sent:
            with db() as connection:
                connection.execute(
                    "INSERT OR IGNORE INTO notification_log VALUES (?, ?, ?)",
                    (child_id, f"task:{task_id}", today.isoformat()),
                )


async def reminder_loop(
    active_child_ids_provider: Callable[[], Awaitable[set[int] | None]] | None = None,
) -> None:
    while True:
        try:
            active_child_ids = None
            if active_child_ids_provider is not None:
                active_child_ids = await active_child_ids_provider()
                if active_child_ids is None:
                    # Failing closed is deliberate: a temporary Baby Buddy outage must
                    # not turn stale local records into notifications for a non-existent
                    # child. The next loop retries the lookup a minute later.
                    logger.warning("Skipping local reminders until active Baby Buddy children can be verified")
                    await asyncio.sleep(60)
                    continue
            await check_bath_reminders(active_child_ids)
            await check_task_reminders(active_child_ids)
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
async def list_care(
    child_id: int,
    limit: int = Query(100, ge=1, le=1000),
    care_type: str | None = Query(default=None, min_length=1, max_length=80),
):
    ensure_child_defaults(child_id)
    with db() as connection:
        if care_type:
            rows = connection.execute(
                """SELECT * FROM care_entries WHERE child_id = ? AND care_type = ?
                   ORDER BY time DESC LIMIT ?""",
                (child_id, care_type, limit),
            ).fetchall()
        else:
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


def secret_hash(value: str) -> str:
    """Hash short-lived pairing codes and integration tokens before persistence."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def make_pairing_code() -> str:
    return "".join(secrets.choice(PAIRING_CODE_ALPHABET) for _ in range(8))


def make_integration_token() -> str:
    return secrets.token_urlsafe(32)


def read_allowed_care_types(connection: sqlite3.Connection, child_id: int) -> list[str]:
    try:
        value = json.loads(get_setting(connection, child_id, "ha_care_allowed_types", "[]"))
    except (json.JSONDecodeError, TypeError):
        return []
    return [item for item in value if item in HA_CARE_TYPES] if isinstance(value, list) else []


def read_allowed_setting(connection, child_id, key):
    try:
        value = json.loads(get_setting(connection, child_id, key, "[]"))
    except (json.JSONDecodeError, TypeError):
        return []
    return value if isinstance(value, list) else []


@router.post("/api/local/care-pairing/{child_id}")
async def create_home_assistant_pairing(child_id: int):
    """Create a one-time code shown only through the authenticated dashboard."""
    ensure_child_defaults(child_id)
    code = make_pairing_code()
    expires_at = local_now() + PAIRING_CODE_LIFETIME
    with db() as connection:
        if not (read_allowed_care_types(connection, child_id)
                or read_allowed_setting(connection, child_id, "ha_task_allowed_ids")
                or read_allowed_setting(connection, child_id, "ha_measurement_allowed_types")):
            raise HTTPException(409, "Enable at least one Home Assistant action first")
        connection.execute(
            """INSERT OR REPLACE INTO ha_care_pairings (child_id, code_hash, expires_at)
               VALUES (?, ?, ?)""",
            (child_id, secret_hash(code), expires_at.isoformat()),
        )
    return {"pairing_code": code, "expires_at": expires_at.isoformat()}


@router.post("/api/ha/integration/pair")
async def pair_home_assistant_integration(pairing: HomeAssistantPairingIn):
    """Exchange a short dashboard code for a hidden integration credential."""
    now = local_now()
    with db() as connection:
        rows = connection.execute(
            "SELECT child_id, code_hash, expires_at FROM ha_care_pairings"
        ).fetchall()
        child_id = None
        for row in rows:
            try:
                active = datetime.fromisoformat(row["expires_at"]) > now
            except ValueError:
                active = False
            if active and compare_digest(row["code_hash"], secret_hash(pairing.pairing_code)):
                child_id = row["child_id"]
                break
        if child_id is None:
            raise HTTPException(401, "The pairing code is invalid or has expired")
        token = make_integration_token()
        connection.execute(
            """INSERT OR REPLACE INTO ha_care_integrations (child_id, token_hash, paired_at)
               VALUES (?, ?, ?)""",
            (child_id, secret_hash(token), now.isoformat()),
        )
        connection.execute("DELETE FROM ha_care_pairings WHERE child_id = ?", (child_id,))
    return {"integration_token": token, "child_id": child_id}


def paired_child_for_token(token: str | None) -> int:
    if not token:
        raise HTTPException(401, "Missing Home Assistant integration credential")
    with db() as connection:
        rows = connection.execute(
            "SELECT child_id, token_hash FROM ha_care_integrations"
        ).fetchall()
    for row in rows:
        if compare_digest(row["token_hash"], secret_hash(token)):
            return row["child_id"]
    raise HTTPException(401, "Invalid Home Assistant integration credential")


@router.post("/api/ha/integration/tasks/complete")
async def complete_task_from_home_assistant(
    entry: HomeAssistantTaskCompleteIn,
    x_baby_buddy_integration_token: str | None = Header(default=None),
):
    child_id = paired_child_for_token(x_baby_buddy_integration_token)
    now = local_now()
    due = entry.due_date or now.date()
    if due > now.date():
        raise HTTPException(422, "task_not_due")
    with db() as connection:
        task = connection.execute("SELECT * FROM task_definitions WHERE id = ? AND child_id = ?", (entry.task_id, child_id)).fetchone()
        if task is None:
            raise HTTPException(404, "task_not_found")
        if entry.task_id not in read_allowed_setting(connection, child_id, "ha_task_allowed_ids"):
            raise HTTPException(403, "task_not_allowed")
        if not task["active"] or task["task_kind"] != "task" or not task_due(dict(task), due):
            raise HTTPException(422, "task_not_due")
        inserted = connection.execute(
            "INSERT OR IGNORE INTO task_completions(task_id, due_date, completed_at) VALUES (?, ?, ?)",
            (entry.task_id, due.isoformat(), now.isoformat()),
        ).rowcount
        row = connection.execute("SELECT completed_at FROM task_completions WHERE task_id = ? AND due_date = ?", (entry.task_id, due.isoformat())).fetchone()
    return {"status": "saved" if inserted else "already_saved", "message": "Task completed" if inserted else "Task was already completed",
            "task_id": entry.task_id, "due_date": due.isoformat(), "completed": True, "completed_at": row["completed_at"]}


@router.post("/api/ha/integration/care/last")
async def last_care_from_home_assistant(
    entry: HomeAssistantCareQueryIn,
    x_baby_buddy_integration_token: str | None = Header(default=None),
):
    child_id = paired_child_for_token(x_baby_buddy_integration_token)
    with db() as connection:
        if entry.care_type not in read_allowed_care_types(connection, child_id):
            raise HTTPException(403, "care_not_allowed")
        row = connection.execute(
            "SELECT time FROM care_entries WHERE child_id = ? AND care_type = ? AND (? = '' OR category_label = ?) ORDER BY julianday(time) DESC, id DESC LIMIT 1",
            (child_id, entry.care_type, entry.category_label, entry.category_label),
        ).fetchone()
        language = get_setting(connection, child_id, "language", "de")
    last_at = row["time"] if row else None
    text = {
        "de": ("Noch kein Eintrag für diese Pflegeart erfasst.", "Letzter Eintrag für diese Pflegeart: {time}."),
        "en": ("No entry recorded for this care type yet.", "Last entry for this care type: {time}."),
        "it": ("Nessuna voce registrata per questo tipo di cura.", "Ultima voce per questo tipo di cura: {time}."),
    }.get(language, ("No entry recorded for this care type yet.", "Last entry for this care type: {time}."))
    return {"status": "answer", "message": text[1].format(time=last_at) if last_at else text[0], "last_at": last_at, "care_type": entry.care_type}


def measurement_payload(entry, child_id):
    timestamp = entry.time or local_now()
    timestamp = timestamp.replace(tzinfo=LOCAL_TIMEZONE) if timestamp.tzinfo is None else timestamp.astimezone(LOCAL_TIMEZONE)
    value = Decimal(str(entry.value)) / (1000 if entry.unit == "g" else 1)
    if measurement_unit_system == "imperial":
        value = {"temperature": lambda v: v * 9 / 5 + 32, "height": lambda v: v / Decimal("2.54"),
                 "weight": lambda v: v / Decimal("0.45359237")}[entry.measurement_type](value)
    elif measurement_unit_system != "metric":
        raise HTTPException(503, "measurement_configuration_missing")
    value = value.quantize(Decimal("0.01"))
    if value <= 0:
        raise HTTPException(422, "Value cannot be represented at Baby Buddy precision")
    return {"child": child_id, entry.measurement_type: str(value),
            **({"time": timestamp.isoformat()} if entry.measurement_type == "temperature" else {"date": timestamp.date().isoformat()})}


@router.post("/api/ha/integration/measurements")
async def log_measurement_from_home_assistant(
    entry: HomeAssistantMeasurementIn,
    x_baby_buddy_integration_token: str | None = Header(default=None),
):
    child_id = paired_child_for_token(x_baby_buddy_integration_token)
    with db() as connection:
        if entry.measurement_type not in read_allowed_setting(connection, child_id, "ha_measurement_allowed_types"):
            raise HTTPException(403, "measurement_not_allowed")
    if measurement_client is None or measurement_demo_mode:
        raise HTTPException(503, "measurement_api_unavailable")
    payload = measurement_payload(entry, child_id)
    fingerprint = secret_hash(json.dumps(entry.model_dump(mode="json", exclude={"request_id"}), sort_keys=True))
    with db() as connection:
        inserted = connection.execute(
            "INSERT OR IGNORE INTO ha_measurement_requests(child_id, request_id, payload_hash, status) VALUES (?, ?, ?, 'pending')",
            (child_id, entry.request_id, fingerprint),
        ).rowcount
        previous = connection.execute("SELECT * FROM ha_measurement_requests WHERE child_id = ? AND request_id = ?", (child_id, entry.request_id)).fetchone()
    if not inserted:
        if previous["payload_hash"] != fingerprint:
            raise HTTPException(409, "request_conflict")
        if previous["status"] == "saved":
            return {"status": "already_saved", "message": "Measurement was already saved", "record_id": previous["record_id"]}
        raise HTTPException(409, "measurement_pending")
    # Pending is committed before the outbound write. Never automatically replay
    # an uncertain write: Baby Buddy POST has no native idempotency key.
    try:
        response = await measurement_client.post(f"/api/{entry.measurement_type}/", json=payload)
    except httpx.RequestError:
        raise HTTPException(409, "measurement_pending") from None
    if 400 <= response.status_code < 500:
        with db() as connection:
            connection.execute("DELETE FROM ha_measurement_requests WHERE child_id = ? AND request_id = ?", (child_id, entry.request_id))
        raise HTTPException(422, "measurement_rejected")
    if response.status_code != 201:
        raise HTTPException(409, "measurement_pending")
    try:
        record_id = response.json()["id"]
        if type(record_id) is not int or record_id <= 0:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(409, "measurement_pending") from None
    with db() as connection:
        connection.execute("UPDATE ha_measurement_requests SET status = 'saved', record_id = ? WHERE child_id = ? AND request_id = ?", (record_id, child_id, entry.request_id))
    return {"status": "saved", "message": "Measurement saved in Baby Buddy", "record_id": record_id}


def record_home_assistant_care(child_id: int, entry: HomeAssistantCareEntryIn) -> dict[str, Any]:
    """Store a paired-integration entry after type allow-list and retry checks."""
    ensure_child_defaults(child_id)
    timestamp = entry.time or local_now()
    timestamp = (
        timestamp.replace(tzinfo=LOCAL_TIMEZONE)
        if timestamp.tzinfo is None
        else timestamp.astimezone(LOCAL_TIMEZONE)
    )
    with db() as connection:
        try:
            allowed_types = read_allowed_care_types(connection, child_id)
        except (json.JSONDecodeError, TypeError):
            allowed_types = []
        if entry.care_type not in allowed_types:
            raise HTTPException(403, "This care type is not enabled for Home Assistant")
        previous = connection.execute(
            """SELECT care_entries.* FROM ha_care_requests
               JOIN care_entries ON care_entries.id = ha_care_requests.care_entry_id
               WHERE ha_care_requests.child_id = ? AND ha_care_requests.request_id = ?""",
            (child_id, entry.request_id),
        ).fetchone()
        if previous is not None:
            if (previous["care_type"] != entry.care_type
                or previous["category_label"] != entry.category_label
                or previous["notes"] != entry.notes.strip()
                or (entry.time is not None and previous["time"] != timestamp.isoformat())):
                raise HTTPException(409, "Request ID was already used for a different care entry")
            return {"entry": dict(previous), "duplicate": True}
        cursor = connection.execute(
            """INSERT INTO care_entries (child_id, care_type, category_label, time, notes)
               VALUES (?, ?, ?, ?, ?)""",
            (
                child_id,
                entry.care_type,
                entry.category_label,
                timestamp.isoformat(),
                entry.notes.strip(),
            ),
        )
        connection.execute(
            """INSERT INTO ha_care_requests (child_id, request_id, care_entry_id)
               VALUES (?, ?, ?)""",
            (child_id, entry.request_id, cursor.lastrowid),
        )
        row = connection.execute(
            "SELECT * FROM care_entries WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return {"entry": row_dict(row), "duplicate": False}


@router.post("/api/ha/integration/care", status_code=201)
async def create_care_from_home_assistant(
    entry: HomeAssistantCareEntryIn,
    x_baby_buddy_integration_token: str | None = Header(default=None),
):
    """Record care from the paired native Home Assistant integration."""
    child_id = paired_child_for_token(x_baby_buddy_integration_token)
    result = record_home_assistant_care(child_id, entry)
    logger.info(
        "Created Home Assistant care entry child_id=%s care_type=%s request_id=%s",
        child_id,
        entry.care_type,
        entry.request_id,
    )
    return result


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
                """INSERT OR IGNORE INTO task_completions(task_id, due_date, completed_at)
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
    for key in ("overview_sections", "overview_hidden", "care_header_types", "ha_care_allowed_types", "ha_task_allowed_ids", "ha_measurement_allowed_types", "notification_targets", "media_player_targets", "calendar_entities", "medication_presets"):
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


def supervisor_headers() -> dict[str, str]:
    if not SUPERVISOR_TOKEN:
        raise HTTPException(503, "Home Assistant API is unavailable")
    return {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}


@router.get("/api/local/calendar-targets")
async def get_calendar_targets():
    """List calendar entities managed by Home Assistant, never CalDAV credentials."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "http://supervisor/core/api/states", headers=supervisor_headers()
            )
        response.raise_for_status()
        calendars = [
            {
                "entity_id": state["entity_id"],
                "name": state.get("attributes", {}).get("friendly_name", state["entity_id"]),
            }
            for state in response.json()
            if state.get("entity_id", "").startswith("calendar.")
        ]
        return {"calendars": sorted(calendars, key=lambda item: item["name"].lower())}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        logger.exception("Could not load Home Assistant calendars")
        raise HTTPException(502, "Home Assistant calendars could not be loaded")


def calendar_service_events(payload: Any, requested: list[str]) -> list[dict[str, Any]]:
    """Normalize service response variants used by supported HA Core versions."""
    response = payload.get("response", payload) if isinstance(payload, dict) else {}
    if isinstance(response, dict) and isinstance(response.get("service_response"), dict):
        response = response["service_response"]
    events: list[dict[str, Any]] = []
    if not isinstance(response, dict):
        return events
    for entity_id in requested:
        item = response.get(entity_id, {})
        for event in item.get("events", []) if isinstance(item, dict) else []:
            if not isinstance(event, dict) or not event.get("summary") or not event.get("start"):
                continue
            events.append({
                "calendar_entity_id": entity_id,
                "summary": str(event["summary"]),
                "start": str(event["start"]),
                "end": str(event.get("end") or ""),
                "description": str(event.get("description") or ""),
                "location": str(event.get("location") or ""),
            })
    return sorted(events, key=lambda item: item["start"])


@router.get("/api/local/calendar-events")
async def get_calendar_events(
    entity_ids: list[str] = Query(default=[]),
    start: datetime | None = None,
    end: datetime | None = None,
):
    selected = sorted({item for item in entity_ids if item.startswith("calendar.")})
    if not selected:
        return {"events": []}
    range_start = start or local_now()
    range_end = end or range_start + timedelta(days=90)
    if range_end <= range_start:
        raise HTTPException(422, "The calendar end must be after the start")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "http://supervisor/core/api/services/calendar/get_events?return_response",
                headers=supervisor_headers(),
                json={
                    "entity_id": selected,
                    "start_date_time": range_start.isoformat(),
                    "end_date_time": range_end.isoformat(),
                },
            )
        response.raise_for_status()
        return {"events": calendar_service_events(response.json(), selected)}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        logger.exception("Could not read Home Assistant calendar events")
        raise HTTPException(502, "Home Assistant calendar events could not be loaded")


@router.post("/api/local/calendar-export")
async def export_calendar_event(export: CalendarExportIn):
    with db() as connection:
        row = connection.execute(
            "SELECT * FROM task_definitions WHERE id = ? AND child_id = ?",
            (export.task_id, export.child_id),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Appointment not found")
    task = dict(row)
    payload = calendar_export_payload(task)
    payload["entity_id"] = export.calendar_entity_id
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "http://supervisor/core/api/services/calendar/create_event",
                headers=supervisor_headers(), json=payload,
            )
        response.raise_for_status()
    except HTTPException:
        raise
    except httpx.HTTPError:
        logger.exception("Could not export appointment to Home Assistant calendar")
        raise HTTPException(502, "The appointment could not be exported to Home Assistant")
    exported_at = local_now().isoformat()
    with db() as connection:
        connection.execute(
            "UPDATE task_definitions SET calendar_entity_id = ?, calendar_exported_at = ? WHERE id = ?",
            (export.calendar_entity_id, exported_at, export.task_id),
        )
    return {"ok": True, "calendar_entity_id": export.calendar_entity_id, "exported_at": exported_at}


@router.post("/api/local/calendar-import", status_code=201)
async def import_calendar_event(event: CalendarImportIn):
    start = calendar_datetime(event.start)
    source_key = f"{event.calendar_entity_id}|{start.isoformat()}|{event.summary.strip()}"
    with db() as connection:
        existing = connection.execute(
            "SELECT * FROM task_definitions WHERE child_id = ? AND calendar_source_event = ?",
            (event.child_id, source_key),
        ).fetchone()
        if existing is not None:
            result = dict(existing)
            result["weekdays"] = json.loads(result["weekdays"] or "[]")
            result["already_imported"] = True
            return result
        notes = event.description.strip()
        if event.location.strip():
            notes = f"{notes}\n\nOrt: {event.location.strip()}".strip()
        cursor = connection.execute(
            """INSERT INTO task_definitions
               (child_id, title, recurrence_type, weekdays, interval_days, start_date,
                active, sort_order, notes, show_overview, display_after, reminder_time,
                appointment_time, task_kind, reminder_days_before, calendar_entity_id, calendar_source_event)
               VALUES (?, ?, 'once', '[]', 1, ?, 1, 0, ?, 0, '00:00', '', ?, 'appointment', 0, ?, ?)""",
            (event.child_id, event.summary.strip(), start.date().isoformat(), notes, start.strftime("%H:%M"), event.calendar_entity_id, source_key),
        )
        row = connection.execute("SELECT * FROM task_definitions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    result = dict(row)
    result["weekdays"] = []
    result["already_imported"] = False
    return result


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
    if patch.medication_presets is not None:
        changes["medication_presets"] = [preset.model_dump() for preset in patch.medication_presets]
    with db() as connection:
        if patch.ha_task_allowed_ids:
            eligible = {row["id"] for row in connection.execute("SELECT id FROM task_definitions WHERE child_id = ? AND active = 1 AND task_kind = 'task'", (child_id,))}
            if not set(patch.ha_task_allowed_ids).issubset(eligible):
                raise HTTPException(422, "Select active tasks belonging to this child")
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
