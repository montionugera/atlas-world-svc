// Plan A Task 5 — scripts/lib/places.mjs.
//
// The ONE assertion that matters is byte-identity: canonStringify over
// resolveWorld's doc must equal, EXACTLY, the bytes the retired
// content/maps/cluster1-geography.json held. Everything downstream (three gate
// joins, two sheet builders) is only safe to re-point because of it, and key
// ORDER is half of it — canonStringify walks Object.keys() in insertion order.
// Task 12 deleted that file; the comparison now runs against the committed
// sha256 of its bytes (RESOLVED_WORLD_SHA256 below), not a re-baseline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, buildTree } from "../lib/spine.mjs";
import { canonStringify } from "../check_spine_emit.mjs";
import { WORLD_DOC_KEYS, resolveWorld, loadPlaces } from "../lib/places.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(ROOT, "content");
// Plan A Task 12: content/maps/cluster1-geography.json is DELETED, so the
// byte-identity proof below has no file to point at. The proof is not weakened
// — it is re-anchored on a committed sha256 of the EXACT bytes that file held,
// the same instrument the sheets moved to in content/world/render-lock.json.
// This hash is NOT a re-baseline: it was taken from the deleted blob
// (`git show <proof-commit>:content/maps/cluster1-geography.json | shasum -a 256`)
// and independently from a fresh resolveWorld() run, and the two agreed. Only
// Plan E's redraw commit may ever move it.
const RESOLVED_WORLD_SHA256 =
  "ce60b7841e7a0a2626df4cad599d0f51ddbe69b6c82e19336c09c4dd2070bd2f";

/** Assert a resolved doc serialises to the exact bytes the retired mirror held. */
function assertResolvedBytes(doc, what) {
  const bytes = canonStringify(doc) + "\n";
  // Buffer.byteLength, NOT String.length. The world document's prose carries
  // 84 non-ASCII characters (39 §, 25 —, 9 →, 8 –, 2 ·, 1 ÷), which cost
  // exactly 126 extra UTF-8 bytes, so the two counts disagree: the retired blob
  // was 26,547 BYTES and 26,421 UTF-16 code units. Printing the string length
  // under the word "bytes" is how commit 9cd227c's body came to record 26,421
  // for a 26,547-byte file. The sha256 above hashes the same UTF-8 encoding
  // this now counts, so the two numbers finally describe one thing.
  assert.equal(
    createHash("sha256").update(bytes, "utf8").digest("hex"),
    RESOLVED_WORLD_SHA256,
    `${what}: serialised world drifted from the retired mirror's bytes (${Buffer.byteLength(bytes, "utf8")} bytes)`,
  );
}

function realTree() {
  const spine = loadSpine({ contentRoot: CONTENT });
  return { spine, tree: buildTree({ nodes: spine.nodes, rootIds: spine.roots }) };
}

test("resolveWorld reproduces the committed mirror BYTE for BYTE", () => {
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.deepEqual(problems, []);
  assertResolvedBytes(doc, "resolveWorld");
});

test("resolveWorld builds the doc in the pinned key order", () => {
  const { spine, tree } = realTree();
  const { doc } = resolveWorld({ spine, tree });
  assert.deepEqual(Object.keys(doc), WORLD_DOC_KEYS);
  assert.equal(WORLD_DOC_KEYS.length, 19);
});

test("resolveWorld REPORTS a missing subject node, never throws (the C2 TypeError)", () => {
  const { spine, tree } = realTree();
  tree.byId.delete("n-saltmire");
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(
    problems.some((p) => p.includes("n-saltmire")),
    `expected a problem naming n-saltmire, got ${JSON.stringify(problems)}`,
  );
});

test("resolveWorld REPORTS a missing subject feature, never throws", () => {
  const { spine, tree } = realTree();
  const cluster = tree.byId.get("n-cluster1");
  tree.byId.set("n-cluster1", { ...cluster, features: cluster.features.filter((f) => f.id !== "f-west-coast") });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("f-west-coast")), JSON.stringify(problems));
});

test("resolveWorld REPORTS a missing zoneRoot without a cascade of feature problems", () => {
  const { spine, tree } = realTree();
  tree.byId.delete("n-cluster1");
  const { doc, problems } = resolveWorld({ spine, tree });
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

test("resolveWorld never returns a doc alongside problems (the seaLane late-push path)", () => {
  // seaLane is the ONLY subject resolved during doc construction, i.e. after
  // the early return. A half-built doc escaping with problems attached would
  // be re-pointed straight into two sheet builders in Task 6.
  const { spine, tree } = realTree();
  const noLane = { ...spine, edges: spine.edges.filter((e) => e.kind !== "sealane") };
  const { doc, problems } = resolveWorld({ spine: noLane, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("sealane")), JSON.stringify(problems));
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

test("resolveWorld REPORTS a zoneRoot whose lore.relay / lore.distances retired", () => {
  // THE SILENT LOSS THIS GUARD EXISTS FOR. `doc.relay` and `doc.distances`
  // spread `C.lore.relay` and `C.lore.distances`, and `{ ...undefined }` is
  // `{}` — no throw, no key, no signal. Plan C regenerates n-cluster1's node
  // body, so both objects retire with it (they are where its two
  // AMENDED-PENDING markers live, which the plan's handoff says must NOT
  // survive the promotion). Measured before this guard: the sheet still
  // rendered, and its walking-table footnote read "a travel-hour is about
  // undefined km of road" while the relay panel lost its note, spacing, owner,
  // derivation and withheld prose.
  //
  // Carrying the two objects forward was considered and REJECTED: their prose
  // describes the retired cluster-1 world (a 190 km ridge-line, 27 towers, and
  // the Gildmark -> Embervale -> Millcross -> Rooktide spine, three of whose
  // four towns the redraw deletes), so re-asserting it on the generated node
  // would be a fresh canon contradiction as well as a smuggled marker. The
  // loss is correct; only its silence was not.
  //
  // Plan D Task 11: exercised through resolveWorld directly now — loadPlaces
  // no longer reads a spine, so a spine-copy fixture root cannot reach this
  // path through it any more.
  const { spine, tree } = realTree();
  tree.byId.set("n-cluster1", { ...tree.byId.get("n-cluster1"),
                                lore: { summary: "a generated structural idea" } });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null, "a doc must never be returned alongside problems");
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(problems[0], /no lore\.relay/);
  assert.match(problems[1], /no lore\.distances/);
  for (const p of problems) assert.match(p, /SILENTLY/);
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

test("the emitted document's subject ids FOLLOW the descriptor — they are not literals", () => {
  // Acceptance criterion 12, the half the source-grep above cannot see. The
  // grep matches QUOTED `n-`/`f-` ids; five ids lived in this file in their
  // STRIPPED form ("west-coast", "the-meltwash", "the-saltmire",
  // "northern-ice-edge", "eastern-hills") and were invisible to it, so the
  // descriptor could be re-pointed at another node and the document would
  // still carry the old subject's id. Behavioural pin: swap the mire subject
  // and the emitted id must move with it.
  const { spine, tree } = realTree();
  const S = spine.sheet.subjects;
  // Every one of the five is re-pointed, so every one of the five assertions
  // below fails if its literal comes back. Swapping (rather than inventing an
  // id) keeps the same node/feature set, so the zone list stays 10 and nothing
  // else in the document moves.
  const swapped = {
    ...S,
    mireIds: [...S.terrainPatchIds],
    terrainPatchIds: [...S.mireIds],
    // a 3-CYCLE, not a pairwise swap: with only two of the three moved, the
    // third id would still equal its literal and that literal would survive
    // the mutation test. Verified by mutation — all five go red.
    featureIds: { coast: S.featureIds.river, river: S.featureIds.iceEdge, iceEdge: S.featureIds.coast },
  };
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: swapped });
  assert.deepEqual(problems, []);
  const stripId = (id) => tree.byId.get(id).lore?.geoId ?? id.slice(2);
  assert.equal(doc.saltmire.id, stripId(swapped.mireIds[0]));
  assert.equal(doc.terrainPatches[0].id, stripId(swapped.terrainPatchIds[0]));
  assert.equal(doc.coastline.id, swapped.featureIds.coast.slice(2));
  assert.equal(doc.river.id, swapped.featureIds.river.slice(2));
  assert.equal(doc.iceEdge.id, swapped.featureIds.iceEdge.slice(2));
  // and none of them kept the id the un-swapped descriptor would have given
  assert.notEqual(doc.saltmire.id, stripId(S.mireIds[0]));
  assert.notEqual(doc.terrainPatches[0].id, stripId(S.terrainPatchIds[0]));
  assert.notEqual(doc.coastline.id, S.featureIds.coast.slice(2));
  assert.notEqual(doc.river.id, S.featureIds.river.slice(2));
  assert.notEqual(doc.iceEdge.id, S.featureIds.iceEdge.slice(2));
  assert.equal(doc.zones.length, 10);
});

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

test("resolveWorld REPORTS a partial descriptor, never throws (the Task 7 sheet.json path)", () => {
  const { spine, tree } = realTree();
  const full = {
    rootId: "n-atlas", zoneRoot: "n-cluster1", landIds: ["n-cluster1"], seaIds: ["n-westsea"],
    terrainPatchIds: ["n-eastern-hills"], mireIds: ["n-saltmire"],
    featureIds: { coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge" },
  };
  // The full descriptor must still resolve — the guard may not reject the
  // shape Task 7 is about to commit into content/spine/sheet.json.
  const ok = resolveWorld({ spine, tree, descriptor: full });
  assert.deepEqual(ok.problems, []);
  assertResolvedBytes(ok.doc, "resolveWorld");

  for (const key of ["zoneRoot", "featureIds", "mireIds", "terrainPatchIds"]) {
    const partial = { ...full };
    delete partial[key];
    const { doc, problems } = resolveWorld({ spine, tree, descriptor: partial });
    assert.equal(doc, null, `descriptor without ${key} produced a doc`);
    assert.ok(problems.some((p) => p.includes(key)), `${key}: ${JSON.stringify(problems)}`);
  }
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: { ...full, featureIds: { coast: "f-west-coast" } } });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("featureIds.river")), JSON.stringify(problems));
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
test("gate joins: the real content root FAILS LOUDLY on the not-yet-rehomed legacy records", () => {
  const r = runFullGate(CONTENT);
  assert.equal(r.code, 1);
  assert.match(r.out, /zone "thornveil" not in content\/world\/resolved#zones/);
  assert.match(r.out, /town "millcross" not in content\/world\/resolved#towns/);
  // finish() ran — the summary is printed, nothing went dark.
  assert.match(r.out, /content-gate: .* failures/, r.out);
});

// ── the no-throw contract, at the shape level ──────────────────────────────
// The existing "never throws" tests all break a subject's EXISTENCE, which the
// validation block guards. None of them broke a resolved node's SHAPE, which
// nothing guarded — so `resolveWorld` threw a raw TypeError on a node that
// loadSpine accepts. From Task 6 that throw lands inside check_content.mjs and
// skips finish(), taking every FAIL and the summary line with it.

test("resolveWorld REPORTS a node missing an optional block, never throws", () => {
  const { spine, tree } = realTree();
  // n-saltmire loads clean without `lore`; the assembly reads salt.lore.note.
  tree.byId.set("n-saltmire", { ...tree.byId.get("n-saltmire"), lore: undefined });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /^resolveWorld: threw while assembling the world document/, problems[0]);
});

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
    // finish() still ran — the counts are zeroed, but loudly, not silently.
    assert.match(r.out, /content-gate: .* 0 zones, 0 towns, .* [1-9]\d* failures/, r.out);
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

test("the subject descriptor lives in content/spine/sheet.json, not in code", () => {
  const sheet = JSON.parse(readFileSync(join(CONTENT, "spine/sheet.json"), "utf8"));
  assert.ok(sheet.subjects, "content/spine/sheet.json has no `subjects` block");
  assert.equal(sheet.subjects.rootId, "n-atlas");
  assert.equal(sheet.subjects.zoneRoot, "n-cluster1");
  assert.deepEqual(sheet.subjects.landIds, ["n-cluster1"]);
  assert.deepEqual(sheet.subjects.seaIds, ["n-westsea"]);
  assert.deepEqual(sheet.subjects.terrainPatchIds, ["n-eastern-hills"]);
  assert.deepEqual(sheet.subjects.mireIds, ["n-saltmire"]);
  assert.deepEqual(sheet.subjects.featureIds, {
    coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge",
  });
});

test("resolveWorld reads subjects from the descriptor and still reproduces the mirror", () => {
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: spine.sheet.subjects });
  assert.deepEqual(problems, []);
  assertResolvedBytes(doc, "resolveWorld");
});

test("resolveWorld with a descriptor naming a node that does not exist REPORTS with the pinned message", () => {
  const { spine, tree } = realTree();
  const bad = { ...spine.sheet.subjects, mireIds: ["n-not-a-node"] };
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: bad });
  assert.equal(doc, null);
  assert.ok(problems.includes('sheet: subject "mireIds[0]" -> "n-not-a-node" does not resolve'), JSON.stringify(problems));
});

test("resolveWorld with a descriptor naming a feature that does not exist REPORTS", () => {
  const { spine, tree } = realTree();
  const bad = { ...spine.sheet.subjects, featureIds: { ...spine.sheet.subjects.featureIds, river: "f-nope" } };
  const { problems } = resolveWorld({ spine, tree, descriptor: bad });
  assert.ok(problems.includes('sheet: subject "river" -> "f-nope" does not resolve'), JSON.stringify(problems));
});

test("R3: a region under zoneRoot with NO lore.order now FAILS instead of vanishing", () => {
  const { spine, tree } = realTree();
  // The mire and the terrain patch are region-tier children that are NOT
  // zones, and neither carries a lore.order — so the rule is scoped by the
  // descriptor's own exclusion, not by a null check. Pick a victim that IS a
  // zone.
  const S = spine.sheet.subjects;
  const notAZone = new Set([...S.mireIds, ...S.terrainPatchIds]);
  const victim = (tree.childrenOf.get(S.zoneRoot) ?? [])
    .map((i) => tree.byId.get(i))
    .find((n) => n.tier === "region" && !notAZone.has(n.id));
  assert.ok(victim, "no eligible region found in the committed spine");
  tree.byId.set(victim.id, { ...victim, lore: { ...victim.lore, order: undefined } });
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: S });
  assert.equal(doc, null);
  assert.ok(
    problems.some((p) => p.includes(victim.id) && p.includes("lore.order")),
    `expected a lore.order problem naming ${victim.id}, got ${JSON.stringify(problems)}`,
  );
});

test("R3 is scoped: the descriptor's own mire and terrain patch are exempt", () => {
  // The counterpart of the test above, and the one that keeps the rule honest:
  // n-saltmire and n-eastern-hills are region-tier children of the zoneRoot
  // that carry NO lore.order in the committed spine. A rule that demanded one
  // from every region child would go red on content that is correct.
  const { spine, tree } = realTree();
  const S = spine.sheet.subjects;
  for (const id of [...S.mireIds, ...S.terrainPatchIds]) {
    const n = tree.byId.get(id);
    assert.equal(n.tier, "region", `${id} is not a region child — the exemption is testing nothing`);
    assert.equal(n.lore?.order, undefined, `${id} now carries a lore.order — the exemption is testing nothing`);
  }
  const { problems } = resolveWorld({ spine, tree, descriptor: S });
  assert.deepEqual(problems, []);
});

test("the emitted zones array is exactly the region children minus the descriptor's non-zones", () => {
  const { spine, tree } = realTree();
  const S = spine.sheet.subjects;
  const kids = (tree.childrenOf.get(S.zoneRoot) ?? []).map((i) => tree.byId.get(i));
  const regionKids = kids.filter((n) => n.tier === "region");
  const { doc } = resolveWorld({ spine, tree, descriptor: S });
  assert.equal(regionKids.length, 12);
  assert.equal(doc.zones.length, regionKids.length - S.mireIds.length - S.terrainPatchIds.length);
  assert.equal(doc.zones.length, 10);
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
  // basin-sheet.mjs names the mirror in the sheet's own <desc> and footer —
  // those strings are DRAWN BYTES inside the committed SVG, so correcting them
  // would move pixels and red the render lock. They belong to Plan B Task 12,
  // the one commit permitted to re-baseline the lock and the two sheets.
  "tools/mapforge/lib/basin-sheet.mjs",
  "tools/mapforge/tests/basin-sheet.test.mjs",
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
