---
title: "Combat model — the physical/magical split (F-018)"
id: F-018
from_idea: I-028
date: 2026-07-30
status: design agreed, implementation scoped
extends: docs/superpowers/specs/2026-07-30-combat-stat-model-design.md
---

# Combat model — the physical/magical split

The [foundation spec](2026-07-30-combat-stat-model-design.md) settled the balance
model with **one `atk`, one `def`, one `hp`**. The shipped game has `pAtk`/`mAtk`,
`pDef`/`mDef`, four primary stats, and a live 6-element table from F-017.

This spec extends the model to carry that split, and scopes the first slice of
implementation. **The design decision was to bend the model, not the game** — F-017
shipped the element system and it stays.

<div class="callout info">

**The one-line summary.** Physical-vs-magical is a **direction inside** the existing
magnitudes, never a new magnitude. `str`-vs-`int` is a direction inside `atkBudget`;
`pDef`-vs-`mDef` is a direction inside `defEff`. That is why `half` stays a square
root, `baseDef = 49` needs no recalibration, `CombatScore` keeps exactly three
factors, and **the mob solver is byte-identical**.

</div>

---

## 1. Provenance — read this before trusting a number

Every figure here was produced by a multi-agent design panel: three independent
split-aware designs, each required to prove exact reduction to the current model,
then adversarially judged with the algebra re-derived rather than taken on trust.

<div class="callout warn">

**Two numbers in the first round were wrong and are corrected here.** The first
judgement ran on a truncated input (2 of 3 candidates) and reported rank B breaking
at `Q = 0.957`. Re-measured against the live model: **B breaks below `Q = 0.609`**,
and `Q` is **trinary**. The third candidate also caught a **sign pathology** in the
winning design's `theta`. Neither error changed the chosen direction, but both
changed the numbers — which is the argument for the adversarial pass, not against it.

</div>

Model name: **Mix-Normalised Effective-Ratio**.

---

## 2. The reduction requirement — what makes this safe

The extension **must collapse exactly to the current model** when
`pAtk = mAtk`, `pDef = mDef` and `element = neutral`. That is not elegance, it is
what preserves the settled calibration.

```
measured: max relative deviation of R over all 8 ranks = 0.00e+0   (exact, not 1e-15)
```

Every pinned expectation in `verify.mjs` — `EXPECT_LADDER`, `EXPECT_SWINGS`,
`EXPECT_SUSTAIN`, `EXPECT_TTK`, `EXPECT_REQ`, `EXPECT_CURVE`, `EXPECT_DEMAND` — is
**by definition the `Q = 1` number** and must not move by a digit.

---

## 3. New inputs

### Two globals (sliders beside `durabilityHp`)

| input | symbol | range | default | what it sets |
| --- | --- | --- | --- | --- |
| `postureMix` | `rhoBar` | (0,1) | 0.5 | The reference offence mix `defEff` and CS are quoted against. **Global, not per-entity** — this is what keeps CS comparable across entities. |
| `elemWeight` | `eta` | [0,1] | 1.0 | Element damper, `e -> e^eta`. `1` is the shipped table; `0` disables elements and reduces to today's model. |

Both are read-only-in-outcome in the same sense as `durabilityHp`: moving them
changes how numbers **read**, never who wins.

### Four per-entity authored tags (player spec *and* mob rank)

All dimensionless, level-free, defaulting to the reduction point.

| tag | range | default | meaning |
| --- | --- | --- | --- |
| `rho` | [0,1] | 0.5 | Physical share of this entity's damage **over a fight** |
| `theta` | **signed** | 0 | Offence purity. `> 0` favours physical, `< 0` favours magical |
| `slant` | **signed** | 0 | Defence lopsidedness. `> 0` favours `pDef` |
| `element` | 7 shipped values | `neutral` | Attack/defence element |

```
clamps, enforced at authoring time and asserted in verify.mjs:
  theta in [ -1/(1-rho), +1/rho ]        so xp >= 0 and xm >= 0
  slant in ( -1/rhoBar, +1/(1-rhoBar) )  so qp > 0  and qm > 0
  author inside |theta| <= 1 and |slant| <= 0.5
```

<div class="callout danger">

**`theta` and `slant` must be SIGNED.** The winning design wrote `theta` unsigned;
at `rho = 0, theta = -1` (a pure caster) it produced `pAtk = 180 / mAtk = 100`
instead of `0 / 100`. The signed form is the fix. The `|slant| <= 0.5` upper clamp
additionally stops the divisive model from diverging from the shipped **subtractive**
mitigation, which floors at 20% of base damage.

</div>

---

## 4. Unchanged core — copy verbatim, do not retype

```js
grow(L)   = growth^(L-1)                      // index.html:419
refHp(L)  = baseHp * grow(L)                  // index.html:431
{alloc a, gearScale gs, off, lean} = resolve(spec)   // index.html:464
atkBudget = (1 + 2*C*a*off)     * (gs*2*lean)        // index.html:500
defBudget = (1 + 2*C*a*(1-off)) * (gs*2*(1-lean))    // index.html:501
half      = Math.sqrt(defBudget)              // index.html:502  <-- STAYS sqrt
```

### Effective stats — three slots, three factors, `cbrt` intact

```js
atkEff = baseAtk * grow(L) * atkBudget   // numerically identical to today's `atk`
defEff = baseDef * grow(L) * half        // numerically identical to today's `def`
hp     = refHp(L)          * half        // unchanged
cs     = Math.cbrt(atkEff * defEff * hp) // index.html:511 unchanged
```

**Architectural rule, state it on the page:** `pDef`/`mDef` is a direction inside the
single `defEff` magnitude, **never a third durability slot**. A three-way defensive
split would force `pow(defBudget, 1/3)`, move every `def` and `hp` number, and
invalidate the `baseDef = 49` calibration.

---

## 5. Shape coordinates — the split at constant magnitude

```js
xp = 1 + theta*(1 - rho)      xm = 1 - theta*rho
qp = 1 - slant*(1 - rhoBar)   qm = 1 + slant*rhoBar     // rhoBar is GLOBAL

// two exact identities — these are what make aggregation exact, not approximate
rho*xp + (1-rho)*xm       === 1     for all theta, rho
rhoBar*qp + (1-rhoBar)*qm === 1     for all slant

// FORWARD (model -> the four displayed stats)
pAtk = atkEff * xp      mAtk = atkEff * xm
pDef = defEff / qp      mDef = defEff / qm

// INVERSE (four stats -> model), exact and closed form
atkEff = rho*pAtk + (1-rho)*mAtk                    // share-weighted ARITHMETIC
defEff = 1 / ( rhoBar/pDef + (1-rhoBar)/mDef )      // HARMONIC at the global posture
```

<div class="callout warn">

**Why these two means, and why not geometric.** Damage over a fight is a **sum** of
hits, and `1/def` enters that sum linearly. Arithmetic-on-attack + harmonic-on-defence
is the unique pairing under which the aggregate **is** the stat that produces the
damage. A geometric blend was tried and rejected: it lets a build push tilt and gain
up to **2.57×** damage at constant CS — an unbounded free lunch, measured against the
shipped `magic_staff` 6.59× tilt. Leave a comment at both aggregates; both look
"tidier" as geometric means and both break if changed.

</div>

---

## 6. Damage — element OUTSIDE the mix sum

```js
e(A,D) = Math.pow(getElementMultiplier(A.element, D.element), eta)

dmgRatio(A,D) = ( A.rho * (A.pAtk / D.pDef)
                + (1 - A.rho) * (A.mAtk / D.mDef) ) * e(A,D)

hit(att, dfn, Ldef) = P.k * refHp(Ldef) * dmgRatio(att, dfn)   // replaces index.html:739
```

The signature is unchanged — three args, one number — so `verify.mjs:50 check()`,
`verify.mjs:361`, `hitsToKill`, `hitsToDie`, `ttk` and the whole sustain economy are
**not edited at all**.

<div class="callout danger">

**The element multiplies the WHOLE hit, not the magic term.** This is a correction to
the winning design and it is not a preference: `DamageCalculator.ts:36-40` applies
`getElementMultiplier` to `afterDefense` **regardless of `damageType`**, and canon
states physical weapons can be endowed with elements via coatings/magic stones
(`WeaponConfig.element` is optional on *every* weapon, not just staves). Magic-only
placement reports **2.000** where the shipped code reports **4.000**.

</div>

---

## 7. The matchup factor — the whole extension in one scalar

```js
m(A,D) = ( A.rho * xp_A * qp_D  +  (1 - A.rho) * xm_A * qm_D ) * e(A,D)

// factorisation identity, verified to 1e-12
dmgRatio(A,D) === ( atkEff_A / defEff_D ) * m(A,D)
```

`m` is 0-homogeneous in both magnitudes, level-free and budget-free — a pure function
of the two shapes and one table cell. It equals 1 on **two whole families**:

1. **Defender flat** (`slant_D = 0`) and `e = 1` → `m = 1` for **any** attacker
   `rho`, `theta`. *This is the no-free-lunch guarantee.* Verified at five
   `(rho,theta)` points spanning `pAtk/mAtk` from `0/100` to `145/85`: ratio
   `1.000000` in all five.
2. **Attacker flat** (`theta_A = 0`, `rho_A = rhoBar`) and `e = 1` → `m = 1` for any
   defender `slant`.

So `m` departs from 1 only when a **lopsided defender** meets a **mix-mismatched
attacker**, or when an element cell is not 1. That is the entire design surface.

### R — same shape, one extra factor

```js
Q(p,m) = m(p,m) / m(m,p)
R      = R_ref * Q(p,m)      // R_ref is index.html:752 verbatim
```

The pack factor `2n/(n+1)` and the boss `n²` apply **outside** `Q`, so `Q` cancels in
`R(n)/R(1)` and the "encounter size applies `2n/(n+1)` and nothing else" gate is
unaffected.

<div class="callout warn">

**CS is no longer a sufficient statistic.** `Q` genuinely cannot be folded into CS —
no 1-homogeneous aggregate absorbs a cross term. Anyone reading CS as "strength"
mis-ranks matchups by up to 4×. The mitigation is editorial, not mathematical:
**display `Q` as its own column everywhere R appears**, and add "at `Q = 1`" to every
headline claim.

</div>

---

## 8. The mob solver — literally unchanged

`index.html:548-600` stays **byte-identical**, including `C = baseDef/(k*baseAtk)`.

Why it survives at zero cost: the solve is against the **reference player**, which we
now *define* as `rho = rhoBar, theta = 0, slant = 0, element = neutral`. Family (ii)
above gives `m = 1` in one direction and family (i) gives `m = 1` in the other, so
`Q === 1` by construction and the four tags never enter the solve.

**Ladder reading — S-NEUTRAL (the chosen option).** The authored `r` is the
**element-neutral** R. `Q` is reported as an explicit auditable column beside R,
**never baked into the solve**. The alternative (`r_solve = r / Q` fed into the
untouched closed form) is documented as available but not the default; it was
verified exactly closed form, with `S/SS/SSS` sustain pinned at 53.33% / 82.22% /
93.39% under it.

<div class="callout danger">

**Hard rule, put it in a comment in `rankMults()`.** *Never solve `theta` or `slant`
FROM two per-channel `r` targets.* One free parameter against two targets is
overdetermined, has no exact solution, and forces least-squares or root-finding. The
shape tags are **authored**; everything else is **solved**. Never the reverse. This is
the failure mode a future contributor is most likely to walk into, because it sounds
like a feature ("let the solver figure out the mob's resistances").

</div>

---

## 9. The element numbers — measured, not estimated

`Q_element = (e(p,m) / e(m,p))^eta`. At `eta = 1`, over all **49 ordered pairs** of the
shipped table, this takes **exactly three values**:

| `Q` | ordered pairs | which |
| --- | --- | --- |
| **0.25** | 4 | earth→fire, water→wind, wind→earth, fire→water |
| **1.00** | 41 (84%) | everything else |
| **4.00** | 4 | earth→wind, water→fire, wind→water, fire→earth |

There is no intermediate value. **The table is trinary.**

<div class="callout warn">

**Correcting the brief.** `holy`↔`void` is **mutual 2.0**, so `Q = 1` and **R is
exactly unchanged** — it is a pure *pacing* lever (both clocks halve). Same-element is
mutual 0.5, also `Q = 1` (both clocks double). Neutral is inert in both directions.
The **only** thing that moves R is the one-directional cycle
`water > fire > earth > wind > water`. "Holy↔Void up to 2.0× is the enormous balance
event" is exactly backwards.

</div>

### Real safety margins — at band-worst level, which is what gate 5e evaluates

| rank | worst R | at | breaks at `Q <` |
| --- | --- | --- | --- |
| E | 11.890 | L2 n1 | 0.084 |
| D | 5.950 | L24 n1 | 0.168 |
| C | 4.000 | L32 n1 | 0.250 |
| **B** | **1.643** | L46 n1 | **0.609** |
| A | 1.125 | L67 n1 | 0.889 *(gate 5e exempts A)* |
| S | 1.600 | L77 n8 | 0.625 |
| SS | 1.500 | L90 n20 | 0.667 |
| SSS | 1.400 | L97 n50 | 0.714 |

At `Q = 0.25` — the only adverse value the table can produce — ranks **C, B, S, SS and
SSS all fall below R = 1** (1.00, 0.41, 0.40, 0.37, 0.35).

### The resolution: a content gate, not a recalibration

Because 84% of the table is already `Q = 1` and the hazard is **8 ordered pairs**:

> **G-ELEM** — no encounter may place the player on the cycle-**disadvantaged** side of
> a boss of its own rank. Cycle advantage is reserved for trash/farm content, where 4×
> is a reward rather than a difficulty inversion. `holy`↔`void` and same-element are
> R-safe everywhere and are the correct tools for flavour and pacing.

`eta` stays as the emergency damper (`eta = 0.5` reads 2.0 as 1.41 and caps the cycle
span at 4× instead of 16×).

<div class="callout danger">

**Today no weapon in `weapons.ts` and no mob config sets `element`**, so `Q = 1`
everywhere in the live game. Neutral's inertness is the *only* thing holding this.
Adding one config field can move end-to-end difficulty by **16×** with nothing on the
page and no assertion turning red. G-ELEM must be machine-checked, not documented.

</div>

---

## 10. Blocker — the split does not currently execute

<div class="callout danger">

**`mDef` is dead code in a live room.** Verified end to end: player projectiles *do*
carry `damageType` (`PlayerCombatSystem.ts:159/182/194` → `ProjectileManager` →
`Projectile.damageType`), but `ProjectileCollisionResolver.ts:57-70` calls
`BattleManager.createAttackMessage` **without a `damageType` field**, and
`createAttackMessage`'s opts type (`BattleManager.ts:100-124`) has no such field at
all. So `BattleModule.ts:87` evaluates `payload.damageType || 'physical'` to
`'physical'` for **every** queued hit, and `DamageCalculator.ts:28` subtracts `pDef`.

**A magic staff's `mAtk` is subtracted against `pDef` in every real fight.** Until the
payload plumbing is fixed, the split this model extends does not execute and the model
is unfalsifiable against the game.

</div>

This is [[I-027]]. It is a **prerequisite of this feature**, not scope creep: the
parity test cannot be meaningful while the magic channel does not exist at runtime.

---

## 11. `derivedStats` reconciliation — the three decisions it forces

The foundation spec named `derivedStats.ts` as the blocker. Reconciling it is not one
change but three, and each is forced:

```
shipped (PINNED):
  maxHealth = 100 + 10*vit + 5*(level-1)      pAtk = 10 + 2*str + weapon.pAtk
  mAtk      = 10 + 2*int + weapon.mAtk        pDef = 5 + vit
  mDef      = 5 + int                         maxMoveSpeed = 20 + 0.2*agi
```

**D6 — go multiplicative, drop the additive constants.** R is level-flat *only*
because every stat carries `grow(L)` as a single multiplicative factor. The constants
`10`, `5`, `100` are level-independent additive terms, so the moment the model adopts
the shipped shapes, **R stops being level-invariant no matter what the split does**.

**D7 — both defences come off `vit`.** Shipped, `int` buys `mAtk` **and** `mDef` while
`str` buys `pAtk` and nothing else — so a magic build gets its resist free off its
offence stat and a physical build pays for `pDef` out of `vit`. The model has zero
class bias *by construction*; the shipped mapping does not. Resolution follows the
architecture in §4: **`vit` is the defensive magnitude; `str`/`int` are offensive
direction only.**

**D8 — `agi` stays R-invisible, and that is now a pinned constraint.** `agi` buys move
speed and melee cadence, and the model absorbs `aspd` entirely into the rank solve, so
`agi` never reaches R. With `S` of 4 primaries R-visible, stat share is
`(S/4)*C/(1+(S/4)*C)`:

| R-visible primaries | stat share | verdict |
| --- | --- | --- |
| 4 | 33.3% | pass |
| **3** | **27.3%** | **pass — this is where we are** |
| 2 | 20.0% | **FAILS the ≥25% gate** |

At `C = 0.5`, **at most one primary may be R-invisible.** Pin it as a gate.

---

## 12. Explicitly out of scope

| item | why it is deferred |
| --- | --- |
| Subtractive-vs-divisive mitigation | `DamageCalculator.ts:32-33` is `max(1, base - min(pDef+armor, 0.8*base))` — subtractive, 80%-capped, 1-floored; the lab is divisive and uncapped. Unsolved; the `\|slant\| <= 0.5` clamp bounds the divergence but does not remove it. **Say so in the notes rather than letting readers assume the model predicts shipped damage numbers.** |
| `aspd` channelisation | Per-channel attack speed stays closed form and level-free, which is exactly what makes it dangerous — every gate stays green while a caster and a melee at equal budget quietly stop being equally strong. Own feature. |
| Race/class fields, per-race leans | [[I-034]], deferred from this slice |
| Two sources of truth for `pAtk`/`mAtk` | [[I-032]] — `Player.ts:97-98 recalculateStats` ignores `derivedStats` and re-fires on `SWITCH_WEAPON`, clobbering `applyLoadout`. Makes any model-to-code calibration unreproducible; must be fixed but is its own bug. |
| Primary-stat clamp split-brain | [[I-033]] |
| Mana, healers, potions, rest, aggro, gear tiers | Unbuilt systems the foundation spec describes; a multi-release program |

---

## 13. Gates to add to `verify.mjs`

Every one pinned **independently of `combat-model.json`**, exactly as `EXPECT_SWINGS`
is. `verify.mjs`'s own history is the warning: the swings gate once compared against
`undefined` and passed vacuously with rank E set to 99.

| gate | assertion |
| --- | --- |
| G1 | `Q == 1` at default tags and neutral element — **the reduction gate** |
| G2 | **No free lunch:** `m == 1` vs a flat defender at `e == 1`, for every legal `(rho, theta)` |
| G3 | `Q` invariant to absolute level (L = 1,25,50,75,99, non-default tags **and** elements both sides) |
| G4 | `Q` invariant to magnitude (0-homogeneity, both sides independently rescaled) |
| G5 | Forward/inverse round trip exact to 1e-12 |
| G6 | `atkEff`/`defEff` reproduce `EXPECT_CURVE` cell for cell at `theta = slant = 0` |
| G7 | **Element leverage is full for every build:** `m/mixterm == e` exactly at `rho = 0,.25,.5,.75,1` — guards the magic-only regression |
| G8 | `Q_element` takes only `{0.25, 1, 4}` over the shipped table at `eta = 1` |
| G9 | **G-ELEM:** no rank crosses R = 1 at the worst legal `Q` |
| G10 | Authoring clamps hold: `xp, xm >= 0` and `qp, qm > 0` for every authored tag |
| G11 | Class symmetry: pure-physical and pure-magical at equal investment deal equal damage to a balanced defender |
| G12 | At most one primary stat is R-invisible (stat share stays ≥25%) |

**Rewrite** `index.html:830` "mirror match is an even fight" → assert
`atkEff/defEff ~ 1` **and** `m(p,p) ~ 1 at neutral element`. Every non-neutral element
is 0.5 against **itself**, so a same-element mirror is still exactly even (`Q = 1`) but
takes `2/k` hits rather than `1/k`. State both halves or the invariant reads false.

**Rewrite** the orphaned `TERMS` entries at `index.html:912-932` — they describe a
saturating `pDef/(pDef + K)` mitigation that **nothing implements**, not the shipped
`DamageCalculator` and not this model. `verify.mjs:117-134` forces every new `<th>` to
resolve, so they *will* come back into play.

**Prove three of these bite** by deliberately breaking them, per the foundation spec's
standing rule: *a gate that has never failed is not known to work.*

---

## 14. Acceptance criteria

1. `node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs` exits 0
   with **every pre-existing expectation unmoved** and the new gates green.
2. The reduction is **exact**: R deviation over all 8 ranks is 0 at default tags.
3. `docs/superpowers/specs/2026-07-30-combat-stat-model-design.md` regenerates via
   `gen_combat_spec.mjs` with `Q` present as a column and no hand-edited tables.
4. `damageType` reaches `BattleModule` — a magic hit is mitigated by `mDef`, proven by
   a test that fails against the current plumbing.
5. `derivedStats` is multiplicative, class-symmetric, and level-cancelling, with the
   pinned-formula comment updated rather than silently contradicted.
6. Three tests pass: **pack** (no coordinated focus fire), **boss** (target rotation),
   **parity** (sim TTK within ±10% of the closed form, HP left within ±5pp).
7. At least three new gates demonstrated to fail when deliberately broken.
