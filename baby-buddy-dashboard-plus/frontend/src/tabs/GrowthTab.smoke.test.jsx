import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import GrowthTab from "./GrowthTab";
import { UnitContext } from "../utils/units";

vi.mock("../api", () => ({
  api: { getLocalSettings: vi.fn().mockResolvedValue({ feeding_daily_metric: "duration", feeding_average_metric: "duration" }) },
}));

const feeding = {
  id: 1,
  child: 2,
  start: "2026-08-18T08:00:00Z",
  end: "2026-08-18T08:14:00Z",
  duration: "00:14:00",
  method: "right breast",
  type: "breast milk",
  amount: 0,
};

test("Growth renders with duration-based feeding data", () => {
  render(
    <UnitContext.Provider value="metric">
      <GrowthTab
        childId={2}
        demoMode={false}
        birthDate="2026-06-01"
        childSex="male"
        weights={[]}
        heights={[]}
        headCircumferences={[]}
        bmis={[]}
        monthlyFeedings={[feeding]}
        monthlySleep={[]}
        monthlyChanges={[]}
        onEditEntry={vi.fn()}
      />
    </UnitContext.Provider>
  );
  // Feeding charts belong to Analytics. Growth still receives shared monthly
  // data for its summary calculations, but must render without showing an
  // obsolete Daily Feeding card.
  expect(screen.getByText("Weight")).toBeInTheDocument();
});
