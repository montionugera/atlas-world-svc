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
import { phonemeDistance, prosody, syllableCount, registerOf, titleStem } from "../../tools/mapforge/lib/name-gen.mjs";

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
