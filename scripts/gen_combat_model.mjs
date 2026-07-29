#!/usr/bin/env node
// Generates tools/combat-lab/combat-model.json — the input data for the combat
// balance lab (tools/combat-lab/index.html).
//
// This file is the I-028 combat model and NOTHING ELSE. It deliberately does not
// read, import or scrape anything from the game.
//
// An earlier version scraped the shipped constants out of the server's
// TypeScript so the page could show live drift. That was a mistake at this
// stage: the running code is a single-player debug prototype, and letting it
// sit next to the design invites the design to be judged against it — or worse,
// bent to match it. The foundation gets settled on its own terms first;
// reconciling it with what ships is a separate, later job.
//
// Re-run after changing the model:
//
//   node scripts/gen_combat_model.mjs
//
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- damage ----
// One hit:
//
//   dmg = k × refHp(defender level) × (atk / def)
//
// `refHp` is a REFERENCE CURVE, not the defender's own HP — that distinction is
// load-bearing. If damage scaled with the target's actual HP, bigger HP bars
// would take proportionally bigger hits and stacking HP would do nothing at all.
// As a reference curve it just makes `k` readable: k is the share of a typical
// HP bar one even hit removes, so 1/k is hits-to-kill in an even fight.
//
// The level gap enters through atk/def and NOWHERE else — atk and def already
// grow with their owners' levels, so an explicit growth^lvDiff term would count
// it twice. `gapWeight` then damps what remains.

const growth = 1.045;

// Rank ladder. `mult` is a CombatScore multiplier and is SOLVED, not authored,
// so the R column stays exactly where it has always been calibrated:
//
//   R_encounter = (CS_player / CS_mob)^3 × 2n/(n+1)
//
// CS is the geometric mean of atk, def and hp, so it grows at exactly `growth`
// per level and R is the cube of the CS ratio.
// `ttk` is the committed target from HANDOFF.md. Where it is set, the page
// solves THREE multipliers per rank — atk, def and hp — so the rank hits both
// its target R and its target fight length. Where it is null the rank falls back
// to one uniform multiplier and its fight length is derived.
//
// S, SS and SSS are deliberately null. Their targets (195s / 750s / 3750s) are
// not reachable: R = 1/(atk x def x hp), so stretching a fight 370x at fixed
// difficulty forces the mob's attack down to 0.8% of a player's. An SSS boss
// would land ~5,600 hits each removing about one eight-thousandth of your health
// bar. A long fight survived on ONE health bar must consist of imperceptible
// hits — that is arithmetic, not tuning. Those three ranks are blocked on a
// sustain model (healing / regen), not on the ladder.
const LADDER_TARGETS = [
  { rank: "E", r: 11.89, ttk: 3.5, n: 1, from: 1, to: 12, was: 1.0 },
  { rank: "D", r: 5.95, ttk: 8, n: 1, from: 13, to: 25, was: 1.15 },
  { rank: "C", r: 4.0, ttk: 13.5, n: 1, from: 26, to: 40, was: 1.3 },
  { rank: "B", r: 2.19, ttk: 21, n: 2, from: 41, to: 55, was: 1.5 },
  { rank: "A", r: 1.8, ttk: 45, n: 4, from: 56, to: 70, was: 1.8 },
  { rank: "S", r: 1.6, ttk: null, n: 8, from: 71, to: 84, was: 2.2 },
  { rank: "SS", r: 1.5, ttk: null, n: 20, from: 85, to: 95, was: 2.8 },
  { rank: "SSS", r: 1.4, ttk: null, n: 50, from: 96, to: 99, was: 3.5 },
];

const ladder = LADDER_TARGETS.map((t) => ({
  rank: t.rank,
  r: t.r,
  ttk: t.ttk,
  mult: Math.cbrt((2 * t.n) / ((t.n + 1) * t.r)),
  n: t.n,
  from: t.from,
  to: t.to,
  was: t.was,
}));

const proposed = {
  origin: "design-spec",
  spec: "docs/superpowers/specs/2026-07-28-combat-stat-model-design.md",
  balanceSheet: "docs/superpowers/specs/2026-07-28-combat-balance-sheet.md",
  reference:
    ".claude/idea_backlog/I-028-phase-c-runtime-spine-player-race-class/model/balance_sheet.py",
  note:
    "NOT in code yet. Damage is k * refHp(L) * (atk/def) — Lineage 2's divide " +
    "shape. Headcount reading is 'n mobs AND n players', so " +
    "R_encounter = R_single * 2n/(n+1).",

  // Tunable in the lab's Inputs panel.
  inputs: {
    growth: {
      value: growth,
      min: 1.02,
      max: 1.07,
      step: 0.001,
      label: "Growth / level",
    },
    k: {
      value: 0.1,
      min: 0.02,
      max: 0.5,
      step: 0.01,
      label: "Damage k (share of an HP bar)",
    },
    baseHp: {
      value: 200,
      min: 50,
      max: 800,
      step: 10,
      label: "Reference HP @L1",
    },
    baseAtk: { value: 40, min: 5, max: 200, step: 1, label: "Base atk @L1" },
    // 49, not 40: the offensive budget buys one stat while the defensive budget
    // is split across hp AND def (sqrt each), so def needs the larger base for a
    // mirror match to sit at atk/def = 1.0 — which is what makes 1/k readable as
    // hits-to-kill in an even fight.
    baseDef: { value: 49, min: 5, max: 200, step: 1, label: "Base def @L1" },
    aspd: {
      value: 1.5,
      min: 0.5,
      max: 4,
      step: 0.1,
      label: "Attack speed (hits/s)",
    },
    statCoef: {
      value: 0.5,
      min: 0.0,
      max: 1.5,
      step: 0.05,
      label: "Stat coefficient C",
    },
    gearLean: {
      value: 0.65,
      min: 0.5,
      max: 0.9,
      step: 0.01,
      label: "Gear class lean (offense share)",
    },
    mspdBase: { value: 20, min: 5, max: 40, step: 1, label: "Move speed base" },
    mspdCap: {
      value: 36,
      min: 10,
      max: 60,
      step: 1,
      label: "Move speed clamp",
    },
    encounterSize: {
      value: 1,
      min: 1,
      max: 50,
      step: 1,
      label: "Encounter size (n vs n)",
    },
    gapWeight: {
      value: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Level gap weight",
    },
    exampleLevel: {
      value: 20,
      min: 1,
      max: 99,
      step: 1,
      label: "Worked example level",
    },
    mobLevelDelta: {
      value: 0,
      min: -20,
      max: 20,
      step: 1,
      label: "Mob level − player level",
    },
  },

  levelMax: 99,
  statCapAtL1: 10,
  statCapAtLMax: 99,

  ladder,

  // Two INDEPENDENT player axes. They used to be fused into one max/median/min
  // scale, which made "great build, bad gear" impossible to read off the page.
  //
  // build = how completely the player allocated stat points.
  builds: [
    { build: "low", alloc: 0.4 },
    { build: "mid", alloc: 0.7 },
    { build: "high", alloc: 1.0 },
  ],
  // gear = equipment tier. NOTE: gear tiers do not exist in code — weapons.ts
  // holds archetypes (sword/staff/bow/dagger/scythe), not tiers. This scale is
  // authored design data and is the weakest-grounded input on the page.
  gearTiers: [
    { tier: "E", scale: 0.7 },
    { tier: "C", scale: 0.85 },
    { tier: "A", scale: 1.0 },
  ],
  // DIRECTION axes. `builds` and `gearTiers` above are MAGNITUDES -- how much
  // you allocated, how good the gear is. Neither says WHERE it points.
  //
  // Both default to the balanced midpoint everywhere they are not named, so
  // every number that predates them is reproduced exactly.
  focuses: [
    { focus: "full tank", off: 0.0 },
    { focus: "balanced", off: 0.5 },
    { focus: "full DPS", off: 1.0 },
  ],
  gearClasses: ["tank", "balanced", "dps"],

  // The eight player groups the comparison table enumerates:
  //   [gear class tank|dps] x [gear tier low|high] x [build full tank|full DPS]
  archetypes: [
    { gearClass: "dps", gear: "A", tier: "high", focus: "full DPS" },
    { gearClass: "dps", gear: "A", tier: "high", focus: "full tank" },
    { gearClass: "dps", gear: "E", tier: "low", focus: "full DPS" },
    { gearClass: "dps", gear: "E", tier: "low", focus: "full tank" },
    { gearClass: "tank", gear: "A", tier: "high", focus: "full DPS" },
    { gearClass: "tank", gear: "A", tier: "high", focus: "full tank" },
    { gearClass: "tank", gear: "E", tier: "low", focus: "full DPS" },
    { gearClass: "tank", gear: "E", tier: "low", focus: "full tank" },
  ],
  archetypeRanks: ["E", "D", "C", "B", "A", "S", "SS"],

  grades: [
    { grade: "max", build: "high", gear: "A" },
    { grade: "median", build: "mid", gear: "C" },
    { grade: "min", build: "low", gear: "E" },
  ],

  // R = time you survive / time the encounter survives. R>1 wins.
  // `max: null` means unbounded — JSON has no Infinity.
  bands: [
    { name: "LOSS", max: 1.0, tone: "loss" },
    { name: "brutal", max: 1.3, tone: "brutal" },
    { name: "hard", max: 2.0, tone: "hard" },
    { name: "fair", max: 3.5, tone: "fair" },
    { name: "easy", max: 8.0, tone: "easy" },
    { name: "trivial", max: null, tone: "trivial" },
  ],

  requirements: [
    {
      id: "s-solo-loss",
      label: "max player CANNOT solo a same-level S mob",
      level: 77,
      rank: "S",
      grade: "max",
      solo: true,
      min: 0,
      max: 1.0,
    },
    {
      id: "a-solo-not-easy",
      label: "max player cannot EASILY solo same-level A",
      level: 63,
      rank: "A",
      grade: "max",
      solo: true,
      min: 0,
      max: 3.5,
    },
    {
      id: "c-median-fair",
      label: "median player beats same-level C, fair",
      level: 33,
      rank: "C",
      grade: "median",
      solo: true,
      min: 2.0,
      max: 3.5,
    },
    {
      id: "c-max-easy",
      label: "max player beats same-level C, easy",
      level: 33,
      rank: "C",
      grade: "max",
      solo: true,
      min: 3.5,
      max: 8.0,
    },
  ],

  openQuestions: [
    "BUILD DIRECTION IS INVISIBLE TO THE OUTCOME. A budget applies once and is split among the stats it buys, so (1+2Ca*phi)(1+2Ca*(1-phi)) is symmetric about phi=0.5: a full-DPS and a full-tank player have IDENTICAL CombatScore, R and HP left. Only time-to-kill moves, by 2x. Either that is the intent (build = pacing, gear = power) or a tank's advantage has to come from the party -- taunt and aggro -- rather than from the damage formula.",
    "HP and DEF are exactly interchangeable by construction (CS is the geometric mean of atk, def, hp), so neither is a trap stat. Confirm that is wanted before anything depends on it.",
    "Gap weight 0.6 is a chosen value, not a derived one. It makes a mob 10 levels above you 1.70x harder instead of 2.41x. It is symmetric: out-levelling content near your own level is correspondingly less rewarding.",
    "Top ranks derive a 2-9s encounter TTK against a 3000-4500s target -- are SS/SSS n players vs ONE boss rather than a pack of n?",
    "Mana, skills and physical-vs-magic parity are modelled separately (mana_level.py, parity.py) and are not folded into R yet. The model now carries a single atk rather than pAtk/mAtk.",
  ],
};

// ------------------------------------------------------------------ emit ----

function main() {
  const out = { version: 3, generatedAt: new Date().toISOString(), proposed };
  const dir = join(ROOT, "tools/combat-lab");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, "combat-model.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${dest}`);
  console.log(
    `  growth ${proposed.inputs.growth.value}, k ${proposed.inputs.k.value}, ` +
      `${ladder.length} ranks (mult solved from target R)`,
  );
  console.log(
    "  " + ladder.map((r) => `${r.rank} ${r.mult.toFixed(4)}`).join("  "),
  );
}

main();
