# Asset License Ledger

Every asset under `art-source/` (and its baked form in `game-client/assets/`) has a row here.
Fill it **at intake**, before the asset is used. This is the single source of truth for provenance —
cheap now, painful to reconstruct later.

| Asset (baked path) | Source | Pack / URL | License | Author | Date added | Notes |
|---|---|---|---|---|---|---|
| _example_ `characters/skeleton.glb` | market | Quaternius — Ultimate Monsters | CC0 | Quaternius | 2026-07-12 | seed tier |
| `characters/character-male-a.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `player` |
| `characters/character-female-a.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `npc` |
| `characters/character-male-b.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `mob:aggressive` |
| `characters/character-female-b.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `mob:balanced` |
| `characters/character-male-d.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `mob:defensive` |
| `characters/character-female-c.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `mob:double_attacker` |
| `characters/character-male-e.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `mob:hybrid` |
| `characters/character-male-c.glb` | market | Kenney — Mini Characters | CC0 | Kenney | 2026-07-12 | seed tier — `mob:spear_thrower` |
| `icons/icon-health-potion.svg` | hand | — (hand-authored placeholder) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `icon:health_potion`, seeds the `image` render-type (F-002 Phase 1c) |
| `icons/icon-mana-potion.svg` | hand | — (hand-authored placeholder) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `icon:mana_potion`, seeds the `image` render-type (F-002 Phase 1c) |
| `characters/mob_aggressive_brute.glb` | internal | kitbash of Kenney Mini Characters `character-male-b` (CC0); source `.blend` in `art-source/bespoke/mob_aggressive_brute/source/` | CC0 | atlas-world-svc | 2026-07-16 | bespoke tier — `mob:aggressive` proof mob (F-003 asset-forge) |
| `sprites/slime.png` | hand | — (hand-authored placeholder, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `sprite:slime`, seeds the `spritesheet` render-type (F-002 Phase 2); 32×32 frames, 4 cols × 3 rows, 3 named clips (`idle`/`walk`/`attack`) |
| `ui/panel-wood.png` | hand | — (hand-authored placeholder, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `ui:panel_wood`, seeds the `ninepatch` render-type (F-002 Phase 2); 48×48, 12px border margins on all sides |
| `ui/main.tres` | hand | — (hand-authored minimal Godot Theme resource, not parsed by the previewer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `theme:main_ui`, seeds the `theme` render-type (F-002 Phase 2); paired with a baked preview (below) per the `previewHashOf` staleness contract |
| `ui/main_preview.png` | hand | — (hand-authored baked preview, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — baked preview for `theme:main_ui`; distinct authored asset per §5 (a baked preview carries its own provenance line) |
| `tiles/dungeon.png` | hand | — (hand-authored placeholder, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `tileset:dungeon`, seeds the `tileset` render-type (F-002 Phase 2, real spec §8 item); 64×64, 4×4 grid of 16px distinct-colored tiles |
| `creatures/slime.glb` | market | Quaternius — Ultimate Monsters (via poly.pizza/m/LyjSUKHKnh) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:slime`, first real creature model (F-002 Phase 6 seeding) |
| `env/tree.glb` | market | Quaternius (via poly.pizza/m/etFGNvsiFv) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:tree` environment prop |
| `env/fence.glb` | market | Quaternius (via poly.pizza — Fence) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:fence` environment prop |
| `env/mountain.glb` | market | Quaternius (via poly.pizza — Mountains) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:mountain` environment prop |

<!-- Source ∈ ai | market | commission. License must be commercial-safe (prefer CC0). -->
