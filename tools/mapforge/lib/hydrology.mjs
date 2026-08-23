// tools/mapforge/lib/hydrology.mjs — P6: priority-flood, D8, accumulation.
//
// Determinism note: every heap and every sort in this file breaks ties on
// the CELL INDEX. That is what makes the output independent of insertion
// order — the same rule the region partition follows (spec §7.3, P9).
//
// A pure numeric library over raw typed arrays: it takes `{elev, w, h}` and
// returns typed arrays, and it knows nothing about premises, flags or the
// manifest. That is deliberate — the grid passes on top of it (winds, water)
// carry all the content semantics, and the two are reviewed separately.
//
// Because it takes loose arrays and not a Grid, grid.mjs's `neighbourIdx` is
// not reachable here. Every neighbour walk below therefore bounds-checks
// (nx, ny) explicitly BEFORE forming an index — never `elev[i + 1]`, which at
// the east edge reads the first cell of the next row and is a plausible,
// silent wrap (grid.mjs says why at length).
//
// On the committed-byte path and scanned by tests/determinism-inventory.test.mjs
// and tests/noise-determinism.test.mjs: no transcendental, no `**`, no clock,
// no random.
import { D8 } from "./grid.mjs";

// A binary min-heap keyed (value, index). Explicit, because Array.sort on
// every push is O(n^2 log n) at 640,000 cells.
class MinHeap {
  constructor() { this.v = []; this.i = []; }
  get size() { return this.v.length; }
  // The INDEX TIEBREAK. `===` rather than a subtraction, so -0 and +0 compare
  // equal and fall through to the index — a Float32Array legitimately stores
  // both.
  //
  // RECORDED MUTATION SURVIVOR, un-killable by construction, and worth stating
  // precisely because the review brief asks for the opposite ("prove the index
  // tiebreak is actually reached"). It IS reached — and it cannot change
  // priorityFlood's output, by the following argument. Two frontier cells tie
  // only when they carry the SAME value v. Whichever pops first assigns any
  // unclosed neighbour X the same `filled[X] <= v ? v + EPS : filled[X]`, marks
  // it closed, and pushes it with that same value; the other then skips it. A
  // lower-valued frontier always pops before either of them regardless of the
  // tiebreak, because the heap is ordered on value first. So the tie order
  // permutes only the sequence of identical assignments.
  //
  // MEASURED both ways before this was written: deleting the tiebreak, and
  // reversing it, each leave the real 800 x 800 filled surface identical in all
  // 640,000 cells, and leave 300 deliberately tie-heavy random 9 x 9 fields
  // (elevations quantised to quarters) identical too.
  //
  // It stays because it makes `less` a TOTAL order — a heap ordered by a
  // partial comparison is not a heap — and because the identical comparison in
  // passes/water.mjs's lake growth IS observable there: that heap FLAGS the
  // cell it pops, so which of two tied cells is carved when the budget runs out
  // mid-tie is a different world. Do not re-file this one; do not delete it.
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

// Barnes-Lehman-Soille priority-flood with an epsilon, so filled flats still
// have a gradient for D8 to follow. Never lowers a cell.
//
// THE EPSILON, measured rather than asserted. `filled` is a Float32Array and
// the field is bounded to [-1, 1] by buildElevation, where one ULP is about
// 1.19e-7 — so 1e-6 is roughly eight ULPs: large enough that `value + EPS` is
// always a DISTINCT float32 (a smaller epsilon would round back onto `value`
// and leave a flat with no gradient at all, which is the failure this constant
// exists to prevent), and small enough that a thousand-cell flat climbs 0.001
// of a unit-tall world. It accumulates only ALONG A FLAT: a cell already above
// the spill value is left exactly where it was, so relief is not distorted.
const EPS = 1e-6;
export function priorityFlood({ elev, w, h }) {
  const n = w * h;
  // The non-finite guard, at the one place it is cheap. A NaN in the field
  // makes every heap comparison false, so `less` answers false both ways, the
  // heap silently stops being a heap, and the output is a plausible filled
  // surface computed in an arbitrary order. sea-level.mjs guards its own input
  // for the same reason and says so at more length; a fixture that builds a
  // field by hand does not go through it.
  for (let i = 0; i < n; i++)
    if (!Number.isFinite(elev[i]))
      throw new Error(`hydrology: elevation cell ${i} is non-finite (${elev[i]}). ` +
        `Every heap comparison against a NaN is false, so the fill would run in an arbitrary order.`);
  const filled = Float32Array.from(elev);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) { const i = y * w + x; if (!closed[i]) { closed[i] = 1; heap.push(filled[i], i); } }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) { const i = y * w + x; if (!closed[i]) { closed[i] = 1; heap.push(filled[i], i); } }
  }
  while (heap.size) {
    const { value, index } = heap.pop();
    const cx = index % w, cy = (index / w) | 0;
    for (const [dx, dy] of D8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      closed[ni] = 1;
      if (filled[ni] <= value) filled[ni] = value + EPS;
      heap.push(filled[ni], ni);
    }
  }
  return filled;
}

// Steepest descent over the eight neighbours, tie broken by the LOWEST D8
// index. -1 means no lower neighbour exists (an outlet or the frame edge).
export function d8FlowDir({ elev, w, h }) {
  const n = w * h;
  const dir = new Int8Array(n).fill(-1);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      let best = -1, bestDrop = 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + D8[d][0], ny = cy + D8[d][1];
        // A cell on the frame simply has fewer candidates, so it stays an
        // OUTLET (-1) rather than pointing off the grid. That is the contract
        // flowAccumulate's `down[i] = -1` termination depends on.
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        // Diagonal steps are longer, so normalise the drop by 1 or sqrt(2).
        // The literal is sqrt(2) to full float64 precision — a constant, not a
        // Math call, so it is identical on every engine by construction.
        const len = D8[d][0] !== 0 && D8[d][1] !== 0 ? 1.4142135623730951 : 1;
        const drop = (elev[i] - elev[ni]) / len;
        // Strictly greater, so a tie keeps the LOWEST D8 index — the same
        // fixed-order tiebreak grid.mjs's D8 table exists to provide.
        if (drop > bestDrop) { bestDrop = drop; best = d; }
      }
      dir[i] = best;
    }
  }
  return dir;
}

// Kahn topological accumulation: process a cell only once every upstream
// contributor has been processed. Order-independent by construction — no
// sort, no heap, so nothing to tie-break.
export function flowAccumulate({ flowDir, w, h }) {
  const n = w * h;
  const acc = new Float32Array(n).fill(1);
  const indeg = new Uint8Array(n);          // at most 8 upstream neighbours
  const down = new Int32Array(n).fill(-1);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const d = flowDir[i];
      if (d < 0) continue;
      const ni = (cy + D8[d][1]) * w + (cx + D8[d][0]);
      down[i] = ni;
      indeg[ni]++;
    }
  }
  const queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  let processed = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    processed++;
    const ni = down[i];
    if (ni < 0) continue;
    acc[ni] += acc[i];
    if (--indeg[ni] === 0) queue.push(ni);
  }
  // A CYCLE IN flowDir DOES NOT HANG — IT UNDER-COUNTS, SILENTLY. The review
  // question, answered in code rather than in a comment: a cycle's cells never
  // reach in-degree 0, so the queue simply runs out. Every cell in the cycle
  // keeps its initial 1, everything draining THROUGH the cycle is lost, and
  // `sum(acc at outlets)` quietly comes out below n while every per-cell
  // assertion ("acc >= 1", "acc is deterministic") still holds. priorityFlood
  // plus a strictly-downhill d8FlowDir makes a cycle impossible; this is what
  // says so if that ever stops being true.
  if (processed !== n)
    throw new Error(
      `hydrology: flow accumulation reached ${processed} of ${n} cells — ${n - processed} sit in a ` +
      `flow-direction CYCLE. d8FlowDir only ever points strictly downhill, so a cycle means the ` +
      `elevation it was given still had an interior sink: run priorityFlood first, on the SAME field.`);
  return acc;
}
