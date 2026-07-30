---
title: "BATTLE_ATTACK carries no damageType — the last silent physical fallback"
id: I-037
status: idea
source: "F-018 Phase 0 review — docs/superpowers/specs/2026-07-30-combat-model-split-handoff.md"
---

# BATTLE_ATTACK carries no damageType — the last silent physical fallback

## Problem

**This is correct today, and that is why it is worth a ticket rather than a fix.** Both
the mob and NPC emitters source `damage` from `pAtk`, and the omission is documented as
deliberate at `colyseus-server/src/modules/BattleManager.ts:50`.

But it is **the one remaining place a magical hit could silently become physical.** F-018
Phase 0 plumbed `damageType` through the projectile attack path so `mDef` stopped being
dead code; the `BATTLE_ATTACK` event was left out on the grounds that nothing magical
uses it. The moment a future emitter sources `mAtk` into that event, the
`?? 'physical'` default absorbs it without complaint — the default cannot distinguish
"physical on purpose" from "channel forgotten".

This gets sharper after the weapon-driven offence work (plan:
`docs/superpowers/plans/2026-07-30-combat-model-split-completion.md`). Under that formula
a blade weapon yields `mAtk` of **exactly 0**, so an emitter reading `mAtk` deals zero
damage rather than wrong-channel damage — a different and much quieter failure than
today's.

## Why now

Cheap while the F-018 damage-type plumbing is fresh and the reasoning is still written
down. It is a latent trap, not a live bug, so it is a good candidate to batch with other
combat work rather than schedule alone.

## Sketch

Two shapes, and the choice is about how loud we want the failure to be:

- **Carry the channel explicitly.** Add `damageType` to the `BATTLE_ATTACK` payload the
  way F-018 Phase 0 added it to the projectile attack path, and have every emitter state
  it. Uniform with the path that already works.
- **Make the absence unrepresentable.** Drop the `?? 'physical'` default so an event
  without a channel fails fast instead of defaulting. Louder, and it forces the decision
  at every call site rather than allowing an accidental omission.

Either way the test worth writing is the one that does not exist: an emitter that sources
`mAtk` must not produce a physical hit. Assert on the channel that reaches
`DamageCalculator`, not on the damage number — a number can coincide.

Related: closes the gap left open by I-027 (`damageType` dropped on the queue), which
F-018 otherwise resolved.
