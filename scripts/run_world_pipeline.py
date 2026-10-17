#!/usr/bin/env python3
"""
Atlas World — Master World-First Studio Pipeline & Multi-Agent Gatekeeper
(scripts/run_world_pipeline.py)

Executes the deterministic 5-stage Studio Owner loop (Increment -> Validate -> Verify -> Brainstorm):
  Stage 1 [L4 Compiler]  : python3 scripts/compile_world_maps.py (and --check)
                           Compiles L1-L3 World Spine & Bestiary into L4 playable v3 3D Map Blueprints.
  Stage 2 [L0-L3 Gates]  : node scripts/check_content.mjs
                           Enforces Canon, 13-Continent Fabric, Spine DAG, 5-Act Story & Town Plan invariants.
  Stage 3 [Unified DB]   : python3 scripts/build_catalog_db.py
                           Builds build/catalog.sqlite + build/catalog_summary.json & verifies 0 orphan FKs.
  Stage 4 [Observatory]  : python3 scripts/catalog_explorer_web.py --dump-check
                           Verifies Joymify RMS Observatory bundle, 3D thumbnails, and SQLite views.
  Stage 5 [Rust Engine]  : cargo test --manifest-path server-rs/Cargo.toml --lib content::map::tests
                           Verifies authoritative Rust server heightfield & Unified Map v3 loader.

Usage:
  python3 scripts/run_world_pipeline.py [--skip-rust] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "build" / "catalog.sqlite"


def run_step(label: str, cmd: list[str], env: dict[str, str] | None = None) -> dict:
    t0 = time.monotonic()
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env=env or os.environ.copy(),
        capture_output=True,
        text=True,
    )
    elapsed_ms = round((time.monotonic() - t0) * 1000, 1)
    out = (proc.stdout or "") + (proc.stderr or "")
    return {
        "step": label,
        "command": " ".join(cmd),
        "ok": proc.returncode == 0,
        "exitCode": proc.returncode,
        "elapsedMs": elapsed_ms,
        "output": out.strip(),
    }


def audit_cross_layer_coverage() -> dict:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    total_continents = cur.execute("SELECT COUNT(*) FROM world_continents").fetchone()[0]
    continents_with_maps = cur.execute(
        "SELECT COUNT(*) FROM v_world_continent_overview WHERE playable_maps > 0"
    ).fetchone()[0]

    total_surveyed_zones = cur.execute("SELECT COUNT(*) FROM world_zones").fetchone()[0]
    mapped_surveyed_zones = cur.execute(
        "SELECT COUNT(DISTINCT z.id) FROM world_zones z JOIN maps m ON m.zone_id = z.id OR m.id = z.id"
    ).fetchone()[0]

    total_maps = cur.execute("SELECT COUNT(*) FROM maps").fetchone()[0]
    story_regions_total = cur.execute(
        "SELECT COUNT(*) FROM v_story_region_matrix"
    ).fetchone()[0]
    story_regions_with_map = cur.execute(
        "SELECT COUNT(*) FROM v_story_region_matrix WHERE playable_map_ids != ''"
    ).fetchone()[0]
    bestiary_total = cur.execute("SELECT COUNT(*) FROM world_bestiary").fetchone()[0]

    spawned_bestiary_ids = set()
    for row in cur.execute("SELECT raw_json FROM maps").fetchall():
        doc = json.loads(row["raw_json"])
        for sp in doc.get("spawnAreas") or []:
            mt = sp.get("mobType")
            if mt:
                spawned_bestiary_ids.add(mt)

    bestiary_ids = {
        r[0] for r in cur.execute("SELECT id FROM world_bestiary").fetchall()
    }
    bestiary_spawned = len(bestiary_ids & spawned_bestiary_ids)

    # Identify unauthored town plans (pinned towns without plan_path) for the Brainstorm recommender
    unplanned_towns = [
        dict(r)
        for r in cur.execute(
            """
            SELECT id, title, continent_id, rank, landform
            FROM world_places
            WHERE tier = 'pinned' AND kind = 'town' AND (plan_path IS NULL OR plan_path = '')
            ORDER BY continent_id ASC, id ASC
            """
        ).fetchall()
    ]

    conn.close()
    return {
        "playableMapsTotal": total_maps,
        "continentsCovered": f"{continents_with_maps}/{total_continents}",
        "surveyedZonesCompiledToL4Maps": f"{mapped_surveyed_zones}/{total_surveyed_zones}",
        "storyRegionsWithPlayableMap": f"{story_regions_with_map}/{story_regions_total}",
        "bestiaryCreaturesSpawnedOnMaps": f"{bestiary_spawned}/{bestiary_total}",
        "allContinentsCovered": continents_with_maps == total_continents,
        "allSurveyedZonesCompiled": mapped_surveyed_zones == total_surveyed_zones,
        "zeroUnmappedWealdmarchRegions": story_regions_with_map == story_regions_total,
        "zeroUnspawnedBestiaryCreatures": bestiary_spawned == bestiary_total,
        "nextTownPlansQueue": unplanned_towns,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Atlas World Master Studio Pipeline")
    parser.add_argument("--skip-rust", action="store_true", help="Skip cargo test stage")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()

    env = os.environ.copy()
    cargo_bin = str(Path.home() / ".cargo" / "bin")
    if cargo_bin not in env.get("PATH", ""):
        env["PATH"] = f"{cargo_bin}:{env.get('PATH', '')}"

    steps = [
        ("Stage 1a · Compile L4 World-First Maps", [sys.executable, "scripts/compile_world_maps.py"]),
        ("Stage 1b · Verify L4 Map Invariants & Scale Anchor", [sys.executable, "scripts/compile_world_maps.py", "--check"]),
        ("Stage 2 · Verify L0–L3 Canon, Fabric, Spine & Story Gates", ["node", "scripts/check_content.mjs"]),
        ("Stage 3 · Rebuild Unified SQLite + JSONB Catalog", [sys.executable, "scripts/build_catalog_db.py"]),
        ("Stage 4 · Verify Observatory Web Bundle & SQL Views", [sys.executable, "scripts/catalog_explorer_web.py", "--dump-check"]),
    ]
    if not args.skip_rust:
        steps.append(
            (
                "Stage 5 · Verify Authoritative Rust Map & Heightfield Loader",
                ["cargo", "test", "--manifest-path", "server-rs/Cargo.toml", "--lib", "content::map::tests"],
            )
        )

    results = []
    all_ok = True
    for label, cmd in steps:
        res = run_step(label, cmd, env=env)
        results.append(res)
        if not res["ok"]:
            all_ok = False
            break

    coverage = audit_cross_layer_coverage() if all_ok and DB_PATH.exists() else {}
    if coverage and not (
        coverage.get("zeroUnmappedWealdmarchRegions") and coverage.get("zeroUnspawnedBestiaryCreatures")
    ):
        all_ok = False

    report = {
        "ok": all_ok,
        "steps": results,
        "coverageAudit": coverage,
    }

    if args.json:
        print(json.dumps(report, indent=2))
        return 0 if all_ok else 1

    print("=" * 84)
    print("🏛️  ATLAS WORLD — MASTER WORLD-FIRST STUDIO PIPELINE (L0 ➔ L5)")
    print("=" * 84)
    for r in results:
        icon = "✅ PASS" if r["ok"] else "❌ FAIL"
        print(f"{icon} | {r['step']} ({r['elapsedMs']} ms)")
        if r["output"]:
            for line in r["output"].splitlines()[-3:]:
                print(f"       {line}")
    if coverage:
        print("-" * 84)
        print("📊 GLOBAL CROSS-LAYER TRACEABILITY & COVERAGE AUDIT:")
        print(f"   • Total Playable v3 Maps (content/maps/*.json)  : {coverage['playableMapsTotal']}")
        print(f"   • Continents with Playable 3D Maps              : {coverage['continentsCovered']}")
        print(f"   • Surveyed Zones Compiled to L4 Maps            : {coverage['surveyedZonesCompiledToL4Maps']}")
        print(f"   • Story Regions Bound to Playable 3D Maps       : {coverage['storyRegionsWithPlayableMap']}")
        print(f"   • Bestiary Creatures Spawned on Playable Maps   : {coverage['bestiaryCreaturesSpawnedOnMaps']}")
        print("-" * 84)
        print("🧠 MULTI-AGENT BRAINSTORM QUEUE (Next Pinned Towns Ready for L2 Town Plan):")
        for tw in (coverage.get("nextTownPlansQueue") or [])[:5]:
            print(
                f"   ➔ {tw['id']} ({tw['title']} · {tw['continent_id'].upper()} · rank={tw['rank']} · landform={tw['landform']})"
            )
    print("=" * 84)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
