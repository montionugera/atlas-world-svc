// tools/mapforge/lib/synthetic-sheet.mjs — the target-density canary.
//
// Spec R10: "build the fills, glyphs, priority declutter and zoom tiers
// against today's small chart, where a regression is visible." Today's chart
// is small enough that a target-density regression would not show up in it at
// all — so this sheet IS the target density, and it is committed, indexed and
// locked like any other artifact (owner rule, 2026-08-15).
//
// It draws no real geography and claims none: it is a test instrument. What
// it does claim is the SIZE of the world Plan C is about to generate —
// 13 landmasses, 160 regions, 1,740 landform instances, 340 labels, on the
// atlas sheet's own 400 km / 3.5 px-per-km frame.
//
// Three deliberate choices make it a canary rather than a demo:
//
//   1. Every one of the 1,740 instances is a FAMILY-SPECIFIC mark at
//      GLYPH_SIZE.min. The live world will draw ~340 named marks and leave the
//      other 1,400 as texture; a canary that did the same would be measuring
//      an easier sheet than the one it warns about.
//   2. The instance types are the REAL lexicon, cycled so every one of the 170
//      catalogued types carries 10 or 11 named instances. That puts
//      checkGlyphCoverage in its strongest mode — every catalogued row must
//      resolve to a family — instead of the vacuous mode a census derived from
//      the emitted glyphs would produce.
//   3. `referencedIds` for G-BIOME-INK is scanned out of the ASSEMBLED MARKUP,
//      not re-derived from the same table that produced `emittedIds`. A
//      comparison between two views of one table is not a comparison.
//
// Builder contract, exactly as basin-sheet.mjs: NEVER THROW, return
// { svg, notes, problems }. Deterministic: no Math.random, no clock, no
// Math.hypot. `Math.sqrt` IS used (one lattice-side calculation) and is not
// the same risk: IEEE 754 mandates it be correctly rounded, so it is exact on
// every engine — unlike sin/cos/hypot, which are the real determinism hazard
// and appear nowhere. Same distinction labels.mjs draws.
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { C, r2, esc, LEGEND, patternDefs } from "./draft.mjs";
import { checkBiomeInk } from "./ink.mjs";
import {
  symbolDefs,
  glyphUse,
  checkGlyphCoverage,
  checkGlyphSizes,
  GLYPHS,
  GLYPH_SIZE,
} from "./glyphs.mjs";
import { placeLabels, checkLabels, RANKS } from "./labels.mjs";
import { bakedUnderlay } from "./texture-bake.mjs";
import { BIOMES } from "../../../scripts/lib/spine.mjs";

// One integer hash, seeded once — no Math.random, no clock, no transcendental.
// The finalizer is murmur3's fmix32, the same one glyphs.mjs settled on after
// the weaker xorshift variant was measured to avalanche so poorly for small
// adjacent seeds that r2()'s two-decimal quantiser erased the jitter entirely.
function rnd(seed, i) {
  let h = Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(i | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0, 1)
}

// `ocean` is the one biome a LAND region may not be, and it is excluded by
// name rather than by index so a reordering of BIOMES cannot silently swap it
// for something else.
const LAND_BIOMES = BIOMES.filter((b) => b !== "ocean");

// Self-defence, NOT a design budget. `Number.isInteger(n) && n > 0` has no
// upper bound, and `instances: 5_000_000` does not throw — it exhausts the
// heap, and a V8 OOM is a fatal process abort that `buildUncached`'s try/catch
// cannot intercept. Measured under --max-old-space-size=256. A count past this
// is treated exactly like an unusable one (degrade to an empty census), which
// the G-CANARY census gate then reports in-band. The REAL budget is
// content/world/budgets.json, enforced by the caller below; this number only
// has to be far enough above any sane world to never bind, and low enough that
// the collection fits in memory.
const SANE_MAX = 100000;

// Place names, committed. Widths matter (the declutter is driven by
// measureText), the words themselves do not — but a chart of eleven repeated
// strings measures eleven box widths, so the list is long and deliberately
// spread from 5 to 19 characters.
const WORDS = Object.freeze([
  "Gildmark", "the Drowned Stair", "Rooktide Reach", "Netstead", "Ashen Spar",
  "Quillreef", "the Meltwash", "Skerryfast", "Thirstwold", "Loamspit",
  "Wracklow", "Cairnhollow", "Sedgeport", "the Long Tally", "Barrowmeet",
  "Fenwake", "Hollowcast", "the Sunken Weir", "Draymoor", "Stellhaven",
  "Kelp", "Marrowgate", "the Bone Ford", "Tarnvigil", "Windrow",
  "Coldreach Deeps", "Stonemoor", "the Rimewall Cap", "Ferry", "Ashwick",
]);

/**
 * The fixture world. Pure, deterministic, and it never throws: every argument
 * it cannot use degrades to an empty census, which `buildSyntheticSheet` then
 * reports as a census miss rather than a crash.
 *
 * @param {number}   seed        integer seed for the hash
 * @param {number}   landmasses  distinct landmass ids to spread the regions over
 * @param {number}   regions     exact region count
 * @param {number}   instances   exact landform-instance count
 * @param {number}   labels      exact label count (must equal sum(rankMix))
 * @param {number}   frameKm     the square frame's side, in km
 * @param {object[]} lexicon     content/world/lexicon/landforms.json rows
 * @param {object}   rankMix     RANKS key -> how many labels of that rank
 * @returns {{regions, instances, labels, namedCounts}}
 */
export function makeSyntheticWorld(opts) {
  // NOT a destructuring default: `= {}` fires for `undefined` only, and `null`
  // is what a failed readJson hands a caller. This function is called from a
  // sheet builder whose whole contract is that it does not throw.
  const src = opts && typeof opts === "object" && !Array.isArray(opts) ? opts : {};
  const {
    seed = 0,
    landmasses = 1,
    regions = 0,
    instances = 0,
    labels = 0,
    frameKm = 1,
    lexicon = [],
    rankMix = {},
  } = src;
  const mix = rankMix && typeof rankMix === "object" && !Array.isArray(rankMix) ? rankMix : {};
  const rows = Array.isArray(lexicon)
    ? lexicon.filter((r) => r && typeof r.id === "string")
    : [];
  const usable = (n) => (Number.isInteger(n) && n > 0 && n <= SANE_MAX ? n : 0);
  const nRegions = usable(regions);
  const nInst = usable(instances);
  const groups = Number.isInteger(landmasses) && landmasses > 0 ? landmasses : 1;
  const km = Number.isFinite(frameKm) && frameKm > 0 ? frameKm : 1;

  // --- regions ------------------------------------------------------------
  // A square lattice of `side x side` cells, of which the `side^2 - regions`
  // highest-hashing cells are DROPPED. Dropping by hash rather than truncating
  // the last row matters twice: the census is exact either way, but truncation
  // leaves a bald rectangle in one corner (so the sheet is not really at
  // density where it is emptiest) and it puts every gap in one place, where
  // the baked underlay's parchment shows as a block rather than as coast.
  const side = Math.max(1, Math.ceil(Math.sqrt(nRegions)));
  const cells = side * side;
  const order = [];
  for (let c = 0; c < cells; c++) order.push([c, rnd(seed, 0x51ed270b ^ c)]);
  const dropped = new Set(
    order
      .slice()
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, Math.max(0, cells - nRegions))
      .map((e) => e[0]),
  );
  const cw = km / side;
  const rs = [];
  for (let c = 0; c < cells && rs.length < nRegions; c++) {
    if (dropped.has(c)) continue;
    const i = rs.length;
    const x0 = (c % side) * cw;
    const y0 = Math.floor(c / side) * cw;
    // Per-CORNER jitter, not per-cell: a rigid quad translated about is still
    // a rigid quad, and the even-odd row scan in texture-bake.mjs is only
    // exercised by rings whose edges are not axis-aligned.
    const k = (n) => (rnd(seed, c * 8 + n) - 0.5) * cw * 0.34;
    rs.push({
      id: `s-r-${String(i).padStart(3, "0")}`,
      landmass: `c${String((i % groups) + 1).padStart(2, "0")}`,
      biome: LAND_BIOMES[Math.floor(rnd(seed, c * 8 + 7) * LAND_BIOMES.length)],
      ring: [
        [r2(x0 + k(0)), r2(y0 + k(1))],
        [r2(x0 + cw + k(2)), r2(y0 + k(3))],
        [r2(x0 + cw + k(4)), r2(y0 + cw + k(5))],
        [r2(x0 + k(6)), r2(y0 + cw + k(7))],
      ],
    });
  }

  // --- instances ----------------------------------------------------------
  // Type by `i % rows.length` and region by `i % rs.length`, both exact rather
  // than sampled: sampling 1,740 draws from 170 types leaves a type unplaced
  // with probability ~4e-3 per build, and a canary that is a coin flip away
  // from a different census is not a fixture.
  const inst = [];
  const namedCounts = {};
  for (const row of rows) namedCounts[row.id] = 0;
  for (let i = 0; i < nInst && rs.length > 0 && rows.length > 0; i++) {
    const type = rows[i % rows.length];
    const r = rs[i % rs.length];
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    for (const [x, y] of r.ring) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
      if (y < top) top = y;
      if (y > bot) bot = y;
    }
    // A 4 x 3 sub-lattice inside the region's box: with ~11 instances per
    // region a hash-scattered field clumps into unreadable knots at 18 px,
    // which would be the canary reporting a declutter failure it caused.
    const slot = Math.floor(i / rs.length) % 12;
    const fx = ((slot % 4) + 0.5) / 4;
    const fy = (Math.floor(slot / 4) + 0.5) / 3;
    const jx = (rnd(seed, 7919 + i) - 0.5) * (hi - lo) * 0.1;
    const jy = (rnd(seed, 104729 + i) - 0.5) * (bot - top) * 0.1;
    inst.push({
      id: `s-lf-${String(i).padStart(4, "0")}`,
      type: type.id,
      glyph: type.glyph,
      at: [r2(lo + fx * (hi - lo) + jx), r2(top + fy * (bot - top) + jy)],
    });
    namedCounts[type.id] += 1;
  }

  // --- labels -------------------------------------------------------------
  // The mix is declared in the fixture, not drawn uniformly. Rank 4 (region)
  // is one name per region, sited at the region's own centre, because that is
  // what actually crowds a world chart — 160 medium names on a lattice, not a
  // scatter of easy ones.
  const lbl = [];
  let n = 0;
  for (const key of Object.keys(RANKS)) {
    const want = Math.min(usable(mix[key]), Math.max(0, SANE_MAX - lbl.length));
    for (let k = 0; k < want; k++) {
      const at =
        key === "region" && rs[k]
          ? (() => {
              let sx = 0, sy = 0;
              for (const [x, y] of rs[k].ring) { sx += x; sy += y; }
              return [r2(sx / rs[k].ring.length), r2(sy / rs[k].ring.length)];
            })()
          : [
              r2(10 + rnd(seed, 1299709 + n) * (km - 20)),
              r2(10 + rnd(seed, 15485863 + n) * (km - 20)),
            ];
      lbl.push({
        id: `s-l-${String(n).padStart(3, "0")}`,
        text: WORDS[Math.floor(rnd(seed, 2038074 + n) * WORDS.length)],
        at,
        rank: RANKS[key],
      });
      n++;
    }
  }
  void labels; // the census is the mix's sum; `labels` is what the gate checks it against

  return { regions: rs, instances: inst, labels: lbl, namedCounts };
}

// Memoised per repo root. buildSyntheticSheet is ~0.8 s (the 1400 x 1400 bake
// dominates) and the suite calls it from eight tests; without this the file
// alone costs six seconds. Safe because the builder is a pure function of the
// committed fixture + lexicon: same root, same bytes. Arrays are copied out so
// a caller that mutates `notes` cannot poison the next caller's answer.
const MEMO = new Map();

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "../tests/fixtures/synthetic-world/world.json");

// The key is the repo root PLUS a stamp of every file the build reads. Keying
// on the path alone returns the first answer forever, so a caller that reuses
// one --repo-root across a change to content/world/lexicon/landforms.json gets
// a stale sheet with no way to tell. Cheap: three stats against a 340 ms bake,
// and a stat that fails simply contributes "?" — a missing input is a problem
// the builder reports, not something the memo should decide.
function memoKey(repoRoot) {
  const root = typeof repoRoot === "string" ? repoRoot : String(repoRoot);
  const stamp = (p) => {
    try {
      const st = statSync(p);
      return `${st.size}:${st.mtimeMs}`;
    } catch {
      return "?";
    }
  };
  return [
    root,
    stamp(FIXTURE_PATH),
    stamp(join(root, "content/world/lexicon/landforms.json")),
    stamp(join(root, "content/world/budgets.json")),
  ].join("|");
}

/**
 * `fixture` overrides the committed parameter file, and it exists for ONE
 * reason: without it, deleting any of the three `problems.push(...check*())`
 * lines below leaves the whole suite green. Measured, not assumed — a mutation
 * run killed checkGlyphSizes and left checkGlyphCoverage, checkLabels and
 * checkBiomeInk as survivors. The sheet is built from committed data that is
 * correct by construction, so a gate that is never handed anything wrong
 * cannot be shown to work, and "a green suite that has stopped covering" is
 * this programme's recorded failure mode. The tests pass deliberately broken
 * fixtures through this argument and assert that each gate FIRES; nothing on
 * the shipped path ever supplies it.
 *
 * An injected fixture bypasses the memo: it is a different world, and caching
 * it under the repo root would poison the real answer.
 */
export function buildSyntheticSheet({ repoRoot, fixture = null } = {}) {
  if (fixture) return buildUncached({ repoRoot, fixture });
  const key = memoKey(repoRoot);
  if (!MEMO.has(key)) MEMO.set(key, buildUncached({ repoRoot }));
  const r = MEMO.get(key);
  return { svg: r.svg, notes: [...r.notes], problems: [...r.problems] };
}

function buildUncached({ repoRoot, fixture: injected = null }) {
  const problems = [];
  const notes = [];
  let fixture, lexicon, budgets;
  try {
    // The fixture is resolved from THIS MODULE, not from repoRoot. `--repo-root`
    // exists so a test can vary the CONTENT and the committed artifacts without
    // touching the tracked tree (scripts/tests/helpers/temp-repo.mjs copies
    // content/ and the sheets, and nothing else) — the other two sheets read
    // their data from content/ and their code from the module, and so does
    // this one. Reading the fixture through repoRoot made every temp-root
    // caller fail on ENOENT, which is how this was found.
    fixture = injected ?? JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    lexicon = JSON.parse(
      readFileSync(join(repoRoot, "content/world/lexicon/landforms.json"), "utf8"),
    );
    budgets = JSON.parse(
      readFileSync(join(repoRoot, "content/world/budgets.json"), "utf8"),
    );
  } catch (e) {
    problems.push(`synthetic: cannot read inputs: ${e.message}`);
    return { svg: "", notes, problems };
  }

  const params = (fixture && fixture.params) || {};
  const { frameKm, pxPerKm } = params;
  if (!Number.isInteger(params.seed))
    problems.push(
      `synthetic: seed is ${JSON.stringify(params.seed)}, not an integer — every ring, mark and name is a function of it, so a missing seed silently redraws the committed sheet`,
    );
  // The canary may not claim to be a world the real world may not be. 2,400 is
  // budgets.json's own landforms.maxInstances, not a number invented here.
  const maxInstances = budgets?.landforms?.maxInstances;
  if (Number.isFinite(maxInstances) && params.instances > maxInstances)
    problems.push(
      `G-CANARY: the fixture asks for ${params.instances} landform instances, over content/world/budgets.json's maxInstances ${maxInstances} — the canary would be claiming a density the world budget forbids`,
    );
  // Declared in the fixture rather than hardcoded, so checkGlyphSizes is the
  // thing that stops a future re-census picking 8 px to make 1,740 marks fit.
  // The contract wins; the layout accommodates it.
  const glyphPx = Number.isFinite(params.glyphSizePx) ? params.glyphSizePx : GLYPH_SIZE.min;
  if (!Number.isFinite(frameKm) || !Number.isFinite(pxPerKm) || pxPerKm <= 0) {
    problems.push(
      `synthetic: frameKm/pxPerKm are ${JSON.stringify(frameKm)}/${JSON.stringify(pxPerKm)}, not a usable frame`,
    );
    return { svg: "", notes, problems };
  }
  const maxHrefBytes = budgets?.sheets?.maxSvgBytes;

  let world;
  try {
    world = makeSyntheticWorld({ ...params, lexicon, rankMix: fixture.rankMix || {} });
  } catch (e) {
    problems.push(`synthetic: ${e.message}`);
    return { svg: "", notes, problems };
  }

  // The census is a GATE, not a note. The whole claim of this artifact is that
  // it is the size of the world we are about to build; a canary that quietly
  // renders 900 glyphs is worse than no canary, because it reports green.
  const expect = (fixture && fixture.expect) || {};
  const census = {
    regions: world.regions.length,
    instances: world.instances.length,
    labels: world.labels.length,
    landmasses: new Set(world.regions.map((r) => r.landmass)).size,
  };
  for (const k of Object.keys(census))
    if (census[k] !== expect[k])
      problems.push(
        `G-CANARY: the synthetic world has ${census[k]} ${k}, not the ${expect[k]} its fixture declares — this sheet is not at target density`,
      );

  const W = Math.round(frameKm * pxPerKm);
  const PAD = 46;
  const LEGEND_COL = 152;
  const legendRows = LEGEND.filter((r) => r.tier <= 3);
  const perRow = Math.max(1, Math.floor((W + PAD) / LEGEND_COL));
  const legendH = Math.ceil(legendRows.length / perRow) * 15 + 16;
  const SHEET_W = W + PAD * 2;
  const SHEET_H = W + PAD * 2 + legendH;
  const legendTier = 3;

  // ---- the baked texture underlay -----------------------------------------
  const bake = bakedUnderlay({ regions: world.regions, pxPerKm, maxHrefBytes });
  problems.push(...bake.problems);
  if (bake.notes)
    notes.push(
      `underlay ${bake.notes.encoding} · ${bake.notes.regions} regions · href ${bake.notes.hrefBytes} B (ceiling ${maxHrefBytes})`,
    );

  // ---- G-GLYPH -------------------------------------------------------------
  const usedGlyphs = [...new Set(world.instances.map((i) => i.glyph))].sort();
  const sized = world.instances.map((i) => ({ id: i.glyph, size: glyphPx }));
  problems.push(...checkGlyphSizes({ instances: sized }));
  // `emittedIds` is scanned out of the <symbol> markup, NOT taken from
  // `usedGlyphs` — same reason as referencedIds below. symbolDefs DROPS an id
  // with no family rather than writing broken markup, so handing it the
  // requested list makes the sheet claim it emitted symbols it did not, and a
  // lexicon row naming a family that does not exist reports as a type problem
  // only, never as the missing <symbol> it actually is.
  const symbols = symbolDefs({ ids: usedGlyphs });
  const emittedGlyphIds = [...symbols.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  problems.push(
    ...checkGlyphCoverage({
      lexicon,
      namedCounts: world.namedCounts,
      emittedIds: emittedGlyphIds,
    }),
  );

  // ---- G-LABEL -------------------------------------------------------------
  const frame = { x: PAD, y: PAD, w: W, h: W };
  const { placed, dropped } = placeLabels({
    labels: world.labels.map((l) => ({
      ...l,
      at: [r2(PAD + l.at[0] * pxPerKm), r2(PAD + l.at[1] * pxPerKm)],
    })),
    obstacles: [],
    maxLabelRank: 10,
    frame,
  });
  problems.push(...checkLabels({ placed, dropped, tier: legendTier }));

  notes.push(`regions ${world.regions.length} · landmasses ${census.landmasses}`);
  notes.push(`instances ${world.instances.length} at ${glyphPx} px · glyph families ${usedGlyphs.length} / ${Object.keys(GLYPHS).length}`);
  notes.push(`labels ${world.labels.length} placed ${placed.length} dropped ${dropped.length}`);

  // ---- draw ---------------------------------------------------------------
  const body = [];
  body.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.parchment}"/>`);
  body.push(`<g transform="translate(${PAD} ${PAD})">${bake.svg}</g>`);
  body.push(`<g color="${C.inkMid}" fill="none" stroke="currentColor" stroke-width="0.9">`);
  for (const i of world.instances)
    body.push(
      glyphUse({
        id: i.glyph,
        x: r2(PAD + i.at[0] * pxPerKm),
        y: r2(PAD + i.at[1] * pxPerKm),
        size: glyphPx,
      }),
    );
  body.push("</g>");
  for (const p of placed) {
    if (p.leader)
      body.push(
        `<path d="M${p.leader[0][0]},${p.leader[0][1]} L${p.leader[1][0]},${p.leader[1][1]}" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`,
      );
    body.push(
      `<text class="lbl" x="${p.x}" y="${p.y}" font-size="${p.size}">${esc(p.text)}</text>`,
    );
  }
  let lx = PAD;
  let ly = W + PAD * 2 - 4;
  for (const row of legendRows) {
    body.push(
      `<rect x="${r2(lx)}" y="${r2(ly)}" width="18" height="12" fill="url(#${row.pattern})" stroke="${C.inkSoft}" stroke-width="0.5"/>`,
    );
    body.push(
      `<text x="${r2(lx + 23)}" y="${r2(ly + 10)}" font-size="8" fill="${C.inkMid}">${esc(row.label)}</text>`,
    );
    lx += LEGEND_COL;
    if (lx + LEGEND_COL > SHEET_W) {
      lx = PAD;
      ly += 15;
    }
  }

  // ---- G-BIOME-INK ---------------------------------------------------------
  // `referencedIds` is scanned out of the markup ABOVE, so the two sides of the
  // rule come from two different places: emitted from the table, referenced
  // from what was actually drawn. Derive both from LEGEND and the per-sheet
  // half of checkBiomeInk compares a table with itself and can never fire.
  const emitted = [...new Set(legendRows.map((r) => r.pattern))];
  const referenced = [
    ...new Set([...body.join("\n").matchAll(/url\(#([^)"]+)\)/g)].map((m) => m[1])),
  ];
  problems.push(
    ...checkBiomeInk({ emittedIds: emitted, referencedIds: referenced, legendTier }),
  );

  const o = [];
  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="Target-density canary sheet">`,
  );
  o.push(`<title>TARGET-DENSITY CANARY — NOT GEOGRAPHY</title>`);
  o.push(
    `<desc>Not geography, and it claims none. A synthetic sheet at the agreed target density (13 landmasses, 160 regions, 1740 landform instances, 340 labels) on the atlas sheet's own 400 km frame, built by tools/mapforge/lib/synthetic-sheet.mjs so a render regression at scale is visible before the real world exists.</desc>`,
  );
  o.push("<defs>");
  o.push(patternDefs({ ids: emitted }));
  o.push(symbols);
  o.push("</defs>");
  o.push(
    `<style>text { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; fill: ${C.ink}; }
.lbl { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.4px; stroke-linejoin: round; }</style>`,
  );
  o.push(...body);
  o.push("</svg>");

  const svg = o.join("\n") + "\n";
  notes.push(`svg ${Buffer.byteLength(svg, "utf8")} B (budget ${maxHrefBytes})`);
  return { svg: problems.length ? "" : svg, notes, problems };
}
