# Atlas World: Content Directory Architecture & SSOT

## Single Source of Truth (SSOT)
The authoritative single source of truth for the Atlas World game lore, continents, districts, towns, starter zones, and mob ecosystems is **`content/studio/`**:
- **`content/studio/world_history_and_concept.json`**:
  - The 3 Canonical Continents: `continent-01-hearthbloom-basin`, `continent-02-fluvial-reach`, and `continent-03-shattered-halo`.
  - The 6 Canonical Races & Starter Towns (`human_demi_human`, `dwarf`, `ogre_orc`, `furral`, `lunar`, `dark_lunar`).
  - Character scale laws (0.90m–1.20m chibi miniature scale, 1.05m reference).
  - Strict boss power hierarchy (`GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB`).
- **`content/studio/t_shaped_world_atlas.json`**:
  - The 63 canonical overland zones, regional bounds, highways, and landmark pins.

## Role of `content/world/`
The files in `content/world/` (`budgets.json`, `manifest.json`, `civil/`, `fabric/`, `premises/`) represent the lower-level mathematical 400×400 km GIS polygon simulation data. They serve purely as low-level geometric mesh and heightfield substrates for GIS pipelines and do not supersede or conflict with `content/studio/`.
