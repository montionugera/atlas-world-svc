// Plan B Task 6 — G-BIOME-INK closes FOUR loops, not one, and it goes red on
// today's tables. A pattern emitted but unreachable, or legended but
// unreachable, is ALSO a failure: unreachable ink is ink nobody can explain.
//
// Every branch of checkBiomeInk() is mutation-tested here: a rule whose
// deletion leaves this suite green protects nothing. The table-shape tests
// ("loop N: …") assert the shipped vocabulary; the "checkBiomeInk() …" tests
// assert the RULE, by breaking a table and reading the reported problem back.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BIOME_FILL,
  FILL_FOR,
  LEGEND,
  PATTERNS,
  LEGACY_PATTERN_IDS,
  TERRAIN_LEGEND,
  patternDefs,
} from "../lib/draft.mjs";
import { checkBiomeInk } from "../lib/ink.mjs";
import { BIOMES, TERRAIN_KINDS } from "../../../scripts/lib/spine.mjs";

const reachable = () =>
  new Set([
    ...Object.values(BIOME_FILL),
    ...Object.values(FILL_FOR),
    "pReported",
    "pReportedSworn",
    "pReportedHearsay",
    "pReportedInferred",
  ]);

const idsOf = (svg) =>
  [...svg.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]);

test("loop 1: every biome has a fill", () => {
  assert.equal(Object.keys(BIOME_FILL).length, 20);
  for (const b of BIOMES)
    assert.ok(BIOME_FILL[b], `biome "${b}" has no BIOME_FILL entry`);
});

test("loop 2: every terrain kind has a fill", () => {
  assert.equal(Object.keys(FILL_FOR).length, 18);
  for (const k of TERRAIN_KINDS)
    assert.ok(FILL_FOR[k], `terrain kind "${k}" has no FILL_FOR entry`);
});

test("loop 3: every referenced pattern exists in the PATTERNS registry", () => {
  for (const id of reachable())
    assert.ok(PATTERNS[id], `pattern "${id}" is referenced but never defined`);
});

test("loop 4: every reachable pattern has exactly one legend row, and nothing else does", () => {
  const legendIds = LEGEND.map((r) => r.pattern);
  assert.equal(
    new Set(legendIds).size,
    legendIds.length,
    "a pattern is legended twice",
  );
  assert.deepEqual(new Set(legendIds), reachable());
  assert.equal(LEGEND.length, 25); // 21 distinct fill patterns + pReported + the 3 provenance densities
});

test("checkBiomeInk() reports nothing on the shipped tables", () => {
  assert.deepEqual(checkBiomeInk({}), []);
});

test("checkBiomeInk() names the file for a missing FILL_FOR entry", () => {
  const saved = FILL_FOR["karst-plateau"];
  delete FILL_FOR["karst-plateau"];
  const problems = checkBiomeInk({});
  FILL_FOR["karst-plateau"] = saved;
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /^G-BIOME-INK: terrain kind "karst-plateau" .* has no entry in FILL_FOR \(tools\/mapforge\/lib\/draft\.mjs\) — it will render as blank parchment$/,
  );
});

test("checkBiomeInk() names a biome with no BIOME_FILL entry", () => {
  // `pDesert` stays reachable through FILL_FOR["sand-sea"], so loop 1 is the
  // only loop that can fire — which is what makes this a rule test, not a
  // cascade.
  const saved = BIOME_FILL.desert;
  delete BIOME_FILL.desert;
  const problems = checkBiomeInk({});
  BIOME_FILL.desert = saved;
  assert.deepEqual(problems, [
    'G-BIOME-INK: biome "desert" has no BIOME_FILL entry',
  ]);
});

test("checkBiomeInk() flags a reachable pattern with no <pattern> markup", () => {
  const saved = PATTERNS.pReef;
  delete PATTERNS.pReef;
  const problems = checkBiomeInk({});
  PATTERNS.pReef = saved;
  assert.deepEqual(problems, [
    'G-BIOME-INK: pattern "pReef" is referenced but never defined in PATTERNS',
  ]);
});

test("checkBiomeInk() flags a pattern legended twice", () => {
  const row = LEGEND.find((r) => r.pattern === "pRock");
  LEGEND.push({ ...row });
  const problems = checkBiomeInk({});
  LEGEND.pop();
  assert.deepEqual(problems, [
    'G-BIOME-INK: pattern "pRock" has two legend rows',
  ]);
});

test("checkBiomeInk() flags a reachable pattern with no legend row", () => {
  const at = LEGEND.findIndex((r) => r.pattern === "pBuilt");
  const [row] = LEGEND.splice(at, 1);
  const problems = checkBiomeInk({});
  LEGEND.splice(at, 0, row);
  assert.deepEqual(problems, [
    'G-BIOME-INK: pattern "pBuilt" is reachable but has no legend row',
  ]);
});

test("checkBiomeInk() flags an emitted-but-unreachable pattern", () => {
  const problems = checkBiomeInk({
    emittedIds: [...reachable(), "pGhost"],
    referencedIds: [...reachable()],
  });
  assert.ok(
    problems.some(
      (p) => p === `G-BIOME-INK: pattern "pGhost" is emitted but unreachable`,
    ),
    problems,
  );
});

test("checkBiomeInk() flags a referenced-but-unemitted pattern", () => {
  const r = [...reachable()];
  const problems = checkBiomeInk({ emittedIds: r.slice(1), referencedIds: r });
  assert.ok(
    problems.some((p) => p.includes(`is referenced but not emitted`)),
    problems,
  );
});

test("checkBiomeInk() flags a legend row for an unreachable pattern", () => {
  LEGEND.push({ pattern: "pPhantom", label: "phantom", tier: 3 });
  const problems = checkBiomeInk({});
  LEGEND.pop();
  assert.ok(
    problems.some(
      (p) =>
        p === `G-BIOME-INK: pattern "pPhantom" has a legend row but is unreachable`,
    ),
    problems,
  );
});

test("checkBiomeInk() flags ink drawn below the sheet's legend tier", () => {
  // pOcean is a tier-3 row; a sheet that draws it with a tier-1 legend has
  // drawn ink its own key cannot explain. No emittedIds, so the emitted-vs-
  // referenced half stays out of the way and this asserts ONLY the tier rule.
  const problems = checkBiomeInk({ referencedIds: ["pOcean"], legendTier: 1 });
  assert.deepEqual(problems, [
    'G-BIOME-INK: pattern "pOcean" is drawn at legend tier 1 but has no visible legend row',
  ]);
  // …and the same draw at tier 3 is clean.
  assert.deepEqual(
    checkBiomeInk({ referencedIds: ["pOcean"], legendTier: 3 }),
    [],
  );
});

test("BYTE PARITY: patternDefs() with no ids emits exactly today's 8 patterns in today's order", () => {
  assert.deepEqual(
    [...LEGACY_PATTERN_IDS],
    ["pIce", "pUpland", "pFlat", "pRim", "pBramble", "pMire", "pRock", "pRiver"],
  );
  assert.deepEqual(idsOf(patternDefs()), [...LEGACY_PATTERN_IDS]);
  // THE atlas call site, unchanged: atlas-sheet.mjs passes exactly this and
  // must keep getting exactly NINE patterns until Task 12 re-inks it.
  const reportedIds = idsOf(patternDefs({ includeReported: true }));
  assert.deepEqual(reportedIds, [...LEGACY_PATTERN_IDS, "pReported"]);
  assert.equal(
    reportedIds.length,
    9,
    "atlas-world.svg's <defs> moves at Task 6 if this is not 9 — two tasks before its licensed re-ink",
  );
});

test("the three provenance densities are behind their OWN flag, not includeReported", () => {
  assert.deepEqual(
    idsOf(patternDefs({ includeReported: true, frontierTiers: true })),
    [
      ...LEGACY_PATTERN_IDS,
      "pReported",
      "pReportedSworn",
      "pReportedHearsay",
      "pReportedInferred",
    ],
  );
  // frontierTiers alone, without includeReported, is legal and adds only three.
  assert.deepEqual(idsOf(patternDefs({ frontierTiers: true })), [
    ...LEGACY_PATTERN_IDS,
    "pReportedSworn",
    "pReportedHearsay",
    "pReportedInferred",
  ]);
  // And neither flag can duplicate an id already named in `ids`.
  assert.deepEqual(
    idsOf(
      patternDefs({
        ids: ["pKarst", "pReported"],
        includeReported: true,
        frontierTiers: true,
      }),
    ),
    [
      "pKarst",
      "pReported",
      "pReportedSworn",
      "pReportedHearsay",
      "pReportedInferred",
    ],
  );
});

test("patternDefs({ baked: true }) emits no pattern layer at all", () => {
  assert.equal(patternDefs({ baked: true }), "");
  assert.equal(
    patternDefs({ baked: true, includeReported: true, frontierTiers: true }),
    "",
  );
});

test("BYTE PARITY: TERRAIN_LEGEND is still the same six rows in the same order", () => {
  assert.deepEqual(TERRAIN_LEGEND, [
    ["pIce", "ice shelf"],
    ["pUpland", "upland"],
    ["pFlat", "alkali flat"],
    ["pRim", "rim country"],
    ["pBramble", "bramble"],
    ["pMire", "tidal mire"],
  ]);
});

test("patternDefs({ ids }) emits exactly the requested set, in the requested order", () => {
  assert.deepEqual(idsOf(patternDefs({ ids: ["pKarst", "pLava", "pReef"] })), [
    "pKarst",
    "pLava",
    "pReef",
  ]);
});
