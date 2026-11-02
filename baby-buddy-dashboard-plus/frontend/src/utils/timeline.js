export function timelineBounds(day) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// Half-open days prevent midnight events appearing on two dates.
export function buildTimeline(points, intervals, day, now = new Date()) {
  const { start, end } = timelineBounds(day);
  const upper = Math.min(+end, +now);
  const valid = intervals.filter(item => Number.isFinite(+new Date(item.start)) &&
    (!item.end || +new Date(item.end) > +new Date(item.start)) &&
    +new Date(item.start) < upper && (!item.end || +new Date(item.end) > +start));
  const rows = points.filter(item => +new Date(item.time) >= +start && +new Date(item.time) < +end && +new Date(item.time) <= +now)
    .map(item => ({ ...item, phase: "point" }));
  for (const item of valid) {
    const begin = Math.max(+start, +new Date(item.start));
    const finish = Math.min(upper, item.end ? +new Date(item.end) : upper);
    if (finish <= begin) continue;
    rows.push({ ...item, id: `${item.id}-start`, intervalId: item.id, time: new Date(begin).toISOString(), phase: +new Date(item.start) < +start ? "continued" : "start" });
    rows.push({ ...item, id: `${item.id}-end`, intervalId: item.id, time: new Date(finish).toISOString(), phase: !item.end || +new Date(item.end) > upper ? "continues" : "end" });
  }
  const rank = { end: 0, continues: 0, continued: 1, start: 1, point: 2 };
  return rows.sort((a, b) => +new Date(a.time) - +new Date(b.time) || rank[a.phase] - rank[b.phase] || a.id.localeCompare(b.id))
    .map(row => ({ ...row, during: valid.filter(item => item.id !== row.intervalId &&
      +new Date(item.start) <= +new Date(row.time) &&
      (!item.end || +new Date(item.end) > +new Date(row.time))).map(item => item) }));
}

// Allocate separate lanes for overlapping pairs in display order. Row-sized
// segments follow variable card heights without DOM measurements or fixed pixels.
export function layoutTimeline(rows, order = "newest") {
  const displayed = order === "oldest" ? [...rows] : [...rows].reverse();
  const pairs = new Map();
  displayed.forEach((row, index) => {
    if (!row.intervalId) return;
    const pair = pairs.get(row.intervalId);
    if (pair) pair.last = index;
    else pairs.set(row.intervalId, { id: row.intervalId, first: index, last: index, color: row.color });
  });
  const lanes = [];
  const segments = displayed.map(() => []);
  for (const pair of pairs.values()) {
    if (pair.first === pair.last) continue;
    let lane = lanes.findIndex(end => end < pair.first);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = pair.last;
    for (let i = pair.first; i <= pair.last; i++) {
      segments[i].push({ ...pair, lane, edge: i === pair.first ? "first" : i === pair.last ? "last" : "middle" });
    }
  }
  return { lanes: lanes.length, rows: displayed.map((row, i) => ({ ...row, brackets: segments[i] })) };
}

export async function loadTimelinePages(fetchPage, params) {
  const results = [];
  const seen = new Set();
  let offset = 0;
  for (let page = 0; page < 1000; page++) {
    const response = await fetchPage({ ...params, limit: 200, offset });
    const rows = response.results || [];
    const fresh = rows.filter(item => !seen.has(item.id));
    for (const item of fresh) { results.push(item); seen.add(item.id); }
    if (!response.next) return results;
    if (!fresh.length) throw new Error("Timeline pagination made no progress");
    offset += rows.length;
  }
  throw new Error("Timeline data incomplete");
}
