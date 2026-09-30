export const MEDICATION_UNITS = ["", "mg", "ml", "tablets", "drops"];
export const CARAWAY_SUPPOSITORY = "caraway_suppository";

export function normalizePresets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((preset) => preset && typeof preset.id === "string" && typeof preset.name === "string" && preset.name.trim())
    .map((preset) => ({
      id: preset.id,
      name: preset.name.trim(),
      unit: MEDICATION_UNITS.includes(preset.unit) ? preset.unit : "",
      hidden: preset.hidden === true,
    }));
}

export function visiblePresets(value) {
  return normalizePresets(value).filter((preset) => !preset.hidden);
}

export function createPresetId(existing = []) {
  const ids = new Set(existing.map((preset) => preset.id));
  let id;
  do id = `med-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  while (ids.has(id));
  return id;
}

export function hasPresetNamed(presets, name) {
  const wanted = String(name || "").trim().toLocaleLowerCase();
  return normalizePresets(presets).some((preset) => preset.name.toLocaleLowerCase() === wanted);
}

const sameName = (a, b) => String(a || "").trim().toLocaleLowerCase() === String(b || "").trim().toLocaleLowerCase();

// A medication already in Baby Buddy at the same minute and name means an earlier transfer
// created it but did not finish removing the care entry, so only the removal is repeated.
export function planCarawayMigration(careEntries, medications, name) {
  return (careEntries || [])
    .filter((entry) => entry.care_type === CARAWAY_SUPPOSITORY)
    .map((entry) => {
      const time = new Date(entry.time).getTime();
      const alreadyTransferred = (medications || []).some((medication) =>
        sameName(medication.name, name) && Math.abs(new Date(medication.time).getTime() - time) < 60000);
      return { entry, create: !alreadyTransferred };
    });
}

export async function runCarawayMigration({ plan, name, childId, createMedication, deleteCare }) {
  const result = { transferred: 0, failed: 0 };
  for (const { entry, create } of plan) {
    try {
      if (create) {
        const data = { child: childId, name: name.trim(), time: new Date(entry.time).toISOString() };
        if (entry.notes?.trim()) data.notes = entry.notes.trim();
        await createMedication(data);
      }
      await deleteCare(entry.id);
      result.transferred += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
