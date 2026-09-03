import { useState } from "react";
import MeasurementsReportModal from "../components/MeasurementsReportModal";
import GrowthTrendChart from "../components/GrowthTrendChart";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { useUnits } from "../utils/units";
import { clickableProps } from "../utils/a11y";
import { useTranslation, getLocale } from "../locales";

function MeasurementCard({ icon, color, label, value, date, onClick }) {
  return (
    <div className="fade-in">
      <div className="entry-clickable" {...clickableProps(onClick)} style={{ background: "var(--card-bg)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{value ?? "—"}</div>
        {date && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{new Date(date).toLocaleDateString(getLocale())}</div>}
      </div>
    </div>
  );
}

export default function GrowthTab({ childId, hiddenCards = [], cardOrder = [], birthDate, childSex, weights, heights, headCircumferences, bmis, onEditEntry }) {
  const t = useTranslation();
  const units = useUnits();
  const [showMeasureReport, setShowMeasureReport] = useState(false);
  const latestWeight = weights[0];
  const latestHeight = heights[0];
  const latestHeadCircumference = headCircumferences[0];
  const latestBmi = bmis[0];
  const openReport = () => setShowMeasureReport(true);
  const orderOf = (id) => { const index = cardOrder.indexOf(id); return index < 0 ? 99 : index; };

  return (
    <div className="analytics-grid fade-in">
      {!hiddenCards.includes("summary") && <div className="stats-grid" style={{ order: orderOf("summary") }}>
        <MeasurementCard icon={<Icons.Weight />} color={colors.growth} label={t("growth.weight")} value={latestWeight ? `${latestWeight.weight} ${units.weight}` : null} date={latestWeight?.date} onClick={openReport} />
        <MeasurementCard icon={<Icons.Ruler />} color={colors.height} label={t("growth.height")} value={latestHeight ? `${latestHeight.height} ${units.length}` : null} date={latestHeight?.date} onClick={openReport} />
        <MeasurementCard icon={<Icons.HeadCircle />} color={colors.headCircumference} label={t("growth.headCircumference")} value={latestHeadCircumference ? `${latestHeadCircumference.head_circumference} ${units.length}` : null} date={latestHeadCircumference?.date} onClick={openReport} />
        <MeasurementCard icon={<Icons.Gauge />} color={colors.bmi} label={t("growth.bmi")} value={latestBmi?.bmi} date={latestBmi?.date} onClick={openReport} />
      </div>}

      <div className="growth-card-contents">
        {!hiddenCards.includes("weight") && <div className="fade-in" style={{ order: orderOf("weight") }}><GrowthTrendChart title={t("growth.weightTrend")} icon={<Icons.Weight />} color={colors.growth} metric="weight" entries={weights} valueKey="weight" unit={units.weight} birthDate={birthDate} childSex={childSex} onEditEntry={onEditEntry} /></div>}
        {!hiddenCards.includes("height") && <div className="fade-in" style={{ order: orderOf("height") }}><GrowthTrendChart title={t("growth.heightTrend")} icon={<Icons.Ruler />} color={colors.height} metric="height" entries={heights} valueKey="height" unit={units.length} birthDate={birthDate} childSex={childSex} onEditEntry={onEditEntry} /></div>}
        {!hiddenCards.includes("head") && <div className="fade-in" style={{ order: orderOf("head") }}><GrowthTrendChart title={t("growth.headCircumferenceTrend")} icon={<Icons.HeadCircle />} color={colors.headCircumference} metric="headCircumference" entries={headCircumferences} valueKey="head_circumference" unit={units.length} birthDate={birthDate} childSex={childSex} onEditEntry={onEditEntry} /></div>}
        {!hiddenCards.includes("bmi") && <div className="fade-in" style={{ order: orderOf("bmi") }}><GrowthTrendChart title={t("growth.bmiTrend")} icon={<Icons.Gauge />} color={colors.bmi} metric="bmi" entries={bmis} valueKey="bmi" unit="" birthDate={birthDate} childSex={childSex} onEditEntry={onEditEntry} /></div>}
      </div>

      {showMeasureReport && <MeasurementsReportModal weights={weights} heights={heights} headCircumferences={headCircumferences} bmis={bmis} onClose={() => setShowMeasureReport(false)} />}
    </div>
  );
}
