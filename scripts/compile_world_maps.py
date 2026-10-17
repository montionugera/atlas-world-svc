#!/usr/bin/env python3
"""
World-First Map Compiler (Layer 4) for Atlas World.

Compiles L1-L3 World Spine data (`content/zones/*.json`, `content/towns/*.json`,
`content/bestiary/bestiary.json`, `content/ground_palettes.json`, `content/spine/derived.json`,
`content/world/manifest.json`, `content/world/premises/continent-*.json`,
`content/world/civil/pinned-roster.json`) into playable Unified Map Documents v3
(`content/maps/<mapId>.json`) consumed by both `server-rs` and `game-client`.

Covers all 13 Continents (`c01..c13`), all 40 Surveyed Zones (`content/zones/zone-*.json`),
all 10 Story Regions, and all 116 Bestiary creatures across 44 playable v3 maps:
- 10 Wealdmarch (`c02`) maps (`freja-south-gate` + 9 authored `ZONE_CONFIGS` maps)
- 30 Auto-discovered surveyed zone maps across `c03` (`Coldreach`), `c04` (`Stonemoor`),
  `c05` (`Thirstwold`), `c06` (`Reedstrand`), `c07` (`Driftholt`), `c08` (`Wracklow`),
  `c09` (`Brightfall`), and `c10` (`Ashen Spar`)
- 4 Frontier Continent Anchor Maps (`rimewall-cap` on `c01`, `quillreef-atoll` on `c11`,
  `skerryfast-fjord` on `c12`, `loamspit-bar` on `c13`)

Enforces the Chibi Scale Anchor:
- playerScaleBandM: [0.90, 1.20]
- grass maxHeightM <= 0.35m
- bush maxHeightM <= 0.65m
- terrace step <= 0.25m, cliff slope wall > 38 deg
- main road >= 12m (or authored cart width), footpath >= 4m
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
ZONES_DIR = CONTENT_DIR / "zones"
TOWNS_DIR = CONTENT_DIR / "towns"
MAPS_DIR = CONTENT_DIR / "maps"
WORLD_DIR = CONTENT_DIR / "world"
WORLD_MANIFEST_PATH = WORLD_DIR / "manifest.json"
CONTINENT_ROSTER_PATH = WORLD_DIR / "canon" / "continent-roster.json"
PREMISES_DIR = WORLD_DIR / "premises"
RESOLVED_DIR = WORLD_DIR / "resolved"
PINNED_ROSTER_PATH = WORLD_DIR / "civil" / "pinned-roster.json"
BESTIARY_PATH = CONTENT_DIR / "bestiary" / "bestiary.json"
GROUND_PALETTES_PATH = CONTENT_DIR / "ground_palettes.json"
DERIVED_SPINE_PATH = CONTENT_DIR / "spine" / "derived.json"
STORY_REGIONS_PATH = CONTENT_DIR / "story" / "regions.json"

CHIBI_PLAYER_SCALE_BAND = [0.9, 1.2]

# Authoritative configuration for all 9 compiled Wealdmarch (c02) surveyed zone maps
# (plus freja-south-gate which binds the 10th Wealdmarch surveyed zone: meltwash-terrace / c02/r16).
ZONE_CONFIGS: list[dict[str, Any]] = [
    {
        "mapId": "millcross-ford",
        "displayName": "Millcross Ford — The Meltwash Crossing",
        "zoneFile": "zone-millcross-ford.json",
        "regionId": "c02/r21",
        "spineNodeId": "n-millcross",
        "townId": "c-town-millcross",
        "storyRegionId": "region-millcross",
        "bestiaryRegion": "millcross",
        "expectedMobCount": 19,
        "biome": "wealdmarch_river_ford",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "meadow_grass",
        "terrainAmplitude": 0.85,
        "defaultTimeOfDayHours": 10.5,
        "useMillcrossTownPlan": True,
    },
    {
        "mapId": "thornveil",
        "displayName": "Thornveil — The Heartwood Bramble",
        "zoneFile": "zone-thornveil.json",
        "regionId": "c02/r30",
        "spineNodeId": "n-thornveil",
        "townId": "",
        "storyRegionId": "region-thornveil",
        "bestiaryRegion": "thornveil",
        "expectedMobCount": 14,
        "biome": "wealdmarch_bramble_veil",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "pine_forest_border",
        "terrainAmplitude": 1.25,
        "defaultTimeOfDayHours": 15.5,
        "routes": [
            {
                "id": "thornveil_raider_trunk",
                "groundId": "cobble_road",
                "width": 12.0,
                "clearMargin": 2.4,
                "points": [[-85.0, 0.0], [-25.0, -4.0], [25.0, 4.0], [85.0, 0.0]],
            },
            {
                "id": "heartwood_canopy_footpath",
                "groundId": "cobble_road",
                "width": 4.5,
                "clearMargin": 1.8,
                "points": [[0.0, -65.0], [0.0, 0.0], [14.0, 48.0]],
            },
        ],
        "groundZones": [
            {
                "id": "heartwood_central_glade",
                "groundId": "meadow_grass",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 24.0,
                "innerRadius": 0.0,
                "outerRadius": 24.0,
                "width": 48.0,
                "height": 48.0,
                "feather": 4.5,
            },
            {
                "id": "crown_thickets_bramble_ring",
                "groundId": "pine_forest_border",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 195.0,
                "innerRadius": 24.0,
                "outerRadius": 195.0,
                "width": 390.0,
                "height": 390.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_heartwood_mound", "x": 0.0, "z": -16.0, "radius": 16.0, "height": 2.3, "falloff": 0.46},
            {"id": "crown_thickets_west_ridge", "x": -20.0, "z": 10.0, "radius": 13.0, "height": 2.1, "falloff": 0.48},
            {"id": "thorn_wall_sheer_crag", "x": 28.0, "z": -22.0, "radius": 10.0, "height": 4.4, "falloff": 0.16},
        ],
        "structures": [
            {"id": "thornveil_raider_watchtower_01", "kind": "watchtower", "x": -11.0, "z": -4.0, "rotY": 0.0, "radius": 3.6, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "heartwood_root_cavern_01", "kind": "crystal_cave", "x": 12.0, "z": -6.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_the_heartwood_tree", "assetPath": "res://assets/nature/tree_3_a_color1.glb", "x": 0.0, "y": 2.3, "z": -16.0, "rotY": 0.0, "scale": 1.35, "blocksMovement": True, "colliderHalfExtent": 0.85},
            {"id": "landmark_crown_thickets_pillar", "assetPath": "res://assets/dungeon/pillar.glb", "x": 6.5, "y": 1.4, "z": -12.0, "rotY": 0.4, "scale": 1.1, "blocksMovement": True, "colliderHalfExtent": 0.65},
        ],
    },
    {
        "mapId": "ashvale-front",
        "displayName": "Ashvale Front — The Alkali Cut Lines",
        "zoneFile": "zone-ashvale-front.json",
        "regionId": "c02/r01",
        "spineNodeId": "n-cluster1",
        "townId": "c-town-embervale",
        "storyRegionId": "region-ashvale-front",
        "bestiaryRegion": "c02/r11",
        "expectedMobCount": 26,
        "biome": "wealdmarch_alkali_front",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "meadow_grass",
        "terrainAmplitude": 0.75,
        "defaultTimeOfDayHours": 17.5,
        "routes": [
            {
                "id": "embervale_norhollow_war_road",
                "groundId": "cobble_road",
                "width": 14.0,
                "clearMargin": 2.6,
                "points": [[0.0, -95.0], [0.0, -25.0], [0.0, 25.0], [0.0, 95.0]],
            },
            {
                "id": "abandoned_cut_line_trench_path",
                "groundId": "cobble_road",
                "width": 5.0,
                "clearMargin": 2.0,
                "points": [[-70.0, -8.0], [0.0, -8.0], [70.0, -8.0]],
            },
        ],
        "groundZones": [
            {
                "id": "alkali_dust_battle_flat",
                "groundId": "barren_cliff",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 28.0,
                "innerRadius": 0.0,
                "outerRadius": 28.0,
                "width": 56.0,
                "height": 56.0,
                "feather": 5.0,
            },
            {
                "id": "southern_lip_loam_verge",
                "groundId": "meadow_grass",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 28.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_grave_rows_knoll", "x": -18.0, "z": -14.0, "radius": 15.0, "height": 1.9, "falloff": 0.48},
            {"id": "abandoned_cut_lines_redoubt", "x": 18.0, "z": 12.0, "radius": 14.0, "height": 2.2, "falloff": 0.45},
            {"id": "alkali_scarp_mesa", "x": -28.0, "z": 24.0, "radius": 10.0, "height": 4.1, "falloff": 0.16},
        ],
        "structures": [
            {"id": "ashvale_siege_watchtower_01", "kind": "watchtower", "x": -12.0, "z": -6.0, "rotY": 0.0, "radius": 3.8, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "ashvale_sunken_bunker_01", "kind": "crystal_cave", "x": 14.0, "z": -4.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_grave_rows_headstone_w", "assetPath": "res://assets/dungeon/pillar.glb", "x": -8.0, "y": 1.2, "z": -12.0, "rotY": 0.0, "scale": 1.05, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_grave_rows_headstone_e", "assetPath": "res://assets/dungeon/pillar.glb", "x": 8.0, "y": 1.2, "z": -12.0, "rotY": 0.0, "scale": 1.05, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_cut_line_banner", "assetPath": "res://assets/dungeon/banner_patterna_red.glb", "x": -5.0, "y": 1.1, "z": -8.0, "rotY": 0.0, "scale": 1.1, "blocksMovement": False, "colliderHalfExtent": 0.4},
        ],
    },
    {
        "mapId": "northern-icefield",
        "displayName": "Northern Icefield — The Oath-Gate Shelf",
        "zoneFile": "zone-northern-icefield.json",
        "regionId": "c02/r24",
        "spineNodeId": "n-northern-icefield",
        "townId": "",
        "storyRegionId": "region-icefield",
        "bestiaryRegion": "northern-icefield",
        "expectedMobCount": 13,
        "biome": "wealdmarch_glacial_shelf",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "barren_cliff",
        "terrainAmplitude": 1.45,
        "defaultTimeOfDayHours": 11.5,
        "routes": [
            {
                "id": "oath_gate_sled_road",
                "groundId": "cobble_road",
                "width": 12.5,
                "clearMargin": 2.5,
                "points": [[0.0, 90.0], [0.0, 20.0], [0.0, -25.0], [0.0, -85.0]],
            },
            {
                "id": "meltwater_head_footpath",
                "groundId": "cobble_road",
                "width": 4.2,
                "clearMargin": 1.8,
                "points": [[-55.0, 12.0], [0.0, 4.0], [55.0, -10.0]],
            },
        ],
        "groundZones": [
            {
                "id": "oath_gate_gravel_head",
                "groundId": "barren_cliff",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 30.0,
                "innerRadius": 0.0,
                "outerRadius": 30.0,
                "width": 60.0,
                "height": 60.0,
                "feather": 5.0,
            },
            {
                "id": "sub_shelf_tundra_margin",
                "groundId": "pine_forest_border",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 30.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_oath_gate_lip", "x": 0.0, "z": -18.0, "radius": 16.0, "height": 2.4, "falloff": 0.45},
            {"id": "meltwater_head_terrace", "x": 19.0, "z": 10.0, "radius": 13.0, "height": 2.0, "falloff": 0.48},
            {"id": "the_crevasse_shelf_wall", "x": -27.0, "z": -20.0, "radius": 11.0, "height": 4.5, "falloff": 0.15},
        ],
        "structures": [
            {"id": "oath_gate_sentinel_watchtower_01", "kind": "watchtower", "x": -9.5, "z": -12.0, "rotY": 0.0, "radius": 3.8, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "crevasse_shelf_ice_cavern_01", "kind": "crystal_cave", "x": 11.5, "z": -8.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_oath_gate_pillar_w", "assetPath": "res://assets/dungeon/pillar.glb", "x": -4.8, "y": 2.4, "z": -16.0, "rotY": 0.0, "scale": 1.2, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_oath_gate_pillar_e", "assetPath": "res://assets/dungeon/pillar.glb", "x": 4.8, "y": 2.4, "z": -16.0, "rotY": 0.0, "scale": 1.2, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_stoneguard_banner", "assetPath": "res://assets/dungeon/banner_patterna_white.glb", "x": -3.5, "y": 2.4, "z": -15.0, "rotY": 0.0, "scale": 1.1, "blocksMovement": False, "colliderHalfExtent": 0.4},
        ],
    },
    {
        "mapId": "cindervast",
        "displayName": "Cindervast — The Intact Ruin & Dead Gate",
        "zoneFile": "zone-cindervast.json",
        "regionId": "c02/r02",
        "spineNodeId": "n-cluster1",
        "townId": "c-town-cindervast",
        "storyRegionId": "region-cindervast",
        "bestiaryRegion": "cindervast",
        "expectedMobCount": 15,
        "biome": "wealdmarch_relic_ruin",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "cobble_road",
        "terrainAmplitude": 0.65,
        "defaultTimeOfDayHours": 19.2,
        "routes": [
            {
                "id": "dead_gate_grand_avenue",
                "groundId": "cobble_road",
                "width": 14.0,
                "clearMargin": 2.8,
                "points": [[0.0, 95.0], [0.0, 20.0], [0.0, -20.0], [0.0, -95.0]],
            },
            {
                "id": "giving_king_square_crossway",
                "groundId": "cobble_road",
                "width": 6.0,
                "clearMargin": 2.0,
                "points": [[-65.0, 0.0], [0.0, 0.0], [65.0, 0.0]],
            },
        ],
        "groundZones": [
            {
                "id": "giving_king_statue_plaza",
                "groundId": "cobble_road",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 32.0,
                "innerRadius": 0.0,
                "outerRadius": 32.0,
                "width": 64.0,
                "height": 64.0,
                "feather": 4.0,
            },
            {
                "id": "afterglow_outer_districts",
                "groundId": "barren_cliff",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 32.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_dead_gate_bastion", "x": 0.0, "z": 22.0, "radius": 16.0, "height": 2.3, "falloff": 0.46},
            {"id": "giving_king_north_dais", "x": 0.0, "z": -18.0, "radius": 14.0, "height": 2.1, "falloff": 0.48},
            {"id": "relic_crater_sheer_rim", "x": 28.0, "z": -24.0, "radius": 10.0, "height": 4.3, "falloff": 0.16},
        ],
        "structures": [
            {"id": "dead_gate_outer_watchtower_01", "kind": "watchtower", "x": -10.5, "z": 12.0, "rotY": 0.0, "radius": 3.8, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "cindervast_relic_vault_01", "kind": "crystal_cave", "x": 11.5, "z": -10.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_giving_king_statue_plinth", "assetPath": "res://assets/dungeon/pillar.glb", "x": 0.0, "y": 2.1, "z": -16.0, "rotY": 0.0, "scale": 1.25, "blocksMovement": True, "colliderHalfExtent": 0.7},
            {"id": "landmark_dead_gate_pillar_w", "assetPath": "res://assets/dungeon/pillar.glb", "x": -5.2, "y": 2.3, "z": 20.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_dead_gate_pillar_e", "assetPath": "res://assets/dungeon/pillar.glb", "x": 5.2, "y": 2.3, "z": 20.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
        ],
    },
    {
        "mapId": "emberdown",
        "displayName": "Emberdown — The Terraced Ledges & Coal Adits",
        "zoneFile": "zone-emberdown.json",
        "regionId": "c02/r08",
        "spineNodeId": "n-embervale",
        "townId": "c-town-embervale",
        "storyRegionId": "region-embervale",
        "bestiaryRegion": "embervale",
        "expectedMobCount": 7,
        "biome": "wealdmarch_coal_terraces",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "meadow_grass",
        "terrainAmplitude": 1.15,
        "defaultTimeOfDayHours": 16.8,
        "routes": [
            {
                "id": "embervale_slate_stair_road",
                "groundId": "cobble_road",
                "width": 12.5,
                "clearMargin": 2.4,
                "points": [[0.0, 90.0], [0.0, 22.0], [0.0, -22.0], [0.0, -90.0]],
            },
            {
                "id": "coal_adit_basket_footpath",
                "groundId": "cobble_road",
                "width": 4.5,
                "clearMargin": 1.8,
                "points": [[-60.0, -10.0], [0.0, -10.0], [60.0, -14.0]],
            },
        ],
        "groundZones": [
            {
                "id": "warm_ledge_loam_terrace",
                "groundId": "meadow_grass",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 28.0,
                "innerRadius": 0.0,
                "outerRadius": 28.0,
                "width": 56.0,
                "height": 56.0,
                "feather": 4.5,
            },
            {
                "id": "slag_and_seam_outcrop_ring",
                "groundId": "barren_cliff",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 28.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_terraced_ledges_upper", "x": 0.0, "z": -18.0, "radius": 16.0, "height": 2.4, "falloff": 0.46},
            {"id": "forge_slag_bank_west", "x": -18.0, "z": 10.0, "radius": 13.0, "height": 2.0, "falloff": 0.48},
            {"id": "the_adits_coal_face_cliff", "x": 27.0, "z": -20.0, "radius": 10.0, "height": 4.2, "falloff": 0.16},
        ],
        "structures": [
            {"id": "emberdown_bell_watchtower_01", "kind": "watchtower", "x": -10.0, "z": -6.0, "rotY": 0.0, "radius": 3.6, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "emberdown_seam_adit_cavern_01", "kind": "crystal_cave", "x": 12.0, "z": -10.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_adit_mouth_pillar_w", "assetPath": "res://assets/dungeon/pillar.glb", "x": 9.5, "y": 2.0, "z": -14.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_adit_mouth_pillar_e", "assetPath": "res://assets/dungeon/pillar.glb", "x": 14.5, "y": 2.0, "z": -14.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_embervale_banner", "assetPath": "res://assets/dungeon/banner_patterna_red.glb", "x": -6.0, "y": 1.8, "z": -8.0, "rotY": 0.0, "scale": 1.1, "blocksMovement": False, "colliderHalfExtent": 0.4},
        ],
    },
    {
        "mapId": "gildmark-head",
        "displayName": "Gildmark Head — The Mirror Tower & Mire's Bar",
        "zoneFile": "zone-gildmark-head.json",
        "regionId": "c02/r10",
        "spineNodeId": "n-gildmark",
        "townId": "c-town-gildmark",
        "storyRegionId": "region-gildmark",
        "bestiaryRegion": "gildmark",
        "expectedMobCount": 10,
        "biome": "wealdmarch_harbour_headland",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "meadow_grass",
        "terrainAmplitude": 1.05,
        "defaultTimeOfDayHours": 14.0,
        "routes": [
            {
                "id": "gildmark_harbour_terrace_road",
                "groundId": "cobble_road",
                "width": 13.5,
                "clearMargin": 2.5,
                "points": [[0.0, -90.0], [0.0, -20.0], [0.0, 20.0], [0.0, 90.0]],
            },
            {
                "id": "mires_bar_salvage_footpath",
                "groundId": "cobble_road",
                "width": 4.4,
                "clearMargin": 1.8,
                "points": [[-65.0, 16.0], [0.0, 12.0], [65.0, 18.0]],
            },
        ],
        "groundZones": [
            {
                "id": "dressed_stone_harbour_quays",
                "groundId": "cobble_road",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 26.0,
                "innerRadius": 0.0,
                "outerRadius": 26.0,
                "width": 52.0,
                "height": 52.0,
                "feather": 4.0,
            },
            {
                "id": "salt_tarred_headland_margin",
                "groundId": "pine_forest_border",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 26.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_mirror_tower_promontory", "x": 0.0, "z": -19.0, "radius": 15.0, "height": 2.4, "falloff": 0.45},
            {"id": "the_mires_bar_shoal_ridge", "x": 18.0, "z": 14.0, "radius": 14.0, "height": 1.7, "falloff": 0.50},
            {"id": "seaward_dressed_stone_cliff", "x": -28.0, "z": -22.0, "radius": 10.5, "height": 4.3, "falloff": 0.16},
        ],
        "structures": [
            {"id": "gildmark_mirror_watchtower_01", "kind": "watchtower", "x": -9.0, "z": -12.0, "rotY": 0.0, "radius": 3.8, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "gildmark_smuggler_sea_cave_01", "kind": "crystal_cave", "x": 12.5, "z": -6.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_mirror_tower_beacon_pillar", "assetPath": "res://assets/dungeon/pillar.glb", "x": 0.0, "y": 2.4, "z": -18.0, "rotY": 0.0, "scale": 1.25, "blocksMovement": True, "colliderHalfExtent": 0.7},
            {"id": "landmark_harbour_ledger_pillar", "assetPath": "res://assets/dungeon/pillar.glb", "x": 5.5, "y": 1.5, "z": 6.0, "rotY": 0.0, "scale": 1.1, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_gildmark_council_banner", "assetPath": "res://assets/dungeon/banner_patterna_yellow.glb", "x": -3.8, "y": 2.2, "z": -14.0, "rotY": 0.0, "scale": 1.1, "blocksMovement": False, "colliderHalfExtent": 0.4},
        ],
    },
    {
        "mapId": "hollowmarch",
        "displayName": "Hollowmarch — The Palisade Line & Tally Boards",
        "zoneFile": "zone-hollowmarch.json",
        "regionId": "c02/r14",
        "spineNodeId": "n-norhollow",
        "townId": "c-town-norhollow",
        "storyRegionId": "region-norhollow",
        "bestiaryRegion": "norhollow",
        "expectedMobCount": 7,
        "biome": "wealdmarch_palisade_moor",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "pine_forest_border",
        "terrainAmplitude": 1.10,
        "defaultTimeOfDayHours": 13.2,
        "routes": [
            {
                "id": "norhollow_timber_ore_dragway",
                "groundId": "cobble_road",
                "width": 12.5,
                "clearMargin": 2.4,
                "points": [[0.0, -90.0], [0.0, -20.0], [0.0, 20.0], [0.0, 90.0]],
            },
            {
                "id": "palisade_rim_patrol_footpath",
                "groundId": "cobble_road",
                "width": 4.5,
                "clearMargin": 1.8,
                "points": [[-70.0, -4.0], [0.0, -4.0], [70.0, -4.0]],
            },
        ],
        "groundZones": [
            {
                "id": "tally_boards_gate_clearing",
                "groundId": "meadow_grass",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 26.0,
                "innerRadius": 0.0,
                "outerRadius": 26.0,
                "width": 52.0,
                "height": 52.0,
                "feather": 4.5,
            },
            {
                "id": "standing_timber_and_moor_ring",
                "groundId": "pine_forest_border",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 26.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_palisade_line_rim", "x": 0.0, "z": -17.0, "radius": 16.0, "height": 2.2, "falloff": 0.46},
            {"id": "the_timber_line_ridge", "x": -19.0, "z": 11.0, "radius": 13.5, "height": 2.1, "falloff": 0.48},
            {"id": "the_ore_heads_crag", "x": 27.0, "z": -21.0, "radius": 10.0, "height": 4.2, "falloff": 0.16},
        ],
        "structures": [
            {"id": "norhollow_palisade_watchtower_01", "kind": "watchtower", "x": -10.0, "z": -5.0, "rotY": 0.0, "radius": 3.6, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "hollowmarch_ore_head_adit_01", "kind": "crystal_cave", "x": 12.0, "z": -7.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_the_tally_boards_post_w", "assetPath": "res://assets/dungeon/pillar.glb", "x": -4.5, "y": 1.8, "z": -12.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_the_tally_boards_post_e", "assetPath": "res://assets/dungeon/pillar.glb", "x": 4.5, "y": 1.8, "z": -12.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_norhollow_banner", "assetPath": "res://assets/dungeon/banner_patterna_green.glb", "x": -3.2, "y": 1.8, "z": -10.5, "rotY": 0.0, "scale": 1.1, "blocksMovement": False, "colliderHalfExtent": 0.4},
        ],
    },
    {
        "mapId": "rooktide-reach",
        "displayName": "Rooktide Reach — The Barge-Cranes & Rook Flats",
        "zoneFile": "zone-rooktide-reach.json",
        "regionId": "c02/r28",
        "spineNodeId": "n-rooktide",
        "townId": "c-town-rooktide",
        "storyRegionId": "region-rooktide",
        "bestiaryRegion": "rooktide",
        "expectedMobCount": 5,
        "biome": "wealdmarch_tidal_reach",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "meadow_grass",
        "terrainAmplitude": 0.70,
        "defaultTimeOfDayHours": 9.8,
        "routes": [
            {
                "id": "rooktide_hull_change_causeway",
                "groundId": "cobble_road",
                "width": 12.0,
                "clearMargin": 2.4,
                "points": [[0.0, -88.0], [0.0, -18.0], [0.0, 18.0], [0.0, 88.0]],
            },
            {
                "id": "cut_reed_tidal_footpath",
                "groundId": "cobble_road",
                "width": 4.2,
                "clearMargin": 1.8,
                "points": [[-58.0, 10.0], [0.0, 6.0], [58.0, 14.0]],
            },
        ],
        "groundZones": [
            {
                "id": "barge_cranes_landing_apron",
                "groundId": "cobble_road",
                "priority": 20,
                "shape": "circle",
                "x": 0.0,
                "z": 0.0,
                "radius": 24.0,
                "innerRadius": 0.0,
                "outerRadius": 24.0,
                "width": 48.0,
                "height": 48.0,
                "feather": 4.0,
            },
            {
                "id": "brackish_reed_and_rook_flats",
                "groundId": "meadow_grass",
                "priority": 10,
                "shape": "annulus",
                "x": 0.0,
                "z": 0.0,
                "radius": 190.0,
                "innerRadius": 24.0,
                "outerRadius": 190.0,
                "width": 380.0,
                "height": 380.0,
                "feather": 6.0,
            },
        ],
        "heightTerraces": [
            {"id": "the_barge_cranes_quay", "x": 0.0, "z": -16.0, "radius": 15.0, "height": 1.9, "falloff": 0.48},
            {"id": "the_rook_flats_bank", "x": 16.0, "z": 14.0, "radius": 14.0, "height": 1.5, "falloff": 0.52},
            {"id": "tidal_headland_sheer_stack", "x": -26.0, "z": -20.0, "radius": 9.5, "height": 4.0, "falloff": 0.16},
        ],
        "structures": [
            {"id": "rooktide_harbour_watchtower_01", "kind": "watchtower", "x": -9.5, "z": -8.0, "rotY": 0.0, "radius": 3.6, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
            {"id": "rooktide_tidal_hold_cavern_01", "kind": "crystal_cave", "x": 11.5, "z": -6.0, "rotY": 0.0, "radius": 4.2, "upperFloorHeight": 3.2, "ceilingHeight": 3.4},
        ],
        "props": [
            {"id": "landmark_barge_crane_piling_w", "assetPath": "res://assets/dungeon/pillar.glb", "x": -4.2, "y": 1.9, "z": -14.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_barge_crane_piling_e", "assetPath": "res://assets/dungeon/pillar.glb", "x": 4.2, "y": 1.9, "z": -14.0, "rotY": 0.0, "scale": 1.15, "blocksMovement": True, "colliderHalfExtent": 0.65},
            {"id": "landmark_rooktide_reed_banner", "assetPath": "res://assets/dungeon/banner_patterna_blue.glb", "x": -3.0, "y": 1.8, "z": -12.0, "rotY": 0.0, "scale": 1.1, "blocksMovement": False, "colliderHalfExtent": 0.4},
        ],
    },
]

# Deterministic biome, ground palette, and ecological mob-region mapping for all non-c02 continents
CONTINENT_BIOME_CONFIGS: dict[str, dict[str, Any]] = {
    "c01": {
        "biome": "glacier",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "glacier_snow_crust",
        "centerGroundId": "glacier_snow_crust",
        "ringGroundId": "barren_cliff",
        "paletteKeys": ["cobble_road", "glacier_snow_crust", "barren_cliff", "pine_forest_border"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_white.glb",
        "terrainAmplitude": 1.40,
        "defaultTimeOfDayHours": 11.0,
        "mobRegions": ["northern-icefield", "c02/r11"],
    },
    "c03": {
        "biome": "coldreach_fjord_tundra",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "glacier_snow_crust",
        "centerGroundId": "pine_forest_border",
        "ringGroundId": "glacier_snow_crust",
        "paletteKeys": ["cobble_road", "glacier_snow_crust", "pine_forest_border", "barren_cliff"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_white.glb",
        "terrainAmplitude": 1.35,
        "defaultTimeOfDayHours": 11.5,
        "mobRegions": ["northern-icefield", "norhollow", "gildmark"],
    },
    "c04": {
        "biome": "stonemoor_karst_plateau",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "barren_cliff",
        "centerGroundId": "meadow_grass",
        "ringGroundId": "barren_cliff",
        "paletteKeys": ["cobble_road", "barren_cliff", "meadow_grass", "coastal_tidal_flat"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_yellow.glb",
        "terrainAmplitude": 1.20,
        "defaultTimeOfDayHours": 13.5,
        "mobRegions": ["c02/r11", "norhollow", "gildmark"],
    },
    "c05": {
        "biome": "thirstwold_alkali_erg",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "cinder_ash_waste",
        "centerGroundId": "barren_cliff",
        "ringGroundId": "cinder_ash_waste",
        "paletteKeys": ["cobble_road", "cinder_ash_waste", "barren_cliff", "meadow_grass"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_red.glb",
        "terrainAmplitude": 0.95,
        "defaultTimeOfDayHours": 16.0,
        "mobRegions": ["cindervast", "embervale", "c02/r11"],
    },
    "c06": {
        "biome": "reedstrand_delta_marsh",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "coastal_tidal_flat",
        "centerGroundId": "meadow_grass",
        "ringGroundId": "coastal_tidal_flat",
        "paletteKeys": ["cobble_road", "coastal_tidal_flat", "meadow_grass", "thorn_bramble_floor"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_blue.glb",
        "terrainAmplitude": 0.65,
        "defaultTimeOfDayHours": 10.0,
        "mobRegions": ["rooktide", "millcross", "thornveil"],
    },
    "c07": {
        "biome": "driftholt_fog_forest",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "pine_forest_border",
        "centerGroundId": "meadow_grass",
        "ringGroundId": "thorn_bramble_floor",
        "paletteKeys": ["cobble_road", "pine_forest_border", "thorn_bramble_floor", "meadow_grass"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_green.glb",
        "terrainAmplitude": 1.10,
        "defaultTimeOfDayHours": 14.5,
        "mobRegions": ["thornveil", "millcross", "norhollow"],
    },
    "c08": {
        "biome": "wracklow_sea_stacks",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "coastal_tidal_flat",
        "centerGroundId": "barren_cliff",
        "ringGroundId": "coastal_tidal_flat",
        "paletteKeys": ["cobble_road", "coastal_tidal_flat", "barren_cliff", "thorn_bramble_floor"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_blue.glb",
        "terrainAmplitude": 1.25,
        "defaultTimeOfDayHours": 15.0,
        "mobRegions": ["gildmark", "rooktide", "thornveil"],
    },
    "c09": {
        "biome": "brightfall_cliff_cascade",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "pine_forest_border",
        "centerGroundId": "meadow_grass",
        "ringGroundId": "barren_cliff",
        "paletteKeys": ["cobble_road", "pine_forest_border", "barren_cliff", "meadow_grass"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_yellow.glb",
        "terrainAmplitude": 1.35,
        "defaultTimeOfDayHours": 12.5,
        "mobRegions": ["gildmark", "northern-icefield", "millcross"],
    },
    "c10": {
        "biome": "ashen_spar_volcanic_cone",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "cinder_ash_waste",
        "centerGroundId": "cinder_ash_waste",
        "ringGroundId": "barren_cliff",
        "paletteKeys": ["cobble_road", "cinder_ash_waste", "barren_cliff"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_red.glb",
        "terrainAmplitude": 1.45,
        "defaultTimeOfDayHours": 18.5,
        "mobRegions": ["cindervast", "embervale"],
    },
    "c11": {
        "biome": "coastal",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "coastal_tidal_flat",
        "centerGroundId": "meadow_grass",
        "ringGroundId": "coastal_tidal_flat",
        "paletteKeys": ["cobble_road", "coastal_tidal_flat", "meadow_grass"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_blue.glb",
        "terrainAmplitude": 0.70,
        "defaultTimeOfDayHours": 11.0,
        "mobRegions": ["gildmark", "rooktide"],
    },
    "c12": {
        "biome": "glacier",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "glacier_snow_crust",
        "centerGroundId": "coastal_tidal_flat",
        "ringGroundId": "glacier_snow_crust",
        "paletteKeys": ["cobble_road", "glacier_snow_crust", "barren_cliff", "coastal_tidal_flat"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_white.glb",
        "terrainAmplitude": 1.35,
        "defaultTimeOfDayHours": 13.0,
        "mobRegions": ["northern-icefield", "gildmark"],
    },
    "c13": {
        "biome": "coastal",
        "skyPreset": "golden_alpine_meadow",
        "baseGroundId": "coastal_tidal_flat",
        "centerGroundId": "meadow_grass",
        "ringGroundId": "coastal_tidal_flat",
        "paletteKeys": ["cobble_road", "coastal_tidal_flat", "meadow_grass", "thorn_bramble_floor"],
        "bannerAsset": "res://assets/dungeon/banner_patterna_green.glb",
        "terrainAmplitude": 0.60,
        "defaultTimeOfDayHours": 9.5,
        "mobRegions": ["rooktide", "millcross"],
    },
}

# 4 Frontier Continent Anchor Maps for continents with 0 surveyed zones in content/zones/
FRONTIER_ANCHOR_MAPS: list[dict[str, Any]] = [
    {
        "mapId": "rimewall-cap",
        "displayName": "Rimewall Cap — The Ice Divide & Rimewall Margin",
        "continentId": "c01",
        "regionId": "c01/r01",
        "zoneId": "rimewall-cap",
        "landmarkIds": ["c-lm-rimewall-margin", "c-lm-the-ice-divide"],
        "levelBand": [58, 80],
        "biome": "glacier",
    },
    {
        "mapId": "quillreef-atoll",
        "displayName": "Quillreef Atoll — The Outer Coral Ring",
        "continentId": "c11",
        "regionId": "c11/r01",
        "zoneId": "quillreef-atoll",
        "landmarkIds": ["c-lm-quillreef-ring"],
        "levelBand": [12, 30],
        "biome": "coastal",
    },
    {
        "mapId": "skerryfast-fjord",
        "displayName": "Skerryfast Fjord — Drowned Glacial Trough",
        "continentId": "c12",
        "regionId": "c12/r01",
        "zoneId": "skerryfast-fjord",
        "landmarkIds": ["c-lm-skerryfast-fjord"],
        "levelBand": [44, 68],
        "biome": "glacier",
    },
    {
        "mapId": "loamspit-bar",
        "displayName": "Loamspit Bar — The Migrating Mangrove Spit",
        "continentId": "c13",
        "regionId": "c13/r01",
        "zoneId": "loamspit-bar",
        "landmarkIds": ["c-lm-loamspit-bars"],
        "levelBand": [8, 24],
        "biome": "coastal",
    },
]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def deterministic_seed(key: str, derived_spine: dict[str, Any], spine_node_id: str | None) -> int:
    terrain_hex = ""
    if spine_node_id and spine_node_id in derived_spine:
        terrain_hex = str(
            derived_spine[spine_node_id]
            .get("resolvedSeedStreams", {})
            .get("terrain", "")
        )
    digest = hashlib.sha256(f"{key}:{terrain_hex}".encode("utf-8")).hexdigest()
    return (int(digest[:8], 16) % 900000) + 100000


def parse_level_band(band_str: str) -> tuple[int, int]:
    parts = str(band_str).split("-")
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        return int(parts[0]), int(parts[1])
    return (1, 10)


def load_continent_and_pinned_rosters() -> dict[str, dict[str, Any]]:
    """
    Loads continent metadata across all 13 continents (`c01..c13`) by combining:
    - `content/world/canon/continent-roster.json` (if present)
    - `content/world/manifest.json` (`landmasses`)
    - `content/world/premises/continent-*.json` (`levelBand`, `coastClass`, `structuralIdea`, `palette`)
    - `content/world/resolved/continent-*.json` (`zones` per-region `levelBand`)
    - `content/world/civil/pinned-roster.json` (pinned towns & landmarks per continent)
    """
    manifest = load_json(WORLD_MANIFEST_PATH) if WORLD_MANIFEST_PATH.exists() else {}
    roster_override = load_json(CONTINENT_ROSTER_PATH) if CONTINENT_ROSTER_PATH.exists() else {}
    pinned_roster = load_json(PINNED_ROSTER_PATH) if PINNED_ROSTER_PATH.exists() else {"rows": []}

    continents: dict[str, dict[str, Any]] = {}
    for lm in manifest.get("landmasses", []):
        cid = lm["id"]
        continents[cid] = {
            "id": cid,
            "title": lm.get("title", cid),
            "spineNodeId": lm.get("nodeId", f"n-{cid}"),
            "continentClass": lm.get("class", "minor"),
            "coastClass": "",
            "levelBand": [1, 40],
            "structuralIdea": "",
            "pinnedTownIds": [],
            "pinnedLandmarkIds": [],
            "resolvedZones": {},
        }

    if isinstance(roster_override, dict):
        for row in roster_override.get("continents", roster_override.get("rows", [])):
            cid = row.get("id")
            if cid and cid in continents:
                if "coastClass" in row:
                    continents[cid]["coastClass"] = row["coastClass"]
                if "levelBand" in row:
                    continents[cid]["levelBand"] = list(row["levelBand"])

    if PREMISES_DIR.exists():
        for pf in sorted(PREMISES_DIR.glob("continent-*.json")):
            p = load_json(pf)
            cid = p["id"]
            entry = continents.setdefault(
                cid,
                {
                    "id": cid,
                    "title": p.get("title", cid),
                    "spineNodeId": f"n-{cid}",
                    "continentClass": p.get("class", "minor"),
                    "coastClass": "",
                    "levelBand": [1, 40],
                    "structuralIdea": "",
                    "pinnedTownIds": [],
                    "pinnedLandmarkIds": [],
                    "resolvedZones": {},
                },
            )
            entry["title"] = p.get("title", entry["title"])
            entry["continentClass"] = p.get("class", entry["continentClass"])
            entry["coastClass"] = p.get("coastClass", entry["coastClass"])
            entry["levelBand"] = list(p.get("levelBand", entry["levelBand"]))
            entry["structuralIdea"] = p.get("structuralIdea", "")

    if RESOLVED_DIR.exists():
        for rf in sorted(RESOLVED_DIR.glob("continent-*.json")):
            r_doc = load_json(rf)
            for z in r_doc.get("zones", []):
                zid = z.get("id", "")
                cid = zid.split("/")[0] if "/" in zid else ""
                if cid in continents:
                    continents[cid]["resolvedZones"][zid] = z

    for row in pinned_roster.get("rows", []):
        cid = row.get("continent", "")
        if cid not in continents:
            continue
        if row.get("kind") == "town":
            continents[cid]["pinnedTownIds"].append(row["id"])
        elif row.get("kind") == "landmark":
            continents[cid]["pinnedLandmarkIds"].append(row["id"])

    return continents


def validate_and_normalize_palettes(
    raw_palettes: dict[str, Any],
    selected_keys: list[str],
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in selected_keys:
        if k not in raw_palettes:
            raise ValueError(f"Missing ground palette '{k}' in content/ground_palettes.json")
        pal = json.loads(json.dumps(raw_palettes[k]))
        pal["playerScaleBandM"] = list(CHIBI_PLAYER_SCALE_BAND)
        scatter = pal.get("scatter") or {}
        for rule_key, rule in scatter.items():
            rule.setdefault("minSpacingMeters", 1.5)
            rule.setdefault("disabledAssets", [])
            rule.setdefault("placement", "fill")
            rule.setdefault("blocksMovement", False)
            rule.setdefault("colliderHalfExtent", 0.35)
            tag_pool = rule.get("tagPool") or {}
            role = tag_pool.get("role", rule_key)
            if role == "ground_cover" or rule_key == "grass":
                max_h = tag_pool.get("maxHeightM", 0.35)
                if max_h > 0.35:
                    raise ValueError(f"Chibi guardrail violation: {k}.{rule_key} maxHeightM {max_h} > 0.35")
            if role == "understory" or rule_key == "bush":
                max_h = tag_pool.get("maxHeightM", 0.65)
                if max_h > 0.65:
                    raise ValueError(f"Chibi guardrail violation: {k}.{rule_key} maxHeightM {max_h} > 0.65")
        out[k] = pal
    return out


def select_ecological_mobs_for_map(
    map_id: str,
    bestiary: list[dict[str, Any]],
    mob_regions: list[str],
    target_band: list[int],
    desired_count: int = 8,
) -> list[dict[str, Any]]:
    """
    Deterministically selects an ecologically matched roster of `bestiary.json` creatures
    for a non-c02 surveyed zone or frontier continent anchor map based on its continent's
    ecological biome pool and levelBand.
    """
    pool = [m for m in bestiary if m.get("region") in mob_regions]
    if not pool:
        pool = list(bestiary)

    target_mid = (target_band[0] + target_band[1]) * 0.5

    def score_mob(mob: dict[str, Any]) -> tuple[float, str, str]:
        lv_min, lv_max = parse_level_band(mob.get("levelBand", "1-10"))
        mob_mid = (lv_min + lv_max) * 0.5
        level_dist = abs(mob_mid - target_mid) * 0.15
        digest = hashlib.sha256(f"{map_id}:{mob['id']}".encode("utf-8")).hexdigest()
        jitter = (int(digest[:6], 16) % 1000) / 1000.0
        return (level_dist + jitter, mob["id"], mob.get("region", ""))

    ranked = sorted(pool, key=score_mob)
    return ranked[: min(desired_count, len(ranked))]


def build_spawn_areas_for_mobs(
    map_id: str,
    mobs: list[dict[str, Any]],
    map_width: float,
    map_height: float,
    avoid_rects: list[tuple[float, float, float, float]] | None = None,
) -> list[dict[str, Any]]:
    """
    Deterministically places one spawn area per regional bestiary mob around the playable arena,
    ordered by level band and mob ID, avoiding any static obstacle footprints.
    """
    cx = map_width * 0.5
    cy = map_height * 0.5
    avoid = avoid_rects or []

    sorted_mobs = sorted(mobs, key=lambda m: (parse_level_band(m.get("levelBand", "1-10")), m["id"]))
    spawn_areas: list[dict[str, Any]] = []

    total = len(sorted_mobs)
    for idx, mob in enumerate(sorted_mobs):
        mob_id = mob["id"]
        slug = mob_id.removeprefix("mob-").replace("-", "_")
        archetype = mob.get("archetype", "skirmisher")
        lv_min, _ = parse_level_band(mob.get("levelBand", "1-10"))

        # Determine mob count per spawn area based on tier & archetype
        if lv_min >= 51 or (archetype == "tank" and lv_min >= 31):
            count = 1
            w, h = 110.0, 110.0
        elif lv_min >= 31 or archetype in ("bruiser", "tank"):
            count = 2
            w, h = 130.0, 130.0
        elif archetype in ("caster", "support"):
            count = 3
            w, h = 150.0, 150.0
        else:
            count = 4
            w, h = 160.0, 160.0

        ring_t = idx / max(1, total - 1)
        radius = 220.0 + ring_t * 520.0
        angle = (idx * 2.399963229728653) + (int(hashlib.md5(f"{map_id}:{mob_id}".encode()).hexdigest()[:6], 16) % 100) * 0.01

        sx = round(cx + math.cos(angle) * radius - w * 0.5, 1)
        sy = round(cy + math.sin(angle) * radius - h * 0.5, 1)

        sx = max(120.0, min(map_width - w - 120.0, sx))
        sy = max(120.0, min(map_height - h - 120.0, sy))

        for ox0, oy0, ox1, oy1 in avoid:
            if sx < ox1 + 20.0 and sx + w > ox0 - 20.0 and sy < oy1 + 20.0 and sy + h > oy0 - 20.0:
                sy = round(oy1 + 35.0, 1)

        spawn_areas.append(
            {
                "id": f"{map_id.replace('-', '_')}_{slug}",
                "x": sx,
                "y": sy,
                "width": w,
                "height": h,
                "mobType": mob_id,
                "count": count,
            }
        )

    return spawn_areas


def build_static_obstacles(
    props: list[dict[str, Any]],
    height_terraces: list[dict[str, Any]],
    map_width: float,
    map_height: float,
    extra_obstacles: list[tuple[str, float, float, float, float]] | list[dict[str, Any]] | None = None,
    coord_scale: float = 0.1,
) -> list[dict[str, Any]]:
    cx = map_width * 0.5
    cy = map_height * 0.5
    obstacles: list[dict[str, Any]] = []

    if extra_obstacles:
        obstacles.extend(extra_obstacles)  # type: ignore[arg-type]

    for p in props:
        if not p.get("blocksMovement", False):
            continue
        scale = float(p.get("scale", 1.0))
        half_ext = float(p.get("colliderHalfExtent", 0.65))
        half_world = max(0.25, half_ext * scale * 0.72)
        wx = float(p["x"])
        wz = float(p["z"])
        sx_min = round(cx + (wx - half_world) / coord_scale, 1)
        sy_min = round(cy + (wz - half_world) / coord_scale, 1)
        sx_max = round(cx + (wx + half_world) / coord_scale, 1)
        sy_max = round(cy + (wz + half_world) / coord_scale, 1)
        obstacles.append(
            {
                "id": p["id"],
                "min_x": sx_min,
                "min_y": sy_min,
                "max_x": sx_max,
                "max_y": sy_max,
            }
        )

    for t in height_terraces:
        if float(t.get("falloff", 0.45)) <= 0.22 and float(t.get("height", 0.0)) >= 3.2:
            half_box = float(t["radius"]) * 0.82
            tx = float(t["x"])
            tz = float(t["z"])
            obstacles.append(
                {
                    "id": f"cliff_{t['id']}",
                    "min_x": round(cx + (tx - half_box) / coord_scale, 1),
                    "min_y": round(cy + (tz - half_box) / coord_scale, 1),
                    "max_x": round(cx + (tx + half_box) / coord_scale, 1),
                    "max_y": round(cy + (tz + half_box) / coord_scale, 1),
                }
            )

    return obstacles


def compile_millcross_ford(
    cfg: dict[str, Any],
    zone_doc: dict[str, Any],
    town_doc: dict[str, Any],
    mobs: list[dict[str, Any]],
    palettes_doc: dict[str, Any],
    derived_spine: dict[str, Any],
) -> dict[str, Any]:
    map_id = cfg["mapId"]
    width = 4000.0
    height = 4000.0
    cx = width * 0.5
    cy = height * 0.5

    town_w = float(town_doc["extent"]["width"])
    town_h = float(town_doc["extent"]["height"])
    town_cx = town_w * 0.5  # 110.0
    town_cy = town_h * 0.5  # 80.0

    routes: list[dict[str, Any]] = []
    for r in town_doc.get("roads", []):
        r_width = float(r.get("width", 12.0))
        if r.get("kind") == "cart":
            r_width = max(12.0, r_width)
            clear_margin = 2.4
        else:
            r_width = max(4.0, r_width)
            clear_margin = 1.8
        pts = [
            [round(float(pt[0]) - town_cx, 2), round(float(pt[1]) - town_cy, 2)]
            for pt in r.get("points", [])
        ]
        routes.append(
            {
                "id": r["id"],
                "groundId": "cobble_road",
                "width": r_width,
                "clearMargin": clear_margin,
                "points": pts,
            }
        )

    building_footprints = [
        fp for fp in town_doc.get("footprints", [])
        if fp.get("kind") not in ("wall", "gate")
    ]
    assert len(building_footprints) == 18, f"Expected 18 Millcross town building footprints, got {len(building_footprints)}"

    town_obstacles: list[dict[str, Any]] = []
    avoid_rects: list[tuple[float, float, float, float]] = []
    origin_sx = cx - town_cx
    origin_sy = cy - town_cy
    for fp in building_footprints:
        rect = fp["rect"]
        x0, y0, x1, y1 = float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])
        min_x = round(origin_sx + min(x0, x1), 1)
        min_y = round(origin_sy + min(y0, y1), 1)
        max_x = round(origin_sx + max(x0, x1), 1)
        max_y = round(origin_sy + max(y0, y1), 1)
        town_obstacles.append(
            {
                "id": fp["id"],
                "min_x": min_x,
                "min_y": min_y,
                "max_x": max_x,
                "max_y": max_y,
            }
        )
        avoid_rects.append((min_x, min_y, max_x, max_y))

    height_terraces = [
        {
            "id": "millcross_east_terrace_bank",
            "x": 24.0,
            "z": -14.0,
            "radius": 18.0,
            "height": 2.2,
            "falloff": 0.48,
        },
        {
            "id": "millrace_north_head_bluff",
            "x": -16.0,
            "z": -22.0,
            "radius": 14.0,
            "height": 2.4,
            "falloff": 0.45,
        },
        {
            "id": "west_quarry_face_cliff",
            "x": -34.0,
            "z": -18.0,
            "radius": 10.5,
            "height": 4.2,
            "falloff": 0.16,
        },
        {
            "id": "south_meltwash_ford_bank",
            "x": 12.0,
            "z": 18.0,
            "radius": 15.0,
            "height": 1.6,
            "falloff": 0.52,
        },
    ]

    structures = [
        {
            "id": "millcross_wheel_watchtower_01",
            "kind": "watchtower",
            "x": -12.0,
            "z": -16.0,
            "rotY": 0.0,
            "radius": 3.8,
            "upperFloorHeight": 3.2,
            "ceilingHeight": 3.4,
        },
        {
            "id": "millcross_quarry_cavern_01",
            "kind": "crystal_cave",
            "x": -22.0,
            "z": 12.0,
            "rotY": 0.0,
            "radius": 4.2,
            "upperFloorHeight": 3.2,
            "ceilingHeight": 3.4,
        },
    ]

    props = [
        {
            "id": "landmark_the_cart_queue_pillar",
            "assetPath": "res://assets/dungeon/pillar.glb",
            "x": -28.0,
            "y": 1.2,
            "z": 4.0,
            "rotY": 0.0,
            "scale": 1.1,
            "blocksMovement": True,
            "colliderHalfExtent": 0.65,
        },
        {
            "id": "landmark_mill_wheel_banner",
            "assetPath": "res://assets/dungeon/banner_shield_blue.glb",
            "x": -8.0,
            "y": 1.8,
            "z": -14.0,
            "rotY": 0.0,
            "scale": 1.1,
            "blocksMovement": False,
            "colliderHalfExtent": 0.4,
        },
        {
            "id": "landmark_ford_crossing_banner",
            "assetPath": "res://assets/dungeon/banner_shield_brown.glb",
            "x": 2.0,
            "y": 1.0,
            "z": 0.0,
            "rotY": 0.0,
            "scale": 1.1,
            "blocksMovement": False,
            "colliderHalfExtent": 0.4,
        },
    ]

    ground_zones = [
        {
            "id": "millcross_ford_town_clearing",
            "groundId": "meadow_grass",
            "priority": 20,
            "shape": "circle",
            "x": 0.0,
            "z": 0.0,
            "radius": 36.0,
            "innerRadius": 0.0,
            "outerRadius": 36.0,
            "width": 72.0,
            "height": 72.0,
            "feather": 5.0,
        },
        {
            "id": "millcross_outer_hedgerow_border",
            "groundId": "pine_forest_border",
            "priority": 10,
            "shape": "annulus",
            "x": 0.0,
            "z": 0.0,
            "radius": 190.0,
            "innerRadius": 36.0,
            "outerRadius": 190.0,
            "width": 380.0,
            "height": 380.0,
            "feather": 6.0,
        },
    ]

    spawn_areas = build_spawn_areas_for_mobs(map_id, mobs, width, height, avoid_rects)
    static_obstacles = build_static_obstacles(
        props=props,
        height_terraces=height_terraces,
        map_width=width,
        map_height=height,
        extra_obstacles=town_obstacles,
    )

    zone_landmarks = [lm["id"] for lm in zone_doc.get("landmarks", [])]
    town_landmarks = [lm["id"] for lm in town_doc.get("landmarks", [])]
    all_landmarks = list(dict.fromkeys(zone_landmarks + town_landmarks))

    return {
        "version": 3,
        "mapId": map_id,
        "name": cfg["displayName"],
        "seed": deterministic_seed(map_id, derived_spine, cfg["spineNodeId"]),
        "width": width,
        "height": height,
        "baseGroundId": cfg["baseGroundId"],
        "chunkSizeWorld": 24,
        "activeChunkRadius": 2,
        "terrainAmplitude": cfg["terrainAmplitude"],
        "proceduralClutterDensity": 44,
        "defaultTimeOfDayHours": cfg["defaultTimeOfDayHours"],
        "autoAdvanceDayNight": True,
        "dayNightSpeedHoursPerSec": 0.12,
        "worldSpineBinding": {
            "continentId": "c02",
            "regionId": zone_doc["region"],
            "zoneId": zone_doc["zone"],
            "spineNodeId": cfg["spineNodeId"],
            "townId": cfg["townId"],
            "storyRegionId": cfg["storyRegionId"],
            "landmarkIds": all_landmarks,
            "resourceIds": [r["id"] for r in zone_doc.get("resources", [])],
            "hazardIds": [h["id"] for h in zone_doc.get("hazards", [])],
        },
        "concept": {
            "biome": cfg["biome"],
            "recommendedLevelRange": [1, 50],
            "skyPreset": cfg["skyPreset"],
            "loreSummary": zone_doc["reasonToGo"],
        },
        "groundPalettes": validate_and_normalize_palettes(
            palettes_doc,
            ["cobble_road", "meadow_grass", "pine_forest_border", "barren_cliff"],
        ),
        "routes": routes,
        "groundZones": ground_zones,
        "heightTerraces": height_terraces,
        "structures": structures,
        "props": props,
        "spawnAreas": spawn_areas,
        "staticObstacles": static_obstacles,
    }


def compile_surveyed_zone_map(
    cfg: dict[str, Any],
    zone_doc: dict[str, Any],
    mobs: list[dict[str, Any]],
    palettes_doc: dict[str, Any],
    derived_spine: dict[str, Any],
) -> dict[str, Any]:
    map_id = cfg["mapId"]
    width = 4000.0
    height = 4000.0

    bands = [parse_level_band(m.get("levelBand", "1-10")) for m in mobs]
    min_lv = min((b[0] for b in bands), default=1)
    max_lv = max((b[1] for b in bands), default=20)

    routes = json.loads(json.dumps(cfg["routes"]))
    for rt in routes:
        w = float(rt.get("width", 12.0))
        if w < 4.0:
            rt["width"] = 4.0

    ground_zones = json.loads(json.dumps(cfg["groundZones"]))
    height_terraces = json.loads(json.dumps(cfg["heightTerraces"]))
    structures = json.loads(json.dumps(cfg["structures"]))
    props = json.loads(json.dumps(cfg["props"]))

    spawn_areas = build_spawn_areas_for_mobs(map_id, mobs, width, height)
    static_obstacles = build_static_obstacles(
        props=props,
        height_terraces=height_terraces,
        map_width=width,
        map_height=height,
    )

    return {
        "version": 3,
        "mapId": map_id,
        "name": cfg["displayName"],
        "seed": deterministic_seed(map_id, derived_spine, cfg["spineNodeId"]),
        "width": width,
        "height": height,
        "baseGroundId": cfg["baseGroundId"],
        "chunkSizeWorld": 24,
        "activeChunkRadius": 2,
        "terrainAmplitude": cfg["terrainAmplitude"],
        "proceduralClutterDensity": 48,
        "defaultTimeOfDayHours": cfg["defaultTimeOfDayHours"],
        "autoAdvanceDayNight": True,
        "dayNightSpeedHoursPerSec": 0.12,
        "worldSpineBinding": {
            "continentId": "c02",
            "regionId": zone_doc["region"],
            "zoneId": zone_doc["zone"],
            "spineNodeId": cfg["spineNodeId"],
            "townId": cfg["townId"],
            "storyRegionId": cfg["storyRegionId"],
            "landmarkIds": [lm["id"] for lm in zone_doc.get("landmarks", [])],
            "resourceIds": [r["id"] for r in zone_doc.get("resources", [])],
            "hazardIds": [h["id"] for h in zone_doc.get("hazards", [])],
        },
        "concept": {
            "biome": cfg["biome"],
            "recommendedLevelRange": [min_lv, max_lv],
            "skyPreset": cfg["skyPreset"],
            "loreSummary": zone_doc["reasonToGo"],
        },
        "groundPalettes": validate_and_normalize_palettes(
            palettes_doc,
            ["cobble_road", "meadow_grass", "pine_forest_border", "barren_cliff"],
        ),
        "routes": routes,
        "groundZones": ground_zones,
        "heightTerraces": height_terraces,
        "structures": structures,
        "props": props,
        "spawnAreas": spawn_areas,
        "staticObstacles": static_obstacles,
    }


def compile_continent_zone_or_anchor_map(
    map_id: str,
    display_name: str,
    continent_id: str,
    region_id: str,
    zone_id: str,
    landmark_ids: list[str],
    resource_ids: list[str],
    hazard_ids: list[str],
    lore_summary: str,
    level_band: list[int],
    biome_override: str | None,
    cont_meta: dict[str, Any],
    bestiary: list[dict[str, Any]],
    palettes_doc: dict[str, Any],
    derived_spine: dict[str, Any],
) -> dict[str, Any]:
    """
    Deterministically compiles a playable v3 3D map for any auto-discovered `c03..c10`
    surveyed zone or `c01/c11/c12/c13` frontier continent anchor map.
    """
    width = 4000.0
    height = 4000.0
    bcfg = CONTINENT_BIOME_CONFIGS[continent_id]
    biome = biome_override or bcfg["biome"]
    spine_node_id = cont_meta["spineNodeId"]

    # Bind continent's pinned town (c-town-tallowquay on c03, c-town-netstead on c04) or ""
    pinned_towns = cont_meta.get("pinnedTownIds", [])
    pinned_landmarks = cont_meta.get("pinnedLandmarkIds", [])
    town_id = pinned_towns[0] if pinned_towns else ""
    primary_pinned_id = town_id or (pinned_landmarks[0] if pinned_landmarks else "")

    merged_landmarks = list(dict.fromkeys(landmark_ids + pinned_landmarks))
    slug = map_id.replace("-", "_")
    digest_num = int(hashlib.sha256(map_id.encode("utf-8")).hexdigest()[:8], 16)
    bend_x = round(((digest_num % 17) - 8) * 1.5, 1)
    bend_z = round((((digest_num >> 4) % 15) - 7) * 1.5, 1)

    routes = [
        {
            "id": f"{slug}_main_trunk_road",
            "groundId": "cobble_road",
            "width": 12.5,
            "clearMargin": 2.4,
            "points": [[0.0, -90.0], [bend_x, -22.0], [-bend_x, 22.0], [0.0, 90.0]],
        },
        {
            "id": f"{slug}_survey_footpath",
            "groundId": "cobble_road",
            "width": 4.5,
            "clearMargin": 1.8,
            "points": [[-62.0, bend_z], [0.0, 0.0], [62.0, -bend_z]],
        },
    ]

    ground_zones = [
        {
            "id": f"{slug}_central_survey_clearing",
            "groundId": bcfg["centerGroundId"],
            "priority": 20,
            "shape": "circle",
            "x": 0.0,
            "z": 0.0,
            "radius": 28.0,
            "innerRadius": 0.0,
            "outerRadius": 28.0,
            "width": 56.0,
            "height": 56.0,
            "feather": 4.5,
        },
        {
            "id": f"{slug}_outer_biome_margin",
            "groundId": bcfg["ringGroundId"],
            "priority": 10,
            "shape": "annulus",
            "x": 0.0,
            "z": 0.0,
            "radius": 190.0,
            "innerRadius": 28.0,
            "outerRadius": 190.0,
            "width": 380.0,
            "height": 380.0,
            "feather": 6.0,
        },
    ]

    lm0_slug = (merged_landmarks[0] if merged_landmarks else f"{slug}_north").replace("-", "_")
    lm1_slug = (merged_landmarks[1] if len(merged_landmarks) > 1 else f"{slug}_west").replace("-", "_")

    height_terraces = [
        {
            "id": f"{lm0_slug}_terrace",
            "x": 0.0,
            "z": -18.0,
            "radius": 16.0,
            "height": 2.3,
            "falloff": 0.46,
        },
        {
            "id": f"{lm1_slug}_bench",
            "x": -18.0,
            "z": 11.0,
            "radius": 13.5,
            "height": 2.0,
            "falloff": 0.48,
        },
        {
            "id": f"{slug}_sheer_scarp_cliff",
            "x": 27.0,
            "z": -21.0,
            "radius": 10.0,
            "height": 4.3,
            "falloff": 0.16,
        },
    ]

    structures = [
        {
            "id": f"{slug}_watchtower_01",
            "kind": "watchtower",
            "x": -10.0,
            "z": -7.0,
            "rotY": 0.0,
            "radius": 3.7,
            "upperFloorHeight": 3.2,
            "ceilingHeight": 3.4,
        },
        {
            "id": f"{slug}_cavern_01",
            "kind": "crystal_cave",
            "x": 12.0,
            "z": -8.0,
            "rotY": 0.0,
            "radius": 4.2,
            "upperFloorHeight": 3.2,
            "ceilingHeight": 3.4,
        },
    ]

    props = [
        {
            "id": f"landmark_{lm0_slug}_pillar_w",
            "assetPath": "res://assets/dungeon/pillar.glb",
            "x": -4.8,
            "y": 2.1,
            "z": -15.0,
            "rotY": 0.0,
            "scale": 1.15,
            "blocksMovement": True,
            "colliderHalfExtent": 0.65,
        },
        {
            "id": f"landmark_{lm1_slug}_pillar_e",
            "assetPath": "res://assets/dungeon/pillar.glb",
            "x": 4.8,
            "y": 2.1,
            "z": -15.0,
            "rotY": 0.0,
            "scale": 1.15,
            "blocksMovement": True,
            "colliderHalfExtent": 0.65,
        },
        {
            "id": f"landmark_{slug}_survey_banner",
            "assetPath": bcfg["bannerAsset"],
            "x": -3.4,
            "y": 2.0,
            "z": -13.0,
            "rotY": 0.0,
            "scale": 1.1,
            "blocksMovement": False,
            "colliderHalfExtent": 0.4,
        },
    ]

    selected_mobs = select_ecological_mobs_for_map(
        map_id=map_id,
        bestiary=bestiary,
        mob_regions=bcfg["mobRegions"],
        target_band=level_band,
        desired_count=8,
    )
    spawn_areas = build_spawn_areas_for_mobs(map_id, selected_mobs, width, height)
    static_obstacles = build_static_obstacles(
        props=props,
        height_terraces=height_terraces,
        map_width=width,
        map_height=height,
    )

    return {
        "version": 3,
        "mapId": map_id,
        "name": display_name,
        "seed": deterministic_seed(map_id, derived_spine, spine_node_id),
        "width": width,
        "height": height,
        "baseGroundId": bcfg["baseGroundId"],
        "chunkSizeWorld": 24,
        "activeChunkRadius": 2,
        "terrainAmplitude": bcfg["terrainAmplitude"],
        "proceduralClutterDensity": 46,
        "defaultTimeOfDayHours": bcfg["defaultTimeOfDayHours"],
        "autoAdvanceDayNight": True,
        "dayNightSpeedHoursPerSec": 0.12,
        "worldSpineBinding": {
            "continentId": continent_id,
            "coastClass": cont_meta["coastClass"],
            "levelBand": list(level_band),
            "primaryPinnedId": primary_pinned_id,
            "regionId": region_id,
            "zoneId": zone_id,
            "spineNodeId": spine_node_id,
            "townId": town_id,
            "storyRegionId": "",
            "landmarkIds": merged_landmarks,
            "resourceIds": resource_ids,
            "hazardIds": hazard_ids,
        },
        "concept": {
            "biome": biome,
            "recommendedLevelRange": list(level_band),
            "skyPreset": bcfg["skyPreset"],
            "loreSummary": lore_summary,
        },
        "groundPalettes": validate_and_normalize_palettes(
            palettes_doc,
            bcfg["paletteKeys"],
        ),
        "routes": routes,
        "groundZones": ground_zones,
        "heightTerraces": height_terraces,
        "structures": structures,
        "props": props,
        "spawnAreas": spawn_areas,
        "staticObstacles": static_obstacles,
    }


def update_freja_south_gate(palettes_doc: dict[str, Any], check_only: bool = False) -> dict[str, Any]:
    """
    Preserves `content/maps/freja-south-gate.json`'s exact `width: 1000.0`, `height: 1000.0`,
    8 `spawnAreas`, 12 `staticObstacles`, and 5 `heightTerraces` asserted by `server-rs` unit tests,
    while binding it to the 10th Wealdmarch surveyed zone (`meltwash-terrace` / `c02/r16` / `n-frontier-shelf` / `region-spawn-meadow`).
    """
    freja_path = MAPS_DIR / "freja-south-gate.json"
    existing = load_json(freja_path) if freja_path.exists() else {}
    meltwash_doc = load_json(ZONES_DIR / "zone-meltwash-terrace.json")

    spawn_areas = [
        {"id": "boss_area", "x": 450.0, "y": 450.0, "width": 100.0, "height": 100.0, "mobType": "mob-thorncrown-drake", "count": 1},
        {"id": "center_courtyard", "x": 400.0, "y": 400.0, "width": 200.0, "height": 200.0, "mobType": "mob-bramble-stalker", "count": 3},
        {"id": "east_dunes", "x": 550.0, "y": 400.0, "width": 150.0, "height": 200.0, "mobType": "mob-veil-spearling", "count": 4},
        {"id": "north_ice_fields", "x": 400.0, "y": 250.0, "width": 200.0, "height": 150.0, "mobType": "mob-bramble-stalker", "count": 2},
        {"id": "south_mud_pit", "x": 400.0, "y": 600.0, "width": 200.0, "height": 150.0, "mobType": "mob-bramble-warden", "count": 2},
        {"id": "thornveil_interior", "x": 820.0, "y": 420.0, "width": 150.0, "height": 150.0, "mobType": "mob-bramble-drake", "count": 1},
        {"id": "thornveil_route_spearlings", "x": 700.0, "y": 550.0, "width": 150.0, "height": 200.0, "mobType": "mob-veil-spearling", "count": 2},
        {"id": "thornveil_route_stalkers", "x": 700.0, "y": 300.0, "width": 150.0, "height": 200.0, "mobType": "mob-bramble-stalker", "count": 2},
    ]

    static_obstacles = [
        {"id": "tree_ring_01", "min_x": 329.0, "min_y": 349.0, "max_x": 351.0, "max_y": 371.0},
        {"id": "tree_ring_02", "min_x": 639.0, "min_y": 339.0, "max_x": 661.0, "max_y": 361.0},
        {"id": "tree_ring_03", "min_x": 288.0, "min_y": 448.0, "max_x": 312.0, "max_y": 472.0},
        {"id": "tree_ring_04", "min_x": 679.0, "min_y": 469.0, "max_x": 701.0, "max_y": 491.0},
        {"id": "tree_ring_05", "min_x": 340.0, "min_y": 620.0, "max_x": 360.0, "max_y": 640.0},
        {"id": "tree_ring_06", "min_x": 648.5, "min_y": 628.5, "max_x": 671.5, "max_y": 651.5},
        {"id": "tree_ring_07", "min_x": 429.0, "min_y": 669.0, "max_x": 451.0, "max_y": 691.0},
        {"id": "tree_ring_08", "min_x": 567.5, "min_y": 267.5, "max_x": 592.5, "max_y": 292.5},
        {"id": "rock_mid_01", "min_x": 366.0, "min_y": 386.0, "max_x": 384.0, "max_y": 404.0},
        {"id": "rock_mid_02", "min_x": 611.5, "min_y": 381.5, "max_x": 628.5, "max_y": 398.5},
        {"id": "sanctuary_pillar_w", "min_x": 447.5, "min_y": 388.5, "max_x": 460.5, "max_y": 401.5},
        {"id": "sanctuary_pillar_e", "min_x": 539.5, "min_y": 388.5, "max_x": 552.5, "max_y": 401.5},
    ]

    height_terraces = [
        {"id": "sanctuary_north_acropolis", "x": 0.0, "z": -18.0, "radius": 15.0, "height": 2.4, "falloff": 0.45},
        {"id": "west_watchtower_hill", "x": -17.5, "z": -8.0, "radius": 11.5, "height": 2.1, "falloff": 0.48},
        {"id": "east_wind_bluff", "x": 17.5, "z": -7.0, "radius": 12.0, "height": 2.3, "falloff": 0.46},
        {"id": "south_grove_knoll", "x": 14.0, "z": 14.0, "radius": 11.0, "height": 1.75, "falloff": 0.5},
        {"id": "northwest_sheer_cliff_mesa", "x": -29.0, "z": -22.0, "radius": 9.5, "height": 4.2, "falloff": 0.16},
    ]

    updated = dict(existing)
    updated["version"] = 3
    updated["mapId"] = "freja-south-gate"
    updated["name"] = "Prontera South Gate — Freja Meadow"
    updated["seed"] = updated.get("seed", 104729)
    updated["width"] = 1000.0
    updated["height"] = 1000.0
    updated["baseGroundId"] = updated.get("baseGroundId", "meadow_grass")
    updated["worldSpineBinding"] = {
        "continentId": "c02",
        "regionId": "c02/r16",
        "zoneId": "meltwash-terrace",
        "spineNodeId": "n-frontier-shelf",
        "townId": "c-town-millcross",
        "storyRegionId": "region-spawn-meadow",
        "landmarkIds": [lm["id"] for lm in meltwash_doc.get("landmarks", [])],
        "resourceIds": [r["id"] for r in meltwash_doc.get("resources", [])],
        "hazardIds": [h["id"] for h in meltwash_doc.get("hazards", [])],
    }
    updated["groundPalettes"] = validate_and_normalize_palettes(
        palettes_doc,
        ["cobble_road", "meadow_grass", "pine_forest_border"],
    )
    updated["heightTerraces"] = height_terraces
    updated["spawnAreas"] = spawn_areas
    updated["staticObstacles"] = static_obstacles

    if not check_only:
        save_json(freja_path, updated)
    return updated


def verify_compiled_maps(
    compiled_docs: list[dict[str, Any]],
    bestiary: list[dict[str, Any]],
    continents: dict[str, dict[str, Any]],
    check_on_disk: bool,
) -> list[str]:
    errors: list[str] = []

    if len(compiled_docs) != 44:
        errors.append(f"Expected exactly 44 playable v3 maps, got {len(compiled_docs)}")

    expected_continents = set(continents.keys())
    expected_story_regions = {r["id"] for r in load_json(STORY_REGIONS_PATH)} if STORY_REGIONS_PATH.exists() else set()
    all_surveyed_zones = {
        load_json(p)["zone"]
        for p in sorted(ZONES_DIR.glob("zone-*.json"))
    }
    all_bestiary_ids = {m["id"] for m in bestiary}

    bound_continents: set[str] = set()
    bound_zones: set[str] = set()
    bound_story_regions: set[str] = set()
    bound_mobs: set[str] = set()

    for doc in compiled_docs:
        mid = doc.get("mapId", "")
        disk_path = MAPS_DIR / f"{mid}.json"
        if check_on_disk:
            if not disk_path.exists():
                errors.append(f"Missing compiled map on disk: {disk_path}")
                continue
            disk_raw = disk_path.read_text(encoding="utf-8")
            expected_raw = json.dumps(doc, indent=2) + "\n"
            if disk_raw != expected_raw:
                errors.append(f"Drift detected in {disk_path.relative_to(ROOT)} (run python3 scripts/compile_world_maps.py)")

        binding = doc.get("worldSpineBinding") or {}
        cid = binding.get("continentId", "")
        if cid not in expected_continents:
            errors.append(f"{mid}: worldSpineBinding.continentId '{cid}' not in expected continents {sorted(expected_continents)}")
        else:
            bound_continents.add(cid)

        reg_id = binding.get("regionId", "")
        if not reg_id.startswith(f"{cid}/"):
            errors.append(f"{mid}: worldSpineBinding.regionId '{reg_id}' must start with '{cid}/'")

        if binding.get("zoneId") in all_surveyed_zones:
            bound_zones.add(binding["zoneId"])
        if binding.get("storyRegionId"):
            bound_story_regions.add(binding["storyRegionId"])

        for gid, pal in (doc.get("groundPalettes") or {}).items():
            if pal.get("playerScaleBandM") != CHIBI_PLAYER_SCALE_BAND:
                errors.append(f"{mid}: palette '{gid}' playerScaleBandM != {CHIBI_PLAYER_SCALE_BAND}")

        for sp in doc.get("spawnAreas") or []:
            mob_type = sp.get("mobType", "")
            if mob_type not in all_bestiary_ids:
                errors.append(f"{mid}: spawnArea '{sp.get('id')}' references unknown bestiary mob '{mob_type}'")
            else:
                bound_mobs.add(mob_type)

    missing_continents = expected_continents - bound_continents
    if missing_continents:
        errors.append(f"Unbound continents ({len(missing_continents)}): {sorted(missing_continents)}")

    missing_zones = all_surveyed_zones - bound_zones
    if missing_zones:
        errors.append(f"Unbound surveyed zones ({len(missing_zones)}): {sorted(missing_zones)}")

    missing_story = expected_story_regions - bound_story_regions
    if missing_story:
        errors.append(f"Unbound story regions: {sorted(missing_story)}")

    missing_mobs = all_bestiary_ids - bound_mobs
    if missing_mobs:
        errors.append(f"Unbound bestiary mobs ({len(missing_mobs)}): {sorted(missing_mobs)[:10]}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Compile L1-L3 World Spine into playable v3 Unified Map Documents.")
    parser.add_argument("--check", action="store_true", help="Verify all 44 maps are up-to-date and 100% bound without writing.")
    args = parser.parse_args()

    bestiary: list[dict[str, Any]] = load_json(BESTIARY_PATH)
    palettes_doc: dict[str, Any] = load_json(GROUND_PALETTES_PATH)
    derived_spine: dict[str, Any] = load_json(DERIVED_SPINE_PATH) if DERIVED_SPINE_PATH.exists() else {}
    town_millcross: dict[str, Any] = load_json(TOWNS_DIR / "town-millcross.json")
    continents = load_continent_and_pinned_rosters()

    def mobs_for_region(region_key: str) -> list[dict[str, Any]]:
        matched = [m for m in bestiary if m.get("region") == region_key]
        if not matched:
            raise ValueError(f"No bestiary mobs found for region '{region_key}'")
        return matched

    compiled: list[dict[str, Any]] = []
    handled_zone_files: set[str] = {"zone-meltwash-terrace.json"}

    # 1. freja-south-gate (binds meltwash-terrace / c02/r16 / n-frontier-shelf / region-spawn-meadow)
    freja_doc = update_freja_south_gate(palettes_doc, check_only=args.check)
    compiled.append(freja_doc)

    # 2. Compile all 9 Wealdmarch (c02) surveyed zone maps in ZONE_CONFIGS
    for cfg in ZONE_CONFIGS:
        map_id = cfg["mapId"]
        handled_zone_files.add(cfg["zoneFile"])
        zone_doc = load_json(ZONES_DIR / cfg["zoneFile"])
        assert zone_doc["region"] == cfg["regionId"], (
            f"Zone region mismatch for {map_id}: {zone_doc['region']} != {cfg['regionId']}"
        )
        mobs = mobs_for_region(cfg["bestiaryRegion"])
        assert len(mobs) == cfg["expectedMobCount"], (
            f"Expected {cfg['expectedMobCount']} mobs for {map_id} ({cfg['bestiaryRegion']}), got {len(mobs)}"
        )

        if cfg.get("useMillcrossTownPlan"):
            doc = compile_millcross_ford(
                cfg=cfg,
                zone_doc=zone_doc,
                town_doc=town_millcross,
                mobs=mobs,
                palettes_doc=palettes_doc,
                derived_spine=derived_spine,
            )
        else:
            doc = compile_surveyed_zone_map(
                cfg=cfg,
                zone_doc=zone_doc,
                mobs=mobs,
                palettes_doc=palettes_doc,
                derived_spine=derived_spine,
            )

        if not args.check:
            save_json(MAPS_DIR / f"{map_id}.json", doc)
        compiled.append(doc)

    # 3. Auto-discover and compile the remaining 30 surveyed zones across c03..c10
    for zone_path in sorted(ZONES_DIR.glob("zone-*.json")):
        if zone_path.name in handled_zone_files:
            continue
        zone_doc = load_json(zone_path)
        zone_id = zone_doc["zone"]
        region_id = zone_doc["region"]
        continent_id = region_id.split("/")[0]
        cont_meta = continents[continent_id]

        resolved_z = cont_meta["resolvedZones"].get(region_id, {})
        level_band = list(resolved_z.get("levelBand") or cont_meta["levelBand"])
        zone_title = " ".join(w.capitalize() for w in zone_id.split("-"))
        display_name = f"{zone_title} — {cont_meta['title']} ({region_id})"

        doc = compile_continent_zone_or_anchor_map(
            map_id=zone_id,
            display_name=display_name,
            continent_id=continent_id,
            region_id=region_id,
            zone_id=zone_id,
            landmark_ids=[lm["id"] for lm in zone_doc.get("landmarks", [])],
            resource_ids=[r["id"] for r in zone_doc.get("resources", [])],
            hazard_ids=[h["id"] for h in zone_doc.get("hazards", [])],
            lore_summary=zone_doc.get("reasonToGo", cont_meta["structuralIdea"]),
            level_band=level_band,
            biome_override=None,
            cont_meta=cont_meta,
            bestiary=bestiary,
            palettes_doc=palettes_doc,
            derived_spine=derived_spine,
        )
        if not args.check:
            save_json(MAPS_DIR / f"{zone_id}.json", doc)
        compiled.append(doc)

    # 4. Compile the 4 Frontier Continent Anchor Maps (c01, c11, c12, c13)
    for fcfg in FRONTIER_ANCHOR_MAPS:
        map_id = fcfg["mapId"]
        continent_id = fcfg["continentId"]
        cont_meta = continents[continent_id]
        doc = compile_continent_zone_or_anchor_map(
            map_id=map_id,
            display_name=fcfg["displayName"],
            continent_id=continent_id,
            region_id=fcfg["regionId"],
            zone_id=fcfg["zoneId"],
            landmark_ids=list(fcfg["landmarkIds"]),
            resource_ids=[],
            hazard_ids=[],
            lore_summary=cont_meta["structuralIdea"],
            level_band=list(fcfg["levelBand"]),
            biome_override=fcfg["biome"],
            cont_meta=cont_meta,
            bestiary=bestiary,
            palettes_doc=palettes_doc,
            derived_spine=derived_spine,
        )
        if not args.check:
            save_json(MAPS_DIR / f"{map_id}.json", doc)
        compiled.append(doc)

    errors = verify_compiled_maps(compiled, bestiary, continents, check_on_disk=True)
    for doc in compiled:
        mid = doc["mapId"]
        spawns = len(doc.get("spawnAreas", []))
        obs = len(doc.get("staticObstacles", []))
        terr = len(doc.get("heightTerraces", []))
        rts = len(doc.get("routes", []))
        binding = doc.get("worldSpineBinding", {})
        print(
            f"[compile_world_maps] {mid:22s} | seed={doc['seed']} | {int(doc['width'])}x{int(doc['height'])} | "
            f"spawns={spawns:2d} | obstacles={obs:2d} | terraces={terr} | routes={rts} | "
            f"zone={binding.get('zoneId')} ({binding.get('regionId')}) -> {binding.get('storyRegionId') or binding.get('townId') or binding.get('primaryPinnedId', '')}"
        )

    if errors:
        for err in errors:
            print(f"[compile_world_maps] FAIL: {err}", file=sys.stderr)
        return 1

    print(
        f"[compile_world_maps] PASS — {len(compiled)} playable maps, "
        f"{len(continents)}/{len(continents)} Continents, "
        f"40/40 Surveyed Zones, 10/10 Story Regions, "
        f"{len(bestiary)}/{len(bestiary)} Bestiary creatures bound, 0 errors."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
