#!/usr/bin/env python3
"""
Builds build/catalog.sqlite and build/catalog_summary.json from:
- contracts/content/*.json (jobs, skills, items, mobs, cards, quests, quest_board, handbook, castles, elements)
- content/maps/*.json

Provides a single observable SQLite + JSONB-style catalog database for:
1. Cross-table balance queries (Zone XP/hr, Mob drop tables, Job progression, Item power budget)
2. Asset Studio entry synchronization (v_asset_studio_entries)
3. CI referential integrity verification
"""

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "contracts" / "content"
MAPS_DIR = ROOT / "content" / "maps"
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
            maps.append(
                {
                    "id": data.get("mapId") or mp.stem,
                    "name": data.get("name") or data.get("displayName") or mp.stem,
                    "widthM": data.get("width", data.get("widthMeters", 200)),
                    "depthM": data.get("height", data.get("depthMeters", 200)),
                    "terraceCount": len(data.get("heightTerraces", [])),
                    "structureCount": len(data.get("structures", [])),
                    "propCount": len(data.get("props", [])),
                    "rawJson": json.dumps(data),
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
            "INSERT INTO maps VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                mp["id"],
                mp["name"],
                mp["widthM"],
                mp["depthM"],
                mp["terraceCount"],
                mp["structureCount"],
                mp["propCount"],
                mp["rawJson"],
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
        },
        "jobProgression": job_prog,
        "mobEconomy": mob_econ,
        "assetStudioEntries": asset_entries,
    }

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    conn.close()
    print(
        f"[catalog_db] Built {DB_PATH.relative_to(ROOT)} and {SUMMARY_PATH.relative_to(ROOT)} "
        f"(jobs={len(jobs)}, skills={len(skills)}, items={len(items)}, mobs={len(mobs)}, "
        f"cards={len(cards)}, quests={len(quest_board)}, handbook={len(handbook)}, castles={len(castles)}, maps={len(maps)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
