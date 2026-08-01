// Season 1 budget measurement (I-048). Pure: every function takes an explicit
// repo root so tests can point at a fixture instead of live content.
// Record: docs/worldbuilding/DR-003-season-1-budget.md
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJsonAt(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

/** Implemented mob types, from the codegen artifact CI refreshes. */
export function mobBases(root) {
  const doc = readJsonAt(root, "colyseus-server/generated/mob-types.json");
  if (!Array.isArray(doc?.mobTypes)) throw new Error("mob-types.json: expected { mobTypes: string[] }");
  return doc.mobTypes.length;
}

/** Authored creature designs. The file is a top-level array. */
export function bestiaryDesigns(root) {
  const doc = readJsonAt(root, "content/bestiary/bestiary.json");
  if (!Array.isArray(doc)) throw new Error("bestiary.json: expected a top-level array");
  return doc.length;
}

/**
 * Quests reachable without an act-* or event-* unlock anywhere in their
 * transitive unlock chain. DR-001 6.4(4) makes the five acts permanently
 * unreachable, so a quest gated on one can never open. Computed as a LEAST
 * fixed point: a quest joins the free set only once every id it is unlocked by
 * is itself free, so unlock cycles correctly never join.
 *
 * Giver-liveness is deliberately NOT checked here — that is a manual read of
 * canon.md and belongs to the Archivist, not to a counter.
 */
export function actIndependentQuests(root) {
  const quests = readJsonAt(root, "content/story/quests.json");
  if (!Array.isArray(quests)) throw new Error("quests.json: expected a top-level array");
  const free = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of quests) {
      if (free.has(q.id)) continue;
      const unlocks = q.unlockedBy ?? [];
      if (unlocks.every((u) => u.startsWith("quest-") && free.has(u))) {
        free.add(q.id);
        changed = true;
      }
    }
  }
  return free.size;
}

function countArtPrefix(root, prefix) {
  const doc = readJsonAt(root, "game-client/assets/art/art-manifest.json");
  if (!doc?.entries || typeof doc.entries !== "object") {
    throw new Error("art-manifest.json: expected { entries: object }");
  }
  return Object.keys(doc.entries).filter((k) => k.startsWith(prefix)).length;
}

/** Town key art — one of the two art classes Season 1 funds. */
export function townArt(root) {
  return countArtPrefix(root, "art:town-");
}

/** Bestiary art — the other funded class. Zero today. */
export function bestiaryArt(root) {
  return countArtPrefix(root, "art:mob-");
}

export const MEASURES = { mobBases, bestiaryDesigns, actIndependentQuests, townArt, bestiaryArt };

/**
 * One row per budget line. A line that cannot be measured yet reports
 * actual = null and says why — the report must never invent a delta for
 * something nobody can count.
 */
export function buildRows(budget, root) {
  return budget.lines.map((line) => {
    if (line.blockedBy) return { ...line, actual: null, note: `blocked: ${line.blockedBy}` };
    const fn = MEASURES[line.measure];
    if (!fn) return { ...line, actual: null, note: `unknown measure: ${line.measure}` };
    try {
      const actual = fn(root);
      const note = actual >= line.target ? "met" : `${line.target - actual} short`;
      return { ...line, actual, note };
    } catch (err) {
      return { ...line, actual: null, note: `unmeasurable: ${err.message}` };
    }
  });
}

export function renderTable(rows) {
  const pad = (value, width) => String(value).padEnd(width);
  const out = [pad("line", 26) + pad("target", 8) + pad("actual", 8) + "note", "-".repeat(78)];
  for (const row of rows) {
    out.push(pad(row.id, 26) + pad(row.target, 8) + pad(row.actual ?? "-", 8) + row.note);
  }
  return out.join("\n");
}
