import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CareTab from "./CareTab";
import { api } from "../api";
import { setLanguage } from "../locales";
vi.mock("../api", () => ({ api: { bootstrapLocal: vi.fn(), getCare: vi.fn(), getLocalSettings: vi.fn(), createCare: vi.fn(), updateCare: vi.fn() } }));
const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, care_type: "skin_care", time: "2026-01-25T12:00:00Z", notes: `record ${i + 1}` }));
const latest = [{ id: 99, care_type: "ear_care", time: "2026-01-01T12:00:00Z" }];
beforeEach(() => {
  vi.clearAllMocks(); setLanguage("en");
  api.bootstrapLocal.mockResolvedValue({});
  api.getLocalSettings.mockResolvedValue({ care_header_types: ["ear_care"] });
  api.getCare.mockImplementation(async (_child, _limit, type, offset = 0) => type ? { results: [] } : {
    results: rows.slice(offset, offset + 10), count: 25, next_offset: offset + 10 < 25 ? offset + 10 : null, latest,
  });
});
it("shows ten records, loads older pages and collapses without losing the summary", async () => {
  const { container } = render(<CareTab childId={1} />);
  await screen.findByText("10 of 25");
  expect(container.querySelectorAll(".preview-row")).toHaveLength(10);
  expect(container.querySelector(".care-summary-row").textContent).toContain("Ears cleaned");
  fireEvent.click(screen.getByText("Show 10 more"));
  await screen.findByText("20 of 25");
  expect(api.getCare).toHaveBeenCalledWith(1, 10, "", 10);
  fireEvent.click(screen.getByText("Show 10 more"));
  await screen.findByText("25 of 25");
  expect(screen.queryByText("Show 10 more")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Show fewer"));
  await screen.findByText("10 of 25");
  expect(container.querySelector(".care-summary-row").textContent).toContain("Ears cleaned");
});
it("keeps existing records when loading the next page fails and allows retry", async () => {
  render(<CareTab childId={1} />);
  await screen.findByText("10 of 25");
  api.getCare.mockRejectedValueOnce(new Error("Page failed"));
  fireEvent.click(screen.getByText("Show 10 more"));
  await screen.findByText("Page failed");
  expect(screen.getByText("10 of 25")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Show 10 more"));
  await screen.findByText("20 of 25");
});
it("offers ears as a normal care category and saves the chosen type", async () => {
  api.createCare.mockResolvedValue({ id: 30 });
  render(<CareTab childId={1} />);
  await screen.findByText("10 of 25");
  fireEvent.click(screen.getByRole("button", { name: /log care/i }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "ear_care" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.createCare).toHaveBeenCalledWith(expect.objectContaining({ child_id: 1, care_type: "ear_care" })));
});
