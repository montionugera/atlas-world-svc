// Plan A Task 5 — scripts/lib/places.mjs.
//
// PLAN E RULING 8 (STATE §28) RETIRED THIS FILE'S OTHER HALF. Until the
// redraw, the assertion that mattered here was byte-identity: canonStringify
// over resolveWorld's doc had to equal, EXACTLY, the bytes the retired
// content/maps/cluster1-geography.json held. That proof, and the twelve tests
// that resolved the LIVE spine into a basin document, are gone — not because
// they were weak but because their SUBJECT is gone. The redrawn 36-node trunk
// does not host f-west-coast, f-the-meltwash, f-northern-ice-edge, n-saltmire
// or n-eastern-hills, so resolveWorld() cannot return a doc at all and every
// one of those assertions was unreachable.
//
// Two of them were worse than unreachable: they still PASSED, vacuously.
// "REPORTS a missing subject node" deleted n-saltmire from the tree and
// "REPORTS a missing subject feature" filtered out f-west-coast — mutations
// that are now no-ops, because both subjects are already absent. They went
// green while proving nothing, which is the exact failure mode this repo has
// a standing rule about, so they retired with the rest rather than being left
// as green decoration.
//
// What SURVIVES here is the live path: loadPlaces reads
// content/world/resolved/*.json (the Plan D Task 11 cutover) and has nothing
// to do with the basin descriptor, so its tests and the three gate-join
// tests are untouched. resolveWorld's shape-, tree- and no-throw guards also
// stay: they fire before subject resolution, so they still assert something
// real. The retirement itself is pinned by the first test below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, buildTree } from "../lib/spine.mjs";
import { WORLD_DOC_KEYS, resolveWorld, loadPlaces } from "../lib/places.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(ROOT, "content");
function realTree() {
  const spine = loadSpine({ contentRoot: CONTENT });
  return { spine, tree: buildTree({ nodes: spine.nodes, rootIds: spine.roots }) };
}

// ---------------------------------------------------------------------------
// THE RETIREMENT, PINNED — AND NOW DISCHARGED. Plan E ruling 8 is a decision,
// and a decision that lives only in a plan document is decoration, so this
// asserts the facts that MAKE the basin sheet retired.
//
// It was written to go RED when Task 8 landed, and it did: the roster
// assertion below read the four standing sheets, and Task 8 took it to
// seventeen. Updating it rather than deleting it is the whole point of the
// tripwire. What CHANGED is the roster; what did NOT change is the other two
// halves, and that is the honest report of what Task 8 actually did:
//
//   - the spine-backed basin descriptor is STILL dead. Task 8 did not repair
//     resolveWorld; it built a successor that reads content/world/resolved/
//     directly, which is what ruling 8's phrase "rebuilt resolved-backed"
//     describes. So the call below still returns null.
//   - production STILL does not reach the two dormant functions. Their
//     dormancy is therefore PERMANENT rather than "until Task 8" — which
//     makes them a dead-code question for an owner, filed to STATE §28's
//     Task 8 "FILED, NOT FIXED" list, not something this test should settle
//     by deleting them.
//
// The real coverage the pin asked for lives where it can be observed, in
// tools/mapforge/tests/continent-sheet.test.mjs's "RULING 8" test — and it is
// FOUR of the five subject keys, not five. `coastline`, `river`, `saltmire`
// and `terrainPatches` are asserted as DRAWN on the wealdmarch continent
// sheet; `iceEdge` is asserted as ABSENT FROM THE DATA, because it is null on
// all thirteen resolved continents. Writing "five drawn" here would be this
// programme's own named failure — publishing absence as a positive fact — in
// the one file whose job is to keep ruling 8 honest.
// ---------------------------------------------------------------------------
test("RULING 8: the basin sheet's spine path stays dead; its ground came back as `wealdmarch`", async () => {
  // (1) The descriptor no longer names a basin. Ruling 8 retired the cluster1
  // SHEET "with its whole tail ... in the same single commit", and
  // content/spine/sheet.json's `subjects` block IS that sheet's data, so its
  // three dead subject keys (mireIds, terrainPatchIds, featureIds — five ids,
  // none of which the redrawn 36-node trunk hosts) retired with it. What is
  // left is the four keys that still resolve, and the shape guard therefore
  // reports an INCOMPLETE descriptor rather than five dead ids.
  //
  // Asserted as an EXACT set for the same reason as before: a subject key
  // quietly coming back is as visible as one leaving. The five retired ids
  // themselves live on in RETIRED_BASIN_SUBJECTS below. Task 8 did NOT read
  // them from there in the end: the same ground is keyed differently in the
  // resolved doc (coastline, river, saltmire, iceEdge, terrainPatches), and
  // the successor sheet reads that — so these five ids are now only a record
  // of what the dead descriptor used to name.
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null, "the spine-backed basin descriptor resolved again — decide what owns this ground");
  assert.deepEqual(problems.slice().sort(), [
    "resolveWorld: descriptor.featureIds is missing or not an object",
    "resolveWorld: descriptor.mireIds is missing or empty",
    "resolveWorld: descriptor.terrainPatchIds is missing or empty",
  ].sort());

  // (2) `cluster1` is out of the sheet registry. This is the half that the
  // storybook parity gate and check_render_lock both key off: leaving the
  // entry while the sheet cannot build is what made check_render_lock BAIL.
  const { SHEETS } = await import("../../tools/mapforge/render-sheet.mjs");
  assert.equal(SHEETS.cluster1, undefined, "cluster1 is back in SHEETS as a separate entry — ruling 8 says it is wealdmarch");
  assert.deepEqual(
    Object.keys(SHEETS),
    ["atlas", "synthetic", "fabric", "overlay",
     "rimewall-cap", "wealdmarch", "coldreach", "stonemoor", "thirstwold", "reedstrand",
     "driftholt", "wracklow", "brightfall", "ashen-spar", "quillreef", "skerryfast", "loamspit"],
    "ruling 8's arithmetic: SHEETS ran 5 -> 4 at the redraw, and Task 8's 13 continent sheets take it to 17",
  );
  assert.ok(SHEETS.wealdmarch, "the basin ground has no successor sheet at all");
  assert.equal(SHEETS.wealdmarch.outSvg, "game-client/assets/art/maps/wealdmarch.svg");

  // (3) Nothing in PRODUCTION reaches the dormant builders. Without this, the
  // two functions look live because their tests import them. Ruling 8 left
  // them on disk as Task 8's raw material; Task 8 did not need them, so this
  // assertion now records a permanent state rather than a temporary one.
  const srcs = ["scripts/check_content.mjs", "tools/mapforge/render-sheet.mjs"];
  for (const rel of srcs) {
    const src = readFileSync(join(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const fn of ["resolveWorld", "drawBasinSheet"])
      assert.ok(!src.includes(fn), `${rel} calls ${fn} — the spine-backed basin path is dormant permanently; the successor reads content/world/resolved/ directly`);
  }
});

test("resolveWorld REPORTS a missing zoneRoot without a cascade of feature problems", () => {
  const { spine, tree } = realTree();
  tree.byId.delete("n-cluster1");
  // RETIRED_BASIN_SUBJECTS, not the committed descriptor: the no-cascade
  // behaviour under test lives past the shape guard (ruling 8's tail retired
  // the three keys that guard requires), and this test's subject is the
  // zoneRoot branch, not the shape branch.
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: RETIRED_BASIN_SUBJECTS });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("n-cluster1")), JSON.stringify(problems));
});

// resolveWorld reads subjects from the descriptor and still reproduces the
// mirror bytes — the basin document's own contract, unchanged by the Plan D
// Task 11 cutover (which re-pointed loadPlaces only). The fabric/civil
// rejection test was deleted with the parameters it exercised: the cutover
// removed them from resolveWorldFromSpine's signature, because "this build
// cannot do that join" stopped being true — scripts/lib/resolve.mjs owns the
// fabric+civil join now.

// Review finding (Task 12, MINOR): this message lost its only pin. It used to
// be asserted by spine-gates' "sheet.json has NO subjects block" test, which ran
// check_spine_emit.mjs; Task 12 deleted the emitter's call into places.mjs and
// re-pointed that test at check_content.mjs, where loadPlaces (places.mjs:315)
// gates its ONLY resolveWorld call on `subjects` being truthy — so a root with
// no descriptor falls through to the mirror and this message is now unreachable
// from loadPlaces by construction. It stays reachable from every DIRECT
// resolveWorld caller, i.e. both sheet builders, which is exactly the path
// check_render_lock.mjs runs; render-lock.test.mjs's brokenSheetRepo() exercises
// it but asserts only the CLI's "PROBLEM:" prefix. Pinned here, in process, so
// the wording cannot drift silently for the callers that can still hit it.
test("resolveWorld REPORTS a spine whose sheet carries no `subjects` descriptor", () => {
  const { spine, tree } = realTree();
  const noSubjects = { ...spine, sheet: { ...spine.sheet } };
  delete noSubjects.sheet.subjects;
  const { doc, problems } = resolveWorld({ spine: noSubjects, tree });
  assert.equal(doc, null);
  assert.deepEqual(problems, [
    "sheet: content/spine/sheet.json has no `subjects` descriptor — the sheet's subject ids are DATA, not code",
  ]);
});

// Plan D Task 11 cutover: loadPlaces reads content/world/resolved/ and
// NOTHING else. The spine path moved back to being resolveWorld's alone (the
// sheet builders' contract, unchanged), the mirror fallback is gone, and the
// byte-identity pin above now guards resolveWorld rather than loadPlaces.
test("loadPlaces on the real content root reads the resolved world", () => {
  const { doc, problems } = loadPlaces({ contentRoot: CONTENT });
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(doc), WORLD_DOC_KEYS);
  assert.equal(doc.source, "content/world/resolved/*.json");
  assert.equal(doc.coordinateSystem.extentKm.width, 400);
  assert.ok(doc.zones.length >= 160, `expected >= 160 zones, got ${doc.zones.length}`);
  // ERRATUM vs plan Task 11 Step 1 ("expected >= 45 towns"): the committed
  // resolved world carries EIGHT towns — the 6 basin pins plus Tallowquay and
  // Netstead; the roster's other pins are landmarks, not settlements. Pinned
  // as an EXACT golden count (the repo convention, cf. tools/mapforge/tests/
  // generate-world.test.mjs's pinned lengths) so even ONE lost settlement
  // reds here — a >= floor would swallow it. Only Plan E's redraw may move
  // this number, in the same commit that re-baselines it deliberately.
  assert.equal(doc.towns.length, 8, `expected exactly 8 towns (the golden count), got ${doc.towns.length}`);
});

test("the merged doc takes each geographic feature from the first continent that has one", () => {
  const { doc } = loadPlaces({ contentRoot: CONTENT });
  assert.ok(doc.coastline, "no continent supplied a coastline");
  assert.ok(doc.saltmire, "no continent supplied a saltmire");
  assert.ok(doc.river, "no continent supplied a river");
  assert.ok(Array.isArray(doc.coastline.points) && doc.coastline.points.length >= 3);
  assert.ok(Array.isArray(doc.saltmire.polygon) && doc.saltmire.polygon.length >= 3);
});

test("loadPlaces on an empty root returns doc null and one problem, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "places-empty-"));
  try {
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.equal(doc, null);
    assert.equal(problems.length, 1);
    // The mutation test for the cutover itself: the problem must name the
    // resolved dir — a clear diagnosis, NOT a silent fallback to some other
    // source.
    assert.match(problems[0], /world\/resolved\/ holds no continent files/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── the three branches of the descriptor discriminator, pinned separately ──
// Task 7 moved loadPlaces's spine/mirror discriminator from a hard-coded
// zoneRoot onto `spine.sheet.subjects`. That turned ONE condition into three
// cases with three different correct answers, and none of them had a test.
//
// Plan D Task 11: the discriminator is GONE — loadPlaces no longer reads a
// spine at all — so the two "falls back" branches below were deleted with it.
// The unresolvable-zoneRoot REPORT (the corruption case) stays pinned from
// resolveWorld's side further down this file.

test("resolveWorld REPORTS an array descriptor by shape, not by array index", () => {
  // `typeof [] === "object"`, so an array used to slip past the shape guard
  // and be diagnosed one key at a time as though it were a descriptor object.
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: [] });
  assert.equal(doc, null);
  assert.deepEqual(problems, ["resolveWorld: descriptor is not an object"]);
});

// ── the contract in the direction that matters: doc null => problems non-empty ──
// The suite above pins the converse (never a doc WITH problems). This half is
// the one Task 6 leans on: all three gate joins `return 0` on a null doc, so a
// null doc carrying ZERO problems is a gate that stopped checking while still
// exiting 0.

test("loadPlaces REPORTS a resolved file that parses to a non-object — never silently", () => {
  // Plan D Task 11: a file holding literal `null` (or an array, or a bare
  // scalar) PARSES fine; without the shape guard it would be skipped without
  // a word and its records would silently vanish from every join. The doc may
  // still carry the OTHER continents' records (graceful degradation), but the
  // problem is always reported — placesDoc() turns it into a FAIL.
  for (const body of ["null", "[]", "123", '"hi"', "true"]) {
    const dir = mkdtempSync(join(tmpdir(), "places-shape-"));
    try {
      mkdirSync(join(dir, "world/resolved"), { recursive: true });
      writeFileSync(join(dir, "world/resolved/continent-02.json"), body);
      const { problems } = loadPlaces({ contentRoot: dir });
      assert.equal(problems.length, 1, `resolved body ${body}: ${JSON.stringify(problems)}`);
      assert.match(problems[0], /shape-invalid/, problems[0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("resolveWorld REPORTS a non-array spine.edges, never throws", () => {
  // loadSpine only applies `?? []` to a null/absent edges.json, so an
  // edges.json holding {"edges": []} reaches the three .filter() calls.
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine: { ...spine, edges: { edges: [] } }, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("spine.edges")), JSON.stringify(problems));
});

test("resolveWorld REPORTS a tree that is not a built tree, never throws", () => {
  const { spine } = realTree();
  for (const tree of [null, {}, { byId: {}, childrenOf: {} }]) {
    const { doc, problems } = resolveWorld({ spine, tree });
    assert.equal(doc, null);
    assert.ok(problems.some((p) => p.includes("tree")), JSON.stringify(problems));
  }
});

// ── the three gate joins must still COUNT, not merely exit 0 ───────────────
// All three call sites `return 0` when the geography load fails, so a botched
// re-home silently disables the gate rather than failing it. These assert the
// printed record counts, which is the only signal that the join still joined.

function runFullGate(contentRoot) {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [join(ROOT, "scripts/check_content.mjs"), "--content-root", contentRoot],
      { encoding: "utf8" }) };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

// ERRATUM vs plan Task 11 Step 1 ("THE COUNTING ASSERTION", asserting exit 0
// with placements/zones/towns all > 0 on the real root): UNSATISFIABLE until
// Plan E movement 2 re-homes the committed records onto the new region ids.
// The cutover makes content/world/resolved/ the only join source; its zone
// ids are the generated region ids (c01/r01…), while the ten committed
// content/zones records, the bestiary placement file and town-millcross.json
// still swear to the LEGACY basin slugs — so every one of those records is
// now a NAMED orphan FAIL, and Z2 names every geography zone without a
// record. That is the gate failing LOUDLY, which is exactly what this task
// exists to guarantee; what must never happen is the silent zeroing below.
// The counting half of the plan's acceptance test lives in
// scripts/tests/{zone-content,town-plan,bestiary-placement}.test.mjs, whose
// fixture roots now carry their geography in the resolved shape and whose
// gates still count.
test("gate joins: the real content root is clean — the one remaining legacy join is a ruled exemption, not a silent zero", () => {
  const r = runFullGate(CONTENT);
  // PLAN E TASK 9 re-homed the ten content/zones records onto fabric region
  // ids, so the ZONE half of this pin is the join claim: the records join.
  // PLAN E TASK 14 re-homed town-millcross.json onto the pinned civil town id
  // `c-town-millcross`. R-B (owner ruling, 2026-08-29; Task 15/F-051
  // completion Task 1) closed the last one: bestiary/placement-thornveil.json
  // cannot be re-homed by any content edit (bestiary-placement.schema.json
  // pins `zone` to ^[a-z0-9]+(-[a-z0-9]+)*$, which no `cNN/rNN` region id can
  // match), so the join is ruled VOID for bestiary purposes instead — a
  // committed, reasoned exemption (content/bestiary/region-exemptions.json),
  // not a loosened schema and not a silenced check. The gate now exits 0.
  //
  // The assertions are FILE-QUALIFIED for a reason found here: the old
  // unqualified /zone "thornveil" not in …#zones/ once matched two different
  // gates at once (the zone-content join AND the bestiary placement join), so
  // a narrower fix to one could leave the assertion green for the wrong
  // reason. Kept file-qualified so a regression in either gate is unambiguous.
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^FAIL\s+zones\/zone-.*not in content\/world\/resolved#zones/m);
  assert.doesNotMatch(r.out, /^FAIL\s+bestiary\/placement-thornveil\.json/m);
  assert.match(r.out, /^WARN {2}bestiary\/placement-thornveil\.json: zone "thornveil" not in content\/world\/resolved#zones — ruled void by content\/bestiary\/region-exemptions\.json \(R-B\)/m);
  assert.doesNotMatch(r.out, /towns\/town-millcross\.json: town ".*" not in content\/world\/resolved#towns/);
  // finish() ran — the summary is printed, nothing went dark.
  assert.match(r.out, /content-gate: .* failures/, r.out);
});

// ── the no-throw contract, at the shape level ──────────────────────────────
// The existing "never throws" tests all break a subject's EXISTENCE, which the
// validation block guards. None of them broke a resolved node's SHAPE, which
// nothing guarded — so `resolveWorld` threw a raw TypeError on a node that
// loadSpine accepts. From Task 6 that throw lands inside check_content.mjs and
// skips finish(), taking every FAIL and the summary line with it.

test("the gate REPORTS a corrupt resolved file instead of dying without printing", () => {
  // The whole point: a throw here is not just an ugly failure, it is a gate
  // that stops checking. Assert the two things a throw destroys — a FAIL line,
  // and the `content-gate:` summary that only finish() prints.
  // Plan D Task 11: the geography source is content/world/resolved/, so the
  // corruption injected here is a continent file that cannot PARSE (the
  // spine-shape throw this test used to exercise died with loadPlaces' spine
  // branch; resolveWorld's own never-throw wrapper stays pinned above).
  const dir = mkdtempSync(join(tmpdir(), "places-shape-"));
  try {
    cpSync(CONTENT, join(dir, "content"), { recursive: true });
    writeFileSync(join(dir, "content/world/resolved/continent-02.json"), "{ not json");

    const r = runFullGate(join(dir, "content"));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}geography: places: world\/resolved\/continent-02\.json:/, r.out);
    assert.match(r.out, /content-gate: .* failures, .* warnings/, r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the gate FAILS rather than zeroing its counts when the document is null (Risk A2)", () => {
  // Plan Step 8(a): "confirm the gate FAILS rather than exiting 0 with zeroed
  // counts". A null document is the one input that zeroes every count — all
  // three joins `return 0` on it — so it must never be reachable without a
  // FAIL. Exercised through a root with NO content/world/ at all: since the
  // Plan D Task 11 cutover this is the only route to a null doc, and the
  // problem must name the resolved dir — the cutover's own mutation test.
  const dir = mkdtempSync(join(tmpdir(), "places-null-"));
  try {
    cpSync(CONTENT, join(dir, "content"), { recursive: true });
    rmSync(join(dir, "content/world"), { recursive: true, force: true });

    const r = runFullGate(join(dir, "content"));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}geography: places: .*world\/resolved\/ holds no continent files/, r.out);
    // finish() still ran — loudly, not silently. The risk this pins is a null
    // document that zeroes every count while the gate LOOKS GREEN, so the
    // load-bearing halves are the exit code above and the non-zero failure
    // count here; the individual zeros are evidence, not the contract.
    assert.match(r.out, /content-gate: .* [1-9]\d* failures/, r.out);
    // The town join really did go dark on the null document.
    assert.match(r.out, /content-gate: .* 0 towns,/, r.out);
    // PLAN E TASK 9 REVIEW (MAJOR 1): the ZONE count is NON-ZERO here, and that
    // is the fix rather than a regression. checkZoneContent used to return 0
    // from the WHOLE function on a null document, which took Z3/Z4/Z5/Z7 —
    // intra-record rules needing no geography at all — down with the two join
    // rules; a defective record on this very root printed nothing. Every record
    // is read and checked now, and only Z1/Z2 go dark.
    //
    // TASK 11: this was an exact literal `10 zones`, and Task 11 writing six
    // more records turned it red — a count literal describing the corpus rather
    // than the rule. It is DERIVED from the directory now, which keeps the whole
    // anti-bail property (a re-bail returns 0, and 0 never equals the number of
    // files on disk) while not needing an edit per record. Not a widening: the
    // expected number is computed independently of the gate's own output.
    const onDisk = readdirSync(join(dir, "content/zones")).filter((f) => /^zone-.+\.json$/.test(f)).length;
    assert.ok(onDisk >= 16, `only ${onDisk} zone records — the corpus shrank`);
    assert.match(r.out, new RegExp(`content-gate: .* ${onDisk} zones, 0 towns,`), r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Task 7: the descriptor, and the two silent filters it kills ────────────
// The subject ids were spelled into code (DEFAULT_SUBJECTS). Two filters made
// that worse than a hard-coded list: `n.lore?.order != null` SILENTLY DROPPED
// any region without the field, and a two-element id exclusion was typed in
// literally. Scaled to 160 regions, the first is how a region ceases to exist
// with every gate green.

// The descriptor the basin sheet was drawn from BEFORE ruling 8, kept here
// rather than in committed data. Its five subject ids name nothing the redrawn
// trunk hosts, so leaving them in content/spine/sheet.json would have been a
// descriptor that reads as live and resolves to nothing — and resolveWorld's
// per-subject diagnoses (the two tests below) are the only thing that still
// needs them. Task 8 rebuilds the sheet resolved-backed and re-authors the
// descriptor from the resolved doc's own keys (coastline, river, saltmire,
// iceEdge, terrainPatches); this constant is the record of what it replaces.
const RETIRED_BASIN_SUBJECTS = Object.freeze({
  rootId: "n-atlas",
  zoneRoot: "n-cluster1",
  landIds: ["n-cluster1"],
  seaIds: ["n-westsea"],
  terrainPatchIds: ["n-eastern-hills"],
  mireIds: ["n-saltmire"],
  featureIds: { coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge" },
});

test("the subject descriptor lives in content/spine/sheet.json, not in code", () => {
  const sheet = JSON.parse(readFileSync(join(CONTENT, "spine/sheet.json"), "utf8"));
  assert.ok(sheet.subjects, "content/spine/sheet.json has no `subjects` block");
  assert.equal(sheet.subjects.rootId, "n-atlas");
  assert.equal(sheet.subjects.zoneRoot, "n-cluster1");
  assert.deepEqual(sheet.subjects.landIds, ["n-cluster1"]);
  assert.deepEqual(sheet.subjects.seaIds, ["n-westsea"]);
  // RULING 8's tail: the three basin-subject keys are RETIRED from the
  // committed descriptor, not merely stale. Pinned as absent so re-adding one
  // has to come through this test — which is the point at which Task 8 owes
  // real coverage, not a dead id.
  for (const k of ["terrainPatchIds", "mireIds", "featureIds"])
    assert.equal(sheet.subjects[k], undefined,
      `subjects.${k} is back in content/spine/sheet.json — ruling 8 retired it; has Task 8 landed?`);
});

test("resolveWorld with a descriptor naming a node that does not exist REPORTS with the pinned message", () => {
  const { spine, tree } = realTree();
  // Spreads the RETIRED descriptor, not the committed one: the diagnosis under
  // test lives past the shape guard, and the committed descriptor no longer
  // carries the three keys that guard requires.
  const bad = { ...RETIRED_BASIN_SUBJECTS, mireIds: ["n-not-a-node"] };
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: bad });
  assert.equal(doc, null);
  assert.ok(problems.includes('sheet: subject "mireIds[0]" -> "n-not-a-node" does not resolve'), JSON.stringify(problems));
});

test("resolveWorld with a descriptor naming a feature that does not exist REPORTS", () => {
  const { spine, tree } = realTree();
  const bad = { ...RETIRED_BASIN_SUBJECTS,
    featureIds: { ...RETIRED_BASIN_SUBJECTS.featureIds, river: "f-nope" } };
  const { problems } = resolveWorld({ spine, tree, descriptor: bad });
  assert.ok(problems.includes('sheet: subject "river" -> "f-nope" does not resolve'), JSON.stringify(problems));
});

test("the DEFAULT_SUBJECTS constant is gone — the descriptor is the only source", async () => {
  const mod = await import("../lib/places.mjs");
  assert.equal(mod.DEFAULT_SUBJECTS, undefined,
    "DEFAULT_SUBJECTS still exists: two sources of subject ids means two ways for a sheet to break");
});

test("places.mjs names no spine id in its source — every id comes from the descriptor", () => {
  // Acceptance criterion 12, this adapter's half. `DEFAULT_SUBJECTS is gone`
  // above only pins the export NAME; this pins the property the criterion is
  // actually about, so re-spelling the same ids under a different constant
  // (or inline at a call site) still goes red.
  //
  // Scope, stated so the test does not overclaim: it matches QUOTED spine ids
  // (n-… / f-…). One spine-id-shaped token survives deliberately and is not a
  // quoted id — the /^f-tower-\d/ regex in the relay assembly — because it
  // names a FAMILY of features, not one id; moving that is Plan B's job.
  const src = readFileSync(join(ROOT, "scripts/lib/places.mjs"), "utf8");
  const hits = src.match(/["'`](n|f)-[a-z0-9-]+["'`]/g) ?? [];
  assert.deepEqual(hits, [],
    `places.mjs still spells spine ids in code: ${hits.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Plan A Task 12 Step 1 — the proof that precedes the deletion.
// ---------------------------------------------------------------------------
//
// SCOPE, stated because a grep's scope IS its coverage claim. This sweeps the
// EXECUTABLE surface only — .mjs/.js/.cjs/.ts/.sh/.yml/.yaml/.html. A `source`
// string in content/spine/nodes/n-saltmire.json, a `note` in
// game-client/assets/art/art-manifest.json, a row in content/story/canon.md and
// the description in content/schemas/town-plan.schema.json all name the mirror
// too, and all of them are PROSE: a JSON data field cannot open a file, so
// deleting the mirror cannot break them. Only code can read a path, so only
// code is swept.
//
// THE PLAN'S OWN ALLOWLIST WAS WRONG, and this is enumeration defect #4 of this
// plan (flagged, not absorbed). It listed 14 paths and omitted THREE REAL READS
// in two files the plan never mentions:
//   scripts/tests/season1.test.mjs:183  — a MODULE-LEVEL readFileSync of the
//       mirror. Deleting the file would have thrown at import and reddened
//       that entire suite, not one test.
//   scripts/tests/season1.test.mjs:301  — copies the mirror into a fixture root.
//   scripts/tests/town-millcross.test.mjs:237 — reads it for the town anchor.
// All three were re-pointed at loadPlaces()/resolveWorld() in this same commit,
// which is what makes the claim below true rather than aspirational.
const MIRROR_NAMERS = new Set([
  // The fallback branch, and its own tests.
  "scripts/lib/places.mjs",
  "scripts/tests/places.test.mjs",
  // Fixture roots that WRITE their own geography fixture. Plan D Task 11
  // migrated zone-content and bestiary-placement onto the resolved shape, so
  // neither names the legacy mirror any more — the stale-entry test below
  // removed their entries with the same commit. town-plan.test.mjs was
  // migrated in the same commit.
  "scripts/tests/zone-content.test.mjs",
  "scripts/tests/season1.test.mjs",
  // Comments and verbatim gate messages only — no path is opened.
  "scripts/check_content.mjs",             // "…not in cluster1-geography.json#zones"
  "scripts/lib/season1.mjs",
  // basin-sheet.mjs names the mirror in the sheet's own <desc> and footer.
  // Those strings used to be DRAWN BYTES inside a committed SVG, which is why
  // correcting them was deferred; Plan E ruling 8 retired that sheet and its
  // bytes, so the lib is now dormant source awaiting Task 8's resolved-backed
  // rebuild and the strings draw nothing. Its test file was deleted with the
  // sheet — this allowlist test is what caught the stale entry.
  "tools/mapforge/lib/basin-sheet.mjs",
  "scripts/tests/spine-gates.test.mjs",
  "scripts/tests/town-millcross.test.mjs", // canon provenance in comments
  // Plan D Task 11: the cutover's own test file — its comments and the
  // fallback-gone source scan name the legacy mirror; nothing opens a path.
  "scripts/tests/resolve.test.mjs",
]);

const CODE_GLOBS = ["*.mjs", "*.js", "*.cjs", "*.ts", "*.sh", "*.yml", "*.yaml", "*.html"];

function codeFilesNamingTheMirror() {
  // `git grep -l` exits 1 with no output when nothing matches — that is the
  // post-deletion end state, not an error, so it must not throw.
  let out;
  try {
    out = execFileSync("git", ["grep", "-l", "cluster1-geography", "--", ...CODE_GLOBS],
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    if (e.status === 1 && !e.stdout) return [];
    throw e;
  }
  return out.split("\n").filter(Boolean).sort();
}

test("STEP 5 PROOF: no executable file outside the allowlist names the legacy mirror", () => {
  const unexpected = codeFilesNamingTheMirror().filter((p) => !MIRROR_NAMERS.has(p));
  assert.deepEqual(unexpected, [],
    "an unlisted executable file still names content/maps/cluster1-geography.json — " +
    "deleting the mirror would break it. Re-point it at scripts/lib/places.mjs, " +
    "then add it here with the reason it is safe.");
});

test("the mirror allowlist has no stale entries — a deleted reader must leave it", () => {
  // Without this the list rots into a permission slip: Task 12's deletion
  // removes three of the entries above, and an allowlist that still names them
  // would silently re-admit a file resurrected under the same path.
  const live = new Set(codeFilesNamingTheMirror());
  const stale = [...MIRROR_NAMERS].filter((p) => !live.has(p)).sort();
  assert.deepEqual(stale, [],
    "these allowlist entries no longer name the mirror; delete them from MIRROR_NAMERS");
});
