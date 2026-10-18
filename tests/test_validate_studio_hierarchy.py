"""Unit tests for scripts/validate_studio_hierarchy.py."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from scripts.validate_studio_hierarchy import (
    DEFAULT_STUDIO_DIR,
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
        c03_path = self.studio_dir / "continents" / "continent-03-shattered-halo.json"
        data = json.loads(c03_path.read_text(encoding="utf-8"))
        del data["mystery_hook"]
        c03_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

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


if __name__ == "__main__":
    unittest.main()
