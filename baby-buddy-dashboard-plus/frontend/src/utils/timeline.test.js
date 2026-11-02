import { it, expect, vi } from "vitest";
import { buildTimeline, timelineBounds, loadTimelinePages } from "./timeline";
const day = "2026-11-01";
const now = new Date("2026-11-03T12:00:00");
const sleep = { id: "sleep-1", start: `${day}T10:00:00`, end: `${day}T12:00:00` };
it("connects sleep endpoints around a diaper change", () => {
  const rows = buildTimeline([{ id: "diaper-1", time: `${day}T11:00:00` }], [sleep], day, now);
  expect(rows.map(x => x.phase)).toEqual(["start", "point", "end"]);
  expect(rows[0].intervalId).toBe(rows[2].intervalId);
  expect(rows[1].during.map(x => x.id)).toEqual(["sleep-1"]);
});
it("shows simultaneous intervals without duplicating point events", () => {
  const rows = buildTimeline([{ id: "diaper-1", time: `${day}T11:00:00` }], [sleep, { id: "feed-1", start: `${day}T10:30:00`, end: `${day}T11:30:00` }], day, now);
  expect(rows.find(x => x.id === "diaper-1").during).toHaveLength(2);
  expect(rows.filter(x => x.id === "diaper-1")).toHaveLength(1);
});
it("clips intervals spanning an entire day and excludes next-day points", () => {
  const rows = buildTimeline([{ id: "next", time: "2026-11-02T00:00:00" }], [{ id: "long", start: "2026-10-31T22:00:00", end: "2026-11-02T02:00:00" }], day, now);
  expect(rows.map(x => x.phase)).toEqual(["continued", "continues"]);
});
it("orders end before start and point at equal timestamps", () => {
  const rows = buildTimeline([{ id: "point", time: `${day}T12:00:00` }], [sleep, { id: "feed", start: `${day}T12:00:00`, end: `${day}T13:00:00` }], day, now);
  expect(rows.filter(x => +new Date(x.time) === +new Date(`${day}T12:00:00`)).map(x => x.phase)).toEqual(["end", "start", "point"]);
  expect(rows.find(x => x.id === "point").during.map(x => x.id)).toEqual(["feed"]);
});
it("ignores malformed intervals and respects now", () => {
  const rows = buildTimeline([], [{ id: "bad", start: "invalid", end: "invalid" }, sleep], day, new Date(`${day}T11:00:00`));
  expect(rows.map(x => x.phase)).toEqual(["start", "continues"]);
});
it.runIf(Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Berlin")("uses a 25-hour autumn day", () => {
  const { start, end } = timelineBounds("2026-10-25");
  expect(end - start).toBe(25 * 3600000);
});
it("loads all pages and rejects stuck pagination", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ results: [{ id: 1 }], next: "remote" }).mockResolvedValueOnce({ results: [{ id: 2 }], next: null });
  expect(await loadTimelinePages(fetch, { child: 1 })).toHaveLength(2);
  expect(fetch.mock.calls[1][0].offset).toBe(1);
  await expect(loadTimelinePages(vi.fn().mockResolvedValue({ results: [{ id: 1 }], next: "stuck" }), {})).rejects.toThrow("no progress");
});
