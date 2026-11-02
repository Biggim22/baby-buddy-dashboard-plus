import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import FeedingForm from "./FeedingForm";
import { api } from "../../api";
import { setLanguage } from "../../locales";
vi.mock("../../api", () => ({ api: { getLocalSettings: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); setLanguage("en"); });
it("loads the selected child's defaults but not amounts or notes", async () => {
  api.getLocalSettings.mockResolvedValue({ last_feeding_type: "formula", last_feeding_method: "parent fed" });
  render(<FeedingForm childId={2} onClose={() => {}} />);
  await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveValue("formula"));
  expect(screen.getAllByRole("combobox")[1]).toHaveValue("parent fed");
  expect(api.getLocalSettings).toHaveBeenCalledWith(2);
  screen.getAllByRole("textbox").forEach(input => expect(input).toHaveValue(""));
});
it("does not overwrite a manual selection with a late response", async () => {
  let resolve;
  api.getLocalSettings.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<FeedingForm childId={1} onClose={() => {}} />);
  fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "solid food" } });
  await act(async () => resolve({ last_feeding_type: "formula" }));
  expect(screen.getAllByRole("combobox")[0]).toHaveValue("solid food");
});
it("preserves an edited record and does not load defaults", () => {
  render(<FeedingForm childId={1} entry={{ id: 1, type: "formula", method: "bottle", start: "2026-01-01T10:00:00", end: "2026-01-01T10:15:00" }} onClose={() => {}} />);
  expect(screen.getAllByRole("combobox")[0]).toHaveValue("formula");
  expect(api.getLocalSettings).not.toHaveBeenCalled();
});
it("rejects unsupported saved values and retains safe fallbacks", async () => {
  api.getLocalSettings.mockResolvedValue({ last_feeding_type: "unknown", last_feeding_method: "unknown" });
  render(<FeedingForm childId={1} onClose={() => {}} />);
  await act(async () => {});
  expect(screen.getAllByRole("combobox")[0]).toHaveValue("breast milk");
  expect(screen.getAllByRole("combobox")[1]).toHaveValue("bottle");
});
