---
title: "damageType dropped on the BattleManager queue path (magical projectiles defended with pDef)"
id: I-027
status: resolved
resolved_by: "F-018 Phase 0 (commit ac7eff7, release/1.5)"
resolved_at: 2026-07-30
---

# damageType dropped on the BattleManager queue path

> **RESOLVED by F-018 Phase 0** — `ac7eff7` *"fix: route damageType through the attack
> queue so mDef is not dead code"*, shipped on `release/1.5`. `damageType` is now an
> option on `BattleManager.createAttackMessage` and is fed from the projectile call site,
> exactly the "minimal fix" this ticket sketched. A test that fails against the old
> behaviour landed with it.
>
> `promoted_to` stays `null` in `_catalog.json` on purpose: the catalog's only lifecycle
> field is `promoted_to` (→ an `F-NNN`), and this idea was fixed inside another feature
> rather than promoted into one. That is why this frontmatter carries the outcome.
>
> **One gap deliberately left open** and refiled as **[[I-037]]**: the `BATTLE_ATTACK`
> event still carries no `damageType`. Correct today — every emitter sources `pAtk` — but
> it is the last place a magical hit could silently become physical.

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
