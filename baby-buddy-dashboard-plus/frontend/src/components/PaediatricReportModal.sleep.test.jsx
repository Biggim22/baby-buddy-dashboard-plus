import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaediatricReportModal from "./PaediatricReportModal";
import { api } from "../api";
import { setLanguage } from "../locales";

vi.mock("../api", () => ({ api: Object.fromEntries([
  "getWeight", "getHeight", "getHeadCircumference", "getBmi", "getTemperature",
  "getMedication", "getFeedings", "getSleep", "getChanges", "getCare", "getTasks", "getLocalSettings",
].map(name => [name, vi.fn()])) }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it("exports actual split sleep hours rather than the number of records", async () => {
  setLanguage("en");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00"));
  Object.values(api).forEach(mock => mock.mockResolvedValue({ results: [] }));
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T22:00:00", end: "2026-11-02T07:00:00" }] });
  api.getCare.mockResolvedValue({ results: [{ id: 2, care_type: "ear_care", time: "2026-11-01T12:00:00Z" }] });
  const { baseElement: container } = render(<PaediatricReportModal childId={1} childName="Demo" onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /create/i }));
  await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
  const text = container.querySelector("pre").textContent;
  expect(text).toMatch(/Sleep.*: 9/);
  // 22:00–07:00 lies fully in the default 19:00–07:00 window, so the whole session is night sleep.
  expect(text).toContain("Day sleep: 0 h");
  expect(text).toContain("Night sleep: 9 h");
  expect(text).toContain("Night window 19:00–07:00");
  expect(text).toContain("Ears cleaned");
  expect(api.getSleep.mock.calls[0][0]).toHaveProperty("end_min");
  expect(api.getSleep.mock.calls[0][0]).not.toHaveProperty("start_min");
  const dateInput = container.querySelector('input[type="date"]');
  fireEvent.change(dateInput, { target: { value: "2026-11-02" } });
  expect(container.querySelector("pre").textContent).toBe(text);
});

it("uses the child's own night window for the report", async () => {
  setLanguage("en");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00"));
  Object.values(api).forEach(mock => mock.mockResolvedValue({ results: [] }));
  api.getLocalSettings.mockResolvedValue({ sleep_night_start: "23:00", sleep_night_end: "05:00" });
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T19:00:00", end: "2026-11-01T22:00:00" }] });
  const { baseElement: container } = render(<PaediatricReportModal childId={1} childName="Demo" onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /create/i }));
  await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
  const text = container.querySelector("pre").textContent;
  expect(text).toContain("Day sleep: 3 h");
  expect(text).toContain("Night sleep: 0 h");
  expect(text).toContain("Night window 23:00–05:00");
});
