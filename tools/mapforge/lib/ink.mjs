// tools/mapforge/lib/ink.mjs — G-BIOME-INK.
//
// A biome may not exist without an SVG fill pattern AND a legend row. The
// rule closes FOUR loops and it is symmetric: ink nobody can reach and ink
// nobody can explain are both failures. Pure — no fs, no deps. Returns
// problems in-band and never throws, the basin-sheet.mjs contract (a sheet
// builder returns { svg, notes, problems } and a non-empty problems[] is a
// hard failure at the CLI).
import { C, BIOME_FILL, FILL_FOR, LEGEND, PATTERNS } from "./draft.mjs";
import { BIOMES, TERRAIN_KINDS } from "../../../scripts/lib/spine.mjs";

// The four frontier hatches are reachable through `provenance`, not through
// BIOME_FILL or FILL_FOR, so they must be named here explicitly or
// G-BIOME-INK reports them as "emitted but unreachable".
export const FRONTIER_PATTERNS = Object.freeze({
  sworn: "pReportedSworn",
  hearsay: "pReportedHearsay",
  inferred: "pReportedInferred",
});

// `Object.hasOwn`, not `?? "pReported"`: a bare object literal inherits
// Object.prototype, so `FRONTIER_PATTERNS["constructor"]` is a FUNCTION and
// `??` never fires — the caller would get a function where a pattern id
// belongs and stringify it straight into a fill="url(#...)".
export const frontierPattern = (provenance) =>
  Object.hasOwn(FRONTIER_PATTERNS, provenance)
    ? FRONTIER_PATTERNS[provenance]
    : "pReported";

// The whole palette a fill may draw in. A1-ART-01: ink on cream, and the ONE
// accent colour is reserved entirely for the relay chain — a fill reaching for
// it steals the sheet's only emphasis. `C.ink2` is a zone wash, not ink.
export const INK_ONLY = Object.freeze([C.ink, C.inkMid, C.inkSoft]);

// A tile under ~7 px on either axis reads as a solid grey smear at thumbnail
// scale rather than as a texture — the F-044 lesson.
export const MIN_TILE_PX = 7;

const PATTERN_HEAD = /^<pattern id="([^"]*)" width="([^"]*)" height="([^"]*)"/;
const HEX = /#[0-9a-fA-F]{3,8}/g;

const describe = (v) =>
  Array.isArray(v) ? "an array" : v === null ? "null" : typeof v;

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
 *
 * EVERY argument shape is answered in-band, including null, a non-object, a
 * non-array id list and a non-numeric tier. A gate that throws skips its
 * caller's `finish()` and silently drops every failure recorded before it, and
 * the three gate joins in this repo `return 0` on a failed load — so a gate
 * handed `null` is a realistic state, not a programming error.
 */
export function checkBiomeInk(opts) {
  const problems = [];
  const reach = reachablePatterns();

  const given = opts === undefined || opts === null ? {} : opts;
  const usable = typeof given === "object" && !Array.isArray(given);
  if (!usable)
    problems.push(
      `G-BIOME-INK: checkBiomeInk() takes an options object; got ${describe(opts)}`,
    );
  const src = usable ? given : {};

  const idList = (v, name) => {
    if (v === undefined || v === null) return null;
    if (!Array.isArray(v)) {
      problems.push(
        `G-BIOME-INK: ${name} must be an array of pattern ids or null; got ${describe(v)}`,
      );
      return null;
    }
    const clean = v.filter((id) => typeof id === "string" && id !== "");
    if (clean.length !== v.length)
      problems.push(
        `G-BIOME-INK: ${name} carries ${v.length - clean.length} of ${v.length} entries that are not a pattern id`,
      );
    return clean;
  };
  const emittedIds = idList(src.emittedIds, "emittedIds");
  const referencedIds = idList(src.referencedIds, "referencedIds");

  let legendTier = src.legendTier ?? null;
  if (legendTier !== null && !Number.isFinite(legendTier)) {
    problems.push(
      `G-BIOME-INK: legendTier must be a finite number or null; got ${describe(src.legendTier)}`,
    );
    legendTier = null;
  }

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

  // loop 5 — the ink discipline of the markup ITSELF. Loops 1-4 close the
  // tables; without this one a fill can be a 2 px smear drawn in the relay
  // chain's accent and every table still balances. Nothing else in the tree
  // reads PATTERNS' markup: texture-bake.mjs transcribes its own recipes.
  for (const [id, markup] of Object.entries(PATTERNS)) {
    if (typeof markup !== "string") {
      problems.push(
        `G-BIOME-INK: pattern "${id}" is ${describe(markup)}, not <pattern> markup`,
      );
      continue;
    }
    if (!reach.has(id))
      problems.push(
        `G-BIOME-INK: pattern "${id}" is defined in PATTERNS but nothing can reach it`,
      );
    const head = PATTERN_HEAD.exec(markup);
    if (!head) {
      problems.push(
        `G-BIOME-INK: pattern "${id}" does not open as <pattern id=… width=… height=…>`,
      );
      continue;
    }
    const [, attrId, w, h] = head;
    if (attrId !== id)
      problems.push(
        `G-BIOME-INK: pattern "${id}" is registered under a key its own id attribute ("${attrId}") does not match`,
      );
    for (const [axis, raw] of [
      ["width", w],
      ["height", h],
    ]) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < MIN_TILE_PX)
        problems.push(
          `G-BIOME-INK: pattern "${id}" has ${axis} ${raw} — a tile under ${MIN_TILE_PX} px reads as a solid grey smear at thumbnail scale`,
        );
    }
    for (const hex of new Set(markup.match(HEX) ?? []))
      if (!INK_ONLY.includes(hex))
        problems.push(
          `G-BIOME-INK: pattern "${id}" draws in "${hex}" — a fill may use only ${INK_ONLY.join(", ")}; the accent is reserved for the relay chain`,
        );
  }

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
