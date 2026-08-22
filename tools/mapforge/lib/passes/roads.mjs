// tools/mapforge/lib/passes/roads.mjs — P12: roads, sea lanes and trunk rivers.
//
// One minimum spanning tree over the settlements of ONE continent — every
// settlement reachable, no redundant legs — grown by Prim's algorithm on a
// cost raster. Sea lanes connect the capitals across water on the
// complementary raster.
import { FLAG, D8, idx, neighbourIdx } from "../grid.mjs";
import { q } from "../noise.mjs";
// The positional grid.owner -> regions[] join, asserted once and used by both
// passes rather than assumed twice. P11 owns it because P11 is where the
// re-ordered-array defect was reproduced.
import { assertRegionIndex } from "./settlements.mjs";

export const SLOPE_PENALTY = 26;
export const RIVER_CROSSING = 6;
const SQRT2 = 1.4142135623730951;

// A binary heap keyed (cost, cellIndex). THE CELL-INDEX TIEBREAK IS THE WHOLE
// POINT: it is what makes the expansion independent of the order cells are
// pushed, which is the property seam 3 proved for flow routing and seam 4 for
// the region partition. `less` is the only comparison in the module, so a test
// can replace it and prove the output does not depend on this spelling.
export class MinHeap {
  constructor(cap = 0) { this.v = new Float64Array(cap); this.i = new Int32Array(cap); this.size = 0; }
  // RECORDED MUTATION SURVIVOR: deleting the `this.i[a] < this.i[b]` term
  // leaves the suite green, and roads.test.mjs's order-independence test
  // asserts exactly that by running this comparator WITHOUT the term and
  // requiring byte-identical output. The tiebreak is the control, not the
  // rule: it makes the pop order total so the result cannot depend on the
  // push order, which is the property that test measures.
  less(a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] < this.i[b]); }
  grow() {
    const cap = this.v.length ? this.v.length * 2 : 64;
    const v = new Float64Array(cap), i = new Int32Array(cap);
    v.set(this.v); i.set(this.i); this.v = v; this.i = i;
  }
  swap(a, b) {
    const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
    const ti = this.i[a]; this.i[a] = this.i[b]; this.i[b] = ti;
  }
  push(value, index) {
    if (this.size === this.v.length) this.grow();
    this.v[this.size] = value; this.i[this.size] = index;
    let c = this.size++;
    while (c > 0) { const p = (c - 1) >> 1; if (!this.less(c, p)) break; this.swap(c, p); c = p; }
  }
  pop() {
    const value = this.v[0], index = this.i[0];
    this.size--;
    if (this.size) {
      this.v[0] = this.v[this.size]; this.i[0] = this.i[this.size];
      let p = 0;
      for (;;) {
        const l = 2 * p + 1, r = l + 1; let m = p;
        if (l < this.size && this.less(l, m)) m = l;
        if (r < this.size && this.less(r, m)) m = r;
        if (m === p) break;
        this.swap(p, m); p = m;
      }
    }
    return { value, index };
  }
}

export function stepCost({ grid, from, to, diagonal }) {
  const drop = grid.elev[to] - grid.elev[from];
  const slope = drop > 0 ? drop : -drop;
  const river = (grid.flags[to] & FLAG.RIVER) !== 0 ? RIVER_CROSSING : 0;
  return (diagonal ? SQRT2 : 1) * grid.cellKm * (1 + SLOPE_PENALTY * slope) + river;
}

/**
 * ONE multi-source Dijkstra per Prim step, not one per candidate PAIR.
 *
 * The plan (:5456-5471) runs a full Dijkstra for every (in-tree, out-of-tree)
 * pair at every step — O(V^2) searches over the raster. The plan's own Step 17
 * review brief predicts it will not fit the budget, and it does not: at 12
 * settlements on Wealdmarch that is 66 searches over ~44,000 cells for one
 * continent's tree.
 *
 * Seeding the search from EVERY in-tree settlement at once returns exactly the
 * same quantity — the minimum-cost edge between the tree and the rest — in one
 * search per step. `root` carries which tree member each cell was reached
 * from, so the leg is still a settlement-to-settlement path.
 */
function nearestOutsideTree({ grid, cells, cellList, sources, targets, heap, scratch }) {
  // The three fields are allocated ONCE by the caller and refilled over the
  // CONTINENT'S cells only. At 5 MB apiece on the real grid, allocating them
  // per Prim step is ~120 allocations of 5 MB, and clearing all 640,000
  // entries for a continent that owns 44,000 of them is 14x the work.
  const { dist, prev, root } = scratch;
  for (let k = 0; k < cellList.length; k++) {
    const i = cellList[k];
    dist[i] = Infinity; prev[i] = -1; root[i] = -1;
  }
  heap.size = 0;
  for (const s of sources) { dist[s] = 0; root[s] = s; heap.push(0, s); }
  const settled = new Map();
  // STOP AT THE NEAREST TARGET, not the farthest. RECORDED MUTATION SURVIVOR:
  // deleting this early exit leaves every test green, and that is the POINT —
  // it is a performance change and the survivor is the proof it is
  // output-neutral, proved byte-identical against a run-to-completion Dijkstra
  // on the real field (review B). Measured across four runs: 664-796 ms with
  // it, 1,214-1,426 ms without, of a 4,000 ms generate stage budget.
  //
  // The plan's Step 19 states "under 800 ms" and this does NOT assert it. A
  // wall-clock assertion on a shared box is the exact shape of
  // `G-RASTER-BUDGET`, which reds about one run in three under parallel load
  // and is why that rule runs in one venue only. The number is reported, not
  // gated; the margin is thin and Task 10b is where the budget is decided. Dijkstra pops in
  // non-decreasing cost, so once a target pops at cost C no other target can
  // be cheaper; the loop keeps going only while `value === C`, so an exact tie
  // is still seen and the target-id tiebreak in routeRoads is still total.
  // Without it the first Prim step expands the whole continent every time —
  // measured 1,214 ms against 4,000 ms of total generate budget.
  let stopAt = Infinity;
  while (heap.size) {
    const { value, index } = heap.pop();
    if (value > stopAt) break;
    if (value > dist[index]) continue;
    if (targets.has(index) && !settled.has(index)) { settled.set(index, value); stopAt = value; }
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i: index, d });
      if (ni < 0 || !cells[ni]) continue;
      const nd = value + stepCost({ grid, from: index, to: ni, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 });
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = index; root[ni] = root[index]; heap.push(nd, ni); }
    }
  }
  return { dist, prev, root, settled };
}

// Walk `prev` back to the source the search was seeded from. There is NO
// `from` argument: `prev[source] === -1` for every seed, so the walk already
// stops at the right cell, and a `from` that happens to lie ON the path would
// truncate the road at an intermediate settlement instead. (Recorded because
// the shorter form is the one that looks safer.)
function pathBetween({ prev, to }) {
  const path = [];
  for (let i = to; i !== -1; i = prev[i]) path.push(i);
  path.reverse();
  return path;
}

const toKm = ({ grid, i }) => [q(((i % grid.w) + 0.5) * grid.cellKm), q((((i / grid.w) | 0) + 0.5) * grid.cellKm)];
const polylineKm = ({ points }) => {
  let km = 0;
  for (let n = 1; n < points.length; n++) {
    const dx = points[n][0] - points[n - 1][0], dy = points[n][1] - points[n - 1][1];
    km += Math.sqrt(dx * dx + dy * dy);
  }
  return q(km);
};
const pathKm = ({ grid, path }) => {
  let km = 0;
  for (let n = 1; n < path.length; n++) {
    const a = toKm({ grid, i: path[n - 1] }), b = toKm({ grid, i: path[n] });
    const dx = a[0] - b[0], dy = a[1] - b[1];
    km += Math.sqrt(dx * dx + dy * dy);
  }
  return q(km);
};

// The nearest SEA cell to a land cell, by the same D8 walk everything else in
// the pipeline uses. A capital is port-eligible, so it is within
// COAST_NEAR_KM of water — but not necessarily D8-ADJACENT to it, which is why
// the plan's `passable: (j) => sea(j) || j === from || j === to` cannot start:
// a lane whose first step has no water to step onto returns null and the lane
// is silently dropped.
function nearestSeaCell({ grid, from }) {
  const seen = new Uint8Array(grid.n);
  const queue = new Int32Array(grid.n);
  let head = 0, tail = 0;
  seen[from] = 1; queue[tail++] = from;
  while (head < tail) {
    const i = queue[head++];
    if ((grid.flags[i] & FLAG.SEA) !== 0) return i;
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i, d });
      if (ni < 0 || seen[ni]) continue;
      seen[ni] = 1; queue[tail++] = ni;
    }
  }
  return -1;
}

// The single highest-flowAccumulation chain per continent, traced from its
// mouth. ONE river per continent is a DRAWING decision, not a hydrology claim
// — a sheet with thirteen equal rivers reads as noise. `name` is always null:
// a name is meaning, and Plan D mints it.
//
// `grid.owner[i]` is the INDEX into `regions` (the invariant partitionRegions
// establishes when it sets grid.regionIds = byIndex.map(r => r.id)), which is
// how a cell is attributed to a continent without this pass needing premises.
export function traceTrunkRivers({ grid, regions, problems = [] }) {
  const contOf = (i) => (grid.owner[i] < 0 ? null : (regions[grid.owner[i]]?.continent ?? null));
  // 1. The mouth per continent: the RIVER cell with the largest flowAcc whose
  //    D8 target is sea or off-grid. Ties break on CELL INDEX, never on scan
  //    order — the same determinism rule the region partition follows.
  //
  //    THE PLAN TREATS `flowDir < 0` AS "drains" (:5399-5405), so an interior
  //    pit that priority-flood left without an outlet would be elected a
  //    river mouth in the middle of a continent. Measured on the real field
  //    the case does not arise, but "does not arise today" is not a rule: a
  //    sink only counts as a mouth if it actually touches the sea.
  const mouth = new Map();
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.RIVER) === 0) continue;
    const cont = contOf(i);
    if (cont === null) continue;
    const d = grid.flowDir[i];
    let drains;
    if (d >= 0) {
      const ni = neighbourIdx({ grid, i, d });
      drains = ni < 0 || (grid.flags[ni] & FLAG.SEA) !== 0;
    } else {
      drains = false;
      for (let k = 0; k < 8; k++) {
        const ni = neighbourIdx({ grid, i, d: k });
        if (ni < 0 || (grid.flags[ni] & FLAG.SEA) !== 0) { drains = true; break; }
      }
    }
    if (!drains) continue;
    const cur = mouth.get(cont);
    // RECORDED MUTATION SURVIVOR, explained at its call site: the `i < cur`
    // term cannot change the answer while this loop scans i ASCENDING, because
    // first-wins already selects the lowest index among equal accumulations.
    // It is kept because it makes the rule independent of the scan direction,
    // which the neighbouring per-continent walk is not obliged to preserve —
    // the same argument seam 3 recorded for arcs.mjs's candidate sort.
    if (cur === undefined || grid.flowAcc[i] > grid.flowAcc[cur]
        || (grid.flowAcc[i] === grid.flowAcc[cur] && i < cur)) mouth.set(cont, i);
  }
  // 2. Walk upstream, always taking the inflowing RIVER neighbour with the
  //    largest flowAcc (index-tiebroken). A VISITED SET, not a step budget:
  //    the plan bounds the walk by grid.n, which turns a two-cell mutual
  //    inflow into a 640,000-point chain rather than stopping it.
  const out = {};
  for (const cont of [...mouth.keys()].sort()) {
    const chain = [mouth.get(cont)];
    const seen = new Set(chain);
    for (;;) {
      const i = chain[chain.length - 1];
      let best = -1;
      for (let d = 0; d < 8; d++) {
        const ni = neighbourIdx({ grid, i, d });
        // A RIVER STAYS ON ITS OWN LANDMASS, for the reason the road raster
        // does (review B): four pairs of landmasses physically touch on this
        // mask, so an upstream walk across the join emits another continent's
        // coordinates inside this continent's fabric file. Reproduced by review
        // B on a two-plate fixture: 24 of cA's river points on cB's ground.
        // Clean on today's real field, which is exactly why it needs a rule.
        if (ni >= 0 && contOf(ni) !== cont) continue;
        // RECORDED MUTATION SURVIVOR, explained here so it is not re-filed:
        // deleting `seen` leaves the suite green, and NO GENERATED FIELD can
        // change that. `flowDir` is a function — one outflow per cell — so the
        // inflow relation followed here is its inverse, a tree; a flowDir
        // cycle is a component with no outlet and therefore has no mouth to
        // start a walk from. It is NOT unkillable in the absolute — the first
        // draft of this comment said "cannot be killed by any fixture" and then
        // conceded two lines later that a test may set flowDir arbitrarily,
        // which is a contradiction (review J). A hand-built mouth whose own
        // inflow is itself WOULD kill it. That is precisely the case the guard
        // is here to bound, and the plan's `guard < grid.n` bound instead turns
        // it into a 640,000-point chain, which is why it is not what is here.
        if (ni < 0 || seen.has(ni)) continue;
        if ((grid.flags[ni] & FLAG.RIVER) === 0) continue;
        const nd = grid.flowDir[ni];
        if (nd < 0) continue;
        if (neighbourIdx({ grid, i: ni, d: nd }) !== i) continue;   // not an inflow
        if (best === -1 || grid.flowAcc[ni] > grid.flowAcc[best]
            || (grid.flowAcc[ni] === grid.flowAcc[best] && ni < best)) best = ni;
      }
      if (best === -1) break;
      chain.push(best);
      seen.add(best);
    }
    chain.reverse();                                     // source -> mouth
    // A ONE-CELL CHAIN IS NOT A POLYLINE. c08 and c11 each hold a single RIVER
    // cell whose mouth has no inflow; emitting it as a `trunkRivers` entry
    // hands Plan E a "river" with one point to draw. Omitted and NAMED — the
    // interface already types the value as possibly undefined.
    if (chain.length < 2) {
      problems.push(`roads: ${cont}'s highest-accumulation river is a single cell at ` +
        `[${toKm({ grid, i: chain[0] })}] — no trunk river emitted`);
      continue;
    }
    out[cont] = { points: chain.map((i) => toKm({ grid, i })), name: null };
  }
  return out;
}

export function routeRoads({ grid, settlements, regions, less = null }) {
  assertRegionIndex({ grid, regions, who: "roads" });
  const roads = [], seaLanes = [], problems = [];
  const byCont = new Map();
  for (const s of settlements) {
    if (!byCont.has(s.continent)) byCont.set(s.continent, []);
    byCont.get(s.continent).push(s);
  }
  const heap = new MinHeap(1024);
  if (less) heap.less = less;
  const scratch = { dist: new Float64Array(grid.n), prev: new Int32Array(grid.n),
                    root: new Int32Array(grid.n) };

  for (const cont of [...byCont.keys()].sort()) {
    const list = byCont.get(cont).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (list.length < 2) continue;
    // THE ROAD RASTER IS THIS CONTINENT'S OWNED LAND, not "anything that is not
    // sea". Four pairs of landmasses physically touch on the refitted mask
    // (c01-c12, c02-c07, c03-c11, c05-c08 — partition.test.mjs pins the cell
    // counts), so a not-sea raster lets a Wealdmarch road run across Driftholt
    // and land points belonging to another continent in this continent's fabric
    // file. Owned land also excludes lakes for free: a lake cell is unowned.
    const cells = new Uint8Array(grid.n);
    const owned = [];
    for (let i = 0; i < grid.n; i++) {
      const o = grid.owner[i];
      if (o >= 0 && regions[o]?.continent === cont) { cells[i] = 1; owned.push(i); }
    }
    const cellList = Int32Array.from(owned);
    const cellOf = new Map(list.map((s) => [idx({ grid, cx: s.cell[0], cy: s.cell[1] }), s]));
    const inTree = new Set([list[0].id]);
    let n = 0;
    while (inTree.size < list.length) {
      const sources = list.filter((s) => inTree.has(s.id)).map((s) => idx({ grid, cx: s.cell[0], cy: s.cell[1] }));
      const targets = new Set(list.filter((s) => !inTree.has(s.id))
        .map((s) => idx({ grid, cx: s.cell[0], cy: s.cell[1] })));
      const { prev, root, settled } = nearestOutsideTree({
        grid, cells, cellList, sources, targets, heap, scratch });
      // Prim's edge: cheapest reachable target, ties broken on the TARGET ID so
      // the tree is a function of the data and not of the heap's pop order.
      let best = null;
      for (const [cell, cost] of settled) {
        const to = cellOf.get(cell);
        if (best === null || cost < best.cost || (cost === best.cost && to.id < best.to.id))
          best = { cost, to, cell };
      }
      if (best === null) {
        for (const s of list) if (!inTree.has(s.id))
          problems.push(`roads: ${s.id} is not reachable overland from ${cont}'s road network`);
        break;   // an island settlement: sea lane, not road
      }
      const path = pathBetween({ prev, to: best.cell });
      const fromSettlement = cellOf.get(path[0]);
      // RECORDED MUTATION SURVIVOR: no fixture reaches this throw, and none can.
      // Every search source is a settlement cell with `prev === -1`, so the walk
      // back from any settled cell ends on one. It is here because the previous
      // form passed a `from` to pathBetween, and a `from` that happened to lie
      // ON the path truncated the road at an intermediate settlement — the
      // check is what makes removing that parameter safe rather than lucky.
      if (!fromSettlement || path[0] !== root[best.cell])
        throw new Error(`roads: ${cont} leg to ${best.to.id} traces back to cell ${path[0]}, ` +
          `which is not the in-tree settlement the search reached it from (${root[best.cell]})`);
      inTree.add(best.to.id);
      roads.push({ id: `${cont}/rd${String(++n).padStart(2, "0")}`, continent: cont,
                   from: fromSettlement.id, to: best.to.id,
                   km: pathKm({ grid, path }), points: path.map((i) => toKm({ grid, i })) });
    }
  }

  // SEA LANES: the capitals, in id order, chained. A pair on the SAME landmass
  // is skipped — the road network already joins them, and a lane between two
  // ports of one coast is a boat trip nobody takes.
  //
  // The lane is routed between the two capitals' NEAREST SEA CELLS and the
  // capital's own point is prepended and appended. The plan whitelists the two
  // LAND endpoints into `passable` instead, which only works if a capital is
  // D8-adjacent to water; port eligibility is a 2 km band, so it need not be.
  const capitals = settlements.filter((s) => s.rank === "capital")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seaCells = new Uint8Array(grid.n);
  const water = [];
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.SEA) !== 0) { seaCells[i] = 1; water.push(i); }
  const seaList = Int32Array.from(water);
  let laneNo = 0;
  for (let k = 1; k < capitals.length; k++) {
    const a = capitals[k - 1], b = capitals[k];
    if (a.continent === b.continent) continue;
    const fromLand = idx({ grid, cx: a.cell[0], cy: a.cell[1] });
    const toLand = idx({ grid, cx: b.cell[0], cy: b.cell[1] });
    const from = nearestSeaCell({ grid, from: fromLand });
    const to = nearestSeaCell({ grid, from: toLand });
    if (from < 0 || to < 0) { problems.push(`roads: no water beside ${a.id} or ${b.id}`); continue; }
    const { prev, settled } = nearestOutsideTree({
      grid, cells: seaCells, cellList: seaList, sources: [from], targets: new Set([to]),
      heap, scratch });
    if (!settled.has(to)) { problems.push(`roads: no sea route from ${a.id} to ${b.id}`); continue; }
    const path = pathBetween({ prev, to });
    const points = [[a.atKm[0], a.atKm[1]], ...path.map((i) => toKm({ grid, i })), [b.atKm[0], b.atKm[1]]];
    // `km` MEASURES THE POINTS IT EMITS, including the two short land legs from
    // each capital to its water. Measuring only the water path understates the
    // lane by the two legs (review B: 445.31 against 446.51), and a length that
    // is not the length of the drawn line is the kind of number a later reader
    // trusts.
    seaLanes.push({ id: `lane-${String(++laneNo).padStart(2, "0")}`, from: a.id, to: b.id,
                    km: polylineKm({ points }), points });
  }
  return { roads, seaLanes, trunkRivers: traceTrunkRivers({ grid, regions, problems }), problems };
}
