// tools/mapforge/lib/arcs.mjs — P4/P14: planar arc topology.
//
// WHY ARCS AND NOT RINGS: tracing each region's boundary and simplifying it
// independently produces SLIVERS — two neighbours simplify their shared edge
// differently and the boundary splits. Here every boundary segment belongs
// to exactly one arc, each arc is shared by exactly two owners, and each arc
// is simplified ONCE (spec §7.4). Every kept vertex is a grid corner, an
// exact multiple of cellKm, so a shared vertex is BIT-IDENTICAL in both
// neighbours' polygons.
//
// abs() appears nowhere for winding: a negative signed shoelace is a G-POLY
// failure, not a magnitude (scripts/lib/spine.mjs:11-14). The ONE place a
// ring's winding is normalised is assembleRings, and it does it by REVERSING
// the point order on a negative sign — which is a statement about topology
// (that ring is a hole, or was chained the other way round) rather than a
// magnitude taken of an area.
//
// This file is on the committed-byte path: no transcendental, no `**`, no
// clock, no random. Math.sqrt only. tests/determinism-inventory.test.mjs and
// tests/noise-determinism.test.mjs both scan it, derived from the tree.
import { hashNoise2D } from "./noise.mjs";
import { shoelaceArea } from "../../../scripts/lib/spine.mjs";

export const DP_EPSILON_KM = 0.35;

const cornerKey = (cx, cy) => `${cx}:${cy}`;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ── stage 1: unit boundary edges ───────────────────────────────────────────
// One sweep. For each cell, compare with its RIGHT and DOWN neighbour; a
// difference emits the unit edge between them, expressed in CORNER indices.
// Cells outside the field are owner -1 (sea/void), so the frame edge also
// produces arcs where an owner touches it.
//
// ORIENTATION IS A CONTRACT, not a label. Every edge is emitted so that
// `left` is the owner on the +y side of a horizontal edge travelling +x, and
// on the -x side of a vertical edge travelling +y. That single convention is
// what makes assembleRings' head-to-tail chaining close: an owner's arcs, each
// oriented so the owner is on the LEFT, form one consistent cycle. Get it
// wrong on any one edge and that owner's chain simply stops mid-ring.
//
// `at()` bounds-checks rather than indexing raw. extractArcs takes loose typed
// arrays (`{owner, w, h}`), not a Grid, so grid.mjs's `neighbourIdx` is not
// reachable here — but the hazard it exists for is: `owner[y * w + (x + 1)]`
// at x = w-1 reads the first cell of the NEXT row, which is a plausible
// neighbour and a silently wrapped world.
function unitEdges({ owner, w, h }) {
  const edges = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : owner[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = at(x, y);
      const r = at(x + 1, y);
      if (o !== r) edges.push({ a: [x + 1, y], b: [x + 1, y + 1], left: o, right: r });
      const d = at(x, y + 1);
      if (o !== d) edges.push({ a: [x, y + 1], b: [x + 1, y + 1], left: d, right: o });
    }
  }
  // The top and left frame boundaries, which the loop above never visits (it
  // only ever looks right and down).
  //
  // PLAN CORRECTION, reproduced before it was made. The plan writes these two
  // as `left: -1, right: o` and `left: o, right: -1` respectively — both
  // INVERTED against the convention the main loop above establishes, and
  // therefore against each other. The top frame edge is exactly the
  // down-neighbour case with the upper cell off the grid (`left: d` = the cell
  // BELOW = o); the left frame edge is exactly the right-neighbour case with
  // the left cell off the grid (`left: o` = the cell to the LEFT = -1). Worked
  // by hand on a single owned cell at (0,0): with the plan's spelling the four
  // arcs of that cell orient as [1,0]→[1,1], [1,1]→[0,1], [1,0]→[0,0],
  // [0,0]→[0,1], which chains to a dead end after two arcs and yields NO ring
  // at all. tests/arcs.test.mjs pins the corner case; the plan's own twoBlocks
  // fixture sits clear of every frame edge and cannot see it.
  for (let x = 0; x < w; x++) { const o = at(x, 0); if (o !== -1) edges.push({ a: [x, 0], b: [x + 1, 0], left: o, right: -1 }); }
  for (let y = 0; y < h; y++) { const o = at(0, y); if (o !== -1) edges.push({ a: [0, y], b: [0, y + 1], left: -1, right: o }); }
  return edges;
}

// ── stage 2: chain edges into arcs ─────────────────────────────────────────
// A NODE is a corner where more than two edges meet, or where edges of more
// than one owner-pair meet. Arcs run node-to-node; a boundary loop with no
// node at all becomes one closed arc starting at its lexicographically
// smallest corner (deterministic).
export function extractArcs({ owner, w, h, cellKm }) {
  const edges = unitEdges({ owner, w, h });
  const byCorner = new Map();       // cornerKey -> edge indices
  for (let i = 0; i < edges.length; i++) {
    for (const c of [edges[i].a, edges[i].b]) {
      const k = cornerKey(c[0], c[1]);
      if (!byCorner.has(k)) byCorner.set(k, []);
      byCorner.get(k).push(i);
    }
  }
  const nodeSet = new Set();
  for (const [k, list] of byCorner) {
    const pairs = new Set(list.map((i) => pairKey(edges[i].left, edges[i].right)));
    // RECORDED MUTATION SURVIVOR, un-killable BY CONSTRUCTION — `pairs.size !== 1`
    // never decides anything, and the case analysis is short enough to settle it
    // here rather than have the next reviewer re-derive it. Name the four cells
    // around a corner NW, NE, SW, SE; the four incident edges are NW|NE, SW|SE,
    // NW|SW and NE|SE, each present only where the two differ. Take any TWO of
    // them present and the other two absent, and the two absences force two
    // equalities that collapse both surviving pairs onto the same unordered pair
    // — every one of the six choices, by symmetry only two distinct cases:
    // {NW|NE, SW|SE} forces NW=SW and NE=SE, and {NW|NE, NW|SW} forces NE=SE=SW.
    // So a degree-2 corner ALWAYS carries one pair, and only `list.length !== 2`
    // can fire. The term stays because it states what a node IS, and because a
    // future non-square lattice would not have the property.
    if (list.length !== 2 || pairs.size !== 1) nodeSet.add(k);
  }

  const used = new Uint8Array(edges.length);
  const arcs = [];
  const toKm = (c) => [c[0] * cellKm, c[1] * cellKm];

  // Walk from `startCorner` along unused edges of the same owner pair until
  // a node or a closed loop is reached.
  const walk = (startIdx, startCorner) => {
    const pk = pairKey(edges[startIdx].left, edges[startIdx].right);
    const pts = [startCorner];
    let cur = startCorner, ei = startIdx;
    for (;;) {
      used[ei] = 1;
      const e = edges[ei];
      const next = cornerKey(e.a[0], e.a[1]) === cornerKey(cur[0], cur[1]) ? e.b : e.a;
      pts.push(next);
      cur = next;
      const k = cornerKey(cur[0], cur[1]);
      if (nodeSet.has(k)) break;
      // TWO MORE RECORDED SURVIVORS, both un-killable for the SAME structural
      // reason and both left in place deliberately. Control only reaches here
      // when `k` is NOT a node, so by the case analysis above the corner has
      // exactly two edges and they carry one owner pair — one of which is the
      // edge just consumed. So `cand` is always empty or a single element:
      // neither the `=== pk` filter nor the ascending sort can change the walk
      // on a square lattice. They are the statement of what the walk is allowed
      // to do, and they are what a corner of degree > 2 reaching here (a change
      // to the node rule above) would need.
      const cand = (byCorner.get(k) ?? [])
        .filter((i) => !used[i] && pairKey(edges[i].left, edges[i].right) === pk)
        .sort((a, b) => a - b);
      if (cand.length === 0) break;
      ei = cand[0];
    }
    // Orient by the FIRST edge so `left`/`right` are stable along the arc.
    const first = edges[startIdx];
    const forward = cornerKey(first.a[0], first.a[1]) === cornerKey(startCorner[0], startCorner[1]);
    return { left: forward ? first.left : first.right, right: forward ? first.right : first.left, pts };
  };

  // Deterministic seeding: node corners first (sorted NUMERICALLY on (cx, cy),
  // never by the string key), then any remaining unused edge (sorted by index)
  // for node-free loops.
  //
  // `[...nodeSet].sort()` — the plan's spelling — is a LEXICOGRAPHIC sort of
  // "cx:cy" strings, so "10:4" precedes "9:4" and the seeding order depends on
  // how many digits a coordinate happens to have. It is still deterministic, so
  // no test of determinism alone can see it; it is corrected because arc ids
  // are emitted in seeding order and `arc-0` should mean the same corner on an
  // 80-wide grid as on an 800-wide one.
  const nodeList = [...nodeSet].sort((p, q) => {
    const [px, py] = p.split(":"), [qx, qy] = q.split(":");
    return (Number(px) - Number(qx)) || (Number(py) - Number(qy));
  });
  const startsFrom = (k) => (byCorner.get(k) ?? []).filter((i) => !used[i]).sort((a, b) => a - b);
  for (const k of nodeList) {
    const [sx, sy] = k.split(":").map(Number);
    for (;;) {
      const cand = startsFrom(k);
      if (cand.length === 0) break;
      const r = walk(cand[0], [sx, sy]);
      arcs.push({ id: arcId(arcs.length), left: r.left, right: r.right, points: r.pts.map(toKm) });
    }
  }
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    const r = walk(i, edges[i].a);
    arcs.push({ id: arcId(arcs.length), left: r.left, right: r.right, points: r.pts.map(toKm) });
  }
  return { arcs, nodes: nodeList.map((k) => { const [x, y] = k.split(":").map(Number); return [x * cellKm, y * cellKm]; }) };
}

// Arc ids are ZERO-PADDED to a fixed width. assembleRings picks its ring start
// by the lowest id, and it compares ids as STRINGS — with the plan's `arc-${n}`
// spelling, "arc-10" sorts before "arc-9", so on any owner with ten or more
// arcs the "lowest arc id" the comment promises is not the arc that gets
// picked. Padding makes the string order and the numeric order the same order.
// 6 digits covers every arc an 800 x 800 field can produce (the whole frame has
// 2 x 800 x 801 = 1,281,600 unit edges, and an arc is at least one edge, but
// the arc COUNT is bounded by the node count, far below 10^6).
const arcId = (n) => `arc-${String(n).padStart(6, "0")}`;

// ── stage 3: Douglas-Peucker, ONCE per arc ─────────────────────────────────
// Called from exactly one place in the pipeline — on the ARC, before rings are
// assembled. Simplifying a RING would let two neighbours drop different
// vertices from their shared edge, which is the sliver this whole module
// exists to prevent.
export function simplifyArc({ points, epsilonKm = DP_EPSILON_KM }) {
  if (points.length <= 2) return points.map((p) => [...p]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const [ax, ay] = points[lo], [bx, by] = points[hi];
    const vx = bx - ax, vy = by - ay;
    const vv = vx * vx + vy * vy;
    let best = -1, bestD = -1;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      let t = vv === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / vv;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
      const d = Math.sqrt(dx * dx + dy * dy);
      // TIE-BREAK: strictly greater, so the LOWEST index wins a tie.
      if (d > bestD) { bestD = d; best = i; }
    }
    if (bestD > epsilonKm) { keep[best] = 1; stack.push([lo, best], [best, hi]); }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push([...points[i]]);
  return out;
}

// ── stage 4: chain arcs into rings for one owner ───────────────────────────
// Orients each arc so `ownerId` is on the LEFT, chains head-to-tail, drops
// the repeated closing point (OPEN rings), and fixes winding by shoelace
// sign — never by abs().
//
// HOLES. An owner that completely encloses another produces TWO rings: the
// outer boundary and the inner boundary of the enclosed owner. Both come back
// positive, because G-POLY rejects a negative ring outright and has no hole
// concept at all. The rule, decided here rather than left to each caller
// (plan Task 5 Step 8): **the trunk polygon is the OUTER ring only, and
// interior water is carved from the fabric CENSUS, not from the ring** —
// G-TRUNK-AREA compares against gross land, which is exactly what an outer
// ring encloses. Rings are therefore returned LARGEST FIRST, so `rings[0]` is
// that outer ring and `rings.slice(1)` is what the census subtracts. Sorting
// is by signed area descending with the chaining order as the stable tiebreak,
// so it adds no new source of nondeterminism.
export function assembleRings({ arcs, ownerId }) {
  const mine = [];
  for (const a of arcs) {
    if (a.left === ownerId) mine.push({ id: a.id, points: a.points });
    else if (a.right === ownerId) mine.push({ id: a.id, points: [...a.points].reverse() });
  }
  const rings = [];
  const used = new Set();
  const key = ([x, y]) => `${x},${y}`;
  // Deterministic start: lowest arc id not yet used.
  const order = mine.map((_, i) => i).sort((i, j) => (mine[i].id < mine[j].id ? -1 : 1));
  for (const start of order) {
    if (used.has(start)) continue;
    used.add(start);
    const pts = [...mine[start].points];
    for (;;) {
      const tail = key(pts[pts.length - 1]);
      if (tail === key(pts[0])) break;
      let nextI = -1;
      for (const i of order) {
        if (used.has(i)) continue;
        if (key(mine[i].points[0]) === tail) { nextI = i; break; }
      }
      if (nextI === -1) break;            // open chain: an owner touching the frame
      used.add(nextI);
      pts.push(...mine[nextI].points.slice(1));
    }
    if (key(pts[pts.length - 1]) === key(pts[0])) pts.pop();   // OPEN ring
    if (pts.length < 3) continue;
    if (shoelaceArea({ points: pts }) < 0) pts.reverse();
    rings.push(pts);
  }
  // Stable sort, largest first — Array.prototype.sort is required to be stable,
  // so equal-area rings keep their chaining order.
  return rings.sort((p, r) => shoelaceArea({ points: r }) - shoelaceArea({ points: p }));
}

// ── stage 5: fractal coastline detail, applied to the ARC not the ring ─────
// So land and sea move together. 3 levels, amplitude halving, perpendicular
// midpoint displacement from integer-hash noise. On self-intersection the
// amplitude halves and the whole arc is retried, max 4 attempts (spec §7.4).
//
// The retry loop is bounded by the `attempt < 4` counter alone — nothing
// inside it can extend it — and the give-up path returns the CLEAN arc, so a
// pathological arc costs detail, never correctness.
export function fractalise({ arc, amplitudeKm = 0.25, levels = 3, stream }) {
  let amp = amplitudeKm;
  for (let attempt = 0; attempt < 4; attempt++) {
    let pts = arc.points.map((p) => [...p]);
    let a = amp;
    for (let lv = 0; lv < levels; lv++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const n = hashNoise2D({ x: mx * 7 + lv * 131, y: my * 7 + lv * 131, stream });
          out.push([mx + (-dy / len) * a * n, my + (dx / len) * a * n]);
        }
        out.push([x2, y2]);
      }
      pts = out;
      a = a / 2;
    }
    if (!polylineSelfIntersects({ points: pts })) return pts;
    amp = amp / 2;
  }
  return arc.points.map((p) => [...p]);   // give up: keep the clean arc
}

// The OPEN-polyline counterpart of scripts/lib/spine.mjs's `selfIntersects`.
//
// PLAN CORRECTION, and it is the difference between this pass working and this
// pass being decorative. `selfIntersects` closes the point list — it walks
// `points[(i + 1) % n]` — because every ring it was written for IS closed. An
// arc is not: judging one with that function tests the arc against a CHORD it
// does not have, from its last point back to its first. For any coastline arc
// that bends at all, that chord crosses the arc, so `fractalise` would see a
// self-intersection on attempt 0, halve four times, and return the clean arc
// with no detail — every time, silently, with the suite green.
//
// Reproduced on the plan's own Step 1 fixture before this was written: the arc
// [[0,0],[8,0],[16,4],[24,4]] closed by that chord crosses it (the arc runs
// below the chord at x = 8 and above it at x = 16), so the plan's assertion
// `out.length > arc.points.length` fails against the plan's own implementation.
//
// Same O(n^2) proper-crossing test, same adjacency rule, minus the wrap. The
// bound matters at generate time: a traced coastal arc is thousands of points
// before simplification, so fractalise is for SIMPLIFIED arcs (tens of points),
// which is the order P14 applies it in anyway.
function polylineSelfIntersects({ points }) {
  const n = points.length;
  for (let i = 0; i + 1 < n; i++) {
    // RECORDED SURVIVOR: starting `j` at `i + 1` instead of `i + 2` leaves the
    // suite green, and cannot do otherwise. Consecutive segments share a
    // vertex, so one of properCross's four orientations is exactly 0 and the
    // `o !== 0` conjunct rejects them before geometry is consulted. The skip
    // says the rule ("adjacent segments are not a crossing") where the reader
    // is, instead of leaving it to be re-derived from properCross's tail.
    for (let j = i + 2; j + 1 < n; j++) {
      if (properCross(points[i], points[i + 1], points[j], points[j + 1])) return true;
    }
  }
  return false;
}

// Orientation by the sign of the cross product. Math.sign is exact.
const orient = (p, r, s) => Math.sign((r[0] - p[0]) * (s[1] - p[1]) - (r[1] - p[1]) * (s[0] - p[0]));
function properCross(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
