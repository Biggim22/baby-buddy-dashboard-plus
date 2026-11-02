// Calendar boundaries use the device's local zone; durations use elapsed milliseconds.
// Only completed records count. Running timers are not saved sleep records.
export function sleepTotals(entries, start, end, now = new Date()) {
  const lower = +new Date(start);
  const upper = Math.min(+new Date(end), +new Date(now));
  let day = 0;
  let night = 0;
  const intervals = (entries || []).filter(e => e.start && e.end).map(e => [
    Math.max(lower, +new Date(e.start)), Math.min(upper, +new Date(e.end)),
  ]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  // Count elapsed sleep once even if imported records overlap. Stored data is untouched.
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  for (const [a, b] of merged) {
    let cursor = a;
    while (cursor < b) {
      const local = new Date(cursor);
      const isDay = local.getHours() >= 6 && local.getHours() < 20;
      const boundary = new Date(cursor);
      if (isDay) boundary.setHours(20, 0, 0, 0);
      else if (local.getHours() < 6) boundary.setHours(6, 0, 0, 0);
      else { boundary.setDate(boundary.getDate() + 1); boundary.setHours(6, 0, 0, 0); }
      const next = Math.min(+boundary, b);
      if (next <= cursor) throw new Error("Invalid sleep boundary");
      if (isDay) day += next - cursor;
      else night += next - cursor;
      cursor = next;
    }
  }
  return { day: day / 60000, night: night / 60000, total: (day + night) / 60000 };
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

export function sleepWindows(entries, mode, count = 7, now = new Date()) {
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
    return { start, end, partial: +end > +now, ...sleepTotals(entries, start, end, now) };
  });
}
