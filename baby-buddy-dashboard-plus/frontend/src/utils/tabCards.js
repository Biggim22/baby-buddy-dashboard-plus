// Cards that can be shown, hidden and reordered per tab. The ids are stored in
// the local settings (`tab_hidden_cards` / `tab_card_order`) and must stay stable.
export function getTabCardGroups(t) {
  return [
    { tabId: "analytics", label: t("plus.analyticsTab"), cards: [{ id: "summary", label: t("plus.analytics.summary") }, { id: "sleep", label: t("plus.analytics.rollingSleep") }, { id: "breast", label: t("plus.analytics.breastfeedingWeek") }, { id: "bottles", label: t("plus.analytics.bottlesWeek") }, { id: "diapers", label: t("plus.analytics.diapersWeek") }, { id: "temperature", label: t("plus.analytics.temperature") }, { id: "tummy", label: t("plus.analytics.tummyWeek") }, { id: "diaperCalculator", label: t("plus.diaperCalculator.title") }, { id: "pumping", label: t("plus.pumping.title") }] },
    { tabId: "timeline", label: t("plus.timeline.title"), cards: [{ id: "feeding", label: t("plus.analytics.averageFeedings") }, { id: "sleep", label: t("plus.analytics.sleep") }, { id: "diaper", label: t("plus.analytics.averageDiapers") }, { id: "medication", label: t("notes.medications") }, { id: "tummy", label: t("plus.analytics.tummyTime") }, { id: "note", label: t("notes.notesTitle") }] },
    { tabId: "growth", label: t("tab.growth"), cards: [{ id: "summary", label: t("plus.settings.measurementSummary") }, { id: "weight", label: t("growth.weightTrend") }, { id: "height", label: t("growth.heightTrend") }, { id: "head", label: t("growth.headCircumferenceTrend") }, { id: "bmi", label: t("growth.bmiTrend") }, { id: "paediatricReport", label: t("report.paediatricTitle") }] },
    { tabId: "care", label: t("plus.care"), cards: [{ id: "summary", label: t("plus.settings.careSummary") }, { id: "history", label: t("plus.careHistory") }] },
    { tabId: "tasks", label: t("plus.tasksTab"), cards: [{ id: "tasks", label: t("plus.tasks.list") }, { id: "appointments", label: t("plus.tasks.appointments") }, { id: "calendar", label: t("plus.tasks.calendar") }] },
    { tabId: "notes", label: t("tab.notesAndMeds"), cards: [{ id: "medications", label: t("notes.medications") }, { id: "temperature", label: t("temperature.title") }, { id: "notes", label: t("notes.notesTitle") }] },
  ];
}

// Saved order first, then any card that was added after the order was saved.
export function orderCards(cards, savedOrder = []) {
  const known = savedOrder.filter((id) => cards.some((card) => card.id === id));
  return [...known, ...cards.map((card) => card.id).filter((id) => !known.includes(id))]
    .map((id) => cards.find((card) => card.id === id));
}
