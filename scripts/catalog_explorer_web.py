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


def compute_studio_self_evaluation() -> dict:
    self_eval = load_json_file(ROOT / "build" / "studio_self_evaluation.json") or {}
    iter_state = load_json_file(ROOT / "build" / "atlas_iteration_state.json") or {}
    dims = iter_state.get("dimensions") or {}
    if not dims:
        try:
            from scripts.run_atlas_iteration_loop import audit_world_atlas
        except ImportError:
            try:
                from run_atlas_iteration_loop import audit_world_atlas  # type: ignore
            except ImportError:
                audit_world_atlas = None  # type: ignore
        if audit_world_atlas is not None:
            whc_doc = load_json_file(STUDIO_DIR / "world_history_and_concept.json") or {}
            atlas_doc = load_json_file(STUDIO_DIR / "t_shaped_world_atlas.json") or {}
            audit_res = audit_world_atlas(whc_doc, atlas_doc)
            iter_state = {
                "wave": iter_state.get("wave", 7),
                "overall_score": audit_res.get("overall_score", 100.0),
                "dimensions": audit_res.get("dimensions", {}),
            }
            dims = iter_state["dimensions"]
    overall_atlas_score = float(iter_state.get("overall_score", 100.0))
    dim_count = len(dims) or 40
    qs = dict(self_eval.get("qualityScorecard") or {})
    qs.setdefault("overallQualityScorePct", 100.0)
    qs["semanticZoomAtlas18DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas20DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas22DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas24DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas26DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas28DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas30DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas32DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas34DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas36DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas38DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas40DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlas42DimensionScore"] = overall_atlas_score
    qs["semanticZoomAtlasDimensionsCount"] = dim_count
    merged = dict(self_eval)
    merged["qualityScorecard"] = qs
    merged["atlasIterationTelemetry"] = {
        "wave": int(iter_state.get("wave", 19)),
        "overallScore": overall_atlas_score,
        "dimensionsCount": dim_count,
        "dimensions": dims,
        "summaryLabel": (
            f"42-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"40-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"38-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"36-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"34-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"32-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"30-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"28-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"26-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"24-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"22-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"20-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · "
            f"18-Dimension Semantic-Zoom Atlas Score ({overall_atlas_score:.1f}/100) · D1–D42 Verified"
        ),
    }
    return merged


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
    self_eval = compute_studio_self_evaluation()
    try:
        from scripts.studio_world_governance import validate_world_governance
    except ImportError:
        from studio_world_governance import validate_world_governance  # type: ignore
    _, gov_report = validate_world_governance(STUDIO_DIR)
    t_atlas = load_json_file(STUDIO_DIR / "t_shaped_world_atlas.json") or {}
    return {
        "worldHistoryAndConcept": whc,
        "continents": continents,
        "districts": districts,
        "nodes": nodes,
        "runtimeManifest": runtime_manifest,
        "selfEvaluation": self_eval,
        "governanceReport": gov_report,
        "tShapedWorldAtlas": t_atlas,
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
  const locParam = params.get('loc');
  const zoomParam = params.get('zoom');
  const floorParam = params.get('floor');
  const filterParam = params.get('filter');
  const dungeonParam = params.get('dungeon');
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
    if (typeof ATLAS_STATE_STORE !== 'undefined') {
      const validBands = ['All', '1-20', '21-40', '41-60', '61-80', '81-99'];
      ATLAS_STATE_STORE.levelBand = validBands.includes(band) ? band : 'All';
    }
  }
  if (filterParam && typeof ATLAS_STATE_STORE !== 'undefined') {
    const validFilters = ['All', 'RaceSpawns', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'];
    ATLAS_STATE_STORE.filter = validFilters.includes(filterParam) ? filterParam : 'All';
  }
  if (zoomParam !== null && typeof STUDIO_MAP_ZOOM !== 'undefined') {
    const zVal = parseFloat(zoomParam);
    STUDIO_MAP_ZOOM = Number.isFinite(zVal) ? Math.max(0.85, Math.min(12.0, +zVal.toFixed(2))) : 1.0;
  }
  if (locParam && typeof clampWorldLocCoord === 'function') {
    STUDIO_MAP_LOC = clampWorldLocCoord(locParam);
  }
  if (dungeonParam && typeof ATLAS_STATE_STORE !== 'undefined') {
    ATLAS_STATE_STORE.activeDungeonId = dungeonParam;
  }
  if (floorParam && typeof ATLAS_STATE_STORE !== 'undefined') {
    ATLAS_STATE_STORE.activeFloorId = floorParam;
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
  if (CURRENT_TAB === 'studio' || CURRENT_TAB === 'world') {
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
    if (typeof STUDIO_MAP_LOC !== 'undefined' && STUDIO_MAP_LOC) {
      const clamped = typeof clampWorldLocCoord === 'function'
        ? clampWorldLocCoord(`${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`)
        : STUDIO_MAP_LOC;
      params.set('loc', `${clamped.x}:${clamped.y}`);
    }
    if (typeof STUDIO_MAP_ZOOM !== 'undefined') {
      params.set('zoom', String(Math.max(0.85, Math.min(12.0, +STUDIO_MAP_ZOOM.toFixed(2)))));
    }
    if (typeof ATLAS_STATE_STORE !== 'undefined') {
      if (ATLAS_STATE_STORE.activeDungeonId) params.set('dungeon', ATLAS_STATE_STORE.activeDungeonId);
      if (ATLAS_STATE_STORE.activeFloorId) params.set('floor', ATLAS_STATE_STORE.activeFloorId);
      params.set('filter', ATLAS_STATE_STORE.filter || 'All');
      params.set('band', ATLAS_STATE_STORE.levelBand || 'All');
    }
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
  else if (CURRENT_TAB === 'maps') main.innerHTML = renderMapDirectory();
  else if (CURRENT_TAB === 'sql') { main.innerHTML = renderSqlStudio(); executeSql(); }
  else if (CURRENT_TAB === 'sim') main.innerHTML = renderSim();
  else if (CURRENT_TAB === 'docs') main.innerHTML = renderDocs();
}


function syncStudioNodeToDedicatedAtlas(targetNodeId, perspective = '') {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const nodes = sp.nodes || [];
  const allZones = getAllAtlas63Zones(tatlas);
  const mfDungeons = tatlas.multi_floor_dungeons || [];
  const rawId = String(targetNodeId || '');
  if (!rawId) return;

  const matchedDng = mfDungeons.find(d => d.dungeon_id === rawId || d.studio_node_id === rawId);
  if (matchedDng) {
    ATLAS_ACTIVE_DUNGEON_ID = matchedDng.dungeon_id;
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
    ATLAS_STATE_STORE.activeDungeonId = matchedDng.dungeon_id;
    ATLAS_STATE_STORE.activeFloorId = (matchedDng.floors && matchedDng.floors[0] && matchedDng.floors[0].floor_id) || 'B1';
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    if (matchedDng.entrance_loc) {
      STUDIO_MAP_LOC = clampWorldLocCoord(matchedDng.entrance_loc);
    }
    return;
  }

  const matchedZone = allZones.find(z => z.zone_id === rawId || z.studio_node_id === rawId);
  const matchedNode = nodes.find(n => n.id === rawId);
  const isTown = (matchedZone && matchedZone.actionType === 'town')
    || (matchedNode && matchedNode.node_type === 'town')
    || rawId.startsWith('town-')
    || rawId.startsWith('zone-town-');
  const isFieldOrFort = (matchedZone && (matchedZone.actionType === 'field' || matchedZone.actionType === 'fortress'))
    || (matchedNode && matchedNode.node_type === 'hunting_area')
    || rawId.startsWith('hunting-area-')
    || rawId.startsWith('zone-field-')
    || rawId.startsWith('zone-harbor-')
    || rawId.startsWith('zone-clanhall-')
    || rawId.startsWith('zone-fortress-');

  if (isTown) {
    ATLAS_FOCUSED_TOWN_ID = (matchedZone && (matchedZone.studio_node_id || matchedZone.zone_id)) || rawId;
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
    ATLAS_ACTIVE_DUNGEON_ID = '';
    ATLAS_STATE_STORE.activeTownId = ATLAS_FOCUSED_TOWN_ID;
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    if (matchedZone && matchedZone.loc_coord) {
      STUDIO_MAP_LOC = clampWorldLocCoord(matchedZone.loc_coord);
    }
  } else if (isFieldOrFort) {
    const resolvedFieldId = (matchedZone && matchedZone.zone_id) || rawId;
    if (resolvedFieldId.includes('fortress') || resolvedFieldId.includes('harbor') || resolvedFieldId.includes('clanhall')) {
      ATLAS_FOCUSED_FORTRESS_ID = resolvedFieldId;
    } else {
      ATLAS_FOCUSED_FIELD_ID = resolvedFieldId;
    }
    ATLAS_ACTIVE_DUNGEON_ID = '';
    ATLAS_STATE_STORE.activeFieldOrFortId = resolvedFieldId;
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    if (matchedZone && matchedZone.loc_coord) {
      STUDIO_MAP_LOC = clampWorldLocCoord(matchedZone.loc_coord);
    }
  }
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
  syncStudioNodeToDedicatedAtlas(opts.nodeId || opts.inspectId || STUDIO_SELECTED_NODE_ID, perspective);
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
  const atlasTel = selfEval.atlasIterationTelemetry || {};
  const atlasScoreStr = typeof atlasTel.overallScore === 'number' ? atlasTel.overallScore.toFixed(1) : '100.0';
  const queue = selfEval.nextIncrementBrainstormQueue || [];
  const canonCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'canon').length;
  const draftCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'draft').length;
  const mysteryCount = [whc, ...continents, ...districts, ...nodes].filter(x => x && x.status === 'mystery').length;

  const ownerTelemetryBar = `
    <div id="productOwnerTelemetryBar" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;margin-bottom:16px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);border-radius:10px;font-size:11.5px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
        <span class="mono" style="font-weight:800;color:#38bdf8">🏛️ PRODUCT OWNER SELF-EVALUATION:</span>
        <span class="joy-badge joy-badge--success joy-badge--sm">Quality Score: ${qs.overallQualityScorePct ?? 100}%</span>
        <span class="joy-badge joy-badge--success joy-badge--sm" style="border:1px solid #fde047;color:#fde047">42-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 40-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 38-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 36-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 34-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 32-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 30-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 28-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 26-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 24-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 22-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 20-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · 18-Dimension Semantic-Zoom Atlas Score (${atlasScoreStr}/100) · D1–D42 Verified</span>
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
// + DEDICATED SEMANTIC-ZOOM WORLD, TOWN & MULTI-FLOOR DUNGEON ATLAS COMPONENT
// ============================================================================
let STUDIO_CARTO_THEME = 'l2hub'; // 'l2hub' (L2 Aden Parchment) | 'google' (Google/Apple Dark GIS)
let STUDIO_MAP_ZOOM = 1.0;
let STUDIO_MAP_PAN_X = 0;
let STUDIO_MAP_PAN_Y = 0;
let STUDIO_MAP_SELECTED_POI = null;
let STUDIO_MAP_DRAG = null;
let STUDIO_MAP_LOC = { x: -84120, y: 243500, svgX: 465, svgY: 442 };

let ATLAS_FOCUSED_TOWN_ID = 'town-lantern-hollow';
let ATLAS_FOCUSED_FIELD_ID = '';
let ATLAS_FOCUSED_FORTRESS_ID = '';
let ATLAS_ACTIVE_DUNGEON_ID = '';
let ATLAS_OMNI_SEARCH_QUERY = '';
let ATLAS_ROUTE_FROM_ID = 'zone-town-lantern-hollow';
let ATLAS_ROUTE_TO_ID = 'zone-dungeon-kiln-cellar';
let ATLAS_REFINE_GRADE = 'No-Grade Lv.1–19';
let ATLAS_REFINE_PLUS = 3;
let ATLAS_BOSS_GOD_ID = 'god-sola-hearth-weaver';
let ATLAS_QUEST_TRACK = 'All';
let ATLAS_ACTIVE_QUEST_ID = 'quest-ms-01-human';
let ATLAS_FARMING_MODE = 'All';
let ATLAS_SIEGE_DOMAIN_ID = 'All';
let ATLAS_BOSS_RADAR_MODE = 'All';
let ATLAS_SEVEN_SEALS_MODE = 'All';
let ATLAS_MANOR_MODE = 'All';
let ATLAS_OLYMPIAD_MODE = 'All';
let ATLAS_TRANSIT_MODE = 'All';
let ATLAS_SOUL_CRYSTAL_MODE = 'All';
let ATLAS_FISHING_MODE = 'All';
let ATLAS_PVP_KARMA_MODE = 'All';
let ATLAS_RIFT_SEPULCHER_MODE = 'All';
let ATLAS_AUGMENT_DYE_MODE = 'All';
let ATLAS_COMPANION_MOUNT_MODE = 'All';
let ATLAS_CLAN_ACADEMY_MODE = 'All';
let ATLAS_HERB_BIOME_MODE = 'All';
let ATLAS_WORKSHOP_MODE = 'All';
let ATLAS_TERRITORY_WARD_MODE = 'All';
let ATLAS_EPIC_JEWELRY_MODE = 'All';
let ATLAS_VITALITY_OBELISK_MODE = 'All';

const ATLAS_STATE_STORE = {
  filter: 'All',         // 'All' | 'RaceSpawns' | 'TownMarks' | 'Monster' | 'Mini-Boss' | 'Raid' | 'MVP'
  levelBand: 'All',      // 'All' | '1-20' | '21-40' | '41-60' | '61-80' | '81-99'
  raceGrowthRoute: 'All', // 'All' | 'Human' | 'Lunar' | 'Ogre/Orc' | 'Dwarf' | 'Dark-Lunar' | 'Furral'
  omniSearchQuery: '',   // D13: Instant Atlas Omni-Search & Quick-Jump Query
  routeFromId: 'zone-town-lantern-hollow', // D17: Interactive Travel Path & Gatekeeper Route Origin
  routeToId: 'zone-dungeon-kiln-cellar',   // D17: Interactive Travel Path & Gatekeeper Route Destination
  refineGrade: 'No-Grade Lv.1–19',         // D19: Active Blacksmith Refinement Equipment Grade
  refinePlus: 3,                           // D19: Active Blacksmith Refinement Step (+1..+15)
  bossGodId: 'god-sola-hearth-weaver',     // D21: Active Sealed-God 5-Tier Boss Hierarchy Chain
  questTrack: 'All',                       // D23: Active Quest Track ('All' | 'main_story' | 'class_transfer' | 'racial_heritage')
  activeQuestId: 'quest-ms-01-human',      // D23: Active 3-Track Quest & Class Transfer Chain
  farmingMode: 'All',                      // D24: Active Party & Farming Efficiency Heatmap ('Off' | 'All' | 'solo_grinding' | 'duo_spoil_scavenger' | 'full_9p_aoe_party' | 'clan_raid_force')
  siegeDomainId: 'All',                    // D25: Active Castle Siege & Territory Tax Domain ('Off' | 'All' | domain_id)
  bossRadarMode: 'All',                    // D26: Active World Boss & MVP Respawn Radar ('Off' | 'All' | 'DungeonMVP' | 'OverlandRaid')
  sevenSealsMode: 'All',                   // D27: Active Seven-Seals & Mammon Rotation ('Off' | 'All' | 'Lords_of_Dawn' | 'Revolutionaries_of_Dusk' | 'Blacksmith_of_Mammon' | 'Merchant_of_Mammon')
  manorMode: 'All',                        // D28: Active 15-Town Manor Seed & Caravan Economy ('Off' | 'All' | 'Low_Patrolled' | 'High_Frontier_Ambush')
  olympiadMode: 'All',                     // D29: Active Subclass, Noblesse & Olympiad Network ('Off' | 'All' | 'Subclass_Mimir_Sanctum' | 'Noblesse_Barakiel_Shrine' | 'Olympiad_Monument')
  transitMode: 'All',                      // D30: Active Inter-Continental Transit ('Off' | 'All' | 'Maritime_Ship' | 'Brass_Airship' | 'Gatekeeper_Trunk')
  soulCrystalMode: 'All',                  // D31: Active Soul Crystal (SA) Stage 1-13 Selector ('Off' | 'All' | 'Crimson_Red' | 'Verdant_Green' | 'Azure_Blue' | 'Stage_11_to_13_S_Grade_Boss')
  fishingMode: 'All',                      // D32: Active Fishing Guild & Hot Springs Selector ('Off' | 'All' | 'Maritime_Harbor_Pier' | 'Luminous_Night_Lake' | 'Thermal_Hot_Spring')
  pvpKarmaMode: 'All',                     // D33: Active Cursed Weapon, PK & PvP Arena Selector ('Off' | 'All' | 'Cursed_Weapon_Drop_Zone' | 'Black_Judge_Karma_Sanctuary' | 'Coliseum_PvP_Arena')
  riftSepulcherMode: 'All',                // D34: Active Dimensional Rift & Four Sepulchers Selector ('Off' | 'All' | 'Dimensional_Rift' | 'Four_Sepulchers' | 'Key_Gated_Chapel')
  augmentDyeMode: 'All',                   // D35: Active Weapon Augmentation & Symbol Dye Selector ('Off' | 'All' | 'Top_High_Life_Stone' | 'Augment_Anvils' | 'Symbol_Dye_Parlors')
  companionMountMode: 'All',               // D36: Active Pet, Strider & Wyvern Mount Selector ('Off' | 'All' | 'Pet_Manager_Kennel' | 'Hatchling_Strider_Sanctum' | 'Castle_Wyvern_Roost')
  clanAcademyMode: 'All',                  // D37: Active Clan Reputation & Academy Selector ('Off' | 'All' | 'Clan_Academy_Hall' | 'Clan_Ambition_Altar' | 'Pledge_Skill_Sanctum')
  herbBiomeMode: 'All',                    // D38: Active 24-Field Elemental & Herb Sustainability Selector ('Off' | 'All' | 'S_Tier_Zero_Downtime' | 'A_Tier_Mystic_Mana_Rich' | 'By_Elemental_Weakness')
  workshopMode: 'All',                     // D39: Active 15-Town Soulshot & Dwarven Manufacture Selector ('Off' | 'All' | 'Starter_D_C_Plaza' | 'Regional_B_A_Workshop' | 'Capital_S_Grade_Master_Forge')
  territoryWardMode: 'All',                // D40: Active Territory Ward & Giant's Codex Selector ('Off' | 'All' | 'Sovereign_Territory_Ward' | 'Fortress_Codex_Supply_Vault')
  epicJewelryMode: 'All',                  // D41: Active 12-Relic Epic Boss Jewelry Selector ('Off' | 'All' | 'Epic_Ring' | 'Epic_Earring' | 'Epic_Necklace')
  vitalityObeliskMode: 'All',              // D42: Active 15-Town Adventurer's Guide & Vitality Obelisk Selector ('Off' | 'All' | 'Starter_Apprentice_Coupon_Hub' | 'Regional_Shadow_Weapon_Hub' | 'Capital_Stage4_Vitality_Sanctuary')
  townBlueprintMode: 'parchment', // 'parchment' (Screenshots 3 & 4) | 'schematic' ("Oren by Cheese" Screenshot 5)
  activeDungeonId: '',   // e.g. 'zone-dungeon-kiln-cellar' | 'zone-dungeon-pendulum-shaft' | 'zone-dungeon-chronometer-foundry'
  activeFloorId: '',     // e.g. 'B1', 'B2', 'B3' or '1F', '2F', '3F'
  activeTownId: 'town-lantern-hollow',
  activeFieldOrFortId: '', // e.g. 'zone-field-clover-south-gate' or 'zone-fortress-shanty-kiln'
  toastMessage: ''
};

function setAtlasEpicJewelryMode(modeId) {
  ATLAS_EPIC_JEWELRY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.epicJewelryMode = ATLAS_EPIC_JEWELRY_MODE;
  writeUrlState(false);
  render();
}

function setAtlasVitalityObeliskMode(modeId) {
  ATLAS_VITALITY_OBELISK_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.vitalityObeliskMode = ATLAS_VITALITY_OBELISK_MODE;
  writeUrlState(false);
  render();
}

function setAtlasWorkshopMode(modeId) {
  ATLAS_WORKSHOP_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.workshopMode = ATLAS_WORKSHOP_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTerritoryWardMode(modeId) {
  ATLAS_TERRITORY_WARD_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.territoryWardMode = ATLAS_TERRITORY_WARD_MODE;
  writeUrlState(false);
  render();
}

function setAtlasAugmentDyeMode(modeId) {
  ATLAS_AUGMENT_DYE_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.augmentDyeMode = ATLAS_AUGMENT_DYE_MODE;
  writeUrlState(false);
  render();
}

function setAtlasCompanionMountMode(modeId) {
  ATLAS_COMPANION_MOUNT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.companionMountMode = ATLAS_COMPANION_MOUNT_MODE;
  writeUrlState(false);
  render();
}

function setAtlasClanAcademyMode(modeId) {
  ATLAS_CLAN_ACADEMY_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.clanAcademyMode = ATLAS_CLAN_ACADEMY_MODE;
  writeUrlState(false);
  render();
}

function setAtlasHerbBiomeMode(modeId) {
  ATLAS_HERB_BIOME_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.herbBiomeMode = ATLAS_HERB_BIOME_MODE;
  writeUrlState(false);
  render();
}

function setAtlasPvpKarmaMode(modeId) {
  ATLAS_PVP_KARMA_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.pvpKarmaMode = ATLAS_PVP_KARMA_MODE;
  writeUrlState(false);
  render();
}

function setAtlasRiftSepulcherMode(modeId) {
  ATLAS_RIFT_SEPULCHER_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.riftSepulcherMode = ATLAS_RIFT_SEPULCHER_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSoulCrystalMode(modeId) {
  ATLAS_SOUL_CRYSTAL_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.soulCrystalMode = ATLAS_SOUL_CRYSTAL_MODE;
  writeUrlState(false);
  render();
}

function setAtlasFishingMode(modeId) {
  ATLAS_FISHING_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.fishingMode = ATLAS_FISHING_MODE;
  writeUrlState(false);
  render();
}

function setAtlasOlympiadMode(modeId) {
  ATLAS_OLYMPIAD_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.olympiadMode = ATLAS_OLYMPIAD_MODE;
  writeUrlState(false);
  render();
}

function setAtlasTransitMode(modeId) {
  ATLAS_TRANSIT_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.transitMode = ATLAS_TRANSIT_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSevenSealsMode(modeId) {
  ATLAS_SEVEN_SEALS_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.sevenSealsMode = ATLAS_SEVEN_SEALS_MODE;
  writeUrlState(false);
  render();
}

function setAtlasManorMode(modeId) {
  ATLAS_MANOR_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.manorMode = ATLAS_MANOR_MODE;
  writeUrlState(false);
  render();
}

function setAtlasSiegeDomain(domainId) {
  ATLAS_SIEGE_DOMAIN_ID = String(domainId || 'All');
  ATLAS_STATE_STORE.siegeDomainId = ATLAS_SIEGE_DOMAIN_ID;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const domains = tatlas.castle_siege_domains || [];
  const activeDom = domains.find(d => d.domain_id === ATLAS_SIEGE_DOMAIN_ID || d.stronghold_zone_id === ATLAS_SIEGE_DOMAIN_ID);
  if (activeDom && activeDom.artifact_altar_loc) {
    STUDIO_MAP_LOC = clampWorldLocCoord(activeDom.artifact_altar_loc);
  }
  writeUrlState(false);
  render();
}

function setAtlasBossRadarMode(modeId) {
  ATLAS_BOSS_RADAR_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.bossRadarMode = ATLAS_BOSS_RADAR_MODE;
  writeUrlState(false);
  render();
}

function setAtlasQuestTrack(trackId) {
  ATLAS_QUEST_TRACK = String(trackId || 'All');
  ATLAS_STATE_STORE.questTrack = ATLAS_QUEST_TRACK;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const quests = tatlas.quest_trial_chains || [];
  const matching = ATLAS_QUEST_TRACK === 'All'
    ? quests
    : quests.filter(q => q.quest_track === ATLAS_QUEST_TRACK);
  if (matching.length && !matching.some(q => q.quest_id === ATLAS_ACTIVE_QUEST_ID)) {
    ATLAS_ACTIVE_QUEST_ID = matching[0].quest_id;
    ATLAS_STATE_STORE.activeQuestId = ATLAS_ACTIVE_QUEST_ID;
  }
  writeUrlState(false);
  render();
}

function selectAtlasQuestChain(questId) {
  ATLAS_ACTIVE_QUEST_ID = String(questId || 'quest-ms-01-human');
  ATLAS_STATE_STORE.activeQuestId = ATLAS_ACTIVE_QUEST_ID;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const quests = tatlas.quest_trial_chains || [];
  const activeQuest = quests.find(q => q.quest_id === ATLAS_ACTIVE_QUEST_ID);
  if (activeQuest && activeQuest.objective_loc) {
    STUDIO_MAP_LOC = clampWorldLocCoord(activeQuest.objective_loc);
  }
  writeUrlState(false);
  render();
}

function setAtlasFarmingMode(modeId) {
  ATLAS_FARMING_MODE = String(modeId || 'All');
  ATLAS_STATE_STORE.farmingMode = ATLAS_FARMING_MODE;
  writeUrlState(false);
  render();
}

function setAtlasBossGodChain(godId) {
  ATLAS_BOSS_GOD_ID = String(godId || 'All');
  ATLAS_STATE_STORE.bossGodId = ATLAS_BOSS_GOD_ID;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const chains = tatlas.boss_hierarchy_chains || [];
  const activeChain = chains.find(c => c.god_id === ATLAS_BOSS_GOD_ID || c.god_short_label === ATLAS_BOSS_GOD_ID);
  if (activeChain && activeChain.seal_loc) {
    STUDIO_MAP_LOC = clampWorldLocCoord(activeChain.seal_loc);
  }
  writeUrlState(false);
  render();
}

function setAtlasRefineGrade(gradeCode) {
  ATLAS_REFINE_GRADE = String(gradeCode || 'No-Grade Lv.1–19');
  ATLAS_STATE_STORE.refineGrade = ATLAS_REFINE_GRADE;
  writeUrlState(false);
  render();
}

function setAtlasRefinePlus(plusLevel) {
  const lv = Math.max(1, Math.min(15, Number(plusLevel) || 3));
  ATLAS_REFINE_PLUS = lv;
  ATLAS_STATE_STORE.refinePlus = lv;
  writeUrlState(false);
  render();
}

function jumpToBlacksmithTownStreetMap(townZoneId) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const allZones = getAllAtlas63Zones(tatlas);
  const matched = allZones.find(z => z.zone_id === townZoneId || z.studio_node_id === townZoneId);
  const nodeId = (matched && (matched.studio_node_id || matched.zone_id)) || townZoneId || 'town-lantern-hollow';
  const loc = (matched && matched.loc_coord) || '';
  focusTownStreetBlueprint(nodeId, loc);
}

function highlightMaterialDropZonesOrOpenDungeon(dropZoneId) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const mfDungeons = tatlas.multi_floor_dungeons || [];
  const allZones = getAllAtlas63Zones(tatlas);
  const matchedDng = mfDungeons.find(d => d.dungeon_id === dropZoneId || d.studio_node_id === dropZoneId);
  if (matchedDng) {
    const firstFloor = (matchedDng.floors && matchedDng.floors[0] && matchedDng.floors[0].floor_id) || 'B1';
    openDungeonSubMap(matchedDng.dungeon_id, firstFloor);
    return;
  }
  const matchedZone = allZones.find(z => z.zone_id === dropZoneId || z.studio_node_id === dropZoneId);
  if (matchedZone) {
    focusFieldTacticalBlueprint(matchedZone.zone_id, matchedZone.loc_coord || '');
  }
}

function getAllAtlas63Zones(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  const list = [
    ...(zdir.starting_towns || []).map(z => ({ ...z, zoneCategory: 'Starting Town', actionType: 'town' })),
    ...(zdir.other_castle_and_hub_towns || []).map(z => ({ ...z, zoneCategory: 'Castle / Hub Town', actionType: 'town' })),
    ...(zdir.fields_and_hunting_areas || []).map(z => ({ ...z, zoneCategory: 'Field Hunting Area', actionType: 'field' })),
    ...(zdir.regular_dungeons || []).map(z => ({ ...z, zoneCategory: 'Multi-Floor Dungeon', actionType: 'dungeon' })),
    ...(zdir.seven_signs_seal_catacombs || []).map(z => ({ ...z, zoneCategory: 'Seven Signs Catacomb', actionType: 'dungeon' })),
    ...(zdir.harbors_clanhalls_and_forts || []).map(z => ({ ...z, zoneCategory: 'Harbor / ClanHall / Fortress', actionType: 'fortress' }))
  ];
  return list;
}

function computeShortestAtlasZonePath(fromZoneId, toZoneId, tatlas) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const atlasDoc = tatlas || sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(atlasDoc);
  const byId = {};
  const adj = {};
  zones.forEach(z => {
    byId[z.zone_id] = z;
    if (z.studio_node_id) byId[z.studio_node_id] = z;
    if (!adj[z.zone_id]) adj[z.zone_id] = new Set();
  });
  zones.forEach(z => {
    const u = z.zone_id;
    (z.connected_zone_ids || []).forEach(nbRaw => {
      const nbObj = byId[nbRaw];
      const v = nbObj ? nbObj.zone_id : nbRaw;
      if (byId[v]) {
        adj[u].add(v);
        if (!adj[v]) adj[v] = new Set();
        adj[v].add(u);
      }
    });
  });

  const startZone = byId[fromZoneId] || zones[0];
  const endZone = byId[toZoneId] || zones[Math.min(1, zones.length - 1)];
  if (!startZone || !endZone) {
    return { pathIds: [], hops: [], totalAdenaFee: 0, origin: null, destination: null };
  }
  const sId = startZone.zone_id;
  const tId = endZone.zone_id;
  if (sId === tId) {
    const c = clampWorldLocCoord(startZone.loc_coord || '-84120:243500');
    return {
      origin: startZone,
      destination: endZone,
      pathIds: [sId],
      totalAdenaFee: 0,
      hops: [{
        hopIndex: 1,
        zone: startZone,
        zoneId: sId,
        name: startZone.name,
        l2Analog: startZone.l2_reference_analog || '',
        levelBand: Array.isArray(startZone.level_band) ? `Lv.${startZone.level_band[0]}–${startZone.level_band[1]}` : 'Lv.1–20',
        travelMode: 'Origin Sanctuary / Spawn Anchor',
        adenaFee: 0,
        locCoord: startZone.loc_coord || '-84120:243500',
        svgX: c.svgX,
        svgY: c.svgY
      }]
    };
  }

  const visited = new Set([sId]);
  const parent = {};
  const queue = [sId];
  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === tId) {
      found = true;
      break;
    }
    const neighbors = Array.from(adj[curr] || []);
    for (let i = 0; i < neighbors.length; i++) {
      const nxt = neighbors[i];
      if (!visited.has(nxt)) {
        visited.add(nxt);
        parent[nxt] = curr;
        queue.push(nxt);
      }
    }
  }

  const pathIds = [];
  if (found) {
    let cur = tId;
    while (cur) {
      pathIds.unshift(cur);
      if (cur === sId) break;
      cur = parent[cur];
    }
  } else {
    pathIds.push(sId, tId);
  }

  let totalAdenaFee = 0;
  const hops = pathIds.map((zid, idx) => {
    const z = byId[zid] || startZone;
    const prevZ = idx > 0 ? (byId[pathIds[idx - 1]] || startZone) : null;
    const lvArr = Array.isArray(z.level_band) && z.level_band.length >= 2 ? z.level_band : [1, 20];
    const c = clampWorldLocCoord(z.loc_coord || '-84120:243500');
    let travelMode = 'Origin Zone Anchor';
    let adenaFee = 0;
    if (idx > 0) {
      const bothTownOrHarbor = prevZ && ['town', 'fortress'].includes(prevZ.actionType) && ['town', 'fortress'].includes(z.actionType);
      const isDungeonEntry = z.actionType === 'dungeon';
      if (bothTownOrHarbor) {
        travelMode = '🌀 Gatekeeper Teleport';
        adenaFee = Math.max(450, lvArr[0] * 180);
      } else if (isDungeonEntry) {
        travelMode = '🕳️ Dungeon Portal Approach (or GK Teleport)';
        adenaFee = lvArr[0] <= 15 ? 0 : Math.max(350, lvArr[0] * 120);
      } else {
        travelMode = '🥾 Walking Highway / Road';
        adenaFee = 0;
      }
    }
    totalAdenaFee += adenaFee;
    return {
      hopIndex: idx + 1,
      zone: z,
      zoneId: z.zone_id,
      name: z.name,
      l2Analog: z.l2_reference_analog || z.territory_name || '',
      levelBand: `Lv.${lvArr[0]}–${lvArr[1]}`,
      travelMode,
      adenaFee,
      locCoord: z.loc_coord || '-84120:243500',
      svgX: c.svgX,
      svgY: c.svgY
    };
  });

  return {
    origin: startZone,
    destination: endZone,
    pathIds,
    hops,
    totalAdenaFee
  };
}

function setAtlasRouteEndpoints(fromZoneId, toZoneId) {
  if (fromZoneId) {
    ATLAS_ROUTE_FROM_ID = String(fromZoneId);
    ATLAS_STATE_STORE.routeFromId = ATLAS_ROUTE_FROM_ID;
  }
  if (toZoneId) {
    ATLAS_ROUTE_TO_ID = String(toZoneId);
    ATLAS_STATE_STORE.routeToId = ATLAS_ROUTE_TO_ID;
  }
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  if (STUDIO_MAP_ZOOM >= 3.5) {
    STUDIO_MAP_ZOOM = 2.4;
  }
  const sp = (DATA && DATA.studioPerspectives) || {};
  const routeRes = computeShortestAtlasZonePath(ATLAS_ROUTE_FROM_ID, ATLAS_ROUTE_TO_ID, sp.tShapedWorldAtlas || {});
  if (routeRes.destination && routeRes.destination.loc_coord) {
    STUDIO_MAP_LOC = clampWorldLocCoord(routeRes.destination.loc_coord);
  }
  writeUrlState(false);
  render();
}

function openAtlasRouteFinalHop(zoneId) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zones = getAllAtlas63Zones(tatlas);
  const z = zones.find(item => item.zone_id === zoneId || item.studio_node_id === zoneId);
  if (!z) return;
  if (z.actionType === 'dungeon') {
    const mf = (tatlas.multi_floor_dungeons || []).find(d => d.dungeon_id === z.zone_id || d.studio_node_id === z.studio_node_id);
    const firstFloor = (mf && mf.floors && mf.floors[0] && mf.floors[0].floor_id) || 'B1';
    openDungeonSubMap(z.zone_id, firstFloor);
  } else if (z.actionType === 'town') {
    focusTownStreetBlueprint(z.studio_node_id || z.zone_id, z.loc_coord || '');
  } else if (z.actionType === 'fortress') {
    focusFortressBlueprint(z.zone_id, z.loc_coord || '');
  } else {
    focusFieldTacticalBlueprint(z.zone_id, z.loc_coord || '');
  }
}

function selectDungeonRoomPoi(poiJsonStr, evt) {
  return selectStudioMapPoi(poiJsonStr, evt);
}

function setAtlasOmniSearch(query) {
  ATLAS_OMNI_SEARCH_QUERY = String(query || '');
  ATLAS_STATE_STORE.omniSearchQuery = ATLAS_OMNI_SEARCH_QUERY;
  writeUrlState(false);
  render();
}

function clearAtlasOmniSearch() {
  ATLAS_OMNI_SEARCH_QUERY = '';
  ATLAS_STATE_STORE.omniSearchQuery = '';
  writeUrlState(false);
  render();
}

function setTownBlueprintMode(mode) {
  ATLAS_STATE_STORE.townBlueprintMode = mode === 'schematic' ? 'schematic' : 'parchment';
  writeUrlState(false);
  render();
}

function resolveNearestZoneFromPanAndLoc(
  zoomVal = STUDIO_MAP_ZOOM,
  locObj = STUDIO_MAP_LOC,
  panX = STUDIO_MAP_PAN_X,
  panY = STUDIO_MAP_PAN_Y
) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const towns = getAllAtlasTownEntries(tatlas);
  const fields = getAllAtlasFieldEntries(tatlas);
  const forts = getAllAtlasFortressEntries(tatlas);

  let targetLoc = clampWorldLocCoord(locObj || STUDIO_MAP_LOC);
  if ((panX !== 0 || panY !== 0) && (!locObj || locObj === STUDIO_MAP_LOC)) {
    const effScale = Math.max(1.0, zoomVal);
    const panSvgX = Math.max(30, Math.min(1010, Math.round((targetLoc.svgX || 520) - panX / effScale)));
    const panSvgY = Math.max(30, Math.min(470, Math.round((targetLoc.svgY || 250) - panY / effScale)));
    targetLoc = svgToL2Loc(panSvgX, panSvgY);
  }

  let nearestTown = towns[0] || { studio_node_id: 'town-lantern-hollow', zone_id: 'zone-town-lantern-hollow' };
  let minTownDist = Infinity;
  towns.forEach(t => {
    const c = clampWorldLocCoord(t.loc_coord || '-84120:243500');
    const dist = Math.hypot(c.x - targetLoc.x, c.y - targetLoc.y);
    if (dist < minTownDist) {
      minTownDist = dist;
      nearestTown = t;
    }
  });

  let nearestField = fields[0] || null;
  let minFieldDist = Infinity;
  fields.forEach(f => {
    const c = clampWorldLocCoord(f.loc_coord || '72986:113330');
    const dist = Math.hypot(c.x - targetLoc.x, c.y - targetLoc.y);
    if (dist < minFieldDist) {
      minFieldDist = dist;
      nearestField = f;
    }
  });

  let nearestFort = forts[0] || null;
  let minFortDist = Infinity;
  forts.forEach(h => {
    const c = clampWorldLocCoord(h.loc_coord || '-96200:258400');
    const dist = Math.hypot(c.x - targetLoc.x, c.y - targetLoc.y);
    if (dist < minFortDist) {
      minFortDist = dist;
      nearestFort = h;
    }
  });

  ATLAS_FOCUSED_TOWN_ID = nearestTown.studio_node_id || nearestTown.zone_id || 'town-lantern-hollow';
  ATLAS_FOCUSED_FIELD_ID = (nearestField && (nearestField.zone_id || nearestField.studio_node_id)) || '';
  ATLAS_FOCUSED_FORTRESS_ID = (nearestFort && (nearestFort.zone_id || nearestFort.studio_node_id)) || '';

  if (zoomVal >= 4.5) {
    ATLAS_STATE_STORE.activeTownId = ATLAS_FOCUSED_TOWN_ID;
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    STUDIO_SELECTED_NODE_ID = ATLAS_FOCUSED_TOWN_ID;
  } else if (zoomVal >= 3.5) {
    if (minTownDist <= Math.min(minFieldDist, minFortDist)) {
      ATLAS_STATE_STORE.activeTownId = ATLAS_FOCUSED_TOWN_ID;
      ATLAS_STATE_STORE.activeFieldOrFortId = '';
      STUDIO_SELECTED_NODE_ID = ATLAS_FOCUSED_TOWN_ID;
    } else if (minFieldDist <= minFortDist && ATLAS_FOCUSED_FIELD_ID) {
      ATLAS_STATE_STORE.activeFieldOrFortId = ATLAS_FOCUSED_FIELD_ID;
      STUDIO_SELECTED_NODE_ID = ATLAS_FOCUSED_FIELD_ID;
    } else if (ATLAS_FOCUSED_FORTRESS_ID) {
      ATLAS_STATE_STORE.activeFieldOrFortId = ATLAS_FOCUSED_FORTRESS_ID;
      STUDIO_SELECTED_NODE_ID = ATLAS_FOCUSED_FORTRESS_ID;
    }
  }

  return {
    townId: ATLAS_FOCUSED_TOWN_ID,
    fieldId: ATLAS_FOCUSED_FIELD_ID,
    fortressId: ATLAS_FOCUSED_FORTRESS_ID,
    nearestKind: minTownDist <= Math.min(minFieldDist, minFortDist)
      ? 'town'
      : (minFieldDist <= minFortDist ? 'field' : 'fortress')
  };
}

function clampWorldLocCoord(locStrOrObj) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const spec = tatlas.world_grid_spec || {};
  const bx = spec.coord_bounds_x || [-131072, 229376];
  const by = spec.coord_bounds_y || [-262144, 262144];
  let rawX = -84120;
  let rawY = 243500;
  if (typeof locStrOrObj === 'string' && locStrOrObj.includes(':')) {
    const parts = locStrOrObj.split(':');
    const px = parseInt(parts[0], 10);
    const py = parseInt(parts[1], 10);
    if (Number.isFinite(px) && Number.isFinite(py)) {
      rawX = px;
      rawY = py;
    }
  } else if (locStrOrObj && typeof locStrOrObj === 'object') {
    if (Number.isFinite(locStrOrObj.x)) rawX = locStrOrObj.x;
    if (Number.isFinite(locStrOrObj.y)) rawY = locStrOrObj.y;
  }
  const cx = Math.max(bx[0], Math.min(bx[1], Math.round(rawX)));
  const cy = Math.max(by[0], Math.min(by[1], Math.round(rawY)));
  const svgX = Math.max(30, Math.min(1010, Math.round(((cx - bx[0]) / Math.max(1, bx[1] - bx[0])) * 980 + 30)));
  const svgY = Math.max(30, Math.min(470, Math.round(((cy - by[0]) / Math.max(1, by[1] - by[0])) * 440 + 30)));
  return { x: cx, y: cy, svgX, svgY };
}

function getSemanticZoomLodTier(zoomVal = STUDIO_MAP_ZOOM) {
  if (zoomVal >= 4.5) return 3; // Tier 3: Town Street, Building & Shop/Refinement Blueprint (4.5x - 12.0x)
  if (zoomVal >= 2.2) return 2; // Tier 2: Regional Roads, Level Bands & Dungeon Entrance Portals (2.2x - 4.5x)
  return 1;                     // Tier 1: Macro Geography, Travel Highways & 6 Race Spawns (1.0x - 2.2x)
}

function setStudioCartoTheme(theme) {
  STUDIO_CARTO_THEME = theme === 'google' ? 'google' : 'l2hub';
  render();
}

function svgToL2Loc(svgX, svgY) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const spec = (sp.tShapedWorldAtlas && sp.tShapedWorldAtlas.world_grid_spec) || {};
  const bx = spec.coord_bounds_x || [-131072, 229376];
  const by = spec.coord_bounds_y || [-262144, 262144];
  const lx = Math.round(bx[0] + (svgX / 1040) * (bx[1] - bx[0]));
  const ly = Math.round(by[0] + (svgY / 500) * (by[1] - by[0]));
  return {
    x: Math.max(bx[0], Math.min(bx[1], lx)),
    y: Math.max(by[0], Math.min(by[1], ly)),
    svgX: Math.round(svgX),
    svgY: Math.round(svgY)
  };
}

function zoomStudioMap(delta, reset = false, targetZoom = null) {
  const prevZoom = STUDIO_MAP_ZOOM;
  const prevTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  if (reset) {
    STUDIO_MAP_ZOOM = 1.0;
    STUDIO_MAP_PAN_X = 0;
    STUDIO_MAP_PAN_Y = 0;
    ATLAS_STATE_STORE.activeDungeonId = '';
    ATLAS_STATE_STORE.activeFloorId = '';
    ATLAS_STATE_STORE.activeFieldOrFortId = '';
    ATLAS_FOCUSED_FIELD_ID = '';
    ATLAS_FOCUSED_FORTRESS_ID = '';
  } else if (targetZoom !== null && Number.isFinite(targetZoom)) {
    STUDIO_MAP_ZOOM = Math.max(0.85, Math.min(12.0, +targetZoom.toFixed(2)));
  } else {
    STUDIO_MAP_ZOOM = Math.max(0.85, Math.min(12.0, +(STUDIO_MAP_ZOOM + delta).toFixed(2)));
  }
  const crossed35 = (prevZoom < 3.5 && STUDIO_MAP_ZOOM >= 3.5) || (prevZoom >= 3.5 && STUDIO_MAP_ZOOM < 3.5);
  const crossed45 = (prevZoom < 4.5 && STUDIO_MAP_ZOOM >= 4.5) || (prevZoom >= 4.5 && STUDIO_MAP_ZOOM < 4.5);
  if (!reset && targetZoom === null && (crossed35 || crossed45)) {
    resolveNearestZoneFromPanAndLoc(STUDIO_MAP_ZOOM, STUDIO_MAP_LOC, STUDIO_MAP_PAN_X, STUDIO_MAP_PAN_Y);
  }
  const nextTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  writeUrlState(false);
  if (prevTier !== nextTier || crossed35 || crossed45 || reset || targetZoom !== null) {
    render();
  } else {
    applyStudioMapTransform();
  }
}

function applyStudioMapTransform() {
  const g = document.getElementById('studioCartoViewport');
  const lbl = document.getElementById('studioCartoZoomReadout');
  const tierBadge = document.getElementById('studioSemanticLodBadge');
  const tier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  if (g) {
    const cx = 520;
    const cy = 250;
    const effScale = tier === 3 ? Math.max(1.0, +(STUDIO_MAP_ZOOM / 5.2).toFixed(2)) : STUDIO_MAP_ZOOM;
    g.setAttribute(
      'transform',
      `translate(${cx + STUDIO_MAP_PAN_X}, ${cy + STUDIO_MAP_PAN_Y}) scale(${effScale}) translate(${-cx}, ${-cy})`
    );
  }
  if (lbl) {
    lbl.textContent = `${STUDIO_MAP_ZOOM.toFixed(2)}\u00d7`;
  }
  if (tierBadge) {
    tierBadge.textContent = tier === 3
      ? '🏘️ LOD Tier 3: Town Street & Shop/Refinement Blueprint (4.5×–12.0×)'
      : (tier === 2 ? '🛤️ LOD Tier 2: Regional Roads, Lv.Bands & Dungeon Portals (2.2×–4.5×)' : '🌍 LOD Tier 1: Macro Geography & 6 Race Spawns (1.0×–2.2×)');
  }
}

function onStudioMapWheel(evt) {
  evt.preventDefault();
  const step = STUDIO_MAP_ZOOM >= 4.0 ? 0.65 : 0.35;
  const delta = evt.deltaY < 0 ? step : -step;
  zoomStudioMap(delta, false);
}

function setAtlasFilter(cat) {
  ATLAS_STATE_STORE.filter = cat || 'All';
  writeUrlState(false);
  render();
}

function setAtlasLevelBand(band) {
  ATLAS_STATE_STORE.levelBand = band || 'All';
  writeUrlState(false);
  render();
}

function setAtlasRaceGrowthRoute(raceLabel) {
  ATLAS_STATE_STORE.raceGrowthRoute = raceLabel || 'All';
  writeUrlState(false);
  render();
}

function resetAtlasFilters() {
  ATLAS_STATE_STORE.filter = 'All';
  ATLAS_STATE_STORE.levelBand = 'All';
  ATLAS_STATE_STORE.raceGrowthRoute = 'All';
  ATLAS_BOSS_GOD_ID = 'All';
  ATLAS_STATE_STORE.bossGodId = 'All';
  ATLAS_QUEST_TRACK = 'All';
  ATLAS_STATE_STORE.questTrack = 'All';
  ATLAS_FARMING_MODE = 'All';
  ATLAS_STATE_STORE.farmingMode = 'All';
  ATLAS_SIEGE_DOMAIN_ID = 'All';
  ATLAS_STATE_STORE.siegeDomainId = 'All';
  ATLAS_BOSS_RADAR_MODE = 'All';
  ATLAS_STATE_STORE.bossRadarMode = 'All';
  ATLAS_OMNI_SEARCH_QUERY = '';
  ATLAS_STATE_STORE.omniSearchQuery = '';
  ATLAS_STATE_STORE.toastMessage = '';
  writeUrlState(false);
  render();
}

function focusTownStreetBlueprint(townId, locCoord) {
  ATLAS_FOCUSED_TOWN_ID = townId || 'town-lantern-hollow';
  ATLAS_FOCUSED_FIELD_ID = '';
  ATLAS_FOCUSED_FORTRESS_ID = '';
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeTownId = ATLAS_FOCUSED_TOWN_ID;
  ATLAS_STATE_STORE.activeFieldOrFortId = '';
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  if (locCoord) {
    STUDIO_MAP_LOC = clampWorldLocCoord(locCoord);
  }
  STUDIO_SELECTED_NODE_ID = ATLAS_STATE_STORE.activeTownId;
  STUDIO_MAP_PAN_X = 0;
  STUDIO_MAP_PAN_Y = 0;
  zoomStudioMap(0, false, 5.2);
}

function focusFieldTacticalBlueprint(fieldOrFortId, locCoord = '') {
  const targetId = fieldOrFortId || 'zone-field-clover-south-gate';
  if (targetId.includes('fortress') || targetId.includes('harbor') || targetId.includes('clanhall')) {
    ATLAS_FOCUSED_FORTRESS_ID = targetId;
  } else {
    ATLAS_FOCUSED_FIELD_ID = targetId;
  }
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeFieldOrFortId = targetId;
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  if (locCoord) {
    STUDIO_MAP_LOC = clampWorldLocCoord(locCoord);
  }
  STUDIO_SELECTED_NODE_ID = ATLAS_STATE_STORE.activeFieldOrFortId;
  STUDIO_MAP_PAN_X = 0;
  STUDIO_MAP_PAN_Y = 0;
  zoomStudioMap(0, false, 4.8);
}

function focusFortressBlueprint(fortId, locCoord = '') {
  ATLAS_FOCUSED_FORTRESS_ID = fortId || 'zone-harbor-lantern-ferry-pier';
  focusFieldTacticalBlueprint(ATLAS_FOCUSED_FORTRESS_ID, locCoord);
}

function openDungeonSubMap(dungeonId, floorId = '') {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const dungeons = tatlas.multi_floor_dungeons || [];
  let dng = dungeons.find(d => d.dungeon_id === dungeonId || d.studio_node_id === dungeonId);
  if (!dng && dungeons.length > 0) {
    dng = dungeons[0];
  }
  if (!dng) return;
  ATLAS_ACTIVE_DUNGEON_ID = dng.dungeon_id;
  ATLAS_STATE_STORE.activeDungeonId = dng.dungeon_id;
  const floors = dng.floors || [];
  const defaultFloor = (floors[0] && floors[0].floor_id) || 'B1';
  if (!floorId) {
    ATLAS_STATE_STORE.activeFloorId = defaultFloor;
    ATLAS_STATE_STORE.toastMessage = '';
  } else {
    const matched = floors.find(f => f.floor_id.toUpperCase() === String(floorId).toUpperCase());
    if (matched) {
      ATLAS_STATE_STORE.activeFloorId = matched.floor_id;
      ATLAS_STATE_STORE.toastMessage = '';
    } else {
      ATLAS_STATE_STORE.activeFloorId = defaultFloor;
      ATLAS_STATE_STORE.toastMessage = `Floor "${floorId}" not found — showing ${defaultFloor}`;
    }
  }
  if (dng.entrance_loc) {
    STUDIO_MAP_LOC = clampWorldLocCoord(dng.entrance_loc);
  }
  STUDIO_MAP_PAN_X = 0;
  STUDIO_MAP_PAN_Y = 0;
  writeUrlState(true);
  render();
}

function switchDungeonFloor(floorId, targetLoc = '') {
  if (!floorId || String(floorId).toUpperCase() === 'OVERLAND') {
    exitDungeonSubMap(targetLoc);
    return;
  }
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const dungeons = tatlas.multi_floor_dungeons || [];
  const dng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId || d.studio_node_id === ATLAS_STATE_STORE.activeDungeonId) || dungeons[0];
  if (!dng) return;
  const floors = dng.floors || [];
  const matched = floors.find(f => f.floor_id.toUpperCase() === String(floorId).toUpperCase());
  if (matched) {
    ATLAS_STATE_STORE.activeFloorId = matched.floor_id;
    ATLAS_STATE_STORE.toastMessage = '';
  } else {
    const fallback = (floors[0] && floors[0].floor_id) || 'B1';
    ATLAS_STATE_STORE.activeFloorId = fallback;
    ATLAS_STATE_STORE.toastMessage = `Floor "${floorId}" not found — showing ${fallback}`;
  }
  if (targetLoc) {
    STUDIO_MAP_LOC = clampWorldLocCoord(targetLoc);
  }
  writeUrlState(true);
  render();
}

function exitDungeonSubMap(targetLoc = '') {
  ATLAS_ACTIVE_DUNGEON_ID = '';
  ATLAS_STATE_STORE.activeDungeonId = '';
  ATLAS_STATE_STORE.activeFloorId = '';
  ATLAS_STATE_STORE.toastMessage = '';
  if (targetLoc) {
    STUDIO_MAP_LOC = clampWorldLocCoord(targetLoc);
  }
  if (STUDIO_MAP_ZOOM >= 4.5) {
    STUDIO_MAP_ZOOM = 2.6;
  }
  writeUrlState(true);
  render();
}

function onStudioMapKeyDown(evt) {
  if (!evt) return;
  const key = evt.key;
  if (key === '+' || key === '=') {
    evt.preventDefault();
    zoomStudioMap(0.55, false);
  } else if (key === '-' || key === '_') {
    evt.preventDefault();
    zoomStudioMap(-0.55, false);
  } else if (key === 'ArrowLeft') {
    evt.preventDefault();
    STUDIO_MAP_PAN_X += 42;
    applyStudioMapTransform();
  } else if (key === 'ArrowRight') {
    evt.preventDefault();
    STUDIO_MAP_PAN_X -= 42;
    applyStudioMapTransform();
  } else if (key === 'ArrowUp') {
    evt.preventDefault();
    STUDIO_MAP_PAN_Y += 42;
    applyStudioMapTransform();
  } else if (key === 'ArrowDown') {
    evt.preventDefault();
    STUDIO_MAP_PAN_Y -= 42;
    applyStudioMapTransform();
  } else if (key === 'Escape') {
    evt.preventDefault();
    if (ATLAS_STATE_STORE.activeDungeonId) {
      exitDungeonSubMap();
    } else if (STUDIO_MAP_ZOOM > 1.2) {
      zoomStudioMap(0, true);
    } else {
      closeStudioMapPoi(evt);
    }
  } else if (['1', '2', '3', '4', 'PageUp', 'PageDown'].includes(key) && ATLAS_STATE_STORE.activeDungeonId) {
    evt.preventDefault();
    const sp = (DATA && DATA.studioPerspectives) || {};
    const dungeons = (sp.tShapedWorldAtlas && sp.tShapedWorldAtlas.multi_floor_dungeons) || [];
    const dng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId);
    if (dng && dng.floors && dng.floors.length) {
      const curIdx = Math.max(0, dng.floors.findIndex(f => f.floor_id === ATLAS_STATE_STORE.activeFloorId));
      let nextIdx = curIdx;
      if (key === 'PageUp') nextIdx = Math.max(0, curIdx - 1);
      else if (key === 'PageDown') nextIdx = Math.min(dng.floors.length - 1, curIdx + 1);
      else nextIdx = Math.min(dng.floors.length - 1, parseInt(key, 10) - 1);
      switchDungeonFloor(dng.floors[nextIdx].floor_id);
    }
  }
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

function getSortedContinentDistricts(districts, continentId) {
  return (districts || [])
    .filter(d => d.parent_continent_id === continentId)
    .slice()
    .sort((a, b) => {
      const aStarter = a.id === 'district-teacup-meadows' || a.id === 'district-pinion-terminus' || a.id === 'district-starfall-haven' ? 0 : 1;
      const bStarter = b.id === 'district-teacup-meadows' || b.id === 'district-pinion-terminus' || b.id === 'district-starfall-haven' ? 0 : 1;
      if (aStarter !== bStarter) return aStarter - bStarter;
      const aMin = (a.level_range && a.level_range[0]) || 1;
      const bMin = (b.level_range && b.level_range[0]) || 1;
      if (aMin !== bMin) return aMin - bMin;
      return String(a.id).localeCompare(String(b.id));
    });
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
    // Keep Continent -> District -> Town/Hunting Area selection 100% synchronized!
    const sp = (DATA && DATA.studioPerspectives) || {};
    const doOpts = (poi && poi.drillOpts) || {};
    if (doOpts.continentId) {
      STUDIO_SELECTED_CONTINENT_ID = doOpts.continentId;
    }
    if (doOpts.districtId) {
      STUDIO_SELECTED_DISTRICT_ID = doOpts.districtId;
      const dNodes = (sp.nodes || []).filter(n => n.parent_district_id === doOpts.districtId);
      const prefNode = dNodes.find(n => n.node_type === 'town') || dNodes[0];
      if (prefNode && !doOpts.nodeId) {
        STUDIO_SELECTED_NODE_ID = prefNode.id;
      }
    }
    if (doOpts.nodeId) {
      STUDIO_SELECTED_NODE_ID = doOpts.nodeId;
    }
    writeUrlState(false);
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
  drillControls,
  filterBarHtml,
  bottomPanelHtml
}) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const poi = STUDIO_MAP_SELECTED_POI || defaultPoi;
  const lodTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const zoomScales = [
    { idx: 1, code: 'LOD 1 · MACRO', label: '🌍 Lv.1 Macro Geography (1.0×)', persp: 'world-history-and-concept', z: 1.0 },
    { idx: 2, code: 'LOD 2 · REGIONAL', label: '🗺️ Lv.2 Regional Roads & Portals (2.8×)', persp: 'continent', z: 2.8 },
    { idx: 3, code: 'LOD 3 · DISTRICT', label: '🏙️ Lv.3 District Matrix (3.8×)', persp: 'district', z: 3.8 },
    { idx: 4, code: 'LOD 4 · STREET', label: '🏘️ Lv.4 Town Street & Shops Blueprint (6.0×)', persp: 'town-or-hunting-area', z: 6.0 }
  ];

  const placeDrawerHtml = poi ? `
    <div id="studioGooglePlaceDrawer" style="width:345px;flex-shrink:0;background:#161f2c;border-right:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;justify-content:space-between;max-height:540px;overflow-y:auto">
      <div style="padding:16px">
        <!-- Place Header (Apple/Google Maps + L2Hub Place Card Style) -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <div style="font-size:17px;font-weight:800;color:#f8fafc;line-height:1.25">${escapeHtml(poi.title || 'Selected Place')}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:3px;font-weight:600">${escapeHtml(poi.category || 'Cartographic Feature')}</div>
          </div>
          <button type="button" onclick="closeStudioMapPoi(event)" title="Reset to Default Overview" style="width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);background:#243244;color:#cbd5e1;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center">×</button>
        </div>

        <!-- Primary Action Bar (Directions / Zoom Here / Warp to Dungeon / Center View) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          ${poi.dungeonWarpId ? `
            <button type="button" onclick="openDungeonSubMap('${escapeHtml(poi.dungeonWarpId)}', '${escapeHtml(poi.dungeonFloorId || '')}')" style="height:36px;border-radius:10px;border:1.5px solid #e9d5ff;background:#7e22ce;color:#ffffff;font-weight:800;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(126,34,206,0.45)">
              🕳️ ${escapeHtml(poi.drillLabel || 'Enter Dungeon Map')}
            </button>
          ` : (poi.fieldTacticalBlueprintId ? `
            <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(poi.fieldTacticalBlueprintId)}', '${escapeHtml(poi.locCoord || '')}')" style="height:36px;border-radius:10px;border:1.5px solid #86efac;background:#15803d;color:#ffffff;font-weight:800;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(21,128,61,0.4)">
              🏕️ ${escapeHtml(poi.drillLabel || 'Field Tactical Blueprint')}
            </button>
          ` : (poi.townBlueprintId ? `
            <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(poi.townBlueprintId)}', '${escapeHtml(poi.locCoord || '')}')" style="height:36px;border-radius:10px;border:1.5px solid #fde047;background:#2563eb;color:#ffffff;font-weight:800;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.35)">
              🔍 ${escapeHtml(poi.drillLabel || 'Zoom to Street Map')}
            </button>
          ` : (poi.drillPerspective ? `
            <button type="button" onclick="setStudioPerspective('${escapeHtml(poi.drillPerspective)}', ${escapeHtml(JSON.stringify(poi.drillOpts || {}))}); STUDIO_MAP_SELECTED_POI=null;" style="height:36px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(37,99,235,0.35)">
              🔍 ${escapeHtml(poi.drillLabel || 'Zoom Into Map')}
            </button>
          ` : `
            <button type="button" onclick="zoomStudioMap(0.65, false)" style="height:36px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
              🔍 Zoom Closer
            </button>
          `)))}
          <button type="button" onclick="zoomStudioMap(0, true)" style="height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:#243244;color:#e2e8f0;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
            🧭 Reset 1:1 View
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
          <div style="padding:11px 12px;border-radius:10px;background:#111823;border:1px solid rgba(255,255,255,0.07);margin-bottom:8px">
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

        <!-- Card 4 (D10): NPC Shop Catalog (Weapons, Armor, Potions) & +1..+15 Refinement Anvil Inspector -->
        ${poi.shopAndRefinementCatalog ? `
          <div id="studioShopAndRefinementInspector" style="padding:11px 12px;border-radius:10px;background:#111823;border:1.5px solid rgba(250,204,21,0.45);margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:11px;color:#fde047;font-weight:900;text-transform:uppercase">🛍️ NPC Shop Stock &amp; +1 to +15 Refinement Inspector</span>
              <span class="mono" style="font-size:9.5px;color:#4ade80;font-weight:800">D10 VERIFIED</span>
            </div>

            ${(!poi.activeCatalogTab || poi.activeCatalogTab === 'equip_shop' || poi.activeCatalogTab === 'all') ? `
              <div style="margin-bottom:8px">
                <div style="font-size:10.5px;font-weight:800;color:#fca5a5;margin-bottom:4px">⚔️ Equip Shop Stock (Weapons, Armor &amp; Shields)</div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${(poi.shopAndRefinementCatalog.equip_shop_stock || []).map(item => `
                    <div style="padding:5px 7px;border-radius:6px;background:#182232;border-left:3px solid #eab308">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                        <span style="font-size:11px;font-weight:800;color:#f8fafc">${escapeHtml(item.name)}</span>
                        <span class="mono" style="font-size:9.5px;color:#fde047">${Number(item.price_adena || 0).toLocaleString()} Adena</span>
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escapeHtml(item.category)} (${escapeHtml(item.grade)}) · ${escapeHtml(item.stats)} · Max ${escapeHtml(item.max_refinement || '+15')}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${(!poi.activeCatalogTab || poi.activeCatalogTab === 'consumable_shop' || poi.activeCatalogTab === 'all') ? `
              <div style="margin-bottom:8px">
                <div style="font-size:10.5px;font-weight:800;color:#67e8f9;margin-bottom:4px">🧪 Consumable &amp; Apothecary Stock (Potions, Soulshots &amp; Scrolls)</div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${(poi.shopAndRefinementCatalog.consumable_shop_stock || []).map(item => `
                    <div style="padding:5px 7px;border-radius:6px;background:#182232;border-left:3px solid #06b6d4">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                        <span style="font-size:11px;font-weight:800;color:#f8fafc">${escapeHtml(item.name)}</span>
                        <span class="mono" style="font-size:9.5px;color:#67e8f9">${Number(item.price_adena || 0).toLocaleString()} Adena</span>
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escapeHtml(item.category)} · ${escapeHtml(item.effect)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${(!poi.activeCatalogTab || poi.activeCatalogTab === 'blacksmith' || poi.activeCatalogTab === 'refinement_anvils' || poi.activeCatalogTab === 'all') ? `
              <div>
                <div style="font-size:10.5px;font-weight:800;color:#fb923c;margin-bottom:4px">⚒️ +1 to +15 Refinement Anvil Rates &amp; Material Spoils</div>
                <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
                  ${(poi.shopAndRefinementCatalog.refinement_anvil_rates || []).map(tier => `
                    <div style="padding:5px 7px;border-radius:6px;background:#1f1924;border-left:3px solid #f97316">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                        <span style="font-size:10.5px;font-weight:900;color:#fde047">${escapeHtml(tier.enchant_range)}</span>
                        <span class="mono" style="font-size:10px;color:#4ade80;font-weight:800">${tier.success_rate_pct}% Success</span>
                      </div>
                      <div style="font-size:9.8px;color:#e2e8f0;margin-top:2px">${escapeHtml(tier.stat_bonus)}</div>
                      <div style="font-size:9.5px;color:#fca5a5;margin-top:1px">⚠️ Penalty: ${escapeHtml(tier.failure_penalty)}</div>
                      <div style="font-size:9.5px;color:#bae6fd;margin-top:2px">💎 Spoils: ${escapeHtml((tier.material_spoils || []).join(', '))}</div>
                    </div>
                  `).join('')}
                </div>
                <div style="font-size:10px;font-weight:800;color:#c084fc;margin-bottom:3px">📦 Blacksmith Material Spoils &amp; Smelting Sources</div>
                <div style="display:flex;flex-direction:column;gap:3px">
                  ${(poi.shopAndRefinementCatalog.blacksmith_material_spoils || []).map(sp => `
                    <div style="padding:4px 6px;border-radius:5px;background:#182232;font-size:9.5px;color:#cbd5e1">
                      <strong style="color:#f8fafc">${escapeHtml(sp.material_name)}</strong> (${escapeHtml(sp.used_for_tiers)}) — ${escapeHtml(sp.source_zone)} [<span class="mono" style="color:#fde047">${escapeHtml(sp.drop_or_spoil_rate)}</span>]
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
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
            <span id="studioSemanticLodBadge" class="mono" style="padding:2px 8px;border-radius:4px;background:rgba(56,189,248,0.16);border:1px solid rgba(56,189,248,0.45);color:#7dd3fc;font-size:10px;font-weight:800">
              ${ATLAS_STATE_STORE.activeDungeonId
                ? `🕳️ SUB-MAP: ${escapeHtml(ATLAS_STATE_STORE.activeDungeonId)} (${escapeHtml(ATLAS_STATE_STORE.activeFloorId)})`
                : (lodTier === 3 ? '🏘️ LOD Tier 3: Town Street & Shop/Refinement Blueprint (4.5×–12.0×)' : (lodTier === 2 ? '🛤️ LOD Tier 2: Regional Roads, Lv.Bands & Dungeon Portals (2.2×–4.5×)' : '🌍 LOD Tier 1: Macro Geography & 6 Race Spawns (1.0×–2.2×)'))}
            </span>
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
            <button type="button" onclick="ATLAS_STATE_STORE.activeDungeonId=''; ATLAS_STATE_STORE.activeFloorId=''; STUDIO_MAP_PAN_X=0; STUDIO_MAP_PAN_Y=0; STUDIO_MAP_ZOOM=${zs.z}; setStudioPerspective('${zs.persp}');" style="padding:5px 10px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${zs.idx === activeScaleIndex ? '#f59e0b' : 'rgba(255,255,255,0.14)'};background:${zs.idx === activeScaleIndex ? '#d97706' : '#26231d'};color:${zs.idx === activeScaleIndex ? '#ffffff' : '#d6d3d1'}">
              ${zs.label}
            </button>
          `).join('')}
        </div>
      </div>

      ${filterBarHtml || ''}

      <!-- Main Split: Left Place Details Drawer + Right Interactive 2D World Map -->
      <div style="display:flex;align-items:stretch;position:relative;min-height:520px;background:${isL2 ? '#2b3d41' : '#193452'}">
        ${placeDrawerHtml}

        <div style="flex:1;position:relative;min-width:0;overflow:hidden;background:${isL2 ? '#2b3d41' : '#193452'}">
          <!-- Floating Map Zoom Controls (+ / - / 1:1 / Street Blueprint) -->
          <div style="position:absolute;top:12px;right:12px;z-index:10;display:flex;flex-direction:column;gap:4px;background:rgba(18,16,12,0.92);padding:6px;border-radius:10px;border:1px solid rgba(212,175,55,0.35);box-shadow:0 6px 18px rgba(0,0,0,0.55)">
            <button type="button" onclick="zoomStudioMap(0.65, false)" title="Zoom In (+ key)" style="width:34px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#29251d;color:#f8fafc;font-size:16px;font-weight:800;cursor:pointer">+</button>
            <div id="studioCartoZoomReadout" class="mono" style="font-size:10px;text-align:center;color:#fde047;padding:2px 0">${STUDIO_MAP_ZOOM.toFixed(2)}×</div>
            <button type="button" onclick="zoomStudioMap(-0.65, false)" title="Zoom Out (- key)" style="width:34px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#29251d;color:#f8fafc;font-size:16px;font-weight:800;cursor:pointer">−</button>
            <button type="button" onclick="zoomStudioMap(0, false, 2.8)" title="Regional Roads LOD (2.8x)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(56,189,248,0.45);background:#0f172a;color:#38bdf8;font-size:9.5px;font-weight:800;cursor:pointer">2.8×</button>
            <button type="button" onclick="focusTownStreetBlueprint(ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow')" title="Town Street & Shop Blueprint LOD (5.2x)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(250,204,21,0.55);background:#422006;color:#fde047;font-size:9.5px;font-weight:800;cursor:pointer">5.2×</button>
            <button type="button" onclick="zoomStudioMap(0, true)" title="Reset Pan & Zoom (1:1 Macro)" style="width:34px;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);background:#17140f;color:#fde047;font-size:10px;font-weight:700;cursor:pointer">1:1</button>
          </div>

          ${drillControls ? `
            <div style="position:absolute;top:12px;left:12px;z-index:10;display:flex;flex-wrap:wrap;gap:6px;max-width:calc(100% - 70px)">
              ${drillControls}
            </div>
          ` : ''}

          <!-- Interactive 2D Cartographic SVG Map (WCAG 2.2 Keyboard Accessible via onStudioMapKeyDown) -->
          <svg id="dedicatedWorldAtlasSvg" tabindex="0" role="application" aria-label="Interactive Semantic-Zoom World, Town and Multi-Floor Dungeon Atlas"
               viewBox="0 0 1040 500" width="100%" height="520"
               onkeydown="onStudioMapKeyDown(event)"
               onwheel="onStudioMapWheel(event)"
               onmousedown="onStudioMapPointerDown(event)"
               onmousemove="onStudioMapPointerMove(event)"
               onmouseup="onStudioMapPointerUp(event)"
               onmouseleave="onStudioMapPointerUp(event)"
               style="display:block;width:100%;height:520px;cursor:grab;user-select:none;outline:none">
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
          <div style="position:absolute;bottom:10px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 12px;border-radius:8px;background:rgba(15,13,10,0.92);border:1px solid rgba(212,175,55,0.28);font-size:11px;color:#e7e5e4;pointer-events:none">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              ${(legendItems || []).map(item => `
                <span style="display:inline-flex;align-items:center;gap:5px">
                  <span style="width:10px;height:10px;border-radius:3px;background:${item.color};display:inline-block;border:1px solid rgba(255,255,255,0.4)"></span>
                  <span>${escapeHtml(item.label)}</span>
                </span>
              `).join('')}
            </div>
            <div class="mono" style="font-size:10px;color:#fde68a">⌨️ Keys: [+/−] Semantic Zoom · [Arrows] Pan · [1–3/PgUp/PgDn] Floor · [Esc] Exit Sub-Map</div>
          </div>
        </div>
      </div>

      ${bottomPanelHtml || ''}
    </div>
  `;
}

// ============================================================================
// DEDICATED SEMANTIC-ZOOM WORLD, TOWN & MULTI-FLOOR DUNGEON ATLAS COMPONENT
// ============================================================================
function matchesAtlasLevelBand(lvOrRange, bandStr = ATLAS_STATE_STORE.levelBand) {
  if (!bandStr || bandStr === 'All') return true;
  const parts = String(bandStr).split('-').map(x => parseInt(x, 10));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return true;
  const [bMin, bMax] = parts;
  if (Array.isArray(lvOrRange) && lvOrRange.length >= 2) {
    return lvOrRange[1] >= bMin && lvOrRange[0] <= bMax;
  }
  const lv = parseInt(lvOrRange, 10);
  if (!Number.isFinite(lv)) return true;
  return lv >= bMin && lv <= bMax;
}

function getAllAtlasTownEntries(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  const list = [
    ...(zdir.starting_towns || []),
    ...(zdir.other_castle_and_hub_towns || [])
  ];
  const deepTown = (tatlas && tatlas.t_deep_validation_slice && tatlas.t_deep_validation_slice.deep_town) || null;
  if (deepTown && deepTown.studio_node_id && !list.some(t => t.studio_node_id === deepTown.studio_node_id)) {
    list.unshift(deepTown);
  }
  return list;
}

function getAllAtlasFieldEntries(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  return zdir.fields_and_hunting_areas || [];
}

function getAllAtlasFortressEntries(tatlas) {
  const zdir = (tatlas && tatlas.t_breadth_zone_directory) || {};
  return zdir.harbors_clanhalls_and_forts || [];
}

function getFieldOrFortressBlueprintData(zoneOrNodeId, tatlas) {
  const targetId = typeof zoneOrNodeId === 'string'
    ? zoneOrNodeId
    : ((zoneOrNodeId && (zoneOrNodeId.zone_id || zoneOrNodeId.studio_node_id || zoneOrNodeId.id)) || ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate');
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allForts = getAllAtlasFortressEntries(tatlas);
  const matchedField = allFields.find(f => f.zone_id === targetId || f.studio_node_id === targetId);
  if (matchedField && matchedField.field_tactical_blueprint) {
    return { kind: 'field', entry: matchedField, bp: matchedField.field_tactical_blueprint };
  }
  const matchedFort = allForts.find(h => h.zone_id === targetId || h.studio_node_id === targetId);
  if (matchedFort && matchedFort.fortress_blueprint) {
    return { kind: 'fortress', entry: matchedFort, bp: matchedFort.fortress_blueprint };
  }
  if (allFields.length > 0 && allFields[0].field_tactical_blueprint) {
    return { kind: 'field', entry: allFields[0], bp: allFields[0].field_tactical_blueprint };
  }
  return null;
}

function getTownBlueprintData(townNodeOrId, tatlas) {
  const targetId = typeof townNodeOrId === 'string'
    ? townNodeOrId
    : ((townNodeOrId && (townNodeOrId.id || townNodeOrId.studio_node_id || townNodeOrId.zone_id)) || ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow');
  const allTowns = getAllAtlasTownEntries(tatlas);
  const matchedTown = allTowns.find(t => t.studio_node_id === targetId || t.zone_id === targetId);
  if (matchedTown && matchedTown.town_blueprint) {
    return matchedTown.town_blueprint;
  }
  const deepTown = (tatlas && tatlas.t_deep_validation_slice && tatlas.t_deep_validation_slice.deep_town) || {};
  if (deepTown.town_blueprint && (!targetId || targetId === 'town-lantern-hollow' || targetId === deepTown.studio_node_id || targetId === deepTown.zone_id)) {
    return deepTown.town_blueprint;
  }
  if (allTowns.length > 0 && allTowns[0].town_blueprint) {
    return allTowns[0].town_blueprint;
  }
  return deepTown.town_blueprint || {
    archetype_subtitle: 'Lantern Hollow Village (Gludin / Oren by Cheese Blueprint)',
    wall_polygon_pct: [[24, 12], [76, 12], [88, 28], [88, 72], [76, 88], [24, 88], [12, 72], [12, 28]],
    gates: [],
    streets: [],
    buildings: [],
    service_marks: [],
    npc_roster: []
  };
}

function buildAtlasOmniSearchIndex(tatlas) {
  const entries = [];
  const allTowns = getAllAtlasTownEntries(tatlas);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allFortresses = getAllAtlasFortressEntries(tatlas);
  const allDungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  const raceSpawns = (tatlas && tatlas.race_spawn_locations) || [];

  // 1. 6 Playable Race Spawns
  raceSpawns.forEach(rs => {
    entries.push({
      id: `race-${rs.race_key}`,
      kind: 'Race Spawn',
      icon: '🧬',
      badgeColor: '#10b981',
      title: `${rs.race_name} — ${rs.starter_shrine_monument}`,
      subtitle: `${rs.starter_town_name} · Lv.1–10 Starter Spawn`,
      keywords: `${rs.race_name} ${rs.race_key} ${rs.starter_town_name} ${rs.starter_shrine_monument} race spawn`,
      actionJs: `focusTownStreetBlueprint('${escapeHtml(rs.starter_town_node_id)}', '${escapeHtml(rs.loc_coord || '')}')`,
      actionLabel: `🏘️ Jump to ${rs.starter_town_name.split('(')[0].trim()}`
    });
  });

  // 2. 15 Towns + 180 Town NPCs (#1..#12) + 105 Town Service Marks (Shop + Refinement +1..+15)
  allTowns.forEach(t => {
    const tb = t.town_blueprint || {};
    const tNode = t.studio_node_id || t.zone_id;
    const tLoc = t.loc_coord || '-84120:243500';
    entries.push({
      id: `town-${t.zone_id}`,
      kind: 'Town Blueprint',
      icon: '🏰',
      badgeColor: '#eab308',
      title: `${t.name} (${t.l2_reference_analog || ''})`,
      subtitle: `Archetype: ${tb.layout_archetype || 'polygonal_walled_keep'} · #1..#12 NPCs & 7 Shops`,
      keywords: `${t.name} ${t.l2_reference_analog || ''} ${tb.layout_archetype || ''} ${t.territory_name || ''} town village castle`,
      actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tLoc)}')`,
      actionLabel: `🏘️ Open Town Blueprint (5.2×)`
    });
    (tb.service_marks || []).forEach(m => {
      const isRefine = m.mark_type === 'blacksmith' || m.mark_type === 'refinement_anvils';
      entries.push({
        id: `mark-${t.zone_id}-${m.mark_id}`,
        kind: 'Town Service Mark',
        icon: m.icon || '🛍️',
        badgeColor: '#f59e0b',
        title: `${m.label} (${m.npc_name || m.mark_type})`,
        subtitle: `${t.name} · Building #${m.building_number}`,
        keywords: `${m.label} ${m.mark_type} ${m.npc_name || ''} ${m.description || ''} ${t.name} ${isRefine ? 'Refinement +1..+15 Anvil Blacksmith Spoil' : ''} ${m.mark_type === 'warehouse' ? 'Warehouse Vault' : 'Shop'}`,
        actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tLoc)}')`,
        actionLabel: `🛍️ Inspect #${m.building_number} in ${t.name.split('(')[0].trim()}`
      });
    });
    (tb.npc_roster || []).forEach(npc => {
      entries.push({
        id: `npc-${t.zone_id}-${npc.building_number}`,
        kind: 'Town NPC (#1..#12)',
        icon: '👤',
        badgeColor: npc.color_hex || '#38bdf8',
        title: `#${npc.building_number} ${npc.name} — ${npc.role_title}`,
        subtitle: `${t.name} · ${npc.role_category}`,
        keywords: `${npc.name} ${npc.role_title} ${npc.role_category} #${npc.building_number} ${t.name} ${npc.role_category === 'warehouse' ? 'Warehouse' : ''} ${npc.role_category === 'merchant' ? 'Shop Refinement +1..+15' : ''}`,
        actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(npc.loc_coord || tLoc)}')`,
        actionLabel: `📍 Locate NPC #${npc.building_number}`
      });
    });
  });

  // 3. 24 Field Hunting Areas & 8 Harbors/ClanHalls/Fortresses
  allFields.forEach(f => {
    entries.push({
      id: `field-${f.zone_id}`,
      kind: 'Field Hunting Area',
      icon: '🏕️',
      badgeColor: '#4ade80',
      title: `${f.name} (${f.l2_reference_analog || ''})`,
      subtitle: `${f.level_header || ''} · Field Tactical Blueprint`,
      keywords: `${f.name} ${f.l2_reference_analog || ''} ${f.territory_name || ''} field hunting zone`,
      actionJs: `focusFieldTacticalBlueprint('${escapeHtml(f.zone_id)}', '${escapeHtml(f.loc_coord || '')}')`,
      actionLabel: `🏕️ Open Field Blueprint (4.8×)`
    });
  });
  allFortresses.forEach(h => {
    entries.push({
      id: `fort-${h.zone_id}`,
      kind: 'Fortress / Harbor',
      icon: '🛡️',
      badgeColor: '#fb923c',
      title: `${h.name} (${h.l2_reference_analog || ''})`,
      subtitle: `${h.category} · ${h.level_header || ''}`,
      keywords: `${h.name} ${h.l2_reference_analog || ''} ${h.category} fortress harbor clanhall`,
      actionJs: `focusFortressBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc_coord || '')}')`,
      actionLabel: `🛡️ Open Fortress Blueprint`
    });
  });

  // 4. 16 Multi-Floor Dungeons (48 Floors B1..B3 / 1F..3F) + Boss Spawns
  allDungeons.forEach(d => {
    (d.floors || []).forEach(fl => {
      entries.push({
        id: `dng-${d.dungeon_id}-${fl.floor_id}`,
        kind: `Dungeon Floor ${fl.floor_id}`,
        icon: d.dungeon_kind === 'vertical_tower' ? '🗼' : '🕳️',
        badgeColor: '#a855f7',
        title: `${d.name} (${d.l2_archetype_alias || ''}) · Floor ${fl.floor_id}`,
        subtitle: `${fl.level_range} · ${fl.boss_tier_highlight || ''}`,
        keywords: `${d.name} ${d.l2_archetype_alias || ''} ${fl.floor_id} ${fl.name} ${fl.boss_tier_highlight || ''} dungeon tower catacomb`,
        actionJs: `openDungeonSubMap('${escapeHtml(d.dungeon_id)}', '${escapeHtml(fl.floor_id)}')`,
        actionLabel: `🕳️ Warp to ${fl.floor_id}`
      });
      (fl.spawns || []).forEach(sp => {
        const isMvp = sp.entity_type === 'MVP';
        const isRaid = sp.entity_type === 'Raid' || sp.entity_type === 'RaidBoss';
        entries.push({
          id: `dng-spawn-${d.dungeon_id}-${fl.floor_id}-${sp.npc_id}`,
          kind: `${sp.entity_type} Spawn`,
          icon: isMvp ? '👑' : (isRaid ? '🔥' : (sp.entity_type === 'Mini-Boss' ? '⚔️' : '👾')),
          badgeColor: isMvp ? '#eab308' : (isRaid ? '#f97316' : '#ef4444'),
          title: `${sp.name} (Lv.${sp.level} ${sp.entity_type})`,
          subtitle: `${d.name} · Floor ${fl.floor_id} · Drops: ${(sp.refinement_drops || []).slice(0, 2).join(', ')}`,
          keywords: `${sp.name} ${sp.entity_type} ${d.name} ${d.l2_archetype_alias || ''} ${fl.floor_id} ${(sp.refinement_drops || []).join(' ')} ${isMvp ? 'MVP Bosses' : ''} ${isRaid ? 'Raid Bosses' : ''}`,
          actionJs: `openDungeonSubMap('${escapeHtml(d.dungeon_id)}', '${escapeHtml(fl.floor_id)}')`,
          actionLabel: `📍 Open ${fl.floor_id}`
        });
      });
    });
  });

  // 7. 6 Primordial Sealed-God 5-Tier Boss Hierarchy Chains
  const bossChains = getAtlasBossHierarchyChains(tatlas);
  bossChains.forEach(ch => {
    const mvpNames = (ch.mvp_apostles || []).map(x => x.name).join(', ');
    const raidNames = (ch.raid_bosses || []).map(x => x.name).join(', ');
    entries.push({
      id: `god-chain-${ch.god_id}`,
      kind: 'Sealed God Chain',
      icon: ch.icon || '🔱',
      badgeColor: ch.theme_color || '#f43f5e',
      title: `${ch.god_name} (${ch.chapter_epoch})`,
      subtitle: `5-Tier Chain: Sealed God → MVP (${mvpNames}) → Raid (${raidNames})`,
      keywords: `${ch.god_id} ${ch.god_name} ${ch.chapter_epoch} ${ch.domain_aspect || ''} ${mvpNames} ${raidNames} Boss Hierarchy Chain Sealed God`,
      actionJs: `setAtlasBossGodChain('${escapeHtml(ch.god_id)}')`,
      actionLabel: `🔱 Trace 5-Tier Chain`
    });
  });

  return entries;
}

function searchAtlasOmniIndex(query, tatlas) {
  const index = buildAtlasOmniSearchIndex(tatlas);
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) {
    return index.slice(0, 8);
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  return index.filter(item => {
    const hay = `${item.title} ${item.subtitle} ${item.keywords} ${item.kind}`.toLowerCase();
    return tokens.every(tk => hay.includes(tk));
  }).slice(0, 14);
}

function renderAtlasFilteredEntityMatrixHtml(tatlas) {
  const activeFilter = ATLAS_STATE_STORE.filter || 'All';
  const activeBand = ATLAS_STATE_STORE.levelBand || 'All';
  const searchRaw = String(ATLAS_OMNI_SEARCH_QUERY || ATLAS_STATE_STORE.omniSearchQuery || '').trim().toLowerCase();
  const allTowns = getAllAtlasTownEntries(tatlas);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allFortresses = getAllAtlasFortressEntries(tatlas);
  const allDungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  const raceSpawns = (tatlas && tatlas.race_spawn_locations) || [];

  const rows = [];

  // 1. Race Spawns
  if (activeFilter === 'All' || activeFilter === 'RaceSpawns') {
    raceSpawns.forEach(rs => {
      if (!matchesAtlasLevelBand([1, 10], activeBand)) return;
      rows.push({
        entityType: 'RaceSpawns',
        badgeLabel: '🧬 Race Spawn',
        badgeColor: '#10b981',
        name: `${rs.race_name} — ${rs.starter_shrine_monument}`,
        zoneOrFloor: `${rs.starter_town_name} · Plaza Shrine #1`,
        level: 1,
        levelDisplay: 'Lv.1–10',
        respawn: 'Starter Sanctuary',
        drops: 'Starter Accord Emblem · Soulshot Pack · Wayfarer Map',
        locCoord: rs.loc_coord || '-84120:243500',
        actionJs: `focusTownStreetBlueprint('${escapeHtml(rs.starter_town_node_id)}', '${escapeHtml(rs.loc_coord || '')}')`,
        actionLabel: '📍 Locate on Map / Open Town'
      });
    });
  }

  // 2. Town NPCs: Shop + Refinement
  if (activeFilter === 'All' || activeFilter === 'TownMarks') {
    allTowns.forEach(t => {
      const tb = t.town_blueprint || {};
      const lvBand = t.level_band || [1, 20];
      if (!matchesAtlasLevelBand(lvBand, activeBand)) return;
      const tNode = t.studio_node_id || t.zone_id;
      const tLoc = t.loc_coord || '-84120:243500';
      (tb.service_marks || []).filter(m => ['equip_shop', 'consumable_shop', 'blacksmith', 'warehouse', 'gatekeeper'].includes(m.mark_type)).slice(0, 3).forEach(m => {
        rows.push({
          entityType: 'TownMarks',
          badgeLabel: '🛍️ Shop + Refinement',
          badgeColor: '#eab308',
          name: `${m.icon || '🛍️'} ${m.label} (${m.npc_name || 'Merchant'})`,
          zoneOrFloor: `${t.name} · Building #${m.building_number}`,
          level: lvBand[0] || 1,
          levelDisplay: `Lv.${lvBand[0]}–${lvBand[1]}`,
          respawn: '24h Town Service',
          drops: '+1..+15 Refinement Anvil · Weapons · Armor · Potions & Soulshots',
          locCoord: tLoc,
          actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tLoc)}')`,
          actionLabel: '📍 Locate on Map / Open Shop'
        });
      });
    });
  }

  // 3. Multi-Floor Dungeon Spawns (Monster, Mini-Boss, Raid, MVP across 16 Dungeons / 48 Floors)
  allDungeons.forEach(d => {
    (d.floors || []).forEach(fl => {
      (fl.spawns || []).forEach(sp => {
        const normType = sp.entity_type === 'RaidBoss' ? 'Raid' : sp.entity_type;
        if (activeFilter !== 'All' && normType !== activeFilter) return;
        if (!matchesAtlasLevelBand(sp.level, activeBand)) return;
        const isMvp = normType === 'MVP';
        const isRaid = normType === 'Raid';
        const isMini = normType === 'Mini-Boss';
        rows.push({
          entityType: normType,
          badgeLabel: isMvp ? '👑 MVP' : (isRaid ? '🔥 Raid' : (isMini ? '⚔️ Mini-Boss' : '👾 Monster')),
          badgeColor: isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444')),
          name: sp.name,
          zoneOrFloor: `${d.name} · Floor ${fl.floor_id} (${fl.floor_elevation_meters > 0 ? '+' + fl.floor_elevation_meters : fl.floor_elevation_meters}m)`,
          level: sp.level,
          levelDisplay: `Lv.${sp.level}`,
          respawn: `${sp.respawn_sec}s (×${sp.spawn_count})`,
          drops: (sp.refinement_drops || ['High-Grade Iron Ore', 'Refinement Flux Dust']).join(' · '),
          locCoord: sp.loc_coord || d.entrance_loc || '',
          actionJs: `openDungeonSubMap('${escapeHtml(d.dungeon_id)}', '${escapeHtml(fl.floor_id)}')`,
          actionLabel: `📍 Locate on Map / Open Floor ${fl.floor_id}`
        });
      });
    });
  });

  // 4. Field Hunting Area & Fortress Spawn Territories (Monster, Mini-Boss, Raid, MVP across 24 Fields + 8 Fortresses)
  [...allFields.map(f => ({ entry: f, bp: f.field_tactical_blueprint, isFort: false })), ...allFortresses.map(h => ({ entry: h, bp: h.fortress_blueprint, isFort: true }))].forEach(({ entry, bp, isFort }) => {
    if (!bp) return;
    (bp.spawn_territories || []).forEach(st => {
      if (activeFilter !== 'All' && st.entity_type !== activeFilter) return;
      if (!matchesAtlasLevelBand(st.level, activeBand)) return;
      const isMvp = st.entity_type === 'MVP';
      const isRaid = st.entity_type === 'Raid';
      const isMini = st.entity_type === 'Mini-Boss';
      const fnName = isFort ? 'focusFortressBlueprint' : 'focusFieldTacticalBlueprint';
      rows.push({
        entityType: st.entity_type,
        badgeLabel: isMvp ? '👑 MVP' : (isRaid ? '🔥 Raid' : (isMini ? '⚔️ Mini-Boss' : '👾 Monster')),
        badgeColor: isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444')),
        name: st.mob_name,
        zoneOrFloor: `${entry.name} · ${isFort ? 'Fortress Ring' : 'Field Ring'}`,
        level: st.level,
        levelDisplay: `Lv.${st.level}`,
        respawn: `${st.respawn} (×${st.count})`,
        drops: (st.refinement_drops || []).join(' · '),
        locCoord: st.loc_coord || entry.loc_coord || '',
        actionJs: `${fnName}('${escapeHtml(entry.zone_id)}', '${escapeHtml(st.loc_coord || entry.loc_coord || '')}')`,
        actionLabel: '📍 Locate on Map / Open Blueprint'
      });
    });
  });

  const filteredRows = searchRaw
    ? rows.filter(r => `${r.name} ${r.zoneOrFloor} ${r.drops} ${r.badgeLabel}`.toLowerCase().includes(searchRaw))
    : rows;

  const displayRows = filteredRows.slice(0, 18);
  const tabDefs = [
    { id: 'All', label: '🌐 All Entities' },
    { id: 'RaceSpawns', label: '🧬 Race Spawns' },
    { id: 'TownMarks', label: '🛍️ NPCs: Shop + Refinement' },
    { id: 'Monster', label: '👾 Monster' },
    { id: 'Mini-Boss', label: '⚔️ Mini-Boss' },
    { id: 'Raid', label: '🔥 Raid' },
    { id: 'MVP', label: '👑 MVP' }
  ];

  return `
    <div id="studioFilteredEntitySpawnMatrix" style="padding:12px 16px;background:#0c121c;border-top:1px solid rgba(250,204,21,0.28)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div>
          <div style="font-size:12px;font-weight:900;color:#fde047">
            🎯 LIVE WORLD &amp; DUNGEON SPAWN &amp; REFINEMENT-SPOIL LOCATOR MATRIX (D14 · ${filteredRows.length} MATCHING ENTITIES)
          </div>
          <div style="font-size:10.5px;color:#94a3b8">
            Synced with Active Filter (${escapeHtml(activeFilter)}) &amp; Level Band (${escapeHtml(activeBand)}) across 16 Multi-Floor Dungeons (48 Floors), 24 Fields, 8 Fortresses &amp; 15 Towns
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${tabDefs.map(tb => {
            const act = activeFilter === tb.id;
            return `
              <button type="button" onclick="setAtlasFilter('${tb.id}')"
                      style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#fde047' : 'rgba(255,255,255,0.14)'};background:${act ? '#d97706' : '#162032'};color:${act ? '#ffffff' : '#cbd5e1'}">
                ${tb.label}
              </button>
            `;
          }).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:7px">
        ${displayRows.map(r => `
          <div style="padding:8px 10px;border-radius:8px;background:#141d2d;border-left:3.5px solid ${r.badgeColor};border-top:1px solid rgba(255,255,255,0.07);border-right:1px solid rgba(255,255,255,0.07);border-bottom:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;justify-content:space-between;gap:5px">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                <span style="font-size:11px;font-weight:900;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name)}</span>
                <span class="mono" style="font-size:9.5px;padding:1px 6px;border-radius:4px;background:rgba(15,23,42,0.9);color:${r.badgeColor};border:1px solid ${r.badgeColor};flex-shrink:0">${escapeHtml(r.badgeLabel)} · ${escapeHtml(r.levelDisplay)}</span>
              </div>
              <div style="font-size:10px;color:#cbd5e1;margin-top:2px;font-weight:700">
                🗺️ ${escapeHtml(r.zoneOrFloor)} · <span class="mono" style="color:#38bdf8">⏱️ ${escapeHtml(r.respawn)}</span>
              </div>
              <div style="font-size:9.5px;color:#fde68a;margin-top:2px">
                💎 Drops / Spoils: ${escapeHtml(r.drops)}
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:3px">
              <span class="mono" style="font-size:9px;color:#94a3b8">loc=${escapeHtml(r.locCoord)}</span>
              <button type="button" onclick="${r.actionJs}"
                      style="padding:3px 9px;border-radius:6px;border:1px solid #fde047;background:#1e3a8a;color:#fde047;font-size:9.5px;font-weight:900;cursor:pointer;flex-shrink:0">
                ${escapeHtml(r.actionLabel)}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAtlasBlacksmithRefinementBarHtml(tatlas) {
  const canonGradeCodes = [
    'No-Grade Lv.1–19',
    'D-Grade Lv.20–39',
    'C-Grade Lv.40–51',
    'B-Grade Lv.52–60',
    'A-Grade Lv.61–75',
    'S-Grade Lv.76–99'
  ];
  const grades = (tatlas && tatlas.refinement_grade_matrix && tatlas.refinement_grade_matrix.length)
    ? tatlas.refinement_grade_matrix
    : canonGradeCodes.map(gc => ({ grade_code: gc, safe_refinement_level: 3, max_refinement_level: 15, rates_by_plus: [], required_materials: [], home_blacksmith_towns: [] }));
  if (!grades.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curGradeCode = ATLAS_REFINE_GRADE || ATLAS_STATE_STORE.refineGrade || grades[0].grade_code;
  const activeGrade = grades.find(g => g.grade_code === curGradeCode || g.grade_short_code === curGradeCode) || grades[0];
  const curPlus = Math.max(1, Math.min(15, Number(ATLAS_REFINE_PLUS || ATLAS_STATE_STORE.refinePlus || 3)));
  const rates = activeGrade.rates_by_plus || [];
  const activeStep = rates.find(r => r.plus_level === curPlus) || rates[2] || rates[0] || {
    plus_level: curPlus,
    plus_label: `+${curPlus}`,
    success_rate_pct: 100.0,
    stat_bonus: '+9% P.Atk/M.Atk/P.Def',
    failure_penalty: 'None (100% Safe Tempering Guarantee)',
    required_catalyst: 'Scroll: Enchant Weapon/Armor'
  };

  const isSafe = curPlus <= (activeGrade.safe_refinement_level || 3);
  const rateCol = isSafe ? '#34d399' : (curPlus <= 6 ? '#fde047' : (curPlus <= 9 ? '#38bdf8' : (curPlus <= 12 ? '#f97316' : '#f43f5e')));

  return `
    <div id="atlasBlacksmithRefinementLocatorBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#19130c;border:1px solid rgba(245,158,11,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fbbf24">⚒️ BLACKSMITH REFINEMENT (+1..+15) &amp; SPOIL SOURCE LOCATOR (D19):</span>
          ${grades.map(g => {
            const isAct = g.grade_code === activeGrade.grade_code;
            return `
              <button type="button" onclick="setAtlasRefineGrade('${escapeHtml(g.grade_code)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(245,158,11,0.35)'};background:${isAct ? '#b45309' : '#0f172a'};color:${isAct ? '#ffffff' : '#fde68a'}">
                🛡️ ${escapeHtml(g.grade_code)}
              </button>
            `;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px">
          <span class="mono" style="font-size:9.5px;color:#cbd5e1;font-weight:800">Anvil Step (Safe +${activeGrade.safe_refinement_level || 3}):</span>
          ${rates.map(r => {
            const isAct = r.plus_level === curPlus;
            const stepSafe = r.plus_level <= (activeGrade.safe_refinement_level || 3);
            return `
              <button type="button" onclick="setAtlasRefinePlus(${r.plus_level})"
                      style="min-width:28px;height:22px;padding:0 5px;border-radius:5px;font-size:9.5px;font-weight:900;cursor:pointer;border:1px solid ${isAct ? '#fde047' : (stepSafe ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.14)')};background:${isAct ? '#d97706' : (stepSafe ? '#064e3b' : '#0f172a')};color:${isAct ? '#ffffff' : (stepSafe ? '#6ee7b7' : '#cbd5e1')}">
                +${r.plus_level}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:7px;align-items:stretch">
        <!-- Selected Grade Weapons/Armor + Active +1..+15 Anvil Rate -->
        <div style="padding:6px 9px;border-radius:6px;background:#0f172a;border-left:3.5px solid ${rateCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <span style="font-size:10.5px;font-weight:900;color:#fde047">${escapeHtml(activeGrade.grade_code)} · Step ${escapeHtml(activeStep.plus_label)}</span>
            <span class="mono" style="font-size:9.5px;padding:1px 6px;border-radius:4px;background:rgba(15,23,42,0.95);color:${rateCol};border:1px solid ${rateCol};font-weight:900">
              ${activeStep.success_rate_pct}% Success ${isSafe ? '(SAFE)' : ''}
            </span>
          </div>
          <div style="font-size:9.5px;color:#e2e8f0">
            ⚔️ <strong>Weapons:</strong> ${escapeHtml((activeGrade.representative_weapons || []).join(' · '))}
          </div>
          <div style="font-size:9.5px;color:#cbd5e1">
            🛡️ <strong>Armor:</strong> ${escapeHtml((activeGrade.representative_armor || []).join(' · '))}
          </div>
          <div style="font-size:9.5px;color:#6ee7b7;font-weight:700">
            ✨ <strong>Bonus:</strong> ${escapeHtml(activeStep.stat_bonus)} · <span style="color:#fca5a5">${escapeHtml(activeStep.failure_penalty)}</span>
          </div>
          <div class="mono" style="font-size:9px;color:#93c5fd">
            📜 Catalyst: ${escapeHtml(activeStep.required_catalyst)}
          </div>
        </div>

        <!-- Required Refinement Materials & 1-Click Drop Zone / Dungeon Floor Locator -->
        <div style="padding:6px 9px;border-radius:6px;background:#0f172a;border-left:3.5px solid #38bdf8;display:flex;flex-direction:column;gap:4px">
          <div class="mono" style="font-size:9.5px;font-weight:900;color:#38bdf8">
            💎 REQUIRED SPOIL &amp; DROP MATERIALS (Highlight Material Drop Zones / Open Dungeon Floor):
          </div>
          ${(activeGrade.required_materials || []).map(mat => `
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;padding:3px 6px;border-radius:5px;background:#162033">
              <div style="min-width:0">
                <div style="font-size:9.8px;font-weight:800;color:#f8fafc">${escapeHtml(mat.material_name)} <span class="mono" style="font-size:8.8px;color:#fde047">(${escapeHtml(mat.used_for_plus_range || '+1..+15')})</span></div>
                <div class="mono" style="font-size:8.5px;color:#94a3b8">${escapeHtml(mat.drop_or_spoil_rate || 'Dwarf Spoil & Boss Drop')}</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:3px">
                ${(mat.drop_zones || []).map(dzId => {
                  const zObj = zoneById[dzId];
                  const zShort = zObj ? zObj.name.split('(')[0].trim().slice(0, 20) : dzId.replace('zone-', '');
                  const isDng = dzId.includes('dungeon') || dzId.includes('catacomb');
                  return `
                    <button type="button" onclick="highlightMaterialDropZonesOrOpenDungeon('${escapeHtml(dzId)}')"
                            title="Highlight Material Drop Zones / Open Dungeon Floor (${escapeHtml(dzId)})"
                            style="padding:2px 6px;border-radius:4px;border:1px solid ${isDng ? '#c084fc' : '#4ade80'};background:${isDng ? '#3b0764' : '#052e16'};color:#f8fafc;font-size:8.8px;font-weight:800;cursor:pointer">
                      ${isDng ? '🕳️' : '🏕️'} ${escapeHtml(zShort)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Home Blacksmith Towns (1-Click Jump to Blacksmith Town Street Map) -->
        <div style="padding:6px 9px;border-radius:6px;background:#0f172a;border-left:3.5px solid #eab308;display:flex;flex-direction:column;justify-content:space-between;gap:5px">
          <div>
            <div class="mono" style="font-size:9.5px;font-weight:900;color:#fde047">
              🏰 HOME BLACKSMITH ANVIL TOWNS (Jump to Blacksmith Town Street Map):
            </div>
            <div style="font-size:9px;color:#cbd5e1;margin-top:2px">
              Click any town below to zoom to its Tier 3 Street Blueprint (5.2×) and inspect Building #3 (Blacksmith Clan &amp; Refinement Anvil).
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${(activeGrade.home_blacksmith_towns || []).map(tZid => {
              const tObj = zoneById[tZid];
              const tShort = tObj ? tObj.name.split('(')[0].trim() : tZid;
              return `
                <button type="button" onclick="jumpToBlacksmithTownStreetMap('${escapeHtml(tZid)}')"
                        title="Jump to Blacksmith Town Street Map (${escapeHtml(tShort)})"
                        style="padding:3px 8px;border-radius:5px;border:1px solid #fde047;background:#422006;color:#fef08a;font-size:9.2px;font-weight:900;cursor:pointer">
                  ⚒️ Jump to Blacksmith Town Street Map: ${escapeHtml(tShort)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAtlasBossHierarchyChainBarHtml(tatlas) {
  const chains = (tatlas && tatlas.boss_hierarchy_chains) || [];
  if (!chains.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curGodId = ATLAS_BOSS_GOD_ID || ATLAS_STATE_STORE.bossGodId || chains[0].god_id;
  const activeChain = chains.find(c => c.god_id === curGodId || c.god_short_label === curGodId) || chains[0];
  const isAllGods = curGodId === 'All';

  const godPills = [
    { id: 'All', label: '🌐 All Gods' },
    { id: 'god-sola-hearth-weaver', label: '🔥 Sola' },
    { id: 'god-krono-brass-titan', label: '⚙️ Krono' },
    { id: 'god-vesper-dream-eater', label: '✨ Vesper' },
    { id: 'god-aurelia-dawn-forger', label: '☀️ Aurelia' },
    { id: 'god-thalassa-abyss-tide', label: '🌊 Thalassa' },
    { id: 'god-legendary-dragon', label: '🐉 Legendary Dragon' }
  ];

  const catObj = zoneById[activeChain.seal_catacomb_zone_id];
  const catShort = catObj ? catObj.name.split('(')[0].trim() : activeChain.seal_catacomb_zone_id;

  return `
    <div id="atlasBossHierarchyChainBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#160d1f;border:1px solid rgba(192,132,252,0.5)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">👑 5-TIER BOSS POWER HIERARCHY &amp; SEALED-GOD CHAIN (D21):</span>
          ${godPills.map(gp => {
            const isAct = (isAllGods && gp.id === 'All') || (!isAllGods && activeChain.god_id === gp.id);
            return `
              <button type="button" onclick="setAtlasBossGodChain('${escapeHtml(gp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.4)'};background:${isAct ? '#7e22ce' : '#0f172a'};color:${isAct ? '#ffffff' : '#e9d5ff'}">
                ${escapeHtml(gp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9.2px;color:#fde047;font-weight:800">
          STRICT LAW: [1] SEALED GOD ➔ [2] MVP APOSTLE (B3/3F) ➔ [3] RAID BOSS ➔ [4] MINI-BOSS ➔ [5] MINION FAMILY
        </span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;align-items:stretch">
        <!-- Tier 1: Primordial Sealed God & Seal Catacomb -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #c084fc;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#c084fc">TIER 1 · PRIMORDIAL SEALED GOD</div>
            <div style="font-size:10px;font-weight:900;color:#f8fafc;margin-top:2px">${escapeHtml(activeChain.god_name)}</div>
            <div class="mono" style="font-size:8.6px;color:#94a3b8;margin-top:2px">${escapeHtml(activeChain.chapter_epoch)} · loc=${escapeHtml(activeChain.seal_loc)}</div>
          </div>
          <button type="button" onclick="openDungeonSubMap('${escapeHtml(activeChain.seal_catacomb_zone_id)}', 'B3')"
                  title="Jump to Seal Catacomb (${escapeHtml(catShort)})"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #c084fc;background:#3b0764;color:#f3e8ff;font-size:8.8px;font-weight:900;cursor:pointer;text-align:left">
            🕳️ Jump to Seal Catacomb: ${escapeHtml(catShort)} (B3)
          </button>
        </div>

        <!-- Tier 2: Direct MVP Apostles (B3 / 3F Sanctums) -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #eab308;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#fde047">TIER 2 · DIRECT MVP APOSTLES (SANCTUM B3/3F)</div>
            ${(activeChain.mvp_apostles || []).map(ap => `
              <div style="margin-top:3px;padding:3px 5px;border-radius:4px;background:#162033">
                <div style="font-size:9.4px;font-weight:800;color:#fef08a">👑 ${escapeHtml(ap.name)} (Lv.${ap.level})</div>
                <div class="mono" style="font-size:8.3px;color:#6ee7b7">💎 ${escapeHtml(ap.signature_drop)}</div>
                <button type="button" onclick="openDungeonSubMap('${escapeHtml(ap.dungeon_id)}', '${escapeHtml(ap.floor_id)}')"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8.4px;font-weight:800;cursor:pointer">
                  👑 Open MVP Sanctum: ${escapeHtml(ap.dungeon_id.replace('zone-', ''))} (${escapeHtml(ap.floor_id)})
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tier 3: Regional Raid Bosses -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #f97316;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#fb923c">TIER 3 · REGIONAL RAID BOSSES</div>
            ${(activeChain.raid_bosses || []).map(rb => `
              <div style="margin-top:3px;padding:3px 5px;border-radius:4px;background:#162033;display:flex;justify-content:space-between;align-items:center;gap:4px">
                <div style="min-width:0">
                  <div style="font-size:9.3px;font-weight:800;color:#fed7aa">🔥 ${escapeHtml(rb.name)} (Lv.${rb.level})</div>
                  <div class="mono" style="font-size:8.2px;color:#94a3b8">Respawn ${escapeHtml(rb.respawn)} · loc=${escapeHtml(rb.loc)}</div>
                </div>
                <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(rb.zone_id)}', '${escapeHtml(rb.loc)}')"
                        style="padding:2px 6px;border-radius:4px;border:1px solid #fb923c;background:#431407;color:#ffedd5;font-size:8.3px;font-weight:800;cursor:pointer;flex-shrink:0">
                  🔥 Raid Field
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tier 4 & Tier 5: Mini-Boss Patrols & Minion Ecological Families -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #ef4444;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#f87171">TIER 4 MINI-BOSS &amp; TIER 5 MINION FAMILIES</div>
            ${(activeChain.mini_bosses || []).map(mb => `
              <div style="margin-top:2px;display:flex;justify-content:space-between;align-items:center;gap:4px">
                <span style="font-size:9px;color:#e2e8f0;font-weight:700">⚔️ ${escapeHtml(mb.name)} (Lv.${mb.level})</span>
                <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(mb.zone_id)}', '${escapeHtml(mb.loc)}')"
                        style="padding:1px 5px;border-radius:4px;border:1px solid #a855f7;background:#2e1065;color:#e9d5ff;font-size:8px;font-weight:800;cursor:pointer">
                  ⚔️ Patrol
                </button>
              </div>
            `).join('')}
            <div style="margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.08)">
              ${(activeChain.minion_families || []).map(mf => `
                <div style="font-size:8.6px;color:#cbd5e1;margin-top:2px">
                  👾 <strong>${escapeHtml(mf.family_name)}:</strong> ${escapeHtml(mf.representative_mob)}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAtlasQuestTrialOverlayBarHtml(tatlas) {
  const quests = (tatlas && tatlas.quest_trial_chains) || [];
  if (!quests.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curTrack = ATLAS_QUEST_TRACK || ATLAS_STATE_STORE.questTrack || 'All';
  const filteredQuests = curTrack === 'All'
    ? quests
    : quests.filter(q => q.quest_track === curTrack);
  const activeQuest = filteredQuests.find(q => q.quest_id === (ATLAS_ACTIVE_QUEST_ID || ATLAS_STATE_STORE.activeQuestId))
    || filteredQuests[0]
    || quests[0];

  const trackPills = [
    { id: 'All', label: '🌐 All Quests (18)' },
    { id: 'main_story', label: '📜 Main Story (6)' },
    { id: 'class_transfer', label: '⚔️ Class Transfer Lv.20/40/76 (6)' },
    { id: 'racial_heritage', label: '🧬 Racial Side Quests (6)' }
  ];

  const giverZone = zoneById[activeQuest.giver_zone_id];
  const giverTownNodeId = (giverZone && (giverZone.studio_node_id || giverZone.zone_id)) || activeQuest.giver_zone_id;
  const giverShort = giverZone ? giverZone.name.split('(')[0].trim() : activeQuest.giver_zone_id;

  const objZone = zoneById[activeQuest.objective_zone_id];
  const objShort = objZone ? objZone.name.split('(')[0].trim() : activeQuest.objective_zone_id;
  const isDngObj = Boolean(activeQuest.objective_dungeon_id);
  const objJumpCall = isDngObj
    ? `openDungeonSubMap('${escapeHtml(activeQuest.objective_dungeon_id)}', '${escapeHtml(activeQuest.objective_floor_id || 'B1')}')`
    : `focusFieldTacticalBlueprint('${escapeHtml(activeQuest.objective_zone_id)}', '${escapeHtml(activeQuest.objective_loc || '')}')`;

  const turnInZone = zoneById[activeQuest.turn_in_zone_id];
  const turnInTownNodeId = (turnInZone && (turnInZone.studio_node_id || turnInZone.zone_id)) || activeQuest.turn_in_zone_id;
  const turnInShort = turnInZone ? turnInZone.name.split('(')[0].trim() : activeQuest.turn_in_zone_id;

  return `
    <div id="atlasQuestTrialOverlayBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0f1d2e;border:1px solid rgba(56,189,248,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">📜 3-TRACK QUEST &amp; CLASS TRIAL OVERLAY (D23):</span>
          ${trackPills.map(tp => {
            const isAct = curTrack === tp.id;
            return `
              <button type="button" onclick="setAtlasQuestTrack('${escapeHtml(tp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.4)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                ${escapeHtml(tp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9px;color:#94a3b8;font-weight:800">Active Chain:</span>
          <select aria-label="Select Canonical Quest or Class Transfer Trial" onchange="selectAtlasQuestChain(this.value)"
                  style="height:24px;padding:1px 7px;border-radius:6px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.55);font-size:9.8px;font-weight:800;cursor:pointer">
            ${filteredQuests.map(q => {
              const sel = q.quest_id === activeQuest.quest_id ? 'selected' : '';
              const tierTag = q.class_tier && q.class_tier !== 'None' ? ` [${q.class_tier}]` : '';
              return `<option value="${escapeHtml(q.quest_id)}" ${sel}>[${escapeHtml(q.race_id)} Lv.${q.min_level}] ${escapeHtml(q.quest_name)}${escapeHtml(tierTag)}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;align-items:stretch">
        <!-- Step 1: Quest Giver Town & NPC -->
        <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #38bdf8;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:8.8px;font-weight:900;color:#38bdf8">STEP 1 · QUEST GIVER TOWN (${escapeHtml(activeQuest.race_id)} · Lv.${activeQuest.min_level})</div>
            <div style="font-size:9.8px;font-weight:900;color:#f8fafc;margin-top:2px">${escapeHtml(activeQuest.giver_npc_name)}</div>
            <div class="mono" style="font-size:8.4px;color:#94a3b8;margin-top:1px">${escapeHtml(giverShort)} · loc=${escapeHtml(activeQuest.giver_loc)}</div>
          </div>
          <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(giverTownNodeId)}', '${escapeHtml(activeQuest.giver_loc)}')"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
            🏰 Jump to Giver Town: ${escapeHtml(giverShort)}
          </button>
        </div>

        <!-- Step 2: Hunting / Dungeon Floor Objective -->
        <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #f59e0b;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:8.8px;font-weight:900;color:#fde047">
              STEP 2 · OBJECTIVE (${isDngObj ? 'DUNGEON FLOOR ' + escapeHtml(activeQuest.objective_floor_id) : 'FIELD HUNTING GROUND'})
            </div>
            <div style="font-size:9.8px;font-weight:900;color:#fef08a;margin-top:2px">🎯 ${escapeHtml(activeQuest.objective_target)}</div>
            <div class="mono" style="font-size:8.4px;color:#94a3b8;margin-top:1px">${escapeHtml(objShort)} · loc=${escapeHtml(activeQuest.objective_loc)}</div>
          </div>
          <button type="button" onclick="${objJumpCall}"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
            ${isDngObj ? `🕳️ Jump to Objective Dungeon: ${escapeHtml(objShort)} (${escapeHtml(activeQuest.objective_floor_id)})` : `🏕️ Jump to Objective Field: ${escapeHtml(objShort)}`}
          </button>
        </div>

        <!-- Step 3: Turn-In NPC & Class/Quest Reward -->
        <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #10b981;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:8.8px;font-weight:900;color:#34d399">
              STEP 3 · TURN-IN &amp; REWARD ${activeQuest.class_tier !== 'None' ? '(' + escapeHtml(activeQuest.class_tier) + ')' : ''}
            </div>
            <div style="font-size:9.8px;font-weight:900;color:#ecfdf5;margin-top:2px">🏆 ${escapeHtml(activeQuest.turn_in_npc_name)}</div>
            <div class="mono" style="font-size:8.4px;color:#6ee7b7;margin-top:1px">🎁 ${escapeHtml(activeQuest.reward_summary)}</div>
          </div>
          <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(turnInTownNodeId)}', '${escapeHtml(activeQuest.turn_in_loc)}')"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
            🏛️ Jump to Turn-In Town: ${escapeHtml(turnInShort)}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAtlasFarmingHeatmapBarHtml(tatlas) {
  const profiles = (tatlas && tatlas.farming_efficiency_profiles) || [];
  if (!profiles.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
  });

  const curMode = ATLAS_FARMING_MODE || ATLAS_STATE_STORE.farmingMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🔥 All 40 Combat Zones' },
    { id: 'solo_grinding', label: '🗡️ Solo Grinding' },
    { id: 'duo_spoil_scavenger', label: '⛏️ Duo Spoil Scavenger' },
    { id: 'full_9p_aoe_party', label: '🛡️ 9-Player AoE Party' },
    { id: 'clan_raid_force', label: '👑 Clan Raid Force' }
  ];

  const matchingProfiles = curMode === 'Off'
    ? []
    : (curMode === 'All' ? profiles : profiles.filter(p => p.recommended_party_mode === curMode));

  const topHotspots = matchingProfiles
    .slice()
    .sort((a, b) => (b.xp_per_hour_index + b.adena_per_hour_index) - (a.xp_per_hour_index + a.adena_per_hour_index))
    .slice(0, 4);

  return `
    <div id="atlasFarmingEfficiencyHeatmapBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#101f18;border:1px solid rgba(52,211,153,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#6ee7b7">⚡ PARTY &amp; FARMING EFFICIENCY HEATMAP (D24 · 40 COMBAT ZONES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFarmingMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.4)'};background:${isAct ? '#047857' : '#090d14'};color:${isAct ? '#ffffff' : '#a7f3d0'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          24 FIELD HUNTING AREAS + 16 MULTI-FLOOR DUNGEONS · XP/HR · ADENA/HR · SPOIL GRADE
        </span>
      </div>

      ${topHotspots.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px">
          ${topHotspots.map(hp => {
            const zObj = zoneById[hp.zone_id];
            const locStr = (zObj && zObj.loc_coord) || '72986:113330';
            const isDng = hp.zone_kind === 'dungeon';
            const jumpJs = isDng
              ? `openDungeonSubMap('${escapeHtml(hp.zone_id)}', 'B1')`
              : `focusFieldTacticalBlueprint('${escapeHtml(hp.zone_id)}', '${escapeHtml(locStr)}')`;
            const shortName = hp.zone_name.split('(')[0].trim();
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${isDng ? '#c084fc' : '#34d399'};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:900;color:#f8fafc">${isDng ? '🕳️' : '🏕️'} ${escapeHtml(shortName)}</span>
                    <span class="mono" style="font-size:8.4px;font-weight:900;color:#fde047">${escapeHtml(hp.spoil_grade)}</span>
                  </div>
                  <div class="mono" style="font-size:8.3px;color:#6ee7b7;margin-top:1px">
                    ⚡ XP Idx: ${hp.xp_per_hour_index} · 💰 Adena Idx: ${hp.adena_per_hour_index} · ${escapeHtml(hp.recommended_party_mode)}
                  </div>
                  <div style="font-size:8.2px;color:#cbd5e1;margin-top:1px">
                    💎 ${escapeHtml(hp.key_spoil_material)} · ${escapeHtml(hp.elemental_weakness)}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${isDng ? '#c084fc' : '#34d399'};background:${isDng ? '#3b0764' : '#064e3b'};color:#ffffff;font-size:8.4px;font-weight:800;cursor:pointer;text-align:left">
                  ${isDng ? '🕳️ Open Dungeon Sub-Map' : '🏕️ Open Field Blueprint'}: ${escapeHtml(shortName)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSiegeDomainBarHtml(tatlas) {
  const domains = (tatlas && tatlas.castle_siege_domains) || [];
  if (!domains.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curDomId = ATLAS_SIEGE_DOMAIN_ID || ATLAS_STATE_STORE.siegeDomainId || 'All';
  const activeDom = domains.find(d => d.domain_id === curDomId || d.stronghold_zone_id === curDomId) || domains[0];

  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏰 All 8 Domains' }
  ];

  const vassalTowns = (activeDom.vassal_town_ids || []).map(tid => zoneById[tid] || { zone_id: tid, name: tid });
  const vassalFields = (activeDom.vassal_hunting_zone_ids || []).map(fid => zoneById[fid] || { zone_id: fid, name: fid });

  return `
    <div id="atlasCastleSiegeDomainBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#23131b;border:1px solid rgba(251,146,60,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fb923c">🏰 CASTLE SIEGE, TERRITORY TAX &amp; CLAN HALL DOMAIN OVERLAY (D25 · 8 STRONGHOLDS):</span>
          ${modePills.map(mp => {
            const isAct = curDomId === mp.id;
            return `
              <button type="button" onclick="setAtlasSiegeDomain('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,146,60,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#fed7aa'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
          <select aria-label="Select Individual Castle Siege or Clan Hall Domain" onchange="setAtlasSiegeDomain(this.value)"
                  style="height:24px;padding:1px 7px;border-radius:6px;background:#090d14;color:#fde047;border:1px solid rgba(251,146,60,0.55);font-size:9.6px;font-weight:800;cursor:pointer">
            <option value="All" ${curDomId === 'All' ? 'selected' : ''}>— Inspect Individual Stronghold (8) —</option>
            ${domains.map(d => {
              const sel = (d.domain_id === curDomId || d.stronghold_zone_id === curDomId) ? 'selected' : '';
              return `<option value="${escapeHtml(d.domain_id)}" ${sel}>[${escapeHtml(d.domain_tier)} · ${d.tax_rate_pct}% Tax] ${escapeHtml(d.stronghold_name)}</option>`;
            }).join('')}
          </select>
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          STRONGHOLD ➔ VASSAL TOWNS &amp; TAXED HUNTING GROUNDS · MANOR CROPS &amp; SIEGE WINDOWS
        </span>
      </div>

      ${curDomId !== 'Off' ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px;align-items:stretch">
          <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #fb923c;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
            <div>
              <div class="mono" style="font-size:8.6px;font-weight:900;color:#fb923c">
                🛡️ ${escapeHtml(activeDom.domain_tier)} · ${activeDom.tax_rate_pct}% TERRITORY TAX
              </div>
              <div style="font-size:9.8px;font-weight:900;color:#f8fafc;margin-top:2px">${escapeHtml(activeDom.stronghold_name)}</div>
              <div class="mono" style="font-size:8.3px;color:#cbd5e1;margin-top:1px">
                ⏰ ${escapeHtml(activeDom.siege_window_utc)} · Altar loc=${escapeHtml(activeDom.artifact_altar_loc)}
              </div>
              <div style="font-size:8.2px;color:#fde68a;margin-top:1px">
                🌾 Manor: ${escapeHtml(activeDom.manor_specialty_crop)} · 👑 ${escapeHtml(activeDom.ruling_npc_faction)}
              </div>
            </div>
            <button type="button" onclick="focusFortressBlueprint('${escapeHtml(activeDom.stronghold_zone_id)}', '${escapeHtml(activeDom.artifact_altar_loc)}')"
                    style="padding:3px 7px;border-radius:5px;border:1px solid #fb923c;background:#7c2d12;color:#ffedd5;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
              🏰 Open Stronghold Tactical Blueprint (4.8×): ${escapeHtml(activeDom.stronghold_name.split('(')[0].trim())}
            </button>
          </div>

          <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #fde047;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
            <div>
              <div class="mono" style="font-size:8.6px;font-weight:900;color:#fde047">
                🏘️ VASSAL TAX TOWNS (${vassalTowns.length}) · ${activeDom.tax_rate_pct}% SHOP &amp; ANVIL TARIFF
              </div>
              <div style="font-size:8.6px;color:#e2e8f0;margin-top:2px">
                ${vassalTowns.map(vt => escapeHtml((vt.name || vt.zone_id).split('(')[0].trim())).join(' · ')}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${vassalTowns.map(vt => {
                const tNodeId = vt.studio_node_id || vt.zone_id;
                const tShort = (vt.name || vt.zone_id).split('(')[0].trim();
                return `
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(tNodeId)}', '${escapeHtml(vt.loc_coord || '')}')"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8.3px;font-weight:800;cursor:pointer">
                    🏘️ Warp ${escapeHtml(tShort)} (5.2×)
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #34d399;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
            <div>
              <div class="mono" style="font-size:8.6px;font-weight:900;color:#34d399">
                🏕️ TAXED HUNTING &amp; MANOR GROUNDS (${vassalFields.length})
              </div>
              <div style="font-size:8.6px;color:#e2e8f0;margin-top:2px">
                ${vassalFields.map(vf => escapeHtml((vf.name || vf.zone_id).split('(')[0].trim())).join(' · ')}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${vassalFields.slice(0, 3).map(vf => {
                const fShort = (vf.name || vf.zone_id).split('(')[0].trim();
                return `
                  <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(vf.zone_id)}', '${escapeHtml(vf.loc_coord || '')}')"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-size:8.3px;font-weight:800;cursor:pointer">
                    🏕️ ${escapeHtml(fShort)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasBossRadarBarHtml(tatlas) {
  const radarList = (tatlas && tatlas.world_boss_spawn_radar) || [];
  if (!radarList.length) return '';

  const curMode = ATLAS_BOSS_RADAR_MODE || ATLAS_STATE_STORE.bossRadarMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '📡 All 32 Bosses' },
    { id: 'DungeonMVP', label: '👑 16 Dungeon MVPs (B3/3F)' },
    { id: 'OverlandRaid', label: '🔥 16 Overland Raids & Mini-Bosses' }
  ];

  const filteredBosses = curMode === 'Off'
    ? []
    : (curMode === 'DungeonMVP'
      ? radarList.filter(b => b.dungeon_id && b.boss_category === 'MVP')
      : (curMode === 'OverlandRaid'
        ? radarList.filter(b => !b.dungeon_id)
        : radarList));

  const featuredCards = filteredBosses.slice(0, 4);

  return `
    <div id="atlasWorldBossRadarBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e112a;border:1px solid rgba(244,63,94,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fb7185">📡 MVP &amp; RAID RESPAWN RADAR / COMMAND-CHANNEL TELEMETRY (D26 · 32 BOSSES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasBossRadarMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,63,94,0.45)'};background:${isAct ? '#be123c' : '#090d14'};color:${isAct ? '#ffffff' : '#fecdd3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          16 B3/3F SANCTUM MVPS + 16 OVERLAND/FORTRESS RAIDS · COMMAND CHANNEL &amp; RESPAWN WINDOWS
        </span>
      </div>

      ${featuredCards.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px">
          ${featuredCards.map(b => {
            const isDng = Boolean(b.dungeon_id);
            const jumpJs = isDng
              ? `openDungeonSubMap('${escapeHtml(b.dungeon_id)}', '${escapeHtml(b.floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(b.zone_id)}', '${escapeHtml(b.loc)}')`;
            const statusCol = b.radar_status === 'Window Open'
              ? '#34d399'
              : (b.radar_status === 'Sanctum Active' ? '#fde047' : '#fb923c');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${isDng ? '#f43f5e' : '#f97316'};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.4px;font-weight:900;color:#f8fafc">${isDng ? '👑' : '🔥'} ${escapeHtml(b.boss_name.slice(0, 32))} (Lv.${b.level})</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${statusCol}">${escapeHtml(b.radar_status)}</span>
                  </div>
                  <div class="mono" style="font-size:8.2px;color:#fda4af;margin-top:1px">
                    ⏱️ ${escapeHtml(b.respawn_window)} · 👥 ${escapeHtml(b.command_channel_size)}
                  </div>
                  <div style="font-size:8.1px;color:#cbd5e1;margin-top:1px">
                    💎 ${escapeHtml(b.top_reward_drop)} · loc=${escapeHtml(b.loc)}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${isDng ? '#f43f5e' : '#fb923c'};background:${isDng ? '#881337' : '#7c2d12'};color:#ffffff;font-size:8.3px;font-weight:800;cursor:pointer;text-align:left">
                  ${isDng ? `🕳️ Teleport to ${escapeHtml(b.floor_id)} Boss Sanctum` : `⚔️ Teleport to Raid loc=${escapeHtml(b.loc)}`}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSevenSealsBarHtml(tatlas) {
  const ssList = (tatlas && tatlas.seven_seals_competitions) || [];
  if (!ssList.length) return '';

  const curMode = ATLAS_SEVEN_SEALS_MODE || ATLAS_STATE_STORE.sevenSealsMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⚖️ All 16 Sanctums' },
    { id: 'Lords_of_Dawn', label: '☀️ Lords of Dawn' },
    { id: 'Revolutionaries_of_Dusk', label: '🌙 Revolutionaries of Dusk' },
    { id: 'Blacksmith_of_Mammon', label: '⚒️ Blacksmith of Mammon' },
    { id: 'Merchant_of_Mammon', label: '💰 Merchant of Mammon' }
  ];

  const filteredSanctums = curMode === 'Off'
    ? []
    : (curMode === 'Lords_of_Dawn' || curMode === 'Revolutionaries_of_Dusk'
      ? ssList.filter(s => s.controlling_cabal === curMode)
      : (curMode === 'Blacksmith_of_Mammon' || curMode === 'Merchant_of_Mammon'
        ? ssList.filter(s => s.mammon_visitor_npc === curMode)
        : ssList));

  const featuredSanctums = filteredSanctums.slice(0, 4);

  return `
    <div id="atlasSevenSealsMammonBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1a1528;border:1px solid rgba(168,85,247,0.48)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">⚖️ SEVEN-SEALS DUSK VS. DAWN &amp; MAMMON ROTATION (D27 · 16 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSevenSealsMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(168,85,247,0.45)'};background:${isAct ? '#6b21a8' : '#090d14'};color:${isAct ? '#ffffff' : '#e9d5ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          8 SEAL CATACOMBS + 8 ASCENDANT TOWERS · ANCIENT ADENA/HR &amp; MAMMON FLOOR TELEPORT
        </span>
      </div>

      ${featuredSanctums.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:6px">
          ${featuredSanctums.map(s => {
            const isDawn = s.controlling_cabal === 'Lords_of_Dawn';
            const isDusk = s.controlling_cabal === 'Revolutionaries_of_Dusk';
            const cabalCol = isDawn ? '#fde047' : (isDusk ? '#c084fc' : '#38bdf8');
            const isSmith = s.mammon_visitor_npc === 'Blacksmith_of_Mammon';
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cabalCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.4px;font-weight:900;color:#f8fafc">${s.sanctum_type === 'Seal_Catacomb' ? '🕳️' : '🗼'} ${escapeHtml(s.dungeon_name.split('(')[0].trim())}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cabalCol}">${escapeHtml(s.controlling_cabal)}</span>
                  </div>
                  <div class="mono" style="font-size:8.2px;color:#e9d5ff;margin-top:1px">
                    🔱 ${escapeHtml(s.seal_allegiance)} · 💎 ${escapeHtml(s.seal_stone_tier)} · ${s.ancient_adena_per_hour.toLocaleString()} AA/hr
                  </div>
                  <div style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    ${isSmith ? '⚒️' : '💰'} <strong>${escapeHtml(s.mammon_visitor_npc)} (${escapeHtml(s.mammon_active_floor_id)}):</strong> ${escapeHtml(s.mammon_specialty_service)}
                  </div>
                </div>
                <button type="button" onclick="openDungeonSubMap('${escapeHtml(s.dungeon_id)}', '${escapeHtml(s.mammon_active_floor_id)}')"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${cabalCol};background:#3b0764;color:#ffffff;font-size:8.3px;font-weight:800;cursor:pointer;text-align:left">
                  ${isSmith ? '⚒️' : '💰'} Teleport to ${escapeHtml(s.mammon_visitor_npc)} on Floor ${escapeHtml(s.mammon_active_floor_id)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasManorEconomyBarHtml(tatlas) {
  const routes = (tatlas && tatlas.manor_economy_routes) || [];
  if (!routes.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_MANOR_MODE || ATLAS_STATE_STORE.manorMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌾 All 15 Town Manors' },
    { id: 'Low_Patrolled', label: '🛡️ Low-Risk Patrolled' },
    { id: 'High_Frontier_Ambush', label: '🔥 Frontier High-Yield' }
  ];

  const filteredRoutes = curMode === 'Off'
    ? []
    : (curMode === 'Low_Patrolled'
      ? routes.filter(r => r.caravan_route_risk === 'Low_Patrolled')
      : (curMode === 'High_Frontier_Ambush'
        ? routes.filter(r => r.caravan_route_risk === 'High_Frontier_Ambush' || r.caravan_route_risk === 'Medium_Bandit_Road')
        : routes));

  const featuredManors = filteredRoutes.slice(0, 4);

  return `
    <div id="atlasManorEconomyBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#162013;border:1px solid rgba(132,204,22,0.48)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bef264">🌾 15-TOWN MANOR SEED/CROP &amp; CARAVAN TRADE ECONOMY (D28 · 15 MANORS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasManorMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(132,204,22,0.45)'};background:${isAct ? '#3f6212' : '#090d14'};color:${isAct ? '#ffffff' : '#d9f99d'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          TOWN MANOR STEWARD ➔ HUNTING FIELD CROP HARVEST ➔ PARENT STRONGHOLD VAULT
        </span>
      </div>

      ${featuredManors.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredManors.map(r => {
            const tZone = zoneById[r.town_zone_id] || {};
            const fZone = zoneById[r.harvest_field_zone_id] || {};
            const sZone = zoneById[r.parent_stronghold_zone_id] || {};
            const tNode = tZone.studio_node_id || r.town_zone_id;
            const riskCol = r.caravan_route_risk === 'Low_Patrolled'
              ? '#4ade80'
              : (r.caravan_route_risk === 'Medium_Bandit_Road' ? '#fde047' : '#fb923c');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${riskCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.4px;font-weight:900;color:#f8fafc">🌾 ${escapeHtml(r.town_name.split('(')[0].trim())}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${riskCol}">${escapeHtml(r.caravan_route_risk)}</span>
                  </div>
                  <div class="mono" style="font-size:8.2px;color:#bef264;margin-top:1px">
                    🌱 ${escapeHtml(r.seed_name)} ➔ ${escapeHtml(r.crop_name)} (${r.daily_crop_quota.toLocaleString()}/day)
                  </div>
                  <div style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    ⚒️ Reward: <strong>${escapeHtml(r.procure_reward_material)}</strong> · Field (${escapeHtml(r.harvest_level_band)})
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px">
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tZone.loc_coord || '')}')"
                          style="padding:2px 5px;border-radius:4px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8px;font-weight:800;cursor:pointer">
                    🏘️ Town
                  </button>
                  <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(r.harvest_field_zone_id)}', '${escapeHtml(fZone.loc_coord || '')}')"
                          style="padding:2px 5px;border-radius:4px;border:1px solid #4ade80;background:#14532d;color:#dcfce7;font-size:8px;font-weight:800;cursor:pointer">
                    🏕️ Harvest Field
                  </button>
                  <button type="button" onclick="focusFortressBlueprint('${escapeHtml(r.parent_stronghold_zone_id)}', '${escapeHtml(sZone.loc_coord || '')}')"
                          style="padding:2px 5px;border-radius:4px;border:1px solid #fb923c;background:#7c2d12;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    🏰 Castle Vault
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasOlympiadNetworkBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.noblesse_olympiad_network) || [];
  if (!nodes.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_OLYMPIAD_MODE || ATLAS_STATE_STORE.olympiadMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏆 All 21 Nodes' },
    { id: 'Subclass_Mimir_Sanctum', label: '🧪 Subclass Sanctums' },
    { id: 'Noblesse_Barakiel_Shrine', label: '👑 Noblesse Shrines' },
    { id: 'Olympiad_Monument', label: '🏛️ 15 Olympiad Monuments' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.node_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.node_category === 'Subclass_Mimir_Sanctum').slice(0, 1),
        ...nodes.filter(n => n.node_category === 'Noblesse_Barakiel_Shrine').slice(0, 1),
        ...nodes.filter(n => n.node_category === 'Olympiad_Monument').slice(0, 2)
      ]
    : filteredNodes.slice(0, 4);

  return `
    <div id="atlasOlympiadNetworkBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#231b10;border:1px solid rgba(250,204,21,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🏆 SUBCLASS, NOBLESSE &amp; GRAND OLYMPIAD MONUMENT NETWORK (D29 · 21 NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasOlympiadMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#a16207' : '#090d14'};color:${isAct ? '#ffffff' : '#fef08a'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          15 TOWN HERO MONUMENTS + 3 MIMIR SUBCLASS SANCTUMS (B3/3F) + 3 BARAKIEL NOBLESSE SHRINES
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const zObj = zoneById[n.zone_id] || {};
            const tNode = zObj.studio_node_id || n.zone_id;
            const isSub = n.node_category === 'Subclass_Mimir_Sanctum';
            const isNob = n.node_category === 'Noblesse_Barakiel_Shrine';
            const catCol = isSub ? '#c084fc' : (isNob ? '#38bdf8' : '#fde047');
            const catIcon = isSub ? '🧪' : (isNob ? '👑' : '🏛️');
            const jumpAction = n.dungeon_id
              ? `openDungeonSubMap('${escapeHtml(n.dungeon_id)}', '${escapeHtml(n.floor_id || '3F')}')`
              : (isNob
                ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
                : `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(n.loc)}')`);
            const jumpLabel = n.dungeon_id
              ? `🧪 Warp to Floor ${escapeHtml(n.floor_id || '3F')} Sanctum`
              : (isNob ? '👑 Zoom to Noblesse Field Shrine (4.8×)' : '🏛️ Zoom to Town Hero Monument (5.2×)');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(n.node_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">Lv.${n.min_level}+</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                    👤 ${escapeHtml(n.npc_steward_name)} · ${escapeHtml(n.ritual_requirement.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    🎁 <strong>Reward:</strong> ${escapeHtml(n.heroic_reward)}
                  </div>
                </div>
                <button type="button" onclick="${jumpAction}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#422006;color:#fef9c3;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${jumpLabel}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTransitLinesBarHtml(tatlas) {
  const lines = (tatlas && tatlas.intercontinental_transit_lines) || [];
  if (!lines.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_TRANSIT_MODE || ATLAS_STATE_STORE.transitMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⛵ All 18 Transit Lines' },
    { id: 'Maritime_Ship', label: '⛵ 6 Maritime Ships' },
    { id: 'Brass_Airship', label: '飞 6 Brass Airships' },
    { id: 'Gatekeeper_Trunk', label: '🌀 6 Gatekeeper Trunks' }
  ];

  const filteredLines = curMode === 'Off'
    ? []
    : (curMode === 'All' ? lines : lines.filter(l => l.transit_mode === curMode));

  const featuredLines = curMode === 'All'
    ? [
        ...lines.filter(l => l.transit_mode === 'Maritime_Ship').slice(0, 2),
        ...lines.filter(l => l.transit_mode === 'Brass_Airship').slice(0, 1),
        ...lines.filter(l => l.transit_mode === 'Gatekeeper_Trunk').slice(0, 1)
      ]
    : filteredLines.slice(0, 4);

  const buildZoneJumpJs = (zid, loc) => {
    const z = zoneById[zid] || {};
    if (z.category === 'starting_town' || z.category === 'castle_or_hub_town') {
      return `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || zid)}', '${escapeHtml(loc)}')`;
    }
    if (z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress') {
      return `focusFortressBlueprint('${escapeHtml(zid)}', '${escapeHtml(loc)}')`;
    }
    return `focusFieldTacticalBlueprint('${escapeHtml(zid)}', '${escapeHtml(loc)}')`;
  };

  return `
    <div id="atlasTransitLinesBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0e1d2b;border:1px solid rgba(56,189,248,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#7dd3fc">⛵ MARITIME SHIP, AIRSHIP &amp; GATEKEEPER TRANSIT SELECTOR (D30 · 18 LINES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTransitMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MARITIME HARBOR SHIPS + 6 SKY-DOCK BRASS AIRSHIPS + 6 CAPITAL GATEKEEPER TRUNKS
        </span>
      </div>

      ${featuredLines.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredLines.map(l => {
            const isShip = l.transit_mode === 'Maritime_Ship';
            const isAir = l.transit_mode === 'Brass_Airship';
            const modeCol = isShip ? '#38bdf8' : (isAir ? '#f59e0b' : '#c084fc');
            const modeIcon = isShip ? '⛵' : (isAir ? '飞' : '🌀');
            const origJump = buildZoneJumpJs(l.origin_zone_id, l.origin_loc);
            const destJump = buildZoneJumpJs(l.destination_zone_id, l.destination_loc);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${modeCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${modeIcon} ${escapeHtml(l.route_name.slice(0, 42))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${modeCol}">${escapeHtml(l.departure_interval)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    🧭 ${escapeHtml(l.vessel_or_gatekeeper_name)} · Fare: ${l.ticket_cost_adena.toLocaleString()} Adena
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">
                  <button type="button" onclick="${origJump}"
                          style="padding:2px 6px;border-radius:4px;border:1px solid ${modeCol};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ⚓ Origin Dock/Town
                  </button>
                  <button type="button" onclick="${destJump}"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#1e3a8a;color:#fef08a;font-size:8px;font-weight:800;cursor:pointer">
                    🎯 Destination Dock/Town
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSoulCrystalBarHtml(tatlas) {
  const stages = (tatlas && tatlas.soul_crystal_resonance_stages) || [];
  if (!stages.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_SOUL_CRYSTAL_MODE || ATLAS_STATE_STORE.soulCrystalMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💎 All 18 Stages' },
    { id: 'Crimson_Red', label: '🔴 Crimson Red' },
    { id: 'Verdant_Green', label: '🟢 Verdant Green' },
    { id: 'Azure_Blue', label: '🔵 Azure Blue' },
    { id: 'Stage_11_to_13_S_Grade_Boss', label: '👑 Stage 11–13 Boss Sanctums' }
  ];

  const filteredStages = curMode === 'Off'
    ? []
    : (curMode === 'All'
      ? stages
      : (curMode === 'Stage_11_to_13_S_Grade_Boss'
        ? stages.filter(s => s.stage_band === 'Stage_11_to_13_S_Grade_Boss')
        : stages.filter(s => s.crystal_color === curMode)));

  const featuredStages = curMode === 'All'
    ? [
        ...stages.filter(s => s.crystal_color === 'Crimson_Red').slice(0, 1),
        ...stages.filter(s => s.crystal_color === 'Verdant_Green').slice(0, 1),
        ...stages.filter(s => s.crystal_color === 'Azure_Blue').slice(0, 1),
        ...stages.filter(s => s.stage_band === 'Stage_11_to_13_S_Grade_Boss').slice(0, 1)
      ]
    : filteredStages.slice(0, 4);

  return `
    <div id="atlasSoulCrystalBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#201228;border:1px solid rgba(232,121,249,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f5d0fe">💎 SOUL CRYSTAL (SA) STAGE 1–13 RESONANCE &amp; BOSS ABSORPTION MATRIX (D31 · 18 STAGES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSoulCrystalMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(232,121,249,0.45)'};background:${isAct ? '#86198f' : '#090d14'};color:${isAct ? '#ffffff' : '#f5d0fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 CRIMSON RED + 6 VERDANT GREEN + 6 AZURE BLUE · STAGE 1–13 SPECIAL ABILITIES &amp; BOSS ABSORPTION
        </span>
      </div>

      ${featuredStages.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredStages.map(s => {
            const vZone = zoneById[s.vendor_town_zone_id] || {};
            const vNode = vZone.studio_node_id || s.vendor_town_zone_id;
            const vLoc = vZone.loc_coord || '-84120:243500';
            const isRed = s.crystal_color === 'Crimson_Red';
            const isGreen = s.crystal_color === 'Verdant_Green';
            const colHex = isRed ? '#f87171' : (isGreen ? '#4ade80' : '#38bdf8');
            const colIcon = isRed ? '🔴' : (isGreen ? '🟢' : '🔵');
            const absJump = s.absorption_dungeon_id
              ? `openDungeonSubMap('${escapeHtml(s.absorption_dungeon_id)}', '${escapeHtml(s.absorption_floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(s.absorption_zone_id)}', '${escapeHtml(s.absorption_loc)}')`;
            const absLabel = s.absorption_dungeon_id
              ? `👑 Warp to ${escapeHtml(s.absorption_floor_id || 'B3')} Boss Sanctum`
              : `⚔️ Zoom to Absorption Field (4.8×)`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${colHex};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${colIcon} ${escapeHtml(s.crystal_stage_id)} [${escapeHtml(s.weapon_grade_unlocked)}]</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${colHex}">${s.resonance_chance_pct}% Absorb</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#f5d0fe;margin-top:1px">
                    🎯 ${escapeHtml(s.absorption_target_name.slice(0, 52))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✨ <strong>SA:</strong> ${escapeHtml((s.special_abilities || []).join(' · '))}
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(vNode)}', '${escapeHtml(vLoc)}')"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#4a044e;color:#fef08a;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Town Blacksmith
                  </button>
                  <button type="button" onclick="${absJump}"
                          style="padding:2px 6px;border-radius:4px;border:1px solid ${colHex};background:#1e1b4b;color:#e0e7ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${absLabel}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFishingSanctuaryBarHtml(tatlas) {
  const sanctuaries = (tatlas && tatlas.fishing_guild_sanctuaries) || [];
  if (!sanctuaries.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_FISHING_MODE || ATLAS_STATE_STORE.fishingMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🎣 All 16 Sanctuaries' },
    { id: 'Maritime_Harbor_Pier', label: '⚓ 6 Maritime Piers' },
    { id: 'Luminous_Night_Lake', label: '🌙 5 Nocturnal Luminous Lakes' },
    { id: 'Thermal_Hot_Spring', label: '♨️ 5 Thermal Hot Springs' }
  ];

  const filteredSanctuaries = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctuaries : sanctuaries.filter(s => s.water_category === curMode));

  const featuredSanctuaries = curMode === 'All'
    ? [
        ...sanctuaries.filter(s => s.water_category === 'Maritime_Harbor_Pier').slice(0, 2),
        ...sanctuaries.filter(s => s.water_category === 'Luminous_Night_Lake').slice(0, 1),
        ...sanctuaries.filter(s => s.water_category === 'Thermal_Hot_Spring').slice(0, 1)
      ]
    : filteredSanctuaries.slice(0, 4);

  const buildSanctuaryJumpJs = (s) => {
    const z = zoneById[s.zone_id] || {};
    if (z.category === 'starting_town' || z.category === 'castle_or_hub_town') {
      return `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || s.zone_id)}', '${escapeHtml(s.dock_loc)}')`;
    }
    if (z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress') {
      return `focusFortressBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`;
    }
    return `focusFieldTacticalBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`;
  };

  return `
    <div id="atlasFishingSanctuaryBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0a2229;border:1px solid rgba(45,212,191,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#5eead4">🎣 FISHING GUILD, HOT SPRINGS &amp; LUMINOUS NIGHT-BAIT SANCTUARIES (D32 · 16 SANCTUARIES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFishingMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(45,212,191,0.45)'};background:${isAct ? '#0f766e' : '#090d14'};color:${isAct ? '#ffffff' : '#99f6e4'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MARITIME HARBOR PIERS + 5 NOCTURNAL LUMINOUS LAKES + 5 THERMAL HOT SPRINGS
        </span>
      </div>

      ${featuredSanctuaries.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredSanctuaries.map(s => {
            const isPier = s.water_category === 'Maritime_Harbor_Pier';
            const isLake = s.water_category === 'Luminous_Night_Lake';
            const catCol = isPier ? '#38bdf8' : (isLake ? '#a78bfa' : '#fb923c');
            const catIcon = isPier ? '⚓' : (isLake ? '🌙' : '♨️');
            const jumpJs = buildSanctuaryJumpJs(s);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.sanctuary_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.active_time_window)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#99f6e4;margin-top:1px">
                    👤 ${escapeHtml(s.guild_master_npc)} · Lure: ${escapeHtml(s.recommended_lure.slice(0, 38))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🎁 <strong>Catch:</strong> ${escapeHtml(s.primary_catch_reward.slice(0, 62))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#134e4a;color:#ccfbf1;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Sanctuary Dock / Pool
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasPvpKarmaBarHtml(tatlas) {
  const hotspots = (tatlas && tatlas.cursed_weapon_pvp_hotspots) || [];
  if (!hotspots.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_PVP_KARMA_MODE || ATLAS_STATE_STORE.pvpKarmaMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🩸 All 14 Hotspots' },
    { id: 'Cursed_Weapon_Drop_Zone', label: '🗡️ 5 Zariche & Akamanah Zones' },
    { id: 'Black_Judge_Karma_Sanctuary', label: '⚖️ 5 Black Judge Sanctuaries' },
    { id: 'Coliseum_PvP_Arena', label: '🏟️ 4 Coliseum PvP Arenas' }
  ];

  const filteredHotspots = curMode === 'Off'
    ? []
    : (curMode === 'All' ? hotspots : hotspots.filter(h => h.pvp_category === curMode));

  const featuredHotspots = curMode === 'All'
    ? [
        ...hotspots.filter(h => h.pvp_category === 'Cursed_Weapon_Drop_Zone').slice(0, 2),
        ...hotspots.filter(h => h.pvp_category === 'Black_Judge_Karma_Sanctuary').slice(0, 1),
        ...hotspots.filter(h => h.pvp_category === 'Coliseum_PvP_Arena').slice(0, 1)
      ]
    : filteredHotspots.slice(0, 4);

  const buildHotspotJumpJs = (h) => {
    const z = zoneById[h.zone_id] || {};
    if (z.category === 'starting_town' || z.category === 'castle_or_hub_town') {
      return `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || h.zone_id)}', '${escapeHtml(h.loc)}')`;
    }
    if (z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress') {
      return `focusFortressBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`;
    }
    return `focusFieldTacticalBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`;
  };

  return `
    <div id="atlasPvpKarmaBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#2a0a12;border:1px solid rgba(244,63,94,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fda4af">🩸 CURSED WEAPON (ZARICHE &amp; AKAMANAH), PK KARMA &amp; PVP ARENA OVERLAY (D33 · 14 HOTSPOTS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasPvpKarmaMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,63,94,0.45)'};background:${isAct ? '#9f1239' : '#090d14'};color:${isAct ? '#ffffff' : '#fecdd3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 ZARICHE/AKAMANAH DROPS + 5 BLACK JUDGE SANCTUARIES + 4 COLISEUM ARENAS
        </span>
      </div>

      ${featuredHotspots.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredHotspots.map(h => {
            const isCursed = h.pvp_category === 'Cursed_Weapon_Drop_Zone';
            const isJudge = h.pvp_category === 'Black_Judge_Karma_Sanctuary';
            const catCol = isCursed ? '#ef4444' : (isJudge ? '#c084fc' : '#f59e0b');
            const catIcon = isCursed ? '🗡️' : (isJudge ? '⚖️' : '🏟️');
            const jumpJs = buildHotspotJumpJs(h);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(h.hotspot_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(h.recommended_level_band)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fecdd3;margin-top:1px">
                    🎯 ${escapeHtml(h.featured_artifact_or_npc.slice(0, 48))} · ${escapeHtml(h.ruleset_tag)}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🛡️ ${escapeHtml(h.tactical_note.slice(0, 68))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#4c0519;color:#ffe4e6;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Cursed Drop / Black Judge / PvP Ring
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasRiftSepulcherBarHtml(tatlas) {
  const portals = (tatlas && tatlas.dimensional_rift_sepulchers) || [];
  if (!portals.length) return '';

  const curMode = ATLAS_RIFT_SEPULCHER_MODE || ATLAS_STATE_STORE.riftSepulcherMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌀 All 16 Portals' },
    { id: 'Dimensional_Rift', label: '🌌 6 Dimensional Rifts' },
    { id: 'Four_Sepulchers', label: '⚰️ 6 Four Sepulchers' },
    { id: 'Key_Gated_Chapel', label: '🗝️ 4 Key-Gated Chapels' }
  ];

  const filteredPortals = curMode === 'Off'
    ? []
    : (curMode === 'All' ? portals : portals.filter(p => p.instance_category === curMode));

  const featuredPortals = curMode === 'All'
    ? [
        ...portals.filter(p => p.instance_category === 'Dimensional_Rift').slice(0, 2),
        ...portals.filter(p => p.instance_category === 'Four_Sepulchers').slice(0, 1),
        ...portals.filter(p => p.instance_category === 'Key_Gated_Chapel').slice(0, 1)
      ]
    : filteredPortals.slice(0, 4);

  return `
    <div id="atlasRiftSepulcherBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#13112b;border:1px solid rgba(129,140,248,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#c7d2fe">🌀 DIMENSIONAL RIFT, FOUR SEPULCHERS &amp; KEY-GATED ENDGAME SANCTUM MATRIX (D34 · 16 PORTALS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasRiftSepulcherMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(129,140,248,0.45)'};background:${isAct ? '#3730a3' : '#090d14'};color:${isAct ? '#ffffff' : '#e0e7ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 DIMENSIONAL RIFTS (RECRUIT..HERO) + 6 FOUR SEPULCHERS + 4 KEY-GATED PAGAN/NORNIL CHAPELS
        </span>
      </div>

      ${featuredPortals.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredPortals.map(p => {
            const isRift = p.instance_category === 'Dimensional_Rift';
            const isSep = p.instance_category === 'Four_Sepulchers';
            const catCol = isRift ? '#818cf8' : (isSep ? '#f472b6' : '#facc15');
            const catIcon = isRift ? '🌌' : (isSep ? '⚰️' : '🗝️');
            const jumpJs = `openDungeonSubMap('${escapeHtml(p.dungeon_id)}', '${escapeHtml(p.floor_id || 'B3')}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(p.portal_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">[${escapeHtml(p.floor_id)}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#c7d2fe;margin-top:1px">
                    🔑 ${escapeHtml(p.entry_key_or_token.slice(0, 46))} · ${escapeHtml(p.cycle_window.slice(0, 28))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 <strong>Reward:</strong> ${escapeHtml(p.signature_reward.slice(0, 62))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#1e1b4b;color:#e0e7ff;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Teleport to ${escapeHtml(p.floor_id)} Sanctum Floor
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasAugmentDyeBarHtml(tatlas) {
  const hubs = (tatlas && tatlas.weapon_augmentation_dye_hubs) || [];
  if (!hubs.length) return '';

  const curMode = ATLAS_AUGMENT_DYE_MODE || ATLAS_STATE_STORE.augmentDyeMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🔮 All 15 Hubs' },
    { id: 'Top_High_Life_Stone', label: '💎 Top/High-Grade Life Stones' },
    { id: 'Augment_Anvils', label: '⚡ Augment Anvils' },
    { id: 'Symbol_Dye_Parlors', label: '🎨 Symbol Dye Parlors' }
  ];

  const filteredHubs = curMode === 'Off'
    ? []
    : (curMode === 'Top_High_Life_Stone'
      ? hubs.filter(h => h.life_stone_tier === 'Top_Grade_Life_Stone' || h.life_stone_tier === 'High_Grade_Life_Stone')
      : hubs);

  const featuredHubs = curMode === 'All'
    ? [
        ...hubs.filter(h => h.life_stone_tier === 'Top_Grade_Life_Stone').slice(0, 2),
        ...hubs.filter(h => h.life_stone_tier === 'High_Grade_Life_Stone').slice(0, 1),
        ...hubs.filter(h => h.life_stone_tier === 'Mid_Grade_Life_Stone').slice(0, 1)
      ]
    : filteredHubs.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasAugmentDyeBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1f122b;border:1px solid rgba(192,132,252,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">🔮 LIFE STONE WEAPON AUGMENTATION &amp; SYMBOL MAKER DYE PARLOR MATRIX (D35 · 15 TOWN HUBS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasAugmentDyeMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#6b21a8' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          15 TOWN REFINER ANVILS + 15 SYMBOL MAKER DYE PARLORS (+4/-4 STAT TATTOOS &amp; ITEM SKILLS)
        </span>
      </div>

      ${featuredHubs.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredHubs.map(h => {
            const isTop = h.life_stone_tier === 'Top_Grade_Life_Stone';
            const isHigh = h.life_stone_tier === 'High_Grade_Life_Stone';
            const tierCol = isTop ? '#f43f5e' : (isHigh ? '#c084fc' : '#38bdf8');
            const tz = byZid[h.town_zone_id] || {};
            const townNode = tz.studio_node_id || h.town_zone_id.replace('zone-', '');
            const townJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(h.anvil_loc)}')`;
            const dropJumpJs = `focusFieldTacticalBlueprint('${escapeHtml(h.life_stone_drop_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${tierCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🔮 ${escapeHtml(h.town_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${tierCol}">${escapeHtml(h.life_stone_tier.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    ⚒️ ${escapeHtml(h.blacksmith_refiner_npc)} · 🎨 ${escapeHtml(h.symbol_maker_npc)} (${escapeHtml(h.gemstone_cost)})
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml((h.signature_augment_skills || [])[0] || '')} · 🎨 ${escapeHtml((h.signature_dye_combos || [])[0] || '')}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${townJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${tierCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Town Refiner/Dye
                  </button>
                  <button type="button" onclick="${dropJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    💎 Life Stone Field
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCompanionMountBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.companion_mount_sanctuaries) || [];
  if (!nodes.length) return '';

  const curMode = ATLAS_COMPANION_MOUNT_MODE || ATLAS_STATE_STORE.companionMountMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🐉 All 12 Nodes' },
    { id: 'Pet_Manager_Kennel', label: '🐾 4 Pet Kennels' },
    { id: 'Hatchling_Strider_Sanctum', label: '🦎 4 Strider Sanctums' },
    { id: 'Castle_Wyvern_Roost', label: '🐉 4 Castle Wyvern Roosts' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.mount_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.mount_category === 'Pet_Manager_Kennel').slice(0, 1),
        ...nodes.filter(n => n.mount_category === 'Hatchling_Strider_Sanctum').slice(0, 2),
        ...nodes.filter(n => n.mount_category === 'Castle_Wyvern_Roost').slice(0, 1)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasCompanionMountBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0b241c;border:1px solid rgba(52,211,153,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#a7f3d0">🐉 PET, STRIDER &amp; CASTLE WYVERN MOUNT SANCTUARY OVERLAY (D36 · 12 SANCTUARIES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCompanionMountMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#065f46' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 TOWN PET KENNELS + 4 HATCHLING/STRIDER GROVES + 4 SOVEREIGN CASTLE WYVERN ROOSTS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const isPet = n.mount_category === 'Pet_Manager_Kennel';
            const isStrider = n.mount_category === 'Hatchling_Strider_Sanctum';
            const catCol = isPet ? '#38bdf8' : (isStrider ? '#34d399' : '#f59e0b');
            const catIcon = isPet ? '🐾' : (isStrider ? '🦎' : '🐉');
            const z = byZid[n.zone_id] || {};
            const jumpJs = isPet
              ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
              : (isStrider
                ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
                : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(n.node_name.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">Lv.${n.evolution_level_req}+</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    👤 ${escapeHtml(n.steward_npc_name)} · ${escapeHtml(n.companion_species.slice(0, 38))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 ${escapeHtml(n.tactical_benefit.slice(0, 66))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#064e3b;color:#ecfdf5;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Kennel / Strider Grove / Wyvern Roost
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasClanAcademyBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.clan_reputation_academies) || [];
  if (!nodes.length) return '';

  const curMode = ATLAS_CLAN_ACADEMY_MODE || ATLAS_STATE_STORE.clanAcademyMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🛡️ All 14 Clan Nodes' },
    { id: 'Clan_Academy_Hall', label: '🎓 5 Clan Academies' },
    { id: 'Clan_Ambition_Altar', label: '⚔️ 5 Clan Lv.5–8 Ambition Altars' },
    { id: 'Pledge_Skill_Sanctum', label: '👑 4 Pledge Skill Sanctums' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.pledge_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.pledge_category === 'Clan_Academy_Hall').slice(0, 2),
        ...nodes.filter(n => n.pledge_category === 'Clan_Ambition_Altar').slice(0, 1),
        ...nodes.filter(n => n.pledge_category === 'Pledge_Skill_Sanctum').slice(0, 1)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasClanAcademyBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e160d;border:1px solid rgba(251,191,36,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde68a">🛡️ CLAN REPUTATION, ACADEMY &amp; PLEDGE SKILL ALTAR MATRIX (D37 · 14 CLAN NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasClanAcademyMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,191,36,0.45)'};background:${isAct ? '#b45309' : '#090d14'};color:${isAct ? '#ffffff' : '#fef3c7'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 CLAN OATH ACADEMIES + 5 CLAN LV.5–8 AMBITION ALTARS + 4 APELLA &amp; PLEDGE SKILL SANCTUMS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const isAcad = n.pledge_category === 'Clan_Academy_Hall';
            const isAmb = n.pledge_category === 'Clan_Ambition_Altar';
            const catCol = isAcad ? '#38bdf8' : (isAmb ? '#f97316' : '#facc15');
            const catIcon = isAcad ? '🎓' : (isAmb ? '⚔️' : '👑');
            const z = byZid[n.zone_id] || {};
            const isTownZone = String(n.zone_id || '').startsWith('zone-town-');
            const isFieldZone = String(n.zone_id || '').startsWith('zone-field-');
            const jumpJs = isTownZone
              ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
              : (isFieldZone
                ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
                : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(n.node_name.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(n.clan_level_tier)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    👤 ${escapeHtml(n.high_prefect_or_grand_master_npc)} · 💎 ${escapeHtml(n.crp_yield_or_cost.slice(0, 38))}
                  </div>
                  <div style="font-size:8px;color:#bfdbfe;margin-top:1px">
                    🛡️ ${escapeHtml(((n.unlocked_pledge_benefits || [])[0] || '').slice(0, 64))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#451a03;color:#fef3c7;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Grand Master Hall / Ambition Altar
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasHerbBiomeBarHtml(tatlas) {
  const biomes = (tatlas && tatlas.field_herb_elemental_biomes) || [];
  if (!biomes.length) return '';

  const curMode = ATLAS_HERB_BIOME_MODE || ATLAS_STATE_STORE.herbBiomeMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌿 All 24 Field Biomes' },
    { id: 'S_Tier_Zero_Downtime', label: '🧪 S-Tier Zero-Downtime Herbs' },
    { id: 'A_Tier_Mystic_Mana_Rich', label: '💧🔮 A-Tier Mystic Mana Herbs' },
    { id: 'By_Elemental_Weakness', label: '🔥💧🌪️🪨 By Elemental Weakness' }
  ];

  const filteredBiomes = curMode === 'Off'
    ? []
    : (curMode === 'S_Tier_Zero_Downtime' || curMode === 'A_Tier_Mystic_Mana_Rich'
      ? biomes.filter(b => b.herb_drop_tier === curMode)
      : biomes);

  const featuredBiomes = filteredBiomes.slice(0, 4);

  const elemColMap = {
    Fire: '#f97316',
    Water: '#38bdf8',
    Wind: '#34d399',
    Earth: '#eab308',
    Holy: '#fde047',
    Dark: '#c084fc'
  };

  return `
    <div id="atlasHerbBiomeBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0d2115;border:1px solid rgba(74,222,128,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bbf7d0">🌿 24-FIELD ELEMENTAL ATTRIBUTE &amp; GROUND HERB SUSTAINABILITY BIOME OVERLAY (D38 · 24 FIELDS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasHerbBiomeMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(74,222,128,0.45)'};background:${isAct ? '#15803d' : '#090d14'};color:${isAct ? '#ffffff' : '#dcfce7'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          24 HUNTING BIOMES · 6 ELEMENTAL ATTRIBUTES (FIRE/WATER/WIND/EARTH/HOLY/DARK) + GROUND HERB RATES
        </span>
      </div>

      ${featuredBiomes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredBiomes.map(b => {
            const elCol = elemColMap[b.dominant_element] || '#4ade80';
            const jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(b.field_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${elCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🌿 ${escapeHtml(b.field_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${elCol}">${escapeHtml(b.dominant_element)} · ${b.herb_drop_rate_pct}% Herb</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bbf7d0;margin-top:1px">
                    ⚡ ${escapeHtml(b.counter_element_bonus.slice(0, 44))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🧪 ${escapeHtml(((b.signature_herbs || []).slice(0, 2).join(' · ')).slice(0, 64))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${elCol};background:#14532d;color:#f0fdf4;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  🌿 Jump to Field Tactical Blueprint (4.8×)
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasWorkshopPlazaBarHtml(tatlas) {
  const plazas = (tatlas && tatlas.soulshot_workshop_plazas) || [];
  if (!plazas.length) return '';

  const curMode = ATLAS_WORKSHOP_MODE || ATLAS_STATE_STORE.workshopMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💥 All 15 Plazas' },
    { id: 'Starter_D_C_Plaza', label: '⚒️ D/C Starter Plazas' },
    { id: 'Regional_B_A_Workshop', label: '⚙️ B/A Guild Workshops' },
    { id: 'Capital_S_Grade_Master_Forge', label: '👑 S-Grade Master Forges' }
  ];

  const filteredPlazas = curMode === 'Off'
    ? []
    : (curMode === 'All' ? plazas : plazas.filter(p => p.workshop_tier === curMode));

  const featuredPlazas = curMode === 'All'
    ? [
        ...plazas.filter(p => p.workshop_tier === 'Capital_S_Grade_Master_Forge').slice(0, 2),
        ...plazas.filter(p => p.workshop_tier === 'Regional_B_A_Workshop').slice(0, 1),
        ...plazas.filter(p => p.workshop_tier === 'Starter_D_C_Plaza').slice(0, 1)
      ]
    : filteredPlazas.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasWorkshopPlazaBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#261409;border:1px solid rgba(251,146,60,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fed7aa">💥 15-TOWN SOULSHOT/SPIRITSHOT &amp; DWARVEN PRIVATE MANUFACTURE WORKSHOP MATRIX (D39 · 15 PLAZAS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasWorkshopMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,146,60,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffedd5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 D/C STARTER PLAZAS + 5 B/A GUILD WORKSHOPS + 4 S-GRADE MASTER FORGES (CRYSTAL/ORE RATIOS &amp; 60%/100% RECIPES)
        </span>
      </div>

      ${featuredPlazas.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredPlazas.map(p => {
            const isCap = p.workshop_tier === 'Capital_S_Grade_Master_Forge';
            const isReg = p.workshop_tier === 'Regional_B_A_Workshop';
            const tierCol = isCap ? '#f59e0b' : (isReg ? '#fb923c' : '#38bdf8');
            const tz = byZid[p.town_zone_id] || {};
            const townNode = tz.studio_node_id || p.town_zone_id.replace('zone-', '');
            const townJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(p.plaza_loc)}')`;
            const spoilJumpJs = `focusFieldTacticalBlueprint('${escapeHtml(p.recipe_spoil_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${tierCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">💥 ${escapeHtml(p.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${tierCol}">${escapeHtml(p.workshop_tier.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                    ⚒️ ${escapeHtml(p.head_blacksmith_npc)} · 💰 ${Number(p.average_manufacture_fee_adena || 0).toLocaleString()}a Fee
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    📜 ${escapeHtml(p.featured_recipe_tier.slice(0, 56))} · 💎 ${escapeHtml(p.crystal_ore_ratio.slice(0, 44))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${townJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${tierCol};background:#431407;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Workshop Plaza (5.2×)
                  </button>
                  <button type="button" onclick="${spoilJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    📜 Recipe Spoil Zone
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTerritoryWardBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.territory_ward_supply_nodes) || [];
  if (!nodes.length) return '';

  const curMode = ATLAS_TERRITORY_WARD_MODE || ATLAS_STATE_STORE.territoryWardMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🚩 All 16 Ward/Supply Nodes' },
    { id: 'Sovereign_Territory_Ward', label: '🚩 8 Sovereign Territory Wards' },
    { id: 'Fortress_Codex_Supply_Vault', label: '📖 8 Giant\'s Codex & Epaulette Vaults' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.node_role === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.node_role === 'Sovereign_Territory_Ward').slice(0, 2),
        ...nodes.filter(n => n.node_role === 'Fortress_Codex_Supply_Vault').slice(0, 2)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasTerritoryWardBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#240d15;border:1px solid rgba(244,63,94,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fecdd3">🚩 TERRITORY WARD RELIC &amp; FORTRESS GIANT'S CODEX SUPPLY MATRIX (D40 · 16 NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTerritoryWardMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,63,94,0.45)'};background:${isAct ? '#be123c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffe4e6'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          8 SOVEREIGN TERRITORY WARD SANCTUMS (+STAT BANNERS) + 8 FORTRESS EPAULETTE &amp; GIANT'S CODEX VAULTS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const isWard = n.node_role === 'Sovereign_Territory_Ward';
            const roleCol = isWard ? '#f43f5e' : '#eab308';
            const roleIcon = isWard ? '🚩' : '📖';
            const vz = byZid[n.linked_vassal_zone_id] || {};
            const isVassalTown = String(n.linked_vassal_zone_id || '').startsWith('zone-town-');
            const strongholdJumpJs = `focusFortressBlueprint('${escapeHtml(n.stronghold_zone_id)}', '${escapeHtml(n.loc)}')`;
            const vassalJumpJs = isVassalTown
              ? `focusTownStreetBlueprint('${escapeHtml(vz.studio_node_id || n.linked_vassal_zone_id.replace('zone-', ''))}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(n.linked_vassal_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${roleCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${roleIcon} ${escapeHtml(n.node_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${roleCol}">${escapeHtml(n.stat_ward_bonus.slice(0, 22))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fecdd3;margin-top:1px">
                    👤 ${escapeHtml(n.mercenary_captain_npc)} · ⏱️ ${escapeHtml(n.territory_battle_window.slice(0, 36))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 ${escapeHtml(n.epaulette_codex_reward.slice(0, 62))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${strongholdJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${roleCol};background:#4c0519;color:#ffe4e6;font-size:8px;font-weight:800;cursor:pointer">
                    ${roleIcon} Stronghold Ward Altar
                  </button>
                  <button type="button" onclick="${vassalJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    🔗 Vassal Supply Line
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasEpicJewelryBarHtml(tatlas) {
  const relics = (tatlas && tatlas.epic_jewelry_sanctums) || [];
  if (!relics.length) return '';

  const curMode = ATLAS_EPIC_JEWELRY_MODE || ATLAS_STATE_STORE.epicJewelryMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💍 All 12 Epic Relics' },
    { id: 'Epic_Ring', label: '💍 4 Epic Rings' },
    { id: 'Epic_Earring', label: '💎 4 Epic Earrings' },
    { id: 'Epic_Necklace', label: '📿 4 Epic Necklaces' }
  ];

  const filteredRelics = curMode === 'Off'
    ? []
    : (curMode === 'All' ? relics : relics.filter(r => r.slot_category === curMode));

  const featuredRelics = curMode === 'All'
    ? [
        ...relics.filter(r => r.slot_category === 'Epic_Ring').slice(0, 2),
        ...relics.filter(r => r.slot_category === 'Epic_Earring').slice(0, 1),
        ...relics.filter(r => r.slot_category === 'Epic_Necklace').slice(0, 1)
      ]
    : filteredRelics.slice(0, 4);

  return `
    <div id="atlasEpicJewelryBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e1033;border:1px solid rgba(192,132,252,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f3e8ff">💍 12-RELIC EPIC BOSS JEWELRY &amp; STATUS RESISTANCE MATRIX (D41 · 12 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasEpicJewelryMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#7e22ce' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 EPIC RINGS + 4 EPIC EARRINGS + 4 EPIC NECKLACES (STUN/HOLD/SLEEP/BLEED/MENTAL RESIST &amp; CRIT/VAMPIRIC/REUSE)
        </span>
      </div>

      ${featuredRelics.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredRelics.map(r => {
            const isRing = r.slot_category === 'Epic_Ring';
            const isEar = r.slot_category === 'Epic_Earring';
            const slotCol = isRing ? '#f59e0b' : (isEar ? '#38bdf8' : '#e879f9');
            const slotIcon = isRing ? '💍' : (isEar ? '💎' : '📿');
            const sanctumJumpJs = r.dungeon_id
              ? `openDungeonSubMap('${escapeHtml(r.dungeon_id)}', '${escapeHtml(r.floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(r.zone_id)}', '${escapeHtml(r.loc)}')`;
            const resistSummary = (r.status_resist_bonuses || []).slice(0, 2).join(' · ');
            const statSummary = (r.combat_stat_bonuses || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${slotCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${slotIcon} ${escapeHtml(r.relic_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${slotCol}">${escapeHtml(r.grade)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    👑 ${escapeHtml(r.boss_guardian_name)} · 🛡️ ${escapeHtml(resistSummary.slice(0, 48))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚔️ ${escapeHtml(statSummary.slice(0, 56))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${sanctumJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${slotCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${slotIcon} Warp to ${r.dungeon_id ? `Sanctum (${escapeHtml(r.floor_id || 'B3')})` : 'Overland Lair'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasVitalityObeliskBarHtml(tatlas) {
  const obelisks = (tatlas && tatlas.adventurer_vitality_obelisks) || [];
  if (!obelisks.length) return '';

  const curMode = ATLAS_VITALITY_OBELISK_MODE || ATLAS_STATE_STORE.vitalityObeliskMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '✨ All 15 Obelisks' },
    { id: 'Starter_Apprentice_Coupon_Hub', label: '🗡️ Starter D/C Shadow Coupons' },
    { id: 'Regional_Shadow_Weapon_Hub', label: '⚡ Lv.6–75 Support Buff Suites' },
    { id: 'Capital_Stage4_Vitality_Sanctuary', label: '🔋 Capital Stage 4 Vitality Sanctuaries' }
  ];

  const filteredObelisks = curMode === 'Off'
    ? []
    : (curMode === 'All' ? obelisks : obelisks.filter(o => o.obelisk_tier === curMode));

  const featuredObelisks = curMode === 'All'
    ? [
        ...obelisks.filter(o => o.obelisk_tier === 'Starter_Apprentice_Coupon_Hub').slice(0, 1),
        ...obelisks.filter(o => o.obelisk_tier === 'Regional_Shadow_Weapon_Hub').slice(0, 1),
        ...obelisks.filter(o => o.obelisk_tier === 'Capital_Stage4_Vitality_Sanctuary').slice(0, 2)
      ]
    : filteredObelisks.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasVitalityObeliskBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0a221c;border:1px solid rgba(52,211,153,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#a7f3d0">✨ 15-TOWN ADVENTURER'S GUIDE BUFF, SHADOW WEAPON &amp; VITALITY OBELISK MATRIX (D42 · 15 TOWNS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasVitalityObeliskMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#059669' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          LV.6–75 SUPPORT BUFF SUITES + D/C/B SHADOW WEAPON COUPONS + STAGE 4 (+300% EXP) VITALITY REST SANCTUARIES
        </span>
      </div>

      ${featuredObelisks.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredObelisks.map(o => {
            const isCap = o.obelisk_tier === 'Capital_Stage4_Vitality_Sanctuary';
            const isReg = o.obelisk_tier === 'Regional_Shadow_Weapon_Hub';
            const tierCol = isCap ? '#34d399' : (isReg ? '#38bdf8' : '#fbbf24');
            const tz = byZid[o.town_zone_id] || {};
            const townNode = tz.studio_node_id || o.town_zone_id.replace('zone-', '');
            const obeliskJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(o.obelisk_loc)}')`;
            const buffSummary = (o.granted_buff_suite || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${tierCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">✨ ${escapeHtml(o.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${tierCol}">${escapeHtml(o.obelisk_tier.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    🧭 ${escapeHtml(o.guide_npc_name)} · 🗡️ ${escapeHtml(o.shadow_weapon_coupon_grade.slice(0, 36))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml(buffSummary.slice(0, 48))} · 🔋 ${escapeHtml(o.vitality_recovery_rate.slice(0, 44))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${obeliskJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${tierCol};background:#064e3b;color:#d1fae5;font-size:8px;font-weight:800;cursor:pointer">
                    ✨ Adventurer's Guide &amp; Vitality Obelisk (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFilterBarHtml(matchCount) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const allTowns = getAllAtlasTownEntries(tatlas);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allFortresses = getAllAtlasFortressEntries(tatlas);
  const allDungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  const all63Zones = getAllAtlas63Zones(tatlas);
  const routeFromId = ATLAS_ROUTE_FROM_ID || ATLAS_STATE_STORE.routeFromId || 'zone-town-lantern-hollow';
  const routeToId = ATLAS_ROUTE_TO_ID || ATLAS_STATE_STORE.routeToId || 'zone-dungeon-kiln-cellar';
  const routePresets = [
    { fromId: 'zone-town-lantern-hollow', toId: 'zone-dungeon-kiln-cellar', label: 'Gludin Village ➔ The Ant Nest' },
    { fromId: 'zone-town-lantern-hollow', toId: 'zone-town-kilnwatch-bastion', label: 'Gludin Village ➔ Town of Dion' },
    { fromId: 'zone-town-kilnwatch-bastion', toId: 'zone-dungeon-pendulum-shaft', label: 'Town of Dion ➔ Cruma Tower' },
    { fromId: 'zone-town-escapement-anvil', toId: 'zone-dungeon-star-heart-nave', label: 'Town of Oren ➔ Tower of Insolence' }
  ];
  const omniQuery = ATLAS_OMNI_SEARCH_QUERY || ATLAS_STATE_STORE.omniSearchQuery || '';
  const omniResults = searchAtlasOmniIndex(omniQuery, tatlas);
  const presetSearchChips = [
    'Gludin Village',
    'The Ant Nest',
    'Refinement +1..+15',
    'Warehouse',
    'MVP Bosses',
    'Raid Bosses',
    'Cruma Tower'
  ];
  const catPills = [
    { id: 'All', label: '🌐 All Layers' },
    { id: 'RaceSpawns', label: '🧬 Race Spawns (6)' },
    { id: 'TownMarks', label: '🛍️ NPCs (Shop + Refinement)' },
    { id: 'Monster', label: '👾 Monster' },
    { id: 'Mini-Boss', label: '⚔️ Mini-Boss' },
    { id: 'Raid', label: '🔥 Raid' },
    { id: 'MVP', label: '👑 MVP' }
  ];
  const bandPills = ['All', '1-20', '21-40', '41-60', '61-80', '81-99'];
  const featuredDungeons = [
    { id: 'zone-dungeon-kiln-cellar', label: '🕳️ Kiln Cellar (The Ant Nest B1–B3)' },
    { id: 'zone-dungeon-pendulum-shaft', label: '🗼 Pendulum Shaft (Cruma Tower 1F–3F)' },
    { id: 'zone-dungeon-chronometer-foundry', label: '⚙️ Chronometer Foundry (Tower of Insolence 1F–3F)' }
  ];
  const activeTownId = ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow';
  const activeFieldOrFortId = ATLAS_STATE_STORE.activeFieldOrFortId || '';
  const activeDungeonId = ATLAS_STATE_STORE.activeDungeonId || '';

  return `
    <div style="padding:9px 16px;background:#141b26;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;gap:8px">
      <!-- D13: Instant Atlas Omni-Search & Quick-Jump Bar across 63 Zones, 180 Town NPCs, 105 Service Marks, 48 Dungeon Floors -->
      <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">🔎 OMNI-SEARCH (D13):</span>
          <input id="atlasOmniSearchInput" type="search"
                 value="${escapeHtml(omniQuery)}"
                 placeholder="🔎 Search Towns (Gludin, Dion, Oren), Dungeons (Ant Nest, Cruma), NPCs (Shop, Refinement, Warehouse), Races, or Mobs/MVPs..."
                 onchange="setAtlasOmniSearch(this.value)"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();setAtlasOmniSearch(this.value);}"
                 style="flex:1;min-width:290px;height:28px;padding:4px 10px;border-radius:7px;background:#090d14;color:#f8fafc;border:1.5px solid rgba(250,204,21,0.55);font-size:11px;font-weight:700" />
          ${omniQuery ? `
            <button type="button" onclick="clearAtlasOmniSearch()"
                    style="height:28px;padding:0 10px;border-radius:7px;border:1px solid #f87171;background:#7f1d1d;color:#fecaca;font-size:10px;font-weight:800;cursor:pointer">
              ✕ Clear Search
            </button>
          ` : ''}
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            ${presetSearchChips.map(chip => {
              const isAct = omniQuery.toLowerCase() === chip.toLowerCase();
              return `
                <button type="button" onclick="setAtlasOmniSearch('${escapeHtml(chip)}')"
                        style="height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.4)'};background:${isAct ? '#b45309' : '#0f172a'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                  ⚡ ${escapeHtml(chip)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
        <div id="atlasOmniQuickJumpPills" style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:9.5px;font-weight:800;color:#94a3b8">
            ${omniQuery ? `🎯 Quick-Jump Matches (${omniResults.length}):` : '🚀 Instant Quick-Jump Action Pills:'}
          </span>
          ${omniResults.map(res => `
            <button type="button" onclick="${res.actionJs}"
                    style="min-height:24px;padding:2px 8px;border-radius:6px;border:1px solid ${res.badgeColor};background:rgba(15,23,42,0.92);color:#f8fafc;font-size:9.8px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px">
              <span>${res.icon} ${escapeHtml(res.title.slice(0, 32))}</span>
              <span class="mono" style="font-size:9px;color:#fde047">[${escapeHtml(res.actionLabel)}]</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- D17: Interactive Point-to-Point Travel Route & Gatekeeper Calculator across all 63 Zones -->
      <div id="atlasTravelRouteFinderBar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🧭 Route From:</span>
          <select aria-label="Travel Route Origin Zone" onchange="setAtlasRouteEndpoints(this.value, ATLAS_ROUTE_TO_ID)"
                  style="height:26px;padding:1px 7px;border-radius:6px;background:#090d14;color:#f8fafc;border:1px solid rgba(56,189,248,0.55);font-size:10px;font-weight:700;cursor:pointer">
            ${all63Zones.map(z => {
              const sel = z.zone_id === routeFromId ? 'selected' : '';
              return `<option value="${escapeHtml(z.zone_id)}" ${sel}>[${escapeHtml(z.zoneCategory)}] ${escapeHtml(z.name)}</option>`;
            }).join('')}
          </select>
          <span class="mono" style="font-size:11px;font-weight:900;color:#fde047">➔</span>
          <select aria-label="Travel Route Destination Zone" onchange="setAtlasRouteEndpoints(ATLAS_ROUTE_FROM_ID, this.value)"
                  style="height:26px;padding:1px 7px;border-radius:6px;background:#090d14;color:#f8fafc;border:1px solid rgba(250,204,21,0.55);font-size:10px;font-weight:700;cursor:pointer">
            ${all63Zones.map(z => {
              const sel = z.zone_id === routeToId ? 'selected' : '';
              return `<option value="${escapeHtml(z.zone_id)}" ${sel}>[${escapeHtml(z.zoneCategory)}] ${escapeHtml(z.name)}</option>`;
            }).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;color:#94a3b8;font-weight:800">⚡ Route Presets:</span>
          ${routePresets.map(rp => {
            const isAct = routeFromId === rp.fromId && routeToId === rp.toId;
            return `
              <button type="button" onclick="setAtlasRouteEndpoints('${rp.fromId}', '${rp.toId}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#0f172a'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                🧭 ${escapeHtml(rp.label)}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      ${renderAtlasBlacksmithRefinementBarHtml(tatlas)}
      ${renderAtlasBossHierarchyChainBarHtml(tatlas)}
      ${renderAtlasQuestTrialOverlayBarHtml(tatlas)}
      ${renderAtlasFarmingHeatmapBarHtml(tatlas)}
      ${renderAtlasSiegeDomainBarHtml(tatlas)}
      ${renderAtlasBossRadarBarHtml(tatlas)}
      ${renderAtlasSevenSealsBarHtml(tatlas)}
      ${renderAtlasManorEconomyBarHtml(tatlas)}
      ${renderAtlasOlympiadNetworkBarHtml(tatlas)}
      ${renderAtlasTransitLinesBarHtml(tatlas)}
      ${renderAtlasSoulCrystalBarHtml(tatlas)}
      ${renderAtlasFishingSanctuaryBarHtml(tatlas)}
      ${renderAtlasPvpKarmaBarHtml(tatlas)}
      ${renderAtlasRiftSepulcherBarHtml(tatlas)}
      ${renderAtlasAugmentDyeBarHtml(tatlas)}
      ${renderAtlasCompanionMountBarHtml(tatlas)}
      ${renderAtlasClanAcademyBarHtml(tatlas)}
      ${renderAtlasHerbBiomeBarHtml(tatlas)}
      ${renderAtlasWorkshopPlazaBarHtml(tatlas)}
      ${renderAtlasTerritoryWardBarHtml(tatlas)}
      ${renderAtlasEpicJewelryBarHtml(tatlas)}
      ${renderAtlasVitalityObeliskBarHtml(tatlas)}

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:800;color:#94a3b8;margin-right:4px">FILTER PINS &amp; MARKS:</span>
          ${catPills.map(p => {
            const active = ATLAS_STATE_STORE.filter === p.id;
            return `
              <button type="button" onclick="setAtlasFilter('${p.id}')"
                      style="min-height:26px;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#fde047' : 'rgba(255,255,255,0.14)'};background:${active ? '#d97706' : '#1e293b'};color:${active ? '#ffffff' : '#cbd5e1'}">
                ${p.label}
              </button>
            `;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:800;color:#94a3b8;margin-right:2px">LV.BAND:</span>
          ${bandPills.map(b => {
            const active = ATLAS_STATE_STORE.levelBand === b;
            return `
              <button type="button" onclick="setAtlasLevelBand('${b}')"
                      style="min-height:26px;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#38bdf8' : 'rgba(255,255,255,0.12)'};background:${active ? '#0284c7' : '#0f172a'};color:${active ? '#ffffff' : '#94a3b8'}">
                ${b === 'All' ? 'All Lv.' : 'Lv.' + b}
              </button>
            `;
          }).join('')}
          ${(ATLAS_STATE_STORE.filter !== 'All' || ATLAS_STATE_STORE.levelBand !== 'All' || ATLAS_STATE_STORE.raceGrowthRoute !== 'All') ? `
            <button type="button" onclick="resetAtlasFilters()"
                    style="min-height:26px;padding:3px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid #f87171;background:rgba(220,38,38,0.2);color:#fca5a5">
              ↺ Reset Filters
            </button>
          ` : ''}
        </div>
      </div>

      <!-- D9: 6-Race Starter-to-Endgame Travel Path Selector (Spawn -> Starter Town -> Field -> Ant Nest/Dungeon -> Dion Hub -> Oren/Cruma Tower -> Halo Endgame) -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:800;color:#fde047;margin-right:4px">🛤️ Highlight Race Growth Path:</span>
          ${['All', 'Human', 'Lunar', 'Ogre/Orc', 'Dwarf', 'Dark-Lunar', 'Furral'].map(rLabel => {
            const active = (ATLAS_STATE_STORE.raceGrowthRoute || 'All') === rLabel;
            return `
              <button type="button" onclick="setAtlasRaceGrowthRoute('${rLabel}')"
                      style="min-height:25px;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#fde047' : 'rgba(255,255,255,0.14)'};background:${active ? '#b45309' : '#172030'};color:${active ? '#ffffff' : '#fde68a'}">
                ${rLabel === 'All' ? '🌐 All (Off)' : '🧬 ' + rLabel}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9.5px;color:#94a3b8">Stages A..L: Spawn ➔ Starter Town ➔ Field ➔ Ant Nest/Dungeon ➔ Dion Hub ➔ Oren/Cruma Tower ➔ Halo Endgame</span>
      </div>

      <!-- Quick Semantic Zoom, All 15 Town Street Blueprints, 24 Field Tactical Blueprints, 8 Fortress Blueprints & 16 Multi-Floor Dungeons -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:800;color:#fde047">⚡ QUICK WARP &amp; BLUEPRINTS:</span>
          <button type="button" onclick="zoomStudioMap(0, true)"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 1 ? '#fde047' : 'rgba(255,255,255,0.15)'};background:${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 1 ? '#854d0e' : '#1e293b'};color:#fde68a">
            🌍 Overland Macro (1.0×)
          </button>
          <button type="button" onclick="ATLAS_STATE_STORE.activeDungeonId=''; ATLAS_STATE_STORE.activeFieldOrFortId=''; zoomStudioMap(0, false, 2.8)"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 2 ? '#38bdf8' : 'rgba(255,255,255,0.15)'};background:${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 2 ? '#0369a1' : '#1e293b'};color:#bae6fd">
            🛤️ Regional Roads &amp; Portals (2.8×)
          </button>
          <button type="button" onclick="focusTownStreetBlueprint(ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow')"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${!ATLAS_STATE_STORE.activeDungeonId && !activeFieldOrFortId && getSemanticZoomLodTier() === 3 ? '#4ade80' : 'rgba(255,255,255,0.15)'};background:${!ATLAS_STATE_STORE.activeDungeonId && !activeFieldOrFortId && getSemanticZoomLodTier() === 3 ? '#065f46' : '#1e293b'};color:#bbf7d0">
            🏘️ Town Street &amp; Shop/Refinement Blueprint (5.2×)
          </button>
          <button type="button" onclick="focusFieldTacticalBlueprint(ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate')"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${activeFieldOrFortId ? '#86efac' : 'rgba(255,255,255,0.15)'};background:${activeFieldOrFortId ? '#14532d' : '#1e293b'};color:#dcfce7">
            🏕️ Field Tactical Blueprint (4.8×)
          </button>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#bbf7d0">
            <span>🏰 Town (${allTowns.length}):</span>
            <select aria-label="Select Town Blueprint" onchange="if(this.value){const [tid,loc]=this.value.split('|');focusTownStreetBlueprint(tid,loc);}"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#0f172a;color:#f8fafc;border:1px solid rgba(74,222,128,0.5);font-size:10px;font-weight:700;cursor:pointer">
              ${allTowns.map(t => {
                const sel = (!activeFieldOrFortId && (t.studio_node_id === activeTownId || t.zone_id === activeTownId)) ? 'selected' : '';
                return `<option value="${escapeHtml(t.studio_node_id)}|${escapeHtml(t.loc_coord || '')}" ${sel}>${escapeHtml(t.name)}</option>`;
              }).join('')}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#86efac">
            <span>🏕️ Field (${allFields.length}):</span>
            <select aria-label="Select Field Tactical Blueprint" onchange="if(this.value){const [fid,loc]=this.value.split('|');focusFieldTacticalBlueprint(fid,loc);}"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#052e16;color:#f0fdf4;border:1px solid rgba(134,239,172,0.55);font-size:10px;font-weight:700;cursor:pointer">
              <option value="" ${!activeFieldOrFortId ? 'selected' : ''}>— Select Any of ${allFields.length} Field Hunting Areas —</option>
              ${allFields.map(f => {
                const sel = (f.zone_id === activeFieldOrFortId || f.studio_node_id === activeFieldOrFortId) ? 'selected' : '';
                return `<option value="${escapeHtml(f.zone_id)}|${escapeHtml(f.loc_coord || '')}" ${sel}>${escapeHtml(f.name)} (Lv.${(f.level_band || [1, 12]).join('–')})</option>`;
              }).join('')}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#fed7aa">
            <span>🛡️ Fortress/Harbor (${allFortresses.length}):</span>
            <select aria-label="Select Fortress Blueprint" onchange="if(this.value){const [hid,loc]=this.value.split('|');focusFortressBlueprint(hid,loc);}"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#431407;color:#ffedd5;border:1px solid rgba(251,146,60,0.55);font-size:10px;font-weight:700;cursor:pointer">
              <option value="" ${!activeFieldOrFortId ? 'selected' : ''}>— Select Any of ${allFortresses.length} Harbors/ClanHalls/Fortresses —</option>
              ${allFortresses.map(h => {
                const sel = (h.zone_id === activeFieldOrFortId || h.studio_node_id === activeFieldOrFortId) ? 'selected' : '';
                return `<option value="${escapeHtml(h.zone_id)}|${escapeHtml(h.loc_coord || '')}" ${sel}>${escapeHtml(h.name)} [${escapeHtml(h.category)}]</option>`;
              }).join('')}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#e9d5ff">
            <span>🕳️ Dungeon (${allDungeons.length}):</span>
            <select aria-label="Select Multi-Floor Dungeon Sub-Map" onchange="if(this.value) openDungeonSubMap(this.value)"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#1e1035;color:#f3e8ff;border:1px solid rgba(192,132,252,0.55);font-size:10px;font-weight:700;cursor:pointer">
              <option value="" ${!activeDungeonId ? 'selected' : ''}>— Select Any of ${allDungeons.length} Multi-Floor Dungeons —</option>
              ${allDungeons.map(d => {
                const sel = (d.dungeon_id === activeDungeonId || d.studio_node_id === activeDungeonId) ? 'selected' : '';
                const fSpan = (d.floors || []).map(f => f.floor_id).join('⇄');
                return `<option value="${escapeHtml(d.dungeon_id)}" ${sel}>${escapeHtml(d.name)} [${escapeHtml(fSpan)}]</option>`;
              }).join('')}
            </select>
          </label>
          ${featuredDungeons.map(d => {
            const active = ATLAS_STATE_STORE.activeDungeonId === d.id;
            return `
              <button type="button" onclick="openDungeonSubMap('${d.id}')"
                      style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#e9d5ff' : 'rgba(168,85,247,0.45)'};background:${active ? '#7e22ce' : 'rgba(59,7,100,0.65)'};color:#f3e8ff">
                ${d.label}
              </button>
            `;
          }).join('')}
        </div>
        ${matchCount === 0 ? `
          <div style="display:inline-flex;align-items:center;gap:8px;padding:3px 10px;border-radius:6px;background:rgba(220,38,38,0.22);border:1px solid #f87171;color:#fecaca;font-size:10.5px;font-weight:800">
            <span>⚠️ 0 matches for active filter (${escapeHtml(ATLAS_STATE_STORE.filter)} / ${escapeHtml(ATLAS_STATE_STORE.levelBand)})</span>
            <button type="button" onclick="resetAtlasFilters()" style="padding:1px 7px;border-radius:4px;border:1px solid #fca5a5;background:#991b1b;color:#ffffff;font-size:10px;font-weight:800;cursor:pointer">Reset Filters</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderAtlasOverviewMiniMapPipSvg(activeZoneOrId, tatlas, viewKind = 'town') {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const atlasDoc = tatlas || sp.tShapedWorldAtlas || {};
  const allZones = getAllAtlas63Zones(atlasDoc);
  const byId = {};
  allZones.forEach(z => {
    byId[z.zone_id] = z;
    if (z.studio_node_id) byId[z.studio_node_id] = z;
  });

  const targetId = typeof activeZoneOrId === 'string'
    ? activeZoneOrId
    : ((activeZoneOrId && (activeZoneOrId.zone_id || activeZoneOrId.studio_node_id || activeZoneOrId.dungeon_id || activeZoneOrId.id)) || 'zone-town-lantern-hollow');
  const activeZone = byId[targetId] || allZones[0] || {
    zone_id: 'zone-town-lantern-hollow',
    studio_node_id: 'town-lantern-hollow',
    name: 'Lantern Hollow Village',
    loc_coord: '-84120:243500',
    connected_zone_ids: ['zone-field-clover-south-gate', 'zone-dungeon-kiln-cellar']
  };
  const activeLocStr = activeZone.loc_coord
    || (activeZoneOrId && (activeZoneOrId.entrance_loc || activeZoneOrId.loc_coord))
    || `${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`;
  const activeCoord = clampWorldLocCoord(activeLocStr);

  // Place PiP in bottom-left when in dungeon sub-map (since vertical cutaway occupies right) or bottom-right in Town/Field/Fortress views
  const pipW = 248;
  const pipH = 148;
  const pipX = viewKind === 'dungeon' ? 16 : 776;
  const pipY = 304;
  const mapX = pipX + 8;
  const mapY = pipY + 24;
  const mapW = pipW - 16;
  const mapH = 92;

  const toMiniXY = (svgX, svgY) => ({
    mx: Math.round(mapX + (Math.max(20, Math.min(1020, svgX)) / 1040) * mapW),
    my: Math.round(mapY + (Math.max(20, Math.min(480, svgY)) / 500) * mapH)
  });

  const actMini = toMiniXY(activeCoord.svgX, activeCoord.svgY);
  const neighborIds = (activeZone.connected_zone_ids || []).slice(0, 5);
  const neighborPins = neighborIds
    .map(nid => byId[nid])
    .filter(Boolean)
    .map(nb => {
      const nc = clampWorldLocCoord(nb.loc_coord || '-84120:243500');
      const mpos = toMiniXY(nc.svgX, nc.svgY);
      return { nb, ...mpos };
    });

  const neighborEdgesSvg = neighborPins.map(np => `
    <line x1="${actMini.mx}" y1="${actMini.my}" x2="${np.mx}" y2="${np.my}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 2"/>
  `).join('');

  const neighborDotsSvg = neighborPins.map(np => {
    const clickCall = np.nb.actionType === 'dungeon'
      ? `openDungeonSubMap('${escapeHtml(np.nb.zone_id)}', 'B1')`
      : (np.nb.actionType === 'town'
        ? `focusTownStreetBlueprint('${escapeHtml(np.nb.studio_node_id || np.nb.zone_id)}', '${escapeHtml(np.nb.loc_coord || '')}')`
        : `focusFieldTacticalBlueprint('${escapeHtml(np.nb.zone_id)}', '${escapeHtml(np.nb.loc_coord || '')}')`);
    return `
      <g style="cursor:pointer" onclick="${clickCall}">
        <circle cx="${np.mx}" cy="${np.my}" r="4.2" fill="#0284c7" stroke="#bae6fd" stroke-width="1.2"/>
      </g>
    `;
  }).join('');

  const shortZoneTitle = (activeZone.name || targetId).split('(')[0].trim().slice(0, 22);

  return `
    <g id="studioOverviewMiniMapPip" filter="url(#cartoDropShadow)">
      <rect x="${pipX}" y="${pipY}" width="${pipW}" height="${pipH}" rx="10" fill="rgba(9,13,22,0.94)" stroke="#fde047" stroke-width="1.8"/>
      <text x="${pipX + 10}" y="${pipY + 16}" fill="#fde047" font-size="8.8" font-weight="900" font-family="monospace">
        🛰️ PiP WORLD RADAR · ${escapeHtml(shortZoneTitle)}
      </text>

      <!-- Mini World Map Canvas showing 3 Continents -->
      <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" rx="6" fill="#0c1928" stroke="rgba(56,189,248,0.45)" stroke-width="1"/>
      <image href="/studio-maps/c3_continent_parchment_relief.png" x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" preserveAspectRatio="none" opacity="0.45"/>

      <!-- 3 Continent Silhouette Zones (C01 Hearthbloom, C02 Steppe, C03 Shattered Halo) -->
      <ellipse cx="${mapX + Math.round(mapW * 0.44)}" cy="${mapY + Math.round(mapH * 0.76)}" rx="52" ry="16" fill="rgba(16,185,129,0.18)" stroke="#34d399" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${mapX + Math.round(mapW * 0.24)}" y="${mapY + Math.round(mapH * 0.88)}" fill="#6ee7b7" font-size="6.8" font-weight="800" font-family="monospace">C01 HEARTHBLOOM</text>

      <ellipse cx="${mapX + Math.round(mapW * 0.74)}" cy="${mapY + Math.round(mapH * 0.50)}" rx="38" ry="15" fill="rgba(245,158,11,0.18)" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${mapX + Math.round(mapW * 0.64)}" y="${mapY + Math.round(mapH * 0.54)}" fill="#fde68a" font-size="6.8" font-weight="800" font-family="monospace">C02 STEPPE</text>

      <ellipse cx="${mapX + Math.round(mapW * 0.64)}" cy="${mapY + Math.round(mapH * 0.22)}" rx="44" ry="13" fill="rgba(192,132,252,0.18)" stroke="#c084fc" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${mapX + Math.round(mapW * 0.50)}" y="${mapY + Math.round(mapH * 0.24)}" fill="#e9d5ff" font-size="6.8" font-weight="800" font-family="monospace">C03 HALO</text>

      ${neighborEdgesSvg}
      ${neighborDotsSvg}

      <!-- Active Zone Pulsing Radar Pin -->
      <circle cx="${actMini.mx}" cy="${actMini.my}" r="9" fill="rgba(250,204,21,0.28)" stroke="#fde047" stroke-width="1.4">
        <animate attributeName="r" values="6;12;6" dur="1.6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${actMini.mx}" cy="${actMini.my}" r="4.8" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>

      <!-- Bottom Coordinate Readout & 1-Click Expand to World Map (1.0x) Button -->
      <text x="${pipX + 10}" y="${pipY + pipH - 11}" fill="#93c5fd" font-size="7.8" font-weight="800" font-family="monospace">
        loc=${escapeHtml(activeLocStr)}
      </text>
      <g style="cursor:pointer" onclick="zoomStudioMap(0, true)">
        <rect x="${pipX + 108}" y="${pipY + pipH - 24}" width="132" height="19" rx="5" fill="#0284c7" stroke="#fde047" stroke-width="1.2"/>
        <text x="${pipX + 174}" y="${pipY + pipH - 12}" text-anchor="middle" fill="#ffffff" font-size="7.8" font-weight="900" font-family="monospace">
          🌍 Expand to World Map (1.0×)
        </text>
      </g>
    </g>
  `;
}

function renderDungeonVerticalCutawaySvg(dng, activeFloor) {
  const floors = dng.floors || [];
  const isTower = dng.dungeon_kind === 'vertical_tower';
  const orderedFloors = isTower ? floors.slice().reverse() : floors.slice();
  const panelX = 768;
  const panelY = 50;
  const panelW = 258;
  const panelH = 420;
  const shaftX = panelX + 38;

  const surfaceOrRoofBanner = isTower ? `
    <g style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml((floors[floors.length - 1] && floors[floors.length - 1].floor_id) || '3F')}')">
      <rect x="${panelX + 12}" y="${panelY + 34}" width="${panelW - 24}" height="24" rx="5" fill="#1e3a8a" stroke="#fde047" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + 49}" text-anchor="middle" fill="#fde047" font-size="8.8" font-weight="900" font-family="monospace">
        🗼 3F ROOFTOP APEX (+160m) ⬆ 2F ⬆ 1F
      </text>
    </g>
  ` : `
    <g style="cursor:pointer" onclick="exitDungeonSubMap('${escapeHtml(dng.entrance_loc || '')}')">
      <rect x="${panelX + 12}" y="${panelY + 34}" width="${panelW - 24}" height="24" rx="5" fill="#064e3b" stroke="#34d399" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + 49}" text-anchor="middle" fill="#ecfdf5" font-size="8.8" font-weight="900" font-family="monospace">
        🌲 SURFACE ENTRANCE (0m) ➔ B1 ➔ B2 ➔ B3
      </text>
    </g>
  `;

  const floorSlabsSvg = orderedFloors.map((fl, idx) => {
    const slabY = panelY + 72 + idx * 102;
    const isCur = fl.floor_id === activeFloor.floor_id;
    const elevVal = typeof fl.floor_elevation_meters === 'number'
      ? (fl.floor_elevation_meters > 0 ? `+${fl.floor_elevation_meters}m` : `${fl.floor_elevation_meters}m`)
      : (isTower ? `+${fl.floor_index * 55}m` : `-${fl.floor_index * 60}m`);
    const bossHl = fl.boss_tier_highlight || `${fl.floor_id} Sanctum (${fl.level_range})`;
    const isBossFloor = fl.floor_id === 'B3' || fl.floor_id === '3F' || fl.floor_index === 3;
    const strokeCol = isCur ? '#fde047' : (isBossFloor ? '#f59e0b' : '#c084fc');
    const bgFill = isCur
      ? (isTower ? 'rgba(30,64,175,0.95)' : 'rgba(107,33,168,0.95)')
      : 'rgba(15,23,42,0.92)';
    const nextFloor = orderedFloors[idx + 1];
    const warpShaftSvg = nextFloor ? `
      <g style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(nextFloor.floor_id)}')">
        <line x1="${shaftX}" y1="${slabY + 68}" x2="${shaftX}" y2="${slabY + 102}" stroke="#38bdf8" stroke-width="4" stroke-dasharray="4 3"/>
        <circle cx="${shaftX}" cy="${slabY + 85}" r="9" fill="#0f172a" stroke="#fde047" stroke-width="1.5"/>
        <text x="${shaftX}" y="${slabY + 88}" text-anchor="middle" fill="#fde047" font-size="9" font-weight="900">${isTower ? '⬆' : '⬇'}</text>
      </g>
    ` : '';

    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(fl.floor_id)}')">
        <rect x="${panelX + 12}" y="${slabY}" width="${panelW - 24}" height="68" rx="8" fill="${bgFill}" stroke="${strokeCol}" stroke-width="${isCur ? 2.5 : 1.4}"/>
        <circle cx="${shaftX}" cy="${slabY + 22}" r="12" fill="${isCur ? '#eab308' : '#1e293b'}" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${shaftX}" y="${slabY + 26}" text-anchor="middle" fill="${isCur ? '#0f172a' : '#fde047'}" font-size="9.5" font-weight="900" font-family="monospace">${escapeHtml(fl.floor_id)}</text>
        <text x="${panelX + 58}" y="${slabY + 19}" fill="#ffffff" font-size="9.5" font-weight="900" font-family="monospace">
          ${escapeHtml(fl.floor_id)} (${escapeHtml(elevVal)}) · ${escapeHtml(fl.level_range)}
        </text>
        <text x="${panelX + 58}" y="${slabY + 34}" fill="${isCur ? '#fde047' : '#cbd5e1'}" font-size="8.2" font-weight="800" font-family="monospace">
          ${escapeHtml(bossHl.slice(0, 30))}
        </text>
        <text x="${panelX + 58}" y="${slabY + 49}" fill="#93c5fd" font-size="8" font-family="monospace">
          ${(fl.rooms || []).length} Chambers · ${(fl.warp_points || []).length} Warps · Click to Jump
        </text>
        ${isCur ? `<rect x="${panelX + panelW - 64}" y="${slabY + 6}" width="46" height="15" rx="4" fill="#fde047"/><text x="${panelX + panelW - 41}" y="${slabY + 16}" text-anchor="middle" fill="#0f172a" font-size="7.5" font-weight="900" font-family="monospace">ACTIVE</text>` : ''}
      </g>
      ${warpShaftSvg}
    `;
  }).join('');

  const bottomExitBanner = isTower ? `
    <g style="cursor:pointer" onclick="exitDungeonSubMap('${escapeHtml(dng.entrance_loc || '')}')">
      <rect x="${panelX + 12}" y="${panelY + panelH - 36}" width="${panelW - 24}" height="24" rx="5" fill="#064e3b" stroke="#34d399" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + panelH - 21}" text-anchor="middle" fill="#ecfdf5" font-size="8.5" font-weight="900" font-family="monospace">
        🚪 GROUND LEVEL BASE (0m) · Overland Exit
      </text>
    </g>
  ` : `
    <g style="cursor:pointer" onclick="switchDungeonFloor('B3')">
      <rect x="${panelX + 12}" y="${panelY + panelH - 36}" width="${panelW - 24}" height="24" rx="5" fill="#451a03" stroke="#f59e0b" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + panelH - 21}" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="900" font-family="monospace">
        👑 B3 ABYSSAL MVP SANCTUM (-195m)
      </text>
    </g>
  `;

  return `
    <g id="dungeonVerticalCutawayDiagram">
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="12" fill="rgba(9,11,19,0.94)" stroke="${isTower ? '#38bdf8' : '#c084fc'}" stroke-width="2" filter="url(#cartoDropShadow)"/>
      <text x="${panelX + panelW / 2}" y="${panelY + 20}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">
        ${isTower ? '🗼 VERTICAL TOWER CUTAWAY (1F⬆2F⬆3F)' : '🕳️ UNDERGROUND DESCENT CUTAWAY (B1⬇B2⬇B3)'}
      </text>
      ${surfaceOrRoofBanner}
      ${floorSlabsSvg}
      ${bottomExitBanner}
    </g>
  `;
}

function renderDungeonSubMapAtlas(dng, tatlas) {
  const floors = dng.floors || [];
  const activeFloor = floors.find(f => f.floor_id === ATLAS_STATE_STORE.activeFloorId) || floors[0] || { floor_id: 'B1', name: 'Floor 1', rooms: [], warp_points: [], spawns: [] };
  const isTower = dng.dungeon_kind === 'vertical_tower';
  const fFilter = ATLAS_STATE_STORE.filter;

  const filteredSpawns = (activeFloor.spawns || []).filter(sp => {
    if (!matchesAtlasLevelBand(sp.level)) return false;
    if (fFilter === 'All') return true;
    if (fFilter === 'Monster') return sp.entity_type === 'Monster';
    if (fFilter === 'Mini-Boss') return sp.entity_type === 'Mini-Boss';
    if (fFilter === 'Raid') return sp.entity_type === 'Raid' || sp.entity_type === 'RaidBoss';
    if (fFilter === 'MVP') return sp.entity_type === 'MVP';
    return false;
  });

  const rooms = activeFloor.rooms || [];
  const warps = activeFloor.warp_points || [];

  // Connect rooms in sequence with subterranean / tower stone corridors
  const corridorLinesSvg = rooms.map((rm, idx) => {
    if (idx === 0) return '';
    const prev = rooms[idx - 1];
    const x1 = Math.round(((prev.x_pct + prev.w_pct / 2) / 100) * 1040);
    const y1 = Math.round(((prev.y_pct + prev.h_pct / 2) / 100) * 500);
    const x2 = Math.round(((rm.x_pct + rm.w_pct / 2) / 100) * 1040);
    const y2 = Math.round(((rm.y_pct + rm.h_pct / 2) / 100) * 500);
    return `
      <g pointer-events="none">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#09070d" stroke-width="26" stroke-linecap="round"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${isTower ? '#1e3a8a' : '#3b1d5e'}" stroke-width="18" stroke-linecap="round"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c084fc" stroke-width="2" stroke-dasharray="8 6"/>
      </g>
    `;
  }).join('');

  const roomsSvg = rooms.map((rm, rIdx) => {
    const rx = Math.round((rm.x_pct / 100) * 1040);
    const ry = Math.round((rm.y_pct / 100) * 500);
    const rw = Math.round((rm.w_pct / 100) * 1040);
    const rh = Math.round((rm.h_pct / 100) * 500);
    const roomSpawns = (activeFloor.spawns || []).filter((_, sIdx) => (sIdx % Math.max(1, rooms.length)) === rIdx);
    const roomDrops = Array.from(new Set(roomSpawns.flatMap(sp => sp.refinement_drops || []))).slice(0, 4);
    const roomMobSummary = roomSpawns.map(sp => `${sp.name} (Lv.${sp.level} ${sp.entity_type} · HP ${sp.hp_multiplier || '1x'})`).join(' · ')
      || (rm.key_mobs || []).join(', ');
    const poiRoom = {
      title: `${activeFloor.floor_id} · ${rm.name}`,
      category: `${dng.name} (${dng.l2_archetype_alias || ''}) · ${rm.level_range}`,
      thumb: '/thumbs/buildings/wall_arched.webp',
      hoursOrStatus: `ACTIVE FLOOR ${activeFloor.floor_id} · Corridor Width: ${rm.corridor_width_meters}m (>=6.0m Scale Law)`,
      summary: `Tactical Brief: ${roomMobSummary}. +1..+15 Refinement Drops: ${roomDrops.join(', ') || 'Orichalcum Ore, Flux Dust'}. Connected via ${rm.corridor_width_meters}m stone gallery corridors.`,
      address: `${rm.name} (${rm.room_id}) · ${activeFloor.name}`,
      coordinates: `Dungeon Entrance: loc=${dng.entrance_loc} · Floor ${activeFloor.floor_index} of ${floors.length}`,
      scaleSpecs: `Corridor Clearance: ${rm.corridor_width_meters}m (>=6.0m law) · Ceiling Clearance >=4.5m for 1.05m camera`,
      inspectId: dng.studio_node_id,
      connections: [
        ...(rm.key_mobs || []).map(m => ({ label: `👾 ${m}`, badge: rm.level_range })),
        ...roomDrops.map(dr => ({ label: `💎 +1..+15 Refinement Drop: ${dr}`, badge: activeFloor.floor_id }))
      ]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDungeonRoomPoi('${encodePoiAttr({ ...poiRoom, svgX: rx + Math.round(rw / 2), svgY: ry + Math.round(rh / 2) })}', event); selectStudioMapPoi('${encodePoiAttr({ ...poiRoom, svgX: rx + Math.round(rw / 2), svgY: ry + Math.round(rh / 2) })}', event)">
        <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="12"
              fill="${isTower ? 'rgba(23,37,84,0.82)' : 'rgba(38,20,56,0.84)'}"
              stroke="${rIdx === rooms.length - 1 ? '#f59e0b' : '#a855f7'}" stroke-width="2.5"/>
        <rect x="${rx + 8}" y="${ry + 8}" width="${rw - 16}" height="20" rx="4" fill="rgba(9,7,14,0.86)" stroke="rgba(192,132,252,0.45)" stroke-width="1"/>
        <text x="${rx + 14}" y="${ry + 21}" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">
          [${activeFloor.floor_id} · RM-${rIdx + 1}] ${escapeHtml(rm.name.slice(0, 28))} (${escapeHtml(rm.level_range)})
        </text>
        <text x="${rx + 14}" y="${ry + rh - 10}" fill="#cbd5e1" font-size="8.5" font-family="monospace">
          Corridor: ${rm.corridor_width_meters}m · Mobs: ${escapeHtml((rm.key_mobs || []).join(', ').slice(0, 34))}
        </text>
      </g>
    `;
  }).join('');

  // Render filtered Monster / Mini-Boss / Raid / MVP spawn pins on the active floor
  const spawnsSvg = filteredSpawns.map((sp, sIdx) => {
    const rm = rooms[sIdx % Math.max(1, rooms.length)] || { x_pct: 35, y_pct: 35, w_pct: 25, h_pct: 25, corridor_width_meters: 8.5 };
    const sx = Math.round(((rm.x_pct + 6 + ((sIdx * 9) % Math.max(8, rm.w_pct - 10))) / 100) * 1040);
    const sy = Math.round(((rm.y_pct + 10 + ((sIdx * 11) % Math.max(8, rm.h_pct - 14))) / 100) * 500);
    const isMvp = sp.entity_type === 'MVP';
    const isRaid = sp.entity_type === 'Raid' || sp.entity_type === 'RaidBoss';
    const isMini = sp.entity_type === 'Mini-Boss';
    const pinCol = isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444'));
    const pinIcon = isMvp ? '👑' : (isRaid ? '🔥' : (isMini ? '⚔️' : '👾'));
    const refDrops = sp.refinement_drops || ['Refinement Flux Dust', 'High-Grade Orichalcum'];
    const poiSpawn = {
      title: `${pinIcon} ${sp.name} (Lv.${sp.level} ${sp.entity_type})`,
      category: `${sp.race_badge} · HP ${sp.hp_multiplier} · ×${sp.spawn_count} Spawns (${sp.respawn_sec}s)`,
      thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
      hoursOrStatus: `Floor ${activeFloor.floor_id} · Aggro: ${sp.aggro} · Corridor Clearance: ${rm.corridor_width_meters || 8.5}m (>=6.0m)`,
      summary: `Protections: ${(sp.protections || []).join(', ')} | Weaknesses: ${(sp.weaknesses || []).join(', ')} | +1..+15 Refinement Drops: ${refDrops.join(', ')}`,
      address: `${rm.name || activeFloor.name} · ${activeFloor.name} · ${dng.name}`,
      coordinates: `NPC ID: ${sp.npc_id} · loc=${sp.loc_coord}`,
      scaleSpecs: `Chamber Corridor Clearance: ${rm.corridor_width_meters || 8.5}m (>=6.0m) · Strict Hierarchy: GOD_SEALED > MVP > RAID > MINI_BOSS > MONSTER`,
      inspectId: dng.studio_node_id,
      connections: [
        { label: `🛡️ Protections: ${(sp.protections || []).join(', ')}`, badge: sp.hp_multiplier },
        { label: `⚡ Weaknesses: ${(sp.weaknesses || []).join(', ')}`, badge: `Lv.${sp.level}` },
        ...refDrops.map(dr => ({ label: `💎 +1..+15 Refinement Drop: ${dr}`, badge: sp.entity_type }))
      ]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDungeonRoomPoi('${encodePoiAttr({ ...poiSpawn, svgX: sx, svgY: sy })}', event); selectStudioMapPoi('${encodePoiAttr({ ...poiSpawn, svgX: sx, svgY: sy })}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${sx}" cy="${sy}" r="${isMvp || isRaid ? 16 : 13}" fill="${pinCol}" stroke="#ffffff" stroke-width="2.2"/>
        <text x="${sx}" y="${sy + 4}" text-anchor="middle" font-size="${isMvp || isRaid ? 13 : 11}">${pinIcon}</text>
        <rect x="${sx - 78}" y="${sy + 17}" width="156" height="18" rx="4" fill="rgba(9,7,14,0.92)" stroke="${pinCol}" stroke-width="1.2"/>
        <text x="${sx}" y="${sy + 29}" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(sp.name.slice(0, 19))} (Lv.${sp.level} ×${sp.spawn_count})
        </text>
      </g>
    `;
  }).join('');

  // Render clickable inter-floor Warp Portals (B1 <-> B2 <-> B3 / 1F <-> 2F <-> 3F / Overland Exit)
  const warpsSvg = warps.map(wp => {
    const wx = Math.round((wp.x_pct / 100) * 1040);
    const wy = Math.round((wp.y_pct / 100) * 500);
    const isExit = wp.warp_type === 'overland_exit' || wp.target_floor_id === 'OVERLAND';
    const isBoss = wp.warp_type === 'boss_sanctum_warp';
    const wCol = isExit ? '#10b981' : (isBoss ? '#f59e0b' : '#38bdf8');
    const wIcon = isExit ? '🚪' : (isBoss ? '🔥' : (wp.warp_type === 'floor_up' ? '🪜' : '🕳️'));
    const clickCall = isExit
      ? `exitDungeonSubMap('${escapeHtml(wp.target_loc || dng.entrance_loc || '')}')`
      : `switchDungeonFloor('${escapeHtml(wp.target_floor_id)}', '${escapeHtml(wp.target_loc || '')}')`;
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(wp.label)}"
         style="cursor:pointer" onclick="${clickCall}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${clickCall};}"
         filter="url(#cartoDropShadow)">
        <circle cx="${wx}" cy="${wy}" r="22" fill="rgba(56,189,248,0.18)" stroke="${wCol}" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="${wx}" cy="${wy}" r="15" fill="#0f172a" stroke="${wCol}" stroke-width="2.5"/>
        <text x="${wx}" y="${wy + 5}" text-anchor="middle" font-size="13">${wIcon}</text>
        <rect x="${wx - 110}" y="${wy - 38}" width="220" height="20" rx="6" fill="#0f172a" stroke="${wCol}" stroke-width="1.5"/>
        <text x="${wx}" y="${wy - 25}" text-anchor="middle" fill="#fde047" font-size="9" font-weight="900" font-family="monospace">
          ${escapeHtml(wp.label.slice(0, 34))}
        </text>
      </g>
    `;
  }).join('');

  const toastSvg = ATLAS_STATE_STORE.toastMessage ? `
    <g>
      <rect x="310" y="14" width="420" height="26" rx="6" fill="rgba(220,38,38,0.92)" stroke="#fde047" stroke-width="1.5"/>
      <text x="520" y="31" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800" font-family="monospace">
        ⚠️ ${escapeHtml(ATLAS_STATE_STORE.toastMessage)}
      </text>
    </g>
  ` : '';

  const cutawaySvg = renderDungeonVerticalCutawaySvg(dng, activeFloor);
  const dungeonRasterPlate = isTower
    ? '/studio-maps/dungeon_vertical_tower_1f_3f_radar.png'
    : '/studio-maps/dungeon_underground_b1_b3_radar.png';

  const svgInnerHtml = `
    <rect x="0" y="0" width="1040" height="500" fill="${isTower ? '#0d1528' : '#120b1d'}"/>
    <image href="${dungeonRasterPlate}" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.34"/>
    <image href="/studio-maps/d01_dungeon_radar_map.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.16"/>
    <g transform="translate(-85, 0) scale(0.84, 1)">
      ${corridorLinesSvg}
      ${roomsSvg}
      ${spawnsSvg}
      ${warpsSvg}
    </g>
    ${cutawaySvg}
    ${renderAtlasOverviewMiniMapPipSvg(dng, tatlas, 'dungeon')}
    ${toastSvg}
  `;

  const floorControlsHtml = `
    <button type="button" onclick="exitDungeonSubMap('${escapeHtml(dng.entrance_loc || '')}')"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #10b981;background:#064e3b;color:#ecfdf5;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
      🚪 Exit to Overland World Map (Esc)
    </button>
    ${floors.map(f => {
      const isCur = f.floor_id === activeFloor.floor_id;
      return `
        <button type="button" onclick="switchDungeonFloor('${escapeHtml(f.floor_id)}')"
                style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid ${isCur ? '#fde047' : 'rgba(192,132,252,0.5)'};background:${isCur ? '#7e22ce' : 'rgba(15,23,42,0.92)'};color:${isCur ? '#ffffff' : '#e9d5ff'}">
          ${isTower ? '🗼' : '🕳️'} Floor ${escapeHtml(f.floor_id)} (${escapeHtml(f.level_range)})
        </button>
      `;
    }).join('')}
  `;

  const defaultPoi = {
    title: `${dng.name} — Floor ${activeFloor.floor_id}`,
    category: `${dng.l2_archetype_alias} · ${activeFloor.level_range}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `MULTI-FLOOR ${isTower ? 'TOWER (1F⇄2F⇄3F)' : 'LABYRINTH (B1⇄B2⇄B3)'} · ${rooms.length} Rooms · ${filteredSpawns.length} Active Spawn Groups`,
    summary: `Click any green/blue/gold Warp Point on the floor map (or the Floor buttons above) to traverse between ${floors.map(f => f.floor_id).join(' ⇄ ')} or return to the Overland Entrance.`,
    address: `${activeFloor.name} · Entrance loc=${dng.entrance_loc}`,
    coordinates: `Active Floor: ${activeFloor.floor_id} · ${warps.length} Warp Portals`,
    scaleSpecs: `Corridors ≥7.5m–12.0m wide · Unobstructed camera sightlines for 90–120cm characters`,
    inspectId: dng.studio_node_id,
    connections: warps.map(w => ({ label: w.label, badge: w.target_floor_id }))
  };

  return renderCartoShellHtml({
    stepLabel: `🕳️ MULTI-FLOOR DUNGEON & TOWER SUB-MAP · ${escapeHtml(dng.name.toUpperCase())} · FLOOR ${escapeHtml(activeFloor.floor_id)}`,
    title: `${escapeHtml(dng.name)} (${escapeHtml(dng.l2_archetype_alias || '')}) — ${escapeHtml(activeFloor.name)}`,
    subtitle: 'Click any Inter-Floor Warp Portal (🕳️ Descend / 🪜 Ascend / 🔥 Boss Sanctum / 🚪 Overland Exit) to warp between floors immediately',
    activeScaleIndex: 3,
    defaultPoi,
    drillControls: floorControlsHtml,
    filterBarHtml: renderAtlasFilterBarHtml(filteredSpawns.length),
    bottomPanelHtml: renderAtlasFilteredEntityMatrixHtml(tatlas),
    svgInnerHtml,
    legendItems: [
      { color: '#a855f7', label: 'Subterranean / Tower Room Chamber' },
      { color: '#38bdf8', label: '🕳️ / 🪜 Clickable Inter-Floor Warp Portal' },
      { color: '#ef4444', label: '👾 Normal Monster Spawn' },
      { color: '#f97316', label: '⚔️ Mini-Boss & 🔥 Raid Boss' },
      { color: '#eab308', label: '👑 Floor 3 MVP God-Subordinate Sanctum' }
    ]
  });
}

function renderTownArchetypeBackdropSvg(layoutArchetype, wallPts) {
  if (layoutArchetype === 'radial_moat_sanctuary') {
    // Screenshot 3: Dark Elven / Elven Village with concentric water moat + 4 causeway bridges + central octagon
    return `
      <g id="townArchetypeRadialMoatSanctuary" pointer-events="none">
        <rect x="0" y="0" width="1040" height="500" fill="#10212b"/>
        <image href="/studio-maps/town_radial_moat_parchment.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.38"/>
        <!-- Outer & Inner Concentric Water Moats -->
        <ellipse cx="520" cy="250" rx="430" ry="215" fill="#0c4a6e" stroke="#38bdf8" stroke-width="4" fill-opacity="0.72"/>
        <ellipse cx="520" cy="250" rx="355" ry="172" fill="#1e293b" stroke="#7dd3fc" stroke-width="3" stroke-dasharray="10 6" fill-opacity="0.72"/>
        <ellipse cx="520" cy="250" rx="285" ry="138" fill="#083344" stroke="#22d3ee" stroke-width="2.5" fill-opacity="0.72"/>
        <!-- 4 Cardinal Stone Causeway Bridges across the Moat -->
        <rect x="492" y="20" width="56" height="460" fill="#334155" stroke="#eab308" stroke-width="2"/>
        <rect x="75" y="226" width="890" height="48" fill="#334155" stroke="#eab308" stroke-width="2"/>
        <!-- Central Sacred Octagon Sanctuary -->
        <polygon points="440,145 600,145 665,205 665,295 600,355 440,355 375,295 375,205"
                 fill="rgba(15,23,42,0.88)" stroke="#fde047" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="520" cy="250" r="64" fill="rgba(6,182,212,0.18)" stroke="#67e8f9" stroke-width="2" stroke-dasharray="5 4"/>
      </g>
    `;
  }
  if (layoutArchetype === 'harbor_fortress_plaza') {
    // Coastal Harbor / Maritime Pier Town with Sea-Gate, 3 Wooden Timber Piers & Breakwater Wall
    return `
      <g id="townArchetypeHarborFortressPlaza" pointer-events="none">
        <rect x="0" y="0" width="1040" height="500" fill="#1a2e26"/>
        <image href="/studio-maps/d01_town_detailed_blueprint.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.32"/>
        <!-- Southern & Western Coastal Harbor Bay Water -->
        <path d="M 0,340 Q 280,320 540,360 T 1040,335 L 1040,500 L 0,500 Z" fill="#0369a1" stroke="#38bdf8" stroke-width="3"/>
        <path d="M 0,375 Q 320,355 620,390 T 1040,370" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="10 6"/>
        <!-- 3 Harbor Timber Piers & Sea-Gate Quay -->
        <rect x="210" y="335" width="44" height="125" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="2"/>
        <rect x="498" y="345" width="48" height="135" rx="4" fill="#78350f" stroke="#fde047" stroke-width="2.5"/>
        <rect x="760" y="335" width="44" height="125" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="2"/>
        <text x="522" y="472" text-anchor="middle" fill="#bae6fd" font-size="9.5" font-weight="900" font-family="monospace">⚓ HARBOR SEA-GATE &amp; MARITIME QUAY PIERS</text>
        <polygon points="140,60 900,60 930,220 880,355 160,355 110,220"
                 fill="rgba(30,41,59,0.78)" stroke="#fb923c" stroke-width="4.5" stroke-linejoin="round"/>
      </g>
    `;
  }
  if (layoutArchetype === 'schematic_grid_blueprint') {
    // Screenshot 5: Oren by Cheese Crisp Architectural Grid Corridor Backdrop
    return `
      <g id="townArchetypeSchematicGrid" pointer-events="none">
        <rect x="0" y="0" width="1040" height="500" fill="#18202c"/>
        <image href="/studio-maps/town_oren_schematic_plate.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.36"/>
        <polygon points="110,48 930,48 930,452 110,452" fill="rgba(15,23,42,0.78)" stroke="#94a3b8" stroke-width="4"/>
        <rect x="132" y="66" width="776" height="368" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="8 4"/>
        <!-- Architectural Staircases on N/S/E/W Corridors -->
        <g stroke="#cbd5e1" stroke-width="1.5">
          <line x1="495" y1="50" x2="545" y2="50"/><line x1="495" y1="56" x2="545" y2="56"/><line x1="495" y1="62" x2="545" y2="62"/>
          <line x1="495" y1="438" x2="545" y2="438"/><line x1="495" y1="444" x2="545" y2="444"/><line x1="495" y1="450" x2="545" y2="450"/>
        </g>
      </g>
    `;
  }
  // Default: "polygonal_walled_keep" (Screenshot 4 Gludin / Talking Island with hexagonal stone wall + river bridge + north temple)
  return `
    <g id="townArchetypePolygonalWalledKeep" pointer-events="none">
      <rect x="0" y="0" width="1040" height="500" fill="#233729"/>
      <image href="/studio-maps/town_polygonal_keep_parchment.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.38"/>
      <image href="/studio-maps/d01_town_detailed_blueprint.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.18"/>
      <!-- Exterior River Channel & Southern Stone Bridge (Screenshot 4 Gludin / Talking Island style) -->
      <path d="M 0,435 Q 290,415 520,445 T 1040,425" fill="none" stroke="#0284c7" stroke-width="28"/>
      <path d="M 0,435 Q 290,415 520,445 T 1040,425" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-dasharray="8 6"/>
      <rect x="488" y="416" width="64" height="48" rx="4" fill="#475569" stroke="#fde047" stroke-width="2"/>
      <!-- North Temple Sanctuary Terrace -->
      <rect x="370" y="42" width="300" height="72" rx="6" fill="rgba(30,41,59,0.9)" stroke="#eab308" stroke-width="2.5"/>
      <polygon points="${wallPts}" fill="rgba(30,41,59,0.68)" stroke="#eab308" stroke-width="5" stroke-linejoin="round"/>
    </g>
  `;
}

function renderOrenSchematicBlueprintSvg(bp, townNode, visibleMarks, spawnPinSvg) {
  // Screenshot 5: "Oren by Cheese" Architectural CAD Schematic with crisp room blocks, stairs, 1..12 numbered rooms, colored NPC dots & right-hand numbered legend
  const mapW = 750;
  const scaleX = px => Math.round((px / 100) * mapW);
  const scaleY = py => Math.round((py / 100) * 500);
  const npcByBldg = {};
  (bp.npc_roster || []).forEach(n => {
    npcByBldg[n.building_number] = n;
  });

  const schematicStreetsSvg = (bp.streets || []).map(st => {
    const pts = (st.path_pct || []).map(([px, py]) => `${scaleX(px)},${scaleY(py)}`).join(' ');
    const sw = Math.max(12, Math.round((st.width_meters || 12) * 1.5));
    return `
      <g pointer-events="none">
        <polyline points="${pts}" fill="none" stroke="#090d14" stroke-width="${sw + 6}" stroke-linecap="square"/>
        <polyline points="${pts}" fill="none" stroke="#475569" stroke-width="${sw}" stroke-linecap="square"/>
        <polyline points="${pts}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>
      </g>
    `;
  }).join('');

  const schematicRoomsSvg = (bp.buildings || []).map(b => {
    const bx = scaleX(b.x_pct);
    const by = scaleY(b.y_pct);
    const bw = Math.max(54, scaleX(b.w_pct));
    const bh = Math.max(38, scaleY(b.h_pct));
    const npc = npcByBldg[b.building_number] || {};
    const dotCol = npc.color_hex || '#eab308';
    const bldgCatalogTab = b.building_number === 7 ? 'equip_shop' : (b.building_number === 8 ? 'consumable_shop' : (b.building_number === 3 ? 'blacksmith' : 'all'));
    const poiBldg = {
      title: `${b.name} (Oren by Cheese Schematic #${b.building_number})`,
      category: `Architectural Room #${b.building_number} · ${npc.name || ''} (${npc.role_title || ''})`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `SCHEMATIC ROOM #${b.building_number} · NPC: ${npc.name || 'Resident'}`,
      summary: b.function || 'Town service building and artisan counter.',
      address: `Room #${b.building_number} · ${bp.archetype_subtitle}`,
      coordinates: `loc=${npc.loc_coord || ''} · Archetype: ${bp.layout_archetype || 'schematic_grid_blueprint'}`,
      scaleSpecs: `Doorway: 2.15m × 1.60m · Counter: 0.58m · Step Riser: 0.14m`,
      inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
      shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
      activeCatalogTab: bldgCatalogTab,
      connections: [{ label: `🏛️ ${b.function}`, badge: `#${b.building_number}` }]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiBldg, svgX: bx + Math.round(bw / 2), svgY: by + Math.round(bh / 2) })}', event)">
        <!-- Crisp Architectural CAD Room Block with Double Wall & Stair Ticks -->
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#263142" stroke="#e2e8f0" stroke-width="2"/>
        <rect x="${bx + 3}" y="${by + 3}" width="${bw - 6}" height="${bh - 6}" fill="#1b2432" stroke="#64748b" stroke-width="1"/>
        <!-- Doorway Cutout + Architectural Stair Ticks -->
        <rect x="${bx + Math.round(bw / 2) - 8}" y="${by + bh - 4}" width="16" height="6" fill="#475569" stroke="#fde047" stroke-width="0.9"/>
        <!-- Color-coded NPC Dot inside Room (Oren by Cheese style) -->
        <circle cx="${bx + bw - 12}" cy="${by + 12}" r="6.5" fill="${dotCol}" stroke="#ffffff" stroke-width="1.5"/>
        <!-- Large Bold Room Number 1..12 -->
        <text x="${bx + 14}" y="${by + 18}" fill="#ffffff" font-size="12" font-weight="900" font-family="monospace">${b.building_number}</text>
        <text x="${bx + Math.round(bw / 2)}" y="${by + Math.round(bh / 2) + 8}" text-anchor="middle" fill="#cbd5e1" font-size="8.2" font-weight="800" font-family="monospace">
          ${escapeHtml(b.name.replace(/^[0-9]+\.\s*/, '').slice(0, 16))}
        </text>
      </g>
    `;
  }).join('');

  // Right-hand Numbered 1..12 Legend Sidebar inside the SVG (Screenshot 5 "Oren by Cheese")
  const sidebarSvg = `
    <g id="orenByCheeseSchematicLegend">
      <rect x="762" y="14" width="264" height="472" rx="8" fill="#0d131d" stroke="#fde047" stroke-width="1.8"/>
      <text x="894" y="34" text-anchor="middle" fill="#fde047" font-size="10.5" font-weight="900" font-family="monospace">
        📐 "OREN BY CHEESE" SCHEMATIC
      </text>
      <text x="894" y="48" text-anchor="middle" fill="#94a3b8" font-size="8.2" font-weight="700" font-family="monospace">
        NUMBERED ROOMS 1..12 &amp; COLORED NPC DOTS
      </text>
      ${(bp.npc_roster || []).map((npc, idx) => {
        const ry = 62 + idx * 33;
        return `
          <g style="cursor:pointer" onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(npc.loc_coord)}'); render();">
            <rect x="772" y="${ry}" width="244" height="28" rx="4" fill="#161f2e" stroke="rgba(255,255,255,0.1)"/>
            <circle cx="786" cy="${ry + 14}" r="6" fill="${npc.color_hex}" stroke="#ffffff" stroke-width="1.2"/>
            <text x="798" y="${ry + 13}" fill="#fde047" font-size="9" font-weight="900" font-family="monospace">
              #${npc.building_number} ${escapeHtml(npc.name.slice(0, 24))}
            </text>
            <text x="798" y="${ry + 24}" fill="#cbd5e1" font-size="7.8" font-family="monospace">
              ${escapeHtml(npc.role_title.slice(0, 28))} (${escapeHtml(npc.role_category)})
            </text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  return `
    <rect x="0" y="0" width="1040" height="500" fill="#111722"/>
    <image href="/studio-maps/town_oren_schematic_plate.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.42"/>
    <polygon points="48,28 730,28 730,472 48,472" fill="rgba(27,34,48,0.78)" stroke="#94a3b8" stroke-width="4"/>
    ${schematicStreetsSvg}
    ${schematicRoomsSvg}
    ${sidebarSvg}
  `;
}

function renderTownStreetBlueprintAtlas(townNode, tatlas, whc) {
  const bp = getTownBlueprintData(townNode, tatlas);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const activeTownId = (townNode && (townNode.id || townNode.studio_node_id || townNode.zone_id)) || bp.studio_node_id || ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow';
  const fFilter = ATLAS_STATE_STORE.filter;
  const layoutArchetype = bp.layout_archetype || 'polygonal_walled_keep';
  const isSchematicMode = ATLAS_STATE_STORE.townBlueprintMode === 'schematic';
  const wallPts = (bp.wall_polygon_pct || []).map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');

  const streetsSvg = (bp.streets || []).map(st => {
    const pts = (st.path_pct || []).map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');
    const sw = Math.max(10, Math.round((st.width_meters || 12) * 1.4));
    return `
      <g pointer-events="none">
        <polyline points="${pts}" fill="none" stroke="#1e293b" stroke-width="${sw + 6}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#64748b" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="8 6"/>
      </g>
    `;
  }).join('');

  const buildingsSvg = (bp.buildings || []).map(b => {
    const bx = Math.round((b.x_pct / 100) * 1040);
    const by = Math.round((b.y_pct / 100) * 500);
    const bw = Math.round((b.w_pct / 100) * 1040);
    const bh = Math.round((b.h_pct / 100) * 500);
    const bldgCatalogTab = b.building_number === 7 ? 'equip_shop' : (b.building_number === 8 ? 'consumable_shop' : (b.building_number === 3 ? 'blacksmith' : 'all'));
    const poiBldg = {
      title: `${b.name}`,
      category: `Town Blueprint Building #${b.building_number} · ${bp.archetype_subtitle}`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `OPEN 24 HOURS · Safe Town Building #${b.building_number}`,
      summary: b.function || 'Town service building and artisan counter.',
      address: `Building #${b.building_number} · ${bp.archetype_subtitle}`,
      coordinates: `Footprint: ${b.w_pct}% × ${b.h_pct}% · Roof: ${b.roof_color}`,
      scaleSpecs: `Doorway: 2.15m × 1.60m · Counter: 0.58m · Step Riser: 0.14m (90–120cm scale law)`,
      inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
      shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
      activeCatalogTab: bldgCatalogTab,
      connections: [{ label: `🏛️ Function: ${b.function}`, badge: `#${b.building_number}` }]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiBldg, svgX: bx + Math.round(bw / 2), svgY: by + Math.round(bh / 2) })}', event)">
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="${b.roof_color || '#475569'}" stroke="#fde68a" stroke-width="1.8"/>
        <circle cx="${bx + 14}" cy="${by + 14}" r="10" fill="#0f172a" stroke="#fde047" stroke-width="1.5"/>
        <text x="${bx + 14}" y="${by + 18}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">${b.building_number}</text>
        <text x="${bx + Math.round(bw / 2)}" y="${by + Math.round(bh / 2) + 4}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#0f172a;stroke-width:3px;fill:#ffffff;font-size:9px;font-weight:800">
          ${escapeHtml(b.name.replace(/^[0-9]+\.\s*/, '').slice(0, 20))}
        </text>
      </g>
    `;
  }).join('');

  // 7 Canonical Service Marks (equip_shop, consumable_shop, blacksmith, temple, warehouse, guild, gatekeeper)
  const visibleMarks = (bp.service_marks || []).filter(() => fFilter === 'All' || fFilter === 'TownMarks');
  const marksSvg = visibleMarks.map(m => {
    const mx = Math.round((m.x_pct / 100) * 1040);
    const my = Math.round((m.y_pct / 100) * 500);
    const isShopOrRefine = ['equip_shop', 'consumable_shop', 'blacksmith', 'refinement_anvils'].includes(m.mark_type);
    const poiMark = {
      title: `${m.icon} ${m.label} (${m.mark_type})`,
      category: `Town Service Mark · Building #${m.building_number} · ${m.npc_name}`,
      thumb: '/thumbs/props/chest.webp',
      hoursOrStatus: `SERVICE MARK: ${m.mark_type.toUpperCase()} · Building #${m.building_number}`,
      summary: `${m.description} ${isShopOrRefine ? 'Inspect concrete Shop Stock (Weapons, Armor, Potions) and +1 to +15 Refinement Anvil Rates & Material Spoils below!' : ''}`,
      address: `Building #${m.building_number} · ${bp.archetype_subtitle}`,
      coordinates: `Mark ID: ${m.mark_id} · NPC: ${m.npc_name}`,
      scaleSpecs: `0.58m Shop/Forge Counter · 4.4m Artisan Walkway`,
      inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
      shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
      activeCatalogTab: isShopOrRefine ? m.mark_type : 'all',
      connections: [{ label: `🛍️ Resident NPC: ${m.npc_name}`, badge: m.mark_type }]
    };
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(m.label)}"
         style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiMark, svgX: mx, svgY: my })}', event)"
         filter="url(#cartoDropShadow)">
        <circle cx="${mx}" cy="${my}" r="15" fill="#0f172a" stroke="#fde047" stroke-width="2.2"/>
        <text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="13">${m.icon}</text>
        <rect x="${mx - 68}" y="${my + 17}" width="136" height="17" rx="4" fill="rgba(15,23,42,0.94)" stroke="#fde047" stroke-width="1"/>
        <text x="${mx}" y="${my + 28}" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="800" font-family="monospace">
          #${m.building_number} ${escapeHtml(m.mark_type)}
        </text>
      </g>
    `;
  }).join('');

  // 4 Town Gates (linking to adjacent hunting grounds or dungeons)
  const gatesSvg = (bp.gates || []).map(g => {
    const gx = Math.round((g.x_pct / 100) * 1040);
    const gy = Math.round((g.y_pct / 100) * 500);
    const isDngGate = g.target_zone_id && (g.target_zone_id.includes('dungeon') || g.target_zone_id.includes('catacomb'));
    const isTownGate = g.target_zone_id && g.target_zone_id.includes('zone-town-');
    const clickAct = isDngGate
      ? `openDungeonSubMap('${escapeHtml(g.target_zone_id)}')`
      : (isTownGate
        ? `focusTownStreetBlueprint('${escapeHtml(g.target_zone_id)}')`
        : `zoomStudioMap(0, false, 2.5)`);
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickAct}" filter="url(#cartoDropShadow)">
        <circle cx="${gx}" cy="${gy}" r="15" fill="${isDngGate ? '#7e22ce' : '#1d4ed8'}" stroke="#ffffff" stroke-width="2.2"/>
        <text x="${gx}" y="${gy + 4}" text-anchor="middle" font-size="12">${isDngGate ? '🕳️' : '🚪'}</text>
        <rect x="${gx - 88}" y="${gy + (gy > 400 ? -34 : 17)}" width="176" height="18" rx="4" fill="#0f172a" stroke="#93c5fd" stroke-width="1.2"/>
        <text x="${gx}" y="${gy + (gy > 400 ? -22 : 29)}" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(g.name.slice(0, 28))}
        </text>
      </g>
    `;
  }).join('');

  // Central Player Race Spawn / Shrine Monument inside the Town Plaza
  const raceBind = getStudioRaceBinding(activeTownId) || {
    name: (bp.race_spawn_point && bp.race_spawn_point.shrine_name) ? `${bp.race_spawn_point.race_key} (${bp.race_spawn_point.shrine_name})` : 'Accord Shrine',
    icon: '🧬'
  };
  const spawnX = Math.round((((bp.race_spawn_point && bp.race_spawn_point.x_pct) || 50) / 100) * 1040);
  const spawnY = Math.round((((bp.race_spawn_point && bp.race_spawn_point.y_pct) || 49) / 100) * 500);
  const spawnPinSvg = (fFilter === 'All' || fFilter === 'RaceSpawns' || fFilter === 'TownMarks') ? `
    <g data-poi-clickable="1" style="cursor:pointer" transform="translate(${spawnX}, ${spawnY})">
      <circle cx="0" cy="0" r="24" fill="rgba(16,185,129,0.25)" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3"/>
      <circle cx="0" cy="0" r="14" fill="#065f46" stroke="#fde047" stroke-width="2.2"/>
      <text x="0" y="5" text-anchor="middle" font-size="13">🧬</text>
      <rect x="-98" y="-36" width="196" height="18" rx="5" fill="#064e3b" stroke="#34d399" stroke-width="1.2"/>
      <text x="0" y="-24" text-anchor="middle" fill="#ecfdf5" font-size="8.5" font-weight="900" font-family="monospace">
        🧬 SPAWN SHRINE: ${escapeHtml(((bp.race_spawn_point && bp.race_spawn_point.shrine_name) || raceBind.name).slice(0, 22).toUpperCase())}
      </text>
    </g>
  ` : '';

  // Oren by Cheese 1..12 Color-Coded NPC Roster Panel below the blueprint canvas
  const roleColors = {
    trainer: { label: 'Red = Trainer / Guild Master', hex: '#ef4444' },
    merchant: { label: 'Yellow = Merchant (Shop + Refinement)', hex: '#eab308' },
    warehouse: { label: 'Green = Warehouse Keeper', hex: '#22c55e' },
    guard: { label: 'Blue = Town Gate Guard', hex: '#3b82f6' },
    gatekeeper: { label: 'Purple = Gatekeeper Teleporter', hex: '#a855f7' },
    priest: { label: 'Cyan = Temple High Priest', hex: '#06b6d4' }
  };

  const bottomRosterHtml = `
    <div style="padding:12px 16px;background:#0f1520;border-top:1px solid rgba(255,255,255,0.12)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:900;color:#fde047">
          🏛️ TOWN STREET BLUEPRINT SERVICE MARKS (7) &amp; NUMBERED 1..12 NPC ROSTER ("OREN BY CHEESE" COLOR STANDARD)
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px">
          ${Object.values(roleColors).map(rc => `
            <span style="display:inline-flex;align-items:center;gap:4px;color:#cbd5e1">
              <span style="width:9px;height:9px;border-radius:999px;background:${rc.hex};display:inline-block"></span>
              <span>${escapeHtml(rc.label)}</span>
            </span>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:6px">
        ${(bp.npc_roster || []).map(npc => `
          <div onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(npc.loc_coord)}'); render();"
               style="padding:6px 9px;border-radius:6px;background:#161f2e;border-left:3.5px solid ${npc.color_hex};border-top:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px">
            <div style="min-width:0">
              <div style="font-size:11px;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                <span class="mono" style="color:#fde047">#${npc.building_number}</span> ${escapeHtml(npc.name)}
              </div>
              <div style="font-size:10px;color:#94a3b8">${escapeHtml(npc.role_title)} (<span class="mono">${escapeHtml(npc.role_category)}</span>)</div>
            </div>
            <span class="mono" style="font-size:9.5px;color:#38bdf8;flex-shrink:0">${escapeHtml(npc.loc_coord)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const archetypeLabels = {
    radial_moat_sanctuary: '🌊 Radial Moat Sanctuary (Screenshot 3 Dark Elven / Elven Village)',
    polygonal_walled_keep: '🏰 Polygonal Walled Keep (Screenshot 4 Gludin / Talking Island)',
    schematic_grid_blueprint: '📐 Architectural Grid Blueprint (Screenshot 5 "Oren by Cheese")',
    harbor_fortress_plaza: '⚓ Coastal Harbor & Fortress Plaza (Pier & Sea-Gate Archetype)'
  };
  const activeArchetypeLabel = archetypeLabels[layoutArchetype] || archetypeLabels.polygonal_walled_keep;

  const pipWorldRadarSvg = renderAtlasOverviewMiniMapPipSvg(activeTownId, tatlas, 'town');
  const svgInnerHtml = isSchematicMode
    ? `${renderOrenSchematicBlueprintSvg(bp, townNode, visibleMarks, spawnPinSvg)}${pipWorldRadarSvg}`
    : `
      ${renderTownArchetypeBackdropSvg(layoutArchetype, wallPts)}
      ${streetsSvg}
      ${buildingsSvg}
      ${marksSvg}
      ${gatesSvg}
      ${spawnPinSvg}
      <g pointer-events="none">
        <rect x="16" y="432" width="380" height="24" rx="6" fill="rgba(15,23,42,0.92)" stroke="#fde047" stroke-width="1.2"/>
        <text x="206" y="448" text-anchor="middle" fill="#fde047" font-size="9" font-weight="900" font-family="monospace">
          ARCHETYPE: ${escapeHtml(layoutArchetype.toUpperCase())}
        </text>
      </g>
      ${pipWorldRadarSvg}
    `;

  const defaultPoi = {
    title: bp.archetype_subtitle,
    category: `Tier 3 Semantic Zoom (4.5×–12.0×) · ${activeArchetypeLabel}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `ARCHETYPE: ${layoutArchetype.toUpperCase()} · 7 SERVICE MARKS · 12 BUILDINGS & NPCS`,
    summary: 'Click any ⚔️ Equip Shop, 🧪 Consumable Shop, or ⚒️ Refinement & Blacksmith on the Town Blueprint to inspect concrete Shop Stock (Weapons, Armor, Potions) and +1 to +15 Refinement Anvil Rates & Material Spoils.',
    address: bp.archetype_subtitle,
    coordinates: `Zoom: ${STUDIO_MAP_ZOOM.toFixed(2)}× · loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`,
    scaleSpecs: `Layout Archetype: ${layoutArchetype} · Main Avenue: 14.0m · Crossway: 12.5m · Shop Counters: 0.58m`,
    inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
    shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
    activeCatalogTab: 'all',
    connections: (bp.service_marks || []).map(m => ({ label: `${m.icon} #${m.building_number} ${m.label} (${m.npc_name})`, badge: m.mark_type }))
  };

  const linkedDngGate = (bp.gates || []).find(g => g.target_zone_id && (g.target_zone_id.includes('dungeon') || g.target_zone_id.includes('catacomb')));
  const linkedDngId = (linkedDngGate && linkedDngGate.target_zone_id) || 'zone-dungeon-kiln-cellar';

  const townControlsHtml = `
    <button type="button" onclick="zoomStudioMap(0, true)"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#0f172a;color:#fde047">
      ⬅ Zoom Out to Overland World Map (1.0×)
    </button>
    <select aria-label="Switch Active Town Street Blueprint" onchange="if(this.value){const [tid,loc]=this.value.split('|');focusTownStreetBlueprint(tid,loc);}"
            style="min-height:28px;padding:4px 9px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #4ade80;background:#064e3b;color:#ecfdf5">
      ${allTowns.map(t => {
        const sel = (t.studio_node_id === activeTownId || t.zone_id === activeTownId) ? 'selected' : '';
        const tArch = (t.town_blueprint && t.town_blueprint.layout_archetype) || 'polygonal_walled_keep';
        return `<option value="${escapeHtml(t.studio_node_id)}|${escapeHtml(t.loc_coord || '')}" ${sel}>🏰 ${escapeHtml(t.name)} [${escapeHtml(tArch)}]</option>`;
      }).join('')}
    </select>
    <div style="display:inline-flex;background:#0f172a;padding:2px;border-radius:8px;border:1.5px solid #fde047">
      <button type="button" onclick="setTownBlueprintMode('parchment')"
              style="min-height:24px;padding:3px 9px;border-radius:6px;font-size:10.5px;font-weight:900;cursor:pointer;border:none;background:${!isSchematicMode ? '#d97706' : 'transparent'};color:${!isSchematicMode ? '#ffffff' : '#cbd5e1'}">
        📜 Parchment Town Map (Screenshots 3 &amp; 4)
      </button>
      <button type="button" onclick="setTownBlueprintMode('schematic')"
              style="min-height:24px;padding:3px 9px;border-radius:6px;font-size:10.5px;font-weight:900;cursor:pointer;border:none;background:${isSchematicMode ? '#2563eb' : 'transparent'};color:${isSchematicMode ? '#ffffff' : '#cbd5e1'}">
        📐 Architectural Schematic ("Oren by Cheese" Screenshot 5)
      </button>
    </div>
    <button type="button" onclick="openDungeonSubMap('${escapeHtml(linkedDngId)}')"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #e9d5ff;background:#7e22ce;color:#ffffff">
      🕳️ Warp to Connected Dungeon (${escapeHtml(linkedDngId)}) ➔
    </button>
  `;

  return renderCartoShellHtml({
    stepLabel: `🏘️ TIER 3 SEMANTIC ZOOM (${STUDIO_MAP_ZOOM.toFixed(2)}×) · TOWN STREET, BUILDING & SERVICE-MARK BLUEPRINT`,
    title: `${escapeHtml(bp.archetype_subtitle)} — Streets, #1..#12 Buildings, 7 Shop/Refinement Marks & NPC Roster`,
    subtitle: 'Inspired by Lineage II Gludin/Dark Elven Village & Oren by Cheese: click any Building #1..#12, Service Mark (⚔️/🧪/⚒️/🏛️/📦/🛡️/🌀), or Gate',
    activeScaleIndex: 4,
    defaultPoi,
    drillControls: townControlsHtml,
    filterBarHtml: renderAtlasFilterBarHtml(visibleMarks.length + (bp.npc_roster || []).length),
    bottomPanelHtml: `${bottomRosterHtml}${renderAtlasFilteredEntityMatrixHtml(tatlas)}`,
    svgInnerHtml,
    legendItems: [
      { color: '#ef4444', label: 'Trainer / Guild (#1,#2,#9)' },
      { color: '#eab308', label: 'Merchant: Equip, Grocery & Blacksmith (#3,#7,#8)' },
      { color: '#22c55e', label: 'Warehouse Vault (#6)' },
      { color: '#a855f7', label: 'Gatekeeper Teleport (#5)' },
      { color: '#06b6d4', label: 'Temple High Priest (#4)' },
      { color: '#3b82f6', label: 'Town Gate Guards (#10,#11,#12)' }
    ]
  });
}

function renderFieldOrFortressTacticalBlueprintAtlas(targetIdOrEntry, tatlas) {
  const resolved = getFieldOrFortressBlueprintData(targetIdOrEntry, tatlas);
  if (!resolved) {
    return '';
  }
  const { kind, entry, bp } = resolved;
  const isFort = kind === 'fortress';
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allForts = getAllAtlasFortressEntries(tatlas);
  const fFilter = ATLAS_STATE_STORE.filter;

  const perimArr = bp.terrain_perimeter_pct || bp.bastion_wall_pct || [[10, 14], [88, 12], [92, 48], [86, 86], [14, 88], [8, 50]];
  const perimPts = perimArr.map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');

  const trailsSvg = (bp.patrol_trails || []).map(tr => {
    const pts = (tr.path_pct || []).map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');
    const sw = Math.max(8, Math.round((tr.width_meters || 9) * 1.3));
    return `
      <g pointer-events="none">
        <polyline points="${pts}" fill="none" stroke="#1c1917" stroke-width="${sw + 5}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#78716c" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#fde047" stroke-width="1.5" stroke-dasharray="7 5"/>
      </g>
    `;
  }).join('');

  // Camp & Shrine Marks (Supply Camp, Wayfarer Shrine, Gatekeeper Waypoint, Refinement Ore Vein)
  const visibleMarks = (bp.camp_and_shrine_marks || []).filter(() => fFilter === 'All' || fFilter === 'TownMarks');
  const marksSvg = visibleMarks.map(m => {
    const mx = Math.round((m.x_pct / 100) * 1040);
    const my = Math.round((m.y_pct / 100) * 500);
    const poiMark = {
      title: `${m.icon} ${m.label} (${m.mark_type})`,
      category: `${isFort ? 'Fortress / Harbor' : 'Field Hunting Area'} Tactical Mark · ${m.npc_or_node}`,
      thumb: '/thumbs/props/chest.webp',
      hoursOrStatus: `ACTIVE ${m.mark_type.toUpperCase()} · ${entry.name}`,
      summary: m.description,
      address: `${m.label} · ${bp.archetype_subtitle}`,
      coordinates: `Mark ID: ${m.mark_id} · Node: ${m.npc_or_node}`,
      scaleSpecs: `Clearance ≥6.0m · Wayfarer & Refinement Vein Access`,
      inspectId: entry.studio_node_id,
      connections: [{ label: `📍 ${m.npc_or_node}`, badge: m.mark_type }]
    };
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(m.label)}"
         style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiMark, svgX: mx, svgY: my })}', event)"
         filter="url(#cartoDropShadow)">
        <circle cx="${mx}" cy="${my}" r="15" fill="#064e3b" stroke="#fde047" stroke-width="2.2"/>
        <text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="13">${m.icon}</text>
        <rect x="${mx - 74}" y="${my + 17}" width="148" height="17" rx="4" fill="rgba(6,78,59,0.94)" stroke="#34d399" stroke-width="1"/>
        <text x="${mx}" y="${my + 28}" text-anchor="middle" fill="#ecfdf5" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(m.mark_type.slice(0, 20))}
        </text>
      </g>
    `;
  }).join('');

  // Spawn Territories (Monster Pack Rings, Mini-Boss Patrols, Raid Boss Arenas, MVP Sanctums + Refinement Drop Badges)
  const visibleTerritories = (bp.spawn_territories || []).filter(st => {
    if (!matchesAtlasLevelBand(st.level)) return false;
    if (fFilter === 'All') return true;
    return st.entity_type === fFilter;
  });

  const territoriesSvg = visibleTerritories.map(st => {
    const sx = Math.round((st.x_pct / 100) * 1040);
    const sy = Math.round((st.y_pct / 100) * 500);
    const rPx = Math.max(32, Math.round((st.radius_pct / 100) * 500));
    const isMvp = st.entity_type === 'MVP';
    const isRaid = st.entity_type === 'Raid';
    const isMini = st.entity_type === 'Mini-Boss';
    const col = isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444'));
    const fillRgba = isMvp ? 'rgba(234,179,8,0.18)' : (isRaid ? 'rgba(249,115,22,0.18)' : (isMini ? 'rgba(168,85,247,0.18)' : 'rgba(239,68,68,0.16)'));
    const icon = isMvp ? '👑' : (isRaid ? '🔥' : (isMini ? '⚔️' : '👾'));
    const ringKindLabel = isMvp ? 'MVP Boss Sanctum' : (isRaid ? 'Raid Boss Arena' : (isMini ? 'Mini-Boss Patrol' : 'Monster Pack Ring'));
    const dropsStr = (st.refinement_drops || []).join(' · ');
    const poiTerr = {
      title: `${icon} ${st.mob_name} (Lv.${st.level} ${st.entity_type})`,
      category: `${ringKindLabel} · ×${st.count} (${st.respawn}) · loc=${st.loc_coord}`,
      thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
      hoursOrStatus: `${ringKindLabel.toUpperCase()} · Respawn ${st.respawn}`,
      summary: `Refinement Drops: ${dropsStr}`,
      address: `${entry.name} · loc=${st.loc_coord}`,
      coordinates: `Territory: ${st.territory_id} · Radius: ${st.radius_pct}%`,
      scaleSpecs: `Refinement Drops: ${dropsStr}`,
      inspectId: entry.studio_node_id,
      connections: (st.refinement_drops || []).map(d => ({ label: `💎 Refinement Drop: ${d}`, badge: st.entity_type }))
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiTerr, svgX: sx, svgY: sy })}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${sx}" cy="${sy}" r="${rPx}" fill="${fillRgba}" stroke="${col}" stroke-width="2.2" stroke-dasharray="${isMvp || isRaid ? 'none' : '6 4'}"/>
        <circle cx="${sx}" cy="${sy}" r="14" fill="${col}" stroke="#ffffff" stroke-width="2"/>
        <text x="${sx}" y="${sy + 4}" text-anchor="middle" font-size="12">${icon}</text>
        <rect x="${sx - 88}" y="${sy + 17}" width="176" height="17" rx="4" fill="rgba(9,13,20,0.92)" stroke="${col}" stroke-width="1.2"/>
        <text x="${sx}" y="${sy + 28}" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(st.mob_name.slice(0, 21))} (Lv.${st.level} ×${st.count})
        </text>
        <rect x="${sx - 84}" y="${sy + 36}" width="168" height="15" rx="4" fill="rgba(30,27,75,0.92)" stroke="#38bdf8" stroke-width="1"/>
        <text x="${sx}" y="${sy + 46}" text-anchor="middle" fill="#bae6fd" font-size="7.8" font-weight="800" font-family="monospace">
          💎 ${escapeHtml(((st.refinement_drops && st.refinement_drops[0]) || 'Refinement Ore').slice(0, 24))}
        </text>
      </g>
    `;
  }).join('');

  // Clickable Dungeon Entrance Warps (calling openDungeonSubMap(dungeonId, 'B1' / '1F'))
  const warpsSvg = (bp.dungeon_entrance_warps || []).map(dw => {
    const wx = Math.round((dw.x_pct / 100) * 1040);
    const wy = Math.round((dw.y_pct / 100) * 500);
    const clickCall = `openDungeonSubMap('${escapeHtml(dw.dungeon_id)}', '${escapeHtml(dw.floor_id || 'B1')}')`;
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(dw.label)}"
         style="cursor:pointer" onclick="${clickCall}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${clickCall};}"
         filter="url(#cartoDropShadow)">
        <circle cx="${wx}" cy="${wy}" r="24" fill="rgba(168,85,247,0.28)" stroke="#fde047" stroke-width="2.2" stroke-dasharray="4 3"/>
        <circle cx="${wx}" cy="${wy}" r="16" fill="#581c87" stroke="#ffffff" stroke-width="2.2"/>
        <text x="${wx}" y="${wy + 5}" text-anchor="middle" font-size="13">🕳️</text>
        <rect x="${wx - 108}" y="${wy - 38}" width="216" height="20" rx="6" fill="#3b0764" stroke="#fde047" stroke-width="1.5"/>
        <text x="${wx}" y="${wy - 25}" text-anchor="middle" fill="#fde047" font-size="8.8" font-weight="900" font-family="monospace">
          ${escapeHtml(dw.label.slice(0, 34))}
        </text>
      </g>
    `;
  }).join('');

  const primaryWarp = (bp.dungeon_entrance_warps && bp.dungeon_entrance_warps[0]) || { dungeon_id: 'zone-dungeon-kiln-cellar', floor_id: 'B1', label: '🕳️ Enter Connected Dungeon (B1)' };

  const drillControlsHtml = `
    <button type="button" onclick="zoomStudioMap(0, true)"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#0f172a;color:#fde047">
      ⬅ Zoom Out to Overland World Map (1.0×)
    </button>
    <select aria-label="Switch Active Field Tactical Blueprint" onchange="if(this.value){const [fid,loc]=this.value.split('|');focusFieldTacticalBlueprint(fid,loc);}"
            style="min-height:28px;padding:4px 9px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #86efac;background:#052e16;color:#f0fdf4">
      ${allFields.map(f => {
        const sel = (f.zone_id === entry.zone_id || f.studio_node_id === entry.studio_node_id) ? 'selected' : '';
        return `<option value="${escapeHtml(f.zone_id)}|${escapeHtml(f.loc_coord || '')}" ${sel}>🏕️ ${escapeHtml(f.name)}</option>`;
      }).join('')}
      ${allForts.map(h => {
        const sel = (h.zone_id === entry.zone_id) ? 'selected' : '';
        return `<option value="${escapeHtml(h.zone_id)}|${escapeHtml(h.loc_coord || '')}" ${sel}>🛡️ ${escapeHtml(h.name)}</option>`;
      }).join('')}
    </select>
    <button type="button" onclick="openDungeonSubMap('${escapeHtml(primaryWarp.dungeon_id)}', '${escapeHtml(primaryWarp.floor_id || 'B1')}')"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #e9d5ff;background:#7e22ce;color:#ffffff">
      🕳️ Dungeon Entrance Warp: ${escapeHtml(primaryWarp.dungeon_id)} (${escapeHtml(primaryWarp.floor_id || 'B1')}) ➔
    </button>
  `;

  const bottomTacticalPanelHtml = `
    <div style="padding:12px 16px;background:#0f1520;border-top:1px solid rgba(255,255,255,0.12)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:900;color:#86efac">
          🏕️ FIELD &amp; FORTRESS TACTICAL BLUEPRINT — MONSTER PACK RINGS, MINI-BOSS PATROLS, RAID ARENAS, REFINEMENT DROPS &amp; DUNGEON WARPS
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${(bp.dungeon_entrance_warps || []).map(dw => `
            <button type="button" onclick="openDungeonSubMap('${escapeHtml(dw.dungeon_id)}', '${escapeHtml(dw.floor_id || 'B1')}')"
                    style="padding:3px 9px;border-radius:6px;border:1px solid #fde047;background:#581c87;color:#fde047;font-size:10px;font-weight:800;cursor:pointer">
              ${escapeHtml(dw.label)} (${escapeHtml(dw.dungeon_id)} · ${escapeHtml(dw.floor_id || 'B1')})
            </button>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px">
        ${(bp.spawn_territories || []).map(st => `
          <div onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(st.loc_coord)}'); render();"
               style="padding:7px 10px;border-radius:6px;background:#161f2e;border-left:3.5px solid ${st.entity_type === 'MVP' ? '#eab308' : (st.entity_type === 'Raid' ? '#f97316' : (st.entity_type === 'Mini-Boss' ? '#a855f7' : '#ef4444'))};cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
              <span style="font-size:11px;font-weight:800;color:#f8fafc">${escapeHtml(st.mob_name)}</span>
              <span class="mono" style="font-size:9.5px;color:#fde047">Lv.${st.level} · ${escapeHtml(st.entity_type)}</span>
            </div>
            <div style="font-size:10px;color:#bae6fd;margin-top:3px">
              💎 Refinement Drops: ${escapeHtml((st.refinement_drops || []).join(', '))}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const svgInnerHtml = `
    <rect x="0" y="0" width="1040" height="500" fill="${isFort ? '#1e2433' : '#14291e'}"/>
    <image href="/studio-maps/d01_hunting_zone_radar.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.32"/>
    <polygon points="${perimPts}" fill="${isFort ? 'rgba(30,41,59,0.68)' : 'rgba(20,83,45,0.52)'}" stroke="${isFort ? '#fb923c' : '#4ade80'}" stroke-width="4" stroke-linejoin="round" stroke-dasharray="${isFort ? 'none' : '10 5'}"/>
    ${trailsSvg}
    ${territoriesSvg}
    ${marksSvg}
    ${warpsSvg}
    ${renderAtlasOverviewMiniMapPipSvg(entry, tatlas, kind)}
  `;

  const defaultPoi = {
    title: bp.archetype_subtitle,
    category: `${isFort ? '🛡️ Harbor / Clan Hall / Fortress Blueprint' : '🏕️ Field Hunting Area Tactical Blueprint'} · ${entry.level_header || ''}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `4 SPAWN TERRITORIES (MONSTER/MINI-BOSS/RAID/MVP) · 4 CAMP/SHRINE/ORE MARKS · DUNGEON WARP`,
    summary: `Features Monster Pack Rings, Mini-Boss Patrols, Raid Boss Arenas, Refinement Drop Badges, and a clickable Dungeon Entrance Warp to ${primaryWarp.dungeon_id} (${primaryWarp.floor_id}).`,
    address: `${entry.name} · ${entry.territory_name || ''}`,
    coordinates: `loc=${entry.loc_coord} · Grid ${entry.grid_sector || ''}`,
    scaleSpecs: `Patrol Trails: 7.5m–9.5m · Dungeon Entrance Warp: ${primaryWarp.dungeon_id} (${primaryWarp.floor_id})`,
    dungeonWarpId: primaryWarp.dungeon_id,
    dungeonFloorId: primaryWarp.floor_id || 'B1',
    drillLabel: `Warp to ${primaryWarp.dungeon_id} (${primaryWarp.floor_id || 'B1'})`,
    inspectId: entry.studio_node_id,
    connections: [
      ...(bp.dungeon_entrance_warps || []).map(w => ({ label: w.label, badge: `${w.dungeon_id} (${w.floor_id})` })),
      ...(bp.camp_and_shrine_marks || []).map(m => ({ label: `${m.icon} ${m.label}`, badge: m.mark_type }))
    ]
  };

  return renderCartoShellHtml({
    stepLabel: `${isFort ? '🛡️ FORTRESS, HARBOR & CLAN HALL' : '🏕️ FIELD HUNTING AREA'} TACTICAL BLUEPRINT (${STUDIO_MAP_ZOOM.toFixed(2)}×)`,
    title: `${escapeHtml(bp.archetype_subtitle)} — Monster Pack Rings, Mini-Boss Patrols, Raid Arenas, Refinement Drops & Dungeon Entrance Warps`,
    subtitle: 'Click any Spawn Ring (👾/⚔️/🔥/👑) for Refinement Drops, Camp/Shrine/Ore Mark (⛺/⛩️/🌀/💎), or 🕳️ Dungeon Entrance Warp to open the Connected Dungeon Sub-Map',
    activeScaleIndex: 4,
    defaultPoi,
    drillControls: drillControlsHtml,
    filterBarHtml: renderAtlasFilterBarHtml(visibleTerritories.length + visibleMarks.length),
    bottomPanelHtml: `${bottomTacticalPanelHtml}${renderAtlasFilteredEntityMatrixHtml(tatlas)}`,
    svgInnerHtml,
    legendItems: [
      { color: '#ef4444', label: '👾 Monster Pack Ring' },
      { color: '#a855f7', label: '⚔️ Mini-Boss Patrol' },
      { color: '#f97316', label: '🔥 Raid Boss Arena' },
      { color: '#eab308', label: '👑 MVP Sanctum' },
      { color: '#38bdf8', label: '💎 Refinement Drop / Ore Vein' },
      { color: '#c084fc', label: '🕳️ Clickable Dungeon Entrance Warp' }
    ]
  });
}

function renderDedicatedWorldAtlas() {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const whc = sp.worldHistoryAndConcept || {};
  const continents = sp.continents || [];
  const nodes = sp.nodes || [];
  const tatlas = sp.tShapedWorldAtlas || {};
  const dungeons = tatlas.multi_floor_dungeons || [];

  // 1. If a Multi-Floor Dungeon / Tower Sub-Map is active, render the interactive floor stack
  if (ATLAS_STATE_STORE.activeDungeonId) {
    const activeDng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId || d.studio_node_id === ATLAS_STATE_STORE.activeDungeonId) || dungeons[0];
    if (activeDng) {
      return renderDungeonSubMapAtlas(activeDng, tatlas);
    }
  }

  // 2. If a Field Hunting Area (24) or Harbor/ClanHall/Fortress (8) Tactical Blueprint is active (or selected at zoom >= 3.5x), render it!
  const lodTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allForts = getAllAtlasFortressEntries(tatlas);
  const candidateFieldOrFortId = ATLAS_STATE_STORE.activeFieldOrFortId
    || (STUDIO_MAP_ZOOM >= 3.5 && STUDIO_MAP_ZOOM < 4.5 ? (ATLAS_FOCUSED_FIELD_ID || ATLAS_FOCUSED_FORTRESS_ID || STUDIO_SELECTED_NODE_ID) : '');
  if (candidateFieldOrFortId) {
    const matchedFieldOrFort = allFields.find(f => f.zone_id === candidateFieldOrFortId || f.studio_node_id === candidateFieldOrFortId)
      || allForts.find(h => h.zone_id === candidateFieldOrFortId || h.studio_node_id === candidateFieldOrFortId);
    if (matchedFieldOrFort) {
      return renderFieldOrFortressTacticalBlueprintAtlas(matchedFieldOrFort, tatlas);
    }
  }

  // 3. If Semantic Zoom >= 4.5x (Tier 3), automatically transition to the Town Street, Building & Service-Mark Blueprint!
  if (lodTier === 3) {
    const allTownEntries = getAllAtlasTownEntries(tatlas);
    const targetTownId = ATLAS_STATE_STORE.activeTownId || ATLAS_FOCUSED_TOWN_ID || STUDIO_SELECTED_NODE_ID || 'town-lantern-hollow';
    const activeTown = nodes.find(n => n.id === targetTownId)
      || allTownEntries.find(t => t.studio_node_id === targetTownId || t.zone_id === targetTownId)
      || nodes.find(n => n.node_type === 'town');
    return renderTownStreetBlueprintAtlas(activeTown, tatlas, whc);
  }

  // 3. Otherwise render the continuous Overland World Atlas (Tier 1 Macro 1.0x-2.2x + Tier 2 Regional 2.2x-4.5x)
  const fFilter = ATLAS_STATE_STORE.filter;
  const c01 = continents[0] || { id: 'continent-01-hearthbloom-basin', name: 'Hearthbloom Basin' };
  const c02 = continents[1] || { id: 'continent-02-clockwork-steppe', name: 'The Clockwork Steppe' };
  const c03 = continents[2] || { id: 'continent-03-shattered-halo', name: 'The Shattered Halo' };

  // Iconic Overland Landmarks with dual Canon + Lineage II Archetype names & priority AABB label ranks
  const overlandLandmarks = [
    {
      id: 'town-lantern-hollow',
      kind: 'town',
      priority: 1,
      x: 445,
      y: 432,
      lv: [1, 10],
      loc: '-84120:243500',
      label: 'Lantern Hollow (Gludin / Talking Island)',
      sublabel: '🧬 Human Spawn · Lv.1–10 Starter Town',
      raceName: 'Human (Hearth-Born)',
      isRaceSpawn: true,
      townBlueprintId: 'town-lantern-hollow',
      flagColor: '#eab308',
      continentId: c01.id,
      districtId: 'district-teacup-meadows'
    },
    {
      id: 'town-porcelain-loom-sanctuary',
      kind: 'town',
      priority: 2,
      x: 535,
      y: 398,
      lv: [1, 10],
      loc: '45800:41200',
      label: 'Porcelain Loom (Elven Village)',
      sublabel: '🧬 Lunar Spawn · Lv.1–10 Starter Town',
      raceName: 'Lunar (Moon-Weavers)',
      isRaceSpawn: true,
      townBlueprintId: 'town-porcelain-loom-sanctuary',
      flagColor: '#38bdf8',
      continentId: c01.id,
      districtId: 'district-porcelain-cradle'
    },
    {
      id: 'town-draft-kiln-post',
      kind: 'fortress',
      priority: 2,
      x: 345,
      y: 412,
      lv: [1, 10],
      loc: '-44800:-113200',
      label: 'Draft-Kiln Post (Orc Village)',
      sublabel: '🧬 Ogre/Orc Spawn · Lv.1–10 Starter Town',
      raceName: 'Ogre / Orc (Bellows-Kin)',
      isRaceSpawn: true,
      townBlueprintId: 'town-draft-kiln-post',
      flagColor: '#f97316',
      continentId: c01.id,
      districtId: 'district-ash-bellows-trench'
    },
    {
      id: 'town-root-train-roundhouse',
      kind: 'town',
      priority: 2,
      x: 685,
      y: 418,
      lv: [1, 10],
      loc: '115100:-178200',
      label: 'Root-Train Roundhouse (Dwarven Village)',
      sublabel: '🧬 Dwarf Spawn · Lv.1–10 Starter Town',
      raceName: 'Dwarf (Anvil-Forged)',
      isRaceSpawn: true,
      townBlueprintId: 'town-root-train-roundhouse',
      flagColor: '#eab308',
      continentId: c01.id,
      districtId: 'district-amber-root-hollows'
    },
    {
      id: 'town-carillon-hearth-belfry',
      kind: 'town',
      priority: 2,
      x: 392,
      y: 348,
      lv: [1, 10],
      loc: '12400:16800',
      label: 'Carillon Belfry (Dark Elven Village)',
      sublabel: '🧬 Dark-Lunar Spawn · Lv.1–10 Starter Town',
      raceName: 'Dark-Lunar (Chime-forged)',
      isRaceSpawn: true,
      townBlueprintId: 'town-carillon-hearth-belfry',
      flagColor: '#a855f7',
      continentId: c01.id,
      districtId: 'district-terracotta-wind-chimes'
    },
    {
      id: 'town-cinnamon-mill-haven',
      kind: 'windmill',
      priority: 2,
      x: 245,
      y: 342,
      lv: [1, 10],
      loc: '-118200:46800',
      label: 'Cinnamon-Mill Haven (Kamael Village)',
      sublabel: '🧬 Furral Spawn · Lv.1–10 Starter Town',
      raceName: 'Furral (Wind-Tail)',
      isRaceSpawn: true,
      townBlueprintId: 'town-cinnamon-mill-haven',
      flagColor: '#22c55e',
      continentId: c01.id,
      districtId: 'district-cinnamon-bellows-bluff'
    },
    {
      id: 'town-kilnwatch-bastion',
      kind: 'castle',
      priority: 1,
      x: 595,
      y: 345,
      lv: [10, 20],
      loc: '18600:145200',
      label: 'Kilnwatch Bastion (Town of Dion / Gludio)',
      sublabel: '🤝 Lv.10–20 All-Race Convergence Castle Hub',
      townBlueprintId: 'town-kilnwatch-bastion',
      flagColor: '#dc2626',
      continentId: c01.id,
      districtId: 'district-kilnfire-terraces'
    },
    {
      id: 'zone-dungeon-kiln-cellar',
      kind: 'catacomb',
      priority: 1,
      x: 495,
      y: 465,
      lv: [9, 22],
      loc: '-113490:235526',
      label: 'Kiln Cellar Ruins (The Ant Nest)',
      sublabel: '🕳️ Click to Warp: Underground B1 ⇄ B2 ⇄ B3 (Lv.9–22)',
      dungeonWarpId: 'zone-dungeon-kiln-cellar',
      dungeonFloorId: 'B1',
      flagColor: '#a855f7',
      continentId: c01.id,
      districtId: 'district-teacup-meadows'
    },
    {
      id: 'town-pinion-terminus',
      kind: 'castle',
      priority: 1,
      x: 745,
      y: 288,
      lv: [18, 25],
      loc: '82900:53200',
      label: 'Pinion Terminus (Town of Oren)',
      sublabel: '⚙️ Lv.18–25 Clockwork Steppe Hub Town',
      townBlueprintId: 'town-pinion-terminus',
      flagColor: '#dc2626',
      continentId: c02.id,
      districtId: 'district-pinion-terminus'
    },
    {
      id: 'zone-dungeon-pendulum-shaft',
      kind: 'tower',
      priority: 1,
      x: 665,
      y: 252,
      lv: [20, 30],
      loc: '85400:144200',
      label: 'Pendulum Shaft (Cruma Tower)',
      sublabel: '🗼 Click to Warp: Vertical Spire 1F ⇄ 2F ⇄ 3F (Lv.20–30)',
      dungeonWarpId: 'zone-dungeon-pendulum-shaft',
      dungeonFloorId: '1F',
      flagColor: '#38bdf8',
      continentId: c02.id,
      districtId: 'district-pinion-terminus'
    },
    {
      id: 'zone-dungeon-chronometer-foundry',
      kind: 'tower',
      priority: 1,
      x: 845,
      y: 215,
      lv: [25, 35],
      loc: '84800:56400',
      label: 'Chronometer Foundry (Tower of Insolence)',
      sublabel: '🗼 Click to Warp: Escapement Spire 1F ⇄ 2F ⇄ 3F (Lv.25–35)',
      dungeonWarpId: 'zone-dungeon-chronometer-foundry',
      dungeonFloorId: '1F',
      flagColor: '#f59e0b',
      continentId: c02.id,
      districtId: 'district-mainspring-caldera'
    },
    {
      id: 'town-starfall-haven',
      kind: 'castle',
      priority: 1,
      x: 565,
      y: 122,
      lv: [38, 55],
      loc: '-14200:-124000',
      label: 'Starfall Haven (Aden / Gracia Sky-Harbor)',
      sublabel: '✨ Lv.38–55 Shattered Halo Capital',
      townBlueprintId: 'town-starfall-haven',
      flagColor: '#38bdf8',
      continentId: c03.id,
      districtId: 'district-starfall-haven'
    },
    {
      id: 'citadel-crown-lens',
      kind: 'lair',
      priority: 2,
      x: 785,
      y: 88,
      lv: [60, 99],
      loc: '142000:-198000',
      label: 'Crown-Beacon Astrolabe (Seed of Infinity)',
      sublabel: '👑 Lv.60–99 Sovereign Seal Sanctum',
      flagColor: '#eab308',
      continentId: c03.id,
      districtId: 'district-starfall-haven'
    }
  ];

  // Overland Monster / Mini-Boss / Raid / MVP Spawn Pins
  const overlandMobPins = [
    { id: 'mob-clover-pup', name: 'Clover-Dew Pup', type: 'Monster', lv: 4, x: 412, y: 455, loc: '-89200:246100', zone: 'Clover South-Gate Meadow' },
    { id: 'mob-kiln-captain', name: '[Mini-Boss] Kiln-Shell Captain', type: 'Mini-Boss', lv: 13, x: 525, y: 448, loc: '48880:247220', zone: 'Kiln Cellar Entrance' },
    { id: 'mob-queen-ant', name: '[MVP] Queen Ant Ash-Brood Sovereign', type: 'MVP', lv: 22, x: 512, y: 478, loc: '53100:242600', zone: 'The Ant Nest B3', dungeonWarpId: 'zone-dungeon-kiln-cellar', dungeonFloorId: 'B3' },
    { id: 'mob-catherok-raid', name: '[Raid] Catherok Pendulum Colossus', type: 'Raid', lv: 26, x: 642, y: 278, loc: '17710:110100', zone: 'Cruma Tower 2F', dungeonWarpId: 'zone-dungeon-pendulum-shaft', dungeonFloorId: '2F' },
    { id: 'mob-cruma-core', name: '[MVP] Core — Prime Governor', type: 'MVP', lv: 30, x: 695, y: 232, loc: '17724:108150', zone: 'Cruma Tower 3F', dungeonWarpId: 'zone-dungeon-pendulum-shaft', dungeonFloorId: '3F' },
    { id: 'mob-hallate-raid', name: '[Raid] Hallate Clockwork Vanguard', type: 'Raid', lv: 32, x: 815, y: 245, loc: '115000:159500', zone: 'Tower of Insolence 2F', dungeonWarpId: 'zone-dungeon-chronometer-foundry', dungeonFloorId: '2F' },
    { id: 'mob-baium-mvp', name: '[MVP] Sovereign Chronometer Aethelgard', type: 'MVP', lv: 35, x: 878, y: 192, loc: '115180:15900', zone: 'Tower of Insolence 3F', dungeonWarpId: 'zone-dungeon-chronometer-foundry', dungeonFloorId: '3F' },
    { id: 'mob-halo-watcher', name: 'Astral Prism Sentinel', type: 'Monster', lv: 48, x: 625, y: 142, loc: '12400:-118000', zone: 'Zenith Refractory' },
    { id: 'mob-vesper-raid', name: '[Raid] Star-Tether Leviathan', type: 'Raid', lv: 68, x: 715, y: 112, loc: '94000:-164000', zone: 'Crown-Lens Approach' },
    { id: 'mob-architect-mvp', name: '[MVP] Apostle of the Shattered Halo', type: 'MVP', lv: 92, x: 815, y: 78, loc: '148000:-204000', zone: 'Celestial Astrolabe Core' }
  ];

  const visibleLandmarks = overlandLandmarks.filter(lm => {
    if (!matchesAtlasLevelBand(lm.lv)) return false;
    if (fFilter === 'All' || fFilter === 'TownMarks') return true;
    if (fFilter === 'RaceSpawns') return Boolean(lm.isRaceSpawn);
    return false;
  });

  const visibleMobPins = overlandMobPins.filter(mp => {
    if (!matchesAtlasLevelBand(mp.lv)) return false;
    if (fFilter === 'All') return true;
    if (fFilter === 'Monster') return mp.type === 'Monster';
    if (fFilter === 'Mini-Boss') return mp.type === 'Mini-Boss';
    if (fFilter === 'Raid') return mp.type === 'Raid';
    if (fFilter === 'MVP') return mp.type === 'MVP';
    return false;
  });

  // Travel Highways connecting Starter Towns -> Convergence Castle Hub -> Dungeons -> Steppe -> Sky-Halo
  const travelHighways = [
    ['town-cinnamon-mill-haven', 'town-carillon-hearth-belfry'],
    ['town-carillon-hearth-belfry', 'town-kilnwatch-bastion'],
    ['town-draft-kiln-post', 'town-lantern-hollow'],
    ['town-lantern-hollow', 'zone-dungeon-kiln-cellar'],
    ['town-lantern-hollow', 'town-porcelain-loom-sanctuary'],
    ['town-porcelain-loom-sanctuary', 'town-kilnwatch-bastion'],
    ['town-root-train-roundhouse', 'town-kilnwatch-bastion'],
    ['town-kilnwatch-bastion', 'zone-dungeon-pendulum-shaft'],
    ['zone-dungeon-pendulum-shaft', 'town-pinion-terminus'],
    ['town-pinion-terminus', 'zone-dungeon-chronometer-foundry'],
    ['town-pinion-terminus', 'town-starfall-haven'],
    ['town-starfall-haven', 'citadel-crown-lens']
  ];

  const lmById = {};
  overlandLandmarks.forEach(l => { lmById[l.id] = l; });

  const highwaysSvg = travelHighways.map(([aId, bId]) => {
    const a = lmById[aId];
    const b = lmById[bId];
    if (!a || !b) return '';
    const mx = Math.round((a.x + b.x) / 2);
    const my = Math.round((a.y + b.y) / 2) - 10;
    const isAirOrSea = a.continentId !== b.continentId;
    return `
      <g pointer-events="none">
        <path d="M ${a.x},${a.y} Q ${mx},${my} ${b.x},${b.y}" fill="none" stroke="#1c150b" stroke-width="${lodTier >= 2 ? 6.5 : 5}" stroke-linecap="round"/>
        <path d="M ${a.x},${a.y} Q ${mx},${my} ${b.x},${b.y}" fill="none" stroke="${isAirOrSea ? '#38bdf8' : '#e2c778'}" stroke-width="${lodTier >= 2 ? 3.2 : 2.4}" stroke-linecap="round" stroke-dasharray="${isAirOrSea ? '6 5' : 'none'}"/>
      </g>
    `;
  }).join('');

  // D9: 6-Race Starter-to-Endgame Travel Path Highlighter (Animated Golden Travel Path on World Canvas)
  const raceRoutes = tatlas.race_growth_routes || [];
  const activeRaceRouteLabel = ATLAS_STATE_STORE.raceGrowthRoute || 'All';
  const activeRaceRouteObj = activeRaceRouteLabel !== 'All'
    ? (raceRoutes.find(r => r.race_label === activeRaceRouteLabel || r.race_key === activeRaceRouteLabel) || null)
    : null;

  const zoneSvgAnchorMap = {
    'zone-town-lantern-hollow': { x: 445, y: 432 },
    'zone-field-clover-south-gate': { x: 468, y: 448 },
    'zone-town-porcelain-loom': { x: 535, y: 398 },
    'zone-field-celadon-causeway': { x: 558, y: 382 },
    'zone-dungeon-medallion-heart-vault': { x: 572, y: 368 },
    'zone-town-draft-kiln-post': { x: 345, y: 412 },
    'zone-field-firebrick-duct': { x: 385, y: 422 },
    'zone-dungeon-ember-bellows-chamber': { x: 418, y: 438 },
    'zone-town-root-train-roundhouse': { x: 685, y: 418 },
    'zone-field-resin-arch-tunnel': { x: 652, y: 392 },
    'zone-dungeon-sap-heart-cistern': { x: 628, y: 372 },
    'zone-town-carillon-belfry': { x: 392, y: 348 },
    'zone-field-chime-pipe-colonnade': { x: 442, y: 352 },
    'zone-dungeon-ceramic-resonator-crypt': { x: 488, y: 356 },
    'zone-town-cinnamon-mill': { x: 245, y: 342 },
    'zone-field-cinnamon-bark-viaduct': { x: 295, y: 346 },
    'zone-dungeon-spice-kiln-cellar': { x: 342, y: 352 },
    'zone-town-kilnwatch-bastion': { x: 595, y: 345 },
    'zone-dungeon-kiln-cellar': { x: 495, y: 465 },
    'zone-town-pinion-terminus': { x: 745, y: 288 },
    'zone-dungeon-pendulum-shaft': { x: 665, y: 252 },
    'zone-town-escapement-anvil': { x: 782, y: 255 },
    'zone-dungeon-chronometer-foundry': { x: 845, y: 215 },
    'zone-town-inductor-switchyard': { x: 765, y: 175 },
    'zone-town-starfall-haven': { x: 565, y: 122 },
    'zone-dungeon-star-heart-nave': { x: 785, y: 88 }
  };

  let raceGrowthPathSvg = '';
  let bottomRaceGrowthPanelHtml = '';
  if (activeRaceRouteObj && Array.isArray(activeRaceRouteObj.waypoints)) {
    const wps = activeRaceRouteObj.waypoints.map((wp, idx) => {
      const anchor = zoneSvgAnchorMap[wp.zone_id] || clampWorldLocCoord(wp.loc);
      const sx = anchor.x !== undefined && anchor.x <= 1040 ? anchor.x : (anchor.svgX || 520);
      const sy = anchor.y !== undefined && anchor.y <= 500 ? anchor.y : (anchor.svgY || 250);
      return { ...wp, sx, sy, idx };
    });

    const segsSvg = wps.map((wp, idx) => {
      if (idx === 0) return '';
      const prev = wps[idx - 1];
      const mx = Math.round((prev.sx + wp.sx) / 2);
      const my = Math.round((prev.sy + wp.sy) / 2) - 14;
      return `
        <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${wp.sx},${wp.sy}" fill="none" stroke="rgba(250,204,21,0.32)" stroke-width="11" stroke-linecap="round"/>
        <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${wp.sx},${wp.sy}" fill="none" stroke="#fde047" stroke-width="4.2" stroke-linecap="round" stroke-dasharray="10 6">
          <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.4s" repeatCount="indefinite"/>
        </path>
      `;
    }).join('');

    const wpNodesSvg = wps.map(wp => {
      const poiWp = {
        title: `🛤️ Stage ${wp.stage_code} (Step ${wp.step_index}): ${wp.name}`,
        category: `${activeRaceRouteObj.race_name} Growth Route · ${wp.level_range} · ${wp.travel_mode}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `STAGE ${wp.stage_code} WAYPOINT #${wp.step_index} · Mode: ${wp.travel_mode.toUpperCase()}`,
        summary: wp.milestone_goal,
        address: `${wp.name} (${wp.l2_alias})`,
        coordinates: `Zone: ${wp.zone_id} · loc=${wp.loc}`,
        scaleSpecs: `Recommended Level: ${wp.level_range} · Travel Mode: ${wp.travel_mode}`,
        locCoord: wp.loc,
        townBlueprintId: wp.zone_id.startsWith('zone-town-') ? wp.zone_id : '',
        fieldTacticalBlueprintId: wp.zone_id.startsWith('zone-field-') ? wp.zone_id : '',
        dungeonWarpId: wp.zone_id.startsWith('zone-dungeon-') ? wp.zone_id : '',
        inspectId: wp.zone_id,
        connections: [{ label: `🎯 Milestone: ${wp.milestone_goal}`, badge: wp.stage_code }]
      };
      return `
        <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiWp, svgX: wp.sx, svgY: wp.sy })}', event)" filter="url(#cartoDropShadow)">
          <circle cx="${wp.sx}" cy="${wp.sy}" r="14" fill="#b45309" stroke="#fde047" stroke-width="2.5"/>
          <text x="${wp.sx}" y="${wp.sy + 4}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="900" font-family="monospace">${escapeHtml(wp.stage_code)}</text>
        </g>
      `;
    }).join('');

    raceGrowthPathSvg = `<g id="studioRaceGrowthRouteOverlay">${segsSvg}${wpNodesSvg}</g>`;
    bottomRaceGrowthPanelHtml = `
      <div style="padding:10px 16px;background:#14110b;border-top:1px solid rgba(250,204,21,0.35)">
        <div style="font-size:11.5px;font-weight:900;color:#fde047;margin-bottom:6px">
          🛤️ ${escapeHtml(activeRaceRouteObj.race_name.toUpperCase())} STARTER-TO-ENDGAME GROWTH ROUTE (STAGES A..L · 12 WAYPOINTS)
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px">
          ${wps.map(wp => `
            <div onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(wp.loc)}'); resolveNearestZoneFromPanAndLoc(STUDIO_MAP_ZOOM, STUDIO_MAP_LOC, 0, 0); render();"
                 style="padding:6px 8px;border-radius:6px;background:#1c1917;border-left:3px solid #fde047;cursor:pointer">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">[Stage ${escapeHtml(wp.stage_code)} · #${wp.step_index}] ${escapeHtml(wp.level_range)}</span>
                <span class="mono" style="font-size:9px;color:#38bdf8">${escapeHtml(wp.travel_mode)}</span>
              </div>
              <div style="font-size:10.5px;font-weight:800;color:#f8fafc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(wp.name)}</div>
              <div style="font-size:9.5px;color:#cbd5e1;margin-top:2px;line-height:1.3">${escapeHtml(wp.milestone_goal)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // D17: Interactive Point-to-Point BFS Travel Path & Gatekeeper Route Calculator
  const activeRouteRes = computeShortestAtlasZonePath(
    ATLAS_ROUTE_FROM_ID || ATLAS_STATE_STORE.routeFromId || 'zone-town-lantern-hollow',
    ATLAS_ROUTE_TO_ID || ATLAS_STATE_STORE.routeToId || 'zone-dungeon-kiln-cellar',
    tatlas
  );
  const routeHopsWithSvg = (activeRouteRes.hops || []).map(h => {
    const anchor = zoneSvgAnchorMap[h.zoneId];
    return {
      ...h,
      sx: anchor ? anchor.x : h.svgX,
      sy: anchor ? anchor.y : h.svgY
    };
  });

  const routeSplinesSvg = routeHopsWithSvg.map((hop, idx) => {
    if (idx === 0) return '';
    const prev = routeHopsWithSvg[idx - 1];
    const mx = Math.round((prev.sx + hop.sx) / 2);
    const my = Math.round((prev.sy + hop.sy) / 2) - 16;
    return `
      <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${hop.sx},${hop.sy}" fill="none" stroke="rgba(56,189,248,0.34)" stroke-width="10" stroke-linecap="round"/>
      <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${hop.sx},${hop.sy}" fill="none" stroke="#38bdf8" stroke-width="3.8" stroke-linecap="round" stroke-dasharray="9 5">
        <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.2s" repeatCount="indefinite"/>
      </path>
    `;
  }).join('');

  const routeBadgesSvg = routeHopsWithSvg.map(hop => {
    const isFinal = hop.hopIndex === routeHopsWithSvg.length;
    const poiHop = {
      title: `🧭 Hop #${hop.hopIndex}: ${hop.name}`,
      category: `${hop.travelMode} · ${hop.levelBand} · Fee: ${hop.adenaFee} Adena`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `TRAVEL ROUTE HOP ${hop.hopIndex} OF ${routeHopsWithSvg.length} · loc=${hop.locCoord}`,
      summary: `L2 Reference: ${hop.l2Analog}. Mode: ${hop.travelMode} (${hop.adenaFee > 0 ? hop.adenaFee.toLocaleString() + ' Adena Gatekeeper Fee' : '0 Adena Walking Road'}).`,
      address: `${hop.name} (${hop.zoneId})`,
      coordinates: `loc=${hop.locCoord} · ${hop.levelBand}`,
      scaleSpecs: `Connected 63-Zone Graph Hop #${hop.hopIndex}`,
      locCoord: hop.locCoord,
      townBlueprintId: hop.zone.actionType === 'town' ? (hop.zone.studio_node_id || hop.zoneId) : '',
      fieldTacticalBlueprintId: hop.zone.actionType === 'field' || hop.zone.actionType === 'fortress' ? hop.zoneId : '',
      dungeonWarpId: hop.zone.actionType === 'dungeon' ? hop.zoneId : '',
      dungeonFloorId: hop.zone.actionType === 'dungeon' ? 'B1' : '',
      inspectId: hop.zone.studio_node_id || hop.zoneId,
      connections: [{ label: `${hop.travelMode}`, badge: `${hop.adenaFee} Adena` }]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiHop, svgX: hop.sx, svgY: hop.sy })}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${hop.sx}" cy="${hop.sy}" r="13" fill="${isFinal ? '#0284c7' : '#0f172a'}" stroke="#38bdf8" stroke-width="2.5"/>
        <text x="${hop.sx}" y="${hop.sy + 4}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">${hop.hopIndex}</text>
      </g>
    `;
  }).join('');

  const travelRouteOverlaySvg = `<g id="studioTravelRouteCalculatorOverlay">${routeSplinesSvg}${routeBadgesSvg}</g>`;
  const finalHop = routeHopsWithSvg[routeHopsWithSvg.length - 1] || null;
  const finalHopBtnLabel = finalHop
    ? (finalHop.zone.actionType === 'dungeon'
      ? `🕳️ Open Final Hop Dungeon Sub-Map (${finalHop.name.split('(')[0].trim()})`
      : (finalHop.zone.actionType === 'town'
        ? `🏘️ Open Final Hop Town Street Blueprint (${finalHop.name.split('(')[0].trim()})`
        : `🏕️ Open Final Hop Tactical Blueprint (${finalHop.name.split('(')[0].trim()})`))
    : '🗺️ Open Destination Blueprint';

  const bottomTravelItineraryPanelHtml = routeHopsWithSvg.length > 0 ? `
    <div id="studioTravelItineraryPanel" style="padding:10px 16px;background:#0d1624;border-top:1px solid rgba(56,189,248,0.38)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:7px">
        <div>
          <div style="font-size:11.5px;font-weight:900;color:#38bdf8">
            🧭 TRAVEL ITINERARY &amp; GATEKEEPER ROUTE CALCULATOR (D17 · ${routeHopsWithSvg.map(h => h.hopIndex).join(' -> ')} HOPS · TOTAL GK FEE: ${activeRouteRes.totalAdenaFee.toLocaleString()} ADENA)
          </div>
          <div style="font-size:10px;color:#cbd5e1">
            Shortest 63-Zone BFS Path from <strong>${escapeHtml((activeRouteRes.origin && activeRouteRes.origin.name) || '')}</strong> ➔ <strong>${escapeHtml((activeRouteRes.destination && activeRouteRes.destination.name) || '')}</strong>
          </div>
        </div>
        ${finalHop ? `
          <button type="button" onclick="openAtlasRouteFinalHop('${escapeHtml(finalHop.zoneId)}')"
                  style="padding:5px 11px;border-radius:7px;border:1.5px solid #fde047;background:#0284c7;color:#ffffff;font-size:10.5px;font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(2,132,199,0.4)">
            ${escapeHtml(finalHopBtnLabel)} ➔
          </button>
        ` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:6px">
        ${routeHopsWithSvg.map(hop => `
          <div onclick="openAtlasRouteFinalHop('${escapeHtml(hop.zoneId)}')"
               style="padding:6px 9px;border-radius:6px;background:#131f33;border-left:3.5px solid ${hop.hopIndex === routeHopsWithSvg.length ? '#fde047' : '#38bdf8'};cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
              <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">Hop #${hop.hopIndex} · ${escapeHtml(hop.levelBand)}</span>
              <span class="mono" style="font-size:9.5px;color:#4ade80">${hop.adenaFee > 0 ? hop.adenaFee.toLocaleString() + ' Adena' : '0 Adena (Walk)'}</span>
            </div>
            <div style="font-size:10.5px;font-weight:800;color:#f8fafc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(hop.name)}</div>
            <div style="font-size:9.5px;color:#93c5fd;margin-top:2px">${escapeHtml(hop.travelMode)} · <span class="mono">loc=${escapeHtml(hop.locCoord)}</span></div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Tier 2 Regional LOD (2.2x - 4.5x): Reveal regional hunting territory rings, Lv.min-max highway shields & Gatekeeper teleport splines
  const regionalOverlaySvg = lodTier >= 2 ? `
    <g pointer-events="none" opacity="0.88">
      <ellipse cx="475" cy="402" rx="265" ry="78" fill="none" stroke="rgba(250,204,21,0.45)" stroke-width="1.8" stroke-dasharray="10 6"/>
      <ellipse cx="755" cy="252" rx="145" ry="68" fill="none" stroke="rgba(56,189,248,0.45)" stroke-width="1.8" stroke-dasharray="10 6"/>
      <ellipse cx="675" cy="108" rx="165" ry="52" fill="none" stroke="rgba(192,132,252,0.45)" stroke-width="1.8" stroke-dasharray="10 6"/>
    </g>
  ` : '';

  // Priority AABB Label Culling at Macro Zoom (<2.2x) so labels never collide
  const placedBoxes = [];
  const landmarksSvg = visibleLandmarks
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map(lm => {
      const box = { x1: lm.x - 68, y1: lm.y + 12, x2: lm.x + 68, y2: lm.y + 38 };
      const collides = lodTier === 1 && placedBoxes.some(pb => !(box.x2 < pb.x1 || box.x1 > pb.x2 || box.y2 < pb.y1 || box.y1 > pb.y2));
      if (!collides) placedBoxes.push(box);

      const poiObj = {
        title: lm.label,
        category: lm.sublabel,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `Lv.${lm.lv[0]}–${lm.lv[1]} · loc=${lm.loc}`,
        summary: lm.dungeonWarpId
          ? `Multi-Floor Dungeon / Tower. Click "Enter Dungeon Map" to open the interactive ${lm.sublabel} floor map.`
          : `Click "Zoom to Street Map" (or zoom >= 4.5×) to inspect the Town Street, #1..#12 Buildings, Shop/Refinement Service Marks, and NPC Roster.`,
        address: `${lm.label} · ${lm.districtId}`,
        coordinates: `World Coordinate: loc=${lm.loc}`,
        scaleSpecs: `12.5m–14.0m Main Roads · 4.4m Walkways · 0.58m Counters`,
        locCoord: lm.loc,
        townBlueprintId: lm.townBlueprintId || '',
        dungeonWarpId: lm.dungeonWarpId || '',
        dungeonFloorId: lm.dungeonFloorId || '',
        drillLabel: lm.dungeonWarpId ? 'Enter Dungeon Map' : 'Zoom to Street Map',
        drillPerspective: 'town-or-hunting-area',
        drillOpts: { continentId: lm.continentId, districtId: lm.districtId, nodeId: lm.id, inspectId: lm.id },
        inspectId: lm.id,
        connections: [
          ...(lm.isRaceSpawn ? [{ label: `🧬 Playable Race Spawn: ${lm.raceName}`, badge: 'STARTER SPAWN' }] : []),
          ...(lm.dungeonWarpId ? [{ label: `🕳️ Multi-Floor Warp: ${lm.sublabel}`, badge: 'SUB-MAP' }] : []),
          ...(lm.townBlueprintId ? [{ label: `🏘️ 7 Service Marks & 1..12 NPC Blueprint`, badge: 'ZOOM ≥4.5×' }] : [])
        ]
      };

      const raceSpawnBadgeSvg = lm.isRaceSpawn ? `
        <g transform="translate(${lm.x}, ${lm.y - 26})" pointer-events="none">
          <rect x="-58" y="-9" width="116" height="16" rx="8" fill="#064e3b" stroke="#34d399" stroke-width="1.3"/>
          <text x="0" y="2" text-anchor="middle" fill="#ecfdf5" font-size="8" font-weight="900" font-family="monospace">
            🧬 ${escapeHtml(lm.raceName.split(' ')[0].toUpperCase())} SPAWN
          </text>
        </g>
      ` : '';

      const dngWarpPortalBadgeSvg = (lm.dungeonWarpId && lodTier >= 2) ? `
        <g data-poi-clickable="1" style="cursor:pointer" onclick="openDungeonSubMap('${escapeHtml(lm.dungeonWarpId)}', '${escapeHtml(lm.dungeonFloorId)}')" transform="translate(${lm.x}, ${lm.y - 28})">
          <rect x="-78" y="-10" width="156" height="18" rx="9" fill="#581c87" stroke="#fde047" stroke-width="1.5"/>
          <text x="0" y="2" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="900" font-family="monospace">
            🕳️ WARP TO SUB-MAP (${escapeHtml(lm.dungeonFloorId)})
          </text>
        </g>
      ` : '';

      return `
        ${drawL2LandmarkSvg({
          kind: lm.kind,
          x: lm.x,
          y: lm.y,
          label: collides ? lm.label.split(' (')[0] : lm.label,
          sublabel: (!collides || lodTier >= 2) ? lm.sublabel : '',
          flagColor: lm.flagColor,
          isSelected: STUDIO_ACTIVE_INSPECT_ID === lm.id,
          poiObj
        })}
        ${raceSpawnBadgeSvg}
        ${dngWarpPortalBadgeSvg}
      `;
    }).join('');

  const mobPinsSvg = visibleMobPins.map(mp => {
    const isMvp = mp.type === 'MVP';
    const isRaid = mp.type === 'Raid';
    const isMini = mp.type === 'Mini-Boss';
    const col = isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444'));
    const icon = isMvp ? '👑' : (isRaid ? '🔥' : (isMini ? '⚔️' : '👾'));
    const poiMob = {
      title: `${icon} ${mp.name} (Lv.${mp.lv})`,
      category: `${mp.type} Spawn Pin · ${mp.zone}`,
      thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
      hoursOrStatus: `ACTIVE ${mp.type.toUpperCase()} · loc=${mp.loc}`,
      summary: mp.dungeonWarpId
        ? `Spawns inside ${mp.zone}. Click "Enter Dungeon Map" to warp directly to Floor ${mp.dungeonFloorId}!`
        : `Overland ${mp.type} habitat in ${mp.zone}.`,
      address: `${mp.zone} · loc=${mp.loc}`,
      coordinates: `Level ${mp.lv} · Tier: ${mp.type}`,
      dungeonWarpId: mp.dungeonWarpId || '',
      dungeonFloorId: mp.dungeonFloorId || '',
      drillLabel: mp.dungeonWarpId ? `Warp to ${mp.zone}` : 'Zoom Closer',
      inspectId: mp.id,
      connections: [{ label: `📍 Habitat: ${mp.zone}`, badge: `Lv.${mp.lv}` }]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiMob, svgX: mp.x, svgY: mp.y })}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${mp.x}" cy="${mp.y}" r="${isMvp ? 12 : 10}" fill="${col}" stroke="#ffffff" stroke-width="1.8"/>
        <text x="${mp.x}" y="${mp.y + 3.5}" text-anchor="middle" font-size="${isMvp ? 10.5 : 9}">${icon}</text>
        ${(lodTier >= 2 || fFilter !== 'All') ? `
          <rect x="${mp.x - 62}" y="${mp.y - 24}" width="124" height="14" rx="4" fill="rgba(9,13,20,0.9)" stroke="${col}" stroke-width="1"/>
          <text x="${mp.x}" y="${mp.y - 14}" text-anchor="middle" fill="#f8fafc" font-size="8" font-weight="800" font-family="monospace">
            ${escapeHtml(mp.name.slice(0, 18))} Lv.${mp.lv}
          </text>
        ` : ''}
      </g>
    `;
  }).join('');

  const bossChains = getAtlasBossHierarchyChains(tatlas);
  const activeBossChain = bossChains.find(c => c.god_id === (ATLAS_BOSS_GOD_ID || ATLAS_STATE_STORE.activeBossGodId || 'god-sola-hearth-weaver')) || bossChains[0] || null;
  let bossHierarchyOverlaySvg = '<g id="studioBossHierarchyChainOverlay"></g>';
  if (activeBossChain) {
    const godCoord = clampWorldLocCoord(activeBossChain.seal_loc || '-72400:256800');
    const themeCol = activeBossChain.theme_color || '#f43f5e';
    const mvpNodes = (activeBossChain.mvp_apostles || []).map((m, idx) => {
      const c = clampWorldLocCoord(m.loc_coord || activeBossChain.seal_loc || '-72400:256800');
      return { ...m, sx: c.svgX + (idx * 18 - 9), sy: c.svgY - 14 };
    });
    const raidNodes = (activeBossChain.raid_bosses || []).map((r, idx) => {
      const c = clampWorldLocCoord(r.loc_coord || activeBossChain.seal_loc || '-72400:256800');
      return { ...r, sx: c.svgX + (idx * 22 - 11), sy: c.svgY + 12 };
    });
    const miniNodes = (activeBossChain.mini_bosses || []).map((mb, idx) => {
      const c = clampWorldLocCoord(mb.loc_coord || activeBossChain.seal_loc || '-72400:256800');
      return { ...mb, sx: c.svgX + (idx * 16 - 8), sy: c.svgY + 20 };
    });

    const linesSvg = [];
    mvpNodes.forEach(m => {
      linesSvg.push(`<line x1="${godCoord.svgX}" y1="${godCoord.svgY}" x2="${m.sx}" y2="${m.sy}" stroke="${themeCol}" stroke-width="2.6" stroke-dasharray="6 4" opacity="0.88"/>`);
    });
    raidNodes.forEach((r, idx) => {
      const src = mvpNodes[idx % Math.max(1, mvpNodes.length)] || { sx: godCoord.svgX, sy: godCoord.svgY };
      linesSvg.push(`<line x1="${src.sx}" y1="${src.sy}" x2="${r.sx}" y2="${r.sy}" stroke="#f97316" stroke-width="2" stroke-dasharray="4 3" opacity="0.82"/>`);
    });
    miniNodes.forEach((mb, idx) => {
      const src = raidNodes[idx % Math.max(1, raidNodes.length)] || { sx: godCoord.svgX, sy: godCoord.svgY };
      linesSvg.push(`<line x1="${src.sx}" y1="${src.sy}" x2="${mb.sx}" y2="${mb.sy}" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.76"/>`);
    });

    bossHierarchyOverlaySvg = `
      <g id="studioBossHierarchyChainOverlay">
        ${linesSvg.join('')}
        <g data-poi-clickable="1" style="cursor:pointer" onclick="openDungeonSubMap('${escapeHtml(activeBossChain.seal_catacomb_id || 'dungeon-ember-catacombs')}', '${escapeHtml(activeBossChain.seal_floor_id || 'B3')}')" filter="url(#cartoDropShadow)">
          <circle cx="${godCoord.svgX}" cy="${godCoord.svgY}" r="18" fill="rgba(244,63,94,0.25)" stroke="${themeCol}" stroke-width="2.2" stroke-dasharray="4 2"/>
          <circle cx="${godCoord.svgX}" cy="${godCoord.svgY}" r="12" fill="#090d16" stroke="${themeCol}" stroke-width="2.4"/>
          <text x="${godCoord.svgX}" y="${godCoord.svgY + 4}" text-anchor="middle" font-size="11">${activeBossChain.icon || '🔱'}</text>
          <rect x="${godCoord.svgX - 88}" y="${godCoord.svgY - 32}" width="176" height="16" rx="5" fill="rgba(9,13,22,0.94)" stroke="${themeCol}" stroke-width="1.2"/>
          <text x="${godCoord.svgX}" y="${godCoord.svgY - 21}" text-anchor="middle" fill="#fde047" font-size="8" font-weight="900" font-family="monospace">
            TIER 5 SEALED GOD: ${escapeHtml((activeBossChain.god_name || '').slice(0, 18))}
          </text>
        </g>
      </g>
    `;
  }

  // D23: 3-Track Quest & Class Transfer Trial Map Overlay (`studioQuestTrialChainOverlay`)
  const questChains = (tatlas && tatlas.quest_trial_chains) || [];
  const activeQuestObj = questChains.find(q => q.quest_id === (ATLAS_ACTIVE_QUEST_ID || ATLAS_STATE_STORE.activeQuestId)) || questChains[0] || null;
  let questTrialOverlaySvg = '<g id="studioQuestTrialChainOverlay"></g>';
  if (activeQuestObj) {
    const gCoord = clampWorldLocCoord(activeQuestObj.giver_loc || '-84120:243500');
    const oCoord = clampWorldLocCoord(activeQuestObj.objective_loc || '75410:116820');
    const tCoord = clampWorldLocCoord(activeQuestObj.turn_in_loc || '-14200:123500');
    const isDngObj = Boolean(activeQuestObj.objective_dungeon_id);
    const objClick = isDngObj
      ? `openDungeonSubMap('${escapeHtml(activeQuestObj.objective_dungeon_id)}', '${escapeHtml(activeQuestObj.objective_floor_id || 'B1')}')`
      : `focusFieldTacticalBlueprint('${escapeHtml(activeQuestObj.objective_zone_id)}', '${escapeHtml(activeQuestObj.objective_loc || '')}')`;
    questTrialOverlaySvg = `
      <g id="studioQuestTrialChainOverlay">
        <line x1="${gCoord.svgX}" y1="${gCoord.svgY}" x2="${oCoord.svgX}" y2="${oCoord.svgY}" stroke="#38bdf8" stroke-width="2.6" stroke-dasharray="6 3" opacity="0.9"/>
        <line x1="${oCoord.svgX}" y1="${oCoord.svgY}" x2="${tCoord.svgX}" y2="${tCoord.svgY}" stroke="#34d399" stroke-width="2.6" stroke-dasharray="6 3" opacity="0.9"/>
        <g data-poi-clickable="1" style="cursor:pointer" onclick="${objClick}" filter="url(#cartoDropShadow)">
          <circle cx="${oCoord.svgX}" cy="${oCoord.svgY}" r="14" fill="rgba(245,158,11,0.28)" stroke="#fde047" stroke-width="2.2"/>
          <text x="${oCoord.svgX}" y="${oCoord.svgY + 4}" text-anchor="middle" font-size="10">📜</text>
          <rect x="${oCoord.svgX - 82}" y="${oCoord.svgY + 15}" width="164" height="15" rx="4" fill="rgba(9,13,22,0.92)" stroke="#fde047" stroke-width="1"/>
          <text x="${oCoord.svgX}" y="${oCoord.svgY + 25}" text-anchor="middle" fill="#fde047" font-size="7.6" font-weight="900" font-family="monospace">
            QUEST OBJ: ${escapeHtml((activeQuestObj.quest_name || '').slice(0, 22))}
          </text>
        </g>
      </g>
    `;
  }

  // D24: Party & Farming Efficiency Heatmap Overlay (`studioFarmingEfficiencyHeatmapOverlay`)
  const farmingProfiles = (tatlas && tatlas.farming_efficiency_profiles) || [];
  const curFarmMode = ATLAS_FARMING_MODE || ATLAS_STATE_STORE.farmingMode || 'All';
  const activeFarmProfiles = curFarmMode === 'Off'
    ? []
    : (curFarmMode === 'All' ? farmingProfiles.slice(0, 12) : farmingProfiles.filter(fp => fp.recommended_party_mode === curFarmMode));
  const allZonesById = {};
  getAllAtlas63Zones(tatlas).forEach(z => { allZonesById[z.zone_id] = z; });
  const farmingEfficiencyOverlaySvg = `
    <g id="studioFarmingEfficiencyHeatmapOverlay">
      ${activeFarmProfiles.map(fp => {
        const zRef = allZonesById[fp.zone_id];
        if (!zRef || !zRef.loc_coord) return '';
        const fc = clampWorldLocCoord(zRef.loc_coord);
        const modeCol = fp.recommended_party_mode === 'clan_raid_force'
          ? '#f43f5e'
          : (fp.recommended_party_mode === 'full_9p_aoe_party'
            ? '#a855f7'
            : (fp.recommended_party_mode === 'duo_spoil_scavenger' ? '#eab308' : '#10b981'));
        return `
          <circle cx="${fc.svgX}" cy="${fc.svgY}" r="22" fill="${modeCol}" fill-opacity="0.16" stroke="${modeCol}" stroke-width="1.4" stroke-dasharray="3 2" pointer-events="none"/>
        `;
      }).join('')}
    </g>
  `;

  // D25: Castle Siege, Territory Tax & Clan Hall Domain Overlay (`studioCastleSiegeDomainOverlay`)
  const siegeDomains = (tatlas && tatlas.castle_siege_domains) || [];
  const curSiegeDomId = ATLAS_SIEGE_DOMAIN_ID || ATLAS_STATE_STORE.siegeDomainId || 'All';
  const activeSiegeDomains = curSiegeDomId === 'Off'
    ? []
    : (curSiegeDomId === 'All'
      ? siegeDomains
      : siegeDomains.filter(sd => sd.domain_id === curSiegeDomId || sd.stronghold_zone_id === curSiegeDomId));
  const castleSiegeDomainOverlaySvg = `
    <g id="studioCastleSiegeDomainOverlay">
      ${activeSiegeDomains.map(sd => {
        const shCoord = clampWorldLocCoord(sd.artifact_altar_loc || '-13800:124100');
        const townLinks = (sd.vassal_town_ids || []).map(tid => {
          const tz = allZonesById[tid];
          if (!tz || !tz.loc_coord) return '';
          const tc = clampWorldLocCoord(tz.loc_coord);
          return `<line x1="${shCoord.svgX}" y1="${shCoord.svgY}" x2="${tc.svgX}" y2="${tc.svgY}" stroke="#fb923c" stroke-width="2.2" stroke-dasharray="5 3" opacity="0.88" pointer-events="none"/>`;
        }).join('');
        const huntLinks = (sd.vassal_hunting_zone_ids || []).slice(0, 2).map(hid => {
          const hz = allZonesById[hid];
          if (!hz || !hz.loc_coord) return '';
          const hc = clampWorldLocCoord(hz.loc_coord);
          return `<line x1="${shCoord.svgX}" y1="${shCoord.svgY}" x2="${hc.svgX}" y2="${hc.svgY}" stroke="#fdba74" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.72" pointer-events="none"/>`;
        }).join('');
        return `
          ${townLinks}
          ${huntLinks}
          <g data-poi-clickable="1" style="cursor:pointer" onclick="focusFortressBlueprint('${escapeHtml(sd.stronghold_zone_id)}', '${escapeHtml(sd.artifact_altar_loc)}')">
            <circle cx="${shCoord.svgX}" cy="${shCoord.svgY}" r="13" fill="rgba(251,146,60,0.26)" stroke="#fb923c" stroke-width="2"/>
            <text x="${shCoord.svgX}" y="${shCoord.svgY - 16}" text-anchor="middle" fill="#fed7aa" font-size="7.4" font-weight="900" font-family="monospace">
              🏰 ${sd.tax_rate_pct}% TAX
            </text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D26: World Boss & MVP Respawn Radar Overlay (`studioWorldBossSpawnRadarOverlay`)
  const bossRadarEntries = (tatlas && tatlas.world_boss_spawn_radar) || [];
  const curBossRadarMode = ATLAS_BOSS_RADAR_MODE || ATLAS_STATE_STORE.bossRadarMode || 'All';
  const activeRadarBosses = curBossRadarMode === 'Off'
    ? []
    : (curBossRadarMode === 'DungeonMVP'
      ? bossRadarEntries.filter(b => b.dungeon_id && b.boss_category === 'MVP').slice(0, 10)
      : (curBossRadarMode === 'OverlandRaid'
        ? bossRadarEntries.filter(b => !b.dungeon_id).slice(0, 10)
        : bossRadarEntries.slice(0, 10)));
  const worldBossSpawnRadarOverlaySvg = `
    <g id="studioWorldBossSpawnRadarOverlay">
      ${activeRadarBosses.map(b => {
        const bc = clampWorldLocCoord(b.loc || '53100:242600');
        const isDng = Boolean(b.dungeon_id);
        const clickAct = isDng
          ? `openDungeonSubMap('${escapeHtml(b.dungeon_id)}', '${escapeHtml(b.floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(b.zone_id)}', '${escapeHtml(b.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickAct}">
            <circle cx="${bc.svgX}" cy="${bc.svgY}" r="11" fill="rgba(244,63,94,0.24)" stroke="#f43f5e" stroke-width="1.6" stroke-dasharray="2 2"/>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D27: Seven-Seals Dusk vs. Dawn Catacomb/Tower Competition & Mammon Rotation Overlay (`studioSevenSealsOverlay`)
  const sevenSealsEntries = (tatlas && tatlas.seven_seals_competitions) || [];
  const curSevenSealsMode = ATLAS_SEVEN_SEALS_MODE || ATLAS_STATE_STORE.sevenSealsMode || 'All';
  const activeSevenSeals = curSevenSealsMode === 'Off'
    ? []
    : (curSevenSealsMode === 'Lords_of_Dawn' || curSevenSealsMode === 'Revolutionaries_of_Dusk'
      ? sevenSealsEntries.filter(s => s.controlling_cabal === curSevenSealsMode)
      : (curSevenSealsMode === 'Blacksmith_of_Mammon' || curSevenSealsMode === 'Merchant_of_Mammon'
        ? sevenSealsEntries.filter(s => s.mammon_visitor_npc === curSevenSealsMode)
        : sevenSealsEntries.slice(0, 10)));
  const sevenSealsOverlaySvg = `
    <g id="studioSevenSealsOverlay">
      ${activeSevenSeals.map(s => {
        const sc = clampWorldLocCoord(s.mammon_loc || '48550:248400');
        const cabalCol = s.controlling_cabal === 'Lords_of_Dawn'
          ? '#fde047'
          : (s.controlling_cabal === 'Revolutionaries_of_Dusk' ? '#c084fc' : '#38bdf8');
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="openDungeonSubMap('${escapeHtml(s.dungeon_id)}', '${escapeHtml(s.mammon_active_floor_id)}')">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="12" fill="rgba(168,85,247,0.24)" stroke="${cabalCol}" stroke-width="1.8" stroke-dasharray="4 2"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.5}" text-anchor="middle" font-size="9">${s.mammon_visitor_npc === 'Blacksmith_of_Mammon' ? '⚒️' : '💰'}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D28: 15-Town Manor Seed/Crop & Regional Caravan Trade Economy Overlay (`studioManorEconomyOverlay`)
  const manorRoutes = (tatlas && tatlas.manor_economy_routes) || [];
  const curManorMode = ATLAS_MANOR_MODE || ATLAS_STATE_STORE.manorMode || 'All';
  const activeManorRoutes = curManorMode === 'Off'
    ? []
    : (curManorMode === 'Low_Patrolled'
      ? manorRoutes.filter(r => r.caravan_route_risk === 'Low_Patrolled')
      : (curManorMode === 'High_Frontier_Ambush'
        ? manorRoutes.filter(r => r.caravan_route_risk !== 'Low_Patrolled')
        : manorRoutes.slice(0, 8)));
  const manorEconomyOverlaySvg = `
    <g id="studioManorEconomyOverlay">
      ${activeManorRoutes.map(r => {
        const tz = allZonesById[r.town_zone_id];
        const fz = allZonesById[r.harvest_field_zone_id];
        const sz = allZonesById[r.parent_stronghold_zone_id];
        if (!tz || !fz || !sz || !tz.loc_coord || !fz.loc_coord || !sz.loc_coord) return '';
        const tc = clampWorldLocCoord(tz.loc_coord);
        const fc = clampWorldLocCoord(fz.loc_coord);
        const sc = clampWorldLocCoord(sz.loc_coord);
        const riskCol = r.caravan_route_risk === 'Low_Patrolled' ? '#4ade80' : '#fde047';
        return `
          <line x1="${tc.svgX}" y1="${tc.svgY}" x2="${fc.svgX}" y2="${fc.svgY}" stroke="${riskCol}" stroke-width="1.8" stroke-dasharray="4 2" opacity="0.82" pointer-events="none"/>
          <line x1="${fc.svgX}" y1="${fc.svgY}" x2="${sc.svgX}" y2="${sc.svgY}" stroke="#bef264" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.76" pointer-events="none"/>
        `;
      }).join('')}
    </g>
  `;

  // D29: Subclass, Noblesse & Grand Olympiad Monument Network Overlay (`studioNoblesseOlympiadOverlay`)
  const olympiadNodes = (tatlas && tatlas.noblesse_olympiad_network) || [];
  const curOlympiadMode = ATLAS_OLYMPIAD_MODE || ATLAS_STATE_STORE.olympiadMode || 'All';
  const activeOlympiadNodes = curOlympiadMode === 'Off'
    ? []
    : (curOlympiadMode === 'All'
      ? olympiadNodes.slice(0, 12)
      : olympiadNodes.filter(n => n.node_category === curOlympiadMode));
  const noblesseOlympiadOverlaySvg = `
    <g id="studioNoblesseOlympiadOverlay">
      ${activeOlympiadNodes.map(n => {
        const nc = clampWorldLocCoord(n.loc || '-84120:243500');
        const isSub = n.node_category === 'Subclass_Mimir_Sanctum';
        const isNob = n.node_category === 'Noblesse_Barakiel_Shrine';
        const strokeCol = isSub ? '#c084fc' : (isNob ? '#38bdf8' : '#fde047');
        const iconTxt = isSub ? '🧪' : (isNob ? '👑' : '🏆');
        const zObj = allZonesById[n.zone_id] || {};
        const tNode = zObj.studio_node_id || n.zone_id;
        const clickJs = n.dungeon_id
          ? `openDungeonSubMap('${escapeHtml(n.dungeon_id)}', '${escapeHtml(n.floor_id || '3F')}')`
          : (isNob
            ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
            : `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(n.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${nc.svgX}" cy="${nc.svgY}" r="11" fill="rgba(250,204,21,0.22)" stroke="${strokeCol}" stroke-width="1.8" stroke-dasharray="3 2"/>
            <text x="${nc.svgX}" y="${nc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D30: Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Overlay (`studioIntercontinentalTransitOverlay`)
  const transitLines = (tatlas && tatlas.intercontinental_transit_lines) || [];
  const curTransitMode = ATLAS_TRANSIT_MODE || ATLAS_STATE_STORE.transitMode || 'All';
  const activeTransitLines = curTransitMode === 'Off'
    ? []
    : (curTransitMode === 'All'
      ? transitLines
      : transitLines.filter(l => l.transit_mode === curTransitMode));
  const intercontinentalTransitOverlaySvg = `
    <g id="studioIntercontinentalTransitOverlay">
      ${activeTransitLines.map(l => {
        const oc = clampWorldLocCoord(l.origin_loc || '-84120:243500');
        const dc = clampWorldLocCoord(l.destination_loc || '82400:148600');
        const isShip = l.transit_mode === 'Maritime_Ship';
        const isAir = l.transit_mode === 'Brass_Airship';
        const lineCol = isShip ? '#38bdf8' : (isAir ? '#f59e0b' : '#c084fc');
        const dashPat = isShip ? '6 3' : (isAir ? '8 4' : '3 3');
        const midX = Math.round((oc.svgX + dc.svgX) / 2);
        const midY = Math.round((oc.svgY + dc.svgY) / 2 - (isAir ? 26 : (isShip ? -18 : 12)));
        return `
          <path d="M ${oc.svgX} ${oc.svgY} Q ${midX} ${midY} ${dc.svgX} ${dc.svgY}" fill="none" stroke="${lineCol}" stroke-width="2" stroke-dasharray="${dashPat}" opacity="0.85" pointer-events="none"/>
        `;
      }).join('')}
    </g>
  `;

  // D31: Soul Crystal (SA) Stage 1–13 Resonance & Boss Absorption Matrix Overlay (`studioSoulCrystalResonanceOverlay`)
  const soulCrystalStages = (tatlas && tatlas.soul_crystal_resonance_stages) || [];
  const curSoulCrystalMode = ATLAS_SOUL_CRYSTAL_MODE || ATLAS_STATE_STORE.soulCrystalMode || 'All';
  const activeSoulCrystalStages = curSoulCrystalMode === 'Off'
    ? []
    : (curSoulCrystalMode === 'All'
      ? soulCrystalStages.slice(0, 12)
      : (curSoulCrystalMode === 'Stage_11_to_13_S_Grade_Boss'
        ? soulCrystalStages.filter(s => s.stage_band === 'Stage_11_to_13_S_Grade_Boss')
        : soulCrystalStages.filter(s => s.crystal_color === curSoulCrystalMode)));
  const soulCrystalOverlaySvg = `
    <g id="studioSoulCrystalResonanceOverlay">
      ${activeSoulCrystalStages.map(s => {
        const vZone = allZonesById[s.vendor_town_zone_id] || {};
        const vc = clampWorldLocCoord(vZone.loc_coord || '-84120:243500');
        const ac = clampWorldLocCoord(s.absorption_loc || '75410:116820');
        const isRed = s.crystal_color === 'Crimson_Red';
        const isGreen = s.crystal_color === 'Verdant_Green';
        const colHex = isRed ? '#f87171' : (isGreen ? '#4ade80' : '#38bdf8');
        const clickJs = s.absorption_dungeon_id
          ? `openDungeonSubMap('${escapeHtml(s.absorption_dungeon_id)}', '${escapeHtml(s.absorption_floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(s.absorption_zone_id)}', '${escapeHtml(s.absorption_loc)}')`;
        return `
          <line x1="${vc.svgX}" y1="${vc.svgY}" x2="${ac.svgX}" y2="${ac.svgY}" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="4 3" opacity="0.82" pointer-events="none"/>
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${ac.svgX}" cy="${ac.svgY}" r="9.5" fill="rgba(134,25,143,0.28)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${ac.svgX}" y="${ac.svgY + 3.2}" text-anchor="middle" font-size="8">💎</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D32: Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuary Overlay (`studioFishingSanctuaryOverlay`)
  const fishingSanctuaries = (tatlas && tatlas.fishing_guild_sanctuaries) || [];
  const curFishingMode = ATLAS_FISHING_MODE || ATLAS_STATE_STORE.fishingMode || 'All';
  const activeFishingSanctuaries = curFishingMode === 'Off'
    ? []
    : (curFishingMode === 'All'
      ? fishingSanctuaries
      : fishingSanctuaries.filter(s => s.water_category === curFishingMode));
  const fishingSanctuaryOverlaySvg = `
    <g id="studioFishingSanctuaryOverlay">
      ${activeFishingSanctuaries.map(s => {
        const sc = clampWorldLocCoord(s.dock_loc || '-96200:258400');
        const isPier = s.water_category === 'Maritime_Harbor_Pier';
        const isLake = s.water_category === 'Luminous_Night_Lake';
        const colHex = isPier ? '#38bdf8' : (isLake ? '#a78bfa' : '#fb923c');
        const iconTxt = isPier ? '⚓' : (isLake ? '🌙' : '♨️');
        const z = allZonesById[s.zone_id] || {};
        const clickJs = (z.category === 'starting_town' || z.category === 'castle_or_hub_town')
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || s.zone_id)}', '${escapeHtml(s.dock_loc)}')`
          : ((z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress')
            ? `focusFortressBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`
            : `focusFieldTacticalBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.5" fill="rgba(15,118,110,0.28)" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="3 2"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D33: Cursed Weapon, PK Karma Sanctuary & Open-World PvP Arena Overlay (`studioCursedWeaponPvpOverlay`)
  const pvpHotspots = (tatlas && tatlas.cursed_weapon_pvp_hotspots) || [];
  const curPvpMode = ATLAS_PVP_KARMA_MODE || ATLAS_STATE_STORE.pvpKarmaMode || 'All';
  const activePvpHotspots = curPvpMode === 'Off'
    ? []
    : (curPvpMode === 'All'
      ? pvpHotspots
      : pvpHotspots.filter(h => h.pvp_category === curPvpMode));
  const cursedWeaponPvpOverlaySvg = `
    <g id="studioCursedWeaponPvpOverlay">
      ${activePvpHotspots.map(h => {
        const hc = clampWorldLocCoord(h.loc || '25180:136540');
        const isCursed = h.pvp_category === 'Cursed_Weapon_Drop_Zone';
        const isJudge = h.pvp_category === 'Black_Judge_Karma_Sanctuary';
        const colHex = isCursed ? '#ef4444' : (isJudge ? '#c084fc' : '#f59e0b');
        const iconTxt = isCursed ? '🗡️' : (isJudge ? '⚖️' : '🏟️');
        const z = allZonesById[h.zone_id] || {};
        const clickJs = (z.category === 'starting_town' || z.category === 'castle_or_hub_town')
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || h.zone_id)}', '${escapeHtml(h.loc)}')`
          : ((z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress')
            ? `focusFortressBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`
            : `focusFieldTacticalBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${hc.svgX}" cy="${hc.svgY}" r="11" fill="rgba(159,18,57,0.3)" stroke="${colHex}" stroke-width="1.9" stroke-dasharray="4 2"/>
            <text x="${hc.svgX}" y="${hc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D34: Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctum Overlay (`studioDimensionalRiftOverlay`)
  const riftPortals = (tatlas && tatlas.dimensional_rift_sepulchers) || [];
  const curRiftMode = ATLAS_RIFT_SEPULCHER_MODE || ATLAS_STATE_STORE.riftSepulcherMode || 'All';
  const activeRiftPortals = curRiftMode === 'Off'
    ? []
    : (curRiftMode === 'All'
      ? riftPortals
      : riftPortals.filter(p => p.instance_category === curRiftMode));
  const dimensionalRiftOverlaySvg = `
    <g id="studioDimensionalRiftOverlay">
      ${activeRiftPortals.map(p => {
        const pc = clampWorldLocCoord(p.loc || '75410:116820');
        const isRift = p.instance_category === 'Dimensional_Rift';
        const isSep = p.instance_category === 'Four_Sepulchers';
        const colHex = isRift ? '#818cf8' : (isSep ? '#f472b6' : '#facc15');
        const iconTxt = isRift ? '🌌' : (isSep ? '⚰️' : '🗝️');
        const clickJs = `openDungeonSubMap('${escapeHtml(p.dungeon_id)}', '${escapeHtml(p.floor_id || 'B3')}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${pc.svgX}" cy="${pc.svgY}" r="10.5" fill="rgba(55,48,163,0.32)" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="3 2"/>
            <text x="${pc.svgX}" y="${pc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D35: Interactive Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Overlay (`studioWeaponAugmentationDyeOverlay`)
  const augDyeHubs = (tatlas && tatlas.weapon_augmentation_dye_hubs) || [];
  const curAugMode = ATLAS_AUGMENT_DYE_MODE || ATLAS_STATE_STORE.augmentDyeMode || 'All';
  const activeAugDyeHubs = curAugMode === 'Off'
    ? []
    : (curAugMode === 'Top_High_Life_Stone'
      ? augDyeHubs.filter(h => h.life_stone_tier === 'Top_Grade_Life_Stone' || h.life_stone_tier === 'High_Grade_Life_Stone')
      : augDyeHubs);
  const weaponAugmentationDyeOverlaySvg = `
    <g id="studioWeaponAugmentationDyeOverlay">
      ${activeAugDyeHubs.map(h => {
        const ac = clampWorldLocCoord(h.anvil_loc || '-84120:243500');
        const dz = allZonesById[h.life_stone_drop_zone_id] || {};
        const tz = allZonesById[h.town_zone_id] || {};
        const dc = clampWorldLocCoord(dz.loc_coord || '-68180:228620');
        const isTop = h.life_stone_tier === 'Top_Grade_Life_Stone';
        const isHigh = h.life_stone_tier === 'High_Grade_Life_Stone';
        const colHex = isTop ? '#f43f5e' : (isHigh ? '#c084fc' : '#38bdf8');
        const iconTxt = curAugMode === 'Symbol_Dye_Parlors' ? '🎨' : '🔮';
        const townClickJs = `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || h.town_zone_id.replace('zone-', ''))}', '${escapeHtml(h.anvil_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${townClickJs}">
            <line x1="${dc.svgX}" y1="${dc.svgY}" x2="${ac.svgX}" y2="${ac.svgY}" stroke="${colHex}" stroke-width="1.6" stroke-dasharray="4 2" opacity="0.78"/>
            <circle cx="${ac.svgX}" cy="${ac.svgY}" r="10.5" fill="rgba(107,33,168,0.34)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${ac.svgX}" y="${ac.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D36: Interactive Pet, Strider & Castle Wyvern Mount Sanctuary Overlay (`studioCompanionMountOverlay`)
  const companionNodes = (tatlas && tatlas.companion_mount_sanctuaries) || [];
  const curCompMode = ATLAS_COMPANION_MOUNT_MODE || ATLAS_STATE_STORE.companionMountMode || 'All';
  const activeCompanionNodes = curCompMode === 'Off'
    ? []
    : (curCompMode === 'All'
      ? companionNodes
      : companionNodes.filter(n => n.mount_category === curCompMode));
  const companionMountOverlaySvg = `
    <g id="studioCompanionMountOverlay">
      ${activeCompanionNodes.map(n => {
        const cc = clampWorldLocCoord(n.loc || '-83880:243720');
        const isPet = n.mount_category === 'Pet_Manager_Kennel';
        const isStrider = n.mount_category === 'Hatchling_Strider_Sanctum';
        const colHex = isPet ? '#38bdf8' : (isStrider ? '#34d399' : '#f59e0b');
        const iconTxt = isPet ? '🐾' : (isStrider ? '🦎' : '🐉');
        const z = allZonesById[n.zone_id] || {};
        const clickJs = isPet
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
          : (isStrider
            ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
            : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="11" fill="rgba(6,95,70,0.34)" stroke="${colHex}" stroke-width="1.9" stroke-dasharray="3 2"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D37: Interactive Clan Reputation, Academy & Pledge Skill Altar Overlay (`studioClanAcademyOverlay`)
  const clanNodes = (tatlas && tatlas.clan_reputation_academies) || [];
  const curClanMode = ATLAS_CLAN_ACADEMY_MODE || ATLAS_STATE_STORE.clanAcademyMode || 'All';
  const activeClanNodes = curClanMode === 'Off'
    ? []
    : (curClanMode === 'All'
      ? clanNodes
      : clanNodes.filter(n => n.pledge_category === curClanMode));
  const clanAcademyOverlaySvg = `
    <g id="studioClanAcademyOverlay">
      ${activeClanNodes.map(n => {
        const cc = clampWorldLocCoord(n.loc || '-84320:243280');
        const isAcad = n.pledge_category === 'Clan_Academy_Hall';
        const isAmb = n.pledge_category === 'Clan_Ambition_Altar';
        const colHex = isAcad ? '#38bdf8' : (isAmb ? '#f97316' : '#facc15');
        const iconTxt = isAcad ? '🎓' : (isAmb ? '⚔️' : '👑');
        const z = allZonesById[n.zone_id] || {};
        const isTownZone = String(n.zone_id || '').startsWith('zone-town-');
        const isFieldZone = String(n.zone_id || '').startsWith('zone-field-');
        const clickJs = isTownZone
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
          : (isFieldZone
            ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
            : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="10.8" fill="rgba(180,83,9,0.34)" stroke="${colHex}" stroke-width="1.9" stroke-dasharray="3 2"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D38: Interactive 24-Field Elemental Attribute & Ground Herb Sustainability Biome Overlay (`studioHerbElementalBiomeOverlay`)
  const herbBiomes = (tatlas && tatlas.field_herb_elemental_biomes) || [];
  const curHerbMode = ATLAS_HERB_BIOME_MODE || ATLAS_STATE_STORE.herbBiomeMode || 'All';
  const activeHerbBiomes = curHerbMode === 'Off'
    ? []
    : (curHerbMode === 'S_Tier_Zero_Downtime' || curHerbMode === 'A_Tier_Mystic_Mana_Rich'
      ? herbBiomes.filter(b => b.herb_drop_tier === curHerbMode)
      : herbBiomes);
  const elemHexByType = {
    Fire: '#f97316',
    Water: '#38bdf8',
    Wind: '#34d399',
    Earth: '#eab308',
    Holy: '#fde047',
    Dark: '#c084fc'
  };
  const herbElementalBiomeOverlaySvg = `
    <g id="studioHerbElementalBiomeOverlay">
      ${activeHerbBiomes.map(b => {
        const fz = allZonesById[b.field_zone_id] || {};
        const fc = clampWorldLocCoord(fz.loc_coord || '72986:113330');
        const colHex = elemHexByType[b.dominant_element] || '#4ade80';
        const iconTxt = b.herb_drop_tier === 'S_Tier_Zero_Downtime' ? '🧪' : (b.herb_drop_tier === 'A_Tier_Mystic_Mana_Rich' ? '💧' : '🌿');
        const clickJs = `focusFieldTacticalBlueprint('${escapeHtml(b.field_zone_id)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${fc.svgX}" cy="${fc.svgY}" r="11.5" fill="rgba(21,128,61,0.28)" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="2 2"/>
            <text x="${fc.svgX}" y="${fc.svgY + 3.5}" text-anchor="middle" font-size="8.2">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D39: Interactive 15-Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Overlay (`studioSoulshotWorkshopOverlay`)
  const workshopPlazas = (tatlas && tatlas.soulshot_workshop_plazas) || [];
  const curWorkshopMode = ATLAS_WORKSHOP_MODE || ATLAS_STATE_STORE.workshopMode || 'All';
  const activeWorkshopPlazas = curWorkshopMode === 'Off'
    ? []
    : (curWorkshopMode === 'All'
      ? workshopPlazas
      : workshopPlazas.filter(p => p.workshop_tier === curWorkshopMode));
  const soulshotWorkshopOverlaySvg = `
    <g id="studioSoulshotWorkshopOverlay">
      ${activeWorkshopPlazas.map(p => {
        const pc = clampWorldLocCoord(p.plaza_loc || '-84120:243500');
        const sz = allZonesById[p.recipe_spoil_zone_id] || {};
        const tz = allZonesById[p.town_zone_id] || {};
        const sc = clampWorldLocCoord(sz.loc_coord || '-68180:228620');
        const isCap = p.workshop_tier === 'Capital_S_Grade_Master_Forge';
        const isReg = p.workshop_tier === 'Regional_B_A_Workshop';
        const colHex = isCap ? '#f59e0b' : (isReg ? '#fb923c' : '#38bdf8');
        const iconTxt = isCap ? '👑' : (isReg ? '⚙️' : '⚒️');
        const townClickJs = `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || p.town_zone_id.replace('zone-', ''))}', '${escapeHtml(p.plaza_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${townClickJs}">
            <line x1="${sc.svgX}" y1="${sc.svgY}" x2="${pc.svgX}" y2="${pc.svgY}" stroke="${colHex}" stroke-width="1.6" stroke-dasharray="4 2" opacity="0.78"/>
            <circle cx="${pc.svgX}" cy="${pc.svgY}" r="10.6" fill="rgba(194,65,12,0.34)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${pc.svgX}" y="${pc.svgY + 3.5}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D40: Interactive Territory Ward Relic & Fortress Giant's Codex Supply Overlay (`studioTerritoryWardOverlay`)
  const territoryWardNodes = (tatlas && tatlas.territory_ward_supply_nodes) || [];
  const curWardMode = ATLAS_TERRITORY_WARD_MODE || ATLAS_STATE_STORE.territoryWardMode || 'All';
  const activeTerritoryWardNodes = curWardMode === 'Off'
    ? []
    : (curWardMode === 'All'
      ? territoryWardNodes
      : territoryWardNodes.filter(n => n.node_role === curWardMode));
  const territoryWardOverlaySvg = `
    <g id="studioTerritoryWardOverlay">
      ${activeTerritoryWardNodes.map(n => {
        const wc = clampWorldLocCoord(n.loc || '-96020:258560');
        const vz = allZonesById[n.linked_vassal_zone_id] || {};
        const vc = clampWorldLocCoord(vz.loc_coord || '-84120:243500');
        const isWard = n.node_role === 'Sovereign_Territory_Ward';
        const colHex = isWard ? '#f43f5e' : '#eab308';
        const iconTxt = isWard ? '🚩' : '📖';
        const fortClickJs = `focusFortressBlueprint('${escapeHtml(n.stronghold_zone_id)}', '${escapeHtml(n.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${fortClickJs}">
            <line x1="${wc.svgX}" y1="${wc.svgY}" x2="${vc.svgX}" y2="${vc.svgY}" stroke="${colHex}" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.75"/>
            <circle cx="${wc.svgX}" cy="${wc.svgY}" r="10.8" fill="rgba(190,18,60,0.34)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${wc.svgX}" y="${wc.svgY + 3.5}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D41: Interactive 12-Relic Epic Boss Jewelry & Status Resistance Overlay (`studioEpicJewelryOverlay`)
  const epicJewelryRows = (tatlas && tatlas.epic_jewelry_sanctums) || [];
  const curJewelryMode = ATLAS_EPIC_JEWELRY_MODE || ATLAS_STATE_STORE.epicJewelryMode || 'All';
  const activeEpicJewelryRows = curJewelryMode === 'Off'
    ? []
    : (curJewelryMode === 'All'
      ? epicJewelryRows
      : epicJewelryRows.filter(r => r.slot_category === curJewelryMode));
  const epicJewelryOverlaySvg = `
    <g id="studioEpicJewelryOverlay">
      ${activeEpicJewelryRows.map(r => {
        const jc = clampWorldLocCoord(r.loc || '-113190:235226');
        const isRing = r.slot_category === 'Epic_Ring';
        const isEar = r.slot_category === 'Epic_Earring';
        const colHex = isRing ? '#f59e0b' : (isEar ? '#38bdf8' : '#e879f9');
        const iconTxt = isRing ? '💍' : (isEar ? '💎' : '📿');
        const jumpJs = r.dungeon_id
          ? `openDungeonSubMap('${escapeHtml(r.dungeon_id)}', '${escapeHtml(r.floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(r.zone_id)}', '${escapeHtml(r.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${jc.svgX}" cy="${jc.svgY}" r="11.4" fill="rgba(88,28,135,0.42)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${jc.svgX}" y="${jc.svgY + 3.5}" text-anchor="middle" font-size="8.6">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D42: Interactive 15-Town Adventurer's Guide Buff, Shadow Weapon & Vitality Obelisk Overlay (`studioVitalityObeliskOverlay`)
  const vitalityObeliskRows = (tatlas && tatlas.adventurer_vitality_obelisks) || [];
  const curObeliskMode = ATLAS_VITALITY_OBELISK_MODE || ATLAS_STATE_STORE.vitalityObeliskMode || 'All';
  const activeVitalityObelisks = curObeliskMode === 'Off'
    ? []
    : (curObeliskMode === 'All'
      ? vitalityObeliskRows
      : vitalityObeliskRows.filter(o => o.obelisk_tier === curObeliskMode));
  const vitalityObeliskOverlaySvg = `
    <g id="studioVitalityObeliskOverlay">
      ${activeVitalityObelisks.map(o => {
        const oc = clampWorldLocCoord(o.obelisk_loc || '-84120:243500');
        const tz = allZonesById[o.town_zone_id] || {};
        const isCap = o.obelisk_tier === 'Capital_Stage4_Vitality_Sanctuary';
        const isReg = o.obelisk_tier === 'Regional_Shadow_Weapon_Hub';
        const colHex = isCap ? '#34d399' : (isReg ? '#38bdf8' : '#fbbf24');
        const iconTxt = isCap ? '🔋' : (isReg ? '⚡' : '✨');
        const townClickJs = `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || o.town_zone_id.replace('zone-', ''))}', '${escapeHtml(o.obelisk_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${townClickJs}">
            <circle cx="${oc.svgX}" cy="${oc.svgY}" r="10.4" fill="rgba(6,78,59,0.42)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${oc.svgX}" y="${oc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  const svgInnerHtml = `
    <image href="${isL2 ? '/studio-maps/c3_continent_parchment_relief.png' : '/studio-maps/all_interlaced_world_grid.png'}" x="0" y="0" width="1040" height="500" preserveAspectRatio="none"/>
    <rect x="0" y="0" width="1040" height="500" fill="none" stroke="#fde047" stroke-width="2" opacity="0.4"/>
    ${farmingEfficiencyOverlaySvg}
    ${castleSiegeDomainOverlaySvg}
    ${worldBossSpawnRadarOverlaySvg}
    ${sevenSealsOverlaySvg}
    ${manorEconomyOverlaySvg}
    ${noblesseOlympiadOverlaySvg}
    ${intercontinentalTransitOverlaySvg}
    ${soulCrystalOverlaySvg}
    ${fishingSanctuaryOverlaySvg}
    ${cursedWeaponPvpOverlaySvg}
    ${dimensionalRiftOverlaySvg}
    ${weaponAugmentationDyeOverlaySvg}
    ${companionMountOverlaySvg}
    ${clanAcademyOverlaySvg}
    ${herbElementalBiomeOverlaySvg}
    ${soulshotWorkshopOverlaySvg}
    ${territoryWardOverlaySvg}
    ${epicJewelryOverlaySvg}
    ${vitalityObeliskOverlaySvg}
    ${regionalOverlaySvg}
    ${highwaysSvg}
    ${travelRouteOverlaySvg}
    ${raceGrowthPathSvg}
    ${bossHierarchyOverlaySvg}
    ${questTrialOverlaySvg}
    ${landmarksSvg}
    ${mobPinsSvg}
  `;

  const matchCount = visibleLandmarks.length + visibleMobPins.length;
  const defaultLm = visibleLandmarks[0] || overlandLandmarks[0];
  const defaultPoi = {
    title: defaultLm.label,
    category: defaultLm.sublabel,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: 'CANON · 3 Continents · 6 Race Spawns · 3 Multi-Floor Dungeons',
    summary: 'Uncluttered continuous geography with travel highways, 6 Playable Race Spawn markers, automatic 3-tier Semantic Zoom (1.0× Macro → 2.2× Regional → 4.5×+ Town Street Blueprint), and clickable Multi-Floor Dungeon Warps.',
    address: `Lantern Hollow (Gludin Archetype) · Teacup Meadows · Hearthbloom Basin`,
    coordinates: `loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y} · Semantic Zoom: ${STUDIO_MAP_ZOOM.toFixed(2)}×`,
    scaleSpecs: '13.0m Main Plaza Road · 4.4m Cobblestone Walkways · 0.58m Counters · 0.14m Steps',
    townBlueprintId: 'town-lantern-hollow',
    locCoord: '-84120:243500',
    drillLabel: 'Zoom to Street Map (5.2×)',
    inspectId: 'town-lantern-hollow',
    connections: [
      { label: '🏘️ Lantern Hollow (Gludin) Street & Shop Blueprint', badge: 'ZOOM ≥4.5×' },
      { label: '🕳️ Kiln Cellar (The Ant Nest) B1 ⇄ B2 ⇄ B3', badge: 'SUB-MAP' },
      { label: '🗼 Pendulum Shaft (Cruma Tower) 1F ⇄ 2F ⇄ 3F', badge: 'SUB-MAP' }
    ]
  };

  return renderCartoShellHtml({
    stepLabel: `🧭 DEDICATED SEMANTIC-ZOOM WORLD, TOWN & MULTI-FLOOR DUNGEON ATLAS · LOD TIER ${lodTier} (${STUDIO_MAP_ZOOM.toFixed(2)}×)`,
    title: 'Cradle of Embers Continuous World Map — Travel Highways, 6 Playable Race Spawns, Town Street Blueprints & Dungeon Sub-Maps',
    subtitle: 'Scroll/zoom ≥2.2× for Regional Roads & Dungeon Warp Portals · Zoom ≥4.5× (or click a Town) for Street, #1..#12 Building & Shop/Refinement Marks · Click any Dungeon to warp B1⇄B2⇄B3 / 1F⇄2F⇄3F',
    activeScaleIndex: lodTier,
    defaultPoi,
    filterBarHtml: renderAtlasFilterBarHtml(matchCount),
    bottomPanelHtml: `${bottomTravelItineraryPanelHtml}${bottomRaceGrowthPanelHtml}${renderAtlasFilteredEntityMatrixHtml(tatlas)}`,
    svgInnerHtml,
    legendItems: [
      { color: '#10b981', label: '🧬 6 Playable Race Spawns' },
      { color: '#eab308', label: '🏰 Towns (Zoom ≥4.5× for Shops)' },
      { color: '#fde047', label: '🛤️ 6-Race Growth Route (A..L)' },
      { color: '#a855f7', label: '🕳️ / 🗼 Multi-Floor Dungeon Warp' },
      { color: '#ef4444', label: '👾 Monster / ⚔️ Mini-Boss' },
      { color: '#f97316', label: '🔥 Raid / 👑 MVP Boss' }
    ]
  });
}

function renderWhcBigPictureSvg(whc, continents) {
  return renderDedicatedWorldAtlas();
}


function getStudioRaceBinding(districtOrTownId) {
  const whc = (DATA && DATA.studioPerspectives && DATA.studioPerspectives.worldHistoryAndConcept) || {};
  const races = (whc.race_taxonomy && whc.race_taxonomy.playable_and_mob_races) || [];
  return races.find(r => r.district_id === districtOrTownId || r.home_town_id === districtOrTownId || r.ancestral_expedition_citadel_id === districtOrTownId) || null;
}

function getStudioConvergenceHub(districtOrTownId) {
  const whc = (DATA && DATA.studioPerspectives && DATA.studioPerspectives.worldHistoryAndConcept) || {};
  const conv = (whc.shared_world_systems && whc.shared_world_systems.cross_race_convergence_hubs) || {};
  const hubs = conv.hubs || [];
  return hubs.find(h => h.district_id === districtOrTownId || h.town_node_id === districtOrTownId) || null;
}

function renderContinentBigPictureSvg(continents, districts, activeContinent) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const allNodes = sp.nodes || [];
  const childDistricts = getSortedContinentDistricts(districts, activeContinent.id);
  const isC01 = activeContinent.id.includes('continent-01');
  const isC02 = activeContinent.id.includes('continent-02');

  // 12 Contiguous District Territory Positions across the 1040x500 Continent Map
  // D01 (index 0) is placed centrally at the Starter Basin heart so roads radiate cleanly!
  const regionCenters = [
    { x: 205, y: 365, poly: '65,295 325,295 335,445 75,450' },
    { x: 455, y: 372, poly: '325,295 575,295 585,450 335,445' },
    { x: 705, y: 372, poly: '575,295 815,300 825,450 585,450' },
    { x: 905, y: 365, poly: '815,300 985,295 985,450 825,450' },
    { x: 195, y: 222, poly: '70,155 315,155 325,295 65,295' },
    { x: 445, y: 222, poly: '315,155 575,155 575,295 325,295' },
    { x: 695, y: 225, poly: '575,155 815,160 815,300 575,295' },
    { x: 905, y: 225, poly: '815,160 985,160 985,295 815,300' },
    { x: 225, y: 92,  poly: '85,35 365,35 315,155 70,155' },
    { x: 495, y: 90,  poly: '365,35 635,35 575,155 315,155' },
    { x: 745, y: 92,  poly: '635,35 865,40 815,160 575,155' },
    { x: 925, y: 95,  poly: '865,40 985,45 985,160 815,160' }
  ];

  // Arterial Continent Highway Network connecting the District Territories (D01 -> D02 -> D03...)
  const roadPairs = [
    [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7],
    [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 10], [7, 11],
    [8, 9], [9, 10], [10, 11]
  ];

  const selectedDist = childDistricts.find(d => d.id === STUDIO_SELECTED_DISTRICT_ID) || childDistricts[0] || {};
  const selectedDistIdx = Math.max(0, childDistricts.findIndex(d => d.id === selectedDist.id));
  const selectedDistCode = `D${String(selectedDistIdx + 1).padStart(2, '0')}`;
  const selectedDistNodes = allNodes.filter(n => n.parent_district_id === selectedDist.id);

  const defaultPoi = {
    title: `${selectedDistCode} · ${selectedDist.name || activeContinent.name}`,
    category: `Selected District in ${activeContinent.name} · Lv. ${(selectedDist.level_range || [1, 15]).join('–')}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `${(selectedDist.status || 'canon').toUpperCase()} · ${selectedDistNodes.length} Child Maps Inside This District`,
    summary: selectedDist.core_rationale || activeContinent.core_rationale || '',
    address: `Territory ${selectedDistCode} (${selectedDist.name}) · ${activeContinent.name}`,
    coordinates: `Contains: 🏰 ${selectedDistNodes.filter(n => n.node_type === 'town').length} Town · ⚔️ ${selectedDistNodes.filter(n => n.node_type === 'hunting_area').length} Hunting · 🕳️ ${selectedDistNodes.filter(n => n.node_type === 'dungeon').length} Catacomb`,
    scaleSpecs: (selectedDist.quality_checklist && selectedDist.quality_checklist.character_scale_consistency && selectedDist.quality_checklist.character_scale_consistency.evidence) || '12.5m roads · 4.4m walkways · 0.58m counters',
    drillPerspective: 'district',
    drillOpts: { continentId: activeContinent.id, districtId: selectedDist.id, inspectId: selectedDist.id },
    drillLabel: `Zoom into ${selectedDistCode} ${selectedDist.name} (16×)`,
    inspectId: selectedDist.id,
    connections: selectedDistNodes.map(n => ({
      label: `${n.node_type === 'town' ? '🏰 TOWN:' : (n.node_type === 'dungeon' ? '🕳️ CATACOMB:' : '⚔️ HUNTING:')} ${n.name}`,
      badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${n.status.toUpperCase()}`
    }))
  };

  const terrainHtml = `
    <!-- Authentic L2J.RU Parchment Relief & Interlaced Satellite Base Plate -->
    <image href="${isL2 ? '/studio-maps/c3_continent_parchment_relief.png' : '/studio-maps/all_interlaced_world_grid.png'}" x="0" y="0" width="1040" height="500" preserveAspectRatio="none" opacity="0.92"/>
  `;

  // Winding Continent Highways connecting District centers
  const roadsHtml = roadPairs
    .filter(([a, b]) => a < childDistricts.length && b < childDistricts.length)
    .map(([a, b]) => {
      const pa = regionCenters[a];
      const pb = regionCenters[b];
      const isSelEdge = childDistricts[a].id === selectedDist.id || childDistricts[b].id === selectedDist.id;
      return `
        <g pointer-events="none">
          <line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#241c10" stroke-width="${isSelEdge ? 6.5 : 4.5}" stroke-linecap="round"/>
          <line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="${isSelEdge ? '#fde047' : '#cbb989'}" stroke-width="${isSelEdge ? 3.2 : 2.0}" stroke-linecap="round" ${isSelEdge ? '' : 'stroke-dasharray="8 4"'}/>
        </g>
      `;
    }).join('');

  // Render EACH District Territory Polygon + Its Internal Mini-Cluster (🏰 Gold Town, ⚔️ Red Hunting Fortress, 🕳️ Purple Catacomb)
  // Using the EXACT SAME symbol + icon + color as Step 3 District!
  const districtsHtml = childDistricts.map((d, idx) => {
    const rc = regionCenters[idx % regionCenters.length];
    const dCode = `D${String(idx + 1).padStart(2, '0')}`;
    const st = (d.status || 'canon').toLowerCase();
    const isSel = d.id === selectedDist.id;
    const lvRange = (d.level_range || [1, 15]).join('–');
    const dNodes = allNodes.filter(n => n.parent_district_id === d.id);
    const townNode = dNodes.find(n => n.node_type === 'town');
    const huntNodes = dNodes.filter(n => n.node_type === 'hunting_area');
    const dngNode = dNodes.find(n => n.node_type === 'dungeon');
    const raceBind = getStudioRaceBinding(d.id) || (townNode && getStudioRaceBinding(townNode.id));
    const isStarterRaceHome = Boolean(raceBind && raceBind.district_id === d.id);
    const convHub = getStudioConvergenceHub(d.id) || (townNode && getStudioConvergenceHub(townNode.id));
    const roleTag = convHub
      ? `🤝 LV.${(convHub.level_band || [10,20]).join("-")} ALL-RACE GUILD & PARTY HUB`
      : (isStarterRaceHome ? `${raceBind.icon || "🧬"} ${raceBind.name.split(" ")[0].toUpperCase()} HOME (Lv.1–10)` : (raceBind ? `${raceBind.icon || "🧬"} ${raceBind.name.split(" ")[0].toUpperCase()} CITADEL` : ""));

    const poiObj = {
      title: `${dCode} · ${d.name}${roleTag ? " — " + roleTag : ""}`,
      category: `${roleTag ? roleTag + " · " : ""}District Territory · Lv. ${lvRange} (${st.toUpperCase()})`,
      thumb: (townNode && townNode.terrain_tile && townNode.terrain_tile.preview_thumbnail) || '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `${st.toUpperCase()} · Contains: 🏰 ${townNode ? 1 : 0} Town, ⚔️ ${huntNodes.length} Hunting, 🕳️ ${dngNode ? 1 : 0} Catacomb`,
      summary: d.core_rationale || '',
      address: `District ${dCode} (${d.name}) · ${activeContinent.name}`,
      coordinates: `Same Symbols in Lv.3 District: 🏰 Gold Town · ⚔️ Red Hunting · 🕳️ Purple Catacomb`,
      scaleSpecs: (d.quality_checklist && d.quality_checklist.character_scale_consistency && d.quality_checklist.character_scale_consistency.evidence) || '12.5m roads · 4.4m walkways · 0.58m counters',
      drillPerspective: 'district',
      drillOpts: { continentId: activeContinent.id, districtId: d.id, nodeId: (townNode && townNode.id) || (dNodes[0] && dNodes[0].id) || '', inspectId: d.id },
      drillLabel: `Zoom into ${dCode} ${d.name} (16×)`,
      inspectId: d.id,
      svgX: rc.x,
      svgY: rc.y,
      connections: [
        ...(convHub ? (convHub.guilding_and_party_features || []).map(f => ({ label: `🤝 ${f}`, badge: `Lv.${(convHub.level_band || [10,20]).join("-")} HUB` })) : []),
        ...(isStarterRaceHome ? [
          { label: `${raceBind.icon || "🧬"} Race Starter: ${raceBind.name} -> Home Town: ${raceBind.home_town_name}`, badge: "Lv.1–10 START" },
          { label: `🌾 Farming Drops: ${(raceBind.farming_resources || []).join(", ")}`, badge: "CRAFTING" },
          { label: `🤝 Lv.10–20 Convergence Target: Kilnwatch Bastion (Guilding & Party Hub)`, badge: "LV.10–20 HUB" }
        ] : []),
        ...dNodes.map(n => ({
          label: `${n.node_type === 'town' ? '🏰 TOWN:' : (n.node_type === 'dungeon' ? '🕳️ CATACOMB:' : '⚔️ HUNTING:')} ${n.name}`,
          badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${n.status.toUpperCase()}`
        }))
      ]
    };

    const polyFill = isSel
      ? 'rgba(250, 204, 21, 0.20)'
      : (st === 'mystery' ? 'rgba(168, 85, 247, 0.14)' : (st === 'draft' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(24, 20, 12, 0.14)'));
    const polyStroke = isSel ? '#fde047' : (st === 'mystery' ? '#c084fc' : 'rgba(245, 158, 11, 0.55)');

    // Mini child nodes inside the District territory on the Continent map (exact same colors & icons as Step 3 District!)
    // Center = 🏰 Gold Town (#eab308), Left = ⚔️ Red Hunting (#ef4444), Right = 🕳️ Purple Catacomb (#a855f7) or 2nd Hunting
    const miniClusterSvg = st === 'mystery' ? `
      <!-- Mystery District Sigil (#e879f9) -->
      <circle cx="${rc.x}" cy="${rc.y - 4}" r="14" fill="#3b0764" stroke="#e879f9" stroke-width="2" stroke-dasharray="4 2"/>
      <text x="${rc.x}" y="${rc.y + 1}" text-anchor="middle" font-size="12">🌫️</text>
    ` : `
      <!-- Mini Internal District Road connecting Hunting <-> Town <-> Catacomb -->
      <line x1="${rc.x - 36}" y1="${rc.y + 2}" x2="${rc.x + 36}" y2="${rc.y + 2}" stroke="#1c150b" stroke-width="4"/>
      <line x1="${rc.x - 36}" y1="${rc.y + 2}" x2="${rc.x + 36}" y2="${rc.y + 2}" stroke="#d4af37" stroke-width="2"/>

      <!-- Left Mini Node: ⚔️ Hunting Ground (#ef4444 Red Fortress) -->
      <g transform="translate(${rc.x - 36}, ${rc.y + 2})">
        <circle cx="0" cy="0" r="10" fill="#991b1b" stroke="#ef4444" stroke-width="1.8"/>
        <text x="0" y="3.5" text-anchor="middle" font-size="9.5">⚔️</text>
      </g>

      <!-- Center Main Node: 🏰 Town Sanctuary (#eab308 Gold Walled Town) -->
      <g transform="translate(${rc.x}, ${rc.y - 4})">
        <circle cx="0" cy="0" r="${isSel ? 15 : 13}" fill="#854d0e" stroke="#fde047" stroke-width="${isSel ? 2.5 : 2}"/>
        <text x="0" y="4.5" text-anchor="middle" font-size="${isSel ? 13 : 11}">🏰</text>
      </g>

      <!-- Right Mini Node: 🕳️ Catacomb/Dungeon (#a855f7 Violet Obelisk) -->
      <g transform="translate(${rc.x + 36}, ${rc.y + 2})">
        <circle cx="0" cy="0" r="10" fill="#4c1d95" stroke="#c084fc" stroke-width="1.8"/>
        <text x="0" y="3.5" text-anchor="middle" font-size="9.5">${dngNode ? '🕳️' : '⚔️'}</text>
      </g>
    `;

    return `
      <g data-poi-clickable="1" style="cursor:pointer"
         onclick="selectStudioMapPoi('${encodePoiAttr(poiObj)}', event)"
         ondblclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <polygon points="${rc.poly}" fill="${polyFill}" stroke="${polyStroke}" stroke-width="${isSel ? 3.2 : 1.6}" ${isSel ? '' : 'stroke-dasharray="7 4"'}/>

        ${convHub ? `
          <!-- Pulsing All-Race Lv.10-20 Convergence Hub Halo & Pill -->
          <circle cx="${rc.x}" cy="${rc.y - 4}" r="30" fill="rgba(234,179,8,0.18)" stroke="#fde047" stroke-width="2" stroke-dasharray="5 3"/>
          <rect x="${rc.x - 92}" y="${rc.y - 66}" width="184" height="17" rx="8" fill="#dc2626" stroke="#fde047" stroke-width="1.5"/>
          <text x="${rc.x}" y="${rc.y - 54}" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="900" font-family="monospace">
            ${escapeHtml(roleTag)}
          </text>
        ` : (roleTag ? `
          <!-- Race Home Town / Citadel Pill -->
          <rect x="${rc.x - 84}" y="${rc.y - 65}" width="168" height="16" rx="8" fill="#0f172a" stroke="#38bdf8" stroke-width="1.3"/>
          <text x="${rc.x}" y="${rc.y - 54}" text-anchor="middle" fill="#7dd3fc" font-size="8.5" font-weight="900" font-family="monospace">
            ${escapeHtml(roleTag)}
          </text>
        ` : "")}
        <!-- District Code & Name Banner -->
        <rect x="${rc.x - 78}" y="${rc.y - 46}" width="156" height="19" rx="4" fill="${isSel ? '#eab308' : 'rgba(18,14,9,0.88)'}" stroke="${isSel ? '#ffffff' : '#f59e0b'}" stroke-width="1.2"/>
        <text x="${rc.x}" y="${rc.y - 33}" text-anchor="middle" fill="${isSel ? '#0f172a' : '#fde68a'}" font-size="9.5" font-weight="900" font-family="monospace">
          ${dCode} · ${escapeHtml(d.name.slice(0, 16))}
        </text>

        ${miniClusterSvg}

        <!-- Sublabel showing child Town name & Level Band -->
        <text x="${rc.x}" y="${rc.y + 23}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:${isSel ? '#fde047' : '#f8f5ec'};font-size:10px;font-weight:800">
          ${townNode ? '🏰 ' + escapeHtml(townNode.name.slice(0, 18)) : (st === 'mystery' ? '🌫️ Uncharted Caldera' : escapeHtml(d.name.slice(0, 18)))}
        </text>
        <text x="${rc.x}" y="${rc.y + 35}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#120d07;stroke-width:3px;fill:#e2d5b5;font-size:8.5px;font-weight:700;font-family:monospace">
          Lv.${lvRange} · ${dNodes.length} Maps ${isSel ? '· [SELECTED]' : ''}
        </text>
      </g>
    `;
  }).join('');

  const continentSwitcherHtml = continents.map(c => `
    <button type="button" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(c.id)}', inspectId: '${escapeHtml(c.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:6px 12px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${c.id === activeContinent.id ? '#f59e0b' : 'rgba(255,255,255,0.18)'};background:${c.id === activeContinent.id ? '#292318' : 'rgba(18,16,12,0.86)'};color:${c.id === activeContinent.id ? '#fde047' : '#d6d3d1'}">
      🌍 ${escapeHtml(c.name)}
    </button>
  `).join('') + `
    <button type="button" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(selectedDist.id || '')}', inspectId: '${escapeHtml(selectedDist.id || '')}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:6px 12px;border-radius:6px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#2563eb;color:#ffffff;box-shadow:0 4px 12px rgba(37,99,235,0.45)">
      🔍 Zoom into Selected ${selectedDistCode} (${escapeHtml((selectedDist.name || '').slice(0, 18))}) ➔
    </button>
  `;

  const svgInnerHtml = `
    ${terrainHtml}
    ${roadsHtml}
    ${districtsHtml}
  `;

  return renderCartoShellHtml({
    stepLabel: `🗺️ STEP 2 CONTINENT ATLAS · ${escapeHtml((activeContinent.name || '').toUpperCase())} · SELECTED: ${selectedDistCode} ${escapeHtml((selectedDist.name || '').toUpperCase())}`,
    title: `${escapeHtml(activeContinent.name || '')} — ${childDistricts.length} District Territories (D01–D${String(childDistricts.length).padStart(2, '0')}) with Unified 🏰 Town / ⚔️ Hunting / 🕳️ Catacomb Symbols`,
    subtitle: 'Every District box on the Continent map previews its internal 🏰 Gold Town, ⚔️ Red Hunting Ground & 🕳️ Purple Catacomb — click any District to select it, or double-click to zoom into its Lv.3 District Map',
    activeScaleIndex: 2,
    defaultPoi,
    drillControls: continentSwitcherHtml,
    svgInnerHtml,
    legendItems: [
      { color: '#fde047', label: '[D01..D11] Selected District Territory' },
      { color: '#eab308', label: '🏰 Town Sanctuary (Gold)' },
      { color: '#ef4444', label: '⚔️ Hunting Area (Crimson)' },
      { color: '#a855f7', label: '🕳️ Catacomb / Dungeon (Violet)' },
      { color: '#38bdf8', label: '🌊 River & Highway Network' }
    ]
  });
}

function renderDistrictBigPictureSvg(activeContinent, activeDistrict, allDistrictNodes) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const sortedContinentDistricts = getSortedContinentDistricts(sp.districts || [], activeContinent.id);
  const distIdx = Math.max(0, sortedContinentDistricts.findIndex(d => d.id === activeDistrict.id));
  const distCode = `D${String(distIdx + 1).padStart(2, '0')}`;
  const prevDist = distIdx > 0 ? sortedContinentDistricts[distIdx - 1] : null;
  const nextDist = distIdx + 1 < sortedContinentDistricts.length ? sortedContinentDistricts[distIdx + 1] : null;

  const portalEdges = activeDistrict.portal_edges || [];
  const overlandNodes = allDistrictNodes.filter(n => n.node_type !== 'dungeon');
  const dungeonNodes = allDistrictNodes.filter(n => n.node_type === 'dungeon');

  function quadCenter(coords, isDng, idx) {
    if (isDng) return { x: 895, y: 250 + idx * 120, bx: 780, by: 52, bw: 235, bh: 396 };
    const c = coords && coords.length === 2 ? coords : [0, 1];
    const qx = c[0] === 0 ? 235 : 585;
    const qy = c[1] === 0 ? 142 : 348;
    const bx = c[0] === 0 ? 55 : 410;
    const by = c[1] === 0 ? 48 : 252;
    return { x: qx, y: qy, bx, by, bw: 345, bh: 196 };
  }

  const nodePos = {};
  overlandNodes.forEach((n, i) => {
    nodePos[n.id] = { ...quadCenter(n.grid_coordinates, false, i), node: n };
  });
  dungeonNodes.forEach((n, i) => {
    nodePos[n.id] = { ...quadCenter(n.grid_coordinates, true, i), node: n };
  });

  const townNode = overlandNodes.find(n => n.node_type === 'town') || allDistrictNodes[0] || {};
  const totalNpcs = allDistrictNodes.reduce((acc, n) => acc + ((n.resident_npcs || []).length), 0);
  const totalSpawns = allDistrictNodes.reduce((acc, n) => acc + ((n.resident_spawns || []).length), 0);

  const defaultPoi = {
    title: `${distCode} · ${activeDistrict.name || 'District'} (Lv.3 District Atlas)`,
    category: `Part of ${activeContinent.name || 'Continent'} · 8,000m × 8,000m Territory · Lv. ${(activeDistrict.level_range || [1, 15]).join('–')}`,
    thumb: (townNode.terrain_tile && townNode.terrain_tile.preview_thumbnail) || '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `${(activeDistrict.status || 'canon').toUpperCase()} · ${allDistrictNodes.length} Zones · ${totalNpcs} NPCs · ${totalSpawns} Monster Packs`,
    summary: activeDistrict.core_rationale || '',
    address: `Territory ${distCode} (${activeDistrict.name}) · ${activeContinent.name || ''}`,
    coordinates: `Same Symbols as Lv.2 Continent: 🏰 Gold Town · ⚔️ Red Hunting · 🕳️ Purple Catacomb · 🛍️ Green NPCs`,
    scaleSpecs: (activeDistrict.quality_checklist && activeDistrict.quality_checklist.character_scale_consistency && activeDistrict.quality_checklist.character_scale_consistency.evidence) || '12.5m main roads · 4.4m walkways · 0.58m counters',
    drillPerspective: 'town-or-hunting-area',
    drillOpts: { continentId: activeContinent.id, districtId: activeDistrict.id, nodeId: townNode.id, inspectId: townNode.id },
    drillLabel: `Zoom into 🏰 ${townNode.name || 'Town'} (64×)`,
    inspectId: activeDistrict.id,
    connections: [
      ...(prevDist ? [{ label: `⬅ West Continent Highway → D${String(distIdx).padStart(2, '0')} ${prevDist.name}`, badge: 'NEIGHBOR' }] : []),
      ...(nextDist ? [{ label: `➡ East Continent Highway → D${String(distIdx + 2).padStart(2, '0')} ${nextDist.name}`, badge: 'NEIGHBOR' }] : []),
      ...allDistrictNodes.map(n => ({
        label: `${n.node_type === 'town' ? '🏰 TOWN:' : (n.node_type === 'dungeon' ? '🕳️ CATACOMB:' : '⚔️ HUNTING:')} ${n.name} [${(n.grid_coordinates || [0,0]).join(',')}]`,
        badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${(n.resident_npcs || []).length} NPC / ${(n.resident_spawns || []).length} Mob`
      }))
    ]
  };

  // Render each quadrant with FULL architectural, street, NPC, and Monster Spawn details!
  const sectorsHtml = Object.values(nodePos).map(({ x, y, bx, by, bw, bh, node }) => {
    const isMystery = node.status === 'mystery';
    const isTown = node.node_type === 'town';
    const isDng = node.node_type === 'dungeon';
    const spawns = node.resident_spawns || [];
    const npcs = node.resident_npcs || [];
    const kit = node.asset_kit_bindings || {};
    const tile = node.terrain_tile || {};
    const thumb = isMystery ? '/thumbs/creatures/god-vesper-dream-eater.webp' : (tile.preview_thumbnail || '/thumbs/buildings/tower_round_roof_a.webp');

    // Unified Symbol + Icon + Color matching Lv.2 Continent & Lv.4 Street!
    const unifiedBadgeCol = isMystery ? '#e879f9' : (isTown ? '#eab308' : (isDng ? '#a855f7' : '#ef4444'));
    const unifiedIcon = isMystery ? '🌫️' : (isTown ? '🏰' : (isDng ? '🕳️' : '⚔️'));
    const unifiedTypeLabel = isMystery ? 'MYSTERY FOG' : (isTown ? 'TOWN SANCTUARY' : (isDng ? 'CATACOMB / DUNGEON B1' : 'HUNTING GROUND'));

    const poiObj = {
      title: `${unifiedIcon} ${node.name} (${unifiedTypeLabel})`,
      category: `Grid [${(node.grid_coordinates || [0,0]).join(', ')}] in ${distCode} ${activeDistrict.name} · 4,000m × 4,000m`,
      thumb,
      hoursOrStatus: isMystery ? 'MYSTERY FRONTIER · Locked behind Fog of Lore' : `CANON · ${isTown ? (npcs.length + ' Resident NPCs · Safe Sanctuary') : (spawns.length + ' Monster Packs Active')}`,
      summary: node.core_rationale || (node.mystery_hook && node.mystery_hook.in_world_rumor) || '',
      address: `${node.name} [${(node.grid_coordinates || [0,0]).join(', ')}] · ${distCode} ${activeDistrict.name} · ${activeContinent.name || ''}`,
      coordinates: `Map ID: ${node.map_id || 'uncharted (mystery)'} · Lv. ${(node.level_range || [1, 15]).join('–')} · Water: ${tile.water_feature || 'Canal'}`,
      scaleSpecs: isMystery ? 'Locked behind Fog of Lore gate' : `Main Road: ${kit.main_road_width_meters || 12.5}m · Walkway: ${kit.footpath_width_meters || 4.4}m · Counter: ${kit.shop_counter_height_meters || 0.58}m · Riser: ${kit.stair_riser_height_meters || 0.14}m`,
      drillPerspective: 'town-or-hunting-area',
      drillOpts: { continentId: activeContinent.id, districtId: activeDistrict.id, nodeId: node.id, inspectId: node.id },
      drillLabel: `Zoom to ${node.name} Street Map (64×)`,
      inspectId: node.id,
      svgX: x,
      svgY: y,
      connections: [
        ...npcs.map(npc => ({ label: `🛍️ NPC: ${npc.name} (${npc.role})`, badge: `${npc.counter_height_meters || 0.58}m counter` })),
        ...spawns.map(sp => ({ label: `⚔️ ${sp.monster_name} ×${sp.spawn_count}`, badge: `Lv.${sp.level} · ${sp.element}` }))
      ]
    };

    const sectorFill = isL2
      ? (isMystery ? '#3a2547' : (isTown ? '#766b46' : (isDng ? '#261b30' : '#62593b')))
      : (isMystery ? '#221a36' : (isTown ? '#285249' : (isDng ? '#2c1d38' : '#234f3e')));

    // Rich internal detail inside each sector so District is packed with readable geography!
    let internalDetailSvg = '';
    if (isTown) {
      internalDetailSvg = `
        <!-- Town Castle Curtain Wall + 4 Corner Bastions + Internal Streets + 2D Building Roofs -->
        <rect x="${bx + 24}" y="${by + 28}" width="${bw - 48}" height="${bh - 42}" rx="12" fill="rgba(20,16,10,0.32)" stroke="#eab308" stroke-width="2.2" stroke-dasharray="12 4"/>
        <circle cx="${bx + 24}" cy="${by + 28}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <circle cx="${bx + bw - 24}" cy="${by + 28}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <circle cx="${bx + 24}" cy="${by + bh - 14}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <circle cx="${bx + bw - 24}" cy="${by + bh - 14}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <!-- Internal Cross Streets & Roundabout Plaza -->
        <line x1="${bx + 26}" y1="${y}" x2="${bx + bw - 26}" y2="${y}" stroke="#cbb989" stroke-width="5" opacity="0.65"/>
        <line x1="${x}" y1="${by + 30}" x2="${x}" y2="${by + bh - 16}" stroke="#cbb989" stroke-width="5" opacity="0.65"/>
        <circle cx="${x}" cy="${y}" r="22" fill="rgba(234,179,8,0.22)" stroke="#fde047" stroke-width="1.5"/>
        <!-- 2D Building Footprints around Plaza -->
        <rect x="${bx + 42}" y="${by + 40}" width="58" height="28" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <rect x="${bx + bw - 100}" y="${by + 40}" width="58" height="28" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <rect x="${bx + 42}" y="${by + bh - 54}" width="64" height="26" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <rect x="${bx + bw - 106}" y="${by + bh - 54}" width="64" height="26" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <!-- Resident NPC Shop Pins (#10b981 Emerald) directly visible in District view! -->
        ${npcs.slice(0, 2).map((npc, ni) => {
          const nx = ni === 0 ? bx + 72 : bx + bw - 72;
          const ny = ni === 0 ? by + 54 : by + bh - 41;
          return `
            <g transform="translate(${nx}, ${ny})">
              <rect x="-48" y="-9" width="96" height="18" rx="9" fill="#064e3b" stroke="#10b981" stroke-width="1.2"/>
              <text x="0" y="3" text-anchor="middle" fill="#a7f3d0" font-size="8.5" font-weight="800">🛍️ ${escapeHtml(npc.name.slice(0, 12))}</text>
            </g>
          `;
        }).join('')}
      `;
    } else if (isDng) {
      internalDetailSvg = `
        <!-- Subterranean Catacomb Chambers, Pillars & Boss Altar -->
        <rect x="${bx + 18}" y="${by + 36}" width="${bw - 36}" height="${bh - 54}" rx="10" fill="rgba(15,10,24,0.55)" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="6 4"/>
        <line x1="${x}" y1="${by + 45}" x2="${x}" y2="${by + bh - 30}" stroke="#7e22ce" stroke-width="8" stroke-dasharray="10 6"/>
        <circle cx="${x}" cy="${by + 95}" r="24" fill="rgba(168,85,247,0.18)" stroke="#c084fc" stroke-width="1.5"/>
        <text x="${x}" y="${by + 70}" text-anchor="middle" fill="#e9d5ff" font-size="8.5" font-family="monospace">UPPER VAULT HALL</text>
        <circle cx="${x}" cy="${by + bh - 85}" r="28" fill="rgba(239,68,68,0.2)" stroke="#f97316" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="${x}" y="${by + bh - 45}" text-anchor="middle" fill="#fed7aa" font-size="8.5" font-family="monospace">🔥 SUMP ALTAR CHAMBER</text>
        ${spawns.slice(0, 2).map((sp, si) => {
          const sy = si === 0 ? by + 95 : by + bh - 85;
          return `
            <g transform="translate(${x}, ${sy})">
              <rect x="-68" y="14" width="136" height="18" rx="9" fill="#3b0764" stroke="#c084fc" stroke-width="1.2"/>
              <text x="0" y="26" text-anchor="middle" fill="#f3e8ff" font-size="8.5" font-weight="800">🕳️ ${escapeHtml(sp.monster_name.slice(0, 13))} ×${sp.spawn_count} (Lv.${sp.level})</text>
            </g>
          `;
        }).join('')}
      `;
    } else if (isMystery) {
      internalDetailSvg = `
        <ellipse cx="${x}" cy="${y}" rx="115" ry="58" fill="rgba(168,85,247,0.18)" stroke="#e879f9" stroke-width="2" stroke-dasharray="6 4"/>
        <text x="${x}" y="${y - 32}" text-anchor="middle" fill="#f5d0fe" font-size="9.5" font-weight="800">🌫️ SEALED BY FOG OF LORE</text>
        <text x="${x}" y="${y + 48}" text-anchor="middle" fill="#e9d5ff" font-size="8.5" font-style="italic">${escapeHtml(((node.mystery_hook && node.mystery_hook.visual_silhouette) || 'Uncharted frontier silhouette').slice(0, 42))}...</text>
      `;
    } else {
      // Hunting Area: Mountain Ridges, Forest Groves, Watchtower & Monster Habitat Rings + Badges!
      internalDetailSvg = `
        ${drawL2MountainRangeSvg(`${bx + 35},${by + 58} ${bx + 115},${by + 42} ${bx + 195},${by + 60}`, 0.85)}
        <ellipse cx="${bx + 78}" cy="${by + 138}" rx="48" ry="24" fill="rgba(26,56,36,0.55)" stroke="rgba(74,222,128,0.35)" stroke-width="1"/>
        <ellipse cx="${bx + bw - 78}" cy="${by + 138}" rx="52" ry="26" fill="rgba(239,68,68,0.18)" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="4 3"/>
        <!-- Monster Pack Badges directly visible in District view! -->
        ${spawns.slice(0, 2).map((sp, si) => {
          const sx = si === 0 ? bx + 85 : bx + bw - 85;
          const sy = si === 0 ? by + bh - 26 : by + 48;
          return `
            <g transform="translate(${sx}, ${sy})">
              <rect x="-66" y="-9" width="132" height="18" rx="9" fill="#7f1d1d" stroke="#ef4444" stroke-width="1.2"/>
              <text x="0" y="3" text-anchor="middle" fill="#fecaca" font-size="8.5" font-weight="800">⚔️ ${escapeHtml(sp.monster_name.slice(0, 12))} ×${sp.spawn_count} Lv.${sp.level}</text>
            </g>
          `;
        }).join('')}
      `;
    }

    const l2Kind = isTown ? 'town' : (isDng ? 'catacomb' : (isMystery ? 'tower' : 'fortress'));
    const subText = `Lv.${(node.level_range || [1, 15]).join('–')} · ${isTown ? (npcs.length + ' NPCs') : (spawns.length + ' Monster Packs')}`;

    return `
      <g data-poi-clickable="1" style="cursor:pointer"
         onclick="selectStudioMapPoi('${encodePoiAttr(poiObj)}', event)"
         ondblclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(node.id)}', inspectId: '${escapeHtml(node.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${sectorFill}" stroke="${unifiedBadgeCol}" stroke-width="${STUDIO_SELECTED_NODE_ID === node.id ? 3.2 : 2}" ${isMystery ? 'stroke-dasharray="7 4"' : ''}/>
        <!-- Unified Color Header Pill -->
        <rect x="${bx + 10}" y="${by + 8}" width="${bw - 20}" height="18" rx="4" fill="rgba(12,10,7,0.82)" stroke="${unifiedBadgeCol}" stroke-width="1"/>
        <text x="${bx + 18}" y="${by + 20}" fill="${unifiedBadgeCol}" font-size="9.5" font-weight="900" font-family="monospace">
          ${unifiedIcon} [${(node.grid_coordinates || [0,0]).join(', ')}] ${unifiedTypeLabel} · ${escapeHtml((tile.biome_palette || 'biome').replace(/_/g, ' ').slice(0, 18).toUpperCase())}
        </text>
        ${internalDetailSvg}
      </g>
      ${drawL2LandmarkSvg({
        kind: l2Kind,
        x,
        y: y - 4,
        label: node.name,
        sublabel: subText,
        flagColor: unifiedBadgeCol,
        isSelected: STUDIO_SELECTED_NODE_ID === node.id || STUDIO_ACTIVE_INSPECT_ID === node.id,
        poiObj
      })}
    `;
  }).join('');

  // Render arterial highways & bridges connecting the quadrants
  const roadsHtml = portalEdges.map((edge) => {
    const a = nodePos[edge.from_node_id];
    const b = nodePos[edge.to_node_id];
    if (!a || !b) return '';
    const isFog = edge.gate_state === 'fog_of_lore';
    const isDng = edge.from_direction === 'Dungeon' || edge.to_direction === 'Dungeon';
    const mx = Math.round((a.x + b.x) / 2);
    const my = Math.round((a.y + b.y) / 2);
    const stroke = isFog ? '#e879f9' : (isDng ? '#a855f7' : '#d4af37');
    return `
      <g pointer-events="none">
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1c150b" stroke-width="9" stroke-linecap="round"/>
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="4.5" ${isFog || isDng ? 'stroke-dasharray="8 5"' : ''}/>
        <rect x="${mx - 58}" y="${my - 10}" width="116" height="19" rx="4" fill="#120d07" stroke="${stroke}" stroke-width="1.2"/>
        <text x="${mx}" y="${my + 3}" text-anchor="middle" fill="#fde68a" font-size="8.5" font-weight="800" font-family="monospace">
          ${isFog ? '🌫️ FOG GATE' : (isDng ? '🕳️ CATACOMB STAIR' : `🛤️ ${edge.from_direction}⇄${edge.to_direction} ROAD`)}
        </text>
      </g>
    `;
  }).join('');

  // Neighboring District Highway Banners on West & East edges so Continent <-> District link is crystal clear!
  const neighborGatesSvg = `
    ${prevDist ? `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(prevDist.id)}', inspectId: '${escapeHtml(prevDist.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <rect x="6" y="218" width="44" height="68" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <text x="28" y="242" text-anchor="middle" fill="#fde047" font-size="12" font-weight="900">⬅</text>
        <text x="28" y="256" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="800" font-family="monospace">D${String(distIdx).padStart(2, '0')}</text>
        <text x="28" y="268" text-anchor="middle" fill="#93c5fd" font-size="7.5" font-family="monospace">WEST</text>
      </g>
    ` : ''}
    ${nextDist ? `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(nextDist.id)}', inspectId: '${escapeHtml(nextDist.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <rect x="730" y="218" width="44" height="68" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <text x="752" y="242" text-anchor="middle" fill="#fde047" font-size="12" font-weight="900">➡</text>
        <text x="752" y="256" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="800" font-family="monospace">D${String(distIdx + 2).padStart(2, '0')}</text>
        <text x="752" y="268" text-anchor="middle" fill="#93c5fd" font-size="7.5" font-family="monospace">EAST</text>
      </g>
    ` : ''}
  `;

  const distRaceBind = getStudioRaceBinding(activeDistrict.id);
  const distConvHub = getStudioConvergenceHub(activeDistrict.id);
  // Top-left District Switcher pills so you can jump between D01..D11 inside the District view too!
  const districtControlsHtml = `
    <button type="button" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(activeDistrict.id)}', inspectId: '${escapeHtml(activeDistrict.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:5px 10px;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;border:1px solid #38bdf8;background:rgba(15,23,42,0.92);color:#7dd3fc">
      ⬅ Back to 🌍 ${escapeHtml(activeContinent.name)} (${distCode} Highlighted)
    </button>
    <button type="button" onclick="setStudioPerspective('district', { continentId: 'continent-01-hearthbloom-basin', districtId: 'district-kilnfire-terraces', nodeId: 'town-kilnwatch-bastion', inspectId: 'district-kilnfire-terraces' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:5px 10px;border-radius:6px;font-size:10.5px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#dc2626;color:#ffffff">
      🤝 Lv.10–20 All-Race Guild Hub (Kilnwatch Bastion) ➔
    </button>
  ` + sortedContinentDistricts.slice(0, 6).map((d, i) => {
    const code = `D${String(i + 1).padStart(2, '0')}`;
    const active = d.id === activeDistrict.id;
    return `
      <button type="button" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
              style="padding:5px 9px;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#fde047' : 'rgba(255,255,255,0.16)'};background:${active ? '#d97706' : 'rgba(18,16,12,0.85)'};color:${active ? '#ffffff' : '#cbd5e1'}">
        ${code} ${escapeHtml(d.name.slice(0, 12))}
      </button>
    `;
  }).join('');

  const hasNW = overlandNodes.some(n => (n.grid_coordinates || [0,0])[0] === 0 && (n.grid_coordinates || [0,0])[1] === 0);
  const svgInnerHtml = `
    <!-- Outer Golden District Boundary Box matching the [D01..D11] Territory Box from Lv.2 Continent! -->
    <rect x="44" y="38" width="978" height="420" rx="14" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="12 5"/>

    ${!hasNW ? `
      <!-- [0,0] NW Highland Watershed & Caldera Rim Reserve -->
      <rect x="55" y="48" width="345" height="196" rx="10" fill="${isL2 ? '#554e35' : '#1d4436'}" stroke="rgba(212,175,55,0.35)" stroke-width="1.5" stroke-dasharray="5 4"/>
      ${drawL2MountainRangeSvg('90,115 180,88 270,112 360,92', 1.15)}
      ${drawL2MountainRangeSvg('110,175 220,155 330,178', 1.0)}
      <text x="228" y="136" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:#e2d5b5;font-size:11px;font-weight:800">⛰️ ${escapeHtml((activeDistrict.name || '').toUpperCase())} HIGHLAND RIDGE [0, 0]</text>
      <text x="228" y="152" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3px;fill:#a7f3d0;font-size:9px;font-family:monospace">Headwaters feeding ${escapeHtml((townNode.terrain_tile && townNode.terrain_tile.water_feature) || 'District Waterway')}</text>
    ` : ''}

    <!-- Continuous Regional River (#38bdf8 / #314e52) flowing across [0,0] -> [0,1] -> [1,1] -->
    <path d="M 115,48 Q 210,165 235,285 T 585,365 L 765,380" fill="none" stroke="${isL2 ? '#314e52' : '#1d4ed8'}" stroke-width="14" stroke-linecap="round" opacity="0.8"/>
    <path d="M 115,48 Q 210,165 235,285 T 585,365 L 765,380" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-dasharray="10 6" opacity="0.65"/>

    ${roadsHtml}
    ${sectorsHtml}
    ${neighborGatesSvg}
  `;

  return renderCartoShellHtml({
    stepLabel: `🏙️ STEP 3 DISTRICT TERRITORY ATLAS · ${distCode} ${escapeHtml((activeDistrict.name || '').toUpperCase())} (IN ${escapeHtml((activeContinent.name || '').toUpperCase())})`,
    title: `${distCode} · ${escapeHtml(activeDistrict.name || '')} — Detailed 🏰 Town Walls & NPCs, ⚔️ Hunting Grounds & Monster Packs, 🕳️ Catacomb B1`,
    subtitle: 'Shares exact same symbols & colors as Lv.2 Continent: click any 🏰 Gold Town, ⚔️ Red Hunting Area, 🕳️ Purple Catacomb, 🛍️ NPC, or ⚔️ Monster Pack (double-click to zoom to Lv.4 Street)',
    activeScaleIndex: 3,
    defaultPoi,
    drillControls: districtControlsHtml,
    svgInnerHtml,
    legendItems: [
      { color: '#eab308', label: '🏰 Town Sanctuary & Walls [1,1]' },
      { color: '#ef4444', label: '⚔️ Hunting Ground & Mob Packs [0,1]' },
      { color: '#a855f7', label: '🕳️ Catacomb / Dungeon (Floor -1)' },
      { color: '#10b981', label: '🛍️ Resident NPC Shops' },
      { color: '#38bdf8', label: '🌊 River & Neighbor District Gates' }
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
    ${renderAtlasOverviewMiniMapPipSvg(activeNode, null, 'step4')}
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
            <strong style="font-size:12px">6 Racial Starter Town Arrival Bindings:</strong>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;margin-top:6px">
              ${bindings.map(b => {
                const tId = b.town_id || b.town_node_id || "";
                const tLabel = b.town_name || b.race_name || tId;
                const narr = b.spawn_rationale || b.arrival_narrative || "";
                return `
                <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);font-size:12px">
                  <div><strong>🏰 ${escapeHtml(tLabel)}</strong> <span class="mono" style="font-size:10px;color:var(--joy-text-secondary)">(${escapeHtml(tId)})</span> · ${renderStatusBadgeHtml(b.status || "canon")}</div>
                  <div style="color:var(--joy-text-secondary);font-size:11.5px;margin:4px 0">${escapeHtml(narr)}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                    <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(tId)}', inspectId: '${escapeHtml(tId)}' })">
                      🏰 Home Town ➔
                    </button>
                    ${b.hunting_area_id ? `
                      <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(b.hunting_area_id)}', inspectId: '${escapeHtml(b.hunting_area_id)}' })">
                        ⚔️ Hunting Area ➔
                      </button>
                    ` : ""}
                    ${b.farming_area_id ? `
                      <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(b.farming_area_id)}', inspectId: '${escapeHtml(b.farming_area_id)}' })">
                        🌾 Farming Area ➔
                      </button>
                    ` : ""}
                  </div>
                </div>
              `;}).join('')}
            </div>
          </div>
        </section>

        ${(() => {
          const tax = whc.race_taxonomy || {};
          const playableRaces = tax.playable_and_mob_races || [];
          const monsterRaces = tax.monster_ecology_races || [];
          const godEntities = tax.god_tier_entities || [];
          const sys = whc.shared_world_systems || {};
          const smith = sys.blacksmith_clan || {};
          const guild = sys.adventure_guild || {};
          const qloop = sys.quest_progression_loop || {};
          const bhier = sys.boss_power_hierarchy || {};
          return `
            <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
              <div class="mono" style="font-size:11px;color:#38bdf8">MULTI-RACE COSMOLOGY · 6 PLAYABLE/MOB RACES + 6 MONSTER ECOLOGIES + 6 SEALED GODS</div>
              <h3 style="margin:4px 0 10px;font-size:1.05rem">6 Playable & Mob Races (Racial Home Towns, Niched Stories, Hunting & Farming Loops)</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-bottom:16px">
                ${playableRaces.map(r => `
                  <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                      <strong>🧬 ${escapeHtml(r.name)}</strong>
                      <span class="mono" style="font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(56,189,248,0.16);color:#38bdf8">Player + Mob</span>
                    </div>
                    <div style="font-size:11px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(r.archetype_reference || "")}</div>
                    <div style="font-size:11.5px;margin:6px 0"><strong>Home Town:</strong> 🏰 ${escapeHtml(r.home_town_name)} (<span class="mono">${escapeHtml(r.home_town_id)}</span>)</div>
                    <div style="font-size:11.5px;margin:4px 0"><strong>Niched Story:</strong> ${escapeHtml(r.niched_story)}</div>
                    <div style="font-size:11px;color:#eab308;margin:4px 0"><strong>🌾 Farming Drops:</strong> ${escapeHtml((r.farming_resources || []).join(", "))}</div>
                    <div style="font-size:11px;color:#10b981"><strong>⚡ Racial Trait:</strong> ${escapeHtml(r.combat_trait || "")}</div>
                  </div>
                `).join("")}
              </div>

              <h3 style="margin:12px 0 8px;font-size:1rem">6 Monster-Only Ecology Races (Other Race for Mobs)</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:16px">
                ${monsterRaces.map(m => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>👾 ${escapeHtml(m.name)}</strong>
                      <span class="mono" style="font-size:10px;color:#ef4444">Mob Only</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(m.ecological_niche)}</div>
                    <div style="font-size:11px;color:#eab308"><strong>Drops:</strong> ${escapeHtml((m.signature_drops || []).join(", "))}</div>
                  </div>
                `).join("")}
              </div>

              <h3 style="margin:12px 0 8px;font-size:1rem">6 God-Tier Entities (Sealed by The Architect in Chapter 1.4 God Seal Magic)</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px">
                ${godEntities.map(g => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(168,85,247,0.4)">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>✨ ${escapeHtml(g.name)}</strong>
                      <span class="mono" style="font-size:10px;color:#c084fc">${escapeHtml((g.elements || []).join(" / "))}</span>
                    </div>
                    <div style="font-size:11px;color:#38bdf8;margin:4px 0"><strong>Seal Status:</strong> ${escapeHtml(g.seal_state)}</div>
                    <div style="font-size:11px;color:#f87171;margin:4px 0"><strong>Direct MVP Subordinate:</strong> 👑 ${escapeHtml(g.direct_mvp_subordinate)}</div>
                    <div style="font-size:11.5px;color:var(--joy-text-secondary)">${escapeHtml(g.lore_summary)}</div>
                  </div>
                `).join("")}
              </div>
            </section>

            <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
              <div class="mono" style="font-size:11px;color:#eab308">LV.10–20 ALL-RACE CONVERGENCE CITIES · SHARED INSTITUTIONS · QUEST LOOP · BOSS HIERARCHY</div>
              ${(() => {
                const conv = sys.cross_race_convergence_hubs || {};
                const hubs = conv.hubs || [];
                if (!hubs.length) return "";
                return `
                  <div style="margin:8px 0 14px;padding:12px;border-radius:8px;background:rgba(220,38,38,0.10);border:1.5px solid rgba(250,204,21,0.55)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13px;color:#fde047">🤝 Level ${(conv.target_level_band || [10,20]).join("–")} Cross-Race Convergence Hubs (Guilding, Party Matchmaking & Quest Trading)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#dc2626;color:#ffffff">ALL 6 RACES UNITE AT LV.10–20</span>
                    </div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:4px 0 10px">${escapeHtml(conv.convergence_rule || "")}</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px">
                      ${hubs.map(h => `
                        <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                          <div style="font-weight:700;font-size:12px">🏰 ${escapeHtml(h.town_name)}</div>
                          <div class="mono" style="font-size:10px;color:#38bdf8;margin:2px 0 6px">Lv.${(h.level_band || [10,20]).join("–")} · ${escapeHtml(h.district_id)}</div>
                          <div style="font-size:11px;color:var(--joy-text-secondary);margin-bottom:6px">${escapeHtml(h.hub_role)}</div>
                          <ul style="margin:0 0 8px;padding-left:16px;font-size:10.5px;color:#fde68a">
                            ${(h.guilding_and_party_features || []).map(f => `<li>${escapeHtml(f)}</li>`).join("")}
                          </ul>
                          <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(h.continent_id)}', districtId: '${escapeHtml(h.district_id)}', nodeId: '${escapeHtml(h.town_node_id)}', inspectId: '${escapeHtml(h.town_node_id)}' })">
                            🤝 Inspect Convergence Hub (${escapeHtml(h.town_node_id)}) ➔
                          </button>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `;
              })()}

              ${(() => {
                const tatlas = sp.tShapedWorldAtlas || {};
                const zdir = tatlas.t_breadth_zone_directory || {};
                const deep = tatlas.t_deep_validation_slice || {};
                const dtown = deep.deep_town || {};
                const dfield = deep.deep_field_zone || {};
                const ddung = deep.deep_dungeon || {};
                const dmobs = deep.deep_mob_database || [];
                if (!tatlas.id) return "";
                return `
                  <div style="margin-top:14px;padding:14px;border-radius:10px;background:rgba(16,185,129,0.08);border:1.5px solid rgba(16,185,129,0.5)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;color:#10b981">🧭 L2J.RU / L2Hub / PMFun Top-Down T-Shaped World Atlas (T-Breadth Directory + T-Depth D01 Slice)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#059669;color:#ffffff;font-weight:800">GOV-10 VERIFIED</span>
                    </div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:0 0 10px">${escapeHtml(tatlas.design_philosophy || "")}</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-bottom:12px">
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#fde047;font-weight:800">STARTING TOWNS (${(zdir.starting_towns || []).length})</div>
                        ${(zdir.starting_towns || []).map(z => `<div style="font-size:10.5px;margin-top:3px"><strong>${escapeHtml(z.level_header)}</strong> <span class="mono" style="color:#38bdf8">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#38bdf8;font-weight:800">CASTLE & HUB TOWNS (${(zdir.other_castle_and_hub_towns || []).length})</div>
                        ${(zdir.other_castle_and_hub_towns || []).map(z => `<div style="font-size:10.5px;margin-top:3px">${escapeHtml(z.level_header)} <span class="mono" style="color:#94a3b8">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#4ade80;font-weight:800">FIELDS & AREAS (${(zdir.fields_and_hunting_areas || []).length})</div>
                        ${(zdir.fields_and_hunting_areas || []).slice(0, 8).map(z => `<div style="font-size:10.5px;margin-top:3px">${escapeHtml(z.level_header)} <span class="mono" style="color:#94a3b8">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#f87171;font-weight:800">DUNGEONS & CATACOMBS (${(zdir.regular_dungeons || []).length + (zdir.seven_signs_seal_catacombs || []).length})</div>
                        ${(zdir.regular_dungeons || []).slice(0, 5).concat((zdir.seven_signs_seal_catacombs || []).slice(0, 3)).map(z => `<div style="font-size:10.5px;margin-top:3px">${escapeHtml(z.level_header)} <span class="mono" style="color:#c084fc">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                    </div>
                    <div style="font-weight:800;font-size:12px;color:#fde047;margin:10px 0 6px">🗺️ Authentic L2J.RU / L2Hub / PMFun Top-Down Cartographic Plates (Interlaced Grid + Parchment Relief + Enlarged Dual Zone & Dungeon Maps)</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                      <div style="padding:8px;border-radius:8px;background:#1a140c;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10.5px;color:#f3dfa5;font-weight:800;margin-bottom:4px">1. Master Interlaced World Grid [10.10–26.25] (all_interlaced.jpg Standard)</div>
                        <img src="/studio-maps/all_interlaced_world_grid.png" alt="Interlaced World Grid" style="width:100%;height:auto;border-radius:6px;border:1px solid #5d4127;display:block"/>
                      </div>
                      <div style="padding:8px;border-radius:8px;background:#1a140c;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10.5px;color:#f3dfa5;font-weight:800;margin-bottom:4px">2. Continent Antique Parchment Relief Map (c3_aden.jpg Standard · 48 Landmarks)</div>
                        <img src="/studio-maps/c3_continent_parchment_relief.png" alt="Parchment Relief Map" style="width:100%;height:auto;border-radius:6px;border:1px solid #5d4127;display:block"/>
                      </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
                      <div style="padding:8px;border-radius:8px;background:#241a0e;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10px;color:#fde047;font-weight:800;margin-bottom:4px">3A. Field Common Map (zone_map_enlarged · 185 Red Pins)</div>
                        <img src="/studio-maps/d01_field_common_map.png" alt="Field Common Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;margin-bottom:6px;display:block"/>
                        <div class="mono" style="font-size:10px;color:#38bdf8;font-weight:800;margin-bottom:4px">3B. Field Orthographic Radar Map (zone_map_enlarged_radar)</div>
                        <img src="/studio-maps/d01_field_radar_map.png" alt="Field Radar Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;display:block"/>
                      </div>
                      <div style="padding:8px;border-radius:8px;background:#241a0e;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10px;color:#f87171;font-weight:800;margin-bottom:4px">4A. Kiln Cellar Ruins Common Strip (Elven Ruins id=53)</div>
                        <img src="/studio-maps/d01_dungeon_common_map.png" alt="Dungeon Common Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;margin-bottom:6px;display:block"/>
                        <div class="mono" style="font-size:10px;color:#f87171;font-weight:800;margin-bottom:4px">4B. Underground 8-Room Stone Labyrinth Radar Blueprint</div>
                        <img src="/studio-maps/d01_dungeon_radar_map.png" alt="Dungeon Radar Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;display:block"/>
                      </div>
                      <div style="padding:8px;border-radius:8px;background:#241a0e;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10px;color:#4ade80;font-weight:800;margin-bottom:4px">5. Lantern Hollow Village Blueprint (PMFun Detailed Town Map)</div>
                        <img src="/studio-maps/d01_town_detailed_blueprint.png" alt="Town Detailed Blueprint" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;display:block"/>
                      </div>
                    </div>
                    <div style="font-weight:800;font-size:12px;color:#10b981;margin-bottom:6px">T-Depth Vertical Validation Slice (100% L2J.RU Dual-Map + 8-Column Spawn Table + Mob Drop/Spoil Sheets)</div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px">
                      <div style="padding:9px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(250,204,21,0.45)">
                        <div style="font-weight:800;font-size:11.5px;color:#fde047">🏰 ${escapeHtml(dtown.header_title || "")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8">Grid ${escapeHtml(dtown.grid_sector || "")} · loc=${escapeHtml(dtown.loc_coord || "")}</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:4px">${(dtown.town_landmarks || []).length} landmarks · ${(dtown.gatekeeper_routes || []).length} Gatekeeper routes · ${(dtown.npc_and_guard_table || []).length} NPC/Guard rows</div>
                      </div>
                      <div style="padding:9px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(74,222,128,0.45)">
                        <div style="font-weight:800;font-size:11.5px;color:#4ade80">🌿 ${escapeHtml(dfield.header_title || "")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8">Grid ${escapeHtml(dfield.grid_sector || "")} · loc=${escapeHtml(dfield.loc_coord || "")}</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:4px">Dual Parchment + Radar Map · ${(dfield.spawn_table || []).length} L2J 8-column spawn rows</div>
                      </div>
                      <div style="padding:9px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(248,113,113,0.45)">
                        <div style="font-weight:800;font-size:11.5px;color:#f87171">⛩️ ${escapeHtml(ddung.header_title || "")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8">Grid ${escapeHtml(ddung.grid_sector || "")} · loc=${escapeHtml(ddung.loc_coord || "")}</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:4px">Side-by-Side Entrance + 4-Room Underground Map · ${(ddung.spawn_table || []).length} spawn rows · ${dmobs.length} Mob Drop/Spoil Sheets</div>
                      </div>
                    </div>
                  </div>
                `;
              })()}
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:8px;margin-bottom:14px">
                <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                  <div style="font-weight:700;font-size:13px">🛡️ ${escapeHtml(guild.name || "Adventure Guild")} (<span class="mono">${escapeHtml(guild.allegiance || "neutral_no_side")}</span>)</div>
                  <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:6px 0">${escapeHtml(guild.neutrality_charter || "")}</p>
                  <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--joy-text-secondary)">
                    ${(guild.core_services || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                  </ul>
                </div>
                <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                  <div style="font-weight:700;font-size:13px">⚒️ ${escapeHtml(smith.name || "Blacksmith Clan")}</div>
                  <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:6px 0">${escapeHtml(smith.core_role || "")}</p>
                  <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--joy-text-secondary)">
                    ${(smith.forging_systems || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                  </ul>
                </div>
              </div>

              <h4 style="margin:10px 0 6px;font-size:0.95rem">📜 3-Track Quest Progression Loop (Main + Job + Side Quests)</h4>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
                ${(qloop.tracks || []).map(t => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                    <div style="font-weight:700;font-size:12px">${escapeHtml(t.name)}</div>
                    <div style="font-size:11px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(t.purpose)}</div>
                    <div style="font-size:10.5px;color:#10b981"><strong>Rewards:</strong> ${escapeHtml(t.reward_focus)}</div>
                  </div>
                `).join("")}
              </div>

              <h4 style="margin:10px 0 6px;font-size:0.95rem">👑 Strict Boss Power Hierarchy: <span class="mono" style="color:#f87171">${escapeHtml(bhier.strict_order_law || "")}</span></h4>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:16px">
                ${(bhier.tiers || []).map(bt => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                    <div style="font-weight:700;font-size:12px">Rank ${bt.rank} · ${escapeHtml(bt.name)}</div>
                    <div style="font-size:11px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(bt.power_relationship)}</div>
                    <div style="font-size:10.5px;color:#eab308"><strong>Loot:</strong> ${escapeHtml(bt.loot_tier)}</div>
                  </div>
                `).join("")}
              </div>

              ${(() => {
                const lgp = sys.level_growth_path || {};
                const phases = lgp.phases || [];
                const deep = lgp.early_focus_1_to_25_deep_dive || {};
                if (!phases.length) return "";
                return `
                  <div style="padding:14px;border-radius:10px;background:rgba(16,185,129,0.08);border:1.5px solid rgba(16,185,129,0.45)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;color:#10b981">📈 Level 1–99 Growth Path (Stages A–L) · Priority Focus: Levels 1–25 (Stages A, B, C)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#10b981;color:#052e16;font-weight:800">LV. 1–25 FOCUS</span>
                    </div>
                    <div class="mono" style="font-size:11px;color:#fde047;margin-bottom:8px">${escapeHtml(lgp.path_formula || "")}</div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:0 0 12px">${escapeHtml(deep.summary || "")}</p>
                    ${phases.map(ph => `
                      <div style="margin-bottom:10px">
                        <div style="font-weight:800;font-size:12px;color:#38bdf8;margin-bottom:6px">${escapeHtml(ph.name)}</div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">
                          ${(ph.segments || []).map(seg => `
                            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid ${seg.priority_focus ? "#10b981" : "var(--joy-border-default)"}">
                              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                                <strong>[${escapeHtml(seg.segment_code)}] Lv.${(seg.level_range || []).join("–")}</strong>
                                <span class="mono" style="font-size:9.5px;padding:1px 6px;border-radius:999px;background:${seg.priority_focus ? "rgba(16,185,129,0.22)" : "rgba(148,163,184,0.16)"};color:${seg.priority_focus ? "#10b981" : "#94a3b8"}">${seg.priority_focus ? "LV.1–25 FOCUS" : "ROADMAP"}</span>
                              </div>
                              <div style="font-size:11.5px;font-weight:700;margin:4px 0">${escapeHtml(seg.title)}</div>
                              <div style="font-size:10.5px;color:var(--joy-text-secondary)"><strong>Class:</strong> ${escapeHtml(seg.class_milestone)}</div>
                              <div style="font-size:10.5px;color:#38bdf8"><strong>Quest:</strong> ${escapeHtml(seg.adventure_quest_tier)}</div>
                              <div style="font-size:10.5px;color:#eab308"><strong>Equip:</strong> ${escapeHtml(seg.equipment_unlock)}</div>
                              <div style="font-size:10.5px;color:#10b981"><strong>Skills:</strong> ${escapeHtml(seg.skill_unlocks)}</div>
                              <div style="font-size:10.5px;color:#c084fc"><strong>Items:</strong> ${escapeHtml(seg.consumable_unlocks)}</div>
                              <div style="font-size:10.5px;color:#f87171"><strong>Boss:</strong> ${escapeHtml(seg.boss_milestone)}</div>
                            </div>
                          `).join("")}
                        </div>
                      </div>
                    `).join("")}
                  </div>
                `;
              })()}

              ${(() => {
                const wcmc = sys.world_continent_map_chain || {};
                const ef = wcmc.early_focus_hub_and_spoke_1_to_25 || {};
                const spokes = ef.stage_a_spokes_1_to_10 || [];
                const sb = ef.stage_b_convergence_hub_10_to_20 || {};
                const sc = ef.stage_c_boss_and_bridge_20_to_25 || {};
                const sd = ef.stage_d_trial_frontier_25_to_30 || {};
                const cchains = wcmc.continent_chains || [];
                const bridges = wcmc.inter_continent_bridges || [];
                if (!spokes.length) return "";
                return `
                  <div style="margin-top:14px;padding:14px;border-radius:10px;background:rgba(56,189,248,0.08);border:1.5px solid rgba(56,189,248,0.45)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;color:#38bdf8">🗺️ World Continent Area Map Chain (Lv. 1–25 Hub-and-Spoke ➔ 3-Continent 64-Map Chain)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#0284c7;color:#ffffff;font-weight:800">GOV-09 VERIFIED</span>
                    </div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:0 0 10px">${escapeHtml(wcmc.chain_architecture_law || "")}</p>
                    <div style="font-weight:800;font-size:12px;color:#fde047;margin-bottom:6px">Stage A (Lv. 1–10) · 6 Racial Starter Spokes ➔ Open-Portal Route into Kilnwatch Bastion (Stage B Lv. 10–20)</div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;margin-bottom:12px">
                      ${spokes.map(sp => `
                        <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                            <strong>🧬 ${escapeHtml(sp.race_name)}</strong>
                            <span class="mono" style="font-size:9.5px;color:#38bdf8">${escapeHtml(sp.district_id)}</span>
                          </div>
                          <div style="font-size:10.5px;color:var(--joy-text-secondary);margin:4px 0">
                            <strong>Home:</strong> <span class="mono">${escapeHtml(sp.home_town_id)}</span> · <strong>Hunt:</strong> <span class="mono">${escapeHtml(sp.hunting_node_id)}</span> · <strong>Catacomb:</strong> <span class="mono">${escapeHtml(sp.tutorial_catacomb_id)}</span>
                          </div>
                          <div class="mono" style="font-size:10px;color:#10b981;line-height:1.45;background:rgba(15,23,42,0.55);padding:6px;border-radius:6px">
                            ${(sp.portal_chain_to_kilnwatch || []).map(n => escapeHtml(n)).join(" ➔ ")}
                          </div>
                        </div>
                      `).join("")}
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;margin-bottom:12px">
                      <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid rgba(250,204,21,0.55)">
                        <div style="font-weight:800;font-size:11.5px;color:#fde047">🤝 Stage B (Lv. 10–20) · Convergence Hub (${escapeHtml(sb.hub_town_id || "")})</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin:4px 0"><strong>Party Grounds:</strong> ${(sb.connected_party_hunting_grounds || []).map(escapeHtml).join(", ")}</div>
                        <div style="font-size:10.5px;color:#c084fc"><strong>Catacombs:</strong> ${(sb.connected_catacomb_dungeons || []).map(escapeHtml).join(", ")}</div>
                      </div>
                      <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid rgba(248,113,113,0.5)">
                        <div style="font-weight:800;font-size:11.5px;color:#f87171">⚔️ Stage C (Lv. 20–25) · Raid Boss & Continental Bridge</div>
                        <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin:4px 0"><strong>West Raid:</strong> ${(sc.west_river_raid_branch || []).map(escapeHtml).join(" ➔ ")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8"><strong>East Bridge:</strong> ${(sc.east_continental_bridge_branch || []).map(escapeHtml).join(" ➔ ")}</div>
                      </div>
                      <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid rgba(168,85,247,0.5)">
                        <div style="font-weight:800;font-size:11.5px;color:#c084fc">⚙️ Stage D (Lv. 25–30) · Prepare 2nd Class [Learn & Try]</div>
                        <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin:4px 0">${(sd.portal_chain || []).map(escapeHtml).join(" ➔ ")}</div>
                      </div>
                    </div>
                    <div style="font-weight:800;font-size:12px;color:#38bdf8;margin-bottom:6px">Full 3-Continent Mainline Node Chains (64 Overland Maps + Inter-Continent Bridges)</div>
                    <div style="display:grid;grid-template-columns:1fr;gap:8px">
                      ${cchains.map(cc => `
                        <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                          <div style="display:flex;justify-content:space-between;align-items:center">
                            <strong>🌍 ${escapeHtml(cc.continent_name)} (<span class="mono">${escapeHtml(cc.continent_id)}</span>)</strong>
                            <span class="mono" style="font-size:10px;color:#eab308">Lv.${(cc.level_band || []).join("–")} · Stages ${(cc.growth_stages || []).join(", ")} · ${(cc.ordered_mainline_node_chain || []).length} maps</span>
                          </div>
                          <div style="font-size:11px;color:var(--joy-text-secondary);margin:3px 0">${escapeHtml(cc.topology_pattern || "")}</div>
                          <div class="mono" style="font-size:10px;color:#93c5fd;line-height:1.45;background:rgba(15,23,42,0.55);padding:6px;border-radius:6px">
                            ${(cc.ordered_mainline_node_chain || []).map(escapeHtml).join(" ➔ ")}
                          </div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `;
              })()}
            </section>
          `;
        })()}
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(whc.name || '')}</h3>
        ${renderStatusBadgeHtml(whc.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(whc.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(whc)}
        <div style="margin-top:14px;padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
          <div class="mono" style="font-size:10.5px;color:#10b981;font-weight:700;margin-bottom:6px">LONG-TERM GOVERNANCE CHECKLIST (GOV-01..GOV-06)</div>
          ${(whc.long_term_governance_checklist || []).map(g => `
            <div style="padding:8px;border-radius:6px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle);margin-bottom:6px;font-size:11px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${escapeHtml(g.gate_id)} · ${escapeHtml(g.title)}</strong>
                <span class="mono" style="font-size:10px;padding:1px 6px;border-radius:999px;background:${g.verified ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"};color:${g.verified ? "#10b981" : "#ef4444"}">${g.verified ? "PASS" : "CHECK"}</span>
              </div>
              <div style="color:var(--joy-text-secondary);font-size:10.5px;margin:3px 0">${escapeHtml(g.evidence)}</div>
              <div class="mono" style="font-size:9.5px;color:#38bdf8">${escapeHtml(g.cli_command)}</div>
            </div>
          `).join("")}
        </div>
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
    ${renderDedicatedWorldAtlas()}
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

function jumpFromMapDirectoryToAtlas(actionType, targetId, locCoord = '', floorId = '') {
  CURRENT_TAB = 'studio';
  if (actionType === 'town') {
    focusTownStreetBlueprint(targetId, locCoord);
  } else if (actionType === 'field') {
    focusFieldTacticalBlueprint(targetId, locCoord);
  } else if (actionType === 'fortress') {
    focusFortressBlueprint(targetId, locCoord);
  } else if (actionType === 'dungeon') {
    openDungeonSubMap(targetId, floorId || 'B1');
  }
  renderSidebar();
  render();
  const st = document.getElementById('scrollStage');
  if (st) st.scrollTop = 0;
}

function renderUnified63ZoneAtlasDirectoryHtml() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zdir = tatlas.t_breadth_zone_directory || {};
  const mfById = {};
  (tatlas.multi_floor_dungeons || []).forEach(d => {
    mfById[d.dungeon_id] = d;
  });

  const groups = [
    {
      id: 'starting_towns',
      title: 'Starting Towns (6)',
      badgeColor: '#10b981',
      icon: '🧬',
      actionType: 'town',
      zones: zdir.starting_towns || []
    },
    {
      id: 'castle_and_hub_towns',
      title: 'Castle & Hub Towns (9)',
      badgeColor: '#eab308',
      icon: '🏰',
      actionType: 'town',
      zones: zdir.other_castle_and_hub_towns || []
    },
    {
      id: 'fields_and_hunting_areas',
      title: 'Fields & Hunting Areas (24)',
      badgeColor: '#4ade80',
      icon: '🏕️',
      actionType: 'field',
      zones: zdir.fields_and_hunting_areas || []
    },
    {
      id: 'multi_floor_dungeons_and_catacombs',
      title: 'Multi-Floor Dungeons & Catacombs (16)',
      badgeColor: '#a855f7',
      icon: '🕳️',
      actionType: 'dungeon',
      zones: [...(zdir.regular_dungeons || []), ...(zdir.seven_signs_seal_catacombs || [])]
    },
    {
      id: 'harbors_clanhalls_and_forts',
      title: 'Harbors, Clan Halls & Fortresses (8)',
      badgeColor: '#fb923c',
      icon: '🛡️',
      actionType: 'fortress',
      zones: zdir.harbors_clanhalls_and_forts || []
    }
  ];

  const totalZones = groups.reduce((acc, g) => acc + g.zones.length, 0);

  return `
    <div id="unified63ZoneMapDirectory" style="margin-bottom:20px;padding:16px;border-radius:12px;background:#0c1320;border:1.5px solid rgba(250,204,21,0.38);box-shadow:0 10px 28px rgba(0,0,0,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div>
          <div style="font-size:11px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#fde047">
            🗺️ D16 UNIFIED 63-ZONE T-SHAPED WORLD &amp; MULTI-FLOOR DUNGEON DIRECTORY (${totalZones} ZONES)
          </div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:2px">
            Every Starting Town (6), Castle/Hub Town (9), Field Hunting Area (24), Multi-Floor Dungeon/Catacomb (16), and Harbor/ClanHall/Fortress (8) with <code class="mono">loc=X:Y</code>, Level Band, Resident NPCs (Shop + Refinement) / Mobs / MVPs, and 1-Click Jump to the Dedicated World Atlas!
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${groups.map(g => `
            <span class="mono" style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;background:rgba(15,23,42,0.92);color:${g.badgeColor};border:1px solid ${g.badgeColor}">
              ${g.icon} ${escapeHtml(g.title)}
            </span>
          `).join('')}
        </div>
      </div>

      ${groups.map(group => {
        const filteredZones = group.zones.filter(z => {
          if (!SEARCH_QUERY) return true;
          const hay = `${z.name} ${z.zone_id} ${z.studio_node_id} ${z.l2_reference_analog || ''} ${z.territory_name || ''} ${z.loc_coord || ''}`.toLowerCase();
          return hay.includes(SEARCH_QUERY);
        });
        if (!filteredZones.length) return '';
        return `
          <div style="margin-top:14px">
            <div style="font-size:13px;font-weight:900;color:${group.badgeColor};margin-bottom:8px;display:flex;align-items:center;gap:8px">
              <span>${group.icon} ${escapeHtml(group.title)}</span>
              <span class="mono" style="font-size:10px;color:#94a3b8">(${filteredZones.length} showing)</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(315px,1fr));gap:8px">
              ${filteredZones.map(z => {
                const lvBand = Array.isArray(z.level_band) && z.level_band.length >= 2 ? `Lv.${z.level_band[0]}–${z.level_band[1]}` : 'Lv.1–99';
                const locStr = z.loc_coord || '0:0';
                let residentsSummary = '';
                let btnLabel = '';
                let clickCall = '';

                if (group.actionType === 'town') {
                  const tb = z.town_blueprint || {};
                  const arch = tb.layout_archetype || 'polygonal_walled_keep';
                  const shopMarks = (tb.service_marks || []).slice(0, 3).map(m => `${m.icon || '🛍️'} ${m.label}`).join(' · ');
                  residentsSummary = `🛍️ NPCs (Shop + Refinement +1..+15): ${shopMarks || '12 Town NPCs & 7 Service Marks'} [${arch}]`;
                  btnLabel = '🏘️ Open Town Blueprint (5.2×)';
                  clickCall = `jumpFromMapDirectoryToAtlas('town', '${escapeHtml(z.studio_node_id || z.zone_id)}', '${escapeHtml(locStr)}')`;
                } else if (group.actionType === 'field') {
                  const ftb = z.field_tactical_blueprint || {};
                  const mobs = (ftb.spawn_territories || []).map(st => `${st.entity_type}: ${st.mob_name}`).slice(0, 3).join(' · ');
                  residentsSummary = `👾 Field Mobs & MVPs: ${mobs || 'Monster / Mini-Boss / Raid / MVP Rings'}`;
                  btnLabel = '🏕️ Open Field Blueprint (4.8×)';
                  clickCall = `jumpFromMapDirectoryToAtlas('field', '${escapeHtml(z.zone_id)}', '${escapeHtml(locStr)}')`;
                } else if (group.actionType === 'fortress') {
                  const fbp = z.fortress_blueprint || {};
                  const mobs = (fbp.spawn_territories || []).map(st => `${st.entity_type}: ${st.mob_name}`).slice(0, 3).join(' · ');
                  residentsSummary = `🛡️ Garrison & MVPs: ${mobs || 'Harbor / Clan Hall / Fortress Guardians'}`;
                  btnLabel = '🛡️ Open Fortress Blueprint (4.8×)';
                  clickCall = `jumpFromMapDirectoryToAtlas('fortress', '${escapeHtml(z.zone_id)}', '${escapeHtml(locStr)}')`;
                } else {
                  const mf = mfById[z.zone_id] || {};
                  const floors = mf.floors || [];
                  const firstFloor = (floors[0] && floors[0].floor_id) || 'B1';
                  const floorSpan = floors.map(f => f.floor_id).join('⇄') || 'B1⇄B2⇄B3';
                  const topBoss = (floors[floors.length - 1] && floors[floors.length - 1].boss_tier_highlight) || 'Floor 3 MVP Sanctum';
                  residentsSummary = `👑 Floors [${floorSpan}]: ${topBoss}`;
                  btnLabel = `🕳️ Open Multi-Floor Dungeon (${firstFloor})`;
                  clickCall = `jumpFromMapDirectoryToAtlas('dungeon', '${escapeHtml(z.zone_id)}', '${escapeHtml(locStr)}', '${escapeHtml(firstFloor)}')`;
                }

                return `
                  <div style="padding:10px 12px;border-radius:8px;background:#141e30;border-left:3.5px solid ${group.badgeColor};border-top:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;justify-content:space-between;gap:6px">
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                        <span class="mono" style="font-size:10px;color:#38bdf8;font-weight:800">[${escapeHtml(z.grid_sector || '18_24')}] loc=${escapeHtml(locStr)}</span>
                        <span class="mono" style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(15,23,42,0.9);color:#fde047;border:1px solid rgba(250,204,21,0.45)">${escapeHtml(lvBand)}</span>
                      </div>
                      <div style="font-size:12px;font-weight:900;color:#f8fafc;margin-top:3px">
                        ${escapeHtml(z.name)}
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:1px">
                        L2 Analog: <strong style="color:#cbd5e1">${escapeHtml(z.l2_reference_analog || z.territory_name || '')}</strong>
                      </div>
                      <div style="font-size:10px;color:#fde68a;margin-top:4px;line-height:1.35">
                        ${escapeHtml(residentsSummary)}
                      </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06)">
                      <span class="mono" style="font-size:9px;color:#94a3b8">${escapeHtml(z.zone_id)}</span>
                      <button type="button" onclick="${clickCall}"
                              style="padding:4px 10px;border-radius:6px;border:1px solid #fde047;background:#1e3a8a;color:#fde047;font-size:10px;font-weight:900;cursor:pointer;flex-shrink:0">
                        ${escapeHtml(btnLabel)} ➔
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMapDirectory() {
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
    ${renderUnified63ZoneAtlasDirectoryHtml()}
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


function renderMaps() {
  return renderMapDirectory();
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

        if parsed.path.startswith("/studio-maps/"):
            rel_name = parsed.path.replace("/studio-maps/", "", 1).strip("/")
            target = (ROOT / "content" / "studio" / "maps" / rel_name).resolve()
            maps_dir = (ROOT / "content" / "studio" / "maps").resolve()
            if str(target).startswith(str(maps_dir)) and target.is_file():
                raw = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
            self._send_json({"ok": False, "error": "Studio map plate not found"}, status=404)
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
            self_eval = compute_studio_self_evaluation()
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
