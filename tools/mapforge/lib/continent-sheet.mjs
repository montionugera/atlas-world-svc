// tools/mapforge/lib/continent-sheet.mjs — the continent zoom tier (spec §7.4).
//
// ONE builder for all thirteen landmasses. It draws what the resolved join and
// the fabric carry and nothing else: surveyed regions in baked biome ink,
// reported regions under the provenance-keyed frontier hatch (§6.4 extension
// 1), the coast, the trunk river, the saltmire, terrain patches, roads,
// settlements, named landforms as glyphs with labels, and unnamed instances as
// glyphs without them.
//
// PLAN E RULING 8 (STATE §28) — this module is where the retired `cluster1`
// basin sheet comes back. Its five subject keys survive in the resolved doc as
// `coastline`, `river`, `saltmire`, `iceEdge` and `terrainPatches`, and the
// basin ground is Wealdmarch (continent c02), so the successor sheet is the
// `wealdmarch` row of the roster below rather than a fourteenth entry. That is
// the ruling's own arithmetic: SHEETS ran 5 -> 4 at the redraw and the thirteen
// here take it to 17, inside budgets.sheets.maxSheets = 18.
//
// Builder contract, identical to synthetic-sheet.mjs and basin-sheet.mjs:
// NEVER throw — a CLI treats a throw as a crash, not as a diagnosable red, and
// an uncaught throw skips the caller's finish() and drops every problem
// recorded before it. Return { svg, notes, problems }; `svg` is "" whenever
// `problems` is non-empty, so a red sheet can never be written to disk.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  C,
  r2,
  esc,
  createDraft,
  patternDefs,
  BIOME_FILL,
  FILL_FOR,
  LEGEND,
  ROAD_W,
} from "./draft.mjs";
// frontierPattern, NOT a local provenance->pattern table: checkBiomeInk builds
// its reachability set from ink.mjs's own FRONTIER_PATTERNS, so a second copy
// here would be a mapping this gate cannot see. One home, per the same rule
// that put `requires` and GENERATOR_VERSION in one place.
import { checkBiomeInk, frontierPattern, FRONTIER_PATTERNS } from "./ink.mjs";
import { GLYPHS, GLYPH_SIZE, symbolDefs, glyphUse, checkGlyphCoverage, checkGlyphSizes } from "./glyphs.mjs";
import { RANKS, placeLabels, checkLabels } from "./labels.mjs";
import { bakedUnderlay } from "./texture-bake.mjs";

// The thirteen landmasses of content/world/premises/, in premise order. `id`
// is the sheet id, the SVG basename and the storybook row id — one string,
// three uses, so a rename is one edit. Titles are the premise title plus the
// structural idea, because a storybook card with a bare name teaches nothing.
export const CONTINENT_SHEETS = Object.freeze([
  { id: "rimewall-cap", continent: "c01", title: "Rimewall Cap — the ice divide" },
  { id: "wealdmarch", continent: "c02", title: "Wealdmarch — the inland-sea basin" },
  { id: "coldreach", continent: "c03", title: "Coldreach — one spine, one rain shadow" },
  { id: "stonemoor", continent: "c04", title: "Stonemoor — the drowned karst plateau" },
  { id: "thirstwold", continent: "c05", title: "Thirstwold — the rain-shadow erg" },
  { id: "reedstrand", continent: "c06", title: "Reedstrand — the bird's-foot delta" },
  { id: "driftholt", continent: "c07", title: "Driftholt — the fog forest" },
  { id: "wracklow", continent: "c08", title: "Wracklow — the erosional coast" },
  { id: "brightfall", continent: "c09", title: "Brightfall — the cliff-hung falls" },
  { id: "ashen-spar", continent: "c10", title: "Ashen Spar — the volcanic arc" },
  { id: "quillreef", continent: "c11", title: "Quillreef — the atoll ring" },
  { id: "skerryfast", continent: "c12", title: "Skerryfast — the fjord skerries" },
  { id: "loamspit", continent: "c13", title: "Loamspit — the sandbar chain" },
]);

// The LONG EDGE of the drawn map area. The short edge follows the landmass's
// own aspect rather than being forced square — measured, not preference: on a
// 1400 x 1400 square, Rimewall Cap (162.5 x 56 km), Ashen Spar (53 x 25 km) and
// Loamspit (49 x 25 km) drew ink on 35.0%, 41.2% and 42.1% of their thumbs'
// scanlines against budgets.json's 50% minThumbInkRowFraction floor, because a
// 3:1 landmass on a square canvas is half empty parchment by construction. The
// floor is right and the frame was wrong.
const MAP_PX = 1400;
// A sheet narrower than this stops being a sheet: the legend needs one column
// and the title needs somewhere to sit.
const MIN_MAP_PX = 460;
// The NEATLINE MARGIN — clear px between the drawn extent and the edge of the
// map area, on all four sides. It is not decoration and it is not a fudge: the
// declutter's displacement ladder tries eight directions at five radii before
// it gives up and runs a leader out to the margin, and a coastal name with the
// neatline hard against it has half those candidates outside the frame. Drawn
// extent touching the neatline is also simply wrong on a chart.
const MAP_MARGIN_PX = 28;
const PAD = 46;
const TITLE_H = 40;
const LEGEND_COL = 152;
const MAX_PX_PER_KM = 24; // a 12 km chain must not be drawn at 100 px/km
const CONTINENT_LEGEND_TIER = 3; // continent sheets carry the full legend
export const CONTINENT_MAX_LABEL_RANK = 8; // spec §7.4 fixes the tier

/** Dominant biome of a fabric region — the highest share, ties broken by name. */
export function dominantBiome(shares) {
  if (!shares || typeof shares !== "object" || Array.isArray(shares)) return null;
  let best = null;
  for (const [biome, share] of Object.entries(shares))
    if (!Number.isFinite(share)) continue;
    else if (!best || share > best[1] || (share === best[1] && biome < best[0])) best = [biome, share];
  return best ? best[0] : null;
}

/** Axis-aligned bounds of every km point the sheet will draw. */
function bounds(rings) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of rings)
    for (const p of ring ?? []) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const [x, y] = p;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  return { minX, minY, maxX, maxY };
}

const isPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const ring3 = (r) => Array.isArray(r) && r.filter(isPt).length >= 3;

/**
 * A ROAD'S WEIGHT IS DERIVED, NOT DECLARED. content/world/fabric/continent-NN
 * .json's road records carry { id, continent, from, to, km, points } and no
 * class field, so ROAD_W cannot be keyed off the data directly. The rule here
 * is mechanical and stated rather than eyeballed: a road touching a capital is
 * a trunk, one touching a hub is a spur, everything else is a track. Nothing is
 * invented — it reads the endpoint ranks the fabric already commits.
 */
function roadWeight(road, rankById) {
  const ranks = [rankById.get(road.from), rankById.get(road.to)];
  if (ranks.includes("capital")) return "trunk";
  if (ranks.includes("hub")) return "spur";
  return "track";
}

/**
 * @param repoRoot     repo root, for content/ and for nothing else
 * @param continent    "c01".."c13" — the resolved/fabric file key
 * @param contentRoot  overrides `<repoRoot>/content`. It exists so the gate
 *   arms below can be shown to FIRE: this sheet is built from committed data
 *   that is correct by construction, and "a green suite that has stopped
 *   covering" is this programme's recorded failure mode. Nothing on the
 *   shipped path passes it. Same discipline as synthetic-sheet.mjs's
 *   `fixture`.
 * @param legendTier   overrides the committed tier 3, for the same reason.
 */
export function buildContinentSheet({ repoRoot, continent, contentRoot = null, legendTier: legendTierArg = null } = {}) {
  try {
    return build({ repoRoot, continent, contentRoot, legendTierArg });
  } catch (e) {
    // The last line of the never-throw contract. Every degenerate DOCUMENT is
    // answered in-band below and none of them reaches here; what does reach
    // here is a degenerate ARGUMENT — a non-string contentRoot makes join()
    // throw before a single file is read — and that is the case
    // continent-sheet.test.mjs arms this branch with, so it is a proven path
    // and not an untested comfort blanket.
    return {
      svg: "",
      notes: [],
      problems: [`continent-sheet ${continent}: unexpected throw: ${e && e.message}`],
    };
  }
}

function build({ repoRoot, continent, contentRoot, legendTierArg }) {
  const problems = [];
  const notes = [];
  const root = contentRoot ?? join(repoRoot ?? ".", "content");
  const nn = String(continent ?? "").replace(/^c/, "");
  const resolvedPath = join(root, `world/resolved/continent-${nn}.json`);
  const fabricPath = join(root, `world/fabric/continent-${nn}.json`);
  const lexPath = join(root, "world/lexicon/landforms.json");
  const budgetPath = join(root, "world/budgets.json");
  for (const p of [resolvedPath, fabricPath, lexPath, budgetPath])
    if (!existsSync(p)) problems.push(`continent-sheet ${continent}: ${p} is missing`);
  if (problems.length) return { svg: "", notes, problems };

  let world, fabric, lexicon, budgets;
  try {
    world = JSON.parse(readFileSync(resolvedPath, "utf8"));
    fabric = JSON.parse(readFileSync(fabricPath, "utf8"));
    lexicon = JSON.parse(readFileSync(lexPath, "utf8"));
    budgets = JSON.parse(readFileSync(budgetPath, "utf8"));
  } catch (e) {
    problems.push(`continent-sheet ${continent}: cannot read inputs: ${e.message}`);
    return { svg: "", notes, problems };
  }
  if (!world || typeof world !== "object" || Array.isArray(world)) {
    problems.push(`continent-sheet ${continent}: resolved doc is not an object`);
    return { svg: "", notes, problems };
  }
  if (!ring3(world.coastline?.points)) {
    problems.push(
      `continent-sheet ${continent}: resolved doc has no coastline.points ring of at least 3 finite points`,
    );
    return { svg: "", notes, problems };
  }
  // The builder contract is "never throw". A resolved doc missing one of the
  // array keys is a Plan D defect and must surface as a PROBLEM with the key
  // named, not as a TypeError three loops later.
  for (const k of ["zones", "towns", "camps", "landmarks", "dungeons", "instances", "terrainPatches"])
    if (!Array.isArray(world[k])) {
      problems.push(`continent-sheet ${continent}: resolved key "${k}" is not an array`);
      world[k] = [];
    }
  for (const k of ["regions", "settlements", "roads"])
    if (!Array.isArray(fabric?.[k])) {
      problems.push(`continent-sheet ${continent}: fabric key "${k}" is not an array`);
      if (fabric && typeof fabric === "object") fabric[k] = [];
    }
  if (!Array.isArray(lexicon)) {
    problems.push(`continent-sheet ${continent}: lexicon is not an array`);
    lexicon = [];
  }

  const meta = CONTINENT_SHEETS.find((s) => s.continent === continent);
  const title = meta ? meta.title : String(continent);
  const legendTier = Number.isFinite(legendTierArg) ? legendTierArg : CONTINENT_LEGEND_TIER;
  const legendRows = LEGEND.filter((r) => r.tier <= legendTier);
  const maxSvgBytes = budgets?.sheets?.maxSvgBytes;

  const biomeOf = new Map(fabric.regions.map((r) => [r && r.id, dominantBiome(r && r.biomeShares)]));

  // ---- SETTLEMENTS AND ROADS COME FROM THE FABRIC ---------------------------
  // MEASURED, not assumed (2026-08-29, all thirteen resolved docs): `roads` is
  // EMPTY on every continent and `towns` carries only the 8 civil-PINNED towns,
  // whose ids are a strict subset of the fabric's 47 settlements. Drawing the
  // resolved doc alone would put a continent sheet on the tree with 39 of its
  // 47 settlements and all 40 of its roads missing. The fabric is already a
  // declared input of this sheet (spec: regions[].biomeShares), so the join is
  // ids from the fabric, NAMES from the resolved doc wherever it has one — the
  // resolved layer is the naming authority and the fabric's `title` is the
  // fallback for a settlement it has not named.
  const nameOfTown = new Map(world.towns.map((t) => [t && t.id, t && t.name]));
  const settlements = fabric.settlements
    .filter((s) => s && typeof s.id === "string" && isPt(s.atKm))
    .map((s) => ({
      id: s.id,
      at: s.atKm,
      rank: s.rank,
      name: nameOfTown.get(s.id) ?? s.title ?? s.id,
    }));
  const rankById = new Map(settlements.map((s) => [s.id, s.rank]));
  const roads = fabric.roads
    .filter((rd) => rd && Array.isArray(rd.points) && rd.points.filter(isPt).length >= 2)
    .map((rd) => ({ id: rd.id, points: rd.points.filter(isPt), weight: roadWeight(rd, rankById) }));

  // ---- frame: fit the drawn extent, never re-centre per element -------------
  const b = bounds([world.coastline.points, ...world.zones.map((z) => z && z.polygon)]);
  if (!Number.isFinite(b.minX) || !Number.isFinite(b.minY)) {
    problems.push(`continent-sheet ${continent}: no finite km point to frame the sheet with`);
    return { svg: "", notes, problems };
  }
  const spanX = b.maxX - b.minX || 1;
  const spanY = b.maxY - b.minY || 1;
  // ONE scale on both axes — a per-axis fit would stretch a coastline, which is
  // a lie about a shape. The long edge takes MAP_PX; the short edge follows.
  const spanKm = Math.max(spanX, spanY);
  const pxPerKm = Math.min(MAX_PX_PER_KM, r2(MAP_PX / spanKm));
  const drawnW = spanX * pxPerKm,
    drawnH = spanY * pxPerKm;
  const MAP_W = Math.max(MIN_MAP_PX, Math.ceil(drawnW) + MAP_MARGIN_PX * 2);
  const MAP_H = Math.max(MIN_MAP_PX, Math.ceil(drawnH) + MAP_MARGIN_PX * 2);
  const mapLeft = r2(PAD + (MAP_W - drawnW) / 2 - b.minX * pxPerKm);
  const mapTop = r2(PAD + TITLE_H + (MAP_H - drawnH) / 2 - b.minY * pxPerKm);
  const { poly, smooth, X, Y } = createDraft({ pxPerKm, mapLeft, mapTop });
  const SHEET_W = Math.max(MAP_W, LEGEND_COL) + PAD * 2;
  const perRow = Math.max(1, Math.floor((SHEET_W - PAD * 2 + PAD) / LEGEND_COL));
  const legendH = Math.ceil(legendRows.length / perRow) * 15 + 22;
  const SHEET_H = MAP_H + PAD * 2 + TITLE_H + legendH;

  // ---- the baked biome underlay, surveyed regions only ----------------------
  //
  // Baked in a LOCAL km frame (every ring shifted by -minX/-minY) and put back
  // with a translate. bakedUnderlay sizes its raster from the ABSOLUTE maximum
  // of the rings it is handed, so feeding it world km would allocate a frame
  // reaching back to km 0 — for Ashen Spar (x from 96 to 149 km) that is a
  // 3,576 px-wide image of which 2,304 px is empty parchment. Measured on all
  // thirteen; the shift is what keeps every raster inside its own drawn extent.
  const surveyed = world.zones.filter((z) => z && z.survey === "surveyed");
  const reported = world.zones.filter((z) => z && z.survey === "reported");
  const local = (ringPts) => ringPts.filter(isPt).map(([x, y]) => [x - b.minX, y - b.minY]);
  const bakeRegions = [];
  let hatchFallback = 0;
  for (const z of surveyed) {
    if (!ring3(z.polygon)) {
      problems.push(`continent-sheet ${continent}: surveyed region "${z.id}" has no usable polygon`);
      continue;
    }
    const biome = biomeOf.get(z.id);
    if (!biome) {
      problems.push(
        `continent-sheet ${continent}: surveyed region "${z.id}" has no dominant biome in content/world/fabric/continent-${nn}.json — it would bake as bare parchment`,
      );
      continue;
    }
    bakeRegions.push({ id: z.id, biome, ring: local(z.polygon) });
  }
  // THE REPORTED HATCH IS BAKED, NOT DRAWN AS A LIVE <pattern> FILL. Measured,
  // not assumed: rasterised at budgets.json's rasterWidthPx = 2000, Driftholt
  // took 2.179 s whole and 0.599 s with the reported hatch stripped out —
  // 72-78% of the sheet's cost across the three continents that breached the
  // 2 s maxRasterSeconds cap (Coldreach 2.153 s, Stonemoor 2.215 s, Driftholt
  // 2.219 s). Merging same-provenance regions into one fill was measured too
  // and does nothing (2.143 s): the cost is area, not fill count. The cap was
  // NOT raised — it already sits at the loose end of its own derivation, and
  // this is the same live-hatch cost that once made the basin sheet 11.31 s.
  // The <pattern> defs stay, because the legend swatches still draw them and
  // G-BIOME-INK requires one legend row per reachable pattern in both
  // directions.
  for (const z of reported) {
    if (!ring3(z.polygon)) {
      problems.push(`continent-sheet ${continent}: reported region "${z.id}" has no usable polygon`);
      continue;
    }
    if (!Object.hasOwn(FRONTIER_PATTERNS, z.provenance)) hatchFallback += 1;
    bakeRegions.push({ id: z.id, fill: frontierPattern(z.provenance), ring: local(z.polygon) });
  }
  const bake = bakedUnderlay({ regions: bakeRegions, pxPerKm, maxHrefBytes: maxSvgBytes });
  problems.push(...bake.problems);
  if (bake.notes)
    notes.push(
      `underlay ${bake.notes.encoding} · ${bake.notes.regions} regions · href ${bake.notes.hrefBytes} B (ceiling ${maxSvgBytes})`,
    );

  // ---- G-GLYPH -------------------------------------------------------------
  const glyphInstances = [
    ...world.instances
      .filter((i) => i && i.glyph && isPt(i.at))
      .map((i) => ({ id: i.id, glyph: i.glyph, at: i.at, size: GLYPH_SIZE.min })),
    ...world.landmarks
      .filter((l) => l && l.glyph && isPt(l.at))
      .map((l) => ({ id: l.id, glyph: l.glyph, at: l.at, size: GLYPH_SIZE.preferred })),
  ];
  const usedGlyphs = [...new Set(glyphInstances.map((g) => g.glyph))].sort();
  problems.push(...checkGlyphSizes({ instances: glyphInstances.map((g) => ({ id: g.glyph, size: g.size })) }));
  const namedCounts = {};
  for (const row of lexicon) if (row && typeof row.id === "string") namedCounts[row.id] = 0;
  for (const l of world.landmarks) if (l && l.type && l.type in namedCounts) namedCounts[l.type] += 1;
  // `emittedIds` is DELIBERATELY not passed. Its arm requires a <symbol> for
  // every glyph family the WHOLE 170-row catalogue names — 40 of them — which
  // is the canary's job, not a continent's: measured, a continent sheet draws
  // between 1 (Loamspit) and 10 (Wealdmarch) families, so that arm would
  // report 30-39 phantom problems per sheet and the honest answer is that the
  // sheet emits exactly what it draws. The real per-sheet invariant — a <use>
  // whose <symbol> is missing renders NOTHING — is checked below against the
  // markup this sheet actually produced, in both directions.
  problems.push(...checkGlyphCoverage({ lexicon, namedCounts }));
  const symbols = symbolDefs({ ids: usedGlyphs });
  const emittedGlyphIds = new Set([...symbols.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));

  // ---- labels: the continent tier, rank 8 and below -------------------------
  const labels = [];
  for (const z of surveyed)
    if (isPt(z.labelAt)) labels.push({ id: z.id, text: z.name ?? z.id, rank: RANKS.region, at: z.labelAt });
  for (const s of settlements)
    labels.push({
      id: s.id,
      text: s.name,
      at: s.at,
      rank: s.rank === "capital" ? RANKS.capital : s.rank === "hub" ? RANKS.hub : RANKS.village,
    });
  for (const l of world.landmarks)
    if (l && isPt(l.at)) labels.push({ id: l.id, text: l.name ?? l.id, rank: RANKS.namedLandform, at: l.at });
  for (const d of world.dungeons)
    if (d && isPt(d.at)) labels.push({ id: d.id, text: d.name ?? d.id, rank: RANKS.dungeon, at: d.at });
  const frame = { x: PAD, y: PAD + TITLE_H, w: MAP_W, h: MAP_H };
  // placeLabels returns { id, x, y, anchor, box, size, text, leader? } and
  // deliberately does NOT return `rank`, so the tier attribute is looked up
  // here rather than read off the result.
  const rankOfLabel = new Map(labels.map((l) => [l.id, l.rank]));
  const { placed, dropped, aboveTier, asked } = placeLabels({
    labels: labels.map((l) => ({ ...l, at: [X(l.at[0]), Y(l.at[1])] })),
    obstacles: [],
    maxLabelRank: CONTINENT_MAX_LABEL_RANK,
    frame,
  });
  // aboveTier and asked ARE passed: without them checkLabels' accounting rule
  // is switched off and a name can vanish from a sheet with the gate green.
  problems.push(
    ...checkLabels({ placed, dropped, aboveTier, asked, tier: CONTINENT_MAX_LABEL_RANK }),
  );
  // NO `noRank` GUARD HERE, DELIBERATELY. A draft of this builder pushed a
  // problem when a placed label resolved to no rank — a real hazard, because a
  // data-rank of "undefined" makes the tier assertion read nothing. But
  // placeLabels' placed ids are a SUBSET of the ids it was handed, and
  // rankOfLabel is built from that same array, so no input can make the guard
  // fire: it was a rule that could not fail, which this programme treats as a
  // defect rather than as safety. The property is checked where it can be
  // observed instead — continent-sheet.test.mjs reads `data-rank` back out of
  // all thirteen BUILT sheets and reds on anything that is not a number.

  // ---- draw ----------------------------------------------------------------
  const body = [];
  body.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.parchment}"/>`);
  body.push(`<text x="${PAD}" y="${PAD + 22}" font-size="22">${esc(title)}</text>`);
  // The bake draws from its own (0,0) in the LOCAL frame the rings were shifted
  // into, so it is translated by exactly what createDraft's X/Y add for km
  // (minX, minY) — otherwise the ink sits a continent's width from its outlines.
  body.push(`<g transform="translate(${X(b.minX)} ${Y(b.minY)})">${bake.svg}</g>`);
  // The hatch itself is in the baked <image> above; what is left here is the
  // region BOUND, which a raster at pxPerKm cannot draw crisply.
  for (const z of reported)
    if (ring3(z.polygon))
      body.push(
        `<path d="${poly(z.polygon.filter(isPt))} Z" fill="none" stroke="${C.inkSoft}" stroke-width="0.5"/>`,
      );
  // terrainPatches are keyed by terrainKind, so they read FILL_FOR — NOT
  // BIOME_FILL, which keys the 20 biomes. The two namespaces are distinct and
  // mixing them is the terrain-kind/landform-id conflation the lexicon warns
  // about. A kind with no fill REPORTS: a `?? "pRock"` fallback would draw a
  // karst plateau as headland rock and tell nobody.
  for (const tp of world.terrainPatches) {
    if (!tp || !ring3(tp.polygon)) continue;
    const fill = FILL_FOR[tp.terrainKind];
    if (!fill) {
      problems.push(
        `continent-sheet ${continent}: terrain patch "${tp.id}" has kind "${tp.terrainKind}" with no FILL_FOR entry (tools/mapforge/lib/draft.mjs)`,
      );
      continue;
    }
    body.push(
      `<path d="${poly(tp.polygon.filter(isPt))} Z" fill="url(#${fill})" fill-opacity="0.6" stroke="none"/>`,
    );
  }
  body.push(
    `<path d="${smooth(world.coastline.points.filter(isPt), true)}" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`,
  );
  const hasRiver = world.river && Array.isArray(world.river.points) && world.river.points.filter(isPt).length >= 2;
  if (hasRiver)
    body.push(
      `<path d="${smooth(world.river.points.filter(isPt))}" fill="none" stroke="${C.sea}" stroke-width="2.2"/>`,
    );
  // iceEdge: MEASURED null on all thirteen resolved continents (STATE §28's
  // filed-not-fixed item 1, which said Task 8 is where it bites). The draw path
  // stays because the key is a real subject of ruling 8 and the resolved writer
  // may yet emit one; what is NOT done is publishing an ice edge that is not
  // there. The note below states the emptiness rather than staying silent about
  // it, and continent-sheet.test.mjs drives this branch through an injected
  // content root so the path is proven rather than merely present.
  const hasIce = world.iceEdge && Array.isArray(world.iceEdge.points) && world.iceEdge.points.filter(isPt).length >= 2;
  if (hasIce)
    body.push(
      `<path d="${poly(world.iceEdge.points.filter(isPt))}" fill="none" stroke="${C.inkSoft}" stroke-width="1.2" stroke-dasharray="6 4"/>`,
    );
  const hasMire = world.saltmire && ring3(world.saltmire.polygon);
  if (hasMire)
    body.push(
      `<path d="${poly(world.saltmire.polygon.filter(isPt))} Z" fill="url(#pMire)" stroke="${C.inkMid}" stroke-width="1.2" stroke-dasharray="3 3"/>`,
    );
  // Roads carry a parchment casing under the ink line, exactly as
  // basin-sheet.mjs draws them — the casing is what stops a road disappearing
  // into a hatched region.
  for (const road of roads) {
    const w = ROAD_W[road.weight] ?? ROAD_W.track;
    body.push(
      `<path d="${smooth(road.points)}" fill="none" stroke="${C.parchmentDeep}" stroke-width="${r2(w + 3)}" stroke-linecap="round"/>`,
    );
    body.push(
      `<path d="${smooth(road.points)}" fill="none" stroke="${C.ink}" stroke-width="${w}" stroke-linecap="round"/>`,
    );
  }

  body.push(`<g color="${C.inkMid}" fill="none" stroke="currentColor" stroke-width="0.9">`);
  for (const g of glyphInstances)
    body.push(glyphUse({ id: g.glyph, x: X(g.at[0]), y: Y(g.at[1]), size: g.size }));
  body.push("</g>");
  for (const s of settlements)
    body.push(
      `<circle cx="${X(s.at[0])}" cy="${Y(s.at[1])}" r="${s.rank === "capital" ? 5 : s.rank === "hub" ? 3.5 : 2.2}" fill="${C.ink}"/>`,
    );
  for (const p of placed) {
    if (p.leader)
      body.push(
        `<path d="M${p.leader[0][0]},${p.leader[0][1]} L${p.leader[1][0]},${p.leader[1][1]}" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`,
      );
    body.push(
      `<text class="lbl" data-rank="${rankOfLabel.get(p.id)}" x="${p.x}" y="${p.y}" font-size="${p.size}">${esc(p.text)}</text>`,
    );
  }

  let lx = PAD;
  let ly = MAP_H + PAD * 2 + TITLE_H - 4;
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

  // ---- the per-sheet <use>/<symbol> integrity check -------------------------
  // Both directions, off the markup this sheet produced: a <use> with no
  // <symbol> draws nothing at all, and a <symbol> nothing uses is dead weight
  // in a byte-budgeted file. symbolDefs DROPS an id with no family rather than
  // writing broken markup, which is exactly how a missing family becomes an
  // invisible glyph instead of a red.
  const usedHrefs = new Set([...body.join("\n").matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]));
  for (const id of usedHrefs)
    if (!emittedGlyphIds.has(id))
      problems.push(
        `G-GLYPH: sheet "${meta ? meta.id : continent}" draws <use href="#${id}"> but no <symbol id="${id}"> was emitted — the mark renders as nothing`,
      );
  for (const id of emittedGlyphIds)
    if (!usedHrefs.has(id))
      problems.push(`G-GLYPH: sheet "${meta ? meta.id : continent}" emits <symbol id="${id}"> that nothing uses`);

  // ---- G-BIOME-INK ---------------------------------------------------------
  // `referenced` is scanned out of the markup PLUS the biome fills the baked
  // <image> paints, which no markup scan can see. `emitted` is the legend's own
  // pattern set, so the rule is a real statement about this sheet: every
  // texture on the canvas has a legend row a reader can look it up in, and
  // every legend row is a texture the canvas actually carries.
  const emitted = [...new Set(legendRows.map((r) => r.pattern))].sort();
  const painted = [...new Set([...body.join("\n").matchAll(/url\(#([^)"]+)\)/g)].map((m) => m[1]))];
  // The tile id a baked region actually paints — its explicit `fill` (the
  // frontier hatches) or its biome's BIOME_FILL entry. Reading only the biome
  // half here would have made the reported hatches invisible to G-BIOME-INK
  // the moment they moved into the bake, which is exactly the class of silent
  // coverage loss this programme keeps catching.
  const underlaid = [
    ...new Set(
      bakeRegions
        .map((r) => (typeof r.fill === "string" ? r.fill : BIOME_FILL[r.biome]))
        .filter((id) => typeof id === "string"),
    ),
  ];
  const referenced = [...new Set([...painted, ...underlaid])].sort();
  problems.push(...checkBiomeInk({ emittedIds: emitted, referencedIds: referenced, legendTier }));

  notes.push(`continent ${continent} · ${meta ? meta.title : "(unregistered)"}`);
  notes.push(
    `regions ${world.zones.length} surveyed ${surveyed.length} reported ${reported.length} (hatch fallback ${hatchFallback})`,
  );
  notes.push(
    `instances ${glyphInstances.length} drawn of ${world.instances.length} · named ${world.landmarks.length} · settlements ${settlements.length} · roads ${roads.length}`,
  );
  notes.push(
    `labels ${asked} asked · ${placed.length} placed · dropped ${dropped.length} · above tier ${aboveTier.length}`,
  );
  notes.push(
    `subjects coast yes · river ${hasRiver ? "yes" : "none"} · mire ${hasMire ? "yes" : "none"} · iceEdge ${hasIce ? "yes" : "none in the resolved doc"} · terrainPatches ${world.terrainPatches.length}`,
  );
  notes.push(`frame ${MAP_W}x${MAP_H} px · sheet ${SHEET_W}x${SHEET_H} px`);
  notes.push(`scale ${pxPerKm} px/km over ${r2(spanX)} x ${r2(spanY)} km · glyph families ${usedGlyphs.length} / ${Object.keys(GLYPHS).length}`);

  const o = [];
  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="${esc(title)}">`,
  );
  o.push(`<title>${esc(title)}</title>`);
  o.push(
    `<desc>Drawn by tools/mapforge/render-sheet.mjs from content/world/resolved/continent-${nn}.json and content/world/fabric/continent-${nn}.json. Surveyed regions carry biome ink; reported regions carry the provenance hatch and no terrain claim.</desc>`,
  );
  o.push("<defs>");
  o.push(patternDefs({ ids: emitted }));
  o.push(symbols);
  o.push("</defs>");
  o.push(`<style>text { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; fill: ${C.ink}; }
.lbl { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.4px; stroke-linejoin: round; }</style>`);
  o.push(...body);
  o.push("</svg>");

  const svg = o.join("\n") + "\n";
  notes.push(`svg ${Buffer.byteLength(svg, "utf8")} B (budget ${maxSvgBytes})`);
  return { svg: problems.length ? "" : svg, notes, problems };
}
