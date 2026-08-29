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
import { createHash } from "node:crypto";
import {
  C,
  BIOME_FILL,
  FILL_FOR,
  LEGEND,
  PATTERNS,
  LEGACY_PATTERN_IDS,
  TERRAIN_LEGEND,
  patternDefs,
  pat,
} from "../lib/draft.mjs";
import {
  checkBiomeInk,
  frontierPattern,
  reachablePatterns,
  FRONTIER_PATTERNS,
  MIN_TILE_PX,
} from "../lib/ink.mjs";
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
        p ===
        `G-BIOME-INK: pattern "pPhantom" has a legend row but is unreachable`,
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
    [
      "pIce",
      "pUpland",
      "pFlat",
      "pRim",
      "pBramble",
      "pMire",
      "pRock",
      "pRiver",
    ],
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

// ---------------------------------------------------------------------------
// loop 5 — the markup itself. Loops 1-4 close the TABLES; a pattern could be a
// 2 px smear drawn in the relay chain's accent and every table would still
// balance. Task 12 re-inks the live sheets against these 25 tiles and Plan E
// draws the world with them, so the markup is a contract from here on.
// ---------------------------------------------------------------------------

/** Swap one pattern's markup, read the gate, put it back. */
const withPattern = (id, markup) => {
  const saved = PATTERNS[id];
  PATTERNS[id] = markup;
  try {
    return checkBiomeInk({});
  } finally {
    PATTERNS[id] = saved;
  }
};

test("loop 5: every shipped tile is at least MIN_TILE_PX on both axes", () => {
  assert.equal(MIN_TILE_PX, 7);
  for (const [id, markup] of Object.entries(PATTERNS)) {
    const m = /^<pattern id="([^"]*)" width="([^"]*)" height="([^"]*)"/.exec(
      markup,
    );
    assert.ok(m, `pattern "${id}" is not <pattern> markup`);
    assert.equal(m[1], id, `pattern "${id}" carries a different id attribute`);
    assert.ok(Number(m[2]) >= MIN_TILE_PX, `${id} width ${m[2]}`);
    assert.ok(Number(m[3]) >= MIN_TILE_PX, `${id} height ${m[3]}`);
  }
});

test("loop 5: every shipped tile draws in ink only — never the relay accent", () => {
  const allowed = new Set([C.ink, C.inkMid, C.inkSoft]);
  for (const [id, markup] of Object.entries(PATTERNS))
    for (const hex of new Set(markup.match(/#[0-9a-fA-F]{3,8}/g) ?? []))
      assert.ok(allowed.has(hex), `pattern "${id}" draws in ${hex}`);
  // …and the accent really is outside the allowed set, so the loop above is
  // not vacuously true.
  assert.equal(allowed.has(C.accent), false);
});

test("checkBiomeInk() flags a tile below the smear threshold", () => {
  const problems = withPattern(
    "pAsh",
    pat("pAsh", 6, 14, `<circle cx="3" cy="3" r="0.5" fill="${C.inkMid}"/>`),
  );
  assert.deepEqual(problems, [
    `G-BIOME-INK: pattern "pAsh" has width 6 — a tile under 7 px reads as a solid grey smear at thumbnail scale`,
  ]);
  // the same tile at exactly the threshold is clean — 7 is inclusive
  assert.deepEqual(
    withPattern(
      "pAsh",
      pat("pAsh", 7, 14, `<circle cx="3" cy="3" r="0.5" fill="${C.inkMid}"/>`),
    ),
    [],
  );
});

test("checkBiomeInk() flags a fill that reaches for the relay accent", () => {
  const problems = withPattern(
    "pLava",
    pat("pLava", 13, 13, `<path d="M1,4 l3,3" stroke="${C.accent}"/>`),
  );
  assert.deepEqual(problems, [
    `G-BIOME-INK: pattern "pLava" draws in "${C.accent}" — a fill may use only ${C.ink}, ${C.inkMid}, ${C.inkSoft}; the accent is reserved for the relay chain`,
  ]);
});

test("checkBiomeInk() flags a pattern whose id attribute is not its key", () => {
  const problems = withPattern(
    "pReef",
    pat("pReefer", 16, 16, `<path d="M3,12 v-4" stroke="${C.inkMid}"/>`),
  );
  assert.deepEqual(problems, [
    'G-BIOME-INK: pattern "pReef" is registered under a key its own id attribute ("pReefer") does not match',
  ]);
});

test("checkBiomeInk() flags markup that is not a <pattern> at all", () => {
  assert.deepEqual(withPattern("pRim", `<rect width="11" height="11"/>`), [
    'G-BIOME-INK: pattern "pRim" does not open as <pattern id=… width=… height=…>',
  ]);
  assert.deepEqual(withPattern("pRim", 11), [
    'G-BIOME-INK: pattern "pRim" is number, not <pattern> markup',
  ]);
});

test("checkBiomeInk() flags pattern markup nothing can reach", () => {
  PATTERNS.pOrphan = pat(
    "pOrphan",
    12,
    12,
    `<path d="M0,6 h12" stroke="${C.inkSoft}"/>`,
  );
  const problems = checkBiomeInk({});
  delete PATTERNS.pOrphan;
  assert.deepEqual(problems, [
    'G-BIOME-INK: pattern "pOrphan" is defined in PATTERNS but nothing can reach it',
  ]);
});

test("BYTE PARITY: every pattern's markup is pinned", () => {
  // Task 12 re-inks the two live sheets against these tiles; Plan E draws the
  // world with them. Until Task 6 shipped, `pAsh` 14 px -> 16 px was green in
  // this suite AND green in check_render_lock (no live sheet emits it yet).
  // If you MEANT to redraw a tile, update its digest in the same commit —
  // and if that tile is on a live sheet, expect the render lock to go red too.
  const PIN = {
    pIce: "2935daf66646",
    pUpland: "fd46a862f57b",
    pFlat: "8964e4fd9a3b",
    pRim: "5d4fcd20d1af",
    pBramble: "287ad0d4a62a",
    pMire: "b6dc23707822",
    pRock: "cd609ad4229d",
    pRiver: "1e933dfa1f07",
    pReported: "6ce73ee8ea29",
    pReportedSworn: "2264e99ea9d1",
    pReportedHearsay: "7b443d214dde",
    pReportedInferred: "e820931f007b",
    pOcean: "5b1314fa94e0",
    pMeadow: "e109aca4ec12",
    pForest: "37c7b782b20a",
    pAsh: "853172d52ce9",
    pBuilt: "71d4bb2b9a7c",
    pTundra: "6832f7dadc70",
    pLake: "f6406c8608c7",
    pScree: "b8ff504a359a",
    pKarst: "bd8893902bb2",
    pBadland: "09342e38d3ea",
    pDesert: "be6abc7e3d02",
    pLava: "7a5931b92595",
    pReef: "20407ad603f0",
  };
  // key set AND insertion order, so a 26th tile or a reordering also lands here
  assert.deepEqual(Object.keys(PATTERNS), Object.keys(PIN));
  const digest = (s) =>
    createHash("sha256").update(s).digest("hex").slice(0, 12);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PATTERNS).map(([id, m]) => [id, digest(m)]),
    ),
    PIN,
  );
});

// ---------------------------------------------------------------------------
// frontierPattern / reachablePatterns — exported, and the only path by which a
// region's `provenance` becomes ink.
// ---------------------------------------------------------------------------

test("frontierPattern() maps the three provenances and falls back to pReported", () => {
  assert.equal(frontierPattern("sworn"), "pReportedSworn");
  assert.equal(frontierPattern("hearsay"), "pReportedHearsay");
  assert.equal(frontierPattern("inferred"), "pReportedInferred");
  assert.deepEqual(Object.keys(FRONTIER_PATTERNS), [
    "sworn",
    "hearsay",
    "inferred",
  ]);
  // the documented fallback: a reported region with no provenance
  for (const bad of [undefined, null, "", "wharf-talk", 7, {}])
    assert.equal(frontierPattern(bad), "pReported", `frontierPattern(${bad})`);
  // …including inherited keys. A bare object literal answers "constructor"
  // with a FUNCTION, which `?? "pReported"` would happily pass through into a
  // fill="url(#...)".
  for (const inherited of ["constructor", "toString", "hasOwnProperty"])
    assert.equal(frontierPattern(inherited), "pReported", inherited);
});

test("reachablePatterns() is every fill plus the frontier gradient, fresh each call", () => {
  const r = reachablePatterns();
  assert.deepEqual(r, reachable());
  assert.equal(r.size, 25);
  for (const id of [...Object.values(BIOME_FILL), ...Object.values(FILL_FOR)])
    assert.ok(r.has(id), id);
  for (const id of Object.values(FRONTIER_PATTERNS)) assert.ok(r.has(id), id);
  assert.ok(r.has("pReported"));
  // checkBiomeInk() reads this set every call — a shared instance would let one
  // caller's edit leak into the next gate run.
  r.add("pLeak");
  assert.equal(reachablePatterns().has("pLeak"), false);
});

// ---------------------------------------------------------------------------
// Degenerate input. A gate that throws skips its caller's finish() and
// silently drops every failure recorded before it — so every argument shape
// must come back in-band.
// ---------------------------------------------------------------------------

test("checkBiomeInk() never throws, whatever it is handed", () => {
  for (const arg of [
    undefined,
    null,
    "x",
    42,
    0,
    true,
    [],
    ["pIce"],
    {},
    { emittedIds: null, referencedIds: null, legendTier: null },
    { emittedIds: "pIce" },
    { emittedIds: {} },
    { emittedIds: [], referencedIds: [] },
    { emittedIds: [null, 1, ""], referencedIds: [] },
    { referencedIds: ["pOcean"], legendTier: "x" },
    { referencedIds: ["pOcean"], legendTier: NaN },
    { legendTier: 1 },
  ]) {
    const label = `checkBiomeInk(${JSON.stringify(arg) ?? String(arg)})`;
    let problems;
    try {
      problems = checkBiomeInk(arg);
    } catch (e) {
      assert.fail(`${label} threw ${e.constructor.name}: ${e.message}`);
    }
    assert.ok(Array.isArray(problems), label);
    for (const p of problems) assert.match(p, /^G-BIOME-INK: /, label);
  }
});

test("checkBiomeInk() answers absent, null and empty as 'nothing to check'", () => {
  assert.deepEqual(checkBiomeInk(), []);
  assert.deepEqual(checkBiomeInk(null), []);
  assert.deepEqual(checkBiomeInk(undefined), []);
  assert.deepEqual(checkBiomeInk({}), []);
  assert.deepEqual(
    checkBiomeInk({ emittedIds: null, referencedIds: null, legendTier: null }),
    [],
  );
  // an EMPTY sheet is a real answer, not a malformed one
  assert.deepEqual(checkBiomeInk({ emittedIds: [], referencedIds: [] }), []);
});

test("checkBiomeInk() reports a malformed argument instead of mis-reading it", () => {
  assert.deepEqual(checkBiomeInk("x"), [
    "G-BIOME-INK: checkBiomeInk() takes an options object; got string",
  ]);
  assert.deepEqual(checkBiomeInk(["pIce"]), [
    "G-BIOME-INK: checkBiomeInk() takes an options object; got an array",
  ]);
  // a STRING id list used to be iterated character by character and answered []
  assert.deepEqual(
    checkBiomeInk({ emittedIds: "pIce", referencedIds: "pIce" }),
    [
      "G-BIOME-INK: emittedIds must be an array of pattern ids or null; got string",
      "G-BIOME-INK: referencedIds must be an array of pattern ids or null; got string",
    ],
  );
  assert.deepEqual(checkBiomeInk({ emittedIds: [null, 1, ""] }), [
    "G-BIOME-INK: emittedIds carries 3 of 3 entries that are not a pattern id",
  ]);
  // a non-numeric tier used to render straight into the message text
  assert.deepEqual(
    checkBiomeInk({ referencedIds: ["pOcean"], legendTier: "x" }),
    ["G-BIOME-INK: legendTier must be a finite number or null; got string"],
  );
  assert.deepEqual(
    checkBiomeInk({ referencedIds: ["pOcean"], legendTier: NaN }),
    ["G-BIOME-INK: legendTier must be a finite number or null; got number"],
  );
});
