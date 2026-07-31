# F-023 Boss Threat / Aggro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mob target selection read a per-mob threat table instead of raw distance, so a boss stops structurally focus-firing whoever happens to be nearest.

**Architecture:** One bounded `ThreatTable` per agent, held in a `ThreatRegistry` on `GameState`. `BattleModule` writes threat on every resolved hit. A new `selectTarget()` replaces the single `getNearestOppositeTeam()` call in `AIWorldInterface.buildAgentEnvironment()` — the one field that both `AttackBehavior` and `ChaseBehavior` read. With an empty table, selection falls back to nearest and behaviour is identical to today.

**Tech Stack:** TypeScript (strict), Colyseus schemas, Jest + ts-jest, Planck.js physics.

**Spec:** `docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md`

## Global Constraints

- **Use `pnpm`, never `npm`.** Never `git commit --amend` — always a new commit.
- **Cut the branch, then immediately `git merge release/1.6 --no-edit`.** The claim script cuts from `main`; this bit both F-018 and F-019 in 1.5.
- **Single-path APIs.** Every constructor/method takes **one options object**. No positional overloads, no boolean flags that branch behaviour.
- **All combat logic stays centralised in `BattleModule`** — never duplicated into emitters or systems.
- **Timing uses `performance.now()`** end-to-end. Never mix with `Date.now()` for deltas.
- **TypeScript strict; no unjustified `any`.** Prettier + ESLint must pass.
- **A green Jest run does not prove the build compiles** (ts-jest caches per-file). Run `pnpm run build` before declaring any task with a type change done.
- **Gate 1 before shipping:** `./scripts/precheck.sh`.

---

## File Structure

| file | responsibility |
| --- | --- |
| `src/config/combat/threat.ts` *(create)* | Tuning constants only. Mirrors the existing `src/config/combat/elements.ts` pattern. |
| `src/ai/threat/ThreatTable.ts` *(create)* | One mob's bounded threat map. Pure data + decay math, no world access. |
| `src/ai/threat/ThreatRegistry.ts` *(create)* | Owns tables per agent; handles entity-removal cleanup. |
| `src/ai/targeting/selectTarget.ts` *(create)* | The 4 selection rules. Pure function over candidates + table. |
| `src/schemas/GameState.ts` *(modify)* | Holds the non-synced `threatRegistry` reference, beside `battleManager` / `aiModule`. |
| `src/modules/BattleModule.ts` *(modify)* | Writes threat on resolved hits; exposes the `taunt` threat op. |
| `src/ai/AIWorldInterface.ts` *(modify)* | The seam — `buildAgentEnvironment` calls `selectTarget`. |
| `src/ai/behaviors/AgentBehaviors.ts` *(modify)* | Rename only — reads `preferredTarget`. |
| `src/rooms/handlers/DebugCommandHandler.ts` *(modify)* | `debug_taunt` so the taunt gate is exercisable. |
| `src/tests/f018-boss-spread.test.ts` *(modify)* | Re-gated per spec §6. |

---

### Task 1: `ThreatTable` — bounded per-mob threat with lazy decay

**Files:**
- Create: `colyseus-server/src/config/combat/threat.ts`
- Create: `colyseus-server/src/ai/threat/ThreatTable.ts`
- Test: `colyseus-server/src/tests/threat-table.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `THREAT_CONFIG: { halfLifeMs: number; maxEntries: number; switchMargin: number; tauntMultiplier: number; tauntLockMs: number }`
  - `class ThreatTable`
    - `add(options: { entityId: string; amount: number; now: number }): void`
    - `taunt(options: { entityId: string; now: number }): void`
    - `valueOf(options: { entityId: string; now: number }): number`
    - `best(options: { candidateIds: string[]; now: number }): { entityId: string; threat: number } | null`
    - `isTauntLocked(options: { now: number }): boolean`
    - `tauntedTarget(options: { now: number }): string | null`
    - `remove(options: { entityId: string }): void`
    - `size(): number`

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/threat-table.test.ts`:

```typescript
import { ThreatTable } from '../ai/threat/ThreatTable'
import { THREAT_CONFIG } from '../config/combat/threat'

describe('ThreatTable', () => {
  it('accumulates threat per entity', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 10, now: 0 })
    t.add({ entityId: 'p1', amount: 5, now: 0 })
    t.add({ entityId: 'p2', amount: 3, now: 0 })
    expect(t.valueOf({ entityId: 'p1', now: 0 })).toBeCloseTo(15)
    expect(t.valueOf({ entityId: 'p2', now: 0 })).toBeCloseTo(3)
  })

  it('decays by half over one half-life', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 100, now: 0 })
    expect(t.valueOf({ entityId: 'p1', now: THREAT_CONFIG.halfLifeMs })).toBeCloseTo(50, 5)
  })

  it('returns the highest-threat candidate, ignoring absent ones', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 10, now: 0 })
    t.add({ entityId: 'p2', amount: 40, now: 0 })
    expect(t.best({ candidateIds: ['p1', 'p2'], now: 0 })?.entityId).toBe('p2')
    // p2 out of range: p1 wins even though its threat is lower
    expect(t.best({ candidateIds: ['p1'], now: 0 })?.entityId).toBe('p1')
    expect(t.best({ candidateIds: ['p9'], now: 0 })).toBeNull()
  })

  it('evicts the lowest entry at the cap instead of growing', () => {
    const t = new ThreatTable()
    for (let i = 0; i < THREAT_CONFIG.maxEntries; i++) {
      t.add({ entityId: `p${i}`, amount: 100 + i, now: 0 })
    }
    expect(t.size()).toBe(THREAT_CONFIG.maxEntries)
    t.add({ entityId: 'newcomer', amount: 999, now: 0 })
    expect(t.size()).toBe(THREAT_CONFIG.maxEntries)
    // p0 had the lowest threat and was evicted; the newcomer is present
    expect(t.valueOf({ entityId: 'p0', now: 0 })).toBe(0)
    expect(t.valueOf({ entityId: 'newcomer', now: 0 })).toBeCloseTo(999)
  })

  it('taunt outranks the current leader and reports a lock', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'dps', amount: 1000, now: 0 })
    t.taunt({ entityId: 'tank', now: 0 })
    expect(t.best({ candidateIds: ['dps', 'tank'], now: 0 })?.entityId).toBe('tank')
    expect(t.isTauntLocked({ now: 0 })).toBe(true)
    expect(t.tauntedTarget({ now: 0 })).toBe('tank')
  })

  it('releases the taunt lock after tauntLockMs', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'dps', amount: 1000, now: 0 })
    t.taunt({ entityId: 'tank', now: 0 })
    const after = THREAT_CONFIG.tauntLockMs + 1
    expect(t.isTauntLocked({ now: after })).toBe(false)
    expect(t.tauntedTarget({ now: after })).toBeNull()
  })

  it('drops an entity on remove', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 10, now: 0 })
    t.remove({ entityId: 'p1' })
    expect(t.valueOf({ entityId: 'p1', now: 0 })).toBe(0)
    expect(t.size()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && pnpm test -- src/tests/threat-table.test.ts`
Expected: FAIL — `Cannot find module '../ai/threat/ThreatTable'`

- [ ] **Step 3: Write the config**

Create `colyseus-server/src/config/combat/threat.ts`:

```typescript
/**
 * Threat / aggro tuning (F-023).
 *
 * Threat is written only on resolved hits and decayed lazily at read time, so a
 * quiet tick costs nothing. `maxEntries` bounds memory regardless of party size —
 * the README targets 150-300 players per instance and a mob still holds at most
 * this many entries.
 */
export const THREAT_CONFIG = {
  /** Threat halves every this many ms, so a disengaging player sheds aggro. */
  halfLifeMs: 10_000,
  /** Hard cap on tracked entities per mob; lowest-threat entry is evicted on overflow. */
  maxEntries: 32,
  /** A challenger must exceed the current target by this factor to steal it (anti-thrash). */
  switchMargin: 1.1,
  /** A taunt sets threat to this multiple of the current highest. */
  tauntMultiplier: 1.5,
  /** A taunt also pins the target outright for this long, regardless of threat. */
  tauntLockMs: 5_000,
} as const
```

- [ ] **Step 4: Write the implementation**

Create `colyseus-server/src/ai/threat/ThreatTable.ts`:

```typescript
import { THREAT_CONFIG } from '../../config/combat/threat'

const LN2 = Math.LN2

interface ThreatEntry {
  /** Threat as of `stamp`; the live value is this decayed forward to `now`. */
  value: number
  stamp: number
}

/**
 * One mob's threat table. Pure data — no world access, no ticking.
 *
 * Decay is applied lazily when a value is read rather than swept per-tick, so the
 * table costs nothing on ticks where nothing is hit.
 */
export class ThreatTable {
  private readonly entries = new Map<string, ThreatEntry>()
  private tauntedId: string | null = null
  private tauntedUntil = 0

  private decayed(entry: ThreatEntry, now: number): number {
    const dt = now - entry.stamp
    if (dt <= 0) return entry.value
    return entry.value * Math.exp((-LN2 * dt) / THREAT_CONFIG.halfLifeMs)
  }

  /** Drop the lowest-threat entry so the table stays bounded. */
  private evictLowest(now: number): void {
    let lowestId: string | null = null
    let lowestValue = Infinity
    for (const [id, entry] of this.entries) {
      const v = this.decayed(entry, now)
      if (v < lowestValue) {
        lowestValue = v
        lowestId = id
      }
    }
    if (lowestId !== null) this.entries.delete(lowestId)
  }

  add(options: { entityId: string; amount: number; now: number }): void {
    const { entityId, amount, now } = options
    if (amount <= 0) return

    const existing = this.entries.get(entityId)
    if (existing) {
      existing.value = this.decayed(existing, now) + amount
      existing.stamp = now
      return
    }

    if (this.entries.size >= THREAT_CONFIG.maxEntries) this.evictLowest(now)
    this.entries.set(entityId, { value: amount, stamp: now })
  }

  /**
   * Force this entity to the top of the table AND pin it for `tauntLockMs`.
   * The multiplier alone would be immediately contestable by a high-DPS player;
   * the lock is what makes a tank's taunt reliable.
   */
  taunt(options: { entityId: string; now: number }): void {
    const { entityId, now } = options

    let highest = 0
    for (const entry of this.entries.values()) {
      highest = Math.max(highest, this.decayed(entry, now))
    }

    const value = Math.max(highest * THREAT_CONFIG.tauntMultiplier, 1)
    if (!this.entries.has(entityId) && this.entries.size >= THREAT_CONFIG.maxEntries) {
      this.evictLowest(now)
    }
    this.entries.set(entityId, { value, stamp: now })

    this.tauntedId = entityId
    this.tauntedUntil = now + THREAT_CONFIG.tauntLockMs
  }

  isTauntLocked(options: { now: number }): boolean {
    return this.tauntedId !== null && options.now < this.tauntedUntil
  }

  tauntedTarget(options: { now: number }): string | null {
    return this.isTauntLocked(options) ? this.tauntedId : null
  }

  valueOf(options: { entityId: string; now: number }): number {
    const entry = this.entries.get(options.entityId)
    return entry ? this.decayed(entry, options.now) : 0
  }

  /** Highest-threat entity among `candidateIds`. Null when none of them has threat. */
  best(options: { candidateIds: string[]; now: number }): { entityId: string; threat: number } | null {
    const { candidateIds, now } = options
    let bestId: string | null = null
    let bestThreat = 0

    for (const id of candidateIds) {
      const entry = this.entries.get(id)
      if (!entry) continue
      const v = this.decayed(entry, now)
      if (v > bestThreat) {
        bestThreat = v
        bestId = id
      }
    }

    return bestId === null ? null : { entityId: bestId, threat: bestThreat }
  }

  remove(options: { entityId: string }): void {
    this.entries.delete(options.entityId)
    if (this.tauntedId === options.entityId) {
      this.tauntedId = null
      this.tauntedUntil = 0
    }
  }

  size(): number {
    return this.entries.size
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd colyseus-server && pnpm test -- src/tests/threat-table.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 6: Verify the build compiles**

Run: `cd colyseus-server && pnpm run build`
Expected: exit 0, no type errors

- [ ] **Step 7: Commit**

```bash
git add colyseus-server/src/config/combat/threat.ts \
        colyseus-server/src/ai/threat/ThreatTable.ts \
        colyseus-server/src/tests/threat-table.test.ts
git commit -m "feat: bounded ThreatTable with lazy decay and taunt lock"
```

---

### Task 2: `ThreatRegistry` — per-agent tables and removal cleanup

**Files:**
- Create: `colyseus-server/src/ai/threat/ThreatRegistry.ts`
- Modify: `colyseus-server/src/schemas/GameState.ts` (around the existing `worldInterface` / `aiModule` construction at lines 31-50)
- Test: `colyseus-server/src/tests/threat-registry.test.ts`

**Interfaces:**
- Consumes: `ThreatTable` from Task 1.
- Produces:
  - `class ThreatRegistry`
    - `forAgent(options: { agentId: string }): ThreatTable` — creates on first use
    - `peek(options: { agentId: string }): ThreatTable | null` — no side effect
    - `forgetEntity(options: { entityId: string }): void` — drops it from **every** table
    - `removeAgent(options: { agentId: string }): void`
  - `GameState.threatRegistry: ThreatRegistry` (non-synced, like `battleManager`)

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/threat-registry.test.ts`:

```typescript
import { ThreatRegistry } from '../ai/threat/ThreatRegistry'

describe('ThreatRegistry', () => {
  it('gives each agent an isolated table', () => {
    const r = new ThreatRegistry()
    r.forAgent({ agentId: 'mobA' }).add({ entityId: 'p1', amount: 10, now: 0 })
    expect(r.forAgent({ agentId: 'mobA' }).valueOf({ entityId: 'p1', now: 0 })).toBeCloseTo(10)
    expect(r.forAgent({ agentId: 'mobB' }).valueOf({ entityId: 'p1', now: 0 })).toBe(0)
  })

  it('peek does not create a table', () => {
    const r = new ThreatRegistry()
    expect(r.peek({ agentId: 'ghost' })).toBeNull()
  })

  it('forgetEntity drops the entity from every table', () => {
    const r = new ThreatRegistry()
    r.forAgent({ agentId: 'mobA' }).add({ entityId: 'p1', amount: 10, now: 0 })
    r.forAgent({ agentId: 'mobB' }).add({ entityId: 'p1', amount: 20, now: 0 })

    r.forgetEntity({ entityId: 'p1' })

    expect(r.forAgent({ agentId: 'mobA' }).valueOf({ entityId: 'p1', now: 0 })).toBe(0)
    expect(r.forAgent({ agentId: 'mobB' }).valueOf({ entityId: 'p1', now: 0 })).toBe(0)
  })

  it('removeAgent discards that agent table', () => {
    const r = new ThreatRegistry()
    r.forAgent({ agentId: 'mobA' }).add({ entityId: 'p1', amount: 10, now: 0 })
    r.removeAgent({ agentId: 'mobA' })
    expect(r.peek({ agentId: 'mobA' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && pnpm test -- src/tests/threat-registry.test.ts`
Expected: FAIL — `Cannot find module '../ai/threat/ThreatRegistry'`

- [ ] **Step 3: Write the implementation**

Create `colyseus-server/src/ai/threat/ThreatRegistry.ts`:

```typescript
import { ThreatTable } from './ThreatTable'

/**
 * Owns one ThreatTable per agent.
 *
 * `forgetEntity` is the leak guard: when a player disconnects or an entity dies,
 * its threat must vanish from every mob that remembered it, not just the one it
 * was fighting.
 */
export class ThreatRegistry {
  private readonly tables = new Map<string, ThreatTable>()

  forAgent(options: { agentId: string }): ThreatTable {
    let table = this.tables.get(options.agentId)
    if (!table) {
      table = new ThreatTable()
      this.tables.set(options.agentId, table)
    }
    return table
  }

  peek(options: { agentId: string }): ThreatTable | null {
    return this.tables.get(options.agentId) ?? null
  }

  forgetEntity(options: { entityId: string }): void {
    for (const table of this.tables.values()) {
      table.remove({ entityId: options.entityId })
    }
    this.tables.delete(options.entityId)
  }

  removeAgent(options: { agentId: string }): void {
    this.tables.delete(options.agentId)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd colyseus-server && pnpm test -- src/tests/threat-registry.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Wire the registry onto `GameState`**

In `colyseus-server/src/schemas/GameState.ts`, add the import beside the existing AI imports:

```typescript
import { ThreatRegistry } from '../ai/threat/ThreatRegistry'
```

Add the field beside `worldInterface` (near line 32) — **non-synced, no `@type` decorator**, exactly like `battleManager`:

```typescript
  public threatRegistry: ThreatRegistry
```

And construct it in the constructor **before** `worldInterface` (near line 48), since Task 5 passes it in:

```typescript
    this.threatRegistry = new ThreatRegistry()
    this.worldInterface = new AIWorldInterface(this)
```

- [ ] **Step 6: Hook removal cleanup**

Still in `GameState.ts`, find the two existing `this.aiModule.unregisterAgent(...)` call sites (near lines 214 and 221). Immediately after **each** one, add:

```typescript
      this.threatRegistry.forgetEntity({ entityId: id })
```

for the line-214 site, and for the line-221 site (which uses `sessionId`):

```typescript
      this.threatRegistry.forgetEntity({ entityId: sessionId })
```

- [ ] **Step 7: Run the full suite and build**

Run: `cd colyseus-server && pnpm test && pnpm run build`
Expected: all existing tests still PASS (nothing reads the registry yet), build exit 0

- [ ] **Step 8: Commit**

```bash
git add colyseus-server/src/ai/threat/ThreatRegistry.ts \
        colyseus-server/src/tests/threat-registry.test.ts \
        colyseus-server/src/schemas/GameState.ts
git commit -m "feat: ThreatRegistry on GameState with entity-removal cleanup"
```

---

### Task 3: Write threat from resolved hits

**Files:**
- Modify: `colyseus-server/src/modules/BattleModule.ts` (the `applyDamage` call site at line ~100)
- Test: `colyseus-server/src/tests/threat-from-damage.test.ts`

**Interfaces:**
- Consumes: `ThreatRegistry.forAgent`, `ThreatTable.add` from Tasks 1-2.
- Produces: threat is populated as a side effect of hit resolution. No new public API.

**Design note for the implementer:** threat accrues in the **target's** table, keyed by the **attacker**. A mob remembers who hit *it*. Accrual is unconditional (players get tables too) — the table is bounded, and it makes AI companions work without a second code path.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/threat-from-damage.test.ts`:

```typescript
import {
  addPlayerAt,
  buildTestRoom,
  enqueueHit,
  makeUnkillable,
  spawnRealMob,
  TestEnv,
  tickRoom,
  TICK_MS,
} from './f018-harness'

describe('threat accrues from resolved hits', () => {
  let env: TestEnv

  beforeEach(() => {
    jest.useFakeTimers()
    env = buildTestRoom('threat-damage')
  })

  afterEach(() => {
    env.dispose()
    jest.useRealTimers()
  })

  it('credits the attacker in the target mob threat table', async () => {
    const cx = env.state.width / 2
    const cy = env.state.height / 2
    const mob = spawnRealMob(env, cx, cy)
    makeUnkillable(mob)
    const player = addPlayerAt(env, 'p1', cx + 3, cy)
    makeUnkillable(player)

    // The established path: queue the hit, then tick so processActionMessages drains it.
    enqueueHit(env, player, mob, 25)
    for (let t = 0; t < 5; t++) await tickRoom(env, TICK_MS)

    const table = env.state.threatRegistry.peek({ agentId: mob.id })
    expect(table).not.toBeNull()
    expect(table!.valueOf({ entityId: player.id, now: performance.now() })).toBeGreaterThan(0)
  })

  it('leaves the mob with no threat entry when nothing hits it', async () => {
    const cx = env.state.width / 2
    const cy = env.state.height / 2
    const mob = spawnRealMob(env, cx, cy)
    makeUnkillable(mob)
    const player = addPlayerAt(env, 'p2', cx + 3, cy)
    makeUnkillable(player)

    for (let t = 0; t < 5; t++) await tickRoom(env, TICK_MS)

    const table = env.state.threatRegistry.peek({ agentId: mob.id })
    const value = table?.valueOf({ entityId: player.id, now: performance.now() }) ?? 0
    expect(value).toBe(0)
  })
})
```

> **Why the tick loop:** `enqueueHit` only *queues* — `BattleManager.addActionMessage` is drained by `processActionMessages()` during the simulation pass. Asserting immediately after `enqueueHit` would read an empty table and pass for the wrong reason.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && pnpm test -- src/tests/threat-from-damage.test.ts`
Expected: FAIL — `table` is `null` (nothing writes threat yet)

- [ ] **Step 3: Write the threat write**

In `colyseus-server/src/modules/BattleModule.ts`, locate:

```typescript
    // Apply damage to target
    const targetDied = this.applyDamage(target, damage)
```

Insert immediately **after** it:

```typescript
    // Threat: the target remembers who hit it (F-023). Written only on resolved
    // hits — never per tick — so quiet ticks cost nothing.
    if (damage > 0) {
      this.gameState.threatRegistry
        .forAgent({ agentId: target.id })
        .add({ entityId: attacker.id, amount: damage, now: performance.now() })
    }
```

The field is `this.gameState` (`BattleModule.ts:58`, set by the constructor at `:60`). Do **not** add a constructor parameter — the reference already exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd colyseus-server && pnpm test -- src/tests/threat-from-damage.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: Run the full suite and build**

Run: `cd colyseus-server && pnpm test && pnpm run build`
Expected: all PASS (nothing reads threat yet, so no behaviour change), build exit 0

- [ ] **Step 6: Commit**

```bash
git add colyseus-server/src/modules/BattleModule.ts \
        colyseus-server/src/tests/threat-from-damage.test.ts
git commit -m "feat: accrue threat on resolved hits"
```

---

### Task 4: Rename `nearestPlayer` → `preferredTarget` (pure rename, no behaviour change)

**Files:**
- Modify: `colyseus-server/src/ai/AIWorldInterface.ts:197,218,219,239`
- Modify: `colyseus-server/src/ai/behaviors/AgentBehaviors.ts:12,128,131,174,179,236,239,271`
- Modify: `colyseus-server/src/ai/behaviors/NPCBehaviors.ts:35,96,108`
- Modify: `colyseus-server/src/ai/AIModule.ts:305-306,328`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AgentEnvironment.preferredTarget` / `AgentEnvironment.distanceToPreferredTarget`, replacing `nearestPlayer` / `distanceToNearestPlayer`. Task 5 depends on these names.

**Why this is its own task:** it touches four files mechanically. Keeping it separate from the behaviour change means a reviewer can confirm "no logic moved" in one diff, and the real change in the next.

Leave `nearestMob` / `distanceToNearestMob` **alone** — those really are nearest-based and are used by player-side and NPC-side targeting that this feature does not change.

- [ ] **Step 1: Confirm the current suite is green (baseline)**

Run: `cd colyseus-server && pnpm test 2>&1 | tail -5`
Expected: note the pass/fail counts — the same numbers must hold at Step 4.

- [ ] **Step 2: Perform the rename**

Rename in this order, compiling between each file if you like:

```bash
cd colyseus-server
grep -rln 'nearestPlayer\|distanceToNearestPlayer' src/ai
```

In every hit, rename **only** these two identifiers:
- `nearestPlayer` → `preferredTarget`
- `distanceToNearestPlayer` → `distanceToPreferredTarget`

Do **not** rename `getNearestPlayer`, `getNearestPlayerOnly`, or `getNearestOppositeTeam` — those are `AIWorldInterface` methods that keep their meaning (Task 5 leaves them in place as the fallback path).

Update the comment at `AIWorldInterface.ts:208` from:

```typescript
    // Chase/attack target = nearest opposite team (player, NPC, or mob by teamId).
```

to:

```typescript
    // Chase/attack target. Both AttackBehavior and ChaseBehavior read the single
    // field this produces, which is why they cannot disagree — and why Task 5
    // only has to substitute here.
```

- [ ] **Step 3: Run the full suite**

Run: `cd colyseus-server && pnpm test 2>&1 | tail -5`
Expected: **identical** pass/fail counts to Step 1. Any change means the rename altered behaviour — revert and redo.

- [ ] **Step 4: Verify the build compiles**

Run: `cd colyseus-server && pnpm run build`
Expected: exit 0. This step is not optional — ts-jest caches per-file, so a green Jest run does not prove the rename type-checks.

- [ ] **Step 5: Commit**

```bash
git add colyseus-server/src/ai
git commit -m "refactor: rename nearestPlayer to preferredTarget in AI env"
```

---

### Task 5: `selectTarget` — the seam

**Files:**
- Create: `colyseus-server/src/ai/targeting/selectTarget.ts`
- Modify: `colyseus-server/src/ai/AIWorldInterface.ts` (the `getNearestOppositeTeam` call at line ~209)
- Test: `colyseus-server/src/tests/select-target.test.ts`

**Interfaces:**
- Consumes: `ThreatTable` (Task 1), `THREAT_CONFIG` (Task 1), `preferredTarget` naming (Task 4).
- Produces:
  - `selectTarget(options: { candidates: TargetCandidate[]; table: ThreatTable | null; currentTargetId: string; now: number }): TargetCandidate | null`
  - `interface TargetCandidate { id: string; distance: number }`

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/select-target.test.ts`:

```typescript
import { selectTarget } from '../ai/targeting/selectTarget'
import { ThreatTable } from '../ai/threat/ThreatTable'
import { THREAT_CONFIG } from '../config/combat/threat'

const near = { id: 'near', distance: 2 }
const far = { id: 'far', distance: 40 }

describe('selectTarget', () => {
  it('falls back to nearest when no candidate has threat', () => {
    const picked = selectTarget({
      candidates: [far, near],
      table: new ThreatTable(),
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('falls back to nearest when there is no table at all', () => {
    const picked = selectTarget({
      candidates: [far, near],
      table: null,
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('prefers the highest-threat candidate over the nearest', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'far', amount: 500, now: 0 })
    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('far')
  })

  it('holds the current target when a challenger is inside switchMargin', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'near', amount: 100, now: 0 })
    // Just under the margin — not enough to steal.
    table.add({ entityId: 'far', amount: 100 * THREAT_CONFIG.switchMargin - 1, now: 0 })

    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: 'near',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('switches when a challenger clears switchMargin', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'near', amount: 100, now: 0 })
    table.add({ entityId: 'far', amount: 100 * THREAT_CONFIG.switchMargin + 1, now: 0 })

    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: 'near',
      now: 0,
    })
    expect(picked?.id).toBe('far')
  })

  it('a taunt overrides both threat order and the margin', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'far', amount: 10_000, now: 0 })
    table.taunt({ entityId: 'near', now: 0 })

    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: 'far',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('ignores a taunt whose target is no longer a candidate', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'far', amount: 10, now: 0 })
    table.taunt({ entityId: 'gone', now: 0 })

    const picked = selectTarget({
      candidates: [far],
      table,
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('far')
  })

  it('returns null with no candidates', () => {
    expect(
      selectTarget({ candidates: [], table: new ThreatTable(), currentTargetId: '', now: 0 })
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && pnpm test -- src/tests/select-target.test.ts`
Expected: FAIL — `Cannot find module '../ai/targeting/selectTarget'`

- [ ] **Step 3: Write the implementation**

Create `colyseus-server/src/ai/targeting/selectTarget.ts`:

```typescript
import { ThreatTable } from '../threat/ThreatTable'
import { THREAT_CONFIG } from '../../config/combat/threat'

export interface TargetCandidate {
  id: string
  distance: number
}

/**
 * Pick a target (F-023).
 *
 * Rules, in order:
 *   1. An active taunt wins outright, if its target is still a candidate.
 *   2. Otherwise the highest-threat candidate wins...
 *   3. ...unless the current target is still within `switchMargin`, in which case
 *      it is held. Without this, two similarly-threatening players flip the target
 *      every tick.
 *   4. With no threat at all, fall back to NEAREST — byte-identical to pre-F-023
 *      behaviour, which is what keeps the blast radius survivable.
 *
 * Pure: no world access, no mutation. Cost is O(candidates), the same as the
 * nearest-scan it replaces.
 */
export function selectTarget(options: {
  candidates: TargetCandidate[]
  table: ThreatTable | null
  currentTargetId: string
  now: number
}): TargetCandidate | null {
  const { candidates, table, currentTargetId, now } = options
  if (candidates.length === 0) return null

  const nearest = (): TargetCandidate =>
    candidates.reduce((best, c) => (c.distance < best.distance ? c : best))

  if (!table) return nearest()

  // Rule 1 — taunt.
  const taunted = table.tauntedTarget({ now })
  if (taunted !== null) {
    const match = candidates.find(c => c.id === taunted)
    if (match) return match
  }

  // Rule 2 — highest threat.
  const best = table.best({ candidateIds: candidates.map(c => c.id), now })
  if (best === null) return nearest() // Rule 4

  // Rule 3 — hysteresis: hold the incumbent unless clearly beaten.
  if (currentTargetId !== '' && currentTargetId !== best.entityId) {
    const incumbent = candidates.find(c => c.id === currentTargetId)
    if (incumbent) {
      const incumbentThreat = table.valueOf({ entityId: currentTargetId, now })
      if (incumbentThreat > 0 && best.threat < incumbentThreat * THREAT_CONFIG.switchMargin) {
        return incumbent
      }
    }
  }

  return candidates.find(c => c.id === best.entityId) ?? nearest()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd colyseus-server && pnpm test -- src/tests/select-target.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Wire it into the seam**

In `colyseus-server/src/ai/AIWorldInterface.ts`, replace the single-nearest lookup inside `buildAgentEnvironment`. Find:

```typescript
    const nearestEnemy = this.getNearestOppositeTeam(position, myTeamId, agent.id)
    const distanceEnemy = nearestEnemy ? this.calculateDistance(position, nearestEnemy) : Infinity
```

Replace with:

```typescript
    const nearestEnemy = this.pickTarget(agent, position, myTeamId)
    const distanceEnemy = nearestEnemy ? this.calculateDistance(position, nearestEnemy) : Infinity
```

Then add this private method to `AIWorldInterface` (place it directly below `getNearestOppositeTeam`, which stays — it is still used by the legacy helpers):

```typescript
  /**
   * Threat-aware replacement for the nearest-opposite-team scan (F-023).
   *
   * Collects the same candidate set the old scan considered, then defers the choice
   * to `selectTarget`. With an empty threat table this returns exactly what
   * `getNearestOppositeTeam` returned.
   */
  private pickTarget(
    agent: IAgent,
    position: { x: number; y: number },
    myTeamId: string | undefined
  ): WorldLife | null {
    const byId = new Map<string, WorldLife>()
    const candidates: TargetCandidate[] = []

    const consider = (other: WorldLife) => {
      if (!other.isAlive) return
      if (other.id === agent.id) return
      if (myTeamId && other.teamId && myTeamId === other.teamId) return
      byId.set(other.id, other)
      candidates.push({ id: other.id, distance: this.calculateDistance(position, other) })
    }

    for (const p of this.gameState.players.values()) consider(p)
    for (const n of this.gameState.npcs.values()) consider(n)
    for (const m of this.gameState.mobs.values()) consider(m)

    const picked = selectTarget({
      candidates,
      table: this.gameState.threatRegistry.peek({ agentId: agent.id }),
      currentTargetId: agent.currentAttackTarget,
      now: performance.now(),
    })

    return picked ? (byId.get(picked.id) ?? null) : null
  }
```

Add the imports at the top of the file:

```typescript
import { selectTarget, TargetCandidate } from './targeting/selectTarget'
```

- [ ] **Step 6: Run the full suite**

Run: `cd colyseus-server && pnpm test 2>&1 | tail -20`
Expected: the same counts as Task 4 Step 1, **except** `f018-boss-spread.test.ts` may now behave differently — that file is re-gated in Task 6. If any *other* AI test regresses, the fallback path is wrong: it must return the nearest candidate when the table is empty.

- [ ] **Step 7: Verify the build compiles**

Run: `cd colyseus-server && pnpm run build`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add colyseus-server/src/ai/targeting/selectTarget.ts \
        colyseus-server/src/tests/select-target.test.ts \
        colyseus-server/src/ai/AIWorldInterface.ts
git commit -m "feat: threat-aware target selection at the AI env seam"
```

---

### Task 6: Taunt operation and debug command

**Files:**
- Modify: `colyseus-server/src/modules/BattleModule.ts` (new public method)
- Modify: `colyseus-server/src/modules/BattleManager.ts` (public façade — `battleModule` is private at `:22`)
- Modify: `colyseus-server/src/rooms/handlers/DebugCommandHandler.ts:8-13` (register block)
- Test: `colyseus-server/src/tests/taunt.test.ts`

**Interfaces:**
- Consumes: `ThreatTable.taunt` (Task 1), `ThreatRegistry.forAgent` (Task 2).
- Produces: `BattleModule.applyTaunt(options: { tauntingEntityId: string; targetAgentId: string }): void`, and a `debug_taunt` room message taking `{ mobId: string }`.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/taunt.test.ts`:

```typescript
import { buildTestRoom, spawnRealMob, addPlayerAt, makeUnkillable, TestEnv } from './f018-harness'
import { THREAT_CONFIG } from '../config/combat/threat'

describe('taunt', () => {
  let env: TestEnv

  beforeEach(() => {
    jest.useFakeTimers()
    env = buildTestRoom('taunt')
  })

  afterEach(() => {
    env.dispose()
    jest.useRealTimers()
  })

  it('puts the taunter on top of a table led by someone else', () => {
    const cx = env.state.width / 2
    const cy = env.state.height / 2
    const mob = spawnRealMob(env, cx, cy)
    makeUnkillable(mob)
    const dps = addPlayerAt(env, 'dps', cx + 3, cy)
    const tank = addPlayerAt(env, 'tank', cx + 9, cy)
    makeUnkillable(dps)
    makeUnkillable(tank)

    const now = performance.now()
    env.state.threatRegistry
      .forAgent({ agentId: mob.id })
      .add({ entityId: dps.id, amount: 1000, now })

    env.battleManager.applyTaunt({
      tauntingEntityId: tank.id,
      targetAgentId: mob.id,
    })

    const table = env.state.threatRegistry.forAgent({ agentId: mob.id })
    expect(table.tauntedTarget({ now: performance.now() })).toBe(tank.id)
    expect(
      table.best({ candidateIds: [dps.id, tank.id], now: performance.now() })?.entityId
    ).toBe(tank.id)
  })

  it('is a no-op against an agent with no table rather than throwing', () => {
    expect(() =>
      env.battleManager.applyTaunt({
        tauntingEntityId: 'someone',
        targetAgentId: 'no-such-mob',
      })
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && pnpm test -- src/tests/taunt.test.ts`
Expected: FAIL — `applyTaunt is not a function`

- [ ] **Step 3: Add the threat operation**

In `colyseus-server/src/modules/BattleModule.ts`, add a public method beside the other combat operations:

```typescript
  /**
   * Force `tauntingEntityId` to the top of `targetAgentId`'s threat table and pin
   * it for THREAT_CONFIG.tauntLockMs (F-023).
   *
   * This is the threat OPERATION. Whether any class has a taunt ability is content,
   * not this system — combat logic stays centralised here rather than in a system.
   */
  applyTaunt(options: { tauntingEntityId: string; targetAgentId: string }): void {
    this.gameState.threatRegistry
      .forAgent({ agentId: options.targetAgentId })
      .taunt({ entityId: options.tauntingEntityId, now: performance.now() })
  }
```

`BattleManager.battleModule` is **private** (`BattleManager.ts:22`), so tests cannot reach it directly. Forward it — add this public method to `colyseus-server/src/modules/BattleManager.ts`:

```typescript
  /** Façade for BattleModule.applyTaunt — battleModule is private (F-023). */
  applyTaunt(options: { tauntingEntityId: string; targetAgentId: string }): void {
    this.battleModule.applyTaunt(options)
  }
```

- [ ] **Step 4: Register the debug command**

In `colyseus-server/src/rooms/handlers/DebugCommandHandler.ts`, add to the `register()` block beside the existing `debug_*` registrations:

```typescript
    this.room.onMessage('debug_taunt', this.handleTaunt.bind(this))
```

And add the handler, following the shape of the neighbouring handlers in that file:

```typescript
  private handleTaunt(client: { sessionId: string }, message: { mobId: string }): void {
    if (!message?.mobId) return
    this.room.state.battleManager.applyTaunt({
      tauntingEntityId: client.sessionId,
      targetAgentId: message.mobId,
    })
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd colyseus-server && pnpm test -- src/tests/taunt.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 6: Run the full suite and build**

Run: `cd colyseus-server && pnpm test && pnpm run build`
Expected: PASS (except the boss file, re-gated next), build exit 0

- [ ] **Step 7: Commit**

```bash
git add colyseus-server/src/modules/BattleModule.ts \
        colyseus-server/src/modules/BattleManager.ts \
        colyseus-server/src/rooms/handlers/DebugCommandHandler.ts \
        colyseus-server/src/tests/taunt.test.ts
git commit -m "feat: taunt threat operation and debug_taunt command"
```

---

### Task 7: Re-gate the F-018 boss test

**Files:**
- Modify: `colyseus-server/src/tests/f018-boss-spread.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing consumed downstream.

**This is the acceptance task.** Read spec §6 before starting. The headline: the `it.failing` even-spread assertion is **deleted, not inverted** — a working threat table concentrates boss damage on the tank, so flipping that assertion green would mean the system is broken.

- [ ] **Step 1: Replace the file header**

Replace the whole block comment at the top of `f018-boss-spread.test.ts` (lines 1-47) with:

```typescript
/**
 * F-018 Phase 5 / Task 5.2, re-gated by F-023.
 *
 * ── HISTORY ──────────────────────────────────────────────────────────────────
 * This file originally measured whether nearest-opposite-team targeting plus
 * knockback was enough to make a boss rotate targets. It was not: 21 of 24 swings
 * landed on ONE player (87.5% of damage), in every geometry tried. The finding was
 * pinned, and an even-spread assertion was parked as `it.failing` so it would turn
 * red the moment target rotation started working.
 *
 * ── WHY THAT ASSERTION IS GONE ───────────────────────────────────────────────
 * F-023 replaced distance-based selection with a THREAT TABLE. A threat system
 * does not spread a boss's damage — it CONCENTRATES it, deliberately, on whoever
 * holds aggro. That is what threat is for. So the even-spread bound was never the
 * right acceptance signal for this design: passing it would have meant the threat
 * system was NOT working.
 *
 * Two further reasons it could not have worked as written:
 *   - Players in this test never attack (`input.attack = false`, so wind-up does
 *     not deflect incoming melee). Damage-threat would be identically zero for all
 *     four, the table would be empty, and selection would fall back to distance —
 *     leaving the measurement unchanged.
 *   - The model's `÷n` even-spread branch is the NO-HEALER reading
 *     (tools/combat-lab/CHECKLIST.md:291-295). Under the trinity roles this game
 *     targets, CHECKLIST.md:129's sustain equation governs instead.
 *
 * The even-spread assertion is therefore DELETED rather than inverted, and replaced
 * by mechanism gates below. See docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md.
 *
 * ── WHAT IS STILL UNVERIFIED ─────────────────────────────────────────────────
 * Healer, mana and healing do not exist yet, so the boss branch of the balance
 * model remains unverified against the simulation. These gates prove the MECHANISM
 * is correct. They do NOT prove the NUMBERS are. Do not read a green run here as a
 * validated boss ladder.
 */
```

- [ ] **Step 2: Re-document the retained pinned test**

Keep the `it('PINNED FINDING: ...')` test body **exactly as it is** — it still passes, because concentration is still what happens. Only change its name and add a comment above it:

```typescript
  // Concentration is now INTENTIONAL: threat picks a victim and hysteresis keeps it
  // there. This test is retained to prove the boss still commits to a target rather
  // than dithering — the failure mode a badly-tuned switchMargin would produce.
  it('the boss commits to one victim rather than dithering', async () => {
```

- [ ] **Step 3: Delete the `it.failing` block**

Remove lines 170-178 entirely — the comment `// Jest inverts this: ...` through the closing `)` of the `it.failing(...)` call. Nothing replaces it in place; the gates below are the replacement.

- [ ] **Step 4: Write the new gates**

Append inside the same `describe`:

```typescript
  it('GATE 1: threat decides — the damaging player is targeted over the nearer one', async () => {
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    // players[2] is across the ring from the boss's opening pick, so distance and
    // threat disagree — which is the whole point.
    const farPlayer = players[2]
    table.add({ entityId: farPlayer.id, amount: 10_000, now: performance.now() })

    const { ledger } = await fight()
    expect(ledger.worstShare().id).toBe(farPlayer.id)
  })

  it('GATE 2: taunt transfers the target and holds it', async () => {
    const tank = players[1]
    const dps = players[3]
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    table.add({ entityId: dps.id, amount: 10_000, now: performance.now() })

    env.battleManager.applyTaunt({
      tauntingEntityId: tank.id,
      targetAgentId: boss.id,
    })

    // One decision tick is enough — selection is re-evaluated every environment build.
    await tickRoom(env, TICK_MS)
    expect(boss.currentAttackTarget).toBe(tank.id)
    expect(table.tauntedTarget({ now: performance.now() })).toBe(tank.id)
  })

  it('GATE 3: after the lock expires the target returns to top threat', async () => {
    const tank = players[1]
    const dps = players[3]
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    table.add({ entityId: dps.id, amount: 1e9, now: performance.now() })
    env.battleManager.applyTaunt({ tauntingEntityId: tank.id, targetAgentId: boss.id })

    await tickRoom(env, TICK_MS)
    expect(boss.currentAttackTarget).toBe(tank.id)

    // Advance past the lock. dps threat is enormous, so it must reclaim the target.
    jest.advanceTimersByTime(THREAT_CONFIG.tauntLockMs + 1000)
    for (let t = 0; t < 5; t++) await tickRoom(env, TICK_MS)

    expect(table.tauntedTarget({ now: performance.now() })).toBeNull()
    expect(boss.currentAttackTarget).toBe(dps.id)
  })

  it('GATE 4: a zero-threat party still falls back to nearest', async () => {
    // No threat is seeded at all. This pins pre-F-023 behaviour: the boss must
    // still pick SOMEBODY and still land damage, exactly as it did before.
    const { ledger, perTarget } = await fight()
    expect(swings.length).toBeGreaterThan(0)
    expect(ledger.total).toBeGreaterThan(0)
    expect(perTarget.size).toBe(PARTY)
  })

  it('GATE 5: threat inside switchMargin does not flip the target tick-to-tick', async () => {
    const a = players[0]
    const b = players[1]
    const now = performance.now()
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    table.add({ entityId: a.id, amount: 1000, now })
    // Deliberately just inside the margin — must NOT steal the target.
    table.add({ entityId: b.id, amount: 1000 * THREAT_CONFIG.switchMargin - 1, now })

    await tickRoom(env, TICK_MS)
    const settled = boss.currentAttackTarget

    const seen = new Set<string>()
    for (let t = 0; t < 20; t++) {
      await tickRoom(env, TICK_MS)
      seen.add(boss.currentAttackTarget)
    }

    expect(seen.size).toBe(1)
    expect(seen.has(settled)).toBe(true)
  })
```

Add the import at the top of the file:

```typescript
import { THREAT_CONFIG } from '../config/combat/threat'
```

- [ ] **Step 5: Run the boss file**

Run: `cd colyseus-server && pnpm test -- src/tests/f018-boss-spread.test.ts`
Expected: PASS — 6 tests (1 retained + 5 gates), **0 failing, 0 skipped**. There must be no `it.failing` left in the file:

```bash
grep -c 'it.failing' src/tests/f018-boss-spread.test.ts   # expect 0
```

- [ ] **Step 6: Run the full suite and build**

Run: `cd colyseus-server && pnpm test && pnpm run build`
Expected: all PASS, build exit 0

- [ ] **Step 7: Commit**

```bash
git add colyseus-server/src/tests/f018-boss-spread.test.ts
git commit -m "test: re-gate boss spread onto threat mechanism gates"
```

---

### Task 8: Close out — spec status and follow-up ideas

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md` (frontmatter `status`)
- Create: two idea folders via the backlog script

- [ ] **Step 1: File the cleave follow-up**

```bash
python3 ~/.claude/ps-release-workflow/scripts/new_idea.py \
  "Boss multi-target cleave — implement AreaAttackStrategy"
```

In the created `spec.md`, record: `AttackCharacteristicType.AREA` is declared but unimplemented (`attackStrategyFactory.ts:102-104` is a `TODO` + `console.warn`); implementing it also requires fixing the F-017 element fallback at `MobLifeCycleManager.ts:250`, where an AREA-only mob silently loses its configured `element`. Note that F-023 deliberately deferred this.

- [ ] **Step 2: File the model-reconciliation follow-up**

```bash
python3 ~/.claude/ps-release-workflow/scripts/new_idea.py \
  "Boss branch: replace the divide-by-n even-spread with the trinity sustain reading"
```

In the created `spec.md`, record: `CHECKLIST.md:291-295` states even-spread as load-bearing **"without healing"**; `:111` and `:129` already derive the tank-absorbs / healer-funds alternative (`sustain = 1 − n²/(R × a × d × h)`, SSS needing healing to replace 93.4% of boss output). With trinity chosen, the `÷n` branch is the wrong reading. This is combat-lab arithmetic, not server code, and is blocked until healing exists.

> **Implementer note:** if `new_idea.py` is not the script name in your checkout, run `/ps-release-workflow:idea` instead and paste the same content.

- [ ] **Step 3: Flip the spec status**

In `docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md`, change the frontmatter:

```yaml
status: "IMPLEMENTED in F-023 — release 1.6"
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md .claude/idea_backlog
git commit -m "docs: mark F-023 implemented and file the two deferred follow-ups"
```

- [ ] **Step 5: Gate 1**

Run: `./scripts/precheck.sh`
Expected: exit 0. Fix anything it reports before shipping.

---

## Per-phase quality gate

Every task above ends with tests + build. On top of that, after **Task 5** and after **Task 7** — the two tasks that change runtime behaviour — run an independent adversarial review of that task's diff before advancing (`/ecc:code-review` or a fresh reviewer subagent), act on the findings while the diff is small, then re-run `pnpm test && pnpm run build`. Do not carry review findings forward as "later".

## Risks

| risk | mitigation |
| --- | --- |
| Threat selection regresses non-boss AI | Rule 4 fallback makes an empty table byte-identical to today; Task 4 Step 3 asserts unchanged suite counts; GATE 4 pins it permanently |
| Target thrashing between similar players | `switchMargin` hysteresis, gated by GATE 5 |
| Threat map grows with player count | `maxEntries` cap with evict-lowest, unit-tested in Task 1 |
| Stale threat for disconnected players | `ThreatRegistry.forgetEntity` wired into both `unregisterAgent` sites in Task 2 |
| A green suite is read as a validated boss ladder | Stated in the test file header (Task 7 Step 1) and spec §8 |
