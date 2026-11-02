import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TimelineTab from "./TimelineTab";
import { api } from "../api";
import { setLanguage } from "../locales";
vi.mock("../api", () => ({ api: Object.fromEntries(["getLocalTimeline", "getFeedings", "getSleep", "getChanges", "getTummyTimes", "getMedication", "getNotes"].map(name => [name, vi.fn()])) }));
beforeEach(() => {
  setLanguage("en");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T18:00:00"));
  Object.values(api).forEach(mock => mock.mockResolvedValue({ results: [], next: null }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("shows care and confirmed tasks during sleep with links to their source sections", async () => {
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T10:00:00", end: "2026-11-01T12:00:00" }] });
  api.getLocalTimeline.mockResolvedValue({ results: [
    { id: "care-1", kind: "care", care_type: "ear_care", time: "2026-11-01T11:00:00", title: "", notes: "" },
    { id: "task-2-2026-10-31", kind: "task", time: "2026-11-01T11:15:00", title: "Vitamin D", due_date: "2026-10-31" },
  ] });
  const open = vi.fn();
  render(<TimelineTab childId={1} onOpenSection={open} />);
  await screen.findByText(/Task confirmed: Vitamin D/);
  expect(screen.getByText(/Ears cleaned/)).toBeInTheDocument();
  expect(screen.getAllByText("During:")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Open section" })[0]);
  expect(open).toHaveBeenCalledWith("care");
  fireEvent.click(screen.getAllByRole("button", { name: "Open section" })[1]);
  expect(open).toHaveBeenCalledWith("tasks");
});
it("renders a diaper during sleep, keeps endpoints editable and requests overlapping records", async () => {
  const sleep = { id: 1, start: "2026-11-01T10:00:00", end: "2026-11-01T12:00:00" };
  api.getSleep.mockResolvedValue({ results: [sleep] });
  api.getChanges.mockResolvedValue({ results: [{ id: 2, time: "2026-11-01T11:00:00", wet: true }] });
  const edit = vi.fn();
  render(<TimelineTab childId={1} childName="Demo" onEditEntry={edit} />);
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
  expect(screen.getByText("Start")).toBeInTheDocument();
  expect(screen.getByText("End")).toBeInTheDocument();
  expect(screen.getByText("During:")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[2]);
  expect(edit).toHaveBeenCalledWith("sleep", sleep);
  expect(api.getSleep.mock.calls[0][0]).toHaveProperty("end_min");
  expect(api.getSleep.mock.calls[0][0]).not.toHaveProperty("start_min");
});
it("does not leak a hidden sleep category through context labels", async () => {
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T10:00:00", end: "2026-11-01T12:00:00" }] });
  api.getChanges.mockResolvedValue({ results: [{ id: 2, time: "2026-11-01T11:00:00", wet: true }] });
  render(<TimelineTab childId={1} childName="Demo" hiddenCards={["sleep"]} />);
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  expect(screen.queryByText("During:")).not.toBeInTheDocument();
});
