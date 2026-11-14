---
title: "Game DB from the studio world: slim catalog, one search, record links"
id: F-216
status: refined
from_idea: I-299
---

# Game DB from the studio world: slim catalog, one search, record links

Owner request, verbatim (2026-11-14): "อยากทำความสะอาดโปรเจค กับเกมDB มันน่าจะมีของไม่ใใช้เยอะมากๆ แล้วก็ ใช้ยาก"
(clean up the project and the game DB; it has a lot of unused things and is hard to use).
Owner chose the direction the same day: "สร้างใหม่จาก studio" (rebuild from the studio world).

**The owner will confirm this by** opening `http://atlas-edit.joymify.local.com/`, typing a
name such as "Hearthbloom" in the one search box from any tab (on a Mac or a phone), and
landing on that record's page with a list of related records, in a sidebar of at most 11 entries.

Evidence: `~/.local/state/atlas-lane/cleanup-audit-2026-11-14/audit-C-game-db-data.md` (data),
`audit-D-game-db-usability.md` (surface), `review-I-299-spec.md` (four-lens review, 2026-11-14;
its findings F1-F10 are folded in below and the six factual ones were re-checked against the code).

## Goal

The owner can find any game record (continent, district, town or hunting area, map, monster,
item, quest, canon term, concept art) in two actions, type and click, and walk from it to
what it relates to. The game DB shows the authoritative studio world and is never stale.

## Non-goals

- Rewriting the explorer in a new framework, or splitting the eight 2k-4.6k-line frontend files.
- Shrinking the 5.26 MB `/api/bundle` download. Search does not depend on it; the bundle stays.
- An editing UI for tags or relations. Tags are edited in a JSON file.
- A relation graph view (a later slice; see Assumptions).
- Deleting `content/` files of the old concept. `server-rs` still loads
  `content/towns/town-millcross.json` (`server-rs/src/content/map.rs:5`) and gates read
  `content/spine` and `content/world`. Only what the DB and the explorer show changes.
- Indexing Asset Studio drafts. Asset Studio (separate repo) owns draft sets, compare and approve.
- Changing what the game server or Godot client load. Neither reads the DB.
- The Studio tab's own map command bar (`#atlasOmniSearchInput`). It stays; two Gate 1 probes assert it.

## Users and jobs

One user: the owner, on a Mac, an iPad or a phone, often arriving from a link. Jobs:
1. "Where is X?" when X is known only by name, without knowing which tab holds it.
2. "What belongs to this?" for a district, town, monster or map.
3. "Is this the current world?" without meeting records of the retired concept by accident.

## Current state (measured 2026-11-14)

- `build/catalog.sqlite` is dated 2026-10-30. `ensure_catalog_db()` (`scripts/catalog_explorer_web.py:413`)
  rebuilds only when the file or the `world_continents` table is missing, so it never notices newer content.
- `scripts/build_catalog_db.py:39,91-92` hardcodes the DB path and deletes the existing DB before it
  reads any input, so a failed build leaves no DB at all.
- The DB holds the old concept: 57 rows name Undertow or Millcross. The studio world is not in it:
  3 continents, 34 districts and 129 node files under `content/studio/` (node types: town,
  hunting_area, dungeon; every node carries `parent_district_id`), 12 map plates (`.png`) under
  `content/studio/maps/`, and 97 playable maps listed in `content/maps/_manifest.runtime.json`
  (`playableMaps[].mapId / nodeId / districtId / continentId`). 97 of the 129 nodes carry a `map_id`
  and all 97 resolve in that manifest. The Studio tab reads these files through `/api/studio/perspectives`.
- The 45 map files `content/maps/*.json` bind to the older 13-continent world (`c01..c13`); none is a
  studio playable map. The server loads two of them at runtime (`freja-south-gate`, `maro-bell`).
- 31 sidebar tabs in 8 sections. The search box (`#globalSearch`) sits inside the sidebar, which is
  off-screen on a phone, and filters only the open tab, for 4 tabs. Per-record deep links exist for
  mobs, tiles and the Studio tab only.
- 4 maps carry a `spineNodeId` that does not exist. The ids are hardcoded in
  `scripts/compile_world_maps.py:384,460,536,612`, which generates those map files and hashes the id into the map seed.

## Approach

Add an index layer to the derived DB and one generic way to search and open records.
Keep `content/` as the only source of truth and keep the existing panels as the views.

1. **`records`**, primary key `(kind, id)`: `kind`, `id`, `title`, `summary`, `concept`, `source_file`, `view_url`.
   - Kinds: `continent`, `district`, `node`, `studio_map`, `map_plate`, `map`, `mob`, `bestiary`, `item`,
     `card`, `job`, `skill`, `quest`, `dungeon`, `race`, `canon`, `decision`, `concept_art`, and for the
     old concept `legacy_continent`, `place`, `zone`, `spine_node`, `story`.
   - `concept = 'studio'` for everything under `content/studio/**`, the 97 playable maps, the
     `contracts/content/*.json` catalogs (items, cards, jobs, skills, mobs, quests), canon and concept art.
     `concept = 'legacy'` for rows of `world_continents`, `world_places`, `world_zones`, `world_dungeons`,
     `spine_nodes`, `story_nodes` and `world_bestiary`. The 45 `content/maps/*.json` files are `studio`
     with the tag `unbound-to-studio-world` (owner decision below).
2. **`links`**: `from_kind`, `from_id`, `relation`, `to_kind`, `to_id`, built only from fields that exist:

   | Relation label (shown on the page) | Source field |
   |---|---|
   | Part of / Contains | `district.parent_continent_id`; `node.parent_district_id`; `playableMaps[].nodeId` |
   | Connects to | `district.portal_edges` |
   | Map | `node.map_id` to a `studio_map` record |
   | Drops / Dropped by | `mob_drops` |

   A link is written only when both ends resolve. Unresolved references are counted per relation.
3. **`record_tags`**: `kind`, `id`, `tag`. Derived tags (kind, node type, continent, level band, status,
   concept) plus hand tags from an optional `content/tags.json` (`{"<kind>:<id>": ["tag", ...]}`).
4. **`records_fts`**: SQLite FTS5 over title, summary and tags (present: SQLite 3.50.4 locally,
   `python:3.13-slim-bookworm` in `Dockerfile.atlas-web`).
5. **Routes** (read-only, also served by the release app):
   - `GET /api/search?q=<text>&include_archive=0|1` returns 200
     `{"ok":true,"results":[{"kind","id","title","summary","concept","viewUrl"}]}`, at most 20, ranked.
   - `GET /api/record?kind=<k>&id=<id>` returns 200
     `{"ok":true,"record":{...},"tags":[...],"relations":[{"label","items":[{"kind","id","title"}]}]}`
     or 404 `{"ok":false,"error":"No such record: <kind>:<id>"}`.
6. **UI**: the search box and an "Include archive" checkbox live in the top bar (`<header class="topbar">`),
   visible at 390 px without opening the nav drawer. Results show in a popover anchored to the box
   (Escape or an outside click closes it; the current tab stays mounted). A record opens at `/?r=<kind>:<id>`
   through the existing URL-state code (`writeUrlState` / `syncUrlState`, `02_state_and_composable_layers.js:519-605`)
   with `history.pushState`, so Back restores the previous tab and query.

### Slices (each ships by itself through psrw, in this order)

- **S1 Findable.** Safe, fresh builds (R1), studio ingest, `records` / `links` / `record_tags` / `records_fts`,
  the two routes, the top-bar search and the record page. No tab is removed. This is the walking skeleton:
  after S1 the owner's confirmation above already works.
- **S2 Navigable.** Sidebar from 31 tabs to 11 with plain labels (table below); merged tabs become
  sub-view pills; the fake tab goes; the concept-art tab's own search box is replaced by the global one.
- **S3 Slim and correct.** Drop the dead tables and views; move old-concept data behind the Archive
  entry and out of default search; fix the 4 dangling map references; add the consistency checks to the gate.
- **S4 Retire finished tooling.** Remove the review inbox, asset verdicts and work orders, and the
  unused `GET /api/studio/self-evaluation` route.

### Sidebar after S2

| # | Entry | Sub-views (old tab ids) |
|---|---|---|
| 1 | Home (search, counts by kind) | replaces overview |
| 2 | World | studio, world, maps, map-sheets |
| 3 | Monsters | mobs, bestiary |
| 4 | Items and cards | gear |
| 5 | Jobs and skills | jobs |
| 6 | Quests and dungeons | quests, dungeons |
| 7 | Lore and canon | lore, races |
| 8 | Art | concept-arts, art |
| 9 | Assets and audio | assets, audio, coverage |
| 10 | Tools | sql, combat-lab, docs, elements, siege, enchant, brushes, map-builder, forge |
| 11 | Archive (old concept) | story (with its Undertow reader), legacy world data |

Removed outright: `sim` (a page that only prints a cargo command) in S2, `review` in S4.

## Requirements

Data (S1)
- R1. When the edit host starts and `scripts/build_catalog_db.py` or any file under `content/` or
  `contracts/content/` is newer than the DB, the explorer shall rebuild the DB before serving.
- R1a. The builder shall honour `ATLAS_CATALOG_DB` (output path), build into `<path>.tmp` and replace
  the DB only when the build exits 0.
- R1f. If a rebuild fails, then the explorer shall keep serving the previous DB, and `GET /` shall
  return 200 with the banner "Game DB is out of date: rebuild failed" and the builder's last error line.
- R2. When the DB is built, the builder shall write one `records` row for every studio continent,
  district and node JSON file, every playable map in `content/maps/_manifest.runtime.json`, every
  `.png` plate in `content/studio/maps/`, and every row of the kept tables.
- R2f. If a studio JSON file cannot be parsed, then the build shall fail and name the file.
- R3. When the DB is built, the builder shall write the `links` rows of the table above and print
  the count of unresolved references per relation.
- R3f. If any reference between two `concept = 'studio'` records is unresolved, then the build shall
  fail and list each one as `<kind>:<id> -> <relation> -> <target id>`.
- R4. Where `content/tags.json` exists, the builder shall add its tags.
- R4f. If a key in `content/tags.json` names a record that does not exist, then the build shall fail and name the key.
- R5. While the read-only release app is running, it shall never rebuild; the image build runs the
  builder (as today, `Dockerfile.atlas-web:11`).

Search and records (S1)
- R6. When the user types 2 or more characters in the top-bar search box on any tab, the explorer
  shall show up to 20 matching records of every kind, ranked, each with kind, title and one line of summary.
- R6f. If nothing matches, then it shall show "No record matches '<query>'" and leave the current tab unchanged.
- R6g. If `/api/search` fails, then it shall show "Search is unavailable" with a Retry action.
- R7. When the user picks a result or opens `/?r=<kind>:<id>`, the explorer shall show the record
  page: title, kind, summary, tags, related records grouped by relation label, and an "Open in <entry>" link.
- R7f. If the kind or id does not exist, then it shall show "No such record: <kind>:<id>" with the search box focused.
- R8. When the user presses the browser Back button on a record page, the explorer shall return to the previous tab and query.
- R9. Where a record has `concept = 'legacy'`, search shall leave it out unless "Include archive" is
  checked, and its record page shall carry the label "Old concept".

Navigation (S2)
- R10. The sidebar shall show the 11 entries above with those labels and no table names or step numbers.
- R10a. Where an entry has more than one sub-view, the sub-view bar (`#subViewBar`) shall show one pill per sub-view.
- R11. When a URL carries an old `?tab=<id>` value, or the user follows an "Open in <entry>" link, the
  explorer shall open the entry that holds that sub-view with that sub-view selected.
- R11f. If the old value belonged to a removed tab (`sim`, later `review`), then it shall open Home.

Slimming (S3, S4)
- R12. The builder shall stop creating each of these once the plan shows it has no reader, where a
  reader includes `build_full_bundle()` (`catalog_explorer_web.py:628`) feeding a kept sub-view:
  tables `handbook`, `boss_encounters`, `enchanting_rules`, `races_catalog`; views
  `v_world_continent_overview`, `v_story_region_matrix`, `v_map_world_binding`. Known readers to
  change in the same slice: `scripts/run_world_pipeline.py:259,268-270` and the SQL preset buttons at
  `frontend/08_catalog_and_3d_modal_views.js:2660-2667`. Tables `jobs`, `skills` and `cards` stay
  (the kept views `v_asset_studio_entries` and `v_job_progression` read them).
- R13. The 4 dangling `spineNodeId` values in `scripts/compile_world_maps.py:384,460,536,612` shall be
  set to existing `content/spine` node ids, or to null where no node fits, and the 4 map files
  re-emitted by that script so `python3 scripts/compile_world_maps.py --check` passes.
- R14. The review inbox, asset verdicts and work orders shall be removed: sidebar `review`,
  `panels/review-verdicts.mjs`, `view/VerdictSync.mjs`, `js/review/*`, `forge/work-orders.mjs` and its
  use in `forge/forge.mjs`, `scripts/atlas_world_web/review_queue.py`, the review-queue POST routes.
  The Art Forge tab stays as a read-only viewer of runs and briefs. `content/review-queue.json`
  (6 proposals, 0 verdicts) moves to `docs/archive/`.
- R15. The `GET /api/studio/self-evaluation` route (`catalog_explorer_web.py:895-898`) shall be removed.
  `compute_studio_self_evaluation()` stays: `/api/studio/perspectives` calls it (`:213`).

## Acceptance criteria

- [ ] A1 (R1): touch a file under `content/studio/`, start the edit host, the DB mtime is newer than that file.
- [ ] A2 (R1a, R1f): with a builder forced to exit 1 by a test-only env flag, the previous DB file is byte-identical afterwards, `GET /` returns 200 and contains the banner text.
- [ ] A3 (R2): `select count(*) from records where concept='studio' and kind=?` gives continent 3, district 34, node 129, studio_map 97, map_plate 12 (each equals the file or manifest count at build time).
- [ ] A4 (R3, R3f): 34 `district -> Part of -> continent` links, 129 `node -> Part of -> district` links, 97 `node -> Map -> studio_map` links; a fixture district with a bad `parent_continent_id` makes the build exit non-zero and print `district:<id> -> Part of -> <bad id>`.
- [ ] A5 (R4, R4f): a `content/tags.json` with one valid key adds one `record_tags` row; an unknown key fails the build and prints the key.
- [ ] A6 (R6): `GET /api/search?q=hearthbloom` returns `continent:continent-01-hearthbloom-basin` first; `q=h` returns 200 with an empty list.
- [ ] A7 (R6f, R6g): the two messages appear in the popover (browser test: a real typed query that matches nothing, then the route blocked).
- [ ] A8 (R7, R7f): `/?r=district:district-amber-root-hollows` shows `continent-01-hearthbloom-basin` under "Part of" and its nodes under "Contains"; `/?r=district:nope` shows "No such record: district:nope".
- [ ] A9 (R8): type, click a result, press the browser Back button: the previous tab and query are restored (real click, real Back, on desktop and at 390 px).
- [ ] A10 (R9): `GET /api/search?q=millcross` returns no `concept='legacy'` record; with `include_archive=1` it returns at least one.
- [ ] A11 (R10, R10a, R11): the sidebar has exactly 11 entries; `/?tab=bestiary` opens Monsters with the bestiary pill selected, `/?tab=map-sheets` opens World with map-sheets selected, `/?tab=sim` opens Home.
- [ ] A12 (R12, R13): each dropped table and view is absent from `sqlite_master`; `compile_world_maps.py --check` passes; `select count(*) from maps m left join spine_nodes s on s.id=m.spine_node_id where m.spine_node_id is not null and s.id is null` = 0.
- [ ] A13 (R14, R15): `git grep -n "review-queue\|work-orders\|/api/studio/self-evaluation" -- scripts atelier` returns nothing; `GET /api/studio/perspectives` still returns 200.
- [ ] A14: the top-bar search box is visible and usable at 390x844 without opening the nav drawer; phone and desktop (1280x800) screenshots of Home, a result popover and a record page are taken with `ui-visual-verify`, looked at, and shown to the owner with a direct link on the edit host.
- [ ] A15: Gate 1 (`./scripts/precheck.sh`) passes after each slice, including `atlas_phone_touch_audit.mjs` (B1, B2) and `atlas_ux_probe.py`.

**End-to-end verification:** `node --test scripts/tests/catalog-records.test.mjs` builds the DB into a
temp path through `ATLAS_CATALOG_DB`, starts the explorer on it (same `startServer` pattern as
`scripts/tests/atlas-web-read-only.test.mjs`) and asserts A2-A6, A10 and A12. A7-A9, A11 and A14 are
checked in a real browser. Gate 1 passes.

## UI state matrix

| Screen | Ideal | Empty | Loading | Partial | Error |
|---|---|---|---|---|---|
| Search popover | up to 20 ranked results: kind badge, title, summary line | "No record matches '<query>'" | "Searching..." after 150 ms | fewer than 20: no "more" control | "Search is unavailable" + Retry |
| Record page | title, tags, relation groups, "Open in <entry>" | no links: "Nothing is linked to this yet" | skeleton title line | no summary: title and tags only | "No such record: <kind>:<id>" + focused search |
| Home | search box, count per kind, each count opens its entry | n/a (the DB always has records) | counts show "..." | n/a | "Game DB is out of date: rebuild failed" banner |

Entry: the top-bar search box (and Cmd/Ctrl+K, which exists today) from every tab; a `/?r=` link from anywhere.
Exit: Back, "Open in <entry>", or a related record.
Focus order: search box, "Include archive" checkbox, results (arrow keys move, Enter opens, Escape closes), then page content.

## Interfaces and files

- `scripts/build_catalog_db.py`: `ATLAS_CATALOG_DB`, temp-then-replace, studio ingest, a final pass filling `records`, `links`, `record_tags`, `records_fts`; S3 removes dead `CREATE TABLE` / `INSERT` / view blocks.
- `scripts/catalog_explorer_web.py`: freshness and failure state in `ensure_catalog_db()` (:413), banner on `/` (:828), `/api/search`, `/api/record`; S4 removes the route at :895-898.
- `scripts/atlas_world_web/frontend/01_shell_and_styles.html` (search box moves from the sidebar, :2511, to the top bar), `02_state_and_composable_layers.js` (`NAV_GROUPS` :135-215, `ATLAS_SUBVIEWS` :130, URL state :519-605).
- S3: `scripts/compile_world_maps.py`, the 4 map files it emits, `scripts/run_world_pipeline.py`, `frontend/08_catalog_and_3d_modal_views.js:2660-2667`.
- S4: the files named in R14.
- New: `scripts/tests/catalog-records.test.mjs`; optional `content/tags.json`.
- Existing checks that each slice must keep green or update with the change: `atelier/atlas-world-panels/tests/panel-parity.test.mjs` (maps 9 panels to tab ids), `tests/smoke/scenarios.mjs` (calls `switchTab('gear')`), `scripts/probes/atlas_phone_touch_audit.mjs`, `scripts/probes/atlas_ux_probe.py`, `scripts/tests/catalog-canon.test.mjs`, `scripts/tests/atlas-web-read-only.test.mjs`, `tests/test_studio_web_perspectives.py`, and in S4 every test that names `review-queue` (listed by `git grep -ln "review-queue" -- scripts atelier tests` in the plan).

## Alternatives considered

- **Do nothing.** The DB stays two weeks stale, shows the retired world and cannot be searched across kinds.
- **Rewrite the explorer as a new app.** Cleanest result, but it discards 31,638 lines of working panels to fix what is mainly a findability and data-currency problem. Months, not slices.
- **Move game data into Asset Studio**, which already has full-text search, tags and links. One tool instead of two, but its model is asset library entries, the content build pipeline and gates live in this repo, and it would couple two repos for every content change. Worth revisiting once S1-S3 show what the record model needs.
- **Client-side search over the 5.26 MB bundle.** No server change, but it keeps the heavy download as a requirement and cannot rank. FTS5 is already available.

## Decisions (owner, 2026-11-15)

- Spec approved as recommended, all four slices and every assumption below.
- The 45 runtime map files in `content/maps/*.json` are indexed as kind `map` with `concept = 'studio'`
  and the derived tag `unbound-to-studio-world`, and are shown under World (they are what the game runs today).
- Work orders are removed together with the review inbox and verdicts in S4 (R14); Art Forge becomes a read-only viewer.

## Assumptions

- ASSUMED: old-concept data (Undertow / Millcross, the 13-continent `world_*` rows, `story_nodes`, `world_bestiary`) is kept and moved behind one Archive entry, out of default search. Not deleted. — reversible: Y
- ASSUMED: Map Builder stays, under Tools. — reversible: Y
- ASSUMED: the relation graph view from the owner's 2026-11-01 wish is a later slice; v1 gives the related-records list on each record page. — reversible: Y
- ASSUMED: hand tags live in one file, `content/tags.json`; there is no tag editing UI. — reversible: Y
- ASSUMED: relations come only from fields already present in content; no hand-authored relation file in v1. — reversible: Y
- ASSUMED: the DB keeps its name and default path (`build/catalog.sqlite`) and stays a derived, untracked file. — reversible: Y
- ASSUMED: the 6 proposals in `content/review-queue.json` are no longer wanted and are archived, not acted on. — reversible: Y
- ASSUMED: UX answers, since the repo has no `DESIGN.md` / `PRODUCT.md`: one user (the owner), Mac, iPad and phone, the feeling to give is "a wiki I can search", nothing in the existing panels' look changes in S1. Those two files are drafted in S2, where the sidebar is redesigned. — reversible: Y
- ASSUMED: dropping DB tables never touches their source JSON, which the server and client load. — reversible: Y
- ASSUMED: `world_bestiary` (116 rows, 19 of them Millcross) is treated as old concept as a whole until a studio bestiary exists; the 4 `mobs` rows from `contracts/content` are `studio`. — reversible: Y
