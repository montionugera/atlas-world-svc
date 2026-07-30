---
title: "Combat stat model — the foundation"
id: I-028
date: 2026-07-30
status: design agreed, nothing implemented
supersedes: docs/superpowers/specs/2026-07-28-combat-stat-model-design.md
---

# Combat stat model — the foundation

This is the authoritative design for how damage, difficulty, progression and
sustain relate in Atlas. It is **design, not description**: none of it is
implemented, and where it disagrees with shipped code the disagreement is called
out rather than papered over.

**Nothing here is read from the game.** That is deliberate — the running server
is a single-player debug prototype, and letting it sit beside the design invites
the design to be judged against it, or bent to match it.

<div class="callout info">

**The three artefacts, and which to trust**

| artefact | role |
| -------- | ---- |
| `scripts/gen_combat_model.mjs` | The model. Every authored number, with reasoning. |
| `tools/combat-lab/index.html` | The lab. Computes every figure live from those numbers. |
| `tools/combat-lab/verify.mjs` | <!-- GEN:gatecount2 -->

72 assertion sites

<!-- /GEN:gatecount2 --> gates. Run before believing anything. |

This spec restates them. On any disagreement, **the generator wins** — it is the
only place a number is authored.

</div>

---

## 1. The model in one page

```
dmg = k × refHp(defender level) × (atk / def)
```

Lineage 2's divide shape. Chosen over subtraction because subtraction produces
immunity (a big enough defence takes zero) and a hard zero-damage floor; a
divide degrades smoothly and can never reach zero.

<div class="callout warn">

**`refHp` is a reference curve, not the defender's own HP.** This distinction is
load-bearing. If damage scaled with the target's actual HP, bigger bars would
take proportionally bigger hits and **stacking HP would do nothing at all**. As
a reference curve it only makes `k` readable: `k` is the share of a typical bar
one even hit removes, so `1/k` is hits-to-kill in an even fight.

</div>

### CombatScore and R

```
CS = cbrt(atk × def × hp)          geometric mean, grows at exactly `growth`/level
R  = (CS_player / CS_mob)³         time you survive ÷ time the encounter survives
```

`R > 1` is a win. `HP left = 1 − 1/R`. Every verdict in this design is an R.

### Authored constants

<!-- GEN:constants -->

| constant | value | what it sets |
| --- | --- | --- |
| `growth` | 1.045 | 4.5%/level — everything compounds at this |
| `k` | 0.1 | an even fight is 10 hits |
| `baseHp` / `baseAtk` / `baseDef` | 200 / 40 / 49 | scale only; `baseDef` is set so a mirror match is exactly even |
| `aspd` | 0.5 /s | one swing every 2 seconds |
| `statCoef` | 0.5 | stat points are 33% of total power at full spend |
| `gapWeight` | 0.6 | level difference counts at 5.4%/level |

<!-- /GEN:constants -->

---

## 2. The rank ladder

Each rank is authored by **two numbers a designer can picture** — how hard it is
(`r`), and how many of the mob's swings it takes to kill one player (`swings`).
Everything else is derived. Bosses author a third, the wall clock (`ttk`).

<!-- GEN:ladder -->

| rank | levels | n | shape | R | swings to kill you | fight | sustain |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E | 1–12 | 1 | pack | 11.89 | 15 | 2.5s | — |
| D | 13–25 | 1 | pack | 5.95 | 13.5 | 4.5s | — |
| C | 26–40 | 1 | pack | 4.00 | 12 | 6.0s | — |
| B | 41–55 | 2 | pack | 2.19 | 10 | 12.2s | — |
| A | 56–70 | 4 | pack | 1.80 | 8.5 | 15.1s | — |
| S | **L77** | 8 | boss | 1.60 | 7 | 150s | 53.3% |
| SS | **L90** | 20 | boss | 1.50 | 6 | 900s | 82.2% |
| SSS | **L97** | 50 | boss | 1.40 | 5 | 5400s | 93.4% |

<!-- /GEN:ladder -->

Mob stats are **solved** from those targets, never authored, so the ladder
cannot drift by hand-editing:

<!-- GEN:mobstats -->

| rank | mob atk | mob def | mob HP | its damage per hit |
| --- | --- | --- | --- | --- |
| E | 61 | 60 | 39 | 6.7% of your bar |
| D | 120 | 112 | 119 | 7.4% of your bar |
| C | 251 | 213 | 282 | 8.3% of your bar |
| B | 582 | 443 | 1,033 | 10.0% of your bar |
| A | 1,325 | 876 | 2,429 | 11.8% of your bar |
| S | 2,979 | 2,512 | 230,636 | 14.3% of your bar |
| SS | 6,159 | 5,837 | 4,676,503 | 16.7% of your bar |
| SSS | 10,057 | 10,414 | 72,814,424 | 20.0% of your bar |

<!-- /GEN:mobstats -->

<div class="callout warn">

**Boss HP reaches 72.8 million** — 4,344× a player's bar. It fits comfortably in
`int32`, but it must be a deliberate storage decision rather than a surprise,
and any client-side HP bar or damage-number formatting has to cope with it.

</div>

### Two encounter shapes

```
pack — n players vs n mobs.  R = R_solo × 2n/(n+1)   bounded at 2×
boss — n players vs ONE mob. R = R_solo × n²          unbounded
```

The `n²` is what makes a boss possible at all. Above rank A the mob must grow in
attack **and** defence **and** HP simultaneously, and a pack cannot pay for
that — at 8-vs-8 the ladder ran out of room at exactly R = 1.00. Concentrating
the party's damage into one target while spreading the boss's damage across the
party buys back `n²`.

<div class="callout danger">

**Two AI requirements, not observations.** The party arithmetic is wrong without
them, by up to 1.96×.

- **Packs: mobs must not coordinate focus fire.** If they all attack one player,
  the `n²` terms cancel by symmetry and R collapses to the duel value.
- **Bosses: a boss must rotate targets.** If it focuses one player, that player
  takes `n×` the damage and dies.

Both are testable today. See §7.

</div>

---

## 3. Level

**Absolute level is irrelevant.** Player and mob grow at the same rate, so it
cancels exactly — rank C is R 4.0000 at level 1, 33 and 99 alike. A level-80
fight is digit-identical to a level-20 one; only the absolute numbers scale, by
`1.045^60` = 14.03×.

Only the **difference** matters, at `growth^(2 × gapWeight)` = **5.4%/level**:

```
mob +5 levels    1.30× harder
mob +10 levels   1.70× harder
mob +16 levels   2.33× harder
```

It is symmetric — softening the punishment softens the reward.

### Packs get bands; bosses get a level

A pack is drawn from a level band. **A boss has one authored level.** Giving a
single named boss a fourteen-level range was a category error with a measurable
cost: across a 14-wide band the same rank swung 1.99×, and because S/SS target R
barely above 1.0 that crossed the loss line — a band-bottom party met band-top
content of *its own rank* at R 0.81 with max gear and full headcount.

With one authored level the worst case is R 1.17 and the approach reads
brutal → hard → fair. `from`/`to` survive on a boss row but mean *the player
levels expected to attempt it*.

**Rank A's band bottom is R 0.86, deliberately.** A 4v4 at 14 levels under the
far end of the last zone should not be winnable.

---

## 4. The player

Four axes: two magnitudes (how much) and two directions (which way).

```
budget  = (1 + statCoef × alloc) × gearScale
atk ∝ budget          def, hp ∝ √budget
CS  ∝ budget^(2/3)    R ∝ budget²
```

R is the budget **squared**, which is why narrow-looking inputs produce wide
outcomes.

<!-- GEN:tiers -->

| tier | gear | points spent | HP @L20 | atk | def | CS | strength |
| --- | --- | --- | --- | --- | --- | --- | --- |
| min | E (0.70) | 40% | 423 | 78 | 104 | 150 | 68% |
| median | C (0.85) | 70% | 494 | 106 | 121 | 185 | 84% |
| max | A (1.00) | 100% | 565 | 138 | 139 | 221 | 100% |

<!-- /GEN:tiers -->

68/84/100 in strength becomes **3.2× in outcome**. Gear alone is worth 2.04×;
stat allocation 1.56×. **Gear is the strongest player axis.**

### Progression curve (max tier)

<!-- GEN:curve -->

| level | CS | atk | def | HP |
| --- | --- | --- | --- | --- |
| 1 | 96 | 60 | 60 | 245 |
| 20 | 221 | 138 | 139 | 565 |
| 60 | 1,287 | 805 | 806 | 3,288 |
| 99 | 7,165 | 4,483 | 4,484 | 18,301 |

<!-- /GEN:curve -->

Move speed is flat at 30 (clamp 36) and does not vary with build.

---

## 5. Sustain

A boss's wall clock **cannot be bought with HP**. `hp` sits inside the `def × hp`
product and `R = n²/(a·d·h)`, so every factor added to HP is taken straight back
out of difficulty. For a boss:

```
ttk = swings × n / (R × aspd)
```

Once `swings`, `n` and `R` are written down, fight length has **no freedom
left**. Three multipliers buy two free targets per rank, not three.

So a third target needs a fourth variable, and healing is the only one that buys
survival time without changing how hard the boss hits. **Sustain is solved, never
authored** — it is a bill, not a knob:

```
sustain = 1 − n² / (R × a × d × h)
```

### Where the healing comes from

Four rules, and the **shape** of each matters more than its size:

| source | shape | behaviour |
| ------ | ----- | --------- |
| Rest-mode regen | out of combat only | contributes **nothing** during a fight |
| Healer mana pool | **fixed** | loses ground to any clock |
| In-combat mana regen (skill) | **rate** | scales with the clock, as demand does |
| Potions | **rate**, twice bounded | flat HoT, no-stack; carry or uptime binds |

<div class="callout warn">

**Rest-only regen made sustain unfundable by construction.** With a fixed pool,
supply cannot grow with the clock while demand does — and demand grows
*super-linearly* (2.07× per doubling), because the party's own health bars are a
one-time absorption. SS came up 30 bars short of 61.7; SSS 424 short of 504.3.

Adding **any rate-shaped source** removes the ceiling. It was the shape that
fixed it, not the extra numbers.

</div>

### The economy as it stands

<!-- GEN:economy -->

| rank | party | demand | pool | regen | potions | supply | healer share | funded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S | 6 dps + 2 heal | 5.7 | 16 | 2 | 16.1 | 35 | 53% | 6.04× |
| SS | 16 dps + 4 heal | 61.7 | 32 | 29 | 22.7 | 84 | 73% | 1.35× |
| SSS | 40 dps + 10 heal | 504.3 | 80 | 432 | 41.8 | 554 | 92% | 1.10× |

<!-- /GEN:economy -->

All figures in **health bars** — one bar is one player's full HP.

<div class="callout danger">

**Adding healers cannot fund a fight.** A boss's `R = single × n × attackers`, so
a player who heals is a player not attacking. At 30% healers SSS drops from
R 1.40 to **0.98 — a loss**. The healer share buys healing and sells difficulty
at roughly the same rate.

</div>

### Potions

Flat heal-over-time, **cannot stack**: 10 / 30 / 60 / 140 HP/s for 5s.

*Flat* means potions decay against a bar growing at `growth^level` — 700 HP is
124% of a level-20 bar and 4.2% of a level-97 one. **That decay is deliberate**
(D4): it keeps consumables from replacing the healer.

*No-stack* makes **uptime** the ceiling rather than a cooldown — 20 carried × 5s
is 100 seconds of coverage, 67% of an S fight and 1.9% of an SSS one. Potions
cannot be banked into a burst, so they chip at the average and cannot rescue a
spike.

Tiers gate by level, on the rule that a tier unlocks once it heals **at most 30%
of a bar**:

<!-- GEN:potiontiers -->

| tier | total | unlocks | % of bar there | % at L97 |
| --- | --- | --- | --- | --- |
| 10 HP/s | 50 HP | L1 | 20.4% | 0.3% |
| 30 HP/s | 150 HP | L18 | 29.0% | 0.9% |
| 60 HP/s | 300 HP | L33 | 29.9% | 1.8% |
| 140 HP/s | 700 HP | L53 | 29.0% | 4.2% |

<!-- /GEN:potiontiers -->

---

## 6. Settled decisions

Recorded in `combat-model.json` under `decisions[]` with full reasoning and
rejected alternatives.

<!-- GEN:decisions -->

| # | decision | consequence |
| --- | --- | --- |
| **D1** | Build direction sets pacing, not power | restRate is a BALANCE PARAMETER, not flavour -- it is the knob that sets the glass-cannon farming edge (none: 2.00x, 4%/s: 1.26x, 2%/s: 1.16x, 1%/s: 1.09x). |
| **D2** | HP and DEF stay coupled | There is exactly one defensive stat from the player's point of view. |
| **D3** | Rank S gets a 150-second wall clock | THERE IS NO LONGER A HEALER-FREE TIER. |
| **D4** | Potion tiers stay flat and are allowed to decay with level | Potions are a LEVELLING tool and healers are the endgame answer. |
| **D5** | Gear tiers are adopted at a 0.70 -> 1.00 span | CONTENT IS GATED BEHIND GEAR, by design. |

<!-- /GEN:decisions -->

### D1 in full, because it is the least obvious

Full-DPS and full-tank have **identical R and HP left**. A tank kills 2× slower
and survives 2× longer; they cancel.

The objection — everyone rolls DPS, since equal safety at double speed is
strictly better — holds **only without downtime**. Both builds lose the same
*fraction* of their bar per fight, so both rest the same, and rest dwarfs the
fight:

<!-- GEN:restladder -->

```
no rest      DPS farms 2.00× faster
4%/s         DPS farms 1.26× faster
2%/s         DPS farms 1.16× faster   ← current
1%/s         DPS farms 1.09× faster
```

<!-- /GEN:restladder -->

A 16% edge, paid for in higher variance and no group role, is a defensible
balance. **A tank's group value must come from taunt/aggro** — which is unbuilt,
and which the pack factor and boss rotation already silently depend on.

---

## 7. Requirements this places on other systems

| system | requirement | status |
| ------ | ----------- | ------ |
| **AI** | Packs must not coordinate focus fire | unbuilt, **testable now** |
| **AI** | Bosses must rotate targets | unbuilt, **testable now** |
| **Aggro/taunt** | A tank must be able to take hits meant for others | unbuilt, no design |
| **Mana** | Healers pay for healing in mana | does not exist |
| **Healing** | A healer class | does not exist |
| **Rest mode** | Out-of-combat HP/mana regen after a delay | does not exist |
| **Potions** | Flat non-stacking HoT, 4 level-gated tiers | does not exist |
| **Skills** | One granting in-combat mana regen | does not exist |
| **`weapons.ts`** | A tier/rarity field | **does not exist**, D5 requires it |
| **`derivedStats.ts`** | Reconcile with this curve | **structurally disagrees** |

---

## 8. What is NOT settled

1. **No simulation has ever run.** Every number is closed-form — no crits,
   misses, kiting, movement or line of sight. This is the largest gap.
2. **The shipped stat formula disagrees structurally.** `derivedStats.ts` is
   additive with a flat base and has **no geometric growth**; this model is
   multiplicative. It splits pAtk/mAtk where this carries one `atk`, and has
   four primaries where this has three stats. **Blocks all implementation.**
3. **`manaBars` (8) and `combatManaRegen` (0.1%/s) are unanchored** and supply
   92% of SSS's healing, which funds at only **1.10×**.
4. **`gapWeight` 0.6 is chosen, not derived.**
5. **Rank S is on a knife edge** — 67% potion uptime, healers at 53% of healing,
   barely over the role-check gate.
6. **Mana, skills and physical-vs-magic parity are not folded into R.**
7. **Unplaced entirely:** DEX, LUK, stat points per level, respec, per-race
   leans, jobs, resurrection, and rest time in any clear-time figure.

---

## 9. Verification

```bash
node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs
```

<!-- GEN:gatecount -->

72 assertion sites

<!-- /GEN:gatecount --> gates, cheapest first: the inline script parses, all 15 sections render,
every column header is defined in the glossary, then requirements, the ladder,
the player curve, axis independence, sustain, the economy, the level gap and the
invariants.

**Three gates were proven to bite** by deliberately breaking them — the swings
target, the boss-level rule and the healer-majority rule. A gate that has never
failed is not known to work: an earlier swings gate compared the model against
the field it derived from, and passed happily with rank E set to 99.

`CHECKLIST.md` holds the by-hand pass and the reasoning behind every finding.

---

## 10. How to change this

- **Fight length** → change `swings` (E–A) or `ttk` (S/SS/SSS). **Not `k`** —
  every rank absorbs `k` entirely and nothing moves.
- **Difficulty** → change `r`. Mob multipliers re-solve automatically.
- **Anything authored** gets a pinned expectation in `verify.mjs`, independent of
  the JSON. Checking the model against the file it derives from is a tautology.
