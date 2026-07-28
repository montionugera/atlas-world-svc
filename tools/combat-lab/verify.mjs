#!/usr/bin/env node
// Verifies that the model math embedded in index.html reproduces the numbers in
// docs/superpowers/specs/2026-07-28-combat-balance-sheet.md, which were produced
// by model/balance_sheet.py. The page and that script are two implementations of
// one model; this is what keeps them from drifting apart.
//
// It does not stub a DOM. It lifts the pure-model region out of the page source
// (everything between the model banner and the render banner) and runs it.
//
//   node tools/combat-lab/verify.mjs
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, "index.html"), "utf8");
const data = JSON.parse(readFileSync(join(HERE, "combat-model.json"), "utf8"));

const START = "const grow = (L)";
const END =
  "// -------------------------------------------------------------- render";
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < 0 || b <= a) {
  console.error(
    "verify: could not locate the pure-model region in index.html.",
  );
  console.error("If the markers moved, update START/END in this file.");
  process.exit(1);
}
const modelSrc = html.slice(a, b);

// Same bootstrap the page does in loadDefaults().
const P = { levelMax: data.proposed.levelMax };
for (const [k, d] of Object.entries(data.proposed.inputs)) P[k] = d.value;

const model = new Function(
  "DATA",
  "P",
  `${modelSrc}; return { player, mob, R, band, requirements, invariants, midLevel, resolve };`,
)(data, P);

// --------------------------------------------------- expected (balance sheet)
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

let failures = 0;
const check = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(42)} got ${got.toFixed(2).padStart(10)}` +
      (ok ? "" : `   want ${want.toFixed(2)} (±${tol})`),
  );
};

// verify.mjs only ever evaluated the pure-model region, so a syntax error in
// the RENDER half passed every check while the page was blank. It happened.
// Parse the whole inline script before anything else.
console.log("\npage script");
{
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  let ok = false,
    msg = "";
  try {
    if (!script) throw new Error("no inline <script> block found");
    new Function(script[1]);
    ok = true;
  } catch (e) {
    msg = e.message;
  }
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  whole inline script parses${ok ? "" : ` — ${msg}`}`,
  );
}

// Run the RENDER half too, not just the model. Stub the two globals the page
// touches (fetch, document) so the trailing bootstrap is inert, then call the
// section renderers directly — they return strings and touch no DOM.
// This catches render-time exceptions and undocumented column headers, neither
// of which the syntax gate can see.
console.log("\nrendered output");
{
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const inert = { then: () => inert, catch: () => inert };
  let page = null,
    boot = "";
  try {
    page = new Function(
      "fetch",
      "document",
      "DATA_",
      "P_",
      `${script}
       DATA = DATA_; P = P_;
       return { TERMS, renderLadder, renderMatrix, renderCurve, renderMobs,
                renderRequirements, renderInvariants,
                renderGlossary, renderLegend, renderInputs };`,
    )(
      () => inert,
      { getElementById: () => ({ style: {}, addEventListener() {} }) },
      data,
      P,
    );
  } catch (e) {
    boot = e.message;
  }
  if (!page) {
    failures++;
    console.log(`  FAIL  render functions load — ${boot}`);
  } else {
    let html_ = "",
      threw = "";
    for (const name of [
      "renderLegend",
      "renderInputs",
      "renderRequirements",
      "renderLadder",
      "renderMatrix",
      "renderCurve",
      "renderMobs",
      "renderInvariants",
      "renderGlossary",
    ]) {
      try {
        html_ += page[name]();
      } catch (e) {
        threw += `${name}: ${e.message}; `;
      }
    }
    if (threw) failures++;
    console.log(
      `  ${threw ? "FAIL" : "PASS"}  all 9 sections render${threw ? ` — ${threw}` : ""}`,
    );

    // Every <th> must carry a tooltip, i.e. its text must exist in TERMS.
    const heads = [...html_.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => m[1]);
    const bare = heads.filter((h) => !h.includes('class="term"'));
    const dynamic = bare.filter((h) =>
      /^vs |^L\d|^as shown$|^full name$|^meaning$|^value$|^result$/.test(
        h.replace(/<[^>]*>/g, "").trim(),
      ),
    );
    const undocumented = bare.filter((h) => !dynamic.includes(h));
    if (undocumented.length) failures++;
    console.log(
      `  ${undocumented.length ? "FAIL" : "PASS"}  every column header is in the glossary` +
        (undocumented.length
          ? ` — missing: ${undocumented.map((h) => JSON.stringify(h.replace(/<[^>]*>/g, "").trim())).join(", ")}`
          : ` (${heads.length - bare.length} documented, ${dynamic.length} generated)`),
    );
  }
}

console.log("\nrequirements (§2) — R values");
for (const q of model.requirements()) {
  check(q.id, q.r, EXPECT_REQ[q.id], 0.005);
  if (!q.ok) {
    failures++;
    console.log(`        ^ requirement reports FAIL on the page`);
  }
}

console.log("\nrank ladder (§1) — encounter R, max grade");
for (const rk of data.proposed.ladder) {
  const L = model.midLevel(rk);
  check(
    rk.rank,
    model.R(L, rk.rank, "max", false),
    EXPECT_LADDER[rk.rank],
    0.005,
  );
}

console.log("\nplayer curve (§4) — max grade");
for (const [L, want] of Object.entries(EXPECT_CURVE)) {
  const p = model.player(Number(L), "max");
  const got = [p.cs, p.pAtk, p.mAtk, p.hp, p.pDef, p.ehp, p.mspd];
  const names = ["CS", "pAtk", "mAtk", "hp", "pDef", "ehp", "mspd"];
  got.forEach((g, i) =>
    check(`L${L} ${names[i]}`, g, want[i], i === 6 ? 0.05 : 0.6),
  );
}

// The build and gear axes must be genuinely independent: a named grade has to
// equal its {build, gear} pair, and R has to rise along each axis on its own.
console.log("\nbuild × gear axes");
const { builds, gearTiers, grades, ladder } = data.proposed;
for (const g of grades) {
  const viaName = model.R(33, "C", g.grade, true);
  const viaPair = model.R(33, "C", { build: g.build, gear: g.gear }, true);
  check(`${g.grade} == ${g.build}/${g.gear}`, viaPair, viaName, 1e-9);
}
let mono = 0;
for (const rk of ladder) {
  const L = model.midLevel(rk);
  const at = (b, t) => model.R(L, rk.rank, { build: b, gear: t }, true);
  for (const t of gearTiers.map((x) => x.tier)) {
    for (let i = 1; i < builds.length; i++) {
      if (!(at(builds[i].build, t) > at(builds[i - 1].build, t))) mono++;
    }
  }
  for (const b of builds.map((x) => x.build)) {
    for (let i = 1; i < gearTiers.length; i++) {
      if (!(at(b, gearTiers[i].tier) > at(b, gearTiers[i - 1].tier))) mono++;
    }
  }
}
const cells = builds.length * gearTiers.length * ladder.length;
const finite = builds
  .flatMap((b) =>
    gearTiers.flatMap((g) =>
      ladder.map((rk) =>
        model.R(
          model.midLevel(rk),
          rk.rank,
          { build: b.build, gear: g.tier },
          true,
        ),
      ),
    ),
  )
  .filter((r) => Number.isFinite(r) && r > 0).length;
if (mono) failures++;
if (finite !== cells) failures++;
console.log(
  `  ${mono === 0 ? "PASS" : "FAIL"}  R rises along each axis independently`,
);
console.log(
  `  ${finite === cells ? "PASS" : "FAIL"}  all ${cells} cross-product cells finite (${finite}/${cells})`,
);

console.log("\ninvariants (§7)");
for (const [name, value, ok] of model.invariants()) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(42)} ${value}`);
}

console.log(
  failures === 0
    ? "\nOK — index.html reproduces the balance sheet exactly.\n"
    : `\n${failures} MISMATCH(ES) — index.html and model/balance_sheet.py disagree.\n`,
);
process.exit(failures === 0 ? 0 : 1);
