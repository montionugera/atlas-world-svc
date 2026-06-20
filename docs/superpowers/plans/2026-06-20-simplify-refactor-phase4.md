# Simplify Refactor — Phase 4: ProjectileManager Decomposition (Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Behavior-preserving; keep every projectile test green throughout. This is the highest-risk extraction (deflection reflection math) — move code VERBATIM.

**Goal:** Split the 520-LOC `ProjectileManager` into focused collaborators it orchestrates, with NO change to its public API or behavior.

**Spec:** `docs/superpowers/specs/2026-06-20-simplify-refactor-design.md` (Phase 4)
**Branch:** `feature/phase4-projectile`  ·  **Working dir:** `colyseus-server`

## Hard constraint: public API frozen

These `ProjectileManager` methods are called from outside and MUST keep identical signatures/behavior (stay on `ProjectileManager`, delegating internally):
`createMelee`, `createSpear`, `updateProjectiles`, `checkDeflection`, `handleEntityCollision`, `handleBoundaryCollision`, `handleProjectileCollision`.
Consumers (do NOT touch): `MeleeAttackStrategy`/`SpearThrowAttackStrategy`/`DoubleAttackStrategy` (`createMelee`/`createSpear`), `PlayerCombatSystem` (`createMelee`/`createSpear`), `GameSimulationSystem` (`updateProjectiles`, `checkDeflection`), `RoomEventHandler` (`handleEntityCollision`, `handleBoundaryCollision`, `handleProjectileCollision`).

## Behavior anchors (the green contract)

`src/tests/char-projectile-collision.test.ts`, `projectile-system.test.ts`, `projectile-collision.test.ts`, `projectile-deflection.test.ts`, `projectile-aiming.test.ts`, `projectile-impulse.test.ts`, `projectile-interactions.test.ts`, `projectile-type-verification.test.ts`. ALL must stay green after every step. The deflection reflection math is the riskiest code in the repo — `projectile-deflection.test.ts` is the key anchor.

## Target design — 3 collaborators in new dir `src/modules/projectile/`

1. **`ProjectileFactory`** — `createMelee(...)` and `createSpear(...)`, moved VERBATIM (spawn math, velocity, piercing default, ID generation via `gameState.tick`). Holds a `gameState` ref for `tick`/ID. No other deps.

2. **`DeflectionResolver`** — `checkDeflection(projectile, attacker): boolean` (the ~115-line reflection + recoil method, moved VERBATIM — dot-product reflection, range/cone checks, damage/range multipliers, ownerId/teamId reassignment, recoil impulse emit) plus the private `resolveDeflectorWeaponType(attacker)` helper. Deps: `gameState` (for owner lookup + roomId), `eventBus` (recoil emit). Uses `PROJECTILE_INTERACTIONS`/config exactly as today.

3. **`ProjectileCollisionResolver`** — `handleEntityCollision`, `handleProjectileCollision`, `handleBoundaryCollision`, and the private `applyClashKnockback`, moved VERBATIM. Deps: `gameState`, `battleModule`, `battleManager?`, `eventBus`, and the `DeflectionResolver` (because `handleEntityCollision` calls `checkDeflection`). Preserve the queue-vs-legacy damage routing, piercing/stick logic, team/owner filters, and all `console.log`/`try-catch` emit lines.

`ProjectileManager` keeps `updateProjectiles` (the physics-step loop — small, stays) and all public methods delegating to the collaborators. Constructor wiring:
```ts
this.factory = new ProjectileFactory(gameState)
this.deflectionResolver = new DeflectionResolver(gameState)
this.collisionResolver = new ProjectileCollisionResolver(gameState, battleModule, battleManager, this.deflectionResolver)
```
Delegation: `createMelee/createSpear` → `factory`; `checkDeflection` → `deflectionResolver`; `handleEntityCollision/handleProjectileCollision/handleBoundaryCollision` → `collisionResolver`.

## Tasks (each: implement → tests green → commit; never amend)

### Task 1 — Extract ProjectileFactory
- Create `src/modules/projectile/ProjectileFactory.ts`; MOVE `createMelee`/`createSpear` bodies verbatim. In `ProjectileManager`, replace the bodies with delegation (keep the public methods + signatures).
- Verify: `./node_modules/.bin/jest projectile-system projectile-aiming projectile-type-verification char-projectile-collision` + `tsc --noEmit`. Commit: `refactor: extract ProjectileFactory from ProjectileManager`

### Task 2 — Extract DeflectionResolver
- Create `src/modules/projectile/DeflectionResolver.ts`; MOVE `checkDeflection` + `resolveDeflectorWeaponType` VERBATIM. In `ProjectileManager`, `checkDeflection` delegates. (Note: `handleEntityCollision` also calls `checkDeflection` — in this task it can still call `this.checkDeflection` which now delegates; the collision methods move in Task 3 and will call the resolver directly.)
- Verify: `./node_modules/.bin/jest projectile-deflection projectile-interactions char-projectile-collision` + `tsc`. Commit: `refactor: extract DeflectionResolver from ProjectileManager`

### Task 3 — Extract ProjectileCollisionResolver
- Create `src/modules/projectile/ProjectileCollisionResolver.ts`; MOVE `handleEntityCollision`, `handleProjectileCollision`, `handleBoundaryCollision`, `applyClashKnockback` VERBATIM. Internal `checkDeflection` call → the injected `deflectionResolver.checkDeflection`. In `ProjectileManager`, the three public handlers delegate to the resolver.
- Verify: `./node_modules/.bin/jest projectile-collision projectile-impulse projectile-deflection char-projectile-collision battle` + `tsc`. Commit: `refactor: extract ProjectileCollisionResolver from ProjectileManager`

### Task 4 — Phase 4 gate
- `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest` — tsc 0, full suite green (0 failures). Report `ProjectileManager.ts` LOC before/after and confirm it now holds only `updateProjectiles` + delegating wrappers.

## Constraints & escalation
- **Move code VERBATIM.** Preserve every `Math.sqrt`/dot-product/reflection line, `PROJECTILE_INTERACTIONS` lookups, multipliers, `ownerId`/`teamId` reassignments, `console.log` lines, and `try/catch`+`console.warn` emit blocks (added in an earlier phase). The deflection math especially — do not "clean up" or reorder it.
- Public API frozen; consumers untouched.
- If any projectile/deflection test goes red and you can't immediately see why, STOP and report BLOCKED with the failing output — do NOT weaken or edit the anchor tests.
- Commit per task; never `git commit --amend`.
