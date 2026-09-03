import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Icons } from "../components/Icons";
import SectionCard from "../components/SectionCard";
import { setTimeFormat, useTranslation } from "../locales";
import { applyAppearance } from "../utils/appearance";

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
  bath_reminder_days: 7,
  bath_reminder_time: "10:00",
  feeding_daily_metric: "duration",
  feeding_average_metric: "duration",
  time_format: "24h",
  care_header_types: ["bath", "full_wash", "quick_wash"],
  notification_targets: ["notify.notify"],
  media_player_targets: [],
  media_player_mode: "custom",
  analytics_sleep_period_mode: "rolling",
  tab_hidden_cards: {},
  appearance_schedule_enabled: false,
  appearance_schedule_start: "20:00",
  appearance_schedule_end: "06:00",
  appearance_schedule_theme: "dark",
  appearance_schedule_accent: "rose",
};

const CARE_HEADER_TYPES = ["bath", "full_wash", "quick_wash", "caraway_suppository", "caraway_oil", "nail_care", "skin_care"];

function humanDate(value, t) {
  if (!value) return t("plus.settings.noBath");
  return new Date(value).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SettingsTab({ childId, embedded = false, scope = "global" }) {
  const t = useTranslation();
  const [settings, setSettings] = useState(DEFAULTS);
  const [status, setStatus] = useState("");
  const [haTargets, setHaTargets] = useState({ notify: ["notify.notify"], media_players: [] });
  const [test, setTest] = useState({ title: "Baby Buddy Dashboard Plus", message: "Dies ist eine Testbenachrichtigung." });
  const [testStatus, setTestStatus] = useState("");

  const load = useCallback(async () => {
    if (!childId) return;
    try {
      await api.bootstrapLocal(childId);
      const [result, targets] = await Promise.all([
        api.getLocalSettings(childId),
        api.getHaTargets().catch(() => ({ notify: ["notify.notify"], media_players: [] })),
      ]);
      setHaTargets(targets);
      const savedOrder = Array.isArray(result.overview_sections)
        ? result.overview_sections.filter((section) => section in CATEGORY_LABELS)
        : [];
      const missing = Object.keys(CATEGORY_LABELS).filter((section) => !savedOrder.includes(section));
      const next = { ...DEFAULTS, ...result, overview_sections: [...savedOrder, ...missing] };
      next.overview_show_charts = result.overview_show_charts === true || String(result.overview_show_charts).toLowerCase() === "true";
      next.appearance_schedule_enabled = result.appearance_schedule_enabled === true || String(result.appearance_schedule_enabled).toLowerCase() === "true";
      next.care_header_types = Array.isArray(result.care_header_types) && result.care_header_types.length
        ? result.care_header_types
        : DEFAULTS.care_header_types;
      setSettings(next);
      applyAppearance(next);
      setStatus("");
    } catch (err) {
      setStatus(err.message);
    }
  }, [childId]);

  useEffect(() => void load(), [load]);

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

  const toggleTarget = (key, value) => {
    const selected = new Set(settings[key] || []);
    selected.has(value) ? selected.delete(value) : selected.add(value);
    update(key, [...selected]);
  };

  const save = async () => {
    setStatus(t("plus.saving"));
    try {
      const result = await api.updateLocalSettings(childId, {
        theme: settings.theme,
        accent: settings.accent,
        overview_sections: settings.overview_sections,
        overview_hidden: settings.overview_hidden,
        overview_show_charts: Boolean(settings.overview_show_charts),
        bath_reminder_days: Number(settings.bath_reminder_days),
        bath_reminder_time: settings.bath_reminder_time,
        feeding_daily_metric: settings.feeding_daily_metric,
        feeding_average_metric: settings.feeding_average_metric,
        time_format: settings.time_format,
        care_header_types: settings.care_header_types,
        notification_targets: settings.notification_targets,
        media_player_targets: settings.media_player_targets,
        media_player_mode: settings.media_player_mode,
        analytics_sleep_period_mode: settings.analytics_sleep_period_mode,
        tab_hidden_cards: settings.tab_hidden_cards,
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

  return (
    <div className={`${embedded ? "" : "fade-in "}settings-preview-layout`}>
      {(scope === "global") && <SectionCard title={t("plus.settings.appearance")} icon={<Icons.Activity />} color="#F59E0B">
        <div className="preview-form-grid">
          <label>{t("plus.settings.mode")}<select value={settings.theme} onChange={(event) => update("theme", event.target.value)}><option value="dark">{t("plus.settings.dark")}</option><option value="light">{t("plus.settings.light")}</option><option value="pastel">{t("plus.settings.pastel")}</option><option value="nord">Nord</option><option value="dracula">Dracula</option><option value="solarized">Solarized Light</option></select></label>
          <label>{t("plus.settings.colorScheme")}<select value={settings.accent} onChange={(event) => update("accent", event.target.value)}><option value="amber">Amber</option><option value="mint">Mint</option><option value="blue">Blue</option><option value="rose">Rose</option><option value="violet">Violet</option></select></label>
          <label>{t("plus.timeFormat")}<select value={settings.time_format} onChange={(event) => update("time_format", event.target.value)}><option value="24h">24-hour</option><option value="12h">12-hour</option></select></label>
        </div>
        <details className="settings-expander"><summary>{t("plus.settings.appearanceSchedule")}</summary><div className="settings-expander-body">
          <label className="preview-check"><input type="checkbox" checked={Boolean(settings.appearance_schedule_enabled)} onChange={(event) => update("appearance_schedule_enabled", event.target.checked)} /> {t("plus.settings.enableSchedule")}</label>
          <div className="preview-form-grid settings-two-columns">
            <label>{t("plus.settings.from")}<input type="time" value={settings.appearance_schedule_start} onChange={(event) => update("appearance_schedule_start", event.target.value)} /></label>
            <label>{t("plus.settings.until")}<input type="time" value={settings.appearance_schedule_end} onChange={(event) => update("appearance_schedule_end", event.target.value)} /></label>
            <label>{t("plus.settings.scheduledMode")}<select value={settings.appearance_schedule_theme} onChange={(event) => update("appearance_schedule_theme", event.target.value)}><option value="dark">{t("plus.settings.dark")}</option><option value="light">{t("plus.settings.light")}</option><option value="pastel">{t("plus.settings.pastel")}</option><option value="nord">Nord</option><option value="dracula">Dracula</option><option value="solarized">Solarized Light</option></select></label>
            <label>{t("plus.settings.scheduledColor")}<select value={settings.appearance_schedule_accent} onChange={(event) => update("appearance_schedule_accent", event.target.value)}><option value="amber">Amber</option><option value="mint">Mint</option><option value="blue">Blue</option><option value="rose">Rose</option><option value="violet">Violet</option></select></label>
          </div>
        </div></details>
      </SectionCard>}

      {(scope === "global") && <SectionCard title={t("plus.settings.notifications")} icon={<Icons.Activity />} color="#14B8A6">
        <p className="form-hint">{t("plus.settings.notificationsHint")}</p>
        <details className="settings-expander"><summary>{t("plus.settings.chooseTargets")}</summary><div className="settings-expander-body">
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
        <label>{t("plus.settings.voiceMethod")}<select value={settings.media_player_mode} onChange={(event) => update("media_player_mode", event.target.value)}><option value="custom">media_player.play_media (custom)</option><option value="alexa_tts">Alexa Media – TTS</option><option value="alexa_announce">Alexa Media – Announce</option></select></label>
        </div></details>
        <details className="settings-expander"><summary>{t("plus.settings.testBuilder")}</summary><div className="settings-expander-body">
          <div className="preview-form-grid"><label>{t("plus.settings.testTitle")}<input value={test.title} onChange={(event) => setTest({ ...test, title: event.target.value })} /></label><label>{t("plus.settings.testMessage")}<textarea value={test.message} onChange={(event) => setTest({ ...test, message: event.target.value })} /></label></div>
          <p className="form-hint">{t("plus.settings.testHint")}</p>
          <button className="primary-inline" disabled={!test.message.trim()} onClick={sendTest}>{t("plus.settings.sendTest")}</button>
          {testStatus && <div className="notification-test-result">{testStatus}</div>}
        </div></details>
      </SectionCard>}

      {scope === "overview" && <SectionCard title={t("plus.settings.overviewOrder")} icon={<Icons.TrendUp />} color="#8B5CF6">
        <label className="preview-check"><input type="checkbox" checked={!settings.overview_hidden.includes("tasks")} onChange={() => toggle("tasks")} /> {t("plus.settings.openTasksFirst")}</label>
        <label className="preview-check"><input type="checkbox" checked={Boolean(settings.overview_show_charts)} onChange={(event) => update("overview_show_charts", event.target.checked)} /> {t("plus.settings.overviewCharts")}</label>
        <div className="preview-list">
          {settings.overview_sections.map((section, index) => (
            <div className="preview-row" key={section}>
              <input type="checkbox" checked={!settings.overview_hidden.includes(section)} onChange={() => toggle(section)} />
              <strong className="preview-grow">{t(`plus.settings.categories.${CATEGORY_LABELS[section]}`)}</strong>
              <button disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("plus.settings.moveUp")}>↑</button>
              <button disabled={index === settings.overview_sections.length - 1} onClick={() => move(index, 1)} aria-label={t("plus.settings.moveDown")}>↓</button>
            </div>
          ))}
        </div>
      </SectionCard>}

      {scope === "care" && <SectionCard title={t("plus.settings.bathReminder")} icon={<Icons.Heart />} color="#38BDF8">
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
      </SectionCard>}

      <div className="preview-save-row">
        <span>{status}</span>
        <button className="primary-inline" onClick={save}>{t("plus.settings.save")}</button>
      </div>
    </div>
  );
}
