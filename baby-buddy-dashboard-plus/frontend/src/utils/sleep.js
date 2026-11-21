// Calendar boundaries use the device's local zone; durations use elapsed milliseconds.
// Only completed records count. Running timers are not saved sleep records.
//
// Day/night split: a merged sleep phase is a night phase when at least half of it
// lies inside the family's night window (default 19:00–07:00). A night phase is
// counted in full, never cut at the window edges, and belongs to the morning on
// which its night window ends. Day phases are clipped to the requested range.
// `total` stays the elapsed sleep inside the range, so day + night may differ
// from total when a night reaches into the previous day.
export const DEFAULT_NIGHT_WINDOW = Object.freeze({ start: "19:00", end: "07:00" });
export const NIGHT_SHARE = 0.5;
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizeNightWindow(value) {
  const start = CLOCK.test(value?.start) ? value.start : DEFAULT_NIGHT_WINDOW.start;
  const end = CLOCK.test(value?.end) ? value.end : DEFAULT_NIGHT_WINDOW.end;
  return start === end ? { ...DEFAULT_NIGHT_WINDOW } : { start, end };
}

export function nightWindowFromSettings(settings) {
  return normalizeNightWindow({ start: settings?.sleep_night_start, end: settings?.sleep_night_end });
}

function atClock(day, clock) {
  const [hours, minutes] = clock.split(":").map(Number);
  const value = new Date(day);
  value.setHours(hours, minutes, 0, 0);
  return +value;
}

// Night windows touching [a, b), each as [start, end] in epoch milliseconds.
function nightWindowsAround(a, b, window) {
  const wraps = window.end <= window.start;
  const day = new Date(a);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - 1);
  const result = [];
  while (+day < b) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const start = atClock(day, window.start);
    const end = atClock(wraps ? next : day, window.end);
    if (end > a && start < b) result.push([start, end]);
    day.setTime(+next);
  }
  return result;
}

export function classifySleepPhase(a, b, nightWindow = DEFAULT_NIGHT_WINDOW) {
  const window = normalizeNightWindow(nightWindow);
  let nightMs = 0;
  let main = null;
  let mainOverlap = 0;
  for (const [start, end] of nightWindowsAround(a, b, window)) {
    const overlap = Math.max(0, Math.min(end, b) - Math.max(start, a));
    nightMs += overlap;
    if (overlap > mainOverlap) { mainOverlap = overlap; main = end; }
  }
  const night = nightMs > 0 && nightMs >= (b - a) * NIGHT_SHARE;
  return { night, nightMs, nightEnd: night ? main : null };
}

export function sleepTotals(entries, start, end, now = new Date(), nightWindow = DEFAULT_NIGHT_WINDOW) {
  const lower = +new Date(start);
  const rangeEnd = +new Date(end);
  const current = +new Date(now);
  const upper = Math.min(rangeEnd, current);
  let day = 0;
  let night = 0;
  let total = 0;
  const intervals = (entries || []).filter(e => e.start && e.end).map(e => [+new Date(e.start), Math.min(current, +new Date(e.end))])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  // Count elapsed sleep once even if imported records overlap. Stored data is untouched.
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  for (const [a, b] of merged) {
    const clipped = Math.max(0, Math.min(upper, b) - Math.max(lower, a));
    total += clipped;
    const phase = classifySleepPhase(a, b, nightWindow);
    if (phase.night) {
      // A night still in progress belongs to the newest range that has already begun.
      const anchor = Math.min(phase.nightEnd, current - 1);
      if (anchor >= lower && anchor < rangeEnd) night += b - a;
    } else {
      day += clipped;
    }
  }
  return { day: day / 60000, night: night / 60000, total: total / 60000 };
}

export function calendarWindow(value) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function sleepHoursOnDate(entries, date, now = new Date()) {
  const { start, end } = calendarWindow(`${date}T12:00:00`);
  return sleepTotals(entries, start, end, now).total / 60;
}

export function sleepWindows(entries, mode, count = 7, now = new Date(), nightWindow = DEFAULT_NIGHT_WINDOW) {
  return Array.from({ length: count }, (_, i) => {
    const ago = count - 1 - i;
    let start, end;
    if (mode === "calendar") {
      const date = new Date(now);
      date.setDate(date.getDate() - ago);
      ({ start, end } = calendarWindow(date));
    } else {
      end = new Date(+now - ago * 86400000);
      start = new Date(+end - 86400000);
    }
    return { start, end, partial: +end > +now, ...sleepTotals(entries, start, end, now, nightWindow) };
  });
}
