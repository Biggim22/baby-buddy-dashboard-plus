import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OverviewTab from "./OverviewTab";
import { api } from "../api";
import { setLanguage } from "../locales";

vi.mock("../api", () => ({ api: { bootstrapLocal: vi.fn(), getLocalSettings: vi.fn() } }));
vi.mock("../components/TaskPanel", () => ({ TaskOverview: () => null }));

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const feeding = { id: 1, start: minutesAgo(43), end: minutesAgo(20), duration: "00:23:00", type: "breast milk", method: "left breast" };
const renderOverview = () => render(<OverviewTab childId={1} feedings={[feeding]} weeklyFeedings={[]} sleepEntries={[]} weeklySleep={[]} changes={[]} tummyTimes={[]} medications={[]} />);

beforeEach(() => {
  vi.clearAllMocks();
  setLanguage("en");
  api.bootstrapLocal.mockResolvedValue({});
});

it("measures the latest feeding from its end by default", async () => {
  api.getLocalSettings.mockResolvedValue({});
  renderOverview();
  await waitFor(() => expect(api.getLocalSettings).toHaveBeenCalled());
  expect(screen.getByText("20m ago")).toBeInTheDocument();
});

it("measures the latest feeding from its start when configured", async () => {
  api.getLocalSettings.mockResolvedValue({ overview_feeding_age_basis: "start" });
  renderOverview();
  await waitFor(() => expect(screen.getByText("43m ago")).toBeInTheDocument());
});
