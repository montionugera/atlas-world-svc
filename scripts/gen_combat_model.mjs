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

// --------------------------------------------------------------- elements ----
// The 6-element RO-style table shipped by F-017, carried here as AUTHORED data.
//
// This is the one place the model deliberately mirrors something the game
// already has, and it is a mirror rather than an import on purpose: this file
// still reads nothing from `colyseus-server/`. The source of truth for the
// running game is `colyseus-server/src/config/combat/elements.ts`; if that file
// changes, this must be changed to match. The rules are DERIVED from the two
// canon statements rather than transcribed cell by cell, so a typo cannot hide
// in 49 hand-written numbers:
//
//   natural cycle, ONE-DIRECTIONAL:  water > fire > earth > wind > water
//   opposed pair, MUTUAL:            holy <-> void
//   every element against itself:    0.5
//   `neutral`:                       inert, 1.0 as attacker and as defender
//
// The consequence worth knowing, because it is the opposite of the intuition:
// `holy`<->`void` is MUTUAL 2.0, so it cancels in Q and moves difficulty NOT AT
// ALL -- it is a pure pacing lever (both clocks halve). Same-element is mutual
// 0.5 and likewise Q-neutral (both clocks double). The ONLY thing that moves
// difficulty is the one-directional cycle, which is 8 of the 49 ordered pairs.
const ELEMENTS = ["neutral", "earth", "water", "wind", "fire", "holy", "void"];
const STRONG = 2.0;
const WEAK = 0.5;
const EVEN = 1.0;
const CYCLE = { water: "fire", fire: "earth", earth: "wind", wind: "water" };
const OPPOSED = { holy: "void", void: "holy" };

const elementTable = Object.fromEntries(
  ELEMENTS.map((att) => [
    att,
    Object.fromEntries(
      ELEMENTS.map((def) => {
        if (att === "neutral" || def === "neutral") return [def, EVEN];
        if (att === def) return [def, WEAK];
        if (CYCLE[att] === def || OPPOSED[att] === def) return [def, STRONG];
        if (CYCLE[def] === att) return [def, WEAK];
        return [def, EVEN];
      }),
    ),
  ]),
);

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
  //
  // A boss has a LEVEL, not a band. Packs get from/to because a zone is a
  // progression you walk through; giving a single named boss a fourteen-level
  // range is a category error, and it had a measurable cost. The gap term is
  // growth^(2*gapWeight) = 5.4%/level, so across a 14-wide band the same rank
  // swings by 1.99x -- and because S/SS target R barely above 1.0, that swing
  // crossed the loss line: a band-bottom party met band-top content at R 0.81
  // with max gear. Same rank, same headcount, same gear, two different games.
  //
  // With one authored level the worst case is R 1.17 "brutal" instead of a
  // loss, and the approach reads brutal -> hard -> fair as the party levels
  // into it. `from`/`to` stay, but for a boss they mean the player levels
  // expected to attempt it, NOT a range the mob is drawn from.
  //
  // Packs keep their bands. Only rank A's bottom edge is a loss (0.86) and
  // that is the far end of the last zone doing its job -- 4v4 at 14 levels
  // under should not be winnable.
  // S authors a wall clock too (D3). Its NATURAL length -- what r and swings
  // force with no healing at all -- is 70s, and a boss fought by 8 players
  // ending in 70 seconds is a large mob rather than an encounter. 150s is the
  // deliberate middle: a substantial fight that still needs materially less
  // healing than SS (53.3% against 82.2%).
  //
  // The trade this makes is that there is no longer a healer-free tier. Any
  // clock past 70s requires healing, because reaching 300s WITHOUT it would
  // need 30 swings-to-kill-a-player -- hits of 3.3% of a bar, well outside the
  // authored 7-15 range. So the boundary moved rather than disappeared: the
  // healer is now mandatory from S, not from SS.
  {
    rank: "S",
    r: 1.6,
    swings: 7,
    n: 8,
    shape: "boss",
    level: 77,
    ttk: 150,
    from: 71,
    to: 84,
    was: 2.2,
  },
  // SS and SSS carry a THIRD target: `ttk`, the fight's wall clock.
  //
  // For a boss, ttk = swings * n / (r * aspd) -- three authored numbers and a
  // global, so it has no freedom left. SS derived 160s against a 600-1200s
  // target and SSS 357s against 3600-7200s. Raising boss HP alone cannot fix
  // that: hp sits in the def*hp product, and R = n^2/(a*d*h), so every factor
  // added to hp is taken straight back out of R.
  //
  // The only way to hold r AND swings AND ttk is a fourth variable, and the
  // honest one is SUSTAIN -- the fraction of incoming damage the party heals.
  // It is DERIVED here, not authored, precisely so it reads as a bill:
  //
  //   sustain = 1 - n^2 / (r * a * d * h)
  //
  // SS bills 82.2% and SSS 93.4%. Those are requirements on the healing system,
  // not tuning knobs. If healing cannot deliver them the ttk targets are not
  // reachable and the fights have to get shorter. See openQuestions.
  {
    rank: "SS",
    r: 1.5,
    swings: 6,
    n: 20,
    shape: "boss",
    level: 90,
    ttk: 900, // midpoint of the 600-1200s target
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
    level: 97,
    ttk: 5400, // midpoint of the 3600-7200s target
    from: 96,
    to: 99,
    was: 3.5,
  },
];

// ------------------------------------------------------------ shape tags ----
// The four per-entity tags the physical/magical split adds (F-018). They are
// DIMENSIONLESS, LEVEL-FREE and AUTHORED -- and the last of those is the rule
// that matters most:
//
//   rho      [0,1]     physical share of this entity's damage OVER A FIGHT
//   theta    SIGNED    offence purity;  > 0 favours physical, < 0 favours magic
//   slant    SIGNED    defence lopsidedness;  > 0 favours pDef
//   element  7 values  attack/defence element, `neutral` is inert both ways
//
// `theta` and `slant` MUST BE SIGNED. An unsigned form was tried and has a
// proven sign pathology: at rho = 0, theta = -1 -- a pure caster -- it produced
// pAtk 180 / mAtk 100 instead of 0 / 100. Clamps are enforced in the lab's
// shape(): |theta| <= 1, |slant| <= 0.5, tightened further by whatever keeps
// xp, xm >= 0 and qp, qm > 0.
//
// HARD RULE: NEVER SOLVE `theta` OR `slant` FROM PER-CHANNEL DIFFICULTY TARGETS.
// One free parameter against two targets is overdetermined -- it has no exact
// solution and forces least-squares or root-finding, which is how a closed-form
// ladder turns into a numerical one. The shape tags are AUTHORED; `mult`, the
// three rank multipliers and `sustain` are SOLVED. Never the reverse. This
// sounds like a feature ("let the solver figure out the mob's resistances") and
// that is exactly why it is written down as a prohibition.
//
// EVERY RANK IS AT THE REDUCTION POINT TODAY -- rho 0.5, theta 0, slant 0,
// neutral. That is deliberate: it is what makes the split provably free, and it
// is the state the exactness gate pins. Authoring a shape here is a real
// balance change, and for `element` it is governed by G-ELEM: no encounter may
// put the player on the cycle-DISADVANTAGED side of a boss of its own rank,
// because at Q = 0.25 ranks C, B, S, SS and SSS all fall below R = 1.
const RANK_SHAPE = {
  E: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  D: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  C: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  B: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  A: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  S: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  SS: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
  SSS: { rho: 0.5, theta: 0, slant: 0, element: "neutral" },
};

const ladder = LADDER_TARGETS.map((t) => ({
  rank: t.rank,
  r: t.r,
  swings: t.swings,
  shape: t.shape,
  mult: Math.cbrt((2 * t.n) / ((t.n + 1) * t.r)),
  n: t.n,
  // Authored shape, not solved. See RANK_SHAPE above.
  ...RANK_SHAPE[t.rank],
  // Bosses only. Undefined for a pack, whose level comes from its band.
  level: t.level,
  // Bosses only, and optional even there. Present => the fight's wall clock is
  // authored and `sustain` is solved to pay for it.
  ttk: t.ttk,
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
    // The two globals the physical/magical split adds (F-018).
    //
    // NOT outcome-neutral the way `durabilityHp` above is -- do not read them
    // that way. They leave every R bit-identical only WHILE ALL AUTHORED TAGS
    // ARE FLAT AND NEUTRAL, which is where the ladder is calibrated and is what
    // the reduction gate pins. Author one shape or one element and both become
    // real balance levers: measured at a single authored shape, postureMix moves
    // R by 1.57x across its range and elemWeight by 4x. `durabilityHp` by
    // contrast leaves R unmoved at EVERY setting, authored or not.
    //
    // So: gauges, not free parameters. Changing either re-quotes the whole
    // ladder and requires re-running the band-worst sweep, not just verify.
    //
    // postureMix (rhoBar) is the reference offence mix that `defEff` and
    // CombatScore are quoted against. It is GLOBAL, not per-entity, and that is
    // the whole reason CS stays comparable across entities -- every defence is
    // harmonically aggregated at the SAME reference mix, so two entities' CS
    // are measured on one ruler. Per-entity it would silently become a free
    // parameter each side could pick to flatter itself.
    //
    // Kept strictly inside (0,1): at either endpoint one channel drops out of
    // the harmonic aggregate entirely and the slant clamps divide by zero.
    postureMix: {
      value: 0.5,
      min: 0.05,
      max: 0.95,
      step: 0.05,
      label: "Reference offence mix (physical share)",
    },
    // elemWeight (eta) damps the element table: e -> e^eta. 1 is the shipped
    // table; 0 disables elements entirely and reduces to the pre-split model.
    // It is the emergency lever if the cycle turns out too sharp -- eta = 0.5
    // reads 2.0 as 1.41 and caps the cycle span at 4x instead of 16x -- and it
    // is deliberately NOT the fix for the difficulty inversion the cycle can
    // cause. That is a content gate (G-ELEM), because 84% of the table is
    // already Q = 1 and the hazard is 8 ordered pairs.
    elemWeight: {
      value: 1,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Element weight (damper, e^η)",
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

    // --- Sustain economy -----------------------------------------------
    // Where the healing in `sustain` actually comes from. Two design rules
    // drive all of it:
    //
    //   1. HP and mana regenerate ONLY in rest mode -- no attacking and not
    //      being attacked for `restDelay` seconds first.
    //   2. In-combat healing comes from a healer class and is paid for in mana.
    //
    // Rule 1 is the sharp one. If mana cannot regenerate during a fight, the
    // TOTAL healing a fight can receive is capped by the mana the healers
    // walked in with -- a hard ceiling, not a rate limit. A 90-minute fight is
    // funded entirely from bars filled before the pull.
    healerShare: {
      value: 0.2,
      min: 0,
      max: 0.6,
      step: 0.05,
      label: "Share of the party that heals",
    },
    // One healer's FULL mana pool, expressed in the only unit that matters
    // here: how many player health bars it can put back. Authored -- there is
    // no mana or healing system to read it from.
    manaBars: {
      value: 8,
      min: 1,
      max: 80,
      step: 1,
      label: "Health bars per healer's mana pool",
    },
    restRate: {
      value: 2,
      min: 0.25,
      max: 10,
      step: 0.25,
      label: "Rest regen (% of a bar / s)",
    },
    restDelay: {
      value: 5,
      min: 0,
      max: 30,
      step: 1,
      label: "Seconds out of combat before rest starts",
    },

    // Potions are the third rule, and they change the SHAPE of the economy
    // rather than its size. Rest-only regen made healing a fixed pool that
    // could not grow with the clock; a consumable restores per use, so supply
    // becomes a rate again -- bounded by how many a player can carry and how
    // often one can be drunk, not by the mana anyone started with.
    // A potion is a FLAT heal-over-time that cannot stack: it restores
    // `potionHps` HP per second for `potionSeconds`, and no second potion can
    // run while one is active. Tiers are 10 / 30 / 60 / 140 HP/s over 5s, so a
    // top-tier potion is 700 HP total.
    //
    // Two consequences follow from the shape, and both matter more than the
    // numbers. FLAT means a potion is a fixed amount against a bar growing at
    // growth^level -- 700 HP is 124% of a level-20 bar and 4.2% of a level-97
    // one, so potions fade exactly where the wall clocks are. NO-STACK means
    // the binding limit is UPTIME, not cooldown: carry x duration seconds of
    // coverage out of a ttk-second fight, which is 1.9% at SSS.
    potionHps: {
      value: 140,
      min: 0,
      max: 300,
      step: 10,
      label: "Potion regen (HP/s) — tiers 10/30/60/140",
    },
    potionSeconds: {
      value: 5,
      min: 1,
      max: 30,
      step: 1,
      label: "Potion duration (s, cannot stack)",
    },
    potionCarry: {
      value: 20,
      min: 0,
      max: 200,
      step: 1,
      label: "Potions a player can carry",
    },
    // A skill may grant regeneration DURING combat, which is the rule that
    // actually removes the ceiling. Rest-only regen capped a fight's healing at
    // the mana carried in; a per-second trickle makes supply scale with the
    // clock, exactly as demand does. Expressed as % of a healer's mana pool
    // returned per second, so 0.1 %/s over a 5400s fight is 5.4 extra pools.
    combatManaRegen: {
      value: 0.1,
      min: 0,
      max: 2,
      step: 0.01,
      label: "In-combat mana regen (% of pool / s)",
    },
  },

  levelMax: 99,
  statCapAtL1: 10,
  statCapAtLMax: 99,

  // The shipped F-017 element table, mirrored (see the ELEMENTS block at the
  // top for why it is a mirror and not an import, and what has to change with
  // it). `elementSource` is recorded so the drift is traceable from the JSON
  // alone rather than only from this generator.
  elements: ELEMENTS,
  elementTable,
  elementSource: "colyseus-server/src/config/combat/elements.ts",

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

  // The three named player specs. They carry the same four SHAPE TAGS a mob
  // rank does (see RANK_SHAPE), spelled out rather than left to default,
  // because these three ARE the reference player the whole ladder is solved
  // against -- and §8's argument that the mob solver survives at zero cost
  // rests on that reference being flat. Written down, it is auditable; left
  // implicit, it is an assumption.
  //
  // Any spec that does NOT name them (the ad-hoc {build, gear, focus,
  // gearClass} objects the matrix and archetype tables build) falls back to
  // exactly these values, so every number that predates the split is
  // reproduced bit for bit.
  grades: [
    {
      grade: "max",
      build: "high",
      gear: "A",
      rho: 0.5,
      theta: 0,
      slant: 0,
      element: "neutral",
    },
    {
      grade: "median",
      build: "mid",
      gear: "C",
      rho: 0.5,
      theta: 0,
      slant: 0,
      element: "neutral",
    },
    {
      grade: "min",
      build: "low",
      gear: "E",
      rho: 0.5,
      theta: 0,
      slant: 0,
      element: "neutral",
    },
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

  // SETTLED. These were open questions; they are now decisions, kept with the
  // reasoning so nobody re-litigates them from the numbers alone.
  decisions: [
    {
      id: "D1",
      title: "Build direction sets pacing, not power",
      decided: "2026-07-30",
      choice:
        "Full-DPS and full-tank keep identical R and HP-left. A tank kills 2x slower and survives 2x longer; the two cancel. No allocation is ever wrong, so no stat is a trap and nobody needs a build guide.",
      why: "The obvious objection is that everyone will then roll DPS, since equal safety at double the speed is strictly better. That is true ONLY without downtime. Both builds lose the same FRACTION of their bar per fight (28% at rank C), so both get the same number of fights before resting -- and rest time is identical because it is a percentage of the bar. Rest therefore dwarfs the fight: at restRate 2%/s the DPS farming advantage collapses from 2.00x to 1.16x. A 16% edge, paid for with higher variance and no group role, is a defensible balance rather than a flaw.",
      consequence:
        "restRate is a BALANCE PARAMETER, not flavour -- it is the knob that sets the glass-cannon farming edge (none: 2.00x, 4%/s: 1.26x, 2%/s: 1.16x, 1%/s: 1.09x). It must not be tuned for pacing alone. Separately, a tank's group value has to come from TAUNT/AGGRO, which is unbuilt and which the pack factor 2n/(n+1) and boss target rotation already silently depend on. And the tank's variance advantage is invisible to a closed-form model -- only the simulation test can show it.",
      rejected:
        "Superlinear defence (defensive budget raised to p>1). At p=1.2 a tank ends a rank C fight at 76% HP instead of 72%, but the optimal build shifts to 36% offence, so leaning defensive becomes correct for EVERY player and full-DPS becomes 19% weaker in outcome -- the most intuitive build made the worst one, for 4 percentage points of health.",
    },
    {
      id: "D2",
      title: "HP and DEF stay coupled",
      decided: "2026-07-30",
      choice:
        "One defensive budget, split sqrt into hp and def, with no way for a player to trade between them. Matches the shipped code, where `vit` already gives BOTH: maxHealth = 100 + 10*vit and pDef = 5 + vit.",
      why: "They are exactly interchangeable by construction -- hp x def IS the budget, so survival is identical at every split (37.15M at level 90 whichever way it leans). Exposing a choice whose outcome is identical is a choice in name only, and the shipped stat model already couples them, so keeping them coupled costs nothing in either the model or the game.",
      consequence:
        "There is exactly one defensive stat from the player's point of view. If this is ever reversed, note that the tie is NOT quite even: a flat potion refills a bigger share of a smaller bar, so a DEF-heavy build gets 28% more value per potion (6.4% vs 5.0% of bar at level 90) for identical survival. Splitting them also means splitting `vit` in derivedStats.ts -- a shipped-code change, not a model one.",
      rejected:
        "Making them genuinely different (e.g. DEF resists only physical while HP covers everything) would create real build decisions, but needs the physical/magic damage split that this model does not carry -- it has one atk and one def.",
    },
    {
      id: "D3",
      title: "Rank S gets a 150-second wall clock",
      decided: "2026-07-30",
      choice:
        "S authors ttk 150s, billing 53.3% sustain. Its NATURAL length -- what r 1.6 and swings 7 force with no healing -- is 70s.",
      why: "A boss fought by 8 players ending in 70 seconds is a large mob rather than an encounter. 150s is the deliberate middle: substantially longer, while still needing materially less healing than SS (53.3% against 82.2%).",
      consequence:
        "THERE IS NO LONGER A HEALER-FREE TIER. Any clock past 70s requires healing, because reaching even 300s without it would need 30 swings-to-kill-a-player -- hits of 3.3% of a bar, well outside the authored 7-15 range. So the boundary moved rather than disappeared: the healer is mandatory from S, not from SS. Watch S closely: at 150s, 20 carried potions cover 100 of the 150 seconds (66.7% uptime) and healers hold only 53% of the healing -- barely over the role-check gate. Any rise in potion carry or strength flips S into an inventory check.",
      rejected:
        "Leaving S at 70s would have preserved a healer-free tier and cost nothing, but leaves an 8-player boss dying in about a minute. Going to 300s would have billed 76.7% -- nearly SS's -- making the S and SS healing requirements almost indistinguishable.",
    },
    {
      id: "D4",
      title: "Potion tiers stay flat and are allowed to decay with level",
      decided: "2026-07-30",
      choice:
        "Keep the four flat tiers (10/30/60/140 HP/s for 5s) and accept that they fade the whole way up: the top tier at level 97 is worth 4.2% of a bar, less than the bottom tier is worth at level 20 (8.8%). Gate each tier by level so it cannot be bought where it would trivialise a fight.",
      why: "The decay is doing useful work, not causing a problem. It is what keeps consumables from replacing the healer: potions carry 47% of the healing at S but only 8% at SSS, so the ranks with the biggest bills are role checks. Making potions keep pace with the HP curve would reproduce the failure seen earlier, where a percentage-based potion dropped healers to 23% of supply at SS.",
      consequence:
        "Potions are a LEVELLING tool and healers are the endgame answer. Level-gating derived on the rule that a tier unlocks only once it heals at most 30% of a max-tier bar: 10 HP/s from L1 (20.4%), 30 from L18 (29.0%), 60 from L33 (29.9%), 140 from L53 (29.0%). Without gating, 140 HP/s overheals a level-20 player by 24% -- 700 HP against a 565 bar. A fifth tier at 300 HP/s would unlock at L70 and be worth 9.0% at L97; it is deliberately NOT added, because restoring endgame potency is the thing this decision rejects.",
      rejected:
        "Percentage-of-max-HP potions would stay equally useful forever and need no tiers, but consumables would then scale with the player and crowd out the healer at exactly the ranks the role gate protects.",
    },
    {
      id: "D5",
      title: "Gear tiers are adopted at a 0.70 -> 1.00 span",
      decided: "2026-07-30",
      choice:
        "Three tiers E/C/A scaling 0.70 / 0.85 / 1.00. Gear becomes a real field in the game: `weapons.ts` today holds archetypes (sword/staff/bow/dagger/scythe) and has no tier or rarity field at all, so this needs adding.",
      why: "R is proportional to budget squared, so a 1.43x gear span is worth 2.04x in outcome -- making gear the single strongest player axis, ahead of stat allocation's 1.56x. That is deliberate: gear progression should be a real gate with teeth, not a rounding error.",
      consequence:
        "CONTENT IS GATED BEHIND GEAR, by design. An E-geared player LOSES rank A outright (R 0.88) and scrapes rank B at 1.07, so the gear ladder decides what you can attempt and not merely how fast. Narrowing to 0.80 -> 1.00 would drop gear to 1.56x -- equal to stat allocation -- and leave every rank clearable in any gear, just slower; that was considered and rejected as too weak a chase. The scale remains the weakest-grounded input in the model: three authored numbers with no playtest behind them, now load-bearing for what content is reachable.",
      rejected:
        "Keeping archetypes only, with no power ladder, would be the most honest reading of the current code but removes gear progression entirely and puts the whole power curve on levels and stat points.",
    },
  ],

  openQuestions: [
    "Gap weight 0.6 is a chosen value, not a derived one. It makes a mob 10 levels above you 1.70x harder instead of 2.41x. It is symmetric: out-levelling content near your own level is correspondingly less rewarding.",
    "SUSTAIN IS DESIGNED BUT NOT BUILT. The model now carries the full economy -- rest-mode regen, a healer class paying in mana, flat non-stacking potions, and a skill granting in-combat mana regen -- and it closes: SS funds at 1.35x and SSS at 1.10x. NONE of it exists in the game. There is no mana, no healing, no regeneration, no rest mode, no potion and no resurrection in the server today, so every SS/SSS figure is quoted against systems that are specified here and nowhere else. The wall clocks (900s, 5400s) are only reachable if all four are built roughly as modelled.",
    "NO-STACK MAKES UPTIME THE CEILING ON CONSUMABLES, which is a good property worth keeping deliberately. One potion runs at a time, so 20 carried x 5s is 100 seconds of coverage -- 11% of an SS fight and 1.9% of an SSS one. Potions cannot be banked into a burst by construction, so they cannot rescue a phase spike, only chip at the average. Carry is the binding limit at every rank, not uptime, so carry capacity is still the lever.",
    "THE HEALER PLACEHOLDERS NOW CARRY ALMOST ALL THE WEIGHT. With the real potion spec, consumables supply only 27% of the healing at SS and 8% at SSS, so fundability rests on `manaBars` (8 bars per pool) and `combatManaRegen` (0.1 %/s) -- neither anchored to anything. Remove potions entirely and SS goes short by 1 bar of 62 while SSS funds at 1.02x, so the regen default very nearly decides fundability by itself. SSS now funds at only 1.10x, which is thin enough that any of these guesses moving down breaks it.",
    "THE SUSTAIN ECONOMY NOW CLOSES, BUT HEALERS ARE NOT WHAT CLOSES IT. With potions and a skill granting in-combat mana regen, SS funds at 4.23x and SSS at 2.01x. The fix was a change of SHAPE, not size: pool is fixed and loses ground to any clock, while regen and potions are rates that scale with it as demand does. Two consequences to decide on. First, at SS the healer class supplies only 23% of the healing (potions 200 bars of 261) -- the fight is closer to an inventory check than a role check, and that failure mode never shows up as a number going red. Second, potions are bound by CARRY not cooldown at these settings, so carry capacity -- an inventory decision made elsewhere -- is silently the most load-bearing number in the sustain economy.",
    "THE OLD PROBLEM, KEPT FOR THE REASONING: rest-only regen made a fight's healing a fixed POOL, so supply could not grow with the clock while demand did (super-linearly -- own-HP absorption is one-time, so doubling a fight raises demand 2.07x). SS was short 30 bars of 61.7 and SSS short 424 of 504.3. Raising the healer share BACKFIRES and still would: a boss's R is single x n x attackers, so 30% healers drops SSS from R 1.40 to 0.98, a loss. Funding a fight by adding healers cannot work in this model.",
    "Mana, skills and physical-vs-magic parity are modelled separately (mana_level.py, parity.py) and are not folded into R yet. The model now carries a single atk rather than pAtk/mAtk.",
    "THIS MODEL AND THE SHIPPED STAT FORMULA DISAGREE STRUCTURALLY, not just in tuning. contracts/src/meta/derivedStats.ts is a PINNED formula and it is ADDITIVE with a flat base -- maxHealth = 100 + 10*vit + 5*(level-1), pAtk = 10 + 2*str + weapon.pAtk, pDef = 5 + vit -- so it has NO geometric growth at all. This model is multiplicative: refHp * growth^level, 18,300 HP at L99 against the shipped formula's 100 + 10*vit + 490. Three separate gaps: (a) additive vs multiplicative growth, (b) the game splits pAtk/mAtk and pDef/mDef where this model carries one atk and one def, (c) the game has four primaries (str, agi, int, vit) and agi feeds move speed ONLY, so points into agi are invisible to R here. `alloc` in this model is an abstraction over that pool, not a mapping onto it. Reconciling the two is unscoped work and nothing here is a spec for derivedStats until it is done.",
  ],
};

// ------------------------------------------------------------------ emit ----

function main() {
  // No `generatedAt`. A wall-clock stamp guaranteed a diff on every run, which
  // is precisely what stops `git status` from answering "did the MODEL change?".
  // Git already records when the file changed, and more honestly.
  const out = { version: 3, proposed };
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
