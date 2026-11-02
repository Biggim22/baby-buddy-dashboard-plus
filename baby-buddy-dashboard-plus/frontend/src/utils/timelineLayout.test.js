import { describe, it, expect } from "vitest";
import { buildTimeline, layoutTimeline, timelineSpan, sleepOverlaps } from "./timeline";
const day = "2026-06-10";
const now = new Date("2026-06-11T12:00:00");
const interval = (id, start, end) => ({ id, start: `${day}T${start}`, end: `${day}T${end}`, color: "orange" });
describe("timeline bracket layout", () => {
  it("counts hidden intervals only once even if no endpoint lies inside the span", () => {
    const rows = buildTimeline([{ id: "a", time: `${day}T11:00:00` }, { id: "b", time: `${day}T12:00:00` }], [interval("hidden", "10:00:00", "13:00:00")], day, now);
    const a = rows.find(row => row.id === "a"), b = rows.find(row => row.id === "b");
    const visible = new Set(["a", "b"]);
    expect(timelineSpan(a, b, rows, visible).hidden).toBe(1);
    expect(timelineSpan(b, a, rows, visible)).toEqual(timelineSpan(a, b, rows, visible));
    expect(timelineSpan(a, a, rows, visible)).toBeNull();
    expect(sleepOverlaps([interval("x", "10:00:00", "11:00:00")], `${day}T11:00:00`, `${day}T12:00:00`)).toBe(false);
  });
  it.each(["newest", "oldest"])("connects nested intervals over point events in %s order", order => {
    const events = buildTimeline([{ id: "diaper", time: `${day}T11:15:00` }], [interval("sleep", "10:00:00", "12:00:00"), interval("feed", "11:00:00", "11:30:00")], day, now);
    const result = layoutTimeline(events, order);
    expect(result.lanes).toBe(2);
    expect(result.rows[0].phase).toBe(order === "newest" ? "end" : "start");
    expect(result.rows[0].brackets[0].edge).toBe("first");
    expect(result.rows.at(-1).brackets[0].edge).toBe("last");
    expect(result.rows.find(row => row.id === "diaper").brackets.map(b => b.lane)).toEqual([0, 1]);
    expect(events[0].phase).toBe("start");
  });
  it("reuses lanes for separate intervals and defaults to newest first", () => {
    const events = buildTimeline([], [interval("a", "08:00:00", "09:00:00"), interval("b", "10:00:00", "11:00:00")], day, now);
    expect(layoutTimeline(events).lanes).toBe(1);
    expect(layoutTimeline(events).rows[0].intervalId).toBe("b");
  });
  it("connects clipped continuation markers and leaves points unbracketed", () => {
    const events = buildTimeline([], [{ id: "night", start: "2026-06-09T22:00:00", end: "2026-06-11T07:00:00" }], day, now);
    expect(layoutTimeline(events).rows.map(row => row.phase)).toEqual(["continues", "continued"]);
    expect(layoutTimeline(events).lanes).toBe(1);
    expect(layoutTimeline([{ id: "point" }])).toEqual({ lanes: 0, rows: [{ id: "point", brackets: [] }] });
  });
});
