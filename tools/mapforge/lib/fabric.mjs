// tools/mapforge/lib/fabric.mjs — P14: arcs -> polygons -> fabric + trunk.
//
// Two outputs from one topology: the FABRIC (regions, instances, settlements,
// roads — the shapes that get drawn) and the TRUNK (13 continent polygons,
// 3 oceans, 9 seas — the spine nodes the gate walks). The trunk polygon is
// GENERATED, simplified from the same arc topology the fabric contour comes
// from, which is the only reading under which G-TRUNK-AREA's +/-3% makes
// sense (spec §11 lower-stakes table).
//
// ── THE VERTEX CAP, AND WHY THE PLAN'S `fitVertexCap` IS NOT HERE ──────────
// The plan (:6193-6201) re-simplifies a RING with a doubling epsilon until it
// fits the cap. That is the sliver the one-shot rule exists to prevent:
// `simplifyArc` is idempotent at a fixed epsilon but NOT across a doubling, so
// two neighbours whose rings hit the cap at different iteration counts diverge
// on their SHARED boundary. Measured in seam 3 on a two-owner ragged field:
// shared vertices 10 -> 6 -> 3 as the cap tightens, with one owner's area
// moving (145.0 -> 144.5 -> 144.125) and the other's not. STATE §5 records it.
//
// The cap is met on the ARCS instead, before assembly:
//
//   * `capArc` is a PURE FUNCTION OF THE ARC — its raw points, a cap and the
//     base epsilon. Every candidate is a ONE-SHOT Douglas-Peucker of the RAW
//     points at a single epsilon; nothing is ever re-simplified from an
//     already-simplified list. Both owners of a shared arc call it with the
//     same three arguments and therefore get byte-identical vertices. A tear
//     is not merely unlikely here, it is unrepresentable.
//   * `fitArcTopology` raises the cap level only on the LONGEST arc(s) of an
//     owner whose ring is over budget, then re-measures. The set of arcs it
//     tightens is a function of the field alone.
//
//     THE TWO TOPOLOGIES COST WILDLY DIFFERENT AMOUNTS, and quoting only the
//     cheap one is what this comment used to do. Both measured on the real
//     world, 2026-08-22:
//       REGION topology (160 owners, 532 arcs, cap 200): 5 rounds, ONE arc
//         tightened, worst ring 234 -> 194, worst region area drift 0.55%.
//       TRUNK topology (16 owners, 70 arcs, cap 160): 89 rounds, TWENTY-TWO
//         arcs tightened, and the tightening is severe — arc-000002 (the
//         Galereach/Wealdmarch coast) 820 raw / 259 one-shot -> 16, and one
//         arc (arc-000014, the Galereach/Keelbreak seam) reaches the
//         ARC_CAP_LADDER floor of 4. c06 Reedstrand's WHOLE ring is 16
//         vertices where its one-shot coast would be 154.
//
//     That is not a defect in the rule, it is the committed budget: an ocean
//     is one concave polygon wrapping most of the world, its one-shot ring is
//     1,112 vertices, and G-VERTEX-BUDGET's effective cap is 160 — so ~85% of
//     it has to go, and the longest-arc rule spends the shortage on the arcs
//     that have the most to give. A small continent whose entire coast is two
//     arcs of that ocean therefore pays the ocean's bill. See `buildTrunkRings`
//     for where the detail actually survives and what Plan E must ink.
//
// The escalation ladder inside `capArc` is x1.125, not x2. Doubling overshoots:
// measured, the one region arc that has to give way came back at epsilon 0.70
// with a 3.67% area drift on its neighbour, against 0.55% at the gentler step.
import { createHash } from "node:crypto";
import { extractArcs, simplifyArc, assembleRings, fractalise, DP_EPSILON_KM } from "./arcs.mjs";
import { FLAG } from "./grid.mjs";
import { q } from "./noise.mjs";
import { shoelaceArea } from "../../../scripts/lib/spine.mjs";

// TASK 10 RE-EXPORTS THESE, IT DOES NOT REDEFINE THEM (STATE §14). Two
// spellings of one id grammar is how an edge endpoint stops resolving, and
// `townSlug` carries the titleless-pin refusal seam 5 shipped: a pin's
// f-town id comes from its NAME, never from its id, or Plan E's committed
// canon legs resolve `f-town-c-town-gildmark` and G-NET reds at the redraw.
export { townFeatureId, slugOf, townSlug, townFeatureIds } from "./passes/settlements.mjs";

// The PER-TIER half of G-VERTEX-BUDGET for a world-tier child. It is NOT the
// effective cap: check_content.mjs:2592 uses
// `Math.min(load-budget.maxRingPoints, VERTEX_CAP[tier])`, and the committed
// maxRingPoints is 160, so 160 binds on every tier today. `trunkRingCap` reads
// the committed budget rather than restating a number, which is why the plan's
// bare `MAX_TRUNK_RING_POINTS = 800` is not exported here — a trunk ring built
// to 800 fails the real gate on the draft root.
export const TRUNK_TIER_VERTEX_CAP = 800;
export const MAX_REGION_RING_POINTS = 200;

export function trunkRingCap({ loadBudget }) {
  const global = loadBudget?.maxRingPoints;
  if (!Number.isFinite(global))
    throw new Error("fabric: content/spine/load-budget.json has no numeric maxRingPoints — " +
      "G-VERTEX-BUDGET's effective cap is min(maxRingPoints, tier cap) and this is the tighter term");
  return Math.min(global, TRUNK_TIER_VERTEX_CAP);
}

export const quantiseRing = (ring) => ring.map(([x, y]) => [q(x), q(y)]);

// ── the one-shot arc cap ───────────────────────────────────────────────────
// The ladder is bounded and its top is larger than the frame: 0.35 x 1.125^60
// is ~374 km against a 400 km frame, so the loop always terminates and the
// last rung is a straight chord between the arc's two nodes.
export const CAP_LADDER_STEP = 1.125;
export const CAP_LADDER_RUNGS = 60;

/** The epsilon of rung `k` of the cap ladder. Repeated multiplication, not
 *  `Math.pow` or `**` — the determinism inventory bans both by name on the
 *  committed-byte path, and this value decides committed ring vertices. */
export function capEpsilon({ epsilonKm = DP_EPSILON_KM, rung }) {
  let eps = epsilonKm;
  for (let k = 0; k < rung; k++) eps *= CAP_LADDER_STEP;
  return eps;
}

// RECORDED MUTATION SURVIVOR, with the measurement, so the next reviewer does
// not re-derive it. Replacing the ONE-SHOT candidate below with a
// re-simplification of the previous rung (`simplifyArc({ points: out, … })`)
// leaves the whole suite green. It is not a hole in the tests, it is an
// equivalence: measured over 2,660 comparisons on the real world's 532 region
// arcs at five caps, and over 2,000 random ragged polylines, one-shot and
// iterative agree on EVERY case — on the x1.125 ladder and on a doubling one.
// Douglas-Peucker on an OPEN polyline keeps both endpoints and the recursion
// re-anchors on the same two, so a coarser pass over the survivors selects
// what the coarser pass over the raw points would have.
//
// A RING is the case where they diverge, and that is the case this module
// refuses to have: `[...ring, ring[0]]` re-anchors the recursion on a vertex
// the previous pass happened to keep, which is why seam 3 measured a shared
// boundary going 10 -> 6 -> 3 vertices. `the PLAN's ring-level fitVertexCap
// tears the same seam` in fabric.test.mjs reproduces that, so the property IS
// under test — at the level where it can fail.
//
// STRENGTHENED 2026-08-22 (seam-6 review): the equivalence is a THEOREM for
// this implementation, not a property of today's data, and the sentence that
// used to stand here understated it. An independent probe ran 7,200,000
// comparisons — random ragged polylines, 4-13 points, three coordinate scales,
// twelve rungs each, on the x1.125 ladder and on x1.5 and x2 ladders — with
// zero mismatches, and the proof is short:
//
//   For e2 >= e1 let S1 = DP(P, e1). DP keeps BOTH endpoints, so S1 is a
//   subsequence of P sharing its top chord. The maximum chord distance over S1
//   is <= the maximum over P, and the maximiser m in S1 realises it;
//   `simplifyArc`'s strict `d > bestD` tie-break selects the LOWEST INDEX,
//   which is the same m in both lists. So DP(S1, e2) splits at m and recurses
//   on exactly the sublists DP(P, e2) recurses on, and when the top-level
//   distance falls in (e1, e2] both collapse to the two endpoints. Induction
//   on the sublists closes it.
//
// THE TWO PREMISES ARE THEREFORE LOAD-BEARING and a change to either breaks
// the equivalence: (a) DP keeps both endpoints, and (b) the tie-break is
// lowest-index. Neither is incidental; a `>=` in `simplifyArc`'s comparison
// would pick the HIGHEST index and the two forms would diverge.
//
// The one-shot form stays anyway, because it is the rule as stated and because
// it does not depend on the recursion order of a previous pass.
export function capArc({ points, cap, epsilonKm = DP_EPSILON_KM }) {
  const base = simplifyArc({ points, epsilonKm });
  if (!Number.isFinite(cap) || base.length <= cap) return base;
  let out = base;
  for (let k = 1; k <= CAP_LADDER_RUNGS; k++) {
    // ONE-SHOT, from the RAW points, at a single epsilon. Never from `out`.
    const c = simplifyArc({ points, epsilonKm: capEpsilon({ epsilonKm, rung: k }) });
    if (c.length <= cap) return c;
    out = c;
  }
  return out;
}

// The per-arc caps `fitArcTopology` walks. `Infinity` is "the one-shot epsilon
// alone"; every other rung is a vertex count.
export const ARC_CAP_LADDER = Object.freeze([Infinity, 192, 160, 128, 112, 96, 80, 72, 64, 56, 48, 40, 32, 24, 16, 12, 8, 6, 4]);

/**
 * Simplify one arc topology so that no owner's ring exceeds `ringCap`, without
 * ever re-simplifying a ring. Returns the simplified arcs and, for every owner
 * index in `ownerIds`, the assembled `{ rings, holes, areaKm2 }`.
 *
 * `ownerIds` is a list of [label, ownerIndex]; the label is only used in
 * `problems`, so a caller can name c04/r13 rather than "owner 57".
 */
export function fitArcTopology({ arcs, ownerIds, ringCap, epsilonKm = DP_EPSILON_KM,
                                 problems = [], what = "topology" }) {
  const level = new Map(arcs.map((a) => [a.id, 0]));
  // MEMOISED per (arc, level). Only the arcs bumped in the previous round can
  // have moved, and a round re-simplifies every arc otherwise: the trunk
  // topology settles in 89 rounds over 70 arcs, so the cache turns 6,230
  // Douglas-Peucker runs into 92.
  const memo = new Map();
  const simplify = (a) => {
    const lv = level.get(a.id);
    const key = `${a.id}:${lv}`;
    let pts = memo.get(key);
    if (pts === undefined) {
      pts = capArc({ points: a.points, cap: ARC_CAP_LADDER[lv], epsilonKm });
      memo.set(key, pts);
    }
    return pts;
  };
  let simplified = null, assembled = null, rounds = 0;
  // One round per possible tightening of one arc is the loose bound; the real
  // world converges in 5. The cap is a bound, not a target.
  const MAX_ROUNDS = arcs.length * ARC_CAP_LADDER.length + 2;
  for (rounds = 0; rounds <= MAX_ROUNDS; rounds++) {
    simplified = arcs.map((a) => ({ ...a, points: simplify(a) }));
    assembled = new Map();
    const over = [];
    for (const [label, n] of ownerIds) {
      const r = assembleRings({ arcs: simplified, ownerId: n });
      assembled.set(label, r);
      if (widestRing(r) > ringCap) over.push(n);
    }
    if (over.length === 0) break;
    const bump = new Set();
    for (const n of over) {
      // Only the LONGEST arc(s) of the offending owner give way. Tightening
      // every arc of the owner reaches the same ring counts while touching ten
      // times as many arcs (measured: 10 of 532 against 1 of 532) and dragging
      // every neighbour's boundary with them.
      const mine = simplified.filter((a) => a.left === n || a.right === n);
      if (mine.length === 0) continue;
      let widest = 0;
      for (const a of mine) if (a.points.length > widest) widest = a.points.length;
      for (const a of mine) if (a.points.length === widest) bump.add(a.id);
    }
    let moved = false;
    for (const id of bump) {
      const next = level.get(id) + 1;
      if (next < ARC_CAP_LADDER.length) { level.set(id, next); moved = true; }
    }
    if (!moved) break;      // every arc of every offender is already at the floor
  }
  const tightened = [...level.values()].filter((l) => l > 0).length;
  for (const [label, r] of assembled)
    if (widestRing(r) > ringCap)
      problems.push(`${what}: ${label} ring has ${widestRing(r)} vertices > cap ${ringCap} — ` +
        `every arc it uses is already at the simplification floor, so the ring is bounded by its ARC COUNT`);
  return { arcs: simplified, assembled, rounds, tightened };
}

export const widestRing = (r) => {
  let w = 0;
  for (const ring of r.rings) if (ring.length > w) w = ring.length;
  for (const hole of r.holes) if (hole.length > w) w = hole.length;
  return w;
};

// ── region rings ───────────────────────────────────────────────────────────
// A region is NOT one ring. `growRegions` is a D8 Dijkstra, so a region can
// pinch to a single lattice corner: 18 of the 160 have a boundary of more than
// one ring and three enclose holes. Under the plan's single-`ring` shape (line
// 318, `ringsFromOwner` at 6379) this world silently drops 384.50 km² —
// c04/r13 draws 308.00 of its declared 470.50 and c07/r02 346.50 of 504.00
// across five rings. The record carries `rings` AND `holes`.
export function buildRegionRings({ grid, regions, problems = [], areaTolerancePct = 5 }) {
  const { arcs } = extractArcs({ owner: grid.owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const fit = fitArcTopology({ arcs, ownerIds: regions.map((r, n) => [r.id, n]),
    ringCap: MAX_REGION_RING_POINTS, problems, what: "region rings" });
  const out = new Map();
  regions.forEach((rec) => {
    const r = fit.assembled.get(rec.id);
    if (!r || r.rings.length === 0) {
      problems.push(`region rings: ${rec.id} produced no ring from ${rec.cells} owned cells`);
      return;
    }
    // The DECLARED area is the cell census; the DRAWN area is the shoelace of
    // the simplified rings minus the holes. Douglas-Peucker MOVES vertices, so
    // the two cannot be equal — what must not happen is a silent divergence,
    // so anything past the tolerance is named.
    const drift = Math.abs(r.areaKm2 - rec.areaKm2) / rec.areaKm2 * 100;
    if (drift > areaTolerancePct)
      problems.push(`region rings: ${rec.id} draws ${r.areaKm2.toFixed(2)} km² against a declared ` +
        `${rec.areaKm2.toFixed(2)} km² (${drift.toFixed(2)}%, tolerance ${areaTolerancePct}%)`);
    out.set(rec.id, {
      rings: r.rings.map(quantiseRing),
      holes: r.holes.map(quantiseRing),
      areaKm2: r.areaKm2,
      widest: widestRing(r),
    });
  });
  return { rings: out, rounds: fit.rounds, tightened: fit.tightened, arcCount: arcs.length };
}

// FRACTAL COAST DETAIL IS OFF, AND THAT IS A MEASUREMENT, NOT AN OMISSION.
// The plan's global constraint asks for 3 levels of <= 0.25 km fractal detail
// on the coast arcs. Applied to the fabric contour it costs ~220 ms of a
// 4,000 ms generate budget and takes the 13 outerRings from 2,413 vertices to
// 18,030 — 33.8 KB of one continent's fabric file against a COMMITTED
// 262,144 B per-file cap that four of the thirteen already sit close to. And
// what it buys is decoration BELOW the data's own resolution: the grid is
// 0.5 km and the amplitude is 0.25 km, so every vertex it adds is finer than
// anything the cell field can know. The right venue is Plan E's redraw ink,
// where the amplitude can be chosen against the sheet scale. `fractalise`
// therefore still has no production caller — it is reachable here by
// `fractal: true` and covered by arcs.test.mjs.
export const FRACTAL_COAST = false;

// ── the fabric coast contour ───────────────────────────────────────────────
// `outerRing` is the continent's own coast at FABRIC resolution: the one-shot
// 0.35 km epsilon with the plan's fractal detail on the arcs that face the
// sea. It is NOT the trunk ring — 3 levels of fractal detail multiply an arc's
// vertex count by ~7.5 (measured: 2,413 -> 18,030 over the coast arcs), and
// the effective spine cap is 160, so a fractalised trunk polygon cannot exist
// at any epsilon that also keeps the shape. The trunk is simplified from the
// SAME topology by `buildWorldRings`; G-TRUNK-AREA's ±3% is what pins them
// together.
export function buildCoastRings({ grid, premises, stream, fractal = FRACTAL_COAST, problems = [] }) {
  const plateOwner = plateOwnerField({ grid });
  const { arcs } = extractArcs({ owner: plateOwner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const detailed = arcs.map((a) => {
    const simplified = simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM });
    const isCoast = a.left === -1 || a.right === -1;
    return { ...a, points: fractal && isCoast
      ? fractalise({ arc: { ...a, points: simplified }, amplitudeKm: 0.25, levels: 3, stream })
      : simplified };
  });
  const out = new Map();
  premises.forEach((p, k) => {
    const r = assembleRings({ arcs: detailed, ownerId: k });
    if (r.rings.length === 0) { problems.push(`coast rings: ${p.id} produced no ring`); return; }
    out.set(p.id, { rings: r.rings.map(quantiseRing), holes: r.holes.map(quantiseRing), areaKm2: r.areaKm2 });
  });
  return out;
}

export function plateOwnerField({ grid }) {
  const plateOwner = new Int16Array(grid.n).fill(-1);
  for (let i = 0; i < grid.n; i++)
    if (grid.plate[i] >= 0 && (grid.flags[i] & FLAG.SEA) === 0) plateOwner[i] = grid.plate[i];
  return plateOwner;
}

// ── the water partition ────────────────────────────────────────────────────

/** Deterministic seed cell for ocean `index`: the sea cell nearest the frame
 *  corner assigned to that ocean, scanned in row-major order so ties break on
 *  cell index exactly as the region partition's heap does. */
export function oceanSeedCell({ grid, index, blocked = null }) {
  // Three fixed anchors spread across the frame: NW, SE, NE in cell space.
  const anchors = [[0, 0], [grid.w - 1, grid.h - 1], [grid.w - 1, 0]];
  const [ax, ay] = anchors[index % anchors.length];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) === 0) continue;
    if (blocked && blocked[i]) continue;
    const x = i % grid.w, y = (i / grid.w) | 0;
    const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);   // integer, exact
    if (d < bestD) { bestD = d; best = i; }                 // strict <: first index wins ties
  }
  return best;
}

/** Budgeted multi-source growth: exactly the region partition's algorithm, so
 *  there is ONE partition discipline in the codebase. One global binary heap
 *  keyed (cost, cellIndex) — the cell-index tiebreak is what makes the result
 *  independent of insertion order — each source stopping at its quota. */
export function assignByQuota({ grid, owner, seeds, quotas, mask, ownerValue = null }) {
  // A LEVEL BFS, NOT A BINARY HEAP — and the two are the same order.
  //
  // Every edge here costs exactly 1, so a heap keyed (cost, cellIndex) pops
  // every cost-c entry before any cost-(c+1) entry, and within a cost in
  // ascending cell index. That is precisely "collect the next level, sort it
  // by cell index, walk it" — with none of the sifting. The plan's
  // array-of-triples heap measured 450 ms per ocean growth and a typed
  // three-array heap 2.1 s (six element writes per swap instead of one
  // pointer); this is 1.46 M entries through a handful of typed-array sorts.
  //
  // The one case the plan's comparator does NOT decide is two SOURCES reaching
  // the same cell at the same cost, where it returns 0 and a binary heap
  // answers from its internal layout. Packing `cell * sources + source` makes
  // the sort settle it on the lower source index — data, not layout — and the
  // real world's ocean partition is byte-identical either way (measured: same
  // owner digest, same three quotas, same 12,800 unclaimed cells).
  const n = grid.n, w = grid.w, h = grid.h;
  const srcCount = Math.max(1, quotas.length);
  const taken = quotas.map(() => 0);
  let cur = [];
  seeds.forEach((cell, s) => { if (cell >= 0 && mask(cell)) cur.push(cell * srcCount + s); });
  cur = Int32Array.from(cur).sort();
  const next = new Int32Array(4 * n + 16);
  while (cur.length > 0) {
    let tail = 0;
    let prevCell = -1;
    for (let k = 0; k < cur.length; k++) {
      const packed = cur[k];
      const s = packed % srcCount;
      const i = (packed - s) / srcCount;
      if (i === prevCell) continue;            // a later source lost this cell to a lower one
      if (owner[i] !== -1 || !mask(i)) continue;
      if (taken[s] >= quotas[s]) continue;
      prevCell = i;
      owner[i] = ownerValue === null ? s : ownerValue;
      taken[s]++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0)        next[tail++] = (i - 1) * srcCount + s;
      if (x < w - 1)    next[tail++] = (i + 1) * srcCount + s;
      if (y > 0)        next[tail++] = (i - w) * srcCount + s;
      if (y < h - 1)    next[tail++] = (i + w) * srcCount + s;
    }
    cur = next.subarray(0, tail).slice().sort();
  }
  return taken;
}

// ── corridors: what makes an ocean polygon legal at all ────────────────────
//
// AN OCEAN THAT SURROUNDS A LANDMASS ENCLOSES IT. Measured on the real world
// with the plan's own construction: Galereach came back with two holes worth
// 15,103 and 3,197 km² — Wealdmarch and Reedstrand — and Keelbreak with one of
// 998. A spine `placement` is ONE ring with no hole support, so the emitted
// polygon would have been the OUTER ring and would have contained those
// landmasses whole: G-OVERLAP's limit against c02 is
// 0.005 x min(41800, 12127) = 60.6 km² against an overlap of 12,127.
//
// This is topological, not a resolution artefact — no epsilon and no seeding
// fixes it, because any region covering ~96% of the water around an island
// surrounds the island.
//
// The fix is a CORRIDOR: a strip of sea cells reserved from every ocean, run
// from an enclosed landmass to the nearest frame edge. It gives that landmass
// a path to the outside made of non-ocean cells, and a ring that encircled it
// would have to cross that path. The corridors are also where the committed
// 3,200 km² interstitial lives, so they are not a cost the budget has to find
// room for — they ARE that budget line.
//
// CORRIDORS ARE CUT ONLY WHERE AN ENCLOSURE IS MEASURED, and the measurement
// is a flood fill, not a ring inspection: for ocean j, flood the COMPLEMENT of
// j inward from the frame border; a land cell the flood cannot reach is
// enclosed by j. Cutting one for every landmass up front was tried and is
// WRONG — 13 corridors sever the sea into basins no single ocean seed can
// reach, and the three quotas came back 131,753 / 121,600 / 23,518 of
// 167,200 / 121,600 / 76,000 with 25,182 km² of water claimed by nobody.
// Measured with the demand-driven loop: 5 corridors (c02, c06, c07, c10, c13),
// 255 km², every quota met exactly, unclaimed water 3,200.00 km² — the
// committed interstitial to the cell.
export const CORRIDOR_HALF_WIDTH = 2;    // cells either side of the spine: 5 cells, 2.5 km
export const MAX_CORRIDOR_PASSES = 16;   // one pass can only ever add corridors; 13 landmasses bound it

/** The landmasses ocean `oceanIndex` encloses: flood the complement of that
 *  ocean inward from the frame border and report the plates it cannot reach. */
export function enclosedLandmasses({ grid, owner, oceanValue }) {
  const { w, h, n } = grid;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (i) => { if (owner[i] !== oceanValue && !seen[i]) { seen[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (top > 0) {
    const i = stack[--top];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  const out = new Set();
  for (let i = 0; i < n; i++)
    if (grid.plate[i] >= 0 && (grid.flags[i] & FLAG.SEA) === 0 && !seen[i]) out.add(grid.plate[i]);
  return out;
}

/** Reserve a straight strip of sea cells from landmass `plate` to the nearest
 *  frame edge. Deterministic: the start is the plate's land cell with the
 *  smallest distance to any frame edge, ties broken on cell index, and the
 *  direction is that edge. Returns the number of cells newly reserved. */
export function cutCorridor({ grid, plate, reserved, halfWidth = CORRIDOR_HALF_WIDTH }) {
  const { w, h, n } = grid;
  let best = -1, bestD = Infinity, bestDir = 0;
  for (let i = 0; i < n; i++) {
    if (grid.plate[i] !== plate || (grid.flags[i] & FLAG.SEA) !== 0) continue;
    const x = i % w, y = (i / w) | 0;
    const ds = [x, w - 1 - x, y, h - 1 - y];         // W, E, N, S
    let d = ds[0], dir = 0;
    for (let t = 1; t < 4; t++) if (ds[t] < d) { d = ds[t]; dir = t; }
    if (d < bestD) { bestD = d; best = i; bestDir = dir; }
  }
  if (best < 0) return 0;
  const x0 = best % w, y0 = (best / w) | 0;
  const step = [[-1, 0], [1, 0], [0, -1], [0, 1]][bestDir];
  let cut = 0;
  for (let x = x0, y = y0; x >= 0 && y >= 0 && x < w && y < h; x += step[0], y += step[1]) {
    for (let o = -halfWidth; o <= halfWidth; o++) {
      const cx = step[0] !== 0 ? x : x + o;
      const cy = step[0] !== 0 ? y + o : y;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const j = cy * w + cx;
      if ((grid.flags[j] & FLAG.SEA) !== 0 && !reserved[j]) { reserved[j] = 1; cut++; }
    }
  }
  return cut;
}

/**
 * The world owner field the TRUNK is traced from: land cell of plate k -> k,
 * sea cell of ocean j -> `oceanBase + j`, reserved corridor and unclaimed
 * water -> -1. ONE field, so every coast arc is traced once and a continent
 * and the ocean beside it share their boundary vertices byte for byte. That is
 * what makes the pairwise G-OVERLAP of all sixteen polygons measure 0.000.
 */
export const OCEAN_OWNER_BASE = 13;

export function buildWaterPartition({ grid, premises, manifest, problems = [] }) {
  const cellKm2 = grid.cellKm * grid.cellKm;
  const quotas = manifest.oceans.map((o) => Math.round(o.polygonKm2 / cellKm2));
  const isSea = (i) => (grid.flags[i] & FLAG.SEA) !== 0;
  let seaSupply = 0;
  for (let i = 0; i < grid.n; i++) if (isSea(i)) seaSupply++;
  const quotaSum = quotas.reduce((a, b) => a + b, 0);
  if (quotaSum > seaSupply)
    problems.push(`buildWaterTrunk: ocean quotas total ${quotaSum} cells but only ${seaSupply} ` +
      `sea cells exist — the ocean rings would come out short of their committed polygonKm2 and ` +
      `surface two tasks later as a G-ATLAS-ROLLUP miss with no local symptom`);

  const reserved = new Uint8Array(grid.n);
  const corridors = [];
  let owner = null, taken = null, passes = 0;
  for (passes = 0; passes < MAX_CORRIDOR_PASSES; passes++) {
    owner = new Int16Array(grid.n).fill(-1);
    for (let i = 0; i < grid.n; i++)
      if (grid.plate[i] >= 0 && !isSea(i)) owner[i] = grid.plate[i];
    const water = new Int16Array(grid.n).fill(-1);
    const seeds = manifest.oceans.map((o, j) => oceanSeedCell({ grid, index: j, blocked: reserved }));
    taken = assignByQuota({ grid, owner: water, seeds, quotas,
      mask: (i) => isSea(i) && !reserved[i] });
    for (let i = 0; i < grid.n; i++) if (water[i] >= 0) owner[i] = OCEAN_OWNER_BASE + water[i];
    const enclosed = new Set();
    for (let j = 0; j < manifest.oceans.length; j++)
      for (const k of enclosedLandmasses({ grid, owner, oceanValue: OCEAN_OWNER_BASE + j }))
        enclosed.add(k);
    if (enclosed.size === 0) break;
    for (const k of [...enclosed].sort((a, b) => a - b)) {
      const cells = cutCorridor({ grid, plate: k, reserved });
      corridors.push({ continent: premises[k]?.id ?? `plate-${k}`, cells });
    }
  }
  if (passes >= MAX_CORRIDOR_PASSES)
    problems.push(`buildWaterTrunk: the corridor loop did not settle in ${MAX_CORRIDOR_PASSES} passes — ` +
      `an ocean still encloses a landmass and its polygon would overlap it whole`);
  manifest.oceans.forEach((o, j) => {
    if (taken[j] < quotas[j])
      problems.push(`buildWaterTrunk: ocean ${o.id} filled ${taken[j]} of ${quotas[j]} cells ` +
        `(${(taken[j] * cellKm2).toFixed(1)} of ${o.polygonKm2} km²) — its seed's water basin is too small`);
  });
  let unclaimedSeaCells = 0;
  for (let i = 0; i < grid.n; i++) if (isSea(i) && owner[i] < 0) unclaimedSeaCells++;
  return { owner, taken, reserved, corridors, passes, unclaimedSeaCells };
}

/**
 * The nine seas, carved from their own ocean's cells at a margin. The margin
 * is what G-CONTAIN rests on: the sea and the ocean are traced from DIFFERENT
 * topologies (the ocean's territory INCLUDES its seas, because a parent's
 * placement must contain its children's), so their boundaries are simplified
 * independently and only a margin wider than both errors keeps the sea inside.
 * `SEA_MARGIN_CELLS` 16 = 8 km; measured containment is 100.000% on all nine.
 *
 * THE MARGIN LADDER, measured 2026-08-22, as the area of a sea lying OUTSIDE
 * its ocean after both rings are independently simplified:
 *
 *     16 cells (8.0 km)  0.000 km²      2 cells (1.0 km)  0.000 km²
 *      8 cells (4.0 km)  0.000 km²      1 cell  (0.5 km)  0.230 km²
 *      4 cells (2.0 km)  0.000 km²      0 cells (0.0 km) 11.455 km²
 *
 * RECORDED MUTATION SURVIVOR: dropping 16 to 2 leaves the suite green, and it
 * is a genuine EQUIVALENCE rather than a hole — containment is exactly zero all
 * the way down to 2. The committed 16 is therefore an 8x safety factor over the
 * last rung that works, kept because the margin costs nothing (it is water an
 * ocean keeps for itself) and because the first rung that fails, 1, fails by an
 * amount the containment test's old 0.5 km² tolerance could not see. That
 * tolerance is now zero, so the 16 -> 1 mutation dies even though 16 -> 2 does
 * not — the survivor that remains is the one that is actually equivalent.
 */
export const SEA_MARGIN_CELLS = 16;

export function buildSeaPartition({ grid, manifest, worldOwner, problems = [],
                                    marginCells = SEA_MARGIN_CELLS }) {
  const n = grid.n;
  const cellKm2 = grid.cellKm * grid.cellKm;
  const seaOwner = new Int16Array(n).fill(-1);
  // ONE distance field for the whole world owner map: dist[i] is the distance
  // from cell i to the nearest cell of a different owner, the frame's outside
  // included. A cell of ocean j at dist >= margin is `marginCells` inside that
  // ocean and nothing else.
  const dist = interiorDistances({ grid, owner: worldOwner });
  manifest.oceans.forEach((o, j) => {
    const oceanValue = OCEAN_OWNER_BASE + j;
    const inOcean = (i) => worldOwner[i] === oceanValue;
    manifest.seas.forEach((s, k) => {
      if (s.ocean !== o.id) return;
      // Seed the DEEPEST unclaimed interior cell, ties on lowest index. The
      // plan's `stride`-counted seed put n-drowned-pavement in a 750-cell
      // pocket of a 14,400-cell quota; depth-first seeding fills all nine.
      let seed = -1, bestD = 0;
      for (let i = 0; i < n; i++) {
        if (!inOcean(i) || dist[i] < marginCells || seaOwner[i] !== -1) continue;
        if (dist[i] > bestD) { bestD = dist[i]; seed = i; }
      }
      const quota = Math.round(s.polygonKm2 / cellKm2);
      const got = assignByQuota({ grid, owner: seaOwner, seeds: [seed], quotas: [quota],
        mask: (i) => inOcean(i) && dist[i] >= marginCells && seaOwner[i] === -1, ownerValue: k });
      if (got[0] < quota)
        problems.push(`buildWaterTrunk: sea ${s.id} filled ${got[0]} of ${quota} cells ` +
          `(${(got[0] * cellKm2).toFixed(1)} of ${s.polygonKm2} km²) inside ${o.id}`);
    });
  });
  return seaOwner;
}

/**
 * For every cell, its 4-connected distance to the nearest cell of a DIFFERENT
 * owner (the frame's outside counts as a different owner). ONE pass over the
 * whole field, propagating only between same-owner cells — the per-owner form
 * this replaces cost a full 640,000-cell BFS for each of the sixteen trunk
 * owners, the three oceans and the nine seas, and P14w measured 1,695 ms of a
 * 4,000 ms generate budget because of it.
 */
export function interiorDistances({ grid, owner }) {
  const { w, h, n } = grid;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const o = owner[i];
    const x = i % w, y = (i / w) | 0;
    let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (!edge) {
      if (owner[i - 1] !== o || owner[i + 1] !== o || owner[i - w] !== o || owner[i + w] !== o) edge = true;
    }
    if (edge) { dist[i] = 0; queue[tail++] = i; }
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head], d = dist[i] + 1, o = owner[i];
    const x = i % w, y = (i / w) | 0;
    if (x > 0 && dist[i - 1] < 0 && owner[i - 1] === o) { dist[i - 1] = d; queue[tail++] = i - 1; }
    if (x < w - 1 && dist[i + 1] < 0 && owner[i + 1] === o) { dist[i + 1] = d; queue[tail++] = i + 1; }
    if (y > 0 && dist[i - w] < 0 && owner[i - w] === o) { dist[i - w] = d; queue[tail++] = i - w; }
    if (y < h - 1 && dist[i + w] < 0 && owner[i + w] === o) { dist[i + w] = d; queue[tail++] = i + w; }
  }
  return dist;
}

/** A point guaranteed to be deep inside an owner's cell set: the cell with the
 *  greatest distance from any other owner, ties on lowest index. A CENTROID is
 *  NOT usable here — an ocean that runs around a landmass is concave and its
 *  vertex mean lands on the land, which reds G-ANCHOR. */
export function interiorPointKm({ grid, owner, value, dist = null }) {
  const d = dist ?? interiorDistances({ grid, owner });
  let best = -1, bestD = -1;
  for (let i = 0; i < grid.n; i++) if (owner[i] === value && d[i] > bestD) { bestD = d[i]; best = i; }
  if (best < 0) return null;
  const x = best % grid.w, y = (best / grid.w) | 0;
  return [q((x + 0.5) * grid.cellKm), q((y + 0.5) * grid.cellKm)];
}

/** One arc topology over an owner field -> one simplified, quantised, vertex-
 *  capped ring per owner value. Shared arcs are traced once, so two adjacent
 *  oceans get bit-identical boundary vertices and cannot sliver. */
export function ringsFromOwner({ grid, owner, count, cap, problems = [], what = "rings" }) {
  const { arcs } = extractArcs({ owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const ownerIds = [];
  for (let k = 0; k < count; k++) ownerIds.push([`owner ${k}`, k]);
  const fit = fitArcTopology({ arcs, ownerIds, ringCap: cap, problems, what });
  const out = new Map();
  for (let k = 0; k < count; k++) {
    const r = fit.assembled.get(`owner ${k}`);
    if (!r || r.rings.length === 0) continue;
    out.set(k, { rings: r.rings.map(quantiseRing), holes: r.holes.map(quantiseRing), areaKm2: r.areaKm2 });
  }
  return out;
}

/**
 * Everything the trunk needs, from one water partition and two arc topologies.
 *
 *   `continents` / `oceans`  — ONE shared topology, so a coast arc is traced
 *                              once and the sixteen polygons are provably
 *                              disjoint (measured pairwise overlap: 0.000).
 *   `seas`                   — a second topology over the sea sub-owners,
 *                              carved at a margin inside their ocean.
 *
 * THE TRUNK RING IS NOT THE COASTLINE, AND PLAN E MUST NOT INK IT AS ONE.
 * G-VERTEX-BUDGET's effective cap is 160 points per placement, and an ocean
 * that wraps most of the world spends nearly all of it on itself — so the
 * shortage lands on the coast arcs it shares with the continents. Measured on
 * this world (see the module header for the full figures): 22 of 70 arcs
 * tightened over 89 rounds, and n-reedstrand's placement is SIXTEEN vertices.
 *
 * The detail is not lost, it is in a different file. Each continent's
 * `content/world/fabric/continent-NN.json` carries `outerRing`, the same coast
 * at the one-shot 0.35 km epsilon: 2,413 vertices over the thirteen, of which
 * c06 Reedstrand has 144 against its placement's 16. `outerRing` is what a
 * SHEET should draw; `placement.points` is what the gate walks for containment
 * and area, and G-TRUNK-AREA's +/-3% is what pins the two together.
 *
 * The consequence to carry forward, measured rather than feared: a continent's
 * coarse placement does not cover all of its own fabric. c06 leaves 53.04 km2
 * of its regions (1.66%) outside its placement ring. No gate sees that — every
 * trunk gate here is an AREA gate and the areas hold — so Plan D's pinReceipts
 * containment and Plan E's redraw must both read `outerRing`, not the trunk.
 *
 * The one lever is `content/spine/load-budget.json`'s `maxRingPoints`, which
 * `trunkRingCap` already reads. Plan C may not pull it: acceptance criterion 9
 * requires `git diff plan-c-base -- content/spine` to be empty on every commit.
 */
export function buildTrunkRings({ grid, premises, manifest, ringCap, problems = [] }) {
  const water = buildWaterPartition({ grid, premises, manifest, problems });
  const ownerIds = [
    ...premises.map((p, k) => [p.id, k]),
    ...manifest.oceans.map((o, j) => [o.id, OCEAN_OWNER_BASE + j]),
  ];
  const { arcs } = extractArcs({ owner: water.owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const fit = fitArcTopology({ arcs, ownerIds, ringCap, problems, what: "trunk rings" });
  const worldDist = interiorDistances({ grid, owner: water.owner });
  const rings = new Map();
  for (const [label, value] of ownerIds) {
    const r = fit.assembled.get(label);
    if (!r || r.rings.length === 0) { problems.push(`trunk rings: ${label} produced no ring`); continue; }
    // A spine placement is ONE ring with no hole support, so a hole here would
    // be swallowed whole by the emitted polygon.
    //
    // THIS IS A MEASUREMENT, NOT A CONSTRUCTION PROOF — the earlier wording
    // ("impossible here by construction") claimed more than the code shows.
    // The corridor loop runs until the flood fill finds no enclosure, but the
    // flood fill runs on the CELL field while holes are measured on the
    // SIMPLIFIED polygon, and `fitArcTopology` coarsens the corridor slot's
    // own walls AFTER that loop has settled (down to 4-vertex arcs on this
    // world). The corridor genuinely pushes the problem — measured: 0 holes on
    // all 16 trunk owners, on this seed — but the guarantee is empirical, and
    // that is exactly why this branch is a named problem rather than an
    // assertion nobody expects to fire.
    if (r.holes.length)
      problems.push(`trunk rings: ${label} still encloses ${r.holes.length} hole(s) — its polygon ` +
        `would contain them and G-OVERLAP measures that whole area`);
    if (r.rings.length > 1)
      problems.push(`trunk rings: ${label} has ${r.rings.length} disjoint lobes; the largest is the ` +
        `placement and ${(r.rings.slice(1).reduce((s, x) => s + shoelaceArea({ points: x }), 0)).toFixed(2)} km² is outside it`);
    rings.set(label, {
      ring: quantiseRing(r.rings[0]),
      anchor: interiorPointKm({ grid, owner: water.owner, value, dist: worldDist }),
      lobes: r.rings.length,
      holes: r.holes.length,
      areaKm2: shoelaceArea({ points: r.rings[0] }),
    });
  }
  const seaOwner = buildSeaPartition({ grid, manifest, worldOwner: water.owner, problems });
  const seaFit = ringsFromOwner({ grid, owner: seaOwner, count: manifest.seas.length,
    cap: ringCap, problems, what: "sea rings" });
  const seaDist = interiorDistances({ grid, owner: seaOwner });
  const seas = new Map();
  manifest.seas.forEach((s, k) => {
    const r = seaFit.get(k);
    if (!r) { problems.push(`sea rings: ${s.id} produced no ring`); return; }
    seas.set(s.id, {
      ring: r.rings[0],
      anchor: interiorPointKm({ grid, owner: seaOwner, value: k, dist: seaDist }),
      lobes: r.rings.length,
      holes: r.holes.length,
      areaKm2: shoelaceArea({ points: r.rings[0] }),
    });
  });
  return { water, rings, seas, arcCount: arcs.length, rounds: fit.rounds, tightened: fit.tightened };
}

// ── the fabric file ────────────────────────────────────────────────────────
// The committed fabric file for one continent. Every number has already passed
// q(); JSON.stringify + sha256 is the only thing left.
// `pinReceipts` is the measured fabric under each pinned record's seed point,
// SHAPE OWNED BY PLAN D (its placePinned/measureCell produce it), FILE OWNED
// HERE. G-PIN-SAT reads it, so if it is not serialised the gate has nothing to
// check. Empty array in Plan C, where no pinned layer exists yet.
export function buildFabricFile({ premise, generator, seaLevel, cellKm, census, ownerHistogram,
                                  regions, instances, settlements, roads, dungeonAnchors,
                                  outerRing = null, outerHoles = [], trunkRiver = null,
                                  pinReceipts = [] }) {
  return {
    continent: premise.id,
    premise: `content/world/premises/continent-${premise.id.slice(1)}.json`,
    generator, seaLevel: q(seaLevel), cellKm,
    cellCensus: census,
    ownerHistogram,
    // outerRing is the continent's own coast contour at FABRIC resolution —
    // the same topology the trunk polygon is simplified from, which is what
    // G-TRUNK-AREA's +/-3% pins the two together on. trunkRiver is the single
    // highest-flowAccumulation chain. Plan D's resolver reads both to fill the
    // `coastline` and `river` keys that tools/mapforge/lib/basin-sheet.mjs
    // dereferences UNCONDITIONALLY (:181, :157, :249) — emit them as null and
    // drawBasinSheet throws the exact TypeError Plan A Task 5 removed.
    outerRing, outerHoles, trunkRiver,
    regions, instances,
    // PROJECT, do not pass through. placeSettlements carries working keys the
    // schema does not admit — `portEligible` (P11's port restriction) — and
    // fabric-file.schema.json is additionalProperties:false, so a spread would
    // fail validation with an ajv message naming neither the key nor the pass
    // that added it. `pinned` IS serialised (Task 10): the flag that lets
    // gWorldPoi exempt a canon settlement from a REPORTED region's zero rule,
    // and the only working key the schema admits.
    settlements: settlements.map((s) => ({
      id: s.id, title: s.title ?? null, rank: s.rank, atKm: s.atKm, cell: s.cell,
      region: s.region, continent: s.continent, score: s.score,
      // Key present ONLY on a pin — generated rows stay byte-shape-identical
      // to Plan C's, and fabricStringify drops undefined values in any case.
      ...(s.pinned === true ? { pinned: true } : {}),
    })),
    roads, dungeonAnchors, pinReceipts,
  };
}

/**
 * The fabric serialiser. `canonStringify` puts every coordinate PAIR on its own
 * line, which takes continent-02 from 241,698 bytes to 399,381 — past the
 * committed 262,144 B per-file cap, on four of the thirteen. This keeps the
 * top level readable and puts one RECORD per line: a fabric file stays a
 * line-diff between two seeds (spec §7.4's "two seeds sit side by side") at
 * essentially the compact size. Key order is insertion order, exactly as
 * canonStringify's is, so the bytes are as deterministic.
 */
export function fabricStringify(v, indent = 0) {
  const pad = "  ".repeat(indent), padIn = "  ".repeat(indent + 1);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    // a ring, a point list, a cell — one line
    if (v.every((e) => typeof e === "number")) return JSON.stringify(v);
    if (v.every((e) => Array.isArray(e) && e.every((x) => typeof x === "number")))
      return JSON.stringify(v);
    return `[\n${v.map((e) => `${padIn}${JSON.stringify(e)}`).join(",\n")}\n${pad}]`;
  }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined);
  if (keys.length === 0) return "{}";
  return `{\n${keys.map((k) => `${padIn}${JSON.stringify(k)}: ${fabricStringify(v[k], indent + 1)}`).join(",\n")}\n${pad}}`;
}

export function hashOf(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

export const ringArea = (points) => shoelaceArea({ points });
