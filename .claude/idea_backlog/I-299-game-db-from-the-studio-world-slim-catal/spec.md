---
title: "Game DB from the studio world: slim catalog, one search, record links"
id: I-299
status: idea
---

# Game DB from the studio world: slim catalog, one search, record links

Owner request, verbatim (2026-11-14): "อยากทำความสะอาดโปรเจค กับเกมDB มันน่าจะมีของไม่ใใช้เยอะมากๆ แล้วก็ ใช้ยาก"
(clean up the project and the game DB; it has a lot of unused things and is hard to use).
Owner chose the direction the same day: "สร้างใหม่จาก studio" (rebuild from the studio world).

**The owner will confirm this by** opening `http://atlas-edit.joymify.local.com/`, typing a
name such as "Hearthbloom" in the one search box from any tab, and landing on that record's
page with a list of related records, in a sidebar of at most 11 entries.

Evidence for every number below: `~/.local/state/atlas-lane/cleanup-audit-2026-11-14/audit-C-game-db-data.md`
(data) and `audit-D-game-db-usability.md` (surface).

## Goal

The owner can find any game record (continent, district, town or hunting area, map, monster,
item, quest, canon term, concept art) in two actions, type and click, and walk from it to
what it relates to. The game DB shows the authoritative studio world and is never stale.

## Non-goals

- Rewriting the explorer in a new framework, or splitting the eight 2k-4.6k-line frontend files.
- Shrinking the 5.26 MB `/api/bundle` download. Search does not depend on it; the bundle stays.
- An editing UI for tags or relations. Tags are edited in a JSON file.
- A relation graph view (slice 5, not in this spec; see Assumptions).
- Deleting `content/` files of the old concept. `server-rs` still loads
  `content/towns/town-millcross.json` (`server-rs/src/content/map.rs:5`) and gates read
  `content/spine` and `content/world`. Only what the DB and the explorer show changes.
- Indexing Asset Studio drafts. Asset Studio (separate repo) owns draft sets, compare and approve.
- Changing what the game server or Godot client load. Neither reads the DB.

## Users and jobs

One user: the owner, on a Mac or an iPad, often arriving from a link. Jobs:
1. "Where is X?" when X is known only by name, without knowing which tab holds it.
2. "What belongs to this?" for a district, town, monster or map.
3. "Is this the current world?" without meeting records of the retired concept by accident.

## Current state (measured 2026-11-14)

- `build/catalog.sqlite` is dated 2026-10-30. `ensure_catalog_db()` (`scripts/catalog_explorer_web.py:413`)
  rebuilds only when the file or the `world_continents` table is missing, so it never notices newer content.
- The DB holds the old concept: 57 rows name Undertow or Millcross. The studio world
  (3 continents, 34 districts, 129 node files, 12 maps under `content/studio/`) is not in it;
  the Studio tab reads those files through `/api/studio/perspectives`.
- 31 sidebar tabs in 8 sections. The search box filters only the open tab, for 4 tabs.
  Three separate search boxes exist. Per-record deep links exist for mobs, tiles and the Studio tab only.
- No reader was found for tables `jobs`, `skills`, `cards`, `handbook`, `races_catalog`,
  `boss_encounters`, `enchanting_rules` or views `v_world_continent_overview`,
  `v_story_region_matrix`, `v_map_world_binding` (search covered scripts/, atelier/,
  server-rs/src, game-client, contracts/src; the SQL tab can still query anything).
- 4 maps point at spine nodes that do not exist (emberdown, gildmark-head, hollowmarch, rooktide-reach).

## Approach

Add an index layer to the derived DB and one generic way to search and open records.
Keep `content/` as the only source of truth and keep the existing panels as the views.

1. **`records`**: one row per thing of any kind: `kind`, `id`, `title`, `summary`, `concept`
   (`studio` or `legacy`), `source_file`, `view_url` (the existing tab and params that show it).
2. **`links`**: `from_kind`, `from_id`, `relation`, `to_kind`, `to_id`. Built only from
   fields that already exist in content (for example `district.parent_continent_id`,
   `continent.district_ids`, node folder to district, `district.portal_edges`, `mob_drops`,
   map to node). A link is written only when both ends resolve; unresolved references are counted.
3. **`record_tags`**: `kind`, `id`, `tag`. Derived tags (kind, continent, level band, status,
   concept) plus hand tags from an optional `content/tags.json` (`{"<kind>:<id>": ["tag", ...]}`).
4. **`records_fts`**: SQLite FTS5 over title, summary and tags (FTS5 is present: SQLite 3.50.4 locally,
   `python:3.13-slim-bookworm` in `Dockerfile.atlas-web`).
5. **Explorer**: `GET /api/search?q=` and `GET /api/record?kind=&id=`, one search box that works on
   every tab, and one record page at `/?r=<kind>:<id>` showing the record, its tags, its related
   records grouped by relation, and an "Open in <tab>" link to the existing view.

### Slices (each ships by itself through psrw, in this order)

- **S1 Findable.** Freshness rule, studio ingest, `records` / `links` / `record_tags` / `records_fts`,
  the two routes, the global search box and the record page. No tab is removed. This is the walking
  skeleton: after S1 the owner's confirmation above already works.
- **S2 Navigable.** Sidebar from 31 tabs to 11 with plain labels (table below); duplicate tabs become
  sub-views; fake tabs go; the per-tab search boxes are replaced by the global one.
- **S3 Slim and correct.** Drop the unread tables and views; move legacy-concept data behind the
  Archive tab and out of default search; fix the 4 dangling map references; add the consistency gate.
- **S4 Retire finished tooling.** Remove the review inbox, asset verdicts and work-order stack, the
  unused `/api/studio/self-evaluation` route and the redirect stub.

### Sidebar after S2

| # | Entry | Replaces |
|---|---|---|
| 1 | Home (search, counts by kind) | overview |
| 2 | World | studio, world, maps, map-sheets |
| 3 | Monsters | mobs, bestiary |
| 4 | Items and cards | gear |
| 5 | Jobs and skills | jobs |
| 6 | Quests and dungeons | quests, dungeons |
| 7 | Lore and canon | lore, races, canon glossary and decisions |
| 8 | Art | concept-arts, art |
| 9 | Assets and audio | assets, audio, coverage |
| 10 | Tools | sql, combat-lab, docs, elements, siege, enchant, brushes, map-builder, forge |
| 11 | Archive (old concept) | story and its Undertow reader, legacy world data |

Removed outright: `sim` (a page that only prints a cargo command), `review` (S4).
Old `?tab=` values keep working and land on the entry that replaced them.

## Requirements

Data (S1, S3)
- R1. When the edit host starts and any file under `content/` or `contracts/content/` is newer than
  `build/catalog.sqlite`, the explorer shall rebuild the DB before serving.
- R1f. If the rebuild fails, then the explorer shall keep serving the previous DB and show a banner
  "Game DB is out of date: rebuild failed" with the builder's last error line.
- R2. When the DB is built, the builder shall write one `records` row for every studio continent,
  district, node and map file, and for every row of the kept tables.
- R2f. If a studio file cannot be parsed, then the build shall fail and name the file.
- R3. When the DB is built, the builder shall write a `links` row for each resolvable reference and
  print the count of unresolved references per relation.
- R3f. If unresolved references among studio records exceed 0, then the build shall fail and list them.
- R4. Where `content/tags.json` exists, the builder shall add its tags; if a key names a record that
  does not exist, then the build shall fail and name the key.
- R5. While the read-only release app is running, it shall never rebuild; the image build runs the
  builder (as today, `Dockerfile.atlas-web:11`).

Search and records (S1)
- R6. When the user types 2 or more characters in the global search box on any tab, the explorer
  shall show up to 20 matching records of every kind, ranked, each with kind, title and one line of summary.
- R6f. If nothing matches, then it shall show "No record matches '<query>'" and keep the current tab unchanged.
- R6g. If `/api/search` fails, then it shall show "Search is unavailable" with a Retry action.
- R7. When the user picks a result or opens `/?r=<kind>:<id>`, the explorer shall show the record
  page: title, kind, summary, tags, related records grouped by relation, and an "Open in <tab>" link.
- R7f. If the kind or id does not exist, then it shall show "No such record: <kind>:<id>" with the search box focused.
- R8. When the user presses Back from a record page, the explorer shall return to the previous tab and query.
- R9. Where a record has `concept = legacy`, search shall leave it out unless the "Include archive"
  toggle is on, and its record page shall carry an "Old concept" label.

Navigation (S2)
- R10. The sidebar shall show the 11 entries above with those labels and no table names or step numbers.
- R11. When a URL carries an old `?tab=` value, the explorer shall open the entry that replaced it.
- R11f. If the old value belonged to a removed tab (`sim`, `review`), then it shall open Home.

Slimming (S3, S4)
- R12. The builder shall no longer create the unread tables and views listed in Current state,
  after one more whole-repo search (including docs/, tools/, .github/) confirms no reader.
- R13. The 4 dangling `maps.spine_node_id` values shall be corrected in their source files or set to null.
- R14. The review inbox, verdict and work-order code, their routes and `/api/studio/self-evaluation`
  shall be removed; `content/review-queue.json` (6 proposals, 0 verdicts) is archived under `docs/archive/`.

## Acceptance criteria

- [ ] A1 (R1): touch a file under `content/studio/`, start the edit host, `build/catalog.sqlite` mtime is newer than that file.
- [ ] A2 (R1f): make the builder exit 1 (env `CATALOG_BUILD_FAIL=1` honoured only by the test), start the host, `/` returns 200 and contains the banner text.
- [ ] A3 (R2): `select count(*) from records where kind='continent' and concept='studio'` = 3; `kind='district'` = 34; node count equals `find content/studio/nodes -name '*.json' | wc -l` (129 today).
- [ ] A4 (R3, R3f): every district has a `links` row to its continent (34 rows); a fixture district with a bad `parent_continent_id` makes the build exit non-zero and print its id.
- [ ] A5 (R4): a `content/tags.json` with one valid key adds one `record_tags` row; an unknown key fails the build and prints the key.
- [ ] A6 (R6): `GET /api/search?q=hearthbloom` returns the continent `continent-01-hearthbloom-basin` first; with 1 character it returns an empty list and status 200.
- [ ] A7 (R6f, R6g): the two messages appear (browser test with a real typed query and a blocked route).
- [ ] A8 (R7, R7f): `/?r=district:<id of Amber Root Hollows>` shows its continent under "Part of" and its nodes under "Contains"; `/?r=district:nope` shows the not-found text.
- [ ] A9 (R8): type, click a result, press the browser Back button: the previous tab and query are restored (real click, real Back).
- [ ] A10 (R9): a Millcross record is absent from default search results and present with the toggle on.
- [ ] A11 (R10, R11): the sidebar has exactly 11 entries; `/?tab=bestiary`, `/?tab=maps` and `/?tab=sim` open Monsters, World and Home.
- [ ] A12 (R12, R13): the dropped tables and views are absent from `sqlite_master`; `select count(*) from maps m left join spine_nodes s on s.id=m.spine_node_id where m.spine_node_id is not null and s.id is null` = 0.
- [ ] A13 (R14): `git grep -n "review-queue\|self-evaluation" -- scripts atelier` returns nothing outside tests that assert the removal.
- [ ] A14: phone (390x844) and desktop (1280x800) screenshots of Home, a search result list and a record page, taken with `ui-visual-verify`, looked at, and shown to the owner on the edit host with a direct link.

**End-to-end verification:** `node --test scripts/tests/catalog-records.test.mjs` (builds the DB into a
temp dir and asserts A3-A6, A10, A12) passes, and `./scripts/precheck.sh` (Gate 1) passes.

## UI state matrix

| Screen | Ideal | Empty | Loading | Partial | Error |
|---|---|---|---|---|---|
| Global search | up to 20 ranked results, kind badge, title, summary line | "No record matches '<query>'" | results area shows "Searching..." after 150 ms | fewer than 20: no "more" control | "Search is unavailable" + Retry |
| Record page | title, tags, related groups, "Open in <tab>" | record with no links: "Nothing is linked to this yet" | skeleton title line | missing summary: title and tags only | "No such record: <kind>:<id>" + focused search |
| Home | search box, count per kind, each count links to its entry | n/a (DB always has records) | counts show "..." | n/a | DB out-of-date banner (R1f) |

Entry: the search box (and Cmd/Ctrl+K, which exists today) from every tab; a `/?r=` link from anywhere.
Exit: Back, "Open in <tab>", or a related record. Focus order: search box, results (arrow keys, Enter opens), then page content.

## Interfaces and files

- `scripts/build_catalog_db.py`: new final pass that fills `records`, `links`, `record_tags`, `records_fts`; studio ingest; S3 removes dead `CREATE TABLE` / `INSERT` / view blocks.
- `scripts/catalog_explorer_web.py`: freshness check in `ensure_catalog_db()` (:413), `/api/search`, `/api/record`; S4 removes `/api/studio/self-evaluation` (:895) and `compute_studio_self_evaluation` (:53).
- `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js`: `NAV_GROUPS` (:135-215), URL state (:519-536), search wiring; `01_shell_and_styles.html` search box.
- New: `scripts/tests/catalog-records.test.mjs`; optional `content/tags.json`.
- S4: `atelier/atlas-world-panels/js/review/*`, `panels/review-verdicts.mjs`, `view/VerdictSync.mjs`, `forge/work-orders.mjs`, `scripts/atlas_world_web/review_queue.py`, the review-queue routes in `routes.py`.
- Parity gates that will need updating in the same slices: `atelier/atlas-world-panels/tests/panel-parity.test.mjs`, `tests/maps-index.test.mjs`, `scripts/tests/catalog-canon.test.mjs`.

## Alternatives considered

- **Do nothing.** The DB stays two weeks stale, shows the retired world and cannot be searched across kinds.
- **Rewrite the explorer as a new app.** Cleanest result, but it discards 31,638 lines of working panels to fix what is mainly a findability and data-currency problem. Months, not slices.
- **Move game data into Asset Studio**, which already has full-text search, tags and links. One tool instead of two, but its model is asset library entries, the content build pipeline and gates live in this repo, and it would couple two repos for every content change. Worth revisiting once S1-S3 show what the record model needs.
- **Client-side search over the 5.26 MB bundle.** No server change, but it keeps the heavy download as a requirement and cannot rank. FTS5 is already available.

## Assumptions

- ASSUMED: old-concept data (Undertow / Millcross, the 13-continent `world_*` rows, `story_nodes`) is kept and moved behind one Archive tab, out of default search. Not deleted. — reversible: Y
- ASSUMED: of the one-off tooling, only the review inbox / verdicts / work orders are removed (S4). Map Builder and Art Forge stay, under Tools. — reversible: Y (git revert)
- ASSUMED: the relation graph view from the owner's 2026-11-01 wish is a later slice; v1 gives the related-records list on each record page. — reversible: Y
- ASSUMED: hand tags live in one file, `content/tags.json`; there is no tag editing UI. — reversible: Y
- ASSUMED: relations come only from fields already present in content; no hand-authored relation file in v1. — reversible: Y
- ASSUMED: the DB keeps its name and path (`build/catalog.sqlite`) and stays a derived, untracked file. — reversible: Y
- ASSUMED: the 6 proposals in `content/review-queue.json` are no longer wanted and are archived, not acted on. — reversible: Y
- ASSUMED: UX answers, since the repo has no `DESIGN.md` / `PRODUCT.md`: one user (the owner), Mac and iPad, the feeling to give is "a wiki I can search", nothing in the existing panels' look changes in S1. Those two files are drafted in S2, where the sidebar is redesigned. — reversible: Y
- ASSUMED: dropping the unread tables does not touch their source JSON, which the server and client load. — reversible: Y
