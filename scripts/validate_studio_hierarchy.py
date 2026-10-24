#!/usr/bin/env python3
"""Deterministic validator and runtime manifest builder for the Top-Down World Studio hierarchy (content/studio/).

Enforces all 4 perspective layers:
  Level 1: World History and Concept (`content/studio/world_history_and_concept.json`)
  Level 2: Continent (`content/studio/continents/*.json`)
  Level 3: District (`content/studio/districts/<continent_id>/*.json`)
  Level 4: Town, Hunting Area, and Dungeon (`content/studio/nodes/<continent_id>/<district_id>/*.json`)

Plus the 7 deterministic topological, ecological, scale, and mystery invariants (INV-01 .. INV-07)
and the 5-pillar Quality, Continuity, Consistency, and Fantasy Checklist (`quality_checklist`).
"""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path
import re
import sys
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STUDIO_DIR = REPO_ROOT / "content" / "studio"
DEFAULT_RUNTIME_MANIFEST_PATH = REPO_ROOT / "content" / "maps" / "_manifest.runtime.json"

ALLOWED_STATUSES = {"canon", "draft", "mystery"}
REQUIRED_CHECKLIST_PILLARS = (
    "causal_continuity",
    "fantasy_and_wonder",
    "character_scale_consistency",
    "spatial_and_ecological_consistency",
    "intentional_mystery_discipline",
)
FORBIDDEN_BOILERPLATE_TERMS = (
    "undertow",
    "woolmarch",
    "stage_0",
    "c-town-millcross",
)
INVERSE_DIRECTION = {
    "North": "South",
    "South": "North",
    "East": "West",
    "West": "East",
    "Dungeon": "Exit",
    "Exit": "Dungeon",
}
CARDINAL_VECTORS = {
    "North": (0, -1),
    "South": (0, 1),
    "East": (1, 0),
    "West": (-1, 0),
}


def _check_forbidden_boilerplate(raw_text: str, source_label: str, errors: list[str]) -> None:
    lowered = raw_text.lower()
    for term in FORBIDDEN_BOILERPLATE_TERMS:
        if term in lowered:
            errors.append(
                f"{source_label}: contains forbidden legacy proof-of-concept term '{term}'"
            )


def _validate_mystery_hook(
    hook: Any,
    source_label: str,
    errors: list[str],
) -> None:
    if not isinstance(hook, dict):
        errors.append(f"{source_label}: missing or invalid 'mystery_hook' object")
        return
    for field in ("in_world_rumor", "visual_silhouette", "unanswered_question"):
        val = hook.get(field)
        if not isinstance(val, str) or len(val.strip()) < 15:
            errors.append(
                f"{source_label}: mystery_hook.{field} must be a string of at least 15 characters"
            )


def _validate_quality_checklist(
    node: dict[str, Any],
    source_label: str,
    errors: list[str],
) -> None:
    checklist = node.get("quality_checklist")
    if not isinstance(checklist, dict):
        errors.append(f"{source_label}: missing 'quality_checklist' object")
        return

    status = node.get("status")
    for pillar in REQUIRED_CHECKLIST_PILLARS:
        entry = checklist.get(pillar)
        if not isinstance(entry, dict):
            errors.append(f"{source_label}: quality_checklist.{pillar} must be an object")
            continue
        verified = entry.get("verified")
        evidence = entry.get("evidence")
        if not isinstance(verified, bool):
            errors.append(
                f"{source_label}: quality_checklist.{pillar}.verified must be a boolean"
            )
        if not isinstance(evidence, str) or len(evidence.strip()) < 15:
            errors.append(
                f"{source_label}: quality_checklist.{pillar}.evidence must be at least 15 characters"
            )
        if status == "canon" and verified is not True:
            errors.append(
                f"{source_label}: status is 'canon' but quality_checklist.{pillar}.verified is not true"
            )

    if status == "mystery":
        for mandatory_mystery_pillar in ("causal_continuity", "intentional_mystery_discipline"):
            entry = checklist.get(mandatory_mystery_pillar)
            if isinstance(entry, dict) and entry.get("verified") is not True:
                errors.append(
                    f"{source_label}: status is 'mystery' but quality_checklist.{mandatory_mystery_pillar}.verified is not true"
                )


def _validate_rationalized_envelope(
    node: dict[str, Any],
    source_label: str,
    errors: list[str],
    require_checklist: bool = True,
) -> None:
    node_id = node.get("id")
    if not isinstance(node_id, str) or not re.match(r"^[a-z0-9-]+$", node_id):
        errors.append(f"{source_label}: invalid or missing 'id' (must match ^[a-z0-9-]+$)")

    name = node.get("name")
    if not isinstance(name, str) or len(name.strip()) < 2:
        errors.append(f"{source_label}: 'name' must be a non-empty string")

    status = node.get("status")
    if status not in ALLOWED_STATUSES:
        errors.append(
            f"{source_label}: 'status' must be one of {sorted(ALLOWED_STATUSES)}, got {status!r}"
        )

    rationale = node.get("core_rationale")
    if not isinstance(rationale, str) or len(rationale.strip()) < 20:
        errors.append(
            f"{source_label}: 'core_rationale' is mandatory at all statuses and must be at least 20 characters"
        )

    if status == "mystery":
        _validate_mystery_hook(node.get("mystery_hook"), source_label, errors)

    if require_checklist:
        _validate_quality_checklist(node, source_label, errors)


def _validate_character_scale_law(
    scale_law: Any,
    source_label: str,
    errors: list[str],
) -> None:
    if not isinstance(scale_law, dict):
        errors.append(f"{source_label}: missing 'character_scale_law' object")
        return

    height_range = scale_law.get("height_range_meters")
    if (
        not isinstance(height_range, list)
        or len(height_range) != 2
        or height_range[0] != 0.90
        or height_range[1] != 1.20
    ):
        errors.append(
            f"{source_label}: character_scale_law.height_range_meters must be [0.90, 1.20], got {height_range!r}"
        )

    ref_height = scale_law.get("reference_height_meters")
    if ref_height != 1.05:
        errors.append(
            f"{source_label}: character_scale_law.reference_height_meters must be 1.05, got {ref_height!r}"
        )

    metrics = scale_law.get("environment_metrics")
    if not isinstance(metrics, dict):
        errors.append(f"{source_label}: character_scale_law.environment_metrics must be an object")
        return

    grass = metrics.get("max_grass_height_meters")
    if not isinstance(grass, (int, float)) or grass > 0.35 or grass <= 0:
        errors.append(
            f"{source_label}: max_grass_height_meters must be in (0, 0.35], got {grass!r}"
        )

    bush = metrics.get("max_bush_height_meters")
    if not isinstance(bush, (int, float)) or bush > 0.65 or bush <= 0:
        errors.append(
            f"{source_label}: max_bush_height_meters must be in (0, 0.65], got {bush!r}"
        )

    riser = metrics.get("max_stair_riser_meters")
    if not isinstance(riser, (int, float)) or riser > 0.18 or riser <= 0:
        errors.append(
            f"{source_label}: max_stair_riser_meters must be in (0, 0.18], got {riser!r}"
        )

    door_h = metrics.get("min_doorway_height_meters")
    if not isinstance(door_h, (int, float)) or door_h < 1.80:
        errors.append(
            f"{source_label}: min_doorway_height_meters must be >= 1.80, got {door_h!r}"
        )

    door_w = metrics.get("min_doorway_width_meters")
    if not isinstance(door_w, (int, float)) or door_w < 1.40:
        errors.append(
            f"{source_label}: min_doorway_width_meters must be >= 1.40, got {door_w!r}"
        )

    highway_w = metrics.get("min_highway_corridor_width_meters")
    if not isinstance(highway_w, (int, float)) or highway_w < 3.5:
        errors.append(
            f"{source_label}: min_highway_corridor_width_meters must be >= 3.5, got {highway_w!r}"
        )

    counter_range = metrics.get("prop_counter_height_range_meters")
    if (
        not isinstance(counter_range, list)
        or len(counter_range) != 2
        or counter_range[0] < 0.50
        or counter_range[1] > 0.70
        or counter_range[0] > counter_range[1]
    ):
        errors.append(
            f"{source_label}: prop_counter_height_range_meters must lie within [0.50, 0.70], got {counter_range!r}"
        )


def _validate_districts_and_nodes(
    studio_dir: Path,
    whc: dict[str, Any],
    continents_by_id: dict[str, dict[str, Any]],
    errors: list[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Validate Layer 3 (Districts) and Layer 4 (Town/Hunting Area/Dungeon Nodes) and INV-01..INV-07."""
    districts_by_id: dict[str, dict[str, Any]] = {}
    nodes_by_id: dict[str, dict[str, Any]] = {}

    districts_root = studio_dir / "districts"
    nodes_root = studio_dir / "nodes"
    if not districts_root.exists():
        return districts_by_id, nodes_by_id

    for d_path in sorted(districts_root.rglob("*.json")):
        try:
            d_raw = d_path.read_text(encoding="utf-8")
            district = json.loads(d_raw)
        except Exception as exc:
            errors.append(f"{d_path}: failed to parse JSON: {exc}")
            continue

        _check_forbidden_boilerplate(d_raw, str(d_path), errors)
        _validate_rationalized_envelope(district, str(d_path), errors, require_checklist=True)

        did = district.get("id", "")
        if not did.startswith("district-"):
            errors.append(f"{d_path}: district id must start with 'district-', got {did!r}")
        if d_path.stem != did:
            errors.append(
                f"{d_path}: filename stem '{d_path.stem}' must match district id '{did}'"
            )

        parent_cid = district.get("parent_continent_id", "")
        if parent_cid not in continents_by_id:
            errors.append(
                f"{d_path}: INV-01 violation: parent_continent_id '{parent_cid}' does not exist"
            )
        else:
            parent_c = continents_by_id[parent_cid]
            if district.get("status") == "canon" and parent_c.get("status") != "canon":
                errors.append(
                    f"{d_path}: INV-01 violation: canon district '{did}' cannot belong to non-canon continent '{parent_cid}' ({parent_c.get('status')})"
                )
            if did not in (parent_c.get("district_ids") or []):
                errors.append(
                    f"{d_path}: INV-01 violation: district '{did}' not listed in continent '{parent_cid}.district_ids'"
                )

        # INV-02: Grid Orthogonality & Uniqueness on District grid_nodes
        surface_coords: dict[tuple[int, int], str] = {}
        dungeon_coords: dict[tuple[int, int, int], str] = {}
        grid_nodes_by_id: dict[str, dict[str, Any]] = {}
        dims = district.get("grid_dimensions") or {}
        max_cols = int(dims.get("columns", 10))
        max_rows = int(dims.get("rows", 10))

        for g_idx, g_node in enumerate(district.get("grid_nodes") or []):
            g_label = f"{d_path}#grid_nodes[{g_idx}]"
            nid = g_node.get("node_id", "")
            ntype = g_node.get("node_type", "")
            coords = g_node.get("grid_coordinates")
            if (
                not isinstance(coords, list)
                or len(coords) != 2
                or not all(isinstance(c, int) for c in coords)
            ):
                errors.append(f"{g_label}: INV-02 violation: invalid grid_coordinates {coords!r}")
                continue
            col, row = coords[0], coords[1]
            if not (0 <= col < max_cols and 0 <= row < max_rows):
                errors.append(
                    f"{g_label}: INV-02 violation: grid_coordinates {[col, row]} outside grid_dimensions {max_cols}x{max_rows}"
                )
            if ntype in ("town", "hunting_area"):
                if (col, row) in surface_coords:
                    errors.append(
                        f"{g_label}: INV-02 violation: duplicate surface grid_coordinates {[col, row]} shared by '{nid}' and '{surface_coords[(col, row)]}'"
                    )
                surface_coords[(col, row)] = nid
            elif ntype == "dungeon":
                floor_idx = g_node.get("floor_index")
                if not isinstance(floor_idx, int) or floor_idx >= 0:
                    errors.append(
                        f"{g_label}: INV-02 violation: dungeon node '{nid}' must have floor_index < 0, got {floor_idx!r}"
                    )
                else:
                    key = (col, row, floor_idx)
                    if key in dungeon_coords:
                        errors.append(
                            f"{g_label}: INV-02 violation: duplicate dungeon coordinate/floor {key} shared by '{nid}' and '{dungeon_coords[key]}'"
                        )
                    dungeon_coords[key] = nid
            grid_nodes_by_id[nid] = g_node

        # Validate District portal_edges cardinal geometry & level continuity (INV-02, INV-05, INV-07)
        d_lv_range = district.get("level_range") or [1, 100]
        for e_idx, edge in enumerate(district.get("portal_edges") or []):
            e_label = f"{d_path}#portal_edges[{e_idx}]"
            u_id = edge.get("from_node_id")
            v_id = edge.get("to_node_id")
            from_dir = edge.get("from_direction")
            to_dir = edge.get("to_direction")
            if u_id not in grid_nodes_by_id or v_id not in grid_nodes_by_id:
                errors.append(
                    f"{e_label}: portal edge references node not in grid_nodes ({u_id!r} -> {v_id!r})"
                )
                continue
            u_node = grid_nodes_by_id[u_id]
            v_node = grid_nodes_by_id[v_id]

            if INVERSE_DIRECTION.get(from_dir) != to_dir:
                errors.append(
                    f"{e_label}: INV-03 violation: from_direction '{from_dir}' must pair with inverse '{INVERSE_DIRECTION.get(from_dir)}', got '{to_dir}'"
                )

            if from_dir in CARDINAL_VECTORS:
                dx, dy = CARDINAL_VECTORS[from_dir]
                u_col, u_row = u_node["grid_coordinates"]
                v_col, v_row = v_node["grid_coordinates"]
                if (u_col + dx, u_row + dy) != (v_col, v_row):
                    errors.append(
                        f"{e_label}: INV-02 violation: cardinal '{from_dir}' edge from {u_id} {[u_col, u_row]} to {v_id} {[v_col, v_row]} does not match vector {(dx, dy)}"
                    )

            # INV-07: Mystery target must use fog_of_lore gate_state
            if v_node.get("status") == "mystery" or u_node.get("status") == "mystery":
                if edge.get("gate_state") != "fog_of_lore":
                    errors.append(
                        f"{e_label}: INV-07 violation: edge touching mystery node must have gate_state 'fog_of_lore'"
                    )
                lock_reason = edge.get("lock_reason")
                if not isinstance(lock_reason, str) or len(lock_reason.strip()) < 15:
                    errors.append(
                        f"{e_label}: INV-07 violation: fog_of_lore edge requires lock_reason (>= 15 chars)"
                    )

            # INV-05: Level delta across open cardinal portals <= 15
            if edge.get("gate_state") == "open" and from_dir in CARDINAL_VECTORS:
                u_mid = sum(u_node["level_range"]) / 2.0
                v_mid = sum(v_node["level_range"]) / 2.0
                if abs(u_mid - v_mid) > 15.0:
                    errors.append(
                        f"{e_label}: INV-05 violation: level midpoint delta {abs(u_mid - v_mid):.1f} > 15 between '{u_id}' and '{v_id}'"
                    )

        districts_by_id[did] = {
            **district,
            "_grid_nodes_by_id": grid_nodes_by_id,
            "_d_lv_range": d_lv_range,
        }

    # Load and validate Layer 4 Nodes
    if nodes_root.exists():
        for n_path in sorted(nodes_root.rglob("*.json")):
            try:
                n_raw = n_path.read_text(encoding="utf-8")
                node = json.loads(n_raw)
            except Exception as exc:
                errors.append(f"{n_path}: failed to parse JSON: {exc}")
                continue

            _check_forbidden_boilerplate(n_raw, str(n_path), errors)
            _validate_rationalized_envelope(node, str(n_path), errors, require_checklist=True)

            nid = node.get("id", "")
            if n_path.stem != nid:
                errors.append(
                    f"{n_path}: filename stem '{n_path.stem}' must match node id '{nid}'"
                )

            parent_did = node.get("parent_district_id", "")
            parent_cid = node.get("parent_continent_id", "")
            n_status = node.get("status")
            ntype = node.get("node_type")

            if parent_did not in districts_by_id:
                errors.append(
                    f"{n_path}: INV-01 violation: parent_district_id '{parent_did}' does not exist"
                )
                continue

            parent_d = districts_by_id[parent_did]
            if parent_d.get("parent_continent_id") != parent_cid:
                errors.append(
                    f"{n_path}: INV-01 violation: parent_continent_id '{parent_cid}' does not match district's continent '{parent_d.get('parent_continent_id')}'"
                )
            if n_status == "canon" and parent_d.get("status") != "canon":
                errors.append(
                    f"{n_path}: INV-01 violation: canon node '{nid}' cannot belong to non-canon district '{parent_did}' ({parent_d.get('status')})"
                )
            if nid not in parent_d["_grid_nodes_by_id"]:
                errors.append(
                    f"{n_path}: INV-02 violation: node '{nid}' is not registered in district '{parent_did}.grid_nodes'"
                )

            # INV-05: Node level_range containment within District level_range (+5 bleed for dungeons)
            d_min, d_max = parent_d["_d_lv_range"]
            n_lv = node.get("level_range") or [1, 1]
            allowed_max = d_max + (5 if ntype == "dungeon" else 0)
            if n_lv[0] < d_min or n_lv[1] > allowed_max:
                errors.append(
                    f"{n_path}: INV-05 violation: node level_range {n_lv} exceeds district '{parent_did}' level_range {[d_min, allowed_max]}"
                )

            if n_status == "mystery":
                if node.get("map_id") is not None:
                    errors.append(
                        f"{n_path}: INV-07 violation: mystery node '{nid}' must have map_id: null"
                    )
            else:
                if not isinstance(node.get("map_id"), str) or not node.get("map_id"):
                    errors.append(
                        f"{n_path}: '{n_status}' node '{nid}' must have a non-empty string map_id"
                    )

                # INV-07: Check 90-120cm Character Scale Law on terrain_tile and asset_kit_bindings
                tile = node.get("terrain_tile")
                if not isinstance(tile, dict):
                    errors.append(f"{n_path}: missing 'terrain_tile' object")
                else:
                    step_m = tile.get("max_terrace_step_meters")
                    if not isinstance(step_m, (int, float)) or step_m > 0.25:
                        errors.append(
                            f"{n_path}: INV-07 violation: max_terrace_step_meters must be <= 0.25, got {step_m!r}"
                        )

                kit = node.get("asset_kit_bindings")
                if not isinstance(kit, dict):
                    errors.append(f"{n_path}: missing 'asset_kit_bindings' object")
                else:
                    if kit.get("player_scale_band_meters") != [0.90, 1.20]:
                        errors.append(
                            f"{n_path}: INV-07 violation: asset_kit_bindings.player_scale_band_meters must be [0.90, 1.20]"
                        )
                    if (kit.get("max_grass_height_meters") or 99) > 0.35:
                        errors.append(
                            f"{n_path}: INV-07 violation: asset_kit_bindings.max_grass_height_meters must be <= 0.35"
                        )
                    if (kit.get("max_bush_height_meters") or 99) > 0.65:
                        errors.append(
                            f"{n_path}: INV-07 violation: asset_kit_bindings.max_bush_height_meters must be <= 0.65"
                        )
                    if (kit.get("main_road_width_meters") or 0) < 12.0:
                        errors.append(
                            f"{n_path}: INV-07 violation: asset_kit_bindings.main_road_width_meters must be >= 12.0"
                        )
                    if (kit.get("footpath_width_meters") or 0) < 4.0:
                        errors.append(
                            f"{n_path}: INV-07 violation: asset_kit_bindings.footpath_width_meters must be >= 4.0"
                        )

                # INV-06: Ecological & Loot Table Completeness
                spawns = node.get("resident_spawns") or []
                if ntype == "town" and spawns:
                    errors.append(
                        f"{n_path}: INV-06 violation: town node '{nid}' must have empty resident_spawns inside safe zone"
                    )
                allowed_families = set(parent_d.get("ecological_monster_families") or [])
                for s_idx, spawn in enumerate(spawns):
                    s_label = f"{n_path}#resident_spawns[{s_idx}]"
                    fam = spawn.get("family")
                    if fam not in allowed_families:
                        errors.append(
                            f"{s_label}: INV-06 violation: monster family '{fam}' not in parent district families {sorted(allowed_families)}"
                        )
                    mob_lv = spawn.get("level", 0)
                    if not (n_lv[0] <= mob_lv <= n_lv[1]):
                        errors.append(
                            f"{s_label}: INV-06 violation: monster level {mob_lv} outside node level_range {n_lv}"
                        )
                    if spawn.get("size") not in ("Small", "Medium", "Large"):
                        errors.append(
                            f"{s_label}: INV-06 violation: invalid monster size {spawn.get('size')!r}"
                        )
                    drops = spawn.get("item_drops") or []
                    if not drops:
                        errors.append(f"{s_label}: INV-06 violation: item_drops cannot be empty")
                    for d_item in drops:
                        pct = d_item.get("drop_chance_percent", 0)
                        if not (0 < pct <= 100.0):
                            errors.append(
                                f"{s_label}: INV-06 violation: item drop_chance_percent {pct} must be in (0, 100]"
                            )
                    card = spawn.get("monster_card_drop") or {}
                    card_pct = card.get("drop_chance_percent", 0)
                    if not (0.001 <= card_pct <= 1.0):
                        errors.append(
                            f"{s_label}: INV-06 violation: monster_card_drop.drop_chance_percent {card_pct} must be in [0.001, 1.0]"
                        )

            nodes_by_id[nid] = node

    # INV-03: Bidirectional Portal Symmetry across non-mystery Layer 4 nodes
    if nodes_by_id:
        for nid, node in nodes_by_id.items():
            if node.get("status") == "mystery":
                continue
            portals = node.get("portals") or {}
            for direction, p_obj in portals.items():
                if not p_obj:
                    continue
                target_nid = p_obj.get("target_node_id")
                if target_nid not in nodes_by_id:
                    errors.append(
                        f"Node '{nid}' portal '{direction}' references unknown target_node_id '{target_nid}'"
                    )
                    continue
                target_node = nodes_by_id[target_nid]
                if target_node.get("status") == "mystery":
                    if (
                        p_obj.get("gate_state") != "fog_of_lore"
                        or p_obj.get("target_map_id") is not None
                    ):
                        errors.append(
                            f"INV-07 violation: Node '{nid}' portal '{direction}' to mystery node '{target_nid}' must have gate_state='fog_of_lore' and target_map_id=null"
                        )
                    continue

                inv_dir = INVERSE_DIRECTION.get(direction)
                target_portals = target_node.get("portals") or {}
                mirror = target_portals.get(inv_dir)
                if not isinstance(mirror, dict) or mirror.get("target_node_id") != nid:
                    errors.append(
                        f"INV-03 violation: Node '{nid}' portal '{direction}' -> '{target_nid}' lacks inverse '{inv_dir}' portal on '{target_nid}' pointing back to '{nid}'"
                    )

        # INV-04: Starter Town Reachability (BFS) over open portals
        starter_nodes = [
            nid
            for nid, n in nodes_by_id.items()
            if n.get("is_starter_town") is True and n.get("status") == "canon"
        ]
        if not starter_nodes:
            errors.append(
                "INV-04 violation: No canon Starter Town node (is_starter_town: true) found in content/studio/nodes/"
            )
        else:
            visited: set[str] = set(starter_nodes)
            queue: deque[str] = deque(starter_nodes)
            while queue:
                curr_id = queue.popleft()
                curr_node = nodes_by_id[curr_id]
                for p_obj in (curr_node.get("portals") or {}).values():
                    if not isinstance(p_obj, dict):
                        continue
                    if p_obj.get("gate_state") != "open":
                        continue
                    nxt_id = p_obj.get("target_node_id")
                    if (
                        nxt_id in nodes_by_id
                        and nodes_by_id[nxt_id].get("status") != "mystery"
                        and nxt_id not in visited
                    ):
                        visited.add(nxt_id)
                        queue.append(nxt_id)

            for nid, n in nodes_by_id.items():
                if n.get("status") in ("canon", "draft") and nid not in visited:
                    errors.append(
                        f"INV-04 violation: '{n.get('status')}' node '{nid}' is not reachable from any Starter Town via open portals"
                    )

    return districts_by_id, nodes_by_id


def build_runtime_manifest(studio_dir: Path = DEFAULT_STUDIO_DIR) -> dict[str, Any]:
    """Build content/maps/_manifest.runtime.json from validated studio hierarchy."""
    errors = validate_studio_directory(studio_dir)
    if errors:
        raise ValueError(f"Cannot build runtime manifest; studio hierarchy has errors: {errors}")

    whc = json.loads((studio_dir / "world_history_and_concept.json").read_text(encoding="utf-8"))
    continents_by_id = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in sorted((studio_dir / "continents").glob("*.json"))
    }
    _, nodes_by_id = _validate_districts_and_nodes(studio_dir, whc, continents_by_id, [])

    starter_spawns: dict[str, dict[str, Any]] = {}
    playable_maps: list[dict[str, Any]] = []
    portal_routing_table: dict[str, dict[str, Any]] = {}
    default_starter_map_id: str | None = None

    for nid in sorted(nodes_by_id.keys()):
        node = nodes_by_id[nid]
        if node.get("status") == "mystery":
            continue
        map_id = node["map_id"]
        if node.get("is_starter_town"):
            binding = node.get("starter_arrival_binding") or {}
            pt = binding.get("spawn_point_meters") or {"x": 2000.0, "y": 2000.0, "z": 0.0}
            starter_spawns[map_id] = {
                "nodeId": nid,
                "x": float(pt.get("x", 2000.0)),
                "y": float(pt.get("y", 2000.0)),
                "z": float(pt.get("z", 0.0)),
                "safeZoneRadiusMeters": float(binding.get("safe_zone_radius_meters", 40.0)),
            }
            if default_starter_map_id is None:
                default_starter_map_id = map_id

        playable_maps.append(
            {
                "mapId": map_id,
                "nodeId": nid,
                "name": node["name"],
                "districtId": node["parent_district_id"],
                "continentId": node["parent_continent_id"],
                "nodeType": node["node_type"],
                "status": node["status"],
                "isStarterTown": bool(node.get("is_starter_town")),
                "gridCoordinates": node["grid_coordinates"],
                "levelRange": node["level_range"],
            }
        )

        for direction, p_obj in (node.get("portals") or {}).items():
            if not isinstance(p_obj, dict):
                continue
            pid = p_obj["portal_id"]
            portal_routing_table[pid] = {
                "portalId": pid,
                "sourceNodeId": nid,
                "sourceMapId": map_id,
                "direction": direction,
                "targetNodeId": p_obj.get("target_node_id"),
                "targetMapId": p_obj.get("target_map_id"),
                "targetDirection": p_obj.get("target_direction"),
                "gateState": p_obj.get("gate_state"),
                "triggerBoxMeters": p_obj.get("trigger_box_meters"),
                "arrivalPointMeters": p_obj.get("arrival_point_meters"),
                "lockMessage": p_obj.get("lock_message"),
            }

    return {
        "schemaVersion": 1,
        "worldHistoryId": whc["id"],
        "characterScaleBandMeters": whc["character_scale_law"]["height_range_meters"],
        "defaultStarterMapId": default_starter_map_id,
        "starterSpawns": starter_spawns,
        "playableMaps": playable_maps,
        "portalRoutingTable": portal_routing_table,
    }


def validate_studio_directory(studio_dir: Path) -> list[str]:
    """Validate the studio directory and return a list of deterministic error messages."""
    errors: list[str] = []

    if not studio_dir.exists():
        return [f"Studio directory does not exist: {studio_dir}"]

    whc_path = studio_dir / "world_history_and_concept.json"
    if not whc_path.exists():
        return [f"Missing root World History and Concept file: {whc_path}"]

    try:
        whc_raw = whc_path.read_text(encoding="utf-8")
        whc = json.loads(whc_raw)
    except Exception as exc:
        return [f"{whc_path}: failed to parse JSON: {exc}"]

    _check_forbidden_boilerplate(whc_raw, str(whc_path), errors)
    _validate_rationalized_envelope(whc, str(whc_path), errors, require_checklist=True)

    whc_id = whc.get("id", "")
    if not isinstance(whc_id, str) or not whc_id.startswith("world-history-"):
        errors.append(f"{whc_path}: id must start with 'world-history-', got {whc_id!r}")

    whc_status = whc.get("status")
    if whc_status not in ("canon", "draft"):
        errors.append(
            f"{whc_path}: World History and Concept status must be 'canon' or 'draft', got {whc_status!r}"
        )

    _validate_character_scale_law(whc.get("character_scale_law"), str(whc_path), errors)

    premise = whc.get("player_arrival_premise")
    if not isinstance(premise, dict):
        errors.append(f"{whc_path}: missing 'player_arrival_premise' object")
    else:
        for field in ("player_identity", "why_enter_world", "inciting_phenomenon"):
            val = premise.get(field)
            if not isinstance(val, str) or len(val.strip()) < 15:
                errors.append(f"{whc_path}: player_arrival_premise.{field} must be >= 15 chars")

    # Validate Primordial Gods
    gods_by_id: dict[str, dict[str, Any]] = {}
    gods = whc.get("primordial_gods")
    if not isinstance(gods, list) or not gods:
        errors.append(f"{whc_path}: 'primordial_gods' must be a non-empty list")
    else:
        for idx, god in enumerate(gods):
            label = f"{whc_path}#primordial_gods[{idx}]"
            if not isinstance(god, dict):
                errors.append(f"{label}: must be an object")
                continue
            _validate_rationalized_envelope(god, label, errors, require_checklist=False)
            gid = god.get("id", "")
            if not gid.startswith("god-"):
                errors.append(f"{label}: god id must start with 'god-', got {gid!r}")
            for field in ("domain", "geographical_scar", "architectural_imprint"):
                val = god.get(field)
                if not isinstance(val, str) or len(val.strip()) < 10:
                    errors.append(f"{label}: '{field}' must be a non-empty string (>= 10 chars)")
            gods_by_id[gid] = god

    # Validate Historical Epochs & World Scars
    scars_by_id: dict[str, dict[str, Any]] = {}
    epochs = whc.get("historical_epochs")
    if not isinstance(epochs, list) or not epochs:
        errors.append(f"{whc_path}: 'historical_epochs' must be a non-empty list")
    else:
        for idx, epoch in enumerate(epochs):
            label = f"{whc_path}#historical_epochs[{idx}]"
            if not isinstance(epoch, dict):
                errors.append(f"{label}: must be an object")
                continue
            _validate_rationalized_envelope(epoch, label, errors, require_checklist=False)
            involved = epoch.get("involved_god_ids")
            if not isinstance(involved, list) or not involved:
                errors.append(f"{label}: 'involved_god_ids' must be a non-empty list")
            else:
                for gid in involved:
                    if gid not in gods_by_id:
                        errors.append(
                            f"{label}: involved_god_id '{gid}' does not exist in primordial_gods"
                        )
            scars = epoch.get("world_scars")
            if not isinstance(scars, list) or not scars:
                errors.append(f"{label}: 'world_scars' must be a non-empty list")
            else:
                for s_idx, scar in enumerate(scars):
                    s_label = f"{label}.world_scars[{s_idx}]"
                    if not isinstance(scar, dict):
                        errors.append(f"{s_label}: must be an object")
                        continue
                    scar_id = scar.get("scar_id", "")
                    if not isinstance(scar_id, str) or not scar_id.startswith("scar-"):
                        errors.append(f"{s_label}: scar_id must start with 'scar-'")
                    desc = scar.get("description", "")
                    if not isinstance(desc, str) or len(desc.strip()) < 15:
                        errors.append(f"{s_label}: description must be >= 15 characters")
                    spawned = scar.get("spawned_continent_ids")
                    if not isinstance(spawned, list) or not spawned:
                        errors.append(
                            f"{s_label}: spawned_continent_ids must be a non-empty list"
                        )
                    scars_by_id[scar_id] = {
                        **scar,
                        "epoch_status": epoch.get("status"),
                    }

    # Load and validate Continents
    continents_dir = studio_dir / "continents"
    if not continents_dir.exists():
        errors.append(f"Missing continents directory: {continents_dir}")
        return errors

    continent_files = sorted(continents_dir.glob("*.json"))
    if not continent_files:
        errors.append(f"No continent JSON files found in {continents_dir}")
        return errors

    continents_by_id: dict[str, dict[str, Any]] = {}
    for c_path in continent_files:
        try:
            c_raw = c_path.read_text(encoding="utf-8")
            continent = json.loads(c_raw)
        except Exception as exc:
            errors.append(f"{c_path}: failed to parse JSON: {exc}")
            continue

        _check_forbidden_boilerplate(c_raw, str(c_path), errors)
        _validate_rationalized_envelope(continent, str(c_path), errors, require_checklist=True)

        cid = continent.get("id", "")
        if not re.match(r"^continent-[0-9]{2}-[a-z0-9-]+$", cid):
            errors.append(
                f"{c_path}: continent id must match ^continent-[0-9]{{2}}-[a-z0-9-]+$, got {cid!r}"
            )
        if c_path.stem != cid:
            errors.append(
                f"{c_path}: filename stem '{c_path.stem}' must match continent id '{cid}'"
            )

        c_status = continent.get("status")
        if c_status == "canon" and whc_status != "canon":
            errors.append(
                f"{c_path}: continent '{cid}' cannot be 'canon' because parent World History '{whc_id}' is '{whc_status}'"
            )

        causes = continent.get("parent_world_history_causes")
        if not isinstance(causes, dict):
            errors.append(f"{c_path}: missing 'parent_world_history_causes' object")
        else:
            if causes.get("world_history_id") != whc_id:
                errors.append(
                    f"{c_path}: parent_world_history_causes.world_history_id '{causes.get('world_history_id')}' does not match '{whc_id}'"
                )
            patron_ids = causes.get("god_patron_ids")
            if not isinstance(patron_ids, list) or not patron_ids:
                errors.append(
                    f"{c_path}: parent_world_history_causes.god_patron_ids must be a non-empty list"
                )
            else:
                for gid in patron_ids:
                    if gid not in gods_by_id:
                        errors.append(
                            f"{c_path}: unknown god_patron_id '{gid}' (not in {whc_path})"
                        )
                    elif c_status == "canon" and gods_by_id[gid].get("status") != "canon":
                        errors.append(
                            f"{c_path}: canon continent '{cid}' references non-canon patron god '{gid}' ({gods_by_id[gid].get('status')})"
                        )

            war_scar_ids = causes.get("war_scar_ids")
            if not isinstance(war_scar_ids, list) or not war_scar_ids:
                errors.append(
                    f"{c_path}: parent_world_history_causes.war_scar_ids must be a non-empty list"
                )
            else:
                for sid in war_scar_ids:
                    if sid not in scars_by_id:
                        errors.append(
                            f"{c_path}: unknown war_scar_id '{sid}' (not in {whc_path})"
                        )
                    else:
                        spawned_cids = scars_by_id[sid].get("spawned_continent_ids", [])
                        if cid not in spawned_cids:
                            errors.append(
                                f"{c_path}: continent '{cid}' claims scar '{sid}', but '{sid}.spawned_continent_ids' in {whc_path} does not list '{cid}'"
                            )

            summary = causes.get("causal_summary")
            if not isinstance(summary, str) or len(summary.strip()) < 20:
                errors.append(
                    f"{c_path}: parent_world_history_causes.causal_summary must be >= 20 characters"
                )

        if c_status in ("canon", "draft"):
            level_band = continent.get("level_band")
            if not isinstance(level_band, dict):
                errors.append(f"{c_path}: '{c_status}' continent requires 'level_band'")
            else:
                min_lv = level_band.get("min_level")
                max_lv = level_band.get("max_level")
                if (
                    not isinstance(min_lv, int)
                    or not isinstance(max_lv, int)
                    or min_lv < 1
                    or max_lv < min_lv
                ):
                    errors.append(
                        f"{c_path}: invalid level_band {level_band!r} (must have 1 <= min_level <= max_level)"
                    )

            climate = continent.get("climate_profile")
            if not isinstance(climate, dict):
                errors.append(f"{c_path}: '{c_status}' continent requires 'climate_profile'")

            civ = continent.get("civilization_style")
            if not isinstance(civ, dict):
                errors.append(f"{c_path}: '{c_status}' continent requires 'civilization_style'")
            else:
                adaptation = civ.get("character_scale_adaptation")
                if not isinstance(adaptation, str) or len(adaptation.strip()) < 20:
                    errors.append(
                        f"{c_path}: civilization_style.character_scale_adaptation must be >= 20 characters"
                    )

            districts = continent.get("district_ids")
            if not isinstance(districts, list) or not districts:
                errors.append(
                    f"{c_path}: '{c_status}' continent requires at least one entry in 'district_ids'"
                )

            links = continent.get("travel_links")
            if not isinstance(links, list) or not links:
                errors.append(
                    f"{c_path}: '{c_status}' continent requires at least one entry in 'travel_links'"
                )

        continents_by_id[cid] = continent

    # Cross-check continent travel_links target IDs and mystery lock discipline
    for cid, continent in continents_by_id.items():
        c_path = continents_dir / f"{cid}.json"
        for idx, link in enumerate(continent.get("travel_links") or []):
            target_id = link.get("target_continent_id")
            if target_id not in continents_by_id:
                errors.append(
                    f"{c_path}#travel_links[{idx}]: target_continent_id '{target_id}' does not exist"
                )
                continue
            target_continent = continents_by_id[target_id]
            if (
                target_continent.get("status") == "mystery"
                and link.get("status") != "locked_by_mystery"
            ):
                errors.append(
                    f"{c_path}#travel_links[{idx}]: travel link to mystery continent '{target_id}' must have status 'locked_by_mystery'"
                )

    # Cross-check WHC starter_town_bindings against continents
    bindings = whc.get("starter_town_bindings")
    if not isinstance(bindings, list) or not bindings:
        errors.append(f"{whc_path}: 'starter_town_bindings' must be a non-empty list")
    else:
        for idx, binding in enumerate(bindings):
            b_label = f"{whc_path}#starter_town_bindings[{idx}]"
            target_cid = binding.get("continent_id")
            target_did = binding.get("district_id")
            if target_cid not in continents_by_id:
                errors.append(
                    f"{b_label}: continent_id '{target_cid}' does not exist in {continents_dir}"
                )
            else:
                target_c = continents_by_id[target_cid]
                if binding.get("status") == "canon" and target_c.get("status") != "canon":
                    errors.append(
                        f"{b_label}: canon starter town binding references non-canon continent '{target_cid}'"
                    )
                if target_did not in (target_c.get("district_ids") or []):
                    errors.append(
                        f"{b_label}: district_id '{target_did}' is not listed in continent '{target_cid}.district_ids'"
                    )

    # Validate Layer 3 Districts and Layer 4 Nodes (INV-01..INV-07)
    _validate_districts_and_nodes(studio_dir, whc, continents_by_id, errors)

    # Validate Long-Term Multi-Race, 4-Chapter History, Guild/Blacksmith & Boss Hierarchy Gates (GOV-01..GOV-06)
    try:
        from scripts.studio_world_governance import validate_world_governance
    except ImportError:
        from studio_world_governance import validate_world_governance  # type: ignore
    gov_errors, _ = validate_world_governance(studio_dir)
    errors.extend(gov_errors)

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate the Atlas World Top-Down Studio hierarchy (content/studio/)."
    )
    parser.add_argument(
        "--studio-dir",
        type=Path,
        default=DEFAULT_STUDIO_DIR,
        help="Path to content/studio directory (default: %(default)s)",
    )
    parser.add_argument(
        "--emit-runtime-manifest",
        type=Path,
        default=None,
        help="Optional path to write compiled _manifest.runtime.json",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run deterministic validation check and exit non-zero on any violation.",
    )
    args = parser.parse_args(argv)

    errors = validate_studio_directory(args.studio_dir)
    if errors:
        for err in errors:
            print(f"ERROR: {err}", file=sys.stderr)
        print(
            f"\nStudio hierarchy validation FAILED with {len(errors)} error(s).",
            file=sys.stderr,
        )
        return 1

    if args.emit_runtime_manifest:
        manifest = build_runtime_manifest(args.studio_dir)
        args.emit_runtime_manifest.parent.mkdir(parents=True, exist_ok=True)
        args.emit_runtime_manifest.write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )

    continents_count = len(list((args.studio_dir / "continents").glob("*.json")))
    districts_dir = args.studio_dir / "districts"
    districts_count = (
        len(list(districts_dir.rglob("*.json"))) if districts_dir.exists() else 0
    )
    nodes_dir = args.studio_dir / "nodes"
    nodes_count = len(list(nodes_dir.rglob("*.json"))) if nodes_dir.exists() else 0
    print(
        f"OK: Studio hierarchy validated cleanly (1 World History and Concept root, {continents_count} Continents, {districts_count} Districts, {nodes_count} Nodes, INV-01..INV-07 and 5-pillar checklists verified)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
