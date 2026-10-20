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
        self.assertEqual(len(audit["dimensions"]), 22)

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
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 22)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 22)
        self.assertIn("22-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])


if __name__ == "__main__":
    unittest.main()
