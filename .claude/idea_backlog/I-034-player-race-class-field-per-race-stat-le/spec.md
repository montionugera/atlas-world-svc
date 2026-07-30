---
title: "Player race/class field + per-race stat leans (deferred from F-018 foundation slice)"
id: I-034
status: idea
---

# Player race/class field + per-race stat leans

## Problem

F-017 (World Wisdom) locked **8 races × 8 classes** as canon, including a per-race
stat-lean table in `content/story/canon.md:344-359` (Human balanced, Ogre physical,
Demon Void affinity, Elf mana/cast speed, …). That table is explicitly
**canon-of-intent only**: no `race` / `class` / `playerClass` field exists on any
schema in `colyseus-server/src/schemas/`. Character art for all 64 combinations is
committed and canon, but a player cannot *be* any of them.

This was the original ask of I-028. When I-028 was promoted to **F-018**, the scope
was deliberately narrowed to the **combat-model foundation slice** — because the
stat leans cannot be built on a stat model that was still structurally undecided.
This idea carries the deferred half.

## Why now

Not now — **after F-018 ships**. F-018 resolves the blocker this depends on:

- `contracts/src/meta/derivedStats.ts` is a PINNED additive formula that disagrees
  structurally with the settled balance model. F-018 reconciles it.
- Per-race leans need a stat surface to lean *on*. Four of the eight canon leans
  currently have no mechanism to attach to at all:

| Race | Canon lean | Expressible today? |
| --- | --- | --- |
| Human | balanced, no lean | ✅ trivially (no-op) |
| Ogre | physical power and health | ✅ `str` + `vit` |
| Beastkin | agility | ✅ `agi` |
| Dwarf | defense **and craft** | ⚠️ defence yes; **no craft stat exists** |
| Elf | **mana** and **cast speed** | ❌ no mana/MP resource, no cast-speed stat |
| Demon | **Void affinity** | ❌ per-entity element exists but the player never sets it |
| Immortal | **Holy affinity** | ❌ same |
| Dragon | **elemental magic power** | ❌ only flat `mAtk`; nothing scales *by element* |

## Sketch

1. `race` / `class` fields on the player schema + profile doc, with a schema-version
   migration. **Note the landmine:** `nakama/src/storage.ts` `migrateDoc()` falls
   through to `defaultDoc()`, so bumping `CURRENT_SCHEMA_VERSION` silently resets
   every profile. Fix that before any bump.
2. Per-race stat leans applied as multipliers on top of the F-018 stat model.
3. Demon/Immortal affinity is a **one-line binding** — `WorldLife.ts:41` is already a
   synced element field consumed by `DamageCalculator`, set by `Mob`; the player
   simply never sets it.
4. Elf (mana, cast speed), Dwarf (craft) and Dragon (per-element scaling) need
   systems that do not exist. Those are their own features, not this one.

## Related

- **F-018** — combat stat model foundation. Blocks this.
- **I-032** — `recalculateStats()` clobbers the applied loadout (client-reachable).
- **I-033** — primary-stat clamp split-brain (Nakama unbounded, colyseus clamps 1-99).
- **I-027** — `damageType` dropped on the BattleManager queue.
