// tools/mapforge/lib/passes/sea-level.mjs — P3: the land/sea threshold.
//
// INTEGER RANK SELECTION, never a float bisection. Measured (spec 7.3):
// nudging every one of 640,000 elevations by exactly 1 ULP under a bisected
// float threshold flipped 1 cell land<->sea, 1 D8 flow direction, and one
// accumulation value by 2400%. One flipped coastal cell adds or removes a
// coastline vertex -> changes a shoelace -> changes a committed `derived`
// digest -> reds every byte-comparison gate. Selecting the k-th largest
// VALUE and classifying with `elev > seaLevel` makes the classification a
// pure function of the rank ORDER, which a uniform ULP nudge preserves.
//
// This is a GENERATOR module, not a gate: it throws on an impossible
// premise. Gates never throw; generators must, or a broken premise silently
// produces a world with the wrong ratio. check_content.mjs's G-SEALAND is
// the gate half and it reports in-band.
//
// On the committed-byte path and scanned by determinism-inventory.test.mjs:
// no transcendental, no `**`, no clock, no random.
import { FLAG as GRID_FLAG } from "../grid.mjs";
import { ELEVATION_BANDS } from "./elevation.mjs";

export const CELL_AREA_KM2 = 0.25;          // 0.5 km x 0.5 km, pinned in budgets.json
export const FRAME_AREA_KM2 = 160000;
export const LAND_CELL_BAND = Object.freeze([228572, 290908]);   // manifest.grid.landCellBand

// The 0.01 land floor as the Float32Array actually stores it
// (0.009999999776482582). Comparing a Float32 field against the float64 literal
// would make the guard below fire on a legitimate world whose sea level sits
// exactly on the clamp.
const LAND_FLOOR_F32 = new Float32Array([ELEVATION_BANDS.landFloor])[0];

export function selectSeaLevelByRank({ elev, targetLandCells }) {
  const n = elev.length;
  // THE 800 x 800 COUPLING, asserted instead of described. FRAME_AREA_KM2 and
  // CELL_AREA_KM2 are unconditional constants and nothing here consults
  // grid.w/h/cellKm, so on a 500 x 500 grid this function used to return
  // `landKm2 60000, seaKm2 100000` — 160,000 km2 of frame from a grid holding
  // 62,500 — silently, in band. Review D measured exactly that. LAND_CELL_BAND
  // only IMPLIES n = 640,000; any n above its ceiling slips through. Task 9a's
  // fixture world must supply its own threshold rather than calling this, and
  // this is what makes that a contract rather than a note it has to have read.
  if (n * CELL_AREA_KM2 !== FRAME_AREA_KM2)
    throw new Error(
      `sea-level: ${n} cells x ${CELL_AREA_KM2} km2 is ${n * CELL_AREA_KM2} km2, not the pinned ` +
      `${FRAME_AREA_KM2} km2 frame. This selector is calibrated for the 800 x 800 grid ONLY — its ` +
      `cell area, frame area and land-cell band are all absolute. Supply your own threshold for a ` +
      `coarser grid; do not rescale the band.`);
  if (!Number.isInteger(targetLandCells) || targetLandCells <= 0 || targetLandCells >= n)
    throw new Error(`sea-level: targetLandCells ${targetLandCells} is not a valid rank in ${n} cells`);

  // Ascending sort of a COPY — `elev` belongs to the caller and P4 traces its
  // coastlines over it afterwards. TypedArray.sort is numeric and total, so the
  // rank is exact; ties are the only way landCells can miss the target.
  const sorted = Float32Array.from(elev);
  sorted.sort();
  const rankIndex = n - targetLandCells - 1;          // the (k+1)-th largest
  const seaLevel = sorted[rankIndex];

  // One pass, two jobs: the land count, and the non-finite guard. NaN cannot
  // reach here from the real pipeline (hashNoise2D and fbm both throw on a
  // non-finite coordinate), but if it ever does, TypedArray.sort parks NaN at
  // the END of the ascending order, every `elev[i] > seaLevel` is false,
  // landCells comes out 0 and the band check below blames the premise
  // footprints for a bug that is nowhere near them. The misdiagnosis is the
  // defect the guard exists to prevent, not the NaN.
  let landCells = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(elev[i]))
      throw new Error(`sea-level: elevation cell ${i} is non-finite (${elev[i]}). ` +
        `A NaN sorts to the end of the rank order and would be reported as an empty world.`);
    if (elev[i] > seaLevel) landCells++;
  }

  const landKm2 = landCells * CELL_AREA_KM2;
  const seaKm2 = FRAME_AREA_KM2 - landKm2;
  // No `landKm2 === 0 ? Infinity` guard: IEEE division already answers Infinity
  // for 94400 / 0, and the band floor below makes landCells === 0 unreachable
  // anyway. It was a mutation survivor that could not be killed by construction
  // — two independent reasons a fixture can never separate the branches.
  const seaToLandRatio = seaKm2 / landKm2;

  if (landCells < LAND_CELL_BAND[0] || landCells > LAND_CELL_BAND[1])
    throw new Error(
      `sea-level: rank selection produced ${landCells} land cells, band is ` +
      `${LAND_CELL_BAND[0]}-${LAND_CELL_BAND[1]} (land ${landKm2.toFixed(1)} km2, ` +
      `sea ${seaKm2.toFixed(1)} km2, ratio ${seaToLandRatio.toFixed(2)}). ` +
      `Rank selection cannot miss its target unless the elevation field has fewer ` +
      `distinct above-floor values than the target rank — either the premise footprints are ` +
      `wrong (too small, or overlapping into one plate), or a block of ties sits across the ` +
      `rank index, in which case every tied cell classifies as sea and the count undershoots ` +
      `by the size of the block. Widen content/world/premises/*.json ` +
      `footprint radii; do not reroll toward the target and do not widen the band.`,
    );

  // PHANTOM LAND — the failure the message above only CLAIMED to catch.
  //
  // "selecting the k-th largest elevation can only ever pick ocean floor if the
  // masks cannot supply k cells, which is exactly the premise-footprint bug P3's
  // message names" was false in the direction that matters. MEASURED on the
  // plan's own Step 4 radii: this function did NOT throw. It returned
  // landCells === 262,400, dead on target and comfortably in band — by
  // classifying 73,831 OCEAN-FLOOR cells (18,458 km2, 28% of all "land") as
  // land, scattered over the whole frame wherever the ocean fbm happened to
  // peak. Every gate green, and a world growing continents in the open ocean.
  //
  // The band cannot see it, because the count is exactly right. What separates
  // the two worlds is WHERE the threshold fell. buildElevation puts ocean floor
  // in [-1, -0.5] and land in [0.01, 1], so a sea level inside the 0.49-wide gap
  // is impossible: it is either at or above the land floor (every land cell is a
  // masked cell — `land subset of mask`) or down in the ocean band (some of what
  // this function just called land is ocean floor). One comparison decides it.
  if (seaLevel < LAND_FLOOR_F32)
    throw new Error(
      `sea-level: the threshold fell to ${seaLevel}, below the ${ELEVATION_BANDS.landFloor} land floor, ` +
      `so ${landCells} "land" cells include ocean floor that no premise mask covers. Rank selection does ` +
      `NOT throw on this by itself — the count lands exactly on target and inside the band — so this is ` +
      `the guard that catches it. The masks supply fewer cells than the rank target: widen ` +
      `content/world/premises/*.json footprint radii (re-run tools/mapforge/fit-premises.mjs, which holds ` +
      `the shell factor that keeps mask area above the target), and do not lower the target.`);

  return { seaLevel, rank: targetLandCells, landCells, landKm2, seaToLandRatio };
}

// Classify in place: sets FLAG.SEA on every cell at or below sea level.
// Separated from selection so a caller can inspect the threshold first.
//
// FLAG is injected (the plan's signature) but DEFAULTED to grid.mjs's own
// table. Without the default, a caller who omits it makes `grid.flags[i] |=
// undefined` — which is `|= 0` — so the pass runs to completion, reports
// nothing and classifies no water at all.
//
// Re-classifying CLEARS SEA first, so a second call at a different sea level
// answers the new level rather than OR-ing onto the old one. Same discipline as
// P2b's substrate mask, and for the same reason: an in-place pass that is not
// idempotent is a trap for every caller that retries.
export function classifySea({ grid, seaLevel, FLAG = GRID_FLAG }) {
  for (let i = 0; i < grid.n; i++) {
    grid.flags[i] &= ~FLAG.SEA;
    if (!(grid.elev[i] > seaLevel)) grid.flags[i] |= FLAG.SEA;
  }

  // depthM: the grid's 0..1 elevation scaled to metres below sea level. Plan
  // D's pinned harbour records declare `water.minDepthM`, so a port pin that
  // lands on a 2 m shelf must FAIL rather than silently resolve.
  for (let i = 0; i < grid.n; i++)
    grid.depthM[i] = (grid.flags[i] & FLAG.SEA) === 0 ? -1 : (seaLevel - grid.elev[i]) * 1000;

  // fetchKm: for each SEA cell, the longest unobstructed run of sea in the
  // four axis directions — the shelter test that is "the term that does the
  // real work" in settlement scoring (spec 6.5) and the thing Gildmark's
  // `shelterFetchKmMax: 15` is measured against. Four linear sweeps, O(n).
  const runL = new Int32Array(grid.n), runR = new Int32Array(grid.n);
  const runU = new Int32Array(grid.n), runD = new Int32Array(grid.n);
  const sea = (i) => (grid.flags[i] & FLAG.SEA) !== 0;
  for (let y = 0; y < grid.h; y++) {
    let run = 0;
    for (let x = 0; x < grid.w; x++) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runL[i] = run; }
    run = 0;
    for (let x = grid.w - 1; x >= 0; x--) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runR[i] = run; }
  }
  for (let x = 0; x < grid.w; x++) {
    let run = 0;
    for (let y = 0; y < grid.h; y++) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runU[i] = run; }
    run = 0;
    for (let y = grid.h - 1; y >= 0; y--) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runD[i] = run; }
  }
  for (let i = 0; i < grid.n; i++) {
    if (!sea(i)) { grid.fetchKm[i] = -1; continue; }
    const cells = Math.max(runL[i] + runR[i] - 1, runU[i] + runD[i] - 1);
    grid.fetchKm[i] = cells * grid.cellKm;
  }
}
