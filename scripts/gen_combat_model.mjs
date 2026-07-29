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
// Each rank is defined by TWO targets: how hard it is (`r`) and how fast it
// drains you (`danger`, share of your health bar per second). Fight length is
// DERIVED from them — ttk = 100 / (R_solo × danger) — rather than authored.
//
// That replaces the eight TTK figures in HANDOFF.md (3.5 / 8 / 13.5 / 21 / 45 /
// 195 / 750 / 3750s). Those were written independently of the R ladder, and
// nobody ever divided one by the other: the resulting danger curve zigzagged
// 2.40 / 2.10 / 1.85 / 2.90 / 1.98 %/s, so rank C was the safest fight in the
// game and rank A was LESS intense than rank B — which is why A's attack came
// out lower than B's. Choosing danger directly makes the ladder monotonic in
// fight length, attack, defence and HP all at once.
//
// The old top-rank targets (195 / 750 / 3750s) are gone rather than unreachable.
// They still are unreachable — R = 1/(atk × def × hp) means an hour-long fight
// survived on one health bar consists of imperceptible hits — but that is now a
// sustain question, not a hole in the ladder.
// `shape` is the encounter, and it changes the arithmetic:
//
//   pack — n players against n mobs. R = R_solo x 2n/(n+1), bounded at 2x.
//   boss — n players against ONE mob. R = R_solo x n^2, unbounded.
//
// The n^2 is what makes a boss possible at all. Above rank A the mob has to
// grow in attack AND defence AND HP at once, and a pack cannot pay for that:
// at 8-vs-8 the ladder ran out of room at exactly R = 1.00. Concentrating the
// party's damage into one target and spreading the boss's damage across the
// party buys back a factor of n^2 -- 64x at rank S.
//
// ASSUMPTION, and it is load-bearing: a boss's damage is shared evenly across
// the party. If it focuses one player instead, that player takes n times the
// damage and dies. Without healing, even sharing is the only survivable reading
// -- so "a boss must rotate targets" is an AI requirement, not an observation.
//
// `swings` is the authored target: how many of the mob's swings it takes to
// kill ONE player. That is the number a designer can actually picture, so it is
// what gets written down; danger (health bar drained per second) and fight
// length are both derived from it:
//
//   danger = 100 x aspd / swings          (x 1/n for a boss, whose damage spreads)
//   ttk    = 100 / (R x danger)
//
// Consequence worth knowing: your OWN swings to kill are `swings / R`, so a
// rank the mob needs 15 swings to win costs you 1.3 at R = 11.89. Trash dies in
// one hit precisely because it is 12x weaker than you -- that is R doing what it
// says, not the ladder being wrong.
const LADDER_TARGETS = [
  {
    rank: "E",
    r: 11.89,
    swings: 15,
    n: 1,
    shape: "pack",
    from: 1,
    to: 12,
    was: 1.0,
  },
  {
    rank: "D",
    r: 5.95,
    swings: 13.5,
    n: 1,
    shape: "pack",
    from: 13,
    to: 25,
    was: 1.15,
  },
  {
    rank: "C",
    r: 4.0,
    swings: 12,
    n: 1,
    shape: "pack",
    from: 26,
    to: 40,
    was: 1.3,
  },
  {
    rank: "B",
    r: 2.19,
    swings: 10,
    n: 2,
    shape: "pack",
    from: 41,
    to: 55,
    was: 1.5,
  },
  {
    rank: "A",
    r: 1.8,
    swings: 8.5,
    n: 4,
    shape: "pack",
    from: 56,
    to: 70,
    was: 1.8,
  },
  // Bosses: swings are what it needs to kill ONE player if it focuses them.
  {
    rank: "S",
    r: 1.6,
    swings: 7,
    n: 8,
    shape: "boss",
    from: 71,
    to: 84,
    was: 2.2,
  },
  {
    rank: "SS",
    r: 1.5,
    swings: 6,
    n: 20,
    shape: "boss",
    from: 85,
    to: 95,
    was: 2.8,
  },
  {
    rank: "SSS",
    r: 1.4,
    swings: 5,
    n: 50,
    shape: "boss",
    from: 96,
    to: 99,
    was: 3.5,
  },
];

const ladder = LADDER_TARGETS.map((t) => ({
  rank: t.rank,
  r: t.r,
  swings: t.swings,
  shape: t.shape,
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
    // 0.5 = one swing every two seconds. Attack speed does not change difficulty
    // or fight length at all — the rank solve absorbs it — but it decides how
    // that fight is DELIVERED: per-hit damage is 1/(R x ttk x aspd), so slow
    // swings mean few heavy blows instead of a drizzle of pinpricks.
    aspd: {
      value: 0.5,
      min: 0.2,
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
    // Where a mob's durability sits. def x hp is pinned by difficulty and
    // duration; the split between them is FREE and changes no outcome — but it
    // decides whether an S boss is a 2,770 HP wall of armour you chip at 9 a
    // swing, or a 6,132 HP boss you hit for 21. Durability belongs mostly in HP
    // so damage numbers stay readable and a weapon still feels like a weapon.
    //
    // 0.90 rather than 0.75 because defence is the stat players read as "how
    // armoured is it", and at 0.75 it stepped +118% / +53% / +54% from rank A --
    // far past the +20-30% the top of the ladder is meant to feel like. At 0.90
    // it steps +37% / +19% / +19% while attack still doubles at A -> S, so a
    // boss reads as much harder-hitting rather than much more armoured.
    durabilityHp: {
      value: 0.9,
      min: 0.5,
      max: 1,
      step: 0.05,
      label: "Mob durability in HP (vs def)",
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
    "THIS MODEL AND THE SHIPPED STAT FORMULA DISAGREE STRUCTURALLY, not just in tuning. contracts/src/meta/derivedStats.ts is a PINNED formula and it is ADDITIVE with a flat base -- maxHealth = 100 + 10*vit + 5*(level-1), pAtk = 10 + 2*str + weapon.pAtk, pDef = 5 + vit -- so it has NO geometric growth at all. This model is multiplicative: refHp * growth^level, 18,300 HP at L99 against the shipped formula's 100 + 10*vit + 490. Three separate gaps: (a) additive vs multiplicative growth, (b) the game splits pAtk/mAtk and pDef/mDef where this model carries one atk and one def, (c) the game has four primaries (str, agi, int, vit) and agi feeds move speed ONLY, so points into agi are invisible to R here. `alloc` in this model is an abstraction over that pool, not a mapping onto it. Reconciling the two is unscoped work and nothing here is a spec for derivedStats until it is done.",
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
