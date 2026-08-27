// tools/mapforge/lib/atlas-sheet.mjs — the world (atlas) sheet as a function.
//
// F-042 Task 6, re-keyed onto the redrawn trunk in Plan E Task 6. Draws the
// full 400x400 km frame of n-atlas: the reported landmasses under their
// frontier hatch, the surveyed ground un-hatched, the three oceans, the
// marginal seas the descriptor names, every settlement the trunk carries,
// the charted sea-lanes, and honest empty parchment everywhere the survey
// has never reached.
//
// Every drawn element traces to a spine node/feature/edge or a string in
// content/spine/sheet-atlas.json — no invented geography. The ~99%
// unauthored area stays empty parchment on purpose.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  C,
  ZONE_TENSION,
  r2,
  esc,
  wrap,
  LEGEND,
  createDraft,
  centroid,
  polylineKm,
  alongKm,
  patternDefs,
  FILL_FOR,
} from "./draft.mjs";
import { frontierPattern, checkBiomeInk } from "./ink.mjs";
import { symbolDefs, glyphUse, glyphForType, checkGlyphCoverage } from "./glyphs.mjs";
import { placeLabels, checkLabels, RANKS } from "./labels.mjs";
import { loadSpine, buildTree, resolveToRoot, surveyOf } from "../../../scripts/lib/spine.mjs";

// F-045 Task 4: 0.7 -> 3.5 (÷5 up), the world frame's own 2000 -> 400 km
// (÷5 down) — net canvas size unchanged, 5x denser per km.
// Plan B Task 12, adoption 1. ONE expression, read by both the <defs> builder
// and the draw loop. Writing the fallback twice is how a sheet ends up
// referencing a pattern <defs> never emitted — a self-inflicted G-BIOME-INK
// "referenced but not emitted" at the first node that carries provenance.
//
// THE CHART'S GRAMMAR, IN ONE EXPRESSION: only REPORTED ground is filled.
//
// A surveyed landmass draws as an outline with its regions and its towns on
// it — the treatment the surveyed ground (landIds[0]) has always had, now
// applied to every landmass the survey has walked instead of to one. A
// reported landmass is filled: with its terrain kind when the fabric gives it
// one (an ice cap reads as ice from a deck), otherwise with the frontier
// hatch at the density its own reported regions agree on.
//
// This is STATE §28 defects (b) and (c) closed together. `patternFor` used to
// hand `n.provenance` — an OBJECT since Plan C — to `frontierPattern`, which
// keys a STRING, so the three densities were unreachable and every landmass
// fell through to the one generic hatch: 12 of 13 landmasses hatched
// "reported" while only 4 carried `lore.reported`, and that single live
// pattern was 79% of the sheet's entire raster cost. The key is now
// `lore.reportedAs`, the string generate-world derives from the fabric's own
// `regions[].provenance`, and the survey verdict decides whether a landmass is
// filled at all — so the hand's "a hatched coast is reported, never vouched"
// is true of the drawing and not just of the note.
//
// `null` means NO fill (bare parchment). The draw loop and the <defs> builder
// both handle it; a pattern id is never invented to fill the hole.
const patternFor = (n) =>
  surveyOf({ node: n }) === "reported"
    ? FILL_FOR[n.terrainKind] ?? frontierPattern(n.lore?.reportedAs)
    : null;

// Plan B Task 12, adoption 3. The sheet's zoom tier lives HERE, and
// render-sheet.mjs's registry row reads it — one number, one home. It is not a
// caller argument on purpose: sheet.build() is invoked from three places
// (the CLI, check_render_lock, render-lock.mjs) and a tier passed in would make
// the committed bytes depend on which caller built them.
//
// 8 (namedLandform), not the 3 the registry used to carry as a literal. The
// registry's comment described a world sheet as drawing "world title, ocean,
// continent, sea" — but this sheet has drawn region titles (rank 4), port names
// (6) and line-feature names (8) since F-043, and two committed tests require
// "Tallowquay" and "the Coldreach Interior" to be on it. At tier 3 the
// declutter would have silently deleted 24 of the 33 names on the chart, which
// is a REDRAW, and the redraw is Plan E's. Lowering this number is a content
// decision, not a rendering one.
export const ATLAS_MAX_LABEL_RANK = 8;

// G-LABEL's hard cap for this sheet. The redraw took the chart TO this ceiling:
// the declutter places 32 labels and the budget is 32, so the sheet now sits
// exactly on its cap with NO headroom. The quarter of slack this block used to
// narrate (against a pre-redraw count of 26) has been spent in full.
//
// What that means concretely: one more named thing on the world sheet — a
// region title, a line feature's name, a harbour (any town a new sea-lane ends
// at), another marginal sea — is 33 placed against budget 32, and G-LABEL goes
// red on the very next render. That is the gate working, not a gate to route
// around: a name that cannot fit here belongs on a continent sheet. Raising
// the number is a content decision that needs its own evidence, so 32 stays
// until a task argues for more.
//
// The count is deliberately NOT transcribed into this comment — a literal that
// must be hand-updated at every redraw is precisely what went stale here.
// tools/mapforge/tests/atlas-sheet.test.mjs measures the placed count from a
// real build and asserts this budget covers THAT, so the two cannot drift
// apart silently again.
export const ATLAS_LABEL_BUDGET = 32;

// Which LEGEND rows this sheet keys. Tier 2 is the surveyed fills plus the
// four "reported" densities — the vocabulary this chart's grammar is built on.
export const ATLAS_LEGEND_TIER = 2;

export const ATLAS_PX_PER_KM = 3.5; // 400 km → 1400 px map frame
export const ATLAS_MAP_LEFT = 58;
export const ATLAS_MAP_TOP = 96;
const SHEET_PAD = 46;

export function drawAtlasSheet({
  spine,
  tree,
  sheet,
  lexicon = null,
  maxLabelRank = ATLAS_MAX_LABEL_RANK,
  labelBudget = ATLAS_LABEL_BUDGET,
  legendTier = ATLAS_LEGEND_TIER,
}) {
  const problems = [];
  const notes = [];
  // Plan B Task 12, adoption 2. The landform lexicon is DATA the caller reads;
  // a builder that opened a file would be the second thing in this module able
  // to fail on io. A null lexicon is a legitimate state (a fixture root with no
  // content/world/), and glyphForType answers null for it rather than throwing.
  const usedGlyphs = new Set();
  const namedCounts = {};

  // ---- data joins — everything drawn is looked up here ---------------------
  // Plan A Task 8: every subject id comes from content/spine/sheet-atlas.json's
  // `subjects` block, never from a literal in this file. Correction C2: this
  // adapter was the SECOND hard-coded one — a redraw that renames the basin
  // land or sea node used to need a code edit here, and the same rename in the
  // spine alone reached `.title`/`.features` on undefined. Same descriptor
  // shape scripts/lib/places.mjs reads for the basin sheet.
  const S = sheet?.subjects;
  if (!S || typeof S !== "object" || Array.isArray(S)) {
    problems.push(
      "sheet-atlas.json has no `subjects` descriptor — the sheet's subject ids are DATA, not code",
    );
    return { svg: "", notes, problems };
  }
  // Shape checked BEFORE anything dereferences it. `S.landIds[0]` on an empty
  // array is `undefined`, which would report `"undefined" does not resolve` —
  // a report rather than a throw, but a message naming nothing an author can
  // fix. Diagnose by shape instead, the rule places.mjs applies to
  // mireIds/terrainPatchIds. `iceEdge` is the basin sheet's business; this
  // adapter draws only the coast and the river, so it requires only those.
  if (typeof S.rootId !== "string")
    problems.push("sheet-atlas.json: subjects.rootId is missing or not a string");
  for (const k of ["landIds", "seaIds"])
    if (!Array.isArray(S[k]) || S[k].length === 0)
      problems.push(`sheet-atlas.json: subjects.${k} is missing or empty`);
  if (problems.length) return { svg: "", notes, problems };

  const need = (key, id) => {
    const n = tree.byId.get(id);
    if (!n) problems.push(`sheet: subject "${key}" -> "${id}" does not resolve`);
    return n ?? null;
  };
  const atlas = need("rootId", S.rootId);
  const cluster = need("landIds[0]", S.landIds[0]);
  const seaNodes = S.seaIds.map((id, i) => need(`seaIds[${i}]`, id));
  if (!atlas || !cluster || seaNodes.some((n) => !n))
    return { svg: "", notes, problems };

  const [EXT_W, EXT_H] = atlas.interior.size; // the root frame, in its own km

  // Plan E Task 6: a HARBOUR is not a role the trunk can carry — the closed
  // attrs schema spends `role` on settlement rank (capital / hub / village),
  // written by generate-world's settlements pass. What makes a town a harbour
  // on a mariners' chart is that a charted sea-lane ENDS there, so the
  // predicate is DERIVED from the edge list rather than stamped into a
  // feature. Same list the lane-drawing loop walks, read once here so the
  // point-feature pass and the lane pass cannot disagree.
  const harbourIds = new Set(
    (spine.edges ?? [])
      .filter((e) => e.kind === "sealane")
      .flatMap((e) => [e.from?.feature, e.to?.feature])
      .filter((id) => typeof id === "string"),
  );

  // ---- self-check: nothing drawn may leave the frame except offSheet points
  const checkFrame = (label, pts) => {
    for (const p of pts)
      if (p[0] < 0 || p[0] > EXT_W || p[1] < 0 || p[1] > EXT_H)
        problems.push(
          `${label}: point [${p}] outside the ${EXT_W}x${EXT_H} km frame`,
        );
  };
  checkFrame(`${cluster.id} polygon`, cluster.placement.points);
  checkFrame("north mark", [sheet.northMark.at]);

  // ---- the marginal seas ----------------------------------------------------
  // A marginal sea nests INSIDE its ocean (G-CONTAIN), so its placement points
  // are in the OCEAN's frame, not the root's. They go through resolveToRoot
  // exactly as a node anchor does; drawing `placement.points` raw was only
  // ever right while the single strip happened to be a child of n-atlas.
  const seaPolys = [];
  for (const s of seaNodes) {
    const pts = s.placement.points.map((p) =>
      resolveToRoot({ tree, id: s.parentId, point: p }),
    );
    if (pts.some((p) => p === null)) {
      problems.push(`sea ${s.id}: points could not be resolved to the root frame`);
      continue;
    }
    checkFrame(`${s.id} polygon`, pts);
    if (typeof s.title !== "string" || s.title.trim() === "")
      problems.push(`${s.id}: missing title — nothing to letter on the sheet`);
    seaPolys.push({ id: s.id, title: s.title, pts });
  }
  notes.push(`seas ${seaPolys.length} of ${S.seaIds.length}`);

  // ---- F-043: the wider world — tier-1 children of the root beyond the ------
  // basin pair (landIds/seaIds are already joined above). Sorted by id for
  // determinism, same rule the basin block's town list uses.
  const worldChildren = [...tree.byId.values()]
    .filter(
      (n) =>
        n.parentId === S.rootId &&
        !S.landIds.includes(n.id) &&
        !S.seaIds.includes(n.id),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const worldLand = worldChildren.filter((n) => n.tier === "continent");
  const worldOceans = worldChildren.filter((n) => n.tier === "ocean");

  // self-check: pairwise coast-crossing, over every tier-1 land polygon
  // (the surveyed basin's n-cluster1 counts as land too). Reuses the proper-
  // crossing test scripts/lib/spine.mjs's selfIntersects() is built on.
  const orient = (p, q, r) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const properCross = (p1, p2, p3, p4) => {
    const o1 = orient(p1, p2, p3);
    const o2 = orient(p1, p2, p4);
    const o3 = orient(p3, p4, p1);
    const o4 = orient(p3, p4, p2);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  };
  const landPolys = [
    { id: cluster.id, pts: cluster.placement.points },
    ...worldLand.map((n) => ({ id: n.id, pts: n.placement.points })),
  ];
  for (let i = 0; i < landPolys.length; i++) {
    for (let j = i + 1; j < landPolys.length; j++) {
      const A = landPolys[i];
      const B = landPolys[j];
      let crossed = false;
      for (let a = 0; a < A.pts.length && !crossed; a++) {
        const a1 = A.pts[a];
        const a2 = A.pts[(a + 1) % A.pts.length];
        for (let b = 0; b < B.pts.length; b++) {
          const b1 = B.pts[b];
          const b2 = B.pts[(b + 1) % B.pts.length];
          if (properCross(a1, a2, b1, b2)) {
            crossed = true;
            break;
          }
        }
      }
      if (crossed) problems.push(`coast ${A.id} crosses ${B.id}`);
    }
  }

  // ---- F-043 fix: land-bbox helper for the ocean-label clear-of-land nudge -
  // (used below, ocean-name loop). 12km (the spec'd "steer clear of the
  // coast" margin) left a real overlap on Galereach/Coldreach in visual QA —
  // the thing that has to stay clear is a rotated, ~18-character label's
  // rendered footprint, not just its single anchor point — but a much wider
  // margin (tried 44km) over-triggers: Keelbreak's own centroid then reads
  // as "inside" Coldreach's expanded box too, nudging a sea that was never
  // near land. 20km is the smallest margin that clears the real Galereach/
  // Coldreach overlap (confirmed against the built SVG) without dragging in
  // Keelbreak or Tarnmark, which both stay a no-op at this value.
  // (F-045 Task 4: these three figures — 12/20/44 — are the F-043 tuning
  // narrative's 60/100/220 ÷5'd; the world these margins operate on shrank
  // ÷5 too, so the same relative margin now reads as a fifth the km value.)
  const LAND_CLEARANCE_KM = 20;
  const landBboxes = landPolys.map(({ id, pts }) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      id,
      minX: Math.min(...xs) - LAND_CLEARANCE_KM,
      maxX: Math.max(...xs) + LAND_CLEARANCE_KM,
      minY: Math.min(...ys) - LAND_CLEARANCE_KM,
      maxY: Math.max(...ys) + LAND_CLEARANCE_KM,
    };
  });
  const insideAnyLandBbox = (pt) =>
    landBboxes.some(
      (b) => pt[0] >= b.minX && pt[0] <= b.maxX && pt[1] >= b.minY && pt[1] <= b.maxY,
    );

  // The nudge below also has to dodge sea-lanes drawn on this same sheet
  // (below) — a first pass that only checked land pushed Galereach's label
  // straight onto "a foreign coastal lane"'s own dashed line and text.
  // Light endpoint resolution, independent of the sea-lane drawing loop's
  // own resolveLaneEnd (that one runs later and also draws); this one only
  // needs coordinates for a distance check.
  const resolveLaneEndpoint = (ref) => {
    if (ref?.node) {
      const node = tree.byId.get(ref.node);
      return node
        ? resolveToRoot({ tree, id: node.parentId, point: node.placement.anchor })
        : null;
    }
    if (ref?.feature) {
      for (const n of tree.byId.values())
        for (const f of n.features ?? []) if (f.id === ref.feature) return f.at ?? null;
    }
    return null;
  };
  const laneSegments = (spine.edges ?? [])
    .filter((e) => e.kind === "sealane")
    .map((lane) => [resolveLaneEndpoint(lane.from), resolveLaneEndpoint(lane.to)])
    .filter(([a, b]) => a && b);
  const distToSegment = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  // F-045 Task 4: 60 -> 12 (÷5), same reasoning as LAND_CLEARANCE_KM above —
  // a real km distance to a sea-lane segment, and the world it measures
  // against shrank ÷5.
  const LANE_CLEARANCE_KM = 12;
  const nearAnySeaLane = (pt) =>
    laneSegments.some(([a, b]) => distToSegment(pt, a, b) < LANE_CLEARANCE_KM);

  const blocked = (pt) => insideAnyLandBbox(pt) || nearAnySeaLane(pt);
  // Deterministic nudge: step the point along y, away from the offending
  // land box's own vertical center (toward more open water in a strip-
  // shaped sea), in fixed 8km increments (F-045 Task 4: 40km ÷5), until
  // clear of every land bbox AND every sea-lane. Bounded at 10 steps (80km,
  // was 400km) — comfortably more than this 400km frame (was 2000km) needs.
  const nudgeClearOfLand = (pt) => {
    if (!blocked(pt)) return pt;
    const hit = landBboxes.find(
      (b) => pt[0] >= b.minX && pt[0] <= b.maxX && pt[1] >= b.minY && pt[1] <= b.maxY,
    );
    const dir = !hit || pt[1] <= (hit.minY + hit.maxY) / 2 ? -1 : 1;
    for (let step = 1; step <= 10; step++) {
      const candidate = [pt[0], pt[1] + dir * 8 * step];
      if (!blocked(candidate)) return candidate;
    }
    return pt; // exhausted the bound — leave as-is rather than loop forever
  };

  // self-check: label traceability — every tier-1/2 node this sheet draws
  // must carry a real title (the string a lineLabel draws from).
  for (const n of [
    ...worldLand,
    ...worldOceans,
    ...[...worldLand, cluster].flatMap((land) =>
      (tree.childrenOf.get(land.id) ?? []).map((id) => tree.byId.get(id)),
    ),
  ])
    if (typeof n.title !== "string" || n.title.trim() === "")
      problems.push(`${n.id}: missing title — nothing to letter on the sheet`);

  // ---- the legend band (Plan B Task 12, adoption 4) -------------------------
  // Declared BEFORE <defs> because <defs> must emit every pattern the legend
  // swatches point at, and drawn after the frame below.
  // Tier 2, not tier 1: this sheet's grammar is surveyed-versus-reported, and
  // the three frontier densities (sworn / hearsay / inferred) are tier-2 rows.
  // A chart that hatches a coast "reported" and never says so in a key is a
  // chart the reader has to be told about out of band.
  const legendRows = LEGEND.filter((r) => r.tier <= legendTier);
  const legendPatterns = legendRows.map((r) => r.pattern);

  // ---- sheet geometry -------------------------------------------------------
  const MAP_W = EXT_W * ATLAS_PX_PER_KM;
  const MAP_H = EXT_H * ATLAS_PX_PER_KM;
  const SHEET_W = Math.round(ATLAS_MAP_LEFT + MAP_W + SHEET_PAD);
  // The legend band lives BELOW the frame — this sheet has no side panel, the
  // map fills it edge to edge. Column count is derived from the frame's own
  // width rather than pinned at the basin sheet's two, so widening the chart
  // re-flows the key instead of running it off the page.
  const LEGEND_COL_W = 250;
  const LEGEND_ROW_H = 34;
  const legendCols = Math.max(1, Math.floor(MAP_W / LEGEND_COL_W));
  const legendBandH =
    legendRows.length === 0
      ? 0
      : 8 + 16 + Math.ceil(legendRows.length / legendCols) * LEGEND_ROW_H + 4;
  const SHEET_H = Math.round(ATLAS_MAP_TOP + MAP_H + legendBandH + SHEET_PAD);

  const { X, Y, poly, smooth, lineLabel } = createDraft({
    pxPerKm: ATLAS_PX_PER_KM,
    mapLeft: ATLAS_MAP_LEFT,
    mapTop: ATLAS_MAP_TOP,
  });

  const o = [];
  const put = (s) => o.push(s);

  put(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="${esc(sheet.title)} — ${esc(sheet.subtitle)}">`,
  );
  put(`<title>${esc(sheet.title)} — ${esc(sheet.subtitle)}</title>`);
  put(
    `<desc>Authored vector map drawn from content/spine/ (nodes + sheet-atlas.json) by tools/mapforge/render-sheet.mjs. Not a generated image.</desc>`,
  );

  put("<defs>");
  // Plan B Task 12, adoption 1: <defs> emits exactly the patterns this sheet
  // points a fill at — the map's own fills plus the legend's swatches — rather
  // than the whole legacy roster. It was emitting nine and referencing two.
  // G-BIOME-INK checks both directions, so an id that appears here and nowhere
  // else is now a reported problem instead of seven dead <pattern> blocks.
  // `patternFor` returns null for a surveyed landmass — it takes no fill — so
  // the nulls are dropped rather than becoming a pattern id nothing defines.
  const wantedPatterns = [...new Set([...worldLand.map(patternFor).filter(Boolean), ...legendPatterns])].sort();
  // patternDefs DROPS an id with no PATTERNS entry rather than writing broken
  // markup, exactly as symbolDefs does, so the emitted set is scanned back out
  // of the markup it produced. Handing checkBiomeInk the REQUESTED list would
  // make the sheet claim it emitted patterns it did not.
  const patternMarkup = patternDefs({ ids: wantedPatterns });
  put(patternMarkup);
  const emittedPatterns = [...patternMarkup.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]).sort();
  // G-BIOME-INK's per-sheet half runs AFTER the draw pass — see the note by
  // the symbol slot fill. Asking the same list twice is not a check.
  // Plan B Task 12, adoption 2: the <symbol> block is a RESERVED SLOT, filled
  // after the draw pass. Which glyph families this sheet uses is not knowable
  // until every feature has been walked, and <defs> has to come first in the
  // document. An empty string here is a no-op line the join drops.
  const symbolSlot = o.length;
  put("");
  // nothing may spill past the sheet's own border
  put(
    `<clipPath id="clip-sheet"><rect x="${ATLAS_MAP_LEFT}" y="${ATLAS_MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}"/></clipPath>`,
  );
  put("</defs>");

  put(`<style>
  text { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; fill: ${C.ink}; }
  .lbl { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.4px; stroke-linejoin: round; }
  .zn { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.8px; stroke-linejoin: round; }
  use { color: ${C.ink}; fill: none; }
</style>`);

  // ---- parchment ------------------------------------------------------------
  put(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.parchment}"/>`);
  put(
    `<rect x="${ATLAS_MAP_LEFT}" y="${ATLAS_MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" fill="${C.parchmentDeep}"/>`,
  );

  // the basin miniature lives inside the sheet border
  put(`<g clip-path="url(#clip-sheet)">`);

  // ---- the marginal seas, each a filled body -------------------------------
  // Bare parchment is still the open ocean here; only a NAMED sea gets water.
  for (const sp of seaPolys)
    put(`<path d="${poly(sp.pts)} Z" fill="${C.sea}" class="marginal-sea"/>`);

  // ---- the surveyed ground's outline (landIds[0]) ---------------------------
  // Drawn un-hatched on purpose: this is the one landmass the survey has
  // walked, so it carries no "reported" frontier pattern. Its regions,
  // settlements and harbours draw with everyone else's, below.
  put(
    `<path d="${smooth(cluster.placement.points, true, ZONE_TENSION)}" fill="none" stroke="${C.ink}" stroke-width="1"/>`,
  );

  // ---- F-043: the wider world — surveyed-vs-reported mariners'-chart -------
  // grammar. Everything below traces to a spine node/feature; no invented
  // geography. Drawn INSIDE the sheet clip, after the basin block, which
  // stays byte-for-byte untouched above this line.
  //
  // Fix (post-review): world content is spread across the whole 2000x2000 km
  // frame, so no fixed position for the chrome block (title/subtitle/hand
  // text, below) can dodge every promoted landmass/lane, and the chrome's
  // opaque halo was painting OVER world labels drawn earlier in document
  // order — three ocean names and two Coldreach labels were being fully
  // erased on the rendered chart (0/3 ocean names visible). Every LABEL
  // (not fill/stroke geometry — that stays put() in place, painting order
  // among opaque hatches doesn't matter) is buffered via putLabel() and
  // flushed after the chrome block, so labels always paint on top of it
  // regardless of where either one falls on the sheet.
  // Plan B Task 12, adoption 3: ONE placement pass over the WHOLE sheet,
  // flushed after the chrome block. Labels are collected as data here and
  // positioned once, below — the greedy per-continent vertical stack this
  // replaces could not see a collision between two continents, and needed
  // three hand-tuning attempts to fix a single one inside one.
  const sheetLabels = [];
  const putLabel = (l) => sheetLabels.push(l);

  // The survey note is a note about a PLACE — anchored just east of the
  // surveyed ground's own extent — not part of the fixed chrome cartouche, so
  // it goes through the same declutter as every other placed name. It used to
  // be painted straight onto the sheet, which is why the redraw could sit it
  // squarely on top of the trade-wind lane's label with every gate green: a
  // label that skips the placement pass is a label no collision check sees.
  // Lowest rank on the sheet, so when space is tight it is the one that moves.
  // F-045 Task 4: +15 -> +3 (÷5) — a km offset east of the polygon's own
  // (already-rescaled) extent, placing the note just clear of it.
  const clusterMaxX = Math.max(...cluster.placement.points.map((p) => p[0]));
  putLabel({
    id: `${cluster.id}-survey-note`,
    text: sheet.surveyNote,
    at: [clusterMaxX + 3, cluster.placement.anchor[1]],
    rank: RANKS.namedLandform,
    italic: true,
    fill: C.inkMid,
  });

  // sea names, at each sea's own polygon centroid — the same derivation the
  // ocean names use below, on the body that is actually drawn.
  for (const sp of seaPolys)
    putLabel({
      id: sp.id,
      text: sp.title,
      at: centroid(sp.pts),
      rank: RANKS.sea,
      italic: true,
      fill: C.inkSoft,
    });

  for (const land of worldLand) {
    checkFrame(`${land.id} polygon`, land.placement.points);
    // Plan B Task 12: the fill comes from the table, not from a boolean.
    const fill = patternFor(land);
    // `class="coast-reported"` marks a REPORTED coast, which is what its name
    // says. It used to be keyed on `fill !== "pIce"`, so it marked twelve
    // surveyed-or-reported landmasses alike and skipped the one reported ice
    // cap — the class was a fill test wearing an epistemic name. It is the
    // survey verdict now, so the count of marked coasts equals the count of
    // nodes carrying `lore.reported`.
    const reported = surveyOf({ node: land }) === "reported";
    put(
      `<path d="${smooth(land.placement.points, true, ZONE_TENSION)}" ` +
        `fill="${fill ? `url(#${fill})` : "none"}" stroke="${C.ink}" ` +
        `stroke-width="${fill === "pIce" ? 0.7 : 0.55}"` +
        `${reported ? ' class="coast-reported"' : ""}/>`,
    );
    // ---- F-043 fix (controller visual pass): the majors (Coldreach,
    // Stonemoor) each carry a title + 2 regions + 2 line features + 1 port,
    // all anchored within one ~200x190 km landmass — close enough at this
    // map scale that their labels cut through each other ("Netstead"/"the
    // Stonemoor Shore", "the Stonemoor Spine"/"the Sto[nemoor Shore]").
    // Collect every one of this continent's labels (title included — it
    // collided too, e.g. "COLDREACH" under "the Coldreach Shore") instead of
    // painting them immediately, then run a greedy vertical label-stack pass
    // before flushing them: sort by actual anchor y (not id — id order is
    // unrelated to geography and, tried first, an alternating id-sorted
    // stagger accidentally CANCELLED Netstead/"the Stonemoor Spine"'s own
    // ~23px natural separation instead of widening it), then walk top to
    // bottom enforcing a minimum gap, pushing a label down only as far as it
    // takes to clear the one above it. Monotonic by construction — it can
    // only increase separation between any two labels, never flip or shrink
    // it. Singleton continents (Brightfall/Driftholt/Reedstrand, one reef
    // label + title) are 2 items that are already far enough apart, so no
    // push happens — a no-op, same as before.
    putLabel({
      id: land.id,
      text: land.title.toUpperCase(),
      at: land.placement.anchor,
      rank: RANKS.continent,
    });
  }

  // Regions, settlements and harbours — over the reported continents AND the
  // surveyed ground, whose un-hatched outline is drawn above. Before the
  // redraw the surveyed ground was a hand-drawn miniature with its own dot
  // loop; it is a continent node like any other now, and leaving it out of
  // this pass is what had the chart drawing zero region boundaries.
  for (const land of [...worldLand, cluster]) {
    // tier-2 regions of this continent, dashed administrative boundaries
    const regionIds = (tree.childrenOf.get(land.id) ?? []).filter(
      (id) => tree.byId.get(id)?.tier === "region",
    );
    for (const rid of regionIds) {
      const region = tree.byId.get(rid);
      checkFrame(`${region.id} polygon`, region.placement.points);
      put(
        `<path d="${smooth(region.placement.points, true)}" fill="none" stroke="${C.ink}" ` +
          `stroke-width="0.4" stroke-dasharray="3 3" class="region-bound"/>`,
      );
      putLabel({
        id: region.id,
        text: region.title,
        at: region.placement.anchor,
        rank: RANKS.region,
      });
    }

    // features on the continent itself (reef/ridge/river-mouth lines, port
    // and outlying-isle points) — regions carry none in this corpus, but the
    // loop reads `.features ?? []` so a future authored region draws too.
    for (const node of [land, ...regionIds.map((id) => tree.byId.get(id))]) {
      for (const f of node.features ?? []) {
        if (f.kind === "line") {
          checkFrame(`${f.id} line`, f.points);
          const isReef = f.id.includes("reef");
          put(
            `<path d="${smooth(f.points)}" fill="none" stroke="${C.ink}" stroke-width="0.7"` +
              `${isReef ? ' stroke-dasharray="1 3"' : ""}/>`,
          );
          if (f.attrs?.name) {
            const mid = alongKm(f.points, polylineKm(f.points) / 2);
            // The rotation this label used to carry is gone with the greedy
            // stack: placeLabels' collision boxes are axis-aligned, so a
            // rotated name's box would describe a rectangle the glyphs do not
            // occupy — the gate would be checking the wrong shape. Horizontal
            // and provably uncollided beats angled and overlapping.
            putLabel({
              id: f.id,
              text: f.attrs.name,
              at: mid.at,
              rank: RANKS.namedLandform,
              italic: true,
              fill: C.inkMid,
            });
          } else {
            problems.push(`${f.id}: line feature has no attrs.name for its label`);
          }
        } else if (f.kind === "point") {
          checkFrame(`${f.id} point`, [f.at]);
          const isHarbour = harbourIds.has(f.id);
          // Plan B Task 12, adoption 2: a port is a mark, not a bigger dot. A
          // feature carrying a lexicon `type` draws its family's glyph; an
          // untyped point keeps the plain dot, so nothing untyped changes
          // meaning. No committed feature carries a type today, so this is
          // byte-zero until Plan D writes the first one.
          const gid = f.type ? glyphForType({ lexicon, typeId: f.type }) : null;
          if (f.type) namedCounts[f.type] = (namedCounts[f.type] ?? 0) + 1;
          if (f.type && !gid)
            problems.push(`${f.id}: type "${f.type}" resolves to no glyph family`);
          if (gid) {
            usedGlyphs.add(gid);
            put(glyphUse({ id: gid, x: X(f.at[0]), y: Y(f.at[1]), size: isHarbour ? 9 : 7 }));
          } else {
            put(
              `<circle class="settlement-mark" cx="${X(f.at[0])}" cy="${Y(f.at[1])}" ` +
                `r="${isHarbour ? 2 : 1.1}" fill="${C.ink}"/>`,
            );
          }
          if (isHarbour) {
            if (!f.attrs?.name) problems.push(`${f.id}: harbour feature has no attrs.name`);
            else
              putLabel({
                id: f.id,
                text: f.attrs.name,
                at: f.at,
                rank: RANKS.hub,
                italic: true,
                fill: C.inkMid,
              });
          }
          // outlying-isle points carry attrs.name: null by design — an
          // unnamed circle, no label attempted (F-043 spec).
        }
      }
    }

  }

  // ocean names, lettered along a gentle arc through each sea's centroid —
  // no polygon fill is drawn for oceans on this sheet (bare parchment IS
  // the sea here; only the basin block fills real water).
  //
  // Fix (post-review, visual QA): rsvg-convert — the ONLY rasterizer this
  // repo uses (tools/mapforge/lib/raster.mjs explicitly forbids the
  // ImageMagick fallback) — does not render <textPath> text at all. Verified
  // directly: a minimal <path>+<textPath>HELLO</textPath> test SVG rasterized
  // with the curve visible and the text completely absent. curveLabel's
  // <textPath> output renders correctly in a real SVG viewer (Chrome) but is
  // silently dropped in the shipped PNG asset regardless of document order —
  // no z-order fix can paint text a renderer can't draw at all. A follow-up
  // review found the fix had been applied by ADDING a straight lineLabel
  // alongside the curveLabel rather than replacing it, so every sea name
  // painted twice in any textPath-capable viewer (browsers). Straight
  // rotated labels are the deliberate, SOLE rendering here — spec §5's
  // "curved water labels" resolved to the plan's Risk 4 fallback, not the
  // curved treatment (F-043).
  for (const ocean of worldOceans) {
    // clear-of-land nudge (F-043 fix, controller visual pass): a sea's bay
    // can indent far enough that its vertex-average centroid lands close to
    // the coast — Galereach's did, next to Coldreach — so nudge off any
    // nearby land before drawing, rather than trusting the raw centroid.
    const c = nudgeClearOfLand(centroid(ocean.placement.points));
    // F-045 Task 4: arm 180 -> 36, rise 25 -> 5 (÷5) — real km offsets from
    // the sea's centroid, used only to derive the label's rotation angle
    // (this arc is never drawn); at the pre-fix values the arm alone
    // exceeded the 400km frame for several seas (Galereach, Keelbreak,
    // Tarnmark all failed checkFrame below before this fix).
    const arcPts = [
      [c[0] - 36, c[1] + 5],
      [c[0], c[1]],
      [c[0] + 36, c[1] - 5],
    ];
    checkFrame(`${ocean.id} label arc`, arcPts);
    const angle = r2(
      (Math.atan2(arcPts[2][1] - arcPts[0][1], arcPts[2][0] - arcPts[0][0]) * 180) / Math.PI,
    );
    // `angle` above is still computed and still checkFrame'd — the arc is what
    // proves the label's own span stays inside the frame — but the name is
    // lettered horizontally now, for the same reason as the line features.
    void angle;
    putLabel({ id: ocean.id, text: ocean.title, at: c, rank: RANKS.ocean, italic: true, fill: C.inkSoft });
  }

  put("</g>"); // end sheet clip

  // ---- F-043: every sea-lane, curved and lettered with its season -----------
  // Replaces the single leaving-the-sheet arrow above: this sheet draws ALL
  // charted lanes, skipping only the one whose far end is declared offSheet
  // (e-sea-lane, f-trade-wind-far) — that legacy arrow stays the basin
  // sheet's business (basin-sheet.mjs is untouched by F-043).
  const findFeatureGlobal = (id) => {
    for (const n of tree.byId.values())
      for (const f of n.features ?? []) if (f.id === id) return f;
    return null;
  };
  const resolveLaneEnd = (ref) => {
    if (ref?.node) {
      const node = tree.byId.get(ref.node);
      if (!node) return { at: null, feature: null };
      return {
        at: resolveToRoot({ tree, id: node.parentId, point: node.placement.anchor }),
        feature: null,
      };
    }
    if (ref?.feature) {
      const f = findFeatureGlobal(ref.feature);
      return { at: f ? f.at : null, feature: f };
    }
    return { at: null, feature: null };
  };
  for (const lane of (spine.edges ?? []).filter((e) => e.kind === "sealane")) {
    const toEnd = resolveLaneEnd(lane.to);
    if (toEnd.feature?.offSheet) continue; // the legacy basin arrow
    const fromEnd = resolveLaneEnd(lane.from);
    if (!fromEnd.at || !toEnd.at) {
      problems.push(`sealane ${lane.id}: could not resolve its endpoints`);
      continue;
    }
    if (!lane.attrs?.label) problems.push(`sealane ${lane.id}: attrs.label missing`);
    // the "to" end must ALWAYS resolve to a NAMED town feature (not just when
    // one happens to be present) — a {node}-style "to" ref would otherwise
    // skip this check entirely instead of failing it. "Named" is the whole
    // test the trunk can bear: the redrawn edges run f-town-* -> f-town-*, and
    // being a lane end is what MAKES the town a harbour (see harbourIds).
    if (!toEnd.feature || !toEnd.feature.attrs?.name)
      problems.push(
        `sealane ${lane.id}: "to" does not resolve to a named town feature` +
          (toEnd.feature ? ` (got "${toEnd.feature.id}")` : ""),
      );
    checkFrame(`sealane ${lane.id} tail`, [fromEnd.at]);
    checkFrame(`sealane ${lane.id} head`, [toEnd.at]);

    // quadratic arc: control point offset 6% of the lane's length, sideways
    const dx = toEnd.at[0] - fromEnd.at[0];
    const dy = toEnd.at[1] - fromEnd.at[1];
    const len = Math.hypot(dx, dy) || 1;
    const off = len * 0.06;
    const ctrl = [
      (fromEnd.at[0] + toEnd.at[0]) / 2 - (dy / len) * off,
      (fromEnd.at[1] + toEnd.at[1]) / 2 + (dx / len) * off,
    ];
    const tail = [X(fromEnd.at[0]), Y(fromEnd.at[1])];
    const tip = [X(toEnd.at[0]), Y(toEnd.at[1])];
    const ctrlPx = [X(ctrl[0]), Y(ctrl[1])];
    put(
      `<path d="M${tail[0]},${tail[1]} Q${ctrlPx[0]},${ctrlPx[1]} ${tip[0]},${tip[1]}" ` +
        `fill="none" stroke="${C.ink}" stroke-width="0.8" stroke-dasharray="6 5" class="sea-lane"/>`,
    );
    const ang = r2((Math.atan2(tip[1] - ctrlPx[1], tip[0] - ctrlPx[0]) * 180) / Math.PI);
    put(
      `<path d="M${tip[0]},${tip[1]} l7,-3 l0,6 Z" fill="${C.ink}" transform="rotate(${ang + 180} ${tip[0]} ${tip[1]})"/>`,
    );
    if (lane.attrs?.label)
      putLabel({ id: lane.id, text: lane.attrs.label, at: ctrl, rank: RANKS.sea, italic: true, fill: C.inkMid });
  }

  // ---- chrome from the sheet record: title, subtitle, hand, withheld --------
  // F-043 fix (controller visual pass): the original centred position (CX,
  // py=520 — F-042's placement for an EMPTY frame) now sits directly on top
  // of Coldreach, the primary continent (anchor ~[994,741] km, ~px
  // [754,615]) — the hand-paragraph interleaved with Tallowquay/Coldreach's
  // own labels and buried the continent. Moved the whole block into the
  // open west-central Keelbreak water instead — verified empty against the
  // built SVG: no land polygon, region, feature, port, sea-lane, or basin
  // element falls in x∈[220,620]px / y∈[900,1400]px (nearest neighbours are
  // Driftholt's polygon, starting x=729px, and the sea-lane's own label,
  // which passes well north of y=900 on its way to Tallowquay). Kept the
  // parchment halo (class="zn") — world LABELS are still buffered (putLabel,
  // above) and flushed below, AFTER this block, so they always paint on top
  // of the chrome regardless of where either falls on the sheet.
  const CHROME_CX = 420;
  let py = 950;
  put(
    `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="42" letter-spacing="10">${esc(sheet.title)}</text>`,
  );
  py += 40;
  put(
    `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="17" font-style="italic" ` +
      `fill="${C.inkMid}">${esc(sheet.subtitle)}</text>`,
  );
  py += 52;
  for (const ln of wrap(sheet.hand, 76)) {
    put(
      `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="13" font-style="italic" ` +
        `fill="${C.inkMid}">${esc(ln)}</text>`,
    );
    py += 19;
  }
  py += 30;
  put(
    `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="13" letter-spacing="4" ` +
      `fill="${C.inkMid}">NOT SHOWN ON THIS SHEET</text>`,
  );
  py += 22;
  for (const w of sheet.withheld) {
    put(
      `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="12.5" ` +
        `fill="${C.inkMid}">·  ${esc(w)}</text>`,
    );
    py += 18;
  }

  // ---- F-043 + Plan B Task 12: place, then flush, every world label — AFTER
  // the chrome block, so continent/region/feature/port/ocean/sea-lane labels
  // always paint on top of it (fixes the erased-label defect above).
  //
  // placeLabels is priority-then-id, so the result is a function of the data
  // alone: no insertion order, no hand-tuned nudge, no clock. A label it
  // cannot place is REPORTED by checkLabels, never silently absent.
  const frame = { x: ATLAS_MAP_LEFT, y: ATLAS_MAP_TOP, w: MAP_W, h: MAP_H };
  const byId = new Map(sheetLabels.map((l) => [l.id, l]));
  const { placed, dropped, aboveTier, asked } = placeLabels({
    labels: sheetLabels.map((l) => ({ id: l.id, text: l.text, rank: l.rank, at: [X(l.at[0]), Y(l.at[1])] })),
    obstacles: [],
    maxLabelRank,
    frame,
  });
  // `tier` was the LITERAL 1 while placeLabels ran at `maxLabelRank` (8), so
  // every G-LABEL message this sheet could emit named a tier the sheet was not
  // drawn at. `asked` and `aboveTier` are the seam-4 accounting fix: a name
  // dropped for being over the tier is now counted, and a name in none of the
  // three buckets is a reported failure instead of a silence.
  problems.push(
    ...checkLabels({ placed, dropped, aboveTier, asked, tier: maxLabelRank, budget: labelBudget }),
  );
  notes.push(
    `labels ${asked} asked · ${placed.length} placed · ${dropped.length} dropped · ` +
      `${aboveTier.length} above rank ${maxLabelRank}` +
      (aboveTier.length ? ` (${aboveTier.map((a) => a.id).sort().join(", ")})` : ""),
  );
  for (const p of placed) {
    const src = byId.get(p.id);
    if (p.leader)
      put(
        `<path d="M${p.leader[0][0]},${p.leader[0][1]} L${p.leader[1][0]},${p.leader[1][1]}" ` +
          `stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`,
      );
    // The tracking DRAWN is the tracking placeLabels MEASURED with. Letting the
    // two differ is how a sheet passes its own collision gate and still reads
    // as overlapping: the box would describe a narrower name than the one on
    // the page.
    put(
      `<text class="lbl" x="${p.x}" y="${p.y}" font-size="${p.size}"` +
        `${src?.italic ? ' font-style="italic"' : ""} fill="${src?.fill ?? C.ink}"` +
        ` letter-spacing="${(src?.rank ?? 10) <= 3 ? 2 : 0.6}">${esc(p.text)}</text>`,
    );
  }
  notes.push(`labels ${sheetLabels.length} placed ${placed.length} dropped ${dropped.length}`);

  // ---- the north mark ---------------------------------------------------------
  {
    const n = sheet.northMark;
    const px = X(n.at[0]);
    const npy = Y(n.at[1]);
    put(
      `<g stroke="${C.ink}" stroke-width="1.6" fill="none">` +
        `<path d="M${px},${r2(npy + 22)} L${px},${r2(npy - 20)}"/>` +
        `<path d="M${r2(px - 5)},${r2(npy - 12)} L${px},${r2(npy - 22)} L${r2(px + 5)},${r2(npy - 12)} Z" fill="${C.ink}"/>` +
        `</g>`,
    );
    put(
      `<text x="${px}" y="${r2(npy + 38)}" text-anchor="middle" font-size="15" letter-spacing="2" fill="${C.ink}">${esc(n.label)}</text>`,
    );
  }

  // ---- the frame border --------------------------------------------------------
  put(
    `<rect x="${ATLAS_MAP_LEFT}" y="${ATLAS_MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" ` +
      `fill="none" stroke="${C.ink}" stroke-width="1.6"/>`,
  );

  // ---- the legend band (Plan B Task 12, adoption 4) --------------------------
  // The sheet drew two fills and explained neither. Same swatch grammar as the
  // basin sheet's key — a parchment ground under the hatch, so a light pattern
  // reads against the page instead of floating on it.
  if (legendRows.length) {
    let ly = ATLAS_MAP_TOP + MAP_H + 8 + 16;
    put(
      `<text x="${ATLAS_MAP_LEFT}" y="${r2(ly - 4)}" font-size="12" letter-spacing="2" ` +
        `fill="${C.inkMid}">FILLS · SURVEYED AND REPORTED</text>`,
    );
    ly += 8;
    for (let i = 0; i < legendRows.length; i++) {
      const bx = ATLAS_MAP_LEFT + (i % legendCols) * LEGEND_COL_W;
      const by = ly + Math.floor(i / legendCols) * LEGEND_ROW_H;
      put(
        `<rect x="${r2(bx)}" y="${r2(by)}" width="40" height="24" fill="${C.parchmentDeep}" ` +
          `stroke="${C.inkSoft}" stroke-width="0.8"/>`,
      );
      put(`<rect x="${r2(bx)}" y="${r2(by)}" width="40" height="24" fill="url(#${legendRows[i].pattern})"/>`);
      put(
        `<text x="${r2(bx + 48)}" y="${r2(by + 16)}" font-size="12.5" fill="${C.ink}">${esc(legendRows[i].label)}</text>`,
      );
    }
  }

  // ---- fill the reserved <symbol> slot (adoption 2) -------------------------
  const wanted = [...usedGlyphs].sort();
  const symbols = symbolDefs({ ids: wanted });
  o[symbolSlot] = symbols;
  // symbolDefs DROPS an id with no family rather than writing broken markup,
  // so the emitted set is scanned back out of the markup it produced — asking
  // the same list twice is not a check. Same discipline as synthetic-sheet.mjs.
  const emittedGlyphIds = [...symbols.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  // ---- G-BIOME-INK's per-sheet half (seam-4 review B, survivor 4) -----------
  // This was called `{ emittedIds: referencedPatterns, referencedIds:
  // referencedPatterns }` — the SAME array on both sides, so the emitted-vs-
  // referenced comparison was a list against itself and could never fire. The
  // sibling canary's own comment says exactly that ("derive both from LEGEND
  // and the per-sheet half of checkBiomeInk compares a table with itself and
  // can never fire"); the atlas did the thing the comment warns about.
  //
  // Now the two sides come from two different places: the emitted set is
  // scanned out of the <defs> markup, the referenced set out of the markup
  // that was actually drawn. Paint references only (`fill=` / `stroke=`) — a
  // bare `url(#…)` scan would also pick up clip-path and report `clip-sheet`
  // as a missing pattern.
  //
  // HONEST LIMIT, recorded so the next reviewer does not have to re-derive it:
  // on THIS sheet the two sets coincide by construction — every land in
  // `worldLand` is painted unconditionally and every legend row gets a swatch —
  // so restoring the self-comparison is a mutation NO fixture can kill here.
  // Measured: emitted 3, painted 3, identical at every legend tier. This half
  // is a guard against a future sheet whose draw pass can skip a subject, and
  // it is written the correct way for that day. What IS armed on this sheet is
  // the `legendTier` half below, which was not being passed at all — deleting
  // that argument now reds atlas-sheet.test.mjs.
  const paintedPatterns = [
    ...new Set(
      [...o.join("\n").matchAll(/\s(?:fill|stroke)="url\(#([^)"]+)\)"/g)].map((m) => m[1]),
    ),
  ].sort();
  problems.push(
    ...checkBiomeInk({
      emittedIds: emittedPatterns,
      referencedIds: paintedPatterns,
      legendTier,
    }),
  );
  for (const id of wanted)
    if (!emittedGlyphIds.includes(id))
      problems.push(`G-GLYPH: glyph "${id}" is drawn on this sheet but no <symbol> was emitted`);
  // The catalogue half runs in CENSUS mode: this sheet draws a handful of
  // types, not the whole lexicon, so the vacuous whole-catalogue audit
  // (namedCounts null) belongs to the canary and the lexicon test, not here.
  // `emittedIds` is deliberately NOT passed: its rule is "every glyph any
  // lexicon row names has a <symbol>", which is a claim about a sheet that
  // draws the entire catalogue and would report 40 problems on this one.
  if (lexicon) problems.push(...checkGlyphCoverage({ lexicon, namedCounts }));
  if (usedGlyphs.size) notes.push(`glyphs ${wanted.length} families, ${Object.keys(namedCounts).length} types`);

  put("</svg>");
  // Empty lines are dropped: the reserved <symbol> slot above contributes ""
  // on a sheet that draws no glyph, and a blank line in the middle of <defs>
  // is a byte nobody asked for.
  const svg = o.filter((line) => line !== "").join("\n") + "\n";
  return { svg, notes, problems };
}

export function buildAtlasSheet({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const sheet = JSON.parse(
    readFileSync(join(repoRoot, "content/spine/sheet-atlas.json"), "utf8"),
  );
  // A tree with no content/world/ is a real fixture state, not an error — the
  // sheet simply has no glyph vocabulary to draw from. Reported, never thrown.
  let lexicon = null;
  try {
    lexicon = JSON.parse(
      readFileSync(join(repoRoot, "content/world/lexicon/landforms.json"), "utf8"),
    );
  } catch {
    lexicon = null;
  }
  return drawAtlasSheet({ spine, tree, sheet, lexicon });
}
