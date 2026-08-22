// tools/mapforge/lib/passes/water.mjs — P7: lakes, deltas, glaciers, rivers.
//
// THIS is the pass that turns the GROSS land of P3 into the NET land the
// manifest budgets (65,600 gross - 1,600 interior water = 64,000 net). Each
// landmass declares its own interior-water share in content/world/manifest.json
// and the pass carves exactly that many cells, so the total lands on the budget
// BY CONSTRUCTION rather than by a global threshold that would put every lake
// on one continent.
//
// On the committed-byte path and scanned by both determinism scans: no
// transcendental, no `**`, no clock, no random.
import { idx, FLAG, D8 } from "../grid.mjs";

const RIVER_ACC_MIN = 220;      // cells drained before a channel reads as a river
const GLACIER_TEMP_MAX = 0.12;  // below this normalised temperature, ice
const DELTA_ACC_MIN = 900;      // a river this large builds a delta at its mouth
// A lake is not a bay. Interior water must stand at least this far from the
// sea-level contour, or the carve degenerates into raising sea level locally:
// measured, without it c04's and c06's water bodies came back with 274 and 316
// D8 adjacencies to open sea, which is a coastline redrawn under a lake's name.
//
// Expressed in km AND in cells, because the two say different things on a
// coarse grid and both are meant. 1.5 km is the world-model statement; two cell
// widths is the topological one — at cellKm 2 a 1.5 km margin admits the very
// first ring inside the shore, which is D8-adjacent to open sea and reads as a
// bay however far 1.5 km sounds.
const LAKE_SHORE_MARGIN_KM = 1.5;
const LAKE_SHORE_MARGIN_CELLS = 2;
const lakeShoreMarginKm = ({ grid }) => {
  const cells = LAKE_SHORE_MARGIN_CELLS * grid.cellKm;
  return cells > LAKE_SHORE_MARGIN_KM ? cells : LAKE_SHORE_MARGIN_KM;
};

// ── the min-heap ───────────────────────────────────────────────────────────
// Keyed (value, index), the same discipline hydrology.mjs's priority flood
// uses and for the same reason: the index tiebreak is what makes the result
// independent of insertion order. Kept here rather than imported because
// hydrology.mjs is deliberately a pure numeric library over raw arrays and
// exports only its three functions.
class MinHeap {
  constructor() { this.v = []; this.i = []; }
  get size() { return this.v.length; }
  less(a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] < this.i[b]); }
  swap(a, b) {
    const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
    const ti = this.i[a]; this.i[a] = this.i[b]; this.i[b] = ti;
  }
  push(value, index) {
    this.v.push(value); this.i.push(index);
    let c = this.v.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (!this.less(c, p)) break; this.swap(c, p); c = p; }
  }
  pop() {
    const value = this.v[0], index = this.i[0];
    const lv = this.v.pop(), li = this.i.pop();
    if (this.v.length) {
      this.v[0] = lv; this.i[0] = li;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1, r = l + 1;
        let m = p;
        if (l < this.v.length && this.less(l, m)) m = l;
        if (r < this.v.length && this.less(r, m)) m = r;
        if (m === p) break;
        this.swap(p, m); p = m;
      }
    }
    return { value, index };
  }
}

// Multi-source BFS over the D8 neighbourhood. Every edge costs one cell, so BFS
// order IS distance order and no heap is needed. Used twice: once from the sea
// (how far inland a cell is) and once from fresh water (freshKm).
function bfsDistanceKm({ grid, isSource }) {
  const dist = new Float32Array(grid.n).fill(-1);
  const q = new Int32Array(grid.n);
  let head = 0, tail = 0;
  for (let i = 0; i < grid.n; i++) if (isSource(i)) { dist[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++];
    const x = i % grid.w, y = (i / grid.w) | 0;
    const d = dist[i] + grid.cellKm;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      // Bounds first, index second — never `i + 1`, which at the east edge is
      // the next row's first cell and a silently wrapped world (grid.mjs).
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const j = ny * grid.w + nx;
      if (dist[j] !== -1) continue;
      dist[j] = d;
      q[tail++] = j;
    }
  }
  return dist;
}

export function carveWater({ grid, premises, manifest }) {
  const cellArea = grid.cellKm * grid.cellKm;
  let lakeCells = 0, deltaCells = 0, glacierCells = 0, riverCells = 0;
  const shortfalls = [];

  // flowAcc is the CALLER's to fill (P6 runs before P7). Without it every
  // `flowAcc[i] >= RIVER_ACC_MIN` is false, so the world comes out with no
  // river, no delta and freshKm measured from lakes alone — a complete,
  // plausible, entirely wrong hydrology with every per-cell assertion still
  // green. A generator throws where a gate would report (sea-level.mjs says
  // the same at more length).
  let accMax = 0;
  for (let i = 0; i < grid.n; i++) if (grid.flowAcc[i] > accMax) accMax = grid.flowAcc[i];
  if (!(accMax > 0))
    throw new Error(
      "water: grid.flowAcc is empty. P7 reads the accumulation P6 computes; run " +
      "flowAccumulate first and write it to grid.flowAcc, or every river, delta and " +
      "fresh-water distance in the world silently comes out unset.");

  // Idempotent: a second call at a different budget answers the new one rather
  // than OR-ing onto the old. Same discipline as classifySea and assignSubstrate.
  const CARVED = FLAG.LAKE | FLAG.RIVER | FLAG.DELTA | FLAG.GLACIER;
  for (let i = 0; i < grid.n; i++) grid.flags[i] &= ~CARVED;

  const inlandKm = bfsDistanceKm({ grid, isSource: (i) => (grid.flags[i] & FLAG.SEA) !== 0 });
  const shoreMargin = lakeShoreMarginKm({ grid });

  // ── lakes: per premise, a basin grown from its own low point ─────────────
  //
  // PLAN CORRECTION, and the largest of this seam. The plan ranks a premise's
  // cells by `filled - elev` (how much priority-flood had to raise them) and
  // takes the deepest `budgetCells`. MEASURED on the real 800 x 800 field:
  // the WHOLE WORLD holds 603 land cells with any depression at all — c02 267,
  // c04 6, c06 0 — against the 6,400 cells (1,600 km2) the manifest budgets.
  // The plan's rule carves 68 km2 of the 1,600 and the net ratio never leaves
  // 1.439. Continents made of smooth fbm under a tapering mask have almost no
  // endorheic basins, which is realistic and is exactly why the interior water
  // has to be PLACED rather than discovered — the same argument mask.mjs's
  // header makes about the thirteen continents themselves.
  //
  // Two more things were measured before this shape was chosen, because both
  // simpler rules produce a world nobody wants:
  //
  //  * ranking a premise's cells by ELEVATION puts the water on the coastal
  //    fringe. The mask taper makes the rim the lowest ground on every
  //    continent by construction (c02's lowest 4,400 cells span 7.5-159 km by
  //    96-201.5 km — the whole landmass, as a ring), and c02's inland-sea lobe
  //    is not low ground at all: it sits at 0.13-0.21 while the shore is at
  //    0.044;
  //  * growing a basin from the structure's centre WITHOUT the disc bound leaks
  //    down the taper to that same rim the moment the frontier reaches it.
  //
  // So: the premise says WHERE (its declared structure disc — c02's inland-sea,
  // c04's plateau, c06's delta-fan), the manifest says HOW MUCH, and the relief
  // decides the shape. The seed is the LOWEST admissible cell in the disc, not
  // its centre — seeding at the centre put c04's water on the plateau summit
  // (elevation 0.049-0.582 across one body); from the low point it is
  // 0.049-0.066. Growth admits the lowest frontier cell each step, keyed
  // (terrain elevation, cell index), so the body is connected, order-independent
  // and exactly `budgetCells` in size. This is STATE's own instruction for c02
  // — "carve interior water to the BUDGET, not to the DISC" — generalised to
  // all three landmasses that have a share.
  //
  // THE KEY IS `elev`, AND `filled` IS NOT A PARAMETER OF THIS PASS ANY MORE.
  // The plan hands carveWater the priority-flooded surface, and the first draft
  // here grew the basin on it. That is backwards, and a fixture shows it in one
  // line: a 3 x 3 pit at 0.1 inside a 0.5 plain has `filled` 0.5000051, ABOVE
  // the plain it sits in — priority-flood's whole job is to erase depressions,
  // and a depression is exactly where a lake goes. Growing on `filled` put the
  // water on the flat rim and left the pit dry. Growing on `elev` is the
  // ordinary statement that a rising water surface covers ground in order of
  // terrain height.
  //
  // priorityFlood stays load-bearing in the pipeline regardless: P6 routes D8
  // flow over the FILLED field, and flowAccumulate throws on the cycles an
  // unfilled field would leave. It is this pass that has no use for it, and an
  // argument nothing reads is what seam 2 deleted P2b's noise gate over.
  for (let k = 0; k < premises.length; k++) {
    const share = interiorWaterFor({ manifest, id: premises[k].id });
    if (!share) continue;
    const budgetCells = Math.round(share / cellArea);
    const disc = lakeDisc({ premise: premises[k] });
    const admits = (i) => {
      if (grid.plate[i] !== k) return false;
      // RECORDED MUTATION SURVIVOR, subsumed rather than redundant: a sea cell
      // is its own BFS source, so `inlandKm` is 0 there and the margin below
      // already rejects it for every margin above zero. This is the cheap
      // early-out and the statement that a lake is not the sea; deleting it
      // changes nothing today and everything if the margin ever goes to 0.
      if ((grid.flags[i] & FLAG.SEA) !== 0) return false;
      if (inlandKm[i] < shoreMargin) return false;
      const x = i % grid.w, y = (i / grid.w) | 0;
      const ddx = (x + 0.5) * grid.cellKm - disc.atKm[0];
      const ddy = (y + 0.5) * grid.cellKm - disc.atKm[1];
      return ddx * ddx + ddy * ddy <= disc.radiusKm * disc.radiusKm;
    };
    // The seed: the lowest admissible cell, tie broken by index. One sweep,
    // never a sort — `<` and not `<=`, so the lowest index wins a tie. Seeding
    // at the disc CENTRE instead put c04's water on its plateau summit
    // (elevation 0.049-0.582 across one body); from the low point it is
    // 0.049-0.066.
    let seed = -1, seedLevel = 0;
    for (let i = 0; i < grid.n; i++) {
      if (!admits(i)) continue;
      if (seed < 0 || grid.elev[i] < seedLevel) { seed = i; seedLevel = grid.elev[i]; }
    }
    if (seed < 0) { shortfalls.push(`${premises[k].id}: no admissible cell in its lake disc`); continue; }

    const queued = new Uint8Array(grid.n);
    const heap = new MinHeap();
    heap.push(grid.elev[seed], seed);
    queued[seed] = 1;
    let carved = 0;
    while (heap.size && carved < budgetCells) {
      const { index: i } = heap.pop();
      if (!admits(i)) continue;
      grid.flags[i] |= FLAG.LAKE;
      carved++; lakeCells++;
      const x = i % grid.w, y = (i / grid.w) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const j = ny * grid.w + nx;
        if (queued[j]) continue;
        queued[j] = 1;
        heap.push(grid.elev[j], j);
      }
    }
    // TERMINATION, which the review brief asks about explicitly: the loop is
    // bounded twice over. Every cell enters the heap at most once (`queued`),
    // so the heap drains in at most n pops whatever the relief does; and the
    // carve stops at `budgetCells` whatever the heap still holds. A premise
    // whose disc cannot absorb its share therefore ENDS and REPORTS, and does
    // not spin.
    if (carved < budgetCells)
      shortfalls.push(`${premises[k].id}: carved ${carved} of ${budgetCells} cells ` +
        `(${carved * cellArea} of ${share} km2) — its lake disc ran out of admissible ground`);
  }

  // ── rivers, deltas, glaciers ─────────────────────────────────────────────
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = idx({ grid, cx, cy });
      // SEA is never re-flagged and never counted: a cell that is already ocean
      // cannot also be interior water, or the 1,600 km2 budget double-counts
      // the coastline it stands on.
      if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
      if (grid.flowAcc[i] >= RIVER_ACC_MIN) { grid.flags[i] |= FLAG.RIVER; riverCells++; }
      if (grid.temp[i] <= GLACIER_TEMP_MAX) { grid.flags[i] |= FLAG.GLACIER; glacierCells++; }
      if (grid.flowAcc[i] >= DELTA_ACC_MIN) {
        // a delta is a river cell with a sea neighbour
        for (const [dx, dy] of D8) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
          if ((grid.flags[ny * grid.w + nx] & FLAG.SEA) !== 0) {
            grid.flags[i] |= FLAG.DELTA; deltaCells++; break;
          }
        }
      }
    }
  }

  // freshKm: km to the nearest fresh water (RIVER, LAKE or DELTA cell). The
  // settlement score's hard veto is freshWater(c) < 0.20 and Plan D's pinned
  // records declare `freshWaterWithinKm`; both read this field, and a
  // Millcross-shaped town whose plan is 4 of 7 roads river-derived cannot be
  // checked without it.
  {
    const FRESH = FLAG.RIVER | FLAG.LAKE | FLAG.DELTA;
    const fresh = bfsDistanceKm({ grid, isSource: (i) => (grid.flags[i] & FRESH) !== 0 });
    grid.freshKm.set(fresh);
  }

  return { lakeCells, deltaCells, glacierCells, riverCells, shortfalls };
}

// The disc interior water is allowed to stand in: the premise's own declared
// feature. `inland-sea` and `atoll-lagoon` are the two kinds that ARE water, so
// they win; otherwise the premise's first disc-shaped structure is the feature
// the landmass is about (c04's karst plateau, c06's delta fan) and its hollows
// are where the water goes. A premise with no disc at all falls back to its
// footprint — the smaller radius, so the disc stays inside the ellipse.
function lakeDisc({ premise }) {
  const discs = (premise.structures ?? []).filter((s) => s.atKm && s.radiusKm);
  const chosen = discs.find((s) => s.kind === "inland-sea")
    ?? discs.find((s) => s.kind === "atoll-lagoon")
    ?? discs[0];
  if (chosen) return { atKm: chosen.atKm, radiusKm: chosen.radiusKm };
  const [rx, ry] = premise.footprint.radiiKm;
  return { atKm: premise.footprint.centreKm, radiusKm: rx < ry ? rx : ry };
}

// The per-landmass share. `manifest.landmasses[].interiorWaterKm2` is the
// authority — NOT `manifest.budget.interiorWaterKm2`, which is the frame total
// the thirteen shares sum to. The plan's own Task 6b fixtures pass a manifest
// carrying only the budget total and then assert a lake was carved, which no
// implementation reading the per-landmass column can satisfy; the fixtures
// were corrected, not the column.
function interiorWaterFor({ manifest, id }) {
  const l = (manifest.landmasses ?? []).find((m) => m.id === id);
  return l ? l.interiorWaterKm2 : 0;
}
