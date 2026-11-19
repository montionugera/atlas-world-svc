# Step 4 gameplay roles: record district roles and dungeon verdicts as proposed, show them on the record map

## Goal

The owner's frame for building the world is: lore -> natural geography -> civilization -> **gameplay needs** -> final
map, and "Living World, not linear level zones" (every region keeps a reason to return). Steps 1-3 are in the data
(F-231, F-233, F-235). This feature records step 4 for the starter continent as **proposed** data, so the plan is
visible in the Atlas web app and later work (portal rewires, retunes, the painted map) is checked against one source
instead of a chat transcript.

On 2026-11-19 the owner delegated the nine template-dungeon verdicts to GPT "with emphasis on game balance". The
values below are that verdict, filtered: landmark descriptions GPT invented are NOT used (districts already have
`geography.far_landmark`).

Nothing playable changes here: no `level_range`, spawn, portal or map edit. Proposed level bands are recorded next to
the current ones, not applied.

## Data

### R1. `gameplay_role` on the nine continent-01 dungeon node files

```json
"gameplay_role": {
  "verdict": "story_dungeon | optional_instance | open_activity",
  "chapter": "ch0 | ch1 | ch2 | null",
  "proposed_level_band": [13, 15],
  "party_size": [1, 4],
  "session_minutes": [15, 20],
  "rewards": "short text",
  "balance_reason": "short text",
  "boss_site_note": "short text or null",
  "status": "proposed",
  "source": "GPT balance verdict v2, 2026-11-19, delegated by owner"
}
```

| Node | verdict | chapter | proposed band | party | minutes | rewards | balance reason |
|---|---|---|---|---|---|---|---|
| `dungeon-kiln-cellar` | story_dungeon | ch0 | 13-15 | 1-4 | 15-20 | Title, lantern cosmetic, recipes | First shared dungeon; teaches cooperation without compulsory grouping |
| `dungeon-medallion-heart-vault` | optional_instance | null | 12-15 | 2-4 | 12-18 | Decoration, Spellglaze recipes | Alternative to Maro farming; no superior equipment rewards |
| `dungeon-teapot-steam-cistern` | open_activity | null | 14-18 | 1-3 | 8-12 | Herbs, bathhouse cosmetics | Repeatable shared content without a third competing low-level instance |
| `dungeon-spice-kiln-cellar` | story_dungeon | ch2 | 28-32 | 1-5 | 20-30 | Memory-themed title, festival cosmetic | Chapter II cannot climax at beginner levels |
| `dungeon-sap-heart-cistern` | story_dungeon | ch1 | 20-25 | 1-5 | 20-30 | Crafting recipes, story title | Appropriate Chapter I climax |
| `dungeon-ember-bellows-chamber` | optional_instance | null | 16-20 | 2-5 | 15-22 | Defensive crafting recipes, cosmetic | Mid-band cooperative combat without competing with the Chapter I boss |
| `dungeon-sunken-potter-hold` | open_activity | null | 19-23 | 1-4 | 10-15 | Trade materials, collection rewards | Supports the river economy without instance fragmentation |
| `dungeon-nectar-glaze-vat` | open_activity | null | 20-25 | 1-3 | 8-12 | Food and consumable recipes | Farming alternative without duplicating dungeon progression |
| `dungeon-ceramic-resonator-crypt` | open_activity | null | 19-25 | 1-4 | 10-15 | Exploration title, lore collectibles | Keeps Silme relevant without bringing its later chapter boss forward |

`boss_site_note` for the three story dungeons (null for the rest):
- kiln-cellar: "Approach / investigation area. The Bellkeeper climax belongs at the Great Bell, not in the cellar."
- sap-heart-cistern: "Access route or preliminary encounter. The Brass Castellan arena belongs at the Still Kiln."
- spice-kiln-cellar: "Investigation or entry. The Jubilant Collector climax belongs at a remembrance-festival / Remembrance Kiln site."

### R2. `geography.gameplay` on the 11 continent-01 district files

```json
"gameplay": {
  "new_player": "short text",
  "veteran_return": "short text",
  "party_content": "short text",
  "cross_race_reason": "short text",
  "party_hub_role": "find_party | learn_party | crossroads | coordinated_combat | null",
  "status": "proposed"
}
```

Text per district is in "District table" at the end of this spec. `party_hub_role`: Kilnfire Terraces `find_party`,
Teacup Meadows `learn_party`, Ginger-Steam Terraces `crossroads`, Amber-Root Hollows and Ash-Bellows Trench
`coordinated_combat`, all others null.

### R3. Validator rule GEO-12 (`scripts/validate_studio_hierarchy.py`, tests in `tests/test_validate_studio_hierarchy.py`)

- Every continent-01 node whose id starts with `dungeon-` has `gameplay_role` with a `verdict` from the three allowed values, a 2-element `proposed_level_band` with min <= max, and `status` in `proposed | decided | applied`.
- A `story_dungeon` has a non-null `chapter` and a non-empty `boss_site_note`; the other verdicts have `chapter` null.
- Every continent-01 district that has a `geography` block has `geography.gameplay` with the four non-empty text fields and a valid `party_hub_role`.
- Exactly one district has `party_hub_role: "find_party"`.
- Tests: each bullet goes red on a mutated fixture.

### R4. Show it (owner rule: structure is drawn by a web component from the data)

- District record map (`scripts/atlas_world_web/record_map.py` + `renderRecordMap`): a dungeon node carries its verdict as the sub-label, e.g. "Story dungeon · Ch 0", "Optional instance", "Open activity", and when `proposed_level_band` differs from `level_range`, "Lv 14-15 -> 28-32 proposed". The legend explains the three verdicts.
- District record page: a short "Gameplay (proposed)" block under the map with the four `gameplay` lines in plain words, labelled: New players / Veterans return for / Party content / Why races meet here.
- Continent record map: a district with a `party_hub_role` shows it as a second line under the name ("Find a party", "Learn party play", "Crossroads", "Coordinated combat").
- All data strings escaped as the component already does. Phone width 390 px must still fit the district map without sideways page scroll.

## Acceptance criteria

- [ ] All nine dungeon node files and all 11 district files carry the R1 / R2 data exactly as tabled; `git diff --stat` touches no `level_range`, `resident_spawns`, `portals` or `content/maps/` line except what `compile_world_maps.py` regenerates (expected: nothing; if the manifest changes, say why).
- [ ] `python3 scripts/validate_studio_hierarchy.py --check` passes; GEO-12 tests exist and each goes red on its mutation.
- [ ] `/api/record?kind=district&id=district-teacup-meadows` returns the gameplay block and the Kiln Cellar node with its verdict; the continent record shows five districts with a party hub role (one find_party, one learn_party, one crossroads, two coordinated_combat).
- [ ] Phone 390x844 and desktop 1280x800 screenshots of `?r=district:district-cinnamon-bellows-bluff` (shows "Lv 14-15 -> 28-32 proposed") and of the continent record, looked at, no clipped or overlapping text; saved to `~/.local/state/atlas-lane/maps/f239-*.png`.
- [ ] `design-brief.md` and `critique.md` in the feature folder (the ship gate requires them for UI changes), written from actually looking at the pages with the `impeccable` skill process.
- [ ] Suites green: `python3 -m unittest tests.test_validate_studio_hierarchy tests.test_record_map`; `cd scripts && node --test --test-concurrency=1 tests/atlas-web-*.test.mjs tests/catalog-records.test.mjs`; `python3 scripts/compile_world_maps.py --check`; `node scripts/check_canon_names.mjs`; the records probe `node scripts/probes/atlas_records_probe.mjs --url http://127.0.0.1:<port>/`.

## Not in this feature

- Applying any proposed level band, converting a dungeon map into an open area, adding bosses, moving boss sites, new nodes (Still Kiln, Remembrance Kiln, Great Bell site).
- Landmarks: districts keep `geography.far_landmark`; GPT's new landmark descriptions are not recorded.
- Continents 02 / 03. Renaming studio nodes to canon names (I-264).
- The painted world map (step 5).

## District table (R2 text)

| District | new_player | veteran_return | party_content | cross_race_reason |
|---|---|---|---|---|
| teacup-meadows | Maro Lv 1-10 prologue; shared Chapter 0 at Lv 10-15 | Bell Reckoning, community events, beginner crafting | 2-4: lantern disturbances; 1-4: Chapter 0 story dungeon | First shared chapter; the accessible gathering point |
| porcelain-cradle | Linde Lv 1-10 prologue; basic crafting and exploration | Spellglaze materials, artisan contracts | 2-4: optional instance and porcelain anomalies | Maro-Linde exchange; cross-race gathering and crafting |
| kilnfire-terraces | Arrive by guided caravan at Lv 10; party recruitment, chapter dispatch | Guilds, storage, trading, social activity | 2-5: groups assemble here, then travel elsewhere | The six-race convergence hub |
| amber-root-hollows | Ondo Lv 1-10 prologue; forging and mining | Equipment crafting, specialist repairs, rare ore | 2-4: mine expeditions; 1-5: Chapter I story dungeon | Weapon upgrades and the Chapter I story |
| ash-bellows-trench | Daro Lv 1-10 prologue; guard training, safe patrols | Bounties, combat materials, defensive crafting | 2-5: optional instance, trench defence or elite patrol | Party staging for highland challenges |
| ginger-steam-terraces | Recovery stop, hot-spring exploration, easy shared hunting | Bathhouse services, herbs, event gathering | 1-3: open steam-cavern activity; 2-4: steam-creature hunts | Neutral crossroads between Maro, Linde and Tava |
| cinnamon-bellows-bluff | Tava Lv 1-10 prologue; gathering, forest exploration | Rare herbs, memory-themed events, craft resources | 2-4: grove expeditions; 1-5: Chapter II story dungeon | Market festivals and the Tava Grove story |
| cardamom-kiln-caldera | Distant mysterious destination; no beginner activity | Exploration secrets, later expeditions | Reserved: future elite expedition | Shared high-risk exploration destination |
| terracotta-wind-chimes | Silme Lv 1-10 prologue; observation and discoveries | Lore, rare knowledge materials, hidden routes | 1-4: open ridge and crypt exploration | Cartography, secrets and expedition preparation |
| glaze-river-delta | Discover river trade, safe transport and gathering | Shipping, fishing materials, regional commerce | 1-4: open river activity and river-creature encounters | Trade between distant race settlements |
| saffron-kiln-orchards | Farming, food production, gathering | Cooking ingredients, consumables, harvest events | 1-3: open orchard activity, orchard defence | Shared farming economy and seasonal gatherings |
