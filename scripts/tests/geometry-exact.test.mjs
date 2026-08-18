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
