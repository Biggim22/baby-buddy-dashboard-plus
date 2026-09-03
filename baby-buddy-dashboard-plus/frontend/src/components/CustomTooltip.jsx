import { useUnits } from "../utils/units";
import { useTranslation } from "../locales";

function formatDuration(value) {
  const minutes = Math.round(Number(value) || 0);
  if (minutes < 60) return `${minutes} Min.`;
  return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

export default function CustomTooltip({ active, payload, label, labelFormatter }) {
  const units = useUnits();
  const t = useTranslation();
  if (!active || !payload?.length) return null;
  const formattedLabel = labelFormatter ? labelFormatter(label) : label;
  return (
    <div
      style={{
        background: "var(--tooltip-bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--text)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{formattedLabel}</div>
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.color,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: p.color,
              display: "inline-block",
            }}
          />
          {t(`chartMetric.${p.name}`)}: {p.name === "duration" ? formatDuration(p.value) : p.value}
          {p.name === "amount" ? ` ${units.volume}` : p.name === "minutes" ? ` ${t("common.min")}` : p.name === "weight" ? ` ${units.weight}` : p.name === "height" ? ` ${units.length}` : ""}
        </div>
      ))}
    </div>
  );
}
