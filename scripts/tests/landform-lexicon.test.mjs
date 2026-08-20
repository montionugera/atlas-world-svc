// Plan B Task 1 — the landform lexicon is the vocabulary Plan C instances
// against and Plan D binds to. Its census is a contract, not a preference:
// 170 distinct types / 178 group memberships / 8 dual-listed / 23
// dungeon-capable / 40 glyph families over 12 groups. (170, not the spec's
// 164: six ids Plan D's pinned roster needs had no equivalent — D-B4.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEX = JSON.parse(readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/landform-type.schema.json"), "utf8"));

const GROUPS = ["coastal", "fluvial", "mountain", "glacial", "karst", "erosional",
  "desert", "volcanic", "wetland", "lakes", "island", "oceanic"];
// The membership census, per group: spec section 5.5's table plus the six
// D-B4 additions (coastal +2 headland/sea-waterfall, fluvial +1 ford,
// glacial +1 ice-shelf, volcanic +2 ash-front/ash-plain).
// 22+14+16+22+12+9+19+15+17+14+8+10 = 178.
const MEMBERSHIPS = { coastal: 22, fluvial: 14, mountain: 16, glacial: 22, karst: 12,
  erosional: 9, desert: 19, volcanic: 15, wetland: 17, lakes: 14, island: 8, oceanic: 10 };
// The six D-B4 ids: headland/ford/sea-waterfall are bound by a named pinned
// record, ice-shelf/ash-front/ash-plain are Plan C generator vocabulary for
// c01's shelf ice and c10's tephra ground. Pinned by test so a later "tidy the
// lexicon" commit cannot quietly unbind a pin or blank a continent's ground.
const DB4_ADDITIONS = {
  headland: "coastal", "sea-waterfall": "coastal", ford: "fluvial",
  "ice-shelf": "glacial", "ash-front": "volcanic", "ash-plain": "volcanic" };
// The closed predicate vocabulary — every key here must be a field the Plan C
// grid actually carries (grid.mjs: elev, moist, temp, flowAcc, flags).
const REQUIRES_KEYS = new Set(["rock", "precipDecileMin", "precipDecileMax",
  "tempDecileMin", "tempDecileMax", "slopeMin", "slopeMax", "nearFlag",
  "flowAccMin", "elevMin", "elevMax"]);

test("every lexicon row validates against landform-type.schema.json", () => {
  const validate = new AjvClass({ allErrors: true }).compile(SCHEMA);
  for (const row of LEX)
    assert.ok(validate(row), `${row?.id}: ${JSON.stringify(validate.errors)}`);
});

test("census: 170 distinct types, 178 memberships, 8 dual-listed", () => {
  assert.equal(LEX.length, 170);
  assert.equal(new Set(LEX.map((r) => r.id)).size, 170, "ids must be unique");
  const dual = LEX.filter((r) => r.alsoGroups.length > 0);
  assert.equal(dual.length, 8);
  const memberships = LEX.reduce((n, r) => n + 1 + r.alsoGroups.length, 0);
  assert.equal(memberships, 178);
});

test("the six D-B4 additions exist, in the right group, single-listed", () => {
  // Six ids had no equivalent in the 164-row draft, so they live here (D-B4)
  // rather than being invented downstream. Three are bound by a named pinned
  // record (headland, ford, sea-waterfall) and deleting one silently unbinds
  // that pin; three are Plan C generator vocabulary (ice-shelf, ash-front,
  // ash-plain) and deleting one leaves c01's shelf ice or c10's tephra ground
  // with no form to draw. Both failures are silent, which is why they are
  // asserted here rather than left to a downstream gate.
  const byId = new Map(LEX.map((r) => [r.id, r]));
  for (const [id, group] of Object.entries(DB4_ADDITIONS)) {
    const row = byId.get(id);
    assert.ok(row, `${id}: a D-B4 addition the lexicon does not ship`);
    assert.equal(row.group, group, `${id}: primary group`);
    assert.deepEqual(row.alsoGroups, [], `${id}: an addition is single-listed — dual stays 8`);
    assert.equal(row.dungeonCapable, false, `${id}: dungeonCapable stays pinned at 23`);
  }
});

test("per-group membership counts match the spec table", () => {
  const got = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const r of LEX) for (const g of [r.group, ...r.alsoGroups]) got[g]++;
  assert.deepEqual(got, MEMBERSHIPS);
});

test("a type never lists its own primary group in alsoGroups", () => {
  for (const r of LEX) assert.ok(!r.alsoGroups.includes(r.group), r.id);
});

// The one documented exception to "a dungeon door is an entrance, not a field".
// D-B2 pins the dungeon-capable set at the 23 names spec section 5.5
// enumerates, and "caldera floor" is one of them — but the plan's own row
// table gives caldera-floor `geometry: area` (1-14 km of walkable floor is not
// a mark). Both halves are load-bearing: budgets.json pins
// landforms.dungeonCapableTypes: 23, and Plan D's 60 dungeons bind to that
// enumerated list. So the exception is named here rather than the row being
// bent to fit, and it is asserted as an EXACT set so it stays sensitive in
// both directions — a second area dungeon type reddens, and caldera-floor
// quietly losing dungeonCapable reddens too.
const DUNGEON_AREA_EXCEPTIONS = ["caldera-floor"];

test("23 types are dungeonCapable and only the named exception is an area", () => {
  const d = LEX.filter((r) => r.dungeonCapable);
  assert.equal(d.length, 23);
  assert.deepEqual(
    d.filter((r) => r.geometry === "area").map((r) => r.id).sort(),
    [...DUNGEON_AREA_EXCEPTIONS].sort(),
    "a dungeon door is an entrance, not a field — see DUNGEON_AREA_EXCEPTIONS");
});

// The 40 family NAMES, not just the count. `owner.size === 40` is genuinely
// derived and catches a collapse (two families merging -> 39), but it cannot
// see a RENAME: one family leaves the set, one joins, the count never moves.
// Four glyphs are used by exactly one row each (g-arch, g-delta, g-tower,
// g-oasis), so four families could be renamed or typo'd invisibly — and Task 7
// builds the glyph atlas by joining on exactly these strings.
const GLYPH_FAMILIES = ["g-arch", "g-arch-rock", "g-atoll", "g-bog", "g-caldera",
  "g-cave", "g-cenote", "g-cirque", "g-cliff", "g-cone", "g-crevasse", "g-delta",
  "g-dune", "g-erratic", "g-falls", "g-fan", "g-gully", "g-hoodoo", "g-isle",
  "g-lagoon", "g-lake", "g-lavafield", "g-mangrove", "g-meander", "g-mesa",
  "g-moraine", "g-oasis", "g-pavement", "g-peak", "g-playa", "g-reef", "g-ridge",
  "g-scree", "g-seamount", "g-spit", "g-tarn", "g-tower", "g-tuft", "g-vent", "g-wadi"];

test("the 40 glyph family names are exactly these — Task 7's atlas joins on them", () => {
  assert.equal(GLYPH_FAMILIES.length, 40);
  assert.deepEqual([...new Set(LEX.map((r) => r.glyph))].sort(), [...GLYPH_FAMILIES].sort());
});

test("40 glyph families, and no glyph is shared by two PRIMARY groups", () => {
  const owner = new Map(); // glyph -> primary group
  for (const r of LEX) {
    const prev = owner.get(r.glyph);
    if (prev === undefined) owner.set(r.glyph, r.group);
    else assert.equal(prev, r.group,
      `G-GLYPH: groups "${prev}" and "${r.group}" share glyph "${r.glyph}"`);
  }
  assert.equal(owner.size, 40);
});

test("every requires key is in the closed predicate vocabulary", () => {
  for (const r of LEX)
    for (const k of Object.keys(r.requires))
      assert.ok(REQUIRES_KEYS.has(k), `${r.id}: requires.${k} is not a fabric cell field`);
});

test("the predicate vocabulary is EXACTLY what the committed schema declares", () => {
  // One language, one definition. The schema is the authority because it is
  // committed and validates all 170 rows with additionalProperties: false.
  assert.deepEqual([...REQUIRES_KEYS].sort(),
    Object.keys(SCHEMA.properties.requires.properties).sort());
});

// The commit subject for this task is "a closed row schema" and the brief names
// the closure as authority-level: "the requires predicate vocabulary is closed
// at exactly 11 keys under additionalProperties: false". The test above asserts
// the eleven NAMES; nothing asserted the object was CLOSED, so flipping either
// `additionalProperties` to true shipped green — after which the very next
// commit could add a twelfth predicate that Plan C's matchesRequires throws on.
// Negative cases, because a closure is only observable through a rejection.
test("the row schema is CLOSED — at the root and on requires", () => {
  assert.equal(SCHEMA.additionalProperties, false, "root");
  assert.equal(SCHEMA.properties.requires.additionalProperties, false, "requires");
  const validate = new AjvClass({ allErrors: true }).compile(SCHEMA);
  const row = JSON.parse(JSON.stringify(LEX[0]));
  assert.ok(validate(row), `the base row must be valid first: ${JSON.stringify(validate.errors)}`);
  for (const key of ["notes", "tags", "biome", "Glyph"])
    assert.equal(validate({ ...row, [key]: "x" }), false, `a row carrying \`${key}\` must be rejected`);
  for (const key of ["moistMin", "wetness", "rocks", "elevMinimum"])
    assert.equal(validate({ ...row, requires: { ...row.requires, [key]: 1 } }), false,
      `requires.${key} is outside the closed predicate vocabulary and must be rejected`);
  // ...and every one of the eleven declared keys is still accepted, so the
  // closure cannot be "fixed" by narrowing the vocabulary instead.
  const sample = { rock: "carbonate", precipDecileMin: 1, precipDecileMax: 8, tempDecileMin: 1,
    tempDecileMax: 8, slopeMin: 0.1, slopeMax: 0.9, nearFlag: "SEA", flowAccMin: 2,
    elevMin: 0.1, elevMax: 0.9 };
  assert.deepEqual(Object.keys(sample).sort(), [...REQUIRES_KEYS].sort());
  assert.ok(validate({ ...row, requires: sample }), JSON.stringify(validate.errors));
});

// Two independently-maintained enumerations of one predicate language is how
// P10 ends up THROWING on the first coastal row it meets, which is essentially
// the whole lexicon. Plan C's landforms.mjs exports its switch's key list
// precisely so this test can exist; Plan C Task 8 carries the mirror.
//
// SKIPPED, and reported as skipped. The earlier form did `if (!existsSync(impl))
// return;`, which printed a tick and counted as a pass — so a cross-check that
// has never once executed read as covered. node:test's own skip option is the
// honest form (the sibling instance test already uses it), and it makes the
// dark cross-check visible in the summary line.
const MATCHES_REQUIRES = join(ROOT, "tools/mapforge/lib/passes/landforms.mjs");
test("every requires key is handled by Plan C's matchesRequires — the cross-check", {
  skip: existsSync(MATCHES_REQUIRES)
    ? false
    : "tools/mapforge/lib/passes/landforms.mjs is not present yet (Plan C)",
}, () => {
  const impl = MATCHES_REQUIRES;
  const src = readFileSync(impl, "utf8");
  const m = /export const REQUIRES_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(src);
  assert.ok(m, "landforms.mjs does not export REQUIRES_KEYS");
  const implKeys = [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(implKeys, [...REQUIRES_KEYS].sort(),
    "the lexicon schema and matchesRequires disagree about the predicate language");
});

test("sizeKm bands are ordered, positive, and inside the frame", () => {
  for (const r of LEX) {
    const [lo, hi] = r.sizeKm;
    assert.ok(lo > 0 && hi > lo, `${r.id}: sizeKm [${lo}, ${hi}]`);
    assert.ok(hi <= 400, `${r.id}: sizeKm high bound exceeds the 400 km frame`);
  }
});

test("every gloss is a real sentence and never just restates the id", () => {
  for (const r of LEX) {
    assert.ok(r.gloss.length > 0 && r.gloss.length <= 120, `${r.id}: gloss length`);
    assert.ok(r.gloss.endsWith("."), `${r.id}: gloss must end in a full stop`);
    assert.notEqual(r.gloss.toLowerCase().replace(/[^a-z]/g, ""),
      r.id.replace(/-/g, ""), `${r.id}: gloss restates the id`);
  }
});

test("absentBecause is null everywhere until a real world proves otherwise", () => {
  for (const r of LEX) assert.equal(r.absentBecause, null, r.id);
});
