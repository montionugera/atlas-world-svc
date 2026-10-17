// F-051 completion Task 8, Step 2 — the fabric recompute helper.
//
// WHY THIS EXISTS. Six times this week, published prose asserted something
// about the world that was only true of the SURVEYED subset:
// `.filter(r => r.survey === "surveyed")` gives 40 regions; the fabric gives
// 160 (40 surveyed + 120 reported). This helper's whole job is to make the
// WHOLE-CORPUS number the easy one to get, so nobody reaches for the filtered
// one out of convenience.
//
// HOW "NEVER A SURVEY-FILTERED SET" IS ENFORCED — STRUCTURALLY, NOT BY
// CONVENTION. `population` is not a predicate function and there is no
// `survey`/`filter`/`only` option anywhere on this API. It is one of exactly
// three string shapes (`"world"`, `"landmass:cNN"`, `"road:<id>"`), matched
// by a closed regex below. A caller CANNOT express ".filter(survey ===
// surveyed)" through this function's surface — there is no parameter shape
// that would carry it. `"world"` always resolves to every entry of
// `loadFabricRegionIndex().byRegionId`, which is built from the fabric with
// no survey filter applied (see survey.mjs) — so "world" is a hard 160, not
// "whatever happens to be walked".
//
// THE SIDE DOOR (review round 1, F1) AND WHY IT IS NOW CLOSED TOO. Closing
// the `population` front door does not by itself stop the exact bug this
// helper exists to prevent, because `measure` accepts an arbitrary function:
// `measure: r => r.survey === "surveyed" ? v : NaN, population: "world"`
// walks in through `measure` instead, and the old code silently dropped every
// non-finite value from `ranked` — so it reported `regionCount: 160` while
// quietly ranking only the 40 surveyed ones, which is WORSE than not having
// the helper: the output looks whole-corpus but isn't. `measure` cannot be
// restricted to something that can't compute this (any per-region function
// is, in general, Turing-complete enough to encode a filter), so the fix is
// not to forbid it but to make a drop impossible to have silently: every
// region a measure fails to resolve to a finite number is counted as
// `unmeasured`, and `unmeasured > 0` always raises an entry in `problems`
// naming the count and the population — so a caller can no longer read
// `regionCount: 160` as "we looked at all 160" while `ranked` quietly
// answers for 40. This does not forbid legitimate sparse measures (e.g.
// `biomeShares.bramble` on a region with no bramble) — it makes their
// sparseness visible instead of indistinguishable from a hidden filter.
//
// WHAT THIS HELPER CANNOT SEE — the sixth absence-trap form, encoded rather
// than papered over. The fabric (`content/world/fabric/*.json`) is the
// GENERATOR's output: terrain, biome shares, roads, region polygons. It is
// NOT the drawn world. Concretely, as measured at this commit:
// `content/dungeons/*.json` carries 9 lava-tube dungeon files
// (dungeon-ashen-spar-lava-tubes + dungeon-lavatube-0..7), all HAND-AUTHORED
// (`provenance.authored: "hand"`) and INVISIBLE to this helper — every
// fabric continent's own `dungeonAnchors` array is empty. "The only lava
// tube drawn anywhere in the world" is a claim about that hand-authored
// layer, and this helper has no opinion on it: asking it to count lava tubes
// would silently return 0, which reads as "none exist" rather than "I
// cannot see them". The same blind spot covers `content/world/civil/`
// (pinned canon landmarks), `content/world/resolved/` (the fabric+authored
// join), and settlement/town NAMES (the fabric's `settlements[]` are
// generated stubs, not the authored town roster). Every result this helper
// returns carries `fabricOnly: FABRIC_BLIND_SPOTS` so a caller sees the
// caveat at the call site, not just in this comment.
import { loadFabricRegionIndex } from "./survey.mjs";
import { pointInRing } from "./geometry.mjs";

export const FABRIC_BLIND_SPOTS = Object.freeze([
  "content/dungeons/*.json — hand-authored dungeon instances (9 lava-tube " +
    "files measured at this commit); fabric continents' own dungeonAnchors[] are empty",
  "content/world/civil/** — pinned canon landmarks and their names",
  "content/world/resolved/** — the fabric+authored join (post-pin geography)",
  "settlement/town NAMES — fabric settlements[] are generated stubs, not the authored roster",
]);

const WORLD_RE = /^world$/;
const LANDMASS_RE = /^landmass:(c\d{2})$/;
const ROAD_RE = /^road:(.+)$/;

function safeGet(obj, path) {
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Resolve `population` to the exact set of fabric regions it names. Returns
 * `{ regions, problems }` — never throws, matching this codebase's gate-reader
 * convention (a bad population string is a problem to report, not a crash).
 */
function regionsForPopulation({ population, index }) {
  const problems = [];
  const all = [...index.byRegionId.values()];

  if (WORLD_RE.test(population)) return { regions: all, problems };

  const landmassMatch = population.match(LANDMASS_RE);
  if (landmassMatch) {
    const cId = landmassMatch[1];
    return { regions: all.filter((r) => r.continent === cId), problems };
  }

  const roadMatch = population.match(ROAD_RE);
  if (roadMatch) {
    const roadId = roadMatch[1];
    const road = index.roadsById.get(roadId);
    if (!road) {
      problems.push(`fabric-measure: population "road:${roadId}" names no road loadFabricRegionIndex found`);
      return { regions: [], problems };
    }
    // A road's regions are the fabric regions on ITS continent whose ring
    // contains at least one of the road's own points — composition of two
    // already-committed primitives (loadFabricRegionIndex + geometry.mjs's
    // pointInRing), not a new geometry algorithm and not a second loader.
    const candidates = all.filter((r) => r.continent === road.continent);
    const touched = candidates.filter((r) =>
      (r.rings ?? []).some((ring) =>
        (road.points ?? []).some((point) => pointInRing({ point, points: ring }))));
    return { regions: touched, problems };
  }

  problems.push(
    `fabric-measure: population "${population}" is not one of "world" | "landmass:cNN" | ` +
    `"road:<id>" — there is no other shape this function accepts, so a survey-filtered ` +
    `population cannot be expressed here`);
  return { regions: [], problems };
}

/**
 * Recompute a measure over an EXPLICIT, whole-fabric population — never a
 * survey-filtered subset (see file header for how that is enforced).
 *
 * @param {object} args
 * @param {string} args.contentRoot - repo-relative content/ root.
 * @param {string|(region: object) => number} args.measure - either a dotted
 *   path evaluated against each region record (e.g. "biomeShares.bramble",
 *   "areaKm2"), or a function computing a number from a region record.
 * @param {string} args.population - "world" | "landmass:cNN" | "road:<id>".
 * @returns {{
 *   population: string, measure: string, regionCount: number,
 *   ranked: {region: string, value: number}[],
 *   top: {region: string, value: number}|null,
 *   unmeasured: number,
 *   problems: string[], fabricOnly: readonly string[]
 * }}
 */
export function measureOverWholeFabric({ contentRoot, measure, population }) {
  const index = loadFabricRegionIndex({ contentRoot });
  const { regions, problems } = regionsForPopulation({ population, index });
  const allProblems = [...index.problems, ...problems];

  const isMeasureFn = typeof measure === "function";
  const measureFn = isMeasureFn ? measure : (region) => safeGet(region, measure);
  const measureLabel = isMeasureFn ? "<function>" : measure;

  const resolved = regions.map((r) => ({ region: r.id, value: measureFn(r) }));
  const ranked = resolved
    .filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value))
    .sort((a, b) => (b.value - a.value) || a.region.localeCompare(b.region));
  const unmeasured = resolved.length - ranked.length;

  // F1 fix (review round 1): a drop must never be silent. `regionCount` says
  // how big the population is; `ranked.length` can legitimately be smaller
  // (a sparse measure), but the gap between them must always be named here —
  // never just inferable by a caller doing `regionCount - ranked.length`
  // themselves, which is exactly the step nobody did before this review.
  if (unmeasured > 0)
    allProblems.push(
      `fabric-measure: ${unmeasured} of ${resolved.length} region(s) in population "${population}" ` +
      `had no finite numeric value for measure "${measureLabel}" and were excluded from ranking — ` +
      `if this measure is a function, verify it is not implementing a survey (or other) filter ` +
      `through the back door`);

  return {
    population,
    measure: measureLabel,
    regionCount: regions.length,
    ranked,
    top: ranked[0] ?? null,
    unmeasured,
    problems: allProblems,
    fabricOnly: FABRIC_BLIND_SPOTS,
  };
}
