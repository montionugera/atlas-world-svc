#!/usr/bin/env python3
"""
Automated test suite for E-010 / F-087..F-154:
  - 4-Level Unabbreviated Perspective Switcher (World History and Concept -> Continent -> District -> Town or Hunting Area)
  - 4-Level Google/Apple Maps 2D Cartographic Explorer + Interactive Left-Hand Place Details Drawer
  - District Connected 2D Map Matrix + Maxion Level-Band Monster Pinning
  - Town or Hunting Area Inspector + Monster/1035 Detail Sheet
  - Human-in-the-Loop Core Rationale, Five-Pillar Quality Checklist Gate, Mystery Toggle, and Downward Child Generation API
  - Autonomous Product Owner Self-Evaluation Telemetry & Continent 02 Thermal Compensator Basin Canon Increment
  - Long-Term Multi-Race (6 Playable + 6 Monster Ecologies), 4-Chapter History (1.1..1.4), Sealed Gods, Neutral Guild/Blacksmith, Boss Hierarchy & Governance Checklist Gates (GOV-01..GOV-06)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import catalog_explorer_web as web  # noqa: E402
import studio_world_governance as gov  # noqa: E402


class TestStudioWebPerspectives(unittest.TestCase):
    def test_perspectives_bundle_contains_four_layers_and_checklists(self) -> None:
        bundle = web.load_studio_perspectives_bundle()
        self.assertIn("worldHistoryAndConcept", bundle)
        self.assertIn("continents", bundle)
        self.assertIn("districts", bundle)
        self.assertIn("nodes", bundle)
        self.assertIn("runtimeManifest", bundle)
        self.assertIn("selfEvaluation", bundle)
        self.assertIn("governanceReport", bundle)

        whc = bundle["worldHistoryAndConcept"]
        self.assertEqual(whc["id"], "world-history-cradle-of-embers")
        self.assertEqual(whc["status"], "canon")
        ok, failed = web.check_five_quality_pillars(whc.get("quality_checklist"))
        self.assertTrue(ok, f"Expected all 5 pillars verified on WHC, failed: {failed}")

        self.assertEqual(len(bundle["continents"]), 3)
        self.assertEqual(len(bundle["districts"]), 34)
        self.assertEqual(len(bundle["nodes"]), 129)

        gov_rep = bundle["governanceReport"]
        self.assertTrue(gov_rep["ok"], f"Governance errors: {gov_rep.get('errors')}")
        self.assertEqual(gov_rep["summary"]["playableRacesCount"], 6)
        self.assertEqual(gov_rep["summary"]["monsterEcologyRacesCount"], 6)
        self.assertEqual(gov_rep["summary"]["godTierEntitiesCount"], 6)
        self.assertEqual(gov_rep["summary"]["historyChaptersCount"], 4)
        self.assertEqual(gov_rep["summary"]["governanceGatesVerified"], 10)
        self.assertIn("tShapedWorldAtlas", bundle)
        self.assertEqual(bundle["tShapedWorldAtlas"]["id"], "t-shaped-world-atlas-cradle-of-embers")

    def test_long_term_world_governance_and_scaffolding_tools(self) -> None:
        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [])
        self.assertTrue(report["ok"])

        quest_tpl = gov.scaffold_quest_template(
            gov.DEFAULT_STUDIO_DIR,
            race_key="furral",
            track_key="side_quest",
            title="Leyden Coil Storm Patrol",
        )
        self.assertEqual(quest_tpl["home_town_node_id"], "town-cinnamon-mill-haven")
        self.assertEqual(quest_tpl["guild_allegiance"], "neutral_no_side")
        self.assertEqual(quest_tpl["target_hunting_area_id"], "hunting-area-ginger-aqueduct-bridge")
        self.assertEqual(quest_tpl["target_farming_area_id"], "hunting-area-cinnamon-bark-viaduct")

        mvp_tpl = gov.scaffold_boss_template(
            gov.DEFAULT_STUDIO_DIR,
            tier_key="mvp_boss",
            god_id="god-legendary-dragon",
            node_id="dungeon-kiln-cellar",
            name="Volcanor the Tri-Scale Apostle",
        )
        self.assertEqual(mvp_tpl["hierarchy_rank"], 2)
        self.assertEqual(
            mvp_tpl["strict_hierarchy_law"],
            "GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB",
        )

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
        self.assertIn("LONG-TERM GOVERNANCE CHECKLIST (GOV-01..GOV-06)", html)
        self.assertIn("6 Playable & Mob Races", html)
        self.assertIn("Strict Boss Power Hierarchy", html)
        self.assertIn("/api/studio/rationale/update", html)
        self.assertIn("/api/studio/generate-children", html)
        self.assertIn("renderWhcBigPictureSvg", html)
        self.assertIn("renderContinentBigPictureSvg", html)
        self.assertIn("renderDistrictBigPictureSvg", html)
        self.assertIn("renderTownOrHuntingAreaBigPictureSvg", html)
        # Google/Apple Maps 2D Cartographic Explorer + Place Details Slide-Over Drawer
        self.assertIn("renderCartoShellHtml", html)
        self.assertIn("studioGooglePlaceDrawer", html)
        self.assertIn("selectStudioMapPoi", html)
        self.assertIn("zoomStudioMap", html)
        self.assertIn("onStudioMapWheel", html)
        for thumb_req in (
            "/thumbs/nature/pine_tree_1.webp",
            "/thumbs/buildings/bridge_stone.webp",
            "/thumbs/creatures/god-sola-hearth-weaver.webp",
            "/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp",
        ):
            resolved = web.resolve_thumb_file(thumb_req)
            self.assertIsNotNone(resolved)
            self.assertTrue(resolved.exists())

    def test_rationale_update_blocks_canon_when_parent_not_canon_or_checklist_incomplete(self) -> None:
        # 1. hunting-area-solstice-chain-causeway has parent district-solstice-pendulum-atoll (status: draft)
        res, code = web.update_studio_rationale(
            {
                "nodeId": "hunting-area-solstice-chain-causeway",
                "status": "canon",
            }
        )
        self.assertEqual(code, 400)
        self.assertFalse(res["ok"])
        self.assertIn("parent", res["error"].lower())

        # 2. district-solstice-pendulum-atoll has parent continent-03-shattered-halo (canon), but incomplete checklist pillars
        res2, code2 = web.update_studio_rationale(
            {
                "nodeId": "district-solstice-pendulum-atoll",
                "status": "canon",
            }
        )
        self.assertEqual(code2, 400)
        self.assertFalse(res2["ok"])
        self.assertIn("quality_checklist", res2["error"])

    def test_rationale_update_and_undo_snapshot_roundtrip(self) -> None:
        _, orig_doc, _ = web.find_studio_node_and_path("district-solstice-pendulum-atoll")
        self.assertIsNotNone(orig_doc)
        orig_rationale = orig_doc["core_rationale"]

        new_rationale = (
            "Twelfth floating basalt-and-starlight pendulum island of Continent 03 where Vesper's longest inverted gravity chain swings between the summer and winter solstice beacons."
        )
        res, code = web.update_studio_rationale(
            {
                "nodeId": "district-solstice-pendulum-atoll",
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
        _, restored_doc, _ = web.find_studio_node_and_path("district-solstice-pendulum-atoll")
        self.assertEqual(restored_doc["core_rationale"], orig_rationale)

    def test_generate_children_enforces_canon_and_five_pillar_checklist_gate(self) -> None:
        # 1. Mystery parent district-cardamom-kiln-caldera must fail with 400
        res_mystery, code_mystery = web.generate_studio_children(
            {
                "parentId": "district-cardamom-kiln-caldera",
                "childName": "Forbidden Cardamom Kiln",
                "persist": False,
            }
        )
        self.assertEqual(code_mystery, 400)
        self.assertFalse(res_mystery["ok"])

        # 2. Draft parent district-solstice-pendulum-atoll must fail with 400
        res_draft, code_draft = web.generate_studio_children(
            {
                "parentId": "district-solstice-pendulum-atoll",
                "childName": "Solstice Pendulum Sanctuary",
                "persist": False,
            }
        )
        self.assertEqual(code_draft, 400)
        self.assertFalse(res_draft["ok"])

        # 3. Canon parent district-thermal-compensator-basin (with 5/5 checklist verified) must succeed with 200
        res_canon, code_canon = web.generate_studio_children(
            {
                "parentId": "district-thermal-compensator-basin",
                "childId": "hunting-area-thermal-east-bellows",
                "childName": "Thermal East Bellows",
                "childStatus": "mystery",
                "persist": False,
            }
        )
        self.assertEqual(code_canon, 200)
        self.assertTrue(res_canon["ok"])
        self.assertEqual(res_canon["childLayer"], "town-or-hunting-area")
        self.assertEqual(res_canon["childNode"]["parent_district_id"], "district-thermal-compensator-basin")
        self.assertEqual(res_canon["childNode"]["status"], "mystery")

    def test_semantic_world_atlas_town_blueprints_and_multifloor_dungeons(self) -> None:
        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        bundle = web.load_studio_perspectives_bundle()
        atlas = bundle["tShapedWorldAtlas"]
        # Verify Town Blueprint service marks & 1..12 NPC roster on deep_town
        tb = atlas["t_deep_validation_slice"]["deep_town"]["town_blueprint"]
        mark_types = {m["mark_type"] for m in tb["service_marks"]}
        for req_mark in ("equip_shop", "consumable_shop", "blacksmith", "temple", "warehouse", "guild", "gatekeeper"):
            self.assertIn(req_mark, mark_types)
        self.assertEqual(len(tb["npc_roster"]), 12)
        # Verify Multi-Floor Underground Dungeon (B1..B3) & Vertical Towers (1F..3F) bound to canon studio_node_ids
        mf = {d["dungeon_id"]: d for d in atlas["multi_floor_dungeons"]}
        self.assertIn("zone-dungeon-kiln-cellar", mf)
        self.assertIn("zone-dungeon-pendulum-shaft", mf)
        self.assertEqual([f["floor_id"] for f in mf["zone-dungeon-kiln-cellar"]["floors"]], ["B1", "B2", "B3"])
        self.assertEqual([f["floor_id"] for f in mf["zone-dungeon-pendulum-shaft"]["floors"]], ["1F", "2F", "3F"])

    def test_dedicated_semantic_zoom_atlas_component_and_filters(self) -> None:
        html = web.INDEX_HTML
        for token in (
            "renderDedicatedWorldAtlas",
            "getAllAtlasTownEntries",
            "Select Town Blueprint",
            "Select Multi-Floor Dungeon Sub-Map",
            "Switch Active Town Street Blueprint",
            "openDungeonSubMap",
            "switchDungeonFloor",
            "exitDungeonSubMap",
            "setAtlasFilter",
            "setAtlasLevelBand",
            "resetAtlasFilters",
            "onStudioMapKeyDown",
            "equip_shop",
            "consumable_shop",
            "blacksmith",
            "warehouse",
            "gatekeeper",
            "Gludin",
            "The Ant Nest",
            "Cruma Tower",
        ):
            self.assertIn(token, html, f"Missing token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        atlas = bundle["tShapedWorldAtlas"]
        zdir = atlas["t_breadth_zone_directory"]
        all_towns = zdir["starting_towns"] + zdir["other_castle_and_hub_towns"]
        self.assertEqual(len(all_towns), 15)
        for t_entry in all_towns:
            self.assertIn("town_blueprint", t_entry)
            self.assertEqual(len(t_entry["town_blueprint"]["npc_roster"]), 12)
        self.assertEqual(len(atlas["multi_floor_dungeons"]), 16)

    def test_field_tactical_and_fortress_blueprints_and_dungeon_warps(self) -> None:
        errors, _ = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")

        html = web.INDEX_HTML
        for token in (
            "focusFieldTacticalBlueprint",
            "focusFortressBlueprint",
            "renderFieldOrFortressTacticalBlueprintAtlas",
            "Select Field Tactical Blueprint",
            "Select Fortress Blueprint",
            "Switch Active Field Tactical Blueprint",
            "Monster Pack Ring",
            "Mini-Boss Patrol",
            "Raid Boss Arena",
            "Refinement Drops",
            "Dungeon Entrance Warp",
        ):
            self.assertIn(token, html, f"Missing token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        atlas = bundle["tShapedWorldAtlas"]
        zdir = atlas["t_breadth_zone_directory"]
        mf_ids = {d["dungeon_id"] for d in atlas["multi_floor_dungeons"]}

        fields = zdir["fields_and_hunting_areas"]
        self.assertEqual(len(fields), 24)
        for f_entry in fields:
            self.assertIn("field_tactical_blueprint", f_entry)
            ftb = f_entry["field_tactical_blueprint"]
            marks = {m["mark_type"] for m in ftb["camp_and_shrine_marks"]}
            for req_mark in ("Supply Camp", "Wayfarer Shrine", "Gatekeeper Waypoint", "Refinement Ore Vein"):
                self.assertIn(req_mark, marks)
            tiers = {st["entity_type"] for st in ftb["spawn_territories"]}
            self.assertEqual(tiers, {"Monster", "Mini-Boss", "Raid", "MVP"})
            for st in ftb["spawn_territories"]:
                self.assertGreaterEqual(len(st["refinement_drops"]), 1)
            self.assertGreaterEqual(len(ftb["dungeon_entrance_warps"]), 1)
            for dw in ftb["dungeon_entrance_warps"]:
                self.assertIn(dw["dungeon_id"], mf_ids)
                self.assertIn(dw["floor_id"], ("B1", "1F"))

        forts = zdir["harbors_clanhalls_and_forts"]
        self.assertEqual(len(forts), 8)
        for h_entry in forts:
            self.assertIn("fortress_blueprint", h_entry)
            fbp = h_entry["fortress_blueprint"]
            self.assertIn(fbp["fortress_kind"], ("harbor", "clan_hall", "fortress"))
            tiers = {st["entity_type"] for st in fbp["spawn_territories"]}
            self.assertEqual(tiers, {"Monster", "Mini-Boss", "Raid", "MVP"})
            self.assertGreaterEqual(len(fbp["dungeon_entrance_warps"]), 1)
            for dw in fbp["dungeon_entrance_warps"]:
                self.assertIn(dw["dungeon_id"], mf_ids)
                self.assertIn(dw["floor_id"], ("B1", "1F"))

    def test_wave3_viewport_zoom_race_routes_and_refinement_inspector(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["raceGrowthRoutesCount"], 6)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["townShopRefinementCatalogsCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "resolveNearestZoneFromPanAndLoc",
            "ATLAS_FOCUSED_TOWN_ID",
            "ATLAS_FOCUSED_FIELD_ID",
            "ATLAS_FOCUSED_FORTRESS_ID",
            "setAtlasRaceGrowthRoute",
            "Highlight Race Growth Path:",
            "studioRaceGrowthRouteOverlay",
            "studioShopAndRefinementInspector",
            "shopAndRefinementCatalog",
            "+1 to +15 Refinement Anvil Rates",
        ):
            self.assertIn(token, html, f"Missing Wave 3 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertEqual(audit["dimensions"]["D9_race_growth_routes"]["score"], 100.0)
        self.assertEqual(audit["dimensions"]["D10_shop_and_refinement_catalogs"]["score"], 100.0)

        routes = atlas["race_growth_routes"]
        self.assertEqual(len(routes), 6)
        expected_races = {"Human", "Lunar", "Ogre/Orc", "Dwarf", "Dark-Lunar", "Furral"}
        self.assertEqual({r["race_label"] for r in routes}, expected_races)
        valid_modes = {"footpath", "highway", "gatekeeper_teleport", "dungeon_warp", "sea_or_airship"}
        for rt in routes:
            wps = rt["waypoints"]
            self.assertEqual(len(wps), 12)
            self.assertEqual([w["stage_code"] for w in wps], list("ABCDEFGHIJKL"))
            for wp in wps:
                self.assertIn(wp["travel_mode"], valid_modes)
                self.assertTrue(wp["milestone_goal"])

        zdir = atlas["t_breadth_zone_directory"]
        all_towns = zdir["starting_towns"] + zdir["other_castle_and_hub_towns"]
        self.assertEqual(len(all_towns), 15)
        for t_entry in all_towns:
            cat = t_entry["town_blueprint"]["shop_and_refinement_catalog"]
            self.assertGreaterEqual(len(cat["equip_shop_stock"]), 4)
            self.assertGreaterEqual(len(cat["consumable_shop_stock"]), 4)
            self.assertEqual(len(cat["refinement_anvil_rates"]), 5)
            self.assertGreaterEqual(len(cat["blacksmith_material_spoils"]), 3)

    def test_wave4_town_layout_archetypes_schematic_toggle_and_vertical_cutaway(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["townLayoutArchetypesCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["dungeonVerticalCutawaysCount"], 16)

        html = web.INDEX_HTML
        for token in (
            "setTownBlueprintMode",
            "renderTownArchetypeBackdropSvg",
            "renderOrenSchematicBlueprintSvg",
            "renderDungeonVerticalCutawaySvg",
            "Parchment Town Map (Screenshots 3 &amp; 4)",
            'Architectural Schematic ("Oren by Cheese" Screenshot 5)',
            "VERTICAL TOWER CUTAWAY",
            "UNDERGROUND DESCENT CUTAWAY",
            "radial_moat_sanctuary",
            "polygonal_walled_keep",
            "schematic_grid_blueprint",
            "harbor_fortress_plaza",
        ):
            self.assertIn(token, html, f"Missing Wave 4 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertEqual(audit["dimensions"]["D11_town_layout_archetypes"]["score"], 100.0)
        self.assertEqual(audit["dimensions"]["D11_town_layout_archetypes"]["verified"], 15)
        self.assertEqual(audit["dimensions"]["D12_dungeon_vertical_cutaways"]["score"], 100.0)
        self.assertEqual(audit["dimensions"]["D12_dungeon_vertical_cutaways"]["verified"], 16)

        zdir = atlas["t_breadth_zone_directory"]
        all_towns = zdir["starting_towns"] + zdir["other_castle_and_hub_towns"]
        archetypes_seen = {t["town_blueprint"]["layout_archetype"] for t in all_towns}
        self.assertEqual(
            archetypes_seen,
            {
                "radial_moat_sanctuary",
                "polygonal_walled_keep",
                "schematic_grid_blueprint",
                "harbor_fortress_plaza",
            },
        )

        for dng in atlas["multi_floor_dungeons"]:
            is_tower = dng["dungeon_kind"] == "vertical_tower"
            for fl in dng["floors"]:
                elev = fl["floor_elevation_meters"]
                self.assertIsInstance(elev, int)
                if is_tower:
                    self.assertGreater(elev, 0)
                else:
                    self.assertLess(elev, 0)
                self.assertTrue(fl["boss_tier_highlight"])

    def test_wave5_omni_search_and_filtered_entity_spawn_matrix(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        summary = report["summary"]["tShapedAtlasSummary"]
        self.assertEqual(summary["omniSearchIndexedZonesCount"], 63)
        self.assertEqual(summary["omniSearchIndexedTownNpcsCount"], 180)
        self.assertEqual(summary["omniSearchIndexedServiceMarksCount"], 105)
        self.assertEqual(summary["omniSearchIndexedDungeonFloorsCount"], 48)
        self.assertEqual(summary["dungeonAndFieldSpawnRefinementDropsCount"], 40)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_OMNI_SEARCH_QUERY",
            "setAtlasOmniSearch",
            "clearAtlasOmniSearch",
            "buildAtlasOmniSearchIndex",
            "searchAtlasOmniIndex",
            "renderAtlasFilteredEntityMatrixHtml",
            "studioFilteredEntitySpawnMatrix",
            "🔎 Search Towns (Gludin, Dion, Oren), Dungeons (Ant Nest, Cruma), NPCs (Shop, Refinement, Warehouse), Races, or Mobs/MVPs...",
            "Gludin Village",
            "The Ant Nest",
            "Refinement +1..+15",
            "Warehouse",
            "MVP Bosses",
            "Raid Bosses",
            "Cruma Tower",
            "📍 Locate on Map / Open Floor",
        ):
            self.assertIn(token, html, f"Missing Wave 5 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        d13 = audit["dimensions"]["D13_omni_search_and_quick_jump"]
        self.assertEqual(d13["score"], 100.0)
        self.assertEqual(d13["indexed_zones"], 63)
        self.assertEqual(d13["indexed_town_npcs"], 180)
        self.assertEqual(d13["indexed_service_marks"], 105)
        self.assertEqual(d13["indexed_dungeon_floors"], 48)

        d14 = audit["dimensions"]["D14_spawn_and_refinement_spoil_matrix"]
        self.assertEqual(d14["score"], 100.0)
        self.assertEqual(d14["verified_dungeons"], 16)
        self.assertEqual(d14["verified_fields"], 24)

        for dng in atlas["multi_floor_dungeons"]:
            self.assertEqual(len(dng["floors"]), 3)
            for fl in dng["floors"]:
                tiers_found = set()
                for sp in fl["spawns"]:
                    etype = "Raid" if sp["entity_type"] == "RaidBoss" else sp["entity_type"]
                    tiers_found.add(etype)
                    self.assertGreaterEqual(len(sp.get("refinement_drops") or []), 1)
                    self.assertIn(":", sp["loc_coord"])
                self.assertTrue({"Monster", "Mini-Boss", "Raid", "MVP"}.issubset(tiers_found))

    def test_wave6_archetype_raster_plates_and_unified_map_directory(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        summary = report["summary"]["tShapedAtlasSummary"]
        self.assertEqual(summary["archetypeRasterPlatesCount"], 11)
        self.assertEqual(summary["unifiedMapDirectoryZonesCount"], 63)

        maps_dir = ROOT / "content" / "studio" / "maps"
        for plate in (
            "town_radial_moat_parchment.png",
            "town_polygonal_keep_parchment.png",
            "town_oren_schematic_plate.png",
            "dungeon_underground_b1_b3_radar.png",
            "dungeon_vertical_tower_1f_3f_radar.png",
        ):
            p_file = maps_dir / plate
            self.assertTrue(p_file.is_file(), f"Missing raster plate {plate}")
            self.assertGreater(p_file.stat().st_size, 1000, f"Empty/tiny raster plate {plate}")

        html = web.INDEX_HTML
        for token in (
            "/studio-maps/town_radial_moat_parchment.png",
            "/studio-maps/town_polygonal_keep_parchment.png",
            "/studio-maps/town_oren_schematic_plate.png",
            "/studio-maps/dungeon_underground_b1_b3_radar.png",
            "/studio-maps/dungeon_vertical_tower_1f_3f_radar.png",
            "renderMapDirectory",
            "renderUnified63ZoneAtlasDirectoryHtml",
            "jumpFromMapDirectoryToAtlas",
            "Starting Towns (6)",
            "Castle & Hub Towns (9)",
            "Fields & Hunting Areas (24)",
            "Multi-Floor Dungeons & Catacombs (16)",
            "Harbors, Clan Halls & Fortresses (8)",
        ):
            self.assertIn(token, html, f"Missing Wave 6 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        d15 = audit["dimensions"]["D15_archetype_raster_plates"]
        self.assertEqual(d15["score"], 100.0)
        self.assertEqual(d15["verified"], 11)
        self.assertEqual(d15["target"], 11)
        d16 = audit["dimensions"]["D16_unified_connected_map_directory"]
        self.assertEqual(d16["score"], 100.0)
        self.assertEqual(d16["verified"], 63)
        self.assertEqual(d16["target"], 63)
        self.assertTrue(d16["ui_wired"])

    def test_wave7_travel_route_calculator_dungeon_room_inspector_and_telemetry(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")

        html = web.INDEX_HTML
        for token in (
            "computeShortestAtlasZonePath",
            "setAtlasRouteEndpoints",
            "ATLAS_ROUTE_FROM_ID",
            "ATLAS_ROUTE_TO_ID",
            "selectDungeonRoomPoi",
            "Gludin Village ➔ The Ant Nest",
            "Gludin Village ➔ Town of Dion",
            "Town of Dion ➔ Cruma Tower",
            "Town of Oren ➔ Tower of Insolence",
            "18-Dimension Semantic-Zoom Atlas Score",
            "studioTravelItineraryPanel",
        ):
            self.assertIn(token, html, f"Missing Wave 7 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 18)

        d17 = audit["dimensions"]["D17_travel_route_and_gatekeeper_calculator"]
        self.assertEqual(d17["score"], 100.0)
        self.assertEqual(d17["verified"], 6 * 63)
        self.assertEqual(d17["target"], 6 * 63)
        self.assertTrue(d17["ui_wired"])
        for starter_id, count in d17["starter_reachability"].items():
            self.assertEqual(count, 63, f"Starter {starter_id} only reached {count}/63 zones")

        d18 = audit["dimensions"]["D18_dungeon_room_inspector_and_telemetry"]
        self.assertEqual(d18["score"], 100.0)
        self.assertEqual(d18["clickable_chambers"], d18["total_chambers"])
        self.assertGreaterEqual(d18["clickable_chambers"], 96)
        self.assertEqual(d18["clickable_spawns"], d18["total_spawns"])
        self.assertTrue(d18["telemetry_wired"])

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas18DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 18)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 18)
        self.assertIn("18-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave8_refinement_grade_matrix_spoil_locator_and_d20_sync(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["refinementGradeMatrixCount"], 6)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_REFINE_GRADE",
            "ATLAS_REFINE_PLUS",
            "ATLAS_ACTIVE_DUNGEON_ID",
            "setAtlasRefineGrade",
            "setAtlasRefinePlus",
            "syncStudioNodeToDedicatedAtlas",
            "Jump to Blacksmith Town Street Map",
            "Highlight Material Drop Zones / Open Dungeon Floor",
            "20-Dimension Semantic-Zoom Atlas Score",
            "No-Grade Lv.1–19",
            "D-Grade Lv.20–39",
            "C-Grade Lv.40–51",
            "B-Grade Lv.52–60",
            "A-Grade Lv.61–75",
            "S-Grade Lv.76–99",
        ):
            self.assertIn(token, html, f"Missing Wave 8 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 20)

        d19 = audit["dimensions"]["D19_refinement_grade_and_spoil_locator"]
        self.assertEqual(d19["score"], 100.0)
        self.assertEqual(d19["verified"], 6)
        self.assertEqual(d19["target"], 6)
        self.assertTrue(d19["ui_wired"])

        d20 = audit["dimensions"]["D20_bidirectional_studio_atlas_sync_and_docs"]
        self.assertEqual(d20["score"], 100.0)
        self.assertEqual(d20["verified"], 3)
        self.assertEqual(d20["target"], 3)
        self.assertTrue(d20["sync_js_wired"])
        self.assertTrue(d20["readme_documented"])
        self.assertTrue(d20["drawio_verified"])

        ref_matrix = atlas["refinement_grade_matrix"]
        self.assertEqual(len(ref_matrix), 6)
        expected_grades = [
            "No-Grade Lv.1–19",
            "D-Grade Lv.20–39",
            "C-Grade Lv.40–51",
            "B-Grade Lv.52–60",
            "A-Grade Lv.61–75",
            "S-Grade Lv.76–99",
        ]
        self.assertEqual([g["grade_code"] for g in ref_matrix], expected_grades)
        for g in ref_matrix:
            self.assertEqual(g["safe_refinement_level"], 3)
            self.assertEqual(g["max_refinement_level"], 15)
            self.assertEqual(len(g["rates_by_plus"]), 15)
            self.assertEqual([r["plus_level"] for r in g["rates_by_plus"]], list(range(1, 16)))
            self.assertGreaterEqual(len(g["required_materials"]), 2)
            self.assertGreaterEqual(len(g["home_blacksmith_towns"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas20DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 20)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 20)
        self.assertIn("20-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave9_boss_hierarchy_chains_and_pip_world_radar_minimap(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["bossHierarchyChainsCount"], 6)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_BOSS_GOD_ID",
            "setAtlasBossGodChain(",
            "renderAtlasBossHierarchyChainBarHtml(",
            "studioBossHierarchyChainOverlay",
            "renderAtlasOverviewMiniMapPipSvg(",
            "studioOverviewMiniMapPip",
            "Expand to World Map (1.0×)",
            "22-Dimension Semantic-Zoom Atlas Score",
            "god-sola-hearth-weaver",
            "god-krono-brass-titan",
            "god-vesper-dream-eater",
            "god-aurelia-dawn-forger",
            "god-thalassa-abyss-tide",
            "god-legendary-dragon",
        ):
            self.assertIn(token, html, f"Missing Wave 9 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 22)

        d21 = audit["dimensions"]["D21_boss_hierarchy_and_sealed_god_chains"]
        self.assertEqual(d21["score"], 100.0)
        self.assertEqual(d21["verified"], 6)
        self.assertEqual(d21["target"], 6)
        self.assertTrue(d21["ui_wired"])

        d22 = audit["dimensions"]["D22_pip_world_radar_minimap_in_zoomed_views"]
        self.assertEqual(d22["score"], 100.0)
        self.assertEqual(d22["verified"], 4)
        self.assertEqual(d22["target"], 4)

        chains = atlas["boss_hierarchy_chains"]
        self.assertEqual(len(chains), 6)
        expected_gods = [
            "god-sola-hearth-weaver",
            "god-krono-brass-titan",
            "god-vesper-dream-eater",
            "god-aurelia-dawn-forger",
            "god-thalassa-abyss-tide",
            "god-legendary-dragon",
        ]
        self.assertEqual([c["god_id"] for c in chains], expected_gods)
        for c in chains:
            self.assertTrue(c["seal_catacomb_zone_id"])
            self.assertIn(":", c["seal_loc"])
            self.assertGreaterEqual(len(c["mvp_apostles"]), 2)
            self.assertGreaterEqual(len(c["raid_bosses"]), 2)
            self.assertGreaterEqual(len(c["mini_bosses"]), 2)
            self.assertGreaterEqual(len(c["minion_families"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas22DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 22)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 22)
        self.assertIn("22-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave10_quest_trial_chains_and_farming_efficiency_heatmap(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["questTrialChainsCount"], 18)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["farmingEfficiencyProfilesCount"], 40)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_QUEST_TRACK",
            "ATLAS_ACTIVE_QUEST_ID",
            "setAtlasQuestTrack(",
            "selectAtlasQuestChain(",
            "renderAtlasQuestTrialOverlayBarHtml(",
            "studioQuestTrialChainOverlay",
            "ATLAS_FARMING_MODE",
            "setAtlasFarmingMode(",
            "renderAtlasFarmingHeatmapBarHtml(",
            "studioFarmingEfficiencyHeatmapOverlay",
            "24-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 10 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 24)

        d23 = audit["dimensions"]["D23_quest_trial_chains_and_class_transfers"]
        self.assertEqual(d23["score"], 100.0)
        self.assertEqual(d23["verified"], 18)
        self.assertEqual(d23["target"], 18)
        self.assertTrue(d23["ui_wired"])

        d24 = audit["dimensions"]["D24_party_and_farming_efficiency_heatmap"]
        self.assertEqual(d24["score"], 100.0)
        self.assertEqual(d24["verified"], 40)
        self.assertEqual(d24["target"], 40)
        self.assertTrue(d24["ui_wired"])

        quests = atlas["quest_trial_chains"]
        self.assertEqual(len(quests), 18)
        self.assertEqual(
            {q["quest_track"] for q in quests},
            {"main_story", "class_transfer", "racial_heritage"},
        )
        self.assertEqual(
            {q["race_id"] for q in quests},
            {"Human", "Lunar", "Ogre/Orc", "Dwarf", "Dark-Lunar", "Furral"},
        )
        self.assertEqual(
            {q["class_tier"] for q in quests},
            {"None", "1st_Class_Lv20", "2nd_Class_Lv40", "3rd_Awakening_Lv76"},
        )

        profiles = atlas["farming_efficiency_profiles"]
        self.assertEqual(len(profiles), 40)
        self.assertEqual(sum(1 for p in profiles if p["zone_kind"] == "field"), 24)
        self.assertEqual(sum(1 for p in profiles if p["zone_kind"] == "dungeon"), 16)
        self.assertEqual(
            {p["recommended_party_mode"] for p in profiles},
            {"solo_grinding", "duo_spoil_scavenger", "full_9p_aoe_party", "clan_raid_force"},
        )

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas24DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 24)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 24)
        self.assertIn("24-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave11_castle_siege_domains_and_world_boss_spawn_radar(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["castleSiegeDomainsCount"], 8)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["worldBossSpawnRadarCount"], 32)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_SIEGE_DOMAIN_ID",
            "setAtlasSiegeDomain(",
            "renderAtlasSiegeDomainBarHtml(",
            "studioCastleSiegeDomainOverlay",
            "ATLAS_BOSS_RADAR_MODE",
            "setAtlasBossRadarMode(",
            "renderAtlasBossRadarBarHtml(",
            "studioWorldBossSpawnRadarOverlay",
            "26-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 11 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 26)

        d25 = audit["dimensions"]["D25_castle_siege_and_territory_tax_domains"]
        self.assertEqual(d25["score"], 100.0)
        self.assertEqual(d25["verified"], 8)
        self.assertEqual(d25["target"], 8)
        self.assertTrue(d25["ui_wired"])

        d26 = audit["dimensions"]["D26_world_boss_and_mvp_spawn_radar"]
        self.assertEqual(d26["score"], 100.0)
        self.assertEqual(d26["verified"], 32)
        self.assertEqual(d26["target"], 32)
        self.assertEqual(d26["dungeon_mvp_count"], 16)
        self.assertEqual(d26["overland_boss_count"], 16)
        self.assertTrue(d26["ui_wired"])

        domains = atlas["castle_siege_domains"]
        self.assertEqual(len(domains), 8)
        self.assertEqual(
            {d["domain_tier"] for d in domains},
            {"Capital_Citadel", "Regional_Castle", "Border_Fortress", "Harbor_Stronghold"},
        )
        for d in domains:
            self.assertGreaterEqual(len(d["vassal_town_ids"]), 1)
            self.assertGreaterEqual(len(d["vassal_hunting_zone_ids"]), 1)
            self.assertTrue(8 <= d["tax_rate_pct"] <= 15)

        radar = atlas["world_boss_spawn_radar"]
        self.assertEqual(len(radar), 32)
        self.assertEqual(sum(1 for b in radar if b["dungeon_id"] != "" and b["boss_category"] == "MVP"), 16)
        self.assertEqual(sum(1 for b in radar if b["dungeon_id"] == "" and b["boss_category"] in ("Raid", "Mini-Boss")), 16)
        self.assertEqual(
            {b["radar_status"] for b in radar},
            {"Window Open", "Respawning Soon", "Sanctum Active"},
        )

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas26DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 26)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 26)
        self.assertIn("26-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave12_seven_seals_competitions_and_manor_economy_routes(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["sevenSealsCompetitionsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["manorEconomyRoutesCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_SEVEN_SEALS_MODE",
            "setAtlasSevenSealsMode(",
            "renderAtlasSevenSealsBarHtml(",
            "studioSevenSealsOverlay",
            "ATLAS_MANOR_MODE",
            "setAtlasManorMode(",
            "renderAtlasManorEconomyBarHtml(",
            "studioManorEconomyOverlay",
            "28-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 12 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 28)

        d27 = audit["dimensions"]["D27_seven_seals_and_mammon_rotation"]
        self.assertEqual(d27["score"], 100.0)
        self.assertEqual(d27["verified"], 16)
        self.assertEqual(d27["target"], 16)
        self.assertEqual(d27["catacomb_sanctums"], 8)
        self.assertEqual(d27["tower_sanctums"], 8)
        self.assertTrue(d27["ui_wired"])

        d28 = audit["dimensions"]["D28_manor_seed_and_caravan_economy"]
        self.assertEqual(d28["score"], 100.0)
        self.assertEqual(d28["verified"], 15)
        self.assertEqual(d28["target"], 15)
        self.assertTrue(d28["ui_wired"])

        competitions = atlas["seven_seals_competitions"]
        self.assertEqual(len(competitions), 16)
        self.assertEqual(sum(1 for c in competitions if c["sanctum_type"] == "Seal_Catacomb"), 8)
        self.assertEqual(sum(1 for c in competitions if c["sanctum_type"] == "Ascendant_Necropolis_Tower"), 8)
        self.assertEqual(
            {c["seal_allegiance"] for c in competitions},
            {"Sign_of_Avarice", "Sign_of_Gnosis", "Sign_of_Strife"},
        )
        self.assertEqual(
            {c["controlling_cabal"] for c in competitions},
            {"Lords_of_Dawn", "Revolutionaries_of_Dusk", "Contested_Equilibrium"},
        )
        self.assertEqual(
            {c["mammon_visitor_npc"] for c in competitions},
            {"Blacksmith_of_Mammon", "Merchant_of_Mammon"},
        )

        manors = atlas["manor_economy_routes"]
        self.assertEqual(len(manors), 15)
        self.assertEqual(
            {m["caravan_route_risk"] for m in manors},
            {"Low_Patrolled", "Medium_Bandit_Road", "High_Frontier_Ambush"},
        )
        self.assertTrue(
            {"Enria", "Asofe", "Thons", "Oriharukon", "Synthetic Cokes"}.issubset(
                {m["procure_reward_material"] for m in manors}
            )
        )

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas28DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 28)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 28)
        self.assertIn("28-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave13_noblesse_olympiad_network_and_intercontinental_transit_lines(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["noblesseOlympiadNetworkCount"], 21)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["intercontinentalTransitLinesCount"], 18)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_OLYMPIAD_MODE",
            "setAtlasOlympiadMode(",
            "renderAtlasOlympiadNetworkBarHtml(",
            "studioNoblesseOlympiadOverlay",
            "ATLAS_TRANSIT_MODE",
            "setAtlasTransitMode(",
            "renderAtlasTransitLinesBarHtml(",
            "studioIntercontinentalTransitOverlay",
            "30-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 13 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 30)

        d29 = audit["dimensions"]["D29_noblesse_and_olympiad_monument_network"]
        self.assertEqual(d29["score"], 100.0)
        self.assertEqual(d29["verified"], 21)
        self.assertEqual(d29["target"], 21)
        self.assertEqual(d29["olympiad_monuments"], 15)
        self.assertEqual(d29["subclass_sanctums"], 3)
        self.assertEqual(d29["noblesse_shrines"], 3)
        self.assertTrue(d29["ui_wired"])

        d30 = audit["dimensions"]["D30_intercontinental_transit_network"]
        self.assertEqual(d30["score"], 100.0)
        self.assertEqual(d30["verified"], 18)
        self.assertEqual(d30["target"], 18)
        self.assertEqual(d30["maritime_ships"], 6)
        self.assertEqual(d30["brass_airships"], 6)
        self.assertEqual(d30["gatekeeper_trunks"], 6)
        self.assertTrue(d30["ui_wired"])

        olympiad_nodes = atlas["noblesse_olympiad_network"]
        self.assertEqual(len(olympiad_nodes), 21)
        self.assertEqual(sum(1 for n in olympiad_nodes if n["node_category"] == "Olympiad_Monument"), 15)
        self.assertEqual(sum(1 for n in olympiad_nodes if n["node_category"] == "Subclass_Mimir_Sanctum"), 3)
        self.assertEqual(sum(1 for n in olympiad_nodes if n["node_category"] == "Noblesse_Barakiel_Shrine"), 3)
        self.assertEqual(
            {n["node_category"] for n in olympiad_nodes},
            {"Olympiad_Monument", "Subclass_Mimir_Sanctum", "Noblesse_Barakiel_Shrine"},
        )

        transit_lines = atlas["intercontinental_transit_lines"]
        self.assertEqual(len(transit_lines), 18)
        self.assertEqual(sum(1 for t in transit_lines if t["transit_mode"] == "Maritime_Ship"), 6)
        self.assertEqual(sum(1 for t in transit_lines if t["transit_mode"] == "Brass_Airship"), 6)
        self.assertEqual(sum(1 for t in transit_lines if t["transit_mode"] == "Gatekeeper_Trunk"), 6)
        self.assertEqual(
            {t["transit_mode"] for t in transit_lines},
            {"Maritime_Ship", "Brass_Airship", "Gatekeeper_Trunk"},
        )

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas30DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 30)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 30)
        self.assertIn("30-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave14_soul_crystal_resonance_stages_and_fishing_guild_sanctuaries(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["soulCrystalResonanceStagesCount"], 18)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["fishingGuildSanctuariesCount"], 16)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_SOUL_CRYSTAL_MODE",
            "setAtlasSoulCrystalMode(",
            "renderAtlasSoulCrystalBarHtml(",
            "studioSoulCrystalResonanceOverlay",
            "ATLAS_FISHING_MODE",
            "setAtlasFishingMode(",
            "renderAtlasFishingSanctuaryBarHtml(",
            "studioFishingSanctuaryOverlay",
            "32-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 14 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 32)

        d31 = audit["dimensions"]["D31_soul_crystal_resonance_and_boss_absorption"]
        self.assertEqual(d31["score"], 100.0)
        self.assertEqual(d31["verified"], 18)
        self.assertEqual(d31["target"], 18)
        self.assertEqual(d31["crimson_red_stages"], 6)
        self.assertEqual(d31["verdant_green_stages"], 6)
        self.assertEqual(d31["azure_blue_stages"], 6)
        self.assertTrue(d31["ui_wired"])

        d32 = audit["dimensions"]["D32_fishing_guild_and_hot_springs_sanctuaries"]
        self.assertEqual(d32["score"], 100.0)
        self.assertEqual(d32["verified"], 16)
        self.assertEqual(d32["target"], 16)
        self.assertEqual(d32["maritime_piers"], 6)
        self.assertEqual(d32["luminous_lakes"], 5)
        self.assertEqual(d32["thermal_hot_springs"], 5)
        self.assertTrue(d32["ui_wired"])

        soul_crystals = atlas["soul_crystal_resonance_stages"]
        self.assertEqual(len(soul_crystals), 18)
        self.assertEqual(sum(1 for s in soul_crystals if s["crystal_color"] == "Crimson_Red"), 6)
        self.assertEqual(sum(1 for s in soul_crystals if s["crystal_color"] == "Verdant_Green"), 6)
        self.assertEqual(sum(1 for s in soul_crystals if s["crystal_color"] == "Azure_Blue"), 6)
        self.assertEqual(
            {s["crystal_color"] for s in soul_crystals},
            {"Crimson_Red", "Verdant_Green", "Azure_Blue"},
        )
        self.assertEqual(
            {s["stage_band"] for s in soul_crystals},
            {"Stage_1_to_5_C_Grade", "Stage_6_to_10_B_A_Grade", "Stage_11_to_13_S_Grade_Boss"},
        )
        self.assertEqual(
            {s["weapon_grade_unlocked"] for s in soul_crystals},
            {"C-Grade", "B-Grade", "A-Grade", "S-Grade"},
        )

        fishing_sanctuaries = atlas["fishing_guild_sanctuaries"]
        self.assertEqual(len(fishing_sanctuaries), 16)
        self.assertEqual(sum(1 for f in fishing_sanctuaries if f["water_category"] == "Maritime_Harbor_Pier"), 6)
        self.assertEqual(sum(1 for f in fishing_sanctuaries if f["water_category"] == "Luminous_Night_Lake"), 5)
        self.assertEqual(sum(1 for f in fishing_sanctuaries if f["water_category"] == "Thermal_Hot_Spring"), 5)
        self.assertEqual(
            {f["water_category"] for f in fishing_sanctuaries},
            {"Maritime_Harbor_Pier", "Luminous_Night_Lake", "Thermal_Hot_Spring"},
        )
        self.assertEqual(
            {f["active_time_window"] for f in fishing_sanctuaries},
            {"24h All-Day", "00:00–06:00 Nocturnal Luminous", "Thermal Mist Cycle"},
        )

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas32DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 32)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 32)
        self.assertIn("32-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave15_cursed_weapon_pvp_hotspots_and_dimensional_rift_sepulchers(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["cursedWeaponPvpHotspotsCount"], 14)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["dimensionalRiftSepulchersCount"], 16)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_PVP_KARMA_MODE",
            "setAtlasPvpKarmaMode(",
            "renderAtlasPvpKarmaBarHtml(",
            "studioCursedWeaponPvpOverlay",
            "ATLAS_RIFT_SEPULCHER_MODE",
            "setAtlasRiftSepulcherMode(",
            "renderAtlasRiftSepulcherBarHtml(",
            "studioDimensionalRiftOverlay",
            "34-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 15 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 34)

        d33 = audit["dimensions"]["D33_cursed_weapon_karma_and_pvp_arenas"]
        self.assertEqual(d33["score"], 100.0)
        self.assertEqual(d33["verified"], 14)
        self.assertEqual(d33["target"], 14)
        self.assertEqual(d33["cursed_drop_zones"], 5)
        self.assertEqual(d33["black_judge_sanctuaries"], 5)
        self.assertEqual(d33["coliseum_arenas"], 4)
        self.assertTrue(d33["ui_wired"])

        d34 = audit["dimensions"]["D34_dimensional_rift_and_four_sepulchers"]
        self.assertEqual(d34["score"], 100.0)
        self.assertEqual(d34["verified"], 16)
        self.assertEqual(d34["target"], 16)
        self.assertEqual(d34["dimensional_rifts"], 6)
        self.assertEqual(d34["four_sepulchers"], 6)
        self.assertEqual(d34["key_gated_chapels"], 4)
        self.assertTrue(d34["ui_wired"])

        pvp_hotspots = atlas["cursed_weapon_pvp_hotspots"]
        self.assertEqual(len(pvp_hotspots), 14)
        self.assertEqual(sum(1 for h in pvp_hotspots if h["pvp_category"] == "Cursed_Weapon_Drop_Zone"), 5)
        self.assertEqual(sum(1 for h in pvp_hotspots if h["pvp_category"] == "Black_Judge_Karma_Sanctuary"), 5)
        self.assertEqual(sum(1 for h in pvp_hotspots if h["pvp_category"] == "Coliseum_PvP_Arena"), 4)
        self.assertEqual(
            {h["pvp_category"] for h in pvp_hotspots},
            {"Cursed_Weapon_Drop_Zone", "Black_Judge_Karma_Sanctuary", "Coliseum_PvP_Arena"},
        )
        self.assertEqual(
            {h["ruleset_tag"] for h in pvp_hotspots},
            {"World-Broadcast Cursed Drop", "Zero-Guard Lawless Safe-Harbor", "Free-PvP No-EXP-Loss Arena"},
        )

        rift_portals = atlas["dimensional_rift_sepulchers"]
        self.assertEqual(len(rift_portals), 16)
        self.assertEqual(sum(1 for p in rift_portals if p["instance_category"] == "Dimensional_Rift"), 6)
        self.assertEqual(sum(1 for p in rift_portals if p["instance_category"] == "Four_Sepulchers"), 6)
        self.assertEqual(sum(1 for p in rift_portals if p["instance_category"] == "Key_Gated_Chapel"), 4)
        self.assertEqual(
            {p["instance_category"] for p in rift_portals},
            {"Dimensional_Rift", "Four_Sepulchers", "Key_Gated_Chapel"},
        )
        self.assertEqual(len({p["dungeon_id"] for p in rift_portals}), 16)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas34DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 34)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 34)
        self.assertIn("34-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave16_weapon_augmentation_dye_hubs_and_companion_mount_sanctuaries(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["weaponAugmentationDyeHubsCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["companionMountSanctuariesCount"], 12)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_AUGMENT_DYE_MODE",
            "setAtlasAugmentDyeMode(",
            "renderAtlasAugmentDyeBarHtml(",
            "studioWeaponAugmentationDyeOverlay",
            "ATLAS_COMPANION_MOUNT_MODE",
            "setAtlasCompanionMountMode(",
            "renderAtlasCompanionMountBarHtml(",
            "studioCompanionMountOverlay",
            "36-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 16 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 36)

        d35 = audit["dimensions"]["D35_weapon_augmentation_and_symbol_dye_hubs"]
        self.assertEqual(d35["score"], 100.0)
        self.assertEqual(d35["verified"], 15)
        self.assertEqual(d35["target"], 15)
        self.assertEqual(
            set(d35["life_stone_tiers"]),
            {
                "Standard_Life_Stone",
                "Mid_Grade_Life_Stone",
                "High_Grade_Life_Stone",
                "Top_Grade_Life_Stone",
            },
        )
        self.assertTrue(d35["ui_wired"])

        d36 = audit["dimensions"]["D36_companion_pet_strider_and_wyvern_sanctuaries"]
        self.assertEqual(d36["score"], 100.0)
        self.assertEqual(d36["verified"], 12)
        self.assertEqual(d36["target"], 12)
        self.assertEqual(d36["pet_kennels"], 4)
        self.assertEqual(d36["strider_sanctums"], 4)
        self.assertEqual(d36["wyvern_roosts"], 4)
        self.assertTrue(d36["ui_wired"])

        aug_hubs = atlas["weapon_augmentation_dye_hubs"]
        self.assertEqual(len(aug_hubs), 15)
        self.assertEqual(len({h["town_zone_id"] for h in aug_hubs}), 15)
        self.assertEqual(
            {h["life_stone_tier"] for h in aug_hubs},
            {
                "Standard_Life_Stone",
                "Mid_Grade_Life_Stone",
                "High_Grade_Life_Stone",
                "Top_Grade_Life_Stone",
            },
        )
        for h in aug_hubs:
            self.assertGreaterEqual(len(h["signature_augment_skills"]), 2)
            self.assertGreaterEqual(len(h["signature_dye_combos"]), 2)

        comp_nodes = atlas["companion_mount_sanctuaries"]
        self.assertEqual(len(comp_nodes), 12)
        self.assertEqual(sum(1 for n in comp_nodes if n["mount_category"] == "Pet_Manager_Kennel"), 4)
        self.assertEqual(sum(1 for n in comp_nodes if n["mount_category"] == "Hatchling_Strider_Sanctum"), 4)
        self.assertEqual(sum(1 for n in comp_nodes if n["mount_category"] == "Castle_Wyvern_Roost"), 4)
        self.assertEqual(
            {n["mount_category"] for n in comp_nodes},
            {"Pet_Manager_Kennel", "Hatchling_Strider_Sanctum", "Castle_Wyvern_Roost"},
        )

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas36DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 36)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 36)
        self.assertIn("36-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave17_clan_reputation_academies_and_field_herb_elemental_biomes(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["clanReputationAcademiesCount"], 14)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["fieldHerbElementalBiomesCount"], 24)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_CLAN_ACADEMY_MODE",
            "setAtlasClanAcademyMode(",
            "renderAtlasClanAcademyBarHtml(",
            "studioClanAcademyOverlay",
            "ATLAS_HERB_BIOME_MODE",
            "setAtlasHerbBiomeMode(",
            "renderAtlasHerbBiomeBarHtml(",
            "studioHerbElementalBiomeOverlay",
            "38-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 17 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 38)

        d37 = audit["dimensions"]["D37_clan_reputation_and_pledge_academies"]
        self.assertEqual(d37["score"], 100.0)
        self.assertEqual(d37["verified"], 14)
        self.assertEqual(d37["target"], 14)
        self.assertEqual(d37["clan_academies"], 5)
        self.assertEqual(d37["ambition_altars"], 5)
        self.assertEqual(d37["pledge_sanctums"], 4)
        self.assertEqual(
            set(d37["pledge_categories"]),
            {"Clan_Academy_Hall", "Clan_Ambition_Altar", "Pledge_Skill_Sanctum"},
        )
        self.assertTrue(d37["ui_wired"])

        d38 = audit["dimensions"]["D38_field_herb_and_elemental_biomes"]
        self.assertEqual(d38["score"], 100.0)
        self.assertEqual(d38["verified"], 24)
        self.assertEqual(d38["target"], 24)
        self.assertEqual(
            set(d38["dominant_elements"]),
            {"Fire", "Water", "Wind", "Earth", "Holy", "Dark"},
        )
        self.assertEqual(
            set(d38["herb_drop_tiers"]),
            {
                "S_Tier_Zero_Downtime",
                "A_Tier_Mystic_Mana_Rich",
                "B_Tier_Party_Tough_Mobs",
            },
        )
        self.assertTrue(d38["ui_wired"])

        clan_nodes = atlas["clan_reputation_academies"]
        self.assertEqual(len(clan_nodes), 14)
        self.assertEqual(sum(1 for n in clan_nodes if n["pledge_category"] == "Clan_Academy_Hall"), 5)
        self.assertEqual(sum(1 for n in clan_nodes if n["pledge_category"] == "Clan_Ambition_Altar"), 5)
        self.assertEqual(sum(1 for n in clan_nodes if n["pledge_category"] == "Pledge_Skill_Sanctum"), 4)
        for cn in clan_nodes:
            self.assertGreaterEqual(len(cn["unlocked_pledge_benefits"]), 2)

        herb_biomes = atlas["field_herb_elemental_biomes"]
        self.assertEqual(len(herb_biomes), 24)
        self.assertEqual(len({b["field_zone_id"] for b in herb_biomes}), 24)
        self.assertEqual(
            {b["dominant_element"] for b in herb_biomes},
            {"Fire", "Water", "Wind", "Earth", "Holy", "Dark"},
        )
        self.assertEqual(
            {b["herb_drop_tier"] for b in herb_biomes},
            {
                "S_Tier_Zero_Downtime",
                "A_Tier_Mystic_Mana_Rich",
                "B_Tier_Party_Tough_Mobs",
            },
        )
        for hb in herb_biomes:
            self.assertGreaterEqual(len(hb["signature_herbs"]), 2)
            self.assertTrue(15 <= hb["herb_drop_rate_pct"] <= 65)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas38DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 38)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 38)
        self.assertIn("38-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave18_soulshot_workshop_plazas_and_territory_ward_supply_nodes(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["soulshotWorkshopPlazasCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["territoryWardSupplyNodesCount"], 16)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_WORKSHOP_MODE",
            "setAtlasWorkshopMode(",
            "renderAtlasWorkshopPlazaBarHtml(",
            "studioSoulshotWorkshopOverlay",
            "ATLAS_TERRITORY_WARD_MODE",
            "setAtlasTerritoryWardMode(",
            "renderAtlasTerritoryWardBarHtml(",
            "studioTerritoryWardOverlay",
            "40-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 18 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 40)

        d39 = audit["dimensions"]["D39_soulshot_and_dwarven_manufacture_workshops"]
        self.assertEqual(d39["score"], 100.0)
        self.assertEqual(d39["verified"], 15)
        self.assertEqual(d39["target"], 15)
        self.assertEqual(d39["starter_plazas"], 6)
        self.assertEqual(d39["regional_workshops"], 5)
        self.assertEqual(d39["capital_master_forges"], 4)
        self.assertEqual(
            set(d39["workshop_tiers"]),
            {
                "Starter_D_C_Plaza",
                "Regional_B_A_Workshop",
                "Capital_S_Grade_Master_Forge",
            },
        )
        self.assertTrue(d39["ui_wired"])

        d40 = audit["dimensions"]["D40_territory_ward_and_fortress_codex_supply"]
        self.assertEqual(d40["score"], 100.0)
        self.assertEqual(d40["verified"], 16)
        self.assertEqual(d40["target"], 16)
        self.assertEqual(d40["sovereign_territory_wards"], 8)
        self.assertEqual(d40["fortress_codex_vaults"], 8)
        self.assertEqual(d40["strongholds_covered"], 8)
        self.assertEqual(
            set(d40["node_roles"]),
            {"Sovereign_Territory_Ward", "Fortress_Codex_Supply_Vault"},
        )
        self.assertTrue(d40["ui_wired"])

        workshops = atlas["soulshot_workshop_plazas"]
        self.assertEqual(len(workshops), 15)
        self.assertEqual(len({w["town_zone_id"] for w in workshops}), 15)
        self.assertEqual(sum(1 for w in workshops if w["workshop_tier"] == "Starter_D_C_Plaza"), 6)
        self.assertEqual(sum(1 for w in workshops if w["workshop_tier"] == "Regional_B_A_Workshop"), 5)
        self.assertEqual(sum(1 for w in workshops if w["workshop_tier"] == "Capital_S_Grade_Master_Forge"), 4)
        for wp in workshops:
            self.assertGreaterEqual(len(wp["shot_compression_grades"]), 2)
            self.assertGreater(wp["average_manufacture_fee_adena"], 0)

        ward_nodes = atlas["territory_ward_supply_nodes"]
        self.assertEqual(len(ward_nodes), 16)
        self.assertEqual(sum(1 for n in ward_nodes if n["node_role"] == "Sovereign_Territory_Ward"), 8)
        self.assertEqual(sum(1 for n in ward_nodes if n["node_role"] == "Fortress_Codex_Supply_Vault"), 8)
        self.assertEqual(len({n["stronghold_zone_id"] for n in ward_nodes}), 8)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas40DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 40)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 40)
        self.assertIn("40-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave19_epic_jewelry_sanctums_and_adventurer_vitality_obelisks(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["epicJewelrySanctumsCount"], 12)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["adventurerVitalityObelisksCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_EPIC_JEWELRY_MODE",
            "setAtlasEpicJewelryMode(",
            "renderAtlasEpicJewelryBarHtml(",
            "studioEpicJewelryOverlay",
            "ATLAS_VITALITY_OBELISK_MODE",
            "setAtlasVitalityObeliskMode(",
            "renderAtlasVitalityObeliskBarHtml(",
            "studioVitalityObeliskOverlay",
            "42-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 19 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 42)

        d41 = audit["dimensions"]["D41_epic_boss_jewelry_and_status_resist_sanctums"]
        self.assertEqual(d41["score"], 100.0)
        self.assertEqual(d41["verified"], 12)
        self.assertEqual(d41["target"], 12)
        self.assertEqual(d41["epic_rings"], 4)
        self.assertEqual(d41["epic_earrings"], 4)
        self.assertEqual(d41["epic_necklaces"], 4)
        self.assertEqual(
            set(d41["slot_categories"]),
            {"Epic_Ring", "Epic_Earring", "Epic_Necklace"},
        )
        self.assertEqual(set(d41["grades"]), {"B-Grade", "A-Grade", "S-Grade"})
        self.assertTrue(d41["ui_wired"])

        d42 = audit["dimensions"]["D42_adventurer_guide_buff_and_vitality_obelisks"]
        self.assertEqual(d42["score"], 100.0)
        self.assertEqual(d42["verified"], 15)
        self.assertEqual(d42["target"], 15)
        self.assertEqual(d42["starter_coupon_hubs"], 6)
        self.assertEqual(d42["regional_shadow_hubs"], 5)
        self.assertEqual(d42["capital_vitality_sanctuaries"], 4)
        self.assertEqual(
            set(d42["obelisk_tiers"]),
            {
                "Starter_Apprentice_Coupon_Hub",
                "Regional_Shadow_Weapon_Hub",
                "Capital_Stage4_Vitality_Sanctuary",
            },
        )
        self.assertTrue(d42["ui_wired"])

        relics = atlas["epic_jewelry_sanctums"]
        self.assertEqual(len(relics), 12)
        self.assertEqual(sum(1 for r in relics if r["slot_category"] == "Epic_Ring"), 4)
        self.assertEqual(sum(1 for r in relics if r["slot_category"] == "Epic_Earring"), 4)
        self.assertEqual(sum(1 for r in relics if r["slot_category"] == "Epic_Necklace"), 4)
        for r in relics:
            self.assertGreaterEqual(len(r["status_resist_bonuses"]), 2)
            self.assertGreaterEqual(len(r["combat_stat_bonuses"]), 2)

        obelisks = atlas["adventurer_vitality_obelisks"]
        self.assertEqual(len(obelisks), 15)
        self.assertEqual(len({o["town_zone_id"] for o in obelisks}), 15)
        self.assertEqual(sum(1 for o in obelisks if o["obelisk_tier"] == "Starter_Apprentice_Coupon_Hub"), 6)
        self.assertEqual(sum(1 for o in obelisks if o["obelisk_tier"] == "Regional_Shadow_Weapon_Hub"), 5)
        self.assertEqual(sum(1 for o in obelisks if o["obelisk_tier"] == "Capital_Stage4_Vitality_Sanctuary"), 4)
        for o in obelisks:
            self.assertGreaterEqual(len(o["granted_buff_suite"]), 3)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas42DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 42)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 42)
        self.assertIn("42-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave20_armor_set_masterwork_forges_and_kamaloka_pailaka_instances(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["armorSetMasterworkForgesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["kamalokaPailakaInstancesCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_ARMOR_SET_MODE",
            "setAtlasArmorSetMode(",
            "renderAtlasArmorSetBarHtml(",
            "studioArmorSetMasterworkOverlay",
            "ATLAS_KAMALOKA_MODE",
            "setAtlasKamalokaMode(",
            "renderAtlasKamalokaBarHtml(",
            "studioKamalokaPailakaOverlay",
            "44-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 20 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 44)

        d43 = audit["dimensions"]["D43_armor_set_progression_and_masterwork_forges"]
        self.assertEqual(d43["score"], 100.0)
        self.assertEqual(d43["verified"], 16)
        self.assertEqual(d43["target"], 16)
        self.assertEqual(d43["heavy_vanguard_sets"], 6)
        self.assertEqual(d43["light_skirmisher_sets"], 5)
        self.assertEqual(d43["mystic_robe_sets"], 5)
        self.assertEqual(
            set(d43["armor_weight_classes"]),
            {"Heavy_Vanguard_Set", "Light_Skirmisher_Set", "Mystic_Robe_Set"},
        )
        self.assertEqual(
            set(d43["grades"]),
            {"C-Grade", "B-Grade", "A-Grade", "S-Grade", "S80-Dynasty"},
        )
        self.assertTrue(d43["ui_wired"])

        d44 = audit["dimensions"]["D44_kamaloka_pailaka_and_seed_instances"]
        self.assertEqual(d44["score"], 100.0)
        self.assertEqual(d44["verified"], 15)
        self.assertEqual(d44["target"], 15)
        self.assertEqual(d44["kamaloka_abyss_halls"], 6)
        self.assertEqual(d44["pailaka_vitality_trials"], 5)
        self.assertEqual(d44["seed_delusion_conduits"], 4)
        self.assertEqual(
            set(d44["conduit_categories"]),
            {
                "Kamaloka_Abyss_Hall",
                "Pailaka_Vitality_Trial",
                "Seed_Delusion_Conduit",
            },
        )
        self.assertTrue(d44["ui_wired"])

        armor_sets = atlas["armor_set_masterwork_forges"]
        self.assertEqual(len(armor_sets), 16)
        self.assertEqual(sum(1 for s in armor_sets if s["armor_weight_class"] == "Heavy_Vanguard_Set"), 6)
        self.assertEqual(sum(1 for s in armor_sets if s["armor_weight_class"] == "Light_Skirmisher_Set"), 5)
        self.assertEqual(sum(1 for s in armor_sets if s["armor_weight_class"] == "Mystic_Robe_Set"), 5)
        for s in armor_sets:
            self.assertTrue(s["set_bonus_summary"])
            self.assertTrue(s["masterwork_foundation_bonus"])

        instances = atlas["kamaloka_pailaka_instances"]
        self.assertEqual(len(instances), 15)
        self.assertEqual(sum(1 for i in instances if i["conduit_category"] == "Kamaloka_Abyss_Hall"), 6)
        self.assertEqual(sum(1 for i in instances if i["conduit_category"] == "Pailaka_Vitality_Trial"), 5)
        self.assertEqual(sum(1 for i in instances if i["conduit_category"] == "Seed_Delusion_Conduit"), 4)
        for i in instances:
            self.assertTrue(i["completion_reward"])

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas44DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 44)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 44)
        self.assertIn("44-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave21_forgotten_scroll_skill_sanctums_and_elemental_stone_caravan_quarries(self) -> None:
        import run_atlas_iteration_loop as loop

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["forgottenScrollSkillSanctumsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["elementalStoneCaravanQuarriesCount"], 14)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_SKILL_SCROLL_MODE",
            "setAtlasSkillScrollMode(",
            "renderAtlasSkillScrollBarHtml(",
            "studioForgottenScrollOverlay",
            "ATLAS_ELEMENTAL_QUARRY_MODE",
            "setAtlasElementalQuarryMode(",
            "renderAtlasElementalQuarryBarHtml(",
            "studioElementalQuarryOverlay",
            "46-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 21 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 46)

        d45 = audit["dimensions"]["D45_forgotten_scroll_and_skill_mastery_sanctums"]
        self.assertEqual(d45["score"], 100.0)
        self.assertEqual(d45["verified"], 16)
        self.assertEqual(d45["target"], 16)
        self.assertEqual(d45["martial_will_scrolls"], 6)
        self.assertEqual(d45["arcane_enlightenment_scrolls"], 5)
        self.assertEqual(d45["ancient_tome_codex_sanctums"], 5)
        self.assertEqual(
            set(d45["mastery_categories"]),
            {
                "Martial_Will_Scroll",
                "Arcane_Enlightenment_Scroll",
                "Ancient_Tome_Codex_Sanctum",
            },
        )
        self.assertTrue(d45["ui_wired"])

        d46 = audit["dimensions"]["D46_elemental_stone_crystal_and_caravan_quarries"]
        self.assertEqual(d46["score"], 100.0)
        self.assertEqual(d46["verified"], 14)
        self.assertEqual(d46["target"], 14)
        self.assertEqual(d46["elemental_stone_quarries_150"], 6)
        self.assertEqual(d46["elemental_crystal_sanctums_300"], 6)
        self.assertEqual(d46["caravan_trust_oases"], 2)
        self.assertEqual(
            set(d46["quarry_categories"]),
            {
                "Elemental_Stone_Quarry_150",
                "Elemental_Crystal_Sanctum_300",
                "Caravan_Trust_Oasis",
            },
        )
        self.assertEqual(
            set(d46["element_types"]),
            {"Fire", "Water", "Wind", "Earth", "Holy", "Dark", "Omni_Caravan"},
        )
        self.assertTrue(d46["ui_wired"])

        sanctums = atlas["forgotten_scroll_skill_sanctums"]
        self.assertEqual(len(sanctums), 16)
        self.assertEqual(sum(1 for s in sanctums if s["mastery_category"] == "Martial_Will_Scroll"), 6)
        self.assertEqual(sum(1 for s in sanctums if s["mastery_category"] == "Arcane_Enlightenment_Scroll"), 5)
        self.assertEqual(sum(1 for s in sanctums if s["mastery_category"] == "Ancient_Tome_Codex_Sanctum"), 5)
        for s in sanctums:
            self.assertGreaterEqual(len(s["unlocked_skills"]), 2)

        quarries = atlas["elemental_stone_caravan_quarries"]
        self.assertEqual(len(quarries), 14)
        self.assertEqual(sum(1 for q in quarries if q["quarry_category"] == "Elemental_Stone_Quarry_150"), 6)
        self.assertEqual(sum(1 for q in quarries if q["quarry_category"] == "Elemental_Crystal_Sanctum_300"), 6)
        self.assertEqual(sum(1 for q in quarries if q["quarry_category"] == "Caravan_Trust_Oasis"), 2)
        for q in quarries:
            self.assertTrue(q["combat_multiplier_effect"])

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas46DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 46)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 46)
        self.assertIn("46-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave22_clan_hall_auction_estates_and_transformation_talisman_sanctums(self) -> None:
        """Wave 22 (D47–D48): 16 Clan Hall Auction/Siege Estates & 15 Transformation/Talisman/Agathion Sanctums."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["clanHallAuctionEstatesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["transformationTalismanSanctumsCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_CLAN_HALL_MODE",
            "setAtlasClanHallMode(",
            "renderAtlasClanHallBarHtml(",
            "studioClanHallAuctionOverlay",
            "ATLAS_TRANSFORMATION_MODE",
            "setAtlasTransformationMode(",
            "renderAtlasTransformationBarHtml(",
            "studioTransformationTalismanOverlay",
            "48-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 22 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 48)

        d47 = audit["dimensions"]["D47_clan_hall_auction_and_siege_estates"]
        self.assertEqual(d47["score"], 100.0)
        self.assertEqual(d47["verified"], 16)
        self.assertEqual(d47["target"], 16)
        self.assertEqual(d47["town_luxury_auction_halls"], 10)
        self.assertEqual(d47["contested_siege_chateaus"], 6)
        self.assertEqual(
            set(d47["acquisition_modes"]),
            {
                "Town_Luxury_Auction_Hall",
                "Contested_Siege_Chateau",
            },
        )
        self.assertEqual(
            set(d47["estate_grades"]),
            {
                "B_Grade_Provincial",
                "A_Grade_Metropolitan",
                "S_Grade_Sovereign_Chateau",
            },
        )
        self.assertTrue(d47["ui_wired"])

        d48 = audit["dimensions"]["D48_transformation_sealbook_and_talisman_sanctums"]
        self.assertEqual(d48["score"], 100.0)
        self.assertEqual(d48["verified"], 15)
        self.assertEqual(d48["target"], 15)
        self.assertEqual(d48["avant_garde_transformation_sanctums"], 6)
        self.assertEqual(d48["epaulette_talisman_vaults"], 5)
        self.assertEqual(d48["agathion_bracelet_altars"], 4)
        self.assertEqual(
            set(d48["relic_categories"]),
            {
                "Avant_Garde_Transformation_Sanctum",
                "Epaulette_Talisman_Vault",
                "Agathion_Bracelet_Altar",
            },
        )
        self.assertTrue(d48["ui_wired"])

        estates = atlas["clan_hall_auction_estates"]
        self.assertEqual(len(estates), 16)
        self.assertEqual(sum(1 for e in estates if e["acquisition_mode"] == "Town_Luxury_Auction_Hall"), 10)
        self.assertEqual(sum(1 for e in estates if e["acquisition_mode"] == "Contested_Siege_Chateau"), 6)
        for e in estates:
            self.assertGreaterEqual(len(e["exclusive_item_production"]), 2)

        sanctums = atlas["transformation_talisman_sanctums"]
        self.assertEqual(len(sanctums), 15)
        self.assertEqual(sum(1 for s in sanctums if s["relic_category"] == "Avant_Garde_Transformation_Sanctum"), 6)
        self.assertEqual(sum(1 for s in sanctums if s["relic_category"] == "Epaulette_Talisman_Vault"), 5)
        self.assertEqual(sum(1 for s in sanctums if s["relic_category"] == "Agathion_Bracelet_Altar"), 4)
        for s in sanctums:
            self.assertGreaterEqual(len(s["featured_transformations_or_talismans"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas48DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 48)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 48)
        self.assertIn("48-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave23_warehouse_freight_vaults_and_atlas_master_telemetry_checkpoints(self) -> None:
        """Wave 23 (D49–D50, 50-Dimension Milestone): 15 Town Warehouse/Freight Vaults & 18 Master Cartographic Tour Checkpoints."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["warehouseFreightVaultsCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["atlasMasterTelemetryCheckpointsCount"], 18)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_WAREHOUSE_MODE",
            "setAtlasWarehouseMode(",
            "renderAtlasWarehouseBarHtml(",
            "studioWarehouseFreightOverlay",
            "ATLAS_MASTER_TOUR_MODE",
            "setAtlasMasterTourMode(",
            "renderAtlasMasterTourBarHtml(",
            "studioMasterTourOverlay",
            "50-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 23 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 50)

        d49 = audit["dimensions"]["D49_warehouse_clan_vault_and_freight_network"]
        self.assertEqual(d49["score"], 100.0)
        self.assertEqual(d49["verified"], 15)
        self.assertEqual(d49["target"], 15)
        self.assertEqual(d49["starter_iron_gate_vaults"], 6)
        self.assertEqual(d49["regional_freight_depots"], 5)
        self.assertEqual(d49["capital_dimensional_brokers"], 4)
        self.assertEqual(
            set(d49["logistics_tiers"]),
            {
                "Starter_Iron_Gate_Vault",
                "Regional_Freight_Depot",
                "Capital_Dimensional_Broker",
            },
        )
        self.assertTrue(d49["ui_wired"])

        d50 = audit["dimensions"]["D50_master_cartographic_tour_and_50d_inspector"]
        self.assertEqual(d50["score"], 100.0)
        self.assertEqual(d50["verified"], 18)
        self.assertEqual(d50["target"], 18)
        self.assertEqual(d50["race_origin_checkpoints"], 6)
        self.assertEqual(d50["town_blueprint_checkpoints"], 6)
        self.assertEqual(d50["dungeon_sanctum_checkpoints"], 6)
        self.assertEqual(
            set(d50["tour_categories"]),
            {
                "Race_Origin_To_Awakening",
                "Town_Blueprint_And_Economy",
                "Multi_Floor_Dungeon_Sanctum",
            },
        )
        self.assertTrue(d50["ui_wired"])

        vaults = atlas["warehouse_freight_vaults"]
        self.assertEqual(len(vaults), 15)
        self.assertEqual(sum(1 for v in vaults if v["logistics_tier"] == "Starter_Iron_Gate_Vault"), 6)
        self.assertEqual(sum(1 for v in vaults if v["logistics_tier"] == "Regional_Freight_Depot"), 5)
        self.assertEqual(sum(1 for v in vaults if v["logistics_tier"] == "Capital_Dimensional_Broker"), 4)
        for v in vaults:
            self.assertGreaterEqual(len(v["dimensional_broker_services"]), 2)

        checkpoints = atlas["atlas_master_telemetry_checkpoints"]
        self.assertEqual(len(checkpoints), 18)
        self.assertEqual(sum(1 for cp in checkpoints if cp["tour_category"] == "Race_Origin_To_Awakening"), 6)
        self.assertEqual(sum(1 for cp in checkpoints if cp["tour_category"] == "Town_Blueprint_And_Economy"), 6)
        self.assertEqual(sum(1 for cp in checkpoints if cp["tour_category"] == "Multi_Floor_Dungeon_Sanctum"), 6)
        for cp in checkpoints:
            self.assertGreaterEqual(len(cp["verified_dimensions_covered"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas50DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 50)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 50)
        self.assertIn("50-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave24_festival_of_darkness_oracles_and_luxury_black_market_boutiques(self) -> None:
        """Wave 24 (D51–D52): 15 Town Festival of Darkness Oracles & 12 Luxury Boutique / Black Marketeer Nodes."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["festivalOfDarknessOraclesCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["luxuryBlackMarketBoutiquesCount"], 12)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_FESTIVAL_ORACLE_MODE",
            "setAtlasFestivalOracleMode(",
            "renderAtlasFestivalOracleBarHtml(",
            "studioFestivalOracleOverlay",
            "ATLAS_LUXURY_MARKET_MODE",
            "setAtlasLuxuryMarketMode(",
            "renderAtlasLuxuryMarketBarHtml(",
            "studioLuxuryBlackMarketOverlay",
            "52-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 24 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 52)

        d51 = audit["dimensions"]["D51_festival_of_darkness_and_oracle_altars"]
        self.assertEqual(d51["score"], 100.0)
        self.assertEqual(d51["verified"], 15)
        self.assertEqual(d51["target"], 15)
        self.assertEqual(d51["oracle_of_dawn_sanctuaries"], 5)
        self.assertEqual(d51["oracle_of_dusk_sanctuaries"], 5)
        self.assertEqual(d51["high_bracket_blood_altars"], 5)
        self.assertEqual(
            set(d51["oracle_categories"]),
            {
                "Oracle_of_Dawn_Sanctuary",
                "Oracle_of_Dusk_Sanctuary",
                "High_Bracket_Blood_Offering_Altar",
            },
        )
        self.assertTrue(d51["ui_wired"])

        d52 = audit["dimensions"]["D52_luxury_boutique_and_black_marketeer_exchange"]
        self.assertEqual(d52["score"], 100.0)
        self.assertEqual(d52["verified"], 12)
        self.assertEqual(d52["target"], 12)
        self.assertEqual(d52["crystal_luxury_armories"], 4)
        self.assertEqual(d52["black_marketeers_of_mammon"], 4)
        self.assertEqual(d52["couture_emporiums"], 4)
        self.assertEqual(
            set(d52["market_categories"]),
            {
                "Crystal_Luxury_Armory",
                "Black_Marketeer_of_Mammon",
                "Couture_Emporium",
            },
        )
        self.assertTrue(d52["ui_wired"])

        oracles = atlas["festival_of_darkness_oracles"]
        self.assertEqual(len(oracles), 15)
        self.assertEqual(sum(1 for o in oracles if o["oracle_category"] == "Oracle_of_Dawn_Sanctuary"), 5)
        self.assertEqual(sum(1 for o in oracles if o["oracle_category"] == "Oracle_of_Dusk_Sanctuary"), 5)
        self.assertEqual(sum(1 for o in oracles if o["oracle_category"] == "High_Bracket_Blood_Offering_Altar"), 5)
        for o in oracles:
            self.assertGreaterEqual(o["blood_offering_target_score"], 1250)

        boutiques = atlas["luxury_black_market_boutiques"]
        self.assertEqual(len(boutiques), 12)
        self.assertEqual(sum(1 for b in boutiques if b["market_category"] == "Crystal_Luxury_Armory"), 4)
        self.assertEqual(sum(1 for b in boutiques if b["market_category"] == "Black_Marketeer_of_Mammon"), 4)
        self.assertEqual(sum(1 for b in boutiques if b["market_category"] == "Couture_Emporium"), 4)
        for b in boutiques:
            self.assertGreaterEqual(len(b["signature_catalog_items"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas52DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 52)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 52)
        self.assertIn("52-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave25_faction_alliance_war_camps_and_monster_track_fantasy_plazas(self) -> None:
        """Wave 25 (D53–D54): 14 Factional Alliance War & Totem Raid Camps & 12 Monster Derby / Coin of Magic / Kratei's Cube Plazas."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["factionAllianceWarCampsCount"], 14)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["monsterTrackFantasyPlazasCount"], 12)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_FACTION_ALLIANCE_MODE",
            "setAtlasFactionAllianceMode(",
            "renderAtlasFactionAllianceBarHtml(",
            "studioFactionAllianceOverlay",
            "ATLAS_FANTASY_PLAZA_MODE",
            "setAtlasFantasyPlazaMode(",
            "renderAtlasFantasyPlazaBarHtml(",
            "studioFantasyPlazaOverlay",
            "54-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 25 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 54)

        d53 = audit["dimensions"]["D53_faction_alliance_war_and_totem_altars"]
        self.assertEqual(d53["score"], 100.0)
        self.assertEqual(d53["verified"], 14)
        self.assertEqual(d53["target"], 14)
        self.assertEqual(d53["vanguard_orc_outposts"], 5)
        self.assertEqual(d53["shaman_silenos_strongholds"], 5)
        self.assertEqual(d53["totem_raid_altars"], 4)
        self.assertEqual(
            set(d53["faction_categories"]),
            {
                "Vanguard_Orc_Alliance_Outpost",
                "Shaman_Silenos_Alliance_Stronghold",
                "Totem_Spirit_Raid_Altar",
            },
        )
        self.assertTrue(d53["ui_wired"])

        d54 = audit["dimensions"]["D54_monster_derby_coin_and_kratei_plazas"]
        self.assertEqual(d54["score"], 100.0)
        self.assertEqual(d54["verified"], 12)
        self.assertEqual(d54["target"], 12)
        self.assertEqual(d54["monster_derby_tracks"], 4)
        self.assertEqual(d54["coin_of_magic_lodges"], 4)
        self.assertEqual(d54["kratei_cube_arenas"], 4)
        self.assertEqual(
            set(d54["activity_categories"]),
            {
                "Monster_Derby_Race_Track",
                "Coin_of_Magic_Collector_Lodge",
                "Kratei_Cube_Fantasy_Arena",
            },
        )
        self.assertTrue(d54["ui_wired"])

        camps = atlas["faction_alliance_war_camps"]
        self.assertEqual(len(camps), 14)
        self.assertEqual(sum(1 for c in camps if c["faction_category"] == "Vanguard_Orc_Alliance_Outpost"), 5)
        self.assertEqual(sum(1 for c in camps if c["faction_category"] == "Shaman_Silenos_Alliance_Stronghold"), 5)
        self.assertEqual(sum(1 for c in camps if c["faction_category"] == "Totem_Spirit_Raid_Altar"), 4)
        for c in camps:
            self.assertTrue(c["betrayal_penalty_rule"])

        plazas = atlas["monster_track_fantasy_plazas"]
        self.assertEqual(len(plazas), 12)
        self.assertEqual(sum(1 for p in plazas if p["activity_category"] == "Monster_Derby_Race_Track"), 4)
        self.assertEqual(sum(1 for p in plazas if p["activity_category"] == "Coin_of_Magic_Collector_Lodge"), 4)
        self.assertEqual(sum(1 for p in plazas if p["activity_category"] == "Kratei_Cube_Fantasy_Arena"), 4)
        for p in plazas:
            self.assertGreaterEqual(len(p["featured_rewards"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas54DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 54)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 54)
        self.assertIn("54-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave26_olympiad_hero_weapon_exchanges_and_treasure_chest_lockpick_grounds(self) -> None:
        """Wave 26 (D55–D56): 15 Town Hero Weapon & Olympiad Token Exchanges & 16 Treasure Chest Lockpick & Mimic Cache Grounds."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["olympiadHeroWeaponExchangesCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["treasureChestLockpickGroundsCount"], 16)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_HERO_WEAPON_MODE",
            "setAtlasHeroWeaponMode(",
            "renderAtlasHeroWeaponBarHtml(",
            "studioHeroWeaponExchangeOverlay",
            "ATLAS_TREASURE_CHEST_MODE",
            "setAtlasTreasureChestMode(",
            "renderAtlasTreasureChestBarHtml(",
            "studioTreasureChestOverlay",
            "56-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 26 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 56)

        d55 = audit["dimensions"]["D55_olympiad_hero_weapon_and_token_exchanges"]
        self.assertEqual(d55["score"], 100.0)
        self.assertEqual(d55["verified"], 15)
        self.assertEqual(d55["target"], 15)
        self.assertEqual(d55["martial_infinity_armories"], 5)
        self.assertEqual(d55["arcane_infinity_sanctums"], 5)
        self.assertEqual(d55["olympiad_token_codex_exchanges"], 5)
        self.assertEqual(
            set(d55["exchange_categories"]),
            {
                "Martial_Infinity_Armory",
                "Arcane_Infinity_Sanctum",
                "Olympiad_Token_Codex_Exchange",
            },
        )
        self.assertTrue(d55["ui_wired"])

        d56 = audit["dimensions"]["D56_treasure_chest_lockpick_and_mimic_grounds"]
        self.assertEqual(d56["score"], 100.0)
        self.assertEqual(d56["verified"], 16)
        self.assertEqual(d56["target"], 16)
        self.assertEqual(d56["overland_pirate_bandit_caches"], 6)
        self.assertEqual(d56["underground_catacomb_vaults"], 5)
        self.assertEqual(d56["tower_sanctum_coffer_rooms"], 5)
        self.assertEqual(
            set(d56["cache_environments"]),
            {
                "Overland_Pirate_Bandit_Cache",
                "Underground_Catacomb_Vault",
                "Tower_Sanctum_Coffer_Room",
            },
        )
        self.assertTrue(d56["ui_wired"])

        exchanges = atlas["olympiad_hero_weapon_exchanges"]
        self.assertEqual(len(exchanges), 15)
        self.assertEqual(sum(1 for e in exchanges if e["exchange_category"] == "Martial_Infinity_Armory"), 5)
        self.assertEqual(sum(1 for e in exchanges if e["exchange_category"] == "Arcane_Infinity_Sanctum"), 5)
        self.assertEqual(sum(1 for e in exchanges if e["exchange_category"] == "Olympiad_Token_Codex_Exchange"), 5)
        for e in exchanges:
            self.assertGreaterEqual(len(e["featured_infinity_weapons"]), 2)
            self.assertGreaterEqual(len(e["heroic_skills_unlocked"]), 2)

        caches = atlas["treasure_chest_lockpick_grounds"]
        self.assertEqual(len(caches), 16)
        self.assertEqual(sum(1 for c in caches if c["cache_environment"] == "Overland_Pirate_Bandit_Cache"), 6)
        self.assertEqual(sum(1 for c in caches if c["cache_environment"] == "Underground_Catacomb_Vault"), 5)
        self.assertEqual(sum(1 for c in caches if c["cache_environment"] == "Tower_Sanctum_Coffer_Room"), 5)
        for c in caches:
            self.assertGreaterEqual(len(c["jackpot_enchant_drops"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas56DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 56)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 56)
        self.assertIn("56-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave27_aerial_star_stone_docks_and_belt_cloak_weaver_hubs(self) -> None:
        """Wave 27 (D57–D58): 12 Clan Airship Summon Dock, Star Stone Extraction & Aerial Raid Nodes & 14 Weaver Olf Mithril Belt & Sovereign Boss/Castle Cloak Hubs."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["aerialStarStoneDocksCount"], 12)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["beltCloakWeaverHubsCount"], 14)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_AERIAL_DOCK_MODE",
            "setAtlasAerialDockMode(",
            "renderAtlasAerialDockBarHtml(",
            "studioAerialStarStoneOverlay",
            "ATLAS_BELT_CLOAK_MODE",
            "setAtlasBeltCloakMode(",
            "renderAtlasBeltCloakBarHtml(",
            "studioBeltCloakWeaverOverlay",
            "58-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 27 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 58)

        d57 = audit["dimensions"]["D57_aerial_airship_docks_and_star_stone_raids"]
        self.assertEqual(d57["score"], 100.0)
        self.assertEqual(d57["verified"], 12)
        self.assertEqual(d57["target"], 12)
        self.assertEqual(d57["clan_airship_summon_docks"], 4)
        self.assertEqual(d57["star_stone_extraction_fields"], 4)
        self.assertEqual(d57["aerial_raid_corridors"], 4)
        self.assertEqual(
            set(d57["aerial_categories"]),
            {
                "Clan_Airship_Summon_Dock",
                "Star_Stone_Extraction_Field",
                "Aerial_Raid_Corridor",
            },
        )
        self.assertTrue(d57["ui_wired"])

        d58 = audit["dimensions"]["D58_weaver_olf_belts_and_sovereign_cloaks"]
        self.assertEqual(d58["score"], 100.0)
        self.assertEqual(d58["verified"], 14)
        self.assertEqual(d58["target"], 14)
        self.assertEqual(d58["weaver_olf_belt_looms"], 5)
        self.assertEqual(d58["sovereign_boss_cloak_sanctums"], 5)
        self.assertEqual(d58["castle_knight_cloak_armories"], 4)
        self.assertEqual(
            set(d58["garment_categories"]),
            {
                "Weaver_Olf_Belt_Loom",
                "Sovereign_Boss_Cloak_Sanctum",
                "Castle_Knight_Cloak_Armory",
            },
        )
        self.assertTrue(d58["ui_wired"])

        docks = atlas["aerial_star_stone_docks"]
        self.assertEqual(len(docks), 12)
        self.assertEqual(sum(1 for d in docks if d["aerial_category"] == "Clan_Airship_Summon_Dock"), 4)
        self.assertEqual(sum(1 for d in docks if d["aerial_category"] == "Star_Stone_Extraction_Field"), 4)
        self.assertEqual(sum(1 for d in docks if d["aerial_category"] == "Aerial_Raid_Corridor"), 4)
        for d in docks:
            self.assertGreaterEqual(len(d["aerial_rewards"]), 2)

        hubs = atlas["belt_cloak_weaver_hubs"]
        self.assertEqual(len(hubs), 14)
        self.assertEqual(sum(1 for h in hubs if h["garment_category"] == "Weaver_Olf_Belt_Loom"), 5)
        self.assertEqual(sum(1 for h in hubs if h["garment_category"] == "Sovereign_Boss_Cloak_Sanctum"), 5)
        self.assertEqual(sum(1 for h in hubs if h["garment_category"] == "Castle_Knight_Cloak_Armory"), 4)
        for h in hubs:
            self.assertGreaterEqual(len(h["featured_belts_or_cloaks"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas58DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 58)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 58)
        self.assertIn("58-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave28_wedding_ceremony_cathedrals_and_studio_council_audit_benchmarks(self) -> None:
        """Wave 28 (D59–D60, 60-Dimension Milestone): 12 Wedding Cathedrals, Formal Wear & Couple Teleport Sanctuaries & 18 6-Role Studio Council 60D Audit Benchmarks."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["weddingCeremonyCathedralsCount"], 12)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["studioCouncilAuditBenchmarksCount"], 18)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_WEDDING_MODE",
            "setAtlasWeddingMode(",
            "renderAtlasWeddingBarHtml(",
            "studioWeddingCathedralOverlay",
            "ATLAS_COUNCIL_BENCHMARK_MODE",
            "setAtlasCouncilBenchmarkMode(",
            "renderAtlasCouncilBenchmarkBarHtml(",
            "studioCouncilBenchmarkOverlay",
            "60-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 28 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 60)

        d59 = audit["dimensions"]["D59_wedding_cathedrals_and_couple_teleport_matrix"]
        self.assertEqual(d59["score"], 100.0)
        self.assertEqual(d59["verified"], 12)
        self.assertEqual(d59["target"], 12)
        self.assertEqual(d59["grand_wedding_cathedrals"], 4)
        self.assertEqual(d59["formal_wear_couture_tailors"], 4)
        self.assertEqual(d59["bridal_procession_gardens"], 4)
        self.assertEqual(
            set(d59["ceremony_categories"]),
            {
                "Grand_Wedding_Cathedral",
                "Formal_Wear_Couture_Tailor",
                "Bridal_Procession_Garden",
            },
        )
        self.assertTrue(d59["ui_wired"])

        d60 = audit["dimensions"]["D60_studio_council_60d_audit_benchmarks"]
        self.assertEqual(d60["score"], 100.0)
        self.assertEqual(d60["verified"], 18)
        self.assertEqual(d60["target"], 18)
        self.assertEqual(d60["product_owner_benchmarks"], 3)
        self.assertEqual(d60["game_designer_lead_benchmarks"], 3)
        self.assertEqual(d60["player_growth_path_benchmarks"], 3)
        self.assertEqual(d60["game_story_designer_benchmarks"], 3)
        self.assertEqual(d60["monster_and_mob_designer_benchmarks"], 3)
        self.assertEqual(d60["lead_systems_map_architect_benchmarks"], 3)
        self.assertEqual(
            set(d60["council_roles"]),
            {
                "Product_Owner",
                "Game_Designer_Lead",
                "Player_Growth_Path_Designer",
                "Game_Story_Designer",
                "Monster_And_Mob_Designer",
                "Lead_Systems_Map_Architect",
            },
        )
        self.assertTrue(d60["ui_wired"])

        cathedrals = atlas["wedding_ceremony_cathedrals"]
        self.assertEqual(len(cathedrals), 12)
        self.assertEqual(sum(1 for c in cathedrals if c["ceremony_category"] == "Grand_Wedding_Cathedral"), 4)
        self.assertEqual(sum(1 for c in cathedrals if c["ceremony_category"] == "Formal_Wear_Couture_Tailor"), 4)
        self.assertEqual(sum(1 for c in cathedrals if c["ceremony_category"] == "Bridal_Procession_Garden"), 4)
        for c in cathedrals:
            self.assertGreaterEqual(len(c["couple_privileges_unlocked"]), 2)

        benchmarks = atlas["studio_council_audit_benchmarks"]
        self.assertEqual(len(benchmarks), 18)
        for role in (
            "Product_Owner",
            "Game_Designer_Lead",
            "Player_Growth_Path_Designer",
            "Game_Story_Designer",
            "Monster_And_Mob_Designer",
            "Lead_Systems_Map_Architect",
        ):
            self.assertEqual(sum(1 for b in benchmarks if b["council_role"] == role), 3)
        for b in benchmarks:
            self.assertGreaterEqual(len(b["audited_dimension_ids"]), 3)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas60DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 60)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 60)
        self.assertIn("60-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave29_continental_seed_cycles_and_party_coliseum_tournaments(self) -> None:
        """Wave 29 (D61–D62): 14 Continental Seed Cycle (Stage 1–5 Ekimus/Tiat State Machine) Nodes & 12 Underground Coliseum (Party-vs-Party) & Clan Tournament Arenas."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["continentalSeedCyclesCount"], 14)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["partyColiseumTournamentsCount"], 12)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_SEED_CYCLE_MODE",
            "setAtlasSeedCycleMode(",
            "renderAtlasSeedCycleBarHtml(",
            "studioContinentalSeedOverlay",
            "ATLAS_COLISEUM_TOURNAMENT_MODE",
            "setAtlasColiseumTournamentMode(",
            "renderAtlasColiseumTournamentBarHtml(",
            "studioColiseumTournamentOverlay",
            "62-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 29 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 62)

        d61 = audit["dimensions"]["D61_continental_seed_cycles_and_ekimus_tiat_stages"]
        self.assertEqual(d61["score"], 100.0)
        self.assertEqual(d61["verified"], 14)
        self.assertEqual(d61["target"], 14)
        self.assertEqual(d61["seed_of_infinity_stages"], 5)
        self.assertEqual(d61["seed_of_destruction_stages"], 5)
        self.assertEqual(d61["energy_compression_wells"], 4)
        self.assertEqual(
            set(d61["seed_categories"]),
            {
                "Seed_of_Infinity_Stage",
                "Seed_of_Destruction_Stage",
                "Energy_Compression_Well",
            },
        )
        self.assertTrue(d61["ui_wired"])

        d62 = audit["dimensions"]["D62_underground_coliseum_and_clan_tournament_arenas"]
        self.assertEqual(d62["score"], 100.0)
        self.assertEqual(d62["verified"], 12)
        self.assertEqual(d62["target"], 12)
        self.assertEqual(d62["underground_coliseum_brackets"], 5)
        self.assertEqual(d62["clan_war_tournament_rings"], 4)
        self.assertEqual(d62["royal_fame_exhibition_arenas"], 3)
        self.assertEqual(
            set(d62["tournament_categories"]),
            {
                "Underground_Coliseum_Bracket",
                "Clan_War_Tournament_Ring",
                "Royal_Fame_Exhibition_Arena",
            },
        )
        self.assertTrue(d62["ui_wired"])

        seed_nodes = atlas["continental_seed_cycles"]
        self.assertEqual(len(seed_nodes), 14)
        self.assertEqual(sum(1 for s in seed_nodes if s["seed_category"] == "Seed_of_Infinity_Stage"), 5)
        self.assertEqual(sum(1 for s in seed_nodes if s["seed_category"] == "Seed_of_Destruction_Stage"), 5)
        self.assertEqual(sum(1 for s in seed_nodes if s["seed_category"] == "Energy_Compression_Well"), 4)
        for s in seed_nodes:
            self.assertGreaterEqual(len(s["featured_s80_rewards"]), 2)

        arenas = atlas["party_coliseum_tournaments"]
        self.assertEqual(len(arenas), 12)
        self.assertEqual(sum(1 for a in arenas if a["tournament_category"] == "Underground_Coliseum_Bracket"), 5)
        self.assertEqual(sum(1 for a in arenas if a["tournament_category"] == "Clan_War_Tournament_Ring"), 4)
        self.assertEqual(sum(1 for a in arenas if a["tournament_category"] == "Royal_Fame_Exhibition_Arena"), 3)
        for a in arenas:
            self.assertGreaterEqual(len(a["victory_fame_and_rewards"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas62DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 62)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 62)
        self.assertIn("62-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave30_elemental_jewel_rune_sanctums_and_reputation_fame_monuments(self) -> None:
        """Wave 30 (D63–D64): 14 Elemental Jewel, Raid Rune Stone & Ancient Giant's Relic Sanctums & 15 Town Reputation Manager Fame & PvP Infusion Monuments."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["elementalJewelRuneSanctumsCount"], 14)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["reputationFameMonumentsCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_ELEMENTAL_JEWEL_MODE",
            "setAtlasElementalJewelMode(",
            "renderAtlasElementalJewelBarHtml(",
            "studioElementalJewelOverlay",
            "ATLAS_FAME_MONUMENT_MODE",
            "setAtlasFameMonumentMode(",
            "renderAtlasFameMonumentBarHtml(",
            "studioFameMonumentOverlay",
            "64-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 30 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 64)

        d63 = audit["dimensions"]["D63_elemental_jewel_raid_rune_and_giants_relic_sanctums"]
        self.assertEqual(d63["score"], 100.0)
        self.assertEqual(d63["verified"], 14)
        self.assertEqual(d63["target"], 14)
        self.assertEqual(d63["elemental_jewel_forges"], 6)
        self.assertEqual(d63["raid_rune_stone_altars"], 4)
        self.assertEqual(d63["ancient_giants_relic_vaults"], 4)
        self.assertEqual(
            set(d63["relic_tier_categories"]),
            {
                "Elemental_Jewel_Forge",
                "Raid_Rune_Stone_Altar",
                "Ancient_Giants_Relic_Vault",
            },
        )
        self.assertTrue(d63["ui_wired"])

        d64 = audit["dimensions"]["D64_town_reputation_manager_fame_and_pvp_monuments"]
        self.assertEqual(d64["score"], 100.0)
        self.assertEqual(d64["verified"], 15)
        self.assertEqual(d64["target"], 15)
        self.assertEqual(d64["pvp_weapon_infusion_obelisks"], 5)
        self.assertEqual(d64["pvp_armor_mirage_obelisks"], 5)
        self.assertEqual(d64["pk_pardon_and_crp_monuments"], 5)
        self.assertEqual(
            set(d64["fame_service_categories"]),
            {
                "PvP_Weapon_Infusion_Obelisk",
                "PvP_Armor_Mirage_Obelisk",
                "PK_Pardon_And_CRP_Monument",
            },
        )
        self.assertTrue(d64["ui_wired"])

        sanctums = atlas["elemental_jewel_rune_sanctums"]
        self.assertEqual(len(sanctums), 14)
        self.assertEqual(sum(1 for s in sanctums if s["relic_tier_category"] == "Elemental_Jewel_Forge"), 6)
        self.assertEqual(sum(1 for s in sanctums if s["relic_tier_category"] == "Raid_Rune_Stone_Altar"), 4)
        self.assertEqual(sum(1 for s in sanctums if s["relic_tier_category"] == "Ancient_Giants_Relic_Vault"), 4)
        for s in sanctums:
            self.assertTrue(s["featured_jewel_or_rune"])
            self.assertTrue(s["infusion_power_bonus"])

        monuments = atlas["reputation_fame_monuments"]
        self.assertEqual(len(monuments), 15)
        self.assertEqual(sum(1 for m in monuments if m["fame_service_category"] == "PvP_Weapon_Infusion_Obelisk"), 5)
        self.assertEqual(sum(1 for m in monuments if m["fame_service_category"] == "PvP_Armor_Mirage_Obelisk"), 5)
        self.assertEqual(sum(1 for m in monuments if m["fame_service_category"] == "PK_Pardon_And_CRP_Monument"), 5)
        for m in monuments:
            self.assertGreaterEqual(len(m["pvp_seal_infusions"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas64DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 64)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 64)
        self.assertIn("64-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave31_delusion_chamber_conduits_and_command_channel_raid_sanctums(self) -> None:
        """Wave 31 (D65–D66): 12 Delusion Chamber & Aenkinel Raid Conduits & 14 Zaken, Freya & Frintezza Command-Channel Raid Sanctums."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["delusionChamberConduitsCount"], 12)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["commandChannelRaidSanctumsCount"], 14)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_DELUSION_CHAMBER_MODE",
            "setAtlasDelusionChamberMode(",
            "renderAtlasDelusionChamberBarHtml(",
            "studioDelusionChamberOverlay",
            "ATLAS_COMMAND_RAID_MODE",
            "setAtlasCommandRaidMode(",
            "renderAtlasCommandRaidBarHtml(",
            "studioCommandChannelRaidOverlay",
            "66-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 31 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 66)

        d65 = audit["dimensions"]["D65_delusion_chamber_and_aenkinel_raid_conduits"]
        self.assertEqual(d65["score"], 100.0)
        self.assertEqual(d65["verified"], 12)
        self.assertEqual(d65["target"], 12)
        self.assertEqual(d65["seal_delusion_chambers"], 4)
        self.assertEqual(d65["great_tower_of_seal_chambers"], 4)
        self.assertEqual(d65["guiding_tea_leaf_conduits"], 4)
        self.assertEqual(
            set(d65["delusion_categories"]),
            {
                "Seal_Delusion_Chamber",
                "Great_Tower_Of_Seal_Chamber",
                "Guiding_Tea_Leaf_Conduit",
            },
        )
        self.assertTrue(d65["ui_wired"])

        d66 = audit["dimensions"]["D66_zaken_freya_and_frintezza_command_channel_raids"]
        self.assertEqual(d66["score"], 100.0)
        self.assertEqual(d66["verified"], 14)
        self.assertEqual(d66["target"], 14)
        self.assertEqual(d66["zaken_candlelight_caverns"], 5)
        self.assertEqual(d66["ice_queen_freya_palaces"], 5)
        self.assertEqual(d66["frintezza_organ_concert_halls"], 4)
        self.assertEqual(
            set(d66["expedition_wings"]),
            {
                "Zaken_Candlelight_Cavern",
                "Ice_Queen_Freya_Palace",
                "Frintezza_Organ_Concert_Hall",
            },
        )
        self.assertTrue(d66["ui_wired"])

        conduits = atlas["delusion_chamber_conduits"]
        self.assertEqual(len(conduits), 12)
        self.assertEqual(sum(1 for c in conduits if c["delusion_category"] == "Seal_Delusion_Chamber"), 4)
        self.assertEqual(sum(1 for c in conduits if c["delusion_category"] == "Great_Tower_Of_Seal_Chamber"), 4)
        self.assertEqual(sum(1 for c in conduits if c["delusion_category"] == "Guiding_Tea_Leaf_Conduit"), 4)
        for c in conduits:
            self.assertGreaterEqual(len(c["featured_delusion_drops"]), 2)

        raid_sanctums = atlas["command_channel_raid_sanctums"]
        self.assertEqual(len(raid_sanctums), 14)
        self.assertEqual(sum(1 for r in raid_sanctums if r["expedition_wing"] == "Zaken_Candlelight_Cavern"), 5)
        self.assertEqual(sum(1 for r in raid_sanctums if r["expedition_wing"] == "Ice_Queen_Freya_Palace"), 5)
        self.assertEqual(sum(1 for r in raid_sanctums if r["expedition_wing"] == "Frintezza_Organ_Concert_Hall"), 4)
        for r in raid_sanctums:
            self.assertGreaterEqual(len(r["sovereign_expedition_drops"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas66DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 66)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 66)
        self.assertIn("66-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave32_nevit_blessing_sanctuaries_and_eight_hour_council_signoff_ledger(self) -> None:
        """Wave 32 (D67–D68): 15 Town Nevit's Blessing Hourglass & Hunting Helper Sanctuaries & 24-Record 8-Hour Studio Council D1–D68 Sign-Off Ledger."""
        import scripts.catalog_explorer_web as web
        import scripts.run_atlas_iteration_loop as loop
        import scripts.studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["nevitBlessingSanctuariesCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["eightHourCouncilSignoffLedgerCount"], 24)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_NEVIT_BLESSING_MODE",
            "setAtlasNevitBlessingMode(",
            "renderAtlasNevitBlessingBarHtml(",
            "studioNevitBlessingOverlay",
            "ATLAS_COUNCIL_SIGNOFF_MODE",
            "setAtlasCouncilSignoffMode(",
            "renderAtlasCouncilSignoffBarHtml(",
            "studioCouncilSignoffOverlay",
            "68-Dimension Semantic-Zoom Atlas Score",
        ):
            self.assertIn(token, html, f"Missing Wave 32 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 68)

        d67 = audit["dimensions"]["D67_nevit_blessing_hourglass_and_hunting_helpers"]
        self.assertEqual(d67["score"], 100.0)
        self.assertEqual(d67["verified"], 15)
        self.assertEqual(d67["target"], 15)
        self.assertEqual(d67["nevit_hourglass_altars"], 5)
        self.assertEqual(d67["arcane_fairy_helper_sanctuaries"], 5)
        self.assertEqual(d67["martial_turtle_helper_sanctuaries"], 5)
        self.assertEqual(
            set(d67["blessing_categories"]),
            {
                "Nevit_Hourglass_Altar",
                "Arcane_Fairy_Helper_Sanctuary",
                "Martial_Turtle_Helper_Sanctuary",
            },
        )
        self.assertTrue(d67["ui_wired"])

        d68 = audit["dimensions"]["D68_eight_hour_studio_council_signoff_ledger"]
        self.assertEqual(d68["score"], 100.0)
        self.assertEqual(d68["verified"], 24)
        self.assertEqual(d68["target"], 24)
        self.assertEqual(d68["product_owner_signoffs"], 4)
        self.assertEqual(d68["game_designer_lead_signoffs"], 4)
        self.assertEqual(d68["player_growth_path_signoffs"], 4)
        self.assertEqual(d68["game_story_designer_signoffs"], 4)
        self.assertEqual(d68["monster_and_mob_designer_signoffs"], 4)
        self.assertEqual(d68["lead_systems_map_architect_signoffs"], 4)
        self.assertEqual(
            set(d68["council_roles"]),
            {
                "Product_Owner",
                "Game_Designer_Lead",
                "Player_Growth_Path_Designer",
                "Game_Story_Designer",
                "Monster_And_Mob_Designer",
                "Lead_Systems_Map_Architect",
            },
        )
        self.assertEqual(len(d68["certified_wave_ranges"]), 4)
        self.assertTrue(d68["ui_wired"])

        sanctuaries = atlas["nevit_blessing_sanctuaries"]
        self.assertEqual(len(sanctuaries), 15)
        self.assertEqual(sum(1 for s in sanctuaries if s["blessing_category"] == "Nevit_Hourglass_Altar"), 5)
        self.assertEqual(sum(1 for s in sanctuaries if s["blessing_category"] == "Arcane_Fairy_Helper_Sanctuary"), 5)
        self.assertEqual(sum(1 for s in sanctuaries if s["blessing_category"] == "Martial_Turtle_Helper_Sanctuary"), 5)
        for s in sanctuaries:
            self.assertGreaterEqual(len(s["featured_hunting_helpers"]), 2)

        ledger = atlas["eight_hour_council_signoff_ledger"]
        self.assertEqual(len(ledger), 24)
        for role in (
            "Product_Owner",
            "Game_Designer_Lead",
            "Player_Growth_Path_Designer",
            "Game_Story_Designer",
            "Monster_And_Mob_Designer",
            "Lead_Systems_Map_Architect",
        ):
            self.assertEqual(sum(1 for r in ledger if r["council_role"] == role), 4)
        for r in ledger:
            self.assertGreaterEqual(len(r["certified_dimensions"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas68DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 68)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 68)
        self.assertIn("68-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave33_champion_mob_herd_grounds_and_dualsword_craft_unseal_forges(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop

        html = web.INDEX_HTML
        for token in (
            "ATLAS_CHAMPION_MOB_MODE",
            "setAtlasChampionMobMode",
            "renderAtlasChampionMobBarHtml",
            "studioChampionMobOverlay",
            "Blue_Aura_10x_Champion_Field",
            "Crimson_Aura_50x_Champion_Sanctum",
            "Social_Herd_Leader_Pack_Ground",
            "ATLAS_DUALSWORD_FORGE_MODE",
            "setAtlasDualswordForgeMode",
            "renderAtlasDualswordForgeBarHtml",
            "studioDualswordForgeOverlay",
            "Starter_C_B_Dualsword_Anvil",
            "A_S_Grade_Craft_Stamp_Forge",
            "Maestro_Ishuma_S80_S84_Unseal_Dock",
            "70-Dimension Semantic-Zoom Atlas Score",
            "D1–D70 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 33 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 70)

        d69 = audit["dimensions"]["D69_champion_mob_aura_and_herd_leader_grounds"]
        self.assertEqual(d69["score"], 100.0)
        self.assertEqual(d69["verified"], 16)
        self.assertEqual(d69["target"], 16)
        self.assertEqual(d69["blue_aura_10x_fields"], 6)
        self.assertEqual(d69["crimson_aura_50x_sanctums"], 5)
        self.assertEqual(d69["social_herd_leader_grounds"], 5)
        self.assertEqual(
            set(d69["champion_categories"]),
            {
                "Blue_Aura_10x_Champion_Field",
                "Crimson_Aura_50x_Champion_Sanctum",
                "Social_Herd_Leader_Pack_Ground",
            },
        )
        self.assertTrue(d69["ui_wired"])

        d70 = audit["dimensions"]["D70_dualsword_craft_stamp_and_ishuma_unseal_forges"]
        self.assertEqual(d70["score"], 100.0)
        self.assertEqual(d70["verified"], 15)
        self.assertEqual(d70["target"], 15)
        self.assertEqual(d70["starter_c_b_dualsword_anvils"], 5)
        self.assertEqual(d70["a_s_grade_craft_stamp_forges"], 5)
        self.assertEqual(d70["maestro_ishuma_s80_s84_unseal_docks"], 5)
        self.assertEqual(
            set(d70["dualsword_tier_categories"]),
            {
                "Starter_C_B_Dualsword_Anvil",
                "A_S_Grade_Craft_Stamp_Forge",
                "Maestro_Ishuma_S80_S84_Unseal_Dock",
            },
        )
        self.assertTrue(d70["ui_wired"])

        grounds = atlas["champion_mob_herd_grounds"]
        self.assertEqual(len(grounds), 16)
        self.assertEqual(sum(1 for g in grounds if g["champion_category"] == "Blue_Aura_10x_Champion_Field"), 6)
        self.assertEqual(sum(1 for g in grounds if g["champion_category"] == "Crimson_Aura_50x_Champion_Sanctum"), 5)
        self.assertEqual(sum(1 for g in grounds if g["champion_category"] == "Social_Herd_Leader_Pack_Ground"), 5)
        for g in grounds:
            self.assertGreaterEqual(len(g["spoil_and_drop_jackpot"]), 2)

        forges = atlas["dualsword_craft_unseal_forges"]
        self.assertEqual(len(forges), 15)
        self.assertEqual(sum(1 for f in forges if f["dualsword_tier_category"] == "Starter_C_B_Dualsword_Anvil"), 5)
        self.assertEqual(sum(1 for f in forges if f["dualsword_tier_category"] == "A_S_Grade_Craft_Stamp_Forge"), 5)
        self.assertEqual(sum(1 for f in forges if f["dualsword_tier_category"] == "Maestro_Ishuma_S80_S84_Unseal_Dock"), 5)
        for f in forges:
            self.assertGreaterEqual(len(f["signature_dualsword_pairings"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas70DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 70)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 70)
        self.assertIn("70-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave34_tech_art_asset_pipeline_gates_and_backend_bot_swarm_simulation_sectors(self) -> None:
        from pathlib import Path
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop

        agents_dir = Path(__file__).resolve().parent.parent / ".claude" / "agents"
        for agent_file in (
            "lead-tools-pipeline-architect.md",
            "content-world-tools-engineer.md",
            "technical-artist-pipeline-dcc.md",
            "backend-simulation-infra-engineer.md",
            "liveops-build-gm-engineer.md",
        ):
            self.assertTrue((agents_dir / agent_file).exists(), f"Missing squad agent file {agent_file}")

        html = web.INDEX_HTML
        for token in (
            "ATLAS_TECH_ART_PIPELINE_MODE",
            "setAtlasTechArtPipelineMode",
            "renderAtlasTechArtPipelineBarHtml",
            "studioTechArtPipelineOverlay",
            "Three_Tier_GLB_Asset_Gate",
            "Polygon_Bone_Shader_Validator",
            "Godot_World_Chunk_Streaming_Baker",
            "ATLAS_BOT_SWARM_SIM_MODE",
            "setAtlasBotSwarmSimMode",
            "renderAtlasBotSwarmSimBarHtml",
            "studioBotSwarmSimOverlay",
            "Headless_10k_Bot_Swarm_Sector",
            "Spatial_Grid_AOI_Partition_Cell",
            "Deterministic_Replay_Desync_Probe",
            "72-Dimension Semantic-Zoom Atlas Score",
            "D1–D72 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 34 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 72)

        d71 = audit["dimensions"]["D71_tech_art_asset_pipeline_and_chunk_bakers"]
        self.assertEqual(d71["score"], 100.0)
        self.assertEqual(d71["verified"], 16)
        self.assertEqual(d71["target"], 16)
        self.assertEqual(d71["three_tier_glb_asset_gates"], 6)
        self.assertEqual(d71["polygon_bone_shader_validators"], 5)
        self.assertEqual(d71["godot_world_chunk_streaming_bakers"], 5)
        self.assertEqual(
            set(d71["pipeline_stage_categories"]),
            {
                "Three_Tier_GLB_Asset_Gate",
                "Polygon_Bone_Shader_Validator",
                "Godot_World_Chunk_Streaming_Baker",
            },
        )
        self.assertTrue(d71["ui_wired"])

        d72 = audit["dimensions"]["D72_backend_bot_swarm_and_spatial_simulation_sectors"]
        self.assertEqual(d72["score"], 100.0)
        self.assertEqual(d72["verified"], 16)
        self.assertEqual(d72["target"], 16)
        self.assertEqual(d72["headless_10k_bot_swarm_sectors"], 6)
        self.assertEqual(d72["spatial_grid_aoi_partition_cells"], 5)
        self.assertEqual(d72["deterministic_replay_desync_probes"], 5)
        self.assertEqual(
            set(d72["simulation_categories"]),
            {
                "Headless_10k_Bot_Swarm_Sector",
                "Spatial_Grid_AOI_Partition_Cell",
                "Deterministic_Replay_Desync_Probe",
            },
        )
        self.assertTrue(d72["ui_wired"])

        gates = atlas["tech_art_asset_pipeline_gates"]
        self.assertEqual(len(gates), 16)
        self.assertEqual(sum(1 for g in gates if g["pipeline_stage_category"] == "Three_Tier_GLB_Asset_Gate"), 6)
        self.assertEqual(sum(1 for g in gates if g["pipeline_stage_category"] == "Polygon_Bone_Shader_Validator"), 5)
        self.assertEqual(sum(1 for g in gates if g["pipeline_stage_category"] == "Godot_World_Chunk_Streaming_Baker"), 5)
        for g in gates:
            self.assertGreaterEqual(len(g["automated_ci_validators"]), 2)

        sectors = atlas["backend_bot_swarm_simulation_sectors"]
        self.assertEqual(len(sectors), 16)
        self.assertEqual(sum(1 for s in sectors if s["simulation_category"] == "Headless_10k_Bot_Swarm_Sector"), 6)
        self.assertEqual(sum(1 for s in sectors if s["simulation_category"] == "Spatial_Grid_AOI_Partition_Cell"), 5)
        self.assertEqual(sum(1 for s in sectors if s["simulation_category"] == "Deterministic_Replay_Desync_Probe"), 5)
        for s in sectors:
            self.assertGreaterEqual(len(s["stress_test_assertions"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas72DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 72)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 72)
        self.assertIn("72-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave35_liveops_gm_control_anchors_and_platform_tools_squad_registry(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["liveopsGmControlAnchorsCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["platformToolsSquadRegistryCount"], 20)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_LIVEOPS_GM_MODE",
            "setAtlasLiveopsGmMode",
            "renderAtlasLiveopsGmBarHtml",
            "studioLiveopsGmOverlay",
            "GM_Stuck_Character_Rescue_Anchor",
            "Inventory_Rollback_Audit_Vault",
            "Zero_Restart_Live_Event_Hot_Config",
            "ATLAS_TOOLS_SQUAD_MODE",
            "setAtlasToolsSquadMode",
            "renderAtlasToolsSquadBarHtml",
            "studioToolsSquadOverlay",
            "Stage_1_Content_And_World",
            "Stage_2_Asset_And_Build_Pipeline",
            "Stage_3_Server_And_Simulation",
            "Stage_4_LiveOps_And_GM",
            "74-Dimension Semantic-Zoom Atlas Score",
            "D1–D74 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 35 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 74)

        d73 = audit["dimensions"]["D73_liveops_gm_stuck_rescue_rollback_and_hot_config"]
        self.assertEqual(d73["score"], 100.0)
        self.assertEqual(d73["verified"], 15)
        self.assertEqual(d73["target"], 15)
        self.assertEqual(d73["gm_stuck_rescue_anchors"], 5)
        self.assertEqual(d73["inventory_rollback_audit_vaults"], 5)
        self.assertEqual(d73["zero_restart_live_event_hot_configs"], 5)
        self.assertEqual(
            set(d73["liveops_categories"]),
            {
                "GM_Stuck_Character_Rescue_Anchor",
                "Inventory_Rollback_Audit_Vault",
                "Zero_Restart_Live_Event_Hot_Config",
            },
        )
        self.assertTrue(d73["ui_wired"])

        d74 = audit["dimensions"]["D74_platform_tools_squad_unified_pipeline_registry"]
        self.assertEqual(d74["score"], 100.0)
        self.assertEqual(d74["verified"], 20)
        self.assertEqual(d74["target"], 20)
        self.assertEqual(d74["stage_1_content_world_tools"], 5)
        self.assertEqual(d74["stage_2_asset_build_tools"], 5)
        self.assertEqual(d74["stage_3_server_simulation_tools"], 5)
        self.assertEqual(d74["stage_4_liveops_gm_tools"], 5)
        self.assertEqual(d74["lead_architect_tools"], 4)
        self.assertEqual(d74["content_world_engineer_tools"], 4)
        self.assertEqual(d74["technical_artist_tools"], 4)
        self.assertEqual(d74["backend_simulation_engineer_tools"], 4)
        self.assertEqual(d74["liveops_gm_engineer_tools"], 4)
        self.assertEqual(
            set(d74["tooling_domains"]),
            {
                "Stage_1_Content_And_World",
                "Stage_2_Asset_And_Build_Pipeline",
                "Stage_3_Server_And_Simulation",
                "Stage_4_LiveOps_And_GM",
            },
        )
        self.assertEqual(
            set(d74["squad_roles"]),
            {
                "Lead_Tools_Pipeline_Architect",
                "Content_World_Tools_Engineer",
                "Technical_Artist_Pipeline_DCC",
                "Backend_Simulation_Infra_Engineer",
                "LiveOps_Build_GM_Engineer",
            },
        )
        self.assertEqual(
            set(d74["architectural_principles"]),
            {
                "1_Internal_Customer_Embedded_DX",
                "2_SSOT_Schema_Separated_From_UI",
                "3_Web_First_Non_Spatial_Suite",
            },
        )
        self.assertTrue(d74["ui_wired"])

        anchors = atlas["liveops_gm_control_anchors"]
        self.assertEqual(len(anchors), 15)
        self.assertEqual(len({a["town_zone_id"] for a in anchors}), 15)
        self.assertEqual(sum(1 for a in anchors if a["liveops_category"] == "GM_Stuck_Character_Rescue_Anchor"), 5)
        self.assertEqual(sum(1 for a in anchors if a["liveops_category"] == "Inventory_Rollback_Audit_Vault"), 5)
        self.assertEqual(sum(1 for a in anchors if a["liveops_category"] == "Zero_Restart_Live_Event_Hot_Config"), 5)
        for a in anchors:
            self.assertGreaterEqual(len(a["hot_config_and_audit_features"]), 2)

        tools = atlas["platform_tools_squad_registry"]
        self.assertEqual(len(tools), 20)
        for dom in (
            "Stage_1_Content_And_World",
            "Stage_2_Asset_And_Build_Pipeline",
            "Stage_3_Server_And_Simulation",
            "Stage_4_LiveOps_And_GM",
        ):
            self.assertEqual(sum(1 for t in tools if t["tooling_domain"] == dom), 5)
        for role in (
            "Lead_Tools_Pipeline_Architect",
            "Content_World_Tools_Engineer",
            "Technical_Artist_Pipeline_DCC",
            "Backend_Simulation_Infra_Engineer",
            "LiveOps_Build_GM_Engineer",
        ):
            self.assertEqual(sum(1 for t in tools if t["owner_squad_role"] == role), 4)
        for t in tools:
            self.assertGreaterEqual(len(t["capabilities_and_ssot_hooks"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas74DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 74)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 74)
        self.assertIn("74-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave36_dialogue_localization_graphs_and_spawner_loot_balancer_suites(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["dialogueLocalizationGraphsCount"], 18)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["spawnerLootBalancerSuitesCount"], 16)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_DIALOGUE_GRAPH_MODE",
            "setAtlasDialogueGraphMode",
            "renderAtlasDialogueGraphBarHtml",
            "studioDialogueGraphOverlay",
            "Main_Story_Dialogue_DAG",
            "Class_Trial_Branching_Tree",
            "Racial_Lore_Localization_Bundle",
            "ATLAS_SPAWNER_BALANCER_MODE",
            "setAtlasSpawnerBalancerMode",
            "renderAtlasSpawnerBalancerBarHtml",
            "studioSpawnerBalancerOverlay",
            "Visual_Spawner_Leash_Editor",
            "Monte_Carlo_Loot_Inflation_Balancer",
            "Hot_Reload_SSOT_Writeback_Bridge",
            "76-Dimension Semantic-Zoom Atlas Score",
            "D1–D76 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 36 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 76)

        d75 = audit["dimensions"]["D75_dialogue_dag_and_i18n_localization_graphs"]
        self.assertEqual(d75["score"], 100.0)
        self.assertEqual(d75["verified"], 18)
        self.assertEqual(d75["target"], 18)
        self.assertEqual(d75["main_story_dialogue_dags"], 6)
        self.assertEqual(d75["class_trial_branching_trees"], 6)
        self.assertEqual(d75["racial_lore_localization_bundles"], 6)
        self.assertEqual(
            set(d75["graph_categories"]),
            {
                "Main_Story_Dialogue_DAG",
                "Class_Trial_Branching_Tree",
                "Racial_Lore_Localization_Bundle",
            },
        )
        self.assertEqual(
            set(d75["races_covered"]),
            {"Human", "Lunar", "Ogre/Orc", "Dwarf", "Dark-Lunar", "Furral"},
        )
        self.assertTrue(d75["ui_wired"])

        d76 = audit["dimensions"]["D76_visual_spawner_and_loot_economy_balancer_suites"]
        self.assertEqual(d76["score"], 100.0)
        self.assertEqual(d76["verified"], 16)
        self.assertEqual(d76["target"], 16)
        self.assertEqual(d76["visual_spawner_leash_editors"], 6)
        self.assertEqual(d76["monte_carlo_loot_inflation_balancers"], 5)
        self.assertEqual(d76["hot_reload_ssot_writeback_bridges"], 5)
        self.assertEqual(
            set(d76["balancer_categories"]),
            {
                "Visual_Spawner_Leash_Editor",
                "Monte_Carlo_Loot_Inflation_Balancer",
                "Hot_Reload_SSOT_Writeback_Bridge",
            },
        )
        self.assertTrue(d76["ui_wired"])

        graphs = atlas["dialogue_localization_graphs"]
        self.assertEqual(len(graphs), 18)
        self.assertEqual(sum(1 for g in graphs if g["graph_category"] == "Main_Story_Dialogue_DAG"), 6)
        self.assertEqual(sum(1 for g in graphs if g["graph_category"] == "Class_Trial_Branching_Tree"), 6)
        self.assertEqual(sum(1 for g in graphs if g["graph_category"] == "Racial_Lore_Localization_Bundle"), 6)
        for race in ("Human", "Lunar", "Ogre/Orc", "Dwarf", "Dark-Lunar", "Furral"):
            self.assertEqual(sum(1 for g in graphs if g["race_id"] == race), 3)
        for g in graphs:
            self.assertGreaterEqual(len(g["automated_graph_validators"]), 2)

        suites = atlas["spawner_loot_balancer_suites"]
        self.assertEqual(len(suites), 16)
        self.assertEqual(sum(1 for s in suites if s["balancer_category"] == "Visual_Spawner_Leash_Editor"), 6)
        self.assertEqual(sum(1 for s in suites if s["balancer_category"] == "Monte_Carlo_Loot_Inflation_Balancer"), 5)
        self.assertEqual(sum(1 for s in suites if s["balancer_category"] == "Hot_Reload_SSOT_Writeback_Bridge"), 5)
        for s in suites:
            self.assertGreaterEqual(len(s["protected_invariants"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas76DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 76)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 76)
        self.assertIn("76-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave37_combat_skill_timeline_profiles_and_build_farm_patch_cdn_nodes(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["combatSkillTimelineProfilesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["buildFarmPatchCdnNodesCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_SKILL_TIMELINE_MODE",
            "setAtlasSkillTimelineMode",
            "renderAtlasSkillTimelineBarHtml",
            "studioSkillTimelineOverlay",
            "Martial_Combo_Hitbox_Timeline",
            "Arcane_Cast_Interrupt_Timeline",
            "Boss_Telegraph_VFX_Timeline",
            "ATLAS_BUILD_FARM_MODE",
            "setAtlasBuildFarmMode",
            "renderAtlasBuildFarmBarHtml",
            "studioBuildFarmOverlay",
            "Godot_Client_Pak_Cooker_Node",
            "Server_Rs_Linux_Musl_Build_Runner",
            "Delta_Binary_Patch_CDN_Edge",
            "78-Dimension Semantic-Zoom Atlas Score",
            "D1–D78 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 37 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 78)

        d77 = audit["dimensions"]["D77_combat_skill_timeline_and_boss_telegraph_profiles"]
        self.assertEqual(d77["score"], 100.0)
        self.assertEqual(d77["verified"], 16)
        self.assertEqual(d77["target"], 16)
        self.assertEqual(d77["martial_combo_hitbox_timelines"], 6)
        self.assertEqual(d77["arcane_cast_interrupt_timelines"], 5)
        self.assertEqual(d77["boss_telegraph_vfx_timelines"], 5)
        self.assertEqual(
            set(d77["timeline_categories"]),
            {
                "Martial_Combo_Hitbox_Timeline",
                "Arcane_Cast_Interrupt_Timeline",
                "Boss_Telegraph_VFX_Timeline",
            },
        )
        self.assertTrue(d77["ui_wired"])

        d78 = audit["dimensions"]["D78_automated_build_farm_and_delta_patch_cdn_nodes"]
        self.assertEqual(d78["score"], 100.0)
        self.assertEqual(d78["verified"], 15)
        self.assertEqual(d78["target"], 15)
        self.assertEqual(d78["godot_client_pak_cooker_nodes"], 5)
        self.assertEqual(d78["server_rs_linux_musl_build_runners"], 5)
        self.assertEqual(d78["delta_binary_patch_cdn_edges"], 5)
        self.assertEqual(
            set(d78["build_farm_categories"]),
            {
                "Godot_Client_Pak_Cooker_Node",
                "Server_Rs_Linux_Musl_Build_Runner",
                "Delta_Binary_Patch_CDN_Edge",
            },
        )
        self.assertTrue(d78["ui_wired"])

        timelines = atlas["combat_skill_timeline_profiles"]
        self.assertEqual(len(timelines), 16)
        self.assertEqual(sum(1 for t in timelines if t["timeline_category"] == "Martial_Combo_Hitbox_Timeline"), 6)
        self.assertEqual(sum(1 for t in timelines if t["timeline_category"] == "Arcane_Cast_Interrupt_Timeline"), 5)
        self.assertEqual(sum(1 for t in timelines if t["timeline_category"] == "Boss_Telegraph_VFX_Timeline"), 5)
        for t in timelines:
            self.assertGreaterEqual(len(t["timeline_validation_gates"]), 2)

        build_nodes = atlas["build_farm_patch_cdn_nodes"]
        self.assertEqual(len(build_nodes), 15)
        self.assertEqual(len({n["town_zone_id"] for n in build_nodes}), 15)
        self.assertEqual(sum(1 for n in build_nodes if n["build_farm_category"] == "Godot_Client_Pak_Cooker_Node"), 5)
        self.assertEqual(sum(1 for n in build_nodes if n["build_farm_category"] == "Server_Rs_Linux_Musl_Build_Runner"), 5)
        self.assertEqual(sum(1 for n in build_nodes if n["build_farm_category"] == "Delta_Binary_Patch_CDN_Edge"), 5)
        for n in build_nodes:
            self.assertGreaterEqual(len(n["ci_release_gates"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas78DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 78)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 78)
        self.assertIn("78-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave38_architect_dx_codegen_gates_and_two_ring_studio_80d_signoff_matrix(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["architectDxCodegenGatesCount"], 15)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["twoRingStudio80dSignoffMatrixCount"], 22)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_ARCHITECT_DX_MODE",
            "setAtlasArchitectDxMode",
            "renderAtlasArchitectDxBarHtml",
            "atlasArchitectDxBar",
            "studioArchitectDxOverlay",
            "Unified_SSO_Editor_Session_Hub",
            "Cross_Tool_Undo_Redo_Command_Stack",
            "Schema_Codegen_Drift_Gate_Watchdog",
            "ATLAS_TWO_RING_SIGNOFF_MODE",
            "setAtlasTwoRingSignoffMode",
            "renderAtlasTwoRingSignoffBarHtml",
            "atlasTwoRingSignoffBar",
            "studioTwoRingSignoffOverlay",
            "Ring_A_Creative_Council",
            "Ring_B_Platform_Tools_Squad",
            "80-Dimension Semantic-Zoom Atlas Score",
            "D1–D80 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 38 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 80)

        d79 = audit["dimensions"]["D79_architect_dx_undo_redo_and_codegen_drift_gates"]
        self.assertEqual(d79["score"], 100.0)
        self.assertEqual(d79["verified"], 15)
        self.assertEqual(d79["target"], 15)
        self.assertEqual(d79["unified_sso_editor_session_hubs"], 5)
        self.assertEqual(d79["cross_tool_undo_redo_command_stacks"], 5)
        self.assertEqual(d79["schema_codegen_drift_gate_watchdogs"], 5)
        self.assertEqual(
            set(d79["architect_dx_categories"]),
            {
                "Unified_SSO_Editor_Session_Hub",
                "Cross_Tool_Undo_Redo_Command_Stack",
                "Schema_Codegen_Drift_Gate_Watchdog",
            },
        )
        self.assertTrue(d79["ui_wired"])

        d80 = audit["dimensions"]["D80_two_ring_studio_11_role_80d_signoff_matrix"]
        self.assertEqual(d80["score"], 100.0)
        self.assertEqual(d80["verified"], 22)
        self.assertEqual(d80["target"], 22)
        self.assertEqual(d80["ring_a_creative_council_records"], 12)
        self.assertEqual(d80["ring_b_platform_tools_squad_records"], 10)
        self.assertEqual(
            set(d80["studio_rings"]),
            {"Ring_A_Creative_Council", "Ring_B_Platform_Tools_Squad"},
        )
        self.assertEqual(len(d80["studio_roles"]), 11)
        self.assertEqual(len(d80["tooling_pillar_stages"]), 4)
        self.assertTrue(d80["ui_wired"])

        dx_gates = atlas["architect_dx_codegen_gates"]
        self.assertEqual(len(dx_gates), 15)
        self.assertEqual(len({g["town_zone_id"] for g in dx_gates}), 15)
        self.assertEqual(sum(1 for g in dx_gates if g["architect_dx_category"] == "Unified_SSO_Editor_Session_Hub"), 5)
        self.assertEqual(sum(1 for g in dx_gates if g["architect_dx_category"] == "Cross_Tool_Undo_Redo_Command_Stack"), 5)
        self.assertEqual(sum(1 for g in dx_gates if g["architect_dx_category"] == "Schema_Codegen_Drift_Gate_Watchdog"), 5)
        for g in dx_gates:
            self.assertGreaterEqual(len(g["enforced_standards"]), 2)

        signoffs = atlas["two_ring_studio_80d_signoff_matrix"]
        self.assertEqual(len(signoffs), 22)
        self.assertEqual(sum(1 for r in signoffs if r["studio_ring"] == "Ring_A_Creative_Council"), 12)
        self.assertEqual(sum(1 for r in signoffs if r["studio_ring"] == "Ring_B_Platform_Tools_Squad"), 10)
        self.assertEqual(len({r["studio_role"] for r in signoffs}), 11)
        for r in signoffs:
            self.assertGreaterEqual(len(r["certified_dimensions"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas80DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 80)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 80)
        self.assertIn("80-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_wave39_weather_shader_acoustic_profiles_and_server_mesh_persistence_corridors(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["weatherShaderAcousticProfilesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["serverMeshPersistenceCorridorsCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ATLAS_WEATHER_ACOUSTIC_MODE",
            "setAtlasWeatherAcousticMode",
            "renderAtlasWeatherAcousticBarHtml",
            "atlasWeatherAcousticBar",
            "studioWeatherAcousticOverlay",
            "Town_Symphony_And_Tavern_Reverb",
            "Nocturnal_Curse_Fog_And_Blood_Rain_Field",
            "Subterranean_Catacomb_Echo_And_Resonance",
            "ATLAS_SERVER_MESH_MODE",
            "setAtlasServerMeshMode",
            "renderAtlasServerMeshBarHtml",
            "atlasServerMeshBar",
            "studioServerMeshOverlay",
            "Zero_Loading_Zone_Boundary_Handoff",
            "Redis_Stream_Cross_Realm_Event_Bus",
            "Postgres_Advisory_Lock_Writebehind_Wal",
            "82-Dimension Semantic-Zoom Atlas Score",
            "D1–D82 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 39 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 82)

        d81 = audit["dimensions"]["D81_weather_day_night_shader_and_spatial_audio_profiles"]
        self.assertEqual(d81["score"], 100.0)
        self.assertEqual(d81["verified"], 16)
        self.assertEqual(d81["target"], 16)
        self.assertEqual(d81["town_symphony_and_tavern_reverbs"], 6)
        self.assertEqual(d81["nocturnal_curse_fog_and_blood_rain_fields"], 5)
        self.assertEqual(d81["subterranean_catacomb_echo_and_resonances"], 5)
        self.assertEqual(
            set(d81["atmosphere_categories"]),
            {
                "Town_Symphony_And_Tavern_Reverb",
                "Nocturnal_Curse_Fog_And_Blood_Rain_Field",
                "Subterranean_Catacomb_Echo_And_Resonance",
            },
        )
        self.assertTrue(d81["ui_wired"])

        d82 = audit["dimensions"]["D82_server_mesh_handoff_redis_bus_and_postgres_wal_corridors"]
        self.assertEqual(d82["score"], 100.0)
        self.assertEqual(d82["verified"], 15)
        self.assertEqual(d82["target"], 15)
        self.assertEqual(d82["zero_loading_zone_boundary_handoffs"], 5)
        self.assertEqual(d82["redis_stream_cross_realm_event_buses"], 5)
        self.assertEqual(d82["postgres_advisory_lock_writebehind_wals"], 5)
        self.assertEqual(
            set(d82["infra_categories"]),
            {
                "Zero_Loading_Zone_Boundary_Handoff",
                "Redis_Stream_Cross_Realm_Event_Bus",
                "Postgres_Advisory_Lock_Writebehind_Wal",
            },
        )
        self.assertTrue(d82["ui_wired"])

        profiles = atlas["weather_shader_acoustic_profiles"]
        self.assertEqual(len(profiles), 16)
        self.assertEqual(sum(1 for p in profiles if p["atmosphere_category"] == "Town_Symphony_And_Tavern_Reverb"), 6)
        self.assertEqual(sum(1 for p in profiles if p["atmosphere_category"] == "Nocturnal_Curse_Fog_And_Blood_Rain_Field"), 5)
        self.assertEqual(sum(1 for p in profiles if p["atmosphere_category"] == "Subterranean_Catacomb_Echo_And_Resonance"), 5)
        for p in profiles:
            self.assertGreaterEqual(len(p["gpu_shader_and_memory_gates"]), 2)

        corridors = atlas["server_mesh_persistence_corridors"]
        self.assertEqual(len(corridors), 15)
        self.assertEqual(sum(1 for c in corridors if c["infra_category"] == "Zero_Loading_Zone_Boundary_Handoff"), 5)
        self.assertEqual(sum(1 for c in corridors if c["infra_category"] == "Redis_Stream_Cross_Realm_Event_Bus"), 5)
        self.assertEqual(sum(1 for c in corridors if c["infra_category"] == "Postgres_Advisory_Lock_Writebehind_Wal"), 5)
        for c in corridors:
            self.assertGreaterEqual(len(c["chaos_and_load_verifications"]), 2)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas82DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 82)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 82)
        self.assertIn("82-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave40_anti_bot_sentinels_and_godot_storybook_prefabs(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["antiBotEconomySentinelsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["godotStorybookPrefabNodesCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "ANTI_BOT_SENTINELS",
            "GODOT_STORYBOOK_PREFABS",
            "ATLAS_ANTI_BOT_MODE",
            "ATLAS_GODOT_STORYBOOK_MODE",
            "setAtlasAntiBotMode",
            "setAtlasGodotStorybookMode",
            "selectAntiBotSentinel",
            "selectGodotStorybookPrefab",
            "renderAtlasAntiBotSentinelBarHtml",
            "renderAtlasGodotStorybookBarHtml",
            "studioAntiBotSentinelOverlay",
            "studioGodotStorybookOverlay",
            "🕵️ Anti-Bot & RMT Sentinel (16)",
            "🧱 Godot 3D Storybook (15)",
            "84-Dimension Semantic-Zoom Atlas Score",
            "D1–D84 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 40 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 84)

        d83 = audit["dimensions"]["D83_anti_bot_rmt_telemetry_and_economy_sentinel_matrix"]
        self.assertEqual(d83["score"], 100.0)
        self.assertEqual(d83["verified"], 16)
        self.assertEqual(d83["target"], 16)
        self.assertTrue(d83["ui_wired"])

        d84 = audit["dimensions"]["D84_godot_tool_scene_storybook_and_3d_prefab_inspector_matrix"]
        self.assertEqual(d84["score"], 100.0)
        self.assertEqual(d84["verified"], 15)
        self.assertEqual(d84["target"], 15)
        self.assertTrue(d84["ui_wired"])

        sentinels = atlas["anti_bot_economy_sentinels"]
        self.assertEqual(len(sentinels), 16)
        for s in sentinels:
            self.assertGreaterEqual(s["entropy_threshold_bits"], 1.8)
            self.assertLessEqual(s["entropy_threshold_bits"], 4.2)
            self.assertGreaterEqual(s["rmt_graph_centrality_max"], 0.65)
            self.assertLessEqual(s["rmt_graph_centrality_max"], 0.95)
            self.assertGreaterEqual(s["false_positive_guard_pct"], 99.85)
            self.assertLessEqual(s["false_positive_guard_pct"], 99.99)

        prefabs = atlas["godot_storybook_prefab_nodes"]
        self.assertEqual(len(prefabs), 15)
        for p in prefabs:
            self.assertTrue(p["godot_scene_uri"].startswith("res://scenes/storybook/"))
            self.assertTrue(p["godot_scene_uri"].endswith(".tscn"))
            self.assertTrue(p["webp_preview_uri"].startswith("assets/storybook-previews/"))
            self.assertTrue(p["webp_preview_uri"].endswith(".webp"))
            self.assertGreaterEqual(p["submesh_count"], 4)
            self.assertLessEqual(p["submesh_count"], 24)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas84DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 84)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 84)
        self.assertIn("84-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave41_navmesh_obstacles_and_liveops_event_flags(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["navmeshObstacleSectorsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["liveopsEventFlagNodesCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "NAVMESH_OBSTACLE_SECTORS",
            "LIVEOPS_EVENT_FLAGS",
            "ATLAS_NAVMESH_MODE",
            "ATLAS_LIVEOPS_FLAGS_MODE",
            "setAtlasNavmeshMode",
            "setAtlasLiveopsFlagsMode",
            "selectNavmeshObstacleSector",
            "selectLiveopsEventFlag",
            "renderAtlasNavmeshObstacleBarHtml",
            "renderAtlasLiveopsEventFlagsBarHtml",
            "studioNavmeshObstacleOverlay",
            "studioLiveopsEventFlagsOverlay",
            "🧭 3D NavMesh & Doors (16)",
            "🎪 LiveOps Event Flags (15)",
            "86-Dimension Semantic-Zoom Atlas Score",
            "D1–D86 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 41 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 86)

        d85 = audit["dimensions"]["D85_navmesh_3d_pathfinding_jump_link_and_dynamic_obstacle_matrix"]
        self.assertEqual(d85["score"], 100.0)
        self.assertEqual(d85["verified"], 16)
        self.assertEqual(d85["target"], 16)
        self.assertTrue(d85["ui_wired"])

        d86 = audit["dimensions"]["D86_liveops_seasonal_event_hot_config_and_feature_flag_matrix"]
        self.assertEqual(d86["score"], 100.0)
        self.assertEqual(d86["verified"], 15)
        self.assertEqual(d86["target"], 15)
        self.assertTrue(d86["ui_wired"])

        sectors = atlas["navmesh_obstacle_sectors"]
        self.assertEqual(len(sectors), 16)
        for s in sectors:
            self.assertGreaterEqual(s["recast_cell_size_m"], 0.15)
            self.assertLessEqual(s["recast_cell_size_m"], 0.35)
            self.assertGreaterEqual(s["agent_step_height_m"], 0.40)
            self.assertLessEqual(s["agent_step_height_m"], 0.75)
            self.assertGreaterEqual(s["agent_max_slope_deg"], 38.0)
            self.assertLessEqual(s["agent_max_slope_deg"], 55.0)
            self.assertGreaterEqual(s["dynamic_obstacle_count"], 2)
            self.assertLessEqual(s["dynamic_obstacle_count"], 18)
            self.assertGreaterEqual(s["raycast_los_budget_us"], 45)
            self.assertLessEqual(s["raycast_los_budget_us"], 220)

        flags = atlas["liveops_event_flag_nodes"]
        self.assertEqual(len(flags), 15)
        for f in flags:
            self.assertTrue(
                f["flag_key"].startswith(("liveops.festival.", "liveops.rates.", "liveops.canary.")),
                f"Unexpected flag_key prefix: {f['flag_key']}",
            )
            self.assertGreaterEqual(f["rollout_pct"], 10)
            self.assertLessEqual(f["rollout_pct"], 100)
            self.assertGreaterEqual(f["exp_sp_multiplier"], 1.0)
            self.assertLessEqual(f["exp_sp_multiplier"], 2.5)
            self.assertGreaterEqual(f["drop_spoil_multiplier"], 1.0)
            self.assertLessEqual(f["drop_spoil_multiplier"], 2.0)
            self.assertGreaterEqual(f["zero_restart_propagation_ms"], 12)
            self.assertLessEqual(f["zero_restart_propagation_ms"], 85)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas86DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 86)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 86)
        self.assertIn("86-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave42_cinematic_camera_rails_and_client_gpu_vram_budgets(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["cinematicCameraRailsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["clientGpuVramBudgetsCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "CINEMATIC_CAMERA_RAILS",
            "CLIENT_GPU_BUDGETS",
            "ATLAS_CINEMATIC_RAILS_MODE",
            "ATLAS_GPU_BUDGET_MODE",
            "setAtlasCinematicRailsMode",
            "setAtlasGpuBudgetMode",
            "selectCinematicCameraRail",
            "selectClientGpuBudget",
            "renderAtlasCinematicCameraRailsBarHtml",
            "renderAtlasClientGpuBudgetsBarHtml",
            "studioCinematicRailsOverlay",
            "studioClientGpuBudgetOverlay",
            "🎬 Cutscene Camera Rails (16)",
            "🖥️ GPU & VRAM Budgets (15)",
            "88-Dimension Semantic-Zoom Atlas Score",
            "D1–D88 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 42 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 88)

        d87 = audit["dimensions"]["D87_in_game_cutscene_camera_rail_and_boss_intro_cinematic_matrix"]
        self.assertEqual(d87["score"], 100.0)
        self.assertEqual(d87["verified"], 16)
        self.assertEqual(d87["target"], 16)
        self.assertTrue(d87["ui_wired"])

        d88 = audit["dimensions"]["D88_client_gpu_frame_time_draw_call_instancing_and_vram_budget_matrix"]
        self.assertEqual(d88["score"], 100.0)
        self.assertEqual(d88["verified"], 15)
        self.assertEqual(d88["target"], 15)
        self.assertTrue(d88["ui_wired"])

        rails = atlas["cinematic_camera_rails"]
        self.assertEqual(len(rails), 16)
        for r in rails:
            self.assertIn(
                r["cinematic_category"],
                {
                    "Raid Boss Awakening Intro",
                    "Town First-Arrival Flythrough",
                    "Main Quest Story Revelation",
                    "Castle Siege Breach Sequence",
                },
            )
            self.assertGreaterEqual(r["spline_keyframe_count"], 6)
            self.assertLessEqual(r["spline_keyframe_count"], 28)
            self.assertGreaterEqual(r["duration_sec"], 6.5)
            self.assertLessEqual(r["duration_sec"], 24.0)
            self.assertIn(r["fov_curve_deg"], {"35->55", "45->70", "60->40", "50->65"})
            self.assertIn(r["letterbox_aspect"], {"2.39:1 Anamorphic", "2.00:1 Univisium", "1.85:1 Flat"})
            self.assertIn(
                r["skippable_party_vote"],
                {
                    "Instant Solo Skip",
                    "Party Majority Vote >= 60%",
                    "First-Kill Mandatory Then Auto-Skip",
                },
            )
            self.assertGreaterEqual(r["audio_ducking_db"], -12.0)
            self.assertLessEqual(r["audio_ducking_db"], -6.0)

        budgets = atlas["client_gpu_vram_budgets"]
        self.assertEqual(len(budgets), 15)
        for b in budgets:
            self.assertIn(
                b["profile_tier"],
                {
                    "200-Player Siege Ultra Crowd",
                    "150-Merchant Town Market",
                    "Dense Foliage & Water Shader Hub",
                    "Volumetric Lava & Particle Sanctuary",
                },
            )
            self.assertGreaterEqual(b["max_draw_calls_per_frame"], 450)
            self.assertLessEqual(b["max_draw_calls_per_frame"], 1400)
            self.assertGreaterEqual(b["multimesh_instanced_props"], 120)
            self.assertLessEqual(b["multimesh_instanced_props"], 850)
            self.assertGreaterEqual(b["vram_pool_cap_mb"], 512)
            self.assertLessEqual(b["vram_pool_cap_mb"], 1536)
            self.assertGreaterEqual(b["target_frame_time_ms"], 8.3)
            self.assertLessEqual(b["target_frame_time_ms"], 16.6)
            self.assertIn(
                b["occlusion_culling_mode"],
                {
                    "Rasterizer Portal + HZ-Buffer",
                    "PVS Baked Cell Matrix",
                    "Distance + Frustum Cone",
                },
            )
            self.assertGreaterEqual(b["shader_uber_variants"], 12)
            self.assertLessEqual(b["shader_uber_variants"], 48)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas88DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 88)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 88)
        self.assertIn("88-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave43_automated_qa_smoke_suites_and_studio_90d_master_ledger(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["automatedQaSmokeSuitesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["studio90dMasterLedgerCount"], 22)

        html = web.INDEX_HTML
        for token in (
            "AUTOMATED_QA_SUITES",
            "STUDIO_90D_LEDGER",
            "ATLAS_QA_SUITES_MODE",
            "ATLAS_STUDIO_90D_MODE",
            "setAtlasQaSuitesMode",
            "setAtlasStudio90dMode",
            "selectAutomatedQaSuite",
            "selectStudio90dLedger",
            "renderAtlasAutomatedQaSuitesBarHtml",
            "renderAtlasStudio90dLedgerBarHtml",
            "studioAutomatedQaSuitesOverlay",
            "studio90dMasterLedgerOverlay",
            "🧪 Headless QA Suites (16)",
            "🏆 90D Master Ledger (22)",
            "90-Dimension Semantic-Zoom Atlas Score",
            "D1–D90 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 43 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 90)

        d89 = audit["dimensions"]["D89_automated_headless_qa_playtest_and_golden_snapshot_suites"]
        self.assertEqual(d89["score"], 100.0)
        self.assertEqual(d89["verified"], 16)
        self.assertEqual(d89["target"], 16)
        self.assertTrue(d89["ui_wired"])

        d90 = audit["dimensions"]["D90_two_ring_11_role_studio_90d_master_signoff_ledger"]
        self.assertEqual(d90["score"], 100.0)
        self.assertEqual(d90["verified"], 22)
        self.assertEqual(d90["target"], 22)
        self.assertTrue(d90["ui_wired"])

        suites = atlas["automated_qa_smoke_suites"]
        self.assertEqual(len(suites), 16)
        for s in suites:
            self.assertIn(
                s["suite_category"],
                {
                    "CI Pre-Merge Headless Playtest",
                    "Nightly Golden-Frame Visual Diff",
                    "Economy & Escrow Invariant Fuzzing",
                    "Raid & Siege Deterministic Stress",
                },
            )
            self.assertGreaterEqual(s["headless_bot_agents"], 4)
            self.assertLessEqual(s["headless_bot_agents"], 200)
            self.assertGreaterEqual(s["target_duration_sec"], 15)
            self.assertLessEqual(s["target_duration_sec"], 180)
            self.assertGreaterEqual(s["invariant_assertions_count"], 18)
            self.assertLessEqual(s["invariant_assertions_count"], 120)
            self.assertGreaterEqual(s["golden_snapshot_tolerance_pct"], 0.0)
            self.assertLessEqual(s["golden_snapshot_tolerance_pct"], 0.25)
            self.assertTrue(s["ci_gate_blocking"])

        ledger = atlas["studio_90d_master_ledger"]
        self.assertEqual(len(ledger), 22)
        seen_roles: dict[str, int] = {}
        for l_row in ledger:
            self.assertIn(l_row["ring"], {"Ring A: Creative Council", "Ring B: Platform & Tools Squad"})
            self.assertIn(
                l_row["stage_domain"],
                {
                    "[Stage 1: Content & World]",
                    "[Stage 2: Asset & Build Pipeline]",
                    "[Stage 3: Server & Simulation]",
                    "[Stage 4: LiveOps & GM]",
                },
            )
            self.assertEqual(l_row["signoff_status"], "APPROVED_90D_GOLD")
            rname = l_row["role_name"]
            seen_roles[rname] = seen_roles.get(rname, 0) + 1
        self.assertEqual(len(seen_roles), 11)
        for rname, cnt in seen_roles.items():
            self.assertEqual(cnt, 2, f"Expected 2 90D ledger records for role {rname}, got {cnt}")

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas90DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 90)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 90)
        self.assertIn("90-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave44_faction_dispositions_and_cross_realm_auction_escrows(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["factionReputationDispositionsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["crossRealmAuctionEscrowsCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "FACTION_DISPOSITIONS",
            "CROSS_REALM_ESCROWS",
            "ATLAS_FACTION_DISPOSITION_MODE",
            "ATLAS_AUCTION_ESCROW_MODE",
            "setAtlasFactionDispositionMode",
            "setAtlasAuctionEscrowMode",
            "selectFactionDisposition",
            "selectCrossRealmEscrow",
            "renderAtlasFactionDispositionBarHtml",
            "renderAtlasAuctionEscrowBarHtml",
            "studioFactionDispositionOverlay",
            "studioCrossRealmEscrowOverlay",
            "🤝 Faction Disposition (16)",
            "⚖️ Auction Escrow (15)",
            "92-Dimension Semantic-Zoom Atlas Score",
            "D1–D92 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 44 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 92)

        d91 = audit["dimensions"]["D91_dynamic_faction_reputation_npc_disposition_and_guard_hostility_matrix"]
        self.assertEqual(d91["score"], 100.0)
        self.assertEqual(d91["verified"], 16)
        self.assertEqual(d91["target"], 16)
        self.assertTrue(d91["ui_wired"])

        d92 = audit["dimensions"]["D92_cross_realm_auction_house_escrow_and_circuit_breaker_matrix"]
        self.assertEqual(d92["score"], 100.0)
        self.assertEqual(d92["verified"], 15)
        self.assertEqual(d92["target"], 15)
        self.assertTrue(d92["ui_wired"])

        dispositions = atlas["faction_reputation_dispositions"]
        self.assertEqual(len(dispositions), 16)
        for d_row in dispositions:
            self.assertIn(
                d_row["faction_category"],
                {
                    "Mutual-Exclusivity Tribal War",
                    "Progressive Zone Unlock Trust",
                    "Chaotic PK Guard Kill-On-Sight",
                    "Guild Trade Tax Discount Standing",
                },
            )
            self.assertIn(
                d_row["standing_tiers"],
                {
                    "Stage -5 Hostile .. +5 Exalted",
                    "Alliance Level 1..5",
                    "Caravan Trust Lv.1..11",
                },
            )
            self.assertGreaterEqual(d_row["shop_tax_modifier_pct"], -15.0)
            self.assertLessEqual(d_row["shop_tax_modifier_pct"], 25.0)
            self.assertGreaterEqual(d_row["guard_aggro_radius_m"], 0.0)
            self.assertLessEqual(d_row["guard_aggro_radius_m"], 35.0)
            self.assertGreaterEqual(d_row["quest_unlock_count"], 3)
            self.assertLessEqual(d_row["quest_unlock_count"], 14)

        escrows = atlas["cross_realm_auction_escrows"]
        self.assertEqual(len(escrows), 15)
        for e_row in escrows:
            self.assertIn(
                e_row["market_tier"],
                {
                    "Continental Central Clearinghouse",
                    "Regional Craft & Material Hub",
                    "Starter Town Micro-Consignment",
                    "Frontier Raid Spoil Exchange",
                },
            )
            self.assertIn(
                e_row["settlement_protocol"],
                {
                    "2PC Postgres Serializable + Redis Stream",
                    "Optimistic CAS Ledger Lock",
                    "Atomic Escrow Mail Delivery",
                },
            )
            self.assertGreaterEqual(e_row["listing_fee_bps"], 50)
            self.assertLessEqual(e_row["listing_fee_bps"], 300)
            self.assertGreaterEqual(e_row["sales_tax_sink_bps"], 150)
            self.assertLessEqual(e_row["sales_tax_sink_bps"], 600)
            self.assertGreaterEqual(e_row["price_circuit_breaker_pct"], 35.0)
            self.assertLessEqual(e_row["price_circuit_breaker_pct"], 85.0)
            self.assertGreaterEqual(e_row["max_concurrent_orders"], 2500)
            self.assertLessEqual(e_row["max_concurrent_orders"], 50000)
            self.assertGreaterEqual(e_row["settlement_p99_ms"], 8.5)
            self.assertLessEqual(e_row["settlement_p99_ms"], 42.0)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas92DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 92)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 92)
        self.assertIn("92-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave45_world_invasion_incursions_and_clan_treasury_ledgers(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["worldInvasionIncursionsCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["clanTreasuryPayrollLedgersCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "WORLD_INVASION_INCURSIONS",
            "CLAN_TREASURY_LEDGERS",
            "ATLAS_WORLD_INCURSION_MODE",
            "ATLAS_CLAN_TREASURY_MODE",
            "setAtlasWorldIncursionMode",
            "setAtlasClanTreasuryMode",
            "selectWorldInvasionIncursion",
            "selectClanTreasuryLedger",
            "renderAtlasWorldIncursionBarHtml",
            "renderAtlasClanTreasuryBarHtml",
            "studioWorldIncursionOverlay",
            "studioClanTreasuryOverlay",
            "☄️ World Incursions (16)",
            "🏦 Clan Treasury & Payroll (15)",
            "94-Dimension Semantic-Zoom Atlas Score",
            "D1–D94 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 45 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 94)

        d93 = audit["dimensions"]["D93_dynamic_world_boss_invasion_rift_incursion_and_public_quest_matrix"]
        self.assertEqual(d93["score"], 100.0)
        self.assertEqual(d93["verified"], 16)
        self.assertEqual(d93["target"], 16)
        self.assertTrue(d93["ui_wired"])

        d94 = audit["dimensions"]["D94_clan_treasury_ledger_mercenary_payroll_and_tax_dividend_matrix"]
        self.assertEqual(d94["score"], 100.0)
        self.assertEqual(d94["verified"], 15)
        self.assertEqual(d94["target"], 15)
        self.assertTrue(d94["ui_wired"])

        incursions = atlas["world_invasion_incursions"]
        self.assertEqual(len(incursions), 16)
        for i_row in incursions:
            self.assertIn(
                i_row["incursion_category"],
                {
                    "3-Phase Zone Public Quest",
                    "Roaming World-Boss Vanguard",
                    "Town Perimeter Defense Event",
                    "Abyssal Rift Sky-Tear",
                },
            )
            self.assertEqual(
                i_row["phase_progression"],
                "Phase 1 Scout Waves -> Phase 2 Obelisk Siege -> Phase 3 Commander Spawn",
            )
            self.assertGreaterEqual(i_row["min_participating_players"], 15)
            self.assertLessEqual(i_row["min_participating_players"], 120)
            self.assertEqual(
                i_row["contribution_scoring_rule"],
                "DPS + Healing + CC + Revive Weighted Ledger",
            )
            self.assertIn(
                i_row["dynamic_skybox_override"],
                {
                    "Blood-Moon Crimson Fog",
                    "Abyssal Violet Eclipse",
                    "Volcanic Ash & Ember Storm",
                    "Arcane Golden Aurora",
                },
            )
            self.assertEqual(
                i_row["reward_chest_tiers"],
                "Bronze / Silver / Gold / Sovereign Mythic",
            )

        ledgers = atlas["clan_treasury_payroll_ledgers"]
        self.assertEqual(len(ledgers), 15)
        for l_row in ledgers:
            self.assertIn(
                l_row["treasury_tier"],
                {
                    "Sovereign Castle Tax Vault",
                    "Fortress & Territory Mercenary Escrow",
                    "Clan Hall Auction & Upkeep Ledger",
                    "Starter Academy Stipend Pool",
                },
            )
            self.assertIn(
                l_row["multisig_withdrawal_policy"],
                {
                    "Sovereign + 2 Royal Guards 2-of-3",
                    "Clan Leader + Vice-Leader Dual Sign",
                    "Automated Post-Siege Smart Split",
                },
            )
            self.assertEqual(
                l_row["mercenary_payout_formula"],
                "Kill/Assist + Gate-Damage + Ward-Hold Share",
            )
            self.assertGreaterEqual(l_row["weekly_tax_yield_adena_m"], 25)
            self.assertLessEqual(l_row["weekly_tax_yield_adena_m"], 1850)
            self.assertGreaterEqual(l_row["audit_trail_retention_days"], 90)
            self.assertLessEqual(l_row["audit_trail_retention_days"], 365)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas94DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 94)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 94)
        self.assertIn("94-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave46_player_housing_estates_and_global_cdn_webrtc_relays(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["playerHousingTrophyEstatesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["globalCdnWebrtcRelaysCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "PLAYER_HOUSING_ESTATES",
            "GLOBAL_CDN_RELAYS",
            "ATLAS_HOUSING_ESTATES_MODE",
            "ATLAS_CDN_WEBRTC_MODE",
            "setAtlasHousingEstatesMode",
            "setAtlasCdnWebrtcMode",
            "selectPlayerHousingEstate",
            "selectGlobalCdnRelay",
            "renderAtlasHousingEstatesBarHtml",
            "renderAtlasCdnWebrtcBarHtml",
            "studioPlayerHousingEstateOverlay",
            "studioGlobalCdnRelayOverlay",
            "🏡 Housing & Trophies (16)",
            "🌐 CDN & Voice SFU (15)",
            "96-Dimension Semantic-Zoom Atlas Score",
            "D1–D96 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 46 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 96)

        d95 = audit["dimensions"]["D95_player_housing_citadel_customization_and_boss_trophy_matrix"]
        self.assertEqual(d95["score"], 100.0)
        self.assertEqual(d95["verified"], 16)
        self.assertEqual(d95["target"], 16)
        self.assertTrue(d95["ui_wired"])

        d96 = audit["dimensions"]["D96_global_cdn_anycast_ddos_and_spatial_webrtc_voice_relay_matrix"]
        self.assertEqual(d96["score"], 100.0)
        self.assertEqual(d96["verified"], 15)
        self.assertEqual(d96["target"], 15)
        self.assertTrue(d96["ui_wired"])

        estates = atlas["player_housing_trophy_estates"]
        self.assertEqual(len(estates), 16)
        for e_row in estates:
            self.assertIn(
                e_row["estate_category"],
                {
                    "Solo Instanced Homestead",
                    "Guild Shared Trophy Gallery",
                    "Sovereign Noble Villa",
                    "Master Crafter Workshop",
                },
            )
            self.assertGreaterEqual(e_row["furniture_slot_cap"], 60)
            self.assertLessEqual(e_row["furniture_slot_cap"], 320)
            self.assertGreaterEqual(e_row["boss_trophy_pedestals"], 2)
            self.assertLessEqual(e_row["boss_trophy_pedestals"], 16)
            self.assertGreaterEqual(e_row["rested_vitality_regen_bonus_pct"], 15.0)
            self.assertLessEqual(e_row["rested_vitality_regen_bonus_pct"], 50.0)
            self.assertEqual(
                e_row["crafting_station_tier"],
                "Lv.1 Basic Workbench .. Lv.5 Masterwork Soul-Anvil",
            )
            self.assertGreaterEqual(e_row["weekly_upkeep_adena_k"], 25)
            self.assertLessEqual(e_row["weekly_upkeep_adena_k"], 2500)

        relays = atlas["global_cdn_webrtc_relays"]
        self.assertEqual(len(relays), 15)
        for r_row in relays:
            self.assertIn(
                r_row["pop_region"],
                {
                    "AP-Southeast-Bangkok",
                    "AP-Northeast-Tokyo",
                    "AP-Northeast-Seoul",
                    "AP-Southeast-Singapore",
                    "EU-Central-Frankfurt",
                    "US-West-Oregon",
                    "US-East-Virginia",
                },
            )
            self.assertIn(
                r_row["edge_service_tier"],
                {
                    "Anycast L4/L7 DDoS Scrubber",
                    "Spatial 3D Proximity Voice SFU",
                    "200-v-200 Siege Command Channel Audio",
                    "Delta-Patch Pak CDN Edge Cache",
                },
            )
            self.assertGreaterEqual(r_row["target_rtt_p95_ms"], 14.0)
            self.assertLessEqual(r_row["target_rtt_p95_ms"], 58.0)
            self.assertGreaterEqual(r_row["ddos_scrubbing_capacity_tbps"], 1.5)
            self.assertLessEqual(r_row["ddos_scrubbing_capacity_tbps"], 12.0)
            self.assertGreaterEqual(r_row["webrtc_opus_bitrate_kbps"], 24)
            self.assertLessEqual(r_row["webrtc_opus_bitrate_kbps"], 64)
            self.assertGreaterEqual(r_row["max_voice_room_peers"], 50)
            self.assertLessEqual(r_row["max_voice_room_peers"], 400)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas96DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 96)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 96)
        self.assertIn("96-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave47_caravan_trade_routes_and_localization_voiceover_banks(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["caravanTradeRoutesCount"], 16)
        self.assertEqual(report["summary"]["tShapedAtlasSummary"]["localizationVoiceoverBanksCount"], 15)

        html = web.INDEX_HTML
        for token in (
            "CARAVAN_TRADE_ROUTES",
            "LOCALIZATION_VO_BANKS",
            "ATLAS_CARAVAN_ROUTES_MODE",
            "ATLAS_LOCALIZATION_VO_MODE",
            "setAtlasCaravanRoutesMode",
            "setAtlasLocalizationVoMode",
            "selectCaravanTradeRoute",
            "selectLocalizationVoBank",
            "renderAtlasCaravanRoutesBarHtml",
            "renderAtlasLocalizationVoBarHtml",
            "studioCaravanTradeRoutesOverlay",
            "studioLocalizationVoBanksOverlay",
            "🐪 Caravan Trade (16)",
            "🎙️ VO & Lip-Sync (15)",
            "98-Dimension Semantic-Zoom Atlas Score",
            "D1–D98 Verified",
        ):
            self.assertIn(token, html, f"Missing Wave 47 token {token} in INDEX_HTML")

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.audit_world_atlas(whc, atlas)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 98)

        d97 = audit["dimensions"]["D97_dynamic_caravan_trade_routes_bandit_ambush_and_arbitrage_matrix"]
        self.assertEqual(d97["score"], 100.0)
        self.assertEqual(d97["verified"], 16)
        self.assertEqual(d97["target"], 16)
        self.assertTrue(d97["ui_wired"])

        d98 = audit["dimensions"]["D98_automated_localization_voiceover_lipsync_and_subtitle_matrix"]
        self.assertEqual(d98["score"], 100.0)
        self.assertEqual(d98["verified"], 15)
        self.assertEqual(d98["target"], 15)
        self.assertTrue(d98["ui_wired"])

        routes = atlas["caravan_trade_routes"]
        self.assertEqual(len(routes), 16)
        for c_row in routes:
            self.assertIn(
                c_row["route_category"],
                {
                    "Armored Bullion Wagon",
                    "Pack-Strider Express",
                    "Smuggler Night-Run",
                    "Airship Bulk Charter",
                },
            )
            self.assertIn(
                c_row["specialty_commodity"],
                {
                    "Mithril Ingot Crates",
                    "Dragonbone Relics",
                    "Elven Starlight Elixir",
                    "Volcanic Sulfur Barrels",
                    "Ancient Adena Bullion",
                },
            )
            self.assertEqual(c_row["bandit_ambush_tier"], "Low Risk 1-Star .. Extreme Risk 5-Star")
            self.assertGreaterEqual(c_row["escort_guard_slots"], 2)
            self.assertLessEqual(c_row["escort_guard_slots"], 12)
            self.assertGreaterEqual(c_row["arbitrage_margin_pct"], 18.0)
            self.assertLessEqual(c_row["arbitrage_margin_pct"], 65.0)
            self.assertGreaterEqual(c_row["transit_duration_min"], 8)
            self.assertLessEqual(c_row["transit_duration_min"], 35)

        vo_banks = atlas["localization_voiceover_banks"]
        self.assertEqual(len(vo_banks), 15)
        for v_row in vo_banks:
            self.assertIn(
                v_row["dialect_register"],
                {
                    "Royal High Aden Court",
                    "Archaic Elven Lyric",
                    "Dwarven Forge Guild Slang",
                    "Frontier Harbor Maritime",
                    "Sacred Temple Liturgical",
                },
            )
            self.assertEqual(v_row["supported_locales"], ["en-US", "th-TH", "ja-JP", "ko-KR"])
            self.assertGreaterEqual(v_row["voiced_line_count"], 180)
            self.assertLessEqual(v_row["voiced_line_count"], 950)
            self.assertIn(
                v_row["lipsync_viseme_solver"],
                {
                    "15-Viseme Oculus + Jaw-Bone Curve",
                    "22-Phoneme Facial BlendShape",
                    "Real-Time Opus Envelope Follower",
                },
            )
            self.assertEqual(v_row["thai_line_break_validator"], "ICU Dictionary + Zero-Orphan Rule Pass")
            self.assertGreaterEqual(v_row["opus_bank_size_mb"], 12.5)
            self.assertLessEqual(v_row["opus_bank_size_mb"], 68.0)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas98DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 98)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 98)
        self.assertIn("98-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave48_hot_reload_bridges_and_centennial_100d_studio_charters(self) -> None:
        """Wave 48 (D99 & D100): Verify 16 Cross-Tool Hot-Reload Bridges and 22 100D Centennial Studio Charters."""
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        t_summary = report["summary"]["tShapedAtlasSummary"]
        self.assertEqual(t_summary["crossToolHotReloadBridgesCount"], 16)
        self.assertEqual(t_summary["centennial100dStudioChartersCount"], 22)

        index_html = web.INDEX_HTML
        for token in (
            "CROSS_TOOL_BRIDGES",
            "ATLAS_HOT_RELOAD_BRIDGE_MODE",
            "setAtlasHotReloadBridgeMode",
            "selectCrossToolBridge",
            "renderAtlasHotReloadBridgeBarHtml",
            "studioCrossToolBridgesOverlay",
            "CENTENNIAL_100D_CHARTERS",
            "ATLAS_CENTENNIAL_100D_MODE",
            "setAtlasCentennial100dMode",
            "selectCentennial100dCharter",
            "renderAtlasCentennial100dBarHtml",
            "studioCentennial100dChartersOverlay",
            "⚡ Hot-Reload Bridges (16)",
            "👑 100D Centennial Charter (22)",
            "100-Dimension Semantic-Zoom Atlas Score",
            "D1–D100 Verified",
        ):
            self.assertIn(token, index_html)

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.evaluate_80d_atlas(whc, atlas)
        self.assertGreaterEqual(audit["wave"], 48)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 100)

        d99 = audit["dimensions"]["D99_cross_tool_hot_reload_websocket_bus_and_godot_live_sync_matrix"]
        self.assertEqual(d99["score"], 100.0)
        self.assertEqual(d99["verified"], 16)
        self.assertEqual(d99["target"], 16)
        self.assertTrue(d99["ui_wired"])

        d100 = audit["dimensions"]["D100_centennial_100d_two_ring_studio_grand_charter_and_tour_matrix"]
        self.assertEqual(d100["score"], 100.0)
        self.assertEqual(d100["verified"], 22)
        self.assertEqual(d100["target"], 22)
        self.assertTrue(d100["ui_wired"])

        bridges = atlas["cross_tool_hot_reload_bridges"]
        self.assertEqual(len(bridges), 16)
        expected_channels = {
            "Web-to-Godot @tool Scene Live-Patch",
            "Web-to-Rust SpatialGrid Spawner Hot-Swap",
            "Web-to-Postgres JSONB Schema Atomic Commit",
            "Web-to-Redis LiveOps PubSub Broadcast",
        }
        seen_channels = set()
        for b_row in bridges:
            self.assertIn(b_row["bridge_channel"], expected_channels)
            seen_channels.add(b_row["bridge_channel"])
            self.assertTrue(str(b_row["websocket_topic"]).startswith("ws://studio-bus/hot-reload/"))
            self.assertGreaterEqual(b_row["command_journal_depth"], 50)
            self.assertLessEqual(b_row["command_journal_depth"], 200)
            self.assertGreaterEqual(b_row["roundtrip_sync_p99_ms"], 12.0)
            self.assertLessEqual(b_row["roundtrip_sync_p99_ms"], 48.0)
            self.assertEqual(b_row["conflict_resolution_mode"], "SHA-256 OCC Precondition + CRDT Field Merge")
            self.assertEqual(b_row["auto_ci_drift_gate"], "GOV-01..GOV-10 Pre-Commit Pass")
        self.assertEqual(seen_channels, expected_channels)

        charters = atlas["centennial_100d_studio_charters"]
        self.assertEqual(len(charters), 22)
        expected_rings = {
            "Ring A: Creative Council",
            "Ring B: Platform & Tools Squad",
        }
        expected_roles = {
            "Product Owner",
            "Game Designer Lead",
            "Player Growth Path Designer",
            "Game Story Designer",
            "Monster & Mob Designer",
            "Lead Systems & Map Architect",
            "Lead Tools & Pipeline Architect",
            "Content & World Tools Engineer",
            "Technical Artist (Pipeline & DCC)",
            "Backend Simulation & Infra Tools Engineer",
            "LiveOps, Build & GM Tools Engineer",
        }
        expected_stages = {
            "[Stage 1: Content & World]",
            "[Stage 2: Asset & Build Pipeline]",
            "[Stage 3: Server & Simulation]",
            "[Stage 4: LiveOps & GM]",
        }
        seen_rings = set()
        seen_roles = set()
        seen_stages = set()
        for c_row in charters:
            self.assertIn(c_row["ring"], expected_rings)
            seen_rings.add(c_row["ring"])
            self.assertIn(c_row["role_name"], expected_roles)
            seen_roles.add(c_row["role_name"])
            self.assertIn(c_row["stage_domain"], expected_stages)
            seen_stages.add(c_row["stage_domain"])
            self.assertTrue(c_row["centennial_dimension_span"])
            self.assertGreaterEqual(c_row["camera_zoom_preset"], 1.5)
            self.assertLessEqual(c_row["camera_zoom_preset"], 9.5)
            self.assertTrue(c_row["golden_invariant_proof"])
            self.assertEqual(c_row["charter_status"], "APPROVED_100D_CENTENNIAL_PLATINUM")
        self.assertEqual(seen_rings, expected_rings)
        self.assertEqual(seen_roles, expected_roles)
        self.assertEqual(seen_stages, expected_stages)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas100DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 100)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 100)
        self.assertIn("Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave49_nocturnal_weather_spawns_and_deterministic_combat_replays(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        t_summary = report["summary"]["tShapedAtlasSummary"]
        self.assertEqual(t_summary["nocturnalWeatherAffixSpawnsCount"], 16)
        self.assertEqual(t_summary["deterministicCombatReplaysCount"], 15)

        index_html = web.INDEX_HTML
        for token in (
            "ATLAS_NOCTURNAL_AFFIX_MODE",
            "NOCTURNAL_AFFIX_SPAWNS",
            "setAtlasNocturnalAffixMode",
            "selectNocturnalAffixSpawn",
            "renderAtlasNocturnalAffixBarHtml",
            "studioNocturnalAffixSpawnsOverlay",
            "ATLAS_COMBAT_REPLAY_MODE",
            "DETERMINISTIC_COMBAT_REPLAYS",
            "setAtlasCombatReplayMode",
            "selectDeterministicCombatReplay",
            "renderAtlasCombatReplayBarHtml",
            "studioDeterministicCombatReplaysOverlay",
            "🌑 Nocturnal &amp; Weather Spawns (16)",
            "📼 Combat Replay Verifier (15)",
            "102-Dimension Semantic-Zoom Atlas Score",
            "D1–D102 Verified",
        ):
            self.assertIn(token, index_html)

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.evaluate_80d_atlas(whc, atlas)
        self.assertGreaterEqual(audit["wave"], 49)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 102)

        d101 = audit["dimensions"]["D101_nocturnal_weather_triggered_rare_spawns_and_eclipse_affix_matrix"]
        self.assertEqual(d101["score"], 100.0)
        self.assertEqual(d101["verified"], 16)
        self.assertEqual(d101["target"], 16)
        self.assertTrue(d101["ui_wired"])

        d102 = audit["dimensions"]["D102_deterministic_combat_replay_verifier_and_blake3_tick_hash_matrix"]
        self.assertEqual(d102["score"], 100.0)
        self.assertEqual(d102["verified"], 15)
        self.assertEqual(d102["target"], 15)
        self.assertTrue(d102["ui_wired"])

        spawns = atlas["nocturnal_weather_affix_spawns"]
        self.assertEqual(len(spawns), 16)
        expected_triggers = {
            "Midnight 00:00-04:00 Game-Time + Blood Fog",
            "Thunderstorm + Barometric Drop",
            "Full Moon + Zero Torchlight Radius",
            "Volcanic Ashfall + Magma Surge",
        }
        expected_mutations = {
            "Nocturnal Frenzy +35% ASPD",
            "Storm-Charged Chain Lightning Aura",
            "Eclipse Shadow-Cloak True-Sight Required",
            "Frostbite Armor-Shatter Pulse",
        }
        expected_reagents = {
            "Moonshadow Essence",
            "Stormforged Dragon Scale",
            "Abyssal Eclipse Shard",
            "Crystallized Blizzard Core",
        }
        seen_triggers = set()
        seen_mutations = set()
        seen_reagents = set()
        for s_row in spawns:
            self.assertIn(s_row["trigger_condition"], expected_triggers)
            seen_triggers.add(s_row["trigger_condition"])
            self.assertIn(s_row["affix_mutation_tier"], expected_mutations)
            seen_mutations.add(s_row["affix_mutation_tier"])
            self.assertIn(s_row["exclusive_reagent_drop"], expected_reagents)
            seen_reagents.add(s_row["exclusive_reagent_drop"])
            self.assertGreaterEqual(s_row["spawn_window_min"], 15)
            self.assertLessEqual(s_row["spawn_window_min"], 45)
            self.assertGreaterEqual(s_row["recommended_party_size"], 4)
            self.assertLessEqual(s_row["recommended_party_size"], 18)
        self.assertEqual(seen_triggers, expected_triggers)
        self.assertEqual(seen_mutations, expected_mutations)
        self.assertEqual(seen_reagents, expected_reagents)

        replays = atlas["deterministic_combat_replays"]
        self.assertEqual(len(replays), 15)
        expected_scopes = {
            "Olympiad 1v1 Frame-Exact Audit",
            "200v200 Castle Siege Tick Hash-Chain",
            "Epic Raid Boss First-Kill Proof",
            "High-Value PK Drop Desync Forensics",
        }
        seen_scopes = set()
        for r_row in replays:
            self.assertIn(r_row["verification_scope"], expected_scopes)
            seen_scopes.add(r_row["verification_scope"])
            self.assertGreaterEqual(r_row["tick_rate_hz"], 20)
            self.assertLessEqual(r_row["tick_rate_hz"], 60)
            self.assertEqual(r_row["hash_chain_algorithm"], "BLAKE3-256 Incremental State Merkle Tree")
            self.assertEqual(r_row["prng_seed_discipline"], "ChaCha12 Deterministic Per-Entity Stream")
            self.assertGreaterEqual(r_row["max_rewind_window_sec"], 30)
            self.assertLessEqual(r_row["max_rewind_window_sec"], 600)
            self.assertGreaterEqual(r_row["replay_compression_kbps"], 18.0)
            self.assertLessEqual(r_row["replay_compression_kbps"], 95.0)
            self.assertEqual(r_row["desync_auto_halt_policy"], "Freeze Loot + Snapshot Memory Dump + GM Alert")
        self.assertEqual(seen_scopes, expected_scopes)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas102DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 102)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 102)
        self.assertIn("102-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave50_archaeological_codices_and_destructible_physics_biomes(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        t_summary = report["summary"]["tShapedAtlasSummary"]
        self.assertEqual(t_summary["archaeologicalLoreCodicesCount"], 16)
        self.assertEqual(t_summary["destructiblePhysicsBiomesCount"], 15)

        index_html = web.INDEX_HTML
        for token in (
            "ATLAS_LORE_CODEX_MODE",
            "ARCHAEOLOGICAL_CODICES",
            "setAtlasLoreCodexMode",
            "selectArchaeologicalCodex",
            "renderAtlasLoreCodexBarHtml",
            "studioArchaeologicalLoreCodicesOverlay",
            "ATLAS_PHYSICS_BIOME_MODE",
            "DESTRUCTIBLE_PHYSICS_BIOMES",
            "setAtlasPhysicsBiomeMode",
            "selectDestructiblePhysicsBiome",
            "renderAtlasPhysicsBiomeBarHtml",
            "studioDestructiblePhysicsBiomesOverlay",
            "🏺 Lore &amp; Relics (16)",
            "🌊 Physics &amp; Wind (15)",
            "104-Dimension Semantic-Zoom Atlas Score",
            "D1–D104 Verified",
        ):
            self.assertIn(token, index_html)

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.evaluate_80d_atlas(whc, atlas)
        self.assertGreaterEqual(audit["wave"], 50)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertGreaterEqual(len(audit["dimensions"]), 104)

        d103 = audit["dimensions"]["D103_archaeological_relic_excavation_lore_codex_and_bestiary_matrix"]
        self.assertEqual(d103["score"], 100.0)
        self.assertEqual(d103["verified"], 16)
        self.assertEqual(d103["target"], 16)
        self.assertTrue(d103["ui_wired"])

        d104 = audit["dimensions"]["D104_procedural_foliage_wind_water_ripple_and_destructible_physics_matrix"]
        self.assertEqual(d104["score"], 100.0)
        self.assertEqual(d104["verified"], 15)
        self.assertEqual(d104["target"], 15)
        self.assertTrue(d104["ui_wired"])

        codices = atlas["archaeological_lore_codices"]
        self.assertEqual(len(codices), 16)
        expected_categories = {
            "Giant's Era Technological Blueprint",
            "Elmoreden Imperial Chronicle",
            "Bestiary Anatomy & Weakness Compendium",
            "Primordial God Fragment Excavation",
        }
        expected_bonuses = {
            "+2% Giant/Automaton DMG",
            "+3% Undead/Demon Mitigation",
            "+5% Spoil/Herb Discovery Rate",
            "+15 Max Weight & Inventory Slot",
        }
        seen_categories = set()
        seen_bonuses = set()
        for c_row in codices:
            self.assertIn(c_row["codex_category"], expected_categories)
            seen_categories.add(c_row["codex_category"])
            self.assertIn(c_row["account_wide_passive_bonus"], expected_bonuses)
            seen_bonuses.add(c_row["account_wide_passive_bonus"])
            self.assertEqual(c_row["decipher_skill_check"], "Archaeology Lv.1..Lv.10 + Dwarven/Elven Lexicon")
            self.assertGreaterEqual(c_row["excavation_fragments_required"], 5)
            self.assertLessEqual(c_row["excavation_fragments_required"], 25)
            self.assertGreaterEqual(c_row["voiced_audiobook_duration_sec"], 45)
            self.assertLessEqual(c_row["voiced_audiobook_duration_sec"], 210)
        self.assertEqual(seen_categories, expected_categories)
        self.assertEqual(seen_bonuses, expected_bonuses)

        biomes = atlas["destructible_physics_biomes"]
        self.assertEqual(len(biomes), 15)
        expected_tiers = {
            "Voronoi Siege Wall Fracture",
            "Vertex-Shader Wind & Grass Bend Field",
            "SWE Shallow-Water Wake & Splash Solver",
            "Shockwave Prop Scatter & Debris Pool",
        }
        expected_resolutions = {"256x256", "512x512", "1024x1024"}
        seen_tiers = set()
        seen_resolutions = set()
        for b_row in biomes:
            self.assertIn(b_row["physics_interaction_tier"], expected_tiers)
            seen_tiers.add(b_row["physics_interaction_tier"])
            self.assertIn(b_row["water_ripple_rt_resolution"], expected_resolutions)
            seen_resolutions.add(b_row["water_ripple_rt_resolution"])
            self.assertGreaterEqual(b_row["jolt_physics_rigidbodies_cap"], 64)
            self.assertLessEqual(b_row["jolt_physics_rigidbodies_cap"], 512)
            self.assertGreaterEqual(b_row["foliage_wind_octave_layers"], 2)
            self.assertLessEqual(b_row["foliage_wind_octave_layers"], 4)
            self.assertGreaterEqual(b_row["debris_despawn_fade_sec"], 4.5)
            self.assertLessEqual(b_row["debris_despawn_fade_sec"], 18.0)
            self.assertGreaterEqual(b_row["cpu_physics_step_budget_ms"], 0.8)
            self.assertLessEqual(b_row["cpu_physics_step_budget_ms"], 2.4)
        self.assertEqual(seen_tiers, expected_tiers)
        self.assertEqual(seen_resolutions, expected_resolutions)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas104DimensionScore"], 100.0)
        self.assertGreaterEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 104)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertGreaterEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 104)
        self.assertIn("104-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])

    def test_dedicated_world_atlas_wave51_bounty_manhunt_contracts_and_disaster_recovery_pitr_drills(self) -> None:
        from scripts import catalog_explorer_web as web
        from scripts import run_atlas_iteration_loop as loop
        from scripts import studio_world_governance as gov

        errors, report = gov.validate_world_governance()
        self.assertEqual(errors, [], f"Governance validation failed: {errors}")
        t_summary = report["summary"]["tShapedAtlasSummary"]
        self.assertEqual(t_summary["bountyManhuntContractsCount"], 16)
        self.assertEqual(t_summary["disasterRecoveryPitrDrillsCount"], 15)

        index_html = web.INDEX_HTML
        for token in (
            "ATLAS_BOUNTY_MANHUNT_MODE",
            "BOUNTY_MANHUNT_CONTRACTS",
            "setAtlasBountyManhuntMode",
            "selectBountyManhuntContract",
            "renderAtlasBountyManhuntBarHtml",
            "studioBountyManhuntContractsOverlay",
            "ATLAS_PITR_CHAOS_MODE",
            "DISASTER_RECOVERY_DRILLS",
            "setAtlasPitrChaosMode",
            "selectDisasterRecoveryDrill",
            "renderAtlasPitrChaosBarHtml",
            "studioDisasterRecoveryDrillsOverlay",
            "🎯 Bounty &amp; PK Manhunt (16)",
            "🛡️ PITR &amp; Chaos Drills (15)",
            "106-Dimension Semantic-Zoom Atlas Score",
            "D1–D106 Verified",
        ):
            self.assertIn(token, index_html)

        bundle = web.load_studio_perspectives_bundle()
        whc = bundle["worldHistoryAndConcept"]
        atlas = bundle["tShapedWorldAtlas"]
        audit = loop.evaluate_80d_atlas(whc, atlas)
        self.assertEqual(audit["wave"], 51)
        self.assertEqual(audit["overall_score"], 100.0)
        self.assertEqual(len(audit["dimensions"]), 106)

        d105 = audit["dimensions"]["D105_dynamic_bounty_hunter_contracts_and_chaotic_pk_manhunt_matrix"]
        self.assertEqual(d105["score"], 100.0)
        self.assertEqual(d105["verified"], 16)
        self.assertEqual(d105["target"], 16)
        self.assertTrue(d105["ui_wired"])

        d106 = audit["dimensions"]["D106_distributed_world_state_pitr_backup_and_chaos_drill_matrix"]
        self.assertEqual(d106["score"], 100.0)
        self.assertEqual(d106["verified"], 15)
        self.assertEqual(d106["target"], 15)
        self.assertTrue(d106["ui_wired"])

        bounties = atlas["bounty_manhunt_contracts"]
        self.assertEqual(len(bounties), 16)
        expected_bounty_categories = {
            "Chaotic Player PK Warrant",
            "Named Bandit Captain Assassination",
            "Caravan Hijacker Interdiction",
            "Wandering World-Outlaw Posse Hunt",
        }
        seen_bounty_categories = set()
        for b_row in bounties:
            self.assertIn(b_row["contract_category"], expected_bounty_categories)
            seen_bounty_categories.add(b_row["contract_category"])
            self.assertEqual(
                b_row["anti_collusion_guard"],
                "Zero-Clan/Ally Payout + 72h Kill-Cooldown + Gear-Drop Escrow",
            )
            self.assertEqual(b_row["hunter_rank_tier"], "Bronze Tracker .. Sovereign Executioner")
            self.assertGreaterEqual(b_row["karma_threshold_min"], 500)
            self.assertLessEqual(b_row["karma_threshold_min"], 25000)
            self.assertGreaterEqual(b_row["compass_tracking_pulse_sec"], 5)
            self.assertLessEqual(b_row["compass_tracking_pulse_sec"], 30)
            self.assertGreaterEqual(b_row["escrow_reward_adena_k"], 150)
            self.assertLessEqual(b_row["escrow_reward_adena_k"], 15000)
        self.assertEqual(seen_bounty_categories, expected_bounty_categories)

        drills = atlas["disaster_recovery_pitr_drills"]
        self.assertEqual(len(drills), 15)
        expected_faults = {
            "Primary Postgres Node Kill During Siege",
            "Redis Cluster Split-Brain Partition",
            "Region AZ Blackhole Failover",
            "Corrupted Loot-Table Hot-Config Rollback",
        }
        seen_faults = set()
        for d_row in drills:
            self.assertIn(d_row["chaos_fault_scenario"], expected_faults)
            seen_faults.add(d_row["chaos_fault_scenario"])
            self.assertEqual(
                d_row["wal_archive_backend"],
                "pgBackRest S3 Object-Lock + Zstd Continuous WAL",
            )
            self.assertEqual(
                d_row["merkle_inventory_reconcile"],
                "100% Zero-Dupe / Zero-Vanish Invariant Pass",
            )
            self.assertEqual(
                d_row["chaos_schedule_cadence"],
                "Weekly Automated GameDay Drill",
            )
            self.assertGreaterEqual(d_row["rpo_zero_data_loss_ms"], 0)
            self.assertLessEqual(d_row["rpo_zero_data_loss_ms"], 50)
            self.assertGreaterEqual(d_row["rto_automated_failover_sec"], 2.5)
            self.assertLessEqual(d_row["rto_automated_failover_sec"], 14.0)
        self.assertEqual(seen_faults, expected_faults)

        self_eval = web.compute_studio_self_evaluation()
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlas106DimensionScore"], 100.0)
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 106)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 106)
        self.assertIn("106-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])


if __name__ == "__main__":
    unittest.main()
