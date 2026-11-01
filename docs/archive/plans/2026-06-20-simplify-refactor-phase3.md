# Simplify Refactor — Phase 3: BattleModule Decomposition (Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Behavior-preserving; keep every battle test green throughout.

**Goal:** Decompose the 680-LOC `BattleModule` god object into focused collaborators it orchestrates, with NO change to its public API or behavior.

**Spec:** `docs/superpowers/specs/2026-06-20-simplify-refactor-design.md` (Phase 3)
**Branch:** `feature/phase3-battlemodule`  ·  **Working dir:** `colyseus-server`

## Hard constraint: public API is frozen

These `BattleModule` methods are called from outside and MUST keep identical signatures and behavior (they stay on `BattleModule`, delegating internally):
`processAttack`, `applyDamage`, `healEntity`, `calculateDamage`, `applyStatusEffect`, `processStatusTicks`, `respawnEntity`, `updateCombatState`, `processAction`, `getEntity`, `getAllEntities`, plus the attack-event history getters.
Consumers (do NOT touch): `ProjectileManager` (`calculateDamage`, `applyDamage`), `ZoneEffectManager` (`getEntity`, `healEntity`, `applyDamage`, `applyStatusEffect`), `GameSimulationSystem` (`updateCombatState`, `respawnEntity`), `GameRoom` (`applyStatusEffect`), `BattleManager` (`processAction`).

## Behavior anchors (the green contract)

`src/tests/char-battlemodule-damage.test.ts`, `char-battlemodule-lifecycle.test.ts`, `char-battlemodule-status.test.ts`, `char-projectile-collision.test.ts`, `battle.test.ts`, `battle-messages.test.ts`, `zone-effect*.test.ts`. MUST stay green after every step. (Phase 0 already pinned calculateDamage, applyDamage/die/respawn, status apply/resist/DOT — that is the safety net this phase relies on.)

## Target design — extract 3 collaborators (new dir `src/modules/combat/`)

1. **`ProcessedEventTracker`** — owns the `processedEventsByEntityId: Map<string, Map<string, number>>` and the event-dedup logic. Public: `validate(entityId, eventId): boolean` (the current `validateEvent` body, keyed by id), `clear(entityId): void`, `cleanupExpired(nowMs?): void` (current `cleanupAllEvents`/`cleanupProcessedEvents` TTL logic). Self-contained, no deps. Uses `Date.now()` exactly as today (server-only dedup TTL — preserve the clock).

2. **`DamageCalculator`** — pure. `static calculate(baseDamage, damageType, target: WorldLife): number` containing the exact current formula (`floor(max(1, base - min(totalDef, base*0.8)))`, totalDef = (magical?mDef:pDef)+armor). No state.

3. **`StatusEffectManager`** — owns `applyStatusEffect(...)` (chance roll via `getResistance`, create/refresh `BattleStatus`) and `processStatusTicks(entity)` (DOT/HOT). Because ticks apply damage/heal (which handle death) and applyStatusEffect validates eventIds, inject dependencies via constructor:
   ```ts
   constructor(
     private tracker: ProcessedEventTracker,
     private applyDamage: (e: WorldLife, amount: number) => boolean,
     private healEntity: (e: WorldLife, amount: number) => boolean,
   ) {}
   ```
   Preserve `Math.random()` chance roll, resistance math, `Date.now()` timestamps in `BattleStatus` exactly.

`BattleModule` keeps all public methods, holds `private eventTracker`, `private statusManager`, and delegates: `calculateDamage` → `DamageCalculator.calculate`; `validateEvent` usage in `applyDamage` → `this.eventTracker.validate`; `applyStatusEffect`/`processStatusTicks` → `this.statusManager`; `respawnEntity` → `entity.respawn(x,y); this.eventTracker.clear(entity.id)`; `cleanupAllEvents` → `this.eventTracker.cleanupExpired()`.

**Note (YAGNI):** the spec listed a separate `EntityRespawner`, but post-Phase-1 `respawnEntity` is already 2 lines — extracting a class for it is over-engineering. Fold it (thin method delegating `clear` to the tracker) and note this in the report. Do NOT create EntityRespawner.

## Tasks (each: implement → tests green → commit; never amend)

### Task 1 — Extract ProcessedEventTracker
- Create `src/modules/combat/ProcessedEventTracker.ts` with the map + `validate`/`clear`/`cleanupExpired` (move the exact bodies of `validateEvent`, `cleanupProcessedEvents`, `cleanupAllEvents`). Add a focused unit test `src/tests/processed-event-tracker.test.ts` (validate returns true first time / false on repeat; clear removes; cleanupExpired drops entries older than the TTL using fake timers).
- In `BattleModule`: replace the inline map + methods with `private eventTracker = new ProcessedEventTracker()`; route `applyDamage`'s validation and `respawnEntity`'s clear and `cleanupAllEvents` through it. Remove the now-dead private methods.
- Verify: `./node_modules/.bin/jest battle char-battlemodule processed-event-tracker` + `tsc --noEmit`. Commit: `refactor: extract ProcessedEventTracker from BattleModule`

### Task 2 — Extract DamageCalculator
- Create `src/modules/combat/DamageCalculator.ts` (pure `static calculate`). Add `src/tests/damage-calculator.test.ts` mirroring the Phase 0 damage table directly against `DamageCalculator`.
- In `BattleModule.calculateDamage`, delegate to `DamageCalculator.calculate`. Keep the public method (consumers call it).
- Verify: `./node_modules/.bin/jest char-battlemodule-damage damage-calculator battle` + `tsc`. Commit: `refactor: extract DamageCalculator from BattleModule`

### Task 3 — Extract StatusEffectManager
- Create `src/modules/combat/StatusEffectManager.ts` with injected deps (tracker, applyDamage, healEntity). Move `applyStatusEffect` + `processStatusTicks` bodies verbatim, swapping `this.validateEvent` → `this.tracker.validate`, `this.applyDamage`/`this.healEntity` → the injected fns.
- In `BattleModule`: construct `this.statusManager = new StatusEffectManager(this.eventTracker, (e,a)=>this.applyDamage(e,a), (e,a)=>this.healEntity(e,a))`. Keep public `applyStatusEffect`/`processStatusTicks` delegating to it (consumers call them). `updateCombatState` delegates its `processStatusTicks(entity)` call too.
- Verify: `./node_modules/.bin/jest char-battlemodule-status zone-effect battle` + `tsc`. Commit: `refactor: extract StatusEffectManager from BattleModule`

### Task 4 — Phase 3 gate
- `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest` — tsc 0, full suite green (0 failures). Confirm `BattleModule.ts` LOC materially reduced and it no longer holds the extracted logic (only orchestration + delegation). Report before/after LOC.

## Constraints & escalation
- Behavior-preserving: zero observable change. Preserve `Date.now()` in dedup/status, `Math.random()` roll, all `console.log` output (move log lines with their code).
- Public API frozen (signatures + return types identical). Consumers untouched.
- If an extraction forces a behavior change (e.g. an injected applier subtly differs from the inline call — watch the death/`die()` path in DOT ticks), STOP and report (DONE_WITH_CONCERNS) rather than papering over.
- Commit per task; never `git commit --amend`.
