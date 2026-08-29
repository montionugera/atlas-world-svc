// tools/mapforge/lib/passes/dungeons.mjs — P13: dungeon anchoring.
//
// Two cheap assertions, exactly as G-DUNGEON-REACH will re-check them
// (spec §5.8): (1) the entrance resolves to a landform whose lexicon row is
// dungeonCapable; (2) BFS over the REGION ADJACENCY GRAPH finds a settlement
// within 2 hops. A dungeon is NEVER a spine node — making it one would drag
// its area into the composition rollup and the quadratic overlap check.
//
// NO `grid`. This pass works on the region adjacency graph, not on cells.
import { streamInt } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";

export const MAX_HOPS = 2;
export const MAX_PER_REGION = 3;

// The integer mix P10 already uses for its ranking key, for the same reason:
// millions of hashNoise2D calls each re-validate the stream with a regex, the
// mix is exact on every engine, and no committed number derives from it — only
// which of many eligible instances is chosen.
const mix32 = (h, salt) => {
  let x = (h ^ salt) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
const hash32 = (s) => {
  let h = 2166136261 >>> 0;
  for (let n = 0; n < s.length; n++) h = Math.imul(h ^ s.charCodeAt(n), 16777619) >>> 0;
  return h >>> 0;
};

/**
 * Hops from the nearest SETTLED region, over UNDIRECTED region adjacency.
 *
 * `regions[].adjacent` is written by partitionRegions from shared cell
 * boundaries and is symmetric there — but this number is what Plan D's
 * G-DUNGEON-REACH READS instead of walking the graph itself, so a one-sided
 * entry would make the gate lie rather than fail. The walk therefore builds a
 * symmetric closure and REPORTS every asymmetry it had to close.
 */
export function hopsToSettlement({ regions, settlements, problems = [] }) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const undirected = new Map(regions.map((r) => [r.id, new Set()]));
  for (const r of regions)
    for (const a of r.adjacent ?? []) {
      if (!byId.has(a)) { problems.push(`dungeons: ${r.id} is adjacent to ${a}, which is not a region`); continue; }
      if (!(byId.get(a).adjacent ?? []).includes(r.id))
        problems.push(`dungeons: region adjacency is one-sided — ${r.id} lists ${a} and ${a} does not list ${r.id}`);
      undirected.get(r.id).add(a);
      undirected.get(a).add(r.id);
    }
  const hops = new Map();
  const queue = [];
  const settled = new Set(settlements.map((s) => s.region).filter((id) => id != null));
  // RECORDED MUTATION SURVIVOR: dropping this `.sort()` leaves the suite green
  // and cannot change any DISTANCE — every settled region is a BFS source at
  // distance 0, so the frontier is the same set whatever order they enter the
  // queue, and the `hops.has(a)` test makes the first arrival the only one. It
  // is here so the QUEUE is a function of the data, which is what the
  // neighbour sort two lines down needs to mean anything.
  // WITH A CAVEAT THAT BECOMES LOAD-BEARING (review J): the returned Map's
  // INSERTION order is not order-independent without this sort. Nothing reads
  // it today — every consumer does `hops.get(...)` — so the survivor stands.
  // The moment a later task emits a per-region hop table by WALKING this Map
  // rather than indexing it, the sort stops being a formality and the mutation
  // starts being killable. Do not delete it on the strength of the green suite.
  for (const rid of [...settled].sort()) {
    if (!byId.has(rid)) { problems.push(`dungeons: a settlement names region ${rid}, which is not a region`); continue; }
    hops.set(rid, 0);
    queue.push(rid);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const rid = queue[qi];
    const h = hops.get(rid);
    for (const a of [...undirected.get(rid)].sort()) {
      if (hops.has(a)) continue;
      hops.set(a, h + 1);
      queue.push(a);
    }
  }
  return hops;
}

export function anchorDungeons({ instances, regions, settlements, lexicon, manifest, stream }) {
  const problems = [];
  const capable = new Set(lexicon.filter((t) => t.dungeonCapable).map((t) => t.id));
  const known = new Set(lexicon.map((t) => t.id));
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const hops = hopsToSettlement({ regions, settlements, problems });
  const want = manifest.quotas.dungeons.complexes;

  const eligible = [];
  for (const inst of instances) {
    if (!known.has(inst.type)) { problems.push(`dungeons: ${inst.handle} has type ${inst.type}, which is not in the lexicon`); continue; }
    // THE LEXICON IS THE AUTHORITY and the instance's own copy is joined to it,
    // never trusted alongside it: two enumerations of "is this dungeonCapable"
    // is how an entrance ends up on a pavement.
    if (inst.dungeonCapable !== undefined && inst.dungeonCapable !== capable.has(inst.type))
      problems.push(`dungeons: ${inst.handle} says dungeonCapable=${inst.dungeonCapable} and the ` +
        `lexicon row for ${inst.type} says ${capable.has(inst.type)}`);
    if (!capable.has(inst.type)) continue;
    // An instance on a region that is not in `regions` is a wiring bug, not an
    // unreachable dungeon: `hops.get` answers undefined for both, and only one
    // of them should be silent (review B).
    const region = regionById.get(inst.region);
    if (region === undefined) {
      problems.push(`dungeons: ${inst.handle} is on region ${inst.region}, which is not a region`);
      continue;
    }
    // THE HONEST FRONTIER, and it is a GATE, not a preference. Spec §6.4 rule 2
    // ("no interior detail inside a reported region") is enforced by Task 11's
    // `gWorldPoi` (plan :7502), which counts every `dungeonAnchors` row into its
    // region's POI total UNCONDITIONALLY — unlike instances, which it counts
    // only for surveyed regions — and then requires a reported region's total to
    // be exactly 0. Without this line 36 of the 60 anchors land in reported
    // regions and Task 11 opens with 36 gate failures this pass caused two seams
    // earlier (measured: 43 gWorldPoi failures with the anchors, 7 without).
    // Silent like the hop filter, for the same reason: it is a supply
    // restriction, and starving the quota is what the under-fill report below
    // is for.
    if (region.survey !== "surveyed") continue;
    const h = hops.get(inst.region);
    if (h === undefined || h > MAX_HOPS) continue;
    eligible.push({ inst, hops: h });
  }

  // The draw order is a function of the HANDLE, never of the position in
  // `instances` — seam 4's ruling, because a re-ordering upstream must not move
  // a dungeon. Integer key, ascending, tie broken on the handle itself.
  const dStream = mintSeed({ parentStream: stream, name: "dungeons" });
  const salt = streamInt(dStream);
  const scored = eligible.map((e) => ({ ...e, key: mix32(hash32(e.inst.handle), salt) }));
  // RECORDED MUTATION SURVIVOR: deleting the handle tail of this comparator
  // leaves the suite green and no fixture can change that. `key` is a 32-bit
  // mix of a 32-bit hash of a handle that is itself unique. Measured, ZERO key
  // collisions across every scale of the set: 126 in `eligible` here, 135 on
  // surveyed ground, and all 307 `dungeonCapable` instances on the real world.
  // (The first draft called 307 the eligible count — it is the SUPPLY before
  // the survey and hop filters, review J; the collision argument is unaffected
  // and the number is now the one it names.) The
  // tail is what makes the order total rather than merely improbable; finding a
  // colliding pair to fixture would be a 2^32 search for a property that is
  // supposed to hold without one.
  scored.sort((a, b) => (a.key - b.key) ||
    (a.inst.handle < b.inst.handle ? -1 : a.inst.handle > b.inst.handle ? 1 : 0));

  // Spread across regions: at most 1 per region in round 1, 2 in round 2, 3 in
  // round 3, so a dense region cannot take the whole quota.
  const perRegion = new Map();
  const anchors = [];
  const chosen = new Set();
  for (let round = 1; round <= MAX_PER_REGION && anchors.length < want; round++) {
    for (const { inst, hops: h } of scored) {
      if (anchors.length >= want) break;
      if (chosen.has(inst.handle)) continue;
      if ((perRegion.get(inst.region) ?? 0) >= round) continue;
      perRegion.set(inst.region, (perRegion.get(inst.region) ?? 0) + 1);
      chosen.add(inst.handle);
      // `entranceType` and `hopsToSettlement` are SERIALISED, not re-derivable
      // downstream: Plan D's G-DUNGEON-REACH reads both straight off this row
      // rather than walking the adjacency graph a second time with its own
      // copy of the settlement->region join. `h` comes from the eligibility
      // filter, which already proved it is an integer in [0, MAX_HOPS] — the
      // plan's `hops.get(...) ?? null` tail is unreachable behind that filter,
      // and an unreachable null is worse than no null at all.
      anchors.push({ handle: inst.handle, continent: inst.region.split("/")[0],
                     region: inst.region, entranceType: inst.type, hopsToSettlement: h });
    }
  }
  anchors.sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));
  if (anchors.length < want)
    problems.push(`dungeons: only ${anchors.length} of ${want} complexes could be anchored — ` +
      `${eligible.length} dungeonCapable instances lie within ${MAX_HOPS} region hops of a ` +
      `settlement, over ${new Set(eligible.map((e) => e.inst.region)).size} regions`);
  return { anchors, problems };
}

// ── Plan D Task 10 — P13's BOUND half ───────────────────────────────────────
//
// A door has to be a door: the lexicon's dungeonCapable flag is the only
// authority, and a violation is reported here rather than left for the gate,
// because the generator can still choose a different instance. The bound
// dungeon records join to the ground by `bind.handle` — never by coordinate,
// never by spineId — so this is the one place an authored binding can be
// checked against the world BEFORE the fabric bytes are committed and
// G-DUNGEON-REACH has to name the drift.
export function anchorBoundEntrances({ instances, dungeons, lexicon }) {
  // The lexicon arrives as an ARRAY from every production call site
  // (generate-world.mjs reads landforms.json; anchorDungeons above filters it)
  // and as a MAP from Task 10's own fixtures. Normalize once here so the join
  // below has one shape — two enumerations of "what type is this" is exactly
  // what this file's other comments forbid.
  const rows = lexicon instanceof Map ? [...lexicon.values()] : lexicon;
  const rowById = new Map(rows.map((t) => [t.id, t]));
  const byHandle = new Map(instances.map((i) => [i.handle, i]));
  const anchored = [], problems = [];
  // Sorted by id so the output is a function of the DATA, not of the caller's
  // directory order — the same ruling as hopsToSettlement's settled-region
  // sort above.
  for (const d of [...dungeons].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const inst = byHandle.get(d.bind?.handle);
    if (!inst) { problems.push(`anchorBoundEntrances: ${d.id} handle "${d.bind?.handle}" has no instance`); continue; }
    // THE LEXICON IS THE AUTHORITY, joined through the instance's type — the
    // same rule anchorDungeons applies to its own choices, for the same reason:
    // two enumerations of "is this dungeonCapable" is how an entrance ends up
    // on a pavement.
    if (!rowById.get(inst.type)?.dungeonCapable) {
      problems.push(`anchorBoundEntrances: ${d.id} handle "${d.bind.handle}" is a "${inst.type}", which is not dungeonCapable`);
      continue;
    }
    anchored.push({ dungeon: d.id, handle: d.bind.handle, instanceId: inst.id });
  }
  return { anchored, problems };
}
