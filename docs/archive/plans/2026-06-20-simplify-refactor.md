# Simplify / Best-Practice Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the god-object modules and de-duplicate combat logic in `colyseus-server` without changing any observable behavior.

**Architecture:** Inside-out, behavior-preserving refactor. Characterization tests are added first to pin current behavior, then code is extracted behind unchanged public APIs so consumers (`GameRoom`, `GameSimulationSystem`, `RoomEventHandler`) never change. Each phase is independently mergeable and green-gated.

**Tech Stack:** TypeScript (strict), Colyseus 0.16 + @colyseus/schema, Planck.js, Jest (ts-jest).

**Spec:** `docs/superpowers/specs/2026-06-20-simplify-refactor-design.md`

---

## Plan decomposition (read first)

This document fully details **Phase 0 (characterization safety net)** and **Phase 1
(interfaces + decoupling)** as execution-ready TDD tasks. Phases 2–5 are independent
subsystems; per the writing-plans scope-check each gets its **own detailed plan written
just before its execution**, because the exact extracted code must be derived from a
full read of the live source at that time (avoiding fabricated "complete" code now).
The phase roadmap and locked target structure are in the final section.

Verification gate for **every** task: `cd colyseus-server && npx tsc --noEmit` clean and
`npm test` fully green (currently 428 passed / 6 skipped). Coverage on touched files must
not drop.

---

## Phase 0 — Characterization safety net

Pins current behavior of the two units about to be split (BattleModule, ProjectileManager)
so later moves are provably behavior-preserving. Pure test additions; no production code changes.

### Task 1: BattleModule damage-calculation characterization

**Files:**
- Test: `colyseus-server/src/tests/char-battlemodule-damage.test.ts` (create)

- [ ] **Step 1: Write the characterization test**

```typescript
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'

// Pins BattleModule.calculateDamage: finalDamage = floor(max(1, base - min(totalDef, base*0.8)))
// where totalDef = (magical ? mDef : pDef) + armor.
describe('char: BattleModule.calculateDamage', () => {
  let bm: BattleModule
  let state: GameState

  const target = (over: Partial<{ pDef: number; mDef: number; armor: number }>) =>
    new Mob({
      id: 't', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
      atkWindDownTime: 1000, pDef: over.pDef ?? 0, mDef: over.mDef ?? 0,
      armor: over.armor ?? 0, density: 1,
    })

  beforeEach(() => { state = new GameState('m', 'r'); bm = new BattleModule(state) })
  afterEach(() => { state.stopAI() })

  it('physical: subtracts pDef + armor', () => {
    expect(bm.calculateDamage(100, 'physical', target({ pDef: 10, armor: 5 }))).toBe(85)
  })
  it('magical: subtracts mDef + armor (ignores pDef)', () => {
    expect(bm.calculateDamage(100, 'magical', target({ pDef: 999, mDef: 4, armor: 5 }))).toBe(91)
  })
  it('caps reduction at 80% of base damage', () => {
    expect(bm.calculateDamage(100, 'physical', target({ pDef: 500 }))).toBe(20)
  })
  it('never reduces below 1', () => {
    expect(bm.calculateDamage(1, 'physical', target({ pDef: 500 }))).toBe(1)
  })
  it('floors fractional results', () => {
    expect(bm.calculateDamage(10, 'physical', target({ pDef: 0.5 }))).toBe(9)
  })
})
```

- [ ] **Step 2: Run it and confirm it passes against current code**

Run: `cd colyseus-server && npm test -- char-battlemodule-damage`
Expected: PASS (5 tests). If any value differs, the assertion is wrong about current
behavior — fix the assertion to match current code, do NOT change production code.

- [ ] **Step 3: Commit**

```bash
git add colyseus-server/src/tests/char-battlemodule-damage.test.ts
git commit -m "test: characterize BattleModule.calculateDamage"
```

### Task 2: BattleModule applyDamage + death + respawn characterization

**Files:**
- Test: `colyseus-server/src/tests/char-battlemodule-lifecycle.test.ts` (create)

- [ ] **Step 1: Write the characterization test**

```typescript
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'

describe('char: BattleModule applyDamage / respawn', () => {
  let bm: BattleModule
  let state: GameState
  const mob = () => new Mob({
    id: 't', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
    atkWindDownTime: 1000, pDef: 0, mDef: 0, armor: 0, density: 1,
  })
  beforeEach(() => { state = new GameState('m', 'r'); bm = new BattleModule(state) })
  afterEach(() => { state.stopAI() })

  it('non-lethal damage reduces HP and returns false', () => {
    const t = mob()
    expect(bm.applyDamage(t, 30)).toBe(false)
    expect(t.currentHealth).toBe(70)
    expect(t.isAlive).toBe(true)
  })
  it('lethal damage triggers die() and returns true', () => {
    const t = mob()
    expect(bm.applyDamage(t, 100)).toBe(true)
    expect(t.currentHealth).toBe(0)
    expect(t.isAlive).toBe(false)
    expect(t.diedAt).toBeGreaterThan(0)
  })
  it('respawnEntity restores a dead entity to full and clears diedAt', () => {
    const t = mob()
    bm.applyDamage(t, 100)
    bm.respawnEntity(t, 5, 6)
    expect(t.isAlive).toBe(true)
    expect(t.currentHealth).toBe(t.maxHealth)
    expect(t.diedAt).toBe(0)
    expect(t.x).toBe(5)
    expect(t.y).toBe(6)
  })
})
```

- [ ] **Step 2: Run and confirm pass**

Run: `cd colyseus-server && npm test -- char-battlemodule-lifecycle`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add colyseus-server/src/tests/char-battlemodule-lifecycle.test.ts
git commit -m "test: characterize BattleModule applyDamage/die/respawn"
```

### Task 3: BattleModule status-effect characterization

**Files:**
- Test: `colyseus-server/src/tests/char-battlemodule-status.test.ts` (create)

- [ ] **Step 1: Write the characterization test**

```typescript
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'

describe('char: BattleModule status effects', () => {
  let bm: BattleModule
  let state: GameState
  const mob = () => new Mob({
    id: 't', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
    atkWindDownTime: 1000, pDef: 0, mDef: 0, armor: 0, density: 1,
  })
  beforeEach(() => { state = new GameState('m', 'r'); bm = new BattleModule(state) })
  afterEach(() => { state.stopAI() })

  it('applies a status at full chance (no resistance)', () => {
    const t = mob()
    expect(bm.applyStatusEffect(t, 'stun', 500, 1.0)).toBe(true)
    expect(t.battleStatuses.has('stun')).toBe(true)
    expect(t.isStunned).toBe(true)
  })
  it('full resistance blocks the status', () => {
    const t = mob()
    t.setResistance('stun', 1.0) // chance = baseChance * (1 - 1.0) = 0
    expect(bm.applyStatusEffect(t, 'stun', 500, 1.0)).toBe(false)
    expect(t.battleStatuses.has('stun')).toBe(false)
  })
  it('a DOT applies its value on tick once the interval elapses', () => {
    jest.useFakeTimers()
    const t = mob()
    bm.applyStatusEffect(t, 'burn', 1000, 1.0, { value: 7, interval: 100 })
    const hpAfterApply = t.currentHealth
    jest.setSystemTime(Date.now() + 150) // past one 100ms interval
    bm.processStatusTicks(t)
    expect(t.currentHealth).toBe(hpAfterApply - 7)
    jest.useRealTimers()
  })
})
```

- [ ] **Step 2: Run and confirm pass**

Run: `cd colyseus-server && npm test -- char-battlemodule-status`
Expected: PASS (3 tests). Note: `BattleStatus.lastTick` initializes to creation time, so
the DOT waits one full interval before its first tick — the `setSystemTime` advance covers that.

- [ ] **Step 3: Commit**

```bash
git add colyseus-server/src/tests/char-battlemodule-status.test.ts
git commit -m "test: characterize BattleModule status apply/resist/DOT"
```

### Task 4: ProjectileManager collision-routing characterization

**Files:**
- Test: `colyseus-server/src/tests/char-projectile-collision.test.ts` (create)

- [ ] **Step 1: Write the characterization test**

```typescript
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'
import { BattleManager } from '../modules/BattleManager'
import { GameState } from '../schemas/GameState'
import { Projectile } from '../schemas/Projectile'
import { Mob } from '../schemas/Mob'

describe('char: ProjectileManager.handleEntityCollision', () => {
  let state: GameState
  let pm: ProjectileManager
  let battleManager: BattleManager

  const target = () => new Mob({
    id: 'target', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
    atkWindDownTime: 1000, pDef: 0, mDef: 0, armor: 0, density: 1,
  })

  beforeEach(() => {
    state = new GameState('m', 'r')
    battleManager = new BattleManager('r', state)
    state.battleManager = battleManager
    pm = new ProjectileManager(state, new BattleModule(state), battleManager)
  })
  afterEach(() => { state.stopAI() })

  it('routes a hit through the BattleManager queue and records the target', () => {
    const spy = jest.spyOn(battleManager, 'addActionMessage')
    const t = target()
    const proj = new Projectile('p1', 0, 0, 10, 0, 'shooter', 5)
    pm.handleEntityCollision(proj, t)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(proj.hitTargets.has('target')).toBe(true)
  })

  it('non-piercing projectile sticks after a hit; piercing keeps flying', () => {
    const nonPiercing = new Projectile('p2', 0, 0, 10, 0, 'shooter', 5)
    pm.handleEntityCollision(nonPiercing, target())
    expect(nonPiercing.isStuck).toBe(true)

    const piercing = new Projectile('p3', 0, 0, 10, 0, 'shooter', 5)
    piercing.piercing = true
    pm.handleEntityCollision(piercing, target())
    expect(piercing.isStuck).toBe(false)
  })

  it('ignores a hit on the projectile owner', () => {
    const spy = jest.spyOn(battleManager, 'addActionMessage')
    const t = target()
    const proj = new Projectile('p4', 0, 0, 10, 0, 'target', 5) // owner === target.id
    pm.handleEntityCollision(proj, t)
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and confirm pass**

Run: `cd colyseus-server && npm test -- char-projectile-collision`
Expected: PASS (3 tests). If routing assertions differ, fix the assertions to match
current behavior — do not change production code in Phase 0.

- [ ] **Step 3: Commit**

```bash
git add colyseus-server/src/tests/char-projectile-collision.test.ts
git commit -m "test: characterize ProjectileManager collision routing"
```

### Task 5: Phase 0 gate

- [ ] **Step 1: Full suite + typecheck green**

Run: `cd colyseus-server && npx tsc --noEmit && npm test`
Expected: tsc exit 0; all suites pass (now ~440 tests). This green baseline is the
behavior contract every later phase must keep.

---

## Phase 1 — Interfaces + decoupling

Removes `as any` casts on entity-runtime fields by introducing a typed interface. Pure
type-safety cleanup; no runtime behavior change (verified by the Phase 0 + existing suite).

### Task 6: Introduce IAgentRuntime and use it in WorldLife

**Files:**
- Create: `colyseus-server/src/schemas/IAgentRuntime.ts`
- Modify: `colyseus-server/src/schemas/WorldLife.ts` (the `updateHeading` body that reads `(this as any).desiredVx/desiredVy`)

- [ ] **Step 1: Create the interface**

```typescript
// colyseus-server/src/schemas/IAgentRuntime.ts
// Server-only runtime fields that AI-driven entities (Mob, NPC) expose for steering.
// Lets WorldLife read desired velocity without `as any`.
export interface IAgentRuntime {
  desiredVx: number
  desiredVy: number
}
```

- [ ] **Step 2: Use it in WorldLife.updateHeading**

Replace the `(this as any).desiredVx` / `(this as any).desiredVy` reads in
`WorldLife.updateHeading` with a typed narrowing:

```typescript
      // Mob/NPC: use AI desired direction
      if ('desiredVx' in this && 'desiredVy' in this) {
        const agent = this as unknown as IAgentRuntime
        sourceVx = agent.desiredVx
        sourceVy = agent.desiredVy
      } else {
        // Player: use actual velocity
        sourceVx = this.vx
        sourceVy = this.vy
      }
```

Add the import at the top of `WorldLife.ts`:

```typescript
import { IAgentRuntime } from './IAgentRuntime'
```

- [ ] **Step 3: Typecheck + run the heading/behavior suites**

Run: `cd colyseus-server && npx tsc --noEmit && npm test -- heading mob`
Expected: tsc exit 0; heading and mob suites pass (behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add colyseus-server/src/schemas/IAgentRuntime.ts colyseus-server/src/schemas/WorldLife.ts
git commit -m "refactor: type WorldLife agent-field access via IAgentRuntime"
```

### Task 7: Sweep remaining entity-field `as any` casts

**Files:**
- Modify: files reported by the grep below (expected: `ai/AIWorldInterface.ts`, combat systems, `modules/ProjectileManager.ts`)

- [ ] **Step 1: Enumerate the casts**

Run: `cd colyseus-server/src && grep -rn "as any).desiredV\|as any).pendingAttack\|as any).radius\|as any).teamId" --include="*.ts" . | grep -v tests`
Expected: a concrete list of cast sites. These are the Phase-1 targets.

- [ ] **Step 2: Replace each cast with the narrowest correct type**

For `desiredVx/desiredVy` accesses, use `IAgentRuntime` (as in Task 6). For `radius`/`teamId`
(which exist on `WorldLife`/`WorldObject`), retype the parameter/local to `WorldLife` instead
of `as any`. Change ONE file at a time; after each file run `npx tsc --noEmit`.

- [ ] **Step 3: Typecheck + full suite**

Run: `cd colyseus-server && npx tsc --noEmit && npm test`
Expected: tsc exit 0; full suite green. No behavior change.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: replace entity-field as-any casts with typed access"
```

### Task 8: Phase 1 gate

- [ ] **Step 1: Confirm no entity-field `as any` remains and suite is green**

Run: `cd colyseus-server/src && grep -rn "as any).desiredV" --include="*.ts" . | grep -v tests; cd .. && npx tsc --noEmit && npm test`
Expected: grep prints nothing; tsc exit 0; full suite green.

---

## Phases 2–5 — roadmap (each gets its own JIT plan)

These are sequenced and gated. Each will be expanded into a full step-level TDD plan
(`docs/superpowers/plans/2026-06-20-simplify-refactor-phaseN.md`) immediately before it runs,
derived from a fresh read of the live source. Locked target structure:

**Phase 2 — Combat-queue dedup** (after Phase 1)
- Create `systems/AttackScheduler.ts` (or fill out `systems/BaseCombatSystem.ts`) owning the
  shared wind-up / attack-queue / cooldown logic.
- `MobCombatSystem`, `NPCCombatSystem`, `PlayerCombatSystem` delegate to it and keep their
  public `update(...)` signatures. Anchored by the existing mob/NPC combat + Phase 0 tests.

**Phase 3 — BattleModule split** (after Phase 2)
- Create `combat/DamageCalculator.ts` (pure), `combat/StatusEffectManager.ts`,
  `combat/EntityRespawner.ts`, `combat/ProcessedEventTracker.ts`.
- `BattleModule` becomes a thin orchestrator; public methods unchanged. Anchored by Phase 0
  characterization tests + new unit tests per extracted class.

**Phase 4 — ProjectileManager split** (after Phase 3)
- Create `modules/projectile/ProjectileFactory.ts`, `ProjectileCollisionResolver.ts`,
  `DeflectionResolver.ts`. `ProjectileManager` orchestrates; public surface unchanged.
  Anchored by Phase 0 collision test + existing deflection/projectile suites.

**Phase 5 — PlanckPhysicsManager split** (GATED: explicit go/no-go after Phase 4; may
become its own standalone plan)
- Strangler-style collaborators (`PhysicsBodyRegistry`, step/sync loop, impulse/steering
  applier) behind unchanged public methods. Anchored by the `GameSimulationSystem`
  integration test + physics suites.

**Per-phase exit (all of 2–5):** `npx tsc --noEmit` clean, full `npm test` green, coverage
on touched files not lower, target module < ~250 LOC and single-responsibility.

---

## Self-review notes

- **Spec coverage:** Phase 0 covers the spec's "characterization tests first" + BattleModule/
  ProjectileManager safety nets. Phase 1 covers "interfaces + decoupling". Phases 2–5 map 1:1
  to the spec's remaining targets (combat-queue dedup, BattleModule, ProjectileManager, physics).
- **Behavior-preserving:** every task either only adds tests (Phase 0) or changes types without
  touching control flow (Phase 1); gates run the full suite.
- **No fabricated extraction code:** Phases 2–5 deliberately deferred to JIT plans rather than
  guessing final moved code now — consistent with the spec's NO-MAGIC principle.
