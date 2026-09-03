import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SectionCard from "../components/SectionCard";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { averageBreastFeedingDurationMs, averageFeedingGapMs, dailyDiaperTotals, dailyFeedingTotals, dailySleepTotals, formatElapsedHM, parseDuration } from "../utils/formatters";
import { useUnits } from "../utils/units";
import { getLanguage, getLocale, getTimeFormat, useTranslation } from "../locales";
import DiaperSizeCalculator from "../components/DiaperSizeCalculator";

function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function lastSevenDays(locale) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - index);
    return {
      key: dateKey(date),
      day: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
      tooltip: new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "short" }).format(date),
    };
  });
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  if (getLanguage() === "de") {
    if (minutes < 60) return `${minutes} Min.`;
    return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
  }
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function nextBoundary(cursor, isDay) {
  const next = new Date(cursor);
  if (isDay) {
    next.setHours(20, 0, 0, 0);
  } else if (cursor.getHours() < 6) {
    next.setHours(6, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0);
  }
  return next;
}

function sleepWindowMinutes(entries, startWindow, endWindow, mode) {
  let milliseconds = 0;
  entries.forEach((entry) => {
    let cursor = new Date(Math.max(new Date(entry.start).getTime(), startWindow.getTime()));
    const entryEnd = entry.end ? new Date(entry.end) : endWindow;
    const end = new Date(Math.min(entryEnd.getTime(), endWindow.getTime()));
    while (cursor < end) {
      const isDay = cursor.getHours() >= 6 && cursor.getHours() < 20;
      const boundary = nextBoundary(cursor, isDay);
      const segmentEnd = new Date(Math.min(boundary.getTime(), end.getTime()));
      if (mode === "total" || (mode === "day" && isDay) || (mode === "night" && !isDay)) {
        milliseconds += segmentEnd - cursor;
      }
      cursor = segmentEnd;
    }
  });
  return Math.round(milliseconds / 60000);
}

function breastData(entries, locale) {
  const days = lastSevenDays(locale).map((day) => ({ ...day, links: 0, rechts: 0, linksCount: 0, rechtsCount: 0, count: 0 }));
  const byKey = Object.fromEntries(days.map((day) => [day.key, day]));
  entries.forEach((entry) => {
    const method = String(entry.method || "").toLowerCase();
    const isLeft = method.includes("left") || method === "links";
    const isRight = method.includes("right") || method === "rechts";
    const isBoth = method.includes("both") || method.includes("beide");
    if (!isLeft && !isRight && !isBoth && !method.includes("breast") && !method.includes("brust")) return;
    const day = byKey[dateKey(entry.start)];
    if (!day) return;
    const minutes = parseDuration(entry.duration) * 60;
    if (isBoth) {
      day.links += minutes / 2;
      day.rechts += minutes / 2;
      day.linksCount += 1;
      day.rechtsCount += 1;
    } else if (isRight) {
      day.rechts += minutes;
      day.rechtsCount += 1;
    } else {
      day.links += minutes;
      day.linksCount += 1;
    }
    day.count += 1;
  });
  return days.map((day) => ({ ...day, links: Math.round(day.links), rechts: Math.round(day.rechts) }));
}

function ChartModeMenu({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const options = [
    { value: "duration", label: t("plus.analytics.durationSides") },
    { value: "count", label: t("plus.analytics.countSides") },
  ];
  return (
    <div className="chart-mode-menu">
      <button className="chart-mode-button" onClick={() => setOpen((current) => !current)} aria-label={t("plus.analytics.chooseDisplay")} title={t("plus.analytics.chooseDisplay")}><Icons.Settings /></button>
      {open && <div className="chart-mode-popover">{options.map((option) => <label key={option.value}><input type="radio" name="breast-chart-mode" checked={value === option.value} onChange={() => { onChange(option.value); setOpen(false); }} />{option.label}</label>)}</div>}
    </div>
  );
}

function SleepPeriodMenu({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  return <div className="chart-mode-menu"><button className="chart-mode-button" onClick={() => setOpen((item) => !item)} title={t("plus.displaySettings.sleepPeriodMode")}><Icons.Settings /></button>{open && <div className="chart-mode-popover">{[{ value: "rolling", label: t("plus.displaySettings.rolling") }, { value: "calendar", label: t("plus.displaySettings.calendarDays") }].map((item) => <label key={item.value}><input type="radio" name="sleep-period-mode" checked={value === item.value} onChange={() => { onChange(item.value); setOpen(false); }} />{item.label}</label>)}</div>}</div>;
}

function relativeDayLabel(index, t) {
  if (index === 0) return t("plus.analytics.today");
  if (index === 1) return t("plus.analytics.yesterday");
  return t("plus.analytics.daysAgo", { days: index });
}

function SplitWeekRows({ days, type, mode = "count", t }) {
  return <div className="split-week-rows">{days.map((day, index) => {
    const parts = type === "breast"
      ? [{ value: mode === "duration" ? day.links : day.linksCount, label: `${mode === "duration" ? formatMinutes(day.links) : day.linksCount} ${t("plus.analytics.left")}`, color: "#38BDF8" }, { value: mode === "duration" ? day.rechts : day.rechtsCount, label: `${mode === "duration" ? formatMinutes(day.rechts) : day.rechtsCount} ${t("plus.analytics.right")}`, color: colors.feeding }]
      : [{ value: day.nass, label: `${day.nass} ${t("plus.analytics.wet")}`, color: "#38BDF8" }, { value: day.fest, label: `${day.fest} ${t("plus.analytics.solid")}`, color: "#F59E0B" }, { value: day.beides, label: `${day.beides} ${t("plus.analytics.both")}`, color: "#8B5CF6" }, { value: day.hygiene, label: `${day.hygiene} ${t("plus.analytics.hygiene")}`, color: "#94A3B8" }];
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    const detail = type === "breast" ? t("plus.analytics.breastDetail", { count: day.count, duration: formatMinutes(day.links + day.rechts) }) : t("plus.analytics.diaperDetail", { count: day.gesamt });
    return <div className="split-week-row" key={day.key || day.day}><div className="split-week-bar" aria-label={`${relativeDayLabel(index, t)}: ${detail}`}>{total > 0 ? parts.filter((part) => part.value > 0).map((part) => <span key={part.label} style={{ flex: part.value, background: part.color }}>{part.label}</span>) : <span className="split-week-empty">{t("plus.analytics.noEntry")}</span>}</div><small title={day.tooltip}>{relativeDayLabel(index, t)} ({detail})</small></div>;
  })}</div>;
}

function bottleData(entries, locale) {
  const days = lastSevenDays(locale).map((day) => ({ ...day, volumen: 0, anzahl: 0 }));
  const byKey = Object.fromEntries(days.map((day) => [day.key, day]));
  entries.forEach((entry) => {
    const method = String(entry.method || "").toLowerCase();
    if (!method.includes("bottle") && !method.includes("fläsch") && !method.includes("flasch")) return;
    const day = byKey[dateKey(entry.start)];
    if (!day) return;
    day.volumen += Number(entry.amount || 0);
    day.anzahl += 1;
  });
  return days.map((day) => ({ ...day, volumen: Math.round(day.volumen) }));
}

function diaperData(entries, locale) {
  const days = lastSevenDays(locale).map((day) => ({ ...day, nass: 0, fest: 0, beides: 0, hygiene: 0, gesamt: 0 }));
  const byKey = Object.fromEntries(days.map((day) => [day.key, day]));
  entries.forEach((entry) => {
    const day = byKey[dateKey(entry.time)];
    if (!day) return;
    if (entry.wet && entry.solid) day.beides += 1;
    else if (entry.wet) day.nass += 1;
    else if (entry.solid) day.fest += 1;
    else day.hygiene += 1;
    day.gesamt += 1;
  });
  return days;
}

function tummyData(entries, locale) {
  const days = lastSevenDays(locale).map((day) => ({ ...day, minuten: 0, anzahl: 0 }));
  const byKey = Object.fromEntries(days.map((day) => [day.key, day]));
  entries.forEach((entry) => {
    const day = byKey[dateKey(entry.start)];
    if (!day) return;
    day.minuten += parseDuration(entry.duration) * 60;
    day.anzahl += 1;
  });
  return days.map((day) => ({ ...day, minuten: Math.round(day.minuten) }));
}

function windowLabel(start, end, locale) {
  const options = { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: getTimeFormat() === "12h" };
  return `${start.toLocaleString(locale, options)}–${end.toLocaleString(locale, options)}`;
}

export default function AnalyticsTab({ childId, hiddenCards = [], cardOrder = [], weights = [], heights = [], bmis = [], weeklyFeedings, weeklySleep, weeklyChanges, weeklyTummyTimes, temperatures, monthlyFeedings, monthlySleep, monthlyChanges }) {
  const t = useTranslation();
  const locale = getLocale();
  const units = useUnits();
  const [sleepMode, setSleepMode] = useState("total");
  const [sleepPeriodMode, setSleepPeriodMode] = useState("rolling");
  const [breastChartMode, setBreastChartMode] = useState(() => { try { return localStorage.getItem("bbd_breast_chart_mode") || "count"; } catch { return "count"; } });
  const updateBreastChartMode = (mode) => { setBreastChartMode(mode); try { localStorage.setItem("bbd_breast_chart_mode", mode); } catch { /* preference remains active for this session */ } };
  const rollingSleep = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const end = new Date(Date.now() - index * 24 * 3600000);
    const start = new Date(end.getTime() - 24 * 3600000);
    return {
      day: end.toLocaleDateString(locale, { weekday: "short" }),
      period: windowLabel(start, end, locale),
      minuten: sleepWindowMinutes(weeklySleep, start, end, sleepMode),
    };
  }).reverse(), [weeklySleep, sleepMode, locale]);
  const calendarSleep = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - index));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { day: start.toLocaleDateString(locale, { weekday: "short" }), period: windowLabel(start, end, locale), minuten: sleepWindowMinutes(weeklySleep, start, end, sleepMode) };
  }), [weeklySleep, sleepMode, locale]);
  const shownSleep = sleepPeriodMode === "calendar" ? calendarSleep : rollingSleep;
  useEffect(() => { if (childId) api.getLocalSettings(childId).then((value) => setSleepPeriodMode(value.analytics_sleep_period_mode || "rolling")).catch(() => {}); }, [childId]);
  const updateSleepPeriodMode = (mode) => { setSleepPeriodMode(mode); if (childId) api.updateLocalSettings(childId, { analytics_sleep_period_mode: mode }).catch(() => {}); };
  const breasts = useMemo(() => breastData(weeklyFeedings, locale), [weeklyFeedings, locale]);
  const bottles = useMemo(() => bottleData(weeklyFeedings, locale), [weeklyFeedings, locale]);
  const diapers = useMemo(() => diaperData(weeklyChanges, locale), [weeklyChanges, locale]);
  const tummy = useMemo(() => tummyData(weeklyTummyTimes, locale), [weeklyTummyTimes, locale]);
  const temperatureData = useMemo(() => temperatures.slice().reverse().map((entry) => ({ zeit: new Date(entry.time || entry.date).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short" }), tooltip: new Date(entry.time || entry.date).toLocaleString(locale), temperatur: Math.round(Number(entry.temperature) * 10) / 10 })), [temperatures, locale]);
  const chartBottles = useMemo(() => bottles.slice().reverse(), [bottles]);
  const chartTummy = useMemo(() => tummy.slice().reverse(), [tummy]);
  const breastMinutes = breasts.reduce((sum, day) => sum + day.links + day.rechts, 0);
  const breastCount = breasts.reduce((sum, day) => sum + day.count, 0);
  const feedingDays = useMemo(() => dailyFeedingTotals(monthlyFeedings || []).filter((day) => day.count > 0), [monthlyFeedings]);
  const sleepDays = useMemo(() => dailySleepTotals(monthlySleep || []).filter((day) => day.hours > 0), [monthlySleep]);
  const diaperDays = useMemo(() => dailyDiaperTotals(monthlyChanges || []).filter((day) => day.count > 0), [monthlyChanges]);
  const averageFeeds = feedingDays.length ? Math.round(feedingDays.reduce((sum, day) => sum + day.count, 0) / feedingDays.length) : null;
  const averageFeedDuration = feedingDays.length ? Math.round(feedingDays.reduce((sum, day) => sum + day.duration, 0) / feedingDays.length) : null;
  const averageSleep = sleepDays.length ? sleepDays.reduce((sum, day) => sum + day.hours, 0) / sleepDays.length : null;
  const averageDiapers = diaperDays.length ? Math.round(diaperDays.reduce((sum, day) => sum + day.count, 0) / diaperDays.length) : null;
  const averageGap = averageFeedingGapMs(monthlyFeedings || []);
  const averageBreastDuration = averageBreastFeedingDurationMs(monthlyFeedings || []);
  const defaultOrder = ["summary", "sleep", "breast", "bottles", "diapers", "temperature", "tummy", "diaperCalculator"];
  const resolvedOrder = [...cardOrder.filter((id) => defaultOrder.includes(id)), ...defaultOrder.filter((id) => !cardOrder.includes(id))];
  const cardStyle = (id) => ({ order: resolvedOrder.indexOf(id) });

  return (
    <div className="analytics-grid fade-in">
      {!hiddenCards.includes("summary") && <div className="analytics-summary-grid" style={cardStyle("summary")}>
        <div className="analytics-summary-card" style={{ "--summary-color": colors.feeding }}><Icons.Bottle /><span>{t("plus.analytics.averageFeedings")}</span><strong>{averageFeeds ? `${averageFeeds}×` : "—"}</strong><small>{t("plus.analytics.perDay30")}</small>{averageGap && <em>~{formatElapsedHM(averageGap)} {t("plus.analytics.gap")}</em>}</div>
        <div className="analytics-summary-card" style={{ "--summary-color": colors.feeding }}><Icons.Bottle /><span>{t("plus.analytics.averageFeedingDuration")}</span><strong>{averageFeedDuration ? formatMinutes(averageFeedDuration) : "—"}</strong><small>{t("plus.analytics.perDay30")}</small>{averageBreastDuration && <em>~{formatElapsedHM(averageBreastDuration)} {t("plus.analytics.breastDuration")}</em>}</div>
        <div className="analytics-summary-card" style={{ "--summary-color": colors.sleep }}><Icons.Moon /><span>{t("plus.analytics.averageSleep")}</span><strong>{averageSleep ? formatMinutes(averageSleep * 60) : "—"}</strong><small>{t("plus.analytics.perDay30")}</small></div>
        <div className="analytics-summary-card" style={{ "--summary-color": colors.diaper }}><Icons.Droplet /><span>{t("plus.analytics.averageDiapers")}</span><strong>{averageDiapers ? `${averageDiapers}×` : "—"}</strong><small>{t("plus.analytics.perDay30")}</small></div>
      </div>}
      {!hiddenCards.includes("sleep") && <SectionCard style={cardStyle("sleep")} title={sleepPeriodMode === "calendar" ? t("plus.analytics.calendarSleep") : t("plus.analytics.rollingSleep")} icon={<Icons.Moon />} color={colors.sleep} actions={<SleepPeriodMenu value={sleepPeriodMode} onChange={updateSleepPeriodMode} t={t} />}>
        <div className="segmented-control">
          {[{ id: "day", label: t("plus.analytics.daySleep") }, { id: "night", label: t("plus.analytics.nightSleep") }, { id: "total", label: t("plus.analytics.totalSleep") }].map((item) => <button key={item.id} className={sleepMode === item.id ? "selected" : ""} onClick={() => setSleepMode(item.id)}>{item.label}</button>)}
        </div>
        <div className="chart-height-medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={shownSleep}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `${Math.round(value / 60)} h`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.period || ""} formatter={(value) => [formatMinutes(value), t("plus.analytics.sleep")]} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)" }} /><Bar dataKey="minuten" fill={colors.sleep} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <div className="summary-chips sleep-summary-chips">{shownSleep.map((item) => <span key={item.period}><strong>{item.period}</strong>{formatMinutes(item.minuten)}</span>)}</div>
      </SectionCard>}

      {!hiddenCards.includes("breast") && <SectionCard style={cardStyle("breast")} title={t("plus.analytics.breastfeedingWeek")} icon={<Icons.Bottle />} color={colors.feeding} actions={<ChartModeMenu value={breastChartMode} onChange={updateBreastChartMode} t={t} />}>
        <p className="chart-summary"><strong>{breastChartMode === "duration" ? formatMinutes(breastMinutes) : t("plus.analytics.breastFeedings", { count: breastCount })}</strong>{breastChartMode === "duration" ? ` ${t("plus.analytics.inBreastFeedings", { count: breastCount })}` : ` ${t("plus.analytics.inSevenDays")}`}</p>
        <SplitWeekRows days={breasts} type="breast" mode={breastChartMode} t={t} />
      </SectionCard>}

      {!hiddenCards.includes("bottles") && <SectionCard style={cardStyle("bottles")} title={t("plus.analytics.bottlesWeek")} icon={<Icons.Bottle />} color="#22C55E">
        <div className="chart-height-medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartBottles}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis yAxisId="volume" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.tooltip || ""} formatter={(value, name) => [value, name === "volumen" ? units.volume : t("plus.analytics.count")]} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)" }} /><Legend formatter={(value) => value === "volumen" ? `${t("plus.analytics.volume")} (${units.volume})` : t("plus.analytics.count")} /><Bar yAxisId="volume" dataKey="volumen" fill="#22C55E" radius={[6, 6, 0, 0]} /><Bar yAxisId="count" dataKey="anzahl" fill="#86EFAC" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </SectionCard>}

      {!hiddenCards.includes("diapers") && <SectionCard style={cardStyle("diapers")} title={t("plus.analytics.diapersWeek")} icon={<Icons.Droplet />} color={colors.diaper}>
        <SplitWeekRows days={diapers} type="diaper" t={t} />
      </SectionCard>}

      {!hiddenCards.includes("temperature") && <SectionCard style={cardStyle("temperature")} title={t("plus.analytics.temperature")} icon={<Icons.Temp />} color={colors.temp}>
        {temperatureData.length ? <div className="chart-height-medium"><ResponsiveContainer width="100%" height="100%"><LineChart data={temperatureData}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="zeit" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" /><YAxis domain={["dataMin - 0.3", "dataMax + 0.3"]} tickFormatter={(value) => `${Number(value).toFixed(1)}°`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.tooltip || ""} formatter={(value) => [`${Number(value).toFixed(1)} °C`, t("plus.analytics.temperatureValue")]} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)" }} /><Line type="monotone" dataKey="temperatur" stroke={colors.temp} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div> : <div className="empty-compact">{t("plus.analytics.noTemperature")}</div>}
      </SectionCard>}

      {!hiddenCards.includes("tummy") && <SectionCard style={cardStyle("tummy")} title={t("plus.analytics.tummyWeek")} icon={<Icons.Sun />} color={colors.tummy}>
        <div className="chart-height-medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartTummy}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.tooltip || ""} formatter={(value) => [formatMinutes(value), t("plus.analytics.tummyTime")]} contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)" }} /><Bar dataKey="minuten" fill={colors.tummy} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </SectionCard>}
      {!hiddenCards.includes("diaperCalculator") && <DiaperSizeCalculator childId={childId} weights={weights} heights={heights} bmis={bmis} changes={monthlyChanges} style={cardStyle("diaperCalculator")} />}
    </div>
  );
}
