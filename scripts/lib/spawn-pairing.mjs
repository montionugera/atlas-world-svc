// G-SPAWN-PAIR (F-031) — bind the authored spawn table to the runtime one.
//
// The repo has TWO spawn tables and, until I-015 lands a real map loader,
// nothing connects them: content/maps/atlas-frontier.md is gated but never
// executed, and colyseus-server/src/config/mapConfig.ts is executed but never
// gated. F-030 put its boss in the world by hand-editing the runtime file.
//
// This rule stops the two halves drifting FURTHER apart without pretending to
// unify them. An authored area must have a same-id runtime counterpart with
// the same mobType and count. Geometry is deliberately NOT compared — the two
// files describe different worlds, so a coordinate check would be a fiction
// that fails on day one against five pre-existing mismatches.
//
// Lives in scripts/lib/ rather than inside check_content.mjs because that file
// ends with a bare main() + process.exit(): importing it from a test would run
// the whole gate and kill the test process. Same pattern as lib/story.mjs and
// lib/season1.mjs.

/**
 * The eight spawn-area ids that predate the content layer. They are unpaired
 * by HISTORY, not by mistake, and reconciling them belongs to I-015 — not
 * here. Nothing may be added to this list: a new area must be authored in BOTH
 * files. `spawn-pairing.test.mjs` pins the contents so growing it requires
 * editing that test on purpose.
 */
export const LEGACY_UNPAIRED = new Set([
  "center_courtyard",
  "north_ice_fields",
  "south_mud_pit",
  "east_dunes",
  "boss_area",
  "meadow_wilds",
  "icefield_stoneguard",
  "thornveil_skirmishers",
]);

/**
 * Pure comparison, so the rule is unit-testable without touching the
 * filesystem.
 *
 * @param {Array<{id: string, mobType: string, count: number}>} authoredAreas
 *   `mobSpawnAreas` from a content/maps/*.md frontmatter (extra keys ignored).
 * @param {Array<{id: string, mobType: string, count: number}>} runtimeAreas
 *   `areas` from colyseus-server/generated/spawn-areas.json.
 * @param {(msg: string) => void} failFn
 */
export function checkSpawnPairing(authoredAreas, runtimeAreas, failFn) {
  const runtimeById = new Map(runtimeAreas.map((a) => [a.id, a]));
  for (const a of authoredAreas) {
    if (LEGACY_UNPAIRED.has(a.id)) continue;
    const r = runtimeById.get(a.id);
    if (!r) {
      failFn(
        `G-SPAWN-PAIR: authored spawn area "${a.id}" has no runtime counterpart in ` +
          `colyseus-server/src/config/mapConfig.ts ` +
          `(add it there, then re-run colyseus-server/scripts/codegen/gen-spawn-areas.sh)`,
      );
      continue;
    }
    if (r.mobType !== a.mobType)
      failFn(
        `G-SPAWN-PAIR: spawn area "${a.id}" mobType differs — authored "${a.mobType}", runtime "${r.mobType}"`,
      );
    if (r.count !== a.count)
      failFn(
        `G-SPAWN-PAIR: spawn area "${a.id}" count differs — authored ${a.count}, runtime ${r.count}`,
      );
  }
}
