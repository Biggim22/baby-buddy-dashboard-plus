import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsTab from "./SettingsTab";
import { api } from "../api";
import { setLanguage } from "../locales";

vi.mock("../api", () => ({ api: {
  bootstrapLocal: vi.fn(), getLocalSettings: vi.fn(), getHaTargets: vi.fn(),
  getCalendarTargets: vi.fn(), getTasks: vi.fn(), updateLocalSettings: vi.fn(), createCarePairing: vi.fn(),
} }));

beforeEach(() => {
  vi.clearAllMocks();
  setLanguage("en");
  api.bootstrapLocal.mockResolvedValue({});
  api.getLocalSettings.mockResolvedValue({});
  api.getHaTargets.mockResolvedValue({ notify: [], media_players: [] });
  api.getCalendarTargets.mockResolvedValue({ calendars: [] });
  api.getTasks.mockResolvedValue({ results: [
    { id: 7, title: "Test task", active: 1, task_kind: "task" },
    { id: 8, title: "Inactive test", active: 0, task_kind: "task" },
    { id: 9, title: "Test appointment", active: 1, task_kind: "appointment" },
  ] });
  api.updateLocalSettings.mockResolvedValue({});
  api.createCarePairing.mockResolvedValue({ pairing_code: "TEST2345", expires_at: "2026-10-02T12:10:00+02:00" });
});

it("requires explicit task opt-in and permits task-only pairing", async () => {
  render(<SettingsTab childId={2} embedded />);
  const task = await screen.findByLabelText("Test task · ID 7");
  expect(task).not.toBeChecked();
  expect(screen.queryByText(/Inactive test/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Test appointment/)).not.toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Create one-time pairing code" });
  expect(button).toBeDisabled();
  fireEvent.click(task);
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(api.createCarePairing).toHaveBeenCalledWith(2));
  expect(api.updateLocalSettings).toHaveBeenCalledWith(2, {
    ha_care_allowed_types: [], ha_task_allowed_ids: [7], ha_measurement_allowed_types: [],
  });
});

it("starts measurement permissions disabled and saves only selected types", async () => {
  render(<SettingsTab childId={2} embedded />);
  await screen.findByLabelText("Test task · ID 7");
  const weight = screen.getByLabelText("Weight");
  expect(weight).not.toBeChecked();
  fireEvent.click(weight);
  fireEvent.click(screen.getByRole("button", { name: "Create one-time pairing code" }));
  await waitFor(() => expect(api.updateLocalSettings).toHaveBeenCalledWith(2, {
    ha_care_allowed_types: [], ha_task_allowed_ids: [], ha_measurement_allowed_types: ["weight"],
  }));
});

it("offers OLED manually and in the schedule without changing existing defaults", async () => {
  render(<SettingsTab childId={2} embedded />);
  const mode = await screen.findByLabelText("Mode");
  const scheduledMode = screen.getByLabelText("Mode during period");
  expect(mode).toHaveValue("dark");
  expect(scheduledMode).toHaveValue("dark");
  fireEvent.change(mode, { target: { value: "oled" } });
  expect(document.documentElement.dataset.theme).toBe("oled");
  fireEvent.change(scheduledMode, { target: { value: "oled" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(api.updateLocalSettings).toHaveBeenCalledWith(2, expect.objectContaining({ theme: "oled", appearance_schedule_theme: "oled" })));
});

it("keeps card layout, medication list and diaper calculator on the single settings page", async () => {
  api.getLocalSettings.mockResolvedValue({ tab_hidden_cards: { growth: ["bmi"] }, tab_card_order: {}, medication_presets: [] });
  render(<SettingsTab childId={2} embedded />);
  expect(document.querySelector("details")).toBeNull();
  const bmi = await screen.findByLabelText("Progress · Growth: BMI Trend");
  expect(bmi).not.toBeChecked();
  fireEvent.click(bmi);
  fireEvent.click(screen.getByLabelText("Progress · Growth: Weight Trend"));
  fireEvent.change(screen.getByPlaceholderText("Name of the new entry"), { target: { value: "Test medicine" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(screen.getByLabelText("Show calculator at the end of Analytics"));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(api.updateLocalSettings).toHaveBeenCalledWith(2, expect.objectContaining({
    tab_hidden_cards: { growth: ["weight"] },
    medication_presets: [expect.objectContaining({ name: "Test medicine" })],
    analytics_diaper_calculator_enabled: true,
  })));
});

it("keeps overview history cards off until the family switches them on", async () => {
  render(<SettingsTab childId={2} embedded />);
  const history = await screen.findByLabelText(/Also show history cards on the overview/);
  expect(history).not.toBeChecked();
  fireEvent.click(history);
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(api.updateLocalSettings).toHaveBeenCalledWith(2, expect.objectContaining({ overview_show_history: true })));
});
