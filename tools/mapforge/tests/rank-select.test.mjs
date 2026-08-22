// tools/mapforge/tests/rank-select.test.mjs — Task 4: P3, the land/sea threshold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectSeaLevelByRank, classifySea, LAND_CELL_BAND, CELL_AREA_KM2, FRAME_AREA_KM2,
} from "../lib/passes/sea-level.mjs";
import { makeGrid, FLAG } from "../lib/grid.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation } from "../lib/passes/elevation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const BUDGETS = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
const STREAM = "d9a0051d32afab59";

// Build a synthetic elevation field with a known rank order.
function ramp(n) {
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = i / n;   // strictly increasing, no ties
  return e;
}

const ulpUp = (v) => {
  const buf = new ArrayBuffer(4); const f = new Float32Array(buf); const u = new Uint32Array(buf);
  f[0] = v; u[0] += 1; return f[0];
};

test("selects the k-th largest exactly: landCells === targetLandCells", () => {
  const e = ramp(640000);
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: 262400 });
  assert.equal(r.landCells, 262400);
  assert.equal(r.rank, 262400);
});

test("landKm2 and seaToLandRatio use the pinned 0.25 km2 cell area", () => {
  const e = ramp(640000);
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: 256000 });
  assert.equal(r.landKm2, 64000);
  assert.equal(r.seaToLandRatio, 1.5);
});

test("a 1-ULP nudge of every elevation does not move a single cell", () => {
  const a = ramp(640000);
  const b = Float32Array.from(a, ulpUp);
  const ra = selectSeaLevelByRank({ elev: a, targetLandCells: 262400 });
  const rb = selectSeaLevelByRank({ elev: b, targetLandCells: 262400 });
  assert.equal(ra.landCells, rb.landCells);
  // the classification set must be identical, cell for cell
  let differing = 0;
  for (let i = 0; i < a.length; i++)
    if ((a[i] > ra.seaLevel) !== (b[i] > rb.seaLevel)) differing++;
  assert.equal(differing, 0, `${differing} cells flipped land<->sea on a 1-ULP nudge`);
});

test("a HALF-field nudge is a controlled landCells miss, never a silent flip", () => {
  // The review brief's own challenge to the test above: a uniform ULP nudge
  // preserves rank order trivially, so it proves the selection is rank-based
  // and nothing more. This nudges only the even-indexed cells, which DOES
  // permute the order across the threshold — and the point is that the failure
  // mode is a reported count, not a quiet reclassification. `landCells` is
  // recounted from the field every time, so whatever the nudge did is visible
  // in the returned record and checked against the band.
  const a = ramp(640000);
  const b = Float32Array.from(a);
  for (let i = 0; i < b.length; i += 2) b[i] = ulpUp(b[i]);
  const ra = selectSeaLevelByRank({ elev: a, targetLandCells: 262400 });
  const rb = selectSeaLevelByRank({ elev: b, targetLandCells: 262400 });
  assert.equal(ra.landCells, 262400);
  assert.equal(rb.landCells, 262400, "the reported count must equal what a re-count of the field says");
  let differing = 0;
  for (let i = 0; i < a.length; i++)
    if ((a[i] > ra.seaLevel) !== (b[i] > rb.seaLevel)) differing++;
  assert.ok(differing <= 1,
    `a half-field ULP nudge moved ${differing} cells; rank selection should absorb it into the threshold`);
});

test("a plateau of ties across the rank index is caught by the band, with an actionable message", () => {
  // 100,000 identical values straddling the rank index. `elev > seaLevel` is
  // false for every one of them, so landCells undershoots the target by the
  // size of the tie block — which is exactly the case that must NOT be
  // silently accepted.
  const n = 640000, target = 262400;
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = i / n;
  for (let i = n - target - 50000; i < n - target + 50000; i++) e[i] = 0.5;
  let msg = "";
  try { selectSeaLevelByRank({ elev: e, targetLandCells: target }); } catch (err) { msg = err.message; }
  assert.match(msg, /land cells/, `a 100,000-value tie block was accepted silently: "${msg}"`);
  assert.match(msg, /ties/, "the message must name ties as a cause a human can act on");
  assert.match(msg, /219999/, "the message must report the count actually produced");
});

test("it is a pure function — two calls on the same input agree exactly", () => {
  // PLAN CORRECTION (Task 4 Step 1). The plan's version of this test calls
  // ramp(64000) with targetLandCells 26240 and would THROW: LAND_CELL_BAND is
  // an ABSOLUTE cell count for the pinned 640,000-cell grid, not a fraction, so
  // 26,240 land cells is 8.7x under the band floor. The band is deliberately
  // absolute — it is the manifest's own `grid.landCellBand` and the error
  // message quotes it — so the fixture is what moves, not the contract.
  // Consequence worth carrying forward: selectSeaLevelByRank is usable on the
  // 800 x 800 grid and on nothing coarser. Task 9a's fixture world must supply
  // its own threshold rather than calling this.
  const e = ramp(640000);
  const a = selectSeaLevelByRank({ elev: e, targetLandCells: 262400 });
  const b = selectSeaLevelByRank({ elev: e, targetLandCells: 262400 });
  assert.deepEqual(a, b);
});

test("it does not sort the caller's array in place", () => {
  // Float32Array.from(elev) must be a genuine copy. If it were not, P4 would
  // trace its coastlines over a sorted field and every later pass would run on
  // a world that no longer exists — and because a ramp is ALREADY ascending, a
  // ramp fixture could not tell the two apart. The field is reversed first, so
  // an in-place sort is a visible reordering.
  const e = ramp(640000).reverse();
  const head = Array.from(e.slice(0, 8));
  const digest = (() => { let s = 0; for (let i = 0; i < e.length; i += 997) s += e[i] * i; return s; })();
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: 262400 });
  assert.equal(r.landCells, 262400);
  assert.deepEqual(Array.from(e.slice(0, 8)), head, "selectSeaLevelByRank sorted its input");
  let after = 0; for (let i = 0; i < e.length; i += 997) after += e[i] * i;
  assert.equal(after, digest);
});

test("the legal band is the manifest's, verbatim", () => {
  assert.deepEqual(LAND_CELL_BAND, [228572, 290908]);
  // and the manifest is the authority, so JOIN them: two hardcoded constants
  // agreeing with each other is not a test.
  assert.deepEqual(Array.from(LAND_CELL_BAND), MANIFEST.grid.landCellBand);
});

test("the cell area is joined to budgets.json's pinned cellKm and to the manifest grid", () => {
  assert.equal(BUDGETS.cellKm, MANIFEST.grid.cellKm);
  assert.equal(CELL_AREA_KM2, BUDGETS.cellKm * BUDGETS.cellKm);
  assert.equal(FRAME_AREA_KM2, MANIFEST.frame.areaKm2);
  assert.equal(MANIFEST.grid.cells, MANIFEST.grid.w * MANIFEST.grid.h);
  assert.equal(MANIFEST.grid.cells * CELL_AREA_KM2, FRAME_AREA_KM2);
});

test("a broken premise (a flat plateau of ocean floor) fails with the premise message", () => {
  // 640,000 cells but only 1,000 above the ocean floor: rank selection would
  // have to reach into the flat -0.75 plateau to find 262,400 "land" cells.
  const e = new Float32Array(640000).fill(-0.75);
  for (let i = 0; i < 1000; i++) e[i] = 0.5;
  assert.throws(
    () => selectSeaLevelByRank({ elev: e, targetLandCells: 262400 }),
    /premise footprints/,
  );
});

test("the failure message names the band and refuses to suggest a reroll", () => {
  const e = new Float32Array(640000).fill(-0.75);
  for (let i = 0; i < 1000; i++) e[i] = 0.5;
  let msg = "";
  try { selectSeaLevelByRank({ elev: e, targetLandCells: 262400 }); } catch (err) { msg = err.message; }
  assert.match(msg, /228572/);
  assert.match(msg, /290908/);
  assert.ok(!/reroll/i.test(msg) || /do not reroll/i.test(msg), `message invites a reroll: ${msg}`);
});

test("a NaN in the field throws its OWN message, not the premise one", () => {
  // NaN cannot reach here from the real pipeline — hashNoise2D and fbm both
  // throw on a non-finite coordinate — but if it ever does, TypedArray.sort
  // parks NaN at the END of the ascending order, `elev[i] > seaLevel` is false
  // for every cell, landCells comes out 0, and the band check fires with a
  // message blaming the premise footprints. That misdiagnosis is the defect;
  // the guard is one comparison inside a loop the function already runs.
  const e = ramp(640000);
  e[123456] = NaN;
  assert.throws(() => selectSeaLevelByRank({ elev: e, targetLandCells: 262400 }),
    /non-finite|NaN/);
  let msg = "";
  try { selectSeaLevelByRank({ elev: e, targetLandCells: 262400 }); } catch (err) { msg = err.message; }
  assert.ok(!/premise footprints/.test(msg), `a NaN field was blamed on the premises: ${msg}`);
  assert.match(msg, /123456/, "the message must name the offending cell index");
});

test("an out-of-range rank is refused before any work is done", () => {
  const e = ramp(1000);
  for (const bad of [0, -1, 1000, 1001, 2.5, NaN, "500"])
    assert.throws(() => selectSeaLevelByRank({ elev: e, targetLandCells: bad }),
      /not a valid rank/, `targetLandCells ${String(bad)} was accepted`);
});

// ── classifySea ─────────────────────────────────────────────────────────────

function tinyWorld() {
  // A 8 x 8 world: a 4 x 4 land block in the middle, sea elsewhere.
  const grid = makeGrid({ w: 8, h: 8, cellKm: 0.5 });
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      grid.elev[y * 8 + x] = (x >= 2 && x < 6 && y >= 2 && y < 6) ? 0.5 : -0.5;
  return grid;
}

test("classifySea flags exactly the cells at or below sea level", () => {
  const grid = tinyWorld();
  classifySea({ grid, seaLevel: 0 });
  let sea = 0;
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.SEA) !== 0) sea++;
  assert.equal(sea, 64 - 16);
  for (let i = 0; i < grid.n; i++)
    assert.equal((grid.flags[i] & FLAG.SEA) !== 0, !(grid.elev[i] > 0));
});

test("classifySea takes FLAG from grid.mjs when the caller does not pass it", () => {
  // The plan's signature is `classifySea({ grid, seaLevel, FLAG })`. A missing
  // FLAG would make `grid.flags[i] |= undefined` a silent no-op — `x |= undefined`
  // is `x |= 0` — so the pass would run, report nothing and classify no water.
  // The default is the same object the explicit form passes.
  const a = tinyWorld(); classifySea({ grid: a, seaLevel: 0, FLAG });
  const b = tinyWorld(); classifySea({ grid: b, seaLevel: 0 });
  assert.deepEqual(Array.from(b.flags), Array.from(a.flags));
  assert.notEqual(Array.from(b.flags).filter((f) => (f & FLAG.SEA) !== 0).length, 0);
});

test("classifySea is idempotent — a second call reproduces the same flags", () => {
  const grid = tinyWorld();
  classifySea({ grid, seaLevel: 0 });
  const once = { flags: Array.from(grid.flags), depth: Array.from(grid.depthM), fetch: Array.from(grid.fetchKm) };
  classifySea({ grid, seaLevel: 0 });
  assert.deepEqual(Array.from(grid.flags), once.flags);
  assert.deepEqual(Array.from(grid.depthM), once.depth);
  assert.deepEqual(Array.from(grid.fetchKm), once.fetch);
});

test("classifySea RE-classifies when the sea level moves — it does not OR onto a stale mask", () => {
  const grid = tinyWorld();
  classifySea({ grid, seaLevel: 0.9 });      // everything drowns
  assert.equal(Array.from(grid.flags).filter((f) => (f & FLAG.SEA) !== 0).length, 64);
  classifySea({ grid, seaLevel: 0 });        // the block resurfaces
  assert.equal(Array.from(grid.flags).filter((f) => (f & FLAG.SEA) !== 0).length, 48);
});

test("depthM is -1 on land and metres below the surface at sea", () => {
  const grid = tinyWorld();
  classifySea({ grid, seaLevel: 0 });
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) === 0) assert.equal(grid.depthM[i], -1, `cell ${i} is land with a depth`);
    else assert.equal(grid.depthM[i], (0 - grid.elev[i]) * 1000);
  }
  assert.equal(grid.depthM[0], 500);
});

test("fetchKm is -1 on land and the longest axis-aligned sea run at sea", () => {
  const grid = tinyWorld();
  classifySea({ grid, seaLevel: 0 });
  const at = (x, y) => grid.fetchKm[y * 8 + x];
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) assert.equal(at(x, y), -1);
  // Row 0 is all sea: 8 cells x 0.5 km.
  assert.equal(at(0, 0), 4);
  // (0, 3) has a 2-cell run east before the land block, and a full 8-cell
  // column run north-south — the max of the two axes is the column.
  assert.equal(at(0, 3), 4);
  // (1, 3): 2 cells across (x = 0..1), 8 down the column -> 4 km.
  assert.equal(at(1, 3), 4);
  // (6, 2): east run is x = 6..7 = 2 cells; the column at x = 6 is unbroken.
  assert.equal(at(6, 2), 4);
});

test("fetchKm shrinks when the water is enclosed — it measures shelter, not area", () => {
  // The term settlement scoring leans on: a 2-cell pocket must not read like
  // open ocean. A 1 x 2 puddle inside land scores 1 km, the frame edge 4 km.
  const grid = makeGrid({ w: 8, h: 8, cellKm: 0.5 });
  for (let i = 0; i < grid.n; i++) grid.elev[i] = 0.5;
  grid.elev[3 * 8 + 3] = -0.5; grid.elev[3 * 8 + 4] = -0.5;
  classifySea({ grid, seaLevel: 0 });
  assert.equal(grid.fetchKm[3 * 8 + 3], 1);
  assert.equal(grid.fetchKm[3 * 8 + 4], 1);
});

// ── the real premise field: the acceptance criterion, as a test ─────────────

test("GOLDEN: the real 800 x 800 premise field selects 262,400 land cells in band", () => {
  // Plan Task 4 Step 5 asks for this as a one-off probe pasted into a report.
  // A report cannot go red. The numbers below are that probe's output, pinned:
  // if a premise radius, a noise frequency or a relief coefficient moves, the
  // sea level moves with it and this is where it is caught.
  const premises = readdirSync(join(ROOT, "content/world/premises"))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));
  const grid = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  const target = MANIFEST.budget.grossLandPolygonKm2 / CELL_AREA_KM2;
  assert.equal(target, 262400);
  const r = selectSeaLevelByRank({ elev: grid.elev, targetLandCells: target });
  assert.deepEqual(r, {
    seaLevel: 0.043910134583711624,
    rank: 262400,
    landCells: 262400,
    landKm2: 65600,
    seaToLandRatio: 1.4390243902439024,
  });
  assert.ok(r.landCells >= LAND_CELL_BAND[0] && r.landCells <= LAND_CELL_BAND[1]);
  // The GROSS ratio. P7 carves 1,600 km2 of interior water out of this and the
  // net lands on 64,000 km2 / 1.500 — so 1.439 here is on plan, not a miss.
  assert.equal(MANIFEST.budget.grossLandPolygonKm2, r.landKm2);
  classifySea({ grid, seaLevel: r.seaLevel });
  let sea = 0, deepest = 0, maxFetch = 0;
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.SEA) !== 0) {
      sea++;
      if (grid.depthM[i] > deepest) deepest = grid.depthM[i];
      if (grid.fetchKm[i] > maxFetch) maxFetch = grid.fetchKm[i];
    }
  assert.equal(sea, 640000 - 262400);
  assert.equal(deepest, 916.3983764648438);
  assert.equal(maxFetch, 400);
});
