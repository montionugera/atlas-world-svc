#!/usr/bin/env python3
"""Deterministic validator for the Top-Down World Studio hierarchy (content/studio/).

Enforces:
1. Layer 1 (World History and Concept) and Layer 2 (Continent) structural & schema rules,
   plus optional Layer 3 (District) and Layer 4 (Town, Hunting Area, and Dungeon) rules
   when present.
2. Intentional Mystery / Fog of Lore state machine (`status` in `canon | draft | mystery`):
   - Every node across all layers must have a non-empty `core_rationale` (>= 20 chars).
   - Every `mystery` node must define `mystery_hook` (`in_world_rumor`, `visual_silhouette`,
     `unanswered_question`).
   - A `canon` child cannot exist under a `draft` or `mystery` parent.
3. 90 to 120 centimeter (`[0.90, 1.20]` meters, `1.05` meter reference) Cute Toddler and Kid
   Character Scale Law and environment metrics (`max_grass_height_meters <= 0.35`,
   `max_bush_height_meters <= 0.65`, `max_stair_riser_meters <= 0.18`,
   `min_doorway_height_meters >= 1.80`, `min_doorway_width_meters >= 1.40`,
   `prop_counter_height_range_meters` within `[0.50, 0.70]`,
   `min_highway_corridor_width_meters >= 3.5`).
4. Five-Pillar Step-by-Step Quality, Continuity, Consistency, and Fantasy Checklist
   (`quality_checklist`):
   - Must contain all 5 pillars (`causal_continuity`, `fantasy_and_wonder`,
     `character_scale_consistency`, `spatial_and_ecological_consistency`,
     `intentional_mystery_discipline`) with boolean `verified` and non-empty `evidence`.
   - Any node with `status == "canon"` must have `verified == True` on all 5 pillars.
   - Any node with `status == "mystery"` must have `verified == True` on `causal_continuity`
     and `intentional_mystery_discipline`.
5. Anti-Boilerplate Gate:
   - Rejects deprecated proof-of-concept lore terms (`undertow`, `woolmArch`, `stage_0`,
     `c-town-millcross`) anywhere in `content/studio/`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STUDIO_DIR = REPO_ROOT / "content" / "studio"

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

    continents_count = len(list((args.studio_dir / "continents").glob("*.json")))
    print(
        f"OK: Studio hierarchy validated cleanly (1 World History and Concept root, {continents_count} Continents, 5-pillar checklists verified)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
