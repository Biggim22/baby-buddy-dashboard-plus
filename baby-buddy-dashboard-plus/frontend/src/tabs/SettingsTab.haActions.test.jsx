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
  render(<SettingsTab childId={2} embedded scope="care" />);
  fireEvent.click(await screen.findByText("Log care from Home Assistant"));
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
  render(<SettingsTab childId={2} embedded scope="care" />);
  fireEvent.click(await screen.findByText("Log care from Home Assistant"));
  await screen.findByLabelText("Test task · ID 7");
  const weight = screen.getByLabelText("Weight");
  expect(weight).not.toBeChecked();
  fireEvent.click(weight);
  fireEvent.click(screen.getByRole("button", { name: "Create one-time pairing code" }));
  await waitFor(() => expect(api.updateLocalSettings).toHaveBeenCalledWith(2, {
    ha_care_allowed_types: [], ha_task_allowed_ids: [], ha_measurement_allowed_types: ["weight"],
  }));
});
