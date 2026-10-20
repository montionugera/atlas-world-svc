#!/usr/bin/env python3
"""Long-Term World Content Governance, Checklist Validator & Scaffolding CLI.

Enforces the 9 Long-Term World Studio Governance Gates (GOV-01..GOV-09):
  - GOV-01: 6 Playable/Mob Races (human_demi_human, lunar, ogre_orc, dark_lunar,
            dwarf, furral) bound to canon Home Towns + open portals to adjacent
            Hunting & Farming areas.
  - GOV-02: 6 Monster-Only Ecology Races (beast_animal_brute, robotic, undead,
            fish, insect_arachnia, plant) with crafting drops & continent habitats.
  - GOV-03: 4-Chapter Canonical History (1.1 Creation, 1.2 Age Of The Gods,
            1.3 The God Wars, 1.4 God Seal Magic) & 6 God-Tier Entities sealed
            by The Architect (Angel, Demon, Legendary Beast, Leviathan,
            Legendary Dragon [Earth, Fire, Thunder], The Architect).
  - GOV-04: Shared Neutral Adventure Guild ('neutral_no_side') & Blacksmith Clan.
  - GOV-05: 3-Track Quest Loop (main_quest, job_quest, side_quest).
  - GOV-06: Strict Boss Hierarchy (GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB).
  - GOV-07: Level 10-20 Cross-Race Guild & Party Convergence Hub + Open-Portal Reachability.
  - GOV-08: Level 1-99 Growth Path (Stages A..L) with Lv.1-25 Early Focus (A, B, C + D bridge).
  - GOV-09: World Continent Area Map Chain (Lv.1-25 Hub-and-Spoke + 3-Continent 64-Map Portal Chain).

Also provides deterministic scaffolding generators (--scaffold-quest, --scaffold-boss)
for long-term content authoring.
"""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STUDIO_DIR = REPO_ROOT / "content" / "studio"

REQUIRED_PLAYABLE_RACES = (
    "human_demi_human",
    "lunar",
    "ogre_orc",
    "dark_lunar",
    "dwarf",
    "furral",
)

REQUIRED_MONSTER_RACES = (
    "beast_animal_brute",
    "robotic",
    "undead",
    "fish",
    "insect_arachnia",
    "plant",
)

REQUIRED_GOD_ENTITIES = (
    "angel",
    "demon",
    "legendary_beast",
    "leviathan",
    "legendary_dragon",
    "the_architect",
)

REQUIRED_HISTORY_CHAPTERS = ("1.1", "1.2", "1.3", "1.4")
REQUIRED_QUEST_TRACKS = ("main_quest", "job_quest", "side_quest")
REQUIRED_BOSS_LAW = "GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB"


def _load_nodes_by_id(studio_dir: Path) -> dict[str, dict[str, Any]]:
    nodes: dict[str, dict[str, Any]] = {}
    nodes_dir = studio_dir / "nodes"
    if not nodes_dir.exists():
        return nodes
    for path in sorted(nodes_dir.rglob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(doc, dict) and doc.get("id"):
                nodes[str(doc["id"])] = doc
        except Exception:
            continue
    return nodes


def _load_continents_by_id(studio_dir: Path) -> dict[str, dict[str, Any]]:
    continents: dict[str, dict[str, Any]] = {}
    cont_dir = studio_dir / "continents"
    if not cont_dir.exists():
        return continents
    for path in sorted(cont_dir.glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(doc, dict) and doc.get("id"):
                continents[str(doc["id"])] = doc
        except Exception:
            continue
    return continents


def _has_open_portal(nodes_by_id: dict[str, dict[str, Any]], src_id: str, dst_id: str) -> bool:
    node = nodes_by_id.get(src_id)
    if not node:
        return False
    for p_obj in (node.get("portals") or {}).values():
        if isinstance(p_obj, dict) and p_obj.get("gate_state") == "open" and p_obj.get("target_node_id") == dst_id:
            return True
    return False


def _resolve_schema_ref(ref: str, root_schema: dict[str, Any]) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise ValueError(f"Unsupported $ref '{ref}'")
    curr: Any = root_schema
    for part in ref[2:].split("/"):
        curr = curr[part]
    return curr


def _validate_json_schema_stdlib(
    instance: Any,
    schema: dict[str, Any],
    root_schema: dict[str, Any],
    path: str = "$",
) -> list[str]:
    """Recursive stdlib validator for JSON Schema draft 2020-12 subset ($ref, type, required, additionalProperties, enum, const, minItems/maxItems, minimum/maximum)."""
    errs: list[str] = []
    if "$ref" in schema:
        target = _resolve_schema_ref(str(schema["$ref"]), root_schema)
        return _validate_json_schema_stdlib(instance, target, root_schema, path)

    expected_type = schema.get("type")
    if expected_type == "object":
        if not isinstance(instance, dict):
            return [f"GOV-10 schema violation at {path}: expected object, got {type(instance).__name__}"]
        req_keys = schema.get("required") or []
        for rk in req_keys:
            if rk not in instance:
                errs.append(f"GOV-10 schema violation at {path}: missing required key '{rk}'")
        props = schema.get("properties") or {}
        if schema.get("additionalProperties") is False:
            for k in instance.keys():
                if k not in props:
                    errs.append(f"GOV-10 schema violation at {path}: unexpected additional property '{k}'")
        for k, v in instance.items():
            if k in props:
                errs.extend(_validate_json_schema_stdlib(v, props[k], root_schema, f"{path}.{k}"))
    elif expected_type == "array":
        if not isinstance(instance, list):
            return [f"GOV-10 schema violation at {path}: expected array, got {type(instance).__name__}"]
        min_items = schema.get("minItems")
        max_items = schema.get("maxItems")
        if min_items is not None and len(instance) < int(min_items):
            errs.append(f"GOV-10 schema violation at {path}: array length {len(instance)} < minItems {min_items}")
        if max_items is not None and len(instance) > int(max_items):
            errs.append(f"GOV-10 schema violation at {path}: array length {len(instance)} > maxItems {max_items}")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for idx, item in enumerate(instance):
                errs.extend(_validate_json_schema_stdlib(item, item_schema, root_schema, f"{path}[{idx}]"))
    elif expected_type == "string":
        if not isinstance(instance, str):
            return [f"GOV-10 schema violation at {path}: expected string, got {type(instance).__name__}"]
        if "const" in schema and instance != schema["const"]:
            errs.append(f"GOV-10 schema violation at {path}: expected const '{schema['const']}', got '{instance}'")
        if "enum" in schema and instance not in schema["enum"]:
            errs.append(f"GOV-10 schema violation at {path}: value '{instance}' not in enum {schema['enum']}")
        if "minLength" in schema and len(instance) < int(schema["minLength"]):
            errs.append(f"GOV-10 schema violation at {path}: string length {len(instance)} < minLength {schema['minLength']}")
    elif expected_type == "integer":
        if isinstance(instance, bool) or not isinstance(instance, int):
            return [f"GOV-10 schema violation at {path}: expected integer, got {type(instance).__name__}"]
        if "minimum" in schema and instance < int(schema["minimum"]):
            errs.append(f"GOV-10 schema violation at {path}: {instance} < minimum {schema['minimum']}")
        if "maximum" in schema and instance > int(schema["maximum"]):
            errs.append(f"GOV-10 schema violation at {path}: {instance} > maximum {schema['maximum']}")
    elif expected_type == "number":
        if isinstance(instance, bool) or not isinstance(instance, (int, float)):
            return [f"GOV-10 schema violation at {path}: expected number, got {type(instance).__name__}"]
        if "minimum" in schema and float(instance) < float(schema["minimum"]):
            errs.append(f"GOV-10 schema violation at {path}: {instance} < minimum {schema['minimum']}")
        if "maximum" in schema and float(instance) > float(schema["maximum"]):
            errs.append(f"GOV-10 schema violation at {path}: {instance} > maximum {schema['maximum']}")

    return errs


def validate_world_governance(
    studio_dir: Path = DEFAULT_STUDIO_DIR,
) -> tuple[list[str], dict[str, Any]]:
    """Validate GOV-01..GOV-09 on world_history_and_concept.json and return (errors, report)."""
    errors: list[str] = []
    whc_path = studio_dir / "world_history_and_concept.json"
    if not whc_path.exists():
        return [f"Missing {whc_path}"], {}

    whc = json.loads(whc_path.read_text(encoding="utf-8"))
    nodes_by_id = _load_nodes_by_id(studio_dir)
    continents_by_id = _load_continents_by_id(studio_dir)
    primordial_gods_by_id = {
        g.get("id"): g for g in (whc.get("primordial_gods") or []) if isinstance(g, dict)
    }

    taxonomy = whc.get("race_taxonomy")
    if not isinstance(taxonomy, dict):
        errors.append("GOV-01/GOV-02 violation: missing 'race_taxonomy' object in world_history_and_concept.json")
        taxonomy = {}

    # GOV-01: 6 Playable/Mob Races + Home Town + Hunting + Farming Portal Reachability
    playable_list = taxonomy.get("playable_and_mob_races") or []
    playable_by_key: dict[str, dict[str, Any]] = {}
    for entry in playable_list:
        if not isinstance(entry, dict):
            continue
        rkey = str(entry.get("race_key", ""))
        playable_by_key[rkey] = entry
        if entry.get("can_be_player") is not True or entry.get("can_be_mob") is not True:
            errors.append(
                f"GOV-01 violation: Playable race '{rkey}' must have can_be_player=true and can_be_mob=true"
            )
        town_id = str(entry.get("home_town_id", ""))
        hunt_id = str(entry.get("hunting_area_id", ""))
        farm_id = str(entry.get("farming_area_id", ""))
        cont_id = str(entry.get("continent_id", ""))
        dist_id = str(entry.get("district_id", ""))

        if cont_id not in continents_by_id:
            errors.append(f"GOV-01 violation: Race '{rkey}' references unknown continent '{cont_id}'")

        town_node = nodes_by_id.get(town_id)
        if not town_node or town_node.get("node_type") != "town" or town_node.get("status") != "canon":
            errors.append(
                f"GOV-01 violation: Race '{rkey}' home_town_id '{town_id}' must be an existing canon town node"
            )
        else:
            if town_node.get("parent_district_id") != dist_id:
                errors.append(
                    f"GOV-01 violation: Race '{rkey}' home town '{town_id}' district '{town_node.get('parent_district_id')}' != '{dist_id}'"
                )
            town_portal_targets = {
                p.get("target_node_id")
                for p in (town_node.get("portals") or {}).values()
                if isinstance(p, dict) and p.get("gate_state") == "open"
            }
            for area_label, area_id in (("hunting_area_id", hunt_id), ("farming_area_id", farm_id)):
                area_node = nodes_by_id.get(area_id)
                if not area_node or area_node.get("status") != "canon":
                    errors.append(
                        f"GOV-01 violation: Race '{rkey}' {area_label} '{area_id}' must be an existing canon node"
                    )
                elif area_id not in town_portal_targets:
                    errors.append(
                        f"GOV-01 violation: Race '{rkey}' {area_label} '{area_id}' is not directly connected via an open portal from home town '{town_id}'"
                    )

    missing_playable = [rk for rk in REQUIRED_PLAYABLE_RACES if rk not in playable_by_key]
    if missing_playable:
        errors.append(f"GOV-01 violation: Missing required playable/mob races: {missing_playable}")

    # Verify starter_town_bindings cover all 6 playable races
    bindings = whc.get("starter_town_bindings") or []
    bound_race_ids = {b.get("race_id") for b in bindings if isinstance(b, dict) and b.get("race_id")}
    for rkey, entry in playable_by_key.items():
        if entry.get("id") not in bound_race_ids:
            errors.append(
                f"GOV-01 violation: Playable race '{rkey}' ({entry.get('id')}) is missing from starter_town_bindings"
            )

    # GOV-02: 6 Monster-Only Ecology Races
    monster_list = taxonomy.get("monster_ecology_races") or []
    monster_by_key: dict[str, dict[str, Any]] = {}
    for entry in monster_list:
        if not isinstance(entry, dict):
            continue
        mkey = str(entry.get("race_key", ""))
        monster_by_key[mkey] = entry
        if entry.get("can_be_player") is not False or entry.get("can_be_mob") is not True:
            errors.append(
                f"GOV-02 violation: Monster ecology race '{mkey}' must have can_be_player=false and can_be_mob=true"
            )
        drops = entry.get("signature_drops") or []
        if not isinstance(drops, list) or len(drops) < 2:
            errors.append(f"GOV-02 violation: Monster ecology race '{mkey}' must define >= 2 signature_drops")
        for cid in entry.get("primary_continents") or []:
            if cid not in continents_by_id:
                errors.append(
                    f"GOV-02 violation: Monster ecology race '{mkey}' references unknown continent '{cid}'"
                )

    missing_monster = [mk for mk in REQUIRED_MONSTER_RACES if mk not in monster_by_key]
    if missing_monster:
        errors.append(f"GOV-02 violation: Missing required monster ecology races: {missing_monster}")

    # GOV-03: 4-Chapter History (1.1..1.4) & 6 God-Tier Entities Sealed by The Architect
    epochs = whc.get("historical_epochs") or []
    chapters_found = [str(ep.get("chapter_code", "")) for ep in epochs if isinstance(ep, dict)]
    if tuple(chapters_found[:4]) != REQUIRED_HISTORY_CHAPTERS:
        errors.append(
            f"GOV-03 violation: historical_epochs must begin with chapters {list(REQUIRED_HISTORY_CHAPTERS)}, got {chapters_found}"
        )

    god_entities = taxonomy.get("god_tier_entities") or []
    god_entities_by_key: dict[str, dict[str, Any]] = {}
    for g_ent in god_entities:
        if not isinstance(g_ent, dict):
            continue
        ekey = str(g_ent.get("entity_key", ""))
        gid = str(g_ent.get("id", ""))
        god_entities_by_key[ekey] = g_ent
        if gid not in primordial_gods_by_id:
            errors.append(
                f"GOV-03 violation: god_tier_entities '{gid}' must also exist in primordial_gods"
            )
        if ekey == "the_architect":
            if g_ent.get("seal_state") != "wielder_of_god_seal_magic":
                errors.append(
                    "GOV-03 violation: 'the_architect' must have seal_state='wielder_of_god_seal_magic'"
                )
        else:
            if g_ent.get("seal_state") != "sealed_by_god_seal_magic":
                errors.append(
                    f"GOV-03 violation: God entity '{ekey}' must have seal_state='sealed_by_god_seal_magic'"
                )
            if g_ent.get("sealed_by") != "god-the-architect":
                errors.append(
                    f"GOV-03 violation: God entity '{ekey}' must be sealed_by='god-the-architect'"
                )
        if ekey == "legendary_dragon":
            elems = {str(e).lower() for e in (g_ent.get("elements") or [])}
            for req_elem in ("earth", "fire", "thunder"):
                if req_elem not in elems:
                    errors.append(
                        f"GOV-03 violation: 'legendary_dragon' must include element '{req_elem}' (Earth, Fire, Thunder)"
                    )

    missing_gods = [gk for gk in REQUIRED_GOD_ENTITIES if gk not in god_entities_by_key]
    if missing_gods:
        errors.append(f"GOV-03 violation: Missing required god_tier_entities: {missing_gods}")

    # GOV-04: Shared World Systems — Neutral Adventure Guild & Blacksmith Clan
    systems = whc.get("shared_world_systems")
    if not isinstance(systems, dict):
        errors.append("GOV-04/GOV-05/GOV-06 violation: missing 'shared_world_systems' object")
        systems = {}

    guild = systems.get("adventure_guild") or {}
    if guild.get("id") != "faction-adventure-guild" or guild.get("allegiance") != "neutral_no_side":
        errors.append(
            "GOV-04 violation: shared_world_systems.adventure_guild must have id='faction-adventure-guild' and allegiance='neutral_no_side'"
        )
    smith = systems.get("blacksmith_clan") or {}
    if smith.get("id") != "faction-blacksmith-clan" or len(smith.get("forging_systems") or []) < 3:
        errors.append(
            "GOV-04 violation: shared_world_systems.blacksmith_clan must have id='faction-blacksmith-clan' and >= 3 forging_systems"
        )

    # GOV-05: 3-Track Quest Progression Loop (Main, Job, Side)
    qloop = systems.get("quest_progression_loop") or {}
    tracks = qloop.get("tracks") or []
    track_keys = [t.get("track_key") for t in tracks if isinstance(t, dict)]
    for rk in REQUIRED_QUEST_TRACKS:
        if rk not in track_keys:
            errors.append(f"GOV-05 violation: quest_progression_loop missing required track '{rk}'")

    # GOV-06: Strict Boss Hierarchy (GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB)
    bhier = systems.get("boss_power_hierarchy") or {}
    if bhier.get("strict_order_law") != REQUIRED_BOSS_LAW:
        errors.append(
            f"GOV-06 violation: boss_power_hierarchy.strict_order_law must be '{REQUIRED_BOSS_LAW}'"
        )
    tiers = bhier.get("tiers") or []
    tier_by_rank = {t.get("rank"): t.get("tier_key") for t in tiers if isinstance(t, dict)}
    expected_ranks = {1: "god_tier", 2: "mvp_boss", 3: "raid_boss", 4: "field_mob"}
    if tier_by_rank != expected_ranks:
        errors.append(
            f"GOV-06 violation: boss_power_hierarchy.tiers must rank {expected_ranks}, got {tier_by_rank}"
        )

    # GOV-07: Level 10-20 Cross-Race Guild & Party Convergence Hub + Open-Portal Reachability
    conv = systems.get("cross_race_convergence_hubs") or {}
    if conv.get("target_level_band") != [10, 20]:
        errors.append(
            f"GOV-07 violation: cross_race_convergence_hubs.target_level_band must be [10, 20], got {conv.get('target_level_band')}"
        )
    primary_hub_id = str(conv.get("primary_hub_town_id", ""))
    if primary_hub_id not in nodes_by_id or nodes_by_id[primary_hub_id].get("node_type") != "town":
        errors.append(
            f"GOV-07 violation: primary_hub_town_id '{primary_hub_id}' must be an existing canon town node"
        )
    hubs_list = conv.get("hubs") or []
    if len(hubs_list) < 2:
        errors.append("GOV-07 violation: cross_race_convergence_hubs.hubs must define >= 2 convergence hubs")

    # Verify all 6 playable races start on Continent 01 (Lv.1-10) in distinct towns and can reach primary_hub_id via open portals
    seen_home_towns: set[str] = set()
    for rkey, entry in playable_by_key.items():
        if entry.get("continent_id") != "continent-01-hearthbloom-basin":
            errors.append(
                f"GOV-07 violation: Playable race '{rkey}' starter home town must be on 'continent-01-hearthbloom-basin' so all races can converge at Lv.10-20"
            )
        if entry.get("starter_level_band") != [1, 10]:
            errors.append(
                f"GOV-07 violation: Playable race '{rkey}' must have starter_level_band=[1, 10], got {entry.get('starter_level_band')}"
            )
        if entry.get("convergence_hub_town_id") != primary_hub_id:
            errors.append(
                f"GOV-07 violation: Playable race '{rkey}' convergence_hub_town_id must match primary_hub_town_id '{primary_hub_id}'"
            )
        ht_id = str(entry.get("home_town_id", ""))
        if ht_id in seen_home_towns:
            errors.append(f"GOV-07 violation: Duplicate racial home_town_id '{ht_id}'")
        seen_home_towns.add(ht_id)
        if ht_id in nodes_by_id and primary_hub_id in nodes_by_id:
            visited = {ht_id}
            q = deque([ht_id])
            found_hub = (ht_id == primary_hub_id)
            while q and not found_hub:
                curr = q.popleft()
                for p_obj in (nodes_by_id[curr].get("portals") or {}).values():
                    if isinstance(p_obj, dict) and p_obj.get("gate_state") == "open":
                        nxt = p_obj.get("target_node_id")
                        if nxt in nodes_by_id and nxt not in visited:
                            if nxt == primary_hub_id:
                                found_hub = True
                                break
                            visited.add(nxt)
                            q.append(nxt)
            if not found_hub:
                errors.append(
                    f"GOV-07 violation: Playable race '{rkey}' home town '{ht_id}' cannot reach Lv.10-20 convergence hub '{primary_hub_id}' via open portals"
                )

    # GOV-08: Level 1-99 Growth Path (Stages A..L) with Lv.1-25 Early Focus (A, B, C + D bridge)
    lgp = systems.get("level_growth_path") or {}
    if lgp.get("priority_focus_band") != [1, 25]:
        errors.append(
            f"GOV-08 violation: level_growth_path.priority_focus_band must be [1, 25], got {lgp.get('priority_focus_band')}"
        )
    phases = lgp.get("phases") or []
    found_segments: dict[str, dict[str, Any]] = {}
    for ph in phases:
        if not isinstance(ph, dict):
            continue
        for seg in ph.get("segments") or []:
            if isinstance(seg, dict) and seg.get("segment_code"):
                code = str(seg["segment_code"])
                found_segments[code] = seg
                for nid in seg.get("bound_town_and_hunting_nodes") or []:
                    if nid not in nodes_by_id:
                        errors.append(
                            f"GOV-08 violation: Stage {code} references unknown studio node '{nid}'"
                        )
    expected_codes = ("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L")
    missing_codes = [c for c in expected_codes if c not in found_segments]
    if missing_codes:
        errors.append(f"GOV-08 violation: level_growth_path missing segments: {missing_codes}")
    else:
        expected_ranges = {
            "A": [1, 10], "B": [10, 20], "C": [20, 25], "D": [25, 30],
            "E": [30, 40], "F": [40, 45], "G": [45, 50], "H": [50, 60],
            "I": [60, 70], "J": [70, 80], "K": [80, 90], "L": [90, 99],
        }
        for code, exp_r in expected_ranges.items():
            if found_segments[code].get("level_range") != exp_r:
                errors.append(
                    f"GOV-08 violation: Stage {code} level_range must be {exp_r}, got {found_segments[code].get('level_range')}"
                )
        for p_code in ("A", "B", "C"):
            if found_segments[p_code].get("priority_focus") is not True:
                errors.append(f"GOV-08 violation: Early Stage {p_code} must have priority_focus=true")

    deep = lgp.get("early_focus_1_to_25_deep_dive") or {}
    for req_stage in ("stage_a_1_to_10", "stage_b_10_to_20", "stage_c_20_to_25", "stage_d_25_to_30_bridge"):
        if not isinstance(deep.get(req_stage), dict):
            errors.append(f"GOV-08 violation: early_focus_1_to_25_deep_dive missing '{req_stage}'")

    # GOV-09: World Continent Area Map Chain (Lv.1-25 Hub-and-Spoke + 3-Continent 64-Map Portal Chain)
    wcmc = systems.get("world_continent_map_chain") or {}
    if not isinstance(wcmc, dict) or not wcmc.get("chain_architecture_law"):
        errors.append("GOV-09 violation: missing 'world_continent_map_chain.chain_architecture_law' in shared_world_systems")
    else:
        ef_chain = wcmc.get("early_focus_hub_and_spoke_1_to_25") or {}
        spokes = ef_chain.get("stage_a_spokes_1_to_10") or []
        if len(spokes) != 6:
            errors.append(f"GOV-09 violation: stage_a_spokes_1_to_10 must contain 6 racial spokes, got {len(spokes)}")
        for sp in spokes:
            if not isinstance(sp, dict):
                continue
            rkey = str(sp.get("race_key", ""))
            pchain = sp.get("portal_chain_to_kilnwatch") or []
            if not pchain or pchain[-1] != primary_hub_id:
                errors.append(
                    f"GOV-09 violation: Spoke '{rkey}' portal_chain_to_kilnwatch must end at '{primary_hub_id}'"
                )
            for idx in range(len(pchain) - 1):
                u, v = str(pchain[idx]), str(pchain[idx + 1])
                if not _has_open_portal(nodes_by_id, u, v):
                    errors.append(
                        f"GOV-09 violation: Spoke '{rkey}' broken open-portal link '{u}' -> '{v}'"
                    )
            cat_id = str(sp.get("tutorial_catacomb_id", ""))
            if cat_id not in nodes_by_id:
                errors.append(f"GOV-09 violation: Spoke '{rkey}' tutorial_catacomb_id '{cat_id}' not found")

        cont_chains = wcmc.get("continent_chains") or []
        if len(cont_chains) != 3:
            errors.append(f"GOV-09 violation: continent_chains must contain 3 continents, got {len(cont_chains)}")
        for cc in cont_chains:
            if not isinstance(cc, dict):
                continue
            cid = str(cc.get("continent_id", ""))
            if cid not in continents_by_id:
                errors.append(f"GOV-09 violation: continent_chains references unknown continent '{cid}'")
            mchain = cc.get("ordered_mainline_node_chain") or []
            if len(mchain) < 16:
                errors.append(f"GOV-09 violation: Continent '{cid}' ordered_mainline_node_chain too short ({len(mchain)})")
            for idx in range(len(mchain) - 1):
                u, v = str(mchain[idx]), str(mchain[idx + 1])
                if not _has_open_portal(nodes_by_id, u, v):
                    errors.append(
                        f"GOV-09 violation: Continent '{cid}' ordered_mainline_node_chain broken open-portal link '{u}' -> '{v}'"
                    )

        bridges = wcmc.get("inter_continent_bridges") or []
        if len(bridges) < 2:
            errors.append("GOV-09 violation: inter_continent_bridges must define >= 2 continental bridges")
        for br in bridges:
            if not isinstance(br, dict):
                continue
            bid = str(br.get("bridge_id", ""))
            bseq = br.get("portal_node_sequence") or []
            for idx in range(len(bseq) - 1):
                u, v = str(bseq[idx]), str(bseq[idx + 1])
                if not _has_open_portal(nodes_by_id, u, v):
                    errors.append(
                        f"GOV-09 violation: Inter-continent bridge '{bid}' broken open-portal link '{u}' -> '{v}'"
                    )

    # GOV-10: L2J.RU / L2Hub / PMFun Top-Down T-Shaped World Atlas & Zone Database
    t_atlas_path = studio_dir / "t_shaped_world_atlas.json"
    t_schema_path = studio_dir / "schemas" / "t-shaped-world-atlas.schema.json"
    t_atlas_summary: dict[str, int] = {}
    if not t_atlas_path.exists():
        errors.append("GOV-10 violation: missing content/studio/t_shaped_world_atlas.json")
    elif not t_schema_path.exists():
        errors.append("GOV-10 violation: missing content/studio/schemas/t-shaped-world-atlas.schema.json")
    else:
        try:
            t_doc = json.loads(t_atlas_path.read_text(encoding="utf-8"))
            t_schema = json.loads(t_schema_path.read_text(encoding="utf-8"))
            errors.extend(_validate_json_schema_stdlib(t_doc, t_schema, t_schema, "$"))
            zdir = t_doc.get("t_breadth_zone_directory") or {}
            mf_dungeons = t_doc.get("multi_floor_dungeons") or []
            t_atlas_summary = {
                "continentsCount": len(t_doc.get("t_breadth_continents") or []),
                "startingTownsCount": len(zdir.get("starting_towns") or []),
                "otherCastleHubTownsCount": len(zdir.get("other_castle_and_hub_towns") or []),
                "fieldsCount": len(zdir.get("fields_and_hunting_areas") or []),
                "regularDungeonsCount": len(zdir.get("regular_dungeons") or []),
                "sealCatacombsCount": len(zdir.get("seven_signs_seal_catacombs") or []),
                "harborsClanhallsFortsCount": len(zdir.get("harbors_clanhalls_and_forts") or []),
                "deepMobsCount": len((t_doc.get("t_deep_validation_slice") or {}).get("deep_mob_database") or []),
                "multiFloorDungeonsCount": len(mf_dungeons),
                "fieldTacticalBlueprintsCount": sum(
                    1 for f in (zdir.get("fields_and_hunting_areas") or []) if isinstance(f, dict) and isinstance(f.get("field_tactical_blueprint"), dict)
                ),
                "fortressBlueprintsCount": sum(
                    1 for h in (zdir.get("harbors_clanhalls_and_forts") or []) if isinstance(h, dict) and isinstance(h.get("fortress_blueprint"), dict)
                ),
                "raceGrowthRoutesCount": len(t_doc.get("race_growth_routes") or []),
                "townShopRefinementCatalogsCount": sum(
                    1
                    for t in ((zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or []))
                    if isinstance(t, dict)
                    and isinstance((t.get("town_blueprint") or {}).get("shop_and_refinement_catalog"), dict)
                ),
                "townLayoutArchetypesCount": sum(
                    1
                    for t in ((zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or []))
                    if isinstance(t, dict)
                    and (t.get("town_blueprint") or {}).get("layout_archetype")
                    in (
                        "radial_moat_sanctuary",
                        "polygonal_walled_keep",
                        "schematic_grid_blueprint",
                        "harbor_fortress_plaza",
                    )
                ),
                "dungeonVerticalCutawaysCount": sum(
                    1
                    for d in mf_dungeons
                    if isinstance(d, dict)
                    and len(d.get("floors") or []) >= 3
                    and all(
                        isinstance(fl, dict)
                        and isinstance(fl.get("floor_elevation_meters"), int)
                        and bool(fl.get("boss_tier_highlight"))
                        for fl in (d.get("floors") or [])
                    )
                ),
                "omniSearchIndexedZonesCount": sum(
                    len(entries) for entries in zdir.values() if isinstance(entries, list)
                ),
                "omniSearchIndexedTownNpcsCount": sum(
                    len((t.get("town_blueprint") or {}).get("npc_roster") or [])
                    for t in ((zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or []))
                    if isinstance(t, dict)
                ),
                "omniSearchIndexedServiceMarksCount": sum(
                    len(
                        {
                            m.get("mark_type")
                            for m in ((t.get("town_blueprint") or {}).get("service_marks") or [])
                            if isinstance(m, dict)
                            and m.get("mark_type")
                            in ("equip_shop", "consumable_shop", "blacksmith", "temple", "warehouse", "guild", "gatekeeper")
                        }
                    )
                    for t in ((zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or []))
                    if isinstance(t, dict)
                ),
                "omniSearchIndexedDungeonFloorsCount": sum(
                    len(d.get("floors") or []) for d in mf_dungeons if isinstance(d, dict)
                ),
                "dungeonAndFieldSpawnRefinementDropsCount": sum(
                    1
                    for d in mf_dungeons
                    if isinstance(d, dict)
                    and all(
                        all(len(sp.get("refinement_drops") or []) >= 1 for sp in (fl.get("spawns") or []) if isinstance(sp, dict))
                        for fl in (d.get("floors") or [])
                        if isinstance(fl, dict)
                    )
                )
                + sum(
                    1
                    for f in (zdir.get("fields_and_hunting_areas") or [])
                    if isinstance(f, dict)
                    and all(
                        len(st.get("refinement_drops") or []) >= 1
                        for st in ((f.get("field_tactical_blueprint") or {}).get("spawn_territories") or [])
                        if isinstance(st, dict)
                    )
                ),
                "archetypeRasterPlatesCount": sum(
                    1
                    for p_name in (
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
                    if (studio_dir / "maps" / p_name).is_file() and (studio_dir / "maps" / p_name).stat().st_size > 0
                ),
                "unifiedMapDirectoryZonesCount": sum(
                    len(entries) for entries in zdir.values() if isinstance(entries, list)
                ),
                "refinementGradeMatrixCount": len(t_doc.get("refinement_grade_matrix") or []),
                "bossHierarchyChainsCount": len(t_doc.get("boss_hierarchy_chains") or []),
                "questTrialChainsCount": len(t_doc.get("quest_trial_chains") or []),
                "farmingEfficiencyProfilesCount": len(t_doc.get("farming_efficiency_profiles") or []),
                "castleSiegeDomainsCount": len(t_doc.get("castle_siege_domains") or []),
                "worldBossSpawnRadarCount": len(t_doc.get("world_boss_spawn_radar") or []),
                "sevenSealsCompetitionsCount": len(t_doc.get("seven_seals_competitions") or []),
                "manorEconomyRoutesCount": len(t_doc.get("manor_economy_routes") or []),
                "noblesseOlympiadNetworkCount": len(t_doc.get("noblesse_olympiad_network") or []),
                "intercontinentalTransitLinesCount": len(t_doc.get("intercontinental_transit_lines") or []),
                "soulCrystalResonanceStagesCount": len(t_doc.get("soul_crystal_resonance_stages") or []),
                "fishingGuildSanctuariesCount": len(t_doc.get("fishing_guild_sanctuaries") or []),
            }
            for cat_key, entries in zdir.items():
                if not isinstance(entries, list):
                    continue
                for entry in entries:
                    if isinstance(entry, dict):
                        snid = str(entry.get("studio_node_id", ""))
                        if snid not in nodes_by_id:
                            errors.append(
                                f"GOV-10 violation: T-Breadth category '{cat_key}' references unknown studio_node_id '{snid}'"
                            )
            deep_slice = t_doc.get("t_deep_validation_slice") or {}
            for d_key in ("deep_town", "deep_field_zone", "deep_dungeon"):
                d_obj = deep_slice.get(d_key) or {}
                snid = str(d_obj.get("studio_node_id", ""))
                if snid not in nodes_by_id:
                    errors.append(
                        f"GOV-10 violation: T-Depth '{d_key}' references unknown studio_node_id '{snid}'"
                    )

            # Validate 6 Playable Race Spawn Locations if present
            r_spawns = t_doc.get("race_spawn_locations") or []
            if r_spawns and len(r_spawns) != 6:
                errors.append(f"GOV-10 violation: race_spawn_locations must have 6 playable races, got {len(r_spawns)}")
            for rs in r_spawns:
                if isinstance(rs, dict) and str(rs.get("starter_town_node_id", "")) not in nodes_by_id:
                    errors.append(
                        f"GOV-10 violation: race_spawn_locations '{rs.get('race_key')}' references unknown starter_town_node_id '{rs.get('starter_town_node_id')}'"
                    )

            # Validate 6-Race Starter-to-Endgame Growth Routes (D9)
            all_zone_ids = {
                str(z.get("zone_id", ""))
                for entries in zdir.values()
                if isinstance(entries, list)
                for z in entries
                if isinstance(z, dict) and z.get("zone_id")
            }
            r_routes = t_doc.get("race_growth_routes") or []
            if r_routes and len(r_routes) != 6:
                errors.append(f"GOV-10 violation: race_growth_routes must have 6 playable races, got {len(r_routes)}")
            for rt in r_routes:
                if isinstance(rt, dict):
                    for wp in rt.get("waypoints") or []:
                        if isinstance(wp, dict) and str(wp.get("zone_id", "")) not in all_zone_ids:
                            errors.append(
                                f"GOV-10 violation: race_growth_routes '{rt.get('race_key')}' waypoint references unknown zone_id '{wp.get('zone_id')}'"
                            )

            # Validate 6-Grade Blacksmith Refinement & Spoil Source Matrix (D19)
            town_zone_ids = {
                str(z.get("zone_id", ""))
                for z in ((zdir.get("starting_towns") or []) + (zdir.get("other_castle_and_hub_towns") or []))
                if isinstance(z, dict) and z.get("zone_id")
            }
            drop_zone_ids = {
                str(z.get("zone_id", ""))
                for z in (zdir.get("fields_and_hunting_areas") or [])
                if isinstance(z, dict) and z.get("zone_id")
            } | {
                str(d.get("dungeon_id", ""))
                for d in mf_dungeons
                if isinstance(d, dict) and d.get("dungeon_id")
            }
            ref_matrix = t_doc.get("refinement_grade_matrix") or []
            if ref_matrix and len(ref_matrix) != 6:
                errors.append(f"GOV-10 violation: refinement_grade_matrix must have 6 grades, got {len(ref_matrix)}")
            for g_entry in ref_matrix:
                if not isinstance(g_entry, dict):
                    continue
                gcode = str(g_entry.get("grade_code", ""))
                for t_zid in g_entry.get("home_blacksmith_towns") or []:
                    if str(t_zid) not in town_zone_ids:
                        errors.append(
                            f"GOV-10 violation: refinement_grade_matrix '{gcode}' references unknown home_blacksmith_town '{t_zid}'"
                        )
                for mat in g_entry.get("required_materials") or []:
                    if isinstance(mat, dict):
                        for d_zid in mat.get("drop_zones") or []:
                            if str(d_zid) not in drop_zone_ids:
                                errors.append(
                                    f"GOV-10 violation: refinement_grade_matrix '{gcode}' material '{mat.get('material_name')}' references unknown drop_zone '{d_zid}'"
                                )

            # Validate 6-God 5-Tier Boss Power Hierarchy Chains (D21)
            catacomb_zone_ids = {
                str(z.get("zone_id", ""))
                for z in (zdir.get("seven_signs_seal_catacombs") or [])
                if isinstance(z, dict) and z.get("zone_id")
            }
            mf_dungeon_ids = {
                str(d.get("dungeon_id", ""))
                for d in mf_dungeons
                if isinstance(d, dict) and d.get("dungeon_id")
            }
            boss_chains = t_doc.get("boss_hierarchy_chains") or []
            if boss_chains and len(boss_chains) != 6:
                errors.append(f"GOV-10 violation: boss_hierarchy_chains must have 6 Primordial Sealed Gods, got {len(boss_chains)}")
            for b_chain in boss_chains:
                if not isinstance(b_chain, dict):
                    continue
                gid = str(b_chain.get("god_id", ""))
                sc_zid = str(b_chain.get("seal_catacomb_zone_id", ""))
                if sc_zid not in catacomb_zone_ids:
                    errors.append(
                        f"GOV-10 violation: boss_hierarchy_chains '{gid}' references unknown seal_catacomb_zone_id '{sc_zid}'"
                    )
                for mvp_ap in b_chain.get("mvp_apostles") or []:
                    if isinstance(mvp_ap, dict):
                        ap_did = str(mvp_ap.get("dungeon_id", ""))
                        if ap_did not in mf_dungeon_ids:
                            errors.append(
                                f"GOV-10 violation: boss_hierarchy_chains '{gid}' MVP apostle '{mvp_ap.get('name')}' references unknown dungeon_id '{ap_did}'"
                            )
                for rb in b_chain.get("raid_bosses") or []:
                    if isinstance(rb, dict):
                        rb_zid = str(rb.get("zone_id", ""))
                        if rb_zid not in all_zone_ids:
                            errors.append(
                                f"GOV-10 violation: boss_hierarchy_chains '{gid}' Raid Boss '{rb.get('name')}' references unknown zone_id '{rb_zid}'"
                            )
                for mb in b_chain.get("mini_bosses") or []:
                    if isinstance(mb, dict):
                        mb_zid = str(mb.get("zone_id", ""))
                        if mb_zid not in all_zone_ids:
                            errors.append(
                                f"GOV-10 violation: boss_hierarchy_chains '{gid}' Mini-Boss '{mb.get('name')}' references unknown zone_id '{mb_zid}'"
                            )
                for mf_fam in b_chain.get("minion_families") or []:
                    if isinstance(mf_fam, dict):
                        for fz in mf_fam.get("zone_ids") or []:
                            if str(fz) not in all_zone_ids:
                                errors.append(
                                    f"GOV-10 violation: boss_hierarchy_chains '{gid}' Minion family '{mf_fam.get('family_name')}' references unknown zone_id '{fz}'"
                                )

            # Validate 18 Canonical 3-Track Quest & Class Transfer Trial Chains (D23)
            quest_chains = t_doc.get("quest_trial_chains") or []
            if quest_chains and len(quest_chains) != 18:
                errors.append(f"GOV-10 violation: quest_trial_chains must have 18 canonical quests, got {len(quest_chains)}")
            for q_chain in quest_chains:
                if not isinstance(q_chain, dict):
                    continue
                qid = str(q_chain.get("quest_id", ""))
                gzid = str(q_chain.get("giver_zone_id", ""))
                ozid = str(q_chain.get("objective_zone_id", ""))
                odid = str(q_chain.get("objective_dungeon_id", ""))
                tzid = str(q_chain.get("turn_in_zone_id", ""))
                if gzid not in town_zone_ids:
                    errors.append(f"GOV-10 violation: quest_trial_chains '{qid}' references unknown giver_zone_id '{gzid}'")
                if ozid not in all_zone_ids:
                    errors.append(f"GOV-10 violation: quest_trial_chains '{qid}' references unknown objective_zone_id '{ozid}'")
                if odid and odid not in mf_dungeon_ids:
                    errors.append(f"GOV-10 violation: quest_trial_chains '{qid}' references unknown objective_dungeon_id '{odid}'")
                if tzid not in town_zone_ids:
                    errors.append(f"GOV-10 violation: quest_trial_chains '{qid}' references unknown turn_in_zone_id '{tzid}'")

            # Validate 40 Combat Zone Farming Efficiency Profiles (D24)
            farming_profiles = t_doc.get("farming_efficiency_profiles") or []
            if farming_profiles and len(farming_profiles) != 40:
                errors.append(f"GOV-10 violation: farming_efficiency_profiles must have 40 combat zones, got {len(farming_profiles)}")
            for f_prof in farming_profiles:
                if not isinstance(f_prof, dict):
                    continue
                fp_zid = str(f_prof.get("zone_id", ""))
                if fp_zid not in drop_zone_ids:
                    errors.append(
                        f"GOV-10 violation: farming_efficiency_profiles references unknown combat zone_id '{fp_zid}'"
                    )

            # Validate 8 Castle Siege, Territory Tax & Clan Hall Domains (D25)
            fort_zone_ids = {
                str(z.get("zone_id", ""))
                for z in (zdir.get("harbors_clanhalls_and_forts") or [])
                if isinstance(z, dict) and z.get("zone_id")
            }
            field_zone_ids = {
                str(z.get("zone_id", ""))
                for z in (zdir.get("fields_and_hunting_areas") or [])
                if isinstance(z, dict) and z.get("zone_id")
            }
            siege_domains = t_doc.get("castle_siege_domains") or []
            if siege_domains and len(siege_domains) != 8:
                errors.append(f"GOV-10 violation: castle_siege_domains must have 8 domains, got {len(siege_domains)}")
            for s_dom in siege_domains:
                if not isinstance(s_dom, dict):
                    continue
                did = str(s_dom.get("domain_id", ""))
                szid = str(s_dom.get("stronghold_zone_id", ""))
                if szid not in fort_zone_ids:
                    errors.append(
                        f"GOV-10 violation: castle_siege_domains '{did}' references unknown stronghold_zone_id '{szid}'"
                    )
                for vt_id in s_dom.get("vassal_town_ids") or []:
                    if str(vt_id) not in town_zone_ids:
                        errors.append(
                            f"GOV-10 violation: castle_siege_domains '{did}' references unknown vassal_town_id '{vt_id}'"
                        )
                for vh_id in s_dom.get("vassal_hunting_zone_ids") or []:
                    if str(vh_id) not in field_zone_ids:
                        errors.append(
                            f"GOV-10 violation: castle_siege_domains '{did}' references unknown vassal_hunting_zone_id '{vh_id}'"
                        )

            # Validate 32 World Boss & Dungeon MVP Respawn Radar Entries (D26)
            boss_radar = t_doc.get("world_boss_spawn_radar") or []
            if boss_radar and len(boss_radar) != 32:
                errors.append(f"GOV-10 violation: world_boss_spawn_radar must have 32 bosses, got {len(boss_radar)}")
            for b_rad in boss_radar:
                if not isinstance(b_rad, dict):
                    continue
                bid = str(b_rad.get("boss_id", ""))
                bzid = str(b_rad.get("zone_id", ""))
                bdid = str(b_rad.get("dungeon_id", ""))
                if bzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: world_boss_spawn_radar '{bid}' references unknown zone_id '{bzid}'"
                    )
                if bdid and bdid not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: world_boss_spawn_radar '{bid}' references unknown dungeon_id '{bdid}'"
                    )

            # Validate 16 Seven-Seals Dusk vs. Dawn Catacomb/Tower Competitions & Mammon Rotations (D27)
            seven_seals = t_doc.get("seven_seals_competitions") or []
            if seven_seals and len(seven_seals) != 16:
                errors.append(f"GOV-10 violation: seven_seals_competitions must have 16 sanctums, got {len(seven_seals)}")
            for ss_item in seven_seals:
                if not isinstance(ss_item, dict):
                    continue
                cid = str(ss_item.get("competition_id", ""))
                ss_did = str(ss_item.get("dungeon_id", ""))
                if ss_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: seven_seals_competitions '{cid}' references unknown dungeon_id '{ss_did}'"
                    )

            # Validate 15-Town Manor Seed/Crop & Regional Caravan Trade Economy Routes (D28)
            manor_routes = t_doc.get("manor_economy_routes") or []
            if manor_routes and len(manor_routes) != 15:
                errors.append(f"GOV-10 violation: manor_economy_routes must have 15 towns, got {len(manor_routes)}")
            for mr_item in manor_routes:
                if not isinstance(mr_item, dict):
                    continue
                mid = str(mr_item.get("manor_id", ""))
                tzid = str(mr_item.get("town_zone_id", ""))
                pszid = str(mr_item.get("parent_stronghold_zone_id", ""))
                hfzid = str(mr_item.get("harvest_field_zone_id", ""))
                if tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: manor_economy_routes '{mid}' references unknown town_zone_id '{tzid}'"
                    )
                if pszid not in fort_zone_ids:
                    errors.append(
                        f"GOV-10 violation: manor_economy_routes '{mid}' references unknown parent_stronghold_zone_id '{pszid}'"
                    )
                if hfzid not in field_zone_ids:
                    errors.append(
                        f"GOV-10 violation: manor_economy_routes '{mid}' references unknown harvest_field_zone_id '{hfzid}'"
                    )

            # Validate 21 Subclass, Noblesse & Grand Olympiad Monument Network Nodes (D29)
            olympiad_nodes = t_doc.get("noblesse_olympiad_network") or []
            if olympiad_nodes and len(olympiad_nodes) != 21:
                errors.append(f"GOV-10 violation: noblesse_olympiad_network must have 21 nodes, got {len(olympiad_nodes)}")
            for on_item in olympiad_nodes:
                if not isinstance(on_item, dict):
                    continue
                nid = str(on_item.get("node_id", ""))
                ozid = str(on_item.get("zone_id", ""))
                odid = str(on_item.get("dungeon_id", ""))
                if ozid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: noblesse_olympiad_network '{nid}' references unknown zone_id '{ozid}'"
                    )
                if odid and odid not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: noblesse_olympiad_network '{nid}' references unknown dungeon_id '{odid}'"
                    )

            # Validate 18 Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Lines (D30)
            transit_lines = t_doc.get("intercontinental_transit_lines") or []
            if transit_lines and len(transit_lines) != 18:
                errors.append(f"GOV-10 violation: intercontinental_transit_lines must have 18 routes, got {len(transit_lines)}")
            for tl_item in transit_lines:
                if not isinstance(tl_item, dict):
                    continue
                tid = str(tl_item.get("transit_id", ""))
                orig_zid = str(tl_item.get("origin_zone_id", ""))
                dest_zid = str(tl_item.get("destination_zone_id", ""))
                if orig_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: intercontinental_transit_lines '{tid}' references unknown origin_zone_id '{orig_zid}'"
                    )
                if dest_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: intercontinental_transit_lines '{tid}' references unknown destination_zone_id '{dest_zid}'"
                    )

            # Validate 18 Soul Crystal (SA) Stage 1-13 Resonance & Boss Absorption Entries (D31)
            soul_crystals = t_doc.get("soul_crystal_resonance_stages") or []
            if soul_crystals and len(soul_crystals) != 18:
                errors.append(f"GOV-10 violation: soul_crystal_resonance_stages must have 18 entries, got {len(soul_crystals)}")
            for sc_item in soul_crystals:
                if not isinstance(sc_item, dict):
                    continue
                sc_id = str(sc_item.get("crystal_stage_id", ""))
                vtown = str(sc_item.get("vendor_town_zone_id", ""))
                azone = str(sc_item.get("absorption_zone_id", ""))
                adng = str(sc_item.get("absorption_dungeon_id", ""))
                if vtown not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: soul_crystal_resonance_stages '{sc_id}' references unknown vendor_town_zone_id '{vtown}'"
                    )
                if azone not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: soul_crystal_resonance_stages '{sc_id}' references unknown absorption_zone_id '{azone}'"
                    )
                if adng and adng not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: soul_crystal_resonance_stages '{sc_id}' references unknown absorption_dungeon_id '{adng}'"
                    )

            # Validate 16 Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuaries (D32)
            fishing_sanctuaries = t_doc.get("fishing_guild_sanctuaries") or []
            if fishing_sanctuaries and len(fishing_sanctuaries) != 16:
                errors.append(f"GOV-10 violation: fishing_guild_sanctuaries must have 16 sanctuaries, got {len(fishing_sanctuaries)}")
            for fs_item in fishing_sanctuaries:
                if not isinstance(fs_item, dict):
                    continue
                fs_id = str(fs_item.get("sanctuary_id", ""))
                fs_zid = str(fs_item.get("zone_id", ""))
                if fs_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: fishing_guild_sanctuaries '{fs_id}' references unknown zone_id '{fs_zid}'"
                    )

            # Validate Town Blueprint (7 canonical service marks + 1..12 NPC roster + character scale street widths)
            tb = (deep_slice.get("deep_town") or {}).get("town_blueprint") or {}
            s_marks = {m.get("mark_type") for m in (tb.get("service_marks") or []) if isinstance(m, dict)}
            for req_mark in ("equip_shop", "consumable_shop", "blacksmith", "temple", "warehouse", "guild", "gatekeeper"):
                if req_mark not in s_marks:
                    errors.append(f"GOV-10 violation: town_blueprint missing required service_mark '{req_mark}'")
            roster_nums = [r.get("building_number") for r in (tb.get("npc_roster") or []) if isinstance(r, dict)]
            if sorted(roster_nums) != list(range(1, 13)):
                errors.append(f"GOV-10 violation: town_blueprint.npc_roster must have building_number 1..12, got {roster_nums}")

            # Validate Multi-Floor Dungeons & Towers
            for d_item in mf_dungeons:
                if not isinstance(d_item, dict):
                    continue
                did = str(d_item.get("dungeon_id", ""))
                snid = str(d_item.get("studio_node_id", ""))
                if snid not in nodes_by_id:
                    errors.append(f"GOV-10 violation: multi_floor_dungeons '{did}' references unknown studio_node_id '{snid}'")
                floors = d_item.get("floors") or []
                floor_ids = {f.get("floor_id") for f in floors if isinstance(f, dict)}
                for fl in floors:
                    if not isinstance(fl, dict):
                        continue
                    for rm in fl.get("rooms") or []:
                        if isinstance(rm, dict) and float(rm.get("corridor_width_meters", 0.0)) < 6.0:
                            errors.append(
                                f"GOV-10 violation: dungeon '{did}' room '{rm.get('room_id')}' corridor_width_meters < 6.0m Character Scale Law"
                            )
                    for wp in fl.get("warp_points") or []:
                        if isinstance(wp, dict):
                            tf = str(wp.get("target_floor_id", ""))
                            if tf != "OVERLAND" and tf not in floor_ids:
                                errors.append(
                                    f"GOV-10 violation: dungeon '{did}' warp '{wp.get('warp_id')}' targets unknown floor '{tf}'"
                                )

            # Validate Field Tactical Blueprints & Fortress Blueprints dungeon_entrance_warps
            mf_by_id = {
                str(d.get("dungeon_id", "")): {f.get("floor_id") for f in (d.get("floors") or []) if isinstance(f, dict)}
                for d in mf_dungeons
                if isinstance(d, dict) and d.get("dungeon_id")
            }
            for f_item in zdir.get("fields_and_hunting_areas") or []:
                ftb = (f_item or {}).get("field_tactical_blueprint")
                if isinstance(ftb, dict):
                    for dw in ftb.get("dungeon_entrance_warps") or []:
                        if isinstance(dw, dict):
                            did = str(dw.get("dungeon_id", ""))
                            fid = str(dw.get("floor_id", ""))
                            if did not in mf_by_id:
                                errors.append(
                                    f"GOV-10 violation: field_tactical_blueprint '{f_item.get('zone_id')}' warp references unknown dungeon_id '{did}'"
                                )
                            elif fid not in mf_by_id[did]:
                                errors.append(
                                    f"GOV-10 violation: field_tactical_blueprint '{f_item.get('zone_id')}' warp references unknown floor_id '{fid}' in '{did}'"
                                )
            for h_item in zdir.get("harbors_clanhalls_and_forts") or []:
                fbp = (h_item or {}).get("fortress_blueprint")
                if isinstance(fbp, dict):
                    for dw in fbp.get("dungeon_entrance_warps") or []:
                        if isinstance(dw, dict):
                            did = str(dw.get("dungeon_id", ""))
                            fid = str(dw.get("floor_id", ""))
                            if did not in mf_by_id:
                                errors.append(
                                    f"GOV-10 violation: fortress_blueprint '{h_item.get('zone_id')}' warp references unknown dungeon_id '{did}'"
                                )
                            elif fid not in mf_by_id[did]:
                                errors.append(
                                    f"GOV-10 violation: fortress_blueprint '{h_item.get('zone_id')}' warp references unknown floor_id '{fid}' in '{did}'"
                                )
        except Exception as exc:
            errors.append(f"GOV-10 violation: t_shaped_world_atlas validation error: {exc}")

    # Verify long_term_governance_checklist entries
    gov_checklist = whc.get("long_term_governance_checklist") or []
    if len(gov_checklist) < 10:
        errors.append("Governance checklist must contain all 10 gates (GOV-01..GOV-10)")
    for gate in gov_checklist:
        if isinstance(gate, dict) and whc.get("status") == "canon" and not gate.get("verified"):
            errors.append(
                f"Governance gate {gate.get('gate_id')} ('{gate.get('title')}') must be verified=true when World History is canon"
            )

    report = {
        "ok": len(errors) == 0,
        "errorCount": len(errors),
        "errors": errors,
        "summary": {
            "playableRacesCount": len(playable_by_key),
            "monsterEcologyRacesCount": len(monster_by_key),
            "godTierEntitiesCount": len(god_entities_by_key),
            "historyChaptersCount": len(epochs),
            "questTracksCount": len(track_keys),
            "bossHierarchyLaw": bhier.get("strict_order_law", ""),
            "governanceGatesVerified": sum(
                1 for g in gov_checklist if isinstance(g, dict) and g.get("verified")
            ),
            "governanceGatesTotal": len(gov_checklist),
            "tShapedAtlasSummary": t_atlas_summary,
        },
        "gates": gov_checklist,
    }
    return errors, report


def scaffold_quest_template(
    studio_dir: Path,
    race_key: str,
    track_key: str,
    title: str,
) -> dict[str, Any]:
    """Generate a compliant Quest / Adventure Guild Commission scaffold for a playable race."""
    whc = json.loads((studio_dir / "world_history_and_concept.json").read_text(encoding="utf-8"))
    playable = {
        r["race_key"]: r
        for r in (whc.get("race_taxonomy", {}).get("playable_and_mob_races") or [])
    }
    if race_key not in playable:
        raise ValueError(f"Unknown race_key '{race_key}'. Must be one of: {sorted(playable.keys())}")
    if track_key not in REQUIRED_QUEST_TRACKS:
        raise ValueError(f"Unknown track_key '{track_key}'. Must be one of: {REQUIRED_QUEST_TRACKS}")

    race = playable[race_key]
    slug = "-".join(title.lower().replace("_", " ").split())
    return {
        "schema_version": "1.0.0",
        "quest_id": f"quest-{race_key.replace('_', '-')}-{track_key.replace('_', '-')}-{slug}",
        "title": title,
        "quest_track": track_key,
        "race_affinity": race_key,
        "issued_by_faction": (
            "faction-blacksmith-clan" if track_key == "job_quest" else "faction-adventure-guild"
        ),
        "guild_allegiance": "neutral_no_side",
        "home_town_node_id": race["home_town_id"],
        "continent_id": race["continent_id"],
        "district_id": race["district_id"],
        "target_hunting_area_id": race["hunting_area_id"],
        "target_farming_area_id": race["farming_area_id"],
        "required_farming_resources": race["farming_resources"],
        "narrative_hook": (
            f"[{race['name']} — {race['home_town_name']}] {race['niched_story']}"
        ),
        "objectives": [
            f"Report to the Neutral Adventure Guild counter in {race['home_town_name']} ({race['home_town_id']}).",
            f"Patrol the adjacent hunting grounds at {race['hunting_area_id']} and cull encroaching monsters.",
            f"Harvest {', '.join(race['farming_resources'][:2])} in {race['farming_area_id']} for the Blacksmith Clan anvil.",
        ],
    }


def scaffold_boss_template(
    studio_dir: Path,
    tier_key: str,
    god_id: str,
    node_id: str,
    name: str,
) -> dict[str, Any]:
    """Generate a compliant Boss template enforcing GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS."""
    if tier_key not in ("mvp_boss", "raid_boss"):
        raise ValueError("tier_key must be 'mvp_boss' (Rank 2, Top Tier) or 'raid_boss' (Rank 3, Lower than MVP)")
    whc = json.loads((studio_dir / "world_history_and_concept.json").read_text(encoding="utf-8"))
    gods = {g["id"]: g for g in (whc.get("primordial_gods") or [])}
    if god_id not in gods:
        raise ValueError(f"Unknown god_id '{god_id}'. Must be one of: {sorted(gods.keys())}")
    god = gods[god_id]
    slug = "-".join(name.lower().replace("_", " ").split())
    is_mvp = tier_key == "mvp_boss"
    return {
        "schema_version": "1.0.0",
        "boss_id": f"{'mvp' if is_mvp else 'raid'}-{slug}",
        "name": name,
        "tier_key": tier_key,
        "hierarchy_rank": 2 if is_mvp else 3,
        "strict_hierarchy_law": REQUIRED_BOSS_LAW,
        "superior_sealed_god_id": god_id,
        "superior_sealed_god_name": god["name"],
        "cosmic_role": (
            f"Top-Tier MVP Boss & Direct Apostle of {god['name']} (Sealed by The Architect in Chapter 1.4)"
            if is_mvp
            else f"Catacomb/Regional Raid Warden (Strictly lower tier than MVP Apostle '{god.get('mvp_apostle_title', 'MVP Apostle')}')"
        ),
        "spawn_node_id": node_id,
        "blacksmith_core_drop": f"{name} {'Divine Apostle Core' if is_mvp else 'Warden Alloy Core'}",
    }


def _print_audit_report(studio_dir: Path, section: str = "all") -> int:
    errors, report = validate_world_governance(studio_dir)
    whc = json.loads((studio_dir / "world_history_and_concept.json").read_text(encoding="utf-8"))
    tax = whc.get("race_taxonomy", {})
    sys_cfg = whc.get("shared_world_systems", {})

    print("================================================================================")
    print("ATLAS WORLD STUDIO — LONG-TERM CONTENT GOVERNANCE & CHECKLIST REPORT")
    print("================================================================================")

    if section in ("all", "races"):
        print("\n[1] 6 PLAYABLE & MOB RACES (Home Town + Hunting + Farming Loop):")
        for r in tax.get("playable_and_mob_races", []):
            print(
                f"  - {r['name']} ({r['race_key']})\n"
                f"      Home Town : {r['home_town_name']} ({r['home_town_id']}) in {r['district_id']}\n"
                f"      Hunting   : {r['hunting_area_id']} | Farming: {r['farming_area_id']} ({', '.join(r['farming_resources'])})\n"
                f"      Story     : {r['niched_story']}"
            )
        print("\n[2] 6 MONSTER-ONLY ECOLOGY RACES:")
        for m in tax.get("monster_ecology_races", []):
            print(
                f"  - {m['name']} ({m['race_key']}) -> Drops: {', '.join(m['signature_drops'])} | Continents: {', '.join(m['primary_continents'])}"
            )

    if section in ("all", "history"):
        print("\n[3] 4-CHAPTER CANONICAL WORLD HISTORY:")
        for ep in whc.get("historical_epochs", []):
            print(f"  - [{ep.get('chapter_code')}] {ep['name']} (status={ep['status']})")
        print("\n[4] 6 GOD-TIER ENTITIES (Sealed by The Architect in Chapter 1.4):")
        for g in tax.get("god_tier_entities", []):
            print(
                f"  - {g['name']} [{', '.join(g['elements'])}] | State: {g['seal_state']} | Direct MVP: {g['direct_mvp_subordinate']}"
            )

    if section in ("all", "factions", "quests", "bosses"):
        guild = sys_cfg.get("adventure_guild", {})
        smith = sys_cfg.get("blacksmith_clan", {})
        print(f"\n[5] SHARED FACTIONS: {guild.get('name')} ({guild.get('allegiance')}) & {smith.get('name')}")
        print("[6] 3-TRACK QUEST LOOP:")
        for t in sys_cfg.get("quest_progression_loop", {}).get("tracks", []):
            print(f"  - {t['name']} ({t['track_key']}): {t['purpose']}")
        print(f"\n[7] STRICT BOSS HIERARCHY: {sys_cfg.get('boss_power_hierarchy', {}).get('strict_order_law')}")
        for b in sys_cfg.get("boss_power_hierarchy", {}).get("tiers", []):
            print(f"  - Rank {b['rank']} [{b['tier_key']}]: {b['name']} — {b['power_relationship']}")

    if section in ("all", "growth"):
        lgp = sys_cfg.get("level_growth_path", {})
        print(f"\n[7B] LEVEL 1-99 GROWTH PATH (PRIORITY FOCUS: Lv.{lgp.get('priority_focus_band', [1,25])}):")
        print(f"  Formula: {lgp.get('path_formula')}")
        for ph in lgp.get("phases", []):
            print(f"  * {ph['name']}:")
            for seg in ph.get("segments", []):
                focus_tag = " [PRIORITY LV.1-25 FOCUS]" if seg.get("priority_focus") else ""
                print(
                    f"      [{seg['segment_code']}] Lv.{seg['level_range'][0]}-{seg['level_range'][1]}{focus_tag}: {seg['title']}\n"
                    f"          Class: {seg['class_milestone']} | Quest: {seg['adventure_quest_tier']}\n"
                    f"          Equip: {seg['equipment_unlock']} | Skills: {seg['skill_unlocks']}\n"
                    f"          Items: {seg['consumable_unlocks']} | Boss: {seg['boss_milestone']}"
                )

    if section in ("all", "map_chain"):
        wcmc = sys_cfg.get("world_continent_map_chain", {})
        ef = wcmc.get("early_focus_hub_and_spoke_1_to_25", {})
        print("\n[7C] WORLD CONTINENT AREA MAP CHAIN (LV.1-25 HUB-AND-SPOKE + 3-CONTINENT CHAIN):")
        print(f"  Law: {wcmc.get('chain_architecture_law')}")
        print("  * Stage A (Lv.1-10) — 6 Racial Starter Spokes -> Kilnwatch Convergence:")
        for sp in ef.get("stage_a_spokes_1_to_10", []):
            print(
                f"      - {sp['race_name']} ({sp['home_town_id']}) [{sp['district_id']}]:\n"
                f"          Chain   : {' -> '.join(sp['portal_chain_to_kilnwatch'])}\n"
                f"          Catacomb: {sp['tutorial_catacomb_id']}"
            )
        sb = ef.get("stage_b_convergence_hub_10_to_20", {})
        print(f"  * Stage B (Lv.10-20) — All-Race Convergence Hub: {sb.get('hub_town_id')} [{sb.get('district_id')}]")
        print(f"      Hunting Grounds: {', '.join(sb.get('connected_party_hunting_grounds', []))}")
        sc = ef.get("stage_c_boss_and_bridge_20_to_25", {})
        print("  * Stage C (Lv.20-25) — Dual Raid Boss & Continental Bridge Branches:")
        print(f"      West Raid  : {' -> '.join(sc.get('west_river_raid_branch', []))}")
        print(f"      East Bridge: {' -> '.join(sc.get('east_continental_bridge_branch', []))}")
        print("  * 3-Continent Mainline Node Chains:")
        for cc in wcmc.get("continent_chains", []):
            print(
                f"      - {cc['continent_name']} ({cc['continent_id']}, Lv.{cc['level_band'][0]}-{cc['level_band'][1]}, Stages {', '.join(cc['growth_stages'])}):\n"
                f"          Mainline ({len(cc['ordered_mainline_node_chain'])} nodes): {' -> '.join(cc['ordered_mainline_node_chain'])}"
            )
        print("  * Inter-Continent Bridges:")
        for br in wcmc.get("inter_continent_bridges", []):
            print(
                f"      - {br['bridge_id']} ({br['from_continent_id']} -> {br['to_continent_id']} | {br.get('growth_stage_transition', '')}):\n"
                f"          Route: {' -> '.join(br['portal_node_sequence'])}"
            )

    if section in ("all", "t_atlas"):
        t_doc = json.loads((studio_dir / "t_shaped_world_atlas.json").read_text(encoding="utf-8"))
        zdir = t_doc.get("t_breadth_zone_directory", {})
        deep_s = t_doc.get("t_deep_validation_slice", {})
        print("\n[7D] L2J.RU / L2HUB / PMFUN TOP-DOWN T-SHAPED WORLD ATLAS:")
        print(f"  T-Breadth Continents          : {len(t_doc.get('t_breadth_continents', []))}")
        print(f"  T-Breadth Starting Towns      : {len(zdir.get('starting_towns', []))}")
        print(f"  T-Breadth Castle/Hub Towns    : {len(zdir.get('other_castle_and_hub_towns', []))}")
        print(f"  T-Breadth Fields & Areas      : {len(zdir.get('fields_and_hunting_areas', []))}")
        print(f"  T-Breadth Regular Dungeons    : {len(zdir.get('regular_dungeons', []))}")
        print(f"  T-Breadth Seal Catacombs      : {len(zdir.get('seven_signs_seal_catacombs', []))}")
        print(f"  T-Breadth Harbors/Halls/Forts : {len(zdir.get('harbors_clanhalls_and_forts', []))}")
        print(f"  T-Depth Validated Town        : {deep_s.get('deep_town', {}).get('header_title')}")
        print(f"  T-Depth Validated Field Zone  : {deep_s.get('deep_field_zone', {}).get('header_title')} ({len(deep_s.get('deep_field_zone', {}).get('spawn_table', []))} spawn rows)")
        print(f"  T-Depth Validated Dungeon     : {deep_s.get('deep_dungeon', {}).get('header_title')} ({len(deep_s.get('deep_dungeon', {}).get('spawn_table', []))} spawn rows)")
        print(f"  T-Depth Mob Sheets            : {len(deep_s.get('deep_mob_database', []))} full L2J stat/drop/spoil sheets")

    print("\n[8] LONG-TERM GOVERNANCE CHECKLIST GATES (GOV-01..GOV-10):")
    for g in report.get("gates", []):
        mark = "PASS" if g.get("verified") else "FAIL"
        print(f"  [{mark}] {g['gate_id']} — {g['title']}")
        print(f"         Rule: {g['invariant_rule']}")
        print(f"         CLI : {g['cli_command']}")

    if errors:
        print(f"\nGOVERNANCE VALIDATION FAILED ({len(errors)} error(s)):")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("\nALL 10 LONG-TERM GOVERNANCE GATES PASSED (0 errors).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Long-Term World Studio Governance Validator & Content Scaffolding Tool."
    )
    parser.add_argument("--studio-dir", type=Path, default=DEFAULT_STUDIO_DIR)
    parser.add_argument("--check", action="store_true", help="Run GOV-01..GOV-09 checklist validation.")
    parser.add_argument("--audit", action="store_true", help="Print full governance & lore audit report.")
    parser.add_argument("--audit-races", action="store_true", help="Audit 6 playable + 6 monster races.")
    parser.add_argument("--audit-history", action="store_true", help="Audit 4 history chapters + 6 sealed gods.")
    parser.add_argument("--audit-factions", action="store_true", help="Audit Neutral Adventure Guild & Blacksmith Clan.")
    parser.add_argument("--audit-quests", action="store_true", help="Audit 3-track quest progression loop.")
    parser.add_argument("--audit-bosses", action="store_true", help="Audit God > MVP > Raid Boss hierarchy.")
    parser.add_argument("--audit-growth", action="store_true", help="Audit Level 1-99 Growth Path (A..L) & Lv.1-25 Focus.")
    parser.add_argument("--audit-map-chain", action="store_true", help="Audit World Continent Area Map Chain (Lv.1-25 Hub-and-Spoke + 3-Continent Chain).")
    parser.add_argument("--audit-t-atlas", action="store_true", help="Audit L2J/L2Hub/PMFun T-Shaped World Atlas (T-Breadth Directory + T-Depth Validation Slice).")
    parser.add_argument("--json", action="store_true", help="Emit JSON output for --check.")

    # Scaffolding sub-options
    parser.add_argument("--scaffold-quest", action="store_true", help="Scaffold a race-bound quest JSON.")
    parser.add_argument("--race", type=str, default="human_demi_human", help="Playable race_key for --scaffold-quest.")
    parser.add_argument("--track", type=str, default="side_quest", help="Quest track (main_quest, job_quest, side_quest).")
    parser.add_argument("--title", type=str, default="Seal-Fragment Reconnaissance", help="Quest title.")

    parser.add_argument("--scaffold-boss", action="store_true", help="Scaffold a compliant MVP or Raid Boss JSON.")
    parser.add_argument("--tier", type=str, default="mvp_boss", help="Boss tier (mvp_boss or raid_boss).")
    parser.add_argument("--god", type=str, default="god-legendary-dragon", help="Superior Sealed God ID.")
    parser.add_argument("--node", type=str, default="dungeon-kiln-cellar", help="Target spawn node ID.")
    parser.add_argument("--boss-name", type=str, default="Volcanor the Tri-Scale Apostle", help="Boss display name.")

    args = parser.parse_args(argv)

    if args.scaffold_quest:
        tpl = scaffold_quest_template(args.studio_dir, args.race, args.track, args.title)
        print(json.dumps(tpl, indent=2))
        return 0

    if args.scaffold_boss:
        tpl = scaffold_boss_template(args.studio_dir, args.tier, args.god, args.node, args.boss_name)
        print(json.dumps(tpl, indent=2))
        return 0

    if args.audit_races:
        return _print_audit_report(args.studio_dir, "races")
    if args.audit_history:
        return _print_audit_report(args.studio_dir, "history")
    if args.audit_factions:
        return _print_audit_report(args.studio_dir, "factions")
    if args.audit_quests:
        return _print_audit_report(args.studio_dir, "quests")
    if args.audit_bosses:
        return _print_audit_report(args.studio_dir, "bosses")
    if args.audit_growth:
        return _print_audit_report(args.studio_dir, "growth")
    if args.audit_map_chain:
        return _print_audit_report(args.studio_dir, "map_chain")
    if args.audit_t_atlas:
        return _print_audit_report(args.studio_dir, "t_atlas")
    if args.audit:
        return _print_audit_report(args.studio_dir, "all")

    errors, report = validate_world_governance(args.studio_dir)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for gate in report.get("gates", []):
            status = "PASS" if gate.get("verified") and not errors else "CHECK"
            print(f"[{status}] {gate.get('gate_id')}: {gate.get('title')}")
        if errors:
            for err in errors:
                print(f"ERROR: {err}", file=sys.stderr)
        else:
            print(
                f"OK: {report['summary']['playableRacesCount']} playable races, "
                f"{report['summary']['monsterEcologyRacesCount']} monster ecologies, "
                f"{report['summary']['godTierEntitiesCount']} god-tier entities, "
                f"{report['summary']['historyChaptersCount']} history chapters, "
                f"and {report['summary']['governanceGatesVerified']}/{report['summary']['governanceGatesTotal']} governance gates verified."
            )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
