import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
// `readdirSync` is bound here and first used by Task 3b's directory-enumeration
// test — the one that proves content/zones/ holds exactly ten records and
// nothing else, the way Task 4's gate enumerates it.
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

import { loadPlaces } from "../lib/places.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SCHEMA_PATH = join(ROOT, "content/schemas/zone-content.schema.json");

// I-060 spec §6 / §7. The ten cluster-1 zones, in geography order.
const ZONE_IDS = [
  "meltwash-terrace", "millcross-ford", "rooktide-reach", "thornveil", "emberdown",
  "gildmark-head", "hollowmarch", "ashvale-front", "northern-icefield", "cindervast",
];

// Real levelBands from content/maps/cluster1-geography.json#zones. No Z-rule
// reads them, but the fixture geography must be shaped like the real one.
const ZONE_BANDS = {
  "meltwash-terrace": [1, 10], "millcross-ford": [1, 15], "rooktide-reach": [10, 20],
  "thornveil": [15, 28], "emberdown": [25, 35], "gildmark-head": [30, 45],
  "hollowmarch": [35, 48], "ashvale-front": [10, 80], "northern-icefield": [55, 70],
  "cindervast": [65, 80],
};

// The closed resource-kind enum (spec §6). Z7 owns it; the SCHEMA must not.
const RESOURCE_KINDS = ["crop", "timber", "ore", "fuel", "stone", "water", "forage", "salvage"];

// The seven runtime zoneHazards types (content/schemas/map.schema.json
// #zoneHazards/items/type). Z5 owns this list; the schema must not.
const EFFECTS = ["freeze", "stun", "burn", "poison", "regen", "heal", "damage"];

// Z4's kebab-case shape. The gate owns the rule (the schema must not carry a
// `pattern`), but Tasks 3a/3b assert it over the committed records too, so the
// ten files are proven kebab-clean BEFORE the gate that enforces it exists.
const ZONE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Ten pairwise-DISTINCT resource-kind sets, one per zone, so the baseline
// fixture is Z6-clean by construction and every Z6 test has to manufacture the
// collision it asserts.
//
// DELIBERATELY NOT the shipped records' kind sets (see Task 2 §2.1 and Tasks
// 3a/3b). These are hermetic fixture values whose only requirement is to be ten
// pairwise-distinct sets. Three of Task 4's Z6 tests depend on `gildmark-head`
// being exactly {ore, stone} and on `hollowmarch` NOT being, so that the
// collision they manufacture is reachable; the `doesNotMatch(/resource-kind
// set/)` assertion in Task 4's Z3-resources test depends on the same thing.
// DO NOT "reconcile" this table with content/zones/*.json — syncing them is an
// obvious-looking cleanup that silently defangs three tests. Changing the
// authored sets must not change these; changing these must not change the
// authored sets.
const FIXTURE_KINDS_BY_ZONE = {
  "meltwash-terrace": ["water", "forage"],
  "millcross-ford": ["crop", "stone"],
  "rooktide-reach": ["salvage", "timber"],
  "thornveil": ["timber", "forage"],
  "emberdown": ["fuel", "crop"],
  "gildmark-head": ["ore", "stone"],
  "hollowmarch": ["ore", "fuel"],
  "ashvale-front": ["stone", "salvage"],
  "northern-icefield": ["water", "stone"],
  "cindervast": ["salvage", "ore"],
};

function compile() {
  return new AjvClass({ allErrors: true }).compile(
    JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
}

// A record that satisfies every Z-rule, sitting EXACTLY on the Z3 floors (2 of
// each) so any test that removes one element trips the floor and no test
// accidentally has slack.
function zoneRecord(id) {
  const [k1, k2] = FIXTURE_KINDS_BY_ZONE[id];
  return {
    zone: id,
    reasonToGo: `What a person walks into ${id} to take out again.`,
    hazards: [
      { id: `${id}-hazard-a`, name: `${id} hazard A`, description: "d", effect: "burn" },
      { id: `${id}-hazard-b`, name: `${id} hazard B`, description: "d", effect: "poison" },
    ],
    resources: [
      { id: `${id}-res-a`, name: `${id} resource A`, kind: k1, description: "d" },
      { id: `${id}-res-b`, name: `${id} resource B`, kind: k2, description: "d" },
    ],
    landmarks: [
      // `source` is optional (spec §6): A carries one, B deliberately does not,
      // so the pass case proves no rule silently requires it.
      {
        id: `${id}-mark-a`, name: `${id} landmark A`, description: "d",
        source: "docs/worldbuilding/A1-geography-cluster1.md#6",
      },
      { id: `${id}-mark-b`, name: `${id} landmark B`, description: "d" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Schema-vs-gate division of labour. The gate `continue`s past a schema-invalid
// document (checkBestiaryPlacement does the same), so ANY constraint the schema
// duplicates makes the corresponding Z-rule UNREACHABLE — it could be deleted
// from check_content.mjs and the suite would stay green off the schema error.
// These tests pin the division so that can never happen silently.
// ---------------------------------------------------------------------------

test("the baseline record validates", () => {
  const validate = compile();
  assert.ok(validate(zoneRecord("emberdown")), JSON.stringify(validate.errors, null, 2));
});

test("schema rejects an unknown top-level property", () => {
  assert.equal(compile()({ ...zoneRecord("emberdown"), surprise: true }), false);
});

test("schema accepts an optional root spineId — the F-041 foreign key to content/spine/nodes/", () => {
  const validate = compile();
  assert.ok(
    validate({ ...zoneRecord("emberdown"), spineId: "n-emberdown" }),
    JSON.stringify(validate.errors, null, 2)
  );
});

test("schema rejects an unknown property inside a resource", () => {
  const doc = zoneRecord("emberdown");
  doc.resources[0].yield = 3;
  assert.equal(compile()(doc), false);
});

test("schema rejects a record with no reasonToGo", () => {
  const doc = zoneRecord("emberdown");
  delete doc.reasonToGo;
  assert.equal(compile()(doc), false);
});

test("schema rejects a resource with no kind, and a landmark with no description", () => {
  const validate = compile();
  const noKind = zoneRecord("emberdown");
  delete noKind.resources[0].kind;
  assert.equal(validate(noKind), false, "kind is required");
  const noDesc = zoneRecord("emberdown");
  delete noDesc.landmarks[0].description;
  assert.equal(validate(noDesc), false, "description is required");
});

test("reachability: the schema must NOT floor the arrays — Z3 owns the floors", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards = [doc.hazards[0]];
  doc.resources = [doc.resources[0]];
  doc.landmarks = [doc.landmarks[0]];
  doc.reasonToGo = "";
  assert.ok(validate(doc), `a below-floor record must be SCHEMA-valid so Z3 is the \
only thing that can reject it: ${JSON.stringify(validate.errors, null, 2)}`);
});

test("reachability: the schema must NOT pattern-lock item ids — Z4 owns kebab-case", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards[0].id = "Seam_Damp";
  doc.resources[0].id = "Burning Stone";
  doc.landmarks[0].id = "TheAdits";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("reachability: the schema must NOT enum-lock hazard effect — Z5 owns the seven types", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards[0].effect = "melt";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("reachability: the schema must NOT enum-lock resources[].kind — Z7 owns the enum", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.resources[0].kind = "gemstone";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema keeps `effect` optional — a hazard with none is a valid document", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  delete doc.hazards[0].effect;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema keeps `source` optional — an uncited landmark is a review question, not an error", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  delete doc.landmarks[0].source;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

// `note` is the authoring-only field spec §6's example record carries, and
// thirteen of the twenty-three authored hazards use it to say why no runtime
// effect fits (Task 3a/3b). With `additionalProperties: false` at every level,
// deleting `note` from the schema would make all thirteen of those records
// schema-invalid — and no other test in this plan constructs a record with one,
// so the suite would stay green until someone hit it in content. This is that
// test.
test("schema accepts an optional authoring note on a hazard", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards[0].note = "authoring note; never player-facing";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

// The schema deliberately stops here: uniqueness is cross-item, and the gate
// (Z4) owns it. Mirrors bestiary-placement.test.mjs's note that "the schema
// does not constrain depthTier id uniqueness". This test pins the division so
// a later reader does not "fix" the schema and leave Z4 untested.
test("schema does NOT catch duplicate ids within an array — that is Z4's job", () => {
  const doc = zoneRecord("emberdown");
  doc.hazards[1] = { ...doc.hazards[0] };
  assert.ok(compile()(doc), "duplicate detection belongs to the gate, not the schema");
});

// ---------------------------------------------------------------------------
// The committed content. These are the only tests that read the real files;
// everything below (Task 4) runs on a hermetic fixture.
// ---------------------------------------------------------------------------

test("every committed zone record validates against the committed schema", () => {
  const validate = compile();
  for (const id of ZONE_IDS) {
    const path = join(ROOT, `content/zones/zone-${id}.json`);
    assert.ok(existsSync(path), `missing ${path}`);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    assert.ok(validate(doc), `${id}: ${JSON.stringify(validate.errors, null, 2)}`);
    assert.equal(doc.zone, id);
  }
});

test("the committed records cover exactly the resolved world's zones", () => {
  // Plan A Task 12: was a read of content/maps/cluster1-geography.json, which
  // this task deleted. Same join, same assertion, resolved from the spine.
  const { doc, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, []);
  assert.deepEqual([...doc.zones.map((z) => z.id)].sort(), [...ZONE_IDS].sort());
});

// ENUMERATES the directory instead of addressing it by constructed name. Every
// other test in this block loops `ZONE_IDS` and reads
// `content/zones/zone-${id}.json`, so a file nobody named is invisible to all of
// them — and Task 4's checkZoneContent does the opposite, reading
// `readdirSync(dir).filter((f) => /^zone-.+\.json$/.test(f))`. A leftover
// experiment (`zone-emberdown-copy.json`), a macOS duplicate
// (`zone-thornveil 2.json`), or a record whose filename and `zone` field
// disagree all match the gate's filter, all get committed by
// `git add content/zones`, and all pass the by-name tests — the first thing to
// see them would be Task 4 Step 7's real-content run, AFTER the gate is
// committed. This test closes the record set before the gate that enforces it
// exists.
test("content/zones holds exactly the ten records and nothing else", () => {
  const files = readdirSync(join(ROOT, "content/zones"))
    .filter((f) => /^zone-.+\.json$/.test(f)).sort();
  assert.deepEqual(files, ZONE_IDS.map((id) => `zone-${id}.json`).sort(),
    "an extra or misnamed zone-*.json is invisible to the by-name tests but fatal to Z1/Z2");
});

// Z3's floors, Z4's id rules and Z6's distinctiveness, asserted against the
// COMMITTED records rather than only against fixtures. Task 4's gate enforces
// these for anyone editing later; this pins that the ten shipped records were
// correct on the day they landed, without waiting for a hand-run of
// check_content.mjs.
//
// Z4 is covered HERE and not only in Task 4 on purpose. If a record with
// `id: "The Adits"` or two hazards sharing an id first detonated at Task 4's
// real-content gate run, the remedy would be editing content/zones/*.json after
// the gate had already been committed. Proving the records kebab-clean before
// the gate exists moves that failure one task earlier, where the records are
// still the task under edit. Z1's orphan branch and Z2's duplicate branch are
// pre-proven by the directory-enumeration test above, not by this one. Task 4's
// "Files:" block additionally carries a remedy-only row permitting a record edit
// for anything that still reaches its Step 7 — the three defences are layered,
// none of them is claimed to be complete on its own.
test("every committed record clears the Z3 floors and the Z4 id rules", () => {
  for (const id of ZONE_IDS) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/zones/zone-${id}.json`), "utf8"));
    assert.ok(doc.reasonToGo.trim() !== "", `${id}: empty reasonToGo`);
    for (const f of ["hazards", "resources", "landmarks"]) {
      assert.ok(doc[f].length >= 2, `${id}: ${doc[f].length} ${f}, needs at least 2`);
      const seen = new Set();
      for (const item of doc[f]) {
        assert.match(item.id, ZONE_ID_RE, `${id}: ${f} id "${item.id}" is not kebab-case`);
        assert.equal(seen.has(item.id), false, `${id}: duplicate ${f} id "${item.id}"`);
        seen.add(item.id);
      }
    }
  }
});

test("the committed records have ten distinct resource-kind sets and no shared landmark name", () => {
  const kindSets = new Map();
  // DELIBERATELY STRICTER THAN Z6. The gate's Z6 landmark rule fires only when a
  // name is shared ACROSS zones (`if (shared.length > 1)`), so one zone repeating
  // a name inside its own list passes the gate. This flat Map rejects that too.
  // Keeping it stricter is the choice: twenty landmarks, twenty names, no
  // exceptions. If this ever fails on an intra-zone repeat, fix the record — do
  // not relax the test to match the gate.
  const names = new Map();
  for (const id of ZONE_IDS) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/zones/zone-${id}.json`), "utf8"));
    for (const r of doc.resources)
      assert.ok(RESOURCE_KINDS.includes(r.kind), `${id}: bad kind "${r.kind}"`);
    for (const h of doc.hazards)
      if (h.effect !== undefined)
        assert.ok(EFFECTS.includes(h.effect), `${id}: bad effect "${h.effect}"`);
    const key = [...new Set(doc.resources.map((r) => r.kind))].sort().join(",");
    assert.equal(kindSets.get(key), undefined, `${id} shares kind set [${key}] with ${kindSets.get(key)}`);
    kindSets.set(key, id);
    for (const l of doc.landmarks) {
      const k = l.name.trim().toLowerCase();
      assert.equal(names.get(k), undefined, `landmark "${l.name}" in both ${names.get(k)} and ${id}`);
      names.set(k, id);
    }
  }
  assert.equal(kindSets.size, 10);
});

const GEOGRAPHY = {
  zones: ZONE_IDS.map((id) => ({ id, name: id, levelBand: ZONE_BANDS[id] })),
};

// All ten records, keyed by filename. `mutators` is zoneId -> (record) => void,
// applied after construction so a test can reach into a nested array.
function allZones(mutators = {}) {
  const files = {};
  for (const id of ZONE_IDS) {
    const rec = zoneRecord(id);
    if (mutators[id]) mutators[id](rec);
    files[`zone-${id}.json`] = rec;
  }
  return files;
}

// `zones: null` = do not create content/zones at all (the soft-skip path).
// `geography: null` = write a literal JSON `null` (the shape-invalid path).
function fixture({ zones = {}, geography = GEOGRAPHY, zoneSchema = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "zone-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  mkdirSync(join(dir, "content/maps"), { recursive: true });
  const schemas = ["character.schema.json", "map.schema.json"];
  if (zoneSchema) schemas.push("zone-content.schema.json");
  for (const s of schemas)
    cpSync(join(ROOT, "content/schemas", s), join(dir, "content/schemas", s));
  writeFileSync(join(dir, "content/maps/cluster1-geography.json"), JSON.stringify(geography));
  if (zones !== null) {
    mkdirSync(join(dir, "content/zones"), { recursive: true });
    for (const [name, body] of Object.entries(zones))
      writeFileSync(join(dir, "content/zones", name), JSON.stringify(body));
  }
  // Hermeticity: every external artifact the gate reads is a fixture, so these
  // tests can never silently track the live committed files.
  writeFileSync(join(dir, "keys.json"), JSON.stringify({ version: 1, keys: [] }));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
  writeFileSync(join(dir, "mob-types.json"), JSON.stringify({ version: 1, mobTypes: [] }));
  writeFileSync(join(dir, "spawn-areas.json"), JSON.stringify({ version: 1, areas: [] }));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      "--mob-types", join(dir, "mob-types.json"),
      "--spawn-areas", join(dir, "spawn-areas.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

// ---------------------------------------------------------------------------
// Wiring + the soft-skip contract. checkZoneContent MUST skip a content root
// with no zones/ dir: every fixture in check_content.test.mjs and
// bestiary-placement.test.mjs lacks one, and Z2 would otherwise fire ten
// missing-record FAILs into unrelated suites.
// ---------------------------------------------------------------------------

test("no content/zones directory skips silently", () => {
  const r = runGate(fixture({ zones: null, zoneSchema: false }));
  assert.equal(r.code, 0);
  assert.match(r.out, /0 zones/);
});

test("a content/zones directory with no zone-*.json skips silently", () => {
  const r = runGate(fixture({ zones: {}, zoneSchema: false }));
  assert.equal(r.code, 0);
  assert.match(r.out, /0 zones/);
  // The SECOND soft-skip shape (dir present, no records) must also leave the
  // guarded aggregate line off, not just the first (no dir at all).
  assert.doesNotMatch(r.out, /zone-content:/);
});

test("the ten valid records pass, are counted, and raise nothing", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /10 zones/);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.doesNotMatch(r.out, /WARN/);
});

// The two halves of the finish() guard. The `zone-content:` line reports a
// ratio; on a root that ships no zone content there is no ratio, and printing
// `0 of 0` would put a measurement of an unmeasured thing onto every fixture in
// check_content.test.mjs and bestiary-placement.test.mjs. season1.mjs's
// buildRows keeps the same discipline (`actual: null`, never 0, when nothing is
// countable). Three tests pin the guard: PRESENT on the ten-record root, and
// ABSENT on BOTH soft-skip shapes — no zones/ dir (below) and a zones/ dir
// holding no zone-*.json (up in the wiring block). Neither removing the guard
// nor inverting it can pass.
test("the zone-content line is ABSENT on a root with no zone content", () => {
  const r = runGate(fixture({ zones: null, zoneSchema: false }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /zone-content:/);
  assert.match(r.out, /0 zones/);
});

test("the zone-content line is PRESENT once the root has zone records", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /^zone-content: 0 of 20 hazards have no runtime effect$/m);
});

// readJson cannot distinguish "recorded a FAIL" from "parsed to a JSON-falsy
// value" — a file holding a literal `null` parses fine — which is why
// loadGeographyZones tests the failure count rather than the return value. A
// `null` geography must be a shape-invalid FAIL and then a CLEAN BAIL: not a
// silent skip (which would leave Z1 and Z2 unenforced), and not ten Z2
// missing-record FAILs stacked on top of it. The third assertion is what pins
// `if (!zones) return 0;` in patch B — without that guard `zones.has(doc.zone)`
// throws on the first record and the gate dies with a stack trace instead of a
// FAIL line. This test says nothing about how many times the geography is
// parsed; see the Interfaces note on reusing loadGeographyZones unchanged.
test("a geography parsing to null is one shape-invalid FAIL, not a skip", () => {
  const r = runGate(fixture({ zones: allZones(), geography: null }));
  assert.equal(r.code, 1);
  assert.match(r.out, /geography: .* is shape-invalid/);
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
});

test("a schema-invalid record FAILs and its Z-rules are skipped, not crashed on", () => {
  const zones = allZones();
  zones["zone-emberdown.json"].surprise = true;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: schema /);
});

// --------------------------------- Z1 --------------------------------------
// The fixture keeps all ten real records present and adds an ELEVENTH file, so
// Z2's completeness rule is fully satisfied and Z1 is the only rule that can
// reject this root. Delete Z1 from the gate and this root exits 0.
test("Z1: a record naming a zone the geography does not have fails", () => {
  const zones = allZones();
  const orphan = zoneRecord("emberdown");
  orphan.zone = "nowhere";
  orphan.resources = [
    { id: "nowhere-res-a", name: "A", kind: "crop", description: "d" },
    { id: "nowhere-res-b", name: "B", kind: "timber", description: "d" },
  ];
  orphan.landmarks = [
    { id: "nowhere-mark-a", name: "nowhere landmark A", description: "d" },
    { id: "nowhere-mark-b", name: "nowhere landmark B", description: "d" },
  ];
  zones["zone-nowhere.json"] = orphan;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-nowhere\.json: zone "nowhere" not in cluster1-geography\.json#zones/);
  // The orphan must be withheld from the summary count too, not just FAILed:
  // it is not pushed into `records`, so the ten real geography zones — not
  // eleven — are what the gate reports as covered.
  assert.match(r.out, /\b10 zones, \d+ towns, 0 nodes,/);
});

test("Z1: all ten geography zone ids are accepted", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /not in cluster1-geography/);
});

// --------------------------------- Z2 --------------------------------------
// Every surviving record is fully valid, so nothing but Z2 can reject this
// root. Delete Z2 and a nine-tenths-finished cluster passes — the one thing Z2
// exists to make impossible.
test("Z2: a geography zone with no record fails", () => {
  const zones = allZones();
  delete zones["zone-thornveil.json"];
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones: geography zone "thornveil" has no record in content\/zones\//);
  assert.match(r.out, /9 zones/);
  assert.doesNotMatch(r.out, /not in cluster1-geography/);
});

test("Z2: two records claiming the same zone fail", () => {
  const zones = allZones();
  const dup = zoneRecord("emberdown");
  // Non-colliding kind set and landmark names, so Z6 cannot supply the exit-1.
  dup.resources[0].kind = "timber";
  dup.resources[1].kind = "stone";
  dup.landmarks[0].name = "emberdown landmark C";
  dup.landmarks[1].name = "emberdown landmark D";
  zones["zone-emberdown-copy.json"] = dup;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones: zone "emberdown" has 2 records \(zone-emberdown-copy\.json, zone-emberdown\.json\)/);
});

test("Z2: exactly ten records, one per zone, is the passing shape", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /10 zones/);
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
  assert.doesNotMatch(r.out, /has 2 records/);
});

// --------------------------------- Z3 --------------------------------------
// The baseline sits EXACTLY on the floors, so each test removes one element.
test("Z3: fewer than two hazards fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards = [z.hazards[0]]; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has 1 hazards, needs at least 2/);
});

test("Z3: fewer than two resources fails", () => {
  // Dropping res-b leaves emberdown's kind set {fuel} — still distinct from
  // every other zone's, so Z6 cannot be what rejects this root.
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources = [z.resources[0]]; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has 1 resources, needs at least 2/);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

test("Z3: fewer than two landmarks fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.landmarks = [z.landmarks[0]]; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has 1 landmarks, needs at least 2/);
});

test("Z3: an empty reasonToGo fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.reasonToGo = "   "; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has an empty reasonToGo/);
});

test("Z3: exactly two of each, with a reasonToGo, is legal", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /needs at least 2|empty reasonToGo/);
});

// --------------------------------- Z4 --------------------------------------
test("Z4: a non-kebab-case hazard id fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].id = "Seam_Damp"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: hazard id "Seam_Damp" is not kebab-case/);
});

test("Z4: a non-kebab-case resource id fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].id = "Burning Stone"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: resource id "Burning Stone" is not kebab-case/);
});

test("Z4: a non-kebab-case landmark id fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.landmarks[0].id = "TheAdits"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: landmark id "TheAdits" is not kebab-case/);
});

test("Z4: two hazards sharing an id fail", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[1].id = z.hazards[0].id; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: duplicate hazard id "emberdown-hazard-a"/);
});

test("Z4: two resources sharing an id fail", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[1].id = z.resources[0].id; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: duplicate resource id "emberdown-res-a"/);
});

test("Z4: two landmarks sharing an id fail", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.landmarks[1].id = z.landmarks[0].id; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: duplicate landmark id "emberdown-mark-a"/);
});

// The other polarity: "unique within their array" is not "unique within the
// file". A gate that pooled all three arrays would reject this legal record.
test("Z4: one id string reused across two DIFFERENT arrays is legal", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => {
      z.hazards[0].id = "the-adits";
      z.resources[0].id = "the-adits";
      z.landmarks[0].id = "the-adits";
    },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /duplicate .* id/);
});

test("Z4: ids with digits and multiple segments are legal kebab-case", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].id = "seam-damp-2"; },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /is not kebab-case/);
});

// THE DRIFT BINDING for ZONE_ID_RE. The regex is written twice — once in this
// file (Task 1's constant) and once in the gate (Step 4, patch B) — and nothing
// in the language binds them; `check_content.mjs` calls main() and
// process.exit() at module scope, so it cannot be imported and the constant
// cannot be compared directly. This test binds them behaviourally instead, the
// same way the two `(valid: …)` tests bind the effect and kind enums: it drives
// the three boundary shapes that separate `/^[a-z0-9]+(-[a-z0-9]+)*$/` from a
// loosened `/^[a-z0-9-]+$/` through the REAL gate binary. Loosen the gate's
// copy and this goes red even though this file's copy is untouched. The three
// legal-shape tests above cannot catch that drift — every one of them passes
// under the loose regex too.
test("Z4: the gate's kebab rule rejects leading, trailing and doubled hyphens", () => {
  for (const bad of ["-seam-damp", "seam-damp-", "seam--damp"]) {
    const r = runGate(fixture({ zones: allZones({
      emberdown: (z) => { z.hazards[0].id = bad; },
    }) }));
    assert.equal(r.code, 1, `the gate must reject the id "${bad}":\n${r.out}`);
    assert.match(
      r.out,
      new RegExp(`zones/zone-emberdown\\.json: hazard id "${bad}" is not kebab-case`),
      `wrong or missing message for "${bad}":\n${r.out}`);
  }
});

// --------------------------------- Z5 --------------------------------------
// THE SUBTLE ONE. An exit-code-only test cannot tell a correct WARN from a
// wrongly-escalated FAIL, so this asserts all three of: exit 0, the WARN text,
// and the total absence of FAIL.
test("Z5: a hazard with no effect is a WARN, not a FAIL", () => {
  const r = runGate(fixture({ zones: allZones({
    "ashvale-front": (z) => { delete z.hazards[0].effect; },
  }) }));
  assert.equal(r.code, 0, `a missing effect must not fail the gate:\n${r.out}`);
  assert.match(
    r.out,
    /WARN\s+zones\/zone-ashvale-front\.json: hazard "ashvale-front-hazard-a" has no effect/);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.match(r.out, /10 zones/);
});

// Spec §7: "the implementation must print that count, not swallow it." The
// per-hazard WARN alone does not satisfy that, and the generic `N warnings`
// conflates zone hazards with character-coverage warns.
test("Z5: the unmapped-hazard count is printed as an aggregate", () => {
  const r = runGate(fixture({ zones: allZones({
    "ashvale-front": (z) => { delete z.hazards[0].effect; delete z.hazards[1].effect; },
    cindervast: (z) => { delete z.hazards[0].effect; },
  }) }));
  assert.equal(r.code, 0);
  assert.match(r.out, /zone-content: 3 of 20 hazards have no runtime effect/);
});

test("Z5: an effect outside the seven runtime types fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].effect = "melt"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones\/zone-emberdown\.json: hazard "emberdown-hazard-a" effect "melt" is not a runtime zoneHazards type \(valid: freeze, stun, burn, poison, regen, heal, damage\)/);
});

test("Z5: every one of the seven runtime types is accepted with no WARN", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => {
      z.hazards = EFFECTS.map((e, i) => ({
        id: `emberdown-hazard-${i}`, name: `H${i}`, description: "d", effect: e,
      }));
    },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /WARN/);
  assert.doesNotMatch(r.out, /is not a runtime zoneHazards type/);
  assert.match(r.out, /zone-content: 0 of 25 hazards have no runtime effect/);
});

// The gate's ZONE_HAZARD_EFFECTS is a hand-copy of the runtime enum. If the two
// ever drift, `effect` becomes a fiction field pretending to be a binding.
//
// This must assert against the GATE's list, not against this file's `EFFECTS`
// constant. `check_content.mjs` cannot be imported — it calls `main()` and
// `process.exit()` at module scope — so the gate's list is reachable only
// through its observable surface: the `(valid: …)` tail of the Z5 FAIL message,
// which the implementation builds with `ZONE_HAZARD_EFFECTS.join(", ")`. Parsing
// that tail and deep-equalling it against BOTH map.schema.json's enum AND
// `EFFECTS` binds all three lists in one assertion, so deleting a value from
// ZONE_HAZARD_EFFECTS goes red. (An earlier draft of this test compared the
// schema to `EFFECTS` only — the gate could have dropped a value and stayed
// green.)
function validListFrom(out, re) {
  const m = out.match(re);
  assert.ok(m, `no "(valid: …)" list in gate output:\n${out}`);
  return m[1].split(", ");
}

test("Z5: the GATE's effect list equals map.schema.json's zoneHazards enum", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].effect = "melt"; },
  }) }));
  assert.equal(r.code, 1);
  const gateList = validListFrom(
    r.out, /is not a runtime zoneHazards type \(valid: ([^)]+)\)/);
  const map = JSON.parse(readFileSync(join(ROOT, "content/schemas/map.schema.json"), "utf8"));
  const runtime = map.properties.zoneHazards.items.properties.type.enum;
  assert.deepEqual(gateList, runtime, "gate's ZONE_HAZARD_EFFECTS drifted from map.schema.json");
  assert.deepEqual(gateList, EFFECTS, "gate's ZONE_HAZARD_EFFECTS drifted from this file's EFFECTS");
});

// The Z7 mirror. There is no schema to compare against — the eight kinds are
// design §6's own vocabulary and this file's RESOURCE_KINDS is their only other
// written copy — so this pins the gate's ZONE_RESOURCE_KINDS to it. Without
// this test, ZONE_RESOURCE_KINDS is asserted nowhere except inside the one
// message regex that would be edited in lockstep with it.
test("Z7: the GATE's kind list equals the eight-value resource-kind enum", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].kind = "gemstone"; },
  }) }));
  assert.equal(r.code, 1);
  const gateList = validListFrom(
    r.out, /is not a resource kind \(valid: ([^)]+)\)/);
  assert.deepEqual(gateList, RESOURCE_KINDS, "gate's ZONE_RESOURCE_KINDS drifted from spec §6");
  assert.equal(gateList.length, 8);
});

// --------------------------------- Z6 --------------------------------------
// DECIDED, and the two places are deliberately NOT symmetric: the GATE fires
// only on a landmark name shared ACROSS zones (`if (shared.length > 1)`), so a
// zone repeating a name inside its own list passes Z6; Task 3b's
// committed-content test uses one FLAT name Map across all ten records and
// rejects that too. The stricter of the two was chosen for the committed
// content — twenty landmarks, twenty names, no exceptions — and the looser one
// for the gate, because "this zone lists the same rock twice" is an authoring
// slip in one file, not a cross-zone identity failure worth failing every
// consumer's content root over. If Task 3b's test ever fires on an intra-zone
// repeat, fix the record; do not relax it to match the gate, and do not tighten
// the gate to match it.
//
// Only the landmark name collides — kind sets stay {fuel,crop} vs {ore,fuel}.
test("Z6: a landmark name appearing in two zones fails", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.landmarks[0].name = "emberdown landmark A"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones: landmark name "emberdown landmark A" appears in zones "emberdown", "hollowmarch"/);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

// Only the kind set collides — every landmark name stays zone-prefixed.
test("Z6: two zones with an identical resource-kind set fail", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.resources[0].kind = "ore"; z.resources[1].kind = "stone"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones: resource-kind set \(ore, stone\) is shared by zones "gildmark-head", "hollowmarch"/);
  assert.doesNotMatch(r.out, /landmark name/);
});

test("Z6: an identical kind set in a different order still fails", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.resources[0].kind = "stone"; z.resources[1].kind = "ore"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones: resource-kind set \(ore, stone\) is shared by zones "gildmark-head", "hollowmarch"/);
});

test("Z6: kind sets that overlap without being identical are legal", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.resources[0].kind = "ore"; z.resources[1].kind = "timber"; },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

// NOTE ON WHAT THIS TEST DOES AND DOES NOT PIN. It proves a zone may legally
// carry two resources of one kind (exit 0). It does NOT pin the `new Set(...)`
// dedupe, despite its name: emberdown's multiset key "fuel, fuel" happens to be
// unique among the other nine zones' two-kind keys, so this passes with the
// dedupe REMOVED. The test below is the one that actually pins it — keep them
// together and do not merge them.
test("Z6: repeating one kind inside a single zone is legal and dedupes to a set", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].kind = "fuel"; z.resources[1].kind = "fuel"; },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

// THE DEDUPE BINDING for Z6's kind-set key. Two zones whose resources are all
// one and the same kind, differing ONLY in array length: as SETS both are
// {fuel} and must collide; as MULTISETS their keys are "fuel, fuel" and
// "fuel, fuel, fuel" and Z6 silently stops firing. Drop `new Set(...)` from the
// gate's kindSets key (keeping `.sort()`) and this is the only test that goes
// red — the legality test above passes either way. Without this, "compared as a
// SET" is a claim the comment makes and nothing enforces.
test("Z6: two single-kind zones of different lengths are the same SET and collide", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => {
      z.resources = ["a", "b"].map((s) => ({
        id: `emberdown-res-${s}`, name: `R${s}`, kind: "fuel", description: "d",
      }));
    },
    hollowmarch: (z) => {
      z.resources = ["a", "b", "c"].map((s) => ({
        id: `hollowmarch-res-${s}`, name: `R${s}`, kind: "fuel", description: "d",
      }));
    },
  }) }));
  assert.equal(r.code, 1, `{fuel} and {fuel} are the same set and must collide:\n${r.out}`);
  assert.match(
    r.out,
    /zones: resource-kind set \(fuel\) is shared by zones "emberdown", "hollowmarch"/);
});

// THE EXEMPTION BINDING for Z6's landmark rule. The `if (shared.length > 1)`
// guard is a DECIDED asymmetry (see the block comment above): the gate fires
// only on a name spanning two DIFFERENT zones, while Task 3b's committed-content
// test additionally rejects an intra-zone repeat. Nothing in the language pins
// that decision, so without this test the gate can silently drift STRICTER than
// what was decided — swap the guard to `group.length > 1` and the suite stays
// green. This is the polarity partner of "a landmark name appearing in two
// zones fails": that one proves the rule fires across zones, this one proves it
// does not fire within one.
test("Z6: one zone repeating a landmark name inside its own list is legal", () => {
  const r = runGate(fixture({ zones: allZones({
    // Ids stay distinct, so Z4's duplicate rule cannot supply the exit code.
    emberdown: (z) => { z.landmarks[1].name = z.landmarks[0].name; },
  }) }));
  assert.equal(r.code, 0, `an intra-zone landmark repeat is deliberately legal:\n${r.out}`);
  assert.doesNotMatch(r.out, /landmark name/);
  assert.match(r.out, /10 zones/);
});

test("Z6: ten distinct landmark-name sets and ten distinct kind sets pass", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /landmark name .* appears in zones|resource-kind set/);
});

// --------------------------------- Z7 --------------------------------------
test("Z7: a resource kind outside the enum fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].kind = "gemstone"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones\/zone-emberdown\.json: resource "emberdown-res-a" kind "gemstone" is not a resource kind \(valid: crop, timber, ore, fuel, stone, water, forage, salvage\)/);
});

test("Z7: all eight enum kinds are accepted", () => {
  const r = runGate(fixture({ zones: allZones({
    // The full eight-kind set is distinct from every zone's pair, so Z6 stays
    // quiet and Z7 is the only rule under test.
    cindervast: (z) => {
      z.resources = RESOURCE_KINDS.map((k, i) => ({
        id: `cindervast-res-${i}`, name: `R${i}`, kind: k, description: "d",
      }));
    },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /is not a resource kind/);
  assert.match(r.out, /10 zones/);
});
