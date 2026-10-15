// Baby Buddy pumping entries have no side field. Plus stores the side as one
// Baby Buddy tag so it stays on the record itself. The tag names are stable
// codes; the dashboard shows them translated.
export const PUMPING_SIDES = ["left", "right", "both"];
const SIDE_TAG_PREFIX = "pumping-";

function tagName(tag) {
  if (typeof tag === "string") return tag;
  return tag?.name || "";
}

export function pumpingSideTag(side) {
  return PUMPING_SIDES.includes(side) ? `${SIDE_TAG_PREFIX}${side}` : null;
}

export function pumpingSideFromTags(tags = []) {
  for (const tag of tags || []) {
    const name = tagName(tag).trim().toLowerCase();
    const side = name.startsWith(SIDE_TAG_PREFIX) ? name.slice(SIDE_TAG_PREFIX.length) : null;
    if (PUMPING_SIDES.includes(side)) return side;
  }
  return null;
}

// Replaces only the side tag; every other tag on the entry is kept.
export function tagsWithPumpingSide(tags = [], side) {
  const kept = (tags || []).map(tagName).filter((name) => name && pumpingSideFromTags([name]) == null);
  const sideTag = pumpingSideTag(side);
  return sideTag ? [...kept, sideTag] : kept;
}
