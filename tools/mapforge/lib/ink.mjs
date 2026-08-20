// tools/mapforge/lib/ink.mjs — G-BIOME-INK.
//
// A biome may not exist without an SVG fill pattern AND a legend row. The
// rule closes FOUR loops and it is symmetric: ink nobody can reach and ink
// nobody can explain are both failures. Pure — no fs, no deps. Returns
// problems in-band and never throws, the basin-sheet.mjs contract (a sheet
// builder returns { svg, notes, problems } and a non-empty problems[] is a
// hard failure at the CLI).
import { BIOME_FILL, FILL_FOR, LEGEND, PATTERNS } from "./draft.mjs";
import { BIOMES, TERRAIN_KINDS } from "../../../scripts/lib/spine.mjs";

// The four frontier hatches are reachable through `provenance`, not through
// BIOME_FILL or FILL_FOR, so they must be named here explicitly or
// G-BIOME-INK reports them as "emitted but unreachable".
export const FRONTIER_PATTERNS = Object.freeze({
  sworn: "pReportedSworn",
  hearsay: "pReportedHearsay",
  inferred: "pReportedInferred",
});

export const frontierPattern = (provenance) =>
  FRONTIER_PATTERNS[provenance] ?? "pReported";

export function reachablePatterns() {
  return new Set([
    ...Object.values(BIOME_FILL),
    ...Object.values(FILL_FOR),
    "pReported",
    ...Object.values(FRONTIER_PATTERNS),
  ]);
}

/**
 * @param {object}        [opts]
 * @param {string[]|null} [opts.emittedIds]    the pattern ids a built sheet
 *   actually put in <defs>, or null to skip the per-sheet half.
 * @param {string[]|null} [opts.referencedIds] the pattern ids that sheet
 *   actually points a fill at.
 * @param {number|null}   [opts.legendTier]    the sheet's legend tier, or null
 *   to skip.
 * @returns {string[]} problems, one line each, never thrown.
 */
export function checkBiomeInk({
  emittedIds = null,
  referencedIds = null,
  legendTier = null,
} = {}) {
  const problems = [];
  const reach = reachablePatterns();

  // loop 1 — every biome has a fill
  for (const b of BIOMES)
    if (!BIOME_FILL[b])
      problems.push(`G-BIOME-INK: biome "${b}" has no BIOME_FILL entry`);

  // loop 2 — every terrain kind has a fill.
  // The message names the FILE and not a line number: a line number in a
  // message is the same rot-on-insert problem G-CITE exists to kill.
  for (const k of TERRAIN_KINDS)
    if (!FILL_FOR[k])
      problems.push(
        `G-BIOME-INK: terrain kind "${k}" is in TERRAIN_KINDS but has no entry in FILL_FOR (tools/mapforge/lib/draft.mjs) — it will render as blank parchment`,
      );

  // loop 3 — every reachable pattern is actually defined
  for (const id of reach)
    if (!PATTERNS[id])
      problems.push(
        `G-BIOME-INK: pattern "${id}" is referenced but never defined in PATTERNS`,
      );

  // loop 4 — exactly one legend row per reachable pattern, both directions
  const seen = new Map();
  for (const row of LEGEND) {
    if (seen.has(row.pattern))
      problems.push(
        `G-BIOME-INK: pattern "${row.pattern}" has two legend rows`,
      );
    seen.set(row.pattern, row);
    if (!reach.has(row.pattern))
      problems.push(
        `G-BIOME-INK: pattern "${row.pattern}" has a legend row but is unreachable`,
      );
  }
  for (const id of reach)
    if (!seen.has(id))
      problems.push(
        `G-BIOME-INK: pattern "${id}" is reachable but has no legend row`,
      );

  // per-sheet half — emitted vs referenced, both directions
  if (emittedIds && referencedIds) {
    const emitted = new Set(emittedIds);
    const referenced = new Set(referencedIds);
    for (const id of emitted)
      if (!referenced.has(id))
        problems.push(
          `G-BIOME-INK: pattern "${id}" is emitted but unreachable`,
        );
    for (const id of referenced)
      if (!emitted.has(id))
        problems.push(
          `G-BIOME-INK: pattern "${id}" is referenced but not emitted — it will render as blank parchment`,
        );
  }

  // legend tier — a tier that hides a pattern the sheet actually draws
  if (legendTier !== null && referencedIds) {
    const shown = new Set(
      LEGEND.filter((r) => r.tier <= legendTier).map((r) => r.pattern),
    );
    for (const id of referencedIds)
      if (!shown.has(id))
        problems.push(
          `G-BIOME-INK: pattern "${id}" is drawn at legend tier ${legendTier} but has no visible legend row`,
        );
  }

  return problems;
}
