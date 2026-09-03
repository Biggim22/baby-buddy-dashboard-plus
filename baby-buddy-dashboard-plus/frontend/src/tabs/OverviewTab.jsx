import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SectionCard from "../components/SectionCard";
import TimelineItem from "../components/TimelineItem";
import DiaperBadge from "../components/DiaperBadge";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { aggregateByDayOfWeek, aggregateSleepByDay, dailyDiaperTotals, formatTime, parseDuration } from "../utils/formatters";
import { useUnits } from "../utils/units";
import { api } from "../api";
import { TaskOverview } from "../components/TaskPanel";
import Modal from "../components/Modal";
import SettingsTab from "./SettingsTab";
import { getLanguage, useTranslation } from "../locales";

const COLLAPSED_COUNT = 3;
const DEFAULT_ORDER = ["latest", "feeding", "sleep", "diapers", "medication", "tummy"];

function relativeTime(value, t) {
  if (!value) return "–";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { m: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { h: hours, m: minutes % 60 ? ` ${minutes % 60}m` : "" });
  const days = Math.floor(hours / 24);
  return t("plus.overview.daysAgo", { days });
}

function durationText(value) {
  const minutes = Math.round(parseDuration(value) * 60);
  if (!minutes) return "–";
  if (getLanguage() === "de") return minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function feedingLabel(entry, volumeUnit, t) {
  if (!entry) return t("plus.overview.noEntry");
  const method = {
    left: t("plus.overview.leftBreast"), right: t("plus.overview.rightBreast"), both: t("plus.overview.bothBreasts"), bottle: t("plus.overview.bottle"),
    "left breast": t("plus.overview.leftBreast"), "right breast": t("plus.overview.rightBreast"), "both breasts": t("plus.overview.bothBreasts"),
  }[String(entry.method || "").toLowerCase()] || entry.method || entry.type || t("plus.overview.feeding");
  return `${method}${entry.amount ? ` · ${entry.amount} ${volumeUnit}` : ""}`;
}

function diaperType(entry, t) {
  if (!entry) return "–";
  if (entry.wet && entry.solid) return t("plus.overview.wetSolid");
  if (entry.solid) return t("plus.overview.solid");
  if (entry.wet) return t("plus.overview.wet");
  return t("plus.overview.hygieneChange");
}

function nextDoseText(entry, t) {
  if (!entry?.next_dose_interval || !entry.time) return "";
  const [hours = 0, minutes = 0, seconds = 0] = String(entry.next_dose_interval).split(":").map(Number);
  const next = new Date(new Date(entry.time).getTime() + ((hours * 60 + minutes) * 60 + seconds) * 1000);
  return t("plus.overview.nextDose", { time: formatTime(next) });
}

function LatestEvent({ title, icon, color, entry, time, primary, detail, extra, onClick, t }) {
  return (
    <button className="latest-event-card" style={{ "--event-color": color }} onClick={entry && onClick ? onClick : undefined} disabled={!entry}>
      <span className="latest-event-icon">{icon}</span>
      <span className="latest-event-content">
        <strong>{title}</strong>
        <span className="latest-event-age">{entry ? relativeTime(time, t) : t("plus.overview.noEntry")}</span>
        {entry && <span>{primary}</span>}
        {entry && detail && <small>{detail}</small>}
        {extra && <small className="latest-event-extra">{extra}</small>}
      </span>
    </button>
  );
}

function Empty({ children }) {
  return <div className="empty-compact">{children}</div>;
}

function ExpandableList({ listKey, entries, expanded, setExpanded, render, t }) {
  const revealed = expanded[listKey] || COLLAPSED_COUNT;
  const visible = revealed === Infinity ? entries : entries.slice(0, revealed);
  const canShowAll = revealed >= COLLAPSED_COUNT + 20 && revealed < entries.length;
  const canShowMore = revealed < entries.length && !canShowAll;
  return (
    <>
      {visible.map(render)}
      {entries.length > COLLAPSED_COUNT && (
        <div className="expand-actions">
          {canShowMore && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: revealed + 10 }))}>{t("plus.overview.showTenMore")}</button>}
          {canShowAll && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: Infinity }))}>{t("plus.overview.showAll")}</button>}
          {revealed > COLLAPSED_COUNT && revealed !== Infinity && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: COLLAPSED_COUNT }))}>{t("plus.overview.showLess")}</button>}
          {revealed === Infinity && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: COLLAPSED_COUNT }))}>{t("plus.overview.showLess")}</button>}
        </div>
      )}
    </>
  );
}

function CompactHistoryChart({ data, dataKey, color, unit = "" }) {
  const labelKey = data[0]?.day != null ? "day" : "date";
  return <div className="overview-mini-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} barSize={14}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey={labelKey} tick={{ fill: "var(--text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip formatter={(value) => [`${Math.round(value * 10) / 10}${unit}`, ""]} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)" }} /><Bar dataKey={dataKey} fill={color} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

export default function OverviewTab({ childId, feedings, weeklyFeedings, sleepEntries, weeklySleep, changes, lastSolidChange, tummyTimes, medications, onEditEntry }) {
  const t = useTranslation();
  const units = useUnits();
  const [expanded, setExpanded] = useState({});
  const [settings, setSettings] = useState({ overview_sections: DEFAULT_ORDER, overview_hidden: [] });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!childId) return;
    api.bootstrapLocal(childId)
      .then(() => api.getLocalSettings(childId))
      .then((result) => setSettings((current) => ({ ...current, ...result })))
      .catch(() => {});
  }, [childId]);

  const order = useMemo(() => {
    const saved = Array.isArray(settings.overview_sections) ? settings.overview_sections : [];
    return [...saved.filter((item) => DEFAULT_ORDER.includes(item)), ...DEFAULT_ORDER.filter((item) => !saved.includes(item))];
  }, [settings.overview_sections]);
  const visible = (section) => !(settings.overview_hidden || []).includes(section);
  const latestFeeding = feedings[0];
  const latestSleep = sleepEntries[0];
  const latestDiaper = changes[0];
  const latestSolid = lastSolidChange || changes.find((entry) => entry.solid);
  const latestMedication = medications[0];
  const latestTummy = tummyTimes[0];
  const latestCards = {
    feeding: <LatestEvent t={t} key="feeding" title={t("plus.overview.latestFeeding")} icon={<Icons.Bottle />} color={colors.feeding} entry={latestFeeding} time={latestFeeding?.end || latestFeeding?.start} primary={latestFeeding && `${formatTime(latestFeeding.start)}–${formatTime(latestFeeding.end || latestFeeding.start)} · ${durationText(latestFeeding.duration)}`} detail={feedingLabel(latestFeeding, units.volume, t)} onClick={() => onEditEntry?.("feeding", latestFeeding)} />,
    sleep: <LatestEvent t={t} key="sleep" title={t("plus.overview.latestSleep")} icon={<Icons.Moon />} color={colors.sleep} entry={latestSleep} time={latestSleep?.end || latestSleep?.start} primary={latestSleep && `${formatTime(latestSleep.start)}–${latestSleep.end ? formatTime(latestSleep.end) : t("time.ongoing")}`} detail={latestSleep && durationText(latestSleep.duration)} onClick={() => onEditEntry?.("sleep", latestSleep)} />,
    diapers: <LatestEvent t={t} key="diapers" title={t("plus.overview.latestDiaper")} icon={<Icons.Droplet />} color={colors.diaper} entry={latestDiaper} time={latestDiaper?.time} primary={latestDiaper && `${formatTime(latestDiaper.time)} · ${diaperType(latestDiaper, t)}`} extra={latestSolid ? t("plus.overview.lastSolid", { age: relativeTime(latestSolid.time, t), time: formatTime(latestSolid.time) }) : t("plus.overview.noSolid")} onClick={() => onEditEntry?.("diaper", latestDiaper)} />,
    medication: <LatestEvent t={t} key="medication" title={t("plus.overview.latestMedication")} icon={<Icons.Heart />} color={colors.temp} entry={latestMedication} time={latestMedication?.time} primary={latestMedication && `${latestMedication.name}${latestMedication.dosage != null ? ` · ${latestMedication.dosage} ${latestMedication.dosage_unit}` : ""}`} detail={nextDoseText(latestMedication, t)} onClick={() => onEditEntry?.("medication", latestMedication)} />,
    tummy: <LatestEvent t={t} key="tummy" title={t("plus.overview.latestTummy")} icon={<Icons.Sun />} color={colors.tummy} entry={latestTummy} time={latestTummy?.end || latestTummy?.start} primary={latestTummy && `${formatTime(latestTummy.start)}–${latestTummy.end ? formatTime(latestTummy.end) : t("time.ongoing")}`} detail={latestTummy && durationText(latestTummy.duration)} onClick={() => onEditEntry?.("tummy", latestTummy)} />,
  };
  const categoryOrder = order.filter((section) => section !== "latest" && latestCards[section] && visible(section));
  const showOverviewCharts = settings.overview_show_charts === true || String(settings.overview_show_charts).toLowerCase() === "true";
  const feedingChart = useMemo(() => aggregateByDayOfWeek(weeklyFeedings || [], "amount"), [weeklyFeedings]);
  const sleepChart = useMemo(() => aggregateSleepByDay(weeklySleep || []), [weeklySleep]);
  const diaperChart = useMemo(() => dailyDiaperTotals(changes || [], 7), [changes]);

  useEffect(() => {
    const updateSettings = (event) => setSettings((current) => ({ ...current, ...event.detail }));
    window.addEventListener("baby-buddy-settings-updated", updateSettings);
    return () => window.removeEventListener("baby-buddy-settings-updated", updateSettings);
  }, []);

  const sections = {
    latest: (
      <section className="latest-events-section" key="latest">
        <h2>{t("plus.overview.latestEvents")}</h2>
        <div className="latest-events-grid">{categoryOrder.map((section) => latestCards[section])}</div>
      </section>
    ),
    feeding: (
      <SectionCard key="feeding" title={t("plus.overview.feedingHistory")} icon={<Icons.Bottle />} color={colors.feeding}>
        {feedings.length ? <ExpandableList t={t} listKey="feedings" entries={feedings} expanded={expanded} setExpanded={setExpanded} render={(entry, index, shown) => <div className="entry-clickable" key={entry.id} onClick={() => onEditEntry?.("feeding", entry)}><TimelineItem time={`${formatTime(entry.start)}–${formatTime(entry.end || entry.start)}`} label={feedingLabel(entry, units.volume, t)} detail={`${durationText(entry.duration)} · ${relativeTime(entry.end || entry.start, t)}`} color={colors.feeding} isLast={index === shown.length - 1} /></div>} /> : <Empty>{t("plus.overview.noFeeding")}</Empty>}
        {showOverviewCharts && <CompactHistoryChart data={feedingChart} dataKey="count" color={colors.feeding} unit="×" />}
      </SectionCard>
    ),
    sleep: (
      <SectionCard key="sleep" title={t("plus.overview.sleepHistory")} icon={<Icons.Moon />} color={colors.sleep}>
        {sleepEntries.length ? <ExpandableList t={t} listKey="sleep" entries={sleepEntries} expanded={expanded} setExpanded={setExpanded} render={(entry, index, shown) => <div className="entry-clickable" key={entry.id} onClick={() => onEditEntry?.("sleep", entry)}><TimelineItem time={`${formatTime(entry.start)}–${entry.end ? formatTime(entry.end) : t("time.ongoing")}`} label={`${durationText(entry.duration)}${entry.nap ? ` · ${t("plus.timeline.nap")}` : ""}`} detail={relativeTime(entry.end || entry.start, t)} color={colors.sleep} isLast={index === shown.length - 1} /></div>} /> : <Empty>{t("plus.overview.noSleep")}</Empty>}
        {showOverviewCharts && <CompactHistoryChart data={sleepChart} dataKey="hours" color={colors.sleep} unit=" h" />}
      </SectionCard>
    ),
    diapers: (
      <SectionCard key="diapers" title={t("plus.overview.diaperHistory")} icon={<Icons.Droplet />} color={colors.diaper}>
        {changes.length ? <ExpandableList t={t} listKey="diapers" entries={changes} expanded={expanded} setExpanded={setExpanded} render={(entry) => <button className="diaper-recent-row" key={entry.id} onClick={() => onEditEntry?.("diaper", entry)}><DiaperBadge type={entry.wet && entry.solid ? "both" : entry.solid ? "solid" : entry.wet ? "wet" : "hygiene"} /><strong>{formatTime(entry.time)}</strong><span>{diaperType(entry, t)}</span><small>{relativeTime(entry.time, t)}</small></button>} /> : <Empty>{t("plus.overview.noDiaper")}</Empty>}
        {showOverviewCharts && <CompactHistoryChart data={diaperChart} dataKey="count" color={colors.diaper} unit="×" />}
      </SectionCard>
    ),
    medication: (
      <SectionCard key="medication" title={t("plus.overview.medicationHistory")} icon={<Icons.Heart />} color={colors.temp}>
        {medications.length ? <ExpandableList t={t} listKey="medication" entries={medications} expanded={expanded} setExpanded={setExpanded} render={(entry, index, shown) => <div className="entry-clickable" key={entry.id} onClick={() => onEditEntry?.("medication", entry)}><TimelineItem time={formatTime(entry.time)} label={`${entry.name}${entry.dosage != null ? ` · ${entry.dosage} ${entry.dosage_unit}` : ""}`} detail={`${relativeTime(entry.time, t)}${nextDoseText(entry, t) ? ` · ${nextDoseText(entry, t)}` : ""}`} color={colors.temp} isLast={index === shown.length - 1} /></div>} /> : <Empty>{t("plus.overview.noMedication")}</Empty>}
      </SectionCard>
    ),
    tummy: (
      <SectionCard key="tummy" title={t("plus.overview.tummyHistory")} icon={<Icons.Sun />} color={colors.tummy}>
        {tummyTimes.length ? <ExpandableList t={t} listKey="tummy" entries={tummyTimes} expanded={expanded} setExpanded={setExpanded} render={(entry, index, shown) => <div className="entry-clickable" key={entry.id} onClick={() => onEditEntry?.("tummy", entry)}><TimelineItem time={`${formatTime(entry.start)}–${entry.end ? formatTime(entry.end) : t("time.ongoing")}`} label={durationText(entry.duration)} detail={relativeTime(entry.end || entry.start, t)} color={colors.tummy} isLast={index === shown.length - 1} /></div>} /> : <Empty>{t("plus.overview.noTummy")}</Empty>}
      </SectionCard>
    ),
  };

  return (
    <div className="overview-layout">
      <div className="tab-settings-row"><button className="tab-settings-button" onClick={() => setShowSettings(true)} aria-label={t("plus.overview.settings")} title={t("plus.overview.settings")}><Icons.Settings /></button></div>
      {visible("tasks") && <div className="overview-tasks"><TaskOverview childId={childId} hideWhenEmpty /></div>}
      <div className="overview-categories">
        {order.filter(visible).map((section) => sections[section])}
      </div>
      <div className="overview-bottom" aria-hidden="true" />
      {showSettings && <Modal title={t("plus.overview.settings")} onClose={() => setShowSettings(false)}><SettingsTab childId={childId} scope="overview" /></Modal>}
    </div>
  );
}
