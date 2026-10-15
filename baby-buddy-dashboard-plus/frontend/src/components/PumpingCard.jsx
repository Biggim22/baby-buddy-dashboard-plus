import { useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import PumpingForm from "./forms/PumpingForm";
import { Icons } from "./Icons";
import { colors } from "../utils/colors";
import { formatDuration } from "../utils/formatters";
import { pumpingSideFromTags } from "../utils/pumping";
import { getLocale, getTimeFormat, useTranslation } from "../locales";

export default function PumpingCard({ childId, entries = [], style, onDataChanged }) {
  const t = useTranslation();
  // null = closed, {} = new entry, { entry } = edit
  const [form, setForm] = useState(null);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [entries]);
  const done = async () => { setForm(null); await onDataChanged?.(); };
  return (
    <>
      <SectionCard style={style} title={t("plus.pumping.title")} icon={<Icons.Bottle />} color={colors.pumping} actions={<button className="secondary-inline" onClick={() => setForm({})}>{t("plus.pumping.add")}</button>}>
        <p className="chart-summary"><strong>{total} mL</strong> · {t("plus.pumping.weekly", { count: entries.length })}</p>
        {entries.length ? (
          <div className="preview-list">
            {entries.slice(0, 7).map((entry) => {
              const side = pumpingSideFromTags(entry.tags);
              return (
                <div className="preview-row" key={entry.id}>
                  <button type="button" className="preview-row-main" onClick={() => setForm({ entry })}>
                    <strong>{entry.amount} mL{side ? ` · ${t(`plus.pumping.sides.${side}`)}` : ""}</strong>
                    <span>{new Date(entry.start).toLocaleString(getLocale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: getTimeFormat() === "12h" })}{entry.duration ? ` · ${formatDuration(entry.duration)}` : ""}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : <div className="empty-state">{t("plus.pumping.none")}</div>}
      </SectionCard>
      {form && <PumpingForm childId={childId} entry={form.entry} onDone={done} onClose={() => setForm(null)} />}
    </>
  );
}
