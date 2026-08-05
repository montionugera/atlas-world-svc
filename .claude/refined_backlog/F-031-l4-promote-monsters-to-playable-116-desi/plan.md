# F-031 — L4 Promote Monsters To Playable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mint three Thornveil monsters through the full chain (bestiary design → mob type → character sheet → spawn table → a mob that spawns and attacks in a running room), and leave behind a derivation rule plus two gates that make the remaining ~20 bases cheap and un-driftable.

**Architecture:** Power and character live on two independent axes — the F-029 depth *tier* sets the numbers via a single `tierFactor`, and the bestiary row's *enums* set the shape. No new fields on `MobTypeConfig`; F-030 already established that a species is simply its own `MOB_TYPES` entry. The authored (`content/maps/`) and runtime (`config/mapConfig.ts`) spawn tables stay separate — I-015 owns unifying them — but a new codegen artifact plus a drift gate binds them so they cannot diverge further.

**Tech Stack:** TypeScript (strict) + ts-node codegen + Jest (ts-jest) for the server; plain `.mjs` + `node --test` for the content gates; ComfyUI / Z-Image Turbo via `tools/art-forge` for concept art.

## Global Constraints

- **Canonical design:** `docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md`. It is authoritative; this plan implements it.
- **Do NOT retarget the existing `thornveil_skirmishers` spawn area.** `spear_thrower` is `faction-thornveil`'s canonical mob in `content/story/factions.json:38`, `content/story/style.md:144` and `content/story/bible.md:58`. Stranding it repeats F-030's `double_attacker` mistake. **Add new areas only; modify no existing area.**
- **Damage must live on `stats.pAtk`.** `MeleeAttackStrategy.execute` calls `createMelee(attacker, x, y, attacker.pAtk)` and never reads `atkBaseDmg`. Damage placed only on `atkBaseDmg` is dead config with a green suite. `atkBaseDmg` *is* honoured by the `spear` and `doubleAttack` strategies — keep both in sync via one shared constant per module.
- **Derivation rule** (verbatim from the design, `chaseRange` included):
  ```
  tierFactor:   verge 0.75 · route 1.0 · interior 1.75 · heart 2.5
  hp          = durabilityBase(low 70 | mid 100 | high 150) × tierFactor   [Math.round]
  pAtk        = MOB_STATS.pAtk × tierFactor
  maxMoveSpeed: speed low 5 · mid 8 · high 11
  radius/pDef/armor/chaseRange by archetype:
                skirmisher 3/1/1/20 · bruiser 5/3/2/25 · tank 5/4/3/15
  atkStrategies by threat: melee → [melee] · ranged → [melee, spear] · zone → UNSUPPORTED
  element     = the bestiary row's element, verbatim
  ```
  `role: boss` entries are exempt and stay hand-tuned.
- **Verified preconditions — do not re-derive:** `'wind'` is a real `Element` member (`config/combat/elements.ts:10`). `'melee'` and `'spear'` are real `switch` cases (`attackStrategyFactory.ts:36`, `:50`).
- **Codegen artifacts are committed.** After touching `MOB_TYPES`, run `gen-mob-types.sh` *and* `gen-asset-keys.sh` and commit the refreshed JSON, or local gate runs fail against a stale file.
- **A pure builder consumed by a `src/tests` unit test MUST live under `src/`** — importing a `scripts/codegen/*.ts` file from `src/tests` breaks `tsc` with TS6059 (the F-013 lesson).
- **`tsc`, not jest.** ts-jest caches per file; a green jest run does not prove the build compiles. Run `npx tsc --noEmit` after any type change.
- **Fresh worktree has no `node_modules`** — run `npm install` in `colyseus-server` before anything else.

---

## File Structure

**Create**
- `colyseus-server/src/config/mobs/definitions/brambleStalker.ts` — one species' tuned config
- `colyseus-server/src/config/mobs/definitions/veilSpearling.ts` — ditto
- `colyseus-server/src/config/mobs/definitions/brambleDrake.ts` — ditto
- `colyseus-server/src/config/genSpawnAreas.ts` — pure builder: runtime spawn table → JSON
- `colyseus-server/scripts/codegen/gen-spawn-areas.ts` + `.sh` — CLI driver
- `colyseus-server/generated/spawn-areas.json` — committed artifact
- `content/characters/mob-bramble-stalker.md`, `mob-veil-spearling.md`, `mob-bramble-drake.md`
- `scripts/lib/spawn-pairing.mjs` — pure G-SPAWN-PAIR comparison
- `scripts/lib/bestiary-sheet.mjs` — pure G-BESTIARY-SHEET comparison
- `tools/art-forge/prompts/creature-identity.json`
- `colyseus-server/src/tests/f031-mob-derivation.test.ts`
- `colyseus-server/src/tests/codegen/gen-spawn-areas.test.ts`
- `scripts/tests/spawn-pairing.test.mjs`, `scripts/tests/bestiary-sheet.test.mjs`

**Modify**
- `colyseus-server/src/config/mobs/index.ts` — import + array entries
- `colyseus-server/src/config/mobs/genMobTypes.ts` — also emit per-mob elements
- `colyseus-server/src/config/mapConfig.ts` — three new runtime areas
- `content/maps/atlas-frontier.md` — three new authored areas + prose
- `content/story/factions.json` — extend `faction-thornveil.mobFamily`
- `scripts/check_content.mjs` — two new gate functions + CLI option
- `tools/art-forge/generate/charsheet.mjs` — `--creature` prompt path

---

### Task 1: The three mob type modules

**Files:**
- Create: `colyseus-server/src/config/mobs/definitions/brambleStalker.ts`, `veilSpearling.ts`, `brambleDrake.ts`
- Modify: `colyseus-server/src/config/mobs/index.ts`
- Test: `colyseus-server/src/tests/f031-mob-derivation.test.ts`

**Interfaces:**
- Consumes: `MobTypeConfig`, `AttackCharacteristicType` from `../types`; `MOB_STATS`, `SPEAR_THROWER_STATS`, `WEAPON_TYPES` from `../../combatConfig`.
- Produces: exported consts `brambleStalker`, `veilSpearling`, `brambleDrake`, all `MobTypeConfig`; mob ids `bramble_stalker`, `veil_spearling`, `bramble_drake` in `MOB_TYPES`.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/f031-mob-derivation.test.ts`:

```ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { MOB_STATS } from '../config/combat/combatStats'
import { MOB_TYPES } from '../config/mobs'

// Runtime read, not a static JSON import: content/ sits outside tsc's rootDir,
// so `import bestiary from '../../../content/...'` breaks the build with TS6059.
const bestiary = JSON.parse(
  readFileSync(join(__dirname, '../../../content/bestiary/bestiary.json'), 'utf8')
) as Array<Record<string, string>>

/** F-031 derivation rule — tier sets power, bestiary enums set shape. */
const TIER = { verge: 0.75, route: 1.0, interior: 1.75, heart: 2.5 } as const
const DURABILITY = { low: 70, mid: 100, high: 150 } as const
const SPEED = { low: 5, mid: 8, high: 11 } as const
const ARCHETYPE = {
  skirmisher: { radius: 3, pDef: 1, armor: 1, chaseRange: 20 },
  bruiser: { radius: 5, pDef: 3, armor: 2, chaseRange: 25 },
  tank: { radius: 5, pDef: 4, armor: 3, chaseRange: 15 },
} as const

const CASES = [
  { mobId: 'bramble_stalker', design: 'mob-bramble-stalker', tier: 'route' },
  { mobId: 'veil_spearling', design: 'mob-veil-spearling', tier: 'route' },
  { mobId: 'bramble_drake', design: 'mob-bramble-drake', tier: 'interior' },
] as const

describe('F-031 promoted mobs follow the derivation rule', () => {
  for (const { mobId, design, tier } of CASES) {
    it(`${mobId} derives from ${design} at tier ${tier}`, () => {
      const row = bestiary.find((r) => r.id === design)
      expect(row).toBeDefined()
      const cfg = MOB_TYPES.find((m) => m.id === mobId)
      expect(cfg).toBeDefined()

      const f = TIER[tier]
      const shape = ARCHETYPE[row!.archetype as keyof typeof ARCHETYPE]

      expect(cfg!.hp).toBe(Math.round(DURABILITY[row!.durability as 'low'] * f))
      expect(cfg!.stats.pAtk).toBe(MOB_STATS.pAtk * f)
      expect(cfg!.stats.maxMoveSpeed).toBe(SPEED[row!.speed as 'low'])
      expect(cfg!.radius).toBe(shape.radius)
      expect(cfg!.stats.pDef).toBe(shape.pDef)
      expect(cfg!.stats.armor).toBe(shape.armor)
      expect(cfg!.stats.chaseRange).toBe(shape.chaseRange)
      // element mirrors the bestiary row exactly
      expect(cfg!.element).toBe(row!.element)
      // threat decides the strategy set
      const ids = cfg!.atkStrategies.map((s) => s.id).sort()
      expect(ids).toEqual(row!.threat === 'ranged' ? ['melee', 'spear'] : ['melee'])
    })
  }

  it('melee damage is on stats.pAtk, which is what the melee path reads', () => {
    for (const { mobId } of CASES) {
      const cfg = MOB_TYPES.find((m) => m.id === mobId)!
      expect(cfg.stats.pAtk).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd colyseus-server && npx jest src/tests/f031-mob-derivation.test.ts`
Expected: FAIL — `cfg` undefined; the three mob ids do not exist yet.

- [ ] **Step 3: Create `brambleStalker.ts`**

```ts
import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-031 — Thornveil route-tier melee skirmisher.
 * Bestiary row `mob-bramble-stalker` (plant / humanoid-raider / earth / melee /
 * skirmisher / durability mid / speed high). Tier `route` → factor 1.0.
 *
 * Damage MUST sit on `stats.pAtk`: `MeleeAttackStrategy` calls
 * `createMelee(attacker, x, y, attacker.pAtk)` and never reads `atkBaseDmg`.
 * `atkBaseDmg` is kept in sync via this shared constant, not restated.
 */
const TIER_ROUTE = 1.0
const STALKER_PATK = MOB_STATS.pAtk * TIER_ROUTE

export const brambleStalker: MobTypeConfig = {
  id: 'bramble_stalker',
  name: 'Bramble Stalker',

  element: 'earth',

  hp: Math.round(100 * TIER_ROUTE), // durability mid
  radius: 3, // skirmisher
  stats: {
    pAtk: STALKER_PATK,
    pDef: 1,
    armor: 1,
    maxMoveSpeed: 11, // speed high
    attackRange: MOB_STATS.attackRange,
    chaseRange: 20, // skirmisher
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: STALKER_PATK,
          atkWindUpTime: 500,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            // Inert on the melee path (createMelee takes MELEE_PROJECTILE_STATS
            // defaults); required by the type. Tune reach via stats.attackRange.
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.3,
              atkRange: MOB_STATS.attackRange,
            },
          },
        },
      ],
    },
  ],
}
```

- [ ] **Step 4: Create `veilSpearling.ts`**

```ts
import { MOB_STATS, SPEAR_THROWER_STATS, WEAPON_TYPES } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-031 — Thornveil route-tier RANGED skirmisher, and the slice's only
 * non-earth mob: `element: 'wind'` exercises a second branch of the F-017
 * resolution table. Bestiary row `mob-veil-spearling` (raider /
 * humanoid-raider / wind / ranged / skirmisher / durability low / speed high).
 * Tier `route` → factor 1.0.
 *
 * threat `ranged` ⇒ TWO strategies: a `melee` fallback and the `spear` throw.
 * Both damages derive from the one tier-scaled constant; SPEAR_THROWER_STATS
 * supplies only projectile PHYSICS (speed / radius / range / cast time).
 */
const TIER_ROUTE = 1.0
const SPEARLING_PATK = MOB_STATS.pAtk * TIER_ROUTE

export const veilSpearling: MobTypeConfig = {
  id: 'veil_spearling',
  name: 'Veil Spearling',

  element: 'wind',

  hp: Math.round(70 * TIER_ROUTE), // durability low
  radius: 3, // skirmisher
  rotationSpeed: Math.PI / 2,
  stats: {
    pAtk: SPEARLING_PATK,
    pDef: 1,
    armor: 1,
    maxMoveSpeed: 11, // speed high
    attackRange: MOB_STATS.attackRange,
    chaseRange: 20, // skirmisher
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: SPEARLING_PATK,
          atkWindUpTime: 0,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.3,
              atkRange: MOB_STATS.attackRange,
              projectileType: WEAPON_TYPES.PHYSIC_SPEAR,
            },
          },
        },
      ],
    },
    {
      id: 'spear',
      attacks: [
        {
          atkBaseDmg: SPEARLING_PATK,
          atkWindUpTime: SPEAR_THROWER_STATS.castTime,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: SPEAR_THROWER_STATS.spearSpeed,
              projectileRadius: SPEAR_THROWER_STATS.projectileRadius,
              atkRange: SPEAR_THROWER_STATS.spearMaxRange,
              projectileType: WEAPON_TYPES.PHYSIC_SPEAR,
            },
          },
        },
      ],
    },
  ],
}
```

- [ ] **Step 5: Create `brambleDrake.ts`**

```ts
import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-031 — Thornveil INTERIOR-tier bruiser: the difficulty step off the route.
 * Bestiary row `mob-bramble-drake` (drake / quadruped-drake / earth / melee /
 * bruiser / durability high / speed mid). Tier `interior` → factor 1.75.
 *
 * NOT a boss: `role: enemy`, and deliberately smaller than F-030's thorncrown
 * drake (radius 5 vs 9, hp 263 vs 1400 — that one is hand-tuned and exempt
 * from this rule).
 */
const TIER_INTERIOR = 1.75
const DRAKE_PATK = MOB_STATS.pAtk * TIER_INTERIOR

export const brambleDrake: MobTypeConfig = {
  id: 'bramble_drake',
  name: 'Bramble Drake',

  element: 'earth',

  hp: Math.round(150 * TIER_INTERIOR), // durability high → 263
  radius: 5, // bruiser
  rotationSpeed: Math.PI / 3, // 60 deg/sec — heavy, but not boss-slow
  stats: {
    pAtk: DRAKE_PATK,
    pDef: 3,
    armor: 2,
    maxMoveSpeed: 8, // speed mid
    attackRange: MOB_STATS.attackRange,
    chaseRange: 25, // bruiser
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: DRAKE_PATK,
          atkWindUpTime: 650,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.4,
              atkRange: MOB_STATS.attackRange,
            },
          },
        },
      ],
    },
  ],
}
```

- [ ] **Step 6: Wire them into `index.ts`**

Add three imports after the `thorncrownDrake` import, and three entries at the end of `MOB_TYPES`:

```ts
import { brambleStalker } from './definitions/brambleStalker'
import { veilSpearling } from './definitions/veilSpearling'
import { brambleDrake } from './definitions/brambleDrake'
```

```ts
export const MOB_TYPES: MobTypeConfig[] = [
  spearThrower,
  hybrid,
  aggressive,
  defensive,
  balanced,
  doubleAttacker,
  thorncrownDrake,
  brambleStalker,
  veilSpearling,
  brambleDrake,
]
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd colyseus-server && npx jest src/tests/f031-mob-derivation.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 8: Typecheck**

Run: `cd colyseus-server && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Refresh and inspect the codegen artifacts**

```bash
cd colyseus-server
./scripts/codegen/gen-mob-types.sh
./scripts/codegen/gen-asset-keys.sh
git diff --stat generated/
```
Expected: `mob-types.json` gains `bramble_drake`, `bramble_stalker`, `veil_spearling` (sorted); `asset-keys.json` gains the three `mob:*` keys.

- [ ] **Step 10: Full server suite**

Run: `cd colyseus-server && npm test`
Expected: green.

- [ ] **Step 11: Commit**

```bash
git add colyseus-server/src/config/mobs colyseus-server/generated colyseus-server/src/tests/f031-mob-derivation.test.ts
git commit -m "feat(F-031): three Thornveil mob types via the tier derivation rule"
```

---

### Task 2: Character sheets and the faction roster

**Files:**
- Create: `content/characters/mob-bramble-stalker.md`, `mob-veil-spearling.md`, `mob-bramble-drake.md`
- Modify: `content/story/factions.json`

**Interfaces:**
- Consumes: the `mob:*` asset keys minted in Task 1.
- Produces: three sheets whose `id` equals the bestiary design id — the join Task 6's gate checks.

- [ ] **Step 1: Create `content/characters/mob-bramble-stalker.md`**

```markdown
---
id: mob-bramble-stalker
assetKey: "mob:bramble_stalker"
name: "Bramble Stalker"
role: enemy
status: concept
tier: seed
stats:
  archetype: skirmisher
  durability: mid
  speed: high
  threat: melee
links:
  story: [faction-thornveil, region-thornveil]
---

## Lore

A shoot that pulled its own roots up and learned to walk on them. The
skirmishers do not plant these; they only stopped cutting them down. A stalker
moves at the pace of the wind through the canes, which is exactly why nobody
hears it coming.

## Visual Brief

A man-height bundle of green cane walking on a knot of trailing roots. Two
whip-arms of hooked thorn; no head, only a dark hollow at chest height. The
absence of a face is the silhouette — read it before anything else.

## Design Notes

Route-tier melee skirmisher (F-031 derivation rule, tierFactor 1.0): hp 100,
radius 3, pAtk 20, speed 11. Defence element `earth` mirrors the bestiary row.
Numbers stay server-side in
`colyseus-server/src/config/mobs/definitions/brambleStalker.ts`.
```

- [ ] **Step 2: Create `content/characters/mob-veil-spearling.md`**

```markdown
---
id: mob-veil-spearling
assetKey: "mob:veil_spearling"
name: "Veil Spearling"
role: enemy
status: concept
tier: seed
stats:
  archetype: skirmisher
  durability: low
  speed: high
  threat: ranged
links:
  story: [faction-thornveil, region-thornveil]
---

## Lore

The youngest of the bramble-kin, given a harness of three spears and one rule:
never be where you were seen. A spearling throws, moves, and throws again from
somewhere else. They are not good at it yet. There are a great many of them.

## Visual Brief

A slight figure in bramble-woven leathers, face wrapped, a three-spear harness
across the back. Bare arms scratched from shoulder to wrist. Read as young and
quick — the opposite of the Spearmaiden's practised stance.

## Design Notes

Route-tier ranged skirmisher (F-031 derivation rule, tierFactor 1.0): hp 70,
radius 3, pAtk 20, speed 11, `melee` + `spear` strategies. Defence element
`wind` — the slice's only non-earth mob, chosen so the F-017 resolution table
is exercised on more than one branch.
```

- [ ] **Step 3: Create `content/characters/mob-bramble-drake.md`**

```markdown
---
id: mob-bramble-drake
assetKey: "mob:bramble_drake"
name: "Bramble Drake"
role: enemy
status: concept
tier: seed
stats:
  archetype: bruiser
  durability: high
  speed: mid
  threat: melee
links:
  story: [region-thornveil]
---

## Lore

It does not fly. It pushes through the deep veil at chest height and takes the
canes down with it, which is how you know where it has been. The bramble-kin do
not hunt it. They have a word for the sound it makes and they use the word as
an order to leave.

## Visual Brief

A low four-legged drake the length of a cart, scaled bark-brown with green moss
in the plate seams. The skull is broad and blunt, built for pushing. No
reference art yet — the art pipeline is humanoid-anchored (see the F-031
design, section 1.3).

## Design Notes

Interior-tier bruiser (F-031 derivation rule, tierFactor 1.75): hp 263, radius
5, pAtk 35, speed 8. This is the difficulty step off the route band. `role:
enemy`, not boss — F-030's Thorncrown Drake is the apex and is hand-tuned.
`faction-unaligned` in the bestiary, so deliberately NOT added to
`faction-thornveil.mobFamily`.
```

- [ ] **Step 4: Extend the faction roster**

In `content/story/factions.json`, the `faction-thornveil` entry's `mobFamily` becomes:

```json
"mobFamily": [
  "mob:spear_thrower",
  "mob:bramble_stalker",
  "mob:veil_spearling"
]
```

Leave `mob:spear_thrower` first and untouched — it is the faction's canonical mob in three story files. Do **not** add `mob:bramble_drake`: its bestiary row is `faction-unaligned`.

- [ ] **Step 5: Run the content gate**

Run: `node scripts/check_content.mjs --require-complete`
Expected: PASS. If it fails with `assetKey … not in asset-keys.json`, Task 1 step 9's codegen was not committed.

- [ ] **Step 6: Commit**

```bash
git add content/characters content/story/factions.json
git commit -m "feat(F-031): character sheets for the three promoted Thornveil mobs"
```

---

### Task 3: The runtime spawn-area codegen artifact

**Files:**
- Create: `colyseus-server/src/config/genSpawnAreas.ts`, `colyseus-server/scripts/codegen/gen-spawn-areas.ts`, `colyseus-server/scripts/codegen/gen-spawn-areas.sh`, `colyseus-server/generated/spawn-areas.json`
- Test: `colyseus-server/src/tests/codegen/gen-spawn-areas.test.ts`

**Interfaces:**
- Consumes: `MAP_CONFIG.mobSpawnAreas` from `./mapConfig`.
- Produces: `genSpawnAreas(): SpawnAreaSet` where `SpawnAreaSet = { version: number; areas: { id: string; mobType: string; count: number }[] }`, sorted by `id`. Task 5's gate reads the emitted JSON.

**Why a codegen artifact:** the gate is a `.mjs` script and cannot import TypeScript. Regex-parsing `mapConfig.ts` would be fragile. This mirrors exactly what `gen-mob-types.sh` already does for `MOB_TYPES`.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/codegen/gen-spawn-areas.test.ts`:

```ts
import { genSpawnAreas } from '../../config/genSpawnAreas'
import { MAP_CONFIG } from '../../config/mapConfig'

describe('genSpawnAreas', () => {
  it('emits one entry per runtime spawn area', () => {
    const out = genSpawnAreas()
    expect(out.version).toBe(1)
    expect(out.areas).toHaveLength(MAP_CONFIG.mobSpawnAreas.length)
  })

  it('carries only id, mobType and count — geometry is deliberately excluded', () => {
    for (const a of genSpawnAreas().areas) {
      expect(Object.keys(a).sort()).toEqual(['count', 'id', 'mobType'])
    }
  })

  it('is deterministic: sorted by id', () => {
    const ids = genSpawnAreas().areas.map((a) => a.id)
    expect(ids).toEqual([...ids].sort())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd colyseus-server && npx jest src/tests/codegen/gen-spawn-areas.test.ts`
Expected: FAIL — `Cannot find module '../../config/genSpawnAreas'`.

- [ ] **Step 3: Create the pure builder**

Create `colyseus-server/src/config/genSpawnAreas.ts`:

```ts
/**
 * Pure builder for generated/spawn-areas.json — the RUNTIME spawn table's
 * (id, mobType, count) triples, consumed by the out-of-process content gate
 * (scripts/check_content.mjs, G-SPAWN-PAIR / F-031).
 *
 * Geometry is deliberately EXCLUDED. The authored map and the runtime map
 * describe different worlds until I-015 lands a real map loader; pairing is on
 * identity and population only, never on coordinates.
 *
 * Lives under src/ (inside the tsc rootDir) so the unit test's direct import
 * compiles in the production build — importing a scripts/codegen/*.ts file
 * from src/tests breaks tsc with TS6059 (the F-013 lesson).
 */
import { MAP_CONFIG } from './mapConfig'

export interface SpawnAreaRef {
  id: string
  mobType: string
  count: number
}

export interface SpawnAreaSet {
  version: number
  areas: SpawnAreaRef[]
}

const VERSION = 1

/** Build the runtime spawn-area reference set from the live server config. */
export function genSpawnAreas(): SpawnAreaSet {
  const areas = MAP_CONFIG.mobSpawnAreas
    .map((a) => ({ id: a.id, mobType: a.mobType, count: a.count }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  return { version: VERSION, areas }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd colyseus-server && npx jest src/tests/codegen/gen-spawn-areas.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Create the CLI driver**

Create `colyseus-server/scripts/codegen/gen-spawn-areas.ts`:

```ts
/**
 * Emits generated/spawn-areas.json — the runtime spawn table's identity +
 * population, for the content gate's G-SPAWN-PAIR rule (F-031). The artifact is
 * COMMITTED; refresh it whenever mapConfig.ts's mobSpawnAreas change, or the
 * gate FAILs against the stale file.
 *
 * CLI driver only — the pure builder lives in src/config/genSpawnAreas.ts.
 */
import { genSpawnAreas } from '../../src/config/genSpawnAreas'

if (require.main === module) {
  const fs = require('fs')
  const path = require('path')
  const outputFilePath =
    process.argv[2] || path.resolve(__dirname, '../../generated/spawn-areas.json')
  const data = genSpawnAreas()
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`gen-spawn-areas: wrote ${outputFilePath} (${data.areas.length} areas)`)
}
```

Create `colyseus-server/scripts/codegen/gen-spawn-areas.sh`:

```bash
#!/usr/bin/env bash
# Emit generated/spawn-areas.json — the runtime spawn table's (id, mobType,
# count) triples consumed by the content gate's G-SPAWN-PAIR rule (F-031).
# Reads the live server config via ts-node. Idempotent; output is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # colyseus-server/
OUT="$ROOT/generated/spawn-areas.json"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-spawn-areas.ts" "$OUT"

echo "codegen: wrote spawn areas to $OUT"
```

- [ ] **Step 6: Make it executable and run it**

```bash
chmod +x colyseus-server/scripts/codegen/gen-spawn-areas.sh
./colyseus-server/scripts/codegen/gen-spawn-areas.sh
cat colyseus-server/generated/spawn-areas.json
```
Expected: 5 areas at this point (`boss_area`, `center_courtyard`, `east_dunes`, `north_ice_fields`, `south_mud_pit`), sorted.

- [ ] **Step 7: Typecheck and commit**

```bash
cd colyseus-server && npx tsc --noEmit && cd ..
git add colyseus-server/src/config/genSpawnAreas.ts colyseus-server/scripts/codegen/gen-spawn-areas.* colyseus-server/generated/spawn-areas.json colyseus-server/src/tests/codegen/gen-spawn-areas.test.ts
git commit -m "feat(F-031): codegen the runtime spawn table for the drift gate"
```

---

### Task 4: The three new spawn areas, in both maps

**Files:**
- Modify: `colyseus-server/src/config/mapConfig.ts`, `content/maps/atlas-frontier.md`
- Regenerate: `colyseus-server/generated/spawn-areas.json`

**Interfaces:**
- Consumes: the three mob ids from Task 1.
- Produces: paired area ids `thornveil_route_stalkers`, `thornveil_route_spearlings`, `thornveil_interior` in both files — the pairs Task 5's gate asserts.

- [ ] **Step 1: Add the runtime areas**

In `colyseus-server/src/config/mapConfig.ts`, append to `MAP_CONFIG.mobSpawnAreas` (after `east_dunes`):

```ts
    // F-031 — Thornveil route + interior tiers. Ids are PAIRED with
    // content/maps/atlas-frontier.md (gate G-SPAWN-PAIR); geometry is not, and
    // deliberately so: the two maps describe different worlds until I-015.
    {
      id: 'thornveil_route_stalkers',
      x: 700,
      y: 300,
      width: 150,
      height: 200,
      mobType: 'bramble_stalker',
      count: 2,
    },
    {
      id: 'thornveil_route_spearlings',
      x: 700,
      y: 550,
      width: 150,
      height: 200,
      mobType: 'veil_spearling',
      count: 2,
    },
    {
      id: 'thornveil_interior',
      x: 820,
      y: 420,
      width: 150,
      height: 150,
      mobType: 'bramble_drake',
      count: 1,
    },
```

All three rects lie inside the 1000×1000 world (`GAME_CONFIG.worldWidth/Height`).

- [ ] **Step 2: Add the authored areas**

In `content/maps/atlas-frontier.md`, append to `mobSpawnAreas` (after `thornveil_skirmishers`, which stays exactly as it is):

```yaml
  - { id: thornveil_route_stalkers, x: 760, y: 300, width: 110, height: 180, mobType: bramble_stalker, count: 2, regionId: region-thornveil }
  - { id: thornveil_route_spearlings, x: 760, y: 520, width: 110, height: 180, mobType: veil_spearling, count: 2, regionId: region-thornveil }
  - { id: thornveil_interior, x: 890, y: 400, width: 100, height: 160, mobType: bramble_drake, count: 1, regionId: region-thornveil }
```

Every rect stays inside `region-thornveil` bounds `(750,250) 250×500` — x ∈ [750,1000], y ∈ [250,750] — which the gate's geometry check enforces.

- [ ] **Step 3: Update the map's prose**

In the `### Thornveil — region-thornveil` section, after the existing `spear_thrower` sentence, add:

```markdown
F-031 adds the zone's first tiered population on top of that skirmisher band:
`bramble_stalker` (count 2) and `veil_spearling` (count 2) on the **route**
tier, and a single `bramble_drake` deeper in as the **interior** step. The
existing `thornveil_skirmishers` area is untouched — `mob:spear_thrower` is
this faction's canonical mob in `content/story/factions.json`, `style.md` and
`bible.md`, and stranding it would leave canon pointing at a mob that spawns
nowhere.
```

And in **Authoring notes**, append:

```markdown
- Every `mobSpawnAreas[].id` added from F-031 onward must also exist in
  `colyseus-server/src/config/mapConfig.ts` with the same `mobType` and `count`
  (gate G-SPAWN-PAIR). Geometry may differ. The eight pre-F-031 ids are
  allow-listed in `scripts/check_content.mjs` as `LEGACY_UNPAIRED`.
```

- [ ] **Step 4: Regenerate the artifact and run the gate**

```bash
./colyseus-server/scripts/codegen/gen-spawn-areas.sh
node scripts/check_content.mjs --require-complete
```
Expected: `spawn-areas.json` now lists 8 areas; the content gate passes (G-SPAWN-PAIR does not exist yet, so this only proves schema, region refs, geometry and mobType checks).

- [ ] **Step 5: Commit**

```bash
git add colyseus-server/src/config/mapConfig.ts colyseus-server/generated/spawn-areas.json content/maps/atlas-frontier.md
git commit -m "feat(F-031): tiered Thornveil spawn areas, paired across both maps"
```

---

### Task 5: G-SPAWN-PAIR — the drift gate

**Files:**
- Create: `scripts/lib/spawn-pairing.mjs`
- Modify: `scripts/check_content.mjs`
- Test: `scripts/tests/spawn-pairing.test.mjs`

**Interfaces:**
- Consumes: `generated/spawn-areas.json` from Task 3; authored `mobSpawnAreas` from Task 4.
- Produces: `scripts/lib/spawn-pairing.mjs` exporting `checkSpawnPairing(authoredAreas, runtimeAreas, failFn)` and `LEGACY_UNPAIRED: Set<string>`; new CLI flag `--spawn-areas <path>` defaulting to `colyseus-server/generated/spawn-areas.json`.

<div class="callout danger">

**The gate logic MUST live in `scripts/lib/`, not in `check_content.mjs`.** That file ends
with a bare `main()` and `process.exit()`, so importing it from a test would run the entire
gate and exit the test process — which is why `check_content.test.mjs` drives it as a
subprocess via `execFileSync` instead. `scripts/lib/` is the established home for pure,
directly-importable logic (`check_content.mjs:10` already imports `./lib/story.mjs`, and
`season1.test.mjs` imports `../lib/season1.mjs`). Follow that pattern.

</div>

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/spawn-pairing.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSpawnPairing, LEGACY_UNPAIRED } from "../lib/spawn-pairing.mjs";

function run(authored, runtime) {
  const failures = [];
  checkSpawnPairing(authored, runtime, (m) => failures.push(m));
  return failures;
}

test("a paired area with matching mobType and count passes", () => {
  const authored = [{ id: "thornveil_interior", mobType: "bramble_drake", count: 1 }];
  const runtime = [{ id: "thornveil_interior", mobType: "bramble_drake", count: 1 }];
  assert.deepEqual(run(authored, runtime), []);
});

test("geometry is NOT compared — only id, mobType and count", () => {
  const authored = [{ id: "a", mobType: "m", count: 1, x: 0, y: 0, width: 5, height: 5 }];
  const runtime = [{ id: "a", mobType: "m", count: 1 }];
  assert.deepEqual(run(authored, runtime), []);
});

test("an authored area with no runtime counterpart FAILS", () => {
  const failures = run([{ id: "ghost", mobType: "m", count: 1 }], []);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ghost/);
  assert.match(failures[0], /no runtime counterpart/);
});

test("a mobType mismatch FAILS", () => {
  const failures = run(
    [{ id: "a", mobType: "bramble_drake", count: 1 }],
    [{ id: "a", mobType: "spear_thrower", count: 1 }],
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /mobType/);
});

test("a count mismatch FAILS", () => {
  const failures = run(
    [{ id: "a", mobType: "m", count: 2 }],
    [{ id: "a", mobType: "m", count: 4 }],
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /count/);
});

test("pre-content ids are allow-listed and skipped", () => {
  const authored = [...LEGACY_UNPAIRED].map((id) => ({ id, mobType: "whatever", count: 99 }));
  assert.deepEqual(run(authored, []), []);
});

test("the allowlist is exactly the eight pre-F-031 ids", () => {
  assert.deepEqual([...LEGACY_UNPAIRED].sort(), [
    "boss_area",
    "center_courtyard",
    "east_dunes",
    "icefield_stoneguard",
    "meadow_wilds",
    "north_ice_fields",
    "south_mud_pit",
    "thornveil_skirmishers",
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/tests/spawn-pairing.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/lib/spawn-pairing.mjs`.

- [ ] **Step 3: Implement the gate**

Create `scripts/lib/spawn-pairing.mjs`:

```js
/**
 * G-SPAWN-PAIR (F-031) — authored spawn areas must have a same-id runtime
 * counterpart with the same mobType and count. Geometry is NOT compared: the
 * authored map and colyseus-server/src/config/mapConfig.ts describe different
 * worlds until I-015 lands a real map loader, so comparing coordinates would
 * be a fiction that fails on day one.
 *
 * These eight ids predate the content layer and are unpaired by history, not
 * by mistake. Reconciling them belongs to I-015, NOT here. Nothing may be
 * added to this list — a new area must be authored in BOTH files.
 */
export const LEGACY_UNPAIRED = new Set([
  "center_courtyard",
  "north_ice_fields",
  "south_mud_pit",
  "east_dunes",
  "boss_area",
  "meadow_wilds",
  "icefield_stoneguard",
  "thornveil_skirmishers",
]);

/** Pure comparison so the gate is unit-testable without touching the filesystem. */
export function checkSpawnPairing(authoredAreas, runtimeAreas, failFn) {
  const runtimeById = new Map(runtimeAreas.map((a) => [a.id, a]));
  for (const a of authoredAreas) {
    if (LEGACY_UNPAIRED.has(a.id)) continue;
    const r = runtimeById.get(a.id);
    if (!r) {
      failFn(
        `G-SPAWN-PAIR: authored spawn area "${a.id}" has no runtime counterpart in ` +
          `colyseus-server/src/config/mapConfig.ts (regenerate generated/spawn-areas.json after adding it)`,
      );
      continue;
    }
    if (r.mobType !== a.mobType)
      failFn(
        `G-SPAWN-PAIR: spawn area "${a.id}" mobType differs — authored "${a.mobType}", runtime "${r.mobType}"`,
      );
    if (r.count !== a.count)
      failFn(
        `G-SPAWN-PAIR: spawn area "${a.id}" count differs — authored ${a.count}, runtime ${r.count}`,
      );
  }
}
```

- [ ] **Step 4: Wire it into the CLI**

In `scripts/check_content.mjs`, import it beside the existing `./lib/story.mjs` import:

```js
import { checkSpawnPairing } from "./lib/spawn-pairing.mjs";
```

Then in `parseArgs`, add the default beside `mobTypes` (~line 19) and the flag beside `--mob-types` (~line 32):

```js
    spawnAreas: join(ROOT, "colyseus-server/generated/spawn-areas.json"),
```
```js
    else if (a === "--spawn-areas") opts.spawnAreas = resolve(takeValue(a, ++i));
```

Inside `checkMaps`, immediately after block **(4)** (the `mobType` cross-check):

```js
    // (4b) G-SPAWN-PAIR (F-031) — bind the authored table to the runtime one.
    const spawnDoc = readJson(opts.spawnAreas, "spawn-areas", fail);
    if (spawnDoc && Array.isArray(spawnDoc.areas))
      checkSpawnPairing(fm.mobSpawnAreas ?? [], spawnDoc.areas, fail);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/tests/spawn-pairing.test.mjs`
Expected: PASS — 7 tests.

- [ ] **Step 6: Run the real gate**

Run: `node scripts/check_content.mjs --require-complete`
Expected: PASS — the three F-031 areas pair; the eight legacy ids skip.

- [ ] **Step 7: Prove the rule is load-bearing**

```bash
sed -i '' 's/mobType: bramble_drake, count: 1/mobType: bramble_drake, count: 9/' content/maps/atlas-frontier.md
node scripts/check_content.mjs --require-complete; echo "exit=$?"
git checkout content/maps/atlas-frontier.md
node scripts/check_content.mjs --require-complete; echo "exit=$?"
```
Expected: the first run **exits non-zero** with `G-SPAWN-PAIR … count differs`; the second exits 0. If the first passes, the gate is not wired in — fix before continuing.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/spawn-pairing.mjs scripts/check_content.mjs scripts/tests/spawn-pairing.test.mjs
git commit -m "feat(F-031): G-SPAWN-PAIR drift gate binding authored and runtime spawn tables"
```

---

### Task 6: G-BESTIARY-SHEET — the join gate

**Files:**
- Create: `scripts/lib/bestiary-sheet.mjs`
- Modify: `scripts/check_content.mjs`, `colyseus-server/src/config/mobs/genMobTypes.ts`, `colyseus-server/src/tests/codegen/gen-mob-types.test.ts`
- Test: `scripts/tests/bestiary-sheet.test.mjs`

**Interfaces:**
- Consumes: `content/bestiary/bestiary.json`, the Task 2 sheets, and `generated/mob-types.json`'s new `elements` map.
- Produces: `scripts/lib/bestiary-sheet.mjs` exporting `checkBestiarySheet(sheet, row, elementByMobType, failFn)`. Same reason as Task 5 — `check_content.mjs` is not importable.

**Note on element:** the sheet has nowhere to record an element (`character.schema.json` is `additionalProperties: false`) and the gate cannot import TypeScript. Rather than add a third artifact, extend the existing mob-types codegen to carry elements.

- [ ] **Step 1: Extend the mob-types builder**

In `colyseus-server/src/config/mobs/genMobTypes.ts`:

```ts
export interface MobTypeSet {
  version: number
  mobTypes: string[]
  /** F-031: defence element per mob id, omitted when the mob is neutral. */
  elements: Record<string, string>
}

const VERSION = 2

/** Build the valid mob type id set from the live server config. */
export function genMobTypes(): MobTypeSet {
  const mobTypes = [...new Set(MOB_TYPES.map((m) => m.id))].sort()
  const elements: Record<string, string> = {}
  for (const m of MOB_TYPES) if (m.element) elements[m.id] = m.element
  return { version: VERSION, mobTypes, elements }
}
```

Update `colyseus-server/src/tests/codegen/gen-mob-types.test.ts` to assert `version === 2` and `elements.thorncrown_drake === 'earth'`.

`loadMobTypes` in `check_content.mjs` validates `{ mobTypes: string[] }` and ignores extra keys, so this is backward compatible — confirm in step 5.

- [ ] **Step 2: Write the failing test**

Create `scripts/tests/bestiary-sheet.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBestiarySheet } from "../lib/bestiary-sheet.mjs";

const ROW = {
  id: "mob-bramble-stalker",
  archetype: "skirmisher",
  durability: "mid",
  speed: "high",
  threat: "melee",
  element: "earth",
};
const SHEET = {
  id: "mob-bramble-stalker",
  assetKey: "mob:bramble_stalker",
  stats: { archetype: "skirmisher", durability: "mid", speed: "high", threat: "melee" },
};
const ELEMENTS = { bramble_stalker: "earth" };

function run(sheet, row, elements) {
  const failures = [];
  checkBestiarySheet(sheet, row, elements, (m) => failures.push(m));
  return failures;
}

test("a sheet mirroring its bestiary row passes", () => {
  assert.deepEqual(run(SHEET, ROW, ELEMENTS), []);
});

test("a mismatched enum FAILS and names the field", () => {
  const bad = { ...SHEET, stats: { ...SHEET.stats, durability: "low" } };
  const failures = run(bad, ROW, ELEMENTS);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /durability/);
});

test("every one of the four enums is checked", () => {
  for (const field of ["archetype", "durability", "speed", "threat"]) {
    const bad = { ...SHEET, stats: { ...SHEET.stats, [field]: "tank" } };
    assert.ok(run(bad, ROW, ELEMENTS).length >= 1, `${field} was not checked`);
  }
});

test("a runtime element that differs from the row FAILS", () => {
  const failures = run(SHEET, ROW, { bramble_stalker: "wind" });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /element/);
});

test("a neutral runtime mob against an elemental row FAILS", () => {
  const failures = run(SHEET, ROW, {});
  assert.equal(failures.length, 1);
  assert.match(failures[0], /element/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test scripts/tests/bestiary-sheet.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/lib/bestiary-sheet.mjs`.

- [ ] **Step 4: Implement the gate**

Create `scripts/lib/bestiary-sheet.mjs`:

```js
/**
 * G-BESTIARY-SHEET (F-031) — a character sheet whose `id` is a real bestiary
 * design id must mirror that row. Generalises the single binding test F-030
 * added for the Thorncrown Drake, so a sheet and its design cannot drift.
 *
 * The four enums are identical vocabularies by construction (character.schema
 * .json and the bestiary use the same values), so any difference is a bug.
 * Element is compared against the RUNTIME config via the codegen artifact,
 * because the sheet has nowhere to record it (additionalProperties: false).
 */
export function checkBestiarySheet(sheet, row, elementByMobType, failFn) {
  const label = `characters/${sheet.id}.md`;
  for (const field of ["archetype", "durability", "speed", "threat"]) {
    if (sheet.stats?.[field] !== row[field])
      failFn(
        `G-BESTIARY-SHEET: ${label} stats.${field} "${sheet.stats?.[field]}" != bestiary row "${row[field]}"`,
      );
  }
  const mobId = sheet.assetKey?.startsWith("mob:") ? sheet.assetKey.slice(4) : null;
  if (mobId) {
    const runtime = elementByMobType[mobId] ?? "neutral";
    const expected = row.element ?? "neutral";
    if (runtime !== expected)
      failFn(
        `G-BESTIARY-SHEET: ${label} runtime element "${runtime}" != bestiary row element "${expected}" ` +
          `(MobTypeConfig for "${mobId}")`,
      );
  }
}
```

Then in `scripts/check_content.mjs`, import it beside the other lib imports:

```js
import { checkBestiarySheet } from "./lib/bestiary-sheet.mjs";
```

At the top of `checkCharacters`, load the two lookups once:

```js
  const bestiaryPath = join(opts.contentRoot, "bestiary/bestiary.json");
  const bestiaryRows = existsSync(bestiaryPath) ? readJson(bestiaryPath, "bestiary", fail) ?? [] : [];
  const bestiaryById = new Map(bestiaryRows.map((r) => [r.id, r]));
  const mobElements = readJson(opts.mobTypes, "mob-types", fail)?.elements ?? {};
```

And after the existing per-sheet checks, guarded so the six legacy archetype sheets are untouched:

```js
    // G-BESTIARY-SHEET (F-031) — only sheets whose id IS a bestiary design id.
    const row = bestiaryById.get(fm.id);
    if (row) checkBestiarySheet(fm, row, mobElements, fail);
```

- [ ] **Step 5: Run the unit test and the real gate**

```bash
cd colyseus-server && ./scripts/codegen/gen-mob-types.sh && cd ..
node --test scripts/tests/bestiary-sheet.test.mjs
node scripts/check_content.mjs --require-complete
```
Expected: unit tests PASS (5); the real gate PASSES. `mob-thorncrown-drake.md` is now covered too and must still pass — F-030 already set its element to `earth` to match its row.

- [ ] **Step 6: Prove the rule is load-bearing**

```bash
sed -i '' 's/  durability: mid/  durability: low/' content/characters/mob-bramble-stalker.md
node scripts/check_content.mjs --require-complete; echo "exit=$?"
git checkout content/characters/mob-bramble-stalker.md
node scripts/check_content.mjs --require-complete; echo "exit=$?"
```
Expected: first run exits non-zero naming `durability`; second exits 0.

- [ ] **Step 7: Run every gate test and the server suite**

```bash
node --test scripts/tests/
cd colyseus-server && npx tsc --noEmit && npm test
```
Expected: all green, with `gen-mob-types.test.ts` reflecting `version: 2`.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/bestiary-sheet.mjs scripts/check_content.mjs scripts/tests/bestiary-sheet.test.mjs colyseus-server/src/config/mobs/genMobTypes.ts colyseus-server/src/tests/codegen/gen-mob-types.test.ts colyseus-server/generated/mob-types.json
git commit -m "feat(F-031): G-BESTIARY-SHEET join gate binding sheets to bestiary rows"
```

---

### Task 7: Live-room verification and the budget report

**Files:**
- Modify: `colyseus-server/src/tests/f031-mob-derivation.test.ts`

This task produces **evidence**, not features.

- [ ] **Step 1: Bind the test to the real spawn wiring**

Append to `colyseus-server/src/tests/f031-mob-derivation.test.ts`:

```ts
import { MAP_CONFIG } from '../config/mapConfig'

describe('F-031 promoted mobs are actually reachable in a room', () => {
  it('each promoted mob has a runtime spawn area with a positive count', () => {
    for (const { mobId } of CASES) {
      const area = MAP_CONFIG.mobSpawnAreas.find((a) => a.mobType === mobId)
      expect(area).toBeDefined()
      expect(area!.count).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Prove that check is load-bearing**

Delete the three entries from `mapConfig.ts`, run `npx jest src/tests/f031-mob-derivation.test.ts`, confirm it **FAILS**, then `git checkout colyseus-server/src/config/mapConfig.ts` and confirm it passes again. A test that stays green with the wiring removed is exactly the failure F-029 and F-030 both shipped.

- [ ] **Step 3: Run a room and watch**

```bash
cd colyseus-server && npm run dev
```
In another shell:
```bash
curl -s localhost:2567/health
curl -s localhost:2567/api/rooms
```
Start the client (`cd client/react-client && npm start`, then open `http://localhost:3001`) and confirm by observation:
- a `bramble_stalker` closes to melee and lands a hit;
- a `veil_spearling` throws a spear from range (the `spear` strategy, not just the melee fallback);
- a `bramble_drake` is visibly larger, slower, and hits harder.

Write down what was actually observed. If a mob spawns but never attacks, its strategy set is wrong — do not report this task done.

- [ ] **Step 4: Run the season-1 budget report**

Run: `node scripts/report_season1.mjs`. It always exits 0 by design (F-025), so read the numbers rather than the exit code.
Expected: `mobBases` reads **10** of 30. `bestiaryArt` still reads 0 of 30 until Task 9.

- [ ] **Step 5: Commit**

```bash
git add colyseus-server/src/tests/f031-mob-derivation.test.ts
git commit -m "test(F-031): bind the derivation test to the real spawn wiring"
```

---

### Task 8: The creature prompt module — hermetic, no GPU

**Files:**
- Create: `tools/art-forge/prompts/creature-identity.json`, `tools/art-forge/tests/creature-prompt.test.mjs`
- Modify: `tools/art-forge/generate/charsheet.mjs`

**Interfaces:**
- Consumes: `prompts/style-laws.json`'s `positive` and `styleClause`.
- Produces: exported `buildCreaturePrompt(designId, bundle) -> string`; a `--creature <design-id>` CLI flag.

- [ ] **Step 1: Confirm the silhouette names before writing them down**

```bash
ssh mont@100.66.190.100 'dir F:\comfy-ui\input\sil-*'
```
The design records `sil-assassin` / `sil-spearman` as **hypotheses inferred from the `sil-` prefix convention**, not verified filenames. Use the real names. If no suitable humanoid anchor exists, pick the closest job silhouette and record the substitution in the module's `_note`. **If the box is unreachable, stop here and ship Tasks 1–7** — Part B is explicitly allowed to lag.

- [ ] **Step 2: Write the failing test**

Create `tools/art-forge/tests/creature-prompt.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreaturePrompt } from "../generate/charsheet.mjs";

const BUNDLE = {
  styleLaws: {
    positive: ["crisp flat 2D anime illustration"],
    styleClause: ["RO proportion", "Genshin-detail"],
  },
  creatures: {
    "mob-bramble-stalker": { clause: "a bundle of green cane", silhouette: "sil-assassin" },
  },
};

test("the creature clause appears in the prompt", () => {
  assert.match(buildCreaturePrompt("mob-bramble-stalker", BUNDLE), /green cane/);
});

test("styleClause is appended LAST — after the creature clause", () => {
  const p = buildCreaturePrompt("mob-bramble-stalker", BUNDLE);
  assert.ok(
    p.indexOf("green cane") < p.indexOf("RO proportion"),
    "style words must come after the creature clause (F-024 law)",
  );
});

test("an unknown design id throws rather than silently generating junk", () => {
  assert.throws(() => buildCreaturePrompt("mob-nope", BUNDLE), /mob-nope/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tools/art-forge/tests/creature-prompt.test.mjs`
Expected: FAIL — `buildCreaturePrompt` is not exported.

- [ ] **Step 4: Create the prompt module**

Create `tools/art-forge/prompts/creature-identity.json`. Clauses derive from each bestiary row's `visualBrief`; replace the silhouette values with the ones confirmed in step 1:

```json
{
  "_note": "F-031. Per-creature identity clause + humanoid silhouette anchor. buildCreaturePrompt() appends styleClause LAST, after the clause — the F-024 law that job-costume.json also follows. BOTH entries are validated:false — authored from the bestiary visualBrief, NOT yet visually confirmed on a contact sheet. QC each on its own row before trusting it. Only humanoid-raider body plans can be generated at all: the character profile is img2img anchored on human-row silhouettes, and style-laws law #1 says text alone cannot hold proportion.",
  "mob-bramble-stalker": {
    "clause": "a man-height bundle of green cane walking on a knot of trailing roots, two whip-arms of hooked thorn, NO HEAD, only a dark hollow at chest height, bark-black old wood and bright new growth",
    "silhouette": "sil-assassin",
    "validated": false
  },
  "mob-veil-spearling": {
    "clause": "a slight young raider in bramble-woven leathers, face wrapped, a three-spear harness across the back, bare arms scratched from shoulder to wrist, thorn-green over bark-brown",
    "silhouette": "sil-spearman",
    "validated": false
  }
}
```

- [ ] **Step 5: Implement `buildCreaturePrompt`**

In `tools/art-forge/generate/charsheet.mjs`, beside `buildPrompt`:

```js
/**
 * F-031 — compose a CREATURE prompt. Same law as the job path: the creature's
 * identity clause first, then style-laws' styleClause LAST. Putting the style
 * words inside the opening `positive` array does not reproduce the F-024
 * validated prompt string.
 */
export function buildCreaturePrompt(designId, bundle) {
  const entry = bundle.creatures?.[designId];
  if (!entry) {
    throw new Error(
      `unknown creature "${designId}" — add it to prompts/creature-identity.json first`,
    );
  }
  return [
    ...(bundle.styleLaws.positive ?? []),
    entry.clause,
    ...(bundle.styleLaws.styleClause ?? []),
  ].join(", ");
}
```

Extend `loadForge` to read `prompts/creature-identity.json` into `bundle.creatures`, and add a `--creature <design-id>` flag that selects this prompt path and sets the silhouette input from `entry.silhouette`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tools/art-forge/tests/creature-prompt.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 7: Dry-run the graph without touching the GPU**

Run: `node tools/art-forge/generate/charsheet.mjs --creature mob-bramble-stalker --dry-run`
Expected: prints the ComfyUI graph and queues nothing. Confirm the prompt string ends with the style words, and that `steps: 24`, `cfg: 3`, `denoise: 0.82` come from the `character` profile.

- [ ] **Step 8: Commit**

```bash
git add tools/art-forge/prompts/creature-identity.json tools/art-forge/generate/charsheet.mjs tools/art-forge/tests/creature-prompt.test.mjs
git commit -m "feat(F-031): creature prompt path for bestiary concept art"
```

---

### Task 9: Generate and intake the two images — interactive, needs the tunnel

**Files:**
- Create via intake (never by hand): `game-client/assets/art/concept/mob-bramble-stalker.png`, `mob-veil-spearling.png`
- Modify via intake: `game-client/assets/art/art-manifest.json`
- Modify: `tools/art-forge/prompts/creature-identity.json` (flip `validated`)

- [ ] **Step 1: Open the tunnel and confirm ComfyUI is up**

```bash
ssh -f -N -L 8188:127.0.0.1:8188 -o ServerAliveInterval=30 mont@100.66.190.100
curl -s http://127.0.0.1:8188/system_stats | head -5
```
If it does not respond, launch `C:\Users\Mont\run-comfy-gpu0.cmd` on mont-pc. **Do not touch GPU 1 / port 8189** — that is the owner's own instance.

- [ ] **Step 2: Generate a contact-sheet row per creature**

```bash
node tools/art-forge/generate/charsheet.mjs --creature mob-bramble-stalker --seed 12345
node tools/art-forge/generate/charsheet.mjs --creature mob-veil-spearling --seed 12345
```
QC each row against `prompts/style-laws.json`: flat 2D anime, not 3D/CGI/clay, no fur, correct head-body ratio. The stalker is **headless** — if the model insists on a face, reroll with a new seed and reinforce "NO HEAD, dark hollow at chest height" in the clause.

- [ ] **Step 3: Intake the two approved images**

```bash
node tools/art-forge/intake-art.mjs \
  --id art:mob-bramble-stalker --group mob \
  --title "Bramble Stalker — concept" \
  --note "Z-Image Turbo img2img, local generation (F-031). Anchored on the <silhouette> humanoid silhouette; denoise 0.82 / steps 24 / cfg 3 per the F-024 calibration. Binds to bestiary design mob-bramble-stalker and server mob type bramble_stalker." \
  --file <path-to-approved.png>
```
Repeat for `art:mob-veil-spearling`. Intake is transactional — a failed artifact gate aborts with zero writes.

- [ ] **Step 4: Verify the budget moved**

```bash
node -e "const m=require('./game-client/assets/art/art-manifest.json');console.log(Object.keys(m.entries).filter(k=>k.startsWith('art:mob-')))"
```
Then rerun `node scripts/report_season1.mjs`.
Expected: two `art:mob-*` keys; `bestiaryArt` reads **2** of 30.

- [ ] **Step 5: Mark the entries validated**

Now that the images are visually confirmed, flip `validated` to `true` for both entries in `creature-identity.json` — the field means "confirmed against a real image", exactly as in `job-costume.json`.

- [ ] **Step 6: Full verification sweep**

```bash
cd colyseus-server && npx tsc --noEmit && npm test && cd ..
node --test scripts/tests/
node scripts/check_content.mjs --require-complete
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add game-client/assets/art tools/art-forge/prompts/creature-identity.json
git commit -m "feat(F-031): first two bestiary concept images (art:mob-*)"
```

---

## Definition of done

Per the standing per-phase quality gate, each task ends **implement → verify → independent review → refactor → re-verify**. The feature is done when:

1. `npx tsc --noEmit` and `npm test` green in `colyseus-server`.
2. `node --test scripts/tests/` green, with a negative case per new gate.
3. `check_content.mjs --require-complete` passes.
4. Deleting **either** new gate rule, **or** the three `mapConfig.ts` spawn entries, turns the suite red — each verified by actually deleting it.
5. All three mobs observed spawning **and attacking** in a running room, with what was seen written down.
6. `mobBases` reads 10 of 30. `bestiaryArt` reads 2 of 30 — or 0, stated plainly, if the tunnel was unreachable and Tasks 8–9 were deferred.

**Before Gate 1 (`ship`):** merge `release/1.7` into `feat/F-031` first. A fresh worktree has no `node_modules` — install before verifying. If `git push` fails with `RPC failed; HTTP 400`, that is the `http.postBuffer` issue (already set repo-locally to 524288000), not a gate failure.
