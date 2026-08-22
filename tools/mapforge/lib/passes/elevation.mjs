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
      // Clamp into [landFloor, 1]: strictly above every ocean-floor value, and
      // bounded so rank selection compares a well-conditioned range. The floor
      // is ELEVATION_BANDS' own, not a second copy of 0.01 — P3's phantom-land
      // guard compares against that constant, and two literals that must agree
      // are the drift this join exists to prevent.
      grid.elev[i] = e < ELEVATION_BANDS.landFloor ? ELEVATION_BANDS.landFloor : e > 1 ? 1 : e;
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
//    default. Making the default EXPLICIT — FLAG.SAND, which the cell reader
//    Task 10 writes will read as "clastic" (sandstone is a clastic rock; that
//    reader does not exist yet, so the mapping is a convention until it does) —
//    means the invariant is one that can be MEASURED (`exactly one bit`) rather
//    than one that has to be remembered at each of P10's read sites.
//
// THE NOISE FIELD THE PLAN PUT HERE IS GONE, and that is a decision with
// measurements behind it, not a simplification. The plan gated the ladder on
// `t = 0.5 + 0.5 * fbm(4 octaves)` at 0.25 (volcanic) and 0.3 (karst). Measured
// on the real 800 x 800 grid:
//
//  * `t` over EVERY masked cell in the frame ranges [0.2603, 0.8333]. The
//    volcanic gate at 0.25 therefore cannot reject a cell ANYWHERE — not on
//    c10, not on any premise that could ever name the kit. That branch was
//    unconditional;
//  * the karst gate at 0.3 is reachable in principle (4,126 cells in the frame
//    sit below it) but not on c04, the only premise naming `karst`, whose
//    minimum `t` is 0.376. So both gates were dead;
//  * and the ladder could not have interleaved two kits even if they were live:
//    the volcanic branch comes first and `t >= 0.25` is always true, so a
//    premise naming BOTH volcanic and karst would get volcanic on every cell
//    and karst on none. "Banding between two substrate kits" was never a thing
//    this shape could do.
//
// Four mutations proved the same thing from the other side — the frequency, both
// thresholds, and replacing the whole fbm with `const t = 0.5` all left the
// suite green — while the field cost 173 ms of the 4,000 ms generate budget for
// a value nothing read. Retuning the thresholds was rejected (they are plan
// data, and re-rolling the substrate of every continent for no stated
// requirement is a content decision nobody made); so the honest form is the one
// the output has always had: substrate is a pure function of (plate, kit), and
// the whole plate carries one class. That property is now a TEST, which the
// noise version could not have.
//
// If a later plan does want banding, it needs a mechanism this one never was: a
// PARTITION of `t` rather than a shadowing if/else, with thresholds inside the
// field's measured range above — and a premise that names two kits to band
// between.
export function assignSubstrate({ grid, premises, maskField }) {
  const kitOf = premises.map((p) => new Set(p.landformKit));
  for (let i = 0; i < grid.n; i++) {
    grid.flags[i] &= ~SUBSTRATE_MASK;            // idempotent: safe to re-run
    grid.flags[i] &= ~FLAG.ARC;                  // ARC is minted here too, and only here
    if (maskField[i] === 0) continue;            // ocean floor carries none
    const kit = kitOf[grid.plate[i]];
    if (!kit) continue;
    if (kit.has("volcanic")) {
      // ARC is the flag Plan B's volcanic group default pairs with
      // `rock: "volcanic"`. Setting one without the other places nothing.
      // It is set HERE and nowhere else, so `ARC` means "volcanic ground"
      // and a lexicon row asking for `nearFlag: ARC` cannot match the ice cap.
      grid.flags[i] |= FLAG.VOLCANIC | FLAG.ARC;
    } else if (kit.has("karst")) {
      grid.flags[i] |= FLAG.CARBONATE;
    } else {
      // The explicit default: clastic ground. RECORDED MUTATION SURVIVOR —
      // removing "desert" from c05's landformKit leaves this suite green, and
      // that is correct rather than a gap: Plan B's own desert types are
      // `rock: clastic`, so `desert` is not a substrate kit at all and there is
      // deliberately no branch for it. The kit IS read — by Task 8's landform
      // instancing, which picks groups from it — so a kit census belongs there,
      // where dropping a group changes what gets placed.
      grid.flags[i] |= FLAG.SAND;
    }
  }
}
