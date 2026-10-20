#!/usr/bin/env python3
"""Deterministic Multi-Iteration Audit & Expansion Loop for the T-Shaped World Atlas.

Audits and scores (0-100) the World Atlas across 6 dimensions:
  - D1: 6 Playable Race Spawn Locations (`race_spawn_locations`)
  - D2: Town Street Blueprints & NPC (Shop + Refinement) Coverage (6 Starting Towns + 9 Castle/Hub Towns = 15 Towns)
  - D3: Multi-Floor Underground & Tower Dungeon Warp Coverage (Regular Dungeons & Catacombs `B1..B3` / `1F..3F`)
  - D4: Monster, Mini-Boss, Raid & MVP Spawn & Filter Coverage
  - D5: Geographic Travel Path & Anti-Clutter Score
  - D6: 7 MDA Experience Pillars Score (Aesthetic, Continuity, Narrative, Challenge, Discovery, Fantasy, Submission)

Supports `--auto-expand-next-wave` to deterministically expand:
  1) All 6 Playable Race Spawn Locations (`race_spawn_locations`) if missing/incomplete,
  2) The next unbuilt Town Blueprint (`town_blueprint` with streets, buildings `1..12`, `race_spawn_point`,
     `refinement_anvils`, and 7 canonical service marks including `equip_shop`, `consumable_shop`, `blacksmith` /
     `refinement_anvils`, `temple`, `warehouse`, `guild`, `gatekeeper` + `1..12` NPC roster),
  3) The next unbuilt Multi-Floor Dungeon (`B1..B3` or `1F..3F` with rooms, warps, and `Monster` / `Mini-Boss` /
     `Raid` / `MVP` spawns) in `content/studio/t_shaped_world_atlas.json`,
writing compact state to `build/atlas_iteration_state.json`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
STUDIO_DIR = REPO_ROOT / "content" / "studio"
WHC_PATH = STUDIO_DIR / "world_history_and_concept.json"
ATLAS_PATH = STUDIO_DIR / "t_shaped_world_atlas.json"
STATE_PATH = REPO_ROOT / "build" / "atlas_iteration_state.json"

CANON_RACES = (
    ("human_demi_human", "Human", "First Meridian Obelisk Shrine"),
    ("lunar", "Lunar", "Porcelain Star-Loom Font"),
    ("ogre_orc", "Ogre/Orc", "Immortal Draft-Kiln Flame Pillar"),
    ("dwarf", "Dwarf", "Amber-Root Roundhouse Anvil Shrine"),
    ("dark_lunar", "Dark-Lunar", "Umbral Carillon Chime Altar"),
    ("furral", "Furral", "Cinnamon Wind-Turbine Totem"),
)

REQUIRED_SERVICE_MARKS = (
    "equip_shop",
    "consumable_shop",
    "blacksmith",
    "temple",
    "warehouse",
    "guild",
    "gatekeeper",
)

REQUIRED_SPAWN_TIERS = ("Monster", "Mini-Boss", "Raid", "MVP")

REQUIRED_FIELD_MARKS = (
    "Supply Camp",
    "Wayfarer Shrine",
    "Gatekeeper Waypoint",
    "Refinement Ore Vein",
)

REQUIRED_RASTER_PLATES = (
    "all_interlaced_world_grid.png",
    "c3_continent_parchment_relief.png",
    "d01_field_common_map.png",
    "d01_field_radar_map.png",
    "d01_dungeon_common_map.png",
    "d01_dungeon_radar_map.png",
    "d01_town_detailed_blueprint.png",
    "town_radial_moat_parchment.png",
    "town_polygonal_keep_parchment.png",
    "town_oren_schematic_plate.png",
    "dungeon_underground_b1_b3_radar.png",
    "dungeon_vertical_tower_1f_3f_radar.png",
)

ARCHETYPE_RASTER_PLATES = (
    "all_interlaced_world_grid.png",
    "c3_continent_parchment_relief.png",
    "d01_field_common_map.png",
    "d01_field_radar_map.png",
    "d01_dungeon_radar_map.png",
    "d01_town_detailed_blueprint.png",
    "town_radial_moat_parchment.png",
    "town_polygonal_keep_parchment.png",
    "town_oren_schematic_plate.png",
    "dungeon_underground_b1_b3_radar.png",
    "dungeon_vertical_tower_1f_3f_radar.png",
)

MDA_PILLARS = (
    "Aesthetic",
    "Continuity",
    "Narrative",
    "Challenge",
    "Discovery",
    "Fantasy",
    "Submission",
)

NINTH_HUB_TOWN: dict[str, Any] = {
    "zone_id": "zone-town-torque-balance-citadel",
    "studio_node_id": "town-torque-balance-citadel",
    "name": "Town of Torque-Balance Citadel (Human Ancestral Expedition Hub)",
    "category": "castle_or_hub_town",
    "continent_id": "continent-02-clockwork-steppe",
    "territory_name": "Differential Spur Gorge (D06)",
    "level_header": "Town of Torque-Balance Citadel: lvl.30 [28-36]",
    "level_band": [28, 36],
    "grid_sector": "23_16",
    "loc_coord": "116400:-18400",
    "l2_reference_analog": "Heine / Town of Oren Planetary Citadel",
    "race_or_seal_affinity": "human_demi_human",
    "connected_zone_ids": [
        "zone-town-escapement-anvil",
        "zone-town-inductor-switchyard",
        "zone-dungeon-chronometer-foundry",
    ],
    "t_depth_status": "t_breadth_indexed",
}

ADDITIONAL_FIELD_ZONES: list[dict[str, Any]] = [
    {
        "zone_id": "zone-field-whispering-mire",
        "studio_node_id": "hunting-area-whispering-mire",
        "name": "The Whispering Teapot Mire (Human & Dark-Lunar Border Marsh)",
        "category": "field_hunting_zone",
        "continent_id": "continent-01-hearthbloom-basin",
        "territory_name": "Teacup Meadows (D01)",
        "level_header": "Whispering Teapot Mire: lvl.10 [10-15]",
        "level_band": [10, 15],
        "grid_sector": "18_24",
        "loc_coord": "-68400:228400",
        "l2_reference_analog": "Swamp of Screams / Cruma Marshlands: lvl.10 [10-15]",
        "race_or_seal_affinity": "human_demi_human",
        "connected_zone_ids": [
            "zone-town-lantern-hollow",
            "zone-dungeon-kiln-cellar",
            "zone-town-kilnwatch-bastion",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-slag-chasm",
        "studio_node_id": "hunting-area-slag-chasm",
        "name": "The Vitrified Slag Chasm (Kilnwatch Convergence Badlands)",
        "category": "field_hunting_zone",
        "continent_id": "continent-01-hearthbloom-basin",
        "territory_name": "Kilnfire Terraces (D06)",
        "level_header": "Vitrified Slag Chasm: lvl.16 [16-20]",
        "level_band": [16, 20],
        "grid_sector": "20_23",
        "loc_coord": "24800:136200",
        "l2_reference_analog": "Ruins of Despair / Execution Grounds: lvl.16 [16-20]",
        "race_or_seal_affinity": "all_races_convergence",
        "connected_zone_ids": [
            "zone-town-kilnwatch-bastion",
            "zone-dungeon-ember-bellows-chamber",
            "zone-field-cinder-apron",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-astrolabe-rift",
        "studio_node_id": "hunting-area-astrolabe-rift",
        "name": "The Astrolabe Rift Promontory (Steppe Gear Escarpment)",
        "category": "field_hunting_zone",
        "continent_id": "continent-02-clockwork-steppe",
        "territory_name": "Rustcog Downs (D01)",
        "level_header": "Astrolabe Rift Promontory: lvl.25 [25-30]",
        "level_band": [25, 30],
        "grid_sector": "21_20",
        "loc_coord": "76400:68200",
        "l2_reference_analog": "Plains of the Lizardmen / Sea of Spores: lvl.25 [25-30]",
        "race_or_seal_affinity": "robotic",
        "connected_zone_ids": [
            "zone-town-pinion-terminus",
            "zone-dungeon-pendulum-shaft",
            "zone-field-brass-spur-ridge",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-siphon-sluice",
        "studio_node_id": "hunting-area-siphon-sluice",
        "name": "The Verdigris Siphon Sluiceway (Mercury Canal Hunting Lock)",
        "category": "field_hunting_zone",
        "continent_id": "continent-02-clockwork-steppe",
        "territory_name": "Verdigris Canal Lock (D03)",
        "level_header": "Verdigris Siphon Sluiceway: lvl.25 [25-29]",
        "level_band": [25, 29],
        "grid_sector": "21_18",
        "loc_coord": "64200:34800",
        "l2_reference_analog": "Alligator Island / Breka's Stronghold: lvl.25 [25-29]",
        "race_or_seal_affinity": "lunar",
        "connected_zone_ids": [
            "zone-town-mercury-sluice-bazaar",
            "zone-dungeon-pendulum-shaft",
            "zone-town-escapement-anvil",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-metronome-bridge",
        "studio_node_id": "hunting-area-metronome-bridge",
        "name": "Metronome Suspension Bridge (Highland Escapement Crossing)",
        "category": "field_hunting_zone",
        "continent_id": "continent-02-clockwork-steppe",
        "territory_name": "Pendulum Escapement Reach (D06)",
        "level_header": "Metronome Suspension Bridge: lvl.34 [34-36]",
        "level_band": [34, 36],
        "grid_sector": "23_16",
        "loc_coord": "118600:-8400",
        "l2_reference_analog": "Death Pass / Dragon Valley Approach: lvl.34 [34-36]",
        "race_or_seal_affinity": "dark_lunar",
        "connected_zone_ids": [
            "zone-town-metronome-pivot",
            "zone-dungeon-chronometer-foundry",
            "zone-town-torque-balance-citadel",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-spiral-wormway-ramp",
        "studio_node_id": "hunting-area-spiral-wormway-ramp",
        "name": "Spiral Wormway Ramp (Deep Quarry Helical Trench)",
        "category": "field_hunting_zone",
        "continent_id": "continent-02-clockwork-steppe",
        "territory_name": "Worm-Gear Trench (D07)",
        "level_header": "Spiral Wormway Ramp: lvl.38 [38-39]",
        "level_band": [38, 39],
        "grid_sector": "24_16",
        "loc_coord": "134200:-24600",
        "l2_reference_analog": "Enchanted Valley / Mithril Mines Surface: lvl.38 [38-39]",
        "race_or_seal_affinity": "dwarf",
        "connected_zone_ids": [
            "zone-town-inductor-switchyard",
            "zone-catacomb-apostate-dynamo",
            "zone-town-metronome-pivot",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-orrery-bridge",
        "studio_node_id": "hunting-area-orrery-bridge",
        "name": "The Orrery Bridge (Astral Refractory Sky-Span)",
        "category": "field_hunting_zone",
        "continent_id": "continent-03-shattered-halo",
        "territory_name": "Zenith Refractory (D02)",
        "level_header": "The Orrery Bridge: lvl.36 [36-42]",
        "level_band": [36, 42],
        "grid_sector": "19_13",
        "loc_coord": "-28400:-108200",
        "l2_reference_analog": "Blazing Swamp / Cemetery of Aden: lvl.36 [36-42]",
        "race_or_seal_affinity": "seal_of_gnosis",
        "connected_zone_ids": [
            "zone-town-starfall-haven",
            "zone-dungeon-star-heart-nave",
            "zone-field-tether-causeway",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
    {
        "zone_id": "zone-field-kelp-spiral-reef",
        "studio_node_id": "hunting-area-kelp-spiral-reef",
        "name": "Kelp Spiral Reef (Bioluminescent Undertide Hunting Shoals)",
        "category": "field_hunting_zone",
        "continent_id": "continent-03-shattered-halo",
        "territory_name": "Abyssal Undertide Reef (D03)",
        "level_header": "Kelp Spiral Reef: lvl.42 [42-46]",
        "level_band": [42, 46],
        "grid_sector": "18_13",
        "loc_coord": "-52400:-138600",
        "l2_reference_analog": "Field of Silence / Field of Whispers: lvl.42 [42-46]",
        "race_or_seal_affinity": "leviathan",
        "connected_zone_ids": [
            "zone-town-undertide-lantern",
            "zone-catacomb-dark-omens-coral",
            "zone-town-starfall-haven",
        ],
        "t_depth_status": "t_breadth_indexed",
    },
]


def _parse_loc(loc_str: str) -> tuple[int, int]:
    try:
        parts = str(loc_str).split(":")
        return int(parts[0]), int(parts[1])
    except Exception:
        return 0, 0


def _fmt_loc(x: int, y: int) -> str:
    return f"{x}:{y}"


def _build_race_spawn_locations(whc: dict[str, Any], atlas: dict[str, Any]) -> list[dict[str, Any]]:
    races_by_key = {
        r["race_key"]: r
        for r in (whc.get("race_taxonomy", {}).get("playable_and_mob_races") or [])
        if isinstance(r, dict) and r.get("race_key")
    }
    zdir = atlas.get("t_breadth_zone_directory") or {}
    starter_by_node = {
        z["studio_node_id"]: z
        for z in (zdir.get("starting_towns") or [])
        if isinstance(z, dict) and z.get("studio_node_id")
    }
    spawns: list[dict[str, Any]] = []
    for rkey, short_label, shrine_name in CANON_RACES:
        r_doc = races_by_key.get(rkey, {})
        town_node_id = str(r_doc.get("home_town_id", "town-lantern-hollow"))
        z_doc = starter_by_node.get(town_node_id, {})
        bx, by = _parse_loc(z_doc.get("loc_coord", "-84120:243500"))
        spawn_loc = _fmt_loc(bx + 70, by - 80)
        spawns.append(
            {
                "race_id": str(r_doc.get("id", f"race-{rkey.replace('_', '-')}")),
                "race_key": rkey,
                "race_name": f"{short_label} ({r_doc.get('name', short_label)})",
                "starter_town_zone_id": str(z_doc.get("zone_id", f"zone-{town_node_id}")),
                "starter_town_node_id": town_node_id,
                "starter_town_name": str(r_doc.get("home_town_name", z_doc.get("name", town_node_id))),
                "continent_id": str(r_doc.get("continent_id", "continent-01-hearthbloom-basin")),
                "district_id": str(r_doc.get("district_id", "district-teacup-meadows")),
                "loc_coord": spawn_loc,
                "starter_shrine_monument": shrine_name,
                "macro_map_marker": {
                    "label": f"{short_label} Spawn · {shrine_name}",
                    "icon": str(r_doc.get("icon", "✨")),
                    "grid_sector": str(z_doc.get("grid_sector", "18_24")),
                    "loc_coord": spawn_loc,
                },
                "town_blueprint_marker": {
                    "label": f"{short_label} Awakening Shrine ({shrine_name})",
                    "shrine_building_number": 1,
                    "x_pct": 50,
                    "y_pct": 49,
                    "loc_coord": spawn_loc,
                },
            }
        )
    return spawns


RACE_ROUTE_SPECS: tuple[tuple[str, str, str, str, str, str, str, str, str, str], ...] = (
    (
        "human_demi_human",
        "Human",
        "Human (Hearth-Born)",
        "#eab308",
        "zone-town-lantern-hollow",
        "Lantern Hollow Village",
        "Talking Island / Gludin Village",
        "zone-field-clover-south-gate",
        "Clover South-Gate Meadow",
        "Talking Island Eastern Territory",
    ),
    (
        "lunar",
        "Lunar",
        "Lunar (Moon-Weavers)",
        "#38bdf8",
        "zone-town-porcelain-loom",
        "Porcelain Loom Sanctuary",
        "Elven Village (Mother Tree)",
        "zone-field-celadon-causeway",
        "Celadon Glaze Causeway",
        "Elven Forest / Neutral Zone",
    ),
    (
        "ogre_orc",
        "Ogre/Orc",
        "Ogre/Orc (Bellows-Kin)",
        "#f97316",
        "zone-town-draft-kiln-post",
        "Draft-Kiln Post",
        "Orc Village (Immortal Plateau)",
        "zone-field-firebrick-duct",
        "Firebrick Bellows Duct",
        "Valley of Heroes",
    ),
    (
        "dwarf",
        "Dwarf",
        "Dwarf (Anvil-Forged)",
        "#f59e0b",
        "zone-town-root-train-roundhouse",
        "Root-Train Roundhouse",
        "Dwarven Village (Western Mining)",
        "zone-field-resin-arch-tunnel",
        "Resin-Arch Root Tunnel",
        "Western Mining Zone",
    ),
    (
        "dark_lunar",
        "Dark-Lunar",
        "Dark-Lunar (Chime-Forged)",
        "#a855f7",
        "zone-town-carillon-belfry",
        "Carillon Hearth Belfry",
        "Dark Elven Village (Dark Forest)",
        "zone-field-chime-pipe-colonnade",
        "Chime-Pipe Colonnade",
        "Swampland / Dark Forest",
    ),
    (
        "furral",
        "Furral",
        "Furral (Wind-Tail)",
        "#22c55e",
        "zone-town-cinnamon-mill",
        "Cinnamon-Mill Haven",
        "Kamael Village (Isle of Souls)",
        "zone-field-cinnamon-bark-viaduct",
        "Cinnamon-Bark Viaduct",
        "Hills of Gold / Isle of Souls",
    ),
)

RACE_STARTER_DUNGEON_MAP: dict[str, tuple[str, str, str, str]] = {
    "human_demi_human": (
        "zone-dungeon-kiln-cellar",
        "Kiln Cellar Ruins (The Ant Nest)",
        "The Ant Nest / Elven Ruins B1–B3",
        "-113490:235526",
    ),
    "lunar": (
        "zone-dungeon-medallion-heart-vault",
        "Medallion Heart Fortress",
        "Elven Fortress / The Ant Nest B1–B3",
        "49800:44100",
    ),
    "ogre_orc": (
        "zone-dungeon-ember-bellows-chamber",
        "Ember Bellows Cave of Trials",
        "Cave of Trials / The Ant Nest B1–B3",
        "-41200:-109800",
    ),
    "dwarf": (
        "zone-dungeon-sap-heart-cistern",
        "Sap-Heart Abandoned Mines",
        "Abandoned Coal Mines / Ant Nest B1–B3",
        "119400:-174200",
    ),
    "dark_lunar": (
        "zone-dungeon-ceramic-resonator-crypt",
        "Ceramic Resonator School of Dark Arts",
        "School of Dark Arts / Ant Nest B1–B3",
        "15200:19400",
    ),
    "furral": (
        "zone-dungeon-spice-kiln-cellar",
        "Spice-Kiln Nornil's Cave",
        "Nornil's Cave / The Ant Nest B1–B3",
        "-115400:49100",
    ),
}


def _build_race_growth_routes(whc: dict[str, Any], atlas: dict[str, Any]) -> list[dict[str, Any]]:
    zdir = atlas.get("t_breadth_zone_directory") or {}
    zones_by_id: dict[str, dict[str, Any]] = {}
    for cat_list in zdir.values():
        if isinstance(cat_list, list):
            for z in cat_list:
                if isinstance(z, dict) and z.get("zone_id"):
                    zones_by_id[str(z["zone_id"])] = z

    routes: list[dict[str, Any]] = []
    for (
        rkey,
        rlabel,
        rname,
        color_hex,
        town_zid,
        town_name,
        town_alias,
        field_zid,
        field_name,
        field_alias,
    ) in RACE_ROUTE_SPECS:
        t_doc = zones_by_id.get(town_zid, {})
        f_doc = zones_by_id.get(field_zid, {})
        d_zid, d_name, d_alias, d_loc = RACE_STARTER_DUNGEON_MAP[rkey]
        t_loc = str(t_doc.get("loc_coord", "-84120:243500"))
        f_loc = str(f_doc.get("loc_coord", "72986:113330"))
        bx, by = _parse_loc(t_loc)
        spawn_loc = _fmt_loc(bx + 70, by - 80)

        waypoints = [
            {
                "step_index": 1,
                "stage_code": "A",
                "zone_id": town_zid,
                "name": f"{rlabel} Awakening Shrine ({town_name})",
                "l2_alias": f"{rlabel} Spawn Shrine · {town_alias}",
                "loc": spawn_loc,
                "level_range": "Lv.1–4",
                "travel_mode": "footpath",
                "milestone_goal": f"Awaken at {rlabel} Shrine, claim Newbie Soulshots, and equip starter gear in {town_name}.",
            },
            {
                "step_index": 2,
                "stage_code": "B",
                "zone_id": field_zid,
                "name": field_name,
                "l2_alias": field_alias,
                "loc": f_loc,
                "level_range": "Lv.4–12",
                "travel_mode": "footpath",
                "milestone_goal": f"Clear {rlabel} starter field packs, harvest High-Grade Iron Ore, and refine weapon to +3.",
            },
            {
                "step_index": 3,
                "stage_code": "C",
                "zone_id": d_zid,
                "name": d_name,
                "l2_alias": d_alias,
                "loc": d_loc,
                "level_range": "Lv.10–20",
                "travel_mode": "dungeon_warp",
                "milestone_goal": "Descend B1->B2->B3 subterranean halls and defeat the Stage C Mini-Boss / Queen Ant brood.",
            },
            {
                "step_index": 4,
                "stage_code": "D",
                "zone_id": "zone-town-kilnwatch-bastion",
                "name": "Town of Kilnwatch Bastion (All-Race Dion/Gludio Hub)",
                "l2_alias": "Town of Dion / Town of Gludio (1st Class Transfer)",
                "loc": "18600:145200",
                "level_range": "Lv.18–22",
                "travel_mode": "gatekeeper_teleport",
                "milestone_goal": "Complete 1st Class Transfer at Neutral Adventure Guild and unlock D-Grade +6 Anvil Refinement.",
            },
            {
                "step_index": 5,
                "stage_code": "E",
                "zone_id": "zone-dungeon-kiln-cellar",
                "name": "Kiln Cellar Ruins (The Ant Nest Convergence Raid)",
                "l2_alias": "The Ant Nest B1–B3 (Queen Ant Lair)",
                "loc": "-113490:235526",
                "level_range": "Lv.20–24",
                "travel_mode": "dungeon_warp",
                "milestone_goal": "Form multi-race party to farm Ant Nest B3 spoils and Queen Ant Soul Crystal catalysts.",
            },
            {
                "step_index": 6,
                "stage_code": "F",
                "zone_id": "zone-town-pinion-terminus",
                "name": "Pinion Terminus Township (Clockwork Steppe Hub)",
                "l2_alias": "Town of Oren / Giran Castle Cross-Continental Hub",
                "loc": "82900:53200",
                "level_range": "Lv.24–28",
                "travel_mode": "highway",
                "milestone_goal": "Cross into Continent 02 (The Clockwork Steppe) and stock C-Grade weapons at Oren Blacksmith.",
            },
            {
                "step_index": 7,
                "stage_code": "G",
                "zone_id": "zone-dungeon-pendulum-shaft",
                "name": "Pendulum Shaft Tower (Cruma Tower 1F–3F)",
                "l2_alias": "Cruma Tower (Core Prime Governor Spire)",
                "loc": "85400:144200",
                "level_range": "Lv.26–32",
                "travel_mode": "dungeon_warp",
                "milestone_goal": "Ascend 1F->2F->3F mechanical spire, challenge Catherok Raid & Core MVP, and refine gear to +9.",
            },
            {
                "step_index": 8,
                "stage_code": "H",
                "zone_id": "zone-town-escapement-anvil",
                "name": "Town of Escapement Anvil (2nd-Class Trial Arena)",
                "l2_alias": "Hardin's Academy / Town of Oren Mastery Hall",
                "loc": "83100:53200",
                "level_range": "Lv.32–36",
                "travel_mode": "highway",
                "milestone_goal": "Undertake the Three Trial Marks for 2nd-Class Awakening and bind Stage 7 Soul Crystals.",
            },
            {
                "step_index": 9,
                "stage_code": "I",
                "zone_id": "zone-dungeon-chronometer-foundry",
                "name": "Chronometer Foundry (Tower of Insolence 1F–3F)",
                "l2_alias": "Tower of Insolence / Mithril Mines Labyrinth",
                "loc": "84800:56400",
                "level_range": "Lv.35–42",
                "travel_mode": "dungeon_warp",
                "milestone_goal": "Conquer Hallate Vanguard & Sovereign Chronometer Aethelgard for +12 Blessed Enchant Scrolls.",
            },
            {
                "step_index": 10,
                "stage_code": "J",
                "zone_id": "zone-town-inductor-switchyard",
                "name": "Town of Inductor Switchyard (Promotion Capital)",
                "l2_alias": "Town of Goddard / Schuttgart Industrial Capital",
                "loc": "147400:-55200",
                "level_range": "Lv.40–48",
                "travel_mode": "gatekeeper_teleport",
                "milestone_goal": "Finalize 2nd-Class Promotion and board the Astral Tether Airship toward Continent 03.",
            },
            {
                "step_index": 11,
                "stage_code": "K",
                "zone_id": "zone-town-starfall-haven",
                "name": "Starfall Haven Sky-Harbor (Shattered Halo Capital)",
                "l2_alias": "Aden / Gracia Sky-Harbor Alliance Base",
                "loc": "-14200:-124000",
                "level_range": "Lv.48–75",
                "travel_mode": "sea_or_airship",
                "milestone_goal": "Arrive in Continent 03 (The Shattered Halo) via Sky-Harbor Airship and forge S-Grade equipment.",
            },
            {
                "step_index": 12,
                "stage_code": "L",
                "zone_id": "zone-dungeon-star-heart-nave",
                "name": "Star-Heart Nave & Crown-Beacon Astrolabe (Halo Endgame)",
                "l2_alias": "Seed of Infinity / Tower of Insolence Apex Sanctum",
                "loc": "142000:-198000",
                "level_range": "Lv.75–99",
                "travel_mode": "dungeon_warp",
                "milestone_goal": "Challenge the Apostle of the Shattered Halo MVP and complete +15 Sovereign Weapon Refinement.",
            },
        ]

        routes.append(
            {
                "route_id": f"route-growth-{rkey}",
                "race_key": rkey,
                "race_label": rlabel,
                "race_name": rname,
                "color_hex": color_hex,
                "summary": f"{rlabel} progression: Spawn ({town_name}) -> {field_name} -> {d_name} -> Dion Hub -> Oren/Cruma Tower -> Halo Endgame (Stages A..L).",
                "waypoints": waypoints,
            }
        )
    return routes


REFINEMENT_GRADE_SPECS: tuple[dict[str, Any], ...] = (
    {
        "grade_code": "No-Grade Lv.1–19",
        "grade_short_code": "No-Grade",
        "level_band": [1, 19],
        "representative_weapons": [
            "Lantern Apprentice Broadsword",
            "Porcelain Willow Wand",
            "Bellows Iron Cleaver",
        ],
        "representative_armor": [
            "Apprentice Hearth Tunic Set",
            "Wooden Buckler & Leather Greaves",
        ],
        "required_materials": [
            {
                "material_name": "High-Grade Iron Ore & Varnish",
                "drop_or_spoil_rate": "44.0% Dwarf Spoil / 22.0% Pack Drop",
                "used_for_plus_range": "+1 to +6 Safe & Artisan Tempering",
                "drop_zones": [
                    "zone-field-clover-south-gate",
                    "zone-field-celadon-causeway",
                    "zone-dungeon-kiln-cellar",
                ],
            },
            {
                "material_name": "Refinement Flux Dust & Coal",
                "drop_or_spoil_rate": "36.0% Dwarf Spoil / 18.0% Mini-Boss Drop",
                "used_for_plus_range": "+7 to +12 Master Blacksmith Resonance",
                "drop_zones": [
                    "zone-field-firebrick-duct",
                    "zone-field-resin-arch-tunnel",
                    "zone-dungeon-sap-heart-cistern",
                ],
            },
            {
                "material_name": "Apprentice Anvil Seal Fragment",
                "drop_or_spoil_rate": "15.0% B3/3F Boss Drop / 24.0% Raid Spoil",
                "used_for_plus_range": "+13 to +15 Over-Enchant Stabilizer",
                "drop_zones": [
                    "zone-field-chime-pipe-colonnade",
                    "zone-field-cinnamon-bark-viaduct",
                    "zone-dungeon-medallion-heart-vault",
                ],
            },
        ],
        "home_blacksmith_towns": [
            "zone-town-lantern-hollow",
            "zone-town-porcelain-loom",
            "zone-town-draft-kiln-post",
            "zone-town-root-train-roundhouse",
            "zone-town-carillon-belfry",
            "zone-town-cinnamon-mill",
        ],
    },
    {
        "grade_code": "D-Grade Lv.20–39",
        "grade_short_code": "D-Grade",
        "level_band": [20, 39],
        "representative_weapons": [
            "Kilnwatch Sabre (Elven Long Sword)",
            "Gastraphetes Crossbow",
            "Staff of Life & Ash-Bone Glaive",
        ],
        "representative_armor": [
            "Brigandine Plate Cuirass Set",
            "Manticore Skin Shirt & Mithril Banded Mail",
        ],
        "required_materials": [
            {
                "material_name": "Tempered Alloy Plate & Cord",
                "drop_or_spoil_rate": "38.0% Dwarf Spoil / 19.5% Pack Drop",
                "used_for_plus_range": "+1 to +6 Safe & Artisan Tempering",
                "drop_zones": [
                    "zone-field-cinder-apron",
                    "zone-field-brass-spur-ridge",
                    "zone-dungeon-kiln-cellar",
                ],
            },
            {
                "material_name": "Mithril Ore & High-Grade Cokes",
                "drop_or_spoil_rate": "28.0% Mini-Boss Spoil / 14.5% Raid Drop",
                "used_for_plus_range": "+7 to +12 Master Blacksmith Resonance",
                "drop_zones": [
                    "zone-field-slag-chasm",
                    "zone-field-caldera-rim",
                    "zone-dungeon-pendulum-shaft",
                ],
            },
            {
                "material_name": "D-Grade Artisan Anvil Core",
                "drop_or_spoil_rate": "12.5% Queen Ant / Core MVP Sanctum Drop",
                "used_for_plus_range": "+13 to +15 Over-Enchant Stabilizer",
                "drop_zones": [
                    "zone-field-siphon-sluice",
                    "zone-catacomb-heretic-kiln",
                    "zone-dungeon-ember-bellows-chamber",
                ],
            },
        ],
        "home_blacksmith_towns": [
            "zone-town-kilnwatch-bastion",
            "zone-town-glaze-barge-quay",
            "zone-town-pinion-terminus",
        ],
    },
    {
        "grade_code": "C-Grade Lv.40–51",
        "grade_short_code": "C-Grade",
        "level_band": [40, 51],
        "representative_weapons": [
            "Samurai Longsword of Escapement",
            "Homunkulus Sword (Acumen)",
            "Eminence Bow & Orcish Poleaxe",
        ],
        "representative_armor": [
            "Full Plate Armor Set",
            "Karmian Tunic Set & Plated Leather Mail",
        ],
        "required_materials": [
            {
                "material_name": "Oriharukon Ore & Compound Braid",
                "drop_or_spoil_rate": "34.0% Dwarf Spoil / 17.0% Pack Drop",
                "used_for_plus_range": "+1 to +6 Safe & Artisan Tempering",
                "drop_zones": [
                    "zone-field-leyden-causeway",
                    "zone-field-metronome-bridge",
                    "zone-dungeon-chronometer-foundry",
                ],
            },
            {
                "material_name": "Master Blacksmith Seal Cluster",
                "drop_or_spoil_rate": "24.0% Catacomb Spoil / 13.0% Raid Drop",
                "used_for_plus_range": "+7 to +12 Master Blacksmith Resonance",
                "drop_zones": [
                    "zone-field-spiral-wormway-ramp",
                    "zone-catacomb-branded-bellows",
                    "zone-catacomb-apostate-dynamo",
                ],
            },
            {
                "material_name": "C-Grade Resonance Catalyst",
                "drop_or_spoil_rate": "11.0% Tower 3F MVP Sanctum Drop",
                "used_for_plus_range": "+13 to +15 Over-Enchant Stabilizer",
                "drop_zones": [
                    "zone-field-orrery-bridge",
                    "zone-dungeon-sunken-potter-hold",
                    "zone-dungeon-pendulum-shaft",
                ],
            },
        ],
        "home_blacksmith_towns": [
            "zone-town-escapement-anvil",
            "zone-town-torque-balance-citadel",
            "zone-town-inductor-switchyard",
        ],
    },
    {
        "grade_code": "B-Grade Lv.52–60",
        "grade_short_code": "B-Grade",
        "level_band": [52, 60],
        "representative_weapons": [
            "Sword of Damascus (Focus)",
            "Sword of Valhalla & Kris Dagger",
            "Bow of Peril & Lance",
        ],
        "representative_armor": [
            "Blue Wolf Breastplate & Doom Plate Set",
            "Avadon Robe Set & Zubei Leather Armor",
        ],
        "required_materials": [
            {
                "material_name": "Warden Alloy Core & Metallic Fiber",
                "drop_or_spoil_rate": "30.0% Dwarf Spoil / 15.0% Pack Drop",
                "used_for_plus_range": "+1 to +6 Safe & Artisan Tempering",
                "drop_zones": [
                    "zone-field-tether-causeway",
                    "zone-field-kelp-spiral-reef",
                    "zone-catacomb-witch-pendulum",
                ],
            },
            {
                "material_name": "High-Grade Oriharukon & Enria",
                "drop_or_spoil_rate": "21.0% Mini-Boss Spoil / 11.5% Raid Drop",
                "used_for_plus_range": "+7 to +12 Grand Master Forge",
                "drop_zones": [
                    "zone-field-orrery-bridge",
                    "zone-dungeon-chronometer-foundry",
                    "zone-catacomb-apostate-dynamo",
                ],
            },
            {
                "material_name": "B-Grade Grand Master Anvil Core",
                "drop_or_spoil_rate": "9.5% MVP Sanctum Drop / 14.0% Raid Spoil",
                "used_for_plus_range": "+13 to +15 Over-Enchant Stabilizer",
                "drop_zones": [
                    "zone-field-astrolabe-rift",
                    "zone-dungeon-star-heart-nave",
                    "zone-catacomb-dark-omens-coral",
                ],
            },
        ],
        "home_blacksmith_towns": [
            "zone-town-inductor-switchyard",
            "zone-town-starfall-haven",
            "zone-town-torque-balance-citadel",
        ],
    },
    {
        "grade_code": "A-Grade Lv.61–75",
        "grade_short_code": "A-Grade",
        "level_band": [61, 75],
        "representative_weapons": [
            "Tallum Blade * Dark Legion's Edge",
            "Sword of Miracles (Acumen)",
            "Carnage Bow & Dragon Slayer",
        ],
        "representative_armor": [
            "Dark Crystal Robe & Majestic Plate Set",
            "Tallum Heavy Plate & Nightmare Light Armor",
        ],
        "required_materials": [
            {
                "material_name": "Ancient Refinement Catalyst & Asofe",
                "drop_or_spoil_rate": "26.0% Dwarf Spoil / 13.5% Pack Drop",
                "used_for_plus_range": "+1 to +6 Safe & Artisan Tempering",
                "drop_zones": [
                    "zone-field-aurora-tether",
                    "zone-field-kelp-spiral-reef",
                    "zone-dungeon-star-heart-nave",
                ],
            },
            {
                "material_name": "Fortress Forge Core & Thons",
                "drop_or_spoil_rate": "18.5% Mini-Boss Spoil / 10.0% Raid Drop",
                "used_for_plus_range": "+7 to +12 Sovereign Forge",
                "drop_zones": [
                    "zone-field-tether-causeway",
                    "zone-catacomb-dark-omens-coral",
                    "zone-catacomb-forbidden-path-orrery",
                ],
            },
            {
                "material_name": "A-Grade Sovereign Seal Matrix",
                "drop_or_spoil_rate": "8.5% MVP Sanctum Drop / 12.5% Raid Spoil",
                "used_for_plus_range": "+13 to +15 Over-Enchant Stabilizer",
                "drop_zones": [
                    "zone-field-aurora-tether",
                    "zone-catacomb-witch-pendulum",
                    "zone-dungeon-star-heart-nave",
                ],
            },
        ],
        "home_blacksmith_towns": [
            "zone-town-starfall-haven",
            "zone-town-crown-beacon",
            "zone-town-inductor-switchyard",
        ],
    },
    {
        "grade_code": "S-Grade Lv.76–99",
        "grade_short_code": "S-Grade",
        "level_band": [76, 99],
        "representative_weapons": [
            "Forgotten Blade (Focus) — Sovereign Halo",
            "Arcana Mace (Acumen) — Architect Seal",
            "Draconic Bow & Heaven's Divider",
        ],
        "representative_armor": [
            "Imperial Crusader Heavy Plate Set",
            "Major Arcana Robe & Draconic Leather Set",
        ],
        "required_materials": [
            {
                "material_name": "Divine Apostle Anvil Core",
                "drop_or_spoil_rate": "22.0% High-Halo Spoil / 11.0% Raid Drop",
                "used_for_plus_range": "+1 to +6 Safe & Artisan Tempering",
                "drop_zones": [
                    "zone-field-aurora-tether",
                    "zone-dungeon-star-heart-nave",
                    "zone-catacomb-forbidden-path-orrery",
                ],
            },
            {
                "material_name": "Architect Seal Crest & Imperial Alloy",
                "drop_or_spoil_rate": "15.0% Raid Spoil / 9.0% Sanctum Drop",
                "used_for_plus_range": "+7 to +12 Grand Master Sovereign Forge",
                "drop_zones": [
                    "zone-field-tether-causeway",
                    "zone-catacomb-dark-omens-coral",
                    "zone-dungeon-star-heart-nave",
                ],
            },
            {
                "material_name": "Sovereign Bastion Heart (+13..+15 Stabilizer)",
                "drop_or_spoil_rate": "6.5% Apostle MVP Sanctum Drop",
                "used_for_plus_range": "+13 to +15 Apex God-Anvil Limit",
                "drop_zones": [
                    "zone-field-aurora-tether",
                    "zone-catacomb-forbidden-path-orrery",
                    "zone-dungeon-chronometer-foundry",
                ],
            },
        ],
        "home_blacksmith_towns": [
            "zone-town-crown-beacon",
            "zone-town-starfall-haven",
        ],
    },
)


def _build_refinement_grade_matrix() -> list[dict[str, Any]]:
    plus_rate_table = {
        1: (100.0, "+3% P.Atk/M.Atk/P.Def (Safe +1)", "None (100% Safe Tempering Guarantee)"),
        2: (100.0, "+6% P.Atk/M.Atk/P.Def (Safe +2)", "None (100% Safe Tempering Guarantee)"),
        3: (100.0, "+9% P.Atk/M.Atk/P.Def (Safe +3 Max)", "None (100% Safe Tempering Guarantee)"),
        4: (66.0, "+16% P.Atk/M.Atk + Subtle Silver Glow", "Resets to +3 with Blessed Scroll (or Crystallizes)"),
        5: (66.0, "+23% P.Atk/M.Atk + Subtle Amber Glow", "Resets to +3 with Blessed Scroll (or Crystallizes)"),
        6: (66.0, "+30% P.Atk/M.Atk + Artisan Set Bonus Active", "Resets to +3 with Blessed Scroll (or Crystallizes)"),
        7: (45.0, "+42% P.Atk/M.Atk + Radiant Cobalt Aura", "Retains current +level with Seal-Stone Stabilizer"),
        8: (45.0, "+54% P.Atk/M.Atk + Deep Cobalt Weapon Trail", "Retains current +level with Seal-Stone Stabilizer"),
        9: (45.0, "+66% P.Atk/M.Atk + Master Resonance Pulse", "Retains current +level with Seal-Stone Stabilizer"),
        10: (28.0, "+84% P.Atk/M.Atk + Piercing Boss Ward +8%", "Drops -1 level on failure (Protected by Anvil Core)"),
        11: (28.0, "+102% P.Atk/M.Atk + Piercing Boss Ward +12%", "Drops -1 level on failure (Protected by Anvil Core)"),
        12: (28.0, "+120% P.Atk/M.Atk + Crimson Sovereign Aura", "Drops -1 level on failure (Protected by Anvil Core)"),
        13: (15.0, "+145% All Stats + Golden Halo Arc", "Retains +12 floor when bound with Divine Apostle Core"),
        14: (15.0, "+170% All Stats + Architect Seal Resonance", "Retains +12 floor when bound with Divine Apostle Core"),
        15: (15.0, "+200% All Stats + Apex Sovereign Lightning Trail", "Retains +12 floor when bound with Divine Apostle Core"),
    }
    matrix: list[dict[str, Any]] = []
    for spec in REFINEMENT_GRADE_SPECS:
        g_short = spec["grade_short_code"]
        mats = spec["required_materials"]
        rates_by_plus: list[dict[str, Any]] = []
        for p in range(1, 16):
            rate_pct, bonus_str, pen_str = plus_rate_table[p]
            if p <= 6:
                cat_mat = mats[0]["material_name"]
                scroll_prefix = "Scroll: Enchant" if p <= 3 else "Blessed Scroll: Enchant"
            elif p <= 12:
                cat_mat = mats[1]["material_name"]
                scroll_prefix = "Master Anvil Scroll"
            else:
                cat_mat = mats[2]["material_name"]
                scroll_prefix = "Divine Apostle Anvil Catalyst"
            rates_by_plus.append(
                {
                    "plus_level": p,
                    "plus_label": f"+{p}",
                    "success_rate_pct": rate_pct,
                    "stat_bonus": bonus_str,
                    "failure_penalty": pen_str,
                    "required_catalyst": f"{scroll_prefix} ({g_short}) + {cat_mat}",
                }
            )
        matrix.append(
            {
                "grade_code": spec["grade_code"],
                "grade_short_code": g_short,
                "level_band": list(spec["level_band"]),
                "representative_weapons": list(spec["representative_weapons"]),
                "representative_armor": list(spec["representative_armor"]),
                "safe_refinement_level": 3,
                "max_refinement_level": 15,
                "rates_by_plus": rates_by_plus,
                "required_materials": [dict(m) for m in mats],
                "home_blacksmith_towns": list(spec["home_blacksmith_towns"]),
            }
        )
    return matrix


BOSS_HIERARCHY_CHAIN_SPECS: tuple[dict[str, Any], ...] = (
    {
        "god_id": "god-sola-hearth-weaver",
        "god_name": "Sola the Hearth-Weaver (Sealed Primordial of Warm Clay & Hearth-Fires)",
        "god_short_label": "Sola",
        "chapter_epoch": "1.4 God Seal Magic — Sealed under Heretic Kiln Necropolis I",
        "seal_catacomb_zone_id": "zone-catacomb-heretic-kiln",
        "seal_loc": "19800:173400",
        "mvp_apostles": [
            {
                "name": "Kiln-Saint Pyraea — Queen Ant Ash-Brood Sovereign",
                "level": 22,
                "dungeon_id": "zone-dungeon-kiln-cellar",
                "floor_id": "B3",
                "loc": "53100:242600",
                "signature_drop": "D-Grade Artisan Anvil Core & Ring of the Kiln-Saint",
            },
            {
                "name": "Vitrified Apostle Ignisazar (Heretic Kiln Sanctum)",
                "level": 30,
                "dungeon_id": "zone-catacomb-heretic-kiln",
                "floor_id": "B3",
                "loc": "20400:172800",
                "signature_drop": "Sola's Hearth-Flame Catalyst (+10..+12 Stabilizer)",
            },
        ],
        "raid_bosses": [
            {
                "name": "[Raid Boss] Terracotta Kiln Warden (Clover Meadow)",
                "level": 12,
                "zone_id": "zone-field-clover-south-gate",
                "loc": "73436:112980",
                "respawn": "3600s",
            },
            {
                "name": "[Raid Boss] Cinder-Apron Slag Behemoth",
                "level": 22,
                "zone_id": "zone-field-cinder-apron",
                "loc": "-5950:131450",
                "respawn": "3600s",
            },
        ],
        "mini_bosses": [
            {
                "name": "[Mini-Boss] Kiln-Shell Patrol Captain",
                "level": 8,
                "zone_id": "zone-field-clover-south-gate",
                "loc": "73206:113160",
            },
            {
                "name": "[Mini-Boss] Orchard Glaze Overseer",
                "level": 11,
                "zone_id": "zone-field-kiln-east-orchard",
                "loc": "78640:108730",
            },
        ],
        "minion_families": [
            {
                "family_name": "Ash-Crawler & Clover-Dew Pack Brood",
                "representative_mob": "Clover-Dew Pup & Ash-Shell Worker Ant",
                "zone_ids": [
                    "zone-field-clover-south-gate",
                    "zone-field-kiln-east-orchard",
                    "zone-dungeon-kiln-cellar",
                ],
            },
            {
                "family_name": "Heretic Kiln Cinder Acolytes",
                "representative_mob": "Vitrified Clay Zealot",
                "zone_ids": [
                    "zone-field-cinder-apron",
                    "zone-catacomb-heretic-kiln",
                ],
            },
        ],
    },
    {
        "god_id": "god-krono-brass-titan",
        "god_name": "Krono the Brass Titan (Sealed Primordial of Wind-Gears & Perpetual Motion)",
        "god_short_label": "Krono",
        "chapter_epoch": "1.4 God Seal Magic — Sealed under Branded Bellows Necropolis II",
        "seal_catacomb_zone_id": "zone-catacomb-branded-bellows",
        "seal_loc": "112400:18200",
        "mvp_apostles": [
            {
                "name": "Chrono-Vanguard Aegis-IX (Core — Prime Governor)",
                "level": 30,
                "dungeon_id": "zone-dungeon-pendulum-shaft",
                "floor_id": "3F",
                "loc": "17724:108150",
                "signature_drop": "C-Grade Resonance Catalyst & Core's Escapement Ring",
            },
            {
                "name": "Sovereign Chronometer Aethel-Prime",
                "level": 35,
                "dungeon_id": "zone-dungeon-chronometer-foundry",
                "floor_id": "3F",
                "loc": "115180:15900",
                "signature_drop": "Krono's Brass Mainspring Core (+13..+15 Stabilizer)",
            },
        ],
        "raid_bosses": [
            {
                "name": "[Raid Boss] Catherok Pendulum Colossus",
                "level": 26,
                "zone_id": "zone-field-brass-spur-ridge",
                "loc": "89650:138050",
                "respawn": "3600s",
            },
            {
                "name": "[Raid Boss] Mainspring Caldera Gear-Warden",
                "level": 30,
                "zone_id": "zone-field-caldera-rim",
                "loc": "86850:60850",
                "respawn": "3600s",
            },
        ],
        "mini_bosses": [
            {
                "name": "[Mini-Boss] Brass-Spur Escapement Centurion",
                "level": 23,
                "zone_id": "zone-field-brass-spur-ridge",
                "loc": "89420:138230",
            },
            {
                "name": "[Mini-Boss] Astrolabe Rift Pinion Overseer",
                "level": 28,
                "zone_id": "zone-field-astrolabe-rift",
                "loc": "76620:68030",
            },
        ],
        "minion_families": [
            {
                "family_name": "Clockwork Porta & Excuro Constructs",
                "representative_mob": "Cruma Clockwork Golem & Pinion Sentry",
                "zone_ids": [
                    "zone-field-brass-spur-ridge",
                    "zone-dungeon-pendulum-shaft",
                    "zone-dungeon-chronometer-foundry",
                ],
            },
            {
                "family_name": "Branded Bellows Brass Automaton Cohort",
                "representative_mob": "Spring-Wound Piston Stalker",
                "zone_ids": [
                    "zone-field-caldera-rim",
                    "zone-catacomb-branded-bellows",
                ],
            },
        ],
    },
    {
        "god_id": "god-vesper-dream-eater",
        "god_name": "Vesper the Dream-Eater (Sealed Primordial of Starlight Tides & Inverted Gravity)",
        "god_short_label": "Vesper",
        "chapter_epoch": "1.4 God Seal Magic — Sealed under Forbidden Orrery Necropolis VI",
        "seal_catacomb_zone_id": "zone-catacomb-forbidden-path-orrery",
        "seal_loc": "18400:-64200",
        "mvp_apostles": [
            {
                "name": "Eclipse-Cantor Nocturne — Apostle of the Shattered Halo",
                "level": 92,
                "dungeon_id": "zone-dungeon-star-heart-nave",
                "floor_id": "3F",
                "loc": "148000:-204000",
                "signature_drop": "Sovereign Bastion Heart & Vesper's Memory-Glass Crown",
            },
            {
                "name": "First Seal-Scribe Automaton, Prime Keeper",
                "level": 95,
                "dungeon_id": "zone-catacomb-forbidden-path-orrery",
                "floor_id": "B3",
                "loc": "18900:-64800",
                "signature_drop": "Divine Apostle Anvil Core (S-Grade +15 Apex Catalyst)",
            },
        ],
        "raid_bosses": [
            {
                "name": "[Raid Boss] Star-Tether Gravity Leviathan",
                "level": 68,
                "zone_id": "zone-field-aurora-tether",
                "loc": "152850:30850",
                "respawn": "3600s",
            },
            {
                "name": "[Raid Boss] Orrery Bridge Astral Arbiter",
                "level": 42,
                "zone_id": "zone-field-orrery-bridge",
                "loc": "-27950:-108550",
                "respawn": "3600s",
            },
        ],
        "mini_bosses": [
            {
                "name": "[Mini-Boss] Aurora Tether Prism Warden",
                "level": 64,
                "zone_id": "zone-field-aurora-tether",
                "loc": "152620:31030",
            },
            {
                "name": "[Mini-Boss] Star-Tether Causeway Cantor",
                "level": 44,
                "zone_id": "zone-field-tether-causeway",
                "loc": "49420:-41370",
            },
        ],
        "minion_families": [
            {
                "family_name": "Astral Prism & Inverted-Gravity Choir",
                "representative_mob": "Astral Prism Sentinel & Memory-Glass Wraith",
                "zone_ids": [
                    "zone-field-tether-causeway",
                    "zone-field-aurora-tether",
                    "zone-dungeon-star-heart-nave",
                ],
            },
            {
                "family_name": "Forbidden Orrery Seal-Watchers",
                "representative_mob": "Null-Gravity Astrolabe Construct",
                "zone_ids": [
                    "zone-field-orrery-bridge",
                    "zone-catacomb-forbidden-path-orrery",
                ],
            },
        ],
    },
    {
        "god_id": "god-aurelia-dawn-forger",
        "god_name": "Aurelia the Dawn-Forger / Seraphiel of the Zenith Choir (Sealed Radiant Law)",
        "god_short_label": "Aurelia",
        "chapter_epoch": "1.4 God Seal Magic — Sealed under Astral Witch Necropolis IV",
        "seal_catacomb_zone_id": "zone-catacomb-witch-pendulum",
        "seal_loc": "54200:-34800",
        "mvp_apostles": [
            {
                "name": "Arch-Valkyrie Caelia — Dawn-Forger Apostle",
                "level": 50,
                "dungeon_id": "zone-catacomb-witch-pendulum",
                "floor_id": "B3",
                "loc": "54800:-35400",
                "signature_drop": "Aurelia's Dawn-Anvil Sigil & B-Grade Grand Master Core",
            },
            {
                "name": "Porcelain Medallion Archon Sera",
                "level": 20,
                "dungeon_id": "zone-dungeon-medallion-heart-vault",
                "floor_id": "B3",
                "loc": "50200:43700",
                "signature_drop": "Blessed Celadon Seal-Stone (+7..+9 Safe Stabilizer)",
            },
        ],
        "raid_bosses": [
            {
                "name": "[Raid Boss] Celadon Causeway Dawn-Sentinel",
                "level": 12,
                "zone_id": "zone-field-celadon-causeway",
                "loc": "48650:49250",
                "respawn": "3600s",
            },
            {
                "name": "[Raid Boss] Metronome Bridge Seraphic Bell-ringer",
                "level": 36,
                "zone_id": "zone-field-metronome-bridge",
                "loc": "119050:-8750",
                "respawn": "3600s",
            },
        ],
        "mini_bosses": [
            {
                "name": "[Mini-Boss] Chime-Pipe Harmonic Prefect",
                "level": 9,
                "zone_id": "zone-field-chime-pipe-colonnade",
                "loc": "19120:23930",
            },
            {
                "name": "[Mini-Boss] Apricot Aqueduct Bell-Knight",
                "level": 11,
                "zone_id": "zone-field-apricot-aqueduct-terrace",
                "loc": "21620:157830",
            },
        ],
        "minion_families": [
            {
                "family_name": "Zenith Choir & Celadon Loom Automatons",
                "representative_mob": "Porcelain Choir Sentinel & Harmonic Bell-Wisp",
                "zone_ids": [
                    "zone-field-celadon-causeway",
                    "zone-field-chime-pipe-colonnade",
                    "zone-dungeon-medallion-heart-vault",
                ],
            },
            {
                "family_name": "Astral Witch Pendulum Nephilim",
                "representative_mob": "Radiant Seal Inquisitor",
                "zone_ids": [
                    "zone-field-metronome-bridge",
                    "zone-catacomb-witch-pendulum",
                ],
            },
        ],
    },
    {
        "god_id": "god-thalassa-abyss-tide",
        "god_name": "Thalassa the Abyss-Tide / Thalassor the Trench-Swallower (Sealed Pelagic Primordial)",
        "god_short_label": "Thalassa",
        "chapter_epoch": "1.4 God Seal Magic — Sealed under Deep Devotion Necropolis V",
        "seal_catacomb_zone_id": "zone-catacomb-dark-omens-coral",
        "seal_loc": "38400:-28900",
        "mvp_apostles": [
            {
                "name": "Tide-Herald Pelagios — Abyssal Coral Sovereign",
                "level": 65,
                "dungeon_id": "zone-catacomb-dark-omens-coral",
                "floor_id": "B3",
                "loc": "38900:-29400",
                "signature_drop": "A-Grade Sovereign Seal Matrix & Abyssal Pearl Core",
            },
            {
                "name": "Sunken Potter Leviathan-Brood Matriarch",
                "level": 25,
                "dungeon_id": "zone-dungeon-sunken-potter-hold",
                "floor_id": "B3",
                "loc": "-77900:148700",
                "signature_drop": "Pelagic Brine-Tempered Alloy Core",
            },
        ],
        "raid_bosses": [
            {
                "name": "[Raid Boss] Kelp Spiral Undertide Kraken",
                "level": 46,
                "zone_id": "zone-field-kelp-spiral-reef",
                "loc": "-51950:-138950",
                "respawn": "3600s",
            },
            {
                "name": "[Raid Boss] Cobalt Sandbar Maelstrom Turtle",
                "level": 16,
                "zone_id": "zone-field-cobalt-sandbar-ford",
                "loc": "-73750:142450",
                "respawn": "3600s",
            },
        ],
        "mini_bosses": [
            {
                "name": "[Mini-Boss] Verdigris Siphon Lock-Warden",
                "level": 27,
                "zone_id": "zone-field-siphon-sluice",
                "loc": "64420:34630",
            },
            {
                "name": "[Mini-Boss] Whispering Mire Brine-Stalker",
                "level": 13,
                "zone_id": "zone-field-whispering-mire",
                "loc": "-68180:228230",
            },
        ],
        "minion_families": [
            {
                "family_name": "Pelagic Coral & Undertide Sahaguin",
                "representative_mob": "Bioluminescent Reef Stalker & Brine-Shell Crab",
                "zone_ids": [
                    "zone-field-cobalt-sandbar-ford",
                    "zone-field-kelp-spiral-reef",
                    "zone-dungeon-sunken-potter-hold",
                ],
            },
            {
                "family_name": "Deep Devotion Abyssal Tide-Priests",
                "representative_mob": "Trench-Swallower Pelagic Cultist",
                "zone_ids": [
                    "zone-field-siphon-sluice",
                    "zone-catacomb-dark-omens-coral",
                ],
            },
        ],
    },
    {
        "god_id": "god-legendary-dragon",
        "god_name": "Bahamut-Triad, The Legendary Dragon of Earth, Fire & Thunder (Sealed Tri-Scale Wyrm)",
        "god_short_label": "Legendary Dragon",
        "chapter_epoch": "1.4 God Seal Magic — Sealed under Apostate Dynamo Necropolis III",
        "seal_catacomb_zone_id": "zone-catacomb-apostate-dynamo",
        "seal_loc": "149800:-51200",
        "mvp_apostles": [
            {
                "name": "Tri-Scale Wyrm-Marshal Volcanor (Earth/Fire/Thunder Apostle)",
                "level": 45,
                "dungeon_id": "zone-catacomb-apostate-dynamo",
                "floor_id": "B3",
                "loc": "150300:-51700",
                "signature_drop": "Tri-Scale Dragon Anvil Heart & Blessed Oriharukon Core",
            },
            {
                "name": "Alpha Electro-Stalker Raijin-Vex (Ember Bellows Sanctum)",
                "level": 24,
                "dungeon_id": "zone-dungeon-ember-bellows-chamber",
                "floor_id": "B3",
                "loc": "-40800:-110200",
                "signature_drop": "Galvanic Dragon-Scale Flux Catalyst",
            },
        ],
        "raid_bosses": [
            {
                "name": "[Raid Boss] Leyden Causeway Thunder-Drake",
                "level": 40,
                "zone_id": "zone-field-leyden-causeway",
                "loc": "141650:-48950",
                "respawn": "3600s",
            },
            {
                "name": "[Raid Boss] Vitrified Slag Chasm Magma-Wyrm",
                "level": 20,
                "zone_id": "zone-field-slag-chasm",
                "loc": "25250:135850",
                "respawn": "3600s",
            },
        ],
        "mini_bosses": [
            {
                "name": "[Mini-Boss] Firebrick Duct Crucible Drake-Hound",
                "level": 10,
                "zone_id": "zone-field-firebrick-duct",
                "loc": "-38980:-105570",
            },
            {
                "name": "[Mini-Boss] Spiral Wormway Tectonic Basilisk",
                "level": 38,
                "zone_id": "zone-field-spiral-wormway-ramp",
                "loc": "134420:-24770",
            },
        ],
        "minion_families": [
            {
                "family_name": "Tri-Scale Drake-Kin & Bellows Wyverns",
                "representative_mob": "Firebrick Ash-Drake & Galvanic Scale-Hound",
                "zone_ids": [
                    "zone-field-firebrick-duct",
                    "zone-field-slag-chasm",
                    "zone-dungeon-ember-bellows-chamber",
                ],
            },
            {
                "family_name": "Apostate Dynamo Thunder-Scale Cohort",
                "representative_mob": "Leyden Capacitor Wyrmling",
                "zone_ids": [
                    "zone-field-leyden-causeway",
                    "zone-field-spiral-wormway-ramp",
                    "zone-catacomb-apostate-dynamo",
                ],
            },
        ],
    },
)


def _build_boss_hierarchy_chains() -> list[dict[str, Any]]:
    return [
        {
            "god_id": spec["god_id"],
            "god_name": spec["god_name"],
            "god_short_label": spec["god_short_label"],
            "chapter_epoch": spec["chapter_epoch"],
            "seal_catacomb_zone_id": spec["seal_catacomb_zone_id"],
            "seal_loc": spec["seal_loc"],
            "mvp_apostles": [dict(a) for a in spec["mvp_apostles"]],
            "raid_bosses": [dict(r) for r in spec["raid_bosses"]],
            "mini_bosses": [dict(m) for m in spec["mini_bosses"]],
            "minion_families": [
                {
                    "family_name": f["family_name"],
                    "representative_mob": f["representative_mob"],
                    "zone_ids": list(f["zone_ids"]),
                }
                for f in spec["minion_families"]
            ],
        }
        for spec in BOSS_HIERARCHY_CHAIN_SPECS
    ]


def _synthesize_shop_and_refinement_catalog(zone_entry: dict[str, Any], idx: int) -> dict[str, Any]:
    tname = str(zone_entry.get("name", f"Town {idx}")).split("(")[0].strip()
    lmin, lmax = (zone_entry.get("level_band") or [1, 15])[:2]
    grade = "No-Grade / D-Grade" if lmax <= 20 else ("C-Grade / B-Grade" if lmax <= 40 else "A-Grade / S-Grade")
    base_item_id = 40000 + idx * 100
    price_mult = max(1, lmin)

    return {
        "equip_shop_stock": [
            {
                "item_id": base_item_id + 1,
                "name": f"{tname} Tempered Broadsword",
                "category": "Weapon",
                "grade": grade,
                "stats": f"P.Atk +{42 + lmin * 3} · M.Atk +{28 + lmin * 2} · Crit +88",
                "price_adena": 12500 * price_mult,
                "max_refinement": "+15",
            },
            {
                "item_id": base_item_id + 2,
                "name": f"{tname} Resonance Whisper Staff",
                "category": "Weapon",
                "grade": grade,
                "stats": f"M.Atk +{56 + lmin * 3} · Cast Spd +12% · MP Regen +8%",
                "price_adena": 13800 * price_mult,
                "max_refinement": "+15",
            },
            {
                "item_id": base_item_id + 3,
                "name": f"{tname} Brigandine & Scale Cuirass",
                "category": "Armor",
                "grade": grade,
                "stats": f"P.Def +{68 + lmin * 4} · Max HP +{180 + lmin * 10} · Seal Resist +6%",
                "price_adena": 9400 * price_mult,
                "max_refinement": "+15",
            },
            {
                "item_id": base_item_id + 4,
                "name": f"{tname} Aegis Tower Shield",
                "category": "Shield",
                "grade": grade,
                "stats": f"Shield Def +{52 + lmin * 3} · Block Rate +24%",
                "price_adena": 6200 * price_mult,
                "max_refinement": "+15",
            },
        ],
        "consumable_shop_stock": [
            {
                "item_id": base_item_id + 11,
                "name": "Greater Hearth Healing Potion",
                "category": "Potion",
                "effect": "Restores 450–850 HP over 15s (Weight 4)",
                "price_adena": 180 * max(1, price_mult // 4),
            },
            {
                "item_id": base_item_id + 12,
                "name": f"Alacrity & Haste Draught ({grade.split('/')[0].strip()})",
                "category": "Potion",
                "effect": "Atk.Spd +15% and Move Speed +20 for 20 minutes",
                "price_adena": 650 * max(1, price_mult // 4),
            },
            {
                "item_id": base_item_id + 13,
                "name": f"Compressed Soulshot & Blessed Spiritshot Pack ({grade})",
                "category": "Soulshot",
                "effect": "Doubles physical P.Atk / M.Atk strike potency for 500 charges",
                "price_adena": 1200 * max(1, price_mult // 4),
            },
            {
                "item_id": base_item_id + 14,
                "name": f"Scroll of Escape: {tname}",
                "category": "Scroll",
                "effect": f"Instant channel warp back to {tname} Spawn Shrine",
                "price_adena": 400 * max(1, price_mult // 4),
            },
        ],
        "refinement_anvil_rates": [
            {
                "enchant_range": "+1 to +3 (Safe Anvil Tempering)",
                "success_rate_pct": 100.0,
                "stat_bonus": "+3% P.Atk/M.Atk/P.Def per +1 step (Zero Break Risk)",
                "failure_penalty": "None (100% Safe Tempering Guarantee)",
                "required_catalyst": f"Scroll: Enchant Weapon/Armor ({grade}) + 2× High-Grade Iron Ore",
                "material_spoils": ["High-Grade Iron Ore", "Varnish", "Refinement Flux Dust"],
            },
            {
                "enchant_range": "+4 to +6 (Artisan Over-Enchant)",
                "success_rate_pct": 66.0,
                "stat_bonus": "+7% P.Atk/M.Atk per step + Subtle Amber Weapon Glow",
                "failure_penalty": "Resets to +3 when using Blessed Scroll (or Crystallizes on standard scroll)",
                "required_catalyst": f"Blessed Scroll: Enchant ({grade}) + 4× Tempered Alloy Plate",
                "material_spoils": ["Tempered Alloy Plate", "Seal-Stone Cluster", "Weapon Enchant Scroll Fragment"],
            },
            {
                "enchant_range": "+7 to +9 (Master Blacksmith Resonance)",
                "success_rate_pct": 45.0,
                "stat_bonus": "+12% P.Atk/M.Atk per step + Radiant Cobalt/Crimson Aura",
                "failure_penalty": "Retains current +level if fortified with Seal-Stone Stabilizer",
                "required_catalyst": f"Master Anvil Scroll ({grade}) + 2× Warden Alloy Core",
                "material_spoils": ["Warden Alloy Core", "Soul Crystal Stage 5", "Orichalcum Ore"],
            },
            {
                "enchant_range": "+10 to +12 (Grand Master Sovereign Forge)",
                "success_rate_pct": 28.0,
                "stat_bonus": "+18% P.Atk/M.Atk per step + Piercing Boss Ward +8%",
                "failure_penalty": "Drops -1 level on failure (Protected from destruction by Anvil Core)",
                "required_catalyst": "Ancient Refinement Catalyst + 2× Fortress Forge Core",
                "material_spoils": ["Ancient Refinement Catalyst", "Fortress Forge Core", "Blessed Weapon Enchant"],
            },
            {
                "enchant_range": "+13 to +15 (Apex Architect God-Anvil Limit)",
                "success_rate_pct": 15.0,
                "stat_bonus": "+25% All Offensive/Defensive Stats + Sovereign Halo Lightning Trail",
                "failure_penalty": "Retains +12 floor when bound with Divine Apostle Anvil Core",
                "required_catalyst": "Divine Apostle Anvil Core + Architect Seal Crest",
                "material_spoils": ["Divine Apostle Anvil Core", "Architect Seal Crest", "Sovereign Bastion Heart"],
            },
        ],
        "blacksmith_material_spoils": [
            {
                "material_name": "High-Grade Iron Ore & Varnish",
                "source_zone": f"{tname} Adjacent Hunting Fields (Monster Pack Rings)",
                "drop_or_spoil_rate": "42.0% Dwarf Spoil / 18.5% Pack Drop",
                "used_for_tiers": "+1 to +6 Safe & Artisan Refinement",
            },
            {
                "material_name": "Tempered Alloy Plate & Warden Alloy Core",
                "source_zone": "Field Mini-Boss Patrols & B1–B2 Dungeon Overseers",
                "drop_or_spoil_rate": "24.0% Mini-Boss Spoil / 12.0% Raid Drop",
                "used_for_tiers": "+7 to +12 Master & Grand Master Refinement",
            },
            {
                "material_name": "Divine Apostle Anvil Core & Architect Seal Crest",
                "source_zone": "B3 / 3F Dungeon MVP Sanctums & Field MVP Bosses",
                "drop_or_spoil_rate": "8.5% MVP Sanctum Drop / 15.0% Raid Spoil",
                "used_for_tiers": "+13 to +15 Apex God-Anvil Refinement",
            },
        ],
    }


def _build_quest_trial_chains() -> list[dict[str, Any]]:
    """Build 18 canonical quests across 3 tracks (main_story, class_transfer, racial_heritage) and all 6 Playable Races (D23)."""
    return [
        # --- Track 1: Main Story Quests (6) ---
        {
            "quest_id": "quest-ms-01-human",
            "quest_name": "Ch.I: First Meridian Ember Accord",
            "quest_track": "main_story",
            "race_id": "Human",
            "min_level": 5,
            "class_tier": "None",
            "giver_npc_name": "[Guide] Steward of First Meridian Obelisk",
            "giver_zone_id": "zone-town-lantern-hollow",
            "giver_loc": "-84120:243500",
            "objective_target": "Defeat Kiln Cellar Ash-Weaver Scout & Recover Sola's Seal Shard",
            "objective_zone_id": "zone-dungeon-kiln-cellar",
            "objective_dungeon_id": "zone-dungeon-kiln-cellar",
            "objective_floor_id": "B1",
            "objective_loc": "75410:116820",
            "turn_in_npc_name": "[High Priest] Lyra (town-kilnwatch-bastion)",
            "turn_in_zone_id": "zone-town-kilnwatch-bastion",
            "turn_in_loc": "-14200:123500",
            "reward_summary": "12,500 Adena · No-Grade Soulshot Pack (500) · Kilnwatch Accord Seal Token",
        },
        {
            "quest_id": "quest-ms-02-lunar",
            "quest_name": "Ch.I: Celadon Loom Resonance",
            "quest_track": "main_story",
            "race_id": "Lunar",
            "min_level": 8,
            "class_tier": "None",
            "giver_npc_name": "[High Priest] Lyra (town-porcelain-loom-sanctuary)",
            "giver_zone_id": "zone-town-porcelain-loom",
            "giver_loc": "45800:41200",
            "objective_target": "Purify Medallion Heart Vault Astral Conduit in B2",
            "objective_zone_id": "zone-dungeon-medallion-heart-vault",
            "objective_dungeon_id": "zone-dungeon-medallion-heart-vault",
            "objective_floor_id": "B2",
            "objective_loc": "49800:44100",
            "turn_in_npc_name": "[High Priest] Lyra (town-kilnwatch-bastion)",
            "turn_in_zone_id": "zone-town-kilnwatch-bastion",
            "turn_in_loc": "-14200:123500",
            "reward_summary": "15,000 Adena · Blessed Spiritshot (No-Grade) ×300 · Astral Loom Ring",
        },
        {
            "quest_id": "quest-ms-03-ogre-orc",
            "quest_name": "Ch.II: Flame of the Bellows Covenant",
            "quest_track": "main_story",
            "race_id": "Ogre/Orc",
            "min_level": 12,
            "class_tier": "None",
            "giver_npc_name": "[Grand Master] Kael (town-draft-kiln-post)",
            "giver_zone_id": "zone-town-draft-kiln-post",
            "giver_loc": "-44800:-113200",
            "objective_target": "Slay Ember Bellows Trial Overlord in B2 Sanctum",
            "objective_zone_id": "zone-dungeon-ember-bellows-chamber",
            "objective_dungeon_id": "zone-dungeon-ember-bellows-chamber",
            "objective_floor_id": "B2",
            "objective_loc": "-41200:-109800",
            "turn_in_npc_name": "[Adventure Guildsman] Rowan (town-kilnwatch-bastion)",
            "turn_in_zone_id": "zone-town-kilnwatch-bastion",
            "turn_in_loc": "-14200:123500",
            "reward_summary": "18,000 Adena · Pa'agrio Bellows Totem · D-Grade Weapon Enchant Fragment",
        },
        {
            "quest_id": "quest-ms-04-dwarf",
            "quest_name": "Ch.II: Pendulum Shaft Gear Survey",
            "quest_track": "main_story",
            "race_id": "Dwarf",
            "min_level": 22,
            "class_tier": "None",
            "giver_npc_name": "[Warehouse Keeper] Brom (town-root-train-roundhouse)",
            "giver_zone_id": "zone-town-root-train-roundhouse",
            "giver_loc": "115100:-178200",
            "objective_target": "Extract Krono's Escapement Core in Pendulum Shaft 2F",
            "objective_zone_id": "zone-dungeon-pendulum-shaft",
            "objective_dungeon_id": "zone-dungeon-pendulum-shaft",
            "objective_floor_id": "2F",
            "objective_loc": "85400:144200",
            "turn_in_npc_name": "[Blacksmith] Torin (town-pinion-terminus)",
            "turn_in_zone_id": "zone-town-pinion-terminus",
            "turn_in_loc": "82400:148600",
            "reward_summary": "35,000 Adena · D-Grade Recipe: Compound Braid · +3 Safe Anvil Voucher",
        },
        {
            "quest_id": "quest-ms-05-dark-lunar",
            "quest_name": "Ch.III: Catacomb of the Astral Witch",
            "quest_track": "main_story",
            "race_id": "Dark-Lunar",
            "min_level": 42,
            "class_tier": "None",
            "giver_npc_name": "[High Priest] Lyra (town-carillon-hearth-belfry)",
            "giver_zone_id": "zone-town-carillon-belfry",
            "giver_loc": "12400:16800",
            "objective_target": "Vanquish Vesper's Seal Apostle in Witch Pendulum Catacomb B3",
            "objective_zone_id": "zone-catacomb-witch-pendulum",
            "objective_dungeon_id": "zone-catacomb-witch-pendulum",
            "objective_floor_id": "B3",
            "objective_loc": "54200:-34800",
            "turn_in_npc_name": "[High Priest] Lyra (town-starfall-haven)",
            "turn_in_zone_id": "zone-town-starfall-haven",
            "turn_in_loc": "43800:-47900",
            "reward_summary": "120,000 Adena · Ancient Seal Stone ×2,000 · C-Grade Enchant Armor Scroll",
        },
        {
            "quest_id": "quest-ms-06-furral",
            "quest_name": "Ch.IV: Star-Heart Spire Ascension",
            "quest_track": "main_story",
            "race_id": "Furral",
            "min_level": 60,
            "class_tier": "None",
            "giver_npc_name": "[Grand Master] Kael (town-cinnamon-mill-haven)",
            "giver_zone_id": "zone-town-cinnamon-mill",
            "giver_loc": "-118200:46800",
            "objective_target": "Conquer Aurelia's Sanctum Sentinel on Star-Heart Spire 3F",
            "objective_zone_id": "zone-dungeon-star-heart-nave",
            "objective_dungeon_id": "zone-dungeon-star-heart-nave",
            "objective_floor_id": "3F",
            "objective_loc": "149200:28400",
            "turn_in_npc_name": "[Grand Master] Kael (town-crown-beacon)",
            "turn_in_zone_id": "zone-town-crown-beacon",
            "turn_in_loc": "147900:26800",
            "reward_summary": "450,000 Adena · A-Grade Soul Crystal Stage 10 · High-Halo Sovereign Crest",
        },
        # --- Track 2: 1st/2nd/3rd Class Transfer Trials Lv.20/40/76 (6) ---
        {
            "quest_id": "quest-ct-01-human-lv20",
            "quest_name": "Path of the Hearth-Knight (1st Class Transfer Lv.20)",
            "quest_track": "class_transfer",
            "race_id": "Human",
            "min_level": 20,
            "class_tier": "1st_Class_Lv20",
            "giver_npc_name": "[Grand Master] Kael (town-lantern-hollow)",
            "giver_zone_id": "zone-town-lantern-hollow",
            "giver_loc": "-84120:243500",
            "objective_target": "Collect 10 Mandible Trophies inside Kiln Cellar B2",
            "objective_zone_id": "zone-dungeon-kiln-cellar",
            "objective_dungeon_id": "zone-dungeon-kiln-cellar",
            "objective_floor_id": "B2",
            "objective_loc": "75410:116820",
            "turn_in_npc_name": "[Grand Master] Kael (town-kilnwatch-bastion)",
            "turn_in_zone_id": "zone-town-kilnwatch-bastion",
            "turn_in_loc": "-14200:123500",
            "reward_summary": "1st Class Promotion Badge · D-Grade Shadow Weapon Coupon · 15 Dimensional Diamonds",
        },
        {
            "quest_id": "quest-ct-02-lunar-lv20",
            "quest_name": "Path of the Porcelain Oracle (1st Class Transfer Lv.20)",
            "quest_track": "class_transfer",
            "race_id": "Lunar",
            "min_level": 20,
            "class_tier": "1st_Class_Lv20",
            "giver_npc_name": "[High Priest] Lyra (town-porcelain-loom-sanctuary)",
            "giver_zone_id": "zone-town-porcelain-loom",
            "giver_loc": "45800:41200",
            "objective_target": "Subdue Sunken Potter Hold Tide-Caller in B2",
            "objective_zone_id": "zone-dungeon-sunken-potter-hold",
            "objective_dungeon_id": "zone-dungeon-sunken-potter-hold",
            "objective_floor_id": "B2",
            "objective_loc": "-78400:149200",
            "turn_in_npc_name": "[High Priest] Lyra (town-glaze-barge-quay)",
            "turn_in_zone_id": "zone-town-glaze-barge-quay",
            "turn_in_loc": "-81200:151400",
            "reward_summary": "1st Class Oracle Seal · D-Grade Mystic Tunic Set · 15 Dimensional Diamonds",
        },
        {
            "quest_id": "quest-ct-03-ogre-lv40",
            "quest_name": "Trial of the Bellows Tyrant (2nd Class Transfer Lv.40)",
            "quest_track": "class_transfer",
            "race_id": "Ogre/Orc",
            "min_level": 40,
            "class_tier": "2nd_Class_Lv40",
            "giver_npc_name": "[Grand Master] Kael (town-escapement-anvil)",
            "giver_zone_id": "zone-town-escapement-anvil",
            "giver_loc": "83100:53200",
            "objective_target": "Crush Chronometer Foundry Automaton Warden on 3F",
            "objective_zone_id": "zone-dungeon-chronometer-foundry",
            "objective_dungeon_id": "zone-dungeon-chronometer-foundry",
            "objective_floor_id": "3F",
            "objective_loc": "84800:56400",
            "turn_in_npc_name": "[Grand Master] Kael (town-inductor-switchyard)",
            "turn_in_zone_id": "zone-town-inductor-switchyard",
            "turn_in_loc": "147400:-55200",
            "reward_summary": "Mark of the Challenger · Mark of Glory · C-Grade Weapon Exchange Coupon",
        },
        {
            "quest_id": "quest-ct-04-dwarf-lv40",
            "quest_name": "Testimony of the Master Warsmith (2nd Class Transfer Lv.40)",
            "quest_track": "class_transfer",
            "race_id": "Dwarf",
            "min_level": 40,
            "class_tier": "2nd_Class_Lv40",
            "giver_npc_name": "[Blacksmith] Torin (town-escapement-anvil)",
            "giver_zone_id": "zone-town-escapement-anvil",
            "giver_loc": "83100:53200",
            "objective_target": "Spoil 5 Dynamo Seal Ingots in Catacomb of the Branded Bellows B3",
            "objective_zone_id": "zone-catacomb-branded-bellows",
            "objective_dungeon_id": "zone-catacomb-branded-bellows",
            "objective_floor_id": "B3",
            "objective_loc": "112400:18200",
            "turn_in_npc_name": "[Blacksmith] Torin (town-inductor-switchyard)",
            "turn_in_zone_id": "zone-town-inductor-switchyard",
            "turn_in_loc": "147400:-55200",
            "reward_summary": "Mark of the Guildsman · Mark of Prosperity · Siege Golem Summon Blueprint",
        },
        {
            "quest_id": "quest-ct-05-dark-lunar-lv76",
            "quest_name": "Saga of the Spectral Dancer (3rd Class Awakening Lv.76)",
            "quest_track": "class_transfer",
            "race_id": "Dark-Lunar",
            "min_level": 76,
            "class_tier": "3rd_Awakening_Lv76",
            "giver_npc_name": "[Grand Master] Kael (town-starfall-haven)",
            "giver_zone_id": "zone-town-starfall-haven",
            "giver_loc": "43800:-47900",
            "objective_target": "Resonate 6 Tablets of Vision & Slay Archon of Star-Heart Spire 3F",
            "objective_zone_id": "zone-dungeon-star-heart-nave",
            "objective_dungeon_id": "zone-dungeon-star-heart-nave",
            "objective_floor_id": "3F",
            "objective_loc": "149200:28400",
            "turn_in_npc_name": "[Grand Master] Kael (town-crown-beacon)",
            "turn_in_zone_id": "zone-town-crown-beacon",
            "turn_in_loc": "147900:26800",
            "reward_summary": "Secret Book of Giants · 5,000,000 Adena · S-Grade Dual-Sword Mastery Tome",
        },
        {
            "quest_id": "quest-ct-06-furral-lv76",
            "quest_name": "Saga of the Storm-Tail Doombringer (3rd Class Awakening Lv.76)",
            "quest_track": "class_transfer",
            "race_id": "Furral",
            "min_level": 76,
            "class_tier": "3rd_Awakening_Lv76",
            "giver_npc_name": "[High Priest] Lyra (town-starfall-haven)",
            "giver_zone_id": "zone-town-starfall-haven",
            "giver_loc": "43800:-47900",
            "objective_target": "Defeat Forbidden Architect Apostle in Forbidden Path Orrery Catacomb B3",
            "objective_zone_id": "zone-catacomb-forbidden-path-orrery",
            "objective_dungeon_id": "zone-catacomb-forbidden-path-orrery",
            "objective_floor_id": "B3",
            "objective_loc": "18400:-64200",
            "turn_in_npc_name": "[High Priest] Lyra (town-crown-beacon)",
            "turn_in_zone_id": "zone-town-crown-beacon",
            "turn_in_loc": "147900:26800",
            "reward_summary": "Secret Book of Giants · 5,000,000 Adena · S-Grade Electro-Glaive Catalyst",
        },
        # --- Track 3: Racial Heritage Side Quests (6) ---
        {
            "quest_id": "quest-rh-01-human",
            "quest_name": "Heritage of the Terracotta Hearth",
            "quest_track": "racial_heritage",
            "race_id": "Human",
            "min_level": 10,
            "class_tier": "None",
            "giver_npc_name": "[Blacksmith] Altran (town-lantern-hollow)",
            "giver_zone_id": "zone-town-lantern-hollow",
            "giver_loc": "-84120:243500",
            "objective_target": "Gather 20 Glazed Clay Cores across Clover South-Gate Meadow",
            "objective_zone_id": "zone-field-clover-south-gate",
            "objective_dungeon_id": "",
            "objective_floor_id": "",
            "objective_loc": "72986:113330",
            "turn_in_npc_name": "[Blacksmith] Altran (town-lantern-hollow)",
            "turn_in_zone_id": "zone-town-lantern-hollow",
            "turn_in_loc": "-84120:243500",
            "reward_summary": "Lantern Hollow Heritage Cloak · +3 Safe Weapon Enchant Scroll (No-Grade)",
        },
        {
            "quest_id": "quest-rh-02-lunar",
            "quest_name": "Hymn of the Celadon Water-Shrine",
            "quest_track": "racial_heritage",
            "race_id": "Lunar",
            "min_level": 12,
            "class_tier": "None",
            "giver_npc_name": "[High Priest] Lyra (town-porcelain-loom-sanctuary)",
            "giver_zone_id": "zone-town-porcelain-loom",
            "giver_loc": "45800:41200",
            "objective_target": "Harvest 12 Dew-Glaze Lotuses along Celadon Glaze Causeway",
            "objective_zone_id": "zone-field-celadon-causeway",
            "objective_dungeon_id": "",
            "objective_floor_id": "",
            "objective_loc": "48200:49600",
            "turn_in_npc_name": "[High Priest] Lyra (town-porcelain-loom-sanctuary)",
            "turn_in_zone_id": "zone-town-porcelain-loom",
            "turn_in_loc": "45800:41200",
            "reward_summary": "Porcelain Moon Circlet · Spiritshot Pack (1,000) · 9,500 Adena",
        },
        {
            "quest_id": "quest-rh-03-ogre-orc",
            "quest_name": "Oath of the Firebrick Ancestors",
            "quest_track": "racial_heritage",
            "race_id": "Ogre/Orc",
            "min_level": 14,
            "class_tier": "None",
            "giver_npc_name": "[Grand Master] Kael (town-draft-kiln-post)",
            "giver_zone_id": "zone-town-draft-kiln-post",
            "giver_loc": "-44800:-113200",
            "objective_target": "Hunt Ash-Tusk Boars across Firebrick Bellows Duct",
            "objective_zone_id": "zone-field-firebrick-duct",
            "objective_dungeon_id": "",
            "objective_floor_id": "",
            "objective_loc": "-39200:-105400",
            "turn_in_npc_name": "[Grand Master] Kael (town-draft-kiln-post)",
            "turn_in_zone_id": "zone-town-draft-kiln-post",
            "turn_in_loc": "-44800:-113200",
            "reward_summary": "Draft-Kiln War Gauntlets · Greater Haste Potion ×10 · 11,000 Adena",
        },
        {
            "quest_id": "quest-rh-04-dwarf",
            "quest_name": "Ledger of the Sap-Heart Guild",
            "quest_track": "racial_heritage",
            "race_id": "Dwarf",
            "min_level": 15,
            "class_tier": "None",
            "giver_npc_name": "[Warehouse Keeper] Brom (town-root-train-roundhouse)",
            "giver_zone_id": "zone-town-root-train-roundhouse",
            "giver_loc": "115100:-178200",
            "objective_target": "Recover 8 Amber Resin Ledger Plates in Sap-Heart Cistern B1",
            "objective_zone_id": "zone-dungeon-sap-heart-cistern",
            "objective_dungeon_id": "zone-dungeon-sap-heart-cistern",
            "objective_floor_id": "B1",
            "objective_loc": "119400:-174200",
            "turn_in_npc_name": "[Warehouse Keeper] Brom (town-root-train-roundhouse)",
            "turn_in_zone_id": "zone-town-root-train-roundhouse",
            "turn_in_loc": "115100:-178200",
            "reward_summary": "Tontatta Master Spoil Gloves (+8% Spoil Rate) · 14,000 Adena",
        },
        {
            "quest_id": "quest-rh-05-dark-lunar",
            "quest_name": "Echoes of the Carillon Belfry",
            "quest_track": "racial_heritage",
            "race_id": "Dark-Lunar",
            "min_level": 15,
            "class_tier": "None",
            "giver_npc_name": "[High Priest] Lyra (town-carillon-hearth-belfry)",
            "giver_zone_id": "zone-town-carillon-belfry",
            "giver_loc": "12400:16800",
            "objective_target": "Retrieve 6 Acoustic Bronze Bells from Ceramic Resonator Crypt B1",
            "objective_zone_id": "zone-dungeon-ceramic-resonator-crypt",
            "objective_dungeon_id": "zone-dungeon-ceramic-resonator-crypt",
            "objective_floor_id": "B1",
            "objective_loc": "15200:19400",
            "turn_in_npc_name": "[High Priest] Lyra (town-carillon-hearth-belfry)",
            "turn_in_zone_id": "zone-town-carillon-belfry",
            "turn_in_loc": "12400:16800",
            "reward_summary": "Umbral Chime Earring · Lesser Mana Potion ×20 · 13,500 Adena",
        },
        {
            "quest_id": "quest-rh-06-furral",
            "quest_name": "Spice-Kiln Wind-Runner Rite",
            "quest_track": "racial_heritage",
            "race_id": "Furral",
            "min_level": 14,
            "class_tier": "None",
            "giver_npc_name": "[Trader] Valen (town-cinnamon-mill-haven)",
            "giver_zone_id": "zone-town-cinnamon-mill",
            "giver_loc": "-118200:46800",
            "objective_target": "Clear Static Spark-Hounds in Spice-Kiln Cellar B1",
            "objective_zone_id": "zone-dungeon-spice-kiln-cellar",
            "objective_dungeon_id": "zone-dungeon-spice-kiln-cellar",
            "objective_floor_id": "B1",
            "objective_loc": "-115400:49100",
            "turn_in_npc_name": "[Trader] Valen (town-cinnamon-mill-haven)",
            "turn_in_zone_id": "zone-town-cinnamon-mill",
            "turn_in_loc": "-118200:46800",
            "reward_summary": "Wind-Tail Furral Boots (+7 Move Speed) · 12,000 Adena",
        },
    ]


def _build_farming_efficiency_profiles(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 40 combat zone farming efficiency profiles (24 Field Hunting Areas + 16 Multi-Floor Dungeons) (D24)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    fields_list = zdir.get("fields_and_hunting_areas") or []
    dungeons_list = (zdir.get("regular_dungeons") or []) + (zdir.get("seven_signs_seal_catacombs") or [])

    spoil_by_grade = {
        "No-Grade": "Terracotta Coal, Animal Bone & Stem (38% Spoil)",
        "D-Grade": "Mithril Ore, Compound Braid & Varnish of Purity (29% Spoil)",
        "C-Grade": "Oriharukon Ore, Crafted Leather & Karmian Fabric (24% Spoil)",
        "B-Grade": "Enria, Mold Hardener & Damascus Blade Core (19% Spoil)",
        "A-Grade": "Asofe, Thons & Tallum Alloy Plate (15% Spoil)",
        "S-Grade": "Imperial Star-Steel Ingot & Divine Apostle Catalyst (11% Spoil)",
    }
    weakness_cycle = [
        "Water / Blunt Weak (-25% Resist)",
        "Fire / Slash Weak (-25% Resist)",
        "Wind / Pierce Weak (-25% Resist)",
        "Earth / Crush Weak (-25% Resist)",
        "Holy / Radiant Weak (-30% Undead/Seal Resist)",
        "Dark / Arcane Weak (-20% Construct Resist)",
    ]

    profiles: list[dict[str, Any]] = []
    for idx, f_entry in enumerate(fields_list):
        if not isinstance(f_entry, dict):
            continue
        zid = str(f_entry.get("zone_id", ""))
        zname = str(f_entry.get("name", zid))
        lband = f_entry.get("level_band") or [1, 15]
        lmin = int(lband[0]) if len(lband) > 0 else 1
        lmax = int(lband[1]) if len(lband) > 1 else lmin + 10

        if lmax <= 15:
            grade = "No-Grade"
            mode = "solo_grinding" if idx % 2 == 0 else "duo_spoil_scavenger"
            density = "Medium (4–6 Non-Social Mobs / 25s Respawn)"
        elif lmax <= 28:
            grade = "D-Grade"
            mode = "duo_spoil_scavenger" if idx % 2 == 0 else "solo_grinding"
            density = "High (6–8 Assisted Packs / 30s Respawn)"
        elif lmax <= 38:
            grade = "C-Grade"
            mode = "duo_spoil_scavenger" if idx % 3 != 0 else "full_9p_aoe_party"
            density = "High (8–10 Polearm AoE Packs / 35s Respawn)"
        elif lmax <= 44:
            grade = "B-Grade"
            mode = "full_9p_aoe_party"
            density = "Very High (10–14 Social Guard Packs / 40s Respawn)"
        elif lmax <= 60:
            grade = "A-Grade"
            mode = "full_9p_aoe_party" if idx % 2 == 0 else "clan_raid_force"
            density = "Extreme (12–16 High-Halo Elite Packs / 45s Respawn)"
        else:
            grade = "S-Grade"
            mode = "clan_raid_force"
            density = "Apex Raid Density (16+ Sovereign Guards & World MVP / 60s Respawn)"

        xp_idx = min(100, max(52, 48 + int(lmax * 0.52) + (idx % 5)))
        adena_idx = min(100, max(50, 45 + int(lmax * 0.54) + ((idx * 3) % 6)))

        profiles.append(
            {
                "zone_id": zid,
                "zone_name": zname,
                "zone_kind": "field",
                "recommended_party_mode": mode,
                "xp_per_hour_index": xp_idx,
                "adena_per_hour_index": adena_idx,
                "spoil_grade": grade,
                "key_spoil_material": spoil_by_grade[grade],
                "mob_pack_density": density,
                "elemental_weakness": weakness_cycle[idx % len(weakness_cycle)],
            }
        )

    for idx, d_entry in enumerate(dungeons_list):
        if not isinstance(d_entry, dict):
            continue
        zid = str(d_entry.get("zone_id", ""))
        zname = str(d_entry.get("name", zid))
        lband = d_entry.get("level_band") or [15, 30]
        lmin = int(lband[0]) if len(lband) > 0 else 15
        lmax = int(lband[1]) if len(lband) > 1 else lmin + 12

        if lmax <= 20:
            grade = "No-Grade"
            mode = "duo_spoil_scavenger"
            density = "High Dungeon Rooms (8–10 Social Mobs per Chamber / 35s Respawn)"
        elif lmax <= 28:
            grade = "D-Grade"
            mode = "full_9p_aoe_party" if idx % 2 == 0 else "duo_spoil_scavenger"
            density = "Very High Labyrinth (10–14 Multi-Floor Room Packs / 40s Respawn)"
        elif lmax <= 40:
            grade = "C-Grade"
            mode = "full_9p_aoe_party"
            density = "Dense Catacomb Chambers (12–16 Seal-Stone Guardians / 42s Respawn)"
        elif lmax <= 55:
            grade = "B-Grade"
            mode = "full_9p_aoe_party" if idx % 2 == 0 else "clan_raid_force"
            density = "Extreme Necropolis Vaults (14–18 Aggro Apostle Packs / 45s Respawn)"
        elif lmax <= 70:
            grade = "A-Grade"
            mode = "clan_raid_force"
            density = "Sanctum Garrison (16–20 Raid-Linked Chambers / 50s Respawn)"
        else:
            grade = "S-Grade"
            mode = "clan_raid_force"
            density = "Apex God-Seal Sanctum (20+ Primordial Apostle Packs / 60s Respawn)"

        xp_idx = min(100, max(64, 58 + int(lmax * 0.44) + (idx % 4)))
        adena_idx = min(100, max(62, 55 + int(lmax * 0.46) + ((idx * 2) % 5)))

        profiles.append(
            {
                "zone_id": zid,
                "zone_name": zname,
                "zone_kind": "dungeon",
                "recommended_party_mode": mode,
                "xp_per_hour_index": xp_idx,
                "adena_per_hour_index": adena_idx,
                "spoil_grade": grade,
                "key_spoil_material": spoil_by_grade[grade],
                "mob_pack_density": density,
                "elemental_weakness": weakness_cycle[(idx + 2) % len(weakness_cycle)],
            }
        )

    return profiles


def _build_castle_siege_domains(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 8 canonical Castle Siege, Territory Tax & Clan Hall Domains matching the 8 harbors/clanhalls/forts (D25)."""
    return [
        {
            "domain_id": "domain-harbor-lantern-ferry",
            "stronghold_zone_id": "zone-harbor-lantern-ferry-pier",
            "stronghold_name": "Lantern Hollow South Ferry Harbor",
            "continent_id": "continent-01-hearthbloom-basin",
            "domain_tier": "Harbor_Stronghold",
            "vassal_town_ids": [
                "zone-town-lantern-hollow",
                "zone-town-cinnamon-mill",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-clover-south-gate",
                "zone-field-cinnamon-bark-viaduct",
                "zone-field-whispering-mire",
            ],
            "tax_rate_pct": 8,
            "siege_window_utc": "Saturday 16:00–18:00 UTC (Bi-Weekly Maritime Tariff Siege)",
            "artifact_altar_loc": "-96200:258400",
            "outer_gate_loc": "-95840:258140",
            "manor_specialty_crop": "Golden Clover Coda & Cinnamon-Bark Sap",
            "ruling_npc_faction": "Neutral Adventure Guild Maritime Customs Charter",
        },
        {
            "domain_id": "domain-harbor-glaze-barge-airship",
            "stronghold_zone_id": "zone-harbor-glaze-barge-airship-dock",
            "stronghold_name": "Glaze-Barge Maritime & Airship Harbor",
            "continent_id": "continent-01-hearthbloom-basin",
            "domain_tier": "Harbor_Stronghold",
            "vassal_town_ids": [
                "zone-town-glaze-barge-quay",
                "zone-town-porcelain-loom",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-cobalt-sandbar-ford",
                "zone-field-celadon-causeway",
                "zone-field-ginger-aqueduct-bridge",
            ],
            "tax_rate_pct": 9,
            "siege_window_utc": "Saturday 18:00–20:00 UTC (Bi-Weekly Airship Berth Siege)",
            "artifact_altar_loc": "-89400:155200",
            "outer_gate_loc": "-89040:154940",
            "manor_specialty_crop": "Celadon Dew-Lotus & Blue Cobalt Reed",
            "ruling_npc_faction": "Glaze-Barge Sky-Quay Admiralty",
        },
        {
            "domain_id": "domain-clanhall-kilnwatch-accord",
            "stronghold_zone_id": "zone-clanhall-kilnwatch-accord",
            "stronghold_name": "Kilnwatch Bastion Guild Clan Halls (6-Race Accord Quarters)",
            "continent_id": "continent-01-hearthbloom-basin",
            "domain_tier": "Regional_Castle",
            "vassal_town_ids": [
                "zone-town-kilnwatch-bastion",
                "zone-town-draft-kiln-post",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-kiln-east-orchard",
                "zone-field-firebrick-duct",
                "zone-field-slag-chasm",
            ],
            "tax_rate_pct": 10,
            "siege_window_utc": "Sunday 14:00–16:00 UTC (6-Race Convergence Castle Siege)",
            "artifact_altar_loc": "-13800:124100",
            "outer_gate_loc": "-13440:123840",
            "manor_specialty_crop": "Hearth-Glaze Apricot & Firebrick Slag-Coke",
            "ruling_npc_faction": "Kilnwatch Six-Race Accord Council",
        },
        {
            "domain_id": "domain-clanhall-inductor-conclave",
            "stronghold_zone_id": "zone-clanhall-inductor-conclave",
            "stronghold_name": "Inductor Switchyard Blacksmith & Guild Clan Halls",
            "continent_id": "continent-02-clockwork-steppe",
            "domain_tier": "Capital_Citadel",
            "vassal_town_ids": [
                "zone-town-inductor-switchyard",
                "zone-town-escapement-anvil",
                "zone-town-torque-balance-citadel",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-leyden-causeway",
                "zone-field-caldera-rim",
                "zone-field-metronome-bridge",
                "zone-field-spiral-wormway-ramp",
            ],
            "tax_rate_pct": 14,
            "siege_window_utc": "Sunday 18:00–20:00 UTC (Steppe Capital Citadel Siege)",
            "artifact_altar_loc": "148100:-54800",
            "outer_gate_loc": "148460:-55060",
            "manor_specialty_crop": "Leyden Copper-Spore & Tempered Mainspring Flax",
            "ruling_npc_faction": "Blacksmith Clan Grand Anvil Directorate",
        },
        {
            "domain_id": "domain-fortress-shanty-kiln",
            "stronghold_zone_id": "zone-fortress-shanty-kiln",
            "stronghold_name": "Cinder-Apron Borderland Fortress",
            "continent_id": "continent-01-hearthbloom-basin",
            "domain_tier": "Border_Fortress",
            "vassal_town_ids": [
                "zone-town-kilnwatch-bastion",
                "zone-town-carillon-belfry",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-cinder-apron",
                "zone-field-chime-pipe-colonnade",
            ],
            "tax_rate_pct": 11,
            "siege_window_utc": "Friday 20:00–21:00 UTC (72h Borderland Garrison Skirmish)",
            "artifact_altar_loc": "-5200:134200",
            "outer_gate_loc": "-4840:133940",
            "manor_specialty_crop": "Ash-Cinder Rye & Acoustic Chime-Gourd",
            "ruling_npc_faction": "Cinder-Apron Vanguard Wardens",
        },
        {
            "domain_id": "domain-fortress-floran-saffron",
            "stronghold_zone_id": "zone-fortress-floran-saffron",
            "stronghold_name": "Saffron Agricultural Fortress",
            "continent_id": "continent-01-hearthbloom-basin",
            "domain_tier": "Regional_Castle",
            "vassal_town_ids": [
                "zone-town-saffron-press",
                "zone-town-root-train-roundhouse",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-apricot-aqueduct-terrace",
                "zone-field-resin-arch-tunnel",
            ],
            "tax_rate_pct": 10,
            "siege_window_utc": "Saturday 14:00–16:00 UTC (Manor Harvest Tax Siege)",
            "artifact_altar_loc": "18100:168400",
            "outer_gate_loc": "18460:168140",
            "manor_specialty_crop": "Imperial Saffron Crocus & Amber Root-Resin",
            "ruling_npc_faction": "Saffron Manor Freeholders & Tontatta Factor Guild",
        },
        {
            "domain_id": "domain-fortress-dragonspine-cog",
            "stronghold_zone_id": "zone-fortress-dragonspine-cog",
            "stronghold_name": "Brass-Spur Dragonspine Fortress",
            "continent_id": "continent-02-clockwork-steppe",
            "domain_tier": "Border_Fortress",
            "vassal_town_ids": [
                "zone-town-pinion-terminus",
                "zone-town-escapement-anvil",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-brass-spur-ridge",
                "zone-field-astrolabe-rift",
                "zone-field-siphon-sluice",
            ],
            "tax_rate_pct": 12,
            "siege_window_utc": "Friday 21:00–22:00 UTC (72h Continental Ridge Fortress Siege)",
            "artifact_altar_loc": "91200:136800",
            "outer_gate_loc": "91560:136540",
            "manor_specialty_crop": "Verdigris Mercury-Pod & Brass-Spur Thistle",
            "ruling_npc_faction": "Dragonspine Gear-Watch Legion",
        },
        {
            "domain_id": "domain-fortress-cloud-halo",
            "stronghold_zone_id": "zone-fortress-cloud-halo",
            "stronghold_name": "Starfall Cloud-Mountain Fortress",
            "continent_id": "continent-03-shattered-halo",
            "domain_tier": "Capital_Citadel",
            "vassal_town_ids": [
                "zone-town-starfall-haven",
                "zone-town-crown-beacon",
            ],
            "vassal_hunting_zone_ids": [
                "zone-field-tether-causeway",
                "zone-field-aurora-tether",
                "zone-field-orrery-bridge",
                "zone-field-kelp-spiral-reef",
            ],
            "tax_rate_pct": 15,
            "siege_window_utc": "Sunday 20:00–22:00 UTC (Grand High-Halo Imperial Citadel Siege)",
            "artifact_altar_loc": "46200:-45100",
            "outer_gate_loc": "46560:-45360",
            "manor_specialty_crop": "Astral Star-Kelp & Aurora Prism-Fruit",
            "ruling_npc_faction": "High-Halo Sovereign Astral Order",
        },
    ]


def _build_world_boss_spawn_radar(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 32 high-value World Boss & MVP Respawn Radar entries (16 Dungeon MVPs on B3/3F + 16 Overland/Fortress Raid & Mini-Bosses) (D26)."""
    mf_dungeons = atlas.get("multi_floor_dungeons") or []
    zdir = atlas.get("t_breadth_zone_directory") or {}
    forts_list = zdir.get("harbors_clanhalls_and_forts") or []
    fields_list = zdir.get("fields_and_hunting_areas") or []

    statuses = ("Window Open", "Respawning Soon", "Sanctum Active")
    entries: list[dict[str, Any]] = []

    # Part 1: 16 Dungeon MVP Bosses on B3 / 3F
    mvp_windows = (
        "12h ± 2h",
        "18h ± 3h",
        "24h ± 4h",
        "36h ± 4h",
        "48h ± 6h",
    )
    for idx, dng in enumerate(mf_dungeons[:16]):
        if not isinstance(dng, dict):
            continue
        did = str(dng.get("dungeon_id", ""))
        floors = dng.get("floors") or []
        f_last = floors[-1] if floors else {}
        fid = str(f_last.get("floor_id") or ("3F" if dng.get("dungeon_kind") == "vertical_tower" else "B3"))
        spawns = f_last.get("spawns") or []
        mvps = [s for s in spawns if isinstance(s, dict) and s.get("entity_type") == "MVP"]
        mvp_row = mvps[0] if mvps else (spawns[0] if spawns else {})
        b_name = str(mvp_row.get("name") or f"[MVP] {dng.get('name', did)} Sanctum Apostle")
        b_lv = max(1, min(99, int(mvp_row.get("level") or 30)))
        b_loc = str(mvp_row.get("loc_coord") or dng.get("entrance_loc") or "53100:242600")
        drops = mvp_row.get("refinement_drops") or ["Divine Apostle Anvil Core", "Architect Seal Crest"]
        top_drop = f"{drops[0]} · {drops[1]}" if len(drops) >= 2 else str(drops[0])
        cc_size = (
            "18–27 Players (2–3 Parties)"
            if b_lv <= 25
            else ("27–45 Players (3–5 Parties)" if b_lv <= 55 else "45–90 Players (5–10 Command Channel Parties)")
        )
        entries.append(
            {
                "boss_id": f"radar-mvp-{idx + 1:02d}-{did.replace('zone-', '')}",
                "boss_name": b_name,
                "boss_category": "MVP",
                "level": b_lv,
                "zone_id": did,
                "dungeon_id": did,
                "floor_id": fid,
                "loc": b_loc,
                "respawn_window": mvp_windows[idx % len(mvp_windows)],
                "command_channel_size": cc_size,
                "top_reward_drop": top_drop,
                "radar_status": statuses[idx % len(statuses)],
            }
        )

    # Part 2A: 8 Fortress / Harbor / Clan Hall Overland Raid Bosses
    for idx, fort in enumerate(forts_list[:8]):
        if not isinstance(fort, dict):
            continue
        zid = str(fort.get("zone_id", ""))
        fbp = fort.get("fortress_blueprint") or {}
        st_list = fbp.get("spawn_territories") or []
        raids = [s for s in st_list if isinstance(s, dict) and s.get("entity_type") == "Raid"]
        r_row = raids[0] if raids else (st_list[0] if st_list else {})
        b_name = str(r_row.get("mob_name") or f"[Raid Boss] {fort.get('name', zid)} Siege Commander")
        b_lv = max(1, min(99, int(r_row.get("level") or 25)))
        b_loc = str(r_row.get("loc_coord") or fort.get("loc_coord") or "-5200:134200")
        drops = r_row.get("refinement_drops") or ["Blood Alliance", "Blessed Weapon Enchant"]
        top_drop = f"{drops[0]} · {drops[1]}" if len(drops) >= 2 else str(drops[0])
        entries.append(
            {
                "boss_id": f"radar-fort-raid-{idx + 1:02d}-{zid.replace('zone-', '')}",
                "boss_name": b_name,
                "boss_category": "Raid",
                "level": b_lv,
                "zone_id": zid,
                "dungeon_id": "",
                "floor_id": "",
                "loc": b_loc,
                "respawn_window": "8h ± 1h (Siege Garrison Window)",
                "command_channel_size": "18–36 Players (2–4 Clan Parties)",
                "top_reward_drop": top_drop,
                "radar_status": statuses[(idx + 1) % len(statuses)],
            }
        )

    # Part 2B: 8 Overland Field Hunting Area Raid & Mini-Bosses (4 Raid + 4 Mini-Boss)
    selected_fields = [
        fields_list[0],   # Clover South-Gate
        fields_list[3],   # Firebrick Bellows Duct
        fields_list[10],  # Cinder Apron Viaduct
        fields_list[11],  # Brass-Spur Gear Ridge
        fields_list[12],  # Mainspring Caldera Rim
        fields_list[13],  # Leyden Capacitor Causeway
        fields_list[14],  # Star-Tether Causeway
        fields_list[15],  # Aurora Tether Span
    ]
    for idx, fld in enumerate(selected_fields):
        if not isinstance(fld, dict):
            continue
        zid = str(fld.get("zone_id", ""))
        ftb = fld.get("field_tactical_blueprint") or {}
        st_list = ftb.get("spawn_territories") or []
        want_cat = "Raid" if idx >= 4 else "Mini-Boss"
        matches = [s for s in st_list if isinstance(s, dict) and s.get("entity_type") == want_cat]
        s_row = matches[0] if matches else (st_list[0] if st_list else {})
        b_name = str(s_row.get("mob_name") or f"[{want_cat}] {fld.get('name', zid)} Warden")
        b_lv = max(1, min(99, int(s_row.get("level") or 20)))
        b_loc = str(s_row.get("loc_coord") or fld.get("loc_coord") or "72986:113330")
        drops = s_row.get("refinement_drops") or ["Blessed Weapon Enchant Scroll", "Seal-Stone Cluster"]
        top_drop = f"{drops[0]} · {drops[1]}" if len(drops) >= 2 else str(drops[0])
        entries.append(
            {
                "boss_id": f"radar-field-{idx + 1:02d}-{zid.replace('zone-', '')}",
                "boss_name": b_name,
                "boss_category": want_cat,
                "level": b_lv,
                "zone_id": zid,
                "dungeon_id": "",
                "floor_id": "",
                "loc": b_loc,
                "respawn_window": "6h ± 1h" if want_cat == "Raid" else "2h ± 15m (Field Patrol)",
                "command_channel_size": "9–18 Players (1–2 Parties)" if want_cat == "Raid" else "4–9 Players (1 Full Party)",
                "top_reward_drop": top_drop,
                "radar_status": statuses[(idx + 2) % len(statuses)],
            }
        )

    return entries


def _build_seven_seals_competitions(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 16 Seven-Seals Dusk vs. Dawn Catacomb/Tower Competitions & Mammon Rotation entries (8 Seal_Catacomb + 8 Ascendant_Necropolis_Tower) (D27)."""
    mf_dungeons = atlas.get("multi_floor_dungeons") or []
    catacomb_ids = {
        "zone-catacomb-heretic-kiln",
        "zone-catacomb-branded-bellows",
        "zone-catacomb-apostate-dynamo",
        "zone-catacomb-witch-pendulum",
        "zone-catacomb-dark-omens-coral",
        "zone-catacomb-forbidden-path-orrery",
        "zone-dungeon-kiln-cellar",
        "zone-dungeon-sunken-potter-hold",
    }
    seals = ("Sign_of_Avarice", "Sign_of_Gnosis", "Sign_of_Strife")
    cabals = ("Lords_of_Dawn", "Revolutionaries_of_Dusk", "Contested_Equilibrium")
    stone_tiers = ("Blue_Seal_Stone", "Green_Seal_Stone", "Red_Seal_Stone")
    blacksmith_services = (
        "Unseal A/S-Grade Armor & Bestow SA (Special Ability)",
        "Upgrade C/B-Grade Weapons & Dual-Sword Masterwork Forging",
        "Exchange Equivalent A-Grade Weapons & Bestow Focus/Haste/Acumen SA",
        "Remove B/A-Grade Masterwork Seal & Reseal Ancient Cloak",
    )
    merchant_services = (
        "Exchange Ancient Adena for Blessed Scrolls & Greater Henna Dyes",
        "Purchase Soul Crystal Stages 7–10, Blank Scrolls & Gemstones A/S",
        "Trade Blue/Green/Red Seal Stones for Ancient Adena & Dimensional Shards",
        "Supply Greater Stat Dyes (+4 STR/DEX/INT/WIT) & Teleport Scrolls",
    )

    entries: list[dict[str, Any]] = []
    for idx, dng in enumerate(mf_dungeons[:16]):
        if not isinstance(dng, dict):
            continue
        did = str(dng.get("dungeon_id", ""))
        dname = str(dng.get("name", did))
        sanctum_type = "Seal_Catacomb" if did in catacomb_ids else "Ascendant_Necropolis_Tower"
        seal_allegiance = seals[idx % len(seals)]
        controlling_cabal = cabals[idx % len(cabals)]
        seal_stone_tier = stone_tiers[idx % len(stone_tiers)]
        ancient_adena_per_hour = 48000 + idx * 22500
        is_blacksmith = (idx % 2) == 0
        mammon_npc = "Blacksmith_of_Mammon" if is_blacksmith else "Merchant_of_Mammon"
        floors = dng.get("floors") or []
        chosen_fl = floors[1] if len(floors) >= 2 and (idx % 3 != 2) else (floors[-1] if floors else {})
        default_fid = "2F" if dng.get("dungeon_kind") == "vertical_tower" else "B2"
        mammon_floor_id = str(chosen_fl.get("floor_id") or default_fid)
        bx, by = _parse_loc(str(dng.get("entrance_loc") or "48550:248400"))
        mammon_loc = _fmt_loc(bx + 240 + idx * 15, by - 180 - idx * 15)
        specialty = (
            blacksmith_services[(idx // 2) % len(blacksmith_services)]
            if is_blacksmith
            else merchant_services[(idx // 2) % len(merchant_services)]
        )
        entries.append(
            {
                "competition_id": f"seven-seals-{idx + 1:02d}-{did.replace('zone-', '')}",
                "dungeon_id": did,
                "dungeon_name": dname,
                "sanctum_type": sanctum_type,
                "seal_allegiance": seal_allegiance,
                "controlling_cabal": controlling_cabal,
                "seal_stone_tier": seal_stone_tier,
                "ancient_adena_per_hour": ancient_adena_per_hour,
                "mammon_visitor_npc": mammon_npc,
                "mammon_active_floor_id": mammon_floor_id,
                "mammon_loc": mammon_loc,
                "mammon_specialty_service": specialty,
            }
        )
    return entries


def _build_manor_economy_routes(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 15-Town Manor Seed/Crop & Regional Caravan Trade Economy Routes (D28)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_towns = (zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or [])
    town_name_by_id = {
        str(t.get("zone_id")): str(t.get("name", t.get("zone_id")))
        for t in all_towns
        if isinstance(t, dict) and t.get("zone_id")
    }
    specs = [
        (
            "zone-town-lantern-hollow",
            "zone-harbor-lantern-ferry-pier",
            "Golden Clover Coda Seed",
            "Golden Clover Coda",
            "zone-field-clover-south-gate",
            "Lv.1–12",
            1800,
            "Synthetic Cokes",
            "Low_Patrolled",
        ),
        (
            "zone-town-porcelain-loom",
            "zone-harbor-glaze-barge-airship-dock",
            "Celadon Dew-Lotus Seed",
            "Celadon Dew-Lotus",
            "zone-field-celadon-causeway",
            "Lv.1–12",
            1750,
            "High-Grade Suede",
            "Low_Patrolled",
        ),
        (
            "zone-town-draft-kiln-post",
            "zone-clanhall-kilnwatch-accord",
            "Firebrick Slag-Spore Seed",
            "Firebrick Slag-Coke",
            "zone-field-firebrick-duct",
            "Lv.1–15",
            2100,
            "Synthetic Cokes",
            "Low_Patrolled",
        ),
        (
            "zone-town-root-train-roundhouse",
            "zone-fortress-floran-saffron",
            "Amber Root-Resin Seed",
            "Amber Root-Resin",
            "zone-field-resin-arch-tunnel",
            "Lv.1–12",
            1950,
            "Varnish of Purity",
            "Low_Patrolled",
        ),
        (
            "zone-town-carillon-belfry",
            "zone-fortress-shanty-kiln",
            "Acoustic Chime-Gourd Seed",
            "Acoustic Chime-Gourd",
            "zone-field-chime-pipe-colonnade",
            "Lv.1–12",
            1850,
            "Thons",
            "Low_Patrolled",
        ),
        (
            "zone-town-cinnamon-mill",
            "zone-harbor-lantern-ferry-pier",
            "Cinnamon-Bark Sapling Seed",
            "Cinnamon-Bark Sap",
            "zone-field-cinnamon-bark-viaduct",
            "Lv.1–10",
            1600,
            "Compound Braid",
            "Low_Patrolled",
        ),
        (
            "zone-town-kilnwatch-bastion",
            "zone-clanhall-kilnwatch-accord",
            "Hearth-Glaze Apricot Seed",
            "Hearth-Glaze Apricot",
            "zone-field-kiln-east-orchard",
            "Lv.5–14",
            3200,
            "Asofe",
            "Medium_Bandit_Road",
        ),
        (
            "zone-town-glaze-barge-quay",
            "zone-harbor-glaze-barge-airship-dock",
            "Blue Cobalt Reed Seed",
            "Blue Cobalt Reed",
            "zone-field-cobalt-sandbar-ford",
            "Lv.5–16",
            2600,
            "Thons",
            "Medium_Bandit_Road",
        ),
        (
            "zone-town-saffron-press",
            "zone-fortress-floran-saffron",
            "Imperial Saffron Crocus Seed",
            "Imperial Saffron Crocus",
            "zone-field-apricot-aqueduct-terrace",
            "Lv.4–14",
            2900,
            "Asofe",
            "Low_Patrolled",
        ),
        (
            "zone-town-pinion-terminus",
            "zone-fortress-dragonspine-cog",
            "Brass-Spur Thistle Seed",
            "Brass-Spur Thistle",
            "zone-field-brass-spur-ridge",
            "Lv.20–26",
            3100,
            "Enria",
            "Medium_Bandit_Road",
        ),
        (
            "zone-town-escapement-anvil",
            "zone-clanhall-inductor-conclave",
            "Verdigris Mercury-Pod Seed",
            "Verdigris Mercury-Pod",
            "zone-field-caldera-rim",
            "Lv.25–30",
            3400,
            "Oriharukon",
            "Medium_Bandit_Road",
        ),
        (
            "zone-town-inductor-switchyard",
            "zone-clanhall-inductor-conclave",
            "Leyden Copper-Spore Seed",
            "Leyden Copper-Spore",
            "zone-field-leyden-causeway",
            "Lv.30–40",
            3800,
            "Enria",
            "High_Frontier_Ambush",
        ),
        (
            "zone-town-starfall-haven",
            "zone-fortress-cloud-halo",
            "Astral Star-Kelp Seed",
            "Astral Star-Kelp",
            "zone-field-tether-causeway",
            "Lv.40–48",
            4100,
            "Oriharukon",
            "High_Frontier_Ambush",
        ),
        (
            "zone-town-crown-beacon",
            "zone-fortress-cloud-halo",
            "Aurora Prism-Fruit Seed",
            "Aurora Prism-Fruit",
            "zone-field-aurora-tether",
            "Lv.55–85",
            4500,
            "Enria",
            "High_Frontier_Ambush",
        ),
        (
            "zone-town-torque-balance-citadel",
            "zone-clanhall-inductor-conclave",
            "Tempered Mainspring Flax Seed",
            "Tempered Mainspring Flax",
            "zone-field-metronome-bridge",
            "Lv.34–36",
            3500,
            "Asofe",
            "High_Frontier_Ambush",
        ),
    ]
    routes: list[dict[str, Any]] = []
    for idx, (tzid, pszid, sname, cname, hfzid, hlband, quota, mat, risk) in enumerate(specs, start=1):
        routes.append(
            {
                "manor_id": f"manor-{idx:02d}-{tzid.replace('zone-town-', '')}",
                "town_zone_id": tzid,
                "town_name": town_name_by_id.get(tzid, tzid),
                "parent_stronghold_zone_id": pszid,
                "seed_name": sname,
                "crop_name": cname,
                "harvest_field_zone_id": hfzid,
                "harvest_level_band": hlband,
                "daily_crop_quota": quota,
                "procure_reward_material": mat,
                "caravan_route_risk": risk,
            }
        )
    return routes


def _build_noblesse_olympiad_network(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 21 Subclass, Noblesse & Grand Olympiad Monument Network Nodes (15 Town Olympiad Monuments + 3 Subclass Sanctums + 3 Noblesse Shrines) (D29)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_towns = (zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or [])
    nodes: list[dict[str, Any]] = []
    for idx, t in enumerate(all_towns[:15], start=1):
        if not isinstance(t, dict):
            continue
        tzid = str(t.get("zone_id", ""))
        tname = str(t.get("name", tzid)).split("(")[0].strip()
        bx, by = _parse_loc(str(t.get("loc_coord") or "-84120:243500"))
        mon_loc = _fmt_loc(bx + 180 + idx * 12, by - 140 - idx * 10)
        nodes.append(
            {
                "node_id": f"olympiad-monument-{idx:02d}-{tzid.replace('zone-town-', '')}",
                "node_name": f"{tname} Grand Olympiad Monument of Heroes",
                "node_category": "Olympiad_Monument",
                "zone_id": tzid,
                "dungeon_id": "",
                "floor_id": "",
                "loc": mon_loc,
                "min_level": 76,
                "npc_steward_name": f"Grand Olympiad Manager & Monument of Heroes (#{idx})",
                "ritual_requirement": "Noblesse Status + 3rd Class Awakening (Lv.76+) & Olympiad Points",
                "heroic_reward": "Wings of Destiny Circlet, Infinity Hero Weapons & Noblesse Gate Pass",
            }
        )

    sanctum_specs = [
        (
            "subclass-sanctum-01-chronometer-mimir",
            "Chronometer Foundry Alchemical Urn of Mimir (B3/3F Subclass Sanctum)",
            "Subclass_Mimir_Sanctum",
            "zone-dungeon-chronometer-foundry",
            "zone-dungeon-chronometer-foundry",
            "3F",
            "85120:56180",
            75,
            "Magister Ladd & Alchemical Urn of Mimir",
            "Fate's Whisper (Cabrio/Hallate/Kernon/Golkonda Insignias) + Pure Silver & True Gold",
            "Mimir's Elixir & Subclass Awakening Slot Unlock (Lv.75 Dual-Class Mastery)",
        ),
        (
            "subclass-sanctum-02-star-heart-baium",
            "Star-Heart Tower of Insolence Celestial Sanctum (3F Subclass Trial)",
            "Subclass_Mimir_Sanctum",
            "zone-dungeon-star-heart-nave",
            "zone-dungeon-star-heart-nave",
            "3F",
            "149520:28140",
            75,
            "Grand Magister Kaspar & Blooded Fabric Reliquary",
            " dip Pipette Knife in Celestial Archon Blood on 3F Apex Sanctum",
            "Star-Tempered Subclass Certificate & Emergent Skill Tome",
        ),
        (
            "subclass-sanctum-03-forbidden-orrery-crucible",
            "Catacomb of the Forbidden Architect Path Subclass Crucible (B3)",
            "Subclass_Mimir_Sanctum",
            "zone-catacomb-forbidden-path-orrery",
            "zone-catacomb-forbidden-path-orrery",
            "B3",
            "18720:-64480",
            76,
            "Alchemist Wesley & Void-Quicksilver Crucible",
            "Combine Blood Fire, Pure Silver & True Gold at B3 Abyssal Flame",
            "Sacred Subclass Seal & Certified Dual-Awakening Aura",
        ),
        (
            "noblesse-shrine-01-caldera-barakiel",
            "Mainspring Caldera Shrine of Flame-Splendor Barakiel",
            "Noblesse_Barakiel_Shrine",
            "zone-field-caldera-rim",
            "",
            "",
            "86780:60940",
            75,
            "Lady of the Lake & Caradine's Envoy",
            "Possessor of a Precious Soul Pt. 1–4 + Defeat Flame of Splendor Barakiel (Lv.75 Subclass)",
            "Noblesse Tiara, Blessing of Noblesse Buff Retention & Olympiad Eligibility",
        ),
        (
            "noblesse-shrine-02-aurora-lady-of-the-lake",
            "Aurora Tether Astral Spring of the Lady of the Lake",
            "Noblesse_Barakiel_Shrine",
            "zone-field-aurora-tether",
            "",
            "",
            "152740:30920",
            76,
            "Matriarch Caradine & Astral Goddess Evaluation",
            "Deliver Rain Song Staff of Barakiel & Starstone of Goddess Eva",
            "Exalted Noblesse Investiture & Summon/Teleport Mastery",
        ),
        (
            "noblesse-shrine-03-orrery-splendor-altar",
            "Orrery Sky-Span Altar of Splendor & Sovereign Lineage",
            "Noblesse_Barakiel_Shrine",
            "zone-field-orrery-bridge",
            "",
            "",
            "-28080:-108460",
            78,
            "High Steward Ossian & Herald of Splendor",
            "Vanquish Guardians of Splendor & Seal the Sovereign Starlight Relic",
            "Sovereign Noblesse Crest & Grand Olympiad Heroic Ascension Right",
        ),
    ]
    for nid, nname, ncat, zid, did, fid, loc, min_lv, steward, req, rew in sanctum_specs:
        nodes.append(
            {
                "node_id": nid,
                "node_name": nname,
                "node_category": ncat,
                "zone_id": zid,
                "dungeon_id": did,
                "floor_id": fid,
                "loc": loc,
                "min_level": min_lv,
                "npc_steward_name": steward,
                "ritual_requirement": req,
                "heroic_reward": rew,
            }
        )
    return nodes


def _build_intercontinental_transit_lines(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 18 Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Lines (6 Maritime_Ship + 6 Brass_Airship + 6 Gatekeeper_Trunk) (D30)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    loc_by_zid: dict[str, str] = {}
    for entries in zdir.values():
        if isinstance(entries, list):
            for z in entries:
                if isinstance(z, dict) and z.get("zone_id"):
                    loc_by_zid[str(z["zone_id"])] = str(z.get("loc_coord") or "-84120:243500")

    specs = [
        # 6 Maritime_Ship Routes
        (
            "transit-ship-01-lantern-to-glaze-quay",
            "Lantern Hollow South Ferry ➔ Glaze-Barge Maritime Harbor",
            "Maritime_Ship",
            "zone-harbor-lantern-ferry-pier",
            "zone-harbor-glaze-barge-airship-dock",
            "Every 10m",
            1500,
            "Wharf Manager Firon · S.S. Hearthbloom Queen",
        ),
        (
            "transit-ship-02-glaze-harbor-to-pinion",
            "Glaze-Barge Maritime Dock ➔ Pinion Terminus Steppe Pier (C01➔C02)",
            "Maritime_Ship",
            "zone-harbor-glaze-barge-airship-dock",
            "zone-town-pinion-terminus",
            "Every 12m",
            4800,
            "Wharf Manager Clancy · Ironclad Packet Giran-Tide",
        ),
        (
            "transit-ship-03-lantern-ferry-to-cinnamon",
            "Lantern Hollow Ferry Pier ➔ Cinnamon-Mill Spice Wharf",
            "Maritime_Ship",
            "zone-harbor-lantern-ferry-pier",
            "zone-town-cinnamon-mill",
            "Every 8m",
            1200,
            "Wharf Manager Ned · Spice Clipper Talking-Isle",
        ),
        (
            "transit-ship-04-glaze-quay-to-kelp-reef",
            "Glaze-Barge Quay ➔ Kelp Spiral Undertide Reef (C01➔C03 Sea Route)",
            "Maritime_Ship",
            "zone-town-glaze-barge-quay",
            "zone-field-kelp-spiral-reef",
            "Every 15m",
            8500,
            "Captain Bathis · Abyssal Galleon Rune-Star",
        ),
        (
            "transit-ship-05-siphon-canal-to-starfall",
            "Verdigris Siphon Canal Lock ➔ Starfall Haven Sea-Lift (C02➔C03)",
            "Maritime_Ship",
            "zone-field-siphon-sluice",
            "zone-town-starfall-haven",
            "Every 15m",
            9200,
            "Wharf Manager Volter · Mercury Barge Heine-Pride",
        ),
        (
            "transit-ship-06-root-train-to-cobalt-ford",
            "Root-Train Roundhouse Dock ➔ Cobalt Sandbar Delta Ferry",
            "Maritime_Ship",
            "zone-town-root-train-roundhouse",
            "zone-field-cobalt-sandbar-ford",
            "Every 10m",
            2200,
            "Dwarven Ferryman Bolter · Steam-Tug Mithril-Keel",
        ),
        # 6 Brass_Airship Routes
        (
            "transit-airship-01-glaze-dock-to-starfall",
            "Glaze-Barge Airship Sky-Dock ➔ Starfall Haven Sky-Harbor (C01➔C03)",
            "Brass_Airship",
            "zone-harbor-glaze-barge-airship-dock",
            "zone-town-starfall-haven",
            "Every 12m",
            12500,
            "Airship Controller Tolonis · Brass Zeppelin Keucereus-I",
        ),
        (
            "transit-airship-02-pinion-to-starfall",
            "Pinion Terminus Sky-Mast ➔ Starfall Haven Cloud-Dock (C02➔C03)",
            "Brass_Airship",
            "zone-town-pinion-terminus",
            "zone-town-starfall-haven",
            "Every 10m",
            9800,
            "Sky-Navigator Lekon · Aether Frigate Gracia-Wind",
        ),
        (
            "transit-airship-03-inductor-to-crown-beacon",
            "Inductor Switchyard Sky-Spire ➔ Crown-Beacon Imperial Mooring (C02➔C03)",
            "Brass_Airship",
            "zone-town-inductor-switchyard",
            "zone-town-crown-beacon",
            "Every 15m",
            14500,
            "High Navigator Dilios · Dreadnought Airship Chronos-Wing",
        ),
        (
            "transit-airship-04-starfall-to-cloud-halo",
            "Starfall Haven Sky-Harbor ➔ Cloud-Mountain Fortress Citadel",
            "Brass_Airship",
            "zone-town-starfall-haven",
            "zone-fortress-cloud-halo",
            "Every 8m",
            6400,
            "Flight Master Ishuma · Sky-Cutter Aurora-V",
        ),
        (
            "transit-airship-05-crown-beacon-to-orrery",
            "Crown-Beacon Citadel ➔ The Orrery Astral Sky-Span",
            "Brass_Airship",
            "zone-town-crown-beacon",
            "zone-field-orrery-bridge",
            "Every 10m",
            11000,
            "Astral PilotNemo · Starlight Dirigible Helios-Arc",
        ),
        (
            "transit-airship-06-torque-citadel-to-dragonspine",
            "Torque-Balance Citadel ➔ Dragonspine Cog Sky-Fortress",
            "Brass_Airship",
            "zone-town-torque-balance-citadel",
            "zone-fortress-dragonspine-cog",
            "Every 10m",
            7600,
            "Blacksmith Flight-Engineer Rooney · Gyro-Galleon Vulcan-II",
        ),
        # 6 Gatekeeper_Trunk Routes
        (
            "transit-gk-01-lantern-to-kilnwatch",
            "Lantern Hollow Village ➔ Town of Kilnwatch Bastion (C01 Mainline Trunk)",
            "Gatekeeper_Trunk",
            "zone-town-lantern-hollow",
            "zone-town-kilnwatch-bastion",
            "Instant Teleport",
            3400,
            "Gatekeeper Richlin ⇄ Gatekeeper Trisha",
        ),
        (
            "transit-gk-02-kilnwatch-to-pinion",
            "Town of Kilnwatch Bastion ➔ Pinion Terminus Township (C01➔C02 Trunk)",
            "Gatekeeper_Trunk",
            "zone-town-kilnwatch-bastion",
            "zone-town-pinion-terminus",
            "Instant Teleport",
            6800,
            "Gatekeeper Trisha ⇄ Gatekeeper Clarissa",
        ),
        (
            "transit-gk-03-pinion-to-escapement",
            "Pinion Terminus Township ➔ Town of Escapement Anvil (C02 Core Trunk)",
            "Gatekeeper_Trunk",
            "zone-town-pinion-terminus",
            "zone-town-escapement-anvil",
            "Instant Teleport",
            5200,
            "Gatekeeper Clarissa ⇄ Gatekeeper Valentina",
        ),
        (
            "transit-gk-04-escapement-to-inductor",
            "Town of Escapement Anvil ➔ Town of Inductor Switchyard (C02 Capital Trunk)",
            "Gatekeeper_Trunk",
            "zone-town-escapement-anvil",
            "zone-town-inductor-switchyard",
            "Instant Teleport",
            7900,
            "Gatekeeper Valentina ⇄ Gatekeeper Bella",
        ),
        (
            "transit-gk-05-inductor-to-starfall",
            "Town of Inductor Switchyard ➔ Starfall Haven Township (C02➔C03 Trunk)",
            "Gatekeeper_Trunk",
            "zone-town-inductor-switchyard",
            "zone-town-starfall-haven",
            "Instant Teleport",
            14000,
            "Gatekeeper Bella ⇄ Gatekeeper Ilyana",
        ),
        (
            "transit-gk-06-starfall-to-crown-beacon",
            "Starfall Haven Township ➔ Town of Crown-Beacon Citadel (C03 Imperial Trunk)",
            "Gatekeeper_Trunk",
            "zone-town-starfall-haven",
            "zone-town-crown-beacon",
            "Instant Teleport",
            18000,
            "Gatekeeper Ilyana ⇄ Grand Gatekeeper Eliza",
        ),
    ]
    lines: list[dict[str, Any]] = []
    for tid, rname, tmode, ozid, dzid, interval, cost, vessel in specs:
        lines.append(
            {
                "transit_id": tid,
                "route_name": rname,
                "transit_mode": tmode,
                "origin_zone_id": ozid,
                "origin_loc": loc_by_zid.get(ozid, "-84120:243500"),
                "destination_zone_id": dzid,
                "destination_loc": loc_by_zid.get(dzid, "82400:148600"),
                "departure_interval": interval,
                "ticket_cost_adena": cost,
                "vessel_or_gatekeeper_name": vessel,
            }
        )
    return lines


def _build_soul_crystal_resonance_stages(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 18 Soul Crystal (SA) Stage 1-13 Resonance & Boss Absorption Entries (6 Crimson_Red + 6 Verdant_Green + 6 Azure_Blue) (D31)."""
    specs = [
        # 6 Crimson_Red Stages (Stage 1->3, Stage 4->5, Stage 6->8, Stage 9->10, Stage 11->12, Stage 13)
        (
            "sa-crimson-01-stage-1-to-3",
            "Crimson_Red",
            "Stage_1_to_5_C_Grade",
            "C-Grade",
            ["Focus (+64 Crit Rate)", "Haste (+7% Atk Spd)", "Critical Damage (+165 P.Atk on Crit)"],
            "zone-town-lantern-hollow",
            "Kiln Cellar Slag Brood-Matron & Cinder Weaver (Lv.32-38)",
            "zone-dungeon-kiln-cellar",
            "zone-dungeon-kiln-cellar",
            "B2",
            "75620:116940",
            65,
            "Safe Resonance (0% Crystal Shatter Risk on Failure)",
        ),
        (
            "sa-crimson-02-stage-4-to-5",
            "Crimson_Red",
            "Stage_1_to_5_C_Grade",
            "C-Grade",
            ["Focus (+78 Crit Rate)", "Haste (+8% Atk Spd)", "Anger (+15% P.Atk / -15% Max HP)"],
            "zone-town-kilnwatch-bastion",
            "Cinder Apron Magma Drake & Vitrified Slag Gargoyle (Lv.42-48)",
            "zone-field-cinder-apron",
            "",
            "",
            "-6180:132040",
            48,
            "Low Volatility (5% Crack Risk above Stage 4)",
        ),
        (
            "sa-crimson-03-stage-6-to-8",
            "Crimson_Red",
            "Stage_6_to_10_B_A_Grade",
            "B-Grade",
            ["Focus (+92 Crit Rate)", "Haste (+9% Atk Spd)", "Rsk. Focus (+118 Crit below 60% HP)"],
            "zone-town-pinion-terminus",
            "Pendulum Weight Shaft Automaton Centurion (Lv.52-58)",
            "zone-dungeon-pendulum-shaft",
            "zone-dungeon-pendulum-shaft",
            "3F",
            "85620:144380",
            36,
            "Moderate Resonance Volatility (10% Shatter Risk if target not Soul-Drained)",
        ),
        (
            "sa-crimson-04-stage-9-to-10",
            "Crimson_Red",
            "Stage_6_to_10_B_A_Grade",
            "A-Grade",
            ["Focus (+108 Crit Rate)", "Haste (+10% Atk Spd)", "Critical Bleed (35% DoT on Crit)"],
            "zone-town-escapement-anvil",
            "Mainspring Caldera Rim Ash-Titan & Doom Knight (Lv.64-70)",
            "zone-field-caldera-rim",
            "",
            "",
            "86640:61420",
            28,
            "High Resonance Volatility (12% Shatter Risk; Last-Hit Party Absorption)",
        ),
        (
            "sa-crimson-05-stage-11-to-12",
            "Crimson_Red",
            "Stage_11_to_13_S_Grade_Boss",
            "S-Grade",
            ["Focus (+134 Crit Rate)", "Haste (+11% Atk Spd)", "HP Drain (4% Vampiric Melee Absorb)"],
            "zone-town-inductor-switchyard",
            "Chronometer Foundry MVP Apostle Krono-Vanguard (Lv.78 Raid Sanctum)",
            "zone-dungeon-chronometer-foundry",
            "zone-dungeon-chronometer-foundry",
            "3F",
            "85040:56620",
            100,
            "Guaranteed Raid Party Resonance (0% Shatter on MVP Sanctum Kill)",
        ),
        (
            "sa-crimson-06-stage-13-apex",
            "Crimson_Red",
            "Stage_11_to_13_S_Grade_Boss",
            "S-Grade",
            ["Focus (+152 Crit Rate)", "Haste (+12% Atk Spd)", "Crt. Damage (+365 Apex S-Grade P.Atk)"],
            "zone-town-crown-beacon",
            "Catacomb of the Forbidden Architect Path MVP Ember-Archon (Lv.85 Sanctum)",
            "zone-catacomb-forbidden-path-orrery",
            "zone-catacomb-forbidden-path-orrery",
            "B3",
            "18640:-64020",
            22,
            "Apex Grand-Boss Resonance (15% Shatter Risk or Full Party Stage 12->13 Promotion)",
        ),
        # 6 Verdant_Green Stages
        (
            "sa-verdant-01-stage-1-to-3",
            "Verdant_Green",
            "Stage_1_to_5_C_Grade",
            "C-Grade",
            ["Acumen (+15% Cast Spd)", "Empower (+45 M.Atk)", "Magic Power (+12% MP Cost / +18% M.Atk)"],
            "zone-town-porcelain-loom",
            "Medallion Heart Vault Celadon Golem & Oracle Shade (Lv.30-36)",
            "zone-dungeon-medallion-heart-vault",
            "zone-dungeon-medallion-heart-vault",
            "B2",
            "49980:44280",
            65,
            "Safe Resonance (0% Crystal Shatter Risk on Failure)",
        ),
        (
            "sa-verdant-02-stage-4-to-5",
            "Verdant_Green",
            "Stage_1_to_5_C_Grade",
            "C-Grade",
            ["Acumen (+15% Cast Spd)", "Mana Up (+30% Max MP)", "Conversion (+40% Max MP / -40% Max HP)"],
            "zone-town-glaze-barge-quay",
            "Sunken Potter Hold Abyssal Siren & Brine Prelate (Lv.40-46)",
            "zone-dungeon-sunken-potter-hold",
            "zone-dungeon-sunken-potter-hold",
            "B3",
            "-78180:149420",
            50,
            "Low Volatility (5% Crack Risk above Stage 4)",
        ),
        (
            "sa-verdant-03-stage-6-to-8",
            "Verdant_Green",
            "Stage_6_to_10_B_A_Grade",
            "B-Grade",
            ["Acumen (+15% Cast Spd)", "Magic Silence (10% Silence on Cast)", "Quick Recovery (-15% Skill Reuse)"],
            "zone-town-saffron-press",
            "Catacomb of the Branded Bellows Nephilim Arch-Seer (Lv.54-60)",
            "zone-catacomb-branded-bellows",
            "zone-catacomb-branded-bellows",
            "B3",
            "112640:18420",
            35,
            "Moderate Resonance Volatility (10% Shatter Risk if target not Soul-Drained)",
        ),
        (
            "sa-verdant-04-stage-9-to-10",
            "Verdant_Green",
            "Stage_6_to_10_B_A_Grade",
            "A-Grade",
            ["Acumen (+15% Cast Spd)", "Empower (+85 M.Atk)", "Magic Paralyze (8% Anchor Proc)"],
            "zone-town-torque-balance-citadel",
            "Leyden Capacitor Causeway Arc-Tesla Construct (Lv.64-72)",
            "zone-field-leyden-causeway",
            "",
            "",
            "141420:-48380",
            26,
            "High Resonance Volatility (12% Shatter Risk; Last-Hit Party Absorption)",
        ),
        (
            "sa-verdant-05-stage-11-to-12",
            "Verdant_Green",
            "Stage_11_to_13_S_Grade_Boss",
            "S-Grade",
            ["Acumen (+15% Cast Spd)", "Empower (+125 M.Atk)", "MP Regeneration (+18% Clarity Recovery)"],
            "zone-town-starfall-haven",
            "Catacomb of the Astral Witch MVP Vesper-Hierophant (Lv.78 Sanctum)",
            "zone-catacomb-witch-pendulum",
            "zone-catacomb-witch-pendulum",
            "B3",
            "54420:-34580",
            100,
            "Guaranteed Raid Party Resonance (0% Shatter on MVP Sanctum Kill)",
        ),
        (
            "sa-verdant-06-stage-13-apex",
            "Verdant_Green",
            "Stage_11_to_13_S_Grade_Boss",
            "S-Grade",
            ["Acumen (+15% Cast Spd)", "Empower (+165 Apex S-Grade M.Atk)", "Mysticumen (+15% Cast Spd & +60 M.Atk)"],
            "zone-town-crown-beacon",
            "Star-Heart Tower of Insolence Celestial Archon Baium-Analog (Lv.84 Sanctum)",
            "zone-dungeon-star-heart-nave",
            "zone-dungeon-star-heart-nave",
            "3F",
            "149440:28620",
            20,
            "Apex Grand-Boss Resonance (15% Shatter Risk or Full Party Stage 12->13 Promotion)",
        ),
        # 6 Azure_Blue Stages
        (
            "sa-azure-01-stage-1-to-3",
            "Azure_Blue",
            "Stage_1_to_5_C_Grade",
            "C-Grade",
            ["Health (+25% Max HP)", "Guidance (+6 Accuracy)", "Evasion (+6 Dodge Rating)"],
            "zone-town-root-train-roundhouse",
            "Sap-Heart Abandoned Mines Deep-vein Drevanul (Lv.32-38)",
            "zone-dungeon-sap-heart-cistern",
            "zone-dungeon-sap-heart-cistern",
            "B2",
            "119620:-173980",
            65,
            "Safe Resonance (0% Crystal Shatter Risk on Failure)",
        ),
        (
            "sa-azure-02-stage-4-to-5",
            "Azure_Blue",
            "Stage_1_to_5_C_Grade",
            "C-Grade",
            ["Health (+25% Max HP)", "Critical Stun (22% Stun on Crit)", "Miser (-20% Soulshot Consumption)"],
            "zone-town-draft-kiln-post",
            "Ember Bellows Cave of Trials Obsidian Tyrant (Lv.42-48)",
            "zone-dungeon-ember-bellows-chamber",
            "zone-dungeon-ember-bellows-chamber",
            "B3",
            "-40980:-109580",
            48,
            "Low Volatility (5% Crack Risk above Stage 4)",
        ),
        (
            "sa-azure-03-stage-6-to-8",
            "Azure_Blue",
            "Stage_6_to_10_B_A_Grade",
            "B-Grade",
            ["Health (+25% Max HP)", "QR-Shot (-12% Bow Reuse)", "Cheap Shot (28% 1-MP Arrow Proc)"],
            "zone-town-carillon-belfry",
            "Necropolis of Worship & Dynamo Seal Lilim Paladin (Lv.54-60)",
            "zone-catacomb-apostate-dynamo",
            "zone-catacomb-apostate-dynamo",
            "B3",
            "150040:-50980",
            34,
            "Moderate Resonance Volatility (10% Shatter Risk if target not Soul-Drained)",
        ),
        (
            "sa-azure-04-stage-9-to-10",
            "Azure_Blue",
            "Stage_6_to_10_B_A_Grade",
            "A-Grade",
            ["Health (+25% Max HP)", "Guidance (+8 Accuracy)", "Critical Slow (30% Hamstring on Crit)"],
            "zone-town-cinnamon-mill",
            "Aurora Tether Span Star-Forged Watcher (Lv.66-74)",
            "zone-field-aurora-tether",
            "",
            "",
            "152620:31440",
            25,
            "High Resonance Volatility (12% Shatter Risk; Last-Hit Party Absorption)",
        ),
        (
            "sa-azure-05-stage-11-to-12",
            "Azure_Blue",
            "Stage_11_to_13_S_Grade_Boss",
            "S-Grade",
            ["Health (+25% Max HP)", "Critical Stun (32% S-Grade Polearm Stun)", "HP Regeneration (+24 HP/tick)"],
            "zone-town-starfall-haven",
            "Necropolis of Deep Devotion MVP Thalassa-Leviathan (Lv.79 Sanctum)",
            "zone-catacomb-dark-omens-coral",
            "zone-catacomb-dark-omens-coral",
            "B3",
            "38640:-28680",
            100,
            "Guaranteed Raid Party Resonance (0% Shatter on MVP Sanctum Kill)",
        ),
        (
            "sa-azure-06-stage-13-apex",
            "Azure_Blue",
            "Stage_11_to_13_S_Grade_Boss",
            "S-Grade",
            ["Health (+25% Max HP)", "Guidance (+10 Apex Accuracy)", "Fortitude (+30% Max HP & Shield Block)"],
            "zone-town-crown-beacon",
            "Catacomb of the Heretic Kiln Awakened Dragon-Apostle Antharas-Analog (Lv.85 Sanctum)",
            "zone-catacomb-heretic-kiln",
            "zone-catacomb-heretic-kiln",
            "B3",
            "20040:173620",
            18,
            "Apex Grand-Boss Resonance (15% Shatter Risk or Full Party Stage 12->13 Promotion)",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for (
        cid,
        ccolor,
        sband,
        wgrade,
        sabilities,
        vtown,
        atarget,
        azone,
        adng,
        afloor,
        aloc,
        rchance,
        srule,
    ) in specs:
        rows.append(
            {
                "crystal_stage_id": cid,
                "crystal_color": ccolor,
                "stage_band": sband,
                "weapon_grade_unlocked": wgrade,
                "special_abilities": sabilities,
                "vendor_town_zone_id": vtown,
                "absorption_target_name": atarget,
                "absorption_zone_id": azone,
                "absorption_dungeon_id": adng,
                "absorption_floor_id": afloor,
                "absorption_loc": aloc,
                "resonance_chance_pct": rchance,
                "shatter_rule": srule,
            }
        )
    return rows


def _build_fishing_guild_sanctuaries(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 16 Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuaries (6 Maritime_Harbor_Pier + 5 Luminous_Night_Lake + 5 Thermal_Hot_Spring) (D32)."""
    specs = [
        # 6 Maritime_Harbor_Pier
        (
            "fishing-pier-01-lantern-ferry",
            "Lantern Hollow South Ferry Deep-Sea Breakwater Pier",
            "Maritime_Harbor_Pier",
            "zone-harbor-lantern-ferry-pier",
            "-96020:258580",
            "Fishing Guild Member Perelin",
            "Green Colored Lure (High-Grade) & Fishing Shot (No-Grade..C)",
            "24h All-Day",
            "Proof of Catching a Fish (Warehouse & Common Craft Recipe Slot Expansion)",
        ),
        (
            "fishing-pier-02-glaze-barge-harbor",
            "Glaze-Barge Maritime & Airship Harbor Angler Jetty",
            "Maritime_Harbor_Pier",
            "zone-harbor-glaze-barge-airship-dock",
            "-89180:155380",
            "Fishing Guild Member Bleaker",
            "Purple Colored Lure (Fat Fish) & B-Grade Fishing Shot",
            "24h All-Day",
            "Proof of Catching a Fish (Inventory & Trade Slot Expansion Books)",
        ),
        (
            "fishing-pier-03-glaze-barge-quay",
            "Glaze-Barge River Quay Merchant Angler Wharf",
            "Maritime_Harbor_Pier",
            "zone-town-glaze-barge-quay",
            "-80980:151580",
            "Fishing Guild Member Cyan",
            "Yellow Colored Lure (Nimble Fish) & C-Grade Fishing Shot",
            "24h All-Day",
            "Pirate Treasure Map Chest, Fish Oil & Greater Fish Oil Crafting Materials",
        ),
        (
            "fishing-pier-04-pinion-terminus",
            "Pinion Terminus Steppe Seawall & Lock Pier",
            "Maritime_Harbor_Pier",
            "zone-town-pinion-terminus",
            "82620:148780",
            "Fishing Guild Member Pamfus",
            "Green High-Grade Lure & B-Grade Fishing Shot",
            "24h All-Day",
            "Proof of Catching a Fish (Dwarven Recipe Book & Private Store Slot Expansion)",
        ),
        (
            "fishing-pier-05-starfall-sky-harbor",
            "Starfall Haven Cloud-Basin Cascade Dock",
            "Maritime_Harbor_Pier",
            "zone-town-starfall-haven",
            "44020:-47720",
            "Fishing Guild Member Hilgendorf",
            "Prize-Winning Fishing Lure & A-Grade Fishing Shot",
            "24h All-Day",
            "Shiny Fish Gem, Monocle Hair Accessory & A-Grade Hair Pin Materials",
        ),
        (
            "fishing-pier-06-kelp-spiral-shoals",
            "Kelp Spiral Undertide Reef Coral Outrigger Pier",
            "Maritime_Harbor_Pier",
            "zone-field-kelp-spiral-reef",
            "-52180:-138420",
            "Fishing Guild Master Klaus",
            "Abyssal Purple Lure & S-Grade Fishing Shot",
            "24h All-Day",
            "Ancient Pirate King's Treasure Chest & S-Grade Fish Scale Gemstones",
        ),
        # 5 Luminous_Night_Lake
        (
            "fishing-lake-01-whispering-mire",
            "Whispering Teapot Mire Nocturnal Bioluminescent Lagoon",
            "Luminous_Night_Lake",
            "zone-field-whispering-mire",
            "-68180:228620",
            "Fishing Guild Member Mishini",
            "Luminous Lure (Green Nocturnal) & Night-Glow Bait",
            "00:00–06:00 Nocturnal Luminous",
            "High-Grade Nocturnal Nimble Fish (Zero-Miss NightBite Bonus) & Pearl Scales",
        ),
        (
            "fishing-lake-02-cobalt-sandbar",
            "Cobalt Sandbar River Delta Moonlit Estuary",
            "Luminous_Night_Lake",
            "zone-field-cobalt-sandbar-ford",
            "-73980:143020",
            "Fishing Guild Member O'Fulle",
            "Luminous Lure (Yellow Nocturnal) & C-Grade Fishing Shot",
            "00:00–06:00 Nocturnal Luminous",
            "Moonlit Fat Fish Chest, Black Pearl Ring Material & Proof of Catching a Fish",
        ),
        (
            "fishing-lake-03-chime-pipe-marsh",
            "Chime-Pipe Colonnade Starlight Mirror Pool",
            "Luminous_Night_Lake",
            "zone-field-chime-pipe-colonnade",
            "19120:24320",
            "Fishing Guild Member Willie",
            "Luminous Lure (Purple Nocturnal) & B-Grade Fishing Shot",
            "00:00–06:00 Nocturnal Luminous",
            "Nocturnal Ugly Fish Vault, Party Mask & Cat Ear Hair Accessory Blueprint",
        ),
        (
            "fishing-lake-04-siphon-canal",
            "Verdigris Siphon Mercury-Glow Reservoir Lake",
            "Luminous_Night_Lake",
            "zone-field-siphon-sluice",
            "64420:35020",
            "Fishing Guild Member Lanosco",
            "Luminous Lure (High-Grade Green) & A-Grade Fishing Shot",
            "00:00–06:00 Nocturnal Luminous",
            "Quicksilver Nocturnal Coelacanth & Proof of Catching a Fish (Max Inventory Cap)",
        ),
        (
            "fishing-lake-05-aurora-astral-basin",
            "Aurora Tether Astral Lady-of-the-Lake Sanctuary",
            "Luminous_Night_Lake",
            "zone-field-aurora-tether",
            "152640:31420",
            "Fishing Guild Member Linneaus",
            "Luminous Lure (Masterwork Purple) & S-Grade Fishing Shot",
            "00:00–06:00 Nocturnal Luminous",
            "Starlight Leviathan Fry, Romantic Chapeau & Feathered Hat Craft Tokens",
        ),
        # 5 Thermal_Hot_Spring
        (
            "fishing-spring-01-caldera-sulfur",
            "Mainspring Caldera Rim Sulfur & Malaria Geyser Pools",
            "Thermal_Hot_Spring",
            "zone-field-caldera-rim",
            "86620:61380",
            "Hot Springs Chef Jeremy & Guild Master Berix",
            "Hot Springs Rainbow Lure & Thermal Mineral Bait",
            "Thermal Mist Cycle",
            "Hot Springs Malaria Lv.4 (+16% Cast Spd / -8% MP Cost) & Rainbow Trout",
        ),
        (
            "fishing-spring-02-ginger-steam-bath",
            "Ginger-Steam Aqueduct Thermal Mineral Terrace",
            "Thermal_Hot_Spring",
            "zone-field-ginger-aqueduct-bridge",
            "-106580:59620",
            "Fishing Guild Member Kiki",
            "Spiced Thermal Lure & C-Grade Fishing Shot",
            "Thermal Mist Cycle",
            "Hot Springs Cholera Lv.4 (+10 Accuracy / +120 Crit Rate) & Ginger Carp",
        ),
        (
            "fishing-spring-03-firebrick-fumarole",
            "Firebrick Bellows Geothermal Fumarole Basin",
            "Thermal_Hot_Spring",
            "zone-field-firebrick-duct",
            "-38980:-105180",
            "Fishing Guild Member Batidae",
            "Volcanic Slag Lure & B-Grade Fishing Shot",
            "Thermal Mist Cycle",
            "Hot Springs Flu Lv.4 (+8% Atk Spd) & Magma-Scale Char Chest",
        ),
        (
            "fishing-spring-04-slag-chasm-vent",
            "Vitrified Slag Chasm Boiling Mineral Baths",
            "Thermal_Hot_Spring",
            "zone-field-slag-chasm",
            "25020:136420",
            "Fishing Guild Member Evert",
            "Obsidian Thermal Lure & B-Grade Fishing Shot",
            "Thermal Mist Cycle",
            "Hot Springs Rheumatism Lv.4 (+12 Evasion) & Mineral Cure Spring Water",
        ),
        (
            "fishing-spring-05-orrery-nebula-spa",
            "The Orrery Bridge Celestial Thermal Mist Sanctuary",
            "Thermal_Hot_Spring",
            "zone-field-orrery-bridge",
            "-28180:-107980",
            "Fishing Guild Grandmaster Santiago",
            "Celestial Mist Lure & S-Grade Fishing Shot",
            "Thermal Mist Cycle",
            "Ice Queen Freya's Frozen Rose Nectar, Hot Springs Malaria Lv.4 & Golden Koi",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for sid, sname, wcat, zid, dloc, npc, lure, twindow, reward in specs:
        rows.append(
            {
                "sanctuary_id": sid,
                "sanctuary_name": sname,
                "water_category": wcat,
                "zone_id": zid,
                "dock_loc": dloc,
                "guild_master_npc": npc,
                "recommended_lure": lure,
                "active_time_window": twindow,
                "primary_catch_reward": reward,
            }
        )
    return rows


def _build_cursed_weapon_pvp_hotspots(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 14 Cursed Weapon, PK Karma Redemption & Open-World PvP Arena Hotspots (5 Cursed_Weapon_Drop_Zone + 5 Black_Judge_Karma_Sanctuary + 4 Coliseum_PvP_Arena) (D33)."""
    specs = [
        # 5 Cursed_Weapon_Drop_Zone
        (
            "pvp-cursed-01-zariche-slag-chasm",
            "Vitrified Slag Chasm — Demonic Sword Zariche Awakening Crater",
            "Cursed_Weapon_Drop_Zone",
            "zone-field-slag-chasm",
            "25180:136540",
            "World-Broadcast Cursed Drop",
            "Demonic Sword Zariche (+100% CP/P.Atk · Red Sky World Broadcast)",
            "Lv.20–45 Contested Badlands",
            "Global red-sky lightning announces Zariche drop; wielder is immediately flagged Chaotic (999,999 Karma) with radar ping.",
        ),
        (
            "pvp-cursed-02-akamanah-brass-spur",
            "Brass-Spur Gear Ridge — Blood Sword Akamanah Twin-Blade Ridge",
            "Cursed_Weapon_Drop_Zone",
            "zone-field-brass-spur-ridge",
            "89540:138720",
            "World-Broadcast Cursed Drop",
            "Blood Sword Akamanah (Dual-Demonic Life-Drain Blades)",
            "Lv.30–55 Frontier Ridge",
            "Dual-sword blood-frenzy manifestation; every PK kill upgrades Akamanah Stage 1->10 while draining CP of nearby rivals.",
        ),
        (
            "pvp-cursed-03-zariche-leyden-causeway",
            "Leyden Capacitor Causeway — Zariche High-Voltage Blood Hunt",
            "Cursed_Weapon_Drop_Zone",
            "zone-field-leyden-causeway",
            "141580:-48220",
            "World-Broadcast Cursed Drop",
            "Demonic Sword Zariche (Stage 5+ Overcharged Soul Reaper)",
            "Lv.45–68 Grinding Corridor",
            "Open chokepoint bridge where Zariche wielders ambush AoE parties; normal players deal bonus hero-damage vs Cursed wielder.",
        ),
        (
            "pvp-cursed-04-akamanah-kelp-spiral",
            "Kelp Spiral Undertide Reef — Akamanah Crimson Tide Hunting Shoals",
            "Cursed_Weapon_Drop_Zone",
            "zone-field-kelp-spiral-reef",
            "-52040:-138260",
            "World-Broadcast Cursed Drop",
            "Blood Sword Akamanah (Pelagic Bloodlust Resonance)",
            "Lv.52–74 Undertide Shoals",
            "High-density pelagic monster packs accelerate initial Akamanah drop chance during twilight tide shifts.",
        ),
        (
            "pvp-cursed-05-zariche-akamanah-aurora",
            "Aurora Tether Span — Dual Cursed Weapon Clash & Sovereign Duel Span",
            "Cursed_Weapon_Drop_Zone",
            "zone-field-aurora-tether",
            "152780:31560",
            "World-Broadcast Cursed Drop",
            "Demonic Sword Zariche vs. Blood Sword Akamanah Apex Clash",
            "Lv.70–99 High-Halo Endgame",
            "When Zariche and Akamanah wielders enter within 300m on Aurora Tether, mutual CP-shatter aura triggers for instant 1v1 duel.",
        ),
        # 5 Black_Judge_Karma_Sanctuary
        (
            "pvp-karma-01-floran-saffron-freeport",
            "Saffron Press Lawless Outpost (Floran Village Zero-Guard Sanctuary)",
            "Black_Judge_Karma_Sanctuary",
            "zone-town-saffron-press",
            "17680:170340",
            "Zero-Guard Lawless Safe-Harbor",
            "Black Judge (Remove Sin Penalty & Death-Wound Lv.1–3)",
            "Lv.15–99 Red-Name Refuge",
            "Lineage II Floran Village archetype: zero aggressive Town Guards, full Red-Name PK warehouse/grocery access, and Black Judge sin cleansing.",
        ),
        (
            "pvp-karma-02-whispering-mire-camp",
            "Whispering Teapot Mire — Black Judge Penitents' Reed Camp",
            "Black_Judge_Karma_Sanctuary",
            "zone-field-whispering-mire",
            "-68080:228740",
            "Zero-Guard Lawless Safe-Harbor",
            "Black Judge & Sin-Eater Imp Companion Ritual",
            "Lv.15–40 Border Marsh",
            "Issues Penitents' Manacles to summon the Sin-Eater Imp that consumes character EXP to rapidly burn down high PK Karma.",
        ),
        (
            "pvp-karma-03-shanty-kiln-outlaw-fort",
            "Cinder-Apron Shanty Fortress — Outlaw & Red-Name Smuggler Bastion",
            "Black_Judge_Karma_Sanctuary",
            "zone-fortress-shanty-kiln",
            "-4920:134480",
            "Zero-Guard Lawless Safe-Harbor",
            "Black Judge & Smuggler Fence (Chaotic Gear Insurance)",
            "Lv.25–60 Badlands Haven",
            "Neutral smuggler bastion where Chaotic players with >5 PK count can stash unequipped items before washing Karma.",
        ),
        (
            "pvp-karma-04-spiral-wormway-penitent",
            "Spiral Wormway Quarry — Deep-Trench Black Judge Confessional",
            "Black_Judge_Karma_Sanctuary",
            "zone-field-spiral-wormway-ramp",
            "134520:-24320",
            "Zero-Guard Lawless Safe-Harbor",
            "Black Judge (Scroll of Recovery S-Grade & Karma Wash)",
            "Lv.45–75 Helical Trench",
            "Secluded quarry shrine for high-level PKs to clear Death Penalty Lv.1–15 and wash Karma on high-XP quarry golems.",
        ),
        (
            "pvp-karma-05-orrery-bridge-exile-shrine",
            "The Orrery Bridge — Astral Exile & Black Judge Absolution Altar",
            "Black_Judge_Karma_Sanctuary",
            "zone-field-orrery-bridge",
            "-28080:-107860",
            "Zero-Guard Lawless Safe-Harbor",
            "Black Judge Grand Arbiter (Noblesse/Endgame Sin Absolution)",
            "Lv.65–99 Sky-Span Exile",
            "High-altitude sanctuary on Continent 03 allowing Chaotic war-clans to regroup and cleanse Shillien's Breath death penalties.",
        ),
        # 4 Coliseum_PvP_Arena
        (
            "pvp-arena-01-kilnwatch-monster-track",
            "Kilnwatch Bastion — Monster Derby Track & Gludin/Dion PvP Ring",
            "Coliseum_PvP_Arena",
            "zone-town-kilnwatch-bastion",
            "-13920:123780",
            "Free-PvP No-EXP-Loss Arena",
            "Arena Director & Monster Track Manager",
            "Lv.10–99 Open Duel Ring",
            "Fenced inner arena inside the Monster Derby Track: stepping across the boundary line enables instant Free-PvP with zero Karma or EXP loss.",
        ),
        (
            "pvp-arena-02-escapement-anvil-giran-ring",
            "Escapement Anvil — Giran-Style Mercenary & Clan Skirmish Arena",
            "Coliseum_PvP_Arena",
            "zone-town-escapement-anvil",
            "83380:53480",
            "Free-PvP No-EXP-Loss Arena",
            "Arena Director (CP Recovery & Spectator Bleachers)",
            "Lv.25–99 Tournament Ring",
            "Classic Lineage II Giran Arena layout with safe spectator stands outside the rope perimeter and instant Arena CP restoration.",
        ),
        (
            "pvp-arena-03-inductor-aden-coliseum",
            "Inductor Switchyard — Grand Aden Underground Coliseum Amphitheater",
            "Coliseum_PvP_Arena",
            "zone-town-inductor-switchyard",
            "147680:-54920",
            "Free-PvP No-EXP-Loss Arena",
            "Coliseum Broadcasting Director (9v9 Party Tournament)",
            "Lv.40–99 Grand Coliseum",
            "Circular pillared amphitheater supporting 9v9 party tournaments, siege warmups, and zero-penalty clan GvG eliminations.",
        ),
        (
            "pvp-arena-04-crown-beacon-sky-ring",
            "Crown-Beacon Citadel — High-Halo Imperial Sky-Coliseum",
            "Coliseum_PvP_Arena",
            "zone-town-crown-beacon",
            "148180:27080",
            "Free-PvP No-EXP-Loss Arena",
            "Imperial Arena Marshal (S-Grade Hero & Sovereign Duels)",
            "Lv.76–99 Endgame Coliseum",
            "Apex open-world dueling ring overlooking the Star-Heart Spire with anti-zerg barrier gates and instant buff-recast obelisks.",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for hid, hname, pcat, zid, loc, rtag, feat, lband, tnote in specs:
        rows.append(
            {
                "hotspot_id": hid,
                "hotspot_name": hname,
                "pvp_category": pcat,
                "zone_id": zid,
                "loc": loc,
                "ruleset_tag": rtag,
                "featured_artifact_or_npc": feat,
                "recommended_level_band": lband,
                "tactical_note": tnote,
            }
        )
    return rows


def _build_dimensional_rift_sepulchers(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 16 Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctums across all 16 Multi-Floor Dungeons (6 Dimensional_Rift + 6 Four_Sepulchers + 4 Key_Gated_Chapel) (D34)."""
    specs = [
        # 6 Dimensional_Rift (Recruit, Soldier, Officer, Captain, Commander, Hero)
        (
            "rift-01-recruit-kiln-cellar",
            "Dimensional Rift [Recruit Lv.30+] — Kiln Cellar Breach",
            "Dimensional_Rift",
            "zone-dungeon-kiln-cellar",
            "zone-field-clover-south-gate",
            "B2",
            "75410:116820",
            "Dimensional Fragment (x18 Recruit Quota)",
            "2–9 Party Members (Rift Post Keeper)",
            "9m Room Shuffle (Max 4 Room Jumps + Anakazel Chance)",
            "D-Grade Enchant Scrolls & Sealed Accessories",
        ),
        (
            "rift-02-soldier-heretic-kiln",
            "Dimensional Rift [Soldier Lv.40+] — Heretic Kiln Nexus",
            "Dimensional_Rift",
            "zone-catacomb-heretic-kiln",
            "zone-field-apricot-aqueduct-terrace",
            "B2",
            "19800:173400",
            "Dimensional Fragment (x24 Soldier Quota)",
            "2–9 Party Members (Rift Post Keeper)",
            "9m Room Shuffle (Max 4 Room Jumps + Anakazel Lv.48)",
            "C-Grade Weapon/Armor Enchant Scrolls & Ancient Adena",
        ),
        (
            "rift-03-officer-branded-bellows",
            "Dimensional Rift [Officer Lv.50+] — Branded Bellows Rift Gate",
            "Dimensional_Rift",
            "zone-catacomb-branded-bellows",
            "zone-town-escapement-anvil",
            "B3",
            "112400:18200",
            "Dimensional Fragment (x30 Officer Quota)",
            "4–9 Party Members (Rift Post Keeper)",
            "9m Room Shuffle (Max 4 Room Jumps + Anakazel Lv.58)",
            "B-Grade Blessed Enchant Scrolls & Blue Wolf/Avadon Parts",
        ),
        (
            "rift-04-captain-apostate-dynamo",
            "Dimensional Rift [Captain Lv.60+] — Apostate Dynamo Fracture",
            "Dimensional_Rift",
            "zone-catacomb-apostate-dynamo",
            "zone-field-leyden-causeway",
            "B3",
            "149800:-51200",
            "Dimensional Fragment (x36 Captain Quota)",
            "5–9 Party Members (Rift Post Keeper)",
            "9m Room Shuffle (Max 4 Room Jumps + Anakazel Lv.68)",
            "A-Grade Weapon Blades, Dark Crystal/Tallum Fabrics & SA Stage 10",
        ),
        (
            "rift-05-commander-witch-pendulum",
            "Dimensional Rift [Commander Lv.70+] — Astral Witch Fold",
            "Dimensional_Rift",
            "zone-catacomb-witch-pendulum",
            "zone-town-starfall-haven",
            "B3",
            "54200:-34800",
            "Dimensional Fragment (x42 Commander Quota)",
            "6–9 Party Members (Rift Post Keeper)",
            "9m Room Shuffle (Max 4 Room Jumps + Anakazel Lv.78)",
            "A-Grade/S-Grade Enchant Scrolls & Soul Crystal Stage 11–12 Resonance",
        ),
        (
            "rift-06-hero-dark-omens-coral",
            "Dimensional Rift [Hero Lv.80+] — Deep Devotion Abyssal Rift",
            "Dimensional_Rift",
            "zone-catacomb-dark-omens-coral",
            "zone-field-kelp-spiral-reef",
            "B3",
            "38400:-28900",
            "Dimensional Fragment (x48 Hero Quota)",
            "7–9 Full Party (Hero Rift Steward)",
            "9m Room Shuffle (Apex Raid Boss Anakazel Lv.84 Sanctum)",
            "S-Grade Forgotten Blade / Arcana Mace Heads & Stage 13 SA Chance",
        ),
        # 6 Four_Sepulchers (Conquerors, Rulers, Great Sages, Judges, Pilgrims, Imperial Tomb)
        (
            "sepulcher-01-conquerors-forbidden-orrery",
            "Four Sepulchers — Sepulcher of Conquerors (Halisha Sanctum I)",
            "Four_Sepulchers",
            "zone-catacomb-forbidden-path-orrery",
            "zone-town-crown-beacon",
            "B3",
            "18400:-64200",
            "Entrance Pass to the Sepulcher + Chapel Key",
            "4–9 Party Members (Nameless Spirit)",
            "50m Wave Cycle (Opens Every Hour at :55..:00)",
            "Halisha's Mark, S-Grade Imperial Crusader Recipes & Brooch of the Marquis",
        ),
        (
            "sepulcher-02-rulers-star-heart-nave",
            "Four Sepulchers — Sepulcher of Rulers (Halisha Sanctum II)",
            "Four_Sepulchers",
            "zone-dungeon-star-heart-nave",
            "zone-field-aurora-tether",
            "3F",
            "149200:28400",
            "Entrance Pass to the Sepulcher + Scarab Key",
            "4–9 Party Members (Conquerors' Gatekeeper)",
            "50m Wave Cycle (Opens Every Hour at :55..:00)",
            "Shadow of Halisha Kill Credit, Draconic Bow Shafts & Goblet of Alectia",
        ),
        (
            "sepulcher-03-great-sages-chronometer-foundry",
            "Four Sepulchers — Sepulcher of Great Sages (Halisha Sanctum III)",
            "Four_Sepulchers",
            "zone-dungeon-chronometer-foundry",
            "zone-field-caldera-rim",
            "3F",
            "84800:56400",
            "Entrance Pass to the Sepulcher + Mystery Box Key",
            "4–9 Party Members (Great Sages' Spirit)",
            "50m Wave Cycle (Opens Every Hour at :55..:00)",
            "Major Arcana Robe 60% Recipes, Goblet of Tishas & Blessed S-Scrolls",
        ),
        (
            "sepulcher-04-judges-pendulum-shaft",
            "Four Sepulchers — Sepulcher of Judges (Halisha Sanctum IV)",
            "Four_Sepulchers",
            "zone-dungeon-pendulum-shaft",
            "zone-field-brass-spur-ridge",
            "3F",
            "85400:144200",
            "Entrance Pass to the Sepulcher + Executioner Key",
            "4–9 Party Members (Judges' Ghost Steward)",
            "50m Wave Cycle (Opens Every Hour at :55..:00)",
            "Goblet of Mekara, Heaven's Divider Edge & High-Grade Life Stones",
        ),
        (
            "sepulcher-05-pilgrims-sunken-potter",
            "Four Sepulchers — Pilgrim's Necropolis & Ghost of Wigoth Hall",
            "Four_Sepulchers",
            "zone-dungeon-sunken-potter-hold",
            "zone-field-cobalt-sandbar-ford",
            "B3",
            "-78400:149200",
            "Used Grave Pass & Four Goblets (Alectia/Tishas/Mekara/Morigul)",
            "4–9 Party Members (Ghost of Wigoth)",
            "50m Wave Cycle (Relic Exchange & Frintezza Pre-Trial)",
            "Antique Brooch (Unlocks 4-Sepulcher Direct Teleport) & Sealed S-Armor",
        ),
        (
            "sepulcher-06-imperial-mausoleum-ember-bellows",
            "Imperial Tomb Mausoleum — Scarlet van Halisha / Frintezza Force Field",
            "Four_Sepulchers",
            "zone-dungeon-ember-bellows-chamber",
            "zone-field-firebrick-duct",
            "B3",
            "-41200:-109800",
            "Frintezza's Magic Force Field Removal Scroll + Dewdrop of Destruction",
            "Command Channel (4–5 Parties / 36–45 Raiders)",
            "48h Imperial Mausoleum Reset Window",
            "Frintezza's Necklace (+15% Skill Reuse / +Stun/Bleed/Paralyze Resist)",
        ),
        # 4 Key_Gated_Chapel (Pagan Temple / Triol's Sanctum / Nornil Core)
        (
            "chapel-01-pagan-anteroom-ceramic-crypt",
            "Pagan Temple — Anteroom & Visitors' Mark Gate",
            "Key_Gated_Chapel",
            "zone-dungeon-ceramic-resonator-crypt",
            "zone-field-chime-pipe-colonnade",
            "B3",
            "15200:19400",
            "Pagan's Mark + Anteroom Key (Drops from Resurrected Temple Guards)",
            "Full 9-Player Holy-Buffed Party (Temple Mirror)",
            "Continuous Key-Gated Lock (15s Door Auto-Relock)",
            "A-Grade/S-Grade Life Stones & High-Density Undead AoE EXP",
        ),
        (
            "chapel-02-triol-altar-medallion-vault",
            "Pagan Temple — Chapel of Darkness & Triol's Revelation Altar",
            "Key_Gated_Chapel",
            "zone-dungeon-medallion-heart-vault",
            "zone-field-celadon-causeway",
            "B3",
            "49800:44100",
            "Key of Darkness + Pagan's Mark (Upgraded from Faded Visitor's Mark)",
            "Full 9-Player Party (Dagger Unlock / Key of Darkness)",
            "Continuous Key-Gated Lock (Chapel Inner Sanctum)",
            "Triol's Blood Weapon Parts, S-Grade Gemstones & Blessed Armor Scrolls",
        ),
        (
            "chapel-03-andreas-sanctum-sap-heart",
            "Pagan Temple — High Priestess van Halter / Andreas Inner Sanctum",
            "Key_Gated_Chapel",
            "zone-dungeon-sap-heart-cistern",
            "zone-field-resin-arch-tunnel",
            "B3",
            "119400:-174200",
            "Chapel Door Key + Blooded Pagan's Mark",
            "9–18 Player Raid Party (Altar Gatekeeper)",
            "24h High Priestess Sanctum Lockout",
            "Andreas van Halter's Sovereign Signet, S-Grade Recipes & SA Stage 12",
        ),
        (
            "chapel-04-nornil-core-spice-kiln",
            "Nornil's Garden Core — Spicula Zero & 3-Key Sealed Gatehouse",
            "Key_Gated_Chapel",
            "zone-dungeon-spice-kiln-cellar",
            "zone-field-cinnamon-bark-viaduct",
            "B3",
            "-115400:49100",
            "Red/Blue/Gold Nornil Gate Keys (3-Room Key Sequence)",
            "2–9 Party Members (Nornil Statue Steward)",
            "45m Instance Lockout & 3-Gate Key Sequence",
            "Nornil's Seed Bracelet, Blessed Enchant Scrolls & Spice-Core Alloy",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for (
        pid,
        pname,
        icat,
        did,
        pzid,
        fid,
        loc,
        key_tok,
        preq,
        cwin,
        srew,
    ) in specs:
        rows.append(
            {
                "portal_id": pid,
                "portal_name": pname,
                "instance_category": icat,
                "dungeon_id": did,
                "parent_zone_id": pzid,
                "floor_id": fid,
                "loc": loc,
                "entry_key_or_token": key_tok,
                "party_requirement": preq,
                "cycle_window": cwin,
                "signature_reward": srew,
            }
        )
    return rows


def _build_weapon_augmentation_dye_hubs(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 15 Town Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Hubs across all 15 Towns (D35)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_towns = (zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or [])
    town_by_id = {
        str(t.get("zone_id")): t
        for t in all_towns
        if isinstance(t, dict) and t.get("zone_id")
    }
    specs = [
        # 4 Standard_Life_Stone Towns
        (
            "augment-hub-01-lantern-hollow",
            "zone-town-lantern-hollow",
            "Blacksmith Refiner Kluto",
            "Symbol Maker Carson",
            "Standard_Life_Stone",
            "zone-field-clover-south-gate",
            "20 Gemstone D",
            [
                "Item Skill: Might (Passive Lv.3)",
                "Item Skill: Kiss of Eva (Active)",
                "Item Skill: Guidance (+Accuracy)",
            ],
            [
                "+4 STR / -4 CON (Early Melee Burst)",
                "+4 WIT / -4 MEN (Apprentice Fast Cast)",
                "+4 DEX / -4 STR (Scout Crit Rate)",
            ],
        ),
        (
            "augment-hub-02-porcelain-loom",
            "zone-town-porcelain-loom",
            "Blacksmith Refiner Aios",
            "Symbol Makerienna",
            "Standard_Life_Stone",
            "zone-field-celadon-causeway",
            "20 Gemstone D",
            [
                "Item Skill: Acumen (Passive Cast Spd)",
                "Item Skill: Clarity (Passive MP Cost -10%)",
                "Item Skill: Hydro Blast (Chance on Hit)",
            ],
            [
                "+4 WIT / -4 MEN (Lunar Mystic Cast)",
                "+4 INT / -4 MEN (Elemental Nuker)",
                "+4 MEN / -4 INT (Oracle MP Regen)",
            ],
        ),
        (
            "augment-hub-03-draft-kiln-post",
            "zone-town-draft-kiln-post",
            "Blacksmith Refiner Sumari",
            "Symbol Maker Kakai-Tattooist",
            "Standard_Life_Stone",
            "zone-field-firebrick-duct",
            "20 Gemstone D",
            [
                "Item Skill: Duel Might (Passive PvP P.Atk)",
                "Item Skill: Fire Burn (Active Nuke)",
                "Item Skill: Stun Resistance (+15%)",
            ],
            [
                "+4 STR / -4 DEX (Destroyer Cleave)",
                "+4 CON / -4 DEX (Titan HP Pool)",
                "+4 WIT / -4 INT (Warcryer Chant Speed)",
            ],
        ),
        (
            "augment-hub-04-root-train-roundhouse",
            "zone-town-root-train-roundhouse",
            "Blacksmith Refiner Silvera",
            "Symbol Maker Bronk-Scribe",
            "Standard_Life_Stone",
            "zone-field-resin-arch-tunnel",
            "20 Gemstone D",
            [
                "Item Skill: Weight Limit (Passive 2x Cap)",
                "Item Skill: EarthTremor (Active AoE)",
                "Item Skill: Shield Block (+12%)",
            ],
            [
                "+4 CON / -4 STR (Spoil Scavenger Tank)",
                "+4 STR / -4 CON (Artisan Polearm Sweep)",
                "+4 DEX / -4 CON (Haste Hammer Swing)",
            ],
        ),
        # 4 Mid_Grade_Life_Stone Towns
        (
            "augment-hub-05-carillon-belfry",
            "zone-town-carillon-belfry",
            "Blacksmith Refiner Karrod",
            "Symbol Maker Thalia-Ink",
            "Mid_Grade_Life_Stone",
            "zone-field-chime-pipe-colonnade",
            "25 Gemstone C",
            [
                "Item Skill: Empower (Passive M.Atk)",
                "Item Skill: Shadow Flare (Active Dark Nuke)",
                "Item Skill: Vampiric Rage (Passive Drain)",
            ],
            [
                "+4 INT / -4 MEN (Spellhowler Dark Burst)",
                "+4 WIT / -4 MEN (Phantom Fast Cast)",
                "+4 DEX / -4 CON (Abyss Walker Backstab)",
            ],
        ),
        (
            "augment-hub-06-cinnamon-mill",
            "zone-town-cinnamon-mill",
            "Blacksmith Refiner Feynn",
            "Symbol Maker Spice-Carver",
            "Mid_Grade_Life_Stone",
            "zone-field-cinnamon-bark-viaduct",
            "25 Gemstone C",
            [
                "Item Skill: Agility (Passive Evasion +4)",
                "Item Skill: Wind Strike (Chance Proc)",
                "Item Skill: Stealth (Active Shadow Ambush)",
            ],
            [
                "+4 DEX / -4 CON (Furral Skirmisher Crit)",
                "+4 STR / -4 CON (Soul Breaker Rapier)",
                "+4 CON / -4 DEX (Frontline Warder)",
            ],
        ),
        (
            "augment-hub-07-kilnwatch-bastion",
            "zone-town-kilnwatch-bastion",
            "Blacksmith Refiner Poitan",
            "Symbol Maker Croto",
            "Mid_Grade_Life_Stone",
            "zone-field-slag-chasm",
            "25 Gemstone C",
            [
                "Item Skill: Focus (Passive +85 Crit Rate)",
                "Item Skill: Blessed Body (Active Max HP)",
                "Item Skill: Hold (Active Root Proc)",
            ],
            [
                "+4 DEX / -4 CON (Hawkeye / Silver Ranger)",
                "+4 STR / -4 CON (Gladiator Sonic Burst)",
                "+4 CON / -4 STR (Paladin / Dark Avenger)",
            ],
        ),
        (
            "augment-hub-08-glaze-barge-quay",
            "zone-town-glaze-barge-quay",
            "Blacksmith Refiner Kluck",
            "Symbol Maker Reisa",
            "Mid_Grade_Life_Stone",
            "zone-field-cobalt-sandbar-ford",
            "25 Gemstone C",
            [
                "Item Skill: Kiss of Eva (Lung Capacity)",
                "Item Skill:Mana Gain (Passive +Recharge)",
                "Item Skill: Paralyze (Chance on Magic Hit)",
            ],
            [
                "+4 WIT / -4 MEN (Heine Bishop Fast Heal)",
                "+4 CON / -4 STR (Temple Knight Aegis)",
                "+4 DEX / -4 CON (Treasure Hunter Dash)",
            ],
        ),
        # 4 High_Grade_Life_Stone Towns
        (
            "augment-hub-09-saffron-press",
            "zone-town-saffron-press",
            "Blacksmith Refiner Pushkin",
            "Symbol MakerMAXIM",
            "High_Grade_Life_Stone",
            "zone-field-apricot-aqueduct-terrace",
            "20 Gemstone B",
            [
                "Item Skill: Duel Might (Active +15% PvP P.Atk)",
                "Item Skill: Medusa (AoE Petrify Proc)",
                "Item Skill: Lesser Celestial Shield (Invuln)",
            ],
            [
                "+4 STR / -4 CON (Outlaw PK Burst Build)",
                "+4 DEX / -4 CON (Plainswalker Crit/Evasion)",
                "+4 WIT / -4 MEN (Necromancer Anchor Cast)",
            ],
        ),
        (
            "augment-hub-10-pinion-terminus",
            "zone-town-pinion-terminus",
            "Blacksmith Refiner Rupio",
            "Symbol Maker Achim",
            "High_Grade_Life_Stone",
            "zone-field-brass-spur-ridge",
            "20 Gemstone B",
            [
                "Item Skill: Wild Magic (Passive +2 Magic Crit)",
                "Item Skill: Skill Refresh (Active -15% Reuse)",
                "Item Skill: Prayer (Passive Heal Power +12%)",
            ],
            [
                "+4 WIT / -4 MEN (Sorcerer / Spellsinger)",
                "+4 INT / -4 MEN (High M.Atk Siege Nuker)",
                "+4 CON / -4 STR (Cardinal Anti-Stun Setup)",
            ],
        ),
        (
            "augment-hub-11-escapement-anvil",
            "zone-town-escapement-anvil",
            "Blacksmith Refiner Tatabos",
            "Symbol Makerirk",
            "High_Grade_Life_Stone",
            "zone-field-caldera-rim",
            "25 Gemstone A",
            [
                "Item Skill: Spell Refresh (Active Magic Reuse)",
                "Item Skill: Clarity (Passive All Skills -15% MP)",
                "Item Skill: Reflect Damage (Passive 18% Return)",
            ],
            [
                "+4 STR / -4 DEX (Warlord AoE Polearm)",
                "+4 CON / -4 STR (Hell Knight Reflect Tank)",
                "+4 WIT / -4 MEN (Overlord Alliance Debuff)",
            ],
        ),
        (
            "augment-hub-12-inductor-switchyard",
            "zone-town-inductor-switchyard",
            "Blacksmith Refiner Ferris",
            "Symbol Maker Olsun",
            "High_Grade_Life_Stone",
            "zone-field-leyden-causeway",
            "25 Gemstone A",
            [
                "Item Skill: Celestial Shield (Active Invincibility)",
                "Item Skill: Refresh (Active All Reuse -15%)",
                "Item Skill: Heal Empower (Passive +Heal)",
            ],
            [
                "+4 WIT / -4 MEN (Archmage / Mystic Muse)",
                "+4 DEX / -4 CON (Sagittarius Crit Bow)",
                "+4 CON / -4 STR (Siege Vanguard Shield)",
            ],
        ),
        # 3 Top_Grade_Life_Stone Towns
        (
            "augment-hub-13-torque-balance-citadel",
            "zone-town-torque-balance-citadel",
            "Blacksmith Refiner Hilda",
            "Symbol MakerBaylor",
            "Top_Grade_Life_Stone",
            "zone-field-spiral-wormway-ramp",
            "25 Gemstone S",
            [
                "Item Skill: Duel Might (Passive Lv.10 +PvP P.Atk)",
                "Item Skill: Doom (Chance Silence All Skills)",
                "Item Skill: Music Refresh (Active Song/Dance)",
            ],
            [
                "+5 STR / -5 CON (Grand Khavatari / Titan)",
                "+4 CON / -4 DEX (Maestro Siege Golem)",
                "+4 DEX / -4 STR (Sword Muse / Spectral Dancer)",
            ],
        ),
        (
            "augment-hub-14-starfall-haven",
            "zone-town-starfall-haven",
            "Blacksmith Refiner Vincenz",
            "Symbol Maker Shakul",
            "Top_Grade_Life_Stone",
            "zone-field-kelp-spiral-reef",
            "25 Gemstone S",
            [
                "Item Skill: Wild Magic (Passive Lv.10 +M.Crit)",
                "Item Skill:Spell Clarity (Active -20% MP Cost)",
                "Item Skill: Battle Roar (Active +Max HP/Heal)",
            ],
            [
                "+4 WIT / +4 INT / -8 MEN (Storm Screamer Glass Cannon)",
                "+4 CON / +4 DEX / -8 STR (Eva's Templar Olympiad)",
                "+4 STR / +4 DEX / -8 CON (Ghost Hunter Lethal)",
            ],
        ),
        (
            "augment-hub-15-crown-beacon",
            "zone-town-crown-beacon",
            "Blacksmith Refiner Mammon-Envoy",
            "Symbol Maker Grand-Scribe",
            "Top_Grade_Life_Stone",
            "zone-field-aurora-tether",
            "25 Gemstone S",
            [
                "Item Skill: Celestial Shield (Active Sovereign Aegis)",
                "Item Skill: Refresh (Active Lv.10 All Skill Reuse)",
                "Item Skill: Wild Magic (Passive Lv.10 Apex Crit)",
            ],
            [
                "+4 WIT / +4 CON / -8 MEN (Olympiad Hero Archmage)",
                "+4 STR / +4 DEX / -8 CON (S-Grade Draconic/Basalt DPS)",
                "+4 CON / +4 MEN / -8 INT (Sovereign Siege Tank)",
            ],
        ),
    ]
    rows: list[dict[str, Any]] = []
    for idx, (hid, tzid, smith, sym_npc, lstier, drop_zid, gem_cost, aug_skills, dye_combos) in enumerate(specs, start=1):
        t_obj = town_by_id.get(tzid) or {}
        tname = str(t_obj.get("name", tzid))
        bx, by = _parse_loc(str(t_obj.get("loc_coord") or "-84120:243500"))
        anvil_loc = _fmt_loc(bx - 160 - idx * 8, by + 130 + idx * 6)
        rows.append(
            {
                "hub_id": hid,
                "town_zone_id": tzid,
                "town_name": tname,
                "blacksmith_refiner_npc": smith,
                "symbol_maker_npc": sym_npc,
                "anvil_loc": anvil_loc,
                "life_stone_tier": lstier,
                "life_stone_drop_zone_id": drop_zid,
                "gemstone_cost": gem_cost,
                "signature_augment_skills": aug_skills,
                "signature_dye_combos": dye_combos,
            }
        )
    return rows


def _build_companion_mount_sanctuaries(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 12 Pet, Strider & Castle Wyvern Mount Sanctuaries (4 Pet_Manager_Kennel + 4 Hatchling_Strider_Sanctum + 4 Castle_Wyvern_Roost) (D36)."""
    specs = [
        # 4 Pet_Manager_Kennel (Town Pet Manager Kennels)
        (
            "companion-kennel-01-lantern-lundy",
            "Lantern Hollow Kennel — Pet Manager Lundy's Wolf Sanctuary",
            "Pet_Manager_Kennel",
            "zone-town-lantern-hollow",
            "-83880:243720",
            "Pet Manager Lundy",
            "Wolf ➔ Great Wolf ➔ Fenrir (Riding Wolf Mount)",
            15,
            "Quest: Get a Pet (Lv.15 Animal Slayer Trial & Fang Collar)",
            "Evolves at Lv.55 into Great Wolf and Lv.70 into rideable Fenrir with +30% Bite P.Atk buff.",
        ),
        (
            "companion-kennel-02-kilnwatch-cooper",
            "Kilnwatch Bastion Kennel — Pet Manager Cooper's Buffalo Paddock",
            "Pet_Manager_Kennel",
            "zone-town-kilnwatch-bastion",
            "-14180:123980",
            "Pet Manager Cooper",
            "Baby Buffalo ➔ Improved Baby Buffalo (Melee Fighter Companion)",
            24,
            "Quest: Help the Uncle! (Lv.24 Waterside Pet Exchange Ticket: Buffalo)",
            "Auto-casts Fighter's Will, Blessed Body, Vampiric Rage & Battle Heal for melee grinders.",
        ),
        (
            "companion-kennel-03-escapement-martin",
            "Escapement Anvil Kennel — Pet Manager Martin's Kookaburra Aviary",
            "Pet_Manager_Kennel",
            "zone-town-escapement-anvil",
            "83120:53180",
            "Pet Manager Martin",
            "Baby Kookaburra ➔ Improved Baby Kookaburra (Mystic MP Charger)",
            25,
            "Quest: Help the Son! (Lv.25 Maille Lizardman Pet Exchange Ticket: Kookaburra)",
            "Provides active MP Recharge, Acumen, Empower & Blessed Soul for nonstop mage hunting.",
        ),
        (
            "companion-kennel-04-inductor-waters",
            "Inductor Switchyard Kennel — Pet Manager Waters' Cougar Menagerie",
            "Pet_Manager_Kennel",
            "zone-town-inductor-switchyard",
            "147420:-55180",
            "Pet Manager Waters",
            "Baby Cougar ➔ Improved Baby Cougar (Hybrid Crit/Mage Companion)",
            26,
            "Quest: Help the Sister! (Lv.26 Trimmed Minotaur Pet Exchange Ticket: Cougar)",
            "Hybrid companion casting Might, Shield, Focus, Death Whisper & emergency Greater Battle Heal.",
        ),
        # 4 Hatchling_Strider_Sanctum (Hatchling / Strider Evolution Sanctums)
        (
            "companion-strider-01-whispering-cronos",
            "Whispering Teapot Mire — Elder Cronos & Fairy Mymyu Hatchling Glade",
            "Hatchling_Strider_Sanctum",
            "zone-field-whispering-mire",
            "-67920:228880",
            "Elder Cronos & Fairy Mymyu",
            "Hatchling of Wind / Star / Twilight (Dragon Flute Summon)",
            35,
            "Quest: Little Wing (Lv.35 Craft Regular or Deluxe Fairy Stone for Mymyu)",
            "Unlocks Dragon Flute of Wind (Melee), Star (Siege/Support), or Twilight (High-Speed Mount).",
        ),
        (
            "companion-strider-02-chime-pipe-mymyu",
            "Chime-Pipe Colonnade — Tree of Wind & Fairy Mymyu Strider Grove",
            "Hatchling_Strider_Sanctum",
            "zone-field-chime-pipe-colonnade",
            "19280:24480",
            "Fairy Mymyu & Ancient Tree of Wind",
            "Strider of Wind (Fast Overland Cavalry Mount)",
            55,
            "Quest: Little Wing's Big Adventure (Lv.55 Hatchling Attack on 4 Fairy Trees)",
            "Transforms Dragon Flute into Bugle of Wind: rideable cavalry mount with Wild Stun & Dash.",
        ),
        (
            "companion-strider-03-caldera-star-tree",
            "Mainspring Caldera Rim — Tree of Star & Guardian Strider Sanctum",
            "Hatchling_Strider_Sanctum",
            "zone-field-caldera-rim",
            "86840:61520",
            "Guardian of the Star & Tree of Abyss",
            "Strider of Star (Siege Gate-Breaker & Heavy Pack Mount)",
            55,
            "Quest: Little Wing's Big Adventure (Lv.55 Apply Fairy Leaf to Star/Abyss Tree)",
            "Transforms Hatchling of Star into Bugle of Star with Siege Punch and high cargo capacity.",
        ),
        (
            "companion-strider-04-aurora-twilight-fenrir",
            "Aurora Tether Span — Astral Twilight Strider & Snow Fenrir Sanctum",
            "Hatchling_Strider_Sanctum",
            "zone-field-aurora-tether",
            "152880:31680",
            "Astral Beast-Tamer Rood",
            "Strider of Twilight & Great Snow Fenrir (Apex Ground Mounts)",
            70,
            "Lv.70 Great Wolf / Strider Awakening + Clan Hall Beast Insignia",
            "Maximum overland mount speed (+195 Spd) with zero casting penalty on dismount.",
        ),
        # 4 Castle_Wyvern_Roost (Castle/Citadel Wyvern Aerial Roosts across the 3 continents)
        (
            "companion-wyvern-01-kilnwatch-accord-roost",
            "Kilnwatch Accord Keep — Continent 01 Sovereign Wyvern Aerial Roost",
            "Castle_Wyvern_Roost",
            "zone-clanhall-kilnwatch-accord",
            "-18120:118420",
            "Wyvern Manager Schna",
            "Lord's Sovereign Wyvern (Continent 01 Aerial Keep)",
            55,
            "Clan Lord Sovereign Status + Mounted Strider Lv.55+ + 25 Crystals: B-Grade",
            "Full 3D aerial flight across Continent 01, bypassing castle walls and river chokepoints with Wyvern Breath.",
        ),
        (
            "companion-wyvern-02-dragonspine-cog-roost",
            "Dragonspine Cog Fortress — Continent 02 Ridge Wyvern Spire",
            "Castle_Wyvern_Roost",
            "zone-fortress-dragonspine-cog",
            "94280:142640",
            "Wyvern Manager Trond",
            "Lord's Sovereign Wyvern (Continent 02 Fortress Roost)",
            55,
            "Fortress/Castle Lord Crest + Mounted Strider Lv.55+ + 25 Crystals: B-Grade",
            "High-altitude aerial reconnaissance and siege bombardment over Brass-Spur Ridge and Oren/Giran.",
        ),
        (
            "companion-wyvern-03-inductor-conclave-roost",
            "Inductor Conclave Citadel — Capital Sovereign Wyvern Sky-Tower",
            "Castle_Wyvern_Roost",
            "zone-clanhall-inductor-conclave",
            "144620:-58180",
            "Wyvern Manager Titus",
            "Lord's Sovereign Wyvern (Capital Citadel Sky-Roost)",
            70,
            "Capital Citadel Sovereign + Mounted Strider Lv.55+ + Wyvern Food Tribute",
            "Grants aerial entry to the Tower of Insolence apex balcony and Aden Capital siege command.",
        ),
        (
            "companion-wyvern-04-cloud-halo-roost",
            "Cloud-Mountain Halo Fortress — Continent 03 Astral Wyvern Aerie",
            "Castle_Wyvern_Roost",
            "zone-fortress-cloud-halo",
            "158420:36280",
            "High Wyvern Marshal Zephyr",
            "Lord's Sovereign Wyvern (Continent 03 High-Halo Roost)",
            75,
            "High-Halo Sovereign + Mounted Strider Lv.55+ + 25 Crystals: B-Grade",
            "Sovereign aerial dominance over Continent 03 sky-spans with AoE Wyvern Flame Breath.",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for cid, nname, mcat, zid, loc, steward, species, lv_req, qreq, tben in specs:
        rows.append(
            {
                "companion_node_id": cid,
                "node_name": nname,
                "mount_category": mcat,
                "zone_id": zid,
                "loc": loc,
                "steward_npc_name": steward,
                "companion_species": species,
                "evolution_level_req": lv_req,
                "quest_or_tribute_req": qreq,
                "tactical_benefit": tben,
            }
        )
    return rows


def _build_clan_reputation_academies(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 14 Clan Progression & Pledge Nodes (5 Clan_Academy_Hall + 5 Clan_Ambition_Altar + 4 Pledge_Skill_Sanctum) (D37)."""
    specs = [
        # 5 Clan_Academy_Hall (Clan Academy Graduation & Clan Oath Armor Halls)
        (
            "clan-academy-01-lantern-hollow",
            "Lantern Hollow Grand Master Hall — Human & Fighter Clan Academy",
            "Clan_Academy_Hall",
            "zone-town-lantern-hollow",
            "-84320:243280",
            "Grand Master Ramos & Apprentice Tutor Pinter",
            "Clan Lv.5 Academy",
            "+400 CRP per Lv.40 2nd-Class Academy Graduate",
            [
                "Clan Oath Heavy/Light/Robe Armor Set (D-Grade)",
                "Academy Circlet (Zero EXP Loss Penalty Lv.1–39)",
                "20-Slot Clan Academy Regiment Roster",
            ],
        ),
        (
            "clan-academy-02-kilnwatch-bastion",
            "Kilnwatch Bastion Convergence Academy — All-Race Oath Armor Hall",
            "Clan_Academy_Hall",
            "zone-town-kilnwatch-bastion",
            "-14420:123280",
            "High Prefect Levian & Master Tobald",
            "Clan Lv.5 Academy",
            "+400 CRP per Academy Graduate (+150 Bonus CRP from Lv.16 Sponsor)",
            [
                "Clan Oath Armor Set (D-Grade +P.Def/MP Regen Set Bonus)",
                "Sponsor-Apprentice Bond Ring (Instant Recall to Sponsor)",
                "Commemorative Academy Graduation Tiara",
            ],
        ),
        (
            "clan-academy-03-escapement-anvil",
            "Escapement Anvil Guild Hall — Stage D Trial & Academy Charter",
            "Clan_Academy_Hall",
            "zone-town-escapement-anvil",
            "82920:53420",
            "Grand Master Maximilian & High Priest Hollint",
            "Clan Lv.5 Academy",
            "+400 CRP per 2nd-Class Promotion Graduate",
            [
                "Clan Oath Armor Set (D-Grade) via Sponsor Quest: Lead and Be Led",
                "Reduced 2nd-Class Trial Token Cost for Academy Recruits",
                "Academy Graduate CRP Milestone Bonus",
            ],
        ),
        (
            "clan-academy-04-inductor-switchyard",
            "Inductor Switchyard Trade Guild — Royal Guard & Academy Registry",
            "Clan_Academy_Hall",
            "zone-town-inductor-switchyard",
            "147180:-55420",
            "Grand Master Jurek & Warehouse Chief Gesto",
            "Clan Lv.6 Royal Guard",
            "5,000 CRP + 30 Academy Graduates (Unlocks 1st & 2nd Royal Guard)",
            [
                "1st & 2nd Royal Guard Sub-Unit (20 Members Each)",
                "Expanded Clan Capacity (Up to 100 Active Pledge Members)",
                "Clan Oath Armor Set (D-Grade) & Clan Imperium Eligibility",
            ],
        ),
        (
            "clan-academy-05-starfall-haven",
            "Starfall Haven Sky-Guild — Continent 03 Vanguard Academy Hall",
            "Clan_Academy_Hall",
            "zone-town-starfall-haven",
            "43580:-48120",
            "Grand Magister Valdis & High Prefect Karia",
            "Clan Lv.6 Royal Guard",
            "+650 CRP per Elite Academy Graduate + 100 Blood Marks",
            [
                "Clan Oath Armor Set (D-Grade) & Apella Armor Eligibility",
                "Sky-Harbor Clan Warehouse & Airship Dock Charter",
                "Royal Guard Captain Crest & Command Channel Access",
            ],
        ),
        # 5 Clan_Ambition_Altar (Clan Level 5..8 Ambition Quest Altars)
        (
            "clan-ambition-01-cinder-apron-martyrs",
            "Cinder Apron Viaduct — Altar of Sir Gustaf's Proof of Clan Alliance",
            "Clan_Ambition_Altar",
            "zone-field-cinder-apron",
            "-6180:132120",
            "Sir Gustaf Athebaldt & Witch Athrea",
            "Clan Lv.4–5 Ambition",
            "3,500,000 SP + 3 Loyalist Poison Antidote Herbs (Lord Sacrifice)",
            [
                "Alliance Manifesto (Unlocks Clan Level 4 & Castle Siege Registration)",
                "Clan Crest & Alliance Crest Banner Entitlement",
                "Pledge Death Penalty Reduction Lv.1",
            ],
        ),
        (
            "clan-ambition-02-caldera-drake-eggs",
            "Mainspring Caldera Rim — Grave of the Dwarven Scouts & Drake Egg Altar",
            "Clan_Ambition_Altar",
            "zone-field-caldera-rim",
            "86640:61420",
            "Sir Kristof Rodemai & Head Blacksmith Roman",
            "Clan Lv.5 Academy",
            "Seal of Aspiration (Pursuit of Clan Ambition: 40 Drake/Wyrm Eggs)",
            [
                "Clan Level 5 Unlock (Founding of the Clan Academy)",
                "Clan Imperium (Command Channel for Multi-Party Raids)",
                "Clan Hall Auction & Fortress Siege Eligibility",
            ],
        ),
        (
            "clan-ambition-03-spiral-wormway-scepter",
            "Spiral Wormway Ramp — Imperial Graveyard Scepter of Judgment Altar",
            "Clan_Ambition_Altar",
            "zone-field-spiral-wormway-ramp",
            "134480:-24380",
            "Sir Eric Rodemai & Witch Cleo",
            "Clan Lv.6 Royal Guard",
            "10,000 CRP + 100 Blood Oaths (Fortress Tribute)",
            [
                "Clan Level 6 Unlock & 2 Royal Guard Divisions",
                "Clan Shield Defense Lv.2 & Clan Magic Barrier Lv.2",
                "Apella Combat/Plate/Brigandine/Doublet Armor Access",
            ],
        ),
        (
            "clan-ambition-04-orrery-bridge-oath",
            "The Orrery Bridge — Astral Blood Alliance & Order of Knights Altar",
            "Clan_Ambition_Altar",
            "zone-field-orrery-bridge",
            "-28120:-107940",
            "High Inquisitor Kalis & Herald of the Knights",
            "Clan Lv.7 Order of Knights",
            "20,000 CRP + 120 Member Roster + 10 Blood Alliances",
            [
                "Clan Level 7 Unlock & 4 Order of Knights Divisions (10 Knights Each)",
                "Knighthood Baron / Viscount Social Rank Entitlement",
                "Clan Vitality Lv.3 (+Max HP) & Clan Spirituality Lv.3 (+Max MP)",
            ],
        ),
        (
            "clan-ambition-05-aurora-tether-sovereign",
            "Aurora Tether Span — High-Halo Sovereign Crown &Lv.8 Pledge Altar",
            "Clan_Ambition_Altar",
            "zone-field-aurora-tether",
            "152620:31440",
            "Grand Chamberlain Ilia & Sovereign Arbiter",
            "Clan Lv.8 Sovereign",
            "40,000 CRP + 140 Member Roster + 100 Blood Oaths / Alliances",
            [
                "Clan Level 8 Apex Sovereign Status (Max 140 Clan Members)",
                "Full Tier-3 Passive Pledge Skill Tree Unlock",
                "Sovereign Castle Wyvern & Capital Citadel Tax Dominance",
            ],
        ),
        # 4 Pledge_Skill_Sanctum (Apella Armor & Pledge Skill Sanctums across the 3 continents)
        (
            "clan-sanctum-01-kilnwatch-accord-pledge",
            "Kilnwatch Accord Clan Hall — Continent 01 Apella & Pledge Skill Sanctum",
            "Pledge_Skill_Sanctum",
            "zone-clanhall-kilnwatch-accord",
            "-13620:124320",
            "Court Wizard Mulia & Rapidus (Clan Trader)",
            "Clan Lv.6 Royal Guard",
            "1,500–8,600 CRP + Earth/Angelic Eggs (Raid Boss Soul Drops)",
            [
                "Apella Plate / Brigandine / Doublet Set (A-Grade Zero PK Drop)",
                "Clan Body Lv.3 (+6% Max HP) & Clan Shield Defense Lv.3",
                "Clan Imperium (Multi-Party Command Channel Coordination)",
            ],
        ),
        (
            "clan-sanctum-02-inductor-conclave-pledge",
            "Inductor Conclave Citadel — Continent 02 Pledge Skill & Egg Altar",
            "Pledge_Skill_Sanctum",
            "zone-clanhall-inductor-conclave",
            "148320:-54580",
            "Grand MagisterScipio & Clan Trader Hullia",
            "Clan Lv.7 Order of Knights",
            "3,000–12,000 CRP + Dragon Hearts & False Nuclei of Life",
            [
                "Clan Might Lv.3 (+6% P.Atk) & Clan Empower Lv.3 (+10% M.Atk)",
                "Clan Magic Barrier Lv.3 & Clan Clarity Lv.3 (-MP Cost)",
                "Apella Masterwork Combat Armor Exchange",
            ],
        ),
        (
            "clan-sanctum-03-torque-balance-pledge",
            "Torque-Balance Citadel — Aden Imperial Pledge Skill & Seal Sanctum",
            "Pledge_Skill_Sanctum",
            "zone-town-torque-balance-citadel",
            "116640:-18160",
            "High Priest Orven & Grand Master Sedrick",
            "Clan Lv.7 Order of Knights",
            "5,000–15,000 CRP +Cradle of Creation & Destruction",
            [
                "Clan Guidance Lv.3 (+Accuracy) & Clan Agility Lv.3 (+Evasion)",
                "Clan Cyclonic/Magma/Withstand-Attack Elemental Resistances",
                "Clan Morale Lv.3 (CP Regeneration in Siege Zones)",
            ],
        ),
        (
            "clan-sanctum-04-crown-beacon-pledge",
            "Crown-Beacon Citadel — Continent 03 Sovereign Pledge Skill Sanctum",
            "Pledge_Skill_Sanctum",
            "zone-town-crown-beacon",
            "148140:27040",
            "Imperial Chancellor Valon & High Priestess Morelyn",
            "Clan Lv.8 Sovereign",
            "10,000–25,000 CRP + Skull of the Dead & Angel's Soul",
            [
                "Clan Lifeblood Lv.3 & Clan March Lv.2 (+Movement Speed)",
                "Clan Luck Lv.3 (Drastic EXP Loss Reduction on PvP/Raid Death)",
                "Sovereign Apella Crown & Full 22-Skill Pledge Mastery",
            ],
        ),
    ]
    rows: list[dict[str, Any]] = []
    for cid, nname, pcat, zid, loc, npc, ctier, crp, benefits in specs:
        rows.append(
            {
                "clan_node_id": cid,
                "node_name": nname,
                "pledge_category": pcat,
                "zone_id": zid,
                "loc": loc,
                "high_prefect_or_grand_master_npc": npc,
                "clan_level_tier": ctier,
                "crp_yield_or_cost": crp,
                "unlocked_pledge_benefits": benefits,
            }
        )
    return rows


def _build_field_herb_elemental_biomes(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 24 Field Elemental Attribute & Ground Herb Sustainability Biomes across all 24 field zones (D38)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    fields = zdir.get("fields_and_hunting_areas") or []
    field_by_id = {
        str(f.get("zone_id")): f
        for f in fields
        if isinstance(f, dict) and f.get("zone_id")
    }
    specs = [
        (
            "biome-01-clover-south-gate",
            "zone-field-clover-south-gate",
            "Earth",
            "Wind +25% Dmg vs Meadow Golems & Keltirs",
            "S_Tier_Zero_Downtime",
            [
                "Herb of Life (Instant +35% HP)",
                "Herb of Warrior (Haste + Might Lv.2)",
                "Superior Giant's Herb (2m Full Fighter Buff)",
            ],
            58,
            "S-Tier Zero-Downtime 1x HP meadow mobs; continuous ground herb drops eliminate potion costs for Lv.1–12 solo starters.",
        ),
        (
            "biome-02-kiln-east-orchard",
            "zone-field-kiln-east-orchard",
            "Fire",
            "Water +25% Dmg vs Kiln Sprites & Glaze Hounds",
            "S_Tier_Zero_Downtime",
            [
                "Herb of Life",
                "Herb of Mana (Instant +28% MP)",
                "Herb of Speed (Wind Walk Lv.2)",
            ],
            54,
            "High-density orchard packs drop abundant HP/MP herbs for fast Lv.5–14 solo and duo convergence progression.",
        ),
        (
            "biome-03-celadon-causeway",
            "zone-field-celadon-causeway",
            "Water",
            "Wind +25% Dmg vs Celadon Toads & Undines",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Greater Herb of Mana (Instant +50% MP)",
                "Herb of Mystic (Acumen Lv.3 + Empower Lv.3)",
                "Herb of Magic",
            ],
            52,
            "Mystic-friendly causeway where 1x HP elemental sprites drop Greater Herbs of Mana for nonstop nuke casting.",
        ),
        (
            "biome-04-firebrick-duct",
            "zone-field-firebrick-duct",
            "Fire",
            "Water +25% Dmg vs Firebrick Salamanders",
            "S_Tier_Zero_Downtime",
            [
                "Greater Herb of Life",
                "Herb of Warrior (Vampiric Rage + Fury)",
                "Herb of Critical Attack",
            ],
            55,
            "Brawler-optimized thermal duct where Vampiric Rage and Critical herbs sustain continuous Ogre/Fighter melee chains.",
        ),
        (
            "biome-05-resin-arch-tunnel",
            "zone-field-resin-arch-tunnel",
            "Earth",
            "Wind +25% Dmg vs Resin Beetles & Root Tarantulas",
            "S_Tier_Zero_Downtime",
            [
                "Herb of Life",
                "Herb of Mana",
                "Herb of Defense (Shield Lv.3)",
            ],
            50,
            "Dwarf spoil-scavenger paradise: Herb of Mana refills Sweeper/Spoil MP pools with zero sitting downtime.",
        ),
        (
            "biome-06-cobalt-sandbar-ford",
            "zone-field-cobalt-sandbar-ford",
            "Water",
            "Wind +25% Dmg vs River Striders & Crokian Scouts",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Greater Herb of Mana",
                "Herb of Casting Speed (Acumen Lv.3)",
                "Herb of Life",
            ],
            46,
            "Open river sandbars with long sightlines and rich Mystic/Mana herb drops ideal for ranged nukers and archers.",
        ),
        (
            "biome-07-chime-pipe-colonnade",
            "zone-field-chime-pipe-colonnade",
            "Wind",
            "Earth +25% Dmg vs Whispering Harpies & Sylphs",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Herb of Mana",
                "Herb of Mystic (Empower + Acumen)",
                "Superior Herb of Life",
            ],
            51,
            "Acoustic marshland yielding high-frequency Mystic herbs for Dark-Lunar spellcasters and summoners.",
        ),
        (
            "biome-08-apricot-aqueduct-terrace",
            "zone-field-apricot-aqueduct-terrace",
            "Holy",
            "Dark +25% Dmg vs Sanctuary Sentinels",
            "S_Tier_Zero_Downtime",
            [
                "Superior Giant's Herb (2m Full Buff)",
                "Herb of Life",
                "Herb of Warrior (Haste + Focus)",
            ],
            56,
            "Terraced manor fields with top-tier Giant's Herb drops that enable solo seed-harvesters to chain-pull effortlessly.",
        ),
        (
            "biome-09-cinnamon-bark-viaduct",
            "zone-field-cinnamon-bark-viaduct",
            "Wind",
            "Earth +25% Dmg vs Bark-Glider Raptors",
            "S_Tier_Zero_Downtime",
            [
                "Herb of Speed (Wind Walk Lv.2)",
                "Herb of Warrior",
                "Herb of Life",
            ],
            60,
            "Highest starter herb drop rate (60%) on Continent 01, tailored for Furral skirmishers and daggers.",
        ),
        (
            "biome-10-ginger-aqueduct-bridge",
            "zone-field-ginger-aqueduct-bridge",
            "Fire",
            "Water +25% Dmg vs Steam-Pipe Constructs",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Herb of Mana",
                "Herb of Life",
                "Herb of Alacrity",
            ],
            48,
            "Balanced hybrid herb table supporting both solo melee progression and duo spoiler-mage partners.",
        ),
        (
            "biome-11-cinder-apron",
            "zone-field-cinder-apron",
            "Dark",
            "Holy +30% Dmg vs Undead Cinder Legionnaires",
            "B_Tier_Party_Tough_Mobs",
            [
                "Greater Herb of Life",
                "Greater Herb of Mana",
                "Herb of Recovery (Cure Poison/Bleed)",
            ],
            30,
            "2x–3x HP Undead/Construct bridge field; lower herb rate (30%) rewards Bishop/Elven Elder Holy nukes and small parties.",
        ),
        (
            "biome-12-brass-spur-ridge",
            "zone-field-brass-spur-ridge",
            "Earth",
            "Wind +25% Dmg vs Brass-Spur Clockwork Automats",
            "S_Tier_Zero_Downtime",
            [
                "Superior Giant's Herb (2m Full Buff)",
                "Greater Herb of Life",
                "Herb of Warrior",
            ],
            49,
            "Continent 02 frontier ridge with generous Giant's Herbs allowing Lv.20–26 soloists to farm without out-of-party buffers.",
        ),
        (
            "biome-13-caldera-rim",
            "zone-field-caldera-rim",
            "Fire",
            "Water +30% Dmg vs Caldera Wyrms & Magma Drakes",
            "B_Tier_Party_Tough_Mobs",
            [
                "Greater Herb of Life",
                "Herb of Fire Resistance",
                "Herb of Warrior",
            ],
            26,
            "Tough 2x HP draconic mobs for 2nd-class trials; bring a trio or Water-infused weapons alongside ground Life herbs.",
        ),
        (
            "biome-14-leyden-causeway",
            "zone-field-leyden-causeway",
            "Wind",
            "Earth +25% Dmg vs Leyden Arc-Stalkers",
            "S_Tier_Zero_Downtime",
            [
                "Superior Herb of Life",
                "Superior Herb of Mana",
                "Superior Giant's Herb (2m Full Buff)",
            ],
            53,
            "Premier Lv.30–40 solo grinding highway (Death Pass analog) with nonstop Superior Herbs for post-2nd-class leveling.",
        ),
        (
            "biome-15-tether-causeway",
            "zone-field-tether-causeway",
            "Holy",
            "Dark +25% Dmg vs Astral Tether Watchers",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Superior Herb of Mana",
                "Herb of Mystic (Empower Lv.3 + Wild Magic)",
                "Greater Herb of Life",
            ],
            45,
            "Continent 03 arrival causeway where Wild Magic and Superior Mana herbs fuel C/B-grade spellhowlers and necromancers.",
        ),
        (
            "biome-16-aurora-tether",
            "zone-field-aurora-tether",
            "Holy",
            "Dark +30% Dmg vs High-Halo Seraphim & Nephilim",
            "B_Tier_Party_Tough_Mobs",
            [
                "Superior Herb of Life",
                "Superior Herb of Mana",
                "Herb of Doubt (AoE Over-hit Bonus)",
            ],
            22,
            "Endgame 4x HP angelic/astral elites (Lv.55–85); low herb drop rate requires full 9-player Command Channel or Covenant buffs.",
        ),
        (
            "biome-17-whispering-mire",
            "zone-field-whispering-mire",
            "Dark",
            "Holy +30% Dmg vs Marsh Phantoms & Mire Zombies",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Greater Herb of Mana",
                "Herb of Mystic",
                "Herb of Recovery (Anti-Venom)",
            ],
            47,
            "Undead marshland where Clerics/Oracles and mages chain-cast Disrupt Undead with abundant ground MP herbs.",
        ),
        (
            "biome-18-slag-chasm",
            "zone-field-slag-chasm",
            "Earth",
            "Wind +25% Dmg vs Vitrified Slag Basilisks",
            "B_Tier_Party_Tough_Mobs",
            [
                "Greater Herb of Life",
                "Herb of Defense",
                "Herb of Warrior",
            ],
            28,
            "Reinforced carapace monsters in the Kilnwatch badlands; best tackled by duo spoilers and polearm sweepers.",
        ),
        (
            "biome-19-astrolabe-rift",
            "zone-field-astrolabe-rift",
            "Wind",
            "Earth +25% Dmg vs Rift Gargoyles & Wind Shriekers",
            "S_Tier_Zero_Downtime",
            [
                "Superior Giant's Herb (2m Full Buff)",
                "Greater Herb of Life",
                "Herb of Critical Attack",
            ],
            50,
            "Brittle 1/2x HP winged gargoyles shatter quickly and drop frequent Giant's Herbs for rapid solo EXP/hr.",
        ),
        (
            "biome-20-siphon-sluice",
            "zone-field-siphon-sluice",
            "Water",
            "Wind +30% Dmg vs Mercury Sluice Elementals",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Superior Herb of Mana",
                "Herb of Mystic",
                "Greater Herb of Life",
            ],
            44,
            "Elemental canal lock prized by Spellsingers and Elemental Summoners for its high Superior Mana herb yield.",
        ),
        (
            "biome-21-metronome-bridge",
            "zone-field-metronome-bridge",
            "Dark",
            "Holy +30% Dmg vs Execution Grounds Specters",
            "S_Tier_Zero_Downtime",
            [
                "Greater Herb of Life",
                "Greater Herb of Mana",
                "Herb of Warrior (Vampiric Rage)",
            ],
            49,
            "Highland undead/construct crossing with steady Vampiric and Mana herbs enabling zero-rest solo grinding at Lv.34–36.",
        ),
        (
            "biome-22-spiral-wormway-ramp",
            "zone-field-spiral-wormway-ramp",
            "Dark",
            "Holy +30% Dmg vs Imperial Graveyard Liches",
            "B_Tier_Party_Tough_Mobs",
            [
                "Superior Herb of Life",
                "Superior Herb of Mana",
                "Herb of Mystic",
            ],
            25,
            "Deep helical quarry trench with social aggro undead packs; designed for AoE polearm/mage parties with Holy buffs.",
        ),
        (
            "biome-23-orrery-bridge",
            "zone-field-orrery-bridge",
            "Holy",
            "Dark +25% Dmg vs Refractory Light-Golems",
            "A_Tier_Mystic_Mana_Rich",
            [
                "Superior Herb of Mana",
                "Superior Giant's Herb (2m Full Buff)",
                "Herb of Mystic",
            ],
            43,
            "Sky-span bridge on Continent 03 where Dark-attribute mages and archers sustain long farm sessions off ground herbs.",
        ),
        (
            "biome-24-kelp-spiral-reef",
            "zone-field-kelp-spiral-reef",
            "Water",
            "Wind +30% Dmg vs Bioluminescent Reef Krakens",
            "B_Tier_Party_Tough_Mobs",
            [
                "Superior Herb of Life",
                "Superior Herb of Mana",
                "Herb of Aquatic Brilliance",
            ],
            24,
            "High-density aquatic shoals dropping Life Stones and A/S-grade materials; party sustain augmented by Superior Herbs.",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for bid, fzid, dom_elem, counter_bon, htier, sherbs, drate, snote in specs:
        f_obj = field_by_id.get(fzid) or {}
        fname = str(f_obj.get("name", fzid))
        rows.append(
            {
                "biome_id": bid,
                "field_zone_id": fzid,
                "field_name": fname,
                "dominant_element": dom_elem,
                "counter_element_bonus": counter_bon,
                "herb_drop_tier": htier,
                "signature_herbs": sherbs,
                "herb_drop_rate_pct": drate,
                "solo_sustainability_note": snote,
            }
        )
    return rows


def _build_soulshot_workshop_plazas(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 15 Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Plazas across all 15 Towns (D39)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_towns = (zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or [])
    town_by_id = {
        str(t.get("zone_id")): t
        for t in all_towns
        if isinstance(t, dict) and t.get("zone_id")
    }
    specs = [
        # 6 Starter_D_C_Plaza Towns (Starter_D_C_Plaza)
        (
            "workshop-01-lantern-hollow",
            "zone-town-lantern-hollow",
            "Starter_D_C_Plaza",
            "Head Blacksmith Kluto & Master Warsmith Pinter",
            [
                "Soulshot D-Grade & C-Grade Compressed Pack",
                "Blessed Spiritshot D-Grade & C-Grade Compressed Pack",
                "Beast Soulshot & Summon Spiritshot Pack",
            ],
            "100% D-Grade & 60% C-Grade Saber / Brigandine Recipes",
            "zone-field-clover-south-gate",
            12500,
            "3 Crystal D + 9 Soul Ore -> 468 D-Soulshots",
        ),
        (
            "workshop-02-porcelain-loom",
            "zone-town-porcelain-loom",
            "Starter_D_C_Plaza",
            "Head Blacksmith Aios & Elven Master Artisan",
            [
                "Blessed Spiritshot D-Grade & C-Grade Compressed Pack",
                "Spiritshot D/C Mystic Resonance Pack",
                "Soulshot D-Grade Elven Scout Pack",
            ],
            "100% D-Grade & 60% C-Grade Homunkulus / Karmian Tunic Recipes",
            "zone-field-celadon-causeway",
            14000,
            "2 Crystal D + 8 Spirit Ore -> 200 Blessed D-Spiritshots",
        ),
        (
            "workshop-03-draft-kiln-post",
            "zone-town-draft-kiln-post",
            "Starter_D_C_Plaza",
            "Head Blacksmith Sumari & Flame-Anvil Warsmith",
            [
                "Soulshot D-Grade & C-Grade Heavy Brawler Pack",
                "Compressed Soulshot C-Grade (3,000 Rounds)",
                "Blessed Spiritshot D-Grade Warcryer Pack",
            ],
            "100% D-Grade & 60% C-Grade Chakram / Composite Armor Recipes",
            "zone-field-firebrick-duct",
            15000,
            "1 Crystal C + 15 Soul Ore -> 476 C-Soulshots",
        ),
        (
            "workshop-04-root-train-roundhouse",
            "zone-town-root-train-roundhouse",
            "Starter_D_C_Plaza",
            "Iron Gate Chief Bronk & Head Blacksmith Silvera",
            [
                "Soulshot D/C Greater Compressed Crate (10,000 Rounds)",
                "Blessed Spiritshot D/C Compressed Crate",
                "Mechanical Golem Siege Shot & Beast Soulshot",
            ],
            "100% D/C-Grade Dwarven Polearm, Yaksa Mace & Mithril Alloy Recipes",
            "zone-field-resin-arch-tunnel",
            9500,
            "2 Crystal C + 30 Soul Ore -> 952 C-Soulshots (Dwarven Home Guild Rate)",
        ),
        (
            "workshop-05-carillon-belfry",
            "zone-town-carillon-belfry",
            "Starter_D_C_Plaza",
            "Head Blacksmith Karrod & Abyssal Forge-Keeper",
            [
                "Blessed Spiritshot D-Grade & C-Grade Dark Caster Pack",
                "Soulshot D-Grade & C-Grade Assassin Pack",
                "Compressed Spiritshot C-Grade Pack",
            ],
            "100% D-Grade & 60% C-Grade Crystal Dagger / Demon's Tunic Recipes",
            "zone-field-chime-pipe-colonnade",
            14500,
            "2 Crystal C + 22 Spirit Ore -> 200 Blessed C-Spiritshots",
        ),
        (
            "workshop-06-cinnamon-mill",
            "zone-town-cinnamon-mill",
            "Starter_D_C_Plaza",
            "Head Blacksmith Feynn & Furral Blade-Factor",
            [
                "Soulshot D-Grade & C-Grade Skirmisher Pack",
                "Compressed Soulshot D/C Rapid-Fire Quiver Pack",
                "Beast Soulshot & Companion Fang Pack",
            ],
            "100% D-Grade & 60% C-Grade Eminence Bow / Theca Leather Recipes",
            "zone-field-cinnamon-bark-viaduct",
            13500,
            "3 Crystal D + 9 Soul Ore -> 468 D-Soulshots",
        ),
        # 5 Regional_B_A_Workshop Towns (Regional_B_A_Workshop)
        (
            "workshop-07-kilnwatch-bastion",
            "zone-town-kilnwatch-bastion",
            "Regional_B_A_Workshop",
            "Head Blacksmith Poitan & Black Anvil Guild Factor",
            [
                "Soulshot C-Grade & B-Grade Compressed Pack",
                "Blessed Spiritshot C-Grade & B-Grade Compressed Pack",
                "Greater Compressed Soulshot B-Grade Crate",
            ],
            "100% C-Grade & 60% B-Grade Damascus / Zubei & Avadon Recipes",
            "zone-field-slag-chasm",
            45000,
            "1 Crystal B + 54 Soul Ore -> 450 B-Soulshots",
        ),
        (
            "workshop-08-glaze-barge-quay",
            "zone-town-glaze-barge-quay",
            "Regional_B_A_Workshop",
            "Head Blacksmith Kluck & Maritime Trade Warsmith",
            [
                "Blessed Spiritshot B-Grade & A-Grade Compressed Pack",
                "Soulshot B-Grade Harbor Escort Pack",
                "Fishing Shot (No/D/C/B/A-Grade Luminous Pack)",
            ],
            "60% B-Grade & 60% A-Grade Sword of Valhalla / Blue Wolf Recipes",
            "zone-field-cobalt-sandbar-ford",
            62000,
            "2 Crystal B + 16 Spirit Ore -> 100 Blessed B-Spiritshots",
        ),
        (
            "workshop-09-saffron-press",
            "zone-town-saffron-press",
            "Regional_B_A_Workshop",
            "Head Blacksmith Pushkin & Manor Alloy Factor",
            [
                "Soulshot B-Grade & A-Grade Compressed Pack",
                "Blessed Spiritshot B-Grade Compressed Pack",
                "Beast Soulshot & Strider Siege Shot Pack",
            ],
            "60% B-Grade & 60% A-Grade Kris / Doom Plate & Peril Bow Recipes",
            "zone-field-apricot-aqueduct-terrace",
            68000,
            "1 Crystal B + 54 Soul Ore -> 450 B-Soulshots",
        ),
        (
            "workshop-10-pinion-terminus",
            "zone-town-pinion-terminus",
            "Regional_B_A_Workshop",
            "Head Blacksmith Rupio & Steppe Gear-Smith",
            [
                "Soulshot B-Grade & A-Grade Greater Compressed Pack",
                "Blessed Spiritshot B-Grade & A-Grade Compressed Pack",
                "Summon Beast Shot & Airship Ballista Charge",
            ],
            "60% A-Grade Carnage Bow, Halberd & Majestic Armor Recipes",
            "zone-field-brass-spur-ridge",
            85000,
            "1 Crystal A + 36 Soul Ore -> 300 A-Soulshots",
        ),
        (
            "workshop-11-escapement-anvil",
            "zone-town-escapement-anvil",
            "Regional_B_A_Workshop",
            "Head Blacksmith Tatabos & Master Warsmith Roman",
            [
                "Soulshot A-Grade & B-Grade Compressed Pack",
                "Blessed Spiritshot A-Grade Compressed Pack",
                "Greater Compressed A-Grade Siege Crate (10,000 Rounds)",
            ],
            "60% A-Grade Tallum Blade, Dark Legion's Edge & Nightmare Recipes",
            "zone-field-caldera-rim",
            98000,
            "2 Crystal A + 70 Spirit Ore -> 200 Blessed A-Spiritshots",
        ),
        # 4 Capital_S_Grade_Master_Forge Towns (Capital_S_Grade_Master_Forge)
        (
            "workshop-12-inductor-switchyard",
            "zone-town-inductor-switchyard",
            "Capital_S_Grade_Master_Forge",
            "Head Blacksmith Ferris & Maestro Kusto",
            [
                "Soulshot A-Grade & S-Grade Compressed Pack",
                "Blessed Spiritshot A-Grade & S-Grade Compressed Pack",
                "Greater S-Grade Merchant Guild Crate (10,000 Rounds)",
            ],
            "60% S-Grade Arcana Mace, Draconic Bow & Imperial Crusader Recipes",
            "zone-field-leyden-causeway",
            185000,
            "1 Crystal S + 40 Soul Ore -> 350 S-Soulshots",
        ),
        (
            "workshop-13-torque-balance-citadel",
            "zone-town-torque-balance-citadel",
            "Capital_S_Grade_Master_Forge",
            "Head Blacksmith Hilda & Maestro Noel",
            [
                "Soulshot S-Grade Royal Citadel Compressed Pack",
                "Blessed Spiritshot S-Grade Archmage Compressed Pack",
                "S-Grade Beast & Wyvern Siege Shot Crate",
            ],
            "60% S-Grade Forgotten Blade, Basalt Battlehammer & Major Arcana Recipes",
            "zone-field-spiral-wormway-ramp",
            220000,
            "2 Crystal S + 50 Spirit Ore -> 200 Blessed S-Spiritshots",
        ),
        (
            "workshop-14-starfall-haven",
            "zone-town-starfall-haven",
            "Capital_S_Grade_Master_Forge",
            "Head Blacksmith Vincenz & Sky-Anvil Maestro",
            [
                "Soulshot S-Grade & A-Grade Astral Compressed Pack",
                "Blessed Spiritshot S-Grade Starfall Compressed Pack",
                "Greater Compressed S-Grade Raid Command Crate",
            ],
            "60% S-GradeHeaven's Divider, Angel Slayer & Draconic Leather Recipes",
            "zone-field-kelp-spiral-reef",
            240000,
            "1 Crystal S + 40 Soul Ore -> 350 S-Soulshots",
        ),
        (
            "workshop-15-crown-beacon",
            "zone-town-crown-beacon",
            "Capital_S_Grade_Master_Forge",
            "Head Blacksmith Mammon-Envoy & Sovereign Maestro Ishuma",
            [
                "Soulshot S-Grade Sovereign Masterwork Crate",
                "Blessed Spiritshot S-Grade Olympiad Hero Pack",
                "Apex S-Grade Compressed Soulshot/Spiritshot Bundle",
            ],
            "60% & 100% S-Grade Dynasty / Imperial Crusader & Saint Spear Recipes",
            "zone-field-aurora-tether",
            290000,
            "2 Crystal S + 80 Soul Ore -> 700 S-Soulshots (Master Forge Yield)",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for idx, (wid, tzid, wtier, smith, shot_grades, rec_tier, spoil_zid, fee_adena, ratio_str) in enumerate(specs, start=1):
        t_obj = town_by_id.get(tzid) or {}
        tname = str(t_obj.get("name", tzid))
        bx, by = _parse_loc(str(t_obj.get("loc_coord") or "-84120:243500"))
        plaza_loc = _fmt_loc(bx + 190 + idx * 10, by - 145 - idx * 8)
        rows.append(
            {
                "workshop_id": wid,
                "town_zone_id": tzid,
                "town_name": tname,
                "workshop_tier": wtier,
                "plaza_loc": plaza_loc,
                "head_blacksmith_npc": smith,
                "shot_compression_grades": shot_grades,
                "featured_recipe_tier": rec_tier,
                "recipe_spoil_zone_id": spoil_zid,
                "average_manufacture_fee_adena": fee_adena,
                "crystal_ore_ratio": ratio_str,
            }
        )
    return rows


def _build_territory_ward_supply_nodes(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 16 Territory War & Fortress Supply Nodes (8 Sovereign_Territory_Ward + 8 Fortress_Codex_Supply_Vault across the 8 Stronghold Domains) (D40)."""
    specs = [
        # 8 Sovereign_Territory_Ward (1 per Stronghold Domain)
        (
            "ward-node-01-lantern-ferry-ward",
            "Lantern Ferry Harbor — Territory Ward of Gludio Maritime Dominion",
            "Sovereign_Territory_Ward",
            "zone-harbor-lantern-ferry-pier",
            "zone-town-lantern-hollow",
            "-96020:258560",
            "Mercenary Captain Devianne",
            "STR +1 / INT +1 Ward Banner",
            "Territory Badge Exchange: Gludio Noble Vesper Cloak & Belt",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-02-glaze-barge-ward",
            "Glaze-Barge Sky-Harbor — Territory Ward of Innadril Waterway Dominion",
            "Sovereign_Territory_Ward",
            "zone-harbor-glaze-barge-airship-dock",
            "zone-town-glaze-barge-quay",
            "-89220:155380",
            "Mercenary Captain Pierce",
            "WIT +1 / MEN +1 Ward Banner",
            "Territory Badge Exchange: Innadril Tidal Talisman & Top-Grade Belt",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-03-kilnwatch-accord-ward",
            "Kilnwatch Accord Keep — Territory Ward of Dion 6-Race Convergence",
            "Sovereign_Territory_Ward",
            "zone-clanhall-kilnwatch-accord",
            "zone-town-kilnwatch-bastion",
            "-13620:124260",
            "Mercenary Captainoni",
            "DEX +1 / CON +1 Ward Banner",
            "Territory Badge Exchange: Dion Vanguard Belt (+PvP P.Atk/Def)",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-04-inductor-conclave-ward",
            "Inductor Conclave Citadel — Territory Ward of Giran Trade Hegemony",
            "Sovereign_Territory_Ward",
            "zone-clanhall-inductor-conclave",
            "zone-town-inductor-switchyard",
            "148280:-54620",
            "Mercenary Captaingk",
            "STR +1 / DEX +1 Ward Banner",
            "Territory Badge Exchange: Giran Merchant Sovereign Cloak & Strider",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-05-shanty-kiln-ward",
            "Shanty-Kiln Border Fortress — Territory Ward of Oren Frontier",
            "Sovereign_Territory_Ward",
            "zone-fortress-shanty-kiln",
            "zone-field-cinder-apron",
            "-5020:134360",
            "Mercenary Captain Mouen",
            "CON +1 / MEN +1 Ward Banner",
            "Territory Badge Exchange: Oren Borderland Shield & PvP Rune Belt",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-06-floran-saffron-ward",
            "Saffron Agricultural Fortress — Territory Ward of Floran Freeholds",
            "Sovereign_Territory_Ward",
            "zone-fortress-floran-saffron",
            "zone-town-saffron-press",
            "18280:168560",
            "Mercenary Captain Mathias",
            "INT +1 / WIT +1 Ward Banner",
            "Territory Badge Exchange: Floran Harvest Talisman of Speed & Belt",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-07-dragonspine-cog-ward",
            "Dragonspine Cog Fortress — Territory Ward of Schuttgart & Goddard",
            "Sovereign_Territory_Ward",
            "zone-fortress-dragonspine-cog",
            "zone-town-escapement-anvil",
            "91380:136960",
            "Mercenary Captain Vishotsky",
            "STR +1 / CON +1 Ward Banner",
            "Territory Badge Exchange: Dragonspine Siege Golem Crest & Top Belt",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Territory War Flag Capture)",
        ),
        (
            "ward-node-08-cloud-halo-ward",
            "Cloud-Mountain Halo Fortress — Territory Ward of Aden & Rune Sovereign",
            "Sovereign_Territory_Ward",
            "zone-fortress-cloud-halo",
            "zone-town-crown-beacon",
            "46380:-44920",
            "Mercenary Captainslt",
            "STR +1 / INT +1 / WIT +1 Sovereign Ward Banner",
            "Territory Badge Exchange: Aden/Rune Sovereign Noble Cloak & Hero Belt",
            "Bi-Weekly Saturday 20:00–22:00 UTC (Grand High-Halo Territory War)",
        ),
        # 8 Fortress_Codex_Supply_Vault (1 per Stronghold Domain)
        (
            "ward-node-09-lantern-ferry-codex-vault",
            "Lantern Ferry Garrison Vault — Knights' Epaulette & Giant's Codex Chest",
            "Fortress_Codex_Supply_Vault",
            "zone-harbor-lantern-ferry-pier",
            "zone-field-clover-south-gate",
            "-95660:258020",
            "Support Unit Captain Braddock",
            "STR +1 / INT +1 Ward Banner",
            "Giant's Codex (+1..+30 Skill Enchant) & Talisman of Speed",
            "Every 4 Hours (Fortress Siege & 6h Rebel Supply Drop)",
        ),
        (
            "ward-node-10-glaze-barge-codex-vault",
            "Glaze-Barge Dock Armory — Epaulette & Giant's Codex: Discipline Vault",
            "Fortress_Codex_Supply_Vault",
            "zone-harbor-glaze-barge-airship-dock",
            "zone-field-cobalt-sandbar-ford",
            "-88860:154780",
            "Support Unit Captain Kessel",
            "WIT +1 / MEN +1 Ward Banner",
            "Giant's Codex: Discipline (Skill Enchant Route Change) & Blood Oath",
            "Every 4 Hours (Fortress Siege & 6h Rebel Supply Drop)",
        ),
        (
            "ward-node-11-kilnwatch-accord-codex-vault",
            "Kilnwatch Accord Underground Dungeon — Epaulette & Mastery Codex Vault",
            "Fortress_Codex_Supply_Vault",
            "zone-clanhall-kilnwatch-accord",
            "zone-field-slag-chasm",
            "-13280:123680",
            "Detention Camp Warden Rignos",
            "DEX +1 / CON +1 Ward Banner",
            "Giant's Codex: Mastery (Safe Skill Enchant No-Reset) & Blood Oath",
            "Every 4 Hours (Fortress Prison Raid & Supply Level 1–6 Chest)",
        ),
        (
            "ward-node-12-inductor-conclave-codex-vault",
            "Inductor Conclave Treasury — Royal Epaulette & Oblivion Codex Vault",
            "Fortress_Codex_Supply_Vault",
            "zone-clanhall-inductor-conclave",
            "zone-field-leyden-causeway",
            "148620:-55220",
            "Supply Officer Harke",
            "STR +1 / DEX +1 Ward Banner",
            "Giant's Codex: Oblivion (SP Refund Reset) & Blood Alliance",
            "Every 4 Hours (Citadel Supply Caravan & Pailaka Rim Dungeon)",
        ),
        (
            "ward-node-13-shanty-kiln-codex-vault",
            "Shanty-Kiln Barracks Vault — Knights' Epaulette & Talisman Supply",
            "Fortress_Codex_Supply_Vault",
            "zone-fortress-shanty-kiln",
            "zone-town-carillon-belfry",
            "-4680:133780",
            "Supply Officer Torrant",
            "CON +1 / MEN +1 Ward Banner",
            "Giant's Codex: Mastery (+Skill Enchant Safe) & Talisman of Invincibility",
            "Every 4 Hours (72h Independent Fortress Contract & Supply Drop)",
        ),
        (
            "ward-node-14-floran-saffron-codex-vault",
            "Saffron Granary Vault — Knights' Epaulette & Shirt Enchant Supply",
            "Fortress_Codex_Supply_Vault",
            "zone-fortress-floran-saffron",
            "zone-field-apricot-aqueduct-terrace",
            "18620:167980",
            "Foreman Logistics Officer",
            "INT +1 / WIT +1 Ward Banner",
            "Giant's Codex & Striped Mithril CP Shirt (+4 Safe Enchant)",
            "Every 4 Hours (Manor Fortress Garrison & Rebel Supply Crate)",
        ),
        (
            "ward-node-15-dragonspine-cog-codex-vault",
            "Dragonspine Cog Munitions Vault — Epaulette & Mastery Codex Armory",
            "Fortress_Codex_Supply_Vault",
            "zone-fortress-dragonspine-cog",
            "zone-field-brass-spur-ridge",
            "91720:136380",
            "Dwarven Logistics Quartermaster",
            "STR +1 / CON +1 Ward Banner",
            "Giant's Codex: Mastery (Safe Skill Enchant) & Blood Oath x15",
            "Every 4 Hours (Ridge Fortress Siege & Castle Supply Level 6)",
        ),
        (
            "ward-node-16-cloud-halo-codex-vault",
            "Cloud-Mountain Halo Reliquary — Sovereign Epaulette & Apex Codex Vault",
            "Fortress_Codex_Supply_Vault",
            "zone-fortress-cloud-halo",
            "zone-field-aurora-tether",
            "46720:-45520",
            "High-Halo Supply Arbiter",
            "STR +1 / INT +1 / WIT +1 Sovereign Ward Banner",
            "Giant's Codex: Mastery + Discipline Bundle & Divine Talisman",
            "Every 4 Hours (High-Halo Citadel Supply & Rim Pailaka Raid)",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for wid, nname, nrole, szid, vzid, loc, capt, stat_bon, reward, bwin in specs:
        rows.append(
            {
                "ward_node_id": wid,
                "node_name": nname,
                "node_role": nrole,
                "stronghold_zone_id": szid,
                "linked_vassal_zone_id": vzid,
                "loc": loc,
                "mercenary_captain_npc": capt,
                "stat_ward_bonus": stat_bon,
                "epaulette_codex_reward": reward,
                "territory_battle_window": bwin,
            }
        )
    return rows


def _build_epic_jewelry_sanctums(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 12 Canonical Epic Boss Jewelry Relics (4 Epic_Ring + 4 Epic_Earring + 4 Epic_Necklace across the 16 Multi-Floor Dungeons & Boss Sanctums) (D41)."""
    specs = [
        # 4 Epic_Ring
        (
            "jewelry-01-ring-queen-ant-kiln",
            "Ring of the Kiln-Queen (Queen Ant Ring Analog)",
            "Epic_Ring",
            "B-Grade",
            "Queen Ant-Brood Matriarch",
            "zone-dungeon-kiln-cellar",
            "zone-dungeon-kiln-cellar",
            "B3",
            "-113190:235226",
            [
                "+30% Poison Resist / +30% Poison Attack",
                "+20% Hold Resist / +20% Hold Attack",
            ],
            [
                "+15% Critical Damage Multiplier",
                "+2 Physical Accuracy",
                "+21 Max MP Resonance",
            ],
            "30% Sovereign Relic Drop (24h ± 4h Sanctum Respawn)",
        ),
        (
            "jewelry-02-ring-core-pendulum",
            "Ring of the Core Automaton (Ring of Core Analog)",
            "Epic_Ring",
            "A-Grade",
            "Core Pendulum Prime Construct",
            "zone-dungeon-pendulum-shaft",
            "zone-dungeon-pendulum-shaft",
            "3F",
            "85700:143900",
            [
                "+20% Poison Resist & Mental Debuff Cleanse",
                "+20% Root & Paralysis Resistance",
            ],
            [
                "-20% Incoming Physical & Magical Damage Taken",
                "+1 Physical Accuracy",
                "+21 Max MP Resonance",
            ],
            "30% Sovereign Relic Drop (36h ± 4h Sanctum Respawn)",
        ),
        (
            "jewelry-03-ring-baium-star-heart",
            "Ring of the Celestial Archon (Ring of Baium Analog)",
            "Epic_Ring",
            "S-Grade",
            "Celestial Archon Baium-Analog",
            "zone-dungeon-star-heart-nave",
            "zone-dungeon-star-heart-nave",
            "3F",
            "149500:28100",
            [
                "+40% Hold Resist / +40% Hold Attack",
                "+30% Stun Resist / +30% Stun Attack",
                "+40% Poison Resistance",
            ],
            [
                "+15% Critical Damage Multiplier",
                "+4% Attack Speed & +4% Casting Speed",
                "+2 Physical Accuracy & +21 Max MP",
            ],
            "100% Guaranteed 1x per Sanctum Kill (120h + 8h Awakening)",
        ),
        (
            "jewelry-04-ring-beleth-forbidden",
            "Ring of the Forbidden Architect (Beleth's Ring Analog)",
            "Epic_Ring",
            "S-Grade",
            "Forbidden Architect Beleth-Analog",
            "zone-catacomb-forbidden-path-orrery",
            "zone-catacomb-forbidden-path-orrery",
            "B3",
            "18700:-64500",
            [
                "+12% Mental Attack / +12% Mental Resist",
                "+30 Dark Element Resistance",
                "+25% Hold & Sleep Resistance",
            ],
            [
                "+12% Magic Defense (M.Def) Bonus",
                "+105 Max HP & +38 Max MP",
                "+15% MP Regeneration Rate",
            ],
            "100% Guaranteed 1x per Command Channel Sanctum Kill (192h)",
        ),
        # 4 Epic_Earring
        (
            "jewelry-05-earring-orfen-mire",
            "Earring of the Spore-Weaver (Earring of Orfen Analog)",
            "Epic_Earring",
            "A-Grade",
            "Spore-Queen Orfen-Analog",
            "zone-field-whispering-mire",
            "",
            "",
            "-62200:189500",
            [
                "+20% Bleed Resist / +20% Bleed Attack",
                "+25% Hold & Mental Debuff Resistance",
            ],
            [
                "+6% Heal Power Received",
                "+31 Max MP Resonance",
                "MP Drain & Anchor Ward",
            ],
            "30% Sovereign Overland Lair Drop (28h ± 4h Respawn)",
        ),
        (
            "jewelry-06-earring-zaken-sunken",
            "Earring of the Sunken Dread-Captain (Zaken's Earring Analog)",
            "Epic_Earring",
            "S-Grade",
            "Dread-Captain Zaken-Analog",
            "zone-dungeon-sunken-potter-hold",
            "zone-dungeon-sunken-potter-hold",
            "B3",
            "-78100:148900",
            [
                "+30% Stun Resist / +30% Stun Attack",
                "+30% Mental Attack / +30% Mental Resist",
                "+30% Bleed Resist / +30% Bleed Attack",
            ],
            [
                "+4% Vampiric Rage Melee Life-Drain",
                "+10% Heal Power Received",
                "-10% Skill MP Consumption & +31 Max MP",
            ],
            "100% Guaranteed 1x on Nocturnal 00:00 Cabin Breach (44h)",
        ),
        (
            "jewelry-07-earring-antharas-heretic",
            "Earring of the Earth-Drake Apostle (Earring of Antharas Analog)",
            "Epic_Earring",
            "S-Grade",
            "Earth-Drake Apostle Antharas-Analog",
            "zone-catacomb-heretic-kiln",
            "zone-catacomb-heretic-kiln",
            "B3",
            "20100:173100",
            [
                "+40% Stun Resist / +40% Stun Attack",
                "+40% Bleed Resist / +40% Bleed Attack",
                "+30% Mental & Derangement Resistance",
            ],
            [
                "+4% Vampiric Rage Melee Life-Drain",
                "+10% Heal Power Received",
                "-10% Skill MP Cost & +37 Max MP",
            ],
            "100% Guaranteed 1x per 90-Player Command Channel Kill (192h)",
        ),
        (
            "jewelry-08-earring-lilith-apostate",
            "Earring of the Abyssal Lilim Mother (Lilith's Sanctum Earring)",
            "Epic_Earring",
            "S-Grade",
            "High Priestess Lilith-Analog",
            "zone-catacomb-apostate-dynamo",
            "zone-catacomb-apostate-dynamo",
            "B3",
            "150100:-51500",
            [
                "+35% Sleep & Hold Resistance",
                "+35% Silence & Fear Resistance",
                "+30 Dark Element Resistance",
            ],
            [
                "+8% Casting Speed Resonance",
                "+4% Vampiric Rage Effect",
                "-8% Magic Skill Reuse Delay",
            ],
            "50% Dusk-Sign Seal Victory Sanctum Drop (Seven-Seals Cycle)",
        ),
        # 4 Epic_Necklace
        (
            "jewelry-09-necklace-frintezza-chronometer",
            "Necklace of the Scarlet Prince (Frintezza's Necklace Analog)",
            "Epic_Necklace",
            "A-Grade",
            "Scarlet Halisha & Prince Frintezza-Analog",
            "zone-dungeon-chronometer-foundry",
            "zone-dungeon-chronometer-foundry",
            "3F",
            "85100:56100",
            [
                "+25% Sleep / Paralysis / Stun Resistance",
                "+25% Poison & Bleed Resistance",
                "+15 Dark Element Resistance",
            ],
            [
                "-5% Physical & Magic Skill Reuse Delay",
                "+4% Melee Damage Reflect Shield",
                "+42 Max MP Resonance",
            ],
            "100% Guaranteed 1x per Imperial Tomb Pipe-Organ Raid (48h)",
        ),
        (
            "jewelry-10-necklace-valakas-caldera",
            "Necklace of the Fire-Dragon Sovereign (Necklace of Valakas Analog)",
            "Epic_Necklace",
            "S-Grade",
            "Fire-Dragon Sovereign Valakas-Analog",
            "zone-field-caldera-rim",
            "",
            "",
            "181200:-108400",
            [
                "+40% Sleep Resist / +40% Sleep Attack",
                "+35 Fire Element Resistance",
                "+25% Hold & Stun Resistance",
            ],
            [
                "+445 Max HP & +42 Max MP",
                "+4% P.Atk, +8% M.Atk & +100 Magic Critical Rate",
                "-10% Skill Reuse Delay & +5% Damage Reflect",
            ],
            "100% Guaranteed 1x per Caldera Lair Command Channel Kill (264h)",
        ),
        (
            "jewelry-11-necklace-anakim-witch",
            "Necklace of the Sacred Flame Nephilim (Anakim's Sanctum Necklace)",
            "Epic_Necklace",
            "S-Grade",
            "Sacred Flame Nephilim Anakim-Analog",
            "zone-catacomb-witch-pendulum",
            "zone-catacomb-witch-pendulum",
            "B3",
            "54500:-35100",
            [
                "+35% Paralysis & Root Resistance",
                "+30 Holy Element Resistance",
                "+25% Mental Debuff Resistance",
            ],
            [
                "+320 Max HP & +46 Max MP",
                "-8% Skill Reuse Delay",
                "+12% Heal Power & Clarity Efficiency",
            ],
            "50% Dawn-Sign Seal Victory Sanctum Drop (Seven-Seals Cycle)",
        ),
        (
            "jewelry-12-necklace-freya-coral",
            "Necklace of the Glacial Tide-Queen (Freya's Sanctum Necklace)",
            "Epic_Necklace",
            "S-Grade",
            "Glacial Tide-Queen Freya-Analog",
            "zone-catacomb-dark-omens-coral",
            "zone-catacomb-dark-omens-coral",
            "B3",
            "38700:-29200",
            [
                "+30% Bleed, Paralysis & Shock Resistance",
                "+25 Water Element Resistance",
                "+20% Mental Debuff Resistance",
            ],
            [
                "-5% Magic Skill Reuse Delay",
                "-5% Magic MP Consumption",
                "+156 Max HP, +50 Max MP & +2 MEN/+1 INT",
            ],
            "100% Guaranteed 1x per Deep Sanctum Hard-Mode Raid (72h)",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for (
        jid,
        rname,
        slot_cat,
        grade,
        bname,
        zid,
        did,
        fid,
        loc,
        resists,
        stats,
        drule,
    ) in specs:
        rows.append(
            {
                "jewelry_id": jid,
                "relic_name": rname,
                "slot_category": slot_cat,
                "grade": grade,
                "boss_guardian_name": bname,
                "zone_id": zid,
                "dungeon_id": did,
                "floor_id": fid,
                "loc": loc,
                "status_resist_bonuses": resists,
                "combat_stat_bonuses": stats,
                "drop_chance_rule": drule,
            }
        )
    return rows


def _build_adventurer_vitality_obelisks(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 15 Town Adventurer's Guide Buff, Shadow Weapon & Vitality Obelisk Hubs across all 15 Towns (D42)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_towns = (zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or [])
    town_by_id = {
        str(t.get("zone_id")): t
        for t in all_towns
        if isinstance(t, dict) and t.get("zone_id")
    }
    specs = [
        # 6 Starter_Apprentice_Coupon_Hub Towns
        (
            "obelisk-01-lantern-hollow",
            "zone-town-lantern-hollow",
            "Starter_Apprentice_Coupon_Hub",
            "Newbie Guide & Adventurer's Envoy Leona",
            "Lv.6–75 Full Support Suite + Life Cubic (Lv.16–34)",
            [
                "Wind Walk Lv.2 (+33 Move Spd)",
                "Shield Lv.3 & Magic Barrier Lv.2",
                "Vampiric Rage Lv.4 / Acumen Lv.3",
                "Life Cubic Heal Summon (Lv.16–34)",
            ],
            "D-Grade Apprentice Weapon Exchange Coupon (5x)",
            "Stage 0 -> Stage 4 (+300% EXP) in 6h Peace-Zone Rest",
        ),
        (
            "obelisk-02-porcelain-loom",
            "zone-town-porcelain-loom",
            "Starter_Apprentice_Coupon_Hub",
            "Newbie Guide & Moon-Weaver Envoy",
            "Lv.6–75 Mystic & Scout Support Suite + Life Cubic",
            [
                "Wind Walk Lv.2 & Bless the Body/Soul Lv.6",
                "Acumen Lv.3 & Empower Lv.1",
                "Clarity & Regeneration Lv.3",
                "Life Cubic Heal Summon (Lv.16–34)",
            ],
            "D-Grade Apprentice Mystic Staff & Bow Coupon (5x)",
            "Stage 0 -> Stage 4 (+300% EXP) in 6h Peace-Zone Rest",
        ),
        (
            "obelisk-03-draft-kiln-post",
            "zone-town-draft-kiln-post",
            "Starter_Apprentice_Coupon_Hub",
            "Newbie Guide & Flame-Totem Tutor",
            "Lv.6–75 Brawler & Warcryer Support Suite + Life Cubic",
            [
                "Wind Walk Lv.2 & Haste Lv.2",
                "Vampiric Rage Lv.4 & Berserker Spirit Lv.2",
                "Shield Lv.3 & Bless the Body Lv.6",
                "Life Cubic Heal Summon (Lv.16–34)",
            ],
            "D-Grade Apprentice Fist & Two-Handed Sword Coupon (5x)",
            "Stage 0 -> Stage 4 (+300% EXP) in 6h Peace-Zone Rest",
        ),
        (
            "obelisk-04-root-train-roundhouse",
            "zone-town-root-train-roundhouse",
            "Starter_Apprentice_Coupon_Hub",
            "Newbie Guide & Iron Gate Mentor",
            "Lv.6–75 Scavenger & Artisan Support Suite + Life Cubic",
            [
                "Wind Walk Lv.2 & Shield Lv.3",
                "Haste Lv.2 & Vampiric Rage Lv.4",
                "Bless the Body Lv.6 & Magic Barrier Lv.2",
                "Life Cubic Heal Summon (Lv.16–34)",
            ],
            "D-Grade Apprentice Polearm & Blunt Hammer Coupon (5x)",
            "Stage 0 -> Stage 4 (+300% EXP) in 6h Peace-Zone Rest",
        ),
        (
            "obelisk-05-carillon-belfry",
            "zone-town-carillon-belfry",
            "Starter_Apprentice_Coupon_Hub",
            "Newbie Guide & Abyssal Chime Tutor",
            "Lv.6–75 Assassin & Dark Mage Support Suite + Life Cubic",
            [
                "Wind Walk Lv.2 & Death Whisper / Guidance",
                "Vampiric Rage Lv.4 & Acumen Lv.3",
                "Empower Lv.1 & Magic Barrier Lv.2",
                "Life Cubic Heal Summon (Lv.16–34)",
            ],
            "D-Grade Apprentice Dagger & Dark Tome Coupon (5x)",
            "Stage 0 -> Stage 4 (+300% EXP) in 6h Peace-Zone Rest",
        ),
        (
            "obelisk-06-cinnamon-mill",
            "zone-town-cinnamon-mill",
            "Starter_Apprentice_Coupon_Hub",
            "Newbie Guide & Wind-Tail Envoy",
            "Lv.6–75 Skirmisher & Warder Support Suite + Life Cubic",
            [
                "Wind Walk Lv.2 & Haste Lv.2",
                "Vampiric Rage Lv.4 & Shield Lv.3",
                "Bless the Body/Soul Lv.6 & Magic Barrier Lv.2",
                "Life Cubic Heal Summon (Lv.16–34)",
            ],
            "D-Grade Apprentice Rapier, Ancient Sword & Crossbow Coupon (5x)",
            "Stage 0 -> Stage 4 (+300% EXP) in 6h Peace-Zone Rest",
        ),
        # 5 Regional_Shadow_Weapon_Hub Towns
        (
            "obelisk-07-kilnwatch-bastion",
            "zone-town-kilnwatch-bastion",
            "Regional_Shadow_Weapon_Hub",
            "Adventurer's Guide Captain & Dion Shadow Quartermaster",
            "Lv.6–75 Full Convergence Support Suite + Pet Buffs",
            [
                "Wind Walk Lv.2, Shield Lv.3 & Magic Barrier Lv.2",
                "Haste Lv.2, Vampiric Rage Lv.4 & Berserker Spirit Lv.2",
                "Acumen Lv.3, Empower Lv.1 & Bless the Soul Lv.6",
                "Servitor/Pet Haste, Vampiric & Horn Melody Suite",
            ],
            "C-Grade Shadow Weapon Exchange Coupon (Lv.40 Class Transfer)",
            "Stage 0 -> Stage 4 (+300% EXP) in 5h Regional Obelisk Rest",
        ),
        (
            "obelisk-08-glaze-barge-quay",
            "zone-town-glaze-barge-quay",
            "Regional_Shadow_Weapon_Hub",
            "Adventurer's Guide & Maritime Shadow Quartermaster",
            "Lv.6–75 Full Support Suite + Aquatic Stamina Aura",
            [
                "Wind Walk Lv.2 & Kiss of Eva Breath Bonus",
                "Vampiric Rage Lv.4, Haste Lv.2 & Shield Lv.3",
                "Acumen Lv.3, Empower Lv.1 & Clarity Resonance",
                "Life Cubic & Companion Support Suite",
            ],
            "C-Grade & B-Grade Shadow Weapon Exchange Coupon",
            "Stage 0 -> Stage 4 (+300% EXP) in 5h Regional Obelisk Rest",
        ),
        (
            "obelisk-09-saffron-press",
            "zone-town-saffron-press",
            "Regional_Shadow_Weapon_Hub",
            "Adventurer's Guide & Freeholds Militia Envoy",
            "Lv.6–75 Solo & Duo Spoil Support Suite + Life Cubic",
            [
                "Wind Walk Lv.2, Haste Lv.2 & Vampiric Rage Lv.4",
                "Shield Lv.3, Magic Barrier Lv.2 & Bless the Body Lv.6",
                "Acumen Lv.3 & Regeneration Lv.3",
                "Life Cubic Heal Summon & Penalty Recovery Scroll Exchange",
            ],
            "C-Grade Shadow Polearm, Dual-Sword & Dagger Coupon",
            "Stage 0 -> Stage 4 (+300% EXP) in 5h Regional Obelisk Rest",
        ),
        (
            "obelisk-10-pinion-terminus",
            "zone-town-pinion-terminus",
            "Regional_Shadow_Weapon_Hub",
            "Adventurer's Guide & Steppe Vanguard Quartermaster",
            "Lv.6–75 High-Plains Raid Support Suite + Mount Buffs",
            [
                "Wind Walk Lv.2, Haste Lv.2 & Guidance Resonance",
                "Vampiric Rage Lv.4, Berserker Spirit Lv.2 & Shield Lv.3",
                "Acumen Lv.3, Empower Lv.1 & Magic Barrier Lv.2",
                "Strider & Fenrir Companion Support Buff Suite",
            ],
            "B-Grade Shadow Weapon & Shadow Accessory Exchange",
            "Stage 0 -> Stage 4 (+300% EXP) in 4.5h Regional Obelisk Rest",
        ),
        (
            "obelisk-11-escapement-anvil",
            "zone-town-escapement-anvil",
            "Regional_Shadow_Weapon_Hub",
            "Adventurer's Guide & Oren Tower Warden",
            "Lv.6–75 Frontier & Tower Support Suite + Death Penalty Cure",
            [
                "Wind Walk Lv.2, Shield Lv.3 & Magic Barrier Lv.2",
                "Haste Lv.2, Vampiric Rage Lv.4 & Focus Resonance",
                "Acumen Lv.3, Empower Lv.1 & Bless the Body/Soul Lv.6",
                "Scroll: Recovery (C/B/A-Grade Death Penalty Cure) Exchange",
            ],
            "B-Grade Shadow Armament Coupon (Keshanberk / Valhalla / Kris)",
            "Stage 0 -> Stage 4 (+300% EXP) in 4.5h Regional Obelisk Rest",
        ),
        # 4 Capital_Stage4_Vitality_Sanctuary Towns
        (
            "obelisk-12-inductor-switchyard",
            "zone-town-inductor-switchyard",
            "Capital_Stage4_Vitality_Sanctuary",
            "Grand Adventurer's Guide & Giran Vitality Arbiter",
            "Lv.6–75 Capital Full Support Suite + Vitality Replenishing Tonic",
            [
                "Wind Walk Lv.2, Haste Lv.2, Vampiric Rage Lv.4 & Shield Lv.3",
                "Acumen Lv.3, Empower Lv.1, Magic Barrier Lv.2 & Clarity",
                "Bless the Body Lv.6, Bless the Soul Lv.6 & Berserker Spirit Lv.2",
                "Vitality Maintaining Potion (30m Stage-4 Lock) Exchange",
            ],
            "B-Grade Shadow Armament + Vitality Replenishing Herb Tonic",
            "Stage 0 -> Stage 4 (+300% EXP) in 3.5h Capital Sanctuary Rest + Raid Vitality Bonus",
        ),
        (
            "obelisk-13-torque-balance-citadel",
            "zone-town-torque-balance-citadel",
            "Capital_Stage4_Vitality_Sanctuary",
            "Grand Adventurer's Guide & Aden Royal Vitality Prelate",
            "Lv.6–75 Royal Citadel Full Support + Subclass Vitality Aura",
            [
                "Wind Walk Lv.2, Haste Lv.2, Vampiric Rage Lv.4 & Shield Lv.3",
                "Acumen Lv.3, Empower Lv.1 & Magic Barrier Lv.2",
                "Royal Knight/Warder Defense & Elemental Ward Resonance",
                "Scroll: Recovery (A/S-Grade) & Pailaka Vitality Refill",
            ],
            "B-Grade Shadow Armament + Royal Vitality Replenishing Tonic",
            "Stage 0 -> Stage 4 (+300% EXP) in 3.5h Capital Sanctuary Rest + Raid Vitality Bonus",
        ),
        (
            "obelisk-14-starfall-haven",
            "zone-town-starfall-haven",
            "Capital_Stage4_Vitality_Sanctuary",
            "Grand Adventurer's Guide & Rune Astral Vitality Keeper",
            "Lv.6–75 Astral Sanctuary Support + Nevit's Blessing Hourglass",
            [
                "Wind Walk Lv.2, Haste Lv.2, Vampiric Rage Lv.4 & Shield Lv.3",
                "Acumen Lv.3, Empower Lv.1, Magic Barrier Lv.2 & Bless Body/Soul",
                "Nevit's Hourglass (+50% Bonus EXP / Zero Vitality Drain 1h)",
                "Servitor/Companion Full Awakening Support Suite",
            ],
            "B-Grade Shadow Armament + Nevit's Voice (+10 Rec. Bonus) & Tonic",
            "Stage 0 -> Stage 4 (+300% EXP) in 3h Capital Sanctuary Rest + Raid Boss Refill",
        ),
        (
            "obelisk-15-crown-beacon",
            "zone-town-crown-beacon",
            "Capital_Stage4_Vitality_Sanctuary",
            "Sovereign Adventurer's Herald & High-Halo Vitality Archon",
            "Lv.6–75 Sovereign Full Support + Stage-4 Vitality Surge",
            [
                "Wind Walk Lv.2, Haste Lv.2, Vampiric Rage Lv.4 & Shield Lv.3",
                "Acumen Lv.3, Empower Lv.1, Magic Barrier Lv.2 & Berserker Spirit Lv.2",
                "Sovereign Vitality Surge (+300% Stage-4 EXP Lock & +30% Drop Aura)",
                "Scroll: Recovery (S-Grade) & Olympiad Hero Blessing",
            ],
            "Apex B/A-Grade Shadow Armament + Sovereign Stage-4 Vitality Elixir",
            "Stage 0 -> Stage 4 (+300% EXP) in 3h Capital Sanctuary Rest + 100% Raid Refill",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for idx, (oid, tzid, otier, gnpc, brange, bsuite, scoupon, vrate) in enumerate(specs, start=1):
        t_obj = town_by_id.get(tzid) or {}
        tname = str(t_obj.get("name", tzid))
        bx, by = _parse_loc(str(t_obj.get("loc_coord") or "-84120:243500"))
        obelisk_loc = _fmt_loc(bx - 165 - idx * 8, by + 135 + idx * 7)
        rows.append(
            {
                "obelisk_id": oid,
                "town_zone_id": tzid,
                "town_name": tname,
                "obelisk_tier": otier,
                "guide_npc_name": gnpc,
                "obelisk_loc": obelisk_loc,
                "buff_level_range": brange,
                "granted_buff_suite": bsuite,
                "shadow_weapon_coupon_grade": scoupon,
                "vitality_recovery_rate": vrate,
            }
        )
    return rows


def _build_armor_set_masterwork_forges(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 16 Canonical Armor Set & Masterwork Foundation Forge Nodes (6 Heavy_Vanguard_Set + 5 Light_Skirmisher_Set + 5 Mystic_Robe_Set spanning C-Grade..S80-Dynasty) (D43)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_towns = (zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or [])
    town_by_id = {
        str(t.get("zone_id")): t
        for t in all_towns
        if isinstance(t, dict) and t.get("zone_id")
    }
    specs = [
        # 6 Heavy_Vanguard_Set
        (
            "armor-set-01-full-plate-heavy",
            "Full Plate Heavy Set (C-Grade Vanguard Standard)",
            "Heavy_Vanguard_Set",
            "C-Grade",
            "zone-town-kilnwatch-bastion",
            "zone-dungeon-pendulum-shaft",
            "zone-dungeon-pendulum-shaft",
            "2F",
            "+269 Max HP, +5.24% Shield Defense Rate (with Full Plate Shield)",
            "Foundation Chaos Piece: +98 Max HP & +1.5% Shield Defense per Rare Item",
            "Head Blacksmith Poitan & Black Anvil Unsealer",
        ),
        (
            "armor-set-02-blue-wolf-heavy",
            "Blue Wolf Heavy Set (B-Grade Vanguard Rush)",
            "Heavy_Vanguard_Set",
            "B-Grade",
            "zone-town-glaze-barge-quay",
            "zone-dungeon-sunken-potter-hold",
            "zone-dungeon-sunken-potter-hold",
            "B2",
            "+7 Movement Speed, +5.24% HP Recovery Rate, STR +3 / CON -1 / DEX -2",
            "Foundation Chaos Piece: +3 Movement Speed & +1.8% P.Def per Rare Item",
            "Head Blacksmith Kluck & Mammon Unseal Envoy",
        ),
        (
            "armor-set-03-doom-plate-heavy",
            "Doom Plate Heavy Set (B-Grade Tank Fortress)",
            "Heavy_Vanguard_Set",
            "B-Grade",
            "zone-town-saffron-press",
            "zone-catacomb-heretic-kiln",
            "zone-catacomb-heretic-kiln",
            "B2",
            "+320 Max HP, +24% Shield Defense Rate, CON +3 / STR -3, Breath Gauge Bonus",
            "Foundation Chaos Piece: +115 Max HP & +4% Shield Block per Rare Item",
            "Head Blacksmith Pushkin & Blacksmith of Mammon",
        ),
        (
            "armor-set-04-tallum-plate-heavy",
            "Tallum Heavy Plate Set (A-Grade Melee DPS)",
            "Heavy_Vanguard_Set",
            "A-Grade",
            "zone-town-escapement-anvil",
            "zone-dungeon-chronometer-foundry",
            "zone-dungeon-chronometer-foundry",
            "2F",
            "+8% Attack Spd, +5759 Weight Limit, -80% Poison/Bleed Chance, STR +2 / CON -2",
            "Foundation Chaos Piece: +2.2% Attack Spd & +15% Poison/Bleed Resist per Rare Item",
            "Head Blacksmith Tatabos & Blacksmith of Mammon",
        ),
        (
            "armor-set-05-imperial-crusader-heavy",
            "Imperial Crusader Heavy Set (S-Grade Sovereign Vanguard)",
            "Heavy_Vanguard_Set",
            "S-Grade",
            "zone-town-inductor-switchyard",
            "zone-dungeon-star-heart-nave",
            "zone-dungeon-star-heart-nave",
            "3F",
            "+8% P.Def, +445 Max HP, -70% Sleep/Hold Chance, DEX -2 / STR +2",
            "Foundation Chaos Piece: +2.5% P.Def & +148 Max HP per Rare Item",
            "Maestro Kusto & Blacksmith of Mammon",
        ),
        (
            "armor-set-06-dynasty-platinum-heavy",
            "Dynasty Platinum Plate Set (S80 Shield/Bard Masterwork)",
            "Heavy_Vanguard_Set",
            "S80-Dynasty",
            "zone-town-crown-beacon",
            "zone-catacomb-forbidden-path-orrery",
            "zone-catacomb-forbidden-path-orrery",
            "B3",
            "+5.4% P.Def, +492 Max HP, -8% Dark Damage Taken, Shield/Weapon Master Shoulder",
            "Foundation Chaos Piece: +3.0% P.Def, +185 Max HP & +Dark Resist per Rare Item",
            "Sovereign Maestro Ishuma & Shadai Legendary Blacksmith",
        ),
        # 5 Light_Skirmisher_Set
        (
            "armor-set-07-plated-leather-light",
            "Plated Leather Light Set (C-Grade Skirmisher STR+4)",
            "Light_Skirmisher_Set",
            "C-Grade",
            "zone-town-lantern-hollow",
            "zone-dungeon-kiln-cellar",
            "zone-dungeon-kiln-cellar",
            "B2",
            "STR +4 / CON -1 (+12% Physical Attack Spike for Daggers, Bows & Tyrants)",
            "Foundation Chaos Piece: +2.0% P.Atk & +1.5 Evasion per Rare Item",
            "Head Blacksmith Kluto & Master Warsmith Pinter",
        ),
        (
            "armor-set-08-zubei-leather-light",
            "Zubei's Leather Light Set (B-Grade Evasion Skirmisher)",
            "Light_Skirmisher_Set",
            "B-Grade",
            "zone-town-cinnamon-mill",
            "zone-field-cinnamon-bark-viaduct",
            "",
            "",
            "+4 Evasion Rating (Agile Rogue & Kamael Warder Evasion Standard)",
            "Foundation Chaos Piece: +1.5 Evasion & +2.0% Attack Spd per Rare Item",
            "Head Blacksmith Feynn & Furral Blade-Factor",
        ),
        (
            "armor-set-09-majestic-leather-light",
            "Majestic Leather Set (A-Grade Hawkeye & Ghost Sentinel)",
            "Light_Skirmisher_Set",
            "A-Grade",
            "zone-town-pinion-terminus",
            "zone-catacomb-branded-bellows",
            "zone-catacomb-branded-bellows",
            "B3",
            "+8% Bow/Crossbow P.Atk, +240 Max MP, -50% Stun Chance, DEX +1 / CON -1",
            "Foundation Chaos Piece: +2.4% Bow P.Atk & +12% Stun Resist per Rare Item",
            "Head Blacksmith Rupio & Blacksmith of Mammon",
        ),
        (
            "armor-set-10-draconic-leather-light",
            "Draconic Leather Set (S-Grade Apex Archer & Assassin)",
            "Light_Skirmisher_Set",
            "S-Grade",
            "zone-town-starfall-haven",
            "zone-catacomb-dark-omens-coral",
            "zone-catacomb-dark-omens-coral",
            "B3",
            "+4% Attack Spd, +4% P.Atk, +289 Max MP, +5759 Weight Limit, DEX +1 / STR +1 / CON -2",
            "Foundation Chaos Piece: +1.8% Attack Spd, +1.8% P.Atk & +95 MP per Rare Item",
            "Head Blacksmith Vincenz & Sky-Anvil Maestro",
        ),
        (
            "armor-set-11-dynasty-jewel-leather",
            "Dynasty Jewel Leather Set (S80 Dagger & Bow Masterwork)",
            "Light_Skirmisher_Set",
            "S80-Dynasty",
            "zone-town-torque-balance-citadel",
            "zone-field-aurora-tether",
            "",
            "",
            "+5.4% Attack Spd, +5.4% Critical Damage, +492 Max HP, +2.2 Evasion, CON -2 / DEX +1 / STR +1",
            "Foundation Chaos Piece: +2.5% Crit Damage & +2.2% Attack Spd per Rare Item",
            "Head Blacksmith Hilda & Maestro Ishuma Envoy",
        ),
        # 5 Mystic_Robe_Set
        (
            "armor-set-12-karmian-tunic-robe",
            "Karmian Tunic Mystic Set (C-Grade Universal Spellcaster)",
            "Mystic_Robe_Set",
            "C-Grade",
            "zone-town-porcelain-loom",
            "zone-dungeon-medallion-heart-vault",
            "zone-dungeon-medallion-heart-vault",
            "B2",
            "+15% Casting Spd, +5.24% Physical Defense (P.Def)",
            "Foundation Chaos Piece: +2.5% Casting Spd & +2.0% P.Def per Rare Item",
            "Head Blacksmith Aios & Elven Master Artisan",
        ),
        (
            "armor-set-13-avadon-robe",
            "Avadon Robe Set (B-Grade High-Acumen Battle Caster)",
            "Mystic_Robe_Set",
            "B-Grade",
            "zone-town-carillon-belfry",
            "zone-dungeon-ceramic-resonator-crypt",
            "zone-dungeon-ceramic-resonator-crypt",
            "B2",
            "+15% Casting Spd, +5.24% Physical Defense (P.Def), +294 Max HP with Shield",
            "Foundation Chaos Piece: +2.5% Casting Spd & +2.5% P.Def per Rare Item",
            "Head Blacksmith Karrod & Blacksmith of Mammon",
        ),
        (
            "armor-set-14-dark-crystal-robe",
            "Dark Crystal Robe Set (A-Grade Sovereign Nuker & Healer)",
            "Mystic_Robe_Set",
            "A-Grade",
            "zone-town-draft-kiln-post",
            "zone-catacomb-apostate-dynamo",
            "zone-catacomb-apostate-dynamo",
            "B3",
            "+15% Casting Spd, +8% P.Def, +7 Movement Speed, -50% Spell Cancel, WIT +2 / MEN -2",
            "Foundation Chaos Piece: +2.5% Casting Spd, +2.0% P.Def & -12% Cancel per Rare Item",
            "Head Blacksmith Sumari & Blacksmith of Mammon",
        ),
        (
            "armor-set-15-major-arcana-robe",
            "Major Arcana Robe Set (S-Grade Archmage & Cardinal)",
            "Mystic_Robe_Set",
            "S-Grade",
            "zone-town-root-train-roundhouse",
            "zone-catacomb-witch-pendulum",
            "zone-catacomb-witch-pendulum",
            "B3",
            "+17% M.Atk, +7 Movement Speed, -50% Spell Cancel, +5759 Weight, WIT +1 / INT +1 / MEN -2",
            "Foundation Chaos Piece: +3.2% M.Atk & -15% Spell Cancel per Rare Item",
            "Iron Gate Chief Bronk & Blacksmith of Mammon",
        ),
        (
            "armor-set-16-dynasty-silver-satin-robe",
            "Dynasty Silver Satin Tunic Set (S80 Enchanter & Summoner)",
            "Mystic_Robe_Set",
            "S80-Dynasty",
            "zone-town-crown-beacon",
            "zone-field-kelp-spiral-reef",
            "",
            "",
            "+15% Casting Spd, +321 Max MP, +6.6% M.Atk, -15% Dark Damage, INT -2 / MEN +2 / WIT +1",
            "Foundation Chaos Piece: +2.8% Casting Spd, +3.0% M.Atk & +110 MP per Rare Item",
            "Sovereign Maestro Ishuma & Mammon Masterwork Unsealer",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for idx, (
        asid,
        sname,
        wclass,
        grade,
        ftzid,
        drop_zid,
        drop_did,
        drop_fid,
        sbonus,
        mwbonus,
        unseal_npc,
    ) in enumerate(specs, start=1):
        t_obj = town_by_id.get(ftzid) or {}
        bx, by = _parse_loc(str(t_obj.get("loc_coord") or "-84120:243500"))
        forge_loc = _fmt_loc(bx + 145 + idx * 9, by + 155 + idx * 6)
        rows.append(
            {
                "armor_set_id": asid,
                "set_name": sname,
                "armor_weight_class": wclass,
                "grade": grade,
                "forge_town_zone_id": ftzid,
                "key_piece_drop_zone_id": drop_zid,
                "key_piece_dungeon_id": drop_did,
                "key_piece_floor_id": drop_fid,
                "forge_loc": forge_loc,
                "set_bonus_summary": sbonus,
                "masterwork_foundation_bonus": mwbonus,
                "unseal_blacksmith_npc": unseal_npc,
            }
        )
    return rows


def _build_kamaloka_pailaka_instances(atlas: dict[str, Any]) -> list[dict[str, Any]]:
    """Build 15 Town Pathfinder & Continent Instance Portals (6 Kamaloka_Abyss_Hall + 5 Pailaka_Vitality_Trial + 4 Seed_Delusion_Conduit) (D44)."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    all_zones: list[dict[str, Any]] = []
    for entries in zdir.values():
        if isinstance(entries, list):
            all_zones.extend(e for e in entries if isinstance(e, dict))
    zone_by_id = {str(z.get("zone_id")): z for z in all_zones if z.get("zone_id")}
    specs = [
        # 6 Kamaloka_Abyss_Hall
        (
            "instance-01-kamaloka-lantern-hollow",
            "Kamaloka, Hall of the Abyss Lv.23 & 26 (Gludin Pathfinder)",
            "Kamaloka_Abyss_Hall",
            "zone-town-lantern-hollow",
            "Captain Bathis & Pathfinder Worker (Gludin)",
            "Lv.23–33",
            "2–6 Player Party (20m Instance Limit)",
            "Daily 06:30 UTC",
            "Essence of Kanabion -> D/C-Grade Enchant Scrolls & Rim Pailaka Access",
        ),
        (
            "instance-02-kamaloka-kilnwatch-bastion",
            "Kamaloka, Hall of Nightmares Lv.33 & 36 (Dion Pathfinder)",
            "Kamaloka_Abyss_Hall",
            "zone-town-kilnwatch-bastion",
            "Captain Lucas & Pathfinder Worker (Dion)",
            "Lv.31–41",
            "2–6 Player Party (20m Instance Limit)",
            "Daily 06:30 UTC",
            "Essence of Kanabion -> C-Grade Enchant Weapon/Armor Scrolls & Vitality",
        ),
        (
            "instance-03-kamaloka-glaze-barge-quay",
            "Kamaloka, Labyrinth of the Abyss Lv.43 & 49 (Heine Pathfinder)",
            "Kamaloka_Abyss_Hall",
            "zone-town-glaze-barge-quay",
            "Captain Gosta & Pathfinder Worker (Heine)",
            "Lv.40–54",
            "2–6 Player Party (45m 4-Stage Ward Labyrinth)",
            "Daily 06:30 UTC",
            "C/B-Grade Enchant Scrolls, Kanabion Tissue & Stage-2 Vitality Boost",
        ),
        (
            "instance-04-kamaloka-escapement-anvil",
            "Kamaloka, Hall of the Abyss Lv.53 & 56 (Oren Pathfinder)",
            "Kamaloka_Abyss_Hall",
            "zone-town-escapement-anvil",
            "Captain Mouen & Pathfinder Worker (Oren)",
            "Lv.50–61",
            "2–6 Player Party (20m Instance Limit)",
            "Daily 06:30 UTC",
            "B-Grade Enchant Weapon/Armor Scrolls & Essence of Kanabion",
        ),
        (
            "instance-05-kamaloka-pinion-terminus",
            "Kamaloka, Labyrinth of the Abyss Lv.63 & 69 (Schuttgart Pathfinder)",
            "Kamaloka_Abyss_Hall",
            "zone-town-pinion-terminus",
            "Captain Vishotsky & Pathfinder Worker (Schuttgart)",
            "Lv.60–74",
            "2–6 Player Party (45m 4-Stage Ward Labyrinth)",
            "Daily 06:30 UTC",
            "A-Grade Enchant Scrolls, High-Grade Life Stones & Kanabion Essence",
        ),
        (
            "instance-06-kamaloka-starfall-haven",
            "Kamaloka, Labyrinth of the Abyss Lv.78 & 81 (Rune Pathfinder)",
            "Kamaloka_Abyss_Hall",
            "zone-town-starfall-haven",
            "Captain Mathias & Pathfinder Worker (Rune)",
            "Lv.75–85",
            "2–9 Player Full Party (45m Apex Labyrinth)",
            "Daily 06:30 UTC",
            "S-Grade Enchant Scrolls, Dynasty Key Pieces & Top-Grade Life Stones",
        ),
        # 5 Pailaka_Vitality_Trial
        (
            "instance-07-pailaka-song-of-ice-and-fire",
            "Pailaka — Song of Ice and Fire (Gludin Forgotten Temple Trial)",
            "Pailaka_Vitality_Trial",
            "zone-town-porcelain-loom",
            "Inspector Adler & Temple Sinai Envoy",
            "Lv.36–42",
            "Solo + Upgraded Elemental Sprite Sword Spirit",
            "One-Time Heritage Clear",
            "100% Vitality Stage 4 Refill + Pailaka Ring & Pailaka Earring (C-Grade)",
        ),
        (
            "instance-08-pailaka-devils-legacy",
            "Pailaka — Devil's Legacy (Giran Pirate Island Lematan Trial)",
            "Pailaka_Vitality_Trial",
            "zone-town-inductor-switchyard",
            "Devil's Isle Survivor & Dwarf Adventurer Tigress",
            "Lv.61–67",
            "Solo + Enhanced Ancient Legacy Sword & Tigress Summon",
            "One-Time Heritage Clear",
            "100% Vitality Stage 4 Refill + Pailaka Bracelet (+2 Talisman Slots) & 10.8M EXP",
        ),
        (
            "instance-09-pailaka-injured-dragon",
            "Pailaka — Injured Dragon (Goddard Varka/Ketra Latana Trial)",
            "Pailaka_Vitality_Trial",
            "zone-town-torque-balance-citadel",
            "Ketra Orc Shaman & Fire Dragon Latana Steward",
            "Lv.73–77",
            "Solo + Spear of Silenos (Lv.3 Upgrade + 5 Scroll Buffs)",
            "One-Time Heritage Clear",
            "100% Vitality Stage 4 Refill + Pailaka Shirt (A-Grade) & 28M EXP",
        ),
        (
            "instance-10-rim-pailaka-fortress-dungeon",
            "Rim Pailaka — Fortress Detention Camp Kanabion Defense",
            "Pailaka_Vitality_Trial",
            "zone-fortress-shanty-kiln",
            "Detention Camp Warden & Rim Pathfinder",
            "Lv.60–80",
            "4–9 Player Clan Party (Defense of 3 NPC Captains)",
            "Every 4 Hours (Fortress Contract Required)",
            "Knights' Epaulettes x300, Rim Kanabion Essence & Stage-4 Vitality Surge",
        ),
        (
            "instance-11-rim-pailaka-castle-prison",
            "Rim Pailaka — Sovereign Castle Prison Delusion Trial",
            "Pailaka_Vitality_Trial",
            "zone-fortress-cloud-halo",
            "Castle Warden & Sovereign Pathfinder Arbiter",
            "Lv.70–85",
            "4–9 Player Sovereign Clan Party",
            "Every 4 Hours (Independent Castle Contract)",
            "Blood Oath x10, Giant's Codex: Mastery & 100% Vitality Refill",
        ),
        # 4 Seed_Delusion_Conduit
        (
            "instance-12-delusion-chamber-east-west",
            "Chamber of Delusion — East & West Seal Conduits (Aenkinel Raid)",
            "Seed_Delusion_Conduit",
            "zone-town-saffron-press",
            "Delusion Manager & Seal Guardian",
            "Lv.80–85",
            "2–9 Player Party (Guiding Tea Leaf Room Jumps)",
            "Daily 06:30 UTC",
            "Dynasty Armor/Jewelry Recipes, A/S Enchant Scrolls & Delusion Marks",
        ),
        (
            "instance-13-delusion-tower-of-naia",
            "Chamber of Delusion — Tower of Naia & Beleth Conduit",
            "Seed_Delusion_Conduit",
            "zone-field-cinder-apron",
            "Dorian & Matras Dimensional Conduit",
            "Lv.80–85",
            "9–36 Player Command Channel (Lock-Room Progression)",
            "Daily 06:30 UTC (48h Core Reset)",
            "Dynasty Essence II, Ancient Tome of the Demon & Elemental Stones",
        ),
        (
            "instance-14-seed-of-infinity-ecimus",
            "Seed of Infinity — Hall of Suffering, Erosion & Ekimus Heart",
            "Seed_Delusion_Conduit",
            "zone-field-kelp-spiral-reef",
            "Officer Tepios & Jaedin Aerial Conduit",
            "Lv.75–85",
            "9–27 Player Command Channel (5-Cycle Seed State)",
            "Wed/Sat 06:30 UTC Instance Reset",
            "Vesper/Icarus Weapon Pieces, Soul Crystal Stage 14–16 & Energy Star Stones",
        ),
        (
            "instance-15-seed-of-destruction-tiat",
            "Seed of Destruction — Dragon Mounted Troop & Tiat Throne",
            "Seed_Delusion_Conduit",
            "zone-town-crown-beacon",
            "Sergeant Allenos & High-Halo Aerial Conduit",
            "Lv.75–85",
            "36–45 Player Command Channel (12h Open / Farming Phase)",
            "Wed/Sat 06:30 UTC Instance Reset",
            "Vesper Noble Enhancement Stones, 150+ Attribute Crystals & TiatWeapons",
        ),
    ]
    rows: list[dict[str, Any]] = []
    for idx, (
        iid,
        iname,
        ccat,
        zid,
        pnpc,
        lbracket,
        prule,
        rcooldown,
        creward,
    ) in enumerate(specs, start=1):
        z_obj = zone_by_id.get(zid) or {}
        bx, by = _parse_loc(str(z_obj.get("loc_coord") or "-84120:243500"))
        loc = _fmt_loc(bx - 180 - idx * 9, by - 135 - idx * 6)
        rows.append(
            {
                "instance_id": iid,
                "instance_name": iname,
                "conduit_category": ccat,
                "zone_id": zid,
                "loc": loc,
                "pathfinder_npc_name": pnpc,
                "level_bracket": lbracket,
                "party_size_rule": prule,
                "reset_cooldown": rcooldown,
                "completion_reward": creward,
            }
        )
    return rows






def _resolve_town_layout_archetype(zone_entry: dict[str, Any], idx: int) -> str:
    zid = str(zone_entry.get("zone_id", "")).lower()
    tname = str(zone_entry.get("name", "")).lower()
    analog = str(zone_entry.get("l2_reference_analog", "")).lower()
    affinity = str(zone_entry.get("race_or_seal_affinity", "")).lower()
    if any(k in zid or k in tname or k in analog or k in affinity for k in ("porcelain-loom", "carillon-belfry", "elven", "dark elf", "lunar", "dark_lunar", "crown-beacon")):
        return "radial_moat_sanctuary"
    if any(k in zid or k in tname or k in analog for k in ("escapement-anvil", "pinion-terminus", "inductor-switchyard", "torque-balance", "oren", "giran", "goddard")):
        return "schematic_grid_blueprint"
    if any(k in zid or k in tname or k in analog for k in ("glaze-barge", "saffron-press", "starfall-haven", "cinnamon-mill", "harbor", "quay", "port", "floran", "rune", "kamael")):
        return "harbor_fortress_plaza"
    archetypes = (
        "polygonal_walled_keep",
        "radial_moat_sanctuary",
        "schematic_grid_blueprint",
        "harbor_fortress_plaza",
    )
    return archetypes[(idx - 1) % len(archetypes)]


def _resolve_floor_elevation_and_boss_highlight(
    is_tower: bool,
    floor_index: int,
    floor_id: str,
    spawns: list[dict[str, Any]],
) -> tuple[int, str]:
    elev_map_tower = {1: 20, 2: 85, 3: 160}
    elev_map_under = {1: -45, 2: -110, 3: -195}
    elev = elev_map_tower.get(floor_index, 20 * floor_index) if is_tower else elev_map_under.get(floor_index, -45 * floor_index)
    mvp_name = next((str(s.get("name", "")) for s in spawns if isinstance(s, dict) and s.get("entity_type") == "MVP"), "")
    raid_name = next((str(s.get("name", "")) for s in spawns if isinstance(s, dict) and s.get("entity_type") in ("Raid", "RaidBoss")), "")
    mini_name = next((str(s.get("name", "")) for s in spawns if isinstance(s, dict) and s.get("entity_type") == "Mini-Boss"), "")
    if floor_index == 1:
        highlight = f"{floor_id} Entry Vestibule · {mini_name or 'Gate Overseer (Mini-Boss)'}"
    elif floor_index == 2:
        highlight = f"{floor_id} Mid-Sanctum · {raid_name or 'Regional Seal Warden (Raid Boss)'}"
    else:
        highlight = f"{floor_id} Core Sanctum · {mvp_name or 'Apostle Sovereign (MVP God-Subordinate)'}"
    return elev, highlight


def _synthesize_town_blueprint(zone_entry: dict[str, Any], idx: int) -> dict[str, Any]:
    zid = str(zone_entry.get("zone_id", f"zone-town-{idx}"))
    snid = str(zone_entry.get("studio_node_id", f"town-{idx}"))
    tname = str(zone_entry.get("name", snid))
    analog = str(zone_entry.get("l2_reference_analog", "Classic L2 Castle Town"))
    affinity = str(zone_entry.get("race_or_seal_affinity", "all_races_convergence"))
    bx, by = _parse_loc(zone_entry.get("loc_coord", "-14200:123500"))
    conns = list(zone_entry.get("connected_zone_ids") or [])
    while len(conns) < 4:
        conns.append(conns[0] if conns else "zone-town-kilnwatch-bastion")

    shrine_map = dict((k, s) for k, _, s in CANON_RACES)
    shrine_name = shrine_map.get(affinity, f"{tname.split('(')[0].strip()} Accord Keystone")
    base_npc_id = 31000 + idx * 20

    buildings = [
        {"building_number": 1, "building_id": f"{snid}-b01", "name": f"1. {shrine_name} Plaza", "function": "Player Spawn Shrine & Accord Guide Fountain", "x_pct": 46, "y_pct": 45, "w_pct": 8, "h_pct": 8, "roof_color": "#eab308"},
        {"building_number": 2, "building_id": f"{snid}-b02", "name": "2. Neutral Adventure Guild Hall", "function": "Main/Side Quest Board & Raid Intelligence", "x_pct": 22, "y_pct": 24, "w_pct": 14, "h_pct": 12, "roof_color": "#944a34"},
        {"building_number": 3, "building_id": f"{snid}-b03", "name": "3. Blacksmith Clan & Refinement Anvil Forge", "function": "Weapon Refinement (+1..+16), Smelting & Soul Crystal Binding", "x_pct": 64, "y_pct": 24, "w_pct": 14, "h_pct": 12, "roof_color": "#9e5230"},
        {"building_number": 4, "building_id": f"{snid}-b04", "name": "4. Temple of the Architect Seal", "function": "Mystic/Priest Training, Seal Purification & Support Buffs", "x_pct": 38, "y_pct": 16, "w_pct": 24, "h_pct": 11, "roof_color": "#526878"},
        {"building_number": 5, "building_id": f"{snid}-b05", "name": "5. Seal-Resonance Gatekeeper Obelisk", "function": "Instant Teleport to Connected Fields, Hubs & Dungeons", "x_pct": 54, "y_pct": 56, "w_pct": 9, "h_pct": 8, "roof_color": "#0ea5e9"},
        {"building_number": 6, "building_id": f"{snid}-b06", "name": "6. Dwarf Freight & Account Warehouse Vault", "function": "Private Vault, Clan Storage & Cargo Freight", "x_pct": 22, "y_pct": 58, "w_pct": 14, "h_pct": 12, "roof_color": "#7c6044"},
        {"building_number": 7, "building_id": f"{snid}-b07", "name": "7. Weapons & Armor Equip Shop", "function": "Grade-Matched Weapons, Shields & Armor Sets", "x_pct": 64, "y_pct": 58, "w_pct": 14, "h_pct": 12, "roof_color": "#8a4e3a"},
        {"building_number": 8, "building_id": f"{snid}-b08", "name": "8. Consumable & Soulshot Apothecary", "function": "Healing Potions, Soulshots, Spiritshots & Escape Scrolls", "x_pct": 34, "y_pct": 72, "w_pct": 14, "h_pct": 10, "roof_color": "#705876"},
        {"building_number": 9, "building_id": f"{snid}-b09", "name": "9. Vanguard Fighter & Class Mastery Hall", "function": "Combat Skill Mastery & Job Quest Trials", "x_pct": 54, "y_pct": 72, "w_pct": 14, "h_pct": 10, "roof_color": "#7f1d1d"},
        {"building_number": 10, "building_id": f"{snid}-b10", "name": "10. South Gate Watchhouse", "function": f"Guard Post to {conns[0]}", "x_pct": 46, "y_pct": 84, "w_pct": 8, "h_pct": 6, "roof_color": "#1e3a8a"},
        {"building_number": 11, "building_id": f"{snid}-b11", "name": "11. East Gate Watchhouse", "function": f"Guard Post to {conns[1]}", "x_pct": 82, "y_pct": 46, "w_pct": 6, "h_pct": 8, "roof_color": "#1e3a8a"},
        {"building_number": 12, "building_id": f"{snid}-b12", "name": "12. North Gate Watchhouse", "function": f"Guard Post to {conns[2]}", "x_pct": 46, "y_pct": 10, "w_pct": 8, "h_pct": 6, "roof_color": "#1e3a8a"},
    ]

    service_marks = [
        {"mark_id": f"{snid}-mark-equip", "mark_type": "equip_shop", "label": "Weapons & Armor Equip Shop", "icon": "⚔️", "building_number": 7, "x_pct": 71, "y_pct": 64, "npc_name": f"[Trader] Valen ({snid})", "description": "Sells regional weapons, shields, and armor sets."},
        {"mark_id": f"{snid}-mark-consumable", "mark_type": "consumable_shop", "label": "Consumable & Grocery Store", "icon": "🧪", "building_number": 8, "x_pct": 41, "y_pct": 77, "npc_name": f"[Trader] Sorel ({snid})", "description": "Sells Soulshots, Spiritshots, Potions, and Escape Scrolls."},
        {"mark_id": f"{snid}-mark-blacksmith", "mark_type": "blacksmith", "label": "Blacksmith & Refinement Anvils", "icon": "⚒️", "building_number": 3, "x_pct": 71, "y_pct": 30, "npc_name": f"[Blacksmith] Torin ({snid})", "description": "Refines weapons/armor, smelts alloys, and binds Soul Crystals."},
        {"mark_id": f"{snid}-mark-refinement", "mark_type": "refinement_anvils", "label": "Master Refinement Anvil", "icon": "🔨", "building_number": 3, "x_pct": 73, "y_pct": 32, "npc_name": f"[Refiner] Master Durn ({snid})", "description": "High-purity weapon over-enchant & seal-stone refinement anvil."},
        {"mark_id": f"{snid}-mark-temple", "mark_type": "temple", "label": "Temple of the Architect Seal", "icon": "🏛️", "building_number": 4, "x_pct": 50, "y_pct": 21, "npc_name": f"[High Priest] Lyra ({snid})", "description": "Mystic training, seal purification, and support magic."},
        {"mark_id": f"{snid}-mark-warehouse", "mark_type": "warehouse", "label": "Dwarf Freight & Warehouse", "icon": "📦", "building_number": 6, "x_pct": 29, "y_pct": 64, "npc_name": f"[Warehouse Keeper] Brom ({snid})", "description": "Private storage, Clan Vault access, and cargo freight."},
        {"mark_id": f"{snid}-mark-guild", "mark_type": "guild", "label": "Adventure & Class Guilds", "icon": "🛡️", "building_number": 2, "x_pct": 29, "y_pct": 30, "npc_name": f"[Guildsman] Rowan ({snid})", "description": "Neutral 'No Side' Adventure Commissions and class mastery."},
        {"mark_id": f"{snid}-mark-gatekeeper", "mark_type": "gatekeeper", "label": "Seal-Resonance Gatekeeper", "icon": "🌀", "building_number": 5, "x_pct": 58, "y_pct": 60, "npc_name": f"[Gatekeeper] Clarissa ({snid})", "description": "Teleports adventurers across connected hunting grounds and hubs."},
    ]

    npc_specs = [
        (1, "trainer", "Newbie Guide & Spawn Steward", "#ef4444", 50, 49, f"[Guide] Steward of {shrine_name}"),
        (2, "trainer", "Neutral Adventure Guild Broker", "#ef4444", 29, 30, f"[Adventure Guildsman] Rowan ({snid})"),
        (3, "merchant", "Blacksmith & Refinement Forger", "#eab308", 71, 30, f"[Blacksmith] Torin ({snid})"),
        (4, "priest", "High Priest of the Seal", "#06b6d4", 50, 21, f"[High Priest] Lyra ({snid})"),
        (5, "gatekeeper", "Seal-Resonance Teleporter", "#a855f7", 58, 60, f"[Gatekeeper] Clarissa ({snid})"),
        (6, "warehouse", "Dwarf Freight & Vault Keeper", "#22c55e", 29, 64, f"[Warehouse Keeper] Brom ({snid})"),
        (7, "merchant", "Weapons & Armor Equip Trader", "#eab308", 71, 64, f"[Trader] Valen ({snid})"),
        (8, "merchant", "Consumable & Grocery Trader", "#eab308", 41, 77, f"[Trader] Sorel ({snid})"),
        (9, "trainer", "Fighter & Class Grand Master", "#ef4444", 61, 77, f"[Grand Master] Kael ({snid})"),
        (10, "guard", "South Gate Captain", "#3b82f6", 50, 86, f"[Captain] Venn ({snid} South)"),
        (11, "guard", "East Gate Sentinel", "#3b82f6", 85, 50, f"[Guard] Harken ({snid} East)"),
        (12, "guard", "North Gate Sentinel", "#3b82f6", 50, 13, f"[Guard] Tessa ({snid} North)"),
    ]
    npc_roster = [
        {
            "building_number": bnum,
            "npc_id": base_npc_id + bnum,
            "name": nname,
            "role_category": rcat,
            "role_title": rtitle,
            "color_hex": chex,
            "x_pct": x,
            "y_pct": y,
            "loc_coord": _fmt_loc(bx + (x - 50) * 18, by + (y - 50) * 18),
        }
        for bnum, rcat, rtitle, chex, x, y, nname in npc_specs
    ]

    return {
        "zone_id": zid,
        "studio_node_id": snid,
        "layout_archetype": _resolve_town_layout_archetype(zone_entry, idx),
        "archetype_subtitle": f"{tname} ({analog})",
        "race_spawn_point": {
            "race_key": affinity,
            "shrine_name": shrine_name,
            "loc_coord": _fmt_loc(bx + 70, by - 80),
            "x_pct": 50,
            "y_pct": 49,
        },
        "refinement_anvils": [
            {
                "anvil_id": f"{snid}-anvil-01",
                "name": f"{tname.split('(')[0].strip()} Master Refinement Anvil",
                "npc_name": f"[Blacksmith] Torin ({snid})",
                "building_number": 3,
                "x_pct": 71,
                "y_pct": 30,
            }
        ],
        "wall_polygon_pct": [[26, 12], [74, 12], [88, 28], [88, 72], [74, 88], [26, 88], [12, 72], [12, 28]],
        "gates": [
            {"gate_id": "gate-north", "name": f"North Gate (To {conns[2]})", "direction": "N", "x_pct": 50, "y_pct": 12, "target_zone_id": conns[2]},
            {"gate_id": "gate-east", "name": f"East Gate (To {conns[1]})", "direction": "E", "x_pct": 88, "y_pct": 50, "target_zone_id": conns[1]},
            {"gate_id": "gate-south", "name": f"South Gate (To {conns[0]})", "direction": "S", "x_pct": 50, "y_pct": 88, "target_zone_id": conns[0]},
            {"gate_id": "gate-west", "name": f"West Gate (To {conns[3]})", "direction": "W", "x_pct": 12, "y_pct": 50, "target_zone_id": conns[3]},
        ],
        "streets": [
            {"street_id": "street-ns-main", "name": "Meridian N-S Processional", "width_meters": 14.0, "path_pct": [[50, 12], [50, 50], [50, 88]]},
            {"street_id": "street-ew-cross", "name": "Blacksmith E-W Crossway", "width_meters": 12.5, "path_pct": [[12, 50], [50, 50], [88, 50]]},
            {"street_id": "street-plaza-ring", "name": "Inner Plaza Ring", "width_meters": 6.5, "path_pct": [[36, 36], [64, 36], [64, 64], [36, 64], [36, 36]]},
        ],
        "buildings": buildings,
        "service_marks": service_marks,
        "npc_roster": npc_roster,
        "shop_and_refinement_catalog": _synthesize_shop_and_refinement_catalog(zone_entry, idx),
    }


def _synthesize_multifloor_dungeon(zone_entry: dict[str, Any], idx: int) -> dict[str, Any]:
    zid = str(zone_entry["zone_id"])
    snid = str(zone_entry["studio_node_id"])
    dname = str(zone_entry["name"])
    analog = str(zone_entry.get("l2_reference_analog", "Multi-Floor Labyrinth"))
    lmin, lmax = (zone_entry.get("level_band") or [10, 22])[:2]
    is_tower = any(tok in dname.lower() or tok in analog.lower() for tok in ("tower", "spire", "shaft", "nave"))
    dkind = "vertical_tower" if is_tower else "underground_labyrinth"
    f_codes = ("1F", "2F", "3F") if is_tower else ("B1", "B2", "B3")
    bx, by = _parse_loc(zone_entry.get("loc_coord", "48550:248400"))
    span = max(3, lmax - lmin)
    step = max(1, span // 3)
    base_mob_id = 21000 + idx * 50

    floors: list[dict[str, Any]] = []
    for f_i, fid in enumerate(f_codes, start=1):
        fl_min = lmin + (f_i - 1) * step
        fl_max = lmax if f_i == 3 else min(lmax, fl_min + step + 1)
        lv_str = f"Lv.{fl_min}–{fl_max}"
        f_loc = _fmt_loc(bx + f_i * 600, by - f_i * 600)

        warps: list[dict[str, Any]] = []
        if f_i == 1:
            warps.append(
                {
                    "warp_id": f"wp-{zid}-{fid.lower()}-exit",
                    "warp_type": "overland_exit",
                    "label": f"⬅ Return to Overland ({dname.split('(')[0].strip()})",
                    "x_pct": 16,
                    "y_pct": 50,
                    "target_floor_id": "OVERLAND",
                    "target_loc": str(zone_entry.get("loc_coord", "48550:248400")),
                }
            )
            warps.append(
                {
                    "warp_id": f"wp-{zid}-{fid.lower()}-to-{f_codes[1].lower()}",
                    "warp_type": "floor_up" if is_tower else "floor_down",
                    "label": f"⬇ Warp to {f_codes[1]} Mid-Sanctum",
                    "x_pct": 82,
                    "y_pct": 64,
                    "target_floor_id": f_codes[1],
                    "target_loc": _fmt_loc(bx + 1200, by - 1200),
                }
            )
        elif f_i == 2:
            warps.append(
                {
                    "warp_id": f"wp-{zid}-{fid.lower()}-to-{f_codes[0].lower()}",
                    "warp_type": "floor_down" if is_tower else "floor_up",
                    "label": f"⬆ Return to {f_codes[0]} Vestibule",
                    "x_pct": 20,
                    "y_pct": 48,
                    "target_floor_id": f_codes[0],
                    "target_loc": _fmt_loc(bx + 600, by - 600),
                }
            )
            warps.append(
                {
                    "warp_id": f"wp-{zid}-{fid.lower()}-to-{f_codes[2].lower()}",
                    "warp_type": "boss_sanctum_warp",
                    "label": f"🔥 Boss Sanctum Warp to {f_codes[2]}",
                    "x_pct": 80,
                    "y_pct": 48,
                    "target_floor_id": f_codes[2],
                    "target_loc": _fmt_loc(bx + 1800, by - 1800),
                }
            )
        else:
            warps.append(
                {
                    "warp_id": f"wp-{zid}-{fid.lower()}-to-{f_codes[1].lower()}",
                    "warp_type": "floor_down" if is_tower else "floor_up",
                    "label": f"⬆ Return to {f_codes[1]}",
                    "x_pct": 22,
                    "y_pct": 50,
                    "target_floor_id": f_codes[1],
                    "target_loc": _fmt_loc(bx + 1200, by - 1200),
                }
            )
            warps.append(
                {
                    "warp_id": f"wp-{zid}-{fid.lower()}-exit",
                    "warp_type": "overland_exit",
                    "label": "🌀 Seal Escape Obelisk to Overland Entrance",
                    "x_pct": 84,
                    "y_pct": 66,
                    "target_floor_id": "OVERLAND",
                    "target_loc": str(zone_entry.get("loc_coord", "48550:248400")),
                }
            )

        spawns = [
            {
                "npc_id": base_mob_id + f_i * 10 + 1,
                "name": f"{dname.split('(')[0].strip()} {fid} Sentinel",
                "entity_type": "Monster",
                "level": fl_min,
                "aggro": "Yes",
                "race_key": "undead" if "catacomb" in zid or "crypt" in zid else "robotic",
                "race_badge": "Normal Mob",
                "hp_multiplier": "2x",
                "protections": ["Seal Ward Lv.1"],
                "weaknesses": ["Holy/Blunt Weak"],
                "spawn_count": 20,
                "respawn_sec": 45,
                "loc_coord": f_loc,
                "refinement_drops": ["High-Grade Iron Ore", "Varnish", "Refinement Flux Dust"],
                "spoil_materials": ["High-Grade Iron Ore (42% Spoil)", "Refinement Flux Dust (28% Spoil)"],
            },
            {
                "npc_id": base_mob_id + f_i * 10 + 2,
                "name": f"[Mini-Boss] {fid} Gate Overseer",
                "entity_type": "Mini-Boss",
                "level": min(fl_max, fl_min + 1),
                "aggro": "Yes",
                "race_key": "robotic",
                "race_badge": f"Mini-Boss · {fid} Keeper",
                "hp_multiplier": "3x",
                "protections": ["Heavy Plate"],
                "weaknesses": ["Elemental Weak"],
                "spawn_count": 2,
                "respawn_sec": 240,
                "loc_coord": _fmt_loc(bx + f_i * 600 + 120, by - f_i * 600 - 80),
                "refinement_drops": ["Weapon Enchant Scroll Fragment", "Tempered Alloy Plate", "Seal-Stone Cluster"],
                "spoil_materials": ["Tempered Alloy Plate (24% Spoil)", "Seal-Stone Cluster (18% Spoil)"],
            },
            {
                "npc_id": base_mob_id + f_i * 10 + 3,
                "name": f"[Raid Boss] {fid} Seal Warden",
                "entity_type": "Raid",
                "level": fl_max,
                "aggro": "Yes",
                "race_key": "robotic",
                "race_badge": "Raid · Rank 3 Warden",
                "hp_multiplier": "6x",
                "protections": ["Raid Seal Armor"],
                "weaknesses": ["Blunt/Holy Weak"],
                "spawn_count": 1,
                "respawn_sec": 3600,
                "loc_coord": _fmt_loc(bx + f_i * 600 + 240, by - f_i * 600 - 160),
                "refinement_drops": ["Blessed Enchant Weapon Scroll", "Warden Alloy Core", "Soul Crystal Stage 5"],
                "spoil_materials": ["Warden Alloy Core (15% Raid Spoil)", "Blessed Enchant Scroll (12% Drop)"],
            },
            {
                "npc_id": base_mob_id + f_i * 10 + 4,
                "name": f"[MVP] {dname.split('(')[0].strip()} {fid} Apostle Sovereign",
                "entity_type": "MVP",
                "level": fl_max,
                "aggro": "Yes",
                "race_key": "dark_lunar" if "catacomb" in zid else "robotic",
                "race_badge": "MVP · Rank 2 God-Subordinate",
                "hp_multiplier": "10x",
                "protections": ["God-Seal Aegis"],
                "weaknesses": ["Sacred Counter"],
                "spawn_count": 1,
                "respawn_sec": 7200,
                "loc_coord": _fmt_loc(bx + f_i * 600 + 360, by - f_i * 600 - 240),
                "refinement_drops": ["Divine Apostle Anvil Core", "Ancient Refinement Catalyst", "Architect Seal Crest"],
                "spoil_materials": ["Divine Apostle Anvil Core (8.5% MVP Drop)", "Architect Seal Crest (15% Spoil)"],
            },
        ]

        elev_m, boss_hl = _resolve_floor_elevation_and_boss_highlight(is_tower, f_i, fid, spawns)
        floors.append(
            {
                "floor_id": fid,
                "floor_index": f_i,
                "floor_elevation_meters": elev_m,
                "boss_tier_highlight": boss_hl,
                "name": f"{fid} — {dname.split('(')[0].strip()} ({lv_str})",
                "level_range": lv_str,
                "rooms": [
                    {
                        "room_id": f"{zid}-{fid.lower()}-r1",
                        "name": f"{fid} Entry Gallery & Patrol Hall",
                        "level_range": lv_str,
                        "corridor_width_meters": 8.5,
                        "x_pct": 16,
                        "y_pct": 32,
                        "w_pct": 28,
                        "h_pct": 34,
                        "key_mobs": [spawns[0]["name"], spawns[1]["name"]],
                    },
                    {
                        "room_id": f"{zid}-{fid.lower()}-r2",
                        "name": f"{fid} Inner Seal & Boss Rotunda",
                        "level_range": lv_str,
                        "corridor_width_meters": 10.5,
                        "x_pct": 52,
                        "y_pct": 26,
                        "w_pct": 34,
                        "h_pct": 44,
                        "key_mobs": [spawns[2]["name"], spawns[3]["name"]],
                    },
                ],
                "warp_points": warps,
                "spawns": spawns,
            }
        )

    return {
        "dungeon_id": zid,
        "studio_node_id": snid,
        "name": dname,
        "l2_archetype_alias": analog,
        "dungeon_kind": dkind,
        "entrance_loc": str(zone_entry.get("loc_coord", "48550:248400")),
        "floors": floors,
    }


def _resolve_linked_dungeon_warp(
    zone_entry: dict[str, Any],
    mf_by_id: dict[str, dict[str, Any]],
) -> tuple[str, str, str]:
    conns = list(zone_entry.get("connected_zone_ids") or [])
    for cid in conns:
        if cid in mf_by_id:
            d_obj = mf_by_id[cid]
            floors = d_obj.get("floors") or []
            f0 = str((floors[0] if floors else {}).get("floor_id", "B1"))
            return cid, f0, str(d_obj.get("name", cid))
    cont = str(zone_entry.get("continent_id", "continent-01-hearthbloom-basin"))
    fallback_did = (
        "zone-dungeon-kiln-cellar"
        if "01" in cont
        else ("zone-dungeon-pendulum-shaft" if "02" in cont else "zone-dungeon-star-heart-nave")
    )
    if fallback_did in mf_by_id:
        d_obj = mf_by_id[fallback_did]
        floors = d_obj.get("floors") or []
        f0 = str((floors[0] if floors else {}).get("floor_id", "B1"))
        return fallback_did, f0, str(d_obj.get("name", fallback_did))
    return "zone-dungeon-kiln-cellar", "B1", "Kiln Cellar Ruins (The Ant Nest)"


def _synthesize_field_tactical_blueprint(
    zone_entry: dict[str, Any],
    idx: int,
    mf_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    zid = str(zone_entry.get("zone_id", f"zone-field-{idx}"))
    snid = str(zone_entry.get("studio_node_id", f"hunting-area-{idx}"))
    fname = str(zone_entry.get("name", snid))
    short_name = fname.split("(")[0].strip()
    analog = str(zone_entry.get("l2_reference_analog", "Lineage II Open Hunting Field"))
    lmin, lmax = (zone_entry.get("level_band") or [1, 12])[:2]
    lmid = max(lmin, (lmin + lmax) // 2)
    bx, by = _parse_loc(zone_entry.get("loc_coord", "72986:113330"))
    did, dfid, dname = _resolve_linked_dungeon_warp(zone_entry, mf_by_id)

    return {
        "zone_id": zid,
        "studio_node_id": snid,
        "archetype_subtitle": f"{fname} ({analog})",
        "terrain_perimeter_pct": [
            [10, 14],
            [88, 12],
            [92, 48],
            [86, 86],
            [14, 88],
            [8, 50],
        ],
        "patrol_trails": [
            {
                "trail_id": f"{snid}-trail-main",
                "name": f"{short_name} Expedition Supply Trail",
                "width_meters": 9.5,
                "path_pct": [[14, 52], [44, 48], [82, 34]],
            },
            {
                "trail_id": f"{snid}-trail-boss",
                "name": "Mini-Boss & Raid Ambush Spur",
                "width_meters": 7.5,
                "path_pct": [[44, 48], [62, 68], [80, 74]],
            },
        ],
        "camp_and_shrine_marks": [
            {
                "mark_id": f"{snid}-camp",
                "mark_type": "Supply Camp",
                "label": f"{short_name} Vanguard Supply Camp",
                "icon": "⛺",
                "x_pct": 18,
                "y_pct": 52,
                "npc_or_node": f"[Field Quartermaster] Bram ({snid})",
                "description": "Field soulshot resupply, campfire recovery buff, and bounty turn-in.",
            },
            {
                "mark_id": f"{snid}-shrine",
                "mark_type": "Wayfarer Shrine",
                "label": f"{short_name} Wayfarer Seal Shrine",
                "icon": "⛩️",
                "x_pct": 36,
                "y_pct": 24,
                "npc_or_node": f"Seal Respawn Obelisk ({snid})",
                "description": "Attunes field respawn anchor and grants 20-minute Seal Wind-Step.",
            },
            {
                "mark_id": f"{snid}-gatekeeper",
                "mark_type": "Gatekeeper Waypoint",
                "label": f"{short_name} Gatekeeper Relay Pillar",
                "icon": "🌀",
                "x_pct": 22,
                "y_pct": 76,
                "npc_or_node": f"[Waypoint Keeper] Elen ({snid})",
                "description": "Fast-travel relay back to the nearest racial starter or castle hub town.",
            },
            {
                "mark_id": f"{snid}-ore-vein",
                "mark_type": "Refinement Ore Vein",
                "label": f"{short_name} High-Purity Refinement Vein",
                "icon": "💎",
                "x_pct": 54,
                "y_pct": 28,
                "npc_or_node": f"Blacksmith Clan Ore Outcrop #{idx}",
                "description": "Yields Orichalcum Ore, Seal-Stone Shards, and Anvil Flux for +1..+16 weapon refinement.",
            },
        ],
        "spawn_territories": [
            {
                "territory_id": f"{snid}-pack-monster",
                "x_pct": 38,
                "y_pct": 54,
                "radius_pct": 14,
                "entity_type": "Monster",
                "mob_name": f"{short_name} Pack Stalker",
                "level": lmin,
                "count": 24,
                "respawn": "35s",
                "refinement_drops": ["High-Grade Iron Ore", "Varnish", "Refinement Flux Dust"],
                "loc_coord": _fmt_loc(bx + 180, by - 140),
            },
            {
                "territory_id": f"{snid}-patrol-miniboss",
                "x_pct": 58,
                "y_pct": 44,
                "radius_pct": 11,
                "entity_type": "Mini-Boss",
                "mob_name": f"[Mini-Boss] {short_name} Patrol Captain",
                "level": lmid,
                "count": 3,
                "respawn": "240s",
                "refinement_drops": ["Weapon Enchant Scroll Fragment", "Tempered Alloy Plate", "Seal-Stone Cluster"],
                "loc_coord": _fmt_loc(bx + 420, by - 280),
            },
            {
                "territory_id": f"{snid}-arena-raid",
                "x_pct": 72,
                "y_pct": 68,
                "radius_pct": 12,
                "entity_type": "Raid",
                "mob_name": f"[Raid Boss] {short_name} Sovereign Warden",
                "level": lmax,
                "count": 1,
                "respawn": "3600s",
                "refinement_drops": ["Blessed Enchant Weapon Scroll", "Warden Alloy Core", "Soul Crystal Stage 5"],
                "loc_coord": _fmt_loc(bx + 760, by - 520),
            },
            {
                "territory_id": f"{snid}-sanctum-mvp",
                "x_pct": 80,
                "y_pct": 26,
                "radius_pct": 10,
                "entity_type": "MVP",
                "mob_name": f"[MVP] {short_name} Apostle Overseer",
                "level": lmax,
                "count": 1,
                "respawn": "7200s",
                "refinement_drops": ["Divine Apostle Anvil Core", "Ancient Refinement Catalyst", "Architect Seal Crest"],
                "loc_coord": _fmt_loc(bx + 980, by - 740),
            },
        ],
        "dungeon_entrance_warps": [
            {
                "warp_id": f"warp-{snid}-to-{did}",
                "label": f"🕳️ Enter {dname.split('(')[0].strip()} ({dfid})",
                "dungeon_id": did,
                "floor_id": dfid,
                "x_pct": 84,
                "y_pct": 46,
                "loc_coord": _fmt_loc(bx + 1120, by - 460),
            }
        ],
    }


def _synthesize_fortress_blueprint(
    zone_entry: dict[str, Any],
    idx: int,
    mf_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    zid = str(zone_entry.get("zone_id", f"zone-fortress-{idx}"))
    snid = str(zone_entry.get("studio_node_id", f"fortress-{idx}"))
    fname = str(zone_entry.get("name", snid))
    short_name = fname.split("(")[0].strip()
    fkind = str(zone_entry.get("category", "fortress"))
    if fkind not in ("harbor", "clan_hall", "fortress"):
        fkind = "fortress"
    analog = str(zone_entry.get("l2_reference_analog", "Lineage II Border Fortress / Harbor"))
    lmin, lmax = (zone_entry.get("level_band") or [15, 30])[:2]
    lmid = max(lmin, (lmin + lmax) // 2)
    bx, by = _parse_loc(zone_entry.get("loc_coord", "-96200:258400"))
    did, dfid, dname = _resolve_linked_dungeon_warp(zone_entry, mf_by_id)

    return {
        "zone_id": zid,
        "studio_node_id": snid,
        "fortress_kind": fkind,
        "archetype_subtitle": f"{fname} ({analog})",
        "bastion_wall_pct": [
            [18, 16],
            [82, 16],
            [88, 50],
            [82, 84],
            [18, 84],
            [12, 50],
        ],
        "camp_and_shrine_marks": [
            {
                "mark_id": f"{zid}-camp",
                "mark_type": "Supply Camp",
                "label": f"{short_name} Quartermaster & Siege Armory",
                "icon": "⛺",
                "x_pct": 26,
                "y_pct": 48,
                "npc_or_node": f"[Fortress Steward] Vane ({zid})",
                "description": "Clan siege consumables, Wyvern/Airship fuel rations, and fortress vault access.",
            },
            {
                "mark_id": f"{zid}-shrine",
                "mark_type": "Wayfarer Shrine",
                "label": f"{short_name} Flagpole & Accord Altar",
                "icon": "⛩️",
                "x_pct": 50,
                "y_pct": 32,
                "npc_or_node": f"Clan Crest Banner Altar ({zid})",
                "description": "Central banner sanctum for Clan Hall / Fortress ownership rites and buffs.",
            },
            {
                "mark_id": f"{zid}-gatekeeper",
                "mark_type": "Gatekeeper Waypoint",
                "label": f"{short_name} Harbor / Bastion Teleporter",
                "icon": "🌀",
                "x_pct": 32,
                "y_pct": 72,
                "npc_or_node": f"[Bastion Envoy] Mira ({zid})",
                "description": "Direct teleport to connected Castle Towns, Harbors, and Overland Hunting Grounds.",
            },
            {
                "mark_id": f"{zid}-ore-vein",
                "mark_type": "Refinement Ore Vein",
                "label": f"{short_name} Clan Refinement Forge & Smeltery",
                "icon": "💎",
                "x_pct": 66,
                "y_pct": 34,
                "npc_or_node": f"Clan Master Anvil #{idx}",
                "description": "Refines Blood Alliance badges, Epaulettes, and high-tier weapon over-enchants.",
            },
        ],
        "spawn_territories": [
            {
                "territory_id": f"{zid}-pack-monster",
                "x_pct": 40,
                "y_pct": 58,
                "radius_pct": 12,
                "entity_type": "Monster",
                "mob_name": f"{short_name} Garrison Sentinel",
                "level": lmin,
                "count": 18,
                "respawn": "45s",
                "refinement_drops": ["Knight's Epaulette", "Fortress Iron Ingot", "Refinement Stone"],
                "loc_coord": _fmt_loc(bx + 150, by - 150),
            },
            {
                "territory_id": f"{zid}-patrol-miniboss",
                "x_pct": 58,
                "y_pct": 52,
                "radius_pct": 10,
                "entity_type": "Mini-Boss",
                "mob_name": f"[Mini-Boss] {short_name} Ballista Captain",
                "level": lmid,
                "count": 2,
                "respawn": "300s",
                "refinement_drops": ["Captain's Seal Crest", "Armor Enchant Scroll", "Tempered Steel"],
                "loc_coord": _fmt_loc(bx + 360, by - 260),
            },
            {
                "territory_id": f"{zid}-arena-raid",
                "x_pct": 72,
                "y_pct": 66,
                "radius_pct": 11,
                "entity_type": "Raid",
                "mob_name": f"[Raid Boss] {short_name} Siege Commander",
                "level": lmax,
                "count": 1,
                "respawn": "3600s",
                "refinement_drops": ["Blood Alliance", "Blessed Weapon Enchant", "Fortress Forge Core"],
                "loc_coord": _fmt_loc(bx + 620, by - 480),
            },
            {
                "territory_id": f"{zid}-sanctum-mvp",
                "x_pct": 76,
                "y_pct": 28,
                "radius_pct": 10,
                "entity_type": "MVP",
                "mob_name": f"[MVP] {short_name} Dreadnought Overlord",
                "level": lmax,
                "count": 1,
                "respawn": "7200s",
                "refinement_drops": ["Sovereign Bastion Heart", "Divine Refinement Catalyst", "Oath Blood"],
                "loc_coord": _fmt_loc(bx + 840, by - 640),
            },
        ],
        "dungeon_entrance_warps": [
            {
                "warp_id": f"warp-{zid}-to-{did}",
                "label": f"🕳️ Undercroft Warp to {dname.split('(')[0].strip()} ({dfid})",
                "dungeon_id": did,
                "floor_id": dfid,
                "x_pct": 84,
                "y_pct": 50,
                "loc_coord": _fmt_loc(bx + 960, by - 320),
            }
        ],
    }


def _default_refinement_drops_and_spoils(entity_type: str) -> tuple[list[str], list[str]]:
    if entity_type == "MVP":
        return (
            ["Divine Apostle Anvil Core", "Ancient Refinement Catalyst", "Architect Seal Crest"],
            ["Divine Apostle Anvil Core (8.5% MVP Drop)", "Architect Seal Crest (15% Spoil)"],
        )
    if entity_type in ("Raid", "RaidBoss"):
        return (
            ["Blessed Enchant Weapon Scroll", "Warden Alloy Core", "Soul Crystal Stage 5"],
            ["Warden Alloy Core (15% Raid Spoil)", "Blessed Enchant Scroll (12% Drop)"],
        )
    if entity_type == "Mini-Boss":
        return (
            ["Weapon Enchant Scroll Fragment", "Tempered Alloy Plate", "Seal-Stone Cluster"],
            ["Tempered Alloy Plate (24% Spoil)", "Seal-Stone Cluster (18% Spoil)"],
        )
    return (
        ["High-Grade Iron Ore", "Varnish", "Refinement Flux Dust"],
        ["High-Grade Iron Ore (42% Spoil)", "Refinement Flux Dust (28% Spoil)"],
    )


def _ensure_spawn_tiers_in_table(rows: list[dict[str, Any]], base_id: int, base_lv: int, loc: str) -> bool:
    changed = False
    present = {r.get("entity_type") for r in rows if isinstance(r, dict)}
    if "RaidBoss" in present:
        present.add("Raid")
    bx, by = _parse_loc(loc)
    specs = [
        ("Monster", base_id + 1, "Regional Seal Stalker", "1x", 30, 100),
        ("Mini-Boss", base_id + 2, "[Mini-Boss] Seal Patrol Commander", "3x", 240, 200),
        ("Raid", base_id + 3, "[Raid Boss] Regional Seal Warden", "6x", 3600, 300),
        ("MVP", base_id + 4, "[MVP] Apostle Vanguard Manifestation", "10x", 7200, 400),
    ]
    for etype, nid, name, mult, resp, offset in specs:
        if etype not in present:
            drops, spoils = _default_refinement_drops_and_spoils(etype)
            rows.append(
                {
                    "npc_id": nid,
                    "name": name,
                    "entity_type": etype,
                    "level": base_lv,
                    "aggro": "Yes",
                    "race_key": "robotic",
                    "race_badge": f"{etype} · Tier Verified",
                    "hp_multiplier": mult,
                    "protections": ["Seal Ward"],
                    "weaknesses": ["Blunt/Elemental Weak"],
                    "spawn_count": 1 if etype != "Monster" else 16,
                    "respawn_sec": resp,
                    "loc_coord": _fmt_loc(bx + offset, by - offset),
                    "refinement_drops": drops,
                    "spoil_materials": spoils,
                }
            )
            changed = True
    for row in rows:
        if isinstance(row, dict):
            drops, spoils = _default_refinement_drops_and_spoils(str(row.get("entity_type", "Monster")))
            if not row.get("refinement_drops"):
                row["refinement_drops"] = drops
                changed = True
            if not row.get("spoil_materials"):
                row["spoil_materials"] = spoils
                changed = True
    return changed


def expand_next_wave(whc: dict[str, Any], atlas: dict[str, Any]) -> dict[str, Any]:
    """Deterministically expand 6-race spawns, next unbuilt Town Blueprint, and next unbuilt Multi-Floor Dungeon."""
    actions: list[str] = []
    zdir = atlas.setdefault("t_breadth_zone_directory", {})
    hub_towns: list[dict[str, Any]] = zdir.setdefault("other_castle_and_hub_towns", [])
    if len(hub_towns) < 9 and not any(t.get("zone_id") == NINTH_HUB_TOWN["zone_id"] for t in hub_towns):
        hub_towns.append(dict(NINTH_HUB_TOWN))
        actions.append(f"added_9th_hub_town:{NINTH_HUB_TOWN['zone_id']}")

    # 1. Ensure all 6 Playable Race Spawn Locations exist
    if len(atlas.get("race_spawn_locations") or []) < 6:
        atlas["race_spawn_locations"] = _build_race_spawn_locations(whc, atlas)
        actions.append("populated_6_race_spawn_locations")

    # 1b. Ensure all 6 Playable Race Starter-to-Endgame Growth Routes exist (D9)
    if len(atlas.get("race_growth_routes") or []) < 6:
        atlas["race_growth_routes"] = _build_race_growth_routes(whc, atlas)
        actions.append("populated_6_race_growth_routes")

    # 1c. Ensure all 6 Equipment Grades exist in `refinement_grade_matrix` (D19)
    if len(atlas.get("refinement_grade_matrix") or []) < 6:
        atlas["refinement_grade_matrix"] = _build_refinement_grade_matrix()
        actions.append("populated_6_grade_refinement_matrix")

    # 1d. Ensure all 6 Primordial Sealed-God Boss Hierarchy Chains exist in `boss_hierarchy_chains` (D21)
    if len(atlas.get("boss_hierarchy_chains") or []) < 6:
        atlas["boss_hierarchy_chains"] = _build_boss_hierarchy_chains()
        actions.append("populated_6_god_boss_hierarchy_chains")

    # 1e. Ensure all 18 Canonical 3-Track Quest & Class Transfer Trial Chains exist in `quest_trial_chains` (D23)
    if len(atlas.get("quest_trial_chains") or []) < 18:
        atlas["quest_trial_chains"] = _build_quest_trial_chains()
        actions.append("populated_18_quest_trial_chains")

    # Ensure deep_town.town_blueprint also has race_spawn_point & refinement_anvils & zone_id & shop_and_refinement_catalog
    deep_town = (atlas.get("t_deep_validation_slice") or {}).get("deep_town") or {}
    deep_tb = deep_town.get("town_blueprint")
    if isinstance(deep_tb, dict):
        deep_tb.setdefault("zone_id", deep_town.get("zone_id", "zone-town-lantern-hollow"))
        deep_tb.setdefault("studio_node_id", deep_town.get("studio_node_id", "town-lantern-hollow"))
        deep_tb.setdefault("layout_archetype", "polygonal_walled_keep")
        deep_tb.setdefault(
            "race_spawn_point",
            {
                "race_key": "human_demi_human",
                "shrine_name": "First Meridian Obelisk Shrine",
                "loc_coord": "-84050:243420",
                "x_pct": 50,
                "y_pct": 49,
            },
        )
        deep_tb.setdefault(
            "refinement_anvils",
            [
                {
                    "anvil_id": "lantern-hollow-anvil-01",
                    "name": "Master Altran's Terracotta Refinement Anvil",
                    "npc_name": "[Blacksmith] Altran",
                    "building_number": 3,
                    "x_pct": 71,
                    "y_pct": 30,
                }
            ],
        )
        if "shop_and_refinement_catalog" not in deep_tb:
            deep_tb["shop_and_refinement_catalog"] = _synthesize_shop_and_refinement_catalog(
                {"name": "Lantern Hollow Village", "level_band": [1, 10]}, 1
            )
            actions.append("populated_shop_and_refinement_catalog:zone-town-lantern-hollow")

    # Sync deep_town.town_blueprint onto starting_towns[0] if not attached yet
    starting_towns: list[dict[str, Any]] = zdir.get("starting_towns") or []
    if starting_towns and isinstance(deep_tb, dict):
        if "town_blueprint" not in starting_towns[0]:
            starting_towns[0]["town_blueprint"] = deep_tb
        elif isinstance(starting_towns[0].get("town_blueprint"), dict):
            starting_towns[0]["town_blueprint"].setdefault("layout_archetype", deep_tb.get("layout_archetype", "polygonal_walled_keep"))
            if "shop_and_refinement_catalog" not in starting_towns[0]["town_blueprint"]:
                starting_towns[0]["town_blueprint"]["shop_and_refinement_catalog"] = deep_tb["shop_and_refinement_catalog"]

    # 2. Expand next unbuilt Town Blueprint among the 6 Starting Towns + 9 Castle/Hub Towns, and ensure D10 shop_and_refinement_catalog & D11 layout_archetype
    all_towns = starting_towns + hub_towns
    for idx, t_entry in enumerate(all_towns, start=1):
        if "town_blueprint" not in t_entry:
            t_entry["town_blueprint"] = _synthesize_town_blueprint(t_entry, idx)
            t_entry["t_depth_status"] = "t_deep_validated"
            actions.append(f"expanded_town_blueprint:{t_entry['zone_id']}")
            break
        elif isinstance(t_entry.get("town_blueprint"), dict):
            tb_cur = t_entry["town_blueprint"]
            if "shop_and_refinement_catalog" not in tb_cur:
                tb_cur["shop_and_refinement_catalog"] = _synthesize_shop_and_refinement_catalog(t_entry, idx)
                actions.append(f"populated_shop_and_refinement_catalog:{t_entry['zone_id']}")
            expected_arch = _resolve_town_layout_archetype(t_entry, idx)
            if tb_cur.get("layout_archetype") not in (
                "radial_moat_sanctuary",
                "polygonal_walled_keep",
                "schematic_grid_blueprint",
                "harbor_fortress_plaza",
            ):
                tb_cur["layout_archetype"] = expected_arch
                actions.append(f"populated_town_layout_archetype:{t_entry['zone_id']}:{expected_arch}")

    # Mirror all built town_blueprints into root `town_blueprints` array for fast lookup
    atlas["town_blueprints"] = [t["town_blueprint"] for t in all_towns if isinstance(t.get("town_blueprint"), dict)]

    # 3. Expand next unbuilt Multi-Floor Dungeon among Regular Dungeons + Seven Signs Catacombs
    mf_list: list[dict[str, Any]] = atlas.setdefault("multi_floor_dungeons", [])
    mf_by_id = {d["dungeon_id"]: d for d in mf_list if isinstance(d, dict) and d.get("dungeon_id")}
    all_dungeons = (zdir.get("regular_dungeons") or []) + (zdir.get("seven_signs_seal_catacombs") or [])
    for idx, d_entry in enumerate(all_dungeons, start=1):
        did = str(d_entry.get("zone_id", ""))
        if did and did not in mf_by_id:
            new_mf = _synthesize_multifloor_dungeon(d_entry, idx)
            mf_list.append(new_mf)
            d_entry["t_depth_status"] = "t_deep_validated"
            actions.append(f"expanded_multi_floor_dungeon:{did}")
            break

    # 4. Ensure existing multi-floor dungeon floors and deep validation slice have all 4 filterable tiers
    deep_slice = atlas.get("t_deep_validation_slice") or {}
    for dkey, base_id, base_lv in (("deep_field_zone", 29500, 12), ("deep_dungeon", 29600, 22)):
        d_obj = deep_slice.get(dkey) or {}
        if isinstance(d_obj.get("spawn_table"), list):
            if _ensure_spawn_tiers_in_table(d_obj["spawn_table"], base_id, base_lv, d_obj.get("loc_coord", "72986:113330")):
                actions.append(f"completed_spawn_tiers:{dkey}")

    for d_idx, mf in enumerate(mf_list, start=1):
        is_tower_mf = mf.get("dungeon_kind") == "vertical_tower"
        for fl in mf.get("floors") or []:
            if isinstance(fl.get("spawns"), list):
                if _ensure_spawn_tiers_in_table(
                    fl["spawns"],
                    29700 + d_idx * 30 + int(fl.get("floor_index", 1)) * 5,
                    20 + int(fl.get("floor_index", 1)) * 2,
                    mf.get("entrance_loc", "48550:248400"),
                ):
                    actions.append(f"completed_floor_spawns:{mf['dungeon_id']}:{fl.get('floor_id')}")
            elev_m, boss_hl = _resolve_floor_elevation_and_boss_highlight(
                is_tower_mf,
                int(fl.get("floor_index", 1)),
                str(fl.get("floor_id", "B1")),
                fl.get("spawns") or [],
            )
            if "floor_elevation_meters" not in fl or "boss_tier_highlight" not in fl:
                fl["floor_elevation_meters"] = elev_m
                fl["boss_tier_highlight"] = boss_hl
                actions.append(f"populated_floor_elevation:{mf['dungeon_id']}:{fl.get('floor_id')}:{elev_m}m")

    # 5. Ensure all 24 Field Hunting Areas exist in `fields_and_hunting_areas`
    fields_list: list[dict[str, Any]] = zdir.setdefault("fields_and_hunting_areas", [])
    existing_field_ids = {f.get("zone_id") for f in fields_list if isinstance(f, dict)}
    for add_f in ADDITIONAL_FIELD_ZONES:
        if len(fields_list) >= 24:
            break
        if add_f["zone_id"] not in existing_field_ids:
            fields_list.append(dict(add_f))
            existing_field_ids.add(add_f["zone_id"])
            actions.append(f"added_field_hunting_zone:{add_f['zone_id']}")

    mf_by_id = {d["dungeon_id"]: d for d in mf_list if isinstance(d, dict) and d.get("dungeon_id")}

    # 6. Expand next unbuilt Field Tactical Blueprint among the 24 Field Hunting Areas
    for idx, f_entry in enumerate(fields_list, start=1):
        if "field_tactical_blueprint" not in f_entry:
            f_entry["field_tactical_blueprint"] = _synthesize_field_tactical_blueprint(f_entry, idx, mf_by_id)
            f_entry["t_depth_status"] = "t_deep_validated"
            actions.append(f"expanded_field_tactical_blueprint:{f_entry['zone_id']}")
            break

    # Sync deep_field_zone.field_tactical_blueprint with fields_and_hunting_areas[0]
    deep_field = (atlas.get("t_deep_validation_slice") or {}).get("deep_field_zone")
    if isinstance(deep_field, dict) and fields_list and isinstance(fields_list[0].get("field_tactical_blueprint"), dict):
        deep_field["field_tactical_blueprint"] = fields_list[0]["field_tactical_blueprint"]

    atlas["field_tactical_blueprints"] = [
        f["field_tactical_blueprint"]
        for f in fields_list
        if isinstance(f.get("field_tactical_blueprint"), dict)
    ]

    # 7. Expand next unbuilt Harbor / Clan Hall / Fortress Blueprint among the 8 Harbors/ClanHalls/Forts
    forts_list: list[dict[str, Any]] = zdir.setdefault("harbors_clanhalls_and_forts", [])
    for idx, h_entry in enumerate(forts_list, start=1):
        if "fortress_blueprint" not in h_entry:
            h_entry["fortress_blueprint"] = _synthesize_fortress_blueprint(h_entry, idx, mf_by_id)
            h_entry["t_depth_status"] = "t_deep_validated"
            actions.append(f"expanded_fortress_blueprint:{h_entry['zone_id']}")
            break

    atlas["fortress_blueprints"] = [
        h["fortress_blueprint"]
        for h in forts_list
        if isinstance(h.get("fortress_blueprint"), dict)
    ]

    # 8. Ensure all 40 Combat Zone Farming Efficiency Profiles exist in `farming_efficiency_profiles` (D24)
    if len(atlas.get("farming_efficiency_profiles") or []) < 40:
        atlas["farming_efficiency_profiles"] = _build_farming_efficiency_profiles(atlas)
        actions.append("populated_40_farming_efficiency_profiles")

    # 9. Ensure all 8 Castle Siege, Territory Tax & Clan Hall Domains exist in `castle_siege_domains` (D25)
    if len(atlas.get("castle_siege_domains") or []) < 8:
        atlas["castle_siege_domains"] = _build_castle_siege_domains(atlas)
        actions.append("populated_8_castle_siege_domains")

    # 10. Ensure all 32 World Boss & MVP Respawn Radar Entries exist in `world_boss_spawn_radar` (D26)
    if len(atlas.get("world_boss_spawn_radar") or []) < 32:
        atlas["world_boss_spawn_radar"] = _build_world_boss_spawn_radar(atlas)
        actions.append("populated_32_world_boss_spawn_radar")

    # 11. Ensure all 16 Seven-Seals Dusk vs. Dawn Catacomb/Tower Competitions & Mammon Rotations exist in `seven_seals_competitions` (D27)
    if len(atlas.get("seven_seals_competitions") or []) < 16:
        atlas["seven_seals_competitions"] = _build_seven_seals_competitions(atlas)
        actions.append("populated_16_seven_seals_competitions")

    # 12. Ensure all 15 Town Manor Seed/Crop & Regional Caravan Trade Economy Routes exist in `manor_economy_routes` (D28)
    if len(atlas.get("manor_economy_routes") or []) < 15:
        atlas["manor_economy_routes"] = _build_manor_economy_routes(atlas)
        actions.append("populated_15_manor_economy_routes")

    # 13. Ensure all 21 Subclass, Noblesse & Grand Olympiad Monument Network Nodes exist in `noblesse_olympiad_network` (D29)
    if len(atlas.get("noblesse_olympiad_network") or []) < 21:
        atlas["noblesse_olympiad_network"] = _build_noblesse_olympiad_network(atlas)
        actions.append("populated_21_noblesse_olympiad_network")

    # 14. Ensure all 18 Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Lines exist in `intercontinental_transit_lines` (D30)
    if len(atlas.get("intercontinental_transit_lines") or []) < 18:
        atlas["intercontinental_transit_lines"] = _build_intercontinental_transit_lines(atlas)
        actions.append("populated_18_intercontinental_transit_lines")

    # 15. Ensure all 18 Soul Crystal (SA) Stage 1-13 Resonance & Boss Absorption Entries exist in `soul_crystal_resonance_stages` (D31)
    if len(atlas.get("soul_crystal_resonance_stages") or []) < 18:
        atlas["soul_crystal_resonance_stages"] = _build_soul_crystal_resonance_stages(atlas)
        actions.append("populated_18_soul_crystal_resonance_stages")

    # 16. Ensure all 16 Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuaries exist in `fishing_guild_sanctuaries` (D32)
    if len(atlas.get("fishing_guild_sanctuaries") or []) < 16:
        atlas["fishing_guild_sanctuaries"] = _build_fishing_guild_sanctuaries(atlas)
        actions.append("populated_16_fishing_guild_sanctuaries")

    # 17. Ensure all 14 Cursed Weapon, PK Karma Redemption & Open-World PvP Arena Hotspots exist in `cursed_weapon_pvp_hotspots` (D33)
    if len(atlas.get("cursed_weapon_pvp_hotspots") or []) < 14:
        atlas["cursed_weapon_pvp_hotspots"] = _build_cursed_weapon_pvp_hotspots(atlas)
        actions.append("populated_14_cursed_weapon_pvp_hotspots")

    # 18. Ensure all 16 Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctums exist in `dimensional_rift_sepulchers` (D34)
    if len(atlas.get("dimensional_rift_sepulchers") or []) < 16:
        atlas["dimensional_rift_sepulchers"] = _build_dimensional_rift_sepulchers(atlas)
        actions.append("populated_16_dimensional_rift_sepulchers")

    # 19. Ensure all 15 Town Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Hubs exist in `weapon_augmentation_dye_hubs` (D35)
    if len(atlas.get("weapon_augmentation_dye_hubs") or []) < 15:
        atlas["weapon_augmentation_dye_hubs"] = _build_weapon_augmentation_dye_hubs(atlas)
        actions.append("populated_15_weapon_augmentation_dye_hubs")

    # 20. Ensure all 12 Pet, Strider & Castle Wyvern Mount Sanctuaries exist in `companion_mount_sanctuaries` (D36)
    if len(atlas.get("companion_mount_sanctuaries") or []) < 12:
        atlas["companion_mount_sanctuaries"] = _build_companion_mount_sanctuaries(atlas)
        actions.append("populated_12_companion_mount_sanctuaries")

    # 21. Ensure all 14 Clan Reputation, Academy & Pledge Skill Nodes exist in `clan_reputation_academies` (D37)
    if len(atlas.get("clan_reputation_academies") or []) < 14:
        atlas["clan_reputation_academies"] = _build_clan_reputation_academies(atlas)
        actions.append("populated_14_clan_reputation_academies")

    # 22. Ensure all 24 Field Elemental Attribute & Ground Herb Sustainability Biomes exist in `field_herb_elemental_biomes` (D38)
    if len(atlas.get("field_herb_elemental_biomes") or []) < 24:
        atlas["field_herb_elemental_biomes"] = _build_field_herb_elemental_biomes(atlas)
        actions.append("populated_24_field_herb_elemental_biomes")

    # 23. Ensure all 15 Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Plazas exist in `soulshot_workshop_plazas` (D39)
    if len(atlas.get("soulshot_workshop_plazas") or []) < 15:
        atlas["soulshot_workshop_plazas"] = _build_soulshot_workshop_plazas(atlas)
        actions.append("populated_15_soulshot_workshop_plazas")

    # 24. Ensure all 16 Territory War & Fortress Supply Nodes exist in `territory_ward_supply_nodes` (D40)
    if len(atlas.get("territory_ward_supply_nodes") or []) < 16:
        atlas["territory_ward_supply_nodes"] = _build_territory_ward_supply_nodes(atlas)
        actions.append("populated_16_territory_ward_supply_nodes")

    # 25. Ensure all 12 Epic Boss Jewelry Relics & Sanctums exist in `epic_jewelry_sanctums` (D41)
    if len(atlas.get("epic_jewelry_sanctums") or []) < 12:
        atlas["epic_jewelry_sanctums"] = _build_epic_jewelry_sanctums(atlas)
        actions.append("populated_12_epic_jewelry_sanctums")

    # 26. Ensure all 15 Town Adventurer's Guide & Vitality Obelisks exist in `adventurer_vitality_obelisks` (D42)
    if len(atlas.get("adventurer_vitality_obelisks") or []) < 15:
        atlas["adventurer_vitality_obelisks"] = _build_adventurer_vitality_obelisks(atlas)
        actions.append("populated_15_adventurer_vitality_obelisks")

    # 27. Ensure all 16 Armor Set & Masterwork Foundation Forges exist in `armor_set_masterwork_forges` (D43)
    if len(atlas.get("armor_set_masterwork_forges") or []) < 16:
        atlas["armor_set_masterwork_forges"] = _build_armor_set_masterwork_forges(atlas)
        actions.append("populated_16_armor_set_masterwork_forges")

    # 28. Ensure all 15 Kamaloka, Pailaka & Seed Instance Portals exist in `kamaloka_pailaka_instances` (D44)
    if len(atlas.get("kamaloka_pailaka_instances") or []) < 15:
        atlas["kamaloka_pailaka_instances"] = _build_kamaloka_pailaka_instances(atlas)
        actions.append("populated_15_kamaloka_pailaka_instances")

    return {"actions": actions}


def _is_valid_tactical_blueprint(bp: Any) -> bool:
    if not isinstance(bp, dict):
        return False
    marks = {m.get("mark_type") for m in (bp.get("camp_and_shrine_marks") or []) if isinstance(m, dict)}
    if not all(req in marks for req in REQUIRED_FIELD_MARKS):
        return False
    territories = bp.get("spawn_territories") or []
    t_types = {t.get("entity_type") for t in territories if isinstance(t, dict) and t.get("refinement_drops")}
    if not all(req in t_types for req in REQUIRED_SPAWN_TIERS):
        return False
    warps = bp.get("dungeon_entrance_warps") or []
    if not warps or not all(isinstance(w, dict) and w.get("dungeon_id") and w.get("floor_id") for w in warps):
        return False
    return True


def audit_world_atlas(whc: dict[str, Any], atlas: dict[str, Any]) -> dict[str, Any]:
    """Compute 0-100 scores across D1..D8."""
    zdir = atlas.get("t_breadth_zone_directory") or {}
    starting_towns = zdir.get("starting_towns") or []
    hub_towns = zdir.get("other_castle_and_hub_towns") or []
    all_towns = starting_towns + hub_towns
    reg_dungeons = zdir.get("regular_dungeons") or []
    catacombs = zdir.get("seven_signs_seal_catacombs") or []
    all_dungeons = reg_dungeons + catacombs
    fields_list = zdir.get("fields_and_hunting_areas") or []
    forts_list = zdir.get("harbors_clanhalls_and_forts") or []

    # D1: 6 Playable Race Spawn Locations
    r_spawns = atlas.get("race_spawn_locations") or []
    valid_spawns = [
        s
        for s in r_spawns
        if isinstance(s, dict)
        and ":" in str(s.get("loc_coord", ""))
        and s.get("starter_town_node_id")
        and s.get("starter_shrine_monument")
        and isinstance(s.get("macro_map_marker"), dict)
        and isinstance(s.get("town_blueprint_marker"), dict)
    ]
    d1_score = round(min(100.0, (len(valid_spawns) / 6.0) * 100.0), 1)

    # D2: Town Street Blueprints & NPC (Shop + Refinement) Coverage (6 Starting + 9 Hub = 15)
    valid_town_bps = 0
    for t in all_towns:
        tb = t.get("town_blueprint")
        if not isinstance(tb, dict):
            continue
        marks = {m.get("mark_type") for m in (tb.get("service_marks") or []) if isinstance(m, dict)}
        roster = tb.get("npc_roster") or []
        has_refine = bool(tb.get("refinement_anvils")) or "refinement_anvils" in marks or "blacksmith" in marks
        if all(req in marks for req in REQUIRED_SERVICE_MARKS) and has_refine and len(roster) == 12:
            valid_town_bps += 1
    target_towns = max(15, len(all_towns))
    d2_score = round((valid_town_bps / float(target_towns)) * 100.0, 1)

    # D3: Multi-Floor Underground & Tower Dungeon Warp Coverage
    mf_dungeons = atlas.get("multi_floor_dungeons") or []
    valid_mf = 0
    for d in mf_dungeons:
        floors = d.get("floors") or []
        f_ids = [f.get("floor_id") for f in floors if isinstance(f, dict)]
        if f_ids in (["B1", "B2", "B3"], ["1F", "2F", "3F"]) and all(
            len(f.get("rooms") or []) >= 2 and len(f.get("warp_points") or []) >= 2 for f in floors
        ):
            valid_mf += 1
    target_dungeons = max(1, len(all_dungeons))
    d3_score = round(min(100.0, (valid_mf / float(target_dungeons)) * 100.0), 1)

    # D4: Monster, Mini-Boss, Raid & MVP Spawn & Filter Coverage
    spawn_containers: list[list[dict[str, Any]]] = []
    deep_slice = atlas.get("t_deep_validation_slice") or {}
    for dk in ("deep_field_zone", "deep_dungeon"):
        st = (deep_slice.get(dk) or {}).get("spawn_table")
        if isinstance(st, list):
            spawn_containers.append(st)
    for d in mf_dungeons:
        for fl in d.get("floors") or []:
            if isinstance(fl.get("spawns"), list):
                spawn_containers.append(fl["spawns"])
    for f_entry in fields_list:
        ftb = f_entry.get("field_tactical_blueprint")
        if isinstance(ftb, dict) and isinstance(ftb.get("spawn_territories"), list):
            spawn_containers.append(ftb["spawn_territories"])
    for h_entry in forts_list:
        fbp = h_entry.get("fortress_blueprint")
        if isinstance(fbp, dict) and isinstance(fbp.get("spawn_territories"), list):
            spawn_containers.append(fbp["spawn_territories"])
    full_tier_containers = 0
    for rows in spawn_containers:
        types = {r.get("entity_type") for r in rows if isinstance(r, dict)}
        if "RaidBoss" in types:
            types.add("Raid")
        if all(t in types for t in REQUIRED_SPAWN_TIERS):
            full_tier_containers += 1
    d4_score = round((full_tier_containers / float(max(1, len(spawn_containers)))) * 100.0, 1)

    # D5: Geographic Travel Path & Anti-Clutter Score
    all_zones = [
        z
        for cat in zdir.values()
        if isinstance(cat, list)
        for z in cat
        if isinstance(z, dict)
    ]
    connected_zones = [z for z in all_zones if len(z.get("connected_zone_ids") or []) >= 1]
    coords = [z.get("loc_coord") for z in all_zones if z.get("loc_coord")]
    unique_coords_ratio = len(set(coords)) / float(max(1, len(coords)))
    conn_ratio = len(connected_zones) / float(max(1, len(all_zones)))
    d5_score = round((0.6 * conn_ratio + 0.4 * unique_coords_ratio) * 100.0, 1)

    # D7: 24 Field Hunting Area Tactical Blueprints
    valid_field_bps = sum(1 for f in fields_list if _is_valid_tactical_blueprint(f.get("field_tactical_blueprint")))
    target_fields = max(24, len(fields_list))
    d7_score = round((valid_field_bps / float(target_fields)) * 100.0, 1)

    # D8: 8 Harbor, Clan Hall & Fortress Tactical Blueprints
    valid_fort_bps = sum(1 for h in forts_list if _is_valid_tactical_blueprint(h.get("fortress_blueprint")))
    target_forts = max(8, len(forts_list))
    d8_score = round((valid_fort_bps / float(target_forts)) * 100.0, 1)

    # D9: 6-Race Starter-to-Endgame Travel Path Highlighter (`race_growth_routes`)
    r_routes = atlas.get("race_growth_routes") or []
    valid_modes = {"footpath", "highway", "gatekeeper_teleport", "dungeon_warp", "sea_or_airship"}
    valid_routes = [
        rt
        for rt in r_routes
        if isinstance(rt, dict)
        and rt.get("race_label") in ("Human", "Lunar", "Ogre/Orc", "Dwarf", "Dark-Lunar", "Furral")
        and len(rt.get("waypoints") or []) >= 7
        and all(
            isinstance(wp, dict)
            and wp.get("step_index")
            and wp.get("stage_code")
            and wp.get("zone_id")
            and wp.get("travel_mode") in valid_modes
            and wp.get("milestone_goal")
            for wp in (rt.get("waypoints") or [])
        )
    ]
    d9_score = round(min(100.0, (len(valid_routes) / 6.0) * 100.0), 1)

    # D10: NPC Shop Catalog & +1..+15 Refinement Inspector in Town Blueprints (`shop_and_refinement_catalog`)
    valid_shop_catalogs = 0
    for t in all_towns:
        tb = t.get("town_blueprint") or {}
        cat = tb.get("shop_and_refinement_catalog")
        if (
            isinstance(cat, dict)
            and len(cat.get("equip_shop_stock") or []) >= 4
            and len(cat.get("consumable_shop_stock") or []) >= 4
            and len(cat.get("refinement_anvil_rates") or []) >= 5
            and len(cat.get("blacksmith_material_spoils") or []) >= 3
        ):
            valid_shop_catalogs += 1
    d10_score = round((valid_shop_catalogs / float(target_towns)) * 100.0, 1)

    # D11: 4 Distinct Town Architectural Layout Geometries (`layout_archetype` across 15 Towns)
    valid_archetypes_set = {
        "radial_moat_sanctuary",
        "polygonal_walled_keep",
        "schematic_grid_blueprint",
        "harbor_fortress_plaza",
    }
    town_archetypes_seen: set[str] = set()
    valid_town_archetypes = 0
    for t in all_towns:
        tb = t.get("town_blueprint") or {}
        arch = tb.get("layout_archetype")
        if arch in valid_archetypes_set:
            valid_town_archetypes += 1
            town_archetypes_seen.add(str(arch))
    d11_score = round((valid_town_archetypes / float(target_towns)) * 100.0, 1) if len(town_archetypes_seen) == 4 else round((valid_town_archetypes / float(target_towns)) * 75.0, 1)

    # D12: Multi-Floor Underground vs. Vertical Tower Cutaway Diagram (`floor_elevation_meters` & `boss_tier_highlight` across 16 Dungeons)
    valid_dungeon_cutaways = 0
    for d in mf_dungeons:
        dkind = d.get("dungeon_kind")
        floors = d.get("floors") or []
        if len(floors) >= 3 and all(
            isinstance(fl, dict)
            and isinstance(fl.get("floor_elevation_meters"), int)
            and ((dkind == "vertical_tower" and fl.get("floor_elevation_meters", 0) > 0) or (dkind == "underground_labyrinth" and fl.get("floor_elevation_meters", 0) < 0))
            and bool(fl.get("boss_tier_highlight"))
            for fl in floors
        ):
            valid_dungeon_cutaways += 1
    d12_score = round((valid_dungeon_cutaways / float(target_dungeons)) * 100.0, 1)

    # D13: Instant Atlas Omni-Search & Quick-Jump Index Coverage (63 Zones, 180 Town NPCs, 105 Town Service Marks, 48 Dungeon Floors)
    indexed_zones = sum(
        1
        for z in all_zones
        if isinstance(z, dict)
        and z.get("zone_id")
        and z.get("studio_node_id")
        and z.get("name")
        and z.get("l2_reference_analog")
        and ":" in str(z.get("loc_coord", ""))
    )
    indexed_town_npcs = sum(
        len(
            [
                n
                for n in ((t.get("town_blueprint") or {}).get("npc_roster") or [])
                if isinstance(n, dict)
                and n.get("building_number")
                and n.get("name")
                and n.get("role_title")
                and ":" in str(n.get("loc_coord", ""))
            ]
        )
        for t in all_towns
    )
    indexed_service_marks = sum(
        len(
            {
                m.get("mark_type")
                for m in ((t.get("town_blueprint") or {}).get("service_marks") or [])
                if isinstance(m, dict) and m.get("mark_type") in REQUIRED_SERVICE_MARKS
            }
        )
        for t in all_towns
    )
    indexed_dungeon_floors = sum(
        len(
            [
                fl
                for fl in (d.get("floors") or [])
                if isinstance(fl, dict) and fl.get("floor_id") and fl.get("name") and fl.get("level_range")
            ]
        )
        for d in mf_dungeons
    )
    d13_ratio = (
        min(1.0, indexed_zones / 63.0)
        + min(1.0, indexed_town_npcs / 180.0)
        + min(1.0, indexed_service_marks / 105.0)
        + min(1.0, indexed_dungeon_floors / 48.0)
    ) / 4.0
    d13_score = round(d13_ratio * 100.0, 1)

    # D14: Interactive Monster / Mini-Boss / Raid / MVP Spawn & Refinement-Spoil Matrix (16 Multi-Floor Dungeons + 24 Field Hunting Areas)
    valid_dng_spawns = 0
    for d in mf_dungeons:
        did = d.get("dungeon_id")
        floors = d.get("floors") or []
        if did and len(floors) >= 3 and all(
            isinstance(fl, dict)
            and fl.get("floor_id")
            and all(
                any(
                    isinstance(sp, dict)
                    and (sp.get("entity_type") == req_tier or (req_tier == "Raid" and sp.get("entity_type") == "RaidBoss"))
                    and len(sp.get("refinement_drops") or []) >= 1
                    and len(sp.get("spoil_materials") or sp.get("refinement_drops") or []) >= 1
                    and ":" in str(sp.get("loc_coord", ""))
                    for sp in (fl.get("spawns") or [])
                )
                for req_tier in REQUIRED_SPAWN_TIERS
            )
            for fl in floors
        ):
            valid_dng_spawns += 1

    valid_field_spawns = 0
    for f_entry in fields_list:
        ftb = f_entry.get("field_tactical_blueprint") or {}
        st_list = ftb.get("spawn_territories") or []
        warps = ftb.get("dungeon_entrance_warps") or []
        if (
            f_entry.get("zone_id")
            and ":" in str(f_entry.get("loc_coord", ""))
            and len(warps) >= 1
            and all(
                any(
                    isinstance(st, dict)
                    and st.get("entity_type") == req_tier
                    and len(st.get("refinement_drops") or []) >= 1
                    and ":" in str(st.get("loc_coord", ""))
                    for st in st_list
                )
                for req_tier in REQUIRED_SPAWN_TIERS
            )
        ):
            valid_field_spawns += 1

    d14_score = round(
        ((valid_dng_spawns / float(target_dungeons)) * 0.5 + (valid_field_spawns / float(target_fields)) * 0.5)
        * 100.0,
        1,
    )

    # D15: High-Resolution Per-Archetype Cartographic Raster Plates (11/11 raster plates present & non-empty in content/studio/maps/)
    maps_dir = STUDIO_DIR / "maps"
    present_plates: list[str] = []
    for plate_name in ARCHETYPE_RASTER_PLATES:
        p_file = maps_dir / plate_name
        if p_file.is_file() and p_file.stat().st_size > 0:
            present_plates.append(plate_name)
    d15_score = round((len(present_plates) / float(len(ARCHETYPE_RASTER_PLATES))) * 100.0, 1)

    # D16: Unified 63-Zone Connected Map Directory (6 Starting Towns, 9 Castle/Hub Towns, 24 Fields, 16 Multi-Floor Dungeons/Catacombs, 8 Harbors/ClanHalls/Forts)
    d16_groups = {
        "Starting Towns (6)": len([z for z in starting_towns if isinstance(z, dict) and ":" in str(z.get("loc_coord", "")) and z.get("level_band") and isinstance(z.get("town_blueprint"), dict)]),
        "Castle & Hub Towns (9)": len([z for z in hub_towns if isinstance(z, dict) and ":" in str(z.get("loc_coord", "")) and z.get("level_band") and isinstance(z.get("town_blueprint"), dict)]),
        "Fields & Hunting Areas (24)": len([z for z in fields_list if isinstance(z, dict) and ":" in str(z.get("loc_coord", "")) and z.get("level_band") and isinstance(z.get("field_tactical_blueprint"), dict)]),
        "Multi-Floor Dungeons & Catacombs (16)": len([z for z in all_dungeons if isinstance(z, dict) and ":" in str(z.get("loc_coord", "")) and z.get("level_band")]),
        "Harbors, Clan Halls & Fortresses (8)": len([z for z in forts_list if isinstance(z, dict) and ":" in str(z.get("loc_coord", "")) and z.get("level_band") and isinstance(z.get("fortress_blueprint"), dict)]),
    }
    d16_verified_zones = sum(d16_groups.values())
    web_script = REPO_ROOT / "scripts" / "catalog_explorer_web.py"
    web_txt = web_script.read_text(encoding="utf-8") if web_script.is_file() else ""
    has_d16_ui = all(
        tok in web_txt
        for tok in (
            "renderMapDirectory",
            "Starting Towns (6)",
            "Castle & Hub Towns (9)",
            "Fields & Hunting Areas (24)",
            "Multi-Floor Dungeons & Catacombs (16)",
            "Harbors, Clan Halls & Fortresses (8)",
        )
    )
    d16_score = round(min(100.0, (d16_verified_zones / 63.0) * 100.0), 1) if has_d16_ui else round((d16_verified_zones / 63.0) * 80.0, 1)

    # D17: Interactive Point-to-Point Travel Route & Gatekeeper Calculator (BFS reachability across all 63 zones from all 6 Starter Towns)
    zone_ids_set = {str(z.get("zone_id")) for z in all_zones if isinstance(z, dict) and z.get("zone_id")}
    adj_graph: dict[str, set[str]] = {zid: set() for zid in zone_ids_set}
    for z in all_zones:
        if not isinstance(z, dict):
            continue
        u = str(z.get("zone_id") or "")
        if u not in adj_graph:
            continue
        for nb in z.get("connected_zone_ids") or []:
            v = str(nb)
            if v in adj_graph:
                adj_graph[u].add(v)
                adj_graph[v].add(u)

    starter_zone_ids = [
        str(z.get("zone_id"))
        for z in starting_towns
        if isinstance(z, dict) and str(z.get("zone_id")) in adj_graph
    ]
    starter_reachability: dict[str, int] = {}
    reachable_pairs = 0
    target_pairs = max(1, len(starter_zone_ids) * len(zone_ids_set))
    for st_id in starter_zone_ids:
        visited_bfs = {st_id}
        queue_bfs = [st_id]
        while queue_bfs:
            cur_u = queue_bfs.pop(0)
            for nxt_v in adj_graph.get(cur_u, set()):
                if nxt_v not in visited_bfs:
                    visited_bfs.add(nxt_v)
                    queue_bfs.append(nxt_v)
        starter_reachability[st_id] = len(visited_bfs)
        reachable_pairs += len(visited_bfs)

    has_d17_ui = all(
        tok in web_txt
        for tok in (
            "computeShortestAtlasZonePath",
            "setAtlasRouteEndpoints",
            "ATLAS_ROUTE_FROM_ID",
            "ATLAS_ROUTE_TO_ID",
            "Gludin Village ➔ The Ant Nest",
            "Gludin Village ➔ Town of Dion",
            "Town of Dion ➔ Cruma Tower",
            "Town of Oren ➔ Tower of Insolence",
        )
    )
    d17_ratio = reachable_pairs / float(max(1, 6 * 63))
    d17_score = round(min(100.0, d17_ratio * 100.0), 1) if has_d17_ui else round(d17_ratio * 80.0, 1)

    # D18: Clickable Dungeon Room/Chamber Inspector & Product Owner Self-Evaluation Telemetry Integration
    clickable_chambers = 0
    total_chambers = 0
    clickable_spawns = 0
    total_spawns = 0
    for d in mf_dungeons:
        for fl in d.get("floors") or []:
            if not isinstance(fl, dict):
                continue
            for rm in fl.get("rooms") or []:
                if isinstance(rm, dict):
                    total_chambers += 1
                    if rm.get("room_id") and rm.get("name") and float(rm.get("corridor_width_meters", 0.0)) >= 6.0 and len(rm.get("key_mobs") or []) >= 1:
                        clickable_chambers += 1
            for sp in fl.get("spawns") or []:
                if isinstance(sp, dict):
                    total_spawns += 1
                    if sp.get("npc_id") and sp.get("name") and len(sp.get("refinement_drops") or []) >= 1:
                        clickable_spawns += 1

    has_d18_ui_and_telemetry = all(
        tok in web_txt
        for tok in (
            "selectDungeonRoomPoi",
            "compute_studio_self_evaluation",
            "18-Dimension Semantic-Zoom Atlas Score",
            "/api/studio/self-evaluation",
        )
    )
    d18_data_ratio = (
        (clickable_chambers / float(max(1, total_chambers))) * 0.5
        + (clickable_spawns / float(max(1, total_spawns))) * 0.5
    )
    d18_score = round(min(100.0, d18_data_ratio * 100.0), 1) if has_d18_ui_and_telemetry else round(d18_data_ratio * 80.0, 1)

    # D19: Interactive Blacksmith Refinement (+1..+15) & Material Spoil Source Locator (`refinement_grade_matrix`)
    expected_grade_codes = (
        "No-Grade Lv.1–19",
        "D-Grade Lv.20–39",
        "C-Grade Lv.40–51",
        "B-Grade Lv.52–60",
        "A-Grade Lv.61–75",
        "S-Grade Lv.76–99",
    )
    town_zone_id_set = {
        str(t.get("zone_id"))
        for t in all_towns
        if isinstance(t, dict) and t.get("zone_id")
    }
    valid_drop_zone_id_set = {
        str(f.get("zone_id"))
        for f in fields_list
        if isinstance(f, dict) and f.get("zone_id")
    } | {
        str(d.get("dungeon_id"))
        for d in mf_dungeons
        if isinstance(d, dict) and d.get("dungeon_id")
    }
    ref_matrix = atlas.get("refinement_grade_matrix") or []
    valid_grades = 0
    for g_entry in ref_matrix:
        if not isinstance(g_entry, dict):
            continue
        gcode = str(g_entry.get("grade_code") or "")
        rates = g_entry.get("rates_by_plus") or []
        mats = g_entry.get("required_materials") or []
        smith_towns = g_entry.get("home_blacksmith_towns") or []
        if (
            gcode in expected_grade_codes
            and g_entry.get("safe_refinement_level") == 3
            and g_entry.get("max_refinement_level") == 15
            and len(g_entry.get("representative_weapons") or []) >= 2
            and len(g_entry.get("representative_armor") or []) >= 2
            and len(rates) == 15
            and [r.get("plus_level") for r in rates if isinstance(r, dict)] == list(range(1, 16))
            and len(mats) >= 2
            and all(
                isinstance(m, dict)
                and m.get("material_name")
                and len(m.get("drop_zones") or []) >= 2
                and all(str(dz) in valid_drop_zone_id_set for dz in (m.get("drop_zones") or []))
                for m in mats
            )
            and len(smith_towns) >= 2
            and all(str(tz) in town_zone_id_set for tz in smith_towns)
        ):
            valid_grades += 1

    has_d19_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_REFINE_GRADE",
            "ATLAS_REFINE_PLUS",
            "setAtlasRefineGrade",
            "setAtlasRefinePlus",
            "Jump to Blacksmith Town Street Map",
            "Highlight Material Drop Zones / Open Dungeon Floor",
        )
    )
    d19_ratio = valid_grades / 6.0
    d19_score = round(min(100.0, d19_ratio * 100.0), 1) if has_d19_ui else round(d19_ratio * 80.0, 1)

    # D20: Bidirectional 4-Perspective Studio ⇄ Dedicated World Atlas Sync & Documentation
    readme_path = REPO_ROOT / "README.md"
    readme_txt = readme_path.read_text(encoding="utf-8") if readme_path.is_file() else ""
    drawio_path = REPO_ROOT / "docs" / "superpowers" / "specs" / "2026-10-20-semantic-zoom-world-atlas-design.drawio"
    has_d20_sync_js = all(
        tok in web_txt
        for tok in (
            "syncStudioNodeToDedicatedAtlas",
            "ATLAS_FOCUSED_TOWN_ID",
            "ATLAS_FOCUSED_FIELD_ID",
            "ATLAS_ACTIVE_DUNGEON_ID",
            "20-Dimension Semantic-Zoom Atlas Score",
        )
    )
    has_d20_readme = all(
        tok in readme_txt
        for tok in (
            "20-Dimension",
            "D1–D20",
            "refinement_grade_matrix",
            "syncStudioNodeToDedicatedAtlas",
        )
    )
    has_d20_drawio = drawio_path.is_file() and drawio_path.stat().st_size > 1000
    d20_checks = [has_d20_sync_js, has_d20_readme, has_d20_drawio]
    d20_score = round((sum(1 for c in d20_checks if c) / float(len(d20_checks))) * 100.0, 1)

    # D21: Interactive 5-Tier Boss Power Hierarchy & Sealed-God Chain Overlay (`boss_hierarchy_chains`)
    expected_god_ids = (
        "god-sola-hearth-weaver",
        "god-krono-brass-titan",
        "god-vesper-dream-eater",
        "god-aurelia-dawn-forger",
        "god-thalassa-abyss-tide",
        "god-legendary-dragon",
    )
    catacomb_zone_id_set = {
        str(c.get("zone_id"))
        for c in catacombs
        if isinstance(c, dict) and c.get("zone_id")
    }
    mf_dungeon_id_set = {
        str(d.get("dungeon_id"))
        for d in mf_dungeons
        if isinstance(d, dict) and d.get("dungeon_id")
    }
    boss_chains = atlas.get("boss_hierarchy_chains") or []
    valid_boss_chains = 0
    for b_entry in boss_chains:
        if not isinstance(b_entry, dict):
            continue
        gid = str(b_entry.get("god_id") or "")
        sc_zid = str(b_entry.get("seal_catacomb_zone_id") or "")
        mvp_list = b_entry.get("mvp_apostles") or []
        raid_list = b_entry.get("raid_bosses") or []
        mini_list = b_entry.get("mini_bosses") or []
        fam_list = b_entry.get("minion_families") or []
        if (
            gid in expected_god_ids
            and b_entry.get("god_name")
            and b_entry.get("chapter_epoch")
            and sc_zid in catacomb_zone_id_set
            and ":" in str(b_entry.get("seal_loc", ""))
            and len(mvp_list) >= 1
            and all(
                isinstance(ap, dict)
                and ap.get("name")
                and isinstance(ap.get("level"), int)
                and str(ap.get("dungeon_id")) in mf_dungeon_id_set
                and ap.get("floor_id") in ("B1", "B2", "B3", "1F", "2F", "3F")
                and ":" in str(ap.get("loc", ""))
                and ap.get("signature_drop")
                for ap in mvp_list
            )
            and len(raid_list) >= 1
            and all(
                isinstance(rb, dict)
                and rb.get("name")
                and isinstance(rb.get("level"), int)
                and str(rb.get("zone_id")) in zone_ids_set
                and ":" in str(rb.get("loc", ""))
                and rb.get("respawn")
                for rb in raid_list
            )
            and len(mini_list) >= 1
            and all(
                isinstance(mb, dict)
                and mb.get("name")
                and isinstance(mb.get("level"), int)
                and str(mb.get("zone_id")) in zone_ids_set
                and ":" in str(mb.get("loc", ""))
                for mb in mini_list
            )
            and len(fam_list) >= 1
            and all(
                isinstance(fm, dict)
                and fm.get("family_name")
                and fm.get("representative_mob")
                and len(fm.get("zone_ids") or []) >= 1
                and all(str(fz) in zone_ids_set for fz in (fm.get("zone_ids") or []))
                for fm in fam_list
            )
        ):
            valid_boss_chains += 1

    has_d21_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_BOSS_GOD_ID",
            "setAtlasBossGodChain",
            "renderAtlasBossHierarchyChainBarHtml",
            "studioBossHierarchyChainOverlay",
            "god-sola-hearth-weaver",
            "god-krono-brass-titan",
            "god-vesper-dream-eater",
            "god-aurelia-dawn-forger",
            "god-thalassa-abyss-tide",
            "god-legendary-dragon",
        )
    )
    d21_ratio = valid_boss_chains / 6.0
    d21_score = round(min(100.0, d21_ratio * 100.0), 1) if has_d21_ui else round(d21_ratio * 80.0, 1)

    # D22: Picture-in-Picture (PiP) World Radar Mini-Map inside Zoomed Views (`renderAtlasOverviewMiniMapPipSvg`)
    d22_checks = [
        "renderAtlasOverviewMiniMapPipSvg" in web_txt,
        "studioOverviewMiniMapPip" in web_txt,
        "Expand to World Map (1.0×)" in web_txt,
        web_txt.count("renderAtlasOverviewMiniMapPipSvg(") >= 4,
    ]
    d22_score = round((sum(1 for c in d22_checks if c) / float(len(d22_checks))) * 100.0, 1)

    # D23: Interactive 3-Track Quest & Class Transfer Trial Map Overlay (`quest_trial_chains` - 18 Quests across 3 Tracks & 6 Playable Races)
    expected_quest_tracks = {"main_story", "class_transfer", "racial_heritage"}
    expected_quest_races = {"Human", "Lunar", "Ogre/Orc", "Dwarf", "Dark-Lunar", "Furral"}
    expected_class_tiers = {"None", "1st_Class_Lv20", "2nd_Class_Lv40", "3rd_Awakening_Lv76"}
    quest_chains = atlas.get("quest_trial_chains") or []
    valid_quest_chains = 0
    seen_quest_tracks: set[str] = set()
    seen_quest_races: set[str] = set()
    seen_class_tiers: set[str] = set()
    for q_entry in quest_chains:
        if not isinstance(q_entry, dict):
            continue
        qtrack = str(q_entry.get("quest_track") or "")
        qrace = str(q_entry.get("race_id") or "")
        ctier = str(q_entry.get("class_tier") or "")
        gzid = str(q_entry.get("giver_zone_id") or "")
        ozid = str(q_entry.get("objective_zone_id") or "")
        odid = str(q_entry.get("objective_dungeon_id") or "")
        ofid = str(q_entry.get("objective_floor_id") or "")
        tzid = str(q_entry.get("turn_in_zone_id") or "")
        if (
            q_entry.get("quest_id")
            and q_entry.get("quest_name")
            and qtrack in expected_quest_tracks
            and qrace in expected_quest_races
            and isinstance(q_entry.get("min_level"), int)
            and ctier in expected_class_tiers
            and q_entry.get("giver_npc_name")
            and gzid in town_zone_id_set
            and ":" in str(q_entry.get("giver_loc", ""))
            and q_entry.get("objective_target")
            and ozid in zone_ids_set
            and (odid == "" or odid in mf_dungeon_id_set)
            and ofid in ("", "B1", "B2", "B3", "1F", "2F", "3F")
            and ":" in str(q_entry.get("objective_loc", ""))
            and q_entry.get("turn_in_npc_name")
            and tzid in town_zone_id_set
            and ":" in str(q_entry.get("turn_in_loc", ""))
            and q_entry.get("reward_summary")
        ):
            valid_quest_chains += 1
            seen_quest_tracks.add(qtrack)
            seen_quest_races.add(qrace)
            seen_class_tiers.add(ctier)

    has_d23_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_QUEST_TRACK",
            "ATLAS_ACTIVE_QUEST_ID",
            "setAtlasQuestTrack",
            "selectAtlasQuestChain",
            "renderAtlasQuestTrialOverlayBarHtml",
            "studioQuestTrialChainOverlay",
        )
    )
    d23_ratio = valid_quest_chains / 18.0
    d23_full_coverage = (
        seen_quest_tracks == expected_quest_tracks
        and seen_quest_races == expected_quest_races
        and seen_class_tiers == expected_class_tiers
    )
    d23_score = (
        round(min(100.0, d23_ratio * 100.0), 1)
        if (has_d23_ui and d23_full_coverage)
        else round(d23_ratio * 80.0, 1)
    )

    # D24: Interactive Party & Farming Efficiency Heatmap / Grinding Calculator (`farming_efficiency_profiles` - 40 Combat Zones = 24 Fields + 16 Dungeons)
    expected_party_modes = {"solo_grinding", "duo_spoil_scavenger", "full_9p_aoe_party", "clan_raid_force"}
    expected_spoil_grades = {"No-Grade", "D-Grade", "C-Grade", "B-Grade", "A-Grade", "S-Grade"}
    combat_zone_id_set = {
        str(f.get("zone_id"))
        for f in fields_list
        if isinstance(f, dict) and f.get("zone_id")
    } | {
        str(d.get("zone_id"))
        for d in all_dungeons
        if isinstance(d, dict) and d.get("zone_id")
    }
    farming_profiles = atlas.get("farming_efficiency_profiles") or []
    valid_farming_profiles = 0
    seen_farming_zone_ids: set[str] = set()
    seen_party_modes: set[str] = set()
    seen_spoil_grades: set[str] = set()
    for fp in farming_profiles:
        if not isinstance(fp, dict):
            continue
        fzid = str(fp.get("zone_id") or "")
        fkind = str(fp.get("zone_kind") or "")
        pmode = str(fp.get("recommended_party_mode") or "")
        sgrade = str(fp.get("spoil_grade") or "")
        if (
            fzid in combat_zone_id_set
            and fzid not in seen_farming_zone_ids
            and fp.get("zone_name")
            and fkind in ("field", "dungeon")
            and pmode in expected_party_modes
            and isinstance(fp.get("xp_per_hour_index"), int)
            and 1 <= int(fp.get("xp_per_hour_index", 0)) <= 100
            and isinstance(fp.get("adena_per_hour_index"), int)
            and 1 <= int(fp.get("adena_per_hour_index", 0)) <= 100
            and sgrade in expected_spoil_grades
            and fp.get("key_spoil_material")
            and fp.get("mob_pack_density")
            and fp.get("elemental_weakness")
        ):
            valid_farming_profiles += 1
            seen_farming_zone_ids.add(fzid)
            seen_party_modes.add(pmode)
            seen_spoil_grades.add(sgrade)

    has_d24_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_FARMING_MODE",
            "setAtlasFarmingMode",
            "renderAtlasFarmingHeatmapBarHtml",
            "studioFarmingEfficiencyHeatmapOverlay",
        )
    )
    d24_ratio = valid_farming_profiles / 40.0
    d24_full_coverage = (
        seen_party_modes == expected_party_modes
        and seen_spoil_grades == expected_spoil_grades
    )
    d24_score = (
        round(min(100.0, d24_ratio * 100.0), 1)
        if (has_d24_ui and d24_full_coverage)
        else round(d24_ratio * 80.0, 1)
    )

    # D25: Interactive Castle Siege, Territory Tax & Clan Hall Domain Overlay (`castle_siege_domains` - 8 Stronghold Domains)
    expected_domain_tiers = {"Capital_Citadel", "Regional_Castle", "Border_Fortress", "Harbor_Stronghold"}
    fort_zone_id_set = {
        str(h.get("zone_id"))
        for h in forts_list
        if isinstance(h, dict) and h.get("zone_id")
    }
    field_zone_id_set = {
        str(f.get("zone_id"))
        for f in fields_list
        if isinstance(f, dict) and f.get("zone_id")
    }
    continent_id_set = {
        str(c.get("continent_id"))
        for c in (atlas.get("t_breadth_continents") or [])
        if isinstance(c, dict) and c.get("continent_id")
    }
    siege_domains = atlas.get("castle_siege_domains") or []
    valid_siege_domains = 0
    seen_stronghold_ids: set[str] = set()
    seen_domain_tiers: set[str] = set()
    for sd in siege_domains:
        if not isinstance(sd, dict):
            continue
        szid = str(sd.get("stronghold_zone_id") or "")
        dtier = str(sd.get("domain_tier") or "")
        vt_ids = sd.get("vassal_town_ids") or []
        vh_ids = sd.get("vassal_hunting_zone_ids") or []
        tax_pct = sd.get("tax_rate_pct")
        if (
            sd.get("domain_id")
            and szid in fort_zone_id_set
            and szid not in seen_stronghold_ids
            and sd.get("stronghold_name")
            and str(sd.get("continent_id") or "") in continent_id_set
            and dtier in expected_domain_tiers
            and len(vt_ids) >= 1
            and all(str(vt) in town_zone_id_set for vt in vt_ids)
            and len(vh_ids) >= 1
            and all(str(vh) in field_zone_id_set for vh in vh_ids)
            and isinstance(tax_pct, int)
            and 5 <= tax_pct <= 25
            and sd.get("siege_window_utc")
            and ":" in str(sd.get("artifact_altar_loc", ""))
            and ":" in str(sd.get("outer_gate_loc", ""))
            and sd.get("manor_specialty_crop")
            and sd.get("ruling_npc_faction")
        ):
            valid_siege_domains += 1
            seen_stronghold_ids.add(szid)
            seen_domain_tiers.add(dtier)

    has_d25_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_SIEGE_DOMAIN_ID",
            "setAtlasSiegeDomain",
            "renderAtlasSiegeDomainBarHtml",
            "studioCastleSiegeDomainOverlay",
        )
    )
    d25_ratio = valid_siege_domains / 8.0
    d25_full_coverage = seen_domain_tiers == expected_domain_tiers
    d25_score = (
        round(min(100.0, d25_ratio * 100.0), 1)
        if (has_d25_ui and d25_full_coverage)
        else round(d25_ratio * 80.0, 1)
    )

    # D26: Interactive World Boss & MVP Respawn Radar / Command-Channel Telemetry (`world_boss_spawn_radar` - 32 Bosses = 16 Dungeon MVPs + 16 Overland Raids/Mini-Bosses)
    expected_boss_categories = {"MVP", "Raid", "Mini-Boss"}
    expected_radar_statuses = {"Window Open", "Respawning Soon", "Sanctum Active"}
    boss_radar = atlas.get("world_boss_spawn_radar") or []
    valid_boss_radar = 0
    dungeon_mvp_radar_count = 0
    overland_boss_radar_count = 0
    seen_boss_ids: set[str] = set()
    seen_boss_categories: set[str] = set()
    seen_radar_statuses: set[str] = set()
    for br in boss_radar:
        if not isinstance(br, dict):
            continue
        bid = str(br.get("boss_id") or "")
        bcat = str(br.get("boss_category") or "")
        bzid = str(br.get("zone_id") or "")
        bdid = str(br.get("dungeon_id") or "")
        bfid = str(br.get("floor_id") or "")
        rstat = str(br.get("radar_status") or "")
        blv = br.get("level")
        if (
            bid
            and bid not in seen_boss_ids
            and br.get("boss_name")
            and bcat in expected_boss_categories
            and isinstance(blv, int)
            and 1 <= blv <= 99
            and bzid in zone_ids_set
            and (bdid == "" or bdid in mf_dungeon_id_set)
            and bfid in ("", "B1", "B2", "B3", "1F", "2F", "3F")
            and ":" in str(br.get("loc", ""))
            and br.get("respawn_window")
            and br.get("command_channel_size")
            and br.get("top_reward_drop")
            and rstat in expected_radar_statuses
        ):
            valid_boss_radar += 1
            seen_boss_ids.add(bid)
            seen_boss_categories.add(bcat)
            seen_radar_statuses.add(rstat)
            if bdid != "" and bfid in ("B3", "3F") and bcat == "MVP":
                dungeon_mvp_radar_count += 1
            elif bdid == "" and bfid == "" and bcat in ("Raid", "Mini-Boss"):
                overland_boss_radar_count += 1

    has_d26_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_BOSS_RADAR_MODE",
            "setAtlasBossRadarMode",
            "renderAtlasBossRadarBarHtml",
            "studioWorldBossSpawnRadarOverlay",
        )
    )
    d26_ratio = valid_boss_radar / 32.0
    d26_full_coverage = (
        dungeon_mvp_radar_count == 16
        and overland_boss_radar_count == 16
        and seen_boss_categories == expected_boss_categories
        and seen_radar_statuses == expected_radar_statuses
    )
    d26_score = (
        round(min(100.0, d26_ratio * 100.0), 1)
        if (has_d26_ui and d26_full_coverage)
        else round(d26_ratio * 80.0, 1)
    )

    # D27: Interactive Seven-Seals Dusk vs. Dawn Catacomb/Tower Competition & Mammon Rotation (`seven_seals_competitions` - 16 Sanctums = 8 Catacombs + 8 Towers)
    expected_sanctum_types = {"Seal_Catacomb", "Ascendant_Necropolis_Tower"}
    expected_seals = {"Sign_of_Avarice", "Sign_of_Gnosis", "Sign_of_Strife"}
    expected_cabals = {"Lords_of_Dawn", "Revolutionaries_of_Dusk", "Contested_Equilibrium"}
    expected_stone_tiers = {"Blue_Seal_Stone", "Green_Seal_Stone", "Red_Seal_Stone"}
    expected_mammon_npcs = {"Blacksmith_of_Mammon", "Merchant_of_Mammon"}
    seven_seals = atlas.get("seven_seals_competitions") or []
    valid_seven_seals = 0
    catacomb_sanctum_count = 0
    tower_sanctum_count = 0
    seen_ss_dungeons: set[str] = set()
    seen_seals: set[str] = set()
    seen_cabals: set[str] = set()
    seen_stone_tiers: set[str] = set()
    seen_mammon_npcs: set[str] = set()
    for ss in seven_seals:
        if not isinstance(ss, dict):
            continue
        cid = str(ss.get("competition_id") or "")
        did = str(ss.get("dungeon_id") or "")
        stype = str(ss.get("sanctum_type") or "")
        salleg = str(ss.get("seal_allegiance") or "")
        ccabal = str(ss.get("controlling_cabal") or "")
        stier = str(ss.get("seal_stone_tier") or "")
        aadena = ss.get("ancient_adena_per_hour")
        mnpc = str(ss.get("mammon_visitor_npc") or "")
        mfloor = str(ss.get("mammon_active_floor_id") or "")
        if (
            cid
            and did in mf_dungeon_id_set
            and did not in seen_ss_dungeons
            and ss.get("dungeon_name")
            and stype in expected_sanctum_types
            and salleg in expected_seals
            and ccabal in expected_cabals
            and stier in expected_stone_tiers
            and isinstance(aadena, int)
            and aadena >= 1000
            and mnpc in expected_mammon_npcs
            and mfloor in ("B1", "B2", "B3", "1F", "2F", "3F")
            and ":" in str(ss.get("mammon_loc", ""))
            and ss.get("mammon_specialty_service")
        ):
            valid_seven_seals += 1
            seen_ss_dungeons.add(did)
            seen_seals.add(salleg)
            seen_cabals.add(ccabal)
            seen_stone_tiers.add(stier)
            seen_mammon_npcs.add(mnpc)
            if stype == "Seal_Catacomb":
                catacomb_sanctum_count += 1
            elif stype == "Ascendant_Necropolis_Tower":
                tower_sanctum_count += 1

    has_d27_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_SEVEN_SEALS_MODE",
            "setAtlasSevenSealsMode",
            "renderAtlasSevenSealsBarHtml",
            "studioSevenSealsOverlay",
        )
    )
    d27_ratio = valid_seven_seals / 16.0
    d27_full_coverage = (
        catacomb_sanctum_count == 8
        and tower_sanctum_count == 8
        and seen_seals == expected_seals
        and seen_cabals == expected_cabals
        and seen_stone_tiers == expected_stone_tiers
        and seen_mammon_npcs == expected_mammon_npcs
    )
    d27_score = (
        round(min(100.0, d27_ratio * 100.0), 1)
        if (has_d27_ui and d27_full_coverage)
        else round(d27_ratio * 80.0, 1)
    )

    # D28: Interactive 15-Town Manor Seed/Crop & Regional Caravan Trade Economy Overlay (`manor_economy_routes` - 15 Towns)
    expected_caravan_risks = {"Low_Patrolled", "Medium_Bandit_Road", "High_Frontier_Ambush"}
    manor_routes = atlas.get("manor_economy_routes") or []
    valid_manor_routes = 0
    seen_manor_towns: set[str] = set()
    seen_caravan_risks: set[str] = set()
    seen_reward_materials: set[str] = set()
    for mr in manor_routes:
        if not isinstance(mr, dict):
            continue
        mid = str(mr.get("manor_id") or "")
        tzid = str(mr.get("town_zone_id") or "")
        pszid = str(mr.get("parent_stronghold_zone_id") or "")
        hfzid = str(mr.get("harvest_field_zone_id") or "")
        quota = mr.get("daily_crop_quota")
        mat = str(mr.get("procure_reward_material") or "")
        crisk = str(mr.get("caravan_route_risk") or "")
        if (
            mid
            and tzid in town_zone_id_set
            and tzid not in seen_manor_towns
            and mr.get("town_name")
            and pszid in fort_zone_id_set
            and mr.get("seed_name")
            and mr.get("crop_name")
            and hfzid in field_zone_id_set
            and mr.get("harvest_level_band")
            and isinstance(quota, int)
            and quota >= 100
            and mat
            and crisk in expected_caravan_risks
        ):
            valid_manor_routes += 1
            seen_manor_towns.add(tzid)
            seen_caravan_risks.add(crisk)
            seen_reward_materials.add(mat)

    has_d28_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_MANOR_MODE",
            "setAtlasManorMode",
            "renderAtlasManorEconomyBarHtml",
            "studioManorEconomyOverlay",
        )
    )
    d28_ratio = valid_manor_routes / 15.0
    d28_full_coverage = (
        seen_caravan_risks == expected_caravan_risks
        and {"Enria", "Asofe", "Thons", "Oriharukon", "Synthetic Cokes"}.issubset(seen_reward_materials)
    )
    d28_score = (
        round(min(100.0, d28_ratio * 100.0), 1)
        if (has_d28_ui and d28_full_coverage)
        else round(d28_ratio * 80.0, 1)
    )

    # D29: Interactive Subclass, Noblesse & Grand Olympiad Monument Network (`noblesse_olympiad_network` - 21 Nodes = 15 Town Monuments + 6 Subclass/Noblesse Sanctums)
    expected_olympiad_categories = {"Olympiad_Monument", "Subclass_Mimir_Sanctum", "Noblesse_Barakiel_Shrine"}
    olympiad_nodes = atlas.get("noblesse_olympiad_network") or []
    valid_olympiad_nodes = 0
    olympiad_monument_count = 0
    subclass_sanctum_count = 0
    noblesse_shrine_count = 0
    seen_olympiad_node_ids: set[str] = set()
    seen_olympiad_categories: set[str] = set()
    for on in olympiad_nodes:
        if not isinstance(on, dict):
            continue
        nid = str(on.get("node_id") or "")
        ncat = str(on.get("node_category") or "")
        ozid = str(on.get("zone_id") or "")
        odid = str(on.get("dungeon_id") or "")
        ofid = str(on.get("floor_id") or "")
        min_lv = on.get("min_level")
        if (
            nid
            and nid not in seen_olympiad_node_ids
            and on.get("node_name")
            and ncat in expected_olympiad_categories
            and ozid in zone_ids_set
            and (odid == "" or odid in mf_dungeon_id_set)
            and ofid in ("", "B1", "B2", "B3", "1F", "2F", "3F")
            and ":" in str(on.get("loc", ""))
            and isinstance(min_lv, int)
            and 70 <= min_lv <= 99
            and on.get("npc_steward_name")
            and on.get("ritual_requirement")
            and on.get("heroic_reward")
        ):
            valid_olympiad_nodes += 1
            seen_olympiad_node_ids.add(nid)
            seen_olympiad_categories.add(ncat)
            if ncat == "Olympiad_Monument" and ozid in town_zone_id_set and odid == "":
                olympiad_monument_count += 1
            elif ncat == "Subclass_Mimir_Sanctum" and odid != "" and ofid in ("B3", "3F"):
                subclass_sanctum_count += 1
            elif ncat == "Noblesse_Barakiel_Shrine" and ozid in field_zone_id_set and odid == "":
                noblesse_shrine_count += 1

    has_d29_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_OLYMPIAD_MODE",
            "setAtlasOlympiadMode",
            "renderAtlasOlympiadNetworkBarHtml",
            "studioNoblesseOlympiadOverlay",
        )
    )
    d29_ratio = valid_olympiad_nodes / 21.0
    d29_full_coverage = (
        olympiad_monument_count == 15
        and subclass_sanctum_count == 3
        and noblesse_shrine_count == 3
        and seen_olympiad_categories == expected_olympiad_categories
    )
    d29_score = (
        round(min(100.0, d29_ratio * 100.0), 1)
        if (has_d29_ui and d29_full_coverage)
        else round(d29_ratio * 80.0, 1)
    )

    # D30: Interactive Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Overlay (`intercontinental_transit_lines` - 18 Routes = 6 Maritime_Ship + 6 Brass_Airship + 6 Gatekeeper_Trunk)
    expected_transit_modes = {"Maritime_Ship", "Brass_Airship", "Gatekeeper_Trunk"}
    transit_lines = atlas.get("intercontinental_transit_lines") or []
    valid_transit_lines = 0
    maritime_ship_count = 0
    brass_airship_count = 0
    gatekeeper_trunk_count = 0
    seen_transit_ids: set[str] = set()
    seen_transit_modes: set[str] = set()
    for tl in transit_lines:
        if not isinstance(tl, dict):
            continue
        tid = str(tl.get("transit_id") or "")
        tmode = str(tl.get("transit_mode") or "")
        orig_zid = str(tl.get("origin_zone_id") or "")
        dest_zid = str(tl.get("destination_zone_id") or "")
        tcost = tl.get("ticket_cost_adena")
        if (
            tid
            and tid not in seen_transit_ids
            and tl.get("route_name")
            and tmode in expected_transit_modes
            and orig_zid in zone_ids_set
            and dest_zid in zone_ids_set
            and orig_zid != dest_zid
            and ":" in str(tl.get("origin_loc", ""))
            and ":" in str(tl.get("destination_loc", ""))
            and tl.get("departure_interval")
            and isinstance(tcost, int)
            and tcost >= 0
            and tl.get("vessel_or_gatekeeper_name")
        ):
            valid_transit_lines += 1
            seen_transit_ids.add(tid)
            seen_transit_modes.add(tmode)
            if tmode == "Maritime_Ship":
                maritime_ship_count += 1
            elif tmode == "Brass_Airship":
                brass_airship_count += 1
            elif tmode == "Gatekeeper_Trunk":
                gatekeeper_trunk_count += 1

    has_d30_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_TRANSIT_MODE",
            "setAtlasTransitMode",
            "renderAtlasTransitLinesBarHtml",
            "studioIntercontinentalTransitOverlay",
        )
    )
    d30_ratio = valid_transit_lines / 18.0
    d30_full_coverage = (
        maritime_ship_count == 6
        and brass_airship_count == 6
        and gatekeeper_trunk_count == 6
        and seen_transit_modes == expected_transit_modes
    )
    d30_score = (
        round(min(100.0, d30_ratio * 100.0), 1)
        if (has_d30_ui and d30_full_coverage)
        else round(d30_ratio * 80.0, 1)
    )

    # D31: Interactive Soul Crystal (SA) Stage 1-13 Resonance & Boss Absorption Matrix (`soul_crystal_resonance_stages` - 18 Stages = 6 Crimson_Red + 6 Verdant_Green + 6 Azure_Blue)
    expected_crystal_colors = {"Crimson_Red", "Verdant_Green", "Azure_Blue"}
    expected_stage_bands = {
        "Stage_1_to_5_C_Grade",
        "Stage_6_to_10_B_A_Grade",
        "Stage_11_to_13_S_Grade_Boss",
    }
    expected_weapon_grades = {"C-Grade", "B-Grade", "A-Grade", "S-Grade"}
    soul_crystals = atlas.get("soul_crystal_resonance_stages") or []
    valid_soul_crystals = 0
    crimson_red_count = 0
    verdant_green_count = 0
    azure_blue_count = 0
    seen_crystal_ids: set[str] = set()
    seen_crystal_colors: set[str] = set()
    seen_stage_bands: set[str] = set()
    seen_weapon_grades: set[str] = set()
    for sc in soul_crystals:
        if not isinstance(sc, dict):
            continue
        cid = str(sc.get("crystal_stage_id") or "")
        ccolor = str(sc.get("crystal_color") or "")
        sband = str(sc.get("stage_band") or "")
        wgrade = str(sc.get("weapon_grade_unlocked") or "")
        sabilities = sc.get("special_abilities") or []
        vtown = str(sc.get("vendor_town_zone_id") or "")
        azone = str(sc.get("absorption_zone_id") or "")
        adng = str(sc.get("absorption_dungeon_id") or "")
        afloor = str(sc.get("absorption_floor_id") or "")
        rchance = sc.get("resonance_chance_pct")
        if (
            cid
            and cid not in seen_crystal_ids
            and ccolor in expected_crystal_colors
            and sband in expected_stage_bands
            and wgrade in expected_weapon_grades
            and isinstance(sabilities, list)
            and len(sabilities) >= 1
            and vtown in town_zone_id_set
            and sc.get("absorption_target_name")
            and azone in zone_ids_set
            and (adng == "" or adng in mf_dungeon_id_set)
            and afloor in ("", "B1", "B2", "B3", "1F", "2F", "3F")
            and ":" in str(sc.get("absorption_loc", ""))
            and isinstance(rchance, int)
            and 1 <= rchance <= 100
            and sc.get("shatter_rule")
        ):
            valid_soul_crystals += 1
            seen_crystal_ids.add(cid)
            seen_crystal_colors.add(ccolor)
            seen_stage_bands.add(sband)
            seen_weapon_grades.add(wgrade)
            if ccolor == "Crimson_Red":
                crimson_red_count += 1
            elif ccolor == "Verdant_Green":
                verdant_green_count += 1
            elif ccolor == "Azure_Blue":
                azure_blue_count += 1

    has_d31_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_SOUL_CRYSTAL_MODE",
            "setAtlasSoulCrystalMode",
            "renderAtlasSoulCrystalBarHtml",
            "studioSoulCrystalResonanceOverlay",
        )
    )
    d31_ratio = valid_soul_crystals / 18.0
    d31_full_coverage = (
        crimson_red_count == 6
        and verdant_green_count == 6
        and azure_blue_count == 6
        and seen_crystal_colors == expected_crystal_colors
        and seen_stage_bands == expected_stage_bands
        and seen_weapon_grades == expected_weapon_grades
    )
    d31_score = (
        round(min(100.0, d31_ratio * 100.0), 1)
        if (has_d31_ui and d31_full_coverage)
        else round(d31_ratio * 80.0, 1)
    )

    # D32: Interactive Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuary Overlay (`fishing_guild_sanctuaries` - 16 Sanctuaries = 6 Maritime_Harbor_Pier + 5 Luminous_Night_Lake + 5 Thermal_Hot_Spring)
    expected_water_categories = {
        "Maritime_Harbor_Pier",
        "Luminous_Night_Lake",
        "Thermal_Hot_Spring",
    }
    expected_time_windows = {
        "24h All-Day",
        "00:00–06:00 Nocturnal Luminous",
        "Thermal Mist Cycle",
    }
    fishing_sanctuaries = atlas.get("fishing_guild_sanctuaries") or []
    valid_fishing_sanctuaries = 0
    maritime_pier_count = 0
    luminous_lake_count = 0
    thermal_spring_count = 0
    seen_sanctuary_ids: set[str] = set()
    seen_water_categories: set[str] = set()
    seen_time_windows: set[str] = set()
    for fs in fishing_sanctuaries:
        if not isinstance(fs, dict):
            continue
        sid = str(fs.get("sanctuary_id") or "")
        wcat = str(fs.get("water_category") or "")
        fzid = str(fs.get("zone_id") or "")
        twindow = str(fs.get("active_time_window") or "")
        if (
            sid
            and sid not in seen_sanctuary_ids
            and fs.get("sanctuary_name")
            and wcat in expected_water_categories
            and fzid in zone_ids_set
            and ":" in str(fs.get("dock_loc", ""))
            and fs.get("guild_master_npc")
            and fs.get("recommended_lure")
            and twindow in expected_time_windows
            and fs.get("primary_catch_reward")
        ):
            valid_fishing_sanctuaries += 1
            seen_sanctuary_ids.add(sid)
            seen_water_categories.add(wcat)
            seen_time_windows.add(twindow)
            if wcat == "Maritime_Harbor_Pier":
                maritime_pier_count += 1
            elif wcat == "Luminous_Night_Lake":
                luminous_lake_count += 1
            elif wcat == "Thermal_Hot_Spring":
                thermal_spring_count += 1

    has_d32_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_FISHING_MODE",
            "setAtlasFishingMode",
            "renderAtlasFishingSanctuaryBarHtml",
            "studioFishingSanctuaryOverlay",
        )
    )
    d32_ratio = valid_fishing_sanctuaries / 16.0
    d32_full_coverage = (
        maritime_pier_count == 6
        and luminous_lake_count == 5
        and thermal_spring_count == 5
        and seen_water_categories == expected_water_categories
        and seen_time_windows == expected_time_windows
    )
    d32_score = (
        round(min(100.0, d32_ratio * 100.0), 1)
        if (has_d32_ui and d32_full_coverage)
        else round(d32_ratio * 80.0, 1)
    )

    # D33: Interactive Cursed Weapon, PK Karma Redemption & Open-World PvP Arena Overlay (`cursed_weapon_pvp_hotspots` - 14 Hotspots = 5 Cursed_Weapon_Drop_Zone + 5 Black_Judge_Karma_Sanctuary + 4 Coliseum_PvP_Arena)
    expected_pvp_categories = {
        "Cursed_Weapon_Drop_Zone",
        "Black_Judge_Karma_Sanctuary",
        "Coliseum_PvP_Arena",
    }
    expected_ruleset_tags = {
        "World-Broadcast Cursed Drop",
        "Zero-Guard Lawless Safe-Harbor",
        "Free-PvP No-EXP-Loss Arena",
    }
    pvp_hotspots = atlas.get("cursed_weapon_pvp_hotspots") or []
    valid_pvp_hotspots = 0
    cursed_drop_zone_count = 0
    black_judge_sanctuary_count = 0
    coliseum_arena_count = 0
    seen_hotspot_ids: set[str] = set()
    seen_pvp_categories: set[str] = set()
    seen_ruleset_tags: set[str] = set()
    for ph in pvp_hotspots:
        if not isinstance(ph, dict):
            continue
        hid = str(ph.get("hotspot_id") or "")
        pcat = str(ph.get("pvp_category") or "")
        pzid = str(ph.get("zone_id") or "")
        rtag = str(ph.get("ruleset_tag") or "")
        if (
            hid
            and hid not in seen_hotspot_ids
            and ph.get("hotspot_name")
            and pcat in expected_pvp_categories
            and pzid in zone_ids_set
            and ":" in str(ph.get("loc", ""))
            and rtag in expected_ruleset_tags
            and ph.get("featured_artifact_or_npc")
            and ph.get("recommended_level_band")
            and ph.get("tactical_note")
        ):
            valid_pvp_hotspots += 1
            seen_hotspot_ids.add(hid)
            seen_pvp_categories.add(pcat)
            seen_ruleset_tags.add(rtag)
            if pcat == "Cursed_Weapon_Drop_Zone":
                cursed_drop_zone_count += 1
            elif pcat == "Black_Judge_Karma_Sanctuary":
                black_judge_sanctuary_count += 1
            elif pcat == "Coliseum_PvP_Arena":
                coliseum_arena_count += 1

    has_d33_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_PVP_KARMA_MODE",
            "setAtlasPvpKarmaMode",
            "renderAtlasPvpKarmaBarHtml",
            "studioCursedWeaponPvpOverlay",
        )
    )
    d33_ratio = valid_pvp_hotspots / 14.0
    d33_full_coverage = (
        cursed_drop_zone_count == 5
        and black_judge_sanctuary_count == 5
        and coliseum_arena_count == 4
        and seen_pvp_categories == expected_pvp_categories
        and seen_ruleset_tags == expected_ruleset_tags
    )
    d33_score = (
        round(min(100.0, d33_ratio * 100.0), 1)
        if (has_d33_ui and d33_full_coverage)
        else round(d33_ratio * 80.0, 1)
    )

    # D34: Interactive Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctum Matrix (`dimensional_rift_sepulchers` - 16 Portals = 6 Dimensional_Rift + 6 Four_Sepulchers + 4 Key_Gated_Chapel)
    expected_instance_categories = {
        "Dimensional_Rift",
        "Four_Sepulchers",
        "Key_Gated_Chapel",
    }
    rift_sepulchers = atlas.get("dimensional_rift_sepulchers") or []
    valid_rift_sepulchers = 0
    dimensional_rift_count = 0
    four_sepulchers_count = 0
    key_gated_chapel_count = 0
    seen_portal_ids: set[str] = set()
    seen_rift_dungeons: set[str] = set()
    seen_instance_categories: set[str] = set()
    for rs in rift_sepulchers:
        if not isinstance(rs, dict):
            continue
        pid = str(rs.get("portal_id") or "")
        icat = str(rs.get("instance_category") or "")
        rdid = str(rs.get("dungeon_id") or "")
        rpzid = str(rs.get("parent_zone_id") or "")
        rfid = str(rs.get("floor_id") or "")
        if (
            pid
            and pid not in seen_portal_ids
            and rs.get("portal_name")
            and icat in expected_instance_categories
            and rdid in mf_dungeon_id_set
            and rdid not in seen_rift_dungeons
            and rpzid in zone_ids_set
            and rfid in ("B1", "B2", "B3", "1F", "2F", "3F")
            and ":" in str(rs.get("loc", ""))
            and rs.get("entry_key_or_token")
            and rs.get("party_requirement")
            and rs.get("cycle_window")
            and rs.get("signature_reward")
        ):
            valid_rift_sepulchers += 1
            seen_portal_ids.add(pid)
            seen_rift_dungeons.add(rdid)
            seen_instance_categories.add(icat)
            if icat == "Dimensional_Rift":
                dimensional_rift_count += 1
            elif icat == "Four_Sepulchers":
                four_sepulchers_count += 1
            elif icat == "Key_Gated_Chapel":
                key_gated_chapel_count += 1

    has_d34_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_RIFT_SEPULCHER_MODE",
            "setAtlasRiftSepulcherMode",
            "renderAtlasRiftSepulcherBarHtml",
            "studioDimensionalRiftOverlay",
        )
    )
    d34_ratio = valid_rift_sepulchers / 16.0
    d34_full_coverage = (
        dimensional_rift_count == 6
        and four_sepulchers_count == 6
        and key_gated_chapel_count == 4
        and seen_instance_categories == expected_instance_categories
        and len(seen_rift_dungeons) == 16
    )
    d34_score = (
        round(min(100.0, d34_ratio * 100.0), 1)
        if (has_d34_ui and d34_full_coverage)
        else round(d34_ratio * 80.0, 1)
    )

    # D35: Interactive Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Matrix (`weapon_augmentation_dye_hubs` - 15/15 Town Hubs)
    expected_life_stone_tiers = {
        "Standard_Life_Stone",
        "Mid_Grade_Life_Stone",
        "High_Grade_Life_Stone",
        "Top_Grade_Life_Stone",
    }
    aug_dye_hubs = atlas.get("weapon_augmentation_dye_hubs") or []
    valid_aug_dye_hubs = 0
    seen_aug_hub_ids: set[str] = set()
    seen_aug_town_ids: set[str] = set()
    seen_life_stone_tiers: set[str] = set()
    for ah in aug_dye_hubs:
        if not isinstance(ah, dict):
            continue
        hid = str(ah.get("hub_id") or "")
        tzid = str(ah.get("town_zone_id") or "")
        lstier = str(ah.get("life_stone_tier") or "")
        dzid = str(ah.get("life_stone_drop_zone_id") or "")
        aug_skills = ah.get("signature_augment_skills") or []
        dye_combos = ah.get("signature_dye_combos") or []
        if (
            hid
            and hid not in seen_aug_hub_ids
            and tzid in town_zone_id_set
            and tzid not in seen_aug_town_ids
            and ah.get("town_name")
            and ah.get("blacksmith_refiner_npc")
            and ah.get("symbol_maker_npc")
            and ":" in str(ah.get("anvil_loc", ""))
            and lstier in expected_life_stone_tiers
            and dzid in zone_ids_set
            and ah.get("gemstone_cost")
            and isinstance(aug_skills, list)
            and len(aug_skills) >= 2
            and isinstance(dye_combos, list)
            and len(dye_combos) >= 2
        ):
            valid_aug_dye_hubs += 1
            seen_aug_hub_ids.add(hid)
            seen_aug_town_ids.add(tzid)
            seen_life_stone_tiers.add(lstier)

    has_d35_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_AUGMENT_DYE_MODE",
            "setAtlasAugmentDyeMode",
            "renderAtlasAugmentDyeBarHtml",
            "studioWeaponAugmentationDyeOverlay",
        )
    )
    d35_ratio = valid_aug_dye_hubs / 15.0
    d35_full_coverage = (
        len(seen_aug_town_ids) == 15
        and seen_life_stone_tiers == expected_life_stone_tiers
    )
    d35_score = (
        round(min(100.0, d35_ratio * 100.0), 1)
        if (has_d35_ui and d35_full_coverage)
        else round(d35_ratio * 80.0, 1)
    )

    # D36: Interactive Pet, Strider & Castle Wyvern Mount Sanctuary Overlay (`companion_mount_sanctuaries` - 12/12 Nodes = 4 Pet_Manager_Kennel + 4 Hatchling_Strider_Sanctum + 4 Castle_Wyvern_Roost)
    expected_mount_categories = {
        "Pet_Manager_Kennel",
        "Hatchling_Strider_Sanctum",
        "Castle_Wyvern_Roost",
    }
    comp_sanctuaries = atlas.get("companion_mount_sanctuaries") or []
    valid_comp_sanctuaries = 0
    pet_kennel_count = 0
    strider_sanctum_count = 0
    wyvern_roost_count = 0
    seen_comp_node_ids: set[str] = set()
    seen_mount_categories: set[str] = set()
    for cs in comp_sanctuaries:
        if not isinstance(cs, dict):
            continue
        cnid = str(cs.get("companion_node_id") or "")
        mcat = str(cs.get("mount_category") or "")
        czid = str(cs.get("zone_id") or "")
        ev_lv = int(cs.get("evolution_level_req") or 0)
        if (
            cnid
            and cnid not in seen_comp_node_ids
            and cs.get("node_name")
            and mcat in expected_mount_categories
            and czid in zone_ids_set
            and ":" in str(cs.get("loc", ""))
            and cs.get("steward_npc_name")
            and cs.get("companion_species")
            and ev_lv >= 15
            and cs.get("quest_or_tribute_req")
            and cs.get("tactical_benefit")
        ):
            valid_comp_sanctuaries += 1
            seen_comp_node_ids.add(cnid)
            seen_mount_categories.add(mcat)
            if mcat == "Pet_Manager_Kennel":
                pet_kennel_count += 1
            elif mcat == "Hatchling_Strider_Sanctum":
                strider_sanctum_count += 1
            elif mcat == "Castle_Wyvern_Roost":
                wyvern_roost_count += 1

    has_d36_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_COMPANION_MOUNT_MODE",
            "setAtlasCompanionMountMode",
            "renderAtlasCompanionMountBarHtml",
            "studioCompanionMountOverlay",
        )
    )
    d36_ratio = valid_comp_sanctuaries / 12.0
    d36_full_coverage = (
        pet_kennel_count == 4
        and strider_sanctum_count == 4
        and wyvern_roost_count == 4
        and seen_mount_categories == expected_mount_categories
    )
    d36_score = (
        round(min(100.0, d36_ratio * 100.0), 1)
        if (has_d36_ui and d36_full_coverage)
        else round(d36_ratio * 80.0, 1)
    )

    # D37: Interactive Clan Reputation, Academy & Pledge Skill Altar Matrix (`clan_reputation_academies` - 14/14 Nodes = 5 Clan_Academy_Hall + 5 Clan_Ambition_Altar + 4 Pledge_Skill_Sanctum)
    expected_pledge_categories = {
        "Clan_Academy_Hall",
        "Clan_Ambition_Altar",
        "Pledge_Skill_Sanctum",
    }
    clan_nodes = atlas.get("clan_reputation_academies") or []
    valid_clan_nodes = 0
    clan_academy_count = 0
    clan_ambition_count = 0
    pledge_sanctum_count = 0
    seen_clan_node_ids: set[str] = set()
    seen_pledge_categories: set[str] = set()
    for cn in clan_nodes:
        if not isinstance(cn, dict):
            continue
        cnid = str(cn.get("clan_node_id") or "")
        pcat = str(cn.get("pledge_category") or "")
        czid = str(cn.get("zone_id") or "")
        pben = cn.get("unlocked_pledge_benefits") or []
        if (
            cnid
            and cnid not in seen_clan_node_ids
            and cn.get("node_name")
            and pcat in expected_pledge_categories
            and czid in zone_ids_set
            and ":" in str(cn.get("loc", ""))
            and cn.get("high_prefect_or_grand_master_npc")
            and cn.get("clan_level_tier")
            and cn.get("crp_yield_or_cost")
            and isinstance(pben, list)
            and len(pben) >= 2
        ):
            valid_clan_nodes += 1
            seen_clan_node_ids.add(cnid)
            seen_pledge_categories.add(pcat)
            if pcat == "Clan_Academy_Hall":
                clan_academy_count += 1
            elif pcat == "Clan_Ambition_Altar":
                clan_ambition_count += 1
            elif pcat == "Pledge_Skill_Sanctum":
                pledge_sanctum_count += 1

    has_d37_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_CLAN_ACADEMY_MODE",
            "setAtlasClanAcademyMode",
            "renderAtlasClanAcademyBarHtml",
            "studioClanAcademyOverlay",
        )
    )
    d37_ratio = valid_clan_nodes / 14.0
    d37_full_coverage = (
        clan_academy_count == 5
        and clan_ambition_count == 5
        and pledge_sanctum_count == 4
        and seen_pledge_categories == expected_pledge_categories
    )
    d37_score = (
        round(min(100.0, d37_ratio * 100.0), 1)
        if (has_d37_ui and d37_full_coverage)
        else round(d37_ratio * 80.0, 1)
    )

    # D38: Interactive 24-Field Elemental Attribute & Ground Herb Sustainability Biome Overlay (`field_herb_elemental_biomes` - 24/24 Field Biomes)
    expected_dominant_elements = {"Fire", "Water", "Wind", "Earth", "Holy", "Dark"}
    expected_herb_tiers = {
        "S_Tier_Zero_Downtime",
        "A_Tier_Mystic_Mana_Rich",
        "B_Tier_Party_Tough_Mobs",
    }
    herb_biomes = atlas.get("field_herb_elemental_biomes") or []
    valid_herb_biomes = 0
    seen_biome_ids: set[str] = set()
    seen_biome_field_ids: set[str] = set()
    seen_dominant_elements: set[str] = set()
    seen_herb_tiers: set[str] = set()
    for hb in herb_biomes:
        if not isinstance(hb, dict):
            continue
        bid = str(hb.get("biome_id") or "")
        fzid = str(hb.get("field_zone_id") or "")
        delem = str(hb.get("dominant_element") or "")
        htier = str(hb.get("herb_drop_tier") or "")
        sherbs = hb.get("signature_herbs") or []
        drate = int(hb.get("herb_drop_rate_pct") or 0)
        if (
            bid
            and bid not in seen_biome_ids
            and fzid in field_zone_id_set
            and fzid not in seen_biome_field_ids
            and hb.get("field_name")
            and delem in expected_dominant_elements
            and hb.get("counter_element_bonus")
            and htier in expected_herb_tiers
            and isinstance(sherbs, list)
            and len(sherbs) >= 2
            and 10 <= drate <= 80
            and hb.get("solo_sustainability_note")
        ):
            valid_herb_biomes += 1
            seen_biome_ids.add(bid)
            seen_biome_field_ids.add(fzid)
            seen_dominant_elements.add(delem)
            seen_herb_tiers.add(htier)

    has_d38_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_HERB_BIOME_MODE",
            "setAtlasHerbBiomeMode",
            "renderAtlasHerbBiomeBarHtml",
            "studioHerbElementalBiomeOverlay",
        )
    )
    d38_ratio = valid_herb_biomes / 24.0
    d38_full_coverage = (
        len(seen_biome_field_ids) == 24
        and seen_dominant_elements == expected_dominant_elements
        and seen_herb_tiers == expected_herb_tiers
    )
    d38_score = (
        round(min(100.0, d38_ratio * 100.0), 1)
        if (has_d38_ui and d38_full_coverage)
        else round(d38_ratio * 80.0, 1)
    )

    # D39: Interactive 15-Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Matrix (`soulshot_workshop_plazas` - 15/15 Town Plazas)
    expected_workshop_tiers = {
        "Starter_D_C_Plaza",
        "Regional_B_A_Workshop",
        "Capital_S_Grade_Master_Forge",
    }
    workshop_plazas = atlas.get("soulshot_workshop_plazas") or []
    valid_workshop_plazas = 0
    starter_plaza_count = 0
    regional_workshop_count = 0
    capital_forge_count = 0
    seen_workshop_ids: set[str] = set()
    seen_workshop_town_ids: set[str] = set()
    seen_workshop_tiers: set[str] = set()
    for wp in workshop_plazas:
        if not isinstance(wp, dict):
            continue
        wid = str(wp.get("workshop_id") or "")
        tzid = str(wp.get("town_zone_id") or "")
        wtier = str(wp.get("workshop_tier") or "")
        sgrades = wp.get("shot_compression_grades") or []
        rszid = str(wp.get("recipe_spoil_zone_id") or "")
        mfee = wp.get("average_manufacture_fee_adena")
        if (
            wid
            and wid not in seen_workshop_ids
            and tzid in town_zone_id_set
            and tzid not in seen_workshop_town_ids
            and wp.get("town_name")
            and wtier in expected_workshop_tiers
            and ":" in str(wp.get("plaza_loc", ""))
            and wp.get("head_blacksmith_npc")
            and isinstance(sgrades, list)
            and len(sgrades) >= 2
            and wp.get("featured_recipe_tier")
            and rszid in zone_ids_set
            and isinstance(mfee, int)
            and mfee >= 0
            and wp.get("crystal_ore_ratio")
        ):
            valid_workshop_plazas += 1
            seen_workshop_ids.add(wid)
            seen_workshop_town_ids.add(tzid)
            seen_workshop_tiers.add(wtier)
            if wtier == "Starter_D_C_Plaza":
                starter_plaza_count += 1
            elif wtier == "Regional_B_A_Workshop":
                regional_workshop_count += 1
            elif wtier == "Capital_S_Grade_Master_Forge":
                capital_forge_count += 1

    has_d39_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_WORKSHOP_MODE",
            "setAtlasWorkshopMode",
            "renderAtlasWorkshopPlazaBarHtml",
            "studioSoulshotWorkshopOverlay",
        )
    )
    d39_ratio = valid_workshop_plazas / 15.0
    d39_full_coverage = (
        len(seen_workshop_town_ids) == 15
        and seen_workshop_tiers == expected_workshop_tiers
        and starter_plaza_count >= 4
        and regional_workshop_count >= 4
        and capital_forge_count >= 3
    )
    d39_score = (
        round(min(100.0, d39_ratio * 100.0), 1)
        if (has_d39_ui and d39_full_coverage)
        else round(d39_ratio * 80.0, 1)
    )

    # D40: Interactive Territory Ward Relic & Fortress Giant's Codex Supply Matrix (`territory_ward_supply_nodes` - 16/16 Nodes = 8 Sovereign_Territory_Ward + 8 Fortress_Codex_Supply_Vault)
    expected_ward_roles = {
        "Sovereign_Territory_Ward",
        "Fortress_Codex_Supply_Vault",
    }
    ward_nodes = atlas.get("territory_ward_supply_nodes") or []
    valid_ward_nodes = 0
    sovereign_ward_count = 0
    codex_vault_count = 0
    seen_ward_node_ids: set[str] = set()
    seen_ward_roles: set[str] = set()
    seen_ward_strongholds: set[str] = set()
    for wn in ward_nodes:
        if not isinstance(wn, dict):
            continue
        wnid = str(wn.get("ward_node_id") or "")
        nrole = str(wn.get("node_role") or "")
        szid = str(wn.get("stronghold_zone_id") or "")
        vzid = str(wn.get("linked_vassal_zone_id") or "")
        if (
            wnid
            and wnid not in seen_ward_node_ids
            and wn.get("node_name")
            and nrole in expected_ward_roles
            and szid in fort_zone_id_set
            and vzid in zone_ids_set
            and ":" in str(wn.get("loc", ""))
            and wn.get("mercenary_captain_npc")
            and wn.get("stat_ward_bonus")
            and wn.get("epaulette_codex_reward")
            and wn.get("territory_battle_window")
        ):
            valid_ward_nodes += 1
            seen_ward_node_ids.add(wnid)
            seen_ward_roles.add(nrole)
            seen_ward_strongholds.add(szid)
            if nrole == "Sovereign_Territory_Ward":
                sovereign_ward_count += 1
            elif nrole == "Fortress_Codex_Supply_Vault":
                codex_vault_count += 1

    has_d40_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_TERRITORY_WARD_MODE",
            "setAtlasTerritoryWardMode",
            "renderAtlasTerritoryWardBarHtml",
            "studioTerritoryWardOverlay",
        )
    )
    d40_ratio = valid_ward_nodes / 16.0
    d40_full_coverage = (
        sovereign_ward_count == 8
        and codex_vault_count == 8
        and len(seen_ward_strongholds) == 8
        and seen_ward_roles == expected_ward_roles
    )
    d40_score = (
        round(min(100.0, d40_ratio * 100.0), 1)
        if (has_d40_ui and d40_full_coverage)
        else round(d40_ratio * 80.0, 1)
    )

    # D41: Interactive 12-Relic Epic Boss Jewelry & Status Resistance Matrix (`epic_jewelry_sanctums` - 12/12 Relics = 4 Epic_Ring + 4 Epic_Earring + 4 Epic_Necklace)
    expected_jewelry_slots = {
        "Epic_Ring",
        "Epic_Earring",
        "Epic_Necklace",
    }
    expected_jewelry_grades = {"B-Grade", "A-Grade", "S-Grade"}
    epic_jewelry_rows = atlas.get("epic_jewelry_sanctums") or []
    valid_epic_jewelry = 0
    epic_ring_count = 0
    epic_earring_count = 0
    epic_necklace_count = 0
    seen_jewelry_ids: set[str] = set()
    seen_jewelry_slots: set[str] = set()
    seen_jewelry_grades: set[str] = set()
    for ej in epic_jewelry_rows:
        if not isinstance(ej, dict):
            continue
        jid = str(ej.get("jewelry_id") or "")
        slot_cat = str(ej.get("slot_category") or "")
        jgrade = str(ej.get("grade") or "")
        zid = str(ej.get("zone_id") or "")
        resists = ej.get("status_resist_bonuses") or []
        cstats = ej.get("combat_stat_bonuses") or []
        if (
            jid
            and jid not in seen_jewelry_ids
            and ej.get("relic_name")
            and slot_cat in expected_jewelry_slots
            and jgrade in expected_jewelry_grades
            and ej.get("boss_guardian_name")
            and zid in zone_ids_set
            and isinstance(ej.get("dungeon_id"), str)
            and isinstance(ej.get("floor_id"), str)
            and ":" in str(ej.get("loc", ""))
            and isinstance(resists, list)
            and len(resists) >= 2
            and isinstance(cstats, list)
            and len(cstats) >= 2
            and ej.get("drop_chance_rule")
        ):
            valid_epic_jewelry += 1
            seen_jewelry_ids.add(jid)
            seen_jewelry_slots.add(slot_cat)
            seen_jewelry_grades.add(jgrade)
            if slot_cat == "Epic_Ring":
                epic_ring_count += 1
            elif slot_cat == "Epic_Earring":
                epic_earring_count += 1
            elif slot_cat == "Epic_Necklace":
                epic_necklace_count += 1

    has_d41_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_EPIC_JEWELRY_MODE",
            "setAtlasEpicJewelryMode",
            "renderAtlasEpicJewelryBarHtml",
            "studioEpicJewelryOverlay",
        )
    )
    d41_ratio = valid_epic_jewelry / 12.0
    d41_full_coverage = (
        epic_ring_count == 4
        and epic_earring_count == 4
        and epic_necklace_count == 4
        and seen_jewelry_slots == expected_jewelry_slots
        and seen_jewelry_grades == expected_jewelry_grades
    )
    d41_score = (
        round(min(100.0, d41_ratio * 100.0), 1)
        if (has_d41_ui and d41_full_coverage)
        else round(d41_ratio * 80.0, 1)
    )

    # D42: Interactive 15-Town Adventurer's Guide Buff, Shadow Weapon & Vitality Obelisk Matrix (`adventurer_vitality_obelisks` - 15/15 Town Obelisks)
    expected_obelisk_tiers = {
        "Starter_Apprentice_Coupon_Hub",
        "Regional_Shadow_Weapon_Hub",
        "Capital_Stage4_Vitality_Sanctuary",
    }
    vitality_obelisks = atlas.get("adventurer_vitality_obelisks") or []
    valid_vitality_obelisks = 0
    starter_obelisk_count = 0
    regional_obelisk_count = 0
    capital_obelisk_count = 0
    seen_obelisk_ids: set[str] = set()
    seen_obelisk_town_ids: set[str] = set()
    seen_obelisk_tiers: set[str] = set()
    for ob in vitality_obelisks:
        if not isinstance(ob, dict):
            continue
        oid = str(ob.get("obelisk_id") or "")
        tzid = str(ob.get("town_zone_id") or "")
        otier = str(ob.get("obelisk_tier") or "")
        bsuite = ob.get("granted_buff_suite") or []
        if (
            oid
            and oid not in seen_obelisk_ids
            and tzid in town_zone_id_set
            and tzid not in seen_obelisk_town_ids
            and ob.get("town_name")
            and otier in expected_obelisk_tiers
            and ob.get("guide_npc_name")
            and ":" in str(ob.get("obelisk_loc", ""))
            and ob.get("buff_level_range")
            and isinstance(bsuite, list)
            and len(bsuite) >= 3
            and ob.get("shadow_weapon_coupon_grade")
            and ob.get("vitality_recovery_rate")
        ):
            valid_vitality_obelisks += 1
            seen_obelisk_ids.add(oid)
            seen_obelisk_town_ids.add(tzid)
            seen_obelisk_tiers.add(otier)
            if otier == "Starter_Apprentice_Coupon_Hub":
                starter_obelisk_count += 1
            elif otier == "Regional_Shadow_Weapon_Hub":
                regional_obelisk_count += 1
            elif otier == "Capital_Stage4_Vitality_Sanctuary":
                capital_obelisk_count += 1

    has_d42_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_VITALITY_OBELISK_MODE",
            "setAtlasVitalityObeliskMode",
            "renderAtlasVitalityObeliskBarHtml",
            "studioVitalityObeliskOverlay",
        )
    )
    d42_ratio = valid_vitality_obelisks / 15.0
    d42_full_coverage = (
        len(seen_obelisk_town_ids) == 15
        and seen_obelisk_tiers == expected_obelisk_tiers
        and starter_obelisk_count == 6
        and regional_obelisk_count == 5
        and capital_obelisk_count == 4
    )
    d42_score = (
        round(min(100.0, d42_ratio * 100.0), 1)
        if (has_d42_ui and d42_full_coverage)
        else round(d42_ratio * 80.0, 1)
    )

    # D43: Interactive 16-Set Armor Progression & Masterwork Foundation Forge Matrix (`armor_set_masterwork_forges` - 16/16 Sets = 6 Heavy_Vanguard_Set + 5 Light_Skirmisher_Set + 5 Mystic_Robe_Set)
    expected_armor_weights = {
        "Heavy_Vanguard_Set",
        "Light_Skirmisher_Set",
        "Mystic_Robe_Set",
    }
    expected_armor_grades = {
        "C-Grade",
        "B-Grade",
        "A-Grade",
        "S-Grade",
        "S80-Dynasty",
    }
    armor_set_rows = atlas.get("armor_set_masterwork_forges") or []
    valid_armor_sets = 0
    heavy_set_count = 0
    light_set_count = 0
    robe_set_count = 0
    seen_armor_set_ids: set[str] = set()
    seen_armor_weights: set[str] = set()
    seen_armor_grades: set[str] = set()
    for ar in armor_set_rows:
        if not isinstance(ar, dict):
            continue
        asid = str(ar.get("armor_set_id") or "")
        wclass = str(ar.get("armor_weight_class") or "")
        agrade = str(ar.get("grade") or "")
        ftzid = str(ar.get("forge_town_zone_id") or "")
        drop_zid = str(ar.get("key_piece_drop_zone_id") or "")
        if (
            asid
            and asid not in seen_armor_set_ids
            and ar.get("set_name")
            and wclass in expected_armor_weights
            and agrade in expected_armor_grades
            and ftzid in town_zone_id_set
            and drop_zid in zone_ids_set
            and isinstance(ar.get("key_piece_dungeon_id"), str)
            and isinstance(ar.get("key_piece_floor_id"), str)
            and ":" in str(ar.get("forge_loc", ""))
            and ar.get("set_bonus_summary")
            and ar.get("masterwork_foundation_bonus")
            and ar.get("unseal_blacksmith_npc")
        ):
            valid_armor_sets += 1
            seen_armor_set_ids.add(asid)
            seen_armor_weights.add(wclass)
            seen_armor_grades.add(agrade)
            if wclass == "Heavy_Vanguard_Set":
                heavy_set_count += 1
            elif wclass == "Light_Skirmisher_Set":
                light_set_count += 1
            elif wclass == "Mystic_Robe_Set":
                robe_set_count += 1

    has_d43_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_ARMOR_SET_MODE",
            "setAtlasArmorSetMode",
            "renderAtlasArmorSetBarHtml",
            "studioArmorSetMasterworkOverlay",
        )
    )
    d43_ratio = valid_armor_sets / 16.0
    d43_full_coverage = (
        heavy_set_count == 6
        and light_set_count == 5
        and robe_set_count == 5
        and seen_armor_weights == expected_armor_weights
        and seen_armor_grades == expected_armor_grades
    )
    d43_score = (
        round(min(100.0, d43_ratio * 100.0), 1)
        if (has_d43_ui and d43_full_coverage)
        else round(d43_ratio * 80.0, 1)
    )

    # D44: Interactive 15-Portal Kamaloka, Pailaka & Seed Instance Conduit Matrix (`kamaloka_pailaka_instances` - 15/15 Portals = 6 Kamaloka_Abyss_Hall + 5 Pailaka_Vitality_Trial + 4 Seed_Delusion_Conduit)
    expected_conduit_categories = {
        "Kamaloka_Abyss_Hall",
        "Pailaka_Vitality_Trial",
        "Seed_Delusion_Conduit",
    }
    kamaloka_rows = atlas.get("kamaloka_pailaka_instances") or []
    valid_kamaloka_portals = 0
    kamaloka_hall_count = 0
    pailaka_trial_count = 0
    seed_conduit_count = 0
    seen_kamaloka_ids: set[str] = set()
    seen_conduit_categories: set[str] = set()
    for kp in kamaloka_rows:
        if not isinstance(kp, dict):
            continue
        iid = str(kp.get("instance_id") or "")
        ccat = str(kp.get("conduit_category") or "")
        zid = str(kp.get("zone_id") or "")
        if (
            iid
            and iid not in seen_kamaloka_ids
            and kp.get("instance_name")
            and ccat in expected_conduit_categories
            and zid in zone_ids_set
            and ":" in str(kp.get("loc", ""))
            and kp.get("pathfinder_npc_name")
            and kp.get("level_bracket")
            and kp.get("party_size_rule")
            and kp.get("reset_cooldown")
            and kp.get("completion_reward")
        ):
            valid_kamaloka_portals += 1
            seen_kamaloka_ids.add(iid)
            seen_conduit_categories.add(ccat)
            if ccat == "Kamaloka_Abyss_Hall":
                kamaloka_hall_count += 1
            elif ccat == "Pailaka_Vitality_Trial":
                pailaka_trial_count += 1
            elif ccat == "Seed_Delusion_Conduit":
                seed_conduit_count += 1

    has_d44_ui = all(
        tok in web_txt
        for tok in (
            "ATLAS_KAMALOKA_MODE",
            "setAtlasKamalokaMode",
            "renderAtlasKamalokaBarHtml",
            "studioKamalokaPailakaOverlay",
        )
    )
    d44_ratio = valid_kamaloka_portals / 15.0
    d44_full_coverage = (
        kamaloka_hall_count == 6
        and pailaka_trial_count == 5
        and seed_conduit_count == 4
        and seen_conduit_categories == expected_conduit_categories
    )
    d44_score = (
        round(min(100.0, d44_ratio * 100.0), 1)
        if (has_d44_ui and d44_full_coverage)
        else round(d44_ratio * 80.0, 1)
    )

    # D6: 7 MDA Experience Pillars Score
    pillar_scores = {
        "Aesthetic": round((d5_score + d11_score + d12_score + d15_score + d20_score + d22_score + d24_score + d25_score + d27_score + d28_score + d29_score + d30_score + d31_score + d32_score + d33_score + d34_score + d35_score + d36_score + d37_score + d38_score + d39_score + d40_score + d41_score + d42_score + d43_score + d44_score) / 26.0, 1),
        "Continuity": round((d1_score + d5_score + d9_score + d13_score + d16_score + d17_score + d20_score + d22_score + d23_score + d25_score + d27_score + d28_score + d29_score + d30_score + d31_score + d32_score + d33_score + d34_score + d35_score + d36_score + d37_score + d38_score + d39_score + d40_score + d41_score + d42_score + d43_score + d44_score) / 28.0, 1),
        "Narrative": 100.0 if (len(whc.get("historical_epochs") or []) >= 4 and d21_score == 100.0 and d23_score == 100.0 and d25_score == 100.0 and d27_score == 100.0 and d29_score == 100.0 and d31_score == 100.0 and d33_score == 100.0 and d34_score == 100.0 and d35_score == 100.0 and d36_score == 100.0 and d37_score == 100.0 and d38_score == 100.0 and d39_score == 100.0 and d40_score == 100.0 and d41_score == 100.0 and d42_score == 100.0 and d43_score == 100.0 and d44_score == 100.0) else 75.0,
        "Challenge": round((d4_score + d7_score + d8_score + d10_score + d12_score + d14_score + d18_score + d19_score + d21_score + d23_score + d24_score + d25_score + d26_score + d27_score + d29_score + d31_score + d33_score + d34_score + d35_score + d36_score + d37_score + d38_score + d39_score + d40_score + d41_score + d42_score + d43_score + d44_score) / 28.0, 1),
        "Discovery": round((d2_score + d3_score + d7_score + d8_score + d9_score + d11_score + d12_score + d13_score + d15_score + d16_score + d17_score + d18_score + d19_score + d20_score + d21_score + d22_score + d23_score + d24_score + d25_score + d26_score + d27_score + d28_score + d29_score + d30_score + d31_score + d32_score + d33_score + d34_score + d35_score + d36_score + d37_score + d38_score + d39_score + d40_score + d41_score + d42_score + d43_score + d44_score) / 38.0, 1),
        "Fantasy": round((d1_score + d9_score + d11_score + d15_score + d19_score + d21_score + d23_score + d25_score + d26_score + d27_score + d28_score + d29_score + d30_score + d31_score + d32_score + d33_score + d34_score + d35_score + d36_score + d37_score + d38_score + d39_score + d40_score + d41_score + d42_score + d43_score + d44_score) / 27.0, 1),
        "Submission": round((d2_score + d4_score + d7_score + d10_score + d13_score + d14_score + d16_score + d17_score + d18_score + d19_score + d20_score + d22_score + d23_score + d24_score + d25_score + d26_score + d27_score + d28_score + d29_score + d30_score + d31_score + d32_score + d33_score + d34_score + d35_score + d36_score + d37_score + d38_score + d39_score + d40_score + d41_score + d42_score + d43_score + d44_score) / 34.0, 1),
    }
    d6_score = round(sum(pillar_scores.values()) / float(len(MDA_PILLARS)), 1)
    overall = round(
        (
            d1_score
            + d2_score
            + d3_score
            + d4_score
            + d5_score
            + d6_score
            + d7_score
            + d8_score
            + d9_score
            + d10_score
            + d11_score
            + d12_score
            + d13_score
            + d14_score
            + d15_score
            + d16_score
            + d17_score
            + d18_score
            + d19_score
            + d20_score
            + d21_score
            + d22_score
            + d23_score
            + d24_score
            + d25_score
            + d26_score
            + d27_score
            + d28_score
            + d29_score
            + d30_score
            + d31_score
            + d32_score
            + d33_score
            + d34_score
            + d35_score
            + d36_score
            + d37_score
            + d38_score
            + d39_score
            + d40_score
            + d41_score
            + d42_score
            + d43_score
            + d44_score
        )
        / 44.0,
        1,
    )

    return {
        "overall_score": overall,
        "dimensions": {
            "D1_race_spawn_locations": {"score": d1_score, "verified": len(valid_spawns), "target": 6},
            "D2_town_blueprints_and_npcs": {"score": d2_score, "verified": valid_town_bps, "target": target_towns},
            "D3_multi_floor_dungeon_warps": {"score": d3_score, "verified": valid_mf, "target": target_dungeons},
            "D4_monster_miniboss_raid_mvp_spawns": {
                "score": d4_score,
                "verified": full_tier_containers,
                "target": len(spawn_containers),
            },
            "D5_geographic_travel_and_anticlutter": {
                "score": d5_score,
                "connected_zones": len(connected_zones),
                "total_zones": len(all_zones),
                "unique_coords": len(set(coords)),
            },
            "D6_mda_experience_pillars": {"score": d6_score, "pillars": pillar_scores},
            "D7_field_tactical_blueprints": {"score": d7_score, "verified": valid_field_bps, "target": target_fields},
            "D8_fortress_harbor_clanhall_blueprints": {"score": d8_score, "verified": valid_fort_bps, "target": target_forts},
            "D9_race_growth_routes": {"score": d9_score, "verified": len(valid_routes), "target": 6},
            "D10_shop_and_refinement_catalogs": {"score": d10_score, "verified": valid_shop_catalogs, "target": target_towns},
            "D11_town_layout_archetypes": {
                "score": d11_score,
                "verified": valid_town_archetypes,
                "target": target_towns,
                "distinct_archetypes": sorted(town_archetypes_seen),
            },
            "D12_dungeon_vertical_cutaways": {
                "score": d12_score,
                "verified": valid_dungeon_cutaways,
                "target": target_dungeons,
            },
            "D13_omni_search_and_quick_jump": {
                "score": d13_score,
                "indexed_zones": indexed_zones,
                "target_zones": 63,
                "indexed_town_npcs": indexed_town_npcs,
                "target_town_npcs": 180,
                "indexed_service_marks": indexed_service_marks,
                "target_service_marks": 105,
                "indexed_dungeon_floors": indexed_dungeon_floors,
                "target_dungeon_floors": 48,
                "verified": indexed_zones + indexed_town_npcs + indexed_service_marks + indexed_dungeon_floors,
                "target": 63 + 180 + 105 + 48,
            },
            "D14_spawn_and_refinement_spoil_matrix": {
                "score": d14_score,
                "verified_dungeons": valid_dng_spawns,
                "target_dungeons": target_dungeons,
                "verified_fields": valid_field_spawns,
                "target_fields": target_fields,
                "verified": valid_dng_spawns + valid_field_spawns,
                "target": target_dungeons + target_fields,
            },
            "D15_archetype_raster_plates": {
                "score": d15_score,
                "verified": len(present_plates),
                "target": len(ARCHETYPE_RASTER_PLATES),
                "plates": present_plates,
            },
            "D16_unified_connected_map_directory": {
                "score": d16_score,
                "verified": d16_verified_zones,
                "target": 63,
                "groups": d16_groups,
                "ui_wired": has_d16_ui,
            },
            "D17_travel_route_and_gatekeeper_calculator": {
                "score": d17_score,
                "verified": reachable_pairs,
                "target": target_pairs,
                "starter_reachability": starter_reachability,
                "ui_wired": has_d17_ui,
            },
            "D18_dungeon_room_inspector_and_telemetry": {
                "score": d18_score,
                "clickable_chambers": clickable_chambers,
                "total_chambers": total_chambers,
                "clickable_spawns": clickable_spawns,
                "total_spawns": total_spawns,
                "verified": clickable_chambers + clickable_spawns,
                "target": total_chambers + total_spawns,
                "telemetry_wired": has_d18_ui_and_telemetry,
            },
            "D19_refinement_grade_and_spoil_locator": {
                "score": d19_score,
                "verified": valid_grades,
                "target": 6,
                "ui_wired": has_d19_ui,
            },
            "D20_bidirectional_studio_atlas_sync_and_docs": {
                "score": d20_score,
                "verified": sum(1 for c in d20_checks if c),
                "target": len(d20_checks),
                "sync_js_wired": has_d20_sync_js,
                "readme_documented": has_d20_readme,
                "drawio_verified": has_d20_drawio,
            },
            "D21_boss_hierarchy_and_sealed_god_chains": {
                "score": d21_score,
                "verified": valid_boss_chains,
                "target": 6,
                "ui_wired": has_d21_ui,
            },
            "D22_pip_world_radar_minimap_in_zoomed_views": {
                "score": d22_score,
                "verified": sum(1 for c in d22_checks if c),
                "target": len(d22_checks),
                "pip_renderer_wired": all(d22_checks),
            },
            "D23_quest_trial_chains_and_class_transfers": {
                "score": d23_score,
                "verified": valid_quest_chains,
                "target": 18,
                "tracks": sorted(seen_quest_tracks),
                "races": sorted(seen_quest_races),
                "class_tiers": sorted(seen_class_tiers),
                "ui_wired": has_d23_ui,
            },
            "D24_party_and_farming_efficiency_heatmap": {
                "score": d24_score,
                "verified": valid_farming_profiles,
                "target": 40,
                "party_modes": sorted(seen_party_modes),
                "spoil_grades": sorted(seen_spoil_grades),
                "ui_wired": has_d24_ui,
            },
            "D25_castle_siege_and_territory_tax_domains": {
                "score": d25_score,
                "verified": valid_siege_domains,
                "target": 8,
                "domain_tiers": sorted(seen_domain_tiers),
                "ui_wired": has_d25_ui,
            },
            "D26_world_boss_and_mvp_spawn_radar": {
                "score": d26_score,
                "verified": valid_boss_radar,
                "target": 32,
                "dungeon_mvp_count": dungeon_mvp_radar_count,
                "overland_boss_count": overland_boss_radar_count,
                "boss_categories": sorted(seen_boss_categories),
                "radar_statuses": sorted(seen_radar_statuses),
                "ui_wired": has_d26_ui,
            },
            "D27_seven_seals_and_mammon_rotation": {
                "score": d27_score,
                "verified": valid_seven_seals,
                "target": 16,
                "catacomb_sanctums": catacomb_sanctum_count,
                "tower_sanctums": tower_sanctum_count,
                "seals": sorted(seen_seals),
                "cabals": sorted(seen_cabals),
                "mammon_npcs": sorted(seen_mammon_npcs),
                "ui_wired": has_d27_ui,
            },
            "D28_manor_seed_and_caravan_economy": {
                "score": d28_score,
                "verified": valid_manor_routes,
                "target": 15,
                "caravan_risks": sorted(seen_caravan_risks),
                "reward_materials": sorted(seen_reward_materials),
                "ui_wired": has_d28_ui,
            },
            "D29_noblesse_and_olympiad_monument_network": {
                "score": d29_score,
                "verified": valid_olympiad_nodes,
                "target": 21,
                "olympiad_monuments": olympiad_monument_count,
                "subclass_sanctums": subclass_sanctum_count,
                "noblesse_shrines": noblesse_shrine_count,
                "node_categories": sorted(seen_olympiad_categories),
                "ui_wired": has_d29_ui,
            },
            "D30_intercontinental_transit_network": {
                "score": d30_score,
                "verified": valid_transit_lines,
                "target": 18,
                "maritime_ships": maritime_ship_count,
                "brass_airships": brass_airship_count,
                "gatekeeper_trunks": gatekeeper_trunk_count,
                "transit_modes": sorted(seen_transit_modes),
                "ui_wired": has_d30_ui,
            },
            "D31_soul_crystal_resonance_and_boss_absorption": {
                "score": d31_score,
                "verified": valid_soul_crystals,
                "target": 18,
                "crimson_red_stages": crimson_red_count,
                "verdant_green_stages": verdant_green_count,
                "azure_blue_stages": azure_blue_count,
                "crystal_colors": sorted(seen_crystal_colors),
                "stage_bands": sorted(seen_stage_bands),
                "weapon_grades": sorted(seen_weapon_grades),
                "ui_wired": has_d31_ui,
            },
            "D32_fishing_guild_and_hot_springs_sanctuaries": {
                "score": d32_score,
                "verified": valid_fishing_sanctuaries,
                "target": 16,
                "maritime_piers": maritime_pier_count,
                "luminous_lakes": luminous_lake_count,
                "thermal_hot_springs": thermal_spring_count,
                "water_categories": sorted(seen_water_categories),
                "time_windows": sorted(seen_time_windows),
                "ui_wired": has_d32_ui,
            },
            "D33_cursed_weapon_karma_and_pvp_arenas": {
                "score": d33_score,
                "verified": valid_pvp_hotspots,
                "target": 14,
                "cursed_drop_zones": cursed_drop_zone_count,
                "black_judge_sanctuaries": black_judge_sanctuary_count,
                "coliseum_arenas": coliseum_arena_count,
                "pvp_categories": sorted(seen_pvp_categories),
                "ruleset_tags": sorted(seen_ruleset_tags),
                "ui_wired": has_d33_ui,
            },
            "D34_dimensional_rift_and_four_sepulchers": {
                "score": d34_score,
                "verified": valid_rift_sepulchers,
                "target": 16,
                "dimensional_rifts": dimensional_rift_count,
                "four_sepulchers": four_sepulchers_count,
                "key_gated_chapels": key_gated_chapel_count,
                "instance_categories": sorted(seen_instance_categories),
                "ui_wired": has_d34_ui,
            },
            "D35_weapon_augmentation_and_symbol_dye_hubs": {
                "score": d35_score,
                "verified": valid_aug_dye_hubs,
                "target": 15,
                "life_stone_tiers": sorted(seen_life_stone_tiers),
                "ui_wired": has_d35_ui,
            },
            "D36_companion_pet_strider_and_wyvern_sanctuaries": {
                "score": d36_score,
                "verified": valid_comp_sanctuaries,
                "target": 12,
                "pet_kennels": pet_kennel_count,
                "strider_sanctums": strider_sanctum_count,
                "wyvern_roosts": wyvern_roost_count,
                "mount_categories": sorted(seen_mount_categories),
                "ui_wired": has_d36_ui,
            },
            "D37_clan_reputation_and_pledge_academies": {
                "score": d37_score,
                "verified": valid_clan_nodes,
                "target": 14,
                "clan_academies": clan_academy_count,
                "ambition_altars": clan_ambition_count,
                "pledge_sanctums": pledge_sanctum_count,
                "pledge_categories": sorted(seen_pledge_categories),
                "ui_wired": has_d37_ui,
            },
            "D38_field_herb_and_elemental_biomes": {
                "score": d38_score,
                "verified": valid_herb_biomes,
                "target": 24,
                "dominant_elements": sorted(seen_dominant_elements),
                "herb_drop_tiers": sorted(seen_herb_tiers),
                "ui_wired": has_d38_ui,
            },
            "D39_soulshot_and_dwarven_manufacture_workshops": {
                "score": d39_score,
                "verified": valid_workshop_plazas,
                "target": 15,
                "starter_plazas": starter_plaza_count,
                "regional_workshops": regional_workshop_count,
                "capital_master_forges": capital_forge_count,
                "workshop_tiers": sorted(seen_workshop_tiers),
                "ui_wired": has_d39_ui,
            },
            "D40_territory_ward_and_fortress_codex_supply": {
                "score": d40_score,
                "verified": valid_ward_nodes,
                "target": 16,
                "sovereign_territory_wards": sovereign_ward_count,
                "fortress_codex_vaults": codex_vault_count,
                "strongholds_covered": len(seen_ward_strongholds),
                "node_roles": sorted(seen_ward_roles),
                "ui_wired": has_d40_ui,
            },
            "D41_epic_boss_jewelry_and_status_resist_sanctums": {
                "score": d41_score,
                "verified": valid_epic_jewelry,
                "target": 12,
                "epic_rings": epic_ring_count,
                "epic_earrings": epic_earring_count,
                "epic_necklaces": epic_necklace_count,
                "slot_categories": sorted(seen_jewelry_slots),
                "grades": sorted(seen_jewelry_grades),
                "ui_wired": has_d41_ui,
            },
            "D42_adventurer_guide_buff_and_vitality_obelisks": {
                "score": d42_score,
                "verified": valid_vitality_obelisks,
                "target": 15,
                "starter_coupon_hubs": starter_obelisk_count,
                "regional_shadow_hubs": regional_obelisk_count,
                "capital_vitality_sanctuaries": capital_obelisk_count,
                "obelisk_tiers": sorted(seen_obelisk_tiers),
                "ui_wired": has_d42_ui,
            },
            "D43_armor_set_progression_and_masterwork_forges": {
                "score": d43_score,
                "verified": valid_armor_sets,
                "target": 16,
                "heavy_vanguard_sets": heavy_set_count,
                "light_skirmisher_sets": light_set_count,
                "mystic_robe_sets": robe_set_count,
                "armor_weight_classes": sorted(seen_armor_weights),
                "grades": sorted(seen_armor_grades),
                "ui_wired": has_d43_ui,
            },
            "D44_kamaloka_pailaka_and_seed_instances": {
                "score": d44_score,
                "verified": valid_kamaloka_portals,
                "target": 15,
                "kamaloka_abyss_halls": kamaloka_hall_count,
                "pailaka_vitality_trials": pailaka_trial_count,
                "seed_delusion_conduits": seed_conduit_count,
                "conduit_categories": sorted(seen_conduit_categories),
                "ui_wired": has_d44_ui,
            },
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Deterministic World Atlas Audit & Expansion Loop.")
    parser.add_argument("--auto-expand-next-wave", action="store_true", help="Expand next unbuilt Town & Dungeon wave.")
    parser.add_argument("--waves", type=int, default=1, help="Number of expansion waves to run when --auto-expand-next-wave is set.")
    parser.add_argument("--json", action="store_true", help="Print compact JSON summary.")
    args = parser.parse_args(argv)

    whc = json.loads(WHC_PATH.read_text(encoding="utf-8"))
    atlas = json.loads(ATLAS_PATH.read_text(encoding="utf-8"))

    prev_wave = 0
    if STATE_PATH.exists():
        try:
            prev_wave = int(json.loads(STATE_PATH.read_text(encoding="utf-8")).get("wave", 0))
        except Exception:
            prev_wave = 0

    executed_actions: list[str] = []
    if args.auto_expand_next_wave:
        for _ in range(max(1, args.waves)):
            res = expand_next_wave(whc, atlas)
            executed_actions.extend(res["actions"])
            prev_wave += 1
        ATLAS_PATH.write_text(json.dumps(atlas, indent=2) + "\n", encoding="utf-8")

    audit = audit_world_atlas(whc, atlas)
    state_payload = {
        "wave": prev_wave,
        "last_actions": executed_actions,
        "overall_score": audit["overall_score"],
        "dimensions": audit["dimensions"],
    }
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state_payload, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(state_payload, indent=2))
    else:
        dims = audit["dimensions"]
        print(f"ATLAS ITERATION WAVE {prev_wave} | OVERALL SCORE: {audit['overall_score']}/100")
        print(f"  D1  (6-Race Spawns)         : {dims['D1_race_spawn_locations']['score']}/100 ({dims['D1_race_spawn_locations']['verified']}/{dims['D1_race_spawn_locations']['target']})")
        print(f"  D2  (Town Blueprints & NPCs): {dims['D2_town_blueprints_and_npcs']['score']}/100 ({dims['D2_town_blueprints_and_npcs']['verified']}/{dims['D2_town_blueprints_and_npcs']['target']})")
        print(f"  D3  (Multi-Floor Dungeons)  : {dims['D3_multi_floor_dungeon_warps']['score']}/100 ({dims['D3_multi_floor_dungeon_warps']['verified']}/{dims['D3_multi_floor_dungeon_warps']['target']})")
        print(f"  D4  (Mob/Mini/Raid/MVP)     : {dims['D4_monster_miniboss_raid_mvp_spawns']['score']}/100 ({dims['D4_monster_miniboss_raid_mvp_spawns']['verified']}/{dims['D4_monster_miniboss_raid_mvp_spawns']['target']})")
        print(f"  D5  (Travel & Anti-Clutter) : {dims['D5_geographic_travel_and_anticlutter']['score']}/100 ({dims['D5_geographic_travel_and_anticlutter']['connected_zones']}/{dims['D5_geographic_travel_and_anticlutter']['total_zones']} zones)")
        print(f"  D6  (7 MDA Pillars)         : {dims['D6_mda_experience_pillars']['score']}/100 {dims['D6_mda_experience_pillars']['pillars']}")
        print(f"  D7  (24 Field Blueprints)   : {dims['D7_field_tactical_blueprints']['score']}/100 ({dims['D7_field_tactical_blueprints']['verified']}/{dims['D7_field_tactical_blueprints']['target']})")
        print(f"  D8  (8 Fortress Blueprints) : {dims['D8_fortress_harbor_clanhall_blueprints']['score']}/100 ({dims['D8_fortress_harbor_clanhall_blueprints']['verified']}/{dims['D8_fortress_harbor_clanhall_blueprints']['target']})")
        print(f"  D9  (6-Race Growth Routes)  : {dims['D9_race_growth_routes']['score']}/100 ({dims['D9_race_growth_routes']['verified']}/{dims['D9_race_growth_routes']['target']})")
        print(f"  D10 (Shop & +1..+15 Refine) : {dims['D10_shop_and_refinement_catalogs']['score']}/100 ({dims['D10_shop_and_refinement_catalogs']['verified']}/{dims['D10_shop_and_refinement_catalogs']['target']})")
        print(f"  D11 (4 Town Archetypes)     : {dims['D11_town_layout_archetypes']['score']}/100 ({dims['D11_town_layout_archetypes']['verified']}/{dims['D11_town_layout_archetypes']['target']})")
        print(f"  D12 (Dungeon Cutaway Elev)  : {dims['D12_dungeon_vertical_cutaways']['score']}/100 ({dims['D12_dungeon_vertical_cutaways']['verified']}/{dims['D12_dungeon_vertical_cutaways']['target']})")
        print(f"  D13 (Omni-Search & Jump)    : {dims['D13_omni_search_and_quick_jump']['score']}/100 ({dims['D13_omni_search_and_quick_jump']['indexed_zones']}/63 zones · {dims['D13_omni_search_and_quick_jump']['indexed_town_npcs']}/180 NPCs · {dims['D13_omni_search_and_quick_jump']['indexed_service_marks']}/105 marks · {dims['D13_omni_search_and_quick_jump']['indexed_dungeon_floors']}/48 floors)")
        print(f"  D14 (Spawn & Spoil Matrix)  : {dims['D14_spawn_and_refinement_spoil_matrix']['score']}/100 ({dims['D14_spawn_and_refinement_spoil_matrix']['verified_dungeons']}/{dims['D14_spawn_and_refinement_spoil_matrix']['target_dungeons']} dungeons · {dims['D14_spawn_and_refinement_spoil_matrix']['verified_fields']}/{dims['D14_spawn_and_refinement_spoil_matrix']['target_fields']} fields)")
        print(f"  D15 (Archetype Raster Maps) : {dims['D15_archetype_raster_plates']['score']}/100 ({dims['D15_archetype_raster_plates']['verified']}/{dims['D15_archetype_raster_plates']['target']} raster plates)")
        print(f"  D16 (63-Zone Map Directory) : {dims['D16_unified_connected_map_directory']['score']}/100 ({dims['D16_unified_connected_map_directory']['verified']}/{dims['D16_unified_connected_map_directory']['target']} zones)")
        print(f"  D17 (BFS Route Calculator)  : {dims['D17_travel_route_and_gatekeeper_calculator']['score']}/100 ({dims['D17_travel_route_and_gatekeeper_calculator']['verified']}/{dims['D17_travel_route_and_gatekeeper_calculator']['target']} starter->zone pairs)")
        print(f"  D18 (Chamber & Telemetry)   : {dims['D18_dungeon_room_inspector_and_telemetry']['score']}/100 ({dims['D18_dungeon_room_inspector_and_telemetry']['clickable_chambers']}/{dims['D18_dungeon_room_inspector_and_telemetry']['total_chambers']} chambers · {dims['D18_dungeon_room_inspector_and_telemetry']['clickable_spawns']}/{dims['D18_dungeon_room_inspector_and_telemetry']['total_spawns']} spawns)")
        print(f"  D19 (Refine & Spoil Locator): {dims['D19_refinement_grade_and_spoil_locator']['score']}/100 ({dims['D19_refinement_grade_and_spoil_locator']['verified']}/{dims['D19_refinement_grade_and_spoil_locator']['target']} grades)")
        print(f"  D20 (Studio/Atlas 20D Sync) : {dims['D20_bidirectional_studio_atlas_sync_and_docs']['score']}/100 ({dims['D20_bidirectional_studio_atlas_sync_and_docs']['verified']}/{dims['D20_bidirectional_studio_atlas_sync_and_docs']['target']} checks)")
        print(f"  D21 (6-God Boss Hierarchy)  : {dims['D21_boss_hierarchy_and_sealed_god_chains']['score']}/100 ({dims['D21_boss_hierarchy_and_sealed_god_chains']['verified']}/{dims['D21_boss_hierarchy_and_sealed_god_chains']['target']} Sealed-God chains)")
        print(f"  D22 (PiP World Radar Map)   : {dims['D22_pip_world_radar_minimap_in_zoomed_views']['score']}/100 ({dims['D22_pip_world_radar_minimap_in_zoomed_views']['verified']}/{dims['D22_pip_world_radar_minimap_in_zoomed_views']['target']} checks)")
        print(f"  D23 (3-Track Quest Trials)  : {dims['D23_quest_trial_chains_and_class_transfers']['score']}/100 ({dims['D23_quest_trial_chains_and_class_transfers']['verified']}/{dims['D23_quest_trial_chains_and_class_transfers']['target']} quests)")
        print(f"  D24 (40-Zone Farm Heatmap)  : {dims['D24_party_and_farming_efficiency_heatmap']['score']}/100 ({dims['D24_party_and_farming_efficiency_heatmap']['verified']}/{dims['D24_party_and_farming_efficiency_heatmap']['target']} combat zones)")
        print(f"  D25 (8 Castle Siege Domains): {dims['D25_castle_siege_and_territory_tax_domains']['score']}/100 ({dims['D25_castle_siege_and_territory_tax_domains']['verified']}/{dims['D25_castle_siege_and_territory_tax_domains']['target']} stronghold domains)")
        print(f"  D26 (32-Boss Respawn Radar) : {dims['D26_world_boss_and_mvp_spawn_radar']['score']}/100 ({dims['D26_world_boss_and_mvp_spawn_radar']['verified']}/{dims['D26_world_boss_and_mvp_spawn_radar']['target']} bosses)")
        print(f"  D27 (16 Seven-Seals Mammon) : {dims['D27_seven_seals_and_mammon_rotation']['score']}/100 ({dims['D27_seven_seals_and_mammon_rotation']['verified']}/{dims['D27_seven_seals_and_mammon_rotation']['target']} sanctums)")
        print(f"  D28 (15-Town Manor Economy) : {dims['D28_manor_seed_and_caravan_economy']['score']}/100 ({dims['D28_manor_seed_and_caravan_economy']['verified']}/{dims['D28_manor_seed_and_caravan_economy']['target']} town manors)")
        print(f"  D29 (21 Olympiad/Noblesse)  : {dims['D29_noblesse_and_olympiad_monument_network']['score']}/100 ({dims['D29_noblesse_and_olympiad_monument_network']['verified']}/{dims['D29_noblesse_and_olympiad_monument_network']['target']} heroic nodes)")
        print(f"  D30 (18 Transit Corridors)  : {dims['D30_intercontinental_transit_network']['score']}/100 ({dims['D30_intercontinental_transit_network']['verified']}/{dims['D30_intercontinental_transit_network']['target']} transit lines)")
        print(f"  D31 (18 Soul Crystal Stages): {dims['D31_soul_crystal_resonance_and_boss_absorption']['score']}/100 ({dims['D31_soul_crystal_resonance_and_boss_absorption']['verified']}/{dims['D31_soul_crystal_resonance_and_boss_absorption']['target']} resonance stages)")
        print(f"  D32 (16 Fishing/Hot Springs): {dims['D32_fishing_guild_and_hot_springs_sanctuaries']['score']}/100 ({dims['D32_fishing_guild_and_hot_springs_sanctuaries']['verified']}/{dims['D32_fishing_guild_and_hot_springs_sanctuaries']['target']} sanctuaries)")
        print(f"  D33 (14 Cursed/PvP Hotspots): {dims['D33_cursed_weapon_karma_and_pvp_arenas']['score']}/100 ({dims['D33_cursed_weapon_karma_and_pvp_arenas']['verified']}/{dims['D33_cursed_weapon_karma_and_pvp_arenas']['target']} hotspots)")
        print(f"  D34 (16 Rift/4-Sepulchers)  : {dims['D34_dimensional_rift_and_four_sepulchers']['score']}/100 ({dims['D34_dimensional_rift_and_four_sepulchers']['verified']}/{dims['D34_dimensional_rift_and_four_sepulchers']['target']} portals)")
        print(f"  D35 (15 Augment/Dye Hubs)   : {dims['D35_weapon_augmentation_and_symbol_dye_hubs']['score']}/100 ({dims['D35_weapon_augmentation_and_symbol_dye_hubs']['verified']}/{dims['D35_weapon_augmentation_and_symbol_dye_hubs']['target']} hubs)")
        print(f"  D36 (12 Pet/Strider/Wyvern) : {dims['D36_companion_pet_strider_and_wyvern_sanctuaries']['score']}/100 ({dims['D36_companion_pet_strider_and_wyvern_sanctuaries']['verified']}/{dims['D36_companion_pet_strider_and_wyvern_sanctuaries']['target']} sanctuaries)")
        print(f"  D37 (14 Clan/Pledge Nodes)  : {dims['D37_clan_reputation_and_pledge_academies']['score']}/100 ({dims['D37_clan_reputation_and_pledge_academies']['verified']}/{dims['D37_clan_reputation_and_pledge_academies']['target']} clan nodes)")
        print(f"  D38 (24 Field Herb/Elem)    : {dims['D38_field_herb_and_elemental_biomes']['score']}/100 ({dims['D38_field_herb_and_elemental_biomes']['verified']}/{dims['D38_field_herb_and_elemental_biomes']['target']} field biomes)")
        print(f"  D39 (15 Soulshot/Workshops) : {dims['D39_soulshot_and_dwarven_manufacture_workshops']['score']}/100 ({dims['D39_soulshot_and_dwarven_manufacture_workshops']['verified']}/{dims['D39_soulshot_and_dwarven_manufacture_workshops']['target']} workshop plazas)")
        print(f"  D40 (16 Territory/Codex)    : {dims['D40_territory_ward_and_fortress_codex_supply']['score']}/100 ({dims['D40_territory_ward_and_fortress_codex_supply']['verified']}/{dims['D40_territory_ward_and_fortress_codex_supply']['target']} ward/supply nodes)")
        print(f"  D41 (12 Epic Boss Jewelry)  : {dims['D41_epic_boss_jewelry_and_status_resist_sanctums']['score']}/100 ({dims['D41_epic_boss_jewelry_and_status_resist_sanctums']['verified']}/{dims['D41_epic_boss_jewelry_and_status_resist_sanctums']['target']} epic relics)")
        print(f"  D42 (15 Vitality Obelisks)  : {dims['D42_adventurer_guide_buff_and_vitality_obelisks']['score']}/100 ({dims['D42_adventurer_guide_buff_and_vitality_obelisks']['verified']}/{dims['D42_adventurer_guide_buff_and_vitality_obelisks']['target']} vitality obelisks)")
        print(f"  D43 (16 Armor Set Forges)   : {dims['D43_armor_set_progression_and_masterwork_forges']['score']}/100 ({dims['D43_armor_set_progression_and_masterwork_forges']['verified']}/{dims['D43_armor_set_progression_and_masterwork_forges']['target']} armor sets)")
        print(f"  D44 (15 Kamaloka/Pailaka)   : {dims['D44_kamaloka_pailaka_and_seed_instances']['score']}/100 ({dims['D44_kamaloka_pailaka_and_seed_instances']['verified']}/{dims['D44_kamaloka_pailaka_and_seed_instances']['target']} instance portals)")
        if executed_actions:
            print(f"  Actions                     : {', '.join(executed_actions)}")
        print(f"  Compact State Written       : {STATE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
