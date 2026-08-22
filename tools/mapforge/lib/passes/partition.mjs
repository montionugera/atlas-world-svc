// tools/mapforge/lib/passes/partition.mjs — P9: region partition.
//
// Plain Lloyd relaxation produces equal-ISH areas under uniform density and
// cannot hit two quotas (40 surveyed at 160 km2, 120 reported at 480 km2). The
// method is a BUDGETED multi-source Dijkstra — a capacity-constrained Voronoi,
// integral and deterministic — with ONE global binary heap (spec §7.3, P9).
//
// THE KEY IS (cost, cellIndex, ownerIndex) AND THE THIRD TERM IS NOT OPTIONAL.
// The plan's key is (cost, cellIndex), which is a total order only because the
// plan carries the owner OUTSIDE the heap, in a `pending[]` array written by
// the first owner to touch a cell. That array is where the plan's version goes
// wrong: once an owner reaches its quota, every cell still pending to it is
// skipped for ever and falls to the residual pass, even when a neighbouring
// region has budget left and is closer than the residual rule's "lowest id".
// Carrying the owner IN the entry fixes that, and the moment two owners can
// hold an entry for the same cell at the same cost, (cost, cellIndex) is no
// longer total — two equal keys, and which pops first is heap-internal, i.e.
// exactly the insertion-order dependence the tiebreak exists to remove. So the
// owner is the third term. tests/partition.test.mjs proves order-independence
// the way seam 3 proved it for flow routing: three comparator variants x three
// insertion orders, one digest.
//
// REGIONS TILE NET LAND, NOT GROSS. A LAKE cell is interior water: the
// manifest's own arithmetic is 40 x 160 + 120 x 480 = 64,000 = budget
// .netLandKm2, while gross land is 65,600, and the fabric record's cellCensus
// is `{ land, lake, unowned }` — three terms, with lake beside land rather
// than inside it. Owning lakes would inflate every region by 2.5% and make the
// region-area tolerance a statement about a different quantity.
import { FLAG, D8, idx, neighbourIdx, cellAreaKm2 } from "../grid.mjs";
import { hashNoise2D, q } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";
import { TERRAIN_FOR_BIOMES } from "./biome.mjs";

export const POISSON_R_KM = Object.freeze({ surveyed: 11, reported: 19 });

// The plan's number is 4; TWO is what the measurement supports, and the
// criterion is region AREA rather than taste. Measured on the real 800 x 800
// field (`smoothingPasses` is a parameter so tests/partition.test.mjs re-runs
// this sweep rather than trusting the comment), counting regions outside their
// own manifest tolerance — surveyed [120, 200] km2, reported [384, 576]:
//
//   passes 0: 853 ms   surveyed 0 out, reported 7 out, span [289.0, 608.5]
//   passes 1: 814 ms   surveyed 0 out, reported 1 out, span [348.0, 555.0]
//   passes 2: 873 ms   surveyed 0 out, reported 0 out, span [419.75, 504.0]
//   passes 3: 1035 ms  surveyed 1 out, reported 2 out, span [279.5, 587.5]
//
// Two is not merely the cheapest adequate value, it is the BEST in the sweep:
// a third pass moves sites far enough that new regions get boxed in, and the
// spread widens again. Compactness (mean isoperimetric ratio over all 160)
// barely moves across the whole sweep — 0.379 / 0.391 / 0.391 / 0.399 — so it
// is not the quantity to tune on.
export const SMOOTHING_PASSES = 2;

const SQRT2 = 1.4142135623730951;
const SLOPE_COST = 12;      // traversal cost per unit of elevation change

// The (cost, cell, owner) min-heap, in typed arrays. Kept local so this module
// and hydrology.mjs never share mutable state, and typed rather than plain
// because the real field pushes ~2.1 M entries per grow pass.
export class MinHeap {
  constructor(capacity) {
    this.cap = capacity > 1 ? capacity : 1;
    this.v = new Float64Array(this.cap);
    this.c = new Int32Array(this.cap);
    this.o = new Int32Array(this.cap);
    this.size = 0;
  }
  clear() { this.size = 0; }
  // Strict total order on the triple. `less` is the ONLY comparison in the
  // pass; partition.test.mjs mutates it directly to prove the result does not
  // depend on the tiebreaks being present in this order.
  less(a, b) {
    if (this.v[a] !== this.v[b]) return this.v[a] < this.v[b];
    if (this.c[a] !== this.c[b]) return this.c[a] < this.c[b];
    return this.o[a] < this.o[b];
  }
  swap(a, b) {
    const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
    const tc = this.c[a]; this.c[a] = this.c[b]; this.c[b] = tc;
    const to = this.o[a]; this.o[a] = this.o[b]; this.o[b] = to;
  }
  grow() {
    const cap = this.cap * 2;
    const v = new Float64Array(cap); v.set(this.v); this.v = v;
    const c = new Int32Array(cap); c.set(this.c); this.c = c;
    const o = new Int32Array(cap); o.set(this.o); this.o = o;
    this.cap = cap;
  }
  push(value, cell, owner) {
    if (this.size === this.cap) this.grow();
    let k = this.size++;
    this.v[k] = value; this.c[k] = cell; this.o[k] = owner;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!this.less(k, p)) break;
      this.swap(k, p); k = p;
    }
  }
  pop() {
    const value = this.v[0], cell = this.c[0], owner = this.o[0];
    const last = --this.size;
    if (last > 0) {
      this.v[0] = this.v[last]; this.c[0] = this.c[last]; this.o[0] = this.o[last];
      let p = 0;
      for (;;) {
        const l = 2 * p + 1, r = l + 1;
        let m = p;
        if (l < this.size && this.less(l, m)) m = l;
        if (r < this.size && this.less(r, m)) m = r;
        if (m === p) break;
        this.swap(p, m); p = m;
      }
    }
    return { value, cell, owner };
  }
}

// A cell belongs to the partition iff it is NET land of this plate: masked,
// above sea level, and not standing water. See the header.
const OWNABLE = FLAG.SEA | FLAG.LAKE;
const ownable = (grid, i, k) => grid.plate[i] === k && (grid.flags[i] & OWNABLE) === 0;

function nearSea({ grid, i }) {
  for (let d = 0; d < 8; d++) {
    const ni = neighbourIdx({ grid, i, d });
    if (ni >= 0 && (grid.flags[ni] & FLAG.SEA) !== 0) return true;
  }
  return false;
}

// Deterministic Poisson-disc: order the candidate cells by a hash (tie broken
// by index), then accept greedily subject to the separation radius. No RNG
// state, so adding a pass never perturbs the siting.
//
// The plan's rejection test is `accepted.includes` inside the scan — O(n x m),
// and the plan's own review brief asks for it to be measured. It is replaced by
// a coarse spatial hash bucketed at the radius, so a candidate compares against
// the accepted sites in its own 3x3 bucket neighbourhood and nothing else.
//
// AND THE RELAXATION IS BOUNDED. The plan relaxes the radius by 20% and retries
// ONCE, recursively, with no depth bound and no floor; on a chain continent
// whose whole land area is smaller than one 19 km disc that either recurses
// until the radius underflows or silently returns fewer sites than the manifest
// demands — and "fewer regions than the manifest says" is a shortfall no test
// in the plan's suite can see, because they all assert the manifest's counts on
// a synthetic square. It relaxes down to one cell edge here, and then takes the
// top `count` by score outright: a region siting is a REQUIREMENT, the radius
// is a preference, and the two are ordered.
export function siteOrder({ grid, cells, stream, scratch = null }) {
  // ONE hashNoise2D per cell per continent. The surveyed pool and the reported
  // pool are both subsets of the same land list and both order by the same
  // score, so scoring inside poissonSites scored most cells twice — and
  // hashNoise2D re-validates its stream with a regex on EVERY call, so those
  // were the pass's most expensive duplicated cycles.
  const score = scratch ?? new Float64Array(grid.n);
  for (let n = 0; n < cells.length; n++) {
    const i = cells[n];
    score[i] = hashNoise2D({ x: (i % grid.w) * 0.37, y: ((i / grid.w) | 0) * 0.37, stream });
  }
  const order = Int32Array.from(cells);
  order.sort((a, b) => (score[a] - score[b]) || (a - b));
  return order;
}

export function poissonSites({ grid, ordered, radiusKm, count }) {
  if (count <= 0) return [];
  let radius = radiusKm;
  for (;;) {
    const accepted = tryRadius({ grid, ordered, radiusKm: radius, count });
    if (accepted.length >= count) return accepted;
    const next = radius * 0.8;
    if (next < grid.cellKm) {
      // The floor. Take the top `count` in the same order, unconstrained: with
      // `ordered.length >= count` this always fills the quota, and the caller
      // has already reported the starvation.
      return Array.from(ordered.slice(0, count));
    }
    radius = next;
  }
}

function tryRadius({ grid, ordered, radiusKm, count }) {
  const r2 = (radiusKm / grid.cellKm) * (radiusKm / grid.cellKm);
  const bucketCells = radiusKm / grid.cellKm;
  const bw = Math.floor(grid.w / bucketCells) + 1;
  const buckets = new Map();
  const accepted = [];
  for (const i of ordered) {
    if (accepted.length >= count) break;
    const cx = i % grid.w, cy = (i / grid.w) | 0;
    const bx = Math.floor(cx / bucketCells), by = Math.floor(cy / bucketCells);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) {
      for (let dx = -1; dx <= 1 && ok; dx++) {
        const near = buckets.get((by + dy) * bw + (bx + dx));
        if (near === undefined) continue;
        for (const j of near) {
          const jx = j % grid.w, jy = (j / grid.w) | 0;
          const ddx = cx - jx, ddy = cy - jy;
          if (ddx * ddx + ddy * ddy < r2) { ok = false; break; }
        }
      }
    }
    if (!ok) continue;
    accepted.push(i);
    const key = by * bw + bx;
    const list = buckets.get(key);
    if (list === undefined) buckets.set(key, [i]); else list.push(i);
  }
  return accepted;
}

// Traversal cost: flat ground is cheap, slope is dear, water is impassable.
function stepCost({ grid, from, to, diagonal }) {
  const d = grid.elev[to] - grid.elev[from];
  const slope = d > 0 ? d : -d;
  return (diagonal ? SQRT2 : 1) * (1 + SLOPE_COST * slope);
}

/**
 * P9. Writes grid.owner and grid.regionIds.
 *
 * `less` is injectable for one reason only: partition.test.mjs proves the
 * result is independent of the comparator's tiebreak terms and of the order
 * the sites are inserted, which is the property the whole (cost, cell, owner)
 * key exists for. Production never passes it.
 */
export function partitionRegions({ grid, premises, manifest, stream, less = null,
                                   smoothingPasses = SMOOTHING_PASSES }) {
  if (!grid.biomeNames || grid.biomeNames.length === 0)
    throw new Error("partition: grid.biomeNames is empty — P8 classifyBiomes must run before P9");
  const cellArea = cellAreaKm2({ grid });
  const regions = [];
  const ownerHistogram = {};
  // A global region index -> region record, so grid.owner stays an Int16Array.
  // grid.regionIds mirrors byIndex as plain ids, which is what grid.regionId(i)
  // reads — Plan D's measureCell needs the region under a pinned point and must
  // not re-derive the owner->id join from a copy that can drift.
  const byIndex = [];
  const starved = [];
  const shortfalls = [];

  // Quotas in CELLS, from the manifest's nominal areas.
  const sQuota = Math.round(manifest.regions.surveyed.nominalKm2 / cellArea);
  const rQuota = Math.round(manifest.regions.reported.nominalKm2 / cellArea);

  // One sweep of the grid for every plate's ownable cells, rather than one
  // sweep per plate: 13 x 640,000 index reads is 8.3 M for a bucketing a
  // single pass does.
  const scoreScratch = new Float64Array(grid.n);
  const landOf = premises.map(() => []);
  for (let i = 0; i < grid.n; i++) {
    const k = grid.plate[i];
    if (k < 0 || k >= premises.length) continue;
    if ((grid.flags[i] & OWNABLE) !== 0) continue;
    landOf[k].push(i);
  }

  for (let k = 0; k < premises.length; k++) {
    const lm = manifest.landmasses.find((m) => m.id === premises[k].id);
    if (!lm) continue;
    const land = landOf[k];
    if (land.length === 0) continue;

    const nSurveyed = lm.surveyed, nReported = lm.reported;
    if (nSurveyed + nReported === 0) continue;

    // Two site families, sited SEPARATELY so their radii differ. Surveyed
    // sites are biased toward coast and river confluence by restricting the
    // pool; the bias is applied by ordering, not by an RNG.
    const order = siteOrder({ grid, cells: land, stream, scratch: scoreScratch });
    const coastal = new Set();
    for (const i of land)
      if ((grid.flags[i] & (FLAG.RIVER | FLAG.DELTA)) !== 0 || nearSea({ grid, i })) coastal.add(i);
    const surveyedPool = order.filter((i) => coastal.has(i));
    const sSites = poissonSites({
      grid, ordered: surveyedPool.length >= nSurveyed ? surveyedPool : order,
      radiusKm: POISSON_R_KM.surveyed, count: nSurveyed,
    });
    const taken = new Set(sSites);
    const rSites = poissonSites({
      grid, ordered: order.filter((i) => !taken.has(i)),
      radiusKm: POISSON_R_KM.reported, count: nReported });
    if (sSites.length < nSurveyed || rSites.length < nReported)
      starved.push({ continent: premises[k].id, surveyed: sSites.length, reported: rSites.length });

    const sites = [
      ...sSites.map((cell) => ({ cell, survey: "surveyed" })),
      ...rSites.map((cell) => ({ cell, survey: "reported" })),
    ];
    // Deterministic id assignment: sort by cell index, number from 1.
    sites.sort((a, b) => a.cell - b.cell);

    // PROVENANCE: the epistemic gradient the frontier hatch is keyed on
    // (spec §6.4 extension 1). A reported region is not just "unwalked" — the
    // register A2-wider-world.md §1 already commits to a THREE-level claim
    // about how the report reached the chart, and the hatch draws it:
    //   sworn    (a master's log)  -> 7 px pitch, full opacity
    //   hearsay  (wharf-talk)      -> 11 px pitch
    //   inferred (the generator's own fill) -> 15 px pitch, 0.3 opacity
    // Assigned deterministically from the region's own site cell, weighted
    // 30/40/30 so the sworn band stays the minority it should be. NULL on
    // every surveyed region: a walked region makes no claim about a report.
    const provStream = mintSeed({ parentStream: stream, name: "provenance" });
    const provenanceFor = (cell) => {
      const t = (hashNoise2D({
        x: (cell % grid.w) * 0.29, y: ((cell / grid.w) | 0) * 0.29, stream: provStream }) + 1) / 2;
      return t < 0.30 ? "sworn" : t < 0.70 ? "hearsay" : "inferred";
    };

    const base = byIndex.length;
    sites.forEach((s, n) => {
      const id = `${premises[k].id}/r${String(n + 1).padStart(2, "0")}`;
      const rec = { id, continent: premises[k].id, survey: s.survey, siteCell: s.cell,
                    cells: 0, areaKm2: 0, terrainKind: null, biomeShares: {}, adjacent: [],
                    provenance: s.survey === "reported" ? provenanceFor(s.cell) : null };
      regions.push(rec);
      byIndex.push(rec);
      ownerHistogram[id] = 0;
    });

    const quota = allocateQuotas({
      total: land.length, sites, sQuota, rQuota,
      note: (m) => starved.push({ continent: premises[k].id, quota: m }) });

    const heap = new MinHeap(land.length * 2);
    if (less) heap.less = less;
    let current = sites;
    let claimed = growRegions({ grid, plate: k, land, sites: current, base, heap, quota });
    for (let pass = 0; pass < smoothingPasses; pass++) {
      current = recentre({ grid, land, sites: current, base });
      claimed = growRegions({ grid, plate: k, land, sites: current, base, heap, quota });
    }
    sites.forEach((s, n) => { byIndex[base + n].siteCell = current[n].cell; });

    // Residual: any net-land cell of this plate still unowned goes to the
    // nearest REPORTED region, by the same cost metric (spec §7.3, P9).
    assignResidual({ grid, plate: k, land, byIndex, base, count: sites.length, heap, claimed });
    // …and then the books are balanced back to the quota. See rebalance().
    const short = rebalance({ grid, plate: k, land, base, count: sites.length, quota, claimed, heap });
    for (const s of short)
      shortfalls.push({ region: byIndex[base + s.n].id, quota: s.quota, cells: s.cells, shortBy: s.shortBy });
  }

  // Census, biome shares, terrainKind, adjacency.
  const census = { land: 0, lake: 0, sea: 0, unowned: 0, offMask: 0 };
  const shares = byIndex.map(() => new Map());
  // Centroid accumulators. `centroidKm` is what P11's assignLevelBands reads to
  // ring a region by distance from the starter capital; without it every region
  // is skipped and all 160 come out unbanded, silently. Accumulated HERE rather
  // than in a second sweep because this loop already visits every owned cell.
  const sumX = new Float64Array(byIndex.length), sumY = new Float64Array(byIndex.length);
  for (let i = 0; i < grid.n; i++) {
    const f = grid.flags[i];
    if ((f & FLAG.SEA) !== 0) { census.sea++; continue; }
    if (grid.plate[i] < 0) { census.offMask++; continue; }
    if ((f & FLAG.LAKE) !== 0) { census.lake++; continue; }
    census.land++;
    const o = grid.owner[i];
    if (o < 0) { census.unowned++; continue; }
    byIndex[o].cells++;
    sumX[o] += (i % grid.w) + 0.5;
    sumY[o] += ((i / grid.w) | 0) + 0.5;
    const m = shares[o];
    m.set(grid.biome[i], (m.get(grid.biome[i]) ?? 0) + 1);
  }
  for (let n = 0; n < byIndex.length; n++) {
    const rec = byIndex[n];
    rec.areaKm2 = rec.cells * cellArea;
    // Quantised through q() like every other committed number: the fabric
    // record carries it and G-* reads it back.
    rec.centroidKm = rec.cells > 0
      ? [q((sumX[n] / rec.cells) * grid.cellKm), q((sumY[n] / rec.cells) * grid.cellKm)]
      : null;
    ownerHistogram[rec.id] = rec.cells;
    const total = rec.cells || 1;
    const sorted = [...shares[n].entries()].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]));
    rec.dominantBiomeIndex = sorted.length ? sorted[0][0] : -1;
    // Keyed by biome NAME, which is what the fabric record's `biomeShares`
    // declares ({"karst": 62, "forest": 38}) — the plan's code keys it by the
    // Uint8Array INDEX, so a committed fabric file would have read {"15": 62}.
    //
    // A share that rounds to 0.0 is DROPPED, not written. Two regions shipped
    // `{"tundra": 100, "river": 0}` — a 0 entry states "this region has none of
    // that biome" about a biome it has one or two cells of, which is the one
    // reading the record must never carry. The shares are percentages to one
    // decimal, so anything under 0.05% is below the record's own resolution and
    // belongs outside it; `dominantBiomeIndex` is taken before this and cannot
    // be affected (the dominant share is at least 1/cells).
    rec.biomeShares = Object.fromEntries(
      sorted.map(([b, c]) => [grid.biomeNames[b], Math.round((c / total) * 1000) / 10])
            .filter(([, pct]) => pct > 0));
  }
  buildAdjacency({ grid, byIndex });
  assignTerrainKinds({ regions, biomeNames: grid.biomeNames });
  // The owner-index -> region-id lookup grid.regionId(i) reads.
  grid.regionIds = byIndex.map((r) => r.id);
  return { regions, ownerHistogram, unownedLandCells: census.unowned, census, starved, shortfalls };
}

/**
 * THE QUOTA ALLOCATOR, and it is the difference between a partition that meets
 * its own tolerance and one that does not.
 *
 * The plan gives every region the manifest's NOMINAL cell count — 640 for a
 * surveyed region, 1,920 for a reported one — and pushes whatever is left over
 * into the residual pass. That is right in aggregate and wrong per continent:
 * `40 x 160 + 120 x 480 = 64,000` is a WORLD identity, and no continent's net
 * land is an exact multiple of its own nominal share. Measured on the real
 * field with the plan's rule: **38 of the 120 reported regions land outside
 * their own [384, 576] km2 tolerance**, spread from 64.5 km2 (a site walled
 * into a pocket) to 743.75 km2 (a region beside a large residual pocket that
 * the nearest-region rule handed to it entire), because "wherever the frontier
 * happened to be" decided the whole residue.
 *
 * So: SURVEYED regions take the manifest's nominal exactly — 160 km2 is the
 * tight quota and there are only 40 of them — and REPORTED regions share what
 * is left of their own continent equally, the remainder going one cell each to
 * the lowest-numbered of them so the split is integral and deterministic. The
 * nominal 480 and its +-20% are untouched; what changes is that the residue is
 * spread instead of dumped. Measured: every one of the 160 regions inside
 * tolerance, reported spread 419.75-503.75 km2 against [384, 576].
 */
export function allocateQuotas({ total, sites, sQuota, rQuota, note = () => {} }) {
  const quota = new Int32Array(sites.length);
  if (sites.length === 0) return quota;
  const idxS = [], idxR = [];
  sites.forEach((s, n) => (s.survey === "surveyed" ? idxS : idxR).push(n));
  if (idxR.length > 0 && total >= idxS.length * sQuota + idxR.length) {
    for (const n of idxS) quota[n] = sQuota;
    const remain = total - idxS.length * sQuota;
    const each = Math.floor(remain / idxR.length);
    let extra = remain - each * idxR.length;
    for (const n of idxR) { quota[n] = each + (extra > 0 ? 1 : 0); if (extra > 0) extra--; }
    return quota;
  }
  // Degenerate: the continent cannot even seat the nominal surveyed quota plus
  // one cell per reported region. Share everything by nominal weight instead,
  // and SAY SO — a continent this small is a manifest/premise disagreement, not
  // something to absorb silently.
  note(`land ${total} cells cannot seat ${idxS.length} surveyed at ${sQuota} + ${idxR.length} reported`);
  const w = sites.map((s) => (s.survey === "surveyed" ? sQuota : rQuota));
  const sum = w.reduce((a, b) => a + b, 0);
  let assigned = 0;
  for (let n = 0; n < sites.length; n++) {
    quota[n] = Math.floor((total * w[n]) / sum);
    assigned += quota[n];
  }
  for (let n = 0; assigned < total; n = (n + 1) % sites.length) { quota[n]++; assigned++; }
  return quota;
}

// The budgeted multi-source Dijkstra. ONE heap keyed (cost, cell, owner).
//
// It runs in ROUNDS. A single pass leaves pockets unowned: a region that hits
// its quota stops expanding, and cells behind it are then reachable only from
// regions whose own frontier never got there. Each further round re-seeds the
// heap from the boundary between an unowned cell and an owned cell whose region
// still has capacity, and runs the same Dijkstra. It terminates because every
// round either claims at least one cell or seeds nothing.
export function growRegions({ grid, plate, land, sites, base, heap, quota }) {
  for (const i of land) if (grid.owner[i] >= base) grid.owner[i] = -1;
  heap.clear();
  const claimed = new Int32Array(sites.length);
  // Lazy decrease-key. Without it every claimed cell pushes all eight of its
  // neighbours and the heap carries ~8 entries per cell; with it a cell holds
  // one entry per DISTINCT owner that has reached it, which is what the
  // frontier actually needs. The owner test is the part that matters: dropping
  // it would suppress the second owner's entry for a contested cell, and if the
  // first owner then fills its quota the cell would be orphaned — the exact
  // failure the (cost, cell, owner) key exists to avoid.
  const best = new Float64Array(grid.n);
  const bestOwner = new Int32Array(grid.n);
  for (const i of land) { best[i] = Infinity; bestOwner[i] = -1; }
  const frontier = { best, bestOwner };
  sites.forEach((s, n) => heap.push(0, s.cell, base + n));
  let unowned = land.length;
  unowned -= drain({ grid, plate, base, heap, claimed, quota, frontier });
  while (unowned > 0) {
    heap.clear();
    let seeded = 0;
    for (const i of land) {
      if (grid.owner[i] >= 0) continue;
      for (let d = 0; d < 8; d++) {
        const ni = neighbourIdx({ grid, i, d });
        if (ni < 0) continue;
        const o = grid.owner[ni];
        if (o < base || o - base >= sites.length) continue;
        if (claimed[o - base] >= quota[o - base]) continue;
        pushIfBetter({ heap, frontier, cost: stepCost({ grid, from: ni, to: i, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }), cell: i, owner: o });
        seeded++;
      }
    }
    if (seeded === 0) break;
    const took = drain({ grid, plate, base, heap, claimed, quota, frontier });
    if (took === 0) break;
    unowned -= took;
  }
  return claimed;
}

function pushIfBetter({ heap, frontier, cost, cell, owner }) {
  if (cost >= frontier.best[cell] && frontier.bestOwner[cell] === owner) return;
  if (cost < frontier.best[cell]) { frontier.best[cell] = cost; frontier.bestOwner[cell] = owner; }
  heap.push(cost, cell, owner);
}

function drain({ grid, plate, base, heap, claimed, quota, frontier }) {
  let took = 0;
  while (heap.size) {
    const { value, cell, owner } = heap.pop();
    if (grid.owner[cell] >= 0) continue;
    const n = owner - base;
    if (claimed[n] >= quota[n]) continue;
    grid.owner[cell] = owner;
    claimed[n]++;
    took++;
    for (let d = 0; d < 8; d++) {
      // RECORDED MUTATION SURVIVOR: replacing `neighbourIdx` with unguarded
      // index arithmetic leaves the suite green. `idx` wraps the east edge onto
      // the west edge one row up, so the guard only bites where land TOUCHES a
      // frame column or row — and measured on the real field there are ZERO
      // net-land cells on any of the four frame edges (zero MASKED cells, even:
      // every one of the thirteen footprints sits clear of the frame). The wrap
      // therefore always lands on sea, which `ownable` rejects on the next line.
      // Unreachable by the world's geometry, not dead: a premise fitted to the
      // frame edge, or a re-tiled grid, makes it live again, and seam 1 made
      // `neighbourIdx` the named accessor for exactly this reason.
      const ni = neighbourIdx({ grid, i: cell, d });
      if (ni < 0) continue;
      if (grid.owner[ni] >= 0) continue;
      if (!ownable(grid, ni, plate)) continue;
      pushIfBetter({ heap, frontier,
        cost: value + stepCost({ grid, from: cell, to: ni, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }),
        cell: ni, owner });
    }
  }
  return took;
}

// Lloyd step: move each site to its region's integer centroid (the nearest
// owned cell to it), leaving quotas untouched.
//
// The plan scans all 640,000 cells per site per pass — 160 x 4 x 640,000 =
// 410 M steps, which is the finding its own review brief predicts. This builds
// one cells-of-region index per pass from the continent's own land list and
// scans each region's cells once.
function recentre({ grid, land, sites, base }) {
  const m = sites.length;
  const count = new Int32Array(m);
  const sx = new Float64Array(m), sy = new Float64Array(m);
  for (const i of land) {
    const k = grid.owner[i] - base;
    if (k < 0 || k >= m) continue;
    count[k]++; sx[k] += i % grid.w; sy[k] += (i / grid.w) | 0;
  }
  const start = new Int32Array(m + 1);
  for (let k = 0; k < m; k++) start[k + 1] = start[k] + count[k];
  const cursor = start.slice(0, m);
  const cellsOf = new Int32Array(start[m]);
  for (const i of land) {
    const k = grid.owner[i] - base;
    if (k < 0 || k >= m) continue;
    cellsOf[cursor[k]++] = i;
  }
  return sites.map((s, k) => {
    if (count[k] === 0) return s;
    const tx = Math.round(sx[k] / count[k]), ty = Math.round(sy[k] / count[k]);
    let best = -1, bestD = Infinity;
    for (let p = start[k]; p < start[k + 1]; p++) {
      const i = cellsOf[p];
      const dx = (i % grid.w) - tx, dy = ((i / grid.w) | 0) - ty;
      const d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && i < best)) { bestD = d; best = i; }
    }
    return best < 0 ? s : { ...s, cell: best };
  });
}

// The residual pass, as a multi-source Dijkstra over the UNOWNED cells only,
// seeded from every boundary between an owned reported region and an unowned
// cell. The plan sweeps the whole grid repeatedly, taking the lowest owner id
// among D8 neighbours until nothing changes — `reported.includes(o)` inside a
// double loop inside a fixpoint — which is both the O(n^2) its review brief
// asks about and a different answer: "lowest id that happens to be adjacent"
// is not "nearest".
function assignResidual({ grid, plate, land, byIndex, base, count, heap, claimed }) {
  const reported = new Uint8Array(count);
  let anyReported = 0;
  for (let n = 0; n < count; n++)
    if (byIndex[base + n].survey === "reported") { reported[n] = 1; anyReported++; }
  // A continent with no reported region at all distributes the residual over
  // every region instead — the plan's rule, kept.
  if (anyReported === 0) reported.fill(1);

  heap.clear();
  for (const i of land) {
    if (grid.owner[i] >= 0) continue;
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i, d });
      if (ni < 0) continue;
      const o = grid.owner[ni];
      if (o < base || o - base >= count || !reported[o - base]) continue;
      heap.push(stepCost({ grid, from: ni, to: i, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }), i, o);
    }
  }
  while (heap.size) {
    const { value, cell, owner } = heap.pop();
    if (grid.owner[cell] >= 0) continue;
    grid.owner[cell] = owner;
    claimed[owner - base]++;
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i: cell, d });
      if (ni < 0 || grid.owner[ni] >= 0) continue;
      if (!ownable(grid, ni, plate)) continue;
      heap.push(value + stepCost({ grid, from: cell, to: ni, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }),
                ni, owner);
    }
  }
  // Anything still unowned — an island of this plate with no land bridge to
  // any site — goes to the LOWEST-id region of this plate, never left unowned.
  for (const i of land) if (grid.owner[i] < 0) { grid.owner[i] = base; claimed[0]++; }
}

// THE BOOKS BALANCE. This is what makes the region-area tolerance a property
// rather than a hope, and it exists because the capped Dijkstra above cannot
// deliver one on its own.
//
// Measured on the real field with the caps alone: most regions reach their
// quota exactly, but a handful of sites are BOXED IN — their neighbours claim
// the ground between them first, their frontier empties, and they stop short
// (c04 had one reported region at 96 cells of 1,881, one surveyed at 360 of
// 640). The cells they did not get are then unowned and reachable only across a
// region that is already full, so the residual pass hands them to whoever is
// adjacent. The result at 2 smoothing passes was 33 of 120 reported regions
// outside their own [384, 576] km2 tolerance, spread 63.5 to 744.5.
//
// Conservation is the lever: quotas sum EXACTLY to the continent's net land, so
// every cell a starved region is short is a cell some other region holds above
// ITS quota. The surplus is rarely NEXT DOOR, though — eroding only from an
// over-quota neighbour repaired 5 of 33 — so the transfer runs along a PATH
// through the region-adjacency graph: breadth-first from the starved region to
// the nearest region with a surplus, then hand the cells down the path one edge
// at a time, from the surplus end so no region on the way ever dips below its
// own quota. Each edge erodes cheapest-first by the same cost metric the growth
// uses, inward from the taker's own boundary, so the taker stays connected.
//
// Returns the regions still short afterwards — a starved region with no surplus
// reachable at all — so a shortfall is REPORTED and never absorbed.
function rebalance({ grid, plate, land, base, count, quota, claimed, heap }) {
  const short = [];
  const adj = regionAdjacency({ grid, land, base, count });
  for (let a = 0; a < count; a++) {
    let need = quota[a] - claimed[a];
    // Bounded: each successful round moves at least one cell and strictly
    // reduces `need`, and a round that moves nothing breaks out.
    for (let guard = 0; need > 0 && guard <= count; guard++) {
      const path = pathToSurplus({ adj, claimed, quota, from: a, count });
      if (path === null) break;
      let flow = Math.min(need, claimed[path[0]] - quota[path[0]]);
      for (let j = 0; j < path.length - 1 && flow > 0; j++) {
        const donor = path[j], taker = path[j + 1];
        const moved = erodeEdge({ grid, land, base, donor, taker, want: flow, heap });
        claimed[donor] -= moved; claimed[taker] += moved;
        flow = moved;
      }
      if (flow === 0) break;
      need = quota[a] - claimed[a];
    }
    if (need > 0) short.push({ n: a, quota: quota[a], cells: claimed[a], shortBy: need });
  }
  return short;
}

// Region adjacency over this plate's cells, as index sets. Ascending order is
// materialised once so the breadth-first walk below cannot depend on Set
// insertion order — which is a function of the cell scan, i.e. of the world.
function regionAdjacency({ grid, land, base, count }) {
  const sets = Array.from({ length: count }, () => new Set());
  for (const i of land) {
    const a = grid.owner[i] - base;
    if (a < 0 || a >= count) continue;
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i, d });
      if (ni < 0) continue;
      const b = grid.owner[ni] - base;
      if (b < 0 || b >= count || b === a) continue;
      sets[a].add(b);
    }
  }
  return sets.map((s) => Int32Array.from([...s]).sort());
}

// Breadth-first from `from` to the nearest region holding a surplus. Returns
// the path SURPLUS-first, so the caller hands the cells down it. Neighbours are
// visited in ascending region index, which makes the choice among equally
// distant surpluses deterministic.
function pathToSurplus({ adj, claimed, quota, from, count }) {
  const prev = new Int32Array(count).fill(-2);
  prev[from] = -1;
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    for (const v of adj[u]) {
      if (prev[v] !== -2) continue;
      prev[v] = u;
      if (claimed[v] > quota[v]) {
        const path = [];
        for (let x = v; x !== -1; x = prev[x]) path.push(x);
        return path;
      }
      queue.push(v);
    }
  }
  return null;
}

// Move up to `want` cells from `donor` to `taker`, cheapest first, eroding
// inward from the boundary they share. Returns how many actually moved — a
// short edge is what limits the whole chain.
function erodeEdge({ grid, land, base, donor, taker, want, heap }) {
  const D = base + donor, T = base + taker;
  heap.clear();
  for (const i of land) {
    if (grid.owner[i] !== D) continue;
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i, d });
      if (ni < 0 || grid.owner[ni] !== T) continue;
      heap.push(stepCost({ grid, from: ni, to: i, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }), i, D);
      break;
    }
  }
  let moved = 0;
  while (heap.size && moved < want) {
    const { value, cell } = heap.pop();
    if (grid.owner[cell] !== D) continue;
    grid.owner[cell] = T;
    moved++;
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i: cell, d });
      if (ni < 0 || grid.owner[ni] !== D) continue;
      heap.push(value + stepCost({ grid, from: cell, to: ni, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }),
                ni, D);
    }
  }
  return moved;
}

// REGION ADJACENCY, on 4-CONNECTIVITY — deliberately a different graph from the
// D8 one `rebalance` walks, and the difference is exactly one pair on the real
// world (`c07/r01 ~ c07/r05`, which touch only at a corner). This graph is a
// COMMITTED fabric field: Plan D binds relations on `regions[].adjacent`, and
// two regions that meet at a single lattice point share no boundary to draw, so
// the drawn map and the declared neighbour list agree only under edge
// adjacency. `rebalance` wants the opposite — the widest set of routes along
// which a cell may be handed on — so it takes D8. Both are right for their
// caller; neither may be quietly swapped for the other.
//
// The edge list is PINNED BY DIGEST in tests/partition.test.mjs. Dropping the
// vertical (South) check here silently loses 6 of the 330 pairs and left the
// whole suite green.
function buildAdjacency({ grid, byIndex }) {
  const sets = byIndex.map(() => new Set());
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = idx({ grid, cx, cy });
      const a = grid.owner[i];
      if (a < 0) continue;
      if (cx + 1 < grid.w) {
        const b = grid.owner[i + 1];
        if (b >= 0 && b !== a) { sets[a].add(b); sets[b].add(a); }
      }
      if (cy + 1 < grid.h) {
        const b = grid.owner[i + grid.w];
        if (b >= 0 && b !== a) { sets[a].add(b); sets[b].add(a); }
      }
    }
  }
  byIndex.forEach((rec, n) => { rec.adjacent = [...sets[n]].map((k) => byIndex[k].id).sort(); });
}

// terrainKind, applied AFTER classifyBiomes so the dominant biome is known.
// Called at the end of partitionRegions so the "reported regions carry no
// terrainKind" rule holds without the caller remembering a second step.
//
// TOTAL over the vocabulary: a dominant biome TERRAIN_FOR_BIOMES does not
// carry is a throw, not a silent "headland". See biome.mjs.
export function assignTerrainKinds({ regions, biomeNames }) {
  for (const r of regions) {
    if (r.survey === "reported") { r.terrainKind = null; continue; }
    const name = r.dominantBiomeIndex >= 0 ? biomeNames[r.dominantBiomeIndex] : "meadow";
    const kind = TERRAIN_FOR_BIOMES[name];
    // RECORDED MUTATION SURVIVOR: replacing this throw with `?? "headland"`
    // leaves the suite green, because partition.test.mjs asserts
    // TERRAIN_FOR_BIOMES is TOTAL over BIOMES — so a dominant biome with no
    // mapping cannot exist, and any fixture that would reach here reds the
    // totality test FIRST. The throw is the second line of defence, and it is
    // the one that matters if the totality test is ever weakened: a silent
    // "headland" is a wrong terrainKind on a committed region, which G-BIOME-INK
    // and Plan E's legend would then both believe.
    if (kind === undefined)
      throw new Error(`partition: no terrainKind for dominant biome "${name}" on ${r.id}`);
    r.terrainKind = kind;
  }
}
