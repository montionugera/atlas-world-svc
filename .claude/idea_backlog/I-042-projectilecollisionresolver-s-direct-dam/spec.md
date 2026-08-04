---
title: "ProjectileCollisionResolver's direct-damage branch is dead in production — delete it, make battleManager required"
id: I-042
status: idea
source: "I-037 audit — docs/superpowers/specs/2026-07-31-battle-attack-damagetype-design.md §7"
answers: "the open question raised by I-027"
---

# ProjectileCollisionResolver's direct-damage branch is dead in production

## Problem

`ProjectileCollisionResolver.handleEntityCollision` has two ways to turn a projectile hit
into damage:

- **`:57-78`** — the queue path: `BattleManager.createAttackMessage(...)` → battle queue →
  `BattleModule.processAttack` → `DamageCalculator`.
- **`:80-89`** — the `else` branch, taken when `battleManager` is undefined: calls
  `battleModule.calculateDamage(...)` and `applyDamage(...)` directly, then re-derives
  knockback impulse itself.

**The second branch cannot execute in production.** `GameRoom.ts:93-100` always constructs
a `BattleManager` and passes it to `ProjectileManager`, which passes it straight to the
resolver (`ProjectileManager.ts:35`). `GameRoom` is the only non-test construction site.
The `battleManager?` optional is left empty **only by tests**.

So this is not two implementations that need unifying — it is one live path plus a **shadow
copy of the damage pipeline that exists only to be tested against**. Two tests
(`damage-type-routing.test.ts:133` and `:144`) assert the behaviour of code production
cannot reach, which is worse than untested code: it reads as coverage while proving
nothing about the shipped path.

Concrete cost today: the projectile → damage field mapping is written twice
(`damage → baseDamage`, `damageType → damageType`, `element → attackElement`). A fourth
field on `Projectile` must be remembered in two places, and only one of them affects
players.

## Why now

I-027 asked whether `mDef`/`pDef` selection should be unified so both branches read one
source. On that narrow question the code already complies — both branches read
`projectile.damageType`. The I-037 audit found the question was aimed at the wrong target:
the duplication that matters is **the branch itself**, not the field it reads.

That answer is written down now (I-037 spec §7). Filing it means the next person does not
re-derive it — as I-027 caused this time.

## Sketch

1. Delete the `else` branch at `:80-89`.
2. Make `battleManager` **required** on `ProjectileCollisionResolver` and on
   `ProjectileManager` — the optionality is what made the dead branch representable.
3. Rewrite the two tests onto the queue path. Both already have a queue-path sibling
   immediately above them in the same file, so the shape to copy is right there.

**Check before deleting, not after:** confirm no other caller constructs `ProjectileManager`
without a `BattleManager` (today `GameRoom.ts:97` is the only production site, but verify
against the tree at implementation time rather than trusting this note). Extracting a shared
mapper instead would treat the symptom — the branch is the defect.

Related: I-037 (the audit that found this), I-027 (the question this answers), I-041 (the
other structural finding from the same audit).
