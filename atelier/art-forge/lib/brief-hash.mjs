import { createHash } from "node:crypto";

const DROP_KEYS = new Set(["_note"]);

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !DROP_KEYS.has(k))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, val]) => [k, sortValue(val)]),
    );
  }
  return v;
}

export function normalizeBrief(brief) {
  return JSON.stringify(sortValue(brief));
}

export function briefHash(brief) {
  return createHash("sha256")
    .update(normalizeBrief(brief))
    .digest("hex")
    .slice(0, 16);
}
