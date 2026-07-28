---
title: "Activate the element system: give shipped content non-neutral elements (war-scar mobs as Void-line) — built in F-017 but currently 100% inert"
id: I-029
status: idea
---

# Activate the element system — it is fully built and entirely unused

## Problem

F-017 shipped a complete 6-element RO-style advantage system: `Element` type, the 7×7
table, and `getElementMultiplier()` in `colyseus-server/src/config/combat/elements.ts`,
threaded through `WeaponConfig`, `AttackDefinition`, `Projectile`, and
`DamageCalculator.calculate`.

**Nothing uses it.** Verified by grep across all `*.ts` / `*.json` / `*.yaml` outside
tests and docs: there is **not one non-neutral `element:` assignment** in shipped
content or config. Every entity defaults to `neutral`, and `neutral` is `×1.0` against
everything — so the entire system is a no-op at runtime.

This was deliberate in F-017 (it preserved the "no shipped damage number changes"
guarantee), but it means the feature is currently dead weight: tested, documented,
canon-backed, and invisible to players.

## Why now

- Handoff §10 names it the **#3 next move**, with the canon-supported starting point
  already identified: **war-scar monsters as the Void line**.
- The lore is already written — `content/story/canon.md` §5 describes the elements in
  prose, and 4 lore fragments on thread `the-warded-world` are live. Content is ahead
  of gameplay.
- Dead-but-shipped systems rot: as long as no content exercises the table, regressions
  in `getElementMultiplier` are only caught by unit tests, never by play.

## Sketch

(rough shape; not a design yet)

1. Pick the first element-carrying cohort. Canon points at **war-scar mobs → Void**;
   Holy is the opposed pair and has no natural mob home yet.
2. Assign `element` to those mob definitions and to any weapon/attack that should
   counter them.
3. Balance pass — advantage is **×2.0** and disadvantage **×0.5**, applied *after*
   defense reduction, so an elemental mob is a genuine 2× swing in both directions.
   Existing encounter tuning assumed ×1.0 everywhere.
4. Player-facing legibility: a player who cannot *see* an element cannot play around it.
   Needs at least a client hint (icon/tint) or the ×2.0 reads as random damage variance.

## Constraints inherited from F-017 (do not rediscover these)

- **Element-effect tests must use `Mob` targets.** `Player` and `NPC` never seed an
  element — only `Mob` does.
- These damage paths carry **no** element by design: zone effects, DOT ticks,
  `processDamageAction`, the strategy-less `BATTLE_ATTACK` fallback, and **all NPC
  attacks** (NPCs get a bare `MeleeAttackStrategy` with no `AttackDefinition`).
  Giving an NPC an element will silently do nothing until that path is changed.
- `WorldLife.element` is validated with `isElement` at construction — a bad id would
  otherwise replicate `NaN` damage to clients. Keep that guard.
- **Prose may name an element, never a multiplier** — `content/story/style.md` rule
  "elements are texture, not a physics lecture".

## Related

- Handoff: `docs/superpowers/decisions/2026-07-27-world-wisdom-handoff.md` §3, §10
- [[I-027]] — `damageType` is dropped on the queue path, so magical projectiles are
  defended with `pDef`. Because the element multiplier applies *after* defense, the
  first elemental magic weapon **compounds** that error. Strong argument for landing
  I-027 first.
