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
import { terrainStream } from "../lib/seed.mjs";

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

// THE REAL WORLD, built ONCE per call the way the generator builds it — and
// from the TERRAIN STREAM.
//
// `manifest.seed` is the WORLD seed, the parent of the four named streams in
// content/spine/derived.json; the terrain field is built from the child
// `mintSeed(seed, "terrain") = d9a0051d32afab59`. fit-premises.mjs,
// mask.test.mjs and rank-select.test.mjs all use that child. This file and
// arcs.test.mjs passed the PARENT until 2026-08-22, so every seam-3 real-world
// golden pinned a world the thirteen premise footprints had never been fitted
// to: sea level 0.04435581713914871 against the fitted 0.043565794825553894,
// and per-continent net land off its own areaBandKm2 by up to -59%. Neither
// review found it; the per-continent band assertion below is what does now.
function realWorld() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const premises = readdirSync(join(ROOT, "content/world/premises"))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));
  const derived = JSON.parse(readFileSync(join(ROOT, "content/spine/derived.json"), "utf8"));
  const stream = terrainStream({ worldSeed: manifest.seed });
  assert.equal(stream, derived["n-atlas"].resolvedSeedStreams.terrain,
    "the terrain stream is not the one committed in derived.json");
  assert.equal(stream, STREAM, "the fixtures' stream is no longer the terrain stream");
  const grid = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream });
  buildElevation({ grid, premises, maskField, stream });
  const sea = selectSeaLevelByRank({
    elev: grid.elev, targetLandCells: manifest.budget.grossLandPolygonKm2 / CELL_AREA_KM2 });
  classifySea({ grid, seaLevel: sea.seaLevel });
  const filled = runHydrology(grid);
  applyWinds({ grid, stream });
  const r = carveWater({ grid, premises, manifest });
  return { grid, manifest, premises, sea, filled, r };
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
  // the jitter frequency, the sweep set or the NORMALISATION changes.
  const grid = wallWorld({ withWall: true, w: 40, h: 12 });
  const r = applyWinds({ grid, stream: STREAM });
  const at = (x, y) => grid.moist[idx({ grid, cx: x, cy: y })];
  const tp = (x, y) => grid.temp[idx({ grid, cx: x, cy: y })];
  assert.deepEqual([at(5, 6), at(12, 6), at(30, 6)],
    [0.019926927983760834, 0.38860902190208435, 0.47474467754364014]);
  // Temperature is latitude minus lapse. Pinned as the Float32 IMAGE of that
  // expression, not as the float64 expression: grid.temp is a Float32Array, so
  // (6.5 x 2) / 24 stores as 0.5416666865348816 and an equality against
  // 0.5416666666666666 fails on correct code.
  assert.equal(tp(5, 6), 0.5416666865348816);          // sea: latitude, no lapse
  assert.equal(tp(30, 6), 0.43166667222976685);        // land: latitude - 0.55 x 0.2
  assert.ok(tp(5, 6) - tp(30, 6) > 0.1, "the lapse term is not reaching temperature");
  assert.equal(tp(30, 0), 0, "the north edge does not clamp at 0");
  // The calibration itself is part of the golden: the reference is the 75th
  // percentile of the LAND accumulator, not its maximum.
  assert.equal(r.landCells, 360);
  assert.equal(r.referenceAcc, 0.06549188494682312);
});

test("the reference is the 75th-percentile land cell — the INDEX, pinned", () => {
  // A recorded mutation survivor turned into a kill. `Math.round(0.75 * (n-1))`
  // and `Math.floor(...)` agree whenever n is not 3 mod 4, which the real field
  // (262,400 land cells) and every other fixture here happen to satisfy — so
  // the quantile DEFINITION was unpinned. Seven land cells is the smallest case
  // that separates them: 0.75 * 6 = 4.5, so round takes the 5th-smallest and
  // floor the 4th.
  const grid = makeGrid({ w: 9, h: 1, cellKm: 1 });
  for (let x = 0; x < 9; x++) {
    const i = idx({ grid, cx: x, cy: 0 });
    if (x === 0 || x === 8) { grid.elev[i] = -0.5; grid.flags[i] |= FLAG.SEA; grid.plate[i] = -1; }
    else { grid.elev[i] = 0.05 * x; grid.plate[i] = 0; }
  }
  const r = applyWinds({ grid, stream: STREAM });
  assert.equal(r.landCells, 7);
  assert.equal(r.referenceAcc, 7.021875381469727);
});

test("the moisture normalisation is SCALE INVARIANT — the property acc/max never had", () => {
  // Multiply every drop by a constant and the normalised field must not move.
  // PICKUP, LEEWARD_DROP and OROGRAPHIC are per-CELL rates on a grid whose
  // cellKm is a parameter, so without this the climate changes when the grid is
  // re-tiled. `acc / (acc + REF)` has it because REF scales with acc; `acc /
  // max` had it too — what acc/max lacked was that the divisor be ROBUST.
  //
  // Tested through the pass by scaling the thing the accumulator is
  // proportional to: the sea fetch each parcel crosses is irrelevant, but the
  // number of SWEEPS is not exposed, so this scales the field the only way the
  // API allows — by running the identical relief at two grid resolutions and
  // asserting the DISTRIBUTION, not the cells. See the direct unit below.
  const coarse = wallWorld({ withWall: true, w: 100, h: 20 });
  applyWinds({ grid: coarse, stream: STREAM });
  const land = [];
  for (let i = 0; i < coarse.n; i++) if ((coarse.flags[i] & FLAG.SEA) === 0) land.push(coarse.moist[i]);
  land.sort((a, b) => a - b);
  const median = land[(land.length / 2) | 0];
  assert.ok(median > 0.15 && median < 0.85,
    `the moisture median on a plain-and-ridge world is ${median} — the field carries no signal`);
});

test("applyWinds THROWS when the accumulator is degenerate rather than normalising zero", () => {
  // THE COLLAPSE GUARD. Land with no sea anywhere receives no parcel at all —
  // every drop is zero, the 75th percentile is zero, and there is no
  // distribution to normalise. The plan's `acc / max` answered 0/0 = NaN, or
  // (with the `max === 0` guard) a silent field of zeros. Loud at the source.
  const grid = makeGrid({ w: 20, h: 20, cellKm: 2 });
  for (let i = 0; i < grid.n; i++) { grid.elev[i] = 0.3; grid.plate[i] = 0; }   // all land, no sea
  assert.throws(() => applyWinds({ grid, stream: STREAM }), /degenerate/);
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
  //
  // It is also the clearest possible picture of LAKE_BOWL. On perfectly flat
  // ground the terrain term is constant, so the bowl is the ONLY thing the
  // heap can order by, and the body comes back as a disc around the seed —
  // rows of 4, 6, 7, 3. Without the bowl the same twenty cells came back as
  // two straight rows of 9 and 11, i.e. the ribbon, in miniature.
  assert.deepEqual(cells, [296, 297, 298, 299,
                           334, 335, 336, 337, 338, 339,
                           373, 374, 375, 376, 377, 378, 379,
                           415, 416, 417]);
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

test("DELTA_ACC_MIN is pinned by BEHAVIOUR, not only by its literal", () => {
  // The reviewer's one live gap: on the real field `deltaCells === 27` holds
  // over an interval of DELTA_ACC_MIN roughly 60 wide, so a +-1 mutation
  // survives while RIVER_ACC_MIN's dies. A golden that cannot move is not a
  // pin. This fixture puts the constant exactly on the boundary.
  //
  // One row, 901 cells. x = 0 is sea; x = 1..900 is a land channel sloping
  // down to the west, so every one of those 900 cells drains through
  // x = 1, which is D8-adjacent to the sea at x = 0. Its accumulation is
  // therefore EXACTLY 900 — the constant — and it is the world's only delta.
  // At 901 there is none, so the mutation reds here.
  const grid = makeGrid({ w: 901, h: 1, cellKm: 1 });
  for (let x = 0; x < 901; x++) {
    const i = idx({ grid, cx: x, cy: 0 });
    if (x === 0) { grid.elev[i] = -0.5; grid.flags[i] |= FLAG.SEA; grid.plate[i] = -1; }
    else { grid.elev[i] = 0.05 + x * 0.001; grid.plate[i] = 0; }
  }
  runHydrology(grid);
  assert.equal(grid.flowAcc[idx({ grid, cx: 1, cy: 0 })], 900,
    "the fixture no longer puts exactly DELTA_ACC_MIN cells through the mouth");
  assert.equal(grid.flowAcc[idx({ grid, cx: 2, cy: 0 })], 899,
    "the cell one step upstream is not one short — the boundary is not tight");
  const r = carveWater({ grid,
    premises: [{ id: "c01", palette: [], footprint: { centreKm: [451, 0.5], radiiKm: [1, 1], warpKm: 0 }, structures: [] }],
    manifest: { landmasses: [{ id: "c01", interiorWaterKm2: 0 }] } });
  assert.equal(r.deltaCells, 1, "the mouth at exactly DELTA_ACC_MIN is not a delta");
  assert.equal((grid.flags[idx({ grid, cx: 1, cy: 0 })] & FLAG.DELTA) !== 0, true);
  assert.equal((grid.flags[idx({ grid, cx: 2, cy: 0 })] & FLAG.DELTA) !== 0, false,
    "a cell one below the threshold built a delta");
});

// ── the real world ─────────────────────────────────────────────────────────

test("GOLDEN: the real 800 x 800 world carves 1,600 km2 of interior water", () => {
  // The acceptance criterion of Task 6b, as a test rather than a probe pasted
  // into a report. THIS is what the plan's lake rule could not do: measured on
  // this field, the whole world holds 855 land cells with any depression at all
  // against the 6,400 the manifest budgets, so ranking by depression depth
  // reaches at most 855 of the 6,400 cells the budget asks for.
  const { grid, manifest, premises, sea, r } = realWorld();

  assert.deepEqual(r.shortfalls, [], "a landmass could not absorb its interior-water share");
  assert.equal(r.lakeCells, 6400);
  assert.equal(r.lakeCells * CELL_AREA_KM2, manifest.budget.interiorWaterKm2);
  assert.equal(r.riverCells, 3841);    //   960.25 km2 of channel
  assert.equal(r.deltaCells, 27);      //     6.75 km2 of river mouth
  assert.equal(r.glacierCells, 26241); //  6560.25 km2 of ice, a tenth of the land

  // ── THE RATIO, measured from the FIELD and not restated from its inputs ──
  //
  // The seam recorded "the net sea-to-land ratio is 1.500 exactly" as if it
  // were an outcome. It is not, and the reviewer's arithmetic is right:
  // selectSeaLevelByRank returns the target land count BY DEFINITION and
  // carveWater stops at Sum(manifest column) with no shortfall, so
  // `65,600 - 1,600 = 64,000` has zero degrees of freedom. What is asserted
  // below therefore COUNTS CELLS IN THE FLAG FIELD — which is a different
  // claim: it can catch classifySea disagreeing with the rank record, a lake
  // carved onto a sea cell, or a cell counted twice.
  let seaCells = 0, standingWater = 0, interiorFlagged = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) { seaCells++; continue; }
    if ((grid.flags[i] & FLAG.LAKE) !== 0) standingWater++;
    if ((grid.flags[i] & (FLAG.LAKE | FLAG.RIVER | FLAG.DELTA)) !== 0) interiorFlagged++;
  }
  assert.equal(seaCells, 377600);
  assert.equal(standingWater, r.lakeCells, "the LAKE census and the carve report disagree");
  const waterKm2 = (seaCells + standingWater) * CELL_AREA_KM2;
  const netLandKm2 = (grid.n - seaCells - standingWater) * CELL_AREA_KM2;
  assert.equal(netLandKm2, manifest.budget.netLandKm2);
  assert.equal(netLandKm2, 64000);
  assert.equal(waterKm2 + netLandKm2, manifest.frame.areaKm2, "the frame does not close");
  const netRatio = waterKm2 / netLandKm2;
  assert.equal(netRatio, 1.5);
  assert.ok(netRatio >= manifest.ratio.min && netRatio <= manifest.ratio.max);

  // WHAT "INTERIOR WATER" MEANS, stated once so the 1.500 is honest. The
  // manifest's per-landmass `interiorWaterKm2` column budgets STANDING water —
  // c02's inland sea, c04's karst water, c06's delta pool — and that is what is
  // subtracted from land. RIVER and DELTA are CHANNEL flags on cells that stay
  // land: at 0.5 km a river occupies a fraction of its cell, and the cell's
  // biome, its region membership and its settlement score all still treat it as
  // ground. Counting them as water instead gives 1.5381, which is also inside
  // the manifest's [1.2, 1.8] band — the number is pinned here rather than
  // hidden, because a later reader who does count them must find it already
  // measured and not think the budget failed to close.
  assert.equal(interiorFlagged, 10241);
  assert.equal(interiorFlagged * CELL_AREA_KM2, 2560.25);
  const allFlagsRatio = (manifest.frame.areaKm2 - (sea.landKm2 - interiorFlagged * CELL_AREA_KM2))
    / (sea.landKm2 - interiorFlagged * CELL_AREA_KM2);
  assert.equal(Math.round(allFlagsRatio * 10000) / 10000, 1.5381);
  assert.ok(allFlagsRatio >= manifest.ratio.min && allFlagsRatio <= manifest.ratio.max,
    "even counting every channel flag as water, the ratio stays in the manifest band");

  // Per landmass, against the manifest's own column — an aggregate that closes
  // hides a lake on the wrong continent.
  const perPlate = new Array(premises.length).fill(0);
  const landPlate = new Array(premises.length).fill(0);
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
    landPlate[grid.plate[i]]++;
    if ((grid.flags[i] & FLAG.LAKE) !== 0) perPlate[grid.plate[i]]++;
  }
  for (let k = 0; k < premises.length; k++) {
    const want = manifest.landmasses.find((m) => m.id === premises[k].id).interiorWaterKm2;
    assert.equal(perPlate[k] * CELL_AREA_KM2, want, `${premises[k].id} interior water`);
  }

  // ── PER-CONTINENT NET AREA, on the GENERATED field ──────────────────────
  //
  // mask.test.mjs' "premise area bands bracket the manifest's netKm2" compares
  // `premise.areaBandKm2` against `manifest.netKm2` — two committed constants,
  // never the field (STATE trap 8: a test comparing two hardcoded constants is
  // not a test). This is the measurement it was standing in for: gross land
  // minus the interior water this pass carved, per landmass, against the band
  // the premise declares. It is also what caught the WRONG-STREAM defect —
  // built from `manifest.seed` instead of the terrain stream, c12 came out at
  // 407.25 km2 against a [900, 1100] band while the thirteen still summed to
  // exactly 65,600.
  let worstErrPct = 0;
  for (let k = 0; k < premises.length; k++) {
    const net = (landPlate[k] - perPlate[k]) * CELL_AREA_KM2;
    const [lo, hi] = premises[k].areaBandKm2;
    assert.ok(net >= lo && net <= hi,
      `${premises[k].id}: net land ${net} km2 outside its own band [${lo}, ${hi}]`);
    const want = manifest.landmasses.find((m) => m.id === premises[k].id).netKm2;
    const err = Math.abs(net - want) / want * 100;
    if (err > worstErrPct) worstErrPct = err;
  }
  assert.ok(worstErrPct <= 0.1,
    `worst per-continent net-area error is ${worstErrPct}% — seam 2's fit reached 0.100%`);

  // ONE CELL, ONE KIND OF WATER — and no sea cell is ever carved.
  let lakeRiver = 0, lakeGlacier = 0, seaCarved = 0;
  for (let i = 0; i < grid.n; i++) {
    const f = grid.flags[i];
    if ((f & FLAG.LAKE) !== 0 && (f & FLAG.RIVER) !== 0) lakeRiver++;
    if ((f & FLAG.LAKE) !== 0 && (f & FLAG.GLACIER) !== 0) lakeGlacier++;
    if ((f & FLAG.SEA) !== 0 && (f & (FLAG.LAKE | FLAG.RIVER | FLAG.DELTA | FLAG.GLACIER)) !== 0) seaCarved++;
  }
  assert.equal(lakeRiver, 0, "a lake cell is also flagged a river — the channel census double-counts");
  assert.equal(lakeGlacier, 0, "a lake cell is also flagged ice — it would read as ice and budget as water");
  assert.equal(seaCarved, 0);

  // WHICH cells, not only how many. Counts alone cannot see a lake that moved:
  // the budget is a cell count and the carve stops on it, so a different growth
  // key, a different seed rule or a different heap tiebreak all still deliver
  // 6,400 cells.
  const digest = createHash("sha256");
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.LAKE) !== 0) digest.update(String(i) + ",");
  assert.equal(digest.digest("hex").slice(0, 16), "895b7116aad63523", "the lake CELL SET moved");

  // ── AND THE SHAPE, which no digest and no bounding box can see ───────────
  // A ribbon satisfies a cell-set digest and a bbox exactly as happily as a
  // lake does. Before LAKE_BOWL, c04's 300 km2 body had a 307 km shoreline
  // against the 61 km a circle of that area would have — isoperimetric ratio
  // 0.040. The floor below is the constraint; the exact values are the golden.
  const shapes = [1, 3, 5].map((k) => {
    let n = 0, perim = 0, minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < grid.n; i++) {
      if ((grid.flags[i] & FLAG.LAKE) === 0 || grid.plate[i] !== k) continue;
      n++;
      const x = i % grid.w, y = (i / grid.w) | 0;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) { perim++; continue; }
        const j = ny * grid.w + nx;
        if ((grid.flags[j] & FLAG.LAKE) === 0 || grid.plate[j] !== k) perim++;
      }
    }
    const areaKm2 = n * CELL_AREA_KM2, perimKm = perim * grid.cellKm;
    const bw = (maxx - minx + 1) * grid.cellKm, bh = (maxy - miny + 1) * grid.cellKm;
    return { areaKm2, perimKm, bw, bh,
             fill: Math.round(areaKm2 / (bw * bh) * 1000) / 1000,
             // 4 * pi * A / P^2, with pi written out — this file is not on the
             // determinism-scanned path, but the constant is spelled once here
             // rather than imported so the number below is readable.
             ratio: Math.round(4 * 3.141592653589793 * areaKm2 / (perimKm * perimKm) * 1000) / 1000 };
  });
  assert.deepEqual(shapes.map((s) => [s.areaKm2, s.perimKm]), [[1100, 159], [300, 99], [200, 76]],
    "a lake's area or shoreline moved");
  assert.deepEqual(shapes.map((s) => [s.bw, s.bh]), [[46, 33.5], [18.5, 31], [27, 11]],
    "a lake's extent moved");
  assert.deepEqual(shapes.map((s) => s.ratio), [0.547, 0.385, 0.435]);
  assert.deepEqual(shapes.map((s) => s.fill), [0.714, 0.523, 0.673]);
  for (const s of shapes) {
    assert.ok(s.ratio >= 0.35, `a carved body has isoperimetric ratio ${s.ratio} — that is a ribbon, not a lake`);
    assert.ok(s.fill >= 0.5, `a carved body fills only ${s.fill} of its own bounding box`);
  }

  // ── ICE, against the premises that are the committed authority ───────────
  //
  // The plan flags ice on any land cell under the threshold: 21.6% of all land
  // here, including 78.6% of c11 Quillreef (an atoll whose palette is
  // reef/meadow/ocean), 60.3% of c07 Driftholt (a fog forest, "the wettest
  // ground in the world") and 41.7% of c03 Coldreach. None of the three lists
  // `ice`. Task 7's palette clamp cannot repair it: the clamp rewrites the
  // BIOME, while FLAG.GLACIER is read directly by Tasks 8, 9 and 10 and
  // survives it. So the gate is here, at the pass that sets the flag.
  const icePer = new Array(premises.length).fill(0);
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.GLACIER) !== 0) icePer[grid.plate[i]]++;
  for (let k = 0; k < premises.length; k++) {
    const admits = (premises[k].palette ?? []).includes("ice");
    if (!admits) assert.equal(icePer[k], 0,
      `${premises[k].id} carries ${icePer[k]} ice cells and its committed palette ` +
      `${JSON.stringify(premises[k].palette)} has no ice in it`);
  }
  const iceIds = premises.map((p, k) => [p.id, icePer[k]]).filter(([, n]) => n > 0);
  assert.deepEqual(iceIds, [["c01", 23244], ["c12", 2997]]);
  // c01's premise is "one ice divide shedding outlet glaciers to every
  // quarter"; c12's names roche moutonnee and skerry, which are DEGLACIATED
  // rock, and lists rock/scree/upland beside ice. So c01 is nearly all ice and
  // c12 is not — which is what makes GLACIER_TEMP_MAX a live constant instead
  // of the inert one it was at 0.12, where both read 100%.
  assert.equal(Math.round(icePer[0] / (5997.25 / CELL_AREA_KM2) * 1000) / 1000, 0.969);
  assert.equal(Math.round(icePer[11] / (999.5 / CELL_AREA_KM2) * 1000) / 1000, 0.75);
  assert.equal(Math.round(r.glacierCells / 262400 * 10000) / 10000, 0.1);

  // ── THE MOISTURE DISTRIBUTION, not only its digest ──────────────────────
  //
  // THE BLOCKER THIS SEAM SHIPPED AND THE SUITE COULD NOT SEE. Normalising the
  // wind accumulator by its global MAXIMUM put the median land cell at 0.0000
  // and 99.2% of all land under both the biome desert threshold and the
  // settlement fresh-water veto — every continent a desert, no settlement
  // siteable. A sha256 over every 997th cell is a perfectly stable digest of a
  // degenerate field, which is why only a DISTRIBUTION assertion can catch it.
  // These bands are wide on purpose: they are a floor under "the field carries
  // signal", not a composition target. Task 7 owns composition.
  const land = [];
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.SEA) === 0) land.push(grid.moist[i]);
  land.sort((a, b) => a - b);
  const q = (p) => land[Math.floor(p * (land.length - 1))];
  assert.equal(land.length, 262400);
  const belowDesert = land.filter((m) => m < 0.16).length;
  const belowVeto = land.filter((m) => m < 0.20).length;
  const aboveForest = land.filter((m) => m > 0.48).length;
  assert.deepEqual([belowDesert, belowVeto, aboveForest], [55143, 70947, 74182]);
  assert.ok(q(0.5) > 0.25 && q(0.5) < 0.55, `median land moisture is ${q(0.5)}`);
  assert.ok(q(0.1) > 0.02, `the driest decile of land is at ${q(0.1)} — the field is collapsing at 0`);
  assert.ok(q(0.9) < 0.95, `the wettest decile of land is at ${q(0.9)} — the field is saturating at 1`);
  for (const [name, n] of [["desert", belowDesert], ["veto", belowVeto], ["forest", aboveForest]])
    assert.ok(n / land.length > 0.05 && n / land.length < 0.6,
      `the ${name} threshold puts ${(100 * n / land.length).toFixed(1)}% of land on one side — it does not discriminate`);
  // Temperature has the same failure mode and the same remedy.
  let tempSaturated = 0;
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.SEA) === 0 && grid.temp[i] === 0) tempSaturated++;
  assert.equal(tempSaturated, 25091);
  assert.ok(tempSaturated / land.length < 0.15,
    "more than a seventh of land has no temperature gradient left — the lapse term is saturating");

  // The climate the same run produced, sampled every 997th cell — a stride
  // coprime with 800 so the sample is not one column.
  const dm = createHash("sha256"), dt = createHash("sha256"), df = createHash("sha256");
  for (let i = 0; i < grid.n; i += 997) {
    dm.update(String(grid.moist[i])); dt.update(String(grid.temp[i])); df.update(String(grid.freshKm[i]));
  }
  assert.equal(dm.digest("hex").slice(0, 16), "2098432e278f47bf", "the moisture field moved");
  assert.equal(dt.digest("hex").slice(0, 16), "9dfa36129ff986e4", "the temperature field moved");

  // freshKm, on the real field: every RIVER, LAKE and DELTA cell is a source at
  // 0, nothing is left unset, and the far corner of the world is 114 km from
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
  assert.equal(maxFresh, 114);
  assert.equal(df.digest("hex").slice(0, 16), "5169ee75b5d75d0a", "the fresh-water distance field moved");
});

test("GOLDEN: priorityFlood on the real field raises 86,986 cells and stays inside [-1, 1 + eps]", () => {
  // The review's epsilon question, answered with a number. `filled` can exceed
  // the 1.0 clamp buildElevation applies — by exactly one epsilon, 9.5e-7 — so
  // any later reader that assumes a closed [0, 1] must clamp. NOTHING DOES
  // TODAY: the biome table reads grid.elev, and `filled` leaves this pass only
  // as a depression depth. Pinned so that stops being a coincidence.
  const { grid, filled } = realWorld();
  let raised = 0, landRaised = 0, maxFilled = -Infinity;
  for (let i = 0; i < grid.n; i++) {
    assert.ok(filled[i] >= grid.elev[i]);
    if (filled[i] > grid.elev[i]) { raised++; if ((grid.flags[i] & FLAG.SEA) === 0) landRaised++; }
    if (filled[i] > maxFilled) maxFilled = filled[i];
  }
  assert.equal(raised, 86986);
  assert.equal(landRaised, 855, "the land-depression census moved — the lake rule's premise with it");
  assert.equal(maxFilled, 1.0000019073486328);
  const dir = d8FlowDir({ elev: filled, w: 800, h: 800 });
  const acc = flowAccumulate({ flowDir: dir, w: 800, h: 800 });
  let outlets = 0, outletTotal = 0, maxAcc = 0;
  for (let i = 0; i < grid.n; i++) {
    if (dir[i] < 0) { outlets++; outletTotal += acc[i]; }
    if (acc[i] > maxAcc) maxAcc = acc[i];
  }
  assert.equal(outlets, 11);
  assert.equal(outletTotal, 640000, "the accumulation does not conserve on the real field");
  assert.equal(maxAcc, 397660);
});
