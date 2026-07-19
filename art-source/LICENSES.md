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
| `characters/mob_spear_thrower.glb` | internal | KayKit Adventurers Rogue (Kay Lousberg, kaylousberg.com) restyled to thorn-green/bark-brown + ember accent, with a Quaternius spear prop bone-parented to `handslot.r` (both CC0); source `.blend` in `art-source/bespoke/mob_spear_thrower/source/` | CC0 | atlas-world-svc | 2026-07-19 | bespoke tier — `mob:spear_thrower` Thornveil Spearmaiden (KayKit rig, 76 clips, manifest `anims` override) |
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

| `music/town_hero_suite.ogg` | market | [OpenGameArt](https://opengameart.org/content/hero-suite-a) | CC0 | some-weirdo | 2026-07-18 | music:town_hero_suite; BGM (CC0) |
| `music/field_treasure_hunter.mp3` | market | [OpenGameArt](https://opengameart.org/content/treasure-hunter) | CC0 | tad | 2026-07-18 | music:field_treasure_hunter; BGM (CC0) |
| `music/dungeon_subspace.mp3` | market | [OpenGameArt](https://opengameart.org/content/subspace) | CC0 | vitalezzz | 2026-07-18 | music:dungeon_subspace; BGM (CC0) |
| `music/battle_arrival.mp3` | market | [OpenGameArt](https://opengameart.org/content/arrival-1) | CC0 | vitalezzz | 2026-07-18 | music:battle_arrival; BGM (CC0) |
| `music/boss_fantasy_orchestral.ogg` | market | [OpenGameArt](https://opengameart.org/content/fantasy-orchestral-theme-emotional-piano-loop-joth-vs-extenz) | CC0 | glitchart | 2026-07-18 | music:boss_fantasy_orchestral; BGM (CC0) |
| `music/ambient_once_upon_a_time.mp3` | market | [OpenGameArt](https://opengameart.org/content/once-upon-a-time-loop) | CC0 | tad | 2026-07-18 | music:ambient_once_upon_a_time; BGM (CC0) |
| `music/ambient_last_journey.mp3` | market | [OpenGameArt](https://opengameart.org/content/last-journey) | CC0 | crocdent | 2026-07-18 | music:ambient_last_journey; BGM (CC0) |

| `vfx/explosion.png` | market | [OpenGameArt](https://opengameart.org/content/explosion-sheet) | CC0 | stumpystrust | 2026-07-18 | fx:explosion; animated VFX sprite sheet (64f) |
| `vfx/fireball.png` | market | [OpenGameArt](https://opengameart.org/content/sparkling-fireball-effect) | CC0 | rubberduck | 2026-07-18 | fx:fireball; animated VFX sprite sheet (50f of 56-cell sheet) |
| `vfx/magic_rune.png` | market | [OpenGameArt](https://opengameart.org/content/fire-trap-rune-animation-sprite-sheet) | CC0 | gfroad | 2026-07-18 | fx:magic_rune; animated VFX sprite sheet (16f) |
| `vfx/barrier.png` | market | [OpenGameArt](https://opengameart.org/content/barrier-sprite-sheet) | CC0 | gfroad | 2026-07-18 | fx:barrier; animated VFX sprite sheet (25f) |

| `creatures/skeleton.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/1XZD9GK6Kj) | CC0 | Quaternius | 2026-07-18 | seed tier — `creature:skeleton` (3D top-up) |
| `env/barrel.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/1orHe0kCc1) | CC0 | Quaternius | 2026-07-18 | seed tier — `env:barrel` (3D top-up) |
| `env/crate.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/1dh0EFL5gl) | CC0 | Quaternius | 2026-07-18 | seed tier — `env:crate` (3D top-up) |
| `env/rock.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/34W5ymEePk) | CC0 | Quaternius | 2026-07-18 | seed tier — `env:rock` (3D top-up) |
| `env/bush.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/1X06RgvSr6) | CC0 | Quaternius | 2026-07-18 | seed tier — `env:bush` (3D top-up) |
| `weapons/axe.glb` | market | Poly Pizza — Pichuliru (via poly.pizza/m/0kgjDkCRmx) | CC0 | Pichuliru | 2026-07-18 | seed tier — `weapon:axe` (3D top-up) |
| `weapons/greatsword.glb` | market | Poly Pizza — Pichuliru (via poly.pizza/m/15A7InejC7) | CC0 | Pichuliru | 2026-07-18 | seed tier — `weapon:greatsword` (3D top-up) |
| `weapons/bow.glb` | market | Poly Pizza — CreativeTrio (via poly.pizza/m/3PTJlHnOfU) | CC0 | CreativeTrio | 2026-07-18 | seed tier — `weapon:bow` (3D top-up) |
| `weapons/dagger.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/0g8M6yYtE4) | CC0 | Quaternius | 2026-07-18 | seed tier — `weapon:dagger` (3D top-up) |
| `loot/potion.glb` | market | Poly Pizza — Quaternius (via poly.pizza/m/7qbuf1TS8C) | CC0 | Quaternius | 2026-07-18 | seed tier — `loot:potion` (3D top-up) |
| `loot/gem.glb` | market | Poly Pizza — Kay (via poly.pizza/m/2LbAELNqb3) | CC0 | Kay | 2026-07-18 | seed tier — `loot:gem` (3D top-up) |

| `creatures/spider.glb` | market | Poly Pizza — Quaternius (https://poly.pizza (Quaternius, uuid 4259fbdb)) | CC0 | Quaternius | 2026-07-18 | seed tier — `creature:spider` |

| `characters/archer.glb` | market | KayKit Adventurers 2.0 (Kay Lousberg, kaylousberg.com) — Ranger.glb | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:archer` (matches player_knight style/rig) |
| `characters/mage.glb` | market | KayKit Adventurers 2.0 (Kay Lousberg, kaylousberg.com) — Mage.glb | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:mage` (matches player_knight style/rig) |
| `characters/rogue.glb` | market | KayKit Adventurers 2.0 (Kay Lousberg, kaylousberg.com) — Rogue.glb | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:rogue` (matches player_knight style/rig) |
| `characters/barbarian.glb` | market | KayKit Adventurers 2.0 (Kay Lousberg, kaylousberg.com) — Barbarian.glb | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:barbarian` (matches player_knight style/rig) |

| `characters/marksman.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — Marksman.glb + 64 anim clips merged from Rig_Medium (Melee/Ranged/Bow/Magic/Movement) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:marksman` |
| `characters/lorekeeper.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — Lorekeeper.glb + 64 anim clips merged from Rig_Medium (Melee/Ranged/Bow/Magic/Movement) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:lorekeeper` |
| `characters/tiefling.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — Tiefling.glb + 64 anim clips merged from Rig_Medium (Melee/Ranged/Bow/Magic/Movement) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:tiefling` |
| `characters/witch.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — Witch.glb + 64 anim clips merged from Rig_Medium (Melee/Ranged/Bow/Magic/Movement) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:witch` |
| `characters/cleric.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — Cleric.glb + 64 anim clips merged from Rig_Medium (Melee/Ranged/Bow/Magic/Movement) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:cleric` |
| `characters/orc_brute.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — Orc Brute.glb + 64 anim clips merged from Rig_Medium (Melee/Ranged/Bow/Magic/Movement) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:orc_brute` |

| `weapons/kk_arrow_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — arrow_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_arrow_a` |
| `weapons/kk_arrow_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — arrow_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_arrow_b` |
| `weapons/kk_arrow_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — arrow_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_arrow_c` |
| `weapons/kk_axe_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — axe_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_axe_a` |
| `weapons/kk_axe_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — axe_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_axe_b` |
| `weapons/kk_axe_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — axe_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_axe_c` |
| `weapons/kk_axe_d.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — axe_D.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_axe_d` |
| `weapons/kk_bow_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — bow_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_bow_a` |
| `weapons/kk_bow_a_withstring.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — bow_A_withString.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_bow_a_withstring` |
| `weapons/kk_bow_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — bow_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_bow_b` |
| `weapons/kk_bow_b_withstring.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — bow_B_withString.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_bow_b_withstring` |
| `weapons/kk_bow_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — bow_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_bow_c` |
| `weapons/kk_bow_c_withstring.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — bow_C_withString.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_bow_c_withstring` |
| `weapons/kk_dagger_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — dagger_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_dagger_a` |
| `weapons/kk_dagger_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — dagger_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_dagger_b` |
| `weapons/kk_dagger_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — dagger_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_dagger_c` |
| `weapons/kk_fistweapon_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_a` |
| `weapons/kk_fistweapon_a_stacked.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_A_stacked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_a_stacked` |
| `weapons/kk_fistweapon_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_b` |
| `weapons/kk_fistweapon_b_stacked.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_B_stacked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_b_stacked` |
| `weapons/kk_fistweapon_c_left.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_C_left.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_c_left` |
| `weapons/kk_fistweapon_c_right.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_C_right.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_c_right` |
| `weapons/kk_fistweapon_c_stacked.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — fistweapon_C_stacked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_fistweapon_c_stacked` |
| `weapons/kk_halberd.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — halberd.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_halberd` |
| `weapons/kk_hammer_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — hammer_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_hammer_a` |
| `weapons/kk_hammer_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — hammer_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_hammer_b` |
| `weapons/kk_hammer_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — hammer_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_hammer_c` |
| `weapons/kk_hammer_d.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — hammer_D.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_hammer_d` |
| `weapons/kk_scythe.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — scythe.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_scythe` |
| `weapons/kk_shield_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — shield_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_shield_a` |
| `weapons/kk_shield_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — shield_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_shield_b` |
| `weapons/kk_shield_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — shield_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_shield_c` |
| `weapons/kk_shield_d.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — shield_D.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_shield_d` |
| `weapons/kk_spear_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — spear_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_spear_a` |
| `weapons/kk_spear_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — spear_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_spear_b` |
| `weapons/kk_staff_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — staff_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_staff_a` |
| `weapons/kk_staff_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — staff_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_staff_b` |
| `weapons/kk_staff_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — staff_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_staff_c` |
| `weapons/kk_staff_d.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — staff_D.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_staff_d` |
| `weapons/kk_sword_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_a` |
| `weapons/kk_sword_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_b` |
| `weapons/kk_sword_c.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_c` |
| `weapons/kk_sword_d.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_D.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_d` |
| `weapons/kk_sword_e.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_E.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_e` |
| `weapons/kk_sword_f.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_F.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_f` |
| `weapons/kk_sword_g.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — sword_G.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_sword_g` |
| `weapons/kk_wand_a.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — wand_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_wand_a` |
| `weapons/kk_wand_b.glb` | market | KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg) — wand_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `weapon:kk_wand_b` |

| `dungeon/banner_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_blue` |
| `dungeon/banner_patterna_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternA_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patterna_white` |
| `dungeon/banner_patternb_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternB_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternb_yellow` |
| `dungeon/banner_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_red` |
| `dungeon/banner_thin_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_thin_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_thin_blue` |
| `dungeon/banner_triple_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_triple_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_triple_brown` |
| `dungeon/bar_innercorner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_innercorner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_innercorner` |
| `dungeon/bar_straight_c_short.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_straight_C_short.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_straight_c_short` |
| `dungeon/barrier_column.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrier_column.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrier_column` |
| `dungeon/bartop_b_medium.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bartop_B_medium.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bartop_b_medium` |
| `dungeon/bed_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_decorated` |
| `dungeon/bookcase_double.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bookcase_double.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bookcase_double` |
| `dungeon/bottle_a_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_A_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_a_green` |
| `dungeon/box_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — box_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:box_large` |
| `dungeon/candle_melted.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — candle_melted.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:candle_melted` |
| `dungeon/chest_gold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — chest_gold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:chest_gold` |
| `dungeon/coin_stack_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — coin_stack_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:coin_stack_small` |
| `dungeon/floor_dirt_large_rocky.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_large_rocky.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_large_rocky` |
| `dungeon/floor_foundation_allsides.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_foundation_allsides.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_foundation_allsides` |
| `dungeon/floor_tile_big_grate_open.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_big_grate_open.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_big_grate_open` |
| `dungeon/floor_tile_large_rocks.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_large_rocks.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_large_rocks` |
| `dungeon/floor_tile_small_weeds_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small_weeds_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small_weeds_b` |
| `dungeon/key.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — key.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:key` |
| `dungeon/pillar_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — pillar_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:pillar_decorated` |
| `dungeon/rocks.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — rocks.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:rocks` |
| `dungeon/scaffold_beam_wall.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_beam_wall.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_beam_wall` |
| `dungeon/scaffold_pillar_wall_cross_top.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillar_wall_cross_top.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillar_wall_cross_top` |
| `dungeon/shelves.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — shelves.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:shelves` |
| `dungeon/stairs_modular_center.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_modular_center.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_modular_center` |
| `dungeon/stairs_wide.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_wide.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_wide` |
| `dungeon/sword_shield_gold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — sword_shield_gold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:sword_shield_gold` |
| `dungeon/table_long_tablecloth_decorated_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long_tablecloth_decorated_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long_tablecloth_decorated_a` |
| `dungeon/table_round_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_round_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_round_large` |
| `dungeon/torch.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — torch.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:torch` |
| `dungeon/trunk_medium_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_medium_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_medium_b` |
| `dungeon/wall_tsplit_sloped.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_Tsplit_sloped.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_tsplit_sloped` |
| `dungeon/wall_corner_gated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_corner_gated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_corner_gated` |
| `dungeon/wall_doorway_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_doorway_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_doorway_scaffold` |
| `dungeon/wall_inset.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_inset.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_inset` |
| `dungeon/wall_pillar.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_pillar.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_pillar` |



| `nature/bush_1_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_a_color1` |
| `nature/bush_1_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_e_color1` |
| `nature/bush_2_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_2_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_2_c_color1` |
| `nature/bush_3_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_3_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_3_b_color1` |
| `nature/bush_4_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_4_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_4_d_color1` |
| `nature/grass_1_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_b_color1` |
| `nature/grass_1_d_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_D_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_d_singlesided_color1` |
| `nature/grass_2_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_c_color1` |
| `nature/hill_12x12x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_12x12x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_12x12x4_color1` |
| `nature/hill_2x2x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_2x2x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_2x2x2_color1` |
| `nature/hill_4x2x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_4x2x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_4x2x8_color1` |
| `nature/hill_8x4x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_8x4x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_8x4x4_color1` |
| `nature/hill_cliff_a_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_A_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_a_innercorner_color1` |
| `nature/hill_cliff_d_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_D_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_d_side_color1` |
| `nature/hill_cliff_h_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_H_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_h_side_color1` |
| `nature/hill_cliff_tall_b_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_B_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_b_side_color1` |
| `nature/hill_cliff_tall_f_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_F_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_f_side_color1` |
| `nature/hill_cliff_tall_i_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_I_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_i_outercorner_color1` |
| `nature/hill_top_c_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_C_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_c_outercorner_color1` |
| `nature/hill_top_g_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_G_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_g_innercorner_color1` |
| `nature/rock_1_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_a_color1` |
| `nature/rock_1_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_e_color1` |
| `nature/rock_1_j_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_J_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_j_color1` |
| `nature/rock_1_o_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_O_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_o_color1` |
| `nature/rock_2_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_c_color1` |
| `nature/rock_2_h_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_H_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_h_color1` |
| `nature/rock_3_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_e_color1` |
| `nature/rock_3_j_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_J_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_j_color1` |
| `nature/rock_3_o_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_O_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_o_color1` |
| `nature/rock_4_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_b_color1` |
| `nature/rock_4_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_g_color1` |
| `nature/rock_5_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_d_color1` |
| `nature/rock_6_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_a_color1` |
| `nature/rock_6_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_f_color1` |
| `nature/tree_1_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_1_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_1_c_color1` |
| `nature/tree_2_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_2_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_2_e_color1` |
| `nature/tree_4_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_4_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_4_b_color1` |
| `nature/tree_5_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_5_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_5_d_color1` |
| `nature/tree_6_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_6_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_6_c_color1` |
| `nature/tree_bare_1_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_Bare_1_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_bare_1_b_color1` |

| `characters/4gtn.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — 4gtn + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:4gtn` |
| `characters/4gtn_forgotten.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — 4gtn_forgotten + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:4gtn_forgotten` |
| `characters/animatronic_creepy.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — animatronic_creepy + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:animatronic_creepy` |
| `characters/animatronic_normal.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — animatronic_normal + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:animatronic_normal` |
| `characters/avianswordsman.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — avianswordsman + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:avianswordsman` |
| `characters/blackknight.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — blackknight + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:blackknight` |
| `characters/caveman.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — caveman + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:caveman` |
| `characters/clanker.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — clanker + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:clanker` |
| `characters/clown.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — clown + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:clown` |
| `characters/combatmech.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — combatmech + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:combatmech` |
| `characters/farmer_a.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — farmer_a + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:farmer_a` |
| `characters/farmer_b.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — farmer_b + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:farmer_b` |
| `characters/frostgolem.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — frostgolem + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:frostgolem` |
| `characters/helper_a.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — helper_a + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:helper_a` |
| `characters/helper_b.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — helper_b + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:helper_b` |
| `characters/hiker.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — hiker + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:hiker` |
| `characters/hoarder.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — hoarder + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:hoarder` |
| `characters/magicalgirl.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — magicalgirl + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:magicalgirl` |
| `characters/monstrosity.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — monstrosity + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:monstrosity` |
| `characters/necromancer.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — necromancer + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:necromancer` |
| `characters/paladin.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — paladin + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:paladin` |
| `characters/paladin_with_helmet.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — paladin_with_helmet + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:paladin_with_helmet` |
| `characters/plantwarrior.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — plantwarrior + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:plantwarrior` |
| `characters/protagonist_a.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — protagonist_a + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:protagonist_a` |
| `characters/protagonist_b.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — protagonist_b + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:protagonist_b` |
| `characters/robot_one.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — robot_one + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:robot_one` |
| `characters/robot_two.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — robot_two + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:robot_two` |
| `characters/skeleton_golem.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — skeleton_golem + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:skeleton_golem` |
| `characters/skeleton_mage.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — skeleton_mage + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:skeleton_mage` |
| `characters/skeleton_minion.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — skeleton_minion + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:skeleton_minion` |
| `characters/skeleton_rogue.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — skeleton_rogue + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:skeleton_rogue` |
| `characters/skeleton_warrior.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — skeleton_warrior + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:skeleton_warrior` |
| `characters/superhero.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — superhero + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:superhero` |
| `characters/toysoldier.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — toysoldier + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:toysoldier` |
| `characters/vampire.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — vampire + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:vampire` |
| `characters/werewolf_man.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — werewolf_man + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:werewolf_man` |
| `characters/werewolf_wolf.glb` | market | KayKit Complete Collection v6.1 (Kay Lousberg) — werewolf_wolf + 64 anim clips (Rig_Medium) | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `character:werewolf_wolf` |

| `dungeon/banner_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_brown` |
| `dungeon/banner_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_green` |
| `dungeon/banner_patterna_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternA_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patterna_blue` |
| `dungeon/banner_patterna_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternA_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patterna_brown` |
| `dungeon/banner_patterna_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternA_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patterna_green` |
| `dungeon/banner_patterna_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternA_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patterna_red` |
| `dungeon/banner_patterna_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternA_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patterna_yellow` |
| `dungeon/banner_patternb_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternB_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternb_blue` |
| `dungeon/banner_patternb_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternB_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternb_brown` |
| `dungeon/banner_patternb_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternB_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternb_green` |
| `dungeon/banner_patternb_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternB_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternb_red` |
| `dungeon/banner_patternb_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternB_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternb_white` |
| `dungeon/banner_patternc_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternC_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternc_blue` |
| `dungeon/banner_patternc_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternC_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternc_brown` |
| `dungeon/banner_patternc_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternC_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternc_green` |
| `dungeon/banner_patternc_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternC_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternc_red` |
| `dungeon/banner_patternc_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternC_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternc_white` |
| `dungeon/banner_patternc_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_patternC_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_patternc_yellow` |
| `dungeon/banner_shield_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_shield_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_shield_blue` |
| `dungeon/banner_shield_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_shield_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_shield_brown` |
| `dungeon/banner_shield_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_shield_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_shield_green` |
| `dungeon/banner_shield_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_shield_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_shield_red` |
| `dungeon/banner_shield_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_shield_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_shield_white` |
| `dungeon/banner_shield_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_shield_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_shield_yellow` |
| `dungeon/banner_thin_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_thin_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_thin_brown` |
| `dungeon/banner_thin_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_thin_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_thin_green` |
| `dungeon/banner_thin_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_thin_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_thin_red` |
| `dungeon/banner_thin_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_thin_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_thin_white` |
| `dungeon/banner_thin_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_thin_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_thin_yellow` |
| `dungeon/banner_triple_blue.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_triple_blue.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_triple_blue` |
| `dungeon/banner_triple_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_triple_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_triple_green` |
| `dungeon/banner_triple_red.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_triple_red.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_triple_red` |
| `dungeon/banner_triple_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_triple_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_triple_white` |
| `dungeon/banner_triple_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_triple_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_triple_yellow` |
| `dungeon/banner_white.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_white.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_white` |
| `dungeon/banner_yellow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — banner_yellow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:banner_yellow` |
| `dungeon/bar_outercorner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_outercorner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_outercorner` |
| `dungeon/bar_straight_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_straight_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_straight_a` |
| `dungeon/bar_straight_a_short.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_straight_A_short.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_straight_a_short` |
| `dungeon/bar_straight_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_straight_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_straight_b` |
| `dungeon/bar_straight_b_short.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_straight_B_short.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_straight_b_short` |
| `dungeon/bar_straight_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bar_straight_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bar_straight_c` |
| `dungeon/barrel_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrel_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrel_large` |
| `dungeon/barrel_large_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrel_large_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrel_large_decorated` |
| `dungeon/barrel_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrel_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrel_small` |
| `dungeon/barrel_small_stack.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrel_small_stack.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrel_small_stack` |
| `dungeon/barrier.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrier.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrier` |
| `dungeon/barrier_colum_half.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrier_colum_half.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrier_colum_half` |
| `dungeon/barrier_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrier_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrier_corner` |
| `dungeon/barrier_half.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — barrier_half.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:barrier_half` |
| `dungeon/bartop_a_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bartop_A_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bartop_a_large` |
| `dungeon/bartop_a_medium.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bartop_A_medium.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bartop_a_medium` |
| `dungeon/bartop_a_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bartop_A_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bartop_a_small` |
| `dungeon/bartop_b_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bartop_B_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bartop_b_large` |
| `dungeon/bartop_b_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bartop_B_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bartop_b_small` |
| `dungeon/bed_a_double.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_A_double.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_a_double` |
| `dungeon/bed_a_single.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_A_single.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_a_single` |
| `dungeon/bed_a_stacked.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_A_stacked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_a_stacked` |
| `dungeon/bed_b_double.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_B_double.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_b_double` |
| `dungeon/bed_b_single.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_B_single.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_b_single` |
| `dungeon/bed_floor.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_floor.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_floor` |
| `dungeon/bed_frame.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bed_frame.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bed_frame` |
| `dungeon/bench.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bench.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bench` |
| `dungeon/book_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — book_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:book_brown` |
| `dungeon/book_grey.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — book_grey.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:book_grey` |
| `dungeon/book_tan.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — book_tan.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:book_tan` |
| `dungeon/bookcase_double_decorateda.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bookcase_double_decoratedA.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bookcase_double_decorateda` |
| `dungeon/bookcase_double_decoratedb.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bookcase_double_decoratedB.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bookcase_double_decoratedb` |
| `dungeon/bookcase_single.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bookcase_single.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bookcase_single` |
| `dungeon/bookcase_single_decorateda.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bookcase_single_decoratedA.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bookcase_single_decorateda` |
| `dungeon/bookcase_single_decoratedb.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bookcase_single_decoratedB.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bookcase_single_decoratedb` |
| `dungeon/bottle_a_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_A_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_a_brown` |
| `dungeon/bottle_a_labeled_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_A_labeled_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_a_labeled_brown` |
| `dungeon/bottle_a_labeled_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_A_labeled_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_a_labeled_green` |
| `dungeon/bottle_b_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_B_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_b_brown` |
| `dungeon/bottle_b_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_B_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_b_green` |
| `dungeon/bottle_c_brown.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_C_brown.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_c_brown` |
| `dungeon/bottle_c_green.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bottle_C_green.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bottle_c_green` |
| `dungeon/box_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — box_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:box_small` |
| `dungeon/box_small_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — box_small_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:box_small_decorated` |
| `dungeon/box_stacked.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — box_stacked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:box_stacked` |
| `dungeon/bucket.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bucket.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bucket` |
| `dungeon/bucket_pickaxes.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — bucket_pickaxes.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:bucket_pickaxes` |
| `dungeon/candle.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — candle.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:candle` |
| `dungeon/candle_lit.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — candle_lit.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:candle_lit` |
| `dungeon/candle_thin.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — candle_thin.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:candle_thin` |
| `dungeon/candle_thin_lit.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — candle_thin_lit.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:candle_thin_lit` |
| `dungeon/candle_triple.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — candle_triple.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:candle_triple` |
| `dungeon/ceiling_tile.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — ceiling_tile.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:ceiling_tile` |
| `dungeon/chair.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — chair.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:chair` |
| `dungeon/chest.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — chest.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:chest` |
| `dungeon/chest_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — chest_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:chest_large` |
| `dungeon/chest_large_gold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — chest_large_gold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:chest_large_gold` |
| `dungeon/chest_mimic.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — chest_mimic.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:chest_mimic` |
| `dungeon/coin.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — coin.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:coin` |
| `dungeon/coin_stack_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — coin_stack_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:coin_stack_large` |
| `dungeon/coin_stack_medium.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — coin_stack_medium.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:coin_stack_medium` |
| `dungeon/column.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — column.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:column` |
| `dungeon/crate_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — crate_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:crate_large` |
| `dungeon/crate_large_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — crate_large_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:crate_large_decorated` |
| `dungeon/crate_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — crate_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:crate_small` |
| `dungeon/crates_stacked.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — crates_stacked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:crates_stacked` |
| `dungeon/floor_dirt_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_large` |
| `dungeon/floor_dirt_small_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_small_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_small_a` |
| `dungeon/floor_dirt_small_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_small_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_small_b` |
| `dungeon/floor_dirt_small_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_small_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_small_c` |
| `dungeon/floor_dirt_small_d.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_small_D.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_small_d` |
| `dungeon/floor_dirt_small_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_small_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_small_corner` |
| `dungeon/floor_dirt_small_weeds.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_dirt_small_weeds.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_dirt_small_weeds` |
| `dungeon/floor_foundation_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_foundation_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_foundation_corner` |
| `dungeon/floor_foundation_diagonal_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_foundation_diagonal_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_foundation_diagonal_corner` |
| `dungeon/floor_foundation_front.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_foundation_front.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_foundation_front` |
| `dungeon/floor_foundation_front_and_back.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_foundation_front_and_back.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_foundation_front_and_back` |
| `dungeon/floor_foundation_front_and_sides.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_foundation_front_and_sides.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_foundation_front_and_sides` |
| `dungeon/floor_tile_big_grate.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_big_grate.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_big_grate` |
| `dungeon/floor_tile_big_spikes.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_big_spikes.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_big_spikes` |
| `dungeon/floor_tile_extralarge_grates.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_extralarge_grates.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_extralarge_grates` |
| `dungeon/floor_tile_extralarge_grates_open.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_extralarge_grates_open.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_extralarge_grates_open` |
| `dungeon/floor_tile_grate.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_grate.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_grate` |
| `dungeon/floor_tile_grate_open.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_grate_open.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_grate_open` |
| `dungeon/floor_tile_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_large` |
| `dungeon/floor_tile_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small` |
| `dungeon/floor_tile_small_broken_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small_broken_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small_broken_a` |
| `dungeon/floor_tile_small_broken_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small_broken_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small_broken_b` |
| `dungeon/floor_tile_small_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small_corner` |
| `dungeon/floor_tile_small_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small_decorated` |
| `dungeon/floor_tile_small_weeds_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_tile_small_weeds_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_tile_small_weeds_a` |
| `dungeon/floor_wood_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_wood_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_wood_large` |
| `dungeon/floor_wood_large_dark.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_wood_large_dark.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_wood_large_dark` |
| `dungeon/floor_wood_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_wood_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_wood_small` |
| `dungeon/floor_wood_small_dark.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — floor_wood_small_dark.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:floor_wood_small_dark` |
| `dungeon/keg.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — keg.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:keg` |
| `dungeon/keg_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — keg_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:keg_decorated` |
| `dungeon/key_gold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — key_gold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:key_gold` |
| `dungeon/keyring.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — keyring.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:keyring` |
| `dungeon/keyring_hanging.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — keyring_hanging.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:keyring_hanging` |
| `dungeon/pickaxe.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — pickaxe.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:pickaxe` |
| `dungeon/pickaxe_gold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — pickaxe_gold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:pickaxe_gold` |
| `dungeon/pillar.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — pillar.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:pillar` |
| `dungeon/plate.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — plate.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:plate` |
| `dungeon/plate_food_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — plate_food_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:plate_food_a` |
| `dungeon/plate_food_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — plate_food_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:plate_food_b` |
| `dungeon/plate_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — plate_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:plate_small` |
| `dungeon/plate_stack.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — plate_stack.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:plate_stack` |
| `dungeon/post.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — post.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:post` |
| `dungeon/rocks_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — rocks_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:rocks_decorated` |
| `dungeon/rocks_gold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — rocks_gold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:rocks_gold` |
| `dungeon/rocks_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — rocks_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:rocks_small` |
| `dungeon/rubble_half.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — rubble_half.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:rubble_half` |
| `dungeon/rubble_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — rubble_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:rubble_large` |
| `dungeon/scaffold_beam_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_beam_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_beam_corner` |
| `dungeon/scaffold_beams_connected.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_beams_connected.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_beams_connected` |
| `dungeon/scaffold_frame_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_frame_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_frame_large` |
| `dungeon/scaffold_frame_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_frame_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_frame_small` |
| `dungeon/scaffold_pillar_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillar_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillar_corner` |
| `dungeon/scaffold_pillar_wall.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillar_wall.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillar_wall` |
| `dungeon/scaffold_pillar_wall_cross.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillar_wall_cross.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillar_wall_cross` |
| `dungeon/scaffold_pillar_wall_torch.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillar_wall_torch.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillar_wall_torch` |
| `dungeon/scaffold_pillars_connected.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillars_connected.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillars_connected` |
| `dungeon/scaffold_pillars_connected_torch.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — scaffold_pillars_connected_torch.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:scaffold_pillars_connected_torch` |
| `dungeon/shelf_large.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — shelf_large.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:shelf_large` |
| `dungeon/shelf_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — shelf_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:shelf_small` |
| `dungeon/shelf_small_books.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — shelf_small_books.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:shelf_small_books` |
| `dungeon/shelf_small_candles.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — shelf_small_candles.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:shelf_small_candles` |
| `dungeon/shelves_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — shelves_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:shelves_decorated` |
| `dungeon/stairs.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs` |
| `dungeon/stairs_long.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_long.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_long` |
| `dungeon/stairs_long_modular_center.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_long_modular_center.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_long_modular_center` |
| `dungeon/stairs_long_modular_left.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_long_modular_left.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_long_modular_left` |
| `dungeon/stairs_long_modular_right.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_long_modular_right.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_long_modular_right` |
| `dungeon/stairs_modular_left.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_modular_left.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_modular_left` |
| `dungeon/stairs_modular_right.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_modular_right.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_modular_right` |
| `dungeon/stairs_narrow.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_narrow.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_narrow` |
| `dungeon/stairs_wall_left.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_wall_left.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_wall_left` |
| `dungeon/stairs_wall_right.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_wall_right.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_wall_right` |
| `dungeon/stairs_walled.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_walled.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_walled` |
| `dungeon/stairs_wood.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_wood.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_wood` |
| `dungeon/stairs_wood_decorated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stairs_wood_decorated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stairs_wood_decorated` |
| `dungeon/stool.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stool.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stool` |
| `dungeon/stool_round.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — stool_round.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:stool_round` |
| `dungeon/sword_shield.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — sword_shield.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:sword_shield` |
| `dungeon/sword_shield_broken.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — sword_shield_broken.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:sword_shield_broken` |
| `dungeon/table_long.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long` |
| `dungeon/table_long_broken.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long_broken.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long_broken` |
| `dungeon/table_long_decorated_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long_decorated_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long_decorated_a` |
| `dungeon/table_long_decorated_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long_decorated_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long_decorated_b` |
| `dungeon/table_long_decorated_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long_decorated_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long_decorated_c` |
| `dungeon/table_long_tablecloth.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_long_tablecloth.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_long_tablecloth` |
| `dungeon/table_medium.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_medium.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_medium` |
| `dungeon/table_medium_broken.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_medium_broken.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_medium_broken` |
| `dungeon/table_medium_decorated_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_medium_decorated_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_medium_decorated_a` |
| `dungeon/table_medium_decorated_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_medium_decorated_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_medium_decorated_b` |
| `dungeon/table_medium_tablecloth.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_medium_tablecloth.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_medium_tablecloth` |
| `dungeon/table_medium_tablecloth_decorated_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_medium_tablecloth_decorated_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_medium_tablecloth_decorated_b` |
| `dungeon/table_round_medium.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_round_medium.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_round_medium` |
| `dungeon/table_round_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_round_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_round_small` |
| `dungeon/table_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_small` |
| `dungeon/table_small_decorated_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_small_decorated_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_small_decorated_a` |
| `dungeon/table_small_decorated_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_small_decorated_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_small_decorated_b` |
| `dungeon/table_small_decorated_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — table_small_decorated_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:table_small_decorated_c` |
| `dungeon/torch_lit.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — torch_lit.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:torch_lit` |
| `dungeon/torch_mounted.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — torch_mounted.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:torch_mounted` |
| `dungeon/trunk_large_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_large_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_large_a` |
| `dungeon/trunk_large_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_large_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_large_b` |
| `dungeon/trunk_large_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_large_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_large_c` |
| `dungeon/trunk_medium_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_medium_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_medium_a` |
| `dungeon/trunk_medium_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_medium_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_medium_c` |
| `dungeon/trunk_small_a.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_small_A.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_small_a` |
| `dungeon/trunk_small_b.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_small_B.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_small_b` |
| `dungeon/trunk_small_c.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — trunk_small_C.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:trunk_small_c` |
| `dungeon/wall.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall` |
| `dungeon/wall_tsplit.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_Tsplit.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_tsplit` |
| `dungeon/wall_arched.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_arched.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_arched` |
| `dungeon/wall_archedwindow_gated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_archedwindow_gated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_archedwindow_gated` |
| `dungeon/wall_archedwindow_gated_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_archedwindow_gated_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_archedwindow_gated_scaffold` |
| `dungeon/wall_archedwindow_open.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_archedwindow_open.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_archedwindow_open` |
| `dungeon/wall_broken.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_broken.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_broken` |
| `dungeon/wall_corner.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_corner.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_corner` |
| `dungeon/wall_corner_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_corner_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_corner_scaffold` |
| `dungeon/wall_corner_small.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_corner_small.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_corner_small` |
| `dungeon/wall_cracked.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_cracked.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_cracked` |
| `dungeon/wall_crossing.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_crossing.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_crossing` |
| `dungeon/wall_doorway.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_doorway.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_doorway` |
| `dungeon/wall_doorway_tsplit.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_doorway_Tsplit.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_doorway_tsplit` |
| `dungeon/wall_doorway_sides.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_doorway_sides.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_doorway_sides` |
| `dungeon/wall_endcap.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_endcap.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_endcap` |
| `dungeon/wall_gated.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_gated.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_gated` |
| `dungeon/wall_half.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_half.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_half` |
| `dungeon/wall_half_endcap.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_half_endcap.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_half_endcap` |
| `dungeon/wall_half_endcap_sloped.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_half_endcap_sloped.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_half_endcap_sloped` |
| `dungeon/wall_inset_candles.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_inset_candles.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_inset_candles` |
| `dungeon/wall_inset_shelves.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_inset_shelves.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_inset_shelves` |
| `dungeon/wall_inset_shelves_broken.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_inset_shelves_broken.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_inset_shelves_broken` |
| `dungeon/wall_inset_shelves_decorateda.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_inset_shelves_decoratedA.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_inset_shelves_decorateda` |
| `dungeon/wall_inset_shelves_decoratedb.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_inset_shelves_decoratedB.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_inset_shelves_decoratedb` |
| `dungeon/wall_open_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_open_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_open_scaffold` |
| `dungeon/wall_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_scaffold` |
| `dungeon/wall_shelves.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_shelves.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_shelves` |
| `dungeon/wall_sloped.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_sloped.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_sloped` |
| `dungeon/wall_window_closed.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_window_closed.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_window_closed` |
| `dungeon/wall_window_closed_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_window_closed_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_window_closed_scaffold` |
| `dungeon/wall_window_open.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_window_open.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_window_open` |
| `dungeon/wall_window_open_scaffold.glb` | market | KayKit Dungeon Pack (Kay Lousberg) — wall_window_open_scaffold.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `dungeon:wall_window_open_scaffold` |

| `nature/bush_1_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_b_color1` |
| `nature/bush_1_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_c_color1` |
| `nature/bush_1_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_d_color1` |
| `nature/bush_1_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_f_color1` |
| `nature/bush_1_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_1_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_1_g_color1` |
| `nature/bush_2_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_2_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_2_a_color1` |
| `nature/bush_2_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_2_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_2_b_color1` |
| `nature/bush_2_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_2_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_2_d_color1` |
| `nature/bush_2_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_2_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_2_e_color1` |
| `nature/bush_2_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_2_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_2_f_color1` |
| `nature/bush_3_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_3_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_3_a_color1` |
| `nature/bush_3_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_3_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_3_c_color1` |
| `nature/bush_4_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_4_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_4_a_color1` |
| `nature/bush_4_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_4_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_4_b_color1` |
| `nature/bush_4_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_4_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_4_c_color1` |
| `nature/bush_4_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_4_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_4_e_color1` |
| `nature/bush_4_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Bush_4_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:bush_4_f_color1` |
| `nature/grass_1_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_a_color1` |
| `nature/grass_1_a_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_A_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_a_singlesided_color1` |
| `nature/grass_1_b_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_B_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_b_singlesided_color1` |
| `nature/grass_1_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_c_color1` |
| `nature/grass_1_c_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_C_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_c_singlesided_color1` |
| `nature/grass_1_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_1_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_1_d_color1` |
| `nature/grass_2_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_a_color1` |
| `nature/grass_2_a_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_A_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_a_singlesided_color1` |
| `nature/grass_2_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_b_color1` |
| `nature/grass_2_b_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_B_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_b_singlesided_color1` |
| `nature/grass_2_c_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_C_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_c_singlesided_color1` |
| `nature/grass_2_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_d_color1` |
| `nature/grass_2_d_singlesided_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Grass_2_D_Singlesided_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:grass_2_d_singlesided_color1` |
| `nature/hill_12x12x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_12x12x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_12x12x2_color1` |
| `nature/hill_12x12x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_12x12x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_12x12x8_color1` |
| `nature/hill_12x6x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_12x6x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_12x6x2_color1` |
| `nature/hill_12x6x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_12x6x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_12x6x4_color1` |
| `nature/hill_12x6x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_12x6x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_12x6x8_color1` |
| `nature/hill_2x2x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_2x2x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_2x2x4_color1` |
| `nature/hill_2x2x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_2x2x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_2x2x8_color1` |
| `nature/hill_4x2x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_4x2x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_4x2x2_color1` |
| `nature/hill_4x2x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_4x2x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_4x2x4_color1` |
| `nature/hill_4x4x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_4x4x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_4x4x2_color1` |
| `nature/hill_4x4x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_4x4x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_4x4x4_color1` |
| `nature/hill_4x4x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_4x4x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_4x4x8_color1` |
| `nature/hill_8x4x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_8x4x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_8x4x2_color1` |
| `nature/hill_8x4x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_8x4x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_8x4x8_color1` |
| `nature/hill_8x8x2_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_8x8x2_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_8x8x2_color1` |
| `nature/hill_8x8x4_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_8x8x4_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_8x8x4_color1` |
| `nature/hill_8x8x8_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_8x8x8_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_8x8x8_color1` |
| `nature/hill_cliff_a_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_A_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_a_outercorner_color1` |
| `nature/hill_cliff_b_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_B_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_b_side_color1` |
| `nature/hill_cliff_c_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_C_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_c_innercorner_color1` |
| `nature/hill_cliff_c_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_C_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_c_outercorner_color1` |
| `nature/hill_cliff_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_e_color1` |
| `nature/hill_cliff_f_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_F_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_f_side_color1` |
| `nature/hill_cliff_g_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_G_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_g_innercorner_color1` |
| `nature/hill_cliff_g_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_G_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_g_outercorner_color1` |
| `nature/hill_cliff_i_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_I_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_i_innercorner_color1` |
| `nature/hill_cliff_i_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_I_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_i_outercorner_color1` |
| `nature/hill_cliff_tall_a_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_A_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_a_innercorner_color1` |
| `nature/hill_cliff_tall_a_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_A_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_a_outercorner_color1` |
| `nature/hill_cliff_tall_c_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_C_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_c_innercorner_color1` |
| `nature/hill_cliff_tall_c_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_C_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_c_outercorner_color1` |
| `nature/hill_cliff_tall_d_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_D_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_d_side_color1` |
| `nature/hill_cliff_tall_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_e_color1` |
| `nature/hill_cliff_tall_g_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_G_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_g_innercorner_color1` |
| `nature/hill_cliff_tall_g_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_G_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_g_outercorner_color1` |
| `nature/hill_cliff_tall_h_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_H_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_h_side_color1` |
| `nature/hill_cliff_tall_i_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Cliff_Tall_I_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_cliff_tall_i_innercorner_color1` |
| `nature/hill_top_a_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_A_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_a_innercorner_color1` |
| `nature/hill_top_a_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_A_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_a_outercorner_color1` |
| `nature/hill_top_b_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_B_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_b_side_color1` |
| `nature/hill_top_c_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_C_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_c_innercorner_color1` |
| `nature/hill_top_d_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_D_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_d_side_color1` |
| `nature/hill_top_e_cap_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_E_Cap_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_e_cap_color1` |
| `nature/hill_top_e_center_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_E_Center_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_e_center_color1` |
| `nature/hill_top_f_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_F_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_f_side_color1` |
| `nature/hill_top_g_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_G_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_g_outercorner_color1` |
| `nature/hill_top_h_side_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_H_Side_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_h_side_color1` |
| `nature/hill_top_i_innercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_I_InnerCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_i_innercorner_color1` |
| `nature/hill_top_i_outercorner_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Hill_Top_I_OuterCorner_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:hill_top_i_outercorner_color1` |
| `nature/rock_1_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_b_color1` |
| `nature/rock_1_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_c_color1` |
| `nature/rock_1_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_d_color1` |
| `nature/rock_1_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_f_color1` |
| `nature/rock_1_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_g_color1` |
| `nature/rock_1_h_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_H_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_h_color1` |
| `nature/rock_1_i_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_I_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_i_color1` |
| `nature/rock_1_k_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_K_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_k_color1` |
| `nature/rock_1_l_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_L_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_l_color1` |
| `nature/rock_1_m_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_M_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_m_color1` |
| `nature/rock_1_n_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_N_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_n_color1` |
| `nature/rock_1_p_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_P_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_p_color1` |
| `nature/rock_1_q_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_1_Q_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_1_q_color1` |
| `nature/rock_2_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_a_color1` |
| `nature/rock_2_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_b_color1` |
| `nature/rock_2_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_d_color1` |
| `nature/rock_2_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_e_color1` |
| `nature/rock_2_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_f_color1` |
| `nature/rock_2_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_2_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_2_g_color1` |
| `nature/rock_3_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_a_color1` |
| `nature/rock_3_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_b_color1` |
| `nature/rock_3_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_c_color1` |
| `nature/rock_3_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_d_color1` |
| `nature/rock_3_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_f_color1` |
| `nature/rock_3_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_g_color1` |
| `nature/rock_3_h_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_H_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_h_color1` |
| `nature/rock_3_i_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_I_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_i_color1` |
| `nature/rock_3_k_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_K_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_k_color1` |
| `nature/rock_3_l_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_L_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_l_color1` |
| `nature/rock_3_m_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_M_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_m_color1` |
| `nature/rock_3_n_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_N_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_n_color1` |
| `nature/rock_3_p_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_P_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_p_color1` |
| `nature/rock_3_q_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_Q_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_q_color1` |
| `nature/rock_3_r_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_3_R_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_3_r_color1` |
| `nature/rock_4_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_a_color1` |
| `nature/rock_4_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_c_color1` |
| `nature/rock_4_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_d_color1` |
| `nature/rock_4_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_e_color1` |
| `nature/rock_4_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_f_color1` |
| `nature/rock_4_h_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_4_H_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_4_h_color1` |
| `nature/rock_5_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_a_color1` |
| `nature/rock_5_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_b_color1` |
| `nature/rock_5_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_c_color1` |
| `nature/rock_5_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_e_color1` |
| `nature/rock_5_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_f_color1` |
| `nature/rock_5_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_g_color1` |
| `nature/rock_5_h_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_5_H_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_5_h_color1` |
| `nature/rock_6_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_b_color1` |
| `nature/rock_6_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_c_color1` |
| `nature/rock_6_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_d_color1` |
| `nature/rock_6_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_e_color1` |
| `nature/rock_6_g_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_G_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_g_color1` |
| `nature/rock_6_h_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Rock_6_H_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:rock_6_h_color1` |
| `nature/tree_1_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_1_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_1_a_color1` |
| `nature/tree_1_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_1_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_1_b_color1` |
| `nature/tree_2_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_2_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_2_a_color1` |
| `nature/tree_2_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_2_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_2_b_color1` |
| `nature/tree_2_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_2_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_2_c_color1` |
| `nature/tree_2_d_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_2_D_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_2_d_color1` |
| `nature/tree_3_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_3_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_3_a_color1` |
| `nature/tree_3_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_3_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_3_b_color1` |
| `nature/tree_3_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_3_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_3_c_color1` |
| `nature/tree_4_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_4_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_4_a_color1` |
| `nature/tree_4_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_4_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_4_c_color1` |
| `nature/tree_5_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_5_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_5_a_color1` |
| `nature/tree_5_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_5_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_5_b_color1` |
| `nature/tree_5_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_5_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_5_c_color1` |
| `nature/tree_5_e_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_5_E_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_5_e_color1` |
| `nature/tree_5_f_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_5_F_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_5_f_color1` |
| `nature/tree_6_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_6_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_6_a_color1` |
| `nature/tree_6_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_6_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_6_b_color1` |
| `nature/tree_7_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_7_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_7_a_color1` |
| `nature/tree_7_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_7_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_7_b_color1` |
| `nature/tree_7_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_7_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_7_c_color1` |
| `nature/tree_bare_1_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_Bare_1_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_bare_1_a_color1` |
| `nature/tree_bare_1_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_Bare_1_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_bare_1_c_color1` |
| `nature/tree_bare_2_a_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_Bare_2_A_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_bare_2_a_color1` |
| `nature/tree_bare_2_b_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_Bare_2_B_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_bare_2_b_color1` |
| `nature/tree_bare_2_c_color1.glb` | market | KayKit Forest Nature Pack 1.0 (Kay Lousberg) — Tree_Bare_2_C_Color1.gltf | CC0 | Kay Lousberg | 2026-07-18 | seed tier — `nature:tree_bare_2_c_color1` |

<!-- Source ∈ ai | market | commission. License must be commercial-safe (prefer CC0). -->
