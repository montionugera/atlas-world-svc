// Plan B Task 8 — G-LABEL. The acceptance bar from spec R10 and plan-wide
// acceptance criterion 7: synthetic labels the algorithm has never seen place
// with ZERO collisions and NO hand-tuning, at 300 and at the real target of
// 340. Everything here is a function of the data alone — no measurement, no
// randomness, no clock. Nothing in this file arranges an input to succeed:
// the corpus is an integer hash spread over the frame, and the only knobs the
// tests turn are the ones a sheet turns (count, zoom tier, obstacles).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RANKS, ADVANCE_WIDTH, DEFAULT_ADVANCE, measureText, placeLabels, checkLabels,
  segHitsBox, segHitsSeg } from "../lib/labels.mjs";

const FRAME = { x: 0, y: 0, w: 1400, h: 1400 };
const LIB = fileURLToPath(new URL("../lib/labels.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

// A deterministic spread of `n` labels — integer hash, no Math.random.
function synthetic(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let h = Math.imul(i + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    const u = (h >>> 0) / 4294967296;
    let g = Math.imul(i + 7, 0xc2b2ae35); g ^= g >>> 16;
    const v = (g >>> 0) / 4294967296;
    out.push({ id: `l-${String(i).padStart(3, "0")}`,
      text: ["Gildmark", "the Drowned Stair", "Rooktide Reach", "Netstead", "Ashen Spar",
             "Quillreef", "the Meltwash", "Skerryfast"][i % 8],
      at: [40 + u * (FRAME.w - 80), 40 + v * (FRAME.h - 80)],
      rank: 3 + (i % 7) });
  }
  return out;
}
const boxesOverlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("the rank vocabulary is the ten pinned priorities in order", () => {
  assert.deepEqual(Object.entries(RANKS), [
    ["worldTitle", 0], ["ocean", 1], ["continent", 2], ["sea", 3], ["region", 4],
    ["capital", 5], ["hub", 6], ["dungeon", 7], ["namedLandform", 8], ["village", 9]]);
});

test("the advance-width table is committed, complete for ASCII, and sane", () => {
  for (let c = 32; c < 127; c++) {
    const ch = String.fromCharCode(c);
    assert.ok(typeof ADVANCE_WIDTH[ch] === "number", `no advance width for ${JSON.stringify(ch)}`);
    assert.ok(ADVANCE_WIDTH[ch] > 0 && ADVANCE_WIDTH[ch] < 1.6, ch);
  }
  assert.ok(ADVANCE_WIDTH["W"] > ADVANCE_WIDTH["i"], "W must be wider than i");
});

test("the advance-width table covers every non-ASCII mark the committed corpus uses", () => {
  // Audited against content/spine/nodes/*.json + sheet.json + sheet-atlas.json:
  // these five are the whole non-ASCII surface. An uncovered character falls
  // back to DEFAULT_ADVANCE and silently mis-sizes its box, so the set is
  // pinned here rather than left to the fallback.
  for (const ch of ["§", "—", "–", "→", "·"])
    assert.ok(typeof ADVANCE_WIDTH[ch] === "number", `no advance width for ${ch}`);
  assert.equal(typeof DEFAULT_ADVANCE, "number");
  assert.ok(DEFAULT_ADVANCE > 0 && DEFAULT_ADVANCE < 1.6);
});

test("measureText is proportional, deterministic and tracking-aware", () => {
  const a = measureText({ text: "Gildmark", size: 12 });
  assert.deepEqual(a, measureText({ text: "Gildmark", size: 12 }));
  assert.ok(a.w > 0 && a.h > 0);
  assert.ok(Math.abs(measureText({ text: "Gildmark", size: 24 }).w - a.w * 2) < 1e-9, "linear in size");
  assert.ok(measureText({ text: "WWWW", size: 12 }).w > measureText({ text: "iiii", size: 12 }).w);
  assert.ok(measureText({ text: "ab", size: 12, tracking: 2 }).w > measureText({ text: "ab", size: 12 }).w);
});

test("measureText applies tracking between characters, not after the last one", () => {
  const plain = measureText({ text: "abc", size: 10 });
  const tracked = measureText({ text: "abc", size: 10, tracking: 3 });
  assert.ok(Math.abs(tracked.w - plain.w - 6) < 1e-9, "3 chars = 2 gaps = 2 x tracking");
  assert.equal(measureText({ text: "a", size: 10, tracking: 9 }).w, measureText({ text: "a", size: 10 }).w);
  assert.equal(measureText({ text: "", size: 10, tracking: 9 }).w, 0);
});

test("ACCEPTANCE: 300 labels place with zero collisions and no hand-tuning", () => {
  const { placed, dropped } = placeLabels({
    labels: synthetic(300), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length + dropped.length, 300);
  for (let i = 0; i < placed.length; i++)
    for (let k = i + 1; k < placed.length; k++)
      assert.ok(!boxesOverlap(placed[i].box, placed[k].box),
        `${placed[i].id} x ${placed[k].id}`);
  assert.deepEqual(checkLabels({ placed, dropped, tier: 3 }), [],
    "any drop must be reported, and a drop at tier 3 is a G-LABEL failure");
});

test("ACCEPTANCE: the real target of 340 labels places with zero drops and zero collisions", () => {
  // Plan-wide acceptance criterion 7 and the Step 5 bar. Stated as a TEST, not
  // only as a one-off measurement, so a later change that regresses the drop
  // rate turns the suite red instead of a report line.
  const { placed, dropped } = placeLabels({
    labels: synthetic(340), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(dropped.length, 0, `dropped: ${dropped.map((d) => d.id).join(", ")}`);
  assert.equal(placed.length, 340);
  assert.deepEqual(checkLabels({ placed, dropped, tier: 3 }), []);
});

test("at 600 labels every label is still accounted for and every drop is reported", () => {
  // 600 is past the target density and the placer is ALLOWED to drop there.
  // What it may never do is lose a label silently, or overlap two it kept.
  const { placed, dropped } = placeLabels({
    labels: synthetic(600), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length + dropped.length, 600);
  assert.equal(new Set([...placed.map((p) => p.id), ...dropped.map((d) => d.id)]).size, 600);
  for (const d of dropped) assert.equal(typeof d.why, "string");
  const problems = checkLabels({ placed, dropped, tier: 3 });
  assert.ok(!problems.some((p) => p.includes("overlap")), problems.join("\n"));
  if (dropped.length) assert.ok(problems.some((p) => p.includes("dropped")), "a drop must be reported");
});

test("placement is a pure function of the data — same input, same output", () => {
  const a = placeLabels({ labels: synthetic(120), obstacles: [], maxLabelRank: 10, frame: FRAME });
  const b = placeLabels({ labels: synthetic(120), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(a, b);
});

test("placement is byte-identical across PROCESSES, not just across calls", () => {
  // Determinism inside one process can hide a dependency on a warm module or
  // on iteration order that happens to be stable per run. Re-derive it in a
  // fresh interpreter and compare the serialised bytes.
  const mine = JSON.stringify(placeLabels({
    labels: synthetic(120), obstacles: [], maxLabelRank: 10, frame: FRAME }));
  const src = `
    import { placeLabels } from ${JSON.stringify(LIB)};
    const FRAME = { x: 0, y: 0, w: 1400, h: 1400 };
    const TEXTS = ["Gildmark","the Drowned Stair","Rooktide Reach","Netstead","Ashen Spar","Quillreef","the Meltwash","Skerryfast"];
    const out = [];
    for (let i = 0; i < 120; i++) {
      let h = Math.imul(i + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
      let g = Math.imul(i + 7, 0xc2b2ae35); g ^= g >>> 16;
      out.push({ id: "l-" + String(i).padStart(3, "0"), text: TEXTS[i % 8],
        at: [40 + ((h >>> 0) / 4294967296) * (FRAME.w - 80), 40 + ((g >>> 0) / 4294967296) * (FRAME.h - 80)],
        rank: 3 + (i % 7) });
    }
    process.stdout.write(JSON.stringify(placeLabels({ labels: out, obstacles: [], maxLabelRank: 10, frame: FRAME })));
  `;
  const theirs = execFileSync(process.execPath, ["--input-type=module", "-e", src], { encoding: "utf8" });
  assert.equal(theirs, mine);
});

test("input order does not change the result — priority-then-id, never insertion", () => {
  const labels = synthetic(120);
  const a = placeLabels({ labels, obstacles: [], maxLabelRank: 10, frame: FRAME });
  const b = placeLabels({ labels: [...labels].reverse(), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(a, b);
});

test("placeLabels does not mutate the caller's array", () => {
  const labels = synthetic(40);
  const before = labels.map((l) => l.id);
  placeLabels({ labels, obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(labels.map((l) => l.id), before);
});

test("a higher-priority label wins its preferred position against a lower one", () => {
  const at = [700, 700];
  const { placed } = placeLabels({
    labels: [{ id: "b-low", text: "Netstead", at, rank: RANKS.village },
             { id: "a-high", text: "Gildmark", at, rank: RANKS.capital }],
    obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed[0].id, "a-high");
  assert.equal(placed[0].anchor, "NE", "the first Imhof candidate goes to the higher rank");
});

test("anchorPref moves a candidate to the front without dropping any of the eight", () => {
  const { placed } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital, anchorPref: "SW" }],
    obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed[0].anchor, "SW");
});

test("every one of the eight anchors puts its box on the side its name claims", () => {
  // `boxFor` resolves 8 anchors with two nested ternaries, which is exactly the
  // shape a wrong-side bug hides in. Drive each anchor via anchorPref in open
  // space and assert the geometric relation the compass letter promises:
  // E/W constrain x, N/S constrain y, and the two-letter anchors constrain both.
  const at = [700, 700];
  const sides = {
    NE: { x: "right", y: "above" }, NW: { x: "left", y: "above" },
    SE: { x: "right", y: "below" }, SW: { x: "left", y: "below" },
    N: { x: "centred", y: "above" }, S: { x: "centred", y: "below" },
    E: { x: "right", y: "centred" }, W: { x: "left", y: "centred" },
  };
  for (const [anchor, want] of Object.entries(sides)) {
    const { placed } = placeLabels({
      labels: [{ id: "a", text: "Gildmark", at, rank: RANKS.capital, anchorPref: anchor }],
      obstacles: [], maxLabelRank: 10, frame: FRAME });
    assert.equal(placed.length, 1, anchor);
    const b = placed[0].box;
    assert.equal(placed[0].anchor, anchor);
    if (want.x === "right") assert.ok(b.x > at[0], `${anchor}: box must start right of the point`);
    if (want.x === "left") assert.ok(b.x + b.w < at[0], `${anchor}: box must end left of the point`);
    if (want.x === "centred")
      assert.ok(Math.abs(b.x + b.w / 2 - at[0]) < 0.51, `${anchor}: box must be centred on the point`);
    if (want.y === "above") assert.ok(b.y + b.h < at[1], `${anchor}: box must end above the point`);
    if (want.y === "below") assert.ok(b.y > at[1], `${anchor}: box must start below the point`);
    if (want.y === "centred")
      assert.ok(Math.abs(b.y + b.h / 2 - at[1]) < 0.51, `${anchor}: box must straddle the point`);
  }
});

test("zoom tier: labels above maxLabelRank are neither drawn nor counted", () => {
  const labels = [
    { id: "a", text: "Galereach", at: [200, 200], rank: RANKS.ocean },
    { id: "b", text: "Netstead", at: [220, 200], rank: RANKS.village },
  ];
  const { placed, dropped } = placeLabels({ labels, obstacles: [], maxLabelRank: 3, frame: FRAME });
  assert.deepEqual(placed.map((p) => p.id), ["a"]);
  assert.deepEqual(dropped, [], "a label above the tier is out of scope, not a drop");
});

test("zoom tier: a tier boundary changes what is drawn at real density", () => {
  // The tier is the single largest lever on ink density, so prove it MOVES
  // something at scale, not only on a two-label toy.
  const labels = synthetic(300);
  const wide = placeLabels({ labels, obstacles: [], maxLabelRank: 10, frame: FRAME });
  const tight = placeLabels({ labels, obstacles: [], maxLabelRank: 5, frame: FRAME });
  const expected = labels.filter((l) => l.rank <= 5).length;
  assert.equal(tight.placed.length + tight.dropped.length, expected);
  assert.ok(tight.placed.length < wide.placed.length, "a tighter tier must draw strictly fewer labels");
  // And the boundary itself is inclusive: rank 5 in, rank 6 out.
  assert.ok(tight.placed.every((p) => labels.find((l) => l.id === p.id).rank <= 5));
  assert.ok(labels.some((l) => l.rank === 5) && labels.some((l) => l.rank === 6), "corpus straddles the boundary");
});

test("obstacles are avoided", () => {
  const obstacle = { id: "o", bbox: { x: 690, y: 660, w: 200, h: 90 } };
  const { placed } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital }],
    obstacles: [obstacle], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length, 1);
  assert.ok(!boxesOverlap(placed[0].box, obstacle.bbox));
});

test("obstacles are avoided at scale, across the collider's batch boundaries", () => {
  // The collider indexes in batches and scans a short pending tail. A batching
  // bug shows up as a box that overlaps something committed since the last
  // rebuild, so check EVERY placed box against every obstacle and every other
  // placed box, at a count that crosses several batch boundaries.
  const obstacles = [];
  for (let i = 0; i < 400; i++) {
    let h = Math.imul(i + 3, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    let g = Math.imul(i + 11, 0xc2b2ae35); g ^= g >>> 16;
    obstacles.push({ id: `g-${i}`, bbox: {
      x: ((h >>> 0) / 4294967296) * 1380, y: ((g >>> 0) / 4294967296) * 1380, w: 10, h: 10 } });
  }
  const { placed, dropped } = placeLabels({
    labels: synthetic(300), obstacles, maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length + dropped.length, 300);
  for (const p of placed) {
    for (const o of obstacles)
      assert.ok(!boxesOverlap(p.box, o.bbox), `${p.id} covers obstacle ${o.id}`);
    assert.ok(p.box.x >= FRAME.x && p.box.y >= FRAME.y, p.id);
  }
  assert.ok(!checkLabels({ placed, dropped: [], tier: 3 }).some((s) => s.includes("overlap")));
});

test("a label boxed in on all eight sides gets a leader line, then is dropped", () => {
  const wall = [];
  for (let i = 0; i < 400; i++)
    wall.push({ id: `w-${i}`, bbox: { x: 0, y: 0, w: FRAME.w, h: FRAME.h } });
  const { placed, dropped } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital }],
    obstacles: wall, maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length, 0);
  assert.deepEqual(dropped, [{ id: "a", why: "no candidate position and no clear margin for a leader" }]);
});

test("when the eight candidates fail, the margin fallback carries a leader line to the anchor", () => {
  // One obstacle sized to swallow all eight candidate boxes but leave the
  // margins clear — the fallback rung between "placed in place" and "dropped".
  const obstacle = { id: "o", bbox: { x: 560, y: 600, w: 300, h: 200 } };
  const { placed, dropped } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital }],
    obstacles: [obstacle], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(dropped, []);
  assert.equal(placed.length, 1);
  assert.ok(Array.isArray(placed[0].leader), "a margin placement must carry a leader line");
  assert.deepEqual(placed[0].leader[0], [700, 700], "the leader starts at the anchor point");
  assert.ok(!boxesOverlap(placed[0].box, obstacle.bbox));
});

test("labels never leave the frame", () => {
  const { placed } = placeLabels({
    labels: [{ id: "tl", text: "Gildmark", at: [2, 2], rank: 5 },
             { id: "br", text: "Gildmark", at: [FRAME.w - 2, FRAME.h - 2], rank: 5 }],
    obstacles: [], maxLabelRank: 10, frame: FRAME });
  for (const p of placed) {
    assert.ok(p.box.x >= FRAME.x && p.box.y >= FRAME.y, p.id);
    assert.ok(p.box.x + p.box.w <= FRAME.x + FRAME.w, p.id);
    assert.ok(p.box.y + p.box.h <= FRAME.y + FRAME.h, p.id);
  }
});

test("labels never leave a frame that is not at the origin", () => {
  const frame = { x: 300, y: 120, w: 500, h: 400 };
  const { placed, dropped } = placeLabels({
    labels: synthetic(60).map((l) => ({ ...l,
      at: [frame.x + (l.at[0] / 1400) * frame.w, frame.y + (l.at[1] / 1400) * frame.h] })),
    obstacles: [], maxLabelRank: 10, frame });
  assert.equal(placed.length + dropped.length, 60);
  for (const p of placed) {
    assert.ok(p.box.x >= frame.x && p.box.y >= frame.y, p.id);
    assert.ok(p.box.x + p.box.w <= frame.x + frame.w, p.id);
    assert.ok(p.box.y + p.box.h <= frame.y + frame.h, p.id);
  }
});

test("G-LABEL: a hard budget of 40 labels at zoom tier 1", () => {
  const placed = Array.from({ length: 41 }, (_, i) => ({ id: `l${i}`, x: i, y: 0, anchor: "NE",
    box: { x: i * 30, y: 0, w: 20, h: 10 } }));
  const problems = checkLabels({ placed, dropped: [], tier: 1, budget: 40 });
  assert.ok(problems.some((p) => p === "G-LABEL: 41 labels at zoom tier 1 > budget 40"), problems);
});

test("G-LABEL: the budget is a cap, not a target — 40 at a budget of 40 is clean", () => {
  const placed = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, x: i, y: 0, anchor: "NE",
    box: { x: i * 30, y: 0, w: 20, h: 10 } }));
  assert.deepEqual(checkLabels({ placed, dropped: [], tier: 1, budget: 40 }), []);
  assert.deepEqual(checkLabels({ placed: [...placed, { id: "x", box: { x: 9000, y: 0, w: 20, h: 10 } }],
    dropped: [], tier: 1, budget: null }), [], "a null budget skips the cap entirely");
});

test("G-LABEL: overlaps and drops each report with ids", () => {
  const placed = [
    { id: "a", x: 0, y: 0, anchor: "NE", box: { x: 0, y: 0, w: 50, h: 12 } },
    { id: "b", x: 0, y: 0, anchor: "NE", box: { x: 10, y: 2, w: 50, h: 12 } },
  ];
  const problems = checkLabels({ placed, dropped: [{ id: "c", why: "boxed in" }], tier: 2 });
  assert.ok(problems.includes("G-LABEL: 1 label boxes overlap at zoom tier 2 (a x b)"), problems);
  assert.ok(problems.includes("G-LABEL: 1 labels dropped at tier 2: c"), problems);
});

test("G-LABEL: edge-touching boxes are not an overlap, and the gate never throws", () => {
  const placed = [
    { id: "a", box: { x: 0, y: 0, w: 50, h: 12 } },
    { id: "b", box: { x: 50, y: 0, w: 50, h: 12 } },
  ];
  assert.deepEqual(checkLabels({ placed, tier: 2 }), [], "shared edge is not an overlap");
  assert.deepEqual(checkLabels({ placed: [], tier: 2 }), []);
});

// ---------------------------------------------------------------------------
// The gate's own double loop. The two-label fixture above cannot tell an O(n^2)
// scan from an adjacent-pairs-only scan, and cannot tell a full loop from one
// that skips the last element. Both mutations were GREEN before these two.
// ---------------------------------------------------------------------------
test("G-LABEL: an overlap between NON-ADJACENT labels is reported", () => {
  const placed = [
    { id: "a", box: { x: 0, y: 0, w: 50, h: 12 } },
    { id: "b", box: { x: 400, y: 400, w: 50, h: 12 } },
    { id: "c", box: { x: 800, y: 800, w: 50, h: 12 } },
    { id: "d", box: { x: 10, y: 2, w: 50, h: 12 } }, // overlaps "a", three slots away
  ];
  const problems = checkLabels({ placed, tier: 2 });
  assert.ok(problems.includes("G-LABEL: 1 label boxes overlap at zoom tier 2 (a x d)"), problems);
});

test("G-LABEL: an overlap involving the LAST placed label is reported", () => {
  const placed = [
    { id: "a", box: { x: 0, y: 0, w: 50, h: 12 } },
    { id: "b", box: { x: 400, y: 400, w: 50, h: 12 } },
    { id: "z", box: { x: 405, y: 402, w: 50, h: 12 } }, // last element, overlaps "b"
  ];
  const problems = checkLabels({ placed, tier: 2 });
  assert.ok(problems.includes("G-LABEL: 1 label boxes overlap at zoom tier 2 (b x z)"), problems);
});

// ---------------------------------------------------------------------------
// Leader lines. ADJUDICATED, not deferred: the gate owns this rule because the
// gate has the data — `placed[].leader` is two points this module emitted, and
// no stroke style can change whether the run between them passes through a
// name. See the docstring on checkLabels for the measurement that refuted the
// alternative remedy (having the placer prefer a "clear" margin side).
// ---------------------------------------------------------------------------
test("segHitsBox is a real slab clip, not a bounding-box guess", () => {
  const b = { x: 100, y: 100, w: 100, h: 100 };
  assert.equal(segHitsBox([0, 150], [300, 150], b), true, "straight through");
  assert.equal(segHitsBox([150, 150], [400, 400], b), true, "starts inside");
  assert.equal(segHitsBox([0, 0], [90, 90], b), false, "stops short");
  assert.equal(segHitsBox([0, 300], [300, 300], b), false, "parallel and clear");
  // The diagonal case a bbox-vs-bbox test gets WRONG: the segment's own bbox
  // covers the box, but the segment misses it.
  assert.equal(segHitsBox([0, 0], [400, 40], { x: 10, y: 180, w: 60, h: 60 }), false);
  assert.equal(segHitsBox([0, 0], [0, 300], { x: 0, y: 100, w: 50, h: 50 }), true, "vertical, no slope");
});

test("segHitsSeg reports proper crossings and not shared endpoints", () => {
  assert.equal(segHitsSeg([0, 0], [10, 10], [0, 10], [10, 0]), true);
  assert.equal(segHitsSeg([0, 0], [10, 0], [0, 5], [10, 5]), false, "parallel");
  assert.equal(segHitsSeg([0, 0], [10, 10], [10, 10], [20, 0]), false, "touching endpoints only");
  assert.equal(segHitsSeg([0, 0], [1, 1], [5, 5], [6, 6]), false, "collinear but disjoint");
});

test("G-LABEL: a leader line that runs through another name is a failure", () => {
  const placed = [
    { id: "a", box: { x: 600, y: 100, w: 80, h: 12 }, leader: [[620, 106], [620, 900]] },
    { id: "b", box: { x: 580, y: 500, w: 90, h: 12 } }, // squarely under a's leader
  ];
  const problems = checkLabels({ placed, tier: 2 });
  assert.ok(problems.includes("G-LABEL: 1 leader lines cross a label box at zoom tier 2 (a -> b)"), problems);
});

test("G-LABEL: a leader crossing only its OWN box is clean", () => {
  const placed = [
    { id: "a", box: { x: 600, y: 100, w: 80, h: 12 }, leader: [[640, 106], [640, 300]] },
  ];
  assert.deepEqual(checkLabels({ placed, tier: 2 }), [], "a leader always meets its own box");
});

test("G-LABEL: two leader lines that cross each other are a failure", () => {
  const placed = [
    { id: "a", box: { x: 0, y: 0, w: 10, h: 10 }, leader: [[100, 100], [300, 300]] },
    { id: "b", box: { x: 900, y: 900, w: 10, h: 10 }, leader: [[100, 300], [300, 100]] },
  ];
  const problems = checkLabels({ placed, tier: 2 });
  assert.ok(problems.includes("G-LABEL: 1 leader lines cross each other at zoom tier 2 (a x b)"), problems);
});

test("G-LABEL: a dense failure lists the count in full and the pairs in brief", () => {
  // 40 mutually overlapping boxes is 780 pairs. The COUNT is the number that
  // matters; a gate line nobody can read is a gate line nobody acts on.
  const placed = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, box: { x: 0, y: 0, w: 50, h: 12 } }));
  const [line] = checkLabels({ placed, tier: 2 });
  assert.match(line, /^G-LABEL: 780 label boxes overlap at zoom tier 2 /);
  assert.match(line, /\+770 more\)$/);
});

// ---------------------------------------------------------------------------
// The displacement ladder. Ring 1 IS the plain Imhof search; rings 2-5 are what
// keep a crowded label NEAR ITS OWN ANCHOR instead of on a leader line out to
// the frame margin. Measured at 340 labels: 12 margin leaders without the
// ladder (all 12 crossing another name), 0 with it.
// ---------------------------------------------------------------------------
test("a label whose first ring is blocked steps OUT, it does not run to the margin", () => {
  // One obstacle sized to swallow the first Imhof ring but not the fifth.
  const obstacle = { id: "o", bbox: { x: 600, y: 660, w: 200, h: 80 } };
  const at = [700, 700];
  const { placed, dropped } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at, rank: RANKS.capital }],
    obstacles: [obstacle], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(dropped, []);
  assert.equal(placed.length, 1);
  assert.equal(placed[0].leader, undefined, "a displaced label needs no leader line");
  assert.ok(!boxesOverlap(placed[0].box, obstacle.bbox));
  const b = placed[0].box;
  assert.ok(Math.abs(b.x + b.w / 2 - at[0]) < 140 && Math.abs(b.y + b.h / 2 - at[1]) < 140,
    `label ran to ${b.x},${b.y} instead of staying near its anchor`);
});

test("the ladder keeps 340 labels off leader lines entirely", () => {
  // The plan-wide criterion-7 corpus. Zero leaders means zero leader crossings,
  // which is what makes the new G-LABEL leader rules inert at the target load.
  const { placed, dropped } = placeLabels({
    labels: synthetic(340), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(dropped.length, 0);
  assert.equal(placed.filter((p) => p.leader).length, 0, "a label was pushed out to the frame margin");
  assert.deepEqual(checkLabels({ placed, dropped, tier: 3 }), []);
});

// ---------------------------------------------------------------------------
// ACCEPTANCE CRITERION 7 AT REALISTIC LOAD. Every call site the plan writes
// (Task 8 Step 5, Task 10 at plan:4382, Task 12 at plan:4901) passes
// `obstacles: []`, so the criterion as written is the obstacle-free case. But
// the sheet those tasks build carries 1,740 glyphs, and a label placed without
// consulting them overprints them. So the bar is measured HERE too, at the
// module's own stated target load, and it is met: 340 labels, 1,740 glyph
// obstacles, zero dropped.
//
// Measured, so the cost of the displacement ladder is on the record:
//                                      1 ring        5 rings (shipped)
//   this corpus, 340 labels / 1740      23 dropped    0 dropped
//   this corpus, 600 labels / 1740     113 dropped    9 dropped
//   340 x the single longest name       94 dropped   24 dropped
// The third row is a pathological corpus (every one of the 340 is the same
// 17-character name, so every box is the widest box); it is not pinned as a
// test because it is not a world, but it is the honest worst case.
// ---------------------------------------------------------------------------
test("ACCEPTANCE: 340 labels place against 1,740 glyph obstacles with zero drops", () => {
  const obstacles = [];
  for (let i = 0; i < 1740; i++) {
    let h = Math.imul(i + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    let g = Math.imul(i + 7, 0xc2b2ae35); g ^= g >>> 16;
    obstacles.push({ id: `g-${i}`, bbox: {
      x: 40 + ((h >>> 0) / 4294967296) * (FRAME.w - 80),
      y: 40 + ((g >>> 0) / 4294967296) * (FRAME.h - 80), w: 7, h: 7 } });
  }
  const { placed, dropped } = placeLabels({
    labels: synthetic(340), obstacles, maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length + dropped.length, 340, "a label was lost");
  assert.equal(new Set([...placed.map((p) => p.id), ...dropped.map((d) => d.id)]).size, 340);
  for (const d of dropped) assert.equal(typeof d.why, "string", `${d.id} dropped without a reason`);
  for (const p of placed)
    for (const o of obstacles)
      assert.ok(!boxesOverlap(p.box, o.bbox), `${p.id} covers glyph ${o.id}`);
  assert.ok(!checkLabels({ placed, dropped: [], tier: 3 }).some((s) => s.includes("overlap")),
    "two kept labels overlapped");
  assert.equal(dropped.length, 0, `dropped at target load: ${dropped.map((d) => d.id).join(", ")}`);
  // ...and the obstacles were genuinely consulted: the answer must differ from
  // the obstacle-free run, or "zero dropped" proves nothing.
  const free = placeLabels({ labels: synthetic(340), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.notDeepEqual(placed, free.placed, "the obstacle set changed nothing — it was not consulted");
});

// ---------------------------------------------------------------------------
// The placed record. A sheet builder renders these four fields; all four
// survived their own deletion before these assertions existed.
// ---------------------------------------------------------------------------
test("a placed record carries the text and the type size the sheet must render", () => {
  const { placed } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital }],
    obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed[0].text, "Gildmark", "the sheet has nothing else to print");
  assert.equal(placed[0].size, 11);
  // `y` is a TEXT BASELINE, not the box top: it sits inside the box, below it.
  const b = placed[0].box;
  assert.ok(placed[0].y > b.y && placed[0].y <= b.y + b.h, `baseline ${placed[0].y} outside box`);
  assert.ok(placed[0].y - b.y > b.h * 0.6, "the baseline must sit near the foot of the box, not its top");
});

test("the rank ladder gives a world title a larger face than a village", () => {
  const sizeOf = (rank) => placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank }],
    obstacles: [], maxLabelRank: 10, frame: FRAME }).placed[0].size;
  const ladder = [RANKS.worldTitle, RANKS.continent, RANKS.capital, RANKS.village].map(sizeOf);
  assert.deepEqual(ladder, [15, 13, 11, 9.5]);
  for (let i = 1; i < ladder.length; i++)
    assert.ok(ladder[i] < ladder[i - 1], "the size ladder must be strictly decreasing");
});

test("measureText's height IS the type size — the number every offset multiplies", () => {
  // `h` drives the candidate ladder, every collision decision and the baseline.
  // Both `size * 0.2` and a constant `4` were GREEN across the whole suite.
  for (const size of [9.5, 11, 13, 15, 40])
    assert.equal(measureText({ text: "Gildmark", size }).h, size, `h != size at ${size}`);
  assert.equal(measureText({ text: "", size: 12 }).h, 12, "an empty string still has a line height");
});

// ---------------------------------------------------------------------------
// Determinism, enforced rather than asserted in prose. `glyphs.mjs` and
// `texture-bake.mjs` each ship this scan; the same rule was stated in this
// module's header and unenforced.
// ---------------------------------------------------------------------------
test("labels.mjs reaches for no clock, no randomness and no transcendental", () => {
  // Strip comments first: the header legitimately NAMES the banned primitives
  // to say it does not use them, and a scan that reads prose as code is a scan
  // that gets worked around instead of obeyed.
  const src = readFileSync(LIB, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const banned = [
    /Math\.random/,
    /Math\.hypot/,
    /Math\.(sin|cos|tan|asin|acos|atan2?|exp|log2?|log10|pow|cbrt|sqrt)\b/,
    /\bDate\b/,
    /performance\.now/,
    /\*\*/, // exponentiation
    /require\(|node:fs|node:child_process/,
  ];
  for (const re of banned) assert.doesNotMatch(src, re, `labels.mjs uses ${re}`);
});

test("the advance-width table covers the whole non-ASCII surface of the live corpus", () => {
  // Derived from the corpus, not pinned by hand: a new place name carrying "é"
  // must redden this rather than silently mis-size its box via DEFAULT_ADVANCE.
  const files = [
    join(ROOT, "content/spine/sheet.json"),
    join(ROOT, "content/spine/sheet-atlas.json"),
    ...readdirSync(join(ROOT, "content/spine/nodes"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(ROOT, "content/spine/nodes", f)),
  ];
  const seen = new Map();
  const walk = (v) => {
    if (typeof v === "string") { for (const ch of v) if (ch.charCodeAt(0) > 126) seen.set(ch, true); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const f of files) walk(JSON.parse(readFileSync(f, "utf8")));
  assert.ok(seen.size > 0, "the corpus scan found no non-ASCII at all — it is not reading anything");
  for (const ch of seen.keys())
    assert.ok(typeof ADVANCE_WIDTH[ch] === "number",
      `the corpus uses ${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) and the table has no width for it`);
});

// ---------------------------------------------------------------------------
// Trap 6: a gate that throws skips its caller's finish() and silently drops
// every failure recorded before it. Neither entry point may throw, ever.
// ---------------------------------------------------------------------------
test("checkLabels returns problems in-band for every degenerate input, never throws", () => {
  const cases = [
    ["no argument at all", () => checkLabels()],
    ["placed missing", () => checkLabels({ tier: 1 })],
    ["placed null", () => checkLabels({ placed: null, tier: 1 })],
    ["placed not an array", () => checkLabels({ placed: "abc", tier: 1 })],
    ["a record with no box", () => checkLabels({ placed: [{ id: "a" }, { id: "b" }], tier: 1 })],
    ["a null record", () => checkLabels({ placed: [null], tier: 1 })],
    ["a box with a missing side", () => checkLabels({ placed: [{ id: "a", box: { x: 0, y: 0, w: 5 } }], tier: 1 })],
    ["dropped null", () => checkLabels({ placed: [], dropped: null, tier: 1 })],
    ["dropped records with no id", () => checkLabels({ placed: [], dropped: [{}], tier: 1 })],
    ["a malformed leader", () => checkLabels({ placed: [{ id: "a", box: { x: 0, y: 0, w: 5, h: 5 }, leader: "x" }], tier: 1 })],
  ];
  for (const [name, fn] of cases) {
    let out;
    assert.doesNotThrow(() => { out = fn(); }, `checkLabels threw on ${name}`);
    assert.ok(Array.isArray(out), `${name}: not an array`);
    assert.ok(out.every((p) => typeof p === "string"), `${name}: a problem is not a string`);
  }
  // And a malformed record is REPORTED, not quietly skipped.
  assert.ok(checkLabels({ placed: [{ id: "a" }], tier: 1 })
    .some((p) => /no usable box/.test(p)), "a boxless record vanished silently");
});

test("placeLabels returns a result for every degenerate input, never throws", () => {
  const cases = [
    ["no argument at all", () => placeLabels()],
    ["labels null", () => placeLabels({ labels: null, frame: FRAME })],
    ["no frame", () => placeLabels({ labels: synthetic(3) })],
    ["frame not a box", () => placeLabels({ labels: synthetic(3), frame: { x: 0, y: 0 } })],
    ["obstacles null", () => placeLabels({ labels: synthetic(3), obstacles: null, frame: FRAME })],
    ["an obstacle with no bbox", () => placeLabels({ labels: synthetic(3), obstacles: [{ id: "o" }], frame: FRAME })],
    ["a label with no at", () => placeLabels({ labels: [{ id: "a", text: "x", rank: 1 }], frame: FRAME })],
    ["a null label", () => placeLabels({ labels: [null], frame: FRAME })],
    ["a label with no rank", () => placeLabels({ labels: [{ id: "a", text: "x", at: [1, 1] }], frame: FRAME })],
  ];
  for (const [name, fn] of cases) {
    let out;
    assert.doesNotThrow(() => { out = fn(); }, `placeLabels threw on ${name}`);
    assert.ok(Array.isArray(out.placed) && Array.isArray(out.dropped), `${name}: wrong shape`);
  }
  // A label the placer cannot use is REPORTED as a drop, never silently lost —
  // the module's whole promise about drops.
  const bad = placeLabels({ labels: [{ id: "a", text: "x", rank: 1 }], frame: FRAME });
  assert.equal(bad.placed.length, 0);
  assert.equal(bad.dropped.length, 1);
  assert.equal(bad.dropped[0].id, "a");
  assert.match(bad.dropped[0].why, /malformed/);
  // A missing frame loses nothing either.
  const noFrame = placeLabels({ labels: synthetic(5) });
  assert.equal(noFrame.placed.length + noFrame.dropped.length, 5);
});
