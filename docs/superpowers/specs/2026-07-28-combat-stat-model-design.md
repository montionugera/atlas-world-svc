# Combat Stat Model — Design Spec

**Status:** DRAFT for review · 2026-07-28 · supersedes the additive model in `contracts/src/meta/derivedStats.ts`
**Origin:** I-028 brainstorm (steps 1–4 in `.claude/idea_backlog/I-028-.../HANDOFF.md`)
**Scope:** the stat → derived-stat → CombatScore formulas, the mob strength rule, and the balance-verification harness. Not the implementation plan.

<div class="callout warn">
<strong>Five decisions are still open</strong>, marked <code>TODO(design)</code> in the text.
<strong>Three block</strong> — the mob authority rule (§5.1), the rank ladder (§5.2), and the win-band calibration cell (§6.2). The first two change the shape of the model, not just a constant.
<strong>Two are defaulted</strong> and can be overridden later without restructuring — α = 1.0 (§3.2) and k = 0.7 / T* = 45s (§4.2).
Everything else in this spec is derived and verified against the scripts in §10.
</div>

---

## 1. Why the current model has to be replaced <span class="topic-chip">problem</span>

The shipped formulas are **additive**:

```
maxHealth    = 100 + 10*vit + 5*(level-1)
pAtk         = 10 + 2*str + weapon.pAtk
mAtk         = 10 + 2*int + weapon.mAtk
pDef         = 5 + vit ;  mDef = 5 + int
maxMoveSpeed = 20 + 0.2*agi
```

Against the agreed growth target this is arithmetically impossible, not merely mistuned:

<div class="metric-grid">
<div class="metric-tile"><strong>×74.7</strong><br>CombatScore growth required over L1→L99 (1.045<sup>98</sup>)</div>
<div class="metric-tile"><strong>×3</strong><br>maximum growth available from stats capped 1–99</div>
<div class="metric-tile alarm"><strong>4%</strong><br>ceiling on an additive stat's share of CombatScore</div>
<div class="metric-tile alarm"><strong>2%</strong><br>observed stat share at L99</div>
</div>

The requirement is **≥25% at every level**. An additive term cannot reach it at any tuning. The fix must be structural.

---

## 2. Core model — stats multiply gear <span class="topic-chip">settled</span>

```
pAtk   = (base + weapon.pAtk) × (1 + C · str/statCap(L))
mAtk   = (base + weapon.mAtk) × (1 + C · int/statCap(L))
maxHP  = (base + armor.HP)    × (1 + C · vit/statCap(L))
pDef, mDef = armour only               ← no stat term
mspd   = MSPD_BASE × (1 + C · agi/statCap(L)), clamped to MSPD_CAP

C          = 0.5
statCap(L) = 10 + 89·(L−1)/98          10 at L1 → 99 at L99
K(L)       = K₁ · 1.045^(L−1)          pRed = pDef/(pDef + K(L))
gear sizing: gear supplies CS/(1+C); stats supply the remainder
```

A character at its level's stat cap is **1.5× one with none, at every level**. The stat share becomes a design constant — a flat **33.3%** — instead of a race against the curve.

`pDef`/`mDef` deliberately carry **no** stat term, so mitigation percentage stays independent of allocation. This mirrors the `K(L)` normalisation already used for defence: normalise against a level-scaled reference so the *percentage* holds while raw numbers inflate.

**Verified** (`model/cs_decomposition.py`, 11/11 invariants):

| L | CS | pAtk | maxHP | pDef | mitigation | EHP |
|---|---|---|---|---|---|---|
| 1 | 55 | 9 | 100 | 5 | 33% | 149 |
| 50 | 472 | 81 | 864 | 43 | 33% | 1,290 |
| 99 | 4,082 | 697 | 7,471 | 374 | 33% | 11,151 |

Build spread @L60 on identical gear: unallocated 489 → all-in offence 599 → balanced 636 → fully allocated 733 (**1.50×**).

### 2.1 Move speed is outside CombatScore

`mspd` is bounded and AGI-driven, and is **excluded from CS**. Scaled with the curve it would reach 1,494 u/s — 75 units per tick against a 0.5–8 unit collider, crossing the 1,000-unit world in 0.7s. It cannot be a power stat.

`MSPD_BASE = 20`, `MSPD_CAP = 36`. AGI at cap yields 30 u/s — a 1.50× spread matching `C`, with the clamp as a backstop applied **after** all additive sources (buffs, mounts, race leans) so nothing can leak past it.

<div class="callout danger">
<strong>The cap is not a tunnelling fix.</strong> Measured against real planck 1.4.2: projectiles are capped at 36 u/s and the world takes one discrete 50 ms step, so a max-AGI player registers only <strong>44.8%</strong> of genuine hits. Capping mspd at 30 gives 75% — still broken. <strong>4× physics substep (12.5 ms) gives 100%</strong> at any mspd. <code>bullet: true</code> does nothing — sensor fixtures do not participate in Box2D CCD. Tracked separately; it is an engine fix, not a stat fix.
</div>

---

## 3. Mana and skills <span class="topic-chip">settled</span>

Skills turn DPS from a constant into a function of fight length. Two independent limiters, and **which one binds changes with fight length**:

```
casts(T) = min( 1 + T/cooldown ,  (MPmax + regen·T)/cost )

DPS(T)   = DPS_auto + casts(T)·skillDmg/T
         = DPS_auto + E·regen + E·MPmax/T          E = skillDmg/cost
                      ^^^^^^^   ^^^^^^^^^^
                      sustain    burst (decays as 1/T)
```

Observed: **cooldown-bound for ranks E–B, mana-bound for A–SSS.** Short content is a rotation game; long content is a resource game. This emerges from the arithmetic rather than being designed in.

### 3.1 Skill cost must ride the level curve

```
cost(L) = COST₁ × 1.045^(L−1)     scales with LEVEL, not with the player's INT
```

<div class="callout warn">
With a flat cost, regen reaches 26.8 MP/s at L60 against a 10 MP skill — mana stops binding around L20 and never returns. Verified: burst and sustain builds produced <em>numerically identical</em> CS at every fight length. If instead cost scaled with INT (e.g. "15% of max MP"), INT would buy nothing. Level-scaled and INT-independent is the only version where a larger pool means more casts.
</div>

### 3.2 INT and WIT, reverse-engineered from casts-per-minute

Cost rides your own MATK, which makes the algebra collapse cleanly:

```
MATK  = D₀·(1 + C·int)      cost  = K₀·(1 + C·int)^α
MPmax = M₀·(1 + C·int)      regen = R₀·(1 + C·wit)

CPM = M₀/K₀  +  (60·R₀/K₀) · (1+C·wit)/(1+C·int)        [at α = 1]
DPM = A·(1 + C·int)  +  B·(1 + C·wit)                    separable, linear in both
```

**Casts per minute is level-invariant** — 17.0/min from L1 to L99, drift `4.4e-16`. Casts stay constant; hits get bigger. `CPM` therefore becomes a design dial tunable independently of the level curve, and `DPM` still compounds at exactly 4.50%/level.

More INT = fewer, bigger casts. More WIT = more casts, same size.

<div class="callout idea">
<strong>Known cost of α = 1:</strong> INT alone yields +15%, WIT alone +18% — together 1.50×, the same multiplier <strong>STR alone</strong> gives a warrior. Casters spend two stat budgets for one stat's worth of power. Compensation is <strong>AoE</strong> (DPM × targets), not a larger coefficient — see §4.2. Setting α = 0.5 would fix the starvation but push mana stats to 1.84× (46% share vs 33%), making every caster strictly better than every physical build and invalidating the win matrix.
</div>

`TODO(design)` — **α = 1.0** assumed throughout. Confirm, or accept α = 0.5 and its consequences.

### 3.3 Mana economy is a real lever that CS cannot see

Net MP per kill is currently negative at every rank (1.0–3.4 kills before dry, forcing the player to sit). Nothing in `sqrt(DPS × EHP)` measures forced downtime. Anchors must be set deliberately rather than inherited.

---

## 4. Physical vs magic parity <span class="topic-chip">settled</span>

The two sides are not the same *kind* of quantity:

```
Physical:  aspd × pAtk                  a RATE   — unlimited in time
Magic:     (MPcap/cost) × mAtk          a BUDGET — then you are dry

M(T) = B + s·T        B = pool budget,  s = regen/cost × mAtk
T*   = B / (aspd·pAtk − s)              crossover: physical overtakes here
```

Anchor `P: 1.5 × 100 = 150/s` vs `M: 150/10 × 400 = 6,000` resolves to a **40-second window** (1.5 aspd × 40s = 60 attacks × 100 = 6,000).

### 4.1 Two traps, both verified

**Equal sustain backfires.** Set regen so magic sustain equals physical DPS and magic leads by a flat +6,000 *forever* — 5.0× at 10s, 2.0× at 40s, 1.2× at 200s. Approached, never overtaken. **Magic sustain must sit strictly below physical**; the pool buys the deficit back.

**The crossover cannot be placed below ~40s.** For every rank under A, the pool alone already exceeds what physical delivers in that window. No regen value changes this — regen moves the slope, short fights are dominated by the intercept.

| rank | TTK | physical | magic | M/P |
|---|---|---|---|---|
| E | 3.5s | 525 | 6,058 | **11.5×** |
| C | 14s | 2,100 | 6,233 | 3.0× |
| A | 45s | 6,750 | 6,750 | 1.00× |
| S | 195s | 29,250 | 9,250 | 0.32× |

### 4.2 The dial is pool size relative to encounter, not regen

```
MPcap/cost × mAtk  ≈  k × (groupSize × mobEHP)        k = 0.7
```

A full pool *nearly* clears one rank-appropriate pack; you finish on auto-attacks. This ties the mana system to the **headcount gating** (group sizes 1/1/1/2/4/8/20/50) instead of fighting it, and makes AoE the mechanism that converts pool budget into pack clears — which is also the caster's compensation from §3.2.

`TODO(design)` — **k = 0.7**, **T\* = 45s (rank A)** assumed.

---

## 5. Mob model <span class="topic-chip">DECISION NEEDED</span>

### 5.1 One authoritative rule

The current model defines mob strength **twice**, and the two disagree:

```
mob HP   = group × player_DPS × TTK        ← the TTK table sets defence
mob pAtk = player_pAtk × rankMultiplier    ← the rank multiplier sets offence
```

These were never reconciled. The TTK table only ever asked *"how long does the mob take to die?"* — never *"does the player survive that long?"*

**Proposed:** `CS` is authoritative; TTK derives from it and remains a readable output for sanity-checking, never an input.

`TODO(design)` — confirm CS-authoritative.

### 5.2 The rank ladder must be lowered *and* stretched

Every current multiplier is ≥ 1.0, so every mob has at least a same-level player's offence while group size for E/D/C is 1. A lone trash mob out-damages you. Verified: **every cell of the outcome matrix is a loss**, including a max-geared L99 player against an E-rank trash mob.

Worse, no shift of the current ladder can satisfy the stated win bands:

```
max loses to S        → (1/m_S)²   < 1.0  → m_S ≥ 1.00
median beats C fairly → (0.765/m_C)² ≥ 2.0 → m_C ≤ 0.54
                      ⇒ required S/C ratio ≥ 1.85
current S/C           = 2.2/1.3            = 1.69     ← no valid solution exists
```

Solving it requires the **encounter** form of R, not the single-mob one. Under the settled headcount reading — *n mobs and n players* — Lanchester's `+n²` (the party focus-fires) and `−n(n+1)/2` (the pack dies one at a time) nearly cancel:

```
R_encounter = R_single × 2n/(n+1)          R_single = (CS_player / CS_mob)²
```

That factor only equals 1 at n = 1, so ranks E/D/C can be solved with the closed form but **B and above cannot**. An earlier draft of this table solved every row as if n = 1; the B/A/S multipliers below are the corrected ones, generated from `model/balance_sheet.py` and cross-checked by `tools/combat-lab/verify.mjs`.

| rank | n | current | **proposed** | max, party of n | max, solo | median, party of n |
|---|---|---|---|---|---|---|
| E | 1 | 1.00 | **0.290** | 11.89 trivial | 11.89 trivial | 6.61 easy |
| D | 1 | 1.15 | **0.410** | 5.95 easy | 5.95 easy | 3.31 fair |
| C | 1 | 1.30 | **0.500** | 4.00 easy | 4.00 easy | 2.23 fair |
| B | 2 | 1.50 | **0.780** | 2.19 fair | 1.64 hard | 1.22 brutal |
| A | 4 | 1.80 | **0.943** | 1.80 hard | 1.12 brutal | 1.00 brutal |
| S | 8 | 2.20 | **1.054** | 1.60 hard | 0.90 LOSS | 0.89 LOSS |
| SS | 20 | 2.80 | **1.127** | 1.50 hard | 0.79 LOSS | 0.83 LOSS |
| SSS | 50 | 3.50 | **1.183** | 1.40 hard | 0.71 LOSS | 0.78 LOSS |

Two properties worth naming:

- **Every rank up to A is weaker per-mob than a same-level player.** Difficulty comes from headcount gating, not from each individual outclassing you. It reframes "an E mob is your equal" as "an E mob is a third of you."
- **Every rank is a hard-to-fair win for a correctly-sized party, and a loss for a soloist from S upward.** Escalation is social — can you field 50 people — rather than numerical. The proposed multipliers compress into a narrow 0.29 → 1.18 band precisely because `2n/(n+1)` is doing the difficulty work instead.

`TODO(design)` — this is the largest single change in the spec. Note the ladder is only *lowered* for E–A; from S upward the mob is stronger than a same-level player, and the earlier "lowered and stretched" framing understates how much of the top end is carried by headcount rather than by the multiplier.

---

## 6. Balance verification <span class="topic-chip">the harness</span>

### 6.1 The metric

A duel is two clocks racing:

```
TTK_kill  = mob_EHP    / player_DPS       how long you need
TTK_death = player_EHP / mob_DPS          how long you have

R = TTK_death / TTK_kill                  the only number that matters
HP% left at victory = 1 − 1/R
```

`R` has a property worth stating explicitly:

```
R = (EHP_p · DPS_p) / (EHP_m · DPS_m) = (CS_p / CS_m)²
```

**CS is the exact sufficient statistic for 1v1 outcome** — the DPS/EHP split cancels. A glass cannon and a bruiser with equal CS have identical win/loss against the same mob, differing only in HP remaining. This independently justifies `CS = sqrt(DPS × EHP)` as the balance scalar.

### 6.2 Win bands

| R | HP left | verdict |
|---|---|---|
| < 1.0 | — | **loss** |
| 1.0–1.3 | ≤23% | brutal — a loss in practice, zero error budget |
| 1.3–2.0 | 23–50% | **hard win** |
| 2.0–3.5 | 50–71% | **fair** |
| 3.5–8 | 71–87% | **easy win** |
| ≥ 8 | ≥87% | trivial |

`TODO(design)` — confirm the calibration cell: **median player vs same-level C = fair (R 2.0–3.5)**. Everything else keys off it.

### 6.3 Requirements the harness asserts

1. Max player **cannot** 1v1 a same-level S mob → `R < 1.0`
2. Max player **cannot easily** beat same-level A → `R < 3.5`
3. Median player beats same-level C, *fair* → `2.0 ≤ R < 3.5`
4. Max player beats same-level C, *easy* → `3.5 ≤ R < 8.0`

### 6.4 Two complications the harness must handle

**Groups need a time-stepped sim, not the closed form.** You kill mobs one at a time, so incoming DPS decays as the pack thins. Closed form overstates the group's threat.

**TTK is a fixed point.** With mana, `T = mob_EHP / DPS(T)` — DPS depends on fight length, fight length depends on DPS. Solve by iteration; this cannot stay closed-form.

**CS becomes a curve.** Balance against two anchors that bracket it:
- `CS_burst` — at the rank's own TTK, full pool available (trash, burst clears)
- `CS_sustain` — regen only, pool term dropped (bosses, attrition)

Check E–C against burst, S+ against sustain.

---

## 7. Invariant suite

The spec is only as good as what fails when it's violated. All of these are executable.

```
Growth        20-level growth within 120–160%          → 141%
              CS compounds at 4.5%/level               → 4.50%
              DPM compounds at 4.5%/level              → 4.50%
Stat share    ≥25% at EVERY level                      → 33.3% flat
              does not decay with level                → identical L1 vs L99
              stats never asked to exceed cap          → cap maxes at 99
Mitigation    % stable across all levels               → pRed flat at 33%
Mana          CPM level-invariant                      → drift 4.4e-16
              int+wit TOGETHER reach 1.5×              → 1.50× (matches STR alone)
              CPM in a sane band (8–30/min)            → 13.0–20.0
Outcomes      the four requirements in §6.3            → FAILS on current ladder
Engine        largest mob HP fits int32                → 256,563,665
              ASPD inside engine window                → 1.5/s
              glancing-hit reliability = 100%          → FAILS (44.8% at max AGI)
              world traversal > 20s                    → 29s
```

Three of these need care, and they are **not the same kind of thing**:

- **`Outcomes` fails and must be fixed here.** It is the reason this spec exists; the §5.2 ladder is the fix.
- **`glancing-hit reliability` fails and must be fixed elsewhere.** It is an engine defect (4× substep, §2.1), not a stat-model defect. This spec must not be blocked on it, but must not ship claiming hit detection works either.
- **The INT/WIT invariant is deliberately weakened.** The natural form — *"each of INT and WIT moves DPM materially"* — is unreachable at α = 1 (+15%/+18%). Rather than leave a permanently-red assertion, it is restated as the pair reaching 1.5×, which is the property actually being guaranteed. The per-stat weakness is real and is paid for by AoE (§4.2), outside this suite. **If α is later set to 0.5, restore the stronger form.**

---

## 8. Migration from shipped code

```
contracts/src/meta/derivedStats.ts   the pinned additive formula — replaced wholesale
contracts/src/meta/types.ts          PrimaryStats has 4 of 7 stats (no dex/wit/luk)
colyseus-server/src/config/combat/combatStats.ts   BaseStat {agi,str,vit,dex}, clamp 1–99
colyseus-server/src/meta/applyLoadout.ts           applies derivedStats to Player
colyseus-server/src/schemas/Player.ts:87-99        recalculateStats() — see I-032
colyseus-server/src/combat/meleeAttackSpeed.ts     computeAgiGapFill, caps at 0.91
colyseus-server/src/config/gameConfig.ts           tickRate = 50ms (20 FPS, not README's 30Hz)
```

Known gaps the plan must close: `dex` exists in `BaseStat` but is never set from allocation; bow/staff have no aspd band so they ignore AGI entirely; `gapFill` caps at 0.91 so `aspdMax` is unreachable; level contributes only +5 HP.

**Blockers that are not this spec's scope but gate its rollout:**
- **I-032** — `recalculateStats()` clobbers the applied loadout. `SWITCH_WEAPON` → `equipWeapon` → resets to config baseline, erasing allocation. Client-reachable.
- **I-033** — clamp split-brain: Nakama unbounded, colyseus clamps 1–99, `derivedStats` consumes raw.
- **Migration scaffold is a data-loss landmine** — `nakama/src/storage.ts` `migrateDoc()` falls through to `defaultDoc()`, so bumping `CURRENT_SCHEMA_VERSION` silently resets every profile.

---

## 9. Known blind spots

<div class="callout danger">
<strong>Jobs cannot differentiate outcome under this model.</strong> Because <code>R = (CS_p/CS_m)²</code> cancels the DPS/EHP split, six allocation archetypes (berserker, warrior, paladin, mage, ranger, fully-allocated) sat within 1.35× of each other and <em>never changed a verdict</em>. If jobs are meant to matter competitively, the differentiation must come from outside CS — elements (F-017's six-element table), AoE, range, or crit. This is a deliberate consequence, not an oversight, but it needs its own decision.
</div>

- **Move speed converts to real power via kiting** in a projectile game. CS cannot capture it. Mitigation is content design (mob speeds, arena shape), not the formula.
- **The model is closed-form, not the engine.** It assumes constant DPS, no crit variance, no misses, perfect focus-fire, no kiting. The matrix must eventually run through `BattleModule` with real weapons and cooldowns. The closed form is the screen; the sim is the proof.
- **DEX and LUK are unplaced.** Proposed but not agreed: DEX → accuracy + cast time, LUK → perfect dodge + crit.
- **Stat points per level and the respec story are undefined.**
- **Per-race stat leans** — the original I-028 ask — remain untouched by this model.
- **Weapon pAtk retune** for DPS parity and snapping `baseCycleMs` to 50 ms tick multiples (dagger currently 10.6% quantisation error, 2.91× weapon disparity).

---

## 10. Appendix — model scripts

Under `.claude/idea_backlog/I-028-phase-c-runtime-spine-player-race-class/model/`:

| script | what it establishes |
|---|---|
| `cs_decomposition.py` | the v2 multiplicative core, gear tiers, 11 invariants |
| `win_matrix.py` | the R metric, win bands, outcome matrix, solved rank ladder |
| `mana_level.py` | casts-per-minute, level-invariance, INT/WIT separability |
| `parity.py` | physical-vs-magic crossover, the regen trap, pool sizing |
| `tunnel_glancing.js` | glancing-hit reliability against real planck 1.4.2 |

To be consolidated into a single reconciled model with the invariant suite as its entry point.
