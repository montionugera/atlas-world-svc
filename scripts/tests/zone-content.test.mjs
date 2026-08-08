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
