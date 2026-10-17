# Atlas World — World-First Studio Pipeline & Multi-Agent Operating System (`L0 ➔ L5`)

**Status:** Active Studio Operating System · **Date:** 2026-10-17 · **Owner:** Studio Director

---

## 1. Studio Philosophy: World-First, Contract-Driven, Multi-Agent Loop

Instead of ad-hoc manual map editing or disconnected lore/asset tasks, **Atlas World** operates as a **6-Layer Deterministic Compiler** driven by **4 Specialized Agent Roles** inside a continuous **Increment ➔ Validate ➔ Verify ➔ Brainstorm** loop:

```
[L0 Canon]  content/story/canon.md + content/world/canon/continent-roster.json
    │
    ▼
[L1 Fabric] content/world/fabric/world.json (400×400 km, 13 Continents, 1.5:1 Sea:Land)
    │
    ▼
[L2 Spine]  content/spine/{nodes,edges}.json + content/world/civil/pinned-roster.json
            + content/zones/zone-*.json (40 Surveyed Zones) + content/dungeons/*.json (60 Dungeons)
            + content/towns/town-*.json (Authoritative Town Footprints & Roads)
    │
    ▼
[L3 Story]  content/story/{acts,regions,factions,characters,arcs,quests,events,dialogues,lore}/*.json (158 Nodes)
            + content/bestiary/bestiary.json (116 Ecological Creatures + Forge Visual Briefs)
    │
    ▼  (Compiled deterministically by scripts/compile_world_maps.py)
[L4 Maps]   content/maps/*.json (10 Playable v3 Unified Maps with worldSpineBinding,
            heightTerraces, routes, groundZones, structures, staticObstacles & spawnAreas)
    │
    ▼
[L5 Forge]  content/ground_palettes.json + content/review-queue.json + game-client/assets/manifest.json
            (1.05m Chibi Toddler Player Scale Anchor [0.90m–1.20m], Smart Tag Pools, Step 3 Review Gate)
```

---

## 2. The 4 Specialized Multi-Agent Studio Roles

| Role ID | Responsibility Layer | Core Files Owned | Mandatory Gate |
| :--- | :--- | :--- | :--- |
| **`world-lore-architect`** | **L0 Canon ➔ L3 Narrative & Bestiary** | `content/world/**`, `content/spine/**`, `content/zones/**`, `content/dungeons/**`, `content/story/**`, `content/bestiary/bestiary.json` | `node scripts/check_content.mjs` (`G-PIN-SAT`, `resolveStoryRefs`, `assertUnlockDag`) |
| **`map-biome-engineer`** | **L4 World-to-Map Deterministic Compiler** | `scripts/compile_world_maps.py`, `content/maps/*.json`, `content/towns/*.json` | `python3 scripts/compile_world_maps.py --check` + `cargo test content::map::tests` |
| **`asset-forge-director`** | **L5 3D/2D Asset Forge & Review Gate** | `content/ground_palettes.json`, `content/review-queue.json`, `game-client/assets/manifest.json` | Chibi `1.05m` Scale Anchor (`grass ≤ 0.35m`, `bush ≤ 0.65m`, `corridor ≥ 3.5m`) |
| **`qa-gatekeeper`** | **Cross-Layer Verification & Balance Sim** | `scripts/run_world_pipeline.py`, `scripts/build_catalog_db.py`, `scripts/catalog_explorer_web.py` | `python3 scripts/run_world_pipeline.py` (0 orphans, 100% Wealdmarch region & bestiary binding) |

---

## 3. The 4-Phase Autonomous Studio Loop (`Increment ➔ Validate ➔ Verify ➔ Brainstorm`)

Every feature slice or content expansion runs through the same 4-phase loop via `python3 scripts/run_world_pipeline.py`:

1. **INCREMENT (Build / Compile)**
   - `world-lore-architect` authors or expands L1–L3 zones, dungeons, story arcs, or bestiary entries.
   - `map-biome-engineer` compiles L2 surveyed zones + L3 bestiary/towns into L4 playable v3 `content/maps/<zone>.json` via `python3 scripts/compile_world_maps.py`.
   - `asset-forge-director` binds smart tag-pool brushes (`content/ground_palettes.json`) and queues 3-take visual proposals in `content/review-queue.json`.
2. **VALIDATE (Automated Machine Gates — 99% Filter)**
   - Stage 1: `python3 scripts/compile_world_maps.py --check` validates `worldSpineBinding`, Chibi scale anchor `[0.90, 1.20]`, valid `groundPalettes`, and bestiary spawn integrity.
   - Stage 2: `node scripts/check_content.mjs` validates L0–L3 geography, DAG acyclicity, and cross-file references.
   - Stage 3: `python3 scripts/build_catalog_db.py` builds `build/catalog.sqlite` (`v_map_world_binding`, `v_world_continent_overview`, `v_story_region_matrix`) and enforces zero orphan foreign keys.
3. **VERIFY (Engine & Visual Observatory Proof — 1% Human Gate)**
   - Stage 4: `python3 scripts/catalog_explorer_web.py --dump-check` verifies the Joymify RateMyServer Observatory UI (`http://127.0.0.1:8788`), where every Continent, Pinned Town, Surveyed Zone, Story Region, and Bestiary Creature links bidirectionally to its Playable 3D Map Blueprint.
   - Stage 5: `cargo test --manifest-path server-rs/Cargo.toml --lib content::map::tests` proves the authoritative Rust server loads the compiled v3 map geometry and heightfield.
4. **BRAINSTORM (Data-Driven Next Increment Selection)**
   - `scripts/run_world_pipeline.py` queries `v_world_continent_overview` and `v_story_region_matrix` to surface the next uncompiled continents (`c01 Solvaris`, `c03 Caldorn`, `c04 Vaelith`) and open review-queue proposals.
