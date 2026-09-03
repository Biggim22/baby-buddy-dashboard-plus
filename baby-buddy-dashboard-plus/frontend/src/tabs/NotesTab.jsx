import { useState } from "react";
import SectionCard from "../components/SectionCard";
import TimelineItem from "../components/TimelineItem";
import TemperatureCard from "../components/TemperatureCard";
import { Icons } from "../components/Icons";
import { colors } from "../utils/colors";
import { toNoteTimeline, toMedicationTimeline } from "../utils/formatters";
import { clickableProps } from "../utils/a11y";
import { useTranslation } from "../locales";

const COLLAPSED_COUNT = 5;
const COLLAPSED_COUNT_MEDS = 5;

function ProgressiveTimeline({ listKey, entries, expanded, setExpanded, render }) {
  const initial = listKey === "medications" ? COLLAPSED_COUNT_MEDS : COLLAPSED_COUNT;
  const revealed = expanded[listKey] || initial;
  const visible = revealed === Infinity ? entries : entries.slice(0, revealed);
  const canShowAll = revealed >= initial + 20 && revealed < entries.length;
  const canShowMore = revealed < entries.length && !canShowAll;
  return <div style={{ display: "flex", flexDirection: "column" }}>
    {visible.map(render)}
    {entries.length > initial && <div className="expand-actions">
      {canShowMore && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: revealed + 10 }))}>10 weitere anzeigen</button>}
      {canShowAll && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: Infinity }))}>Alles anzeigen</button>}
      {revealed > initial && revealed !== Infinity && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: initial }))}>Weniger anzeigen</button>}
      {revealed === Infinity && <button className="expand-toggle" onClick={() => setExpanded((current) => ({ ...current, [listKey]: initial }))}>Weniger anzeigen</button>}
    </div>}
  </div>;
}

export default function NotesTab({ childId, hiddenCards = [], cardOrder = [], demoMode, notes, medications, onEditEntry, onDataChanged }) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState({});
  const orderOf = (id) => { const index = cardOrder.indexOf(id); return index < 0 ? 99 : index; };

  const noteTimeline = toNoteTimeline(notes || []);
  const medicationTimeline = toMedicationTimeline(medications || []);

  return (
    <div className="analytics-grid fade-in">
      <div className="notes-card-contents">
      {!hiddenCards.includes("medications") && <div className="fade-in fade-in-1" style={{ order: orderOf("medications") }}>
        <SectionCard title={t("notes.medications")} icon={<Icons.Pill />} color={colors.medication}>
          {medicationTimeline.length > 0 ? (
            <ProgressiveTimeline listKey="medications" entries={medicationTimeline} expanded={expanded} setExpanded={setExpanded} render={(m, i, arr) => (
                <div key={i} className="entry-clickable" {...clickableProps(() => onEditEntry?.("medication", m.entry))}>
                  <TimelineItem
                    time={m.time}
                    label={m.label}
                    detail={m.detail}
                    color={colors.medication}
                    isLast={i === arr.length - 1}
                  />
                </div>
              )} />
          ) : (
            <div style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>
              {t("notes.noMedicationsLogged")}
            </div>
          )}
        </SectionCard>
      </div>}

      {!hiddenCards.includes("temperature") && <div className="fade-in fade-in-2" style={{ order: orderOf("temperature") }}>
        <TemperatureCard childId={childId} demoMode={demoMode} onEditEntry={onEditEntry} />
      </div>}
      </div>

      {!hiddenCards.includes("notes") && <div className="fade-in fade-in-3" style={{ marginTop: 16, order: orderOf("notes") }}>
        <SectionCard title={t("notes.notesTitle")} icon={<Icons.StickyNote />} color={colors.note}>
          {noteTimeline.length > 0 ? (
            <ProgressiveTimeline listKey="notes" entries={noteTimeline} expanded={expanded} setExpanded={setExpanded} render={(n, i, arr) => (
                <div
                  key={i}
                  className="entry-clickable"
                  {...clickableProps(() => onEditEntry?.("note", n.entry))}
                >
                  <TimelineItem
                    time={n.time}
                    label={n.text}
                    detail={n.ago}
                    color={colors.note}
                    isLast={i === arr.length - 1}
                  />
                </div>
              )} />
          ) : (
            <div style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center", padding: 40 }}>
              {t("notes.noNotesYet")}
            </div>
          )}
        </SectionCard>
      </div>}
    </div>
  );
}
