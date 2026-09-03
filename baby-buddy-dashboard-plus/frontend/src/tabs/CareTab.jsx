import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Icons } from "../components/Icons";
import Modal, {
  FormButton,
  FormField,
  FormInput,
  FormSelect,
} from "../components/Modal";
import SectionCard from "../components/SectionCard";
import SettingsTab from "./SettingsTab";
import DeleteButton from "../components/DeleteButton";
import { useTranslation } from "../locales";
import { toApiDatetime } from "../utils/formatters";

const CARE_TYPES = ["bath", "full_wash", "quick_wash", "caraway_suppository", "caraway_oil", "nail_care", "skin_care", "custom"];

function getCareLabels(t) {
  return Object.fromEntries(CARE_TYPES.map((type) => [type, t(`plus.careTypes.${type}`)]));
}

function localDatetime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function CareForm({ childId, entry, onClose, onSaved }) {
  const t = useTranslation();
  const labels = getCareLabels(t);
  const types = CARE_TYPES.map((value) => ({ value, label: labels[value] }));
  const [type, setType] = useState(entry?.care_type || "bath");
  const [category, setCategory] = useState(entry?.category_label || "");
  const [time, setTime] = useState(localDatetime(entry?.time));
  const [notes, setNotes] = useState(entry?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (type === "custom" && !category.trim()) {
      setError(t("plus.careCustomRequired"));
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      child_id: childId,
      care_type: type,
      category_label: type === "custom" ? category.trim() : "",
      time: toApiDatetime(time),
      notes: notes.trim(),
    };
    try {
      if (entry) await api.updateCare(entry.id, payload);
      else await api.createCare(payload);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteCare(entry.id);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={entry ? t("plus.editCare") : t("plus.addCare")} onClose={onClose}>
      <form onSubmit={submit}>
        <FormField label={t("plus.category")}>
          <FormSelect value={type} onChange={(event) => setType(event.target.value)} options={types} />
        </FormField>
        {type === "custom" && (
          <FormField label={t("plus.customCategory")}>
            <FormInput
              value={category}
              maxLength={120}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t("plus.customCategoryPlaceholder")}
              autoFocus
            />
          </FormField>
        )}
        <FormField label={t("plus.time")}>
          <FormInput type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} required />
        </FormField>
        <FormField label={t("plus.note")}>
          <textarea className="preview-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </FormField>
        {error && <div className="preview-error">{error}</div>}
        {entry && <DeleteButton onDelete={remove} disabled={saving} />}
        <FormButton type="submit" color="#06B6D4" disabled={saving}>
          {saving ? t("plus.saving") : t("plus.save")}
        </FormButton>
      </form>
    </Modal>
  );
}

export default function CareTab({ childId, hiddenCards = [], cardOrder = [], autoOpen = false, onAutoOpenHandled }) {
  const t = useTranslation();
  const labels = getCareLabels(t);
  const [entries, setEntries] = useState([]);
  const [editing, setEditing] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const orderOf = (id) => { const index = cardOrder.indexOf(id); return index < 0 ? 99 : index; };

  useEffect(() => {
    if (autoOpen) { setEditing(null); onAutoOpenHandled?.(); }
  }, [autoOpen, onAutoOpenHandled]);

  const load = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      await api.bootstrapLocal(childId);
      const [response, localSettings] = await Promise.all([api.getCare(childId), api.getLocalSettings(childId)]);
      setEntries(response.results || []);
      setSettings(localSettings || {});
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => void load(), [load]);

  const careStats = useMemo(() => {
    const latest = (types) => entries.find((entry) => types.includes(entry.care_type));
    // A more complete wash also counts as each less extensive level.
    return { latestBath: latest(["bath"]), latestFullWash: latest(["bath", "full_wash"]), latestQuickWash: latest(["bath", "full_wash", "quick_wash"]), latestCare: entries[0] };
  }, [entries]);

  const headerCards = useMemo(() => {
    const selected = Array.isArray(settings.care_header_types) && settings.care_header_types.length
      ? settings.care_header_types
      : ["bath", "full_wash", "quick_wash"];
    const matchingTypes = {
      bath: ["bath"],
      full_wash: ["bath", "full_wash"],
      quick_wash: ["bath", "full_wash", "quick_wash"],
    };
    return selected.map((type) => ({
      type,
      entry: entries.find((entry) => (matchingTypes[type] || [type]).includes(entry.care_type)),
    }));
  }, [entries, settings.care_header_types]);

  const ago = (value) => {
    if (!value) return t("plus.notRecorded");
    const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
    return days < 1 ? t("plus.careToday") : t("plus.careDaysAgo", { days });
  };

  return (
    <div className="fade-in care-preview-layout">
      <div className="preview-toolbar">
        <div>
          <strong>{t("plus.care")}</strong>
          <span>{t("plus.careDescription")}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button className="tab-settings-button" onClick={() => setShowSettings(true)} aria-label={t("plus.careSettings")} title={t("plus.careSettings")}><Icons.Settings /></button><button className="primary-inline" onClick={() => setEditing(null)}>{t("plus.addCare")}</button></div>
      </div>
      {!hiddenCards.includes("summary") && <div className="care-summary-grid" style={{ order: orderOf("summary") }}>
        {headerCards.map(({ type, entry }) => <div className="care-summary-card" key={type}>
          <span>{t("plus.lastCare", { category: labels[type] || type })}</span>
          <strong>{ago(entry?.time)}</strong>
          <small>{entry ? `${labels[entry.care_type] || entry.care_type} · ${new Date(entry.time).toLocaleString()}` : type === "bath" ? t("plus.bathReminderAfter", { days: settings.bath_reminder_days || 7 }) : t("plus.notRecorded")}</small>
        </div>)}
      </div>}
      {!hiddenCards.includes("history") && <SectionCard style={{ order: orderOf("history") }} title={t("plus.careHistory")} icon={<Icons.Heart />} color="#06B6D4">
        {loading && <div className="empty-state">{t("plus.loading")}</div>}
        {error && <div className="preview-error">{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div className="empty-state">{t("plus.noCare")}</div>
        )}
        <div className="preview-list">
          {entries.map((entry) => (
            <div className="preview-row" key={entry.id}>
              <button className="preview-row-main" onClick={() => setEditing(entry)}>
                <strong>{entry.category_label || labels[entry.care_type] || entry.care_type}</strong>
                <span>{new Date(entry.time).toLocaleString()}{entry.notes ? ` · ${entry.notes}` : ""}</span>
              </button>
            </div>
          ))}
        </div>
      </SectionCard>}
      {editing !== undefined && (
        <CareForm childId={childId} entry={editing} onClose={() => setEditing(undefined)} onSaved={load} />
      )}
      {showSettings && <Modal title={t("plus.careSettings")} onClose={() => setShowSettings(false)}><SettingsTab childId={childId} scope="care" /></Modal>}
    </div>
  );
}
