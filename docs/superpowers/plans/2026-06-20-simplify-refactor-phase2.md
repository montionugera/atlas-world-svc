# Simplify Refactor — Phase 2: Combat-Queue Dedup (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Behavior-preserving refactor; keep every combat test green throughout.

**Goal:** Remove the duplicated wind-up / attack-queue / strategy-scheduling logic shared by `MobCombatSystem` and `NPCCombatSystem` by hoisting it into the shared `BaseCombatSystem<T>`, without changing any observable behavior.

**Spec:** `docs/superpowers/specs/2026-06-20-simplify-refactor-design.md` (Phase 2)
**Branch:** `feature/phase2-combat-dedup`
**Working dir:** `colyseus-server` (run `./node_modules/.bin/jest`, `./node_modules/.bin/tsc --noEmit`)

## Current state (verified)

- `systems/BaseCombatSystem.ts` — abstract base: holds `entity: T`, a generic `canAttack()` (alive + not-stunned), `now()` (= `performance.now()`), abstract `update()`. `MobCombatSystem extends BaseCombatSystem<Mob>`, `NPCCombatSystem extends BaseCombatSystem<NPC>`.
- `systems/attackQueue.ts` — `processAttackQueue(queue, now, getExecuteTime, onExecute)` helper. **NPCCombatSystem and PlayerCombatSystem use it; MobCombatSystem hand-rolls its own queue loop** (an inconsistency to fix).
- Near-identical members across Mob/NPC combat systems: `enqueueAttacks`, `checkWindUpPhase`, `sortStrategiesByPriority`, `startWindUp`, `startAttacking`, the cooldown `canAttack` variant, and `updateAttackWithStrategies` skeleton.
- The differences (must stay overridable): **target resolution** (Mob → `gameState.players ?? gameState.npcs`; NPC → `mobs.get(id)`), the `update()` signature, and the "lost target" fallback (Mob → `'chase'`/`'wander'` strings; NPC → `BehaviorState.CHASE` + `ownerId`).
- Both `Mob` and `NPC` schemas already carry the combat fields the shared logic touches: `attackQueue`, `castStartTime`, `castDuration`, `isCasting`, `currentAttackStrategy`, `attackStrategies`, `lastCooldownState`, `baseWindDownTime`, `lastAttackTime`, `attackDelay`.

## Behavior anchors (the green contract)

`src/tests/attack-queue.test.ts` (Mob enqueue/process/casting under fake timers), `src/tests/npc-combat-system.test.ts` (NPC wind-up/execute/cancel/cooldown), plus `mob-attack-facing`, `mob-casting-heading`, `mob-death-handling`, `ai-npc-targeting`. These MUST stay green after every step.

## Target design

Introduce a `CombatantFields` interface capturing the schema fields the shared logic reads/writes, constrain the base to it, and move the shared methods up. Keep differences as abstract hooks.

```ts
// systems/CombatantFields.ts  (the schema-side contract the base depends on)
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
export interface CombatantFields {
  attackQueue: any[]
  castStartTime: number
  castDuration: number
  isCasting: boolean
  isAttacking: boolean
  attackAnimationStartTime: number
  currentAttackStrategy: AttackStrategy | null
  attackStrategies: AttackStrategy[]
  lastCooldownState: boolean
  baseWindDownTime: number
  lastAttackTime: number
  attackDelay: number
}
```

`BaseCombatSystem<T extends WorldLife & CombatantFields>` gains: `enqueueAttacks`, `checkWindUpPhase`, `sortStrategiesByPriority`, `startWindUp`, `startAttacking`, and a cooldown-aware `isOffCooldown()` (the `now - lastAttackTime >= attackDelay` check). Abstract hooks for the differences:

```ts
protected abstract resolveTarget(id: string, world: TWorld): WorldLife | undefined
protected abstract onTargetLost(): void   // Mob: behavior='wander'/'chase'; NPC: BehaviorState.CHASE + ownerId
```

`MobCombatSystem` and `NPCCombatSystem` keep their existing public `update(...)` signatures and implement the two hooks; their bodies delegate the shared steps to the base.

## Tasks

### Task 1 — Pin the shared seams with characterization tests (additive)

**Files:** `src/tests/char-combat-scheduling.test.ts` (create)

- [ ] **Step 1:** Add characterization tests that pin the behaviors about to move, for BOTH Mob and NPC, using the existing test construction patterns from `attack-queue.test.ts` and `npc-combat-system.test.ts`:
  - `sortStrategiesByPriority`: instant (castTime 0) strategies sort before non-instant; equal-cast sorts by ascending range. Assert ordering for a Mob with two mock strategies.
  - `checkWindUpPhase`: with `isCasting=true` and `castStartTime` set in the past beyond the strategy cast time, one `update()` completes the cast (executes, clears `isCasting`); before that it stays casting. (Mirror the existing fake-timer setup.)
  - `enqueueAttacks`: sets `isCasting`, `castDuration`, and the first `executionTime` correctly for both Mob and NPC (already partly covered — add whichever side is missing).
- [ ] **Step 2:** Run `./node_modules/.bin/jest char-combat-scheduling`; reconcile any assertion to ACTUAL current behavior (never change production code here).
- [ ] **Step 3:** Commit: `test: characterize Mob/NPC combat scheduling before dedup`

### Task 2 — Introduce CombatantFields and the shared base methods

**Files:** Create `src/systems/CombatantFields.ts`; modify `src/systems/BaseCombatSystem.ts`.

- [ ] **Step 1:** Create `CombatantFields.ts` as above.
- [ ] **Step 2:** In `BaseCombatSystem<T extends WorldLife & CombatantFields>`, add the shared methods by MOVING the bodies from `MobCombatSystem` (they are the more complete/explicit versions): `enqueueAttacks`, `sortStrategiesByPriority`, `startWindUp`, `startAttacking`, `checkWindUpPhase`, and `isOffCooldown()`. Use `this.now()` (performance.now) for cooldown; keep `Date.now()` for the cast/queue scheduling exactly as the current code does (the deliberate two-clock split — do NOT change it). Add the two abstract hooks `resolveTarget` and `onTargetLost`.
- [ ] **Step 3:** `./node_modules/.bin/tsc --noEmit` — the base compiles in isolation (Mob/NPC not yet refactored). Expect 0 errors (the subclasses still have their own copies; resolve any name clash by leaving subclass copies for now and naming the base methods identically so Step in Task 3 just deletes the overrides).
  - If TypeScript complains about duplicate/override mismatch, that's expected friction — proceed to Task 3 which removes the subclass copies; do them together if needed and run tests once after.
- [ ] **Step 4:** Commit: `refactor: hoist shared combat scheduling into BaseCombatSystem`

### Task 3 — Make MobCombatSystem delegate to the base

**Files:** modify `src/systems/MobCombatSystem.ts`.

- [ ] **Step 1:** Delete Mob's now-duplicated private copies of the hoisted methods; implement the two hooks (`resolveTarget` → the existing `getTargetFromGameState` logic; `onTargetLost` → set `currentBehavior='chase'/'wander'` + clear targets exactly as today). Replace Mob's hand-rolled queue loop with the base method / shared `processAttackQueue` helper so Mob and NPC use ONE queue path. Keep `update(deltaTime, gameState, roomId)` signature and its overall flow identical.
- [ ] **Step 2:** `./node_modules/.bin/jest attack-queue mob char-combat-scheduling` — all green.
- [ ] **Step 3:** Commit: `refactor: MobCombatSystem delegates scheduling to BaseCombatSystem`

### Task 4 — Make NPCCombatSystem delegate to the base

**Files:** modify `src/systems/NPCCombatSystem.ts`.

- [ ] **Step 1:** Delete NPC's duplicated copies; implement `resolveTarget` (→ `mobs.get(id)`) and `onTargetLost` (→ `BehaviorState.CHASE` + `ownerId` chase target). Keep `update(deltaTime, mobs, roomId)` signature and flow identical.
- [ ] **Step 2:** `./node_modules/.bin/jest npc-combat-system ai-npc-targeting char-combat-scheduling` — all green.
- [ ] **Step 3:** Commit: `refactor: NPCCombatSystem delegates scheduling to BaseCombatSystem`

### Task 5 — Phase 2 gate

- [ ] **Step 1:** `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest` — tsc exit 0; full suite green (0 failures; gated perf skipped). Confirm `MobCombatSystem` and `NPCCombatSystem` no longer contain duplicated copies of the hoisted methods (`grep -c "sortStrategiesByPriority" src/systems/MobCombatSystem.ts src/systems/NPCCombatSystem.ts` should show the methods now live in the base, not both subclasses).

## Constraints & escalation

- Behavior-preserving: zero observable change. The deliberate `Date.now()` (cast/queue) vs `performance.now()` (cooldown) split MUST be preserved.
- Public `update(...)` signatures on both systems are unchanged (consumers: `GameSimulationSystem`, `Mob.update`, `NPC.update`).
- If unifying a method reveals a genuine behavior difference between Mob and NPC that can't be cleanly parameterized by the two hooks, STOP and report it (DONE_WITH_CONCERNS) rather than papering over it — keep that method specialized and note it.
- Commit per task; never `git commit --amend`.
