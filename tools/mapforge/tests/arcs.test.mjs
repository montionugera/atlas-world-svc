// tools/mapforge/tests/arcs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArcs, simplifyArc, assembleRings, fractalise, DP_EPSILON_KM } from "../lib/arcs.mjs";
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
    const rings = assembleRings({ arcs, ownerId: id });
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
  const r0 = assembleRings({ arcs, ownerId: 0 })[0];
  const r1 = assembleRings({ arcs, ownerId: 1 })[0];
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
    const rings = assembleRings({ arcs, ownerId: id });
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
// the top or left frame cannot chain a closed ring. Reproduced by hand on this
// exact field before the fix: the four arcs orient [1,0]→[1,1], [1,1]→[0,1],
// [1,0]→[0,0], [0,0]→[0,1] — two arcs starting at [1,0], and the corner [0,1]
// reachable but never left — so assembleRings returns a 3-point open chain and
// the census assertion below reads 0.25 km2 against 0.25 km2 only by accident
// of the fallback. MUTATION-PROVEN: restoring either plan spelling reds this.
test("an owner in the TOP-LEFT CORNER still closes one exact ring", () => {
  const { owner, w, h } = field(3, 3, (set) => set(0, 0, 0));
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const rings = assembleRings({ arcs, ownerId: 0 });
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
  const rings = assembleRings({ arcs, ownerId: 0 });
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
  assert.deepEqual(assembleRings({ arcs, ownerId: 0 }),
    [[[0.5, 0], [0.5, 0.5], [0.5, 1], [0, 1], [0, 0.5], [0, 0]]]);
  assert.deepEqual(assembleRings({ arcs, ownerId: 1 }),
    [[[0.5, 1], [0.5, 0.5], [0.5, 0], [1, 0], [1, 0.5], [1, 1]]]);
  for (const id of [0, 1])
    assert.equal(shoelaceArea({ points: assembleRings({ arcs, ownerId: id })[0] }), 0.5);
});

// ── diagonal touch ─────────────────────────────────────────────────────────
test("a RAGGED two-owner field on the frame closes on its exact census", () => {
  // The fixture that makes the LEFT frame convention load-bearing, found by
  // sweeping 5x5 owner fields for one where the plan's spelling changes the
  // answer. It is needed because an arc takes its `left`/`right` from its FIRST
  // edge only: a mis-oriented edge in the MIDDLE of an arc is invisible, and
  // the tidy side-by-side fixture above only ever puts a top-frame edge first.
  // Here the plan's left-frame spelling splits owner 0 into five rings totalling
  // 3.5 km2 against a 3.25 km2 census — the sliver this module exists to
  // prevent, on a field with no continent in it at all.
  const f = [0, 0, 0, 0, -1, 0, 1, -1, 0, 1, 0, -1, 0, 0, -1, 1, 0, -1, 1, 1, 0, -1, 0, 0, 1];
  const owner = Int16Array.from(f);
  const { arcs } = extractArcs({ owner, w: 5, h: 5, cellKm: 0.5 });
  assert.equal(arcs.length, 25, "the fixture's arc census moved");
  for (const [id, rings_, area] of [[0, 4, 3.25], [1, 4, 1.5]]) {
    const rings = assembleRings({ arcs, ownerId: id });
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
  // MEASURED, and the answer is not the tidy one. Neither owner self-intersects
  // and both close on their exact census — but owner 0 comes back as TWO rings
  // and owner 1 as ONE ring that passes through the pinch corner twice, and
  // which of the two an owner gets is decided by nothing better than the arc id
  // that happens to sit lowest at that corner. Recorded rather than "fixed":
  //
  //  * the properties the pipeline actually needs hold either way — exact area,
  //    positive winding, no PROPER crossing (two lobes meeting at a single
  //    vertex is not one, and G-POLY's selfIntersects agrees);
  //  * routing the traversal by turn angle instead would make it symmetric, but
  //    the symmetric answer is TWO rings, and on a continent with a one-cell
  //    diagonal isthmus that would put half the landmass outside rings[0] —
  //    which is the trunk polygon. The pinch-through ring is the better world;
  //  * and on the real 800 x 800 field this is not hypothetical: 22 pinch nodes
  //    exist and all thirteen continents still trace exactly one exact ring
  //    (the golden below pins that, so a future split is caught, not silent).
  //
  // THE CONTRACT FOR CALLERS, therefore: SUM the rings for area; never assume
  // `rings.length === 1`.
  const { owner, w, h } = field(5, 5, (set) => {
    set(1, 1, 0); set(2, 2, 0); set(2, 1, 1); set(1, 2, 1);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  for (const id of [0, 1]) {
    const rings = assembleRings({ arcs, ownerId: id });
    assert.ok(rings.length >= 1, `owner ${id} produced no ring at all`);
    let area = 0;
    for (const r of rings) {
      assert.ok(!selfIntersects({ points: r }), `owner ${id} ring self-intersects — a bowtie`);
      assert.ok(shoelaceArea({ points: r }) > 0, `owner ${id} ring is wound backwards`);
      area += shoelaceArea({ points: r });
    }
    assert.equal(area, 2 * 0.25, `owner ${id} area ${area} against a 2-cell census`);
  }
  // The asymmetry itself, pinned — so that if a later change makes the
  // traversal symmetric, this test says so instead of quietly agreeing.
  assert.equal(assembleRings({ arcs, ownerId: 0 }).length, 2);
  assert.equal(assembleRings({ arcs, ownerId: 1 }).length, 1);
});

// ── holes ──────────────────────────────────────────────────────────────────
test("an enclosed owner makes TWO rings for its host, the OUTER one first", () => {
  // owner 0 fills a 5x5 block; owner 1 is the single cell at its centre. The
  // rule this pins is Task 5 Step 8's: the trunk polygon is rings[0], the outer
  // ring, and the enclosed area is carved from the fabric CENSUS, never from
  // the ring — G-POLY has no hole concept and rejects a negative ring outright.
  const { owner, w, h } = field(9, 9, (set) => {
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) set(x, y, 0);
    set(4, 4, 1);
  });
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const rings = assembleRings({ arcs, ownerId: 0 });
  assert.equal(rings.length, 2, `host produced ${rings.length} rings, not 2`);
  for (const r of rings) assert.ok(shoelaceArea({ points: r }) > 0, "G-POLY takes no negative ring");
  // LARGEST FIRST, so rings[0] is the trunk polygon.
  assert.equal(shoelaceArea({ points: rings[0] }), 25 * 0.25, "rings[0] is not the OUTER ring");
  assert.equal(shoelaceArea({ points: rings[1] }), 1 * 0.25, "rings[1] is not the hole");
  // …and the census, which is what the fabric records: 24 cells, not 25.
  let cells = 0;
  for (let i = 0; i < owner.length; i++) if (owner[i] === 0) cells++;
  assert.equal(cells, 24);
  assert.equal(shoelaceArea({ points: rings[0] }) - shoelaceArea({ points: rings[1] }), cells * 0.25,
    "outer minus hole is not the cell census — the carve rule does not close");
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
  const rings = assembleRings({ arcs, ownerId: 0 });
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
  const { maskField } = applyPremiseMasks({ grid, premises, stream: manifest.seed });
  buildElevation({ grid, premises, maskField, stream: manifest.seed });
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
  assert.equal(arcs.length, 37, "the arc census moved");
  assert.equal(nodes.length, 22, "the node census moved");

  let before = 0, after = 0;
  for (const a of arcs) {
    before += a.points.length;
    after += simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM }).length;
  }
  assert.equal(before, 7386, "the traced vertex count moved");
  assert.equal(after, 2273, "the simplified vertex count moved");

  let total = 0, ringCount = 0;
  for (let k = 0; k < premises.length; k++) {
    const rings = assembleRings({ arcs, ownerId: k });
    assert.equal(rings.length, 1,
      `${premises[k].id} traced ${rings.length} rings — a hole appeared, and the trunk polygon rule now bites`);
    let cells = 0;
    for (let i = 0; i < grid.n; i++) if (owner[i] === k) cells++;
    const area = shoelaceArea({ points: rings[0] });
    assert.equal(area, cells * CELL_AREA_KM2,
      `${premises[k].id}: ring ${area} km2 against a ${cells * CELL_AREA_KM2} km2 census — a sliver`);
    assert.ok(!selfIntersects({ points: rings[0] }), `${premises[k].id} self-intersects`);
    total += area; ringCount += rings.length;
  }
  assert.equal(ringCount, 13);
  assert.equal(total, sea.landKm2, "the thirteen rings do not close on the selected land area");
  assert.equal(total, manifest.budget.grossLandPolygonKm2);
});
