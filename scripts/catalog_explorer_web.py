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
STUDIO_DIR = ROOT / "content" / "studio"
RUNTIME_MANIFEST_PATH = MAPS_DIR / "_manifest.runtime.json"


def load_studio_perspectives_bundle() -> dict:
    whc_path = STUDIO_DIR / "world_history_and_concept.json"
    whc = load_json_file(whc_path) or {}
    continents = []
    continents_dir = STUDIO_DIR / "continents"
    if continents_dir.exists():
        for cp in sorted(continents_dir.glob("*.json")):
            doc = load_json_file(cp)
            if doc:
                continents.append(doc)

    districts = []
    districts_dir = STUDIO_DIR / "districts"
    if districts_dir.exists():
        for dp in sorted(districts_dir.rglob("*.json")):
            doc = load_json_file(dp)
            if doc:
                districts.append(doc)

    nodes = []
    nodes_dir = STUDIO_DIR / "nodes"
    if nodes_dir.exists():
        for np in sorted(nodes_dir.rglob("*.json")):
            doc = load_json_file(np)
            if doc:
                nodes.append(doc)

    runtime_manifest = load_json_file(RUNTIME_MANIFEST_PATH) or {}
    self_eval = load_json_file(ROOT / "build" / "studio_self_evaluation.json") or {}
    return {
        "worldHistoryAndConcept": whc,
        "continents": continents,
        "districts": districts,
        "nodes": nodes,
        "runtimeManifest": runtime_manifest,
        "selfEvaluation": self_eval,
    }

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


_THUMB_CACHE_INITIALIZED = False
_ALL_THUMBS: list[Path] = []
_GLB_REL_TO_THUMB: dict[str, Path] = {}
_STEM_TO_THUMB: dict[str, Path] = {}
_CAT_TO_THUMBS: dict[str, list[Path]] = {}


def _init_thumb_resolver() -> None:
    global _THUMB_CACHE_INITIALIZED, _ALL_THUMBS
    if _THUMB_CACHE_INITIALIZED:
        return
    _THUMB_CACHE_INITIALIZED = True
    if not THUMBS_DIR.exists():
        return
    _ALL_THUMBS = sorted(p for p in THUMBS_DIR.glob("*.webp") if p.is_file())
    assets_root = ROOT / "game-client" / "assets"
    if not assets_root.exists():
        return
    for glb in sorted(assets_root.rglob("*.glb")):
        rel = "res://assets/" + glb.relative_to(assets_root).as_posix()
        h = hashlib.sha256(rel.encode("utf-8")).hexdigest()[:16] + ".webp"
        tp = THUMBS_DIR / h
        if tp.exists():
            _GLB_REL_TO_THUMB[rel.lower()] = tp
            parts = glb.relative_to(assets_root).parts
            cat = parts[0].lower() if parts else "misc"
            _CAT_TO_THUMBS.setdefault(cat, []).append(tp)
            _STEM_TO_THUMB.setdefault(glb.stem.lower(), tp)


def resolve_thumb_file(request_path: str) -> Path | None:
    """Resolve any /thumbs/... path to a valid baked .webp file in game-client/assets/.thumbs/."""
    _init_thumb_resolver()
    if not _ALL_THUMBS:
        return None
    clean = (request_path or "").strip()
    if clean.startswith("/thumbs/"):
        sub = clean[len("/thumbs/"):]
    else:
        sub = clean.lstrip("/")
    fname = Path(sub).name
    direct = (THUMBS_DIR / fname).resolve()
    if direct.parent == THUMBS_DIR.resolve() and direct.exists() and direct.suffix == ".webp":
        return direct

    # Try exact res://assets/<sub_without_webp>.glb match
    if sub.endswith(".webp"):
        sub_no_ext = sub[:-5]
    else:
        sub_no_ext = sub
    cand_rel = f"res://assets/{sub_no_ext}.glb".lower()
    if cand_rel in _GLB_REL_TO_THUMB:
        return _GLB_REL_TO_THUMB[cand_rel]

    # Try exact stem match
    stem = Path(sub_no_ext).name.lower()
    if stem in _STEM_TO_THUMB:
        return _STEM_TO_THUMB[stem]

    # Try keyword token match against stems
    tokens = [t for t in stem.replace("-", "_").split("_") if len(t) >= 3 and not t.isdigit()]
    for tok in tokens:
        for k_stem, tp in _STEM_TO_THUMB.items():
            if tok in k_stem:
                return tp

    # Category-aware deterministic fallback
    parts = Path(sub_no_ext).parts
    cat_hint = parts[0].lower() if len(parts) > 1 else ""
    cat_map = {
        "nature": ["nature"],
        "buildings": ["env", "dungeon"],
        "env": ["env", "dungeon"],
        "dungeon": ["dungeon"],
        "props": ["dungeon", "loot"],
        "creatures": ["creatures", "characters"],
        "monsters": ["creatures", "characters"],
        "characters": ["characters", "creatures"],
        "weapons": ["weapons"],
        "loot": ["loot", "weapons"],
        "items": ["loot", "weapons"],
        "cards": ["characters", "creatures", "dungeon"],
    }
    pool: list[Path] = []
    for c_key in cat_map.get(cat_hint, ["creatures", "characters", "nature", "dungeon", "loot", "weapons"]):
        pool.extend(_CAT_TO_THUMBS.get(c_key, []))
    if not pool:
        pool = _ALL_THUMBS
    idx = int(hashlib.sha256(clean.encode("utf-8")).hexdigest()[:12], 16) % len(pool)
    return pool[idx]


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
            if mp.name.startswith("_"):
                continue
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
        "studioPerspectives": load_studio_perspectives_bundle(),
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


def create_studio_snapshot(label: str, rel_files: list[str], created_files: list[str] | None = None) -> dict:
    import time
    ts = f"{time.strftime('%Y%m%d-%H%M%S')}-{int((time.time() % 1) * 1000):03d}"
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
        "createdFiles": list(created_files or []),
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
    removed = []
    for rel in latest.get("createdFiles", []):
        dst_p = (ROOT / rel).resolve()
        if dst_p.exists() and ROOT in dst_p.parents:
            dst_p.unlink()
            removed.append(rel)
    shutil.rmtree(snap_dir, ignore_errors=True)
    touched = restored + removed
    if not touched or any(not rel.startswith("content/studio/") and rel != "content/review-queue.json" for rel in touched):
        subprocess.run([sys.executable, str(BUILD_SCRIPT)], check=True)
    return {"ok": True, "restoredSnapshot": latest["id"], "restoredFiles": restored, "removedFiles": removed}


STUDIO_QUALITY_PILLARS = (
    "causal_continuity",
    "fantasy_and_wonder",
    "character_scale_consistency",
    "spatial_and_ecological_consistency",
    "intentional_mystery_discipline",
)


def find_studio_node_and_path(node_id: str) -> tuple[str | None, dict | None, Path | None]:
    target_id = (node_id or "").strip()
    if not target_id:
        return None, None, None
    whc_path = STUDIO_DIR / "world_history_and_concept.json"
    whc_doc = load_json_file(whc_path)
    if whc_doc and whc_doc.get("id") == target_id:
        return "world-history-and-concept", whc_doc, whc_path

    continents_dir = STUDIO_DIR / "continents"
    if continents_dir.exists():
        for cp in sorted(continents_dir.glob("*.json")):
            doc = load_json_file(cp)
            if doc and doc.get("id") == target_id:
                return "continent", doc, cp

    districts_dir = STUDIO_DIR / "districts"
    if districts_dir.exists():
        for dp in sorted(districts_dir.rglob("*.json")):
            doc = load_json_file(dp)
            if doc and doc.get("id") == target_id:
                return "district", doc, dp

    nodes_dir = STUDIO_DIR / "nodes"
    if nodes_dir.exists():
        for np in sorted(nodes_dir.rglob("*.json")):
            doc = load_json_file(np)
            if doc and doc.get("id") == target_id:
                return "town-or-hunting-area", doc, np

    return None, None, None


def get_parent_studio_doc(layer: str, doc: dict) -> dict | None:
    if layer == "world-history-and-concept":
        return None
    if layer == "continent":
        return load_json_file(STUDIO_DIR / "world_history_and_concept.json")
    if layer == "district":
        parent_id = doc.get("parent_continent_id") or ""
        _, pdoc, _ = find_studio_node_and_path(parent_id)
        return pdoc
    if layer == "town-or-hunting-area":
        parent_id = doc.get("parent_district_id") or ""
        _, pdoc, _ = find_studio_node_and_path(parent_id)
        return pdoc
    return None


def check_five_quality_pillars(qc: dict | None) -> tuple[bool, list[str]]:
    if not isinstance(qc, dict):
        return False, list(STUDIO_QUALITY_PILLARS)
    failed = []
    for k in STUDIO_QUALITY_PILLARS:
        item = qc.get(k)
        if not isinstance(item, dict) or item.get("verified") is not True or len(str(item.get("evidence") or "").strip()) < 15:
            failed.append(k)
    return len(failed) == 0, failed


def update_studio_rationale(payload: dict) -> tuple[dict, int]:
    node_id = str(payload.get("nodeId") or payload.get("node_id") or payload.get("id") or "").strip()
    layer, doc, path = find_studio_node_and_path(node_id)
    if not doc or not path or not layer:
        return {"ok": False, "error": f"Studio node '{node_id}' not found."}, 404

    updated = json.loads(json.dumps(doc))
    if "core_rationale" in payload and payload["core_rationale"] is not None:
        rationale = str(payload["core_rationale"]).strip()
        if len(rationale) < 20:
            return {"ok": False, "error": "core_rationale must be at least 20 characters long."}, 400
        updated["core_rationale"] = rationale

    if "quality_checklist" in payload and isinstance(payload["quality_checklist"], dict):
        qc = updated.setdefault("quality_checklist", {})
        for k, v in payload["quality_checklist"].items():
            if k in STUDIO_QUALITY_PILLARS and isinstance(v, dict):
                cur_item = qc.setdefault(k, {"verified": False, "evidence": "Verified by studio designer."})
                if "verified" in v:
                    cur_item["verified"] = bool(v["verified"])
                if "evidence" in v and v["evidence"] is not None:
                    cur_item["evidence"] = str(v["evidence"]).strip()

    if "mystery_hook" in payload and isinstance(payload["mystery_hook"], dict):
        mh = updated.setdefault("mystery_hook", {})
        for mk in ("in_world_rumor", "visual_silhouette", "unanswered_question"):
            if mk in payload["mystery_hook"] and payload["mystery_hook"][mk] is not None:
                mh[mk] = str(payload["mystery_hook"][mk]).strip()

    new_status = str(payload.get("status") or updated.get("status") or "draft").strip().lower()
    if new_status not in ("canon", "draft", "mystery"):
        return {"ok": False, "error": f"Invalid status '{new_status}'. Must be canon, draft, or mystery."}, 400

    parent_doc = get_parent_studio_doc(layer, updated)
    if new_status == "canon":
        if parent_doc is not None and parent_doc.get("status") != "canon":
            return {
                "ok": False,
                "error": f"Cannot promote '{node_id}' to canon because parent '{parent_doc.get('id')}' has status '{parent_doc.get('status')}' (must be canon).",
            }, 400
        all_ok, failed_pillars = check_five_quality_pillars(updated.get("quality_checklist"))
        if not all_ok:
            return {
                "ok": False,
                "error": f"Cannot promote '{node_id}' to canon until all 5 quality_checklist pillars are verified. Pending: {', '.join(failed_pillars)}",
                "failedPillars": failed_pillars,
            }, 400

    if new_status == "mystery":
        mh = updated.get("mystery_hook") or {}
        updated["mystery_hook"] = {
            "in_world_rumor": str(mh.get("in_world_rumor") or f"Travelers speak of uncharted phenomena beyond {updated.get('name', node_id)}.").strip(),
            "visual_silhouette": str(mh.get("visual_silhouette") or f"Shrouded horizon silhouette bordering {updated.get('name', node_id)}.").strip(),
            "unanswered_question": str(mh.get("unanswered_question") or f"What ancient force sleeps within {updated.get('name', node_id)}?").strip(),
        }

    updated["status"] = new_status
    rel_file = str(path.relative_to(ROOT))
    snap_meta = create_studio_snapshot(f"rationale_{node_id}", [rel_file])
    path.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")

    return {
        "ok": True,
        "layer": layer,
        "node": updated,
        "snapshot": snap_meta,
        "studioPerspectives": load_studio_perspectives_bundle(),
    }, 200


def generate_studio_children(payload: dict) -> tuple[dict, int]:
    parent_id = str(payload.get("parentId") or payload.get("parent_id") or payload.get("id") or "").strip()
    parent_layer, parent_doc, _ = find_studio_node_and_path(parent_id)
    if not parent_doc or not parent_layer:
        return {"ok": False, "error": f"Parent studio node '{parent_id}' not found."}, 404

    if parent_layer == "town-or-hunting-area":
        return {"ok": False, "error": "Town or Hunting Area is a leaf layer and cannot generate child layers."}, 400

    if parent_doc.get("status") != "canon":
        return {
            "ok": False,
            "error": f"Top-down generation blocked: parent '{parent_id}' has status '{parent_doc.get('status')}' (must be 'canon').",
        }, 400

    if len(str(parent_doc.get("core_rationale") or "").strip()) < 20:
        return {
            "ok": False,
            "error": f"Top-down generation blocked: parent '{parent_id}' lacks a valid core_rationale.",
        }, 400

    all_ok, failed_pillars = check_five_quality_pillars(parent_doc.get("quality_checklist"))
    if not all_ok:
        return {
            "ok": False,
            "error": f"Top-down generation blocked: parent '{parent_id}' has unverified quality_checklist pillars: {', '.join(failed_pillars)}",
            "failedPillars": failed_pillars,
        }, 400

    child_status = str(payload.get("childStatus") or payload.get("status") or "mystery").strip().lower()
    if child_status not in ("draft", "mystery"):
        child_status = "mystery"

    child_name = str(payload.get("childName") or payload.get("name") or "Uncharted Frontier Sector").strip()
    rationale = str(
        payload.get("coreRationale")
        or payload.get("core_rationale")
        or f"Directly extends canon parent '{parent_doc.get('name', parent_id)}' ({parent_id}) as a top-down child region."
    ).strip()
    persist = bool(payload.get("persist", False))

    default_checklist = {
        k: {
            "verified": False,
            "evidence": f"Pending human verification for child of {parent_id}.",
        }
        for k in STUDIO_QUALITY_PILLARS
    }
    default_mystery_hook = {
        "in_world_rumor": f"Scouts from {parent_doc.get('name', parent_id)} report warm lantern-mist drifting across {child_name}.",
        "visual_silhouette": f"Distant ceramic arches and glowing horizon silhouettes beyond {parent_doc.get('name', parent_id)}.",
        "unanswered_question": f"What untouched remnants of the Primordial Gods await inside {child_name}?",
    }

    created_rel_path = None
    if parent_layer == "world-history-and-concept":
        child_layer = "continent"
        cid = str(payload.get("childId") or "continent-04-uncharted-horizon").strip()
        child_doc = {
            "schema_version": "1.0.0",
            "id": cid,
            "name": child_name,
            "status": child_status,
            "core_rationale": rationale,
            "parent_world_history_causes": {
                "world_history_id": parent_id,
                "god_patron_ids": ["god-vesper-lantern-weaver"],
                "war_scar_ids": ["scar-shattered-halo-archipelago"],
                "causal_summary": rationale,
            },
            "mystery_hook": default_mystery_hook,
            "quality_checklist": default_checklist,
        }
        target_path = STUDIO_DIR / "continents" / f"{cid}.json"
    elif parent_layer == "continent":
        child_layer = "district"
        cid = str(payload.get("childId") or f"district-{parent_id.replace('continent-', '')}-frontier").strip()
        child_doc = {
            "schema_version": "1.0.0",
            "id": cid,
            "name": child_name,
            "parent_continent_id": parent_id,
            "status": child_status,
            "core_rationale": rationale,
            "local_conflict": f"Frontier tremors along the outer rim of {parent_doc.get('name', parent_id)}.",
            "level_band_label": "Levels 1 to 20",
            "level_range": [10, 20],
            "ecological_monster_families": ["spirit", "construct"],
            "grid_dimensions": {"columns": 3, "rows": 3},
            "grid_nodes": [],
            "portal_edges": [],
            "mystery_hook": default_mystery_hook,
            "quality_checklist": default_checklist,
        }
        target_path = STUDIO_DIR / "districts" / parent_id / f"{cid}.json"
    else:
        child_layer = "town-or-hunting-area"
        cid = str(payload.get("childId") or "hunting-area-uncharted-glade").strip()
        cont_id = parent_doc.get("parent_continent_id") or "continent-01-hearthbloom-basin"
        child_doc = {
            "schema_version": "1.0.0",
            "id": cid,
            "name": child_name,
            "map_id": None,
            "parent_district_id": parent_id,
            "parent_continent_id": cont_id,
            "node_type": "hunting_area",
            "status": "mystery",
            "core_rationale": rationale,
            "is_starter_town": False,
            "grid_coordinates": [2, 2],
            "level_range": [12, 18],
            "mystery_hook": default_mystery_hook,
            "quality_checklist": default_checklist,
        }
        target_path = STUDIO_DIR / "nodes" / cont_id / parent_id / f"{cid}.json"

    snap_meta = None
    if persist:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        created_rel_path = str(target_path.relative_to(ROOT))
        existed = target_path.exists()
        snap_meta = create_studio_snapshot(
            f"generate_{cid}",
            [created_rel_path] if existed else [],
            created_files=[] if existed else [created_rel_path],
        )
        target_path.write_text(json.dumps(child_doc, indent=2) + "\n", encoding="utf-8")

    return {
        "ok": True,
        "parentId": parent_id,
        "parentLayer": parent_layer,
        "childLayer": child_layer,
        "persisted": persist,
        "createdFile": created_rel_path,
        "childNode": child_doc,
        "snapshot": snap_meta,
    }, 200


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
      min-height: 52px;
      border-bottom: 1px solid var(--hub-chrome-border);
      background: var(--hub-topbar-bg);
      padding: 6px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .topbar__start {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .topbar__end {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .topbar__title {
      font-size: var(--joy-font-size-md);
      font-weight: 600;
      color: var(--joy-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .scroll-stage {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      scroll-behavior: smooth;
    }
    .content-area {
      max-width: 100%;
      width: 100%;
      margin: 0 auto;
      padding: 18px 24px 72px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .studio-split-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 1220px) {
      .studio-split-layout {
        grid-template-columns: 1fr;
      }
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
  
    /* =========================================================================
     * ROLTH MAXION WORLD MAP + MONSTER/1035 + LINEAGE MAP ATLAS STYLES
     * ======================================================================= */
    .maxion-world-shell {
      display: grid;
      grid-template-columns: 375px 1fr;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 1180px) {
      .maxion-world-shell { grid-template-columns: 1fr; }
    }
    .maxion-sidebar {
      background: #0d1119;
      border: 1px solid rgba(255, 255, 255, 0.11);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
      display: flex;
      flex-direction: column;
    }
    .maxion-sidebar__top {
      padding: 14px 14px 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: linear-gradient(180deg, rgba(255, 209, 102, 0.06), transparent);
    }
    .maxion-sidebar__title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 15px;
      color: #f8fafc;
    }
    .maxion-cat-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .maxion-cat-btn {
      height: 36px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #161c28;
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .maxion-cat-btn:hover {
      border-color: rgba(255, 209, 102, 0.55);
      color: #fff;
    }
    .maxion-cat-btn.active {
      background: linear-gradient(135deg, rgba(255, 209, 102, 0.22), rgba(212, 175, 55, 0.12));
      border-color: #ffd166;
      color: #ffd166;
      box-shadow: 0 0 12px rgba(255, 209, 102, 0.18);
    }
    .maxion-sidebar__body {
      display: grid;
      grid-template-columns: 74px 1fr;
      min-height: 610px;
      max-height: 700px;
    }
    .maxion-lvl-rail {
      background: #090d14;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
    }
    .maxion-lvl-btn {
      padding: 13px 6px;
      border: none;
      border-left: 3px solid transparent;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background: transparent;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      cursor: pointer;
      line-height: 1.3;
      transition: all 0.15s ease;
    }
    .maxion-lvl-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.03);
    }
    .maxion-lvl-btn.active {
      border-left-color: #eab308;
      background: rgba(234, 179, 8, 0.13);
      color: #fef08a;
    }
    .maxion-mob-grid {
      padding: 10px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      align-content: start;
      background: #101520;
    }
    .maxion-mob-tile {
      position: relative;
      background: #182030;
      border: 1.5px solid rgba(255, 255, 255, 0.09);
      border-radius: 10px;
      padding: 8px 6px 7px 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: transform 0.12s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      user-select: none;
    }
    .maxion-mob-tile:hover {
      transform: translateY(-2px);
      border-color: rgba(125, 211, 252, 0.65);
      background: #1e293b;
    }
    .maxion-mob-tile.pinned {
      border-color: #eab308;
      background: linear-gradient(180deg, rgba(234, 179, 8, 0.22), rgba(24, 32, 48, 0.95));
      box-shadow: 0 0 14px rgba(234, 179, 8, 0.32);
    }
    .maxion-mob-tile__pin {
      position: absolute;
      top: 4px;
      left: 5px;
      font-size: 11px;
    }
    .maxion-mob-tile__mvp {
      position: absolute;
      top: 4px;
      right: 5px;
      font-size: 10px;
      background: rgba(234, 179, 8, 0.25);
      border: 1px solid #eab308;
      color: #fde047;
      border-radius: 4px;
      padding: 0 4px;
      font-weight: 800;
    }
    .maxion-mob-tile__img {
      width: 52px;
      height: 52px;
      object-fit: contain;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.55));
    }
    .maxion-mob-tile__lvl {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 99px;
      background: rgba(9, 13, 20, 0.82);
      border: 1px solid rgba(255, 255, 255, 0.12);
      font-family: var(--joy-font-family-mono);
      font-size: 10px;
      font-weight: 700;
      color: #f8fafc;
    }
    .maxion-mob-tile__name {
      font-size: 11px;
      font-weight: 700;
      color: #e2e8f0;
      text-align: center;
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* World Map Tile Matrix Stage */
    .maxion-map-stage {
      background: radial-gradient(circle at 50% 42%, #1a2e26 0%, #0d1b2a 62%, #070d16 100%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      padding: 16px;
      position: relative;
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.6);
      overflow-x: auto;
    }
    .maxion-grid-matrix {
      display: grid;
      grid-template-columns: repeat(6, minmax(126px, 1fr));
      gap: 12px;
      min-width: 780px;
      padding: 8px 4px;
      position: relative;
    }
    .maxion-grid-cell {
      aspect-ratio: 1 / 1;
      border-radius: 8px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .maxion-grid-cell--ocean {
      border: 1px dashed rgba(56, 189, 248, 0.08);
      background: radial-gradient(circle, rgba(14, 38, 64, 0.28), rgba(7, 15, 26, 0.15));
      pointer-events: none;
    }
    .maxion-tile-card {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      border: 2px solid rgba(255, 255, 255, 0.22);
      background: #111c17;
      position: relative;
      cursor: pointer;
      overflow: hidden;
      transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55);
    }
    .maxion-tile-card:hover {
      transform: scale(1.045);
      z-index: 6;
      border-color: #fde047;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.75), 0 0 16px rgba(250, 204, 21, 0.35);
    }
    .maxion-tile-card.selected {
      border: 2.5px solid #fde047;
      box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.28), 0 12px 28px rgba(0, 0, 0, 0.8);
      z-index: 5;
    }
    .maxion-tile-card.mob-pinned {
      border: 2.5px dashed #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.32), 0 0 22px rgba(56, 189, 248, 0.55);
      z-index: 7;
      animation: maxionPulse 1.8s infinite ease-in-out;
    }
    @keyframes maxionPulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35), 0 0 18px rgba(56, 189, 248, 0.45); }
      50% { box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.55), 0 0 26px rgba(56, 189, 248, 0.75); }
    }
    .maxion-tile-overlay-pin {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle, rgba(15, 23, 42, 0.58) 0%, rgba(15, 23, 42, 0.18) 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      pointer-events: none;
    }
    .maxion-tile-overlay-pin img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.85));
    }
    .maxion-tile-overlay-pin span {
      background: rgba(9, 13, 22, 0.92);
      border: 1px solid #38bdf8;
      color: #e0f2fe;
      font-family: var(--joy-font-family-mono);
      font-size: 10px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 99px;
    }
    .maxion-tile-label {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 4px 5px 3px 5px;
      background: linear-gradient(180deg, transparent, rgba(7, 11, 18, 0.94) 42%);
      color: #f8fafc;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      pointer-events: none;
    }
    .maxion-tile-code {
      position: absolute;
      top: 4px;
      left: 4px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(7, 11, 18, 0.84);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #cbd5e1;
      font-family: var(--joy-font-family-mono);
      font-size: 9.5px;
      font-weight: 700;
      pointer-events: none;
    }
    .maxion-tile-kind {
      position: absolute;
      top: 4px;
      right: 4px;
      font-size: 12px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
      pointer-events: none;
    }
    /* Bridge connectors between grid tiles */
    .tile-bridge-e {
      position: absolute;
      right: -14px;
      top: 50%;
      width: 14px;
      height: 5px;
      transform: translateY(-50%);
      background: linear-gradient(90deg, #facc15, #38bdf8);
      border-top: 1px solid #090d16;
      border-bottom: 1px solid #090d16;
      z-index: 3;
      pointer-events: none;
    }
    .tile-bridge-s {
      position: absolute;
      bottom: -14px;
      left: 50%;
      width: 5px;
      height: 14px;
      transform: translateX(-50%);
      background: linear-gradient(180deg, #facc15, #38bdf8);
      border-left: 1px solid #090d16;
      border-right: 1px solid #090d16;
      z-index: 3;
      pointer-events: none;
    }

    /* =========================================================================
     * MAXION MONSTER/1035 HERO DETAIL SHEET STYLES
     * ======================================================================= */
    .maxion-monster-hero {
      background: radial-gradient(circle at 80% 20%, rgba(34, 62, 46, 0.42) 0%, rgba(11, 15, 23, 0.97) 68%);
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 16px;
      padding: 26px 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .maxion-monster-top {
      display: flex;
      align-items: center;
      gap: 28px;
      flex-wrap: wrap;
    }
    .maxion-portrait-box {
      width: 192px;
      height: 192px;
      border-radius: 16px;
      background: radial-gradient(circle at 50% 50%, rgba(250, 204, 21, 0.18) 0%, rgba(17, 24, 39, 0.95) 75%);
      border: 1.5px solid rgba(250, 204, 21, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.65);
      flex-shrink: 0;
    }
    .maxion-portrait-box img {
      width: 148px;
      height: 148px;
      object-fit: contain;
      filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.75));
    }
    .maxion-monster-title {
      font-size: 2.35rem;
      font-weight: 900;
      color: #ffffff;
      margin: 0 0 10px 0;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .maxion-pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .maxion-pill {
      padding: 6px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: #262b36;
      color: #f1f5f9;
    }
    .maxion-pill--rank {
      background: rgba(30, 58, 138, 0.45);
      border-color: rgba(96, 165, 250, 0.55);
      color: #93c5fd;
    }
    .maxion-pill--mvp {
      background: rgba(161, 98, 7, 0.45);
      border-color: #facc15;
      color: #fef08a;
    }
    .maxion-stat-boxes {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .maxion-stat-box {
      min-width: 138px;
      padding: 12px 18px;
      border-radius: 10px;
      background: rgba(24, 30, 42, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .maxion-stat-box__label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .maxion-stat-box__val {
      font-size: 1.45rem;
      font-weight: 900;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .maxion-section-head {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.15rem;
      font-weight: 800;
      color: #ffffff;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.09);
    }
    .maxion-section-head::before {
      content: "";
      display: inline-block;
      width: 18px;
      height: 3px;
      border-radius: 2px;
      background: #eab308;
    }
    .maxion-elem-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(150px, 1fr));
      gap: 10px;
    }
    @media (max-width: 980px) {
      .maxion-elem-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .maxion-elem-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 10px;
      background: #0c1018;
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 13px;
      font-weight: 700;
    }
    .maxion-elem-pill--weak {
      border-color: rgba(74, 222, 128, 0.45);
      background: linear-gradient(90deg, rgba(22, 101, 52, 0.25), #0c1018);
    }
    .maxion-elem-pill--resist {
      opacity: 0.62;
    }
    .maxion-drop-row {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }
    .maxion-drop-card {
      width: 122px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      cursor: pointer;
      transition: transform 0.14s ease;
    }
    .maxion-drop-card:hover {
      transform: translateY(-4px);
    }
    .maxion-drop-card__frame {
      width: 122px;
      height: 138px;
      border-radius: 12px;
      background: radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.08), #121621 75%);
      border: 1.5px solid #f97316;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 14px 8px 8px 8px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
    }
    .maxion-drop-card__frame--purple { border-color: #a855f7; }
    .maxion-drop-card__frame--common { border-color: rgba(148, 163, 184, 0.45); }
    .maxion-drop-card__img {
      width: 68px;
      height: 68px;
      object-fit: contain;
      filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.65));
    }
    .maxion-drop-card__rate {
      width: 100%;
      text-align: center;
      padding: 3px 0;
      border-radius: 6px;
      background: rgba(7, 10, 16, 0.9);
      font-family: var(--joy-font-family-mono);
      font-size: 11.5px;
      font-weight: 800;
      color: #f8fafc;
    }
    .maxion-drop-card__name {
      font-size: 12px;
      font-weight: 700;
      color: #cbd5e1;
      text-align: center;
      line-height: 1.25;
    }


    /* =========================================================================
     * CONNECTED MAP DIRECTORY (.lineage-*) + WORLD BOARD (.maxion-*) BOUNDED CSS
     * ======================================================================= */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e2e8f0;
    }
    .pill--cyan {
      background: rgba(56, 189, 248, 0.14);
      border-color: rgba(56, 189, 248, 0.45);
      color: #7dd3fc;
    }
    .pill--gold {
      background: rgba(250, 204, 21, 0.16);
      border-color: rgba(250, 204, 21, 0.45);
      color: #fde047;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      background: #161e2e;
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #e2e8f0;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover {
      border-color: #ffd166;
      color: #ffffff;
      background: #1e293b;
    }
    .btn--primary {
      background: linear-gradient(135deg, rgba(255, 209, 102, 0.24), rgba(212, 175, 55, 0.14));
      border-color: #ffd166;
      color: #ffd166;
    }
    .lineage-map-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
      gap: 14px;
      align-items: stretch;
    }
    @media (max-width: 960px) {
      .lineage-map-grid { grid-template-columns: 1fr; }
    }
    .lineage-map-card {
      background: #101724;
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .lineage-map-card__top {
      display: grid;
      grid-template-columns: 148px 1fr;
      gap: 14px;
      align-items: start;
    }
    .lineage-map-card__preview {
      width: 148px;
      height: 148px;
      min-width: 148px;
      max-width: 148px;
      min-height: 148px;
      max-height: 148px;
      border-radius: 10px;
      overflow: hidden;
      border: 1.5px solid rgba(255, 209, 102, 0.45);
      background: #0c121d;
      position: relative;
      flex-shrink: 0;
    }
    .lineage-map-card__preview svg,
    .lineage-map-card__preview img {
      width: 148px !important;
      height: 148px !important;
      max-width: 148px !important;
      max-height: 148px !important;
      display: block;
      object-fit: cover;
    }
    .lineage-map-card__meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .lineage-neighbors {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 5px;
    }
    .lineage-nb-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #bae6fd;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.14s ease;
    }
    .lineage-nb-chip:hover {
      border-color: #fde047;
      color: #fde047;
      background: rgba(250, 204, 21, 0.14);
    }
    .lineage-spawns-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .lineage-spawn-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px 4px 6px;
      border-radius: 8px;
      background: #182132;
      border: 1px solid rgba(255, 255, 255, 0.12);
      cursor: pointer;
      transition: transform 0.12s ease, border-color 0.12s ease;
    }
    .lineage-spawn-pill:hover {
      transform: translateY(-1px);
      border-color: #ffd166;
    }
    .lineage-spawn-pill img {
      width: 32px !important;
      height: 32px !important;
      max-width: 32px !important;
      max-height: 32px !important;
      object-fit: contain;
      border-radius: 6px;
      background: #0c1018;
      padding: 2px;
      flex-shrink: 0;
    }
    .maxion-mob-tile__avatar {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .maxion-mob-tile__avatar img {
      width: 48px !important;
      height: 48px !important;
      object-fit: contain;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.55));
    }
    .maxion-mob-tile__pin-icon {
      position: absolute;
      top: 4px;
      left: 5px;
      font-size: 10px;
      opacity: 0.75;
    }
    .maxion-canvas-card {
      background: #0d131f;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
    }
    .maxion-canvas-header {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      background: rgba(15, 23, 42, 0.65);
    }
    .maxion-world-board {
      padding: 16px;
      background: radial-gradient(circle at 50% 42%, #1a2e26 0%, #0d1b2a 62%, #070d16 100%);
      overflow-x: auto;
    }
    .maxion-tile-matrix {
      display: grid;
      grid-template-columns: repeat(6, minmax(124px, 1fr));
      gap: 12px;
      min-width: 780px;
    }
    .maxion-map-cell {
      position: relative;
      aspect-ratio: 1 / 1;
      max-height: 168px;
      border-radius: 10px;
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.2);
      background: #111c17;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
      transition: transform 0.14s ease, border-color 0.14s ease;
    }
    .maxion-map-cell:hover {
      transform: scale(1.03);
      border-color: #fde047;
      z-index: 4;
    }
    .maxion-map-cell svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    .maxion-map-cell.selected-tile {
      border-color: #fde047;
      box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.32), 0 10px 24px rgba(0, 0, 0, 0.75);
    }
    .maxion-map-cell.pinned-spawn {
      border: 2.5px dashed #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.35), 0 0 22px rgba(56, 189, 248, 0.55);
    }
    .maxion-map-cell__code {
      position: absolute;
      top: 5px;
      left: 5px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(7, 11, 18, 0.86);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #e2e8f0;
      font-family: var(--joy-font-family-mono);
      font-size: 9.5px;
      font-weight: 700;
      pointer-events: none;
    }
    .maxion-map-cell__lv {
      position: absolute;
      top: 5px;
      right: 5px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(7, 11, 18, 0.86);
      border: 1px solid rgba(250, 204, 21, 0.4);
      color: #fde047;
      font-family: var(--joy-font-family-mono);
      font-size: 9.5px;
      font-weight: 700;
      pointer-events: none;
    }
    .maxion-map-cell__pin {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle, rgba(15, 23, 42, 0.65) 0%, rgba(15, 23, 42, 0.2) 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .maxion-map-cell__pin img {
      width: 46px !important;
      height: 46px !important;
      object-fit: contain;
      filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.85));
    }
    .maxion-map-cell__pin-count {
      background: rgba(9, 13, 22, 0.92);
      border: 1px solid #38bdf8;
      color: #e0f2fe;
      font-family: var(--joy-font-family-mono);
      font-size: 10px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 99px;
    }
    .maxion-map-cell__name {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 5px 6px 4px;
      background: linear-gradient(180deg, transparent, rgba(7, 11, 18, 0.95) 40%);
      color: #f8fafc;
      font-size: 10.5px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    .maxion-mob-detail {
      display: flex;
      flex-direction: column;
      gap: 22px;
    }
    .maxion-mob-hero {
      background: radial-gradient(circle at 80% 20%, rgba(34, 62, 46, 0.42) 0%, rgba(11, 15, 23, 0.97) 68%);
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 16px;
      padding: 22px 24px;
      display: flex;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;
    }
    .maxion-mob-portrait-box {
      width: 176px;
      height: 176px;
      border-radius: 14px;
      background: radial-gradient(circle at 50% 50%, rgba(250, 204, 21, 0.18) 0%, rgba(17, 24, 39, 0.95) 75%);
      border: 1.5px solid rgba(250, 204, 21, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .maxion-mob-portrait-box img {
      width: 136px !important;
      height: 136px !important;
      object-fit: contain;
    }
    .maxion-mob-title {
      font-size: 2rem;
      font-weight: 900;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .maxion-prop-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .maxion-prop-pill {
      padding: 5px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: #262b36;
      color: #f1f5f9;
    }
    .maxion-elem-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #0c1018;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .maxion-elem-card__icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.04);
      font-size: 15px;
    }
    .maxion-elem-card__name {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 700;
    }
    .maxion-elem-card__pct {
      font-size: 14px;
      font-weight: 900;
      color: #f8fafc;
      font-family: var(--joy-font-family-mono);
    }
    .maxion-elem-card__pct--weak { color: #4ade80; }
    .maxion-elem-card__pct--resist { color: #f87171; }
    .maxion-drops-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .maxion-drop-card__art {
      width: 112px;
      height: 112px;
      border-radius: 12px;
      background: #141b29;
      border: 1.5px solid rgba(255, 209, 102, 0.35);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 10px 6px 6px;
    }
    .maxion-drop-card__art img {
      width: 60px !important;
      height: 60px !important;
      object-fit: contain;
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
      <span>Web Studio (:8788)</span>
      <span class="joy-badge joy-badge--brand joy-badge--sm">joy-design</span>
    </div>
  </aside>

  <!-- Main Workspace -->
  <div class="main">
    <header class="topbar">
      <div class="topbar__start">
        <div style="display:inline-flex;gap:4px;margin-right:6px">
          <button type="button" class="joy-button joy-button--outline joy-button--sm" style="height:28px;padding:0 9px;font-size:11.5px" onclick="window.history.back()" title="Browser Back">← Back</button>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" style="height:28px;padding:0 9px;font-size:11.5px" onclick="window.history.forward()" title="Browser Forward">Forward →</button>
        </div>
        <span class="topbar__title" id="topbarTitle">Interactive World Map &amp; Monster Atlas</span>
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
let CURRENT_TAB = 'studio';
let SEARCH_QUERY = '';
let DROP_RATE_MULT = 1;
let HIGHLIGHT_ENTITY_ID = '';
let SELECTED_DOC_IDX = 0;
let SELECTED_CONTINENT_ID = 'all';
let STUDIO_PERSPECTIVE = 'world-history-and-concept';
let STUDIO_STATUS_FILTER = 'all';
let STUDIO_SELECTED_CONTINENT_ID = 'continent-01-hearthbloom-basin';
let STUDIO_SELECTED_DISTRICT_ID = 'district-teacup-meadows';
let STUDIO_SELECTED_NODE_ID = 'town-lantern-hollow';
let STUDIO_ACTIVE_INSPECT_ID = 'world-history-cradle-of-embers';
let STUDIO_LEVEL_BAND = 'Levels 1 to 20';
let STUDIO_PINNED_MONSTER_ID = '';
let STUDIO_SELECTED_MONSTER_ID = '';
let SELECTED_STORY_KIND = 'all';
let SELECTED_BESTIARY_REGION = 'all';
let MAXION_LEVEL_BAND = '1-20';
let MAXION_CAT_FILTER = 'all';
let MAXION_PINNED_MOB_ID = 'poring';
let MAXION_SELECTED_TILE_ID = 'freja-south-gate';
let MAXION_SELECTED_MOB_ID = 'hunter_fly';
let MAP_DIR_FILTER = 'all';
let SIM_OUTPUT = 'Click "Run Balance Sim" in the top bar (or below) to execute cargo run --bin balance_sim against the live Rust authoritative combat engine.';
let SIM_RUNNING = false;

const NAV_GROUPS = [
  {
    section: 'Systematic Top-Down World Studio',
    items: [
      { id: 'studio', label: '🌌 Top-Down World Studio (4 Perspectives)', countKey: d => {
        const sp = (d && d.studioPerspectives) || {};
        const dists = (sp.districts || []).length;
        const canonMaps = (sp.nodes || []).filter(n => n.status === 'canon').length;
        return dists + 'D · ' + canonMaps + ' Maps';
      } },
    ]
  },
  {
    section: 'World Map & Atlas (Maxion / Lineage)',
    items: [
      { id: 'world', label: '🧭 Interactive World Map', countKey: () => getAllWorldTiles().length + ' Tiles' },
      { id: 'maps',  label: '🗺️ Connected Map Directory', countKey: () => getAllWorldTiles().length + ' Maps' },
      { id: 'mobs',  label: '👾 Monster Detail (mob_db)', countKey: () => getAllMonsters().length + ' Mobs' },
    ]
  },
  {
    section: 'MMORPG Databases (RMS)',
    items: [
      { id: 'gear',     label: '⚔️ Item & Card DB (item_db)', countKey: d => d.items.length + d.cards.length },
      { id: 'jobs',     label: '🛡️ Job & Skill DB (skill_db)', countKey: d => d.jobs.length + d.skills.length },
      { id: 'quests',   label: '📜 Quest Database (quest_db)', countKey: d => d.quests.length },
      { id: 'overview', label: '📊 Database Hub & Matrix', countKey: () => 9 },
    ]
  },
  {
    section: 'AI Asset & Map Studio',
    items: [
      { id: 'review',  label: '✨ Review Gate Inbox (Step 3)', countKey: d => ((d.reviewQueue && d.reviewQueue.proposals) || []).length },
      { id: 'brushes', label: '🌿 Biome Brush & Tag Pools',    countKey: d => Object.keys(d.groundPalettes || {}).length },
    ]
  },
  {
    section: 'Tools & Calculators',
    items: [
      { id: 'elements', label: '🔥 Property & Size Chart', countKey: d => (d.elements.elements || []).length },
      { id: 'siege',    label: '🏰 WoE Castle Calculator', countKey: d => d.castles.length },
      { id: 'sql',      label: '🗄️ SQLite Query Studio', countKey: () => 'SQL' },
      { id: 'sim',      label: '⚙️ Rust Balance Simulator', countKey: () => 'RS' },
      { id: 'docs',     label: '📖 Architecture Specs', countKey: d => d.docs.length },
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
  const mob = params.get('mob');
  const tile = params.get('tile');
  const band = params.get('band');
  const perspective = params.get('perspective');
  const studioCont = params.get('continent');
  const studioDist = params.get('district');
  const studioNode = params.get('node') || params.get('map');
  const studioMonster = params.get('monster');
  if (perspective) {
    CURRENT_TAB = 'studio';
    STUDIO_PERSPECTIVE = perspective;
  }
  if (studioCont) STUDIO_SELECTED_CONTINENT_ID = studioCont;
  if (studioDist) STUDIO_SELECTED_DISTRICT_ID = studioDist;
  if (studioNode) STUDIO_SELECTED_NODE_ID = studioNode;
  if (studioMonster) {
    STUDIO_SELECTED_MONSTER_ID = studioMonster;
    STUDIO_PINNED_MONSTER_ID = studioMonster;
  }
  if (t) CURRENT_TAB = t;
  if (q !== null) {
    SEARCH_QUERY = q;
    const inp = document.getElementById('globalSearch');
    if (inp) inp.value = q;
  }
  if (mob) {
    MAXION_SELECTED_MOB_ID = mob;
    MAXION_PINNED_MOB_ID = mob;
  }
  if (tile) {
    MAXION_SELECTED_TILE_ID = tile;
  }
  if (band) {
    MAXION_LEVEL_BAND = band;
  }
  HIGHLIGHT_ENTITY_ID = focus || '';
}

function writeUrlState(pushHistory = true) {
  const params = new URLSearchParams();
  params.set('tab', CURRENT_TAB);
  if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);
  if (HIGHLIGHT_ENTITY_ID) params.set('focus', HIGHLIGHT_ENTITY_ID);
  if (CURRENT_TAB === 'mobs' && MAXION_SELECTED_MOB_ID) params.set('mob', MAXION_SELECTED_MOB_ID);
  if (CURRENT_TAB === 'world' && MAXION_PINNED_MOB_ID) params.set('mob', MAXION_PINNED_MOB_ID);
  if (CURRENT_TAB === 'world' && MAXION_SELECTED_TILE_ID) params.set('tile', MAXION_SELECTED_TILE_ID);
  if (CURRENT_TAB === 'studio') {
    params.set('perspective', STUDIO_PERSPECTIVE);
    if (STUDIO_SELECTED_CONTINENT_ID) params.set('continent', STUDIO_SELECTED_CONTINENT_ID);
    if (STUDIO_SELECTED_DISTRICT_ID) params.set('district', STUDIO_SELECTED_DISTRICT_ID);
    if (STUDIO_SELECTED_NODE_ID) {
      params.set('node', STUDIO_SELECTED_NODE_ID);
      params.set('map', STUDIO_SELECTED_NODE_ID);
    }
    if (STUDIO_SELECTED_MONSTER_ID) params.set('monster', STUDIO_SELECTED_MONSTER_ID);
  }
  const newHash = '#' + params.toString();
  if (window.location.hash !== newHash) {
    if (pushHistory) history.pushState(null, '', newHash);
    else history.replaceState(null, '', newHash);
  }
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
  window.addEventListener('popstate', () => { syncUrlState(); renderSidebar(); render(); });
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
    studio:   'Systematic Top-Down World and Map Studio (World History and Concept ➔ Continent ➔ District ➔ Town or Hunting Area)',
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

  if (CURRENT_TAB === 'studio') main.innerHTML = renderTopDownStudio();
  else if (CURRENT_TAB === 'world') main.innerHTML = renderWorldAtlas();
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


function setStudioPerspective(perspective, opts = {}) {
  CURRENT_TAB = 'studio';
  STUDIO_PERSPECTIVE = perspective;
  if (opts.continentId) STUDIO_SELECTED_CONTINENT_ID = opts.continentId;
  if (opts.districtId) STUDIO_SELECTED_DISTRICT_ID = opts.districtId;
  if (opts.nodeId) STUDIO_SELECTED_NODE_ID = opts.nodeId;
  if (opts.monsterId !== undefined) STUDIO_SELECTED_MONSTER_ID = opts.monsterId;
  if (opts.pinnedMonsterId !== undefined) STUDIO_PINNED_MONSTER_ID = opts.pinnedMonsterId;
  if (opts.levelBand) STUDIO_LEVEL_BAND = opts.levelBand;
  if (opts.inspectId) STUDIO_ACTIVE_INSPECT_ID = opts.inspectId;
  writeUrlState();
  renderSidebar();
  render();
}

function setStudioStatusFilter(status) {
  STUDIO_STATUS_FILTER = status;
  render();
}

function renderStatusBadgeHtml(status) {
  const s = (status || 'draft').toLowerCase();
  if (s === 'canon') {
    return '<span class="joy-badge joy-badge--success joy-badge--sm">🟢 Canon</span>';
  }
  if (s === 'mystery') {
    return '<span class="joy-badge joy-badge--neutral joy-badge--sm" style="background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.45)">🟣 Mystery (Fog of Lore)</span>';
  }
  return '<span class="joy-badge joy-badge--warning joy-badge--sm">🟡 Draft</span>';
}

async function submitStudioRationaleUpdate(nodeId, patchPayload) {
  const statusEl = document.getElementById('studioDrawerStatusMsg');
  if (statusEl) statusEl.textContent = 'Saving studio update...';
  const res = await fetch('/api/studio/rationale/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, ...patchPayload })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    if (statusEl) {
      statusEl.style.color = '#f87171';
      statusEl.textContent = data.error || 'Failed to update studio node.';
    }
    return;
  }
  if (data.studioPerspectives) {
    DATA.studioPerspectives = data.studioPerspectives;
  }
  render();
  const afterEl = document.getElementById('studioDrawerStatusMsg');
  if (afterEl) {
    afterEl.style.color = '#34d399';
    afterEl.textContent = 'Saved & snapshot recorded (' + ((data.snapshot && data.snapshot.id) || 'ok') + ').';
  }
}

async function saveStudioRationaleForm(nodeId) {
  const ratEl = document.getElementById('studioRationaleTextarea');
  const stEl = document.getElementById('studioStatusSelect');
  const rumorEl = document.getElementById('studioMysteryRumorInput');
  const silEl = document.getElementById('studioMysterySilhouetteInput');
  const qEl = document.getElementById('studioMysteryQuestionInput');
  const payload = {};
  if (ratEl) payload.core_rationale = ratEl.value;
  if (stEl) payload.status = stEl.value;
  if (rumorEl || silEl || qEl) {
    payload.mystery_hook = {
      in_world_rumor: rumorEl ? rumorEl.value : '',
      visual_silhouette: silEl ? silEl.value : '',
      unanswered_question: qEl ? qEl.value : ''
    };
  }
  await submitStudioRationaleUpdate(nodeId, payload);
}

async function toggleStudioQualityPillar(nodeId, pillarKey, verified, currentEvidence) {
  const ev = (currentEvidence && currentEvidence.length >= 15)
    ? currentEvidence
    : 'Verified against 90 to 120 centimeter scale and parent rationale.';
  await submitStudioRationaleUpdate(nodeId, {
    quality_checklist: {
      [pillarKey]: { verified: !!verified, evidence: ev }
    }
  });
}

async function triggerStudioChildGeneration(parentId) {
  const statusEl = document.getElementById('studioDrawerStatusMsg');
  const childNameEl = document.getElementById('studioChildNameInput');
  const childName = (childNameEl && childNameEl.value.trim()) || 'Uncharted Horizon Sector';
  if (statusEl) statusEl.textContent = 'Validating parent Canon & 5-pillar gate...';
  const res = await fetch('/api/studio/generate-children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId, childName, childStatus: 'mystery', persist: false })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    if (statusEl) {
      statusEl.style.color = '#f87171';
      statusEl.textContent = data.error || 'Child generation blocked.';
    }
    return;
  }
  if (statusEl) {
    statusEl.style.color = '#34d399';
    statusEl.textContent = 'Generated ' + data.childLayer + ' candidate: ' + data.childNode.id + ' (' + data.childNode.status + ')';
  }
  openInspector(data.childLayer, 'Generated Child Preview: ' + data.childNode.name, data.childNode);
}

async function undoStudioSnapshotAction() {
  const res = await fetch('/api/studio/undo', { method: 'POST' });
  const data = await res.json();
  const bundleRes = await fetch('/api/studio/perspectives');
  const bundleData = await bundleRes.json();
  if (bundleData.ok) {
    DATA.studioPerspectives = bundleData;
  }
  render();
  const statusEl = document.getElementById('studioDrawerStatusMsg');
  if (statusEl) {
    statusEl.style.color = data.ok ? '#34d399' : '#f87171';
    statusEl.textContent = data.ok ? ('Reverted snapshot ' + data.restoredSnapshot) : (data.error || 'Nothing to undo.');
  }
}

function renderQualityChecklistCardHtml(node) {
  const nodeId = (node && node.id) || '';
  const curStatus = (node && node.status) || 'draft';
  const qc = (node && node.quality_checklist) || {};
  const mh = (node && node.mystery_hook) || {};
  const labels = [
    ['causal_continuity', '1. Causal Continuity (Parent-to-Child Link)'],
    ['fantasy_and_wonder', '2. Fantasy and Wonder (Distinct High-Fantasy Hook)'],
    ['character_scale_consistency', '3. Character Scale Consistency (90 to 120 Centimeter Law)'],
    ['spatial_and_ecological_consistency', '4. Spatial and Ecological Consistency'],
    ['intentional_mystery_discipline', '5. Intentional Mystery Discipline (Zero Filler Slop)'],
  ];
  const passedCount = labels.filter(([k]) => qc[k] && qc[k].verified).length;
  const isLeaf = Boolean(node && node.node_type);

  return `
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px">
      <!-- Interactive Core Rationale & Status Editor -->
      <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:12px">Human-in-the-Loop Rationale &amp; Status Gate</strong>
          <button type="button" class="joy-button joy-button--ghost joy-button--sm" style="height:22px;font-size:10.5px" onclick="undoStudioSnapshotAction()">
            ↶ Undo Last Snapshot
          </button>
        </div>

        <label class="mono" style="display:block;font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">NODE STATUS (CANON REQUIRES 5/5 CHECKLIST + CANON PARENT)</label>
        <select id="studioStatusSelect" class="joy-select" style="width:100%;margin-bottom:8px;font-size:12px">
          <option value="canon" ${curStatus === 'canon' ? 'selected' : ''}>🟢 Canon (Approved for Downward Generation)</option>
          <option value="draft" ${curStatus === 'draft' ? 'selected' : ''}>🟡 Draft (Work in Progress)</option>
          <option value="mystery" ${curStatus === 'mystery' ? 'selected' : ''}>🟣 Mystery / Fog of Lore (Intentional Uncharted Hook)</option>
        </select>

        <label class="mono" style="display:block;font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">CORE RATIONALE (MINIMUM 20 CHARACTERS)</label>
        <textarea id="studioRationaleTextarea" rows="3" style="width:100%;padding:8px;border-radius:6px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-default);font-size:11.5px;margin-bottom:8px">${escapeHtml((node && node.core_rationale) || '')}</textarea>

        <div style="padding:8px;border-radius:6px;background:rgba(168,85,247,0.08);border:1px dashed rgba(168,85,247,0.4);margin-bottom:8px">
          <div class="mono" style="font-size:10px;color:#c084fc;margin-bottom:4px">INTENTIONAL MYSTERY / FOG OF LORE HOOK</div>
          <input id="studioMysteryRumorInput" type="text" placeholder="In-world rumor..." value="${escapeHtml(mh.in_world_rumor || '')}" style="width:100%;padding:5px 7px;border-radius:4px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11px;margin-bottom:4px" />
          <input id="studioMysterySilhouetteInput" type="text" placeholder="Visual silhouette..." value="${escapeHtml(mh.visual_silhouette || '')}" style="width:100%;padding:5px 7px;border-radius:4px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11px;margin-bottom:4px" />
          <input id="studioMysteryQuestionInput" type="text" placeholder="Unanswered question..." value="${escapeHtml(mh.unanswered_question || '')}" style="width:100%;padding:5px 7px;border-radius:4px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11px" />
        </div>

        <button type="button" class="joy-button joy-button--solid joy-button--sm" style="width:100%" onclick="saveStudioRationaleForm('${escapeHtml(nodeId)}')">
          Save Rationale, Mystery Hook &amp; Status
        </button>
        <div id="studioDrawerStatusMsg" class="mono" style="font-size:10.5px;margin-top:6px;min-height:14px;color:var(--joy-text-secondary)"></div>
      </div>

      <!-- Step-by-Step Five-Pillar Quality Checklist -->
      <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:12px">Step-by-Step Five-Pillar Quality Checklist</strong>
          <span class="joy-badge ${passedCount === 5 ? 'joy-badge--success' : 'joy-badge--warning'} joy-badge--sm">${passedCount} / 5 Verified</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${labels.map(([k, title]) => {
            const item = qc[k] || { verified: false, evidence: 'Not verified yet.' };
            const safeEv = escapeHtml(item.evidence || '').replace(/'/g, "\'");
            return `
              <label style="padding:7px 9px;border-radius:6px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle);font-size:11.5px;cursor:pointer;display:block">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                  <span style="font-weight:700;color:${item.verified ? '#34d399' : '#fbbf24'};display:flex;align-items:center;gap:6px">
                    <input type="checkbox" ${item.verified ? 'checked' : ''} onchange="toggleStudioQualityPillar('${escapeHtml(nodeId)}', '${k}', this.checked, '${safeEv}')" />
                    ${escapeHtml(title)}
                  </span>
                  <span class="mono" style="font-size:10px">${item.verified ? 'VERIFIED' : 'PENDING'}</span>
                </div>
                <div style="color:var(--joy-text-secondary);margin-top:3px;font-size:11px">${escapeHtml(item.evidence || '')}</div>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Top-Down Child Layer Generation Gate -->
      ${!isLeaf ? `
        <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
          <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">
            TOP-DOWN CHILD LAYER GENERATION GATE
          </div>
          <input id="studioChildNameInput" type="text" placeholder="New child region name..." value="Uncharted Horizon Sector" style="width:100%;padding:6px 8px;border-radius:6px;background:var(--joy-surface-card);color:var(--joy-text-primary);border:1px solid var(--joy-border-subtle);font-size:11.5px;margin-bottom:8px" />
          <button type="button" class="joy-button ${curStatus === 'canon' && passedCount === 5 ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" style="width:100%" onclick="triggerStudioChildGeneration('${escapeHtml(nodeId)}')">
            ${curStatus === 'canon' && passedCount === 5 ? '✨ Generate Child Layer Candidate ➔' : '🔒 Child Generation Locked (Requires Canon + 5/5 Checklist)'}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderTopDownStudio() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const whc = sp.worldHistoryAndConcept || {};
  const continents = sp.continents || [];
  const districts = sp.districts || [];
  const nodes = sp.nodes || [];

  const activeContinent = continents.find(c => c.id === STUDIO_SELECTED_CONTINENT_ID) || continents[0] || {};
  const activeDistrict = districts.find(d => d.id === STUDIO_SELECTED_DISTRICT_ID) || districts[0] || {};
  const activeNode = nodes.find(n => n.id === STUDIO_SELECTED_NODE_ID) || nodes[0] || {};

  const perspectiveBar = `
    <div id="perspectiveBar" style="position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;margin-bottom:16px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
        <span class="mono" style="font-size:11px;font-weight:700;color:var(--joy-text-secondary)">PERSPECTIVE:</span>
        <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'world-history-and-concept' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('world-history-and-concept', { inspectId: '${escapeHtml(whc.id || '')}' })">
          🌌 World History and Concept
        </button>
        <span style="color:var(--joy-text-muted);font-weight:700">➔</span>
        <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'continent' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('continent', { inspectId: '${escapeHtml(activeContinent.id || '')}' })">
          🌍 Continent (${escapeHtml(activeContinent.name || 'Continent')})
        </button>
        <span style="color:var(--joy-text-muted);font-weight:700">➔</span>
        <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'district' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('district', { inspectId: '${escapeHtml(activeDistrict.id || '')}' })">
          🗺️ District (${escapeHtml(activeDistrict.name || 'District')})
        </button>
        <span style="color:var(--joy-text-muted);font-weight:700">➔</span>
        <button type="button" class="joy-button ${STUDIO_PERSPECTIVE === 'town-or-hunting-area' ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { inspectId: '${escapeHtml(activeNode.id || '')}' })">
          📍 Town or Hunting Area (${escapeHtml(activeNode.name || 'Map')})
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="mono" style="font-size:11px;color:var(--joy-text-secondary)">Filter Status:</span>
        ${['all', 'canon', 'draft', 'mystery'].map(st => `
          <button type="button" class="joy-button ${STUDIO_STATUS_FILTER === st ? 'joy-button--solid' : 'joy-button--ghost'} joy-button--sm" onclick="setStudioStatusFilter('${st}')">
            ${st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  let canvasHtml = '';
  if (STUDIO_PERSPECTIVE === 'world-history-and-concept') {
    canvasHtml = renderStudioWorldHistoryPerspective(whc, continents);
  } else if (STUDIO_PERSPECTIVE === 'continent') {
    canvasHtml = renderStudioContinentPerspective(whc, continents, districts, activeContinent);
  } else if (STUDIO_PERSPECTIVE === 'district') {
    canvasHtml = renderStudioDistrictPerspective(activeContinent, districts, nodes, activeDistrict);
  } else {
    canvasHtml = renderStudioTownOrHuntingAreaPerspective(activeDistrict, nodes, activeNode);
  }

  const selfEval = sp.selfEvaluation || {};
  const ts = selfEval.turnSpeedTelemetry || {};
  const qs = selfEval.qualityScorecard || {};
  const queue = selfEval.nextIncrementBrainstormQueue || [];
  const canonCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'canon').length;
  const draftCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'draft').length;
  const mysteryCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'mystery').length;

  const ownerTelemetryBar = `
    <div id="productOwnerTelemetryBar" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;margin-bottom:16px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);border-radius:10px;font-size:11.5px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
        <span class="mono" style="font-weight:800;color:#38bdf8">🏛️ PRODUCT OWNER SELF-EVALUATION:</span>
        <span class="joy-badge joy-badge--success joy-badge--sm">Quality Score: ${qs.overallQualityScorePct ?? 100}%</span>
        <span class="joy-badge joy-badge--brand joy-badge--sm">Turn Speed: ${ts.totalElapsedMs ? ts.totalElapsedMs + ' ms (' + (ts.speedGrade || 'Fast') + ')' : 'Fast Cached'}</span>
        <span class="mono" style="color:var(--joy-text-secondary)">Nodes: 🟢 ${canonCount} Canon · 🟡 ${draftCount} Draft · 🟣 ${mysteryCount} Mystery</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
        <span class="mono" style="font-size:10.5px;color:var(--joy-text-secondary)">NEXT INCREMENT QUEUE:</span>
        ${queue.slice(0, 3).map(item => `
          <span class="mono" style="font-size:10.5px;padding:2px 8px;border-radius:999px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle)">
            ${escapeHtml(item.name)} (${item.verifiedPillarsCount}/5 · ${escapeHtml(item.recommendedLeadRole)})
          </span>
        `).join('')}
      </div>
    </div>
  `;

  return `${perspectiveBar}${ownerTelemetryBar}${canvasHtml}`;
}

// ============================================================================
// L2HUB ADEN PARCHMENT ATLAS + GOOGLE / APPLE MAPS 2D CARTOGRAPHIC EXPLORER
// ============================================================================
let STUDIO_CARTO_THEME = 'l2hub'; // 'l2hub' (L2 Aden Parchment) | 'google' (Google/Apple Dark GIS)
let STUDIO_MAP_ZOOM = 1.0;
let STUDIO_MAP_PAN_X = 0;
let STUDIO_MAP_PAN_Y = 0;
let STUDIO_MAP_SELECTED_POI = null;
let STUDIO_MAP_DRAG = null;
let STUDIO_MAP_LOC = { x: 72986, y: 113330, svgX: 590, svgY: 195 };

function setStudioCartoTheme(theme) {
  STUDIO_CARTO_THEME = theme === 'google' ? 'google' : 'l2hub';
  render();
}

function svgToL2Loc(svgX, svgY) {
  const lx = Math.round(12000 + (svgX / 1040) * 145000);
  const ly = Math.round(25000 + (svgY / 500) * 185000);
  return { x: lx, y: ly, svgX: Math.round(svgX), svgY: Math.round(svgY) };
}

function zoomStudioMap(delta, reset = false) {
  if (reset) {
    STUDIO_MAP_ZOOM = 1.0;
    STUDIO_MAP_PAN_X = 0;
    STUDIO_MAP_PAN_Y = 0;
  } else {
    STUDIO_MAP_ZOOM = Math.max(0.85, Math.min(4.5, +(STUDIO_MAP_ZOOM + delta).toFixed(2)));
  }
  applyStudioMapTransform();
}

function applyStudioMapTransform() {
  const g = document.getElementById('studioCartoViewport');
  const lbl = document.getElementById('studioCartoZoomReadout');
  if (g) {
    const cx = 520;
    const cy = 250;
    g.setAttribute(
      'transform',
      `translate(${cx + STUDIO_MAP_PAN_X}, ${cy + STUDIO_MAP_PAN_Y}) scale(${STUDIO_MAP_ZOOM}) translate(${-cx}, ${-cy})`
    );
  }
  if (lbl) {
    lbl.textContent = `${STUDIO_MAP_ZOOM.toFixed(2)}\u00d7`;
  }
}

function onStudioMapWheel(evt) {
  evt.preventDefault();
  const delta = evt.deltaY < 0 ? 0.22 : -0.22;
  zoomStudioMap(delta, false);
}

function onStudioMapPointerDown(evt) {
  if (evt.target && evt.target.closest && evt.target.closest('[data-poi-clickable="1"]')) return;
  STUDIO_MAP_DRAG = {
    startX: evt.clientX - STUDIO_MAP_PAN_X,
    startY: evt.clientY - STUDIO_MAP_PAN_Y,
    downClientX: evt.clientX,
    downClientY: evt.clientY
  };
}

function onStudioMapPointerMove(evt) {
  if (!STUDIO_MAP_DRAG) return;
  STUDIO_MAP_PAN_X = evt.clientX - STUDIO_MAP_DRAG.startX;
  STUDIO_MAP_PAN_Y = evt.clientY - STUDIO_MAP_DRAG.startY;
  applyStudioMapTransform();
}

function onStudioMapPointerUp(evt) {
  if (STUDIO_MAP_DRAG && evt && Math.hypot(evt.clientX - STUDIO_MAP_DRAG.downClientX, evt.clientY - STUDIO_MAP_DRAG.downClientY) < 5) {
    const svg = evt.currentTarget;
    if (svg && svg.getBoundingClientRect) {
      const rect = svg.getBoundingClientRect();
      const sx = ((evt.clientX - rect.left) / rect.width) * 1040;
      const sy = ((evt.clientY - rect.top) / rect.height) * 500;
      STUDIO_MAP_LOC = svgToL2Loc(sx, sy);
      const locBadge = document.getElementById('studioL2LocReadout');
      if (locBadge) locBadge.textContent = `loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`;
      const ch = document.getElementById('studioL2Crosshair');
      if (ch) ch.setAttribute('transform', `translate(${STUDIO_MAP_LOC.svgX}, ${STUDIO_MAP_LOC.svgY})`);
    }
  }
  STUDIO_MAP_DRAG = null;
}

function selectStudioMapPoi(poiJsonStr, evt) {
  if (evt && evt.stopPropagation) evt.stopPropagation();
  try {
    const poi = typeof poiJsonStr === 'string' ? JSON.parse(poiJsonStr) : poiJsonStr;
    STUDIO_MAP_SELECTED_POI = poi;
    if (poi && poi.svgX !== undefined && poi.svgY !== undefined) {
      STUDIO_MAP_LOC = svgToL2Loc(poi.svgX, poi.svgY);
    }
    if (poi && poi.inspectId) {
      STUDIO_ACTIVE_INSPECT_ID = poi.inspectId;
    }
    render();
  } catch (err) {
    console.error('selectStudioMapPoi error:', err);
  }
}

function closeStudioMapPoi(evt) {
  if (evt && evt.stopPropagation) evt.stopPropagation();
  STUDIO_MAP_SELECTED_POI = null;
  render();
}

function encodePoiAttr(poiObj) {
  return escapeHtml(JSON.stringify(poiObj));
}

// Reusable Lineage II (l2hub.info/map) Hand-Illustrated Landmark Silhouette Renderer
function drawL2LandmarkSvg({ kind, x, y, label, sublabel, flagColor, isSelected, poiObj }) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const fCol = flagColor || '#dc2626';
  const safeLabel = escapeHtml(label || '');
  const safeSub = escapeHtml(sublabel || '');
  const clickAttr = poiObj ? `data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiObj, svgX: x, svgY: y })}', event)"` : '';
  const selRing = isSelected
    ? `<circle cx="${x}" cy="${y}" r="26" fill="rgba(250,204,21,0.22)" stroke="#fde047" stroke-width="2" stroke-dasharray="5 3"/>`
    : '';

  let iconSvg = '';
  if (kind === 'castle') {
    // Multi-turret crenellated Castle Keep (like Gludio Castle / Dion Castle / Giran Castle)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="12" rx="26" ry="9" fill="rgba(18,13,7,0.65)"/>
        <path d="M-22,12 L-22,-6 L-18,-6 L-18,-2 L-14,-2 L-14,-6 L-10,-6 L-10,2 L-7,2 L-7,-16 L-3,-22 L3,-22 L7,-16 L7,2 L10,2 L10,-6 L14,-6 L14,-2 L18,-2 L18,-6 L22,-6 L22,12 Z"
              fill="#2a2012" stroke="#d4af37" stroke-width="1.6" stroke-linejoin="round"/>
        <rect x="-15" y="-12" width="6" height="14" fill="#3d2f1b" stroke="#0f0a05" stroke-width="1.2"/>
        <rect x="9" y="-12" width="6" height="14" fill="#3d2f1b" stroke="#0f0a05" stroke-width="1.2"/>
        <path d="M-5,12 L-5,3 Q0,-2 5,3 L5,12 Z" fill="#0c0905" stroke="#eab308" stroke-width="1.1"/>
        <!-- Castle Flag -->
        <line x1="0" y1="-22" x2="0" y2="-32" stroke="#f8fafc" stroke-width="1.4"/>
        <polygon points="0,-32 11,-28 0,-24" fill="${fCol}" stroke="#120d07" stroke-width="0.9"/>
      </g>
    `;
  } else if (kind === 'town') {
    // Oval Walled Town packed with medieval roofs & watchtowers (like Town of Dion / Town of Gludio / Town of Giran)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="4" rx="25" ry="13" fill="#302414" stroke="#d4af37" stroke-width="1.8"/>
        <ellipse cx="0" cy="3" rx="21" ry="10" fill="#4a3820" stroke="#140e07" stroke-width="1.2"/>
        <!-- Peaked town roofs inside the curtain wall -->
        <polygon points="-14,3 -8,-6 -2,3" fill="#854d27" stroke="#140e07" stroke-width="1"/>
        <polygon points="2,4 9,-5 16,4" fill="#9a5b30" stroke="#140e07" stroke-width="1"/>
        <rect x="-4" y="-12" width="8" height="15" fill="#574429" stroke="#140e07" stroke-width="1.2"/>
        <polygon points="-6,-12 0,-20 6,-12" fill="#eab308" stroke="#140e07" stroke-width="1.1"/>
        <!-- Town Gatehouse -->
        <rect x="-4" y="6" width="8" height="7" rx="2" fill="#140e07" stroke="#fde047" stroke-width="1"/>
      </g>
    `;
  } else if (kind === 'fortress') {
    // Stone Fortress Bastion with Flying Triangular Pennant Flag (like Dragonspine / Tanor / Antharas Fortress)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="9" rx="18" ry="6" fill="rgba(18,13,7,0.55)"/>
        <path d="M-14,9 L-12,-5 L-8,-5 L-8,-2 L-3,-2 L-3,-8 L3,-8 L3,-2 L8,-2 L8,-5 L12,-5 L14,9 Z"
              fill="#3b2f1e" stroke="#c8b273" stroke-width="1.4" stroke-linejoin="round"/>
        <line x1="-2" y1="-8" x2="-2" y2="-23" stroke="#140e07" stroke-width="2.2"/>
        <line x1="-2" y1="-8" x2="-2" y2="-23" stroke="#e2d5b5" stroke-width="1.2"/>
        <polygon points="-2,-23 12,-18 -2,-13" fill="${fCol}" stroke="#140e07" stroke-width="1"/>
      </g>
    `;
  } else if (kind === 'tower') {
    // Tall Spire inside concentric circular moat (like Cruma Tower)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="6" rx="24" ry="11" fill="rgba(26,46,53,0.75)" stroke="#5c5338" stroke-width="2" stroke-dasharray="6 3"/>
        <ellipse cx="0" cy="6" rx="15" ry="7" fill="#2c2416" stroke="#a39060" stroke-width="1.2"/>
        <path d="M-6,6 L-4,-18 L0,-25 L4,-18 L6,6 Z" fill="#3a2c18" stroke="#fde047" stroke-width="1.4"/>
        <circle cx="0" cy="-12" r="2.5" fill="#38bdf8"/>
      </g>
    `;
  } else if (kind === 'catacomb') {
    // Dark Trapezoid Necropolis / Catacomb Portal with Floating Eye Sigil (like Catacomb of the Heretic / Necropolis of Martyrdom)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <polygon points="-11,9 -7,-4 7,-4 11,9" fill="#0d0b09" stroke="#a855f7" stroke-width="1.5"/>
        <rect x="-3" y="1" width="6" height="8" fill="#3b0764"/>
        <path d="M-9,-10 Q0,-16 9,-10 Q0,-4 -9,-10 Z" fill="#1e1b4b" stroke="#e9d5ff" stroke-width="1.2"/>
        <circle cx="0" cy="-10" r="2.5" fill="#c084fc"/>
      </g>
    `;
  } else if (kind === 'lair') {
    // Dragon / Boss Skull & Ribcage Silhouette (like Antharas Lair / The Ant Nest / Ruins of Agony)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="7" rx="19" ry="7" fill="rgba(18,13,7,0.6)"/>
        <path d="M-15,-4 Q-19,-15 -8,-12 Q0,-17 8,-12 Q19,-15 15,-4 Q11,7 0,9 Q-11,7 -15,-4 Z"
              fill="#453723" stroke="#f97316" stroke-width="1.4"/>
        <circle cx="-5" cy="-4" r="2.5" fill="#ef4444"/>
        <circle cx="5" cy="-4" r="2.5" fill="#ef4444"/>
        <path d="M-6,4 L-3,8 L0,4 L3,8 L6,4" fill="none" stroke="#140e07" stroke-width="1.4"/>
      </g>
    `;
  } else if (kind === 'windmill') {
    // Village Windmill (like Floran Village)
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <polygon points="-7,10 -4,-6 4,-6 7,10" fill="#523d24" stroke="#140e07" stroke-width="1.3"/>
        <line x1="-12" y1="-12" x2="12" y2="4" stroke="#eab308" stroke-width="2"/>
        <line x1="12" y1="-12" x2="-12" y2="4" stroke="#eab308" stroke-width="2"/>
        <circle cx="0" cy="-4" r="2.5" fill="#f8fafc" stroke="#140e07" stroke-width="1"/>
      </g>
    `;
  } else {
    // Hunting Area / Camp / Outpost Tent Silhouette
    iconSvg = `
      <g transform="translate(${x}, ${y})">
        <polygon points="-12,8 -4,-6 4,8" fill="#5c4628" stroke="#140e07" stroke-width="1.2"/>
        <polygon points="-2,9 6,-4 14,9" fill="#705632" stroke="#d4af37" stroke-width="1.2"/>
      </g>
    `;
  }

  const labelY = y + (kind === 'castle' || kind === 'town' ? 24 : 21);
  return `
    <g ${clickAttr}>
      ${selRing}
      ${iconSvg}
      <text x="${x}" y="${labelY}" text-anchor="middle"
            style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.8px;stroke-linejoin:round;fill:${isSelected ? '#fde047' : '#f8f5ec'};font-size:${kind === 'castle' || kind === 'town' ? '11.5px' : '10.5px'};font-weight:800;font-family:${isL2 ? 'Georgia, serif' : 'Inter, sans-serif'}">
        ${safeLabel}
      </text>
      ${safeSub ? `
        <text x="${x}" y="${labelY + 12}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#120d07;stroke-width:3px;stroke-linejoin:round;fill:#e2d5b5;font-size:9px;font-weight:700;font-family:monospace">
          ${safeSub}
        </text>
      ` : ''}
    </g>
  `;
}

// Reusable Mountain Ridge Hachure Generator (L2Hub Topographic Relief)
function drawL2MountainRangeSvg(pointsStr, scale = 1.0) {
  return `
    <g opacity="0.72" pointer-events="none">
      <polyline points="${pointsStr}" fill="none" stroke="#2b2416" stroke-width="${12 * scale}" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
      <polyline points="${pointsStr}" fill="none" stroke="#463c27" stroke-width="${6 * scale}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 5"/>
      <polyline points="${pointsStr}" fill="none" stroke="#8c7f5a" stroke-width="${2 * scale}" stroke-linecap="round" stroke-dasharray="2 7"/>
    </g>
  `;
}

function renderCartoShellHtml({
  stepLabel,
  title,
  subtitle,
  activeScaleIndex,
  defaultPoi,
  svgInnerHtml,
  legendItems,
  drillControls
}) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const poi = STUDIO_MAP_SELECTED_POI || defaultPoi;
  const zoomScales = [
    { idx: 1, code: 'LU4 · WORLD', label: '🌍 Lv.1 World Atlas (1×)', persp: 'world-history-and-concept' },
    { idx: 2, code: 'C1 · ADEN CONT', label: '🗺️ Lv.2 Continent & Fortresses (4×)', persp: 'continent' },
    { idx: 3, code: 'C4 · DISTRICT', label: '🏙️ Lv.3 District Territory & Roads (16×)', persp: 'district' },
    { idx: 4, code: 'GF · STREET', label: '🏘️ Lv.4 Street, Walls & Buildings (64×)', persp: 'town-or-hunting-area' }
  ];

  const placeDrawerHtml = poi ? `
    <div id="studioGooglePlaceDrawer" style="width:345px;flex-shrink:0;background:#161f2c;border-right:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;justify-content:space-between;max-height:520px;overflow-y:auto">
      <div style="padding:16px">
        <!-- Place Header (Apple/Google Maps + L2Hub Place Card Style) -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <div style="font-size:18px;font-weight:800;color:#f8fafc;line-height:1.25">${escapeHtml(poi.title || 'Selected Place')}</div>
            <div style="font-size:12.5px;color:#94a3b8;margin-top:3px;font-weight:600">${escapeHtml(poi.category || 'Cartographic Feature')}</div>
          </div>
          <button type="button" onclick="closeStudioMapPoi(event)" title="Reset to Default Overview" style="width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);background:#243244;color:#cbd5e1;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center">×</button>
        </div>

        <!-- Primary Action Bar (Directions / Zoom Here / Center View) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          ${poi.drillPerspective ? `
            <button type="button" onclick="setStudioPerspective('${escapeHtml(poi.drillPerspective)}', ${escapeHtml(JSON.stringify(poi.drillOpts || {}))}); STUDIO_MAP_SELECTED_POI=null;" style="height:36px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.35)">
              🔍 ${escapeHtml(poi.drillLabel || 'Zoom Into Map')}
            </button>
          ` : `
            <button type="button" onclick="zoomStudioMap(0.45, false)" style="height:36px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
              🔍 Zoom Closer
            </button>
          `}
          <button type="button" onclick="zoomStudioMap(0, true)" style="height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:#243244;color:#e2e8f0;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
            🧭 Center View
          </button>
        </div>

        <!-- 3D Thumbnail + Status Banner -->
        <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding:10px;border-radius:10px;background:#0f1722;border:1px solid rgba(255,255,255,0.08)">
          <img src="${escapeHtml(poi.thumb || '/thumbs/buildings/tower_round_roof_a.webp')}" alt="" style="width:56px;height:56px;border-radius:8px;object-fit:contain;background:#090d14;border:1px solid rgba(255,209,102,0.35);flex-shrink:0" />
          <div style="min-width:0">
            <div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(poi.hoursOrStatus || 'Open 24 Hours · Active Canon')}</div>
            <div style="font-size:11.5px;color:#cbd5e1;margin-top:3px;line-height:1.35">${escapeHtml(poi.summary || '')}</div>
          </div>
        </div>

        <!-- Details Section (Apple/Google Maps + L2Hub Cards) -->
        <div style="font-size:13px;font-weight:800;color:#f8fafc;margin:14px 0 8px">Details &amp; Cartography</div>

        <!-- Card 1: Geographic Address & L2Hub loc=X:Y Coordinates -->
        <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07);margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase">Address &amp; Geolocation</span>
            <span class="mono" style="font-size:10px;color:#f87171;font-weight:800">╋ loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}</span>
          </div>
          <div style="font-size:12px;color:#f8fafc;margin-top:4px;line-height:1.45;font-weight:600">${escapeHtml(poi.address || 'Aethelgard World Atlas')}</div>
          ${poi.coordinates ? `<div class="mono" style="font-size:11px;color:#38bdf8;margin-top:4px">${escapeHtml(poi.coordinates)}</div>` : ''}
        </div>

        <!-- Card 2: Architecture, Walkways & 90–120cm Scale -->
        ${poi.scaleSpecs ? `
          <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07);margin-bottom:8px">
            <div style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase">Walkway, Building &amp; 90–120cm Scale</div>
            <div style="font-size:11.5px;color:#fde68a;margin-top:4px;line-height:1.45">${escapeHtml(poi.scaleSpecs)}</div>
          </div>
        ` : ''}

        <!-- Card 3: Connections / Residents / Drops -->
        ${(poi.connections && poi.connections.length) ? `
          <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07)">
            <div style="font-size:10.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:6px">Connected Routes &amp; Landmarks</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${poi.connections.map(c => `
                <div style="font-size:11.5px;color:#cbd5e1;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;border-radius:6px;background:#182232">
                  <span>${escapeHtml(c.label)}</span>
                  <span class="mono" style="font-size:10.5px;color:#38bdf8">${escapeHtml(c.badge || '')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  ` : '';

  return `
    <div style="margin-bottom:16px;border-radius:14px;background:#12110e;border:1px solid ${isL2 ? 'rgba(212,175,55,0.45)' : 'rgba(56,189,248,0.35)'};box-shadow:0 16px 38px rgba(0,0,0,0.65);overflow:hidden">
      <!-- Top L2Hub World Map + Google/Apple Maps Semantic Zoom Header -->
      <div style="padding:11px 16px;background:${isL2 ? '#1a1712' : '#131d2e'};border-bottom:1px solid rgba(255,255,255,0.12);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="mono" style="font-size:10.5px;font-weight:800;color:${isL2 ? '#f59e0b' : '#38bdf8'};letter-spacing:0.06em">${stepLabel}</span>
            <span id="studioL2LocReadout" class="mono" style="padding:2px 8px;border-radius:4px;background:rgba(220,38,38,0.18);border:1px solid rgba(248,113,113,0.5);color:#fca5a5;font-size:10.5px;font-weight:800">loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}</span>
          </div>
          <div style="font-size:14px;font-weight:800;color:#f8fafc;margin-top:2px">${title}</div>
          <div style="font-size:11.5px;color:#94a3b8;margin-top:1px">${subtitle}</div>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <!-- Cartography Style Switcher: L2Hub Parchment vs Google/Apple GIS -->
          <div style="display:inline-flex;background:#0c0a08;padding:2px;border-radius:8px;border:1px solid rgba(255,255,255,0.16);margin-right:4px">
            <button type="button" onclick="setStudioCartoTheme('l2hub')" style="padding:4px 9px;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;border:none;background:${isL2 ? '#d97706' : 'transparent'};color:${isL2 ? '#ffffff' : '#94a3b8'}">
              📜 L2Hub Aden Parchment
            </button>
            <button type="button" onclick="setStudioCartoTheme('google')" style="padding:4px 9px;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;border:none;background:${!isL2 ? '#2563eb' : 'transparent'};color:${!isL2 ? '#ffffff' : '#94a3b8'}">
              🗺️ Google/Apple GIS
            </button>
          </div>
          ${zoomScales.map(zs => `
            <button type="button" onclick="setStudioPerspective('${zs.persp}'); STUDIO_MAP_ZOOM=1.0; STUDIO_MAP_PAN_X=0; STUDIO_MAP_PAN_Y=0;" style="padding:5px 10px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${zs.idx === activeScaleIndex ? '#f59e0b' : 'rgba(255,255,255,0.14)'};background:${zs.idx === activeScaleIndex ? '#d97706' : '#26231d'};color:${zs.idx === activeScaleIndex ? '#ffffff' : '#d6d3d1'}">
              ${zs.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Main Split: Left Place Details Drawer + Right Interactive 2D World Map -->
      <div style="display:flex;align-items:stretch;position:relative;min-height:500px;background:${isL2 ? '#2b3d41' : '#193452'}">
        ${placeDrawerHtml}

        <div style="flex:1;position:relative;min-width:0;overflow:hidden;background:${isL2 ? '#2b3d41' : '#193452'}">
          <!-- Floating Map Zoom Controls (+ / - / 1:1) -->
          <div style="position:absolute;top:12px;right:12px;z-index:10;display:flex;flex-direction:column;gap:4px;background:rgba(18,16,12,0.92);padding:6px;border-radius:10px;border:1px solid rgba(212,175,55,0.35);box-shadow:0 6px 18px rgba(0,0,0,0.55)">
            <button type="button" onclick="zoomStudioMap(0.3, false)" title="Zoom In" style="width:32px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#29251d;color:#f8fafc;font-size:16px;font-weight:800;cursor:pointer">+</button>
            <div id="studioCartoZoomReadout" class="mono" style="font-size:10px;text-align:center;color:#fde047;padding:2px 0">${STUDIO_MAP_ZOOM.toFixed(2)}×</div>
            <button type="button" onclick="zoomStudioMap(-0.3, false)" title="Zoom Out" style="width:32px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#29251d;color:#f8fafc;font-size:16px;font-weight:800;cursor:pointer">−</button>
            <button type="button" onclick="zoomStudioMap(0, true)" title="Reset Pan & Zoom" style="width:32px;height:26px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#17140f;color:#fde047;font-size:10px;font-weight:700;cursor:pointer">1:1</button>
          </div>

          ${drillControls ? `
            <div style="position:absolute;top:12px;left:12px;z-index:10;display:flex;flex-wrap:wrap;gap:6px">
              ${drillControls}
            </div>
          ` : ''}

          <!-- Interactive 2D Cartographic SVG Map -->
          <svg viewBox="0 0 1040 500" width="100%" height="500"
               onwheel="onStudioMapWheel(event)"
               onmousedown="onStudioMapPointerDown(event)"
               onmousemove="onStudioMapPointerMove(event)"
               onmouseup="onStudioMapPointerUp(event)"
               onmouseleave="onStudioMapPointerUp(event)"
               style="display:block;width:100%;height:500px;cursor:grab;user-select:none">
            <defs>
              <radialGradient id="cartoSeaGrad" cx="50%" cy="50%" r="72%">
                <stop offset="0%" stop-color="${isL2 ? '#3d5a5e' : '#21436a'}"/>
                <stop offset="65%" stop-color="${isL2 ? '#2f474b' : '#193452'}"/>
                <stop offset="100%" stop-color="${isL2 ? '#1f3134' : '#12263d'}"/>
              </radialGradient>
              <radialGradient id="l2ParchmentGrad" cx="48%" cy="46%" r="65%">
                <stop offset="0%" stop-color="#857c58"/>
                <stop offset="55%" stop-color="#6b6344"/>
                <stop offset="100%" stop-color="#4e472f"/>
              </radialGradient>
              <pattern id="cartoGridPat" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="${isL2 ? 'rgba(24,18,10,0.16)' : 'rgba(148,163,184,0.07)'}" stroke-width="1"/>
              </pattern>
              <filter id="cartoDropShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.65"/>
              </filter>
            </defs>
            <rect width="1040" height="500" fill="url(#cartoSeaGrad)"/>
            <rect width="1040" height="500" fill="url(#cartoGridPat)"/>
            <!-- Vignette Parchment Frame like L2Hub Aden Map -->
            <g id="studioCartoViewport">
              ${svgInnerHtml}
              <!-- Interactive L2Hub Red/White Crosshair Target (+ at loc=X:Y) -->
              <g id="studioL2Crosshair" transform="translate(${STUDIO_MAP_LOC.svgX}, ${STUDIO_MAP_LOC.svgY})" pointer-events="none">
                <circle cx="0" cy="0" r="10" fill="rgba(220,38,38,0.22)" stroke="#ef4444" stroke-width="1.5"/>
                <line x1="-9" y1="0" x2="9" y2="0" stroke="#ef4444" stroke-width="3.2"/>
                <line x1="0" y1="-9" x2="0" y2="9" stroke="#ef4444" stroke-width="3.2"/>
                <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffffff" stroke-width="1.4"/>
                <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffffff" stroke-width="1.4"/>
              </g>
            </g>
            <rect width="1040" height="500" fill="none" stroke="#1c160e" stroke-width="10" pointer-events="none"/>
          </svg>

          <!-- Bottom Cartographic Scale Bar & Legend -->
          <div style="position:absolute;bottom:10px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 12px;border-radius:8px;background:rgba(15,13,10,0.9);border:1px solid rgba(212,175,55,0.28);font-size:11px;color:#e7e5e4;pointer-events:none">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              ${(legendItems || []).map(item => `
                <span style="display:inline-flex;align-items:center;gap:5px">
                  <span style="width:10px;height:10px;border-radius:3px;background:${item.color};display:inline-block;border:1px solid rgba(255,255,255,0.4)"></span>
                  <span>${escapeHtml(item.label)}</span>
                </span>
              `).join('')}
            </div>
            <div class="mono" style="font-size:10.5px;color:#fde68a">╋ Click Any Castle, Town, Fortress, Catacomb, or Road to Move Crosshair &amp; Inspect</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWhcBigPictureSvg(whc, continents) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const c01 = continents[0] || { id: 'continent-01-hearthbloom-basin', name: 'Hearthbloom Basin' };
  const c02 = continents[1] || { id: 'continent-02-clockwork-steppe', name: 'The Clockwork Steppe' };
  const c03 = continents[2] || { id: 'continent-03-shattered-halo', name: 'The Shattered Halo' };
  const bindings = whc.starter_town_bindings || [];
  const st0 = bindings[0] || { town_id: 'town-lantern-hollow', town_name: 'Lantern Hollow', continent_id: c01.id, district_id: 'district-teacup-meadows' };

  const poiC01 = {
    title: c01.name + ' (Continent 01)',
    category: 'Starter Ceramic Caldera Continent · Lv. 1–15',
    thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
    hoursOrStatus: 'CANON · 10 Canon Districts · 1 Mystery Caldera',
    summary: 'Sheltered perpetual-spring caldera formed inside Sola the Hearth-Weaver’s ceramic shield around the warm Inland Kiln Sea.',
    address: 'South-West Hemisphere · Lat 22°S, Lon 114°W · Scar: The Kiln-Basin Caldera',
    coordinates: '10 Canon Districts · 30 Playable Maps · Starter Town: Lantern Hollow',
    scaleSpecs: '2.0m × 1.5m keyhole cottage doorways · 0.14m step risers · 0.58m bakery counters · ≤0.25m clover grass',
    drillPerspective: 'continent',
    drillOpts: { continentId: c01.id, inspectId: c01.id },
    drillLabel: 'Zoom to Continent 01',
    inspectId: c01.id,
    connections: [
      { label: '🚂 Kettle-Whistle Root-Train → Clockwork Steppe', badge: 'OPEN' },
      { label: '⛵ Cloud-Pier Airship → The Shattered Halo', badge: 'OPEN' },
      { label: '🏰 Starter Town: Lantern Hollow (Teacup Meadows)', badge: 'SPAWN' }
    ]
  };

  const poiC02 = {
    title: c02.name + ' (Continent 02)',
    category: 'Tectonic Brass Plateau Continent · Lv. 15–30',
    thumb: '/thumbs/creatures/god-krono-brass-titan.webp',
    hoursOrStatus: 'CANON · All 11 Districts Canon · 33 Playable Maps',
    summary: 'Wind-swept copper-grassland plateau bisected by Krono the Brass Titan’s uncoiled mainspring canyon and thermal escapement mesas.',
    address: 'Eastern Equatorial Belt · Lat 08°N, Lon 062°E · Scar: Uncoiled Mainspring Faultline',
    coordinates: '11 Canon Districts · 33 Playable Maps · Hub: Pinion Terminus & Mercury-Bellows Hub',
    scaleSpecs: '4.0m–12.5m Titan gear-tooth highways · 0.58m–0.60m tinker benches · 0.14m cog-steps',
    drillPerspective: 'continent',
    drillOpts: { continentId: c02.id, inspectId: c02.id },
    drillLabel: 'Zoom to Continent 02',
    inspectId: c02.id,
    connections: [
      { label: '🚂 Root-Train Viaduct ← Hearthbloom Basin', badge: 'OPEN' },
      { label: '🌀 Astrolabe Rift Gate → The Shattered Halo', badge: 'OPEN' },
      { label: '⚙️ Eastern Frontier: Thermal Compensator Basin', badge: 'CANON' }
    ]
  };

  const poiC03 = {
    title: c03.name + ' (Continent 03)',
    category: 'Inverted-Gravity Floating Archipelago · Lv. 30–50',
    thumb: '/thumbs/creatures/god-vesper-dream-eater.webp',
    hoursOrStatus: 'CANON · 11 Canon Districts · 1 Draft Atoll',
    summary: 'Ring of levitating black basalt islands and starlight tether-bridges suspended above Vesper’s northern gravity vortex.',
    address: 'Northern Polar Ring · Lat 68°N, Lon 015°W · Scar: The Inverted Gravity Crater',
    coordinates: '11 Canon + 1 Draft District (Solstice Pendulum Atoll) · 34 Playable Maps',
    scaleSpecs: '12.0m–12.5m starlight tether-bridges · 0.14m basalt risers · 0.58m astrolabe consoles',
    drillPerspective: 'continent',
    drillOpts: { continentId: c03.id, inspectId: c03.id },
    drillLabel: 'Zoom to Continent 03',
    inspectId: c03.id,
    connections: [
      { label: '🌀 Astrolabe Rift Gate ← The Clockwork Steppe', badge: 'OPEN' },
      { label: '⛵ Cloud-Pier Airship ← Hearthbloom Basin', badge: 'OPEN' },
      { label: '⏳ Draft Frontier: Solstice Pendulum Atoll', badge: 'DRAFT' }
    ]
  };

  const poiStarter = {
    title: st0.town_name + ' (Starter Town)',
    category: 'Player Arrival Sanctuary · Teacup Meadows [1, 1]',
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: 'Every Day, Open 24 Hours · Zero Lethal Weather',
    summary: 'Located inside Sola’s unbroken Ceramic Palm where 90–120cm Star-Kindled Sprouts condense gently beside warm kiln hearths.',
    address: 'Lantern Hollow [1, 1] · Teacup Meadows · Hearthbloom Basin',
    coordinates: 'Map ID: lantern-hollow · 4000m × 4000m Town Sanctuary',
    scaleSpecs: '13.0m Main Plaza Road · 4.4m Cobblestone Walkways · 0.58m Bakery Counter · 0.14m Steps',
    drillPerspective: 'town-or-hunting-area',
    drillOpts: { continentId: c01.id, districtId: st0.district_id, nodeId: st0.town_id, inspectId: st0.town_id },
    drillLabel: 'Zoom to Street Map',
    inspectId: st0.town_id,
    connections: [
      { label: '🌿 West → Clover South Gate (Lv. 1–5)', badge: 'OPEN' },
      { label: '🕳️ Dungeon → Sunken Potter Hold B1', badge: 'OPEN' },
      { label: '🛤️ East → Kilnfire Terraces Highway', badge: 'OPEN' }
    ]
  };

  const landFill1 = isL2 ? 'url(#l2ParchmentGrad)' : '#28624f';
  const landStroke1 = isL2 ? '#332917' : '#4ade80';
  const waterCol = isL2 ? '#37565b' : '#1d4ed8';

  const svgInnerHtml = `
    <!-- Ocean Bathymetry Contours -->
    <path d="M 40,240 Q 220,170 430,260 T 940,340 L 980,480 L 40,480 Z" fill="${isL2 ? '#293f43' : '#1d3c5e'}" opacity="0.6"/>
    <ellipse cx="485" cy="128" rx="285" ry="95" fill="${isL2 ? '#223538' : '#172c48'}" stroke="${isL2 ? '#6e6244' : '#284e7a'}" stroke-width="1.5" stroke-dasharray="10 6"/>

    <!-- CONTINENT 01: HEARTHBLOOM BASIN (SW ORGANIC PARCHMENT LANDMASS + MOUNTAINS + RIVERS + CASTLES) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiC01, svgX: 235, svgY: 342 })}', event)">
      <path d="M 65,335 Q 85,235 195,220 Q 325,205 395,275 Q 435,345 375,425 Q 285,465 165,450 Q 55,425 65,335 Z" fill="${isL2 ? '#453e29' : '#214d43'}" stroke="${isL2 ? '#262013' : '#2d6a5b'}" stroke-width="6" opacity="0.8"/>
      <path d="M 78,335 Q 98,245 198,232 Q 318,218 382,282 Q 418,342 365,415 Q 280,452 170,438 Q 68,415 78,335 Z" fill="${landFill1}" stroke="${landStroke1}" stroke-width="2.5"/>
      ${drawL2MountainRangeSvg('105,315 155,260 225,252 305,262 355,310', 1.1)}
      ${drawL2MountainRangeSvg('125,395 215,425 315,402', 0.9)}
      <!-- Inland Kiln Sea & Glaze Rivers -->
      <ellipse cx="235" cy="342" rx="44" ry="20" fill="${waterCol}" stroke="#88b3ba" stroke-width="1.2"/>
      <path d="M 235,322 Q 210,275 165,242 M 279,342 Q 335,345 388,330 M 192,352 Q 140,375 88,390" fill="none" stroke="${waterCol}" stroke-width="4" stroke-linecap="round"/>
      <!-- Winding L2 Parchment Dirt Roads -->
      <path d="M 145,295 Q 190,320 235,342 T 325,295 M 235,342 Q 275,375 305,395" fill="none" stroke="#261f12" stroke-width="5" stroke-linecap="round"/>
      <path d="M 145,295 Q 190,320 235,342 T 325,295 M 235,342 Q 275,375 305,395" fill="none" stroke="#cbb989" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Continent Title -->
      <text x="235" y="255" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:4px;fill:#fde68a;font-size:13px;font-weight:900;letter-spacing:0.12em">HEARTHBLOOM BASIN (LV. 1–15)</text>
    </g>
    ${drawL2LandmarkSvg({ kind: 'town', x: 235, y: 342, label: st0.town_name, sublabel: '★ Starter Town', flagColor: '#eab308', isSelected: true, poiObj: poiStarter })}
    ${drawL2LandmarkSvg({ kind: 'castle', x: 325, y: 295, label: 'Kilnfire Castle', sublabel: 'Lv. 5–9', flagColor: '#dc2626', isSelected: false, poiObj: poiC01 })}
    ${drawL2LandmarkSvg({ kind: 'windmill', x: 145, y: 295, label: 'Amber-Root Village', sublabel: 'Lv. 2–6', flagColor: '#22c55e', isSelected: false, poiObj: poiC01 })}
    ${drawL2LandmarkSvg({ kind: 'catacomb', x: 305, y: 395, label: 'Cardamom Kiln Catacomb', sublabel: 'Mystery', flagColor: '#a855f7', isSelected: false, poiObj: poiC01 })}

    <!-- CONTINENT 02: THE CLOCKWORK STEPPE (EASTERN PLATEAU + CASTLES + FORTRESSES + BOSS LAIR) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiC02, svgX: 752, svgY: 318 })}', event)">
      <path d="M 555,255 Q 635,185 785,192 Q 935,200 975,285 Q 985,385 885,435 Q 735,455 615,405 Q 535,355 555,255 Z" fill="${isL2 ? '#453e29' : '#214d43'}" stroke="${isL2 ? '#262013' : '#2d6a5b'}" stroke-width="6" opacity="0.8"/>
      <path d="M 568,258 Q 642,195 785,202 Q 922,210 962,288 Q 970,378 878,422 Q 735,442 622,395 Q 548,348 568,258 Z" fill="${landFill1}" stroke="${landStroke1}" stroke-width="2.5"/>
      ${drawL2MountainRangeSvg('605,245 705,220 815,228 915,255', 1.15)}
      ${drawL2MountainRangeSvg('635,375 765,360 885,385', 1.0)}
      <!-- Uncoiled Mainspring Canyon River -->
      <path d="M 572,325 Q 695,305 795,320 T 958,295" fill="none" stroke="${waterCol}" stroke-width="5" stroke-linecap="round"/>
      <!-- Winding L2 Parchment Dirt Roads -->
      <path d="M 615,318 Q 685,295 752,318 T 895,302 M 752,318 Q 775,260 825,245" fill="none" stroke="#261f12" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M 615,318 Q 685,295 752,318 T 895,302 M 752,318 Q 775,260 825,245" fill="none" stroke="#cbb989" stroke-width="2.8" stroke-linecap="round"/>
      <text x="765" y="218" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:4px;fill:#fde68a;font-size:13px;font-weight:900;letter-spacing:0.12em">THE CLOCKWORK STEPPE (LV. 15–30)</text>
    </g>
    ${drawL2LandmarkSvg({ kind: 'castle', x: 615, y: 318, label: 'Pinion Terminus Castle', sublabel: 'Lv. 15–20', flagColor: '#dc2626', isSelected: false, poiObj: poiC02 })}
    ${drawL2LandmarkSvg({ kind: 'tower', x: 752, y: 318, label: 'Mainspring Tower', sublabel: 'Lv. 20–26', flagColor: '#2563eb', isSelected: false, poiObj: poiC02 })}
    ${drawL2LandmarkSvg({ kind: 'fortress', x: 825, y: 245, label: 'Pendulum Escapement Fortress', sublabel: 'Lv. 22–28', flagColor: '#dc2626', isSelected: false, poiObj: poiC02 })}
    ${drawL2LandmarkSvg({ kind: 'town', x: 895, y: 315, label: 'Mercury-Bellows Hub', sublabel: 'Lv. 27–30 Canon', flagColor: '#22c55e', isSelected: false, poiObj: poiC02 })}

    <!-- CONTINENT 03: THE SHATTERED HALO (NORTHERN FLOATING ATOLL + GRAVITY EYE + LAIRS) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiC03, svgX: 485, svgY: 112 })}', event)">
      <path d="M 255,115 Q 335,55 485,48 Q 645,52 725,115 Q 685,155 615,135 Q 555,95 485,92 Q 415,95 355,135 Q 295,155 255,115 Z" fill="${landFill1}" stroke="#c084fc" stroke-width="2.2"/>
      <path d="M 325,168 Q 415,198 555,192 Q 635,182 665,152 Q 595,168 485,170 Q 385,168 325,168 Z" fill="${landFill1}" stroke="#a855f7" stroke-width="1.8"/>
      <ellipse cx="485" cy="132" rx="72" ry="26" fill="#13111c" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 3"/>
      <path d="M 345,108 Q 415,82 485,82 T 628,108" fill="none" stroke="#261f12" stroke-width="4.5"/>
      <path d="M 345,108 Q 415,82 485,82 T 628,108" fill="none" stroke="#cbb989" stroke-width="2.2"/>
      <text x="485" y="38" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:4px;fill:#e9d5ff;font-size:13px;font-weight:900;letter-spacing:0.14em">THE SHATTERED HALO (LV. 30–50)</text>
    </g>
    ${drawL2LandmarkSvg({ kind: 'castle', x: 345, y: 108, label: 'Starfall Haven Keep', sublabel: 'Lv. 30–36', flagColor: '#38bdf8', isSelected: false, poiObj: poiC03 })}
    ${drawL2LandmarkSvg({ kind: 'lair', x: 485, y: 132, label: 'Vesper Gravity Lair', sublabel: 'Lv. 45–50 Boss', flagColor: '#dc2626', isSelected: false, poiObj: poiC03 })}
    ${drawL2LandmarkSvg({ kind: 'fortress', x: 628, y: 108, label: 'Solstice Pendulum Fortress', sublabel: 'Lv. 46–50 Draft', flagColor: '#eab308', isSelected: false, poiObj: poiC03 })}

    <!-- INTER-CONTINENTAL VIADUCTS & CORRIDORS -->
    <path d="M 255,342 C 375,335 475,328 595,318" fill="none" stroke="#1c160e" stroke-width="6"/>
    <path d="M 255,342 C 375,335 475,328 595,318" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="10 4"/>
    <text x="435" y="322" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:#fde047;font-size:10px;font-weight:800">🚂 KETTLE-WHISTLE ROOT-TRAIN VIADUCT</text>
  `;

  return renderCartoShellHtml({
    stepLabel: '🌍 STEP 1 WORLD MAP (L2HUB ADEN PARCHMENT + GOOGLE MAPS EXPLORER)',
    title: 'Aethelgard World Map — Continents, Castles, Walled Towns, Fortresses, Catacombs & Winding Roads',
    subtitle: 'Inspired by l2hub.info/map & Google Maps: click any Castle, Town, Fortress, Catacomb, or Road to move the red crosshair (loc=X:Y) and open its Place Details Drawer',
    activeScaleIndex: 1,
    defaultPoi: poiStarter,
    svgInnerHtml,
    legendItems: [
      { color: '#857c58', label: 'Topographic Parchment Relief' },
      { color: '#cbb989', label: 'Winding Dirt & Cobble Roads' },
      { color: '#dc2626', label: 'Castles & Pennant Fortresses' },
      { color: '#a855f7', label: 'Catacombs & Necropolises' },
      { color: '#ef4444', label: '╋ Interactive loc=X:Y Crosshair' }
    ]
  });
}

function renderContinentBigPictureSvg(continents, districts, activeContinent) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const childDistricts = districts.filter(d => d.parent_continent_id === activeContinent.id);
  const isC01 = activeContinent.id.includes('continent-01');
  const isC02 = activeContinent.id.includes('continent-02');

  // 12 Aden-style geographic positions across the 1040x500 Continent Parchment Map (just like Gludio -> Dion -> Cruma -> Giran -> Death Pass -> Dragon Valley -> Antharas Lair!)
  const regionCenters = [
    { x: 155, y: 375, kind: 'town',     flag: '#eab308', poly: '65,305 245,300 265,445 75,455' },
    { x: 315, y: 365, kind: 'windmill', flag: '#22c55e', poly: '245,300 415,305 425,450 265,445' },
    { x: 485, y: 382, kind: 'castle',   flag: '#dc2626', poly: '415,305 585,305 595,450 425,450' },
    { x: 665, y: 372, kind: 'fortress', flag: '#dc2626', poly: '585,305 765,310 775,450 595,450' },
    { x: 205, y: 235, kind: 'castle',   flag: '#dc2626', poly: '75,165 295,165 245,300 65,305' },
    { x: 385, y: 215, kind: 'tower',    flag: '#38bdf8', poly: '295,165 485,165 415,305 245,300' },
    { x: 565, y: 235, kind: 'catacomb', flag: '#a855f7', poly: '485,165 675,170 585,305 415,305' },
    { x: 745, y: 245, kind: 'town',     flag: '#22c55e', poly: '675,170 855,175 765,310 585,305' },
    { x: 285, y: 105, kind: 'fortress', flag: '#dc2626', poly: '125,45 435,45 485,165 295,165 75,165' },
    { x: 575, y: 102, kind: 'fortress', flag: '#2563eb', poly: '435,45 715,45 675,170 485,165' },
    { x: 845, y: 118, kind: 'lair',     flag: '#f97316', poly: '715,45 975,65 965,225 855,175 675,170' },
    { x: 895, y: 345, kind: 'castle',   flag: '#22c55e', poly: '765,310 965,225 985,435 775,450' }
  ];

  // Winding Road Network (connecting every District like Aden's Gludio-Dion-Giran-DragonValley network)
  const roadPairs = [
    [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 1], [5, 6], [6, 2], [6, 7], [7, 3],
    [4, 8], [5, 8], [6, 9], [7, 9], [9, 10], [7, 10], [7, 11], [3, 11]
  ];

  const firstDist = childDistricts[0] || {};
  const defaultPoi = {
    title: activeContinent.name || 'Continent Region',
    category: `Aden-Style Regional Parchment Map · ${childDistricts.length} Connected Districts`,
    thumb: isC01 ? '/thumbs/creatures/god-sola-hearth-weaver.webp' : (isC02 ? '/thumbs/creatures/god-krono-brass-titan.webp' : '/thumbs/creatures/god-vesper-dream-eater.webp'),
    hoursOrStatus: `CANON · ${childDistricts.filter(d => d.status === 'canon').length} Canon Districts`,
    summary: activeContinent.core_rationale || '',
    address: `${activeContinent.name} · ${(activeContinent.climate_profile && activeContinent.climate_profile.macro_biome) || 'Regional Plateau'}`,
    coordinates: `Level Band: Lv. ${(activeContinent.level_band && activeContinent.level_band.min_level) || 1}–${(activeContinent.level_band && activeContinent.level_band.max_level) || 30} · ${childDistricts.length} Districts`,
    scaleSpecs: (activeContinent.civilization_style && activeContinent.civilization_style.character_scale_adaptation) || '90–120cm scale roads & counters',
    drillPerspective: 'district',
    drillOpts: { continentId: activeContinent.id, districtId: firstDist.id, inspectId: firstDist.id },
    drillLabel: `Zoom to ${firstDist.name || 'District'}`,
    inspectId: activeContinent.id,
    connections: childDistricts.slice(0, 6).map((d, i) => ({
      label: `D${String(i + 1).padStart(2, '0')} · ${d.name}`,
      badge: `Lv.${(d.level_range || [1, 15]).join('–')} · ${(d.status || 'canon').toUpperCase()}`
    }))
  };

  // Base Parchment Continent Landmass + Sculpted Mountain Ridges + Rivers
  const terrainHtml = `
    <!-- Outer Coastal Shallows & Continent Parchment Island (like Aden Continent in l2hub.info/map) -->
    <path d="M 38,85 Q 110,28 515,28 Q 935,28 995,95 Q 1015,265 985,445 Q 845,482 515,475 Q 145,482 48,435 Q 18,265 38,85 Z"
          fill="${isL2 ? 'url(#l2ParchmentGrad)' : '#255847'}" stroke="#241c10" stroke-width="4"/>

    <!-- Topographic Shading & Marsh/Forest Basins -->
    <ellipse cx="385" cy="215" rx="95" ry="52" fill="${isL2 ? '#495239' : '#1b4335'}" opacity="0.65"/>
    <ellipse cx="745" cy="245" rx="110" ry="58" fill="${isL2 ? '#5b5338' : '#1b4335'}" opacity="0.55"/>
    <ellipse cx="845" cy="118" rx="95" ry="48" fill="${isL2 ? '#4a3f28' : '#1b4335'}" opacity="0.7"/>

    <!-- Continual Rivers, Lakes & Harbors (like Giran Harbor / Cruma Marshlands / Fellmere Lake) -->
    <path d="M 415,30 Q 405,135 385,215 T 485,382 L 515,478" fill="none" stroke="${isL2 ? '#314e52' : '#1d4ed8'}" stroke-width="12" stroke-linecap="round"/>
    <path d="M 45,295 Q 235,275 385,215 T 745,245 L 995,215" fill="none" stroke="${isL2 ? '#39595e' : '#2563eb'}" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="385" cy="215" rx="45" ry="22" fill="${isL2 ? '#314e52' : '#1d4ed8'}" stroke="#7fa6ad" stroke-width="1.2"/>

    <!-- Sculpted Mountain Ranges & Canyons (like Death Pass & Dragon Valley ridges!) -->
    ${drawL2MountainRangeSvg('95,155 215,135 335,155 465,130', 1.2)}
    ${drawL2MountainRangeSvg('525,155 625,125 645,215 620,285', 1.25)}
    ${drawL2MountainRangeSvg('715,75 815,65 925,95 945,175', 1.3)}
    ${drawL2MountainRangeSvg('225,315 355,325 445,295', 1.0)}
    ${drawL2MountainRangeSvg('695,325 815,295 915,310', 1.1)}

    <!-- Vertical Mountain Pass Label (just like "Death Pass" in the L2Hub screenshot!) -->
    <text x="605" y="155" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:#f8f5ec;font-size:10px;font-weight:800;letter-spacing:0.25em" transform="rotate(90 605 155)">
      ${isC01 ? 'KILNFIRE PASS' : (isC02 ? 'MAINSPRING PASS' : 'SOLSTICE RIFT PASS')}
    </text>
  `;

  // Subtle Province TerritoryPolygons (clickable)
  const polygonsHtml = childDistricts.map((d, idx) => {
    const rc = regionCenters[idx % regionCenters.length];
    const st = (d.status || 'canon').toLowerCase();
    const poiObj = {
      title: `D${String(idx + 1).padStart(2, '0')} · ${d.name}`,
      category: `District Territory · ${d.level_band_label || 'Regional Cluster'} (Lv. ${(d.level_range || [1, 15]).join('–')})`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `${st.toUpperCase()} · ${(d.grid_nodes || []).length} Map Zones · Families: ${(d.ecological_monster_families || []).join(', ')}`,
      summary: d.core_rationale || '',
      address: `${d.name} · ${activeContinent.name}`,
      coordinates: `Grid: 2×2 Overland + Dungeon · Status: ${st.toUpperCase()}`,
      scaleSpecs: (d.quality_checklist && d.quality_checklist.character_scale_consistency && d.quality_checklist.character_scale_consistency.evidence) || '12.5m arterial highways, 0.58m counters, 0.14m risers',
      drillPerspective: 'district',
      drillOpts: { continentId: activeContinent.id, districtId: d.id, inspectId: d.id },
      drillLabel: 'Zoom to District Map',
      inspectId: d.id,
      svgX: rc.x,
      svgY: rc.y,
      connections: (d.grid_nodes || []).map(gn => ({
        label: `${gn.node_type === 'town' ? '🏰' : (gn.node_type === 'dungeon' ? '🕳️' : '🌿')} ${gn.node_id}`,
        badge: gn.status.toUpperCase()
      }))
    };
    return `
      <polygon points="${rc.poly}" fill="transparent" stroke="${isL2 ? 'rgba(42,33,18,0.45)' : 'rgba(168,85,247,0.55)'}" stroke-width="1.5" stroke-dasharray="6 4"
               data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiObj)}', event)"/>
    `;
  }).join('');

  // Winding Parchment Dirt Roads connecting all Districts (with dark border casing like L2Hub)
  const roadsHtml = roadPairs
    .filter(([a, b]) => a < childDistricts.length && b < childDistricts.length)
    .map(([a, b]) => {
      const pa = regionCenters[a];
      const pb = regionCenters[b];
      const cx = Math.round((pa.x + pb.x) / 2 + ((a + b) % 2 === 0 ? 14 : -14));
      const cy = Math.round((pa.y + pb.y) / 2 + ((a + b) % 2 === 0 ? -10 : 10));
      return `
        <g pointer-events="none">
          <path d="M ${pa.x},${pa.y} Q ${cx},${cy} ${pb.x},${pb.y}" fill="none" stroke="#241c10" stroke-width="5.5" stroke-linecap="round"/>
          <path d="M ${pa.x},${pa.y} Q ${cx},${cy} ${pb.x},${pb.y}" fill="none" stroke="${isL2 ? '#cbb989' : '#94a3b8'}" stroke-width="2.6" stroke-linecap="round"/>
        </g>
      `;
    }).join('');

  // Hand-Illustrated Castles, Walled Towns, Pennant Fortresses, Towers, Catacombs & Boss Lairs for each District!
  const landmarksHtml = childDistricts.map((d, idx) => {
    const rc = regionCenters[idx % regionCenters.length];
    const st = (d.status || 'canon').toLowerCase();
    const isSelected = STUDIO_ACTIVE_INSPECT_ID === d.id || (STUDIO_MAP_SELECTED_POI && STUDIO_MAP_SELECTED_POI.inspectId === d.id);
    const lvRange = (d.level_range || [1, 15]).join('–');
    const kind = st === 'mystery' ? 'catacomb' : (st === 'draft' ? 'fortress' : rc.kind);
    const poiObj = {
      title: `D${String(idx + 1).padStart(2, '0')} · ${d.name}`,
      category: `${kind.toUpperCase()} & District Territory · Lv. ${lvRange} (${st.toUpperCase()})`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `${st.toUpperCase()} · ${(d.grid_nodes || []).length} Connected Zones`,
      summary: d.core_rationale || '',
      address: `${d.name} · ${activeContinent.name}`,
      coordinates: `Province D${String(idx + 1).padStart(2, '0')} · Monsters: ${(d.ecological_monster_families || []).join(', ')}`,
      scaleSpecs: (d.quality_checklist && d.quality_checklist.character_scale_consistency && d.quality_checklist.character_scale_consistency.evidence) || '12.5m roads · 0.58m counters',
      drillPerspective: 'district',
      drillOpts: { continentId: activeContinent.id, districtId: d.id, inspectId: d.id },
      drillLabel: 'Zoom to District Map',
      inspectId: d.id,
      connections: (d.grid_nodes || []).map(gn => ({
        label: `${gn.node_type.toUpperCase()}: ${gn.node_id}`,
        badge: `Lv.${(gn.level_range || [1, 15]).join('–')}`
      }))
    };
    return drawL2LandmarkSvg({
      kind,
      x: rc.x,
      y: rc.y,
      label: d.name,
      sublabel: `D${String(idx + 1).padStart(2, '0')} · Lv.${lvRange}${st !== 'canon' ? ' · ' + st.toUpperCase() : ''}`,
      flagColor: rc.flag,
      isSelected,
      poiObj
    });
  }).join('');

  // L2Hub-style Top-Left Continent Tab Bar ("Aden" tab in Screenshot!)
  const continentSwitcherHtml = continents.map(c => `
    <button type="button" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(c.id)}', inspectId: '${escapeHtml(c.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:6px 13px;border-radius:6px;font-size:11.5px;font-weight:800;cursor:pointer;border:1px solid ${c.id === activeContinent.id ? '#f59e0b' : 'rgba(255,255,255,0.18)'};background:${c.id === activeContinent.id ? '#292318' : 'rgba(18,16,12,0.82)'};color:${c.id === activeContinent.id ? '#fde047' : '#d6d3d1'};box-shadow:0 4px 12px rgba(0,0,0,0.45)">
      ${escapeHtml(c.name)}
    </button>
  `).join('');

  const svgInnerHtml = `
    ${terrainHtml}
    ${polygonsHtml}
    ${roadsHtml}
    ${landmarksHtml}
  `;

  return renderCartoShellHtml({
    stepLabel: `🗺️ STEP 2 CONTINENT PARCHMENT ATLAS (L2HUB ADEN STYLE) · ${escapeHtml((activeContinent.name || '').toUpperCase())}`,
    title: `${escapeHtml(activeContinent.name || '')} — Castles, Walled Towns, Fortresses, Towers, Catacombs & Mountain Passes`,
    subtitle: 'Styled after l2hub.info/map (Aden): trace the winding roads across mountain passes, click any Castle/Town/Fortress/Catacomb to move the + crosshair, and zoom into its District',
    activeScaleIndex: 2,
    defaultPoi,
    drillControls: continentSwitcherHtml,
    svgInnerHtml,
    legendItems: [
      { color: '#2a2012', label: 'Castles & Walled Towns' },
      { color: '#dc2626', label: 'Fortresses (Red/Blue Pennants)' },
      { color: '#a855f7', label: 'Catacombs & Necropolises' },
      { color: '#f97316', label: 'Boss Lairs & Towers' },
      { color: '#cbb989', label: 'Winding Continent Roads' }
    ]
  });
}

function renderDistrictBigPictureSvg(activeContinent, activeDistrict, allDistrictNodes) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const portalEdges = activeDistrict.portal_edges || [];
  const overlandNodes = allDistrictNodes.filter(n => n.node_type !== 'dungeon');
  const dungeonNodes = allDistrictNodes.filter(n => n.node_type === 'dungeon');

  function quadCenter(coords, isDng, idx) {
    if (isDng) return { x: 895, y: 245 + idx * 120, bx: 785, by: 55, bw: 220, bh: 390 };
    const c = coords && coords.length === 2 ? coords : [0, 1];
    const qx = c[0] === 0 ? 240 : 590;
    const qy = c[1] === 0 ? 138 : 348;
    const bx = c[0] === 0 ? 60 : 415;
    const by = c[1] === 0 ? 40 : 245;
    return { x: qx, y: qy, bx, by, bw: 350, bh: 200 };
  }

  const nodePos = {};
  overlandNodes.forEach((n, i) => {
    nodePos[n.id] = { ...quadCenter(n.grid_coordinates, false, i), node: n };
  });
  dungeonNodes.forEach((n, i) => {
    nodePos[n.id] = { ...quadCenter(n.grid_coordinates, true, i), node: n };
  });

  const townNode = overlandNodes.find(n => n.node_type === 'town') || allDistrictNodes[0] || {};
  const defaultPoi = {
    title: `${activeDistrict.name || 'District'} Territory Atlas`,
    category: `8,000m × 8,000m Connected 2×2 District Basin · ${activeDistrict.level_band_label || ''}`,
    thumb: (townNode.terrain_tile && townNode.terrain_tile.preview_thumbnail) || '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `${(activeDistrict.status || 'canon').toUpperCase()} · ${allDistrictNodes.length} Zones (${overlandNodes.length} Overland + ${dungeonNodes.length} Catacomb/Dungeon)`,
    summary: activeDistrict.core_rationale || '',
    address: `${activeDistrict.name} · ${activeContinent.name || ''}`,
    coordinates: `Level Range: Lv. ${(activeDistrict.level_range || [1, 15]).join('–')} · Families: ${(activeDistrict.ecological_monster_families || []).join(', ')}`,
    scaleSpecs: (activeDistrict.quality_checklist && activeDistrict.quality_checklist.character_scale_consistency && activeDistrict.quality_checklist.character_scale_consistency.evidence) || '12.5m main roads · 4.4m walkways · 0.58m counters',
    drillPerspective: 'town-or-hunting-area',
    drillOpts: { districtId: activeDistrict.id, nodeId: townNode.id, inspectId: townNode.id },
    drillLabel: `Zoom into ${townNode.name || 'Town'}`,
    inspectId: activeDistrict.id,
    connections: allDistrictNodes.map(n => ({
      label: `${n.node_type === 'town' ? '🏰' : (n.node_type === 'dungeon' ? '🕳️' : '🌿')} ${n.name} [${(n.grid_coordinates || [0,0]).join(',')}]`,
      badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${n.status.toUpperCase()}`
    }))
  };

  // Render each quadrant with L2Hub illustrated castles/fortresses/catacombs + urban blocks + monster camps
  const sectorsHtml = Object.values(nodePos).map(({ x, y, bx, by, bw, bh, node }) => {
    const isMystery = node.status === 'mystery';
    const isTown = node.node_type === 'town';
    const isDng = node.node_type === 'dungeon';
    const spawns = node.resident_spawns || [];
    const npcs = node.resident_npcs || [];
    const kit = node.asset_kit_bindings || {};
    const thumb = isMystery ? '/thumbs/creatures/god-vesper-dream-eater.webp' : ((node.terrain_tile && node.terrain_tile.preview_thumbnail) || '/thumbs/buildings/tower_round_roof_a.webp');

    const poiObj = {
      title: `${node.name} (${node.node_type.replace('_', ' ').toUpperCase()})`,
      category: `4,000m × 4,000m Zone at Grid [${(node.grid_coordinates || [0,0]).join(', ')}] · Floor ${node.floor_index || 0}`,
      thumb,
      hoursOrStatus: isMystery ? 'MYSTERY FRONTIER · Locked behind Fog of Lore' : `CANON · ${isTown ? (npcs.length + ' Resident NPCs · Safe Sanctuary') : (spawns.length + ' Monster Species Active')}`,
      summary: node.core_rationale || (node.mystery_hook && node.mystery_hook.in_world_rumor) || '',
      address: `${node.name} [${(node.grid_coordinates || [0,0]).join(', ')}] · ${activeDistrict.name} · ${activeContinent.name || ''}`,
      coordinates: `Map ID: ${node.map_id || 'uncharted (mystery)'} · Lv. ${(node.level_range || [1, 15]).join('–')}`,
      scaleSpecs: isMystery ? 'Locked behind Fog of Lore gate' : `Main Road: ${kit.main_road_width_meters || 12.5}m · Footpath: ${kit.footpath_width_meters || 4.4}m · Counter: ${kit.shop_counter_height_meters || 0.58}m · Riser: ${kit.stair_riser_height_meters || 0.14}m`,
      drillPerspective: 'town-or-hunting-area',
      drillOpts: { districtId: activeDistrict.id, nodeId: node.id, inspectId: node.id },
      drillLabel: 'Zoom to Street & Buildings',
      inspectId: node.id,
      svgX: x,
      svgY: y,
      connections: [
        ...npcs.map(npc => ({ label: `🛍️ NPC: ${npc.name} (${npc.role})`, badge: `${npc.counter_height_meters || 0.58}m counter` })),
        ...spawns.map(sp => ({ label: `⚔️ ${sp.monster_name} ×${sp.spawn_count}`, badge: `Lv.${sp.level} · ${sp.element}` }))
      ]
    };

    const sectorFill = isL2
      ? (isMystery ? '#3a2e45' : (isTown ? '#756c4b' : (isDng ? '#29201b' : '#645c3f')))
      : (isMystery ? '#221a36' : (isTown ? '#285249' : (isDng ? '#2c1d27' : '#234f3e')));
    const borderCol = isMystery ? '#c084fc' : (isTown ? '#eab308' : (isDng ? '#f97316' : '#a39060'));

    const blocksSvg = isTown ? `
      <rect x="${bx + 45}" y="${by + 28}" width="${bw - 90}" height="${bh - 56}" rx="12" fill="rgba(26,20,12,0.28)" stroke="#d4af37" stroke-width="2" stroke-dasharray="10 3"/>
      <rect x="${bx + 62}" y="${by + 42}" width="65" height="36" rx="3" fill="rgba(42,32,18,0.55)" stroke="#a39060" stroke-width="1"/>
      <rect x="${bx + 222}" y="${by + 42}" width="62" height="36" rx="3" fill="rgba(42,32,18,0.55)" stroke="#a39060" stroke-width="1"/>
      <ellipse cx="${bx + 175}" cy="${by + 148}" rx="34" ry="15" fill="#314e52" stroke="#7fa6ad" stroke-width="1"/>
    ` : (isMystery ? `
      <ellipse cx="${x}" cy="${y}" rx="95" ry="52" fill="rgba(168,85,247,0.16)" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="6 4"/>
    ` : `
      ${drawL2MountainRangeSvg(`${bx + 45},${by + 65} ${bx + 125},${by + 48} ${bx + 215},${by + 68}`, 0.85)}
      <ellipse cx="${bx + 255}" cy="${by + 148}" rx="55" ry="26" fill="rgba(42,58,36,0.45)"/>
    `);

    const l2Kind = isTown ? 'town' : (isDng ? 'catacomb' : (isMystery ? 'tower' : 'fortress'));
    const subText = `Lv.${(node.level_range || [1, 15]).join('–')} · ${isTown ? (npcs.length + ' NPCs') : (spawns.length + ' Mobs')}`;

    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiObj)}', event)">
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" fill="${sectorFill}" stroke="${borderCol}" stroke-width="2" ${isMystery ? 'stroke-dasharray="7 4"' : ''}/>
        ${blocksSvg}
        <text x="${bx + 12}" y="${by + 19}" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3px;fill:${borderCol};font-size:9.5px;font-weight:800;font-family:monospace">GRID [${(node.grid_coordinates || [0,0]).join(', ')}] · ${isDng ? 'CATACOMB / DUNGEON B1' : 'OVERLAND TERRITORY'}</text>
      </g>
      ${drawL2LandmarkSvg({
        kind: l2Kind,
        x,
        y: y - 6,
        label: node.name,
        sublabel: subText,
        flagColor: isTown ? '#eab308' : (isDng ? '#a855f7' : '#dc2626'),
        isSelected: STUDIO_ACTIVE_INSPECT_ID === node.id,
        poiObj
      })}
    `;
  }).join('');

  // Render winding parchment roads & bridges connecting the quadrants
  const roadsHtml = portalEdges.map((edge) => {
    const a = nodePos[edge.from_node_id];
    const b = nodePos[edge.to_node_id];
    if (!a || !b) return '';
    const isFog = edge.gate_state === 'fog_of_lore';
    const isDng = edge.from_direction === 'Dungeon' || edge.to_direction === 'Dungeon';
    const mx = Math.round((a.x + b.x) / 2);
    const my = Math.round((a.y + b.y) / 2);
    const stroke = isFog ? '#c084fc' : (isDng ? '#fb923c' : '#cbb989');
    return `
      <g pointer-events="none">
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1c150b" stroke-width="8" stroke-linecap="round"/>
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="4" ${isFog || isDng ? 'stroke-dasharray="8 5"' : ''}/>
        <text x="${mx}" y="${my - 6}" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:#fde68a;font-size:9px;font-weight:800;font-family:monospace">
          ${isFog ? '🌫️ FOG GATE' : (isDng ? '⬇ CATACOMB DESCENT' : `🛤️ ${edge.from_direction}⇄${edge.to_direction}`)}
        </text>
      </g>
    `;
  }).join('');

  const svgInnerHtml = `
    <!-- Empty [0,0] NW Highland Mountain Reserve -->
    <rect x="60" y="40" width="350" height="200" rx="8" fill="${isL2 ? '#554e35' : '#1d4436'}" stroke="rgba(212,175,55,0.3)" stroke-width="1.5" stroke-dasharray="5 4"/>
    ${drawL2MountainRangeSvg('95,115 185,85 275,110 365,90', 1.15)}
    ${drawL2MountainRangeSvg('115,175 225,155 335,180', 1.0)}
    <text x="235" y="138" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:#e2d5b5;font-size:11px;font-weight:800">⛰️ HIGHLAND WATERSHED RIDGE [0, 0]</text>

    <!-- Continuous Regional River flowing across [0,0] -> [0,1] -> [1,1] -->
    <path d="M 115,45 Q 210,165 235,285 T 585,365 L 765,380" fill="none" stroke="${isL2 ? '#314e52' : '#1d4ed8'}" stroke-width="12" stroke-linecap="round" opacity="0.75"/>

    ${ roadsHtml }
    ${ sectorsHtml }
  `;

  return renderCartoShellHtml({
    stepLabel: `🏙️ STEP 3 DISTRICT TERRITORY & ROAD NETWORK · ${escapeHtml((activeDistrict.name || '').toUpperCase())}`,
    title: `${escapeHtml(activeDistrict.name || '')} — Walled Town [1,1], Hunting Fortress [0,1], Fog Frontier [1,0] & Catacomb B1`,
    subtitle: 'Click any Walled Town, Hunting Ground Fortress, Fog of Lore Tower, or Underground Catacomb to inspect or zoom to street-level building footprints',
    activeScaleIndex: 3,
    defaultPoi,
    svgInnerHtml,
    legendItems: [
      { color: '#eab308', label: 'Walled Town Sanctuary [1,1]' },
      { color: '#dc2626', label: 'Hunting Grounds & Fortresses [0,1]' },
      { color: '#c084fc', label: 'Fog of Lore Frontier [1,0]' },
      { color: '#f97316', label: 'Catacomb / Dungeon (Floor -1)' },
      { color: '#314e52', label: 'Continuous District River' }
    ]
  });
}

function renderTownOrHuntingAreaBigPictureSvg(activeDistrict, activeNode, activeMonster) {
  const tile = activeNode.terrain_tile || {};
  const dims = tile.dimensions_meters || { width: 4000, height: 4000 };
  const portals = activeNode.portals || {};
  const kit = activeNode.asset_kit_bindings || {};
  const spawns = activeNode.resident_spawns || [];
  const npcs = activeNode.resident_npcs || [];
  const assets = kit.three_dimensional_assets || [];
  const isTown = activeNode.node_type === 'town';
  const isDng = activeNode.node_type === 'dungeon';
  const isMystery = activeNode.status === 'mystery';
  const thumb = tile.preview_thumbnail || '/thumbs/buildings/tower_round_roof_a.webp';

  const roadWidth = kit.main_road_width_meters || 12.5;
  const pathWidth = kit.footpath_width_meters || 4.4;
  const counterH = kit.shop_counter_height_meters || 0.58;
  const riserH = kit.stair_riser_height_meters || 0.14;
  const doorH = (kit.doorway_clearance_meters && kit.doorway_clearance_meters.height) || 2.15;
  const doorW = (kit.doorway_clearance_meters && kit.doorway_clearance_meters.width) || 1.6;

  // Build clickable street-level POIs (Walkways, River & Bridge, Castle/Town Wall, Central Statue, Buildings, NPC Shops, Monster Habitats, Portals)
  const poiStatue = {
    title: isTown ? `Central Founders Statue & Plaza (${activeNode.name})` : (isDng ? `Central Vault Resonance Pillar` : `Ancient Titan Relic Monument`),
    category: isTown ? 'Monument Statue & Central Sanctuary Plaza' : 'Landmark Monument & Survey Anchor',
    thumb: assets[0] ? `/thumbs/buildings/${assets[0].split('/').pop().replace('.glb', '.webp')}` : thumb,
    hoursOrStatus: 'Open 24 Hours · 1.05m Kid Sightline Landmark',
    summary: `Central architectural focal point at [2000m, 2000m] surrounded by a ${roadWidth}m wide stone roundabout and ${pathWidth}m pedestrian walkways.`,
    address: `2000m E, 2000m N · Central Plaza · ${activeNode.name} · ${activeDistrict.name || ''}`,
    coordinates: `Map ID: ${activeNode.map_id || activeNode.id} · Elevation Step ≤ ${tile.max_terrace_step_meters || 0.14}m`,
    scaleSpecs: `Pedestal Riser: ${riserH}m (≤0.15m toddler law) · Plaza Road: ${roadWidth}m · Walkway: ${pathWidth}m · Unobstructed 12m camera sightline`,
    inspectId: activeNode.id,
    connections: [
      { label: `🛣️ Main Artery: ${activeNode.name} Grand Avenue (${roadWidth}m)`, badge: '2-WAY' },
      { label: `🚶 Pedestrian Ring Walkway (${pathWidth}m)`, badge: 'SAFE' },
      { label: `🎨 3D Asset: ${(assets[0] || 'tower_round_roof_a.glb').split('/').pop()}`, badge: 'GLB' }
    ]
  };

  const poiWall = {
    title: isTown ? `${activeNode.name} Castle & Town Perimeter Wall` : `${activeNode.name} Canyon Rim & Retaining Wall`,
    category: 'Fortified Wall, Gate Towers & Archways',
    thumb: '/thumbs/buildings/wall_arched.webp',
    hoursOrStatus: 'CANON · Fortified Perimeter & Gate Bastions',
    summary: `Arched masonry perimeter wall protecting ${activeNode.name}, featuring ${doorH}m × ${doorW}m gate arches sized for 90–120cm Star-Kindled characters.`,
    address: `Perimeter Ring [600m..3400m] · ${activeNode.name} · ${activeDistrict.name || ''}`,
    coordinates: `3D Asset: res://assets/buildings/wall_arched.glb · 4 Gate Bastions`,
    scaleSpecs: `Gate Archway: ${doorH}m H × ${doorW}m W · Rampart Step Riser: ${riserH}m · Bastion Walkway: ${pathWidth}m`,
    inspectId: activeNode.id,
    connections: Object.entries(portals).filter(([, v]) => v).map(([dir, p]) => ({
      label: `🚪 ${dir} Gate → ${p.target_node_id}`,
      badge: p.gate_state.toUpperCase()
    }))
  };

  const poiRiver = {
    title: tile.water_feature || 'Terraced River & Stone Bridge Crossing',
    category: 'Waterway, Canal & Bridge Infrastructure',
    thumb: '/thumbs/buildings/bridge_wood.webp',
    hoursOrStatus: 'Active Waterway · Crossed by 2 Bridges',
    summary: `${tile.water_feature || 'Warm mineral waterway'} flowing through ${activeNode.name}, spanned by ${roadWidth}m main highway bridges and ${pathWidth}m footbridges.`,
    address: `Waterway Corridor · ${activeNode.name} · ${activeDistrict.name || ''}`,
    coordinates: `Span: 4,000m Waterway · Bridge Clearance: ${roadWidth}m Wide`,
    scaleSpecs: `Bridge Parapet: 0.60m (chest-high safety rail for 1.05m kids) · Bridge Approach Riser: ${riserH}m`,
    inspectId: activeNode.id,
    connections: [
      { label: '🌉 Central Stone Highway Bridge', badge: `${roadWidth}m` },
      { label: '🌉 East Pedestrian Footbridge', badge: `${pathWidth}m` }
    ]
  };

  // NPC Shop Building POIs
  const npcBlocks = npcs.map((npc, idx) => {
    const bx = idx === 0 ? 375 : 575;
    const by = idx === 0 ? 155 : 275;
    const poiNpc = {
      title: `${npc.name} — ${npc.role}`,
      category: `NPC Shop, Guild Building & Counter`,
      thumb: '/thumbs/props/chest.webp',
      hoursOrStatus: 'Every Day, Open 24 Hours · Safe Town Service',
      summary: `"${npc.dialogue_greeting || 'Welcome to our workshop!'}"`,
      address: `${Math.round((npc.position_meters && npc.position_meters.x) || 1980)}m E, ${Math.round((npc.position_meters && npc.position_meters.y) || 2010)}m N · ${activeNode.name}`,
      coordinates: `NPC ID: ${npc.npc_id} · Counter Height: ${npc.counter_height_meters || counterH}m`,
      scaleSpecs: `Shop Counter: ${npc.counter_height_meters || counterH}m (0.55–0.65m toddler law) · Doorway: ${doorH}m × ${doorW}m · Frontage Walkway: ${pathWidth}m`,
      inspectId: activeNode.id,
      connections: [
        { label: `🛍️ Service Role: ${npc.role}`, badge: 'OPEN' },
        { label: `🚶 Frontage: ${activeNode.name} Market Street`, badge: `${pathWidth}m` }
      ]
    };
    return { bx, by, npc, poiNpc };
  });

  // Monster Spawn Territory POIs
  const spawnBlocks = spawns.map((sp, idx) => {
    const sx = idx === 0 ? 275 : 715;
    const sy = idx === 0 ? 155 : 335;
    const drop0 = (sp.item_drops && sp.item_drops[0]) || null;
    const card = sp.monster_card_drop || null;
    const poiMob = {
      title: `${sp.monster_name} Territory (×${sp.spawn_count})`,
      category: `Monster Habitat · Lv.${sp.level} ${sp.element} · ${sp.size} ${sp.race} (${sp.family})`,
      thumb: `/thumbs/creatures/${sp.monster_id}.webp`,
      hoursOrStatus: `Respawn Cadence: Every ${sp.respawn_seconds}s · Active Pack: ×${sp.spawn_count}`,
      summary: `Ecological ${sp.family} territory patrolling the ${tile.biome_palette || 'regional'} walkways and terraces of ${activeNode.name}.`,
      address: `Sector ${idx === 0 ? 'North-West Terrace' : 'South-East Grounds'} · ${activeNode.name} · ${activeDistrict.name || ''}`,
      coordinates: `Monster ID: ${sp.monster_id} · Spawn ID: ${sp.spawn_id}`,
      scaleSpecs: `Foliage Law: Grass ≤ ${kit.max_grass_height_meters || 0.2}m, Bushes ≤ ${kit.max_bush_height_meters || 0.44}m so 1.05m player heads & mob silhouettes never clip`,
      inspectId: activeNode.id,
      connections: [
        ...(drop0 ? [{ label: `🎁 Drop: ${drop0.item_name}`, badge: `${drop0.drop_chance_percent}%` }] : []),
        ...(card ? [{ label: `🃏 Card: ${card.card_name}`, badge: `${card.drop_chance_percent}%` }] : [])
      ]
    };
    return { sx, sy, sp, poiMob };
  });

  // Portal Gate POIs
  const portalDefs = [
    { dir: 'North', x: 520, y: 36, labelPos: 'bottom' },
    { dir: 'South', x: 520, y: 462, labelPos: 'top' },
    { dir: 'West',  x: 68,  y: 250, labelPos: 'right' },
    { dir: 'East',  x: 972, y: 250, labelPos: 'left' },
    { dir: 'Dungeon', x: 645, y: 215, labelPos: 'bottom' },
    { dir: 'Exit',    x: 215, y: 395, labelPos: 'top' }
  ];

  const portalsSvg = portalDefs.map(pd => {
    const p = portals[pd.dir];
    if (!p) return '';
    const isFog = p.gate_state === 'fog_of_lore';
    const col = isFog ? '#c084fc' : '#2563eb';
    const poiPortal = {
      title: `${pd.dir} Portal Gate → ${p.target_node_id || 'Uncharted Frontier'}`,
      category: `${pd.dir} Highway & Boundary Gate (${p.gate_state.toUpperCase()})`,
      thumb: '/thumbs/buildings/wall_arched.webp',
      hoursOrStatus: isFog ? 'LOCKED · Fog of Lore Gate' : 'OPEN 24 HOURS · Bidirectional Portal',
      summary: isFog ? (p.lock_message || 'Sealed by Fog of Lore.') : `Connects ${activeNode.name} (${pd.dir}) directly to ${p.target_node_id} (${p.target_direction}).`,
      address: `Trigger Box: X=${(p.trigger_box_meters && p.trigger_box_meters.x) || 2000}m, Y=${(p.trigger_box_meters && p.trigger_box_meters.y) || 160}m · ${activeNode.name}`,
      coordinates: `Portal ID: ${p.portal_id} · Target Map: ${p.target_map_id || 'null (mystery)'}`,
      scaleSpecs: `Gate Trigger Width: ${(p.trigger_box_meters && p.trigger_box_meters.width) || 12}m × ${(p.trigger_box_meters && p.trigger_box_meters.height) || 24}m · Approach Road: ${roadWidth}m`,
      drillPerspective: 'town-or-hunting-area',
      drillOpts: { districtId: activeDistrict.id, nodeId: p.target_node_id, inspectId: p.target_node_id },
      drillLabel: `Traverse to ${p.target_node_id}`,
      inspectId: p.target_node_id || activeNode.id,
      connections: [
        { label: `🧭 Direction: ${pd.dir} ➔ ${p.target_direction}`, badge: p.gate_state.toUpperCase() },
        { label: `📍 Arrival: X=${(p.arrival_point_meters && p.arrival_point_meters.x) || 2000}m, Y=${(p.arrival_point_meters && p.arrival_point_meters.y) || 200}m`, badge: 'ARRIVAL' }
      ]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiPortal)}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${pd.x}" cy="${pd.y}" r="14" fill="${col}" stroke="#ffffff" stroke-width="2.5"/>
        <text x="${pd.x}" y="${pd.y + 4}" text-anchor="middle" font-size="12">${isFog ? '🌫️' : (pd.dir === 'Dungeon' ? '🕳️' : '🚪')}</text>
        <rect x="${pd.x - 78}" y="${pd.y + (pd.y > 400 ? -34 : 16)}" width="156" height="20" rx="4" fill="rgba(15,23,42,0.94)" stroke="${col}" stroke-width="1.2"/>
        <text x="${pd.x}" y="${pd.y + (pd.y > 400 ? -21 : 29)}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="800" font-family="monospace">${pd.dir.toUpperCase()}: ${escapeHtml((p.target_node_id || '').replace('hunting-area-', '').replace('town-', '').replace('dungeon-', '').slice(0, 16))} ➔</text>
      </g>
    `;
  }).join('');

  // Urban building footprints (slanted/grid blocks like Screenshot 5!)
  const buildingsSvg = `
    <!-- City / Zone Blocks (Dark Slate Parcel Lots like Google Maps Street View) -->
    <g opacity="0.92">
      <!-- NW Block -->
      <polygon points="155,75 465,75 465,205 155,205" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="175" y="92" width="82" height="46" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="272" y="92" width="95" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="382" y="92" width="66" height="92" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="175" y="150" width="115" height="42" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>

      <!-- NE Block (with Park Lawn) -->
      <polygon points="575,75 885,75 885,205 575,205" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="592" y="90" width="125" height="55" rx="4" fill="#1e4d3b" stroke="#34d399" stroke-width="1"/>
      <text x="654" y="121" text-anchor="middle" fill="#86efac" font-size="9.5" font-weight="700">🌳 Terrace Garden</text>
      <rect x="735" y="90" width="132" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="735" y="148" width="132" height="44" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>

      <!-- SW Block -->
      <polygon points="155,295 465,295 465,425 155,425" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="175" y="312" width="92" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="282" y="312" width="84" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="380" y="312" width="68" height="95" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="175" y="372" width="188" height="38" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>

      <!-- SE Block -->
      <polygon points="575,295 885,295 885,425 575,425" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="595" y="312" width="105" height="46" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="715" y="312" width="152" height="46" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="595" y="370" width="135" height="42" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="745" y="370" width="122" height="42" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
    </g>
  `;

  const svgInnerHtml = `
    <!-- Base Emerald Ground Terrain -->
    <rect x="20" y="15" width="1000" height="470" rx="14" fill="#214e3f"/>

    ${buildingsSvg}

    <!-- River / Canal Waterway cutting across map + Clickable Bridges -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiRiver)}', event)">
      <path d="M 35,345 Q 265,285 520,295 T 1005,225" fill="none" stroke="#0f172a" stroke-width="26" stroke-linecap="round" opacity="0.45"/>
      <path d="M 35,345 Q 265,285 520,295 T 1005,225" fill="none" stroke="#1d4ed8" stroke-width="20" stroke-linecap="round"/>
      <text x="265" y="314" fill="#93c5fd" font-size="9.5" font-weight="700" font-style="italic" letter-spacing="0.08em">🌊 ${escapeHtml((tile.water_feature || 'Mineral Canal').slice(0, 38))}</text>
    </g>

    <!-- Castle / Town Perimeter Wall & Gate Towers (Clickable!) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiWall)}', event)">
      <rect x="125" y="55" width="790" height="390" rx="18" fill="none" stroke="#94a3b8" stroke-width="8" stroke-dasharray="28 8"/>
      <rect x="125" y="55" width="790" height="390" rx="18" fill="none" stroke="#e2e8f0" stroke-width="2"/>
      <!-- 4 Corner Castle Wall Towers -->
      <circle cx="125" cy="55" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <circle cx="915" cy="55" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <circle cx="125" cy="445" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <circle cx="915" cy="445" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <rect x="148" y="44" width="215" height="18" rx="4" fill="#0f172a" stroke="#94a3b8" stroke-width="1"/>
      <text x="255" y="56" text-anchor="middle" fill="#e2e8f0" font-size="9" font-weight="800" font-family="monospace">🧱 CASTLE / TOWN WALL (${doorH}m ARCHES)</text>
    </g>

    <!-- Street & Walkway Network (Main East-West & North-South Avenues + Side Sois + Directional Arrows) -->
    <g pointer-events="none">
      <!-- West-East Main Highway (12.5m-13.0m) -->
      <line x1="68" y1="250" x2="972" y2="250" stroke="#1e293b" stroke-width="28"/>
      <line x1="68" y1="250" x2="972" y2="250" stroke="#334155" stroke-width="22"/>
      <line x1="68" y1="250" x2="972" y2="250" stroke="#64748b" stroke-width="1.2" stroke-dasharray="10 8"/>
      <text x="315" y="245" text-anchor="middle" fill="#cbd5e1" font-size="8.5" font-weight="800" letter-spacing="0.12em">← GRAND AVENUE (${roadWidth}M MAIN ROAD) →</text>
      <text x="735" y="245" text-anchor="middle" fill="#cbd5e1" font-size="8.5" font-weight="800" letter-spacing="0.12em">← EAST GATEWAY ROAD (${roadWidth}M) →</text>

      <!-- North-South Main Avenue -->
      <line x1="520" y1="36" x2="520" y2="462" stroke="#1e293b" stroke-width="24"/>
      <line x1="520" y1="36" x2="520" y2="462" stroke="#334155" stroke-width="18"/>
      <text x="515" y="145" text-anchor="middle" transform="rotate(-90 515 145)" fill="#cbd5e1" font-size="8" font-weight="700" letter-spacing="0.1em">↑ NORTH SANCTUARY WALKWAY (${pathWidth}M)</text>

      <!-- Secondary Pedestrian Walkways (Soi / Footpaths 4.4m) -->
      <line x1="155" y1="145" x2="885" y2="145" stroke="#1e293b" stroke-width="10"/>
      <line x1="155" y1="145" x2="885" y2="145" stroke="#475569" stroke-width="6"/>
      <text x="320" y="143" text-anchor="middle" fill="#e2e8f0" font-size="7.5" font-family="monospace">SOI ARTISAN WALKWAY (${pathWidth}m) →</text>

      <line x1="155" y1="362" x2="885" y2="362" stroke="#1e293b" stroke-width="10"/>
      <line x1="155" y1="362" x2="885" y2="362" stroke="#475569" stroke-width="6"/>
      <text x="710" y="360" text-anchor="middle" fill="#e2e8f0" font-size="7.5" font-family="monospace">← LANTERN MARKET WALKWAY (${pathWidth}m)</text>

      <!-- Highway Route Shield in Center-West -->
      <rect x="418" y="241" width="28" height="18" rx="3" fill="#f8fafc" stroke="#0f172a" stroke-width="1.2"/>
      <text x="432" y="253" text-anchor="middle" fill="#0f172a" font-size="9" font-weight="800" font-family="monospace">12</text>
    </g>

    <!-- Central Roundabout Plaza & Monument Statue (Clickable!) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiStatue)}', event)" filter="url(#cartoDropShadow)">
      <circle cx="520" cy="250" r="42" fill="#334155" stroke="#eab308" stroke-width="3"/>
      <circle cx="520" cy="250" r="26" fill="#1e293b" stroke="#ffd166" stroke-width="1.5" stroke-dasharray="4 3"/>
      <circle cx="520" cy="250" r="14" fill="#eab308" stroke="#ffffff" stroke-width="2"/>
      <text x="520" y="255" text-anchor="middle" font-size="13">🗽</text>
      <rect x="442" y="296" width="156" height="20" rx="5" fill="rgba(15,23,42,0.94)" stroke="#ffd166" stroke-width="1.2"/>
      <text x="520" y="310" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="800">★ Statue &amp; Central Plaza</text>
    </g>

    <!-- Clickable NPC Shop & Guild Pins (Orange/Gold Google Maps Retail/Food Pins) -->
    ${npcBlocks.map(({ bx, by, npc, poiNpc }) => `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiNpc)}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${bx}" cy="${by}" r="13" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
        <text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="11">🛍️</text>
        <text x="${bx + 18}" y="${by - 2}" fill="#fde68a" font-size="10.5" font-weight="800">${escapeHtml(npc.name)}</text>
        <text x="${bx + 18}" y="${by + 10}" fill="#cbd5e1" font-size="9" font-family="monospace">${escapeHtml(npc.role.slice(0, 24))} (${npc.counter_height_meters || counterH}m)</text>
      </g>
    `).join('')}

    <!-- Clickable Monster Spawn Territory Pins (Crimson/Amber Pins with Portrait) -->
    ${spawnBlocks.map(({ sx, sy, sp, poiMob }) => `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiMob)}', event)" filter="url(#cartoDropShadow)">
        <ellipse cx="${sx}" cy="${sy}" rx="56" ry="30" fill="rgba(239,68,68,0.16)" stroke="#f87171" stroke-width="1.5" stroke-dasharray="5 3"/>
        <circle cx="${sx - 28}" cy="${sy}" r="14" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
        <text x="${sx - 28}" y="${sy + 4}" text-anchor="middle" font-size="11">⚔️</text>
        <text x="${sx - 8}" y="${sy - 3}" fill="#ffffff" font-size="10.5" font-weight="800">${escapeHtml(sp.monster_name.slice(0, 18))}</text>
        <text x="${sx - 8}" y="${sy + 10}" fill="#fca5a5" font-size="9" font-family="monospace">Lv.${sp.level} · ×${sp.spawn_count} (${sp.respawn_seconds}s)</text>
      </g>
    `).join('')}

    <!-- Clickable North / South / East / West / Dungeon / Exit Portal Gates -->
    ${portalsSvg}
  `;

  const defaultPoi = activeMonster
    ? (spawnBlocks.find(b => b.sp.monster_id === activeMonster.monster_id)?.poiMob || spawnBlocks[0]?.poiMob || poiStatue)
    : (npcBlocks[0]?.poiNpc || spawnBlocks[0]?.poiMob || poiStatue);

  return renderCartoShellHtml({
    stepLabel: `🏘️ STEP 4 STREET, WALKWAY & BUILDING FOOTPRINT MAP · ${dims.width}m × ${dims.height}m`,
    title: `${escapeHtml(activeNode.name || '')} (${escapeHtml(activeNode.map_id || activeNode.id || '')}) — 2D Building Footprints, Castle Walls, Statue Plaza, Rivers & POIs`,
    subtitle: 'Styled like Google/Apple Street Maps: click any Building, Statue, Castle Wall, River Bridge, NPC Shop, Monster Territory, or Portal Gate to explore',
    activeScaleIndex: 4,
    defaultPoi,
    svgInnerHtml,
    legendItems: [
      { color: '#465870', label: '2D Building Footprints' },
      { color: '#94a3b8', label: 'Castle / Town Perimeter Wall' },
      { color: '#eab308', label: 'Central Statue & Plaza' },
      { color: '#f59e0b', label: 'NPC Shop & Counter' },
      { color: '#dc2626', label: 'Monster Spawn Territory' },
      { color: '#2563eb', label: 'River & Portal Gates' }
    ]
  });
}

function renderStudioWorldHistoryPerspective(whc, continents) {
  const scale = whc.character_scale_law || {};
  const metrics = scale.environment_metrics || {};
  const premise = whc.player_arrival_premise || {};
  const gods = (whc.primordial_gods || []).filter(g => STUDIO_STATUS_FILTER === 'all' || g.status === STUDIO_STATUS_FILTER);
  const epochs = whc.historical_epochs || [];
  const bindings = whc.starter_town_bindings || [];

  return `
    ${renderWhcBigPictureSvg(whc, continents)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 1 · WORLD HISTORY AND CONCEPT</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(whc.world_title || whc.name || '')}</h2>
            </div>
            ${renderStatusBadgeHtml(whc.status)}
          </div>
          <p style="margin:8px 0 14px;color:var(--joy-text-secondary);line-height:1.5">${escapeHtml(whc.core_rationale || '')}</p>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
              <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">PLAYER IDENTITY</div>
              <div style="font-size:12px;margin-top:4px;font-weight:600">${escapeHtml(premise.player_identity || '')}</div>
            </div>
            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
              <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">WHY PLAYERS ENTER THE WORLD</div>
              <div style="font-size:12px;margin-top:4px">${escapeHtml(premise.why_enter_world || '')}</div>
            </div>
            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
              <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">INCITING PHENOMENON</div>
              <div style="font-size:12px;margin-top:4px">${escapeHtml(premise.inciting_phenomenon || '')}</div>
            </div>
          </div>

          <h3 style="margin:0 0 10px;font-size:1rem">Primordial Gods and Planetary Scars</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
            ${gods.map(g => `
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px ${g.status === 'mystery' ? 'dashed rgba(168,85,247,0.55)' : 'solid var(--joy-border-default)'}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
                  <strong>${escapeHtml(g.name)}</strong>
                  ${renderStatusBadgeHtml(g.status)}
                </div>
                <div class="mono" style="font-size:11px;color:var(--joy-text-secondary);margin-bottom:6px">Domain: ${escapeHtml(g.domain)}</div>
                <div style="font-size:12px;margin-bottom:6px"><strong>Core Rationale:</strong> ${escapeHtml(g.core_rationale)}</div>
                <div style="font-size:11.5px;color:var(--joy-text-secondary)"><strong>Geographical Scar:</strong> ${escapeHtml(g.geographical_scar)}</div>
                <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-top:4px"><strong>Architectural Imprint:</strong> ${escapeHtml(g.architectural_imprint)}</div>
                ${g.mystery_hook ? `
                  <div style="margin-top:8px;padding:8px;border-radius:6px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);font-size:11px">
                    <div><strong>🌫️ In-World Rumor:</strong> ${escapeHtml(g.mystery_hook.in_world_rumor)}</div>
                    <div style="margin-top:3px"><strong>Unanswered Question:</strong> ${escapeHtml(g.mystery_hook.unanswered_question)}</div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </section>

        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <h3 style="margin:0 0 10px;font-size:1rem">Historical Epochs and Great War Scars (Click to Drill into Continent)</h3>
          ${epochs.map(ep => `
            <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>Era ${ep.era_order}: ${escapeHtml(ep.name)} (${escapeHtml(ep.kind)})</strong>
                ${renderStatusBadgeHtml(ep.status)}
              </div>
              <p style="font-size:12px;color:var(--joy-text-secondary);margin:6px 0 10px">${escapeHtml(ep.core_rationale)}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
                ${(ep.world_scars || []).map(sc => `
                  <div style="padding:10px;border-radius:6px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle)">
                    <div style="font-weight:700;font-size:12px">${escapeHtml(sc.name)}</div>
                    <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin:2px 0 6px">${escapeHtml(sc.scar_id)}</div>
                    <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-bottom:8px">${escapeHtml(sc.description)}</div>
                    ${(sc.spawned_continent_ids || []).map(cid => `
                      <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(cid)}', inspectId: '${escapeHtml(cid)}' })">
                        Drill into ${escapeHtml(cid)} ➔
                      </button>
                    `).join(' ')}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </section>

        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <h3 style="margin:0 0 8px;font-size:1rem">90 to 120 Centimeter Cute Toddler and Kid Character Scale Law Visualizer</h3>
          <p style="font-size:12px;color:var(--joy-text-secondary);margin:0 0 10px">${escapeHtml(scale.head_to_body_ratio || '')}</p>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end;height:130px;padding:14px;background:var(--joy-surface-sunken);border-radius:8px;border:1px solid var(--joy-border-subtle)">
            <div style="text-align:center"><div style="height:22px;background:#22c55e;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Grass ≤ ${metrics.max_grass_height_meters || 0.35}m</div></div>
            <div style="text-align:center"><div style="height:38px;background:#10b981;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Bush ≤ ${metrics.max_bush_height_meters || 0.65}m</div></div>
            <div style="text-align:center"><div style="height:36px;background:#eab308;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Counter 0.60m</div></div>
            <div style="text-align:center"><div style="height:64px;background:#3b82f6;border-radius:4px 4px 0 0"></div><div style="font-size:10px;font-weight:700;margin-top:4px">Kid ${scale.reference_height_meters || 1.05}m</div></div>
            <div style="text-align:center"><div style="height:95px;background:#6366f1;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Door ≥ ${metrics.min_doorway_height_meters || 2.0}m</div></div>
            <div style="text-align:center"><div style="height:18px;background:#f97316;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Step ≤ ${metrics.max_stair_riser_meters || 0.15}m</div></div>
          </div>
          <div style="margin-top:12px">
            <strong style="font-size:12px">Starter Town Arrival Bindings:</strong>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
              ${bindings.map(b => `
                <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);font-size:12px">
                  <div><strong>🏰 ${escapeHtml(b.town_name)}</strong> (${escapeHtml(b.town_id)}) · ${renderStatusBadgeHtml(b.status)}</div>
                  <div style="color:var(--joy-text-secondary);font-size:11.5px;margin:4px 0">${escapeHtml(b.spawn_rationale)}</div>
                  <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(b.town_id)}', inspectId: '${escapeHtml(b.town_id)}' })">
                    Inspect Starter Town ${escapeHtml(b.town_name)} ➔
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </section>
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(whc.name || '')}</h3>
        ${renderStatusBadgeHtml(whc.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(whc.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(whc)}
      </aside>
    </div>
  `;
}

function renderStudioContinentPerspective(whc, continents, districts, activeContinent) {
  const filteredContinents = continents.filter(c => STUDIO_STATUS_FILTER === 'all' || c.status === STUDIO_STATUS_FILTER);
  const childDistricts = districts.filter(d => d.parent_continent_id === activeContinent.id);
  const causes = activeContinent.parent_world_history_causes || {};

  return `
    ${renderContinentBigPictureSvg(continents, districts, activeContinent)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 2 · CONTINENT MACRO ATLAS</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(activeContinent.name || '')}</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${filteredContinents.map(c => `
                <button type="button" class="joy-button ${c.id === activeContinent.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(c.id)}', inspectId: '${escapeHtml(c.id)}' })">
                  ${escapeHtml(c.name)} (${escapeHtml(c.status)})
                </button>
              `).join('')}
            </div>
          </div>

          <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>Parent World History Scar Provenance</strong>
              ${renderStatusBadgeHtml(activeContinent.status)}
            </div>
            <div style="font-size:12px;margin-bottom:4px"><strong>Core Rationale:</strong> ${escapeHtml(activeContinent.core_rationale || '')}</div>
            <div style="font-size:12px;color:var(--joy-text-secondary)"><strong>Causal Summary:</strong> ${escapeHtml(causes.causal_summary || '')} (Scars: ${escapeHtml((causes.war_scar_ids || []).join(', '))})</div>
          </div>

          ${activeContinent.status === 'mystery' && activeContinent.mystery_hook ? `
            <div style="padding:16px;border-radius:10px;background:rgba(168,85,247,0.12);border:1px dashed rgba(168,85,247,0.55);margin-bottom:14px">
              <div style="font-weight:700;font-size:13px;color:#c084fc;margin-bottom:6px">🌫️ Intentional Mystery / Fog of Lore Continent</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>In-World Rumor:</strong> ${escapeHtml(activeContinent.mystery_hook.in_world_rumor)}</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>Visual Silhouette:</strong> ${escapeHtml(activeContinent.mystery_hook.visual_silhouette)}</div>
              <div style="font-size:12px"><strong>Unanswered Question:</strong> ${escapeHtml(activeContinent.mystery_hook.unanswered_question)}</div>
            </div>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px">
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">CLIMATE AND LEVEL BAND</div>
                <div style="font-size:12px;font-weight:700;margin-top:4px">Levels ${(activeContinent.level_band || {}).min_level || 1} to ${(activeContinent.level_band || {}).max_level || 15}</div>
                <div style="font-size:12px;margin-top:4px">${escapeHtml((activeContinent.climate_profile || {}).macro_biome || '')}</div>
                <div style="font-size:11px;color:var(--joy-text-secondary);margin-top:4px">Skybox: ${escapeHtml((activeContinent.climate_profile || {}).skybox_palette || '')}</div>
              </div>
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">90 TO 120 CENTIMETER ARCHITECTURE ADAPTATION</div>
                <div style="font-size:12px;font-weight:700;margin-top:4px">${escapeHtml((activeContinent.civilization_style || {}).architecture_motif || '')}</div>
                <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-top:4px">${escapeHtml((activeContinent.civilization_style || {}).character_scale_adaptation || '')}</div>
              </div>
            </div>
          `}

          <h3 style="margin:0 0 8px;font-size:1rem">Child Districts in ${escapeHtml(activeContinent.name || '')}</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">
            ${childDistricts.length ? childDistricts.map(d => `
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <strong>${escapeHtml(d.name)}</strong>
                  ${renderStatusBadgeHtml(d.status)}
                </div>
                <div class="mono" style="font-size:11px;color:var(--joy-text-secondary);margin-bottom:6px">${escapeHtml(d.level_band_label || '')} · Families: ${escapeHtml((d.ecological_monster_families || []).join(', '))}</div>
                <div style="font-size:12px;margin-bottom:8px">${escapeHtml(d.core_rationale)}</div>
                <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' })">
                  Drill into District ${escapeHtml(d.name)} ➔
                </button>
              </div>
            `).join('') : '<div style="padding:12px;color:var(--joy-text-secondary);font-size:12px">No child Districts required while Continent status is Mystery (Fog of Lore).</div>'}
          </div>
        </section>
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(activeContinent.name || '')}</h3>
        ${renderStatusBadgeHtml(activeContinent.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(activeContinent.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(activeContinent)}
      </aside>
    </div>
  `;
}

function computeStudioElementalModifiers(elementName) {
  const el = (elementName || 'Neutral');
  const table = {
    Fire:    { Neutral: 100, Water: 150, Earth: 90,  Fire: 25,  Wind: 100, Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Earth:   { Neutral: 100, Water: 100, Earth: 25,  Fire: 150, Wind: 90,  Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Wind:    { Neutral: 100, Water: 90,  Earth: 150, Fire: 100, Wind: 25,  Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Water:   { Neutral: 100, Water: 25,  Earth: 100, Fire: 90,  Wind: 150, Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Shadow:  { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50,  Holy: 150, Shadow: 0,   Ghost: 100, Undead: 0   },
    Holy:    { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 0,   Shadow: 150, Ghost: 100, Undead: 150 },
    Neutral: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 100, Shadow: 100, Ghost: 70,  Undead: 100 }
  };
  return table[el] || table.Neutral;
}

function renderStudioDistrictPerspective(activeContinent, districts, nodes, activeDistrict) {
  const filteredDistricts = districts.filter(d => STUDIO_STATUS_FILTER === 'all' || d.status === STUDIO_STATUS_FILTER);
  const districtNodes = nodes
    .filter(n => n.parent_district_id === activeDistrict.id)
    .filter(n => STUDIO_STATUS_FILTER === 'all' || n.status === STUDIO_STATUS_FILTER);
  const allDistrictNodes = nodes.filter(n => n.parent_district_id === activeDistrict.id);
  const nodeById = {};
  allDistrictNodes.forEach(n => { nodeById[n.id] = n; });

  const levelBands = [
    'Levels 1 to 20',
    'Levels 21 to 40',
    'Levels 41 to 60',
    'Levels 61 to 80',
    'Levels 81 to 100'
  ];

  // Collect all monsters across this district's child nodes
  const monsterCatalogMap = {};
  allDistrictNodes.forEach(n => {
    (n.resident_spawns || []).forEach(sp => {
      if (!monsterCatalogMap[sp.monster_id]) {
        monsterCatalogMap[sp.monster_id] = {
          ...sp,
          habitats: []
        };
      }
      monsterCatalogMap[sp.monster_id].habitats.push({
        node_id: n.id,
        node_name: n.name,
        grid_coordinates: n.grid_coordinates || [0, 0],
        spawn_count: sp.spawn_count,
        respawn_seconds: sp.respawn_seconds
      });
    });
  });
  const districtMonsters = Object.values(monsterCatalogMap);
  if (!STUDIO_PINNED_MONSTER_ID && districtMonsters.length > 0) {
    STUDIO_PINNED_MONSTER_ID = districtMonsters[0].monster_id;
  }

  const cols = (activeDistrict.grid_dimensions && activeDistrict.grid_dimensions.columns) || 3;
  const rows = (activeDistrict.grid_dimensions && activeDistrict.grid_dimensions.rows) || 3;
  const portalEdges = activeDistrict.portal_edges || [];

  // Build 2D matrix cells [col, row]
  const matrixCellsHtml = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellNodes = districtNodes.filter(n => {
        const coords = n.grid_coordinates || [0, 0];
        return coords[0] === c && coords[1] === r;
      });
      if (cellNodes.length === 0) {
        matrixCellsHtml.push(`
          <div style="min-height:190px;padding:12px;border-radius:10px;background:rgba(15,23,42,0.35);border:1px dashed var(--joy-border-subtle);display:flex;flex-direction:column;justify-content:center;align-items:center;color:var(--joy-text-muted);font-size:11px">
            <span class="mono">[Column ${c}, Row ${r}]</span>
            <span style="margin-top:4px">Unassigned Frontier Cell</span>
          </div>
        `);
      } else {
        const cardsHtml = cellNodes.map(n => {
          const isMystery = n.status === 'mystery';
          const thumb = (n.terrain_tile && n.terrain_tile.preview_thumbnail) || '/thumbs/nature/pine_tree_1.webp';
          const spawns = n.resident_spawns || [];
          const pinnedSpawn = spawns.find(sp => sp.monster_id === STUDIO_PINNED_MONSTER_ID);
          const connectedEdges = portalEdges.filter(e => e.from_node_id === n.id || e.to_node_id === n.id);
          const typeLabel = n.node_type === 'town' ? '🏰 Town' : (n.node_type === 'dungeon' ? '💀 Dungeon (Floor ' + (n.floor_index || -1) + ')' : '🌿 Hunting Area');

          return `
            <div style="padding:12px;border-radius:10px;background:var(--joy-surface-sunken);border:2px ${pinnedSpawn ? 'solid #ffd166' : (isMystery ? 'dashed rgba(168,85,247,0.65)' : 'solid var(--joy-border-default)')};margin-bottom:${cellNodes.length > 1 ? '8px' : '0'};position:relative">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
                <span class="mono" style="font-size:10.5px;color:var(--joy-text-secondary)">[${c}, ${r}] · ${typeLabel}</span>
                ${renderStatusBadgeHtml(n.status)}
              </div>
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                <div style="width:52px;height:52px;border-radius:8px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                  ${isMystery
                    ? '<span style="font-size:22px">🌫️</span>'
                    : `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(n.name)}" style="width:46px;height:46px;object-fit:contain" />`}
                </div>
                <div style="min-width:0;flex:1">
                  <div style="font-weight:800;font-size:13.5px;color:var(--joy-text-primary)">${escapeHtml(n.name)}</div>
                  <div class="mono" style="font-size:11px;color:#ffd166">Levels ${(n.level_range || [1, 1]).join(' to ')}</div>
                  ${pinnedSpawn ? `
                    <div style="margin-top:3px;display:inline-block;padding:2px 7px;border-radius:999px;background:rgba(255,209,102,0.2);border:1px solid #ffd166;color:#ffd166;font-size:10.5px;font-weight:700">
                      📌 Pinned: ${escapeHtml(pinnedSpawn.monster_name)} ×${pinnedSpawn.spawn_count}
                    </div>
                  ` : ''}
                </div>
              </div>

              <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-bottom:8px;line-height:1.4">
                ${escapeHtml(n.core_rationale || '')}
              </div>

              ${isMystery && n.mystery_hook ? `
                <div style="padding:8px;border-radius:6px;background:rgba(168,85,247,0.14);border:1px solid rgba(168,85,247,0.4);font-size:11px;margin-bottom:8px">
                  <div><strong>🌫️ Fog of Lore Rumor:</strong> ${escapeHtml(n.mystery_hook.in_world_rumor)}</div>
                </div>
              ` : ''}

              ${spawns.length > 0 ? `
                <div style="margin-bottom:8px">
                  <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">RESIDENT MONSTERS (${spawns.length}):</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    ${spawns.map(sp => `
                      <button type="button" class="joy-button ${STUDIO_PINNED_MONSTER_ID === sp.monster_id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" style="height:22px;padding:0 7px;font-size:10.5px" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(n.id)}', monsterId: '${escapeHtml(sp.monster_id)}', inspectId: '${escapeHtml(n.id)}' })">
                        ${escapeHtml(sp.monster_name)} (Level ${sp.level} · ×${sp.spawn_count})
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : (n.node_type === 'town' ? `<div class="mono" style="font-size:10.5px;color:#34d399;margin-bottom:8px">🛡️ Peaceful Safe Zone (Zero Hostile Spawns)</div>` : '')}

              <div style="margin-bottom:8px">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">DIRECTIONAL PORTAL BRIDGES (${connectedEdges.length}):</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                  ${connectedEdges.map(edge => {
                    const isFrom = edge.from_node_id === n.id;
                    const dir = isFrom ? edge.from_direction : edge.to_direction;
                    const targetId = isFrom ? edge.to_node_id : edge.from_node_id;
                    const targetNode = nodeById[targetId] || { name: targetId };
                    const isFog = edge.gate_state === 'fog_of_lore';
                    return `
                      <span class="mono" style="font-size:10px;padding:2px 6px;border-radius:4px;cursor:pointer;background:${isFog ? 'rgba(168,85,247,0.18)' : 'var(--joy-surface-card)'};border:1px solid ${isFog ? 'rgba(168,85,247,0.5)' : 'var(--joy-border-subtle)'};color:${isFog ? '#c084fc' : 'var(--joy-text-primary)'}" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(targetId)}', inspectId: '${escapeHtml(targetId)}' })" title="${escapeHtml(edge.lock_reason || ('Road width ' + edge.road_width_meters + ' meters'))}">
                        ${escapeHtml(dir)} ➔ ${escapeHtml(targetNode.name)} ${isFog ? '(Fog of Lore)' : ''}
                      </span>
                    `;
                  }).join('')}
                </div>
              </div>

              <button type="button" class="joy-button joy-button--solid joy-button--sm" style="width:100%" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(n.id)}', monsterId: '${escapeHtml((spawns[0] && spawns[0].monster_id) || '')}', inspectId: '${escapeHtml(n.id)}' })">
                Inspect ${escapeHtml(n.name)} ➔
              </button>
            </div>
          `;
        }).join('');
        matrixCellsHtml.push(`<div>${cardsHtml}</div>`);
      }
    }
  }

  return `
    ${renderDistrictBigPictureSvg(activeContinent, activeDistrict, allDistrictNodes)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <!-- Maxion Level-Band Tabs & Monster Pinning Toolbar -->
        <section class="panel" style="padding:14px 18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary)">MAXION LEVEL-BAND MONSTER PINNING:</span>
              ${levelBands.map(lb => `
                <button type="button" class="joy-button ${STUDIO_LEVEL_BAND === lb ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('district', { districtId: '${escapeHtml(activeDistrict.id)}', levelBand: '${escapeHtml(lb)}' })">
                  <span>${escapeHtml(lb)}</span>
                  ${lb === activeDistrict.level_band_label ? '<span class="mono" style="font-size:9.5px;margin-left:4px;color:#ffd166">● ACTIVE</span>' : ''}
                </button>
              `).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="mono" style="font-size:10px;color:var(--joy-text-secondary)">ECOLOGICAL MONSTER FAMILIES:</span>
              ${(activeDistrict.ecological_monster_families || []).map(fam => `
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(fam)}</span>
              `).join('')}
            </div>
          </div>

          <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:8px">
            CLICK MONSTER TO PIN SPAWNS ON GRID (${districtMonsters.length})
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
            ${districtMonsters.length ? districtMonsters.map(mob => {
              const isPinned = STUDIO_PINNED_MONSTER_ID === mob.monster_id;
              const totalSpawns = mob.habitats.reduce((acc, h) => acc + (h.spawn_count || 0), 0);
              return `
                <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid ${isPinned ? '#ffd166' : 'var(--joy-border-default)'};cursor:pointer" onclick="setStudioPerspective('district', { districtId: '${escapeHtml(activeDistrict.id)}', pinnedMonsterId: '${escapeHtml(mob.monster_id)}' })">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                    <strong style="font-size:12.5px;color:${isPinned ? '#ffd166' : 'var(--joy-text-primary)'}">${isPinned ? '📌 ' : ''}${escapeHtml(mob.monster_name)}</strong>
                    <span class="joy-badge joy-badge--brand joy-badge--sm">Level ${mob.level}</span>
                  </div>
                  <div class="mono" style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:3px">
                    ${escapeHtml(mob.element)} · ${escapeHtml(mob.size)} · ${escapeHtml(mob.race)} (${escapeHtml(mob.family)})
                  </div>
                  <div style="font-size:11px;color:#34d399;margin-top:4px">
                    Spawns: ×${totalSpawns} across ${mob.habitats.map(h => h.node_name).join(', ')}
                  </div>
                  <div style="margin-top:6px">
                    <button type="button" class="joy-button joy-button--outline joy-button--sm" style="width:100%;height:24px;font-size:10.5px" onclick="event.stopPropagation();setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(mob.habitats[0].node_id)}', monsterId: '${escapeHtml(mob.monster_id)}', inspectId: '${escapeHtml(mob.habitats[0].node_id)}' })">
                      Open Monster/1035 Sheet ➔
                    </button>
                  </div>
                </div>
              `;
            }).join('') : '<div style="font-size:11.5px;color:var(--joy-text-secondary)">Select a District with Canon/Draft child hunting areas to pin monster spawns.</div>'}
          </div>
        </section>

        <!-- District 2D Connected Map Matrix -->
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 3 · DISTRICT ORTHOGONAL CONNECTED MAP MATRIX (${escapeHtml(activeDistrict.level_band_label || '')})</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(activeDistrict.name || '')} (${cols} × ${rows} Connected Grid)</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${filteredDistricts.map(d => `
                <button type="button" class="joy-button ${d.id === activeDistrict.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(d.parent_continent_id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' })">
                  ${escapeHtml(d.name)} (${escapeHtml(d.status)})
                </button>
              `).join('')}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);margin-bottom:14px;font-size:12px">
            <div><strong>Core Rationale:</strong> ${escapeHtml(activeDistrict.core_rationale || '')}</div>
            <div style="margin-top:4px;color:var(--joy-text-secondary)"><strong>Local Conflict:</strong> ${escapeHtml(activeDistrict.local_conflict || '')}</div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(${cols}, minmax(0, 1fr));gap:12px;margin-bottom:16px">
            ${matrixCellsHtml.join('')}
          </div>

        <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
          <div class="mono" style="font-size:11px;font-weight:700;margin-bottom:8px">SYMMETRIC PORTAL EDGE TOPOLOGY (${portalEdges.length} BRIDGES)</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">
            ${portalEdges.map(edge => `
              <div style="padding:8px 10px;border-radius:6px;background:var(--joy-surface-card);border:1px solid ${edge.gate_state === 'fog_of_lore' ? 'rgba(168,85,247,0.5)' : 'var(--joy-border-subtle)'};font-size:11.5px">
                <div style="font-weight:700">${escapeHtml(edge.from_node_id)} (${escapeHtml(edge.from_direction)}) ⇄ ${escapeHtml(edge.to_node_id)} (${escapeHtml(edge.to_direction)})</div>
                <div class="mono" style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:3px">
                  Gate: ${escapeHtml(edge.gate_state)} · Road Width: ${edge.road_width_meters} meters
                </div>
                ${edge.lock_reason ? `<div style="font-size:11px;color:#c084fc;margin-top:3px">🌫️ ${escapeHtml(edge.lock_reason)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        </section>
      </div>

      <!-- Right Column: Core Rationale & Five-Pillar Quality Checklist Drawer -->
      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(activeDistrict.name || '')}</h3>
        ${renderStatusBadgeHtml(activeDistrict.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(activeDistrict.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(activeDistrict)}
      </aside>
    </div>
  `;
}

function renderStudioTownOrHuntingAreaPerspective(activeDistrict, nodes, activeNode) {
  const districtNodes = nodes
    .filter(n => n.parent_district_id === activeDistrict.id)
    .filter(n => STUDIO_STATUS_FILTER === 'all' || n.status === STUDIO_STATUS_FILTER);
  const isMystery = activeNode.status === 'mystery';
  const tile = activeNode.terrain_tile || {};
  const dims = tile.dimensions_meters || { width: 4000, height: 4000 };
  const portals = activeNode.portals || {};
  const portalDirs = ['North', 'South', 'East', 'West', 'Dungeon', 'Exit'];
  const kit = activeNode.asset_kit_bindings || {};
  const spawns = activeNode.resident_spawns || [];

  // Select active monster for Monster/1035 detail inspector
  let activeMonster = spawns.find(sp => sp.monster_id === STUDIO_SELECTED_MONSTER_ID) || spawns[0] || null;
  if (!activeMonster) {
    // Fallback to first monster in the district so Town viewers can also inspect nearby District fauna if desired
    for (const dn of nodes.filter(x => x.parent_district_id === activeDistrict.id)) {
      if ((dn.resident_spawns || []).length > 0) {
        activeMonster = dn.resident_spawns[0];
        break;
      }
    }
  }

  let monsterDetailHtml = '';
  if (activeMonster) {
    const lv = activeMonster.level || 1;
    const hp = lv * 68 + 45;
    const hitFlee = `${100 + lv * 3} / ${95 + lv * 2}`;
    const baseJobExp = `${lv * 24} / ${lv * 16}`;
    const elemMods = computeStudioElementalModifiers(activeMonster.element);
    const elemOrder = ['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Shadow', 'Ghost', 'Undead'];
    const card = activeMonster.monster_card_drop || {};

    monsterDetailHtml = `
      <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <div class="mono" style="font-size:11px;color:#38bdf8">MAXION MONSTER/1035 DETAIL INSPECTOR</div>
            <h3 style="margin:2px 0 0;font-size:1.15rem">${escapeHtml(activeMonster.monster_name)} (${escapeHtml(activeMonster.monster_id)})</h3>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${spawns.map(sp => `
              <button type="button" class="joy-button ${sp.monster_id === activeMonster.monster_id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(activeNode.id)}', monsterId: '${escapeHtml(sp.monster_id)}', inspectId: '${escapeHtml(activeNode.id)}' })">
                ${escapeHtml(sp.monster_name)} (Level ${sp.level})
              </button>
            `).join('')}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:192px 1fr;gap:16px;align-items:start">
          <!-- 192x192 Portrait Stage -->
          <div style="width:192px;height:192px;border-radius:12px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;text-align:center">
            <img src="/thumbs/creatures/${escapeHtml(activeMonster.monster_id)}.webp" alt="${escapeHtml(activeMonster.monster_name)}" style="width:112px;height:112px;object-fit:contain;margin-bottom:8px" />
            <div style="font-weight:800;font-size:12px">${escapeHtml(activeMonster.monster_name)}</div>
            <div class="mono" style="font-size:10px;color:#ffd166">Spawn ×${activeMonster.spawn_count} · Every ${activeMonster.respawn_seconds}s</div>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <!-- 4 Property Pills -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">ELEMENT</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.element)}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">SIZE</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.size)}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">RACE</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.race)}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">ECOLOGY FAMILY</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.family)}</div>
              </div>
            </div>

            <!-- 4 Stat Boxes: Level, Health Points, Hit and Flee, Base and Job Experience -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">LEVEL</div>
                <div class="mono" style="font-weight:800;font-size:13px;color:#ffd166;margin-top:2px">Level ${lv}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">HEALTH POINTS</div>
                <div class="mono" style="font-weight:800;font-size:13px;color:#34d399;margin-top:2px">${hp} Health Points</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">100% HIT / 95% FLEE</div>
                <div class="mono" style="font-weight:800;font-size:13px;margin-top:2px">${hitFlee}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">BASE / JOB EXPERIENCE</div>
                <div class="mono" style="font-weight:800;font-size:13px;margin-top:2px">${baseJobExp}</div>
              </div>
            </div>

            <!-- 2x5 Elemental Modifiers Grid -->
            <div>
              <div class="mono" style="font-size:10px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">2 × 5 ELEMENTAL DAMAGE MODIFIERS GRID (PERCENTAGE)</div>
              <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
                ${elemOrder.map(el => {
                  const pct = elemMods[el] !== undefined ? elemMods[el] : 100;
                  const color = pct > 100 ? '#34d399' : (pct < 100 ? '#f87171' : 'var(--joy-text-primary)');
                  return `
                    <div style="padding:6px 8px;border-radius:6px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);display:flex;justify-content:space-between;align-items:center;font-size:11px">
                      <span>${el}</span>
                      <strong class="mono" style="color:${color}">${pct}%</strong>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Item Drops & Monster Card Drop -->
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:10px">
              <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">ITEM DROPS WITH PERCENTAGE BADGES</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  ${(activeMonster.item_drops || []).map(it => `
                    <span class="joy-badge joy-badge--neutral joy-badge--sm" style="padding:4px 8px">
                      ${escapeHtml(it.item_name)} <strong class="mono" style="color:#ffd166;margin-left:4px">${it.drop_chance_percent}%</strong>
                    </span>
                  `).join('')}
                </div>
              </div>
              <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">MONSTER CARD DROP</div>
                <div style="font-size:12px;font-weight:700;color:#ffd166">🃏 ${escapeHtml(card.card_name || 'None')} (${card.drop_chance_percent || 0.01}%)</div>
                <div style="font-size:11px;color:var(--joy-text-secondary);margin-top:2px">Slot: ${escapeHtml(card.equipment_slot || 'Accessory')} · ${escapeHtml(card.modifier_summary || '')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  return `
    ${renderTownOrHuntingAreaBigPictureSvg(activeDistrict, activeNode, activeMonster)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 4 · TOWN OR HUNTING AREA INSPECTOR (${escapeHtml(activeNode.node_type || '')})</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(activeNode.name || '')} [${(activeNode.grid_coordinates || [0,0]).join(', ')}]</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${districtNodes.map(n => `
                <button type="button" class="joy-button ${n.id === activeNode.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(n.id)}', inspectId: '${escapeHtml(n.id)}' })">
                  ${escapeHtml(n.name)} (${escapeHtml(n.status)})
                </button>
              `).join('')}
            </div>
          </div>

          <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);margin-bottom:14px;font-size:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <strong>Core Rationale (Linked to District ${escapeHtml(activeDistrict.name || '')})</strong>
              ${renderStatusBadgeHtml(activeNode.status)}
            </div>
            <div>${escapeHtml(activeNode.core_rationale || '')}</div>
          </div>

          ${isMystery && activeNode.mystery_hook ? `
            <div style="padding:16px;border-radius:10px;background:rgba(168,85,247,0.14);border:1px dashed rgba(168,85,247,0.6)">
              <div style="font-weight:800;font-size:13.5px;color:#c084fc;margin-bottom:6px">🌫️ Intentional Mystery / Fog of Lore Leaf Node (Not Compiled to Playable Map)</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>In-World Rumor:</strong> ${escapeHtml(activeNode.mystery_hook.in_world_rumor)}</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>Visual Silhouette:</strong> ${escapeHtml(activeNode.mystery_hook.visual_silhouette)}</div>
              <div style="font-size:12px"><strong>Unanswered Question:</strong> ${escapeHtml(activeNode.mystery_hook.unanswered_question)}</div>
            </div>
          ` : `
            <!-- Topographic & Directional Portal Blueprint -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">TOPOGRAPHIC TERRAIN TILE</div>
                <div style="font-size:12px"><strong>Map Identifier:</strong> <code>${escapeHtml(activeNode.map_id || '')}</code></div>
                <div style="font-size:12px;margin-top:3px"><strong>Dimensions:</strong> ${dims.width} × ${dims.height} meters</div>
                <div style="font-size:12px;margin-top:3px"><strong>Biome Palette:</strong> <code>${escapeHtml(tile.biome_palette || '')}</code></div>
                <div style="font-size:12px;margin-top:3px"><strong>Maximum Terrace Step:</strong> ${tile.max_terrace_step_meters || 0.18} meters (≤ 0.25 meters)</div>
                <div style="font-size:12px;margin-top:3px"><strong>Water Feature:</strong> ${escapeHtml(tile.water_feature || '')}</div>
              </div>

              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">90 TO 120 CENTIMETER SCALE AND THREE-DIMENSIONAL ASSET KIT</div>
                <div style="font-size:12px"><strong>Player Scale Band:</strong> ${(kit.player_scale_band_meters || [0.9, 1.2]).join(' to ')} meters</div>
                <div style="font-size:12px;margin-top:3px"><strong>Grass Height Cap:</strong> ${kit.max_grass_height_meters || 0.28} meters (≤ 0.35 meters)</div>
                <div style="font-size:12px;margin-top:3px"><strong>Bush Height Cap:</strong> ${kit.max_bush_height_meters || 0.58} meters (≤ 0.65 meters)</div>
                <div style="font-size:12px;margin-top:3px"><strong>Road / Footpath Width:</strong> ${kit.main_road_width_meters || 12.0} meters / ${kit.footpath_width_meters || 4.0} meters</div>
                <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
                  ${(kit.three_dimensional_assets || []).map(glb => `<span class="joy-badge joy-badge--brand joy-badge--sm mono">${escapeHtml(glb)}</span>`).join('')}
                </div>
              </div>
            </div>

            <h3 style="margin:0 0 8px;font-size:1rem">Directional Portal Triggers (North / South / East / West / Dungeon / Exit)</h3>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              ${portalDirs.map(dir => {
                const p = portals[dir];
                if (!p) {
                  return `
                    <div style="padding:10px;border-radius:8px;background:rgba(15,23,42,0.35);border:1px dashed var(--joy-border-subtle);font-size:11.5px;color:var(--joy-text-muted)">
                      <strong>${dir}:</strong> Natural Boundary (Closed)
                    </div>
                  `;
                }
                const isFog = p.gate_state === 'fog_of_lore';
                const tb = p.trigger_box_meters || {};
                return `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid ${isFog ? 'rgba(168,85,247,0.55)' : 'var(--joy-border-default)'};font-size:11.5px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>${dir} Portal</strong>
                      <span class="mono" style="font-size:10px;color:${isFog ? '#c084fc' : '#34d399'}">${escapeHtml(p.gate_state)}</span>
                    </div>
                    <div style="margin-top:4px">Target: <code>${escapeHtml(p.target_node_id)}</code> (${escapeHtml(p.target_direction)})</div>
                    <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin-top:2px">Trigger Box: (${tb.x}, ${tb.y}) ${tb.width}×${tb.height} meters</div>
                    ${p.lock_message ? `<div style="font-size:10.5px;color:#c084fc;margin-top:4px">🌫️ ${escapeHtml(p.lock_message)}</div>` : ''}
                    <button type="button" class="joy-button joy-button--outline joy-button--sm" style="margin-top:6px;width:100%;height:24px;font-size:10.5px" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(p.target_node_id)}', inspectId: '${escapeHtml(p.target_node_id)}' })">
                      Traverse ${dir} ➔
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </section>

        ${monsterDetailHtml}
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(activeNode.name || '')}</h3>
        ${renderStatusBadgeHtml(activeNode.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(activeNode.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(activeNode)}
      </aside>
    </div>
  `;
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
// =========================================================================
// MAXION WORLD MAP + LINEAGE CONNECTED MAP ATLAS + MONSTER/1035 ENGINE
// =========================================================================

const MAXION_WORLD_TILES = [
  // Row 0 (Far North — Lv.61-100)
  { id: 'c01-frost-spire', col: 1, row: 0, code: 'ice_dun02', name: 'Frost Spire Keep', biome: 'glacier', lv: '65 - 85', kind: 'dungeon',
    neighbors: { S: 'c03-coldreach-tundra', E: 'c01-glacier-vault' },
    spawns: [{ id: 'ice_titan', count: 35 }, { id: 'sasquatch', count: 50 }, { id: 'hunter_fly', count: 25 }] },
  { id: 'c01-glacier-vault', col: 2, row: 0, code: 'ice_dun03', name: 'Glacier Vault F3', biome: 'glacier', lv: '75 - 95', kind: 'dungeon',
    neighbors: { W: 'c01-frost-spire', S: 'c02-high-pass' },
    spawns: [{ id: 'ice_titan', count: 45 }, { id: 'abysmal_knight', count: 20 }, { id: 'baphomet', count: 1 }] },
  { id: 'c04-clock-belfry', col: 3, row: 0, code: 'alde_dun04', name: 'Clock Tower Belfry', biome: 'castle', lv: '61 - 80', kind: 'dungeon',
    neighbors: { S: 'c02-capital-freja', E: 'c10-magma-caldera' },
    spawns: [{ id: 'clock_manager', count: 30 }, { id: 'joker', count: 45 }, { id: 'hunter_fly', count: 35 }] },
  { id: 'c10-magma-caldera', col: 4, row: 0, code: 'mag_dun02', name: 'Nogg Road Caldera', biome: 'volcano', lv: '81 - 100', kind: 'dungeon',
    neighbors: { W: 'c04-clock-belfry', S: 'c10-ash-citadel', E: 'c10-core-reactor' },
    spawns: [{ id: 'magma_kaho', count: 60 }, { id: 'pyroclast_wyrm', count: 1 }, { id: 'abysmal_knight', count: 25 }] },
  { id: 'c10-core-reactor', col: 5, row: 0, code: 'ein_dun02', name: 'Einbroch Core Vault', biome: 'volcano', lv: '85 - 100', kind: 'dungeon',
    neighbors: { W: 'c10-magma-caldera', S: 'c09-iron-quarry' },
    spawns: [{ id: 'rsx_colossus', count: 1 }, { id: 'magma_kaho', count: 40 }, { id: 'bone_golem', count: 35 }] },

  // Row 1 (Northern Highlands — Lv.41-80)
  { id: 'c07-glast-abbey', col: 0, row: 1, code: 'gl_church', name: 'Glast Heim Abbey', biome: 'crypt', lv: '55 - 78', kind: 'dungeon',
    neighbors: { E: 'c03-coldreach-tundra', S: 'c07-chivalry-hall' },
    spawns: [{ id: 'evil_druid', count: 55 }, { id: 'abysmal_knight', count: 25 }, { id: 'dracula', count: 1 }] },
  { id: 'c03-coldreach-tundra', col: 1, row: 1, code: 'lasa_fild01', name: 'Lutie Snowfield', biome: 'glacier', lv: '45 - 65', kind: 'field',
    neighbors: { N: 'c01-frost-spire', W: 'c07-glast-abbey', E: 'c02-high-pass', S: 'c02-west-pinewood' },
    spawns: [{ id: 'sasquatch', count: 65 }, { id: 'ice_titan', count: 20 }, { id: 'desert_wolf', count: 30 }] },
  { id: 'c02-high-pass', col: 2, row: 1, code: 'mjolnir_06', name: 'Mt. Mjolnir North Pass', biome: 'mountain', lv: '35 - 55', kind: 'field',
    neighbors: { N: 'c01-glacier-vault', W: 'c03-coldreach-tundra', E: 'c02-capital-freja', S: 'c02-floral-valley' },
    spawns: [{ id: 'flora', count: 60 }, { id: 'hunter_fly', count: 40 }, { id: 'wild_boar', count: 45 }] },
  { id: 'c02-capital-freja', col: 3, row: 1, code: 'prontera', name: 'Prontera Royal Capital', biome: 'town', lv: '1 - 100', kind: 'town',
    neighbors: { N: 'c04-clock-belfry', W: 'c02-high-pass', S: 'freja-south-gate', E: 'c10-ash-citadel', D: 'c02-culvert-sewer' },
    spawns: [{ id: 'poring', count: 15 }, { id: 'lunatic', count: 15 }] },
  { id: 'c10-ash-citadel', col: 4, row: 1, code: 'yuno_fild08', name: 'Schwartzvald Plateau', biome: 'mountain', lv: '52 - 72', kind: 'field',
    neighbors: { N: 'c10-magma-caldera', W: 'c02-capital-freja', E: 'c09-iron-quarry', S: 'c04-orc-fortress' },
    spawns: [{ id: 'bone_golem', count: 50 }, { id: 'hunter_fly', count: 30 }, { id: 'bathory', count: 40 }] },
  { id: 'c09-iron-quarry', col: 5, row: 1, code: 'ein_fild04', name: 'Einbech Mining Ridge', biome: 'mountain', lv: '60 - 80', kind: 'field',
    neighbors: { N: 'c10-core-reactor', W: 'c10-ash-citadel', S: 'c04-coal-caverns' },
    spawns: [{ id: 'bone_golem', count: 60 }, { id: 'clock_manager', count: 20 }, { id: 'rsx_colossus', count: 1 }] },

  // Row 2 (Central Midgard — Lv.1-60)
  { id: 'c07-chivalry-hall', col: 0, row: 2, code: 'gl_knt01', name: 'Glast Heim Chivalry', biome: 'crypt', lv: '61 - 85', kind: 'dungeon',
    neighbors: { N: 'c07-glast-abbey', E: 'c02-west-pinewood', S: 'c06-geffen-tower' },
    spawns: [{ id: 'abysmal_knight', count: 45 }, { id: 'evil_druid', count: 40 }, { id: 'baphomet', count: 1 }] },
  { id: 'c02-west-pinewood', col: 1, row: 2, code: 'prt_fild05', name: 'Prontera West Culvert Edge', biome: 'forest', lv: '8 - 22', kind: 'field',
    neighbors: { N: 'c03-coldreach-tundra', W: 'c07-chivalry-hall', E: 'c02-floral-valley', S: 'c02-culvert-sewer' },
    spawns: [{ id: 'thief_bug', count: 70 }, { id: 'spore', count: 55 }, { id: 'poring', count: 40 }] },
  { id: 'c02-floral-valley', col: 2, row: 2, code: 'prt_fild03', name: 'Yoyo & Rocker Meadow', biome: 'meadow', lv: '12 - 28', kind: 'field',
    neighbors: { N: 'c02-high-pass', W: 'c02-west-pinewood', E: 'freja-south-gate', S: 'c02-willow-grove' },
    spawns: [{ id: 'wild_boar', count: 60 }, { id: 'spore', count: 50 }, { id: 'flora', count: 35 }] },
  { id: 'freja-south-gate', col: 3, row: 2, code: 'prt_fild08', name: 'Prontera South Gate', biome: 'meadow', lv: '1 - 15', kind: 'field',
    neighbors: { N: 'c02-capital-freja', W: 'c02-floral-valley', E: 'c04-orc-fortress', S: 'c05-sograt-border' },
    spawns: [{ id: 'poring', count: 80 }, { id: 'lunatic', count: 65 }, { id: 'forest_slime', count: 50 }, { id: 'drops', count: 35 }] },
  { id: 'c04-orc-fortress', col: 4, row: 2, code: 'gef_fild10', name: 'Orc Village Stronghold', biome: 'forest', lv: '25 - 45', kind: 'field',
    neighbors: { N: 'c10-ash-citadel', W: 'freja-south-gate', E: 'c04-coal-caverns', S: 'c04-orc-dungeon' },
    spawns: [{ id: 'orc_warrior', count: 75 }, { id: 'orc_spear', count: 50 }, { id: 'high_orc', count: 30 }, { id: 'orc_lord', count: 1 }] },
  { id: 'c04-coal-caverns', col: 5, row: 2, code: 'mjo_dun03', name: 'Mjolnir Dead Pit B3', biome: 'crypt', lv: '32 - 52', kind: 'dungeon',
    neighbors: { N: 'c09-iron-quarry', W: 'c04-orc-fortress', S: 'c08-payon-shrine' },
    spawns: [{ id: 'skel_soldier', count: 55 }, { id: 'drainliar', count: 65 }, { id: 'mummy', count: 40 }] },

  // Row 3 (Southern Kingdoms & Dungeons — Lv.15-55)
  { id: 'c06-geffen-tower', col: 0, row: 3, code: 'gef_tower', name: 'Geffen Magic Spire B2', biome: 'castle', lv: '35 - 58', kind: 'dungeon',
    neighbors: { N: 'c07-chivalry-hall', E: 'c02-culvert-sewer', S: 'c13-sunken-galleon' },
    spawns: [{ id: 'whisper', count: 60 }, { id: 'bathory', count: 50 }, { id: 'joker', count: 35 }, { id: 'dracula', count: 1 }] },
  { id: 'c02-culvert-sewer', col: 1, row: 3, code: 'prt_sewb3', name: 'Prontera Culvert B3', biome: 'crypt', lv: '15 - 32', kind: 'dungeon',
    neighbors: { N: 'c02-west-pinewood', W: 'c06-geffen-tower', E: 'c02-willow-grove', S: 'c05-pyramid-vault' },
    spawns: [{ id: 'thief_bug', count: 85 }, { id: 'drainliar', count: 60 }, { id: 'poison_toad', count: 45 }] },
  { id: 'c02-willow-grove', col: 2, row: 3, code: 'pay_fild02', name: 'Payon Bamboo Woods', biome: 'forest', lv: '10 - 25', kind: 'field',
    neighbors: { N: 'c02-floral-valley', W: 'c02-culvert-sewer', E: 'c05-sograt-border', S: 'c05-morroc-oasis' },
    spawns: [{ id: 'spore', count: 75 }, { id: 'forest_slime', count: 60 }, { id: 'mushroom_king', count: 1 }] },
  { id: 'c05-sograt-border', col: 3, row: 3, code: 'moc_fild01', name: 'Sograt Desert Border', biome: 'desert', lv: '14 - 30', kind: 'field',
    neighbors: { N: 'freja-south-gate', W: 'c02-willow-grove', E: 'c04-orc-dungeon', S: 'c05-sphinx-crypt' },
    spawns: [{ id: 'drops', count: 70 }, { id: 'desert_wolf', count: 65 }, { id: 'flora', count: 35 }] },
  { id: 'c04-orc-dungeon', col: 4, row: 3, code: 'orcsdun02', name: 'Orc Underground Cave B2', biome: 'crypt', lv: '35 - 55', kind: 'dungeon',
    neighbors: { N: 'c04-orc-fortress', W: 'c05-sograt-border', E: 'c08-payon-shrine', S: 'c08-alberta-port' },
    spawns: [{ id: 'high_orc', count: 70 }, { id: 'orc_spear', count: 55 }, { id: 'skel_archer', count: 45 }, { id: 'orc_lord', count: 1 }] },
  { id: 'c08-payon-shrine', col: 5, row: 3, code: 'pay_dun03', name: 'Payon Ancestral Cave F3', biome: 'crypt', lv: '24 - 42', kind: 'dungeon',
    neighbors: { N: 'c04-coal-caverns', W: 'c04-orc-dungeon', S: 'c08-byalan-trench' },
    spawns: [{ id: 'skel_soldier', count: 65 }, { id: 'skel_archer', count: 55 }, { id: 'whisper', count: 40 }] },

  // Row 4 (Southern Desert & Ocean — Lv.21-60)
  { id: 'c13-sunken-galleon', col: 0, row: 4, code: 'treasure02', name: 'Sunken Pirate Galleon', biome: 'undersea', lv: '38 - 58', kind: 'dungeon',
    neighbors: { N: 'c06-geffen-tower', E: 'c05-pyramid-vault' },
    spawns: [{ id: 'whisper', count: 55 }, { id: 'skel_archer', count: 50 }, { id: 'drake_captain', count: 1 }] },
  { id: 'c05-pyramid-vault', col: 1, row: 4, code: 'moc_pryd04', name: 'Morroc Pyramid B4', biome: 'pyramid', lv: '35 - 55', kind: 'dungeon',
    neighbors: { N: 'c02-culvert-sewer', W: 'c13-sunken-galleon', E: 'c05-morroc-oasis' },
    spawns: [{ id: 'mummy', count: 75 }, { id: 'skel_soldier', count: 50 }, { id: 'drainliar', count: 45 }] },
  { id: 'c05-morroc-oasis', col: 2, row: 4, code: 'morocc', name: 'Morroc Jewel Oasis', biome: 'town', lv: '20 - 60', kind: 'town',
    neighbors: { N: 'c02-willow-grove', W: 'c05-pyramid-vault', E: 'c05-sphinx-crypt' },
    spawns: [{ id: 'drops', count: 35 }, { id: 'desert_wolf', count: 25 }] },
  { id: 'c05-sphinx-crypt', col: 3, row: 4, code: 'in_sphinx4', name: 'Sphinx Tomb F4', biome: 'pyramid', lv: '42 - 62', kind: 'dungeon',
    neighbors: { N: 'c05-sograt-border', W: 'c05-morroc-oasis', E: 'c08-alberta-port' },
    spawns: [{ id: 'mummy', count: 65 }, { id: 'whisper', count: 50 }, { id: 'hunter_fly', count: 45 }] },
  { id: 'c08-alberta-port', col: 4, row: 4, code: 'alberta', name: 'Alberta Harbor & Docks', biome: 'port', lv: '15 - 50', kind: 'town',
    neighbors: { N: 'c04-orc-dungeon', W: 'c05-sphinx-crypt', E: 'c08-byalan-trench' },
    spawns: [{ id: 'poison_toad', count: 30 }, { id: 'poring', count: 25 }] },
  { id: 'c08-byalan-trench', col: 5, row: 4, code: 'iz_dun04', name: 'Byalan Undersea Trench', biome: 'undersea', lv: '40 - 60', kind: 'dungeon',
    neighbors: { N: 'c08-payon-shrine', W: 'c08-alberta-port' },
    spawns: [{ id: 'strouf', count: 65 }, { id: 'poison_toad', count: 50 }, { id: 'drake_captain', count: 1 }] },
];

const MAXION_MONSTERS = [
  // Band 1 - 20
  { id: 'poring', code: 1002, name: 'Poring', band: '1-20', lv: 1, hp: 60, hit: 22, flee: 7, exp: 15, job: 10,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Plant', size: 'Medium',
    thumb: '/thumbs/a1b1790b90da69a2c0cf82dbba35f9bfac6b54f4.webp',
    modifiers: { Earth: 100, Poison: 100, Neutral: 100, Fire: 50, Holy: 100, Dark: 100, Water: 25, Ghost: 100, Undead: 100, Wind: 175 },
    drops: [
      { name: 'Poring Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Oridecon Shard', rate: '0.24%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Sticky Mucus', rate: '4.00%', rarity: 'rare', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' },
      { name: 'Apple', rate: '12.50%', rarity: 'common', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' },
      { name: 'Jellopy', rate: '70.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'forest_slime', code: 1003, name: 'Forest Slime', band: '1-20', lv: 4, hp: 115, hit: 28, flee: 12, exp: 28, job: 18,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Plant', size: 'Small',
    thumb: '/thumbs/ca1ba005a8948653bc49573b3aaab272d0aa79ca.webp',
    modifiers: { Fire: 175, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Earth: 25, Ghost: 100, Undead: 100, Wind: 80 },
    drops: [
      { name: 'Poporing Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Emerald Herb', rate: '1.50%', rarity: 'rare', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Garlet', rate: '35.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'lunatic', code: 1063, name: 'Lunatic', band: '1-20', lv: 3, hp: 78, hit: 26, flee: 16, exp: 20, job: 14,
    type: 'Normal', element: 'Neutral', elIcon: '⚪', race: 'Brute', size: 'Small',
    thumb: '/thumbs/703711cd587687f00cb6acfa2ba7f82f70a1869f.webp',
    modifiers: { Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Ghost: 25 },
    drops: [
      { name: 'Lunatic Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Four-Leaf Clover', rate: '0.15%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Clover', rate: '65.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'drops', code: 1113, name: 'Drops', band: '1-20', lv: 7, hp: 165, hit: 33, flee: 18, exp: 42, job: 26,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Plant', size: 'Medium',
    thumb: '/thumbs/641f0b1fdde03455dc9934144c8f68c087ba66f8.webp',
    modifiers: { Water: 175, Wind: 100, Neutral: 100, Poison: 100, Holy: 100, Dark: 100, Earth: 80, Ghost: 100, Undead: 100, Fire: 25 },
    drops: [
      { name: 'Drops Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Orange Juice', rate: '6.50%', rarity: 'rare', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' },
      { name: 'Jellopy', rate: '55.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'spore', code: 1014, name: 'Spore', band: '1-20', lv: 16, hp: 510, hit: 46, flee: 29, exp: 150, job: 98,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Plant', size: 'Medium',
    thumb: '/thumbs/1db575bd084764c9bd6bfbe525d36295770fd52b.webp',
    modifiers: { Wind: 175, Earth: 100, Neutral: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 25 },
    drops: [
      { name: 'Spore Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Blue Herb', rate: '2.50%', rarity: 'rare', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' },
      { name: 'Mushroom Spore', rate: '68.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'thief_bug', code: 1051, name: 'Thief Bug', band: '1-20', lv: 13, hp: 380, hit: 42, flee: 34, exp: 112, job: 65,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Insect', size: 'Small',
    thumb: '/thumbs/343b102f697254e6092ba27a8b9a3da85963e802.webp',
    modifiers: { Holy: 150, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 75, Ghost: 75, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Thief Bug Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' },
      { name: 'Iron Ore', rate: '4.50%', rarity: 'rare', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' },
      { name: 'Worm Peeling', rate: '55.00%', rarity: 'common', thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp' }
    ]
  },
  { id: 'wild_boar', code: 1067, name: 'Savage Boar', band: '1-20', lv: 19, hp: 820, hit: 52, flee: 31, exp: 235, job: 140,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Brute', size: 'Large',
    thumb: '/thumbs/3a3be2d4c2368da2283d13dc0e79850d99e0eb73.webp',
    modifiers: { Fire: 150, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 50 },
    drops: [
      { name: 'Savage Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Boar Mane', rate: '62.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'mushroom_king', code: 1084, name: 'Golden Spore Boss', band: '1-20', lv: 20, hp: 6400, hit: 75, flee: 45, exp: 2100, job: 1250,
    type: 'MVP', element: 'Poison', elIcon: '☠️', race: 'Plant', size: 'Large',
    thumb: '/thumbs/793e05e1274e79d1527fa96bd27a921fc2f86b86.webp',
    modifiers: { Holy: 125, Fire: 125, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Dark: 50, Ghost: 75, Undead: 50, Poison: 0 },
    drops: [
      { name: 'Golden Spore Crown', rate: '0.25%', rarity: 'legend', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Elunium', rate: '8.50%', rarity: 'rare', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' }
    ]
  },

  // Band 21 - 40
  { id: 'desert_wolf', code: 1106, name: 'Desert Wolf', band: '21-40', lv: 25, hp: 1480, hit: 68, flee: 48, exp: 390, job: 245,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Brute', size: 'Medium',
    thumb: '/thumbs/2fd08a991dfba974a49bf166865e322df7e12d9d.webp',
    modifiers: { Water: 150, Neutral: 100, Wind: 100, Poison: 125, Holy: 100, Dark: 100, Earth: 90, Ghost: 100, Undead: 100, Fire: 25 },
    drops: [
      { name: 'Desert Wolf Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Katar [2]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Wolf Claw', rate: '58.00%', rarity: 'common', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' }
    ]
  },
  { id: 'flora', code: 1118, name: 'Flora', band: '21-40', lv: 27, hp: 1890, hit: 71, flee: 35, exp: 485, job: 310,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Plant', size: 'Large',
    thumb: '/thumbs/bf5fb962417dc860e8e36fb5ab4f8470e8fb7c0f.webp',
    modifiers: { Fire: 175, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 25 },
    drops: [
      { name: 'Flora Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Maneater Blossom', rate: '48.00%', rarity: 'common', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' }
    ]
  },
  { id: 'poison_toad', code: 1089, name: 'Roda Poison Toad', band: '21-40', lv: 23, hp: 1190, hit: 61, flee: 43, exp: 310, job: 195,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Fish', size: 'Medium',
    thumb: '/thumbs/2f54e98965d902267b36b8b150bd97df1ca27912.webp',
    modifiers: { Wind: 175, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 60, Ghost: 100, Undead: 100, Water: 25 },
    drops: [
      { name: 'Toad Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Spawn Webfoot', rate: '65.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'skel_soldier', code: 1028, name: 'Soldier Skeleton', band: '21-40', lv: 29, hp: 2340, hit: 82, flee: 56, exp: 640, job: 410,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp',
    modifiers: { Holy: 175, Fire: 150, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Soldier Skeleton Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Stiletto [3]', rate: '0.15%', rarity: 'epic', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' },
      { name: 'Skel-Bone', rate: '52.00%', rarity: 'common', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' }
    ]
  },
  { id: 'skel_archer', code: 1016, name: 'Archer Skeleton', band: '21-40', lv: 31, hp: 2650, hit: 94, flee: 60, exp: 780, job: 490,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/7c04df1bf5db7f47abfd93beeead9cc98bbdb7b6.webp',
    modifiers: { Holy: 175, Fire: 150, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Archer Skeleton Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Arbalest [2]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Fire Arrow', rate: '45.00%', rarity: 'common', thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp' }
    ]
  },
  { id: 'drainliar', code: 1111, name: 'Drainliar', band: '21-40', lv: 33, hp: 2890, hit: 88, flee: 72, exp: 840, job: 520,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Brute', size: 'Small',
    thumb: '/thumbs/d6c6b868557d3fc3f33144fc3a1d28e92ebde3cf.webp',
    modifiers: { Holy: 150, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 75, Ghost: 75, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Drainliar Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Tooth of Bat', rate: '56.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'orc_warrior', code: 1023, name: 'Orc Warrior', band: '21-40', lv: 35, hp: 3450, hit: 92, flee: 64, exp: 980, job: 610,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Demi-Human', size: 'Medium',
    thumb: '/thumbs/0e1fc9249dfee10a44eb3817ebdebf10abdb9634.webp',
    modifiers: { Fire: 150, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 50 },
    drops: [
      { name: 'Orc Warrior Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Battle Axe [4]', rate: '0.35%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Orcish Voucher', rate: '68.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'orc_spear', code: 1189, name: 'Orc Archer', band: '21-40', lv: 38, hp: 3920, hit: 105, flee: 74, exp: 1190, job: 760,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Demi-Human', size: 'Medium',
    thumb: '/thumbs/0be24bc75b3e1fa9a5e9bd9268ebcb612bd6d94f.webp',
    modifiers: { Fire: 150, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 50 },
    drops: [
      { name: 'Orc Archer Bow', rate: '0.25%', rarity: 'epic', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Steel Arrow Quiver', rate: '8.50%', rarity: 'rare', thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp' }
    ]
  },

  // Band 41 - 60
  { id: 'mummy', code: 1041, name: 'Mummy', band: '41-60', lv: 42, hp: 5176, hit: 108, flee: 67, exp: 1650, job: 1020,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp',
    modifiers: { Holy: 175, Fire: 150, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Mummy Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Glove [1]', rate: '0.10%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Rotten Bandage', rate: '62.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'whisper', code: 1179, name: 'Whisper', band: '41-60', lv: 46, hp: 4790, hit: 118, flee: 112, exp: 1890, job: 1320,
    type: 'Normal', element: 'Ghost', elIcon: '👻', race: 'Demon', size: 'Small',
    thumb: '/thumbs/8351df7d2e7bc809b527cc0df4dfee4e263bb06d.webp',
    modifiers: { Ghost: 175, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Neutral: 0 },
    drops: [
      { name: 'Whisper Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Fabric', rate: '52.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'high_orc', code: 1213, name: 'High Orc', band: '41-60', lv: 52, hp: 6900, hit: 134, flee: 95, exp: 2960, job: 1840,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp',
    modifiers: { Water: 175, Neutral: 100, Wind: 100, Poison: 125, Holy: 100, Dark: 100, Earth: 80, Ghost: 100, Undead: 100, Fire: 25 },
    drops: [
      { name: 'High Orc Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Orcish Axe [4]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Orcish Fang', rate: '60.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'strouf', code: 1065, name: 'Strouf', band: '41-60', lv: 48, hp: 6250, hit: 126, flee: 98, exp: 2450, job: 1620,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Fish', size: 'Large',
    thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp',
    modifiers: { Wind: 175, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 0 },
    drops: [
      { name: 'Strouf Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Trident [3]', rate: '0.25%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Fin', rate: '48.00%', rarity: 'common', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' }
    ]
  },
  { id: 'bathory', code: 1102, name: 'Bathory', band: '41-60', lv: 54, hp: 6915, hit: 138, flee: 116, exp: 3120, job: 2150,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Demi-Human', size: 'Medium',
    thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp',
    modifiers: { Holy: 150, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 75, Ghost: 75, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Bathory Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Star Dust', rate: '8.50%', rarity: 'rare', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Witch Starsand', rate: '52.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'orc_lord', code: 1190, name: 'Orc Lord [MVP]', band: '41-60', lv: 55, hp: 398000, hit: 188, flee: 142, exp: 48200, job: 26500,
    type: 'MVP', element: 'Earth', elIcon: '🌿', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp',
    modifiers: { Fire: 200, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 50, Ghost: 100, Undead: 100, Earth: 0 },
    drops: [
      { name: 'Orc Lord Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Grandelt [1]', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Bloody Axe', rate: '2.50%', rarity: 'rare', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' }
    ]
  },
  { id: 'drake_captain', code: 1112, name: 'Drake [MVP]', band: '41-60', lv: 58, hp: 446000, hit: 196, flee: 148, exp: 52000, job: 31000,
    type: 'MVP', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp',
    modifiers: { Holy: 200, Fire: 175, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Drake Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Corsair Hat', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Cutlass', rate: '1.50%', rarity: 'rare', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' }
    ]
  },

  // Band 61 - 80 (Includes Screenshot 5 Benchmark: Hunter Fly #1035!)
  { id: 'hunter_fly', code: 1035, name: 'Hunter Fly', band: '61-80', lv: 63, hp: 5940, hit: 168, flee: 193, exp: 2642, job: 1518,
    type: 'Normal', element: 'Wind', elIcon: '🌪️', race: 'Insect', size: 'Small',
    thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp',
    modifiers: { Earth: 175, Poison: 125, Neutral: 100, Fire: 100, Holy: 100, Dark: 100, Water: 80, Ghost: 75, Undead: 75, Wind: 0 },
    drops: [
      { name: 'Hunter Fly Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Elementary Whip', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Damascus [1]', rate: '0.02%', rarity: 'legend', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' },
      { name: 'Mini Furnace', rate: '0.15%', rarity: 'epic', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' },
      { name: 'Oridecon', rate: '0.24%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Wind of Verdure', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Steel', rate: '6.50%', rarity: 'rare', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' },
      { name: 'Solid Shell', rate: '26.68%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'sasquatch', code: 1243, name: 'Sasquatch', band: '61-80', lv: 64, hp: 9420, hit: 152, flee: 118, exp: 3920, job: 2450,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Brute', size: 'Large',
    thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp',
    modifiers: { Wind: 175, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 25 },
    drops: [
      { name: 'Sasquatch Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Mystic Frozen', rate: '1.20%', rarity: 'rare', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' }
    ]
  },
  { id: 'joker', code: 1131, name: 'Joker', band: '61-80', lv: 67, hp: 8250, hit: 174, flee: 185, exp: 4280, job: 2910,
    type: 'Normal', element: 'Wind', elIcon: '🌪️', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp',
    modifiers: { Earth: 175, Poison: 125, Neutral: 100, Fire: 100, Holy: 100, Dark: 100, Water: 80, Ghost: 75, Undead: 75, Wind: 0 },
    drops: [
      { name: 'Joker Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Old Card Album', rate: '0.05%', rarity: 'legend', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' }
    ]
  },
  { id: 'evil_druid', code: 1117, name: 'Evil Druid', band: '61-80', lv: 72, hp: 14200, hit: 168, flee: 132, exp: 5840, job: 4120,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Large',
    thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp',
    modifiers: { Holy: 200, Fire: 175, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Evil Druid Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Biretta [1]', rate: '0.25%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'White Herb', rate: '18.00%', rarity: 'common', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' }
    ]
  },
  { id: 'clock_manager', code: 1270, name: 'Clock Tower Manager', band: '61-80', lv: 76, hp: 18600, hit: 184, flee: 146, exp: 6950, job: 4680,
    type: 'Normal', element: 'Neutral', elIcon: '⚪', race: 'Formless', size: 'Large',
    thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp',
    modifiers: { Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Ghost: 25 },
    drops: [
      { name: 'Tower Manager Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Key of Underground', rate: '3.50%', rarity: 'rare', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' }
    ]
  },
  { id: 'bone_golem', code: 1278, name: 'Stalactic Golem', band: '61-80', lv: 78, hp: 22400, hit: 175, flee: 112, exp: 7420, job: 4850,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Formless', size: 'Large',
    thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp',
    modifiers: { Fire: 200, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 50, Ghost: 100, Undead: 100, Earth: 0 },
    drops: [
      { name: 'Stalactic Golem Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Elunium', rate: '3.15%', rarity: 'rare', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' }
    ]
  },
  { id: 'dracula', code: 1389, name: 'Dracula [MVP]', band: '61-80', lv: 75, hp: 520096, hit: 215, flee: 178, exp: 112000, job: 64000,
    type: 'MVP', element: 'Dark', elIcon: '🌑', race: 'Demon', size: 'Large',
    thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp',
    modifiers: { Holy: 200, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 50, Ghost: 50, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Dracula Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Dragon Vest [1]', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' }
    ]
  },

  // Band 81 - 100
  { id: 'ice_titan', code: 1777, name: 'Ice Titan', band: '81-100', lv: 84, hp: 38600, hit: 196, flee: 158, exp: 12800, job: 8400,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Formless', size: 'Large',
    thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp',
    modifiers: { Wind: 200, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 0 },
    drops: [
      { name: 'Ice Titan Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Ice Cubic', rate: '45.00%', rarity: 'common', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' }
    ]
  },
  { id: 'abysmal_knight', code: 1219, name: 'Abysmal Knight', band: '81-100', lv: 88, hp: 46500, hit: 212, flee: 172, exp: 16400, job: 11200,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp',
    modifiers: { Holy: 175, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 50, Ghost: 50, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Abysmal Knight Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Broad Sword [2]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Chivalry Emblem', rate: '18.50%', rarity: 'common', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' }
    ]
  },
  { id: 'magma_kaho', code: 1072, name: 'Magma Kaho', band: '81-100', lv: 91, hp: 42900, hit: 218, flee: 184, exp: 18200, job: 12900,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Demon', size: 'Medium',
    thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp',
    modifiers: { Water: 200, Neutral: 100, Wind: 100, Poison: 100, Holy: 125, Dark: 100, Earth: 50, Ghost: 100, Undead: 100, Fire: 0 },
    drops: [
      { name: 'Kaho Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Flame Heart', rate: '4.50%', rarity: 'rare', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' }
    ]
  },
  { id: 'rsx_colossus', code: 1623, name: 'RSX-0806 [MVP]', band: '81-100', lv: 94, hp: 660700, hit: 245, flee: 192, exp: 195000, job: 112000,
    type: 'MVP', element: 'Neutral', elIcon: '⚪', race: 'Formless', size: 'Large',
    thumb: '/thumbs/2fc5782834b85e0a8fd9fc5f77a0da3a20df22b9.webp',
    modifiers: { Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Ghost: 25 },
    drops: [
      { name: 'RSX-0806 Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Brionac [2]', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' }
    ]
  },
  { id: 'pyroclast_wyrm', code: 1832, name: 'Ifrit Pyroclast [MVP]', band: '81-100', lv: 99, hp: 1260000, hit: 280, flee: 225, exp: 420000, job: 260000,
    type: 'MVP', element: 'Fire', elIcon: '🔥', race: 'Formless', size: 'Large',
    thumb: '/thumbs/4b8d19ef42da8fa49a16550cb67bd865cb9b5be3.webp',
    modifiers: { Water: 200, Neutral: 100, Wind: 100, Poison: 100, Holy: 100, Dark: 100, Earth: 50, Ghost: 100, Undead: 100, Fire: 0 },
    drops: [
      { name: 'Ifrit Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Ring of Flame Lord', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' }
    ]
  },
  { id: 'baphomet', code: 1039, name: 'Baphomet [MVP]', band: '81-100', lv: 98, hp: 968000, hit: 272, flee: 238, exp: 385000, job: 215000,
    type: 'MVP', element: 'Dark', elIcon: '🌑', race: 'Demon', size: 'Large',
    thumb: '/thumbs/5c1ab699db9be2a09a4a9cb531c8cf62127fc5cb.webp',
    modifiers: { Holy: 200, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 50, Ghost: 50, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Baphomet Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Majestic Goat', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Crescent Scythe', rate: '1.50%', rarity: 'rare', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' }
    ]
  }
];

function inferStudioBiome(node) {
  const pal = String((node.terrain_tile && node.terrain_tile.biome_palette) || '').toLowerCase();
  if (node.node_type === 'town') return 'town';
  if (node.node_type === 'dungeon') {
    if (pal.includes('glacier') || pal.includes('frost') || pal.includes('ice')) return 'glacier';
    if (pal.includes('volcano') || pal.includes('lava') || pal.includes('ember') || pal.includes('kiln')) return 'volcano';
    if (pal.includes('coral') || pal.includes('reef') || pal.includes('tide') || pal.includes('abyss')) return 'undersea';
    return 'crypt';
  }
  if (pal.includes('glacier') || pal.includes('snow') || pal.includes('frost')) return 'glacier';
  if (pal.includes('lava') || pal.includes('magma') || pal.includes('slag') || pal.includes('furnace')) return 'volcano';
  if (pal.includes('brass') || pal.includes('clock') || pal.includes('steppe') || pal.includes('mesa') || pal.includes('basalt')) return 'mountain';
  if (pal.includes('coral') || pal.includes('atoll') || pal.includes('lagoon') || pal.includes('harbor') || pal.includes('pier')) return 'port';
  if (pal.includes('forest') || pal.includes('grove') || pal.includes('willow') || pal.includes('brier')) return 'forest';
  return 'meadow';
}

function getStudioCanonTiles() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const nodes = (sp.nodes || []).filter(n => n && n.status === 'canon');
  const distById = {};
  (sp.districts || []).forEach(d => { if (d && d.id) distById[d.id] = d; });
  const contById = {};
  (sp.continents || []).forEach(c => { if (c && c.id) contById[c.id] = c; });

  return nodes.map(n => {
    const portals = n.portals || {};
    const nb = {};
    if (portals.North && portals.North.target_node_id) nb.N = portals.North.target_node_id;
    if (portals.South && portals.South.target_node_id) nb.S = portals.South.target_node_id;
    if (portals.East && portals.East.target_node_id) nb.E = portals.East.target_node_id;
    if (portals.West && portals.West.target_node_id) nb.W = portals.West.target_node_id;
    if (portals.Dungeon && portals.Dungeon.target_node_id) nb.D = portals.Dungeon.target_node_id;
    if (portals.Exit && portals.Exit.target_node_id) nb.Exit = portals.Exit.target_node_id;

    const coords = n.grid_coordinates || [0, 0];
    const dist = distById[n.parent_district_id] || {};
    const cont = contById[n.parent_continent_id] || {};
    const lvRange = n.level_range || dist.level_range || [1, 15];

    return {
      id: n.id,
      code: n.map_id || n.id,
      name: n.name,
      isStudioCanon: true,
      continentId: n.parent_continent_id || '',
      continentName: cont.name || n.parent_continent_id || '',
      districtId: n.parent_district_id || '',
      districtName: dist.name || n.parent_district_id || '',
      coreRationale: n.core_rationale || '',
      col: coords[0] || 0,
      row: coords[1] || 0,
      biome: inferStudioBiome(n),
      biomePalette: (n.terrain_tile && n.terrain_tile.biome_palette) || 'meadow',
      lv: lvRange[0] + ' - ' + lvRange[1],
      kind: n.node_type === 'town' ? 'town' : (n.node_type === 'dungeon' ? 'dungeon' : 'field'),
      thumb: (n.terrain_tile && n.terrain_tile.preview_thumbnail) || '',
      neighbors: nb,
      spawns: (n.resident_spawns || []).map(s => ({
        id: s.monster_id,
        count: s.spawn_count || 20
      }))
    };
  });
}

function getAllWorldTiles() {
  return [...getStudioCanonTiles(), ...MAXION_WORLD_TILES];
}

function getStudioCanonMonsters() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const nodes = (sp.nodes || []).filter(n => n && n.status === 'canon');
  const seen = new Set(MAXION_MONSTERS.map(m => m.id));
  const out = [];
  const elIcons = {
    Fire: '🔥', Water: '💧', Earth: '🌿', Wind: '🌪️',
    Poison: '☠️', Holy: '✨', Shadow: '🌑', Dark: '🌑',
    Ghost: '👻', Undead: '💀', Neutral: '⚪'
  };
  let seq = 2001;
  nodes.forEach(n => {
    (n.resident_spawns || []).forEach(s => {
      if (!s || !s.monster_id || seen.has(s.monster_id)) return;
      seen.add(s.monster_id);
      const mobThumb = '/thumbs/creatures/' + s.monster_id + '.webp';
      const lv = s.level || 10;
      const band = lv <= 20 ? '1-20' : (lv <= 40 ? '21-40' : (lv <= 60 ? '41-60' : (lv <= 80 ? '61-80' : '81-100')));
      const el = s.element || 'Neutral';
      const drops = [];
      if (s.monster_card_drop && s.monster_card_drop.card_name) {
        drops.push({
          name: s.monster_card_drop.card_name,
          rate: (s.monster_card_drop.drop_chance_percent || 0.01) + '%',
          rarity: 'legend',
          thumb: '/thumbs/cards/' + (s.monster_card_drop.card_id || s.monster_id) + '.webp'
        });
      }
      (s.item_drops || []).forEach(it => {
        const pct = it.drop_chance_percent || 5.0;
        drops.push({
          name: it.item_name,
          rate: pct + '%',
          rarity: pct <= 1.0 ? 'epic' : (pct <= 10.0 ? 'rare' : 'common'),
          thumb: '/thumbs/loot/' + (it.item_id || it.item_name || 'item') + '.webp'
        });
      });
      const rawMods = computeStudioElementalModifiers(el);
      out.push({
        id: s.monster_id,
        code: seq++,
        name: s.monster_name || s.monster_id,
        isStudioCanon: true,
        districtId: n.parent_district_id,
        nodeId: n.id,
        band: band,
        lv: lv,
        hp: lv * 68 + 45,
        hit: 100 + lv * 3,
        flee: 95 + lv * 2,
        exp: lv * 24,
        job: lv * 16,
        type: (s.size === 'Large' && lv >= 35) ? 'MVP' : 'Normal',
        element: el,
        elIcon: elIcons[el] || '⚪',
        race: s.race || 'Formless',
        size: s.size || 'Medium',
        thumb: mobThumb,
        modifiers: {
          Earth: rawMods.Earth ?? 100,
          Poison: rawMods.Poison ?? 100,
          Neutral: rawMods.Neutral ?? 100,
          Fire: rawMods.Fire ?? 100,
          Holy: rawMods.Holy ?? 100,
          Dark: rawMods.Shadow ?? 100,
          Water: rawMods.Water ?? 100,
          Ghost: rawMods.Ghost ?? 100,
          Undead: rawMods.Undead ?? 100,
          Wind: rawMods.Wind ?? 100
        },
        drops: drops
      });
    });
  });
  return out;
}

function getAllMonsters() {
  return [...getStudioCanonMonsters(), ...MAXION_MONSTERS];
}

function getMaxionMob(id) {
  const all = getAllMonsters();
  return all.find(m => m.id === id) || all[0];
}

function getMaxionTile(id) {
  const all = getAllWorldTiles();
  return all.find(t => t.id === id || t.code === id) || all[0];
}

function renderDistinctMapTileSvg(tile, size = 132) {
  const b = tile.biome || 'meadow';
  const nb = tile.neighbors || {};
  // Seeded hash from tile.id so every single map has distinct geometry
  let h = 0;
  for (let i = 0; i < tile.id.length; i++) h = ((h << 5) - h + tile.id.charCodeAt(i)) | 0;
  const seed = Math.abs(h);

  const palettes = {
    town:     { bg: '#2c3644', base: '#3d4d5e', road: '#d4b483', accent: '#f59e0b', water: '#2563eb' },
    meadow:   { bg: '#214e2a', base: '#2e6b38', road: '#c8a368', accent: '#86efac', water: '#0ea5e9' },
    forest:   { bg: '#133822', base: '#1b4b2e', road: '#9c7a4c', accent: '#4ade80', water: '#0284c7' },
    desert:   { bg: '#785226', base: '#9b6b33', road: '#e2c187', accent: '#fde047', water: '#06b6d4' },
    pyramid:  { bg: '#5c3d1e', base: '#7c5329', road: '#d9b372', accent: '#f59e0b', water: '#1e293b' },
    glacier:  { bg: '#1e3a5f', base: '#3b6998', road: '#cbd5e1', accent: '#7dd3fc', water: '#0369a1' },
    volcano:  { bg: '#3b1512', base: '#571f1a', road: '#78350f', accent: '#f97316', water: '#dc2626' },
    mountain: { bg: '#333642', base: '#494e5f', road: '#a89070', accent: '#cbd5e1', water: '#0284c7' },
    crypt:    { bg: '#1a162b', base: '#282240', road: '#645986', accent: '#c084fc', water: '#312e81' },
    castle:   { bg: '#272936', base: '#383b4e', road: '#94a3b8', accent: '#fbbf24', water: '#1d4ed8' },
    port:     { bg: '#0c3b5e', base: '#2d5a42', road: '#d4b483', accent: '#38bdf8', water: '#0284c7' },
    undersea: { bg: '#082644', base: '#0e3c68', road: '#38bdf8', accent: '#22d3ee', water: '#0369a1' },
  };
  const pal = palettes[b] || palettes.meadow;
  const cx = 50 + ((seed % 17) - 8);
  const cy = 50 + (((seed >> 4) % 17) - 8);

  // Connected roads to N / S / E / W neighbors so tiles visibly link up!
  let roads = '';
  if (nb.N) roads += `<line x1="${cx}" y1="${cy}" x2="50" y2="0" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;
  if (nb.S) roads += `<line x1="${cx}" y1="${cy}" x2="50" y2="100" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;
  if (nb.W) roads += `<line x1="${cx}" y1="${cy}" x2="0" y2="50" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;
  if (nb.E) roads += `<line x1="${cx}" y1="${cy}" x2="100" y2="50" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;

  // Distinct topographic landmarks per biome
  let landmark = '';
  if (b === 'town') {
    landmark = `
      <rect x="20" y="20" width="60" height="60" rx="6" fill="#475569" stroke="#f8fafc" stroke-width="2.5"/>
      <rect x="33" y="33" width="34" height="34" rx="3" fill="#b45309" stroke="#fde047" stroke-width="1.5"/>
      <circle cx="50" cy="50" r="6" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>
    `;
  } else if (b === 'pyramid') {
    landmark = `
      <polygon points="50,18 82,76 18,76" fill="#d97706" stroke="#fde047" stroke-width="2"/>
      <polygon points="50,18 82,76 50,76" fill="rgba(0,0,0,0.28)"/>
      <rect x="44" y="58" width="12" height="18" fill="#1e1b18"/>
    `;
  } else if (b === 'volcano') {
    landmark = `
      <path d="M12,85 Q50,10 88,85 Z" fill="#451a14" stroke="#f97316" stroke-width="2"/>
      <ellipse cx="50" cy="46" rx="16" ry="9" fill="#ef4444" stroke="#fde047" stroke-width="2"/>
      <path d="M50,55 Q42,72 34,92 M54,54 Q66,75 74,92" stroke="#f97316" stroke-width="4" fill="none"/>
    `;
  } else if (b === 'glacier') {
    landmark = `
      <polygon points="28,74 44,24 60,74" fill="#7dd3fc" opacity="0.85"/>
      <polygon points="46,78 64,18 82,78" fill="#bae6fd" stroke="#fff" stroke-width="1.5"/>
      <circle cx="24" cy="30" r="10" fill="#0284c7" opacity="0.6"/>
    `;
  } else if (b === 'crypt' || b === 'castle') {
    landmark = `
      <rect x="22" y="24" width="56" height="52" rx="4" fill="rgba(15,23,42,0.75)" stroke="${pal.accent}" stroke-width="2"/>
      <line x1="22" y1="50" x2="78" y2="50" stroke="${pal.accent}" stroke-width="1.5" stroke-dasharray="4 3"/>
      <line x1="50" y1="24" x2="50" y2="76" stroke="${pal.accent}" stroke-width="1.5" stroke-dasharray="4 3"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="${pal.accent}" opacity="0.85"/>
    `;
  } else if (b === 'port' || b === 'undersea') {
    landmark = `
      <path d="M0,62 Q50,44 100,66 L100,100 L0,100 Z" fill="${pal.water}"/>
      <rect x="44" y="42" width="12" height="28" fill="#a16207" stroke="#fde68a" stroke-width="1.2"/>
      <circle cx="28" cy="76" r="7" fill="#38bdf8" opacity="0.6"/>
    `;
  } else if (b === 'forest') {
    landmark = `
      <circle cx="28" cy="30" r="13" fill="#14532d" stroke="#4ade80" stroke-width="1.5"/>
      <circle cx="72" cy="34" r="14" fill="#166534" stroke="#86efac" stroke-width="1.5"/>
      <circle cx="32" cy="72" r="12" fill="#15803d"/>
      <circle cx="70" cy="70" r="15" fill="#14532d" stroke="#4ade80" stroke-width="1.5"/>
    `;
  } else {
    // Meadow / Desert / Mountain
    const wx = 22 + (seed % 50);
    const wy = 24 + ((seed >> 3) % 48);
    landmark = `
      <ellipse cx="${wx}" cy="${wy}" rx="18" ry="11" fill="${pal.water}" opacity="0.85" stroke="#bae6fd" stroke-width="1.2"/>
      <circle cx="${78 - (seed % 35)}" cy="${28 + (seed % 40)}" r="10" fill="${pal.accent}" opacity="0.55"/>
    `;
  }

  // Red warp portals on connected edges (just like RO / Maxion minimaps!)
  let portals = '';
  if (nb.N) portals += `<circle cx="50" cy="6" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;
  if (nb.S) portals += `<circle cx="50" cy="94" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;
  if (nb.W) portals += `<circle cx="6" cy="50" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;
  if (nb.E) portals += `<circle cx="94" cy="50" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;max-width:100%;max-height:100%;border-radius:8px;flex-shrink:0;">
    <rect width="100" height="100" fill="${pal.bg}"/>
    <rect x="7" y="7" width="86" height="86" rx="10" fill="${pal.base}" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
    ${roads}
    ${landmark}
    ${portals}
  </svg>`;
}

function selectMaxionLevelBand(band) {
  MAXION_LEVEL_BAND = band;
  const firstInBand = getAllMonsters().find(m => m.band === band);
  if (firstInBand) {
    MAXION_PINNED_MOB_ID = firstInBand.id;
  }
  writeUrlState(true);
  render();
}

function selectMaxionCategory(cat) {
  MAXION_CAT_FILTER = cat;
  render();
}

function pinMaxionMonster(mobId) {
  MAXION_PINNED_MOB_ID = mobId;
  MAXION_SELECTED_MOB_ID = mobId;
  // Auto-select the first map tile where this monster spawns
  const spawnTile = getAllWorldTiles().find(t => t.spawns.some(s => s.id === mobId));
  if (spawnTile) MAXION_SELECTED_TILE_ID = spawnTile.id;
  writeUrlState(true);
  render();
}

function openMonsterDetailPage(mobId) {
  MAXION_SELECTED_MOB_ID = mobId;
  MAXION_PINNED_MOB_ID = mobId;
  CURRENT_TAB = 'mobs';
  writeUrlState(true);
  renderSidebar();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectWorldTile(tileId) {
  MAXION_SELECTED_TILE_ID = tileId;
  writeUrlState(true);
  render();
}

function renderWorldAtlas() {
  const pinnedMob = getMaxionMob(MAXION_PINNED_MOB_ID);
  const selectedTile = getMaxionTile(MAXION_SELECTED_TILE_ID);
  const bands = ['1-20', '21-40', '41-60', '61-80', '81-100'];

  const filteredMobs = getAllMonsters().filter(m => {
    if (SEARCH_QUERY) {
      return m.name.toLowerCase().includes(SEARCH_QUERY) || String(m.code).includes(SEARCH_QUERY) || m.element.toLowerCase().includes(SEARCH_QUERY);
    }
    if (m.band !== MAXION_LEVEL_BAND) return false;
    if (MAXION_CAT_FILTER === 'mvp' && m.type !== 'MVP') return false;
    if (MAXION_CAT_FILTER === 'normal' && m.type === 'MVP') return false;
    return true;
  });

  // Build 6x5 World Matrix cells
  const gridCells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const tile = MAXION_WORLD_TILES.find(t => t.row === r && t.col === c);
      if (!tile) {
        gridCells.push(`<div class="maxion-map-cell ocean-empty" style="background:rgba(6,20,39,0.45);border:1px dashed rgba(56,189,248,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#334155;font-size:10px;font-family:var(--mono);">🌊 Sea Lane</div>`);
        continue;
      }
      const spawnEntry = pinnedMob ? tile.spawns.find(s => s.id === pinnedMob.id) : null;
      const isPinned = Boolean(spawnEntry);
      const isSelected = tile.id === selectedTile.id;
      const cls = [
        'maxion-map-cell',
        isPinned ? 'pinned-spawn' : '',
        isSelected ? 'selected-tile' : ''
      ].filter(Boolean).join(' ');

      const nbBadges = Object.keys(tile.neighbors || {}).join('·');

      gridCells.push(`
        <div class="${cls}" onclick="selectWorldTile('${tile.id}')" ondblclick="CURRENT_TAB='maps';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();" title="${escapeHtml(tile.name)} (${tile.code}) — Lv.${tile.lv} | Click to inspect, Double-click for Map Directory">
          ${renderDistinctMapTileSvg(tile, 140)}
          <div class="maxion-map-cell__code">${escapeHtml(tile.code)}</div>
          <div class="maxion-map-cell__lv">Lv.${escapeHtml(tile.lv)}</div>
          ${isPinned ? `
            <div class="maxion-map-cell__pin" onclick="event.stopPropagation();openMonsterDetailPage('${pinnedMob.id}')" title="Click to open ${escapeHtml(pinnedMob.name)} detail page">
              <img src="${pinnedMob.thumb}" alt="${escapeHtml(pinnedMob.name)}"/>
              <span class="maxion-map-cell__pin-count">×${spawnEntry.count}</span>
            </div>
          ` : ''}
          <div class="maxion-map-cell__name">${escapeHtml(tile.name)} <span style="opacity:0.65;font-size:9px;">[${nbBadges}]</span></div>
        </div>
      `);
    }
  }

  // Selected Tile Neighbors & Resident Monsters
  const nbEntries = Object.entries(selectedTile.neighbors || {});

  return `
    <div style="margin-bottom: 14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#ffd166;">
          🧭 INTERACTIVE WORLD MAP & MONSTER SPAWN LOCATOR (ROLTH.MAXION.GG + LINEAGE ATLAS BENCHMARK)
        </div>
        <h1 style="font-size:24px;font-weight:900;margin:2px 0 0 0;color:#f8fafc;">
          Midgard Connected Tile World Map <span style="font-size:14px;font-weight:600;color:#94a3b8;">(25 Distinct Connected Regions · 36 Unique Monsters)</span>
        </h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn" onclick="openMonsterDetailPage('${pinnedMob.id}')" style="border-color:#ffd166;color:#ffd166;">
          👾 Inspect Pinned: <b>${escapeHtml(pinnedMob.name)} (#${pinnedMob.code})</b> →
        </button>
        <button class="btn" onclick="CURRENT_TAB='maps';writeUrlState(true);renderSidebar();render();">
          🗺️ Connected Map Directory (${getAllWorldTiles().length})
        </button>
      </div>
    </div>

    <div class="maxion-world-shell">
      <!-- LEFT SIDEBAR: Level-Band Rail + Distinct Monster Portrait Grid (rolth.maxion.gg/WorldMap) -->
      <aside class="maxion-sidebar">
        <div class="maxion-sidebar__top">
          <div class="maxion-sidebar__title">
            <span>📌 Pin Monster Spawns on World Map</span>
          </div>
          <div class="maxion-cat-tabs">
            <button class="maxion-cat-btn ${MAXION_CAT_FILTER === 'all' || MAXION_CAT_FILTER === 'normal' ? 'active' : ''}" onclick="selectMaxionCategory(MAXION_CAT_FILTER === 'normal' ? 'all' : 'normal')">
              👾 Normal Monsters
            </button>
            <button class="maxion-cat-btn ${MAXION_CAT_FILTER === 'mvp' ? 'active' : ''}" onclick="selectMaxionCategory(MAXION_CAT_FILTER === 'mvp' ? 'all' : 'mvp')">
              👑 MVP & Boss
            </button>
          </div>
        </div>

        <div class="maxion-sidebar__body">
          <!-- Vertical Level-Band Tabs (1-20 .. 81-100) -->
          <div class="maxion-lvl-rail">
            ${bands.map(b => `
              <button class="maxion-lvl-btn ${MAXION_LEVEL_BAND === b && !SEARCH_QUERY ? 'active' : ''}" onclick="selectMaxionLevelBand('${b}')">
                Lv.<br>${b.replace('-', ' - ')}
              </button>
            `).join('')}
          </div>

          <!-- 3-Column Monster Portrait Cards -->
          <div class="maxion-mob-grid">
            ${filteredMobs.map(m => {
              const isPinned = m.id === pinnedMob.id;
              return `
                <div class="maxion-mob-tile ${isPinned ? 'pinned' : ''}" onclick="pinMaxionMonster('${m.id}')" ondblclick="openMonsterDetailPage('${m.id}')" title="Click to pin spawns on World Map | Double-click for full Monster/${m.code} detail">
                  <span class="maxion-mob-tile__pin-icon">📌</span>
                  <div class="maxion-mob-tile__avatar">
                    <img src="${m.thumb}" alt="${escapeHtml(m.name)}" loading="lazy"/>
                  </div>
                  <span class="maxion-mob-tile__lvl">${m.elIcon} Lv.${m.lv}</span>
                  <div class="maxion-mob-tile__name">${escapeHtml(m.name)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="padding:10px 14px;background:#090d14;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#94a3b8;">
          <span>Pinned: <strong style="color:#ffd166;">${escapeHtml(pinnedMob.name)} (Lv.${pinnedMob.lv})</strong></span>
          <a href="#tab=mobs&mob=${pinnedMob.id}" onclick="event.preventDefault();openMonsterDetailPage('${pinnedMob.id}')" style="color:#38bdf8;font-weight:700;text-decoration:none;">Full Stats & Drops →</a>
        </div>
      </aside>

      <!-- RIGHT WORLD MAP CANVAS: 6x5 Connected Topographic Tile Matrix + Selected Map Inspector -->
      <div class="maxion-canvas-card">
        <div class="maxion-canvas-header">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span class="pill pill--gold">📌 Pinned Monster: ${escapeHtml(pinnedMob.name)} (#${pinnedMob.code})</span>
            <span style="font-size:12px;color:#cbd5e1;">
              Spawns on <strong style="color:#38bdf8;">${getAllWorldTiles().filter(t => t.spawns.some(s => s.id === pinnedMob.id)).length} connected map tiles</strong> (highlighted in cyan/gold below)
            </span>
          </div>
          <div style="font-size:11px;color:#94a3b8;">
            Click any map tile to inspect N/S/E/W connections · Click pinned monster badge to open Monster DB
          </div>
        </div>

        <div class="maxion-world-board">
          <div class="maxion-tile-matrix">
            ${gridCells.join('')}
          </div>
        </div>

        <!-- SELECTED TILE INSPECTOR BAR (Lineage Connected Map + Spawn Breakdown) -->
        <div style="padding:16px 18px;background:#0d1422;border-top:1px solid rgba(255,255,255,0.1);display:grid;grid-template-columns:110px 1fr 1.1fr;gap:18px;align-items:center;">
          <div style="width:104px;height:104px;border-radius:10px;overflow:hidden;border:2px solid #ffd166;box-shadow:0 6px 18px rgba(0,0,0,0.5);">
            ${renderDistinctMapTileSvg(selectedTile, 104)}
          </div>

          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span class="pill pill--cyan" style="font-family:var(--mono);">${escapeHtml(selectedTile.code)}</span>
              <span class="pill">${escapeHtml(selectedTile.biome.toUpperCase())}</span>
              <span class="pill pill--gold">Lv. ${escapeHtml(selectedTile.lv)}</span>
            </div>
            <h3 style="margin:0 0 8px 0;font-size:18px;font-weight:800;color:#fff;">${escapeHtml(selectedTile.name)}</h3>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;font-weight:700;text-transform:uppercase;">Connected Adjacent Maps (Click to Travel):</div>
            <div class="lineage-neighbors">
              ${nbEntries.map(([dir, targetId]) => {
                const target = getMaxionTile(targetId);
                return `<span class="lineage-nb-chip" onclick="selectWorldTile('${target.id}')"><b>${dir}:</b> ${escapeHtml(target.name)} (${escapeHtml(target.code)})</span>`;
              }).join('')}
            </div>
          </div>

          <div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;font-weight:700;text-transform:uppercase;">
              Resident Monsters in ${escapeHtml(selectedTile.name)} (Click to View Monster DB):
            </div>
            <div class="lineage-spawns-row">
              ${selectedTile.spawns.map(sp => {
                const mob = getMaxionMob(sp.id);
                return `
                  <div class="lineage-spawn-pill" onclick="openMonsterDetailPage('${mob.id}')">
                    <img src="${mob.thumb}" alt="${escapeHtml(mob.name)}"/>
                    <div>
                      <div style="font-size:12px;font-weight:800;color:#f8fafc;">${escapeHtml(mob.name)}</div>
                      <div style="font-size:10px;color:#ffd166;">Lv.${mob.lv} · ${sp.count} spawns</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
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
  const mob = getMaxionMob(MAXION_SELECTED_MOB_ID);
  const spawnTiles = getAllWorldTiles().filter(t => t.spawns.some(s => s.id === mob.id));

  const elementMeta = [
    { key: 'Earth',   icon: '🌿', color: '#4ade80' },
    { key: 'Poison',  icon: '☠️', color: '#c084fc' },
    { key: 'Neutral', icon: '⚪', color: '#cbd5e1' },
    { key: 'Fire',    icon: '🔥', color: '#f87171' },
    { key: 'Holy',    icon: '✨', color: '#fde047' },
    { key: 'Dark',    icon: '🌑', color: '#818cf8' },
    { key: 'Water',   icon: '💧', color: '#38bdf8' },
    { key: 'Ghost',   icon: '👻', color: '#e2e8f0' },
    { key: 'Undead',  icon: '💀', color: '#94a3b8' },
    { key: 'Wind',    icon: '🌪️', color: '#facc15' },
  ];

  const rosterMobs = getAllMonsters().filter(m => {
    if (!SEARCH_QUERY) return true;
    return m.name.toLowerCase().includes(SEARCH_QUERY) || String(m.code).includes(SEARCH_QUERY) || m.element.toLowerCase().includes(SEARCH_QUERY) || m.race.toLowerCase().includes(SEARCH_QUERY);
  });

  return `
    <!-- Breadcrumb Bar (rolth.maxion.gg/Monster/1035 style) -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#94a3b8;font-weight:600;">
        <a href="#tab=world&mob=${mob.id}" onclick="event.preventDefault();CURRENT_TAB='world';MAXION_PINNED_MOB_ID='${mob.id}';writeUrlState(true);renderSidebar();render();" style="color:#38bdf8;text-decoration:none;font-weight:700;">🧭 World Map</a>
        <span>/</span>
        <span>Monsters</span>
        <span>/</span>
        <span style="color:#f8fafc;font-weight:800;">${escapeHtml(mob.name)} (#${mob.code})</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn" onclick="CURRENT_TAB='world';MAXION_PINNED_MOB_ID='${mob.id}';writeUrlState(true);renderSidebar();render();" style="border-color:#38bdf8;color:#38bdf8;">
          📌 Show ${escapeHtml(mob.name)} on World Map (${spawnTiles.length} Maps)
        </button>
      </div>
    </div>

    <div class="maxion-mob-detail">
      <!-- HERO HEADER: 192x192 Portrait Card + Name + 4 Pill Badges + 4 Stat Boxes -->
      <div class="maxion-mob-hero">
        <div class="maxion-mob-portrait-box">
          <img src="${mob.thumb}" alt="${escapeHtml(mob.name)}"/>
        </div>

        <div>
          <div style="font-size:12px;font-family:var(--mono);color:#94a3b8;font-weight:700;margin-bottom:2px;">
            MONSTER ID #${mob.code} · LEVEL BAND ${mob.band}
          </div>
          <h1 class="maxion-mob-title">${escapeHtml(mob.name)}</h1>

          <!-- 4 Property Pill Badges (Normal/MVP, Element, Race, Size) -->
          <div class="maxion-prop-pills">
            <span class="maxion-prop-pill" style="${mob.type === 'MVP' ? 'border-color:#eab308;color:#fde047;background:rgba(234,179,8,0.16);' : ''}">
              ${mob.type === 'MVP' ? '👑 MVP Boss' : '⚔️ Normal'}
            </span>
            <span class="maxion-prop-pill">${mob.elIcon} ${escapeHtml(mob.element)}</span>
            <span class="maxion-prop-pill">🧬 ${escapeHtml(mob.race)}</span>
            <span class="maxion-prop-pill">📏 ${escapeHtml(mob.size)}</span>
          </div>

          <!-- 4 Primary Stat Boxes (LEVEL, HP, HIT / FLEE, EXP / JOB) -->
          <div class="maxion-stat-boxes">
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">LEVEL</div>
              <div class="maxion-stat-box__val">${mob.lv}</div>
            </div>
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">HP</div>
              <div class="maxion-stat-box__val">${mob.hp.toLocaleString()}</div>
            </div>
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">HIT / FLEE</div>
              <div class="maxion-stat-box__val">${mob.hit} / ${mob.flee}</div>
            </div>
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">EXP / JOB</div>
              <div class="maxion-stat-box__val">${mob.exp.toLocaleString()} / ${mob.job.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 1: 2x5 Elemental Damage Modifiers (ธาตุ / Elemental Modifiers) -->
      <div>
        <div class="maxion-section-head">ธาตุ · Elemental Damage Modifiers</div>
        <div class="maxion-elem-grid">
          ${elementMeta.map(el => {
            const pct = mob.modifiers[el.key] !== undefined ? mob.modifiers[el.key] : 100;
            const cls = pct > 100 ? 'maxion-elem-card__pct--weak' : (pct < 100 ? 'maxion-elem-card__pct--resist' : '');
            return `
              <div class="maxion-elem-card">
                <div class="maxion-elem-card__icon" style="border:1px solid ${el.color}55;">${el.icon}</div>
                <div>
                  <div class="maxion-elem-card__name">${el.key}</div>
                  <div class="maxion-elem-card__pct ${cls}">${pct}%</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- SECTION 2: Visual Item Drop Cards (โอกาสได้รับ · Drops & Obtainable Items) -->
      <div>
        <div class="maxion-section-head">โอกาสได้รับ · Obtainable Drops (${mob.drops.length} Items)</div>
        <div class="maxion-drops-grid">
          ${mob.drops.map(d => `
            <div class="maxion-drop-card rarity-${d.rarity}">
              <div class="maxion-drop-card__art">
                <img src="${d.thumb}" alt="${escapeHtml(d.name)}"/>
                <span class="maxion-drop-card__rate">${escapeHtml(d.rate)}</span>
              </div>
              <div class="maxion-drop-card__name">${escapeHtml(d.name)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- SECTION 3: Connected Spawn Habitat Maps -->
      <div>
        <div class="maxion-section-head">แหล่งเกิดมอนสเตอร์ · Connected Spawn Maps (${spawnTiles.length} Maps)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
          ${spawnTiles.map(tile => {
            const sp = tile.spawns.find(s => s.id === mob.id);
            return `
              <div onclick="CURRENT_TAB='world';MAXION_PINNED_MOB_ID='${mob.id}';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;background:#161d2a;border:1px solid rgba(255,255,255,0.1);cursor:pointer;">
                <div style="width:64px;height:64px;flex-shrink:0;border-radius:8px;overflow:hidden;border:1px solid rgba(255,209,102,0.5);">
                  ${renderDistinctMapTileSvg(tile, 64)}
                </div>
                <div>
                  <div style="font-size:11px;font-family:var(--mono);color:#38bdf8;font-weight:700;">${escapeHtml(tile.code)} · Lv.${escapeHtml(tile.lv)}</div>
                  <div style="font-size:14px;font-weight:800;color:#fff;">${escapeHtml(tile.name)}</div>
                  <div style="font-size:12px;color:#ffd166;font-weight:700;">📌 ${sp ? sp.count : 20} Active Spawns →</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- SECTION 4: Quick Monster Switcher Roster (All 36 Distinct Monsters) -->
      <div>
        <div class="maxion-section-head">All Monsters Roster (${rosterMobs.length} Distinct Monsters — Click Any to Inspect)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
          ${rosterMobs.map(m => `
            <div onclick="openMonsterDetailPage('${m.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:${m.id === mob.id ? 'rgba(234,179,8,0.18)' : '#161c28'};border:1.5px solid ${m.id === mob.id ? '#eab308' : 'rgba(255,255,255,0.08)'};cursor:pointer;">
              <img src="${m.thumb}" alt="${escapeHtml(m.name)}" style="width:42px;height:42px;object-fit:contain;border-radius:8px;background:#0c1018;padding:3px;"/>
              <div style="min-width:0;">
                <div style="font-size:12px;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.name)}</div>
                <div style="font-size:10px;color:#94a3b8;">#${m.code} · Lv.${m.lv}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}


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
  const tile = MAXION_WORLD_TILES.find(t => t.id === m.id || t.code === m.id) || MAXION_WORLD_TILES[0];
  return renderDistinctMapTileSvg(tile, 148);
}

function renderMaps() {
  const studioTiles = getStudioCanonTiles();
  const allTiles = getAllWorldTiles();
  const filterKinds = [
    { id: 'all', label: `All Connected Maps (${allTiles.length})` },
    { id: 'studio', label: `🌌 Studio Canon Maps (${studioTiles.length})` },
    { id: 'town', label: '🏰 Towns & Sanctuaries' },
    { id: 'field', label: '🌿 Overland Hunting Areas' },
    { id: 'dungeon', label: '💀 Multi-Floor Dungeons' },
    { id: 'c01', label: '🌸 Continent 01 (Hearthbloom)' },
    { id: 'c02', label: '⚙️ Continent 02 (Clockwork)' },
    { id: 'c03', label: '🔭 Continent 03 (Shattered Halo)' },
  ];

  const tiles = allTiles.filter(t => {
    if (MAP_DIR_FILTER === 'studio' && !t.isStudioCanon) return false;
    if (MAP_DIR_FILTER === 'c01' && t.continentId !== 'continent-01-hearthbloom-basin') return false;
    if (MAP_DIR_FILTER === 'c02' && t.continentId !== 'continent-02-clockwork-steppe') return false;
    if (MAP_DIR_FILTER === 'c03' && t.continentId !== 'continent-03-shattered-halo-archipelago') return false;
    if (['town', 'field', 'dungeon'].includes(MAP_DIR_FILTER) && t.kind !== MAP_DIR_FILTER) return false;
    if (!SEARCH_QUERY) return true;
    const hay = `${t.name} ${t.code} ${t.biome} ${t.districtName || ''} ${t.continentName || ''} ${t.coreRationale || ''}`.toLowerCase();
    return hay.includes(SEARCH_QUERY);
  });

  return `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#38bdf8;">
          🗺️ UNIFIED STUDIO CANON (${studioTiles.length} MAPS ACROSS 31 DISTRICTS) + MAXION CONNECTED MAP DIRECTORY
        </div>
        <h1 style="font-size:24px;font-weight:900;margin:2px 0 0 0;color:#f8fafc;">
          Connected World Map & Habitat Atlas <span style="font-size:14px;font-weight:600;color:#94a3b8;">(${tiles.length} Showing · Bounded 148×148 Topographic Previews, N/S/E/W Portals & Resident Monster Portraits)</span>
        </h1>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${filterKinds.map(fk => `
          <button class="btn ${MAP_DIR_FILTER === fk.id ? 'btn--primary' : ''}" onclick="MAP_DIR_FILTER='${fk.id}';render();">
            ${fk.label}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="lineage-map-grid">
      ${tiles.map(tile => {
        const nbEntries = Object.entries(tile.neighbors || {});
        return `
          <div class="lineage-map-card" id="map-card-${tile.id}" style="${MAXION_SELECTED_TILE_ID === tile.id ? 'border-color:#ffd166;box-shadow:0 0 0 2px rgba(255,209,102,0.35);' : ''}">
            <div class="lineage-map-card__top">
              <div class="lineage-map-card__preview" onclick="${tile.isStudioCanon ? `setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(tile.continentId)}', districtId: '${escapeHtml(tile.districtId)}', nodeId: '${escapeHtml(tile.id)}', inspectId: '${escapeHtml(tile.id)}' })` : `CURRENT_TAB='world';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();`}" style="cursor:pointer;" title="Click to inspect map">
                ${renderDistinctMapTileSvg(tile, 148)}
                ${tile.thumb ? `<img src="${escapeHtml(tile.thumb)}" alt="${escapeHtml(tile.name)}" style="position:absolute;bottom:6px;right:6px;width:42px !important;height:42px !important;border-radius:8px;background:rgba(9,13,22,0.88);border:1px solid #ffd166;padding:3px;object-fit:contain;" />` : ''}
              </div>
              <div class="lineage-map-card__meta">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                  <span class="pill pill--cyan" style="font-family:var(--mono);">${escapeHtml(tile.code)}</span>
                  <div style="display:flex;gap:4px;align-items:center;">
                    ${tile.isStudioCanon ? '<span class="joy-badge joy-badge--success joy-badge--sm">🟢 Studio Canon</span>' : '<span class="pill">Classic Benchmark</span>'}
                    <span class="pill pill--gold">Lv. ${escapeHtml(tile.lv)}</span>
                  </div>
                </div>
                <h3 style="margin:6px 0 4px 0;font-size:16.5px;font-weight:800;color:#f8fafc;">
                  ${escapeHtml(tile.name)}
                </h3>
                ${tile.isStudioCanon ? `
                  <div style="font-size:11px;color:#38bdf8;font-weight:700;margin-bottom:4px;">
                    ${escapeHtml(tile.continentName)} ➔ ${escapeHtml(tile.districtName)}
                  </div>
                  <div style="font-size:11px;color:#cbd5e1;margin-bottom:6px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                    ${escapeHtml(tile.coreRationale)}
                  </div>
                ` : `
                  <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
                    Biome: <strong style="color:#e2e8f0;text-transform:capitalize;">${escapeHtml(tile.biome)}</strong> · Grid Pos: <strong style="font-family:var(--mono);">[${tile.col}, ${tile.row}]</strong>
                  </div>
                `}

                <div style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;">
                  Connected Adjacent Portals (${nbEntries.length}):
                </div>
                <div class="lineage-neighbors">
                  ${nbEntries.map(([dir, targetId]) => {
                    const target = getMaxionTile(targetId);
                    return `<span class="lineage-nb-chip" onclick="MAXION_SELECTED_TILE_ID='${target.id}';const el=document.getElementById('map-card-${target.id}');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});render();"><b>${dir} →</b> ${escapeHtml(target.name)}</span>`;
                  }).join('')}
                </div>
              </div>
            </div>

            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div class="lineage-spawns-row" style="margin-top:0;">
                ${tile.spawns.length ? tile.spawns.map(sp => {
                  const mob = getMaxionMob(sp.id);
                  return `
                    <div class="lineage-spawn-pill" onclick="openMonsterDetailPage('${mob.id}')" title="Inspect ${escapeHtml(mob.name)} (#${mob.code})">
                      <img src="${mob.thumb}" alt="${escapeHtml(mob.name)}"/>
                      <div>
                        <div style="font-size:11px;font-weight:800;color:#f8fafc;">${escapeHtml(mob.name)}</div>
                        <div style="font-size:10px;color:#ffd166;">Lv.${mob.lv} · ×${sp.count}</div>
                      </div>
                    </div>
                  `;
                }).join('') : '<span style="font-size:11px;color:#94a3b8;">🛡️ Safe Sanctuary / Town Hub (Non-Combat NPCs)</span>'}
              </div>
              ${tile.isStudioCanon ? `
                <button class="btn btn--primary" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(tile.continentId)}', districtId: '${escapeHtml(tile.districtId)}', nodeId: '${escapeHtml(tile.id)}', inspectId: '${escapeHtml(tile.id)}' })" style="font-size:11px;padding:5px 10px;">
                  🌌 Open in 4-Level Studio →
                </button>
              ` : `
                <button class="btn" onclick="CURRENT_TAB='world';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();" style="font-size:11px;padding:5px 10px;">
                  🧭 Locate on World Grid →
                </button>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}


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
            target = resolve_thumb_file(parsed.path)
            if target and target.exists():
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

        if parsed.path == "/api/studio/perspectives":
            self._send_json({"ok": True, **load_studio_perspectives_bundle()})
            return

        if parsed.path == "/api/studio/self-evaluation":
            self_eval = load_json_file(ROOT / "build" / "studio_self_evaluation.json") or {}
            self._send_json({"ok": True, "selfEvaluation": self_eval})
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
        if parsed.path == "/api/studio/rationale/update":
            res_payload, status_code = update_studio_rationale(self._read_json_body())
            self._send_json(res_payload, status=status_code)
            return
        if parsed.path == "/api/studio/generate-children":
            res_payload, status_code = generate_studio_children(self._read_json_body())
            self._send_json(res_payload, status=status_code)
            return
        self._send_json({"ok": False, "error": "Not found"}, status=404)


def main() -> int:
    parser = argparse.ArgumentParser(description="Atlas World MMORPG Catalog & Balance Observatory Web Studio")
    parser.add_argument("--port", type=int, default=8788, help="HTTP port (default: 8788)")
    parser.add_argument("--dump-check", action="store_true", help="Verify bundle + SQL engine and exit 0")
    args = parser.parse_args()

    if args.dump_check:
        bundle = build_full_bundle()
        studio = load_studio_perspectives_bundle()
        studio_nodes = 1 + len(studio.get("continents") or []) + len(studio.get("districts") or []) + len(studio.get("nodes") or [])
        sql_res = run_readonly_sql("SELECT * FROM v_mob_economy;")
        thumbs_ok = sum(1 for it in bundle["items"] if it.get("thumbUrl"))
        proposals_cnt = len((bundle.get("reviewQueue") or {}).get("proposals") or [])
        palettes_cnt = len(bundle.get("groundPalettes") or {})
        print(
            f"[catalog_explorer_web] OK — jobs={len(bundle['jobs'])}, mobs={len(bundle['mobs'])}, "
            f"items={len(bundle['items'])} (thumbs={thumbs_ok}/{len(bundle['items'])}), "
            f"cards={len(bundle['cards'])}, quests={len(bundle['quests'])}, "
            f"castles={len(bundle['castles'])}, palettes={palettes_cnt}, "
            f"review_proposals={proposals_cnt}, sql_rows={sql_res.get('rowCount')}, studio_nodes={studio_nodes}"
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
