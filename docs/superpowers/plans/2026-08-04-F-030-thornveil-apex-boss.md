# F-030 Thornveil Apex Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Thorncrown Drake as a fightable, gate-clean boss — a tuned `MOB_TYPES` entry with an earth defence element, spawning alone in `boss_area`, with the character sheet Gate 2 requires.

**Architecture:** The drake already exists in `content/bestiary/bestiary.json` and is already placed in tier `heart` of `content/bestiary/placement-thornveil.json`, so no roster or placement edit is needed and gates G4/G6/G7 are never touched. This lane adds only the **runtime half** (a `MobTypeConfig`), the **defence-element wiring** that `MobTypeConfig` has always lacked, and the **character sheet** that binds the two. Boss behaviour needs no new abstraction: F-023's threat table is already universal.

**Tech Stack:** TypeScript (strict), Colyseus schemas, Jest (ts-jest), pnpm, Node ESM content gate.

## Global Constraints

- **Use `pnpm`, never `npm`** — except inside `scripts/`, which is its own package (`cd scripts && npm test`).
- **Never `git commit --amend`.** New commit on top, always.
- **Prettier must pass**: `cd colyseus-server && npm run format:check` is part of Gate 1.
- **Do not add any `@type` field to any schema class.** The C# contract is positional and both drift gates have zero callers — a new synced field silently desynchronises `Mob` decoding. `element` already exists on `WorldLife` (`WorldLife.ts:41`); this plan only feeds it.
- **Do not give the drake an attack element.** `colyseus-server/src/tests/element-entity.test.ts:53-61` asserts every shipped mob *attack* is neutral. Only the *defence* element is set.
- **The drake's element is `earth`** — matching its bestiary row. This is a knowing exception to G-ELEM, documented in `docs/superpowers/specs/2026-08-04-l3-boss-design.md` §3.2. Do not "fix" it to neutral or void.
- **The character sheet's lore text may not contain the literal word "boss"** (`content/bestiary/README.md:283`), and its `status` must be `concept` (a `shipped` status hard-FAILs `check_content.mjs:557-562`).
- **Mob id is snake_case `thorncrown_drake`**; bestiary/sheet id is kebab `mob-thorncrown-drake`; asset key is `mob:thorncrown_drake`.

## File Structure

| file | responsibility | task |
| --- | --- | --- |
| `colyseus-server/src/config/mobs/types.ts` | add `element?: Element` to `MobTypeConfig` | 1 |
| `colyseus-server/src/modules/MobLifeCycleManager.ts` | pass the configured element into `new Mob({...})` | 1 |
| `colyseus-server/src/tests/mob-defence-element.test.ts` | proves the wiring, and that omitting it stays neutral | 1 |
| `colyseus-server/src/config/mobs/definitions/thorncrownDrake.ts` | the drake's `MobTypeConfig` | 2 |
| `colyseus-server/src/config/mobs/index.ts` | register it in `MOB_TYPES` | 2 |
| `colyseus-server/generated/mob-types.json` | regenerated | 2 |
| `colyseus-server/generated/asset-keys.json` | regenerated | 2 |
| `colyseus-server/src/tests/boss-thorncrown-drake.test.ts` | roster↔runtime element drift guard, spawn, threat | 2, 3 |
| `colyseus-server/src/config/mapConfig.ts` | `boss_area` → drake, `count: 1` | 3 |
| `content/characters/mob-thorncrown-drake.md` | the Gate 2 blocker | 4 |

**Deliberately untouched:** `GameState.ts:107`'s fallback `new Mob({...})` randomises stats and has no `MobTypeConfig` in scope, so there is no element to pass. It is a legacy safety path and stays neutral.

---

### Task 1: Wire the defence element from config to spawn

`MobTypeConfig` has no `element` field and neither `new Mob({...})` call site passes one, so every mob in the game defends as `neutral`, making `DamageCalculator.ts:36-37`'s 7×7 table a no-op. This task lights the path without setting an element on any existing mob — every current `MobTypeConfig` omits the new optional field, so no shipped damage number moves.

**Files:**
- Modify: `colyseus-server/src/config/mobs/types.ts:71-87`
- Modify: `colyseus-server/src/modules/MobLifeCycleManager.ts:189-211`
- Test: `colyseus-server/src/tests/mob-defence-element.test.ts` (create)

**Interfaces:**
- Consumes: `Element` and `DEFAULT_ELEMENT` from `colyseus-server/src/config/combat/elements` (already imported by `types.ts` as `import type { Element }`).
- Produces: `MobTypeConfig.element?: Element` — Task 2's drake definition sets it.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/mob-defence-element.test.ts`:

```typescript
import { MOB_TYPES } from '../config/mobs'
import { MOB_STATS } from '../config/combatConfig'
import { Mob } from '../schemas/Mob'
import type { MobTypeConfig } from '../config/mobs/types'

/**
 * F-030: MobTypeConfig.element is the DEFENCE element (World Wisdom / F-017).
 * Before this change no mob ever received one, so every entity defended as neutral
 * and the 7x7 table in DamageCalculator was a no-op.
 */
describe('mob defence element', () => {
  it('is declarable on MobTypeConfig', () => {
    const config: MobTypeConfig = {
      id: 'test_earth',
      name: 'Test Earth',
      element: 'earth',
      stats: {},
      atkStrategies: [],
    }
    expect(config.element).toBe('earth')
  })

  it('reaches the spawned Mob', () => {
    const mob = new Mob({
      id: 'm1',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      element: 'earth',
      maxMoveSpeed: MOB_STATS.maxMoveSpeed,
      attackStrategies: [],
    })
    expect(mob.element).toBe('earth')
  })

  it('defaults to neutral when the config omits it', () => {
    const mob = new Mob({
      id: 'm2',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      element: undefined,
      maxMoveSpeed: MOB_STATS.maxMoveSpeed,
      attackStrategies: [],
    })
    expect(mob.element).toBe('neutral')
  })

  it('leaves every mob type that predates F-030 neutral', () => {
    for (const mobType of MOB_TYPES) {
      if (mobType.id === 'thorncrown_drake') continue
      expect(mobType.element ?? 'neutral').toBe('neutral')
    }
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd colyseus-server && npx tsc --noEmit
```
Expected: FAIL — `Object literal may only specify known properties, and 'element' does not exist in type 'MobTypeConfig'`.

- [ ] **Step 3: Add the field to `MobTypeConfig`**

In `colyseus-server/src/config/mobs/types.ts`, inside `export interface MobTypeConfig`, immediately after the `rotationSpeed` field:

```typescript
  /**
   * Elemental DEFENCE of this mob (World Wisdom / F-017). Omit for neutral.
   * This is the defender side; per-attack offence element lives on AttackDefinition.
   */
  element?: Element
```

`Element` is already imported at the top of the file — do not add a second import.

- [ ] **Step 4: Pass it through at spawn**

In `colyseus-server/src/modules/MobLifeCycleManager.ts`, inside the `new Mob({` call in `createAndRegisterMob`, add one line after `rotationSpeed: mobTypeConfig.rotationSpeed,`:

```typescript
      element: mobTypeConfig.element,
```

`WorldLife.ts:160` already normalises this — `this.element = isElement(opts.element) ? opts.element : DEFAULT_ELEMENT` — so `undefined` correctly yields `neutral`.

- [ ] **Step 5: Run the tests and the typecheck**

```bash
cd colyseus-server && npx tsc --noEmit && npm test -- src/tests/mob-defence-element.test.ts
```
Expected: tsc clean, 4 tests PASS.

- [ ] **Step 6: Prove the wiring is actually covered (delete-the-rule check)**

Temporarily delete the `element: mobTypeConfig.element,` line added in Step 4, run `npm test -- src/tests/mob-defence-element.test.ts`, and confirm **at least one test fails**. If nothing fails, the wiring is unprotected — add a spawn-level assertion through `MobLifeCycleManager` before continuing. Restore the line.

> This is the F-029 lesson: a green suite is not a covering suite.

- [ ] **Step 7: Run the full server suite for regressions**

```bash
cd colyseus-server && npm test 2>&1 | tail -20
```
Expected: no new failures. `element-entity.test.ts` must still pass — it asserts *attack* neutrality, which this task does not touch.

- [ ] **Step 8: Format and commit**

```bash
cd colyseus-server && npm run format
cd .. && git add colyseus-server/src/config/mobs/types.ts colyseus-server/src/modules/MobLifeCycleManager.ts colyseus-server/src/tests/mob-defence-element.test.ts
git commit -m "feat(F-030): wire mob defence element from config to spawn"
```

---

### Task 2: The Thorncrown Drake mob type

**Files:**
- Create: `colyseus-server/src/config/mobs/definitions/thorncrownDrake.ts`
- Modify: `colyseus-server/src/config/mobs/index.ts:1-20`
- Regenerate: `colyseus-server/generated/mob-types.json`, `colyseus-server/generated/asset-keys.json`
- Test: `colyseus-server/src/tests/boss-thorncrown-drake.test.ts` (create)

**Interfaces:**
- Consumes: `MobTypeConfig.element` from Task 1.
- Produces: exported const `thorncrownDrake: MobTypeConfig` with `id: 'thorncrown_drake'`; asset key `mob:thorncrown_drake` becomes available to Task 4's character sheet.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/boss-thorncrown-drake.test.ts`:

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'
import { MOB_TYPES } from '../config/mobs'

const REPO_ROOT = join(__dirname, '../../..')

type BestiaryDesign = { id: string; element?: string }

function bestiaryDesign(id: string): BestiaryDesign {
  const raw = readFileSync(join(REPO_ROOT, 'content/bestiary/bestiary.json'), 'utf8')
  const parsed = JSON.parse(raw) as BestiaryDesign[] | { designs: BestiaryDesign[] }
  const designs = Array.isArray(parsed) ? parsed : parsed.designs
  const found = designs.find(d => d.id === id)
  if (!found) throw new Error(`bestiary design ${id} not found`)
  return found
}

describe('Thorncrown Drake', () => {
  const drake = MOB_TYPES.find(m => m.id === 'thorncrown_drake')

  it('is registered in MOB_TYPES', () => {
    expect(drake).toBeDefined()
  })

  it('declares only strategies the factory can build', () => {
    // attackStrategyFactory only builds 'melee', 'spear' and 'doubleAttack'.
    for (const strategy of drake!.atkStrategies) {
      expect(['melee', 'spear', 'doubleAttack']).toContain(strategy.id)
    }
  })

  it('carries no ATTACK element (element-entity.test.ts must stay green)', () => {
    for (const strategy of drake!.atkStrategies) {
      for (const attack of strategy.attacks) {
        expect(attack.element ?? 'neutral').toBe('neutral')
      }
    }
  })

  // F-030: the roster<->runtime drift guard promised by the spec's §3.2 mitigation.
  // The earth defence element is a documented G-ELEM exception; this test makes it
  // impossible for the two sides to disagree silently.
  it('defends with the element its bestiary row declares', () => {
    const design = bestiaryDesign('mob-thorncrown-drake')
    expect(design.element).toBe('earth')
    expect(drake!.element).toBe(design.element)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd colyseus-server && npm test -- src/tests/boss-thorncrown-drake.test.ts
```
Expected: FAIL — `expect(drake).toBeDefined()` receives `undefined`.

- [ ] **Step 3: Create the mob definition**

Create `colyseus-server/src/config/mobs/definitions/thorncrownDrake.ts`:

```typescript
import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-030 — the Thornveil apex predator (bestiary id `mob-thorncrown-drake`, band 51-60).
 *
 * Boss-ness is expressed as tuned numbers plus a solo `boss_area` footprint, the same
 * pattern `double_attacker` already ships. F-023's threat table needs no switch: it is
 * written on every resolved hit and falls back to nearest-target when empty.
 *
 * `element: 'earth'` mirrors the bestiary row. That is a knowing exception to G-ELEM
 * ("a boss must be element-neutral in BOTH directions") — see
 * docs/superpowers/specs/2026-08-04-l3-boss-design.md section 3.2. Do not change it to
 * neutral or void without revisiting that decision.
 */
export const thorncrownDrake: MobTypeConfig = {
  id: 'thorncrown_drake',
  name: 'Thorncrown Drake',

  element: 'earth',

  hp: 1400,
  radius: 9,
  rotationSpeed: Math.PI / 6, // 30 deg/sec — a barn-sized drake turns slowly; the turn IS the tell
  stats: {
    attackRange: 4,
    chaseRange: 30,
    pDef: 6,
    armor: 3,
    maxMoveSpeed: 7,
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: MOB_STATS.pAtk * 2.5,
          atkWindUpTime: 800, // heavy telegraph — readable at boss scale
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.6,
              atkRange: 4,
            },
          },
        },
      ],
    },
  ],
}
```

- [ ] **Step 4: Register it in `MOB_TYPES`**

In `colyseus-server/src/config/mobs/index.ts`, add the import after the `doubleAttacker` import:

```typescript
import { thorncrownDrake } from './definitions/thorncrownDrake'
```

and add `thorncrownDrake,` as the last entry of the `MOB_TYPES` array.

- [ ] **Step 5: Regenerate both generated JSONs**

```bash
cd colyseus-server
bash scripts/codegen/gen-mob-types.sh
bash scripts/codegen/gen-asset-keys.sh
git diff --stat generated/
```
Expected: `generated/mob-types.json` gains `"thorncrown_drake"`, `generated/asset-keys.json` gains `mob:thorncrown_drake` with kind `character`.

> Skipping this fails `src/tests/codegen/event-asset-key-contract.test.ts`, which asserts the `MOB_TYPES` ↔ `asset-keys.json` map **both ways**.

- [ ] **Step 6: Run the tests**

```bash
cd colyseus-server && npx tsc --noEmit && npm test 2>&1 | tail -20
```
Expected: tsc clean; `boss-thorncrown-drake.test.ts` all PASS; `event-asset-key-contract.test.ts` PASS; `element-entity.test.ts` PASS; no new failures.

- [ ] **Step 7: Format and commit**

```bash
cd colyseus-server && npm run format
cd .. && git add colyseus-server/src/config/mobs/ colyseus-server/generated/ colyseus-server/src/tests/boss-thorncrown-drake.test.ts
git commit -m "feat(F-030): add Thorncrown Drake mob type with earth defence"
```

---

### Task 3: Give the drake the boss_area, alone

`boss_area` currently spawns **three** `double_attacker`s. The apex spawns alone.

**Files:**
- Modify: `colyseus-server/src/config/mapConfig.ts:52-60`
- Modify: `colyseus-server/src/tests/boss-thorncrown-drake.test.ts` (append)

**Interfaces:**
- Consumes: `thorncrownDrake.id` from Task 2.
- Produces: nothing downstream depends on this.

- [ ] **Step 1: Write the failing tests**

Append to `colyseus-server/src/tests/boss-thorncrown-drake.test.ts`, inside the existing `describe('Thorncrown Drake', ...)` block:

```typescript
  it('holds the boss_area alone', () => {
    const area = MAP_CONFIG.mobSpawnAreas.find(a => a.id === 'boss_area')
    expect(area).toBeDefined()
    expect(area!.mobType).toBe('thorncrown_drake')
    expect(area!.count).toBe(1)
  })

  it('spawns with its configured hp, element and mobTypeId', () => {
    // Verified signature: constructor is (roomId, state); the seed entrypoint is seedInitial().
    // GameState's constructor already builds and starts the AIModule that seedInitial needs.
    // Unlike mob-lifecycle.test.ts, this test must NOT mock ../config/mapConfig — the real
    // boss_area is the thing under test.
    const state = new GameState()
    const manager = new MobLifeCycleManager('test-room', state)
    manager.seedInitial()

    const spawned = [...state.mobs.values()].filter(m => m.mobTypeId === 'thorncrown_drake')
    expect(spawned).toHaveLength(1)
    expect(spawned[0].maxHealth).toBe(1400)
    expect(spawned[0].element).toBe('earth')

    state.aiModule.stop() // started by the GameState constructor; stop it or jest reports open handles
  })
```

and add to the file's imports:

```typescript
import { MAP_CONFIG } from '../config/mapConfig'
import { GameState } from '../schemas/GameState'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
```

> `seedInitial()` seeds **every** spawn area, so the drake arrives alongside the other mob types — filter by `mobTypeId`, do not assume `state.mobs` has one entry. If `aiModule.stop()` is not the actual teardown method, read `colyseus-server/src/tests/mob-lifecycle.test.ts`'s `afterEach` and copy it. Do not change production code to fit the test.

- [ ] **Step 2: Run and confirm failure**

```bash
cd colyseus-server && npm test -- src/tests/boss-thorncrown-drake.test.ts
```
Expected: FAIL — `expect(area!.mobType).toBe('thorncrown_drake')` receives `'double_attacker'`.

- [ ] **Step 3: Retarget the spawn area**

In `colyseus-server/src/config/mapConfig.ts`, in the `boss_area` entry, change:

```typescript
      mobType: 'double_attacker',
      count: 3,
```
to:
```typescript
      mobType: 'thorncrown_drake',
      count: 1,
```

Leave `x`, `y`, `width`, `height` unchanged.

- [ ] **Step 4: Run the tests**

```bash
cd colyseus-server && npm test 2>&1 | tail -20
```
Expected: all PASS, including `src/tests/map-spawn-binding.test.ts` (it asserts every spawn area's `mobType` resolves).

- [ ] **Step 5: Format and commit**

```bash
cd colyseus-server && npm run format
cd .. && git add colyseus-server/src/config/mapConfig.ts colyseus-server/src/tests/boss-thorncrown-drake.test.ts
git commit -m "feat(F-030): boss_area holds one Thorncrown Drake"
```

---

### Task 4: The character sheet — the Gate 2 blocker

`scripts/check_content.mjs:586-590` escalates *"character key X has no sheet"* to a hard failure under `--require-complete`, and `scripts/integration.sh:81` passes that flag. Baseline is exactly 8 keys / 8 sheets. Task 2 made it 9 keys / 8 sheets, so **the release cannot promote until this file exists.**

**Files:**
- Create: `content/characters/mob-thorncrown-drake.md`

**Interfaces:**
- Consumes: asset key `mob:thorncrown_drake` minted in Task 2's `generated/asset-keys.json`.
- Produces: nothing downstream.

- [ ] **Step 1: Prove the gate is currently red**

```bash
cd scripts && npm ci --silent
cd .. && node scripts/check_content.mjs --require-complete; echo "exit=$?"
```
Expected: `FAIL coverage: character key "mob:thorncrown_drake" has no sheet`, `exit=1`.

> Note `; echo "exit=$?"` on its own — `$?` after a pipe reports the last command in the pipe, not the gate.

- [ ] **Step 2: Write the sheet**

Create `content/characters/mob-thorncrown-drake.md`:

```markdown
---
id: mob-thorncrown-drake
assetKey: "mob:thorncrown_drake"
name: "Thorncrown Drake"
role: boss
status: concept
tier: seed
stats:
  archetype: bruiser
  durability: high
  speed: mid
  threat: melee
links:
  story: [faction-unaligned]
---

## Lore

The old one the bramble drakes get out of the way for. It has lived in the deep
veil long enough that the canes grow through its back plates, and it carries a
hedge on its spine wherever it goes. The bramble-kin have routed their lanes
around it for two generations and will not say why out loud. Nothing in the
Thornveil disputes the ground it is standing on.

## Visual Brief

A heavy four-legged drake the size of a barn: bark-brown plates with living
black cane rooted along the spine, head crowned in thorn growth and old
scarring. Seed rig until re-forged — frame it markedly larger than the wilds
baseline (server radius 9 vs 4), feet-pivot, and read the turn as slow. Bespoke
target when forged: the crown of cane should be the silhouette, visible before
the head is.

## Design Notes

`role:boss` — hp 1400, radius 9 and a solo `boss_area` footprint set it apart
from the wilds (server config
`colyseus-server/src/config/mobs/definitions/thorncrownDrake.ts`; numbers stay
server-side, v1 boundary). Enum intent: bruiser / high durability / mid speed /
melee threat, matching its bestiary row.

Defence element `earth` mirrors the bestiary row and is a documented exception to
G-ELEM — see `docs/superpowers/specs/2026-08-04-l3-boss-design.md` section 3.2.
The slow rotation is the telegraph: the wind-up is long enough to walk out of.
```

> The lore text must not contain the literal word "boss" (`content/bestiary/README.md:283`). The `Design Notes` section quoting `role:boss` mirrors the existing `mob-double-attacker.md` sheet, which passes the gate today.

- [ ] **Step 3: Run the gate and confirm green**

```bash
node scripts/check_content.mjs --require-complete; echo "exit=$?"
```
Expected: `9 sheets, ... 0 failures, 0 warnings`, `exit=0`.

- [ ] **Step 4: Run the scripts suite**

```bash
cd scripts && npm test 2>&1 | tail -10
```
Expected: all pass (162 baseline).

- [ ] **Step 5: Commit**

```bash
git add content/characters/mob-thorncrown-drake.md
git commit -m "feat(F-030): character sheet for the Thorncrown Drake"
```

---

### Task 5: Threat behaviour, full gates, and live observation

Proves the boss actually behaves like one, then clears both gates.

**Files:**
- Modify: `colyseus-server/src/tests/boss-thorncrown-drake.test.ts` (append)

- [ ] **Step 1: Write the threat test**

Append inside the existing `describe` block. Read `colyseus-server/src/tests/` for an existing threat test first and copy its construction pattern for `BattleModule` / `ThreatRegistry` — do not invent one.

```typescript
  it('remembers who hit it (F-023 threat)', () => {
    const state = new GameState()
    const manager = new MobLifeCycleManager('test-room', state)
    manager.seedInitial()
    const drake = [...state.mobs.values()].find(m => m.mobTypeId === 'thorncrown_drake')!

    state.threatRegistry
      .forAgent({ agentId: drake.id })
      .add({ entityId: 'attacker-1', amount: 50, now: performance.now() })

    const table = state.threatRegistry.peek({ agentId: drake.id })
    expect(table).not.toBeNull()
    expect(table!.best({ candidateIds: ['attacker-1'], now: performance.now() })).toBe('attacker-1')
  })
```

- [ ] **Step 2: Run it**

```bash
cd colyseus-server && npm test -- src/tests/boss-thorncrown-drake.test.ts
```
Expected: all PASS.

- [ ] **Step 3: Gate 1 — the full precheck**

```bash
cd <worktree-root> && ./scripts/precheck.sh --no-install 2>&1 | tail -30; echo "exit=$?"
```
Expected: all eleven checks pass, `exit=0`. This covers contracts build, server `tsc --noEmit` + jest + prettier, nakama `tsc --noEmit` + jest, client suite, art-forge, and the combat-lab model gates.

> If contracts typecheck oddly, rebuild first: `cd contracts && pnpm build`. A stale `dist` typechecks green against the OLD types.

- [ ] **Step 4: Gate 2's content bar**

```bash
node scripts/check_content.mjs --require-complete; echo "exit=$?"
```
Expected: `exit=0`.

- [ ] **Step 5: Observe it live — not just green**

```bash
cd colyseus-server && npm run dev
```
In a second shell, open `http://localhost:3001` in a browser to force room creation, then:

```bash
curl -s http://localhost:2567/rooms
curl -s http://localhost:2567/api/rooms/<roomId>/mobs | python3 -m json.tool | head -40
```
Expected: exactly one mob with `"mobTypeId": "thorncrown_drake"` and `"maxHealth": 1400`. Record the actual output in the completion report — a green suite is not evidence the server runs.

- [ ] **Step 6: Commit**

```bash
git add colyseus-server/src/tests/boss-thorncrown-drake.test.ts
git commit -m "test(F-030): Thorncrown Drake threat behaviour"
```

---

## Per-task quality gate

Every task above ends with the same five beats before the next one starts:

1. **Implement** the change.
2. **Verify** — run it; paste the output. No "should work".
3. **Review** — an independent adversarial review of *that task's diff only* (fresh subagent / `code-reviewer` / `typescript-reviewer`). Self-review does not count.
4. **Refactor** — act on the review while the diff is small.
5. **Re-verify** — confirm the refactor did not break step 2.

## Definition of done

- [ ] `./scripts/precheck.sh` exits 0.
- [ ] `node scripts/check_content.mjs --require-complete` exits 0.
- [ ] `cd scripts && npm test` passes.
- [ ] The drake observed live via the REST API with the correct `maxHealth` and `mobTypeId`.
- [ ] The delete-the-rule check in Task 1 Step 6 confirmed the element wiring is covered.
- [ ] Every task's diff independently reviewed.
