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
            },
        ]

        floors.append(
            {
                "floor_id": fid,
                "floor_index": f_i,
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
                }
            )
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

    # Ensure deep_town.town_blueprint also has race_spawn_point & refinement_anvils & zone_id
    deep_town = (atlas.get("t_deep_validation_slice") or {}).get("deep_town") or {}
    deep_tb = deep_town.get("town_blueprint")
    if isinstance(deep_tb, dict):
        deep_tb.setdefault("zone_id", deep_town.get("zone_id", "zone-town-lantern-hollow"))
        deep_tb.setdefault("studio_node_id", deep_town.get("studio_node_id", "town-lantern-hollow"))
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

    # Sync deep_town.town_blueprint onto starting_towns[0] if not attached yet
    starting_towns: list[dict[str, Any]] = zdir.get("starting_towns") or []
    if starting_towns and "town_blueprint" not in starting_towns[0] and isinstance(deep_tb, dict):
        starting_towns[0]["town_blueprint"] = deep_tb

    # 2. Expand next unbuilt Town Blueprint among the 6 Starting Towns + 9 Castle/Hub Towns
    all_towns = starting_towns + hub_towns
    for idx, t_entry in enumerate(all_towns, start=1):
        if "town_blueprint" not in t_entry:
            t_entry["town_blueprint"] = _synthesize_town_blueprint(t_entry, idx)
            t_entry["t_depth_status"] = "t_deep_validated"
            actions.append(f"expanded_town_blueprint:{t_entry['zone_id']}")
            break

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
        for fl in mf.get("floors") or []:
            if isinstance(fl.get("spawns"), list):
                if _ensure_spawn_tiers_in_table(
                    fl["spawns"],
                    29700 + d_idx * 30 + int(fl.get("floor_index", 1)) * 5,
                    20 + int(fl.get("floor_index", 1)) * 2,
                    mf.get("entrance_loc", "48550:248400"),
                ):
                    actions.append(f"completed_floor_spawns:{mf['dungeon_id']}:{fl.get('floor_id')}")

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

    # D6: 7 MDA Experience Pillars Score
    pillar_scores = {
        "Aesthetic": d5_score,
        "Continuity": round((d1_score + d5_score) / 2.0, 1),
        "Narrative": 100.0 if len(whc.get("historical_epochs") or []) >= 4 else 75.0,
        "Challenge": round((d4_score + d7_score + d8_score) / 3.0, 1),
        "Discovery": round((d2_score + d3_score + d7_score + d8_score) / 4.0, 1),
        "Fantasy": d1_score,
        "Submission": round((d2_score + d4_score + d7_score) / 3.0, 1),
    }
    d6_score = round(sum(pillar_scores.values()) / float(len(MDA_PILLARS)), 1)
    overall = round((d1_score + d2_score + d3_score + d4_score + d5_score + d6_score + d7_score + d8_score) / 8.0, 1)

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
        print(f"  D1 (6-Race Spawns)         : {dims['D1_race_spawn_locations']['score']}/100 ({dims['D1_race_spawn_locations']['verified']}/{dims['D1_race_spawn_locations']['target']})")
        print(f"  D2 (Town Blueprints & NPCs): {dims['D2_town_blueprints_and_npcs']['score']}/100 ({dims['D2_town_blueprints_and_npcs']['verified']}/{dims['D2_town_blueprints_and_npcs']['target']})")
        print(f"  D3 (Multi-Floor Dungeons)  : {dims['D3_multi_floor_dungeon_warps']['score']}/100 ({dims['D3_multi_floor_dungeon_warps']['verified']}/{dims['D3_multi_floor_dungeon_warps']['target']})")
        print(f"  D4 (Mob/Mini/Raid/MVP)     : {dims['D4_monster_miniboss_raid_mvp_spawns']['score']}/100 ({dims['D4_monster_miniboss_raid_mvp_spawns']['verified']}/{dims['D4_monster_miniboss_raid_mvp_spawns']['target']})")
        print(f"  D5 (Travel & Anti-Clutter) : {dims['D5_geographic_travel_and_anticlutter']['score']}/100 ({dims['D5_geographic_travel_and_anticlutter']['connected_zones']}/{dims['D5_geographic_travel_and_anticlutter']['total_zones']} zones)")
        print(f"  D6 (7 MDA Pillars)         : {dims['D6_mda_experience_pillars']['score']}/100 {dims['D6_mda_experience_pillars']['pillars']}")
        print(f"  D7 (24 Field Blueprints)   : {dims['D7_field_tactical_blueprints']['score']}/100 ({dims['D7_field_tactical_blueprints']['verified']}/{dims['D7_field_tactical_blueprints']['target']})")
        print(f"  D8 (8 Fortress Blueprints) : {dims['D8_fortress_harbor_clanhall_blueprints']['score']}/100 ({dims['D8_fortress_harbor_clanhall_blueprints']['verified']}/{dims['D8_fortress_harbor_clanhall_blueprints']['target']})")
        if executed_actions:
            print(f"  Actions                    : {', '.join(executed_actions)}")
        print(f"  Compact State Written      : {STATE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
