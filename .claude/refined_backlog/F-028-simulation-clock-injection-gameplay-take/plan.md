# F-028 Simulation Clock Injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the simulation a monotonic `SimClock` advanced by the tick, and convert `AIModule` to gate its decisions on simulated time instead of wall-clock `Date.now()`.

**Architecture:** `GameRoom` owns a `SimClock`. `GameSimulationSystem.update(deltaTime)` advances it once per tick as its first statement, then passes `simClock.now()` into `AIModule.update(nowMs)`. `AIModule` compares that value against its own `lastUpdateTime` instead of reading a global clock. This is steps 1–2 of the four-step migration in `spec.md`; steps 3–4 (remaining subsystems, lint gate) are explicitly out of scope.

**Tech Stack:** TypeScript (strict), Jest + ts-jest, Colyseus. All commands run from `colyseus-server/`.

## Global Constraints

- **TypeScript strict mode; no unjustified `any`.** Prettier + ESLint must pass.
- **Fixed timestep is already the law here.** `GameRoom.ts:260-264` documents that the delta passed into the sim loop is `GAME_CONFIG.tickRate` (a constant, 50 ms), deliberately *not* the timer's real elapsed time, so timer jitter cannot leak into integration steps. `SimClock` completes that decision — it must never read `Date.now()` or `performance.now()`.
- **Do not touch combat cast/queue scheduling.** `BaseCombatSystem.ts:75-77` and `MobCombatSystem.ts:170-174` document a deliberate two-clock split that 9 test files and 31 `setSystemTime` calls depend on. Converting it is step 3, a separate feature.
- **Do not remove the load harness's real-time pacing.** It compensates for *every* `Date.now()`-gated system, not just `AIModule`. Only its comment changes in this plan.
- **Verification is per task**, and each task ends with the quality gate in the "Per-Task Quality Gate" section below.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/time/SimClock.ts` *(create)* | The clock. Accumulates simulated ms; exposes `now()` and `advance(ms)`. No globals, no I/O. |
| `src/tests/sim-clock.test.ts` *(create)* | Unit tests for `SimClock` in isolation. |
| `src/rooms/GameRoom.ts` *(modify, ~line 86)* | Owns the `SimClock` instance. |
| `src/rooms/systems/GameSimulationSystem.ts` *(modify, lines 8, 27)* | Advances the clock once per tick; passes `now()` to `AIModule`. |
| `src/ai/AIModule.ts` *(modify, lines 90-100)* | Gates on injected simulated time instead of `Date.now()`. |
| `src/tests/ai-sim-clock-cadence.test.ts` *(create)* | Regression tests: cadence under fast-forward and under sub-interval ticks. |
| `src/tests/load/roomLoad.harness.ts` *(modify, comment block ~lines 33-51)* | Update the stale comment describing the bug as unfixed. |

---

## Per-Task Quality Gate

Every task below ends with these five, in order, before the next task starts:

1. **Implement** the change.
2. **Verify** — run the exact commands in the task's steps and paste real output. No "should pass".
3. **Review** — dispatch an independent reviewer (`typescript-reviewer` agent or `/code-review`) against *this task's diff only*. Self-review does not count.
4. **Refactor** — act on the review while the diff is small.
5. **Re-verify** — re-run step 2's commands.

---

### Task 1: `SimClock`

**Files:**
- Create: `colyseus-server/src/time/SimClock.ts`
- Test: `colyseus-server/src/tests/sim-clock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class SimClock` with `now(): number` and `advance(deltaMs: number): void`. Task 2 depends on exactly these two names and signatures.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/sim-clock.test.ts`:

```typescript
import { SimClock } from '../time/SimClock'

describe('SimClock', () => {
  it('starts at zero', () => {
    expect(new SimClock().now()).toBe(0)
  })

  it('accumulates advances', () => {
    const clock = new SimClock()
    clock.advance(50)
    clock.advance(50)
    expect(clock.now()).toBe(100)
  })

  it('is unaffected by wall-clock time', () => {
    const clock = new SimClock()
    const before = clock.now()
    const spin = Date.now()
    while (Date.now() - spin < 20) {
      /* burn real time without advancing the clock */
    }
    expect(clock.now()).toBe(before)
  })

  it('is monotonic — rejects negative deltas', () => {
    const clock = new SimClock()
    clock.advance(50)
    expect(() => clock.advance(-1)).toThrow(RangeError)
    expect(clock.now()).toBe(50)
  })

  it('rejects non-finite deltas', () => {
    const clock = new SimClock()
    expect(() => clock.advance(NaN)).toThrow(RangeError)
    expect(() => clock.advance(Infinity)).toThrow(RangeError)
    expect(clock.now()).toBe(0)
  })

  it('accepts a zero delta', () => {
    const clock = new SimClock()
    clock.advance(0)
    expect(clock.now()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/sim-clock.test.ts`
Expected: FAIL — `Cannot find module '../time/SimClock'`.

- [ ] **Step 3: Write the minimal implementation**

Create `colyseus-server/src/time/SimClock.ts`:

```typescript
/**
 * Monotonic simulated-time clock.
 *
 * The simulation takes time as an INPUT rather than reading a global clock, so
 * a room behaves identically whether it is driven at production speed, faster
 * than real time (load harness, replay), or stepped by hand in a test.
 *
 * Deliberately has no access to Date.now() or performance.now(). Advancing is
 * the caller's job — GameSimulationSystem.update() does it once per tick with
 * the same fixed delta every other system receives (see GameRoom.ts:260-264).
 */
export class SimClock {
  private elapsedMs = 0

  /** Simulated milliseconds since the room started. Never decreases. */
  now(): number {
    return this.elapsedMs
  }

  /** Advance simulated time. Rejects anything that would break monotonicity. */
  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError(`SimClock.advance requires a finite, non-negative delta, got ${deltaMs}`)
    }
    this.elapsedMs += deltaMs
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd colyseus-server && npm test -- src/tests/sim-clock.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

Run: `cd colyseus-server && npx tsc --noEmit`
Expected: exit 0, no output. (A green Jest run does not prove the build compiles — ts-jest caches per file.)

- [ ] **Step 6: Run the quality gate**

Apply the five steps in "Per-Task Quality Gate" above.

- [ ] **Step 7: Commit**

```bash
cd colyseus-server && npx prettier --write src/time/SimClock.ts src/tests/sim-clock.test.ts
cd .. && git add colyseus-server/src/time/SimClock.ts colyseus-server/src/tests/sim-clock.test.ts
git commit -m "feat(F-028): add SimClock, a monotonic simulated-time clock"
```

---

### Task 2: Convert `AIModule` to injected simulated time

**Files:**
- Modify: `colyseus-server/src/ai/AIModule.ts:90-100` (the `update()` gate)
- Modify: `colyseus-server/src/rooms/GameRoom.ts:86` (own the clock)
- Modify: `colyseus-server/src/rooms/systems/GameSimulationSystem.ts:8,27` (advance + pass)
- Modify: `colyseus-server/src/tests/load/roomLoad.harness.ts` (comment block only)
- Test: `colyseus-server/src/tests/ai-sim-clock-cadence.test.ts`

**Interfaces:**
- Consumes: `SimClock` from Task 1 — `now()`, `advance(deltaMs)`.
- Produces: `AIModule.update(nowMs: number): void` — the parameter is **required**. `GameRoom.simClock` is a public readonly field.

**Why the signature change is safe:** the only production caller is `GameSimulationSystem.ts:27`. Every AI test drives `updateAll()`, which bypasses `update()` entirely. Confirm this before editing, in Step 1.

- [ ] **Step 1: Confirm the caller inventory**

Run:
```bash
cd colyseus-server && grep -rn "aiModule\.update(" src --include='*.ts'
```
Expected: exactly one hit, `src/rooms/systems/GameSimulationSystem.ts:27`. If there are more, stop and add them to this task's file list before continuing.

- [ ] **Step 2: Write the failing test**

Create `colyseus-server/src/tests/ai-sim-clock-cadence.test.ts`:

```typescript
import { AIModule } from '../ai/AIModule'
import { AIWorldInterface } from '../ai/AIWorldInterface'
import { SimClock } from '../time/SimClock'

/**
 * These tests drive AIModule far faster than wall-clock time. Against the old
 * Date.now()-gated implementation the fast-forward test measured ~1 decision
 * instead of 100 — the same failure that invalidated F-027's first capacity
 * table (6 of 100 ticks).
 */
describe('AIModule cadence on simulated time', () => {
  const buildModule = () => {
    // No agents are registered: this exercises the update() gate itself, which
    // is the untested path. Decision passes are counted via the private hook.
    const worldInterface = { buildAgentEnvironment: () => ({}) } as unknown as AIWorldInterface
    const aiModule = new AIModule(worldInterface)
    aiModule.start()
    const decisions = { count: 0 }
    jest
      .spyOn(aiModule as unknown as { updateAIDecision: () => void }, 'updateAIDecision')
      .mockImplementation(() => {
        decisions.count += 1
      })
    return { aiModule, decisions }
  }

  it('runs one decision pass per tick when ticks are fast-forwarded', () => {
    const clock = new SimClock()
    const { aiModule, decisions } = buildModule()

    // 100 ticks of 50ms simulated each, executed in a few real milliseconds.
    for (let i = 0; i < 100; i++) {
      clock.advance(50)
      aiModule.update(clock.now())
    }

    expect(decisions.count).toBe(100)
  })

  it('still throttles when ticks are shorter than the decision interval', () => {
    const clock = new SimClock()
    const { aiModule, decisions } = buildModule()

    // 100 ticks of 10ms = 1000ms simulated, at a 50ms interval => 20 passes.
    for (let i = 0; i < 100; i++) {
      clock.advance(10)
      aiModule.update(clock.now())
    }

    expect(decisions.count).toBe(20)
  })

  it('does not run when stopped', () => {
    const clock = new SimClock()
    const { aiModule, decisions } = buildModule()
    aiModule.stop()

    clock.advance(1000)
    aiModule.update(clock.now())

    expect(decisions.count).toBe(0)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/ai-sim-clock-cadence.test.ts`
Expected: FAIL. TypeScript rejects `aiModule.update(clock.now())` because `update()` currently takes no parameters. That compile error *is* the red state — do not work around it.

- [ ] **Step 4: Convert the `AIModule` gate**

In `colyseus-server/src/ai/AIModule.ts`, replace the `update()` method (lines 90-100):

```typescript
  // Update all agent AI (public method for tick-driven updates)
  //
  // `nowMs` is SIMULATED time from the room's SimClock, not wall clock. Gating
  // on wall clock made AI cadence depend on how fast the process happened to be
  // running: an unpaced loop ran AI on 6 of 100 ticks and silently invalidated
  // F-027's first capacity table. See .claude/refined_backlog/F-028.
  update(nowMs: number): void {
    if (!this.isRunning) return

    const targetInterval = 1000 / this.updateFrequency // 50ms for 20 FPS
    if (nowMs - this.lastUpdateTime < targetInterval) return

    this.lastUpdateTime = nowMs
    this.updateAIDecision()
  }
```

- [ ] **Step 5: Give `GameRoom` the clock**

In `colyseus-server/src/rooms/GameRoom.ts`, add the import near the other local imports:

```typescript
import { SimClock } from '../time/SimClock'
```

Add the field alongside the other room-owned systems (near the `simulationSystem` declaration, ~line 86):

```typescript
  /** Monotonic simulated time, advanced once per tick by GameSimulationSystem. */
  public readonly simClock = new SimClock()
```

- [ ] **Step 6: Advance the clock in the tick and pass it to AI**

In `colyseus-server/src/rooms/systems/GameSimulationSystem.ts`, make the clock advance the **first** statement inside the `try` in `update(deltaTime)` (line 8 onward), so every system in the pass reads one consistent timestamp:

```typescript
  update(deltaTime: number) {
    try {
      // Advance simulated time before any system reads it, so the whole pass
      // shares one timestamp.
      this.room.simClock.advance(deltaTime)

      this.updatePhysicsBodies()
```

Then change line 27 from `this.room.state.aiModule.update()` to:

```typescript
      this.room.state.aiModule.update(this.room.simClock.now())
```

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `cd colyseus-server && npm test -- src/tests/ai-sim-clock-cadence.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Run the full suite for regressions**

Run: `cd colyseus-server && npm test`
Expected: no new failures versus the pre-change baseline. If you did not capture a baseline before starting, run `git stash && npm test 2>&1 | tail -5 && git stash pop` to get one — some suites in this repo may already be red for unrelated reasons, and you need to tell those apart from yours.

- [ ] **Step 9: Typecheck**

Run: `cd colyseus-server && npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 10: Update the stale harness comment**

In `colyseus-server/src/tests/load/roomLoad.harness.ts`, the "Real-time pacing" block (~lines 33-51) says the `AIModule` bug is "left unfixed here ... and worth its own backlog entry". Replace the last two paragraphs of that block with:

```
 * `AIModule` no longer needs this pacing: as of F-028 it gates on the room's
 * SimClock (simulated time), so it runs once per tick at any execution speed.
 * The pacing stays because other systems in the codebase still gate on
 * Date.now() — respawn, projectile lifetimes, combat scheduling — and pacing is
 * what keeps them behaving as they do in production. Converting those is
 * F-028's step 3, deliberately out of scope here.
```

Do **not** remove the pacing itself.

- [ ] **Step 11: Run the quality gate**

Apply the five steps in "Per-Task Quality Gate" above. Flag one thing explicitly for the reviewer: **this changes production AI cadence** from "every 50 ms wall clock" to "every 50 ms simulated". At the shipped config (`tickRate = 50`, `updateFrequency = 20`) these coincide exactly — one pass per tick. They diverge only when ticks fall behind real time, where simulated time is the more correct basis.

- [ ] **Step 12: Commit**

```bash
cd colyseus-server && npx prettier --write src/ai/AIModule.ts src/rooms/GameRoom.ts src/rooms/systems/GameSimulationSystem.ts src/tests/ai-sim-clock-cadence.test.ts src/tests/load/roomLoad.harness.ts
cd .. && git add colyseus-server/src/ai/AIModule.ts colyseus-server/src/rooms/GameRoom.ts colyseus-server/src/rooms/systems/GameSimulationSystem.ts colyseus-server/src/tests/ai-sim-clock-cadence.test.ts colyseus-server/src/tests/load/roomLoad.harness.ts
git commit -m "feat(F-028): gate AI decisions on simulated time, not wall clock"
```

---

### Task 3: File the step 3/4 follow-up ideas

The spec commits to filing the deferred work rather than leaving it implicit.

- [ ] **Step 1: File the subsystem-conversion idea**

Run `/ps-release-workflow:idea` with title: *"Convert remaining gameplay subsystems to SimClock (respawn, projectile lifetimes, combat scheduling)"*. In its spec, record: respawn and projectile lifetimes are already self-consistent and low risk; combat cast/queue scheduling is last and needs its own budget because 9 test files and 31 `setSystemTime` calls convert with it, and its failure mode is "attacks feel wrong" rather than a red test.

- [ ] **Step 2: File the lint-gate idea**

Run `/ps-release-workflow:idea` with title: *"Ban global clock reads in converted gameplay directories (eslint) and update the CLAUDE.md timing invariant"*. Record that CLAUDE.md's "Units & timing" invariant currently prescribes `performance.now()` end-to-end and should prescribe the injected clock once step 3 lands.

- [ ] **Step 3: Verify both landed**

Run: `python3 -c "import json;d=json.load(open('.claude/idea_backlog/_catalog.json'));print([i['title'] for i in d[-2:]])"`
Expected: both new titles printed.

---

## Ship

- [ ] **Before Gate 1**, merge `release/1.6` into `feat/F-028` — the branch is cut from `main`, so the F-028 backlog folder only arrives via that merge.
- [ ] Run `/ps-release-workflow:ship` from the feature worktree (runs Gate 1 / `precheck.sh`).

---

## Self-Review

**Spec coverage:** Step 1 of the spec → Task 1. Step 2 → Task 2. Steps 3–4 (declared out of scope) → filed as follow-ups in Task 3. The spec's "gate is completely untested" point → Task 2 Step 2's three tests. The spec's production-cadence risk → called out for the reviewer in Task 2 Step 11. The spec's non-goal of touching combat scheduling → Global Constraints, and re-stated in Task 3 Step 1.

**Placeholder scan:** no TBDs; every code step carries literal code; both test files are written out in full rather than referenced.

**Type consistency:** `SimClock.now()` / `SimClock.advance(deltaMs)` are defined in Task 1 and used with those exact names in Task 2 Steps 6 and both test files. `AIModule.update(nowMs: number)` is defined in Task 2 Step 4 and called with one argument in Step 6 and in the tests.
