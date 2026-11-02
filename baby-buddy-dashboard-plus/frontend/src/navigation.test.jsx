import { it, expect } from "vitest";
import { getTabs } from "./App";
import { getTabCardGroups } from "./utils/tabCards";
it("keeps six stable tabs with history last and independent growth/analytics preferences", () => {
  expect(getTabs(key => key).map(x => x.id)).toEqual(["overview", "analytics", "growth", "care", "tasks", "timeline"]);
  const groups = getTabCardGroups(key => key);
  expect(groups.find(x => x.tabId === "growth").cards.map(x => x.id)).toContain("weight");
  expect(groups.find(x => x.tabId === "analytics").cards.map(x => x.id)).toContain("sleep");
});
