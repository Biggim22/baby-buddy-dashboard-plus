import { describe, it, expect, vi, afterEach } from "vitest";
import { sleepTotals, sleepWindows, calendarWindow } from "./sleep";
import { aggregateSleepByDay, buildDailyReport, dailySleepTotals, formatSleepDateRange } from "./formatters";
import { setLanguage } from "../locales";

const entry = (start, end) => ({ start, end });
const future = new Date("2030-01-01T00:00:00Z");
afterEach(() => vi.useRealTimers());

describe("shared sleep intervals", () => {
  it("does not invent sleep in an unrecorded overnight gap", () => {
    const records = [entry("2026-06-12T21:00:00", "2026-06-12T23:59:00"), entry("2026-06-13T08:00:00", "2026-06-13T09:00:00")];
    const { start, end } = calendarWindow("2026-06-13T12:00:00");
    expect(sleepTotals(records, start, end, future)).toEqual({ day: 60, night: 0, total: 60 });
  });
  it("shows both calendar dates for a night spanning midnight", () => {
    setLanguage("de");
    const label = formatSleepDateRange("2026-06-12T21:00:00", "2026-06-13T07:00:00");
    expect(label).toContain("12.06.2026");
    expect(label).toContain("13.06.2026");
    expect(label).toContain("21:00");
    expect(label).toContain("07:00");
  });
  it("clips sleep entering and leaving the selected day", () => {
    const { start, end } = calendarWindow("2026-11-01T12:00:00");
    const result = sleepTotals([
      entry("2026-10-31T22:00:00", "2026-11-01T07:00:00"),
      entry("2026-11-01T19:00:00", "2026-11-02T02:00:00"),
    ], start, end, future);
    expect(result).toEqual({ day: 120, night: 600, total: 720 });
  });
  it("uses the clock, not the nap flag, and ignores invalid or unfinished entries", () => {
    const records = [
      { ...entry("2026-11-01T05:30:00", "2026-11-01T06:30:00"), nap: true },
      entry("invalid", "invalid"), entry("2026-11-01T08:00:00", null),
      entry("2026-11-01T09:00:00", "2026-11-01T08:00:00"),
    ];
    expect(sleepTotals(records, "2026-11-01T00:00:00", "2026-11-02T00:00:00", future)).toEqual({ day: 30, night: 30, total: 60 });
  });
  it("does not double count overlapping or duplicate entries", () => {
    const records = [entry("2026-11-01T05:00:00", "2026-11-01T07:00:00"), entry("2026-11-01T06:00:00", "2026-11-01T08:00:00")];
    const before = JSON.stringify(records);
    expect(sleepTotals([...records, records[0]], "2026-11-01T00:00:00", "2026-11-02T00:00:00", future)).toEqual({ day: 120, night: 60, total: 180 });
    expect(JSON.stringify(records)).toBe(before);
  });
  it("caps today at now and keeps seven rolling windows contiguous", () => {
    const now = new Date("2026-11-01T12:00:00");
    const records = [entry("2026-11-01T10:00:00", "2026-11-01T14:00:00")];
    expect(sleepWindows(records, "calendar", 1, now)[0]).toMatchObject({ partial: true, total: 120 });
    const windows = sleepWindows([], "rolling", 7, now);
    windows.forEach((window, i) => {
      expect(+window.end - +window.start).toBe(86400000);
      if (i) expect(+window.start).toBe(+windows[i - 1].end);
    });
  });
  it("keeps day + night equal to total including fractional minutes", () => {
    const result = sleepTotals([entry("2026-11-01T05:59:40", "2026-11-01T06:00:20")], "2026-11-01T00:00:00", "2026-11-02T00:00:00", future);
    expect(result.day + result.night).toBeCloseTo(result.total, 12);
  });
  it("uses the same midnight split in overview, daily totals and daily report", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T12:00:00"));
    const records = [entry("2026-11-01T22:00:00", "2026-11-02T07:00:00")];
    expect(aggregateSleepByDay(records).slice(-2).map(x => x.hours)).toEqual([2, 7]);
    expect(dailySleepTotals(records, 2).map(x => x.hours)).toEqual([2, 7]);
    expect(buildDailyReport([], [], records, 2).map(x => x.sleepHours)).toEqual([2, 7]);
  });
  // Run with TZ=Europe/Berlin to assert local DST behavior, not merely UTC arithmetic.
  it.runIf(Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Berlin").each([
    ["2026-03-29", 23, 9], ["2026-10-25", 25, 11],
  ])("handles the %s clock change", (date, hours, nightHours) => {
    const { start, end } = calendarWindow(`${date}T12:00:00`);
    expect((end - start) / 3600000).toBe(hours);
    expect(sleepTotals([entry(start, end)], start, end, future)).toEqual({ day: 840, night: nightHours * 60, total: hours * 60 });
    expect(sleepWindows([], "rolling", 1, end)[0].end - sleepWindows([], "rolling", 1, end)[0].start).toBe(86400000);
  });
});
