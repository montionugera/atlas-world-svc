# Combat Balance Sheet

Generated from `model/balance_sheet.py`. Headcount reading: **n mobs AND n players**.

`R` = how long you survive ÷ how long the encounter survives. `R>1` = win, HP left = `1 − 1/R`.


## 1. The rank ladder

| rank | levels | n | per-mob mult | was | encounter R (max) | verdict | solo R (max) | solo verdict |
|---|---|---|---|---|---|---|---|---|
| E | 1-12 | 1 | **0.29** | 1.00 | 11.89 | trivial | 11.89 | trivial |
| D | 13-25 | 1 | **0.41** | 1.15 | 5.95 | easy | 5.95 | easy |
| C | 26-40 | 1 | **0.50** | 1.30 | 4.00 | easy | 4.00 | easy |
| B | 41-55 | 2 | **0.78** | 1.50 | 2.19 | fair | 1.64 | hard |
| A | 56-70 | 4 | **0.94** | 1.80 | 1.80 | hard | 1.12 | brutal |
| S | 71-84 | 8 | **1.05** | 2.20 | 1.60 | hard | 0.90 | LOSS |
| SS | 85-95 | 20 | **1.13** | 2.80 | 1.50 | hard | 0.79 | LOSS |
| SSS | 96-99 | 50 | **1.18** | 3.50 | 1.40 | hard | 0.71 | LOSS |

Every rank is a **hard-to-fair win for a correctly-sized party**. Escalation is social (can you field 50 people?), not numerical — which is what *"tier gating = headcount, not power"* means.


## 2. Your four requirements

| requirement | R | band | result |
|---|---|---|---|
| max player CANNOT solo a same-level S mob | 0.90 | LOSS | **PASS** |
| max player cannot EASILY solo same-level A | 1.12 | brutal | **PASS** |
| median player beats same-level C, fair | 2.23 | fair | **PASS** |
| max player beats same-level C, easy | 4.00 | easy | **PASS** |

**ALL FOUR PASS**


## 3. Outcome matrix — every rank × every player grade

Encounter = party of n vs pack of n. Solo = one player vs one mob.

| rank | lvl | max (party) | median (party) | min (party) | max (solo) | median (solo) | min (solo) |
|---|---|---|---|---|---|---|---|
| E | 6 | 11.89 trivial | 6.61 easy | 3.36 fair | 11.89 trivial | 6.61 easy | 3.36 fair |
| D | 19 | 5.95 easy | 3.31 fair | 1.68 hard | 5.95 easy | 3.31 fair | 1.68 hard |
| C | 33 | 4.00 easy | 2.23 fair | 1.13 brutal | 4.00 easy | 2.23 fair | 1.13 brutal |
| B | 48 | 2.19 fair | 1.22 brutal | 0.62 LOSS | 1.64 hard | 0.91 LOSS | 0.46 LOSS |
| A | 63 | 1.80 hard | 1.00 brutal | 0.51 LOSS | 1.12 brutal | 0.63 LOSS | 0.32 LOSS |
| S | 77 | 1.60 hard | 0.89 LOSS | 0.45 LOSS | 0.90 LOSS | 0.50 LOSS | 0.25 LOSS |
| SS | 90 | 1.50 hard | 0.83 LOSS | 0.42 LOSS | 0.79 LOSS | 0.44 LOSS | 0.22 LOSS |
| SSS | 97 | 1.40 hard | 0.78 LOSS | 0.40 LOSS | 0.71 LOSS | 0.40 LOSS | 0.20 LOSS |

## 4. Player curve

| L | CS | pAtk | mAtk | maxHP | pDef | mitigation | EHP | mspd |
|---|---|---|---|---|---|---|---|---|
| 1 | 55 | 9 | 8 | 100 | 5 | 33% | 149 | 30.0 |
| 20 | 126 | 22 | 17 | 231 | 12 | 33% | 344 | 30.0 |
| 40 | 304 | 52 | 42 | 557 | 28 | 33% | 831 | 30.0 |
| 60 | 733 | 125 | 101 | 1,342 | 67 | 33% | 2,003 | 30.0 |
| 80 | 1,769 | 302 | 243 | 3,237 | 162 | 33% | 4,832 | 30.0 |
| 99 | 4,082 | 697 | 560 | 7,471 | 374 | 33% | 11,151 | 30.0 |

## 5. Mob stats at each rank's reference level

| rank | lvl | n | mob CS | mob HP | mob pAtk | mob pDef | TTK per mob | TTK encounter |
|---|---|---|---|---|---|---|---|---|
| E | 6 | 1 | 20 | 36 | 3 | 2 | 2.2s | 2s |
| D | 19 | 1 | 49 | 91 | 8 | 5 | 3.1s | 3s |
| C | 33 | 1 | 112 | 204 | 19 | 10 | 3.7s | 4s |
| B | 48 | 2 | 337 | 617 | 58 | 31 | 2.9s | 6s |
| A | 63 | 4 | 789 | 1,445 | 135 | 72 | 1.8s | 7s |
| S | 77 | 8 | 1,634 | 2,990 | 279 | 150 | 1.0s | 8s |
| SS | 90 | 20 | 3,096 | 5,666 | 529 | 283 | 0.4s | 8s |
| SSS | 97 | 50 | 4,422 | 8,094 | 755 | 405 | 0.2s | 9s |

## 6. Build spread — does allocation still matter?

| build @L60 | CS | vs unallocated |
|---|---|---|
| unallocated | 489 | 1.00× |
| min (0.4) | 587 | 1.20× |
| median (0.7) | 660 | 1.35× |
| balanced (0.85) | 697 | 1.42× |
| max (1.0) | 733 | 1.50× |

## 7. Invariants

| invariant | value | result |
|---|---|---|
| 20-level growth in 120–160% | 141% | PASS |
| CS compounds at 4.5%/level | 4.50% | PASS |
| mitigation % flat across levels | 33% | PASS |
| stat share ≥25% at every level | 33.3% flat | PASS |
| stat cap never exceeds 99 | 99 | PASS |
| largest encounter HP fits int32 | 404,686 | PASS |
| all four requirements (§2) | 4/4 | PASS |
| mspd within clamp 36 | 30.0 | PASS |

**ALL PASS**


## 8. Still not covered by this sheet

- Closed-form only — no crit variance, no misses, no kiting, perfect focus-fire. Needs a `BattleModule` run to be proof rather than a screen.
- Jobs do not exist; and because `R = (CS_p/CS_m)²` cancels the DPS/EHP split, allocation archetypes cannot change any verdict above. Differentiation must come from elements / AoE / range / crit, outside CS.
- Mana, skills and physical-vs-magic parity are modelled separately (`mana_level.py`, `parity.py`) and are **not** folded into these R values yet.

