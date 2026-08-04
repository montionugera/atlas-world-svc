---
title: "Lane B — BATTLE_ATTACK carries no damageType (I-037)"
lane: B
release: "1.6"
date: 2026-07-31
ticket: I-037
status: "idea filed, spec written, needs brainstorm → refine → claim"
parallel_with: "A (nakama CI), and the F-002 bookkeeping decision"
blocks: "Lane C — its assertions read the values this lane re-plumbs"
---

# Lane B — `BATTLE_ATTACK` carries no `damageType`

Self-sufficient. You do not need the other lane docs.

Ticket: `.claude/idea_backlog/I-037-battle-attack-carries-no-damagetype-the/spec.md`

<div class="callout info">

**Nothing here is broken today.** That is why this is a design lane, not a bugfix. Both
the mob and NPC emitters source `damage` from `pAtk`, and the omission is documented as
deliberate at `colyseus-server/src/modules/BattleManager.ts:50`. The work is closing a
trap before it fires, and the trap got sharper when F-019 shipped.

</div>

## The trap

`createAttackMessage` builds the queued-attack payload with **no `damageType`**, so
`BattleModule.processAttack` falls back to `'physical'` for everything arriving that way.
Correct right now because nothing magical uses that path — but `?? 'physical'` cannot
distinguish **"physical on purpose"** from **"channel forgotten"**. The moment a future
emitter sources `mAtk` into that event, the default absorbs it silently.

F-018 Phase 0 (`ac7eff7`) already fixed the sibling defect on the *projectile* path — it
routed `damageType` through so `mDef` stopped being dead code. `BATTLE_ATTACK` was left
out on the grounds that nothing magical used it. That reasoning is still true and still
load-bearing, which is exactly what makes it fragile.

## Why F-019 sharpened it — measured, not speculated

Under the formula shipped in F-019, **a blade yields `mAtk` of exactly `0`** (offence
reads one weapon-chosen stat; a blade's physical share `rho` is 1, so
`mAtk = atk * 2 * (1 - 1) = 0`). Previously every character had `mAtk = 10 + 2*int > 0`
regardless of weapon.

The F-019 audit walked **every** production `mAtk` reader
(`grep -rn "mAtk" colyseus-server/src --include="*.ts"`, excluding tests):

| site | verdict |
| --- | --- |
| `src/combat/attackDamage.ts:70` — `damage = player.mAtk` | **Safe.** Guarded by `isWeaponMagicalPrimary(weapon)` (`weapon.mAtk > weapon.pAtk`), which a blade never satisfies. That guard is the same condition that makes `rho < 0.5`, so it cannot drift out of agreement with the formula. |
| `src/schemas/WorldLife.ts:109,116` — `Math.max(this.pAtk, this.mAtk)` | **Safe.** A max, not a sum, so `mAtk = 0` is absorbed. |
| **`src/combat/attackDamage.ts:38`** — `getSkillDamageForKind` returns `player.mAtk` for `SKILL_MAGICAL` | **Latent zero-damage path.** No weapon guard, so a blade user casting a magical skill deals `0` — not wrong-channel damage, *no* damage. |

**Reachability, checked:** `SKILL_MAGICAL` appears only in `attackDamage.ts` itself
(definition at `:18`, signature at `:36`, use at `:38`). **No caller passes it.** So the
zero-damage path is armed but unreachable — a trap waiting for the skill system, not a
live bug. Do not report it as a live bug; do not leave it undocumented either.

## The decision this lane must make

Two shapes. The choice is about **how loud the failure is**, and it is the actual
deliverable of the brainstorm:

- **Carry the channel explicitly.** Add `damageType` to the `BATTLE_ATTACK` payload the
  way F-018 Phase 0 added it to the projectile path, and have every emitter state it.
  Uniform with the path that already works; a forgotten channel still defaults silently.
- **Make the absence unrepresentable.** Drop the `?? 'physical'` default so an event
  without a channel fails fast. Louder, and it forces the decision at every call site —
  but it turns a currently-harmless omission into a hard failure, so every emitter must be
  audited in the same change.

A third option worth pricing: move `mDef`/`pDef` selection into the projectile stamp (the
way `element` already works) so both branches read one source instead of re-deriving per
branch. I-027's spec raised this and it was never answered.

## The test that does not exist

An emitter sourcing `mAtk` must not produce a physical hit.

**Assert on the channel that reaches `DamageCalculator`, not on the damage number** — a
number can coincide, and with `mAtk = 0` in play a wrong-channel hit and a
correct-but-zero hit are trivially confusable.

## Files

- `colyseus-server/src/modules/BattleManager.ts` — `createAttackMessage` (~`:50`, `:60`)
- `colyseus-server/src/modules/BattleModule.ts` — `processAttack` damageType fallback
- `colyseus-server/src/combat/attackDamage.ts` — `:38` `getSkillDamageForKind`, `:70`
- the mob / NPC emitters that call `createAttackMessage`
- new test under `colyseus-server/src/tests/`

## Done when

- A magical emitter cannot produce a physical hit, proven by a test that **fails against
  the current tree** before the fix — that failure is the evidence the defect is real.
- The `attackDamage.ts:38` zero-damage path is either guarded or explicitly documented as
  intentional with the reason.
- `./scripts/precheck.sh` exits 0.

## Coordination

**Land this before Lane C (I-036).** Lane C's assertions read the damage values this lane
re-plumbs; running them together means C rebases onto a moving target. No file conflict —
a semantic one.

## Shared invariants (repeated so this file stands alone)

1. **Cut your branch, then immediately `git merge release/1.6 --no-edit`.** The claim
   script cuts from `main`; this bit both F-018 and F-019 in 1.5.
2. **A green jest run does not prove the build compiles.** On 2026-07-30 jest reported
   571 passed / 0 failed and the next docker build failed with three errors in a file it
   had just "passed" — ts-jest caches per file. Always `cd contracts && pnpm build`, then
   `cd colyseus-server && npx tsc --noEmit`.
3. **Run Gate 1 before shipping:** `./scripts/precheck.sh`.
4. **All combat/damage logic is centralised in `BattleModule`** — never duplicate it into
   emitters or systems. Emitters hand off to `BattleManager` to *enqueue* damage.
5. **Do not "fix" the 6 pending colyseus tests.** They are `it.failing` characterised
   divergences that turn red when the underlying behaviour is fixed. That is the design.

Use **pnpm**, never npm. Never `git commit --amend`. Brainstorm to a solid spec under
`docs/superpowers/specs/` **before** `refine` — refining an empty skeleton is the exact
mistake that gate exists to prevent.
