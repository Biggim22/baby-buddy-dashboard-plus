import { useMemo, useState } from "react";
import Modal, { FormButton, FormError } from "./Modal";
import { api } from "../api";
import { downloadFile } from "../utils/download";
import { useTranslation, getLocale } from "../locales";

const isoDate = (date) => date.toLocaleDateString("sv-SE");
const dayStart = (value) => `${value}T00:00:00`;
const dayEnd = (value) => `${value}T23:59:59`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function inRange(items, key, start, end) {
  return (items || []).filter((item) => String(item[key] || "").slice(0, 10) >= start && String(item[key] || "").slice(0, 10) <= end);
}

function linesFor(title, rows) {
  return [`## ${title}`, ...(rows.length ? rows : ["—"])];
}

export default function PaediatricReportModal({ childId, childName, onClose }) {
  const t = useTranslation();
  const now = new Date();
  const defaultStart = new Date(now); defaultStart.setDate(defaultStart.getDate() - 29);
  const [start, setStart] = useState(isoDate(defaultStart));
  const [end, setEnd] = useState(isoDate(now));
  const [sections, setSections] = useState({ growth: true, temperature: true, medication: true, activities: true, local: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const toggle = (key) => setSections((current) => ({ ...current, [key]: !current[key] }));
  const load = async () => {
    if (!childId || start > end) { setError(t("report.paediatricInvalidRange")); return; }
    setLoading(true); setError("");
    try {
      const child = { child: childId, limit: 500, ordering: "-date" };
      const [weights, heights, heads, bmis, temperatures, medications, feedings, sleep, changes, care, tasks] = await Promise.all([
        api.getWeight(child), api.getHeight(child), api.getHeadCircumference(child), api.getBmi(child),
        api.getTemperature({ child: childId, limit: 500, ordering: "-time" }),
        api.getMedication({ child: childId, limit: 500, ordering: "-time" }),
        api.getFeedings({ child: childId, start_min: dayStart(start), start_max: dayEnd(end), limit: 500, ordering: "-start" }),
        api.getSleep({ child: childId, start_min: dayStart(start), start_max: dayEnd(end), limit: 500, ordering: "-start" }),
        api.getChanges({ child: childId, date_min: dayStart(start), date_max: dayEnd(end), limit: 500, ordering: "-time" }),
        api.getCare(childId, 500), api.getTasks(childId, true, end),
      ]);
      setReport({
        weights: inRange(weights.results, "date", start, end), heights: inRange(heights.results, "date", start, end), heads: inRange(heads.results, "date", start, end), bmis: inRange(bmis.results, "date", start, end),
        temperatures: inRange(temperatures.results, "time", start, end), medications: inRange(medications.results, "time", start, end),
        feedings: feedings.results || [], sleep: sleep.results || [], changes: changes.results || [], care: inRange(care.results, "time", start, end),
        appointments: (tasks.results || []).filter((item) => item.task_kind === "appointment" && item.start_date >= start && item.start_date <= end),
      });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const text = useMemo(() => {
    if (!report) return "";
    const title = `${t("report.paediatricTitle")} · ${childName || t("header.defaultBabyName")}`;
    const output = [title, `${t("report.paediatricPeriod")}: ${start} – ${end}`, t("report.paediatricDisclaimer"), ""];
    if (sections.growth) output.push(...linesFor(t("report.paediatricGrowth"), [
      ...report.weights.map((x) => `${x.date}: ${t("growth.weight")} ${x.weight}`), ...report.heights.map((x) => `${x.date}: ${t("growth.height")} ${x.height}`),
      ...report.heads.map((x) => `${x.date}: ${t("growth.headCircumference")} ${x.head_circumference}`), ...report.bmis.map((x) => `${x.date}: BMI ${x.bmi}`),
    ]));
    if (sections.temperature) output.push("", ...linesFor(t("report.paediatricTemperature"), report.temperatures.map((x) => `${x.time}: ${x.temperature} °C${x.notes ? ` · ${x.notes}` : ""}`)));
    if (sections.medication) output.push("", ...linesFor(t("notes.medications"), report.medications.map((x) => `${x.time}: ${x.medication} · ${x.dosage || ""} ${x.dosage_unit || ""}${x.notes ? ` · ${x.notes}` : ""}`)));
    if (sections.activities) output.push("", ...linesFor(t("report.paediatricActivities"), [
      `${t("report.columnFeedings")}: ${report.feedings.length}`, `${t("report.columnSleepH")}: ${report.sleep.length}`, `${t("report.paediatricDiapers")}: ${report.changes.length}`,
    ]));
    if (sections.local) output.push("", ...linesFor(t("report.paediatricLocal"), [
      ...report.care.map((x) => `${x.time}: ${x.category_label || x.care_type}${x.notes ? ` · ${x.notes}` : ""}`),
      ...report.appointments.map((x) => `${x.start_date}${x.appointment_time ? ` ${x.appointment_time}` : ""}: ${x.title}${x.notes ? ` · ${x.notes}` : ""}`),
    ]));
    return output.join("\n");
  }, [report, sections, start, end, childName, t]);

  const exportText = () => downloadFile(`baby-buddy-paediatric-report-${start}-${end}.txt`, text, "text/plain;charset=utf-8");
  const print = () => {
    const title = `${t("report.paediatricTitle")} · ${childName || t("header.defaultBabyName")}`;
    const html = `<!doctype html><html lang="${getLocale()}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px system-ui,sans-serif;max-width:800px;margin:36px auto;line-height:1.5;color:#111}h1{font-size:24px}pre{white-space:pre-wrap;font:inherit}.note{color:#555;font-size:12px}@media print{body{margin:18mm}}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(text)}</pre><p class="note">${escapeHtml(t("report.paediatricGenerated"))}</p></body></html>`;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) { setError(t("report.paediatricPopup")); return; }
    popup.document.write(html); popup.document.close(); popup.focus(); popup.print();
  };

  return <Modal title={t("report.paediatricTitle")} onClose={onClose} maxWidth={680}>
    <p className="form-hint">{t("report.paediatricHint")}</p>
    <div className="preview-form-grid settings-two-columns"><label>{t("plus.displaySettings.from")}<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>{t("plus.displaySettings.until")}<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
    <div className="preview-list">{[["growth", t("report.paediatricGrowth")], ["temperature", t("report.paediatricTemperature")], ["medication", t("notes.medications")], ["activities", t("report.paediatricActivities")], ["local", t("report.paediatricLocal")]].map(([key, label]) => <label className="preview-check" key={key}><input type="checkbox" checked={sections[key]} onChange={() => toggle(key)} /> {label}</label>)}</div>
    <FormError message={error} />
    {!report && <FormButton type="button" onClick={load} color="#8B5CF6">{loading ? t("plus.loading") : t("report.paediatricCreate")}</FormButton>}
    {report && <><pre className="report-preview">{text}</pre><div className="preview-toolbar"><button className="secondary-inline" onClick={load}>{t("report.paediatricRefresh")}</button><button className="secondary-inline" onClick={exportText}>{t("report.paediatricDownload")}</button><button className="primary-inline" onClick={print}>{t("report.paediatricPrint")}</button></div></>}
  </Modal>;
}
