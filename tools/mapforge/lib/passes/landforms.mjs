// tools/mapforge/lib/passes/landforms.mjs — P10: count-targeted instancing.
//
// A landform is NEVER sprinkled: it is a QUERY over cell fields, so it can only
// appear where the model produced its substrate. That is what stops a landform
// quota deadlocking against terrain (spec §10, R8).
//
// And counts are SELECTED, not sampled: with the continent already pinned,
// karst groups still came out {2..7} and cave-capable uplands {2..13} across
// seeds — pinning the continent moves the instability down one level, it does
// not remove it. So the budget is fixed per REGION and every choice inside it
// is a deterministic ranking, exactly as sea level takes the k-th largest
// elevation (spec §7.3, P10).
//
// THE BUDGET IS PER REGION, NOT PER CONTINENT BY LAND SHARE, and the plan's own
// arithmetic is what forces it. The plan spreads 1,740 instances across the
// continents in proportion to land area and then names them per tier: 240 in
// surveyed regions, 60 across the reported ones, 36 on water. Surveyed regions
// hold 25,600 of 256,000 net-land cells — a tenth — so an area-proportional
// budget puts about 174 instances in them, and the naming census demands 276
// there. It cannot close, and no fixture in the plan's suite can see it because
// they all run on a synthetic square with six regions.
//
// The plan states the missing number itself, at line 350: "a reported region's
// POI count is exactly 0 while it still carries 8 texture instances". 120 x 8 =
// 960, 1,740 - 960 = 780 over 40 surveyed regions = 19.5 each. That closes to
// 1,740 exactly, it is the 7x detail ratio §6.4 rule 2 describes, and it leaves
// 780 instances in surveyed regions for a census that needs 276 named.
import { createHash } from "node:crypto";
import { FLAG, idx, neighbourIdx } from "../grid.mjs";
import { hashNoise2D, q, UNIT_VECTORS } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";

// Spec §6.6, verbatim. Sums to 1,740. These are WEIGHTS on the per-region type
// draw, not per-group output quotas: the manifest carries no group column, and
// the achieved distribution is measured in tests/landforms.test.mjs instead of
// being forced.
export const GROUP_TARGETS = Object.freeze({
  coastal: 300, fluvial: 260, mountain: 200, glacial: 190, karst: 160, erosional: 140,
  desert: 130, volcanic: 110, wetland: 90, lakes: 70, island: 55, oceanic: 35,
});

// Plan line 350. A reported region is drawn with texture and no points of
// interest; a surveyed one is walked. The two together must close on the
// manifest's instance total, which tests/landforms.test.mjs asserts.
export const REPORTED_INSTANCES_PER_REGION = 8;

// Two cells — the plan's figure. Instances of ONE type never stack.
const MIN_SEPARATION_CELLS = 2;

// A ring or polyline finer than half a grid cell asserts detail the model does
// not have: the grid's own resolution is 0.5 km and every committed number
// passes q(), whose quantum is 0.01 km. Below this the octagon's eight
// vertices stop being distinguishable after quantisation.
const MIN_FOOTPRINT_KM = 0.25;

const FLAG_NAMES = Object.keys(FLAG);

// THE predicate language, and there is exactly ONE definition of it.
//
// The authority is `requires` in content/schemas/landform-type.schema.json
// (Plan B Task 1), because that schema is COMMITTED and validates all 170
// lexicon rows with additionalProperties: false. This list must be its exact
// mirror: eleven keys, no more and no fewer. An unknown key THROWS rather than
// silently matching, because a typo in a 170-row lexicon that quietly matches
// everything is exactly the failure this design cannot afford (a landform
// appearing where its substrate does not exist).
//
// Two keys deserve a note because an earlier draft of this function had
// different ones and P10 would have thrown on essentially the whole lexicon:
//   - `nearFlag` (a single FLAG name), NOT `flagsAny/All/None`. 105 of the 170
//     committed rows use it — SEA 40, GLACIER 22, ARC 15, RIVER 14, LAKE 13,
//     DELTA 1. It tests the 9-cell neighbourhood, not the cell itself — "near
//     the sea", not "is sea".
//   - `tempDecileMin/Max` (0-9 deciles), NOT `tempMin/Max` (raw values).
//     Deciles are rank-based and therefore immune to the 1-ULP problem that
//     forced rank selection on sea level in the first place.
// `coastal` is NOT a key: it is spelled `{ "nearFlag": "SEA" }`.
export const REQUIRES_KEYS = Object.freeze([
  "rock", "precipDecileMin", "precipDecileMax", "tempDecileMin", "tempDecileMax",
  "slopeMin", "slopeMax", "nearFlag", "flowAccMin", "elevMin", "elevMax",
]);

// The `rock` VALUE domain, and it must equal the schema's enum exactly. This is
// a separate closure from REQUIRES_KEYS because the key-set cross-check passes
// while a value never matches: an earlier draft's cellView returned "sandstone"
// | "granite", so `rock: "clastic"` (19 rows) and `rock: "volcanic"` (16)
// matched nothing at all and 45 of the 170 types degraded to `substitutions`
// with G-LANDFORM quietly short. (45, not the plan's 35 — counted against the
// committed lexicon: carbonate 10, clastic 19, volcanic 16.)
export const PRODUCIBLE_ROCK = Object.freeze(new Set(["carbonate", "clastic", "volcanic"]));

export function matchesRequires({ requires, cell }) {
  for (const [key, want] of Object.entries(requires ?? {})) {
    switch (key) {
      case "rock": {
        // Loud on a value cellView can never return, for the same reason an
        // unknown KEY throws: a `rock` the generator cannot produce matches
        // nothing, and "matches nothing" is indistinguishable from "this
        // terrain is rare" once it reaches the substitutions list.
        if (!PRODUCIBLE_ROCK.has(want))
          throw new Error(`landforms: rock "${want}" is not a substrate class ` +
            `(${[...PRODUCIBLE_ROCK].join(", ")}) — cellView can never return it`);
        if (cell.rock !== want) return false;
        break;
      }
      case "precipDecileMin": if (!(cell.precipDecile >= want)) return false; break;
      case "precipDecileMax": if (!(cell.precipDecile <= want)) return false; break;
      case "tempDecileMin": if (!(cell.tempDecile >= want)) return false; break;
      case "tempDecileMax": if (!(cell.tempDecile <= want)) return false; break;
      case "elevMin": if (!(cell.elev >= want)) return false; break;
      case "elevMax": if (!(cell.elev <= want)) return false; break;
      case "slopeMin": if (!(cell.slope >= want)) return false; break;
      case "slopeMax": if (!(cell.slope <= want)) return false; break;
      case "flowAccMin": if (!(cell.flowAcc >= want)) return false; break;
      case "nearFlag": {
        const bit = FLAG[want];
        if (bit === undefined)
          throw new Error(`landforms: nearFlag "${want}" is not a FLAG (${FLAG_NAMES.join(", ")})`);
        // "near", not "is": the cell itself or any of its 8 neighbours.
        if ((cell.nearFlags & bit) === 0) return false;
        break;
      }
      default:
        throw new Error(
          `landforms: unknown predicate "${key}" in a lexicon requires block — ` +
          `the legal keys are exactly ${REQUIRES_KEYS.join(", ")}, mirroring ` +
          `content/schemas/landform-type.schema.json's requires block (flags: ${FLAG_NAMES.join(", ")})`);
    }
  }
  return true;
}

const ROCK_CODE = Object.freeze({ carbonate: 0, volcanic: 1, clastic: 2 });

/**
 * `matchesRequires` compiled to a flat record of sentinels.
 *
 * The pass tests every kit type against every cell of every region — measured,
 * 16.1 million (cell, type) pairs on the real world — and `Object.entries` plus
 * a string switch allocates an array and a pair of strings on each one. The
 * compiler runs the SAME validation (so an unknown key or an unproducible rock
 * still throws, at load rather than per cell) and hands back integers.
 *
 * tests/landforms.test.mjs sweeps every committed lexicon row against 4,000
 * real cells and asserts the two agree on all of them, so the fast path cannot
 * drift from the reference.
 */
export function compileRequires({ requires, id = "?" }) {
  const c = {
    rock: -1, precipMin: -1, precipMax: 10, tempMin: -1, tempMax: 10,
    slopeMin: -1, slopeMax: Infinity, nearFlag: 0, flowAccMin: -1,
    elevMin: -Infinity, elevMax: Infinity,
  };
  for (const [key, want] of Object.entries(requires ?? {})) {
    switch (key) {
      case "rock":
        if (!PRODUCIBLE_ROCK.has(want))
          throw new Error(`landforms: rock "${want}" is not a substrate class ` +
            `(${[...PRODUCIBLE_ROCK].join(", ")}) — cellView can never return it (type ${id})`);
        c.rock = ROCK_CODE[want]; break;
      case "precipDecileMin": c.precipMin = want; break;
      case "precipDecileMax": c.precipMax = want; break;
      case "tempDecileMin": c.tempMin = want; break;
      case "tempDecileMax": c.tempMax = want; break;
      case "elevMin": c.elevMin = want; break;
      case "elevMax": c.elevMax = want; break;
      case "slopeMin": c.slopeMin = want; break;
      case "slopeMax": c.slopeMax = want; break;
      case "flowAccMin": c.flowAccMin = want; break;
      case "nearFlag": {
        const bit = FLAG[want];
        if (bit === undefined)
          throw new Error(`landforms: nearFlag "${want}" is not a FLAG (${FLAG_NAMES.join(", ")}) (type ${id})`);
        c.nearFlag = bit; break;
      }
      default:
        throw new Error(
          `landforms: unknown predicate "${key}" in a lexicon requires block — ` +
          `the legal keys are exactly ${REQUIRES_KEYS.join(", ")}, mirroring ` +
          `content/schemas/landform-type.schema.json's requires block (type ${id})`);
    }
  }
  return c;
}

export function mintHandle({ continent, group, contentHash }) {
  return `${continent}/${group}/h-${contentHash.replace(/^sha256:/, "").slice(0, 4)}`;
}

// THE total ordering key: (-sizeKm, contentHash). NEVER insertion order, NEVER
// lore.order — the failure mode R3 names (a region silently disappearing
// because it had no lore.order) applies identically here.
//
// The plan sorts on `sizeKm * sizeKm` and calls it area. Squaring is monotone
// on positive numbers, so it is the same order by a name that is wrong for two
// of the three geometries: a `point` type's sizeKm is a diameter and a `line`
// type's is a length, and neither squares into an area. The key is named for
// what it is.
export function orderHandles({ handles }) {
  const sorted = [...handles].sort((a, b) => {
    if (b.sizeKm !== a.sizeKm) return b.sizeKm - a.sizeKm;
    return a.contentHash < b.contentHash ? -1 : a.contentHash > b.contentHash ? 1 : 0;
  });
  return sorted.map((h, rank) => ({ ...h, rank }));
}

// The committed ledger digest. It covers the RANK and every field the ledger
// row states, not only the handle string: the plan's own test asserts that
// changing a handle's `sizeKm` changes the digest, and with a `rank:handle:hash`
// body it does not — sizeKm reaches the digest only through contentHash, which
// a hand-edited ledger would not have recomputed. Ordering AND content, so a
// silent edit to a committed ledger is a gate failure either way.
export function orderDigestOf({ handles }) {
  const body = handles
    .map((h) => `${h.rank}:${h.handle}:${h.type ?? ""}:${h.sizeKm}:${h.region ?? ""}:${h.contentHash}`)
    .join("\n");
  return "sha256:" + createHash("sha256").update(body).digest("hex");
}

/**
 * Resolve 4-hex handle collisions deterministically, in RANK order.
 *
 * 4 hex is 65,536 values. Handles are namespaced `<cNN>/<group>/h-XXXX`, so a
 * collision only bites inside one (continent, group) bucket — about 30
 * instances per bucket across roughly 50 buckets, which by the birthday bound
 * is a ~30% chance of at least one collision somewhere in the world per seed.
 * That is not a hazard to hope away: Plan D binds `bind.handle` to these
 * strings.
 *
 * The plan extends the LATER-ranked member to 6 hex in a single pass keyed on a
 * `seen` map that only ever holds the FIRST occupant — so a three-way collision
 * gives two members the same 6-hex tail and the second write is silent. This
 * walks the prefix out one nibble at a time, 4 -> 5 -> 6, and takes the first
 * length free in that bucket. `landform-instance.schema.json` allows
 * `h-[0-9a-f]{4,6}`, so 6 is the last legal length and a bucket that cannot be
 * resolved inside it THROWS rather than shipping a duplicate.
 */
export function resolveHandleCollisions({ handles }) {
  const taken = new Set();
  let collisions = 0;
  for (const h of handles) {
    const stem = h.handle.slice(0, h.handle.lastIndexOf("-") + 1);
    const hex = h.contentHash.replace(/^sha256:/, "");
    let resolved = null;
    for (let len = 4; len <= 6; len++) {
      const candidate = stem + hex.slice(0, len);
      if (taken.has(candidate)) continue;
      resolved = candidate;
      if (len > 4) collisions++;
      break;
    }
    if (resolved === null)
      throw new Error(`landforms: handle ${h.handle} collides at 4, 5 and 6 hex — ` +
        `the grammar has no longer legal form`);
    h.handle = resolved;
    taken.add(resolved);
  }
  return { collisions };
}

// ── the ranking key ───────────────────────────────────────────────────────
//
// A 32-bit integer mix of (cell, type). It is a RANKING key and nothing else:
// no committed number is derived from it, only WHICH cell of the many that
// satisfy a predicate is chosen. It is built from one hashNoise2D value per
// cell per continent rather than one per (cell, type) because the latter is
// millions of calls — hashNoise2D re-validates its stream with a regex on every
// one — and because integer mixing is exact on every engine (Math.imul is
// specified as exact 32-bit multiplication; the determinism inventory bans the
// transcendentals, not these).
const mix32 = (h, salt) => {
  let x = (h ^ salt) >>> 0;
  x = Math.imul(x, 0x2545f491) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x27d4eb2d) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
// A 16-hex stream to a 32-bit salt, by the same rule noise.mjs's streamInt uses.
const saltOf = (s) => Number.parseInt(s.slice(0, 8), 16) >>> 0;

/**
 * Everything a predicate can read, for ONE cell. The reference reader — the
 * pass itself uses the flat arrays `buildCellViews` fills, and
 * tests/landforms.test.mjs asserts the two agree cell by cell.
 *
 * `nearFlags` is the OR of the 9-cell neighbourhood (the cell itself plus its 8
 * D8 neighbours). `undefined & bit === 0`, so a missing field is not a crash —
 * it is a SILENT false, and 105 of the 170 committed rows carry a `nearFlag`.
 *
 * `rock` returns the closed enum landform-type.schema.json declares. The three
 * substrate bits are written by P2b (`assignSubstrate`); FLAG.SAND is the
 * explicit clastic default, and a cell with no substrate bit is clastic too.
 */
export function cellView({ grid, i }) {
  let slope = 0;
  let nearFlags = grid.flags[i];              // "near" includes the cell itself
  for (let d = 0; d < 8; d++) {
    const ni = neighbourIdx({ grid, i, d });
    if (ni < 0) continue;
    const dz = grid.elev[i] - grid.elev[ni];
    const a = dz > 0 ? dz : -dz;
    if (a > slope) slope = a;
    nearFlags |= grid.flags[ni];
  }
  return {
    elev: grid.elev[i], flowAcc: grid.flowAcc[i],
    flags: grid.flags[i], nearFlags, slope,
    precipDecile: Math.min(9, Math.floor(grid.moist[i] * 10)),
    tempDecile: Math.min(9, Math.floor(grid.temp[i] * 10)),
    rock: (grid.flags[i] & FLAG.CARBONATE) !== 0 ? "carbonate"
      : (grid.flags[i] & FLAG.VOLCANIC) !== 0 ? "volcanic" : "clastic",
  };
}

/** The same view for a whole continent, as parallel typed arrays. */
function buildCellViews({ grid, cells }) {
  const n = cells.length;
  const v = {
    elev: new Float32Array(n), flowAcc: new Float32Array(n), slope: new Float32Array(n),
    nearFlags: new Uint16Array(n), precip: new Int8Array(n), temp: new Int8Array(n),
    rock: new Int8Array(n),
  };
  for (let p = 0; p < n; p++) {
    const i = cells[p];
    let slope = 0;
    let near = grid.flags[i];
    for (let d = 0; d < 8; d++) {
      const ni = neighbourIdx({ grid, i, d });
      if (ni < 0) continue;
      const dz = grid.elev[i] - grid.elev[ni];
      const a = dz > 0 ? dz : -dz;
      if (a > slope) slope = a;
      near |= grid.flags[ni];
    }
    v.elev[p] = grid.elev[i];
    v.flowAcc[p] = grid.flowAcc[i];
    v.slope[p] = slope;
    v.nearFlags[p] = near;
    v.precip[p] = Math.min(9, Math.floor(grid.moist[i] * 10));
    v.temp[p] = Math.min(9, Math.floor(grid.temp[i] * 10));
    v.rock[p] = (grid.flags[i] & FLAG.CARBONATE) !== 0 ? ROCK_CODE.carbonate
      : (grid.flags[i] & FLAG.VOLCANIC) !== 0 ? ROCK_CODE.volcanic : ROCK_CODE.clastic;
  }
  return v;
}

const satisfies = (v, p, c) =>
  (c.rock < 0 || v.rock[p] === c.rock) &&
  v.precip[p] >= c.precipMin && v.precip[p] <= c.precipMax &&
  v.temp[p] >= c.tempMin && v.temp[p] <= c.tempMax &&
  v.elev[p] >= c.elevMin && v.elev[p] <= c.elevMax &&
  v.slope[p] >= c.slopeMin && v.slope[p] <= c.slopeMax &&
  v.flowAcc[p] >= c.flowAccMin &&
  (c.nearFlag === 0 || (v.nearFlags[p] & c.nearFlag) !== 0);

// The eight 45-degree unit vectors, taken from the committed table because
// Math.cos is banned. Counter-clockwise, which is the positive winding the
// signed shoelace in scripts/lib/spine.mjs requires.
const OCTAGON = [0, 2, 4, 6, 8, 10, 12, 14].map((k) => UNIT_VECTORS[k]);

/**
 * The drawn footprint of one instance, in the shape
 * landform-instance.schema.json declares for its geometry.
 *
 * THE PLAN WRITES `{ shape, at }` FOR ALL THREE GEOMETRIES. The committed
 * schema is a `oneOf` with `additionalProperties: false` on every branch: a
 * `point` takes `at`, a `line` takes `points` (2-40) and an `area` takes `ring`
 * (3-40). 126 of the 170 lexicon rows are line or area, so the plan's record
 * fails validation on three quarters of the world the moment Task 11 puts an
 * ajv venue on the fabric.
 */
export function footprintOf({ shape, atKm, sizeKm, salt }) {
  if (shape === "point") return { shape: "point", at: atKm };
  const half = Math.max(sizeKm / 2, MIN_FOOTPRINT_KM);
  if (shape === "line") {
    // A three-point polyline along a committed unit vector, kinked at the
    // middle so it is a polyline and not a chord pretending to be one.
    const [dx, dy] = UNIT_VECTORS[salt % UNIT_VECTORS.length];
    const kick = half * 0.3;
    return { shape: "line", points: [
      [q(atKm[0] - dx * half), q(atKm[1] - dy * half)],
      [q(atKm[0] - dy * kick), q(atKm[1] + dx * kick)],
      [q(atKm[0] + dx * half), q(atKm[1] + dy * half)],
    ] };
  }
  return { shape: "area", ring: OCTAGON.map(([dx, dy]) =>
    [q(atKm[0] + dx * half), q(atKm[1] + dy * half)]) };
}

/**
 * P10. Writes grid.landform and grid.landformNames.
 *
 * `regions` are P9's records; `grid.owner` indexes into them.
 */
export function instanceLandforms({ grid, premises, regions, lexicon, manifest, stream }) {
  if (!Array.isArray(regions) || regions.length === 0)
    throw new Error("landforms: P9 partitionRegions must run before P10");
  const instances = [];
  const ledgers = [];
  const substitutions = [];
  const shortfalls = [];
  const typesPlaced = new Set();
  const totalTypes = lexicon.length;
  const byRegionIndex = regions;                     // grid.owner indexes into this

  // ── the per-region budget ───────────────────────────────────────────────
  const grandTotal = manifest.landformCatalogue.instances.total;
  const nReported = regions.filter((r) => r.survey === "reported").length;
  const nSurveyed = regions.length - nReported;
  const budgetOf = new Map();
  let reportedEach = REPORTED_INSTANCES_PER_REGION;
  let surveyedPool = grandTotal - nReported * reportedEach;
  if (nSurveyed === 0 || surveyedPool < nSurveyed) {
    // A corpus with no surveyed regions, or too few instances to give the
    // reported ones eight each, splits by area weight instead — and SAYS so.
    shortfalls.push({ what: "budget",
      why: `${grandTotal} instances cannot give ${nReported} reported regions ` +
        `${reportedEach} each and still seat ${nSurveyed} surveyed regions` });
    reportedEach = Math.floor(grandTotal / (regions.length || 1));
    surveyedPool = grandTotal - nReported * reportedEach;
  }
  const surveyedEach = nSurveyed > 0 ? Math.floor(surveyedPool / nSurveyed) : 0;
  let surveyedExtra = nSurveyed > 0 ? surveyedPool - surveyedEach * nSurveyed : 0;
  for (const r of regions) {
    if (r.survey === "reported") { budgetOf.set(r.id, reportedEach); continue; }
    budgetOf.set(r.id, surveyedEach + (surveyedExtra > 0 ? 1 : 0));
    if (surveyedExtra > 0) surveyedExtra--;
  }

  // ── the cells each region owns ──────────────────────────────────────────
  const cellsOfRegion = new Map(regions.map((r) => [r.id, []]));
  for (let i = 0; i < grid.n; i++) {
    const o = grid.owner[i];
    if (o < 0 || o >= regions.length) continue;
    if ((grid.flags[i] & (FLAG.SEA | FLAG.LAKE)) !== 0) continue;
    cellsOfRegion.get(regions[o].id).push(i);
  }

  for (let k = 0; k < premises.length; k++) {
    const premise = premises[k];
    const mine = regions.filter((r) => r.continent === premise.id);
    const contStream = mintSeed({ parentStream: stream, name: `landform:${premise.id}` });
    const contSalt = saltOf(contStream);
    const kit = new Set(premise.landformKit);
    // A type belongs to a kit through its primary group OR through the one
    // `alsoGroups` entry the schema allows — that is what the manifest's 178
    // group memberships against 170 types mean, and dropping it would make
    // eight types unplaceable by an accident of which column they were filed
    // under.
    const kitTypes = [];
    for (let t = 0; t < lexicon.length; t++) {
      const row = lexicon[t];
      const groups = [row.group, ...(row.alsoGroups ?? [])];
      const via = groups.find((g) => kit.has(g));
      if (via === undefined) continue;
      kitTypes.push({ t, row, via, weight: GROUP_TARGETS[via] ?? 1,
                      pred: compileRequires({ requires: row.requires, id: row.id }),
                      salt: saltOf(mintSeed({ parentStream: contStream, name: row.id })) });
    }
    if (mine.length === 0 || kitTypes.length === 0) {
      ledgers.push({ continent: premise.id, orderDigest: orderDigestOf({ handles: [] }), handles: [] });
      continue;
    }

    const contInstances = [];
    const slots = [];
    let contBudget = 0;
    for (const region of mine) {
      const cells = cellsOfRegion.get(region.id);
      const budget = budgetOf.get(region.id) ?? 0;
      contBudget += budget;
      if (budget === 0 || cells.length === 0) continue;
      const views = buildCellViews({ grid, cells });
      const regionSalt = mix32(contSalt, saltOf(mintSeed({ parentStream: contStream, name: region.id })));

      // The best candidate cells per type in this region, by the ranking key.
      // Only the best few are kept, so the scan is one pass over the region's
      // cells with a bounded insert rather than a per-type candidate list.
      const best = kitTypes.map(() => []);
      const counts = new Int32Array(kitTypes.length);
      for (let p = 0; p < cells.length; p++) {
        const cellHash = hashNoise2D({
          x: (cells[p] % grid.w) * 0.61, y: ((cells[p] / grid.w) | 0) * 0.61, stream: contStream });
        const h32 = ((cellHash + 1) * 1073741823.5) >>> 0;
        for (let n = 0; n < kitTypes.length; n++) {
          if (!satisfies(views, p, kitTypes[n].pred)) continue;
          counts[n]++;
          insertBest(best[n], mix32(h32, kitTypes[n].salt), cells[p]);
        }
      }

      // WEIGHTED, WITHOUT REPLACEMENT, AND EXACT. The draw key is
      // u(region, type) / weight, so a group with a larger §6.6 target is more
      // likely to be drawn, and each type is drawn at most once per round —
      // which is what stops all 120 reported regions carrying the same eight
      // types, the outcome a plain largest-remainder split of eight instances
      // over seventy-six types gives (identical weights in every region, so
      // identical winners).
      const draw = kitTypes.map((kt, n) => {
        const u = (mix32(regionSalt, kt.salt) + 1) / 4294967297;
        return [u / kt.weight, n];
      }).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

      const slot = { region, budget, best, counts, draw, used: [], placed: 0 };
      slots.push(slot);
      for (let round = 0; round < 4 && slot.placed < budget; round++)
        fillSlot({ slot, kitTypes, budget, grid, premise, contStream, contSalt, contInstances, typesPlaced });
    }

    // THE TOP-UP, and it is what makes the world total the manifest's number.
    //
    // A region's budget is only spendable if its own ground satisfies some type
    // in its continent's kit, and measured on the real field 22 regions cannot
    // spend all of theirs — c02/r23, an inland region of a continent whose kit
    // is fluvial/wetland/lakes/coastal/erosional, has no river, lake or sea
    // cell at all and can place NOTHING. Left there the world holds 1,579
    // instances against the manifest's 1,740, and `G-LANDFORM` reads a 9%
    // shortfall as content. Unspendable budget therefore moves to the other
    // regions of the SAME continent — never across a continent, because the
    // premise kit is what decides which landforms may exist.
    //
    // Coverage first: a type that has ground on this continent and no instance
    // yet gets one before any region takes a second helping. That is what lifts
    // per-type coverage; without it the weighted draw concentrates on the
    // high-target groups and leaves rarer ones unplaced while budget is spare.
    let deficit = contBudget - contInstances.length;
    if (deficit > 0)
      deficit = coverageTopUp({ slots, kitTypes, deficit, grid, premise, contStream, contSalt,
                                contInstances, typesPlaced });
    // Surveyed regions take the spill first: they are the detail-dense tier by
    // construction (19-20 against 8), so putting the unspendable budget there
    // keeps the reported tier near its own figure.
    const spillOrder = [...slots].sort((a, b) =>
      (a.region.survey === b.region.survey ? 0 : a.region.survey === "surveyed" ? -1 : 1));
    while (deficit > 0) {
      let progress = 0;
      for (const slot of spillOrder) {
        if (deficit === 0) break;
        const before = contInstances.length;
        fillSlot({ slot, kitTypes, budget: slot.placed + 1, grid, premise, contStream, contSalt,
                   contInstances, typesPlaced });
        const took = contInstances.length - before;
        deficit -= took; progress += took;
      }
      if (progress === 0) break;
    }
    if (deficit > 0)
      shortfalls.push({ continent: premise.id, budget: contBudget, placed: contInstances.length });

    // R8: a type with no cell anywhere on this continent degrades to the
    // group-mate with the most candidates, and the substitution is RECORDED.
    // The plan writes `used: null` unconditionally, so the field it declares
    // for the fallback never carries one.
    recordSubstitutions({ premise, kitTypes, grid, cellsOfRegion, mine, substitutions, contInstances });

    // Handles + ids, assigned in the TOTAL order so a re-run cannot reshuffle.
    const handles = orderHandles({
      handles: contInstances.map((c) => ({
        handle: mintHandle({ continent: premise.id, group: c.group, contentHash: c.contentHash }),
        type: c.type, sizeKm: c.sizeKm, region: c.region, contentHash: c.contentHash,
      })),
    });
    const { collisions } = resolveHandleCollisions({ handles });
    ledgers.push({ continent: premise.id, orderDigest: orderDigestOf({ handles }), handles, collisions });

    const handleByHash = new Map(handles.map((h) => [h.contentHash, h.handle]));
    contInstances.forEach((c, n) => {
      instances.push({
        id: `lf-${premise.id}-${c.region.split("/")[1]}-${String(n).padStart(4, "0")}`,
        type: c.type,
        geometry: c.geometry,
        sizeKm: c.sizeKm, cell: c.cell,
        handle: handleByHash.get(c.contentHash), region: c.region,
        named: false, glyph: c.glyph, dungeonCapable: c.dungeonCapable,
        provenance: { authored: "generated",
                      generator: { pass: "landforms", seedStream: "landform", epoch: 0 },
                      fabric: `fabric/${premise.id}` },
      });
    });
  }

  assignNames({ instances, regions, manifest, stream });

  // grid.landform: the dominant lexicon type index under each cell an instance
  // occupies. Plan D's G-PIN-SAT reads it — a pinned harbour declaring
  // `requires.landform: "coastal-drowned-valley"` has nothing to check against
  // otherwise. RARER TYPES ARE WRITTEN LAST so the more specific classification
  // survives a tie; the plan says the pass places them last, which it does not
  // (placement order is the weighted draw), so the ordering is applied here
  // where it is actually observable.
  const typeIndex = new Map(lexicon.map((t, n) => [t.id, n]));
  const rarityRank = { common: 0, uncommon: 1, rare: 2 };
  const rarityOf = new Map(lexicon.map((t) => [t.id, rarityRank[t.rarity] ?? 0]));
  const ordered = [...instances].sort((a, b) =>
    (rarityOf.get(a.type) - rarityOf.get(b.type)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const inst of ordered) {
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    grid.landform[i] = typeIndex.get(inst.type) ?? -1;
  }
  grid.landformNames = lexicon.map((t) => t.id);

  return { instances, ledgers, substitutions, shortfalls,
           coverage: { placed: typesPlaced.size, total: totalTypes } };
}

// Eight, not six: the top-up below draws from the same lists, and a type whose
// best six cells are all inside another instance's separation radius would be
// unplaceable for a reason that is about bookkeeping rather than terrain.
const BEST_KEEP = 8;

/**
 * Place instances into one region's slot until it reaches `budget`.
 *
 * COVERAGE FIRST: a type this continent has not used yet outranks one it has,
 * and only then does the weighted draw decide. Without it the draw concentrates
 * on the high-§6.6-target groups and leaves placeable types unplaced while
 * budget is still being spent elsewhere — measured, 152 of 170 types with a
 * pure weighted draw against 165 with this, and the thirteen it recovers are
 * every glacial, volcanic and oceanic type that has ground and simply never
 * came up. It costs at most one instance per type per continent.
 */
function fillSlot({ slot, kitTypes, budget, grid, premise, contStream, contSalt, contInstances, typesPlaced }) {
  const fresh = [], seen = [];
  for (const entry of slot.draw)
    (typesPlaced.has(kitTypes[entry[1]].row.id) ? seen : fresh).push(entry);
  for (const [, n] of fresh.concat(seen)) {
    if (slot.placed >= budget) return;
    if (slot.counts[n] === 0) continue;
    const cell = takeBest(slot.best[n], slot.used, grid);
    if (cell < 0) continue;
    slot.used.push(cell);
    contInstances.push(makeInstance({
      grid, premise, region: slot.region, kt: kitTypes[n], cell, contStream, contSalt }));
    typesPlaced.add(kitTypes[n].row.id);
    slot.placed++;
  }
}

/** One instance for every kit type that has ground here and no instance yet. */
function coverageTopUp({ slots, kitTypes, deficit, grid, premise, contStream, contSalt, contInstances, typesPlaced }) {
  const have = new Set(contInstances.map((c) => c.type));
  for (let n = 0; n < kitTypes.length && deficit > 0; n++) {
    if (have.has(kitTypes[n].row.id)) continue;
    // The region where this type ranks highest, so the choice is the same one
    // the per-region draw would have made had the type been drawn.
    let pick = null, pickScore = -1;
    for (const slot of slots) {
      const list = slot.best[n];
      if (list.length === 0) continue;
      if (list[0][0] > pickScore) { pickScore = list[0][0]; pick = slot; }
    }
    if (pick === null) continue;
    const cell = takeBest(pick.best[n], pick.used, grid);
    if (cell < 0) continue;
    pick.used.push(cell);
    contInstances.push(makeInstance({
      grid, premise, region: pick.region, kt: kitTypes[n], cell, contStream, contSalt }));
    typesPlaced.add(kitTypes[n].row.id);
    pick.placed++;
    deficit--;
  }
  return deficit;
}
function insertBest(list, score, cell) {
  // Descending by score, index tiebreak — the same shape as every other
  // selection in the pipeline. Bounded, so a type matching 45,000 cells costs
  // six comparisons rather than a 45,000-entry array and a sort.
  let at = list.length;
  while (at > 0 && (list[at - 1][0] < score || (list[at - 1][0] === score && list[at - 1][1] > cell))) at--;
  if (at >= BEST_KEEP) return;
  list.splice(at, 0, [score, cell]);
  if (list.length > BEST_KEEP) list.pop();
}

function takeBest(list, usedCells, grid) {
  for (let n = 0; n < list.length; n++) {
    const cell = list[n][1];
    if (tooClose(cell, usedCells, grid)) continue;
    list.splice(n, 1);
    return cell;
  }
  return -1;
}

function tooClose(cell, usedCells, grid) {
  const cx = cell % grid.w, cy = (cell / grid.w) | 0;
  for (const other of usedCells) {
    const dx = cx - (other % grid.w), dy = cy - ((other / grid.w) | 0);
    if (dx * dx + dy * dy < MIN_SEPARATION_CELLS * MIN_SEPARATION_CELLS) return true;
  }
  return false;
}

function makeInstance({ grid, premise, region, kt, cell, contStream, contSalt }) {
  const cx = cell % grid.w, cy = (cell / grid.w) | 0;
  const [lo, hi] = kt.row.sizeKm;
  const t = (hashNoise2D({ x: cx * 1.7, y: cy * 1.7, stream: contStream }) + 1) / 2;
  const sizeKm = q(lo + (hi - lo) * t) || q(lo) || 0.01;
  const atKm = [q((cx + 0.5) * grid.cellKm), q((cy + 0.5) * grid.cellKm)];
  const geometry = footprintOf({
    shape: kt.row.geometry, atKm, sizeKm, salt: mix32(contSalt, kt.salt ^ cell) });
  // The content hash covers WHAT the record says, not where it sits in a list.
  const body = { type: kt.row.id, at: atKm, sizeKm, cell: [cx, cy], region: region.id };
  const contentHash = "sha256:" + createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { type: kt.row.id, group: kt.row.group, sizeKm, geometry, cell: [cx, cy],
           region: region.id, glyph: kt.row.glyph, dungeonCapable: kt.row.dungeonCapable,
           contentHash };
}

function recordSubstitutions({ premise, kitTypes, grid, cellsOfRegion, mine, substitutions, contInstances }) {
  const placed = new Set(contInstances.map((c) => c.type));
  // Which kit types have NO satisfying cell anywhere on this continent. A type
  // that has candidates but simply lost the draw is not a substitution.
  const cells = [];
  for (const r of mine) cells.push(...cellsOfRegion.get(r.id));
  if (cells.length === 0) return;
  const views = buildCellViews({ grid, cells });
  const candidates = new Int32Array(kitTypes.length);
  for (let p = 0; p < cells.length; p++)
    for (let n = 0; n < kitTypes.length; n++)
      if (satisfies(views, p, kitTypes[n].pred)) candidates[n]++;
  for (let n = 0; n < kitTypes.length; n++) {
    if (candidates[n] > 0 || placed.has(kitTypes[n].row.id)) continue;
    // The nearest legal type in the SAME group: the group-mate with the most
    // candidates. Null when the whole group is unplaceable here.
    let usedIdx = -1;
    for (let m = 0; m < kitTypes.length; m++) {
      if (m === n || kitTypes[m].via !== kitTypes[n].via || candidates[m] === 0) continue;
      if (usedIdx < 0 || candidates[m] > candidates[usedIdx]) usedIdx = m;
    }
    substitutions.push({
      continent: premise.id, wanted: kitTypes[n].row.id,
      used: usedIdx < 0 ? null : kitTypes[usedIdx].row.id,
      why: `no cell on ${premise.id} satisfies requires ${JSON.stringify(kitTypes[n].row.requires)}`,
    });
  }
}

/**
 * NAMING is a coin the `names` stream flips deterministically (spec §6.6): 336
 * of 1,740 carry a name. The generator only marks WHICH; Plan D mints the
 * actual title, so nothing here ever writes prose.
 *
 * It is NOT a global top-336 pick. The census is per tier, and the
 * reported-region rule is the load-bearing anti-ink-soup constraint:
 *
 *   40 surveyed regions x 6 named  = 240
 *   120 reported regions x 0.5     =  60   <- EXACTLY 60 of 120 carry ONE
 *   12 ocean + sea x 3             =  36
 *                                    ---
 *                                    336
 *
 * "0.5 named per reported region" means exactly 60 carry one named landform and
 * 60 carry none — never two in one. §6.4 rule 2 permits "at most one named
 * landform" inside a reported region, and G-POI derives `drawn = survey ===
 * "surveyed" || instance.named` from it, so a second named instance in a
 * reported region silently doubles that region's drawn POI count.
 *
 * P10 places nothing on water, so the 36 ocean/sea names have no instance to
 * land on; the surveyed tier absorbs them (276 rather than 240), which is what
 * the plan's own "filling the remainder to the target" does and what the
 * per-region budget above makes reachable — 780 surveyed instances for 276
 * names rather than the ~174 an area-proportional budget would leave.
 */
function assignNames({ instances, regions, manifest, stream }) {
  const target = manifest.landformCatalogue.named.total;
  const nameStream = mintSeed({ parentStream: stream, name: "names" });
  const nameSalt = saltOf(nameStream);
  const surveyOf = new Map(regions.map((r) => [r.id, r.survey]));

  // Tier 1 — reported regions: exactly half of them carry exactly ONE.
  const byReported = new Map();
  instances.forEach((inst, n) => {
    if (surveyOf.get(inst.region) !== "reported") return;
    if (!byReported.has(inst.region)) byReported.set(inst.region, []);
    byReported.get(inst.region).push([mix32(nameSalt, n), n]);
  });
  const reportedIds = [...byReported.keys()].sort();
  const reportedRanked = reportedIds
    .map((id, k) => [mix32(nameSalt ^ 0x9e3779b9, k), k])
    .sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
  // Half of ALL reported regions, not half of the ones that happen to hold an
  // instance: four of the 120 have no ground any kit type accepts, and
  // `reportedIds.length` there silently turns the census's 60 into 58.
  const allReported = regions.filter((r) => r.survey === "reported").length;
  const namedReported = Math.min(Math.round(allReported / 2), reportedIds.length);
  for (let k = 0; k < namedReported && k < reportedRanked.length; k++) {
    const region = reportedIds[reportedRanked[k][1]];
    const best = byReported.get(region).slice().sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]))[0];
    if (best) instances[best[1]].named = true;              // exactly ONE
  }

  // Tier 2 — surveyed regions, filling the remainder to the target.
  const remaining = target - instances.filter((i) => i.named).length;
  const eligible = instances
    .map((inst, n) => [mix32(nameSalt ^ 0x85ebca6b, n), n])
    .filter(([, n]) => surveyOf.get(instances[n].region) !== "reported")
    .sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
  for (let k = 0; k < remaining && k < eligible.length; k++)
    instances[eligible[k][1]].named = true;
  return { target, named: instances.filter((i) => i.named).length };
}
