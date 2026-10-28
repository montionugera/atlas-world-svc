#!/usr/bin/env python3
"""Diversify all 15 Towns, 24 Field Hunting Areas, 8 Harbors/ClanHalls/Fortresses,
and 16 Multi-Floor Dungeons (65 floors) in `content/studio/t_shaped_world_atlas.json`
and `content/studio/map_feature_layers.json` so that towns and areas differ by
30% - 60%+ in size, shape, perimeter geometry, street/trail networks, and
building/room/spawn layouts — faithfully modeled on Lineage 2 (C4 / Interlude / High Five).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from tall_dungeon_expansion import expand_tall_dungeons

REPO_ROOT = Path(__file__).resolve().parents[1]
ATLAS_PATH = REPO_ROOT / "content" / "studio" / "t_shaped_world_atlas.json"
LAYERS_PATH = REPO_ROOT / "content" / "studio" / "map_feature_layers.json"


def _parse_loc(loc_str: str) -> tuple[int, int]:
    try:
        parts = str(loc_str).split(":")
        return int(parts[0]), int(parts[1])
    except Exception:
        return 0, 0


def _fmt_loc(x: int, y: int) -> str:
    return f"{x}:{y}"


def polygon_area(pts: list[list[float]] | list[tuple[float, float]]) -> float:
    n = len(pts)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) * 0.5


# ============================================================================
# 1. 15 LINEAGE 2-FAITHFUL TOWN BLUEPRINT GEOMETRIES (30%-60%+ VARIATION)
# ============================================================================
TOWN_BLUEPRINT_VARIATION_SPECS: dict[str, dict[str, Any]] = {
    "zone-town-lantern-hollow": {
        "scale": 1.30,
        "shape": "walled_harbor_pier",
        "l2_ref": "Talking Island / Gludin Harbor Village",
        "wall": [[24, 14], [76, 14], [88, 30], [88, 70], [74, 88], [58, 88], [58, 72], [42, 72], [42, 88], [26, 88], [12, 70], [12, 30]],
        "streets": [
            {"street_id": "street-ns-main", "name": "Meridian Harbor N-S Processional", "width_meters": 14.0, "path_pct": [[50, 14], [50, 50], [50, 72]]},
            {"street_id": "street-ew-cross", "name": "Blacksmith & Pier E-W Crossway", "width_meters": 12.5, "path_pct": [[12, 50], [50, 50], [88, 50]]},
            {"street_id": "street-plaza-ring", "name": "Inner Harbor Quay Ring", "width_meters": 7.0, "path_pct": [[34, 34], [66, 34], [66, 66], [34, 66], [34, 34]]},
        ],
        "gates": [(50, 14), (88, 50), (34, 88), (12, 50)],
        "bldg_coords": [
            (46, 45, 8, 8), (22, 24, 14, 12), (64, 24, 14, 12), (38, 16, 24, 11),
            (54, 56, 9, 8), (22, 58, 14, 12), (64, 58, 14, 12), (28, 74, 13, 10),
            (60, 74, 13, 10), (30, 84, 8, 6), (82, 46, 6, 8), (46, 12, 8, 6),
        ],
    },
    "zone-town-porcelain-loom": {
        "scale": 1.04,
        "shape": "crescent_lagoon",
        "l2_ref": "Elven Village (Shadow of the Mother Tree Crescent Lagoon)",
        "wall": [[20, 26], [50, 12], [80, 26], [84, 54], [68, 82], [50, 70], [32, 82], [16, 54]],
        "streets": [
            {"street_id": "street-mother-causeway", "name": "Mother-Tree Water Causeway", "width_meters": 11.5, "path_pct": [[50, 12], [50, 42], [50, 70]]},
            {"street_id": "street-crescent-arc", "name": "Crescent Lagoon Bridge Arc", "width_meters": 10.0, "path_pct": [[18, 50], [34, 64], [50, 42], [66, 64], [82, 50]]},
            {"street_id": "street-canopy-ring", "name": "Iris Lake Glade Ring", "width_meters": 6.5, "path_pct": [[38, 28], [62, 28], [66, 52], [34, 52], [38, 28]]},
        ],
        "gates": [(50, 12), (84, 52), (50, 74), (16, 52)],
        "bldg_coords": [
            (46, 38, 9, 9), (24, 30, 12, 10), (64, 30, 12, 10), (39, 16, 22, 10),
            (46, 52, 8, 8), (22, 52, 12, 10), (66, 52, 12, 10), (32, 66, 12, 9),
            (56, 66, 12, 9), (46, 72, 8, 5), (78, 48, 6, 7), (46, 11, 8, 5),
        ],
    },
    "zone-town-draft-kiln-post": {
        "scale": 1.18,
        "shape": "spiked_palisade",
        "l2_ref": "Orc Village (Immortal Plateau Spiked War-Ring)",
        "wall": [[50, 8], [84, 24], [90, 58], [68, 88], [32, 88], [10, 58], [16, 24]],
        "streets": [
            {"street_id": "street-flame-axis", "name": "Paagrio Flame Processional", "width_meters": 15.5, "path_pct": [[50, 8], [50, 48], [50, 88]]},
            {"street_id": "street-war-drum", "name": "War-Drum Stockade Crossway", "width_meters": 13.5, "path_pct": [[10, 56], [50, 48], [90, 56]]},
            {"street_id": "street-totem-hex", "name": "Totem Arena Hexagon", "width_meters": 8.0, "path_pct": [[50, 28], [70, 40], [66, 66], [34, 66], [30, 40], [50, 28]]},
        ],
        "gates": [(50, 8), (89, 56), (50, 88), (11, 56)],
        "bldg_coords": [
            (45, 44, 10, 9), (20, 28, 15, 12), (65, 28, 15, 12), (36, 14, 28, 12),
            (46, 58, 9, 8), (18, 58, 15, 12), (67, 58, 15, 12), (32, 74, 14, 10),
            (54, 74, 14, 10), (46, 82, 8, 6), (82, 52, 6, 8), (46, 8, 8, 6),
        ],
    },
    "zone-town-root-train-roundhouse": {
        "scale": 1.15,
        "shape": "quarry_rail_ring",
        "l2_ref": "Dwarven Village (Western Mining Strip-Mine Rail Loop)",
        "wall": [[16, 18], [72, 12], [90, 36], [84, 78], [58, 88], [18, 82], [10, 48]],
        "streets": [
            {"street_id": "street-mine-rail", "name": "Strip-Mine Ore Cart Rail Loop", "width_meters": 12.5, "path_pct": [[24, 26], [68, 22], [78, 52], [62, 78], [26, 74], [24, 26]]},
            {"street_id": "street-anvil-spur", "name": "Bronzekey Foundry Spur", "width_meters": 13.5, "path_pct": [[10, 48], [48, 48], [88, 44]]},
            {"street_id": "street-roundhouse-ns", "name": "Roundhouse Turntable Axis", "width_meters": 11.5, "path_pct": [[46, 14], [48, 48], [52, 86]]},
        ],
        "gates": [(46, 14), (88, 44), (52, 86), (10, 48)],
        "bldg_coords": [
            (44, 44, 9, 9), (22, 24, 15, 12), (62, 20, 16, 13), (38, 14, 20, 10),
            (52, 56, 9, 8), (20, 56, 16, 13), (64, 54, 15, 12), (36, 70, 14, 10),
            (54, 70, 14, 10), (48, 82, 8, 6), (82, 40, 6, 8), (42, 12, 8, 6),
        ],
    },
    "zone-town-carillon-belfry": {
        "scale": 1.00,
        "shape": "sunken_gorge_temple",
        "l2_ref": "Dark Elven Village (Sunken Shilen Cavern Gorge)",
        "wall": [[12, 32], [50, 14], [88, 32], [80, 68], [58, 80], [50, 66], [42, 80], [20, 68]],
        "streets": [
            {"street_id": "street-gorge-bridge", "name": "Sunken Gorge Suspension Span", "width_meters": 11.0, "path_pct": [[12, 44], [50, 44], [88, 44]]},
            {"street_id": "street-shilen-descent", "name": "Shilen Sanctum Stairway", "width_meters": 12.0, "path_pct": [[50, 14], [50, 44], [50, 68]]},
            {"street_id": "street-cavern-galleries", "name": "Umbral Cavern Gallery Arc", "width_meters": 7.0, "path_pct": [[24, 34], [50, 26], [76, 34], [70, 62], [30, 62], [24, 34]]},
        ],
        "gates": [(50, 14), (88, 44), (50, 72), (12, 44)],
        "bldg_coords": [
            (46, 40, 8, 8), (22, 30, 13, 10), (65, 30, 13, 10), (38, 16, 24, 11),
            (46, 52, 8, 8), (24, 52, 13, 10), (63, 52, 13, 10), (32, 64, 12, 9),
            (56, 64, 12, 9), (46, 70, 8, 5), (80, 42, 6, 8), (46, 12, 8, 5),
        ],
    },
    "zone-town-cinnamon-mill": {
        "scale": 0.85,
        "shape": "windmill_bluff",
        "l2_ref": "Kamael Village (Isle of Souls Triangular Bluff)",
        "wall": [[50, 12], [86, 44], [76, 84], [24, 84], [14, 44]],
        "streets": [
            {"street_id": "street-windmill-spine", "name": "Nornil Bluff Ridge Trail", "width_meters": 10.5, "path_pct": [[50, 14], [50, 52], [50, 84]]},
            {"street_id": "street-terrace-fork", "name": "Spice Mill V-Terrace", "width_meters": 9.5, "path_pct": [[16, 46], [50, 52], [84, 46]]},
            {"street_id": "street-lower-waterwheel", "name": "Waterwheel Millpond Loop", "width_meters": 6.5, "path_pct": [[32, 64], [68, 64], [64, 78], [36, 78], [32, 64]]},
        ],
        "gates": [(50, 12), (84, 44), (50, 84), (16, 44)],
        "bldg_coords": [
            (46, 48, 8, 8), (26, 34, 12, 10), (62, 34, 12, 10), (40, 20, 20, 10),
            (46, 60, 8, 7), (24, 56, 12, 10), (64, 56, 12, 10), (34, 70, 12, 9),
            (54, 70, 12, 9), (46, 80, 8, 5), (78, 44, 6, 7), (46, 12, 8, 5),
        ],
    },
    "zone-town-kilnwatch-bastion": {
        "scale": 1.65,
        "shape": "trapezoid_fort",
        "l2_ref": "Town of Gludio / Town of Dion (Bastion Keep Hub)",
        "wall": [[22, 10], [78, 10], [92, 32], [88, 76], [70, 90], [30, 90], [12, 76], [8, 32]],
        "streets": [
            {"street_id": "street-citadel-boulevard", "name": "Gludio-Dion Grand Citadel Avenue", "width_meters": 16.0, "path_pct": [[50, 10], [50, 48], [50, 90]]},
            {"street_id": "street-guild-crossway", "name": "Six-Race Class Transfer Crossway", "width_meters": 14.0, "path_pct": [[10, 48], [50, 48], [90, 48]]},
            {"street_id": "street-bastion-courtyard", "name": "Outer Bastion Parade Ring", "width_meters": 8.5, "path_pct": [[26, 26], [74, 26], [76, 72], [24, 72], [26, 26]]},
        ],
        "gates": [(50, 10), (90, 48), (50, 90), (10, 48)],
        "bldg_coords": [
            (45, 43, 10, 10), (18, 22, 16, 13), (66, 22, 16, 13), (36, 12, 28, 12),
            (54, 55, 10, 9), (18, 56, 16, 13), (66, 56, 16, 13), (32, 74, 15, 11),
            (53, 74, 15, 11), (46, 84, 8, 6), (84, 44, 6, 8), (46, 8, 8, 6),
        ],
    },
    "zone-town-glaze-barge-quay": {
        "scale": 1.42,
        "shape": "canal_octagon",
        "l2_ref": "Heine Water City (Innadril Canal Islands & Bridges)",
        "wall": [[16, 14], [84, 14], [92, 42], [86, 86], [60, 86], [58, 66], [42, 66], [40, 86], [14, 86], [8, 42]],
        "streets": [
            {"street_id": "street-grand-canal-quay", "name": "Heine Grand Water-Canal & Twin Quays", "width_meters": 15.0, "path_pct": [[24, 84], [24, 48], [76, 48], [76, 84]]},
            {"street_id": "street-harbor-spine", "name": "Innadril Central Island Causeway", "width_meters": 13.0, "path_pct": [[50, 14], [50, 48], [50, 66]]},
            {"street_id": "street-lagoon-bridges", "name": "Venetian Stone Bridge Loop", "width_meters": 8.5, "path_pct": [[12, 34], [50, 34], [88, 34]]},
        ],
        "gates": [(50, 14), (90, 44), (24, 86), (10, 44)],
        "bldg_coords": [
            (46, 42, 9, 9), (18, 20, 15, 11), (67, 20, 15, 11), (38, 15, 24, 10),
            (46, 54, 9, 8), (16, 54, 15, 13), (69, 54, 15, 13), (20, 70, 14, 11),
            (66, 70, 14, 11), (22, 82, 8, 6), (84, 42, 6, 8), (46, 12, 8, 6),
        ],
    },
    "zone-town-saffron-press": {
        "scale": 0.78,
        "shape": "floran_hamlet",
        "l2_ref": "Floran Village (Unwalled Agricultural Mill Hamlet)",
        "wall": [[32, 20], [70, 18], [80, 46], [70, 78], [30, 80], [20, 48]],
        "streets": [
            {"street_id": "street-floran-lane", "name": "Floran Millstream Dirt Lane", "width_meters": 9.0, "path_pct": [[20, 48], [50, 52], [80, 46]]},
            {"street_id": "street-barn-path", "name": "Saffron Press Barn Track", "width_meters": 8.5, "path_pct": [[48, 19], [50, 52], [50, 79]]},
            {"street_id": "street-pasture-loop", "name": "Commons Pasture Green", "width_meters": 6.0, "path_pct": [[36, 36], [64, 36], [62, 64], [38, 64], [36, 36]]},
        ],
        "gates": [(48, 19), (80, 46), (50, 79), (20, 48)],
        "bldg_coords": [
            (46, 46, 8, 8), (28, 28, 11, 9), (61, 28, 11, 9), (41, 20, 18, 8),
            (53, 54, 8, 7), (28, 54, 11, 9), (61, 54, 11, 9), (36, 66, 11, 8),
            (53, 66, 11, 8), (46, 74, 8, 5), (72, 44, 6, 7), (46, 18, 8, 5),
        ],
    },
    "zone-town-pinion-terminus": {
        "scale": 1.95,
        "shape": "diamond_bazaar",
        "l2_ref": "Town of Giran (Diamond Trade Plaza & Twin Bridges)",
        "wall": [[50, 6], [94, 48], [50, 92], [6, 48]],
        "streets": [
            {"street_id": "street-giran-bazaar-ew", "name": "Giran Grand Merchant Colonnade", "width_meters": 18.0, "path_pct": [[8, 48], [50, 48], [92, 48]]},
            {"street_id": "street-giran-cathedral-ns", "name": "Einhasad Cathedral & Trade Axis", "width_meters": 16.5, "path_pct": [[50, 8], [50, 48], [50, 90]]},
            {"street_id": "street-bazaar-diamond", "name": "Central Auction & Shop Diamond", "width_meters": 10.5, "path_pct": [[50, 24], [76, 48], [50, 74], [24, 48], [50, 24]]},
        ],
        "gates": [(50, 8), (92, 48), (50, 90), (8, 48)],
        "bldg_coords": [
            (45, 43, 10, 10), (26, 28, 15, 12), (59, 28, 15, 12), (38, 12, 24, 11),
            (54, 54, 9, 9), (24, 54, 15, 12), (61, 54, 15, 12), (34, 70, 14, 10),
            (52, 70, 14, 10), (46, 84, 8, 6), (84, 44, 6, 8), (46, 8, 8, 6),
        ],
    },
    "zone-town-escapement-anvil": {
        "scale": 1.55,
        "shape": "oren_cross_bastion",
        "l2_ref": "Town of Oren (Cross-Bastion Military Garrison)",
        "wall": [[20, 12], [80, 12], [80, 32], [92, 32], [92, 68], [80, 68], [80, 88], [20, 88], [20, 68], [8, 68], [8, 32], [20, 32]],
        "streets": [
            {"street_id": "street-oren-grid-ns", "name": "Oren Military Parade Axis", "width_meters": 15.0, "path_pct": [[50, 12], [50, 50], [50, 88]]},
            {"street_id": "street-oren-grid-ew", "name": "Ivory-Gate Cross Boulevard", "width_meters": 14.5, "path_pct": [[8, 50], [50, 50], [92, 50]]},
            {"street_id": "street-oren-casemate", "name": "Inner Casemate Square", "width_meters": 8.5, "path_pct": [[28, 28], [72, 28], [72, 72], [28, 72], [28, 28]]},
        ],
        "gates": [(50, 12), (92, 50), (50, 88), (8, 50)],
        "bldg_coords": [
            (46, 45, 9, 9), (22, 18, 15, 12), (63, 18, 15, 12), (38, 14, 24, 11),
            (54, 56, 9, 8), (22, 62, 15, 12), (63, 62, 15, 12), (35, 74, 14, 10),
            (53, 74, 14, 10), (46, 82, 8, 6), (84, 46, 6, 8), (46, 12, 8, 6),
        ],
    },
    "zone-town-inductor-switchyard": {
        "scale": 1.78,
        "shape": "radial_moat_spire",
        "l2_ref": "Town of Goddard / Schuttgart (Stepped Caldera Ring Citadel)",
        "wall": [[28, 8], [72, 8], [92, 28], [92, 72], [72, 92], [28, 92], [8, 72], [8, 28]],
        "streets": [
            {"street_id": "street-goddard-upper-ring", "name": "Goddard Stepped Caldera Ring", "width_meters": 14.0, "path_pct": [[32, 22], [68, 22], [80, 50], [68, 78], [32, 78], [20, 50], [32, 22]]},
            {"street_id": "street-goddard-forge-axis", "name": "Valakas Forge Radial Spine", "width_meters": 16.0, "path_pct": [[50, 8], [50, 50], [50, 92]]},
            {"street_id": "street-goddard-switchyard", "name": "Inductor Switchyard Crossway", "width_meters": 14.0, "path_pct": [[8, 50], [50, 50], [92, 50]]},
        ],
        "gates": [(50, 8), (92, 50), (50, 92), (8, 50)],
        "bldg_coords": [
            (45, 44, 10, 10), (20, 24, 16, 12), (64, 24, 16, 12), (36, 10, 28, 11),
            (54, 56, 9, 8), (20, 60, 16, 12), (64, 60, 16, 12), (34, 76, 14, 10),
            (52, 76, 14, 10), (46, 86, 8, 6), (84, 46, 6, 8), (46, 8, 8, 6),
        ],
    },
    "zone-town-starfall-haven": {
        "scale": 2.05,
        "shape": "cliff_keep_harbor",
        "l2_ref": "Rune Township & Keucereus Sky-Harbor (Split Cliff Keep + Lower Dock)",
        "wall": [[8, 10], [58, 8], [62, 32], [94, 32], [94, 88], [54, 88], [50, 70], [8, 74]],
        "streets": [
            {"street_id": "street-rune-skybridge", "name": "Upper Cliff Keep to Lower Harbor Sky-Bridge", "width_meters": 16.5, "path_pct": [[12, 42], [54, 42], [76, 60], [92, 60]]},
            {"street_id": "street-rune-citadel-ns", "name": "Upper Citadel Royal Escalier", "width_meters": 15.0, "path_pct": [[34, 10], [34, 42], [34, 72]]},
            {"street_id": "street-rune-harbor-pier", "name": "Lower Airship & Maritime Quay Loop", "width_meters": 12.0, "path_pct": [[62, 40], [88, 40], [88, 80], [62, 80], [62, 40]]},
        ],
        "gates": [(34, 10), (94, 60), (74, 88), (8, 42)],
        "bldg_coords": [
            (30, 38, 10, 9), (14, 20, 15, 12), (66, 42, 16, 12), (24, 12, 22, 11),
            (52, 46, 9, 9), (14, 54, 15, 12), (66, 62, 16, 12), (36, 56, 14, 10),
            (68, 22, 15, 11), (70, 82, 8, 6), (86, 56, 6, 8), (30, 8, 8, 6),
        ],
    },
    "zone-town-crown-beacon": {
        "scale": 2.35,
        "shape": "imperial_pentagon",
        "l2_ref": "Town of Aden (Grand Imperial Cathedral Pentagon Capital)",
        "wall": [[50, 4], [96, 30], [84, 94], [16, 94], [4, 30]],
        "streets": [
            {"street_id": "street-aden-royal-axis", "name": "Aden Grand Cathedral Colonnade", "width_meters": 20.0, "path_pct": [[50, 6], [50, 50], [50, 94]]},
            {"street_id": "street-aden-imperial-ew", "name": "Imperial Bastion Cross-Boulevard", "width_meters": 17.5, "path_pct": [[6, 34], [50, 50], [94, 34]]},
            {"street_id": "street-aden-pentagon-ring", "name": "Inner Royal Pentagon Ring", "width_meters": 11.5, "path_pct": [[50, 18], [80, 38], [68, 78], [32, 78], [20, 38], [50, 18]]},
        ],
        "gates": [(50, 6), (94, 34), (50, 94), (6, 34)],
        "bldg_coords": [
            (44, 45, 12, 10), (16, 32, 17, 13), (67, 32, 17, 13), (34, 10, 32, 13),
            (55, 56, 10, 9), (20, 60, 17, 13), (63, 60, 17, 13), (30, 76, 16, 11),
            (54, 76, 16, 11), (46, 88, 8, 6), (86, 32, 6, 8), (46, 6, 8, 6),
        ],
    },
    "zone-town-torque-balance-citadel": {
        "scale": 1.32,
        "shape": "hunters_canyon_lodge",
        "l2_ref": "Hunters Village (Enchanted Valley Timber Palisade Lodge)",
        "wall": [[14, 22], [48, 12], [86, 22], [90, 58], [72, 86], [28, 86], [10, 58]],
        "streets": [
            {"street_id": "street-hunters-valley", "name": "Hunters Canyon Guild Promenade", "width_meters": 13.0, "path_pct": [[12, 54], [50, 46], [88, 54]]},
            {"street_id": "street-torque-spire", "name": "Planetary Citadel North-South Spine", "width_meters": 12.5, "path_pct": [[48, 12], [50, 46], [50, 86]]},
            {"street_id": "street-lodge-terrace", "name": "Ranger & Mercenary Lodge Ring", "width_meters": 7.5, "path_pct": [[28, 30], [72, 30], [70, 68], [30, 68], [28, 30]]},
        ],
        "gates": [(48, 12), (88, 54), (50, 86), (12, 54)],
        "bldg_coords": [
            (46, 42, 9, 9), (20, 26, 14, 11), (66, 26, 14, 11), (38, 14, 24, 10),
            (54, 54, 9, 8), (22, 56, 14, 11), (64, 56, 14, 11), (34, 72, 13, 10),
            (53, 72, 13, 10), (46, 80, 8, 6), (82, 50, 6, 8), (44, 12, 8, 6),
        ],
    },
}


# ============================================================================
# 2. 10 DISTINCT FIELD & FORTRESS TACTICAL ARCHETYPE TEMPLATES (30%-60%+ VARIATION)
# ============================================================================
FIELD_TACTICAL_TEMPLATES: list[dict[str, Any]] = [
    # 0: Compact Border Outpost Meadow (Talking Island East / Windmill Hill - smaller compact basin)
    {
        "archetype_tag": "compact_meadow_outpost",
        "perim": [[20, 20], [78, 18], [82, 52], [74, 80], [22, 82], [16, 50]],
        "trails": [
            [[22, 50], [48, 48], [76, 42]],
            [[48, 48], [58, 66], [70, 72]],
        ],
        "marks": [(24, 50), (40, 26), (28, 72), (56, 30)],
        "spawns": [(40, 52, 11), (56, 44, 9), (66, 64, 10), (70, 30, 9)],
        "warp": (76, 48),
    },
    # 1: Elongated E-W Canyon Gorge (Tanor Canyon / Death Pass / Execution Grounds - wide & narrow)
    {
        "archetype_tag": "elongated_canyon_gorge",
        "perim": [[6, 28], [46, 22], [94, 26], [96, 54], [88, 74], [48, 78], [8, 72], [4, 48]],
        "trails": [
            [[8, 50], [38, 46], [68, 52], [92, 44]],
            [[38, 46], [52, 64], [78, 66]],
        ],
        "marks": [(14, 50), (34, 32), (20, 66), (62, 32)],
        "spawns": [(32, 52, 12), (54, 46, 10), (74, 58, 11), (86, 38, 10)],
        "warp": (90, 50),
    },
    # 2: Sprawling Wide Marsh & Spore Basin (Cruma Marshlands / Swamp of Screams / Sea of Spores - huge)
    {
        "archetype_tag": "sprawling_marsh_basin",
        "perim": [[8, 10], [54, 6], [92, 14], [96, 52], [90, 88], [48, 94], [10, 86], [4, 48]],
        "trails": [
            [[12, 44], [36, 34], [62, 42], [88, 30]],
            [[36, 34], [46, 66], [76, 76]],
        ],
        "marks": [(16, 44), (36, 20), (18, 76), (60, 22)],
        "spawns": [(34, 54, 16), (56, 42, 13), (74, 70, 14), (82, 26, 12)],
        "warp": (88, 50),
    },
    # 3: Volcanic Caldera Ring (Blazing Swamp / Forge of the Gods - octagonal crater)
    {
        "archetype_tag": "volcanic_caldera_crater",
        "perim": [[30, 8], [70, 8], [92, 28], [92, 72], [70, 92], [30, 92], [8, 72], [8, 28]],
        "trails": [
            [[16, 50], [34, 30], [66, 30], [84, 50], [66, 72], [34, 72], [16, 50]],
            [[34, 30], [50, 50], [66, 72]],
        ],
        "marks": [(20, 50), (36, 22), (26, 76), (64, 22)],
        "spawns": [(36, 50, 14), (50, 36, 12), (66, 62, 14), (78, 34, 11)],
        "warp": (84, 50),
    },
    # 4: Diagonal N-S Mountain Valley Corridor (Dragon Valley / Enchanted Valley / Valley of Saints)
    {
        "archetype_tag": "diagonal_valley_corridor",
        "perim": [[14, 8], [62, 10], [88, 38], [92, 86], [44, 92], [16, 64], [8, 28]],
        "trails": [
            [[20, 18], [44, 42], [66, 64], [84, 80]],
            [[44, 42], [70, 34], [82, 48]],
        ],
        "marks": [(22, 24), (48, 20), (24, 58), (64, 28)],
        "spawns": [(38, 42, 14), (54, 54, 12), (72, 68, 13), (78, 38, 11)],
        "warp": (84, 74),
    },
    # 5: Coastal Arch & Reef Peninsula (Alligator Island / Kelp Reef /Cobalt Sandbar)
    {
        "archetype_tag": "coastal_arch_peninsula",
        "perim": [[12, 18], [52, 10], [88, 22], [94, 62], [74, 88], [48, 72], [22, 86], [8, 54]],
        "trails": [
            [[16, 56], [36, 38], [64, 38], [84, 58]],
            [[36, 38], [50, 62], [70, 74]],
        ],
        "marks": [(18, 58), (38, 22), (24, 76), (62, 24)],
        "spawns": [(34, 46, 13), (56, 40, 11), (72, 64, 13), (80, 34, 10)],
        "warp": (86, 56),
    },
    # 6: Terraced Agricultural & Aqueduct Wedge (Floran Agricultural / Dion Hills / Apricot Terrace)
    {
        "archetype_tag": "terraced_aqueduct_wedge",
        "perim": [[16, 14], [84, 16], [90, 44], [76, 84], [28, 86], [10, 56]],
        "trails": [
            [[16, 36], [50, 36], [82, 36]],
            [[24, 64], [52, 64], [74, 64]],
        ],
        "marks": [(18, 36), (42, 22), (24, 68), (66, 22)],
        "spawns": [(36, 48, 13), (58, 46, 11), (66, 68, 12), (76, 32, 10)],
        "warp": (82, 46),
    },
    # 7: Astral Sky-Bridge & Monolith Span (Wall of Argos / Imperial Tomb / Orrery Bridge)
    {
        "archetype_tag": "astral_skybridge_span",
        "perim": [[8, 20], [38, 12], [68, 12], [94, 24], [92, 76], [64, 88], [34, 88], [6, 74]],
        "trails": [
            [[10, 48], [36, 48], [68, 48], [90, 48]],
            [[36, 48], [52, 26], [68, 48], [52, 72], [36, 48]],
        ],
        "marks": [(14, 48), (44, 20), (22, 74), (62, 20)],
        "spawns": [(32, 48, 14), (52, 34, 12), (68, 62, 14), (82, 34, 11)],
        "warp": (88, 48),
    },
]


# ============================================================================
# 3. 16 MULTI-FLOOR DUNGEON CUSTOM GEOMETRIES (BY L2 ARCHETYPE & FLOOR)
# ============================================================================
DUNGEON_FLOOR_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    # Ant Nest / Underground Cavern Brood (irregular sprawling brood chambers)
    "ant_nest_cavern": [
        {
            "rooms": [
                ("B1 Upper Tunnel Gallery", 10, 32, 22, 26, 8.5),
                ("B1 Worker Ant Brood Hive", 38, 16, 26, 28, 9.5),
                ("B1 Acid Slag Chasm", 68, 46, 22, 32, 9.0),
            ],
            "warps": [(14, 46), (84, 64)],
        },
        {
            "rooms": [
                ("B2 Noble Ant Guard Warren", 12, 20, 24, 30, 9.0),
                ("B2 Larva Incubator Rotunda", 42, 40, 28, 32, 10.5),
                ("B2 Deep Chitin Descent", 72, 18, 20, 34, 9.5),
            ],
            "warps": [(18, 36), (82, 34)],
        },
        {
            "rooms": [
                ("B3 Royal Guard Antechamber", 14, 30, 26, 34, 10.5),
                ("B3 Queen Ant's Sovereign Nest", 48, 18, 40, 56, 12.0),
            ],
            "warps": [(20, 48), (82, 62)],
        },
    ],
    # Cruma Tower / Concentric Octagonal Giant Research Facility
    "cruma_concentric_spire": [
        {
            "rooms": [
                ("1F Outer Coolant Ring Hall", 12, 28, 24, 36, 9.5),
                ("1F Porta & Excuro Test Core", 44, 18, 24, 28, 10.0),
                ("1F Ascent Elevator Plinth", 72, 30, 20, 34, 9.5),
            ],
            "warps": [(16, 46), (82, 48)],
        },
        {
            "rooms": [
                ("2F Krator Dynamo Gallery", 14, 18, 26, 30, 10.0),
                ("2F Mordeo Resonance Rotunda", 46, 36, 26, 34, 11.0),
                ("2F Catherok Conduit Bridge", 74, 20, 18, 32, 9.5),
            ],
            "warps": [(20, 34), (82, 36)],
        },
        {
            "rooms": [
                ("3F Sealed Control Vestibule", 16, 32, 24, 32, 10.5),
                ("3F Core Prime Governor Sanctum", 48, 16, 40, 60, 12.0),
            ],
            "warps": [(22, 48), (84, 64)],
        },
    ],
    # Tower of Insolence (ToI) / 14-Floor Grand Circular Ring Spire
    "toi_grand_spire": [
        {
            "rooms": [
                ("1F–4F Lower Hallate colonnade", 10, 24, 24, 42, 10.5),
                ("5F–7F Kernon Spiral Stairwell", 40, 14, 28, 34, 11.0),
                ("8F–9F Platinum Tribe Gallery", 72, 34, 20, 38, 10.0),
            ],
            "warps": [(16, 46), (82, 54)],
        },
        {
            "rooms": [
                ("10F Golkonda Seal Atrium", 12, 34, 26, 34, 11.0),
                ("11F–12F Archangel Gallery", 44, 16, 28, 36, 11.5),
                ("13F Galaxia Ascent Threshold", 74, 28, 18, 36, 10.5),
            ],
            "warps": [(18, 50), (82, 46)],
        },
        {
            "rooms": [
                ("14F Angelic Vortex Antechamber", 14, 28, 26, 38, 11.5),
                ("14F Rooftop Apex · Baium's Throne", 46, 14, 44, 64, 12.0),
            ],
            "warps": [(20, 48), (86, 66)],
        },
    ],
    # Seven Signs Catacomb / Necropolis (Linear Seal Walk + 4 Quadrant Crypts + Anakim/Lilith Sanctum)
    "seven_signs_necropolis": [
        {
            "rooms": [
                ("B1 Dusk/Dawn Entry Portico", 10, 34, 20, 28, 8.5),
                ("B1 Nephilim & Lilim Cloister", 36, 20, 26, 26, 9.0),
                ("B1 Mammon Blacksmith Crypt", 68, 34, 22, 30, 9.0),
            ],
            "warps": [(14, 48), (82, 50)],
        },
        {
            "rooms": [
                ("B2 Seal Stone Offering Hall", 12, 22, 24, 28, 9.5),
                ("B2 Inquisitor Crossroad Vault", 42, 42, 26, 30, 10.0),
                ("B2 Festival of Darkness Altar", 72, 22, 20, 30, 9.5),
            ],
            "warps": [(18, 36), (82, 38)],
        },
        {
            "rooms": [
                ("B3 Anakim & Lilith Seal Gate", 14, 32, 26, 32, 10.5),
                ("B3 Primordial God-Seal Sanctum", 48, 20, 40, 54, 12.0),
            ],
            "warps": [(20, 48), (84, 64)],
        },
    ],
    # Forgotten Temple / Dual Elemental Fire & Water Wings
    "forgotten_dual_wings": [
        {
            "rooms": [
                ("B1 Sunken Vestibule", 10, 34, 20, 28, 8.5),
                ("B1 Salamander Fire Wing (Left)", 38, 14, 28, 28, 9.5),
                ("B1 Undine Water Wing (Right)", 68, 48, 24, 30, 9.5),
            ],
            "warps": [(14, 48), (84, 64)],
        },
        {
            "rooms": [
                ("B2 Magma Flume Gallery", 14, 18, 26, 30, 9.5),
                ("B2 Tidal Maelstrom Conduit", 46, 44, 26, 30, 10.0),
                ("B2 Elemental Convergence Bridge", 74, 22, 18, 32, 9.5),
            ],
            "warps": [(20, 34), (82, 38)],
        },
        {
            "rooms": [
                ("B3 Twin Seal Braziers", 16, 30, 26, 36, 10.5),
                ("B3 Abyssal Elemental Sanctum", 50, 18, 38, 56, 11.5),
            ],
            "warps": [(22, 48), (84, 64)],
        },
    ],
}


def diversify_atlas() -> None:
    atlas = json.loads(ATLAS_PATH.read_text(encoding="utf-8"))
    zdir = atlas["t_breadth_zone_directory"]

    # 1. Diversify all 15 Towns (starting_towns + other_castle_and_hub_towns + deep_town)
    all_towns = zdir["starting_towns"] + zdir["other_castle_and_hub_towns"]
    for t_entry in all_towns:
        zid = t_entry["zone_id"]
        spec = TOWN_BLUEPRINT_VARIATION_SPECS.get(zid)
        if not spec:
            continue
        tb = t_entry["town_blueprint"]
        bx, by = _parse_loc(t_entry.get("loc_coord", "-84120:243500"))
        tb["wall_polygon_pct"] = [list(pt) for pt in spec["wall"]]
        tb["streets"] = [dict(st) for st in spec["streets"]]

        # Update gates positions while preserving gate_id, name, direction, target_zone_id
        for g_idx, gate in enumerate(tb.get("gates") or []):
            if g_idx < len(spec["gates"]):
                gx, gy = spec["gates"][g_idx]
                gate["x_pct"] = gx
                gate["y_pct"] = gy

        # Update buildings 1..12 coordinates & dimensions
        b_coords = spec["bldg_coords"]
        b_map: dict[int, tuple[int, int, int, int]] = {}
        for b_obj in tb.get("buildings") or []:
            bnum = int(b_obj.get("building_number", 1))
            if 1 <= bnum <= len(b_coords):
                x, y, w, h = b_coords[bnum - 1]
                b_obj["x_pct"] = x
                b_obj["y_pct"] = y
                b_obj["w_pct"] = w
                b_obj["h_pct"] = h
                b_map[bnum] = (x, y, w, h)

        # Update race_spawn_point to building #1 center
        if 1 in b_map and isinstance(tb.get("race_spawn_point"), dict):
            x1, y1, w1, h1 = b_map[1]
            tb["race_spawn_point"]["x_pct"] = x1 + w1 // 2
            tb["race_spawn_point"]["y_pct"] = y1 + h1 // 2

        # Update refinement_anvils to building #3 center
        if 3 in b_map:
            x3, y3, w3, h3 = b_map[3]
            for anv in tb.get("refinement_anvils") or []:
                anv["x_pct"] = x3 + w3 // 2
                anv["y_pct"] = y3 + h3 // 2

        # Update service_marks to match their building_number center
        for m_obj in tb.get("service_marks") or []:
            bnum = int(m_obj.get("building_number", 1))
            if bnum in b_map:
                bx_p, by_p, bw_p, bh_p = b_map[bnum]
                offset = 2 if m_obj.get("mark_type") == "refinement_anvils" else 0
                m_obj["x_pct"] = bx_p + bw_p // 2 + offset
                m_obj["y_pct"] = by_p + bh_p // 2 + offset

        # Update npc_roster 1..12 coordinates to match their building_number center
        for npc in tb.get("npc_roster") or []:
            bnum = int(npc.get("building_number", 1))
            if bnum in b_map:
                bx_p, by_p, bw_p, bh_p = b_map[bnum]
                nx = bx_p + bw_p // 2
                ny = by_p + bh_p // 2
                npc["x_pct"] = nx
                npc["y_pct"] = ny
                npc["loc_coord"] = _fmt_loc(bx + (nx - 50) * 18, by + (ny - 50) * 18)

    # Sync deep_town with starting_towns[0]
    if zdir["starting_towns"]:
        atlas["t_deep_validation_slice"]["deep_town"]["town_blueprint"] = zdir["starting_towns"][0]["town_blueprint"]
    atlas["town_blueprints"] = [t["town_blueprint"] for t in all_towns if isinstance(t.get("town_blueprint"), dict)]

    # 2. Diversify all 24 Field Hunting Areas & 8 Harbors/ClanHalls/Fortresses
    fields_list = zdir["fields_and_hunting_areas"]
    for idx, f_entry in enumerate(fields_list):
        ftb = f_entry["field_tactical_blueprint"]
        tmpl = FIELD_TACTICAL_TEMPLATES[idx % len(FIELD_TACTICAL_TEMPLATES)]
        # Add per-zone deterministic jitter (+/- 3..5 pct) so no two zones share identical coordinates
        jx = ((idx * 5) % 7) - 3
        jy = ((idx * 3) % 7) - 3
        ftb["terrain_perimeter_pct"] = [
            [max(4, min(96, px + jx)), max(6, min(94, py + jy))]
            for px, py in tmpl["perim"]
        ]
        trails = ftb.get("patrol_trails") or []
        for t_i, tr in enumerate(trails):
            if t_i < len(tmpl["trails"]):
                tr["path_pct"] = [
                    [max(6, min(94, px + jx)), max(8, min(92, py + jy))]
                    for px, py in tmpl["trails"][t_i]
                ]
        marks = ftb.get("camp_and_shrine_marks") or []
        for m_i, mk in enumerate(marks):
            if m_i < len(tmpl["marks"]):
                mx, my = tmpl["marks"][m_i]
                mk["x_pct"] = max(10, min(90, mx + jx))
                mk["y_pct"] = max(12, min(88, my + jy))
        spawns = ftb.get("spawn_territories") or []
        for s_i, st in enumerate(spawns):
            if s_i < len(tmpl["spawns"]):
                sx, sy, sr = tmpl["spawns"][s_i]
                st["x_pct"] = max(14, min(88, sx + jx))
                st["y_pct"] = max(16, min(84, sy + jy))
                st["radius_pct"] = sr + (idx % 3)
        warps = ftb.get("dungeon_entrance_warps") or []
        if warps:
            wx, wy = tmpl["warp"]
            warps[0]["x_pct"] = max(12, min(90, wx + jx))
            warps[0]["y_pct"] = max(14, min(86, wy + jy))

    if fields_list:
        atlas["t_deep_validation_slice"]["deep_field_zone"]["field_tactical_blueprint"] = fields_list[0]["field_tactical_blueprint"]
    atlas["field_tactical_blueprints"] = [f["field_tactical_blueprint"] for f in fields_list]

    forts_list = zdir["harbors_clanhalls_and_forts"]
    for idx, h_entry in enumerate(forts_list):
        fbp = h_entry["fortress_blueprint"]
        tmpl = FIELD_TACTICAL_TEMPLATES[(idx + 2) % len(FIELD_TACTICAL_TEMPLATES)]
        jx = ((idx * 4) % 5) - 2
        jy = ((idx * 3) % 5) - 2
        fbp["bastion_wall_pct"] = [
            [max(8, min(92, px + jx)), max(10, min(90, py + jy))]
            for px, py in tmpl["perim"]
        ]
        marks = fbp.get("camp_and_shrine_marks") or []
        for m_i, mk in enumerate(marks):
            if m_i < len(tmpl["marks"]):
                mx, my = tmpl["marks"][m_i]
                mk["x_pct"] = max(12, min(88, mx + jx))
                mk["y_pct"] = max(14, min(86, my + jy))
        spawns = fbp.get("spawn_territories") or []
        for s_i, st in enumerate(spawns):
            if s_i < len(tmpl["spawns"]):
                sx, sy, sr = tmpl["spawns"][s_i]
                st["x_pct"] = max(16, min(86, sx + jx))
                st["y_pct"] = max(18, min(82, sy + jy))
                st["radius_pct"] = max(9, sr - 1 + (idx % 3))
        warps = fbp.get("dungeon_entrance_warps") or []
        if warps:
            wx, wy = tmpl["warp"]
            warps[0]["x_pct"] = max(14, min(88, wx + jx))
            warps[0]["y_pct"] = max(16, min(84, wy + jy))

    atlas["fortress_blueprints"] = [h["fortress_blueprint"] for h in forts_list]

    # 3. Diversify all 16 Multi-Floor Dungeons (65 floors)
    for d_idx, mf in enumerate(atlas.get("multi_floor_dungeons") or []):
        did = str(mf.get("dungeon_id", ""))
        if "kiln-cellar" in did:
            # Keep zone-dungeon-kiln-cellar's already-custom 3 floors intact
            continue
        if "star-heart-nave" in did or "chronometer-foundry" in did:
            t_key = "toi_grand_spire"
        elif "pendulum-shaft" in did:
            t_key = "cruma_concentric_spire"
        elif "catacomb" in did:
            t_key = "seven_signs_necropolis"
        elif "sunken-potter" in did or "sap-heart" in did:
            t_key = "forgotten_dual_wings"
        else:
            t_key = "ant_nest_cavern"

        fl_templates = DUNGEON_FLOOR_TEMPLATES[t_key]
        jx = ((d_idx * 3) % 5) - 2
        jy = ((d_idx * 2) % 5) - 2
        floors = mf.get("floors") or []
        for f_i, fl in enumerate(floors):
            if f_i >= len(fl_templates):
                break
            ft = fl_templates[f_i]
            fid = fl.get("floor_id", "B1")
            lv_range = fl.get("level_range", "Lv.10–20")
            spawns = fl.get("spawns") or []
            mob_names = [s.get("name", "Sentinel") for s in spawns]
            new_rooms = []
            for r_i, (r_title, rx, ry, rw, rh, corr_w) in enumerate(ft["rooms"], start=1):
                assigned_mobs = [mob_names[idx] for idx in range(len(mob_names)) if (idx % len(ft["rooms"])) == (r_i - 1)]
                if not assigned_mobs and mob_names:
                    assigned_mobs = [mob_names[min(r_i - 1, len(mob_names) - 1)]]
                new_rooms.append(
                    {
                        "room_id": f"{did}-{fid.lower()}-r{r_i}",
                        "name": r_title,
                        "level_range": lv_range,
                        "corridor_width_meters": corr_w,
                        "x_pct": max(8, min(78, rx + jx)),
                        "y_pct": max(10, min(68, ry + jy)),
                        "w_pct": rw,
                        "h_pct": rh,
                        "key_mobs": assigned_mobs,
                    }
                )
            fl["rooms"] = new_rooms
            warps = fl.get("warp_points") or []
            for w_i, wp in enumerate(warps):
                if w_i < len(ft["warps"]):
                    wx, wy = ft["warps"][w_i]
                    wp["x_pct"] = max(10, min(88, wx + jx))
                    wp["y_pct"] = max(14, min(84, wy + jy))

    expand_tall_dungeons(atlas)  # keep Star-Heart 14F / Foundry 7F / Orrery B1..B5 after template pass

    ATLAS_PATH.write_text(json.dumps(atlas, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 4. Also update `content/studio/map_feature_layers.json` with territory size scales (0.68x to 1.72x) & aspect ratios
    layers_doc = json.loads(LAYERS_PATH.read_text(encoding="utf-8"))
    sub_structs = layers_doc.get("mob_farm_sub_structures") or {}
    # Assign Lineage 2 faithful territory size scales (0.68x small outpost/grotto to 1.72x sprawling marsh/valley/crater)
    ZONE_SCALE_TABLE: dict[str, tuple[float, float, float, str]] = {
        "zone-field-clover-south-gate": (0.76, 1.05, 0.92, "compact_outpost_meadow"),
        "zone-field-kiln-east-orchard": (0.94, 1.18, 0.88, "terraced_orchard_valley"),
        "zone-field-celadon-causeway": (0.86, 1.32, 0.78, "elongated_forest_causeway"),
        "zone-field-firebrick-duct": (0.92, 0.88, 1.24, "northern_plateau_gorge"),
        "zone-field-resin-arch-tunnel": (0.82, 1.25, 0.82, "mining_trench_corridor"),
        "zone-field-cobalt-sandbar-ford": (1.08, 1.35, 0.84, "braided_river_delta"),
        "zone-field-chime-pipe-colonnade": (1.16, 1.22, 1.05, "dark_forest_swampland"),
        "zone-field-apricot-aqueduct-terrace": (1.02, 1.28, 0.86, "dion_hills_aqueduct"),
        "zone-field-cinnamon-bark-viaduct": (0.88, 1.30, 0.80, "isle_of_souls_viaduct"),
        "zone-field-ginger-aqueduct-bridge": (1.12, 1.15, 1.08, "beast_farm_pasture_basin"),
        "zone-field-cinder-apron": (1.42, 1.34, 1.12, "cruma_marshlands_expanse"),
        "zone-field-brass-spur-ridge": (1.28, 1.44, 0.82, "death_pass_canyon_corridor"),
        "zone-field-caldera-rim": (1.58, 1.18, 1.18, "blazing_swamp_caldera"),
        "zone-field-leyden-causeway": (1.68, 1.48, 0.94, "dragon_valley_expanse"),
        "zone-field-tether-causeway": (1.36, 1.26, 1.06, "valley_of_saints_sanctum"),
        "zone-field-aurora-tether": (1.72, 1.32, 1.22, "forge_of_the_gods_crater"),
        "zone-field-whispering-mire": (1.48, 1.36, 1.14, "swamp_of_screams_bayou"),
        "zone-field-slag-chasm": (1.18, 1.42, 0.78, "tanor_canyon_badlands"),
        "zone-field-astrolabe-rift": (1.34, 1.16, 1.16, "sea_of_spores_ring"),
        "zone-field-siphon-sluice": (1.06, 0.92, 1.28, "alligator_island_lagoon"),
        "zone-field-metronome-bridge": (0.72, 1.46, 0.68, "narrow_chokepoint_bridge"),
        "zone-field-spiral-wormway-ramp": (1.22, 1.08, 1.24, "mithril_quarry_spiral"),
        "zone-field-orrery-bridge": (1.52, 1.38, 1.04, "imperial_tomb_necropolis"),
        "zone-field-kelp-spiral-reef": (1.44, 1.28, 1.12, "field_of_whispers_shoals"),
        "zone-harbor-lantern-ferry-pier": (0.68, 1.32, 0.76, "talking_island_harbor_pier"),
        "zone-harbor-glaze-barge-airship-dock": (0.84, 1.28, 0.84, "gludin_airship_harbor"),
        "zone-clanhall-kilnwatch-accord": (0.96, 1.12, 1.06, "devastated_castle_enclave"),
        "zone-clanhall-inductor-conclave": (1.04, 1.16, 1.08, "rainbow_springs_conclave"),
        "zone-fortress-shanty-kiln": (0.88, 1.18, 0.92, "southern_border_fortress"),
        "zone-fortress-floran-saffron": (0.92, 1.22, 0.90, "floran_agricultural_fort"),
        "zone-fortress-dragonspine-cog": (1.14, 1.36, 0.86, "antharas_dragonspine_fort"),
        "zone-fortress-cloud-halo": (1.26, 1.20, 1.12, "monastery_of_silence_citadel"),
    }
    for zid, spec_obj in sub_structs.items():
        if zid in ZONE_SCALE_TABLE:
            sc, sx, sy, shape_tag = ZONE_SCALE_TABLE[zid]
            spec_obj["territory_scale"] = sc
            spec_obj["aspect_x"] = sx
            spec_obj["aspect_y"] = sy
            spec_obj["territory_shape_tag"] = shape_tag

    LAYERS_PATH.write_text(json.dumps(layers_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Print verification summary
    town_areas = [polygon_area(t["town_blueprint"]["wall_polygon_pct"]) for t in all_towns]
    field_areas = [polygon_area(f["field_tactical_blueprint"]["terrain_perimeter_pct"]) for f in fields_list]
    scales = [v[0] for v in ZONE_SCALE_TABLE.values()]
    print(f"Updated 15 Towns: wall_polygon_pct area range = {min(town_areas):.1f} .. {max(town_areas):.1f} ({max(town_areas)/min(town_areas):.2f}x)")
    print(f"Updated 24 Fields: terrain_perimeter_pct area range = {min(field_areas):.1f} .. {max(field_areas):.1f} ({max(field_areas)/min(field_areas):.2f}x)")
    print(f"Updated 32 Zone Territory Scales: {min(scales):.2f}x .. {max(scales):.2f}x ({max(scales)/min(scales):.2f}x)")


if __name__ == "__main__":
    diversify_atlas()
