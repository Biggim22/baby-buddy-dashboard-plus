import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { formatElapsedHM, formatTime } from "../utils/formatters";
import { useTranslation, getLocale } from "../locales";
import { buildTimeline, loadTimelinePages, timelineBounds } from "../utils/timeline";
import { getTabCardGroups } from "../utils/tabCards";

function localDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const empty = { feedings: [], sleep: [], changes: [], tummy: [], medications: [], notes: [], local: [] };
const icons = { feeding: Icons.Bottle, sleep: Icons.Moon, tummy: Icons.Sun, diaper: Icons.Droplet, medication: Icons.Pill, note: Icons.StickyNote, care: Icons.Heart, task: Icons.Clipboard };
const filterKey = childId => `bbd_timeline_filters_${childId}`;
function readFilters(childId) {
  try {
    const saved = JSON.parse(localStorage.getItem(filterKey(childId)));
    if (Array.isArray(saved)) return saved.filter(type => Object.hasOwn(icons, type));
  } catch { /* Storage is optional. */ }
  return Object.keys(icons);
}

export default function TimelineTab({ childId, childName, hiddenCards = [], onEditEntry, onOpenSection }) {
  const t = useTranslation();
  const [day, setDay] = useState(() => localDate(new Date()));
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersByChild, setFiltersByChild] = useState({});
  const selected = filtersByChild[childId] ?? readFilters(childId);
  const selectedKey = selected.join(",");
  const categories = getTabCardGroups(t)[0].cards.filter(card => !hiddenCards.includes(card.id));
  const updateFilters = next => {
    setFiltersByChild(previous => ({ ...previous, [childId]: next }));
    try { localStorage.setItem(filterKey(childId), JSON.stringify(next)); } catch { /* Keep session selection. */ }
  };
  const today = localDate(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(empty);
    if (!childId) { setLoading(false); return; }
    const { start, end } = timelineBounds(day);
    const intervals = { child: childId, end_min: start.toISOString(), start_max: end.toISOString(), ordering: "start" };
    const points = { child: childId, date_min: start.toISOString(), date_max: end.toISOString(), ordering: "time" };
    Promise.all([
      loadTimelinePages(api.getFeedings, intervals), loadTimelinePages(api.getSleep, intervals),
      loadTimelinePages(api.getChanges, points), loadTimelinePages(api.getTummyTimes, intervals),
      loadTimelinePages(api.getMedication, points), loadTimelinePages(api.getNotes, points),
      loadTimelinePages(api.getLocalTimeline, { child_id: childId, start: start.toISOString(), end: end.toISOString() }),
    ]).then(([feedings, sleep, changes, tummy, medications, notes, local]) => {
      if (!cancelled) setData({ feedings, sleep, changes, tummy, medications, notes, local });
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [childId, day]);

  const events = useMemo(() => {
    const points = [];
    const intervals = [];
    data.local.forEach(entry => points.push({ id: `local-${entry.id}`, time: entry.time, type: entry.kind, entry,
      color: entry.kind === "care" ? "#06B6D4" : "#22C55E",
      title: entry.kind === "care" ? `${t("plus.care")}: ${entry.title || t(`plus.careTypes.${entry.care_type}`)}` : `${t("timelineTaskCompleted")}: ${entry.title}`,
      detail: entry.kind === "task" ? `${t("timelineTaskDue")}: ${entry.due_date}` : entry.notes,
    }));
    const addIntervals = (entries, type, title) => {
      [...entries].sort((a, b) => +new Date(a.start) - +new Date(b.start)).forEach((entry, index) => {
        intervals.push({ id: `${type}-${entry.id}`, type, entry, start: entry.start, end: entry.end,
          title: `${title} ${index + 1}`, color: colors[type],
          detail: [entry.method, entry.end ? formatElapsedHM(new Date(entry.end) - new Date(entry.start)) : "", entry.notes].filter(Boolean).join(" · ") });
      });
    };
    addIntervals(data.sleep, "sleep", t("plus.analytics.sleep"));
    addIntervals(data.feedings, "feeding", t("action.feeding"));
    addIntervals(data.tummy, "tummy", t("plus.analytics.tummyTime"));
    data.changes.forEach(entry => {
      const kind = t(`plus.timeline.${entry.wet && entry.solid ? "diaperBoth" : entry.solid ? "diaperSolid" : entry.wet ? "diaperWet" : "diaperHygiene"}`);
      points.push({ id: `diaper-${entry.id}`, time: entry.time, type: "diaper", color: colors.diaper,
        title: t("plus.timeline.diaperTitle", { name: childName, kind }), detail: entry.notes || kind, entry });
    });
    data.medications.forEach(entry => points.push({ id: `medication-${entry.id}`, time: entry.time, type: "medication", color: colors.medication,
      title: t("plus.timeline.medicationGiven", { name: childName }), detail: [entry.name || entry.medication, entry.dosage != null ? `${entry.dosage} ${entry.dosage_unit || ""}` : "", entry.notes].filter(Boolean).join(" · "), entry }));
    data.notes.forEach(entry => points.push({ id: `note-${entry.id}`, time: entry.time, type: "note", color: colors.note,
      title: t("plus.timeline.noteAdded", { name: childName }), detail: entry.note, entry }));
    const visible = x => !hiddenCards.includes(x.type) && selected.includes(x.type);
    return buildTimeline(points.filter(visible), intervals.filter(visible), day);
  }, [data, day, childName, hiddenCards, t, selectedKey]);

  const moveDay = direction => {
    const next = new Date(`${day}T12:00:00`);
    next.setDate(next.getDate() + direction);
    if (localDate(next) <= today) setDay(localDate(next));
  };
  return <div className="fade-in timeline-tab">
    <div className="timeline-day-nav">
      <button onClick={() => moveDay(-1)} aria-label={t("plus.timeline.previousDay")}>‹</button>
      <h2>{new Date(`${day}T12:00:00`).toLocaleDateString(getLocale(), { day: "numeric", month: "long", year: "numeric" })}</h2>
      <button onClick={() => moveDay(1)} disabled={day >= today} aria-label={t("plus.timeline.nextDay")}>›</button>
    </div>
    <fieldset className="timeline-filters">
      <legend>{t("timelineFilters")}</legend>
      <div className="timeline-filter-actions">
        <button type="button" onClick={() => updateFilters(Object.keys(icons))}>{t("timelineFilterAll")}</button>
        <button type="button" onClick={() => updateFilters(["sleep", "feeding"])}>{t("timelineFilterSleepFeeding")}</button>
      </div>
      <div className="timeline-filter-options">{categories.map(category => <label key={category.id}>
        <input type="checkbox" checked={selected.includes(category.id)} onChange={() => updateFilters(selected.includes(category.id) ? selected.filter(type => type !== category.id) : [...selected, category.id])} />
        {category.label}
      </label>)}</div>
    </fieldset>
    <p className="form-hint">{t("timelineGuide")}</p>
    <p className="form-hint">{t("timelineCoverage")}</p>
    {loading && <div className="empty-state">{t("plus.loading")}</div>}
    {error && <div className="preview-error">{error}</div>}
    {!loading && !error && events.length === 0 && <div className="empty-state">{t("timelineFilterEmpty")}</div>}
    {!loading && !error && <ol className="timeline-list interval-timeline">
      {events.map(event => {
        const Icon = icons[event.type];
        const phase = event.phase === "point" ? "" : t(`timelinePhases.${event.phase}`);
        return <li className={`timeline-event timeline-phase-${event.phase}`} key={event.id} style={{ "--event-color": event.color }}>
          <div className="timeline-marker" style={{ "--timeline-color": event.color }}><Icon /></div>
          <div className="timeline-event-card">
            <div className="timeline-event-heading"><time dateTime={event.time}>{formatTime(event.time)}</time>{phase && <span className="timeline-phase-label">{phase}</span>}</div>
            <strong>{event.title}</strong>
            {event.intervalId && <span>{formatTime(event.start)} → {event.end ? formatTime(event.end) : "…"}</span>}
            {event.detail && <small>{event.detail}</small>}
            {event.during.length > 0 && <div className="timeline-during"><span>{t("timelineDuring")}</span>{event.during.map(item => <span className="timeline-context" key={item.id} style={{ borderColor: item.color }}>{item.title} · {formatTime(item.start)} → {item.end ? formatTime(item.end) : "…"}</span>)}</div>}
            {["care", "task"].includes(event.type)
              ? <button onClick={() => onOpenSection?.(event.type === "care" ? "care" : "tasks")}>{t("timelineOpenSource")}</button>
              : <button onClick={() => onEditEntry?.(event.type, event.entry)}>{t("plus.timeline.edit")}</button>}
          </div>
        </li>;
      })}
    </ol>}
  </div>;
}
