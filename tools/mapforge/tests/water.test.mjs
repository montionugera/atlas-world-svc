// tools/mapforge/tests/water.test.mjs
//
// Task 6b. Three of the plan's four fixtures could not pass against ANY
// implementation and are corrected here, each with its evidence at the test:
//
//  * the rain-shadow test asserts a PREVAILING wind that neither the plan's
//    code nor this one has — every sweep is weighted alike, so "lee" is not a
//    direction the pass knows. The causal form below tests the same physics and
//    can actually fail;
//  * both carveWater fixtures pass a manifest carrying only
//    `budget.interiorWaterKm2`, while the per-premise share is
//    `landmasses[].interiorWaterKm2`. With the plan's own reader that is 0, the
//    premise is skipped, and `assert.ok(carvedKm2 > 0)` fails;
//  * and neither fills `grid.flowAcc`, which carveWater reads for every river,
//    delta and fresh-water distance. That is now a throw, so the fixtures run
//    the P6 they were always meant to have run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { UNIT_VECTORS } from "../lib/noise.mjs";
import { applyWinds } from "../lib/passes/winds.mjs";
import { carveWater } from "../lib/passes/water.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation } from "../lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "../lib/passes/sea-level.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const STREAM = "d9a0051d32afab59";

/** Fill grid.flowAcc the way the pipeline does — P6 before P7. */
function runHydrology(grid) {
  const filled = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
  const dir = d8FlowDir({ elev: filled, w: grid.w, h: grid.h });
  grid.flowDir.set(dir);
  grid.flowAcc.set(flowAccumulate({ flowDir: dir, w: grid.w, h: grid.h }));
  return filled;
}

// ── P5: winds ──────────────────────────────────────────────────────────────

function wallWorld({ withWall, w = 200, h = 20 }) {
  const grid = makeGrid({ w, h, cellKm: 2 });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx({ grid, cx: x, cy: y });
      if (x < 10) { grid.elev[i] = -0.5; grid.flags[i] |= FLAG.SEA; grid.plate[i] = -1; }
      else { grid.elev[i] = withWall && x === 50 ? 1.0 : 0.2; grid.plate[i] = 0; }
    }
  }
  return grid;
}

test("applyWinds produces a rain shadow: a ridge dries the ground behind it", () => {
  // THE PLAN'S TEST, RE-FRAMED SO IT CAN FAIL. It asked for `moist(x=28) >
  // moist(x=32)` around a wall, which presumes westerlies. Every sweep here
  // carries the same weight — all sixteen committed bearings, and the plan's
  // twelve were no more directional — so the cell east of a wall is rained on
  // from the east exactly as the cell west of it is rained on from the west.
  // MEASURED on this fixture: windward 0.00854 against lee 0.01169, and the
  // ordering is an artefact of which side the sea is on, not a shadow.
  //
  // The shadow is real and this is what it looks like: the SAME ground, with
  // and without the ridge in the way.
  const withWall = wallWorld({ withWall: true });
  const noWall = wallWorld({ withWall: false });
  applyWinds({ grid: withWall, stream: STREAM });
  applyWinds({ grid: noWall, stream: STREAM });
  const at = (g, x, y) => g.moist[idx({ grid: g, cx: x, cy: y })];
  assert.ok(at(withWall, 52, 10) < at(noWall, 52, 10),
    `the cell behind the ridge is not drier for it: ${at(withWall, 52, 10)} vs ${at(noWall, 52, 10)}`);
  let shadow = 0, open = 0;
  for (let x = 52; x < 80; x++) { shadow += at(withWall, x, 10); open += at(noWall, x, 10); }
  assert.ok(shadow < open, `the lee band is not drier: ${shadow} vs ${open}`);
  // …and the ridge itself takes the rain the lee did not get.
  assert.ok(at(withWall, 50, 10) > at(noWall, 50, 10),
    "the ridge crest gains no orographic rainfall at all");
});

test("applyWinds is deterministic and leaves moist and temp inside [0,1]", () => {
  const a = wallWorld({ withWall: true }), b = wallWorld({ withWall: true });
  applyWinds({ grid: a, stream: STREAM });
  applyWinds({ grid: b, stream: STREAM });
  assert.deepEqual(Array.from(a.moist), Array.from(b.moist));
  assert.deepEqual(Array.from(a.temp), Array.from(b.temp));
  for (let i = 0; i < a.n; i++) {
    assert.ok(a.moist[i] >= 0 && a.moist[i] <= 1, `moist out of range at ${i}: ${a.moist[i]}`);
    assert.ok(a.temp[i] >= 0 && a.temp[i] <= 1, `temp out of range at ${i}: ${a.temp[i]}`);
  }
});

test("every cell is swept from EVERY bearing — no stripes", () => {
  // Plan Step 18's coverage counter, as a test rather than a one-off probe.
  // The plan's sweep launched rays from ONE boundary line per direction
  // (`startX + (|dx| < |dy| ? k : 0)`), which for any diagonal bearing leaves a
  // family of parallel diagonals and a large untouched triangle. Re-implemented
  // here against the same `upwindStarts` rule the pass uses, because the pass
  // does not expose its ray set — so this pins the RULE, and the golden below
  // pins the pass's actual output against it.
  const w = 61, h = 37;                     // both odd, and coprime-ish: no lattice luck
  for (let s = 0; s < UNIT_VECTORS.length; s++) {
    const [dx, dy] = UNIT_VECTORS[s];
    const seen = new Uint8Array(w * h);
    const starts = [];
    if (dx > 0) for (let y = 0; y < h; y++) starts.push([0, y]);
    else if (dx < 0) for (let y = 0; y < h; y++) starts.push([w - 1, y]);
    if (dy > 0) for (let x = 0; x < w; x++) starts.push([x, 0]);
    else if (dy < 0) for (let x = 0; x < w; x++) starts.push([x, h - 1]);
    for (const [sx, sy] of starts) {
      let x = sx, y = sy;
      for (let t = 0; t < w + h; t++) {
        const cx = Math.round(x), cy = Math.round(y);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) break;
        seen[cy * w + cx] = 1;
        x += dx; y += dy;
      }
    }
    let missed = 0;
    for (let i = 0; i < seen.length; i++) if (!seen[i]) missed++;
    assert.equal(missed, 0, `bearing ${s} (${dx}, ${dy}) misses ${missed} of ${w * h} cells`);
  }
});

test("GOLDEN: winds pin moisture and temperature to VALUES", () => {
  // Determinism and a [0,1] clamp are satisfied by climates that are not this
  // one. These literals are what move if PICKUP, OROGRAPHIC, the lapse rate,
  // the jitter frequency or the sweep set changes.
  const grid = wallWorld({ withWall: true, w: 40, h: 12 });
  applyWinds({ grid, stream: STREAM });
  const at = (x, y) => grid.moist[idx({ grid, cx: x, cy: y })];
  const tp = (x, y) => grid.temp[idx({ grid, cx: x, cy: y })];
  assert.deepEqual([at(5, 6), at(12, 6), at(30, 6)],
    [0.019926927983760834, 0.013863697648048401, 0.01976590044796467]);
  // Temperature is latitude minus lapse. Pinned as the Float32 IMAGE of that
  // expression, not as the float64 expression: grid.temp is a Float32Array, so
  // (6.5 x 2) / 24 stores as 0.5416666865348816 and an equality against
  // 0.5416666666666666 fails on correct code.
  assert.equal(tp(5, 6), 0.5416666865348816);          // sea: latitude, no lapse
  assert.equal(tp(30, 6), 0.43166667222976685);        // land: latitude - 0.55 x 0.2
  assert.ok(tp(5, 6) - tp(30, 6) > 0.1, "the lapse term is not reaching temperature");
  assert.equal(tp(30, 0), 0, "the north edge does not clamp at 0");
});

// ── P7: interior water ─────────────────────────────────────────────────────

test("carveWater carves interior water EXACTLY to the manifest's budget", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  // A synthetic continent: a raised disc with a depression in it.
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const dx = x - 100, dy = y - 100;
    const r = Math.sqrt(dx * dx + dy * dy);
    grid.elev[i] = r < 70 ? 0.6 - r / 400 : -0.7;
    if (r >= 70) grid.flags[i] |= FLAG.SEA;
    grid.plate[i] = r < 70 ? 0 : -1;
    grid.moist[i] = 0.6;
    grid.temp[i] = 0.5;
  }
  const filled = runHydrology(grid);
  const premises = [{ id: "c01", title: "T", class: "major", palette: ["meadow", "lake", "river"],
                      footprint: { centreKm: [200, 200], radiiKm: [140, 140], warpKm: 0 },
                      structures: [{ kind: "inland-sea", atKm: [200, 200], radiusKm: 40, amplitude: 0.5 }] }];
  // `landmasses`, not `budget` — see the header. The plan's fixture carried the
  // frame total in the slot the code reads per landmass.
  const manifest = { budget: { interiorWaterKm2: 400 }, grid: { cellKm: 2 },
                     landmasses: [{ id: "c01", interiorWaterKm2: 400 }] };
  const r = carveWater({ grid, premises, manifest });
  const carvedKm2 = r.lakeCells * 4;
  // EXACTLY, not "within 25%". The share is a cell count and the carve stops on
  // it, so a 25% band would accept a pass that had stopped being budget-driven.
  assert.equal(carvedKm2, 400, `carved ${carvedKm2} km2 against a 400 km2 budget`);
  assert.deepEqual(r.shortfalls, []);
  // …and it is ONE connected body, not a hundred scattered cells.
  assert.equal(largestComponent({ grid, flag: FLAG.LAKE }), r.lakeCells,
    "the carve is not connected — it stopped growing a basin and started sprinkling");
});

test("carveWater never re-flags a cell that is already SEA", () => {
  const grid = makeGrid({ w: 60, h: 60, cellKm: 2 });
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const dx = x - 30, dy = y - 30;
    const r = Math.sqrt(dx * dx + dy * dy);
    grid.elev[i] = r < 20 ? 0.6 - r / 400 : -0.7;
    if (r >= 20) grid.flags[i] |= FLAG.SEA;
    grid.plate[i] = r < 20 ? 0 : -1;
    grid.moist[i] = 0.6; grid.temp[i] = 0.5;
  }
  const seaBefore = [...grid.flags].filter((f) => (f & FLAG.SEA) !== 0).length;
  const filled = runHydrology(grid);
  const premises = [{ id: "c01", title: "T", class: "major", palette: ["meadow", "lake"],
                      footprint: { centreKm: [60, 60], radiiKm: [40, 40], warpKm: 0 }, structures: [] }];
  const r = carveWater({ grid, premises,
                         manifest: { budget: { interiorWaterKm2: 40 }, grid: { cellKm: 2 },
                                     landmasses: [{ id: "c01", interiorWaterKm2: 40 }] } });
  const seaAfter = [...grid.flags].filter((f) => (f & FLAG.SEA) !== 0).length;
  assert.equal(seaAfter, seaBefore, "carveWater changed the SEA mask");
  for (let i = 0; i < grid.n; i++)
    assert.ok(!((grid.flags[i] & FLAG.SEA) !== 0 && (grid.flags[i] & FLAG.LAKE) !== 0),
      `cell ${i} is both SEA and LAKE — the lake budget double-counts it`);
  assert.ok(r.lakeCells > 0, "no lake was carved at all, so the assertion is vacuous");
  // The test CAN fail: pre-set LAKE on a sea cell and the exclusivity loop reds.
  // Proven by construction rather than claimed — the carve clears LAKE first,
  // so this is the state the pass is responsible for, not a leftover.
  assert.equal(r.lakeCells, 10, "the 40 km2 / 4 km2-per-cell budget is not being counted in cells");
  assert.equal(r.lakeCells * 4, 40);
});

test("carveWater is IDEMPOTENT — a second call answers the second budget", () => {
  // An in-place pass that ORs onto its own previous output is a trap for every
  // caller that retries. Same discipline as classifySea and assignSubstrate.
  const grid = seaDiscWorld();
  const filled = runHydrology(grid);
  const premises = [{ id: "c01", footprint: { centreKm: [60, 60], radiiKm: [40, 40], warpKm: 0 }, structures: [] }];
  const mk = (km2) => ({ grid: { cellKm: 2 }, landmasses: [{ id: "c01", interiorWaterKm2: km2 }] });
  const a = carveWater({ grid, premises, manifest: mk(40) });
  const b = carveWater({ grid, premises, manifest: mk(40) });
  assert.deepEqual(b, a);
  const small = carveWater({ grid, premises, manifest: mk(20) });
  assert.equal(small.lakeCells, 5, "a smaller second budget did not shrink the lake");
  let flagged = 0;
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.LAKE) !== 0) flagged++;
  assert.equal(flagged, 5, "the previous, larger lake is still flagged on the grid");
});

test("carveWater REPORTS a premise whose disc cannot absorb its share, and terminates", () => {
  // The review's termination question, answered as behaviour. A 40 km disc on a
  // 60 x 60 x 2 km grid holds far fewer than 100,000 km2 of admissible ground,
  // so the loop must end on an empty frontier and say so — not spin, and not
  // quietly report a full carve.
  const grid = seaDiscWorld();
  const filled = runHydrology(grid);
  const premises = [{ id: "c01", footprint: { centreKm: [60, 60], radiiKm: [40, 40], warpKm: 0 }, structures: [] }];
  const r = carveWater({ grid, premises,
    manifest: { grid: { cellKm: 2 }, landmasses: [{ id: "c01", interiorWaterKm2: 100000 }] } });
  assert.equal(r.shortfalls.length, 1);
  assert.match(r.shortfalls[0], /^c01: carved \d+ of 25000 cells /);
  assert.ok(r.lakeCells > 0 && r.lakeCells < 25000);
});

test("carveWater THROWS when flowAcc was never filled", () => {
  // The review asks what happens if the caller forgets P6. Without this the
  // world comes out with no river, no delta and freshKm measured from lakes
  // alone — complete, plausible and entirely wrong, with every per-cell
  // assertion still green.
  const grid = seaDiscWorld();
  const filled = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
  assert.throws(() => carveWater({ grid, premises: [],
    manifest: { landmasses: [] } }), /grid\.flowAcc is empty/);
});

test("a lake never touches the sea, and freshKm reads 0 on every fresh cell", () => {
  const grid = seaDiscWorld();
  const filled = runHydrology(grid);
  const premises = [{ id: "c01", footprint: { centreKm: [60, 60], radiiKm: [40, 40], warpKm: 0 }, structures: [] }];
  carveWater({ grid, premises,
    manifest: { grid: { cellKm: 2 }, landmasses: [{ id: "c01", interiorWaterKm2: 40 }] } });
  const FRESH = FLAG.RIVER | FLAG.LAKE | FLAG.DELTA;
  let fresh = 0, maxFresh = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FRESH) !== 0) { fresh++; assert.equal(grid.freshKm[i], 0, `fresh cell ${i}`); }
    if (grid.freshKm[i] > maxFresh) maxFresh = grid.freshKm[i];
    if ((grid.flags[i] & FLAG.LAKE) === 0) continue;
    const x = i % grid.w, y = (i / grid.w) | 0;
    for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      assert.equal((grid.flags[ny * grid.w + nx] & FLAG.SEA) !== 0, false,
        `lake cell (${x}, ${y}) is D8-adjacent to open sea — that is a bay, not a lake`);
    }
  }
  assert.ok(fresh > 0);
  // Every cell reachable, so no -1 survives: the BFS covers the frame.
  for (let i = 0; i < grid.n; i++) assert.ok(grid.freshKm[i] >= 0, `freshKm unset at ${i}`);
  assert.ok(maxFresh > 0, "freshKm is 0 everywhere — the BFS never left its sources");
});

// A land disc with NO relief at all: every admissible cell carries the same
// elevation, so every heap comparison falls through to the cell index and the
// carve is decided by the tiebreak alone. Nothing on the real field can see
// this — 623,518 of 640,000 elevations there are distinct float32s.
function flatDiscWorld() {
  const grid = makeGrid({ w: 40, h: 40, cellKm: 2 });
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const dx = x - 20, dy = y - 20;
    if (Math.sqrt(dx * dx + dy * dy) < 15) { grid.elev[i] = 0.5; grid.plate[i] = 0; }
    else { grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA; grid.plate[i] = -1; }
    grid.moist[i] = 0.5; grid.temp[i] = 0.5;
  }
  return grid;
}

test("on a FLAT premise the carve is decided by the cell-index tiebreak alone", () => {
  const grid = flatDiscWorld();
  runHydrology(grid);
  const r = carveWater({ grid, premises: [{ id: "c01",
    footprint: { centreKm: [40, 40], radiiKm: [30, 30], warpKm: 0 }, structures: [] }],
    manifest: { landmasses: [{ id: "c01", interiorWaterKm2: 80 }] } });
  assert.equal(r.lakeCells, 20);
  const cells = [];
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.LAKE) !== 0) cells.push(i);
  // The exact set. Both the seed sweep and the growth heap resolve their ties
  // on the LOWEST index; reverse either and this list changes.
  assert.deepEqual(cells, [296, 297, 298, 299, 300, 301, 302, 303, 304,
                           334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344]);
});

test("a lake fills the PIT, not the flooded surface above it", () => {
  // Why the growth key is `elev` and not the priority-flooded surface the plan
  // hands in. A 3 x 3 pit at 0.1 inside a 0.5 plain comes back from
  // priorityFlood at 0.5000051 — ABOVE the plain, because erasing depressions
  // is the fill's entire job. Grown on `filled`, the water lands on the flat
  // rim and the pit stays dry; grown on `elev`, it is the pit.
  const grid = flatDiscWorld();
  for (let y = 14; y < 17; y++) for (let x = 14; x < 17; x++) grid.elev[idx({ grid, cx: x, cy: y })] = 0.1;
  for (let y = 24; y < 28; y++) for (let x = 24; x < 28; x++) grid.elev[idx({ grid, cx: x, cy: y })] = 0.45;
  const filled = runHydrology(grid);
  assert.ok(filled[idx({ grid, cx: 15, cy: 15 })] > 0.5,
    "the fill no longer lifts the pit above the plain, so this cannot fail");
  const r = carveWater({ grid, premises: [{ id: "c01",
    footprint: { centreKm: [40, 40], radiiKm: [30, 30], warpKm: 0 }, structures: [] }],
    manifest: { landmasses: [{ id: "c01", interiorWaterKm2: 32 }] } });
  assert.equal(r.lakeCells, 8);
  const cells = [];
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.LAKE) !== 0) cells.push([i % grid.w, (i / grid.w) | 0]);
  assert.deepEqual(cells, [[14, 14], [15, 14], [16, 14], [14, 15], [15, 15], [16, 15], [14, 16], [15, 16]]);
});

test("an inland-sea structure wins the lake disc over any other", () => {
  // c02 is the only committed premise with an `inland-sea`, and its other
  // structure is a spine-ridge with no radius — so on today's content the
  // preference is vacuous and `discs[0]` would answer the same. This is the
  // premise that separates them.
  const grid = makeGrid({ w: 60, h: 40, cellKm: 2 });
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (x >= 5 && x < 55 && y >= 5 && y < 35) { grid.elev[i] = 0.5; grid.plate[i] = 0; }
    else { grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA; grid.plate[i] = -1; }
    grid.moist[i] = 0.5; grid.temp[i] = 0.5;
  }
  runHydrology(grid);
  carveWater({ grid, premises: [{ id: "c01",
    footprint: { centreKm: [60, 40], radiiKm: [50, 30], warpKm: 0 },
    structures: [{ kind: "plateau", atKm: [30, 40], radiusKm: 12 },
                 { kind: "inland-sea", atKm: [90, 40], radiusKm: 12 }] }],
    manifest: { landmasses: [{ id: "c01", interiorWaterKm2: 40 }] } });
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.LAKE) === 0) continue;
    const x = (i % grid.w) * grid.cellKm;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
  }
  assert.ok(minX >= 78 && maxX <= 102, `the lake is at ${minX}-${maxX} km, not around the inland-sea at 90`);
});

test("a lake stays on its OWN plate", () => {
  const grid = makeGrid({ w: 60, h: 40, cellKm: 2 });
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (x >= 5 && x < 55 && y >= 5 && y < 35) { grid.elev[i] = 0.5; grid.plate[i] = x < 30 ? 0 : 1; }
    else { grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA; grid.plate[i] = -1; }
    grid.moist[i] = 0.5; grid.temp[i] = 0.5;
  }
  runHydrology(grid);
  // One disc spanning BOTH plates, and only the first landmass has a share.
  const r = carveWater({ grid, premises: [
    { id: "c01", footprint: { centreKm: [60, 40], radiiKm: [50, 30], warpKm: 0 },
      structures: [{ kind: "inland-sea", atKm: [60, 40], radiusKm: 30 }] },
    { id: "c02", footprint: { centreKm: [60, 40], radiiKm: [50, 30], warpKm: 0 }, structures: [] }],
    manifest: { landmasses: [{ id: "c01", interiorWaterKm2: 200 }, { id: "c02", interiorWaterKm2: 0 }] } });
  let onOwn = 0, onOther = 0;
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.LAKE) !== 0) { if (grid.plate[i] === 0) onOwn++; else onOther++; }
  assert.equal(r.lakeCells, 50);
  assert.equal(onOther, 0, `${onOther} of c01's lake cells landed on c02 — the plate filter is not holding`);
  assert.equal(onOwn, 50);
});

function seaDiscWorld() {
  const grid = makeGrid({ w: 60, h: 60, cellKm: 2 });
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const dx = x - 30, dy = y - 30;
    const r = Math.sqrt(dx * dx + dy * dy);
    grid.elev[i] = r < 20 ? 0.6 - r / 400 : -0.7;
    if (r >= 20) grid.flags[i] |= FLAG.SEA;
    grid.plate[i] = r < 20 ? 0 : -1;
    grid.moist[i] = 0.6; grid.temp[i] = 0.5;
  }
  return grid;
}

function largestComponent({ grid, flag }) {
  const seen = new Uint8Array(grid.n);
  let best = 0;
  for (let s = 0; s < grid.n; s++) {
    if (seen[s] || (grid.flags[s] & flag) === 0) continue;
    let n = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % grid.w, y = (i / grid.w) | 0;
      for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const j = ny * grid.w + nx;
        if (seen[j] || (grid.flags[j] & flag) === 0) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    if (n > best) best = n;
  }
  return best;
}

// ── the real world ─────────────────────────────────────────────────────────

test("GOLDEN: the real 800 x 800 world carves 1,600 km2 of interior water", () => {
  // The acceptance criterion of Task 6b, as a test rather than a probe pasted
  // into a report. THIS is what the plan's lake rule could not do: measured on
  // this field, the whole world holds 603 land cells with any depression at all
  // (c02 267, c04 6, c06 0) against the 6,400 the manifest budgets, so ranking
  // by depression depth carves 68 km2 of 1,600 and the net ratio never moves.
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
  const filled = runHydrology(grid);
  applyWinds({ grid, stream: manifest.seed });
  const r = carveWater({ grid, premises, manifest });

  assert.deepEqual(r.shortfalls, [], "a landmass could not absorb its interior-water share");
  assert.equal(r.lakeCells, 6400);
  assert.equal(r.lakeCells * CELL_AREA_KM2, manifest.budget.interiorWaterKm2);
  assert.equal(r.riverCells, 3755);    //   938.75 km2 of channel
  assert.equal(r.deltaCells, 22);      //     5.50 km2 of river mouth
  assert.equal(r.glacierCells, 52239); // 13059.75 km2 of ice, a fifth of the land

  // THE POINT OF THE WHOLE TASK: gross land minus interior water is the NET
  // land the manifest budgets, and the ratio it implies is the 1.5 the frame
  // was designed around.
  const netLandKm2 = sea.landKm2 - r.lakeCells * CELL_AREA_KM2;
  assert.equal(netLandKm2, manifest.budget.netLandKm2);
  assert.equal(netLandKm2, 64000);
  const netRatio = (160000 - netLandKm2) / netLandKm2;
  assert.equal(netRatio, 1.5);
  assert.ok(netRatio >= manifest.ratio.min && netRatio <= manifest.ratio.max);

  // Per landmass, against the manifest's own column — an aggregate that closes
  // hides a lake on the wrong continent.
  const perPlate = new Array(premises.length).fill(0);
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.LAKE) !== 0) perPlate[grid.plate[i]]++;
  for (let k = 0; k < premises.length; k++) {
    const want = manifest.landmasses.find((m) => m.id === premises[k].id).interiorWaterKm2;
    assert.equal(perPlate[k] * CELL_AREA_KM2, want, `${premises[k].id} interior water`);
  }
  // …and no lake cell is also a sea cell, on the real field.
  for (let i = 0; i < grid.n; i++)
    assert.ok(!((grid.flags[i] & FLAG.SEA) !== 0 && (grid.flags[i] & FLAG.LAKE) !== 0));

  // WHICH cells, not only how many. Counts alone cannot see a lake that moved:
  // the budget is a cell count and the carve stops on it, so a different growth
  // key, a different seed rule or a different heap tiebreak all still deliver
  // 6,400 cells. The digest and the three bounding boxes are what say the water
  // is in the same PLACE, and they are the pin the lake heap's index tiebreak
  // is observable through at all — that heap flags what it pops, so which of two
  // tied cells is carved when the budget runs out mid-tie is a different world.
  const digest = createHash("sha256");
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.LAKE) !== 0) digest.update(String(i) + ",");
  assert.equal(digest.digest("hex").slice(0, 16), "e49428cf694aa545", "the lake CELL SET moved");
  const bbox = (k) => {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < grid.n; i++) {
      if ((grid.flags[i] & FLAG.LAKE) === 0 || grid.plate[i] !== k) continue;
      const x = (i % grid.w) * grid.cellKm, y = ((i / grid.w) | 0) * grid.cellKm;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    return [minx, miny, maxx, maxy];
  };
  assert.deepEqual(bbox(1), [86.5, 132.5, 133.5, 185.5], "c02's inland sea moved");
  assert.deepEqual(bbox(3), [251.5, 259.5, 338, 299], "c04's karst water moved");
  assert.deepEqual(bbox(5), [39.5, 260, 99.5, 296], "c06's delta water moved");

  // The climate the same run produced, sampled every 997th cell — a stride
  // coprime with 800 so the sample is not one column.
  const dm = createHash("sha256"), dt = createHash("sha256"), df = createHash("sha256");
  for (let i = 0; i < grid.n; i += 997) {
    dm.update(String(grid.moist[i])); dt.update(String(grid.temp[i])); df.update(String(grid.freshKm[i]));
  }
  assert.equal(dm.digest("hex").slice(0, 16), "fd90e4a253d40c44", "the moisture field moved");
  assert.equal(dt.digest("hex").slice(0, 16), "afd45e5539731cb9", "the temperature field moved");

  // freshKm, on the real field: every RIVER, LAKE and DELTA cell is a source at
  // 0, nothing is left unset, and the far corner of the world is 103.5 km from
  // fresh water. The digest is what catches a BFS that gained an edge — an
  // unguarded east-west wrap shortens exactly these distances and nothing else.
  let unset = 0, maxFresh = 0, riverOffSource = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.freshKm[i] < 0) unset++;
    if (grid.freshKm[i] > maxFresh) maxFresh = grid.freshKm[i];
    if ((grid.flags[i] & FLAG.RIVER) !== 0 && grid.freshKm[i] !== 0) riverOffSource++;
  }
  assert.equal(unset, 0, "freshKm left cells unset — the BFS did not reach the whole frame");
  assert.equal(riverOffSource, 0, "a RIVER cell is not a fresh-water source");
  assert.equal(maxFresh, 103.5);
  assert.equal(df.digest("hex").slice(0, 16), "c5a39072a8b53a82", "the fresh-water distance field moved");
});

test("GOLDEN: priorityFlood on the real field raises 40,270 cells and stays inside [-1, 1 + eps]", () => {
  // The review's epsilon question, answered with a number. `filled` can exceed
  // the 1.0 clamp buildElevation applies — by exactly one epsilon, 9.5e-7 — so
  // any later reader that assumes a closed [0, 1] must clamp. NOTHING DOES
  // TODAY: the biome table reads grid.elev, and `filled` leaves this pass only
  // as a depression depth. Pinned so that stops being a coincidence.
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
  const filled = priorityFlood({ elev: grid.elev, w: 800, h: 800 });
  let raised = 0, landRaised = 0, maxFilled = -Infinity;
  for (let i = 0; i < grid.n; i++) {
    assert.ok(filled[i] >= grid.elev[i]);
    if (filled[i] > grid.elev[i]) { raised++; if ((grid.flags[i] & FLAG.SEA) === 0) landRaised++; }
    if (filled[i] > maxFilled) maxFilled = filled[i];
  }
  assert.equal(raised, 40270);
  assert.equal(landRaised, 603, "the land-depression census moved — the lake rule's premise with it");
  assert.equal(maxFilled, 1.0000009536743164);
  const dir = d8FlowDir({ elev: filled, w: 800, h: 800 });
  const acc = flowAccumulate({ flowDir: dir, w: 800, h: 800 });
  let outlets = 0, outletTotal = 0, maxAcc = 0;
  for (let i = 0; i < grid.n; i++) {
    if (dir[i] < 0) { outlets++; outletTotal += acc[i]; }
    if (acc[i] > maxAcc) maxAcc = acc[i];
  }
  assert.equal(outlets, 8);
  assert.equal(outletTotal, 640000, "the accumulation does not conserve on the real field");
  assert.equal(maxAcc, 287957);
});
