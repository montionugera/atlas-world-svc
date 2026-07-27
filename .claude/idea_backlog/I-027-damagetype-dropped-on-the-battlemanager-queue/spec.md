---
title: "damageType dropped on the BattleManager queue path (magical projectiles defended with pDef)"
id: I-027
status: idea
---

# damageType dropped on the BattleManager queue path

## Problem

`BattleManager.createAttackMessage` builds the `AttackActionPayload` for the queued
attack path but has **no `damageType` option**. `BattleModule.processAttack` therefore
falls back to `'physical'` for every attack that arrives through the queue, so
`DamageCalculator` subtracts `pDef` instead of `mDef`.

In real rooms, projectiles are the primary damage path and they route through the
queue — so **every magical projectile is currently defended with the wrong stat**.
The direct (unthrottled) fallback branch in `ProjectileCollisionResolver` does it
correctly, which is why the two paths disagree.

This is **pre-existing**, not introduced by F-017. It was found by the adversarial
reviewer during F-017 Task 4 (element threading) and deliberately left out of that
diff to preserve F-017's behaviour-preservation guarantee (no shipped damage number
changed).

## Why now

F-017 landed the element system. Elements multiply damage **after** defense
reduction, so the first elemental *magic* weapon will have its multiplier applied on
top of the wrong defense stat — the error compounds instead of staying latent.
`Projectile.damageType` already exists and carries the right value; it is simply
not forwarded.

## Sketch

Minimal fix: add a `damageType` option to `BattleManager.createAttackMessage` (it is
already a single options object after F-017) and feed it from `projectile.damageType`
at the projectile call site, exactly the way `element` is now fed.

Note this **will change live damage numbers** for magical projectiles — that is the
point of the fix, but it means the change needs its own before/after test evidence
and cannot claim behaviour preservation.

## Open questions (answer in refine)

- Do any current mob/weapon configs actually produce `damageType: 'magical'` on a
  projectile today, or is the bug currently dormant? (Determines blast radius.)
- Should `mDef`/`pDef` selection move into the projectile stamp (like `element`) so
  both branches read one source, rather than being re-derived per branch?
- Are there balance tests pinning magical-projectile numbers that would need
  re-baselining?

## Related

- F-017 World Wisdom (element system) — `docs/superpowers/specs/2026-07-27-world-wisdom-design.md`
- `colyseus-server/src/modules/BattleManager.ts` (`createAttackMessage`)
- `colyseus-server/src/modules/BattleModule.ts` (`processAttack` damageType fallback)
- `colyseus-server/src/modules/projectile/ProjectileCollisionResolver.ts` (the branch that gets it right)
