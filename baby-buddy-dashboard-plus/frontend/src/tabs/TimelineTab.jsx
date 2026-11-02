import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { formatElapsedHM, formatTime } from "../utils/formatters";
import { useTranslation, getLocale } from "../locales";
import { buildTimeline, layoutTimeline, loadTimelinePages, timelineBounds, timelineCategoryCounts, timelineSpan } from "../utils/timeline";
import Modal from "../components/Modal";
import SleepForm from "../components/forms/SleepForm";
import FeedingForm from "../components/forms/FeedingForm";
import DiaperForm from "../components/forms/DiaperForm";
import TummyTimeForm from "../components/forms/TummyTimeForm";
import MedicationForm from "../components/forms/MedicationForm";
import NoteForm from "../components/forms/NoteForm";
import { CareForm } from "./CareTab";

function localDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const empty = { feedings: [], sleep: [], changes: [], tummy: [], medications: [], notes: [], local: [] };
const icons = { feeding: Icons.Bottle, sleep: Icons.Moon, tummy: Icons.Sun, diaper: Icons.Droplet, medication: Icons.Pill, note: Icons.StickyNote, care: Icons.Heart, task: Icons.Clipboard };
const categoryColors = { ...colors, care: "#06B6D4", task: "#22C55E" };
const forms = { sleep: SleepForm, feeding: FeedingForm, diaper: DiaperForm, tummy: TummyTimeForm, medication: MedicationForm, note: NoteForm, care: CareForm };
const filterKey = childId => `bbd_timeline_filters_${childId}`;
function readFilters(childId) {
  try {
    const saved = JSON.parse(localStorage.getItem(filterKey(childId)));
    if (Array.isArray(saved)) return saved.filter(type => Object.hasOwn(icons, type));
  } catch { /* Storage is optional. */ }
  return Object.keys(icons);
}

export default function TimelineTab({ childId, childName, hiddenCards = [], sortOrder = "newest", onEditEntry, onOpenSection, onDataChanged }) {
  const t = useTranslation();
  const [day, setDay] = useState(() => localDate(new Date()));
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersByChild, setFiltersByChild] = useState({});
  const [backfill, setBackfill] = useState(false);
  const [draft, setDraft] = useState(null);
  const [revision, setRevision] = useState(0);
  const [revealed, setRevealed] = useState([]);
  useEffect(() => { setBackfill(false); setDraft(null); setRevealed([]); }, [childId, day]);
  const selected = filtersByChild[childId] ?? readFilters(childId);
  const selectedKey = selected.join(",");
  const labels = { feeding: t("action.feeding"), sleep: t("plus.analytics.sleep"), diaper: t("action.diaper"), tummy: t("plus.analytics.tummyTime"), medication: t("notes.medications"), note: t("notes.notesTitle"), care: t("plus.care"), task: t("timelineTaskCompleted") };
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
  }, [childId, day, revision]);

  const allEvents = useMemo(() => {
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
    return buildTimeline(points, intervals, day);
  }, [data, day, childName, t, getLocale()]);
  const visibleType = type => (!hiddenCards.includes(type) || revealed.includes(type)) && selected.includes(type);
  const events = allEvents.filter(row => visibleType(row.type)).map(row => ({ ...row, during: row.during.filter(item => visibleType(item.type)) }));
  const counts = timelineCategoryCounts(allEvents);
  const categories = Object.keys(icons).filter(type => counts[type] && (!hiddenCards.includes(type) || revealed.includes(type)));
  const visibleIds = new Set(events.map(row => row.id));
  const saved = () => {
    const type = draft.type;
    updateFilters([...new Set([...selected, type])]);
    setRevealed(previous => [...new Set([...previous, type])]);
    setDraft(null);
    setRevision(value => value + 1);
    Promise.resolve().then(() => onDataChanged?.()).catch(() => {});
  };
  const openGeneral = () => {
    const bounds = timelineBounds(day);
    const end = new Date(Math.min(+bounds.end - 60000, Date.now()));
    const start = new Date(Math.max(+bounds.start, +end - 15 * 60000));
    setDraft({ start: start.toISOString(), end: end.toISOString(), time: start.toISOString() });
  };
  const EntryForm = draft?.type ? forms[draft.type] : null;

  const layout = useMemo(() => layoutTimeline(events, sortOrder), [events, sortOrder]);
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
    <div className="timeline-backfill-controls">
      <label><input type="checkbox" role="switch" checked={backfill} onChange={event => { setBackfill(event.target.checked); setDraft(null); }} />{t("timelineBackfillMode")}</label>
      {backfill && <button disabled={loading || !!error || !childId} onClick={openGeneral}>{t("timelineAddEntry")}</button>}
    </div>
    <fieldset className="timeline-filters">
      <legend>{t("timelineFilters")}</legend>
      <div className="timeline-filter-actions">
        <button type="button" disabled={!categories.length} onClick={() => updateFilters([...new Set([...selected, ...categories])])}>{t("timelineFilterAll")}</button>
        {categories.some(type => ["sleep", "feeding"].includes(type)) && <button type="button" onClick={() => updateFilters(["sleep", "feeding"])}>{t("timelineFilterSleepFeeding")}</button>}
      </div>
      <div className="timeline-filter-options">{categories.map(type => { const Icon = icons[type]; return <label key={type} style={{ "--filter-color": categoryColors[type] }}>
        <input type="checkbox" aria-label={labels[type]} checked={selected.includes(type)} onChange={() => updateFilters(selected.includes(type) ? selected.filter(value => value !== type) : [...selected, type])} />
        <Icon />{labels[type]} <span aria-hidden="true">· {counts[type]}</span>
      </label>; })}</div>
    </fieldset>
    <p className="form-hint">{t("timelineGuide")}</p>
    <p className="form-hint">{t(sortOrder === "oldest" ? "timelineOldest" : "timelineNewest")}</p>
    <p className="form-hint">{t("timelineCoverage")}</p>
    {loading && <div className="empty-state">{t("plus.loading")}</div>}
    {error && <div className="preview-error">{error}</div>}
    {!loading && !error && events.length === 0 && <div className="empty-state">{t("timelineFilterEmpty")}</div>}
    {!loading && !error && <ol className="timeline-list interval-timeline" style={{ "--bracket-gutter": `${layout.lanes ? layout.lanes * 12 + 8 : 0}px` }}>
      {layout.rows.map((event, index) => {
        const span = backfill && index + 1 < layout.rows.length ? timelineSpan(event, layout.rows[index + 1], allEvents, visibleIds) : null;
        const Icon = icons[event.type];
        const phase = event.phase === "point" ? "" : t(`timelinePhases.${event.phase}`);
        return <li className={`timeline-event timeline-phase-${event.phase}`} key={event.id} style={{ "--event-color": event.color }}>
          {event.brackets.map(bracket => <span key={bracket.id} aria-hidden="true" className={`timeline-bracket timeline-bracket-${bracket.edge}`} style={{ "--bracket-lane": bracket.lane, "--bracket-color": bracket.color }} />)}
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
          {span && <div className="timeline-backfill-span">
            <span>{formatTime(span.start)}–{formatTime(span.end)} · {formatElapsedHM(new Date(span.end) - new Date(span.start))}</span>
            {span.hidden > 0 && <small>{t("timelineHiddenInSpan", { count: span.hidden })}</small>}
            <button onClick={() => setDraft(span)}>{t("timelineAddEntry")}</button>
          </div>}
        </li>;
      })}
    </ol>}
    {draft && !draft.type && <Modal title={t("timelineAddEntry")} onClose={() => setDraft(null)}>
      <p className="form-hint">{t("timelineBackfillReview")}</p>
      <div className="timeline-entry-options">{Object.keys(forms).map(type => { const Icon = icons[type]; return <button key={type} style={{ color: categoryColors[type] }} onClick={() => setDraft({ ...draft, type })}><Icon />{labels[type]}</button>; })}</div>
      <p className="form-hint">{t("timelineTaskBackfillHint")}</p>
    </Modal>}
    {EntryForm && <EntryForm childId={childId} initialValues={{ ...draft, sleep: data.sleep }} onClose={() => setDraft(null)} onDone={saved} onSaved={saved} />}
  </div>;
}
