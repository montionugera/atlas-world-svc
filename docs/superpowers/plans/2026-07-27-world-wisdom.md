# World Wisdom (F-017) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Undertow world a canon magic system (widespread magic, antimagic runes, schools) and a working RO-style 6-element damage system in the Colyseus combat path.

**Architecture:** Two independent halves. The **runtime half** adds a pure `Element` module (type + 7x7 multiplier table + lookup function), then threads an attack element from configs (weapon / mob attack) through the existing battle-message queue into `DamageCalculator`, where it multiplies the damage that already survived defense reduction. The **lore half** rewrites `content/story/style.md` §6, adds a magic-model section to `content/story/canon.md`, and lands the school/element fragments as `lore-*` nodes in the existing story graph. Nothing about player class/race is built — no class field exists server-side yet (phase C).

**Tech Stack:** TypeScript (strict) + Colyseus schema + Jest (ts-jest) for the server; flat JSON + Ajv schemas + `scripts/check_content.mjs` (node:test) for story content.

**Spec:** `docs/superpowers/specs/2026-07-27-world-wisdom-design.md` (status `spec-approved`, owner-locked decisions 1–12).

## Global Constraints

- **Server-authoritative.** Elements are decided server-side from configs; clients never send an element.
- **Single-path APIs.** Constructors/methods take ONE options object — no positional overloads, no boolean flag params. Two existing positional signatures are converted to options objects in this plan for exactly this reason (`DamageCalculator.calculate`, `BattleManager.createAttackMessage`).
- **Behaviour preservation:** with `attackElement: 'neutral'` against a `'neutral'` target, every damage number must be byte-identical to today. The 5 pinned cases in `src/tests/damage-calculator.test.ts` and `src/tests/char-battlemodule-damage.test.ts` must still pass with the same expected numbers.
- **Element ids** (lowercase, exact): `neutral`, `earth`, `water`, `wind`, `fire`, `holy`, `void`.
- **Multiplier values** (verbatim from spec): cycle advantage `2.0`; reverse-of-cycle and same-element `0.5`; `holy`↔`void` `2.0` both directions; `holy`→`holy` and `void`→`void` `0.5`; everything involving `neutral` on either side `1.0`.
- **Order of operations** (locked): element multiplies AFTER defense reduction — `final = max(1, floor(afterDefense * multiplier))`. This is what makes an advantage exactly double the number the player sees.
- **No mana/MP resource, no skill trees, no class/race field, no Genshin-style reactions** — all explicitly out of scope.
- TypeScript strict, no unjustified `any`. Prettier + ESLint must pass (`npm run format` in `colyseus-server`).
- Conventional commit subjects, kept short. Never `git commit --amend` — always a new commit.
- **Every task ends with the phased quality gate** (global rule #7): implement → verify by running it → independent adversarial review of that task's diff (fresh subagent / `superpowers:requesting-code-review`) → refactor on the findings → re-verify. A task is not done until that loop closes clean.

**Working directory:** all server commands run from `colyseus-server/`; all content commands run from the repo root. This work belongs in the F-017 feature worktree created by `/ps-release-workflow:claim F-017`.

---

## File Structure

**Runtime (new):**
- `colyseus-server/src/config/combat/elements.ts` — the `Element` type, the 7x7 table, `getElementMultiplier()`. Pure data + one function; no imports from schemas or modules.
- `colyseus-server/src/tests/elements.test.ts` — exhaustive table test.

**Runtime (modified):**
- `colyseus-server/src/modules/combat/DamageCalculator.ts` — options object + element multiplier.
- `colyseus-server/src/modules/BattleModule.ts:219-225` (`calculateDamage`), `:80-90` (`processAttack` reads the element).
- `colyseus-server/src/modules/BattleActionMessage.ts:15-32` — `element` on `AttackActionPayload` and `ProjectileDetail`.
- `colyseus-server/src/modules/BattleManager.ts:93-113` — `createAttackMessage` options object + element.
- `colyseus-server/src/schemas/WorldLife.ts:36-49, 116-163` — synced `element` field + constructor seeding.
- `colyseus-server/src/config/combat/weapons.ts:7-24` — `element` on `WeaponConfig`.
- `colyseus-server/src/config/mobs/types.ts:37-50` — `element` on `AttackDefinition`.
- `colyseus-server/src/systems/PlayerCombatSystem.ts:206-212`, `src/systems/MobCombatSystem.ts:126-133`, `src/systems/NPCCombatSystem.ts` (~:99) — pass the element into the message factory.
- `colyseus-server/src/modules/projectile/ProjectileCollisionResolver.ts:57-88` — carry the element on the projectile path.
- Tests: `src/tests/damage-calculator.test.ts`, `src/tests/char-battlemodule-damage.test.ts` (signature migration), plus a new `src/tests/element-combat-integration.test.ts`.

**Lore (modified/new):**
- `content/story/style.md:173-194` — §6 rewritten.
- `content/story/canon.md` — new "Magic, schools, and the elements" section.
- `content/story/lore.json` — new `lore-*` nodes (one new thread, >=2 fragments).
- `docs/story/story-graph.md` — regenerated (drift gate).

---

### Task 1: Element table (pure)

**Files:**
- Create: `colyseus-server/src/config/combat/elements.ts`
- Test: `colyseus-server/src/tests/elements.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Element = 'neutral'|'earth'|'water'|'wind'|'fire'|'holy'|'void'`; `const ELEMENTS: readonly Element[]`; `const DEFAULT_ELEMENT: Element` (= `'neutral'`); `function getElementMultiplier(attack: Element, defense: Element): number`; `function isElement(v: unknown): v is Element`.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/elements.test.ts`:

```ts
import {
  ELEMENTS,
  DEFAULT_ELEMENT,
  getElementMultiplier,
  isElement,
  type Element,
} from '../config/combat/elements'

// Expected table, transcribed from the approved spec (rows = attack, cols = defense).
const EXPECTED: Record<Element, Record<Element, number>> = {
  neutral: { neutral: 1.0, earth: 1.0, water: 1.0, wind: 1.0, fire: 1.0, holy: 1.0, void: 1.0 },
  earth: { neutral: 1.0, earth: 0.5, water: 1.0, wind: 2.0, fire: 0.5, holy: 1.0, void: 1.0 },
  water: { neutral: 1.0, earth: 1.0, water: 0.5, wind: 0.5, fire: 2.0, holy: 1.0, void: 1.0 },
  wind: { neutral: 1.0, earth: 0.5, water: 2.0, wind: 0.5, fire: 1.0, holy: 1.0, void: 1.0 },
  fire: { neutral: 1.0, earth: 2.0, water: 0.5, wind: 1.0, fire: 0.5, holy: 1.0, void: 1.0 },
  holy: { neutral: 1.0, earth: 1.0, water: 1.0, wind: 1.0, fire: 1.0, holy: 0.5, void: 2.0 },
  void: { neutral: 1.0, earth: 1.0, water: 1.0, wind: 1.0, fire: 1.0, holy: 2.0, void: 0.5 },
}

describe('elements', () => {
  it('exposes exactly the seven canon elements', () => {
    expect([...ELEMENTS]).toEqual(['neutral', 'earth', 'water', 'wind', 'fire', 'holy', 'void'])
    expect(DEFAULT_ELEMENT).toBe('neutral')
  })

  it('matches the approved multiplier table in all 49 cells', () => {
    for (const atk of ELEMENTS) {
      for (const def of ELEMENTS) {
        expect(`${atk}->${def}=${getElementMultiplier(atk, def)}`).toBe(
          `${atk}->${def}=${EXPECTED[atk][def]}`
        )
      }
    }
  })

  it('keeps neutral inert on both sides', () => {
    for (const e of ELEMENTS) {
      expect(getElementMultiplier('neutral', e)).toBe(1.0)
      expect(getElementMultiplier(e, 'neutral')).toBe(1.0)
    }
  })

  it('makes the natural cycle one-directional and holy/void mutual', () => {
    // water > fire > earth > wind > water
    expect(getElementMultiplier('water', 'fire')).toBe(2.0)
    expect(getElementMultiplier('fire', 'water')).toBe(0.5)
    expect(getElementMultiplier('holy', 'void')).toBe(2.0)
    expect(getElementMultiplier('void', 'holy')).toBe(2.0)
  })

  it('resists itself for every non-neutral element', () => {
    for (const e of ELEMENTS) {
      expect(getElementMultiplier(e, e)).toBe(e === 'neutral' ? 1.0 : 0.5)
    }
  })

  it('isElement narrows only valid ids', () => {
    expect(isElement('holy')).toBe(true)
    expect(isElement('Holy')).toBe(false)
    expect(isElement('lightning')).toBe(false)
    expect(isElement(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/elements.test.ts`
Expected: FAIL — `Cannot find module '../config/combat/elements'`.

- [ ] **Step 3: Write minimal implementation**

Create `colyseus-server/src/config/combat/elements.ts`:

```ts
/**
 * Elements - RO-style elemental damage table (World Wisdom / F-017).
 *
 * Canon: docs/superpowers/specs/2026-07-27-world-wisdom-design.md
 * Natural cycle (one-directional): water > fire > earth > wind > water.
 * Opposed pair (mutual): holy <-> void.
 * `neutral` is the inert baseline: 1.0 as attacker and as defender.
 */

export const ELEMENTS = ['neutral', 'earth', 'water', 'wind', 'fire', 'holy', 'void'] as const

export type Element = (typeof ELEMENTS)[number]

export const DEFAULT_ELEMENT: Element = 'neutral'

/** Advantage. Cycle advantage and the holy/void duel both use this. */
const STRONG = 2.0
/** Reverse-of-cycle, and every element against itself. */
const WEAK = 0.5
const EVEN = 1.0

const ELEMENT_MULTIPLIER: Record<Element, Record<Element, number>> = {
  neutral: { neutral: EVEN, earth: EVEN, water: EVEN, wind: EVEN, fire: EVEN, holy: EVEN, void: EVEN },
  earth: { neutral: EVEN, earth: WEAK, water: EVEN, wind: STRONG, fire: WEAK, holy: EVEN, void: EVEN },
  water: { neutral: EVEN, earth: EVEN, water: WEAK, wind: WEAK, fire: STRONG, holy: EVEN, void: EVEN },
  wind: { neutral: EVEN, earth: WEAK, water: STRONG, wind: WEAK, fire: EVEN, holy: EVEN, void: EVEN },
  fire: { neutral: EVEN, earth: STRONG, water: WEAK, wind: EVEN, fire: WEAK, holy: EVEN, void: EVEN },
  holy: { neutral: EVEN, earth: EVEN, water: EVEN, wind: EVEN, fire: EVEN, holy: WEAK, void: STRONG },
  void: { neutral: EVEN, earth: EVEN, water: EVEN, wind: EVEN, fire: EVEN, holy: STRONG, void: WEAK },
}

export function isElement(value: unknown): value is Element {
  return typeof value === 'string' && (ELEMENTS as readonly string[]).includes(value)
}

/** Damage multiplier for an attack of `attack` element landing on a `defense` element target. */
export function getElementMultiplier(attack: Element, defense: Element): number {
  return ELEMENT_MULTIPLIER[attack][defense]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd colyseus-server && npm test -- src/tests/elements.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Format and commit**

```bash
cd colyseus-server && npm run format
git add src/config/combat/elements.ts src/tests/elements.test.ts
git commit -m "feat(combat): add element type and RO-style multiplier table"
```

- [ ] **Step 6: Quality gate** — dispatch an independent reviewer on this task's diff, act on findings, re-run `npm test -- src/tests/elements.test.ts`.

---

### Task 2: Element fields on entities and configs

**Files:**
- Modify: `colyseus-server/src/schemas/WorldLife.ts:36-49` (field), `:116-163` (constructor)
- Modify: `colyseus-server/src/config/combat/weapons.ts:7-24`
- Modify: `colyseus-server/src/config/mobs/types.ts:37-50`
- Test: `colyseus-server/src/tests/element-entity.test.ts` (create)

**Interfaces:**
- Consumes: `Element`, `DEFAULT_ELEMENT` from Task 1.
- Produces: `WorldLife.element: Element` (synced, defaults `'neutral'`, settable via the constructor options key `element`); optional `WeaponConfig.element?: Element`; optional `AttackDefinition.element?: Element`. Task 4 reads all three.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/element-entity.test.ts`:

```ts
import { Mob } from '../schemas/Mob'
import { WEAPONS } from '../config/combat/weapons'

const mob = (over: Record<string, unknown> = {}) =>
  new Mob({
    id: 'm',
    x: 0,
    y: 0,
    radius: 1,
    maxHealth: 100,
    pAtk: 10,
    attackRange: 5,
    atkWindDownTime: 1000,
    density: 1,
    ...over,
  })

describe('entity element', () => {
  it('defaults to neutral', () => {
    expect(mob().element).toBe('neutral')
  })

  it('is seeded from constructor options', () => {
    expect(mob({ element: 'void' }).element).toBe('void')
  })

  it('is a synced colyseus field', () => {
    // @colyseus/schema records synced fields on the class metadata.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (Mob as any)._definition?.schema ?? (Mob as any)[Symbol.metadata]
    expect(JSON.stringify(meta)).toContain('element')
  })
})

describe('weapon element', () => {
  it('leaves existing weapons neutral by default', () => {
    for (const weapon of Object.values(WEAPONS)) {
      expect(weapon.element ?? 'neutral').toBe('neutral')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/element-entity.test.ts`
Expected: FAIL — `element` is not a known property / option.

- [ ] **Step 3: Write minimal implementation**

In `colyseus-server/src/schemas/WorldLife.ts`, add the import and the field next to `armor` (around line 36):

```ts
import { DEFAULT_ELEMENT, type Element } from '../config/combat/elements'
```

```ts
  // Elemental defense (World Wisdom / F-017). Attack element x this decides the
  // damage multiplier in DamageCalculator.
  @type('string') element: Element = DEFAULT_ELEMENT
```

Add `element?: Element` to the constructor options type (next to `armor?: number`, around line 131) and seed it next to the other assignments (around line 148):

```ts
    this.element = opts.element ?? DEFAULT_ELEMENT
```

If `Mob` (and `Player`/`NPC`) build their own options object rather than forwarding, add `element` to that pass-through too — the seeding test above proves whether it reaches `WorldLife`.

In `colyseus-server/src/config/combat/weapons.ts`, add to `WeaponConfig` (after `range`):

```ts
  /** Elemental damage type this weapon deals. Omit for neutral (World Wisdom / F-017). */
  element?: Element
```

with `import type { Element } from './elements'` at the top. Do **not** change any existing weapon entry — every current weapon stays neutral.

In `colyseus-server/src/config/mobs/types.ts`, add to `AttackDefinition` (after `atkBaseDmg`):

```ts
  /** Elemental damage type of this attack. Omit for neutral (World Wisdom / F-017). */
  element?: Element
```

with `import type { Element } from '../combat/elements'` at the top. Do **not** change any existing mob definition — the six shipped mob types stay neutral so `generated/mob-types.json` and every existing balance test are untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd colyseus-server && npm test -- src/tests/element-entity.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full suite + build**

Run: `cd colyseus-server && npm test && npm run build`
Expected: PASS + clean `tsc`.

- [ ] **Step 6: Regenerate C# client models if the codegen covers schemas**

Run: `cd colyseus-server && ls scripts/codegen/` then run whichever schema/codegen script exists (the repo keeps `generated/csharp/` in sync with schemas). Commit any regenerated output with the change.

- [ ] **Step 7: Format and commit**

```bash
cd colyseus-server && npm run format
git add src/schemas/WorldLife.ts src/config/combat/weapons.ts src/config/mobs/types.ts src/tests/element-entity.test.ts generated/
git commit -m "feat(combat): add element field to entities, weapons and mob attacks"
```

- [ ] **Step 8: Quality gate** — independent review, refactor, re-run `npm test && npm run build`.

---

### Task 3: Element-aware damage calculation

Converts `DamageCalculator.calculate` and `BattleModule.calculateDamage` to a single options object (repo invariant) and applies the multiplier after defense reduction.

**Files:**
- Modify: `colyseus-server/src/modules/combat/DamageCalculator.ts` (whole file)
- Modify: `colyseus-server/src/modules/BattleModule.ts:218-225`
- Test: `colyseus-server/src/tests/damage-calculator.test.ts` (migrate + extend)
- Test: `colyseus-server/src/tests/char-battlemodule-damage.test.ts` (migrate)

**Interfaces:**
- Consumes: `getElementMultiplier`, `Element`, `DEFAULT_ELEMENT`, `isElement` from Task 1; `WorldLife.element` from Task 2.
- Produces: `DamageCalculator.calculate(opts: { baseDamage: number; damageType: 'physical' | 'magical'; attackElement: Element; target: WorldLife }): number` and the identical-shaped `BattleModule.calculateDamage(opts)`. Task 4 calls `calculateDamage` with this exact object.
- The `isElement(target.element)` guard is kept even though Task 2 gives the field a non-optional default — it is the fallback for entities deserialised or constructed outside the schema constructor.

- [ ] **Step 1: Write the failing test**

Replace the body of `colyseus-server/src/tests/damage-calculator.test.ts` with:

```ts
import { DamageCalculator } from '../modules/combat/DamageCalculator'
import { Mob } from '../schemas/Mob'

// Mirrors the Phase 0 damage table (char-battlemodule-damage) directly against
// DamageCalculator: afterDefense = max(1, base - min(totalDef, base*0.8)) where
// totalDef = (magical ? mDef : pDef) + armor; final = max(1, floor(afterDefense * element)).
describe('DamageCalculator.calculate', () => {
  const target = (over: Partial<{ pDef: number; mDef: number; armor: number }>) =>
    new Mob({
      id: 't',
      x: 0,
      y: 0,
      radius: 1,
      maxHealth: 100,
      pAtk: 10,
      attackRange: 5,
      atkWindDownTime: 1000,
      pDef: over.pDef ?? 0,
      mDef: over.mDef ?? 0,
      armor: over.armor ?? 0,
      density: 1,
    })

  // --- behaviour preservation: identical numbers to the pre-element formula ---
  it('physical: subtracts pDef + armor', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 10, armor: 5 }),
      })
    ).toBe(85)
  })
  it('magical: subtracts mDef + armor (ignores pDef)', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'magical',
        attackElement: 'neutral',
        target: target({ pDef: 999, mDef: 4, armor: 5 }),
      })
    ).toBe(91)
  })
  it('caps reduction at 80% of base damage', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 500 }),
      })
    ).toBe(20)
  })
  it('never reduces below 1', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 1,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 500 }),
      })
    ).toBe(1)
  })
  it('floors fractional results', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 10,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 0.5 }),
      })
    ).toBe(9)
  })

  // --- element behaviour ---
  it('doubles damage on elemental advantage, after defense', () => {
    const t = target({ pDef: 10, armor: 5 })
    t.element = 'fire' // 85 after defense, water > fire => x2
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'water',
        target: t,
      })
    ).toBe(170)
  })
  it('halves damage on elemental disadvantage', () => {
    const t = target({ pDef: 10, armor: 5 })
    t.element = 'water' // 85 after defense, fire vs water => x0.5 => 42.5 => 42
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'fire',
        target: t,
      })
    ).toBe(42)
  })
  it('never lets a resisted hit fall below 1', () => {
    const t = target({ pDef: 500 })
    t.element = 'water'
    // afterDefense = 1, x0.5 = 0.5, floor = 0 -> clamped back to 1
    expect(
      DamageCalculator.calculate({
        baseDamage: 1,
        damageType: 'physical',
        attackElement: 'fire',
        target: t,
      })
    ).toBe(1)
  })
  it('treats an unrecognised element as neutral', () => {
    const t = target({ pDef: 10, armor: 5 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(t as any).element = 'lightning'
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'fire',
        target: t,
      })
    ).toBe(85)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/damage-calculator.test.ts`
Expected: FAIL — TypeScript rejects the object argument against the current 3-positional-param signature.

- [ ] **Step 3: Write minimal implementation**

Replace `colyseus-server/src/modules/combat/DamageCalculator.ts` with:

```ts
/**
 * DamageCalculator - pure damage formula (no state).
 *
 * Defense reduction is the original Phase 0 formula, untouched. The element
 * multiplier is applied AFTER it, so an elemental advantage exactly doubles the
 * number the player sees (World Wisdom / F-017).
 */
import { WorldLife } from '../../schemas/WorldLife'
import {
  DEFAULT_ELEMENT,
  getElementMultiplier,
  isElement,
  type Element,
} from '../../config/combat/elements'

export interface DamageCalculationOptions {
  baseDamage: number
  damageType: 'physical' | 'magical'
  /** Element of the incoming attack. */
  attackElement: Element
  target: WorldLife
}

export class DamageCalculator {
  static calculate(opts: DamageCalculationOptions): number {
    const { baseDamage, damageType, attackElement, target } = opts

    const primaryDefense = damageType === 'magical' ? target.mDef : target.pDef
    const totalDefense = primaryDefense + target.armor

    // Cap defense at 80% damage reduction
    const damageReduction = Math.min(totalDefense, baseDamage * 0.8)
    const afterDefense = Math.max(1, baseDamage - damageReduction)

    const defenseElement = isElement(target.element) ? target.element : DEFAULT_ELEMENT
    const multiplier = getElementMultiplier(attackElement, defenseElement)

    // Clamp again after the multiplier so a resisted hit still lands for 1.
    return Math.max(1, Math.floor(afterDefense * multiplier))
  }
}
```

Then update `colyseus-server/src/modules/BattleModule.ts:218-225` to:

```ts
  // Calculate damage with defense + element (delegates to DamageCalculator)
  calculateDamage(opts: DamageCalculationOptions): number {
    return DamageCalculator.calculate(opts)
  }
```

and add `DamageCalculationOptions` to the existing `DamageCalculator` import in that file. Update the single internal caller at `BattleModule.ts:90` to:

```ts
    const damage = this.calculateDamage({
      baseDamage,
      damageType,
      attackElement: payload?.element ?? DEFAULT_ELEMENT,
      target,
    })
```

(importing `DEFAULT_ELEMENT` from `../config/combat/elements`; `payload.element` becomes a real field in Task 4 — until then TypeScript will reject it, so for THIS task use `DEFAULT_ELEMENT` alone and leave a `// element threaded in Task 4` comment.)

- [ ] **Step 4: Migrate the second pinned test file**

In `colyseus-server/src/tests/char-battlemodule-damage.test.ts`, convert every `calculateDamage(base, type, target)` call to the options-object form with `attackElement: 'neutral'`. The expected numbers must not change.

- [ ] **Step 5: Run the full server suite**

Run: `cd colyseus-server && npm test`
Expected: PASS. Fix any other call site the compiler flags (`ProjectileCollisionResolver.ts:83-88` is the likely one).

- [ ] **Step 6: Format and commit**

```bash
cd colyseus-server && npm run format
git add src/modules/combat/DamageCalculator.ts src/modules/BattleModule.ts src/tests/damage-calculator.test.ts src/tests/char-battlemodule-damage.test.ts
git commit -m "feat(combat): apply element multiplier in damage calculation"
```

- [ ] **Step 7: Quality gate** — independent review of the diff (pay attention to: did any call site get silently defaulted to neutral that should carry a real element in Task 4?), refactor, re-run `npm test`.

---

### Task 4: Thread the attack element through the battle path

**Files:**
- Modify: `colyseus-server/src/modules/BattleActionMessage.ts:15-32`
- Modify: `colyseus-server/src/modules/BattleManager.ts:93-113`
- Modify: `colyseus-server/src/modules/BattleModule.ts:80-90`
- Modify: `colyseus-server/src/systems/PlayerCombatSystem.ts:206-212`, `src/systems/MobCombatSystem.ts:126-133`, `src/systems/NPCCombatSystem.ts` (~:99)
- Modify: `colyseus-server/src/modules/projectile/ProjectileCollisionResolver.ts:57-88`
- Test: `colyseus-server/src/tests/element-combat-integration.test.ts` (create)

**Interfaces:**
- Consumes: `Element`/`DEFAULT_ELEMENT` (Task 1), `WorldLife.element` + `WeaponConfig.element` + `AttackDefinition.element` (Task 2), `calculateDamage(opts)` (Task 3).
- Produces: `AttackActionPayload.element?: Element`; `ProjectileDetail.element?: Element`; `BattleManager.createAttackMessage(opts: { actorId: string; targetId: string; damage: number; range: number; element?: Element; direction?: { x: number; y: number } }): BattleActionMessage`.

- [ ] **Step 1: Write the failing test**

Create `colyseus-server/src/tests/element-combat-integration.test.ts`:

```ts
import { BattleManager } from '../modules/BattleManager'
import type { AttackActionPayload } from '../modules/BattleActionMessage'

describe('createAttackMessage', () => {
  it('carries the attack element into the payload', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
      element: 'fire',
    })
    expect((msg.actionPayload as AttackActionPayload).element).toBe('fire')
    expect(msg.actionKey).toBe('attack')
    expect(msg.targetId).toBe('b')
  })

  it('defaults to neutral when no element is supplied', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
    })
    expect((msg.actionPayload as AttackActionPayload).element).toBe('neutral')
  })
})
```

Then add an end-to-end case in the same file that drives `BattleModule.processAttack` with a fire-element payload against a water-element target and asserts the target lost exactly half the neutral damage. Build the two entities the same way `src/tests/battle.test.ts` does — read that file and copy its room/entity setup rather than inventing one.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/element-combat-integration.test.ts`
Expected: FAIL — `createAttackMessage` still takes positional args.

- [ ] **Step 3: Convert the message factory to an options object**

In `colyseus-server/src/modules/BattleManager.ts`, replace `createAttackMessage` (lines 93-113) with:

```ts
  static createAttackMessage(opts: {
    actorId: string
    targetId: string
    damage: number
    range: number
    element?: Element
    direction?: { x: number; y: number }
  }): BattleActionMessage {
    return {
      actorId: opts.actorId,
      actionKey: 'attack',
      actionPayload: {
        damage: opts.damage,
        range: opts.range,
        direction: opts.direction,
        attackType: 'melee',
        element: opts.element ?? DEFAULT_ELEMENT,
      } as AttackActionPayload,
      targetId: opts.targetId,
      timestamp: Date.now(),
      priority: 1,
    }
  }
```

- [ ] **Step 4: Add the element to the message types**

In `colyseus-server/src/modules/BattleActionMessage.ts`, add `element?: Element` to both `ProjectileDetail` (after `damageType`) and `AttackActionPayload` (after `damageType`), importing `type Element` from `../config/combat/elements`.

- [ ] **Step 5: Read the element at the emit sites**

Update all three combat systems to pass `element` into `createAttackMessage` (and to the options-object call shape):
- `PlayerCombatSystem.ts:206-212` — `element: WEAPONS[player.equippedWeaponId]?.element` (the equipped-weapon id already lives at `Player.equippedWeaponId`).
- `MobCombatSystem.ts:126-133` — `element: attack.element` from the `AttackDefinition` being executed.
- `NPCCombatSystem.ts` (~:99) — same shape as the mob system.

In `ProjectileCollisionResolver.ts:57-88`, carry `element` on the `ProjectileDetail` it builds and pass it through on the direct-damage fallback path at `:83-88`.

- [ ] **Step 6: Consume it in processAttack**

In `colyseus-server/src/modules/BattleModule.ts`, replace the `DEFAULT_ELEMENT` placeholder left by Task 3 (around line 90) with:

```ts
    const damage = this.calculateDamage({
      baseDamage,
      damageType,
      attackElement: payload?.element ?? DEFAULT_ELEMENT,
      target,
    })
```

- [ ] **Step 7: Run the full suite + build**

Run: `cd colyseus-server && npm test && npm run build`
Expected: PASS. Every pre-existing combat test must still pass unchanged — nothing in the shipped content carries a non-neutral element yet, so all live numbers are identical.

- [ ] **Step 8: Format and commit**

```bash
cd colyseus-server && npm run format
git add src/modules src/systems src/tests/element-combat-integration.test.ts
git commit -m "feat(combat): thread attack element from configs into damage"
```

- [ ] **Step 9: Quality gate** — independent review (specifically: is there any damage path that reaches `applyDamage` while silently skipping the element — zone effects at `ZoneEffectManager.ts:218` and DOT ticks at `StatusEffectManager.ts:21,109` both bypass `calculateDamage` entirely; the reviewer must confirm that is intentional and documented, not an oversight), refactor, re-run `npm test && npm run build`.

---

### Task 5: Canon and style-bible rewrite

**Files:**
- Modify: `content/story/style.md:173-194`
- Modify: `content/story/canon.md` (new section)

**Interfaces:**
- Consumes: the approved spec's Magic Model, element table, and schools/towns table.
- Produces: the canon text that Task 6's lore nodes must not contradict.

- [ ] **Step 1: Read the surrounding voice rules first**

Read `content/story/style.md` in full and `content/story/README.md`. The rewrite must keep §6's register and numbered-rule shape; it is a voice-law document, not a systems doc.

- [ ] **Step 2: Rewrite §6**

Replace `content/story/style.md` lines 173-194 with a §6 that opens on widespread-but-warded magic and keeps every surviving rule. Required content, per spec decision #11:

1. The opening framing becomes: magic is **common and cheap** — cast from personal mana or from magic stones that are mined in many towns and sold like any other good. What limits magic is not fuel but **antimagic runes**: standard war gear is rune-warded, ordinary combat magic fails against it, and only rare High-Tier casters break wards. Rune-craft is public knowledge; every town wards its own.
2. **Keep, unchanged in substance:** monsters-are-war-scars; arms-are-fantastic-but-still-just-arms (danger tiers follow trade routes, not raw magical power); Cindervast-is-a-magical-wound; espionage-is-fantastic-in-texture-only.
3. **Keep the iron rule verbatim in force:** no spell resolves a political knot, cures grief or trauma, or raises the dead; deaths are permanent; love and politics are decided by human action. Add one clarifying clause: *widespread magic does not soften this — a world full of casters is still a world where nobody can cast the war away.*
4. Add one new rule: **elements are texture, not physics lectures** — prose names an element (a fire-warded blade, a bell that rings holy) but never quotes multipliers or game numbers.

- [ ] **Step 3: Add the canon section**

Append a section to `content/story/canon.md` titled "Magic, schools, and the elements" containing, in canon-bible register (prose + tables, matching that file's existing style):
- The four Magic Model rules from the spec (widespread; runes as the real limit; public rune-craft; what this does and does not change about the war).
- The six elements with the cycle and the holy/void pair described **in words only, no multipliers** (per the new §6 rule 4).
- The wisdom-branch / school / town table verbatim from the spec, including the note that **Void has no official school** and is learned outside the system.
- The race and class rosters as canon lists, with the muscularity-gradient note.
- An explicit line that class and race are not yet represented server-side (phase C), so no canon text may assume a player's class exists in game state.

- [ ] **Step 4: Verify no contradiction remains**

Run: `grep -rn -i "scarce\|oil, not miracle" content/story/`
Expected: no hit that still frames magic as scarce.

Run: `node scripts/check_content.mjs`
Expected: same result as before this task (these two files are prose, not schema-validated — the gate must not regress).

- [ ] **Step 5: Commit**

```bash
git add content/story/style.md content/story/canon.md
git commit -m "docs(story): rewrite magic rules for widespread-but-warded canon"
```

- [ ] **Step 6: Quality gate** — independent review against the spec AND against `content/story/style.md`'s own voice rules (the reviewer should load `story-content-writer`), refactor, re-run the grep + gate.

---

### Task 6: Magic lore fragments in the story graph

**Files:**
- Modify: `content/story/lore.json`
- Modify: `docs/story/story-graph.md` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: Task 5's canon text.
- Produces: a new lore thread that the content gate accepts.

- [ ] **Step 1: Read the schema and an existing thread**

Read `content/schemas/lore.schema.json` and the `the-bent-bells` thread in `content/story/lore.json`. Required fields: `id, title, kind, summary, links, body, anchor, thread`. `additionalProperties` is `false` — do not invent fields. `anchor` must match `^[a-z0-9]+(-[a-z0-9]+)*$` and must resolve to a real node id; check what existing entries use before choosing.

- [ ] **Step 2: Write the lore nodes**

Add at least **four** `lore-*` nodes on a new thread `the-warded-world` (the gate WARNs on threads with fewer than 2 fragments; four gives the thread real shape). Suggested set, each anchored to an existing node that already exists in the graph:
- a Gildmark rune-shop bill of sale that treats warding as routine trade,
- a Bellfaith healer's note on a war-scar wound that will not close,
- an Elements-school admission letter turning away a student who cannot reach High Tier,
- a confiscated page from an unlicensed Void manual.

Each must obey the new §6 (no multipliers in prose) and the existing style-bible register.

- [ ] **Step 3: Run the gate**

Run: `node scripts/check_content.mjs`
Expected: 0 failures, 0 warnings. If a new WARN appears (orphan, thread size, unresolved anchor), fix the content — do not weaken the gate.

- [ ] **Step 4: Run the stricter ship bar**

Run: `node scripts/check_content.mjs --require-complete`
Expected: pass.

- [ ] **Step 5: Regenerate the story graph and check drift**

```bash
node scripts/gen_story_graph.mjs --write
node scripts/gen_story_graph.mjs --check
```
Expected: `--check` passes after `--write`.

- [ ] **Step 6: Run the scripts test suite**

Run: `cd scripts && npm ci && npm test`
Expected: all node:test suites pass.

- [ ] **Step 7: Commit**

```bash
git add content/story/lore.json docs/story/story-graph.md
git commit -m "feat(story): add the-warded-world magic lore thread"
```

- [ ] **Step 8: Quality gate** — independent review (canon consistency + style-bible compliance + gate output pasted as evidence), refactor, re-run the gate and the drift check.

---

## Final verification (before `/ps-release-workflow:ship F-017`)

- [ ] `cd colyseus-server && npm test && npm run build` — green, with output pasted as evidence.
- [ ] `node scripts/check_content.mjs --require-complete` — 0 failures, 0 warnings.
- [ ] `node scripts/gen_story_graph.mjs --check` — no drift.
- [ ] `cd scripts && npm test` — green.
- [ ] `cd colyseus-server && npm run format:check` — clean.
- [ ] Whole-branch adversarial review against the spec (all 12 owner decisions), then `/ps-release-workflow:ship F-017` (Gate 1 `precheck.sh`).
