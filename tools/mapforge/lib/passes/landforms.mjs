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
import { PIN_LANDFORM_NEAR_KM } from "../../../../scripts/lib/resolve.mjs";
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
//   - `tempDecileMin/Max` (0-9), NOT `tempMin/Max` (raw values).
//     THE NAME IS WRONG AND THE READING THAT MATTERS IS THIS ONE: these are
//     FIXED-WIDTH VALUE BUCKETS, `min(9, floor(v * 10))`, not rank deciles. An
//     earlier draft of this comment claimed they were "rank-based and therefore
//     immune to the 1-ULP problem that forced rank selection on sea level" —
//     they are not, and a 1-ULP move across 0.7 flips the bucket exactly as it
//     would for a raw threshold. Measured over the 256,000 owned land cells,
//     where a true decile is 25,600 per bin:
//       tempDecile   50506 24053 38238 26656 25199 40821 26402 17574 6551 0
//       precipDecile 32000 38819 40725 40374 40489 34589 19082  6737  513 2672
//     so `tempDecileMin: 7` selects 9.4% of land, not 30%, and
//     `precipDecileMax: 1` selects 27.7%, not 20%. 84 committed lexicon rows
//     read these keys and Plan D writes predicates against them, so the
//     histograms are pinned in tests/landforms.test.mjs rather than described
//     here. The keys were NOT renamed: the name lives in the committed
//     `landform-type.schema.json` and in 84 authored rows, and re-spelling
//     Plan B's authority is a larger content change than the correction is
//     worth. What is fixed is the claim.
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

// HANDLE_HEX = 6, and the length is the whole point: it makes a handle a PURE
// FUNCTION of the record's own content.
//
// The plan mints 4 hex and lengthens the loser of a collision. That is
// deterministic but NOT stable, and Plan D binds `bind.handle` (plan line 328,
// `dungeonAnchors[].handle`) to these strings. Measured on the shipped 4-hex
// form: give an existing `c01/karst/h-abcd` (size 1.0, hash abcd0000) a LARGER
// colliding neighbour (size 5.0, hash abcd9999) and the newcomer takes `h-abcd`
// while the existing record is RENUMBERED to `h-abcd0` — because the walk ran
// in rank order and rank is dominated by `sizeKm`, the least stable field in
// the row. Re-keying the walk on `contentHash` does not fix it either: a
// newcomer whose hash sorts first displaces the incumbent just the same. Any
// scheme where the length depends on WHO ELSE IS IN THE BUCKET can renumber an
// existing handle, so the length must not depend on the bucket at all.
//
// At six hex the bucket is invisible: `mintHandle` reads nothing but its own
// arguments, so an authored `bind.handle` can only move if the instance it
// names moves. Measured on the real world: 43 (continent, group) buckets, the
// largest 181 instances, ZERO duplicates at six hex (one at four, none at
// five). The residual birthday risk over 16.7 M values is ~0.4% per world and
// it is LOUD — `assertHandlesUnique` throws rather than shipping a duplicate or
// silently moving somebody.
export const HANDLE_HEX = 6;

export function mintHandle({ continent, group, contentHash }) {
  return `${continent}/${group}/h-${contentHash.replace(/^sha256:/, "").slice(0, HANDLE_HEX)}`;
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
 * Assert every handle in one continent's ledger is unique, and say exactly what
 * collided if not.
 *
 * This REPLACES a resolver, and deleting the resolver is the fix. The plan
 * extends the later-ranked member of a 4-hex collision to 6 hex in a single
 * pass keyed on a `seen` map that only ever holds the FIRST occupant, so a
 * three-way collision writes the same 6-hex tail twice and the second write is
 * silent. The shipped seam replaced that with a 4 -> 5 -> 6 walk taking the
 * first free length, which is correct for n-way and throws rather than
 * duplicating — but it makes a handle depend on the rest of its bucket, and a
 * later arrival can therefore RENUMBER an existing record (see mintHandle).
 *
 * With `HANDLE_HEX` fixed at six there is nothing left to resolve: a duplicate
 * is a genuine six-hex hash collision inside one (continent, group) bucket, it
 * cannot be fixed by lengthening (six is the last length
 * `landform-instance.schema.json`'s `h-[0-9a-f]{4,6}` allows), and it must be
 * loud. Zero occur on this seed.
 */
export function assertHandlesUnique({ handles }) {
  const taken = new Map();
  for (const h of handles) {
    const prev = taken.get(h.handle);
    if (prev !== undefined)
      throw new Error(
        `landforms: handle ${h.handle} is claimed twice — by ${prev} and by ` +
        `${h.contentHash}. Six hex is the last length the committed ` +
        `h-[0-9a-f]{4,6} grammar allows, so this is a real hash collision inside ` +
        `one (continent, group) bucket and needs a wider handle grammar, not a ` +
        `longer prefix.`);
    taken.set(h.handle, h.contentHash);
  }
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

// FNV-1a over a string, so a CONTENT key (a handle, a region id) can be mixed
// the same way a cell hash is. Integer-only and exact on every engine, like the
// rest of this pass's ranking arithmetic — the determinism inventory bans the
// transcendentals, not `Math.imul`.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

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
export function instanceLandforms({ grid, premises, regions, lexicon, manifest, stream, nameStream,
                                     pinned = [] }) {
  if (!Array.isArray(regions) || regions.length === 0)
    throw new Error("landforms: P9 partitionRegions must run before P10");
  // THE NAMING STREAM IS INJECTED, NEVER MINTED. `names` is one of the four
  // streams content/spine/derived.json commits per node, and this pass has no
  // business deriving a second value under that name — see lib/seed.mjs's
  // RESERVED_STREAM_NAMES, which now makes minting one impossible rather than
  // merely wrong. The caller reads it off the committed record.
  if (typeof nameStream !== "string" || !/^[0-9a-f]{16}$/.test(nameStream))
    throw new Error(
      `landforms: nameStream must be the 16-hex \`names\` stream this world commits in ` +
      `content/spine/derived.json (n-atlas.resolvedSeedStreams.names), not ${nameStream}. ` +
      `The pass used to mint mintSeed(terrainStream, "names") — a different value under the ` +
      `same name from the one Plan D mints the titles from.`);
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

    // PIN RESERVATIONS (owner root-cause ruling, 2026-08-25). ADDITIVE ONLY:
    // for a pinned place whose required type has no instance within
    // PIN_LANDFORM_NEAR_KM anywhere in the world, one NEW instance of that
    // type is grown near the pin through this pass's own machinery — the
    // type's own requires predicate (matchesRequires on the cell view), its
    // size/geometry/salt construction via makeInstance, handles minted by the
    // normal ledger path below. Existing instances are never moved or
    // removed, so all 336 bound handles stay valid; reservations sit AFTER
    // the budgeted placement and add to the world total.
    if (pinned.length > 0)
      reservePinnedInstances({ premise, mine, kitTypes, grid, contStream, contSalt,
                               contInstances, instances, pinned, shortfalls,
                               cellsOfRegion, lexicon });

    // Handles + ids, assigned in the TOTAL order so a re-run cannot reshuffle.
    const handles = orderHandles({
      handles: contInstances.map((c) => ({
        handle: mintHandle({ continent: premise.id, group: c.group, contentHash: c.contentHash }),
        type: c.type, sizeKm: c.sizeKm, region: c.region, contentHash: c.contentHash,
      })),
    });
    assertHandlesUnique({ handles });
    ledgers.push({ continent: premise.id, orderDigest: orderDigestOf({ handles }), handles });

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
                      // The stream that actually produced this record, not the
                      // literal "landform" — which named neither a committed
                      // stream nor any child this pass mints.
                      generator: { pass: "landforms", seedStream: `landform:${premise.id}`, epoch: 0 },
                      fabric: `fabric/${premise.id}` },
      });
    });
  }

  assignNames({ instances, regions, manifest, nameStream });

  // grid.landform: the dominant lexicon type index under each cell an instance
  // occupies. Plan D's G-PIN-SAT reads it — a pinned harbour declaring
  // `requires.landform: "coastal-drowned-valley"` has nothing to check against
  // otherwise. RARER TYPES ARE WRITTEN LAST so the more specific classification
  // survives a tie; the plan says the pass places them last, which it does not
  // (placement order is the weighted draw), so the ordering is applied here.
  //
  // RECORDED MUTATION SURVIVOR: dropping the rarity term leaves the suite
  // green, and no fixture can separate the two today. Measured on the real
  // world, ZERO of the 1,740 instances share a cell — the per-region minimum
  // separation of two cells makes a tie impossible — so there is nothing for a
  // tiebreak to break. It is kept because the separation is a per-REGION rule
  // and instances of different regions meet at a region boundary; the day P13
  // or Plan D writes a second instance onto an occupied cell, this is the line
  // that decides which type G-PIN-SAT reads.
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

// Distance from a km point to an instance's own geometry: a point's `at`, an
// area/line ring's nearest vertex, else its anchor cell centre. Same rule
// placePinned uses for receipts, so reservation and measurement agree.
function instanceDistanceKm(inst, at, grid) {
  const g = inst.geometry ?? {};
  const pts = g.shape === "point" ? [g.at]
    : Array.isArray(g.ring) ? g.ring
    : inst.cell ? [[(inst.cell[0] + 0.5) * grid.cellKm, (inst.cell[1] + 0.5) * grid.cellKm]]
    : [];
  let best = null;
  for (const p of pts) {
    if (!p) continue;
    const dx = p[0] - at[0], dy = p[1] - at[1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (best === null || d < best) best = d;
  }
  return best;
}

function reservePinnedInstances({ premise, mine, kitTypes, grid, contStream, contSalt,
                                  contInstances, instances, pinned, shortfalls, cellsOfRegion,
                                  lexicon }) {
  const regionById = new Map(mine.map((r) => [r.id, r]));
  const ktByType = new Map(kitTypes.map((kt) => [kt.row.id, kt]));
  const takenCells = new Set([...contInstances, ...instances].map((c) => c.cell.join(",")));
  const tooCloseToAny = (cx, cy) => {
    for (const inst of [...contInstances, ...instances]) {
      if (Math.abs(inst.cell[0] - cx) <= MIN_SEPARATION_CELLS &&
          Math.abs(inst.cell[1] - cy) <= MIN_SEPARATION_CELLS) return true;
    }
    return false;
  };
  for (const rec of pinned) {
    const wantType = rec.requires?.landform;
    const wantCont = rec.requires?.continent;
    if (!wantType || wantCont !== premise.id) continue;
    let kt = ktByType.get(wantType);
    if (!kt) {
      // AUTHORIAL OVERRIDE: the type is outside this continent's premise kit
      // (a glacial type on a temperate landmass), but a pinned place is
      // canon and its requires block names the substrate the prose swears
      // by. Mint the kit entry straight from the lexicon row with the same
      // deterministic per-type salt construction; the compromise is recorded.
      const row = lexicon.find((x) => x.id === wantType);
      if (!row) {
        shortfalls.push({ continent: premise.id, what: "pin-reservation",
          why: `${rec.id} requires landform "${wantType}", which the lexicon does not define` });
        continue;
      }
      kt = { t: -1, row, via: row.group, weight: 1,
             pred: compileRequires({ requires: row.requires, id: row.id }),
             salt: saltOf(mintSeed({ parentStream: contStream, name: row.id })) };
      shortfalls.push({ continent: premise.id, what: "pin-reservation",
        why: `${rec.id} reserved an instance of "${wantType}" outside this continent's ` +
          `premise kit — canon override, recorded here` });
    }
    // SATISFIED GLOBALLY? measure against every instance placed so far, same
    // distance rule the receipt will use. If some existing instance of the
    // type already sits within the limit, this pin needs nothing.
    let nearest = null;
    for (const inst of [...instances, ...contInstances]) {
      if (inst.type !== wantType) continue;
      const d = instanceDistanceKm(inst, rec.pin.at, grid);
      if (d !== null && (nearest === null || d < nearest)) nearest = d;
    }
    if (nearest !== null && nearest <= PIN_LANDFORM_NEAR_KM) continue;

    // Candidate cells: owned land of THIS continent within the limit, sorted
    // by distance to the pin. The type's own requires predicate wins; a plain
    // free cell is the fallback so the claim is still satisfied, with the
    // compromise recorded.
    const pinCx = Math.floor(rec.pin.at[0] / grid.cellKm);
    const pinCy = Math.floor(rec.pin.at[1] / grid.cellKm);
    const limitCells = PIN_LANDFORM_NEAR_KM / grid.cellKm;
    const cands = [];
    for (const r of mine) {
      for (const i of cellsOfRegion.get(r.id) ?? []) {
        const cx = i % grid.w, cy = (i / grid.w) | 0;
        const dx = cx - pinCx, dy = cy - pinCy;
        const dCells = Math.sqrt(dx * dx + dy * dy);
        if (dCells > limitCells) continue;
        if (takenCells.has(`${cx},${cy}`) || tooCloseToAny(cx, cy)) continue;
        cands.push({ i, cx, cy, d: dCells * grid.cellKm, region: r });
      }
    }
    cands.sort((a, b) => (a.d - b.d) || (a.i - b.i));
    let chosen = null, compromised = false;
    for (const c of cands) {
      const ok = matchesRequires({ requires: kt.row.requires ?? null,
                                   cell: cellView({ grid, i: c.i }) });
      if (ok) { chosen = c; break; }
    }
    if (!chosen && cands.length) { chosen = cands[0]; compromised = true; }
    if (!chosen) {
      shortfalls.push({ continent: premise.id, what: "pin-reservation",
        why: `${rec.id} requires landform "${wantType}" but no free owned cell within ` +
          `${PIN_LANDFORM_NEAR_KM} km can host it` });
      continue;
    }
    const inst = makeInstance({
      grid, premise, region: chosen.region, kt, cell: chosen.i, contStream, contSalt });
    contInstances.push(inst);
    takenCells.add(`${chosen.cx},${chosen.cy}`);
    if (compromised)
      shortfalls.push({ continent: premise.id, what: "pin-reservation",
        why: `${rec.id}: no cell near the pin satisfies "${wantType}"'s own requires block — ` +
          `placed on the nearest free ground instead` });
  }
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
function assignNames({ instances, regions, manifest, nameStream }) {
  const target = manifest.landformCatalogue.named.total;
  const nameSalt = saltOf(nameStream);
  const surveyOf = new Map(regions.map((r) => [r.id, r.survey]));

  // Tier 1 — reported regions: exactly half of them carry exactly ONE.
  //
  // THE COIN IS KEYED ON THE HANDLE, NOT ON ARRAY POSITION. `mix32(nameSalt, n)`
  // with `n` the index into the global `instances` array contradicts this file's
  // own rule at `orderHandles` ("NEVER insertion order"), and it is not a
  // theoretical objection: handing `assignNames` the SAME OBJECTS in reversed
  // array order named a different set — 3 of 12 in common on the mini world.
  // One extra instance anywhere shifts every later index and reshuffles all 336
  // names across continents nothing changed on, while the handles Plan D binds
  // to are content-addressed and do not move. Same for the region draw: it is
  // keyed on the region ID, not on that id's position in a list whose length
  // depends on which regions happened to receive an instance.
  const byReported = new Map();
  instances.forEach((inst, n) => {
    if (surveyOf.get(inst.region) !== "reported") return;
    if (!byReported.has(inst.region)) byReported.set(inst.region, []);
    byReported.get(inst.region).push([mix32(nameSalt, hash32(inst.handle)), n, inst.handle]);
  });
  const reportedIds = [...byReported.keys()].sort();
  const reportedRanked = reportedIds
    .map((id, k) => [mix32(nameSalt ^ 0x9e3779b9, hash32(id)), k, id])
    .sort((a, b) => (b[0] - a[0]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  // Half of ALL reported regions, not half of the ones that happen to hold an
  // instance: four of the 120 have no ground any kit type accepts, and
  // `reportedIds.length` there silently turns the census's 60 into 58.
  const allReported = regions.filter((r) => r.survey === "reported").length;
  const namedReported = Math.min(Math.round(allReported / 2), reportedIds.length);
  for (let k = 0; k < namedReported && k < reportedRanked.length; k++) {
    const region = reportedIds[reportedRanked[k][1]];
    const best = byReported.get(region).slice()
      .sort((a, b) => (b[0] - a[0]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))[0];
    if (best) instances[best[1]].named = true;              // exactly ONE
  }

  // Tier 2 — surveyed regions, filling the remainder to the target.
  const remaining = target - instances.filter((i) => i.named).length;
  const eligible = instances
    .map((inst, n) => [mix32(nameSalt ^ 0x85ebca6b, hash32(inst.handle)), n, inst.handle])
    .filter(([, n]) => surveyOf.get(instances[n].region) !== "reported")
    .sort((a, b) => (b[0] - a[0]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  for (let k = 0; k < remaining && k < eligible.length; k++)
    instances[eligible[k][1]].named = true;
  return { target, named: instances.filter((i) => i.named).length };
}
