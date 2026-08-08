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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SCHEMA_PATH = join(ROOT, "content/schemas/zone-content.schema.json");
const GEOGRAPHY_PATH = join(ROOT, "content/maps/cluster1-geography.json");

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

test("the committed records cover exactly the geography's zones", () => {
  const geo = JSON.parse(readFileSync(GEOGRAPHY_PATH, "utf8"));
  assert.deepEqual([...geo.zones.map((z) => z.id)].sort(), [...ZONE_IDS].sort());
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
