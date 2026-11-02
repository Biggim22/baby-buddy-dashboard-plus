import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaediatricReportModal from "./PaediatricReportModal";
import { api } from "../api";
import { setLanguage } from "../locales";

vi.mock("../api", () => ({ api: Object.fromEntries([
  "getWeight", "getHeight", "getHeadCircumference", "getBmi", "getTemperature",
  "getMedication", "getFeedings", "getSleep", "getChanges", "getCare", "getTasks",
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
  expect(text).toContain("Day sleep 06–20: 1 h");
  expect(text).toContain("Night sleep: 8 h");
  expect(text).toContain("Ears cleaned");
  expect(api.getSleep.mock.calls[0][0]).toHaveProperty("end_min");
  expect(api.getSleep.mock.calls[0][0]).not.toHaveProperty("start_min");
  const dateInput = container.querySelector('input[type="date"]');
  fireEvent.change(dateInput, { target: { value: "2026-11-02" } });
  expect(container.querySelector("pre").textContent).toBe(text);
});
