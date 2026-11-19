#!/usr/bin/env python3
"""Safe, dry-run-by-default audit script for Godot 4.7 asset imports in game-client/assets/.

Checks:
  1. Lossless texture imports (`compress/mode=0` vs VRAM-compressed `compress/mode=2`),
     separating 3D/world texture folders from 2D/UI/concept-art folders, and checking
     `mipmaps/generate` on 3D textures.
  2. Missing `.import` sidecars for importable assets (`.glb`, `.png`, `.jpg`, `.jpeg`,
     `.webp`, `.svg`, `.ogg`, `.mp3`) and missing/non-standard Godot 4.7 `.glb.import` params.
  3. Size and resolution budget violations against `atelier/asset-forge/forge.config.json`
     caps (default: 2,936,012 B character GLB, 3,145,728 B non-character GLB,
     1,048,576 B image file size, 1024 px max PNG dimension).

Read-only / dry-run by default: never mutates any file on disk.
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

IMPORTABLE_EXTENSIONS = frozenset({
    ".glb",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
    ".ogg",
    ".mp3",
})
IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".svg"})

# Subdirectories under game-client/assets/ containing 3D mesh/world textures where
# VRAM compression (compress/mode=2) + mipmaps are expected.
WORLD_3D_DIRS = frozenset({
    "characters",
    "creatures",
    "dungeon",
    "env",
    "loot",
    "models",
    "nature",
    "vfx",
    "weapons",
})

# Subdirectories under game-client/assets/ containing 2D UI / concept art / icons
# where lossless compress/mode=0 is often intentional.
UI_2D_DIRS = frozenset({"art", "icons", "ui"})

# Expected Godot 4.7 .glb.import baseline params observed across game-client/assets/.
EXPECTED_GLB_PARAMS = {
    "gltf/embedded_image_handling": "1",
    "meshes/generate_lods": "true",
    "meshes/ensure_tangents": "true",
    "meshes/create_shadow_meshes": "true",
    "nodes/apply_root_scale": "true",
}

DEFAULT_CHAR_GLB_MAX_BYTES = 2_936_012  # atelier/asset-forge/forge.config.json pipelineCharacter.maxBytes
DEFAULT_ENV_GLB_MAX_BYTES = 3_145_728   # 3.00 MiB general GLB budget ceiling
DEFAULT_IMAGE_MAX_BYTES = 1_048_576     # 1.00 MiB raw image budget ceiling
DEFAULT_MAX_TEXTURE_DIM = 1024          # atelier/asset-forge/forge.config.json maxTextureSize

_PARAM_RE = re.compile(r"^([A-Za-z0-9_./-]+)=(.*)$")


@dataclass
class AuditConfig:
    assets_dir: Path
    char_glb_max_bytes: int = DEFAULT_CHAR_GLB_MAX_BYTES
    env_glb_max_bytes: int = DEFAULT_ENV_GLB_MAX_BYTES
    image_max_bytes: int = DEFAULT_IMAGE_MAX_BYTES
    max_texture_dim: int = DEFAULT_MAX_TEXTURE_DIM
    include_hidden: bool = False
    dry_run: bool = True


@dataclass
class AuditReport:
    assets_dir: str
    dry_run: bool
    total_assets_scanned: int = 0
    hidden_files_skipped: int = 0
    asset_counts_by_ext: dict[str, int] = field(default_factory=dict)
    image_compress_modes: dict[str, int] = field(default_factory=dict)
    lossless_images_total: int = 0
    lossless_3d_textures: list[str] = field(default_factory=list)
    lossless_2d_or_other_textures: list[str] = field(default_factory=list)
    vram_compressed_textures: list[str] = field(default_factory=list)
    missing_mipmaps_3d: list[str] = field(default_factory=list)
    missing_import_sidecars: list[str] = field(default_factory=list)
    glb_param_mismatches: list[dict[str, str]] = field(default_factory=list)
    glb_size_violations: list[dict[str, object]] = field(default_factory=list)
    image_size_violations: list[dict[str, object]] = field(default_factory=list)
    texture_dim_violations: list[dict[str, object]] = field(default_factory=list)

    def has_violations(self) -> bool:
        return bool(
            self.lossless_3d_textures
            or self.missing_import_sidecars
            or self.glb_param_mismatches
            or self.glb_size_violations
            or self.image_size_violations
            or self.texture_dim_violations
        )


def parse_import_params(import_path: Path) -> dict[str, str]:
    """Parse key=value pairs from the [params] section of a Godot .import file."""
    params: dict[str, str] = {}
    in_params = False
    try:
        text = import_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return params

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith(";"):
            continue
        if line.startswith("[") and line.endswith("]"):
            in_params = line == "[params]"
            continue
        if in_params:
            match = _PARAM_RE.match(line)
            if match:
                params[match.group(1)] = match.group(2).strip()
    return params


def read_png_dimensions(png_path: Path) -> tuple[int, int] | None:
    """Read (width, height) from a PNG IHDR chunk using stdlib only."""
    try:
        with png_path.open("rb") as fh:
            header = fh.read(24)
    except OSError:
        return None
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def is_hidden_relative(rel_path: Path) -> bool:
    return any(part.startswith(".") for part in rel_path.parts)


def classify_top_dir(rel_path: Path) -> str:
    return rel_path.parts[0] if len(rel_path.parts) > 1 else ""


def audit_assets(config: AuditConfig) -> AuditReport:
    assets_dir = config.assets_dir.resolve()
    if not assets_dir.is_dir():
        raise FileNotFoundError(f"Assets directory not found: {assets_dir}")

    report = AuditReport(assets_dir=str(assets_dir), dry_run=config.dry_run)
    ext_counter: Counter[str] = Counter()
    compress_counter: Counter[str] = Counter()

    all_files = sorted(p for p in assets_dir.rglob("*") if p.is_file())
    for path in all_files:
        rel = path.relative_to(assets_dir)
        if not config.include_hidden and is_hidden_relative(rel):
            report.hidden_files_skipped += 1
            continue

        if path.name.endswith(".import"):
            continue

        ext = path.suffix.lower()
        if ext not in IMPORTABLE_EXTENSIONS:
            continue

        report.total_assets_scanned += 1
        ext_counter[ext] += 1
        rel_str = rel.as_posix()
        top_dir = classify_top_dir(rel)
        import_path = path.with_name(path.name + ".import")

        if not import_path.is_file():
            report.missing_import_sidecars.append(rel_str)
            params: dict[str, str] = {}
        else:
            params = parse_import_params(import_path)

        size_bytes = path.stat().st_size

        if ext == ".glb":
            limit = (
                config.char_glb_max_bytes
                if top_dir in {"characters", "creatures"}
                else config.env_glb_max_bytes
            )
            if size_bytes > limit:
                report.glb_size_violations.append({
                    "path": rel_str,
                    "bytes": size_bytes,
                    "limit_bytes": limit,
                    "bucket": "character" if top_dir in {"characters", "creatures"} else "env_or_prop",
                })
            if params:
                for key, expected in EXPECTED_GLB_PARAMS.items():
                    actual = params.get(key)
                    if actual is not None and actual != expected:
                        report.glb_param_mismatches.append({
                            "path": rel_str,
                            "param": key,
                            "actual": actual,
                            "expected": expected,
                        })

        if ext in IMAGE_EXTENSIONS:
            if size_bytes > config.image_max_bytes:
                report.image_size_violations.append({
                    "path": rel_str,
                    "bytes": size_bytes,
                    "limit_bytes": config.image_max_bytes,
                })

            if ext == ".png" and top_dir in WORLD_3D_DIRS:
                dims = read_png_dimensions(path)
                if dims is not None and max(dims) > config.max_texture_dim:
                    report.texture_dim_violations.append({
                        "path": rel_str,
                        "width": dims[0],
                        "height": dims[1],
                        "limit_px": config.max_texture_dim,
                    })

            if params:
                mode = params.get("compress/mode", "unknown")
                compress_counter[f"{ext}:mode={mode}"] += 1
                if mode == "0":
                    report.lossless_images_total += 1
                    if top_dir in WORLD_3D_DIRS:
                        report.lossless_3d_textures.append(rel_str)
                    else:
                        report.lossless_2d_or_other_textures.append(rel_str)
                elif mode == "2":
                    report.vram_compressed_textures.append(rel_str)

                if top_dir in WORLD_3D_DIRS and params.get("mipmaps/generate") == "false":
                    report.missing_mipmaps_3d.append(rel_str)

    report.asset_counts_by_ext = dict(sorted(ext_counter.items()))
    report.image_compress_modes = dict(sorted(compress_counter.items()))
    report.glb_size_violations.sort(key=lambda item: int(item["bytes"]), reverse=True)
    report.image_size_violations.sort(key=lambda item: int(item["bytes"]), reverse=True)
    return report


def format_text_report(report: AuditReport, max_samples: int = 10) -> str:
    lines: list[str] = []
    mode_label = "DRY-RUN (read-only)" if report.dry_run else "AUDIT"
    lines.append(f"Godot Asset Import Audit [{mode_label}]")
    lines.append(f"Assets dir: {report.assets_dir}")
    lines.append(
        f"Scanned: {report.total_assets_scanned} importable assets "
        f"(skipped {report.hidden_files_skipped} hidden files)"
    )
    ext_summary = ", ".join(f"{ext}={count}" for ext, count in report.asset_counts_by_ext.items())
    lines.append(f"By extension: {ext_summary or 'none'}")
    lines.append("")

    lines.append("1. Texture Compression (compress/mode)")
    comp_summary = ", ".join(f"{k}:{v}" for k, v in report.image_compress_modes.items())
    lines.append(f"   Breakdown: {comp_summary or 'none'}")
    lines.append(
        f"   Lossless (mode=0): {report.lossless_images_total} total "
        f"({len(report.lossless_3d_textures)} in 3D/world dirs, "
        f"{len(report.lossless_2d_or_other_textures)} in 2D/UI/other dirs)"
    )
    lines.append(f"   VRAM compressed (mode=2): {len(report.vram_compressed_textures)}")
    lines.append(f"   3D textures with mipmaps/generate=false: {len(report.missing_mipmaps_3d)}")
    if report.lossless_3d_textures:
        lines.append(f"   Sample 3D lossless textures (first {min(max_samples, len(report.lossless_3d_textures))}):")
        for item in report.lossless_3d_textures[:max_samples]:
            lines.append(f"     - {item}")

    lines.append("")
    lines.append(f"2. Missing .import Sidecars: {len(report.missing_import_sidecars)}")
    for item in report.missing_import_sidecars[:max_samples]:
        lines.append(f"   - {item}")

    lines.append("")
    lines.append(f"3. GLB Import Parameter Mismatches: {len(report.glb_param_mismatches)}")
    for item in report.glb_param_mismatches[:max_samples]:
        lines.append(
            f"   - {item['path']}: {item['param']}={item['actual']} (expected {item['expected']})"
        )

    lines.append("")
    lines.append(f"4. Size & Resolution Budget Violations")
    lines.append(f"   GLB byte violations: {len(report.glb_size_violations)}")
    for item in report.glb_size_violations[:max_samples]:
        mb = int(item["bytes"]) / (1024 * 1024)
        lim_mb = int(item["limit_bytes"]) / (1024 * 1024)
        lines.append(
            f"   - {item['path']} ({item['bucket']}): {item['bytes']:,} B ({mb:.2f} MiB) > {item['limit_bytes']:,} B ({lim_mb:.2f} MiB)"
        )
    lines.append(f"   Image byte violations: {len(report.image_size_violations)}")
    for item in report.image_size_violations[:max_samples]:
        mb = int(item["bytes"]) / (1024 * 1024)
        lines.append(f"   - {item['path']}: {item['bytes']:,} B ({mb:.2f} MiB) > {item['limit_bytes']:,} B")
    lines.append(f"   3D PNG dimension violations (> maxTextureSize): {len(report.texture_dim_violations)}")
    for item in report.texture_dim_violations[:max_samples]:
        lines.append(
            f"   - {item['path']}: {item['width']}x{item['height']} px > {item['limit_px']} px"
        )

    return "\n".join(lines)


def default_assets_dir() -> Path:
    # .agents/skills/godot-asset-integration/scripts/audit_godot_imports.py -> repo root is 4 parents up
    repo_root = Path(__file__).resolve().parents[4]
    candidate = repo_root / "game-client" / "assets"
    if candidate.is_dir():
        return candidate
    return Path("game-client/assets")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit Godot 4.7 asset .import files and budgets under game-client/assets/ (dry-run by default)."
    )
    parser.add_argument(
        "--assets-dir",
        type=Path,
        default=default_assets_dir(),
        help="Path to Godot assets directory (default: game-client/assets).",
    )
    parser.add_argument(
        "--char-glb-max-bytes",
        type=int,
        default=DEFAULT_CHAR_GLB_MAX_BYTES,
        help=f"Max bytes for character/creature GLBs (default: {DEFAULT_CHAR_GLB_MAX_BYTES}).",
    )
    parser.add_argument(
        "--env-glb-max-bytes",
        type=int,
        default=DEFAULT_ENV_GLB_MAX_BYTES,
        help=f"Max bytes for non-character GLBs (default: {DEFAULT_ENV_GLB_MAX_BYTES}).",
    )
    parser.add_argument(
        "--image-max-bytes",
        type=int,
        default=DEFAULT_IMAGE_MAX_BYTES,
        help=f"Max bytes for image files (default: {DEFAULT_IMAGE_MAX_BYTES}).",
    )
    parser.add_argument(
        "--max-texture-dim",
        type=int,
        default=DEFAULT_MAX_TEXTURE_DIM,
        help=f"Max width/height in pixels for 3D PNG textures (default: {DEFAULT_MAX_TEXTURE_DIM}).",
    )
    parser.add_argument(
        "--include-hidden",
        action="store_true",
        help="Also scan hidden directories such as .thumbs/.",
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        default=10,
        help="Maximum sample paths to print per category in text output (default: 10).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of text.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit 1 if any violations are found (default: exit 0 for reporting).",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    config = AuditConfig(
        assets_dir=args.assets_dir,
        char_glb_max_bytes=args.char_glb_max_bytes,
        env_glb_max_bytes=args.env_glb_max_bytes,
        image_max_bytes=args.image_max_bytes,
        max_texture_dim=args.max_texture_dim,
        include_hidden=args.include_hidden,
        dry_run=True,
    )
    try:
        report = audit_assets(config)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    else:
        print(format_text_report(report, max_samples=args.max_samples))

    if args.strict and report.has_violations():
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
