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
        self.assertEqual(len(audit["dimensions"]), 42)

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
        self.assertEqual(self_eval["qualityScorecard"]["semanticZoomAtlasDimensionsCount"], 42)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["overallScore"], 100.0)
        self.assertEqual(self_eval["atlasIterationTelemetry"]["dimensionsCount"], 42)
        self.assertIn("42-Dimension Semantic-Zoom Atlas Score (100.0/100)", self_eval["atlasIterationTelemetry"]["summaryLabel"])


if __name__ == "__main__":
    unittest.main()
