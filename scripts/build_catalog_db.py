#!/usr/bin/env python3
"""
Builds build/catalog.sqlite and build/catalog_summary.json from:
- contracts/content/*.json (jobs, skills, items, mobs, cards, quests, quest_board, handbook, castles, elements)
- content/maps/*.json
- content/world/** (premises, fabric/world.json, civil/pinned-roster.json, civil/pinned, civil/bound)
- content/spine/nodes/*.json
- content/story/*.json (acts, regions, factions, characters, arcs, quests, events, dialogue, lore)
- content/zones/*.json, content/dungeons/*.json, content/bestiary/bestiary.json

Provides a single observable SQLite + JSONB-style catalog database for:
1. Cross-table balance queries (Zone XP/hr, Mob drop tables, Job progression, Item power budget)
2. World-First Spine traceability (Continent -> Region/Zone -> Town/Dungeon -> Story/NPC/Quest -> 3D Map & Assets)
3. Asset Studio entry synchronization (v_asset_studio_entries)
4. CI referential integrity verification
"""

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "contracts" / "content"
MAPS_DIR = ROOT / "content" / "maps"
WORLD_DIR = ROOT / "content" / "world"
SPINE_DIR = ROOT / "content" / "spine"
STORY_DIR = ROOT / "content" / "story"
ZONES_DIR = ROOT / "content" / "zones"
DUNGEONS_DIR = ROOT / "content" / "dungeons"
STUDIO_DIR = ROOT / "content" / "studio"
COMPILED_DUNGEONS_PATH = DUNGEONS_DIR / "_compiled_catalog.json"
BESTIARY_PATH = ROOT / "content" / "bestiary" / "bestiary.json"
BUILD_DIR = ROOT / "build"
DB_PATH = BUILD_DIR / "catalog.sqlite"
SUMMARY_PATH = BUILD_DIR / "catalog_summary.json"


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    jobs = load_json(CONTENT_DIR / "jobs.json")
    skills = load_json(CONTENT_DIR / "skills.json")
    items = load_json(CONTENT_DIR / "items.json")
    mobs = load_json(CONTENT_DIR / "mobs.json")
    cards = load_json(CONTENT_DIR / "cards.json")
    quest_board = load_json(CONTENT_DIR / "quest_board.json")
    handbook = load_json(CONTENT_DIR / "handbook.json")
    castles = load_json(CONTENT_DIR / "castles.json")
    elements = load_json(CONTENT_DIR / "elements.json")

    maps = []
    if MAPS_DIR.exists():
        for mp in sorted(MAPS_DIR.glob("*.json")):
            data = load_json(mp)
            wsb = data.get("worldSpineBinding") or {}
            concept = data.get("concept") or {}
            rec_lvl = concept.get("recommendedLevelRange") or [1, 15]
            maps.append(
                {
                    "id": data.get("mapId") or mp.stem,
                    "name": data.get("name") or data.get("displayName") or mp.stem,
                    "widthM": data.get("width", data.get("widthMeters", 200)),
                    "depthM": data.get("height", data.get("depthMeters", 200)),
                    "terraceCount": len(data.get("heightTerraces", [])),
                    "structureCount": len(data.get("structures", [])),
                    "propCount": len(data.get("props", [])),
                    "spawnAreaCount": len(data.get("spawnAreas", [])),
                    "continentId": wsb.get("continentId", "c02"),
                    "regionId": wsb.get("regionId", ""),
                    "zoneId": wsb.get("zoneId", ""),
                    "spineNodeId": wsb.get("spineNodeId", ""),
                    "townId": wsb.get("townId", ""),
                    "storyRegionId": wsb.get("storyRegionId", ""),
                    "biome": concept.get("biome", ""),
                    "levelMin": rec_lvl[0] if len(rec_lvl) > 0 else 1,
                    "levelMax": rec_lvl[1] if len(rec_lvl) > 1 else 15,
                    "rawJson": json.dumps(data),
                }
            )

    # Load World Continents (premises + fabric/world.json census)
    world_fabric = load_json(WORLD_DIR / "fabric" / "world.json") if (WORLD_DIR / "fabric" / "world.json").exists() else {}
    fabric_by_cid = {c["id"]: c for c in world_fabric.get("continents", [])}
    world_continents = []
    premises_dir = WORLD_DIR / "premises"
    if premises_dir.exists():
        for pf in sorted(premises_dir.glob("continent-*.json")):
            p = load_json(pf)
            cid = p["id"]
            fab = fabric_by_cid.get(cid, {})
            lvl = p.get("levelBand") or [1, 1]
            world_continents.append(
                {
                    "id": cid,
                    "title": p.get("title", cid),
                    "continentClass": p.get("class", ""),
                    "coastClass": p.get("coastClass", ""),
                    "register": p.get("register", ""),
                    "levelMin": lvl[0] if len(lvl) > 0 else 1,
                    "levelMax": lvl[1] if len(lvl) > 1 else lvl[0],
                    "grossLandKm2": fab.get("grossLandKm2", 0.0),
                    "landCells": fab.get("landCells", 0),
                    "structuralIdea": p.get("structuralIdea", ""),
                    "paletteJson": json.dumps(p.get("palette", [])),
                    "landformKitJson": json.dumps(p.get("landformKit", [])),
                    "footprintJson": json.dumps(p.get("footprint", {})),
                }
            )

    # Load Pinned + Bound Civil Places
    world_places = []
    roster_path = WORLD_DIR / "civil" / "pinned-roster.json"
    roster_by_id = {}
    if roster_path.exists():
        roster_data = load_json(roster_path)
        for r in roster_data.get("rows", []):
            roster_by_id[r["id"]] = r

    pinned_dir = WORLD_DIR / "civil" / "pinned"
    if pinned_dir.exists():
        for pf in sorted(pinned_dir.glob("*.json")):
            d = load_json(pf)
            pid = d["id"]
            rost = roster_by_id.get(pid, {})
            pin = d.get("pin") or {}
            at = pin.get("at") or rost.get("at") or [None, None]
            req = d.get("requires") or rost.get("requires") or {}
            world_places.append(
                {
                    "id": pid,
                    "title": d.get("title") or pid,
                    "kind": d.get("kind") or rost.get("kind") or "place",
                    "tier": "pinned",
                    "continentId": req.get("continent") or rost.get("continent") or "",
                    "rank": d.get("rank") or rost.get("rank") or "",
                    "landform": req.get("landform") or "",
                    "atXKm": at[0] if len(at) > 0 else None,
                    "atYKm": at[1] if len(at) > 1 else None,
                    "handleRef": None,
                    "whyOrNote": pin.get("why") or rost.get("why") or "",
                    "planPath": rost.get("plan"),
                    "rawJson": json.dumps(d),
                }
            )

    bound_dir = WORLD_DIR / "civil" / "bound"
    if bound_dir.exists():
        for bf in sorted(bound_dir.glob("*.json")):
            d = load_json(bf)
            bind = d.get("bind") or {}
            handle = bind.get("handle") or ""
            cid = handle.split("/")[0] if "/" in handle else ""
            expect = bind.get("expect") or {}
            lore = d.get("lore") or {}
            world_places.append(
                {
                    "id": d["id"],
                    "title": d.get("title") or d["id"],
                    "kind": d.get("kind") or "place",
                    "tier": "bound",
                    "continentId": cid,
                    "rank": d.get("rank") or "",
                    "landform": expect.get("type") or "",
                    "atXKm": None,
                    "atYKm": None,
                    "handleRef": handle,
                    "whyOrNote": lore.get("note") or "",
                    "planPath": None,
                    "rawJson": json.dumps(d),
                }
            )

    # Load Surveyed Zones (content/zones/*.json)
    world_zones = []
    if ZONES_DIR.exists():
        for zf in sorted(ZONES_DIR.glob("*.json")):
            d = load_json(zf)
            zid = d.get("zone") or zf.stem
            world_zones.append(
                {
                    "id": zid,
                    "regionRef": d.get("region") or "",
                    "survey": d.get("survey") or "surveyed",
                    "reasonToGo": d.get("reasonToGo") or "",
                    "hazardCount": len(d.get("hazards") or []),
                    "resourceCount": len(d.get("resources") or []),
                    "landmarkCount": len(d.get("landmarks") or []),
                    "rawJson": json.dumps(d),
                }
            )

    # Load Dungeons (content/dungeons/_compiled_catalog.json or content/dungeons/*.json)
    world_dungeons = []
    if COMPILED_DUNGEONS_PATH.exists():
        for cd in load_json(COMPILED_DUNGEONS_PATH):
            cid = cd.get("regionId", "").split("/")[0] if "/" in cd.get("regionId", "") else "c02"
            world_dungeons.append(
                {
                    "id": cd.get("id"),
                    "title": cd.get("title", cd.get("id")),
                    "continentId": cid,
                    "handleRef": cd.get("regionId", ""),
                    "entranceType": cd.get("entranceType", ""),
                    "floors": cd.get("floors", 1),
                    "levelMin": cd.get("levelMin", 1),
                    "levelMax": cd.get("levelMax", 1),
                    "hazardsJson": json.dumps(cd.get("hazards", [])),
                    "loreNote": cd.get("lore", ""),
                    "mapId": cd.get("mapId", ""),
                    "regionId": cd.get("regionId", ""),
                    "portalX": cd.get("portalX", 0.0),
                    "portalY": cd.get("portalY", 0.0),
                    "portalRadius": cd.get("portalRadius", 25.0),
                    "mvpBossId": cd.get("mvpBossId", ""),
                    "mvpBossName": cd.get("mvpBossName", ""),
                    "mvpBossHp": cd.get("mvpBossHp", 50000),
                    "bossEnrageSecs": cd.get("bossEnrageSecs", 300),
                    "mobsPerFloor": cd.get("mobsPerFloor", 10),
                    "rawJson": json.dumps(cd),
                }
            )
    elif DUNGEONS_DIR.exists():
        for df in sorted(DUNGEONS_DIR.glob("*.json")):
            if df.name.startswith("_"):
                continue
            d = load_json(df)
            bind = d.get("bind") or {}
            handle = bind.get("handle") or ""
            cid = handle.split("/")[0] if "/" in handle else ""
            lvl = d.get("levelBand") or [1, 1]
            lore = d.get("lore") or {}
            world_dungeons.append(
                {
                    "id": d.get("id") or df.stem,
                    "title": d.get("title") or df.stem,
                    "continentId": cid,
                    "handleRef": handle,
                    "entranceType": d.get("entranceType") or "",
                    "floors": d.get("floors") or 1,
                    "levelMin": lvl[0] if len(lvl) > 0 else 1,
                    "levelMax": lvl[1] if len(lvl) > 1 else lvl[0],
                    "hazardsJson": json.dumps(d.get("hazards") or []),
                    "loreNote": lore.get("note") or "",
                    "mapId": "",
                    "regionId": handle,
                    "portalX": 0.0,
                    "portalY": 0.0,
                    "portalRadius": 25.0,
                    "mvpBossId": f"mvp-{d.get('id') or df.stem}",
                    "mvpBossName": f"Awakened {d.get('title') or df.stem}",
                    "mvpBossHp": 50000,
                    "bossEnrageSecs": 300,
                    "mobsPerFloor": 10,
                    "rawJson": json.dumps(d),
                }
            )

    # Load 6 Canonical Races (content/studio/world_history_and_concept.json)
    races_catalog = []
    whc_path = STUDIO_DIR / "world_history_and_concept.json"
    if whc_path.exists():
        whc = load_json(whc_path)
        race_tax = whc.get("race_taxonomy", {}).get("playable_and_mob_races", [])
        race_stats = {
            "human_demi_human": {"str": 6, "agi": 6, "int": 6, "vit": 6, "dex": 6, "luk": 6, "hitbox": 0.45},
            "dwarf": {"str": 7, "agi": 4, "int": 4, "vit": 9, "dex": 5, "luk": 5, "hitbox": 0.40},
            "ogre_orc": {"str": 10, "agi": 4, "int": 3, "vit": 9, "dex": 4, "luk": 4, "hitbox": 0.65},
            "furral": {"str": 5, "agi": 9, "int": 5, "vit": 5, "dex": 7, "luk": 6, "hitbox": 0.35},
            "lunar": {"str": 4, "agi": 5, "int": 9, "vit": 4, "dex": 7, "luk": 6, "hitbox": 0.45},
            "dark_lunar": {"str": 5, "agi": 8, "int": 7, "vit": 4, "dex": 6, "luk": 5, "hitbox": 0.45},
        }
        for r in race_tax:
            rkey = r.get("race_key", "")
            stats = race_stats.get(rkey, {"str": 6, "agi": 6, "int": 6, "vit": 6, "dex": 6, "luk": 6, "hitbox": 0.45})
            races_catalog.append(
                {
                    "id": r["id"],
                    "raceKey": rkey,
                    "name": r.get("name", rkey),
                    "icon": r.get("icon", "⚔️"),
                    "starterTownId": r.get("home_town_id", ""),
                    "starterTownName": r.get("home_town_name", ""),
                    "continentId": r.get("continent_id", ""),
                    "districtId": r.get("district_id", ""),
                    "str": stats["str"],
                    "agi": stats["agi"],
                    "int": stats["int"],
                    "vit": stats["vit"],
                    "dex": stats["dex"],
                    "luk": stats["luk"],
                    "hitboxRadius": stats["hitbox"],
                    "combatTrait": r.get("combat_trait", ""),
                    "nichedStory": r.get("niched_story", ""),
                    "rawJson": json.dumps(r),
                }
            )

    # Load Boss Encounters from world dungeons
    boss_encounters = []
    for wd in world_dungeons:
        if wd.get("mvpBossId"):
            boss_encounters.append(
                {
                    "bossId": wd["mvpBossId"],
                    "name": wd.get("mvpBossName") or f"Awakened {wd['title']}",
                    "maxHp": wd.get("mvpBossHp", 100000),
                    "enrageTimerSecs": wd.get("bossEnrageSecs", 300),
                    "phase2ThresholdPct": 50.0,
                    "atkMultiplier": 1.35,
                    "aspdMultiplier": 1.25,
                    "empoweredSkill": "Empowered Cleave & Hellfire",
                    "dungeonId": wd["id"],
                    "scoringWeightsJson": json.dumps(
                        {
                            "damage": 0.50,
                            "healing": 0.20,
                            "tanking": 0.15,
                            "firstHit": 0.075,
                            "lastHit": 0.075,
                        }
                    ),
                }
            )

    # Load +1 to +20 High-Stakes Enchanting Rules
    enchanting_rules = []
    glow_names = ["None", "SoftWhite", "YellowGlow", "CrimsonAura", "VioletLightning", "CelestialPrism"]
    for tier in range(1, 21):
        safe = tier <= 4
        success = 100.0 if safe else (70.0 if tier <= 6 else (50.0 if tier <= 9 else (40.0 if tier <= 12 else (30.0 if tier <= 15 else (20.0 if tier <= 18 else 10.0)))))
        crystallize = 0.0 if tier <= 9 else (100.0 - success)
        degrade = (100.0 - success) if (tier > 4 and tier <= 9) else 0.0
        glow_tier = 0 if tier < 4 else (1 if tier < 7 else (2 if tier < 10 else (3 if tier < 13 else (4 if tier < 16 else 5))))
        stat_mult = 1.0 + (tier * 0.05) + (max(0, tier - 10) * 0.10)
        enchanting_rules.append(
            {
                "level": tier,
                "safeZone": 1 if safe else 0,
                "successRatePct": success,
                "crystallizeRatePct": crystallize,
                "degradeRatePct": degrade,
                "visualGlowTier": glow_tier,
                "glowColorName": glow_names[glow_tier],
                "statMultiplier": round(stat_mult, 2),
            }
        )

    # Load World Bestiary (content/bestiary/bestiary.json)
    world_bestiary = load_json(BESTIARY_PATH) if BESTIARY_PATH.exists() else []

    # Load Spine Nodes (content/spine/nodes/*.json)
    spine_nodes = []
    spine_nodes_dir = SPINE_DIR / "nodes"
    if spine_nodes_dir.exists():
        for sf in sorted(spine_nodes_dir.glob("*.json")):
            d = load_json(sf)
            anchor = d.get("absoluteAnchor") or (d.get("placement") or {}).get("anchor") or [None, None]
            seed_obj = d.get("seed") or {}
            lore_obj = d.get("lore") or {}
            spine_nodes.append(
                {
                    "id": d["id"],
                    "title": d.get("title") or d["id"],
                    "tier": d.get("tier") or "",
                    "parentId": d.get("parentId"),
                    "seedVal": seed_obj.get("value") or "",
                    "anchorX": anchor[0] if len(anchor) > 0 else None,
                    "anchorY": anchor[1] if len(anchor) > 1 else None,
                    "frozen": 1 if d.get("frozen") else 0,
                    "loreReason": lore_obj.get("reason") or "",
                    "compositionJson": json.dumps(d.get("composition") or {}),
                    "rawJson": json.dumps(d),
                }
            )

    # Load Story Narrative Graph (content/story/*.json)
    story_nodes = []
    story_files = [
        "acts.json",
        "regions.json",
        "factions.json",
        "characters.json",
        "arcs.json",
        "quests.json",
        "events.json",
        "dialogue.json",
        "lore.json",
    ]
    for fname in story_files:
        fpath = STORY_DIR / fname
        if not fpath.exists():
            continue
        rows = load_json(fpath)
        for r in rows:
            story_nodes.append(
                {
                    "id": r["id"],
                    "kind": r.get("kind") or "",
                    "title": r.get("title") or r["id"],
                    "summary": r.get("summary") or "",
                    "regionId": r.get("region"),
                    "factionId": r.get("faction"),
                    "actId": r.get("actId"),
                    "arcId": r.get("arcId"),
                    "giverId": r.get("giver") or r.get("speaker") or r.get("anchor"),
                    "orderNum": r.get("order") or r.get("timelineOrder"),
                    "unlockedByJson": json.dumps(r.get("unlockedBy") or []),
                    "linksJson": json.dumps(r.get("links") or []),
                    "rawJson": json.dumps(r),
                }
            )

    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE jobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tier INTEGER NOT NULL,
            parent_job_id TEXT,
            min_base_level INTEGER NOT NULL,
            max_job_level INTEGER NOT NULL,
            job_change_quest_id TEXT,
            primary_stats_json TEXT NOT NULL,
            allowed_weapons_json TEXT NOT NULL,
            job_bonus_json TEXT NOT NULL,
            unlocked_skills_json TEXT NOT NULL,
            asset_studio_key TEXT NOT NULL
        );

        CREATE TABLE skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            max_level INTEGER NOT NULL,
            requires_json TEXT NOT NULL
        );

        CREATE TABLE items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            stackable INTEGER NOT NULL,
            p_atk INTEGER NOT NULL DEFAULT 0,
            m_atk INTEGER NOT NULL DEFAULT 0,
            atk_stat TEXT
        );

        CREATE TABLE cards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slot TEXT NOT NULL,
            mob_id TEXT NOT NULL,
            equip_stats_json TEXT NOT NULL,
            handbook_deposit_stats_json TEXT NOT NULL,
            asset_studio_key TEXT NOT NULL
        );

        CREATE TABLE mobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            level INTEGER NOT NULL,
            rank TEXT NOT NULL,
            element TEXT NOT NULL,
            race TEXT NOT NULL,
            size TEXT NOT NULL,
            is_mvp INTEGER NOT NULL,
            hp INTEGER NOT NULL,
            p_atk INTEGER NOT NULL,
            p_def INTEGER NOT NULL,
            base_exp INTEGER NOT NULL,
            job_exp INTEGER NOT NULL,
            aggro_range_m REAL NOT NULL,
            leash_range_m REAL NOT NULL,
            spawn_zones_json TEXT NOT NULL,
            card_id TEXT,
            asset_studio_key TEXT NOT NULL
        );

        CREATE TABLE mob_drops (
            mob_id TEXT NOT NULL REFERENCES mobs(id),
            item_id TEXT NOT NULL REFERENCES items(id),
            chance_bps INTEGER NOT NULL,
            PRIMARY KEY (mob_id, item_id)
        );

        CREATE TABLE quest_board (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            min_base_level INTEGER NOT NULL,
            required_job_id TEXT,
            giver_npc_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            repeatable INTEGER NOT NULL,
            base_xp INTEGER NOT NULL,
            job_xp INTEGER NOT NULL,
            unlock_job_id TEXT,
            unlock_skill_id TEXT,
            reputation INTEGER NOT NULL,
            objectives_json TEXT NOT NULL,
            rewards_items_json TEXT NOT NULL
        );

        CREATE TABLE handbook (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            target_id TEXT NOT NULL,
            tiers_json TEXT NOT NULL
        );

        CREATE TABLE castles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            hub_town_id TEXT NOT NULL,
            siege_map_id TEXT NOT NULL,
            siege_duration_minutes INTEGER NOT NULL,
            max_guild_size INTEGER NOT NULL,
            emperium_hp INTEGER NOT NULL,
            barricade_hp INTEGER NOT NULL,
            player_damage_scaling_pct INTEGER NOT NULL,
            guild_dungeon_zone_id TEXT NOT NULL,
            town_tax_share_bps INTEGER NOT NULL,
            asset_studio_key TEXT NOT NULL,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE maps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            width_m REAL NOT NULL,
            depth_m REAL NOT NULL,
            terrace_count INTEGER NOT NULL,
            structure_count INTEGER NOT NULL,
            prop_count INTEGER NOT NULL,
            spawn_area_count INTEGER NOT NULL,
            continent_id TEXT NOT NULL,
            region_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            spine_node_id TEXT NOT NULL,
            town_id TEXT NOT NULL,
            story_region_id TEXT NOT NULL,
            biome TEXT NOT NULL,
            level_min INTEGER NOT NULL,
            level_max INTEGER NOT NULL,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE world_continents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            continent_class TEXT NOT NULL,
            coast_class TEXT NOT NULL,
            register TEXT NOT NULL,
            level_min INTEGER NOT NULL,
            level_max INTEGER NOT NULL,
            gross_land_km2 REAL NOT NULL,
            land_cells INTEGER NOT NULL,
            structural_idea TEXT NOT NULL,
            palette_json TEXT NOT NULL,
            landform_kit_json TEXT NOT NULL,
            footprint_json TEXT NOT NULL
        );

        CREATE TABLE world_places (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            kind TEXT NOT NULL,
            tier TEXT NOT NULL,
            continent_id TEXT NOT NULL,
            rank TEXT NOT NULL,
            landform TEXT NOT NULL,
            at_x_km REAL,
            at_y_km REAL,
            handle_ref TEXT,
            why_or_note TEXT NOT NULL,
            plan_path TEXT,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE world_zones (
            id TEXT PRIMARY KEY,
            region_ref TEXT NOT NULL,
            survey TEXT NOT NULL,
            reason_to_go TEXT NOT NULL,
            hazard_count INTEGER NOT NULL,
            resource_count INTEGER NOT NULL,
            landmark_count INTEGER NOT NULL,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE world_dungeons (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            continent_id TEXT NOT NULL,
            handle_ref TEXT NOT NULL,
            entrance_type TEXT NOT NULL,
            floors INTEGER NOT NULL,
            level_min INTEGER NOT NULL,
            level_max INTEGER NOT NULL,
            hazards_json TEXT NOT NULL,
            lore_note TEXT NOT NULL,
            map_id TEXT,
            region_id TEXT,
            portal_x REAL,
            portal_y REAL,
            portal_radius REAL,
            mvp_boss_id TEXT,
            mvp_boss_name TEXT,
            mvp_boss_hp INTEGER,
            boss_enrage_secs INTEGER,
            mobs_per_floor INTEGER,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE races_catalog (
            id TEXT PRIMARY KEY,
            race_key TEXT NOT NULL,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            starter_town_id TEXT NOT NULL,
            starter_town_name TEXT NOT NULL,
            continent_id TEXT NOT NULL,
            district_id TEXT NOT NULL,
            str INTEGER NOT NULL,
            agi INTEGER NOT NULL,
            int INTEGER NOT NULL,
            vit INTEGER NOT NULL,
            dex INTEGER NOT NULL,
            luk INTEGER NOT NULL,
            hitbox_radius REAL NOT NULL,
            combat_trait TEXT NOT NULL,
            niched_story TEXT NOT NULL,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE boss_encounters (
            boss_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            max_hp INTEGER NOT NULL,
            enrage_timer_secs INTEGER NOT NULL,
            phase2_threshold_pct REAL NOT NULL,
            atk_multiplier REAL NOT NULL,
            aspd_multiplier REAL NOT NULL,
            empowered_skill TEXT NOT NULL,
            dungeon_id TEXT NOT NULL,
            scoring_weights_json TEXT NOT NULL
        );

        CREATE TABLE enchanting_rules (
            level INTEGER PRIMARY KEY,
            safe_zone INTEGER NOT NULL,
            success_rate_pct REAL NOT NULL,
            crystallize_rate_pct REAL NOT NULL,
            degrade_rate_pct REAL NOT NULL,
            visual_glow_tier INTEGER NOT NULL,
            glow_color_name TEXT NOT NULL,
            stat_multiplier REAL NOT NULL
        );

        CREATE TABLE world_bestiary (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            family TEXT NOT NULL,
            body_plan TEXT NOT NULL,
            level_band TEXT NOT NULL,
            element TEXT NOT NULL,
            archetype TEXT NOT NULL,
            threat TEXT NOT NULL,
            durability TEXT NOT NULL,
            speed TEXT NOT NULL,
            region TEXT NOT NULL,
            faction TEXT NOT NULL,
            lore TEXT NOT NULL,
            visual_brief TEXT NOT NULL
        );

        CREATE TABLE spine_nodes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            tier TEXT NOT NULL,
            parent_id TEXT,
            seed_val TEXT NOT NULL,
            anchor_x REAL,
            anchor_y REAL,
            frozen INTEGER NOT NULL,
            lore_reason TEXT NOT NULL,
            composition_json TEXT NOT NULL,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE story_nodes (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            region_id TEXT,
            faction_id TEXT,
            act_id TEXT,
            arc_id TEXT,
            giver_id TEXT,
            order_num INTEGER,
            unlocked_by_json TEXT NOT NULL,
            links_json TEXT NOT NULL,
            raw_json TEXT NOT NULL
        );
        """
    )

    for s in skills:
        cur.execute(
            "INSERT INTO skills VALUES (?, ?, ?, ?)",
            (s["id"], s["name"], s["maxLevel"], json.dumps(s["requires"])),
        )

    for i in items:
        cur.execute(
            "INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                i["id"],
                i["name"],
                i["kind"],
                1 if i["stackable"] else 0,
                i.get("pAtk", 0),
                i.get("mAtk", 0),
                i.get("atkStat"),
            ),
        )

    for j in jobs:
        cur.execute(
            "INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                j["id"],
                j["name"],
                j["tier"],
                j["parentJobId"],
                j["minBaseLevel"],
                j["maxJobLevel"],
                j["jobChangeQuestId"],
                json.dumps(j["primaryStats"]),
                json.dumps(j["allowedWeaponKinds"]),
                json.dumps(j["jobBonusAtMax"]),
                json.dumps(j["unlockedSkillIds"]),
                j["assetStudioKey"],
            ),
        )

    for c in cards:
        cur.execute(
            "INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                c["id"],
                c["name"],
                c["slot"],
                c["mobId"],
                json.dumps(c["equipStats"]),
                json.dumps(c["handbookDepositStats"]),
                c["assetStudioKey"],
            ),
        )

    for m in mobs:
        cur.execute(
            "INSERT INTO mobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                m["id"],
                m["name"],
                m["level"],
                m["rank"],
                m["element"],
                m["race"],
                m["size"],
                1 if m["isMvp"] else 0,
                m["hp"],
                m["pAtk"],
                m["pDef"],
                m["baseExp"],
                m["jobExp"],
                m["aggroRangeM"],
                m["leashRangeM"],
                json.dumps(m["spawnZones"]),
                m["cardId"],
                m["assetStudioKey"],
            ),
        )
        for d in m["drops"]:
            cur.execute(
                "INSERT INTO mob_drops VALUES (?, ?, ?)",
                (m["id"], d["itemId"], d["chanceBps"]),
            )

    for q in quest_board:
        rw = q["rewards"]
        cur.execute(
            "INSERT INTO quest_board VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                q["id"],
                q["title"],
                q["category"],
                q["minBaseLevel"],
                q["requiredJobId"],
                q["giverNpcId"],
                q["zoneId"],
                1 if q["repeatable"] else 0,
                rw["baseXp"],
                rw["jobXp"],
                rw["unlockJobId"],
                rw["unlockSkillId"],
                rw["reputation"],
                json.dumps(q["objectives"]),
                json.dumps(rw["items"]),
            ),
        )

    for h in handbook:
        cur.execute(
            "INSERT INTO handbook VALUES (?, ?, ?, ?, ?)",
            (
                h["id"],
                h["category"],
                h["title"],
                h["targetId"],
                json.dumps(h["tiers"]),
            ),
        )

    for cs in castles:
        cur.execute(
            "INSERT INTO castles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                cs["id"],
                cs["name"],
                cs["hubTownId"],
                cs["siegeMapId"],
                cs["siegeDurationMinutes"],
                cs["maxGuildSize"],
                cs["emperium"]["hp"],
                cs["fortifications"]["barricadeHp"],
                cs["pvpRules"]["playerDamageScalingPct"],
                cs["ownerRewards"]["guildDungeonZoneId"],
                cs["ownerRewards"]["townTaxShareBps"],
                cs["assetStudioKey"],
                json.dumps(cs),
            ),
        )

    for mp in maps:
        cur.execute(
            "INSERT INTO maps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                mp["id"],
                mp["name"],
                mp["widthM"],
                mp["depthM"],
                mp["terraceCount"],
                mp["structureCount"],
                mp["propCount"],
                mp["spawnAreaCount"],
                mp["continentId"],
                mp["regionId"],
                mp["zoneId"],
                mp["spineNodeId"],
                mp["townId"],
                mp["storyRegionId"],
                mp["biome"],
                mp["levelMin"],
                mp["levelMax"],
                mp["rawJson"],
            ),
        )

    for wc in world_continents:
        cur.execute(
            "INSERT INTO world_continents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                wc["id"],
                wc["title"],
                wc["continentClass"],
                wc["coastClass"],
                wc["register"],
                wc["levelMin"],
                wc["levelMax"],
                wc["grossLandKm2"],
                wc["landCells"],
                wc["structuralIdea"],
                wc["paletteJson"],
                wc["landformKitJson"],
                wc["footprintJson"],
            ),
        )

    for wp in world_places:
        cur.execute(
            "INSERT INTO world_places VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                wp["id"],
                wp["title"],
                wp["kind"],
                wp["tier"],
                wp["continentId"],
                wp["rank"],
                wp["landform"],
                wp["atXKm"],
                wp["atYKm"],
                wp["handleRef"],
                wp["whyOrNote"],
                wp["planPath"],
                wp["rawJson"],
            ),
        )

    for wz in world_zones:
        cur.execute(
            "INSERT INTO world_zones VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                wz["id"],
                wz["regionRef"],
                wz["survey"],
                wz["reasonToGo"],
                wz["hazardCount"],
                wz["resourceCount"],
                wz["landmarkCount"],
                wz["rawJson"],
            ),
        )

    for wd in world_dungeons:
        cur.execute(
            "INSERT INTO world_dungeons VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                wd["id"],
                wd["title"],
                wd["continentId"],
                wd["handleRef"],
                wd["entranceType"],
                wd["floors"],
                wd["levelMin"],
                wd["levelMax"],
                wd["hazardsJson"],
                wd["loreNote"],
                wd["mapId"],
                wd["regionId"],
                wd["portalX"],
                wd["portalY"],
                wd["portalRadius"],
                wd["mvpBossId"],
                wd["mvpBossName"],
                wd["mvpBossHp"],
                wd["bossEnrageSecs"],
                wd["mobsPerFloor"],
                wd["rawJson"],
            ),
        )

    for rc in races_catalog:
        cur.execute(
            "INSERT INTO races_catalog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                rc["id"],
                rc["raceKey"],
                rc["name"],
                rc["icon"],
                rc["starterTownId"],
                rc["starterTownName"],
                rc["continentId"],
                rc["districtId"],
                rc["str"],
                rc["agi"],
                rc["int"],
                rc["vit"],
                rc["dex"],
                rc["luk"],
                rc["hitboxRadius"],
                rc["combatTrait"],
                rc["nichedStory"],
                rc["rawJson"],
            ),
        )

    for be in boss_encounters:
        cur.execute(
            "INSERT INTO boss_encounters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                be["bossId"],
                be["name"],
                be["maxHp"],
                be["enrageTimerSecs"],
                be["phase2ThresholdPct"],
                be["atkMultiplier"],
                be["aspdMultiplier"],
                be["empoweredSkill"],
                be["dungeonId"],
                be["scoringWeightsJson"],
            ),
        )

    for er in enchanting_rules:
        cur.execute(
            "INSERT INTO enchanting_rules VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                er["level"],
                er["safeZone"],
                er["successRatePct"],
                er["crystallizeRatePct"],
                er["degradeRatePct"],
                er["visualGlowTier"],
                er["glowColorName"],
                er["statMultiplier"],
            ),
        )

    for wb in world_bestiary:
        cur.execute(
            "INSERT INTO world_bestiary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                wb["id"],
                wb.get("name", wb["id"]),
                wb.get("family", ""),
                wb.get("bodyPlan", ""),
                wb.get("levelBand", ""),
                wb.get("element", ""),
                wb.get("archetype", ""),
                wb.get("threat", ""),
                wb.get("durability", ""),
                wb.get("speed", ""),
                wb.get("region", ""),
                wb.get("faction", ""),
                wb.get("lore", ""),
                wb.get("visualBrief", ""),
            ),
        )

    for sn in spine_nodes:
        cur.execute(
            "INSERT INTO spine_nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                sn["id"],
                sn["title"],
                sn["tier"],
                sn["parentId"],
                sn["seedVal"],
                sn["anchorX"],
                sn["anchorY"],
                sn["frozen"],
                sn["loreReason"],
                sn["compositionJson"],
                sn["rawJson"],
            ),
        )

    for st in story_nodes:
        cur.execute(
            "INSERT INTO story_nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                st["id"],
                st["kind"],
                st["title"],
                st["summary"],
                st["regionId"],
                st["factionId"],
                st["actId"],
                st["arcId"],
                st["giverId"],
                st["orderNum"],
                st["unlockedByJson"],
                st["linksJson"],
                st["rawJson"],
            ),
        )

    # Create observability SQL views
    cur.executescript(
        """
        CREATE VIEW v_asset_studio_entries AS
            SELECT asset_studio_key AS entry_key, 'job' AS domain, id AS catalog_id, name FROM jobs
            UNION ALL
            SELECT asset_studio_key AS entry_key, 'mob' AS domain, id AS catalog_id, name FROM mobs
            UNION ALL
            SELECT asset_studio_key AS entry_key, 'card' AS domain, id AS catalog_id, name FROM cards
            UNION ALL
            SELECT asset_studio_key AS entry_key, 'castle' AS domain, id AS catalog_id, name FROM castles;

        CREATE VIEW v_job_progression AS
            SELECT
                j.id AS job_id,
                j.name AS job_name,
                j.tier,
                j.parent_job_id,
                j.min_base_level,
                j.max_job_level,
                q.id AS trial_quest_id,
                q.title AS trial_quest_title,
                q.giver_npc_id
            FROM jobs j
            LEFT JOIN quest_board q ON j.job_change_quest_id = q.id
            ORDER BY j.tier ASC, j.id ASC;

        CREATE VIEW v_mob_economy AS
            SELECT
                m.id AS mob_id,
                m.name AS mob_name,
                m.level,
                m.rank,
                m.element,
                m.race,
                m.size,
                m.hp,
                m.base_exp,
                m.job_exp,
                ROUND(CAST(m.base_exp AS REAL) / m.hp, 3) AS base_exp_per_hp,
                COUNT(d.item_id) AS drop_item_count,
                m.card_id
            FROM mobs m
            LEFT JOIN mob_drops d ON m.id = d.mob_id
            GROUP BY m.id
            ORDER BY m.level ASC;

        CREATE VIEW v_world_continent_overview AS
            SELECT
                c.id AS continent_id,
                c.title,
                c.continent_class,
                c.coast_class,
                c.level_min || '-' || c.level_max AS level_band,
                c.gross_land_km2,
                (SELECT COUNT(*) FROM world_places p WHERE p.continent_id = c.id AND p.tier = 'pinned') AS pinned_places,
                (SELECT COUNT(*) FROM world_places p WHERE p.continent_id = c.id AND p.tier = 'bound') AS bound_places,
                (SELECT COUNT(*) FROM world_dungeons d WHERE d.continent_id = c.id) AS dungeons,
                (SELECT COUNT(*) FROM world_zones z WHERE z.region_ref LIKE c.id || '/%') AS surveyed_zones,
                (SELECT COUNT(*) FROM maps m WHERE m.continent_id = c.id) AS playable_maps
            FROM world_continents c
            ORDER BY c.id ASC;

        CREATE VIEW v_story_region_matrix AS
            SELECT
                r.id AS region_id,
                r.title AS region_title,
                r.summary,
                (SELECT COUNT(*) FROM story_nodes c WHERE c.kind = 'character' AND c.region_id = r.id) AS characters,
                (SELECT COUNT(*) FROM story_nodes q WHERE q.kind = 'quest' AND q.region_id = r.id) AS story_quests,
                (SELECT COUNT(*) FROM world_bestiary b WHERE
                    ('region-' || b.region = r.id)
                    OR (b.region = 'c02/r11' AND r.id = 'region-ashvale-front')
                    OR (b.region = 'northern-icefield' AND r.id = 'region-icefield')
                ) AS bestiary_mobs,
                COALESCE((SELECT GROUP_CONCAT(m.id, ',') FROM maps m WHERE m.story_region_id = r.id), '') AS playable_map_ids
            FROM story_nodes r
            WHERE r.kind = 'region'
            ORDER BY r.id ASC;

        CREATE VIEW v_map_world_binding AS
            SELECT
                m.id AS map_id,
                m.name AS map_name,
                m.continent_id,
                m.region_id,
                m.zone_id,
                m.spine_node_id,
                m.town_id,
                m.story_region_id,
                m.biome,
                m.level_min || '-' || m.level_max AS level_band,
                CAST(m.width_m AS INT) || 'x' || CAST(m.depth_m AS INT) AS dimensions_m,
                m.terrace_count,
                m.structure_count,
                m.prop_count,
                m.spawn_area_count
            FROM maps m
            ORDER BY m.level_min ASC, m.id ASC;
        """
    )

    conn.commit()

    asset_entries = [
        {"entryKey": r[0], "domain": r[1], "catalogId": r[2], "name": r[3]}
        for r in cur.execute("SELECT * FROM v_asset_studio_entries").fetchall()
    ]
    job_prog = [
        {
            "jobId": r[0],
            "name": r[1],
            "tier": r[2],
            "parentJobId": r[3],
            "minBaseLevel": r[4],
            "maxJobLevel": r[5],
            "trialQuestId": r[6],
            "trialQuestTitle": r[7],
        }
        for r in cur.execute("SELECT * FROM v_job_progression").fetchall()
    ]
    mob_econ = [
        {
            "mobId": r[0],
            "name": r[1],
            "level": r[2],
            "rank": r[3],
            "element": r[4],
            "race": r[5],
            "size": r[6],
            "hp": r[7],
            "baseExp": r[8],
            "jobExp": r[9],
            "baseExpPerHp": r[10],
            "dropItemCount": r[11],
            "cardId": r[12],
        }
        for r in cur.execute("SELECT * FROM v_mob_economy").fetchall()
    ]

    summary = {
        "databasePath": str(DB_PATH.relative_to(ROOT)),
        "counts": {
            "jobs": len(jobs),
            "skills": len(skills),
            "items": len(items),
            "mobs": len(mobs),
            "cards": len(cards),
            "questBoard": len(quest_board),
            "handbook": len(handbook),
            "castles": len(castles),
            "maps": len(maps),
            "elements": len(elements.get("elements", [])),
            "worldContinents": len(world_continents),
            "worldPlaces": len(world_places),
            "worldZones": len(world_zones),
            "worldDungeons": len(world_dungeons),
            "races": len(races_catalog),
            "bossEncounters": len(boss_encounters),
            "enchantingRules": len(enchanting_rules),
            "worldBestiary": len(world_bestiary),
            "spineNodes": len(spine_nodes),
            "storyNodes": len(story_nodes),
        },
        "jobProgression": job_prog,
        "mobEconomy": mob_econ,
        "mapWorldBindings": [
            {
                "mapId": r[0],
                "mapName": r[1],
                "continentId": r[2],
                "regionId": r[3],
                "zoneId": r[4],
                "spineNodeId": r[5],
                "townId": r[6],
                "storyRegionId": r[7],
                "biome": r[8],
                "levelBand": r[9],
                "dimensionsM": r[10],
                "terraceCount": r[11],
                "structureCount": r[12],
                "propCount": r[13],
                "spawnAreaCount": r[14],
            }
            for r in cur.execute("SELECT * FROM v_map_world_binding").fetchall()
        ],
        "assetStudioEntries": asset_entries,
    }

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    conn.close()
    print(
        f"[catalog_db] Built {DB_PATH.relative_to(ROOT)} and {SUMMARY_PATH.relative_to(ROOT)} "
        f"(continents={len(world_continents)}, places={len(world_places)}, zones={len(world_zones)}, "
        f"dungeons={len(world_dungeons)}, bestiary={len(world_bestiary)}, spine={len(spine_nodes)}, "
        f"story={len(story_nodes)}, jobs={len(jobs)}, skills={len(skills)}, items={len(items)}, "
        f"mobs={len(mobs)}, cards={len(cards)}, quests={len(quest_board)}, maps={len(maps)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
