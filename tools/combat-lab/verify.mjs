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
  "renderExample",
  "renderStoryboard",
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
  `${html.slice(a, b)}; return { player, mob, R, ttk, band, requirements, invariants, midLevel, rankRef };`,
)(data, P);

const EXPECT_REQ = {
  "s-solo-loss": 0.025,
  "a-solo-not-easy": 1.125,
  "c-median-fair": 2.341,
  "c-max-easy": 4.0,
};
// Swings the mob needs to kill ONE player. Pinned HERE, independently of the
// JSON: the model derives danger FROM these, so checking the model against the
// data file is a tautology that can never fail — an earlier version did exactly
// that and passed happily with rank E set to 99.
const EXPECT_SWINGS = {
  E: 15,
  D: 13.5,
  C: 12,
  B: 10,
  A: 8.5,
  S: 7,
  SS: 6,
  SSS: 5,
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
// L -> [CS, atk, hp, def, mspd]
const EXPECT_CURVE = {
  1: [96, 60, 245, 60, 30.0],
  20: [221, 138, 565, 139, 30.0],
  40: [534, 334, 1363, 334, 30.0],
  60: [1287, 805, 3288, 806, 30.0],
  80: [3105, 1942, 7930, 1943, 30.0],
  99: [7165, 4483, 18301, 4484, 30.0],
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
const NAMES = ["CS", "atk", "hp", "def", "mspd"];
for (const [L, want] of Object.entries(EXPECT_CURVE)) {
  const p = model.player(Number(L), "max");
  [p.cs, p.atk, p.hp, p.def, p.mspd].forEach((g, i) =>
    check(`L${L} ${NAMES[i]}`, g, want[i], i === 4 ? 0.05 : 0.6),
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
  "encounter size applies 2n/(n+1) to a pack and nothing else",
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

// ------------------------------------------- 5c. three rank multipliers ---
// Each rank is set by two targets -- difficulty and danger -- and fight length
// is derived from the pair. All four of R, danger, attack and defence/HP must
// land, and the ladder must rise monotonically in every one of them.
console.log("\nthree rank multipliers");
{
  let bad = "";
  const seen = [];
  for (const rk of data.proposed.ladder) {
    const L = model.midLevel(rk);
    const m = model.mob(L, rk.rank);
    const gotR = model.R(L, rk.rank, "max", rk.n);
    const gotT = model.ttk(L, rk.rank, "max");
    // Danger is derived from the authored swings-to-kill-a-player, so assert
    // the swings themselves — the number actually written down. A previous
    // version compared against rk.danger after that field was removed, so it
    // compared with undefined and passed vacuously.
    const gotD =
      rk.shape === "boss"
        ? 100 / (rk.r * gotT)
        : 100 / (model.R(L, rk.rank, "max", 1) * gotT);
    const gotSwings =
      (100 * P.aspd) / (gotD * (rk.shape === "boss" ? rk.n : 1));
    if (Math.abs(gotR - rk.r) > 0.005)
      bad += `${rk.rank} R ${gotR.toFixed(3)}; `;
    const wantSwings = EXPECT_SWINGS[rk.rank];
    if (!Number.isFinite(wantSwings))
      bad += `${rk.rank} has no pinned swings target; `;
    else if (Math.abs(gotSwings - wantSwings) > 0.01)
      bad += `${rk.rank} swings ${gotSwings.toFixed(2)} want ${wantSwings}; `;
    seen.push({ rank: rk.rank, t: gotT, a: m.atkMult, d: m.defMult });
  }
  gate(!bad, "each rank hits its target R and its target swings-to-kill", bad);

  let nonMono = "";
  for (let i = 1; i < seen.length; i++) {
    const p = seen[i - 1],
      c = seen[i];
    if (c.t <= p.t) nonMono += `${c.rank} ttk; `;
    if (c.a <= p.a) nonMono += `${c.rank} atk; `;
    if (c.d <= p.d) nonMono += `${c.rank} def/hp; `;
  }
  gate(
    !nonMono,
    "fight length, mob atk and mob def/hp all rise rank by rank",
    nonMono || seen.map((s) => `${s.rank} ${s.t.toFixed(1)}s`).join(" "),
  );
}

// --------------------------------------------------- 5d. level gap -------
// The gap knob must scale the exponent and nothing else: R(delta) should equal
// R(0) * growth^(-2 * gapWeight * delta), exactly.
console.log("\nlevel gap");
{
  const build = (w, d) => {
    const Q = { levelMax: data.proposed.levelMax };
    for (const [k, v] of Object.entries(data.proposed.inputs)) Q[k] = v.value;
    Q.gapWeight = w;
    Q.mobLevelDelta = d;
    return new Function("DATA", "P", `${html.slice(a, b)}; return { R };`)(
      data,
      Q,
    );
  };
  const g = data.proposed.inputs.growth.value;
  let bad = 0;
  for (const w of [0, 0.25, 0.5, 0.6, 1])
    for (const d of [-10, -5, 5, 10, 16]) {
      const got = build(w, d).R(50, "C", "max", 1);
      const want = build(w, 0).R(50, "C", "max", 1) * Math.pow(g, -2 * w * d);
      if (Math.abs(got / want - 1) > 1e-9) bad++;
    }
  gate(bad === 0, "gap weight scales the exponent and nothing else");
  gate(
    Math.abs(
      build(0, 16).R(50, "C", "max", 1) / build(0, 0).R(50, "C", "max", 1) - 1,
    ) < 1e-9,
    "gap weight 0 makes level difference irrelevant",
  );
}

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
