import { describe, expect, it } from "vitest";
import { calculateDiaperForecast, PAMPERS_RANGES } from "./DiaperSizeCalculator";

describe("diaper stock forecast", () => {
  it("returns ordered lower, expected and upper stock bounds", () => {
    const now = new Date();
    const weights = [0, 14, 28, 42].map((daysAgo, index) => ({ date: new Date(now.getTime() - daysAgo * 86400000).toISOString(), weight: 9.8 - index * 0.55 }));
    const changes = [];
    for (let day = 1; day <= 14; day += 1) {
      for (let item = 0; item < 6 + (day % 3); item += 1) changes.push({ time: new Date(now.getTime() - day * 86400000 + item * 3600000).toISOString() });
    }
    const result = calculateDiaperForecast({ weights, heights: [{ height: 70 }], bmis: [], changes, ranges: PAMPERS_RANGES, fit: "auto" });
    expect(result.enoughData).toBe(true);
    expect(result.lowerCount).toBeLessThanOrEqual(result.expectedCount);
    expect(result.expectedCount).toBeLessThanOrEqual(result.upperCount);
  });
});
