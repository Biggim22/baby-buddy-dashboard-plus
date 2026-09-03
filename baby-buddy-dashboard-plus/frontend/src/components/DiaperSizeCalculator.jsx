import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import SectionCard from "./SectionCard";
import { Icons } from "./Icons";
import { colors } from "../utils/colors";
import { getLocale, useTranslation } from "../locales";

const PAMPERS_RANGES = [
  { label: "1", min: 2, max: 5 }, { label: "2", min: 4, max: 8 },
  { label: "3", min: 6, max: 10 }, { label: "4", min: 9, max: 14 },
  { label: "4+", min: 10, max: 15 }, { label: "5", min: 11, max: 16 },
  { label: "5+", min: 12, max: 17 }, { label: "6", min: 13, max: 18 },
  { label: "6+", min: 14, max: 19 }, { label: "7", min: 15, max: null },
  { label: "8", min: 17, max: null },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}
function dayKey(value) { return new Date(value).toLocaleDateString("sv-SE"); }
function forecastDate(days) {
  if (!Number.isFinite(days)) return "";
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toLocaleDateString(getLocale(), { day: "2-digit", month: "2-digit", year: "numeric" });
}

function calculate({ weights, heights, bmis, changes, ranges, fit }) {
  const validWeights = (weights || []).map((entry) => ({ value: Number(entry.weight), date: new Date(entry.date) })).filter((entry) => Number.isFinite(entry.value) && !Number.isNaN(entry.date.getTime())).sort((a, b) => a.date - b.date);
  if (!validWeights.length) return { reason: "weight" };
  const latest = validWeights.at(-1);
  const normalizedRanges = [...ranges].filter((range) => range?.label && range.min != null).sort((a, b) => Number(a.min) - Number(b.min) || Number(a.max ?? Infinity) - Number(b.max ?? Infinity));
  const candidates = normalizedRanges.filter((range) => latest.value >= Number(range.min || 0) && (range.max == null || latest.value <= Number(range.max)));
  if (!candidates.length) return { reason: "range", weight: latest.value };

  const midpoint = (range) => range.max == null ? Number(range.min) + 3 : (Number(range.min) + Number(range.max)) / 2;
  let chosenIndex = candidates.reduce((best, range, index) => Math.abs(latest.value - midpoint(range)) < Math.abs(latest.value - midpoint(candidates[best])) ? index : best, 0);
  if (fit === "smaller") chosenIndex = Math.max(0, chosenIndex - 1);
  else if (fit === "larger") chosenIndex = Math.min(candidates.length - 1, chosenIndex + 1);
  else if (candidates.length > 1) {
    const finiteBmis = (bmis || []).map((entry) => Number(entry.bmi)).filter(Number.isFinite);
    const latestHeight = Number((heights || [])[0]?.height);
    const latestBmi = Number((bmis || [])[0]?.bmi) || (latestHeight > 0 ? latest.value / ((latestHeight / 100) ** 2) : null);
    const baselineBmi = quantile(finiteBmis, 0.5);
    const bodyTrend = latestBmi && baselineBmi ? latestBmi / baselineBmi : 1;
    const base = candidates[chosenIndex];
    const progress = base.max == null ? 0 : (latest.value - base.min) / Math.max(0.1, base.max - base.min);
    if (bodyTrend > 1.05 || progress >= 0.75) chosenIndex = Math.min(candidates.length - 1, chosenIndex + 1);
  }
  const chosen = candidates[chosenIndex];

  const growthRates = [];
  for (let index = 1; index < validWeights.length; index += 1) {
    const days = (validWeights[index].date - validWeights[index - 1].date) / 86400000;
    const rate = (validWeights[index].value - validWeights[index - 1].value) / days;
    if (days >= 2 && rate > 0 && rate <= 0.15) growthRates.push(rate);
  }
  const recentRates = growthRates.slice(-8);
  const slowGrowth = quantile(recentRates, 0.25);
  const expectedGrowth = quantile(recentRates, 0.5);
  const fastGrowth = quantile(recentRates, 0.75);

  const yesterday = new Date(); yesterday.setHours(0, 0, 0, 0);
  const start = new Date(yesterday); start.setDate(start.getDate() - 28);
  const changeDates = (changes || []).map((entry) => new Date(entry.time)).filter((date) => !Number.isNaN(date.getTime()) && date < yesterday).sort((a, b) => a - b);
  const coverageStart = changeDates.length && changeDates[0] > start ? new Date(changeDates[0]) : new Date(start);
  coverageStart.setHours(0, 0, 0, 0);
  const counts = new Map();
  for (let cursor = new Date(coverageStart); cursor < yesterday; cursor.setDate(cursor.getDate() + 1)) counts.set(dayKey(cursor), 0);
  (changes || []).forEach((entry) => { const key = dayKey(entry.time); if (counts.has(key)) counts.set(key, counts.get(key) + 1); });
  const daily = [...counts.values()];
  const nonEmptyDays = daily.filter((value) => value > 0).length;
  const usageLow = quantile(daily, 0.2);
  const usageExpected = quantile(daily, 0.5);
  const usageHigh = quantile(daily, 0.8);

  const rangeIndex = normalizedRanges.findIndex((range) => range === chosen);
  const next = normalizedRanges[rangeIndex + 1];
  const lowerTarget = next ? Math.max(latest.value, Number(next.min)) : chosen.max;
  const upperTarget = chosen.max;
  const expectedTarget = lowerTarget != null && upperTarget != null ? (lowerTarget + upperTarget) / 2 : upperTarget;
  const daysTo = (target, rate) => target == null || !rate ? null : clamp((target - latest.value) / rate, 0, 730);
  const lowerDays = daysTo(lowerTarget, fastGrowth);
  const expectedDays = daysTo(expectedTarget, expectedGrowth);
  const upperDays = daysTo(upperTarget, slowGrowth);
  const enoughData = recentRates.length >= 2 && nonEmptyDays >= 7 && upperTarget != null;
  return {
    weight: latest.value, weightDate: latest.date, candidates, chosen, next,
    growthRates: recentRates, daily, nonEmptyDays,
    usageLow, usageExpected, usageHigh,
    lowerDays, expectedDays, upperDays, enoughData,
    lowerCount: enoughData ? Math.max(0, Math.floor(lowerDays * usageLow)) : null,
    expectedCount: enoughData ? Math.max(0, Math.round(expectedDays * usageExpected)) : null,
    upperCount: enoughData ? Math.max(0, Math.ceil(upperDays * usageHigh)) : null,
  };
}

export default function DiaperSizeCalculator({ childId, weights, heights, bmis, changes, style }) {
  const t = useTranslation();
  const [settings, setSettings] = useState(null);
  useEffect(() => { if (childId) api.getLocalSettings(childId).then(setSettings).catch(() => setSettings(null)); }, [childId]);
  const ranges = settings?.diaper_size_profile === "custom" && Array.isArray(settings.diaper_size_ranges) && settings.diaper_size_ranges.length ? settings.diaper_size_ranges : PAMPERS_RANGES;
  const result = useMemo(() => calculate({ weights, heights, bmis, changes, ranges, fit: settings?.diaper_fit_preference || "auto" }), [weights, heights, bmis, changes, ranges, settings?.diaper_fit_preference]);
  if (!settings || !(settings.analytics_diaper_calculator_enabled === true || String(settings.analytics_diaper_calculator_enabled).toLowerCase() === "true")) return null;
  return <SectionCard title={t("plus.diaperCalculator.title")} icon={<Icons.Droplet />} color={colors.diaper} style={style}>
    {result.reason && <div className="empty-compact">{t(`plus.diaperCalculator.missing.${result.reason}`)}</div>}
    {!result.reason && <div className="diaper-calculator">
      <div className="diaper-recommendation"><span>{t("plus.diaperCalculator.recommended")}</span><strong>{t("plus.diaperCalculator.sizeValue", { size: result.chosen.label })}</strong><small>{result.weight.toFixed(2)} kg · {t("plus.diaperCalculator.fitsAlso", { sizes: result.candidates.map((item) => item.label).join(", ") })}</small></div>
      {result.enoughData ? <><div className="diaper-stock-range"><div><span>{t("plus.diaperCalculator.minimum")}</span><strong>{result.lowerCount}</strong><small>{forecastDate(result.lowerDays)}</small></div><div className="expected"><span>{t("plus.diaperCalculator.expected")}</span><strong>{result.expectedCount}</strong><small>{forecastDate(result.expectedDays)}</small></div><div><span>{t("plus.diaperCalculator.maximum")}</span><strong>{result.upperCount}</strong><small>{forecastDate(result.upperDays)}</small></div></div><p className="form-hint">{t("plus.diaperCalculator.projection", { days: result.daily.length, weights: result.growthRates.length + 1, low: result.usageLow.toFixed(1), high: result.usageHigh.toFixed(1) })}</p></> : <div className="diaper-data-warning">{t("plus.diaperCalculator.moreData", { days: result.nonEmptyDays, weights: result.growthRates.length + 1 })}</div>}
      <p className="form-hint">{t("plus.diaperCalculator.fitNotice")}</p>
    </div>}
  </SectionCard>;
}

export { calculate as calculateDiaperForecast, PAMPERS_RANGES };
