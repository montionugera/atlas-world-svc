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
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCivil, gBind, gPinSat, gHandleBand, BANNED_COORDINATE_KEYS,
  resolveCivil, RESOLVED_KEYS, gZoneOrder,
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

test("PIN_OFFSET is DERIVED from the committed premise, never retyped", () => {
  const c02 = premises().c02;
  const basin = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-cluster1.json"), "utf8"));
  const want = [c02.footprint.centreKm[0] - basin.placement.anchor[0],
                c02.footprint.centreKm[1] - basin.placement.anchor[1]];
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  assert.deepEqual(roster.pinOffset, want,
    `pinOffset ${JSON.stringify(roster.pinOffset)} does not equal c02.centreKm - n-cluster1.anchor ${JSON.stringify(want)}`);
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

test("every re-fitted basin row IS its spine node's anchor plus pinOffset", () => {
  // The other half of the divergence guard. The ellipse test above catches a
  // pin that left its continent; this one catches a pin that was hand-typed
  // instead of translated, and it catches the sharper error Step 1 warns about
  // — translating a node whose anchor is not basin-local. Both `at` values
  // below MUST come from a node in n-cluster1's subtree.
  const BASIN = {
    "c-town-millcross": "n-millcross", "c-town-gildmark": "n-gildmark",
    "c-town-rooktide": "n-rooktide", "c-town-cindervast": "n-cindervast-town",
    "c-town-embervale": "n-embervale", "c-town-norhollow": "n-norhollow",
    "c-lm-thornveil": "n-thornveil", "c-lm-northern-icefield": "n-northern-icefield",
    "c-lm-ashvale-front": "n-ashvale-front", "c-lm-emberdown": "n-emberdown",
    "c-lm-hollowmarch": "n-hollowmarch", "c-lm-meltwash-terrace": "n-meltwash-terrace",
    "c-lm-millcross-ford": "n-millcross-ford", "c-lm-gildmark-head": "n-gildmark-head",
    "c-lm-rooktide-reach": "n-rooktide-reach", "c-lm-the-saltmire": "n-saltmire",
    "c-lm-eastern-hills": "n-eastern-hills", "c-lm-expedition-camp": "n-expedition-camp",
  };
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const rows = new Map(roster.rows.map((r) => [r.id, r]));
  const [ox, oy] = roster.pinOffset;
  const wrong = [];
  for (const [rowId, nodeId] of Object.entries(BASIN)) {
    assert.ok(basinLocal(nodeId),
      `${nodeId} is not inside n-cluster1's subtree; its anchor is not basin-local and must not be translated`);
    const node = JSON.parse(readFileSync(join(ROOT, `content/spine/nodes/${nodeId}.json`), "utf8"));
    const a = node.absoluteAnchor ?? node.lore?.labelAt ?? node.placement.anchor;
    const want = [Math.round((a[0] + ox) * 10) / 10, Math.round((a[1] + oy) * 10) / 10];
    const got = rows.get(rowId)?.at;
    if (JSON.stringify(got) !== JSON.stringify(want))
      wrong.push(`${rowId}: roster ${JSON.stringify(got)} != ${nodeId} + pinOffset ${JSON.stringify(want)}`);
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
