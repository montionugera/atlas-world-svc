// Plan D — the world loader and the binding gates.
//
// Fixture discipline is copied verbatim from spine-gates.test.mjs: a `base`
// dir holding a complete green world, plus one overlay dir per red case that
// is copied OVER the base. That is what keeps a red test one file long and
// makes "which rule fired" unambiguous.
//
// The fixture lives under fixtures/world-d/, NOT fixtures/world/base/: Plan
// B/C's world-gates.test.mjs already owns that directory (its worldFixture
// copies it verbatim and pins its manifest and budgets to the committed ones,
// asserting e.g. `fabric 0 files`), so landing a miniature fabric beside it
// would redden their suite rather than ours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync, statSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCivil, gBind, gPinSat, gHandleBand, BANNED_COORDINATE_KEYS,
  resolveCivil, RESOLVED_KEYS, gZoneOrder,
  gBand, LEVEL_RINGS, ringOfDistance, STARTER_CAPITAL,
} from "../lib/resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "scripts/tests/fixtures/world-d");
const GATE = join(ROOT, "scripts/check_content.mjs");

export function worldFixture({ overlayDir = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "world-fix-"));
  cpSync(join(FIX, "base"), dir, { recursive: true });
  if (overlayDir) cpSync(join(FIX, overlayDir), dir, { recursive: true });
  return dir;
}

export function runWorldGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("loadCivil reads two continents, three families and the lexicon", () => {
  const w = loadCivil({ contentRoot: worldFixture() });
  assert.equal(w.present, true);
  assert.deepEqual(w.errors, []);
  assert.deepEqual(Object.keys(w.fabric).sort(), ["c02", "c10"]);
  assert.equal(w.handles.size, 5);
  assert.equal(w.pinned.length, 1);
  assert.equal(w.bound.length, 1);
  assert.equal(w.relations.length, 1);
  assert.equal(w.lexicon.get("karst-cenote").dungeonCapable, true);
});

test("loadCivil soft-skips a content root with no world/ and records NO error", () => {
  const w = loadCivil({ contentRoot: join(ROOT, "scripts/tests/fixtures/spine/base") });
  assert.equal(w.present, false);
  assert.deepEqual(w.errors, []);
});

test("the banned coordinate keys are exactly the four the design names", () => {
  assert.deepEqual([...BANNED_COORDINATE_KEYS], ["at", "points", "rect", "anchor"]);
});

test("G-BIND is silent on the green fixture", () => {
  assert.deepEqual(gBind({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-BIND red: a bound record carrying a coordinate key, at any depth", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-coordinate" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: world\/civil\/bound\/c-lm-the-drowned-stair\.json carries key "at" — bound records hold meaning, never coordinates$/);
});

test("G-BIND red: two records claiming one handle", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-shared-handle" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: handle "c02\/karst\/h-0f42" is claimed by 2 records: c-lm-the-drowned-stair, c-lm-the-second-stair$/);
});

test("G-BIND red: a handle no ledger carries", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-dangling-handle" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: c-lm-the-drowned-stair handle "c02\/karst\/h-dead" does not resolve in any ledger$/);
});

test("G-BIND's output order is deterministic when one record breaks two rules", () => {
  // The problems are printed into a gate log that gets diffed, so the order is
  // part of the contract: per record, the banned-key line precedes the handle
  // lines, and records iterate in sorted-filename order.
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-multi" }) }) });
  assert.deepEqual(p, [
    `G-BIND: world/civil/bound/c-lm-the-drowned-stair.json carries key "at" — bound records hold meaning, never coordinates`,
    `G-BIND: c-lm-the-drowned-stair handle "c02/karst/h-dead" does not resolve in any ledger`,
  ]);
});

test("the gate wires G-BIND into --only=spine and still exits 0 on the green world", () => {
  const r = runWorldGate(worldFixture());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /world-civil: 1 pinned, 1 bound, 1 relations, 5 handles/);
});

test("the gate goes red, with the exact message, on the coordinate overlay", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-bind-coordinate" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL {2}G-BIND: .*carries key "at"/);
});

test("a content root with no world\\/ dir stays green and prints no world-civil line", () => {
  const r = runWorldGate(join(ROOT, "scripts/tests/fixtures/spine/base"));
  assert.doesNotMatch(r.out, /world-civil:/);
});

// ---------------------------------------------------------------------------
// Task 4 — the 41 pinned places: premise/roster divergence guards + G-PIN-SAT.

const PREMISE_DIR = join(ROOT, "content/world/premises");
const ROSTER = join(ROOT, "content/world/civil/pinned-roster.json");

function premises() {
  return Object.fromEntries(readdirSync(PREMISE_DIR).filter((f) => f.endsWith(".json")).sort()
    .map((f) => { const d = JSON.parse(readFileSync(join(PREMISE_DIR, f), "utf8")); return [d.id, d]; }));
}

// Basin-local means n-cluster1 is an ANCESTOR, not necessarily the parent.
// Repo reality (erratum vs the plan's `parentId === "n-cluster1"`): the six
// towns hang under their landmark nodes (n-millcross under n-millcross-ford,
// ...) and n-expedition-camp under n-meltwash-terrace. The invariant that
// matters is unchanged — every translated anchor lives inside the basin's
// subtree, so translating it by PIN_OFFSET keeps it on c02.
function basinLocal(nodeId) {
  let cur = JSON.parse(readFileSync(join(ROOT, `content/spine/nodes/${nodeId}.json`), "utf8"));
  for (let i = 0; i < 50 && cur; i++) {
    if (cur.id === "n-cluster1") return true;
    if (!cur.parentId) return false;
    cur = JSON.parse(readFileSync(join(ROOT, `content/spine/nodes/${cur.parentId}.json`), "utf8"));
  }
  return false;
}

// PIN_OFFSET's derivation, with the operand the redraw retired RECORDED.
//
// This check used to read `c02.footprint.centreKm - n-cluster1.placement.anchor`
// straight off disk. Half of that subtraction stopped existing: Plan E redraws
// n-cluster1 from the seed, its anchor moved [15, 19] -> [75.75, 152.75], and
// the check went from proving the offset to proving nothing — it compared the
// committed [81, 129] against a difference taken in a frame that had been
// deleted. The VALUE is independently right (see the construction proof
// below), so it is the derivation that went stale, not the number.
//
// The fix is not to retire the check — PIN_OFFSET is load-bearing (Task 6
// ruling 5 translates every retained road's points by it) and must stay
// derivable — and not to re-pin it to whatever the live subtraction now gives,
// which would be a different offset with the same name. The operands are
// recorded in the roster beside the offset, and this test verifies THEM:
//
//   1. the arithmetic, against the recorded pair;
//   2. the LIVE operand (the premise centre) against the premise file, so a
//      packing change that moves c02 still reds here;
//   3. the construction proof, whose POST side is live — the pre-redraw
//      Millcross anchor plus the offset IS `c-town-millcross.at` to the
//      decimal, and that row is re-read on every run.
//
// What is NOT verifiable any more is the retired subtrahend itself. It is
// recorded with `live: false` and this test asserts that flag, so nobody
// "repairs" the record by pointing it back at a node whose anchor would
// silently re-pin the offset.
test("PIN_OFFSET is DERIVED, and its derivation names operands that still exist", () => {
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const d = roster.pinOffsetDerivation;
  assert.ok(d, "pinned-roster.json carries no pinOffsetDerivation — the offset would be a bare number again");

  // 1. the arithmetic
  assert.deepEqual(
    roster.pinOffset,
    [d.minuend.value[0] - d.subtrahend.value[0], d.minuend.value[1] - d.subtrahend.value[1]],
    `pinOffset ${JSON.stringify(roster.pinOffset)} is not minuend - subtrahend`);

  // 2. the operand that still exists
  assert.equal(d.minuend.live, true);
  assert.deepEqual(d.minuend.value, premises().c02.footprint.centreKm,
    "the recorded minuend is not c02's committed footprint.centreKm any more — re-run Step 1");

  // 3. the construction proof, live on its post side
  assert.equal(d.subtrahend.live, false,
    "the subtrahend is marked live: the pre-redraw n-cluster1 anchor no longer exists and must not be re-read");
  const post = roster.rows.find((r) => r.id === d.provesWith.post);
  assert.ok(post, `provesWith.post names ${d.provesWith.post}, which is not a roster row`);
  assert.deepEqual(
    [Math.round((d.provesWith.pre[0] + roster.pinOffset[0]) * 10) / 10,
     Math.round((d.provesWith.pre[1] + roster.pinOffset[1]) * 10) / 10],
    post.at,
    `${JSON.stringify(d.provesWith.pre)} + pinOffset does not land on ${post.id} — the offset is wrong, not the record`);
});

test("every pinned row lands INSIDE its declared continent's footprint ellipse", () => {
  // The failure this catches, concretely: a roster authored against a centre
  // table that was never in any premise file puts Gildmark 55 km out to sea,
  // G-PIN-SAT goes red forty times at once, and the cause looks like a
  // generator bug rather than two documents disagreeing.
  const prem = premises();
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const outside = [];
  for (const row of roster.rows) {
    if (!Array.isArray(row.at)) continue;
    const p = prem[row.continent];
    assert.ok(p, `${row.id} names continent ${row.continent}, which has no premise file`);
    const [cx, cy] = p.footprint.centreKm, [rx, ry] = p.footprint.radiiKm;
    const t = ((row.at[0] - cx) / rx) ** 2 + ((row.at[1] - cy) / ry) ** 2;
    if (t > 1) outside.push(`${row.id} at ${JSON.stringify(row.at)} is t=${t.toFixed(3)} outside ${row.continent} (${cx},${cy} r ${rx},${ry})`);
  }
  assert.deepEqual(outside, []);
});

test("every surviving basin row IS its spine node's composed world anchor", () => {
  // The other half of the divergence guard. The ellipse test above catches a
  // pin that left its continent; this one catches a pin that was hand-typed
  // instead of derived from the node it names.
  //
  // PLAN E TASK 6 — WHAT MOVED, AND WHY IT IS NOT A RE-PIN. This test carried
  // an 18-entry literal map from roster row id to spine node id. Fifteen of
  // those nodes do not survive the redraw, and replacing the eighteen with a
  // fresh three would be the same defect with a newer number — the next redraw
  // would have to hunt them again. So nothing is typed here any more:
  //
  //   - the SET is enumerated from content/spine/nodes/ by the same
  //     basin-locality walk the old map's guard used, so it is whatever the
  //     trunk actually hosts under n-cluster1;
  //   - its SIZE is checked against content/spine/trunk-census.json, whose
  //     `why.region` ("n-thornveil and n-northern-icefield ONLY") and
  //     `why.town` ("n-millcross ONLY") are precisely the basin survivors, so
  //     the census is the authority on this count too;
  //   - the ROW for each node is derived from its slug (`c-town-<slug>` for a
  //     town tier, `c-lm-<slug>` for a landmark), and exactly one must exist.
  //
  // The ARITHMETIC moved for a measured reason, not a convenient one. Before
  // the redraw a basin node's anchor was basin-local and the roster row was
  // that anchor plus `pinOffset`. The redraw translated the basin's own
  // geometry by that same offset (STATE §28 ruling 5), so a surviving node's
  // `placement.anchor` is now already in world km and adding the offset again
  // would double-count it. The invariant that replaces it is the one STATE §28
  // D2 measured on the preserved town host: a node's COMPOSED world anchor —
  // resolved through its parents, never read off one file — equals its pin's
  // `at`. That is strictly harder to satisfy by hand-typing than the old form,
  // because it has to survive the composition.
  //
  // `lore.labelAt` is deliberately NOT consulted any more: on the two surviving
  // region nodes it still holds the PRE-translation basin-local point, so the
  // old `absoluteAnchor ?? lore.labelAt ?? placement.anchor` chain would read a
  // stale frame here (filed, see the phase report).
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const rows = new Map(roster.rows.map((r) => [r.id, r]));

  // n-cluster1 is the basin ROOT, not a place in it: basinLocal() is true of it
  // by definition and it has no roster row.
  const basin = spine.nodes
    .filter((n) => n.id !== "n-cluster1" && basinLocal(n.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(basin.length, CENSUS_BY_TIER.region + CENSUS_BY_TIER.town,
    `content/spine/trunk-census.json budgets ${CENSUS_BY_TIER.region} region + ${CENSUS_BY_TIER.town} town nodes under n-cluster1, `
    + `but the trunk hosts ${basin.length}: ${basin.map((n) => n.id).join(", ")}`);

  const wrong = [];
  for (const node of basin) {
    const slug = node.id.slice(2);
    const candidates = [`c-town-${slug}`, `c-lm-${slug}`].filter((id) => rows.has(id));
    assert.equal(candidates.length, 1,
      `${node.id} maps to ${candidates.length} roster rows (${candidates.join(", ") || "none"}) — `
      + "a basin node with no pin, or two, is a divergence the roster cannot express");
    const want = node.parentId === null
      ? node.placement.anchor
      : resolveToRoot({ tree, id: node.parentId, point: node.placement.anchor });
    const got = rows.get(candidates[0]).at;
    if (JSON.stringify(got) !== JSON.stringify(want))
      wrong.push(`${candidates[0]}: roster ${JSON.stringify(got)} != ${node.id} composed ${JSON.stringify(want)}`);
  }
  assert.deepEqual(wrong, []);
});

test("the roster is 41 rows and expands to 41 records", () => {
  // The spec says "~40". 41 is that made exact, and it is asserted so the
  // count cannot drift silently under a later edit: 8 towns + 13 c02
  // landmarks + 20 landmarks on the other twelve landmasses.
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  assert.equal(roster.rows.length, 41);
  assert.equal(new Set(roster.rows.map((r) => r.id)).size, 41, "ids are unique");
  assert.equal(roster.rows.filter((r) => r.kind === "town").length, 8);
  assert.equal(roster.rows.filter((r) => r.continent === "c02").length, 19);
  assert.equal(roster.rows.filter((r) => r.continent === "c03").length, 4);
});

test("every requires.landform is an id in the committed lexicon", () => {
  // `requires.landform` is a TYPE ID. terrainKinds (karst-plateau, sand-sea,
  // cloud-forest, fjordland) and coastClasses are NOT legal here: G-PIN-SAT
  // compares against grid.landform, so a value the lexicon has no row for can
  // never be satisfied by any world, on any seed.
  const lexPath = join(ROOT, "content/world/lexicon/landforms.json");
  if (!existsSync(lexPath)) return; // Plan B not merged: skip
  const ids = new Set(JSON.parse(readFileSync(lexPath, "utf8")).map((r) => r.id));
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const bad = roster.rows
    .map((r) => r.requires?.landform)
    .filter((t) => t && !ids.has(t));
  assert.deepEqual([...new Set(bad)].sort(), []);
});

test("a `plan` path, when present, names a file that will exist", () => {
  // EXACTLY ONE row may carry a `plan`, and it is Millcross — the only town
  // plan committed today. A `plan` pointing at a file nobody writes is worse
  // than an honest null: check_content.mjs:1192 (T1) joins on it.
  //
  // E-C9 is why the three capitals carry null. A town plan joins the world by
  // `spineId`, so each plan needs a tier:"town" spine node — and the trunk
  // census Plan C owns budgets exactly ONE (n-millcross, the alias of the one
  // committed plan). No plan in this programme authors a file under
  // content/towns/; the quota stays 8 as a target.
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const withPlan = roster.rows.filter((r) => r.plan).map((r) => r.id).sort();
  assert.deepEqual(withPlan, ["c-town-millcross"]);
  assert.equal(roster.rows.find((r) => r.id === "c-town-millcross").plan,
    "content/towns/town-millcross.json");
  assert.ok(existsSync(join(ROOT, "content/towns/town-millcross.json")),
    "the only declared plan path must name a committed file");
});

test("G-PIN-SAT is silent when the fabric receipt satisfies every requirement", () => {
  assert.deepEqual(gPinSat({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-PIN-SAT landform is PROXIMITY: nearest required instance within 30 km satisfies it", () => {
  // OWNER RULING, 2026-08-25. Instance coverage on the real world is 1,740
  // point features over 640,000 cells — exact-cell semantics were
  // unsatisfiable by construction for all 41 pins. The receipt now records
  // WHICH instance of the required type lies nearest (id + handle) and HOW
  // FAR; satisfaction is that distance within PIN_LANDFORM_NEAR_KM.
  assert.deepEqual(gPinSat({ world: loadCivil({ contentRoot: worldFixture() }) }), [],
    "the green fixture's receipt names lf-c02-r01-0001 at distance 0");
});

test("G-PIN-SAT landform red: the nearest instance is beyond PIN_LANDFORM_NEAR_KM", () => {
  const p = gPinSat({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-pin-sat-landform-far" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-PIN-SAT: c-town-gildmark at \[137\.2, 182\.4\]: requires\.landform = coastal-drowned-valley within 30 km but fabric has 41\.7 km away$/);
});

test("G-PIN-SAT landform red: no instance of the type anywhere reads 'none', not zero", () => {
  const dir = worldFixture();
  const fp = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(fp, "utf8"));
  for (const r of doc.pinReceipts)
    if (r.id === "c-town-gildmark") {
      r.measured.landformNearId = null;
      r.measured.landformNearHandle = null;
      r.measured.landformNearDistanceKm = null;
    }
  writeFileSync(fp, JSON.stringify(doc));
  const p = gPinSat({ world: loadCivil({ contentRoot: dir }) });
  assert.equal(p.filter((x) => x.includes("requires.landform")).length, 1);
  assert.match(p.find((x) => x.includes("requires.landform")), /but fabric has none found$/);
});

test("G-PIN-SAT is silent while NO receipt exists anywhere (generator not yet wired)", () => {
  // The real fabric carries pinReceipts: [] until Task 10 wires placePinned.
  // An empty-receipt world is INPUTS ABSENT, not 41 failures — Gate 1 must
  // stay green per-commit. The gate ARMS as soon as one receipt exists, which
  // the next test pins.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.pinReceipts = [];
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const world = loadCivil({ contentRoot: dir });
  assert.deepEqual(gPinSat({ world }), []);
  // TASK 10 MUST FLIP THIS: the silence above is only valid while receipts
  // are unwired everywhere. The COMMITTED world carries these many pins,
  // all currently UNGATED — when Task 10 lands, every continent with pins
  // carries one receipt per pin (count below), fabric-file.schema.json's
  // `pinReceipts` minItems rises accordingly, and an empty-receipt world
  // can no longer pass this test.
  const committed = loadCivil({ contentRoot: join(ROOT, "content") });
  assert.equal(committed.pinned.length, 41);
});

test("G-PIN-SAT red: a numeric requirement the ground does not meet", () => {
  const p = gPinSat({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-pin-sat-slope" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-PIN-SAT: c-town-gildmark at \[137\.2, 182\.4\]: requires\.slopeMax = 0\.06 but fabric has 0\.19$/);
});

test("G-PIN-SAT red: the generator moved the place beyond its tolerance", () => {
  const p = gPinSat({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-pin-sat-moved" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-PIN-SAT: c-town-gildmark at \[137\.2, 182\.4\]: requires\.pin = within 1\.5 km but fabric has 5 km away$/);
});

test("G-PIN-SAT red: a pinned record with no receipt at all", () => {
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.pinReceipts = doc.pinReceipts.filter((r) => r.id !== "c-town-gildmark");
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const problems = gPinSat({ world: loadCivil({ contentRoot: dir }) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /requires\.receipt = present but fabric has none/);
});

test("the roster table carries its own byte cap, and the cap is LIVE", () => {
  // The civil per-file cap is 8192 B for RECORDS; the roster is the authoring
  // TABLE and exceeds it by design. budgets.json's `roster` section gives it
  // its own bound (scripts/lib/world.mjs reads it), so this test pins both
  // halves of that ruling: the table really does overflow the record cap
  // (otherwise the override is dead weight), and it stays inside its own.
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const bytes = statSync(ROSTER).size;
  assert.ok(bytes > budgets.civil.maxBytesPerFile,
    `roster at ${bytes} B no longer overflows the ${budgets.civil.maxBytesPerFile} B record cap — the override is dead`);
  assert.ok(bytes <= budgets.roster.maxBytesPerFile,
    `roster grew to ${bytes} B > its own ${budgets.roster.maxBytesPerFile} B cap`);
});

// ---------------------------------------------------------------------------
// Task 5 — G-HANDLE-BAND: the gate that catches what an ordinal rank hides.

test("G-HANDLE-BAND is silent when the ledger size is inside the declared band", () => {
  assert.deepEqual(gHandleBand({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-HANDLE-BAND red: the 17.5x karst swing an ordinal rank resolves silently", () => {
  const p = gHandleBand({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-handle-band-oversize" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-HANDLE-BAND: c-lm-the-drowned-stair resolved to 5\.42 km2, declared band \[0\.1, 0\.8\]$/);
});

test("G-HANDLE-BAND red: the resolved type is not the type the record expects", () => {
  const dir = worldFixture();
  const p = join(dir, "world/handles/continent-02.json");
  const led = JSON.parse(readFileSync(p, "utf8"));
  led.handles.find((h) => h.handle === "c02/karst/h-0f42").type = "salt-pan-crust";
  writeFileSync(p, JSON.stringify(led, null, 2) + "\n");
  const problems = gHandleBand({ world: loadCivil({ contentRoot: dir }) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /expects type "karst-cenote" but the handle resolves to "salt-pan-crust"/);
});

// ---------------------------------------------------------------------------
// Task 7 — the join (resolveCivil), the region half of G-ORDER and G-SLOT-STABLE.

function worldParts(dir) {
  const w = loadCivil({ contentRoot: dir });
  return { fabric: w.fabric.c02, handles: w.ledgers.c02, civil: { pinned: w.pinned, bound: w.bound } };
}

test("resolveCivil emits every family in a fixed key order", () => {
  const { resolved, problems } = resolveCivil(worldParts(worldFixture()));
  assert.deepEqual(problems, []);
  // The order is asserted against RESOLVED_KEYS, not against a re-typed list:
  // one statement of a load-bearing order, and the literal below exists so a
  // reviewer can see what that order IS without opening the module.
  assert.deepEqual([...RESOLVED_KEYS], [
    "continent", "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
    "zones", "towns", "camps", "roads", "landmarks",
    "dungeons", "instances", "relay", "distances", "seaLane", "sheet",
  ]);
  assert.deepEqual(Object.keys(resolved), [...RESOLVED_KEYS]);
});

test("the five geographic keys are DERIVED, so basin-sheet.mjs cannot throw", () => {
  // The failure this catches, concretely: emitting coastline/saltmire as null
  // reintroduces the `TypeError: Cannot read properties of undefined` that
  // Plan A Task 5 removed, and it surfaces two commits later as
  // `render-sheet --sheet cluster1` dying and G-RENDER-LOCK going red.
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  assert.ok(Array.isArray(resolved.coastline?.points), "coastline.points must be an array");
  assert.ok(Array.isArray(resolved.saltmire?.polygon), "saltmire.polygon must be an array");
  assert.ok(Array.isArray(resolved.terrainPatches), "terrainPatches must be an array");
  for (const p of resolved.terrainPatches) assert.ok(Array.isArray(p.polygon));
});

test("a pinned town resolves to its pin, a bound landmark to its instance", () => {
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  const town = resolved.towns.find((t) => t.id === "c-town-gildmark");
  assert.deepEqual(town.at, [137.2, 182.4]);
  assert.deepEqual(town.properties, ["deepwater-port"]);
  assert.deepEqual(town.coasts, ["wealdmarch-west"]);
  const lm = resolved.landmarks.find((l) => l.id === "c-lm-the-drowned-stair");
  assert.deepEqual(lm.at, [166.0, 172.0], "position comes from the FABRIC INSTANCE, never from the record");
  assert.equal(lm.region, "c02/r02");
  assert.equal(lm.sizeKm, 0.31);
});

test("the resolved world carries no key the record was forbidden to carry", () => {
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  // Coordinates are legal HERE — the ban is on the AUTHORED record, not on
  // the join output. What must not appear is a derived relation value.
  const flat = JSON.stringify(resolved);
  for (const k of ["bearingDeg", "compass", "drift", "declared"])
    assert.equal(flat.includes(`"${k}"`), false, `${k} must not be serialised`);
});

test("a bound record whose handle has no instance is a problem, never a throw", () => {
  const dir = worldFixture({ overlayDir: "g-bind-dangling-handle" });
  const { resolved, problems } = resolveCivil(worldParts(dir));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /c-lm-the-drowned-stair: handle "c02\/karst\/h-dead" has no instance in fabric continent-02/);
  assert.equal(resolved.landmarks.length, 0);
});

test("gZoneOrder is green on a real resolveCivil output", () => {
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  assert.deepEqual(gZoneOrder({ resolvedByContinent: { c02: resolved } }), []);
});

test("gZoneOrder reds on a gapped rank — the silent-disappearance failure R3 names", () => {
  // Built by hand, not via a fixture overlay, and deliberately so: resolveCivil
  // mints `order` as 0..n-1 by construction, so no input it accepts can produce
  // a gap. The failure being guarded against is a LATER hand edit or a partial
  // regeneration of a committed content/world/resolved/*.json — a surveyed zone
  // vanishing while every other gate stays green.
  const zones = [
    { id: "c02/r01", survey: "surveyed", order: 0 },
    { id: "c02/r02", survey: "surveyed", order: 1 },
    { id: "c02/r03", survey: "surveyed", order: 3 },
    { id: "c02/r04", survey: "reported", order: undefined },
  ];
  const problems = gZoneOrder({ resolvedByContinent: { c02: { continent: "c02", zones } } });
  assert.equal(problems.length, 1);
  assert.equal(problems[0],
    "G-ORDER: c02 zone order is not a dense permutation of 0..2 — got [0, 1, 3]");
});

test("gZoneOrder ignores reported zones, which carry no order at all", () => {
  const zones = [
    { id: "c02/r01", survey: "surveyed", order: 0 },
    { id: "c02/r02", survey: "reported" },
    { id: "c02/r03", survey: "reported" },
  ];
  assert.deepEqual(gZoneOrder({ resolvedByContinent: { c02: { continent: "c02", zones } } }), []);
});

test("resolveCivil is a pure function of its inputs — same in, byte-same out", () => {
  const a = JSON.stringify(resolveCivil(worldParts(worldFixture())).resolved);
  const b = JSON.stringify(resolveCivil(worldParts(worldFixture())).resolved);
  assert.equal(a, b);
});

test("a TWO-ring region loses no geometry — the plan's singular `ring` erratum", () => {
  // The plan text reads the singular `r.ring`, a key fabric-file.schema.json
  // FORBIDS: regions carry `rings` (one or more OUTER rings) plus `holes`,
  // and STATE §13 counts 18 multi-ring regions in the committed world. Code
  // written against the plan literal nulled every resolved polygon, labelAt
  // and pin zone binding — all byte-locked lossy by G-SLOT-STABLE. This test
  // fails if anyone reintroduces the singular read: the second OUTER ring
  // must survive as extraPolys, the first must stay the polygon, and a pin
  // falling inside the SECOND ring must still bind to the region.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  const r01 = doc.regions.find((r) => r.id === "c02/r01");
  const second = [[181, 181], [190, 181], [190, 190], [181, 190]];
  r01.rings = [r01.rings[0], second];
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const { resolved, problems } = resolveCivil(worldParts(dir));
  assert.deepEqual(problems, []);
  const zone = resolved.zones.find((z) => z.id === "c02/r01");
  assert.deepEqual(zone.polygon, r01.rings[0], "the outer ring stays the polygon");
  assert.deepEqual(zone.extraPolys, [second], "additional outer rings are carried, never dropped");
  assert.ok(Array.isArray(zone.labelAt), "labelAt derives from the outer ring");
});

test("regionAt honours every outer ring AND its holes", () => {
  // The other half of the real dialect: ownership goes through ANY outer ring
  // but NOT through a hole. Dropping either half mis-binds pins — through one
  // ring only, or onto ground a lake fills.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  const r01 = doc.regions.find((r) => r.id === "c02/r01");
  const second = [[130, 178], [141, 178], [141, 188], [130, 188]]; // contains the Gildmark pin
  r01.rings = [...r01.rings, second];
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const bound = resolveCivil(worldParts(dir)).resolved.towns.find((t) => t.id === "c-town-gildmark");
  assert.equal(bound.zone, "c02/r01", "a point inside the SECOND outer ring binds to the region");

  r01.holes = [[[133, 180], [140, 180], [140, 186], [133, 186]]]; // still contains the pin
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const holed = resolveCivil(worldParts(dir)).resolved.towns.find((t) => t.id === "c-town-gildmark");
  assert.equal(holed.zone, null, "a point inside a hole belongs to no region");
});

test("G-SLOT-STABLE: --write then --check is green, and a hand edit reds it", () => {
  const dir = worldFixture();
  const run = (args) => {
    try { return { code: 0, out: execFileSync(process.execPath, [join(ROOT, "scripts/check_resolved.mjs"), ...args, "--content-root", dir], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  };
  assert.equal(run(["--write"]).code, 0);
  assert.equal(run(["--check"]).code, 0);
  const p = join(dir, "world/resolved/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.towns[0].at = [1, 1];
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const red = run(["--check"]);
  assert.equal(red.code, 1);
  assert.match(red.out, /G-SLOT-STABLE: .*continent-02\.json differs from the recomputed join/);
});

// ---------------------------------------------------------------------------
// Task 9 — G-BAND: difficulty rises with distance from the starter capital.

test("nine rings, 40 km apart, both bounds strictly increasing, ceiling 80", () => {
  assert.equal(LEVEL_RINGS.length, 9);
  assert.deepEqual(LEVEL_RINGS[0], [1, 10]);
  assert.deepEqual(LEVEL_RINGS[8], [58, 80]);
  for (let i = 1; i < LEVEL_RINGS.length; i++) {
    assert.ok(LEVEL_RINGS[i][0] > LEVEL_RINGS[i - 1][0], `ring ${i} lower bound`);
    assert.ok(LEVEL_RINGS[i][1] > LEVEL_RINGS[i - 1][1], `ring ${i} upper bound`);
    assert.ok(LEVEL_RINGS[i][0] < LEVEL_RINGS[i - 1][1], `ring ${i} must overlap ring ${i - 1} so no ring is a wall`);
  }
  assert.equal(STARTER_CAPITAL, "c-town-gildmark");
  assert.equal(ringOfDistance({ km: 0 }), 0);
  assert.equal(ringOfDistance({ km: 39.9 }), 0);
  assert.equal(ringOfDistance({ km: 40 }), 1);
  assert.equal(ringOfDistance({ km: 9999 }), 8);
});

test("G-BAND is silent on the green fixture", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved,
                   c10: resolveCivil({ fabric: world.fabric.c10, handles: world.ledgers.c10, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  assert.deepEqual(gBand({ world, resolvedByContinent: byCont, dungeons: [] }), []);
});

test("G-BAND red: a far region banded below a nearer one", () => {
  const dir = worldFixture({ overlayDir: "g-band-inversion" });
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved,
                   c10: resolveCivil({ fabric: world.fabric.c10, handles: world.ledgers.c10, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  const p = gBand({ world, resolvedByContinent: byCont, dungeons: [] });
  assert.equal(p.length, 1);
  // ERRATUM vs plan Step 1 (plan line ~4318): the literal said "2 < 46 at
  // ring 5". The base fixture's c10/r01 centroid is [340, 215], which sits
  // 205.40 km from Gildmark's pin [137.2, 182.4] — ring 5, whose one-band-of-
  // slack floor is the PREVIOUS ring's lower bound, LEVEL_RINGS[4][0] = 32.
  // No reading of the committed ring list yields 46 from this geometry; the
  // code snippet in plan Step 3 is the stated intent (reviewer attack b).
  assert.match(p[0], /^G-BAND: region c10\/r01 levelBand\[0\] 2 < 32 at ring 5 — bands must be non-decreasing in distance from Gildmark$/);
});

test("G-BAND red: a dungeon band that does not overlap its host region's", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  const p = gBand({ world, resolvedByContinent: byCont,
    dungeons: [{ id: "dungeon-strays", bind: { handle: "c02/karst/h-0f42" }, levelBand: [70, 80] }] });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BAND: dungeon-strays band \[70, 80\] does not overlap host region c02\/r02 band \[15, 28\]$/);
});

// ---------------------------------------------------------------------------
// Task 11 — the join cutover: places.mjs reads content/world/resolved/, the
// ONLY file family the three gate joins read. Adaptations vs the plan's Step 1
// literals are commented inline (plan-vs-repo errata, recorded in
// docs/superpowers/plans/world-fill-STATE.md §26).
import { loadPlaces, WORLD_DOC_KEYS } from "../lib/places.mjs";
import { loadSpine, buildTree, resolveToRoot } from "../lib/spine.mjs";
import { CENSUS_BY_TIER } from "./helpers/census.mjs";

test("loadPlaces reads content/world/resolved and keeps the load-bearing key order", () => {
  const { doc, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(doc), [...WORLD_DOC_KEYS]);
});

test("the merged doc carries every continent's zones and towns", () => {
  const { doc } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.ok(doc.zones.length >= 160, `expected >= 160 zones, got ${doc.zones.length}`);
  // ERRATUM: the plan asserted >= 45 towns. The committed resolved world has
  // EIGHT — six basin pins plus Tallowquay and Netstead; every other roster
  // row is a landmark, not a settlement.
  assert.ok(doc.towns.length >= 8, `expected >= 8 towns, got ${doc.towns.length}`);
});

test("the spine-derived fallback branch is gone", () => {
  const src = readFileSync(join(ROOT, "scripts/lib/places.mjs"), "utf8");
  assert.doesNotMatch(src, /fabric = null/, "the fallback signature must not survive");
  // ERRATUM: the plan matched /cluster1-geography/ over the whole file, but
  // GEO_HEADER's document id "cluster1-geography" is part of the basin bytes
  // pinned by places.test.mjs's sha256 (and echoed inside the committed SVG).
  // The legacy mirror PATH is what must not be referenced:
  assert.doesNotMatch(src, /maps\/cluster1-geography/, "the legacy mirror path must not be referenced");
});

test("a missing resolved dir is a PROBLEM, not a silent empty document", () => {
  const dir = mkdtempSync(join(tmpdir(), "no-resolved-"));
  try {
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.equal(doc, null);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /world\/resolved\/ holds no continent files/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("THE RENDER ASSERTION: the sheet renderer's doc contract survives the cutover", () => {
  // The failure this exists to stop: `loadPlaces` emitting coastline/river/
  // saltmire/iceEdge as null because ResolvedWorld "has no equivalent".
  //
  // ERRATUM: the plan drew the BASIN SHEET from loadPlaces' merged doc. That
  // cannot work — the generated world retires relay/sheet as null and
  // drawBasinSheet dereferences geo.relay.towers and geo.sheet.subtitle with
  // no guard.
  //
  // PLAN E RULING 8 (Task 6): the half that drew the sheet is gone with the
  // sheet. `cluster1` is out of SHEETS, nothing in production reaches
  // drawBasinSheet or resolveWorld (pinned in places.test.mjs), and the redrawn
  // trunk hosts no basin for resolveWorld to assemble — so a drawBasinSheet
  // call here would be a test of a dormant builder against a document that
  // cannot be built. Task 8 rebuilds the sheet resolved-backed and brings its
  // own render coverage.
  //
  // What survives is the half this test is NAMED for, and it is asserted more
  // completely than before: the merged generated-world doc carries real
  // geometry for every key the null-emitting failure would have blanked, not
  // just the two an unguarded consumer happened to trip over first.
  const { doc: merged, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, []);
  assert.ok(merged.coastline.points.length >= 3, "the coastline has no course");
  assert.ok(merged.river.points.length >= 2, "the river has no course");
  assert.ok(merged.saltmire.polygon.length >= 3, "the saltmire has no outline");
  assert.ok(merged.terrainPatches.length >= 1, "the world carries no terrain patch");
  assert.ok(merged.terrainPatches.every((p) => p.polygon.length >= 3),
    "a terrain patch has no outline");
  // `iceEdge` is the one key of the five that IS null, on every one of the
  // thirteen continent files — the redrawn generator emits no ice-edge feature
  // anywhere, not even on n-rimewall-cap, the ice cap. That is a generator gap,
  // FILED (see the Task 6 phase report) and not repaired here, so it is pinned
  // as the honest current state rather than skipped: the day an ice edge is
  // emitted this goes red and asks for the same geometry assertion as its four
  // siblings above.
  assert.equal(merged.iceEdge, null,
    "the resolved world now carries an iceEdge — give it the geometry assertion the other four keys have");
});

test("THE COUNTING ASSERTION: the joins still count on a root whose records match the resolved ids", () => {
  // ERRATUM: the plan ran --require-complete on the REAL root and expected
  // exit 0 with all three counts > 0. Unsatifiable until Plan E movement 2
  // re-homes the committed records onto the new region ids (see places.test.mjs
  // for the loud-orphan pin on the real root). Here the counting half is proven
  // on the migrated fixture suites' home turf instead: a fixture root whose
  // zone/town records match its resolved ids counts > 0 with zero failures.
  const dir = mkdtempSync(join(tmpdir(), "counting-"));
  try {
    mkdirSync(join(dir, "content/schemas"), { recursive: true });
    mkdirSync(join(dir, "content/world/resolved"), { recursive: true });
    mkdirSync(join(dir, "content/zones"), { recursive: true });
    mkdirSync(join(dir, "content/characters"), { recursive: true });
    mkdirSync(join(dir, "content/maps"), { recursive: true });
    for (const s of ["zone-content.schema.json", "character.schema.json", "map.schema.json"])
      cpSync(join(ROOT, "content/schemas", s), join(dir, "content/schemas", s));
    writeFileSync(join(dir, "content/world/resolved/continent-02.json"), JSON.stringify({
      continent: "c02",
      coastline: { id: "f-coast-c02", points: [[0, 0], [10, 0], [10, 10]] },
      river: null, saltmire: null, iceEdge: null, terrainPatches: [],
      zones: [{ id: "z-one", name: "Zone One", levelBand: [1, 10] }],
      towns: [{ id: "t-one", name: "Town One", at: [5, 5], zone: "z-one" }],
      camps: [], roads: [], landmarks: [], dungeons: [],
      instances: [], relay: null, distances: null, seaLane: null, sheet: null,
    }));
    writeFileSync(join(dir, "content/zones/zone-z-one.json"), JSON.stringify({
      zone: "z-one", reasonToGo: "because",
      hazards: [{ id: "h-one", name: "H one", description: "d" },
                { id: "h-two", name: "H two", description: "d" }],
      resources: [{ id: "r-one", name: "R one", kind: "fuel", description: "d" },
                  { id: "r-two", name: "R two", kind: "crop", description: "d" }],
      landmarks: [{ id: "l-one", name: "L one", description: "d" },
                  { id: "l-two", name: "L two", description: "d" }],
    }));
    cpSync(join(ROOT, "content/world/budgets.json"), join(dir, "content/world/budgets.json"));
    cpSync(join(ROOT, "content/world/manifest.json"), join(dir, "content/world/manifest.json"));
    writeFileSync(join(dir, "keys.json"), JSON.stringify({ version: 1, keys: [] }));
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
    writeFileSync(join(dir, "mob-types.json"), JSON.stringify({ version: 1, mobTypes: [] }));
    writeFileSync(join(dir, "spawn-areas.json"), JSON.stringify({ version: 1, areas: [] }));

    let out;
    try {
      out = execFileSync(process.execPath,
        [join(ROOT, "scripts/check_content.mjs"), "--require-complete",
         "--content-root", join(dir, "content"),
         "--keys", join(dir, "keys.json"), "--manifest", join(dir, "manifest.json"),
         "--mob-types", join(dir, "mob-types.json"), "--spawn-areas", join(dir, "spawn-areas.json")],
        { encoding: "utf8" });
    } catch (e) {
      assert.fail(`the matching-record fixture must pass:\n${e.stdout ?? ""}${e.stderr ?? ""}`);
    }
    const m = out.match(/content-gate: (\d+) sheets, (\d+) maps, (\d+) story, (\d+) placements, (\d+) zones, (\d+) towns, (\d+) nodes, (\d+) failures/);
    assert.ok(m, "the summary line must be present");
    assert.ok(Number(m[5]) > 0, "zone records must still JOIN, not silently return 0");
    // The town join's counting half is pinned by the migrated town-plan suite,
    // whose fixture carries real town plans; this root has none, so its towns
    // count is legitimately 0 here.
    assert.equal(Number(m[8]), 0, "no failures");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
