// scripts/tests/world-gates.test.mjs — Plan C world-layer gates.
// Fixture roots follow spine-gates.test.mjs's discipline exactly: a `base`
// dir plus one overlay dir per red case, copied into a temp root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Plan A Task 13's in-process entry: the 30-root sweep below costs ~8 s as
// spawns and ~0.3 s in process, for the same checkSpine() over the same opts.
import { runSpineGateInProcess } from "../check_content.mjs";
import { BIOMES } from "../lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const FIX = join(ROOT, "scripts/tests/fixtures/world");

// THE REAL SCHEMAS ARE COPIED, never a fixture copy of them: the day a task
// adds a required key to a schema and to the real document, a fixture copy
// starts failing every red case on its own missing key instead of on the
// mutation under test. All five world-family schemas travel together —
// landform-instance is here because fabric-file.schema.json $refs it, and a
// missing $ref target makes ajv throw at compile time rather than validate
// loosely.
const WORLD_SCHEMAS = ["world-manifest.schema.json", "premise.schema.json",
                       "fabric-file.schema.json", "handle-ledger.schema.json",
                       "landform-instance.schema.json"];

export function worldFixture({ overlayDir = null, mutate = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "world-fix-"));
  cpSync(join(FIX, "base"), dir, { recursive: true });
  for (const f of WORLD_SCHEMAS)
    cpSync(join(ROOT, "content/schemas", f), join(dir, "schemas", f), { recursive: true });
  if (overlayDir) cpSync(join(FIX, overlayDir), dir, { recursive: true });
  if (mutate) mutate(dir);
  return dir;
}

export function runWorldGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("a content root with no world/ soft-skips: no world gate output, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-empty-"));
  mkdirSync(join(dir, "schemas"), { recursive: true });
  const r = runWorldGate(dir);
  assert.equal(r.code, 0, r.out);
  assert.ok(!/world-budget:/.test(r.out), `world gates must not run on a root with no world/: ${r.out}`);
});

test("G-WORLD-BUDGET prints its measurements on every run", () => {
  const r = runWorldGate(worldFixture());
  assert.equal(r.code, 0, r.out);
  // EVERY BUDGET TERM CARRIES ITS UNIT, and a family prints only the terms it
  // has. The plan's grammar was `(budget <maxFiles>, <maxTotal ?? maxPer>)`,
  // which for `civil` — deliberately without an aggregate byte cap — printed
  // the PER-FILE cap 8192 in the slot the fabric line had just taught the
  // reader holds the aggregate, next to a measured aggregate. Reproduced by the
  // review at 3 civil files of ~5 KB: `civil 3 files, 15030 bytes (budget 600,
  // 8192)` reads as a 1.8x violation and exits 0. The line advertised a bound
  // that does not exist, and it is this gate's only output for the family.
  assert.match(r.out, /world-budget: fabric 0 files, 0 bytes \(budget 20 files, 262144 B\/file, 4194304 B total\)/);
  assert.match(r.out, /world-budget: civil 0 files, 0 bytes \(budget 600 files, 8192 B\/file\)/);
  // The civil line must never imply an aggregate cap it does not have.
  assert.doesNotMatch(r.out, /world-budget: civil .*B total/);
});

test("a civil family inside every budget it HAS prints no bound it does not have", () => {
  // The exact reproduction from the review: three ~5 KB civil records. Each is
  // inside 8192 B/file, three is far inside 600 files, and there is no
  // aggregate term to be over — so the run is green and the line says so.
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/civil"), { recursive: true });
    for (let i = 0; i < 3; i++)
      writeFileSync(join(d, `world/civil/place-${i}.json`), JSON.stringify({ id: `p${i}`, pad: "x".repeat(4900) }));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /world-budget: civil 3 files, \d+ bytes \(budget 600 files, 8192 B\/file\)/);
  assert.doesNotMatch(r.out, /G-WORLD-BUDGET: world\/civil/, "nothing about this root is over any budget it has");
});

test("G-WORLD-BUDGET fails when a fabric file exceeds its per-file byte cap", () => {
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    writeFileSync(join(d, "world/fabric/continent-01.json"),
      JSON.stringify({ continent: "c01", pad: "x".repeat(300000) }));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/fabric\/continent-01\.json is \d+ bytes > per-file budget 262144/);
});

test("the committed manifest validates against its schema", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  assert.equal(doc.frame.areaKm2, 160000);
  assert.equal(doc.budget.netLandKm2 + doc.budget.waterKm2, 160000);
  assert.equal(doc.budget.grossLandPolygonKm2 + doc.budget.oceanPolygonKm2 + doc.budget.interstitialKm2, 160000);
  assert.equal(doc.budget.grossLandPolygonKm2 - doc.budget.interiorWaterKm2, doc.budget.netLandKm2);
  assert.equal(doc.regions.surveyed.count * doc.regions.surveyed.nominalKm2
             + doc.regions.reported.count * doc.regions.reported.nominalKm2, doc.budget.netLandKm2);
  const q = doc.quotas.settlements;
  assert.equal(q.capital + q.hub + q.village, q.total);
});

test("the landmass columns close: net 64000, interior water 1600, 40 surveyed, 120 reported", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const sum = (k) => doc.landmasses.reduce((a, l) => a + l[k], 0);
  assert.equal(doc.landmasses.length, 13);
  assert.equal(sum("netKm2"), 64000);
  assert.equal(sum("interiorWaterKm2"), 1600);
  assert.equal(sum("surveyed"), 40);
  assert.equal(sum("reported"), 120);
  // E-C5: Wealdmarch keeps TEN surveyed regions because content/zones/ already
  // holds ten committed records and 116 bestiary rows are sworn to them. The
  // two seats come from Coldreach, which has no committed zone prose. Anyone
  // "correcting" this back to 8/8 destroys two hand-written records.
  assert.equal(doc.landmasses.find((l) => l.id === "c02").surveyed, 10);
  assert.equal(doc.landmasses.find((l) => l.id === "c03").surveyed, 6);
  for (const id of ["c02", "c03"])
    assert.ok(doc.landmasses.find((l) => l.id === id).why.length > 0, `${id} needs a written why`);
});

test("landformCatalogue.distinctTypes IS the committed lexicon's row count, not a copy of it", () => {
  // Two independently-maintained counts of one list is how a committed
  // authority file ends up six short: the spec table says 164, Plan B Task 1
  // ships 170, and nothing joined the two.
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  assert.equal(doc.landformCatalogue.distinctTypes, 170);
  assert.equal(doc.landformCatalogue.groupMemberships, 178);
  assert.equal(doc.landformCatalogue.dualListed, 8);
  const lexPath = join(ROOT, "content/world/lexicon/landforms.json");
  if (!existsSync(lexPath)) return;                    // Plan B not merged yet
  const lex = JSON.parse(readFileSync(lexPath, "utf8"));
  assert.equal(doc.landformCatalogue.distinctTypes, lex.length,
    `manifest says ${doc.landformCatalogue.distinctTypes} landform types, the lexicon holds ${lex.length}`);
  const memberships = lex.reduce((a, t) => a + 1 + (t.alsoGroups?.length ?? 0), 0);
  assert.equal(doc.landformCatalogue.groupMemberships, memberships);
  assert.equal(doc.landformCatalogue.dualListed, lex.filter((t) => (t.alsoGroups?.length ?? 0) > 0).length);
});

test("every landmass carries an explicit nodeId, and c02's is n-cluster1", () => {
  // buildTrunk mints `id: lm.nodeId`, NEVER `n-${slugOf(title)}`. Slugging
  // "Wealdmarch" would mint n-wealdmarch, and promote-world's reconciliation
  // would then delete n-cluster1 as an n-atlas descendant absent from the
  // draft — taking twelve parentId references, check_spine_emit.mjs:104,
  // atlas-sheet.mjs:42, spine-coverage.mjs:14 and Plan D's PIN_OFFSET anchor
  // with it. The id is DATA, in exactly one place, and this is that place.
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  for (const lm of doc.landmasses)
    assert.match(lm.nodeId, /^n-[a-z0-9-]+$/, `${lm.id} has no usable nodeId`);
  assert.equal(new Set(doc.landmasses.map((l) => l.nodeId)).size, 13, "two landmasses share a nodeId");
  assert.equal(doc.landmasses.find((l) => l.id === "c02").nodeId, "n-cluster1");
  assert.ok(doc.landmasses.find((l) => l.id === "c02").nodeIdWhy.length > 0,
    "c02's nodeId disagrees with its title — that needs a written reason on the row");
  assert.equal(doc.landmasses.find((l) => l.id === "c03").nodeId, "n-coldreach");
  assert.equal(doc.landmasses.find((l) => l.id === "c04").nodeId, "n-stonemoor");
  // No landmass may collide with a water node id.
  const water = new Set([...doc.oceans, ...doc.seas].map((w) => w.nodeId));
  for (const lm of doc.landmasses)
    assert.ok(!water.has(lm.nodeId), `${lm.id} nodeId collides with a water node`);
});

test("the water columns close: 3 oceans summing to the polygon budget, 9 nested seas", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  assert.equal(doc.oceans.length, 3);
  assert.equal(doc.seas.length, 9);
  assert.equal(doc.oceans.reduce((a, o) => a + o.polygonKm2, 0), doc.budget.oceanPolygonKm2);
  assert.equal(doc.oceans.reduce((a, o) => a + o.attributedWaterKm2, 0), 96000);
  const oceanIds = new Set(doc.oceans.map((o) => o.id));
  for (const s of doc.seas) assert.ok(oceanIds.has(s.ocean), `sea ${s.id} names no real ocean`);
  for (const o of doc.oceans) {
    const nested = doc.seas.filter((s) => s.ocean === o.id);
    assert.equal(nested.length, 3, `${o.title} must hold exactly 3 seas`);
    const nestedKm2 = nested.reduce((a, s) => a + s.polygonKm2, 0);
    // Sea polygons are SUBSETS of their ocean polygon (G-CONTAIN). Their area
    // is already inside the ocean's and is never added to the frame again.
    assert.ok(nestedKm2 < o.polygonKm2, `${o.title}: nested seas ${nestedKm2} >= ocean ${o.polygonKm2}`);
  }
  assert.equal(doc.seas.reduce((a, s) => a + s.polygonKm2, 0), 20600);
  // n-westsea is DEMOTED from ocean to sea — the first real use of the
  // declared-but-empty `sea` tier (spec §6.3).
  const west = doc.seas.find((s) => s.nodeId === "n-westsea");
  assert.ok(west, "n-westsea must appear as a SEA, not an ocean");
  assert.equal(west.ocean, "o01");
  assert.ok(!doc.oceans.some((o) => o.nodeId === "n-westsea"));
});

test("the committed budgets file pins cellKm at 0.5 and the six loop stages", () => {
  const b = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.equal(b.cellKm, 0.5);
  assert.equal(b.fabric.maxFiles, 20);
  assert.equal(b.fabric.maxBytesPerFile, 262144);
  assert.equal(b.fabric.maxBytesTotal, 4194304);
  assert.equal(b.civil.maxFiles, 600);
  assert.equal(b.civil.maxBytesPerFile, 8192);
  // G4's measure is explicitly "per-stage time budgets, each with a fail
  // threshold — NOT one aggregate number", because without them the loop time
  // is unfalsifiable and drifts to minutes. Six rows, spec §7.6.
  assert.deepEqual(b.loop, [
    { stage: "generate",     budgetMs: 4000,  failMs: 8000 },
    { stage: "join",         budgetMs: 2000,  failMs: 4000 },
    { stage: "gates",        budgetMs: 15000, failMs: 20000 },
    { stage: "sheets",       budgetMs: 5000,  failMs: 8000 },
    { stage: "rasterise",    budgetMs: 30000, failMs: 60000 },
    { stage: "commit-lock",  budgetMs: 10000, failMs: 15000 },
  ]);
  for (const row of b.loop) assert.ok(row.failMs > row.budgetMs, `${row.stage}: fail must exceed budget`);
});

// ── red cases, one per rule ────────────────────────────────────────────────
// Trap §6.8: a rule whose deletion leaves the suite green protects nothing.
// Every rule gWorldBudget and checkWorld add above has a fixture below that
// goes red on it and only on it.

const editBudgets = (fn) => (d) => {
  const p = join(d, "world/budgets.json");
  const b = JSON.parse(readFileSync(p, "utf8"));
  const next = fn(b);
  writeFileSync(p, JSON.stringify(next === undefined ? b : next, null, 2));
};

test("G-WORLD-BUDGET fails when world/budgets.json is missing entirely", () => {
  const dir = worldFixture({ mutate: (d) => rmSync(join(d, "world/budgets.json")) });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/budgets\.json is missing/);
});

test("G-WORLD-BUDGET fails when a family section is absent", () => {
  const dir = worldFixture({ mutate: editBudgets((b) => { delete b.civil; }) });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/budgets\.json has no "civil" section/);
  // The other family still measures — one broken section must not silence the file.
  assert.match(r.out, /world-budget: fabric 0 files/);
});

test("G-WORLD-BUDGET fails when the fabric family exceeds its FILE count", () => {
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    for (let i = 0; i < 21; i++)
      writeFileSync(join(d, `world/fabric/continent-${String(i).padStart(2, "0")}.json`), JSON.stringify({ continent: `c${i}` }));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/fabric has 21 files > budget 20/);
});

test("G-WORLD-BUDGET fails on the fabric family's TOTAL bytes, which no per-file cap can see", () => {
  // 20 files of 250 KB each: every one is inside maxBytesPerFile and the file
  // count is exactly at budget, so only the aggregate term can fire.
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    for (let i = 0; i < 20; i++)
      writeFileSync(join(d, `world/fabric/continent-${String(i).padStart(2, "0")}.json`),
        JSON.stringify({ continent: `c${i}`, pad: "x".repeat(250000) }));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/fabric totals \d+ bytes > budget 4194304/);
  assert.doesNotMatch(r.out, /per-file budget/, "no file here is over the per-file cap");
  assert.doesNotMatch(r.out, /files > budget/, "20 files is exactly at the file budget");
});

test("G-WORLD-BUDGET fails when cellKm is retuned away from the pinned 0.5", () => {
  const dir = worldFixture({ mutate: editBudgets((b) => { b.cellKm = 1; }) });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: budgets\.cellKm is 1 — 0\.5 is a pinned constant/);
});

test("G-WORLD-BUDGET fails when the loop table is gone", () => {
  const dir = worldFixture({ mutate: editBudgets((b) => { delete b.loop; }) });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/budgets\.json has no "loop" table/);
});

test("G-WORLD-BUDGET fails on a loop table that drops a stage, invents one, or inverts a threshold", () => {
  const dir = worldFixture({ mutate: editBudgets((b) => {
    b.loop = b.loop.filter((r) => r.stage !== "rasterise");
    b.loop.push({ stage: "polish", budgetMs: 10, failMs: 20 });
    b.loop.find((r) => r.stage === "gates").failMs = 15000;   // equal, not greater
  }) });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: loop table is missing the "rasterise" stage/);
  assert.match(r.out, /G-WORLD-BUDGET: loop table names unknown stage "polish"/);
  assert.match(r.out, /G-WORLD-BUDGET: loop stage "gates" failMs 15000 must exceed budgetMs 15000/);
});

test("the manifest schema forbids the extra key that would let the sums stop closing", () => {
  const dir = worldFixture({ mutate: (d) => {
    const p = join(d, "world/manifest.json");
    const m = JSON.parse(readFileSync(p, "utf8"));
    m.extraLandKm2 = 5000;
    writeFileSync(p, JSON.stringify(m, null, 2));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/manifest\.json: schema .*additional properties/);
});

test("the manifest schema rejects a landmass row with no nodeId", () => {
  const dir = worldFixture({ mutate: (d) => {
    const p = join(d, "world/manifest.json");
    const m = JSON.parse(readFileSync(p, "utf8"));
    delete m.landmasses[1].nodeId;
    writeFileSync(p, JSON.stringify(m, null, 2));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/manifest\.json: schema \/landmasses\/1 .*nodeId/);
});

test("an unparsable fabric file is ONE in-band failure, never a throw", () => {
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    writeFileSync(join(d, "world/fabric/continent-01.json"), "{ not json");
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world: world\/fabric\/continent-01\.json: cannot read:/);
  assert.doesNotMatch(r.out, /at Object\.<anonymous>|Error:.*\n\s+at /, "a stack trace means the gate threw");
  // finish() still ran — the summary line is the proof no throw skipped it.
  assert.match(r.out, /content-gate: .* failures,/);
});

test("a fabric file that parses to a non-object is a shape failure, not a silent skip", () => {
  // `null` is the one that bit: JSON.parse("null") SUCCEEDS, so a loader that
  // tests `doc === null` to mean "the read failed" skips the file in silence.
  // That is the readJson-falsy trap this repo has hit before, and it is why
  // readJsonInBand reports through an error COUNT rather than a return value.
  for (const body of ["[]", "null", "5", '"c01"', "false"]) {
    const dir = worldFixture({ mutate: (d) => {
      mkdirSync(join(d, "world/fabric"), { recursive: true });
      writeFileSync(join(d, "world/fabric/continent-01.json"), body);
    } });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, `${body}: ${r.out}`);
    assert.match(r.out, /world: world\/fabric\/continent-01\.json: is not a JSON object/, body);
    // ONE failure for one broken file, not one per limb that touched it.
    assert.equal((r.out.match(/world\/fabric\/continent-01\.json: is not a JSON object/g) ?? []).length, 1, r.out);
  }
});

test("a manifest or budgets file that parses to null is a shape failure too", () => {
  for (const [file, extra] of [["manifest.json", /world\/manifest\.json: is not a JSON object/],
                               ["budgets.json", /world\/budgets\.json: is not a JSON object/]]) {
    const dir = worldFixture({ mutate: (d) => writeFileSync(join(d, "world", file), "null") });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, `${file}: ${r.out}`);
    assert.match(r.out, extra, file);
    assert.doesNotMatch(r.out, /check-content: \w*Error/, "a stack trace means the gate threw");
  }
});

test("checkWorld cannot change the exit code of a pre-existing spine fixture", () => {
  // The 30 committed spine fixture roots have no world/ directory. Run the
  // real gate over every one of them and assert not a single world line and
  // no new failure appears.
  const spineFix = join(ROOT, "scripts/tests/fixtures/spine");
  const roots = readdirSync(spineFix, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.ok(roots.length > 0, "no spine fixtures found — this test would pass vacuously");
  for (const e of roots) {
    const r = runSpineGateInProcess({ argv: ["--only=spine", "--content-root", join(spineFix, e.name)] });
    assert.ok(!/world-budget:|G-WORLD-BUDGET|FAIL\s+world:/.test(r.out),
      `${e.name}: world gates spoke on a root with no world/: ${r.out}`);
  }
});

// ── review findings, 2026-08-22 ────────────────────────────────────────────
// Three MEDIUMs from the independent adversarial review of this task's diff,
// each reproduced before being fixed: two catch branches and one shape guard
// had no fixture, and four sub-objects of the manifest schema were bare
// `{ "type": "object" }` — so a stray numeric key was invisible.

// A FILE where a directory is expected is the portable way to make readdirSync
// throw (ENOTDIR): no chmod, no root, works the same on macOS and the CI
// container. Without the catch, the gate throws out of checkWorld, finish()
// never runs, and every failure recorded before it is silently dropped.
//
// The EXPECTED MESSAGE is asserted per limb, not as a shared `/cannot be
// listed/`: world/fabric is walked by BOTH loadFabric's listJson and
// gWorldBudget's walkJson, so a loose regex let one of the two catches be
// deleted while the suite stayed green (review finding, reproduced).
for (const [path, expected] of [
  ["world/fabric", [/FAIL\s+world: world\/fabric cannot be listed: /, /FAIL\s+G-WORLD-BUDGET: world\/fabric cannot be listed: /]],
  ["world/handles", [/FAIL\s+world: world\/handles cannot be listed: /]],
  ["world/civil", [/FAIL\s+G-WORLD-BUDGET: world\/civil cannot be listed: /]],
  ["towns", [/FAIL\s+G-WORLD-BUDGET: towns cannot be listed: /]],
]) {
  test(`an unlistable ${path} is an in-band failure, and finish() still runs`, () => {
    const dir = worldFixture({ mutate: (d) => writeFileSync(join(d, path), "not a directory") });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, r.out);
    for (const re of expected) assert.match(r.out, re);
    assert.doesNotMatch(r.out, /check-content: \w*Error/, "a stack trace means the gate threw");
    assert.match(r.out, /content-gate: .* failures,/, "finish() did not run");
  });
}

test("a malformed handle ledger is reported, even though no gate reads handles yet", () => {
  // loadFabric's handles limb is scaffolding for Task 11/13 — but its errors
  // already reach the gate through checkWorld's `world.errors` sweep, so the
  // shape guard is live today and must have a fixture that proves it.
  for (const [body, pattern] of [
    ["{ not json", /world: world\/handles\/continent-01\.json: cannot read:/],
    ["[]", /world: world\/handles\/continent-01\.json: is not a JSON object/],
    ["null", /world: world\/handles\/continent-01\.json: is not a JSON object/],
  ]) {
    const dir = worldFixture({ mutate: (d) => {
      mkdirSync(join(d, "world/handles"), { recursive: true });
      writeFileSync(join(d, "world/handles/continent-01.json"), body);
    } });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, `${body}: ${r.out}`);
    assert.match(r.out, pattern);
  }
});

test("the manifest schema locks EVERY object that carries a number, not just the outer ones", () => {
  // Reproduced by the review: landformCatalogue, names, quotas and the two
  // regions classes were bare `{ "type": "object" }`, so a stray numeric key
  // in any of them exited 0. Each row below is one of those objects.
  const cases = [
    ["landformCatalogue", (m) => { m.landformCatalogue.sneakyCount = 5; }],
    ["landformCatalogue.instances", (m) => { m.landformCatalogue.instances.sneaky = 5; }],
    ["names", (m) => { m.names.sneakyName = 5; }],
    ["quotas", (m) => { m.quotas.sneakyQuota = 5; }],
    ["quotas.settlements", (m) => { m.quotas.settlements.extraSneaky = 5; }],
    ["quotas.dungeons", (m) => { m.quotas.dungeons.sneakyFloor = 5; }],
    ["regions.surveyed", (m) => { m.regions.surveyed.sneakyRegion = 5; }],
    ["regions.reported", (m) => { m.regions.reported.sneakyRegion = 5; }],
  ];
  for (const [label, mutateDoc] of cases) {
    const dir = worldFixture({ mutate: (d) => {
      const p = join(d, "world/manifest.json");
      const m = JSON.parse(readFileSync(p, "utf8"));
      mutateDoc(m);
      writeFileSync(p, JSON.stringify(m, null, 2));
    } });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, `${label} was accepted: ${r.out}`);
    assert.match(r.out, /world\/manifest\.json: schema .*additional properties/, label);
  }
});

test("the manifest schema still requires the keys those objects are made of", () => {
  const cases = [
    ["landformCatalogue.distinctTypes", (m) => { delete m.landformCatalogue.distinctTypes; }],
    ["names.reservedFile", (m) => { delete m.names.reservedFile; }],
    ["quotas.settlements.total", (m) => { delete m.quotas.settlements.total; }],
    ["quotas.dungeons.floors", (m) => { delete m.quotas.dungeons.floors; }],
    ["regions.reported.count", (m) => { delete m.regions.reported.count; }],
  ];
  for (const [label, mutateDoc] of cases) {
    const dir = worldFixture({ mutate: (d) => {
      const p = join(d, "world/manifest.json");
      const m = JSON.parse(readFileSync(p, "utf8"));
      mutateDoc(m);
      writeFileSync(p, JSON.stringify(m, null, 2));
    } });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, `${label} was accepted: ${r.out}`);
    assert.match(r.out, /world\/manifest\.json: schema .*required/, label);
  }
});

// ── seam-1 fix pass, 2026-08-22 ─────────────────────────────────────────────

test("a world root that carries budgets.json must carry a manifest — the quotas go DARK without one", () => {
  // Reproduced by the review: `content/world/` with budgets.json and no
  // manifest.json exited 0 with 0 failures, and deleting the REAL
  // content/world/manifest.json also left `--only=spine` (Gate 1's content
  // lane) green — only the scripts suite noticed, which runs in Gate 2 and CI
  // and NOT in precheck.sh, which has no scripts-suite lane at all.
  //
  // The failure mode is the one the print discipline exists to prevent: without
  // a manifest the town-plan quota line simply does not print. A measurement
  // that vanishes is worse than one that fails.
  const dir = worldFixture({ mutate: (d) => rmSync(join(d, "world/manifest.json")) });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/budgets\.json is present but world\/manifest\.json is missing/);
  // …and the rest of the gate still runs: one missing file must not silence it.
  assert.match(r.out, /world-budget: fabric 0 files/);
  assert.doesNotMatch(r.out, /world-budget: town-plans/, "the quota line is exactly what goes dark");
});

test("a budgets.json that exists but is the wrong SHAPE is not reported as missing", () => {
  // Two failures, one of them false: the file is right there. `is missing` and
  // `is not a JSON object` were one branch, so a reader chased a file that
  // existed. loadFabric already says the shape correctly; this gate now agrees.
  const dir = worldFixture({ mutate: (d) => writeFileSync(join(d, "world/budgets.json"), "[]") });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world: world\/budgets\.json: is not a JSON object/);
  assert.match(r.out, /G-WORLD-BUDGET: world\/budgets\.json is not a JSON object/);
  assert.doesNotMatch(r.out, /G-WORLD-BUDGET: world\/budgets\.json is missing/,
    "the file exists — calling it missing sends a reader looking for the wrong thing");
});

test("the manifest schema pins the landmass CARDINALITY, as it already did for oceans and seas", () => {
  // oceans and seas were minItems/maxItems 3 and 9; landmasses was minItems 1
  // with no ceiling, so a 14-row manifest was schema-legal and only the
  // committed-file test below pinned 13. Numeric CLOSURE is Task 11's; array
  // cardinality is shape, and shape is the schema's job.
  for (const [label, mutateDoc] of [
    ["a 14th landmass", (m) => { m.landmasses.push({ ...m.landmasses[12], id: "c14", nodeId: "n-invented" }); }],
    ["only 12 landmasses", (m) => { m.landmasses.pop(); }],
  ]) {
    const dir = worldFixture({ mutate: (d) => {
      const path = join(d, "world/manifest.json");
      const m = JSON.parse(readFileSync(path, "utf8"));
      mutateDoc(m);
      writeFileSync(path, JSON.stringify(m, null, 2));
    } });
    const r = runWorldGate(dir);
    assert.equal(r.code, 1, `${label} was accepted: ${r.out}`);
    assert.match(r.out, /world\/manifest\.json: schema \/landmasses/, label);
  }
});

test("the manifest's seed, frame and grid ARE n-atlas.json's, not a second copy of them", () => {
  // Two independently-maintained records of one set of numbers is how this
  // programme has been bitten five times (STATE §5, and the citation-rot
  // pattern). `manifest.seed`, `manifest.frame` and `manifest.grid` restate
  // values that the FROZEN content/spine/nodes/n-atlas.json pins. They agreed
  // when both were written and nothing kept them agreeing. This is the join,
  // and it costs six assertions.
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const atlas = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  assert.equal(atlas.frozen, true, "n-atlas is the authority precisely because it is frozen");
  assert.equal(doc.seed, atlas.seed.value,
    `manifest.seed ${doc.seed} has drifted from n-atlas's ${atlas.seed.value} — every named stream in Plans C-E derives from it`);
  assert.deepEqual([doc.frame.w, doc.frame.h], [atlas.placement.rect.w, atlas.placement.rect.h]);
  assert.deepEqual([doc.frame.w, doc.frame.h], atlas.interior.size);
  assert.equal(doc.frame.areaKm2, doc.frame.w * doc.frame.h);
  assert.equal(doc.frame.units, atlas.interior.units);
  // The grid is a tiling OF that frame, so it is derived, not independent.
  assert.equal(doc.grid.w * doc.grid.cellKm, doc.frame.w);
  assert.equal(doc.grid.h * doc.grid.cellKm, doc.frame.h);
  assert.equal(doc.grid.cells, doc.grid.w * doc.grid.h);
  // …and the pinned cell size lives in budgets.json, which is the file the gate
  // reads. Two numbers, one authority.
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.equal(doc.grid.cellKm, budgets.cellKm);
  // The interstitial composition is n-atlas's own declared interstitial.
  assert.deepEqual(doc.budget.interstitialComposition, atlas.interstitial);
});

test("interstitialComposition names real BIOMES — the one object the schema leaves open", () => {
  // `additionalProperties: {"type":"number"}` is the single unlocked object in
  // an otherwise fully locked schema (verified by the review's 43-path probe:
  // 42 locked, this one open). Closing it with an enum in the schema would put
  // a SECOND copy of the biome vocabulary in the repo, which is the defect the
  // test above exists to prevent. So it is joined to the one vocabulary instead.
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const keys = Object.keys(doc.budget.interstitialComposition);
  assert.ok(keys.length > 0, "an empty composition would pass this test vacuously");
  for (const k of keys) assert.ok(BIOMES.includes(k), `interstitialComposition names "${k}", which is not one of the ${BIOMES.length} BIOMES`);
  const total = Object.values(doc.budget.interstitialComposition).reduce((a, b) => a + b, 0);
  assert.equal(total, 100, "an interstitial composition that does not sum to 100 is not a composition");
});

test("the base fixture's manifest IS the committed one, so a red case fails on its mutation", () => {
  // worldFixture() copies the REAL schema over the fixture's manifest. The day
  // a task adds a required key to both schema and real manifest, every red-case
  // test above starts failing on the fixture's missing key instead of on the
  // mutation under test — green-looking noise that hides what is actually
  // broken. One assertion removes the whole class.
  const real = readFileSync(join(ROOT, "content/world/manifest.json"), "utf8");
  const fixture = readFileSync(join(FIX, "base/world/manifest.json"), "utf8");
  assert.deepEqual(JSON.parse(fixture), JSON.parse(real),
    "scripts/tests/fixtures/world/base/world/manifest.json has drifted from content/world/manifest.json — " +
      "copy the real one across rather than editing the fixture");
});

// ═══════════ Plan C Task 11: G-SEALAND, G-TRUNK-AREA, G-POI, G-ORDER, ══════
// ═══════════ G-PROVENANCE, and the fabric half of G-POLY/G-VERTEX-BUDGET ═══
//
// Every red case below MUTATES a document that is green on its own, so a test
// fails on exactly the rule it names. Overlay fixture DIRECTORIES were the
// plan's shape (ten of them); one valid base plus a mutation is strictly
// better for the same reason the manifest red cases above already use it — a
// hand-written broken document can be broken in a second, invisible way, and
// the mutation is the test's own statement of what it is testing.
//
// The gate is run IN PROCESS (runSpineGateInProcess, Plan A Task 13) rather
// than spawned: identical checkSpine() over identical opts, ~0.3 s against
// ~0.8 s a spawn, and this file adds forty of them.
import { createHash } from "node:crypto";
import { orderHandles, orderDigestOf } from "../../tools/mapforge/lib/passes/landforms.mjs";

const SPINE_FIX = join(ROOT, "scripts/tests/fixtures/spine");
const clone = (v) => JSON.parse(JSON.stringify(v));
const h64 = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

function runWorld(dir) {
  return runSpineGateInProcess({ argv: ["--only=spine", "--content-root", dir] });
}

// ── the green documents every red case below is a mutation of ──────────────
//
// The cell census is the one that has to be internally consistent, because
// G-SEALAND measures IT and not the manifest: 262,400 gross land + 377,600 sea
// = 640,000 cells; 6,400 of the land cells carry LAKE; at 0.5 km cells that is
// 64,000 km² net land against 96,000 km² of water, ratio 1.5000.
const WORLD_OK = {
  seed: "7c9e4a2f8b1d6e03", epoch: 0, generator: { name: "mapforge", version: "3.0.0" },
  cellKm: 0.5, grid: { w: 800, h: 800, cells: 640000 }, seaLevel: 0.42, rank: 262400,
  census: { grossLandCells: 262400, lakeCells: 6400, seaCells: 377600, unownedLandCells: 0 },
  areaKm2: { netLand: 64000, water: 96000, total: 160000 }, seaToLandRatio: 1.5,
  continents: [{ id: "c01", landCells: 25600, grossLandKm2: 6400,
                 fabric: "content/world/fabric/continent-01.json" }],
  seaLanes: [],
};

const square = (x, y, w) => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];

function instance(n, region) {
  const rn = region.slice(-3);
  return {
    id: `lf-c01-${rn}-${String(n).padStart(4, "0")}`, type: "sea-stack",
    geometry: { shape: "point", at: [1 + n * 0.1, 1] }, sizeKm: 0.2, cell: [2, 2],
    handle: `c01/coastal/h-${String(n).padStart(4, "0")}`, region,
    named: false, glyph: "g-stack", dungeonCapable: false,
    provenance: { authored: "generated", generator: { pass: "landforms", seedStream: "landform:c01", epoch: 0 },
                  fabric: "fabric/c01" },
  };
}

// 25,600 cells at 0.25 km²/cell = 6,400 km², which is EXACTLY the area of the
// spine base fixture's n-c polygon — so G-TRUNK-AREA is green when it is wired
// up and its ±3% is the only thing between this and a failure.
const FABRIC_OK = {
  continent: "c01", premise: "content/world/premises/continent-01.json",
  generator: { name: "mapforge", version: "3.0.0", seed: "7c9e4a2f8b1d6e03", epoch: 0 },
  seaLevel: 0.42, cellKm: 0.5,
  cellCensus: { land: 25600, lake: 0, unowned: 0 },
  ownerHistogram: { "c01/r01": 12800, "c01/r02": 12800 },
  outerRing: square(10, 10, 80), outerHoles: [], trunkRiver: null,
  regions: [
    { id: "c01/r01", survey: "surveyed", areaKm2: 3200, terrainKind: "rim", biomeShares: { rock: 100 },
      rings: [square(10, 10, 40)], holes: [], levelBand: [1, 10], adjacent: ["c01/r02"],
      centroidKm: [30, 30], settlements: ["c01/s01"], provenance: null },
    { id: "c01/r02", survey: "reported", areaKm2: 3200, terrainKind: null, biomeShares: { rock: 100 },
      rings: [square(50, 10, 40)], holes: [], levelBand: [8, 20], adjacent: ["c01/r01"],
      centroidKm: [70, 30], settlements: [], provenance: "hearsay" },
  ],
  instances: [...Array.from({ length: 18 }, (_, n) => instance(n, "c01/r01")),
              ...Array.from({ length: 8 }, (_, n) => instance(18 + n, "c01/r02"))],
  settlements: [{ id: "c01/s01", title: "Hubtown", rank: "hub", atKm: [30, 30], cell: [60, 60],
                  region: "c01/r01", continent: "c01", score: 0.7 }],
  roads: [], dungeonAnchors: [], pinReceipts: [],
};

const LEDGER_ROWS = [
  { handle: "c01/coastal/h-0001", type: "sea-stack", sizeKm: 0.9, region: "c01/r01", contentHash: h64("a") },
  { handle: "c01/coastal/h-0002", type: "sea-arch", sizeKm: 0.4, region: "c01/r01", contentHash: h64("b") },
  { handle: "c01/coastal/h-0003", type: "sea-geo", sizeKm: 0.2, region: "c01/r02", contentHash: h64("c") },
];
const ledgerOf = (rows) => {
  const handles = orderHandles({ handles: rows.map(({ rank, ...h }) => h) });
  return { continent: "c01", orderDigest: orderDigestOf({ handles }), handles };
};

// A two-node spine — n-w (world, 100x100 km) over n-c (continent, an 80x80 km
// polygon = 6,400 km²) — written into the fixture root so checkSpine has a
// TREE. Without one, G-TRUNK-AREA and G-SEALAND's divergence line have nothing
// to run against and checkSpine returns at its own soft-skip.
//
// It is BUILT here rather than copied from scripts/tests/fixtures/spine/base,
// which is stale: that fixture's nodes carry `interior: {units, perParentUnit}`
// with no `originInParent`/`size`, and gSpineFrames THROWS on the missing
// array (`check_content.mjs:2388`, "Cannot read properties of undefined
// (reading 'join')"). It is never run alone today — every spine-gates case is
// a full overlay — so the throw is latent. Recorded as a pre-existing finding;
// `check_spine_emit.mjs --write` is what fills those two fields in, and running
// it here is also what writes the spine/derived.json that G-DERIVED-DRIFT needs.
const spineNode = (o) => ({
  id: o.id, tier: o.tier, parentId: o.parentId, title: "T",
  provenance: { authored: "hand", generator: null, source: "fixture" },
  frozen: false, seed: { value: o.seed, epoch: 0, why: null },
  placement: o.placement, interior: { units: "km", perParentUnit: 1 },
  composition: { meadow: 100 }, interstitial: o.interstitial ?? null,
  interstitialUnsurveyed: o.interstitialUnsurveyed ?? false,
  compositionTolerance: null, toleranceWhy: null, features: [], bands: [],
  runtime: { mapIds: [], originU: null, spawnAreas: [], mobSettings: null,
             seedDemoNPCs: false, collision: "none" },
  representsNodeId: null, lore: {}, tags: [], levelBand: null,
});

function writeSpine(d, mutate) {
  mkdirSync(join(d, "spine/nodes"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/spine-node.schema.json"),
         join(d, "schemas/spine-node.schema.json"), { recursive: true });
  for (const f of ["load-budget.json", "coverage-budget.json"])
    cpSync(join(SPINE_FIX, "base/spine", f), join(d, "spine", f));
  writeFileSync(join(d, "spine/roots.json"), '["n-w"]\n');
  // gSpineWorld (Plan B's G-LANDFORM) runs only once a spine exists and reads
  // content/world/lexicon/landforms.json, so a root that has a spine must carry
  // the committed lexicon or it earns a failure that has nothing to do with the
  // rule under test.
  cpSync(join(ROOT, "content/world/lexicon"), join(d, "world/lexicon"), { recursive: true });
  const world = spineNode({ id: "n-w", tier: "world", parentId: null, seed: "70e11e3d1b50810c",
    placement: { shape: "rect", rect: { x: 0, y: 0, w: 100, h: 100 }, anchor: [50, 50] },
    interstitial: { meadow: 100 }, interstitialUnsurveyed: true });
  const continent = spineNode({ id: "n-c", tier: "continent", parentId: "n-w", seed: "d956be27b4fc7da6",
    placement: { shape: "polygon", points: square(10, 10, 80), anchor: [50, 50] } });
  mutate(continent);
  writeFileSync(join(d, "spine/nodes/n-w.json"), JSON.stringify(world, null, 2) + "\n");
  writeFileSync(join(d, `spine/nodes/${continent.id}.json`), JSON.stringify(continent, null, 2) + "\n");
  // Canonicalises interior.originInParent / interior.size and writes
  // spine/derived.json, which G-DERIVED-DRIFT compares byte for byte.
  execFileSync(process.execPath, [join(ROOT, "scripts/check_spine_emit.mjs"), "--write",
                                  "--content-root", d], { encoding: "utf8" });
}

function withFabric({ fabric = FABRIC_OK, world = WORLD_OK, handles = ledgerOf(LEDGER_ROWS),
                      spine = null, premise = null } = {}) {
  return worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    mkdirSync(join(d, "world/handles"), { recursive: true });
    if (fabric) writeFileSync(join(d, "world/fabric/continent-01.json"), JSON.stringify(fabric, null, 2) + "\n");
    if (world) writeFileSync(join(d, "world/fabric/world.json"), JSON.stringify(world, null, 2) + "\n");
    if (handles) writeFileSync(join(d, "world/handles/continent-01.json"), JSON.stringify(handles, null, 2) + "\n");
    if (premise) {
      mkdirSync(join(d, "world/premises"), { recursive: true });
      writeFileSync(join(d, "world/premises/continent-01.json"), JSON.stringify(premise, null, 2) + "\n");
    }
    if (spine) writeSpine(d, spine);
  } });
}

// The activation key, in one place: a generated continent node citing its
// fabric file is what wakes G-TRUNK-AREA up.
const pinFabric = (path = "content/world/fabric/continent-01.json") => (node) => {
  node.provenance = { authored: "generated", generator: { name: "mapforge", version: "3.0.0", fabric: path },
                      source: "content/world/premises/continent-01.json" };
};

// ── G-SEALAND ──────────────────────────────────────────────────────────────

test("G-SEALAND is green and REPORTS the ratio, naming the cells it counted", () => {
  const r = runWorld(withFabric());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-SEALAND: ratio 1\.50 \(net land 64000\.0 km², water 96000\.0 km²\) — band 1\.20–1\.80, measured on 377600 SEA \+ 6400 LAKE cells of 640000/);
});

test("G-SEALAND measures the FLAG FIELD, not the manifest — the manifest is untouched and the gate still fails", () => {
  // THE TEST THIS WHOLE GATE EXISTS FOR (STATE §11's ruling). The budget closes
  // by construction — 65,600 gross − 1,600 interior water = 64,000 net, and
  // rank selection returns its target BY DEFINITION — so a gate that derives
  // the ratio from `budget.grossLandPolygonKm2` / `budget.interiorWaterKm2` has
  // the manifest on both sides of its own test and CANNOT FAIL. Here the
  // manifest is byte-identical to the committed one and only the CELL CENSUS
  // says a different world: the pre-Plan-C chart's 6,243.5 km² of land.
  const land = 24974;                                   // 6,243.5 km² at 0.25 km²/cell
  const bad = clone(WORLD_OK);
  bad.census = { grossLandCells: land, lakeCells: 0, seaCells: 640000 - land, unownedLandCells: 0 };
  bad.areaKm2 = { netLand: 6243.5, water: 153756.5, total: 160000 };
  bad.seaToLandRatio = 24.63;
  const dir = withFabric({ world: bad });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "world/manifest.json"), "utf8")),
                   JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8")),
                   "the manifest must be the committed one — that is the point of this test");
  const r = runWorld(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SEALAND: world sea\/land is 24\.63 \(land 6243\.5 km², sea 153756\.5 km²\) — band is 1\.20–1\.80 \(land 57143–72727 km²\); re-run the sea-level rank selection, do not reroll toward the target/);
});

test("G-SEALAND fails when the flag field does not close in CELLS", () => {
  const bad = clone(WORLD_OK);
  bad.census.seaCells -= 4;
  const r = runWorld(withFabric({ world: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SEALAND: the flag field does not close — 262400 land \+ 377596 sea = 639996 cells against 640000 in the grid \(a cell is counted by neither\)/);
});

test("G-SEALAND fails on a closure gap in km² that closes perfectly in cells", () => {
  // A grid whose cells account for every cell it has and STILL misses the
  // frame: 600,000 cells at 0.25 km² is 150,000 km², not 160,000. The cell
  // closure above cannot see this and the km² closure cannot see a double count
  // — two rules, two different facts.
  const bad = clone(WORLD_OK);
  bad.grid = { w: 800, h: 750, cells: 600000 };
  bad.census = { grossLandCells: 262400, lakeCells: 6400, seaCells: 337600, unownedLandCells: 12 };
  bad.areaKm2 = { netLand: 64000, water: 86000, total: 150000 };
  bad.seaToLandRatio = 1.34375;
  const r = runWorld(withFabric({ world: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SEALAND: land \+ sea = 150000 km² != 160000 ± 1 — 12 cells are unowned/);
  assert.doesNotMatch(r.out, /the flag field does not close/, "this world closes in cells; only the frame is missed");
});

test("G-SEALAND fails when more cells carry LAKE than there is land to carve it from", () => {
  const bad = clone(WORLD_OK);
  bad.census.lakeCells = bad.census.grossLandCells + 1;
  const r = runWorld(withFabric({ world: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SEALAND: 262401 LAKE cells against 262400 gross land cells — a lake is carved INSIDE gross land and cannot exceed it/);
});

test("G-SEALAND fails when world.json's DECLARED areas disagree with its own census", () => {
  // What a hand-edited world.json looks like. The census is untouched and
  // correct; the summary numbers beside it are not.
  for (const [key, value, re] of [
    ["netLand", 70000, /declares areaKm2\.netLand 70000 km² and its own cell census measures 64000\.0 km²/],
    ["water", 90000, /declares areaKm2\.water 90000 km² and its own cell census measures 96000\.0 km²/],
    ["total", 150000, /declares areaKm2\.total 150000 km² and its own cell census measures 160000\.0 km²/],
  ]) {
    const bad = clone(WORLD_OK);
    bad.areaKm2[key] = value;
    const r = runWorld(withFabric({ world: bad }));
    assert.equal(r.code, 1, `${key}: ${r.out}`);
    assert.match(r.out, re, key);
    assert.match(r.out, /the census is the authority/, key);
  }
});

test("G-SEALAND fails when the declared seaToLandRatio disagrees with the census", () => {
  const bad = clone(WORLD_OK);
  bad.seaToLandRatio = 1.42;
  const r = runWorld(withFabric({ world: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SEALAND: world\.json declares seaToLandRatio 1\.42 and its own cell census measures 1\.5000 — the census is the authority/);
});

test("G-SEALAND names the terms it cannot read, and does not throw on any of them", () => {
  for (const [label, mutate, re] of [
    ["census gone", (w) => { delete w.census; }, /census\.grossLandCells, census\.lakeCells, census\.seaCells, census\.unownedLandCells are not a finite number/],
    ["cellKm a string", (w) => { w.cellKm = "0.5"; }, /cellKm is not a finite number/],
    ["cells NaN", (w) => { w.grid.cells = null; }, /grid\.cells is not a finite number/],
  ]) {
    const bad = clone(WORLD_OK);
    mutate(bad);
    const r = runWorld(withFabric({ world: bad }));
    assert.equal(r.code, 1, `${label}: ${r.out}`);
    assert.match(r.out, /G-SEALAND: world\/fabric\/world\.json cannot be measured/, label);
    assert.match(r.out, re, label);
    assert.doesNotMatch(r.out, /check-content: \w*Error/, `${label}: a stack trace means the gate threw`);
    assert.match(r.out, /content-gate: .* failures,/, `${label}: finish() did not run`);
  }
});

test("G-SEALAND prints the TRUNK DIVERGENCE whenever there is a trunk to diverge from", () => {
  // The two layers describe different worlds until Plan E's redraw and that is
  // INTENDED — the committed trunk still says 24.68 : 1 while the fabric says
  // 1.50 : 1. A green ratio must never be read as "the chart is redrawn", so
  // the gate says both numbers out loud side by side.
  const r = runWorld(withFabric({ spine: () => {} }));
  assert.match(r.out, /G-SEALAND: trunk land 6400\.0 km² vs fabric net land 64000\.0 km² — the trunk is redrawn in Plan E, not here/);
});

test("…and OMITS it, rather than printing null, on a root with a fabric and no spine", () => {
  const r = runWorld(withFabric());
  assert.match(r.out, /G-SEALAND: ratio/, "the measurable half still runs");
  assert.doesNotMatch(r.out, /G-SEALAND: trunk land/,
    "there is no trunk on this root — the line must be absent, not `null km²`");
});

// ── G-TRUNK-AREA ───────────────────────────────────────────────────────────

test("G-TRUNK-AREA is DORMANT — and SILENT — when no trunk node cites a fabric file", () => {
  for (const [label, dir] of [["no spine at all", withFabric()],
                              ["a hand-authored spine", withFabric({ spine: () => {} })]])
    assert.ok(!/G-TRUNK-AREA:/.test(runWorld(dir).out), `${label}: G-TRUNK-AREA spoke with nothing to score`);
});

test("G-TRUNK-AREA is LIVE the moment a node cites its fabric, and says what it scored", () => {
  const r = runWorld(withFabric({ spine: pinFabric() }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-TRUNK-AREA: scored 1 nodes \(1 against a fabric census, 0 against the manifest\), worst drift \+0\.00% on n-c — tolerance ±3%/);
});

test("G-TRUNK-AREA fails past ±3% and the message names the remedy", () => {
  const thin = clone(FABRIC_OK);
  thin.cellCensus.land = 24000;                       // 6,000 km² against a 6,400 km² polygon
  const r = runWorld(withFabric({ fabric: thin, spine: pinFabric() }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-TRUNK-AREA: n-c: trunk polygon 6400\.0 km² vs fabric gross census 6000\.0 km² \(\+6\.7%, tolerance ±3%\) — re-simplify the outline from the fabric, do not hand-edit the ring/);
});

test("G-TRUNK-AREA scores GROSS land, not the NET land the regions tile", () => {
  // THE PLAN ERROR, reproduced. `cellCensus.land` is the NET land regions tile;
  // the trunk polygon is the COAST CONTOUR and encloses the continent's
  // interior lakes, so the two differ by exactly interiorWaterKm2. Measured on
  // the real draft root under the plan's rule: c02 Wealdmarch +9.54% and c06
  // Reedstrand +5.22% against ±3% — two failures on a correct world. Here the
  // same shape in miniature: 4,000 lake cells is 1,000 km², 15.6% of the
  // polygon, so the NET reading fails and the GROSS reading is exact.
  const lakey = clone(FABRIC_OK);
  lakey.cellCensus = { land: 21600, lake: 4000, unowned: 0 };
  const r = runWorld(withFabric({ fabric: lakey, spine: pinFabric() }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-TRUNK-AREA: scored 1 nodes .* worst drift \+0\.00% on n-c/);
});

test("G-TRUNK-AREA fails on a fabric path that does not resolve", () => {
  const r = runWorld(withFabric({ spine: pinFabric("content/world/fabric/continent-09.json") }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-TRUNK-AREA: n-c: provenance\.generator\.fabric "content\/world\/fabric\/continent-09\.json" does not resolve/);
});

test("a node citing world.json is scored against the manifest, not silently skipped", () => {
  // The twelve generated OCEAN and SEA nodes cite content/world/fabric/
  // world.json, which loadFabric returns SEPARATELY from the per-continent
  // files — so the plan's byPath map reported `does not resolve` on all twelve.
  // A water polygon has no land census to be scored against; skipping it in
  // silence is the dormant-gate failure this task exists to prevent, so it is
  // scored against the manifest's own declared polygonKm2.
  const ocean = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8")).oceans[0];
  const dir = withFabric({ spine: (node) => {
    pinFabric("content/world/fabric/world.json")(node);
    node.id = ocean.nodeId; node.tier = "ocean";
    // 41,800 km² declared; a 204.4 x 204.4 km square is 41,779 km², −0.05%.
    node.placement = { shape: "polygon", points: square(0, 0, 204.4), anchor: [102.2, 102.2] };
  } });
  const r = runWorld(dir);
  assert.match(r.out, /G-TRUNK-AREA: scored 1 nodes \(0 against a fabric census, 1 against the manifest\)/);
  assert.match(r.out, /worst drift -0\.05% on n-galereach/);
});

test("a node citing world.json that the manifest does not declare is a failure, not a skip", () => {
  const r = runWorld(withFabric({ spine: pinFabric("content/world/fabric/world.json") }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-TRUNK-AREA: n-c: cites content\/world\/fabric\/world\.json, which carries no per-node land census, and content\/world\/manifest\.json declares no polygonKm2 for it either/);
});

// ── G-PROVENANCE, the fabric pin ───────────────────────────────────────────

test("G-PROVENANCE: a GENERATED continent with no generator.fabric fails — that pin is G-TRUNK-AREA's activation key", () => {
  const dir = withFabric({ spine: (node) => {
    node.provenance = { authored: "generated", generator: { name: "mapforge", version: "3.0.0" },
                        source: "fixture" };
  } });
  const r = runWorld(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-PROVENANCE: n-c: generator\.fabric is missing — polygon and fabric can disagree/);
  assert.ok(!/G-TRUNK-AREA:/.test(r.out), "and the gate it feeds is dormant, which is the point");
});

test("G-PROVENANCE's fabric pin is CONTINENT-only and does not fire on a hand-authored node", () => {
  const dir = withFabric({ spine: (node) => {
    node.tier = "continent";
    node.provenance = { authored: "hand", generator: null, source: "fixture" };
  } });
  assert.doesNotMatch(runWorld(dir).out, /G-PROVENANCE: n-c/);
  // …and the committed 44-node root has no `generated` node at all, which is
  // why this rule is dormant there. If that ever stops being true the assertion
  // below is what says so.
  const nodes = readdirSync(join(ROOT, "content/spine/nodes"))
    .map((f) => JSON.parse(readFileSync(join(ROOT, "content/spine/nodes", f), "utf8")));
  assert.equal(nodes.filter((n) => n.provenance?.authored === "generated").length, 0,
    "a committed generated node would make G-PROVENANCE's fabric pin live on the real root");
});

// ── G-POI ──────────────────────────────────────────────────────────────────

test("G-POI prints its census on every run", () => {
  const r = runWorld(withFabric());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-POI: 1 surveyed regions \(band 12–30: 0 thin, 0 over\) and 1 reported regions \(must be 0\)/);
});

test("G-POI: a surveyed region below 12 points of interest fails", () => {
  const thin = clone(FABRIC_OK);
  thin.instances = thin.instances.filter((x) => x.region !== "c01/r01")
    .concat(thin.instances.filter((x) => x.region === "c01/r01").slice(0, 3));
  const r = runWorld(withFabric({ fabric: thin }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POI: region c01\/r01 \(surveyed\) has 4 points of interest — band is 12–30/);
  assert.match(r.out, /G-POI: 1 surveyed regions \(band 12–30: 1 thin, 0 over\)/);
  assert.match(r.out, /thin: c01\/r01 4/);
});

test("G-POI: a surveyed region ABOVE 30 fails too — the band has two sides", () => {
  const fat = clone(FABRIC_OK);
  fat.instances = fat.instances.concat(
    Array.from({ length: 20 }, (_, n) => instance(100 + n, "c01/r01")));
  const r = runWorld(withFabric({ fabric: fat }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POI: region c01\/r01 \(surveyed\) has 39 points of interest — band is 12–30/);
});

test("G-POI: a reported region with interior detail fails", () => {
  const detailed = clone(FABRIC_OK);
  detailed.settlements.push({ id: "c01/s02", title: "Villageton", rank: "village", atKm: [70, 30],
                              cell: [140, 60], region: "c01/r02", continent: "c01", score: 0.5 });
  detailed.regions[1].settlements = ["c01/s02"];
  const r = runWorld(withFabric({ fabric: detailed }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POI: region c01\/r02 \(reported\) has 1 points of interest — must be 0/);
});

test("G-POI: a dungeon anchor counts as a point of interest wherever it lands", () => {
  const anchored = clone(FABRIC_OK);
  anchored.dungeonAnchors.push({ handle: "c01/coastal/h-0018", continent: "c01", region: "c01/r02",
                                 entranceType: "sea-arch", hopsToSettlement: 1 });
  const r = runWorld(withFabric({ fabric: anchored }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POI: region c01\/r02 \(reported\) has 1 points of interest — must be 0/);
});

test("G-POI: a reported region's ONE named landform is exempt (spec §6.4 rule 2)", () => {
  const named = clone(FABRIC_OK);
  named.instances.find((x) => x.region === "c01/r02").named = true;
  const r = runWorld(withFabric({ fabric: named }));
  assert.equal(r.code, 0, r.out);
});

test("G-POI: …but TWO named landforms in one reported region is not — the exemption is `at most one`", () => {
  // The plan's exemption is UNBOUNDED: it simply does not count a named
  // instance in a reported region, so five of them passed. Spec §6.4 rule 2 is
  // "at most one named landform", and measured on the draft root exactly 60
  // reported regions carry exactly one each — the cap is at its limit
  // everywhere it applies, so a sixty-first mark is precisely what it catches.
  const named = clone(FABRIC_OK);
  for (const x of named.instances.filter((y) => y.region === "c01/r02").slice(0, 2)) x.named = true;
  const r = runWorld(withFabric({ fabric: named }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POI: region c01\/r02 \(reported\) carries 2 named landforms — spec §6\.4 rule 2 allows at most one/);
});

test("G-POI: a reported region carrying a terrainKind fails", () => {
  const bad = clone(FABRIC_OK);
  bad.regions[1].terrainKind = "karst-plateau";
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POI: region c01\/r02 is reported but carries terrainKind "karst-plateau" — reported ⇒ terrainKind null/);
});

test("G-POI: an instance, settlement or anchor naming a region the file does not hold is named, not dropped", () => {
  for (const [label, mutate, re] of [
    ["instance", (f) => { f.instances[0].region = "c01/r09"; },
     /G-POI: instance lf-c01-r01-0000 names region "c01\/r09", which is not in continent-01\.json/],
    ["settlement", (f) => { f.settlements[0].region = "c01/r09"; },
     /G-POI: settlement c01\/s01 names region "c01\/r09", which is not in continent-01\.json/],
    ["anchor", (f) => { f.dungeonAnchors.push({ handle: "c01/coastal/h-0001", continent: "c01",
                                                region: "c01/r09", entranceType: "sea-arch",
                                                hopsToSettlement: 0 }); },
     /G-POI: dungeon anchor c01\/coastal\/h-0001 names region "c01\/r09", which is not in continent-01\.json/],
  ]) {
    const bad = clone(FABRIC_OK);
    mutate(bad);
    const r = runWorld(withFabric({ fabric: bad }));
    assert.equal(r.code, 1, `${label}: ${r.out}`);
    assert.match(r.out, re, label);
  }
});

// ── G-ORDER ────────────────────────────────────────────────────────────────

test("G-ORDER prints what it recomputed", () => {
  const r = runWorld(withFabric());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-ORDER: 1 handle ledgers, 3 handles, each order recomputed from \(-sizeKm, contentHash\) and compared to its committed digest/);
});

test("G-ORDER fails on a drifted orderDigest", () => {
  const hs = ledgerOf(LEDGER_ROWS);
  hs.orderDigest = "sha256:" + "0".repeat(64);
  const r = runWorld(withFabric({ handles: hs }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: c01 orderDigest sha256:0{64} != computed sha256:[0-9a-f]{64}/);
});

test("G-ORDER fails on a ledger listed OUT OF ORDER, which the digest alone cannot see", () => {
  // The digest is computed over the RECOMPUTED order, so reversing the stored
  // list leaves it byte-identical. Clause (2) is blind here and only the
  // position comparison catches it — which is why both exist.
  const hs = ledgerOf(LEDGER_ROWS);
  hs.handles = [...hs.handles].reverse();
  const before = orderDigestOf({ handles: orderHandles({ handles: hs.handles.map(({ rank, ...h }) => h) }) });
  assert.equal(hs.orderDigest, before, "the digest must still match — that is what makes this test necessary");
  const r = runWorld(withFabric({ handles: hs }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: c01 lists "c01\/coastal\/h-0003" at position 0, but the \(-sizeKm, contentHash\) order puts "c01\/coastal\/h-0001" there/);
});

test("G-ORDER fails on a rank that is not a DENSE PERMUTATION — clause (3), which the plan's code omits", () => {
  // R3's mitigation is three-part and the plan's own comment claims all three
  // while its code carries two. A hand-edit that drops a row and leaves the
  // remaining ranks alone survives the digest if the digest is recomputed by
  // the same hand; it cannot survive 0..n-1 having a hole.
  const hs = ledgerOf(LEDGER_ROWS);
  hs.handles.splice(1, 1);                              // ranks now 0 and 2 over two rows
  hs.orderDigest = orderDigestOf({ handles: hs.handles });
  const r = runWorld(withFabric({ handles: hs }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: c01 handle "c01\/coastal\/h-0003" has rank 2, outside 0\.\.1/);
});

test("G-ORDER fails when two rows claim the same rank", () => {
  const hs = ledgerOf(LEDGER_ROWS);
  hs.handles[2].rank = 1;
  hs.orderDigest = orderDigestOf({ handles: hs.handles });
  const r = runWorld(withFabric({ handles: hs }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: c01 lists rank 1 twice — the order is not a dense permutation of 0\.\.2/);
});

test("G-ORDER fails when two handles share the WHOLE ordering key", () => {
  // The plan compares `sizeKm * sizeKm` and calls it area — squaring is
  // monotone on positive numbers, so it is the same order under a wrong name,
  // and the message it prints ("differ by 0 km²") reads as though size alone
  // decides. The key is the PAIR and two rows are unordered only when both
  // terms match.
  const rows = [
    { handle: "c01/coastal/h-0001", type: "sea-stack", sizeKm: 0.2, region: "c01/r01", contentHash: h64("same") },
    { handle: "c01/coastal/h-0002", type: "sea-stack", sizeKm: 0.2, region: "c01/r01", contentHash: h64("same") },
  ];
  const r = runWorld(withFabric({ handles: ledgerOf(rows) }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: c01\/coastal\/h-000\d and c01\/coastal\/h-000\d share the whole ordering key \(sizeKm 0\.2, contentHash sha256:[0-9a-f]{64}\) — ordering is not total/);
});

test("G-ORDER: an EQUAL size with different content hashes is legal — the hash breaks the tie", () => {
  const rows = [
    { handle: "c01/coastal/h-0001", type: "sea-stack", sizeKm: 0.2, region: "c01/r01", contentHash: h64("a") },
    { handle: "c01/coastal/h-0002", type: "sea-stack", sizeKm: 0.2, region: "c01/r01", contentHash: h64("b") },
  ];
  const r = runWorld(withFabric({ handles: ledgerOf(rows) }));
  assert.equal(r.code, 0, r.out);
});

test("G-ORDER fails on a duplicate handle and on a handle outside the grammar", () => {
  const dup = ledgerOf(LEDGER_ROWS);
  dup.handles[1].handle = dup.handles[0].handle;
  dup.orderDigest = orderDigestOf({ handles: dup.handles });
  let r = runWorld(withFabric({ handles: dup }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: c01 lists handle "c01\/coastal\/h-0001" twice/);

  // The grammar check is the gate's, NOT the schema's: the schema rejects this
  // too, and checkSpine continues past a schema-invalid document, so both
  // messages must appear or one of the two rules is dead code.
  const bad = ledgerOf(LEDGER_ROWS);
  bad.handles[0].handle = "c01/Coastal/h-ZZZZ";
  bad.orderDigest = orderDigestOf({ handles: bad.handles });
  r = runWorld(withFabric({ handles: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-ORDER: handle "c01\/Coastal\/h-ZZZZ" does not match the grammar cNN\/<group>\/h-<hex>/);
  assert.match(r.out, /world\/handles\/continent-01\.json: schema \/handles\/0\/handle must match pattern/);
});

// ── G-POLY and G-VERTEX-BUDGET over the fabric ─────────────────────────────

test("G-POLY prints what it walked, instances AND region rings", () => {
  const r = runWorld(withFabric());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-POLY: 0 area \+ 0 line \+ 26 point instances, 2 region rings and 0 holes checked — widest instance 0\/40, widest region 4\/200/);
});

test("G-POLY red: a backwards-wound area instance fails, and the message names the rule", () => {
  const bad = clone(FABRIC_OK);
  bad.instances[1].geometry = { shape: "area", ring: [...square(1, 1, 2)].reverse() };
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POLY: instance lf-c01-r01-0001 ring winding is -4\.000000 — a ring must be OPEN with a STRICTLY POSITIVE signed shoelace/);
});

test("G-POLY red: a self-intersecting area instance fails", () => {
  const bad = clone(FABRIC_OK);
  bad.instances[1].geometry = { shape: "area", ring: [[0, 0], [4, 4], [4, 0], [0, 4]] };
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POLY: instance lf-c01-r01-0001 ring self-intersects/);
});

test("G-VERTEX-BUDGET red: a 41-vertex instance ring is NAMED, not left to ajv", () => {
  const bad = clone(FABRIC_OK);
  // A convex 41-gon on an integer lattice: a staircase up and a straight run
  // back, positively wound and simple, so ONLY the vertex cap can object.
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push([i, i * i * 0.001]);
  pts.push([39, 100]);
  bad.instances[1].geometry = { shape: "area", ring: pts };
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-VERTEX-BUDGET: instance lf-c01-r01-0001 ring has 41 vertices > 40 for tier landform-instance/);
  // …and ajv says so too, bluntly. Both, or one of the two rules is dead.
  assert.match(r.out, /world\/fabric\/continent-01\.json: schema \/instances\/1\/geometry.*40 items/);
});

test("G-VERTEX-BUDGET red: a 41-point LINE instance takes the cap and nothing else", () => {
  const bad = clone(FABRIC_OK);
  bad.instances[1].geometry = { shape: "line", points: Array.from({ length: 41 }, (_, i) => [i, 0]) };
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-VERTEX-BUDGET: instance lf-c01-r01-0001 ring has 41 vertices > 40 for tier landform-instance/);
  assert.doesNotMatch(r.out, /G-POLY: instance lf-c01-r01-0001/,
    "a line has no winding and no closure — closing it would reject every two-point levee");
});

test("the REGION half of the same coverage seam: a backwards-wound region ring fails", () => {
  // spec §8.4 names the 160 regions in the same sentence as the 1,740
  // instances: neither is a spine node, so G-POLY and G-VERTEX-BUDGET — which
  // walk tree.byId.values() — can see neither.
  const bad = clone(FABRIC_OK);
  bad.regions[0].rings = [[...square(10, 10, 40)].reverse()];
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POLY: region c01\/r01 ring winding is -1600\.000000 — a ring must be OPEN with a STRICTLY POSITIVE signed shoelace/);
});

test("a region HOLE is a boundary too, and takes the same winding rule", () => {
  const bad = clone(FABRIC_OK);
  bad.regions[0].holes = [[...square(20, 20, 5)].reverse()];
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POLY: region c01\/r01 hole winding is -25\.000000/);
});

test("G-VERTEX-BUDGET red: a 201-vertex region ring is named", () => {
  const bad = clone(FABRIC_OK);
  const pts = [];
  for (let i = 0; i < 200; i++) pts.push([i * 0.1, i * i * 0.0001]);
  pts.push([19.9, 100]);
  bad.regions[0].rings = [pts];
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-VERTEX-BUDGET: region c01\/r01 ring has 201 vertices > 200 for tier region/);
  assert.match(r.out, /world\/fabric\/continent-01\.json: schema \/regions\/0\/rings\/0.*200 items/);
});

// ── the schema venues ──────────────────────────────────────────────────────

test("fabric-file.schema.json is APPLIED, and it is additionalProperties:false", () => {
  const bad = clone(FABRIC_OK);
  bad.sneakyKey = 5;
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/fabric\/continent-01\.json: schema \/ must NOT have additional properties/);
});

test("the $ref into landform-instance.schema.json RESOLVES — an unvalidated instance would be silent", () => {
  // compileSchema compiles each schema standalone with a fresh Ajv, so a
  // cross-file $ref resolves only because checkWorld registers the referenced
  // file first. If the registration is dropped ajv throws at compile time and
  // the whole fabric family goes unvalidated — which is why the ref is a
  // FAILURE path, not a silent skip. This test is the proof it is wired: the
  // extra key is inside an INSTANCE, which only the $ref'd schema forbids.
  const bad = clone(FABRIC_OK);
  bad.instances[0].sneakyKey = 5;
  const r = runWorld(withFabric({ fabric: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/fabric\/continent-01\.json: schema \/instances\/0 must NOT have additional properties/);
});

test("an unreadable $ref target is one clean failure, not a throw out of the gate", () => {
  const dir = withFabric();
  writeFileSync(join(dir, "schemas/landform-instance.schema.json"), "{ not json");
  const r = runWorld(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/fabric schema \$ref: cannot read\/parse .*landform-instance\.schema\.json/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/, "a stack trace means the gate threw");
  assert.match(r.out, /content-gate: .* failures,/, "finish() did not run");
});

test("handle-ledger.schema.json is applied and is additionalProperties:false", () => {
  const hs = ledgerOf(LEDGER_ROWS);
  hs.handles[0].sneaky = 1;
  const r = runWorld(withFabric({ handles: hs }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/handles\/continent-01\.json: schema \/handles\/0 must NOT have additional properties/);
});

test("premise.schema.json finally has an AJV VENUE — it was compiled by nothing until now", () => {
  // STATE §10's open item, handed to Task 11. mask.test.mjs holds the join in
  // both directions, which is a test of the committed thirteen and not a gate
  // on a content root: a draft or fixture root could carry a mistyped premise
  // and no gate would say so.
  const real = JSON.parse(readFileSync(join(ROOT, "content/world/premises/continent-01.json"), "utf8"));
  assert.equal(runWorld(withFabric({ premise: real })).code, 0);
  const bad = clone(real);
  bad.register = "not-a-register";
  const r = runWorld(withFabric({ premise: bad }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/premises\/continent-01\.json: schema \/register must be equal to one of the allowed values/);
});

// ── the two byte budgets that did not exist ────────────────────────────────

test("the premises and handles families are MEASURED, and the committed caps are derived from the tree", () => {
  const b = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.deepEqual(b.premises, { maxFiles: 13, maxBytesPerFile: 4096 });
  assert.deepEqual(b.handles, { maxFiles: 13, maxBytesPerFile: 131072, maxBytesTotal: 524288 });
  // maxFiles 13 is not a round number, it is the manifest's landmass count.
  const manifest = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  assert.equal(b.premises.maxFiles, manifest.landmasses.length);
  assert.equal(b.handles.maxFiles, manifest.landmasses.length);
  // …and the committed premises are inside their own cap, measured not assumed.
  const dir = join(ROOT, "content/world/premises");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 13);
  for (const f of files)
    assert.ok(statSync(join(dir, f)).size <= b.premises.maxBytesPerFile,
      `${f} is over the per-file premise budget`);
  const r = runWorld(withFabric());
  assert.match(r.out, /world-budget: premises 0 files, 0 bytes \(budget 13 files, 4096 B\/file\)/);
  assert.match(r.out, /world-budget: handles 1 files, \d+ bytes \(budget 13 files, 131072 B\/file, 524288 B total\)/);
});

test("G-WORLD-BUDGET fails on an oversized premise, an oversized ledger and a missing section", () => {
  const over = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/premises"), { recursive: true });
    writeFileSync(join(d, "world/premises/continent-01.json"), JSON.stringify({ pad: "x".repeat(5000) }));
  } });
  let r = runWorld(over);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/premises\/continent-01\.json is \d+ bytes > per-file budget 4096/);

  const big = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/handles"), { recursive: true });
    for (let i = 0; i < 5; i++)
      writeFileSync(join(d, `world/handles/continent-0${i}.json`), JSON.stringify({ pad: "x".repeat(120000) }));
  } });
  r = runWorld(big);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/handles totals \d+ bytes > budget 524288/);
  assert.doesNotMatch(r.out, /world\/handles\/continent-00\.json is \d+ bytes > per-file/,
    "every file here is inside the per-file cap — only the aggregate can fire");

  for (const fam of ["premises", "handles"]) {
    const dir = worldFixture({ mutate: editBudgets((b) => { delete b[fam]; }) });
    r = runWorld(dir);
    assert.equal(r.code, 1, `${fam}: ${r.out}`);
    assert.match(r.out, new RegExp(`G-WORLD-BUDGET: world/budgets\\.json has no "${fam}" section`), fam);
  }
});

// ── the soft skip, which is the thing that can red 45 unrelated fixtures ───

test("NOT ONE of the five new gates speaks on a content root with no world/", () => {
  const spineFix = join(ROOT, "scripts/tests/fixtures/spine");
  const roots = readdirSync(spineFix, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.ok(roots.length > 0, "no spine fixtures found — this test would pass vacuously");
  for (const e of roots) {
    const r = runSpineGateInProcess({ argv: ["--only=spine", "--content-root", join(spineFix, e.name)] });
    assert.ok(!/G-SEALAND|G-TRUNK-AREA|G-POI:|G-ORDER:|G-POLY: \d+ area/.test(r.out),
      `${e.name}: a world gate spoke on a root with no world/: ${r.out}`);
  }
});

test("a world/ with no fabric at all — today's committed root — runs the gates and finds nothing to say", () => {
  const r = runWorld(worldFixture());
  assert.equal(r.code, 0, r.out);
  for (const re of [/G-SEALAND/, /G-TRUNK-AREA/, /G-POI:/, /G-ORDER:/, /G-POLY: \d+ area/])
    assert.doesNotMatch(r.out, re, "the fabric is committed by Task 13; until then there is nothing to measure");
  assert.match(r.out, /world-budget: fabric 0 files/, "…and the budget family still measures, at zero");
});

test("the base fixture's budgets file IS the committed one too, for the same reason as the manifest", () => {
  // The fixture's landforms section had drifted: it was missing
  // `typeCoverageFloor` and `dungeonCapableTypes`, so the day a spine was added
  // beside a world/ in this file every red case started failing on
  // `G-LANDFORM: 23 dungeonCapable types, budget pins undefined` instead of on
  // the mutation under test. One assertion removes the whole class.
  const real = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const fixture = JSON.parse(readFileSync(join(FIX, "base/world/budgets.json"), "utf8"));
  assert.deepEqual(fixture, real,
    "scripts/tests/fixtures/world/base/world/budgets.json has drifted from content/world/budgets.json — " +
      "copy the real one across rather than editing the fixture");
});

test("a fabric file with no regions array is a SCHEMA failure — G-POI skips it, the schema does not", () => {
  // The other half of gWorldPoi's skip. Plan B's G-LANDFORM fixtures write
  // `world/fabric/c01.json` as a stub carrying only `instances`; attributing
  // POIs there produced 120 orphan failures on four committed tests. The
  // missing key is shape, and shape has a venue.
  const stub = { instances: [] };
  const r = runWorld(withFabric({ fabric: stub }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world\/fabric\/continent-01\.json: schema \/ must have required property 'regions'/);
  assert.doesNotMatch(r.out, /G-POI: region/, "there are no regions to have an opinion about");
});
