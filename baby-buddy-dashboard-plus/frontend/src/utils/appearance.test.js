import { afterEach, expect, it } from "vitest";
import { applyAppearance, scheduleActive } from "./appearance";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest stubs CSS imports; inspect the actual stylesheet for token checks.
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
});

const night = { theme: "light", accent: "blue", appearance_schedule_enabled: true,
  appearance_schedule_start: "20:00", appearance_schedule_end: "06:00",
  appearance_schedule_theme: "oled", appearance_schedule_accent: "rose" };
const at = (hour, minute = 0) => new Date(2026, 9, 2, hour, minute);

it.each([[19, 59, false], [20, 0, true], [0, 0, true], [5, 59, true], [6, 0, false]])(
  "uses OLED only within the overnight period at %i:%i", (hour, minute, active) => {
    expect(scheduleActive(night, at(hour, minute))).toBe(active);
    applyAppearance(night, at(hour, minute));
    expect(document.documentElement.dataset.theme).toBe(active ? "oled" : "light");
    expect(document.documentElement.dataset.accent).toBe(active ? "rose" : "blue");
  });

it("supports manual OLED and leaves disabled schedules and previous modes intact", () => {
  applyAppearance({ ...night, theme: "oled", appearance_schedule_enabled: false }, at(12));
  expect(document.documentElement.dataset.theme).toBe("oled");
  applyAppearance({ ...night, appearance_schedule_enabled: false }, at(22));
  expect(document.documentElement.dataset.theme).toBe("light");
  applyAppearance({ ...night, appearance_schedule_theme: "dark" }, at(22));
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("handles daytime and all-day schedules without altering their existing semantics", () => {
  expect(scheduleActive({ ...night, appearance_schedule_start: "08:00", appearance_schedule_end: "18:00" }, at(12))).toBe(true);
  expect(scheduleActive({ ...night, appearance_schedule_start: "08:00", appearance_schedule_end: "18:00" }, at(20))).toBe(false);
  expect(scheduleActive({ ...night, appearance_schedule_start: "08:00", appearance_schedule_end: "08:00" }, at(3))).toBe(true);
});

it("defines true-black OLED surfaces with readable text and dark native controls", () => {
  const block = css.match(/:root\[data-theme="oled"\] \{([^}]+)\}/)[1];
  expect(block).toContain("--bg: #000000");
  expect(block).toContain("--card-bg: #080808");
  expect(block).toContain("color-scheme: dark");
  // WCAG normal-text contrast for the three text tokens against card and page.
  const luminance = (hex) => {
    const rgb = hex.match(/../g).map(v => parseInt(v, 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const token of ["text", "text-muted", "text-dim"]) {
    const hex = block.match(new RegExp(`--${token}: #([0-9a-f]{6})`))[1];
    for (const bg of ["000000", "080808"]) expect((luminance(hex) + .05) / (luminance(bg) + .05)).toBeGreaterThanOrEqual(4.5);
  }
});
