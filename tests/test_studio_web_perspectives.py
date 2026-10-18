#!/usr/bin/env python3
"""
Automated test suite for E-010 / F-087 / F-088 / F-089 / F-090 / F-092 / F-093 / F-094 / F-095 / F-096 / F-097 / F-099 / F-101 / F-102 / F-104 / F-106:
  - 4-Level Unabbreviated Perspective Switcher (World History and Concept -> Continent -> District -> Town or Hunting Area)
  - District Connected 2D Map Matrix + Maxion Level-Band Monster Pinning
  - Town or Hunting Area Inspector + Monster/1035 Detail Sheet
  - Human-in-the-Loop Core Rationale, Five-Pillar Quality Checklist Gate, Mystery Toggle, and Downward Child Generation API
  - Autonomous Product Owner Self-Evaluation Telemetry & Continent 01 Porcelain Cradle Canon Increment
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
        self.assertEqual(len(bundle["districts"]), 15)
        self.assertEqual(len(bundle["nodes"]), 53)

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
        # 1. hunting-area-leyden-causeway has parent district-thunder-coil-basin (status: draft)
        res, code = web.update_studio_rationale(
            {
                "nodeId": "hunting-area-leyden-causeway",
                "status": "canon",
            }
        )
        self.assertEqual(code, 400)
        self.assertFalse(res["ok"])
        self.assertIn("parent", res["error"].lower())

        # 2. district-thunder-coil-basin has parent continent-02-clockwork-steppe (canon), but incomplete checklist pillars
        res2, code2 = web.update_studio_rationale(
            {
                "nodeId": "district-thunder-coil-basin",
                "status": "canon",
            }
        )
        self.assertEqual(code2, 400)
        self.assertFalse(res2["ok"])
        self.assertIn("quality_checklist", res2["error"])

    def test_rationale_update_and_undo_snapshot_roundtrip(self) -> None:
        _, orig_doc, _ = web.find_studio_node_and_path("district-thunder-coil-basin")
        self.assertIsNotNone(orig_doc)
        orig_rationale = orig_doc["core_rationale"]

        new_rationale = (
            "Eastern lightning-inductor basin of Continent 02 where Krono's copper fingers grounded storms into Leyden-jar towers."
        )
        res, code = web.update_studio_rationale(
            {
                "nodeId": "district-thunder-coil-basin",
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
        _, restored_doc, _ = web.find_studio_node_and_path("district-thunder-coil-basin")
        self.assertEqual(restored_doc["core_rationale"], orig_rationale)

    def test_generate_children_enforces_canon_and_five_pillar_checklist_gate(self) -> None:
        # 1. Mystery parent district-aphelion-halo-rim must fail with 400
        res_mystery, code_mystery = web.generate_studio_children(
            {
                "parentId": "district-aphelion-halo-rim",
                "childName": "Forbidden Comet Buoy",
                "persist": False,
            }
        )
        self.assertEqual(code_mystery, 400)
        self.assertFalse(res_mystery["ok"])

        # 2. Draft parent district-thunder-coil-basin must fail with 400
        res_draft, code_draft = web.generate_studio_children(
            {
                "parentId": "district-thunder-coil-basin",
                "childName": "Inductor Switchyard Town",
                "persist": False,
            }
        )
        self.assertEqual(code_draft, 400)
        self.assertFalse(res_draft["ok"])

        # 3. Canon parent district-porcelain-cradle (with 5/5 checklist verified) must succeed with 200
        res_canon, code_canon = web.generate_studio_children(
            {
                "parentId": "district-porcelain-cradle",
                "childId": "hunting-area-porcelain-east-spring",
                "childName": "Porcelain East Spring",
                "childStatus": "mystery",
                "persist": False,
            }
        )
        self.assertEqual(code_canon, 200)
        self.assertTrue(res_canon["ok"])
        self.assertEqual(res_canon["childLayer"], "town-or-hunting-area")
        self.assertEqual(res_canon["childNode"]["parent_district_id"], "district-porcelain-cradle")
        self.assertEqual(res_canon["childNode"]["status"], "mystery")


if __name__ == "__main__":
    unittest.main()
