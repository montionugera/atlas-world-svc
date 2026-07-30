---
title: "Plan — finish F-018 and land weapon-driven offence stats"
id: F-018
date: 2026-07-30
handoff: docs/superpowers/specs/2026-07-30-combat-model-split-handoff.md
spec: docs/superpowers/specs/2026-07-30-combat-model-split-design.md
supersedes_phase: "Phase 4 of docs/superpowers/plans/2026-07-30-combat-model-split.md"
---

# Finish F-018 + weapon-driven offence stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the already-complete F-018 split into `release/1.5`, then replace the
pinned additive `derivedStats` formula with a multiplicative one whose offence reads a
single primary stat chosen by the equipped weapon (`str` for blades, `dex` for bows,
`int` for casting).

**Architecture:** Two independent parts. **Part 1** (Phases A–B) files the three
outstanding idea tickets and ships F-018 as-is — it touches no formula and is not
blocked on any content decision. **Part 2** (Phases C–F) is the work the handoff calls
"Phase 4": it adds a fifth primary stat (`dex`) to the meta contract, teaches the item
catalog which stat each weapon consumes, rewrites `derivedStats` to be multiplicative so
level cancels out of the attack/defence ratio, and reconciles the three hand-written
copies of the formula. Part 2 needs its own feature claim; Part 1 does not.

**Tech Stack:** TypeScript strict (pnpm workspace), Zod schemas in
`contracts/src/meta/`, Jest + ts-jest, Nakama server-runtime TS in `nakama/src/`,
Colyseus schemas in `colyseus-server/src/schemas/`, one hand-written C# twin in
`game-client/src/UI/MetaIds.cs`, and the browser-based balance model in
`tools/combat-lab/`.

---

## Decisions locked before this plan (do not re-litigate)

| # | decision | source |
| --- | --- | --- |
| **W1** | Weapon power becomes a **multiplicative gear scale** normalised so the **best weapon in the catalog reads 1.0**: `gear = (pAtk + mAtk) / 18`. This matches the lab's existing `gearTiers` convention (`E 0.7 / C 0.85 / A 1.0`, scale ≤ 1). | user, 2026-07-30 |
| **W2** | Offence reads **exactly one** primary stat, chosen by the weapon: bow → `dex`, casting → `int`, sword/dagger/scythe → `str`. | user, 2026-07-30 |
| **W3** | Because of W2 the offence stat share is unambiguously `p / 99` and saturates at `1.0`, matching the lab's `alloc ≤ 1` ceiling exactly. The "divide by 198" question the handoff raises is **dissolved, not answered** — it only existed while offence summed `str + int`. | follows from W2 |
| **W4** | Part 1 ships before Part 2. F-018 goes into `release/1.5` without the `derivedStats` rewrite. | user, 2026-07-30 |
| **D6/D7/D8** | Multiplicative with a single `grow(L)` factor; both defences off `vit` alone; `agi` stays R-invisible and at most one primary may be. | `2026-07-30-combat-model-split-design.md` §11 |

**Assumption stated, not verified with the user:** `dex` becomes a real fifth primary
stat rather than bows reading the existing `agi`. Reading `agi` would need no schema
change, but `agi` already buys move speed and melee cadence, so a bow user would get
those for free — which is precisely the free-ride defect **D7** removes for
`int`/`mDef`. Reverting this assumption means changing `WEAPON_ATK_STAT.great_bow` from
`'dex'` to `'agi'` and dropping Phase C entirely.

## Global Constraints

- **Never `git commit --amend`.** New commit on top, always.
- **Use `pnpm`, not `npm`, for installs.** A fresh worktree needs
  `cd contracts && pnpm build` or 5 suites fail on
  `TS2307: Cannot find module '@atlas/contracts'`.
- **Do not run prettier on `tools/combat-lab/combat-model.json`** — generated, listed in
  `.prettierignore`.
- **Never hand-edit a generated table** in either spec. Edit the model, re-run
  `node scripts/gen_combat_spec.mjs`.
- **`scripts/gen_combat_spec.mjs` embeds a live count of `gate(` + `check(` from
  `tools/combat-lab/verify.mjs` into the spec.** Adding a gate turns the staleness gate
  red until you re-run the generator. That is not table drift — do not triage it as a
  blocker.
- **`.claude/refined_backlog/*/plan.md` is gitignored.** Canonical plans and specs live
  under `docs/superpowers/`; the backlog file is a pointer only.
- **A gate that has never failed is not known to work.** Every new gate gets
  deliberately broken once to prove it bites; revert the break.
- Baseline to protect, re-run at the end of every phase:
  ```bash
  node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs   # expect exit 0
  ```

## Standing quality gate for every phase

A phase is **not done** until all five pass, in order:

1. **Implement** the change.
2. **Verify** — run it, paste the output. No "should work".
3. **Review** — independent adversarial review of *that phase's diff*. Self-review does
   not count.
4. **Refactor** — act on the review while the diff is small.
5. **Re-verify** — confirm the refactor did not break step 2.

---

## File structure

**Part 1** creates no source files. It commits backlog metadata through the `_release`
worktree and merges the existing `feat/F-018` branch.

**Part 2:**

| file | responsibility after this plan |
| --- | --- |
| `contracts/content/items.json` | **modify** — every `kind: "weapon"` entry gains `atkStat: "str" \| "dex" \| "int"`. Single source of truth for which stat a weapon consumes. |
| `contracts/src/meta/types.ts` | **modify** — `PrimaryStats` gains `dex`; `ProfileDoc.schemaVersion` becomes `2`. |
| `contracts/src/meta/schemas.ts` | **modify** — `primaryStatsSchema` gains `dex`; the default profile doc gains `dex: 1` and `schemaVersion: 2`. |
| `contracts/src/meta/catalogs.ts` | **modify** — the `ItemDef` type gains the optional `atkStat` field so `ITEMS_BY_ID` carries it. |
| `contracts/src/meta/derivedStats.ts` | **rewrite** — the multiplicative formula. Sole owner of the maths. |
| `contracts/src/meta/derivedStats.test.ts` | **rewrite** — anchor test + per-weapon tests + level-cancellation test. |
| `contracts/src/meta/weaponStats.ts` | **create** — `weaponGearScale()` and `weaponOffence()`: the catalog→(stat, gear, rho) resolution, separated so both `derivedStats` and the consistency gate import one implementation. |
| `contracts/src/meta/weaponStats.test.ts` | **create** — the five catalog weapons' resolved values. |
| `nakama/src/storage.ts` | **modify** — `CURRENT_SCHEMA_VERSION = 2` plus a real v1→v2 `migrateDoc` case. |
| `nakama/src/storage.test.ts` | **modify/create** — a v1 profile doc must migrate without losing `level`/`xp`/`statPoints`. |
| `nakama/src/rpc/allocateStats.ts` | **modify** — accept and spend `dex`. |
| `colyseus-server/src/meta/applyLoadout.ts` | **modify** — assign `dex`, cache the loadout inputs on the player, delete the "PrimaryStats has no `dex`" surrender comment. |
| `colyseus-server/src/schemas/Player.ts` | **modify** — server-only `metaLevel` / `metaAllocated` cache; `recalculateStats()` delegates to `derivedStats` when the cache is populated. |
| `colyseus-server/src/tests/f018-weapon-offence.test.ts` | **create** — the weapon-switch clobber regression and the consistency gate between the two weapon catalogs. |
| `game-client/src/UI/MetaIds.cs` | **modify** — `MetaFormulas.Derived` ported to the new formula, signature gains `dex`, stale `nakama/src/...` comment path corrected. |

---

# Part 1 — Ship F-018 (no dependency on any weapon decision)

## Phase A: File the three outstanding idea tickets

The handoff names three findings that need tickets. None is filed. Filing needs a commit
on the `_release` worktree, which the `/ps-release-workflow:idea` skill routes for you.

**Files:**
- Create (via skill): `.claude/idea_backlog/I-0NN-*/` for three ideas
- Commits land on `release/1.5` through `.claude/worktrees/_release`

- [ ] **Step A1: File the boss target-rotation ticket**

Run `/ps-release-workflow:idea` with this content:

> **Title:** Boss target rotation / aggro — bosses structurally cannot stop focus-firing
>
> `nearest-opposite-team` target selection plus knockback forms a closed loop: the boss
> picks the nearest player, knockback pushes that player away, the boss chases the
> player it just hit, which keeps that player nearest. The target is never handed to
> anyone else.
>
> The model's boss branch prices a rank as though damage split `n` ways, so at S/SS/SSS
> one player absorbs **8× / 20× / 50×** the intended pressure and dies in `swings`
> swings while the rest of the party is untouched. Measured in
> `colyseus-server/src/tests/f018-*.test.ts` (Phase 5 of F-018).
>
> **No arithmetic fixes this.** It needs an aggro/threat system or multi-target boss
> attacks — a design decision, not a tuning pass. Blocks the boss `n²` branch of the
> balance model from meaning anything.

- [ ] **Step A2: File the pack no-focus-fire ticket**

Run `/ps-release-workflow:idea` with this content:

> **Title:** Pack no-focus-fire, properly tested + a parity test that runs a fight
>
> The F-018 pack test's even damage spread is explained by **lane geometry, not by AI
> declining to converge**: only **1 of 49 swings (2%)** landed while a mob's own
> lane-mate was not already its nearest player. The `>= 0.2` assertion is pinned as an
> *upper* bound and marked `it.failing` deliberately.
>
> Needed: a setup where a clustered party keeps taking damage while every mob can reach
> every player. **Inverting that assertion is the signal the work landed.** Until then
> both `2n/(n+1)` and `n²` are unverified against the sim.
>
> Also needed: the parity test is currently a **per-hit damage probe, not a simulated
> fight** — every number it reports is reproducible in closed form without instantiating
> a room. A real parity test runs a fight to completion and measures TTK and HP
> remaining against `mob(L, rank)`. Its two derived quantities are guarded only by an
> `it.failing`, which passes on **any** throw rather than only the intended divergence.

- [ ] **Step A3: File the `BATTLE_ATTACK` damageType ticket**

Run `/ps-release-workflow:idea` with this content:

> **Title:** `BATTLE_ATTACK` carries no `damageType` — the last silent physical fallback
>
> Correct today: both the mob and NPC emitters source `damage` from `pAtk`, and the
> omission is documented as deliberate at
> `colyseus-server/src/modules/BattleManager.ts:50`. But it is **the one remaining place
> a magical hit could silently become physical** if a future emitter sources `mAtk` into
> that event. The `?? 'physical'` default will not catch it — it cannot distinguish
> "physical on purpose" from "channel forgotten".
>
> Gets sharper after the weapon-driven offence work: under that formula a blade weapon
> yields `mAtk` of **exactly 0**, so an emitter that reads `mAtk` deals zero damage
> rather than wrong-channel damage — a different and quieter failure.

- [ ] **Step A4: Verify the three tickets exist and the release branch has them**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release
git log --oneline -4
ls .claude/idea_backlog/ | tail -6
```

Expected: three new `I-0NN-*` directories, three `chore(backlog)` commits on
`release/1.5`.

- [ ] **Step A5: Cross-check the handoff's ticket ledger**

Confirm the already-known ticket states are still accurate, and correct the handoff if
not:

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release
grep -rl "I-027\|I-032\|I-033\|I-034" .claude/idea_backlog/ .claude/refined_backlog/ | sort
```

Expected: `I-034` filed (race/class, deferred), `I-032` and `I-033` still open, `I-027`
closed by F-018. If any differs, fix the handoff's ledger section in the same commit.

## Phase B: Gate 1 and ship into `release/1.5`

**Files:** none — this phase runs gates and merges.

- [ ] **Step B1: Confirm the F-018 worktree is clean and current**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-018-phase-c-runtime-spine-player-race-class
git status --short
git log --oneline -1
```

Expected: empty status, `HEAD` at the handoff commit. **If `release/1.5` has moved since
Phase A** (it has — Phase A commits to it), merge it in before gating:

```bash
git merge release/1.5 --no-edit
```

- [ ] **Step B2: Re-prove the model baseline**

```bash
node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs; echo "exit=$?"
```

Expected: `exit=0`. If the staleness gate is red, re-run
`node scripts/gen_combat_spec.mjs` — see the Global Constraints note about the embedded
gate count.

- [ ] **Step B3: Re-prove the server suite**

```bash
cd contracts && pnpm build && cd ../colyseus-server && npm test 2>&1 | tail -20
```

Expected: the handoff's baseline — **564 passing / 570 total**, exit 0. The 6
non-passing are the deliberate `it.failing` characterised divergences.

**If the count differs from 564/570, stop.** Either a divergence got fixed (an
`it.failing` turned red — that is good news, but it changes what ships) or something
regressed. Report which, do not adjust the number.

- [ ] **Step B4: Run Gate 1**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-018-phase-c-runtime-spine-player-race-class
bash .claude/ps-release-workflow/precheck.sh; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step B5: Ship**

Run `/ps-release-workflow:ship` from inside the F-018 worktree. It merges `feat/F-018`
into `release/1.5` and marks the catalog shipped.

- [ ] **Step B6: Verify the ship landed**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release
git log --oneline -3
node -e "const c=require('./.claude/refined_backlog/_catalog.json'); const f=Object.values(c).flat?.() ?? c; console.log(JSON.stringify(c, null, 1).split('\n').filter(l=>/F-018|status/.test(l)).join('\n'))"
```

Expected: the merge commit present on `release/1.5`; F-018's catalog entry reads
`shipped`.

- [ ] **Step B7: Remove the feature worktree**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc
git worktree remove .claude/worktrees/F-018-phase-c-runtime-spine-player-race-class
git worktree list
```

Expected: the F-018 worktree gone; `_release` and the unrelated lane worktrees remain.
**Keep the `feat/F-018` branch** — `unclaim`/`ship` conventions in this repo never delete
feature branches.

---

# Part 2 — Weapon-driven offence stats

> **Claim first.** Part 2 is a new feature, not a continuation of F-018 (which is shipped
> by Phase B). Run `/ps-release-workflow:idea` → `/ps-release-workflow:refine` →
> `/ps-release-workflow:claim` to get an `F-NNN` and a fresh worktree, then execute
> Phases C–F inside it. Do not edit the main checkout — the PreToolUse guard blocks it.

## The formula this part lands

Put this in `contracts/src/meta/derivedStats.ts` as the module doc comment, replacing the
existing "do not improve the numbers here" block.

```
grow(L)      = GROWTH^(L-1)                     ONE factor, so it cancels in atk/def
share(p)     = clamp(p, 1, 99) / 99             0.0101 .. 1.0  — matches the lab's alloc

weapon resolves to (atkStat, gear, rho):
  atkStat    = weapon.atkStat                   'str' | 'dex' | 'int'
  gear       = (weapon.pAtk + weapon.mAtk) / 18 0.33 .. 1.0, best-in-catalog = 1.0   [W1]
  rho        = weapon.pAtk / (weapon.pAtk + weapon.mAtk)      physical share
  unarmed    = ('str', UNARMED_GEAR, 1)

offMagnitude = 1 + 2*STAT_COEF*share(allocated[atkStat])      1.01 .. 2.0            [W2]
defMagnitude = 1 + 2*STAT_COEF*share(vit)                     vit alone              [D7]

atk          = BASE_ATK * grow(L) * offMagnitude * gear
def          = BASE_DEF * grow(L) * defMagnitude

maxHealth    = BASE_HP  * grow(L) * defMagnitude
pAtk         = atk * 2 * rho
mAtk         = atk * 2 * (1 - rho)
pDef = mDef  = def                                                                   [D7]
maxMoveSpeed = 20 + 0.2*agi                     UNCHANGED — already level-free        [D8]
```

**Why `maxMoveSpeed` does not move.** D6 exists because level-independent *additive*
constants fail to cancel in the attack/defence ratio. `maxMoveSpeed` appears in neither
side of that ratio, so it already cancels trivially and rewriting it multiplicatively
would invent a constant for no gain. D8 only requires `agi` stay R-invisible, which the
existing form satisfies.

**Why `pAtk + mAtk = 2*atk` always.** The two multipliers sum to exactly 2, so tilting
toward one channel costs the other one-for-one. Total offence is conserved and a
weapon's channel split is pure direction, never a magnitude bonus.

<div class="callout warn">

**Intended behaviour change: a blade yields `mAtk` of exactly 0.** With `rho = 1`,
`mAtk = atk * 2 * 0 = 0`. Today every character has `mAtk = 10 + 2*int > 0` regardless of
weapon. This is the point — magical output should require a magical weapon — but it means
any code path that sources `mAtk` while a blade is equipped now deals **zero** damage
instead of wrong-channel damage. That is the ticket filed in Step A3. Phase E has an
explicit task to hunt those paths.

</div>

### The calibration anchor

The new constants are **solved from an anchor, not chosen**. Anchor: *level 1, every
primary at 1, `basic_sword` equipped* (`DEFAULT_PLAYER_WEAPON_ID`) must reproduce today's
numbers exactly. At that point `grow(1) = 1`, `share(1) = 1/99`,
`offMagnitude = defMagnitude = 100/99`, `gear = 10/18 = 5/9`, `rho = 1`.

| target (today's value) | equation | solved constant |
| --- | --- | --- |
| `maxHealth = 110` | `BASE_HP * 100/99 = 110` | `BASE_HP = 108.9` |
| `pAtk = 22` | `BASE_ATK * (100/99) * (5/9) * 2 = 22` | `BASE_ATK = 19.602` |
| `pDef = 6` | `BASE_DEF * 100/99 = 6` | `BASE_DEF = 5.94` |

`mAtk` at the anchor goes `12 → 0` by design (see the callout). Numbers for every *other*
weapon move, necessarily — that is what "weapons are multiplicative now" means. Do not
try to preserve them.

## Phase C: The contract — `dex` and `atkStat`

**Files:**
- Modify: `contracts/content/items.json`
- Modify: `contracts/src/meta/types.ts:1-14`
- Modify: `contracts/src/meta/schemas.ts:14-31`, `:139-142`
- Modify: `contracts/src/meta/catalogs.ts` (the `ItemDef` type)
- Modify: `nakama/src/storage.ts:29`, `:39-56`
- Modify: `nakama/src/rpc/allocateStats.ts:16-21`, `:39`, `:48-53`
- Create: `contracts/src/meta/weaponStats.ts`, `contracts/src/meta/weaponStats.test.ts`
- Test: `nakama/src/storage.test.ts`

**Interfaces:**
- Produces: `PrimaryStats` with fields `str, agi, int, vit, dex` (all `number`).
- Produces: `type AtkStat = 'str' | 'dex' | 'int'`.
- Produces: `weaponOffence(weaponItemId: string | undefined): { atkStat: AtkStat; gear: number; rho: number }` from `contracts/src/meta/weaponStats.ts`.
- Produces: `GEAR_REFERENCE = 18` and `UNARMED_GEAR = 0.25`, exported from `weaponStats.ts`.
- Consumes: `ITEMS_BY_ID` from `contracts/src/meta/catalogs.ts`.

<div class="callout danger">

**Data-loss hazard — read before touching `storage.ts`.** `migrateDoc`
(`nakama/src/storage.ts:47-56`) reads:

```ts
const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
if (version >= CURRENT_SCHEMA_VERSION) return raw as unknown as CollectionDocs[K];
return defaultDoc(collection);
```

Bumping `CURRENT_SCHEMA_VERSION` to 2 **without** adding a v1→v2 case makes every
existing v1 profile fall through to `defaultDoc` — which **resets `level`, `xp` and
`statPoints` to 1/0/0**. The migration case is mandatory, not a nicety, and Step C5's
test is what proves it.

</div>

- [ ] **Step C1: Write the failing weapon-resolution test**

Create `contracts/src/meta/weaponStats.test.ts`:

```ts
import { weaponOffence, GEAR_REFERENCE, UNARMED_GEAR } from "./weaponStats";

test("GEAR_REFERENCE is the best weapon total in the catalog, so gear tops out at 1", () => {
  expect(GEAR_REFERENCE).toBe(18); // scythe pAtk 18 + mAtk 0
  expect(weaponOffence("scythe").gear).toBeCloseTo(1, 10);
});

test.each([
  ["basic_sword", "str", 10 / 18, 1],
  ["dagger", "str", 6 / 18, 1],
  ["scythe", "str", 18 / 18, 1],
  ["great_bow", "dex", 16 / 18, 1],
  ["magic_staff", "int", 17 / 18, 2 / 17],
])("%s resolves to (%s, gear, rho)", (id, atkStat, gear, rho) => {
  const r = weaponOffence(id as string);
  expect(r.atkStat).toBe(atkStat);
  expect(r.gear).toBeCloseTo(gear as number, 10);
  expect(r.rho).toBeCloseTo(rho as number, 10);
});

test("unarmed is str, fully physical, and strictly worse than the worst weapon", () => {
  const bare = weaponOffence(undefined);
  expect(bare).toEqual({ atkStat: "str", gear: UNARMED_GEAR, rho: 1 });
  expect(bare.gear).toBeLessThan(weaponOffence("dagger").gear);
});

test("an unknown weapon id resolves as unarmed rather than throwing", () => {
  expect(weaponOffence("not_a_real_item")).toEqual(weaponOffence(undefined));
});

test("a non-weapon item resolves as unarmed", () => {
  expect(weaponOffence("leather_armor")).toEqual(weaponOffence(undefined));
});
```

- [ ] **Step C2: Run it to confirm it fails**

```bash
cd contracts && npx jest src/meta/weaponStats.test.ts 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './weaponStats'`.

- [ ] **Step C3: Add `atkStat` to the catalog and write `weaponStats.ts`**

In `contracts/content/items.json`, add `atkStat` to each of the five weapons. The values
come from the `projectileType` already recorded in
`colyseus-server/src/config/combat/weapons.ts` — `MELEE`/`SMALL_MELEE`/`LARGE_MELEE` →
`str`, `ARROW` → `dex`, `MAGIC_SPEAR` → `int`:

| id | `projectileType` | `atkStat` |
| --- | --- | --- |
| `basic_sword` | `MELEE` | `"str"` |
| `dagger` | `SMALL_MELEE` | `"str"` |
| `scythe` | `LARGE_MELEE` | `"str"` |
| `great_bow` | `ARROW` | `"dex"` |
| `magic_staff` | `MAGIC_SPEAR` | `"int"` |

Add `atkStat?: AtkStat` to the `ItemDef` type in `contracts/src/meta/catalogs.ts` so
`ITEMS_BY_ID` carries it. It is optional because non-weapon items have none.

Create `contracts/src/meta/weaponStats.ts`:

```ts
import { ITEMS_BY_ID } from "./catalogs";

export type AtkStat = "str" | "dex" | "int";

/**
 * The highest `pAtk + mAtk` in the catalog. Weapon power is a multiplicative
 * gear scale normalised so the best weapon reads exactly 1.0, matching the
 * combat lab's `gearTiers` convention (E 0.7 / C 0.85 / A 1.0, scale <= 1).
 * Raise this when a stronger weapon ships, or every weapon silently inflates.
 */
export const GEAR_REFERENCE = 18;

/** Bare hands. Below the dagger's 6/18 = 0.333 so any weapon beats none. */
export const UNARMED_GEAR = 0.25;

export interface WeaponOffence {
  /** Which single primary stat this weapon's damage reads. */
  atkStat: AtkStat;
  /** Multiplicative magnitude, 0 < gear <= 1. */
  gear: number;
  /** Physical share of output. 1 = fully physical, 0 = fully magical. */
  rho: number;
}

const UNARMED: WeaponOffence = {
  atkStat: "str",
  gear: UNARMED_GEAR,
  rho: 1,
};

/**
 * Resolves an equipped weapon id to the three things the damage formula needs.
 * Magnitude comes from the weapon's total power; direction comes from how that
 * total splits across the two channels; the stat is declared in the catalog.
 * Anything that is not a weapon in the catalog resolves as unarmed — a missing
 * or unknown id is a normal state (no weapon equipped), not an error.
 */
export function weaponOffence(weaponItemId: string | undefined): WeaponOffence {
  const item = weaponItemId ? ITEMS_BY_ID[weaponItemId] : undefined;
  if (!item || item.kind !== "weapon" || !item.atkStat) return UNARMED;

  const total = (item.pAtk ?? 0) + (item.mAtk ?? 0);
  if (total <= 0) return { ...UNARMED, atkStat: item.atkStat };

  return {
    atkStat: item.atkStat,
    gear: total / GEAR_REFERENCE,
    rho: (item.pAtk ?? 0) / total,
  };
}
```

- [ ] **Step C4: Run it to confirm it passes**

```bash
cd contracts && npx jest src/meta/weaponStats.test.ts 2>&1 | tail -8
```

Expected: PASS, 5 tests.

- [ ] **Step C5: Write the failing migration test**

Add to `nakama/src/storage.test.ts` (create it following whichever existing
`nakama/src/*.test.ts` sets up the `nk` mock — `grantXp.test.ts` has the pattern):

```ts
test("a v1 profile migrates to v2 with dex 1 and keeps level, xp and statPoints", () => {
  const v1 = {
    schemaVersion: 1,
    level: 27,
    xp: 4310,
    statPoints: 9,
    allocated: { str: 40, agi: 12, int: 3, vit: 25 },
  };
  const nk = mockNkWithProfile(v1); // returns v1 from storageRead
  const { doc } = readDoc(nk, "user-1", COLLECTIONS.profile);

  expect(doc.schemaVersion).toBe(2);
  expect(doc.level).toBe(27); // NOT reset to 1
  expect(doc.xp).toBe(4310);
  expect(doc.statPoints).toBe(9);
  expect(doc.allocated).toEqual({ str: 40, agi: 12, int: 3, vit: 25, dex: 1 });
});

test("a doc with no schemaVersion is still reset to the default, not migrated", () => {
  const nk = mockNkWithProfile({ level: 99, xp: 1 } as never);
  const { doc } = readDoc(nk, "user-1", COLLECTIONS.profile);
  expect(doc.level).toBe(1);
  expect(doc.allocated.dex).toBe(1);
});
```

- [ ] **Step C6: Run it to confirm it fails**

```bash
cd nakama && npx jest src/storage.test.ts 2>&1 | tail -15
```

Expected: FAIL — `doc.schemaVersion` is `1`, `doc.allocated.dex` is `undefined`.

- [ ] **Step C7: Land `dex`, schema v2, and the migration**

`contracts/src/meta/types.ts`:

```ts
export interface PrimaryStats {
  str: number;
  agi: number;
  int: number;
  vit: number;
  /** Ranged/precision offence. Bows read this instead of str — see weaponStats.ts. */
  dex: number;
}

export interface ProfileDoc {
  schemaVersion: 2;
  level: number;
  xp: number;
  statPoints: number;
  allocated: PrimaryStats;
}
```

`contracts/src/meta/schemas.ts` — add `dex: z.number()` to `primaryStatsSchema` beside
`vit`, and update the default factory:

```ts
  [COLLECTIONS.profile]: () => ({
    schemaVersion: 2 as const,
    level: 1,
    xp: 0,
    statPoints: 0,
    allocated: { str: 1, agi: 1, int: 1, vit: 1, dex: 1 },
  }),
```

`nakama/src/storage.ts` — bump the constant and add the real case:

```ts
/** v2 added `dex` to PrimaryStats (weapon-driven offence stats). */
const CURRENT_SCHEMA_VERSION = 2;

function migrateDoc<K extends CollectionKey>(
  collection: K,
  raw: Record<string, unknown>,
): CollectionDocs[K] {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version >= CURRENT_SCHEMA_VERSION) {
    return raw as unknown as CollectionDocs[K];
  }
  // v1 -> v2: only `profile` changed shape; every other collection's v1 doc is
  // already a valid v2 doc. Falling through to defaultDoc here would DISCARD
  // level/xp/statPoints, so each surviving version needs its own case.
  if (version === 1) {
    if (collection === COLLECTIONS.profile) {
      const p = raw as unknown as Omit<ProfileDoc, 'schemaVersion' | 'allocated'> & {
        allocated: Omit<PrimaryStats, 'dex'>;
      };
      return {
        ...p,
        schemaVersion: 2,
        allocated: { ...p.allocated, dex: 1 },
      } as unknown as CollectionDocs[K];
    }
    return { ...raw, schemaVersion: 2 } as unknown as CollectionDocs[K];
  }
  return defaultDoc(collection);
}
```

`nakama/src/rpc/allocateStats.ts` — `dex` in all four places: the destructure and the
validation loop (`:16-17`), the `return` cast (`:21`), the `spent` sum (`:39`), and the
merge (`:48-53`).

- [ ] **Step C8: Run the tests to confirm they pass**

```bash
cd contracts && pnpm build && npx jest 2>&1 | tail -10
cd ../nakama && npx jest 2>&1 | tail -10
```

Expected: both PASS. `contracts`' `derivedStats.test.ts` will now **fail to
type-check or fail its assertions** because its `allocated` literals lack `dex` — that is
expected and Phase D fixes it. If `pnpm build` fails on those, add `dex: 1` to the four
literals in `derivedStats.test.ts` now and leave the numeric expectations alone.

- [ ] **Step C9: Prove the migration guard bites**

Temporarily delete the `if (version === 1)` block, re-run the migration test, and paste
the failure showing `level` reset to `1`. Then restore it. A migration that has never
been seen to fail is not known to work.

- [ ] **Step C10: Commit**

```bash
git add contracts/content/items.json contracts/src/meta nakama/src/storage.ts nakama/src/storage.test.ts nakama/src/rpc/allocateStats.ts
git commit -m "feat(meta): add dex primary stat and weapon atkStat, profile schema v2"
```

## Phase D: Rewrite `derivedStats`

**Files:**
- Modify: `contracts/src/meta/derivedStats.ts` (whole body + doc comment)
- Modify: `contracts/src/meta/derivedStats.test.ts` (rewrite)

**Interfaces:**
- Consumes: `weaponOffence`, `AtkStat` from Phase C.
- Produces: `derivedStats(input: DerivedStatsInput): DerivedStats` — same signature and
  same six output field names as today. `DerivedStatsInput` is unchanged
  (`{ level, allocated, weaponItemId? }`); only `allocated` gained `dex`.
- Produces: exported constants `GROWTH = 1.045`, `STAT_COEF = 0.5`, `STAT_MAX = 99`,
  `BASE_HP = 108.9`, `BASE_ATK = 19.602`, `BASE_DEF = 5.94` — Phase F's parity gate
  imports these rather than re-declaring them.

- [ ] **Step D1: Write the failing anchor test**

Replace `contracts/src/meta/derivedStats.test.ts` wholesale:

```ts
import { derivedStats } from "./derivedStats";

const ONES = { str: 1, agi: 1, int: 1, vit: 1, dex: 1 };

test("ANCHOR: level 1, all primaries 1, basic_sword reproduces the pre-F018 numbers", () => {
  const r = derivedStats({ level: 1, allocated: ONES, weaponItemId: "basic_sword" });
  expect(r.maxHealth).toBeCloseTo(110, 6); // was 100 + 10*1 + 5*0
  expect(r.pAtk).toBeCloseTo(22, 6); //      was 10 + 2*1 + 10
  expect(r.pDef).toBeCloseTo(6, 6); //       was 5 + 1
  expect(r.mDef).toBeCloseTo(6, 6); //       D7: mDef == pDef now
  expect(r.maxMoveSpeed).toBeCloseTo(20.2, 6); // unchanged formula
  // INTENDED CHANGE: a blade yields no magical output at all (was 12).
  expect(r.mAtk).toBe(0);
});

test("D6: the attack/defence ratio is level-independent", () => {
  const at = (level: number) =>
    derivedStats({ level, allocated: ONES, weaponItemId: "basic_sword" });
  const ratio = (level: number) => at(level).pAtk / at(level).pDef;
  expect(ratio(50)).toBeCloseTo(ratio(1), 9);
  expect(ratio(99)).toBeCloseTo(ratio(1), 9);
  // and it is not level-independent by being constant — magnitudes do grow
  expect(at(99).pAtk).toBeGreaterThan(at(1).pAtk * 50);
});

test("D7: both defences come off vit alone, so int buys no free mDef", () => {
  const base = derivedStats({ level: 20, allocated: ONES });
  const smart = derivedStats({ level: 20, allocated: { ...ONES, int: 99 } });
  expect(smart.mDef).toBeCloseTo(base.mDef, 9);
  expect(smart.pDef).toBeCloseTo(base.pDef, 9);

  const tanky = derivedStats({ level: 20, allocated: { ...ONES, vit: 99 } });
  expect(tanky.mDef).toBeGreaterThan(base.mDef);
  expect(tanky.pDef).toBeCloseTo(tanky.mDef, 9);
});

test("W2: each weapon reads its own stat and ignores the others", () => {
  const L = 20;
  const bow = (a: typeof ONES) =>
    derivedStats({ level: L, allocated: a, weaponItemId: "great_bow" }).pAtk;
  expect(bow({ ...ONES, dex: 99 })).toBeGreaterThan(bow(ONES));
  expect(bow({ ...ONES, str: 99 })).toBeCloseTo(bow(ONES), 9);

  const staff = (a: typeof ONES) =>
    derivedStats({ level: L, allocated: a, weaponItemId: "magic_staff" }).mAtk;
  expect(staff({ ...ONES, int: 99 })).toBeGreaterThan(staff(ONES));
  expect(staff({ ...ONES, str: 99 })).toBeCloseTo(staff(ONES), 9);
});

test("W3: the offence multiplier saturates at exactly 2 at the stat cap", () => {
  const L = 1;
  const capped = derivedStats({
    level: L,
    allocated: { ...ONES, str: 99 },
    weaponItemId: "scythe", // gear exactly 1.0
  });
  // atk = BASE_ATK * 1 * 2.0 * 1.0 ; pAtk = atk * 2 * rho(=1)
  expect(capped.pAtk).toBeCloseTo(19.602 * 2 * 2, 6);
  // over-cap allocation is clamped, not extrapolated
  const over = derivedStats({
    level: L,
    allocated: { ...ONES, str: 500 },
    weaponItemId: "scythe",
  });
  expect(over.pAtk).toBeCloseTo(capped.pAtk, 9);
});

test("total offence is conserved: pAtk + mAtk is channel-split-independent", () => {
  const L = 30;
  const a = { ...ONES, str: 50, int: 50, dex: 50 };
  const sword = derivedStats({ level: L, allocated: a, weaponItemId: "basic_sword" });
  const scythe = derivedStats({ level: L, allocated: a, weaponItemId: "scythe" });
  // same stat, same rho, different gear -> totals differ ONLY by the gear ratio
  expect((sword.pAtk + sword.mAtk) / (scythe.pAtk + scythe.mAtk)).toBeCloseTo(10 / 18, 9);
});

test("magic_staff splits its output by the catalog's channel ratio", () => {
  const r = derivedStats({ level: 1, allocated: ONES, weaponItemId: "magic_staff" });
  expect(r.pAtk / (r.pAtk + r.mAtk)).toBeCloseTo(2 / 17, 9);
  expect(r.mAtk).toBeGreaterThan(r.pAtk);
});

test("unarmed is weaker than the worst weapon but not zero", () => {
  const bare = derivedStats({ level: 10, allocated: ONES });
  const knife = derivedStats({ level: 10, allocated: ONES, weaponItemId: "dagger" });
  expect(bare.pAtk).toBeGreaterThan(0);
  expect(bare.pAtk).toBeLessThan(knife.pAtk);
});

test("an unknown weaponItemId is treated as unarmed, not as an error", () => {
  const bad = derivedStats({ level: 10, allocated: ONES, weaponItemId: "nope" });
  expect(bad).toEqual(derivedStats({ level: 10, allocated: ONES }));
});
```

- [ ] **Step D2: Run it to confirm it fails**

```bash
cd contracts && npx jest src/meta/derivedStats.test.ts 2>&1 | tail -25
```

Expected: FAIL on the anchor (`mAtk` is `12`, not `0`) and on D6 (the ratio drifts with
level) and on D7 (`mDef` tracks `int`). Those three failures are the evidence the three
defects are real.

- [ ] **Step D3: Rewrite the implementation**

Replace `contracts/src/meta/derivedStats.ts` from the `import` line down:

```ts
import type { PrimaryStats } from "./types";
import { weaponOffence } from "./weaponStats";

export interface DerivedStatsInput {
  level: number;
  allocated: PrimaryStats;
  weaponItemId?: string;
}

export interface DerivedStats {
  maxHealth: number;
  pAtk: number;
  mAtk: number;
  pDef: number;
  mDef: number;
  maxMoveSpeed: number;
}

/** Per-level growth. Mirrors `P.growth` in tools/combat-lab. */
export const GROWTH = 1.045;
/** Stat coefficient C. Mirrors `P.statCoef` in tools/combat-lab. */
export const STAT_COEF = 0.5;
/** PRIMARY_MAX in colyseus-server/src/config/combat/combatStats.ts. */
export const STAT_MAX = 99;

// Solved from the anchor, NOT chosen: at level 1 with every primary at 1 and
// basic_sword equipped (DEFAULT_PLAYER_WEAPON_ID), this formula must reproduce
// the pre-F018 numbers exactly -- maxHealth 110, pAtk 22, pDef 6.
export const BASE_HP = 108.9; // 110 * 99/100
export const BASE_ATK = 19.602; // 22 * 891/1000
export const BASE_DEF = 5.94; // 6 * 99/100

/**
 * Single source of truth for derived combat stats. Multiplicative by design:
 * `grow(level)` enters `atk`, `def` and `maxHealth` as exactly ONE factor, so it
 * cancels out of the attack/defence ratio and difficulty stops drifting with
 * level. That cancellation is what the old additive constants (100, 10, 5, and
 * the flat weapon addend) broke, and it is the whole reason for this shape.
 *
 *   share(p)     = clamp(p, 1, 99) / 99          saturates at 1, like the lab's alloc
 *   offMagnitude = 1 + 2*C*share(allocated[weapon.atkStat])   ONE stat, chosen by weapon
 *   defMagnitude = 1 + 2*C*share(vit)            vit alone, so int buys no free mDef
 *
 *   atk = BASE_ATK * grow(L) * offMagnitude * weapon.gear
 *   def = BASE_DEF * grow(L) * defMagnitude
 *
 *   maxHealth   = BASE_HP * grow(L) * defMagnitude
 *   pAtk        = atk * 2 * rho          rho + (1-rho) sums to 1, so the two
 *   mAtk        = atk * 2 * (1 - rho)    multipliers sum to 2 and total offence
 *   pDef = mDef = def                    is conserved across any channel split
 *
 * `maxMoveSpeed` keeps its additive form on purpose: it appears on neither side
 * of the attack/defence ratio, so it already cancels, and rewriting it would
 * invent a constant for no gain.
 *
 * Tune the exported constants above, never the shape. `tools/combat-lab` owns
 * the shape and gates it.
 */
export function derivedStats({
  level,
  allocated,
  weaponItemId,
}: DerivedStatsInput): DerivedStats {
  const { agi, vit } = allocated;
  const weapon = weaponOffence(weaponItemId);

  const grow = Math.pow(GROWTH, level - 1);
  const share = (p: number) =>
    Math.min(STAT_MAX, Math.max(1, p)) / STAT_MAX;

  const offMagnitude = 1 + 2 * STAT_COEF * share(allocated[weapon.atkStat]);
  const defMagnitude = 1 + 2 * STAT_COEF * share(vit);

  const atk = BASE_ATK * grow * offMagnitude * weapon.gear;
  const def = BASE_DEF * grow * defMagnitude;

  return {
    maxHealth: BASE_HP * grow * defMagnitude,
    pAtk: atk * 2 * weapon.rho,
    mAtk: atk * 2 * (1 - weapon.rho),
    pDef: def,
    mDef: def,
    maxMoveSpeed: 20 + 0.2 * agi,
  };
}
```

- [ ] **Step D4: Run the tests to confirm they pass**

```bash
cd contracts && npx jest src/meta/derivedStats.test.ts 2>&1 | tail -12
```

Expected: PASS, 9 tests. If the anchor is off in the 6th decimal, **do not adjust the
expectation** — re-derive the constant from the anchor equation in the table above and
fix the constant.

- [ ] **Step D5: Run the whole contracts suite and build**

```bash
cd contracts && pnpm build && npx jest 2>&1 | tail -10
```

Expected: PASS. `schemas.test.ts` may need `dex` added to profile fixtures.

- [ ] **Step D6: Commit**

```bash
git add contracts/src/meta/derivedStats.ts contracts/src/meta/derivedStats.test.ts
git commit -m "feat(meta): make derivedStats multiplicative with weapon-driven offence stat"
```

## Phase E: Reconcile the three other copies

**Files:**
- Modify: `colyseus-server/src/meta/applyLoadout.ts:8-31`
- Modify: `colyseus-server/src/schemas/Player.ts:64-107`
- Modify: `game-client/src/UI/MetaIds.cs:107-129`
- Create: `colyseus-server/src/tests/f018-weapon-offence.test.ts`

**Interfaces:**
- Consumes: `derivedStats`, `weaponOffence` and the exported constants from Phases C–D.
- Produces: `Player.metaLevel: number` and `Player.metaAllocated: PrimaryStats | null` —
  server-only (no `@type` decorator, never Colyseus-synced), set by `applyLoadout`.
- Produces: `Player.recalculateStats()` delegating to `derivedStats` when
  `metaAllocated` is non-null, keeping its existing `PLAYER_STATS` behaviour otherwise.

**Why the cache, not a schema field.** `Player` carries no `level` and its `BaseStat` has
no `int` — that absence is the actual reason `recalculateStats()`
(`Player.ts:87-107`) diverges from `derivedStats` at all (this is I-032). Adding
`level`/`int` as `@type` fields would change the synced schema and the generated C#
models. Server-only cache fields fix the divergence without touching sync, which is the
right-sized fix here; full I-032 dedup stays out of scope.

- [ ] **Step E1: Write the failing clobber test**

Create `colyseus-server/src/tests/f018-weapon-offence.test.ts`:

```ts
import { derivedStats } from '@atlas/contracts'
import { Player } from '../schemas/Player'
import { applyLoadout } from '../meta/applyLoadout'

const SNAP = {
  profile: {
    schemaVersion: 2 as const,
    level: 30,
    xp: 0,
    statPoints: 0,
    allocated: { str: 60, agi: 10, int: 5, vit: 40, dex: 5 },
  },
  equippedItemIds: { weapon: 'basic_sword' },
} as never

test('switching weapons re-derives from the loadout instead of clobbering to PLAYER_STATS', () => {
  const player = new Player()
  applyLoadout(player, SNAP)
  const afterJoin = player.pAtk
  expect(afterJoin).toBeCloseTo(
    derivedStats({
      level: 30,
      allocated: SNAP.profile.allocated,
      weaponItemId: 'basic_sword',
    }).pAtk,
    6,
  )

  player.equipWeapon('scythe')

  // scythe: same str, gear 18/18 vs sword's 10/18 -> strictly stronger.
  // The bug this pins: recalculateStats used to reset pAtk to the flat
  // PLAYER_STATS.pAtk (25) + weapon addend, discarding level and allocation.
  expect(player.pAtk).toBeCloseTo(
    derivedStats({
      level: 30,
      allocated: SNAP.profile.allocated,
      weaponItemId: 'scythe',
    }).pAtk,
    6,
  )
  expect(player.pAtk).toBeGreaterThan(afterJoin)
})

test('a bow reads dex, so a str build gains nothing by equipping one', () => {
  const player = new Player()
  applyLoadout(player, SNAP)
  player.equipWeapon('great_bow')
  const strBuildWithBow = player.pAtk

  const dexSnap = {
    ...SNAP,
    profile: {
      ...SNAP.profile,
      allocated: { ...SNAP.profile.allocated, str: 5, dex: 60 },
    },
  } as never
  const archer = new Player()
  applyLoadout(archer, dexSnap)
  archer.equipWeapon('great_bow')

  expect(archer.pAtk).toBeGreaterThan(strBuildWithBow)
})

test('an ephemeral player with no loadout still gets usable stats', () => {
  const player = new Player()
  player.equipWeapon('basic_sword')
  expect(player.pAtk).toBeGreaterThan(0)
  expect(Number.isFinite(player.pAtk)).toBe(true)
})

test('the two weapon catalogs agree on which stat each weapon reads', () => {
  // colyseus WEAPONS carries projectileType; contracts items.json carries
  // atkStat. Nothing dedups them (I-032), so gate them instead.
  const { WEAPONS } = require('../config/combat/weapons')
  const { WEAPON_TYPES } = require('../config/combat/projectileInteractions')
  const { weaponOffence } = require('@atlas/contracts')

  const EXPECTED_BY_TYPE: Record<string, string> = {
    [WEAPON_TYPES.MELEE]: 'str',
    [WEAPON_TYPES.SMALL_MELEE]: 'str',
    [WEAPON_TYPES.LARGE_MELEE]: 'str',
    [WEAPON_TYPES.ARROW]: 'dex',
    [WEAPON_TYPES.MAGIC_SPEAR]: 'int',
  }

  for (const [id, w] of Object.entries(WEAPONS) as [string, never][]) {
    const type = (w as { projectileType: string }).projectileType
    expect(EXPECTED_BY_TYPE[type]).toBeDefined() // a new weapon type needs a mapping
    expect(weaponOffence(id).atkStat).toBe(EXPECTED_BY_TYPE[type])
    // and the two catalogs must not disagree on power either
    const item = (w as { pAtk: number; mAtk: number })
    expect(weaponOffence(id).gear).toBeCloseTo((item.pAtk + item.mAtk) / 18, 9)
  }
})
```

- [ ] **Step E2: Run it to confirm it fails**

```bash
cd contracts && pnpm build && cd ../colyseus-server
npm test -- src/tests/f018-weapon-offence.test.ts 2>&1 | tail -25
```

Expected: FAIL — after `equipWeapon`, `player.pAtk` is `PLAYER_STATS.pAtk + weapon.pAtk`
(`25 + 18`), not the derived value. Also expect `weaponOffence` to be missing from the
`@atlas/contracts` export surface until Step E3 adds it.

- [ ] **Step E3: Export `weaponOffence` from contracts and cache the loadout on Player**

Add `weaponOffence`, `AtkStat`, `GEAR_REFERENCE`, `UNARMED_GEAR` to `contracts`' public
barrel (whichever `index.ts` re-exports `derivedStats`).

In `colyseus-server/src/schemas/Player.ts`, beside the existing server-only fields at
`:64-71`:

```ts
  /** Server-only; not Colyseus-synced. Loadout inputs cached so recalculateStats
   *  can re-derive from @atlas/contracts instead of resetting to PLAYER_STATS.
   *  Null until applyLoadout runs (ephemeral join, or a bot). */
  metaLevel: number = 0
  metaAllocated: PrimaryStats | null = null
```

Rewrite `recalculateStats()` (`:87-107`), keeping the melee-timing tail untouched:

```ts
  recalculateStats() {
    if (this.metaAllocated) {
      const stats = derivedStats({
        level: this.metaLevel,
        allocated: this.metaAllocated,
        weaponItemId: this.equippedWeaponId || undefined,
      })
      this.pAtk = stats.pAtk
      this.mAtk = stats.mAtk
      this.pDef = stats.pDef
      this.mDef = stats.mDef
      this.maxHealth = stats.maxHealth
    } else {
      // Ephemeral / bot player: no loadout was ever fetched, so there is
      // nothing to derive from. Keep the config defaults plus the weapon.
      let wPAtk = 0
      let wMAtk = 0
      const weapon = this.equippedWeaponId ? WEAPONS[this.equippedWeaponId] : undefined
      if (weapon) {
        wPAtk = weapon.pAtk || 0
        wMAtk = weapon.mAtk || 0
      }
      this.pAtk = PLAYER_STATS.pAtk + wPAtk
      this.mAtk = PLAYER_STATS.mAtk + wMAtk
    }

    this.stat.agi = clampPrimaryStat(PLAYER_STATS.baseStat.agi + this.agiFromEquipment)

    const meleeTiming = resolvePlayerMeleeAttackTiming(this)
    if (meleeTiming) {
      this.attackDelay = meleeTiming.attackDelayMs
    } else {
      this.attackDelay = PLAYER_STATS.atkWindUpTime + PLAYER_STATS.atkWindDownTime
    }
  }
```

**Do not carry `currentHealth` here.** `applyLoadout` sets `currentHealth = maxHealth` on
join deliberately; re-deriving `maxHealth` on a weapon switch must not also heal the
player. If `maxHealth` rises mid-fight, leave `currentHealth` alone.

In `colyseus-server/src/meta/applyLoadout.ts`, populate the cache and assign `dex`,
deleting the "PrimaryStats has no `dex` field" comment at `:26-27`:

```ts
  player.metaLevel = snap.profile.level
  player.metaAllocated = { ...snap.profile.allocated }

  player.stat.agi = clampPrimaryStat(snap.profile.allocated.agi)
  player.stat.str = clampPrimaryStat(snap.profile.allocated.str)
  player.stat.vit = clampPrimaryStat(snap.profile.allocated.vit)
  player.stat.dex = clampPrimaryStat(snap.profile.allocated.dex)
```

- [ ] **Step E4: Run the tests to confirm they pass**

```bash
cd colyseus-server && npm test -- src/tests/f018-weapon-offence.test.ts 2>&1 | tail -12
```

Expected: PASS, 4 tests.

- [ ] **Step E5: Hunt the `mAtk === 0` consequences**

A blade now yields `mAtk` of exactly `0`. Find every path that reads `mAtk` and confirm
none of them silently produces a zero-damage hit:

```bash
cd colyseus-server && grep -rn "mAtk" src --include="*.ts" | grep -v "\.test\.ts"
```

For each hit, record in the commit message whether it is guarded, unreachable with a
blade, or a real zero-damage path. **Any real zero-damage path is a finding to report,
not a thing to patch in this phase** — it belongs to the Step A3 ticket.

- [ ] **Step E6: Port the C# twin**

`game-client/src/UI/MetaIds.cs:107-129`. The signature gains `dex`; the stale
`nakama/src/...` path in the doc comment is wrong (no such file) and becomes
`contracts/src/meta/derivedStats.ts`. Keep it a faithful port — the Loadout screen must
not show stats the server disagrees with.

```csharp
        /// <summary>
        /// Derived combat stats — C# port of contracts/src/meta/derivedStats.ts.
        /// Multiplicative: grow(level) enters atk/def/hp as exactly one factor so
        /// it cancels in the attack/defence ratio. Offence reads ONE primary stat,
        /// chosen by the equipped weapon's AtkStat. There is no codegen between
        /// this and the TypeScript original — change both together.
        /// </summary>
        public static class MetaFormulas
        {
            const double Growth = 1.045, StatCoef = 0.5, StatMax = 99;
            const double BaseHp = 108.9, BaseAtk = 19.602, BaseDef = 5.94;
            const double GearReference = 18, UnarmedGear = 0.25;

            static double Share(double p) => Math.Min(StatMax, Math.Max(1, p)) / StatMax;

            public static (double maxHealth, double pAtk, double mAtk, double pDef, double mDef, double maxMoveSpeed)
                Derived(int level, double str, double agi, double @int, double vit, double dex, string? weaponItemId)
            {
                double gear = UnarmedGear, rho = 1;
                double offStat = str;
                if (weaponItemId != null && Catalog.ItemsById.TryGetValue(weaponItemId, out ItemDef? w)
                    && w.AtkStat != null)
                {
                    double total = w.PAtk + w.MAtk;
                    if (total > 0) { gear = total / GearReference; rho = w.PAtk / total; }
                    offStat = w.AtkStat switch { "dex" => dex, "int" => @int, _ => str };
                }

                double grow = Math.Pow(Growth, level - 1);
                double offMagnitude = 1 + 2 * StatCoef * Share(offStat);
                double defMagnitude = 1 + 2 * StatCoef * Share(vit);

                double atk = BaseAtk * grow * offMagnitude * gear;
                double def = BaseDef * grow * defMagnitude;

                return (
                    maxHealth: BaseHp * grow * defMagnitude,
                    pAtk: atk * 2 * rho,
                    mAtk: atk * 2 * (1 - rho),
                    pDef: def,
                    mDef: def,
                    maxMoveSpeed: 20 + 0.2 * agi);
            }
        }
```

`ItemDef` in the C# catalog needs an `AtkStat` field, and the C# `items.json` copy at
`colyseus-server/generated/csharp/Runtime/Content/items.json` needs the same `atkStat`
values as Phase C added to `contracts/content/items.json`.

**Note the return type changed from `int` to `double` for the four integer fields.** The
old port truncated with `(int)` casts; the new formula produces fractional values and
truncating them would make the readout disagree with the server. Fix any call site the
compiler flags.

- [ ] **Step E7: Verify the port by hand against the anchor**

There is no C# test harness wired up in this repo, so verify by table. Compute
`Derived(1, 1, 1, 1, 1, 1, "basic_sword")` and confirm it matches the TS anchor:
`maxHealth 110`, `pAtk 22`, `mAtk 0`, `pDef 6`, `mDef 6`, `maxMoveSpeed 20.2`. Paste both
sides. **If no C# build is available in this environment, say so explicitly and mark the
port unverified** — do not claim it works.

- [ ] **Step E8: Run the full server suite**

```bash
cd contracts && pnpm build && cd ../colyseus-server && npm test 2>&1 | tail -20
```

Expected: no new failures beyond the known `it.failing` divergences. **The parity test
from F-018's Phase 5 may now move** — it compares model output against sim damage, and
`pAtk` just changed for every weapon. If it flips, that is a finding to record, not a
number to tune.

- [ ] **Step E9: Commit**

```bash
git add colyseus-server/src/meta/applyLoadout.ts colyseus-server/src/schemas/Player.ts \
        colyseus-server/src/tests/f018-weapon-offence.test.ts \
        game-client/src/UI/MetaIds.cs \
        colyseus-server/generated/csharp/Runtime/Content/items.json
git commit -m "feat(meta): reconcile all three derivedStats copies on the weapon-driven formula"
```

## Phase F: Gate the ceiling against the lab

Without this, nothing stops the game's magnitude ceiling from drifting away from the
model that solved the rank ladder. This is what W3 buys and it is worthless ungated.

**Files:**
- Create: `contracts/src/meta/labParity.test.ts`
- Modify: `tools/combat-lab/verify.mjs` (one new gate)

- [ ] **Step F1: Write the ceiling-parity test**

Create `contracts/src/meta/labParity.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAT_COEF, STAT_MAX } from "./derivedStats";
import { weaponOffence } from "./weaponStats";

const model = JSON.parse(
  readFileSync(
    join(__dirname, "../../../tools/combat-lab/combat-model.json"),
    "utf8",
  ),
) as {
  proposed: {
    inputs: Record<string, { value: number }>;
    builds: { build: string; alloc: number }[];
    gearTiers: { tier: string; scale: number }[];
    levelMax: number;
  };
};

test("STAT_COEF mirrors the lab's statCoef", () => {
  expect(STAT_COEF).toBeCloseTo(model.proposed.inputs.statCoef.value, 10);
});

test("STAT_MAX equals the lab's levelMax-aligned stat cap", () => {
  expect(STAT_MAX).toBe(model.proposed.levelMax);
});

test("the offence multiplier ceiling equals the lab's max-grade ceiling", () => {
  // lab: atkBudget's stat term is (1 + 2*C*alloc*off), maxed at alloc 1, off 1.
  const labCeiling =
    1 + 2 * model.proposed.inputs.statCoef.value * Math.max(...model.proposed.builds.map((b) => b.alloc));
  // ours: 1 + 2*C*share(99) with share saturating at exactly 1
  const ourCeiling = 1 + 2 * STAT_COEF * 1;
  expect(ourCeiling).toBeCloseTo(labCeiling, 10);
  expect(ourCeiling).toBeCloseTo(2, 10);
});

test("gear scale tops out at 1, matching the lab's best gear tier", () => {
  const labBest = Math.max(...model.proposed.gearTiers.map((g) => g.scale));
  expect(labBest).toBeCloseTo(1, 10);
  const ourBest = Math.max(
    ...["basic_sword", "dagger", "great_bow", "magic_staff", "scythe"].map(
      (id) => weaponOffence(id).gear,
    ),
  );
  expect(ourBest).toBeCloseTo(labBest, 10);
});

test("no weapon in the catalog exceeds gear 1 — a stronger weapon must move GEAR_REFERENCE", () => {
  const overs = ["basic_sword", "dagger", "great_bow", "magic_staff", "scythe"].filter(
    (id) => weaponOffence(id).gear > 1 + 1e-12,
  );
  expect(overs).toEqual([]);
});
```

- [ ] **Step F2: Run it**

```bash
cd contracts && npx jest src/meta/labParity.test.ts 2>&1 | tail -12
```

Expected: PASS, 5 tests. If `combat-model.json` is missing, run
`node scripts/gen_combat_model.mjs` from the repo root first.

- [ ] **Step F3: Add the mirror gate on the lab side**

`tools/combat-lab/verify.mjs` cannot import TypeScript, so gate the *catalog* there:
assert that every weapon's `(pAtk + mAtk) / GEAR_REFERENCE` is in `(0, 1]` and that at
least one weapon hits exactly `1`, reading `contracts/content/items.json` directly. Follow
the existing `gate(...)` style in that file.

- [ ] **Step F4: Prove both gates bite**

- Break the TS side: change `GEAR_REFERENCE` to `20` and show
  `labParity.test.ts` failing on "gear scale tops out at 1". Revert.
- Break the lab side: add a fake weapon with `pAtk: 40` to
  `contracts/content/items.json` and show the new `verify.mjs` gate failing. Revert.

Paste both failures.

- [ ] **Step F5: Re-run the full baseline**

```bash
node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs; echo "exit=$?"
node scripts/gen_combat_spec.mjs   # the gate COUNT changed — see Global Constraints
node tools/combat-lab/verify.mjs; echo "exit=$?"
cd contracts && pnpm build && npx jest 2>&1 | tail -6
cd ../colyseus-server && npm test 2>&1 | tail -8
cd ../nakama && npx jest 2>&1 | tail -6
```

Expected: both `verify.mjs` runs exit 0 (the first may be red on staleness until
`gen_combat_spec.mjs` reruns), all three suites green apart from the known
`it.failing` divergences.

- [ ] **Step F6: Commit**

```bash
git add contracts/src/meta/labParity.test.ts tools/combat-lab/verify.mjs \
        docs/superpowers/specs/2026-07-30-combat-model-split-design.md
git commit -m "test: gate the game's stat and gear ceilings against the combat lab"
```

- [ ] **Step F7: Gate 1 and ship Part 2**

```bash
bash .claude/ps-release-workflow/precheck.sh; echo "exit=$?"
```

Then `/ps-release-workflow:ship` from the Part 2 worktree.

---

## Self-review

Run against the handoff's "Every remaining step, in order" table and its
Definition of Done.

**1. Coverage.**

| handoff step | plan location |
| --- | --- |
| 1. Decide weapon semantics | W1/W2/W3 in "Decisions locked", resolved before Phase C |
| 2. P4 `derivedStats` in all three copies + 4 test expectations | Phases C–E; the test file is rewritten rather than patched (Step D1) because all four expectations change |
| 3. File three idea tickets | Phase A, Steps A1–A3 |
| 4. Gate 1 | Step B4 (Part 1), Step F7 (Part 2) |
| 5. Ship into `release/1.5` + cleanup | Steps B5–B7 |
| handoff DoD: "P4 `derivedStats`" | Phases C–F |
| handoff's three undecided items (`WEAPON_REFERENCE`, `STAT_REFERENCE`, both channels feed magnitude) | W1 replaces the first with best-in-catalog 18; W3 dissolves the second; the third is answered — magnitude from the *total*, direction from the *ratio*, stat from the catalog |

**2. Gaps found and closed while reviewing.** The handoff's draft did not mention:
`dex` is absent from `PrimaryStats` entirely (Phase C exists because of this); the
`migrateDoc` fallback would reset profiles (the callout in Phase C); `Player` has no
`level`, which is the real cause of the `recalculateStats` divergence (Phase E's cache);
and a fourth weapon catalog exists at `colyseus-server/src/config/combat/weapons.ts`
whose `projectileType` already encodes the W2 mapping (gated in Step E1's fourth test).

**3. Type consistency.** `weaponOffence` returns `{ atkStat, gear, rho }` in Phase C and
is destructured with those exact names in Phases D, E and F. `AtkStat` is
`'str' | 'dex' | 'int'` everywhere. `PrimaryStats` gains `dex` in Phase C and every later
`allocated` literal in this plan includes it. The exported constants named in Phase D's
Interfaces block are the ones Phase F imports.

## Definition of done

**Part 1:**
- [ ] Three idea tickets filed and committed on `release/1.5`
- [ ] `node tools/combat-lab/verify.mjs` exits 0
- [ ] `colyseus-server` suite at its 564/570 baseline
- [ ] Gate 1 green; `feat/F-018` merged into `release/1.5`; catalog reads shipped
- [ ] F-018 worktree removed, `feat/F-018` branch kept

**Part 2:**
- [ ] `dex` present in `PrimaryStats`, the Zod schema, the default doc, the
  `allocate_stats` RPC, `applyLoadout`, and the C# signature
- [ ] Profile schema at v2 with a v1→v2 migration proven not to lose `level`/`xp`
- [ ] `derivedStats` multiplicative; the anchor test passes to 6 decimals
- [ ] Attack/defence ratio identical at levels 1, 50 and 99 (D6)
- [ ] `int` buys no `mDef`; `pDef === mDef` (D7)
- [ ] Each weapon reads only its own stat (W2), gated for all five catalog entries
- [ ] Both weapon catalogs gated against each other on stat and power
- [ ] Ceiling parity with the lab gated on both sides, each proven to bite
- [ ] The `mAtk === 0` consequence audit run, findings recorded
- [ ] C# twin ported, or explicitly reported unverified with the reason

## Explicitly not in this plan

- **Boss aggro / target rotation** and the **properly-tested pack engagement** — filed as
  tickets in Phase A, both need design decisions first.
- **Subtractive-vs-divisive mitigation.**
  `colyseus-server/src/modules/combat/DamageCalculator.ts` is subtractive, 80%-capped and
  1-floored; the model is divisive and uncapped. They are different functions and cannot
  agree in general. **This plan does not make the model predict shipped damage numbers**
  and nothing in it should be read as claiming otherwise.
- **Full I-032 dedup** (two sources of truth for `pAtk`/`mAtk`). Phase E gates the
  divergence and fixes the clobber; it does not merge the catalogs.
- **I-033** (primary-stat clamp split-brain) — `contracts` has no clamp,
  `colyseus-server` clamps 1–99. Phase D clamps inside `share()`, which bounds the
  *formula*; the two clamp *sites* remain.
- **Race/class fields and per-race leans** (I-034).
- **`aspd` channelisation**, mana, healers, potions, rest, gear tiers beyond weapons.
- **Rebalancing anything.** Weapon numbers move because weapons became multiplicative.
  Retuning the catalog to taste is separate work, and the anchor exists so that the
  starting character's numbers are the one thing that does not move.
