function minutes(value) {
  const [hours = 0, mins = 0] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + mins;
}

export function scheduleActive(settings, now = new Date()) {
  if (!(settings?.appearance_schedule_enabled === true || String(settings?.appearance_schedule_enabled).toLowerCase() === "true")) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(settings.appearance_schedule_start || "20:00");
  const end = minutes(settings.appearance_schedule_end || "06:00");
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function applyAppearance(settings, now = new Date()) {
  const scheduled = scheduleActive(settings, now);
  document.documentElement.dataset.theme = scheduled ? (settings.appearance_schedule_theme || "dark") : (settings.theme || "dark");
  document.documentElement.dataset.accent = scheduled ? (settings.appearance_schedule_accent || "rose") : (settings.accent || "amber");
}
