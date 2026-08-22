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
  // Normalise to [0, 1], add a small noise term so identical relief does not
  // produce identical moisture, then set temperature from latitude + height.
  let max = 0;
  for (let i = 0; i < grid.n; i++) if (acc[i] > max) max = acc[i];
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = idx({ grid, cx, cy });
      const [xKm, yKm] = cellCentreKm({ grid, cx, cy });
      const base = max === 0 ? 0 : acc[i] / max;
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
