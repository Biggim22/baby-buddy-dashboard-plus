import { api } from "../api";
import { calculateBmi } from "./formatters";

/**
 * Call after saving a Weight or Height entry. If a matching entry for the other
 * measurement already exists on the same date, computes BMI and creates or updates the
 * Baby Buddy BMI entry for that date to match - Baby Buddy has no native way to derive BMI
 * from weight+height, and requiring a third manual entry for a value fully determined by
 * two you already logged is redundant. Always keeps the BMI entry in sync with the current
 * weight+height for that date (overwrites a stale or manually-entered value, if any) -
 * best-effort: callers should catch and log, never let this block the save that already
 * succeeded.
 */
export async function syncBmiForDate({ childId, date, weightValue, heightValue, bmis, unitSystem }) {
  const bmi = calculateBmi(weightValue, heightValue, unitSystem);
  if (bmi == null) return false;

  const existing = (bmis || []).find((b) => b.date === date);
  if (existing) {
    if (Number(existing.bmi) === bmi) return false;
    await api.updateBmi(existing.id, { bmi });
  } else {
    await api.createBmi({ child: childId, date, bmi });
  }
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function timeForDate(date) { const time = new Date(date).getTime(); return Number.isNaN(time) ? null : time; }

export function findMeasurementWithinDay(entries, date) {
  const target = timeForDate(date);
  if (target == null) return null;
  return (entries || []).map((entry) => ({ entry, distance: Math.abs(timeForDate(entry.date) - target) }))
    .filter(({ distance }) => Number.isFinite(distance) && distance <= DAY_MS)
    .sort((a, b) => a.distance - b.distance)[0]?.entry || null;
}

/** Backfill BMI for all weight/height pairs recorded less than 24 hours apart. */
export async function syncBmisForMeasurements({ childId, weights, heights, bmis, unitSystem }) {
  let changed = false;
  const currentBmis = [...(bmis || [])];
  for (const weight of weights || []) {
    const height = findMeasurementWithinDay(heights, weight.date);
    if (!height) continue;
    const didChange = await syncBmiForDate({ childId, date: weight.date, weightValue: Number(weight.weight), heightValue: Number(height.height), bmis: currentBmis, unitSystem });
    if (didChange) {
      changed = true;
      const bmi = calculateBmi(Number(weight.weight), Number(height.height), unitSystem);
      const existing = currentBmis.find((entry) => entry.date === weight.date);
      if (existing) existing.bmi = bmi;
      else currentBmis.push({ date: weight.date, bmi });
    }
  }
  return changed;
}
