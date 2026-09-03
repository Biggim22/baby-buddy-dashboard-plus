import { useEffect, useState } from "react";
import { api } from "../api";
import { Icons } from "./Icons";
import Modal from "./Modal";
import { useTranslation } from "../locales";

const PAMPERS_RANGES = [
  { label: "1", min: 2, max: 5 }, { label: "2", min: 4, max: 8 },
  { label: "3", min: 6, max: 10 }, { label: "4", min: 9, max: 14 },
  { label: "4+", min: 10, max: 15 }, { label: "5", min: 11, max: 16 },
  { label: "5+", min: 12, max: 17 }, { label: "6", min: 13, max: 18 },
  { label: "6+", min: 14, max: 19 }, { label: "7", min: 15, max: null },
  { label: "8", min: 17, max: null },
];

export default function TabDisplaySettings({ childId, tabId, cards, onChange }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [allHidden, setAllHidden] = useState({});
  const [allOrder, setAllOrder] = useState({});
  const [calculator, setCalculator] = useState({ enabled: false, profile: "pampers_de", ranges: PAMPERS_RANGES, fit: "auto" });
  const [status, setStatus] = useState("");
  const hidden = allHidden[tabId] || [];
  const savedOrder = allOrder[tabId] || [];
  const order = [...savedOrder.filter((id) => cards.some((card) => card.id === id)), ...cards.map((card) => card.id).filter((id) => !savedOrder.includes(id))];
  const orderedCards = order.map((id) => cards.find((card) => card.id === id)).filter(Boolean);

  useEffect(() => {
    if (!childId) return;
    api.getLocalSettings(childId).then((settings) => {
      const next = settings.tab_hidden_cards && typeof settings.tab_hidden_cards === "object" ? settings.tab_hidden_cards : {};
      const nextOrder = settings.tab_card_order && typeof settings.tab_card_order === "object" ? settings.tab_card_order : {};
      setAllHidden(next);
      setAllOrder(nextOrder);
      setCalculator({
        enabled: settings.analytics_diaper_calculator_enabled === true || String(settings.analytics_diaper_calculator_enabled).toLowerCase() === "true",
        profile: settings.diaper_size_profile || "pampers_de",
        ranges: Array.isArray(settings.diaper_size_ranges) && settings.diaper_size_ranges.length ? settings.diaper_size_ranges : PAMPERS_RANGES,
        fit: settings.diaper_fit_preference || "auto",
      });
      onChange({ hidden: next[tabId] || [], order: nextOrder[tabId] || [] });
    }).catch(() => {});
  }, [childId, tabId, onChange]);

  const toggle = (id) => {
    const values = new Set(hidden);
    values.has(id) ? values.delete(id) : values.add(id);
    const next = { ...allHidden, [tabId]: [...values] };
    setAllHidden(next);
    onChange({ hidden: next[tabId], order });
  };

  const move = (id, direction) => {
    const nextOrder = [...order];
    const index = nextOrder.indexOf(id);
    const target = index + direction;
    if (target < 0 || target >= nextOrder.length) return;
    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
    const next = { ...allOrder, [tabId]: nextOrder };
    setAllOrder(next);
    onChange({ hidden, order: nextOrder });
  };

  const updateRange = (index, key, value) => setCalculator((current) => ({ ...current, ranges: current.ranges.map((range, itemIndex) => itemIndex === index ? { ...range, [key]: key === "label" ? value : value === "" ? null : Number(value) } : range) }));

  const save = async () => {
    setStatus(t("plus.saving"));
    try {
      await api.updateLocalSettings(childId, {
        tab_hidden_cards: allHidden,
        tab_card_order: { ...allOrder, [tabId]: order },
        ...(tabId === "analytics" ? {
          analytics_diaper_calculator_enabled: calculator.enabled,
          diaper_size_profile: calculator.profile,
          diaper_size_ranges: calculator.profile === "custom" ? calculator.ranges : [],
          diaper_fit_preference: calculator.fit,
        } : {}),
      });
      setStatus(t("plus.settings.saved"));
      window.dispatchEvent(new CustomEvent("baby-buddy-settings-updated"));
    } catch (error) { setStatus(error.message); }
  };

  return <>
    <button className="tab-settings-button page-card-settings" onClick={() => setOpen(true)} title={t("plus.displaySettings.cardsTitle")} aria-label={t("plus.displaySettings.cardsTitle")}><Icons.Settings /></button>
    {open && <Modal title={t("plus.displaySettings.cardsTitle")} onClose={() => setOpen(false)} maxWidth={620}><p className="form-hint">{t("plus.displaySettings.cardsHint")}</p><div className="preview-list">{orderedCards.map((card, index) => <div className="preview-row" key={card.id}><input type="checkbox" checked={!hidden.includes(card.id)} onChange={() => toggle(card.id)} /><strong className="preview-grow">{card.label}</strong><button disabled={index === 0} onClick={() => move(card.id, -1)} aria-label={t("plus.settings.moveUp")}>↑</button><button disabled={index === orderedCards.length - 1} onClick={() => move(card.id, 1)} aria-label={t("plus.settings.moveDown")}>↓</button></div>)}</div>
      {tabId === "analytics" && <details className="settings-expander"><summary>{t("plus.diaperCalculator.title")}</summary><div className="settings-expander-body">
        <label className="preview-check"><input type="checkbox" checked={calculator.enabled} onChange={(event) => setCalculator({ ...calculator, enabled: event.target.checked })} /> {t("plus.diaperCalculator.enable")}</label>
        <div className="preview-form-grid settings-two-columns"><label>{t("plus.diaperCalculator.profile")}<select value={calculator.profile} onChange={(event) => setCalculator({ ...calculator, profile: event.target.value, ranges: event.target.value === "pampers_de" ? PAMPERS_RANGES : calculator.ranges })}><option value="pampers_de">Pampers DE</option><option value="custom">{t("plus.diaperCalculator.custom")}</option></select></label><label>{t("plus.diaperCalculator.overlap")}<select value={calculator.fit} onChange={(event) => setCalculator({ ...calculator, fit: event.target.value })}><option value="auto">{t("plus.diaperCalculator.automatic")}</option><option value="smaller">{t("plus.diaperCalculator.smaller")}</option><option value="larger">{t("plus.diaperCalculator.larger")}</option></select></label></div>
        {calculator.profile === "custom" && <div className="diaper-range-editor">{calculator.ranges.map((range, index) => <div className="diaper-range-row" key={`${range.label}-${index}`}><input aria-label={t("plus.diaperCalculator.size")} value={range.label} onChange={(event) => updateRange(index, "label", event.target.value)} /><input aria-label={t("plus.diaperCalculator.minKg")} type="number" step="0.1" value={range.min ?? ""} onChange={(event) => updateRange(index, "min", event.target.value)} /><input aria-label={t("plus.diaperCalculator.maxKg")} type="number" step="0.1" value={range.max ?? ""} placeholder="∞" onChange={(event) => updateRange(index, "max", event.target.value)} /><button onClick={() => setCalculator({ ...calculator, ranges: calculator.ranges.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}<button className="secondary-inline" onClick={() => setCalculator({ ...calculator, ranges: [...calculator.ranges, { label: String(calculator.ranges.length + 1), min: null, max: null }] })}>{t("plus.diaperCalculator.addSize")}</button></div>}
      </div></details>}
      <div className="preview-save-row"><span>{status}</span><button className="primary-inline" onClick={save}>{t("plus.settings.save")}</button></div></Modal>}
  </>;
}
