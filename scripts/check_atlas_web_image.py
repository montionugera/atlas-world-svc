#!/usr/bin/env python3
"""Fail the image build when the catalog would be empty, a mount is missing or the art is LFS pointers.

build_catalog_db.py skips missing inputs and exits 0, so nothing else stops a hollow image.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

from atlas_world_web.static_mounts import MOUNT_DIRS, MOUNT_FILES

ROOT = Path(os.environ.get("ATLAS_WEB_IMAGE_ROOT") or Path(__file__).resolve().parent.parent)
# Gitignored, so no commit can hold it. Forge shows its missing-render notice instead.
ABSENT_MOUNTS = frozenset({"atelier/art-forge/out"})
REQUIRED = (
    "contracts/content/jobs.json",
    "contracts/content/items.json",
    "contracts/content/mobs.json",
    "content/world/fabric/world.json",
    "content/world/premises",
    "content/dungeons/_compiled_catalog.json",
    "content/bestiary/bestiary.json",
    "content/maps",
    "content/studio",
    "content/concept-art/images",
    "game-client/assets/manifest.json",
    "game-client/assets/.thumbs",
)
CORE_TABLES = ("world_continents", "v_mob_economy")
LFS_MAGIC = b"version https://git-lfs"


def mount_problems() -> list[str]:
    return [
        f"missing mount: {m}"
        for m in (*MOUNT_DIRS, *MOUNT_FILES)
        if m not in ABSENT_MOUNTS and not (ROOT / m).exists()
    ]


def report(problems: list[str]) -> int:
    for line in problems[:40]:
        print(f"[atlas-web-image] {line}", file=sys.stderr)
    print(f"[atlas-web-image] {len(problems)} problem(s)")
    return 1 if problems else 0


def main(argv: list[str]) -> int:
    if "--list-mounts" in argv:
        print(json.dumps({"dirs": MOUNT_DIRS, "files": MOUNT_FILES, "absent": sorted(ABSENT_MOUNTS)}))
        return 0
    if "--mounts-only" in argv:  # test hook: skips the catalog and LFS checks
        return report(mount_problems())
    problems = [f"missing input: {p}" for p in REQUIRED if not (ROOT / p).exists()]
    problems += mount_problems()
    conn = sqlite3.connect(f"file:{ROOT / 'build/catalog.sqlite'}?mode=ro", uri=True)
    for table in CORE_TABLES:
        count = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        if count == 0:
            problems.append(f"empty: {table}")
    conn.close()
    for path in ROOT.rglob("*"):
        if path.is_file() and path.stat().st_size < 200 and path.relative_to(ROOT).parts[0] != "build":
            with open(path, "rb") as fh:
                if fh.read(len(LFS_MAGIC)) == LFS_MAGIC:
                    problems.append(f"LFS pointer: {path.relative_to(ROOT)}")
    return report(problems)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
