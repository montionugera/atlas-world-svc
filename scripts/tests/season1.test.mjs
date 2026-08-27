import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlaces } from "../lib/places.mjs";
import { loadSpine, buildTree } from "../lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const budget = JSON.parse(readFileSync(join(ROOT, "content/season-1-budget.json"), "utf8"));

test("budget document has the expected envelope", () => {
  assert.equal(budget.version, 1);
  assert.equal(budget.season, 1);
  assert.equal(budget.cluster, 1);
  assert.equal(budget.record, "docs/worldbuilding/DR-003-season-1-budget.md");
  assert.ok(Array.isArray(budget.lines) && budget.lines.length > 0);
});

test("every line is well formed and ids are unique", () => {
  const ids = new Set();
  for (const line of budget.lines) {
    assert.equal(typeof line.id, "string", `line missing id: ${JSON.stringify(line)}`);
    assert.equal(ids.has(line.id), false, `duplicate line id: ${line.id}`);
    ids.add(line.id);
    assert.equal(typeof line.label, "string", `${line.id}: label must be a string`);
    assert.equal(Number.isInteger(line.target), true, `${line.id}: target must be an integer`);
    assert.equal(typeof line.source, "string", `${line.id}: source must cite where the number came from`);
    const measured = typeof line.measure === "string";
    const blocked = typeof line.blockedBy === "string";
    assert.ok(measured !== blocked, `${line.id}: needs exactly one of measure / blockedBy`);
  }
});

import { MEASURES, buildRows, renderTable } from "../lib/season1.mjs";

const FIXTURE = join(ROOT, "scripts/tests/fixtures/season1");

test("mobBases counts the codegen mob type ids", () => {
  assert.equal(MEASURES.mobBases(FIXTURE), 2);
});

test("bestiaryDesigns counts the top-level array", () => {
  assert.equal(MEASURES.bestiaryDesigns(FIXTURE), 3);
});

test("actIndependentQuests excludes act gates, event gates, their descendants and cycles", () => {
  // free: quest-free-root, quest-free-child, quest-two-free-parents (both of
  // its unlockedBy entries are themselves free). Everything else is gated,
  // downstream of a gate, or in a cycle that never resolves — including
  // quest-mixed-gate, whose unlockedBy mixes a free quest id with an act-*
  // id: this proves the AND-gate (every prerequisite must be free), since an
  // OR-gate (any prerequisite free) would wrongly admit it via quest-free-root.
  assert.equal(MEASURES.actIndependentQuests(FIXTURE), 3);
});

test("art measures count by key prefix", () => {
  assert.equal(MEASURES.townArt(FIXTURE), 2);
  assert.equal(MEASURES.bestiaryArt(FIXTURE), 0);
});

test("buildRows notes over/met/short correctly (drift upward must not read as met)", () => {
  const doc = {
    lines: [
      { id: "over", label: "O", target: 1, measure: "mobBases", source: "s" },
      { id: "met", label: "M", target: 2, measure: "mobBases", source: "s" },
      { id: "short", label: "S", target: 5, measure: "mobBases", source: "s" },
    ],
  };
  const [over, met, short] = buildRows(doc, FIXTURE);
  // FIXTURE's mobBases measures 2 (see the "mobBases counts..." test above).
  assert.equal(over.actual, 2);
  assert.equal(over.note, "1 over");
  assert.equal(met.actual, 2);
  assert.equal(met.note, "met");
  assert.equal(short.actual, 2);
  assert.equal(short.note, "3 short");
});

test("buildRows reports blocked lines without inventing a delta", () => {
  const doc = {
    lines: [
      { id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" },
      { id: "stuck", label: "S", target: 1, blockedBy: "P3 - buried-ground design", source: "s" },
    ],
  };
  const [measured, stuck] = buildRows(doc, FIXTURE);
  assert.equal(measured.actual, 2);
  assert.equal(measured.note, "3 short");
  assert.equal(stuck.actual, null);
  assert.match(stuck.note, /^blocked: P3/);
});

test("buildRows never throws when a measured file is missing", () => {
  const doc = { lines: [{ id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" }] };
  const [row] = buildRows(doc, join(ROOT, "scripts/tests/fixtures/does-not-exist"));
  assert.equal(row.actual, null);
  assert.match(row.note, /^unmeasurable:/);
});

test("renderTable emits a header and one line per row", () => {
  const out = renderTable(
    buildRows({ lines: [{ id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" }] }, FIXTURE),
  );
  assert.match(out, /measured/);
  assert.match(out, /target/);
});

import { execFileSync } from "node:child_process";

const CLI = join(ROOT, "scripts/report_season1.mjs");

test("CLI prints every budget line and exits 0", () => {
  const out = execFileSync(process.execPath, [CLI], { encoding: "utf8" });
  for (const line of budget.lines) assert.match(out, new RegExp(line.id));
  assert.match(out, /Season 1 budget/);
});

test("CLI still exits 0 when every measured file is missing", () => {
  // The guarantee that makes this a report and not a gate.
  // --root also moves the default budget path, so --budget is passed
  // explicitly: the missing fixture root has no budget file to read.
  const out = execFileSync(
    process.execPath,
    [
      CLI,
      "--root",
      join(ROOT, "scripts/tests/fixtures/does-not-exist"),
      "--budget",
      join(ROOT, "content/season-1-budget.json"),
    ],
    { encoding: "utf8" },
  );
  assert.match(out, /unmeasurable:/);
});

test("CLI rejects an unknown flag with exit 2", () => {
  assert.throws(
    () => execFileSync(process.execPath, [CLI, "--nope"], { encoding: "utf8", stdio: "pipe" }),
    (err) => err.status === 2,
  );
});

test("CLI still exits 0 when --budget points at a missing file", () => {
  // Found in review: the budget-file read itself must honor the same
  // "always exits 0" contract as a missing measured file, since this is
  // not the deliberate arg-parse exit(2) case.
  const out = execFileSync(
    process.execPath,
    [CLI, "--budget", join(ROOT, "content/does-not-exist.json")],
    { encoding: "utf8" },
  );
  assert.match(out, /could not load/);
});

import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

test("CLI still exits 0 when --budget is valid JSON but missing lines", () => {
  // Found in fix-round 1: JSON.parse succeeds on a structurally-wrong
  // budget (e.g. no `lines` array), so the earlier try/catch around
  // readFileSync+JSON.parse never fires and buildRows throws uncaught.
  // This is a separate failure mode from "not valid JSON" and needs its
  // own envelope check, exiting 0 the same way.
  const badBudgetPath = join(tmpdir(), `season1-bad-budget-${process.pid}.json`);
  writeFileSync(badBudgetPath, JSON.stringify({ season: 1, cluster: 1, record: "x" }));
  try {
    const out = execFileSync(process.execPath, [CLI, "--budget", badBudgetPath], { encoding: "utf8" });
    assert.match(out, /could not load/);
    assert.match(out, new RegExp(badBudgetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    unlinkSync(badBudgetPath);
  }
});

// The ONLY new import. existsSync, mkdtempSync, mkdirSync and rmSync are the
// four names nothing in this file binds yet; writeFileSync, tmpdir and
// execFileSync are already imported at lines 154, 155 and 107 and re-importing
// any of them is a duplicate-binding SyntaxError.
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";

// I-060: the zones measure. Ids come from the geography rather than a literal
// list, so a change to the ten cannot silently pass this file.
//
// Plan A Task 12: this used to readFileSync content/maps/cluster1-geography.json
// directly. That file is deleted by this task, and this file was NOT on the
// plan's list of remaining readers (enumeration defect #4) — a module-level
// read, so its absence would have reddened this whole suite on import rather
// than one test.
//
// Plan D Task 11: loadPlaces() now reads the GENERATED world from
// content/world/resolved/, whose zone ids are the new region ids.
//
// PLAN E RULING 8 (Task 6): this used to come from resolveWorld() — the basin
// document's own resolver — because this file's subject was the live BASIN and
// its ten legacy zone slugs. That subject is gone: the redrawn 36-node trunk
// hosts no basin, ruling 8 retired the cluster1 sheet, and its tail retired the
// three dead subject keys from content/spine/sheet.json, so resolveWorld can no
// longer return a document at all on the real root (pinned in places.test.mjs).
//
// REAL_WORLD is used here for exactly two things — a list of real zone ids to
// stamp synthetic records for, and a real zones/towns pair to wrap in a fixture
// geography — and the RESOLVED world supplies both. So the assertion below
// stays what it always was, on the document that actually survives: the world
// the gate itself reads must load with zero problems, or every fixture built
// from it is built on sand.
const REAL_WORLD = (() => {
  const { doc, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, [], "the resolved world must load");
  return doc;
})();
const GEOGRAPHY_ZONE_IDS = REAL_WORLD.zones.map((z) => z.id);

/** A Z3-complete record: two hazards, two resources, two landmarks, a reason. */
const completeRecord = (zone) => ({
  zone,
  reasonToGo: `why anyone walks into ${zone}`,
  hazards: [{ id: "h-one" }, { id: "h-two" }],
  resources: [{ id: "r-one" }, { id: "r-two" }],
  landmarks: [{ id: "l-one" }, { id: "l-two" }],
});

/** Throwaway root holding exactly the given content/zones files. */
function zoneRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "season1-zones-"));
  mkdirSync(join(root, "content/zones"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, "content/zones", name), JSON.stringify(body));
  }
  return root;
}

test("zones counts only records clearing the Z3 floors, once per zone", () => {
  // The fixture holds seven zone-*.json files. Two are complete — emberdown
  // and thornveil — and FOUR fail on exactly one Z3 floor each, one floor per
  // file, so every branch of the conjunction in zones() has its own dedicated
  // witness: hollowmarch has one hazard, ashvale-front has one resource,
  // gildmark-head has one landmark, and cindervast's reasonToGo is blank
  // whitespace. The seventh, zone-emberdown-second-file.json, is a complete
  // DUPLICATE of emberdown and pins the Set. Two distinct zones clear.
  //
  // DO NOT prune these to "one representative failing record". Found by
  // mutation testing in review: with only hollowmarch failing, deleting the
  // resources floor or the landmarks floor from zones() left the whole suite
  // GREEN. One floor-failing fixture per floor is what makes those two
  // deletions go red, and it is the only thing that does.
  assert.equal(MEASURES.zones(FIXTURE), 2);
});

test("zones ignores files that are not named zone-<id>.json", () => {
  // notes.json sits in the same directory and is a top-level array — it would
  // throw the shape error if the filename filter were dropped, so this test
  // fails loudly rather than silently if the regex is loosened.
  assert.ok(existsSync(join(FIXTURE, "content/zones/notes.json")));
  assert.equal(MEASURES.zones(FIXTURE), 2);
});

test("zones throws on a zone file that is not a record object", () => {
  const root = zoneRoot({ "zone-thornveil.json": ["not", "an", "object"] });
  try {
    assert.throws(() => MEASURES.zones(root), /zone-thornveil\.json: expected a zone record object/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("zones throws on a record with no zone id — identity is what it counts by", () => {
  const root = zoneRoot({ "zone-thornveil.json": { reasonToGo: "x", hazards: [], resources: [], landmarks: [] } });
  try {
    assert.throws(() => MEASURES.zones(root), /zone-thornveil\.json: expected a non-empty string "zone"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildRows reports a missing content/zones as unmeasurable, never a crash", () => {
  // The report's always-exits-0 contract has to hold for the new measure too:
  // zones() throws ENOENT when content/zones is absent, and buildRows absorbs it.
  const doc = { lines: [{ id: "zones", label: "Z", target: 10, measure: "zones", source: "s" }] };
  const [row] = buildRows(doc, join(ROOT, "scripts/tests/fixtures/does-not-exist"));
  assert.equal(row.actual, null);
  assert.match(row.note, /^unmeasurable: ENOENT/);
});

test("the budget's zones line is measured, not blocked, and states what it counts", () => {
  const line = budget.lines.find((l) => l.id === "zones");
  assert.equal(line.measure, "zones");
  assert.equal(line.blockedBy, undefined);
  // Design §8: the premise is REWRITTEN, not silently dropped. The source must
  // say what the count is keyed on, and that the keyspace rename is still owed.
  assert.match(line.source, /geography zone id/);
  assert.match(line.source, /I-056 item 4/);
});

test("no budget line carries a note key — buildRows computes note and would clobber it", () => {
  // Verified against buildRows: `{ ...line, actual, note }` puts the computed
  // note last, so an authored note in the JSON never reaches the report. Any
  // caveat belongs in `source`, which survives the spread.
  for (const line of budget.lines) {
    assert.equal(line.note, undefined, `${line.id}: put the caveat in source, not note`);
  }
});

// The record-filename regex is written TWICE — `ZONE_FILE` in scripts/lib/
// season1.mjs and an inline `/^zone-.+\.json$/` in checkZoneContent() — and
// nothing structurally binds them. Widening one to `zones-*.json`, or narrowing
// one to demand kebab-case, would make the gate and the budget count different
// file sets, and the divergence would not be visible from the two numbers
// (the gate reports records.length, the measure reports floor-passing distinct
// zone ids). This test is the binding: one directory, four filenames chosen to
// sit on every edge of the pattern, and both implementations must agree that
// exactly ONE of them is a record.
test("the gate and the zones measure agree on which filenames are records", () => {
  const root = mkdtempSync(join(tmpdir(), "season1-filter-"));
  try {
    mkdirSync(join(root, "content/characters"), { recursive: true });
    mkdirSync(join(root, "content/schemas"), { recursive: true });
    mkdirSync(join(root, "content/maps"), { recursive: true });
    mkdirSync(join(root, "content/zones"), { recursive: true });
    // The same three schemas Task 4's fixture() copies, plus the geography:
    // checkZoneContent needs zone-content.schema.json and the geography, and
    // copying character/map schemas keeps the unrelated checkers on a fixture
    // rather than half-reading the real tree. content/characters must EXIST or
    // the gate emits `FAIL characters dir unreadable: … ENOENT`; empty is fine.
    for (const rel of [
      "content/schemas/zone-content.schema.json",
      "content/schemas/character.schema.json",
      "content/schemas/map.schema.json",
    ]) writeFileSync(join(root, rel), readFileSync(join(ROOT, rel), "utf8"));
    // Plan A Task 12: the geography used to be COPIED from the repo's
    // content/maps/cluster1-geography.json, which that task deletes.
    //
    // Plan D Task 11: loadPlaces() lost its fallback branch, so the fixture
    // root carries its geography in the RESOLVED shape instead — one
    // content/world/resolved/continent-02.json wrapping the same zones/towns
    // arrays. Only the FILE and the wrapper keys changed; this stays a test
    // about the FILENAME FILTER it is named for.
    mkdirSync(join(root, "content/world/resolved"), { recursive: true });
    writeFileSync(join(root, "content/world/resolved/continent-02.json"), JSON.stringify({
      continent: "c02",
      coastline: { id: "f-coast-c02", points: [[0, 0], [10, 0], [10, 10]] },
      river: null, saltmire: null, iceEdge: null,
      terrainPatches: REAL_WORLD.terrainPatches ?? [],
      zones: REAL_WORLD.zones, towns: REAL_WORLD.towns,
      camps: [], roads: [], landmarks: [], dungeons: [],
      instances: [], relay: null, distances: null, seaLane: null, sheet: null,
    }));

    // Hermeticity, exactly as Task 4's fixture()/runGate() do it. parseArgs in
    // check_content.mjs defaults --keys, --manifest, --mob-types and
    // --spawn-areas to the LIVE repo artifacts (colyseus-server/generated/*,
    // game-client/assets/manifest.json). Spawning with only --content-root
    // would make this filename-filter test read three committed generated files
    // and go red on a worktree where codegen has not run. These four stubs plus
    // the four flags below are what keep that from happening.
    for (const [name, body] of [
      ["keys.json", { version: 1, keys: [] }],
      ["manifest.json", { version: 2, entries: {} }],
      ["mob-types.json", { version: 1, mobTypes: [] }],
      ["spawn-areas.json", { version: 1, areas: [] }],
    ]) writeFileSync(join(root, name), JSON.stringify(body));

    // `zone-emberdown.json` is the ONLY record. The other three sit one
    // character off the pattern on three different sides: no hyphen, a plural
    // stem, and no `zone` stem at all.
    // The zone id must be one the fixture geography above declares, or Z1
    // orphans the record and checkZoneContent's `N zones` count — the very
    // number this test reads — drops to 0. It used to be the legacy slug
    // "emberdown"; on the redrawn trunk it is the first real resolved zone id.
    // The FILENAME stays `zone-emberdown.json`: this test is about the filename
    // filter, so the file's slug is deliberately NOT the record's zone id.
    const record = completeRecord(GEOGRAPHY_ZONE_IDS[0]);
    record.hazards = [{ id: "h-one", name: "H one", description: "d", effect: "burn" },
                      { id: "h-two", name: "H two", description: "d", effect: "poison" }];
    record.resources = [{ id: "r-one", name: "R one", kind: "fuel", description: "d" },
                        { id: "r-two", name: "R two", kind: "crop", description: "d" }];
    record.landmarks = [{ id: "l-one", name: "L one", description: "d" },
                        { id: "l-two", name: "L two", description: "d" }];
    const decoy = ["not a zone record; both filename filters must skip this file"];
    writeFileSync(join(root, "content/zones/zone-emberdown.json"), JSON.stringify(record));
    writeFileSync(join(root, "content/zones/zone.json"), JSON.stringify(decoy));
    writeFileSync(join(root, "content/zones/zones-x.json"), JSON.stringify(decoy));
    writeFileSync(join(root, "content/zones/notes.json"), JSON.stringify(decoy));

    // The measure: one record, and no throw — a throw here would mean one of
    // the three decoys got through the filter and hit the shape check.
    assert.equal(MEASURES.zones(root), 1);

    // The gate over the SAME directory, invoked on Task 4's contract: all four
    // sidecar flags pointed at the stubs above, so nothing outside this tmpdir
    // is read. It exits 1 because the nine remaining geography zones have no
    // record (Z2), which is irrelevant here — the assertion is on the `N zones`
    // count, which is checkZoneContent()'s own view of how many files were
    // records.
    let out;
    try {
      out = execFileSync(process.execPath, [
        join(ROOT, "scripts/check_content.mjs"),
        "--content-root", join(root, "content"),
        "--keys", join(root, "keys.json"),
        "--manifest", join(root, "manifest.json"),
        "--mob-types", join(root, "mob-types.json"),
        "--spawn-areas", join(root, "spawn-areas.json"),
      ], { encoding: "utf8" });
    } catch (e) {
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    assert.match(out, /, 1 zones, \d+ towns, 0 nodes,/, `the gate must see exactly one record too:\n${out}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the report's zones row reads target/target met once that many records clear the floors", () => {
  // PLAN E RULING 8 (Task 6): the ids used to be the ten legacy basin slugs,
  // and the filename was `zone-<id>.json` because in that world the two were
  // the same string. On the redrawn trunk a zone id is `cNN/rNN` — a slash,
  // which cannot be a filename — and the shipped convention (Plan E Task 11:
  // `zone-tallowquay-roads.json` holding `"zone": "c02/r21"`) already separates
  // the file's slug from the record's id. The fixture mirrors that, and takes
  // as many REAL zone ids as the budget line asks for rather than a literal 10,
  // so the row is proven to read target/target for whatever the target is.
  const target = budget.lines.find((l) => l.id === "zones").target;
  const ids = GEOGRAPHY_ZONE_IDS.slice(0, target);
  assert.equal(ids.length, target,
    `the resolved world declares ${GEOGRAPHY_ZONE_IDS.length} zones, fewer than the budget's ${target}`);
  const root = zoneRoot(
    Object.fromEntries(ids.map((id, i) => [`zone-fixture-${i}.json`, completeRecord(id)])),
  );
  try {
    const row = buildRows(budget, root).find((r) => r.id === "zones");
    assert.equal(row.actual, target);
    assert.equal(row.note, "met");
    assert.equal(
      renderTable([row]).split("\n").at(-1),
      `zones                     ${target}      ${target}      met`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
