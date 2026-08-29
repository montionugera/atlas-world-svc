#!/usr/bin/env node
// tools/mapforge/fit-premises.mjs — the footprint fit, committed as a PROCEDURE.
//
// WHY THIS FILE EXISTS. The thirteen premise files carry `footprint.radiiKm`
// that are NOT the plan's Step 4 table, and for a reason nobody can argue with:
// summing the plan's own ellipses gives
//
//   pi * (92*26 + 58*44 + 52*48 + 50*50 + 56*42 + 28*22 + 24*24 + 28*20
//         + 16*22 + 26*11 + 15*15 + 20*12 + 22*12) = pi * 15,411 = 48,415 km2
//
// against the 65,600 km2 `manifest.budget.grossLandPolygonKm2` demands. That is
// a CEILING — no mask implementation can mask more area than the ellipses it is
// handed — so the fit was unavoidable, exactly as the plan's own Step 11
// predicted ("adjust radiiKm, never the mask code").
//
// The first fit was run in a throwaway script and only its OUTPUT was
// committed, which left three things unverifiable: whether it converged, what
// it was fitted TO, and whether re-running it would reproduce the files. This
// is that procedure, committed, and it is a pure function of the manifest plus
// the plan table below.
//
// TWO CORRECTIONS OVER THE FIRST FIT, both from the seam-2 review:
//
//  1. THE TARGET. The first fit used `netKm2 * 1.025` — the 2.5% gross uplift
//     spread UNIFORMLY. But `interiorWaterKm2` is per-continent (c02 1,100,
//     c04 300, c06 200, everything else 0), so the gross polygon a continent
//     needs is `netKm2 + interiorWaterKm2`. The aggregate closes either way
//     (both sum to 65,600) — which is precisely what made the error invisible.
//     Measured against the right target the first fit missed c02 by -6.75% and
//     c06 by -3.95%: after P7 carves c02's 1,100 km2 of inland sea it would
//     have landed on ~10,183 km2 against `netKm2: 11,000`, making the STARTER
//     continent the most cramped one in the world. `areaBandKm2` is a declared
//     downstream interface Plan D re-derives from; an aggregate that closes
//     while individual continents are wrong is the classic form of this defect.
//
//  2. THE STRUCTURES SCALE WITH THE FOOTPRINT. `structures` are absolute km.
//     The first fit grew radii by up to 1.913x and left them where they were,
//     so a ridge that spanned its continent in the plan spanned its middle in
//     the tree — c03's "one unbroken spine ridge END TO END" reached 0.88 of
//     the rim, c12's rift-valley 0.48 — and the committed `structuralIdea`
//     prose contradicted the committed geometry in the same file. The prose is
//     authored canon; the geometry is derived. So the geometry moves: every
//     structure is expressed in FOOTPRINT-RELATIVE coordinates (the plan's, at
//     the plan's radii) and re-materialised at the fitted radii. Because the
//     fit preserves each aspect ratio exactly, that is a uniform scale about
//     the centre — `atKm`/`fromKm`/`toKm` about `centreKm`, `radiusKm` by the
//     same factor. Amplitudes are dimensionless field weights and do not scale.
//
// NOT ON THE COMMITTED-BYTE PATH, but it lives under tools/mapforge/ and so is
// scanned by tests/determinism-inventory.test.mjs: no transcendental, no `**`,
// no clock, no random. Math.sqrt only.
//
// USAGE
//   node tools/mapforge/fit-premises.mjs            # report the fit, write nothing
//   node tools/mapforge/fit-premises.mjs --write    # rewrite content/world/premises/*.json
//
// The committed files are joined to this procedure by mask.test.mjs, which
// rebuilds all thirteen footprints from PLAN_FOOTPRINTS + SCALE and compares.
// That join is cheap; re-running the fit itself (13 x 800 x 800 per iteration)
// is not, and is only needed when a TARGET moves.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { q } from "./lib/noise.mjs";
import { makeGrid, idx } from "./lib/grid.mjs";
import { applyPremiseMasks } from "./lib/passes/mask.mjs";
import { buildElevation } from "./lib/passes/elevation.mjs";
import { CELL_AREA_KM2 } from "./lib/passes/sea-level.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PREM_DIR = join(ROOT, "content/world/premises");
const STREAM = "d9a0051d32afab59";

// The plan's Step 4 geometry table, transcribed verbatim (plan lines 1755-1795:
// the c02 block written out in full, then the twelve-row table). This is the
// BASE the fit scales, and it is the only copy of it — the premise files carry
// the fitted result, so reading them back would compound.
export const PLAN_FOOTPRINTS = Object.freeze({
  c01: { centreKm: [200, 34], radiiKm: [92, 26],
         structures: [{ kind: "ice-divide", atKm: [200, 34], radiusKm: 60, amplitude: 0.45 }] },
  c02: { centreKm: [96, 148], radiiKm: [58, 44],
         structures: [{ kind: "inland-sea", atKm: [104, 156], radiusKm: 19, amplitude: 0.55 },
                      { kind: "spine-ridge", fromKm: [46, 118], toKm: [70, 186], amplitude: 0.32 }] },
  c03: { centreKm: [286, 112], radiiKm: [52, 48],
         structures: [{ kind: "spine-ridge", fromKm: [244, 72], toKm: [326, 154], amplitude: 0.6 }] },
  c04: { centreKm: [306, 246], radiiKm: [50, 50],
         structures: [{ kind: "plateau", atKm: [306, 246], radiusKm: 40, amplitude: 0.28 }] },
  c05: { centreKm: [176, 300], radiiKm: [56, 42],
         structures: [{ kind: "spine-ridge", fromKm: [128, 272], toKm: [136, 336], amplitude: 0.66 }] },
  c06: { centreKm: [70, 268], radiiKm: [28, 22],
         structures: [{ kind: "delta-fan", atKm: [70, 268], radiusKm: 20, amplitude: 0.2 }] },
  c07: { centreKm: [46, 92], radiiKm: [24, 24],
         structures: [{ kind: "spine-ridge", fromKm: [34, 74], toKm: [58, 112], amplitude: 0.4 }] },
  c08: { centreKm: [252, 344], radiiKm: [28, 20],
         structures: [{ kind: "plateau", atKm: [252, 344], radiusKm: 16, amplitude: 0.22 }] },
  c09: { centreKm: [352, 186], radiiKm: [16, 22],
         structures: [{ kind: "spine-ridge", fromKm: [348, 168], toKm: [356, 206], amplitude: 0.5 }] },
  c10: { centreKm: [122, 356], radiiKm: [26, 11],
         structures: [{ kind: "volcanic-spine", fromKm: [98, 352], toKm: [148, 362], amplitude: 0.72 }] },
  c11: { centreKm: [338, 66], radiiKm: [15, 15],
         structures: [{ kind: "atoll-lagoon", atKm: [338, 66], radiusKm: 9, amplitude: 0.5 }] },
  c12: { centreKm: [254, 44], radiiKm: [20, 12],
         structures: [{ kind: "rift-valley", fromKm: [236, 42], toKm: [272, 48], amplitude: 0.38 }] },
  c13: { centreKm: [40, 344], radiiKm: [22, 12],
         structures: [{ kind: "delta-fan", atKm: [40, 344], radiusKm: 14, amplitude: 0.16 }] },
});

// THE FITTED POINT: the output of the loop below, rounded to 6 dp. Verified
// (`--verify`) to reproduce every committed radius and structure coordinate
// byte-for-byte at that rounding — 5 dp also does, 4 dp moves four continents.
// One number per landmass, because the fit preserves each aspect ratio exactly,
// which is what makes the structure scaling a plain similarity transform about
// the centre.
export const SCALE = Object.freeze({
  c01: 1.041765, c02: 1.409942, c03: 1.304916, c04: 1.404124,
  c05: 1.317649, c06: 1.518138, c07: 1.267898, c08: 1.596717,
  c09: 0.973083, c10: 1.057198, c11: 1.428197, c12: 1.911695,
  c13: 1.280557,
});

/** The gross land polygon each landmass must supply: its net area PLUS the
 *  interior water P7 will carve back out of it. Sums to
 *  `budget.grossLandPolygonKm2` by the manifest's own arithmetic. */
export function grossTargetsKm2(manifest) {
  const out = {};
  for (const l of manifest.landmasses) out[l.id] = l.netKm2 + l.interiorWaterKm2;
  return out;
}

const scalePoint = (p, c, s) => [q(c[0] + (p[0] - c[0]) * s), q(c[1] + (p[1] - c[1]) * s)];

/** The plan's footprint at scale `s`: radii, the derived warp, and every
 *  structure carried across in footprint-relative coordinates. */
export function materialise({ base, scale }) {
  const c = base.centreKm;
  const radiiKm = [q(base.radiiKm[0] * scale), q(base.radiiKm[1] * scale)];
  const structures = base.structures.map((s) => {
    const out = { kind: s.kind };
    if (s.atKm) out.atKm = scalePoint(s.atKm, c, scale);
    if (s.fromKm) out.fromKm = scalePoint(s.fromKm, c, scale);
    if (s.toKm) out.toKm = scalePoint(s.toKm, c, scale);
    if (s.radiusKm !== undefined) out.radiusKm = q(s.radiusKm * scale);
    out.amplitude = s.amplitude;
    return out;
  });
  return {
    centreKm: [...c],
    radiiKm,
    // warpKm is NOT in the plan's table — only c02's example value, 12, written
    // against the pre-fit radii [58, 44]. `round(min(rx, ry) * 0.27)`
    // reproduces that 12 exactly there, and keeps the outline wobble
    // proportional as the footprints grow instead of shrinking relative to them.
    warpKm: Math.round(Math.min(radiiKm[0], radiiKm[1]) * 0.27),
    structures,
  };
}

// The committed premise files keep arrays of primitives on ONE line
// (`"centreKm": [96,148]`) and expand only arrays of objects. JSON.stringify's
// indent mode expands everything, so writing with it would reformat all
// thirteen files and bury the geometry change in 400 lines of whitespace diff.
export function stringifyPremise(value, indent = "") {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object"))
      return "[" + value.map((v) => JSON.stringify(v)).join(",") + "]";
    const inner = indent + "  ";
    return "[\n" + value.map((v) => inner + stringifyPremise(v, inner)).join(",\n") + "\n" + indent + "]";
  }
  if (value && typeof value === "object") {
    const inner = indent + "  ";
    return "{\n" + Object.entries(value)
      .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringifyPremise(v, inner)}`)
      .join(",\n") + "\n" + indent + "}";
  }
  return JSON.stringify(value);
}

/** The premise files as the fit would write them: prose and vocabulary from the
 *  committed file, geometry from PLAN_FOOTPRINTS at `scale`. */
export function premiseAtScale({ committed, scale }) {
  const base = PLAN_FOOTPRINTS[committed.id];
  const { centreKm, radiiKm, warpKm, structures } = materialise({ base, scale });
  return { ...committed, footprint: { centreKm, radiiKm, warpKm }, structures };
}

// ── the fit itself ───────────────────────────────────────────────────────────
// Post-rank land per continent is a JOINT function of all thirteen footprints:
// they share one sea level, chosen by rank over the whole field. So this is a
// fixed point, not thirteen independent solves. Area goes as the SQUARE of the
// scale, hence the sqrt in the correction, and the damping is what stops the
// thirteen corrections chasing each other through the shared threshold.

function landPerPlate({ premises, targetLandCells }) {
  const grid = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const { maskField, plateArea } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  const sorted = Float32Array.from(grid.elev);
  sorted.sort();
  // The same rank arithmetic as selectSeaLevelByRank, WITHOUT its band check:
  // an intermediate iterate is legitimately far out of band and must not throw.
  const seaLevel = sorted[grid.n - targetLandCells - 1];
  const cells = new Int32Array(premises.length);
  for (let i = 0; i < grid.n; i++)
    if (grid.elev[i] > seaLevel && grid.plate[i] >= 0) cells[grid.plate[i]]++;
  let masked = 0;
  for (let k = 0; k < plateArea.length; k++) masked += plateArea[k];
  return { cells, seaLevel, masked };
}

// THE FREE PARAMETER THE FIRST FIT LEFT IMPLICIT, now named.
//
// The rank target pins TOTAL land, so the thirteen per-continent errors fix
// only the SPLIT — the overall scale of the footprints is a thirteenth-plus-one
// degree of freedom the errors cannot see. Left free, the damped iteration
// walks it downhill: each continent shrinks until every cell inside its mask is
// above water, which minimises its own error and collapses the shell. MEASURED
// on the unconstrained loop: by iteration 8 the sea level had fallen onto the
// 0.01 land clamp itself, the split became ill-conditioned (a plateau of ties
// at the clamp) and the worst error bounced between 1% and 6.5% forever.
//
// That collapse is not merely a convergence problem, it is the PHANTOM LAND
// failure in slow motion: once the masks supply fewer cells than the rank
// target, `selectSeaLevelByRank` does not throw — it reaches down into the
// ocean floor and classifies it as land, in band, with every gate green. So the
// shell is pinned here and asserted downstream: `seaLevel` must clear the land
// floor, which is exactly the `land subset of mask` invariant P3 now enforces.
//
// 1.22 is the value the first fit reached (measured: 320,221 masked cells
// against a 262,400 rank target); it is kept rather than re-chosen so the
// coastline character does not move for a reason nobody asked for.
export const MASK_SHELL_FACTOR = 1.22;

export function fit({ manifest, committed, iterations = 14, damping = 0.6, tolerancePct = 0.35, scale: scale0 = null, log = () => {} }) {
  const targets = grossTargetsKm2(manifest);
  const targetLandCells = manifest.budget.grossLandPolygonKm2 / CELL_AREA_KM2;
  const ids = committed.map((p) => p.id);
  const scale = {};
  for (const id of ids) scale[id] = scale0 ? scale0[id] : 1;
  let worst = Infinity, report = null;
  for (let it = 0; it < iterations; it++) {
    const premises = committed.map((p) => premiseAtScale({ committed: p, scale: scale[p.id] }));
    const { cells, seaLevel, masked } = landPerPlate({ premises, targetLandCells });
    const rows = ids.map((id, k) => {
      const km2 = cells[k] * CELL_AREA_KM2;
      return { id, km2, target: targets[id], errPct: (km2 - targets[id]) / targets[id] * 100 };
    });
    worst = rows.reduce((m, r) => Math.max(m, Math.abs(r.errPct)), 0);
    report = { iteration: it, seaLevel, worstErrPct: worst, rows, masked, scale: { ...scale } };
    log(`iter ${it}: worst |err| ${worst.toFixed(3)}%  seaLevel ${seaLevel}  masked ${masked}`);
    if (worst < tolerancePct) break;
    for (const r of rows) {
      // area ~ scale^2, so the ideal correction is sqrt(target / actual);
      // damped, because the thirteen solves share one rank threshold.
      const ratio = r.km2 === 0 ? 4 : r.target / r.km2;
      const corr = Math.sqrt(ratio);
      scale[r.id] = scale[r.id] * (1 + damping * (corr - 1));
    }
    // …then renormalise the whole vector back onto the shell constraint, so the
    // corrections only ever redistribute area and never shrink the shell away.
    const f = Math.sqrt(targetLandCells * MASK_SHELL_FACTOR / masked);
    for (const id of ids) scale[id] = scale[id] * f;
  }
  return { scale, report };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//   (no flag)  re-run the fit from scratch and print the scale vector it reaches
//   --verify   score the COMMITTED SCALE against the targets, one pass, no search
//   --write    rewrite content/world/premises/*.json at the committed SCALE
const readCommitted = () => Object.keys(PLAN_FOOTPRINTS).sort()
  .map((id) => JSON.parse(readFileSync(join(PREM_DIR, `continent-${id.slice(1)}.json`), "utf8")));

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifest = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const committed = readCommitted();
  const out = (s) => process.stdout.write(s + "\n");

  if (process.argv.includes("--verify")) {
    const { report } = fit({ manifest, committed, iterations: 1, tolerancePct: 100,
                             log: out, scale: SCALE });
    for (const r of report.rows)
      out(`${r.id}  land ${String(r.km2).padStart(8)} km2  target ${String(r.target).padStart(6)}  err ${r.errPct.toFixed(3)}%`);
    out(`worst |err| ${report.worstErrPct.toFixed(3)}%  masked ${report.masked} cells ` +
        `(${(report.masked / (manifest.budget.grossLandPolygonKm2 / CELL_AREA_KM2)).toFixed(4)} x the rank target)`);
  } else {
    const { scale, report } = fit({ manifest, committed, log: out });
    out("\nSCALE = " + JSON.stringify(scale, null, 2) + "\n");
    for (const r of report.rows)
      out(`${r.id}  land ${String(r.km2).padStart(8)} km2  target ${String(r.target).padStart(6)}  err ${r.errPct.toFixed(3)}%`);
    out(`worst |err| ${report.worstErrPct.toFixed(3)}% after ${report.iteration + 1} iterations`);
  }

  if (process.argv.includes("--write")) {
    for (const p of readCommitted()) {
      const next = premiseAtScale({ committed: p, scale: SCALE[p.id] });
      writeFileSync(join(PREM_DIR, `continent-${p.id.slice(1)}.json`), stringifyPremise(next) + "\n");
    }
    out(`wrote 13 premise files at the committed SCALE`);
  }
}
