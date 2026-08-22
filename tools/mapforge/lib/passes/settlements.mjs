// tools/mapforge/lib/passes/settlements.mjs — P11: settlement placement.
//
// HARD VETOES FIRST, then a weighted score. The brief's "river AND coast AND
// low slope AND resource" is only correct as a veto on the hard half.
//
// THE SHELTER TEST is the term that does the real work (spec §6.5): coast
// scores 1.0 only when the adjacent water is enclosed — a bay, fjord or
// estuary. That is why ports land in bays rather than on cliffs.
//
// PINNED RECORDS ARE AN INPUT, NOT A JOIN. `pinned` defaults to [] in Plan C;
// Plan D supplies the ~40 records and this pass places them BEFORE scoring
// begins, so a contradiction is impossible rather than merely detectable.
import { FLAG, idx, inBounds, neighbourIdx, cellCentreKm } from "../grid.mjs";
import { hashNoise2D, q } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";

export const VETO = Object.freeze({ slopeMax: 0.08, freshWaterMin: 0.20, treeline: 0.72 });
export const SEPARATION_KM = Object.freeze({ capital: 60, hub: 24, village: 9 });
export const SHELTER_FETCH_KM_MAX = 15;
// THE PER-REGION CAP, made a RULE instead of an arithmetic hope. Spec §6.5:
// "A 9 km separation admits at most 2 settlements per 160 km² surveyed region,
// which is exactly the per-region cap." The derivation is true of a DISC and
// false of the regions this generator draws: mean isoperimetric ratio 0.391
// (partition.mjs), so a region can be long enough to seat three points 9 km
// apart. Measured with the cap removed: c02/r08, c03/r12, c03/r15 and c03/r22
// each take 3 — the plan's own test at :4931 would go red on the real world.
// The cap is therefore enforced, not derived; deleting it reds four regions.
export const MAX_SETTLEMENTS_PER_REGION = 2;
// ONE CAPITAL PER LANDMASS. Spec §6.5: "The three capitals are the three
// charted ports: Gildmark (Wealdmarch), Tallowquay (Coldreach), Netstead
// (Stonemoor)" — three coasts, and the §6.5 table gives each of those three
// landmasses exactly one. Without the rule the greedy takes the two best
// scoring ports on ONE continent: measured, c05 Thirstwold took two capitals
// 71.9 km apart while Wealdmarch got none, which also moved the level-band
// origin off Wealdmarch. Deleting the rule reproduces that.
export const MAX_CAPITALS_PER_CONTINENT = 1;
export const COAST_NEAR_KM = 2, COAST_FAR_KM = 6;
export const COAST_EXPOSED = 0.4;
// The four weights of spec §6.5's `S = 0.30·river + 0.25·coast + 0.25·slope +
// 0.20·resource`, named so a test can assert they sum to 1 rather than
// re-spelling four literals that have already drifted once in this programme.
export const SCORE_WEIGHTS = Object.freeze({ river: 0.30, coast: 0.25, slope: 0.25, resource: 0.20 });
const RIVER_NEAR_WEIGHT = 0.6;

// THE STREAM. `stream` is the COMMITTED `settlements` stream — the one
// content/spine/derived.json records as `<node>.resolvedSeedStreams.settlements`
// (n-atlas: da45bd8930d33bb0). It is INJECTED, never minted here, for the
// reason lib/seed.mjs states at length: three passes in this programme have
// minted a child under a reserved name, produced a different 16-hex value, and
// used it, with every golden stable. `mintSeed` throws on the four reserved
// names, so the plan's own `mintSeed({ parentStream: stream, name:
// "settlements" })` (plan :5113) cannot even be written. The caller reads
// derived.json; settlements.test.mjs joins this argument to it.
// THE POSITIONAL JOIN, asserted instead of assumed. `grid.owner[i]` is an
// INDEX into `regions`, while everything this pass emits names a region by ID.
// P9 sets `grid.regionIds = byIndex.map(r => r.id)` for exactly this join.
// Without the check, handing in a re-ordered `regions` array files all 45
// settlements under the wrong region ids and reports nothing — reproduced by
// review A with `part.regions.slice().reverse()`.
export function assertRegionIndex({ grid, regions, who }) {
  if (!Array.isArray(grid.regionIds) || grid.regionIds.length === 0) return;
  if (grid.regionIds.length !== regions.length)
    throw new Error(`${who}: regions[] has ${regions.length} entries and grid.regionIds has ` +
      `${grid.regionIds.length} — grid.owner is an INDEX into regions[] and the two must agree`);
  for (let k = 0; k < regions.length; k++)
    if (regions[k].id !== grid.regionIds[k])
      throw new Error(`${who}: regions[${k}] is ${regions[k].id} and grid.regionIds[${k}] is ` +
        `${grid.regionIds[k]} — grid.owner indexes regions[], so a re-ordered array files every ` +
        `record under the wrong region`);
}

function assertStream(stream, who) {
  if (typeof stream !== "string" || !/^[0-9a-f]{16}$/.test(stream))
    throw new TypeError(
      `${who}: stream must be the committed 16-hex settlements stream ` +
      `(derived.json <node>.resolvedSeedStreams.settlements), got ${JSON.stringify(stream)}`);
}

// ── the water fields the coast term reads ─────────────────────────────────
//
// TWO MEASURES OF WATER, AND THEY ARE NOT THE SAME QUANTITY — read this
// before changing either, and read the PLAN D HAZARD at the end.
//
// `grid.fetchKm` (set by classifySea, sea-level.mjs) is the LONGEST
// unobstructed run of sea through a sea cell, max over the two axes: wave
// exposure.
//
// What spec §6.5 needs for "adjacent water has fetch < 15 km (bay, fjord,
// estuary)" is the opposite end of the same construction: the NARROWEST water
// width through the cell, min over the two axes. A bay mouth has a long axis
// running out to sea and a short one across it; taking the max calls it
// exposed. Measured on the real 800 x 800 field: min-over-axes puts 2,126 of
// the 9,529 eligible cells inside 6 km of the sea in the sheltered band and
// 7,403 in the exposed band, on six continents; max-over-axes leaves **4
// cells, all on c05**, which starves the three-capital quota to one.
//
// Both are computed from the SAME four run-length sweeps, so
// `narrowWaterKm <= grid.fetchKm` holds cell by cell — which is a tautology
// (min <= max of two expressions) and therefore NOT what joins them.
// settlements.test.mjs joins them by RECOMPUTING grid.fetchKm from these
// sweeps and comparing: if classifySea's definition ever moves, that reds.
//
// THE PLAN D HAZARD, filed here because this is where the divergence is made.
// Plan D's pinned harbour records declare `water.shelterFetchKmMax: 15` and
// G-PIN-SAT measures `pinReceipts.measured.shelterFetchKm`. If that receipt is
// read off `grid.fetchKm`, it is UNSATISFIABLE at 332 of the 520 port-eligible
// cells this pass produces, and at all three generated capitals (their
// adjacent water reads grid.fetchKm 240.5 / 56.5 / 48.5 km). Plan D must
// either measure `narrowWaterKm` for that receipt or restate the pin's
// threshold. This pass does not decide it; it exports narrowWaterKm so the
// choice is one import rather than a third definition.
export function narrowWaterKm({ grid }) {
  const { w, h, n } = grid;
  const sea = (i) => (grid.flags[i] & FLAG.SEA) !== 0;
  const runL = new Int32Array(n), runR = new Int32Array(n);
  const runU = new Int32Array(n), runD = new Int32Array(n);
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) { const i = y * w + x; run = sea(i) ? run + 1 : 0; runL[i] = run; }
    run = 0;
    for (let x = w - 1; x >= 0; x--) { const i = y * w + x; run = sea(i) ? run + 1 : 0; runR[i] = run; }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) { const i = y * w + x; run = sea(i) ? run + 1 : 0; runU[i] = run; }
    run = 0;
    for (let y = h - 1; y >= 0; y--) { const i = y * w + x; run = sea(i) ? run + 1 : 0; runD[i] = run; }
  }
  const out = new Float32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!sea(i)) continue;
    const across = runL[i] + runR[i] - 1, down = runU[i] + runD[i] - 1;
    out[i] = (across < down ? across : down) * grid.cellKm;
  }
  return out;
}

// Multi-source BFS from the sea, carrying the SOURCE cell so an inland cell
// can read the shelter of the water it is near. Bounded at COAST_FAR_KM
// because nothing past that band scores any coast at all — the full-grid walk
// is 133 ms on the real field, the bounded one 27 ms, and the two agree
// everywhere the result is read.
//
// Every edge costs one cell, so BFS order IS distance order — the same
// Chebyshev-by-cell measure water.mjs's `freshKm` already uses, kept identical
// on purpose so two "distance to water" fields in one pipeline cannot mean two
// different things.
export function seaProximity({ grid, maxKm = COAST_FAR_KM }) {
  const inlandKm = new Float32Array(grid.n).fill(-1);
  const nearestSea = new Int32Array(grid.n).fill(-1);
  const queue = new Int32Array(grid.n);
  let head = 0, tail = 0;
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.SEA) !== 0) { inlandKm[i] = 0; nearestSea[i] = i; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    const d = inlandKm[i] + grid.cellKm;
    if (d > maxKm) continue;
    for (let k = 0; k < 8; k++) {
      const j = neighbourIdx({ grid, i, d: k });
      if (j < 0 || inlandKm[j] !== -1) continue;
      inlandKm[j] = d;
      nearestSea[j] = nearestSea[i];
      queue[tail++] = j;
    }
  }
  return { inlandKm, nearestSea };
}

// The per-cell terrain reading the score and the vetoes share. One D8 walk.
export function view({ grid, i }) {
  const cx = i % grid.w, cy = (i / grid.w) | 0;
  let slope = 0, riverNear = 0;
  for (let k = 0; k < 8; k++) {
    const ni = neighbourIdx({ grid, i, d: k });
    if (ni < 0) continue;
    const d = grid.elev[i] - grid.elev[ni];
    const a = d > 0 ? d : -d;
    if (a > slope) slope = a;
    if ((grid.flags[ni] & (FLAG.RIVER | FLAG.LAKE)) !== 0) riverNear = 1;
  }
  const onRiver = (grid.flags[i] & (FLAG.RIVER | FLAG.LAKE)) !== 0 ? 1 : 0;
  const river = onRiver > riverNear * RIVER_NEAR_WEIGHT ? onRiver : riverNear * RIVER_NEAR_WEIGHT;
  const freshWater = river > grid.moist[i] ? river : grid.moist[i];
  return { cx, cy, slope, river, freshWater };
}

// THE COAST TERM, in the spec's THREE bands — and the plan's version had two.
//
// Spec §6.5: "1.0 within 2 km of the sea-level contour when adjacent water has
// fetch < 15 km, 0.4 on exposed coast, 0 beyond 6 km inland." The plan
// declares COAST_NEAR_KM and COAST_FAR_KM (:5013) and then reads NEITHER: its
// coast term is a plain D8 sea-adjacency test, so the band between 2 and 6 km
// does not exist and both constants are dead beside a rule that cannot see
// them. Measured on the real field, the three bands hold 2,574 / 6,955 / 9,366
// eligible cells, so all three are populated and both thresholds fire.
//
// The taper between the two named distances is this file's reading, stated
// because the spec gives the endpoints and not the middle: linear from 1 at
// COAST_NEAR_KM to 0 at COAST_FAR_KM.
export function coastTerm({ inlandKm, sheltered }) {
  if (inlandKm < 0 || inlandKm > COAST_FAR_KM) return 0;
  const band = inlandKm <= COAST_NEAR_KM
    ? 1
    : (COAST_FAR_KM - inlandKm) / (COAST_FAR_KM - COAST_NEAR_KM);
  return band * (sheltered ? 1 : COAST_EXPOSED);
}

/**
 * 0 means VETOED. Anything above 0 is the weighted score of spec §6.5.
 *
 * `v` is `view({grid, i})`; `water` is `{ inlandKm, sheltered }`. The plan's
 * Interfaces block spells this `scoreSettlement({ grid, i, view })` and its own
 * code spells it `({ grid, i, v, regionSurvey, BIOME_NAME })` — two signatures
 * for one function, in one task. This is the second, plus the water reading the
 * three-band coast term needs.
 */
export function scoreSettlement({ grid, i, v, water, regionSurvey, biomeName }) {
  if ((grid.flags[i] & FLAG.SEA) !== 0) return 0;
  if (regionSurvey !== "surveyed") return 0;
  if (v.slope > VETO.slopeMax) return 0;
  // RECORDED, because "it fires" is not the same as "it decides": the treeline
  // veto is the chosen rejection on 173 real cells and the {ice, lava} veto on
  // 108, and EVERY ONE of those cells is on c10 Ashen Spar, which the
  // fresh-water veto rejects entirely (615 of 640 surveyed cells; 0 cells clear
  // every other veto). So deleting either leaves the 45 placements
  // byte-identical on THIS world. Both are spec §6.5 vetoes, both are killed by
  // direct fixtures in settlements.test.mjs, and neither is dead — they are
  // waiting for a premise with wet ground above the treeline or on lava.
  if (grid.elev[i] > VETO.treeline) return 0;
  if (v.freshWater < VETO.freshWaterMin) return 0;
  const biome = biomeName(grid.biome[i]);
  if (biome === "ice" || biome === "lava") return 0;

  const coast = coastTerm({ inlandKm: water.inlandKm, sheltered: water.sheltered });
  const slopeScore = 1 - v.slope / VETO.slopeMax;
  const resource = grid.moist[i] * 0.5 + (1 - grid.elev[i]) * 0.5;
  return SCORE_WEIGHTS.river * v.river + SCORE_WEIGHTS.coast * coast +
         SCORE_WEIGHTS.slope * slopeScore + SCORE_WEIGHTS.resource * resource;
}

const distKm = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
};

export function placeSettlements({ grid, premises, regions, manifest, pinned = [], stream,
                                   BIOME_NAME = null }) {
  assertStream(stream, "settlements");
  assertRegionIndex({ grid, regions, who: "settlements" });
  // `premises` is in the binding signature Plan D quotes verbatim, and it was
  // an unused parameter until review A said so. It is the continent vocabulary,
  // so it is used as one: a region naming a continent no premise declares is a
  // wiring bug that would otherwise surface as a fabric file with no premise.
  const premiseIds = new Set((premises ?? []).map((p) => p.id));
  if (premiseIds.size > 0)
    for (const r of regions)
      if (!premiseIds.has(r.continent))
        throw new Error(`settlements: region ${r.id} names continent ${r.continent}, which is not ` +
          `one of the ${premiseIds.size} premises`);
  // THE ICE/LAVA VETO CANNOT BE SILENTLY OFF. The plan defaults `BIOME_NAME` to
  // null and then writes `BIOME_NAME ? BIOME_NAME(...) : null`, so a caller that
  // forgets it gets a veto that never fires and no symptom — the exact shape of
  // the dead rules seams 3 and 4 each shipped. P9 already refuses to run before
  // P8 for the same reason; this refuses for the same reason and in the same
  // words. Measured: the veto is the CHOSEN one on 108 cells of the real world,
  // all of them c10 Ashen Spar's lava field.
  if (!BIOME_NAME && (!Array.isArray(grid.biomeNames) || grid.biomeNames.length === 0))
    throw new Error("settlements: grid.biomeNames is empty — run classifyBiomes (P8) before " +
      "placeSettlements, or pass BIOME_NAME. Without it the {ice, lava} veto cannot fire.");
  const biomeName = BIOME_NAME ?? ((b) => grid.biomeNames[b] ?? null);

  const problems = [];
  const settlements = [];
  const quotas = manifest.quotas.settlements;
  const regionIndexById = new Map(regions.map((r, k) => [r.id, k]));

  const narrow = narrowWaterKm({ grid });
  const { inlandKm, nearestSea } = seaProximity({ grid });
  // RECORDED (review A): 50 of 7,247 shore cells have two D8 sea neighbours
  // that disagree on sheltered/exposed, so for those the class comes from the
  // BFS's fixed D8 order rather than from a rule. Deterministic — reversing the
  // D8 order leaves the 45 placements byte-identical — but it is a tie the
  // model does not adjudicate, and a future "which harbour" question must.
  const waterAt = (i) => {
    const near = nearestSea[i];
    return { inlandKm: inlandKm[i],
             sheltered: near >= 0 && narrow[near] >= 0 && narrow[near] < SHELTER_FETCH_KM_MAX };
  };
  // A PORT is on the coast AND sheltered — both named constants, not one.
  const isPort = (i, water) => water.inlandKm >= 0 && water.inlandKm <= COAST_NEAR_KM && water.sheltered;

  // Pinned settlements first. `pinned` is ALREADY PLACED — it is the `placed`
  // array Plan D's placePinned returns, shaped
  //   { id, title, at, cell, continent, region, rank }
  // NOT the raw content/world/civil/pinned/*.json records. Plan D owns reading
  // those, resolving each seed point to a cell, and measuring the fabric under
  // it for G-PIN-SAT; this pass owns only the consequence — the tier quota one
  // of those pins consumes. Two functions resolving a pin means two ways for a
  // place to move, which is the failure the whole pinned tier exists to stop.
  const pinnedIds = new Set();
  for (const p of pinned) {
    if (!Array.isArray(p.at) || !Array.isArray(p.cell))
      throw new TypeError(`settlements: pinned entry ${p.id} is not a placePinned() result — ` +
        `expected { id, at, cell, continent, region, rank }, got keys [${Object.keys(p).join(", ")}]`);
    // A DUPLICATE PIN IS A LOUD ERROR, not two settlements sharing an id. The
    // fabric, the handle ledger and Plan D's bindings are all keyed on the id.
    if (pinnedIds.has(p.id))
      throw new TypeError(`settlements: pinned id ${p.id} appears twice`);
    pinnedIds.add(p.id);
    if (!inBounds({ grid, cx: p.cell[0], cy: p.cell[1] }))
      throw new TypeError(`settlements: pinned ${p.id} has cell [${p.cell}] outside the ` +
        `${grid.w} x ${grid.h} grid`);
    // A pin with no rank consumes no quota and must not be silently filed under
    // one: `quotas[undefined]` is undefined and every later comparison against
    // it is false, which places the full generated quota ON TOP of the pin.
    if (!Object.prototype.hasOwnProperty.call(SEPARATION_KM, p.rank))
      throw new TypeError(`settlements: pinned entry ${p.id} has rank ${JSON.stringify(p.rank)} — ` +
        `expected one of ${Object.keys(SEPARATION_KM).join(", ")}; a rankless pin consumes no ` +
        `quota and would be placed on top of a generated settlement`);
    if (p.region == null) {
      problems.push(`settlements: pinned ${p.id} at [${p.at}] is not on owned land`);
      continue;
    }
    const i = idx({ grid, cx: p.cell[0], cy: p.cell[1] });
    // A PIN IS NOT MOVED — the committed seed point is the authority — but every
    // way it can contradict the fabric is REPORTED. Silence here is how a
    // capital ends up in the sea with a green run (review A).
    const centre = cellCentreKm({ grid, cx: p.cell[0], cy: p.cell[1] });
    // No abs() in geometry (the house rule that keeps a negative shoelace a
    // winding failure rather than a magnitude): the same `d > 0 ? d : -d` form
    // every other distance term in the pipeline uses.
    const dx0 = p.at[0] - centre[0], dy0 = p.at[1] - centre[1];
    if ((dx0 > 0 ? dx0 : -dx0) > grid.cellKm || (dy0 > 0 ? dy0 : -dy0) > grid.cellKm)
      problems.push(`settlements: pinned ${p.id} says at [${p.at}] and cell [${p.cell}], whose ` +
        `centre is [${centre}] — the two disagree by more than one cell`);
    if ((grid.flags[i] & FLAG.SEA) !== 0)
      problems.push(`settlements: pinned ${p.id} is on a sea cell`);
    const pinRegion = regionIndexById.get(p.region);
    if (pinRegion === undefined)
      problems.push(`settlements: pinned ${p.id} names region ${p.region}, which is not a region`);
    else if (regions[pinRegion].survey !== "surveyed")
      problems.push(`settlements: pinned ${p.id} is on ${p.region}, a reported region`);
    const w = waterAt(i);
    settlements.push({ id: p.id, title: p.title ?? null, continent: p.continent, rank: p.rank,
                       atKm: [q(p.at[0]), q(p.at[1])], cell: [...p.cell], region: p.region,
                       score: 1, portEligible: isPort(i, w), pinned: true });
  }
  // OVER-FILL IS REPORTED, NOT ABSORBED. `problems` reported an under-filled
  // tier from the first draft and said nothing about the other direction, so
  // four pinned capitals against a quota of 1 produced four capitals and a
  // clean run (review A). Pins are never dropped — the contradiction is the
  // manifest's or the pin set's, and it is named.
  for (const tier of Object.keys(SEPARATION_KM)) {
    const n = settlements.filter((s) => s.rank === tier).length;
    if (n > quotas[tier])
      problems.push(`settlements: ${n} pinned ${tier}s against a quota of ${quotas[tier]}`);
  }
  // …and the separation invariant the generated tiers enforce stops holding the
  // moment two pins sit closer than the village minimum. Reported, not moved.
  for (let a = 0; a < settlements.length; a++)
    for (let b = a + 1; b < settlements.length; b++) {
      const d = distKm(settlements[a].atKm[0], settlements[a].atKm[1],
                       settlements[b].atKm[0], settlements[b].atKm[1]);
      if (d < SEPARATION_KM.village)
        problems.push(`settlements: pinned ${settlements[a].id} and ${settlements[b].id} are ` +
          `${d.toFixed(2)} km apart, inside the ${SEPARATION_KM.village} km village separation`);
    }

  // Score every land cell once.
  const scored = [];
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0 || grid.owner[i] < 0) continue;
    const region = regions[grid.owner[i]];
    if (!region) continue;
    if (region.survey !== "surveyed") continue;      // the cheap veto, first
    const v = view({ grid, i });
    const water = waterAt(i);
    const s = scoreSettlement({ grid, i, v, water, regionSurvey: region.survey, biomeName });
    if (s <= 0) continue;
    scored.push({ i, s, v, region, portEligible: isPort(i, water) });
  }
  // Deterministic order: score desc, then the seed stream, then cell index. The
  // stream only breaks exact score ties, via a stable hash — never a stateful
  // RNG. `tie` is minted under a name of this pass's own: "settlements" is one
  // of the four names derived.json commits and mintSeed throws on it.
  const tieStream = mintSeed({ parentStream: stream, name: "settlement-tiebreak" });
  for (const c of scored)
    c.tie = hashNoise2D({ x: c.v.cx * 0.53, y: c.v.cy * 0.53, stream: tieStream });
  // RECORDED MUTATION SURVIVOR, explained at its call site: deleting the final
  // `(a.i - b.i)` term leaves the suite green. `scored` is built by ascending
  // cell index and Array.prototype.sort is stable, so equal keys already come
  // out in cell order — the same "load-bearing together or not at all" shape
  // seam 3 recorded for arcs.mjs's zero-padding and its sort. The term is what
  // makes the order a property of the DATA rather than of V8's stability, and
  // it is the term the plan's own determinism rule names. Deleting the
  // `(b.tie - a.tie)` term IS killed, by the fixture golden.
  scored.sort((a, b) => (b.s - a.s) || (b.tie - a.tie) || (a.i - b.i));

  const taken = [...settlements];
  const occupied = new Set(taken.map((t) => `${t.cell[0]},${t.cell[1]}`));
  // THE SEPARATION RULE, and the plan's own review brief proposes the wrong one.
  //
  // Step 7 (plan :5215) suggests same-tier-only separation ("a village 3 km
  // from a capital is fine"). Spec §6.5 says the opposite in the same
  // paragraph: "A 9 km separation admits at most 2 settlements per 160 km²
  // surveyed region, which is exactly the per-region cap" — a statement about
  // ALL settlements, which same-tier separation cannot deliver.
  //
  // Measured on the real field (review A, corrected from this comment's first
  // draft, which quoted a per-region count only reachable with the explicit cap
  // ALSO removed): under same-tier separation village c02/s09 lands 0.50 km —
  // ONE CELL — from capital c02/s01. Under the rule as shipped the closest pair
  // in the whole world is 9.01 km, so the 9 km bound is binding and live.
  //
  // So a candidate must clear its OWN tier's distance from every settlement
  // already placed, of any tier. Tiers are placed widest-first, so the binding
  // constraint on a village is 9 km from everything and on a capital 60 km from
  // everything — monotone, and the per-region cap follows.
  const farEnough = (cx, cy, tier) => {
    const min = SEPARATION_KM[tier];
    const x = (cx + 0.5) * grid.cellKm, y = (cy + 0.5) * grid.cellKm;
    for (const t of taken) if (distKm(x, y, t.atKm[0], t.atKm[1]) < min) return false;
    return true;
  };

  // Per-continent id counters that step OVER an id a pin already holds, so a
  // pinned `c02/s01` cannot be shadowed by a generated one.
  const usedIds = new Set(settlements.map((s) => s.id));
  const counter = new Map();
  const nextId = (cont) => {
    let n = counter.get(cont) ?? 0;
    let id;
    do { n += 1; id = `${cont}/s${String(n).padStart(2, "0")}`; } while (usedIds.has(id));
    counter.set(cont, n);
    usedIds.add(id);
    return id;
  };

  // Tier by tier, widest separation first. CAPITALS ARE RESTRICTED TO
  // PORT-ELIGIBLE CELLS BEFORE PASS 1 — not rejected afterwards (spec §6.5).
  const perRegion = new Map();
  const capitalsPerContinent = new Map();
  for (const s of settlements) {
    perRegion.set(s.region, (perRegion.get(s.region) ?? 0) + 1);
    if (s.rank === "capital")
      capitalsPerContinent.set(s.continent, (capitalsPerContinent.get(s.continent) ?? 0) + 1);
  }
  const tiers = [["capital", quotas.capital], ["hub", quotas.hub], ["village", quotas.village]];
  for (const [tier, want] of tiers) {
    let placed = settlements.filter((s) => s.rank === tier).length;
    const pool = tier === "capital" ? scored.filter((c) => c.portEligible) : scored;
    for (const c of pool) {
      if (placed >= want) break;
      if (occupied.has(`${c.v.cx},${c.v.cy}`)) continue;
      if ((perRegion.get(c.region.id) ?? 0) >= MAX_SETTLEMENTS_PER_REGION) continue;
      if (!farEnough(c.v.cx, c.v.cy, tier)) continue;
      const cont = c.region.continent;
      if (tier === "capital" && (capitalsPerContinent.get(cont) ?? 0) >= MAX_CAPITALS_PER_CONTINENT)
        continue;
      const rec = {
        id: nextId(cont),
        title: null,   // Plan D's name-gen mints the title; a name is meaning.
        continent: cont, rank: tier,
        atKm: [q((c.v.cx + 0.5) * grid.cellKm), q((c.v.cy + 0.5) * grid.cellKm)],
        cell: [c.v.cx, c.v.cy], region: c.region.id, score: q(c.s), portEligible: c.portEligible,
      };
      settlements.push(rec);
      taken.push(rec);
      occupied.add(`${c.v.cx},${c.v.cy}`);
      perRegion.set(c.region.id, (perRegion.get(c.region.id) ?? 0) + 1);
      if (tier === "capital")
        capitalsPerContinent.set(cont, (capitalsPerContinent.get(cont) ?? 0) + 1);
      placed++;
    }
    if (placed < want)
      problems.push(`settlements: only ${placed} of ${want} ${tier}s could be placed — the veto ` +
        `set or the ${SEPARATION_KM[tier]} km separation is starving the tier ` +
        `(${pool.length} candidate cells)`);
  }
  settlements.sort((a, b) => (a.continent < b.continent ? -1 : a.continent > b.continent ? 1
                             : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // THE REGION BACK-REFERENCE. `regions[].settlements` is a REQUIRED key of
  // fabric-file.schema.json and it exists so Plan D's G-DUNGEON-REACH can walk
  // the region adjacency graph without re-deriving the settlement -> region
  // join. Written here, after the sort, so the array order is the settlement
  // order and a re-seed cannot reshuffle it. Every region gets the key, empty
  // included: an absent key and an empty array read the same at a call site
  // that uses `?? []`, and that is exactly how the join silently returned
  // Infinity hops for all 60 dungeons.
  for (const r of regions) r.settlements = [];
  const regionById = new Map(regions.map((r) => [r.id, r]));
  for (const s of settlements) {
    const r = regionById.get(s.region);
    if (!r) { problems.push(`settlements: ${s.id} names region ${s.region}, which is not in regions[]`); continue; }
    r.settlements.push(s.id);
  }
  return { settlements, problems };
}

// THE `f-town-<slug>` GRAMMAR — a HARD INTERFACE for Plan E, minted here
// because the settlement is where a town's identity is.
//
// Task 10's `buildTrunk` emits one `kind: "point"` feature per settlement onto
// its owning continent node, id `f-town-<slug>`, carrying the settlement's km
// coordinates and `type: null`. `gSpineNet` (check_content.mjs:1986-1999)
// resolves Plan E's 7 `leg` and 8 `road` edge endpoints against
// `node.features`, so an empty `features[]` reds G-NET and G-CANON-LEG at the
// redraw commit with no fix available inside Plan E.
//
// THE PLAN'S buildTrunk (:6778) WRITES `townFeatureId(slugOf(s.title))` — AND
// EVERY TITLE THIS PASS EMITS IS `null`, because a name is meaning and Plan D
// mints it. `slugOf(null)` is a TypeError, so Task 10 as written cannot emit a
// single feature in Plan C. `townSlug` falls back to the settlement's own id,
// which is unique by construction; once Plan D supplies a title the slug is
// the title's, which is what makes `f-town-gildmark` the id Plan E's committed
// canon legs point at.
//
// TASK 10's fabric.mjs MUST RE-EXPORT THESE TWO, never redefine them: two
// spellings of one id grammar is how an edge endpoint stops resolving.
export const townFeatureId = (slug) => `f-town-${slug}`;
export const slugOf = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function townSlug({ settlement }) {
  const slug = slugOf(settlement.title ? settlement.title : settlement.id);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    throw new Error(`settlements: ${settlement.id} slugs to ${JSON.stringify(slug)}, which is not ` +
      `a legal f-town-<slug> tail — G-NET resolves Plan E's leg endpoints against this id`);
  return slug;
}

/** Every settlement's feature id, with collisions refused rather than merged. */
export function townFeatureIds({ settlements }) {
  const out = new Map();
  for (const s of settlements) {
    const id = townFeatureId(townSlug({ settlement: s }));
    if (out.has(id))
      throw new Error(`settlements: ${s.id} and ${out.get(id)} both slug to ${id} — ` +
        `Plan E's edges resolve a feature id to exactly one point`);
    out.set(id, s.id);
  }
  return out;
}

// LEVEL BANDS: 40 km rings from the SINGLE starter capital (Gildmark), never
// nearest-capital — nearest-capital permits a high-band region between two
// low-band ones, a materially weaker guarantee (spec §11 lower-stakes table).
//
// Returns the record of WHICH origin was used, because the fallback chain can
// silently move the whole difficulty gradient to another landmass: in Plan C
// there is no `c-town-gildmark` (Plan D mints it), so the origin is c02's
// capital — and if c02 got no capital it is any capital at all. That is a
// different world, and it says so in `problems` rather than in nobody's log.
export function assignLevelBands({ regions, settlements, manifest, problems = [] }) {
  const { originPinnedId, originFallbackContinent, ringKm, bands } = manifest.levelBands;
  const byPin = settlements.find((s) => s.id === originPinnedId);
  const byContinent = settlements.find((s) => s.continent === originFallbackContinent && s.rank === "capital");
  const anyCapital = settlements.find((s) => s.rank === "capital");
  const origin = byPin ?? byContinent ?? anyCapital ?? settlements[0] ?? null;
  if (!origin) { problems.push("levelBands: no settlement to anchor the rings on"); return null; }
  if (!byPin && !byContinent)
    problems.push(`levelBands: no capital on ${originFallbackContinent} and no ${originPinnedId} — ` +
      `the rings are anchored on ${origin.id} (${origin.continent}) instead`);
  let banded = 0;
  for (const r of regions) {
    if (!r.centroidKm) continue;
    const d = distKm(r.centroidKm[0], r.centroidKm[1], origin.atKm[0], origin.atKm[1]);
    const ring = Math.min(bands.length - 1, Math.floor(d / ringKm));
    r.levelBand = [...bands[ring]];
    banded++;
  }
  if (banded !== regions.length)
    problems.push(`levelBands: ${regions.length - banded} of ${regions.length} regions have no ` +
      `centroidKm and are unbanded — partitionRegions writes it in its census loop`);
  return { origin: origin.id, originContinent: origin.continent, banded };
}
