# I-028 Handoff — Atlas combat stat model (brainstorm complete, spec not yet written)

Written 2026-07-28. Read this instead of re-deriving. Everything below is verified,
not proposed.

## Where we are

`superpowers:brainstorming` checklist — steps 1-4 done, **step 5 (write spec) is next**.
The design is settled and numerically verified. Nothing has been written to `docs/` yet.

## Hard constraints the user set (do not re-litigate)

| Constraint | Value |
|---|---|
| Level range | **1–99** |
| Growth | **CombatScore +4.5%/level** (=141% per 20 levels, inside the 120–160% target) |
| CombatScore | `CS = sqrt(DPS × EHP)` — one scalar; everything reverse-engineers from it |
| TTK by rank | E 3-4s · D ~8s · C 12-15s · B 18-24s · A 30-60s · S 90-300s · SS 600-900s · SSS 3000-4500s |
| Tier gating | **headcount**, not power. Group sizes 1/1/1/2/4/8/20/50 for E→SSS |
| Stats | STR AGI VIT INT DEX WIT LUK, capped 1–99. Physical *and* magical crit |
| Stat share of CS | **≥25% at every level** (final requirement, 2026-07-28) |
| Mobs | per-area mob level matches player level; mob CS = player CS × rank multiplier |

## THE key design decision (v1 → v2)

**Stats MULTIPLY gear. They do not add to it.** This is structural, not tuning.

Why additive is impossible — arithmetic, not balance:
- CS must grow `1.045^98` = **74.7×** over L1→L99
- Stats capped 1–99 can grow at most **~3×**
- An additive stat share is therefore capped at `3/74.7` = **4%**, observed as 2% at L99

The v2 formulas:
```
pAtk  = (base + weapon.pAtk) × (1 + C · str/statCap(L))
mAtk  = (base + weapon.mAtk) × (1 + C · int/statCap(L))
maxHP = (base + armor.HP)    × (1 + C · vit/statCap(L))
pDef / mDef = armour only (gear), so mitigation % is allocation-independent

C = 0.5              statCap(L) = 10 + 89·(L-1)/98    (10 at L1 → 99 at L99)
```
Consequence: a character at its level's stat cap is **1.5× one with none, at EVERY level**
→ stat share is a flat **33.3%**, comfortably ≥25%. Share becomes a design constant
instead of a race against the curve.

This mirrors the `K(L)` trick already used for defence (normalise against a level-scaled
reference so the *percentage* holds while raw numbers inflate), and it is exactly the
`str → dmg × weapon → dps` shape from the user's original brief.

## Verified output (11/11 invariants pass)

Model script: **`model/cs_decomposition.py`** (next to this file). Run: `python3 cs_decomposition.py`.

Player, fully allocated warrior (70% physical, balanced defences):

| L | CS | pAtk | mAtk | maxHP | pDef | mDef | mitigation | EHP | mspd |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 55 | 9 | 8 | 100 | 5 | 5 | 33% | 149 | 21.5 |
| 50 | 472 | 81 | 65 | 864 | 43 | 43 | 33% | 1,290 | 28.1 |
| 99 | 4,082 | 697 | 560 | 7,471 | 374 | 374 | 33% | 11,151 | 34.9 |

Equipment per tier (gear supplies `CS/(1+C)`; stats multiply it):

| tier | levels | wpn pAtk | wpn mAtk | armor HP | armor pDef | armor mDef |
|---|---|---|---|---|---|---|
| E | 1-12 | 8 | 6 | 83 | 6 | 6 |
| D | 13-25 | 14 | 11 | 147 | 11 | 11 |
| C | 26-40 | 25 | 20 | 273 | 20 | 20 |
| B | 41-55 | 49 | 40 | 528 | 40 | 40 |
| **A** | **56-70** | **95** | **77** | **1,021** | **77** | **77** |
| S | 71-84 | 177 | 142 | 1,891 | 142 | 142 |
| SS | 85-95 | 313 | 251 | 3,352 | 251 | 251 |
| SSS | 96-99 | 426 | 342 | 4,561 | 342 | 342 |

Mobs (CS matched to area level × rank × group):

| rank | lv | mult | grp | mob CS | maxHP | pAtk | pDef | TTK |
|---|---|---|---|---|---|---|---|---|
| E | 6 | 1.0 | 1 | 68 | 87 | 12 | 6 | 4s |
| A | 63 | 1.8 | 4 | 1,506 | 55,146 | 257 | 138 | 45s |
| SSS | 97 | 3.5 | 50 | 13,083 | 256,563,665 | 2,235 | 1,197 | 3750s |

Build spread @L60, identical gear: unallocated 489 → all-in offence 599 → balanced 636
→ fully allocated 733 (**1.50×**).

Invariants that pass: 20-level growth in band · CS compounds at 4.5% · mitigation % flat ·
same-level TTK constant · **stat share ≥25% at every level (33.3%, flat)** · stat share
does not decay with level · stats never exceed cap · largest mob HP fits int32 · ASPD inside
engine window · mspd never tunnels · world traversal >20s.

## Move speed — outside CombatScore, deliberately

`mspd` is bounded 20–34.85, AGI-driven, and **excluded from CS**. It cannot scale: at 74.7×
it would be 1,494 units/s = 75 units/tick against a 0.5–8 unit collider, and would cross the
1000-unit world in 0.7s.

Known blind spot, stated not hidden: in a projectile game mspd *does* convert to real power
via kiting. CS won't capture that. Mitigation is content design (mob speeds, arena shape),
not the formula.

## Findings that are real bugs (independent of this design)

1. **mspd tunnelling — NEW, not yet in the backlog.** Shipped `maxMoveSpeed = 20 + 0.2·agi`
   (`contracts/src/meta/derivedStats.ts`) → 39.8 at AGI 99 → **1.99 units/tick** at the 50ms
   tick. Smallest collider pair in config is player `1.3` + projectile `0.5` = **1.8**. A
   max-AGI player can step past a projectile between ticks. Fix: coefficient `0.15` → 1.74 u/tick.
   **Capture as a new idea (`/ps-release-workflow:idea`).**
2. **I-032** — `recalculateStats()` clobbers the applied loadout. `SWITCH_WEAPON`
   (`PlayerInputHandler.ts:157`) → `equipWeapon` → `recalculateStats` resets to config
   baseline, erasing allocation. Client-reachable. Skeleton captured, spec.md empty.
3. **I-033** — clamp split-brain: Nakama unbounded, colyseus clamps 1-99, `derivedStats`
   consumes raw. Skeleton captured, spec.md empty.

## Corrections to the original I-028 spec (already committed in `research.md`, `cea5bf5`)

1. **Per-entity element ALREADY exists** — `WorldLife.ts:41` is a synced field, consumed by
   `DamageCalculator`, set by `Mob`. Player never sets it. Demon/Void + Immortal/Holy are a
   one-line binding, not new design. Lean audit is **2 blocked, not 4**.
2. **Migration scaffold is a data-loss landmine** — `nakama/src/storage.ts` `migrateDoc()`
   falls through to `defaultDoc()`, so bumping `CURRENT_SCHEMA_VERSION` to 2 silently resets
   every profile.
3. **Zod guards the wire, not stored docs** — `profileDocSchema` is test-only; real
   enforcement is `loadoutSnapshotSchema.safeParse` in `NakamaMetaBackend.ts:56`. A shape
   mismatch → `getLoadout` returns null → every player joins `isEphemeral`.

## Reference: existing code the design must replace

```
contracts/src/meta/derivedStats.ts        <- the PINNED additive formula (v1)
  maxHealth    = 100 + 10*vit + 5*(level-1)
  pAtk         = 10 + 2*str + weapon.pAtk
  mAtk         = 10 + 2*int + weapon.mAtk
  pDef         = 5 + vit ;  mDef = 5 + int
  maxMoveSpeed = 20 + 0.2*agi

contracts/src/meta/types.ts               PrimaryStats = {str,agi,int,vit}  (no dex/wit/luk yet)
colyseus-server/src/config/combat/combatStats.ts   BaseStat = {agi,str,vit,dex}, clamp 1-99
colyseus-server/src/meta/applyLoadout.ts           applies derivedStats to Player
colyseus-server/src/schemas/Player.ts:87-99        recalculateStats() — see I-032
colyseus-server/src/combat/meleeAttackSpeed.ts     computeAgiGapFill, caps at 0.91
colyseus-server/src/config/gameConfig.ts           tickRate = 50ms (20 FPS, NOT the 30Hz in README)
```

Known gaps in current code, for the spec's migration section: `PrimaryStats` has only 4 of the
7 stats; `dex` exists in `BaseStat` but is never set from allocation; bow/staff have no aspd
band so they ignore AGI entirely; `gapFill` caps at 0.91 so `aspdMax` is unreachable; level
contributes only +5 HP.

## Next actions, in order

1. `/ps-release-workflow:idea "maxMoveSpeed 0.2/agi tunnels past projectiles at 50ms tick"`
2. Write the design spec. **Do NOT write into the main working tree** — the ps-release-workflow
   PreToolUse guard blocks Edit/Write there (it keys off filesystem location, not branch).
   Write via this worktree: `.claude/worktrees/_release/`. Per the routing convention, if
   claimed as a feature the spec goes to `.claude/refined_backlog/<F-NNN>/spec.md`; otherwise
   `docs/superpowers/specs/2026-07-28-combat-stat-model-design.md`. Confirm the path with the
   user before writing.
3. Spec self-review (placeholders / contradictions / scope / ambiguity), then user review.
4. Only then `superpowers:writing-plans`.

Note: writing any `.md` under `docs/superpowers/specs/` triggers the render-spec hook, which
pandoc-renders it to HTML and opens Chrome. Expected, not an error.

## Open questions the spec must answer

- Where do DEX / WIT / LUK plug in? (DEX→accuracy + cast time, WIT→magic accuracy/mDef,
  LUK→perfect dodge + crit — proposed, not yet agreed)
- Stat points per level, and the respec story
- Per-race stat leans — the original I-028 ask, still untouched by this model
- Whether `C = 0.5` is final (33.3% share) or should rise
- Weapon pAtk retune for DPS parity, and snapping `baseCycleMs` to 50ms tick multiples
  (dagger currently 10.6% quantisation error, 2.91× weapon disparity)
