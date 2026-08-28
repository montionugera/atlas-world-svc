// Plan E Task 10 — the zone allocation.
//
// WHAT THIS SOLVES. `Z6` (scripts/check_content.mjs, "Compared as a SET")
// requires every zone record's deduped resource-KIND set to be globally unique
// against a closed 8-value enum, and every landmark name to be globally unique
// across zones, trimmed and case-insensitive. With 40 surveyed regions and 255
// non-empty sets that is a set-packing problem, and discovering a collision on
// record 37 means rewriting the resources AND the prose that justifies them.
//
// WHAT THIS FILE IS. The allocation is DERIVED, not chosen: every number and
// every name below comes out of content/world/fabric/continent-NN.json, the
// name registers, and the ten already-committed records. Nothing is retyped.
// docs/worldbuilding/A4-zone-allocation.md is the rendered output of
// scripts/derive_zone_allocation.mjs over this module, and
// scripts/tests/zone-allocation.test.mjs re-derives it and fails on any drift.
//
// THE ONE THING THIS FILE CANNOT DERIVE, and does not pretend to.
// Ten records were written before the redraw and are canon. Measured on the
// redrawn world (see surveyedRegions() + the resolved world's own `zone`
// field): all six named cluster-1 towns and every pinned cluster-1 landmark
// that resolves at all sit on REPORTED regions — c02/r11, r12, r18, r19 —
// while Wealdmarch's ten SURVEYED regions carry only unnamed generated
// villages c02/s01..s10. There is no overlap, so no geography pairs the two
// sets. The pairing Task 9 committed is alphabetical-against-ascending-region-
// id, it carries no geographic claim, and this module preserves it byte for
// byte rather than inventing a better-looking one. It is marked PLACEHOLDER in
// every row it touches and it is exempt from the licence rule below — see
// LEGACY_EXEMPT and A4's own "The ten that cannot be derived" section.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mintName, phonemeDistance, titleStem } from "../../tools/mapforge/lib/name-gen.mjs";

export const KINDS = Object.freeze([
  "crop", "timber", "ore", "fuel", "stone", "water", "forage", "salvage",
]);

// ---------------------------------------------------------------------------
// 1. The ground, measured.
// ---------------------------------------------------------------------------

/** cNN -> the landmass's title, from its own premise. Derived, never retyped. */
export function continentNames({ root }) {
  const dir = join(root, "content/world/premises");
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => /^continent-\d+\.json$/.test(n)).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (doc.id && doc.title) out.set(doc.id, doc.title);
  }
  return out;
}

/**
 * Every surveyed region in the fabric, in ascending region id, carrying only
 * measured fields. `group` is the region's dominant landform group, read off
 * the instance handles the generator wrote (`c06/coastal/h-15392d`), ties
 * broken alphabetically so the answer does not depend on array order. A region
 * with no landform instances at all has no group to read — c05/r06 is exactly
 * that, 100% desert and empty — so it falls back to its dominant biome, which
 * is the only evidence there is.
 */
export function surveyedRegions({ root }) {
  const dir = join(root, "content/world/fabric");
  if (!existsSync(dir)) return [];
  const out = [];
  const named = continentNames({ root });
  for (const f of readdirSync(dir).filter((n) => /^continent-\d+\.json$/.test(n)).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const types = new Map();
    const groups = new Map();
    for (const inst of doc.instances ?? []) {
      if (!types.has(inst.region)) types.set(inst.region, new Set());
      types.get(inst.region).add(inst.type);
      const g = String(inst.handle ?? "").split("/")[1];
      if (!g) continue;
      if (!groups.has(inst.region)) groups.set(inst.region, new Map());
      const m = groups.get(inst.region);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    for (const r of doc.regions.filter((x) => x.survey === "surveyed")) {
      const counts = [...(groups.get(r.id) ?? new Map())].sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      const biomes = Object.entries(r.biomeShares ?? {}).sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      out.push({
        id: r.id,
        continent: doc.continent,
        continentName: named.get(doc.continent) ?? doc.continent,
        terrain: r.terrainKind,
        biomes: Object.fromEntries(biomes),
        landforms: [...(types.get(r.id) ?? new Set())].sort(),
        group: counts.length ? counts[0][0] : (biomes[0]?.[0] ?? null),
        groups: counts.map(([g]) => g),
      });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 2. The licence rule — what ground can yield.
// ---------------------------------------------------------------------------
//
// AUTHORED ONCE, DELIBERATELY, and never tuned per region: an affordance table
// from the eight kinds to the measured evidence that would let a person carry
// that kind out. It is the rule that makes the allocation checkable rather than
// tasteful — a row whose kinds its region cannot yield is a FAIL, and the
// prose Tasks 11-14 write can then justify the kind without contradicting the
// ground it stands on.
//
// Each entry names its evidence so a reader can audit the licence, not just
// trust it. Biome keys are the fabric's own `biomeShares`; landform tokens are
// the fabric's own `instances[].type`.
const BIOME = (r, k) => r.biomes[k] ?? 0;
const LF = (r, ...t) => t.some((x) => r.landforms.includes(x));

export const LICENCE = Object.freeze({
  // Ground a plough or a spade can work: open meadow, or any river that floods
  // and leaves silt, or a desert spring.
  crop: (r) => BIOME(r, "meadow") >= 20 || BIOME(r, "river") > 0
    || LF(r, "oasis-spring", "floodplain-levee", "ford"),
  // Standing wood, in enough quantity to cut.
  timber: (r) => BIOME(r, "forest") >= 3 || r.terrain === "cloud-forest"
    || LF(r, "swamp-forest", "carr-thicket", "mangrove-flat"),
  // Metal in rock, and the exposures that let you reach it.
  ore: (r) => BIOME(r, "rock") > 0 || BIOME(r, "upland") > 0 || BIOME(r, "scree") > 0
    || BIOME(r, "badland") > 0 || BIOME(r, "karst") > 0
    || LF(r, "cave-system", "tectonic-cave", "hogback", "mesa", "butte", "cuesta",
      "ridge-spine", "plateau-scarp", "massif-dome", "inselberg", "volcanic-plug",
      "karst-tower"),
  // What burns: peat from a mire, or the ash and lava country's own fuel, or
  // bramble cut and dried.
  fuel: (r) => BIOME(r, "ash") > 0 || BIOME(r, "lava") > 0 || BIOME(r, "bramble") > 0
    || LF(r, "peat-hag", "raised-bog", "blanket-mire", "quaking-bog", "spring-mire",
      "reed-fen", "tidal-mire", "floating-mat"),
  // Stone you can cut, lift or gather: limestone country, bare rock, and the
  // desert's own deflation lag.
  stone: (r) => BIOME(r, "karst") > 0 || BIOME(r, "rock") > 0 || BIOME(r, "scree") > 0
    || BIOME(r, "desert") > 0
    || LF(r, "limestone-pavement", "sea-stack", "wave-cut-platform", "marine-terrace",
      "raised-beach", "karst-tower", "hoodoo", "zeugen-ridge", "desert-pavement-reg",
      "ventifact-field", "talus-cone", "rockfall-apron", "spatter-rampart"),
  // Water a party can drink and carry off — running, ponded or held in rock.
  water: (r) => BIOME(r, "river") > 0
    || LF(r, "tarn", "oasis-spring", "plunge-pool", "estuary", "ford", "spring-mire",
      "moraine-dammed-lake", "landslide-dammed-lake", "lake-terrace", "karst-cenote",
      "polje", "ponor", "foiba", "wadi", "playa"),
  // What grows without tending, on land or in the shallows.
  forage: (r) => BIOME(r, "meadow") > 0 || BIOME(r, "reef") > 0 || BIOME(r, "marsh") > 0
    || BIOME(r, "bramble") > 0 || BIOME(r, "tundra") > 0
    || LF(r, "wet-meadow", "machair", "reed-fen", "carr-thicket"),
  // What the ground gives back that somebody else lost: a wrecking coast, or an
  // erg that buries a caravan and uncovers it again.
  salvage: (r) => BIOME(r, "desert") > 0
    || LF(r, "sea-stack", "skerry", "barrier-island", "wave-cut-platform", "sea-arch",
      "sea-cave", "geo", "cay", "blowhole", "tidal-flat", "spit", "tombolo",
      "baymouth-bar", "coastal-drowned-valley", "raised-beach", "marine-terrace",
      "sea-waterfall", "cuspate-foreland", "coastal-lagoon", "machair",
      "erg-dune-sea", "sand-sheet", "barchan-dune", "seif-dune", "star-dune",
      "transverse-dune-field", "draa", "nebkha-field"),
});

/** The kinds a region's own measured ground licenses, in enum order. */
export function licensedKinds({ region }) {
  return KINDS.filter((k) => LICENCE[k](region));
}

// ---------------------------------------------------------------------------
// 3. The ten that cannot be derived.
// ---------------------------------------------------------------------------

/**
 * The committed records, keyed by the region Task 9 joined them to. Their kind
 * sets and landmark names are CANON and are transcribed, never re-chosen —
 * changing them would rewrite shipped prose for nothing.
 */
export function committedRecords({ root }) {
  const dir = join(root, "content/zones");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^zone-.+\.json$/.test(n)).sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .map((doc) => ({
      zone: doc.zone,
      region: doc.region,
      kinds: [...new Set(doc.resources.map((r) => r.kind))].sort(),
      landmarks: doc.landmarks.map((l) => l.name),
    }))
    .sort((a, b) => (a.zone < b.zone ? -1 : 1));
}

/**
 * Hand-pinned canon places (`c-town-*` / `c-lm-*`, never the generated
 * `c-lm-cNN-<group>-<hash>` ones) keyed by the fabric region they stand in, as
 * the resolved world records it.
 *
 * MEASURED, and the reason this function exists: exactly one canon pin in the
 * whole world stands on surveyed ground — `c-lm-brightfall-leap` on `c09/r03`.
 * Task 9's "every canon pin is on reported ground" was measured on cluster 1
 * and is true there; it is not true world-wide. A zone whose region already
 * holds a named canon place INHERITS that name as a landmark rather than
 * minting a second name for the same ground.
 */
export function canonPinsByRegion({ root }) {
  const dir = join(root, "content/world/resolved");
  const out = new Map();
  if (!existsSync(dir)) return out;
  const GENERATED = /^c-lm-c\d\d-/;
  for (const f of readdirSync(dir).filter((n) => /^continent-\d+\.json$/.test(n)).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const civil = [
      ...(doc.towns ?? []),
      ...(doc.landmarks ?? []).filter((l) => /^c-(lm|town)-/.test(l.id) && !GENERATED.test(l.id)),
    ];
    for (const c of civil) {
      if (!c.zone) continue;
      if (!out.has(c.zone)) out.set(c.zone, []);
      out.get(c.zone).push({ id: c.id, name: c.name });
    }
  }
  for (const list of out.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

// ---------------------------------------------------------------------------
// 4. The packing.
// ---------------------------------------------------------------------------

function subsets(arr, n) {
  const out = [];
  const rec = (i, cur) => {
    if (cur.length === n) { out.push([...cur]); return; }
    for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

const key = (set) => [...new Set(set)].sort().join(", ");

/**
 * Assign each un-committed surveyed region a kind set that its own ground
 * licenses and that no other zone in the world uses.
 *
 * DETERMINISTIC. Candidates for a region are its licensed 2-subsets in
 * lexicographic order, then its 3-subsets, then its 1-subsets — two-element
 * sets are spent before three so the cheap space stays legible, and a
 * one-element set is the escape only where no pair survives. The region solved
 * next is always the one with the FEWEST remaining candidates, ties broken by
 * ascending region id, and the search backtracks. Same fabric in, same table
 * out, on every engine.
 *
 * A one-element kind set is legal and anticipated: Z3 floors `resources` at two
 * ENTRIES, and Z6 compares KINDS as a deduped set — two resources of one kind
 * is a one-element set, which Z6's own comment calls out.
 */
export function packKindSets({ regions, taken, budget = 2000 }) {
  const spent = new Set(taken);
  const assigned = new Map();
  // A search budget, not decoration: an INFEASIBLE instance is where an
  // exhaustive backtracker costs the most, and this one is reachable — narrow
  // the licence rule and the search explodes instead of failing. Measured: with
  // `ore` licensed nowhere the un-budgeted search ran past two minutes and the
  // gate HUNG rather than going red, which is worse than a wrong answer.
  // The real instance solves inside 50 nodes (measured across budgets 50, 200,
  // 1000 and 5000 — all solve, all under 35 ms), so 2000 is 40x headroom and
  // still bounds the infeasible case to about a second. Exhausting the budget
  // returns null, which every caller already reports as "no licensed packing
  // exists" — a report, never a hang and never a throw.
  let steps = 0;
  const cands = (r) => [2, 3, 1]
    .flatMap((n) => subsets(licensedKinds({ region: r }), n).map(key))
    .filter((k) => !spent.has(k));
  const rec = (left) => {
    if (!left.length) return true;
    if (++steps > budget) return false;
    let best = null, options = null;
    for (const r of left) {
      const c = cands(r);
      if (options === null || c.length < options.length) { best = r; options = c; }
    }
    const rest = left.filter((r) => r !== best);
    for (const k of options) {
      spent.add(k); assigned.set(best.id, k);
      if (rec(rest)) return true;
      spent.delete(k); assigned.delete(best.id);
    }
    return false;
  };
  const ordered = [...regions].sort((a, b) => (a.id < b.id ? -1 : 1));
  return rec(ordered) && steps <= budget ? assigned : null;
}

// ---------------------------------------------------------------------------
// 5. The names.
// ---------------------------------------------------------------------------

/**
 * Register discipline, mechanically. A landmass draws its names from exactly
 * one register (registers.json's `continentRegister`) and its classifiers from
 * the LANDFORM GROUP, not the dialect — which is why "Sink" is legal on the
 * karst plateau and nowhere else. Minting goes through the Plan D generator, so
 * the register's own onsets and rimes are the only vocabulary in play and the
 * reserved set can never be re-minted onto different ground.
 */
export function nameSources({ root }) {
  const p = (f) => JSON.parse(readFileSync(join(root, "content/world/names", f), "utf8"));
  return { registers: p("registers.json"), classifiers: p("classifiers.json"), reserved: p("reserved.json") };
}

function classifiersFor({ classifiers, registerId, group }) {
  const base = classifiers.byGroup[group] ?? [];
  const extra = classifiers.overrides?.[registerId]?.[group] ?? [];
  return [...new Set([...base, ...extra])];
}

/**
 * Mint a zone name and its two landmark names for one region.
 *
 * `used` is mutated: it carries every name already spoken for anywhere in the
 * world — the reserved canon set, the committed records' zone and landmark
 * names, and everything minted before this region — so Z6's two uniqueness
 * rules are satisfied by construction rather than checked afterwards.
 *
 * Sound: a candidate within `minDistance` phonemes of any name already minted
 * on the SAME landmass is rejected and the next attempt drawn. Confusability is
 * a within-landmass problem — a reader never holds two continents' name lists
 * side by side — which is the same scope G-NAME-SOUND uses.
 */
export function mintForRegion({ region, sources, used, perContinent, ordinal, reserved, inherited, minDistance = 3 }) {
  const registerId = sources.registers.continentRegister[region.continent];
  const register = sources.registers.registers[registerId];
  const local = perContinent.get(region.continent) ?? [];
  perContinent.set(region.continent, local);

  const groups = region.groups.length ? region.groups : [region.group];
  const slots = [
    { form: "stem-classifier", group: groups[0], stream: `zone:${region.id}` },
    { form: "stem-classifier", group: groups[1] ?? groups[0], stream: `lm1:${region.id}` },
    { form: "of-form", group: groups[0], stream: `lm2:${region.id}` },
  ];
  // A canon place already standing in this region takes a landmark slot: it is
  // there, it has a name, and minting a second name for the same ground is how
  // a table stops describing the world. The zone slot is never inherited — a
  // zone is the whole region, not the one thing standing in it.
  const inherit = (inherited ?? []).slice(0, slots.length - 1);
  for (const [i, name] of inherit.entries()) slots[i + 1] = { inherited: name };

  const out = [];
  for (const [slotIndex, slot] of slots.entries()) {
    if (slot.inherited) {
      used.add(slot.inherited);
      local.push(titleStem(slot.inherited));
      out.push({ name: slot.inherited, register: registerId, group: null, classifier: null, inherited: true });
      continue;
    }
    const legal = classifiersFor({ classifiers: sources.classifiers, registerId, group: slot.group });
    // The classifier ROTATES by the region's ordinal on its own landmass, so six
    // fluvial regions in a row do not all come out "<stem> Ford". Deterministic,
    // and independent of the retry counter, which only salts the draw stream.
    const classifier = legal.length ? legal[(ordinal + slotIndex) % legal.length] : null;
    let name = null;
    for (let bump = 0; bump < 128 && name === null; bump++) {
      const cand = mintName({
        register, form: slot.form, classifier,
        stream: `${slot.stream}#${bump}`, used, reserved,
      });
      if (cand.startsWith("UNMINTABLE:")) break;
      // Legibility: the onset+rime join can produce a triple letter
      // ("Sirocc"+"cone"), which no reader parses. Reject and redraw.
      if (/(.)\1\1/i.test(cand)) continue;
      // The classifier must not also be inside the stem ("Pumicreach Reach",
      // "Barchan past Barchanvent") — the name stops telling you what the place
      // is and starts stuttering.
      const stem = titleStem(cand);
      if (classifier && stem.toLowerCase().includes(classifier.toLowerCase())) continue;
      // Confusability is judged on the STEM, not the whole title: name-gen's
      // titleStem() is the register word G-NAME-SOUND judges, and comparing
      // whole titles lets "Grykestone Fenster" and "Stair below Grikestone"
      // both through on the strength of words that are not the name.
      if (local.every((n) => phonemeDistance({ a: n, b: stem }) >= minDistance)) name = cand;
    }
    if (name === null) throw new Error(`unmintable name for ${region.id} (${slot.stream})`);
    used.add(name);
    local.push(titleStem(name));
    out.push({ name, register: registerId, group: slot.group, classifier });
  }
  return {
    registerId, zoneName: out[0].name, landmarks: [out[1].name, out[2].name],
    inheritedLandmarks: out.slice(1).filter((o) => o.inherited).map((o) => o.name),
  };
}

export const zoneSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------
// 6. The whole allocation.
// ---------------------------------------------------------------------------

/**
 * The 40 rows, derived end to end. `derived: false` marks the ten committed
 * records — their kinds, landmarks and region join are transcribed from the
 * shipped files and are exempt from the licence rule, because the join itself
 * is a placeholder that no geography supports.
 */
export function allocate({ root }) {
  const regions = surveyedRegions({ root });
  const committed = committedRecords({ root });
  const byRegion = new Map(committed.map((c) => [c.region, c]));
  const sources = nameSources({ root });
  const pins = canonPinsByRegion({ root });

  const legacy = regions.filter((r) => byRegion.has(r.id));
  const fresh = regions.filter((r) => !byRegion.has(r.id));
  const packed = packKindSets({ regions: fresh, taken: committed.map((c) => key(c.kinds)) });
  if (!packed) return { regions, rows: null, problem: "no licensed kind-set packing exists" };

  const used = new Set([
    ...sources.reserved.names,
    ...committed.map((c) => c.zone),
    ...committed.flatMap((c) => c.landmarks),
    ...[...pins.values()].flat().map((p) => p.name),
  ]);
  const perContinent = new Map();
  // Seed the per-landmass sound pool with the committed landmark names so a
  // freshly minted Wealdmarch name cannot land next to one already in print.
  for (const c of committed) {
    const region = regions.find((r) => r.id === c.region);
    if (!region) continue;
    const pool = perContinent.get(region.continent) ?? [];
    pool.push(...c.landmarks.map((n) => titleStem(n)));
    perContinent.set(region.continent, pool);
  }

  const reserved = new Set(sources.reserved.names);
  const ordinals = new Map();
  const rows = [];
  for (const region of regions) {
    const licensed = licensedKinds({ region });
    if (byRegion.has(region.id)) {
      const c = byRegion.get(region.id);
      rows.push({
        region: region.id, continent: region.continentName, continentId: region.continent,
        terrain: region.terrain, group: region.group, zone: c.zone, kinds: c.kinds, landmarks: c.landmarks,
        licensed, derived: false,
        unlicensed: c.kinds.filter((k) => !licensed.includes(k)),
      });
      continue;
    }
    const ordinal = ordinals.get(region.continent) ?? 0;
    ordinals.set(region.continent, ordinal + 1);
    const inherited = (pins.get(region.id) ?? []).map((p) => p.name);
    // The name is spoken for by the pin, not by the mint: drop it from `used`
    // so the inherit branch can claim it, and let every other name stay barred.
    for (const n of inherited) used.delete(n);
    const minted = mintForRegion({ region, sources, used, perContinent, ordinal, reserved, inherited });
    const kinds = packed.get(region.id).split(", ");
    rows.push({
      region: region.id, continent: region.continentName, continentId: region.continent,
      terrain: region.terrain, group: region.group, zone: zoneSlug(minted.zoneName), zoneName: minted.zoneName,
      kinds, landmarks: minted.landmarks, licensed, derived: true, unlicensed: [],
      inheritedLandmarks: minted.inheritedLandmarks,
    });
  }
  return { regions, rows, legacy: legacy.length, problem: null };
}
