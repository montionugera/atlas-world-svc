#!/usr/bin/env python3
"""
Downloads a curated, tagged Mixamo Animation Library (Female & Male, Idle / Walk / Walk-Start / Run)
into ~/asset-studio-private/atlas-3d-plan/clipsets/mixamo_library/ with a structured catalog.json.

Each clip is tagged with:
  - slug: canonical clip identifier (e.g. f_idle_weight_shift, f_idle_dwarf_var2, f_walk_start, f_walk_normal)
  - gender: "female" | "male" | "neutral"
  - move_type: "idle" | "walk" | "walk_start" | "run"
  - name: Mixamo title
  - description: Mixamo description
  - product_id: Mixamo UUID
  - inplace: whether exported with inplace=True
  - file: relative path to the exported .fbx
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_OUT_DIR = Path.home() / "asset-studio-private/atlas-3d-plan/clipsets/mixamo_library"
DEFAULT_CHAR_ID = "56255c47-5477-47b6-aecc-186e7956263a"

CLIP_SPECS = [
    # --- FEMALE IDLES (including exact user screenshot picks) ---
    {
        "slug": "f_idle_weight_shift",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9c79c65-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Weight Shift Idle",
    },
    {
        "slug": "f_idle_dwarf_var2",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9cd149c-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Dwarf Idle Var. 2",
    },
    {
        "slug": "f_idle_dwarf_standing",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9cd1193-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Dwarf Standing Idle",
    },
    {
        "slug": "f_idle_dwarf_var1",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9cd13dc-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Dwarf Idle Var. 1",
    },
    {
        "slug": "f_idle_standing",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9c831cf-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Standing Idle",
    },
    {
        "slug": "f_idle_breathing",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9c6d0d5-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Breathing Idle",
    },
    {
        "slug": "f_idle_classic",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9ccf750-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Classic Idle",
    },
    {
        "slug": "f_idle_happy",
        "gender": "female",
        "move_type": "idle",
        "product_id": "c9ccf37e-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Happy Idle",
    },
    # --- FEMALE WALKS (including Female Start Walking from screenshot 3) ---
    {
        "slug": "f_walk_start",
        "gender": "female",
        "move_type": "walk_start",
        "product_id": "c9c68c4c-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Start Walking",
    },
    {
        "slug": "f_walk_normal",
        "gender": "female",
        "move_type": "walk",
        "product_id": "c9c68b91-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Normal Walk",
    },
    {
        "slug": "f_walk_catwalk",
        "gender": "female",
        "move_type": "walk",
        "product_id": "009b2b9b-2974-40f2-8825-feb4db36a6b2",
        "label": "Female Walk Forward",
    },
    {
        "slug": "f_walk_tough",
        "gender": "female",
        "move_type": "walk",
        "product_id": "c9c68eaa-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Tough Walk",
    },
    {
        "slug": "f_walk_standard",
        "gender": "female",
        "move_type": "walk",
        "product_id": "c9ccc2e9-b96c-11e4-a802-0aaa78deedf9",
        "label": "Standard Walk",
    },
    # --- FEMALE RUNS ---
    {
        "slug": "f_run_forward",
        "gender": "female",
        "move_type": "run",
        "product_id": "c9ccfb22-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Run Forward",
    },
    {
        "slug": "f_run_jogging",
        "gender": "female",
        "move_type": "run",
        "product_id": "c9c8707d-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Jogging",
    },
    {
        "slug": "f_run_standard",
        "gender": "female",
        "move_type": "run",
        "product_id": "c9ccc5dd-b96c-11e4-a802-0aaa78deedf9",
        "label": "Standard Run",
    },
    {
        "slug": "f_run_ninja",
        "gender": "female",
        "move_type": "run",
        "product_id": "c9cd1b5d-b96c-11e4-a802-0aaa78deedf9",
        "label": "Female Ninja Run",
    },
    # --- MALE IDLES / WALKS / RUNS ---
    {
        "slug": "m_idle_standing_01",
        "gender": "male",
        "move_type": "idle",
        "product_id": "d787960d-5406-4988-968b-7ade5ac49075",
        "label": "Male Standing Idle 01",
    },
    {
        "slug": "m_idle_standing_02",
        "gender": "male",
        "move_type": "idle",
        "product_id": "c83f15d9-1e31-41c7-a1df-dfd6baa6fb60",
        "label": "Male Standing Idle 02",
    },
    {
        "slug": "m_idle_fitness",
        "gender": "male",
        "move_type": "idle",
        "product_id": "c9cada0b-b96c-11e4-a802-0aaa78deedf9",
        "label": "Male Fitness Breathing Idle",
    },
    {
        "slug": "m_walk_standard",
        "gender": "male",
        "move_type": "walk",
        "product_id": "c9c634c5-b96c-11e4-a802-0aaa78deedf9",
        "label": "Male Standard Walk",
    },
    {
        "slug": "m_walk_forward_03",
        "gender": "male",
        "move_type": "walk",
        "product_id": "b44b1c44-60b8-4021-ba68-3b5e62a43887",
        "label": "Male Walk Forward 03",
    },
    {
        "slug": "m_run_weighted",
        "gender": "male",
        "move_type": "run",
        "product_id": "c9c610bc-b96c-11e4-a802-0aaa78deedf9",
        "label": "Male Weighted Run",
    },
    {
        "slug": "m_run_sword_shield",
        "gender": "male",
        "move_type": "run",
        "product_id": "c9cc4740-b96c-11e4-a802-0aaa78deedf9",
        "label": "Male Sword And Shield Run",
    },
]


def mx_req(token: str, method: str, path: str, body=None):
    cmd = [
        "curl",
        "-s",
        "-X",
        method,
        f"https://www.mixamo.com{path}",
        "-H",
        f"Authorization: Bearer {token}",
        "-H",
        "X-Api-Key: mixamo2",
        "-H",
        "X-Requested-With: XMLHttpRequest",
        "-H",
        "Accept: application/json",
    ]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    out = subprocess.check_output(cmd)
    return json.loads(out.decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token-file", default="/tmp/mixamo_token.txt")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    ap.add_argument("--char-id", default=DEFAULT_CHAR_ID)
    args = ap.parse_args()

    token = Path(args.token_file).read_text().strip()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    catalog = {
        "schema": "atlas-mixamo-library/1",
        "character_id": args.char_id,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "clips": [],
    }

    for spec in CLIP_SPECS:
        slug = spec["slug"]
        gender = spec["gender"]
        move_type = spec["move_type"]
        prod_id = spec["product_id"]
        rel_path = f"{gender}/{move_type}/{slug}.fbx"
        dest_file = out_dir / rel_path
        dest_file.parent.mkdir(parents=True, exist_ok=True)

        prod = mx_req(token, "GET", f"/api/v1/products/{prod_id}?similar=0&character_id={args.char_id}")
        gms = prod["details"]["gms_hash"]
        has_inplace_flag = bool(gms.get("inplace", False)) or any(
            p[0].lower() == "in place" for p in gms.get("params", [])
        )
        gms_export = dict(gms)
        if move_type in ("walk", "run"):
            gms_export["inplace"] = True
        pvals = ",".join(str(int(p[1])) for p in gms.get("params", []))
        gms_export["params"] = pvals
        gms_export["trim"] = [int(gms["trim"][0]), int(gms["trim"][1])]

        if dest_file.is_file() and dest_file.stat().st_size > 10_000:
            print(f"[cached] {slug:24s} -> {rel_path} ({dest_file.stat().st_size} B)")
        else:
            export_body = {
                "gms_hash": [gms_export],
                "preferences": {"format": "fbx7_2019", "skin": "false", "fps": "30", "reducekf": "0"},
                "character_id": args.char_id,
                "type": "Motion",
                "product_name": prod["name"],
            }
            mx_req(token, "POST", "/api/v1/animations/export", export_body)
            dl_url = None
            for _ in range(30):
                time.sleep(0.8)
                mon = mx_req(token, "GET", f"/api/v1/characters/{args.char_id}/monitor")
                st = mon.get("status")
                if st == "completed":
                    dl_url = mon.get("job_result")
                    break
                if st == "failed":
                    raise RuntimeError(f"Mixamo export failed for {slug}: {mon}")
            if not dl_url:
                raise RuntimeError(f"Timed out waiting for Mixamo export of {slug}")
            subprocess.check_call(["curl", "-sL", dl_url, "-o", str(dest_file)])
            print(f"[downloaded] {slug:20s} -> {rel_path} ({dest_file.stat().st_size} B) | {prod['name']} ({prod.get('description')})")

        catalog["clips"].append(
            {
                "slug": slug,
                "label": spec["label"],
                "gender": gender,
                "move_type": move_type,
                "product_id": prod_id,
                "name": prod.get("name"),
                "description": prod.get("description"),
                "inplace": bool(gms_export.get("inplace", False)),
                "support_inplace": has_inplace_flag,
                "file": rel_path,
            }
        )

    catalog_path = out_dir / "catalog.json"
    catalog_path.write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"\nWrote {len(catalog['clips'])} tagged Mixamo clips to {catalog_path}")


if __name__ == "__main__":
    main()
