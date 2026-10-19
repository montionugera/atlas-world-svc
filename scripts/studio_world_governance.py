#!/usr/bin/env python3
"""Long-Term World Content Governance, Checklist Validator & Scaffolding CLI.

Enforces the 6 Long-Term World Studio Governance Gates (GOV-01..GOV-06):
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

Also provides deterministic scaffolding generators (--scaffold-quest, --scaffold-boss)
for long-term content authoring.
"""

from __future__ import annotations

import argparse
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


def validate_world_governance(
    studio_dir: Path = DEFAULT_STUDIO_DIR,
) -> tuple[list[str], dict[str, Any]]:
    """Validate GOV-01..GOV-06 on world_history_and_concept.json and return (errors, report)."""
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
    from collections import deque
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

    # Verify long_term_governance_checklist entries
    gov_checklist = whc.get("long_term_governance_checklist") or []
    if len(gov_checklist) < 8:
        errors.append("Governance checklist must contain all 8 gates (GOV-01..GOV-08)")
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

    print("\n[8] LONG-TERM GOVERNANCE CHECKLIST GATES (GOV-01..GOV-08):")
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

    print("\nALL 6 LONG-TERM GOVERNANCE GATES PASSED (0 errors).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Long-Term World Studio Governance Validator & Content Scaffolding Tool."
    )
    parser.add_argument("--studio-dir", type=Path, default=DEFAULT_STUDIO_DIR)
    parser.add_argument("--check", action="store_true", help="Run GOV-01..GOV-06 checklist validation.")
    parser.add_argument("--audit", action="store_true", help="Print full governance & lore audit report.")
    parser.add_argument("--audit-races", action="store_true", help="Audit 6 playable + 6 monster races.")
    parser.add_argument("--audit-history", action="store_true", help="Audit 4 history chapters + 6 sealed gods.")
    parser.add_argument("--audit-factions", action="store_true", help="Audit Neutral Adventure Guild & Blacksmith Clan.")
    parser.add_argument("--audit-quests", action="store_true", help="Audit 3-track quest progression loop.")
    parser.add_argument("--audit-bosses", action="store_true", help="Audit God > MVP > Raid Boss hierarchy.")
    parser.add_argument("--audit-growth", action="store_true", help="Audit Level 1-99 Growth Path (A..L) & Lv.1-25 Focus.")
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
