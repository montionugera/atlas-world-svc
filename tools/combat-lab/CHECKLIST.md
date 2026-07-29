# Verifying the Combat Balance Lab

Three questions, in increasing order of how much they matter and decreasing
order of how well they are answered:

| #   | question                            | answered by             | status                     |
| --- | ----------------------------------- | ----------------------- | -------------------------- |
| A   | Does the arithmetic match the spec? | `verify.mjs`            | **automated, passing**     |
| B   | Does the model behave sensibly?     | this checklist, by hand | **do it yourself, ~5 min** |
| C   | Does it predict the real game?      | nothing yet             | **NOT ANSWERED**           |

A passing `verify.mjs` proves the page and the balance sheet agree. Two
implementations of the same wrong model would also agree. B and C are where
confidence actually comes from.

## The model in one line

```
dmg = k × refHp(defender level) × (atk / def)
```

`refHp` is a **reference curve, not the defender's own HP.** If damage scaled
with the target's actual HP, bigger bars would take proportionally bigger hits
and stacking HP would do nothing at all. As a reference curve it only makes `k`
readable — `k` is the share of a typical HP bar one even hit removes.

Level enters through `atk/def` and nowhere else, because `atk` and `def` already
grow with their owners' levels. An explicit `growth^lvDiff` would count the gap
twice. `Level gap weight` then damps what remains.

---

## A. Automated — run it

```bash
node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs
```

Expect `OK` and exit 0. It parses the **whole** inline script, renders every
section with stubbed `fetch`/`document`, asserts every column header is defined
in the page's glossary, then checks 4 requirements, 8 ladder rows, 30 curve
cells, axis independence, the party factor, the gap knob and 9 invariants.

The script-parse gate exists because a broken string literal in the render code
once left the page showing nothing but `loading…` while `verify.mjs` reported
OK. Proven to catch it by reintroducing the bug deliberately.

**Rendering is still not tested — load the page.**

---

## B. By hand

Hit **Reset to spec defaults** first. Every number below was computed from the
live model, not asserted.

### 1. `k` sets the scale, and the solve absorbs it

`k = 0.10`, so an even fight is `1/k` = **10 hits**. Check the invariant row
`mirror match is an even fight` reads `atk/def 0.9998` — that is what makes
`1/k` mean anything.

Now double `k` to 0.20 and watch what does **not** move:

```
k = 0.10   E 3.5s  D 8.0s  C 13.5s  B 21.0s  A 45.0s  |  S 8.8s  SS 9.6s  SSS 10.2s
k = 0.20   E 3.5s  D 8.0s  C 13.5s  B 21.0s  A 45.0s  |  S 4.4s  SS 4.8s  SSS  5.1s
```

Ranks with a TTK target hold it **exactly**, because the three multipliers are
re-solved live against the current sliders. Only the ranks with no target
(S and above, falling back to one uniform multiplier) shorten with `k`.

Every R is untouched at both settings. `Attack speed` behaves the same way for
targeted ranks — but see below, it decides how the fight is _delivered_.

So `k` is not a fight-length knob any more — it sets how big damage numbers are,
and the ladder compensates. To make E-through-A fights longer, change their TTK
targets in `gen_combat_model.mjs`, not `k`.

### 2. Three multipliers per rank, solved live

Each rank has `atk`, `def` and `hp` multipliers rather than one. With a single
multiplier, duration and difficulty are welded together as `TTK ∝ R^(−2/3)` —
the ladder's 16.7× difficulty span permits a 6.5× span in fight length, while
the committed TTK table wants **1071×**. Splitting them breaks the weld:

```
R    = 1 / (atk × def × hp)      difficulty
TTK ∝       def × hp             duration
```

Check the mob table: E through A hit their target seconds **exactly** —
3.5 / 8.0 / 13.5 / 21.0 / 45.0 — and their target R at the same time. Move the
`Damage k` or `Attack speed` sliders and they still do; the solve is live.

S, SS and SSS show `— derived` and fall back to one uniform multiplier. Their
targets (195s / 750s / 3750s) are **unreachable**, and not by a little: an SSS
boss stretched to 3750s must attack at 0.8% of a player's, landing ~5,600 hits
that each remove about one eight-thousandth of your health bar. Any long fight
survived on a single health bar consists of imperceptible hits. That is
arithmetic. Those three ranks are blocked on a **sustain model** — healing or
regeneration — not on the ladder.

### 2b. The old check: multipliers are solved, not authored

`mult` is derived from each rank's target R, so the ladder cannot drift. Rank C
shows `mult 0.6300`, and `1 / 0.63³ = 4.00` — the ladder shows **4.00 easy**.

Check rank E too: `0.4381` → `1 / 0.4381³ = 11.89`. If both hold, `R = (CS_p /
CS_m)³` is right.

### 2c. Attack speed decides how a fight is delivered

`aspd = 0.5` — one swing every two seconds. It changes **no** difficulty and
**no** fight length; the rank solve absorbs it entirely. What it changes is the
size of each blow:

```
damage per hit, as a share of your health bar  =  1 / (R × TTK × aspd)
```

Exact at every rank. R fixes the total damage you take across the fight, and
`TTK × aspd` fixes how many swings it is spread over. Division does the rest.

That is why the mob numbers look the way they do. At 1.5 swings/s a 45-second
rank A fight is 68 swings, so each one had to be 1.3% of your health bar —
invisible chip damage. At 0.5 it is 23 swings of 4.0% each.

It also explains **why mob def is high and mob atk is low**: `def × hp` buy
duration, `atk` buys danger. Fix both the TTK table and the R ladder and `atk`
has no freedom left — it is whatever makes the arithmetic close.

### 2d. Two encounter shapes

```
pack — n players vs n mobs.  R = R_solo × 2n/(n+1),  bounded at 2×
boss — n players vs ONE mob. R = R_solo × n²,        unbounded
```

E through A are packs. S, SS and SSS are **bosses** — 8, 20 and 50 players
against one. The `n²` is what makes a boss possible at all: above rank A the mob
has to grow in attack **and** defence **and** HP simultaneously, and a pack
cannot pay for that. At 8-vs-8 the ladder ran out of room at exactly R = 1.00 —
a dead heat — and anything harder meant eight players losing to eight S mobs.

**Load-bearing assumption:** a boss shares its damage evenly across the party. If
it focuses one player, that player takes `n` times the damage and dies. Without
healing, even sharing is the only survivable reading — so _"a boss must rotate
targets"_ is an AI requirement, not an observation. It sits beside _"mobs must
not coordinate focus fire"_ for packs, and both belong in the spec.

Check it: a lone max-grade player against a same-level S boss is **R 0.025** —
annihilated, as the requirement demands.

### 3. CombatScore still compounds at the growth rate

CS is the geometric mean of `atk`, `def` and `hp`, so it grows at exactly
`1.045` per level. `CS L99 ÷ CS L1 = 74.71`, and `1.045^98 = 74.71`.

### 4. Eight player groups, **two** outcomes

Read `relative strength` in the eight-group table: only **100%** and **79%**.
Gear tier is the only thing that moves it.

- **Build focus does nothing to the outcome.** A budget applies once and is
  split among the stats it buys, so `(1+2Ca·φ)(1+2Ca·(1−φ))` is symmetric about
  `φ = 0.5`. Full DPS and full tank have identical CS, identical R and identical
  HP left. Only time to kill moves — **exactly 2× apart** (0.9s vs 1.8s).
- **Gear class does nothing either.** Same reason. `dps gear` and `tank gear` are
  the same strength at every rank.

This is the model being perfectly fair: no stat is a trap and no stat runs away.
It is also the model saying **direction is pacing and magnitude is power.** If a
tank is supposed to be mechanically tougher than a striker, it cannot come from
here — it has to come from taunt and aggro, i.e. from taking hits meant for
someone else.

### 4b. Three player tiers — and the ladder is calibrated for the top one

Ladders ① and ② quote **one** player: A-tier gear with every stat point spent.
That is the strongest player in the model, so both tables are the optimistic
reading of every rank. Ladder ③ runs all three (level 20):

```
tier    gear  points  HP    atk  def  CS   rel
min     E     40%     423    78  104  150   68%
median  C     70%     494   106  121  185   84%
max     A     100%    565   138  139  221  100%
```

68 / 84 / 100 in strength — narrow. The outcomes are not, because R is CS
cubed:

```
rank  encounter   E gear         C gear         A gear
E     1v1          3.73  8.4sw    6.96 11.5sw   11.89 15.0sw
C     1v1          1.25  6.7sw    2.34  9.2sw    4.00 12.0sw
B     2v2          0.69  5.6sw    1.28  7.7sw    2.19 10.0sw
A     4v4          0.56  4.8sw    1.05  6.5sw    1.80  8.5sw
S     8v1 boss     0.50  3.9sw    0.94  5.4sw    1.60  7.0sw
SSS   50v1 boss    0.44  2.8sw    0.82  3.8sw    1.40  5.0sw
```

Three things fall out, and all three are decisions rather than observations:

1. **Everything from B up is gear-gated.** An E-tier player loses rank B and
   every rank above it; a C-tier player is at a dead heat at rank A (1.05) and
   loses S and above. Nothing in the model represents playing well, so a losing
   column cannot be brute-forced — it can only be out-geared.
2. **The swings target holds for the top tier only.** The ladder is authored to
   7–15 swings-to-kill-a-player; at C-tier that is 3.8–11.5, at E-tier 2.8–8.4.
   A rank S boss two-shots-ish an E-tier player at 3.9 swings.
3. **Which tier should the ladder be calibrated for?** Currently the top. If a
   rank should be fair for a *typical* player, the target R belongs on the
   median column, which lifts every rank by 1/0.585 = **1.71×**.

Why the squaring: a tier's budget is `(1 + C·alloc) × gearScale` — 0.84 / 1.15
/ 1.50. It reaches the stats as `atk ∝ budget`, `def, hp ∝ √budget`, so
`CS ∝ budget^(2/3)` and `R ∝ budget²`. A 1.79× budget spread becomes 3.2× in
outcome. The gear scale is also **invented** (see C2), and this table is the
thing most sensitive to it.

### 5. HP and DEF are exactly interchangeable

By construction: the defensive budget is split `sqrt` each, so `hp × def` is
exactly the budget. Spending defensively on either buys the same survival.
Neither is a trap stat. This is a real design decision to accept or reject.

### 6. Level: only the gap matters

Absolute level is irrelevant — rank C is **4.0000** at level 1, 33 and 99 alike.
Player and mob grow at the same rate, so it cancels. There is an invariant
asserting it.

The gap does matter, at `growth^(2 × gapWeight)` per level. At the default
weight **0.6** that is **5.4% per level**:

```
mob +5 levels    1.30× harder
mob +10 levels   1.70× harder
mob +16 levels   2.33× harder
```

Set `Level gap weight` to 1.0 and those become 1.55× / 2.41× / 4.09×. Set it to
0 and level difference stops mattering entirely.

It is **symmetric** — softening the punishment softens the reward. Out-levelling
content near your own level is correspondingly less of a win. Going far back is
still trivial either way: a level-90 player against a level-10 rank C is R 9156.

### 7. Sliders that change nothing, change nothing

Only these move an outcome:

```
Stat coefficient C      spreads builds apart
Encounter size          party factor 2n/(n+1)
Mob level − player      the gap
Level gap weight        how much the gap counts
rank multipliers        the ladder itself
```

These move fight length for **untargeted ranks only** (S and above): `Damage k`,
`Attack speed`. Ranks with a TTK target absorb them in the solve and hold their
seconds exactly.

These move **nothing at all**: `Reference HP`, `Base atk`, `Base def`,
`Gear class lean`, `Move speed base`. A mob is a scaled copy of the max-grade
player, so anything applied to both sides cancels in the ratio. `Growth` also
cancels except through the level gap.

If a slider you expected to matter does nothing, that is why — a statement about
the model, not a bug.

### 8. Party factor is `2n/(n+1)` and nothing else

`n = 4` is 1.6× easier than a duel, not 4×. The party focus-fires, so mobs die
one at a time and the average number still alive is `(n+1)/2`. Bounded at 2×:
`n=8` is 1.778, `n=50` is 1.961, infinity is exactly 2.

**This rests on mobs NOT coordinating focus fire.** If they all attacked one
player the `n²` terms cancel by symmetry and R collapses to the duel value —
every party column optimistic by up to 1.96×. It is a **specification**, not a
measurement: "mobs must not coordinate target selection" is a requirement the AI
has to satisfy, and it belongs in the spec beside the multipliers.

Formation is not modelled at all, yet it decides whether the factor applies — a
clumped party is nearest to every mob at once. Worth up to 1.96×, unmodelled.

---

## C. What is NOT verified — read before trusting any verdict

1. **No simulation has ever been run.** Every number is closed-form. No crits,
   misses, kiting, movement, line of sight; perfect focus fire, instant target
   switching. A `BattleModule` run is the only thing that turns this from a
   model into evidence.
2. **Gear tiers E/C/A are invented.** `weapons.ts` has archetypes, not tiers, and
   there is no rarity field anywhere. The 0.70/0.85/1.00 scale is authored design
   data — the weakest-grounded input on the page.
3. **Gear classes are invented too.** There is no tank/dps gear concept in code.
4. **Mana and skills are not in R.** Modelled separately in `mana_level.py` and
   `parity.py`, never merged. Every verdict is auto-attack-only. The model now
   carries a single `atk` rather than pAtk/mAtk, so physical-vs-magic parity is
   not represented at all.
5. **Top ranks are incoherent.** SSS derives a 10-second encounter against a
   3000–4500s target. Either SS/SSS are _n players vs one boss_ rather than a
   pack of n, or the TTK targets are wrong. Everything above rank A is
   provisional.
6. **A tank has no mechanical edge.** See B4. Deliberate under this model, but
   nothing has been designed yet to replace it.
7. **`gapWeight = 0.6` is chosen, not derived.** It halves the pain of a 10-level
   gap. No playtest supports the number.
8. **`statCapAtL1/LMax` are declared, not derived.** Asserted in the JSON and
   checked against 99, but nothing ties them to the level curve.

## Where each number comes from

- Everything on the page is authored in `scripts/gen_combat_model.mjs`, tagged
  `origin: "design-spec"`. **Nothing is read from the game.** That is deliberate:
  the running server is a single-player debug prototype, and letting it sit
  beside the design invites the design to be judged against it.
- Rank multipliers are the exception — they are _solved_ in that script from each
  rank's target R, so they cannot drift out of calibration by hand-editing.
- Anything on the page not from one of those two — a bug. Report it.
