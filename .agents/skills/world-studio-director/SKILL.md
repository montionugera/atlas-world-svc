---
name: world-studio-director
description: Studio Owner & Multi-Agent Director for Atlas World. Orchestrates the 4 specialized studio roles (world-lore-architect, map-biome-engineer, asset-forge-director, qa-gatekeeper) through the deterministic Increment -> Validate -> Verify -> Brainstorm loop across Layers L0-L5.
---

# World Studio Director (`L0 Canon ➔ L5 Asset Forge`)

Use this skill whenever acting as the **Studio Owner / Game Director** for `atlas-world-svc` to systematically plan, build, compile, validate, verify, and brainstorm game increments across the 6-layer World-First architecture.

## 1. The 6-Layer World-First Compiler Hierarchy

Never author isolated maps or orphan assets. Every change flows top-down through 6 deterministic layers:

1. **L0 Canon (`content/story/canon.md`, `content/world/canon/continent-roster.json`)**:
   - 13 Continents (`c01`–`c13`), level bands, naming registers, and the 5-Act *Undertow* thesis.
2. **L1 World Fabric (`content/world/fabric/world.json`)**:
   - Deterministic `400×400 km` grid (`160,000 km²`, `1.5:1` sea-to-land ratio, seed `7c9e4a2f8b1d6e03`).
3. **L2 Spine, Civil, Zones & Dungeons (`content/spine/`, `content/world/civil/`, `content/zones/`, `content/dungeons/`, `content/towns/`)**:
   - `36` Spine DAG nodes, `19` Pinned Canon Places (`G-PIN-SAT`), `358` Slot-Bound Places, `40` Surveyed Zones, `60` Multi-Floor Dungeons, and Authoritative Town Plans (`town-millcross.json`).
4. **L3 Narrative & Ecology (`content/story/`, `content/bestiary/bestiary.json`)**:
   - `158` 5-Act Story DAG nodes (`resolveStoryRefs`, `assertUnlockDag`) and `116` Bestiary creatures with ecological lore + 3D/2D Forge visual briefs.
5. **L4 Playable Map Compiler (`scripts/compile_world_maps.py` ➔ `content/maps/*.json`)**:
   - Deterministically compiles surveyed zones (`content/zones/zone-*.json`), town footprints, and regional bestiary into playable v3 3D Map Blueprints (`worldSpineBinding`, `heightTerraces`, `routes`, `groundZones`, `structures`, `staticObstacles`, `spawnAreas`).
6. **L5 Asset Forge & Chibi Review Gate (`content/ground_palettes.json`, `content/review-queue.json`, `game-client/assets/manifest.json`)**:
   - Enforces the **Chibi Toddler Player Scale Anchor (`[0.90m, 1.20m]`, Ref `1.05m`)**: knee-high grass `≤ 0.35m`, chest-high bush `≤ 0.65m`, trunk collider `≥ 0.35m`, highway corridor `≥ 3.5m`.

---

## 2. The 4 Multi-Agent Studio Roles (`.claude/agents/*.md`)

Dispatch these 4 roles via `invoke_subagent` (always with `Model: "inherit"`):

- **`world-lore-architect`** (`.claude/agents/world-lore-architect.md`): Owns L0–L3 Canon, Fabric, Spine DAG, Story Graph, and Bestiary.
- **`map-biome-engineer`** (`.claude/agents/map-biome-engineer.md`): Owns L4 `scripts/compile_world_maps.py` and `content/maps/*.json`.
- **`asset-forge-director`** (`.claude/agents/asset-forge-director.md`): Owns L5 `content/ground_palettes.json`, `content/review-queue.json`, and `game-client/assets/manifest.json`.
- **`qa-gatekeeper`** (`.claude/agents/qa-gatekeeper.md`): Owns cross-layer SQLite audit (`build/catalog.sqlite`), Rust engine tests (`server-rs`), and the Joymify Observatory (`scripts/catalog_explorer_web.py`).

---

## 3. Mandatory 4-Phase Execution Loop (`Increment ➔ Validate ➔ Verify ➔ Brainstorm`)

Run the master pipeline after every increment:

```bash
python3 scripts/run_world_pipeline.py
```

1. **Increment**: Dispatch `world-lore-architect`, `map-biome-engineer`, and `asset-forge-director` to author/compile the slice.
2. **Validate**: Run `compile_world_maps.py --check`, `node scripts/check_content.mjs`, and `python3 scripts/build_catalog_db.py` (0 orphan FKs).
3. **Verify**: Run `python3 scripts/catalog_explorer_web.py --dump-check` and `cargo test --manifest-path server-rs/Cargo.toml --lib content::map::tests`, and inspect `http://127.0.0.1:8788`.
4. **Brainstorm**: Inspect the `NEXT BRAINSTORM / INCREMENT QUEUE` output from `scripts/run_world_pipeline.py` to select the next vertical slice.
