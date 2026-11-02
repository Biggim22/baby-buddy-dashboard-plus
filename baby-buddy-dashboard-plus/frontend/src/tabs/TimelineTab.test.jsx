import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import TimelineTab from "./TimelineTab";
import { api } from "../api";
import { setLanguage } from "../locales";
vi.mock("../api", () => ({ api: Object.fromEntries(["createSleep", "updateSleep", "getLocalSettings", "getLocalTimeline", "getFeedings", "getSleep", "getChanges", "getTummyTimes", "getMedication", "getNotes"].map(name => [name, vi.fn()])) }));
beforeEach(() => {
  localStorage.clear();
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
  render(<TimelineTab childId={1} sortOrder="oldest" onOpenSection={open} />);
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

it("filters sleep and feeding together, including endpoints, without reloading records", async () => {
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T10:00:00", end: "2026-11-01T12:00:00" }] });
  api.getFeedings.mockResolvedValue({ results: [{ id: 2, start: "2026-11-01T11:00:00", end: "2026-11-01T11:20:00" }] });
  api.getChanges.mockResolvedValue({ results: [{ id: 3, time: "2026-11-01T11:10:00", wet: true }] });
  render(<TimelineTab childId={1} childName="Demo" />);
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(5));
  fireEvent.click(screen.getByRole("button", { name: "Sleep & feeding only" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getAllByText("Start")).toHaveLength(2);
  expect(screen.getAllByText("End")).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem("bbd_timeline_filters_1"))).toEqual(["sleep", "feeding"]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sleep" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByText("During:")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All on this day" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  expect(api.getSleep).toHaveBeenCalledTimes(1);
});

it("restores per-child filters and allows an empty selection without affecting other children", async () => {
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T10:00:00", end: "2026-11-01T12:00:00" }] });
  localStorage.setItem("bbd_timeline_filters_1", JSON.stringify([]));
  localStorage.setItem("bbd_timeline_filters_2", JSON.stringify(["sleep", "obsolete"]));
  const view = render(<TimelineTab childId={1} />);
  await screen.findByText("No entries for this day and filter selection.");
  expect(screen.getAllByRole("checkbox").every(box => !box.checked)).toBe(true);
  view.rerender(<TimelineTab childId={2} />);
  expect(await screen.findByRole("checkbox", { name: "Sleep" })).toBeChecked();
  expect(screen.getAllByRole("checkbox").filter(box => box.checked)).toHaveLength(1);
  view.rerender(<TimelineTab childId={1} />);
  await screen.findByRole("checkbox", { name: "Sleep" });
  expect(screen.getAllByRole("checkbox").every(box => !box.checked)).toBe(true);
});

it("offers only present day categories with icons and distinct phase counts, even when unchecked", async () => {
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-10-31T23:00:00", end: "2026-11-01T06:00:00" }] });
  render(<TimelineTab childId={1} />);
  const checkbox = await screen.findByRole("checkbox", { name: "Sleep" });
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(checkbox.closest("label").querySelector("svg")).not.toBeNull();
  expect(checkbox.closest("label")).toHaveTextContent("· 1");
  fireEvent.click(checkbox);
  expect(screen.getByRole("checkbox", { name: "Sleep" })).not.toBeChecked();
});

it("requires opt-in, offers absent categories, creates rather than edits, and refreshes without losing the day", async () => {
  api.getFeedings.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T00:03:00", end: "2026-11-01T00:08:00" }] });
  api.getChanges.mockResolvedValue({ results: [{ id: 2, time: "2026-11-01T06:18:00", wet: true }] });
  const refreshed = vi.fn();
  render(<TimelineTab childId={1} onDataChanged={refreshed} />);
  await screen.findByRole("checkbox", { name: "Diaper" });
  expect(screen.queryByRole("button", { name: /Add past entry/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: "Backfill mode" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Add past entry/ })[1]);
  fireEvent.click(screen.getByRole("button", { name: "Sleep" }));
  const inputs = document.querySelectorAll('input[type="datetime-local"]');
  expect(inputs[0]).toHaveValue("2026-11-01T00:08");
  expect(inputs[1]).toHaveValue("2026-11-01T06:18");
  api.createSleep.mockImplementation(async payload => {
    api.getSleep.mockResolvedValue({ results: [{ id: 3, ...payload }] });
    return { id: 3, ...payload };
  });
  fireEvent.submit(inputs[0].closest("form"));
  await waitFor(() => expect(api.createSleep).toHaveBeenCalledTimes(1));
  expect(api.createSleep).toHaveBeenCalledWith(expect.objectContaining({ child: 1, start: new Date("2026-11-01T00:08:00").toISOString(), end: new Date("2026-11-01T06:18:00").toISOString() }));
  expect(api.updateSleep).not.toHaveBeenCalled();
  expect(await screen.findByRole("checkbox", { name: "Sleep" })).toBeChecked();
  await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("switch")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
  expect(screen.getByRole("switch")).not.toBeChecked();
  expect(screen.queryByRole("button", { name: /Add past entry/ })).not.toBeInTheDocument();
});

it("supports empty-day creation and closes the picker with Escape", async () => {
  render(<TimelineTab childId={1} />);
  await screen.findByText("No entries for this day and filter selection.");
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  fireEvent.click(screen.getByRole("switch"));
  const button = screen.getByRole("button", { name: /Add past entry/ });
  button.focus(); fireEvent.click(button);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
});

it("defaults to newest first and reverses endpoints with the setting", async () => {
  api.getSleep.mockResolvedValue({ results: [{ id: 1, start: "2026-11-01T10:00:00", end: "2026-11-01T12:00:00" }] });
  const view = render(<TimelineTab childId={1} />);
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("End");
  expect(view.container.querySelectorAll(".timeline-bracket-first")).toHaveLength(1);
  expect(view.container.querySelectorAll(".timeline-bracket-last")).toHaveLength(1);
  view.rerender(<TimelineTab childId={1} sortOrder="oldest" />);
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Start");
  fireEvent.click(screen.getByRole("checkbox", { name: "Sleep" }));
  expect(view.container.querySelectorAll(".timeline-bracket")).toHaveLength(0);
});
