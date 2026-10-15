import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Icons } from "../components/Icons";
import SectionCard from "../components/SectionCard";
import { setTimeFormat, useTranslation } from "../locales";
import { applyAppearance } from "../utils/appearance";
import { getTabCardGroups, orderCards } from "../utils/tabCards";
import { createPresetId, hasPresetNamed, MEDICATION_UNITS, normalizePresets } from "../utils/medicationPresets";

const CATEGORY_LABELS = {
  latest: "latest",
  feeding: "feeding",
  sleep: "sleep",
  diapers: "diapers",
  medication: "medication",
  tummy: "tummy",
};

const DEFAULTS = {
  language: "de",
  theme: "dark",
  accent: "amber",
  overview_sections: Object.keys(CATEGORY_LABELS),
  overview_hidden: [],
  overview_show_charts: false,
  overview_show_history: false,
  bath_reminder_days: 7,
  bath_reminder_time: "10:00",
  feeding_daily_metric: "duration",
  feeding_average_metric: "duration",
  time_format: "24h",
  care_header_types: ["bath", "full_wash", "quick_wash"],
  ha_care_allowed_types: [],
  ha_task_allowed_ids: [],
  ha_measurement_allowed_types: [],
  notification_targets: ["notify.notify"],
  media_player_targets: [],
  media_player_mode: "custom",
  calendar_entities: [],
  analytics_sleep_period_mode: "rolling",
  tab_hidden_cards: {},
  tab_card_order: {},
  medication_presets: [],
  analytics_diaper_calculator_enabled: false,
  diaper_size_profile: "pampers_de",
  diaper_size_ranges: [],
  diaper_fit_preference: "auto",
  appearance_schedule_enabled: false,
  appearance_schedule_start: "20:00",
  appearance_schedule_end: "06:00",
  appearance_schedule_theme: "dark",
  appearance_schedule_accent: "rose",
};

const CARE_HEADER_TYPES = ["bath", "full_wash", "quick_wash", "caraway_oil", "nail_care", "skin_care"];
const HA_CARE_TYPES = [...CARE_HEADER_TYPES, "custom"];

const PAMPERS_RANGES = [
  { label: "1", min: 2, max: 5 }, { label: "2", min: 4, max: 8 },
  { label: "3", min: 6, max: 10 }, { label: "4", min: 9, max: 14 },
  { label: "4+", min: 10, max: 15 }, { label: "5", min: 11, max: 16 },
  { label: "5+", min: 12, max: 17 }, { label: "6", min: 13, max: 18 },
  { label: "6+", min: 14, max: 19 }, { label: "7", min: 15, max: null },
  { label: "8", min: 17, max: null },
];

const SECTIONS = [
  ["appearance", "plus.settings.appearance"],
  ["overview", "plus.overview.settings"],
  ["cards", "plus.settings.cardsPerTab"],
  ["care", "plus.careSettings"],
  ["medications", "plus.medicationList.title"],
  ["diapers", "plus.diaperCalculator.title"],
  ["notifications", "plus.settings.notifications"],
  ["calendar", "plus.settings.calendar"],
  ["homeAssistant", "plus.settings.homeAssistantCare"],
];

const isTrue = (value) => value === true || String(value).toLowerCase() === "true";
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

function humanDate(value, t) {
  if (!value) return t("plus.settings.noBath");
  return new Date(value).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SettingsTab({ childId, embedded = false }) {
  const t = useTranslation();
  const [settings, setSettings] = useState(DEFAULTS);
  const [status, setStatus] = useState("");
  const [haTargets, setHaTargets] = useState({ notify: ["notify.notify"], media_players: [] });
  const [calendarTargets, setCalendarTargets] = useState([]);
  const [test, setTest] = useState(() => ({ title: "Baby Buddy Dashboard Plus", message: t("plus.displaySettings.testDefaultMessage") }));
  const [testStatus, setTestStatus] = useState("");
  const [pairing, setPairing] = useState(null);
  const [pairingStatus, setPairingStatus] = useState("");
  const [haTasks, setHaTasks] = useState([]);
  const [newMedication, setNewMedication] = useState("");

  const load = useCallback(async () => {
    if (!childId) return;
    try {
      await api.bootstrapLocal(childId);
      const [result, targets, calendars, tasks] = await Promise.all([
        api.getLocalSettings(childId),
        api.getHaTargets().catch(() => ({ notify: ["notify.notify"], media_players: [] })),
        api.getCalendarTargets().catch(() => ({ calendars: [] })),
        api.getTasks(childId).catch(() => ({ results: [] })),
      ]);
      setHaTasks((tasks.results || []).filter((task) => task.active && task.task_kind === "task"));
      setHaTargets(targets);
      setCalendarTargets(calendars.calendars || []);
      const savedOrder = Array.isArray(result.overview_sections)
        ? result.overview_sections.filter((section) => section in CATEGORY_LABELS)
        : [];
      const missing = Object.keys(CATEGORY_LABELS).filter((section) => !savedOrder.includes(section));
      const next = { ...DEFAULTS, ...result, overview_sections: [...savedOrder, ...missing] };
      next.overview_show_charts = result.overview_show_charts === true || String(result.overview_show_charts).toLowerCase() === "true";
      next.overview_show_history = isTrue(result.overview_show_history);
      next.appearance_schedule_enabled = result.appearance_schedule_enabled === true || String(result.appearance_schedule_enabled).toLowerCase() === "true";
      const careHeader = Array.isArray(result.care_header_types)
        ? result.care_header_types.filter((type) => CARE_HEADER_TYPES.includes(type))
        : [];
      next.care_header_types = careHeader.length ? careHeader : DEFAULTS.care_header_types;
      next.ha_care_allowed_types = Array.isArray(result.ha_care_allowed_types)
        ? result.ha_care_allowed_types.filter((type) => HA_CARE_TYPES.includes(type))
        : [];
      next.ha_task_allowed_ids = Array.isArray(result.ha_task_allowed_ids) ? result.ha_task_allowed_ids : [];
      next.ha_measurement_allowed_types = Array.isArray(result.ha_measurement_allowed_types) ? result.ha_measurement_allowed_types : [];
      next.tab_hidden_cards = asObject(result.tab_hidden_cards);
      next.tab_card_order = asObject(result.tab_card_order);
      next.medication_presets = normalizePresets(result.medication_presets);
      next.analytics_diaper_calculator_enabled = isTrue(result.analytics_diaper_calculator_enabled);
      next.diaper_size_ranges = Array.isArray(result.diaper_size_ranges) && result.diaper_size_ranges.length ? result.diaper_size_ranges : PAMPERS_RANGES;
      setSettings(next);
      applyAppearance(next);
      setStatus("");
    } catch (err) {
      setStatus(err.message);
    }
  }, [childId]);

  useEffect(() => { setPairing(null); setHaTasks([]); void load(); }, [load]);

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    applyAppearance(next);
  };

  const move = (index, direction) => {
    const order = [...settings.overview_sections];
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    update("overview_sections", order);
  };

  const toggle = (section) => {
    const hidden = new Set(settings.overview_hidden || []);
    hidden.has(section) ? hidden.delete(section) : hidden.add(section);
    update("overview_hidden", [...hidden]);
  };

  const toggleCareHeader = (type) => {
    const selected = new Set(settings.care_header_types || []);
    if (selected.has(type)) {
      if (selected.size === 1) return;
      selected.delete(type);
    } else {
      selected.add(type);
    }
    update("care_header_types", CARE_HEADER_TYPES.filter((value) => selected.has(value)));
  };

  const toggleHomeAssistantCareType = (type) => {
    const selected = new Set(settings.ha_care_allowed_types || []);
    selected.has(type) ? selected.delete(type) : selected.add(type);
    update("ha_care_allowed_types", HA_CARE_TYPES.filter((value) => selected.has(value)));
  };

  const toggleTarget = (key, value) => {
    const selected = new Set(settings[key] || []);
    selected.has(value) ? selected.delete(value) : selected.add(value);
    update(key, [...selected]);
  };

  const toggleTabCard = (tabId, cardId) => {
    const hidden = new Set(settings.tab_hidden_cards[tabId] || []);
    hidden.has(cardId) ? hidden.delete(cardId) : hidden.add(cardId);
    update("tab_hidden_cards", { ...settings.tab_hidden_cards, [tabId]: [...hidden] });
  };

  const moveTabCard = (tabId, cards, index, direction) => {
    const order = orderCards(cards, settings.tab_card_order[tabId]).map((card) => card.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    update("tab_card_order", { ...settings.tab_card_order, [tabId]: order });
  };

  const medications = settings.medication_presets;
  const setMedications = (next) => update("medication_presets", next);
  const updateMedication = (id, changes) => setMedications(medications.map((item) => item.id === id ? { ...item, ...changes } : item));
  const moveMedication = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= medications.length) return;
    const next = [...medications];
    [next[index], next[target]] = [next[target], next[index]];
    setMedications(next);
  };
  const newMedicationDuplicate = hasPresetNamed(medications, newMedication);
  const addMedication = () => {
    const name = newMedication.trim();
    if (!name || newMedicationDuplicate) return;
    setMedications([...medications, { id: createPresetId(medications), name, unit: "", hidden: false }]);
    setNewMedication("");
  };

  const updateRange = (index, key, value) => update("diaper_size_ranges", settings.diaper_size_ranges.map((range, itemIndex) => itemIndex === index ? { ...range, [key]: key === "label" ? value : value === "" ? null : Number(value) } : range));

  const jumpTo = (id) => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const save = async () => {
    setStatus(t("plus.saving"));
    try {
      const result = await api.updateLocalSettings(childId, {
        theme: settings.theme,
        accent: settings.accent,
        overview_sections: settings.overview_sections,
        overview_hidden: settings.overview_hidden,
        overview_show_charts: Boolean(settings.overview_show_charts),
        overview_show_history: Boolean(settings.overview_show_history),
        bath_reminder_days: Number(settings.bath_reminder_days),
        bath_reminder_time: settings.bath_reminder_time,
        feeding_daily_metric: settings.feeding_daily_metric,
        feeding_average_metric: settings.feeding_average_metric,
        time_format: settings.time_format,
        care_header_types: settings.care_header_types,
        ha_care_allowed_types: settings.ha_care_allowed_types,
        ha_task_allowed_ids: settings.ha_task_allowed_ids.filter((id) => haTasks.some((task) => task.id === id)),
        ha_measurement_allowed_types: settings.ha_measurement_allowed_types,
        notification_targets: settings.notification_targets,
        media_player_targets: settings.media_player_targets,
        media_player_mode: settings.media_player_mode,
        calendar_entities: settings.calendar_entities,
        analytics_sleep_period_mode: settings.analytics_sleep_period_mode,
        tab_hidden_cards: settings.tab_hidden_cards,
        tab_card_order: settings.tab_card_order,
        medication_presets: normalizePresets(settings.medication_presets),
        analytics_diaper_calculator_enabled: Boolean(settings.analytics_diaper_calculator_enabled),
        diaper_size_profile: settings.diaper_size_profile,
        diaper_size_ranges: settings.diaper_size_profile === "custom" ? settings.diaper_size_ranges : [],
        diaper_fit_preference: settings.diaper_fit_preference,
        appearance_schedule_enabled: Boolean(settings.appearance_schedule_enabled),
        appearance_schedule_start: settings.appearance_schedule_start,
        appearance_schedule_end: settings.appearance_schedule_end,
        appearance_schedule_theme: settings.appearance_schedule_theme,
        appearance_schedule_accent: settings.appearance_schedule_accent,
      });
      const saved = { ...settings, ...result };
      setSettings(saved);
      setTimeFormat(saved.time_format);
      window.dispatchEvent(new CustomEvent("baby-buddy-settings-updated", { detail: saved }));
      setStatus(t("plus.settings.saved"));
    } catch (err) {
      setStatus(err.message);
    }
  };

  const sendTest = async () => {
    setTestStatus(t("plus.settings.testing"));
    try {
      const result = await api.testNotification({
        child_id: childId,
        title: test.title,
        message: test.message,
        notification_targets: settings.notification_targets,
        media_player_targets: settings.media_player_targets,
        media_player_mode: settings.media_player_mode,
      });
      const details = (result.results || []).map((item) => `${item.ok ? "✓" : "✕"} ${item.target}${item.error ? `: ${item.error}` : ""}`).join(" · ");
      setTestStatus(details || t("plus.settings.noTestTarget"));
    } catch (err) {
      setTestStatus(err.message);
    }
  };

  const createPairing = async () => {
    setPairing(null);
    setPairingStatus(t("plus.settings.pairingCreating"));
    try {
      await api.updateLocalSettings(childId, {
        ha_care_allowed_types: settings.ha_care_allowed_types,
        ha_task_allowed_ids: settings.ha_task_allowed_ids.filter((id) => haTasks.some((task) => task.id === id)),
        ha_measurement_allowed_types: settings.ha_measurement_allowed_types,
      });
      const result = await api.createCarePairing(childId);
      setPairing(result);
      setPairingStatus("");
    } catch (err) {
      setPairingStatus(err.message);
    }
  };

  const themeOptions = <><option value="dark">{t("plus.settings.dark")}</option><option value="oled">{t("plus.nightAppearance.oled")}</option><option value="light">{t("plus.settings.light")}</option><option value="pastel">{t("plus.settings.pastel")}</option><option value="nord">Nord</option><option value="dracula">Dracula</option><option value="solarized">Solarized Light</option></>;
  const accentOptions = <><option value="amber">Amber</option><option value="mint">Mint</option><option value="blue">Blue</option><option value="rose">Rose</option><option value="violet">Violet</option></>;
  const section = (id, title, icon, color, children) => (
    <section id={`settings-${id}`} className="settings-section">
      <SectionCard title={title} icon={icon} color={color}><div className="settings-section-body">{children}</div></SectionCard>
    </section>
  );

  return (
    <div className={`${embedded ? "" : "fade-in "}settings-preview-layout`}>
      <nav className="settings-jump" aria-label={t("plus.settings.jumpTo")}>
        {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => jumpTo(id)}>{t(label)}</button>)}
      </nav>

      {section("appearance", t("plus.settings.appearance"), <Icons.Activity />, "#F59E0B", <>
        <div className="preview-form-grid">
          <label>{t("plus.settings.mode")}<select value={settings.theme} onChange={(event) => update("theme", event.target.value)}>{themeOptions}</select></label>
          <label>{t("plus.settings.colorScheme")}<select value={settings.accent} onChange={(event) => update("accent", event.target.value)}>{accentOptions}</select></label>
          <label>{t("plus.timeFormat")}<select value={settings.time_format} onChange={(event) => update("time_format", event.target.value)}><option value="24h">24-hour</option><option value="12h">12-hour</option></select></label>
        </div>
        <p className="form-hint">{t("plus.nightAppearance.hint")}</p>
        <div className="settings-subheading">{t("plus.settings.appearanceSchedule")}</div>
        <label className="preview-check"><input type="checkbox" checked={Boolean(settings.appearance_schedule_enabled)} onChange={(event) => update("appearance_schedule_enabled", event.target.checked)} /> {t("plus.settings.enableSchedule")}</label>
        <div className="preview-form-grid settings-two-columns">
          <label>{t("plus.settings.from")}<input type="time" value={settings.appearance_schedule_start} onChange={(event) => update("appearance_schedule_start", event.target.value)} /></label>
          <label>{t("plus.settings.until")}<input type="time" value={settings.appearance_schedule_end} onChange={(event) => update("appearance_schedule_end", event.target.value)} /></label>
          <label>{t("plus.settings.scheduledMode")}<select value={settings.appearance_schedule_theme} onChange={(event) => update("appearance_schedule_theme", event.target.value)}>{themeOptions}</select></label>
          <label>{t("plus.settings.scheduledColor")}<select value={settings.appearance_schedule_accent} onChange={(event) => update("appearance_schedule_accent", event.target.value)}>{accentOptions}</select></label>
        </div>
      </>)}

      {section("overview", t("plus.overview.settings"), <Icons.TrendUp />, "#8B5CF6", <>
        <label className="preview-check"><input type="checkbox" checked={!settings.overview_hidden.includes("tasks")} onChange={() => toggle("tasks")} /> {t("plus.settings.openTasksFirst")}</label>
        <label className="preview-check"><input type="checkbox" checked={Boolean(settings.overview_show_history)} onChange={(event) => update("overview_show_history", event.target.checked)} /> {t("plus.settings.overviewHistory")}</label>
        <label className="preview-check"><input type="checkbox" checked={Boolean(settings.overview_show_charts)} onChange={(event) => update("overview_show_charts", event.target.checked)} /> {t("plus.settings.overviewCharts")}</label>
        <div className="preview-list">
          {settings.overview_sections.map((key, index) => (
            <div className="preview-row" key={key}>
              <input type="checkbox" checked={!settings.overview_hidden.includes(key)} onChange={() => toggle(key)} aria-label={t(`plus.settings.categories.${CATEGORY_LABELS[key]}`)} />
              <strong className="preview-grow">{t(`plus.settings.categories.${CATEGORY_LABELS[key]}`)}</strong>
              <button disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("plus.settings.moveUp")}>↑</button>
              <button disabled={index === settings.overview_sections.length - 1} onClick={() => move(index, 1)} aria-label={t("plus.settings.moveDown")}>↓</button>
            </div>
          ))}
        </div>
      </>)}

      {section("cards", t("plus.settings.cardsPerTab"), <Icons.Clipboard />, "#64748B", <>
        <p className="form-hint">{t("plus.settings.cardsPerTabHint")}</p>
        {getTabCardGroups(t).map(({ tabId, label, cards }) => {
          const ordered = orderCards(cards, settings.tab_card_order[tabId]);
          const hidden = settings.tab_hidden_cards[tabId] || [];
          return <div key={tabId}>
            <div className="settings-subheading">{label}</div>
            <div className="preview-list">
              {ordered.map((card, index) => (
                <div className="preview-row" key={card.id}>
                  <input type="checkbox" checked={!hidden.includes(card.id)} onChange={() => toggleTabCard(tabId, card.id)} aria-label={`${label}: ${card.label}`} />
                  <strong className="preview-grow">{card.label}</strong>
                  <button disabled={index === 0} onClick={() => moveTabCard(tabId, cards, index, -1)} aria-label={t("plus.settings.moveUp")}>↑</button>
                  <button disabled={index === ordered.length - 1} onClick={() => moveTabCard(tabId, cards, index, 1)} aria-label={t("plus.settings.moveDown")}>↓</button>
                </div>
              ))}
            </div>
          </div>;
        })}
      </>)}

      {section("care", t("plus.careSettings"), <Icons.Heart />, "#38BDF8", <>
        <div className="settings-subheading">{t("plus.settings.bathReminder")}</div>
        <div className="preview-form-grid settings-two-columns">
          <label>{t("plus.settings.afterDays")}<input type="number" min="1" max="60" value={settings.bath_reminder_days} onChange={(event) => update("bath_reminder_days", event.target.value)} /></label>
          <label>{t("plus.settings.notifyAt")}<input type="time" value={settings.bath_reminder_time} onChange={(event) => update("bath_reminder_time", event.target.value)} /></label>
        </div>
        <p className="form-hint">{t("plus.settings.bathHint", { last: humanDate(settings.last_bath, t), due: settings.bath_due_date ? humanDate(settings.bath_due_date, t) : "—" })}</p>
        <div className="settings-subheading">{t("plus.careHeader")}</div>
        <p className="form-hint">{t("plus.careHeaderHint")}</p>
        <div className="preview-list">
          {CARE_HEADER_TYPES.map((type) => <label className="preview-check" key={type}><input type="checkbox" checked={(settings.care_header_types || []).includes(type)} onChange={() => toggleCareHeader(type)} /> {t(`plus.careTypes.${type}`)}</label>)}
        </div>
      </>)}

      {section("medications", t("plus.medicationList.title"), <Icons.Pill />, "#EF4444", <>
        <p className="form-hint">{t("plus.medicationList.hint")}</p>
        {medications.length === 0 && <p className="form-hint">{t("plus.medicationList.empty")}</p>}
        <div className="medication-list-editor">{medications.map((item, index) => <div className="medication-list-row" key={item.id}>
          <input aria-label={t("plus.medicationList.name")} value={item.name} maxLength={80} onChange={(event) => updateMedication(item.id, { name: event.target.value })} />
          <select aria-label={t("plus.medicationList.unit")} value={item.unit} onChange={(event) => updateMedication(item.id, { unit: event.target.value })}>{MEDICATION_UNITS.map((unit) => <option key={unit || "none"} value={unit}>{unit ? t(`medicationForm.dosageUnits.${unit}`) : "—"}</option>)}</select>
          <label className="preview-check" title={t("plus.medicationList.visible")}><input type="checkbox" checked={!item.hidden} onChange={(event) => updateMedication(item.id, { hidden: !event.target.checked })} /> <span>{t("plus.medicationList.visible")}</span></label>
          <div className="medication-list-actions"><button disabled={index === 0} onClick={() => moveMedication(index, -1)} aria-label={t("plus.settings.moveUp")}>↑</button><button disabled={index === medications.length - 1} onClick={() => moveMedication(index, 1)} aria-label={t("plus.settings.moveDown")}>↓</button><button onClick={() => setMedications(medications.filter((entry) => entry.id !== item.id))} aria-label={t("plus.medicationList.remove")} title={t("plus.medicationList.remove")}>×</button></div>
        </div>)}</div>
        <div className="medication-list-add"><input value={newMedication} maxLength={80} placeholder={t("plus.medicationList.newPlaceholder")} aria-label={t("plus.medicationList.newPlaceholder")} onChange={(event) => setNewMedication(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addMedication(); } }} /><button className="secondary-inline" disabled={!newMedication.trim() || newMedicationDuplicate} onClick={addMedication}>{t("plus.medicationList.add")}</button></div>
        {newMedicationDuplicate && <p className="form-hint">{t("plus.medicationList.duplicate")}</p>}
      </>)}

      {section("diapers", t("plus.diaperCalculator.title"), <Icons.Droplet />, "#3B82F6", <>
        <label className="preview-check"><input type="checkbox" checked={Boolean(settings.analytics_diaper_calculator_enabled)} onChange={(event) => update("analytics_diaper_calculator_enabled", event.target.checked)} /> {t("plus.diaperCalculator.enable")}</label>
        <div className="preview-form-grid settings-two-columns"><label>{t("plus.diaperCalculator.profile")}<select value={settings.diaper_size_profile} onChange={(event) => { const profile = event.target.value; setSettings((current) => ({ ...current, diaper_size_profile: profile, diaper_size_ranges: profile === "pampers_de" ? PAMPERS_RANGES : current.diaper_size_ranges })); }}><option value="pampers_de">Pampers DE</option><option value="custom">{t("plus.diaperCalculator.custom")}</option></select></label><label>{t("plus.diaperCalculator.overlap")}<select value={settings.diaper_fit_preference} onChange={(event) => update("diaper_fit_preference", event.target.value)}><option value="auto">{t("plus.diaperCalculator.automatic")}</option><option value="smaller">{t("plus.diaperCalculator.smaller")}</option><option value="larger">{t("plus.diaperCalculator.larger")}</option></select></label></div>
        {settings.diaper_size_profile === "custom" && <div className="diaper-range-editor">{settings.diaper_size_ranges.map((range, index) => <div className="diaper-range-row" key={`${range.label}-${index}`}><input aria-label={t("plus.diaperCalculator.size")} value={range.label} onChange={(event) => updateRange(index, "label", event.target.value)} /><input aria-label={t("plus.diaperCalculator.minKg")} type="number" step="0.1" value={range.min ?? ""} onChange={(event) => updateRange(index, "min", event.target.value)} /><input aria-label={t("plus.diaperCalculator.maxKg")} type="number" step="0.1" value={range.max ?? ""} placeholder="∞" onChange={(event) => updateRange(index, "max", event.target.value)} /><button onClick={() => update("diaper_size_ranges", settings.diaper_size_ranges.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}<button className="secondary-inline" onClick={() => update("diaper_size_ranges", [...settings.diaper_size_ranges, { label: String(settings.diaper_size_ranges.length + 1), min: null, max: null }])}>{t("plus.diaperCalculator.addSize")}</button></div>}
      </>)}

      {section("notifications", t("plus.settings.notifications"), <Icons.Activity />, "#14B8A6", <>
        <p className="form-hint">{t("plus.settings.notificationsHint")}</p>
        <div className="settings-subheading">{t("plus.settings.notifyServices")}</div>
        <div className="preview-list">
          {(haTargets.notify || []).map((service) => <label className="preview-check" key={service}><input type="checkbox" checked={(settings.notification_targets || []).includes(service)} onChange={() => toggleTarget("notification_targets", service)} /> {service}</label>)}
        </div>
        <div className="settings-subheading">{t("plus.settings.voicePlayers")}</div>
        <p className="form-hint">{t("plus.settings.voicePlayersHint")}</p>
        <div className="preview-list">
          {(haTargets.media_players || []).map((player) => <label className="preview-check" key={player.entity_id}><input type="checkbox" checked={(settings.media_player_targets || []).includes(player.entity_id)} onChange={() => toggleTarget("media_player_targets", player.entity_id)} /> {player.name} <small>({player.entity_id})</small></label>)}
          {!(haTargets.media_players || []).length && <span className="form-hint">{t("plus.settings.noMediaPlayers")}</span>}
        </div>
        <div className="preview-form-grid settings-one-column"><label>{t("plus.settings.voiceMethod")}<select value={settings.media_player_mode} onChange={(event) => update("media_player_mode", event.target.value)}><option value="custom">media_player.play_media (custom)</option><option value="alexa_tts">Alexa Media – TTS</option><option value="alexa_announce">Alexa Media – Announce</option></select></label></div>
        <div className="settings-subheading">{t("plus.settings.testBuilder")}</div>
        <div className="preview-form-grid settings-one-column"><label>{t("plus.settings.testTitle")}<input value={test.title} onChange={(event) => setTest({ ...test, title: event.target.value })} /></label><label>{t("plus.settings.testMessage")}<textarea className="preview-textarea" value={test.message} onChange={(event) => setTest({ ...test, message: event.target.value })} /></label></div>
        <p className="form-hint">{t("plus.settings.testHint")}</p>
        <button className="secondary-inline settings-inline-action" disabled={!test.message.trim()} onClick={sendTest}>{t("plus.settings.sendTest")}</button>
        {testStatus && <div className="notification-test-result">{testStatus}</div>}
      </>)}

      {section("calendar", t("plus.settings.calendar"), <Icons.Clipboard />, "#8B5CF6", <>
        <p className="form-hint">{t("plus.settings.calendarHint")}</p>
        <div className="preview-list">
          {calendarTargets.map((calendar) => <label className="preview-check" key={calendar.entity_id}><input type="checkbox" checked={(settings.calendar_entities || []).includes(calendar.entity_id)} onChange={() => toggleTarget("calendar_entities", calendar.entity_id)} /> {calendar.name} <small>({calendar.entity_id})</small></label>)}
          {!calendarTargets.length && <span className="form-hint">{t("plus.settings.noCalendars")}</span>}
        </div>
      </>)}

      {section("homeAssistant", t("plus.settings.homeAssistantCare"), <Icons.Settings />, "#06B6D4", <>
        <p className="form-hint">{t("plus.settings.homeAssistantCareHint")}</p>
        <div className="preview-list">
          {HA_CARE_TYPES.map((type) => <label className="preview-check" key={type}><input type="checkbox" checked={(settings.ha_care_allowed_types || []).includes(type)} onChange={() => toggleHomeAssistantCareType(type)} /> {t(`plus.careTypes.${type}`)}</label>)}
        </div>
        <div className="settings-subheading">{t("plus.settings.homeAssistantPairing")}</div>
        <p className="form-hint">{t("plus.haActions.taskHint")}</p>
        <div className="preview-list">
          {haTasks.map((task) => <label className="preview-check" key={task.id}><input type="checkbox" checked={settings.ha_task_allowed_ids.includes(task.id)} onChange={() => toggleTarget("ha_task_allowed_ids", task.id)} /> {task.title} · ID {task.id}</label>)}
        </div>
        {!haTasks.length && <p className="form-hint">{t("plus.haActions.noTasks")}</p>}
        <p className="form-hint">{t("plus.haActions.measurementHint")}</p>
        <div className="preview-list">
          {["temperature", "height", "weight"].map((type) => <label className="preview-check" key={type}><input type="checkbox" checked={settings.ha_measurement_allowed_types.includes(type)} onChange={() => toggleTarget("ha_measurement_allowed_types", type)} /> {t(`plus.haActions.types.${type}`)}</label>)}
        </div>
        <p className="form-hint">{t("plus.settings.homeAssistantPairingHint")}</p>
        <button className="secondary-inline settings-inline-action" type="button" disabled={!settings.ha_care_allowed_types.length && !settings.ha_task_allowed_ids.length && !settings.ha_measurement_allowed_types.length} onClick={createPairing}>{t("plus.settings.createPairingCode")}</button>
        {pairing && <div className="notification-test-result"><strong>{t("plus.settings.pairingCode")}: {pairing.pairing_code}</strong><br /><small>{t("plus.settings.pairingExpires")}: {new Date(pairing.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>}
        {pairingStatus && <div className="notification-test-result">{pairingStatus}</div>}
      </>)}

      <div className="preview-save-row settings-save-sticky">
        <span>{status}</span>
        <button className="primary-inline" onClick={save}>{t("plus.settings.save")}</button>
      </div>
    </div>
  );
}
