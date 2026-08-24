// Plan D — the world loader, the binding gates and (from Task 7) the join.
//
// SOFT-SKIP DISCIPLINE IS LOAD-BEARING. `content/world/` is absent from ~45
// existing structural fixtures. loadCivil returns { present: false } with NO
// errors for a missing dir, exactly as loadSpine does. A gate that hard-fails
// on a missing content/world/ reds dozens of tests that never claimed to
// carry a world.
//
// NEVER THROWS. Every failure is a string pushed into a returned array — an
// uncaught throw inside check_content.mjs skips finish() and silently drops
// every FAIL recorded before it.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { phonemeDistance, prosody, syllableCount, registerOf, titleStem } from "../../tools/mapforge/lib/name-gen.mjs";
import { loadDungeons, gDungeonReach, dungeonDensityLines } from "./dungeons.mjs";

// The four keys a bound record may never carry, at any depth. A bound record
// that knows where it is has stopped being bound.
export const BANNED_COORDINATE_KEYS = Object.freeze(["at", "points", "rect", "anchor"]);

const readJsonSafe = (path, errors) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { errors.push(`world: ${path}: ${e.message}`); return null; }
};

// A family dir that EXISTS but cannot be listed (permission bit, not a
// directory) must land as an in-band error like every other failure — an
// uncaught readdirSync throw here skips finish() and drops every FAIL before
// it. Same contract lib/world.mjs's walkJson already serves.
const listJson = (dir, errors) => {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); }
  catch (e) { errors.push(`world: ${dir} cannot be listed: ${e.message}`); return []; }
};

export function loadCivil({ contentRoot }) {
  const root = join(contentRoot, "world");
  const empty = {
    present: false, fabric: {}, handles: new Map(), ledgers: {},
    pinned: [], bound: [], relations: [], lexicon: new Map(), manifest: null, errors: [],
  };
  if (!existsSync(root)) return empty;

  const errors = [];
  const fabric = {};
  for (const f of listJson(join(root, "fabric"), errors)) {
    const doc = readJsonSafe(join(root, "fabric", f), errors);
    if (doc?.continent) fabric[doc.continent] = doc;
  }

  const ledgers = {};
  const handles = new Map();
  for (const f of listJson(join(root, "handles"), errors)) {
    const doc = readJsonSafe(join(root, "handles", f), errors);
    if (!doc?.continent) continue;
    ledgers[doc.continent] = doc;
    for (const h of doc.handles ?? []) handles.set(h.handle, { ...h, continent: doc.continent });
  }

  const civilOf = (sub) =>
    listJson(join(root, "civil", sub), errors).map((f) => {
      const doc = readJsonSafe(join(root, "civil", sub, f), errors);
      return doc ? { file: `world/civil/${sub}/${f}`, doc } : null;
    }).filter(Boolean);

  const pinned = civilOf("pinned");
  const bound = civilOf("bound");

  const relations = [];
  for (const f of listJson(join(root, "relations"), errors)) {
    const doc = readJsonSafe(join(root, "relations", f), errors);
    if (Array.isArray(doc)) for (const r of doc) relations.push({ ...r, file: `world/relations/${f}` });
  }

  const lexicon = new Map();
  const lexDoc = existsSync(join(root, "lexicon/landforms.json"))
    ? readJsonSafe(join(root, "lexicon/landforms.json"), errors) : null;
  for (const row of Array.isArray(lexDoc) ? lexDoc : []) lexicon.set(row.id, row);

  const manifest = existsSync(join(root, "manifest.json"))
    ? readJsonSafe(join(root, "manifest.json"), errors) : null;

  return { present: true, fabric, handles, ledgers, pinned, bound, relations, lexicon, manifest, errors };
}

// Deep scan: a coordinate hidden three levels down is still a coordinate.
function findBannedKey(value) {
  if (Array.isArray(value)) {
    for (const v of value) { const hit = findBannedKey(v); if (hit) return hit; }
    return null;
  }
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      if (BANNED_COORDINATE_KEYS.includes(k)) return k;
      const hit = findBannedKey(value[k]);
      if (hit) return hit;
    }
  }
  return null;
}

export function gBind({ world }) {
  if (!world.present) return [];
  const problems = [];
  const claims = new Map(); // handle -> [record ids]

  for (const { file, doc } of world.bound) {
    const banned = findBannedKey(doc);
    if (banned)
      problems.push(`G-BIND: ${file} carries key "${banned}" — bound records hold meaning, never coordinates`);

    const handle = doc.bind?.handle;
    if (typeof handle !== "string") continue;
    if (!claims.has(handle)) claims.set(handle, []);
    claims.get(handle).push(doc.id);
    if (!world.handles.has(handle))
      problems.push(`G-BIND: ${doc.id} handle "${handle}" does not resolve in any ledger`);
  }

  for (const [handle, ids] of [...claims.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    if (ids.length > 1)
      problems.push(`G-BIND: handle "${handle}" is claimed by ${ids.length} records: ${[...ids].sort().join(", ")}`);

  return problems;
}

// G-NAME-REGISTER / G-NAME-SOUND / G-NAME-PROSODY. The design's four naming
// failures, one gate each; uniqueness is NOT among them because the old
// generator was already 100% unique and still unusable.
export function gNames({ world, registers, classifiers }) {
  if (!world.present || !registers) return [];
  const problems = [];
  const byContinent = new Map();
  for (const { doc } of [...world.pinned, ...world.bound]) {
    const cont = doc.requires?.continent ?? doc.bind?.handle?.slice(0, 3) ?? null;
    if (!cont) continue;
    if (!byContinent.has(cont)) byContinent.set(cont, []);
    byContinent.get(cont).push(doc);
  }

  for (const [cont, docs] of [...byContinent.entries()].sort()) {
    const regId = registerOf({ continent: cont, registers });
    const reg = registers.registers[regId];
    if (!reg) { problems.push(`G-NAME-REGISTER: ${cont} has no register in registers.json`); continue; }

    for (const doc of docs) {
      if (doc.provenance?.authored === "hand") continue; // canon names predate the registers
      if (typeof doc.title !== "string" || !doc.title) continue; // titleless records are named in a later task — never throw here
      // The stem is the register word: trailing for an of-form title
      // ("Reach of the Kelmor" is judged on "Kelmor"), leading otherwise.
      const stem = titleStem(doc.title);
      const onsetOk = reg.onsets.some((o) => stem.startsWith(o));
      const rimeOk = reg.rimes.some((r) => stem.endsWith(r));
      if (!onsetOk || !rimeOk)
        problems.push(`G-NAME-REGISTER: ${doc.id} "${doc.title}" is not in register "${regId}" for ${cont}`);
      if (doc.kind === "landmark" && doc.prose === "frontier") {
        const group = doc.bind?.handle?.split("/")[1] ?? null;
        const legal = [...(classifiers.byGroup[group] ?? []), ...(classifiers.overrides?.[regId]?.[group] ?? [])];
        if (legal.length && !legal.some((c) => doc.title.includes(c)))
          problems.push(`G-NAME-REGISTER: ${doc.id} "${doc.title}" carries no classifier from group "${group}" (${legal.join(", ")})`);
      }
    }

    // All three name gates judge GENERATOR output. Hand-authored canon names
    // predate the registers (exempt above) and must also stay out of the
    // sound and prosody pools: c02's 19 pinned canon titles hold zero "X of Y"
    // forms by construction, so measuring the of-form floor over them fails a
    // gate whose subject never wrote a word of what it measured.
    const names = docs
      .filter((d) => d.provenance?.authored !== "hand" && typeof d.title === "string" && d.title)
      .map((d) => d.title);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        if (phonemeDistance({ a: names[i], b: names[j] }) >= 3) continue;
        if (Math.abs(syllableCount({ name: names[i] }) - syllableCount({ name: names[j] })) > 1) continue;
        problems.push(`G-NAME-SOUND: ${cont}: "${names[i]}" and "${names[j]}" are within 2 phonemes of each other`);
      }

    if (names.length >= 10) {
      const p = prosody({ names });
      if (p.syllableShare > 0.60)
        problems.push(`G-NAME-PROSODY: ${cont}: ${(p.syllableShare * 100).toFixed(1)}% of names share one syllable count (ceiling 60%)`);
      if (p.threePlusShare < 0.15)
        problems.push(`G-NAME-PROSODY: ${cont}: ${(p.threePlusShare * 100).toFixed(1)}% of names are 3+ syllables (floor 15%)`);
      if (p.ofFormShare < 0.10)
        problems.push(`G-NAME-PROSODY: ${cont}: ${(p.ofFormShare * 100).toFixed(1)}% of names take the "X of Y" form (floor 10%)`);
    }
  }
  return problems;
}

// G-PIN-SAT — every pinned record's `requires` block is satisfied by the
// fabric AT ITS SEED POINT. The comparison is against a committed
// `pinReceipts[]` entry rather than a 640,000-cell re-run: the generator
// measured the ground when it placed the record, and the receipt is what
// makes this a gate over committed bytes at 0.05 s instead of a re-generation.
//
// SOFT-ARM: while NO fabric file carries any receipt the generator has not
// been wired (Task 10) and the inputs are absent — an early silent return,
// not 41 failures. The first receipt that exists anywhere arms the gate for
// every pinned record, at which point a missing receipt is a failure.
//
// TASK 10 OBLIGATION: when the receipt generator lands, EVERY continent with
// pins must carry one receipt per pinned record naming it (count = number of
// committed pinned records for that continent) and fabric-file.schema.json's
// `pinReceipts` minItems must be raised accordingly — otherwise this gate
// stays green forever while gating nothing.
//
// MEASUREMENT SOURCE: `measured.shelterFetchKm` MUST be read from
// narrowWaterKm (min-over-axes enclosure), NEVER grid.fetchKm
// (max-over-axes wave exposure) — the max reading is unsatisfiable at 332 of
// 520 port cells and all three capitals.
export function gPinSat({ world }) {
  if (!world.present) return [];
  const problems = [];
  const receipts = new Map();
  let anyReceipts = false;
  for (const f of Object.values(world.fabric))
    for (const r of f.pinReceipts ?? []) { receipts.set(r.id, r); anyReceipts = true; }
  if (!anyReceipts) return [];

  const say = (doc, key, want, got) =>
    problems.push(`G-PIN-SAT: ${doc.id} at [${doc.pin.at[0]}, ${doc.pin.at[1]}]: requires.${key} = ${want} but fabric has ${got}`);

  for (const { doc } of world.pinned) {
    if (!Array.isArray(doc.pin?.at)) continue; // malformed pins are schema failures, not ours
    const rec = receipts.get(doc.id);
    if (!rec) { say(doc, "receipt", "present", "none"); continue; }

    const dx = rec.at[0] - doc.pin.at[0], dy = rec.at[1] - doc.pin.at[1];
    const moved = Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100;
    if (moved > doc.pin.toleranceKm)
      say(doc, "pin", `within ${doc.pin.toleranceKm} km`, `${moved} km away`);

    const req = doc.requires ?? {}, m = rec.measured ?? {};
    if (req.continent && rec.continent !== req.continent) say(doc, "continent", req.continent, rec.continent);
    if (req.landform && m.landform !== req.landform) say(doc, "landform", req.landform, m.landform ?? "none");
    // A MISSING measurement is a failure, never a silent pass: `undefined <= n`
    // is false, so every numeric guard below must test the undefined case out.
    if (req.slopeMax !== undefined && !(typeof m.slope === "number" && m.slope <= req.slopeMax))
      say(doc, "slopeMax", req.slopeMax, m.slope ?? "none");
    if (req.freshWaterWithinKm !== undefined && !(typeof m.freshWaterWithinKm === "number" && m.freshWaterWithinKm <= req.freshWaterWithinKm))
      say(doc, "freshWaterWithinKm", req.freshWaterWithinKm, m.freshWaterWithinKm ?? "none");
    if (req.elevationMaxM !== undefined && !(typeof m.elevationM === "number" && m.elevationM <= req.elevationMaxM))
      say(doc, "elevationMaxM", req.elevationMaxM, m.elevationM ?? "none");
    if (Array.isArray(req.biomeNot) && req.biomeNot.includes(m.biome))
      say(doc, "biomeNot", req.biomeNot.join("/"), m.biome);
    if (req.water) {
      if (req.water.kind && m.waterKind !== req.water.kind)
        say(doc, "water.kind", req.water.kind, m.waterKind ?? "none");
      if (req.water.shelterFetchKmMax !== undefined && !(typeof m.shelterFetchKm === "number" && m.shelterFetchKm <= req.water.shelterFetchKmMax))
        say(doc, "water.shelterFetchKmMax", req.water.shelterFetchKmMax, m.shelterFetchKm ?? "none");
      if (req.water.minDepthM !== undefined && !(typeof m.depthM === "number" && m.depthM >= req.water.minDepthM))
        say(doc, "water.minDepthM", req.water.minDepthM, m.depthM ?? "none");
    }
  }
  return problems;
}

// G-HANDLE-BAND — the gate that catches what an ordinal rank hides. "The
// largest karst group" resolves in every seed; measured across 20 pinned-mask
// seeds it ranged 892 to 15,645 cells, a 17.5x swing. A declared band turns
// that from a silent success into a named failure.
export function gHandleBand({ world }) {
  if (!world.present) return [];
  const problems = [];
  for (const { doc } of world.bound) {
    const h = world.handles.get(doc.bind?.handle);
    if (!h) continue; // already a G-BIND failure; one defect, one line
    const [lo, hi] = doc.bind.expect.sizeKm;
    if (h.type !== doc.bind.expect.type)
      problems.push(`G-HANDLE-BAND: ${doc.id} expects type "${doc.bind.expect.type}" but the handle resolves to "${h.type}"`);
    if (!(h.sizeKm >= lo && h.sizeKm <= hi))
      problems.push(`G-HANDLE-BAND: ${doc.id} resolved to ${h.sizeKm} km2, declared band [${lo}, ${hi}]`);
  }
  return problems;
}

// The ONE entry point check_content.mjs calls. Every gate this plan adds is
// wired here, so `--only=spine` covers all of them and Gate 1's ~4 s budget
// binds the whole set.
export function checkWorldCivil({ opts, fail, warn }) {
  const world = loadCivil({ contentRoot: opts.contentRoot });
  if (!world.present) return;
  for (const e of world.errors) fail(e);
  for (const p of gBind({ world })) fail(p);
  for (const p of gPinSat({ world })) fail(p);
  for (const p of gHandleBand({ world })) fail(p);
  const dungeonSet = loadDungeons({ contentRoot: opts.contentRoot });
  for (const e of dungeonSet.errors) fail(e);
  for (const p of gDungeonReach({ world, dungeons: dungeonSet.dungeons, lexicon: world.lexicon })) fail(p);
  for (const line of dungeonDensityLines({ world, dungeons: dungeonSet.dungeons })) console.log(line);
  const namesDir = join(opts.contentRoot, "world/names");
  const registers = existsSync(join(namesDir, "registers.json"))
    ? readJsonSafe(join(namesDir, "registers.json"), world.errors) : null;
  const classifiers = existsSync(join(namesDir, "classifiers.json"))
    ? readJsonSafe(join(namesDir, "classifiers.json"), world.errors) : { byGroup: {}, overrides: {} };
  for (const p of gNames({ world, registers, classifiers })) fail(p);
  console.log(
    `world-civil: ${world.pinned.length} pinned, ${world.bound.length} bound, ` +
    `${world.relations.length} relations, ${world.handles.size} handles`,
  );
}

// The join. Fabric supplies POSITION AND SIZE; civil supplies MEANING. That
// split is the whole architecture: a record never states where it is, so a
// re-seed cannot leave it stating a position that stopped being true.
//
// Key order is load-bearing. check_spine_emit.mjs's canonStringify serialises
// Object.keys() in insertion order, so a reordered build changes bytes for no
// semantic reason and reds G-SLOT-STABLE on a no-op commit.
//
// The five GEOGRAPHIC keys are not decoration. `tools/mapforge/lib/basin-sheet.mjs`
// dereferences `geo.coastline.points` and `geo.saltmire.polygon` UNCONDITIONALLY
// and iterates `geo.terrainPatches`. Emitting them as null/[] reintroduces
// exactly the `TypeError: Cannot read properties of undefined` that Plan A Task 5
// removed, and it surfaces as `render-sheet --sheet cluster1` dying, which reds
// G-RENDER-LOCK and Plan E's "render every sheet" step. So the resolver DERIVES
// them from the fabric.
export const RESOLVED_KEYS = Object.freeze([
  "continent", "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
  "zones", "towns", "camps", "roads", "landmarks",
  "dungeons", "instances", "relay", "distances", "seaLane", "sheet",
]);

// Which lexicon types stand in for the two named single-feature keys, and
// which terrainKinds read as a drawn patch rather than a region fill. Both
// are data, not conditionals, so adding a kind is a one-line edit.
const SALTMIRE_TYPES = Object.freeze(["tidal-mire", "salt-marsh", "saltmire-pan"]);
const ICE_EDGE_TYPES = Object.freeze(["ice-divide", "outlet-glacier", "moraine-terminal"]);
const PATCH_TERRAIN_KINDS = Object.freeze([
  "upland", "rim", "bramble", "headland", "alkali-flat", "tidal-mire",
  "badlands", "karst-plateau", "lava-field", "scree",
]);

export function resolveCivil({ fabric, handles, civil, dungeons = [] }) {
  const problems = [];
  const out = {};
  for (const k of RESOLVED_KEYS) out[k] = k === "continent" ? (fabric?.continent ?? null) : [];
  out.relay = null; out.distances = null; out.seaLane = null; out.sheet = null;
  out.coastline = null; out.river = null; out.saltmire = null; out.iceEdge = null;

  if (!fabric) { problems.push("resolve: no fabric file for this continent"); return { resolved: out, problems }; }

  const byHandle = new Map();
  for (const inst of fabric.instances ?? []) if (inst.handle) byHandle.set(inst.handle, inst);
  const ledger = new Map((handles?.handles ?? []).map((h) => [h.handle, h]));

  // ── the five GEOGRAPHIC keys, derived from the fabric ────────────────────

  // coastline: the continent's own outer ring. The trunk polygon is simplified
  // from exactly this contour (G-TRUNK-AREA's +/-3% is what pins the two
  // together), so drawing the fabric ring here draws the same coast the chart
  // shows, at fabric resolution.
  out.coastline = fabric.outerRing
    ? { id: `f-coast-${fabric.continent}`, points: fabric.outerRing }
    : null;
  if (!out.coastline) problems.push(`resolve: fabric ${fabric.continent} has no outerRing — the sheet builders dereference coastline.points`);

  // river: the single largest flow-accumulation trace the fabric recorded.
  // One river per continent is a DRAWING decision, not a hydrology claim —
  // the rest are instances, and a sheet with thirteen equal rivers reads as
  // noise. `fabric.trunkRiver` is emitted by P6 as the highest-flowAcc chain.
  out.river = fabric.trunkRiver
    ? { id: `f-river-${fabric.continent}`, points: fabric.trunkRiver.points, name: fabric.trunkRiver.name ?? null }
    : null;

  // saltmire / iceEdge: the largest AREA instance of each named type set.
  // Both are single-feature keys in the doc shape, so "largest" is the rule
  // and it is deterministic because instance order is the handle total order.
  const largestArea = (types) => {
    let best = null;
    for (const i of fabric.instances ?? []) {
      if (!types.includes(i.type) || i.geometry.shape !== "area") continue;
      if (!best || i.sizeKm > best.sizeKm || (i.sizeKm === best.sizeKm && i.id < best.id)) best = i;
    }
    return best;
  };
  const mire = largestArea(SALTMIRE_TYPES);
  out.saltmire = mire ? { id: mire.id, name: null, polygon: mire.geometry.ring } : null;
  const ice = largestArea(ICE_EDGE_TYPES);
  out.iceEdge = ice ? { id: ice.id, points: ice.geometry.ring } : null;

  // terrainPatches: the region rings whose terrainKind reads as a drawn patch
  // rather than a background fill. Reported regions never contribute — they
  // carry terrainKind === null by construction (spec §6.4 extension 3).
  out.terrainPatches = (fabric.regions ?? [])
    .filter((r) => r.terrainKind && PATCH_TERRAIN_KINDS.includes(r.terrainKind))
    .map((r) => ({ id: `tp-${r.id.replace("/", "-")}`, terrainKind: r.terrainKind, polygon: r.ring }));

  out.zones = (fabric.regions ?? []).map((r) => ({
    id: r.id, name: r.title ?? r.id, order: null, levelBand: r.levelBand,
    terrainKind: r.terrainKind, town: (r.settlements ?? [])[0] ?? null,
    labelAt: r.labelAt ?? centroidOf(r.ring), polygon: r.ring,
    survey: r.survey, areaKm2: r.areaKm2, adjacent: r.adjacent ?? [],
    provenance: r.provenance ?? null,
  }));

  for (const { file, doc } of civil.pinned ?? []) {
    if ((doc.requires?.continent ?? fabric.continent) !== fabric.continent) continue;
    const row = {
      id: doc.id, name: doc.title, at: doc.pin.at,
      zone: regionAt({ fabric, at: doc.pin.at }),
      properties: doc.properties ?? [], coasts: doc.coasts ?? [],
      ...(doc.settlementRank ? { settlementRank: doc.settlementRank } : {}),
      ...(doc.plan ? { plan: doc.plan } : {}),
      source: file,
    };
    if (doc.kind === "town") out.towns.push(row);
    else if (doc.kind === "camp") out.camps.push(row);
    else out.landmarks.push({ ...row, region: row.zone, sizeKm: null, type: doc.requires?.landform ?? null });
  }

  for (const { doc } of civil.bound ?? []) {
    const handle = doc.bind?.handle;
    if (!handle || !handle.startsWith(fabric.continent + "/")) continue;
    const inst = byHandle.get(handle);
    if (!inst) {
      problems.push(`resolve: ${doc.id}: handle "${handle}" has no instance in fabric ${fabric.continent === null ? "?" : "continent-" + fabric.continent.slice(1)}`);
      continue;
    }
    out.landmarks.push({
      id: doc.id, name: doc.title, at: inst.geometry.at ?? inst.geometry.points?.[0] ?? null,
      region: inst.region, type: inst.type, sizeKm: ledger.get(handle)?.sizeKm ?? inst.sizeKm,
      handle, glyph: inst.glyph, properties: doc.properties ?? [],
      note: doc.lore?.note ?? null, labelAnchor: doc.lore?.labelAnchor ?? "north",
      prose: doc.prose,
    });
  }

  for (const d of dungeons) {
    const inst = byHandle.get(d.bind?.handle);
    if (!inst) continue;
    out.dungeons.push({
      id: d.id, name: d.title, at: inst.geometry.at ?? null, region: inst.region,
      family: d.family, entranceType: d.entranceType, floors: d.floors,
      levelBand: d.levelBand, handle: d.bind.handle, properties: [],
    });
  }

  // Texture: glyph and hit-test only, never a label and never prose.
  out.instances = (fabric.instances ?? []).filter((i) => !i.named)
    .map((i) => ({ id: i.id, type: i.type, at: i.geometry.at ?? null, glyph: i.glyph, sizeKm: i.sizeKm }));

  const cmp = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const k of ["zones", "towns", "camps", "landmarks", "dungeons", "instances", "terrainPatches"]) out[k].sort(cmp);

  // R3's third clause, applied to REGIONS. Plan A kept lore.order as the sort
  // key for its byte-identity invariant and Plan C's G-ORDER covers the handle
  // ledgers, which left the region ordering with no total order at all after
  // the redraw. The rule is the SAME one the ledgers use — (-area, contentHash)
  // — so the programme has one ordering discipline, not two, and the result is
  // a DENSE permutation of 0..n-1 that gZoneOrder (below) re-checks.
  const surveyed = out.zones.filter((z) => z.survey === "surveyed");
  surveyed
    .map((z) => ({ z, key: [-z.areaKm2, hashOfZone(z)] }))
    .sort((a, b) => (a.key[0] - b.key[0]) || (a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0))
    .forEach(({ z }, n) => { z.order = n; });

  return { resolved: out, problems };
}

// ── G-ORDER, region half ───────────────────────────────────────────────────
// R3's third clause — the resulting order is a DENSE PERMUTATION of 0..n-1 —
// applied to the REGION order. Plan C's gWorldOrder carries clauses (1)-(3)
// for the handle ledgers and stops there on purpose: `order` is minted inside
// resolveCivil, onto the RESOLVED zones, and
// content/schemas/fabric-file.schema.json is `additionalProperties: false` on
// regions[] without an `order` key, so a fabric region can never legally carry
// one. A gap here means a surveyed zone ceased to exist with every other gate
// green — the live defect R3 names — so it is a FAIL, not a warn.
//
// Reported zones are skipped: they are unsurveyed ground with no area to rank.
export function gZoneOrder({ resolvedByContinent }) {
  const problems = [];
  for (const [cont, doc] of Object.entries(resolvedByContinent ?? {}).sort()) {
    const surveyed = (doc?.zones ?? []).filter((z) => z.survey === "surveyed");
    if (surveyed.length === 0) continue;
    const ranks = surveyed.map((z) => z.order).sort((a, b) => a - b);
    if (!ranks.every((v, i) => v === i))
      problems.push(`G-ORDER: ${cont} zone order is not a dense permutation of ` +
                    `0..${surveyed.length - 1} — got [${ranks.join(", ")}]`);
  }
  return problems;
}

// The content hash a zone is ordered by: its id, area and ring, canonicalised.
// NOT lore.order — that field silently drops a region that lacks it and
// silently reorders duplicates (spec R3, and the live defect I-096 names).
function hashOfZone(z) {
  return "sha256:" + createHash("sha256")
    .update(JSON.stringify([z.id, z.areaKm2, z.polygon])).digest("hex");
}

function centroidOf(ring) {
  if (!Array.isArray(ring) || !ring.length) return null;
  let x = 0, y = 0;
  for (const [px, py] of ring) { x += px; y += py; }
  return [Math.round((x / ring.length) * 100) / 100, Math.round((y / ring.length) * 100) / 100];
}

// Which region owns a point. Ray casting over the region ring; the fabric's
// cell partition guarantees exactly one owner, so the first hit is the answer.
function regionAt({ fabric, at }) {
  for (const r of fabric.regions ?? []) {
    const ring = r.ring ?? [];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > at[1]) !== (yj > at[1]) && at[0] < ((xj - xi) * (at[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return r.id;
  }
  return null;
}
