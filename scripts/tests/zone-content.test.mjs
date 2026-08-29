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
// The SAME derivation zone-allocation.test.mjs uses to tell a derived record
// from a legacy one (CODE REVIEW, MAJOR 1). The citation rule below reads this,
// not a hand-list, so a record cannot be exempted from it by editing a constant.
import { committedRecords, legacyPlaceholderRecords } from "../lib/zone-allocation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SCHEMA_PATH = join(ROOT, "content/schemas/zone-content.schema.json");

// I-060 spec §6 / §7. The ten cluster-1 zones, in geography order.
const ZONE_IDS = [
  "meltwash-terrace", "millcross-ford", "rooktide-reach", "thornveil", "emberdown",
  "gildmark-head", "hollowmarch", "ashvale-front", "northern-icefield", "cindervast",
];

// PLAN E TASK 11. Coldreach's six, written from A4's derived rows. They are NOT
// added to ZONE_IDS: that list is the cluster-1 ten and doubles as the basis of
// every hermetic fixture below, which is deliberately a fixed ten-zone world.
// The real-content tests read COMMITTED_ZONE_IDS instead, so a new record has to
// be declared here — growing the corpus stays a deliberate edit, exactly as the
// count assertions do.
const COLDREACH_ZONE_IDS = [
  "fastholt-ford", "snowfast-race", "galeness-reach",
  "driftway-confluence", "snowness-ford", "lodereach-race",
];

// PLAN E TASK 12. Stonemoor's seven, on the same terms as Coldreach's six.
const STONEMOOR_ZONE_IDS = [
  "grikepot-head", "shalegill-fenster", "tarnmoor-stair", "grykefell-stack",
  "limepot-sink", "clintlack-fenster", "flaggrike-geo",
];

// PLAN E TASK 13. Thirstwold's seven, on the same terms again.
const THIRSTWOLD_ZONE_IDS = [
  "thirstreach-pan", "charwaste-race", "siroccvent-reach", "yardburn-confluence",
  "thirstvent-pan", "regflat-waste", "barchanburn-reach",
];

/**
 * Every record written for a DERIVED A4 row — everything after the redraw.
 * This is the CORPUS RATCHET and nothing else: it feeds COMMITTED_ZONE_IDS,
 * whose name-level deepEqual against the directory listing is what makes
 * growing content/zones/ a deliberate edit. Tasks 13-14 extend it.
 *
 * It is deliberately NOT what the citation rule iterates — see
 * `postRedrawRecords()`. A hand-list that both defines the corpus AND scopes a
 * rule lets one edit do two jobs: narrowing it silently exempts records from
 * the rule while the corpus stays whole. Measured by the code review — seven
 * records dropped out of the citation rule at 77 pass / 0 fail.
 */
// PLAN E TASK 14. The five minor landmasses and chains, on the same terms
// again — Reedstrand 3, Driftholt 3, Wracklow 2, Brightfall 1, Ashen Spar 1.
// These close Z2 in both directions: with them the fabric's 40 surveyed
// regions and content/zones/ are a bijection, and the count assertion below is
// what proves it rather than the absence of a FAIL line.
const MINOR_CONTINENT_ZONE_IDS = [
  "siltrun-head", "sedgebar-roads", "wrackeyot-geo",
  "osierspit-head", "quillstrand-roads", "brightreef-geo",
  "lagoonlobe-head", "withybar-roads",
  "alderlow-head", "emberburn-cone",
];

const POST_REDRAW_ZONE_IDS = [
  ...COLDREACH_ZONE_IDS, ...STONEMOOR_ZONE_IDS, ...THIRSTWOLD_ZONE_IDS,
  ...MINOR_CONTINENT_ZONE_IDS,
];

/**
 * The post-redraw records DERIVED from the data: every committed record whose
 * slug is not a reserved canon name. Identical to POST_REDRAW_ZONE_IDS today
 * (asserted below), and the two are cross-checked so neither can drift alone.
 */
const postRedrawRecords = () => {
  const legacy = new Set(legacyPlaceholderRecords({ root: ROOT }).map((c) => c.zone));
  return committedRecords({ root: ROOT }).map((c) => c.zone).filter((z) => !legacy.has(z)).sort();
};

/** Every record content/zones/ is supposed to hold today. Task 14 raises it. */
const COMMITTED_ZONE_IDS = [...ZONE_IDS, ...POST_REDRAW_ZONE_IDS];

// CODE REVIEW (Task 13, MINOR 2): three unrelated `40`s came to sit within one
// screen of each other — the fabric's surveyed regions, the post-redraw records'
// landmarks, and A4's row count in zone-allocation.test.mjs. Same value, three
// different meanings, and a future ratchet move can be applied to the wrong one.
// They are named here so the assertion says which `40` it is asserting.
// Deliberately LITERALS and not derivations: each is the deliberate edit that
// lets the corpus grow, exactly as COMMITTED_ZONE_IDS is.
/** Surveyed regions the fabric declares, across all 13 continents. */
const SURVEYED_REGIONS = 40;
/** Landmarks carried by the records written for derived A4 rows, 2 apiece. */
const POST_REDRAW_LANDMARKS = 60;

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

// PLAN E TASK 9. A record joins the world by `region` (a fabric region id), not
// by its slug — after the redraw no drawn zone id is a slug at all. These are
// hermetic fixture regions, ten of them so the fixture is a clean bijection;
// they are NOT the committed records' regions and must not be "reconciled"
// with them, for the same reason FIXTURE_KINDS_BY_ZONE is not.
const FIXTURE_REGION_BY_ZONE = Object.fromEntries(
  ZONE_IDS.map((id, i) => [id, `c02/r${String(i + 1).padStart(2, "0")}`]));

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
    region: FIXTURE_REGION_BY_ZONE[id],
    survey: "surveyed",
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
  for (const id of COMMITTED_ZONE_IDS) {
    const path = join(ROOT, `content/zones/zone-${id}.json`);
    assert.ok(existsSync(path), `missing ${path}`);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    assert.ok(validate(doc), `${id}: ${JSON.stringify(validate.errors, null, 2)}`);
    assert.equal(doc.zone, id);
  }
});

// PLAN E RULING 8 (Task 6). This test asserted EXACT COVER: the ten committed
// records' zone ids equalled the world's zone ids, set for set. Both halves of
// that equality have moved and only one of them has landed.
//
//   - The world half moved in Plan D Task 11 and again in the redraw: the
//     resolved world declares 160 region zones keyed `cNN/rNN`.
//   - The record half has NOT moved yet. Re-homing the ten records onto the new
//     region ids is Plan E Task 11's step ("Modify: content/zones/
//     zone-meltwash-terrace.json, …"), where each gains `region` + `survey`
//     from Task 10's allocation table; Task 9 then closes Z2 in both directions.
//
// Until Task 11 there is no true exact-cover claim to make, and the honest
// alternative is not to widen this into something that passes. So it asserts
// the INTERIM STATE precisely: every one of the ten is an orphan of the
// resolved world, and none of the ten slugs has quietly reappeared as a zone
// id. That is the same pattern places.test.mjs's ruling-8 pin uses, and it has
// the same property — it goes RED the day Task 11 re-homes even one record, so
// exact cover cannot be restored without coming back through here.
//
// It is armed on the world side too: had the redraw left any legacy slug in the
// resolved world, the first assertion below would name it.
// PLAN E TASK 11. The interim state above has ended: records now exist for
// derived rows, so "the committed records are still sworn to exactly the ten
// legacy slugs" is no longer true and is not something to widen into passing.
// What replaces it is the half of exact cover that HAS landed, stated on the key
// the join actually uses. The slug and the region id stay separate namespaces —
// a record's `zone` is a name, its `region` is the join — and every record's
// region is a zone the drawn world declares. Cover is still partial (23 of 40)
// and the count is pinned, so Tasks 13-14 come back through here.
test("every record joins the resolved world by REGION, and no slug has crept into the zone-id namespace", () => {
  const { doc, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, []);
  const worldZones = new Set(doc.zones.map((z) => z.id));
  const stillDeclared = ZONE_IDS.filter((id) => worldZones.has(id));
  assert.deepEqual(stillDeclared, [],
    "a legacy basin slug is a zone id in the resolved world — the redraw was supposed to retire it");

  const records = readdirSync(join(ROOT, "content/zones"))
    .filter((f) => /^zone-.+\.json$/.test(f)).sort()
    .map((f) => JSON.parse(readFileSync(join(ROOT, "content/zones", f), "utf8")));
  assert.deepEqual(records.map((r) => r.zone).sort(), [...COMMITTED_ZONE_IDS].sort(),
    "the committed records are no longer exactly the set this file declares");

  const asZoneId = records.map((r) => r.zone).filter((z) => worldZones.has(z));
  assert.deepEqual(asZoneId, [],
    "a record's SLUG is also a resolved zone id — the name and the join key have collided");

  // The exact-cover half that has landed: every record's region is real ground.
  const covered = new Set();
  for (const r of records) {
    assert.ok(worldZones.has(r.region),
      `zone "${r.zone}" joins region ${r.region}, which the resolved world does not declare`);
    assert.equal(covered.has(r.region), false, `region ${r.region} is claimed twice`);
    covered.add(r.region);
  }
  const surveyedWorld = doc.zones.filter((z) => z.survey === "surveyed").map((z) => z.id);
  assert.equal(surveyedWorld.length, 40, "the resolved world no longer declares 40 surveyed zones");
  // NO `covered.size` PIN HERE. It used to read `assert.equal(covered.size, 23)`
  // and it could not fail: `records` is pinned name-for-name against
  // COMMITTED_ZONE_IDS 15 lines above, and the loop rejects a repeated region
  // inline, so covered.size === records.length by construction. Proven by the
  // code review — stubbing it and pointing two records at one region still
  // redded 2 tests, and stubbing it and deleting a record still redded 7. A
  // rule that cannot fail is a defect, so it is gone rather than left reading
  // as cover. The ratchet it appeared to be is the deepEqual above.
  for (const id of covered)
    assert.ok(surveyedWorld.includes(id), `${id} is covered by a record but is not surveyed`);
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
  assert.deepEqual(files, COMMITTED_ZONE_IDS.map((id) => `zone-${id}.json`).sort(),
    "an extra or misnamed zone-*.json is invisible to the by-name tests but fatal to Z1/Z2");
  // The other half of the same defence: a file whose name and `zone` field
  // disagree passes the enumeration above AND every by-name loop, because both
  // address it by the name it is not sworn to.
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/zones", f), "utf8"));
    assert.equal(`zone-${doc.zone}.json`, f, `${f} is sworn to zone "${doc.zone}"`);
  }
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
  for (const id of COMMITTED_ZONE_IDS) {
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

test("the committed records have one distinct resource-kind set each and no shared landmark name", () => {
  const kindSets = new Map();
  // DELIBERATELY STRICTER THAN Z6. The gate's Z6 landmark rule fires only when a
  // name is shared ACROSS zones (`if (shared.length > 1)`), so one zone repeating
  // a name inside its own list passes the gate. This flat Map rejects that too.
  // Keeping it stricter is the choice: twenty landmarks, twenty names, no
  // exceptions. If this ever fails on an intra-zone repeat, fix the record — do
  // not relax the test to match the gate.
  const names = new Map();
  for (const id of COMMITTED_ZONE_IDS) {
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
  assert.equal(kindSets.size, COMMITTED_ZONE_IDS.length,
    "two committed records now share a resource-kind set — Z6's set-packing has been broken");
});

// Plan E Task 9: Z1's subject moved from `doc.zone` to `doc.region`, so the
// drawn world this fixture stands for is keyed by REGION id. `name` keeps the
// slug so a failure message still reads legibly.
const GEOGRAPHY = {
  zones: ZONE_IDS.map((id) => ({
    id: FIXTURE_REGION_BY_ZONE[id], name: id, levelBand: ZONE_BANDS[id],
  })),
};

// The fabric half of the same fixture: the authority on which ground exists and
// whether anyone walked it. Default = the same ten regions, all surveyed, so
// the baseline root is a clean bijection and every Z2 test has to manufacture
// the disagreement it asserts.
const FABRIC = ZONE_IDS.map((id) => ({ id: FIXTURE_REGION_BY_ZONE[id], survey: "surveyed" }));

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
//
// Plan D Task 11: loadPlaces() lost its legacy-mirror fallback, so this
// fixture root carries its geography in the RESOLVED shape — one
// content/world/resolved/continent-02.json wrapping the same zones array.
// Only the FILE and the wrapper keys changed; every downstream assertion is
// untouched.
function writeResolvedFixture(dir, { zones = [], towns = [], body = null } = {}) {
  mkdirSync(join(dir, "content/world/resolved"), { recursive: true });
  // The fixture root now HAS a content/world/, so G-WORLD-BUDGET arms; give it
  // the committed budget table and manifest so it stays green here.
  cpSync(join(ROOT, "content/world/budgets.json"), join(dir, "content/world/budgets.json"));
  cpSync(join(ROOT, "content/world/manifest.json"), join(dir, "content/world/manifest.json"));
  const bytes = body !== null
    ? body
    : JSON.stringify({
        continent: "c02",
        coastline: { id: "f-coast-c02", points: [[0, 0], [10, 0], [10, 10]] },
        river: null, saltmire: null, iceEdge: null, terrainPatches: [],
        zones, towns, camps: [], roads: [], landmarks: [], dungeons: [],
        instances: [], relay: null, distances: null, seaLane: null, sheet: null,
      });
  writeFileSync(join(dir, "content/world/resolved/continent-02.json"), bytes);
}

function fixture({ zones = {}, geography = GEOGRAPHY, zoneSchema = true, fabric = FABRIC } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "zone-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  writeResolvedFixture(dir, {
    zones: geography === null ? [] : geography.zones ?? [],
    towns: geography === null ? [] : geography.towns ?? [],
    body: geography === null ? "null" : null,
  });
  // `fabric: null` = no content/world/fabric at all (the half-soft-skip path).
  //
  // The twelve instances per SURVEYED region are not decoration: writing any
  // fabric file at all arms G-POI (scripts/lib/world.mjs:626), whose floor is
  // 12 points of interest on surveyed ground. Without them every fixture root
  // here would exit 1 on a rule that has nothing to do with the Z-rules. A
  // reported region gets none, which is the same gate's other half.
  if (fabric !== null) {
    mkdirSync(join(dir, "content/world/fabric"), { recursive: true });
    const instances = [];
    for (const r of fabric)
      if (r.survey === "surveyed")
        for (let i = 0; i < 12; i++)
          instances.push({ id: `${r.id}/i${i}`, region: r.id });
    writeFileSync(join(dir, "content/world/fabric/continent-02.json"),
      JSON.stringify({ continent: "c02", regions: fabric, instances }));
  }
  const schemas = ["character.schema.json", "map.schema.json"];
  if (zoneSchema) schemas.push("zone-content.schema.json");
  for (const s of schemas)
    cpSync(join(ROOT, "content/schemas", s), join(dir, "content/schemas", s));
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
// PLAN E TASK 9 SPLIT THIS IN TWO, because Z2's authority is no longer the same
// document as Z1's. With BOTH layers unusable the contract is unchanged: one
// shape-invalid FAIL and a clean bail. With only the DRAWN world broken the
// fabric is still an authority, and the gate must say so rather than fall
// silent — that is the second test, and it is new coverage, not a relaxation.
test("a geography parsing to null is one shape-invalid FAIL, not a skip", () => {
  const r = runGate(fixture({ zones: allZones(), geography: null, fabric: null }));
  assert.equal(r.code, 1);
  assert.match(r.out, /geography: .* is shape-invalid/);
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
  // The bail is CLEAN, not silent: the shape failure is the only zone-side line.
  assert.doesNotMatch(r.out, /not in content\/world\/resolved#zones/);
  // REVIEW FINDING (MAJOR 1): this used to read `/0 zones/`, because the gate
  // returned from the WHOLE function. It counts the ten records now — the two
  // JOIN rules are what have no authority here, not the four intra-record ones,
  // which still ran. Proven by the test below, which puts real defects on this
  // exact root.
  assert.match(r.out, /10 zones/);
});

test("a drawn world that has fallen behind the fabric names BOTH disagreements", () => {
  // A drawn world that is EMPTY cannot answer and must stay silent (the test
  // above). A drawn world that answers and answers DIFFERENTLY is the real
  // two-authority disagreement: here it has resolved nine of the ten regions
  // the fabric declares surveyed, which is what a resolved join that has not
  // been re-run after a fabric edit looks like.
  const geography = { zones: GEOGRAPHY.zones.filter((z) => z.id !== "c02/r04") };
  const r = runGate(fixture({ zones: allZones(), geography }));
  assert.equal(r.code, 1);
  // Z1 against the drawn world…
  assert.match(r.out, /zones\/zone-thornveil\.json: region "c02\/r04" not in content\/world\/resolved#zones/);
  // …and Z2 direction 1 against the fabric, which still declares c02/r04
  // surveyed and owed prose. The record is withheld from `records` by Z1, so
  // its region reads as uncovered. A gate that printed only one of these would
  // be publishing one authority's silence as the other's verdict.
  assert.match(r.out, /zones: surveyed region "c02\/r04" has no record in content\/zones\//);
  assert.equal((r.out.match(/not in content\/world\/resolved#zones/g) ?? []).length, 1);
  assert.equal((r.out.match(/has no record in content\/zones\//g) ?? []).length, 1);
});

test("an EMPTY drawn world reports no orphans — absence of data is not a verdict", () => {
  // The mirror image of the test above, and the reason Z1 is gated on
  // `drawnKnown`: ten records against a resolved world that declares nothing
  // used to print ten "not in content/world/resolved#zones" FAILs, each of
  // which said the drawn world had LOOKED and not found the region. It had not
  // looked; it had nothing to look in.
  const r = runGate(fixture({ zones: allZones(), geography: { zones: [] } }));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /not in content\/world\/resolved#zones/);
  assert.match(r.out, /10 zones/);
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
test("Z1: a record whose region the drawn world does not have fails", () => {
  const zones = allZones();
  const orphan = zoneRecord("emberdown");
  orphan.zone = "nowhere";
  // c02/r11 is in the FABRIC (so Z2 knows the ground and the record covers it)
  // but NOT in GEOGRAPHY (the drawn world). That isolates Z1 as the only rule
  // that can reject this root: delete Z1 from the gate and it exits 0.
  orphan.region = "c02/r11";
  orphan.resources = [
    { id: "nowhere-res-a", name: "A", kind: "crop", description: "d" },
    { id: "nowhere-res-b", name: "B", kind: "timber", description: "d" },
  ];
  orphan.landmarks = [
    { id: "nowhere-mark-a", name: "nowhere landmark A", description: "d" },
    { id: "nowhere-mark-b", name: "nowhere landmark B", description: "d" },
  ];
  zones["zone-nowhere.json"] = orphan;
  const r = runGate(fixture({ zones, fabric: [...FABRIC, { id: "c02/r11", survey: "surveyed" }] }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-nowhere\.json: region "c02\/r11" not in content\/world\/resolved#zones/);
  // The orphan must be withheld from the summary count too, not just FAILed:
  // it is not pushed into `records`, so the ten real geography zones — not
  // eleven — are what the gate reports as covered.
  assert.match(r.out, /\b10 zones, \d+ towns, 0 nodes,/);
});

test("Z1: all ten drawn region ids are accepted", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /not in content\/world\/resolved/);
});

// --------------------------------- Z2 --------------------------------------
// Every surviving record is fully valid, so nothing but Z2 can reject this
// root. Delete Z2 and a nine-tenths-finished cluster passes — the one thing Z2
// exists to make impossible.
test("Z2: a surveyed region with no record fails", () => {
  const zones = allZones();
  delete zones["zone-thornveil.json"];
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones: surveyed region "c02\/r04" has no record in content\/zones\//);
  assert.match(r.out, /9 zones/);
  assert.doesNotMatch(r.out, /not in content\/world\/resolved/);
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

test("Z2: exactly ten records, one per surveyed region, is the passing shape", () => {
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

// ─── Plan E Task 9: Z2 in both directions, against the fabric ───────────────
//
// The FABRIC (content/world/fabric/continent-NN.json) is the authority on which
// ground exists and whether anyone walked it. A record's own `survey` is a
// DECLARATION checked against the fabric — a drift check, never a second source
// of truth. Direction 2 (a record on reported ground is a FAILURE) is the half
// that makes "40 written, 120 hatched" a policy instead of a hope: without it
// the frontier erodes into 160 thin stubs.
//
// Every test below manufactures exactly one disagreement against the baseline
// fixture, which is a clean ten-region bijection by construction.

test("Z2 reverse: a record on a REPORTED region FAILs, and says why", () => {
  // c02/r10 is cindervast's region in FIXTURE_REGION_BY_ZONE.
  const fabric = FABRIC.map((r) => r.id === "c02/r10" ? { ...r, survey: "reported" } : r);
  const r = runGate(fixture({
    fabric,
    zones: allZones({ cindervast: (z) => { z.survey = "reported"; } }),
  }));
  assert.equal(r.code, 1);
  assert.match(r.out,
    /zones: zone record "cindervast" is on a reported region — writing prose for unwalked ground is exactly the dishonesty the hatching prevents/);
  // The declaration AGREES with the fabric here, so this must be the reported
  // rule speaking and not the drift rule wearing its coat.
  assert.doesNotMatch(r.out, /declares survey/);
  // …and the nine surveyed regions are all still covered.
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
});

test("Z2 drift: a declared survey that disagrees with the fabric FAILs — in BOTH directions", () => {
  // (a) record says surveyed, fabric says reported. Both the drift rule and the
  //     reported rule fire, because both are true of this record.
  const reportedFabric = FABRIC.map((r) => r.id === "c02/r10" ? { ...r, survey: "reported" } : r);
  const a = runGate(fixture({ fabric: reportedFabric, zones: allZones() }));
  assert.equal(a.code, 1);
  assert.match(a.out,
    /zones: zone record "cindervast" declares survey "surveyed" but fabric region "c02\/r10" is "reported"/);
  assert.match(a.out, /is on a reported region/);

  // (b) the mirror image, which isolates the drift rule on its own: the fabric
  //     says surveyed, so the reported rule cannot fire and only drift can.
  const b = runGate(fixture({
    zones: allZones({ cindervast: (z) => { z.survey = "reported"; } }),
  }));
  assert.equal(b.code, 1);
  assert.match(b.out,
    /zones: zone record "cindervast" declares survey "reported" but fabric region "c02\/r10" is "surveyed"/);
  assert.doesNotMatch(b.out, /is on a reported region/);
});

test("Z2: a record naming a region no fabric declares FAILs", () => {
  const zones = allZones();
  const ghost = zoneRecord("emberdown");
  ghost.zone = "ghost";
  ghost.region = "c02/r99";
  ghost.resources = [
    { id: "ghost-res-a", name: "A", kind: "crop", description: "d" },
    { id: "ghost-res-b", name: "B", kind: "timber", description: "d" },
  ];
  ghost.landmarks = [
    { id: "ghost-mark-a", name: "ghost landmark A", description: "d" },
    { id: "ghost-mark-b", name: "ghost landmark B", description: "d" },
  ];
  // The drawn world knows c02/r99 (so Z1 is silent) and the fabric does not —
  // which is precisely the two-authority disagreement Z2 exists to surface.
  const geography = {
    zones: [...GEOGRAPHY.zones, { id: "c02/r99", name: "ghost", levelBand: [1, 10] }],
  };
  zones["zone-ghost.json"] = ghost;
  const r = runGate(fixture({ zones, geography }));
  assert.equal(r.code, 1);
  assert.match(r.out,
    /zones: zone record "ghost" names region "c02\/r99", which no fabric file declares/);
  assert.doesNotMatch(r.out, /not in content\/world\/resolved#zones/);
});

test("Z2: a REPORTED region needs no record — hatched ground is not a hole", () => {
  const r = runGate(fixture({
    fabric: [...FABRIC, { id: "c02/r20", survey: "reported" }],
    zones: allZones(),
  }));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /c02\/r20/);
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
});

test("Z2: two records on the SAME region fail, and the message names both files", () => {
  const zones = allZones();
  const twin = zoneRecord("emberdown");
  twin.zone = "emberdown-twin";
  twin.region = FIXTURE_REGION_BY_ZONE["emberdown"];
  // Non-colliding kind set and landmark names, so neither Z6 rule nor the
  // duplicate-ZONE rule can supply the exit-1 — only the duplicate-REGION rule.
  twin.resources = [
    { id: "twin-res-a", name: "A", kind: "timber", description: "d" },
    { id: "twin-res-b", name: "B", kind: "water", description: "d" },
  ];
  twin.landmarks = [
    { id: "twin-mark-a", name: "twin landmark A", description: "d" },
    { id: "twin-mark-b", name: "twin landmark B", description: "d" },
  ];
  zones["zone-emberdown-twin.json"] = twin;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out,
    /zones: region "c02\/r05" has 2 records \(zone-emberdown-twin\.json, zone-emberdown\.json\)/);
  assert.doesNotMatch(r.out, /has 2 records \(zone-emberdown-copy/);
  // The overwrite this rule exists to stop: without it the twin silently
  // "covers" emberdown's region and no line is printed at all.
  assert.doesNotMatch(r.out, /resource-kind set/);
});

test("Z2: a complete surveyed set with no reported records passes, and prints nothing", () => {
  const r = runGate(fixture({
    fabric: [...FABRIC, { id: "c02/r20", survey: "reported" }, { id: "c02/r21", survey: "reported" }],
    zones: allZones(),
  }));
  assert.equal(r.code, 0, r.out);
  // NOT `/^zones: /m`: every gate line is printed as `FAIL  zones: …`, so a
  // line-anchored form matches nothing and the assertion can never fail. Each
  // of the five Z2 message families is named instead.
  for (const re of [
    /has no record in content\/zones\//,
    /is on a reported region/,
    /declares survey/,
    /which no fabric file declares/,
    /has \d+ records/,
  ]) assert.doesNotMatch(r.out, re);
});

// ─── the schema half of the join ───────────────────────────────────────────

test("the schema requires both join keys", () => {
  const validate = compile();
  const doc = zoneRecord("thornveil");
  delete doc.region;
  assert.equal(validate(doc), false, "a record with no region must not validate");
  const noSurvey = zoneRecord("thornveil");
  delete noSurvey.survey;
  assert.equal(validate(noSurvey), false, "a record with no survey must not validate");
  assert.ok(validate({ ...zoneRecord("thornveil"), region: "c02/r01", survey: "surveyed" }));
  assert.equal(validate({ ...zoneRecord("thornveil"), survey: "rumoured" }), false,
    "survey is a closed two-value enum");
});

test("the schema's region pattern accepts every id the generator can emit, and rejects the near-misses", () => {
  const validate = compile();
  const ok = (region) => validate({ ...zoneRecord("thornveil"), region });
  // c01–c13 is the whole continent range (content/world/fabric/continent-NN.json),
  // and rNN runs to r30 on Wealdmarch, the widest continent.
  for (const region of ["c01/r01", "c09/r09", "c10/r01", "c13/r02", "c02/r30"])
    assert.ok(ok(region), `${region} must validate: ${JSON.stringify(validate.errors)}`);
  for (const region of ["c00/r01", "c14/r01", "c2/r01", "c02/r1", "c02r01", "c02/R01", " c02/r01"])
    assert.equal(ok(region), false, `${region} must NOT validate`);
});

// REACHABILITY, the same division of labour the floors and the two enums keep:
// the schema must NOT ban `survey: "reported"`. If it did, the Z2 rule that
// fails on a record sitting on reported ground could never be reached — it
// could be deleted from check_content.mjs and this suite would stay green off
// an Ajv error. The ban is a GATE rule; the schema only fixes the vocabulary.
test("reachability: the schema must NOT ban survey \"reported\" — Z2 owns that ban", () => {
  const validate = compile();
  assert.ok(validate({ ...zoneRecord("thornveil"), survey: "reported" }),
    JSON.stringify(validate.errors, null, 2));
});

// ─── the committed records ─────────────────────────────────────────────────

test("every committed record joins to a SURVEYED fabric region, one apiece", () => {
  const files = readdirSync(join(ROOT, "content/zones")).filter((f) => /^zone-.+\.json$/.test(f));
  // DERIVED from the declared corpus, not a fourth copy of the number (CODE
  // REVIEW, MINOR 3): the deliberate edit that grows content/zones/ belongs in
  // COMMITTED_ZONE_IDS, and the name-level deepEqual in "content/zones holds
  // exactly the ten records and nothing else" is what enforces it. A bare
  // literal here was a third statement of one ratchet and was measured to
  // contribute nothing — stubbed, deleting a record still redded 7 tests.
  assert.equal(files.length, COMMITTED_ZONE_IDS.length);

  // The fabric, read fresh — this is a cross-artifact assertion, not a re-read
  // of the same numbers from a second copy.
  const surveyed = new Set();
  const fabricDir = join(ROOT, "content/world/fabric");
  for (const f of readdirSync(fabricDir).filter((n) => /^continent-\d+\.json$/.test(n)))
    for (const region of JSON.parse(readFileSync(join(fabricDir, f), "utf8")).regions)
      if (region.survey === "surveyed") surveyed.add(region.id);
  assert.equal(surveyed.size, SURVEYED_REGIONS,
    `the fabric declares ${SURVEYED_REGIONS} surveyed regions`);

  const seen = new Map();
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/zones", f), "utf8"));
    assert.match(doc.region, /^c(0[1-9]|1[0-3])\/r\d{2}$/, `${f}: bad region id`);
    assert.equal(doc.survey, "surveyed", `${f}: a committed record may only sit on surveyed ground`);
    assert.ok(surveyed.has(doc.region), `${f}: region ${doc.region} is not surveyed in the fabric`);
    assert.equal(seen.get(doc.region), undefined,
      `${f}: region ${doc.region} is already claimed by ${seen.get(doc.region)}`);
    seen.set(doc.region, f);
  }
  // THE PAIRING IS ARBITRARY AND SAYS SO. Task 9 Step 5 takes the `region`
  // column from Task 10's allocation table, which does not exist yet; measured,
  // no derivable pairing does either — all six named cluster-1 towns and all
  // thirteen pinned cluster-1 landmarks sit on REPORTED regions after the redraw
  // (c02/r11, r12, r18, r19), the ten surveyed c02 regions carry only unnamed
  // generated villages (c02/s01…s10), and the plan's own example literal
  // (`thornveil → c02/r04`) names a region the fabric marks reported. So the
  // ten Wealdmarch slugs are paired with c02's ten surveyed regions
  // alphabetically against ascending region id — reproducible, stated, and
  // carrying no geographic claim. Task 11 Step 1 verifies the prose against the
  // new ground and owns any re-voicing.
  assert.deepEqual([...seen.keys()].sort(),
    ["c02/r01", "c02/r02", "c02/r08", "c02/r10", "c02/r14",
     "c02/r16", "c02/r21", "c02/r24", "c02/r28", "c02/r30",
     // TASK 11. Coldreach's six, and these ARE derived: A4 assigns each region
     // its zone from the ground, and every kind in the record is licensed by
     // that region's own measured landforms and biomes. Unlike the ten above,
     // this half of the list carries a geographic claim.
     "c03/r06", "c03/r10", "c03/r12", "c03/r15", "c03/r18", "c03/r22",
     // TASK 12. Stonemoor's seven, derived on the same terms — A4 rows
     // c04/r01, r07, r12, r15, r19, r25 and r28. The plan's Task 12 text is
     // stale in FOUR ways and A4 is the authority in all four: (a) it names
     // rows c04/r01-r07, but the surveyed regions on c04 are not contiguous;
     // (b) its seven zone slugs are invented and A4 mints different ones;
     // (c) five of its records take `fuel` or `timber`, which the licence gate
     // asserts outright that Stonemoor has neither of; and (d) it routes
     // landmark citations to A2-wider-world.md#3 and to the resolved continent,
     // neither of which carries the names — the citation rule below reds on
     // both, which is what STATE section 28 predicted.
     "c04/r01", "c04/r07", "c04/r12", "c04/r15", "c04/r19", "c04/r25", "c04/r28",
     // TASK 13. Thirstwold's seven, derived the same way — A4 rows c05/r06,
     // r15, r17, r20, r21, r23 and r28. The plan's Task 13 text is stale in the
     // same FOUR ways Task 12's was, and A4 is the authority in all four:
     // (a) it names rows c05/r01-r07, but c05/r01-r05 and r07 are all REPORTED
     // ground and Z2 fails a record on any of them; (b) its seven zone slugs are
     // invented, and one of them — `one-wet-strip` — re-mints the reserved canon
     // name "The One Wet Strip", which stands on c05/r10, a reported region;
     // (c) five of its records take `timber`, `fuel` or `forage`, and the licence
     // gate asserts outright that Thirstwold licenses none of the three — measured
     // per region, the seven license {crop, ore, stone, water, salvage} at most;
     // and (d) it routes every landmark citation to content/world/resolved/
     // continent-05.json, which carries the GROUND but not the NAMES — grep
     // returns 0 for all fourteen, and the citation rule below reds on it.
     "c05/r06", "c05/r15", "c05/r17", "c05/r20", "c05/r21", "c05/r23", "c05/r28",
     // TASK 14. The last ten, on A4 rows c06/r06-r08, c07/r01, r03, r06,
     // c08/r06, r08, c09/r03 and c10/r01 — and the four ways the plan's Task 14
     // text is stale are the SAME four Tasks 12 and 13 each measured:
     // (a) it names rows c06/r01-r03, c07/r01-r03, c08/r01-r02, c09/r01 and
     // c10/r01, and only the last of those ten is a surveyed region — the other
     // nine are reported ground Z2 fails outright; (b) all ten of its zone slugs
     // are invented (`reed-lobes`, `lagoon-crescent`, `birdsfoot-mouth`,
     // `fogforest-slope`, `drip-terraces`, `windward-crown`, `stack-coast`,
     // `blowhole-shelf`, `cliffhang-falls`, `cone-line`) and A4 mints ten
     // different ones; (c) its kind sets are unlicensed in eight of the ten
     // rows — most sharply on Ashen Spar, where it takes `salvage` and `timber`
     // and the licence gate grants c10/r01 only {ore, fuel, stone}; and (d) it
     // routes six landmark citations at docs/worldbuilding/A2-wider-world.md#4,
     // which names the three CHAINS but carries none of the twenty landmark
     // names, and four more at content/world/resolved/continent-08.json and
     // continent-10.json, which carry the ground but not the names either.
     // Nineteen of the twenty cite A4 section 5; the twentieth is Brightfall
     // Leap, inherited canon, cited at its own pinned civil record.
     "c06/r06", "c06/r07", "c06/r08",
     "c07/r01", "c07/r03", "c07/r06",
     "c08/r06", "c08/r08",
     "c09/r03",
     "c10/r01"]);
});

// PLAN E TASK 14 — Z2 CLOSED, in its own scope so it can actually be the
// failing assertion.
//
// CODE REVIEW, MAJOR, and the reason this is a separate test. The first version
// of this line sat at the end of "every committed record joins to a SURVEYED
// fabric region, one apiece", AFTER that test had already asserted (1) the file
// count equals the declared corpus, (2) `surveyed.size` equals SURVEYED_REGIONS
// and (3) every record's region is in `surveyed`, no duplicates. Those three
// ENTAIL set equality by pigeonhole, so the closure could never be the
// assertion that fired: the reviewer swapped two survey flags in the fabric
// (c02/r01 surveyed -> reported, c02/r11 the other way, count held at 40) and
// the test redded on (3), never reaching it. My own mutation had "proved" it
// only by stubbing (1) and (3) — by deleting the very assertions that entail
// it, which proves nothing about the code as written. A rule that cannot fail
// for its own reason is a defect (standing rule 3), so it moves rather than
// being defended.
//
// Standing alone, both sides are derived — left from content/zones/, right
// fresh from content/world/fabric/ — and nothing here constrains either first.
// It is the only assertion in the suite that STATES the deliverable rather than
// implying it from three other facts, and it names the offending regions.
test("Z2 is closed in both directions: the surveyed ground and the written records are one set", () => {
  const covered = readdirSync(join(ROOT, "content/zones"))
    .filter((n) => /^zone-.+\.json$/.test(n))
    .map((n) => JSON.parse(readFileSync(join(ROOT, "content/zones", n), "utf8")).region);

  const surveyed = [];
  const fabricDir = join(ROOT, "content/world/fabric");
  for (const f of readdirSync(fabricDir).filter((n) => /^continent-\d+\.json$/.test(n)))
    for (const region of JSON.parse(readFileSync(join(fabricDir, f), "utf8")).regions)
      if (region.survey === "surveyed") surveyed.push(region.id);

  // A floor first, for the reason every count in this file carries one: with
  // content/zones/ absent both sides are [] and deepEqual passes, which is an
  // absence of data published as a verdict.
  assert.ok(covered.length > 0 && surveyed.length > 0,
    "one side of the closure is empty — this test proves nothing on this tree");

  const missing = surveyed.filter((r) => !covered.includes(r)).sort();
  const extra = covered.filter((r) => !surveyed.includes(r)).sort();
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] },
    "Z2 is not closed: surveyed ground with no record, or a record off surveyed ground");
});

// ─── the two findings of the adversarial review of c4d59c7 ─────────────────

// MAJOR 1. The plan's two bails (`if (!zones) return 0` and the neither-layer
// soft-skip) return from the whole function, so Z3/Z4/Z5/Z7 — which need no
// authority, being intra-record — went dark with the join rules. The reviewer
// built the tree that does it: a resolved continent declaring `"zones": []` and
// no content/world/fabric/ at all, which is what a partially-generated or WIP
// root genuinely looks like. Three real defects in one record produced `0
// zones`, ZERO failures and exit 0.
test("a root with NEITHER authority still enforces every intra-record rule", () => {
  const zones = allZones({
    emberdown: (z) => {
      z.zone = "GARBAGE_NOT_KEBAB!! ";              // Z0
      z.hazards[1].id = z.hazards[0].id;            // Z4 duplicate
      z.landmarks[0].id = "Not Kebab";              // Z4 shape
      z.resources[0].kind = "not-a-real-kind";      // Z7
      z.reasonToGo = "   ";                         // Z3
    },
  });
  const r = runGate(fixture({ zones, geography: { zones: [] }, fabric: null }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "GARBAGE_NOT_KEBAB!! " is not kebab-case/);
  assert.match(r.out, /duplicate hazard id "emberdown-hazard-a"/);
  assert.match(r.out, /landmark id "Not Kebab" is not kebab-case/);
  assert.match(r.out, /kind "not-a-real-kind" is not a resource kind/);
  assert.match(r.out, /has an empty reasonToGo/);
  // …and the two JOIN rules stay silent, because neither authority can answer.
  assert.doesNotMatch(r.out, /not in content\/world\/resolved#zones/);
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
});

// MAJOR 2. Z1's join subject moved from `zone` to `region`, and nothing filled
// the hole: `zone` was left checked by exact-string duplicate detection alone,
// while remaining the name every Z3/Z5/Z6 message and every duplicate group is
// keyed on. Measured by the reviewer on a fully-joined, otherwise-valid record:
// `"zone": "GARBAGE_NOT_KEBAB!! "` passed the gate with 0 failures, 0 warnings.
test("Z0: a zone slug that is not kebab-case fails even when the join is perfect", () => {
  const r = runGate(fixture({
    zones: allZones({ emberdown: (z) => { z.zone = "GARBAGE_NOT_KEBAB!! "; } }),
  }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "GARBAGE_NOT_KEBAB!! " is not kebab-case/);
  // The record still JOINS — its region is untouched — so nothing else fires
  // and this rule is the only thing that can reject the root.
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
  assert.doesNotMatch(r.out, /not in content\/world\/resolved#zones/);
});

test("Z0: every committed record's zone slug is kebab-case", () => {
  for (const f of readdirSync(join(ROOT, "content/zones")).filter((n) => /^zone-.+\.json$/.test(n)))
    assert.match(JSON.parse(readFileSync(join(ROOT, "content/zones", f), "utf8")).zone,
      ZONE_ID_RE, `${f}: zone slug is not kebab-case`);
});

// ---------------------------------------------------------------------------
// TASK 11 REVIEW FINDING (content, MAJOR 2) — a landmark's `source` pointed at a
// file that does not carry its name.
//
// The six Coldreach records first cited content/world/resolved/continent-03.json,
// which owns the GROUND but not the NAMES: grep returned 0 for all twelve. The
// document that mints and publishes them is docs/worldbuilding/A4-zone-allocation.md
// section 5. Nothing in check_content.mjs reads `source` at all — no Z-rule
// covers it — so this is the only thing standing between a citation and rot,
// which is the fifth time this programme has had that conversation (spec 9.6).
//
// The LEGACY TEN are measured, not fixed. They are canon and preserved byte for
// byte under the owner's ruling, and they carry 14 broken citations of their
// own: 12 names their cited doc does not contain, and 2 pointing at
// content/maps/cluster1-geography.json, a file the redraw retired. That is Task
// 15's prose reconciliation. It is pinned as a NUMBER here so it cannot grow
// quietly and cannot be quietly declared fixed.
// ---------------------------------------------------------------------------
test("every landmark source is a real file, and for records written after the redraw it carries the name", () => {
  const carries = (source, name) => {
    const path = join(ROOT, source.split("#")[0]);
    if (!existsSync(path)) return "missing-file";
    return readFileSync(path, "utf8").toLowerCase().includes(name.trim().toLowerCase()) ? "ok" : "name-absent";
  };

  // Every record written for a derived row must cite a doc that names them.
  // The set is DERIVED, so no constant can quietly narrow what is checked; the
  // hand-list is cross-checked against it rather than trusted as the scope.
  const derivedIds = postRedrawRecords();
  assert.deepEqual(derivedIds, [...POST_REDRAW_ZONE_IDS].sort(),
    "the derived post-redraw set and the declared corpus disagree — one of them is wrong");
  let checked = 0;
  for (const id of derivedIds) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/zones/zone-${id}.json`), "utf8"));
    for (const l of doc.landmarks) {
      assert.ok(l.source, `${id}: landmark "${l.name}" has no source`);
      assert.equal(carries(l.source, l.name), "ok",
        `${id}: landmark "${l.name}" cites ${l.source}, which does not carry the name`);
      checked++;
    }
  }
  assert.equal(checked, POST_REDRAW_LANDMARKS,
    "the post-redraw record set moved — this floor must move with it");

  // The legacy ten: measured debt, in both directions.
  const broken = [];
  for (const id of ZONE_IDS) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/zones/zone-${id}.json`), "utf8"));
    for (const l of doc.landmarks)
      if (l.source && carries(l.source, l.name) !== "ok") broken.push(`${id}/${l.name}`);
  }
  assert.equal(broken.length, 14,
    `the legacy ten's broken-citation debt moved to ${broken.length} (was 14). Growing it is a defect; `
    + "shrinking it means Task 15 landed and this number should be updated, not deleted");
});
