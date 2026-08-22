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
import { BIOMES } from "../lib/spine.mjs";

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
