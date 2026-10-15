import { describe, expect, it } from "vitest";
import { pumpingSideFromTags, tagsWithPumpingSide } from "./pumping";

describe("pumping side tags", () => {
  it("reads the side from string or object tags", () => {
    expect(pumpingSideFromTags(["pumping-left"])).toBe("left");
    expect(pumpingSideFromTags([{ name: "Pumping-Both" }])).toBe("both");
    expect(pumpingSideFromTags(["evening"])).toBeNull();
    expect(pumpingSideFromTags(undefined)).toBeNull();
  });

  it("replaces only the side tag and keeps other tags", () => {
    expect(tagsWithPumpingSide(["evening", "pumping-left"], "right")).toEqual(["evening", "pumping-right"]);
    expect(tagsWithPumpingSide([{ name: "evening" }], "both")).toEqual(["evening", "pumping-both"]);
    expect(tagsWithPumpingSide(["pumping-left"], null)).toEqual([]);
  });
});
