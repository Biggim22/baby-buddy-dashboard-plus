import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import Modal, { FormField, FormSelect, FormInput, FormButton, FormError } from "../Modal";
import DeleteButton from "../DeleteButton";
import { colors } from "../../utils/colors";
import { useUnits } from "../../utils/units";
import { logError } from "../../utils/errorLog";
import { useTranslation } from "../../locales";
import { formatElapsedHM, localDatetimeDurationMs, parseLocalizedNumber, toApiDatetime } from "../../utils/formatters";

const LONG_FEEDING_MS = 4 * 60 * 60 * 1000;

function toLocalDatetime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function FeedingForm({ childId, timerId, entry, initialValues, onDone, onClose }) {
  const t = useTranslation();
  const units = useUnits();
  const isEdit = !!entry;

  const TYPES = [
    { value: "breast milk", label: t("feedingForm.types.breastMilk") },
    { value: "formula", label: t("feedingForm.types.formula") },
    { value: "fortified breast milk", label: t("feedingForm.types.fortifiedBreastMilk") },
    { value: "solid food", label: t("feedingForm.types.solidFood") },
  ];

  const METHODS = [
    { value: "bottle", label: t("feedingForm.methods.bottle") },
    { value: "left breast", label: t("feedingForm.methods.leftBreast") },
    { value: "right breast", label: t("feedingForm.methods.rightBreast") },
    { value: "both breasts", label: t("feedingForm.methods.bothBreasts") },
    { value: "parent fed", label: t("feedingForm.methods.parentFed") },
    { value: "self fed", label: t("feedingForm.methods.selfFed") },
  ];

  const now = new Date();
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const [type, setType] = useState(entry?.type || "breast milk");
  const [method, setMethod] = useState(entry?.method || "bottle");
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : "");
  const [start, setStart] = useState(toLocalDatetime(new Date(entry?.start || initialValues?.start || fifteenMinsAgo)));
  const [end, setEnd] = useState(toLocalDatetime(new Date(entry?.end || initialValues?.end || now)));
  const [notes, setNotes] = useState(entry?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const touched = useRef(false);
  useEffect(() => {
    let cancelled = false;
    touched.current = false;
    if (entry) { setType(entry.type); setMethod(entry.method); return; }
    setType("breast milk"); setMethod("bottle");
    if (childId) api.getLocalSettings(childId).then(settings => {
      if (cancelled || touched.current) return;
      if (TYPES.some(item => item.value === settings.last_feeding_type)) setType(settings.last_feeding_type);
      if (METHODS.some(item => item.value === settings.last_feeding_method)) setMethod(settings.last_feeding_method);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [childId, entry]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    touched.current = true;
    const amountValue = amount.trim() ? parseLocalizedNumber(amount) : null;
    if (amount.trim() && (amountValue == null || amountValue < 0)) {
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
        setError(t("common.endAfterStart"));
        return;
      }
      if (durationMs > LONG_FEEDING_MS && !window.confirm(t("common.confirmLongDuration", { type: t("action.feeding").toLowerCase(), duration: formatElapsedHM(durationMs) }))) return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = { type, method };
      if (amountValue != null) data.amount = amountValue;
      if (notes.trim()) data.notes = notes.trim();
      if (isEdit) {
        data.start = toApiDatetime(start);
        data.end = toApiDatetime(end);
        await api.updateFeeding(entry.id, data);
      } else {
        data.child = childId;
        if (timerId) {
          data.timer = timerId;
        } else {
          data.start = toApiDatetime(start);
          data.end = toApiDatetime(end);
        }
        await api.createFeeding(data);
      }
      onDone();
    } catch (err) {
      setSaving(false);
      setError(t("common.saveFailed"));
      logError(isEdit ? "Update Feeding" : "Save Feeding", err.message);
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await api.deleteFeeding(entry.id);
      onDone();
    } catch (err) {
      setError(t("common.deleteFailed"));
      logError("Delete Feeding", err.message);
    }
  };

  return (
    <Modal title={isEdit ? t("feedingForm.editTitle") : t("feedingForm.logTitle")} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {initialValues && <p className="form-hint">{t("timelineBackfillReview")}</p>}
        <FormField label={t("form.type")}>
          <FormSelect options={TYPES} value={type} onChange={(e) => { touched.current = true; setType(e.target.value); }} />
        </FormField>
        <FormField label={t("form.method")}>
          <FormSelect options={METHODS} value={method} onChange={(e) => { touched.current = true; setMethod(e.target.value); }} />
        </FormField>
        <FormField label={t("feedingForm.amount", { unit: units.volume })}>
        <FormInput type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("common.optional")} />
        </FormField>
        {(isEdit || !timerId) && (
          <>
            <FormField label={t("common.start")}>
              <FormInput
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </FormField>
            <FormField label={t("common.end")}>
              <FormInput
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </FormField>
          </>
        )}
        <FormField label={t("common.notes")}>
          <FormInput
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("common.optional")}
          />
        </FormField>
        <FormError message={error} />
        {isEdit && <DeleteButton onDelete={handleDelete} disabled={saving} />}
        <FormButton color={colors.feeding} disabled={saving}>
          {saving ? t("common.saving") : isEdit ? t("feedingForm.update") : t("feedingForm.save")}
        </FormButton>
      </form>
    </Modal>
  );
}
