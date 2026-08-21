// F-047 seam-4 fix pass — `pathBounds` and `patternFillRect`, which shipped
// with ZERO direct tests (review A finding 1).
//
// The contract is one-sided and that is the whole point: pathBounds must return
// a SUPERSET of the true bounds. Over-covering costs pixels; under-covering
// crops a pattern fill to a hole where the map should be — and the area rule
// added in the same seam actively rewards the smaller rect, so a shrinking bug
// there scores as an improvement.
//
// Every case below therefore asserts CONTAINMENT against a numerically sampled
// truth, not equality against a remembered number. A test that pinned the
// figures pathBounds happens to produce would go green on the next wrong
// answer as soon as someone updated it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathBounds, patternFillRect } from "../lib/draft.mjs";

const FRAME = { x: 0, y: 0, w: 1000, h: 1000 };

/** Sample the true bounds of a path by flattening it, densely, in the test. */
function trueBounds(segments) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of segments)
    for (let i = 0; i <= 400; i++) {
      const [x, y] = f(i / 400);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  return { minX, minY, maxX, maxY };
}
const contains = (outer, inner) =>
  outer.minX <= inner.minX + 1e-9 &&
  outer.minY <= inner.minY + 1e-9 &&
  outer.maxX >= inner.maxX - 1e-9 &&
  outer.maxY >= inner.maxY - 1e-9;

const cubic = (p0, p1, p2, p3) => (t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};
const line = (p0, p1) => (t) => [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])];

// ── the finding, as a positive control ─────────────────────────────────────

test("THE DEFECT: a relative cubic is no longer read as absolute coordinates", () => {
  // The exact path review A built. The old regex scraped 100,100,10,0,20,10,
  // 30,10 and paired them, answering { minX: 10, minY: 0, maxX: 100,
  // maxY: 100 } for a curve that lives at x 100-130, y 100-110.
  const d = "M100,100 c10,0 20,10 30,10";
  const b = pathBounds(d);
  const truth = trueBounds([cubic([100, 100], [110, 100], [120, 110], [130, 110])]);
  assert.ok(contains(b, truth), `${JSON.stringify(b)} does not contain ${JSON.stringify(truth)}`);
  assert.ok(b.minX >= 99 && b.maxX <= 131, `${JSON.stringify(b)} is a superset but a useless one`);
});

test("THE CONSEQUENCE: the emitted rect covers the shape it is clipped to", () => {
  // The old bounds produced <rect x="8" y="0" width="94" height="102"> for a
  // shape at x 100-130 — a fill that misses its own clip entirely.
  const rect = patternFillRect({
    fill: "pRim",
    clipId: "clip-z",
    clipD: "M100,100 c10,0 20,10 30,10",
    frame: FRAME,
  });
  const num = (k) => Number(new RegExp(`${k}="([-\\d.]+)"`).exec(rect)[1]);
  assert.ok(num("x") <= 100 && num("x") + num("width") >= 130, rect);
  assert.ok(num("y") <= 100 && num("y") + num("height") >= 110, rect);
});

// ── the superset contract, command by command ──────────────────────────────

test("absolute M/L/C — the only shapes today's sheets emit — are covered exactly", () => {
  const d = "M10,20 L90,30 C100,40 110,90 60,80 Z";
  const b = pathBounds(d);
  assert.deepEqual(b, { minX: 10, minY: 20, maxX: 110, maxY: 90 });
  const truth = trueBounds([
    line([10, 20], [90, 30]),
    cubic([90, 30], [100, 40], [110, 90], [60, 80]),
    line([60, 80], [10, 20]),
  ]);
  assert.ok(contains(b, truth));
});

test("relative commands track the current point", () => {
  for (const [rel, abs] of [
    ["M10,10 l20,30 l-5,-5", "M10,10 L30,40 L25,35"],
    ["M10,10 h50 v20 h-10", "M10,10 H60 V30 H50"],
    ["M0,0 c10,10 20,20 30,30 c5,0 10,5 15,5", "M0,0 C10,10 20,20 30,30 C35,30 40,35 45,35"],
    ["M5,5 q10,20 20,0 t20,0", "M5,5 Q15,25 25,5 T45,5"],
  ]) {
    assert.deepEqual(pathBounds(rel), pathBounds(abs), rel);
  }
});

test("H and V move ONE axis — the pairing bug's other half", () => {
  // "M10,10 H200 Z" gave up (odd count) and "M0,0 V50 H100 V0 Z" gave up too,
  // but "M0,0 H100 V60 H40" scraped 0,0,100,60,40 -> odd -> null, and a
  // four-value case paired an x with a y. The parser reads the commands.
  assert.deepEqual(pathBounds("M10,10 H200 Z"), { minX: 10, minY: 10, maxX: 200, maxY: 10 });
  assert.deepEqual(pathBounds("M0,0 V50 H100 V0 Z"), { minX: 0, minY: 0, maxX: 100, maxY: 50 });
  assert.deepEqual(pathBounds("M0,0 H100 V60 H40"), { minX: 0, minY: 0, maxX: 100, maxY: 60 });
});

test("a chain of implicit repeats after one command letter is read as the spec says", () => {
  // "L20,20 30,10" is two linetos; "M0,0 5,5" is a moveto then an IMPLICIT
  // lineto, not a second moveto — so Z returns to 0,0.
  assert.deepEqual(pathBounds("M0,0 L20,20 30,10 40,50"), { minX: 0, minY: 0, maxX: 40, maxY: 50 });
  assert.deepEqual(pathBounds("M0,0 5,5 90,3"), { minX: 0, minY: 0, maxX: 90, maxY: 5 });
});

test("Z returns to the SUBPATH origin, not to the path origin", () => {
  // Two subpaths; the relative lineto after the second Z must resume from
  // 50,50, not from 0,0. A bounds that came back { 0,0,50,50 } would be
  // under-covering the last segment.
  const b = pathBounds("M0,0 L10,10 Z M50,50 L60,60 Z l20,20");
  assert.ok(b.maxX >= 70 && b.maxY >= 70, JSON.stringify(b));
});

test("S and T reflect the PREVIOUS control point", () => {
  // s/S's implicit first control is the reflection of the last one about the
  // current point, so a smooth curve can reach outside the hull of its own
  // written numbers. Sampled truth, not a remembered figure.
  const d = "M0,50 C0,0 50,0 50,50 S100,100 100,50";
  const b = pathBounds(d);
  const truth = trueBounds([
    cubic([0, 50], [0, 0], [50, 0], [50, 50]),
    cubic([50, 50], [100, 100], [100, 100], [100, 50]),
  ]);
  assert.ok(contains(b, truth), `${JSON.stringify(b)} vs ${JSON.stringify(truth)}`);
});

test("an elliptical arc is bounded without a single transcendental", () => {
  // Determinism rule: no trig on any path that reaches a committed byte. The
  // bound is the chord's box grown by 2*max(rx,ry), which is a true superset
  // because the centre is within max(r) of the start and every arc point
  // within max(r) of the centre.
  const b = pathBounds("M10,10 A5,5 0 0 1 60,60");
  assert.ok(b !== null, "an arc used to fall through to null by luck of the number count");
  assert.ok(b.minX <= 0 && b.maxX >= 70 && b.minY <= 0 && b.maxY >= 70, JSON.stringify(b));
});

test("arc FLAGS may run together with the numbers around them", () => {
  // "a5 5 0 0160 60" is rx=5 ry=5 rot=0 large=0 sweep=1 x=60 y=60. A number
  // scanner reads "0160" as one value and the whole path becomes nonsense.
  assert.deepEqual(pathBounds("M10,10 a5 5 0 0160 60"), pathBounds("M10,10 a5 5 0 0 1 60 60"));
});

test("exponent and leading-dot number forms parse", () => {
  assert.deepEqual(pathBounds("M1e1,1e1 L2e1,3e1"), { minX: 10, minY: 10, maxX: 20, maxY: 30 });
  assert.deepEqual(pathBounds("M.5,.5 L1.5,2.5"), { minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 2.5 });
});

// ── refusal: null means "fall back to the whole frame", which is always safe ──

test("anything unreadable answers null, so the caller draws the frame not a hole", () => {
  for (const d of [
    "",
    "   ",
    "10,10 L20,20", // data before any command
    "M10,10 L20", // a lineto missing its y
    "M10,10 Q1,2,3", // short parameter set
    "M10,10 X50,50", // not a path command
    "M10,10 A5,5 0 9 1 60,60", // an arc flag that is not 0 or 1
    "L10,10 L20,20", // a path that does not open with a moveto
  ])
    assert.equal(pathBounds(d), null, JSON.stringify(d));
});

// ── patternFillRect ────────────────────────────────────────────────────────

test("no clip path means the WHOLE frame, exactly as before this existed", () => {
  const rect = patternFillRect({ fill: "pRim", clipId: "c", clipD: null, frame: FRAME });
  assert.match(rect, /x="0" y="0" width="1000" height="1000"/);
  assert.match(rect, /fill="url\(#pRim\)" clip-path="url\(#c\)"/);
});

test("an UNREADABLE clip path also falls back to the whole frame", () => {
  // The failure mode that matters: a clip whose data pathBounds refuses must
  // paint everything and let the clip decide, never paint a guess.
  const rect = patternFillRect({ fill: "pRim", clipId: "c", clipD: "M10,10 L20", frame: FRAME });
  assert.match(rect, /x="0" y="0" width="1000" height="1000"/);
});

test("the rect is clamped to the frame, never outside it", () => {
  const rect = patternFillRect({
    fill: "pRim",
    clipId: "c",
    clipD: "M-500,-500 L1500,1500",
    frame: { x: 0, y: 0, w: 1000, h: 1000 },
  });
  assert.match(rect, /x="0" y="0" width="1000" height="1000"/);
});

test("a clip entirely outside the frame yields a ZERO-area rect, not a negative one", () => {
  const rect = patternFillRect({
    fill: "pRim",
    clipId: "c",
    clipD: "M2000,2000 L2100,2100",
    frame: FRAME,
  });
  assert.match(rect, /width="0" height="0"/);
});

test("opacity is emitted only when asked for", () => {
  const d = "M100,100 L200,200";
  assert.doesNotMatch(patternFillRect({ fill: "p", clipId: "c", clipD: d, frame: FRAME }), /opacity/);
  assert.match(
    patternFillRect({ fill: "p", clipId: "c", clipD: d, frame: FRAME, opacity: 0.8 }),
    /opacity="0.8"/,
  );
});

test("the rect always COVERS its clip's bounds — over any shape, never under", () => {
  const shapes = [
    "M100,100 L300,150 L200,400 Z",
    "M100,100 c10,0 20,10 30,10 c-40,60 -80,20 -30,-10",
    "M50,50 q100,200 200,0 t100,-40",
    "M20,20 h300 v200 h-120 v-90 z",
    "M400,400 A50,30 0 1 0 500,420",
    "M0.5,0.5 L999.5,999.5",
  ];
  for (const clipD of shapes) {
    const b = pathBounds(clipD);
    assert.ok(b !== null, clipD);
    const rect = patternFillRect({ fill: "p", clipId: "c", clipD, frame: FRAME });
    const num = (k) => Number(new RegExp(`${k}="([-\\d.]+)"`).exec(rect)[1]);
    // Clamped to the frame on both sides: the part of a clip that lies outside
    // the frame is not visible, so not covering it is correct, not a hole.
    const x0 = num("x"), y0 = num("y");
    assert.ok(x0 <= Math.max(b.minX, FRAME.x), `${clipD}: rect x starts at ${x0}, clip at ${b.minX}`);
    assert.ok(y0 <= Math.max(b.minY, FRAME.y), `${clipD}: rect y starts at ${y0}, clip at ${b.minY}`);
    assert.ok(x0 + num("width") >= Math.min(b.maxX, FRAME.x + FRAME.w), `${clipD}: rect ends short in x`);
    assert.ok(y0 + num("height") >= Math.min(b.maxY, FRAME.y + FRAME.h), `${clipD}: rect ends short in y`);
  }
});
