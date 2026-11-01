#!/usr/bin/env python3
"""
twostage.py — Two-Stage Draft-to-Polish Generation Pipeline for FLUX.1-dev on mont-pc

Implements the verified 2-Stage recipe from ABP-twostage-flux-pipeline.md:
  Stage 1: Fast Base Draft (608x912, 10 steps) — ~10s turnaround to inspect composition/pose.
  Stage 2: Hi-Res Polish (Upscale 1.5x with 4x-UltraSharp to 912x1368, 14 steps, denoise 0.30) — ~33s.
Total elapsed: ~44s (4x faster than a single-pass 24-step high-res generation).

Usage:
  python3 twostage.py --prompt "A regal female elf knight in filigree plate armor..." --out elf.png
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request

DEFAULT_COMFY_URL = os.environ.get("COMFY_URL", "https://mont-pc.taild6b5fe.ts.net")


def build_twostage_graph(prompt: str, seed: int, draft_only: bool = False) -> dict:
    # Base Draft: 608x912, 10 steps, euler/simple, guidance 3.5
    graph = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev-fp8.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": prompt}},
        "3": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["2", 0], "guidance": 3.5}},
        "4": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 608, "height": 912, "batch_size": 1}},
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["3", 0],
                "negative": ["2", 0],
                "latent_image": ["4", 0],
                "seed": seed,
                "steps": 10,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
    }

    # Always save draft node 7
    graph["7"] = {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "twostage_draft"}}
    if draft_only:
        return graph

    # Stage 2: 1.5x Polish (4x-UltraSharp downscaled to 912x1368, 14 steps, denoise 0.30)
    graph.update(
        {
            "8": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4x-UltraSharp.pth"}},
            "9": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["8", 0], "image": ["6", 0]}},
            "10": {
                "class_type": "ImageScale",
                "inputs": {
                    "image": ["9", 0],
                    "upscale_method": "lanczos",
                    "width": 912,
                    "height": 1368,
                    "crop": "disabled",
                },
            },
            "11": {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["1", 2]}},
            "12": {
                "class_type": "KSampler",
                "inputs": {
                    "model": ["1", 0],
                    "positive": ["3", 0],
                    "negative": ["2", 0],
                    "latent_image": ["11", 0],
                    "seed": seed,
                    "steps": 14,
                    "cfg": 1.0,
                    "sampler_name": "euler",
                    "scheduler": "simple",
                    "denoise": 0.30,
                },
            },
            "13": {"class_type": "VAEDecode", "inputs": {"samples": ["12", 0], "vae": ["1", 2]}},
            "14": {"class_type": "SaveImage", "inputs": {"images": ["13", 0], "filename_prefix": "twostage_polish"}},
        }
    )
    return graph


def run_pipeline(prompt: str, out_path: str, comfy_url: str = DEFAULT_COMFY_URL, seed: int = None, draft_only: bool = False, timeout: int = 300):
    if seed is None:
        seed = random.randint(1, 2147483647)

    graph = build_twostage_graph(prompt, seed, draft_only=draft_only)
    save_node = "7" if draft_only else "14"

    print(f"Connecting to ComfyUI at {comfy_url}...")
    req = urllib.request.Request(
        f"{comfy_url}/prompt",
        data=json.dumps({"prompt": graph}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            pid = data["prompt_id"]
    except Exception as e:
        print(f"Error submitting prompt: {e}", file=sys.stderr)
        sys.exit(1)

    stage_desc = "Stage 1 Draft (10 steps)" if draft_only else "2-Stage Draft-to-Polish (10s base + 33s polish)"
    print(f"Queued job {pid} ({stage_desc}, seed={seed})")

    start = time.time()
    draft_saved = False
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"{comfy_url}/history/{pid}", timeout=10) as resp:
                h = json.loads(resp.read().decode())
                if pid in h:
                    status = h[pid].get("status", {})
                    # If all nodes were cached, ComfyUI may not re-emit outputs in history for this pid
                    if status.get("completed") and not h[pid].get("outputs"):
                        print("Notice: Execution was cached by ComfyUI server. Resubmitting with a new random seed...")
                        return run_pipeline(prompt, out_path, comfy_url, seed=random.randint(1, 2147483647), draft_only=draft_only, timeout=timeout)

                    # Save draft image if available and not yet saved
                    if "7" in h[pid].get("outputs", {}) and not draft_saved and not draft_only:
                        try:
                            d_info = h[pid]["outputs"]["7"]["images"][0]
                            d_fn = urllib.parse.quote(d_info["filename"])
                            d_sub = urllib.parse.quote(d_info.get("subfolder", ""))
                            d_type = d_info.get("type", "output")
                            d_url = f"{comfy_url}/view?filename={d_fn}&subfolder={d_sub}&type={d_type}"
                            base, ext = os.path.splitext(out_path)
                            draft_path = f"{base}_draft{ext}"
                            os.makedirs(os.path.dirname(os.path.abspath(draft_path)), exist_ok=True)
                            urllib.request.urlretrieve(d_url, draft_path)
                            draft_saved = True
                            print(f"Stage 1 Draft saved: {draft_path} ({round(os.path.getsize(draft_path)/1024, 1)} KB)")
                        except Exception as e:
                            pass

                    if save_node in h[pid].get("outputs", {}):
                        elapsed = round(time.time() - start, 1)
                        img_info = h[pid]["outputs"][save_node]["images"][0]
                        filename = urllib.parse.quote(img_info["filename"])
                        subfolder = urllib.parse.quote(img_info.get("subfolder", ""))
                        img_type = img_info.get("type", "output")
                        url = f"{comfy_url}/view?filename={filename}&subfolder={subfolder}&type={img_type}"

                        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
                        urllib.request.urlretrieve(url, out_path)
                        size_kb = round(os.path.getsize(out_path) / 1024, 1)
                        print(f"DONE in {elapsed}s: Downloaded {out_path} ({size_kb} KB)")
                        return out_path
        except Exception:
            pass
        time.sleep(2)

    print(f"Timeout ({timeout}s) waiting for ComfyUI execution.", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Run 2-Stage Draft-to-Polish FLUX.1-dev generation on mont-pc.")
    parser.add_argument("--prompt", "-p", required=True, help="Visual text prompt")
    parser.add_argument("--out", "-o", default="out.png", help="Output file path (default: out.png)")
    parser.add_argument("--comfy-url", default=DEFAULT_COMFY_URL, help=f"ComfyUI URL (default: {DEFAULT_COMFY_URL})")
    parser.add_argument("--seed", type=int, default=None, help="Generation seed (default: random)")
    parser.add_argument("--draft-only", action="store_true", help="Generate Stage 1 base draft only (~10s)")
    parser.add_argument("--timeout", type=int, default=300, help="Wait timeout in seconds")

    args = parser.parse_args()
    run_pipeline(args.prompt, args.out, comfy_url=args.comfy_url, seed=args.seed, draft_only=args.draft_only, timeout=args.timeout)


if __name__ == "__main__":
    main()
