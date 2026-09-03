import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { formatElapsedHM, formatTime, parseDuration, timeAgo } from "../utils/formatters";
import { useTranslation } from "../locales";

const DAY_MS = 24 * 60 * 60 * 1000;

function localDate(value) {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateBounds(day) {
  return { start: `${day}T00:00:00`, end: `${day}T23:59:59` };
}

function readableDuration(value) {
  const hours = parseDuration(value);
  return hours ? formatElapsedHM(hours * 60 * 60 * 1000) : "";
}

function eventTime(value) {
  return new Date(value).getTime();
}

export default function TimelineTab({ childId, childName, hiddenCards = [], onEditEntry }) {
  const t = useTranslation();
  const [day, setDay] = useState(() => localDate(new Date()));
  const [data, setData] = useState({ feedings: [], sleep: [], changes: [], tummy: [], medications: [], notes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = localDate(new Date());

  const load = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    setError("");
    const { start, end } = dateBounds(day);
    try {
      const [feedings, sleep, changes, tummy, medications, notes] = await Promise.all([
        api.getFeedings({ child: childId, start_min: start, start_max: end, limit: 200, ordering: "-start" }),
        api.getSleep({ child: childId, start_min: start, start_max: end, limit: 200, ordering: "-start" }),
        api.getChanges({ child: childId, date_min: start, date_max: end, limit: 200, ordering: "-time" }),
        api.getTummyTimes({ child: childId, start_min: start, start_max: end, limit: 200, ordering: "-start" }),
        api.getMedication({ child: childId, limit: 300, ordering: "-time" }),
        api.getNotes({ child: childId, limit: 300, ordering: "-time" }),
      ]);
      const onlyDay = (entries, key) => (entries.results || []).filter((entry) => localDate(entry[key]) === day);
      setData({
        feedings: feedings.results || [],
        sleep: sleep.results || [],
        changes: changes.results || [],
        tummy: tummy.results || [],
        medications: onlyDay(medications, "time"),
        notes: onlyDay(notes, "time"),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [childId, day]);

  useEffect(() => void load(), [load]);

  const events = useMemo(() => {
    const next = [];
    data.changes.forEach((entry) => {
      const kind = entry.wet && entry.solid ? t("plus.timeline.diaperBoth") : entry.solid ? t("plus.timeline.diaperSolid") : entry.wet ? t("plus.timeline.diaperWet") : t("plus.timeline.diaperHygiene");
      next.push({ id: `change-${entry.id}`, time: entry.time, type: "diaper", color: colors.diaper, icon: <Icons.Droplet />, title: t("plus.timeline.diaperTitle", { name: childName, kind }), detail: entry.notes || kind, entryType: "diaper", entry });
    });
    data.feedings.forEach((entry) => {
      const method = String(entry.method || entry.type || "");
      const end = entry.end || entry.start;
      next.push({ id: `feeding-end-${entry.id}`, time: end, type: "feeding", color: colors.feeding, icon: <Icons.Bottle />, title: t("plus.timeline.feedingFinished", { name: childName }), detail: [readableDuration(entry.duration), method].filter(Boolean).join(" · "), entryType: "feeding", entry });
      if (entry.end && new Date(entry.end).getTime() > new Date(entry.start).getTime()) {
        next.push({ id: `feeding-start-${entry.id}`, time: entry.start, type: "feeding", color: "#22C55E", icon: <Icons.Bottle />, title: t("plus.timeline.feedingStarted", { name: childName }), detail: method, entryType: "feeding", entry });
      }
    });
    data.sleep.forEach((entry) => {
      if (entry.end) next.push({ id: `sleep-end-${entry.id}`, time: entry.end, type: "sleep", color: colors.sleep, icon: <Icons.Moon />, title: t("plus.timeline.sleepWoke", { name: childName }), detail: readableDuration(entry.duration), entryType: "sleep", entry });
      next.push({ id: `sleep-start-${entry.id}`, time: entry.start, type: "sleep", color: "#38BDF8", icon: <Icons.Moon />, title: t("plus.timeline.sleepStarted", { name: childName }), detail: entry.nap ? t("plus.timeline.nap") : "", entryType: "sleep", entry });
    });
    data.tummy.forEach((entry) => next.push({ id: `tummy-${entry.id}`, time: entry.end || entry.start, type: "tummy", color: colors.tummy, icon: <Icons.Sun />, title: t("plus.timeline.tummyFinished", { name: childName }), detail: readableDuration(entry.duration), entryType: "tummy", entry }));
    data.medications.forEach((entry) => next.push({ id: `med-${entry.id}`, time: entry.time, type: "medication", color: colors.medication, icon: <Icons.Pill />, title: t("plus.timeline.medicationGiven", { name: childName }), detail: `${entry.name}${entry.dosage != null ? ` · ${entry.dosage} ${entry.dosage_unit || ""}` : ""}`.trim(), entryType: "medication", entry }));
    data.notes.forEach((entry) => next.push({ id: `note-${entry.id}`, time: entry.time, type: "note", color: colors.note, icon: <Icons.StickyNote />, title: t("plus.timeline.noteAdded", { name: childName }), detail: entry.note, entryType: "note", entry }));
    return next.sort((a, b) => eventTime(b.time) - eventTime(a.time));
  }, [childName, data, t]);

  const moveDay = (direction) => {
    const next = new Date(`${day}T12:00:00`);
    next.setDate(next.getDate() + direction);
    const value = localDate(next);
    if (value <= today) setDay(value);
  };
  const selectedDate = new Date(`${day}T12:00:00`);

  return (
    <div className="fade-in timeline-tab">
      <div className="timeline-day-nav">
        <button onClick={() => moveDay(-1)} aria-label={t("plus.timeline.previousDay")}>‹</button>
        <h2>{selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</h2>
        <button onClick={() => moveDay(1)} disabled={day >= today} aria-label={t("plus.timeline.nextDay")}>›</button>
      </div>
      {loading && <div className="empty-state">{t("plus.loading")}</div>}
      {error && <div className="preview-error">{error}</div>}
      {!loading && !error && events.length === 0 && <div className="empty-state">{t("plus.timeline.empty")}</div>}
      {!loading && !error && <div className="timeline-list">
        {events.filter((event) => !hiddenCards.includes(event.type)).map((event) => <article className="timeline-event" key={event.id}>
          <div className="timeline-marker" style={{ "--timeline-color": event.color }}>{event.icon}</div>
          <div className="timeline-event-card">
            <strong>{event.title}</strong>
            <span>{day === today ? timeAgo(event.time) : formatTime(event.time)} · {formatTime(event.time)}</span>
            {event.detail && <small>{event.detail}</small>}
            <button onClick={() => onEditEntry?.(event.entryType, event.entry)}>{t("plus.timeline.edit")}</button>
          </div>
        </article>)}
      </div>}
    </div>
  );
}
