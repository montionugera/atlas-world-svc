---
title: "Resolve the internal canon contradictions (catalogue re-derived: 15 found, X1/X9/X12 confirmed unresolved)"
id: I-056
status: idea
wave: 1
order: 1
sequence_why: "L0 first - stop building on known contradictions; P1 of DR-003 was recorded but never landed"
supersedes_title: "Resolve the 14 internal canon contradictions the Archivist catalogued, including char-expedition-member's two incompatible definitions and core-story.md's superseded magic rule that F-017 replaced"
---

# Resolve the internal canon contradictions

## Status: catalogue re-derived from the corpus (the Archivist's original list is lost)

A prior worldbuilding panel catalogued 14 contradictions as `X1`..`X14`. **That catalogue was never committed.** Only three survive by name — `X1`, `X9`, `X12` — in `.claude/idea_backlog/I-048-.../spec.md` §7 and `docs/worldbuilding/DR-003-season-1-budget.md:132`.

This spec is a **blind re-derivation** against the corpus on `release/1.6`: all of `content/story/*`, `content/maps/`, `content/characters/`, `docs/story/undertow/*`, `docs/worldbuilding/`, the grand-epic spec, `game-client/assets/art/art-manifest.json`, and the shipped combat/mob config in `colyseus-server/src`.

**15 contradictions found against 14 claimed.** Confidence that this substantially reproduces the original: the superseded magic rule was found *independently* before reading this idea's title, which then named it; `X1` and `X9` both map cleanly. Divergence is expected in two directions — `X12` is probably one item upstream and two here, and 1–2 items are likely invisible (see *Branch-state caveat*).

## Problem

### 🔴 The finding that changes this idea's priority: DR-003's P1 was recorded, never landed

`I-048` §7 states X1 was **"Ruled: accepted by accommodation. One sentence in `canon.md` §4 citing both sources."** `DR-003:132` restates P1 as *delivered by I-056*. **None of it is in the tree.** Verified:

| P1 obligation | State on `release/1.6` |
|---|---|
| Accommodating sentence in `canon.md` §4 | **Absent** — no mention of loam, seam, or Embervale farming; only `canon.md:188` "Norhollow's outer farms" |
| `canon.md:324` no longer hangs the school on "mining town" | **Unchanged** — still `Embervale (Fire/Earth — mining town)` |
| `canon.md:77` retires `char-expedition-member` as player identity | **Unchanged** — still `Player-driven. … Alive — the throughline.` |
| `quests.json:447` giver repointed | **Unchanged** — still `"giver": "char-expedition-member"` |
| Region keyspaces unified | **Not started** — `season-1-budget.json:46` still carries the `blockedBy` |

So the `zones` budget line is still unmeasurable (`node scripts/report_season1.mjs` → `zones 10 - blocked`), and a ruling that was made is being cited as though it shipped.

### The catalogue

*Item numbers are stable ids from the audit and are grouped by impact below, so they are deliberately out of order.*

**Blocks Season 1 authoring** — these decide what 90 quests say:

1. **Embervale is a mining town and a farm town (X1).** `canon.md:324` derives Embervale's Fire/Earth school from it being *the* mining town; `core-story.md:9` and `novel-complete.md:20` make Embervale agrarian and give the mine to Norhollow. The school geography rests on whichever was read last. → **accommodate**: one sentence in `canon.md` §4 (both true, neither a correction); amend `:324` to `Embervale (Fire/Earth — the ember-seam)`.

2. **`char-expedition-member` vs the Crossroads Man (X9).** One is a founder of the expedition that reopened the meadow (`characters.json:18-19`, `player-expedition.md:19`); the other is a townless drifter who arrives at Millcross *after* Day 0 and is trusted because he belongs to no side (`core-story.md:111`). The repo ships art, prose and data for both. Live symptoms: `quests.json:447` — the player gives himself a quest; `dialogue.json:22` — the player is a speaking NPC; `HANDOFF-2026-07-28.md:20` has already promoted the Crossroads Man sheet to the canonical **Human race** reference while the shipped player asset is `player_knight.glb`. → **retire + repoint**, as P1 specifies.

3. **The superseded magic rule (named in this idea's original title).** `canon.md:256-260` — *"Magic is everyday … no shortage and no black market"*; `style.md:179` agrees. But `core-story.md:72` and the grand-epic spec `:76` still assert the **iron rule: magic is a scarce, contested resource**. F-017 replaced scarcity-gating with rune-gating. `style.md:7` points authors *at* the stale spec as its own provenance. → **retire** the scarcity formulation; strike the spec's §6.5 as superseded, keeping its surviving half.

4. **Two incompatible definitions of "the ten cluster-1 zones" (X12, head 1).** `DR-003:58,65` and `season-1-budget.json:46` assert A1's ten zones *have no `region-*` ids*; `content/story/regions.json` already defines exactly ten `region-*` nodes for what the same docs call the same ground. `quest.schema.json` pins `region` to `^region-`, so 90 quests must be authored into one keyspace. → **repoint**: `region-*` wins; record the nine correspondences and two orphans in a `canon.md` §4 table; drop the `blockedBy`.

5. **`region-spawn-meadow` and `region-millcross` are the same ground twice (X12, head 2).** `canon.md:28-30` folds the meadow into Millcross's ground, but `regions.json` keeps two nodes with identical properties, and `characters.json:9` puts the Quartermaster in the meadow while she dies at Millcross (`events.json:154-164`). → **accommodate + repoint**: the meadow is Millcross's frontier ward; repoint her residence.

12. **The Brotherhood Caravan was never backported.** `canon.md:27` calls the pre-Day-0 period *"otherwise unremarkable"* and never records the joint caravan; `core-story.md:9`, `novel-complete.md:4` and `glossary-th.md:41` make it a hundred-year institution and the load-bearing cause of the war — burn it and both towns must buy from Gildmark at war prices. `novel-complete.md:4` says the backport is **owed**. The war's economic motive is absent from the one file quest authors are told to read. → **accommodate**: backport to `canon.md` §1 and §4; resolve `lore.json:267`'s *"sundries, unremarkable"* as the falsified manifest. *(This is [[I-025]] — already filed, still open.)*

**Does not block authoring, but mis-teaches every new author:**

6. **The Icefield arc is filed in the war act.** `canon.md:40-47` and `README.md:15-16` place the Icefield–Thornveil standoff in Act 1's quiet-before; `arcs.json:20` sets `actId: "act-2"`, which `acts.json:14-17` defines as *"The War Comes Home"*. The graph itself dates it pre-war (`events.json:22` `timelineOrder: 3` vs `event-war-declared` at 4). → **repoint** to `act-1` and regenerate `docs/story/story-graph.md` in the same commit (drift gate).

7. **"War-scar monsters are Void-line" is mechanically inert.** `canon.md:310-313` makes it world law and the Bell School's reason to exist; `MobTypeConfig` (`config/mobs/types.ts:71-87`) has **no defence-element field** and all six mob definitions leave `WorldLife.element` at `neutral`. Holy lands at 1.0 where canon promises ×2.0. → **repoint** via [[I-029]] (add `element?` to `MobTypeConfig`), or soften `canon.md:310` and mark the binding pending.

8. **`bible.md` still declares itself the source of truth.** It describes one era and three regions (`bible.md:1-3,9-12,65-67`); the shipped graph runs five acts, ten regions, ten factions. Seven of ten factions and seven of ten regions never appear in it — so `README.md:272`'s mandatory rule (*"never invent a faction … extend the bible first"*) was already broken by shipped content. → **retire + repoint**: demote to seed-only; point `README.md:272` at `canon.md` first.

9. **The Widow is filed inside the banner she wants burned.** `characters.json:70-77` gives her `faction-embervale-banner`; `core-story.md:95` has Embervale burn her house and Norhollow shut its gate — belonging to neither is the engine of her arc and why the Broker cannot see her. → **repoint**: drop `faction`; add the bond line to `canon.md:82`.

10. **The Stoneguard hold two different gates.** `canon.md:19-21` grounds their identity at Cindervast's gate (north-west beyond Ashvale Front, `:185-186`); `factions.json:29` links them only to `region-icefield`, and `bible.md:43` calls the icefield their home turf. → **accommodate**: the gate plus a detached watch on the old Cindervast trade road; add `region-cindervast` to their links.

11. **Cindervast's dead do not add up.** `core-story.md:40` — 40,000 erased in one night; `:68` — `~40,000 → 0`, *92%*, and *~3,000 survivors*. Only the 92% reading leaves the Cindered existing at all. → **repoint** to ~37,000 erased, population `0 (residents)`, ~3,000 scattered.

13. **The caravan burns at dawn and in the night.** `events.json:34` fixes it at dawn; `novel-complete.md:36,38` and `core-story.md:156` turn the prologue on the Widow waking in the dead of night, with the planted evidence found the *next* morning. → **repoint** `events.json:34` to "in the night, and by dawn each side … was already certain".

14. **Six peoples vs eight races.** `core-story.md:79` presents six peoples as the land's complete roster; `canon.md:344-345` lists eight races, and the art manifest places them inside the same six towns. `style.md:147-153` **already holds the ruling** (two axes, not one list) — it was never carried back. → **accommodate**: copy the ruling into `core-story.md:79`.

15. **`style.md` says no cross-register name exists; the protagonist is one.** `style.md:113-115` reserves the mixed form for characters who move between both worlds and states *"none exist yet"*. "The Crossroads Man" is exactly that form and has shipped in art (`art-manifest.json:6`) and prose. → **accommodate**: name him as the one deliberate instance and state what the mixing signals.

**Reported but ranked below the line** (weaker second source):

- **The Quartermaster is dead and gives four ungated quests.** `characters.json:11` `status: "dead"`; she is `giver` on `quest-first-steps`, `-cull-the-packs`, `-the-twin-strike`, `-icefield-reckoning`, none carrying `unlockedBy`. `README.md:166-169` explicitly declines to gate this ("authoring discipline"). This is the play-time/story-time seam rather than two opposed assertions, and I-048 §5.1 already routes it as "dead givers". **Medium confidence.**

## Branch-state caveat — part of the corpus is not on this branch

`DR-003:4-5` cites `DR-001-L1-scope.md`, `A1-geography-cluster1.md`, `DR-004-starter-ground.md` and `DR-005-act-axis.md` as its parents. **None are on `release/1.6`** — `docs/worldbuilding/` holds only DR-003. All four, plus `content/bestiary/bestiary.json` and `content/maps/cluster1-geography.json`, live on `feat/F-024` (verified via `git ls-tree -r --name-only feat/F-024`). The only `bestiary.json` on this branch is a test fixture.

Two consequences:

- **DR-003 ships with dangling parent references.** It self-discloses the bestiary/art-town split but says nothing about its own parents being unreachable. → add a note to DR-003 §1 naming the branch until F-024 merges.
- **X12's full four-way form is not observable here.** I-048 §5.3 names four rival id spaces; only two exist on this branch (`regions.json`, and `atlas-frontier.md` which uses the same keyspace). `bestiary.json` and `cluster1-geography.json` are the other two. **Re-run the keyspace half of this audit after F-024 merges.** Note also that `canon.md` §6 is currently the two-line *Contradiction rule* (`:374-377`) — the keyspace register X12's fix is meant to land in **does not exist yet**.

## Why now

`DR-003` funds **90 act-independent quests against 8 today** and 54 of them sit on the burial spine whose premise item 12 supplies. Items 1, 2, 4, 5 and 12 each decide what those quests *say*; getting them wrong means re-authoring, not patching. Item 2 additionally moves the player's visual identity and the Human race art. And the `zones` budget line cannot be measured at all until item 4 lands.

## Sketch

Three commits, in order:

1. **The P1 clearing commit** — items 1, 2, 4, 5. This is DR-003's P1, finally landed: the `canon.md` §4 accommodation, `:324` and `:77` amendments, the `quests.json:447` / `dialogue.json:22` repoints, the keyspace table, and dropping `season-1-budget.json:46`'s `blockedBy`. Ends with `report_season1.mjs` showing `zones` measured rather than blocked.
2. **The stale-rule commit** — items 3, 8, 14, 15: retire the scarcity rule, demote `bible.md`, backport the two rulings that already exist in `style.md`. All four are "a decision was made and never carried back".
3. **The data-fix commit** — items 6, 9, 10, 11, 13: `arcs.json` actId (+ regenerate `story-graph.md`), the Widow's faction, Stoneguard links, the Cindervast arithmetic, the dawn/night fix.

Item 12 is [[I-025]] and item 7 is [[I-029]] — both already filed; link rather than duplicate. Add a `canon.md` §6 **keyspace register** as part of commit 1, since X12's resolution has nowhere to live today.

## Verification

1. Every edit above is present in the tree, quoted back with `file:line` — the failure mode this idea exists to fix is *a ruling recorded in the backlog and never landed in canon*.
2. `node scripts/check_content.mjs` (or the story coherence gate) passes; `docs/story/story-graph.md` is regenerated in the same commit as the `arcs.json` change or the drift gate fails.
3. `node scripts/report_season1.mjs` prints a measured `zones` value, not `blocked`.
4. The keyspace half of this audit is **re-run after `feat/F-024` merges**, and X12's remaining two heads are either found or explicitly ruled absent.
5. DR-003 no longer cites unreachable parents.
