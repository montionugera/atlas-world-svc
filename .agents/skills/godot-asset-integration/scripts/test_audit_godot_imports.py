#!/usr/bin/env python3
"""Unit tests for audit_godot_imports.py."""

from __future__ import annotations

import json
import struct
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_godot_imports as audit  # noqa: E402


def make_minimal_png(width: int, height: int) -> bytes:
    """Create a minimal valid PNG header + IHDR chunk (enough for dimension parsing)."""
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_len = struct.pack(">I", 13)
    ihdr_type = b"IHDR"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr_crc = b"\x00\x00\x00\x00"
    return sig + ihdr_len + ihdr_type + ihdr_data + ihdr_crc


def write_import(path: Path, params: dict[str, str]) -> None:
    lines = ["[remap]", 'importer="texture"', "", "[params]"]
    for key, value in params.items():
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


class AuditGodotImportsTest(unittest.TestCase):
    def test_detects_lossless_missing_sidecars_and_budget_violations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "characters").mkdir()
            (root / "dungeon").mkdir()
            (root / "icons").mkdir()
            (root / ".thumbs").mkdir()

            # 1. Hidden .thumbs file should be skipped by default
            (root / ".thumbs" / "preview.webp").write_bytes(b"RIFFxxxxWEBP")

            # 2. Lossless 3D texture + oversized PNG dimension (2048x1024) + mipmaps disabled
            lossless_3d = root / "characters" / "hero_albedo.png"
            lossless_3d.write_bytes(make_minimal_png(2048, 1024))
            write_import(
                lossless_3d.with_name(lossless_3d.name + ".import"),
                {"compress/mode": "0", "mipmaps/generate": "false"},
            )

            # 3. Valid VRAM-compressed 3D texture
            vram_3d = root / "dungeon" / "crate_albedo.png"
            vram_3d.write_bytes(make_minimal_png(512, 512))
            write_import(
                vram_3d.with_name(vram_3d.name + ".import"),
                {"compress/mode": "2", "mipmaps/generate": "true"},
            )

            # 4. 2D icon missing .import sidecar
            missing_icon = root / "icons" / "badge.png"
            missing_icon.write_bytes(make_minimal_png(256, 256))

            # 5. Oversized character GLB with a bad glb import param
            big_glb = root / "characters" / "heavy_char.glb"
            big_glb.write_bytes(b"glTF" + b"\x00" * 500)
            write_import(
                big_glb.with_name(big_glb.name + ".import"),
                {
                    "gltf/embedded_image_handling": "1",
                    "meshes/generate_lods": "false",
                    "meshes/ensure_tangents": "true",
                    "meshes/create_shadow_meshes": "true",
                    "nodes/apply_root_scale": "true",
                },
            )

            cfg = audit.AuditConfig(
                assets_dir=root,
                char_glb_max_bytes=200,
                env_glb_max_bytes=300,
                image_max_bytes=100_000,
                max_texture_dim=1024,
            )
            report = audit.audit_assets(cfg)

            self.assertTrue(report.dry_run)
            self.assertEqual(report.hidden_files_skipped, 1)
            self.assertEqual(report.total_assets_scanned, 4)
            self.assertEqual(report.lossless_3d_textures, ["characters/hero_albedo.png"])
            self.assertEqual(report.vram_compressed_textures, ["dungeon/crate_albedo.png"])
            self.assertEqual(report.missing_mipmaps_3d, ["characters/hero_albedo.png"])
            self.assertEqual(report.missing_import_sidecars, ["icons/badge.png"])
            self.assertEqual(len(report.glb_size_violations), 1)
            self.assertEqual(report.glb_size_violations[0]["path"], "characters/heavy_char.glb")
            self.assertEqual(len(report.glb_param_mismatches), 1)
            self.assertEqual(report.glb_param_mismatches[0]["param"], "meshes/generate_lods")
            self.assertEqual(len(report.texture_dim_violations), 1)
            self.assertEqual(report.texture_dim_violations[0]["width"], 2048)
            self.assertTrue(report.has_violations())

    def test_clean_assets_pass_strict_mode_and_json_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "dungeon").mkdir()
            tex = root / "dungeon" / "wall.png"
            tex.write_bytes(make_minimal_png(512, 512))
            write_import(
                tex.with_name(tex.name + ".import"),
                {"compress/mode": "2", "mipmaps/generate": "true"},
            )

            buf = StringIO()
            with patch("sys.stdout", buf):
                rc = audit.main(["--assets-dir", str(root), "--json", "--strict"])

            self.assertEqual(rc, 0)
            payload = json.loads(buf.getvalue())
            self.assertEqual(payload["lossless_images_total"], 0)
            self.assertEqual(payload["missing_import_sidecars"], [])
            self.assertEqual(payload["vram_compressed_textures"], ["dungeon/wall.png"])

    def test_strict_mode_exits_nonzero_on_violation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "icons").mkdir()
            (root / "icons" / "unimported.png").write_bytes(make_minimal_png(64, 64))

            buf = StringIO()
            with patch("sys.stdout", buf):
                rc = audit.main(["--assets-dir", str(root), "--strict"])

            self.assertEqual(rc, 1)
            self.assertIn("Missing .import Sidecars: 1", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
