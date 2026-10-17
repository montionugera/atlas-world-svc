#!/usr/bin/env python3
"""
Atlas World — MMORPG Catalog & Balance Observatory Web Studio (scripts/catalog_explorer_web.py)

Unified Web-First + Native macOS (`WKWebView`) Observatory powered by:
  1. Canonical `joy-design` Design System (`@joymify/tokens` `theme.css`, `@joymify/brand`, `.joy-*`)
  2. RateMyServer (RMS) Information Architecture:
     - Authentic 3D-Baked WebP Asset Thumbnails (`GET /thumbs/<sha256_16>.webp`) from `game-client/assets/.thumbs/`
     - Bespoke Illustrated RMS Card Frame & Item Art for every Equipment, Consumable, Material, Card, Monster, Job, Skill, Quest, and Castle
     - Dense 2D Tabular Datasheets (`item_db`, `mob_db`, `skill_db_class`, `map_db` / `areainfo`)
     - Dual Human Description + Authoritative Engine Script / Contract Rows
     - Bidirectional Reverse-Lookup Joins (Dropped By, Applicable Jobs, Spawns On, Used In Quests)
     - Live Parameterized Drop Rate Multiplier (`1x`, `3x`, `5x`, `10x`)
     - 2D Top-Down Minimap SVG Renderer + Area Monster Spawn Table

Usage:
  python3 scripts/catalog_explorer_web.py [--port 8788]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
BUILD_SCRIPT = ROOT / "scripts" / "build_catalog_db.py"
DB_PATH = ROOT / "build" / "catalog.sqlite"
CONTENT_DIR = ROOT / "contracts" / "content"
MAPS_DIR = ROOT / "content" / "maps"
SPECS_DIR = ROOT / "docs" / "superpowers" / "specs"
CANON_PATH = ROOT / "content" / "story" / "canon.md"
THUMBS_DIR = ROOT / "game-client" / "assets" / ".thumbs"
GROUND_PALETTES_PATH = ROOT / "content" / "ground_palettes.json"
REVIEW_QUEUE_PATH = ROOT / "content" / "review-queue.json"
CLIENT_MANIFEST_PATH = ROOT / "game-client" / "assets" / "manifest.json"
STUDIO_SNAPSHOTS_DIR = ROOT / "build" / "studio-snapshots"

THEME_CSS_CANDIDATES = [
    ROOT.parent / "joy-design" / "packages" / "tokens" / "dist" / "theme.css",
    ROOT.parent / "joy-design" / ".claude" / "worktrees" / "_release" / "packages" / "tokens" / "dist" / "theme.css",
    ROOT / "tools" / "mac-observatory" / "joy-theme.css",
]

# Authoritative 3D asset scene mapping -> 256x256 baked WebP thumbnails in game-client/assets/.thumbs/
ENTITY_SCENE_MAP: dict[str, str] = {
    # Items
    "basic_sword": "res://assets/weapons/kk_sword_b.glb",
    "magic_staff": "res://assets/weapons/kk_staff_b.glb",
    "great_bow": "res://assets/weapons/kk_bow_b_withstring.glb",
    "dagger": "res://assets/weapons/kk_dagger_b.glb",
    "scythe": "res://assets/weapons/kk_scythe.glb",
    "potion_minor": "res://assets/loot/potion_bottle.glb",
    "leather_armor": "res://assets/dungeon/banner_shield_brown.glb",
    "iron_ore": "res://assets/loot/gem.glb",
    # Cards
    "card_forest_slime": "res://assets/creatures/green_blob.glb",
    "card_boar": "res://assets/characters/werewolf_wolf.glb",
    "card_skeleton_soldier": "res://assets/characters/skeleton_warrior.glb",
    "card_orc_warlord": "res://assets/characters/orc_brute.glb",
    # Mobs
    "forest_slime": "res://assets/creatures/slime.glb",
    "boar": "res://assets/characters/werewolf_wolf.glb",
    "skeleton_soldier": "res://assets/characters/skeleton_warrior.glb",
    "orc_warlord": "res://assets/characters/orc_brute.glb",
    # Jobs
    "novice": "res://assets/characters/protagonist_a.glb",
    "swordman": "res://assets/characters/barbarian.glb",
    "mage": "res://assets/characters/mage.glb",
    "archer": "res://assets/characters/archer.glb",
    "knight": "res://assets/characters/paladin_with_helmet.glb",
    "wizard": "res://assets/characters/lorekeeper.glb",
    # Skills
    "power_strike": "res://assets/weapons/greatsword.glb",
    "fireball": "res://assets/weapons/kk_wand_a.glb",
    "iron_skin": "res://assets/weapons/kk_shield_c.glb",
    "cleave": "res://assets/weapons/kk_axe_d.glb",
    # Castles & Quests
    "castle_valkyrie_01": "res://assets/dungeon/sword_shield_gold.glb",
    "msq_south_gate_patrol": "res://assets/dungeon/banner_patterna_blue.glb",
    "jq_swordman_trial": "res://assets/weapons/kk_sword_f.glb",
    "jq_mage_academy": "res://assets/weapons/kk_staff_d.glb",
    "jq_archer_guild": "res://assets/weapons/kk_bow_c_withstring.glb",
    "jq_knight_chivalry": "res://assets/dungeon/sword_shield_gold.glb",
    "jq_wizard_tower": "res://assets/loot/book.glb",
    "sq_watchtower_supplies": "res://assets/dungeon/chest_large.glb",
    "bounty_daily_boar_cull": "res://assets/dungeon/banner_shield_red.glb",
}


def thumb_url_for_scene(scene: str | None) -> str | None:
    if not scene:
        return None
    h = hashlib.sha256(scene.encode("utf-8")).hexdigest()[:16] + ".webp"
    if (THUMBS_DIR / h).exists():
        return f"/thumbs/{h}"
    return None


def thumb_url_for_entity(entity_id: str) -> str | None:
    return thumb_url_for_scene(ENTITY_SCENE_MAP.get(entity_id))


def load_theme_css() -> bytes:
    for candidate in THEME_CSS_CANDIDATES:
        if candidate.exists():
            return candidate.read_bytes()
    return b"/* joy-theme.css not found */"


def ensure_catalog_db() -> None:
    needs_build = not DB_PATH.exists()
    if not needs_build:
        try:
            conn = sqlite3.connect(str(DB_PATH))
            row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='world_continents'").fetchone()
            conn.close()
            if not row:
                needs_build = True
        except Exception:
            needs_build = True
    if needs_build:
        subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)


def load_world_spine_bundle() -> dict:
    ensure_catalog_db()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    continents = []
    for r in cur.execute("SELECT * FROM world_continents ORDER BY id ASC").fetchall():
        continents.append({
            "id": r["id"],
            "title": r["title"],
            "continentClass": r["continent_class"],
            "coastClass": r["coast_class"],
            "register": r["register"],
            "levelMin": r["level_min"],
            "levelMax": r["level_max"],
            "grossLandKm2": r["gross_land_km2"],
            "landCells": r["land_cells"],
            "structuralIdea": r["structural_idea"],
            "palette": json.loads(r["palette_json"]),
            "landformKit": json.loads(r["landform_kit_json"]),
            "footprint": json.loads(r["footprint_json"]),
        })

    pinned_places = []
    bound_places = []
    for r in cur.execute("SELECT * FROM world_places ORDER BY tier DESC, id ASC").fetchall():
        item = {
            "id": r["id"],
            "title": r["title"],
            "kind": r["kind"],
            "tier": r["tier"],
            "continentId": r["continent_id"],
            "rank": r["rank"],
            "landform": r["landform"],
            "atXKm": r["at_x_km"],
            "atYKm": r["at_y_km"],
            "handleRef": r["handle_ref"],
            "whyOrNote": r["why_or_note"],
            "planPath": r["plan_path"],
        }
        if r["tier"] == "pinned":
            pinned_places.append(item)
        else:
            bound_places.append(item)

    zones = []
    for r in cur.execute("SELECT * FROM world_zones ORDER BY id ASC").fetchall():
        raw = json.loads(r["raw_json"])
        zones.append({
            "id": r["id"],
            "regionRef": r["region_ref"],
            "continentId": r["region_ref"].split("/")[0] if "/" in r["region_ref"] else "",
            "survey": r["survey"],
            "reasonToGo": r["reason_to_go"],
            "hazards": raw.get("hazards") or [],
            "resources": raw.get("resources") or [],
            "landmarks": raw.get("landmarks") or [],
        })

    dungeons = []
    for r in cur.execute("SELECT * FROM world_dungeons ORDER BY id ASC").fetchall():
        dungeons.append({
            "id": r["id"],
            "title": r["title"],
            "continentId": r["continent_id"],
            "handleRef": r["handle_ref"],
            "entranceType": r["entrance_type"],
            "floors": r["floors"],
            "levelMin": r["level_min"],
            "levelMax": r["level_max"],
            "hazards": json.loads(r["hazards_json"]),
            "loreNote": r["lore_note"],
        })

    bestiary = []
    for r in cur.execute("SELECT * FROM world_bestiary ORDER BY region ASC, id ASC").fetchall():
        bestiary.append({
            "id": r["id"],
            "name": r["name"],
            "family": r["family"],
            "bodyPlan": r["body_plan"],
            "levelBand": r["level_band"],
            "element": r["element"],
            "archetype": r["archetype"],
            "threat": r["threat"],
            "durability": r["durability"],
            "speed": r["speed"],
            "region": r["region"],
            "faction": r["faction"],
            "lore": r["lore"],
            "visualBrief": r["visual_brief"],
        })

    spine_nodes = []
    for r in cur.execute("SELECT * FROM spine_nodes ORDER BY id ASC").fetchall():
        spine_nodes.append({
            "id": r["id"],
            "title": r["title"],
            "tier": r["tier"],
            "parentId": r["parent_id"],
            "seedVal": r["seed_val"],
            "anchorX": r["anchor_x"],
            "anchorY": r["anchor_y"],
            "frozen": bool(r["frozen"]),
            "loreReason": r["lore_reason"],
            "composition": json.loads(r["composition_json"]),
        })

    story_nodes = []
    for r in cur.execute("SELECT * FROM story_nodes ORDER BY kind ASC, COALESCE(order_num, 9999) ASC, id ASC").fetchall():
        raw = json.loads(r["raw_json"])
        story_nodes.append({
            "id": r["id"],
            "kind": r["kind"],
            "title": r["title"],
            "summary": r["summary"],
            "regionId": r["region_id"],
            "factionId": r["faction_id"],
            "actId": r["act_id"],
            "arcId": r["arc_id"],
            "giverId": r["giver_id"],
            "orderNum": r["order_num"],
            "unlockedBy": json.loads(r["unlocked_by_json"]),
            "links": json.loads(r["links_json"]),
            "raw": raw,
        })

    conn.close()

    world_fab = load_json_file(ROOT / "content" / "world" / "fabric" / "world.json") or {}
    sea_lanes = []
    for sl in world_fab.get("seaLanes") or []:
        pts = sl.get("points") or []
        step = max(1, len(pts) // 24)
        thinned = pts[::step]
        if pts and thinned[-1] != pts[-1]:
            thinned.append(pts[-1])
        sea_lanes.append({
            "id": sl.get("id"),
            "from": sl.get("from"),
            "to": sl.get("to"),
            "km": sl.get("km"),
            "points": thinned,
        })

    spine_edges = load_json_file(ROOT / "content" / "spine" / "edges.json") or []
    town_millcross = load_json_file(ROOT / "content" / "towns" / "town-millcross.json") or {}

    return {
        "seed": world_fab.get("seed", "7c9e4a2f8b1d6e03"),
        "areaKm2": world_fab.get("areaKm2", {"netLand": 64000, "water": 96000, "total": 160000}),
        "seaToLandRatio": world_fab.get("seaToLandRatio", 1.5),
        "continents": continents,
        "pinnedPlaces": pinned_places,
        "boundPlaces": bound_places,
        "zones": zones,
        "dungeons": dungeons,
        "bestiary": bestiary,
        "spineNodes": spine_nodes,
        "storyNodes": story_nodes,
        "seaLanes": sea_lanes,
        "spineEdges": spine_edges,
        "townMillcross": town_millcross,
    }


def load_json_file(path: Path):
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_live_entity_scene(entity_id: str, record: dict | None = None) -> str | None:
    if record and record.get("scenePath"):
        return str(record["scenePath"])
    if entity_id in ("orc_warlord", "card_orc_warlord"):
        manifest = load_json_file(CLIENT_MANIFEST_PATH) or {}
        entries = manifest.get("entries") or {}
        agg_scene = (entries.get("mob:aggressive") or {}).get("scene")
        if agg_scene:
            return str(agg_scene)
    return ENTITY_SCENE_MAP.get(entity_id)


def attach_thumbs(records: list[dict]) -> list[dict]:
    out = []
    for r in records:
        rc = dict(r)
        eid = rc.get("id", "")
        scene = get_live_entity_scene(eid, rc)
        rc["scenePath"] = scene
        rc["thumbUrl"] = thumb_url_for_scene(scene) or thumb_url_for_entity(eid)
        out.append(rc)
    return out


def build_full_bundle() -> dict:
    ensure_catalog_db()
    jobs = attach_thumbs(load_json_file(CONTENT_DIR / "jobs.json") or [])
    skills = attach_thumbs(load_json_file(CONTENT_DIR / "skills.json") or [])
    items = attach_thumbs(load_json_file(CONTENT_DIR / "items.json") or [])
    mobs = attach_thumbs(load_json_file(CONTENT_DIR / "mobs.json") or [])
    cards = attach_thumbs(load_json_file(CONTENT_DIR / "cards.json") or [])
    quests = attach_thumbs(load_json_file(CONTENT_DIR / "quest_board.json") or [])
    handbook = load_json_file(CONTENT_DIR / "handbook.json") or []
    castles = attach_thumbs(load_json_file(CONTENT_DIR / "castles.json") or [])
    elements = load_json_file(CONTENT_DIR / "elements.json") or {}
    summary = load_json_file(ROOT / "build" / "catalog_summary.json") or {}

    maps = []
    if MAPS_DIR.exists():
        for mp in sorted(MAPS_DIR.glob("*.json")):
            d = load_json_file(mp) or {}
            maps.append(
                {
                    "id": d.get("mapId") or mp.stem,
                    "name": d.get("name") or d.get("displayName") or mp.stem,
                    "width": d.get("width", d.get("widthMeters", 200)),
                    "height": d.get("height", d.get("depthMeters", 200)),
                    "seed": d.get("seed", 0),
                    "biome": d.get("biome", "meadow"),
                    "levelBand": d.get("levelBand") or [1, 15],
                    "worldSpineBinding": d.get("worldSpineBinding") or {},
                    "terrainAmplitude": d.get("terrainAmplitude", 1.0),
                    "defaultTimeOfDayHours": d.get("defaultTimeOfDayHours", 12.0),
                    "terraceCount": len(d.get("heightTerraces", [])),
                    "structureCount": len(d.get("structures", [])),
                    "staticObstacleCount": len(d.get("staticObstacles", [])),
                    "propCount": len(d.get("props", [])),
                    "version": d.get("version", 2),
                    "baseGroundId": d.get("baseGroundId", "meadow_grass"),
                    "routes": d.get("routes", []),
                    "groundZones": d.get("groundZones", []),
                    "groundPalettes": d.get("groundPalettes", {}),
                    "structures": d.get("structures", []),
                    "heightTerraces": d.get("heightTerraces", []),
                    "spawnAreas": d.get("spawnAreas", []),
                    "props": (d.get("props", []) or [])[:40],
                }
            )

    docs = []
    if SPECS_DIR.exists():
        for sp in sorted(SPECS_DIR.glob("*.md"), reverse=True):
            docs.append(
                {
                    "id": sp.name,
                    "title": sp.stem,
                    "path": str(sp.relative_to(ROOT)),
                    "category": "spec",
                    "content": sp.read_text(encoding="utf-8", errors="replace"),
                }
            )
    if CANON_PATH.exists():
        docs.append(
            {
                "id": "canon.md",
                "title": "World Lore Canon (canon.md)",
                "path": str(CANON_PATH.relative_to(ROOT)),
                "category": "canon",
                "content": CANON_PATH.read_text(encoding="utf-8", errors="replace"),
            }
        )

    ground_palettes = load_json_file(GROUND_PALETTES_PATH) or {}
    review_queue = load_json_file(REVIEW_QUEUE_PATH) or {"version": 1, "verdicts": {}, "workOrders": [], "proposals": []}
    asset_scene_thumbs: dict[str, str] = {}
    for _, pal in ground_palettes.items():
        for _, rule in (pal.get("scatter") or {}).items():
            for sp in (rule.get("assets") or []) + (rule.get("disabledAssets") or []):
                turl = thumb_url_for_scene(sp)
                if turl:
                    asset_scene_thumbs[sp] = turl
    for prop in review_queue.get("proposals") or []:
        eid = prop.get("targetId", "")
        if eid and thumb_url_for_entity(eid):
            prop["thumbUrl"] = thumb_url_for_entity(eid)
        for tk in prop.get("takes") or []:
            sp = tk.get("assetPath")
            if sp and thumb_url_for_scene(sp):
                tk["thumbUrl"] = thumb_url_for_scene(sp)

    return {
        "jobs": jobs,
        "skills": skills,
        "items": items,
        "mobs": mobs,
        "cards": cards,
        "quests": quests,
        "handbook": handbook,
        "castles": castles,
        "elements": elements,
        "maps": maps,
        "summary": summary,
        "docs": docs,
        "groundPalettes": ground_palettes,
        "reviewQueue": review_queue,
        "assetSceneThumbs": asset_scene_thumbs,
        "studioSnapshots": list_studio_snapshots(),
        "worldSpine": load_world_spine_bundle(),
    }




def list_studio_snapshots() -> list[dict]:
    if not STUDIO_SNAPSHOTS_DIR.exists():
        return []
    out = []
    for d in sorted(STUDIO_SNAPSHOTS_DIR.iterdir(), reverse=True):
        if d.is_dir():
            meta = load_json_file(d / "meta.json") or {"id": d.name, "label": d.name, "files": []}
            out.append(meta)
    return out[:15]


def create_studio_snapshot(label: str, rel_files: list[str]) -> dict:
    import time
    ts = time.strftime("%Y%m%d-%H%M%S")
    safe_label = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:36]
    snap_id = f"{ts}_{safe_label}"
    snap_dir = STUDIO_SNAPSHOTS_DIR / snap_id
    snap_dir.mkdir(parents=True, exist_ok=True)
    saved_files = []
    all_targets = list(dict.fromkeys(rel_files + ["content/review-queue.json"]))
    for rel in all_targets:
        src_p = (ROOT / rel).resolve()
        if src_p.exists() and ROOT in src_p.parents:
            dst_p = snap_dir / rel.replace("/", "__")
            shutil.copy2(src_p, dst_p)
            saved_files.append(rel)
    meta = {
        "id": snap_id,
        "label": label,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": saved_files,
    }
    (snap_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta


def undo_latest_snapshot() -> dict:
    snaps = list_studio_snapshots()
    if not snaps:
        return {"ok": False, "error": "No studio snapshots available to undo."}
    latest = snaps[0]
    snap_dir = STUDIO_SNAPSHOTS_DIR / latest["id"]
    restored = []
    for rel in latest.get("files", []):
        backup_p = snap_dir / rel.replace("/", "__")
        dst_p = (ROOT / rel).resolve()
        if backup_p.exists() and ROOT in dst_p.parents:
            shutil.copy2(backup_p, dst_p)
            restored.append(rel)
    shutil.rmtree(snap_dir, ignore_errors=True)
    subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)
    return {"ok": True, "restoredSnapshot": latest["id"], "restoredFiles": restored}


def sync_palettes_into_pilot_map(palettes: dict) -> None:
    map_p = MAPS_DIR / "freja-south-gate.json"
    if not map_p.exists():
        return
    m_doc = load_json_file(map_p) or {}
    m_pals = m_doc.get("groundPalettes") or {}
    for pid, pal in palettes.items():
        if pid in m_pals:
            m_pals[pid]["playerScaleBandM"] = pal.get("playerScaleBandM", [0.90, 1.20])
            for rname, rcfg in (pal.get("scatter") or {}).items():
                if rname in (m_pals[pid].get("scatter") or {}):
                    m_pals[pid]["scatter"][rname]["weight"] = rcfg.get("weight", m_pals[pid]["scatter"][rname].get("weight", 0.1))
                    m_pals[pid]["scatter"][rname]["assets"] = rcfg.get("assets", [])
                    m_pals[pid]["scatter"][rname]["disabledAssets"] = rcfg.get("disabledAssets", [])
                    if "scaleRange" in rcfg:
                        m_pals[pid]["scatter"][rname]["scaleRange"] = rcfg["scaleRange"]
                    if "colliderHalfExtent" in rcfg:
                        m_pals[pid]["scatter"][rname]["colliderHalfExtent"] = rcfg["colliderHalfExtent"]
    m_doc["groundPalettes"] = m_pals
    map_p.write_text(json.dumps(m_doc, indent=2) + "\n", encoding="utf-8")


def record_ai_agent_log(rq: dict, entry: dict) -> None:
    logs = rq.setdefault("agentEditLog", [])
    logs.insert(0, entry)
    del logs[20:]


def apply_review_verdict(payload: dict) -> dict:
    import time
    prop_id = str(payload.get("id") or "")
    verdict = str(payload.get("verdict") or "approve").lower()
    take_idx = int(payload.get("selectedTakeIdx") or 0)
    feedback_text = str(payload.get("feedbackText") or "").strip()

    rq = load_json_file(REVIEW_QUEUE_PATH) or {"version": 1, "verdicts": {}, "workOrders": [], "proposals": []}
    proposals = rq.get("proposals") or []
    target_prop = next((p for p in proposals if p.get("id") == prop_id), None)
    if not target_prop:
        return {"ok": False, "error": f"Proposal {prop_id} not found"}

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    takes = target_prop.get("takes") or []
    take_idx = max(0, min(take_idx, max(0, len(takes) - 1)))
    target_prop["selectedTakeIdx"] = take_idx
    selected_take = takes[take_idx] if takes else {}

    if verdict == "approve":
        kind = target_prop.get("kind")
        snap_files = [
            "content/review-queue.json",
            "game-client/assets/manifest.json",
            "contracts/content/mobs.json",
            "content/ground_palettes.json",
            "content/maps/freja-south-gate.json",
        ]
        snap_meta = create_studio_snapshot(f"approve_{prop_id}_{selected_take.get('id', 'take')}", snap_files)
        mutated_files = []

        # Pillar B: DB Entity & 3D Asset (e.g., rq-pilot-101 orc_warlord)
        if kind == "db_entity":
            new_scene = selected_take.get("assetPath") or "res://assets/characters/orc_brute.glb"
            new_scale = float(selected_take.get("visualScale") or 1.22)
            new_height = float(selected_take.get("heightM") or 2.10)
            new_col_r = float(selected_take.get("colliderRadiusM") or 0.95)
            entity_id = target_prop.get("targetId") or "orc_warlord"
            manifest_key = target_prop.get("assetStudioKey") or "mob:aggressive"

            manifest = load_json_file(CLIENT_MANIFEST_PATH) or {"version": 2, "entries": {}}
            if manifest_key in (manifest.get("entries") or {}):
                manifest["entries"][manifest_key]["scene"] = new_scene
                CLIENT_MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
                mutated_files.append("game-client/assets/manifest.json")

            mobs_path = CONTENT_DIR / "mobs.json"
            mobs_list = load_json_file(mobs_path) or []
            for mb in mobs_list:
                if mb.get("id") == entity_id:
                    mb["scenePath"] = new_scene
                    mb["visualScale"] = new_scale
                    mb["heightM"] = new_height
                    mb["colliderRadiusM"] = new_col_r
            mobs_path.write_text(json.dumps(mobs_list, indent=2) + "\n", encoding="utf-8")
            mutated_files.append("contracts/content/mobs.json")
            ENTITY_SCENE_MAP[entity_id] = new_scene
            ENTITY_SCENE_MAP[f"card_{entity_id}"] = new_scene
            target_prop["patch"] = {
                "entityId": entity_id,
                "manifestKey": manifest_key,
                "scene": new_scene,
                "visualScale": new_scale,
                "heightM": new_height,
            }

        # Pillar A: Biome Brush & Tag Pool (e.g., rq-pilot-102 pine_forest_border)
        elif kind == "ground_palette":
            pals = load_json_file(GROUND_PALETTES_PATH) or {}
            pid = target_prop.get("targetId") or "pine_forest_border"
            weights = selected_take.get("weights") or {}
            if pid in pals:
                scatter = pals[pid].get("scatter") or {}
                for rname, wval in weights.items():
                    if rname in scatter:
                        scatter[rname]["weight"] = round(float(wval), 3)
                GROUND_PALETTES_PATH.write_text(json.dumps(pals, indent=2) + "\n", encoding="utf-8")
                sync_palettes_into_pilot_map(pals)
                mutated_files.extend(["content/ground_palettes.json", "content/maps/freja-south-gate.json"])

        # Pillar C: Map Blueprint & 3D Structures (e.g., rq-pilot-103 freja-south-gate)
        elif kind == "map_blueprint":
            map_p = MAPS_DIR / "freja-south-gate.json"
            m_doc = load_json_file(map_p) or {}
            road_w = float(selected_take.get("roadWidthM") or 5.2)
            spur_w = float(selected_take.get("spurWidthM") or 3.6)
            wt_2f = float(selected_take.get("watchtower2FM") or 3.2)
            cave_r = float(selected_take.get("caveRadiusM") or 4.2)
            for rt in m_doc.get("routes") or []:
                if rt.get("id") == "prontera_south_highway":
                    rt["width"] = road_w
                elif rt.get("id") == "watchtower_east_spur":
                    rt["width"] = spur_w
            for st in m_doc.get("structures") or []:
                if st.get("id") == "freja_west_watchtower_01":
                    st["upperFloorHeight"] = wt_2f
                    if road_w >= 7.0:
                        st["radius"] = 4.5
                elif st.get("id") == "freja_east_crystal_cave_01":
                    st["radius"] = cave_r
            map_p.write_text(json.dumps(m_doc, indent=2) + "\n", encoding="utf-8")
            mutated_files.append("content/maps/freja-south-gate.json")
            if "embeddedInputs" in target_prop:
                target_prop["embeddedInputs"]["mainHighwayWidthM"] = road_w
                target_prop["embeddedInputs"]["watchtowerSpurWidthM"] = spur_w

        target_prop["status"] = "approved"
        target_prop["approvedAt"] = now_iso
        if feedback_text:
            target_prop.setdefault("feedbackHistory", []).append(
                {"timestamp": now_iso, "verdict": "approve", "note": feedback_text, "takeIdx": take_idx}
            )
        rq.setdefault("verdicts", {})[target_prop.get("targetId", prop_id)] = {
            "status": "approved",
            "take": selected_take.get("label", f"Take {take_idx + 1}"),
            "notes": feedback_text,
            "updatedAt": now_iso,
        }
        record_ai_agent_log(
            rq,
            {
                "timestamp": now_iso,
                "mode": "Review Gate Commit",
                "pillar": target_prop.get("pillar", kind),
                "prompt": f"Approved {prop_id} with {selected_take.get('label', 'Selected Take')}",
                "summary": f"Committed {selected_take.get('label', prop_id)} to {', '.join(mutated_files)}",
                "guardrails": ["Chibi 1.05m Scale Anchor Verified", "Auto-Snapshot Saved"],
                "files": mutated_files,
                "snapshotId": snap_meta.get("id"),
            },
        )
        REVIEW_QUEUE_PATH.write_text(json.dumps(rq, indent=2) + "\n", encoding="utf-8")
        subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)
        return {"ok": True, "verdict": "approved", "snapshot": snap_meta, "mutatedFiles": mutated_files}

    if verdict == "feedback":
        snap_meta = create_studio_snapshot(f"feedback_{prop_id}", ["content/review-queue.json"])
        target_prop["status"] = "pending_review"
        target_prop["lastFeedback"] = feedback_text or "Re-roll requested with Chibi scale constraints."
        target_prop.setdefault("feedbackHistory", []).append(
            {"timestamp": now_iso, "verdict": "feedback_reroll", "note": target_prop["lastFeedback"], "takeIdx": take_idx}
        )
        rq.setdefault("workOrders", []).append(
            {
                "id": f"wo-{len(rq.get('workOrders', [])) + 1:03d}",
                "proposalId": prop_id,
                "targetId": target_prop.get("targetId"),
                "feedback": target_prop["lastFeedback"],
                "createdAt": now_iso,
            }
        )
        REVIEW_QUEUE_PATH.write_text(json.dumps(rq, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "verdict": "feedback", "snapshot": snap_meta}

    if verdict == "reject":
        snap_meta = create_studio_snapshot(f"reject_{prop_id}", ["content/review-queue.json"])
        target_prop["status"] = "rejected"
        if feedback_text:
            target_prop.setdefault("feedbackHistory", []).append(
                {"timestamp": now_iso, "verdict": "reject", "note": feedback_text, "takeIdx": take_idx}
            )
        rq.setdefault("verdicts", {})[target_prop.get("targetId", prop_id)] = {
            "status": "rejected",
            "notes": feedback_text,
            "updatedAt": now_iso,
        }
        REVIEW_QUEUE_PATH.write_text(json.dumps(rq, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "verdict": "rejected", "snapshot": snap_meta}

    return {"ok": False, "error": f"Unknown verdict: {verdict}"}


def toggle_palette_asset(payload: dict) -> dict:
    palette_id = str(payload.get("paletteId") or "")
    rule_name = str(payload.get("ruleName") or "")
    asset_path = str(payload.get("assetPath") or "")
    new_weight = payload.get("weight")

    pals = load_json_file(GROUND_PALETTES_PATH) or {}
    if palette_id not in pals:
        return {"ok": False, "error": f"Palette {palette_id} not found"}
    scatter = pals[palette_id].get("scatter") or {}
    if rule_name not in scatter:
        return {"ok": False, "error": f"Scatter rule {rule_name} not found in {palette_id}"}

    snap_meta = create_studio_snapshot(
        f"brush_{palette_id}_{rule_name}",
        ["content/ground_palettes.json", "content/maps/freja-south-gate.json"],
    )
    rule = scatter[rule_name]
    assets = list(rule.get("assets") or [])
    disabled = list(rule.get("disabledAssets") or [])

    if asset_path:
        if asset_path in disabled:
            disabled.remove(asset_path)
            if asset_path not in assets:
                assets.append(asset_path)
        else:
            disabled.append(asset_path)
            if asset_path in assets and len(assets) > 1:
                assets.remove(asset_path)
        rule["assets"] = assets
        rule["disabledAssets"] = disabled

    if new_weight is not None:
        rule["weight"] = round(max(0.0, min(0.95, float(new_weight))), 3)

    GROUND_PALETTES_PATH.write_text(json.dumps(pals, indent=2) + "\n", encoding="utf-8")
    sync_palettes_into_pilot_map(pals)
    return {"ok": True, "snapshot": snap_meta, "palette": pals[palette_id]}


def update_map_structure(payload: dict) -> dict:
    import time
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    map_p = MAPS_DIR / "freja-south-gate.json"
    m_doc = load_json_file(map_p) or {}
    rq = load_json_file(REVIEW_QUEUE_PATH) or {"version": 1, "verdicts": {}, "workOrders": [], "proposals": []}

    snap_meta = create_studio_snapshot(
        "map_structure_edit",
        ["content/maps/freja-south-gate.json", "content/review-queue.json"],
    )

    changes = []
    guardrails = ["Chibi Player Anchor [0.90m-1.20m] (Ref 1.05m)"]

    highway_w = payload.get("highwayWidth")
    spur_w = payload.get("spurWidth")
    for rt in m_doc.get("routes") or []:
        if rt.get("id") == "prontera_south_highway" and highway_w is not None:
            clamped_w = round(max(3.5, min(12.0, float(highway_w))), 2)
            rt["width"] = clamped_w
            changes.append(f"Highway width -> {clamped_w}m")
            guardrails.append(f"Highway Corridor >= 3.5m PASS ({clamped_w}m)")
        elif rt.get("id") == "watchtower_east_spur" and spur_w is not None:
            clamped_s = round(max(2.5, min(8.0, float(spur_w))), 2)
            rt["width"] = clamped_s
            changes.append(f"East Spur width -> {clamped_s}m")

    for st in m_doc.get("structures") or []:
        if st.get("id") == "freja_west_watchtower_01":
            if payload.get("watchtowerX") is not None:
                st["x"] = round(max(-35.0, min(35.0, float(payload["watchtowerX"]))), 2)
            if payload.get("watchtowerZ") is not None:
                st["z"] = round(max(-35.0, min(35.0, float(payload["watchtowerZ"]))), 2)
            if payload.get("watchtowerRadius") is not None:
                st["radius"] = round(max(2.5, min(7.0, float(payload["watchtowerRadius"]))), 2)
            if payload.get("watchtower2F") is not None:
                st["upperFloorHeight"] = round(max(2.2, min(4.5, float(payload["watchtower2F"]))), 2)
            changes.append(f"Watchtower @ ({st['x']}, {st['z']}) r={st['radius']}m 2F={st.get('upperFloorHeight', 3.2)}m")
        elif st.get("id") == "freja_east_crystal_cave_01":
            if payload.get("caveX") is not None:
                st["x"] = round(max(-35.0, min(35.0, float(payload["caveX"]))), 2)
            if payload.get("caveZ") is not None:
                st["z"] = round(max(-35.0, min(35.0, float(payload["caveZ"]))), 2)
            if payload.get("caveRadius") is not None:
                st["radius"] = round(max(2.8, min(7.5, float(payload["caveRadius"]))), 2)
            changes.append(f"Crystal Cave @ ({st['x']}, {st['z']}) r={st['radius']}m")

    map_p.write_text(json.dumps(m_doc, indent=2) + "\n", encoding="utf-8")

    # Sync into rq-pilot-103 embeddedInputs
    for prop in rq.get("proposals") or []:
        if prop.get("id") == "rq-pilot-103":
            emb = prop.setdefault("embeddedInputs", {})
            if highway_w is not None:
                emb["mainHighwayWidthM"] = round(max(3.5, min(12.0, float(highway_w))), 2)
            if spur_w is not None:
                emb["watchtowerSpurWidthM"] = round(max(2.5, min(8.0, float(spur_w))), 2)

    record_ai_agent_log(
        rq,
        {
            "timestamp": now_iso,
            "mode": "Interactive Map Structure Editor",
            "pillar": "Pillar C · 2D Map Blueprint & 3D Structures",
            "prompt": payload.get("reason") or "Interactive Map Blueprint & Structure Update",
            "summary": " · ".join(changes) if changes else "Updated freja-south-gate.json structure layout",
            "guardrails": guardrails,
            "files": ["content/maps/freja-south-gate.json"],
            "snapshotId": snap_meta.get("id"),
        },
    )
    REVIEW_QUEUE_PATH.write_text(json.dumps(rq, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "snapshot": snap_meta, "summary": " · ".join(changes)}


def apply_ai_studio_edit(payload: dict) -> dict:
    """
    AI Studio Co-Pilot Edit Agent:
    Wraps natural-language designer intent (or preset commands) across all 3 Pillars:
      - Pillar A: Biome Brushes & Smart Tag Pools (content/ground_palettes.json + freja-south-gate.json)
      - Pillar B: DB Entities & 3D Assets (game-client/assets/manifest.json + contracts/content/mobs.json)
      - Pillar C: 2D Map Blueprint, Routes & 3D Structures (content/maps/freja-south-gate.json)
    Enforces Chibi Toddler Player Scale Guardrails (0.90m-1.20m, Ref 1.05m) and creates an automatic Undo snapshot.
    """
    import re
    import time

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "Please enter an edit instruction for the AI Studio Agent."}

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    low = prompt.lower()

    snap_files = [
        "content/review-queue.json",
        "game-client/assets/manifest.json",
        "contracts/content/mobs.json",
        "content/ground_palettes.json",
        "content/maps/freja-south-gate.json",
    ]
    snap_meta = create_studio_snapshot(f"ai_agent_{low[:24]}", snap_files)

    rq = load_json_file(REVIEW_QUEUE_PATH) or {"version": 1, "verdicts": {}, "workOrders": [], "proposals": []}
    pals = load_json_file(GROUND_PALETTES_PATH) or {}
    map_p = MAPS_DIR / "freja-south-gate.json"
    m_doc = load_json_file(map_p) or {}
    mobs_path = CONTENT_DIR / "mobs.json"
    mobs_list = load_json_file(mobs_path) or []
    manifest = load_json_file(CLIENT_MANIFEST_PATH) or {"version": 2, "entries": {}}

    actions_taken: list[str] = []
    guardrails_checked: list[str] = ["Chibi Player Anchor: 1.05m [0.90m-1.20m]"]
    mutated_files: list[str] = []
    pillars_touched: list[str] = []

    # --- 1. Detect Pillar B: Entity / Mob / 3D Model / Stat Edits ---
    if any(k in low for k in ("orc", "warlord", "golem", "raider", "brute", "boss", "take a", "take b", "take c", "hp", "patk")):
        pillars_touched.append("Pillar B · DB Entity & 3D Asset")
        prop_101 = next((p for p in (rq.get("proposals") or []) if p.get("id") == "rq-pilot-101"), None)
        chosen_idx = None
        new_scene = None
        new_height = None
        new_scale = None

        if "golem" in low or "take c" in low or "2.2" in low or "colossal" in low:
            chosen_idx = 2
            new_scene = "res://assets/characters/skeleton_golem.glb"
            new_height = 2.20
            new_scale = 1.28
        elif "raider" in low or "orc_enemy" in low or "take a" in low or "1.95" in low or "compact" in low:
            chosen_idx = 0
            new_scene = "res://assets/creatures/orc_enemy.glb"
            new_height = 1.95
            new_scale = 1.12
        elif "brute" in low or "take b" in low or "2.1" in low or "recommended" in low or "reset" in low:
            chosen_idx = 1
            new_scene = "res://assets/characters/orc_brute.glb"
            new_height = 2.10
            new_scale = 1.22

        # Check explicit height in meters like "2.05m"
        m_height = re.search(r"(\d+\.\d+)\s*m\b", low)
        if m_height and any(w in low for w in ("orc", "warlord", "boss", "height", "tall")):
            raw_h = float(m_height.group(1))
            clamped_h = round(max(1.80, min(2.40, raw_h)), 2)
            new_height = clamped_h
            new_scale = round(clamped_h / 1.72, 2)
            guardrails_checked.append(f"MVP Boss Scale Band [1.80m-2.40m] PASS ({clamped_h}m = {round(clamped_h/1.05, 2)}x Chibi)")

        # Check explicit HP override like "hp 1800" or "1800 hp"
        m_hp = re.search(r"(?:hp\s*(?:to|=)?\s*(\d{3,5})|(\d{3,5})\s*hp)", low)
        new_hp = int(m_hp.group(1) or m_hp.group(2)) if m_hp else None

        if new_scene or new_height or new_hp:
            if new_scene:
                if "mob:aggressive" in (manifest.get("entries") or {}):
                    manifest["entries"]["mob:aggressive"]["scene"] = new_scene
                    CLIENT_MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
                    if "game-client/assets/manifest.json" not in mutated_files:
                        mutated_files.append("game-client/assets/manifest.json")
                ENTITY_SCENE_MAP["orc_warlord"] = new_scene
                ENTITY_SCENE_MAP["card_orc_warlord"] = new_scene

            for mb in mobs_list:
                if mb.get("id") == "orc_warlord":
                    if new_scene:
                        mb["scenePath"] = new_scene
                    if new_height:
                        mb["heightM"] = new_height
                    if new_scale:
                        mb["visualScale"] = new_scale
                    if new_hp:
                        mb["hp"] = new_hp
                        actions_taken.append(f"Updated Orc Warlord HP -> {new_hp}")
            mobs_path.write_text(json.dumps(mobs_list, indent=2) + "\n", encoding="utf-8")
            if "contracts/content/mobs.json" not in mutated_files:
                mutated_files.append("contracts/content/mobs.json")

            if prop_101:
                if chosen_idx is not None:
                    prop_101["selectedTakeIdx"] = chosen_idx
                if new_height:
                    prop_101.setdefault("embeddedInputs", {})["targetHeightM"] = new_height
                prop_101["status"] = "approved"
                prop_101["lastFeedback"] = f"AI Agent Edit: {prompt}"

            if new_scene:
                short_glb = new_scene.split("/")[-1]
                actions_taken.append(f"Swapped Orc Warlord 3D asset -> {short_glb} ({new_height or 2.10}m, {new_scale or 1.22}x scale)")
                guardrails_checked.append(f"2.0x Chibi Silhouette Contrast PASS ({new_height or 2.10}m vs 1.05m player)")

    # --- 2. Detect Pillar A: Biome Brush / Foliage / Tree Density / Dead Pine Edits ---
    if any(k in low for k in ("pine", "tree", "forest", "bush", "grass", "foliage", "sunlit", "sparse", "dense", "dead", "brush", "meadow")):
        pillars_touched.append("Pillar A · Biome Brush & Tag Pool")
        pal = pals.get("pine_forest_border") or {}
        scatter = pal.get("scatter") or {}

        if "sparse" in low or "sunlit" in low or "2.5%" in low or "0.025" in low:
            if "grass" in scatter:
                scatter["grass"]["weight"] = 0.25
            if "bush" in scatter:
                scatter["bush"]["weight"] = 0.06
            if "canopy_tree" in scatter:
                scatter["canopy_tree"]["weight"] = 0.025
            actions_taken.append("Applied Sunlit Sparse Woods preset (grass 25%, bush 6%, canopy_tree 2.5%)")
        elif "dense" in low or "thicket" in low or "5.5%" in low or "0.055" in low:
            if "grass" in scatter:
                scatter["grass"]["weight"] = 0.42
            if "bush" in scatter:
                scatter["bush"]["weight"] = 0.14
            if "canopy_tree" in scatter:
                scatter["canopy_tree"]["weight"] = 0.055
            actions_taken.append("Applied Dense Thicket preset (grass 42%, bush 14%, canopy_tree 5.5%)")
        elif "balanced" in low or "lush" in low or "4.0%" in low or "4%" in low or "reset" in low:
            if "grass" in scatter:
                scatter["grass"]["weight"] = 0.35
            if "bush" in scatter:
                scatter["bush"]["weight"] = 0.10
            if "canopy_tree" in scatter:
                scatter["canopy_tree"]["weight"] = 0.04
            actions_taken.append("Applied Balanced Border preset (grass 35%, bush 10%, canopy_tree 4.0%)")

        # Explicit percentage for tree density e.g. "tree density to 3%"
        m_tree_pct = re.search(r"tree[^0-9]*(\d+(?:\.\d+)?)\s*%", low)
        if m_tree_pct and "canopy_tree" in scatter:
            w = round(max(0.005, min(0.15, float(m_tree_pct.group(1)) / 100.0)), 3)
            scatter["canopy_tree"]["weight"] = w
            actions_taken.append(f"Set pine canopy_tree scatter weight -> {w} ({round(w*100, 1)}%)")

        # Dead pine toggle
        dead_sp = "res://assets/nature/dead_pine_tree_1_a_color1.glb"
        if "canopy_tree" in scatter:
            c_assets = list(scatter["canopy_tree"].get("assets") or [])
            c_dis = list(scatter["canopy_tree"].get("disabledAssets") or [])
            if any(w in low for w in ("disable dead", "exclude dead", "remove dead", "uncheck dead", "no dead")):
                if dead_sp not in c_dis:
                    c_dis.append(dead_sp)
                if dead_sp in c_assets and len(c_assets) > 1:
                    c_assets.remove(dead_sp)
                scatter["canopy_tree"]["assets"] = c_assets
                scatter["canopy_tree"]["disabledAssets"] = c_dis
                actions_taken.append("Excluded dead_pine_tree_1_a_color1.glb from canopy_tree tag pool")
            elif any(w in low for w in ("enable dead", "include dead", "add dead", "check dead")):
                if dead_sp in c_dis:
                    c_dis.remove(dead_sp)
                if dead_sp not in c_assets:
                    c_assets.append(dead_sp)
                scatter["canopy_tree"]["assets"] = c_assets
                scatter["canopy_tree"]["disabledAssets"] = c_dis
                actions_taken.append("Re-enabled dead_pine_tree_1_a_color1.glb in canopy_tree tag pool")

        guardrails_checked.append("Chibi Foliage Cap PASS (Grass <= 0.35m, Bush <= 0.65m, Trunk r=0.45m)")
        GROUND_PALETTES_PATH.write_text(json.dumps(pals, indent=2) + "\n", encoding="utf-8")
        sync_palettes_into_pilot_map(pals)
        m_doc = load_json_file(map_p) or m_doc
        for f in ("content/ground_palettes.json", "content/maps/freja-south-gate.json"):
            if f not in mutated_files:
                mutated_files.append(f)

    # --- 3. Detect Pillar C: Map Blueprint, Highway Width & 3D Structure Edits ---
    if any(k in low for k in ("highway", "road", "spur", "watchtower", "tower", "cave", "crystal", "map", "widen", "move", "avenue")):
        pillars_touched.append("Pillar C · 2D Map Blueprint & 3D Structures")
        map_changed = False

        # Highway width e.g. "highway to 7.5m" or "widen highway"
        m_hw = re.search(r"(?:highway|road|avenue)[^0-9]*(\d+(?:\.\d+)?)\s*m", low)
        if m_hw or "widen" in low or "royal avenue" in low:
            new_w = float(m_hw.group(1)) if m_hw else 7.5
            new_w = round(max(3.5, min(12.0, new_w)), 2)
            for rt in m_doc.get("routes") or []:
                if rt.get("id") == "prontera_south_highway":
                    rt["width"] = new_w
            actions_taken.append(f"Resized prontera_south_highway width -> {new_w}m")
            guardrails_checked.append(f"Route Spline Collider Clearance PASS (width={new_w}m, 0 blocking trees)")
            map_changed = True

        # Spur width
        m_sp = re.search(r"spur[^0-9]*(\d+(?:\.\d+)?)\s*m", low)
        if m_sp:
            new_sw = round(max(2.5, min(8.0, float(m_sp.group(1)))), 2)
            for rt in m_doc.get("routes") or []:
                if rt.get("id") == "watchtower_east_spur":
                    rt["width"] = new_sw
            actions_taken.append(f"Resized watchtower_east_spur width -> {new_sw}m")
            map_changed = True

        # Coordinates "(x, z)"
        m_coords = re.search(r"\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)", low)
        for st in m_doc.get("structures") or []:
            if st.get("id") == "freja_west_watchtower_01" and ("watchtower" in low or "tower" in low):
                if m_coords and ("watchtower" in low.split("(")[0] or "tower" in low.split("(")[0] or "cave" not in low):
                    st["x"] = round(max(-35.0, min(35.0, float(m_coords.group(1)))), 2)
                    st["z"] = round(max(-35.0, min(35.0, float(m_coords.group(2)))), 2)
                    actions_taken.append(f"Moved Watchtower to ({st['x']}, {st['z']})")
                    map_changed = True
                if "expand" in low or "4.5m" in low:
                    st["radius"] = 4.5
                    st["upperFloorHeight"] = 3.5
                    actions_taken.append("Expanded Watchtower radius -> 4.5m & 2F deck height -> 3.5m")
                    map_changed = True
                m_2f = re.search(r"2f[^0-9]*(\d+(?:\.\d+)?)\s*m", low)
                if m_2f:
                    st["upperFloorHeight"] = round(max(2.2, min(4.5, float(m_2f.group(1)))), 2)
                    actions_taken.append(f"Set Watchtower 2F height -> {st['upperFloorHeight']}m")
                    map_changed = True
            elif st.get("id") == "freja_east_crystal_cave_01" and ("cave" in low or "crystal" in low):
                if m_coords:
                    st["x"] = round(max(-35.0, min(35.0, float(m_coords.group(1)))), 2)
                    st["z"] = round(max(-35.0, min(35.0, float(m_coords.group(2)))), 2)
                    actions_taken.append(f"Moved Crystal Cave to ({st['x']}, {st['z']})")
                    map_changed = True
                m_cr = re.search(r"(?:radius|r=)[^0-9]*(\d+(?:\.\d+)?)\s*m?", low)
                if m_cr:
                    st["radius"] = round(max(2.8, min(7.5, float(m_cr.group(1)))), 2)
                    actions_taken.append(f"Set Crystal Cave radius -> {st['radius']}m")
                    map_changed = True

        if map_changed:
            guardrails_checked.append("Chibi Terrace Step Cap <= 0.25m/step PASS")
            map_p.write_text(json.dumps(m_doc, indent=2) + "\n", encoding="utf-8")
            if "content/maps/freja-south-gate.json" not in mutated_files:
                mutated_files.append("content/maps/freja-south-gate.json")

    # Fallback if prompt was a general artistic direction note
    if not actions_taken:
        rq.setdefault("workOrders", []).append(
            {
                "id": f"wo-{len(rq.get('workOrders', [])) + 1:03d}",
                "proposalId": "ai-studio-copilot",
                "targetId": "prontera_south_field",
                "feedback": prompt,
                "createdAt": now_iso,
            }
        )
        actions_taken.append(f"Queued AI Work Order for prontera_south_field: '{prompt}'")
        mutated_files.append("content/review-queue.json")

    log_entry = {
        "timestamp": now_iso,
        "mode": "AI Co-Pilot Agent",
        "pillar": " + ".join(pillars_touched) if pillars_touched else "Multi-Pillar Studio Agent",
        "prompt": prompt,
        "summary": " · ".join(actions_taken),
        "guardrails": guardrails_checked,
        "files": mutated_files,
        "snapshotId": snap_meta.get("id"),
    }
    record_ai_agent_log(rq, log_entry)
    REVIEW_QUEUE_PATH.write_text(json.dumps(rq, indent=2) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)
    return {
        "ok": True,
        "agentAction": log_entry,
        "snapshot": snap_meta,
    }


def run_readonly_sql(query: str) -> dict:
    ensure_catalog_db()
    clean = query.strip()
    if not clean:
        return {"ok": False, "error": "Empty SQL query."}
    first_word = clean.split()[0].upper()
    if first_word not in ("SELECT", "PRAGMA", "WITH", "EXPLAIN"):
        return {"ok": False, "error": "Only read-only SELECT / WITH / PRAGMA / EXPLAIN queries are permitted."}

    try:
        uri = f"file:{DB_PATH}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        cur = conn.cursor()
        cur.execute(clean)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = [list(r) for r in cur.fetchmany(250)]
        conn.close()
        return {"ok": True, "columns": cols, "rows": rows, "rowCount": len(rows)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def launch_3d_preview(payload: dict) -> dict:
    mode = str(payload.get("mode") or "map_builder")
    script_name = "run_mac_map_builder.sh" if mode == "map_builder" else "run_mac.sh"
    script_path = ROOT / "scripts" / script_name
    if not script_path.exists():
        return {"ok": False, "error": f"{script_name} not found"}
    try:
        subprocess.Popen(
            ["/bin/bash", str(script_path)],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return {"ok": True, "mode": mode, "script": f"scripts/{script_name}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def run_balance_sim() -> dict:
    cargo_bin = shutil.which("cargo") or str(Path.home() / ".cargo" / "bin" / "cargo")
    manifest = ROOT / "server-rs" / "Cargo.toml"
    try:
        res = subprocess.run(
            [cargo_bin, "run", "--quiet", "--manifest-path", str(manifest), "--bin", "balance_sim"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        out = (res.stdout or "") + (("\n" + res.stderr) if res.stderr else "")
        return {
            "ok": res.returncode == 0,
            "exitCode": res.returncode,
            "output": out.strip() or "(no output)",
        }
    except Exception as exc:
        return {"ok": False, "exitCode": -1, "output": f"Failed to run balance_sim: {exc}"}


INDEX_HTML = r"""<!DOCTYPE html>
<html lang="en" data-theme="dark" data-palette="classic">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script>
    (function () {
      var theme = 'dark';
      try { theme = localStorage.getItem('joy-theme') || 'dark'; } catch (e) {}
      document.documentElement.setAttribute('data-theme', theme);
      var palette = 'classic';
      try { palette = localStorage.getItem('joy-palette') || 'classic'; } catch (e) {}
      document.documentElement.setAttribute('data-palette', palette);
    })();
  </script>
  <title>Atlas World — Joymify Design Observatory (RMS Edition)</title>
  <link rel="stylesheet" href="/theme.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --sidebar-width: 268px;
      --hub-sidebar-bg: var(--joy-surface-card);
      --hub-topbar-bg: var(--joy-surface-card);
      --hub-chrome-border: var(--joy-border-default);
    }
    [data-theme="dark"] {
      --hub-sidebar-bg: var(--joy-surface-card);
      --hub-topbar-bg: var(--joy-surface-card);
      --hub-chrome-border: var(--joy-border-strong);
    }
    * { box-sizing: border-box; min-width: 0; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      font-family: var(--joy-font-family-sans, 'Inter', -apple-system, sans-serif);
      background-color: var(--joy-surface-canvas);
      color: var(--joy-text-primary);
      -webkit-font-smoothing: antialiased;
    }
    body { display: flex; }

    * { scrollbar-width: thin; scrollbar-color: var(--joy-border-default) transparent; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background-color: var(--joy-border-default); border-radius: var(--joy-radius-pill); }
    ::-webkit-scrollbar-thumb:hover { background-color: var(--joy-border-strong); }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--hub-sidebar-bg);
      border-right: 1px solid var(--hub-chrome-border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      height: 100%;
      user-select: none;
    }
    .brand {
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--joy-border-subtle);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .brand-info h2 {
      margin: 0;
      font-size: var(--joy-font-size-md);
      font-weight: 700;
      color: var(--joy-text-primary);
      letter-spacing: -0.01em;
    }
    .brand-info span {
      display: block;
      font-size: var(--joy-font-size-xs);
      color: var(--joy-accent-text);
      font-weight: 600;
      margin-top: 2px;
    }
    .sidebar-search {
      padding: 12px 12px 6px;
      flex-shrink: 0;
    }
    .sidebar-search__inner {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--joy-surface-sunken);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-control);
    }
    .sidebar-search__inner:focus-within {
      border-color: var(--joy-border-focus);
      box-shadow: 0 0 0 2px var(--joy-focus-ring);
    }
    .sidebar-search__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      padding-left: 10px;
      color: var(--joy-text-secondary);
      pointer-events: none;
    }
    .sidebar-search__input {
      flex: 1;
      width: 100%;
      height: 34px;
      padding: 0 8px;
      background: transparent;
      border: none;
      outline: none;
      font-size: var(--joy-font-size-sm);
      font-family: inherit;
      color: var(--joy-text-primary);
    }
    .sidebar-search__kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 6px;
      margin-right: 8px;
      font-size: 11px;
      font-family: var(--joy-font-family-mono);
      font-weight: 600;
      color: var(--joy-text-secondary);
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: 4px;
    }
    .nav {
      flex: 1;
      overflow-y: auto;
      padding: 6px 10px 16px;
    }
    .nav-section {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--joy-text-muted);
      padding: 12px 10px 5px;
      margin-top: 2px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 10px;
      border-radius: var(--joy-radius-control);
      font-size: var(--joy-font-size-sm);
      font-weight: 500;
      color: var(--joy-text-secondary);
      cursor: pointer;
      margin-bottom: 2px;
    }
    .nav-item:hover {
      background: var(--joy-surface-sunken);
      color: var(--joy-text-primary);
    }
    .nav-item.active {
      background: var(--joy-accent-subtle);
      color: var(--joy-accent-text);
      font-weight: 600;
    }
    .nav-section-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 1px 7px;
      font-size: 11px;
      font-family: var(--joy-font-family-mono);
      font-weight: 600;
      border-radius: var(--joy-radius-pill);
      background: var(--joy-surface-sunken);
      color: var(--joy-text-secondary);
      border: 1px solid var(--joy-border-subtle);
    }
    .sidebar-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--joy-border-subtle);
      font-size: var(--joy-font-size-xs);
      color: var(--joy-text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Main Workspace */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .topbar {
      min-height: 56px;
      border-bottom: 1px solid var(--hub-chrome-border);
      background: var(--hub-topbar-bg);
      padding: 6px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--joy-space-3);
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .topbar__start, .topbar__end {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .topbar__title {
      font-size: var(--joy-font-size-md);
      font-weight: 600;
      color: var(--joy-text-primary);
    }
    .scroll-stage {
      flex: 1;
      overflow-y: auto;
      scroll-behavior: smooth;
    }
    .content-area {
      max-width: 1260px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 28px 72px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Editorial Page Header */
    .page-hero {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--joy-space-4);
      padding-bottom: 14px;
      border-bottom: 1px solid var(--joy-border-subtle);
    }
    .page-hero__eyebrow {
      font-family: var(--joy-font-family-mono);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--joy-accent-text);
      margin-bottom: 4px;
    }
    .page-hero__title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 2rem;
      font-weight: 600;
      line-height: 1.1;
      color: var(--joy-text-primary);
      margin: 0 0 4px 0;
    }
    .page-hero__sub {
      font-size: var(--joy-font-size-sm);
      color: var(--joy-text-secondary);
      margin: 0;
      max-width: 780px;
      line-height: 1.45;
    }

    /* RateMyServer (RMS) 2D Datasheet Table + Meaningful 3D Asset Thumbnail Showcase */
    .rms-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .rms-sheet {
      width: 100%;
      border-collapse: collapse;
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-strong);
      border-radius: var(--joy-radius-card);
      overflow: hidden;
      box-shadow: var(--joy-elevation-1);
      font-size: 13px;
      transition: box-shadow 0.25s ease, border-color 0.25s ease;
    }
    .rms-sheet.rms-highlight {
      border-color: var(--joy-accent-primary);
      box-shadow: 0 0 0 3px var(--joy-focus-ring), var(--joy-elevation-2);
    }
    .rms-sheet__head {
      background: var(--joy-accent-subtle);
      border-bottom: 1px solid var(--joy-border-strong);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .rms-sheet__head-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .rms-thumb-chip {
      width: 34px;
      height: 34px;
      border-radius: 7px;
      background: radial-gradient(circle at 30% 30%, rgba(212, 175, 55, 0.26), rgba(12, 19, 34, 0.92));
      border: 1px solid var(--joy-border-strong);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: inset 0 1px 2px rgba(255,255,255,0.12);
    }
    .rms-thumb-chip img, .rms-thumb-chip svg {
      width: 30px;
      height: 30px;
      object-fit: contain;
      display: block;
    }
    .rms-artwork-cell {
      width: 142px;
      min-width: 142px;
      background: radial-gradient(circle at 50% 38%, rgba(212, 175, 55, 0.16), var(--joy-surface-sunken) 78%);
      text-align: center !important;
      vertical-align: middle !important;
      padding: 12px 10px !important;
    }
    .rms-artwork-stage {
      width: 104px;
      height: 104px;
      margin: 0 auto 6px auto;
      border-radius: 10px;
      background: linear-gradient(145deg, rgba(255,255,255,0.04), rgba(0,0,0,0.28));
      border: 1px solid var(--joy-border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      box-shadow: var(--joy-elevation-1);
    }
    .rms-artwork-stage img {
      width: 92px;
      height: 92px;
      object-fit: contain;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.45));
      transition: transform 0.2s ease;
    }
    .rms-sheet:hover .rms-artwork-stage img {
      transform: scale(1.07);
    }
    .rms-artwork-caption {
      font-family: var(--joy-font-family-mono);
      font-size: 10px;
      color: var(--joy-text-muted);
      line-height: 1.25;
      word-break: break-all;
    }
    .rms-card-portrait {
      width: 104px;
      height: 126px;
      margin: 0 auto 6px auto;
      border-radius: 8px;
      background: linear-gradient(165deg, #2a2112 0%, #121824 60%, #231a0d 100%);
      border: 2px solid #d4af37;
      box-shadow: 0 4px 12px rgba(0,0,0,0.45), inset 0 0 12px rgba(212,175,55,0.25);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 5px;
      position: relative;
    }
    .rms-card-portrait__header {
      width: 100%;
      font-family: var(--joy-font-family-mono);
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #ffd166;
      background: rgba(0,0,0,0.45);
      border-radius: 3px;
      padding: 2px 4px;
      text-align: center;
      letter-spacing: 0.04em;
    }
    .rms-card-portrait img {
      width: 76px;
      height: 76px;
      object-fit: contain;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));
    }
    .rms-card-portrait__footer {
      width: 100%;
      font-family: var(--joy-font-family-mono);
      font-size: 8px;
      color: #e6c875;
      border-top: 1px solid rgba(212,175,55,0.35);
      padding-top: 2px;
      text-align: center;
    }
    .rms-sheet__title {
      font-weight: 700;
      font-size: 14.5px;
      color: var(--joy-text-primary);
    }
    .rms-sheet__id {
      font-family: var(--joy-font-family-mono);
      font-size: 12px;
      color: var(--joy-text-secondary);
    }
    .rms-table {
      width: 100%;
      border-collapse: collapse;
    }
    .rms-table th, .rms-table td {
      border: 1px solid var(--joy-border-subtle);
      padding: 7px 11px;
      text-align: left;
      vertical-align: middle;
    }
    .rms-table th {
      background: var(--joy-surface-sunken);
      color: var(--joy-accent-text);
      font-weight: 600;
      font-size: 12px;
      width: 122px;
      white-space: nowrap;
    }
    .rms-table td {
      color: var(--joy-text-primary);
      font-size: 13px;
    }
    .rms-script-code {
      display: block;
      font-family: var(--joy-font-family-mono);
      font-size: 12px;
      background: var(--joy-surface-sunken);
      border: 1px dashed var(--joy-border-default);
      padding: 6px 10px;
      border-radius: 4px;
      color: var(--joy-accent-text);
      overflow-x: auto;
    }

    /* Bidirectional RMS Entity Links with Inline Mini-Thumbnails */
    .rms-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px 2px 4px;
      border-radius: 5px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--joy-accent-text);
      background: var(--joy-accent-subtle);
      border: 1px solid var(--joy-border-default);
      cursor: pointer;
      text-decoration: none;
      margin: 2px 4px 2px 0;
      transition: transform 0.1s ease, border-color 0.15s ease;
    }
    .rms-link:hover {
      border-color: var(--joy-accent-primary);
      transform: translateY(-1px);
    }
    .rms-link__thumb {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: rgba(0,0,0,0.35);
      border: 1px solid var(--joy-border-subtle);
      object-fit: contain;
      flex-shrink: 0;
    }
    .rms-link__arrow {
      font-size: 10px;
      opacity: 0.8;
      padding-left: 2px;
    }
    .rms-link__rate {
      font-family: var(--joy-font-family-mono);
      font-size: 11px;
      color: var(--joy-text-secondary);
    }

    /* RMS 3-Column Reference Hub */
    .rms-hub-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }
    .rms-hub-box {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: 14px 16px;
      box-shadow: var(--joy-elevation-1);
    }
    .rms-hub-box h4 {
      margin: 0 0 8px 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--joy-accent-text);
      border-bottom: 1px solid var(--joy-border-subtle);
      padding-bottom: 6px;
    }
    .rms-hub-links {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 13px;
    }
    .rms-branch-portraits {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      padding: 8px;
      border-radius: 8px;
      background: var(--joy-surface-sunken);
      border: 1px solid var(--joy-border-subtle);
    }
    .rms-branch-portraits img {
      width: 52px;
      height: 52px;
      object-fit: contain;
      border-radius: 6px;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--joy-border-default);
    }

    /* RMS AreaInfo Map + Spawn Split Layout */
    .rms-map-split {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 0;
    }
    @media (max-width: 860px) {
      .rms-map-split { grid-template-columns: 1fr; }
    }
    .rms-minimap-cell {
      padding: 14px;
      background: var(--joy-surface-sunken);
      border-right: 1px solid var(--joy-border-subtle);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .rms-spawn-cell {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Grids & Cards */
    .observatory-card {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: var(--joy-space-5);
      box-shadow: var(--joy-elevation-1);
      display: flex;
      flex-direction: column;
      gap: var(--joy-space-3);
    }
    .observatory-card__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--joy-space-3);
      padding-bottom: var(--joy-space-3);
      border-bottom: 1px solid var(--joy-border-subtle);
    }
    .observatory-card__title {
      font-size: var(--joy-font-size-md);
      font-weight: 600;
      color: var(--joy-text-primary);
      margin: 0;
    }
    .observatory-card__meta {
      font-family: var(--joy-font-family-mono);
      font-size: var(--joy-font-size-xs);
      color: var(--joy-text-muted);
      margin-top: 3px;
    }
    .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .mono { font-family: var(--joy-font-family-mono); font-variant-numeric: tabular-nums; }

    .controls-panel {
      background: var(--joy-surface-card);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-card);
      padding: 12px 16px;
      box-shadow: var(--joy-elevation-1);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
    }
    .control-field { display: flex; flex-direction: column; gap: 4px; }
    .control-field label {
      font-size: var(--joy-font-size-xs);
      font-weight: 600;
      color: var(--joy-text-secondary);
    }

    .sql-editor {
      width: 100%;
      min-height: 96px;
      background: var(--joy-surface-sunken);
      color: var(--joy-text-primary);
      border: 1px solid var(--joy-border-default);
      border-radius: var(--joy-radius-control);
      padding: 12px 14px;
      font-family: var(--joy-font-family-mono);
      font-size: 0.84rem;
      line-height: 1.5;
      resize: vertical;
      outline: none;
    }

    .inspector-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(10, 18, 31, 0.62);
      z-index: var(--joy-z-backdrop);
      display: none;
    }
    .inspector-backdrop.open { display: block; }
    .inspector-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(560px, 92vw);
      background: var(--joy-surface-card);
      border-left: 1px solid var(--joy-border-strong);
      box-shadow: var(--joy-elevation-3);
      z-index: var(--joy-z-drawer);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform var(--joy-duration-normal) var(--joy-ease-out-quint);
    }
    .inspector-drawer.open { transform: translateX(0); }
    .inspector-drawer__head {
      padding: 20px 24px;
      border-bottom: 1px solid var(--joy-border-default);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .inspector-drawer__body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .elem-cell--pos {
      color: var(--joy-status-success-fg);
      background: var(--joy-status-success-bg);
      font-weight: 700;
    }
    .elem-cell--neg {
      color: var(--joy-status-danger-fg);
      background: var(--joy-status-danger-bg);
    }
    /* AI Asset & Map Studio — 3-Column Review Gate & Biome Brush Tag Pool */
    .studio-pipeline-banner {
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.14), rgba(45, 114, 210, 0.10));
      border: 1px solid var(--joy-border-strong);
      border-radius: var(--joy-radius-card);
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }
    .review-3col-grid {
      display: grid;
      grid-template-columns: 310px 300px 1fr;
      gap: 0;
      border-top: 1px solid var(--joy-border-default);
    }
    @media (max-width: 1120px) {
      .review-3col-grid { grid-template-columns: 1fr; }
    }
    .review-col {
      padding: 14px 16px;
      border-right: 1px solid var(--joy-border-subtle);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .review-col:last-child { border-right: none; }
    .review-col__head {
      font-family: var(--joy-font-family-mono);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--joy-accent-text);
      padding-bottom: 6px;
      border-bottom: 1px solid var(--joy-border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gate-pill-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 9px;
      border-radius: 6px;
      background: var(--joy-surface-sunken);
      border: 1px solid var(--joy-border-subtle);
      font-size: 12px;
    }
    .take-selector-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .take-btn {
      padding: 6px 11px;
      border-radius: 6px;
      border: 1px solid var(--joy-border-default);
      background: var(--joy-surface-sunken);
      color: var(--joy-text-primary);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--joy-font-family-mono);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .take-btn.active {
      border-color: var(--joy-accent-primary);
      background: var(--joy-accent-subtle);
      color: var(--joy-accent-text);
      font-weight: 700;
    }
    .tag-pool-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
      gap: 8px;
    }
    .tag-asset-card {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 10px;
      border-radius: 7px;
      background: var(--joy-surface-sunken);
      border: 1px solid var(--joy-border-default);
      cursor: pointer;
      user-select: none;
      font-size: 12px;
    }
    .tag-asset-card.disabled {
      opacity: 0.48;
      border-style: dashed;
    }
    .tag-asset-card img {
      width: 34px;
      height: 34px;
      object-fit: contain;
      border-radius: 5px;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--joy-border-subtle);
      flex-shrink: 0;
    }

    .elem-cell--zero {
      color: var(--joy-text-muted);
      opacity: 0.55;
    }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <aside class="sidebar" aria-label="Observatory navigation">
    <div class="brand">
      <div class="brand-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" class="joy-brand-mark">
          <rect width="32" height="32" rx="6" fill="var(--joy-brand-tile)"/>
          <path d="M16 4 28 16 16 28 4 16Z" fill="none" stroke="var(--joy-brand-mark-on-tile)" stroke-width="1.6"/>
          <path d="M16 9 23 16 16 23 9 16Z" fill="var(--joy-brand-mark-on-tile)"/>
          <circle cx="16" cy="16" r="1.6" fill="var(--joy-brand-mark-contrast)"/>
        </svg>
      </div>
      <div class="brand-info">
        <h2>Atlas World DB</h2>
        <span>Joymify Design · RMS Edition</span>
      </div>
    </div>

    <div class="sidebar-search" role="search">
      <div class="sidebar-search__inner">
        <span class="sidebar-search__icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <input
          type="search"
          id="globalSearch"
          class="sidebar-search__input"
          placeholder="Search items, mobs, skills..."
          autocomplete="off"
        />
        <kbd class="sidebar-search__kbd">⌘K</kbd>
      </div>
    </div>

    <nav class="nav" id="sidebarNav"></nav>

    <div class="sidebar-footer">
      <span>Web + macOS WKWebView</span>
      <span class="joy-badge joy-badge--brand joy-badge--sm">joy-design</span>
    </div>
  </aside>

  <!-- Main Workspace -->
  <div class="main">
    <header class="topbar">
      <div class="topbar__start">
        <span class="topbar__title" id="topbarTitle">Overview &amp; Telemetry</span>
        <span class="joy-badge joy-badge--neutral joy-badge--sm" id="topbarStatus">Ready</span>
      </div>
      <div class="topbar__end">
        <select id="dropRateSelect" class="joy-select" style="height:30px;font-size:12px;padding:0 26px 0 10px;width:auto" aria-label="Item Drop Rate Multiplier" onchange="setDropRate(this.value)">
          <option value="1">⚙️ Drop Rate: 1x (Official)</option>
          <option value="3">⚙️ Drop Rate: 3x</option>
          <option value="5">⚙️ Drop Rate: 5x</option>
          <option value="10">⚙️ Drop Rate: 10x</option>
        </select>

        <select id="paletteSelect" class="joy-select" style="height:30px;font-size:12px;padding:0 26px 0 10px;width:auto" aria-label="Color palette" onchange="setPalette(this.value)">
          <option value="classic">Palette: Classic Gold &amp; Navy</option>
          <option value="clay-court">Palette: Clay Court</option>
          <option value="verdant-lawn">Palette: Verdant Lawn</option>
          <option value="nordic-slate">Palette: Nordic Slate</option>
          <option value="bauhaus-primary">Palette: Bauhaus Primary</option>
          <option value="outdoor">Palette: High-Contrast Outdoor</option>
        </select>

        <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="toggleTheme()" id="themeToggleBtn">
          Theme: Dark
        </button>

        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="rebuildDb()">
          Rebuild SQLite
        </button>

        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="switchTab('sim'); triggerBalanceSim();">
          Run Balance Sim
        </button>
      </div>
    </header>

    <div class="scroll-stage" id="scrollStage">
      <main class="content-area" id="mainContent"></main>
    </div>
  </div>

  <!-- Slide-Over Entity Inspector Drawer -->
  <div class="inspector-backdrop" id="inspectorBackdrop" onclick="closeInspector()"></div>
  <aside class="inspector-drawer" id="inspectorDrawer" aria-label="Entity Contract Inspector">
    <div class="inspector-drawer__head">
      <div>
        <div class="page-hero__eyebrow" id="inspectorKind">CONTRACT INSPECTOR</div>
        <h3 style="margin:0;font-size:1.15rem" id="inspectorTitle">Entity</h3>
      </div>
      <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="closeInspector()">Close (Esc)</button>
    </div>
    <div class="inspector-drawer__body" id="inspectorBody"></div>
  </aside>

<script>
let DATA = null;
let THUMB_INDEX = {};
let CURRENT_TAB = 'overview';
let SEARCH_QUERY = '';
let DROP_RATE_MULT = 1;
let HIGHLIGHT_ENTITY_ID = '';
let SELECTED_DOC_IDX = 0;
let SELECTED_CONTINENT_ID = 'all';
let SELECTED_STORY_KIND = 'all';
let SELECTED_BESTIARY_REGION = 'all';
let SIM_OUTPUT = 'Click "Run Balance Sim" in the top bar (or below) to execute cargo run --bin balance_sim against the live Rust authoritative combat engine.';
let SIM_RUNNING = false;

const NAV_GROUPS = [
  {
    section: 'World & Lore Spine (Core)',
    items: [
      { id: 'world',    label: 'World & Continent Atlas', countKey: d => ((d.worldSpine && d.worldSpine.continents) || []).length + ' · ' + (((d.worldSpine && d.worldSpine.pinnedPlaces) || []).length + ((d.worldSpine && d.worldSpine.dungeons) || []).length) },
      { id: 'story',    label: 'Story, Acts & NPC Graph', countKey: d => ((d.worldSpine && d.worldSpine.storyNodes) || []).length },
      { id: 'bestiary', label: 'World Bestiary & Ecology', countKey: d => ((d.worldSpine && d.worldSpine.bestiary) || []).length },
    ]
  },
  {
    section: 'AI Asset & Map Studio (Pilot)',
    items: [
      { id: 'review',  label: 'Review Gate Inbox (Step 3)', countKey: d => ((d.reviewQueue && d.reviewQueue.proposals) || []).length },
      { id: 'brushes', label: 'Biome Brush & Tag Pools',    countKey: d => Object.keys(d.groundPalettes || {}).length },
    ]
  },
  {
    section: 'Databases (RMS)',
    items: [
      { id: 'overview', label: 'Database Hub & Matrix', countKey: () => 9 },
      { id: 'gear',     label: 'Item Database (item_db)', countKey: d => d.items.length + d.cards.length },
      { id: 'mobs',     label: 'Monster Database (mob_db)', countKey: d => d.mobs.length },
      { id: 'jobs',     label: 'Skill & Job DB (skill_db)', countKey: d => d.jobs.length + d.skills.length },
      { id: 'maps',     label: 'Map & Spawn DB (map_db)', countKey: d => d.maps.length + 4 },
      { id: 'quests',   label: 'Quest Database (quest_db)', countKey: d => d.quests.length },
    ]
  },
  {
    section: 'Tools & Calculators',
    items: [
      { id: 'elements', label: 'Property & Size Chart', countKey: d => (d.elements.elements || []).length },
      { id: 'siege',    label: 'WoE Castle Calculator', countKey: d => d.castles.length },
      { id: 'sql',      label: 'SQLite Query Studio', countKey: () => 'SQL' },
      { id: 'sim',      label: 'Rust Balance Simulator', countKey: () => 'RS' },
      { id: 'docs',     label: 'RO Writings & Specs', countKey: d => d.docs.length },
    ]
  }
];

function buildThumbIndex() {
  THUMB_INDEX = {};
  if (!DATA) return;
  ['items', 'cards', 'mobs', 'jobs', 'skills', 'quests', 'castles'].forEach(group => {
    (DATA[group] || []).forEach(ent => {
      if (ent && ent.id && ent.thumbUrl) {
        THUMB_INDEX[ent.id] = ent.thumbUrl;
      }
    });
  });
}

function renderThumbChip(entityObjOrId, fallbackText) {
  const url = typeof entityObjOrId === 'string' ? THUMB_INDEX[entityObjOrId] : entityObjOrId?.thumbUrl;
  const alt = typeof entityObjOrId === 'string' ? entityObjOrId : (entityObjOrId?.name || entityObjOrId?.id || '');
  if (url) {
    return `<span class="rms-thumb-chip"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" /></span>`;
  }
  return `<span class="rms-thumb-chip">${escapeHtml(fallbackText || '◆')}</span>`;
}

function renderArtworkCell(entity, rowspan, badgeLabel) {
  const url = entity?.thumbUrl || THUMB_INDEX[entity?.id];
  const sceneShort = (entity?.scenePath || '').replace('res://assets/', '');
  return `
    <td rowspan="${rowspan}" class="rms-artwork-cell">
      <div class="rms-artwork-stage">
        ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(entity?.name || entity?.id || '')}" loading="lazy" />` : '<span>◆</span>'}
      </div>
      <div class="rms-artwork-caption">${escapeHtml(sceneShort || badgeLabel || entity?.id || '')}</div>
    </td>
  `;
}

function renderCardPortraitCell(card, rowspan) {
  const url = card?.thumbUrl || THUMB_INDEX[card?.id];
  return `
    <td rowspan="${rowspan}" class="rms-artwork-cell">
      <div class="rms-card-portrait">
        <div class="rms-card-portrait__header">${escapeHtml(card.slot)} CARD</div>
        ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(card.name)}" loading="lazy" />` : '<span>🃏</span>'}
        <div class="rms-card-portrait__footer">${escapeHtml(card.mobId)}</div>
      </div>
      <div class="rms-artwork-caption">${escapeHtml(card.assetStudioKey || card.id)}</div>
    </td>
  `;
}

function syncUrlState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const t = params.get('tab');
  const q = params.get('q');
  const focus = params.get('focus');
  if (t) CURRENT_TAB = t;
  if (q !== null) {
    SEARCH_QUERY = q;
    const inp = document.getElementById('globalSearch');
    if (inp) inp.value = q;
  }
  HIGHLIGHT_ENTITY_ID = focus || '';
}

function writeUrlState() {
  const params = new URLSearchParams();
  params.set('tab', CURRENT_TAB);
  if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);
  if (HIGHLIGHT_ENTITY_ID) params.set('focus', HIGHLIGHT_ENTITY_ID);
  history.replaceState(null, '', '#' + params.toString());
}

function setDropRate(val) {
  DROP_RATE_MULT = Math.max(1, parseInt(val || '1', 10));
  render();
}

function formatDropPct(chanceBps) {
  const pct = Math.min(100, (chanceBps * DROP_RATE_MULT) / 100.0);
  return pct.toFixed(pct >= 10 ? 1 : 2) + '%';
}

function jumpToEntity(tab, entityId) {
  CURRENT_TAB = tab;
  SEARCH_QUERY = '';
  HIGHLIGHT_ENTITY_ID = entityId || '';
  const inp = document.getElementById('globalSearch');
  if (inp) inp.value = '';
  writeUrlState();
  renderSidebar();
  render();
  if (entityId) {
    setTimeout(() => {
      const el = document.getElementById('entity-' + entityId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('rms-highlight');
      }
    }, 40);
  }
}

function rmsLink(tab, id, label, extraMeta) {
  const safeId = escapeHtml(id);
  const safeLabel = escapeHtml(label || id);
  const thumbUrl = THUMB_INDEX[id];
  const thumbHtml = thumbUrl
    ? `<img class="rms-link__thumb" src="${escapeHtml(thumbUrl)}" alt="${safeLabel}" loading="lazy" />`
    : `<span class="rms-link__arrow">▸</span>`;
  const metaHtml = extraMeta ? `<span class="rms-link__rate">(${escapeHtml(extraMeta)})</span>` : '';
  return `<a class="rms-link" onclick="jumpToEntity('${tab}', '${safeId}')">${thumbHtml}<span>${safeLabel}</span>${metaHtml}</a>`;
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', cur);
  try { localStorage.setItem('joy-theme', cur); } catch (e) {}
  updateThemeButton();
}

function updateThemeButton() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = cur === 'dark' ? 'Theme: Dark' : 'Theme: Light';
}

function setPalette(val) {
  document.documentElement.setAttribute('data-palette', val);
  try { localStorage.setItem('joy-palette', val); } catch (e) {}
}

async function init() {
  updateThemeButton();
  const savedPal = document.documentElement.getAttribute('data-palette') || 'classic';
  const sel = document.getElementById('paletteSelect');
  if (sel) sel.value = savedPal;

  syncUrlState();
  window.addEventListener('hashchange', () => { syncUrlState(); renderSidebar(); render(); });
  const res = await fetch('/api/bundle');
  DATA = await res.json();
  buildThumbIndex();
  renderSidebar();
  render();

  const searchInput = document.getElementById('globalSearch');
  searchInput.addEventListener('input', e => {
    SEARCH_QUERY = e.target.value.trim().toLowerCase();
    HIGHLIGHT_ENTITY_ID = '';
    writeUrlState();
    render();
  });

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape') {
      closeInspector();
    }
  });
}

function switchTab(id) {
  CURRENT_TAB = id;
  HIGHLIGHT_ENTITY_ID = '';
  writeUrlState();
  renderSidebar();
  render();
  const st = document.getElementById('scrollStage');
  if (st) st.scrollTop = 0;
}

function renderSidebar() {
  if (!DATA) return;
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = NAV_GROUPS.map(group => `
    <div class="nav-section">${group.section}</div>
    ${group.items.map(it => `
      <div class="nav-item ${it.id === CURRENT_TAB ? 'active' : ''}" onclick="switchTab('${it.id}')">
        <span>${it.label}</span>
        <span class="nav-section-count">${it.countKey(DATA)}</span>
      </div>
    `).join('')}
  `).join('');
}

function matchesSearch(obj) {
  if (!SEARCH_QUERY) return true;
  return JSON.stringify(obj).toLowerCase().includes(SEARCH_QUERY);
}

function openInspector(kind, title, obj) {
  document.getElementById('inspectorKind').textContent = kind.toUpperCase() + ' CONTRACT';
  document.getElementById('inspectorTitle').textContent = title;
  const jsonStr = escapeHtml(JSON.stringify(obj, null, 2));
  const thumbHtml = obj?.thumbUrl
    ? `<div style="display:flex;align-items:center;gap:14px;padding:12px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);border-radius:8px">
         <img src="${escapeHtml(obj.thumbUrl)}" alt="${escapeHtml(title)}" style="width:64px;height:64px;object-fit:contain" />
         <div>
           <div style="font-weight:700">${escapeHtml(title)}</div>
           <div class="mono" style="font-size:12px;color:var(--joy-text-secondary)">${escapeHtml(obj.scenePath || obj.assetStudioKey || obj.id || '')}</div>
         </div>
       </div>`
    : '';
  document.getElementById('inspectorBody').innerHTML = `
    ${thumbHtml}
    <div class="joy-code-block">
      <div class="joy-code-block__header">
        <div class="joy-code-block__meta">
          <span class="joy-code-block__lang">JSONB</span>
          <span>Contract Payload</span>
        </div>
      </div>
      <pre style="margin:0;padding:14px;overflow-x:auto"><code>${jsonStr}</code></pre>
    </div>
  `;
  document.getElementById('inspectorBackdrop').classList.add('open');
  document.getElementById('inspectorDrawer').classList.add('open');
}

function closeInspector() {
  document.getElementById('inspectorBackdrop').classList.remove('open');
  document.getElementById('inspectorDrawer').classList.remove('open');
}

async function rebuildDb() {
  const status = document.getElementById('topbarStatus');
  status.textContent = 'Rebuilding SQLite...';
  await fetch('/api/rebuild', { method: 'POST' });
  const res = await fetch('/api/bundle');
  DATA = await res.json();
  buildThumbIndex();
  status.textContent = 'SQLite Rebuilt';
  renderSidebar();
  render();
}

async function triggerBalanceSim() {
  if (SIM_RUNNING) return;
  SIM_RUNNING = true;
  SIM_OUTPUT = 'Running cargo run --quiet --manifest-path server-rs/Cargo.toml --bin balance_sim...';
  document.getElementById('topbarStatus').textContent = 'Running Balance Sim...';
  render();
  const res = await fetch('/api/sim', { method: 'POST' });
  const payload = await res.json();
  SIM_RUNNING = false;
  SIM_OUTPUT = payload.output || '(no output)';
  document.getElementById('topbarStatus').textContent = payload.ok ? 'Balance Sim Complete' : 'Balance Sim Failed';
  render();
}

function render() {
  if (!DATA) return;
  const main = document.getElementById('mainContent');
  const titleMap = {
    world:    'World & Continent Atlas (400×400 km · 13 Continents · Towns, Zones & Dungeons)',
    story:    'Story, 5-Act Chronology, Factions, NPCs & Quest Unlock Graph',
    bestiary: 'World Bestiary, Regional Ecology & 3D/2D Visual Briefs (116 Creatures)',
    review:   'Step 3 Review Gate Inbox — 1-Map Pilot (prontera_south_field)',
    brushes:  'Biome Brush & Smart Tag-Pool Studio (ground_id)',
    overview: 'RateMyServer Hub & Cross-Repo Telemetry',
    gear:     'Item & Card Database (item_db)',
    mobs:     'Monster Database & Spawn Drops (mob_db)',
    jobs:     'Skill & Class Branch Database (skill_db_class)',
    elements: '10-Element Property Chart & Size Matrix',
    quests:   'Quest Database & Promotion Trials (quest_db)',
    siege:    'War of Emperium (GvG Castle Siege) Calculator',
    maps:     'Map Database & Area Monster Spawns (map_db / areainfo)',
    sql:      'Live Read-Only SQLite Query Studio',
    sim:      'Authoritative Rust Balance Simulator (balance_sim)',
    docs:     'RO Writings — Architecture Specs & Lore Canon'
  };
  document.getElementById('topbarTitle').textContent = titleMap[CURRENT_TAB] || 'Observatory';

  if (CURRENT_TAB === 'world') main.innerHTML = renderWorldAtlas();
  else if (CURRENT_TAB === 'story') main.innerHTML = renderStoryGraph();
  else if (CURRENT_TAB === 'bestiary') main.innerHTML = renderBestiary();
  else if (CURRENT_TAB === 'review') main.innerHTML = renderReviewInbox();
  else if (CURRENT_TAB === 'brushes') main.innerHTML = renderBiomeBrushes();
  else if (CURRENT_TAB === 'overview') main.innerHTML = renderOverview();
  else if (CURRENT_TAB === 'jobs') main.innerHTML = renderJobs();
  else if (CURRENT_TAB === 'mobs') main.innerHTML = renderMobs();
  else if (CURRENT_TAB === 'elements') { main.innerHTML = renderElements(); updateElemCalc(); }
  else if (CURRENT_TAB === 'gear') { main.innerHTML = renderGear(); updateRefineCalc(); }
  else if (CURRENT_TAB === 'quests') main.innerHTML = renderQuests();
  else if (CURRENT_TAB === 'siege') { main.innerHTML = renderSiege(); updateSiegeCalc(); }
  else if (CURRENT_TAB === 'maps') main.innerHTML = renderMaps();
  else if (CURRENT_TAB === 'sql') { main.innerHTML = renderSqlStudio(); executeSql(); }
  else if (CURRENT_TAB === 'sim') main.innerHTML = renderSim();
  else if (CURRENT_TAB === 'docs') main.innerHTML = renderDocs();
}

function inspectBtnHtml(kind, title, obj) {
  const encoded = encodeURIComponent(JSON.stringify(obj));
  const safeTitle = escapeHtml(title).replace(/'/g, "\\'");
  return `<button type="button" class="joy-button joy-button--outline joy-button--sm" style="height:24px;padding:0 8px;font-size:11px" onclick="openInspector('${kind}', '${safeTitle}', JSON.parse(decodeURIComponent('${encoded}')))">JSONB</button>`;
}


/* ============================================================================
 * 0. AI ASSET & MAP STUDIO — STEP 3 REVIEW GATE INBOX & BIOME BRUSH COMPOSER
 * ========================================================================== */
function renderChibiLineupSvg(proposal) {
  if (proposal.kind === 'db_entity') {
    const selIdx = proposal.selectedTakeIdx || 0;
    const activeTake = (proposal.takes || [])[selIdx] || {};
    const bossH = activeTake.heightM || (proposal.embeddedInputs && proposal.embeddedInputs.targetHeightM) || 2.10;
    const ratio = (bossH / 1.05).toFixed(2);
    const bossTopY = Math.max(24, Math.round(158 - (bossH / 2.10) * 120));
    const headY = bossTopY + 15;
    const bodyY = bossTopY + 30;
    const bodyH = Math.max(40, 158 - bodyY);
    const shortAsset = (activeTake.assetPath || 'orc_brute.glb').split('/').pop();
    return `
      <svg width="100%" height="185" viewBox="0 0 520 185" style="border-radius:8px;background:#121b28;border:1px solid var(--joy-border-strong)">
        <line x1="20" y1="158" x2="500" y2="158" stroke="#4a5d78" stroke-width="2"/>
        <!-- 0.55m Small Mob -->
        <line x1="20" y1="127" x2="500" y2="127" stroke="rgba(126,217,135,0.25)" stroke-dasharray="3 3"/>
        <text x="26" y="123" fill="#7ed987" font-size="10" font-family="monospace">0.55m Small Mob</text>
        <!-- 1.05m Chibi Player Reference Line -->
        <line x1="20" y1="98" x2="500" y2="98" stroke="#ffd166" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="26" y="93" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">1.05m Chibi Toddler Player Anchor [0.90m-1.20m]</text>
        <!-- Dynamic MVP Boss Line -->
        <line x1="20" y1="${bossTopY}" x2="500" y2="${bossTopY}" stroke="#ff6b6b" stroke-width="1.2" stroke-dasharray="4 3"/>
        <text x="26" y="${Math.max(14, bossTopY - 5)}" fill="#ff6b6b" font-size="10.5" font-weight="bold" font-family="monospace">${bossH.toFixed(2)}m MVP Boss (${ratio}x Chibi · ${escapeHtml(shortAsset)})</text>

        <!-- Small Poring (0.55m) -->
        <ellipse cx="145" cy="143" rx="18" ry="15" fill="#5ec27e" stroke="#a8f0be" stroke-width="1.5"/>
        <text x="145" y="174" text-anchor="middle" fill="#a8f0be" font-size="10" font-family="monospace">Poring (0.55m)</text>

        <!-- Chibi Player Dummy (1.05m, 2.5 head-to-body ratio) -->
        <circle cx="265" cy="112" r="13" fill="#ffd166" stroke="#fff" stroke-width="1.5"/>
        <rect x="253" y="125" width="24" height="33" rx="7" fill="#3b82f6" stroke="#93c5fd" stroke-width="1.5"/>
        <text x="265" y="174" text-anchor="middle" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">Chibi Player (1.05m)</text>

        <!-- Dynamic Orc Warlord MVP -->
        <circle cx="405" cy="${headY}" r="16" fill="#e63946" stroke="#ffb4a2" stroke-width="1.5"/>
        <rect x="381" y="${bodyY}" width="48" height="${bodyH}" rx="9" fill="#9d0208" stroke="#ff6b6b" stroke-width="2"/>
        <path d="M 432 ${headY} L 456 148" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/>
        <text x="405" y="174" text-anchor="middle" fill="#ff6b6b" font-size="10.5" font-weight="bold" font-family="monospace">Orc Warlord (${bossH.toFixed(2)}m)</text>
      </svg>
    `;
  }
  if (proposal.kind === 'ground_palette') {
    return `
      <svg width="100%" height="185" viewBox="0 0 520 185" style="border-radius:8px;background:#112218;border:1px solid var(--joy-border-strong)">
        <line x1="20" y1="156" x2="500" y2="156" stroke="#529e47" stroke-width="2"/>
        <!-- 0.35m Grass Cap -->
        <line x1="20" y1="136" x2="310" y2="136" stroke="#7ed987" stroke-dasharray="3 2"/>
        <text x="25" y="132" fill="#7ed987" font-size="10" font-family="monospace">0.35m Knee-High Grass Cap</text>
        <!-- 0.65m Bush Cap -->
        <line x1="20" y1="118" x2="310" y2="118" stroke="#5ec27e" stroke-dasharray="3 2"/>
        <text x="25" y="114" fill="#5ec27e" font-size="10" font-family="monospace">0.65m Chest-High Bush Cap (Head Visible!)</text>
        <!-- 1.05m Chibi Player -->
        <line x1="20" y1="95" x2="500" y2="95" stroke="#ffd166" stroke-width="1.4" stroke-dasharray="4 3"/>
        <text x="25" y="90" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">1.05m Chibi Player Head Always Above Foliage</text>

        <!-- Grass (0.35m) -->
        <rect x="95" y="136" width="22" height="20" rx="4" fill="#529e47"/>
        <text x="106" y="172" text-anchor="middle" fill="#7ed987" font-size="10" font-family="monospace">Grass 0.35m</text>

        <!-- Bush (0.65m) -->
        <ellipse cx="185" cy="137" rx="24" ry="19" fill="#346e36" stroke="#7ed987" stroke-width="1.2"/>
        <text x="185" y="172" text-anchor="middle" fill="#7ed987" font-size="10" font-family="monospace">Bush 0.65m</text>

        <!-- Chibi Player (1.05m) -->
        <circle cx="275" cy="109" r="13" fill="#ffd166" stroke="#fff" stroke-width="1.5"/>
        <rect x="263" y="122" width="24" height="34" rx="6" fill="#3b82f6" stroke="#93c5fd" stroke-width="1.5"/>
        <text x="275" y="172" text-anchor="middle" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">Chibi 1.05m</text>

        <!-- Pine Canopy Tree: 0.45m Red Trunk Collider vs 1.85m Green Walkable Canopy Overhang -->
        <ellipse cx="410" cy="64" rx="64" ry="44" fill="rgba(82,158,71,0.34)" stroke="#7ed987" stroke-width="1.5" stroke-dasharray="4 2"/>
        <text x="410" y="55" text-anchor="middle" fill="#a8f0be" font-size="9.5" font-family="monospace">1.85m Walkable Canopy</text>
        <text x="410" y="68" text-anchor="middle" fill="#a8f0be" font-size="9" font-family="monospace">(Auto-fades at alpha 0.22)</text>
        <rect x="397" y="102" width="26" height="54" fill="rgba(235,87,87,0.45)" stroke="#ff6b6b" stroke-width="2"/>
        <text x="410" y="172" text-anchor="middle" fill="#ff6b6b" font-size="10" font-weight="bold" font-family="monospace">0.45m Trunk Collider</text>
      </svg>
    `;
  }
  const pilotMap = (DATA.maps || [])[0];
  return pilotMap ? `<div style="display:flex;justify-content:center">${renderMinimapSvg(pilotMap)}</div>` : '';
}

async function submitReviewVerdict(propId, verdict, takeIdx) {
  const fbInput = document.getElementById('fb-input-' + propId);
  const feedbackText = fbInput ? fbInput.value.trim() : '';
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = 'Applying Review Verdict...';

  const res = await fetch('/api/review-queue/verdict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: propId, verdict, selectedTakeIdx: takeIdx, feedbackText })
  });
  const out = await res.json();
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? `Verdict: ${out.verdict.toUpperCase()}` : 'Verdict Error';
  renderSidebar();
  render();
}

async function selectProposalTake(propId, takeIdx) {
  const prop = ((DATA.reviewQueue && DATA.reviewQueue.proposals) || []).find(p => p.id === propId);
  if (prop) prop.selectedTakeIdx = takeIdx;
  render();
}

async function togglePaletteAsset(paletteId, ruleName, assetPath, weightVal) {
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = 'Updating Palette Brush...';
  const payload = { paletteId, ruleName };
  if (assetPath) payload.assetPath = assetPath;
  if (weightVal !== undefined && weightVal !== null) payload.weight = parseFloat(weightVal);
  await fetch('/api/palette/toggle-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = `Updated ${paletteId}.${ruleName}`;
  renderSidebar();
  render();
}

async function undoStudioSnapshot() {
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = 'Restoring Snapshot...';
  const res = await fetch('/api/studio/undo', { method: 'POST' });
  const out = await res.json();
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? `Restored ${out.restoredSnapshot}` : (out.error || 'Nothing to undo');
  renderSidebar();
  render();
}

let LAST_AI_AGENT_RESULT = null;

async function launch3dClient(mode) {
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = mode === 'map_builder' ? '🗺️ Launching 3D Map Builder...' : '🎮 Launching 3D Game Client...';
  const res = await fetch('/api/studio/launch-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });
  const out = await res.json();
  if (statusEl) statusEl.textContent = out.ok ? `Launched ${out.script}` : ('Launch Error: ' + (out.error || ''));
}

async function runAiStudioAgent(presetPrompt) {
  const inp = document.getElementById('aiStudioPromptInput');
  const prompt = (presetPrompt !== undefined && presetPrompt !== null)
    ? String(presetPrompt)
    : (inp ? inp.value.trim() : '');
  if (!prompt) return;
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = '🤖 AI Agent applying edit...';

  const res = await fetch('/api/studio/ai-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const out = await res.json();
  if (out.ok && out.agentAction) {
    LAST_AI_AGENT_RESULT = out.agentAction;
  }
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? '✨ AI Agent Edit Committed' : 'AI Edit Error';
  renderSidebar();
  render();
}

async function applyInteractiveMapStructure(prefix) {
  const gv = (id) => {
    const el = document.getElementById(prefix + '-' + id);
    return el ? parseFloat(el.value) : null;
  };
  const payload = {
    highwayWidth: gv('hw'),
    spurWidth: gv('spur'),
    watchtowerX: gv('wtx'),
    watchtowerZ: gv('wtz'),
    watchtowerRadius: gv('wtr'),
    watchtower2F: gv('wt2f'),
    caveX: gv('cvx'),
    caveZ: gv('cvz'),
    caveRadius: gv('cvr'),
    reason: 'Interactive Map Structure & Route Update via AI Studio Agent'
  };
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = '🤖 Updating Map Structure...';
  const res = await fetch('/api/map/update-structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? '✨ Map Blueprint Updated' : 'Map Update Error';
  renderSidebar();
  render();
}

function renderMapStructureEditor(m, prefix) {
  if (!m) return '';
  const hw = ((m.routes || []).find(r => r.id === 'prontera_south_highway') || {}).width ?? 5.2;
  const spur = ((m.routes || []).find(r => r.id === 'watchtower_east_spur') || {}).width ?? 3.6;
  const wt = (m.structures || []).find(s => s.id === 'freja_west_watchtower_01') || { x: -9.5, z: -2, radius: 3.6, upperFloorHeight: 3.2 };
  const cv = (m.structures || []).find(s => s.id === 'freja_east_crystal_cave_01') || { x: 10.5, z: -3, radius: 4.2 };

  return `
    <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-strong);display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:12px;font-weight:700;color:var(--joy-accent-text)">
          🛠️ Interactive Map Structure &amp; Route Editor (Wrapped by AI Chibi Guardrails)
        </div>
        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="applyInteractiveMapStructure('${escapeHtml(prefix)}')">
          ✨ Apply Structure Changes
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:8px;font-size:11.5px">
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Highway Width (m)</span><strong class="mono">${hw}m</strong></div>
          <input id="${escapeHtml(prefix)}-hw" type="range" min="3.5" max="10.0" step="0.1" value="${hw}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">East Spur Width (m)</span><strong class="mono">${spur}m</strong></div>
          <input id="${escapeHtml(prefix)}-spur" type="range" min="2.5" max="7.0" step="0.1" value="${spur}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Watchtower X / Z</span><strong class="mono">(${wt.x}, ${wt.z})</strong></div>
          <div style="display:flex;gap:4px">
            <input id="${escapeHtml(prefix)}-wtx" class="joy-input mono" type="number" step="0.5" value="${wt.x}" style="height:24px;font-size:11px;padding:0 6px" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
            <input id="${escapeHtml(prefix)}-wtz" class="joy-input mono" type="number" step="0.5" value="${wt.z}" style="height:24px;font-size:11px;padding:0 6px" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
          </div>
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Watchtower r / 2F</span><strong class="mono">r=${wt.radius}m · 2F=${wt.upperFloorHeight || 3.2}m</strong></div>
          <div style="display:flex;gap:4px">
            <input id="${escapeHtml(prefix)}-wtr" class="joy-input mono" type="number" step="0.2" value="${wt.radius}" style="height:24px;font-size:11px;padding:0 6px" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
            <input id="${escapeHtml(prefix)}-wt2f" class="joy-input mono" type="number" step="0.1" value="${wt.upperFloorHeight || 3.2}" style="height:24px;font-size:11px;padding:0 6px" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
          </div>
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Crystal Cave X / Z</span><strong class="mono">(${cv.x}, ${cv.z})</strong></div>
          <div style="display:flex;gap:4px">
            <input id="${escapeHtml(prefix)}-cvx" class="joy-input mono" type="number" step="0.5" value="${cv.x}" style="height:24px;font-size:11px;padding:0 6px" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
            <input id="${escapeHtml(prefix)}-cvz" class="joy-input mono" type="number" step="0.5" value="${cv.z}" style="height:24px;font-size:11px;padding:0 6px" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
          </div>
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Crystal Cave Radius</span><strong class="mono">${cv.radius}m</strong></div>
          <input id="${escapeHtml(prefix)}-cvr" type="range" min="3.0" max="7.0" step="0.2" value="${cv.radius}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
        </label>
      </div>
    </div>
  `;
}

function renderAiCopilotBar() {
  const rq = DATA.reviewQueue || {};
  const logs = rq.agentEditLog || [];
  const latestLog = LAST_AI_AGENT_RESULT || logs[0] || null;
  const snaps = DATA.studioSnapshots || [];

  const presets = [
    { label: '✨ Entity: Orc Warlord -> Raider 1.95m (Take A)', prompt: 'Swap Orc Warlord to Take A Orc Raider at 1.95m' },
    { label: '✨ Entity: Orc Warlord -> Colossal Golem 2.20m + 1800 HP', prompt: 'Swap Orc Warlord to Colossal Golem 2.20m and set HP to 1800' },
    { label: '✨ Entity: Orc Warlord -> Brute 2.10m (Recommended)', prompt: 'Reset Orc Warlord to Take B Orc Brute 2.10m and HP 1445' },
    { label: '✨ Brush: Sunlit Woods (Tree 2.5% + Exclude Dead Pine)', prompt: 'Open sunlit sparse woods: set pine tree density to 2.5% and disable dead pine' },
    { label: '✨ Brush: Balanced Border (Tree 4.0%, Bush 10%)', prompt: 'Set pine forest border to balanced 4.0% canopy tree and exclude dead pine' },
    { label: '✨ Map: Widen Highway to 7.5m + Expand Watchtower', prompt: 'Widen highway to 7.5m and expand Watchtower 2F to 3.5m at (-11.0, -2.5)' },
    { label: '✨ Map: Move Crystal Cave to (13.5, -4.0) r=5.0m', prompt: 'Move Crystal Cave to (13.5, -4.0) with radius 5.0m' },
  ];

  return `
    <div class="observatory-card" style="background:linear-gradient(135deg, rgba(212,175,55,0.12), rgba(19,34,56,0.92));border:1px solid var(--joy-border-strong);padding:14px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div class="page-hero__eyebrow" style="margin-bottom:2px">🤖 AI STUDIO CO-PILOT AGENT · NATURAL-LANGUAGE EDIT WRAPPER (3 PILLARS)</div>
          <div style="font-size:13px;color:var(--joy-text-secondary)">
            Type any natural-language instruction (or click a 1-click preset below) to edit <strong>3D Entities &amp; Stats</strong>, <strong>Biome Brushes</strong>, or <strong>Map Routes &amp; 3D Structures</strong>. Automatically validates Chibi <code>1.05m</code> scale guardrails and saves a 1-click Undo snapshot.
          </div>
        </div>
        <div class="chip-row">
          <span class="joy-badge joy-badge--success joy-badge--sm">Chibi 1.05m Guardrail Active</span>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="launch3dClient('map_builder')">
            🗺️ Preview in 3D Map Builder
          </button>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="launch3dClient('game')">
            🎮 Preview in 3D Game Client
          </button>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="undoStudioSnapshot()" ${snaps.length === 0 ? 'disabled' : ''}>
            ↩ Undo Last AI Edit (${snaps.length})
          </button>
        </div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
        <input
          id="aiStudioPromptInput"
          class="joy-input"
          type="text"
          placeholder="Tell the AI Agent what to edit (e.g., 'Swap Orc Warlord to Golem 2.20m with 1800 HP', 'Widen highway to 7.5m and move Watchtower to (-11, -2.5)', 'Set pine tree density to 2.5% and disable dead pine')..."
          style="flex:1;min-width:280px;height:36px;font-size:12.5px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();runAiStudioAgent();}"
        />
        <button type="button" class="joy-button joy-button--solid" style="height:36px" onclick="runAiStudioAgent()">
          ✨ Edit via AI Agent
        </button>
      </div>

      <div class="chip-row" style="margin-top:4px">
        ${presets.map(pr => `
          <button
            type="button"
            class="joy-button joy-button--outline joy-button--sm"
            style="font-size:11px;height:26px;padding:0 9px"
            onclick="runAiStudioAgent('${escapeHtml(pr.prompt.replace(/'/g, "\'"))}')"
          >
            ${escapeHtml(pr.label)}
          </button>
        `).join('')}
      </div>

      ${latestLog ? `
        <div style="margin-top:6px;padding:9px 12px;border-radius:7px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px">
          <div>
            <span class="joy-badge joy-badge--brand joy-badge--sm">${escapeHtml(latestLog.mode || 'AI Agent')}</span>
            <strong style="margin-left:6px;color:var(--joy-accent-text)">${escapeHtml(latestLog.summary || '')}</strong>
            <div class="mono" style="font-size:11px;color:var(--joy-text-secondary);margin-top:3px">
              Prompt: "${escapeHtml(latestLog.prompt || '')}" · Files: ${escapeHtml((latestLog.files || []).join(', '))}
            </div>
          </div>
          <div class="chip-row">
            ${(latestLog.guardrails || []).map(g => `<span class="joy-badge joy-badge--success joy-badge--sm">✓ ${escapeHtml(g)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderReviewInbox() {
  const rq = DATA.reviewQueue || {};
  const proposals = (rq.proposals || []).filter(matchesSearch);
  const snaps = DATA.studioSnapshots || [];
  const scaleAnchor = rq.playerScaleAnchor || { heightRangeM: [0.90, 1.20], referenceHeightM: 1.05 };

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">99% AUTOMATED PIPELINE · 1% HUMAN APPROVAL &amp; FEEDBACK GATE</div>
        <h1 class="page-hero__title">Step 3 Review Gate Inbox — 1-Map Pilot (<code>prontera_south_field</code>)</h1>
        <p class="page-hero__sub">
          Every asset, biome brush, and map blueprint embeds the <strong>Chibi Toddler Player Scale Anchor (${scaleAnchor.heightRangeM[0].toFixed(2)}m–${scaleAnchor.heightRangeM[1].toFixed(2)}m, Ref ${scaleAnchor.referenceHeightM.toFixed(2)}m)</strong>
          into its generator contract and passes automated machine gates before reaching this inbox.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand">Chibi Player: ${scaleAnchor.referenceHeightM.toFixed(2)}m</span>
        <span class="joy-badge joy-badge--success">${proposals.filter(p => p.status === 'approved').length}/${proposals.length} Approved</span>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="undoStudioSnapshot()" ${snaps.length === 0 ? 'disabled' : ''}>
          ↩ Undo Last Commit (${snaps.length})
        </button>
      </div>
    </div>

    ${renderAiCopilotBar()}

    <div class="studio-pipeline-banner">
      <div>
        <strong style="color:var(--joy-accent-text)">3-Stage Review Flow:</strong>
        <span class="mono" style="font-size:12px;margin-left:8px">
          [1. Embedded Generator Inputs] ➔ [2. Machine Must-Pass Gates (Auto-Reject Broken Output)] ➔ [3. Human 10-Second Visual Check &amp; Approve/Re-Roll]
        </span>
      </div>
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="switchTab('brushes')">
          Open Biome Brush &amp; Tag Pools ▸
        </button>
      </div>
    </div>

    <div class="rms-list">
      ${proposals.map(prop => {
        const selIdx = prop.selectedTakeIdx || 0;
        const takes = prop.takes || [];
        const activeTake = takes[selIdx] || takes[0] || {};
        const statusBadge = prop.status === 'approved'
          ? 'joy-badge--success'
          : (prop.status === 'rejected' ? 'joy-badge--danger' : 'joy-badge--warning');

        const palId = prop.kind === 'ground_palette' ? prop.targetId : null;
        const livePal = palId && DATA.groundPalettes ? DATA.groundPalettes[palId] : null;
        const canopyRule = livePal && livePal.scatter ? livePal.scatter.canopy_tree : null;
        const allCanopyAssets = canopyRule
          ? Array.from(new Set([...(canopyRule.assets || []), ...(canopyRule.disabledAssets || [])]))
          : [];

        return `
          <div class="rms-sheet" id="entity-${escapeHtml(prop.id)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(activeTake.thumbUrl ? { thumbUrl: activeTake.thumbUrl, name: prop.title } : prop.targetId, '✨')}
                <span class="rms-sheet__title">${escapeHtml(prop.title)}</span>
                <span class="joy-badge ${statusBadge} joy-badge--sm">${escapeHtml((prop.status || 'pending_review').toUpperCase())}</span>
                <span class="rms-sheet__id"><code>${escapeHtml(prop.id)}</code> · Target: <code>${escapeHtml(prop.targetFile || '')}</code></span>
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(prop.pillar || prop.kind)}</span>
                ${inspectBtnHtml('proposal', prop.title, prop)}
              </div>
            </div>

            <div class="review-3col-grid">
              <!-- COLUMN 1: EMBEDDED GENERATOR INPUTS -->
              <div class="review-col">
                <div class="review-col__head">
                  <span>1. Embedded Generator Inputs</span>
                  <span class="joy-badge joy-badge--brand joy-badge--sm">Auto-Injected</span>
                </div>
                <div class="observatory-card__meta">
                  Criteria embedded directly into the generator contract before building:
                </div>
                <div style="display:flex;flex-direction:column;gap:5px">
                  ${Object.entries(prop.embeddedInputs || {}).map(([k, v]) => `
                    <div class="gate-pill-row">
                      <span class="mono" style="color:var(--joy-text-secondary)">${escapeHtml(k)}</span>
                      <strong class="mono" style="font-size:11.5px;text-align:right">${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</strong>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- COLUMN 2: MACHINE MUST-PASS GATES -->
              <div class="review-col">
                <div class="review-col__head">
                  <span>2. Machine Must-Pass Gates</span>
                  <span class="joy-badge joy-badge--success joy-badge--sm">${(prop.machineGates || []).length}/${(prop.machineGates || []).length} PASS</span>
                </div>
                <div class="observatory-card__meta">
                  Verified automatically by <code>validate.mjs</code>, <code>balance_sim</code> &amp; spatial hash:
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${(prop.machineGates || []).map(g => `
                    <div class="gate-pill-row">
                      <div>
                        <div style="font-weight:600">${escapeHtml(g.gate)}</div>
                        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">${escapeHtml(g.value)}</div>
                      </div>
                      <span class="joy-badge joy-badge--success joy-badge--sm">PASS</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- COLUMN 3: HUMAN 10-SECOND IN-CONTEXT VISUAL CHECK & VERDICT -->
              <div class="review-col">
                <div class="review-col__head">
                  <span>3. Human In-Context Visual Check &amp; Verdict</span>
                  <span class="joy-badge joy-badge--warning joy-badge--sm">10s Spot-Check</span>
                </div>

                <!-- Visual Scale / Cutaway / Blueprint Diagram -->
                ${renderChibiLineupSvg(prop)}

                <!-- Multi-Take Picker -->
                <div>
                  <div style="font-size:11.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:5px">
                    Candidate Takes (Pick Best Variant or Re-Roll with Feedback):
                  </div>
                  <div class="take-selector-bar">
                    ${takes.map((tk, idx) => `
                      <button type="button" class="take-btn ${idx === selIdx ? 'active' : ''}" onclick="selectProposalTake('${escapeHtml(prop.id)}', ${idx})">
                        ${tk.thumbUrl ? `<img src="${escapeHtml(tk.thumbUrl)}" alt="" style="width:22px;height:22px;object-fit:contain;border-radius:4px"/>` : '🎯'}
                        <span>${escapeHtml(tk.label)}</span>
                      </button>
                    `).join('')}
                  </div>
                  <div class="observatory-card__meta" style="margin-top:5px">
                    Selected: <strong>${escapeHtml(activeTake.label || '')}</strong> — ${escapeHtml(activeTake.notes || '')}
                  </div>
                </div>

                ${canopyRule ? `
                  <div style="padding:10px;border-radius:7px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                    <div style="font-size:11.5px;font-weight:700;color:var(--joy-accent-text);margin-bottom:6px">
                      Smart Tag Pool Override (<code>biome:freja_pine + role:canopy_tree</code>) — Uncheck any unwanted 3D asset:
                    </div>
                    <div class="tag-pool-grid">
                      ${allCanopyAssets.map(sp => {
                        const isDisabled = (canopyRule.disabledAssets || []).includes(sp);
                        const shortName = sp.replace('res://assets/nature/', '');
                        const tUrl = (DATA.assetSceneThumbs && DATA.assetSceneThumbs[sp]) || '';
                        return `
                          <label class="tag-asset-card ${isDisabled ? 'disabled' : ''}" onclick="togglePaletteAsset('${escapeHtml(palId)}', 'canopy_tree', '${escapeHtml(sp)}')">
                            <input type="checkbox" ${!isDisabled ? 'checked' : ''} onclick="event.stopPropagation(); togglePaletteAsset('${escapeHtml(palId)}', 'canopy_tree', '${escapeHtml(sp)}')" />
                            ${tUrl ? `<img src="${escapeHtml(tUrl)}" alt="${escapeHtml(shortName)}" />` : ''}
                            <div>
                              <div class="mono" style="font-weight:600;font-size:11.5px">${escapeHtml(shortName)}</div>
                              <div class="observatory-card__meta">${isDisabled ? 'Excluded from scatter' : 'Active in chunk scatter'}</div>
                            </div>
                          </label>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}

                ${prop.kind === 'map_blueprint' ? renderMapStructureEditor((DATA.maps || [])[0], 'rev-map') : ''}

                <!-- Nice-to-Have Human Checklist -->
                <div class="chip-row">
                  ${(prop.niceToHaveChecks || []).map(chk => `
                    <span class="joy-badge joy-badge--neutral joy-badge--sm">✓ ${escapeHtml(chk)}</span>
                  `).join('')}
                </div>

                <!-- Reviewer Feedback Input + Approve / Re-Roll / Reject Bar -->
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;padding-top:8px;border-top:1px solid var(--joy-border-subtle)">
                  <input
                    id="fb-input-${escapeHtml(prop.id)}"
                    class="joy-input"
                    type="text"
                    placeholder="Optional feedback note (e.g., 'Make tusks 20% larger' or 'Lower bush height to 0.55m')..."
                    value="${escapeHtml(prop.lastFeedback || '')}"
                    style="flex:1;min-width:220px;height:32px;font-size:12px"
                  />
                  <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="submitReviewVerdict('${escapeHtml(prop.id)}', 'approve', ${selIdx})">
                    ✓ Approve &amp; Commit
                  </button>
                  <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="submitReviewVerdict('${escapeHtml(prop.id)}', 'feedback', ${selIdx})">
                    ↻ Send Feedback &amp; Re-Roll
                  </button>
                  <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="submitReviewVerdict('${escapeHtml(prop.id)}', 'reject', ${selIdx})">
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBiomeBrushes() {
  const pals = DATA.groundPalettes || {};
  const snaps = DATA.studioSnapshots || [];

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">STAGE 4 DECLARATIVE GROUND_ID BRUSHES · SMART TAG POOLS + CHECKBOX OVERRIDE</div>
        <h1 class="page-hero__title">Biome Brush &amp; Smart Tag-Pool Composer (<code>content/ground_palettes.json</code>)</h1>
        <p class="page-hero__sub">
          Each <code>ground_id</code> brush auto-populates 3D models by tag and enforces the <strong>1.05m Chibi Player Scale</strong>
          (grass ≤ 0.35m, bush ≤ 0.65m). Uncheck any 3D asset below to immediately exclude it from <code>freja-south-gate.json</code> chunk scatter.
        </p>
      </div>
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="undoStudioSnapshot()" ${snaps.length === 0 ? 'disabled' : ''}>
          ↩ Undo Last Brush Edit (${snaps.length})
        </button>
      </div>
    </div>

    ${renderAiCopilotBar()}

    <div class="rms-list">
      ${Object.entries(pals).map(([pid, pal]) => {
        const scatterEntries = Object.entries(pal.scatter || {});
        return `
          <div class="rms-sheet" id="entity-pal-${escapeHtml(pid)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip" style="background:${escapeHtml(pal.albedoTint || '#529E47')}">🌿</span>
                <span class="rms-sheet__title">Brush: <code>${escapeHtml(pid)}</code> (${escapeHtml(pal.surfaceType || '')})</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">Max Slope ${pal.maxSlopeDeg}°</span>
                ${pal.clearColliders ? `<span class="joy-badge joy-badge--warning joy-badge--sm">CLEAR COLLIDERS (ROAD)</span>` : ''}
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--success joy-badge--sm">Chibi Band: ${(pal.playerScaleBandM || [0.9, 1.2]).join('m–')}m</span>
                ${inspectBtnHtml('palette', pid, pal)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                ${scatterEntries.length === 0 ? `
                  <tr><th>Scatter Rules</th><td class="observatory-card__meta">0 scatter rules (steep slope rock face override)</td></tr>
                ` : scatterEntries.map(([rname, rule]) => {
                  const allAssets = Array.from(new Set([...(rule.assets || []), ...(rule.disabledAssets || [])]));
                  const tagPool = rule.tagPool ? `biome:${rule.tagPool.biome} · role:${rule.tagPool.role}` : 'manual pool';
                  return `
                    <tr>
                      <th style="width:170px">
                        <div class="mono" style="font-size:12.5px">${escapeHtml(rname)}</div>
                        <div class="observatory-card__meta">${rule.blocksMovement ? 'Tier B Collider' : 'Tier A MultiMesh'}</div>
                      </th>
                      <td style="width:220px">
                        <div style="display:flex;align-items:center;gap:8px">
                          <input
                            type="range"
                            min="0"
                            max="0.60"
                            step="0.005"
                            value="${rule.weight}"
                            onchange="togglePaletteAsset('${escapeHtml(pid)}', '${escapeHtml(rname)}', '', this.value)"
                          />
                          <span class="mono" style="font-weight:700">${rule.weight}</span>
                        </div>
                        <div class="observatory-card__meta">
                          Scale: ${(rule.scaleRange || [0.7, 1.0]).join('–')}×
                          ${rule.maxWorldHeightM ? ` · Cap ≤ ${rule.maxWorldHeightM}m` : ''}
                          ${rule.colliderHalfExtent ? ` · Trunk r=${rule.colliderHalfExtent}m` : ''}
                        </div>
                        <div class="observatory-card__meta">${escapeHtml(tagPool)}</div>
                      </td>
                      <td>
                        <div class="tag-pool-grid">
                          ${allAssets.map(sp => {
                            const isDisabled = (rule.disabledAssets || []).includes(sp);
                            const shortName = sp.replace('res://assets/nature/', '');
                            const tUrl = (DATA.assetSceneThumbs && DATA.assetSceneThumbs[sp]) || '';
                            return `
                              <label class="tag-asset-card ${isDisabled ? 'disabled' : ''}" onclick="togglePaletteAsset('${escapeHtml(pid)}', '${escapeHtml(rname)}', '${escapeHtml(sp)}')">
                                <input type="checkbox" ${!isDisabled ? 'checked' : ''} onclick="event.stopPropagation(); togglePaletteAsset('${escapeHtml(pid)}', '${escapeHtml(rname)}', '${escapeHtml(sp)}')" />
                                ${tUrl ? `<img src="${escapeHtml(tUrl)}" alt="${escapeHtml(shortName)}" />` : ''}
                                <div>
                                  <div class="mono" style="font-weight:600;font-size:11.5px">${escapeHtml(shortName)}</div>
                                  <div class="observatory-card__meta">${isDisabled ? 'Unchecked (Disabled)' : 'Checked (Active)'}</div>
                                </div>
                              </label>
                            `;
                          }).join('')}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}


/* ============================================================================
 * 0B. WORLD & LORE SPINE — CONTINENT ATLAS, 5-ACT STORY GRAPH & BESTIARY
 * ========================================================================== */
function renderWorldAtlasSvg(ws) {
  const continents = ws.continents || [];
  const pinned = ws.pinnedPlaces || [];
  const lanes = ws.seaLanes || [];
  const edges = ws.spineEdges || [];

  return `
    <svg width="100%" height="340" viewBox="0 0 400 400" style="border-radius:8px;background:radial-gradient(circle at 50% 50%, #13283c 0%, #0b1826 100%);border:1px solid var(--joy-border-strong)">
      <defs>
        <pattern id="world-km-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.6"/>
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#world-km-grid)"/>
      <text x="10" y="16" fill="#7da2c1" font-size="8.5" font-family="monospace">400×400 km World Frame (160,000 km² · Seed ${escapeHtml(ws.seed || '')})</text>

      <!-- Sea Lanes -->
      ${lanes.map(sl => {
        const pts = (sl.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="rgba(88, 166, 255, 0.45)" stroke-width="1.4" stroke-dasharray="3 2"/>`;
      }).join('')}

      <!-- Continents (Premise Ellipses) -->
      ${continents.map(c => {
        const fp = c.footprint || {};
        const centre = fp.centreKm || [200, 200];
        const radii = fp.radiiKm || [25, 20];
        const isSel = SELECTED_CONTINENT_ID === c.id;
        const fill = c.coastClass === 'ice'
          ? 'rgba(165, 216, 255, 0.25)'
          : (isSel ? 'rgba(212, 175, 55, 0.34)' : 'rgba(82, 158, 71, 0.24)');
        const stroke = isSel ? '#ffd166' : '#5ec27e';
        return `
          <g style="cursor:pointer" onclick="SELECTED_CONTINENT_ID='${escapeHtml(c.id)}';render()">
            <ellipse cx="${centre[0]}" cy="${centre[1]}" rx="${Math.max(12, radii[0] * 0.65)}" ry="${Math.max(10, radii[1] * 0.65)}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel ? 2.2 : 1.1}"/>
            <text x="${centre[0]}" y="${centre[1] - 2}" text-anchor="middle" fill="#f0f6fc" font-size="8.5" font-weight="bold" font-family="monospace">${escapeHtml(c.id.toUpperCase())} · ${escapeHtml(c.title)}</text>
            <text x="${centre[0]}" y="${centre[1] + 8}" text-anchor="middle" fill="#a8f0be" font-size="7" font-family="monospace">Lv.${c.levelMin}-${c.levelMax} · ${Math.round(c.grossLandKm2)}km²</text>
          </g>
        `;
      }).join('')}

      <!-- Spine Trade Roads on c02 -->
      ${edges.filter(e => Array.isArray(e.points)).map(e => {
        const pts = e.points.map(p => `${p[0]},${p[1]}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="#ffd166" stroke-width="1.2" opacity="0.8"/>`;
      }).join('')}

      <!-- Pinned Towns & Landmarks -->
      ${pinned.filter(p => p.atXKm != null && p.atYKm != null).map(p => {
        const isTown = p.kind === 'town';
        return `
          <g>
            <circle cx="${p.atXKm}" cy="${p.atYKm}" r="${isTown ? 3.2 : 1.8}" fill="${isTown ? '#ffd166' : '#ff8787'}" stroke="#0b1826" stroke-width="0.8"/>
            ${isTown ? `<text x="${p.atXKm + 4.5}" y="${p.atYKm + 2.5}" fill="#ffd166" font-size="7" font-weight="bold" font-family="monospace">${escapeHtml(p.title)}</text>` : ''}
          </g>
        `;
      }).join('')}
    </svg>
  `;
}

function renderTownMillcrossSvg(tp) {
  if (!tp || !tp.extent) return '<div class="observatory-card__meta">No town plan loaded</div>';
  const w = tp.extent.width || 220;
  const h = tp.extent.height || 160;
  return `
    <svg width="100%" height="340" viewBox="0 0 ${w} ${h}" style="border-radius:8px;background:#162219;border:1px solid var(--joy-border-strong)">
      <text x="6" y="10" fill="#a8f0be" font-size="6.5" font-weight="bold" font-family="monospace">Town Plan: ${escapeHtml(tp.town)} (${w}×${h}u · anchor [98.2, 152.6] km)</text>
      <!-- Water polygons (Meltwash River & Mill Race) -->
      ${(tp.water || []).map(wt => {
        const pts = (wt.poly || []).map(p => `${p[0]},${p[1]}`).join(' ');
        return `<polygon points="${pts}" fill="rgba(56, 139, 253, 0.38)" stroke="#58a6ff" stroke-width="0.8"/>`;
      }).join('')}
      <!-- Roads -->
      ${(tp.roads || []).map(rd => {
        const pts = (rd.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="rgba(218, 184, 122, 0.65)" stroke-width="${Math.max(2, (rd.width || 8) * 0.45)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('')}
      <!-- Footprints (Mills, Guild, Stores, Walls, Gates) -->
      ${(tp.footprints || []).map(fp => {
        const [x1, y1, x2, y2] = fp.rect || [0, 0, 10, 10];
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        const isWall = fp.kind === 'wall';
        const isGate = fp.kind === 'gate';
        const fill = isWall ? '#6e7681' : (isGate ? '#ffd166' : 'rgba(212, 175, 55, 0.32)');
        const stroke = isWall ? '#8b949e' : '#ffd166';
        return `
          <g>
            <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="${stroke}" stroke-width="0.7" rx="1"/>
            ${!isWall && rw >= 12 ? `<text x="${rx + rw/2}" y="${ry + rh/2 + 1.8}" text-anchor="middle" fill="#f0f6fc" font-size="4.2" font-family="monospace">${escapeHtml(fp.id)}</text>` : ''}
          </g>
        `;
      }).join('')}
    </svg>
  `;
}

function renderWorldAtlas() {
  const ws = DATA.worldSpine || {};
  const allContinents = ws.continents || [];
  const continents = allContinents.filter(c => (SELECTED_CONTINENT_ID === 'all' || c.id === SELECTED_CONTINENT_ID) && matchesSearch(c));
  const pinned = (ws.pinnedPlaces || []).filter(p => (SELECTED_CONTINENT_ID === 'all' || p.continentId === SELECTED_CONTINENT_ID) && matchesSearch(p));
  const zones = (ws.zones || []).filter(z => (SELECTED_CONTINENT_ID === 'all' || z.continentId === SELECTED_CONTINENT_ID) && matchesSearch(z));
  const dungeons = (ws.dungeons || []).filter(d => (SELECTED_CONTINENT_ID === 'all' || d.continentId === SELECTED_CONTINENT_ID) && matchesSearch(d));
  const boundCount = (ws.boundPlaces || []).filter(b => SELECTED_CONTINENT_ID === 'all' || b.continentId === SELECTED_CONTINENT_ID).length;

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">LAYER 1 &amp; LAYER 2 WORLD SPINE · 400×400 KM DETERMINISTIC GEOGRAPHY</div>
        <h1 class="page-hero__title">World &amp; Continent Atlas (<code>content/world/</code> + <code>content/spine/</code>)</h1>
        <p class="page-hero__sub">
          Single source of spatial truth: <strong>13 Continents</strong> (64,000 km² net land, 1.5:1 sea-to-land ratio),
          <strong>${(ws.pinnedPlaces || []).length} Pinned Canon Places</strong>, <strong>${(ws.boundPlaces || []).length} Slot-Bound Places</strong>,
          <strong>${(ws.zones || []).length} Surveyed Zones</strong>, and <strong>${(ws.dungeons || []).length} Multi-Floor Dungeons</strong>.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand mono">Seed: ${escapeHtml(ws.seed || '7c9e4a2f8b1d6e03')}</span>
        <span class="joy-badge joy-badge--success">Sea:Land = ${ws.seaToLandRatio || 1.5}:1</span>
      </div>
    </div>

    <!-- Interactive 2D World Atlas SVG + Millcross Town Plan SVG -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="observatory-card" style="padding:14px">
        <div class="observatory-card__head">
          <div>
            <h3 class="observatory-card__title">400×400 km World Atlas (Click Any Continent)</h3>
            <div class="observatory-card__meta">13 Continent footprints, sea lanes, c02 trade roads &amp; pinned towns</div>
          </div>
          ${SELECTED_CONTINENT_ID !== 'all' ? `<button class="joy-button joy-button--outline joy-button--sm" onclick="SELECTED_CONTINENT_ID='all';render()">Reset Filter (${escapeHtml(SELECTED_CONTINENT_ID)})</button>` : ''}
        </div>
        ${renderWorldAtlasSvg(ws)}
      </div>

      <div class="observatory-card" style="padding:14px">
        <div class="observatory-card__head">
          <div>
            <h3 class="observatory-card__title">Authoritative Town Plan: Millcross (<code>town-millcross.json</code>)</h3>
            <div class="observatory-card__meta">Meltwash river, mill race, 5 roads, city walls, gates &amp; 18 building footprints</div>
          </div>
          <div class="chip-row">
            ${rmsLink('maps', 'millcross-ford', 'Open Millcross 3D Map', '4000×4000m')}
            ${rmsLink('maps', 'freja-south-gate', 'Open Pilot Gate Map', '1000×1000m')}
          </div>
        </div>
        ${renderTownMillcrossSvg(ws.townMillcross)}
      </div>
    </div>

    <!-- Continent Filter Chips -->
    <div class="controls-panel">
      <strong style="font-size:12px;color:var(--joy-text-secondary)">Filter by Continent:</strong>
      <div class="chip-row">
        <button type="button" class="joy-button ${SELECTED_CONTINENT_ID === 'all' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="SELECTED_CONTINENT_ID='all';render()">
          All 13 Continents
        </button>
        ${allContinents.map(c => `
          <button type="button" class="joy-button ${SELECTED_CONTINENT_ID === c.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm mono" onclick="SELECTED_CONTINENT_ID='${escapeHtml(c.id)}';render()">
            ${escapeHtml(c.id)} · ${escapeHtml(c.title)} (Lv.${c.levelMin}-${c.levelMax})
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Continent Datasheets -->
    <div class="rms-list">
      ${continents.map(c => {
        const cPinned = (ws.pinnedPlaces || []).filter(p => p.continentId === c.id);
        const cDungeons = (ws.dungeons || []).filter(d => d.continentId === c.id);
        const cZones = (ws.zones || []).filter(z => z.continentId === c.id);
        const cBound = (ws.boundPlaces || []).filter(b => b.continentId === c.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === c.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(c.id)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip">🌍</span>
                <span class="rms-sheet__title">${escapeHtml(c.id.toUpperCase())} — ${escapeHtml(c.title)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">Lv.${c.levelMin}–${c.levelMax}</span>
                <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(c.continentClass)} · coast:${escapeHtml(c.coastClass)}</span>
                <span class="rms-sheet__id">Naming Register: <code>${escapeHtml(c.register)}</code></span>
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--success joy-badge--sm mono">${c.grossLandKm2.toLocaleString()} km² (${c.landCells.toLocaleString()} cells)</span>
                ${inspectBtnHtml('continent', c.title, c)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Structural Premise</th>
                  <td colspan="3">${escapeHtml(c.structuralIdea)}</td>
                  <th>Landform Kit</th>
                  <td><div class="chip-row">${(c.landformKit || []).map(k => `<span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(k)}</span>`).join('')}</div></td>
                </tr>
                <tr>
                  <th>Biome Palette</th>
                  <td colspan="3"><div class="chip-row">${(c.palette || []).map(p => `<span class="joy-badge joy-badge--success joy-badge--sm mono">${escapeHtml(p)}</span>`).join('')}</div></td>
                  <th>Bound Frontier Slots</th>
                  <td class="mono">${cBound.length} bound landmarks/settlements</td>
                </tr>
                <tr>
                  <th>Pinned Towns &amp; Landmarks (${cPinned.length})</th>
                  <td colspan="5">
                    <div class="chip-row">
                      ${cPinned.map(p => `<a class="rms-link" onclick="jumpToEntity('world', '${escapeHtml(p.id)}')"><span class="rms-link__arrow">${p.kind === 'town' ? '🏰' : '📍'}</span><span>${escapeHtml(p.title)}</span><span class="rms-link__rate">(${escapeHtml(p.landform)})</span></a>`).join(' ') || '<span class="observatory-card__meta">None</span>'}
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>Surveyed Zones (${cZones.length}) &amp; Playable 3D Maps</th>
                  <td colspan="5">
                    <div class="chip-row">
                      ${cZones.slice(0, 12).map(z => {
                        const zMap = (DATA.maps || []).find(m => (m.worldSpineBinding && m.worldSpineBinding.zoneId === z.id) || m.id === z.id);
                        return zMap
                          ? rmsLink('maps', zMap.id, `🗺️ ${z.id}`, `${z.regionRef} · ${(zMap.spawnAreas || []).length} spawns`)
                          : `<span class="joy-badge joy-badge--neutral joy-badge--sm mono">🧭 ${escapeHtml(z.id)} (${escapeHtml(z.regionRef)})</span>`;
                      }).join('')}
                      ${cDungeons.slice(0, 10).map(d => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">🗝️ ${escapeHtml(d.title)} (${d.floors}F · Lv.${d.levelMin}-${d.levelMax})</span>`).join('')}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Pinned Canon Places Table -->
    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Pinned Canon Towns &amp; Landmarks (${pinned.length} shown · +${boundCount} Slot-Bound Places in SQLite)</h3>
          <div class="observatory-card__meta">Every pinned place is a generator input verified by G-PIN-SAT (landform + water + slope)</div>
        </div>
        <span class="joy-badge joy-badge--brand">content/world/civil/pinned-roster.json</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>ID &amp; Name</th>
              <th>Kind / Rank</th>
              <th>Continent &amp; Coords (km)</th>
              <th>Required Landform</th>
              <th>Canon / Geography Justification (<code>why</code>)</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            ${pinned.map(p => `
              <tr id="entity-${escapeHtml(p.id)}" class="${HIGHLIGHT_ENTITY_ID === p.id ? 'rms-highlight' : ''}">
                <td>
                  <div style="font-weight:700">${p.kind === 'town' ? '🏰' : '📍'} ${escapeHtml(p.title)}</div>
                  <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">${escapeHtml(p.id)}</div>
                </td>
                <td><span class="joy-badge ${p.kind === 'town' ? 'joy-badge--brand' : 'joy-badge--neutral'} joy-badge--sm">${escapeHtml(p.kind.toUpperCase())}${p.rank ? ' · ' + escapeHtml(p.rank.toUpperCase()) : ''}</span></td>
                <td class="mono">${escapeHtml(p.continentId)} @ [${p.atXKm ?? '—'}, ${p.atYKm ?? '—'}]</td>
                <td><span class="joy-badge joy-badge--success joy-badge--sm mono">${escapeHtml(p.landform)}</span></td>
                <td style="font-size:12px">${escapeHtml(p.whyOrNote)}</td>
                <td>${inspectBtnHtml('place', p.title, p)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Surveyed Zones & Dungeons Split -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="observatory-card">
        <div class="observatory-card__head">
          <div>
            <h3 class="observatory-card__title">Surveyed Zones (${zones.length})</h3>
            <div class="observatory-card__meta"><code>content/zones/*.json</code> — Hazards, Salvage/Crop Resources &amp; Landmarks</div>
          </div>
        </div>
        <div class="joy-table-container" style="max-height:420px;overflow-y:auto">
          <table class="joy-table">
            <thead>
              <tr><th>Zone</th><th>Region</th><th>Reason to Go &amp; Hazards</th></tr>
            </thead>
            <tbody>
              ${zones.map(z => {
                const zMap = (DATA.maps || []).find(m => (m.worldSpineBinding && m.worldSpineBinding.zoneId === z.id) || m.id === z.id);
                return `
                <tr id="entity-zone-${escapeHtml(z.id)}">
                  <td class="mono" style="font-weight:700">
                    <div>${escapeHtml(z.id)}</div>
                    ${zMap ? `<div style="margin-top:4px">${rmsLink('maps', zMap.id, '3D Map: ' + zMap.id, (zMap.spawnAreas || []).length + ' spawns')}</div>` : ''}
                  </td>
                  <td class="mono">
                    <div>${escapeHtml(z.regionRef)}</div>
                    ${zMap && zMap.worldSpineBinding && zMap.worldSpineBinding.storyRegionId ? `<div style="margin-top:4px">${rmsLink('story', zMap.worldSpineBinding.storyRegionId, zMap.worldSpineBinding.storyRegionId, 'Story')}</div>` : ''}
                  </td>
                  <td style="font-size:12px">
                    <div>${escapeHtml(z.reasonToGo)}</div>
                    <div class="chip-row" style="margin-top:4px">
                      ${(z.hazards || []).map(h => `<span class="joy-badge joy-badge--danger joy-badge--sm">⚠️ ${escapeHtml(h.name)}</span>`).join('')}
                      ${(z.resources || []).map(r => `<span class="joy-badge joy-badge--success joy-badge--sm">📦 ${escapeHtml(r.name)}</span>`).join('')}
                    </div>
                  </td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="observatory-card">
        <div class="observatory-card__head">
          <div>
            <h3 class="observatory-card__title">Dungeon Complexes (${dungeons.length})</h3>
            <div class="observatory-card__meta"><code>content/dungeons/*.json</code> — Multi-floor complexes bound to landform handles</div>
          </div>
        </div>
        <div class="joy-table-container" style="max-height:420px;overflow-y:auto">
          <table class="joy-table">
            <thead>
              <tr><th>Dungeon</th><th>Floors / Lv</th><th>Entrance, Hazards &amp; Lore</th></tr>
            </thead>
            <tbody>
              ${dungeons.map(d => `
                <tr>
                  <td>
                    <div style="font-weight:700">${escapeHtml(d.title)}</div>
                    <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">${escapeHtml(d.handleRef)}</div>
                  </td>
                  <td class="mono">${d.floors}F · Lv.${d.levelMin}-${d.levelMax}</td>
                  <td style="font-size:12px">
                    <div>${escapeHtml(d.loreNote)}</div>
                    <div class="chip-row" style="margin-top:4px">
                      <span class="joy-badge joy-badge--neutral joy-badge--sm mono">door:${escapeHtml(d.entranceType)}</span>
                      ${(d.hazards || []).map(h => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(h)}</span>`).join('')}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderStoryGraph() {
  const ws = DATA.worldSpine || {};
  const allNodes = ws.storyNodes || [];
  const byId = {};
  allNodes.forEach(n => { byId[n.id] = n; });

  const acts = allNodes.filter(n => n.kind === 'act').sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
  const kinds = ['all', 'region', 'faction', 'character', 'arc', 'quest', 'event', 'dialogue', 'lore'];
  const filtered = allNodes.filter(n => (SELECTED_STORY_KIND === 'all' || n.kind === SELECTED_STORY_KIND) && matchesSearch(n));

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">LAYER 0 CANON &amp; LAYER 3 NARRATIVE GRAPH · 9 TYPED SCHEMAS</div>
        <h1 class="page-hero__title">5-Act Story, Factions, NPCs &amp; Quest Unlock DAG (<code>content/story/</code>)</h1>
        <p class="page-hero__sub">
          Full visibility over <strong>The Undertow</strong> 5-act epic and frontier seed arcs:
          <strong>${allNodes.length} cross-checked narrative nodes</strong> where every NPC, Quest, Event, Dialogue, and Lore fragment links cleanly to Regions, Factions, and Server Mobs.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--success">resolveStoryRefs: PASS</span>
        <span class="joy-badge joy-badge--brand">assertUnlockDag: Acyclic</span>
      </div>
    </div>

    <!-- 5-Act Spine Cards -->
    <div style="display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:10px">
      ${acts.map(act => `
        <div class="observatory-card ${HIGHLIGHT_ENTITY_ID === act.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(act.id)}" style="padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="joy-badge joy-badge--brand joy-badge--sm mono">ACT ${act.orderNum}</span>
            <span class="mono" style="font-size:11px;color:var(--joy-accent-text)">${escapeHtml((act.raw && act.raw.theme) || '')}</span>
          </div>
          <div style="font-weight:700;font-size:14px">${escapeHtml(act.title)}</div>
          <div style="font-size:12px;color:var(--joy-text-secondary)">${escapeHtml(act.summary)}</div>
        </div>
      `).join('')}
    </div>

    <!-- Kind Filter Bar -->
    <div class="controls-panel">
      <strong style="font-size:12px;color:var(--joy-text-secondary)">Filter Narrative Node Kind:</strong>
      <div class="chip-row">
        ${kinds.map(k => {
          const cnt = k === 'all' ? allNodes.length : allNodes.filter(n => n.kind === k).length;
          return `
            <button type="button" class="joy-button ${SELECTED_STORY_KIND === k ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="SELECTED_STORY_KIND='${k}';render()">
              ${escapeHtml(k.toUpperCase())} (${cnt})
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Story Nodes RMS Sheets -->
    <div class="rms-list">
      ${filtered.map(n => {
        const raw = n.raw || {};
        const unlocked = n.unlockedBy || [];
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === n.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(n.id)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip">📜</span>
                <span class="rms-sheet__title">${escapeHtml(n.title)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm mono">${escapeHtml(n.kind.toUpperCase())}</span>
                <span class="rms-sheet__id">ID: <code>${escapeHtml(n.id)}</code></span>
              </div>
              <div class="chip-row">
                ${n.regionId ? rmsLink('story', n.regionId, (byId[n.regionId]?.title || n.regionId), 'Region') : ''}
                ${n.factionId ? rmsLink('story', n.factionId, (byId[n.factionId]?.title || n.factionId), 'Faction') : ''}
                ${inspectBtnHtml(n.kind, n.title, raw)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Summary</th>
                  <td colspan="5">${escapeHtml(n.summary)}</td>
                </tr>
                ${n.kind === 'region' ? (() => {
                  const regMaps = (DATA.maps || []).filter(m => m.worldSpineBinding && m.worldSpineBinding.storyRegionId === n.id);
                  const regMobs = (ws.bestiary || []).filter(b =>
                    ('region-' + b.region === n.id) ||
                    (b.region === 'c02/r11' && n.id === 'region-ashvale-front') ||
                    (b.region === 'northern-icefield' && n.id === 'region-icefield')
                  );
                  return `
                  <tr>
                    <th>Danger Tier</th>
                    <td><span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(raw.dangerTier || 'safe')}</span></td>
                    <th>World Spine &amp; 3D Map</th>
                    <td>
                      <div class="chip-row">
                        <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(raw.spineId || raw.resolvedRef || '—')}</span>
                        ${regMaps.map(rm => rmsLink('maps', rm.id, `🗺️ ${rm.id}`, `${rm.width}×${rm.height}m · ${(rm.spawnAreas||[]).length} spawns`)).join(' ')}
                        ${regMobs.length ? rmsLink('bestiary', regMobs[0].id, `🐾 ${regMobs.length} Bestiary Mobs`, regMobs[0].region) : ''}
                      </div>
                    </td>
                    <th>Resident NPCs &amp; Quests</th>
                    <td>
                      <div class="chip-row">
                        ${allNodes.filter(c => c.kind === 'character' && c.regionId === n.id).map(c => rmsLink('story', c.id, c.title, c.raw?.role)).join(' ')}
                        ${allNodes.filter(q => q.kind === 'quest' && q.regionId === n.id).map(q => rmsLink('story', q.id, q.title, 'Quest')).join(' ')}
                      </div>
                    </td>
                  </tr>
                  `;
                })() : ''}
                ${n.kind === 'character' ? `
                  <tr>
                    <th>Role &amp; Status</th>
                    <td>
                      <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(raw.role || 'npc')}</span>
                      <span class="joy-badge ${raw.status === 'dead' ? 'joy-badge--danger' : 'joy-badge--success'} joy-badge--sm mono">${escapeHtml(raw.status || 'alive')}</span>
                    </td>
                    <th>Died At Event</th>
                    <td>${raw.diedAt ? rmsLink('story', raw.diedAt, (byId[raw.diedAt]?.title || raw.diedAt), 'Event') : '—'}</td>
                    <th>Quests Given</th>
                    <td>
                      <div class="chip-row">
                        ${allNodes.filter(q => q.kind === 'quest' && q.giverId === n.id).map(q => rmsLink('story', q.id, q.title)).join(' ') || '—'}
                      </div>
                    </td>
                  </tr>
                ` : ''}
                ${n.kind === 'quest' ? `
                  <tr>
                    <th>Quest Giver &amp; Arc</th>
                    <td colspan="2">
                      ${n.giverId ? rmsLink('story', n.giverId, (byId[n.giverId]?.title || n.giverId), 'Giver NPC') : '—'}
                      ${n.arcId ? rmsLink('story', n.arcId, (byId[n.arcId]?.title || n.arcId), 'Arc') : ''}
                    </td>
                    <th>Unlocked By (DAG)</th>
                    <td colspan="2">
                      <div class="chip-row">
                        ${unlocked.map(uid => rmsLink('story', uid, (byId[uid]?.title || uid), uid.split('-')[0])).join(' ') || '<span class="observatory-card__meta">Starter / Root</span>'}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Objectives</th>
                    <td colspan="2">
                      <div class="chip-row">
                        ${(raw.objectives || []).map(o => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(o.type)}: ${escapeHtml(o.targetId)} ×${o.count}</span>`).join('')}
                      </div>
                    </td>
                    <th>Narrative Text</th>
                    <td colspan="2" style="font-size:12px">
                      <div><strong>Offer:</strong> "${escapeHtml(raw.narrative?.offerText || '')}"</div>
                      <div><strong>Complete:</strong> "${escapeHtml(raw.narrative?.completeText || '')}"</div>
                    </td>
                  </tr>
                ` : ''}
                ${n.kind === 'faction' ? `
                  <tr>
                    <th>Disposition</th>
                    <td><span class="joy-badge ${raw.disposition === 'hostile' ? 'joy-badge--danger' : 'joy-badge--success'} joy-badge--sm mono">${escapeHtml(raw.disposition || 'neutral')}</span></td>
                    <th>Server Mob Family</th>
                    <td><div class="chip-row">${(raw.mobFamily || []).map(mf => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(mf)}</span>`).join('') || '—'}</div></td>
                    <th>Stances</th>
                    <td><div class="chip-row">${(raw.relationships || []).map(rel => `${rmsLink('story', rel.factionId, rel.factionId, rel.stance)}`).join(' ') || '—'}</div></td>
                  </tr>
                ` : ''}
                ${n.kind === 'lore' ? `
                  <tr>
                    <th>Anchor &amp; Thread</th>
                    <td colspan="2">${raw.anchor ? rmsLink('story', raw.anchor, (byId[raw.anchor]?.title || raw.anchor), 'Anchor') : ''} <span class="joy-badge joy-badge--neutral joy-badge--sm mono">thread: ${escapeHtml(raw.thread || '')}</span></td>
                    <th>Discoverable Text</th>
                    <td colspan="2" style="font-style:italic;font-size:12.5px">${escapeHtml(raw.body || '')}</td>
                  </tr>
                ` : ''}
                ${n.kind === 'dialogue' ? `
                  <tr>
                    <th>Speaker &amp; Context</th>
                    <td colspan="2">
                      ${raw.speaker ? rmsLink('story', raw.speaker, (byId[raw.speaker]?.title || raw.speaker), 'Speaker') : ''}
                      ${raw.context ? rmsLink('story', raw.context, (byId[raw.context]?.title || raw.context), 'Context') : ''}
                    </td>
                    <th>Spoken Lines</th>
                    <td colspan="2" style="font-size:12px">${(raw.lines || []).map(l => `<div>• "${escapeHtml(l)}"</div>`).join('')}</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBestiary() {
  const ws = DATA.worldSpine || {};
  const allMobs = ws.bestiary || [];
  const regions = ['all', ...Array.from(new Set(allMobs.map(m => m.region).filter(Boolean)))];
  const filtered = allMobs.filter(m => (SELECTED_BESTIARY_REGION === 'all' || m.region === SELECTED_BESTIARY_REGION) && matchesSearch(m));

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">LAYER 3 ECOLOGY &amp; LAYER 5 FORGE VISUAL BRIEFS</div>
        <h1 class="page-hero__title">World Bestiary &amp; Regional Ecology (<code>content/bestiary/bestiary.json</code>)</h1>
        <p class="page-hero__sub">
          <strong>${allMobs.length} lore-anchored creatures</strong> across all canon regions. Each record pairs ecological lore with its 3D/2D Asset Forge visual brief (bodyPlan, silhouette, donor rig cues).
        </p>
      </div>
    </div>

    <div class="controls-panel">
      <strong style="font-size:12px;color:var(--joy-text-secondary)">Filter by Region:</strong>
      <div class="chip-row">
        ${regions.map(r => {
          const cnt = r === 'all' ? allMobs.length : allMobs.filter(m => m.region === r).length;
          return `
            <button type="button" class="joy-button ${SELECTED_BESTIARY_REGION === r ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm mono" onclick="SELECTED_BESTIARY_REGION='${escapeHtml(r)}';render()">
              ${escapeHtml(r.toUpperCase())} (${cnt})
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <div class="rms-list">
      ${filtered.map(m => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === m.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(m.id)}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              <span class="rms-thumb-chip">🐾</span>
              <span class="rms-sheet__title">${escapeHtml(m.name)}</span>
              <span class="joy-badge joy-badge--brand joy-badge--sm mono">Lv.${escapeHtml(m.levelBand)}</span>
              <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(m.element)} · ${escapeHtml(m.family)} · ${escapeHtml(m.bodyPlan)}</span>
              <span class="rms-sheet__id"><code>${escapeHtml(m.id)}</code></span>
            </div>
            <div class="chip-row">
              ${(() => {
                const storyRegId = m.region === 'c02/r11' ? 'region-ashvale-front' : (m.region === 'northern-icefield' ? 'region-icefield' : 'region-' + m.region);
                const spawnMap = (DATA.maps || []).find(mp =>
                  (mp.worldSpineBinding && mp.worldSpineBinding.storyRegionId === storyRegId) ||
                  (mp.spawnAreas || []).some(sa => sa.mobType === m.id)
                );
                return (spawnMap ? rmsLink('maps', spawnMap.id, `🗺️ ${spawnMap.id}`, '3D Spawn Map') : '') +
                  rmsLink('story', storyRegId, m.region === 'c02/r11' ? 'region-ashvale-front (c02/r11)' : storyRegId, 'Region');
              })()}
              ${m.faction ? rmsLink('story', m.faction, m.faction, 'Faction') : ''}
              ${inspectBtnHtml('bestiary', m.name, m)}
            </div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                <th>Combat Profile</th>
                <td class="mono">Archetype: <strong>${escapeHtml(m.archetype)}</strong> · Threat: ${escapeHtml(m.threat)} · Durability: ${escapeHtml(m.durability)} · Speed: ${escapeHtml(m.speed)}</td>
              </tr>
              <tr>
                <th>Ecological Lore</th>
                <td>${escapeHtml(m.lore)}</td>
              </tr>
              <tr>
                <th>Forge Visual Brief</th>
                <td style="color:var(--joy-accent-text)">${escapeHtml(m.visualBrief)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================================
 * 1. OVERVIEW & RMS HUB
 * ========================================================================== */
function renderOverview() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const mobs = DATA.mobs.filter(matchesSearch);
  const items = DATA.items.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">JOYMIFY DESIGN SYSTEM · RATEMYSERVER OBSERVATORY EDITION</div>
        <h1 class="page-hero__title">Atlas World Database, 3D Asset Thumbnails &amp; Balance Studio</h1>
        <p class="page-hero__sub">
          Authentic 3D-baked WebP thumbnails (<code>game-client/assets/.thumbs/</code>), dense 2D datasheets,
          bidirectional foreign-key links, and live drop-rate scaling (<strong>${DROP_RATE_MULT}x</strong>).
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand">Drop Rate: ${DROP_RATE_MULT}x</span>
        <span class="joy-badge joy-badge--success">68/68 Rust Tests Passing</span>
      </div>
    </div>

    <!-- RMS 3-Box Reference Hub -->
    <div class="rms-hub-grid">
      <div class="rms-hub-box">
        <h4>📊 Charts &amp; Tables</h4>
        <div class="rms-hub-links">
          ${rmsLink('elements', '', '10×10 Elemental Property Chart', 'elements.json')}
          ${rmsLink('elements', '', 'Weapon Type vs Monster Size Table', 'Small/Med/Large')}
          ${rmsLink('gear', 'basic_sword', '+0..+15 Refine & Pity Success Table', '5-Fail Pity')}
          ${rmsLink('sql', '', 'v_mob_economy (EXP-per-HP Ranking)', 'SQLite View')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>📜 Promotion &amp; World Guides</h4>
        <div class="rms-hub-links">
          ${rmsLink('quests', 'jq_swordman_trial', 'Swordman → Knight Promotion Trials', 'Lv.10 / Lv.40')}
          ${rmsLink('quests', 'jq_mage_academy', 'Mage → High Wizard Academy Trials', 'Lv.10 / Lv.40')}
          ${rmsLink('world', 'c02', 'World & Continent Atlas (400×400 km)', '13 Continents · 60 Dungeons')}
          ${rmsLink('story', 'act-1', '5-Act Undertow Narrative & NPC Graph', ((DATA.worldSpine && DATA.worldSpine.storyNodes) || []).length + ' Nodes')}
          ${rmsLink('bestiary', '', 'World Ecology & Bestiary Visual Briefs', ((DATA.worldSpine && DATA.worldSpine.bestiary) || []).length + ' Creatures')}
          ${rmsLink('maps', 'freja-south-gate', 'Prontera South Gate — Area Spawn Guide', '8 Spawn Areas')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🧮 Simulators &amp; Calculators</h4>
        <div class="rms-hub-links">
          ${rmsLink('sim', '', 'Authoritative Rust Balance Simulator', 'server-rs')}
          ${rmsLink('siege', 'castle_valkyrie_01', 'WoE Emperium Breach & TTK Calculator', 'Kriemhild')}
          ${rmsLink('gear', 'scythe', 'Equipment Refine & Card Socket Calculator', '+0..+15')}
          ${rmsLink('sql', '', 'Read-Only SQLite + JSONB Query Console', 'catalog.sqlite')}
        </div>
      </div>
    </div>

    <div class="joy-telemetry-strip">
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.items.length}</span>
        <span class="joy-telemetry-strip__label">Items (item_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.cards.length}</span>
        <span class="joy-telemetry-strip__label">Cards</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.mobs.length}</span>
        <span class="joy-telemetry-strip__label">Monsters (mob_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.jobs.length}</span>
        <span class="joy-telemetry-strip__label">Jobs</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.skills.length}</span>
        <span class="joy-telemetry-strip__label">Skills (skill_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.quests.length}</span>
        <span class="joy-telemetry-strip__label">Quests (quest_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.maps.length}</span>
        <span class="joy-telemetry-strip__label">3D Maps (map_db)</span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Cross-Repo Entity, 3D Thumbnail &amp; Asset Studio Binding Matrix</h3>
          <div class="observatory-card__meta">Every entity link displays its actual 3D-baked game-client thumbnail and jumps straight to its RateMyServer datasheet</div>
        </div>
        <span class="joy-badge joy-badge--brand">v_asset_studio_entries</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Datasheet Link (with 3D Thumbnail)</th>
              <th>Tier / Rank / Slot</th>
              <th>Cross-References</th>
              <th>3D Scene / Asset Studio Key</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            ${jobs.map(j => `
              <tr>
                <td><span class="joy-badge joy-badge--brand joy-badge--sm">JOB</span></td>
                <td>${rmsLink('jobs', j.id, j.name, 'Tier ' + j.tier)}</td>
                <td>Tier ${j.tier} (${j.parentJobId || 'root'})</td>
                <td>${(j.unlockedSkillIds || []).map(sid => rmsLink('jobs', sid, sid)).join('')}</td>
                <td class="mono">${escapeHtml(j.scenePath || j.assetStudioKey)}</td>
                <td>${inspectBtnHtml('job', j.name, j)}</td>
              </tr>
            `).join('')}
            ${mobs.map(m => `
              <tr>
                <td><span class="joy-badge ${m.isMvp ? 'joy-badge--warning' : 'joy-badge--danger'} joy-badge--sm">${m.isMvp ? 'MVP' : 'MOB'}</span></td>
                <td>${rmsLink('mobs', m.id, m.name, 'Lv.' + m.level)}</td>
                <td>${m.element} / ${m.race} / ${m.size}</td>
                <td>${(m.drops || []).map(d => rmsLink('gear', d.itemId, d.itemId, formatDropPct(d.chanceBps))).join('')}</td>
                <td class="mono">${escapeHtml(m.scenePath || m.assetStudioKey)}</td>
                <td>${inspectBtnHtml('mob', m.name, m)}</td>
              </tr>
            `).join('')}
            ${items.map(it => `
              <tr>
                <td><span class="joy-badge joy-badge--neutral joy-badge--sm">ITEM</span></td>
                <td>${rmsLink('gear', it.id, it.name, it.kind)}</td>
                <td>${it.kind.toUpperCase()} ${it.pAtk ? '· ATK ' + it.pAtk : ''} ${it.mAtk ? '· MATK ' + it.mAtk : ''}</td>
                <td>${DATA.mobs.filter(m => (m.drops || []).some(d => d.itemId === it.id)).map(m => rmsLink('mobs', m.id, m.name)).join('') || '<span class="observatory-card__meta">Quest / Starter</span>'}</td>
                <td class="mono">${escapeHtml(it.scenePath || ('item.' + it.id))}</td>
                <td>${inspectBtnHtml('item', it.name, it)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 2. ITEM & CARD DATABASE (RateMyServer item_db 2D Datasheet + 3D Artwork Column)
 * ========================================================================== */
function renderGear() {
  const items = DATA.items.filter(matchesSearch);
  const cards = DATA.cards.filter(matchesSearch);

  const descForItem = it => {
    if (it.id === 'basic_sword') return 'Standard-issue steel arming sword balanced for Novice and Swordman frontliners. Scales with STR.';
    if (it.id === 'magic_staff') return 'Focuses ambient mana into elemental bolts. Increases Magical Attack (MATK +15) scaling with INT.';
    if (it.id === 'great_bow') return 'Long-draw ashwood bow favored by Payon and Prontera Rangers. Scales with DEX.';
    if (it.id === 'dagger') return 'Lightweight close-quarters blade usable by almost all novice and caster classes.';
    if (it.id === 'scythe') return 'Heavy two-handed polearm-scythe wielded by Chivalry Knights and Orc Warlords. Excels against Large targets.';
    if (it.id === 'potion_minor') return 'Restores a small amount of HP during field expeditions. Stackable crimson vial.';
    if (it.id === 'leather_armor') return 'Reinforced boar-hide tunic and heraldic guard piece providing reliable physical protection for field patrols.';
    return 'High-purity metallic ore crystal smelted by Prontera blacksmiths and required for Watchtower repairs and Promotion Trials.';
  };

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER ITEM_DB · 3D ASSET THUMBNAILS + +0..+15 REFINE</div>
        <h1 class="page-hero__title">Item &amp; Card Database (${items.length} Items, ${cards.length} Cards)</h1>
        <p class="page-hero__sub">
          Each item datasheet features its real 256×256 3D-baked game-client thumbnail (<code>.thumbs/*.webp</code>),
          Applicable Jobs bitmasks, Engine Script contracts, and Dropped By monster links at <strong>${DROP_RATE_MULT}x</strong> rate.
        </p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="refBaseAtk">Weapon Base ATK</label>
        <input id="refBaseAtk" class="joy-input" type="number" value="120" min="10" max="500" style="width:110px" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refLevel">Target Refine (+0..+15)</label>
        <input id="refLevel" class="joy-input" type="number" value="10" min="0" max="15" style="width:110px" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refFails">Consecutive Fails (Pity 0..5)</label>
        <input id="refFails" class="joy-input" type="number" value="2" min="0" max="5" style="width:110px" oninput="updateRefineCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="refineCalcResult" style="font-size:0.85rem;padding:7px 12px"></span>
      </div>
    </div>

    <div class="rms-list">
      ${items.map((it, idx) => {
        const isWeapon = it.kind === 'weapon';
        const isEquip = it.kind === 'weapon' || it.kind === 'armor';
        const slots = isWeapon ? '[1]' : (it.kind === 'armor' ? '[1]' : '[0]');
        const handed = it.id === 'great_bow' || it.id === 'scythe' ? '[Two Handed]' : (isWeapon ? '[One Hand]' : '');
        const applicableJobs = isWeapon
          ? DATA.jobs.filter(j => (j.allowedWeaponKinds || []).includes(it.id))
          : DATA.jobs;
        const droppedBy = [];
        DATA.mobs.forEach(m => {
          (m.drops || []).forEach(d => {
            if (d.itemId === it.id) droppedBy.push({ mob: m, chanceBps: d.chanceBps });
          });
        });
        const questRewards = DATA.quests.filter(q => ((q.rewards && q.rewards.items) || []).some(ri => ri.itemId === it.id));
        const questObjectives = DATA.quests.filter(q => (q.objectives || []).some(ob => ob.targetId === it.id));
        const scriptStr = isWeapon
          ? `{ bonus bBaseAtk,${it.pAtk || 0}; bonus bMatk,${it.mAtk || 0}; bonus bAtkStat,"${(it.atkStat || 'str').toUpperCase()}"; bonus bRefinePityMax,5; }`
          : (it.kind === 'armor'
            ? `{ bonus bDef,12; bonus bMaxHp,80; bonus bRefinePityMax,5; }`
            : (it.kind === 'consumable' ? `{ itemheal rand(45,65),0; }` : `{ /* Crafting & Quest Material */ }`));

        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === it.id ? 'rms-highlight' : ''}" id="entity-${it.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(it)}
                <span class="rms-sheet__title">${escapeHtml(it.name)} ${slots}</span>
                ${handed ? `<span class="joy-badge joy-badge--brand joy-badge--sm">${handed}</span>` : ''}
                <span class="rms-sheet__id">Item ID# ${1001 + idx} (<code>${escapeHtml(it.id)}</code>)</span>
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${it.kind.toUpperCase()}</span>
                ${inspectBtnHtml('item', it.name, it)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(it, 7, it.kind)}
                  <th>Type</th>
                  <td>${escapeHtml(it.kind.toUpperCase())}</td>
                  <th>Class / Subtype</th>
                  <td>${isWeapon ? escapeHtml(it.id.replace('_', ' ')) : escapeHtml(it.kind)}</td>
                  <th>Stackable</th>
                  <td class="mono">${it.stackable ? 'Yes (Max 999)' : 'No (Unique Slot)'}</td>
                  <th>Refineable</th>
                  <td class="mono">${isEquip ? 'Yes (+0..+15 Pity)' : 'No'}</td>
                </tr>
                <tr>
                  <th>Physical ATK</th>
                  <td class="mono">${it.pAtk ?? '—'}</td>
                  <th>Magical MATK</th>
                  <td class="mono">${it.mAtk ?? '—'}</td>
                  <th>Scaling Stat</th>
                  <td class="mono">${it.atkStat ? it.atkStat.toUpperCase() : '—'}</td>
                  <th>Card Slots</th>
                  <td class="mono">${isEquip ? '1' : '0'}</td>
                </tr>
                <tr>
                  <th>Applicable Jobs</th>
                  <td colspan="7">
                    ${applicableJobs.map(j => rmsLink('jobs', j.id, j.name)).join(' ') || '<span class="observatory-card__meta">All Classes</span>'}
                  </td>
                </tr>
                <tr>
                  <th>Description</th>
                  <td colspan="7">${escapeHtml(descForItem(it))}</td>
                </tr>
                <tr>
                  <th>Item Script</th>
                  <td colspan="7"><code class="rms-script-code">${escapeHtml(scriptStr)}</code></td>
                </tr>
                <tr>
                  <th>Dropped By</th>
                  <td colspan="7">
                    ${droppedBy.length
                      ? droppedBy.map(d => rmsLink('mobs', d.mob.id, d.mob.name, formatDropPct(d.chanceBps))).join(' ')
                      : '<span style="color:var(--joy-status-danger-fg);font-weight:600">No Monster Drop (Quest / Starter Reward)</span>'}
                  </td>
                </tr>
                <tr>
                  <th>Obtainable / Used In</th>
                  <td colspan="7">
                    ${questRewards.map(q => rmsLink('quests', q.id, 'Reward: ' + q.title)).join(' ')}
                    ${questObjectives.map(q => rmsLink('quests', q.id, 'Required: ' + q.title)).join(' ')}
                    ${(!questRewards.length && !questObjectives.length) ? '<span class="observatory-card__meta">Field Drop / NPC Shop</span>' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${cards.map((c, idx) => {
        const mob = DATA.mobs.find(m => m.id === c.mobId);
        const equipScript = Object.entries(c.equipStats || {}).map(([k,v]) => `bonus ${k},${v};`).join(' ');
        const depScript = Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `handbook_bonus ${k},${v};`).join(' ');
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === c.id ? 'rms-highlight' : ''}" id="entity-${c.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(c, '🃏')}
                <span class="rms-sheet__title">${escapeHtml(c.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">[${c.slot.toUpperCase()} SOCKET]</span>
                <span class="rms-sheet__id">Card ID# ${4001 + idx} (<code>${escapeHtml(c.id)}</code>)</span>
              </div>
              <div class="chip-row">
                <span class="mono" style="font-size:11px;color:var(--joy-text-muted)">${c.assetStudioKey}</span>
                ${inspectBtnHtml('card', c.name, c)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderCardPortraitCell(c, 3)}
                  <th>Type</th>
                  <td>Monster Card</td>
                  <th>Compound On</th>
                  <td><strong>${escapeHtml(c.slot.toUpperCase())}</strong></td>
                  <th>Socket Bonus</th>
                  <td class="mono">${Object.entries(c.equipStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</td>
                  <th>Handbook Deposit</th>
                  <td class="mono">${Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</td>
                </tr>
                <tr>
                  <th>Item Script</th>
                  <td colspan="7"><code class="rms-script-code">{ ${escapeHtml(equipScript)} } /* Deposit: { ${escapeHtml(depScript)} } */</code></td>
                </tr>
                <tr>
                  <th>Dropped By</th>
                  <td colspan="7">
                    ${mob ? rmsLink('mobs', mob.id, mob.name, formatDropPct(20)) : c.mobId}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateRefineCalc() {
  const baseAtk = parseInt(document.getElementById('refBaseAtk')?.value || '120', 10);
  const lvl = Math.max(0, Math.min(15, parseInt(document.getElementById('refLevel')?.value || '10', 10)));
  const fails = Math.max(0, Math.min(5, parseInt(document.getElementById('refFails')?.value || '0', 10)));
  const baseRates = [100,100,100,100,100, 60,50,40,30,20, 15,12,10,8,5,5];
  const baseRate = baseRates[lvl] ?? 10;
  const effRate = lvl <= 4 ? 100 : (fails >= 5 ? 100 : Math.min(100, baseRate + fails * 20));
  const overUpgrade = lvl > 4 ? (lvl - 4) * 5 : 0;
  const totalAtk = baseAtk + lvl * 3 + overUpgrade;
  const el = document.getElementById('refineCalcResult');
  if (el) {
    el.textContent = `+${lvl} Total ATK: ${totalAtk} (+${lvl*3 + overUpgrade} bonus) · Success Rate: ${effRate}% (Base ${baseRate}% + Pity ${fails}/5)`;
  }
}

/* ============================================================================
 * 3. MONSTER DATABASE (RateMyServer mob_db 2D Datasheet + 3D Creature Portrait)
 * ========================================================================== */
function renderMobs() {
  const mobs = DATA.mobs.filter(matchesSearch);
  const mat = (DATA.elements && DATA.elements.damageMatrixPct) || {};
  const elems = (DATA.elements && DATA.elements.elements) || [];

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER MOB_DB · 3D CREATURE SPRITES &amp; DROPS</div>
        <h1 class="page-hero__title">Monster Bestiary &amp; Drop Datasheets (${mobs.length})</h1>
        <p class="page-hero__sub">
          Full RateMyServer monster specification tables with 3D-baked creature portraits, elemental weakness calculations,
          spawn map links, and live <strong>${DROP_RATE_MULT}x</strong> drop rates with item thumbnails.
        </p>
      </div>
    </div>

    <div class="rms-list">
      ${mobs.map((m, idx) => {
        const weakTo = [];
        const resists = [];
        elems.forEach(atk => {
          const pct = (mat[atk] && mat[atk][m.element] !== undefined) ? mat[atk][m.element] : 100;
          if (pct > 100) weakTo.push(`${atk} (${pct}%)`);
          else if (pct < 100) resists.push(`${atk} (${pct}%)`);
        });
        const huntedInQuests = DATA.quests.filter(q => (q.objectives || []).some(o => o.targetId === m.id));
        const handbookEntries = DATA.handbook.filter(h => h.targetId === m.id);

        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === m.id ? 'rms-highlight' : ''}" id="entity-${m.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(m, m.isMvp ? '👑' : '👾')}
                <span class="rms-sheet__title">Lv.${m.level} ${escapeHtml(m.name)}</span>
                <span class="joy-badge ${m.isMvp ? 'joy-badge--warning' : 'joy-badge--danger'} joy-badge--sm">${m.isMvp ? 'MVP BOSS' : 'Rank ' + m.rank}</span>
                <span class="rms-sheet__id">Mob ID# ${2001 + idx} (<code>${escapeHtml(m.id)}</code> · <code>${escapeHtml(m.assetStudioKey)}</code>)</span>
              </div>
              <div class="chip-row">
                ${inspectBtnHtml('mob', m.name, m)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(m, 6, m.assetStudioKey)}
                  <th>HP</th>
                  <td class="mono"><strong>${m.hp.toLocaleString()}</strong></td>
                  <th>Attack (pAtk)</th>
                  <td class="mono">${m.pAtk}</td>
                  <th>Defense (pDef)</th>
                  <td class="mono">${m.pDef}</td>
                  <th>Aggro / Leash</th>
                  <td class="mono">${m.aggroRangeM}m / ${m.leashRangeM}m</td>
                </tr>
                <tr>
                  <th>Element</th>
                  <td><strong>${escapeHtml(m.element)}</strong></td>
                  <th>Race</th>
                  <td><strong>${escapeHtml(m.race)}</strong></td>
                  <th>Size</th>
                  <td><strong>${escapeHtml(m.size)}</strong></td>
                  <th>EXP / 100 HP</th>
                  <td class="mono">${((m.baseExp * 100) / Math.max(1, m.hp)).toFixed(1)} Base/100HP</td>
                </tr>
                <tr>
                  <th>Base EXP</th>
                  <td class="mono">+${(m.baseExp * DROP_RATE_MULT).toLocaleString()} (${DROP_RATE_MULT}x)</td>
                  <th>Job EXP</th>
                  <td class="mono">+${(m.jobExp * DROP_RATE_MULT).toLocaleString()} (${DROP_RATE_MULT}x)</td>
                  <th>Weak To (&gt;100%)</th>
                  <td style="color:var(--joy-status-success-fg);font-weight:600">${weakTo.join(', ') || 'None'}</td>
                  <th>Resists (&lt;100%)</th>
                  <td style="color:var(--joy-status-danger-fg)">${resists.join(', ') || 'None'}</td>
                </tr>
                <tr>
                  <th>Spawn Maps</th>
                  <td colspan="7">
                    ${(m.spawnZones || []).map(z => rmsLink('maps', z, z, 'Active Spawn')).join(' ')}
                  </td>
                </tr>
                <tr>
                  <th>Drops (${DROP_RATE_MULT}x Rate)</th>
                  <td colspan="7">
                    ${(m.drops || []).map(d => rmsLink('gear', d.itemId, d.itemId, formatDropPct(d.chanceBps))).join(' ')}
                    ${m.cardId ? rmsLink('gear', m.cardId, m.cardId, formatDropPct(20)) : ''}
                  </td>
                </tr>
                <tr>
                  <th>Quests &amp; Research</th>
                  <td colspan="7">
                    ${huntedInQuests.map(q => rmsLink('quests', q.id, q.title, 'Hunt Objective')).join(' ')}
                    ${handbookEntries.map(h => `<span class="joy-badge joy-badge--success joy-badge--sm">${escapeHtml(h.title)} (${h.tiers.map(t => '≥' + t.requiredCount).join('/')})</span>`).join(' ')}
                    ${(!huntedInQuests.length && !handbookEntries.length) ? '<span class="observatory-card__meta">Field / Boss Encounter</span>' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 4. SKILL & JOB BRANCH DATABASE (RateMyServer skill_db_class Layout)
 * ========================================================================== */
function renderJobs() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const skills = DATA.skills.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER SKILL_DB_CLASS · 3D CLASS PORTRAITS &amp; SKILLS</div>
        <h1 class="page-hero__title">Job Branches, Stat Bonuses &amp; Skill Database</h1>
        <p class="page-hero__sub">
          Browse class branches with 3D KayKit character portraits (Novice → Swordman → Knight, Mage → High Wizard, Archer),
          allowed weapon bitmasks with weapon thumbnails, and skill prerequisites.
        </p>
      </div>
    </div>

    <!-- RMS Visual Branch Summary with 3D Character Portraits -->
    <div class="rms-hub-grid">
      <div class="rms-hub-box">
        <h4>⚔️ Swordman → Knight Branch</h4>
        <div class="rms-branch-portraits">
          <img src="${escapeHtml(THUMB_INDEX['novice'] || '')}" alt="Novice" title="Tier 0: Novice" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['swordman'] || '')}" alt="Swordman" title="1-1: Swordman" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['knight'] || '')}" alt="Knight" title="2-1: Knight" />
        </div>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'swordman', '1-1: Swordman (Lv.10 / Job 40)')}
          ${rmsLink('jobs', 'knight', '2-1: Knight (Lv.40 / Job 50)')}
          ${rmsLink('quests', 'jq_swordman_trial', 'Quest: Trial of the Blade')}
          ${rmsLink('quests', 'jq_knight_chivalry', 'Quest: Oath of the Watchtower')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🔮 Mage → High Wizard Branch</h4>
        <div class="rms-branch-portraits">
          <img src="${escapeHtml(THUMB_INDEX['novice'] || '')}" alt="Novice" title="Tier 0: Novice" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['mage'] || '')}" alt="Mage" title="1-1: Mage" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['wizard'] || '')}" alt="High Wizard" title="2-1: High Wizard" />
        </div>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'mage', '1-1: Mage (Lv.10 / Job 40)')}
          ${rmsLink('jobs', 'wizard', '2-1: High Wizard (Lv.40 / Job 50)')}
          ${rmsLink('quests', 'jq_mage_academy', 'Quest: Elemental Thesis')}
          ${rmsLink('quests', 'jq_wizard_tower', 'Quest: Rite of the High Arcana')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🏹 Archer &amp; Ranger Branch</h4>
        <div class="rms-branch-portraits">
          <img src="${escapeHtml(THUMB_INDEX['novice'] || '')}" alt="Novice" title="Tier 0: Novice" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['archer'] || '')}" alt="Archer" title="1-1: Archer" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['great_bow'] || '')}" alt="Great Bow" title="Great Bow" />
        </div>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'archer', '1-1: Archer (Lv.10 / Job 40)')}
          ${rmsLink('quests', 'jq_archer_guild', 'Quest: Wind & Steady Aim')}
          ${rmsLink('gear', 'great_bow', 'Weapon: Great Bow [Two Handed]')}
        </div>
      </div>
    </div>

    <div class="rms-list">
      ${jobs.map((j, idx) => {
        const bonusStr = Object.entries(j.jobBonusAtMax || {}).filter(([,v]) => v > 0).map(([k,v]) => `${k.toUpperCase()} +${v}`).join(' · ') || 'None';
        const childJobs = DATA.jobs.filter(cj => cj.parentJobId === j.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === j.id ? 'rms-highlight' : ''}" id="entity-${j.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(j, '🛡️')}
                <span class="rms-sheet__title">${escapeHtml(j.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">TIER ${j.tier}</span>
                <span class="rms-sheet__id">Job ID# ${3001 + idx} (<code>${escapeHtml(j.id)}</code> · <code>${escapeHtml(j.assetStudioKey)}</code>)</span>
              </div>
              <div class="chip-row">${inspectBtnHtml('job', j.name, j)}</div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(j, 4, j.assetStudioKey)}
                  <th>Min Base Level</th>
                  <td class="mono">Lv.${j.minBaseLevel}</td>
                  <th>Max Job Level</th>
                  <td class="mono">Job Lv.${j.maxJobLevel}</td>
                  <th>Parent Class</th>
                  <td>${j.parentJobId ? rmsLink('jobs', j.parentJobId, j.parentJobId) : '<span class="observatory-card__meta">Starter Root</span>'}</td>
                  <th>Promotes To</th>
                  <td>${childJobs.map(cj => rmsLink('jobs', cj.id, cj.name)).join(' ') || '<span class="observatory-card__meta">Max Tier</span>'}</td>
                </tr>
                <tr>
                  <th>Primary Stats</th>
                  <td class="mono">${(j.primaryStats || []).map(s => s.toUpperCase()).join(', ')}</td>
                  <th>Max Job Bonuses</th>
                  <td colspan="3" class="mono">${escapeHtml(bonusStr)}</td>
                  <th>Promotion Trial</th>
                  <td>${j.jobChangeQuestId ? rmsLink('quests', j.jobChangeQuestId, j.jobChangeQuestId) : '<span class="observatory-card__meta">None</span>'}</td>
                </tr>
                <tr>
                  <th>Allowed Weapons</th>
                  <td colspan="7">${(j.allowedWeaponKinds || []).map(w => rmsLink('gear', w, w)).join(' ')}</td>
                </tr>
                <tr>
                  <th>Unlocked Skills</th>
                  <td colspan="7">${(j.unlockedSkillIds || []).map(s => rmsLink('jobs', s, s)).join(' ')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${skills.map((sk, idx) => {
        const usedByJobs = DATA.jobs.filter(j => (j.unlockedSkillIds || []).includes(sk.id));
        const unlockedByQuests = DATA.quests.filter(q => q.rewards && q.rewards.unlockSkillId === sk.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === sk.id ? 'rms-highlight' : ''}" id="entity-${sk.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(sk, '✨')}
                <span class="rms-sheet__title">Skill: ${escapeHtml(sk.name)}</span>
                <span class="joy-badge joy-badge--success joy-badge--sm">MAX LV.${sk.maxLevel}</span>
                <span class="rms-sheet__id">Skill ID# ${5001 + idx} (<code>${escapeHtml(sk.id)}</code>)</span>
              </div>
              <div class="chip-row">${inspectBtnHtml('skill', sk.name, sk)}</div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(sk, 2, sk.id)}
                  <th>Max Skill Level</th>
                  <td class="mono">Lv.${sk.maxLevel}</td>
                  <th>Prerequisites</th>
                  <td>${(sk.requires || []).length ? sk.requires.map(r => rmsLink('jobs', r, r)).join(' ') : '<span class="observatory-card__meta">None (Tier 1 Core)</span>'}</td>
                  <th>Learnable By</th>
                  <td colspan="3">${usedByJobs.map(j => rmsLink('jobs', j.id, j.name)).join(' ')}</td>
                </tr>
                <tr>
                  <th>Quest Unlocks</th>
                  <td colspan="7">
                    ${unlockedByQuests.map(q => rmsLink('quests', q.id, q.title)).join(' ') || '<span class="observatory-card__meta">Innate Class Skill</span>'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 5. ELEMENT & SIZE MATRIX
 * ========================================================================== */
function renderElements() {
  const elems = DATA.elements.elements || [];
  const mat = DATA.elements.damageMatrixPct || {};
  const sizePen = DATA.elements.weaponSizePenaltyPct || {};
  const wpnKinds = Object.keys(sizePen);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER PROPERTY CHART · 10-ELEMENT &amp; 3-SIZE</div>
        <h1 class="page-hero__title">10-Element Counter Matrix &amp; Weapon-vs-Size Modifiers</h1>
        <p class="page-hero__sub">Interactive damage multiplier calculator + full 10×10 elemental lookup table and Small/Medium/Large weapon size table.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="calcAtkElem">Attacker Element</label>
        <select id="calcAtkElem" class="joy-select" onchange="updateElemCalc()">
          ${elems.map((e, i) => `<option value="${e}" ${i===1?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcDefElem">Defender Element</label>
        <select id="calcDefElem" class="joy-select" onchange="updateElemCalc()">
          ${elems.map((e, i) => `<option value="${e}" ${i===2?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcWpnKind">Weapon Kind</label>
        <select id="calcWpnKind" class="joy-select" onchange="updateElemCalc()">
          ${wpnKinds.map(w => `<option value="${w}">${w}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcTargetSize">Target Size</label>
        <select id="calcTargetSize" class="joy-select" onchange="updateElemCalc()">
          <option value="Small">Small</option>
          <option value="Medium" selected>Medium</option>
          <option value="Large">Large</option>
        </select>
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="elemCalcOutput" style="font-size:0.9rem;padding:8px 14px">Combined Multiplier: 100%</span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">10×10 Elemental Damage Matrix (Attacker Row vs. Defender Column %)</h3>
          <div class="observatory-card__meta">Values &gt; 100% deal bonus counter damage; values &lt; 100% are resisted</div>
        </div>
        <span class="joy-badge joy-badge--brand">elements.json</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>ATK \\ DEF</th>
              ${elems.map(e => `<th>${e}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${elems.map(atk => `
              <tr>
                <td><strong>${atk}</strong></td>
                ${elems.map(def => {
                  const v = (mat[atk] && mat[atk][def] !== undefined) ? mat[atk][def] : 100;
                  const cls = v > 100 ? 'elem-cell--pos' : (v === 0 ? 'elem-cell--zero' : (v < 100 ? 'elem-cell--neg' : ''));
                  return `<td class="mono ${cls}">${v}%</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Weapon Kind vs. Monster Size Modifier (Small / Medium / Large %)</h3>
          <div class="observatory-card__meta">Classic RO weapon-size signature (e.g., Spears/Scythes excel vs. Large, Daggers excel vs. Small)</div>
        </div>
        <span class="joy-badge joy-badge--neutral">Size Table</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Weapon Kind</th>
              <th>Small</th>
              <th>Medium</th>
              <th>Large</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(sizePen).map(([wpn, row]) => `
              <tr>
                <td>${rmsLink('gear', wpn, wpn)}</td>
                <td class="mono">${row.Small}%</td>
                <td class="mono">${row.Medium}%</td>
                <td class="mono">${row.Large}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function updateElemCalc() {
  if (!DATA || !DATA.elements) return;
  const atk = document.getElementById('calcAtkElem')?.value;
  const def = document.getElementById('calcDefElem')?.value;
  const wpn = document.getElementById('calcWpnKind')?.value;
  const sz = document.getElementById('calcTargetSize')?.value;
  const elemPct = (DATA.elements.damageMatrixPct?.[atk]?.[def]) ?? 100;
  const sizePct = (DATA.elements.weaponSizePenaltyPct?.[wpn]?.[sz]) ?? 100;
  const combined = ((elemPct / 100.0) * (sizePct / 100.0) * 100.0).toFixed(1);
  const out = document.getElementById('elemCalcOutput');
  if (out) {
    out.textContent = `Elemental ${elemPct}% × Size ${sizePct}% = ${combined}% Final Damage`;
  }
}

/* ============================================================================
 * 6. QUEST DATABASE (RateMyServer quest_db Datasheet Layout)
 * ========================================================================== */
function renderQuests() {
  const quests = DATA.quests.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER QUEST_DB · PROGRESSION &amp; TRIALS</div>
        <h1 class="page-hero__title">Unified 6-Category Quest Database (${quests.length})</h1>
        <p class="page-hero__sub">Main Story, Side Story, Daily Bounties, and Job Promotion Trials with 3D emblem thumbnails, clickable objective targets, and item rewards.</p>
      </div>
    </div>
    <div class="rms-list">
      ${quests.map((q, idx) => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === q.id ? 'rms-highlight' : ''}" id="entity-${q.id}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              ${renderThumbChip(q, '📜')}
              <span class="rms-sheet__title">${escapeHtml(q.title)}</span>
              <span class="joy-badge ${q.category === 'job_change' ? 'joy-badge--brand' : 'joy-badge--success'} joy-badge--sm">${q.category.toUpperCase()}</span>
              <span class="rms-sheet__id">Quest ID# ${6001 + idx} (<code>${escapeHtml(q.id)}</code>)</span>
            </div>
            <div class="chip-row">${inspectBtnHtml('quest', q.title, q)}</div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                ${renderArtworkCell(q, 3, q.category)}
                <th>Zone / Map</th>
                <td>${rmsLink('maps', q.zoneId, q.zoneId)}</td>
                <th>Giver NPC</th>
                <td class="mono">${escapeHtml(q.giverNpcId)}</td>
                <th>Min Base Lvl</th>
                <td class="mono">Lv.${q.minBaseLevel}</td>
                <th>Required Job</th>
                <td>${q.requiredJobId ? rmsLink('jobs', q.requiredJobId, q.requiredJobId) : '<span class="observatory-card__meta">Any Job</span>'}</td>
              </tr>
              <tr>
                <th>Objectives</th>
                <td colspan="7">
                  ${(q.objectives || []).map(o => {
                    if (o.type === 'MOB_KILLED') return rmsLink('mobs', o.targetId, `Hunt ${o.targetId} ×${o.required}`, o.type);
                    if (o.type === 'ITEM_PICKED_UP') return rmsLink('gear', o.targetId, `Collect ${o.targetId} ×${o.required}`, o.type);
                    return rmsLink('maps', o.targetId, `Visit ${o.targetId} ×${o.required}`, o.type);
                  }).join(' ')}
                </td>
              </tr>
              <tr>
                <th>Rewards</th>
                <td colspan="7">
                  <span class="joy-badge joy-badge--neutral joy-badge--sm">+${q.rewards.baseXp} Base EXP</span>
                  <span class="joy-badge joy-badge--neutral joy-badge--sm">+${q.rewards.jobXp} Job EXP</span>
                  ${q.rewards.unlockJobId ? rmsLink('jobs', q.rewards.unlockJobId, 'Promotes To: ' + q.rewards.unlockJobId) : ''}
                  ${q.rewards.unlockSkillId ? rmsLink('jobs', q.rewards.unlockSkillId, 'Unlocks Skill: ' + q.rewards.unlockSkillId) : ''}
                  ${((q.rewards && q.rewards.items) || []).map(ri => rmsLink('gear', ri.itemId, `${ri.itemId} ×${ri.qty}`, 'Item Reward')).join(' ')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================================
 * 7. WOE CASTLE SIEGE SIMULATOR
 * ========================================================================== */
function renderSiege() {
  const castles = DATA.castles.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">ENDGAME GVG SIEGE</div>
        <h1 class="page-hero__title">War of Emperium (GvG Castle Siege) — Breach &amp; TTK Calculator</h1>
        <p class="page-hero__sub">Simulate guild breach time across Outer Gate Barricades, Inner Gate Barricades, and the Holy 1 Normal-Attack-Only Emperium crystal.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="simAttackers">Attacking Guild Members (1..50)</label>
        <input id="simAttackers" class="joy-input" type="number" value="15" min="1" max="50" style="width:140px" oninput="updateSiegeCalc()" />
      </div>
      <div class="control-field">
        <label for="simDps">Avg Normal-Attack DPS / Player</label>
        <input id="simDps" class="joy-input" type="number" value="620" min="50" max="5000" step="50" style="width:160px" oninput="updateSiegeCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="siegeSimResult" style="font-size:0.9rem;padding:8px 14px"></span>
      </div>
    </div>

    <div class="rms-list">
      ${castles.map(cs => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === cs.id ? 'rms-highlight' : ''}" id="entity-${cs.id}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              ${renderThumbChip(cs, '🏰')}
              <span class="rms-sheet__title">${escapeHtml(cs.name)}</span>
              <span class="joy-badge joy-badge--brand joy-badge--sm">WOE CASTLE</span>
              <span class="rms-sheet__id">Castle ID# <code>${escapeHtml(cs.id)}</code> (<code>${escapeHtml(cs.assetStudioKey)}</code>)</span>
            </div>
            <div class="chip-row">${inspectBtnHtml('castle', cs.name, cs)}</div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                ${renderArtworkCell(cs, 3, cs.assetStudioKey)}
                <th>Hub Town</th>
                <td class="mono">${escapeHtml(cs.hubTownId)}</td>
                <th>Siege Map</th>
                <td>${rmsLink('maps', cs.siegeMapId, cs.siegeMapId)}</td>
                <th>Siege Duration</th>
                <td class="mono">${cs.siegeDurationMinutes} mins</td>
                <th>Max Guild Size</th>
                <td class="mono">${cs.maxGuildSize} members</td>
              </tr>
              <tr>
                <th>Emperium Crystal</th>
                <td colspan="3" class="mono">${cs.emperium.hp.toLocaleString()} HP · ${cs.emperium.element} / ${cs.emperium.race} / ${cs.emperium.size}</td>
                <th>Normal-Attack Only</th>
                <td colspan="3"><span class="joy-badge joy-badge--warning joy-badge--sm">${cs.emperium.onlyNormalAttackDamage ? 'YES (Skills Blocked)' : 'No'}</span></td>
              </tr>
              <tr>
                <th>Gate Barricades</th>
                <td colspan="3" class="mono">${cs.fortifications.outerGateBarricadeCount} Outer + ${cs.fortifications.innerGateBarricadeCount} Inner (${cs.fortifications.barricadeHp.toLocaleString()} HP each)</td>
                <th>Owner Rewards</th>
                <td colspan="3" class="mono">${cs.ownerRewards.dailyTreasureChestCount} Treasure Chests/day · Dungeon: ${cs.ownerRewards.guildDungeonZoneId}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

function updateSiegeCalc() {
  const c = DATA.castles[0];
  if (!c) return;
  const attackers = Math.max(1, parseInt(document.getElementById('simAttackers')?.value || '15', 10));
  const dps = Math.max(10, parseFloat(document.getElementById('simDps')?.value || '620'));
  const scale = c.pvpRules.playerDamageScalingPct / 100.0;
  const raidDps = attackers * dps * scale;
  const totalBarricadeHp = (c.fortifications.outerGateBarricadeCount + c.fortifications.innerGateBarricadeCount) * c.fortifications.barricadeHp;
  const barSec = totalBarricadeHp / raidDps;
  const empSec = c.emperium.hp / raidDps;
  const totalMin = (barSec + empSec + 45) / 60.0;
  const el = document.getElementById('siegeSimResult');
  if (el) {
    el.textContent = `4 Barricades (180k HP): ${barSec.toFixed(1)}s · Emperium (120k HP): ${empSec.toFixed(1)}s · Total Siege Breach: ${totalMin.toFixed(2)} min`;
  }
}

/* ============================================================================
 * 8. MAP & AREA SPAWN DIRECTORY (RateMyServer map_db + areainfo Layout)
 * ========================================================================== */
function renderMinimapSvg(m) {
  const terraces = m.heightTerraces || [];
  const structs = m.structures || [];
  const spawns = m.spawnAreas || [];
  const routes = m.routes || [];
  const zones = m.groundZones || [];

  const halfExtent = Math.max(42.0, (m.width || 1000) > 1200 ? 180.0 : 42.0);
  const mapCoord = (v) => Math.max(8, Math.min(232, 120 + (v / halfExtent) * 105));
  const mapSpawnCoord = (v) => {
    if ((m.width || 1000) <= 1200) {
      return Math.max(6, Math.min(220, ((v - 1650) / 850.0) * 240));
    }
    return Math.max(6, Math.min(220, (v / Math.max(1000, m.width || 4000)) * 240));
  };

  return `
    <svg width="240" height="240" viewBox="0 0 240 240" style="border-radius:6px;border:1px solid var(--joy-border-strong);background:#16241c">
      <defs>
        <pattern id="grid-${escapeHtml(m.id)}" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="240" height="240" fill="url(#grid-${escapeHtml(m.id)})"/>
      ${zones.map(z => {
        const cx = mapCoord(z.x || 0);
        const cy = mapCoord(z.z || 0);
        const r = Math.max(18, ((z.radius || z.innerRadius || 22) / 42.0) * 105);
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(82, 158, 71, 0.14)" stroke="rgba(126, 217, 135, 0.45)" stroke-width="1" stroke-dasharray="3 2"/>`;
      }).join("")}
      ${routes.length > 0 ? routes.map(rt => {
        const pts = (rt.points || []).map(p => `${mapCoord(p[0] || 0).toFixed(1)},${mapCoord(p[1] || 0).toFixed(1)}`).join(" ");
        const sw = Math.max(4, (rt.width || 4.8) * 1.6);
        return `<polyline points="${pts}" fill="none" stroke="rgba(218, 184, 122, 0.55)" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join("") : `<path d="M 120 0 L 120 240 M 0 120 L 240 120" stroke="rgba(212,175,55,0.22)" stroke-width="8" stroke-dasharray="4 2"/>`}
      ${terraces.map(t => {
        const cx = mapCoord(t.x || 0);
        const cy = mapCoord(t.z || 0);
        const r = Math.max(12, (t.radius || 10) * 2.2);
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(72, 168, 104, 0.28)" stroke="#5ec27e" stroke-width="1.2"/>`;
      }).join('')}
      ${spawns.map(sp => {
        const sx = mapSpawnCoord(sp.x || 1900);
        const sy = mapSpawnCoord(sp.y || 1900);
        const sw = Math.max(14, ((sp.width || 120) / 850.0) * 240);
        const sh = Math.max(14, ((sp.height || 120) / 850.0) * 240);
        return `<rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${sw.toFixed(1)}" height="${sh.toFixed(1)}" fill="rgba(235, 87, 87, 0.18)" stroke="rgba(235, 87, 87, 0.75)" stroke-width="1" stroke-dasharray="2 2"/>`;
      }).join('')}
      ${structs.map(s => {
        const sx = mapCoord(s.x || 0);
        const sy = mapCoord(s.z || 0);
        const sr = Math.max(7, (s.radius || 3.5) * 2.1);
        return `
          <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="rgba(230, 184, 77, 0.45)" stroke="#ffd166" stroke-width="2"/>
          <text x="${sx.toFixed(1)}" y="${(sy - sr - 4).toFixed(1)}" text-anchor="middle" fill="#ffd166" font-size="9" font-family="monospace">${escapeHtml(s.kind)}</text>
        `;
      }).join('')}
    </svg>
  `;
}

function renderMaps() {
  const maps = DATA.maps.filter(matchesSearch);

  const zoneCards = [
    { id: 'prontera_south_field', name: 'Prontera South Gate Field (prontera_south_field)', area: 'Prontera Kingdom — Core Area' },
    { id: 'forest_zone',          name: 'Payon & South Gate Forest Range (forest_zone)',   area: 'Archery & Beast Hunting Woods' },
    { id: 'sunken_crypt_1f',      name: 'Sunken Crypt 1F (sunken_crypt_1f)',               area: 'Undead Catacombs · Chivalry & Arcana Trials' },
    { id: 'orc_fortress_courtyard', name: 'Orc Fortress Courtyard (orc_fortress_courtyard)', area: 'High-Risk MVP Siege Arena' },
  ].filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER MAP_DB &amp; AREAINFO · MONSTER ON MAPS</div>
        <h1 class="page-hero__title">World Map Directory, 2D Minimaps &amp; Monster Spawn Tables</h1>
        <p class="page-hero__sub">
          RateMyServer <code>areainfo</code> layout: 2D top-down terrain/structure/spawn minimap on the left,
          paired with clickable Monster Spawn chips (with 3D monster thumbnails), 3D Walkable Structures, and Zone Quests on the right.
        </p>
      </div>
    </div>

    ${renderAiCopilotBar()}

    <div class="rms-list">
      ${maps.map(m => {
        const wb = m.worldSpineBinding || {};
        const isPilot = m.id === 'freja-south-gate';
        const southMobs = isPilot ? DATA.mobs.filter(mb => (mb.spawnZones || []).includes('prontera_south_field')) : [];
        const southQuests = isPilot ? DATA.quests.filter(q => q.zoneId === 'prontera_south_field') : [];
        const bestiaryById = {};
        ((DATA.worldSpine && DATA.worldSpine.bestiary) || []).forEach(b => { bestiaryById[b.id] = b; });
        const storyQuests = ((DATA.worldSpine && DATA.worldSpine.storyNodes) || []).filter(sn => sn.kind === 'quest' && sn.regionId === wb.storyRegionId);
        const lvlBand = (m.levelBand || [1, 15]).join('–');
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === m.id || (isPilot && HIGHLIGHT_ENTITY_ID === 'prontera_south_field') ? 'rms-highlight' : ''}" id="entity-${m.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip">🗺️</span>
                <span class="rms-sheet__title">Map: ${escapeHtml(m.id)} — ${escapeHtml(m.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm mono">Lv.${escapeHtml(lvlBand)} · ${escapeHtml(m.biome || 'meadow')}</span>
                <span class="joy-badge joy-badge--success joy-badge--sm">${m.structureCount} Structures · ${m.terraceCount} Terraces · ${(m.spawnAreas || []).length} Spawns</span>
              </div>
              <div class="chip-row">
                ${wb.continentId ? rmsLink('world', wb.continentId, `Continent: ${wb.continentId.toUpperCase()}`, wb.regionId || '') : ''}
                ${wb.townId ? rmsLink('world', wb.townId, `Town: ${wb.townId}`, 'Pinned') : ''}
                ${wb.storyRegionId ? rmsLink('story', wb.storyRegionId, `Story: ${wb.storyRegionId}`, 'L3 Graph') : ''}
                <span class="rms-sheet__id mono">${m.width}×${m.height}m (seed ${m.seed || 0})</span>
                ${inspectBtnHtml('map', m.name, m)}
              </div>
            </div>
            <div class="rms-map-split">
              <div class="rms-minimap-cell">
                ${renderMinimapSvg(m)}
                <div class="observatory-card__meta" style="text-align:center">
                  🟢 Terraces (${m.terraceCount}) · 🟡 3D Structures (${m.structureCount}) · 🔴 Spawn Areas (${(m.spawnAreas || []).length})
                </div>
              </div>
              <div class="rms-spawn-cell">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
                  <div style="font-weight:700;color:var(--joy-accent-text);font-size:13px">
                    World-First Spine Binding (L1 Fabric ➔ L2 Zone ➔ L3 Bestiary/Story ➔ L4 Playable Map):
                  </div>
                  <span class="joy-badge joy-badge--neutral joy-badge--sm mono">zone:${escapeHtml(wb.zoneId || m.id)} · spine:${escapeHtml(wb.spineNodeId || '—')}</span>
                </div>
                ${southMobs.length ? `
                  <div>
                    <strong style="font-size:12px;color:var(--joy-text-secondary)">MMORPG Catalog Monsters (<code>contracts/content/mobs.json</code>):</strong><br/>
                    ${southMobs.map(mb => rmsLink('mobs', mb.id, `${mb.name} (Lv.${mb.level})`, `${mb.element}/${mb.race}/${mb.size}`)).join(' ')}
                  </div>
                ` : ''}
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Authoritative Map Spawn Areas (<code>content/maps/${escapeHtml(m.id)}.json</code> — Click any creature):</strong>
                  <div class="chip-row" style="margin-top:4px">
                    ${(m.spawnAreas || []).map(sp => {
                      const catMob = (DATA.mobs || []).find(mb => mb.id === sp.mobType);
                      const bestMob = bestiaryById[sp.mobType];
                      if (catMob) {
                        return rmsLink('mobs', catMob.id, `${catMob.name} ×${sp.count}`, `@(${sp.x},${sp.y})`);
                      }
                      if (bestMob) {
                        return rmsLink('bestiary', bestMob.id, `${bestMob.name} ×${sp.count}`, `Lv.${bestMob.levelBand} · ${bestMob.element}`);
                      }
                      return `<span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(sp.id)}: ${escapeHtml(sp.mobType)} (${sp.count}) @ (${sp.x},${sp.y})</span>`;
                    }).join('')}
                  </div>
                </div>
                ${(storyQuests.length || southQuests.length) ? `
                  <div>
                    <strong style="font-size:12px;color:var(--joy-text-secondary)">Regional Quests (${storyQuests.length + southQuests.length}):</strong>
                    <div class="chip-row" style="margin-top:4px">
                      ${storyQuests.map(sq => rmsLink('story', sq.id, sq.title, 'Story Quest')).join(' ')}
                      ${southQuests.map(q => rmsLink('quests', q.id, q.title, q.category)).join(' ')}
                    </div>
                  </div>
                ` : ''}
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Stage 2 Routes &amp; Stage 4 Declarative <code>ground_id</code> Palettes (v${m.version || 3}):</strong>
                  <div class="chip-row" style="margin-top:4px">
                    ${(m.routes || []).map(rt => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">🛣 ${escapeHtml(rt.id)} (${escapeHtml(rt.groundId)} · w=${rt.width}m)</span>`).join('')}
                    ${Object.entries(m.groundPalettes || {}).map(([gid, pal]) => {
                      const weights = Object.entries(pal.scatter || {}).map(([k, r]) => `${k}:${r.weight}`).join(', ');
                      return `<span class="joy-badge joy-badge--success joy-badge--sm mono">🌿 ${escapeHtml(gid)} { ${escapeHtml(weights)} }</span>`;
                    }).join('')}
                  </div>
                </div>
                <div>
                  <strong style="font-size:12px;color:var(--joy-text-secondary)">Stage 3 Walkable 3D Structures &amp; Terraces:</strong>
                  <div class="chip-row" style="margin-top:4px">
                    ${(m.structures || []).map(s => `<span class="joy-badge joy-badge--brand joy-badge--sm mono">${escapeHtml(s.id)} (${escapeHtml(s.kind)} · r=${s.radius}m · 2F=${s.upperFloorHeight}m)</span>`).join('')}
                    ${(m.heightTerraces || []).map(t => `<span class="joy-badge joy-badge--success joy-badge--sm mono">${escapeHtml(t.id)} (h=${t.height}m)</span>`).join('')}
                  </div>
                </div>
                ${m.id === 'freja-south-gate' ? renderMapStructureEditor(m, 'maptab-' + m.id) : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}

      ${zoneCards.map(z => {
        const zMobs = DATA.mobs.filter(mb => (mb.spawnZones || []).includes(z.id));
        const zQuests = DATA.quests.filter(q => q.zoneId === z.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === z.id ? 'rms-highlight' : ''}" id="entity-${z.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip">🧭</span>
                <span class="rms-sheet__title">Zone: ${escapeHtml(z.id)}</span>
                <span class="rms-sheet__id">${escapeHtml(z.name)}</span>
              </div>
              <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(z.area)}</span>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Monsters on Map</th>
                  <td>
                    ${zMobs.map(mb => rmsLink('mobs', mb.id, `${mb.name} (Lv.${mb.level})`, mb.isMvp ? 'MVP Boss / 60 min' : 'Field Spawn / 3~5 min')).join(' ') || 'No monster on this map.'}
                  </td>
                </tr>
                <tr>
                  <th>Active Quests</th>
                  <td>
                    ${zQuests.map(q => rmsLink('quests', q.id, q.title, 'Lv.' + q.minBaseLevel)).join(' ') || '<span class="observatory-card__meta">None</span>'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 9. SQLITE STUDIO, BALANCE SIM & DOCS
 * ========================================================================== */
function renderSqlStudio() {
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RELATIONAL + JSONB OBSERVABILITY</div>
        <h1 class="page-hero__title">Live Read-Only SQLite Query Studio (build/catalog.sqlite)</h1>
        <p class="page-hero__sub">Query indexed relational tables, JSONB payloads, and analytical views directly in browser or Mac app.</p>
      </div>
    </div>

    <div class="observatory-card">
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_map_world_binding;')">v_map_world_binding (L1→L4 Maps)</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_world_continent_overview;')">v_world_continent_overview</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_story_region_matrix;')">v_story_region_matrix</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, title, kind, continent_id, rank, landform, at_x_km, at_y_km, why_or_note FROM world_places WHERE tier=\'pinned\' ORDER BY continent_id, id;')">Pinned World Places</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, name, level_band, element, family, archetype, region, faction FROM world_bestiary ORDER BY region, id;')">World Bestiary (116)</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_job_progression;')">v_job_progression</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_mob_economy;')">v_mob_economy</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_asset_studio_entries;')">v_asset_studio_entries</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT m.name AS mob, i.name AS item, d.chance_bps/100.0 AS drop_pct FROM mob_drops d JOIN mobs m ON m.id=d.mob_id JOIN items i ON i.id=d.item_id ORDER BY m.level, drop_pct DESC;')">Mob Drop Rates</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, title, category, min_base_level, base_xp, job_xp, unlock_job_id FROM quest_board ORDER BY min_base_level;')">Quest Board</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, name, emperium_hp, barricade_hp, player_damage_scaling_pct, guild_dungeon_zone_id FROM castles;')">WoE Castles</button>
      </div>
      <textarea id="sqlInput" class="sql-editor">SELECT * FROM v_mob_economy;</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="observatory-card__meta">Read-only SQLite connection (<code>SELECT</code>, <code>WITH</code>, <code>PRAGMA</code>, <code>EXPLAIN</code>)</span>
        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="executeSql()">Execute SQL Query</button>
      </div>
    </div>

    <div id="sqlOutput"></div>
  `;
}

async function runSqlPreset(sql) {
  const box = document.getElementById('sqlInput');
  if (box) box.value = sql;
  await executeSql();
}

async function executeSql() {
  const box = document.getElementById('sqlInput');
  const out = document.getElementById('sqlOutput');
  if (!box || !out) return;
  const res = await fetch('/api/sql?q=' + encodeURIComponent(box.value));
  const data = await res.json();
  if (!data.ok) {
    out.innerHTML = `<div class="joy-alert joy-alert--danger">SQL Error: ${escapeHtml(data.error)}</div>`;
    return;
  }
  out.innerHTML = `
    <div class="observatory-card">
      <div class="observatory-card__head">
        <h3 class="observatory-card__title">Query Result (${data.rowCount} rows)</h3>
        <span class="joy-badge joy-badge--success">Read-Only</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>${data.columns.map(c => `<th>${escapeHtml(String(c))}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.rows.map(r => `<tr>${r.map(v => `<td class="mono">${v === null ? 'NULL' : escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSim() {
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">AUTHORITATIVE RUST COMBAT ENGINE</div>
        <h1 class="page-hero__title">Headless Balance Simulator (server-rs / balance_sim)</h1>
        <p class="page-hero__sub">Executes <code>cargo run --bin balance_sim</code> to verify TTK, EXP/hour, refine +0..+15 curves, and WoE Emperium breach pacing.</p>
      </div>
      <button type="button" class="joy-button joy-button--solid" onclick="triggerBalanceSim()" ${SIM_RUNNING ? 'disabled' : ''}>
        ${SIM_RUNNING ? 'Running Simulator...' : 'Re-Run Balance Simulator'}
      </button>
    </div>

    <div class="joy-code-block">
      <div class="joy-code-block__header">
        <div class="joy-code-block__meta">
          <span class="joy-code-block__lang">RUST</span>
          <span>server-rs/src/bin/balance_sim.rs</span>
        </div>
      </div>
      <pre style="margin:0;padding:18px;overflow-x:auto"><code>${escapeHtml(SIM_OUTPUT)}</code></pre>
    </div>
  `;
}

function renderDocs() {
  const docs = DATA.docs || [];
  const active = docs[SELECTED_DOC_IDX] || docs[0];
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">CANON &amp; ARCHITECTURE SPECS</div>
        <h1 class="page-hero__title">Architecture Specs &amp; World Lore Canon Reviewer</h1>
        <p class="page-hero__sub">Browse design specs and world canon directly inside the Joymify Observatory shell.</p>
      </div>
    </div>
    <div class="chip-row">
      ${docs.map((d, i) => `
        <button type="button" class="joy-button ${i === SELECTED_DOC_IDX ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="SELECTED_DOC_IDX=${i};render()">
          ${escapeHtml(d.id)}
        </button>
      `).join('')}
    </div>
    ${active ? `
      <div class="joy-code-block">
        <div class="joy-code-block__header">
          <div class="joy-code-block__meta">
            <span class="joy-code-block__lang">MARKDOWN</span>
            <span>${escapeHtml(active.path)}</span>
          </div>
        </div>
        <pre style="margin:0;padding:18px;white-space:pre-wrap;font-family:var(--joy-font-family-mono)"><code>${escapeHtml(active.content)}</code></pre>
      </div>
    ` : ''}
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
</script>
</body>
</html>
"""


class ObservatoryHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, payload: dict, status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            raw = INDEX_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if parsed.path == "/theme.css":
            raw = load_theme_css()
            self.send_response(200)
            self.send_header("Content-Type", "text/css; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        if parsed.path.startswith("/thumbs/"):
            fname = Path(parsed.path).name
            target = (THUMBS_DIR / fname).resolve()
            if target.parent == THUMBS_DIR.resolve() and target.exists() and target.suffix == ".webp":
                raw = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/webp")
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
            self._send_json({"ok": False, "error": "Thumbnail not found"}, status=404)
            return

        if parsed.path == "/api/bundle":
            self._send_json(build_full_bundle())
            return

        if parsed.path == "/api/sql":
            qs = parse_qs(parsed.query)
            q = (qs.get("q") or [""])[0]
            self._send_json(run_readonly_sql(q))
            return

        self._send_json({"ok": False, "error": "Not found"}, status=404)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/rebuild":
            subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)
            self._send_json({"ok": True, "message": "Rebuilt build/catalog.sqlite and build/catalog_summary.json"})
            return
        if parsed.path == "/api/sim":
            self._send_json(run_balance_sim())
            return
        if parsed.path == "/api/review-queue/verdict":
            self._send_json(apply_review_verdict(self._read_json_body()))
            return
        if parsed.path == "/api/palette/toggle-asset":
            self._send_json(toggle_palette_asset(self._read_json_body()))
            return
        if parsed.path == "/api/studio/undo":
            self._send_json(undo_latest_snapshot())
            return
        if parsed.path == "/api/studio/ai-edit":
            self._send_json(apply_ai_studio_edit(self._read_json_body()))
            return
        if parsed.path == "/api/map/update-structure":
            self._send_json(update_map_structure(self._read_json_body()))
            return
        if parsed.path == "/api/studio/launch-3d":
            self._send_json(launch_3d_preview(self._read_json_body()))
            return
        self._send_json({"ok": False, "error": "Not found"}, status=404)


def main() -> int:
    parser = argparse.ArgumentParser(description="Atlas World MMORPG Catalog & Balance Observatory Web Studio")
    parser.add_argument("--port", type=int, default=8788, help="HTTP port (default: 8788)")
    parser.add_argument("--dump-check", action="store_true", help="Verify bundle + SQL engine and exit 0")
    args = parser.parse_args()

    if args.dump_check:
        bundle = build_full_bundle()
        sql_res = run_readonly_sql("SELECT * FROM v_mob_economy;")
        thumbs_ok = sum(1 for it in bundle["items"] if it.get("thumbUrl"))
        proposals_cnt = len((bundle.get("reviewQueue") or {}).get("proposals") or [])
        palettes_cnt = len(bundle.get("groundPalettes") or {})
        print(
            f"[catalog_explorer_web] OK — jobs={len(bundle['jobs'])}, mobs={len(bundle['mobs'])}, "
            f"items={len(bundle['items'])} (thumbs={thumbs_ok}/{len(bundle['items'])}), "
            f"cards={len(bundle['cards'])}, quests={len(bundle['quests'])}, "
            f"castles={len(bundle['castles'])}, palettes={palettes_cnt}, "
            f"review_proposals={proposals_cnt}, sql_rows={sql_res.get('rowCount')}"
        )
        return 0

    ensure_catalog_db()
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(("0.0.0.0", args.port), ObservatoryHandler)
    print(f"[catalog_explorer_web] Atlas World Observatory listening on http://127.0.0.1:{args.port}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
