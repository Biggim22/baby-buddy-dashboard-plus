import { describe, expect, it, vi } from "vitest";
import { hasPresetNamed, normalizePresets, planCarawayMigration, runCarawayMigration, visiblePresets } from "./medicationPresets";

describe("personal medication list", () => {
  it("keeps only name, unit and visibility and drops anything else", () => {
    expect(normalizePresets([{ id: "a", name: " Example ", unit: "ml", dosage: 5 }, { id: "b", name: "  " }, { id: "c", name: "Other", unit: "spoon" }]))
      .toEqual([{ id: "a", name: "Example", unit: "ml", hidden: false }, { id: "c", name: "Other", unit: "", hidden: false }]);
  });

  it("is empty when nothing was created and hides hidden entries in the form", () => {
    expect(visiblePresets(undefined)).toEqual([]);
    expect(visiblePresets([{ id: "a", name: "A", hidden: true }, { id: "b", name: "B" }]).map((preset) => preset.id)).toEqual(["b"]);
  });

  it("matches names case-insensitively", () => {
    expect(hasPresetNamed([{ id: "a", name: "Example" }], " example ")).toBe(true);
    expect(hasPresetNamed([], "example")).toBe(false);
  });
});

describe("caraway suppository transfer", () => {
  const care = [
    { id: 1, care_type: "caraway_suppository", time: "2026-09-01T08:00:00+00:00", notes: "evening" },
    { id: 2, care_type: "caraway_suppository", time: "2026-09-02T08:00:00+00:00", notes: "" },
    { id: 3, care_type: "caraway_oil", time: "2026-09-03T08:00:00+00:00", notes: "" },
  ];

  it("only transfers suppositories and skips entries already present in Baby Buddy", () => {
    const plan = planCarawayMigration(care, [{ name: "caraway SUPPOSITORY", time: "2026-09-02T08:00:20Z" }], "Caraway suppository");
    expect(plan.map(({ entry, create }) => [entry.id, create])).toEqual([[1, true], [2, false]]);
  });

  it("deletes a care entry only after its medication entry was created", async () => {
    const calls = [];
    const createMedication = vi.fn(async (data) => { calls.push(["create", data.time]); if (data.notes === "evening") throw new Error("offline"); });
    const deleteCare = vi.fn(async (id) => { calls.push(["delete", id]); });
    const plan = planCarawayMigration(care, [], "Caraway suppository");

    const result = await runCarawayMigration({ plan, name: " Caraway suppository ", childId: 7, createMedication, deleteCare });

    expect(result).toEqual({ transferred: 1, failed: 1 });
    expect(deleteCare).toHaveBeenCalledTimes(1);
    expect(deleteCare).toHaveBeenCalledWith(2);
    expect(createMedication).toHaveBeenLastCalledWith({ child: 7, name: "Caraway suppository", time: "2026-09-02T08:00:00.000Z" });
    expect(calls.at(-1)).toEqual(["delete", 2]);
  });
});
