# Simplify / Best-Practice Refactor — Design

**Status:** Approved (brainstorm) · **Date:** 2026-06-20 · **Repo:** atlas-world-svc (colyseus-server)
**Branch:** `feature/simplify-refactor`

## Goal

Improve maintainability and testability of the Colyseus game server by decomposing
the "god object" modules and removing duplicated combat logic — **without changing
any observable behavior**. This is the *simplify / best-practice* track; the
*scale* track (AOI, spatial grid, multi-client) is explicitly out of scope and
deferred to a later plan, though this work creates the clean module seams that make
that later work safer.

## Scope

In scope (chosen targets, sequenced low → high risk):

1. Interfaces + decoupling — kill `as any` entity-runtime casts; tidy `GameState`↔manager access.
2. Combat-queue dedup — hoist shared wind-up/queue/cooldown logic into a single home.
3. `BattleModule` decomposition (680 LOC → thin orchestrator + focused units).
4. `ProjectileManager` decomposition (518 LOC → factory + collision + deflection).
5. `PlanckPhysicsManager` decomposition (735 LOC) — **gated**, may spin off as its own plan.

Out of scope: scale/AOI work, balance/gameplay changes, schema sync-contract changes,
client changes, new dependencies, unrelated cleanup.

## Principles (the guardrails)

- **Behavior-preserving.** Zero observable behavior change per phase. No balance or
  logic tweaks smuggled into a move. A real bug found mid-refactor is logged
  separately, not fixed inline.
- **Characterization tests first.** Each phase opens by adding tests that pin the
  *current* behavior of the unit about to move, committed before any code shifts.
- **Public APIs unchanged.** `GameRoom` and `GameSimulationSystem` call sites do not
  change; we refactor behind the existing public surface. Every phase is trivially
  revertible.
- **Contracts untouched.** Colyseus `@type` sync fields and client-synced timestamps
  (`createdAt`, `castingUntil`, `diedAt`, `expiresAt`, `cooldowns`) stay exactly as-is.
  The deliberate `Date.now()`/`performance.now()` two-clock split is preserved.
- **One responsibility per unit.** Each extracted unit has one job, a defined
  interface, is independently testable, and ideally is < ~250 LOC. No new deps;
  follow existing patterns and naming.

## Phases

Each phase is its own commit set on `feature/simplify-refactor` (or a sub-branch),
independently mergeable, and gated on: `tsc --noEmit` clean + full `npm test` green
+ coverage non-decreasing on touched files.

### Phase 0 — Safety net (additive, no risk)

Add characterization tests that raise coverage on the units about to move:

- **BattleModule:** damage calc table (physical/magical, armor, 80% cap, floor),
  status apply/resist-roll/refresh/tick(DOT)/expire, respawn delegation, event-dedup
  (`validateEvent`/cleanup TTL).
- **ProjectileManager:** collision → damage routing (queue vs legacy path),
  piercing vs non-piercing stick, deflection accept/reject conditions, despawn rules.

Exit: new tests green; coverage on `BattleModule.ts`/`ProjectileManager.ts` materially up.

### Phase 1 — Interfaces + decoupling (low risk)

- Introduce interfaces for the entity-runtime fields currently reached via `as any`
  (e.g. `IAgentRuntime` for `desiredVx/desiredVy/pendingAttack`, mob-only fields).
  Replace casts in `WorldLife`, `AIWorldInterface`, combat systems.
- Keep `GameState` manager refs typed via `import type` (already done). Optionally
  introduce a small `RoomServices` context so managers aren't reached through
  `GameState` — only if it reduces coupling without churn; otherwise leave typed.

Exit: no `as any` on entity-runtime fields in touched files; `tsc` strict clean.

### Phase 2 — Combat-queue dedup (low–med risk)

- Extract the near-identical wind-up / attack-queue / cooldown logic shared by
  `MobCombatSystem`, `NPCCombatSystem`, `PlayerCombatSystem` into the existing
  `BaseCombatSystem` (currently a stub) or a dedicated `AttackScheduler`.
- The three combat systems become thin specializations. The NPC path (now tested)
  and the Mob path (well-covered) anchor behavior parity.

Exit: shared scheduling logic exists once; combat tests + new char-tests green.

### Phase 3 — BattleModule decomposition (medium risk)

Extract from `BattleModule`:

- `DamageCalculator` — pure: `(baseDamage, type, target) → number`.
- `StatusEffectManager` — apply / resistance roll / refresh / DOT tick / expire.
- `EntityRespawner` — wraps `entity.respawn()` + dedup-cache clear.
- `ProcessedEventTracker` — the per-entity event-dedup map + TTL cleanup.

`BattleModule` becomes a thin orchestrator delegating to these plus the
`BattleManager` queue. Public methods (`processAttack`, `applyDamage`, `processAction`,
`updateCombatState`, …) keep their signatures.

Exit: `BattleModule.ts` < ~250 LOC; each extracted unit unit-tested; suite green.

### Phase 4 — ProjectileManager decomposition (med–high risk)

Split `ProjectileManager` into:

- `ProjectileFactory` — `createMelee` / `createSpear` (piercing defaults, spawn math).
- `ProjectileCollisionResolver` — entity / projectile / boundary collision handling
  and damage routing.
- `DeflectionResolver` — `checkDeflection` reflection math + recoil.

`ProjectileManager` orchestrates and keeps its public surface
(`updateProjectiles`, `handleEntityCollision`, `checkDeflection`, …) so
`GameSimulationSystem`/`RoomEventHandler` are untouched.

Exit: each unit testable in isolation; deflection/projectile suites green.

### Phase 5 — PlanckPhysicsManager decomposition (high risk, GATED)

**Explicit go/no-go after Phase 4.** Strangler-style: build collaborators
(`PhysicsBodyRegistry` for per-entity body lifecycle, the step/sync loop, an
impulse/steering applier) and switch call sites behind the *unchanged* public
methods (`update`, `createXBody`, `removeBody`, `getBody`, `syncEntityToBody`,
`applyImpulseToBody`). May be deferred to its own plan if 0–4 reveal friction.

Exit (if attempted): physics + integration suites green; `GameSimulationSystem`
integration test unchanged and passing.

## Per-phase workflow

```
characterization tests (Phase 0 covers 3/4) →
extract behind unchanged public API →
tsc --noEmit + full npm test + coverage check →
commit → merge (or stack) → reassess before next phase
```

## Verification & rollback

- **Verification:** `tsc --noEmit` clean and `npm test` fully green after every phase;
  coverage on touched files must not drop. The `GameSimulationSystem` integration
  test acts as a cross-cutting behavior anchor.
- **Rollback:** each phase is a squash-mergeable branch/commit with unchanged public
  APIs, so reverting a phase is dropping its commit — no consumer changes to unwind.

## Risks & blast radius

- Touching the hottest combat/physics path is the core risk; mitigated by
  tests-first, behavior-preservation, unchanged public APIs, and small phases.
- Physics (Phase 5) is highest-risk and gated/deferrable.
- Coupling via `GameState` manager refs is real; Phase 1 reduces it conservatively
  rather than forcing a large DI rework (that would be scope drift).

## Definition of done

`BattleModule`, `ProjectileManager` (and, if Phase 5 runs, `PlanckPhysicsManager`)
are thin orchestrators; combat-queue logic exists in exactly one place; no `as any`
on entity-runtime fields; coverage on touched units up; full suite green throughout —
the standing proof that behavior did not change.
