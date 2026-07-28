#!/usr/bin/env node
// Gates for tools/combat-lab/index.html, cheapest first:
//
//   1. the whole inline <script> parses
//   2. every section renders without throwing
//   3. every column header is defined in the page's TERMS glossary
//   4. the model reproduces docs/superpowers/specs/2026-07-28-combat-balance-sheet.md
//   5. build and gear are independent axes, and encounter size is a free input
//   6. the invariant suite passes
//
// (1) exists because an earlier version only evaluated the model half, so a
// broken string literal in the render code passed every check while the page
// showed nothing but "loading…". (2) and (3) fell out of fixing that.
//
// None of this tests how the page LOOKS. Load it.
//
//   node tools/combat-lab/verify.mjs
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "index.html"), "utf8");
const data = JSON.parse(readFileSync(join(HERE, "combat-model.json"), "utf8"));

const SECTIONS = [
  "renderLegend",
  "renderInputs",
  "renderRequirements",
  "renderLadder",
  "renderMatrix",
  "renderArchetypes",
  "renderCurve",
  "renderMobs",
  "renderInvariants",
  "renderGlossary",
  "renderNotes",
];

// Same bootstrap the page does in loadDefaults().
const P = { levelMax: data.proposed.levelMax };
for (const [k, d] of Object.entries(data.proposed.inputs)) P[k] = d.value;

let failures = 0;
const check = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ${got.toFixed(2).padStart(9)}` +
      (ok ? "" : `   want ${want.toFixed(2)} (±${tol})`),
  );
};
const gate = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

// ------------------------------------------------------ 1. script parses ---
console.log("\npage script");
const script = html.match(/<script>([\s\S]*?)<\/script>/);
let parseErr = "";
try {
  if (!script) throw new Error("no inline <script> block found");
  new Function(script[1]);
} catch (e) {
  parseErr = e.message;
}
gate(!parseErr, "whole inline script parses", parseErr);

// -------------------------------------------- 2 & 3. render + glossary ----
// Stub the only two globals the page touches so the trailing fetch bootstrap is
// inert, then call the section renderers — they return strings, no DOM.
console.log("\nrendered output");
let page = null,
  bootErr = "";
try {
  const inert = { then: () => inert, catch: () => inert };
  page = new Function(
    "fetch",
    "document",
    "DATA_",
    "P_",
    `${script[1]}
     DATA = DATA_; P = P_;
     return { TERMS, ${SECTIONS.join(", ")} };`,
  )(
    () => inert,
    { getElementById: () => ({ style: {}, addEventListener() {} }) },
    data,
    P,
  );
} catch (e) {
  bootErr = e.message;
}

if (!page) {
  gate(false, "render functions load", bootErr);
} else {
  let rendered = "",
    threw = "";
  for (const name of SECTIONS) {
    try {
      rendered += page[name]();
    } catch (e) {
      threw += `${name}: ${e.message}; `;
    }
  }
  gate(!threw, `all ${SECTIONS.length} sections render`, threw);

  const heads = [...rendered.matchAll(/<th>([\s\S]*?)<\/th>/g)].map(
    (m) => m[1],
  );
  const bare = heads.filter((h) => !h.includes('class="term"'));
  // Headers built at runtime, plus the glossary's and invariant table's own.
  const generated = bare.filter((h) =>
    /^vs |^R · \d+v\d+|^as shown$|^full name$|^meaning$|^value$|^result$/.test(
      h.replace(/<[^>]*>/g, "").trim(),
    ),
  );
  const missing = bare.filter((h) => !generated.includes(h));
  gate(
    missing.length === 0,
    "every column header is in the glossary",
    missing.length
      ? `missing: ${missing.map((h) => JSON.stringify(h.replace(/<[^>]*>/g, "").trim())).join(", ")}`
      : `(${heads.length - bare.length} documented, ${generated.length} generated)`,
  );
}

// ------------------------------------------------- 4. matches the spec ----
const a = html.indexOf("const grow = (L)");
const b = html.indexOf(
  "// ============================================================= render ==",
);
if (a < 0 || b < 0 || b <= a) {
  console.error(
    "\nverify: could not locate the model region — update the markers here.",
  );
  process.exit(1);
}
const model = new Function(
  "DATA",
  "P",
  `${html.slice(a, b)}; return { player, mob, R, band, requirements, invariants, midLevel, rankRef };`,
)(data, P);

const EXPECT_REQ = {
  "s-solo-loss": 0.9,
  "a-solo-not-easy": 1.12,
  "c-median-fair": 2.23,
  "c-max-easy": 4.0,
};
const EXPECT_LADDER = {
  E: 11.89,
  D: 5.95,
  C: 4.0,
  B: 2.19,
  A: 1.8,
  S: 1.6,
  SS: 1.5,
  SSS: 1.4,
};
// L -> [CS, pAtk, mAtk, hp, pDef, ehp, mspd]
const EXPECT_CURVE = {
  1: [55, 9, 8, 100, 5, 149, 30.0],
  20: [126, 22, 17, 231, 12, 344, 30.0],
  40: [304, 52, 42, 557, 28, 831, 30.0],
  60: [733, 125, 101, 1342, 67, 2003, 30.0],
  80: [1769, 302, 243, 3237, 162, 4832, 30.0],
  99: [4082, 697, 560, 7471, 374, 11151, 30.0],
};

console.log("\nrequirements (§2)");
for (const q of model.requirements()) {
  check(q.id, q.r, EXPECT_REQ[q.id], 0.005);
  if (!q.ok) {
    failures++;
    console.log(`        ^ the page reports this requirement as FAIL`);
  }
}

console.log("\nrank ladder (§1) — R at each rank's reference encounter size");
for (const rk of data.proposed.ladder) {
  check(
    rk.rank,
    model.R(model.midLevel(rk), rk.rank, "max", rk.n),
    EXPECT_LADDER[rk.rank],
    0.005,
  );
}

console.log("\nplayer curve (§4) — max grade");
const NAMES = ["CS", "pAtk", "mAtk", "hp", "pDef", "ehp", "mspd"];
for (const [L, want] of Object.entries(EXPECT_CURVE)) {
  const p = model.player(Number(L), "max");
  [p.cs, p.pAtk, p.mAtk, p.hp, p.pDef, p.ehp, p.mspd].forEach((g, i) =>
    check(`L${L} ${NAMES[i]}`, g, want[i], i === 6 ? 0.05 : 0.6),
  );
}

// ------------------------------------------------ 5. independent axes -----
console.log("\naxes");
const { builds, gearTiers, grades, ladder } = data.proposed;
for (const g of grades) {
  check(
    `${g.grade} == ${g.build}/${g.gear}`,
    model.R(33, "C", { build: g.build, gear: g.gear }, 1),
    model.R(33, "C", g.grade, 1),
    1e-9,
  );
}
let nonMonotonic = 0;
for (const rk of ladder) {
  const L = model.midLevel(rk);
  const at = (b, t) => model.R(L, rk.rank, { build: b, gear: t }, 1);
  for (const t of gearTiers.map((x) => x.tier))
    for (let i = 1; i < builds.length; i++)
      if (!(at(builds[i].build, t) > at(builds[i - 1].build, t)))
        nonMonotonic++;
  for (const b of builds.map((x) => x.build))
    for (let i = 1; i < gearTiers.length; i++)
      if (!(at(b, gearTiers[i].tier) > at(b, gearTiers[i - 1].tier)))
        nonMonotonic++;
}
gate(nonMonotonic === 0, "R rises along build and gear independently");

const cells = builds.length * gearTiers.length * ladder.length;
const finite = builds
  .flatMap((b) =>
    gearTiers.flatMap((g) =>
      ladder.map((rk) =>
        model.R(
          model.midLevel(rk),
          rk.rank,
          { build: b.build, gear: g.tier },
          1,
        ),
      ),
    ),
  )
  .filter((r) => Number.isFinite(r) && r > 0).length;
gate(
  finite === cells,
  `all ${cells} cross-product cells finite`,
  finite === cells ? "" : `${finite}/${cells}`,
);

// Encounter size must be a free input applying exactly 2n/(n+1) — never baked
// into a rank, and never doing anything else.
const duel = model.R(33, "C", "max", 1);
gate(
  [2, 4, 8, 20, 50].every(
    (n) =>
      Math.abs(model.R(33, "C", "max", n) / duel - (2 * n) / (n + 1)) < 1e-9,
  ),
  "encounter size applies 2n/(n+1) and nothing else",
);
gate(
  Math.abs(model.R(33, "C", "max", 1) - duel) < 1e-12,
  "n = 1 is the plain duel (CS_p/CS_m)²",
);

// ------------------------------------- 5b. direction axes are additive ----
// focus and gearClass were bolted onto a model that already had committed
// numbers. The whole design rests on them defaulting to balanced, so naming
// them explicitly must change NOTHING.
console.log("\ndirection axes");
const bal = {
  build: "high",
  gear: "A",
  focus: "balanced",
  gearClass: "balanced",
};
gate(
  Math.abs(model.player(50, bal).cs - model.player(50, "max").cs) < 1e-9 &&
    Math.abs(
      model.player(50, { build: "high", gear: "A" }).cs -
        model.player(50, "max").cs,
    ) < 1e-9,
  "balanced focus + balanced class == the old model",
);

// (1 + 2Caφ)(1 + 2Ca(1−φ)) is symmetric about φ = 0.5, and defence enters EHP
// twice (HP and mitigation) — so this is only exact when gear is balanced.
const dpsB = model.player(50, { build: "high", gear: "A", focus: "full DPS" });
const tankB = model.player(50, {
  build: "high",
  gear: "A",
  focus: "full tank",
});
gate(
  Math.abs(dpsB.cs - tankB.cs) < 1e-9,
  "full DPS and full tank builds have identical CS",
  `${dpsB.cs.toFixed(4)} vs ${tankB.cs.toFixed(4)}`,
);
gate(
  dpsB.cs < model.player(50, bal).cs,
  "specialising costs CombatScore",
  `${((1 - dpsB.cs / model.player(50, bal).cs) * 100).toFixed(1)}% loss`,
);

const cells8 = data.proposed.archetypes.flatMap((a) =>
  data.proposed.archetypeRanks.map((rank) =>
    model.R(
      50,
      rank,
      { build: "high", gear: a.gear, focus: a.focus, gearClass: a.gearClass },
      P.encounterSize,
    ),
  ),
);
gate(
  cells8.length === 8 * data.proposed.archetypeRanks.length &&
    cells8.every((r) => Number.isFinite(r) && r > 0),
  `all ${cells8.length} archetype cells finite`,
  `(8 groups × ${data.proposed.archetypeRanks.length} ranks)`,
);

// ------------------------------------------------------- 6. invariants ----
console.log("\ninvariants (§7)");
for (const [name, value, ok] of model.invariants()) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(44)} ${value}`);
}

console.log(
  failures === 0
    ? "\nOK — page renders, headers documented, model matches the balance sheet.\n"
    : `\n${failures} FAILURE(S).\n`,
);
process.exit(failures === 0 ? 0 : 1);
