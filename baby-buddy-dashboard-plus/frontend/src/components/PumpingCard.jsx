import { useMemo, useState } from "react";
import { api } from "../api";
import Modal, { FormButton, FormError, FormField, FormInput } from "./Modal";
import SectionCard from "./SectionCard";
import { Icons } from "./Icons";
import { useTranslation } from "../locales";

const localInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function PumpingForm({ childId, onClose, onSaved }) {
  const t = useTranslation(); const end = new Date(); const start = new Date(end.getTime() - 15 * 60000);
  const [amount, setAmount] = useState(""); const [started, setStarted] = useState(localInput(start)); const [ended, setEnded] = useState(localInput(end)); const [notes, setNotes] = useState(""); const [error, setError] = useState("");
  const submit = async (event) => { event.preventDefault(); if (new Date(ended) <= new Date(started)) { setError(t("plus.pumping.invalidTime")); return; } try { await api.createPumping({ child: childId, amount: Number(String(amount).replace(",", ".")), start: new Date(started).toISOString(), end: new Date(ended).toISOString(), notes: notes.trim() }); await onSaved(); onClose(); } catch (err) { setError(err.message); } };
  return <Modal title={t("plus.pumping.add")} onClose={onClose}><form onSubmit={submit}><FormField label={t("plus.pumping.amount")}><FormInput type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FormField><FormField label={t("plus.pumping.start")}><FormInput type="datetime-local" value={started} onChange={(event) => setStarted(event.target.value)} required /></FormField><FormField label={t("plus.pumping.end")}><FormInput type="datetime-local" value={ended} onChange={(event) => setEnded(event.target.value)} required /></FormField><FormField label={t("plus.note")}><textarea className="preview-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField><FormError message={error} /><FormButton type="submit" color="#22C55E">{t("plus.save")}</FormButton></form></Modal>;
}

export default function PumpingCard({ childId, entries = [], style, onDataChanged }) {
  const t = useTranslation(); const [open, setOpen] = useState(false);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [entries]);
  return <><SectionCard style={style} title={t("plus.pumping.title")} icon={<Icons.Bottle />} color="#22C55E" actions={<button className="secondary-inline" onClick={() => setOpen(true)}>{t("plus.pumping.add")}</button>}><p className="chart-summary"><strong>{total} mL</strong> · {t("plus.pumping.weekly", { count: entries.length })}</p>{entries.length ? <div className="preview-list">{entries.slice(0, 7).map((entry) => <div className="preview-row" key={entry.id}><div><strong>{entry.amount} mL</strong><span>{new Date(entry.start).toLocaleString()}</span></div></div>)}</div> : <div className="empty-state">{t("plus.pumping.none")}</div>}</SectionCard>{open && <PumpingForm childId={childId} onClose={() => setOpen(false)} onSaved={onDataChanged} />}</>;
}
