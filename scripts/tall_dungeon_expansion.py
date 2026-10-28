"""Idempotent expansion of the three deep multi-floor dungeons in the T-shaped atlas.

- Star-Heart Tower of Insolence : 14 floors (1F..14F), +40m per floor
- Sunken Chronometer Foundry    :  7 floors (1F..7F),  +35m per floor
- Forbidden-Path Orrery Catacomb:  5 floors (B1..B5),  -45m .. -250m

`expand_tall_dungeons(atlas)` replaces those dungeons' `floors` in place. Both
`run_atlas_iteration_loop.py` and `diversify_l2_towns_and_zones.py` call it, so a
re-run of either keeps the expanded floors instead of reverting to 3.
"""

from __future__ import annotations

from typing import Any

TALL_DUNGEONS: dict[str, dict[str, Any]] = {
    "zone-dungeon-star-heart-nave": {
        "tower": True,
        "id_base": 60000,
        "span": (50, 99),
        "elevations": [40 * i for i in range(1, 15)],
        "level_band": [50, 99],
        "floors": [
            ("1F", "Lower Astral Nave"),
            ("2F", "Choir of Pendulums"),
            ("3F", "Hall of Star-Forged Knights"),
            ("4F", "Seal-Breaker Gallery"),
            ("5F", "Gravity Inversion Atrium"),
            ("6F", "Mirror-Glass Cloister"),
            ("7F", "Mid-Spire Sovereign Crucible"),
            ("8F", "Seraphim Conduit Deck"),
            ("9F", "Eclipse Reliquary"),
            ("10F", "Archon Command Ring"),
            ("11F", "Prism Engine Core"),
            ("12F", "Celestial Valkyrie Bastion"),
            ("13F", "Pre-Apex Seal Chamber"),
            ("14F", "Rooftop Apex · Baium & Vesper's Throne"),
        ],
    },
    "zone-dungeon-chronometer-foundry": {
        "tower": True,
        "id_base": 61000,
        "span": (25, 38),
        "elevations": [35 * i for i in range(1, 8)],
        "level_band": [25, 38],
        "floors": [
            ("1F", "Cold Furnace Vestibule"),
            ("2F", "Escapement Gear Hall"),
            ("3F", "Mainspring Casting Pit"),
            ("4F", "Tick-Lock Assembly Line"),
            ("5F", "Quenching Bell Gallery"),
            ("6F", "Chronarch Regulator Loft"),
            ("7F", "Hourglass Crown Foundry Heart"),
        ],
    },
    "zone-catacomb-forbidden-path-orrery": {
        "tower": False,
        "id_base": 62000,
        "span": (70, 99),
        "elevations": [-45, -95, -145, -195, -250],
        "level_band": [70, 99],
        "floors": [
            ("B1", "Orrery Ossuary Gate"),
            ("B2", "Drowned Astrolabe Vaults"),
            ("B3", "Architect's Bone Gallery"),
            ("B4", "Void-Lens Reliquary"),
            ("B5", "Primordial God-Seal Abyssal Sanctum"),
        ],
    },
}


def _fmt(x: int, y: int) -> str:
    return f"{x}:{y}"


def _parse(loc: str) -> tuple[int, int]:
    a, _, b = str(loc).partition(":")
    return int(a), int(b)


def _level_range(i: int, n: int, span: tuple[int, int]) -> tuple[int, int]:
    """Progressive window i/n across `span`; the last floor always ends at span[1]."""
    lo_s, hi_s = span
    width = max(3, (hi_s - lo_s) // n)
    lo = lo_s + round((i - 1) * (hi_s - lo_s - width) / max(1, n - 1))
    return lo, (hi_s if i == n else min(hi_s, lo + width))


def _warp(zid: str, fid: str, tgt: str, wtype: str, label: str, x: int, y: int, loc: str) -> dict[str, Any]:
    suffix = "exit" if tgt == "OVERLAND" else f"to-{tgt.lower()}"
    if wtype == "boss_sanctum_warp":
        suffix = f"boss-{tgt.lower()}"
    return {
        "warp_id": f"wp-{zid}-{fid.lower()}-{suffix}",
        "warp_type": wtype,
        "label": label,
        "x_pct": x,
        "y_pct": y,
        "target_floor_id": tgt,
        "target_loc": loc,
    }


def _build_dungeon_floors(dng: dict[str, Any], spec: dict[str, Any]) -> list[dict[str, Any]]:
    zid = str(dng["dungeon_id"])
    short = str(dng["name"]).split("(")[0].strip()
    entrance = str(dng.get("entrance_loc", "48550:248400"))
    bx, by = _parse(entrance)
    names = spec["floors"]
    n = len(names)
    last = names[-1][0]
    # `ahead` leads to the next floor in the list, `back` to the previous one
    ahead, back = ("floor_up", "floor_down") if spec["tower"] else ("floor_down", "floor_up")
    floors: list[dict[str, Any]] = []
    for i, (fid, lore) in enumerate(names, start=1):
        lo, hi = _level_range(i, n, spec["span"])
        lv = f"Lv.{lo}–{hi}"

        def loc(k: int, i: int = i) -> str:
            return _fmt(bx + i * 600 + k * 120, by - i * 600 - k * 80)

        warps: list[dict[str, Any]] = []
        if i == 1:
            warps.append(_warp(zid, fid, "OVERLAND", "overland_exit", f"⬅ Return to Overland ({short})", 16, 50, entrance))
        else:
            prev_id, prev_lore = names[i - 2]
            warps.append(_warp(zid, fid, prev_id, back, f"⬆ Return to {prev_id} {prev_lore}", 18, 50, _fmt(bx + (i - 1) * 600, by - (i - 1) * 600)))
        if i < n:
            next_id, next_lore = names[i]
            warps.append(_warp(zid, fid, next_id, ahead, f"⬇ Warp to {next_id} {next_lore}", 82, 62, _fmt(bx + (i + 1) * 600, by - (i + 1) * 600)))
            if i >= 2 and next_id != last:
                warps.append(_warp(zid, fid, last, "boss_sanctum_warp", f"🔥 Express Boss Sanctum Warp to {last}", 80, 40, _fmt(bx + n * 600, by - n * 600)))
        else:
            warps.append(_warp(zid, fid, last, "boss_sanctum_warp", f"🔥 Throne Dais Seal-Lock Beacon ({last})", 80, 40, loc(2)))
            warps.append(_warp(zid, fid, "OVERLAND", "overland_exit", "🌀 Seal Escape Obelisk to Overland Entrance", 84, 66, entrance))

        base = spec["id_base"] + i * 10
        spawns = [
            {
                "npc_id": base + 1, "name": f"{short} {fid} Sentinel", "entity_type": "Monster", "level": lo,
                "aggro": "Yes", "race_key": "undead" if "catacomb" in zid else "robotic", "race_badge": "Normal Mob",
                "hp_multiplier": "2x", "protections": ["Seal Ward Lv.1"], "weaknesses": ["Holy/Blunt Weak"],
                "spawn_count": 20, "respawn_sec": 45, "loc_coord": loc(0),
                "refinement_drops": ["High-Grade Iron Ore", "Varnish", "Refinement Flux Dust"],
                "spoil_materials": ["High-Grade Iron Ore (42% Spoil)", "Refinement Flux Dust (28% Spoil)"],
            },
            {
                "npc_id": base + 2, "name": f"[Mini-Boss] {fid} {lore} Overseer", "entity_type": "Mini-Boss",
                "level": min(hi, lo + 1), "aggro": "Yes", "race_key": "robotic", "race_badge": f"Mini-Boss · {fid} Keeper",
                "hp_multiplier": "3x", "protections": ["Heavy Plate"], "weaknesses": ["Elemental Weak"],
                "spawn_count": 2, "respawn_sec": 240, "loc_coord": loc(1),
                "refinement_drops": ["Weapon Enchant Scroll Fragment", "Tempered Alloy Plate", "Seal-Stone Cluster"],
                "spoil_materials": ["Tempered Alloy Plate (24% Spoil)", "Seal-Stone Cluster (18% Spoil)"],
            },
            {
                "npc_id": base + 3, "name": f"[Raid Boss] {fid} Seal Warden", "entity_type": "Raid", "level": hi,
                "aggro": "Yes", "race_key": "robotic", "race_badge": "Raid · Rank 3 Warden", "hp_multiplier": "6x",
                "protections": ["Raid Seal Armor"], "weaknesses": ["Blunt/Holy Weak"], "spawn_count": 1,
                "respawn_sec": 3600, "loc_coord": loc(2),
                "refinement_drops": ["Blessed Enchant Weapon Scroll", "Warden Alloy Core", "Soul Crystal Stage 5"],
                "spoil_materials": ["Warden Alloy Core (15% Raid Spoil)", "Blessed Enchant Scroll (12% Drop)"],
            },
            {
                "npc_id": base + 4,
                "name": f"[MVP] {lore} Apex Sovereign" if i == n else f"[MVP] {short} {fid} Apostle Sovereign",
                "entity_type": "MVP", "level": hi, "aggro": "Yes",
                "race_key": "dark_lunar" if "catacomb" in zid else "robotic", "race_badge": "MVP · Rank 2 God-Subordinate",
                "hp_multiplier": "10x", "protections": ["God-Seal Aegis"], "weaknesses": ["Sacred Counter"],
                "spawn_count": 1, "respawn_sec": 7200, "loc_coord": loc(3),
                "refinement_drops": ["Divine Apostle Anvil Core", "Ancient Refinement Catalyst", "Architect Seal Crest"],
                "spoil_materials": ["Divine Apostle Anvil Core (8.5% MVP Drop)", "Architect Seal Crest (15% Spoil)"],
            },
        ]
        if i == n:
            rooms_def = [
                (f"{fid} {lore} · Grand Antechamber", 14, 29, 26, 38, 11.5, [0, 1]),
                (f"{fid} {lore} · Grand Sanctum Throne", 46, 15, 44, 64, 12.0, [2, 3]),
            ]
        else:
            rooms_def = [
                (f"{fid} {lore} · Entry Gallery", 12, 30, 24, 32, 8.5, [0]),
                (f"{fid} {lore} · Warden Hall", 40, 18, 24, 36, 9.5, [1, 2]),
                (f"{fid} {lore} · Sovereign Rotunda", 62, 40, 28, 40, 10.5, [3]),
            ]
        rooms = [
            {
                "room_id": f"{zid}-{fid.lower()}-r{r}", "name": rn, "level_range": lv, "corridor_width_meters": cw,
                "x_pct": rx, "y_pct": ry, "w_pct": rw, "h_pct": rh, "key_mobs": [spawns[k]["name"] for k in ks],
            }
            for r, (rn, rx, ry, rw, rh, cw, ks) in enumerate(rooms_def, start=1)
        ]
        hl = spawns[3] if (i == n or i % 3 == 0) else (spawns[2] if i % 3 == 2 else spawns[1])
        tier = {"MVP": "MVP", "Raid": "Raid Boss", "Mini-Boss": "Mini-Boss"}[hl["entity_type"]]
        floors.append(
            {
                "floor_id": fid, "floor_index": i, "floor_elevation_meters": spec["elevations"][i - 1],
                "boss_tier_highlight": f"{fid} {lore} · {hl['name'].split('] ', 1)[-1]} ({tier})",
                "name": f"{fid} — {lore} ({lv})", "level_range": lv,
                "rooms": rooms, "warp_points": warps, "spawns": spawns,
            }
        )
    return floors


def expand_tall_dungeons(atlas: dict[str, Any]) -> list[str]:
    """Rebuild floors of the tall dungeons when they differ from the spec; returns action strings."""
    actions: list[str] = []
    zdir = atlas.get("t_breadth_zone_directory") or {}
    zone_by_id = {z.get("zone_id"): z for v in zdir.values() if isinstance(v, list) for z in v if isinstance(z, dict)}
    for dng in atlas.get("multi_floor_dungeons") or []:
        spec = TALL_DUNGEONS.get(str(dng.get("dungeon_id")))
        if not spec:
            continue
        if [f.get("floor_id") for f in dng.get("floors") or []] != [fid for fid, _ in spec["floors"]]:
            dng["floors"] = _build_dungeon_floors(dng, spec)
            actions.append(f"expanded_tall_dungeon:{dng['dungeon_id']}:{len(dng['floors'])}")
        z = zone_by_id.get(dng["dungeon_id"])
        if z and z.get("level_band") != spec["level_band"]:
            lo, hi = spec["level_band"]
            z["level_band"] = [lo, hi]
            head = str(z.get("level_header", ""))
            if ":" in head:
                z["level_header"] = f"{head.split(':')[0]}: lvl.{(lo + hi) // 2} [{lo}-{hi}]"
    return actions
