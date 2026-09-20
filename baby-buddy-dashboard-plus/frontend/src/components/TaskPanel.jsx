import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Icons } from "./Icons";
import Modal, { FormButton, FormError, FormField, FormInput, FormSelect } from "./Modal";
import SectionCard from "./SectionCard";
import { useTranslation } from "../locales";
import { logError } from "../utils/errorLog";

const today = () => new Date().toLocaleDateString("sv-SE");

function TaskForm({ childId, entry, initialKind = "task", calendarTargets = [], calendarEntities = [], onClose, onSaved }) {
  const t = useTranslation();
  const [title, setTitle] = useState(entry?.title || "");
  const [recurrence, setRecurrence] = useState(entry?.recurrence_type || (initialKind === "appointment" ? "once" : "daily"));
  const [intervalDays, setIntervalDays] = useState(entry?.interval_days || 1);
  const [startDate, setStartDate] = useState(entry?.start_date || today());
  const [showOverview, setShowOverview] = useState(entry?.show_overview !== 0);
  const [displayAfter, setDisplayAfter] = useState(entry?.display_after || "00:00");
  const [reminderTime, setReminderTime] = useState(entry?.reminder_time || "");
  const [appointmentTime, setAppointmentTime] = useState(entry?.appointment_time || "");
  const [kind, setKind] = useState(entry?.task_kind || initialKind);
  const [daysBefore, setDaysBefore] = useState(entry?.reminder_days_before || 0);
  const [notes, setNotes] = useState(entry?.notes || "");
  const [exportToCalendar, setExportToCalendar] = useState(Boolean(entry?.calendar_entity_id));
  const [calendarEntityId, setCalendarEntityId] = useState(entry?.calendar_entity_id || calendarEntities[0] || "");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      child_id: childId,
      title: title.trim(),
      recurrence_type: kind === "appointment" ? "once" : recurrence,
      interval_days: Number(intervalDays),
      start_date: startDate,
      show_overview: kind === "appointment" ? false : showOverview,
      display_after: kind === "appointment" ? "00:00" : displayAfter,
      reminder_time: reminderTime,
      appointment_time: kind === "appointment" ? appointmentTime : "",
      task_kind: kind,
      reminder_days_before: Number(daysBefore),
      notes: notes.trim(),
    };
    try {
      const saved = entry ? await api.updateTask(entry.id, payload) : await api.createTask(payload);
      if (kind === "appointment" && exportToCalendar && calendarEntityId) {
        await api.exportCalendarEvent({ child_id: childId, task_id: saved.id, calendar_entity_id: calendarEntityId });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(t("common.saveFailed"));
      logError(entry ? "Update Task" : "Save Task", err.message);
    }
  };

  return (
    <Modal title={entry ? (kind === "appointment" ? t("plus.tasks.editAppointment") : t("plus.tasks.editTask")) : (kind === "appointment" ? t("plus.tasks.addAppointment") : t("plus.tasks.addTask"))} onClose={onClose}>
      <form onSubmit={submit}>
        <FormField label={t("plus.tasks.task")}><FormInput value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></FormField>
        {kind === "task" && <><FormField label={t("plus.tasks.recurrence")}><FormSelect value={recurrence} onChange={(event) => setRecurrence(event.target.value)} options={[{ value: "daily", label: t("plus.tasks.daily") }, { value: "interval", label: t("plus.tasks.interval") }, { value: "once", label: t("plus.tasks.once") }]} /></FormField>{recurrence === "interval" && <FormField label={t("plus.tasks.intervalDays")}><FormInput type="number" min="1" max="365" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} /></FormField>}</>}
        <FormField label={kind === "appointment" || recurrence === "once" ? t("plus.tasks.dueDate") : t("plus.tasks.startDate")}><FormInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></FormField>
        {kind === "task" && <><label className="preview-check"><input type="checkbox" checked={showOverview} onChange={(event) => setShowOverview(event.target.checked)} /> {t("plus.tasks.showOverview")}</label><FormField label={t("plus.tasks.displayAfter")}><FormInput type="time" value={displayAfter} onChange={(event) => setDisplayAfter(event.target.value)} /></FormField><FormField label={t("plus.tasks.reminder")}><FormInput type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></FormField></>}
        {kind === "appointment" && <><FormField label={t("plus.tasks.appointmentTime")}><FormInput type="time" value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)} required /></FormField><FormField label={t("plus.tasks.appointmentReminderDay")}><FormSelect value={String(daysBefore)} onChange={(event) => setDaysBefore(event.target.value)} options={[{ value: "0", label: t("plus.tasks.sameDay") }, { value: "1", label: t("plus.tasks.previousDay") }, { value: "2", label: t("plus.tasks.daysBefore", { days: 2 }) }, { value: "3", label: t("plus.tasks.daysBefore", { days: 3 }) }]} /></FormField><FormField label={t("plus.tasks.appointmentReminderTime")}><FormInput type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} required /></FormField>{calendarEntities.length > 0 && <><label className="preview-check"><input type="checkbox" checked={exportToCalendar} onChange={(event) => setExportToCalendar(event.target.checked)} /> {t("plus.tasks.exportToCalendar")}</label>{exportToCalendar && <FormField label={t("plus.tasks.calendar")}><FormSelect value={calendarEntityId} onChange={(event) => setCalendarEntityId(event.target.value)} options={calendarEntities.map((entityId) => ({ value: entityId, label: calendarTargets.find((calendar) => calendar.entity_id === entityId)?.name || entityId }))} /></FormField>}</>}</>}
        <FormField label={t("plus.note")}><textarea className="preview-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField>
        <FormError message={error} />
        <FormButton type="submit" color="#14B8A6">{t("plus.save")}</FormButton>
      </form>
    </Modal>
  );
}

export function useTasks(childId, includeAll = true) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!childId) return;
    try {
      await api.bootstrapLocal(childId);
      const response = await api.getTasks(childId, includeAll);
      setTasks(response.results || []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [childId, includeAll]);
  useEffect(() => void load(), [load]);
  return { tasks, error, load };
}

export function TaskRows({ tasks, onReload, editable = false, onEdit, showCheckbox = true }) {
  const t = useTranslation();
  const [actionError, setActionError] = useState("");
  const toggle = async (task, completed) => {
    setActionError("");
    try {
      await api.toggleTask(task.id, completed);
      await onReload();
    } catch (err) {
      setActionError(t("common.saveFailed"));
      logError("Update Task", err.message);
    }
  };
  const remove = async (task) => {
    if (!window.confirm(t("plus.tasks.confirmDelete", { title: task.title }))) return;
    setActionError("");
    try {
      await api.deleteTask(task.id);
      await onReload();
    } catch (err) {
      setActionError(t("common.deleteFailed"));
      logError("Delete Task", err.message);
    }
  };
  return <><FormError message={actionError} /><div className="preview-list">{tasks.map((task) => (
    <div className={`preview-row${task.completed ? " preview-complete" : ""}`} key={task.id}>
      {showCheckbox && <input type="checkbox" checked={Boolean(task.completed)} onChange={(event) => toggle(task, event.target.checked)} />}
      <button className="preview-row-main" onClick={() => editable && onEdit(task)}>
        <strong>{task.title}</strong>
        <span>{task.task_kind === "appointment" ? `${t("plus.tasks.appointment")} · ${task.start_date}${task.appointment_time ? ` · ${task.appointment_time}` : ""}${task.reminder_time ? ` · ${t("plus.tasks.reminderAt")} ${task.reminder_time}` : ""}` : `${t("plus.tasks.task")}${task.reminder_time ? ` · ${t("plus.tasks.reminderAt")} ${task.reminder_time}` : ""}${task.display_after !== "00:00" ? ` · ${t("plus.tasks.displayAfter")} ${task.display_after}` : ""}`}</span>
      </button>
      {editable && <button className="danger-icon" onClick={() => remove(task)}>{t("plus.delete")}</button>}
    </div>
  ))}</div></>;
}

export function TaskOverview({ childId, hideWhenEmpty = false }) {
  const t = useTranslation();
  const { tasks, error, load } = useTasks(childId, false);
  const currentTime = new Date().toTimeString().slice(0, 5);
  const visible = tasks.filter((task) => task.due && task.active && task.show_overview && !task.completed && (task.display_after || "00:00") <= currentTime);
  if (error) return <div className="preview-error">{error}</div>;
  if (hideWhenEmpty && visible.length === 0) return null;
  return (
    <SectionCard title={t("plus.tasks.today")} icon={<Icons.StickyNote />} color="#14B8A6">
      {visible.length ? <TaskRows tasks={visible} onReload={load} /> : <div className="empty-state">{t("plus.tasks.allDone")}</div>}
    </SectionCard>
  );
}

export default function TasksTab({ childId, hiddenCards = [], cardOrder = [] }) {
  const t = useTranslation();
  const { tasks, error, load } = useTasks(childId, true);
  const [editing, setEditing] = useState(undefined);
  const [newKind, setNewKind] = useState("task");
  const [calendarEntities, setCalendarEntities] = useState([]);
  const [calendarTargets, setCalendarTargets] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarError, setCalendarError] = useState("");
  const [calendarAction, setCalendarAction] = useState("");
  const taskItems = tasks.filter((task) => task.task_kind !== "appointment");
  const appointments = tasks.filter((task) => task.task_kind === "appointment");
  const openNew = (kind) => { setNewKind(kind); setEditing(null); };
  const orderOf = (id) => { const index = cardOrder.indexOf(id); return index < 0 ? 99 : index; };
  const loadCalendar = useCallback(async () => {
    if (!childId) return;
    try {
      const [settings, targets] = await Promise.all([api.getLocalSettings(childId), api.getCalendarTargets()]);
      const selected = (settings.calendar_entities || []).filter((entityId) => entityId.startsWith("calendar."));
      setCalendarEntities(selected);
      setCalendarTargets(targets.calendars || []);
      if (selected.length) {
        const events = await api.getCalendarEvents(selected);
        setCalendarEvents(events.events || []);
      } else setCalendarEvents([]);
      setCalendarError("");
    } catch (err) {
      setCalendarError(err.message);
    }
  }, [childId]);
  useEffect(() => void loadCalendar(), [loadCalendar]);
  const importEvent = async (event) => {
    setCalendarAction(event.start);
    try {
      const result = await api.importCalendarEvent({ child_id: childId, ...event });
      if (!result.already_imported) await load();
      setCalendarError("");
    } catch (err) {
      setCalendarError(err.message);
    } finally {
      setCalendarAction("");
    }
  };
  return <div className="fade-in tasks-preview-layout">
    <div className="preview-toolbar"><div><strong>{t("plus.tasks.title")}</strong><span>{t("plus.tasks.description")}</span></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="secondary-inline" onClick={() => openNew("appointment")}>{t("plus.tasks.addAppointment")}</button><button className="primary-inline" onClick={() => openNew("task")}>{t("plus.tasks.addTask")}</button></div></div>
    {!hiddenCards.includes("tasks") && <SectionCard style={{ order: orderOf("tasks") }} title={t("plus.tasks.list")} icon={<Icons.StickyNote />} color="#14B8A6">
      {error && <div className="preview-error">{error}</div>}
      {!error && taskItems.length === 0 && <div className="empty-state">{t("plus.tasks.none")}</div>}
      <TaskRows tasks={taskItems} onReload={load} editable onEdit={setEditing} />
    </SectionCard>}
    {!hiddenCards.includes("appointments") && <SectionCard style={{ order: orderOf("appointments") }} title={t("plus.tasks.appointments")} icon={<Icons.Clipboard />} color="#F59E0B">
      {!error && appointments.length === 0 && <div className="empty-state">{t("plus.tasks.noAppointments")}</div>}
      <TaskRows tasks={appointments} onReload={load} editable onEdit={setEditing} showCheckbox={false} />
    </SectionCard>}
    {!hiddenCards.includes("calendar") && <SectionCard style={{ order: orderOf("calendar") }} title={t("plus.tasks.calendar")} icon={<Icons.Clipboard />} color="#8B5CF6">
      <p className="form-hint">{t("plus.tasks.calendarHint")}</p>
      {!calendarEntities.length && <div className="empty-state">{t("plus.tasks.noCalendarsSelected")}</div>}
      {calendarError && <div className="preview-error">{calendarError}</div>}
      {!!calendarEntities.length && !calendarError && !calendarEvents.length && <div className="empty-state">{t("plus.tasks.noCalendarEvents")}</div>}
      <div className="preview-list">{calendarEvents.map((event) => <div className="preview-row" key={`${event.calendar_entity_id}-${event.start}-${event.summary}`}><div className="preview-grow"><strong>{event.summary}</strong><span>{event.start}{event.location ? ` · ${event.location}` : ""}</span></div><button className="secondary-inline" disabled={calendarAction === event.start} onClick={() => importEvent(event)}>{calendarAction === event.start ? t("plus.saving") : t("plus.tasks.importAppointment")}</button></div>)}</div>
    </SectionCard>}
    {editing !== undefined && <TaskForm childId={childId} entry={editing} initialKind={newKind} calendarTargets={calendarTargets} calendarEntities={calendarEntities} onClose={() => setEditing(undefined)} onSaved={load} />}
  </div>;
}
