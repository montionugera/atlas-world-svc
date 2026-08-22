// tools/mapforge/tests/arcs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArcs, simplifyArc, assembleRings, splitPinches, fractalise, DP_EPSILON_KM } from "../lib/arcs.mjs";
import { shoelaceArea, selfIntersects } from "../../../scripts/lib/spine.mjs";

// A 10x10 owner field: a 4x4 block of owner 0 with a 2x4 block of owner 1
// glued to its right edge. Everything else is -1 (sea).
function twoBlocks() {
  const w = 10, h = 10;
  const owner = new Int16Array(w * h).fill(-1);
  for (let y = 3; y < 7; y++) {
    for (let x = 2; x < 6; x++) owner[y * w + x] = 0;
    for (let x = 6; x < 8; x++) owner[y * w + x] = 1;
  }
  return { owner, w, h };
}

test("extractArcs emits arcs whose endpoints are exact grid corners", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  assert.ok(arcs.length >= 3, `expected at least 3 arcs, got ${arcs.length}`);
  for (const a of arcs)
    for (const [x, y] of a.points) {
      assert.equal(x % 0.5, 0, `x=${x} is not a grid corner`);
      assert.equal(y % 0.5, 0, `y=${y} is not a grid corner`);
    }
});

test("every arc is shared by exactly two owners, and left !== right", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  for (const a of arcs) assert.notEqual(a.left, a.right, `arc ${a.id} has the same owner both sides`);
});

test("the shared arc between owner 0 and owner 1 is ONE arc, listed once", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const shared = arcs.filter((a) => (a.left === 0 && a.right === 1) || (a.left === 1 && a.right === 0));
  assert.equal(shared.length, 1, `shared boundary split into ${shared.length} arcs`);
});

test("assembleRings closes a ring per owner with strictly positive shoelace", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  for (const id of [0, 1]) {
    const { rings } = assembleRings({ arcs, ownerId: id });
    assert.equal(rings.length, 1, `owner ${id} produced ${rings.length} rings`);
    const r = rings[0];
    assert.ok(r.length >= 4, `owner ${id} ring has ${r.length} points`);
    assert.ok(shoelaceArea({ points: r }) > 0, `owner ${id} ring is wound backwards`);
    assert.ok(!selfIntersects({ points: r }), `owner ${id} ring self-intersects`);
    const [fx, fy] = r[0], [lx, ly] = r[r.length - 1];
    assert.ok(fx !== lx || fy !== ly, `owner ${id} ring is CLOSED — author OPEN rings`);
  }
});

test("the shared boundary vertices are BIT-IDENTICAL in both owners' rings", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const r0 = assembleRings({ arcs, ownerId: 0 }).rings[0];
  const r1 = assembleRings({ arcs, ownerId: 1 }).rings[0];
  const key = ([x, y]) => `${x},${y}`;
  const s0 = new Set(r0.map(key)), s1 = new Set(r1.map(key));
  const shared = [...s0].filter((k) => s1.has(k));
  assert.ok(shared.length >= 2, `only ${shared.length} shared vertices — the boundary split`);
});

test("assembled ring areas sum to the exact owner cell area", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const cellArea = 0.25;
  for (const [id, cells] of [[0, 16], [1, 8]]) {
    const { rings } = assembleRings({ arcs, ownerId: id });
    const area = rings.reduce((s, r) => s + shoelaceArea({ points: r }), 0);
    assert.equal(area, cells * cellArea, `owner ${id}: ring area ${area} !== census ${cells * cellArea}`);
  }
});

test("simplifyArc pins the endpoints and never returns fewer than 2 points", () => {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([i * 0.5, i % 2 === 0 ? 0 : 0.05]);   // sub-epsilon zigzag
  const out = simplifyArc({ points: pts, epsilonKm: DP_EPSILON_KM });
  assert.deepEqual(out[0], pts[0]);
  assert.deepEqual(out[out.length - 1], pts[pts.length - 1]);
  assert.equal(out.length, 2, "a sub-epsilon zigzag must collapse to its endpoints");
});

test("simplifyArc keeps a feature larger than epsilon", () => {
  const pts = [[0, 0], [5, 0], [5, 4], [10, 4], [10, 0], [15, 0]];
  const out = simplifyArc({ points: pts, epsilonKm: DP_EPSILON_KM });
  assert.deepEqual(out, pts);
});

test("simplifyArc DROPS a point exactly at epsilon — the boundary, not near it", () => {
  // A recorded undeclared survivor: `bestD > epsilonKm` -> `>=` changed nothing,
  // because no fixture put a vertex exactly ON the tolerance. This one does, in
  // exact binary: the perpendicular distance is sqrt(0.25) = 0.5, and 0.5 is the
  // epsilon. Douglas-Peucker's tolerance is "further than", so it goes.
  const pts = [[0, 0], [1, 0.5], [2, 0]];
  assert.deepEqual(simplifyArc({ points: pts, epsilonKm: 0.5 }), [[0, 0], [2, 0]]);
  // …and a hair further out is kept, so the assertion is about the boundary and
  // not about the whole predicate.
  assert.equal(simplifyArc({ points: [[0, 0], [1, 0.5000001], [2, 0]], epsilonKm: 0.5 }).length, 3);
});

test("DP_EPSILON_KM is the pinned 0.35", () => { assert.equal(DP_EPSILON_KM, 0.35); });

test("fractalise preserves endpoints, stays within amplitude, and never self-intersects", () => {
  const arc = { id: "a1", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  const out = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  assert.deepEqual(out[0], arc.points[0]);
  assert.deepEqual(out[out.length - 1], arc.points[arc.points.length - 1]);
  assert.ok(out.length > arc.points.length, "fractalise added no detail");
  assert.ok(!selfIntersects({ points: [...out, [24, -30], [0, -30]] }), "fractalised arc self-intersects");
});

test("fractalise is deterministic", () => {
  const arc = { id: "a1", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  const a = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  const b = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  assert.deepEqual(a, b);
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 5 Step 8 — the review findings, as tests.
//
// The plan's own fixture (`twoBlocks`) is a rectangle sitting clear of every
// frame edge with no holes and no diagonal contact. Four of the five defects
// below are invisible to it, which is why they were in the plan at all.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG } from "../lib/grid.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation } from "../lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "../lib/passes/sea-level.mjs";
import { terrainStream } from "../lib/seed.mjs";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

const field = (w, h, fill) => {
  const owner = new Int16Array(w * h).fill(-1);
  fill((x, y, v) => { owner[y * w + x] = v; });
  return { owner, w, h };
};

// ── the frame convention ───────────────────────────────────────────────────
// PLAN DEFECT 1. The plan's two frame loops emit `left`/`right` INVERTED
// against the convention its own main loop establishes, so an owner touching
// the top or left frame cannot chain a closed ring.
//
// THE BY-HAND NARRATIVE THAT USED TO STAND HERE WAS FALSE, and the reviewer
// measured it: on THIS field the plan's code returns the CORRECT single ring
// [[0.5,0],[0.5,0.5],[0,0.5],[0,0]], identical to head's. The single-corner
// fixture cannot see the defect at all; what makes the frame convention
// load-bearing is the RAGGED field further down, found by sweeping 5x5 owner
// fields. This test is kept because it is the only direct coverage the frame
// branches have on any field, and because restoring either plan spelling still
// reds ONE test — that one, not this one.
test("an owner in the TOP-LEFT CORNER still closes one exact ring", () => {
  const { owner, w, h } = field(3, 3, (set) => set(0, 0, 0));
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const { rings } = assembleRings({ arcs, ownerId: 0 });
  assert.equal(rings.length, 1, `corner cell produced ${rings.length} rings, not 1`);
  // The exact ring, not just its area: a wrapped or dropped frame edge can
  // still close on 0.25 km2 by accident, and did — see the four-frame case.
  assert.deepEqual(rings[0], [[0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0]]);
  assert.equal(shoelaceArea({ points: rings[0] }), 0.25, "corner ring area is not one cell");
  assert.ok(!selfIntersects({ points: rings[0] }));
});

test("an owner spanning ALL FOUR frame edges closes one exact ring", () => {
  // Every frame loop and both main-loop branches at once.
  const w = 4, h = 4;
  const { owner } = field(w, h, (set) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 0);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const { rings } = assembleRings({ arcs, ownerId: 0 });
  assert.equal(rings.length, 1);
  // 4 sides x 4 unit edges: the ring must carry every corner it crosses. AREA
  // ALONE IS NOT ENOUGH — measured, an `at()` that indexes `owner[y*w + x]`
  // without the x guard reads the NEXT ROW'S first cell as the east neighbour,
  // suppresses three of the four east frame edges, and still closes a ring of
  // exactly 4 km2, on 14 points instead of 16.
  assert.equal(rings[0].length, 16, `four-frame ring has ${rings[0].length} points, not 16`);
  assert.equal(shoelaceArea({ points: rings[0] }), 16 * 0.25);
});

test("TWO owners sharing the top-left corner both close, chaining frame to interior", () => {
  // The case that makes the frame convention LOAD-BEARING. A lone owner on the
  // frame traces one node-free loop, so a flipped `left`/`right` only decides
  // whether that single arc is used forward or reversed — and assembleRings'
  // winding normalisation hides it. Put a second owner beside it and the
  // boundary breaks into three arcs at two nodes: now each owner's ring must
  // chain a FRAME arc to an INTERIOR arc, and an inverted frame edge simply
  // does not join. This is the fixture that kills the plan's spelling.
  const { owner, w, h } = field(4, 4, (set) => {
    set(0, 0, 0); set(0, 1, 0); set(1, 0, 1); set(1, 1, 1);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  assert.equal(arcs.length, 3, `expected 3 arcs (one shared, two frame), got ${arcs.length}`);
  assert.deepEqual(assembleRings({ arcs, ownerId: 0 }).rings,
    [[[0.5, 0], [0.5, 0.5], [0.5, 1], [0, 1], [0, 0.5], [0, 0]]]);
  assert.deepEqual(assembleRings({ arcs, ownerId: 1 }).rings,
    [[[0.5, 1], [0.5, 0.5], [0.5, 0], [1, 0], [1, 0.5], [1, 1]]]);
  for (const id of [0, 1])
    assert.equal(shoelaceArea({ points: assembleRings({ arcs, ownerId: id }).rings[0] }), 0.5);
});

// ── diagonal touch ─────────────────────────────────────────────────────────
test("a RAGGED two-owner field on the frame closes on its exact census", () => {
  // The fixture that makes the LEFT frame convention load-bearing, found by
  // sweeping 5x5 owner fields for one where the plan's spelling changes the
  // answer. It is needed because an arc takes its `left`/`right` from its FIRST
  // edge only: a mis-oriented edge in the MIDDLE of an arc is invisible, and
  // the tidy side-by-side fixture above only ever puts a top-frame edge first.
  // Here the plan's left-frame spelling splits owner 0 into FIVE rings where
  // four are right, with areas [2, 0.625, 0.375, 0, 0.25] — a wrong
  // decomposition containing a ZERO-AREA degenerate ring, on a field with no
  // continent in it at all. (The figure recorded when this was written — "five
  // rings totalling 3.5 km2 against a 3.25 km2 census" — did not reproduce:
  // the five sum to exactly 3.25. The defect is the decomposition and the
  // degenerate ring, not an overcount, and assembleRings now THROWS on it
  // rather than emitting it.)
  const f = [0, 0, 0, 0, -1, 0, 1, -1, 0, 1, 0, -1, 0, 0, -1, 1, 0, -1, 1, 1, 0, -1, 0, 0, 1];
  const owner = Int16Array.from(f);
  const { arcs } = extractArcs({ owner, w: 5, h: 5, cellKm: 0.5 });
  assert.equal(arcs.length, 25, "the fixture's arc census moved");
  for (const [id, rings_, area] of [[0, 4, 3.25], [1, 4, 1.5]]) {
    const { rings } = assembleRings({ arcs, ownerId: id });
    assert.equal(rings.length, rings_, `owner ${id} produced ${rings.length} rings`);
    let cells = 0;
    for (const v of f) if (v === id) cells++;
    assert.equal(rings.reduce((t, r) => t + shoelaceArea({ points: r }), 0), cells * 0.25);
    assert.equal(cells * 0.25, area);
    for (const r of rings) {
      assert.ok(shoelaceArea({ points: r }) > 0, `owner ${id} ring wound backwards`);
      assert.ok(!selfIntersects({ points: r }), `owner ${id} ring self-intersects`);
    }
  }
});

test("a DIAGONAL touch does not produce a self-intersecting bowtie", () => {
  // owner 0 at (1,1) and (2,2); owner 1 at (2,1) and (1,2). Four cells meeting
  // at one corner, which is the classic place a naive tracer emits a bowtie.
  //
  // GOLDEN MOVED, 2026-08-22, by the seam-6 adjudicating fix pass. It used to
  // pin owner 0 at TWO rings and owner 1 at ONE — a ring passing through the
  // pinch corner twice — and recorded the asymmetry as "the better world"
  // because a symmetric split would put half a diagonal-isthmus continent
  // outside `rings[0]`, which is the trunk polygon. Both halves of that
  // reasoning were measured again and both are wrong:
  //
  //  * The asymmetry was never a choice between one ring and two. The SAME
  //    field already answers TWO for owner 0, and which owner gets which is
  //    decided, as the old comment itself admitted, "by nothing better than the
  //    arc id that happens to sit lowest at that corner". So a diagonal isthmus
  //    already truncated `rings[0]` half the time, silently and by coin flip.
  //    `buildTrunkRings` pushes a named problem for `rings.length > 1`, so the
  //    split makes the truncation LOUD every time instead of half the time.
  //  * The pinch-through ring is not usable by the repo's own overlap
  //    primitive. `scripts/lib/geometry.mjs`'s `triangulateOrNull` refuses a
  //    non-simple ring, so `exactIntersectionArea` returns 0 for it — the same
  //    number it returns for "genuinely disjoint". Measured on the seam-6 draft
  //    root: 4 of 182 emitted region rings pinched, and c02/r13 — a 470.25 km²
  //    region lying WHOLLY inside n-cluster1 — measured 0.00 km² of overlap
  //    with it. After the split it measures 471.00 with no problems raised.
  //    A trunk polygon no overlap gate can measure is worse than a split one.
  //
  // `assembleRings` therefore splits every closed chain at its repeated
  // vertices (`splitPinches`) and classifies each simple loop on its own. The
  // measured effect on the real world was exactly the four pinched region
  // rings, on three continents: every `areaKm2` unchanged, every other region,
  // every coast ring and every one of the 25 trunk placements byte-identical.
  const { owner, w, h } = field(5, 5, (set) => {
    set(1, 1, 0); set(2, 2, 0); set(2, 1, 1); set(1, 2, 1);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  for (const id of [0, 1]) {
    const { rings, holes, areaKm2 } = assembleRings({ arcs, ownerId: id });
    assert.ok(rings.length >= 1, `owner ${id} produced no ring at all`);
    for (const r of rings) {
      assert.ok(!selfIntersects({ points: r }), `owner ${id} ring self-intersects — a bowtie`);
      assert.ok(shoelaceArea({ points: r }) > 0, `owner ${id} ring is wound backwards`);
      assert.equal(new Set(r.map((p) => p.join(","))).size, r.length,
        `owner ${id} ring repeats a vertex — exactIntersectionArea refuses it and reports 0`);
    }
    assert.equal(areaKm2, 2 * 0.25, `owner ${id} area ${areaKm2} against a 2-cell census`);
    assert.equal(holes.length, 0, `owner ${id} has no enclosed foreign owner here`);
  }
  // SYMMETRY, pinned. Both owners are the same shape, so both must get the same
  // decomposition; the old golden's 2-vs-1 was the defect, not the contract.
  assert.equal(assembleRings({ arcs, ownerId: 0 }).rings.length, 2);
  assert.equal(assembleRings({ arcs, ownerId: 1 }).rings.length, 2);
});

test("a one-cell NOTCH touching the boundary at a corner is a HOLE, not a pinched ring", () => {
  // The pinch shape the old bowtie golden did not have and the real world does:
  // a 4x4 block of owner 0 with owner 1 taking the single cell at (2,2) AND the
  // single cell at (3,3) — so owner 1's (2,2) cell touches the outside of the
  // block only through the (3,3) corner, and owner 0's boundary leaves and
  // re-enters that corner. Three of the four pinched region rings measured on
  // the seam-6 draft root are this shape (c02/r13, c02/r22, c05/r19); their
  // pinched shoelace was CORRECT (it adds the lobe and subtracts the notch), so
  // no area gate could ever have seen them.
  const { owner, w, h } = field(6, 6, (set) => {
    for (let x = 1; x <= 4; x++) for (let y = 1; y <= 4; y++) set(x, y, 0);
    set(2, 2, 1); set(3, 3, 1);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const { rings, holes, areaKm2 } = assembleRings({ arcs, ownerId: 0 });
  // 16 cells less the two owner-1 cells.
  assert.equal(areaKm2, 14 * 0.25);
  for (const r of [...rings, ...holes])
    assert.equal(new Set(r.map((p) => p.join(","))).size, r.length,
      "a ring or hole repeats a vertex — exactIntersectionArea refuses it and reports 0");
  // The notch is named as a HOLE rather than folded into the outer ring.
  assert.ok(holes.length >= 1, "the enclosed owner-1 cells are holes, not part of the outer ring");
  const total = rings.reduce((s, r) => s + shoelaceArea({ points: r }), 0) -
                holes.reduce((s, r) => s + shoelaceArea({ points: r }), 0);
  assert.equal(total, areaKm2, "rings minus holes must be the one true area");
});

test("splitPinches is the identity on a simple ring and splits a figure-eight", () => {
  const simple = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.deepEqual(splitPinches(simple), [simple]);
  // A figure-eight through [1,1]: two unit squares meeting at one corner.
  const eight = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [1, 2], [1, 1], [0, 1]];
  const parts = splitPinches(eight);
  assert.equal(parts.length, 2);
  for (const p of parts)
    assert.equal(new Set(p.map((q) => q.join(","))).size, p.length);
  // Shoelace is additive over the split — this is why areaKm2 cannot move.
  assert.equal(parts.reduce((s, p) => s + Math.abs(shoelaceArea({ points: p })), 0),
               Math.abs(shoelaceArea({ points: eight })));
});

// ── holes ──────────────────────────────────────────────────────────────────
test("an enclosed owner is a HOLE, returned separately from the host's lobes", () => {
  // owner 0 fills a 5x5 block; owner 1 is the single cell at its centre.
  //
  // THE RULING (see arcs.mjs' assembleRings header): rings[] holds the OUTER
  // boundaries, holes[] holds the interior ones, and areaKm2 is the one true
  // area. The previous contract was recorded two contradictory ways in one
  // commit — this file said "outer minus hole", STATE said "callers must SUM
  // the rings" — and the reviewer's counterexample kills both. It is below.
  const { owner, w, h } = field(9, 9, (set) => {
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) set(x, y, 0);
    set(4, 4, 1);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const { rings, holes, areaKm2 } = assembleRings({ arcs, ownerId: 0 });
  assert.equal(rings.length, 1, "the host has ONE lobe");
  assert.equal(holes.length, 1, "the enclosed owner is not reported as a hole");
  for (const r of [...rings, ...holes])
    assert.ok(shoelaceArea({ points: r }) > 0, "G-POLY takes no negative ring");
  assert.equal(shoelaceArea({ points: rings[0] }), 25 * 0.25, "rings[0] is not the OUTER ring");
  assert.equal(shoelaceArea({ points: holes[0] }), 1 * 0.25, "holes[0] is not the hole");
  let cells = 0;
  for (let i = 0; i < owner.length; i++) if (owner[i] === 0) cells++;
  assert.equal(cells, 24);
  assert.equal(areaKm2, cells * 0.25, "areaKm2 is not the cell census — the carve rule does not close");
});

test("the case that kills BOTH old contracts: a hole AND a second lobe at once", () => {
  // The reviewer's counterexample, pinned so neither wrong rule can come back.
  // owner 0 is a 5x5 block with a 1-cell hole (owner 1) inside it and a
  // separate 1-cell lobe elsewhere. Three positive rings of areas
  // [6.25, 0.25, 0.25]: a hole and a second lobe are the SAME SHAPE at the
  // same size, so a flat area-sorted list cannot say which is which.
  //     SUM the rings      -> 6.75   WRONG
  //     outer minus rest   -> 5.75   WRONG
  //     rings[0] alone     -> 6.25   right only because the two errors cancel
  const { owner, w, h } = field(8, 8, (set) => {
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) set(x, y, 0);
    set(3, 3, 1);
    set(7, 7, 0);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const r = assembleRings({ arcs, ownerId: 0 });
  assert.equal(r.rings.length, 2, "two disjoint lobes");
  assert.equal(r.holes.length, 1, "one hole");
  let cells = 0;
  for (let i = 0; i < owner.length; i++) if (owner[i] === 0) cells++;
  assert.equal(cells, 25);
  assert.equal(r.areaKm2, cells * 0.25);
  // and the two rules that used to be on the record are BOTH wrong here.
  const sum = [...r.rings, ...r.holes].reduce((a, p) => a + shoelaceArea({ points: p }), 0);
  assert.equal(sum, 6.75, "the SUM rule");
  assert.equal(shoelaceArea({ points: r.rings[0] }), 6.25, "rings[0] alone");
  assert.notEqual(sum, cells * 0.25);
});

test("areaKm2 equals the cell census over EVERY 3x3 field of three owners", () => {
  // 19,683 fields x both owners. The reviewer measured 64 of them failing the
  // SUM rule and 105 of 20,000 random 6x6 fields; under the nesting rule the
  // exhaustive sweep is clean, which is what "a caller cannot get it wrong"
  // has to mean.
  let instances = 0;
  for (let m = 0; m < 3 ** 9; m++) {
    const o = new Int16Array(9);
    let t = m;
    for (let i = 0; i < 9; i++) { o[i] = (t % 3) - 1; t = (t / 3) | 0; }
    const { arcs } = extractArcs({ owner: o, w: 3, h: 3, cellKm: 1 });
    for (const id of [0, 1]) {
      let cells = 0;
      for (let i = 0; i < 9; i++) if (o[i] === id) cells++;
      if (cells === 0) continue;
      instances++;
      const r = assembleRings({ arcs, ownerId: id });
      assert.equal(r.areaKm2, cells, `field ${m} owner ${id}`);
    }
  }
  assert.equal(instances, 38342, "the sweep stopped covering what it used to");
});

test("assembleRings THROWS on a chain that CLOSES but encloses nothing", () => {
  // The second half of MAJOR 3, and it is a different guard from the closure
  // one: this chain closes perfectly and has four distinct vertices, so neither
  // the closure test nor `pts.length < 3` can see it. It is a there-and-back
  // walk with signed area exactly 0 — the shape the plan's inverted frame edges
  // actually emitted, inside an otherwise plausible five-ring decomposition.
  const arcs = [
    { id: "arc-000000", left: 0, right: -1, points: [[0, 0], [1, 0], [2, 0]] },
    { id: "arc-000001", left: 0, right: -1, points: [[2, 0], [1, 0], [0, 0]] },
  ];
  assert.throws(() => assembleRings({ arcs, ownerId: 0 }), /zero signed area/);
});

test("THREE distinct vertices is a polygon and is accepted", () => {
  // Pins `pts.length < 3` against `< 4`. Every ring a square lattice can
  // produce has at least four corners — a single cell has exactly four — so on
  // any real owner field the two spellings are the same rule, and only a
  // synthetic arc set separates them. assembleRings' contract is over ARCS, not
  // over lattice fields (the degenerate case above is synthetic too), and three
  // vertices is where a polygon starts.
  const arcs = [
    { id: "arc-000000", left: 0, right: -1, points: [[0, 0], [4, 0]] },
    { id: "arc-000001", left: 0, right: -1, points: [[4, 0], [4, 3]] },
    { id: "arc-000002", left: 0, right: -1, points: [[4, 3], [0, 0]] },
  ];
  const r = assembleRings({ arcs, ownerId: 0 });
  assert.equal(r.rings.length, 1);
  assert.equal(r.rings[0].length, 3);
  assert.equal(r.areaKm2, 6);
});

test("a LOBE INSIDE A HOLE is a lobe again — nesting is counted, not detected", () => {
  // An island in a lake in a continent. Depth 2, so it is land: the parity is
  // the rule, not "contained by anything". Without it the island's area is
  // subtracted and the owner comes back 2 cells short of its census.
  const { owner, w, h } = field(11, 11, (set) => {
    for (let y = 1; y < 10; y++) for (let x = 1; x < 10; x++) set(x, y, 0);   // continent
    for (let y = 3; y < 8; y++) for (let x = 3; x < 8; x++) set(x, y, 1);     // lake
    for (let y = 5; y < 6; y++) for (let x = 5; x < 6; x++) set(x, y, 0);     // island
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const r = assembleRings({ arcs, ownerId: 0 });
  assert.equal(r.rings.length, 2, "the island is not counted as a second lobe");
  assert.equal(r.holes.length, 1);
  let cells = 0;
  for (let i = 0; i < owner.length; i++) if (owner[i] === 0) cells++;
  assert.equal(cells, 81 - 25 + 1);
  assert.equal(r.areaKm2, cells * 0.25, "a lobe inside a hole was subtracted instead of added");
  // and owner 1's own ring, with the island as ITS hole
  const r1 = assembleRings({ arcs, ownerId: 1 });
  assert.equal(r1.rings.length, 1);
  assert.equal(r1.holes.length, 1);
  assert.equal(r1.areaKm2, 24 * 0.25);
});

test("assembleRings THROWS on a chain that cannot close", () => {
  // MAJOR 3, and it is not hypothetical: the plan's inverted frame edges
  // produced exactly this — a chain that ran out of arcs, was emitted anyway,
  // survived `pts.length >= 3`, was not negative so the winding step left it
  // alone, and came back as a polygon of area 0 inside an otherwise plausible
  // decomposition. Feeding assembleRings a torn arc set is the direct test.
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const torn = arcs.filter((a) => a.id !== arcs[arcs.length - 1].id);
  assert.throws(() => assembleRings({ arcs: torn, ownerId: 0 }), /does not close/);
});

// ── determinism of the arc identity ────────────────────────────────────────
test("rings come back LARGEST FIRST even when the small one is traced first", () => {
  // The hole fixture cannot see this: the outer boundary is emitted before the
  // inner one by the row-major sweep, so rings[0] is already the outer ring
  // with or without the ordering. Here the SMALL blob is at the top-left and
  // therefore first, so an unsorted return puts a 0.25 km2 ring in the trunk
  // polygon slot ahead of a 6.25 km2 one.
  const { owner, w, h } = field(12, 12, (set) => {
    set(1, 1, 0);
    for (let y = 5; y < 10; y++) for (let x = 5; x < 10; x++) set(x, y, 0);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  assert.equal(arcs.length, 2, "the two blobs are no longer two separate arcs");
  const { rings } = assembleRings({ arcs, ownerId: 0 });
  assert.deepEqual(rings.map((r) => shoelaceArea({ points: r })), [6.25, 0.25],
    "rings are not ordered largest-first");
});

test("arc ids are stable across two runs on the same owner field", () => {
  const a = twoBlocks(), b = twoBlocks();
  const ra = extractArcs({ ...a, cellKm: 0.5 }), rb = extractArcs({ ...b, cellKm: 0.5 });
  assert.deepEqual(ra.arcs, rb.arcs);
  assert.deepEqual(ra.nodes, rb.nodes);
});

test("arc ids sort in the SAME order as their numbers", () => {
  // PLAN DEFECT 2. assembleRings picks its ring start by the lowest arc id and
  // compares ids as STRINGS. With the plan's `arc-${n}` spelling "arc-10" sorts
  // before "arc-9", so on any owner with ten or more arcs — every continent on
  // the real field — the "lowest arc id" the comment promises is not the arc
  // that gets picked. Zero-padding makes the two orders one order.
  // On a REAL extraction with far more than nine arcs, not on hand-written
  // literals — an id scheme is only wrong once the tenth arc exists.
  const { owner, w, h } = field(6, 6, (set) => {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) set(x, y, (x + y) % 3);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  assert.equal(arcs.length, 80, "the fixture no longer produces enough arcs to see this");
  const ids = arcs.map((a) => a.id);
  assert.deepEqual([...ids].sort(), ids,
    "arcs are emitted in an order their ids do not sort into — assembleRings' " +
    "\"lowest arc id\" start is then not the arc it names");
  assert.deepEqual([...["arc-0", "arc-1", "arc-10", "arc-2"]].sort(),
    ["arc-0", "arc-1", "arc-10", "arc-2"], "…which is what the unpadded form does");
});

test("NODES come back in numeric (cx, cy) order, not lexicographic", () => {
  // Two isolated diagonal pinches, one either side of the 9 -> 10 digit change.
  // Sorted as strings, "11:…" precedes "3:…" and the seeding order — and
  // therefore every arc id — depends on how many digits a coordinate has.
  const { owner, w, h } = field(14, 5, (set) => {
    set(2, 1, 0); set(3, 2, 0);        // pinch at corner (3, 2)
    set(10, 1, 0); set(11, 2, 0);      // pinch at corner (11, 2)
  });
  const { nodes } = extractArcs({ owner, w, h, cellKm: 1 });
  assert.deepEqual(nodes, [[3, 2], [11, 2]], `unexpected node set: ${JSON.stringify(nodes)}`);
  assert.deepEqual([...["3:2", "11:2"]].sort(), ["11:2", "3:2"],
    "…which is the order the plan's string sort would have produced");
});

// ── simplify ONCE ──────────────────────────────────────────────────────────
test("simplifyArc is called at most ONCE per arc anywhere in arcs.mjs", () => {
  // The plan's rule, as a source fact rather than a promise: per-ring
  // simplification of a shared arc is exactly what tears planar topology apart.
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/arcs.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
  const calls = [...src.matchAll(/(?<!function\s)\bsimplifyArc\s*\(/g)];
  assert.equal(calls.length, 0,
    `arcs.mjs calls simplifyArc ${calls.length} time(s) internally; it must be the CALLER's one-shot step`);
  assert.match(src, /export function simplifyArc/, "…and it must still be exported");
  // assembleRings must not simplify either — it takes arcs already simplified.
  assert.ok(!/assembleRings[\s\S]*epsilon/i.test(src), "assembleRings mentions an epsilon");
});

// ── fractalise ─────────────────────────────────────────────────────────────
test("fractalise adds detail to a BENT arc — the open-polyline test, not the closed one", () => {
  // PLAN DEFECT 3, and the one that would have made this pass decorative.
  // scripts/lib/spine.mjs's `selfIntersects` walks `points[(i+1) % n]`: it
  // closes the list. Judging an OPEN arc with it tests the arc against a chord
  // from its last point back to its first, which for any bend crosses the arc.
  // MEASURED on the plan's own fixture: selfIntersects([[0,0],[8,0],[16,4],
  // [24,4]]) is TRUE, so the plan's fractalise halves four times, gives up, and
  // returns the clean arc — failing the plan's own `out.length > 4` assertion.
  const arc = { id: "arc-000000", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  assert.equal(selfIntersects({ points: arc.points }), true,
    "the fixture arc is no longer one the CLOSED test rejects, so this cannot fail");
  const out = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  assert.equal(out.length, 25, `three halving levels on 4 points must give 25, got ${out.length}`);
});

test("fractalise's give-up path is REACHABLE and returns the clean arc unchanged", () => {
  // A zigzag tight enough that any perpendicular displacement crosses a
  // neighbouring segment. Four attempts, then the clean arc — never a loop.
  const points = [];
  for (let i = 0; i < 24; i++) points.push([i * 0.02, i % 2 === 0 ? 0 : 0.9]);
  const arc = { id: "arc-000000", left: 0, right: -1, points };
  const out = fractalise({ arc, amplitudeKm: 40, levels: 3, stream: "d9a0051d32afab59" });
  assert.deepEqual(out, points, "the give-up path did not return the clean arc");
  assert.notEqual(out, points, "the give-up path returned the caller's own array, not a copy");
});

test("fractalise stays inside its amplitude budget", () => {
  // Every displaced midpoint is within amplitudeKm of the segment it came from,
  // and the levels halve — so no vertex can wander further than the first
  // level's amplitude from the clean arc.
  const arc = { id: "arc-000000", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  const out = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  for (const [x, y] of out) {
    let near = Infinity;
    for (let i = 0; i + 1 < arc.points.length; i++) {
      const [ax, ay] = arc.points[i], [bx, by] = arc.points[i + 1];
      const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy;
      let t = ((x - ax) * vx + (y - ay) * vy) / vv;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < near) near = d;
    }
    assert.ok(near <= 0.25 + 1e-12, `vertex (${x}, ${y}) is ${near} km off the clean arc`);
  }
});

test("GOLDEN: fractalise's output is pinned to VALUES, not to properties", () => {
  // Seam 1's lesson, applied here: determinism, endpoint preservation and an
  // amplitude bound are all satisfied by coastlines that are not this one.
  // Measured survivors these literals kill: dropping the `a = a / 2` halving
  // between levels, and displacing along the TANGENT instead of the normal —
  // both leave every property above green while moving every coast in the
  // world. Re-baselining these is a deliberate act; it means a new world.
  const arc = { id: "arc-000000", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  assert.deepEqual(fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" }), [
    [0, 0],
    [1.0029295898222725, 0.026438229636474547],
    [2.0035031287077585, -0.04717790588799746],
    [3.0024318735934172, -0.12633246666234565],
    [4, -0.22110543236395006],
    [5.000519759788963, -0.17567123894588557],
    [6.00055193424374, -0.12053771271215902],
    [7.00167870146686, -0.08353704694766079],
    [8, 0],
    [8.989244026022805, 0.5255124726354424],
    [9.974240857274145, 1.05894320322943],
    [10.929334613601391, 1.6442314974387595],
    [11.889019470879242, 2.221961058241514],
    [12.926199762110167, 2.6444728679929974],
    [13.94776622856797, 3.103451234047717],
    [14.981515571326245, 3.5342546364191487],
    [16, 4],
    [17.000393528159975, 3.970332586139882],
    [18.00121011226898, 3.9761232339355064],
    [19.001372121891507, 3.940642792791985],
    [20, 3.8748760210873736],
    [21.000437356288238, 3.9088541185835703],
    [22.001346899234452, 3.8943799413820166],
    [23.00299365972258, 3.903284530927207],
    [24, 4],
  ]);
});

test("fractalise RETRIES — the second attempt is reached and succeeds", () => {
  // The give-up test alone cannot see the retry count: its arc fails all four
  // attempts either way. This zigzag needs the ladder. MEASURED: at 0.5 km the
  // first attempt self-intersects and a later one does not, so the arc gains
  // its 73 points only because the loop runs more than once; at 1 km all four
  // attempts fail and the clean 10-point arc comes back. `attempt < 1` turns
  // the first line into the second.
  const points = [];
  for (let i = 0; i < 10; i++) points.push([i * 0.2, i % 2 === 0 ? 0 : 0.6]);
  const arc = { id: "arc-000000", left: 0, right: -1, points };
  assert.equal(fractalise({ arc, amplitudeKm: 0.5, levels: 3, stream: "d9a0051d32afab59" }).length, 73,
    "the retry ladder no longer rescues this arc");
  assert.equal(fractalise({ arc, amplitudeKm: 1, levels: 3, stream: "d9a0051d32afab59" }).length, 10,
    "four attempts no longer exhaust on this arc, so the give-up path is unproven here");
});

test("fractalise's DEFAULT levels and amplitude are the spec's 3 and 0.25 km", () => {
  // Two more recorded undeclared survivors: the defaults could be changed to
  // 2 and 0.5 with the whole suite green, because every other test passes both
  // explicitly. DP_EPSILON_KM has its own pin test; these two headline
  // constants had none.
  const arc = { id: "a1", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  assert.deepEqual(fractalise({ arc, stream: "d9a0051d32afab59" }),
                   fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" }));
  assert.notDeepEqual(fractalise({ arc, stream: "d9a0051d32afab59" }),
                      fractalise({ arc, amplitudeKm: 0.25, levels: 2, stream: "d9a0051d32afab59" }));
  assert.notDeepEqual(fractalise({ arc, stream: "d9a0051d32afab59" }),
                      fractalise({ arc, amplitudeKm: 0.5, levels: 3, stream: "d9a0051d32afab59" }));
});

test("fractalise on a DIFFERENT stream produces a different coastline", () => {
  // The determinism test above proves same-in/same-out; without this one, a
  // fractalise that ignored `stream` entirely would pass it.
  const arc = { id: "arc-000000", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  const a = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  const b = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "7c9e4a2f8b1d6e03" });
  assert.notDeepEqual(a, b, "the stream is not reaching the noise");
});

// ── the real field ─────────────────────────────────────────────────────────

test("GOLDEN: the real 800 x 800 coastline traces 13 exact rings, no holes", () => {
  // The sliver-free proof, on the world rather than on a fixture: every
  // continent's assembled ring area equals its cell census EXACTLY, and the
  // thirteen sum to the 65,600 km2 P3 selected. A tracer that split one shared
  // vertex, dropped one arc, or wound one ring backwards cannot satisfy this.
  //
  // These are golden VALUES, not properties. If a premise radius, a noise
  // frequency or the DP epsilon moves, the world moves and this is where it is
  // caught — re-baselining is a deliberate act, not a chore.
  const manifest = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const premises = readdirSync(join(ROOT, "content/world/premises"))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));
  const grid = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  // THE TERRAIN STREAM, not the world seed. See lib/seed.mjs: manifest.seed is
  // the PARENT of four named streams and the terrain field is built from the
  // child. This test passed `manifest.seed` until 2026-08-22 and so generated a
  // different world from the one seam 2 fitted the thirteen footprints to.
  const stream = terrainStream({ worldSeed: manifest.seed });
  assert.equal(stream, JSON.parse(readFileSync(join(ROOT, "content/spine/derived.json"), "utf8"))
    ["n-atlas"].resolvedSeedStreams.terrain,
    "the terrain stream is not the one committed in derived.json");
  const { maskField } = applyPremiseMasks({ grid, premises, stream });
  buildElevation({ grid, premises, maskField, stream });
  const sea = selectSeaLevelByRank({
    elev: grid.elev, targetLandCells: manifest.budget.grossLandPolygonKm2 / CELL_AREA_KM2 });
  classifySea({ grid, seaLevel: sea.seaLevel });

  // owner = the continent plate on land, -1 on sea. This is the coastline.
  const owner = new Int16Array(grid.n).fill(-1);
  let frameLand = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
    owner[i] = grid.plate[i];
    const x = i % grid.w, y = (i / grid.w) | 0;
    if (x === 0 || y === 0 || x === grid.w - 1 || y === grid.h - 1) frameLand++;
  }
  // Recorded, not asserted as a design rule: today no land reaches the frame,
  // so the corner fixtures above are the ONLY coverage the frame branches have.
  assert.equal(frameLand, 0, "land now reaches the frame — the frame arcs are live on the real field");

  const { arcs, nodes } = extractArcs({ owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  assert.equal(arcs.length, 42, "the arc census moved");
  assert.equal(nodes.length, 23, "the node census moved");

  // MAJOR 1, and the seam certified the wrong artifact. The old shape of this
  // test simplified each arc only to COUNT its vertices, threw the result away,
  // and then assembled the rings from the UNSIMPLIFIED arcs — while every one
  // of the plan's three downstream callers (plan :6208, :6229, :6380) assembles
  // from the simplified ones. So the census-exact proof was measured on a
  // polygon nothing downstream uses. Both paths are assembled here, and the
  // simplified one — the one Plan E inherits and G-TRUNK-AREA scores — carries
  // its own golden.
  //
  // Douglas-Peucker MOVES vertices, so exactness after simplification is
  // impossible by construction and the honest statement is a bounded loss, not
  // equality. Per-continent losses and the world total are pinned below.
  const simplified = arcs.map((a) => ({ ...a, points: simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM }) }));
  let before = 0, after = 0;
  for (let i = 0; i < arcs.length; i++) { before += arcs[i].points.length; after += simplified[i].points.length; }
  assert.equal(before, 7651, "the traced vertex count moved");
  assert.equal(after, 2364, "the simplified vertex count moved");

  const rawDigest = createHash("sha256"), simpDigest = createHash("sha256");
  let total = 0, ringCount = 0, simpTotal = 0;
  const losses = [];
  for (let k = 0; k < premises.length; k++) {
    const r = assembleRings({ arcs, ownerId: k });
    assert.equal(r.rings.length, 1,
      `${premises[k].id} traced ${r.rings.length} rings — a second lobe appeared`);
    assert.equal(r.holes.length, 0, `${premises[k].id} traced a hole`);
    let cells = 0;
    for (let i = 0; i < grid.n; i++) if (owner[i] === k) cells++;
    assert.equal(r.areaKm2, cells * CELL_AREA_KM2,
      `${premises[k].id}: ring ${r.areaKm2} km2 against a ${cells * CELL_AREA_KM2} km2 census — a sliver`);
    assert.ok(!selfIntersects({ points: r.rings[0] }), `${premises[k].id} self-intersects`);
    total += r.areaKm2; ringCount += r.rings.length;
    for (const [x, y] of r.rings[0]) rawDigest.update(`${x},${y};`);

    // …and the same owner off the PRODUCTION path.
    const sr = assembleRings({ arcs: simplified, ownerId: k });
    assert.equal(sr.rings.length, 1, `${premises[k].id} simplified into ${sr.rings.length} rings`);
    assert.equal(sr.holes.length, 0, `${premises[k].id} simplified into a hole`);
    assert.ok(!selfIntersects({ points: sr.rings[0] }), `${premises[k].id} self-intersects after DP`);
    simpTotal += sr.areaKm2;
    losses.push(Math.round((sr.areaKm2 - r.areaKm2) * 10000) / 10000);
    for (const [x, y] of sr.rings[0]) simpDigest.update(`${x},${y};`);
  }
  assert.equal(ringCount, 13);
  assert.equal(total, sea.landKm2, "the thirteen rings do not close on the selected land area");
  assert.equal(total, manifest.budget.grossLandPolygonKm2);

  // The number Plan E inherits: what one-shot DP at 0.35 km costs the world.
  assert.deepEqual(losses,
    [-0.625, 0.875, -2.25, -1.125, -0.625, -1.75, 0, -0.5, -0.75, -1.875, -0.75, -0.25, -0.75],
    "the per-continent simplification loss moved");
  assert.equal(Math.round((simpTotal - total) * 10000) / 10000, -10.375,
    "the world's one-shot simplification loss moved");
  assert.ok(Math.abs(simpTotal - total) / total < 0.001,
    "one-shot DP now costs more than 0.1% of the world's area");

  // RING GEOMETRY, not only its area. `cells` is recomputed from the same owner
  // array, so the per-continent equality above is self-consistent by
  // construction; these two digests are the external anchors that say the
  // coastline is in the same PLACE.
  assert.equal(rawDigest.digest("hex").slice(0, 16), "1580dde340aa7cf0");
  assert.equal(simpDigest.digest("hex").slice(0, 16), "57338706238d2578");
});
