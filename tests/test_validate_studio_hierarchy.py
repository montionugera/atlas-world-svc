"""Unit tests for scripts/validate_studio_hierarchy.py across all 4 levels and INV-01..INV-07."""

from __future__ import annotations

from contextlib import contextmanager
import copy
import json
from pathlib import Path
import shutil
import tempfile
from typing import Callable, Iterator
import unittest

from scripts.validate_studio_hierarchy import (
    DEFAULT_STUDIO_DIR,
    build_runtime_manifest,
    validate_studio_directory,
)


class ValidateStudioHierarchyTests(unittest.TestCase):
    temp_dir: Path
    studio_dir: Path

    @classmethod
    def setUpClass(cls) -> None:
        cls.temp_dir = Path(tempfile.mkdtemp(prefix="studio_hierarchy_test_"))
        cls.studio_dir = cls.temp_dir / "studio"
        shutil.copytree(DEFAULT_STUDIO_DIR, cls.studio_dir)

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    @contextmanager
    def _mutated_files(self, mutations: dict[str, Callable[[dict], None]]) -> Iterator[Path]:
        originals: dict[Path, str] = {}
        try:
            for rel_path, mutator in mutations.items():
                target = self.studio_dir / rel_path
                raw = target.read_text(encoding="utf-8")
                originals[target] = raw
                data = copy.deepcopy(json.loads(raw))
                mutator(data)
                target.write_text(json.dumps(data, indent=2), encoding="utf-8")
            yield self.studio_dir
        finally:
            for target, raw in originals.items():
                target.write_text(raw, encoding="utf-8")

    def test_repository_studio_directory_passes(self) -> None:
        errors = validate_studio_directory(DEFAULT_STUDIO_DIR)
        self.assertEqual(errors, [])

    def test_rejects_missing_core_rationale(self) -> None:
        with self._mutated_files(
            {
                "continents/continent-03-shattered-halo.json": lambda d: d.__setitem__(
                    "core_rationale", "Too short"
                )
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("core_rationale" in err for err in errors),
                f"Expected core_rationale error, got: {errors}",
            )

    def test_rejects_mystery_node_without_mystery_hook(self) -> None:
        with self._mutated_files(
            {
                "districts/continent-01-hearthbloom-basin/district-ginger-steam-terraces.json": lambda d: d.pop(
                    "mystery_hook", None
                )
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("mystery_hook" in err for err in errors),
                f"Expected mystery_hook error, got: {errors}",
            )

    def test_rejects_canon_continent_with_unchecked_quality_checklist(self) -> None:
        with self._mutated_files(
            {
                "continents/continent-01-hearthbloom-basin.json": lambda d: d[
                    "quality_checklist"
                ]["fantasy_and_wonder"].__setitem__("verified", False)
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("quality_checklist.fantasy_and_wonder.verified" in err for err in errors),
                f"Expected checklist verification error, got: {errors}",
            )

    def test_rejects_canon_child_under_draft_parent(self) -> None:
        with self._mutated_files(
            {"world_history_and_concept.json": lambda d: d.__setitem__("status", "draft")}
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("cannot be 'canon' because parent World History" in err for err in errors),
                f"Expected parent status violation, got: {errors}",
            )

    def test_rejects_character_scale_law_violation(self) -> None:
        with self._mutated_files(
            {
                "world_history_and_concept.json": lambda d: d["character_scale_law"][
                    "environment_metrics"
                ].__setitem__("max_grass_height_meters", 0.85)
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("max_grass_height_meters" in err for err in errors),
                f"Expected grass height scale violation, got: {errors}",
            )

    def test_rejects_forbidden_legacy_boilerplate_terms(self) -> None:
        with self._mutated_files(
            {
                "continents/continent-02-clockwork-steppe.json": lambda d: d.__setitem__(
                    "core_rationale", d["core_rationale"] + " Reference to legacy undertow storyline."
                )
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("undertow" in err for err in errors),
                f"Expected forbidden legacy term error, got: {errors}",
            )

    def test_inv02_rejects_duplicate_surface_grid_coordinates(self) -> None:
        with self._mutated_files(
            {
                "districts/continent-01-hearthbloom-basin/district-teacup-meadows.json": lambda d: d[
                    "grid_nodes"
                ][1].__setitem__("grid_coordinates", [1, 1])
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("INV-02 violation" in err for err in errors),
                f"Expected INV-02 violation, got: {errors}",
            )

    def test_inv03_rejects_asymmetric_node_portal(self) -> None:
        with self._mutated_files(
            {
                "nodes/continent-01-hearthbloom-basin/district-teacup-meadows/hunting-area-clover-south-gate.json": lambda d: d[
                    "portals"
                ].__setitem__(
                    "North", None
                )
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("INV-03 violation" in err for err in errors),
                f"Expected INV-03 violation, got: {errors}",
            )

    def test_inv04_rejects_unreachable_canon_node(self) -> None:
        with self._mutated_files(
            {
                "nodes/continent-01-hearthbloom-basin/district-teacup-meadows/town-lantern-hollow.json": lambda d: d[
                    "portals"
                ].__setitem__(
                    "East", None
                ),
                "nodes/continent-01-hearthbloom-basin/district-teacup-meadows/hunting-area-kiln-east-orchard.json": lambda d: d[
                    "portals"
                ].__setitem__(
                    "West", None
                ),
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
            self.assertTrue(
                any("INV-04 violation" in err for err in errors),
                f"Expected INV-04 violation, got: {errors}",
            )

    def test_inv06_rejects_out_of_district_monster_family(self) -> None:
        with self._mutated_files(
            {
                "nodes/continent-01-hearthbloom-basin/district-teacup-meadows/hunting-area-clover-south-gate.json": lambda d: d[
                    "resident_spawns"
                ][
                    0
                ].__setitem__(
                    "family", "undead_demon"
                )
            }
        ) as studio_dir:
            errors = validate_studio_directory(studio_dir)
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
                "ash-valve-vault-b1",
                "ceramic-resonator-crypt-b1",
                "chronometer-foundry-b1",
                "comet-core-geode-b1",
                "counterweight-shaft-b1",
                "ember-bellows-chamber-b1",
                "epicyclic-pinion-vault-b1",
                "faraday-dynamo-vault-b1",
                "invar-balance-vault-b1",
                "inverted-belfry-b1",
                "kiln-cellar-b1",
                "kinetic-ballast-vault-b1",
                "medallion-heart-vault-b1",
                "mercury-reservoir-b1",
                "nectar-glaze-vat-b1",
                "pendulum-sanctum-b1",
                "pendulum-shaft-b1",
                "sap-heart-cistern-b1",
                "shadow-refraction-crypt-b1",
                "spice-kiln-cellar-b1",
                "stalactite-carillon-nave-b1",
                "star-heart-nave-b1",
                "submerged-orrery-keel-b1",
                "sunken-potter-hold-b1",
                "sunken-syzygy-dome-b1",
                "twilight-coral-crypt-b1",
                "vesper-cradle-b1",
                "worm-drive-gearbox-b1",
                "apricot-aqueduct-terrace",
                "astrolabe-rift",
                "aurora-tether",
                "bimetallic-expansion-span",
                "brass-spur-ridge",
                "caldera-rim",
                "celadon-causeway",
                "centrifugal-gantry-span",
                "chime-pipe-colonnade",
                "cinder-apron",
                "cinnamon-bark-viaduct",
                "clover-south-gate",
                "cobalt-sandbar-ford",
                "comet-tether-span",
                "firebrick-duct",
                "flue-causeway",
                "kelp-spiral-reef",
                "kiln-east-orchard",
                "leyden-causeway",
                "metronome-bridge",
                "orrery-bridge",
                "penumbra-refraction-causeway",
                "planetary-carrier-span",
                "resin-arch-tunnel",
                "resonance-tether-causeway",
                "silver-tide-causeway",
                "siphon-sluice",
                "spiral-wormway-ramp",
                "stalactite-plunge",
                "tether-causeway",
                "violet-spectrum-span",
                "aphelion-buoy-haven",
                "aurora-bell-sanctuary",
                "bellows-hearth",
                "bimetallic-chronometer-hub",
                "carillon-hearth-belfry",
                "cinnamon-mill-haven",
                "crown-beacon-citadel",
                "draft-kiln-post",
                "escapement-anvil",
                "flywheel-governor-hub",
                "glaze-barge-quay",
                "helical-torque-hub",
                "inductor-switchyard",
                "kilnwatch-bastion",
                "lantern-hollow",
                "libration-balance-haven",
                "metronome-pivot-citadel",
                "patina-lock",
                "penumbra-prism-haven",
                "perigee-diving-station",
                "pinion-terminus",
                "porcelain-loom-sanctuary",
                "prism-zenith",
                "root-train-roundhouse",
                "saffron-press-village",
                "starfall-haven",
                "torque-balance-citadel",
                "umbrage-focal-sanctum",
                "undertide-sanctuary",
            ],
        )
        fog_portal = manifest["portalRoutingTable"]["portal-lantern-hollow-west-fog"]
        self.assertEqual(fog_portal["gateState"], "fog_of_lore")
        self.assertIsNone(fog_portal["targetMapId"])
        self.assertTrue(len(fog_portal["lockMessage"]) > 15)


if __name__ == "__main__":
    unittest.main()
