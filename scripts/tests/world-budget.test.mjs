// Plan B Task 5 — the grown vocabulary, the world budget file, and the two
// gates that read them. Both PRINT on every run (the G-LOAD-BUDGET /
// G-COMP-REPORT discipline) so drift is visible before it is a failure;
// G-LANDFORM SCORES coverage and fails only below the floor.
//
// Two deliberate departures from the plan's transcription of this file, both
// recorded so a reviewer does not have to discover them in a diff:
//
//  1. The gate runs IN-PROCESS via `runSpineGateInProcess` rather than
//     `execFileSync`. world-fill-STATE.md §4 names that export as the one new
//     gate fixture tests should use, and it resets all six module-level
//     bindings on entry. Seven spawns of a 0.6 s gate is 4 s of wall time this
//     file does not need to spend.
//  2. `tmpRoot()` puts the copied tree at `<tmp>/content`, not at `<tmp>`
//     itself. G-SHEET-BUDGET measures `<contentRoot>/../game-client/assets/
//     art/maps`, so a content root sitting directly in os.tmpdir() would
//     reach into a SHARED directory that other suites also write to. One
//     level of nesting makes every fixture's sheet census private, and is
//     what lets the sheet-cap rules below be tested at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BIOMES, TERRAIN_KINDS, TERRAIN_IMPLIES } from "../lib/spine.mjs";
import { runSpineGateInProcess } from "../check_content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEX_PATH = join(ROOT, "content/world/lexicon/landforms.json");
const LEX = JSON.parse(readFileSync(LEX_PATH, "utf8"));
const BUDGETS = JSON.parse(
  readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"),
);

// `<tmp>/content` — see note 2 in the header.
function tmpRoot() {
  const base = mkdtempSync(join(tmpdir(), "world-budget-"));
  const contentRoot = join(base, "content");
  cpSync(join(ROOT, "content"), contentRoot, { recursive: true });
  return {
    base,
    contentRoot,
    drop: () => rmSync(base, { recursive: true, force: true }),
  };
}
function runGate(contentRoot, ...extra) {
  return runSpineGateInProcess({
    argv: ["--content-root", contentRoot, "--only=spine", ...extra],
  });
}
const readNode = (contentRoot, id) =>
  JSON.parse(
    readFileSync(join(contentRoot, "spine/nodes", `${id}.json`), "utf8"),
  );
const writeNode = (contentRoot, id, doc) =>
  writeFileSync(
    join(contentRoot, "spine/nodes", `${id}.json`),
    JSON.stringify(doc, null, 2) + "\n",
  );
const writeJson = (path, doc) =>
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");

// ── the vocabulary ─────────────────────────────────────────────────────────

test("BIOMES is exactly the 20 pinned ids in the pinned order", () => {
  assert.deepEqual(
    [...BIOMES],
    [
      "ocean",
      "ice",
      "marsh",
      "river",
      "meadow",
      "forest",
      "bramble",
      "rock",
      "upland",
      "alkali",
      "ash",
      "built",
      "tundra",
      "lake",
      "scree",
      "karst",
      "badland",
      "desert",
      "lava",
      "reef",
    ],
  );
});

test("TERRAIN_KINDS is exactly the 18 pinned ids in the pinned order", () => {
  assert.deepEqual(
    [...TERRAIN_KINDS],
    [
      "ice",
      "upland",
      "alkali-flat",
      "rim",
      "bramble",
      "headland",
      "river-country",
      "tundra-steppe",
      "sand-sea",
      "badlands",
      "karst-plateau",
      "volcanic-arc",
      "lava-field",
      "cloud-forest",
      "reef-shelf",
      "fjordland",
      "lake-country",
      "tidal-mire",
    ],
  );
});

test("every terrain kind implies at least one biome, and every implied biome is a biome", () => {
  assert.equal(Object.keys(TERRAIN_IMPLIES).length, 18);
  for (const kind of TERRAIN_KINDS) {
    const implied = TERRAIN_IMPLIES[kind];
    assert.ok(
      Array.isArray(implied) && implied.length > 0,
      `${kind}: no implication`,
    );
    for (const b of implied)
      assert.ok(BIOMES.includes(b), `${kind} implies non-biome "${b}"`);
  }
});

// Plan Step 10 (b): a kind implying three or more biomes is unusable, because
// G-TERRAINKIND demands >= 15% of composition for EACH implied biome and a
// region has only 100 points to spend across everything else too.
test("no terrain kind implies three or more biomes", () => {
  for (const kind of TERRAIN_KINDS)
    assert.ok(
      TERRAIN_IMPLIES[kind].length <= 2,
      `${kind} implies ${TERRAIN_IMPLIES[kind].length} biomes — unusable under G-TERRAINKIND's 15% floor`,
    );
});

test("TERRAIN_IMPLIES has a row for every kind and no row for a non-kind", () => {
  assert.deepEqual(
    Object.keys(TERRAIN_IMPLIES).sort(),
    [...TERRAIN_KINDS].sort(),
  );
});

test("every biome named by a lexicon row is in BIOMES", () => {
  for (const r of LEX)
    for (const b of r.biomes)
      assert.ok(BIOMES.includes(b), `${r.id}: biome "${b}" is outside BIOMES`);
});

// The join above only bites if the lexicon actually EXERCISES the new half of
// the vocabulary. It does — 8 of the 19 distinct strings the 170 rows name
// were outside the old 12, across 93 rows. Without this assertion the join
// could be satisfied by a lexicon that never left the old vocabulary.
test("the lexicon exercises the 8 biomes Task 5 added", () => {
  const used = new Set(LEX.flatMap((r) => r.biomes));
  for (const b of [
    "tundra",
    "lake",
    "scree",
    "karst",
    "badland",
    "desert",
    "lava",
    "reef",
  ])
    assert.ok(used.has(b), `no lexicon row names the added biome "${b}"`);
});

// ── the budget file ────────────────────────────────────────────────────────

test("budgets.json pins cellKm and the landform + sheet caps", () => {
  assert.equal(BUDGETS.cellKm, 0.5);
  assert.deepEqual(BUDGETS.landforms, {
    maxInstances: 2400,
    maxNamed: 500,
    minTypes: 100,
    maxTypes: 200,
    typeCoverageFloor: 100,
    dungeonCapableTypes: 23,
  });
  // Plan B Task 11 added thumbWidthPx + maxThumbBytes: the committed raster is
  // a 512 px review thumb, the 2000 px ship raster is on demand and never
  // committed. deepEqual (not a subset check) is the point — a key added
  // without a `sheetsWhy` line beside it should red this test, which is how
  // the budget file keeps its stated reasons.
  assert.deepEqual(BUDGETS.sheets, {
    maxSheets: 18,
    maxSvgBytes: 524288,
    maxRasterSeconds: 2,
    rasterWidthPx: 2000,
    thumbWidthPx: 512,
    maxThumbBytes: 393216,
  });
  for (const k of Object.keys(BUDGETS.sheets))
    assert.ok(
      typeof BUDGETS.sheetsWhy[k] === "string" &&
        BUDGETS.sheetsWhy[k].length > 40,
      `budgets.json sheets.${k} has no sheetsWhy line — a number without a stated reason`,
    );
});

// Plan C adds `fabric`, `civil` and `loop` to this same file and owns
// G-WORLD-BUDGET. Task 5 must not have pre-empted them.
test("budgets.json does not pre-empt Plan C's sections", () => {
  for (const k of ["fabric", "civil", "loop"])
    assert.equal(
      BUDGETS[k],
      undefined,
      `budgets.json already carries Plan C's "${k}" section`,
    );
});

// ── the printed record — a gate that passes may have stopped checking ──────

test("the gate PRINTS a world-budget line for landforms on every run", () => {
  const { contentRoot, drop } = tmpRoot();
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^world-budget: landforms 170 types, 0 instances \(budget 100-200 types, 2400 instances\)$/m,
  );
  assert.match(r.out, /^G-LANDFORM: types placed: 0 \/ 170$/m);
  drop();
});

test("the gate PRINTS a world-budget line for sheets when the maps dir exists", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "a.svg"), "<svg/>");
  writeFileSync(join(maps, "b.svg"), "<svg>xx</svg>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^world-budget: sheets 2 files, 13 bytes largest \(b\.svg\) \(budget 18, 524288\)$/m,
  );
  drop();
});

test("the real repo tree prints its own sheet census and stays inside budget", () => {
  const r = runGate(join(ROOT, "content"));
  assert.equal(r.code, 0, r.out);
  const m = r.out.match(
    /^world-budget: sheets (\d+) files, (\d+) bytes largest \((\S+)\) \(budget 18, 524288\)$/m,
  );
  assert.ok(m, `no sheet census line in:\n${r.out}`);
  assert.ok(
    Number(m[1]) <= 18 && Number(m[2]) <= 524288,
    `sheet census out of budget: ${m[0]}`,
  );
});

// ── G-LANDFORM reds ────────────────────────────────────────────────────────

test("G-LANDFORM red: a spine feature cites a type that is not in the lexicon", () => {
  const { contentRoot, drop } = tmpRoot();
  const doc = readNode(contentRoot, "n-cluster1");
  doc.features[0].type = "not-a-landform";
  writeNode(contentRoot, "n-cluster1", doc);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: .*type "not-a-landform" is not in the lexicon/,
  );
  drop();
});

test("G-LANDFORM red: a feature's kind contradicts its lexicon geometry", () => {
  const { contentRoot, drop } = tmpRoot();
  const doc = readNode(contentRoot, "n-cluster1");
  const line = doc.features.find((f) => f.kind === "line");
  line.type = "karst-cenote"; // lexicon geometry is "point"
  writeNode(contentRoot, "n-cluster1", doc);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: .*kind "line" but lexicon geometry is "point"/,
  );
  drop();
});

// A feature whose type MATCHES its lexicon geometry is not a failure — the
// rule above must reject the contradiction, not the citation.
test("G-LANDFORM green: a feature citing a type of its own geometry", () => {
  const { contentRoot, drop } = tmpRoot();
  const doc = readNode(contentRoot, "n-cluster1");
  doc.features.find((f) => f.kind === "point").type = "karst-cenote";
  writeNode(contentRoot, "n-cluster1", doc);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  drop();
});

test("G-LANDFORM red: the catalogue falls outside the 100-200 type band", () => {
  const { contentRoot, drop } = tmpRoot();
  writeJson(
    join(contentRoot, "world/lexicon/landforms.json"),
    LEX.slice(0, 42),
  );
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: catalogue holds 42 types — budget is 100-200/,
  );
  drop();
});

test("G-LANDFORM red: the dungeonCapable count drifts off the pinned 23", () => {
  const { contentRoot, drop } = tmpRoot();
  const lex = structuredClone(LEX);
  lex.find((r) => r.dungeonCapable).dungeonCapable = false;
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: 22 dungeonCapable types, budget pins 23/);
  drop();
});

// The label is repo-relative, like every sibling message. An absolute path
// here moves with the content root, so a fixture could never pin the line.
test("G-LANDFORM red: the lexicon file is missing under an existing content/world/", () => {
  const { contentRoot, drop } = tmpRoot();
  rmSync(join(contentRoot, "world/lexicon"), { recursive: true, force: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /^FAIL {2}G-LANDFORM: world\/lexicon\/landforms\.json is missing$/m,
  );
  drop();
});

// The lexicon <-> BIOMES join as a GATE rule, not only a unit test on the
// repo's own file: any other content root — a fixture, Plan C's generated
// lexicon — could name a biome the spine vocabulary lacks, and before this
// the gate exited 0 on it.
test("G-LANDFORM red: a lexicon row names a biome outside BIOMES", () => {
  const { contentRoot, drop } = tmpRoot();
  const lex = structuredClone(LEX);
  lex[0].biomes = ["swamp"];
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    new RegExp(
      `G-LANDFORM: type "${lex[0].id}": biome "swamp" is outside BIOMES`,
    ),
  );
  drop();
});

test("G-LANDFORM red, not a throw: a lexicon row's biomes is not an array", () => {
  const { contentRoot, drop } = tmpRoot();
  const lex = structuredClone(LEX);
  lex[0].biomes = "forest";
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    new RegExp(`G-LANDFORM: type "${lex[0].id}": biomes is not an array`),
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// typeof [] === "object", so a section saved as a list used to pass the guard,
// destructure to six `undefined`s, and silently switch the catalogue-band rule
// off inside a run that still exited 1 for another reason.
test("G-LANDFORM red, not a throw: the landforms section is an array", () => {
  const { contentRoot, drop } = tmpRoot();
  const b = structuredClone(BUDGETS);
  b.landforms = [];
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: world\/budgets\.json has no landforms section/,
  );
  assert.doesNotMatch(r.out, /budget undefined-undefined/);
  drop();
});

// Trap 6: a gate function never throws. A malformed catalogue or budget file
// is ordinary bad content and must report, not take down finish() and silently
// drop every failure recorded before it.
test("G-LANDFORM red, not a throw: the lexicon is a JSON object instead of an array", () => {
  const { contentRoot, drop } = tmpRoot();
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), { rows: LEX });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: .*landforms\.json is not a JSON array/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-LANDFORM red, not a throw: budgets.json has no landforms section", () => {
  const { contentRoot, drop } = tmpRoot();
  const b = structuredClone(BUDGETS);
  delete b.landforms;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: world\/budgets\.json has no landforms section/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET red, not a throw: budgets.json has no sheets section", () => {
  const { base, contentRoot, drop } = tmpRoot();
  mkdirSync(join(base, "game-client/assets/art/maps"), { recursive: true });
  const b = structuredClone(BUDGETS);
  delete b.sheets;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-SHEET-BUDGET: world\/budgets\.json has no sheets section/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// Same array hole as the landforms section: typeof [] === "object" passed the
// guard and both sheet caps then compared against `undefined`, i.e. never.
test("G-SHEET-BUDGET red, not a throw: the sheets section is an array", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  for (let i = 0; i < 19; i++) writeFileSync(join(maps, `s${i}.svg`), "<svg/>");
  const b = structuredClone(BUDGETS);
  b.sheets = [];
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-SHEET-BUDGET: world\/budgets\.json has no sheets section/,
  );
  assert.doesNotMatch(r.out, /budget undefined, undefined/);
  drop();
});

// ── the instance census, dormant until Plan C writes content/world/fabric/ ──

// R8 — degrade, never deadlock. `mkdir content/world/fabric` is Plan C's very
// first commit, and it used to arm the coverage floor plus all 170
// absentBecause rules at once: 171 failures for creating a folder. An empty
// container is not content, so the census arms on INSTANCES.
test("degrade: an EMPTY content/world/fabric/ directory arms nothing", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^G-LANDFORM: types placed: 0 \/ 170$/m);
  assert.doesNotMatch(r.out, /below the floor|no absentBecause/);
  // …and it stays green under Gate 2's flag too: an empty dir is not a
  // half-built world, it is no world.
  const rc = runGate(contentRoot, "--require-complete");
  assert.equal(rc.code, 0, rc.out);
  drop();
});

// The same, one step later: fabric files exist but hold no instances yet.
test("degrade: fabric files with empty instance arrays arm nothing", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  writeJson(join(contentRoot, "world/fabric/c01.json"), { instances: [] });
  const r = runGate(contentRoot, "--require-complete");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^G-LANDFORM: types placed: 0 \/ 170$/m);
  assert.doesNotMatch(r.out, /below the floor|no absentBecause/);
  drop();
});

test("G-LANDFORM counts fabric instances and scores type coverage", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  const ids = LEX.slice(0, 120).map((r) => r.id);
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    instances: ids.map((id, i) => ({ id: `i-${i}`, type: id, named: i < 3 })),
  });
  const r = runGate(contentRoot, "--require-complete");
  assert.match(
    r.out,
    /^world-budget: landforms 170 types, 120 instances \(budget 100-200 types, 2400 instances\)$/m,
  );
  assert.match(r.out, /^G-LANDFORM: types placed: 120 \/ 170$/m);
  // 120 clears the floor of 100, so this passes even under Gate 2's flag —
  // which is the whole point of pinning the floor at 100. The 50 unplaced
  // rows are REPORTED, aggregated and capped, never failed: as a failure that
  // rule demanded 170/170 and made budgets.json's own number unreachable.
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^WARN {2}G-LANDFORM: 50 type\(s\) have 0 instances and no absentBecause: \S+, \S+, \S+, \S+, \S+ \(\+45 more\)$/m,
  );
  drop();
});

// The floor is a real, reachable rule — and it ESCALATES: a warning while the
// fabric is being built (precheck.sh, CI's bare sweep), a failure only under
// --require-complete, which is Gate 2 at promote.
test("G-LANDFORM: type coverage below the floor WARNs by default", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    instances: LEX.slice(0, 99).map((r, i) => ({ id: `i-${i}`, type: r.id })),
  });
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^WARN {2}G-LANDFORM: types placed: 99 \/ 170 — below the floor of 100$/m,
  );
  drop();
});

test("G-LANDFORM red: type coverage below the floor under --require-complete", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    instances: LEX.slice(0, 99).map((r, i) => ({ id: `i-${i}`, type: r.id })),
  });
  const r = runGate(contentRoot, "--require-complete");
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /^FAIL {2}G-LANDFORM: types placed: 99 \/ 170 — below the floor of 100$/m,
  );
  drop();
});

// absentBecause's teeth: a declared reason for absence contradicted by a real
// instance is a lie in the catalogue. Always a failure — nothing reaches it
// until an author writes a reason, so it can never deadlock.
test("G-LANDFORM red: a type declares absentBecause and is placed anyway", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  const lex = structuredClone(LEX);
  lex[0].absentBecause = "no terrain in Season 1 supports it";
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    instances: LEX.slice(0, 120).map((r, i) => ({ id: `i-${i}`, type: r.id })),
  });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    new RegExp(
      `G-LANDFORM: type "${lex[0].id}" declares absentBecause .* but has instances`,
    ),
  );
  drop();
});

// …and a HONEST declaration excuses the row from the shortfall report.
test("G-LANDFORM: a declared-absent type is excused from the shortfall report", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  const lex = structuredClone(LEX);
  for (const row of lex.slice(120))
    row.absentBecause = "out of scope for Season 1";
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    instances: LEX.slice(0, 120).map((r, i) => ({ id: `i-${i}`, type: r.id })),
  });
  const r = runGate(contentRoot, "--require-complete");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /no absentBecause/);
  drop();
});

test("G-LANDFORM red: more instances than the budget allows", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  const instances = [];
  for (let i = 0; i < 2401; i++)
    instances.push({ id: `i-${i}`, type: LEX[i % LEX.length].id });
  writeJson(join(contentRoot, "world/fabric/c01.json"), { instances });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: 2401 landform instances > budget 2400/);
  drop();
});

test("G-LANDFORM red: more named landforms than the budget allows", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  const instances = [];
  for (let i = 0; i < 501; i++)
    instances.push({ id: `i-${i}`, type: LEX[i % LEX.length].id, named: true });
  writeJson(join(contentRoot, "world/fabric/c01.json"), { instances });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: 501 named landforms > budget 500/);
  drop();
});

test("G-LANDFORM red, not a throw: a fabric file whose instances are not an array", () => {
  const { contentRoot, drop } = tmpRoot();
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    instances: { a: 1 },
  });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: world\/fabric\/c01\.json: instances is not an array/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// ── G-SHEET-BUDGET reds ────────────────────────────────────────────────────

test("G-SHEET-BUDGET red: more sheets than the roster allows", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  for (let i = 0; i < 19; i++) writeFileSync(join(maps, `s${i}.svg`), "<svg/>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: 19 sheets > budget 18/);
  drop();
});

test("G-SHEET-BUDGET red: one sheet over the SVG byte cap", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "fat.svg"), "x".repeat(524289));
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-SHEET-BUDGET: sheet fat\.svg is 524289 bytes > budget 524288/,
  );
  drop();
});

// …but a case-only rename must not walk past either cap. macOS preserves
// case, so `Basin.SVG` is a real sheet that `.endsWith(".svg")` could not see:
// nineteen of them censused as 0 files and exited 0.
test("G-SHEET-BUDGET is case-insensitive: .SVG sheets still count", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  for (let i = 0; i < 19; i++) writeFileSync(join(maps, `S${i}.SVG`), "<svg/>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: 19 sheets > budget 18/);
  drop();
});

// A .png beside the .svg must not be counted — the two committed sheets ship
// with one each, so counting every file would read 4 sheets, not 2.
test("G-SHEET-BUDGET counts .svg only", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "a.svg"), "<svg/>");
  for (let i = 0; i < 30; i++)
    writeFileSync(join(maps, `p${i}.png`), "x".repeat(600000));
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^world-budget: sheets 1 files, 6 bytes largest \(a\.svg\) \(budget 18, 524288\)$/m,
  );
  drop();
});

// ── soft-skip: ~27 fixture roots have no content/world/ at all ─────────────

test("soft-skip: a content root with no content/world/ is still green", () => {
  const { contentRoot, drop } = tmpRoot();
  rmSync(join(contentRoot, "world"), { recursive: true, force: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET|world-budget/);
  drop();
});

// budgets.json's absence is Plan C's G-WORLD-BUDGET to report, not this
// gate's — so the lexicon half must go quiet too rather than half-report.
test("soft-skip: content/world/ without budgets.json reports nothing", () => {
  const { contentRoot, drop } = tmpRoot();
  rmSync(join(contentRoot, "world/budgets.json"), { force: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET|world-budget/);
  drop();
});

// The load-bearing half of the soft-skip: a MINIMAL root — no content/world/,
// no game-client sibling — is exactly the shape of the ~27 fixture roots under
// scripts/tests/fixtures/spine/, which is the whole reason the skip exists.
// Built the way spine-gates.test.mjs' spineFixture() builds it, including the
// `check_spine_emit --write` pass that fills `derived`.
test("soft-skip: the minimal spine fixture root stays green", () => {
  const base = mkdtempSync(join(tmpdir(), "world-budget-min-"));
  const contentRoot = join(base, "content");
  cpSync(join(ROOT, "scripts/tests/fixtures/spine/base"), contentRoot, {
    recursive: true,
  });
  cpSync(
    join(ROOT, "content/schemas/spine-node.schema.json"),
    join(contentRoot, "schemas/spine-node.schema.json"),
    { recursive: true },
  );
  cpSync(
    join(ROOT, "content/schemas/spine-edge.schema.json"),
    join(contentRoot, "schemas/spine-edge.schema.json"),
    { recursive: true },
  );
  execFileSync(process.execPath, [
    join(ROOT, "scripts/check_spine_emit.mjs"),
    "--write",
    "--content-root",
    contentRoot,
  ]);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET|world-budget/);
  rmSync(base, { recursive: true, force: true });
});
