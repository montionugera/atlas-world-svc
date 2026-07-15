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

<!-- Source ∈ ai | market | commission. License must be commercial-safe (prefer CC0). -->
