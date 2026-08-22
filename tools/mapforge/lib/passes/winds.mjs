// tools/mapforge/lib/passes/winds.mjs — P5: prevailing winds + orographic
// rain shadow. This is the pass that makes Thirstwold an erg and Driftholt
// the wettest ground in the world; without it the biome table produces one
// gradient and every continent reads the same.
//
// One sweep per committed wind direction, each carrying a moisture parcel
// across the grid and dropping it in proportion to the elevation GAIN along
// the sweep. No transcendentals: directions come from UNIT_VECTORS and the
// drop curve is a bounded linear ramp. On the committed-byte path and scanned
// by both determinism scans.
import { UNIT_VECTORS, fbm } from "../noise.mjs";
import { idx, cellCentreKm, FLAG } from "../grid.mjs";

// SIXTEEN, not the plan's twelve, and the reason is arithmetic rather than
// taste. The plan picks its direction with `UNIT_VECTORS[(s * 16 / SWEEPS) | 0]`
// at SWEEPS = 12, which selects indices 0,1,2,4,5,6,8,9,10,12,13,14 — an
// UNEVENLY spaced dozen with 22.5-degree gaps three times and a 45-degree gap
// once per quadrant. A rain shadow assembled from those is systematically
// stronger on the bearings that got two neighbours than on the ones that got
// one, which is a directional bias in every biome downstream of it, arriving
// from a rounding expression rather than from anything the world says. Twelve
// evenly spaced directions cannot be drawn from a 16-row table at all. Nothing
// is committed from this pass yet, so taking the whole table is free.
const SWEEPS = UNIT_VECTORS.length;
const PICKUP = 0.12;      // moisture gained per sea cell crossed
const OROGRAPHIC = 3.5;   // drop multiplier per unit of elevation gain
const LEEWARD_DROP = 0.02; // baseline drizzle where the ground is level or falling
const LAPSE = 0.55;       // temperature lost per unit of elevation
const JITTER = 0.06;      // moisture noise, so identical relief is not identical ground
const JITTER_FREQ = 0.02;

// `premises` is NOT a parameter, and its absence is deliberate. The plan's
// signature is `applyWinds({ grid, premises, stream })` and the plan's own body
// never reads `premises` once — the pass is a pure function of relief, the sea
// mask and the stream. Seam 2 deleted P2b's noise field on exactly this
// ground: a pass that takes an input nothing reads invites the next author to
// believe the premises are steering the climate, and they are not. Callers may
// still pass it; an unknown key in an options object is ignored. If a later
// plan wants premise-steered climate, it needs a mechanism, and adding the
// parameter back is the smallest part of it.
export function applyWinds({ grid, stream }) {
  const acc = new Float32Array(grid.n);
  for (let s = 0; s < SWEEPS; s++) {
    const [dx, dy] = UNIT_VECTORS[s];
    for (const [sx, sy] of upwindStarts({ grid, dx, dy })) {
      let x = sx, y = sy;
      let carried = 0.5, prevElev = 0;
      // A ray cannot outlive the diagonal of the frame: the step length is 1
      // and both components are bounded by 1, so w + h steps always reaches the
      // far side. The `break` below is what actually ends it.
      const steps = grid.w + grid.h;
      for (let t = 0; t < steps; t++) {
        const cx = Math.round(x), cy = Math.round(y);
        if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) break;
        const i = idx({ grid, cx, cy });
        if ((grid.flags[i] & FLAG.SEA) !== 0) {
          carried = carried + PICKUP * (1 - carried);
        } else {
          const gain = grid.elev[i] - prevElev;
          const ramp = OROGRAPHIC * gain;
          const drop = carried * (gain > 0 ? (ramp > 1 ? 1 : ramp) : LEEWARD_DROP);
          carried -= drop;
          if (carried < 0) carried = 0;
          acc[i] += drop;
        }
        prevElev = grid.elev[i];
        x += dx; y += dy;
      }
    }
  }
  // ── NORMALISATION — the seam's blocker, and it was the plan's own code ────
  //
  // The plan ends `applyWinds` with `let max = 0; ... base = acc[i] / max`
  // (plan lines 3172-3176). MEASURED on the real 800 x 800 field, that single
  // line destroys the field it just computed:
  //
  //   raw land accumulator  p25 0.0240  p50 0.0518  p75 0.1001  p90 0.1555
  //                         p99 0.6050  max 11.7981   <- one coastal cell
  //   max / p50 = 227.7, so after dividing by max the MEDIAN land cell reads
  //   0.0044; add the +-0.06 jitter below and clamp, and HALF OF ALL LAND
  //   comes back at exactly 0.0000. 99.2% of land then sits under both the
  //   biome desert threshold (0.16) and the settlement fresh-water veto
  //   (0.20) — every continent a desert, no settlement siteable anywhere.
  //
  // The accumulator is NOT the defect and was not changed: 261,077 of 262,400
  // land cells carry distinct values and p1..p90 spans a factor of 1,200. Only
  // the divisor was wrong, and it was wrong in the way a divisor usually is —
  // it was an EXTREMUM. One cell out of 640,000 set the scale for all of them.
  //
  // What replaces it is a saturating ramp against a ROBUST statistic:
  //
  //     moist = acc / (acc + REF),   REF = the 75th-percentile LAND cell
  //
  // Three properties, each of which the max-divisor lacked:
  //
  //  1. SCALE INVARIANT. Multiply every drop by k and REF scales by k, so the
  //     normalised field is unchanged. PICKUP, LEEWARD_DROP and OROGRAPHIC are
  //     per-CELL rates on a grid whose cellKm is a parameter, so without this
  //     the climate would change when the grid is re-tiled. It cannot now.
  //  2. NO ATOM AT EITHER END. The ramp is strictly increasing on [0, inf) and
  //     reaches neither bound, so there is no clamp pile-up to hide behind a
  //     digest. Measured: 2,712 land cells at exactly 0 (all of them cells no
  //     ray ever reached) and 176 at 1, against 141,709 zeros before.
  //  3. AN OUTLIER CANNOT MOVE IT. A quantile is bounded by construction; the
  //     wettest cell in the world can be ten times wetter and REF does not
  //     move at all.
  //
  // WHY p75 AND NOT ANOTHER QUANTILE. The criterion is stated rather than
  // fitted: every one of the plan's own three read-points must DISCRIMINATE —
  // desert (moist < 0.16), the settlement veto (< 0.20) and forest (> 0.48)
  // must each split the land into parts neither of which is degenerate.
  // Measured on the real field, share of land below 0.16 / below 0.20 / above
  // 0.48:
  //
  //     REF = p50   9.8% / 13.4% / 51.8%   (half the world is forest)
  //     REF = p75  20.8% / 27.7% / 27.7%   <- every read-point discriminates
  //     REF = p90  33.3% / 42.2% / 11.4%
  //     acc/p90 clamped  27.5% / 34.2% / 36.3%, but 7,453 cells pile at 1.0
  //     acc/max (shipped) 99.2% / 99.2% / 0.5%
  //
  // p75 is the only candidate that leaves all three between a fifth and a
  // third. THE COMPOSITION TARGET IS NOT WHAT IS BEING FITTED HERE — Task 7
  // owns biome shares and clamps them to each premise's palette. What is being
  // fitted is that the field carries signal at the points the world reads it.
  //
  // tests/water.test.mjs asserts the DISTRIBUTION, not only a digest: a digest
  // of a degenerate field is a perfectly stable digest, which is exactly why
  // nothing in the suite could see this.
  const { ref, landCells } = referenceAccumulation({ grid, acc });
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = idx({ grid, cx, cy });
      const [xKm, yKm] = cellCentreKm({ grid, cx, cy });
      const base = ref === 0 ? 0 : acc[i] / (acc[i] + ref);
      const jitter = JITTER * fbm({ x: xKm * JITTER_FREQ, y: yKm * JITTER_FREQ, stream, octaves: 3 });
      const m = base + jitter;
      grid.moist[i] = m < 0 ? 0 : m > 1 ? 1 : m;
      // Temperature: 1 at the south edge, 0 at the north edge, minus lapse.
      const lat = yKm / (grid.h * grid.cellKm);
      const lapse = grid.elev[i] > 0 ? LAPSE * grid.elev[i] : 0;
      const t = lat - lapse;
      grid.temp[i] = t < 0 ? 0 : t > 1 ? 1 : t;
    }
  }
  return { landCells, referenceAcc: ref };
}

// The half-saturation reference: the REF_QUANTILE-th value of the accumulator
// over LAND cells only. Sea cells never receive a drop, so including them would
// put 59% of the sample at exactly 0 and drag any quantile onto it.
//
// Order-independent by the same argument sea-level.mjs makes for rank
// selection: only the VALUE at one index is read, never a position, so sort
// stability cannot reach the answer. TypedArray sort is numeric and total.
const REF_QUANTILE = 0.75;
function referenceAccumulation({ grid, acc }) {
  let n = 0;
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.SEA) === 0) n++;
  if (n === 0) return { ref: 0, landCells: 0 };   // an all-sea frame has no moisture field to scale
  const vals = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < grid.n; i++) if ((grid.flags[i] & FLAG.SEA) === 0) vals[k++] = acc[i];
  vals.sort();
  const ref = vals[Math.round(REF_QUANTILE * (n - 1))];
  // THE COLLAPSE GUARD. If a quarter of the land is dry enough that the 75th
  // percentile is still zero, there is no distribution left to normalise and
  // every downstream threshold reads the same answer everywhere. That is the
  // failure this whole comment block exists about, and it must be LOUD at the
  // source rather than a quiet digest three tasks later.
  if (!(ref > 0))
    throw new Error(
      `winds: the moisture accumulator is degenerate — its ${REF_QUANTILE * 100}th ` +
      `percentile over ${n} land cells is ${ref}. Normalising it would put the whole ` +
      `world below every biome and settlement threshold. Check that the sea mask is ` +
      `set (classifySea runs before P5) and that the sweeps reach the land.`);
  return { ref, landCells: n };
}

// THE UPWIND BOUNDARY, enumerated explicitly per direction — which is the
// plan's own Step 19 remedy, applied without waiting for the coverage counter
// to embarrass the original.
//
// What the plan wrote was `x = startX + (|dx| < |dy| ? k : 0)`, `y = startY +
// (|dy| <= |dx| ? k : 0)` over a single k in [0, w + h): one boundary line per
// direction, never two. For any direction that is not axis-aligned that leaves
// STRIPES — rays launched only from the top row at 45 degrees sweep a family of
// parallel diagonals that never reaches the lower-left of the frame at all.
// tests/water.test.mjs counts the visits and reds if a single cell of the
// 640,000 is missed on any of the sixteen bearings.
//
// The rule is the obvious one once stated: the wind enters through the edges it
// blows away from. A ray from every cell of both of those edges, stepped by the
// unit vector, covers the frame — adjacent rays stay within one cell of each
// other because neither component exceeds 1.
function upwindStarts({ grid, dx, dy }) {
  const starts = [];
  if (dx > 0) for (let y = 0; y < grid.h; y++) starts.push([0, y]);
  else if (dx < 0) for (let y = 0; y < grid.h; y++) starts.push([grid.w - 1, y]);
  if (dy > 0) for (let x = 0; x < grid.w; x++) starts.push([x, 0]);
  else if (dy < 0) for (let x = 0; x < grid.w; x++) starts.push([x, grid.h - 1]);
  return starts;
}
