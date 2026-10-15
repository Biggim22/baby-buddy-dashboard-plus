import { useState } from "react";
import { api } from "../../api";
import Modal, { FormField, FormSelect, FormInput, FormButton, FormError } from "../Modal";
import DeleteButton from "../DeleteButton";
import { colors } from "../../utils/colors";
import { logError } from "../../utils/errorLog";
import { useTranslation } from "../../locales";
import { formatElapsedHM, localDatetimeDurationMs, parseLocalizedNumber, toApiDatetime } from "../../utils/formatters";
import { PUMPING_SIDES, pumpingSideFromTags, tagsWithPumpingSide } from "../../utils/pumping";

const LONG_PUMPING_MS = 2 * 60 * 60 * 1000;

function toLocalDatetime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function PumpingForm({ childId, timerId, entry, onDone, onClose }) {
  const t = useTranslation();
  const isEdit = !!entry;
  const SIDES = PUMPING_SIDES.map((value) => ({ value, label: t(`plus.pumping.sides.${value}`) }));

  const now = new Date();
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const [side, setSide] = useState((isEdit ? pumpingSideFromTags(entry.tags) : null) || "both");
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : "");
  const [start, setStart] = useState(entry?.start ? toLocalDatetime(new Date(entry.start)) : toLocalDatetime(fifteenMinsAgo));
  const [end, setEnd] = useState(entry?.end ? toLocalDatetime(new Date(entry.end)) : toLocalDatetime(now));
  const [notes, setNotes] = useState(entry?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountValue = parseLocalizedNumber(amount);
    if (amountValue == null || amountValue < 0) {
      setError(t("common.invalidNumber"));
      return;
    }
    if (isEdit || !timerId) {
      let durationMs;
      try {
        durationMs = localDatetimeDurationMs(start, end);
      } catch {
        setError(t("common.invalidDateTime"));
        return;
      }
      if (durationMs <= 0) {
        setError(t("plus.pumping.invalidTime"));
        return;
      }
      if (durationMs > LONG_PUMPING_MS && !window.confirm(t("common.confirmLongDuration", { type: t("plus.pumping.action").toLowerCase(), duration: formatElapsedHM(durationMs) }))) return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = { amount: amountValue, notes: notes.trim(), tags: tagsWithPumpingSide(entry?.tags, side) };
      if (isEdit) {
        data.start = toApiDatetime(start);
        data.end = toApiDatetime(end);
        await api.updatePumping(entry.id, data);
      } else {
        data.child = childId;
        if (timerId) {
          data.timer = timerId;
        } else {
          data.start = toApiDatetime(start);
          data.end = toApiDatetime(end);
        }
        await api.createPumping(data);
      }
      await onDone();
    } catch (err) {
      setSaving(false);
      setError(t("common.saveFailed"));
      logError(isEdit ? "Update Pumping" : "Save Pumping", err.message);
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await api.deletePumping(entry.id);
      await onDone();
    } catch (err) {
      setError(t("common.deleteFailed"));
      logError("Delete Pumping", err.message);
    }
  };

  return (
    <Modal title={isEdit ? t("plus.pumping.edit") : t("plus.pumping.add")} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label={t("plus.pumping.side")}>
          <FormSelect options={SIDES} value={side} onChange={(e) => setSide(e.target.value)} />
        </FormField>
        <FormField label={t("plus.pumping.amount")}>
          <FormInput type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </FormField>
        {(isEdit || !timerId) && (
          <>
            <FormField label={t("plus.pumping.start")}>
              <FormInput type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
            </FormField>
            <FormField label={t("plus.pumping.end")}>
              <FormInput type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </FormField>
          </>
        )}
        <FormField label={t("common.notes")}>
          <FormInput type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("common.optional")} />
        </FormField>
        <FormError message={error} />
        {isEdit && <DeleteButton onDelete={handleDelete} disabled={saving} />}
        <FormButton color={colors.pumping} disabled={saving}>
          {saving ? t("common.saving") : isEdit ? t("plus.pumping.update") : t("plus.save")}
        </FormButton>
      </form>
    </Modal>
  );
}
