# BATTLE_ATTACK channel + element Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for a `BATTLE_ATTACK` emitter to omit its damage channel or its element, so a future magical attack can never be silently mitigated by `pDef`.

**Architecture:** `BattleAttackData` gains required `damageType` and `element` fields; the `BattleManager` listener threads them into `createAttackMessage`; every silent default down the chain is removed, leaving one deliberately *audible* runtime guard where `actionPayload: any` erases the types. Separately, `getSkillDamageForKind` returns a result type so a zeroed offence stat can never masquerade as damage.

**Tech Stack:** TypeScript (strict), Colyseus, Jest + ts-jest, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-31-battle-attack-damagetype-design.md` — read it before Task 1.

## Global Constraints

- **Use `pnpm`, never `npm`.**
- **Never `git commit --amend`** — a new commit on top, always.
- **A green jest run does not prove the build compiles.** ts-jest transpiles per file and caches. Before claiming any task done: `cd contracts && pnpm build`, then `cd colyseus-server && npx tsc --noEmit`.
- **All combat/damage logic stays centralised in `BattleModule`.** Emitters hand off to `BattleManager` to *enqueue*; never compute damage in an emitter or system.
- **Do not touch the two `it.failing` tests** (`f018-model-parity.test.ts:324`, `f018-boss-spread.test.ts:172`). They are inverted tripwires — jest reports an *error* if they start passing. If one fires, stop and investigate; if the behaviour is genuinely fixed, flip `it.failing` → `it` in the same PR with the reason. Never delete one, never re-mark one to force green.
- **Do not run prettier on `tools/combat-lab/combat-model.json`.**
- **Immediately after claiming the feature branch:** `git merge release/1.6 --no-edit`. The claim script cuts from `main`; this bit both F-018 and F-019 in release 1.5.
- **Every task ends with the quality gate** (implement → verify → independent review → refactor → re-verify). It is not optional and is not a permission checkpoint.

## File Structure

| file | responsibility after this plan |
| --- | --- |
| `src/events/EventBus.ts` | `BattleAttackData` — the event contract; owns the *requirement* that a channel and element be stated |
| `src/modules/BattleManager.ts` | listener threads both fields through; `createAttackMessage` is the single factory, with no defaults left |
| `src/modules/BattleActionMessage.ts` | `AttackActionPayload` — required `damageType` / `element` |
| `src/modules/BattleModule.ts` | `processAttack` reads both without silent fallback; holds the one audible guard for the `any` hole |
| `src/systems/{Mob,NPC,Player}CombatSystem.ts` | each states its channel and element explicitly, with the reason |
| `src/combat/attackDamage.ts` | `getSkillDamageForKind` → `SkillDamageResolution`; a zeroed stat is unrepresentable as damage |
| `src/tests/battle-attack-channel.test.ts` | **new** — the red-first proof, driven through the real event → queue → calculator chain |

---

### Task 1: State the channel and element everywhere, while the fields are still optional

Pure churn. Compiles at every point, **zero behaviour change** — the listener still drops both fields, so nothing observable moves. This ordering exists so the commit that *does* change behaviour (Task 2) is small enough to read line by line. See spec §11.

**Files:**
- Modify: `src/events/EventBus.ts:42-48`
- Modify: `src/systems/MobCombatSystem.ts:130-136`
- Modify: `src/systems/NPCCombatSystem.ts:102-108`
- Modify: `src/systems/PlayerCombatSystem.ts:210-216`
- Modify (call sites, `damageType`/`element` added where absent): `src/tests/battle.test.ts:51,70,78`, `src/tests/battle-messages.test.ts:44,86,130,151,204,218`, `src/tests/room-scoped-battle.test.ts:90,100,134,142,176`, `src/tests/f018-harness.ts:277,308`, `src/tests/element-combat-integration.test.ts:36,49`, `src/tests/damage-type-routing.test.ts:40,61`

**Interfaces:**
- Consumes: nothing.
- Produces: `BattleAttackData` with optional `damageType?: 'physical' | 'magical'` and `element?: Element`. Task 3 flips both to required.

- [ ] **Step 1: Add the two optional fields to the event contract**

`src/events/EventBus.ts` — add the import and the fields:

```ts
import type { Element } from '../config/combat/elements'

export interface BattleAttackData {
  actorId: string
  targetId?: string // Optional - allows attacks without targets (e.g., player swinging weapon)
  damage: number
  /**
   * Which defence mitigates this hit: `pDef` for 'physical', `mDef` for 'magical'.
   * Optional only until I-037 Task 3 makes it required — state it, always.
   */
  damageType?: 'physical' | 'magical'
  /** Attack element (World Wisdom / F-017). State 'neutral' explicitly; do not omit. */
  element?: Element
  range: number
  roomId: string
}
```

- [ ] **Step 2: State the values in the mob emitter**

`src/systems/MobCombatSystem.ts` — keep the existing comment above it, add both fields:

```ts
    const attackData: BattleAttackData = {
      actorId: this.mob.id,
      targetId: target.id,
      damage: this.mob.pAtk,
      // Physical on purpose, not by default: `damage` is sourced from pAtk directly above.
      damageType: 'physical',
      // Neutral by construction — no AttackDefinition executes on this path, so there is
      // no element to read (World Wisdom / F-017).
      element: 'neutral',
      range: this.mob.attackRange,
      roomId: roomId,
    }
```

- [ ] **Step 3: State the values in the NPC emitter**

`src/systems/NPCCombatSystem.ts` — same shape, keeping its existing comment:

```ts
    const attackData: BattleAttackData = {
      actorId: this.npc.id,
      targetId: targetMob.id,
      damage: this.npc.pAtk,
      // Physical on purpose: `damage` is sourced from pAtk directly above.
      damageType: 'physical',
      // NPCs are always neutral today — their only strategy is the bare
      // MeleeAttackStrategy built in RoomEventHandler.handleNPCSpawned, constructed
      // without an `attack` option, so there is no element source at all.
      element: 'neutral',
      range: this.npc.attackRange,
      roomId: roomId,
    }
```

- [ ] **Step 4: State the values in the player emitter — and annotate the literal**

`src/systems/PlayerCombatSystem.ts:210`. **The missing type annotation is why this emitter could drift undetected — add it.** Without `: BattleAttackData` the object is structurally typed and a required field would not be enforced here in Task 3, leaving a second hole.

```ts
    // Emit BATTLE_ATTACK for client animation only (targetId is always '', so this
    // never resolves to a damage message). Both fields are still stated, because
    // "animation-only" is a property of this call site, not of the event.
    const attackData: BattleAttackData = {
      actorId: this.player.id,
      targetId: '', // Cleaving hitboxes don't have a single explicit target upfront
      damage: this.player.pAtk, // just for visual numbers/logs
      damageType: 'physical',
      element: 'neutral',
      range: this.player.attackRange,
      roomId: roomId,
    }
```

Add the import if absent: `import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'`.

- [ ] **Step 5: Add `damageType` and `element` at every `createAttackMessage` call site that lacks them**

Enumerate them:

```bash
cd colyseus-server && grep -rn "createAttackMessage({" src --include="*.ts"
```

For each hit, add whichever of the two is missing. Physical/neutral unless the test's name or assertions say otherwise — **read each one; do not blanket-replace.** Two must NOT be changed:
- `src/tests/damage-type-routing.test.ts:51` — the "defaults to physical when no damageType is supplied" test. It is deleted in Task 3, not edited here.
- `src/tests/element-combat-integration.test.ts` — any case whose whole point is an omitted `element`. Same treatment: leave for Task 3.

Worked example — `src/tests/battle.test.ts:51`:

```ts
        BattleManager.createAttackMessage({
          actorId: 'player1',
          targetId: 'mob1',
          damage: 10,
          range: 2,
          damageType: 'physical',
          element: 'neutral',
        })
```

- [ ] **Step 6: Verify nothing moved**

```bash
cd contracts && pnpm build
cd ../colyseus-server && npx tsc --noEmit && pnpm test
```

Expected: tsc clean; jest **same pass/fail counts as before this task**. Any change in behaviour means a value was mis-stated in steps 2-5 — find it before continuing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(combat): state damageType + element at every BATTLE_ATTACK site (I-037)"
```

- [ ] **Step 8: Quality gate**

Independent adversarial review of this task's diff (fresh reviewer, not self-review): confirm every added value is *correct*, not merely plausible — each emitter's `damage` must genuinely source from `pAtk` for `'physical'` to be right. Then refactor anything the review flags, and re-run Step 6.

---

### Task 2: The red-first proof, and the fix it proves

**Files:**
- Create: `src/tests/battle-attack-channel.test.ts`
- Modify: `src/modules/BattleManager.ts:41-70` (the listener)

**Interfaces:**
- Consumes: `BattleAttackData.damageType` / `.element` from Task 1.
- Produces: a `BattleManager` listener that forwards both fields to `createAttackMessage`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/battle-attack-channel.test.ts`. Structure mirrors `src/tests/damage-type-routing.test.ts`, which is the established pattern for this chain.

```ts
/**
 * BATTLE_ATTACK must carry its damage channel and element (I-037).
 *
 *   eventBus.emit(BATTLE_ATTACK)
 *     -> BattleManager listener
 *     -> BattleManager.createAttackMessage  (AttackActionPayload.damageType)
 *     -> BattleManager.processActionMessages
 *     -> BattleModule.processAttack
 *     -> DamageCalculator  (picks target.mDef vs target.pDef)
 *
 * Before this fix the listener dropped both fields, so every queued hit on this
 * path resolved as physical/neutral no matter what the emitter intended.
 *
 * Asserted via asymmetric pDef/mDef so the resulting number identifies which
 * channel was read. `damage` is passed explicitly and never sourced from mAtk —
 * after F-019 a blade yields mAtk of exactly 0, so a wrong-channel hit and a
 * correct-but-zero hit would otherwise be indistinguishable.
 */

import { BattleManager } from '../modules/BattleManager'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'

/** Asymmetric on purpose: whichever channel is read shows up in the number. */
const P_DEF = 40
const M_DEF = 10
const BASE_DAMAGE = 100

describe('BATTLE_ATTACK carries the damage channel to DamageCalculator', () => {
  let gameState: GameState
  let attacker: Player
  let mob: Mob
  let battleManager: BattleManager

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-battle-attack-channel')
    // Adjacent: this path is attackType 'melee', so canAttack DOES apply the range
    // check (only 'projectile' bypasses it).
    attacker = new Player('attacker-session', 'Attacker', 100, 100)
    mob = new Mob({
      id: 'thick-skinned-mob',
      x: 101,
      y: 100,
      maxHealth: 5000,
      pDef: P_DEF,
      mDef: M_DEF,
      armor: 0,
      element: 'neutral',
    })
    gameState.players.set(attacker.id, attacker)
    gameState.mobs.set(mob.id, mob)
    battleManager = new BattleManager(gameState.roomId, gameState)
  })

  afterEach(() => {
    battleManager.cleanup()
    gameState.stopAI()
  })

  const emittedHitDamage = async (damageType: 'physical' | 'magical'): Promise<number> => {
    const attackData: BattleAttackData = {
      actorId: attacker.id,
      targetId: mob.id,
      damage: BASE_DAMAGE,
      damageType,
      element: 'neutral',
      range: attacker.attackRange,
      roomId: gameState.roomId,
    }
    const before = mob.currentHealth
    eventBus.emitRoomEvent(gameState.roomId, RoomEventType.BATTLE_ATTACK, attackData)
    await battleManager.processActionMessages()
    return before - mob.currentHealth
  }

  it('mitigates a magical BATTLE_ATTACK with mDef, not pDef', async () => {
    // 100 base - mDef 10 = 90. The defect produces 100 - pDef 40 = 60.
    expect(await emittedHitDamage('magical')).toBe(BASE_DAMAGE - M_DEF)
  })

  it('still mitigates a physical BATTLE_ATTACK with pDef', async () => {
    expect(await emittedHitDamage('physical')).toBe(BASE_DAMAGE - P_DEF)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails for the predicted reason**

```bash
cd colyseus-server && pnpm test -- src/tests/battle-attack-channel.test.ts
```

Expected: **the magical test FAILS with `Expected: 90, Received: 60`.** The physical test passes.

**This red is the deliverable of the task.** If the magical test passes already, or fails with a different number, stop — the test is not exercising the path it claims. Do not proceed to Step 3 until the failure reads exactly as above.

- [ ] **Step 3: Thread both fields through the listener**

`src/modules/BattleManager.ts` — replace the comment block at `:50-61` and the call at `:62-67`:

```ts
      // The channel and element are stated by the emitter and forwarded verbatim.
      // They are NOT defaulted here: a hit that reaches DamageCalculator on the
      // wrong channel is mitigated by the wrong defence, silently (I-037).
      const attackMessage = BattleManager.createAttackMessage({
        actorId: data.actorId,
        targetId: data.targetId || '', // Use empty string if no target
        damage: data.damage,
        damageType: data.damageType,
        element: data.element,
        range: data.range,
      })
```

- [ ] **Step 4: Run it and confirm green**

```bash
cd colyseus-server && pnpm test -- src/tests/battle-attack-channel.test.ts
```

Expected: both tests PASS.

- [ ] **Step 5: Run the full suite**

```bash
cd contracts && pnpm build
cd ../colyseus-server && npx tsc --noEmit && pnpm test
```

Expected: tsc clean, no new failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(combat): carry damageType + element through the BATTLE_ATTACK listener (I-037)"
```

- [ ] **Step 7: Quality gate**

Independent adversarial review of this diff. The reviewer's specific job: **confirm the test would still fail if the fix were reverted** — a test that passes for an incidental reason proves nothing. Refactor per review, re-run Step 5.

---

### Task 3: Make the omission unrepresentable

**Files:**
- Modify: `src/events/EventBus.ts` (flip both to required)
- Modify: `src/modules/BattleManager.ts:107-139` (`createAttackMessage` opts required; drop both defaults)
- Modify: `src/modules/BattleActionMessage.ts:29-42` (`AttackActionPayload` required)
- Modify: `src/modules/BattleModule.ts:81-96` (drop the silent fallback) and `:428+` (`handleAttackMessage` guard)
- Modify: `src/tests/damage-type-routing.test.ts` (delete one test — see Step 5)

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: `createAttackMessage(opts)` where `damageType: 'physical' | 'magical'` and `element: Element` are **required**; `AttackActionPayload` with both required.

- [ ] **Step 1: Flip the event contract to required**

`src/events/EventBus.ts` — remove both `?` from `BattleAttackData.damageType` and `.element`, and update the doc comments to drop the "optional only until" wording added in Task 1.

- [ ] **Step 2: Flip the factory and the payload**

`src/modules/BattleManager.ts` — in `createAttackMessage`'s options, `damageType: 'physical' | 'magical'` and `element: Element` lose their `?`. Delete both default lines:

```ts
    const element = opts.element ?? DEFAULT_ELEMENT   // DELETE
    const damageType = opts.damageType ?? 'physical'  // DELETE
```

and use `opts.element` / `opts.damageType` directly in the payload and in the `projectileDetail` mirror. `DEFAULT_ELEMENT` may become an unused import — remove it if so; `tsc`/ESLint will say.

`src/modules/BattleActionMessage.ts` — `AttackActionPayload.damageType` and `.element` lose their `?`.

- [ ] **Step 3: Drop the silent fallback in `processAttack`**

`src/modules/BattleModule.ts:81-96`:

```ts
    // Determine damage based on payload or use fallback
    let baseDamage = attacker.pAtk // Default fallback to physical pAtk
    let damageType: 'physical' | 'magical' = 'physical'

    if (payload) {
      baseDamage = payload.damage
      damageType = payload.damageType
    }
```

The `?? DEFAULT_ELEMENT` on the `attackElement` line goes too — read `payload.element` when a payload exists. Keep the no-payload branch as-is: `processAttack` is still callable without a payload, and physical/neutral is the documented meaning of that call.

- [ ] **Step 4: Add the one audible guard**

`src/modules/BattleModule.ts`, at the top of `handleAttackMessage` (`:428`). This exists because `BattleActionMessage.actionPayload` is typed `any` (`:11`) and `processAction` casts it at `:393` — the only place the compile-time guarantee does not hold. See spec §5 and I-041.

```ts
    if (payload.damageType !== 'physical' && payload.damageType !== 'magical') {
      console.error(
        `❌ BATTLE: attack from ${actor.id} arrived with no damageType — resolving as ` +
          `physical. This is a defect, not a default (I-037).`
      )
    }
```

**Do not throw.** `BattleManager.processActionMessages` wraps `processAction` in `try/catch` and only logs, so a throw would make the whole attack silently vanish — a quieter failure than the one being fixed.

- [ ] **Step 5: Delete the test that pins the removed default**

`src/tests/damage-type-routing.test.ts:50-58` — delete the whole `it('defaults to physical when no damageType is supplied', ...)` block. It is an F-018 test pinning the exact behaviour being removed. Replace it with a comment so it does not read as an accidental deletion:

```ts
  // The "defaults to physical when none supplied" case was deleted with I-037:
  // damageType is now required, so the default it pinned no longer exists.
```

Do the same for any `element`-omission case in `src/tests/element-combat-integration.test.ts` that no longer compiles.

- [ ] **Step 6: Let the compiler find the rest**

```bash
cd contracts && pnpm build
cd ../colyseus-server && npx tsc --noEmit
```

Expected: any call site Task 1 missed now errors. Fix each by stating the correct value — **read the surrounding test to decide, do not blanket-fill `'physical'`.** Repeat until clean.

- [ ] **Step 7: Full suite**

```bash
cd colyseus-server && pnpm test
```

Expected: green, with the two `it.failing` tripwires still reported as expected-failures (see Global Constraints).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(combat)!: damageType + element are required on BATTLE_ATTACK (I-037)"
```

- [ ] **Step 9: Quality gate**

Independent adversarial review. Specific questions for the reviewer: is there any remaining path where a channel can be absent and *not* logged? Did any call site get a value that is wrong rather than merely compiling? Refactor per review, re-run Steps 6-7.

---

### Task 4: A zeroed offence stat can no longer masquerade as damage

Closes the latent path at `src/combat/attackDamage.ts:38`. After F-019 a blade yields `mAtk` of exactly `0`, so a blade user casting a magical skill would deal `0` — no damage rather than wrong-channel damage. **No caller passes `SKILL_MAGICAL` today** (it appears only inside `attackDamage.ts`), so this is a trap being disarmed, not a live bug. See spec §6.

**Files:**
- Modify: `src/combat/attackDamage.ts:33-39`
- Modify: `src/tests/attack-damage.test.ts:83-88`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getSkillDamageForKind(player, kind): SkillDamageResolution` where

```ts
export type SkillDamageResolution =
  | { ok: true; damage: number; damageType: 'physical' | 'magical' }
  | { ok: false; reason: 'no-magical-offence' | 'no-physical-offence' }
```

- [ ] **Step 1: Write the failing tests**

Replace `src/tests/attack-damage.test.ts:83-88` with the block below. **First read the
existing test at `:83` and set `pAtk`/`mAtk` the same way it does** — if they are derived
schema fields rather than plain assignables, direct assignment will not hold and you must
use whatever setup that test already uses.

```ts
  test('getSkillDamageForKind returns the stat and its channel together', () => {
    const p = new Player('s1', 'P', 0, 0)
    p.pAtk = 120
    p.mAtk = 80
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_PHYSICAL)).toEqual({
      ok: true,
      damage: 120,
      damageType: 'physical',
    })
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_MAGICAL)).toEqual({
      ok: true,
      damage: 80,
      damageType: 'magical',
    })
  })

  test('a magical skill with no magical offence is refused, not silently zero', () => {
    // After F-019 a blade yields mAtk of exactly 0 (offence reads one
    // weapon-chosen stat; a blade's physical share rho is 1).
    const p = new Player('s2', 'P', 0, 0)
    p.pAtk = 120
    p.mAtk = 0
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_MAGICAL)).toEqual({
      ok: false,
      reason: 'no-magical-offence',
    })
  })

  test('a physical skill with no physical offence is refused symmetrically', () => {
    const p = new Player('s3', 'P', 0, 0)
    p.pAtk = 0
    p.mAtk = 80
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_PHYSICAL)).toEqual({
      ok: false,
      reason: 'no-physical-offence',
    })
  })
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd colyseus-server && pnpm test -- src/tests/attack-damage.test.ts
```

Expected: FAIL — the function returns a bare `number`, so `toEqual({...})` cannot match.

- [ ] **Step 3: Implement**

`src/combat/attackDamage.ts` — replace `getSkillDamageForKind`:

```ts
/** Outcome of resolving a skill's damage: either a usable number with its channel, or a refusal. */
export type SkillDamageResolution =
  | { ok: true; damage: number; damageType: 'physical' | 'magical' }
  | { ok: false; reason: 'no-magical-offence' | 'no-physical-offence' }

/**
 * Skill damage: physical skills scale with total P.Atk, magical with total M.Atk.
 *
 * Returns a resolution rather than a bare number so a zeroed offence stat cannot
 * masquerade as "0 damage". After F-019 a blade yields mAtk of exactly 0, so a
 * blade user casting a magical skill would otherwise deal no damage, silently.
 *
 * The caller decides the policy (refuse the cast, warn, substitute) — this
 * function only refuses to report a misleading number. The channel travels with
 * the damage so a skill's stat and its damage type cannot drift apart (I-037).
 *
 * Guarded on the stat being zero rather than on weapon class: the zero IS the
 * failure, and testing it directly invents no weapon-class rule, so a hybrid
 * weapon with small non-zero mAtk still works.
 */
export function getSkillDamageForKind(
  player: Player,
  kind: typeof ATTACK_KIND.SKILL_PHYSICAL | typeof ATTACK_KIND.SKILL_MAGICAL
): SkillDamageResolution {
  if (kind === ATTACK_KIND.SKILL_MAGICAL) {
    if (player.mAtk <= 0) return { ok: false, reason: 'no-magical-offence' }
    return { ok: true, damage: player.mAtk, damageType: 'magical' }
  }
  if (player.pAtk <= 0) return { ok: false, reason: 'no-physical-offence' }
  return { ok: true, damage: player.pAtk, damageType: 'physical' }
}
```

- [ ] **Step 4: Run and confirm green**

```bash
cd colyseus-server && pnpm test -- src/tests/attack-damage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Confirm there is still no production caller**

```bash
cd colyseus-server && grep -rn "getSkillDamageForKind" src --include="*.ts" | grep -v "/tests/"
```

Expected: only the definition in `src/combat/attackDamage.ts`. If a caller has appeared, it must now handle `ok: false` — do not paper over it with `.damage`.

- [ ] **Step 6: Full verify and commit**

```bash
cd contracts && pnpm build
cd ../colyseus-server && npx tsc --noEmit && pnpm test
git add -A
git commit -m "feat(combat): getSkillDamageForKind returns a resolution, not a silent zero (I-037)"
```

- [ ] **Step 7: Quality gate**

Independent adversarial review. Refactor per review, re-run Step 6.

---

### Task 5: Gate and ship

- [ ] **Step 1: Full verification from a clean state**

```bash
cd contracts && pnpm build
cd ../colyseus-server && npx tsc --noEmit && pnpm test
```

Record the actual pass/pending counts in the PR body. **A green jest run alone does not prove the build compiles** — both commands must be shown.

- [ ] **Step 2: Gate 1**

```bash
./scripts/precheck.sh
```

Expected: exit 0. Paste the tail of the output into the PR body; do not summarise it as "passed".

- [ ] **Step 3: Confirm the spec's "Done when" list**

Walk spec §10 item by item against real output — not from memory. Specifically confirm the Task 2 Step 2 red was actually observed and is quoted in the PR body; it is the only evidence the defect was real.

- [ ] **Step 4: PR body**

State plainly: which commit is the behaviour change (Task 2 + 3) and which are mechanical churn (Task 1), the observed red-then-green from Task 2, and that `damage-type-routing.test.ts`'s default test was deleted deliberately (spec §8.2) — otherwise it reads as a regression.

- [ ] **Step 5: Ship**

```bash
/ps-release-workflow:ship
```

---

## Out of scope — do not do these here

| left alone | why |
| --- | --- |
| `BattleActionMessage` → discriminated union | **I-041.** It is the `any` hole Task 3 Step 4 guards. Stacking it here makes both diffs unreviewable. |
| Deleting `ProjectileCollisionResolver`'s dead direct-damage branch | **I-042.** Changes `ProjectileManager`'s constructor signature; structural surgery, separate review. |
| `ZoneEffectManager` / `StatusEffectManager` DOTs | Flat final damage by design, carrying neither channel nor element — already documented at both call sites. |
| The 6 `ai-performance.test.ts` tests | `describe.skip` unless `RUN_PERF_TESTS=1`. Deliberately off; unrelated to the `it.failing` tripwires. |
