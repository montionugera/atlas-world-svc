---
title: "Phase C runtime spine: player race/class field + BaseStat<->PrimaryStats reconciliation + per-race stat leans (F-017 canon-of-intent into game state)"
id: I-028
status: idea
---

# Phase C runtime spine: player race/class field + stat-model reconciliation

## Problem

F-017 (World Wisdom) locked **8 races × 8 classes** as canon, including a per-race
stat-lean table in `content/story/canon.md:344-359` (Human balanced, Ogre physical,
Demon Void affinity, Elf mana/cast speed, …). That table is explicitly labelled
**canon-of-intent only** — the handoff §5 states *"No player class/race field and no
stat leans. Nothing stores a class server-side."* Verified: no `race` / `class` /
`playerClass` field exists on any schema in `colyseus-server/src/schemas/`.

So the lore documents a system the game cannot express. Character art for all 64
combinations is committed and canon, but a player cannot *be* any of them.

**The blocking sub-problem is that the two stat models disagree**, and picking a side
is its own decision:

| Source | Shape |
|---|---|
| `colyseus-server/src/config/combat/combatStats.ts:5` — `BaseStat` | `{ agi, str, vit, dex }` |
| `contracts/src/meta/types.ts:1` — `PrimaryStats` | `{ str, agi, int, vit }` |

They share `str/agi/vit` and disagree on the fourth: the sim has **dex**, Nakama's meta
layer has **int**. This is already a known live seam — `colyseus-server/src/meta/applyLoadout.ts:27`
carries the comment *"`dex` field — leave player.stat.dex at its config default"*, i.e.
the loadout path silently drops a stat today.

Per-race leans cannot be implemented until this is resolved, because "Elf leans mana and
cast speed" needs an `int`-like stat the sim does not have, and "Beastkin leans agility"
needs to survive the `applyLoadout` gap.

### `dex` is a phantom stat — the mismatch is worse than "dex vs int"

Verified by grep across `colyseus-server/src` (excluding tests): **nothing reads
`stat.dex`.** The only two hits are its own declaration in `combatStats.ts:25` and the
`applyLoadout.ts:27` comment explaining it is left alone. It feeds no derived stat, no
timing, no formula.

Contrast `agi`, which is genuinely consumed — `meleeAttackSpeed.ts:105`,
`MeleeAttackStrategy.ts:43`, `SpearThrowAttackStrategy.ts:58`, `Player.ts:99`.

So the framing "the sim has dex, meta has int" is misleading. The truth:
**`dex` has never done anything, and `int` does two things.** The pinned formula in
`contracts/src/meta/derivedStats.ts` uses only `vit / str / int / agi`:

```
maxHealth = 100 + 10*vit + 5*(level-1)     pAtk = 10 + 2*str + weapon.pAtk
mAtk      = 10 + 2*int + weapon.mAtk       pDef = 5 + vit
mDef      = 5 + int                        maxMoveSpeed = 20 + 0.2*agi
```

`int` drives **both magic offense and magic defence**. Combined with [[I-027]] (magical
projectiles defended with `pDef`, not `mDef`) and [[I-029]] (element multiplier applied
*after* defence), `int` is the balance hotspot of the whole combat model.

**The likely resolution is to delete `dex`, not to reconcile it** — but that is an owner
call, since RO-style `dex` (hit/accuracy/cast-time) is the natural home for the
cast-speed lean canon promises the Elf.

### Missing stats: 4 of 8 canon leans have no mechanism to attach to

`content/story/canon.md:353-356` promises eight leans. Audited against what exists:

| Race | Canon lean | Expressible today? |
|---|---|---|
| Human | balanced, no lean | ✅ trivially (no-op) |
| Ogre | physical power and health | ✅ `str` + `vit` |
| Beastkin | agility | ✅ `agi` |
| Dwarf | defense **and craft** | ⚠️ defence yes; **no craft stat exists** |
| Elf | **mana** and **cast speed** | ❌ no mana/MP resource, no cast-speed stat |
| Demon | **Void affinity** | ❌ no per-entity element affinity |
| Immortal | **Holy affinity** | ❌ no per-entity element affinity |
| Dragon | **elemental magic power** | ❌ only flat `mAtk`; nothing scales *by element* |

Verified absent: `grep -riE "\bmana\b|maxMp|currentMp|spCost"` over
`colyseus-server/src` + `contracts/src` returns **nothing** — consistent with handoff §5
("No mana/MP resource"). And `grep -rn "resist\|affinity" colyseus-server/src/config/combat`
returns **nothing** — the element system is a flat 7×7 attacker-element × defender-element
table with **no per-entity affinity or resistance modifier**.

So "Demon leans Void affinity" is not a tuning value waiting for a field. **There is no
mechanism at all.** Per-element affinity is a new combat mechanic shared with [[I-029]],
and it should probably be designed once, there or here, but not twice.

## Why now

- The element system (F-017) multiplies **after** defense, so stat correctness compounds:
  a wrong `int`/`dex` mapping is doubled by an elemental advantage.
- Race/class art is already shipped and committed — content is ahead of runtime.
- It is the named **#2 next move** in the F-017 handoff
  (`docs/superpowers/decisions/2026-07-27-world-wisdom-handoff.md` §10).
- Related: I-027 (`damageType` dropped on the queue path) touches the same defense-stat
  selection code. Sequencing these two together may be cheaper than doing them apart.

## Sketch

(rough shape; not a design yet — the stat decision must be brainstormed with the owner)

1. **Decide the canonical primary-stat set** — reconcile `dex` vs `int`, or adopt a
   5-stat superset. This is an owner decision with cross-repo blast radius
   (contracts → Nakama → colyseus → generated C# → `game-client` CharacterPanel/LoadoutPanel).
2. Add `race` + `class` to the profile/meta layer, and decide whether they replicate into
   the synced Colyseus schema or stay meta-only.
3. Apply per-race leans as a data table derived from `canon.md`, not hardcoded — likely a
   content file with a gate, so lore and runtime cannot drift.
4. Close the `applyLoadout` silent-drop seam so no allocated stat is discarded.

## Missing: classes have nothing to gate (the "skill" half of Phase C)

Handoff §5 says "No skill trees, no per-class skill numbers" — but the gap is more
concrete than that. `contracts/content/skills.json` is **four skills** with only
`{ id, name, maxLevel, requires }`:

```
power_strike (max 5)   fireball (max 5)   iron_skin (max 3)   cleave (max 5, requires power_strike)
```

There is **no `class` / `job` field, no `element` field, and no `damageType` field** on a
skill. `fireball` exists and cannot be Fire-elemental.

Verified: no job/class token (`swordsman|archer|assassin|spearman|summoner|engineer|healer`)
appears anywhere in `*.ts` / `*.cs` / non-art `*.json` — the 8 classes exist **only** as
64 art keys in `art-manifest.json`.

**Consequence: shipping a `class` field alone makes class purely cosmetic** — a label with
no mechanical consequence, since there is nothing for it to gate. Deciding whether Phase C
includes "skills gain a `class` gate + an `element`" is a scoping decision this idea must
make explicitly, not discover during implementation.

## Blast radius — 10 sites, one of them stored player data

Changing the `PrimaryStats` shape is not a local edit. Concretely:

| # | Site | Why |
|---|---|---|
| 1 | `contracts/src/meta/types.ts:1` | the interface |
| 2 | `contracts/src/meta/schemas.ts:25` | **`schemaVersion: z.literal(1)` + `.strict()`** |
| 3 | `contracts/src/meta/derivedStats.ts` | **PINNED formula**, comment says "do not improve the numbers here" |
| 4 | `nakama/src/rpc/allocateStats.ts` | hardcodes `{str,agi,int,vit}` **twice** (parse + accumulate) |
| 5 | `nakama/src/leveling.ts:21` | point economy — `+3 statPoints` per level; a 5th stat dilutes it |
| 6 | `colyseus-server/src/meta/applyLoadout.ts` | the silent-drop seam |
| 7 | `colyseus-server/src/config/combat/combatStats.ts` | `BaseStat` + `clampPrimaryStat` (1–99, vs meta's unbounded non-negative — **the two clamps also disagree**) |
| 8 | `colyseus-server/scripts/codegen/gen-csharp-meta.ts` + `check_drift_meta.sh` | drift gate **fails until regenerated** |
| 9 | `game-client/src/Contracts/MetaTypes.cs`, `UI/Panels/CharacterPanel.cs`, `UI/Panels/LoadoutPanel.cs` | generated C# + the two panels that render stats |
| 10 | **Stored Nakama profile docs** | see below |

### The migration story — currently missing entirely

`ProfileDoc` is validated with `schemaVersion: z.literal(1)` under a `.strict()` object.
That means **adding or removing a `PrimaryStats` field breaks every existing stored
profile on read** — a literal `1` will not accept a v2 doc, and `.strict()` rejects
unknown keys. Any change here requires:

- bumping to `z.literal(2)` (or a discriminated union across versions), **and**
- a migration for already-persisted player profiles, **and**
- a decision on stat respec: if `dex` is deleted or `int` is added, players who already
  allocated points need those points refunded or remapped.

None of this is optional, and none of it was in the original sketch. It is plausibly the
single largest chunk of work in Phase C.

## Open questions

- Does `race`/`class` belong in synced game state at all, or only in Nakama meta + a
  render hint? Affects bandwidth and the server-authority invariant.
- Are the leans additive flat, multiplicative, or starting-allocation only?
- **Two race rosters coexist and canon deliberately has not merged them.**
  `content/story/style.md:151-152` states outright that canon *does not yet say* whether
  the story-side `beast-blooded` and the gameplay-side `Beastkin` are the same people.
  The 6 "peoples" (`human expedition-stock, beast-blooded, ice-born, bramble-kin,
  gild-blooded, the Cindered`) are narrative lineages; the 8 races are playable identities.
  A playable-race feature has to state which list it binds to — this is an open canon
  question, **not** drift to silently fix.

## Related

- Handoff: `docs/superpowers/decisions/2026-07-27-world-wisdom-handoff.md` §5, §10
- Canon roster + lean table: `content/story/canon.md:344-359`
- Stale scope note to supersede: `docs/superpowers/specs/2026-07-23-grand-epic-undertow-design.md:33,92`
  still says playable races are out of scope, with no supersession note. Both *binding*
  law docs (`canon.md`, `style.md`) are already correct — the spec is a stale snapshot only.
- [[I-027]] — same defense-stat code path
