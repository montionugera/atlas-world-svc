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
