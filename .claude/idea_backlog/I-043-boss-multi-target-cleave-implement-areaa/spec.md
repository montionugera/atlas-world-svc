---
title: "Boss multi-target cleave — implement AreaAttackStrategy"
id: I-043
status: idea
source: "F-023 deferred scope (docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md §7)"
---

# Boss multi-target cleave — implement AreaAttackStrategy

## Problem

`AttackCharacteristicType.AREA` is **declared in the type system but never built**.
`src/config/attackStrategyFactory.ts:102-104` is a `TODO: Create AreaAttackStrategy`
followed by a `console.warn` — so any mob type authored with an AREA attack silently
gets no strategy at all.

This is why the lane-D brief's claim that cleave was "much cheaper; no new state" was
wrong, and why F-023 chose the threat table instead.

## Blocked behind an F-017 bug

`src/modules/MobLifeCycleManager.ts:250` documents the trap: when no strategies are
created, the fallback `MeleeAttackStrategy` is constructed **without an
AttackDefinition**, so its attacks are always neutral. An AREA-only mob type would
therefore silently lose its configured `element`. Passing the definition through also
moves existing wind-up numbers, because the `attack` option sets the ASPD timing bands
as well.

So implementing cleave requires fixing that fallback in the same change.

## Why it still matters after F-023

F-023 gives bosses a threat table, which concentrates damage on the tank by design.
Cleave is the complementary half: an AoE component spreads chip damage across the party
while single-target stays on whoever holds aggro. That is how real MMO bosses work, and
it is what would make the balance model's party-size branch meaningful again.

Related: [[I-044]] is the arithmetic half of the same gap.
