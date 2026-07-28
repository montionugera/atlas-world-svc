#!/usr/bin/env node
// Generates tools/combat-lab/combat-model.json — the input data for the combat
// balance lab (tools/combat-lab/index.html).
//
// Two halves, deliberately kept apart:
//
//   shipped   — scraped out of the REAL TypeScript the server runs on. Never
//               hand-typed here. If someone retunes a weapon or the pinned
//               derivedStats formula, this picks it up on the next run, and the
//               lab shows the drift against the design. Every extraction below
//               asserts it matched; a rename fails the script loudly rather
//               than silently emitting a stale number.
//
//   proposed  — the I-028 combat stat model. This does NOT exist in code yet,
//               so it is authored here and tagged origin:"design-spec". When it
//               ships, move each value into the shipped scraper and delete it.
//
// Re-run whenever combat config or the design changes:
//
//   node scripts/gen_combat_model.mjs
//
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = {
  derivedStats: "contracts/src/meta/derivedStats.ts",
  combatStats: "colyseus-server/src/config/combat/combatStats.ts",
  physicsConfig: "colyseus-server/src/config/physicsConfig.ts",
  gameConfig: "colyseus-server/src/config/gameConfig.ts",
};

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** Pull one capture group out of `src`, or die naming the pattern that broke. */
function grab(src, label, re, group = 1) {
  const m = src.match(re);
  if (!m) {
    throw new Error(
      `gen_combat_model: could not extract "${label}" — the source moved or was ` +
        `renamed. Fix the pattern in scripts/gen_combat_model.mjs:\n  ${re}`,
    );
  }
  return Number(m[group]);
}

/**
 * Slice exactly one `export const X = {...} as const` literal. Bounded on
 * purpose: an unbounded window silently reads the NEXT block's value when a key
 * is absent, which is how player wind-up times first came out as the mob's.
 */
function objectBody(src, anchor) {
  const start = src.indexOf(anchor);
  if (start < 0) throw new Error(`gen_combat_model: no anchor "${anchor}"`);
  const end = src.indexOf("} as const", start);
  if (end < 0)
    throw new Error(
      `gen_combat_model: "${anchor}" has no closing "} as const"`,
    );
  return src.slice(start, end);
}

/**
 * Read a numeric field out of one object literal. The value may be a literal or
 * a reference like `PLAYER_DEFAULT_WIND_MS.windDownMs`, resolved via `consts`.
 */
function field(src, anchor, key, consts = {}) {
  const body = objectBody(src, anchor);
  const m = body.match(
    new RegExp(`\\b${key}:\\s*(-?[\\d.]+|[A-Za-z_$][\\w$]*\\.[\\w$]+)`),
  );
  if (!m) {
    throw new Error(`gen_combat_model: "${anchor}" has no field "${key}"`);
  }
  const raw = m[1];
  if (/^-?[\d.]+$/.test(raw)) return Number(raw);
  if (!(raw in consts)) {
    throw new Error(
      `gen_combat_model: "${anchor}.${key}" is the reference "${raw}", which is ` +
        `not in the resolved constants map. Add it in scrapeShipped().`,
    );
  }
  return consts[raw];
}

// ---------------------------------------------------------------- shipped ---

function scrapeShipped() {
  const ds = read(SOURCES.derivedStats);
  const cs = read(SOURCES.combatStats);
  const pc = read(SOURCES.physicsConfig);
  const gc = read(SOURCES.gameConfig);

  // The pinned formula bodies in derivedStats.ts. These are ADDITIVE today —
  // that is exactly the thing I-028 replaces, so the lab needs the real numbers
  // to draw the before/after.
  const derived = {
    maxHealth: {
      base: grab(ds, "maxHealth.base", /maxHealth:\s*(\d+)\s*\+/),
      perVit: grab(
        ds,
        "maxHealth.perVit",
        /maxHealth:\s*\d+\s*\+\s*(\d+)\s*\*\s*vit/,
      ),
      perLevel: grab(
        ds,
        "maxHealth.perLevel",
        /vit\s*\+\s*(\d+)\s*\*\s*\(level\s*-\s*1\)/,
      ),
    },
    pAtk: {
      base: grab(ds, "pAtk.base", /pAtk:\s*(\d+)\s*\+/),
      perStr: grab(ds, "pAtk.perStr", /pAtk:\s*\d+\s*\+\s*(\d+)\s*\*\s*str/),
    },
    mAtk: {
      base: grab(ds, "mAtk.base", /mAtk:\s*(\d+)\s*\+/),
      perInt: grab(ds, "mAtk.perInt", /mAtk:\s*\d+\s*\+\s*(\d+)\s*\*\s*int/),
    },
    pDef: {
      base: grab(ds, "pDef.base", /pDef:\s*(\d+)\s*\+\s*vit/),
      perVit: 1,
    },
    mDef: {
      base: grab(ds, "mDef.base", /mDef:\s*(\d+)\s*\+\s*int/),
      perInt: 1,
    },
    maxMoveSpeed: {
      base: grab(ds, "mspd.base", /maxMoveSpeed:\s*(\d+)\s*\+/),
      perAgi: grab(
        ds,
        "mspd.perAgi",
        /maxMoveSpeed:\s*\d+\s*\+\s*([\d.]+)\s*\*\s*agi/,
      ),
    },
  };

  const statRange = {
    min: grab(cs, "PRIMARY_MIN", /PRIMARY_MIN\s*=\s*(\d+)/),
    max: grab(cs, "PRIMARY_MAX", /PRIMARY_MAX\s*=\s*(\d+)/),
  };

  // PLAYER_STATS spells its wind timings as PLAYER_DEFAULT_WIND_MS.* rather than
  // literals, so resolve that object first and pass it in.
  const consts = {
    "PLAYER_DEFAULT_WIND_MS.windUpMs": field(
      cs,
      "export const PLAYER_DEFAULT_WIND_MS",
      "windUpMs",
    ),
    "PLAYER_DEFAULT_WIND_MS.windDownMs": field(
      cs,
      "export const PLAYER_DEFAULT_WIND_MS",
      "windDownMs",
    ),
  };

  const block = (anchor) => ({
    maxHealth: field(cs, anchor, "maxHealth", consts),
    pAtk: field(cs, anchor, "pAtk", consts),
    mAtk: field(cs, anchor, "mAtk", consts),
    pDef: field(cs, anchor, "pDef", consts),
    mDef: field(cs, anchor, "mDef", consts),
    armor: field(cs, anchor, "armor", consts),
    attackRange: field(cs, anchor, "attackRange", consts),
    atkWindUpTime: field(cs, anchor, "atkWindUpTime", consts),
    atkWindDownTime: field(cs, anchor, "atkWindDownTime", consts),
    radius: field(cs, anchor, "radius", consts),
    maxMoveSpeed: field(cs, anchor, "maxMoveSpeed", consts),
  });

  // physicsConfig nests radii under per-entity keys; slice to each one first so
  // we do not pick up a neighbour's radius.
  const radiusAfter = (key) =>
    grab(pc.slice(pc.indexOf(key)), `${key}.radius`, /radius:\s*([\d.]+)/);

  return {
    origin: "source",
    sources: SOURCES,
    note:
      "Scraped from the TypeScript the server actually runs. Do not hand-edit; " +
      "re-run scripts/gen_combat_model.mjs.",
    derivedStats: derived,
    statRange,
    player: block("export const PLAYER_STATS"),
    mob: block("export const MOB_STATS"),
    physics: {
      timeStep:
        grab(pc, "timeStep numerator", /timeStep:\s*([\d.]+)\s*\/\s*[\d.]+/) /
        grab(pc, "timeStep denominator", /timeStep:\s*[\d.]+\s*\/\s*([\d.]+)/),
      velocityIterations: grab(
        pc,
        "velocityIterations",
        /velocityIterations:\s*(\d+)/,
      ),
      positionIterations: grab(
        pc,
        "positionIterations",
        /positionIterations:\s*(\d+)/,
      ),
      playerRadius: radiusAfter("player: {"),
      mobRadius: radiusAfter("mob: {"),
      projectileRadius: radiusAfter("projectile: {"),
    },
    game: {
      tickRate: grab(gc, "tickRate", /const tickRate\s*=\s*(\d+)/),
      worldWidth: grab(gc, "worldWidth", /worldWidth:\s*(\d+)/),
      worldHeight: grab(gc, "worldHeight", /worldHeight:\s*(\d+)/),
    },
  };
}

// --------------------------------------------------------------- proposed ---
// I-028. Mirrors model/balance_sheet.py exactly — that script and this block
// must agree, and tools/combat-lab/index.html re-derives everything from here.

const proposed = {
  origin: "design-spec",
  spec: "docs/superpowers/specs/2026-07-28-combat-stat-model-design.md",
  balanceSheet: "docs/superpowers/specs/2026-07-28-combat-balance-sheet.md",
  reference:
    ".claude/idea_backlog/I-028-phase-c-runtime-spine-player-race-class/model/balance_sheet.py",
  note:
    "NOT in code yet. Stats MULTIPLY gear rather than add. Headcount reading is " +
    "'n mobs AND n players', so R_encounter = R_single * 2n/(n+1).",

  // Tunable in the lab's Inputs panel.
  inputs: {
    growth: {
      value: 1.045,
      min: 1.02,
      max: 1.07,
      step: 0.001,
      label: "Growth / level",
    },
    statCoef: {
      value: 0.5,
      min: 0.0,
      max: 1.5,
      step: 0.05,
      label: "Stat coefficient C",
    },
    targetReduction: {
      value: 0.33,
      min: 0.0,
      max: 0.8,
      step: 0.01,
      label: "Target mitigation",
    },
    dps1: { value: 20, min: 5, max: 60, step: 1, label: "Base DPS @L1" },
    hp1: { value: 100, min: 40, max: 400, step: 10, label: "Base HP @L1" },
    def1: { value: 5, min: 1, max: 40, step: 1, label: "Base pDef @L1" },
    aspd: {
      value: 1.5,
      min: 0.5,
      max: 4,
      step: 0.1,
      label: "Attack speed (hits/s)",
    },
    castRate: {
      value: 0.8,
      min: 0.2,
      max: 3,
      step: 0.1,
      label: "Cast rate (casts/s)",
    },
    physMix: {
      value: 0.7,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Physical share of DPS",
    },
    mspdBase: { value: 20, min: 5, max: 40, step: 1, label: "Move speed base" },
    mobLevelDelta: {
      value: 0,
      min: -20,
      max: 20,
      step: 1,
      label: "Mob level − player level",
    },
    mspdCap: {
      value: 36,
      min: 10,
      max: 60,
      step: 1,
      label: "Move speed clamp",
    },
  },

  levelMax: 99,
  statCapAtL1: 10,
  statCapAtLMax: 99,

  // rank -> per-mob CS multiplier, encounter headcount, level band
  ladder: [
    { rank: "E", mult: 0.29, n: 1, from: 1, to: 12, was: 1.0 },
    { rank: "D", mult: 0.41, n: 1, from: 13, to: 25, was: 1.15 },
    { rank: "C", mult: 0.5, n: 1, from: 26, to: 40, was: 1.3 },
    { rank: "B", mult: 0.78, n: 2, from: 41, to: 55, was: 1.5 },
    { rank: "A", mult: 0.943, n: 4, from: 56, to: 70, was: 1.8 },
    { rank: "S", mult: 1.054, n: 8, from: 71, to: 84, was: 2.2 },
    { rank: "SS", mult: 1.127, n: 20, from: 85, to: 95, was: 2.8 },
    { rank: "SSS", mult: 1.183, n: 50, from: 96, to: 99, was: 3.5 },
  ],

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
  // The old grade names survive as the DIAGONAL of build x gear, so the four
  // requirements keep meaning exactly what they meant before.
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
    "The n-vs-n party advantage (up to 1.96x) rests on mobs NOT focus-firing. Checked: each mob targets its nearest player independently (AttackBehavior.ts:28), so it holds for a spread party -- but a clumped party or a melee front-liner makes one player nearest to every mob, which is focus fire in practice, and also breaks the pooled-party-HP assumption. Formation is an unmodelled variable worth up to 1.96x.",
    "Top ranks derive a 2–9s encounter TTK against a 3000–4500s target — are SS/SSS n players vs ONE boss rather than a pack of n?",
    "Mana, skills and physical-vs-magic parity are modelled separately (mana_level.py, parity.py) and are not folded into R yet.",
    "R = (CS_p/CS_m)^2 cancels the DPS/EHP split, so jobs cannot change any verdict here. Differentiation must come from elements / AoE / range / crit.",
  ],
};

// ------------------------------------------------------------------ emit ----

function main() {
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    shipped: scrapeShipped(),
    proposed,
  };

  const dir = join(ROOT, "tools/combat-lab");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, "combat-model.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");

  const d = out.shipped.derivedStats;
  console.log(`wrote ${dest}`);
  console.log(
    `  shipped: pAtk = ${d.pAtk.base} + ${d.pAtk.perStr}*str + weapon, ` +
      `maxHealth = ${d.maxHealth.base} + ${d.maxHealth.perVit}*vit + ${d.maxHealth.perLevel}*(L-1), ` +
      `mspd = ${d.maxMoveSpeed.base} + ${d.maxMoveSpeed.perAgi}*agi ` +
      `(→ ${(d.maxMoveSpeed.base + d.maxMoveSpeed.perAgi * out.shipped.statRange.max).toFixed(1)} at cap)`,
  );
  console.log(
    `  proposed: growth ${proposed.inputs.growth.value}, C ${proposed.inputs.statCoef.value}, ` +
      `${proposed.ladder.length} ranks, ${proposed.requirements.length} requirements`,
  );
}

main();
