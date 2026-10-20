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
                "cursedWeaponPvpHotspotsCount": len(t_doc.get("cursed_weapon_pvp_hotspots") or []),
                "dimensionalRiftSepulchersCount": len(t_doc.get("dimensional_rift_sepulchers") or []),
                "weaponAugmentationDyeHubsCount": len(t_doc.get("weapon_augmentation_dye_hubs") or []),
                "companionMountSanctuariesCount": len(t_doc.get("companion_mount_sanctuaries") or []),
                "clanReputationAcademiesCount": len(t_doc.get("clan_reputation_academies") or []),
                "fieldHerbElementalBiomesCount": len(t_doc.get("field_herb_elemental_biomes") or []),
                "soulshotWorkshopPlazasCount": len(t_doc.get("soulshot_workshop_plazas") or []),
                "territoryWardSupplyNodesCount": len(t_doc.get("territory_ward_supply_nodes") or []),
                "epicJewelrySanctumsCount": len(t_doc.get("epic_jewelry_sanctums") or []),
                "adventurerVitalityObelisksCount": len(t_doc.get("adventurer_vitality_obelisks") or []),
                "armorSetMasterworkForgesCount": len(t_doc.get("armor_set_masterwork_forges") or []),
                "kamalokaPailakaInstancesCount": len(t_doc.get("kamaloka_pailaka_instances") or []),
                "forgottenScrollSkillSanctumsCount": len(t_doc.get("forgotten_scroll_skill_sanctums") or []),
                "elementalStoneCaravanQuarriesCount": len(t_doc.get("elemental_stone_caravan_quarries") or []),
                "clanHallAuctionEstatesCount": len(t_doc.get("clan_hall_auction_estates") or []),
                "transformationTalismanSanctumsCount": len(t_doc.get("transformation_talisman_sanctums") or []),
                "warehouseFreightVaultsCount": len(t_doc.get("warehouse_freight_vaults") or []),
                "atlasMasterTelemetryCheckpointsCount": len(t_doc.get("atlas_master_telemetry_checkpoints") or []),
                "festivalOfDarknessOraclesCount": len(t_doc.get("festival_of_darkness_oracles") or []),
                "luxuryBlackMarketBoutiquesCount": len(t_doc.get("luxury_black_market_boutiques") or []),
                "factionAllianceWarCampsCount": len(t_doc.get("faction_alliance_war_camps") or []),
                "monsterTrackFantasyPlazasCount": len(t_doc.get("monster_track_fantasy_plazas") or []),
                "olympiadHeroWeaponExchangesCount": len(t_doc.get("olympiad_hero_weapon_exchanges") or []),
                "treasureChestLockpickGroundsCount": len(t_doc.get("treasure_chest_lockpick_grounds") or []),
                "aerialStarStoneDocksCount": len(t_doc.get("aerial_star_stone_docks") or []),
                "beltCloakWeaverHubsCount": len(t_doc.get("belt_cloak_weaver_hubs") or []),
                "weddingCeremonyCathedralsCount": len(t_doc.get("wedding_ceremony_cathedrals") or []),
                "studioCouncilAuditBenchmarksCount": len(t_doc.get("studio_council_audit_benchmarks") or []),
                "continentalSeedCyclesCount": len(t_doc.get("continental_seed_cycles") or []),
                "partyColiseumTournamentsCount": len(t_doc.get("party_coliseum_tournaments") or []),
                "elementalJewelRuneSanctumsCount": len(t_doc.get("elemental_jewel_rune_sanctums") or []),
                "reputationFameMonumentsCount": len(t_doc.get("reputation_fame_monuments") or []),
                "delusionChamberConduitsCount": len(t_doc.get("delusion_chamber_conduits") or []),
                "commandChannelRaidSanctumsCount": len(t_doc.get("command_channel_raid_sanctums") or []),
                "nevitBlessingSanctuariesCount": len(t_doc.get("nevit_blessing_sanctuaries") or []),
                "eightHourCouncilSignoffLedgerCount": len(t_doc.get("eight_hour_council_signoff_ledger") or []),
                "championMobHerdGroundsCount": len(t_doc.get("champion_mob_herd_grounds") or []),
                "dualswordCraftUnsealForgesCount": len(t_doc.get("dualsword_craft_unseal_forges") or []),
                "techArtAssetPipelineGatesCount": len(t_doc.get("tech_art_asset_pipeline_gates") or []),
                "backendBotSwarmSimulationSectorsCount": len(t_doc.get("backend_bot_swarm_simulation_sectors") or []),
                "liveopsGmControlAnchorsCount": len(t_doc.get("liveops_gm_control_anchors") or []),
                "platformToolsSquadRegistryCount": len(t_doc.get("platform_tools_squad_registry") or []),
                "dialogueLocalizationGraphsCount": len(t_doc.get("dialogue_localization_graphs") or []),
                "spawnerLootBalancerSuitesCount": len(t_doc.get("spawner_loot_balancer_suites") or []),
                "combatSkillTimelineProfilesCount": len(t_doc.get("combat_skill_timeline_profiles") or []),
                "buildFarmPatchCdnNodesCount": len(t_doc.get("build_farm_patch_cdn_nodes") or []),
                "architectDxCodegenGatesCount": len(t_doc.get("architect_dx_codegen_gates") or []),
                "twoRingStudio80dSignoffMatrixCount": len(t_doc.get("two_ring_studio_80d_signoff_matrix") or []),
                "weatherShaderAcousticProfilesCount": len(t_doc.get("weather_shader_acoustic_profiles") or []),
                "serverMeshPersistenceCorridorsCount": len(t_doc.get("server_mesh_persistence_corridors") or []),
                "antiBotEconomySentinelsCount": len(t_doc.get("anti_bot_economy_sentinels") or []),
                "godotStorybookPrefabNodesCount": len(t_doc.get("godot_storybook_prefab_nodes") or []),
                "navmeshObstacleSectorsCount": len(t_doc.get("navmesh_obstacle_sectors") or []),
                "liveopsEventFlagNodesCount": len(t_doc.get("liveops_event_flag_nodes") or []),
                "cinematicCameraRailsCount": len(t_doc.get("cinematic_camera_rails") or []),
                "clientGpuVramBudgetsCount": len(t_doc.get("client_gpu_vram_budgets") or []),
                "automatedQaSmokeSuitesCount": len(t_doc.get("automated_qa_smoke_suites") or []),
                "studio90dMasterLedgerCount": len(t_doc.get("studio_90d_master_ledger") or []),
                "factionReputationDispositionsCount": len(t_doc.get("faction_reputation_dispositions") or []),
                "crossRealmAuctionEscrowsCount": len(t_doc.get("cross_realm_auction_escrows") or []),
                "worldInvasionIncursionsCount": len(t_doc.get("world_invasion_incursions") or []),
                "clanTreasuryPayrollLedgersCount": len(t_doc.get("clan_treasury_payroll_ledgers") or []),
                "playerHousingTrophyEstatesCount": len(t_doc.get("player_housing_trophy_estates") or []),
                "globalCdnWebrtcRelaysCount": len(t_doc.get("global_cdn_webrtc_relays") or []),
                "caravanTradeRoutesCount": len(t_doc.get("caravan_trade_routes") or []),
                "localizationVoiceoverBanksCount": len(t_doc.get("localization_voiceover_banks") or []),
                "crossToolHotReloadBridgesCount": len(t_doc.get("cross_tool_hot_reload_bridges") or []),
                "centennial100dStudioChartersCount": len(t_doc.get("centennial_100d_studio_charters") or []),
                "nocturnalWeatherAffixSpawnsCount": len(t_doc.get("nocturnal_weather_affix_spawns") or []),
                "deterministicCombatReplaysCount": len(t_doc.get("deterministic_combat_replays") or []),
                "archaeologicalLoreCodicesCount": len(t_doc.get("archaeological_lore_codices") or []),
                "destructiblePhysicsBiomesCount": len(t_doc.get("destructible_physics_biomes") or []),
                "bountyManhuntContractsCount": len(t_doc.get("bounty_manhunt_contracts") or []),
                "disasterRecoveryPitrDrillsCount": len(t_doc.get("disaster_recovery_pitr_drills") or []),
                "tavernSocialHubsCount": len(t_doc.get("tavern_social_hubs") or []),
                "churnSentimentInterventionsCount": len(t_doc.get("churn_sentiment_interventions") or []),
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

            # Validate 14 Cursed Weapon, PK Karma Sanctuary & Open-World PvP Arena Hotspots (D33)
            pvp_hotspots = t_doc.get("cursed_weapon_pvp_hotspots") or []
            if pvp_hotspots and len(pvp_hotspots) != 14:
                errors.append(f"GOV-10 violation: cursed_weapon_pvp_hotspots must have 14 hotspots, got {len(pvp_hotspots)}")
            for pv_item in pvp_hotspots:
                if not isinstance(pv_item, dict):
                    continue
                pv_id = str(pv_item.get("hotspot_id", ""))
                pv_zid = str(pv_item.get("zone_id", ""))
                if pv_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: cursed_weapon_pvp_hotspots '{pv_id}' references unknown zone_id '{pv_zid}'"
                    )

            # Validate 16 Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctums (D34)
            rift_sepulchers = t_doc.get("dimensional_rift_sepulchers") or []
            if rift_sepulchers and len(rift_sepulchers) != 16:
                errors.append(f"GOV-10 violation: dimensional_rift_sepulchers must have 16 portals, got {len(rift_sepulchers)}")
            for rs_item in rift_sepulchers:
                if not isinstance(rs_item, dict):
                    continue
                rs_id = str(rs_item.get("portal_id", ""))
                rs_did = str(rs_item.get("dungeon_id", ""))
                rs_pzid = str(rs_item.get("parent_zone_id", ""))
                if rs_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: dimensional_rift_sepulchers '{rs_id}' references unknown dungeon_id '{rs_did}'"
                    )
                if rs_pzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: dimensional_rift_sepulchers '{rs_id}' references unknown parent_zone_id '{rs_pzid}'"
                    )

            # Validate 15 Town Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Hubs (D35)
            aug_dye_hubs = t_doc.get("weapon_augmentation_dye_hubs") or []
            if aug_dye_hubs and len(aug_dye_hubs) != 15:
                errors.append(f"GOV-10 violation: weapon_augmentation_dye_hubs must have 15 hubs, got {len(aug_dye_hubs)}")
            for ad_item in aug_dye_hubs:
                if not isinstance(ad_item, dict):
                    continue
                ad_id = str(ad_item.get("hub_id", ""))
                ad_tzid = str(ad_item.get("town_zone_id", ""))
                ad_dzid = str(ad_item.get("life_stone_drop_zone_id", ""))
                if ad_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: weapon_augmentation_dye_hubs '{ad_id}' references unknown town_zone_id '{ad_tzid}'"
                    )
                if ad_dzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: weapon_augmentation_dye_hubs '{ad_id}' references unknown life_stone_drop_zone_id '{ad_dzid}'"
                    )

            # Validate 12 Pet, Strider & Castle Wyvern Mount Sanctuaries (D36)
            comp_sanctuaries = t_doc.get("companion_mount_sanctuaries") or []
            if comp_sanctuaries and len(comp_sanctuaries) != 12:
                errors.append(
                    f"GOV-10 violation: companion_mount_sanctuaries must have 12 sanctuaries, got {len(comp_sanctuaries)}"
                )
            for cm_item in comp_sanctuaries:
                if not isinstance(cm_item, dict):
                    continue
                cm_id = str(cm_item.get("companion_node_id", ""))
                cm_zid = str(cm_item.get("zone_id", ""))
                if cm_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: companion_mount_sanctuaries '{cm_id}' references unknown zone_id '{cm_zid}'"
                    )

            # Validate 14 Clan Reputation, Academy & Pledge Skill Sanctums (D37)
            clan_academies = t_doc.get("clan_reputation_academies") or []
            if clan_academies and len(clan_academies) != 14:
                errors.append(
                    f"GOV-10 violation: clan_reputation_academies must have 14 nodes, got {len(clan_academies)}"
                )
            for ca_item in clan_academies:
                if not isinstance(ca_item, dict):
                    continue
                ca_id = str(ca_item.get("clan_node_id", ""))
                ca_zid = str(ca_item.get("zone_id", ""))
                if ca_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: clan_reputation_academies '{ca_id}' references unknown zone_id '{ca_zid}'"
                    )

            # Validate 24 Field Elemental Attribute & Ground Herb Sustainability Biomes (D38)
            field_zone_ids_only = {
                str(z.get("zone_id", ""))
                for z in (zdir.get("fields_and_hunting_areas") or [])
                if isinstance(z, dict) and z.get("zone_id")
            }
            herb_biomes = t_doc.get("field_herb_elemental_biomes") or []
            if herb_biomes and len(herb_biomes) != 24:
                errors.append(
                    f"GOV-10 violation: field_herb_elemental_biomes must have 24 biomes, got {len(herb_biomes)}"
                )
            for hb_item in herb_biomes:
                if not isinstance(hb_item, dict):
                    continue
                hb_id = str(hb_item.get("biome_id", ""))
                hb_fzid = str(hb_item.get("field_zone_id", ""))
                if hb_fzid not in field_zone_ids_only:
                    errors.append(
                        f"GOV-10 violation: field_herb_elemental_biomes '{hb_id}' references unknown field_zone_id '{hb_fzid}'"
                    )

            # Validate 15 Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Plazas (D39)
            workshop_plazas = t_doc.get("soulshot_workshop_plazas") or []
            if workshop_plazas and len(workshop_plazas) != 15:
                errors.append(
                    f"GOV-10 violation: soulshot_workshop_plazas must have 15 plazas, got {len(workshop_plazas)}"
                )
            for wp_item in workshop_plazas:
                if not isinstance(wp_item, dict):
                    continue
                wp_id = str(wp_item.get("workshop_id", ""))
                wp_tzid = str(wp_item.get("town_zone_id", ""))
                wp_szid = str(wp_item.get("recipe_spoil_zone_id", ""))
                if wp_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: soulshot_workshop_plazas '{wp_id}' references unknown town_zone_id '{wp_tzid}'"
                    )
                if wp_szid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: soulshot_workshop_plazas '{wp_id}' references unknown recipe_spoil_zone_id '{wp_szid}'"
                    )

            # Validate 16 Territory War & Fortress Giant's Codex Supply Nodes (D40)
            ward_nodes = t_doc.get("territory_ward_supply_nodes") or []
            if ward_nodes and len(ward_nodes) != 16:
                errors.append(
                    f"GOV-10 violation: territory_ward_supply_nodes must have 16 nodes, got {len(ward_nodes)}"
                )
            for wn_item in ward_nodes:
                if not isinstance(wn_item, dict):
                    continue
                wn_id = str(wn_item.get("ward_node_id", ""))
                wn_szid = str(wn_item.get("stronghold_zone_id", ""))
                wn_vzid = str(wn_item.get("linked_vassal_zone_id", ""))
                if wn_szid not in fort_zone_ids:
                    errors.append(
                        f"GOV-10 violation: territory_ward_supply_nodes '{wn_id}' references unknown stronghold_zone_id '{wn_szid}'"
                    )
                if wn_vzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: territory_ward_supply_nodes '{wn_id}' references unknown linked_vassal_zone_id '{wn_vzid}'"
                    )

            # Validate 15 Town Iron Gate Warehouse, Clan Vault & Freight Logistics Hubs (D49)
            wh_vaults = t_doc.get("warehouse_freight_vaults") or []
            if wh_vaults and len(wh_vaults) != 15:
                errors.append(
                    f"GOV-10 violation: warehouse_freight_vaults must have 15 vaults, got {len(wh_vaults)}"
                )
            for wv_item in wh_vaults:
                if not isinstance(wv_item, dict):
                    continue
                wv_id = str(wv_item.get("vault_id", ""))
                wv_tzid = str(wv_item.get("town_zone_id", ""))
                wv_pzid = str(wv_item.get("freight_corridor_partner_zone_id", ""))
                if wv_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: warehouse_freight_vaults '{wv_id}' references unknown town_zone_id '{wv_tzid}'"
                    )
                if wv_pzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: warehouse_freight_vaults '{wv_id}' references unknown freight_corridor_partner_zone_id '{wv_pzid}'"
                    )

            # Validate 18 Master Cartographic Tour & 50-Dimension Studio Checkpoints (D50)
            tour_checkpoints = t_doc.get("atlas_master_telemetry_checkpoints") or []
            if tour_checkpoints and len(tour_checkpoints) != 18:
                errors.append(
                    f"GOV-10 violation: atlas_master_telemetry_checkpoints must have 18 checkpoints, got {len(tour_checkpoints)}"
                )
            for tc_item in tour_checkpoints:
                if not isinstance(tc_item, dict):
                    continue
                tc_id = str(tc_item.get("checkpoint_id", ""))
                tc_zid = str(tc_item.get("zone_id", ""))
                tc_did = str(tc_item.get("dungeon_id", ""))
                if tc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: atlas_master_telemetry_checkpoints '{tc_id}' references unknown zone_id '{tc_zid}'"
                    )
                if tc_did and tc_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: atlas_master_telemetry_checkpoints '{tc_id}' references unknown dungeon_id '{tc_did}'"
                    )

            # Validate 15 Town Festival of Darkness & Oracle of Dawn/Dusk Party Altars (D51)
            festival_oracles = t_doc.get("festival_of_darkness_oracles") or []
            if festival_oracles and len(festival_oracles) != 15:
                errors.append(
                    f"GOV-10 violation: festival_of_darkness_oracles must have 15 town oracles, got {len(festival_oracles)}"
                )
            for fo_item in festival_oracles:
                if not isinstance(fo_item, dict):
                    continue
                fo_id = str(fo_item.get("oracle_id", ""))
                fo_tzid = str(fo_item.get("town_zone_id", ""))
                if fo_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: festival_of_darkness_oracles '{fo_id}' references unknown town_zone_id '{fo_tzid}'"
                    )

            # Validate 12 Luxury Boutique & Black Marketeer of Mammon Exchange Nodes (D52)
            luxury_boutiques = t_doc.get("luxury_black_market_boutiques") or []
            if luxury_boutiques and len(luxury_boutiques) != 12:
                errors.append(
                    f"GOV-10 violation: luxury_black_market_boutiques must have 12 boutiques, got {len(luxury_boutiques)}"
                )
            for lb_item in luxury_boutiques:
                if not isinstance(lb_item, dict):
                    continue
                lb_id = str(lb_item.get("boutique_id", ""))
                lb_zid = str(lb_item.get("zone_id", ""))
                if lb_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: luxury_black_market_boutiques '{lb_id}' references unknown zone_id '{lb_zid}'"
                    )

            # Validate 14 Factional Alliance War & Totem Raid Altar Nodes (D53)
            faction_camps = t_doc.get("faction_alliance_war_camps") or []
            if faction_camps and len(faction_camps) != 14:
                errors.append(
                    f"GOV-10 violation: faction_alliance_war_camps must have 14 camps, got {len(faction_camps)}"
                )
            for fc_item in faction_camps:
                if not isinstance(fc_item, dict):
                    continue
                fc_id = str(fc_item.get("camp_id", ""))
                fc_zid = str(fc_item.get("zone_id", ""))
                fc_rzid = str(fc_item.get("rival_camp_zone_id", ""))
                if fc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: faction_alliance_war_camps '{fc_id}' references unknown zone_id '{fc_zid}'"
                    )
                if fc_rzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: faction_alliance_war_camps '{fc_id}' references unknown rival_camp_zone_id '{fc_rzid}'"
                    )

            # Validate 12 Monster Derby Race Track, Coin of Magic & Kratei's Cube Plazas (D54)
            fantasy_plazas = t_doc.get("monster_track_fantasy_plazas") or []
            if fantasy_plazas and len(fantasy_plazas) != 12:
                errors.append(
                    f"GOV-10 violation: monster_track_fantasy_plazas must have 12 plazas, got {len(fantasy_plazas)}"
                )
            for fp_item in fantasy_plazas:
                if not isinstance(fp_item, dict):
                    continue
                fp_id = str(fp_item.get("plaza_id", ""))
                fp_zid = str(fp_item.get("zone_id", ""))
                if fp_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: monster_track_fantasy_plazas '{fp_id}' references unknown zone_id '{fp_zid}'"
                    )

            # Validate 15 Town Hero Weapon (Infinity Armaments) & Olympiad Token Exchanges (D55)
            hero_exchanges = t_doc.get("olympiad_hero_weapon_exchanges") or []
            if hero_exchanges and len(hero_exchanges) != 15:
                errors.append(
                    f"GOV-10 violation: olympiad_hero_weapon_exchanges must have 15 town exchanges, got {len(hero_exchanges)}"
                )
            for he_item in hero_exchanges:
                if not isinstance(he_item, dict):
                    continue
                he_id = str(he_item.get("exchange_id", ""))
                he_tzid = str(he_item.get("town_zone_id", ""))
                if he_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: olympiad_hero_weapon_exchanges '{he_id}' references unknown town_zone_id '{he_tzid}'"
                    )

            # Validate 16 Treasure Chest Lockpick (Grade 1-8 Keys) & Mimic Cache Grounds (D56)
            treasure_caches = t_doc.get("treasure_chest_lockpick_grounds") or []
            if treasure_caches and len(treasure_caches) != 16:
                errors.append(
                    f"GOV-10 violation: treasure_chest_lockpick_grounds must have 16 caches, got {len(treasure_caches)}"
                )
            for tc_item in treasure_caches:
                if not isinstance(tc_item, dict):
                    continue
                tc_id = str(tc_item.get("cache_id", ""))
                tc_zid = str(tc_item.get("zone_id", ""))
                tc_did = str(tc_item.get("dungeon_id", ""))
                if tc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: treasure_chest_lockpick_grounds '{tc_id}' references unknown zone_id '{tc_zid}'"
                    )
                if tc_did and tc_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: treasure_chest_lockpick_grounds '{tc_id}' references unknown dungeon_id '{tc_did}'"
                    )

            # Validate 12 Clan Airship Summon Dock, Star Stone Extraction & Aerial Raid Nodes (D57)
            aerial_docks = t_doc.get("aerial_star_stone_docks") or []
            if aerial_docks and len(aerial_docks) != 12:
                errors.append(
                    f"GOV-10 violation: aerial_star_stone_docks must have 12 aerial nodes, got {len(aerial_docks)}"
                )
            for ad_item in aerial_docks:
                if not isinstance(ad_item, dict):
                    continue
                ad_id = str(ad_item.get("aerial_node_id", ""))
                ad_zid = str(ad_item.get("zone_id", ""))
                ad_czid = str(ad_item.get("connected_dock_zone_id", ""))
                if ad_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: aerial_star_stone_docks '{ad_id}' references unknown zone_id '{ad_zid}'"
                    )
                if ad_czid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: aerial_star_stone_docks '{ad_id}' references unknown connected_dock_zone_id '{ad_czid}'"
                    )

            # Validate 14 Weaver Olf Mithril Belt & Sovereign Boss/Castle Cloak Hubs (D58)
            weaver_hubs = t_doc.get("belt_cloak_weaver_hubs") or []
            if weaver_hubs and len(weaver_hubs) != 14:
                errors.append(
                    f"GOV-10 violation: belt_cloak_weaver_hubs must have 14 weaver/cloak hubs, got {len(weaver_hubs)}"
                )
            for wh_item in weaver_hubs:
                if not isinstance(wh_item, dict):
                    continue
                wh_id = str(wh_item.get("weaver_hub_id", ""))
                wh_zid = str(wh_item.get("zone_id", ""))
                wh_did = str(wh_item.get("dungeon_id", ""))
                if wh_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: belt_cloak_weaver_hubs '{wh_id}' references unknown zone_id '{wh_zid}'"
                    )
                if wh_did and wh_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: belt_cloak_weaver_hubs '{wh_id}' references unknown dungeon_id '{wh_did}'"
                    )

            # Validate 12 Wedding Cathedral, Formal Wear & Couple Teleport Sanctuaries (D59)
            wedding_cathedrals = t_doc.get("wedding_ceremony_cathedrals") or []
            if wedding_cathedrals and len(wedding_cathedrals) != 12:
                errors.append(
                    f"GOV-10 violation: wedding_ceremony_cathedrals must have 12 wedding sanctuaries, got {len(wedding_cathedrals)}"
                )
            for wc_item in wedding_cathedrals:
                if not isinstance(wc_item, dict):
                    continue
                wc_id = str(wc_item.get("sanctuary_id", ""))
                wc_zid = str(wc_item.get("zone_id", ""))
                if wc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: wedding_ceremony_cathedrals '{wc_id}' references unknown zone_id '{wc_zid}'"
                    )

            # Validate 18 6-Role Studio Council 60-Dimension Audit Benchmarks (D60)
            council_benchmarks = t_doc.get("studio_council_audit_benchmarks") or []
            if council_benchmarks and len(council_benchmarks) != 18:
                errors.append(
                    f"GOV-10 violation: studio_council_audit_benchmarks must have 18 council benchmarks, got {len(council_benchmarks)}"
                )
            for cb_item in council_benchmarks:
                if not isinstance(cb_item, dict):
                    continue
                cb_id = str(cb_item.get("benchmark_id", ""))
                cb_zid = str(cb_item.get("exemplar_zone_id", ""))
                cb_did = str(cb_item.get("exemplar_dungeon_id", ""))
                if cb_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: studio_council_audit_benchmarks '{cb_id}' references unknown exemplar_zone_id '{cb_zid}'"
                    )
                if cb_did and cb_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: studio_council_audit_benchmarks '{cb_id}' references unknown exemplar_dungeon_id '{cb_did}'"
                    )

            # Validate 14 Continental Seed Cycle (Stage 1-5 Ekimus/Tiat State Machine) Nodes (D61)
            seed_cycles = t_doc.get("continental_seed_cycles") or []
            if seed_cycles and len(seed_cycles) != 14:
                errors.append(
                    f"GOV-10 violation: continental_seed_cycles must have 14 seed cycle nodes, got {len(seed_cycles)}"
                )
            for sc_item in seed_cycles:
                if not isinstance(sc_item, dict):
                    continue
                sc_id = str(sc_item.get("seed_node_id", ""))
                sc_zid = str(sc_item.get("zone_id", ""))
                sc_did = str(sc_item.get("dungeon_id", ""))
                if sc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: continental_seed_cycles '{sc_id}' references unknown zone_id '{sc_zid}'"
                    )
                if sc_did and sc_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: continental_seed_cycles '{sc_id}' references unknown dungeon_id '{sc_did}'"
                    )

            # Validate 12 Underground Coliseum (Party-vs-Party) & Clan Tournament Arenas (D62)
            coliseum_tournaments = t_doc.get("party_coliseum_tournaments") or []
            if coliseum_tournaments and len(coliseum_tournaments) != 12:
                errors.append(
                    f"GOV-10 violation: party_coliseum_tournaments must have 12 coliseum tournament arenas, got {len(coliseum_tournaments)}"
                )
            for ct_item in coliseum_tournaments:
                if not isinstance(ct_item, dict):
                    continue
                ct_id = str(ct_item.get("arena_id", ""))
                ct_zid = str(ct_item.get("zone_id", ""))
                if ct_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: party_coliseum_tournaments '{ct_id}' references unknown zone_id '{ct_zid}'"
                    )

            # Validate 14 Elemental Jewel, Raid Rune Stone & Ancient Giant's Relic Sanctums (D63)
            jewel_rune_sanctums = t_doc.get("elemental_jewel_rune_sanctums") or []
            if jewel_rune_sanctums and len(jewel_rune_sanctums) != 14:
                errors.append(
                    f"GOV-10 violation: elemental_jewel_rune_sanctums must have 14 elemental jewel/rune sanctums, got {len(jewel_rune_sanctums)}"
                )
            for jrs_item in jewel_rune_sanctums:
                if not isinstance(jrs_item, dict):
                    continue
                jrs_id = str(jrs_item.get("sanctum_id", ""))
                jrs_zid = str(jrs_item.get("zone_id", ""))
                jrs_did = str(jrs_item.get("dungeon_id", ""))
                if jrs_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: elemental_jewel_rune_sanctums '{jrs_id}' references unknown zone_id '{jrs_zid}'"
                    )
                if jrs_did and jrs_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: elemental_jewel_rune_sanctums '{jrs_id}' references unknown dungeon_id '{jrs_did}'"
                    )

            # Validate 15 Town Reputation Manager Fame & PvP Infusion Monuments (D64)
            fame_monuments = t_doc.get("reputation_fame_monuments") or []
            if fame_monuments and len(fame_monuments) != 15:
                errors.append(
                    f"GOV-10 violation: reputation_fame_monuments must have 15 reputation fame monuments, got {len(fame_monuments)}"
                )
            for fm_item in fame_monuments:
                if not isinstance(fm_item, dict):
                    continue
                fm_id = str(fm_item.get("monument_id", ""))
                fm_tzid = str(fm_item.get("town_zone_id", ""))
                if fm_tzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: reputation_fame_monuments '{fm_id}' references unknown town_zone_id '{fm_tzid}'"
                    )

            # Validate 12 Delusion Chamber & Aenkinel Raid Conduits (D65)
            delusion_conduits = t_doc.get("delusion_chamber_conduits") or []
            if delusion_conduits and len(delusion_conduits) != 12:
                errors.append(
                    f"GOV-10 violation: delusion_chamber_conduits must have 12 delusion chamber conduits, got {len(delusion_conduits)}"
                )
            for dc_item in delusion_conduits:
                if not isinstance(dc_item, dict):
                    continue
                dc_id = str(dc_item.get("conduit_id", ""))
                dc_zid = str(dc_item.get("zone_id", ""))
                dc_did = str(dc_item.get("dungeon_id", ""))
                if dc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: delusion_chamber_conduits '{dc_id}' references unknown zone_id '{dc_zid}'"
                    )
                if dc_did and dc_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: delusion_chamber_conduits '{dc_id}' references unknown dungeon_id '{dc_did}'"
                    )

            # Validate 14 Zaken Candlelight, Ice Queen Freya & Frintezza Organ Command-Channel Raid Sanctums (D66)
            cc_raid_sanctums = t_doc.get("command_channel_raid_sanctums") or []
            if cc_raid_sanctums and len(cc_raid_sanctums) != 14:
                errors.append(
                    f"GOV-10 violation: command_channel_raid_sanctums must have 14 command-channel raid sanctums, got {len(cc_raid_sanctums)}"
                )
            for cc_item in cc_raid_sanctums:
                if not isinstance(cc_item, dict):
                    continue
                cc_id = str(cc_item.get("raid_sanctum_id", ""))
                cc_zid = str(cc_item.get("zone_id", ""))
                cc_did = str(cc_item.get("dungeon_id", ""))
                if cc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: command_channel_raid_sanctums '{cc_id}' references unknown zone_id '{cc_zid}'"
                    )
                if cc_did and cc_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: command_channel_raid_sanctums '{cc_id}' references unknown dungeon_id '{cc_did}'"
                    )

            # Validate 15 Town Nevit's Blessing Hourglass & Hunting Helper Sanctuaries (D67)
            nevit_sanctuaries = t_doc.get("nevit_blessing_sanctuaries") or []
            if nevit_sanctuaries and len(nevit_sanctuaries) != 15:
                errors.append(
                    f"GOV-10 violation: nevit_blessing_sanctuaries must have 15 sanctuaries, got {len(nevit_sanctuaries)}"
                )
            for nb_item in nevit_sanctuaries:
                if not isinstance(nb_item, dict):
                    continue
                nb_id = str(nb_item.get("sanctuary_id", ""))
                nb_tzid = str(nb_item.get("town_zone_id", ""))
                if nb_tzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: nevit_blessing_sanctuaries '{nb_id}' references unknown town_zone_id '{nb_tzid}'"
                    )

            # Validate 24-Record 8-Hour Studio Council Complete D1-D68 Sign-Off Ledger (D68)
            council_signoffs = t_doc.get("eight_hour_council_signoff_ledger") or []
            if council_signoffs and len(council_signoffs) != 24:
                errors.append(
                    f"GOV-10 violation: eight_hour_council_signoff_ledger must have 24 sign-off records, got {len(council_signoffs)}"
                )
            for cs_item in council_signoffs:
                if not isinstance(cs_item, dict):
                    continue
                cs_id = str(cs_item.get("signoff_id", ""))
                cs_zid = str(cs_item.get("zone_id", ""))
                cs_did = str(cs_item.get("dungeon_id", ""))
                if cs_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: eight_hour_council_signoff_ledger '{cs_id}' references unknown zone_id '{cs_zid}'"
                    )
                if cs_did and cs_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: eight_hour_council_signoff_ledger '{cs_id}' references unknown dungeon_id '{cs_did}'"
                    )

            # Validate 16-Zone Champion Mob Aura (Blue 10x / Red 50x) & Group Herd Leader Grounds (D69)
            champion_grounds = t_doc.get("champion_mob_herd_grounds") or []
            if champion_grounds and len(champion_grounds) != 16:
                errors.append(
                    f"GOV-10 violation: champion_mob_herd_grounds must have 16 champion/herd grounds, got {len(champion_grounds)}"
                )
            for cg_item in champion_grounds:
                if not isinstance(cg_item, dict):
                    continue
                cg_id = str(cg_item.get("ground_id", ""))
                cg_zid = str(cg_item.get("zone_id", ""))
                cg_did = str(cg_item.get("dungeon_id", ""))
                if cg_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: champion_mob_herd_grounds '{cg_id}' references unknown zone_id '{cg_zid}'"
                    )
                if cg_did and cg_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: champion_mob_herd_grounds '{cg_id}' references unknown dungeon_id '{cg_did}'"
                    )

            # Validate 15-Town Dualsword Craft Stamp & Maestro Ishuma S80/S84 Unseal Forges (D70)
            dualsword_forges = t_doc.get("dualsword_craft_unseal_forges") or []
            if dualsword_forges and len(dualsword_forges) != 15:
                errors.append(
                    f"GOV-10 violation: dualsword_craft_unseal_forges must have 15 town dualsword forges, got {len(dualsword_forges)}"
                )
            for df_item in dualsword_forges:
                if not isinstance(df_item, dict):
                    continue
                df_id = str(df_item.get("forge_id", ""))
                df_tzid = str(df_item.get("town_zone_id", ""))
                if df_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: dualsword_craft_unseal_forges '{df_id}' references unknown town_zone_id '{df_tzid}'"
                    )

            # Validate 16-Node Technical Artist 3-Tier GLB Asset Resolve, Poly/Bone Validator & Godot Chunk Baking Gates (D71)
            tech_art_gates = t_doc.get("tech_art_asset_pipeline_gates") or []
            if tech_art_gates and len(tech_art_gates) != 16:
                errors.append(
                    f"GOV-10 violation: tech_art_asset_pipeline_gates must have 16 tech-art asset pipeline gates, got {len(tech_art_gates)}"
                )
            for ta_item in tech_art_gates:
                if not isinstance(ta_item, dict):
                    continue
                ta_id = str(ta_item.get("gate_id", ""))
                ta_zid = str(ta_item.get("zone_id", ""))
                ta_did = str(ta_item.get("dungeon_id", ""))
                if ta_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: tech_art_asset_pipeline_gates '{ta_id}' references unknown zone_id '{ta_zid}'"
                    )
                if ta_did and ta_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: tech_art_asset_pipeline_gates '{ta_id}' references unknown dungeon_id '{ta_did}'"
                    )

            # Validate 16-Node Backend 10,000-Bot Swarm Simulator, Spatial Partitioning & Deterministic Replay Sectors (D72)
            bot_swarm_sectors = t_doc.get("backend_bot_swarm_simulation_sectors") or []
            if bot_swarm_sectors and len(bot_swarm_sectors) != 16:
                errors.append(
                    f"GOV-10 violation: backend_bot_swarm_simulation_sectors must have 16 backend simulation sectors, got {len(bot_swarm_sectors)}"
                )
            for bs_item in bot_swarm_sectors:
                if not isinstance(bs_item, dict):
                    continue
                bs_id = str(bs_item.get("sector_id", ""))
                bs_zid = str(bs_item.get("zone_id", ""))
                bs_did = str(bs_item.get("dungeon_id", ""))
                if bs_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: backend_bot_swarm_simulation_sectors '{bs_id}' references unknown zone_id '{bs_zid}'"
                    )
                if bs_did and bs_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: backend_bot_swarm_simulation_sectors '{bs_id}' references unknown dungeon_id '{bs_did}'"
                    )

            # Validate 15-Town LiveOps, Build & GM Portal Control Anchors (D73)
            liveops_anchors = t_doc.get("liveops_gm_control_anchors") or []
            if liveops_anchors and len(liveops_anchors) != 15:
                errors.append(
                    f"GOV-10 violation: liveops_gm_control_anchors must have 15 town LiveOps & GM control anchors, got {len(liveops_anchors)}"
                )
            for la_item in liveops_anchors:
                if not isinstance(la_item, dict):
                    continue
                la_id = str(la_item.get("anchor_id", ""))
                la_tzid = str(la_item.get("town_zone_id", ""))
                if la_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: liveops_gm_control_anchors '{la_id}' references unknown town_zone_id '{la_tzid}'"
                    )

            # Validate 20-Tool 4-Domain × 5-Role Platform & Tools Squad Unified Pipeline Registry (D74)
            tools_registry = t_doc.get("platform_tools_squad_registry") or []
            if tools_registry and len(tools_registry) != 20:
                errors.append(
                    f"GOV-10 violation: platform_tools_squad_registry must have 20 platform & tools squad entries, got {len(tools_registry)}"
                )
            for tr_item in tools_registry:
                if not isinstance(tr_item, dict):
                    continue
                tr_id = str(tr_item.get("tool_id", ""))
                tr_zid = str(tr_item.get("exemplar_zone_id", ""))
                tr_did = str(tr_item.get("exemplar_dungeon_id", ""))
                if tr_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: platform_tools_squad_registry '{tr_id}' references unknown exemplar_zone_id '{tr_zid}'"
                    )
                if tr_did and tr_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: platform_tools_squad_registry '{tr_id}' references unknown exemplar_dungeon_id '{tr_did}'"
                    )

            # Validate 18-Graph Branching Quest/Dialogue DAG & EN/TH Localization Validator Matrix (D75)
            dialogue_graphs = t_doc.get("dialogue_localization_graphs") or []
            if dialogue_graphs and len(dialogue_graphs) != 18:
                errors.append(
                    f"GOV-10 violation: dialogue_localization_graphs must have 18 dialogue/localization graphs, got {len(dialogue_graphs)}"
                )
            for dg_item in dialogue_graphs:
                if not isinstance(dg_item, dict):
                    continue
                dg_id = str(dg_item.get("graph_id", ""))
                dg_zid = str(dg_item.get("zone_id", ""))
                dg_did = str(dg_item.get("dungeon_id", ""))
                if dg_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: dialogue_localization_graphs '{dg_id}' references unknown zone_id '{dg_zid}'"
                    )
                if dg_did and dg_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: dialogue_localization_graphs '{dg_id}' references unknown dungeon_id '{dg_did}'"
                    )

            # Validate 16-Zone Visual Spawner Placement, Monte-Carlo Loot Balancer & Hot-Reload SSOT Write-Back Matrix (D76)
            balancer_suites = t_doc.get("spawner_loot_balancer_suites") or []
            if balancer_suites and len(balancer_suites) != 16:
                errors.append(
                    f"GOV-10 violation: spawner_loot_balancer_suites must have 16 spawner/loot balancer suites, got {len(balancer_suites)}"
                )
            for bs_suite in balancer_suites:
                if not isinstance(bs_suite, dict):
                    continue
                bs_sid = str(bs_suite.get("suite_id", ""))
                bs_szid = str(bs_suite.get("zone_id", ""))
                bs_sdid = str(bs_suite.get("dungeon_id", ""))
                if bs_szid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: spawner_loot_balancer_suites '{bs_sid}' references unknown zone_id '{bs_szid}'"
                    )
                if bs_sdid and bs_sdid not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: spawner_loot_balancer_suites '{bs_sid}' references unknown dungeon_id '{bs_sdid}'"
                    )

            # Validate 16-Archetype Combat Skill Timeline, Hitbox Frame & Boss Telegraph VFX Matrix (D77)
            skill_timelines = t_doc.get("combat_skill_timeline_profiles") or []
            if skill_timelines and len(skill_timelines) != 16:
                errors.append(
                    f"GOV-10 violation: combat_skill_timeline_profiles must have 16 skill timeline profiles, got {len(skill_timelines)}"
                )
            for st_item in skill_timelines:
                if not isinstance(st_item, dict):
                    continue
                st_id = str(st_item.get("timeline_id", ""))
                st_zid = str(st_item.get("zone_id", ""))
                st_did = str(st_item.get("dungeon_id", ""))
                if st_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: combat_skill_timeline_profiles '{st_id}' references unknown zone_id '{st_zid}'"
                    )
                if st_did and st_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: combat_skill_timeline_profiles '{st_id}' references unknown dungeon_id '{st_did}'"
                    )

            # Validate 15-Node Client/Server Build Farm, Asset Cooker & Delta Patch CDN Matrix (D78)
            build_farm_nodes = t_doc.get("build_farm_patch_cdn_nodes") or []
            if build_farm_nodes and len(build_farm_nodes) != 15:
                errors.append(
                    f"GOV-10 violation: build_farm_patch_cdn_nodes must have 15 town build farm/CDN nodes, got {len(build_farm_nodes)}"
                )
            for bf_item in build_farm_nodes:
                if not isinstance(bf_item, dict):
                    continue
                bf_id = str(bf_item.get("build_node_id", ""))
                bf_tzid = str(bf_item.get("town_zone_id", ""))
                if bf_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: build_farm_patch_cdn_nodes '{bf_id}' references unknown town_zone_id '{bf_tzid}'"
                    )

            # Validate 15-Town Architect DX, Cross-Tool Undo/Redo & Codegen Drift-Gate Matrix (D79)
            arch_dx_gates = t_doc.get("architect_dx_codegen_gates") or []
            if arch_dx_gates and len(arch_dx_gates) != 15:
                errors.append(
                    f"GOV-10 violation: architect_dx_codegen_gates must have 15 town architect DX/codegen gates, got {len(arch_dx_gates)}"
                )
            for dx_item in arch_dx_gates:
                if not isinstance(dx_item, dict):
                    continue
                dx_id = str(dx_item.get("dx_gate_id", ""))
                dx_tzid = str(dx_item.get("town_zone_id", ""))
                if dx_tzid not in town_zone_ids:
                    errors.append(
                        f"GOV-10 violation: architect_dx_codegen_gates '{dx_id}' references unknown town_zone_id '{dx_tzid}'"
                    )

            # Validate 22-Record Two-Ring Studio (11-Role) 80D Sign-Off Matrix (D80)
            two_ring_matrix = t_doc.get("two_ring_studio_80d_signoff_matrix") or []
            if two_ring_matrix and len(two_ring_matrix) != 22:
                errors.append(
                    f"GOV-10 violation: two_ring_studio_80d_signoff_matrix must have 22 sign-off records, got {len(two_ring_matrix)}"
                )
            for tr_item in two_ring_matrix:
                if not isinstance(tr_item, dict):
                    continue
                tr_id = str(tr_item.get("matrix_record_id", ""))
                tr_zid = str(tr_item.get("zone_id", ""))
                tr_did = str(tr_item.get("dungeon_id", ""))
                if tr_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: two_ring_studio_80d_signoff_matrix '{tr_id}' references unknown zone_id '{tr_zid}'"
                    )
                if tr_did and tr_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: two_ring_studio_80d_signoff_matrix '{tr_id}' references unknown dungeon_id '{tr_did}'"
                    )

            # Validate 16-Zone Dynamic Weather, Day/Night Shader & Spatial Audio Acoustic Matrix (D81)
            weather_acoustic_profiles = t_doc.get("weather_shader_acoustic_profiles") or []
            if weather_acoustic_profiles and len(weather_acoustic_profiles) != 16:
                errors.append(
                    f"GOV-10 violation: weather_shader_acoustic_profiles must have 16 weather/shader/acoustic profiles, got {len(weather_acoustic_profiles)}"
                )
            for wa_item in weather_acoustic_profiles:
                if not isinstance(wa_item, dict):
                    continue
                wa_id = str(wa_item.get("profile_id", ""))
                wa_zid = str(wa_item.get("zone_id", ""))
                wa_did = str(wa_item.get("dungeon_id", ""))
                if wa_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: weather_shader_acoustic_profiles '{wa_id}' references unknown zone_id '{wa_zid}'"
                    )
                if wa_did and wa_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: weather_shader_acoustic_profiles '{wa_id}' references unknown dungeon_id '{wa_did}'"
                    )

            # Validate 15-Corridor Server-Mesh Authority Handoff, Redis Stream Bus & PostgreSQL Write-Behind Matrix (D82)
            mesh_corridors = t_doc.get("server_mesh_persistence_corridors") or []
            if mesh_corridors and len(mesh_corridors) != 15:
                errors.append(
                    f"GOV-10 violation: server_mesh_persistence_corridors must have 15 server-mesh persistence corridors, got {len(mesh_corridors)}"
                )
            for mc_item in mesh_corridors:
                if not isinstance(mc_item, dict):
                    continue
                mc_id = str(mc_item.get("corridor_id", ""))
                mc_ozid = str(mc_item.get("origin_zone_id", ""))
                mc_dzid = str(mc_item.get("destination_zone_id", ""))
                if mc_ozid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: server_mesh_persistence_corridors '{mc_id}' references unknown origin_zone_id '{mc_ozid}'"
                    )
                if mc_dzid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: server_mesh_persistence_corridors '{mc_id}' references unknown destination_zone_id '{mc_dzid}'"
                    )

            # Validate 16-Node Anti-Bot / RMT Telemetry, Macro Captcha & Economy Anomaly Sentinel Matrix (D83)
            anti_bot_sentinels = t_doc.get("anti_bot_economy_sentinels") or []
            if anti_bot_sentinels and len(anti_bot_sentinels) < 16:
                errors.append(
                    f"GOV-10 violation: anti_bot_economy_sentinels must have at least 16 sentinels, got {len(anti_bot_sentinels)}"
                )
            for ab_item in anti_bot_sentinels:
                if not isinstance(ab_item, dict):
                    continue
                ab_id = str(ab_item.get("sentinel_id", ""))
                ab_zid = str(ab_item.get("zone_id", ""))
                ab_did = str(ab_item.get("dungeon_id", ""))
                if ab_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: anti_bot_economy_sentinels '{ab_id}' references unknown zone_id '{ab_zid}'"
                    )
                if ab_did and ab_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: anti_bot_economy_sentinels '{ab_id}' references unknown dungeon_id '{ab_did}'"
                    )

            # Validate 15-Node Godot Tool-Scene Storybook & 3D Kitbash Prefab Inspector Matrix (D84)
            godot_storybook_prefabs = t_doc.get("godot_storybook_prefab_nodes") or []
            if godot_storybook_prefabs and len(godot_storybook_prefabs) < 15:
                errors.append(
                    f"GOV-10 violation: godot_storybook_prefab_nodes must have at least 15 prefabs, got {len(godot_storybook_prefabs)}"
                )
            for gp_item in godot_storybook_prefabs:
                if not isinstance(gp_item, dict):
                    continue
                gp_id = str(gp_item.get("prefab_id", ""))
                gp_zid = str(gp_item.get("zone_id", ""))
                if gp_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: godot_storybook_prefab_nodes '{gp_id}' references unknown zone_id '{gp_zid}'"
                    )

            # Validate 16-Node NavMesh 3D Pathfinding, Jump-Link & Dynamic Door/Bridge Obstacle Matrix (D85)
            navmesh_sectors = t_doc.get("navmesh_obstacle_sectors") or []
            if navmesh_sectors and len(navmesh_sectors) < 16:
                errors.append(
                    f"GOV-10 violation: navmesh_obstacle_sectors must have at least 16 sectors, got {len(navmesh_sectors)}"
                )
            for nm_item in navmesh_sectors:
                if not isinstance(nm_item, dict):
                    continue
                nm_id = str(nm_item.get("navmesh_id", ""))
                nm_zid = str(nm_item.get("zone_id", ""))
                nm_did = str(nm_item.get("dungeon_id", ""))
                if nm_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: navmesh_obstacle_sectors '{nm_id}' references unknown zone_id '{nm_zid}'"
                    )
                if nm_did and nm_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: navmesh_obstacle_sectors '{nm_id}' references unknown dungeon_id '{nm_did}'"
                    )

            # Validate 15-Node Seasonal World Event, Double-EXP / Drop Hot-Config & Feature Flag Rollout Matrix (D86)
            liveops_flag_nodes = t_doc.get("liveops_event_flag_nodes") or []
            if liveops_flag_nodes and len(liveops_flag_nodes) < 15:
                errors.append(
                    f"GOV-10 violation: liveops_event_flag_nodes must have at least 15 nodes, got {len(liveops_flag_nodes)}"
                )
            for lf_item in liveops_flag_nodes:
                if not isinstance(lf_item, dict):
                    continue
                lf_id = str(lf_item.get("event_flag_id", ""))
                lf_zid = str(lf_item.get("zone_id", ""))
                if lf_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: liveops_event_flag_nodes '{lf_id}' references unknown zone_id '{lf_zid}'"
                    )

            # Validate 16-Rail In-Game Cutscene Camera Rail, Boss Intro Cinematics & Story Trigger Matrix (D87)
            cinematic_rails = t_doc.get("cinematic_camera_rails") or []
            if cinematic_rails and len(cinematic_rails) < 16:
                errors.append(
                    f"GOV-10 violation: cinematic_camera_rails must have at least 16 rails, got {len(cinematic_rails)}"
                )
            for cr_item in cinematic_rails:
                if not isinstance(cr_item, dict):
                    continue
                cr_id = str(cr_item.get("rail_id", ""))
                cr_zid = str(cr_item.get("zone_id", ""))
                cr_did = str(cr_item.get("dungeon_id", ""))
                if cr_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: cinematic_camera_rails '{cr_id}' references unknown zone_id '{cr_zid}'"
                    )
                if cr_did and cr_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: cinematic_camera_rails '{cr_id}' references unknown dungeon_id '{cr_did}'"
                    )

            # Validate 15-Town Client GPU Frame-Time Profiler, Draw-Call Instancing & VRAM Pool Budget Matrix (D88)
            gpu_budgets = t_doc.get("client_gpu_vram_budgets") or []
            if gpu_budgets and len(gpu_budgets) < 15:
                errors.append(
                    f"GOV-10 violation: client_gpu_vram_budgets must have at least 15 budgets, got {len(gpu_budgets)}"
                )
            for gb_item in gpu_budgets:
                if not isinstance(gb_item, dict):
                    continue
                gb_id = str(gb_item.get("gpu_budget_id", ""))
                gb_zid = str(gb_item.get("zone_id", ""))
                if gb_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: client_gpu_vram_budgets '{gb_id}' references unknown zone_id '{gb_zid}'"
                    )

            # Validate 16-Suite Automated Headless QA Playtest Matrix, CI Smoke Bot-Routes & Golden-Snapshot Regression Suites (D89)
            qa_suites = t_doc.get("automated_qa_smoke_suites") or []
            if qa_suites and len(qa_suites) < 16:
                errors.append(
                    f"GOV-10 violation: automated_qa_smoke_suites must have at least 16 suites, got {len(qa_suites)}"
                )
            for qs_item in qa_suites:
                if not isinstance(qs_item, dict):
                    continue
                qs_id = str(qs_item.get("qa_suite_id", ""))
                qs_zid = str(qs_item.get("zone_id", ""))
                qs_did = str(qs_item.get("dungeon_id", ""))
                if qs_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: automated_qa_smoke_suites '{qs_id}' references unknown zone_id '{qs_zid}'"
                    )
                if qs_did and qs_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: automated_qa_smoke_suites '{qs_id}' references unknown dungeon_id '{qs_did}'"
                    )

            # Validate 22-Record 90D Grand Studio Architecture Milestone Master Sign-Off & Telemetry Ledger (D90)
            studio_90d = t_doc.get("studio_90d_master_ledger") or []
            if studio_90d and len(studio_90d) < 22:
                errors.append(
                    f"GOV-10 violation: studio_90d_master_ledger must have at least 22 records, got {len(studio_90d)}"
                )
            for s90_item in studio_90d:
                if not isinstance(s90_item, dict):
                    continue
                s90_id = str(s90_item.get("ledger_id", ""))
                s90_zid = str(s90_item.get("zone_id", ""))
                if s90_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: studio_90d_master_ledger '{s90_id}' references unknown zone_id '{s90_zid}'"
                    )

            # Validate 16-Record Dynamic Faction Reputation, NPC Disposition & Town Guard Hostility Matrix (D91)
            faction_disps = t_doc.get("faction_reputation_dispositions") or []
            if faction_disps and len(faction_disps) < 16:
                errors.append(
                    f"GOV-10 violation: faction_reputation_dispositions must have at least 16 records, got {len(faction_disps)}"
                )
            for fd_item in faction_disps:
                if not isinstance(fd_item, dict):
                    continue
                fd_id = str(fd_item.get("disposition_id", ""))
                fd_zid = str(fd_item.get("zone_id", ""))
                fd_did = str(fd_item.get("dungeon_id", ""))
                if fd_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: faction_reputation_dispositions '{fd_id}' references unknown zone_id '{fd_zid}'"
                    )
                if fd_did and fd_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: faction_reputation_dispositions '{fd_id}' references unknown dungeon_id '{fd_did}'"
                    )

            # Validate 15-Record Cross-Realm Auction House, Escrow Settlement & Market Price-Circuit-Breaker Matrix (D92)
            auction_escrows = t_doc.get("cross_realm_auction_escrows") or []
            if auction_escrows and len(auction_escrows) < 15:
                errors.append(
                    f"GOV-10 violation: cross_realm_auction_escrows must have at least 15 records, got {len(auction_escrows)}"
                )
            for ae_item in auction_escrows:
                if not isinstance(ae_item, dict):
                    continue
                ae_id = str(ae_item.get("escrow_id", ""))
                ae_zid = str(ae_item.get("zone_id", ""))
                if ae_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: cross_realm_auction_escrows '{ae_id}' references unknown zone_id '{ae_zid}'"
                    )

            # Validate 16-Record Dynamic World Boss Invasion, Rift Incursion & Zone-Wide Emergency Quest Matrix (D93)
            world_incursions = t_doc.get("world_invasion_incursions") or []
            if world_incursions and len(world_incursions) < 16:
                errors.append(
                    f"GOV-10 violation: world_invasion_incursions must have at least 16 records, got {len(world_incursions)}"
                )
            for wi_item in world_incursions:
                if not isinstance(wi_item, dict):
                    continue
                wi_id = str(wi_item.get("incursion_id", ""))
                wi_zid = str(wi_item.get("zone_id", ""))
                wi_did = str(wi_item.get("dungeon_id", ""))
                if wi_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: world_invasion_incursions '{wi_id}' references unknown zone_id '{wi_zid}'"
                    )
                if wi_did and wi_did not in mf_dungeon_ids:
                    errors.append(
                        f"GOV-10 violation: world_invasion_incursions '{wi_id}' references unknown dungeon_id '{wi_did}'"
                    )

            # Validate 15-Record Guild / Clan Treasury Ledger, Siege Mercenary Payroll & Tax Dividend Audit Matrix (D94)
            clan_treasuries = t_doc.get("clan_treasury_payroll_ledgers") or []
            if clan_treasuries and len(clan_treasuries) < 15:
                errors.append(
                    f"GOV-10 violation: clan_treasury_payroll_ledgers must have at least 15 records, got {len(clan_treasuries)}"
                )
            for ct_item in clan_treasuries:
                if not isinstance(ct_item, dict):
                    continue
                ct_id = str(ct_item.get("treasury_id", ""))
                ct_zid = str(ct_item.get("zone_id", ""))
                if ct_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: clan_treasury_payroll_ledgers '{ct_id}' references unknown zone_id '{ct_zid}'"
                    )

            # Validate 16-Record Player Housing, Clan Citadel Interior Customization & Trophy Taxidermy Matrix (D95)
            housing_estates = t_doc.get("player_housing_trophy_estates") or []
            if housing_estates and len(housing_estates) < 16:
                errors.append(
                    f"GOV-10 violation: player_housing_trophy_estates must have at least 16 records, got {len(housing_estates)}"
                )
            for he_item in housing_estates:
                if not isinstance(he_item, dict):
                    continue
                he_id = str(he_item.get("estate_id", ""))
                he_zid = str(he_item.get("zone_id", ""))
                if he_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: player_housing_trophy_estates '{he_id}' references unknown zone_id '{he_zid}'"
                    )

            # Validate 15-Record Global CDN Region Routing, Anycast DDoS Scrubbing & Voice-Chat WebRTC Relay Matrix (D96)
            cdn_relays = t_doc.get("global_cdn_webrtc_relays") or []
            if cdn_relays and len(cdn_relays) < 15:
                errors.append(
                    f"GOV-10 violation: global_cdn_webrtc_relays must have at least 15 records, got {len(cdn_relays)}"
                )
            for cr_item in cdn_relays:
                if not isinstance(cr_item, dict):
                    continue
                cr_id = str(cr_item.get("relay_id", ""))
                cr_zid = str(cr_item.get("zone_id", ""))
                if cr_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: global_cdn_webrtc_relays '{cr_id}' references unknown zone_id '{cr_zid}'"
                    )

            # Validate 16-Record Dynamic Caravan Trade Routes, Bandit Ambush Escorts & Regional Commodity Arbitrage Matrix (D97)
            caravan_routes = t_doc.get("caravan_trade_routes") or []
            if caravan_routes and len(caravan_routes) < 16:
                errors.append(
                    f"GOV-10 violation: caravan_trade_routes must have at least 16 records, got {len(caravan_routes)}"
                )
            for ct_item in caravan_routes:
                if not isinstance(ct_item, dict):
                    continue
                ct_id = str(ct_item.get("caravan_id", ""))
                ct_zid = str(ct_item.get("zone_id", ""))
                if ct_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: caravan_trade_routes '{ct_id}' references unknown zone_id '{ct_zid}'"
                    )

            # Validate 15-Record Automated Localization Voice-Over (EN/TH/JP/KR), Lip-Sync Phoneme & Subtitle Timing Matrix (D98)
            vo_banks = t_doc.get("localization_voiceover_banks") or []
            if vo_banks and len(vo_banks) < 15:
                errors.append(
                    f"GOV-10 violation: localization_voiceover_banks must have at least 15 records, got {len(vo_banks)}"
                )
            for vb_item in vo_banks:
                if not isinstance(vb_item, dict):
                    continue
                vb_id = str(vb_item.get("vo_bank_id", ""))
                vb_zid = str(vb_item.get("zone_id", ""))
                if vb_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: localization_voiceover_banks '{vb_id}' references unknown zone_id '{vb_zid}'"
                    )

            # Validate 16-Record Cross-Tool Hot-Reload WebSocket Bus, Undo/Redo Command Journal & Godot Live-Sync Bridge Matrix (D99)
            hot_bridges = t_doc.get("cross_tool_hot_reload_bridges") or []
            if hot_bridges and len(hot_bridges) < 16:
                errors.append(
                    f"GOV-10 violation: cross_tool_hot_reload_bridges must have at least 16 records, got {len(hot_bridges)}"
                )
            for hb_item in hot_bridges:
                if not isinstance(hb_item, dict):
                    continue
                hb_id = str(hb_item.get("bridge_id", ""))
                hb_zid = str(hb_item.get("zone_id", ""))
                if hb_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: cross_tool_hot_reload_bridges '{hb_id}' references unknown zone_id '{hb_zid}'"
                    )

            # Validate 22-Record 100D Centennial Studio Milestone Grand Charter & Guided Tour Matrix (D100)
            centennial_charters = t_doc.get("centennial_100d_studio_charters") or []
            if centennial_charters and len(centennial_charters) < 22:
                errors.append(
                    f"GOV-10 violation: centennial_100d_studio_charters must have at least 22 records, got {len(centennial_charters)}"
                )
            for cc_item in centennial_charters:
                if not isinstance(cc_item, dict):
                    continue
                cc_id = str(cc_item.get("charter_id", ""))
                cc_zid = str(cc_item.get("zone_id", ""))
                if cc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: centennial_100d_studio_charters '{cc_id}' references unknown zone_id '{cc_zid}'"
                    )

            # Validate 16-Record Dynamic World Weather-Triggered Rare Spawns, Nocturnal Hunt & Eclipse Affix Matrix (D101)
            nocturnal_spawns = t_doc.get("nocturnal_weather_affix_spawns") or []
            if nocturnal_spawns and len(nocturnal_spawns) < 16:
                errors.append(
                    f"GOV-10 violation: nocturnal_weather_affix_spawns must have at least 16 records, got {len(nocturnal_spawns)}"
                )
            for ns_item in nocturnal_spawns:
                if not isinstance(ns_item, dict):
                    continue
                ns_id = str(ns_item.get("affix_spawn_id", ""))
                ns_zid = str(ns_item.get("zone_id", ""))
                if ns_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: nocturnal_weather_affix_spawns '{ns_id}' references unknown zone_id '{ns_zid}'"
                    )

            # Validate 15-Record Deterministic Combat Replay Verifier, Anti-Cheat Desync Audit & Tick-by-Tick Hash Chain Matrix (D102)
            combat_replays = t_doc.get("deterministic_combat_replays") or []
            if combat_replays and len(combat_replays) < 15:
                errors.append(
                    f"GOV-10 violation: deterministic_combat_replays must have at least 15 records, got {len(combat_replays)}"
                )
            for cr_item in combat_replays:
                if not isinstance(cr_item, dict):
                    continue
                cr_id = str(cr_item.get("replay_sector_id", ""))
                cr_zid = str(cr_item.get("zone_id", ""))
                if cr_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: deterministic_combat_replays '{cr_id}' references unknown zone_id '{cr_zid}'"
                    )

            # Validate 16-Record Dynamic World Lore Codex, Archaeological Relic Excavation & Bestiary Mastery Matrix (D103)
            lore_codices = t_doc.get("archaeological_lore_codices") or []
            if lore_codices and len(lore_codices) < 16:
                errors.append(
                    f"GOV-10 violation: archaeological_lore_codices must have at least 16 records, got {len(lore_codices)}"
                )
            for lc_item in lore_codices:
                if not isinstance(lc_item, dict):
                    continue
                lc_id = str(lc_item.get("codex_id", ""))
                lc_zid = str(lc_item.get("zone_id", ""))
                if lc_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: archaeological_lore_codices '{lc_id}' references unknown zone_id '{lc_zid}'"
                    )

            # Validate 15-Record Procedural Foliage Wind-Field, Interactive Water Ripple & Destructible Environment Physics Matrix (D104)
            physics_biomes = t_doc.get("destructible_physics_biomes") or []
            if physics_biomes and len(physics_biomes) < 15:
                errors.append(
                    f"GOV-10 violation: destructible_physics_biomes must have at least 15 records, got {len(physics_biomes)}"
                )
            for pb_item in physics_biomes:
                if not isinstance(pb_item, dict):
                    continue
                pb_id = str(pb_item.get("physics_biome_id", ""))
                pb_zid = str(pb_item.get("zone_id", ""))
                if pb_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: destructible_physics_biomes '{pb_id}' references unknown zone_id '{pb_zid}'"
                    )

            # Validate 16-Record Dynamic Bounty Hunter Contracts, Chaotic PK Manhunt & High-Value Target Tracking Matrix (D105)
            bounty_contracts = t_doc.get("bounty_manhunt_contracts") or []
            if bounty_contracts and len(bounty_contracts) < 16:
                errors.append(
                    f"GOV-10 violation: bounty_manhunt_contracts must have at least 16 records, got {len(bounty_contracts)}"
                )
            for bm_item in bounty_contracts:
                if not isinstance(bm_item, dict):
                    continue
                bm_id = str(bm_item.get("bounty_id", ""))
                bm_zid = str(bm_item.get("zone_id", ""))
                if bm_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: bounty_manhunt_contracts '{bm_id}' references unknown zone_id '{bm_zid}'"
                    )

            # Validate 15-Record Distributed World-State Snapshot Backup, Point-in-Time Recovery (PITR) & Disaster-Recovery Chaos Drill Matrix (D106)
            pitr_drills = t_doc.get("disaster_recovery_pitr_drills") or []
            if pitr_drills and len(pitr_drills) < 15:
                errors.append(
                    f"GOV-10 violation: disaster_recovery_pitr_drills must have at least 15 records, got {len(pitr_drills)}"
                )
            for pd_item in pitr_drills:
                if not isinstance(pd_item, dict):
                    continue
                pd_id = str(pd_item.get("pitr_drill_id", ""))
                pd_zid = str(pd_item.get("zone_id", ""))
                if pd_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: disaster_recovery_pitr_drills '{pd_id}' references unknown zone_id '{pd_zid}'"
                    )

            # Validate 16-Record Dynamic World Tavern Mini-Games, Bardic Music Buffs & Social Mercenary Recruitment Matrix (D107)
            tavern_hubs = t_doc.get("tavern_social_hubs") or []
            if tavern_hubs and len(tavern_hubs) < 16:
                errors.append(
                    f"GOV-10 violation: tavern_social_hubs must have at least 16 records, got {len(tavern_hubs)}"
                )
            for th_item in tavern_hubs:
                if not isinstance(th_item, dict):
                    continue
                th_id = str(th_item.get("tavern_id", ""))
                th_zid = str(th_item.get("zone_id", ""))
                if th_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: tavern_social_hubs '{th_id}' references unknown zone_id '{th_zid}'"
                    )

            # Validate 15-Record Player Sentiment Telemetry, Net-Promoter In-Game Survey & Rage-Quit Churn Intervention Matrix (D108)
            churn_interventions = t_doc.get("churn_sentiment_interventions") or []
            if churn_interventions and len(churn_interventions) < 15:
                errors.append(
                    f"GOV-10 violation: churn_sentiment_interventions must have at least 15 records, got {len(churn_interventions)}"
                )
            for ci_item in churn_interventions:
                if not isinstance(ci_item, dict):
                    continue
                ci_id = str(ci_item.get("intervention_id", ""))
                ci_zid = str(ci_item.get("zone_id", ""))
                if ci_zid not in all_zone_ids:
                    errors.append(
                        f"GOV-10 violation: churn_sentiment_interventions '{ci_id}' references unknown zone_id '{ci_zid}'"
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
