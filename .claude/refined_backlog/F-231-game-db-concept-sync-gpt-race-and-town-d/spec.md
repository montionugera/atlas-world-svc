---
title: "Game DB concept sync: GPT race and town discussions into canon records (log in repo, 6 races, 6 home towns, 18 town NPCs)"
id: F-231
status: refined
from_idea: I-316
---

# Game DB concept sync: GPT race and town discussions into canon records

Owner request, verbatim (2026-11-17): "Want to improve Game DB ; Now we have a lot of discussion on Game Race
and town with GPT ; want to update into our game DB so we organize game concept better ; and can continue on
fill the the missing gap like Map Zone , Area , การเดินทาง สภาพอากาศ ภูมิศาสตร์ ให้รู้สึกต่อเนื่อง สวยงาม ดูน่าค้นหา".
This feature is the first half (sync what was discussed). The geography fill is a later feature.

**The owner will confirm this by** opening `http://atlas-edit.joymify.local.com/`, typing "Torren" or
"Ondo Kiln" in the search box, and landing on a record that shows the town, its race, its three NPCs and
whether each fact is canon, chosen or only proposed.

## Problem

- The ChatGPT project chats of 2026-11-07..09 hold the race and town concept. The old log
  (`~/.local/state/atlas-lane/lore-discussion.md`) squeezed the "NPC for each town" thread into five lines.
- `content/studio/canon/glossary.json` holds the Maro Bell cast and 6 travellers only. Missing: the 12
  NPCs of the other five towns, a tagline / role / look per town, a motive hook per race, and the world
  model the owner chose (one main continent in three terrain groups, travel layers, walk-time targets).
- `canon_rows()` in `scripts/build_catalog_db.py` emits npc rows for travellers only, so even the Maro Bell
  cast is not a searchable record.
- The glossary's 9 `regions` mix chapter regions, kiln sites and a hub with no field telling them apart.

## Source

Extraction with file:line sources and a status per item:
`~/.local/state/atlas-lane/gpt-capture-2026-11-18/extract.json` (races 31, towns 43, npcs 21, geography 18,
open questions 11), made from three saved transcripts in the same folder. The raw transcripts are NOT
committed: this repo is public and they are the owner's private chats.

## Sketch (frozen data contract)

All in `content/studio/canon/glossary.json`. Every new object carries `status` and `source`.
`status`: `canon` (already locked in the glossary), `chosen` (the owner chose it in chat but said "not
locking Canon"; extract status `owner_locked`), `proposed` (extract `agent_agreed` or `proposal`).

- `races[]` gains `hook: {motive, problem, resolve_chapters[], keepsake, status, source}` and, where the
  transcripts state one, `prologue: {time_wound, small_job, invitation, status, source}`.
- new `towns[]`: `{id, name, race, tagline, tagline_thai, role, economy, look, landmark, terrain_group,
  studio_node_id, status, source}` for the six home towns and Kilnwatch Bastion. `studio_node_id` is the
  existing `content/studio/nodes/**/town-*.json` id from `race_taxonomy.home_town_id`, or null. Fields the
  transcripts do not state are omitted, never invented.
- `npcs.town.<town_id>[]` for the five other towns: `{name, role, age, gender, personality, want, secret,
  voice, status: "proposed", source}`; unknown values are null. Retired names stay retired (Lasse, Sarn, Isil).
- `regions[]` gains `kind`: `chapter_region` | `kiln_site` | `hub`, plus `chapter` and `terrain_group` where stated.
- new `world_model.rules[]`: `{id, topic, text, status, source}` for the geography and travel statements.
- The 11 open questions go to `content/studio/canon/decisions.json` using a status its gate already allows.

Derived: `canon_rows()` emits `town`, all town `npc` rows (parent = town name) and `world_rule` rows;
`scripts/atlas_world_web/catalog_index.py` adds links race -> home town, npc -> town, town -> studio node;
`scripts/canon_card.mjs` prints the towns and casts and `canon-card.md` is regenerated.

## Non-goals

- Renaming studio nodes or race keys (I-264). This feature only links canon towns to studio nodes.
- Filling zones, weather, climate, travel times (next feature; needs the owner's world-skeleton decision).
- Any explorer UI change. Records appear through the existing search and record page.
- Uploading the new canon card to ChatGPT Sources.

## Acceptance criteria

- [ ] `glossary.json` has 7 `towns`, each with `status` and `source`; the six home towns resolve `race` to a `races[].id`.
- [ ] `npcs.town` has six towns with at least 3 NPCs each (18+), every non-Maro one `status: "proposed"`.
- [ ] All six races have `hook.motive`; all 9 regions have `kind`.
- [ ] `world_model.rules` has at least 10 entries, each with `status` in {canon, chosen, proposed} and a `source`.
- [ ] After `python3 scripts/build_catalog_db.py`, `GET /api/search?q=Torren` and `?q=Ondo Kiln` each return a record, and the Ondo Kiln record lists its race and its NPCs as relations.
- [ ] `node scripts/check_canon_names.mjs` passes; a name it rejects is reported, not silently renamed.
- [ ] A test fails if a town NPC is removed from the glossary but still expected as a record (the row emission is covered, not only counted).
- [ ] `./scripts/precheck.sh --no-install` is green.
