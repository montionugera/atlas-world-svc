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
import { buildElevation, ELEVATION_BANDS } from "../lib/passes/elevation.mjs";

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

test("a GENUINE order permutation across the threshold is a controlled reclassification", () => {
  // WHAT THIS REPLACES, and why. The committed version of this test nudged the
  // even-indexed cells of `ramp(640000)` by one ULP and claimed in its own
  // comment that this "DOES permute the order across the threshold". It does
  // not, and it cannot: MEASURED, consecutive ramp values at the rank index are
  // 0.5899984240531921 and 0.5899999737739563 — **26 float32 ULPs** apart — so a
  // one-ULP nudge is arithmetically incapable of reordering anything. It
  // reported 0 differing cells by construction, under an `<= 1` assertion. A
  // green check that cannot go red is the seam-1 golden-vector gap again.
  //
  // Plan Task 4 Step 8 asked for a nudge that does NOT preserve rank order. This
  // is one: swap adjacent pairs in a 1,000-cell band straddling the rank index,
  // which genuinely inverts the order of cells on both sides of the threshold.
  // The property being asserted is the real claim — `landCells` stays exactly on
  // target while a BOUNDED number of cells change side. A silent flip would show
  // up as a count that no longer equals the target.
  const n = 640000, target = 262400, rankIndex = n - target - 1;
  const a = ramp(n);
  const b = Float32Array.from(a);
  let swapped = 0;
  for (let i = rankIndex - 500; i < rankIndex + 500; i += 2) {
    const t = b[i]; b[i] = b[i + 1]; b[i + 1] = t; swapped++;
  }
  assert.equal(swapped, 500);
  // the permutation is real: it inverts order across the threshold
  let inversions = 0;
  for (let i = rankIndex - 500; i < rankIndex + 500; i++) if (b[i] !== a[i]) inversions++;
  assert.equal(inversions, 1000, "the fixture did not actually permute the field");
  const ra = selectSeaLevelByRank({ elev: a, targetLandCells: target });
  const rb = selectSeaLevelByRank({ elev: b, targetLandCells: target });
  assert.equal(ra.landCells, target);
  assert.equal(rb.landCells, target, "the reported count must equal what a re-count of the field says");
  let differing = 0;
  for (let i = 0; i < n; i++) if ((a[i] > ra.seaLevel) !== (b[i] > rb.seaLevel)) differing++;
  assert.ok(differing > 0, "a genuine order permutation must move at least one cell, or the fixture is inert");
  assert.ok(differing <= swapped * 2,
    `${differing} cells changed side for ${swapped} swaps — the reclassification is not bounded by the permutation`);
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
  // 640,000 cells, because the frame guard now runs first: a 1,000-cell field is
  // refused for being the wrong grid before the rank is even looked at.
  const e = ramp(640000);
  for (const bad of [0, -1, 640000, 640001, 2.5, NaN, "500"])
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

test("a grid that is not the pinned 800 x 800 frame is REFUSED, not silently mis-scaled", () => {
  // Review D, measured: a 500 x 500 field returned `landKm2 60000, seaKm2 100000`
  // — 160,000 km2 of frame out of a grid that holds 62,500 — silently and in
  // band, because FRAME_AREA_KM2 and CELL_AREA_KM2 are unconditional constants
  // and nothing consulted `n`. The coupling was recorded in prose only, so
  // Task 9a's fixture world was protected by a note somebody had to have read.
  const e = ramp(250000);                        // a 500 x 500 grid
  assert.throws(() => selectSeaLevelByRank({ elev: e, targetLandCells: 100000 }),
    /800 x 800 grid ONLY/);
  let msg = "";
  try { selectSeaLevelByRank({ elev: e, targetLandCells: 100000 }); } catch (err) { msg = err.message; }
  assert.match(msg, /62500 km2/, "the message must name the area the grid actually holds");
  // …and the pinned grid is accepted, so the guard is not simply always-on.
  assert.equal(selectSeaLevelByRank({ elev: ramp(640000), targetLandCells: 262400 }).landCells, 262400);
});

test("PHANTOM LAND: a threshold that falls into the ocean band throws, though the COUNT is perfect", () => {
  // THE defect this seam's guard exists for, as a fixture. With the plan's own
  // Step 4 radii the masks supplied 188,569 cells against a 262,400 rank target
  // and this function did NOT throw: it returned landCells exactly 262,400, in
  // band, at the on-plan ratio — by calling 73,831 ocean-floor cells land. The
  // band cannot see it because the count is right; only WHERE the threshold fell
  // distinguishes the two worlds.
  //
  // The field below reproduces that shape: too few land cells, and an ocean
  // floor with VARIED values (the flat-plateau fixture above cannot reproduce it
  // — identical ocean values make every one of them tie at the threshold and
  // classify as sea, so the count undershoots and the band catches it instead).
  const n = 640000, target = 262400, landCount = 100000;
  const e = new Float32Array(n);
  for (let i = 0; i < landCount; i++) e[i] = ELEVATION_BANDS.landFloor + 0.99 * (i / landCount);
  for (let i = landCount; i < n; i++) e[i] = -1 + 0.5 * ((i - landCount) / (n - landCount));
  // Before the guard this returned silently. Prove the shape first:
  const sorted = Float32Array.from(e); sorted.sort();
  const seaLevel = sorted[n - target - 1];
  assert.ok(seaLevel < ELEVATION_BANDS.oceanCeil, `fixture is wrong: threshold ${seaLevel} is not in the ocean band`);
  let land = 0; for (let i = 0; i < n; i++) if (e[i] > seaLevel) land++;
  assert.equal(land, target, "fixture is wrong: the count must be EXACTLY on target, or the band would catch it");
  assert.ok(land >= LAND_CELL_BAND[0] && land <= LAND_CELL_BAND[1], "fixture is wrong: it must be in band");
  // …and now it does not.
  assert.throws(() => selectSeaLevelByRank({ elev: e, targetLandCells: target }), /ocean floor/);
  let msg = "";
  try { selectSeaLevelByRank({ elev: e, targetLandCells: target }); } catch (err) { msg = err.message; }
  assert.match(msg, /fit-premises/, "the message must name the tool that fixes it");
  assert.ok(!/reroll/i.test(msg) || /do not reroll/i.test(msg), msg);
});

test("a sea level exactly ON the land floor is accepted — the guard is >=, not >", () => {
  // The boundary the guard must not eat: a world with no coastal shell at all
  // puts the threshold on the 0.01 clamp itself, which is legal (every masked
  // cell is land) and must not be mistaken for phantom land.
  const n = 640000, target = 262400;
  const FLOOR = new Float32Array([ELEVATION_BANDS.landFloor])[0];
  const e = new Float32Array(n);
  for (let i = 0; i < n - target; i++) e[i] = FLOOR;          // the clamp, exactly
  for (let i = n - target; i < n; i++) e[i] = 0.02 + 0.9 * ((i - (n - target)) / target);
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: target });
  assert.equal(r.seaLevel, FLOOR);
  assert.equal(r.landCells, target);
});

test("a band-legal tie block ABOVE the rank index returns with landCells !== rank", () => {
  // `rank` is the target that was ASKED for; `landCells` is what the field
  // actually produced. They differ whenever ties straddle the rank index
  // upward, and that state is legal — the band, not equality, is the contract.
  // Nothing pinned the difference, so `rank: targetLandCells` could be replaced
  // by `rank: landCells` and stay green (review D's surviving mutation). This is
  // the fixture that separates them: an undershoot inside the band.
  const n = 640000, target = 262400, rankIndex = n - target - 1;
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = 0.02 + 0.9 * (i / n);
  for (let i = rankIndex; i < rankIndex + 20000; i++) e[i] = e[rankIndex];   // ties straddling upward
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: target });
  assert.equal(r.rank, target, "rank must report what was ASKED for");
  assert.notEqual(r.landCells, target, "the fixture must actually undershoot, or it separates nothing");
  assert.equal(r.landCells, target - 19999);
  assert.ok(r.landCells >= LAND_CELL_BAND[0] && r.landCells <= LAND_CELL_BAND[1],
    "the fixture must stay IN band — an out-of-band undershoot throws and proves nothing");
  assert.equal(r.landKm2, r.landCells * CELL_AREA_KM2, "landKm2 must follow landCells, not rank");
});

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
    seaLevel: 0.043565794825553894,
    rank: 262400,
    landCells: 262400,
    landKm2: 65600,
    seaToLandRatio: 1.4390243902439024,
  });
  assert.ok(r.landCells >= LAND_CELL_BAND[0] && r.landCells <= LAND_CELL_BAND[1]);
  // LAND IS A SUBSET OF THE CONTINENTAL MASK — the invariant the whole premise
  // layer exists to provide, asserted on the real field rather than assumed. Not
  // one cell of land may sit off a plate: with the plan's own radii this counted
  // 73,831 (28% of all "land") and every gate was green. Counted both ways so a
  // masked cell that fails to make land is visible too.
  let landOnMask = 0, landOffMask = 0, masked = 0;
  for (let i = 0; i < grid.n; i++) {
    if (maskField[i] > 0) masked++;
    if (grid.elev[i] > r.seaLevel) { if (maskField[i] > 0) landOnMask++; else landOffMask++; }
  }
  assert.equal(landOffMask, 0, `${landOffMask} land cells sit on no premise mask — that is ocean floor called land`);
  assert.equal(landOnMask, r.landCells);
  assert.equal(masked, 320133, "the masked-cell census moved — a footprint radius changed");
  // …and the shell the fit pins: the masks must supply MORE cells than the rank
  // target, or the threshold has nowhere above the land floor to land.
  assert.ok(masked > r.landCells, "the masks supply no coastal shell at all");
  assert.equal(Math.round(masked / r.landCells * 100) / 100, 1.22, "the mask shell factor moved");
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
  assert.equal(deepest, 916.0540771484375);
  assert.equal(maxFetch, 400);
});
