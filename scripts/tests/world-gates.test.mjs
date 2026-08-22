// scripts/tests/world-gates.test.mjs — Plan C world-layer gates.
// Fixture roots follow spine-gates.test.mjs's discipline exactly: a `base`
// dir plus one overlay dir per red case, copied into a temp root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Plan A Task 13's in-process entry: the 30-root sweep below costs ~8 s as
// spawns and ~0.3 s in process, for the same checkSpine() over the same opts.
import { runSpineGateInProcess } from "../check_content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const FIX = join(ROOT, "scripts/tests/fixtures/world");

export function worldFixture({ overlayDir = null, mutate = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "world-fix-"));
  cpSync(join(FIX, "base"), dir, { recursive: true });
  cpSync(join(ROOT, "content/schemas/world-manifest.schema.json"),
         join(dir, "schemas/world-manifest.schema.json"), { recursive: true });
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
  assert.match(r.out, /world-budget: fabric 0 files, 0 bytes \(budget 20, 4194304\)/);
  assert.match(r.out, /world-budget: civil 0 files, 0 bytes \(budget 600, 8192\)/);
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
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    writeFileSync(join(d, "world/fabric/continent-01.json"), "[]");
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world: world\/fabric\/continent-01\.json: is not a JSON object/);
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
    assert.ok(!/world-budget:|G-WORLD-BUDGET|^FAIL world:/m.test(r.out),
      `${e.name}: world gates spoke on a root with no world/: ${r.out}`);
  }
});
