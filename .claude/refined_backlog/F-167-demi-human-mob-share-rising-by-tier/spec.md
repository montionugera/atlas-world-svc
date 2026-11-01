---
title: "Demi-human mob share rising by tier"
id: F-167
from_idea: I-247
status: refined
---

# I-247 Demi-human mob share rising by tier

Status: owner-approved 2026-11-01 with every default. Not refined yet.

## Goal
High-tier dungeon enemies are designed as upright, intelligent monsters as often as the owner asked ("~ 30 % look like Demi-human especially high tier"), and no dungeon boss is left as a nameless filler robot. We know it worked when the atlas spawn list can filter to these mobs and a gate proves the share per tier.

The user will confirm this by opening the atlas spawn list on the atlas web surface, pressing "Upright monster", and seeing the count line with the per-tier split below.

## Non-goals
- No new race. The canon of twelve lineages (six mortal, six wild) stays. Owner choice, 2026-11-01.
- No runtime change. `contracts/content/mobs.json` holds 4 mobs and the server does not read atlas rows.
- No new 3D models or rigs. No new concept art: this feature changes design data, so nothing looks different yet. Art is the next feature, briefed from these rows.
- Field and fortress `spawn_territories` (128 rows, no `race_key`) and the `t_deep_validation_slice` tables stay as they are. Filed as a follow-up. World Map pins for field bosses therefore keep their current names.
- Kiln-Saint Pyraea does not change: her row, `npc_id` 29001 `[MVP] Queen Ant Ash-Brood Sovereign` in `zone-dungeon-kiln-cellar` B3, stays fully insect (owner, 2026-11-01).

## Users & jobs
The owner reviews the monster roster and wants strong enemies that stand upright, and bosses with real identities. Designers then brief concept art from a row alone.

## What is true today (measured 2026-11-01)
Scope is `multi_floor_dungeons[].floors[].spawns`, 262 hostile rows. A row is one spawn object, keyed `dungeon_id/floor_id/index`, because `npc_id` repeats.

| Tier | Rows | On the Clockwork Steppe | Filler names | Filler off the Steppe |
|---|---|---|---|---|
| Normal | 67 | 17 | 0 | 0 |
| Mini-boss | 65 | 16 | 59 | 46 |
| Raid (with `RaidBoss`) | 65 | 16 | 61 | 47 |
| MVP | 65 | 16 | 60 | 46 |

- Filler means these name shapes, written by `scripts/tall_dungeon_expansion.py:142-168`: `<floor> ... Overseer`, `<floor> Seal Warden`, `Regional Seal Warden`, `Apostle Vanguard Manifestation`, `<dungeon> <floor> Apostle Sovereign`, `... Keeper`. That script hard-codes `robotic`, or `dark_lunar` in catacombs, so those race labels are filler too. Filler totals 180 rows.
- 29 off-Steppe Normal rows are also generated `robotic` floor mobs.
- `Human / Demi-Human` is a playable race that can also appear as a mob (row 20048 is badged `Demi-Human · Bow`). The word already means something else in this world, so it is not used for this tag.
- The atlas JSON is the source. No build rewrites it.

## Design
**Shape tag, not race.** A row may carry `body_plan: "upright_monster"` and `body_kin`. It describes a silhouette: on two legs, full monster head, tail or clawed feet, no human face, no worn gear that reads as Furral. The display name is "Upright monster".

| `body_kin` | `race_key` | Example |
|---|---|---|
| `scale_kin` | `beast_animal_brute` | dragon-headed |
| `hound_kin`, `boar_kin` | `beast_animal_brute` | full animal head |
| `mantis_kin`, `beetle_kin` | `insect_arachnia` | |
| `tide_kin` | `fish` | |
| `bark_kin` | `plant` | |
| `bone_kin` | `undead` | beast skull |

`robotic` rows and the six playable races cannot carry the tag.

**Targets.** Counted in rows, rounded to the nearest whole row, within ±2.
| Tier | Rows | Share | Tagged (range) |
|---|---|---|---|
| Normal | 67 | 15% | 10 (8-12) |
| Mini-boss | 65 | 30% | 20 (18-22) |
| Raid | 65 | 40% | 26 (24-28) |
| MVP | 65 | 50% | 33 (31-35) |
| All | 262 | 34% | 89 |

**Picks file.** `content/studio/mob_body_plan_picks.json` holds one entry per changed row: row key, `new_name`, `race_key`, and `body_kin` when tagged. A person can review it, and the `monster-and-mob-designer` agent drafts it in the implementation. New `scripts/mob_body_plan_pass.py` applies it.

**Filler repair.** Every filler row gets a unique name and a real race from its zone's habitat and its god's theme (`boss_hierarchy_chains`). Steppe rows keep `robotic`. This also frees the 19 catacomb MVPs mislabelled `dark_lunar`, a playable race. Any off-Steppe generated Normal row may be picked too. Authored names stay, with one exception: the row `Rooftop Apex · Baium & Vesper's Throne Apex Sovereign` is renamed, because Baium is another game's boss name. `[Raid Boss] Discarded Kiln-Guardian` stays `robotic` on a `keep_robotic` list, and so do the canon construct apostles found during the build (4 rows in all, see the picks file). Stats, levels, drops, spawn points and ids do not change.

**Reference strings.** Old names also sit in `key_mobs`, `boss_tier_highlight` and `boss_hierarchy_chains`. The script updates them per dungeon and floor, since filler names repeat between dungeons.

**Gate `G-MOB-SHAPE`.** `scripts/tests/mob-shape-gate.test.mjs` runs in Gate 2 through `content_tests` in `scripts/integration.sh` and in CI, like the other content gates. It fails when a tier leaves its range; a tagged row has a playable race or `robotic`; row `npc_id` 29001 is tagged; tagged rows differ from the picks file; a tagged name contains a non-upright word (worm, slime, vine, ooze); a filler name returns anywhere in the atlas under `multi_floor_dungeons`; two boss rows share a name; or an off-Steppe boss row is `robotic` and not on `keep_robotic`.

**Surface.** The existing atlas spawn list (`scripts/atlas_world_web/frontend/04_studio_overlay_bars_a.js`) already shows these rows with a tier filter and a locate action, so it gets the control instead of a new view.
- One `joy-button joy-button--sm` toggle with `aria-pressed`, default off, labelled "Upright monster (89)". The state is in the URL as `shape=upright` and survives reload and Back.
- With it on, the list shows tagged dungeon rows only, with a text badge, and a `role="status"` line: "Showing 89 of 262 dungeon rows · Normal 10 · Mini-boss 20 · Raid 26 · MVP 33". Field rows are hidden while it is on, because they carry no shape data.
- The toggle combines with the tier and level filters. The numbers come from the loaded data.
- After toggling, focus stays on the toggle. Rows open by button with the existing locate action. Targets are at least 44px on touch.

| State | Shown | Recovery |
|---|---|---|
| Ideal | Tagged rows and the count line | Toggle off |
| Empty | "No upright monsters match these filters" | "Clear filters" resets all, focus to toggle |
| Partial, no tags yet | "No rows carry a shape tag yet." | Toggle disabled |
| Error, atlas data missing | "Monster list unavailable. Reload the page." | Reload |

Loading has no state of its own, because the list renders from data already on the page.

## Requirements
- R1. When the script runs, every tier shall hold tagged rows inside its range.
- R2. If a tier's eligible pool is below its range minimum, then the script shall exit non-zero and leave the atlas unchanged.
- R3. If a picks entry names a playable race or `robotic` with `body_kin`, then the script shall exit non-zero.
- R4. When the script runs twice, the atlas shall be byte-identical after the second run.
- R5. When the script changes a row, it shall change only `name`, `race_key`, `race_badge`, `body_plan` and `body_kin`, and reference strings holding the old name.
- R6. If an old filler name remains in any `multi_floor_dungeons` string, then the script shall exit non-zero.
- R7. When the toggle is on, the list shall show only tagged dungeon rows and the count line.
- R8. If the filters match nothing, then the list shall show the Empty state.
- R9. While a filler name is in a dungeon row, the gate shall fail.

## Acceptance criteria
- [ ] Given today's atlas, when the script runs, then tier counts are 10 / 20 / 26 / 33 and no stat, level, drop, spawn or id field differs.
- [ ] Given a row tagged with `race_key: ogre_orc`, when the gate runs, then it fails naming that row.
- [ ] Given `npc_id` 29001 tagged, when the gate runs, then it fails.
- [ ] Given a stale `boss_tier_highlight` fixture, when the gate runs, then it fails.
- [ ] Given each gate rule deleted in turn, when a violating row is added, then the matching test fails.
- [ ] Given the list, when the toggle is pressed with a real mouse, then the count equals the tagged count read from the atlas JSON in the same run and `Queen Ant Ash-Brood Sovereign` is absent.
- [ ] Given the keyboard only, when Tab reaches the toggle, Space presses it, Tab reaches a row, Enter opens it and Back returns, then the toggle is still on.

**End-to-end verification:** `cd scripts && node --test tests/mob-shape-gate.test.mjs`, then `./scripts/precheck.sh`, then the real-click check, with phone (390x844) and desktop (1280x800) screenshots.

## Interfaces & files
`content/studio/t_shaped_world_atlas.json`, `content/studio/schemas/t-shaped-world-atlas.schema.json` (optional `body_plan`, `body_kin`), new `content/studio/mob_body_plan_picks.json`, new `scripts/mob_body_plan_pass.py`, new `scripts/tests/mob-shape-gate.test.mjs`, `scripts/integration.sh` only if `content_tests` needs it, `scripts/atlas_world_web/frontend/04_studio_overlay_bars_a.js`.

## Alternatives considered
- New seventh mob race "Beastkin": clear data, but breaks the twelve lineages canon. Rejected by the owner.
- Flat 30% at every tier: rejected by the owner; the ask was "especially high tier".
- Relabel only, keeping filler names: hits the numbers, but "B2 Seal Warden" still reads as filler, and the MVP pool is too small unless filler is repaired.
- New roster view: more space, but duplicates a list that already has filters and a locate action.
- Do nothing: the atlas keeps showing bosses as robots.

## Assumptions
ASSUMED: targets count rows, not distinct designs — reversible: Y
ASSUMED: scope is dungeon rows; field territories and deep-slice tables follow later — reversible: Y
ASSUMED: this feature changes data only; concept art, about 8 images through ChatGPT, is the next feature — reversible: Y
ASSUMED: remaining Orc and Dark-Lunar enemies do not count toward the share, since they are playable races — reversible: Y
ASSUMED: renamed rows keep their `npc_id` — reversible: Y
ASSUMED: `scripts/run_atlas_iteration_loop.py` and `tall_dungeon_expansion.py` still hold the old names; they are not part of a build, and the gate fails if a rerun brings filler back — reversible: Y
ASSUMED: the wiki page waits, because no wiki exists on release 1.18 (`docs/wiki/` is only on unmerged `inc/wiki-*` branches); it is added when that lands — reversible: Y

## Appendix — spec review
- 2026-11-01 spec-review: lenses tech, qa, product, ux. Findings 20 raw → 10 merged (10 dropped: bad citation 0, dup 10, low-conf 0). Counts re-measured from disk because reviewers disagreed.
  Applied: scope and counts restated on dungeon rows; filler redefined by name shape; Pyraea pinned by `npc_id`; surface moved to the existing atlas list; gate moved to Gate 2; picks file as selection rule; reference-string scope; keyboard and state coverage; Furral guard; `body_kin`. Answered from disk: 2. Asked at gate: 0. Assumed: 7.
