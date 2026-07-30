#!/usr/bin/env node
// Gates for tools/combat-lab/index.html, cheapest first:
//
//   1. the whole inline <script> parses
//   2. every section renders without throwing
//   3. every column header is defined in the page's TERMS glossary
//   4. the model reproduces docs/superpowers/specs/2026-07-28-combat-balance-sheet.md
//   5. build and gear are independent axes, and encounter size is a free input
//   6. the invariant suite passes
//   7. the physical/magical split reduces exactly and cannot be gamed (G1–G12)
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
  "renderTiers",
  "renderEconomy",
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
  `${html.slice(a, b)}; return { player, mob, R, ttk, band, requirements, invariants, midLevel, rankRef, hit, rankSustain, economy,
     shapeOf, forward, inverse, matchup, Q, elem, dmgRatio };`,
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
    // Swings-to-kill-a-player, measured STRAIGHT off the model: the player's
    // health bar divided by one of the mob's hits. Two earlier versions were
    // wrong here. One compared against rk.danger after that field was removed,
    // so it compared with undefined and passed vacuously. The next back-derived
    // swings from `danger x ttk = 100/R` — an identity that silently stops
    // holding once a rank has sustain, since healing buys survival time that no
    // amount of raw HP explains. Measuring the thing itself has neither failure
    // mode and does not care how the model reached it.
    const gotSwings =
      model.player(L, "max").hp / model.hit(m, model.player(L, "max"), L);
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

// ------------------------------------------------------ 5c-bis. sustain ---
// A boss that authors a wall clock cannot pay for it out of HP: hp lives in the
// def*hp product and R = n^2/(a*d*h), so every factor added to hp comes straight
// back out of R. SUSTAIN is what pays instead -- and because it is solved, not
// authored, it has to be pinned HERE or the check is the same tautology the
// swings gate used to be.
//
// These are requirements on the healing system, not preferences. Pinned to 0.1%.
console.log("\nsustain — the bill a long fight runs up");
{
  const EXPECT_SUSTAIN = { S: 0.5333, SS: 0.8222, SSS: 0.9339 };
  const EXPECT_TTK = { S: 150, SS: 900, SSS: 5400 };
  for (const rk of data.proposed.ladder) {
    const got = model.rankSustain(rk);
    const want = EXPECT_SUSTAIN[rk.rank] ?? 0;
    gate(
      Math.abs(got - want) < 0.001,
      `${rk.rank} assumes ${(want * 100).toFixed(1)}% of incoming damage is healed`,
      `got ${(got * 100).toFixed(2)}%`,
    );
  }
  let badT = "";
  for (const [rank, want] of Object.entries(EXPECT_TTK)) {
    const rk = data.proposed.ladder.find((x) => x.rank === rank);
    const got = model.ttk(model.midLevel(rk), rank, "max");
    if (Math.abs(got / want - 1) > 0.001)
      badT += `${rank} ${got.toFixed(0)}s want ${want}s; `;
  }
  gate(
    !badT,
    "SS and SSS hit their authored wall clock",
    badT || "900s / 5400s",
  );
  // Sustain must not leak into ranks that never asked for it.
  gate(
    data.proposed.ladder
      .filter((rk) => !rk.ttk)
      .every((rk) => model.rankSustain(rk) === 0),
    "no rank without an authored ttk assumes any healing",
  );
}

// -------------------------------------------- 5c-ter. sustain economy -----
// Sustain says how much healing a fight needs; this says whether healers can
// supply it. Two authored rules make it a POOL rather than a rate: regen only
// happens in rest mode, and in-combat healing costs mana. Nothing refills
// mid-fight, so supply is fixed while demand grows with the clock.
//
// Pinned independently of the JSON, same reason as EXPECT_SWINGS.
console.log("\nsustain economy — can healers pay the bill");
{
  const EXPECT_DEMAND = { SS: 61.7, SSS: 504.3 };
  for (const [rank, want] of Object.entries(EXPECT_DEMAND)) {
    const rk = data.proposed.ladder.find((x) => x.rank === rank);
    const e = model.economy(rk);
    check(`${rank} healing demanded (bars)`, e.demand, want, 0.1);
  }
  // The structural claim the whole section rests on: doubling the fight length
  // doubles demand and leaves supply untouched. If this ever fails, mana has
  // stopped being a fixed pool and the rest-mode rule has been broken.
  const rk = data.proposed.ladder.find((x) => x.rank === "SSS");
  const base = model.economy(rk);
  const longer = new Function(
    "DATA",
    "P",
    `${html.slice(a, b)}; return { economy };`,
  )(
    {
      ...data,
      proposed: {
        ...data.proposed,
        ladder: data.proposed.ladder.map((x) =>
          x.rank === "SSS" ? { ...x, ttk: x.ttk * 2 } : x,
        ),
      },
    },
    P,
  ).economy({ ...rk, ttk: rk.ttk * 2 });
  gate(
    Math.abs(longer.incoming / base.incoming - 2) < 1e-9,
    "doubling the fight doubles the damage incoming",
    `${base.incoming.toFixed(0)} → ${longer.incoming.toFixed(0)} bars`,
  );
  // Demand grows by MORE than the clock does. The party's own health bars are a
  // one-time absorption — they do not scale with fight length — so every extra
  // second lands entirely on healing. Long fights are super-linearly expensive.
  gate(
    longer.demand / base.demand > 2,
    "and demands MORE than double the healing — own-HP absorption is one-time",
    `${base.demand.toFixed(0)} → ${longer.demand.toFixed(0)} bars (${(longer.demand / base.demand).toFixed(3)}×)`,
  );
  // The three supply sources have three DIFFERENT shapes, and the shapes are
  // the whole design. Doubling the fight must leave the pool alone, double the
  // regen, and leave carry-bound potions alone. An earlier version of this gate
  // asserted total supply never moved, which was true only while rest-mode was
  // the sole source; it failed the moment in-combat regen was added, correctly.
  gate(
    longer.pool === base.pool,
    "pool is FIXED — a longer fight gets the same mana carried in",
    `${base.pool.toFixed(0)} bars either way`,
  );
  gate(
    Math.abs(longer.regen / base.regen - 2) < 1e-9,
    "regen is a RATE — it scales with the clock, as demand does",
    `${base.regen.toFixed(0)} → ${longer.regen.toFixed(0)} bars`,
  );
  gate(
    longer.potions === base.potions && base.potionLimit === "carry",
    "potions are capped by CARRY here, so the clock does not add any",
    `${base.potions.toFixed(0)} bars either way, limited by ${base.potionLimit}`,
  );
  // Healers do not attack, so they cost difficulty as well as time.
  gate(
    base.rWithHealers < rk.r,
    "swapping attackers for healers lowers a boss's R",
    `SSS ${rk.r.toFixed(2)} → ${base.rWithHealers.toFixed(2)} at ${base.healers} healers`,
  );
  // Both wall-clocked ranks must actually be payable at the authored settings —
  // this is the check that would have caught the rest-only economy.
  for (const r of data.proposed.ladder.filter(
    (x) => model.rankSustain(x) > 0,
  )) {
    const e = model.economy(r);
    gate(
      e.fundable,
      `${r.rank}'s healing bill is payable at the authored settings`,
      `supply ${e.supply.toFixed(0)} vs demand ${e.demand.toFixed(0)} bars (${(e.supply / e.demand).toFixed(2)}×)`,
    );
    // A DESIGN gate, not an arithmetic one. Funding a fight with consumables
    // works on paper while quietly deleting the role that was supposed to do
    // it, and nothing else on the page turns red when that happens. At the
    // first authored potion strength (0.5 bars) healers fell to 23% here —
    // 20 carried potions is ten full health bars in every player's pocket.
    gate(
      e.healerShareOfSupply > 0.5,
      `${r.rank} is a role check, not an inventory check — healers supply the majority`,
      `healers ${(e.healerShareOfSupply * 100).toFixed(0)}%, consumables ${(100 - e.healerShareOfSupply * 100).toFixed(0)}%`,
    );
  }
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

// ------------------------------------- 5e. a rank is one difficulty --------
// A rank's LABEL has to mean something. The gap term is growth^(2*gapWeight)
// per level, so across a wide band the same rank swings hard -- at 14 wide
// that is 1.99x, and because S/SS target R barely above 1.0 it used to cross
// the loss line: a band-bottom party met band-top content at R 0.81 with max
// gear and full headcount. Bosses were given one authored level to fix it.
//
// This gate asserts the fix holds: meeting a rank anywhere in its own range
// must never be a loss for a max-tier player at the rank's own headcount.
// Only rank A is permitted to reach the line, and only at its bottom edge --
// 4v4 at 14 levels under the last zone's far end should not be winnable.
console.log("\na rank is one difficulty, not a range of them");
{
  const at = (playerLevel, mobLevel, rk) => {
    const Q = { levelMax: data.proposed.levelMax };
    for (const [k, v] of Object.entries(data.proposed.inputs)) Q[k] = v.value;
    Q.mobLevelDelta = mobLevel - playerLevel;
    return new Function("DATA", "P", `${html.slice(a, b)}; return { R };`)(
      data,
      Q,
    ).R(playerLevel, rk.rank, "max", rk.n);
  };
  const EXEMPT = new Set(["A"]);
  const worst = [];
  for (const rk of data.proposed.ladder) {
    // A boss sits at one level; a pack is drawn from anywhere in its band.
    const mobLevels = rk.level ? [rk.level] : [rk.from, rk.to];
    let lo = Infinity;
    for (const pl of [rk.from, rk.to])
      for (const ml of mobLevels) lo = Math.min(lo, at(pl, ml, rk));
    worst.push(`${rk.rank} ${lo.toFixed(2)}`);
    if (!EXEMPT.has(rk.rank))
      gate(
        lo >= 1.0,
        `${rk.rank} is never a loss inside its own level range`,
        `worst case R ${lo.toFixed(2)} at ${rk.n} max-tier player${rk.n > 1 ? "s" : ""}`,
      );
  }
  gate(
    data.proposed.ladder
      .filter((rk) => rk.shape === "boss")
      .every((rk) => typeof rk.level === "number"),
    "every boss has one authored level, not a band",
  );
  console.log(`       worst case per rank: ${worst.join("  ")}`);
}

// ------------------------------------------------------ 5f. spec is current --
// The spec's tables are GENERATED from this same model, so a hand-edited or
// simply forgotten spec is a defect the moment any number moves. This gate runs
// the spec generator in --check mode: it re-renders every block and fails if the
// committed file differs. Without it the spec would rot exactly the way the
// previous one did -- 8.8K of confident prose with zero mentions of sustain,
// swings, wall clocks, boss levels or potions.
console.log("\nspec");
{
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [join(HERE, "../../scripts/gen_combat_spec.mjs"), "--check"],
    { encoding: "utf8" },
  );
  gate(
    r.status === 0,
    "the design spec's generated tables match the model",
    (r.stdout + r.stderr).trim().split("\n").pop(),
  );
}

// ------------------------------------------------------- 6. invariants ----
console.log("\ninvariants (§7)");
for (const [name, value, ok] of model.invariants()) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(44)} ${value}`);
}

// ======================================= 7. the physical/magical split =====
// Spec: docs/superpowers/specs/2026-07-30-combat-model-split-design.md §13.
//
// TWO RULES GOVERN EVERY GATE BELOW.
//
//   1. Expectations are LITERALS here. Nothing is read back out of
//      combat-model.json and compared with itself -- that is the tautology the
//      swings gate fell into, and it passed happily with rank E set to 99.
//   2. Anything derived from a sweep is RECOMPUTED LIVE, never transcribed from
//      the spec. §9's table was itself wrong for an hour because someone
//      transcribed a different sweep than the one the gate runs.
//
// The whole surface these gates cover -- matchup(), Q(), inverse() -- has no
// other caller in the repository. If a refactor breaks it, this section is the
// only thing that will notice.

// P is the SAME object the model closes over, so writing a property re-quotes
// the model live and costs nothing. Everything here restores in a finally.
const withInputs = (over, fn) => {
  const saved = {};
  for (const k of Object.keys(over)) saved[k] = P[k];
  Object.assign(P, over);
  try {
    return fn();
  } finally {
    Object.assign(P, saved);
  }
};

// Authored tags live on the grade / ladder rows in `data`, read at call time.
// NEVER leave one behind: index.html has to keep shipping at the reduction
// point, and a stray authored shape would move the pinned ladder.
const TAG_KEYS = ["rho", "theta", "slant", "element"];
const withTags = (pairs, fn) => {
  const saved = pairs.map(([row]) =>
    Object.fromEntries(TAG_KEYS.map((k) => [k, row[k]])),
  );
  pairs.forEach(([row, tags]) => Object.assign(row, tags));
  try {
    return fn();
  } finally {
    pairs.forEach(([row], i) => Object.assign(row, saved[i]));
  }
};

const gradeMax = data.proposed.grades.find((g) => g.grade === "max");
const rankRow = (rank) => data.proposed.ladder.find((x) => x.rank === rank);
// A synthetic entity: a shape plus the four displayed stats the two magnitudes
// and that shape imply. This is what matchup()/dmgRatio() consume.
const ent = (atkEff, defEff, sh) => ({
  ...sh,
  ...model.forward(atkEff, defEff, sh),
});
const span = (from, to, step) => {
  const out = [];
  for (let x = from; x <= to + step / 2; x += step)
    out.push(Number(x.toFixed(4)));
  return out;
};

console.log("\nG1–G5 — the reduction, no free lunch, and the identities");
{
  // G1 — THE REDUCTION GATE. Exact equality, not a tolerance: every pinned
  // expectation in this file is by definition the Q = 1 number.
  const flat = model.shapeOf({});
  let bad = "";
  for (const rk of data.proposed.ladder) {
    const L = model.midLevel(rk);
    const q = model.Q(model.player(L, "max"), model.mob(L, rk.rank));
    if (q !== 1) bad += `${rk.rank} Q ${q}; `;
  }
  gate(
    model.matchup(flat, flat) === 1 && model.Q(flat, flat) === 1 && !bad,
    "G1 Q == 1 exactly at the authored tags and neutral element",
    bad || "all 8 ranks, and matchup(flat, flat) === 1",
  );

  // G2 — NO FREE LUNCH, family (i): a flat defender at e = 1 gives m = 1 for
  // ANY attacker mix and tilt. No amount of offensive lopsidedness buys damage.
  // Asserted twice: on matchup() and again through dmgRatio(), because the
  // guarantee has to survive in the function that actually deals the damage.
  let worst = 0,
    n = 0;
  const flatD = ent(100, 50, flat);
  for (const rho of span(0, 1, 0.05))
    for (const theta of span(-1, 1, 0.1)) {
      const att = model.shapeOf({ rho, theta });
      worst = Math.max(
        worst,
        Math.abs(model.matchup(att, flat) - 1),
        Math.abs(model.dmgRatio(ent(100, 50, att), flatD) / 2 - 1),
      );
      n++;
    }
  gate(
    worst < 1e-12,
    `G2 no free lunch: m == 1 vs a flat defender over ${n} legal (rho, theta)`,
    `max deviation ${worst.toExponential(2)}`,
  );

  // G2 — family (ii): an attacker flat at rho = rhoBar sees m = 1 against ANY
  // defender slant. This is the half that makes the mob solver survive
  // untouched, because the solve runs against exactly that reference player.
  worst = 0;
  n = 0;
  for (const pm of span(0.05, 0.95, 0.05))
    withInputs({ postureMix: pm }, () => {
      for (const slant of span(-0.5, 0.5, 0.05)) {
        const att = model.shapeOf({ rho: pm, theta: 0 });
        worst = Math.max(
          worst,
          Math.abs(model.matchup(att, model.shapeOf({ slant })) - 1),
        );
        n++;
      }
    });
  gate(
    worst < 1e-12,
    `G2 and m == 1 for a reference-mix attacker over ${n} (rhoBar, slant)`,
    `max |m − 1| ${worst.toExponential(2)}`,
  );

  // G3 — Q is level-free. Shapes carry no level term, so this is exact
  // equality; a refactor that let a level reach matchup() turns it red.
  withTags(
    [
      [gradeMax, { rho: 0.8, theta: 0.5, slant: 0.3, element: "fire" }],
      [rankRow("C"), { rho: 0.3, theta: -0.4, slant: -0.4, element: "earth" }],
    ],
    () => {
      const LS = [1, 25, 50, 75, P.levelMax];
      const qs = LS.map((L) =>
        model.Q(model.player(L, "max"), model.mob(L, "C")),
      );
      const rs = LS.map((L) => model.R(L, "C", "max", 1));
      // Assert NON-UNIT as well as invariant. `new Set(qs).size === 1` alone is
      // satisfied by any constant, so a matchup() that stopped computing
      // anything and returned 1 would pass it. Requiring Q != 1 is what makes
      // this gate exercise the feature rather than merely its absence.
      gate(
        new Set(qs).size === 1 && Math.abs(qs[0] - 1) > 0.1,
        "G3 Q invariant to absolute level, non-default tags AND elements both sides — and non-unit, so the gate is not satisfied by a constant",
        `Q ${qs[0].toFixed(6)} at L${LS.join("/L")}`,
      );
      gate(
        Math.max(...rs) - Math.min(...rs) < 1e-9,
        "G3 and R stays level-flat with those shapes authored",
        `R ${rs[0].toFixed(4)}`,
      );
    },
  );

  // G4 — Q is 0-homogeneous in both magnitudes, rescaled INDEPENDENTLY, and
  // the same loop pins §7's factorisation identity:
  //   dmgRatio(A,D) === (atkEff_A / defEff_D) x matchup(A,D)
  // which is the property that lets R carry Q without R() mentioning it.
  {
    const att = model.shapeOf({
      rho: 0.7,
      theta: 0.6,
      slant: 0.2,
      element: "water",
    });
    const dfn = model.shapeOf({
      rho: 0.2,
      theta: -0.5,
      slant: -0.35,
      element: "fire",
    });
    const baseM = model.matchup(att, dfn),
      baseQ = model.Q(att, dfn);
    let moved = "",
      wf = 0,
      cells = 0;
    for (const s of [1e-3, 0.5, 1, 7, 1e4])
      for (const t of [1e-3, 0.5, 1, 7, 1e4]) {
        const A = ent(100 * s, 50 * s, att),
          D = ent(100 * t, 50 * t, dfn);
        if (model.matchup(A, D) !== baseM || model.Q(A, D) !== baseQ)
          moved += `${s}/${t}; `;
        wf = Math.max(
          wf,
          Math.abs(model.dmgRatio(A, D) / (((100 * s) / (50 * t)) * baseM) - 1),
        );
        cells++;
      }
    gate(
      !moved && wf < 1e-12,
      `G4 Q is 0-homogeneous and dmgRatio factorises, over ${cells} rescalings`,
      moved ||
        `Q ${baseQ.toFixed(6)} fixed, factorisation error ${wf.toExponential(2)}`,
    );
  }

  // G5 — forward/inverse round trip, and the two identities that make the
  // aggregation exact rather than approximate. Arithmetic-on-attack plus
  // harmonic-on-defence is the ONLY pairing that round-trips; a geometric
  // blend (which reads tidier) does not, and buys 2.57x damage at constant CS.
  {
    let wr = 0,
      wi = 0,
      cells = 0;
    for (const pm of [0.05, 0.25, 0.5, 0.75, 0.95])
      withInputs({ postureMix: pm }, () => {
        for (const rho of [0, 0.25, 0.5, 0.75, 1])
          for (const theta of [-1, -0.5, 0, 0.5, 1])
            for (const slant of [-0.5, -0.25, 0, 0.25, 0.5]) {
              const sh = model.shapeOf({ rho, theta, slant });
              wi = Math.max(
                wi,
                Math.abs(sh.rho * sh.xp + (1 - sh.rho) * sh.xm - 1),
                Math.abs(pm * sh.qp + (1 - pm) * sh.qm - 1),
              );
              for (const [ae, de] of [
                [1, 1],
                [60, 60],
                [4483, 4484],
                [1e-3, 1e5],
              ]) {
                const inv = model.inverse(model.forward(ae, de, sh), sh);
                wr = Math.max(
                  wr,
                  Math.abs(inv.atkEff / ae - 1),
                  Math.abs(inv.defEff / de - 1),
                );
                cells++;
              }
            }
      });
    gate(
      wr < 1e-12,
      `G5 forward/inverse round trip exact over ${cells} shape x magnitude x posture cells`,
      `max relative error ${wr.toExponential(2)}`,
    );
    gate(
      wi < 1e-12,
      "G5 the two identities hold: rho·xp+(1−rho)·xm == 1 and rhoBar·qp+(1−rhoBar)·qm == 1",
      `max |identity − 1| ${wi.toExponential(2)}`,
    );
  }
}

// G6 — the aggregates have to reproduce the PINNED curve, not merely agree with
// the page. EXPECT_CURVE above is the literal; this drives it through
// forward() and back through inverse(), which is what makes inverse()
// load-bearing rather than decorative.
console.log(
  "\nG6 — atkEff / defEff reproduce the pinned curve at theta = slant = 0",
);
for (const [L, want] of Object.entries(EXPECT_CURVE)) {
  const p = model.player(Number(L), "max");
  const inv = model.inverse(
    { pAtk: p.pAtk, mAtk: p.mAtk, pDef: p.pDef, mDef: p.mDef },
    p,
  );
  check(`L${L} atkEff`, inv.atkEff, want[1], 0.6);
  check(`L${L} defEff`, inv.defEff, want[3], 0.6);
}

console.log("\nG7–G8 — elements");
{
  // G7 — ELEMENT LEVERAGE IS FULL FOR EVERY BUILD. The element multiplies the
  // WHOLE hit, so m / mixterm == e at every mix. Attaching it to the magic term
  // alone reports 1 at rho = 1 where the shipped DamageCalculator reports e,
  // and a physical build silently gets none of the leverage a caster gets.
  // The defender is deliberately SLANTED so mixterm != 1 and the division bites.
  // The e values are literals, hand-read off the shipped cycle.
  const PAIRS = [
    ["fire", "earth", 2],
    ["earth", "fire", 0.5],
    ["water", "fire", 2],
    ["holy", "void", 2],
    ["fire", "fire", 0.5],
    ["neutral", "fire", 1],
  ];
  let bad = "",
    cells = 0;
  for (const rho of [0, 0.25, 0.5, 0.75, 1])
    for (const [ea, ed, e] of PAIRS) {
      const att = model.shapeOf({ rho, theta: 0.5, element: ea });
      const dfn = model.shapeOf({ slant: 0.4, element: ed });
      const mix = att.rho * att.xp * dfn.qp + (1 - att.rho) * att.xm * dfn.qm;
      const lev = model.matchup(att, dfn) / mix;
      if (Math.abs(lev - e) > 1e-12)
        bad += `m/mix rho ${rho} ${ea}->${ed} ${lev.toFixed(6)} want ${e}; `;
      // Again through the damage function, against the same fight with both
      // elements set to neutral: the ratio must be exactly e.
      const ratio =
        model.dmgRatio(ent(100, 50, att), ent(100, 50, dfn)) /
        model.dmgRatio(
          ent(100, 50, model.shapeOf({ rho, theta: 0.5 })),
          ent(100, 50, model.shapeOf({ slant: 0.4 })),
        );
      if (Math.abs(ratio - e) > 1e-12)
        bad += `dmgRatio rho ${rho} ${ea}->${ed} ${ratio.toFixed(6)} want ${e}; `;
      cells++;
    }
  gate(
    !bad,
    `G7 element leverage is full for every build, ${cells} (rho, pair) cells`,
    bad || "rho 0/.25/.5/.75/1 x 6 pairs, on m/mixterm and on dmgRatio",
  );

  // G8 — the table is TRINARY. Histogram pinned as a literal.
  const WANT_HIST = { 0.25: 4, 1: 41, 4: 4 };
  const els = Object.keys(data.proposed.elementTable);
  const hist = new Map();
  for (const A of els)
    for (const D of els) {
      const q = model.elem(A, D) / model.elem(D, A);
      hist.set(q, (hist.get(q) ?? 0) + 1);
    }
  const norm = (o) =>
    [...Object.entries(o)]
      .map(([k, v]) => [Number(k), v])
      .sort((x, y) => x[0] - y[0])
      .map(([k, v]) => `${k}x${v}`)
      .join(" ");
  gate(
    els.length === 7 && norm(Object.fromEntries(hist)) === norm(WANT_HIST),
    "G8 Q_element takes only {0.25, 1, 4} over all 49 ordered pairs at eta = 1",
    `${els.length} elements, ${norm(Object.fromEntries(hist))}`,
  );
  // The direction of the cycle, and the two families that cancel. Literals.
  gate(
    model.elem("water", "fire") === 2 &&
      model.elem("fire", "water") === 0.5 &&
      model.elem("fire", "earth") === 2 &&
      model.elem("earth", "wind") === 2 &&
      model.elem("wind", "water") === 2,
    "G8 the cycle runs water > fire > earth > wind > water, one-directionally",
  );
  gate(
    model.elem("holy", "void") / model.elem("void", "holy") === 1 &&
      model.elem("fire", "fire") / model.elem("fire", "fire") === 1 &&
      els.every(
        (e) => model.elem("neutral", e) === 1 && model.elem(e, "neutral") === 1,
      ),
    "G8 holy↔void and same-element cancel in Q, and neutral is inert both ways",
  );

  // G8-bis — PARITY with the shipped table. combat-model.json's table is a
  // mirror of colyseus-server's, and a mirror that drifts is worse than no
  // mirror: the page would keep reporting balance for a game that had changed.
  const tsPath = join(
    HERE,
    "../../colyseus-server/src/config/combat/elements.ts",
  );
  const ts = readFileSync(tsPath, "utf8");
  const i0 = ts.indexOf("const ELEMENT_MULTIPLIER");
  const i1 = ts.indexOf("\n}", i0);
  let shipped = null,
    parseErr2 = "";
  // GUARD THE ANCHOR. indexOf returns -1 on a rename, and ts.indexOf("{", -1)
  // silently restarts from 0 — which today happens to land on the right object
  // only because nothing precedes the table. Without this the gate would report
  // "matches on all 49 ordered pairs" while having located nothing at all,
  // which is the exact failure mode a parity gate exists to prevent.
  if (i0 < 0 || i1 < 0)
    parseErr2 = `could not locate ELEMENT_MULTIPLIER in ${tsPath} — the anchor was renamed; update this gate rather than deleting it`;
  try {
    if (parseErr2) throw new Error(parseErr2);
    shipped = new Function(
      `return ${ts
        .slice(ts.indexOf("{", i0), i1 + 2)
        .replace(/\bSTRONG\b/g, "2.0")
        .replace(/\bWEAK\b/g, "0.5")
        .replace(/\bEVEN\b/g, "1.0")}`,
    )();
  } catch (e) {
    parseErr2 = e.message;
  }
  const shippedList = (ts.match(/export const ELEMENTS = \[([^\]]*)\]/) ?? [
    "",
    "",
  ])[1]
    .split(",")
    .map((s) => s.trim().replace(/['"]/g, ""))
    .filter(Boolean);
  let drift = parseErr2;
  if (shipped)
    for (const A of shippedList)
      for (const D of shippedList)
        if (model.elem(A, D) !== shipped[A]?.[D])
          drift += `${A}->${D} lab ${model.elem(A, D)} vs game ${shipped[A]?.[D]}; `;
  gate(
    !drift && shippedList.length === 7 && shippedList.join() === els.join(),
    `G8 the lab's table matches colyseus-server/src/config/combat/elements.ts on all ${shippedList.length ** 2} ordered pairs`,
    drift || `[${shippedList.join(" ")}]`,
  );

  // An unrecognised element is an AUTHORING ERROR. Defaulting a typo to
  // neutral is the exact failure §9 warns about: neutral's inertness is the
  // only thing holding Q = 1 everywhere today, so a misspelt element would
  // move difficulty with nothing on the page turning red.
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  gate(
    throws(() => model.elem("stone", "fire")) &&
      throws(() => model.elem("fire", "stone")) &&
      throws(() => model.elem("Fire", "fire")),
    "G8 elem() THROWS on an unknown element rather than defaulting to 1",
  );
}

console.log("\nG9 — G-ELEM, the content gate (band-worst RECOMPUTED live)");
{
  // Exactly the sweep gate 5e runs, and for the same reason: a rank's band-worst
  // R is 1.5-2.4x LOWER than R at its reference conditions, so a gate built from
  // the reference column would read every margin as far safer than it is and
  // pass while the margin was gone. Max-tier player at each edge of the rank's
  // own band, mob at the band edges or the boss's authored level, at the rank's
  // own headcount. NEVER transcribed from spec §9 -- that table was itself wrong
  // until it was regenerated from this sweep.
  const bandWorst = (rk) => {
    const mobLevels = rk.level ? [rk.level] : [rk.from, rk.to];
    let lo = Infinity;
    for (const pl of [rk.from, rk.to])
      for (const ml of mobLevels)
        lo = Math.min(
          lo,
          withInputs({ mobLevelDelta: ml - pl }, () =>
            model.R(pl, rk.rank, "max", rk.n),
          ),
        );
    return lo;
  };
  // Carried over from gate 5e EXPLICITLY: rank A is allowed to reach the loss
  // line at its band bottom (4v4, 14 levels under the last zone's far end
  // should not be winnable). Every other rank must stay above it, WITH whatever
  // shapes and elements are authored.
  const EXEMPT = new Set(["A"]);
  const rows = [];
  for (const rk of data.proposed.ladder) {
    const w = bandWorst(rk);
    rows.push(
      `${rk.rank} ${w.toFixed(3)} (breaks at Q<${(1 / w).toFixed(3)}, ${(w * 0.25).toFixed(3)} at Q=0.25)`,
    );
    if (!EXEMPT.has(rk.rank))
      gate(
        w >= 1.0,
        `G9 ${rk.rank} stays winnable at its band worst case with the authored tags`,
        `band-worst R ${w.toFixed(3)}`,
      );
  }
  // The exemption restated as a LITERAL, so it cannot be quietly widened: at
  // Q = 1 rank A is the ONLY rank under the line.
  const belowFlat = withTags(
    [gradeMax, ...data.proposed.ladder].map((row) => [
      row,
      { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
    ]),
    () =>
      data.proposed.ladder
        .filter((rk) => bandWorst(rk) < 1)
        .map((rk) => rk.rank),
  );
  gate(
    belowFlat.join(",") === "A",
    "G9 at Q = 1 rank A is the only rank under R = 1 — the 5e exemption, pinned",
    `[${belowFlat.join(" ")}]`,
  );
  // G-ELEM as a CONTENT rule, which is what catches the ranks R alone cannot:
  // rank A is R-exempt above, and a rank with headroom would absorb a 0.25
  // without failing. Cycle advantage is reserved for trash/farm, so a boss must
  // be element-neutral in BOTH directions, and nothing may put the player on the
  // disadvantaged side of anything.
  let elemBad = "";
  for (const rk of data.proposed.ladder) {
    const L = model.midLevel(rk);
    const q = model.Q(model.player(L, "max"), model.mob(L, rk.rank));
    if (q < 1)
      elemBad += `${rk.rank} puts the player on the disadvantaged side (Q ${q}); `;
    if (rk.shape === "boss" && q !== 1)
      elemBad += `${rk.rank} is a boss with a cycle edge (Q ${q}) — advantage is for trash/farm; `;
  }
  gate(
    !elemBad,
    "G9 G-ELEM: no rank is cycle-disadvantaged, and no boss carries a cycle edge at all",
    elemBad || "all 8 ranks at Q = 1",
  );
  console.log(`       band-worst per rank: ${rows.join("  ")}`);
}

console.log("\nG10–G12 — clamps, class symmetry, stat visibility");
{
  // G10 — the clamps are what keep the model MEANING anything: outside them a
  // displayed stat goes negative or a defence divides by zero.
  let bad = "";
  const RAW = [-3, -1.5, -1, -0.5, 0, 0.25, 0.5, 0.75, 1, 1.5, 3];
  let cells = 0;
  for (const pm of [0.05, 0.5, 0.95])
    withInputs({ postureMix: pm }, () => {
      for (const rho of [-1, 0, 0.25, 0.5, 0.75, 1, 2])
        for (const theta of RAW)
          for (const slant of RAW) {
            const s = model.shapeOf({ rho, theta, slant });
            const st = model.forward(100, 50, s);
            if (
              !(s.rho >= 0 && s.rho <= 1) ||
              !(Math.abs(s.theta) <= 1) ||
              !(Math.abs(s.slant) <= 0.5) ||
              !(s.xp >= 0 && s.xm >= 0 && s.qp > 0 && s.qm > 0) ||
              !(st.pAtk >= 0 && st.mAtk >= 0 && st.pDef > 0 && st.mDef > 0)
            )
              bad += `rho ${rho} theta ${theta} slant ${slant} rhoBar ${pm}; `;
            cells++;
          }
    });
  gate(
    !bad,
    `G10 shapeOf clamps all ${cells} raw tag triples into xp,xm >= 0 and qp,qm > 0`,
    bad.slice(0, 160) ||
      "|theta| <= 1, |slant| <= 0.5, all four stats non-negative",
  );
  // The authored data must already be legal AS WRITTEN — a clamp that silently
  // rewrites authored content is how a designer's intent goes missing.
  let clamped = "";
  for (const row of [...data.proposed.grades, ...data.proposed.ladder]) {
    const s = model.shapeOf(row);
    if (
      s.rho !== (row.rho ?? 0.5) ||
      s.theta !== (row.theta ?? 0) ||
      s.slant !== (row.slant ?? 0)
    )
      clamped += `${row.grade ?? row.rank}; `;
  }
  gate(
    !clamped,
    "G10 every authored row is inside the clamps as written, nothing is silently rewritten",
    clamped,
  );
  // THE SIGN PATHOLOGY. The winning design wrote theta unsigned and a pure
  // caster came out pAtk 180 / mAtk 100 instead of 0 / 100. Signed is the fix
  // and this is the assertion that keeps it.
  const caster = model.forward(100, 50, model.shapeOf({ rho: 0, theta: -1 }));
  const bruiser = model.forward(100, 50, model.shapeOf({ rho: 1, theta: 1 }));
  gate(
    caster.pAtk === 0 && caster.mAtk === 100,
    "G10 theta is SIGNED: rho 0, theta −1 is pAtk 0 / mAtk 100 — not 180 / 100",
    `pAtk ${caster.pAtk} mAtk ${caster.mAtk}`,
  );
  gate(
    bruiser.pAtk === 100 && bruiser.mAtk === 0,
    "G10 and the mirror holds: rho 1, theta +1 is pAtk 100 / mAtk 0",
    `pAtk ${bruiser.pAtk} mAtk ${bruiser.mAtk}`,
  );
  const armoured = model.shapeOf({ slant: 0.5 });
  const warded = model.shapeOf({ slant: -0.5 });
  gate(
    model.forward(100, 50, armoured).pDef > 50 &&
      model.forward(100, 50, armoured).mDef < 50 &&
      model.forward(100, 50, warded).pDef < 50 &&
      model.forward(100, 50, warded).mDef > 50,
    "G10 slant is SIGNED: positive favours pDef, negative favours mDef",
  );

  // G11 — CLASS SYMMETRY. The model must have zero class bias BY CONSTRUCTION,
  // which is the whole argument behind spec §11's D7: the shipped mapping gives
  // a caster its mDef free off its offence stat and the model must not.
  const phys = model.shapeOf({ rho: 1, theta: 1 });
  const mag = model.shapeOf({ rho: 0, theta: -1 });
  const balanced = ent(100, 50, model.shapeOf({}));
  const dp = model.dmgRatio(ent(100, 50, phys), balanced);
  const dm = model.dmgRatio(ent(100, 50, mag), balanced);
  gate(
    dp === 2 && dm === 2,
    "G11 pure physical and pure magical deal identical damage to a balanced defender",
    `${dp} vs ${dm}, both atkEff/defEff`,
  );
  const pp = model.player(50, { build: "high", gear: "A", rho: 1, theta: 1 });
  const pm2 = model.player(50, { build: "high", gear: "A", rho: 0, theta: -1 });
  const flatP = model.player(50, "max");
  gate(
    pp.cs === flatP.cs && pm2.cs === flatP.cs,
    "G11 and the shape never moves CombatScore — it is a direction, not a magnitude",
    `${flatP.cs.toFixed(4)} all three`,
  );
  gate(
    pp.mAtk === 0 &&
      pp.pAtk === pp.atk &&
      pm2.pAtk === 0 &&
      pm2.mAtk === pm2.atk,
    "G11 and the two builds really are pure, not merely tilted",
  );

  // G12 — spec §11 D8. `agi` buys move speed and cadence, and the rank solve
  // absorbs aspd entirely, so agi never reaches R. With S of 4 primaries
  // R-visible the stat share is (S/4)·C / (1 + (S/4)·C). Literals from §11.
  const R_VISIBLE = 3; // str, int, vit. agi is the one R-invisible primary.
  const share = (S) => ((S / 4) * P.statCoef) / (1 + (S / 4) * P.statCoef);
  gate(
    Math.abs(share(4) - 0.3333) < 5e-5 &&
      Math.abs(share(3) - 0.2727) < 5e-5 &&
      Math.abs(share(2) - 0.2) < 5e-5,
    "G12 stat share reads 33.3% / 27.3% / 20.0% at 4 / 3 / 2 R-visible primaries",
    `at statCoef ${P.statCoef}`,
  );
  gate(
    share(R_VISIBLE) >= 0.25,
    "G12 at most one primary is R-invisible — stat share stays >= 25%",
    `${(share(R_VISIBLE) * 100).toFixed(1)}% at ${R_VISIBLE} of 4 visible`,
  );
  gate(
    share(R_VISIBLE - 1) < 0.25,
    "G12 and the bound is TIGHT: a second R-invisible primary would fail it",
    `${(share(R_VISIBLE - 1) * 100).toFixed(1)}%`,
  );
}

// ------------------------------------------- R is exactly linear in Q ------
// The gate that makes the Q-squaring bug fail LOUDLY. R() must never multiply Q
// in: hit() is split-aware, so dmgRatio factorises as (atkEff/defEff) x matchup
// and the two directions of a duel contribute matchup(p,m)/matchup(m,p) -- which
// IS Q -- all by themselves. An explicit factor squares it, and the error is
// invisible at the reduction point because Q = 1 there.
//
// Every expected Q below is a hand-derived LITERAL, and each case is authored
// here and restored immediately -- index.html must keep shipping flat.
console.log("\nR is exactly linear in Q — a squared Q would read Q²");
{
  const CASES = [
    // player tags, rank tags, rank, Q -- literal
    [{ rho: 1, theta: 1 }, { slant: 0.5 }, "C", 0.75],
    [{ element: "fire" }, { element: "earth" }, "C", 4],
    [{ element: "wind" }, { element: "earth" }, "D", 0.25],
    [{ element: "water" }, { element: "wind" }, "E", 0.25],
    [{ element: "holy" }, { element: "void" }, "B", 1],
    [{ element: "fire" }, { element: "fire" }, "B", 1],
  ];
  let bad = "";
  for (const [pt, mt, rank, wantQ] of CASES) {
    const rk = rankRow(rank),
      L = model.midLevel(rk);
    const base = model.R(L, rank, "max", rk.n);
    withTags(
      [
        [gradeMax, pt],
        [rk, mt],
      ],
      () => {
        const q = model.Q(model.player(L, "max"), model.mob(L, rank));
        const got = model.R(L, rank, "max", rk.n) / base;
        if (q !== wantQ) bad += `${rank} Q ${q} want ${wantQ}; `;
        if (Math.abs(got / wantQ - 1) > 1e-12)
          bad +=
            `${rank} R ratio ${got.toFixed(6)} want ${wantQ}` +
            ` (a squared Q reads ${(wantQ * wantQ).toFixed(4)}); `;
      },
    );
  }
  gate(
    !bad,
    `R_shaped / R_flat == Q over ${CASES.length} authored cases, Q from 0.25 to 4`,
    bad || "shape-driven and element-driven, both directions of the cycle",
  );
  // holy<->void and same-element are PURE PACING levers: Q = 1 so R does not
  // move at all, but both clocks halve or double. "Holy/void is the enormous
  // balance event" is exactly backwards, and this is the assertion that says so.
  let pacing = "";
  for (const [pe, me, wantTtk] of [
    ["holy", "void", 0.5],
    ["fire", "fire", 2],
  ]) {
    const baseT = model.ttk(33, "C", "max");
    // baseR MUST be captured out here, against the untagged model. Dividing
    // R by itself inside the closure is a self-comparison: R is a pure function
    // of P and DATA, so the ratio is identically 1 and the r !== 1 branch is
    // unreachable — the gate would assert nothing about R at all.
    const baseR = model.R(33, "C", "max", 1);
    withTags(
      [
        [gradeMax, { element: pe }],
        [rankRow("C"), { element: me }],
      ],
      () => {
        const t = model.ttk(33, "C", "max") / baseT;
        const r = model.R(33, "C", "max", 1) / baseR;
        if (Math.abs(t - wantTtk) > 1e-12 || Math.abs(r - 1) > 1e-12)
          pacing += `${pe}->${me} ttk x${t.toFixed(4)} want x${wantTtk}; `;
      },
    );
  }
  gate(
    !pacing,
    "holy↔void and same-element move the CLOCK only — Q = 1, ttk x0.5 and x2",
    pacing || "R unmoved, ttk halved and doubled",
  );
  // Mirror match, both halves. index.html's "mirror match is an even fight"
  // invariant asserts only atk/def ~ 1, which reads FALSE for a non-neutral
  // mirror unless the second half is stated: every element is 0.5 against
  // ITSELF, so a same-element mirror is still exactly even (Q = 1) and simply
  // takes 2/k hits rather than 1/k.
  const me50 = model.player(50, "max");
  let mirror =
    model.matchup(me50, me50) === 1 && model.Q(me50, me50) === 1
      ? ""
      : "neutral; ";
  withTags([[gradeMax, { element: "fire" }]], () => {
    const f = model.player(50, "max");
    if (model.Q(f, f) !== 1 || model.matchup(f, f) !== 0.5)
      mirror += "same-element; ";
  });
  gate(
    !mirror,
    "mirror match: even at neutral (m = 1), still even at same-element (Q = 1) but 2/k hits",
    mirror,
  );
  // Nothing may be left authored. This is the gate that catches a withTags()
  // whose finally never ran.
  gate(
    [gradeMax, ...data.proposed.ladder].every(
      (row) =>
        (row.rho ?? 0.5) === 0.5 &&
        (row.theta ?? 0) === 0 &&
        (row.slant ?? 0) === 0 &&
        (row.element ?? "neutral") === "neutral",
    ),
    "every authored shape restored to the reduction point",
  );
}

// --------------------------- the two globals, honestly characterised ------
// postureMix and elemWeight are NOT outcome-neutral the way durabilityHp is.
// durabilityHp leaves R unmoved at every setting, authored or not; these two
// leave R BIT-identical only while every tag is flat and neutral -- which is
// exactly where the ladder is calibrated -- and become real balance levers the
// moment anything is authored. Both halves are asserted, because the neutrality
// claim was overstated once and the honest version is the testable one.
console.log(
  "\nthe two new globals — bit-identical at flat tags, levers once authored",
);
{
  const base = {};
  for (const rk of data.proposed.ladder)
    base[rk.rank] = model.R(model.midLevel(rk), rk.rank, "max", rk.n);
  let off = "";
  for (const rk of data.proposed.ladder)
    if (Math.abs(base[rk.rank] - EXPECT_LADDER[rk.rank]) > 0.005)
      off += `${rk.rank} ${base[rk.rank].toFixed(3)}; `;
  let bad = "",
    cells = 0;
  for (const pm of span(0.05, 0.95, 0.05))
    for (const ew of span(0, 1, 0.05))
      withInputs({ postureMix: pm, elemWeight: ew }, () => {
        for (const rk of data.proposed.ladder) {
          cells++;
          const got = model.R(model.midLevel(rk), rk.rank, "max", rk.n);
          if (!Object.is(got, base[rk.rank]))
            bad += `${rk.rank} at rhoBar ${pm} eta ${ew}: ${got}; `;
        }
      });
  gate(
    !off && !bad,
    `postureMix x elemWeight leave all ${cells} ladder cells BIT-identical at flat tags`,
    off ||
      bad.slice(0, 160) ||
      "baseline is EXPECT_LADDER, so this is not self-referential",
  );
  // postureMix re-quotes a lopsided defender: qp = 1 − slant(1 − rhoBar), so at
  // slant 0.5 it runs 0.525 to 0.975 across the slider — 13/7 of span. Literal.
  withTags(
    [
      [gradeMax, { rho: 1, theta: 1 }],
      [rankRow("C"), { slant: 0.5 }],
    ],
    () => {
      const at = (pm) =>
        withInputs({ postureMix: pm }, () => model.R(33, "C", "max", 1));
      const ratio = at(0.95) / at(0.05);
      gate(
        Math.abs(ratio / (0.975 / 0.525) - 1) < 1e-12,
        "postureMix IS a balance lever once a shape is authored — 13/7 across its range",
        `R x${ratio.toFixed(4)} from rhoBar 0.05 to 0.95`,
      );
    },
  );
  withTags(
    [
      [gradeMax, { element: "fire" }],
      [rankRow("C"), { element: "earth" }],
    ],
    () => {
      const at = (ew) =>
        withInputs({ elemWeight: ew }, () => model.R(33, "C", "max", 1));
      gate(
        Math.abs(at(1) / at(0) - 4) < 1e-12 &&
          Math.abs(at(0.5) / at(0) - 2) < 1e-12,
        "elemWeight damps exactly: eta 0 is Q 1, eta 0.5 is Q 2, eta 1 is Q 4",
        `x${(at(1) / at(0)).toFixed(4)} at eta 1, x${(at(0.5) / at(0)).toFixed(4)} at eta 0.5`,
      );
    },
  );
}

// --------------------------------- N. the game's gear scale vs this model ---
// The lab's gearTiers put best-in-slot at scale 1.0. contracts/content/items.json
// is the game's real weapon catalog, and contracts' GEAR_REFERENCE normalises it
// so the best weapon reads exactly 1.0. If a stronger weapon ships without moving
// GEAR_REFERENCE, weapons quietly exceed the scale this model was solved against.
// Gated HERE as well as in contracts/src/meta/labParity.test.ts because verify.mjs
// cannot import TypeScript, and the lab must not depend on the game to be checked.
{
  console.log("\ngame catalog vs gear scale");
  const items = JSON.parse(
    readFileSync(new URL("../../contracts/content/items.json", import.meta.url), "utf8"),
  );
  const weapons = items.filter((i) => i.kind === "weapon");
  const totals = weapons.map((w) => (w.pAtk ?? 0) + (w.mAtk ?? 0));
  const GEAR_REFERENCE = 18; // pinned, mirrors contracts/src/meta/weaponStats.ts
  const max = Math.max(...totals);

  gate(
    max === GEAR_REFERENCE,
    "GEAR_REFERENCE is exactly the catalog's best weapon total",
    `catalog max ${max}, pinned ${GEAR_REFERENCE}`,
  );
  gate(
    totals.every((t) => t > 0 && t / GEAR_REFERENCE <= 1 + 1e-12),
    "every weapon's gear scale lands in (0, 1] like the lab's gearTiers",
    `${weapons.length} weapons, worst ${(Math.min(...totals) / GEAR_REFERENCE).toFixed(3)}`,
  );
  gate(
    weapons.every((w) => ["str", "dex", "int"].includes(w.atkStat)),
    "every weapon declares a valid atkStat (offence reads ONE stat)",
    weapons.map((w) => `${w.id}:${w.atkStat}`).join(" "),
  );
}

console.log(
  failures === 0
    ? "\nOK — page renders, headers documented, model matches the balance sheet.\n"
    : `\n${failures} FAILURE(S).\n`,
);
process.exit(failures === 0 ? 0 : 1);
