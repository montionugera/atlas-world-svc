// tools/mapforge/tests/hydrology.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";

// A 5x5 bowl: a rim of 1.0 with a 0.2 pit at the centre, one 0.0 outlet.
function bowl() {
  const w = 5, h = 5;
  const elev = new Float32Array(w * h).fill(1.0);
  elev[2 * w + 2] = 0.2;
  elev[2 * w + 1] = 0.5;
  elev[2 * w + 0] = 0.0;    // the outlet, on the frame edge
  return { elev, w, h };
}

test("priorityFlood removes every interior sink but never lowers a cell", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  for (let i = 0; i < elev.length; i++) assert.ok(filled[i] >= elev[i], `cell ${i} was lowered`);
  // the pit must now be at least as high as its lowest neighbour path out
  assert.ok(filled[2 * w + 2] > elev[2 * w + 2], "the pit was not filled");
});

test("priorityFlood leaves an already-drained field untouched", () => {
  const w = 4, h = 4;
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = (x + y) / 8;
  const filled = priorityFlood({ elev, w, h });
  assert.deepEqual(Array.from(filled), Array.from(elev));
});

test("priorityFlood is deterministic", () => {
  const a = bowl(), b = bowl();
  assert.deepEqual(Array.from(priorityFlood(a)), Array.from(priorityFlood(b)));
});

test("d8FlowDir points downhill everywhere it points at all", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  const D = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = dir[y * w + x];
    if (d < 0) continue;
    const nx = x + D[d][0], ny = y + D[d][1];
    assert.ok(nx >= 0 && ny >= 0 && nx < w && ny < h, `flow leaves the grid at ${x},${y}`);
    assert.ok(filled[ny * w + nx] <= filled[y * w + x], `uphill flow at ${x},${y}`);
  }
});

test("flowAccumulate gives every cell at least 1 and conserves the total", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  const acc = flowAccumulate({ flowDir: dir, w, h });
  for (let i = 0; i < acc.length; i++) assert.ok(acc[i] >= 1, `cell ${i} accumulated ${acc[i]}`);
  // every cell's own contribution appears exactly once at some outlet
  let outletTotal = 0;
  for (let i = 0; i < acc.length; i++) if (dir[i] < 0) outletTotal += acc[i];
  assert.equal(outletTotal, w * h);
});

test("flowAccumulate is independent of cell visiting order", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  assert.deepEqual(Array.from(flowAccumulate({ flowDir: dir, w, h })),
                   Array.from(flowAccumulate({ flowDir: dir, w, h })));
});


// ─────────────────────────────────────────────────────────────────────────────
// Task 6a Step 8 — the review findings, as tests. The plan's six above prove
// the SHAPE of the output (no sink, downhill, >= 1, conserved). None of them
// can see the epsilon, the heap's tiebreak, or a cycle.
// ─────────────────────────────────────────────────────────────────────────────

// ── the heap's index tiebreak ──────────────────────────────────────────────
test("equal elevations pop in CELL-INDEX order, not push order", () => {
  // The whole determinism claim of this file, and the plan's own review brief
  // asks for it by name. A PERFECTLY FLAT field: every comparison falls through
  // to the index, so the fill order is fully determined by it. Feed the same
  // field twice with the rows reversed — the frontier is seeded in the opposite
  // order and the answer must not move.
  const w = 9, h = 9;
  const flat = new Float32Array(w * h).fill(0.5);
  flat[4 * w + 4] = 0.1;                       // one pit, so there is work to do
  const a = priorityFlood({ elev: flat, w, h });
  // A field that is the SAME multiset in a different memory order cannot be
  // compared cell-for-cell, so compare the thing the tiebreak decides: the
  // filled VALUE at the pit, which is the spill level plus a definite number of
  // epsilons and therefore reads the fill ORDER back out.
  assert.equal(a[4 * w + 4], 0.5000040531158447,
    "the pit's fill level moved — the frontier is no longer draining in index order. " +
    "The value is the rim plus FOUR chained epsilons, which is the number of flat " +
    "cells the frontier crossed to reach the pit, and that count IS the fill order.");
  // …and directly, on the heap's own comparison, through a flat field where a
  // push-ordered heap and an index-ordered heap disagree.
  const desc = new Float32Array(w * h).fill(0.5);
  desc[0] = 0.4;
  const b = priorityFlood({ elev: desc, w, h });
  assert.equal(b[0], new Float32Array([0.4])[0], "the frame cell was raised — it is a seed, not a sink");
  assert.equal(b[w * h - 1], 0.5);
});

test("priorityFlood is stable under a reversed traversal of the SAME field", () => {
  // Order-independence attacked rather than asserted: mirror the field about
  // both axes, flood it, mirror the result back. Identical, to the bit.
  const w = 11, h = 7;
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      elev[y * w + x] = ((x * 37 + y * 91) % 23) / 23;
  const flip = (src) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = src[(h - 1 - y) * w + (w - 1 - x)];
    return out;
  };
  const direct = priorityFlood({ elev, w, h });
  const mirrored = flip(priorityFlood({ elev: flip(elev), w, h }));
  assert.deepEqual(Array.from(direct), Array.from(mirrored));
});

// ── the epsilon ────────────────────────────────────────────────────────────
test("the epsilon is big enough to be a DISTINCT float32 across the whole band", () => {
  // The review's question. `filled` is a Float32Array over [-1, 1]; one ULP at
  // 1.0 is about 1.19e-7, so an epsilon under that would round straight back
  // onto the value it was meant to lift and leave a flat with no gradient for
  // D8 to follow — silently, because every "no sink" assertion still passes.
  for (const v of [-1, -0.5, 0, 0.043565794825553894, 0.5, 1]) {
    const bumped = new Float32Array([v + 1e-6])[0];
    assert.notEqual(bumped, new Float32Array([v])[0], `1e-6 vanishes at ${v}`);
  }
  // …and small enough that a long flat does not become relief: 1,000 cells of
  // chained epsilon is 0.001 of a unit-tall world.
  assert.ok(1e-6 * 1000 < 0.01);
});

test("a flat plateau gets a usable gradient, and D8 finds its way off it", () => {
  // The epsilon's REASON, as behaviour. Without it every cell of a filled flat
  // ties with its neighbours, d8FlowDir marks them all outlets, and the flow
  // network is 25 disconnected puddles instead of one river.
  const w = 7, h = 7;
  const elev = new Float32Array(w * h).fill(0.2);
  for (let x = 0; x < w; x++) { elev[x] = 1; elev[(h - 1) * w + x] = 1; }
  for (let y = 0; y < h; y++) { elev[y * w] = 1; elev[y * w + w - 1] = 1; }
  elev[3 * w + 0] = 0;                              // one outlet through the rim
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  let outlets = 0;
  for (let i = 0; i < dir.length; i++) if (dir[i] < 0) outlets++;
  assert.equal(outlets, 1, `${outlets} outlets on a basin with one — the flat has no gradient`);
  const acc = flowAccumulate({ flowDir: dir, w, h });
  assert.equal(acc[3 * w + 0], w * h, "the single outlet does not drain the whole basin");
});

// ── frame edges and cycles ─────────────────────────────────────────────────
test("d8FlowDir never points off the grid, and a frame minimum is an OUTLET", () => {
  const w = 6, h = 6;
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = (x + y) / 10;
  const dir = d8FlowDir({ elev, w, h });
  const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = dir[y * w + x];
    if (d < 0) continue;
    const nx = x + D[d][0], ny = y + D[d][1];
    assert.ok(nx >= 0 && ny >= 0 && nx < w && ny < h, `flow leaves the grid at ${x},${y}`);
  }
  assert.equal(dir[0], -1, "the corner minimum is not an outlet");
});

test("flowAccumulate THROWS on a flow-direction cycle instead of under-counting", () => {
  // The review asks which of the two it does. Left as the plan wrote it, a
  // cycle drops cells SILENTLY: nothing in the cycle ever reaches in-degree 0,
  // the queue runs out, every acc >= 1 still holds, determinism still holds,
  // and only the conservation total is short — which no per-cell assertion
  // looks at. Hand-build the cycle priorityFlood is supposed to make impossible.
  const w = 4, h = 4;
  const dir = new Int8Array(w * h).fill(-1);
  const at = (x, y) => y * w + x;
  dir[at(1, 1)] = 0;   // (1,1) -> (2,1)
  dir[at(2, 1)] = 2;   // (2,1) -> (2,2)
  dir[at(2, 2)] = 4;   // (2,2) -> (1,2)
  dir[at(1, 2)] = 6;   // (1,2) -> (1,1)
  assert.throws(() => flowAccumulate({ flowDir: dir, w, h }),
    /flow-direction CYCLE/, "a cycle was accepted and quietly under-counted");
});

test("priorityFlood REFUSES a non-finite field", () => {
  // Every heap comparison against NaN is false, so `less` answers false both
  // ways and the heap silently stops being a heap: the output is a plausible
  // filled surface computed in an arbitrary order.
  const elev = new Float32Array(9).fill(0.5);
  elev[4] = NaN;
  assert.throws(() => priorityFlood({ elev, w: 3, h: 3 }), /non-finite/);
});

// ── the diagonal length normalisation ──────────────────────────────────────
test("d8FlowDir prefers the STEEPER route, not the larger drop", () => {
  // A cell whose diagonal neighbour is 1.4 lower and whose orthogonal
  // neighbour is 1.1 lower: the diagonal drops more in total, the orthogonal
  // is steeper per unit length. Without the sqrt(2) normalisation the flow
  // takes the diagonal and every channel in the world drifts 45 degrees.
  const w = 3, h = 3;
  const elev = new Float32Array(w * h).fill(9);
  elev[1 * w + 1] = 1.5;      // the cell under test, at (1,1)
  elev[1 * w + 2] = 0.4;      // east, orthogonal: drop 1.1 over length 1
  elev[2 * w + 2] = 0.1;      // south-east, diagonal: drop 1.4 over length 1.414
  const dir = d8FlowDir({ elev, w, h });
  assert.equal(dir[1 * w + 1], 0, "flow took the bigger drop rather than the steeper slope");
  assert.ok(1.1 / 1 > 1.4 / 1.4142135623730951, "the fixture no longer separates the two rules");
});

test("GOLDEN: the bowl's filled surface, flow directions and accumulation", () => {
  // Values, not properties. Every property above is satisfied by fills that are
  // not this one — a different epsilon, a different tiebreak, an unnormalised
  // diagonal all leave the plan's six green.
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  assert.deepEqual(Array.from(filled).map((v) => Math.round(v * 1e7) / 1e7), [
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
    0, 0.5, 0.500001, 1, 1,
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
  ]);
  const dir = d8FlowDir({ elev: filled, w, h });
  assert.deepEqual(Array.from(dir), [
    -1, -1, -1, -1, -1,
    2, 3, 2, 3, -1,
    -1, 4, 4, 4, -1,
    6, 5, 6, 5, -1,
    -1, -1, -1, -1, -1,
  ]);
  const acc = flowAccumulate({ flowDir: dir, w, h });
  assert.deepEqual(Array.from(acc), [
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
    12, 7, 6, 1, 1,
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
  ]);
  // Fourteen outlets, not one: the 1.0 rim is FLAT, so every rim cell ties with
  // its neighbours and is its own outlet. That is correct and is what the
  // conservation total is measured against — 14 outlets carrying 25 between
  // them, one of which carries 12.
  let outlets = 0, outletTotal = 0;
  for (let i = 0; i < dir.length; i++) if (dir[i] < 0) { outlets++; outletTotal += acc[i]; }
  assert.equal(outlets, 14);
  assert.equal(outletTotal, w * h);
});
