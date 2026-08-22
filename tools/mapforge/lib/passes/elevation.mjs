// tools/mapforge/lib/passes/elevation.mjs — P2: elevation, and P2b: substrate.
//
// HARD ORDERING (spec 7.3): anything that mutates elev runs BEFORE P3, or
// the ratio guarantee is void. This is the last pass that writes elev.
//
// The construction guarantees the ONE property rank selection depends on:
// every masked cell outranks every unmasked cell. Ocean floor is
// [-1, -0.5]; land is [0.01, 1]. So selecting the k-th largest elevation can
// only ever pick ocean floor if the masks cannot supply k cells — which is
// exactly the premise-footprint bug P3's message names.
//
// On the committed-byte path and scanned by determinism-inventory.test.mjs:
// Math.sqrt only, no `**`, no clock, no random.
import { fbm, smoothstep, falloff } from "../noise.mjs";
import { idx, cellCentreKm, FLAG, SUBSTRATE_MASK } from "../grid.mjs";

// THE TWO BANDS, exported because P3's phantom-land guard is a statement ABOUT
// them: ocean floor is [-1, -0.5] and land is [0.01, 1], with 0.49 of empty
// space between. A sea level inside that gap is impossible; one at or below
// `oceanCeil` means rank selection ran out of masked cells and reached into the
// ocean floor. sea-level.mjs imports these rather than restating them, so the
// guard cannot drift away from the field it guards.
export const ELEVATION_BANDS = Object.freeze({ landFloor: 0.01, oceanCeil: -0.5 });

const BASE_FREQ = 0.006;    // ~165 km wavelength — continental relief
const DETAIL_FREQ = 0.05;   // ~20 km wavelength  — hill and valley grain

// Distance from a point to a segment, no transcendentals beyond sqrt.
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const vv = vx * vx + vy * vy;
  let t = vv === 0 ? 0 : (wx * vx + wy * vy) / vv;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildElevation({ grid, premises, maskField, stream }) {
  for (let cyi = 0; cyi < grid.h; cyi++) {
    for (let cxi = 0; cxi < grid.w; cxi++) {
      const i = idx({ grid, cx: cxi, cy: cyi });
      const [x, y] = cellCentreKm({ grid, cx: cxi, cy: cyi });
      const m = maskField[i];
      if (m === 0) {
        // Ocean floor: a strictly negative band, so it can never outrank land.
        // fbm is in [-1, 1], so this is [-1, -0.5] — the whole band sits below
        // the 0.01 land clamp with 0.5 of headroom.
        grid.elev[i] = -0.75 + 0.25 * fbm({ x: x * BASE_FREQ, y: y * BASE_FREQ, stream, octaves: 3 });
        continue;
      }
      const k = grid.plate[i];
      const premise = premises[k];
      // Base relief: fbm mapped to [0, 1], multiplied by the mask so the
      // coastal shell tapers to zero rather than ending in a cliff.
      const base = 0.5 + 0.5 * fbm({ x: x * BASE_FREQ, y: y * BASE_FREQ, stream, octaves: 6 });
      const detail = 0.5 + 0.5 * fbm({ x: x * DETAIL_FREQ, y: y * DETAIL_FREQ, stream, octaves: 4 });
      let e = 0.02 + 0.62 * m * (0.75 * base + 0.25 * detail);
      // Structural terms: ridged orogen along a spine, cones along an arc.
      for (const s of premise.structures ?? []) {
        if (s.kind === "spine-ridge" || s.kind === "rift-valley" || s.kind === "volcanic-spine") {
          const d = distToSegment(x, y, s.fromKm[0], s.fromKm[1], s.toKm[0], s.toKm[1]);
          const w = falloff({ d, k: 0.08 });                      // rational, not exp
          if (s.kind === "rift-valley") e -= s.amplitude * w * 0.5;
          else e += s.amplitude * w * (s.kind === "volcanic-spine" ? 1 : 0.8);
        } else if (s.kind === "plateau" || s.kind === "ice-divide" || s.kind === "delta-fan") {
          const dx = x - s.atKm[0], dy = y - s.atKm[1];
          const r = Math.sqrt(dx * dx + dy * dy) / s.radiusKm;
          if (r < 1) {
            const w = smoothstep(1 - r);
            e += s.amplitude * w * (s.kind === "delta-fan" ? -0.4 : 1);
          }
        }
      }
      // Clamp into [0.01, 1]: strictly above every ocean-floor value, and
      // bounded so rank selection compares a well-conditioned range.
      grid.elev[i] = e < 0.01 ? 0.01 : e > 1 ? 1 : e;
    }
  }
}

// P2b — SUBSTRATE. Not decoration: Plan B closes `requires.rock` to
// "carbonate" | "clastic" | "volcanic", so a cell with no substrate class makes
// 19 clastic rows and 16 volcanic rows unmatchable, and `instanceLandforms`
// drops all 45 constrained rows into `substitutions` with every gate green.
//
// EXACTLY ONE BIT PER MASKED CELL, and none off the mask. Two things force the
// "exactly one" over the plan's draft, which set a bit only for karst/volcanic/
// desert kits and left everything else bare:
//
//  * seam 1 recorded that grid.mjs has no `setSubstrate` helper and that
//    `hasFlag` on a multi-bit mask has ANY semantics, so an un-cleared mask
//    lets a cell read as two rock types. Clearing SUBSTRATE_MASK first is what
//    makes this pass idempotent and the classes mutually exclusive; and
//  * a bare cell is only "clastic by default" if every reader agrees on that
//    default. Making the default EXPLICIT — FLAG.SAND, which cellView reads as
//    "clastic" (sandstone is a clastic rock) — means the invariant is one that
//    can be MEASURED (`exactly one bit`) rather than one that has to be
//    remembered at each of P10's read sites.
//
// The distribution is driven by the premise, not by taste: a premise whose
// `landformKit` names `karst` gets carbonate ground under most of it, one
// naming `volcanic` gets volcanic ground under its arc, one naming `desert`
// gets sand explicitly. Everything else is clastic.
// RECORDED MUTATION SURVIVOR, measured 2026-08-22 — do not re-derive it.
// Changing SUBSTRATE_FREQ from 0.012 to 0.013 leaves the whole suite green,
// because at the plan's thresholds the noise field DOES NO WORK: `t` is
// 0.5 + 0.5 * fbm(4 octaves), which is tightly concentrated around 0.5, and the
// gates below are 0.25 and 0.3. Measured on the real 800 x 800 grid: c04 is
// 100.00% carbonate and c10 is 100.00% volcanic — not a single cell of either
// falls under its gate, so the ladder never branches and the frequency is
// unobservable. It is NOT dead by accident: no premise names two of the three
// substrate kits, so even a working field would have nothing to interleave.
//
// It is left as the plan wrote it rather than retuned, for two reasons. The
// thresholds are plan data, and retuning them re-rolls the substrate of every
// continent for no stated requirement; and 100% carbonate under "the karst
// continent" and 100% volcanic under "the volcanic arc" is what those premises
// actually say. The GOLDEN test pins both shares at 1.0, so the day a premise
// names two kits — or a threshold moves — it is loud rather than silent.
const SUBSTRATE_FREQ = 0.012;     // ~83 km wavelength — province-scale banding

export function assignSubstrate({ grid, premises, maskField, stream }) {
  const kitOf = premises.map((p) => new Set(p.landformKit));
  for (let cyi = 0; cyi < grid.h; cyi++) {
    for (let cxi = 0; cxi < grid.w; cxi++) {
      const i = idx({ grid, cx: cxi, cy: cyi });
      grid.flags[i] &= ~SUBSTRATE_MASK;            // idempotent: safe to re-run
      grid.flags[i] &= ~FLAG.ARC;                  // ARC is minted here too, and only here
      if (maskField[i] === 0) continue;            // ocean floor carries none
      const k = grid.plate[i];
      const kit = kitOf[k];
      if (!kit) continue;
      const [x, y] = cellCentreKm({ grid, cx: cxi, cy: cyi });
      // One noise field, two gates. See the SUBSTRATE_FREQ note above: at
      // these thresholds neither gate ever rejects a cell, so this is the
      // banding MECHANISM and not, today, banding.
      const t = 0.5 + 0.5 * fbm({ x: x * SUBSTRATE_FREQ, y: y * SUBSTRATE_FREQ, stream, octaves: 4 });
      if (kit.has("volcanic") && t >= 0.25) {
        // ARC is the flag Plan B's volcanic group default pairs with
        // `rock: "volcanic"`. Setting one without the other places nothing.
        // It is set HERE and nowhere else, so `ARC` means "volcanic ground"
        // and a lexicon row asking for `nearFlag: ARC` cannot match the ice cap.
        grid.flags[i] |= FLAG.VOLCANIC | FLAG.ARC;
      } else if (kit.has("karst") && t >= 0.3) {
        grid.flags[i] |= FLAG.CARBONATE;
      } else {
        // The explicit default, including the `desert` kit: clastic ground.
        grid.flags[i] |= FLAG.SAND;
      }
    }
  }
}
