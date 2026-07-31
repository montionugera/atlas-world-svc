---
title: "BattleActionMessage is typed any at the queue boundary — make it a discriminated union on actionKey"
id: I-041
status: idea
source: "I-037 audit — docs/superpowers/specs/2026-07-31-battle-attack-damagetype-design.md §5"
---

# BattleActionMessage is typed any at the queue boundary

## Problem

`BattleActionMessage.actionPayload` is typed **`any`**
(`colyseus-server/src/modules/BattleActionMessage.ts:11`), and `BattleModule.processAction`
recovers the shape with five unchecked casts (`BattleModule.ts:393, 397, 400, 406, 413`):

```ts
case 'attack':
  return this.handleAttackMessage(actor, target, message.actionPayload as AttackActionPayload)
```

**Types are erased at exactly the point where the battle queue hands work back to the
resolver.** Nothing checks that an `actionKey: 'attack'` message actually carries an
`AttackActionPayload`, nor that its required fields are present.

This is not bookkeeping. I-037 makes `AttackActionPayload.damageType` and `.element`
**required**, so no emitter can silently forget to state the damage channel. That guarantee
is compile-time only, and this `any` is the one place it does not hold: a hand-constructed
message reaches `processAttack` with the fields missing and TypeScript never objects.
I-037 therefore has to carry a runtime guard that logs an error, purely to cover this gap.

## Why now

I-037 documents the gap and works around it. The workaround is honest, but it is a
workaround — and while the reasoning is written down is the cheap moment to remove the
cause. Fixing this also retires the guard I-037 adds, so the two changes together are close
to net-neutral in line count.

## Sketch

Make `BattleActionMessage` a discriminated union on `actionKey`:

```ts
export type BattleActionMessage =
  | { actionKey: 'attack';  actionPayload: AttackActionPayload;  ... }
  | { actionKey: 'heal';    actionPayload: HealActionPayload;    ... }
  | { actionKey: 'kill';    actionPayload: KillActionPayload;    ... }
  | { actionKey: 'respawn'; actionPayload: RespawnActionPayload; ... }
  | { actionKey: 'damage';  actionPayload: DamageActionPayload;  ... }
```

The `switch (message.actionKey)` in `processAction` then narrows automatically, and all five
`as` casts delete themselves.

**Blast radius to price before starting:** the union touches the heal / kill / respawn /
damage paths, not just attack — `BattleActionQueue`'s generic `messages` array and its
filter helpers, all five `createXMessage` factories, and any test building a message by
hand. The factories already return correctly-shaped objects, so most of the work is type
plumbing rather than logic.

**Do this after I-037 lands**, not alongside it: I-037's diff is already dominated by ~21
mechanical call-site updates, and stacking a second sweeping type change on top makes both
unreviewable.

Related: I-037 (the required-channel work that exposed this), I-042 (the other structural
finding from the same audit).
