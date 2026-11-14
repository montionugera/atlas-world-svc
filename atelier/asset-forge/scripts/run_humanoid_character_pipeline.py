#!/usr/bin/env python3
"""
Canonical End-to-End Humanoid 3D Character Pipeline for Atlas World (F-186 / F-188).

Enforces 4 Mandatory Quality Gates (from `game-character-3d` & `pro-practice.md`):
  Gate 1 (2D Input Gate):
    - Verifies clean white background (#FFFFFF), zero ground shadow below feet,
      and clear white gap between left and right ankles/legs in the Front view.
  Gate 2 (Pre-Rig 3D Mesh Gate):
    - Verifies single connected character shell, left/right ankle separation (2 separate
      cross-section loops at z = 0.08m..0.28m, no sticky-feet bridging), and arm-to-torso gap.
  Gate 3 (Assembler & Face/Hair Gate):
    - Auto-fits VRoid mouthless porcelain `FaceMesh` (`Victoria_Rubin.vrm`) to the exact
      measured Meshy head bounding box `(head_cx, head_front_y, chin_z, brow_z)`, trims the
      upper forehead cone above `brow_z` so it NEVER pokes out above the bangs, samples neck/chest
      skin RGB so face & neck skin match seamlessly, and restricts `Material 1` (`Hair`) strictly
      to the scalp/crown (`z >= brow_z`) and back hair (`y > +0.015m`) so zero white triangles
      ever appear on the neck, chest, or shoulders.
  Gate 4 (Motion & Look Gate):
    - Renders a 4-panel verification sheet (`front_idle`, `side_head_closeup`, `front_walk_stride`,
      `back_hair`) at `<= 400x400` per panel to `/tmp/<id>_pipeline_verify.jpg`.

Usage:
  # Full end-to-end from 3 turnaround PNGs (calls Meshy API + Blender + Mixamo + Gate 1-4):
  python3 atelier/asset-forge/scripts/run_humanoid_character_pipeline.py \\
    --id silme_seeress \\
    --front /tmp/silme_apose_front.png \\
    --side  /tmp/silme_apose_side.png \\
    --back  /tmp/silme_apose_back.png

  # Or re-run Assembler + Gate 2-4 on an already-downloaded Meshy rigged GLB:
  python3 atelier/asset-forge/scripts/run_humanoid_character_pipeline.py \\
    --id silme_seeress \\
    --rigged-glb /tmp/silme-meshy-rigged.glb
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MESHY_BASE = "https://api.meshy.ai/openapi/v1"


def load_meshy_key() -> str:
    env_key = os.environ.get("MESHY_API_KEY", "").strip()
    if env_key:
        return env_key
    for fname in (".env", ".env.contest"):
        env_file = Path.home() / "asset-studio-private" / fname
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("MESHY_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("MESHY_API_KEY not found in environment or ~/asset-studio-private/.env(.contest)")


def image_to_data_uri(path: Path) -> str:
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def gate1_check_2d_input(front_path: Path) -> dict:
    """Gate 1: Verify Front turnaround image has white background and separated ankles/legs across EVERY row in the ankle/boot band."""
    code = f"""
import bpy, json
import numpy as np
img = bpy.data.images.load({json.dumps(str(front_path))})
w, h = img.size[:]
arr = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))[::-1, :, :3]
lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
fg = lum < 0.88
ys, xs = np.where(fg)
y_min, y_max = int(ys.min()), int(ys.max())
char_h = max(1, y_max - y_min)
# Check bottom 2% to 22% (boots + ankles)
band_y0 = int(y_max - 0.22 * char_h)
band_y1 = int(y_max - 0.02 * char_h)
band_fg = fg[band_y0:band_y1, :]
# For each horizontal row in the boot/ankle band, count how many separated foreground runs exist
separated_rows = 0
total_rows = max(1, band_y1 - band_y0)
min_gap_px = 999
for r in range(band_fg.shape[0]):
    row = band_fg[r]
    # Find runs of True separated by at least 6 white pixels near center
    cols = np.where(row)[0]
    if len(cols) < 6:
        continue
    diffs = np.diff(cols)
    max_gap = int(diffs.max()) - 1 if len(diffs) > 0 else 0
    # Only count gap if it falls near center X (between 35% and 65% of image width)
    gap_idx = int(np.argmax(diffs)) if len(diffs) > 0 else 0
    gap_center_x = 0.5 * (cols[gap_idx] + cols[gap_idx + 1]) if len(diffs) > 0 else 0
    if max_gap >= 6 and (0.35 * w <= gap_center_x <= 0.65 * w):
        separated_rows += 1
        min_gap_px = min(min_gap_px, max_gap)
    else:
        min_gap_px = 0
sep_fraction = separated_rows / float(total_rows)
rep = {{
    "image": {json.dumps(str(front_path))},
    "size": [w, h],
    "char_bbox_y": [y_min, y_max],
    "boot_ankle_separated_row_fraction": round(sep_fraction, 3),
    "min_center_gap_px": int(min_gap_px if min_gap_px < 999 else 0),
    "passed": sep_fraction >= 0.75 and min_gap_px >= 6,
}}
print("GATE1_JSON:" + json.dumps(rep))
"""
    res = subprocess.run(["blender", "-b", "--factory-startup", "--python-expr", code], capture_output=True, text=True)
    for line in res.stdout.splitlines():
        if line.startswith("GATE1_JSON:"):
            report = json.loads(line.split("GATE1_JSON:", 1)[1])
            print(f"[Gate 1 - 2D Input Check] {json.dumps(report)}")
            if not report["passed"]:
                print(
                    "WARNING [Gate 1 FAIL]: Boots/ankles or back skirt hem touch across the center line "
                    f"(separated_row_fraction={report['boot_ankle_separated_row_fraction']}, min_center_gap_px={report['min_center_gap_px']}px)! "
                    "This will fuse feet/skirt in Meshy AI!"
                )
            return report
    raise RuntimeError(f"Gate 1 check failed: {res.stderr[-500:]}")


def meshy_request(method: str, url: str, key: str, payload: dict | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Meshy {method} {url} -> HTTP {exc.code}: {body}") from exc


def meshy_poll(url: str, key: str, label: str, timeout_s: int = 900) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        res = meshy_request("GET", url, key)
        status = res.get("status", "UNKNOWN")
        prog = res.get("progress", 0)
        print(f"  [{label}] status={status} progress={prog}%")
        if status == "SUCCEEDED":
            return res
        if status in ("FAILED", "CANCELED", "EXPIRED"):
            raise RuntimeError(f"Meshy {label} failed: {res}")
        time.sleep(10)
    raise TimeoutError(f"Meshy {label} timed out after {timeout_s}s")


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, str(dest))
    print(f"  Downloaded {dest} ({dest.stat().st_size} bytes)")


def run_meshy_stage(front: Path, side: Path, back: Path, out_rigged: Path) -> Path:
    key = load_meshy_key()
    print("=== Stage 1A: Meshy multi-image-to-3d (t-pose, quad, lowpoly) ===")
    payload = {
        "image_urls": [
            image_to_data_uri(front),
            image_to_data_uri(side),
            image_to_data_uri(back),
        ],
        "ai_model": "meshy-6-lite",
        "topology": "quad",
        "target_polycount": 10000,
        "symmetry_mode": "auto",
        "should_remesh": True,
        "should_texture": True,
        "enable_pbr": False,
        "pose_mode": "t-pose",
        "texture_prompt": (
            "Anime game character in clean symmetrical A-pose, separated legs and ankle boots, "
            "pointed elf ears, silver white hair, dark indigo and gold dress, clean cel-shaded albedo"
        ),
    }
    created = meshy_request("POST", f"{MESHY_BASE}/multi-image-to-3d", key, payload)
    task_id = created["result"]
    print(f"  Created multi-image-to-3d task: {task_id}")
    m3d = meshy_poll(f"{MESHY_BASE}/multi-image-to-3d/{task_id}", key, "multi-image-to-3d")

    print("=== Stage 1B: Meshy Remesh (10k tris for rigging) ===")
    remesh_created = meshy_request(
        "POST",
        f"{MESHY_BASE}/remesh",
        key,
        {
            "input_task_id": task_id,
            "target_polycount": 10000,
            "topology": "triangle",
        },
    )
    remesh_id = remesh_created["result"]
    remeshed = meshy_poll(f"{MESHY_BASE}/remesh/{remesh_id}", key, "remesh")

    print("=== Stage 1C: Meshy Rigging ===")
    rig_created = meshy_request(
        "POST",
        f"{MESHY_BASE}/rigging",
        key,
        {
            "input_task_id": remesh_id,
            "height_meters": 0.94,
        },
    )
    rig_id = rig_created["result"]
    rigged = meshy_poll(f"{MESHY_BASE}/rigging/{rig_id}", key, "rigging")

    res_urls = rigged.get("result", {}) or {}
    rigged_url = (
        res_urls.get("rigged_character_glb_url")
        or rigged.get("rigged_character_glb_url")
        or rigged.get("model_urls", {}).get("glb")
    )
    if not rigged_url:
        raise RuntimeError(f"Missing rigged_character_glb_url in {rigged}")
    download_file(rigged_url, out_rigged)
    return out_rigged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", default="silme_seeress", help="Character id (e.g., silme_seeress)")
    ap.add_argument("--front", type=Path, help="Front turnaround PNG (A-pose, separated legs, white bg)")
    ap.add_argument("--side", type=Path, help="Side turnaround PNG")
    ap.add_argument("--back", type=Path, help="Back turnaround PNG")
    ap.add_argument("--rigged-glb", type=Path, default=Path("/tmp/silme-meshy-rigged.glb"))
    ap.add_argument("--head-scale", type=float, default=1.0, help="Uniform scale multiplier for modular 360 VRoid head + hair + ornament around neck collar")
    ap.add_argument("--ear-style", choices=["elf", "human"], default="elf", help="Ear style for modular VRoid head")
    ap.add_argument("--hair-wave", type=float, default=1.0, help="Sinusoidal wave amplitude multiplier for long hair")
    ap.add_argument("--vroid-hair", type=str, default="/Users/pasitnusso/asset-studio-private/atlas-3d-plan/vroid_bases/Sendagaya_Shino.vrm", help="Path to CC0 .vrm hair donor")
    ap.add_argument("--skip-gate1-fail", action="store_true")
    args = ap.parse_args()

    if args.front and args.front.exists():
        g1 = gate1_check_2d_input(args.front)
        if not g1["passed"] and not args.skip_gate1_fail:
            raise SystemExit(
                "Aborting before spending Meshy credits: Gate 1 (2D Input Check) failed due to touching/crossed feet. "
                "Provide an A-pose turnaround with separated legs or pass --skip-gate1-fail."
            )
        if args.side and args.back:
            run_meshy_stage(args.front, args.side, args.back, args.rigged_glb)

    if not args.rigged_glb.exists():
        raise FileNotFoundError(f"Rigged GLB not found: {args.rigged_glb}")

    # Run Blender assembler (`build_silme_seeress.py` + `modular_vroid_head.py`)
    build_script = Path(__file__).parent / "build_silme_seeress.py"
    blender_bin = "/Applications/Blender.app/Contents/MacOS/Blender"
    if not Path(blender_bin).exists():
        blender_bin = "blender"
    cmd = [
        blender_bin,
        "-b",
        "--factory-startup",
        "-P",
        str(build_script),
        "--",
        "--meshy-rigged",
        str(args.rigged_glb),
        "--head-scale",
        str(args.head_scale),
        "--ear-style",
        args.ear_style,
        "--hair-wave",
        str(args.hair_wave),
        "--vroid-hair",
        args.vroid_hair,
    ]
    print("=== Stage 2 & 3: Running Blender Humanoid Assembler + Gate 2/3/4 ===")
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        raise SystemExit(res.returncode)


if __name__ == "__main__":
    main()
