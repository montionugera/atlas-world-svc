# Verifying the Combat Balance Lab

Three separate questions, in increasing order of how much they matter and
decreasing order of how well they are answered:

| #   | question                            | answered by             | status                      |
| --- | ----------------------------------- | ----------------------- | --------------------------- |
| A   | Does the arithmetic match the spec? | `verify.mjs`            | **automated, passing**      |
| B   | Does the model behave sensibly?     | this checklist, by hand | **do it yourself, ~10 min** |
| C   | Does it predict the real game?      | nothing yet             | **NOT ANSWERED**            |

A passing `verify.mjs` proves only that the page and `model/balance_sheet.py`
agree. Two implementations of the same wrong model would still agree. B and C
are where actual confidence comes from.

---

## A. Automated — run it

```bash
node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs
```

Expect `OK — index.html reproduces the balance sheet exactly.` and exit 0.
It asserts 4 requirements, 8 ladder rows, 42 player-curve cells, 3 grade
identities, axis monotonicity, 72 cross-product cells, and 8 invariants.

It will NOT catch: a wrong formula that both implementations share, a mislabelled
column, or a modelling assumption that does not match the game.

---

## B. By hand — ten checks, each ~30 seconds

Do these with the sliders at spec defaults (hit **Reset to spec defaults** first).
Every expected value below was computed from the live model, not asserted.

### 1. CombatScore really is `√(DPS × EHP)`

Player curve, L1: `DPS 20.0`, `EHP 149.3`.
`√(20 × 149.25) = 54.64` → the table shows **55**. ✅

### 2. The growth rate is exactly what the slider says

CS at L2 ÷ CS at L1 = **1.045000**, matching `Growth / level`.
Not approximately — exactly, by construction.

### 3. Growth compounds over the whole range

CS L99 ÷ CS L1 = **74.71**, and `1.045^98 = 74.71`. ✅
So a level-99 player is ~75× a level-1 player.

### 4. The rank multiplier inverts and squares

Rank C has `mult 0.500`. A max player solo should be `(1/0.5)² = 4.00`.
Matrix shows **4.00 easy**. ✅

### 5. Same check, awkward number

Rank E has `mult 0.290` → `(1/0.29)² = 11.89`. Shows **11.89 trivial**. ✅
If these two hold, the R formula is right.

### 6. Gear moves mitigation — the non-obvious one

Compare a max player to a median player at L33:

```
max     mitigation 33.0%
median  mitigation 29.5%
```

**Gear scales pDef but not the defence constant K**, so worse gear means you
mitigate a smaller fraction, not just have less of everything. This compounds
into CS: median/max CS ratio is **0.7458**, not the 0.765 you would get from
DPS scaling alone. Then `(0.7458 / 0.5)² = 2.225` → matrix shows **2.23 fair**. ✅

If you did not expect gear to affect mitigation percentage, this is a real design
decision to accept or reject — not a bug, but not obviously right either.

### 7. The party factor is `2n/(n+1)` and nothing else

Rank B has `n = 2`, so party R should be solo R × `2·2/3 = 1.3333`.
`2.19 / 1.64 = 1.3333`. ✅
Check rank A too: `n=4` → `8/5 = 1.6`.

### 8. Level difference costs a fixed multiplier

Set `Mob level − player level` to `+1`. R divides by `1.045² = 1.0920`,
i.e. **each mob level above you makes the fight 9.2% harder**.
At `+16`, rank C solo goes `4.00 easy` → **0.978 LOSS**. ✅
A 16-level gap flips any same-level _easy_ into a loss.

### 8b. Absolute level does not matter — only the difference

Rank C encounter R is **4.000000** at player level 1, 33 and 99 alike.
Player and mob grow at the same rate, so `L` cancels out of `CS_p / CS_m`
entirely. Set the offset to +5 and it is `2.575711` at every level.

This is why the rank ladder's level band is greyed out: it is content
placement, not strength. It changes nothing in that table. There is now an
invariant asserting it (`R invariant to absolute level`).

### 9. HP left is `1 − 1/R`

Ladder, rank C: R 4.00 → **75%** HP left.
Rank S party: R 1.60 → **38%**. ✅

### 10. Sliders that should do nothing, do nothing

Drag **Target mitigation** across its whole range. Every R stays put.
That is correct and worth understanding: a mob is defined as a scaled copy of
the max-grade player, so anything applied to both sides cancels in the ratio.
The same is true of `Base DPS`, `Base HP`, `Base pDef`.

**Only these change outcomes:** `Stat coefficient C` (spreads builds apart),
`Growth / level` (only via level difference), `Mob level − player level`, and
the rank multipliers themselves.

If a slider you expected to matter does nothing, this is why — and it is a
statement about the model, not a bug.

---

## B2. Section audit — which displayed values are load-bearing

Ran every section through the same test: does this value change any outcome?
Several do not. That is fine, but only if the page says so — a normal-looking
column implies a dependency, and three of them had none.

| section             | column                           | load-bearing?                                                                                            |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Rank ladder         | `usual level band`               | **No.** R is identical at L1 and L99. Greyed out + footnoted.                                            |
| Rank ladder         | `was`                            | No — prior value, kept for comparison. Greyed by design.                                                 |
| Rank ladder         | `mult`, `n`                      | Yes. These are the only real inputs to R.                                                                |
| Outcome matrix      | level in each header             | **No** at offset 0. Marked in the section note.                                                          |
| Outcome matrix      | build, gear                      | Yes — verified monotonic on each axis independently.                                                     |
| Player curve        | `damage mitigated`               | **No — constant 33% at every level.** Footnoted.                                                         |
| Player curve        | `player move speed`              | **No — constant 30.0 at every level.** Footnoted.                                                        |
| Player curve        | CS, pAtk, mAtk, maxHP, pDef, EHP | Yes, all vary with level.                                                                                |
| Mob stats           | `mob level`                      | Yes for mob CS/HP/pAtk/pDef — they are absolute values.                                                  |
| Mob stats           | `time to kill`                   | **No — level-invariant** (3.7313s for rank C at L10, L33 and L90 alike). Depends only on `mult` and `n`. |
| Shipped vs proposed | all                              | Yes, but see the assumption below.                                                                       |

Two of these are design questions, not display bugs:

- **Move speed has no level term.** `mspd = base × (1 + C·alloc)`, so a level-99
  player moves exactly as fast as a level-1 player with the same allocation.
  Deliberate — move speed is outside CombatScore (spec §2.1) — but worth
  confirming you want it.
- **Mitigation is flat at 33% forever.** By construction: the defence constant
  `K(L)` rides the same growth curve as pDef. So armour never gets relatively
  better or worse as you level. Also deliberate, also worth confirming.

**Assumption in "Shipped vs proposed":** the shipped columns assume every primary
stat equals the player's level, capped at 99. The shipped formula is additive in
raw stat values (`pAtk = 10 + 2·str`), so it needs a stat number, and nothing in
the game pins stats to level. The left half of that table is illustrative, not a
measured player — the 4.7× HP gap it shows is directionally real but not exact.

---

## C. What is NOT verified — read before trusting any verdict

None of the following is checked by anything, anywhere:

1. **No simulation has ever been run.** Every number is closed-form. No crit
   variance, no misses, no kiting, no movement, no line of sight, perfect
   focus-fire, instant target switching. A `BattleModule` run is the only thing
   that turns this from a model into evidence.
2. **Gear tiers E/C/A are invented.** `weapons.ts` has archetypes, not tiers,
   and there is no rarity field anywhere in `catalogs.ts`. The 0.70/0.85/1.00
   scale is authored design data — the weakest-grounded input on the page.
3. **Mana and skills are not in R.** Modelled separately in `mana_level.py` and
   `parity.py` and never merged. Every verdict is auto-attack-only.
4. **Top ranks are incoherent.** SSS derives a 9-second encounter against a
   3000–4500s target. Either SS/SSS are _n players vs one boss_ rather than a
   pack of n, or the TTK targets are wrong. Everything above rank A is
   provisional.
5. **Jobs cannot matter here.** `R = (CS_p/CS_m)²` cancels the DPS/EHP split, so
   no allocation archetype can change any verdict. Differentiation has to come
   from elements, AoE, range or crit — all outside CS.
6. **The proposed model is not in the game.** Shipped code is additive
   (`pAtk = 10 + 2·str + weapon`). The proposed L99 HP is 7,471 against a shipped
   1,580 — a 4.7× structural gap, not a tuning delta.
7. **`statCapAtL1/LMax` are declared, not derived.** They are asserted in the
   JSON and checked against 99, but nothing ties them to the level curve.

## Where each number comes from

- `shipped` values — scraped live from `derivedStats.ts`, `combatStats.ts`,
  `physicsConfig.ts`, `gameConfig.ts` by `scripts/gen_combat_model.mjs`. Every
  extraction asserts it matched, so a rename fails loudly rather than emitting a
  stale number.
- `proposed` values — authored in that same script, tagged
  `origin: "design-spec"`, mirroring `model/balance_sheet.py`.
- Anything on the page not in one of those two — a bug. Report it.
