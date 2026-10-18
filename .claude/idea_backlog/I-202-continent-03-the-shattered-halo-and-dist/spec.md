# I-202: Continent 03 The Shattered Halo and District Starfall Anchorage Canon Promotion, Astrolabe Rift Bridge, and Sky-Island Matrix

## Summary
Execute Iteration #3 of the 4-hour Autonomous Product Owner Studio Loop (`Increment -> Validate -> Verify -> Measure & Self-Evaluate -> Auto-Tune -> Brainstorm`):
1. **Promote `god-vesper-dream-eater` (`mystery -> canon` in `world_history_and_concept.json`) and `continent-03-shattered-halo` (`draft -> canon`, `5/5` Five-Pillar Quality Checklist)**:
   - Fulfill `god-vesper-dream-eater`'s `discovery_trigger_hint` (*"Unlocked after restoring Krono's Great Mainspring in Continent 02"*) now that all three core Districts of Continent 02 (`Rustcog Downs`, `Mainspring Caldera`, `Verdigris Siphon`) are `canon`.
   - Open the `dimensional_rift` travel link between `Continent 02` (`The Astrolabe Gate`) and `Continent 03` (`Starfall Anchorage Rift-Dock`), and register `district-eclipse-observatory` (`draft`) + `district-nebula-undertide` (`mystery`) on Continent 03.
2. **Promote `hunting-area-astrolabe-rift` (`mystery -> canon` in `district-rustcog-downs`) & Connect the Cross-Continent Dimensional Rift Bridge**:
   - Upgrade `edge-brass-spur-north-astrolabe-rift` in `district-rustcog-downs.json` from `fog_of_lore` to `open`.
   - Populate `hunting-area-astrolabe-rift.json` (`map_id: "astrolabe-rift"`, `level_range: [25, 30]`) with `Astrolabe Ring-Sentinel` and `Violet Gale-Moth` spawns and `0.01%` cards, connected `South` to `hunting-area-brass-spur-ridge` and `North` across the Astrolabe Dimensional Rift to `hunting-area-tether-causeway` (`[0, 1]` in `Starfall Anchorage`).
3. **Promote `district-starfall-anchorage` (`draft -> canon`, `5/5` Checklist Pillars) & Populate its 2x2 Connected Sky-Island Matrix**:
   - `hunting-area-tether-causeway.json` (`mystery -> canon` at `[0, 1]`, `map_id: "tether-causeway"`, `level_range: [30, 36]`, with `Starlight Tether-Wisp` and `Basalt Anchor-Gargoyle` spawns and `0.01%` cards, connected `South` to `hunting-area-astrolabe-rift` and `East` to `town-starfall-haven`).
   - `town-starfall-haven.json` (`canon` Town at `[1, 1]`, `map_id: "starfall-haven"`, `level_range: [32, 38]`, floating basalt lighthouse town connected `West` to `hunting-area-tether-causeway`, `Dungeon` to `dungeon-inverted-belfry`, `North` via `fog_of_lore` to `hunting-area-mirror-cascade`, and `East` via `fog_of_lore` to `hunting-area-orrery-bridge`).
   - `dungeon-inverted-belfry.json` (`canon` Dungeon at `[1, 1]`, `floor_index: -1`, `map_id: "inverted-belfry-b1"`, `level_range: [34, 42]`, upside-down starlight cathedral beneath Starfall Haven with `Dream-Glass Bellringer` and `Gravity-Leech Wyrm` spawns and `0.01%` cards).
   - `hunting-area-mirror-cascade.json` (`mystery` Hunting Area at `[1, 0]`, `map_id: null`, `level_range: [36, 40]`, northern upward-flowing waterfall cliffs reserved as Fog of Lore).
4. **Seed Next Frontier `district-eclipse-observatory.json` (`draft`, `4/5` Checklist Pillars) + `hunting-area-orrery-bridge.json` (`mystery`) + `district-nebula-undertide.json` (`mystery`)**.

## Acceptance Criteria
- [ ] `python3 scripts/validate_studio_hierarchy.py --check --write-manifest` passes with 0 errors across 39 total studio nodes (`29 canon`, `1 draft`, `9 mystery`) and 19 playable maps in `content/maps/_manifest.runtime.json` spanning all 3 Continents (`Continent 01`, `Continent 02`, `Continent 03`).
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes all 7 stages with 100% Quality Score and sub-second (`A+`) warm turn speed.
