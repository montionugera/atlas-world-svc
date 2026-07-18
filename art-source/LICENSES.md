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
| `characters/mob_defensive_guard.glb` | internal | kitbash of Kenney Mini Characters `character-male-d` (CC0); source `.blend` in `art-source/bespoke/mob_defensive_guard/source/` | CC0 | atlas-world-svc | 2026-07-16 | bespoke tier — `mob:defensive` stone guard (forge content) |
| `seed/kaykit-adventurers/Knight.glb` | market | KayKit Character Pack: Adventurers 1.0 (Kay Lousberg, kaylousberg.com) | CC0 | atlas-world-svc | 2026-07-17 | raw vendored source; pack LICENSE.txt alongside |
| `characters/player_knight.glb` | market | KayKit Adventurers Knight, normalized to 1.8u + trimmed to 1H sword/badge shield; source `.blend` in `art-source/bespoke/player_knight/source/` | CC0 | atlas-world-svc | 2026-07-17 | bespoke tier — `player` (KayKit rig, 76 clips, manifest `anims` override) |
| `sprites/slime.png` | hand | — (hand-authored placeholder, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `sprite:slime`, seeds the `spritesheet` render-type (F-002 Phase 2); 32×32 frames, 4 cols × 3 rows, 3 named clips (`idle`/`walk`/`attack`) |
| `ui/panel-wood.png` | hand | — (hand-authored placeholder, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `ui:panel_wood`, seeds the `ninepatch` render-type (F-002 Phase 2); 48×48, 12px border margins on all sides |
| `ui/main.tres` | hand | — (hand-authored minimal Godot Theme resource, not parsed by the previewer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `theme:main_ui`, seeds the `theme` render-type (F-002 Phase 2); paired with a baked preview (below) per the `previewHashOf` staleness contract |
| `ui/main_preview.png` | hand | — (hand-authored baked preview, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — baked preview for `theme:main_ui`; distinct authored asset per §5 (a baked preview carries its own provenance line) |
| `tiles/dungeon.png` | hand | — (hand-authored placeholder, generated via `node:zlib` raw PNG writer) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `tileset:dungeon`, seeds the `tileset` render-type (F-002 Phase 2, real spec §8 item); 64×64, 4×4 grid of 16px distinct-colored tiles |
| `creatures/slime.glb` | market | Quaternius — Ultimate Monsters (via poly.pizza/m/LyjSUKHKnh) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:slime`, first real creature model (F-002 Phase 6 seeding) |
| `env/tree.glb` | market | Quaternius (via poly.pizza/m/etFGNvsiFv) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:tree` environment prop |
| `env/fence.glb` | market | Quaternius (via poly.pizza — Fence) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:fence` environment prop |
| `env/mountain.glb` | market | Quaternius (via poly.pizza — Mountains) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:mountain` environment prop |

| `creatures/bunny.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:bunny` (RO seed library) |
| `creatures/demon.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:demon` (RO seed library) |
| `creatures/dragon.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:dragon` (RO seed library) |
| `creatures/ghost.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:ghost` (RO seed library) |
| `creatures/green_blob.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:green_blob` (RO seed library) |
| `creatures/green_spiky_blob.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:green_spiky_blob` (RO seed library) |
| `creatures/mushnub.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:mushnub` (RO seed library) |
| `creatures/mushroom_king.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:mushroom_king` (RO seed library) |
| `creatures/orc.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:orc` (RO seed library) |
| `creatures/orc_enemy.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:orc_enemy` (RO seed library) |
| `creatures/pink_slime.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:pink_slime` (RO seed library) |
| `creatures/yeti.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `creature:yeti` (RO seed library) |
| `weapons/axe_double.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:axe_double` (RO seed library) |
| `weapons/claymore.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:claymore` (RO seed library) |
| `weapons/knife.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:knife` (RO seed library) |
| `weapons/scythe.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:scythe` (RO seed library) |
| `weapons/shield_round.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:shield_round` (RO seed library) |
| `weapons/spear.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:spear` (RO seed library) |
| `weapons/sword.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:sword` (RO seed library) |
| `weapons/wooden_bow.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `weapon:wooden_bow` (RO seed library) |
| `loot/book.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `loot:book` (RO seed library) |
| `loot/coin.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `loot:coin` (RO seed library) |
| `loot/crown.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `loot:crown` (RO seed library) |
| `loot/necklace.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `loot:necklace` (RO seed library) |
| `loot/potion_bottle.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `loot:potion_bottle` (RO seed library) |
| `loot/scroll.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `loot:scroll` (RO seed library) |
| `env/blacksmith.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:blacksmith` (RO seed library) |
| `env/farm.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:farm` (RO seed library) |
| `env/house.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:house` (RO seed library) |
| `env/inn.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:inn` (RO seed library) |
| `env/sawmill.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:sawmill` (RO seed library) |
| `env/stable.glb` | market | Quaternius — Ultimate Monsters/RPG Items/Buildings (via poly.pizza) | CC0 | Quaternius | 2026-07-16 | seed tier — `env:stable` (RO seed library) |
| `vfx/projectile-arrow.glb` | market | Quaternius (CC0) | CC0 | Quaternius | 2026-07-15 | seed tier — `projectile:arrow`; provenance backfilled 2026-07-18 after license-field normalization |
| `vfx/projectile-spear.glb` | market | Quaternius (CC0) | CC0 | Quaternius | 2026-07-15 | seed tier — `projectile:spear`/`magicSpear`/`physicSpear`; provenance backfilled 2026-07-18 |
| `vfx/projectile-melee.glb` | market | Quaternius (CC0) | CC0 | Quaternius | 2026-07-15 | seed tier — `projectile:melee`/`smallMeelee`/`largeMeelee`; provenance backfilled 2026-07-18 |
| `vfx/zones/zone-damage.glb` | internal | generated emissive disc (F-002 vfx keys) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `zone:damage`; provenance backfilled 2026-07-18 |
| `vfx/zones/zone-freeze.glb` | internal | generated emissive disc (F-002 vfx keys) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `zone:freeze`; provenance backfilled 2026-07-18 |
| `vfx/zones/zone-impulse-caster.glb` | internal | generated emissive disc (F-002 vfx keys) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `zone:impulse_caster`; provenance backfilled 2026-07-18 |
| `vfx/zones/zone-stun.glb` | internal | generated emissive disc (F-002 vfx keys) | CC0 | atlas-world-svc | 2026-07-15 | seed tier — `zone:stun`; provenance backfilled 2026-07-18 |

| `audio/chop.ogg` | market | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) | CC0 | Kenney | 2026-07-18 | sfx:attack; pack file chop.ogg; ledger backfill |
| `audio/knifeSlice.ogg` | market | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) | CC0 | Kenney | 2026-07-18 | sfx:hit; pack file knifeSlice.ogg; ledger backfill |
| `audio/impact_light.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_light; pack file impactGeneric_light_000.ogg |
| `audio/impact_light_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_light_alt; pack file impactGeneric_light_001.ogg |
| `audio/impact_flesh_soft.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_flesh_soft; pack file impactSoft_medium_000.ogg |
| `audio/impact_flesh_soft_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_flesh_soft_alt; pack file impactSoft_medium_001.ogg |
| `audio/impact_flesh_heavy.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_flesh_heavy; pack file impactSoft_heavy_000.ogg |
| `audio/death.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:death; real death thud replacing the metalLatch stand-in; pack file impactSoft_heavy_001.ogg |
| `audio/punch_medium.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:punch_medium; pack file impactPunch_medium_000.ogg |
| `audio/punch_medium_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:punch_medium_alt; pack file impactPunch_medium_001.ogg |
| `audio/punch_heavy.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:punch_heavy; pack file impactPunch_heavy_000.ogg |
| `audio/punch_heavy_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:punch_heavy_alt; pack file impactPunch_heavy_001.ogg |
| `audio/impact_metal_light.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_metal_light; pack file impactMetal_light_000.ogg |
| `audio/impact_metal_light_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_metal_light_alt; pack file impactMetal_light_001.ogg |
| `audio/impact_metal_medium.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_metal_medium; pack file impactMetal_medium_000.ogg |
| `audio/impact_metal_medium_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_metal_medium_alt; pack file impactMetal_medium_001.ogg |
| `audio/impact_metal_heavy.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_metal_heavy; pack file impactMetal_heavy_000.ogg |
| `audio/impact_metal_heavy_alt.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_metal_heavy_alt; pack file impactMetal_heavy_001.ogg |
| `audio/impact_wood_light.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_wood_light; pack file impactWood_light_000.ogg |
| `audio/impact_wood_medium.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_wood_medium; pack file impactWood_medium_000.ogg |
| `audio/impact_wood_heavy.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_wood_heavy; pack file impactWood_heavy_000.ogg |
| `audio/impact_plank.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_plank; pack file impactPlank_medium_000.ogg |
| `audio/impact_plate_light.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_plate_light; pack file impactPlate_light_000.ogg |
| `audio/impact_plate_medium.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_plate_medium; pack file impactPlate_medium_000.ogg |
| `audio/impact_plate_heavy.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_plate_heavy; pack file impactPlate_heavy_000.ogg |
| `audio/impact_tin.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:impact_tin; pack file impactTin_medium_000.ogg |
| `audio/chime_soft.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:chime_soft; pack file impactBell_heavy_000.ogg |
| `audio/chime_bright.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:chime_bright; pack file impactBell_heavy_001.ogg |
| `audio/shatter_light.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:shatter_light; pack file impactGlass_light_000.ogg |
| `audio/shatter_medium.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:shatter_medium; pack file impactGlass_medium_000.ogg |
| `audio/shatter_heavy.ogg` | market | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Kenney | 2026-07-18 | sfx:shatter_heavy; pack file impactGlass_heavy_000.ogg |

<!-- Source ∈ ai | market | commission. License must be commercial-safe (prefer CC0). -->
