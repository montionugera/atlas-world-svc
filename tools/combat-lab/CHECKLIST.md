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

Now double `k` to 0.20 and watch what moves. Nothing does:

```
k = 0.10   E 2.5s  D 4.5s  C 6.0s  B 12.2s  A 15.1s  S 70.0s  SS 900s  SSS 5400s
k = 0.20   E 2.5s  D 4.5s  C 6.0s  B 12.2s  A 15.1s  S 70.0s  SS 900s  SSS 5400s
```

Every rank absorbs it, because every rank's multipliers are re-solved live
against the current sliders. So `k` is not a fight-length knob at all — it sets
how big damage numbers are and the ladder compensates. To change fight lengths,
change `swings` (E–S) or `ttk` (SS, SSS) in `gen_combat_model.mjs`, not `k`.

`Attack speed` is different, and the difference is the whole point of §2a-bis:

```
aspd = 0.5   E 2.5s  D 4.5s  C 6.0s  B 12.2s  A 15.1s  S 70.0s  SS 900s  SSS 5400s
aspd = 1.5   E 0.8s  D 1.5s  C 2.0s  B  4.1s  A  5.0s  S 23.3s  SS 900s  SSS 5400s
                                                        sustain  82→94%   93→98%
```

Ranks without a wall clock get shorter. SS and SSS **hold their clock and pay
in sustain instead** — at 1.5 swings/s the boss lands three times as many hits
in the same 900 seconds, so healing has to cover 94.1% rather than 82.2%. That
is the authored target doing its job: something has to give, and the model makes
it visible rather than silently moving the fight length.

### 2. Three multipliers per rank, solved live

Each rank has `atk`, `def` and `hp` multipliers rather than one. With a single
multiplier, duration and difficulty are welded together as `TTK ∝ R^(−2/3)` —
the ladder's 16.7× difficulty span permits a 6.5× span in fight length, while
the targets want far more. Splitting them breaks the weld:

```
R    = 1 / (atk × def × hp)      difficulty
TTK ∝       def × hp             duration
```

Check the mob table: every rank hits its target R **and** its target
swings-to-kill-a-player at the same time — 15 / 13.5 / 12 / 10 / 8.5 / 7 / 6 / 5.
Move the `Damage k` or `Attack speed` sliders and they still do; the solve is
live.

Splitting is necessary but **not sufficient**, and that is the lesson of the SS
and SSS wall clocks. Three multipliers give you two free targets per rank, not
three: fix R and swings and fight length is determined. A third target needs a
fourth variable, which is sustain — see §2a-bis.

### 2a-bis. A boss's wall clock is bought with healing, not HP

SS and SSS author a fight length (900s, 5400s). Raising boss HP cannot deliver
one. `hp` lives inside the `def × hp` product and `R = n²/(a·d·h)`, so every
factor added to HP is taken straight back out of difficulty — and for a boss

```
ttk = swings × n / (R × aspd)
```

has no freedom left once `swings`, `n` and `R` are written down. SS derived
**160s** against a 600–1200s target; SSS **357s** against 3600–7200s.

Holding R _and_ swings while stretching the clock needs a fourth variable.
Healing is the only one that buys survival time without changing how hard the
boss hits, so **sustain is solved, never authored** — it is the bill:

```
sustain = 1 − n² / (R × a × d × h)
```

| rank | fight | swings to kill you | swings you take | health bars | sustain   |
| ---- | ----- | ------------------ | --------------- | ----------- | --------- |
| SS   | 900s  | 6                  | 22.5            | 3.8         | **82.2%** |
| SSS  | 5400s | 5                  | 54.0            | 10.8        | **93.4%** |

Boss HP moves 80× → 380× a player's at SS, and 377× → 4,345× at SSS.

**None of it exists.** There is no healing, regeneration or resurrection in the
model or the game. An SSS party must replace 93.4% of everything the boss deals
for 90 minutes or the fight is unsurvivable at any gear level.

**The alternative was rejected on arithmetic, not taste.** Paying with attack
instead means the SS boss needs 33.8 swings to kill a player and SSS 75.6 —
hits of 3.0% and 1.3% of a health bar. A long fight survived on one health bar
is necessarily made of imperceptible hits.

Gates: `sustain — the bill a long fight runs up` pins 82.2% / 93.4% to 0.1%,
asserts the wall clocks land, and asserts no rank without an authored `ttk`
assumes any healing at all.

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
   rank should be fair for a _typical_ player, the target R belongs on the
   median column, which lifts every rank by 1/0.585 = **1.71×**.

Why the squaring: a tier's budget is `(1 + C·alloc) × gearScale` — 0.84 / 1.15
/ 1.50. It reaches the stats as `atk ∝ budget`, `def, hp ∝ √budget`, so
`CS ∝ budget^(2/3)` and `R ∝ budget²`. A 1.79× budget spread becomes 3.2× in
outcome. The gear scale is also **invented** (see C2), and this table is the
thing most sensitive to it.

### 4c. A rank is one difficulty — and a boss has a level, not a band

Absolute level cancels (§6), so a level-80 fight is identical to a level-20 one
in every outcome column — R, TTK and swings-to-kill-you all match to the digit,
with only the absolute numbers scaling by `1.045^60` = 14.03×. What changes with
level is **which content you meet**, and that is where a real defect lived.

The gap term is 5.4%/level, so across a 14-wide band the same rank swings by
**1.99×**. Ranks with lots of headroom absorb it; ranks targeting R just above
1.0 did not:

```
rank  band     R at band bottom vs band top
C     26-40    1.91  hard
B     41-55    1.05  brutal
A     56-70    0.86  LOSS
S     71-84    0.81  LOSS      <- fixed
SS    85-95    0.88  LOSS      <- fixed
```

A band-bottom party met band-top content of **its own rank** at R 0.81 with max
gear and full headcount. Same rank, same 8 players, two different games.

**The fix was to stop giving bosses a band.** S/SS/SSS are single named bosses
fought by 8, 20 and 50 players; a fourteen-level range for one boss is a
category error. They now carry `level: 77 / 90 / 97`, and the approach reads as
a curve instead of a cliff:

```
S boss, level 77      player L71  R 1.17 brutal
                      player L77  R 1.60 hard
                      player L84  R 2.32 fair
```

`from`/`to` survive on a boss row, but they now mean _the player levels expected
to attempt it_, not a range the mob is drawn from.

**Rank A is deliberately left at 0.86** and is the gate's only exemption: 4v4 at
14 levels under the far end of the last zone should not be winnable.

Two alternatives were rejected. Lowering `gapWeight` would need ~0.41 and it is
symmetric — a global knob flattening out-levelling across all 99 levels to fix
three ranks' edges. Narrowing the bands works numerically (S needs width 9, SS
width 8) but is the same fix in disguise: shrinking a range until it is nearly a
point is an awkward way of saying the boss has a level.

Gate: `a rank is one difficulty, not a range of them`. Proven to bite —
deleting the boss levels reproduces `FAIL S 0.81`, `FAIL SS 0.88`.

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
5. **Sustain is load-bearing and does not exist.** SS and SSS now hit their
   wall clocks (900s, 5400s) only because the model assumes **82.2%** and
   **93.4%** of all incoming damage is healed. There is no healing,
   regeneration or resurrection anywhere in the model or the game, so every
   SS/SSS figure is quoted against an undesigned system. If healing cannot
   deliver those rates, the clocks are unreachable and the fights must shorten.
   See §2a-bis.
6. **Rank S has no wall clock while SS and SSS do.** The ladder jumps from a
   70-second fight needing no healing to a 900-second fight needing 82%. Either
   S should author a `ttk` too and take on a bill of its own, or systems S does
   not need should not become mandatory one rank later.
7. **A tank has no mechanical edge.** See B4. Deliberate under this model, but
   nothing has been designed yet to replace it.
8. **`gapWeight = 0.6` is chosen, not derived.** It halves the pain of a 10-level
   gap. No playtest supports the number.
9. **`statCapAtL1/LMax` are declared, not derived.** Asserted in the JSON and
   checked against 99, but nothing ties them to the level curve.
10. **The shipped stat formula disagrees structurally.** `derivedStats.ts` is
    additive with a flat base and has no geometric growth; this model is
    multiplicative. It also splits pAtk/mAtk where this carries one `atk`, and
    has four primaries where this has three stats. Reconciling them is unscoped.

## Where each number comes from

- Everything on the page is authored in `scripts/gen_combat_model.mjs`, tagged
  `origin: "design-spec"`. **Nothing is read from the game.** That is deliberate:
  the running server is a single-player debug prototype, and letting it sit
  beside the design invites the design to be judged against it.
- Rank multipliers are the exception — they are _solved_ in that script from each
  rank's target R, so they cannot drift out of calibration by hand-editing.
- Anything on the page not from one of those two — a bug. Report it.
