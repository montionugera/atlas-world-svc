// Plan A Task 1 — scripts/lib/geometry.mjs unit tests.
//
// The exact clipper is STRICTLY MORE SENSITIVE than the lattice sampler it
// replaces: it reports sub-cell slivers that grid sampling rounds to zero.
// Every case below is therefore an assertion on an EXACT expected number,
// never on "close enough" — a tolerance here would hide the one class of
// change this swap is allowed to make.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  segmentsIntersect,
  pointInRing,
  ringsDisjoint,
  earClip,
  clipConvex,
  exactIntersectionArea,
  bboxOfPlacement,
  ringVertexCount,
  buildBBoxIndex,
  ringStructureProblem,
} from "../lib/geometry.mjs";

const poly = (points) => ({ shape: "polygon", points, anchor: points[0] });
const rect = (x, y, w, h) => ({ shape: "rect", rect: { x, y, w, h }, anchor: [x, y] });
const pt = (x, y) => ({ shape: "point", at: [x, y], anchor: [x, y] });

// Positive-shoelace unit square, x east / y south.
const UNIT = [[0, 0], [10, 0], [10, 10], [0, 10]];

test("segmentsIntersect: proper crossing", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 10], p3: [0, 10], p4: [10, 0] }), true);
});

test("segmentsIntersect: collinear overlap counts as an intersection", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [5, 0], p4: [15, 0] }), true);
});

test("segmentsIntersect: collinear but disjoint does not", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [11, 0], p4: [15, 0] }), false);
});

test("segmentsIntersect: shared endpoint counts (touching is an intersection)", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [10, 0], p4: [10, 10] }), true);
});

test("segmentsIntersect: parallel and apart does not", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [0, 1], p4: [10, 1] }), false);
});

test("pointInRing: inside, outside", () => {
  assert.equal(pointInRing({ point: [5, 5], points: UNIT }), true);
  assert.equal(pointInRing({ point: [50, 5], points: UNIT }), false);
});

test("ringsDisjoint: apart is disjoint", () => {
  assert.equal(ringsDisjoint({ a: UNIT, b: [[100, 100], [110, 100], [110, 110], [100, 110]] }), true);
});

test("ringsDisjoint: a shared edge is NOT disjoint (the degenerate case that matters)", () => {
  assert.equal(ringsDisjoint({ a: UNIT, b: [[10, 0], [20, 0], [20, 10], [10, 10]] }), false);
});

test("ringsDisjoint: fully contained with no edge crossing is NOT disjoint", () => {
  assert.equal(ringsDisjoint({ a: UNIT, b: [[2, 2], [4, 2], [4, 4], [2, 4]] }), false);
});

test("earClip: a positive square yields 2 positively-wound triangles", () => {
  const tris = earClip({ points: UNIT });
  assert.equal(tris.length, 2);
  for (const [A, B, C] of tris) {
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    assert.ok(cross > 0, `triangle ${JSON.stringify([A, B, C])} is wound backwards`);
  }
});

test("earClip: a NEGATIVE ring returns [] and never throws (G-POLY owns that failure)", () => {
  assert.deepEqual(earClip({ points: [[0, 0], [0, 10], [10, 10], [10, 0]] }), []);
});

test("earClip: a 2-point degenerate ring returns []", () => {
  assert.deepEqual(earClip({ points: [[0, 0], [1, 1]] }), []);
});

test("clipConvex: square clipped by an overlapping square", () => {
  const out = clipConvex({ subject: UNIT, clip: [[5, 5], [15, 5], [15, 15], [5, 15]] });
  assert.equal(out.length, 4);
});

test("exactIntersectionArea: identical squares give the full area", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly(UNIT) }), 100);
});

test("exactIntersectionArea: the pinned G-OVERLAP fixture twins give exactly 400", () => {
  // scripts/tests/fixtures/spine/base/spine/nodes/n-r.json, duplicated as n-r2
  // by spine-gates.test.mjs:394-411, which asserts the literal string
  // "G-OVERLAP n-r ∩ n-r2: 400.0 over limit 2.0".
  const p = poly([[20, 20], [40, 20], [40, 40], [20, 40]]);
  assert.equal(exactIntersectionArea({ a: p, b: p }).toFixed(1), "400.0");
});

test("exactIntersectionArea: a shared edge is exactly 0, not a sliver", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[10, 0], [20, 0], [20, 10], [10, 10]]) }), 0);
});

test("exactIntersectionArea: a shared corner is exactly 0", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[10, 10], [20, 10], [20, 20], [10, 20]]) }), 0);
});

test("exactIntersectionArea: disjoint is exactly 0", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[100, 100], [110, 100], [110, 110], [100, 110]]) }), 0);
});

test("exactIntersectionArea: containment gives the contained area", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[2, 2], [4, 2], [4, 4], [2, 4]]) }), 4);
});

test("exactIntersectionArea: rect x polygon", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: rect(5, 5, 10, 10) }), 25);
});

test("exactIntersectionArea: a CONCAVE L against a square (inclusion-exclusion, not double-counted)", () => {
  // L = the union of the bar x in [0,6] y in [0,2] and the bar x in [0,2] y in [0,6].
  // Square = [1,5]x[1,5]. Overlap = 4 + 4 - 1 = 7. A triangulation that
  // double-counts the shared corner reports 8 and this test is why.
  const L = poly([[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]]);
  const S = poly([[1, 1], [5, 1], [5, 5], [1, 5]]);
  assert.equal(exactIntersectionArea({ a: L, b: S }).toFixed(4), "7.0000");
});

test("exactIntersectionArea: a point placement contributes 0 in both slots", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: pt(1, 1) }), 0);
  assert.equal(exactIntersectionArea({ a: pt(1, 1), b: poly(UNIT) }), 0);
});

test("bboxOfPlacement + ringVertexCount cover all three shapes", () => {
  assert.deepEqual(bboxOfPlacement({ placement: poly(UNIT) }), { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual(bboxOfPlacement({ placement: rect(3, 4, 5, 6) }), { x: 3, y: 4, w: 5, h: 6 });
  assert.deepEqual(bboxOfPlacement({ placement: pt(7, 8) }), { x: 7, y: 8, w: 0, h: 0 });
  assert.equal(ringVertexCount({ placement: poly(UNIT) }), 4);
  assert.equal(ringVertexCount({ placement: rect(0, 0, 1, 1) }), 4);
  assert.equal(ringVertexCount({ placement: pt(0, 0) }), 0);
});

// ── Task 1 Step 9: defects found by the adversarial review, pinned ─────────

test("earClip: a ring with exactly-collinear spikes still triangulates (n-keelbreak)", () => {
  // The real committed ring content/spine/nodes/n-keelbreak.json. It walks
  // x=50 from y=58 to y=5 and back to y=21.8 — a zero-WIDTH spike whose apex
  // is exactly collinear with its neighbours. selfIntersects() passes it
  // (it tests PROPER crossings only) and its shoelace is a healthy +67091.8,
  // so G-POLY is green and the ring is legal. Ear clipping cannot consume a
  // collinear reversal, so the unguarded loop found no ear and returned [] —
  // which made exactIntersectionArea report 0 for every pair involving this
  // node, silently disabling G-OVERLAP for it. Collinear vertices are dropped
  // before clipping; that is exactly area-preserving.
  const KEELBREAK = [
    [5, 5], [5, 58], [50, 58], [50, 5], [50, 21.8], [199, 21.8], [199, 5],
    [199, 41], [183, 41], [183, 77], [199, 77], [199, 114.4], [165, 114.4],
    [165, 182.4], [199, 182.4], [199, 256.8], [181, 256.8], [181, 300.8],
    [199, 300.8], [199, 395], [5, 395],
  ];
  const tris = earClip({ points: KEELBREAK });
  assert.ok(tris.length > 0, "the ring produced no triangles at all");
  let sum = 0;
  for (const [A, B, C] of tris) {
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    assert.ok(cross > 0, `triangle ${JSON.stringify([A, B, C])} is wound backwards`);
    sum += cross / 2;
  }
  assert.equal(sum.toFixed(4), "67091.8000");
  // The under-report this defect caused, stated as the assertion that catches it.
  const placement = { shape: "polygon", points: KEELBREAK, anchor: KEELBREAK[0] };
  assert.equal(exactIntersectionArea({ a: placement, b: placement }).toFixed(1), "67091.8");
});

test("earClip: a collinear run on a convex ring does not become a zero-area triangle", () => {
  // [5,0] is redundant, not a spike. Dropping it must leave 2 real triangles
  // whose areas sum to the square's, with no degenerate slivers.
  const tris = earClip({ points: [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]] });
  let sum = 0;
  for (const [A, B, C] of tris) {
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    assert.ok(cross > 0, "a degenerate or backwards triangle survived");
    sum += cross / 2;
  }
  assert.equal(sum, 100);
});

test("earClip: a ring that visits the same point twice ADJACENTLY keeps its exact area", () => {
  // selfIntersects() passes this ring (it tests PROPER crossings only), so
  // G-POLY accepts it and the clipper must handle it. [2,1] is a real notch
  // visited twice around a zero-area spike through [6,3]. Collapsing the
  // spike is area-preserving; collapsing the NOTCH is not — 75.5 becomes 78.
  const R = [[2, 1], [6, 3], [2, 1], [0, 10], [-3, 8], [-10, 2], [-3, -1], [-2, -1], [3, -1]];
  const tris = earClip({ points: R });
  let sum = 0;
  for (const [A, B, C] of tris) {
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    assert.ok(cross > 0, "a backwards or degenerate triangle survived");
    sum += cross / 2;
  }
  assert.equal(sum, 75.5);
});

// ---------------------------------------------------------------------------
// Review regressions. G-POLY's selfIntersects() tests PROPER crossings only,
// so it accepts rings that TOUCH themselves. Ear clipping's premise is strict
// simplicity, and every defect found in review was the same premise violation
// wearing a different mask. The invariant these tests pin is one sentence:
// earClip either returns positively wound triangles whose areas sum EXACTLY
// to the ring's shoelace, or it returns nothing and exactIntersectionArea
// says so out of band. It never returns a plausible wrong number.
// ---------------------------------------------------------------------------

const shoelaceOf = (points) => {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};
const triAreaOf = ([A, B, C]) =>
  ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2;

// Every triangle positive, and the set sums to the ring's own area — or the
// set is empty. Returns the triangle count so callers can assert on it.
function assertSoundTriangulation(ring, label) {
  const tris = earClip({ points: ring });
  let sum = 0;
  for (const t of tris) {
    assert.ok(triAreaOf(t) > 0, `${label}: a backwards or degenerate triangle survived`);
    sum += triAreaOf(t);
  }
  if (tris.length) {
    const d = sum - shoelaceOf(ring);
    assert.ok(d < 1e-9 && d > -1e-9, `${label}: triangles sum ${sum}, ring is ${shoelaceOf(ring)}`);
  }
  return tris.length;
}

test("earClip: a self-touching ring never yields a NEGATIVE residual triangle", () => {
  // Review BLOCKER, geometry.mjs:151. Vertex [2,-4] sits exactly on the
  // closing edge [2,-5]->[2,1]. The residue used to be pushed with no winding
  // check, shipping a -3 triangle; clipConvex then mis-clipped it and
  // exactIntersectionArea(p, p) reported 39 against a true 38.5 — an
  // over-report is a FALSE G-OVERLAP FAIL no data change can clear.
  const R = [[2, 1], [-4, 2], [-3, -5], [-1, -7], [2, -4], [3, -5], [2, -5]];
  assert.equal(shoelaceOf(R), 38.5);
  assertSoundTriangulation(R, "residual-winding");
  const problems = [];
  const self = exactIntersectionArea({ a: poly(R), b: poly(R), problems });
  assert.ok(self === 0 || self === 38.5, `self-intersection was ${self}, never 39`);
  if (self === 0) assert.ok(problems.length > 0, "a 0 from an untriangulable ring must be signalled");
});

test("earClip: ears never overlap each other on a self-touching ring", () => {
  // Review brief item (b). This ring's triangles summed to the right 53.5 but
  // OVERLAPPED, so clipping it against itself reported 55.5.
  const R = [[-2, 5], [-3, 1], [-2, 1], [-5, 0], [-2, -2], [0, -7], [5, -2], [3, -2], [4, -3], [6, -2]];
  assert.equal(shoelaceOf(R), 53.5);
  assertSoundTriangulation(R, "overlapping-ears");
  const problems = [];
  const self = exactIntersectionArea({ a: poly(R), b: poly(R), problems });
  assert.ok(self === 0 || self === 53.5, `self-intersection was ${self}, never 55.5`);
  if (self === 0) assert.ok(problems.length > 0, "a 0 from an untriangulable ring must be signalled");
});

test("earClip: a pinched ring (a repeat at index distance > 1) keeps its exact area", () => {
  // Review BLOCKER. [2,2] is revisited from index 3. cleanRing only removes
  // EXACTLY-collinear and adjacent-duplicate vertices, so the pinch survived,
  // the inclusive ear test then blocked every candidate ear, and earClip
  // returned [] -> exactIntersectionArea 0 -> G-OVERLAP silently disabled.
  // A pinch is two lobes joined at a point and splits area-preservingly.
  const R = [[2, 2], [5, 3], [4, 3], [2, 2], [-2, 3], [-4, 0], [-7, 0], [-5, -1], [-4, -1], [3, 0]];
  assert.equal(shoelaceOf(R), 20);
  assert.ok(assertSoundTriangulation(R, "pinch") > 0, "the pinch must triangulate, not vanish");
  assert.equal(exactIntersectionArea({ a: poly(R), b: poly(R) }), 20);
});

test("exactIntersectionArea: an untriangulable ring reports 0 OUT OF BAND, never silently", () => {
  // Review BLOCKER. This pinch has a NEGATIVELY wound lobe, so no honest
  // triangulation exists — the ring doubles back on itself. Against the
  // square the grid sampler being replaced reported 20.383 (a loud
  // G-OVERLAP FAIL); the exact kernel reported 0 with no signal at all,
  // a REGRESSION from a loud fail to a silent pass. The number is still 0
  // (a gate must not throw), but the caller can now see why.
  const R = [[10, 8], [8, 4], [2, 7], [1, 0], [8, 4], [9, 7]];
  const S = [[1, 0], [6, 0], [6, 8], [1, 8]];
  assert.equal(shoelaceOf(R), 21.5);
  const problems = [];
  assert.equal(exactIntersectionArea({ a: poly(R), b: poly(S), problems }), 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ring a is not triangulable/);
  assert.deepEqual(earClip({ points: R }), []);
});

test("exactIntersectionArea: a legal overlap reports NO problem", () => {
  const problems = [];
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: rect(5, 5, 10, 10), problems }), 25);
  assert.deepEqual(problems, []);
});

test("earClip: fuzz — 4000 rings, no plausible wrong number ever escapes", () => {
  // The class-covering test the pinned cases cannot be. A seeded integer LCG
  // (deterministic, no Math.random) walks small rings, keeps the ones G-POLY
  // would accept (simple by PROPER crossing, strictly positive shoelace), and
  // asserts the one invariant: sound triangles or none. The defects above
  // were found by exactly this sweep and every one of them lands in here.
  let seed = 0x7c9e4a2f;
  const rnd = (n) => {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    return ((seed >>> 16) & 0x7fff) % n;
  };
  const properCross = (p1, p2, p3, p4) => {
    const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const o1 = o(p1, p2, p3), o2 = o(p1, p2, p4), o3 = o(p3, p4, p1), o4 = o(p3, p4, p2);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  };
  const gPolyGreen = (P) => {
    const n = P.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (properCross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return false;
      }
    return shoelaceOf(P) > 0;
  };
  let legal = 0, triangulated = 0, refused = 0;
  for (let t = 0; t < 4000; t++) {
    const n = 4 + rnd(7);
    const P = [];
    for (let i = 0; i < n; i++) P.push([rnd(9) - 4, rnd(9) - 4]);
    if (!gPolyGreen(P)) continue;
    legal++;
    if (assertSoundTriangulation(P, `fuzz ring ${JSON.stringify(P)}`) > 0) triangulated++;
    else refused++;
    const problems = [];
    const self = exactIntersectionArea({ a: poly(P), b: poly(P), problems });
    const d = self - shoelaceOf(P);
    assert.ok(
      (d < 1e-9 && d > -1e-9) || (self === 0 && problems.length > 0),
      `ring ${JSON.stringify(P)}: self-overlap ${self} vs area ${shoelaceOf(P)}, problems ${problems.length}`,
    );
  }
  assert.ok(legal > 200, `the fuzz produced only ${legal} legal rings`);
  assert.ok(triangulated > 0 && refused >= 0, `${triangulated} triangulated / ${refused} refused`);
});

test("nothing throws on malformed placements — a gate throw drops every FAIL before it", () => {
  // check_content.mjs records failures in a module-level array and prints them
  // in finish(); an uncaught throw skips finish() entirely. Every entry point
  // must degrade to 0 / [] / a zero bbox instead.
  const junk = [
    null, undefined, {}, { shape: "polygon" }, { shape: "polygon", points: [] },
    { shape: "polygon", points: [[0, 0]] }, { shape: "polygon", points: [[0, 0], [1, 1]] },
    { shape: "rect", rect: { x: 0, y: 0, w: 0, h: 0 } }, { shape: "point", at: [1, 1] },
    { shape: "point" },
  ];
  for (const a of junk) {
    assert.deepEqual(typeof bboxOfPlacement({ placement: a }), "object");
    assert.equal(typeof ringVertexCount({ placement: a }), "number");
    for (const b of junk) assert.equal(typeof exactIntersectionArea({ a, b }), "number");
    assert.equal(exactIntersectionArea({ a, b: poly(UNIT) }) >= 0, true);
  }
  assert.deepEqual(earClip({ points: [] }), []);
});

test("buildBBoxIndex: query returns every bbox-overlapping id, sorted, and no id twice", () => {
  const idx = buildBBoxIndex({
    items: [
      { id: "b", bbox: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "a", bbox: { x: 5, y: 5, w: 10, h: 10 } },
      { id: "c", bbox: { x: 100, y: 100, w: 1, h: 1 } },
    ],
  });
  assert.deepEqual(idx.query({ bbox: { x: 1, y: 1, w: 2, h: 2 } }), ["b"]);
  assert.deepEqual(idx.query({ bbox: { x: 6, y: 6, w: 1, h: 1 } }), ["a", "b"]);
  assert.deepEqual(idx.query({ bbox: { x: 500, y: 500, w: 1, h: 1 } }), []);
});

test("buildBBoxIndex: a query result is a SUPERSET of every truly intersecting pair", () => {
  // The index is only ever allowed to be conservative. A false negative here
  // silently disables G-OVERLAP for that pair, which is the one bug in this
  // library that a green gate would never reveal.
  //
  // The oracle is exactIntersectionArea, NOT a copy of the index's own
  // overlap predicate: the implementation confirms bucket hits with the same
  // strict box test, so re-deriving that test here would assert the
  // implementation against itself and could never catch a loss of
  // conservatism. Truth is "these two placements actually share area".
  const placements = [];
  for (let i = 0; i < 20; i++) placements.push({ id: `n${i}`, placement: rect(i, i % 3, 2.5, 2.5) });
  const items = placements.map(({ id, placement }) => ({ id, bbox: bboxOfPlacement({ placement }) }));
  const idx = buildBBoxIndex({ items });
  let checked = 0;
  for (const a of placements)
    for (const b of placements) {
      if (a.id === b.id) continue;
      if (exactIntersectionArea({ a: a.placement, b: b.placement }) <= 0) continue;
      checked++;
      assert.ok(
        idx.query({ bbox: bboxOfPlacement({ placement: a.placement }) }).includes(b.id),
        `${a.id} shares area with ${b.id} but the index missed it`,
      );
    }
  assert.ok(checked > 20, `only ${checked} genuinely intersecting pairs were exercised`);
});

// ── Task 3 review fix (MINOR): an unbounded probe box must TERMINATE ────────
// The cell range came straight from the caller's bbox with no clamp, so a
// world-sized probe walked ~1e9 empty columns. Reproduced before the fix: this
// exact call did not return in 15 s. Now it clamps to the index extent.
test("buildBBoxIndex: a query bbox far larger than the extent returns promptly", () => {
  const idx = buildBBoxIndex({
    items: [
      { id: "a", bbox: { x: 0, y: 0, w: 15, h: 15 } },
      { id: "b", bbox: { x: 5, y: 5, w: 10, h: 10 } },
    ],
  });
  const t0 = Date.now();
  assert.deepEqual(idx.query({ bbox: { x: -1e9, y: -1e9, w: 2e9, h: 2e9 } }), ["a", "b"]);
  assert.ok(Date.now() - t0 < 1000, "an unbounded query bbox did not clamp to the extent");
  // A probe wholly outside the extent clamps to an empty range on BOTH sides.
  assert.deepEqual(idx.query({ bbox: { x: -1e6, y: -1e6, w: 10, h: 10 } }), []);
  assert.deepEqual(idx.query({ bbox: { x: 1e6, y: 1e6, w: 10, h: 10 } }), []);
  // Malformed input degrades to "no candidates", never to a throw.
  assert.deepEqual(idx.query({ bbox: { x: NaN, y: 0, w: 1, h: 1 } }), []);
});

// ── Task 3 review fix (MINOR): duplicate ids must not lose a bbox ───────────
// `boxOf` used to be id -> ONE bbox, so a second registration under the same
// id overwrote the first and a probe overlapping only the first box was
// silently dropped — a real false negative for any caller keying on instance
// rather than node ids (Plan C's fabric census, Plan D's landform joins).
test("buildBBoxIndex: a duplicate id keeps EVERY bbox registered under it", () => {
  const idx = buildBBoxIndex({
    items: [
      { id: "dup", bbox: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "dup", bbox: { x: 90, y: 90, w: 10, h: 10 } },
      { id: "probe", bbox: { x: 5, y: 5, w: 2, h: 2 } },
    ],
  });
  // Overlaps the FIRST box registered under "dup" — the one the old code lost.
  assert.deepEqual(idx.query({ bbox: { x: 5, y: 5, w: 2, h: 2 } }), ["dup", "probe"]);
  // …and the second is still found too.
  assert.deepEqual(idx.query({ bbox: { x: 92, y: 92, w: 2, h: 2 } }), ["dup"]);
});

// ── the equivalence pre-flight, run over the REAL committed spine ──────────
// This is the proof the swap is allowed. It must pass BEFORE the call site
// changes, because exact clipping is strictly MORE sensitive than lattice
// sampling — a sub-cell sliver the sampler rounds to zero becomes visible,
// and that is the correct direction of change but it must be seen first.
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { TRUNK_NODES } from "./helpers/census.mjs";
import {
  loadSpine, buildTree, gridIntersectionArea, placementArea,
  SPINE_CELL_KM, SPINE_CELL_U,
} from "../lib/spine.mjs";
import { hashNodesDir, LOCK_REL } from "../check_geometry_lock.mjs";

const REPO = pathResolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Task 2 (F-051 completion plan, G-GEOMETRY-LOCK): the redraw took this scan's
// gridIntersectionArea calls from 1.20e8 to 2.118e10 edge tests — 492.6 s of a
// suite that otherwise runs in seconds, almost all of it inside 40 of the 138
// sibling pairs (one alone, n-galereach ∩ n-keelbreak, 110.6 s). That cost
// is a function of world geometry, not of this test file, so it regrows on
// every future redraw — see task-2-brief.md for the three cheaper options
// measured and rejected (coarsening the cell makes every overlap 0, a
// scanline reference fails the 20x floor, splitting the file saves nothing).
//
// The fix: gridIntersectionArea's result for every committed pair is now a
// baked, committed LOCK (content/spine/geometry-lock.json, written by
// `node scripts/check_geometry_lock.mjs --write`) keyed to a hash of
// content/spine/nodes. This scan reads the lock instead of recomputing it —
// but ONLY for pairs outside TIMED_PAIR_KEYS below, which still run
// gridIntersectionArea live so the 20x timing floor keeps proving something.
// exactIntersectionArea stays LIVE for every pair, exactly as before: it is
// cheap (106.5 ms total, pre-lock) and is the side of every equivalence
// assertion that must never be allowed to go stale, or a real regression in
// it would stop reddening 133 of 138 pairs.
//
// A stale lock (content/spine/nodes changed without --write) or a fixed pair
// no longer existing (a future redraw renamed/removed a timed node) throws
// here rather than silently comparing against last redraw's world — the
// separate CI step `node scripts/check_geometry_lock.mjs --check` (like
// check_render_lock.mjs / check_spine_emit.mjs) is what re-derives the whole
// lock at the cost this scan is built to avoid paying on every run.
const LOCK_PATH = join(REPO, LOCK_REL);

// A small, FIXED subset of real sibling pairs, chosen by estimated grid cost
// (bbox-overlap-area / cell^2, computed with no grid calls) to sit well below
// the 40 heavy pairs while still doing real lattice work — not the "bboxOverlap:
// 0" pairs that return in a few nanoseconds and would make the ratio noise-
// dominated. Picked 2026-08-29 on commit e1540f3 (task-2-report.md ranks all
// 138 by estimated cost). MEASURED live on this box: tGrid 1240 ms, tExact
// 11 ms — a 112x ratio, comfortably inside the 20x floor with real margin,
// and small enough (~1.2s added to a suite that used to spend 492.6s here)
// that reinstating it does not reopen the O(n^2) problem this task closes.
// All five happen to clip to exactly 0 (their true overlap is a sub-cell
// sliver even the lattice sampler's own bbox stage rejects) — irrelevant to
// what this subset proves, which is TIMING, not the pairwise verdict; the
// verdict-equivalence assertions below stay live on the FULL 138 pairs via
// the lock instead. A future redraw that removes any of these ids fails LOUD
// (see below) rather than silently timing zero pairs.
const TIMED_PAIR_KEYS = [
  "n-gildmark-roads::n-peatrun-shallows",
  "n-brightfall::n-coldreach",
  "n-reedstrand::n-thirstwold",
  "n-coldreach::n-keelbreak",
  "n-ashen-spar::n-thirstwold",
];

let SCAN = null;
function equivalenceScan() {
  if (SCAN) return SCAN;
  const spine = loadSpine({ contentRoot: join(REPO, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });

  const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  const currentHash = hashNodesDir({ repoRoot: REPO });
  if (lock.nodesHash !== currentHash) {
    throw new Error(
      `content/spine/geometry-lock.json is stale: nodesHash ${lock.nodesHash} != ${currentHash} — ` +
      "content/spine/nodes changed without a re-baseline; run `node scripts/check_geometry_lock.mjs --write`",
    );
  }

  const pairs = [];
  const parents = [];
  const timedSeen = new Set();
  let tGrid = 0, tExact = 0;
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    const cell = parent.interior?.units === "u" ? SPINE_CELL_U : SPINE_CELL_KM;
    let gridPairSum = 0, exactPairSum = 0;
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i], b = kids[j];
        const key = `${a.id}::${b.id}`;
        const timed = TIMED_PAIR_KEYS.includes(key);
        let grid;
        if (timed) {
          timedSeen.add(key);
          const t0 = process.hrtime.bigint();
          grid = gridIntersectionArea({ a: a.placement, b: b.placement, cell });
          const t1 = process.hrtime.bigint();
          tGrid += Number(t1 - t0);
        } else {
          if (!(key in lock.pairs))
            throw new Error(`content/spine/geometry-lock.json has no row for sibling pair ${key} — re-baseline with --write`);
          grid = lock.pairs[key];
        }
        let exact;
        if (timed) {
          const te0 = process.hrtime.bigint();
          exact = exactIntersectionArea({ a: a.placement, b: b.placement });
          const te1 = process.hrtime.bigint();
          tExact += Number(te1 - te0);
        } else {
          exact = exactIntersectionArea({ a: a.placement, b: b.placement });
        }
        gridPairSum += grid;
        exactPairSum += exact;
        const limit = 0.005 * Math.min(
          placementArea({ placement: a.placement }),
          placementArea({ placement: b.placement }),
        );
        pairs.push({ a, b, grid, exact, limit });
      }
    // Review fix (MINOR): G-OVERLAP has TWO verdicts and the equivalence proof
    // used to cover only the pairwise one. check_content.mjs:2170 also fails a
    // PARENT on `pairSum > 0.005 * A`, and exact clipping strictly increases
    // pairSum (0.115 -> 0.1177 on n-ashvale-front / n-emberdown), so that
    // second verdict can move without the pairwise scan noticing. Recorded per
    // parent here and asserted below.
    if (kids.length >= 2)
      parents.push({
        id: parent.id,
        limit: 0.005 * placementArea({ placement: parent.placement }),
        gridPairSum, exactPairSum,
      });
  }
  const missingTimed = TIMED_PAIR_KEYS.filter((k) => !timedSeen.has(k));
  if (missingTimed.length)
    throw new Error(
      `TIMED_PAIR_KEYS names pairs that are no longer real sibling pairs on the committed spine: ` +
      `${missingTimed.join(", ")} — this redraw needs a freshly picked timed pair-set (see task-2-report.md)`,
    );
  SCAN = { pairs, parents, tGrid, tExact };
  return SCAN;
}

// COUNT AUTHORITY: content/spine/trunk-census.json (Plan E, E-C4). The literal
// `133` that stood here was the PRE-redraw pair count, and swapping it for the
// post-redraw one would be the same defect with a newer number — the next
// redraw would have to hunt it down again. What the assertion is actually for
// is that the scan covers the WHOLE spine rather than silently going empty, so
// it now recomputes the expected number from the committed node FILES (an
// independent path from buildTree, which is the thing under test) and pins the
// node total against the census.
test("equivalence: the scan covers every non-point sibling pair on the committed spine", () => {
  const dir = join(REPO, "content/spine/nodes");
  const nodes = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
  assert.equal(nodes.length, TRUNK_NODES,
    `content/spine/nodes holds ${nodes.length}; content/spine/trunk-census.json says ${TRUNK_NODES}`);
  const kids = new Map();
  for (const n of nodes) {
    if (n.placement?.shape === "point" || !n.parentId) continue;
    kids.set(n.parentId, (kids.get(n.parentId) ?? 0) + 1);
  }
  let want = 0;
  for (const c of kids.values()) want += (c * (c - 1)) / 2;
  assert.ok(want > 0, "the committed spine has no sibling pairs at all — the scan would prove nothing");
  assert.equal(equivalenceScan().pairs.length, want,
    "buildTree's sibling pairs disagree with the committed node files");
});

test("equivalence: exact clipping agrees with grid sampling on every PAIRWISE G-OVERLAP verdict", () => {
  const disagreements = [];
  for (const { a, b, grid, exact, limit } of equivalenceScan().pairs)
    if ((grid > limit) !== (exact > limit))
      disagreements.push(`${a.id} \u2229 ${b.id}: grid ${grid} exact ${exact} limit ${limit}`);
  assert.deepEqual(disagreements, []);
});

test("equivalence: exact clipping agrees on every PARENT double-count verdict too", () => {
  const { parents } = equivalenceScan();
  const disagreements = [];
  for (const { id, limit, gridPairSum, exactPairSum } of parents)
    if ((gridPairSum > limit) !== (exactPairSum > limit))
      disagreements.push(`${id}: grid \u03a3 ${gridPairSum} exact \u03a3 ${exactPairSum} limit ${limit}`);
  assert.deepEqual(disagreements, []);
  assert.ok(parents.length >= 6, `only ${parents.length} parents carry a double-count verdict`);
});

test("equivalence: the largest numeric deviation stays under 0.01 km\u00b2", () => {
  let maxDev = 0, worst = null;
  for (const { a, b, grid, exact } of equivalenceScan().pairs) {
    const dev = Math.max(grid, exact) - Math.min(grid, exact);
    if (dev > maxDev) { maxDev = dev; worst = `${a.id} \u2229 ${b.id} grid ${grid} exact ${exact}`; }
  }
  // Measured 2026-08-16: 0.00269 km\u00b2 on n-ashvale-front \u2229 n-emberdown, two
  // orders of magnitude below the 0.5%-of-the-smaller-polygon tolerance.
  assert.ok(maxDev < 0.01, `max deviation ${maxDev} at ${worst}`);
});

test("equivalence: exact clipping is at least 20x faster, live, on the fixed TIMED_PAIR_KEYS subset", () => {
  // Task 2: this no longer times the full 138-pair scan (that was the 492.6 s
  // problem this task exists to remove \u2014 see equivalenceScan()'s header
  // comment). tGrid/tExact are now accumulated ONLY over TIMED_PAIR_KEYS,
  // where both kernels still run live on every test invocation. 20x is the
  // floor a slower CI box must still clear; below it, gridIntersectionArea is
  // not meaningfully more expensive than exactIntersectionArea and the lock
  // this task adds would be locking a distinction that no longer exists.
  const { tGrid, tExact } = equivalenceScan();
  assert.ok(tGrid / tExact > 20, `only ${(tGrid / tExact).toFixed(1)}x (grid ${tGrid / 1e6}ms exact ${tExact / 1e6}ms)`);
});

// ── the call site itself: nothing above proves WHICH kernel the gate runs ───
// Review fix (MINOR): reverting check_content.mjs:2139 to gridIntersectionArea
// left every test in this repo green — the timing assertion above benchmarks
// the two library functions directly and is indifferent to the gate, and the
// two pinned spine-gates literals (400.0 / 400.0) come out identical under both
// kernels. The 154x win and the problems-collector wiring were unguarded. This
// reads the gate's own source, so it cannot be fooled by either.
test("the G-OVERLAP call site runs the exact kernel AND passes the problems collector", () => {
  const src = readFileSync(join(REPO, "scripts/check_content.mjs"), "utf8");
  const fn = src.slice(src.indexOf("function gSpineOverlapRollup"));
  const body = fn.slice(0, fn.indexOf("\nfunction "));
  assert.match(body, /exactIntersectionArea\(\{ a: kids\[i\]\.placement, b: kids\[j\]\.placement, problems \}\)/);
  assert.doesNotMatch(body, /gridIntersectionArea\(/);
  assert.doesNotMatch(src, /import \{[^}]*\bgridIntersectionArea\b/s);
  // Task 3 review fix (MAJOR): and it walks ALL pairs. The bbox index was
  // wired in here, measured 1.239x SLOWER on the real spine (its skip set is
  // exactly stage 1's reject set, so it saves no clipping work at all), and
  // unwired again. Re-wiring it would re-buy a false-negative surface — any
  // drift between the index's confirmation predicate and stage 1 silently
  // blinds G-OVERLAP — for a saving that stays sub-millisecond against a
  // ~761 ms gate lane. Note the reason is the SAVING, not the pair count: a
  // 24-child parent of DISJOINT children measures 5-11x faster indexed, so
  // "the index can never pay at 24 children" (an earlier revision of the
  // comment at the call site) is false. See check_content.mjs's
  // gSpineOverlapRollup for the crossover table Plan C/D should inherit.
  // buildBBoxIndex itself stays exported and tested for Plan C/D.
  assert.doesNotMatch(body, /buildBBoxIndex\(/);
});

// ── the index must never be blinder than the kernel it filters for ─────────
// Kept after the Task 3 review unwired the index from gSpineOverlapRollup:
// buildBBoxIndex is still exported library surface that Plan C/D are expected
// to call, and this is the standing proof that it cannot drop a real overlap.
test("index: on the real spine, the candidate filter skips only pairs whose exact area is 0", () => {
  const spine = loadSpine({ contentRoot: join(REPO, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  let skipped = 0, skippedNonZero = [];
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    if (kids.length < 2) continue;
    const index = buildBBoxIndex({
      items: kids.map((k) => ({ id: k.id, bbox: bboxOfPlacement({ placement: k.placement }) })),
    });
    for (let i = 0; i < kids.length; i++) {
      const near = new Set(index.query({ bbox: bboxOfPlacement({ placement: kids[i].placement }) }));
      for (let j = i + 1; j < kids.length; j++) {
        if (near.has(kids[j].id)) continue;
        skipped++;
        const area = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
        if (area !== 0) skippedNonZero.push(`${kids[i].id} ∩ ${kids[j].id} = ${area}`);
      }
    }
  }
  assert.deepEqual(skippedNonZero, [], "the index skipped a pair with a real overlap");
  assert.ok(skipped > 0, "the index skipped nothing — it is not doing any work");
});

// ── Task 3 review fix (b): degenerate bboxes still register and still match ──
// A rect with w: 0 (or a ring collapsed onto a line) has a zero-extent bbox.
// The index's confirmation predicate is STRICT, so such a box never matches
// ITSELF. What matters is that it is still registered and still found by, and
// finds, a neighbour. Its exact area is 0 either way, so no verdict can move.
//
// This is also the case that proves the confirmation predicate is a strict
// SUPERSET of exactIntersectionArea's stage-1 pass rather than a copy of it:
// n0 (zero WIDTH) is confirmed against n2 here, while stage 1 rejects that
// same pair outright. The superset direction is the sound one — see the
// CONTRACT note in lib/geometry.mjs.
test("index: a zero-extent bbox still registers, and still pairs with its neighbour", () => {
  const zero = rect(5, 0, 0, 10); // zero WIDTH
  const flat = rect(0, 5, 10, 0); // zero HEIGHT
  const sq = rect(0, 0, 10, 10);
  const items = [zero, flat, sq].map((p, i) => ({ id: `n${i}`, bbox: bboxOfPlacement({ placement: p }) }));
  const idx = buildBBoxIndex({ items });
  // n0 and n1 cross at (5,5), so each finds the other AND the square; neither
  // finds itself, because a zero-extent box cannot strictly overlap itself —
  // which the gate never asks, since its inner loop starts at j = i + 1.
  assert.deepEqual(idx.query({ bbox: items[0].bbox }), ["n1", "n2"]);
  assert.deepEqual(idx.query({ bbox: items[1].bbox }), ["n0", "n2"]);
  assert.deepEqual(idx.query({ bbox: items[2].bbox }), ["n0", "n1", "n2"]);
  for (const a of [zero, flat])
    for (const b of [zero, flat, sq]) assert.equal(exactIntersectionArea({ a, b }), 0);
});

// ── Task 3 review fix (c): pairSum cannot lose a contribution ───────────────
// The parent double-count check sums exactIntersectionArea over every pair.
// A skipped pair must therefore contribute exactly 0 — asserted here as a sum
// identity over the REAL spine, which is the number the gate actually reports,
// rather than only as a per-pair predicate.
test("index: the indexed pairSum equals the all-pairs pairSum on every real parent", () => {
  const spine = loadSpine({ contentRoot: join(REPO, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  let compared = 0;
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    if (kids.length < 2) continue;
    const boxes = kids.map((k) => ({ id: k.id, bbox: bboxOfPlacement({ placement: k.placement }) }));
    const index = buildBBoxIndex({ items: boxes });
    let all = 0, indexed = 0;
    for (let i = 0; i < kids.length; i++) {
      const near = new Set(index.query({ bbox: boxes[i].bbox }));
      for (let j = i + 1; j < kids.length; j++) {
        const inter = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
        all += inter;
        if (near.has(kids[j].id)) indexed += inter;
      }
    }
    // Exact equality, not a tolerance: the skipped terms are each exactly 0,
    // so the two sums are the same float additions in the same order.
    assert.equal(indexed, all, `pairSum moved on ${parent.id}: ${indexed} vs ${all}`);
    compared++;
  }
  assert.ok(compared >= 6, `only ${compared} parents had 2+ non-point children`);
});

// ── ringStructureProblem: the per-RING hook the gate calls at G-POLY time ───
// This is the library half of G-RING-SIMPLE. The gate half is pinned in
// scripts/tests/spine-gates.test.mjs.
test("ringStructureProblem: a strictly simple ring, and a collinear-spike ring, are sound", () => {
  assert.equal(ringStructureProblem({ points: [[0, 0], [10, 0], [10, 10], [0, 10]] }), null);
  // The n-keelbreak shape: a zero-WIDTH spike walking down x=50 and straight
  // back up it. Not simple as authored, but cleanRing() drops the collinear
  // apex first — and the drop is area-preserving, so refusing this ring would
  // be a FALSE FAIL on legal committed content.
  assert.equal(ringStructureProblem({ points: [[0, 0], [50, 0], [50, 58], [50, 5], [50, 21.8], [0, 30]] }), null);
});
test("ringStructureProblem: a vertex on a non-adjacent edge is refused", () => {
  const points = [[20, 20], [80, 20], [80, 60], [50, 20], [20, 60]];
  assert.match(ringStructureProblem({ points }), /non-adjacent edges meet/);
  // …and this is exactly the ring the pair path reports 0 for, silently.
  assert.equal(earClip({ points }).length, 0);
});
// The headline finding of review round 3, and the reason this rule is
// STRUCTURAL rather than the area identity all three reviews prescribed.
test("ringStructureProblem: overlapping lobes are refused THOUGH the area identity passes", () => {
  const points = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0], [2, 2], [8, 2], [8, 8], [2, 8]];
  // triangulateOrNull's conservation check (Σ shoelace(tri) === shoelace(ring))
  // PASSES here: splitAtRepeat cuts the ring at the repeated [0,0] into two
  // lobes that cover the same ground twice, ear clipping returns 5
  // positively-wound triangles, and their areas sum to the ring's own +142 —
  // because the shoelace double-counts a doubly-wound region too. So the
  // kernel reports 142 with an EMPTY problems collector while the true covered
  // area is 58.01. An over-report is a false FAIL against an innocent sibling,
  // or a parent double-count pushed over its limit, on area that does not
  // exist. Only a structural test catches it.
  const tris = earClip({ points });
  assert.equal(tris.length, 5);
  const problems = [];
  assert.equal(
    exactIntersectionArea({ a: { shape: "polygon", points }, b: { shape: "rect", rect: { x: -1, y: -1, w: 20, h: 20 } }, problems }),
    142,
  );
  assert.equal(problems.length, 0);
  assert.match(ringStructureProblem({ points }), /non-adjacent edges meet/);
});
test("ringStructureProblem: never throws, and defers to G-POLY on rings it does not own", () => {
  assert.equal(ringStructureProblem({ points: undefined }), null);
  assert.equal(ringStructureProblem({ points: [[0, 0], [1, 1]] }), null); // < 3 points: G-POLY's rule
  assert.equal(ringStructureProblem({ points: [[0, 0], [1, 1], [2, 2]] }), null); // collapses to zero area
  assert.equal(ringStructureProblem({ points: [[0, 0], [0, 10], [10, 0]] }), null); // backwards: G-POLY's rule
});
// NEW-MINOR-shoelace: the shoelace is translated to the ring's own first
// vertex, so a legal ring far from the origin is not FALSELY refused.
test("ringStructureProblem/earClip: a small ring far from the origin is not falsely refused", () => {
  const at = (ox, oy, r) => [[ox, oy], [ox + r, oy], [ox + r, oy + r], [ox, oy + r]];
  for (const [ox, oy, r] of [[0, 0, 1e-5], [200, 200, 1e-5], [1e6, 1e6, 0.01]]) {
    const points = at(ox, oy, r);
    assert.equal(ringStructureProblem({ points }), null, `${ox},${oy},${r}`);
    assert.equal(earClip({ points }).length, 2, `${ox},${oy},${r}`);
  }
});
