"""Unit tests for scripts/validate_studio_hierarchy.py across all 4 levels and INV-01..INV-07."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from scripts.validate_studio_hierarchy import (
    DEFAULT_STUDIO_DIR,
    build_runtime_manifest,
    validate_studio_directory,
)


class ValidateStudioHierarchyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="studio_hierarchy_test_"))
        self.studio_dir = self.temp_dir / "studio"
        shutil.copytree(DEFAULT_STUDIO_DIR, self.studio_dir)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_repository_studio_directory_passes(self) -> None:
        errors = validate_studio_directory(DEFAULT_STUDIO_DIR)
        self.assertEqual(errors, [])

    def test_rejects_missing_core_rationale(self) -> None:
        c03_path = self.studio_dir / "continents" / "continent-03-shattered-halo.json"
        data = json.loads(c03_path.read_text(encoding="utf-8"))
        data["core_rationale"] = "Too short"
        c03_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("core_rationale" in err for err in errors),
            f"Expected core_rationale error, got: {errors}",
        )

    def test_rejects_mystery_node_without_mystery_hook(self) -> None:
        m_path = (
            self.studio_dir
            / "districts"
            / "continent-02-clockwork-steppe"
            / "district-gilded-exhaust.json"
        )
        data = json.loads(m_path.read_text(encoding="utf-8"))
        del data["mystery_hook"]
        m_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("mystery_hook" in err for err in errors),
            f"Expected mystery_hook error, got: {errors}",
        )

    def test_rejects_canon_continent_with_unchecked_quality_checklist(self) -> None:
        c01_path = self.studio_dir / "continents" / "continent-01-hearthbloom-basin.json"
        data = json.loads(c01_path.read_text(encoding="utf-8"))
        data["quality_checklist"]["fantasy_and_wonder"]["verified"] = False
        c01_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("quality_checklist.fantasy_and_wonder.verified" in err for err in errors),
            f"Expected checklist verification error, got: {errors}",
        )

    def test_rejects_canon_child_under_draft_parent(self) -> None:
        whc_path = self.studio_dir / "world_history_and_concept.json"
        data = json.loads(whc_path.read_text(encoding="utf-8"))
        data["status"] = "draft"
        whc_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("cannot be 'canon' because parent World History" in err for err in errors),
            f"Expected parent status violation, got: {errors}",
        )

    def test_rejects_character_scale_law_violation(self) -> None:
        whc_path = self.studio_dir / "world_history_and_concept.json"
        data = copy.deepcopy(json.loads(whc_path.read_text(encoding="utf-8")))
        data["character_scale_law"]["environment_metrics"]["max_grass_height_meters"] = 0.85
        whc_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("max_grass_height_meters" in err for err in errors),
            f"Expected grass height scale violation, got: {errors}",
        )

    def test_rejects_forbidden_legacy_boilerplate_terms(self) -> None:
        c02_path = self.studio_dir / "continents" / "continent-02-clockwork-steppe.json"
        data = json.loads(c02_path.read_text(encoding="utf-8"))
        data["core_rationale"] += " Reference to legacy undertow storyline."
        c02_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("undertow" in err for err in errors),
            f"Expected forbidden legacy term error, got: {errors}",
        )

    def test_inv02_rejects_duplicate_surface_grid_coordinates(self) -> None:
        d_path = (
            self.studio_dir
            / "districts"
            / "continent-01-hearthbloom-basin"
            / "district-teacup-meadows.json"
        )
        data = json.loads(d_path.read_text(encoding="utf-8"))
        data["grid_nodes"][1]["grid_coordinates"] = [1, 1]
        d_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("INV-02 violation" in err for err in errors),
            f"Expected INV-02 violation, got: {errors}",
        )

    def test_inv03_rejects_asymmetric_node_portal(self) -> None:
        n_path = (
            self.studio_dir
            / "nodes"
            / "continent-01-hearthbloom-basin"
            / "district-teacup-meadows"
            / "hunting-area-clover-south-gate.json"
        )
        data = json.loads(n_path.read_text(encoding="utf-8"))
        data["portals"]["North"] = None
        n_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("INV-03 violation" in err for err in errors),
            f"Expected INV-03 violation, got: {errors}",
        )

    def test_inv04_rejects_unreachable_canon_node(self) -> None:
        t_path = (
            self.studio_dir
            / "nodes"
            / "continent-01-hearthbloom-basin"
            / "district-teacup-meadows"
            / "town-lantern-hollow.json"
        )
        e_path = (
            self.studio_dir
            / "nodes"
            / "continent-01-hearthbloom-basin"
            / "district-teacup-meadows"
            / "hunting-area-kiln-east-orchard.json"
        )
        t_data = json.loads(t_path.read_text(encoding="utf-8"))
        e_data = json.loads(e_path.read_text(encoding="utf-8"))
        t_data["portals"]["East"] = None
        e_data["portals"]["West"] = None
        t_path.write_text(json.dumps(t_data, indent=2), encoding="utf-8")
        e_path.write_text(json.dumps(e_data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("INV-04 violation" in err for err in errors),
            f"Expected INV-04 violation, got: {errors}",
        )

    def test_inv06_rejects_out_of_district_monster_family(self) -> None:
        n_path = (
            self.studio_dir
            / "nodes"
            / "continent-01-hearthbloom-basin"
            / "district-teacup-meadows"
            / "hunting-area-clover-south-gate.json"
        )
        data = json.loads(n_path.read_text(encoding="utf-8"))
        data["resident_spawns"][0]["family"] = "undead_demon"
        n_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        errors = validate_studio_directory(self.studio_dir)
        self.assertTrue(
            any("INV-06 violation" in err for err in errors),
            f"Expected INV-06 violation, got: {errors}",
        )

    def test_build_runtime_manifest_excludes_mystery_and_includes_fog_of_lore(self) -> None:
        manifest = build_runtime_manifest(DEFAULT_STUDIO_DIR)
        self.assertEqual(manifest["defaultStarterMapId"], "lantern-hollow")
        self.assertIn("lantern-hollow", manifest["starterSpawns"])
        playable_ids = [m["mapId"] for m in manifest["playableMaps"]]
        self.assertEqual(
            playable_ids,
            [
                "chronometer-foundry-b1",
                "kiln-cellar-b1",
                "mercury-reservoir-b1",
                "pendulum-shaft-b1",
                "brass-spur-ridge",
                "caldera-rim",
                "cinder-apron",
                "clover-south-gate",
                "kiln-east-orchard",
                "siphon-sluice",
                "escapement-anvil",
                "kilnwatch-bastion",
                "lantern-hollow",
                "patina-lock",
                "pinion-terminus",
            ],
        )
        fog_portal = manifest["portalRoutingTable"]["portal-lantern-hollow-west-fog"]
        self.assertEqual(fog_portal["gateState"], "fog_of_lore")
        self.assertIsNone(fog_portal["targetMapId"])
        self.assertTrue(len(fog_portal["lockMessage"]) > 15)


if __name__ == "__main__":
    unittest.main()
