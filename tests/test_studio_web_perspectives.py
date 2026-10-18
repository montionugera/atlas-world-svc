#!/usr/bin/env python3
"""
Automated test suite for E-010 / F-087..F-134:
  - 4-Level Unabbreviated Perspective Switcher (World History and Concept -> Continent -> District -> Town or Hunting Area)
  - District Connected 2D Map Matrix + Maxion Level-Band Monster Pinning
  - Town or Hunting Area Inspector + Monster/1035 Detail Sheet
  - Human-in-the-Loop Core Rationale, Five-Pillar Quality Checklist Gate, Mystery Toggle, and Downward Child Generation API
  - Autonomous Product Owner Self-Evaluation Telemetry & Continent 03 Penumbra Prism Reef Canon Increment
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import catalog_explorer_web as web  # noqa: E402


class TestStudioWebPerspectives(unittest.TestCase):
    def test_perspectives_bundle_contains_four_layers_and_checklists(self) -> None:
        bundle = web.load_studio_perspectives_bundle()
        self.assertIn("worldHistoryAndConcept", bundle)
        self.assertIn("continents", bundle)
        self.assertIn("districts", bundle)
        self.assertIn("nodes", bundle)
        self.assertIn("runtimeManifest", bundle)
        self.assertIn("selfEvaluation", bundle)

        whc = bundle["worldHistoryAndConcept"]
        self.assertEqual(whc["id"], "world-history-cradle-of-embers")
        self.assertEqual(whc["status"], "canon")
        ok, failed = web.check_five_quality_pillars(whc.get("quality_checklist"))
        self.assertTrue(ok, f"Expected all 5 pillars verified on WHC, failed: {failed}")

        self.assertEqual(len(bundle["continents"]), 3)
        self.assertEqual(len(bundle["districts"]), 29)
        self.assertEqual(len(bundle["nodes"]), 109)

    def test_index_html_renders_unabbreviated_four_perspectives_and_benchmarks(self) -> None:
        html = web.INDEX_HTML
        self.assertIn('id="perspectiveBar"', html)
        self.assertIn('id="productOwnerTelemetryBar"', html)
        self.assertIn("World History and Concept", html)
        self.assertIn("Continent", html)
        self.assertIn("District", html)
        self.assertIn("Town or Hunting Area", html)
        self.assertIn("Levels 1 to 20", html)
        self.assertIn("Levels 81 to 100", html)
        self.assertIn("MAXION MONSTER/1035 DETAIL INSPECTOR", html)
        self.assertIn("Step-by-Step Five-Pillar Quality Checklist", html)
        self.assertIn("/api/studio/rationale/update", html)
        self.assertIn("/api/studio/generate-children", html)

    def test_rationale_update_blocks_canon_when_parent_not_canon_or_checklist_incomplete(self) -> None:
        # 1. hunting-area-cinnamon-bark-viaduct has parent district-cinnamon-bellows-bluff (status: draft)
        res, code = web.update_studio_rationale(
            {
                "nodeId": "hunting-area-cinnamon-bark-viaduct",
                "status": "canon",
            }
        )
        self.assertEqual(code, 400)
        self.assertFalse(res["ok"])
        self.assertIn("parent", res["error"].lower())

        # 2. district-cinnamon-bellows-bluff has parent continent-01-hearthbloom-basin (canon), but incomplete checklist pillars
        res2, code2 = web.update_studio_rationale(
            {
                "nodeId": "district-cinnamon-bellows-bluff",
                "status": "canon",
            }
        )
        self.assertEqual(code2, 400)
        self.assertFalse(res2["ok"])
        self.assertIn("quality_checklist", res2["error"])

    def test_rationale_update_and_undo_snapshot_roundtrip(self) -> None:
        _, orig_doc, _ = web.find_studio_node_and_path("district-cinnamon-bellows-bluff")
        self.assertIsNotNone(orig_doc)
        orig_rationale = orig_doc["core_rationale"]

        new_rationale = (
            "Ninth warm terracotta spice-drying bluff of Continent 01 where Sola's aromatic hearth-drafts cure cinnamon-bark windbreaks above the eastern orchard rim."
        )
        res, code = web.update_studio_rationale(
            {
                "nodeId": "district-cinnamon-bellows-bluff",
                "core_rationale": new_rationale,
                "status": "draft",
            }
        )
        self.assertEqual(code, 200)
        self.assertTrue(res["ok"])
        self.assertEqual(res["node"]["core_rationale"], new_rationale)

        # Undo snapshot to restore original file state cleanly
        undo_res = web.undo_latest_snapshot()
        self.assertTrue(undo_res["ok"])
        _, restored_doc, _ = web.find_studio_node_and_path("district-cinnamon-bellows-bluff")
        self.assertEqual(restored_doc["core_rationale"], orig_rationale)

    def test_generate_children_enforces_canon_and_five_pillar_checklist_gate(self) -> None:
        # 1. Mystery parent district-bimetallic-escapement-mesa must fail with 400
        res_mystery, code_mystery = web.generate_studio_children(
            {
                "parentId": "district-bimetallic-escapement-mesa",
                "childName": "Forbidden Bimetallic Bridge",
                "persist": False,
            }
        )
        self.assertEqual(code_mystery, 400)
        self.assertFalse(res_mystery["ok"])

        # 2. Draft parent district-cinnamon-bellows-bluff must fail with 400
        res_draft, code_draft = web.generate_studio_children(
            {
                "parentId": "district-cinnamon-bellows-bluff",
                "childName": "Cinnamon Mill Village",
                "persist": False,
            }
        )
        self.assertEqual(code_draft, 400)
        self.assertFalse(res_draft["ok"])

        # 3. Canon parent district-penumbra-prism-reef (with 5/5 checklist verified) must succeed with 200
        res_canon, code_canon = web.generate_studio_children(
            {
                "parentId": "district-penumbra-prism-reef",
                "childId": "hunting-area-penumbra-east-atoll",
                "childName": "Penumbra East Atoll",
                "childStatus": "mystery",
                "persist": False,
            }
        )
        self.assertEqual(code_canon, 200)
        self.assertTrue(res_canon["ok"])
        self.assertEqual(res_canon["childLayer"], "town-or-hunting-area")
        self.assertEqual(res_canon["childNode"]["parent_district_id"], "district-penumbra-prism-reef")
        self.assertEqual(res_canon["childNode"]["status"], "mystery")


if __name__ == "__main__":
    unittest.main()
