// Season 1 budget measurement (I-048). Pure: every function takes an explicit
// repo root so tests can point at a fixture instead of live content.
// Record: docs/worldbuilding/DR-003-season-1-budget.md
import { readFileSync, readdirSync } from "node:fs";
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

// I-060: only files named zone-<something>.json are records. A README, a
// schema copy or an editor scratch file sharing the directory is not a zone
// and must not be counted as one.
const ZONE_FILE = /^zone-.+\.json$/;

/**
 * Zone content records that clear the Z3 floors of the L2 zone-content design
 * (docs/superpowers/specs/2026-08-08-l2-zone-content-design.md §7): at least
 * two hazards, at least two resources, at least two landmarks, and a
 * non-blank reasonToGo. Counts DISTINCT `zone` ids, so two files claiming the
 * same zone can never read as two of the ten.
 *
 * Keyed on the geography zone id ("emberdown"), NOT on a runtime region-* id.
 * That keying is what makes the line measurable at all, and it does not stand
 * in for the X12 keyspace rename (I-056 item 4), which is still owed.
 *
 * It deliberately does NOT enforce the other Z-rules: that the zone exists in
 * cluster1-geography.json (Z1), that all ten are present (Z2), kebab-case ids
 * (Z4), a hazard `effect` that maps to a runtime type (Z5), landmark-name and
 * resource-kind distinctiveness across zones (Z6), or the resource kind enum
 * (Z7). Those belong to checkZoneContent() in scripts/check_content.mjs — a
 * counter that also gates reports a number nobody can reproduce by reading
 * the files.
 */
export function zones(root) {
  const dir = join(root, "content/zones");
  const complete = new Set();
  for (const file of readdirSync(dir).filter((f) => ZONE_FILE.test(f)).sort()) {
    const rel = `content/zones/${file}`;
    const doc = readJsonAt(root, rel);
    if (typeof doc !== "object" || doc === null || Array.isArray(doc))
      throw new Error(`${rel}: expected a zone record object`);
    if (typeof doc.zone !== "string" || doc.zone === "")
      throw new Error(`${rel}: expected a non-empty string "zone"`);
    const meetsFloor = (v) => Array.isArray(v) && v.length >= 2;
    if (
      typeof doc.reasonToGo === "string" &&
      doc.reasonToGo.trim() !== "" &&
      meetsFloor(doc.hazards) &&
      meetsFloor(doc.resources) &&
      meetsFloor(doc.landmarks)
    )
      complete.add(doc.zone);
  }
  return complete.size;
}

export const MEASURES = { mobBases, bestiaryDesigns, actIndependentQuests, townArt, bestiaryArt, zones };

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
      const note =
        actual > line.target ? `${actual - line.target} over` : actual === line.target ? "met" : `${line.target - actual} short`;
      return { ...line, actual, note };
    } catch (err) {
      return { ...line, actual: null, note: `unmeasurable: ${err.message}` };
    }
  });
}

export function renderTable(rows) {
  const pad = (value, width) => String(value).padEnd(width);
  const idWidth = Math.max(26, ...rows.map((row) => String(row.id).length + 2));
  const out = [pad("line", idWidth) + pad("target", 8) + pad("actual", 8) + "note", "-".repeat(78)];
  for (const row of rows) {
    out.push(pad(row.id, idWidth) + pad(row.target, 8) + pad(row.actual ?? "-", 8) + row.note);
  }
  return out.join("\n");
}
