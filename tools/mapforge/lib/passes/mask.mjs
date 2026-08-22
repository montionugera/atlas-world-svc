// tools/mapforge/lib/passes/mask.mjs — P1: hard continental premise masks.
//
// WHY HARD: over 40 free seeds, landmasses >= 1000 km2 came out
// {1:9, 2:13, 3:11, 4:6, 5:1} and ZERO of 40 produced the required continent
// count (spec 4.1). Without a hard mask, c05 is not guaranteed to exist and
// every record bound there dangles. The mask is a signed distance to the
// footprint ellipse through a polynomial smoothstep, domain-warped by two
// fbm octaves so it stops reading as an ellipse.
//
// This file is on the committed-byte path and is scanned by
// tests/determinism-inventory.test.mjs: no transcendental, no `**`, no clock,
// no random. Math.sqrt only, which IEEE 754 mandates be correctly rounded.
import { fbm, smoothstep, q } from "../noise.mjs";
import { idx, cellCentreKm } from "../grid.mjs";

const WARP_FREQ = 0.011;   // ~90 km wavelength: warps the outline, not the pixel

// The domain warp is a function of (cell, stream) ONLY — the premise supplies
// nothing but the amplitude it is scaled by. Computing it once per cell instead
// of once per (cell, premise) is a 13x cut in fbm calls and it is the whole
// reason this pass fits the 4 s generate budget: MEASURED on the real 800 x 800
// grid, 4,725 ms before this hoist and 460 ms after, bit-for-bit identical
// output. The two entry points below therefore share ONE body — a second copy
// of the mask arithmetic is exactly the drift the hoist would otherwise buy.
function warpNoise({ xKm, yKm, stream }) {
  return [
    fbm({ x: xKm * WARP_FREQ, y: yKm * WARP_FREQ, stream, octaves: 2 }),
    fbm({ x: (xKm + 512) * WARP_FREQ, y: (yKm + 512) * WARP_FREQ, stream, octaves: 2 }),
  ];
}

function maskFromWarp({ premise, xKm, yKm, n0, n1 }) {
  const [cx, cy] = premise.footprint.centreKm;
  const [rx, ry] = premise.footprint.radiiKm;
  const a = premise.footprint.warpKm;
  const wx = xKm + a * n0;
  const wy = yKm + a * n1;
  const nx = (wx - cx) / rx, ny = (wy - cy) / ry;
  const d = Math.sqrt(nx * nx + ny * ny);        // 1 at the ellipse boundary
  if (d >= 1) return 0;                          // hard mask: nothing outside the ellipse
  // Structural terms bite INSIDE the footprint only.
  let m = smoothstep(1 - d);
  for (const s of premise.structures ?? []) {
    if (s.kind === "inland-sea") {
      const dx = xKm - s.atKm[0], dy = yKm - s.atKm[1];
      const r = Math.sqrt(dx * dx + dy * dy) / s.radiusKm;
      if (r < 1) m -= s.amplitude * smoothstep(1 - r);      // subtract a lobe
    } else if (s.kind === "atoll-lagoon") {
      const dx = xKm - s.atKm[0], dy = yKm - s.atKm[1];
      const r = Math.sqrt(dx * dx + dy * dy) / s.radiusKm;
      if (r < 0.6) m -= s.amplitude * smoothstep(1 - r / 0.6);
    }
  }
  // `m <= 0 ? 0` and not `Math.max(m, 0)`: -0 is a real value here (the
  // subtractive lobes can land exactly on the rim) and `maskField[i] === 0` is
  // true for -0 while `maskField[i] > 0` is false, so the two predicates the
  // downstream passes use would agree — but `Object.is(m, 0)` would not, and a
  // -0 stored in a Float32Array survives into every later comparison. Return
  // the positive zero.
  return m <= 0 ? 0 : m > 1 ? 1 : m;
}

// [0, 1]. 1 deep inside the footprint, 0 outside the falloff shell.
export function premiseMaskAt({ premise, xKm, yKm, stream }) {
  const [n0, n1] = warpNoise({ xKm, yKm, stream });
  return maskFromWarp({ premise, xKm, yKm, n0, n1 });
}

// Writes grid.plate (argmax over masks, -1 where every mask is 0) and
// returns the winning mask value per cell plus a per-premise cell count.
// TIE-BREAK: lowest premise index wins, so the result never depends on
// iteration order of a Map or on file-system ordering. `m > best`, never
// `m >= best` — that one character IS the tie-break.
export function applyPremiseMasks({ grid, premises, stream }) {
  const maskField = new Float32Array(grid.n);
  const plateArea = new Int32Array(premises.length);
  for (let cyi = 0; cyi < grid.h; cyi++) {
    for (let cxi = 0; cxi < grid.w; cxi++) {
      // Row-major sweep over the whole grid: every (cxi, cyi) is in bounds by
      // construction, which is the one case `idx`'s unguarded arithmetic is
      // safe for. Neighbour walks in later passes must use `neighbourIdx`.
      const i = idx({ grid, cx: cxi, cy: cyi });
      const [x, y] = cellCentreKm({ grid, cx: cxi, cy: cyi });
      const [n0, n1] = warpNoise({ xKm: x, yKm: y, stream });
      let best = 0, bestK = -1;
      for (let k = 0; k < premises.length; k++) {
        const m = maskFromWarp({ premise: premises[k], xKm: x, yKm: y, n0, n1 });
        if (m > best) { best = m; bestK = k; }
      }
      maskField[i] = best;
      grid.plate[i] = bestK;
      if (bestK >= 0) plateArea[bestK]++;
    }
  }
  return { maskField, plateArea };
}

// Exported for the elevation pass's rain-shadow term and for the report.
export const maskSummary = ({ premises, plateArea, cellAreaKm2 }) =>
  premises.map((p, k) => ({ id: p.id, cells: plateArea[k], km2: q(plateArea[k] * cellAreaKm2) }));
