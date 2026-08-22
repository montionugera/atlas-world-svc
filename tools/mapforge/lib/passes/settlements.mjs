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
import { FLAG, idx, neighbourIdx } from "../grid.mjs";
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
function assertStream(stream, who) {
  if (typeof stream !== "string" || !/^[0-9a-f]{16}$/.test(stream))
    throw new TypeError(
      `${who}: stream must be the committed 16-hex settlements stream ` +
      `(derived.json <node>.resolvedSeedStreams.settlements), got ${JSON.stringify(stream)}`);
}

// ── the water fields the coast term reads ─────────────────────────────────
//
// TWO MEASURES OF WATER, AND THEY ARE NOT THE SAME QUANTITY — read this
// before changing either.
//
// `grid.fetchKm` (set by classifySea, sea-level.mjs) is the LONGEST
// unobstructed run of sea through a sea cell, max over the two axes. That is
// wave exposure, and it is what Plan D's pinned harbour records declare
// against (`water.shelterFetchKmMax: 15`).
//
// What spec §6.5 needs for "adjacent water has fetch < 15 km (bay, fjord,
// estuary)" is the opposite end of the same construction: the NARROWEST water
// width through the cell, min over the two axes. A bay mouth has a long axis
// running out to sea and a short one across it; taking the max calls it
// exposed. Measured on the real 800 × 800 field: min-over-axes puts 2,126 of
// the 9,529 settlement-eligible cells inside 6 km of the sea in the sheltered
// band and 7,403 in the exposed band, on six continents; max-over-axes leaves
// **4 cells, all on c05**, which starves the three-capital quota to one.
//
// So the two are computed from the SAME four run-length sweeps and the
// invariant `narrowWaterKm <= grid.fetchKm` holds cell by cell — settlements
// .test.mjs asserts it on the real field, which is what stops the two
// definitions drifting into two different worlds.
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

  const narrow = narrowWaterKm({ grid });
  const { inlandKm, nearestSea } = seaProximity({ grid });
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
  for (const p of pinned) {
    if (!Array.isArray(p.at) || !Array.isArray(p.cell))
      throw new TypeError(`settlements: pinned entry ${p.id} is not a placePinned() result — ` +
        `expected { id, at, cell, continent, region, rank }, got keys [${Object.keys(p).join(", ")}]`);
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
    const w = waterAt(i);
    settlements.push({ id: p.id, title: p.title ?? null, continent: p.continent, rank: p.rank,
                       atKm: [q(p.at[0]), q(p.at[1])], cell: [...p.cell], region: p.region,
                       score: 1, portEligible: isPort(i, w), pinned: true });
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
  scored.sort((a, b) => (b.s - a.s) || (b.tie - a.tie) || (a.i - b.i));

  const taken = [...settlements];
  const occupied = new Set(taken.map((t) => `${t.cell[0]},${t.cell[1]}`));
  // THE SEPARATION RULE, and the plan's own review brief proposes the wrong one.
  //
  // Step 7 (plan :5215) suggests same-tier-only separation ("a village 3 km
  // from a capital is fine"). Spec §6.5 says the opposite in the same
  // paragraph: "A 9 km separation admits at most 2 settlements per 160 km²
  // surveyed region, which is exactly the per-region cap" — a statement about
  // ALL settlements, which same-tier separation cannot deliver, and which the
  // plan's own test at :4931 asserts. Measured on the real field: same-tier
  // separation puts 3 settlements in 4 regions and 4 in 1, so the per-region
  // cap fails on 5 of 40.
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
