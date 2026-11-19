"""Work backlog discoverability and 3D .glb asset provenance indexing for the Observatory.

Reads:
- `.release.json` (active release state)
- `.claude/refined_backlog/_catalog.json` (F-* feature catalog: open/claimed/shipped/promoted)
- `game-client/assets/**/*.glb` (on-disk 3D models)
- `game-client/assets/manifest.json` + `catalog-manifest.json` (runtime & catalog manifests)
- `atelier/asset-forge/forge.config.json` (per-kind triangle/texture/byte budgets)

Used both by `catalog_index.py` (at SQLite build time) and `routes.py` / `records.py` (at serve time).
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def _release_path(root: Path = ROOT) -> Path:
    env = os.environ.get("ATLAS_RELEASE_FILE")
    return Path(env) if env else root / ".release.json"


def _backlog_catalog_path(root: Path = ROOT) -> Path:
    env = os.environ.get("ATLAS_BACKLOG_CATALOG")
    return Path(env) if env else root / ".claude" / "refined_backlog" / "_catalog.json"


def _assets_dir(root: Path = ROOT) -> Path:
    env = os.environ.get("ATLAS_ASSETS_DIR")
    return Path(env) if env else root / "game-client" / "assets"


def _forge_config_path(root: Path = ROOT) -> Path:
    env = os.environ.get("ATLAS_FORGE_CONFIG")
    return Path(env) if env else root / "atelier" / "asset-forge" / "forge.config.json"


def _read_json_optional(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _feature_sort_key(item: dict[str, Any]) -> tuple[int, str]:
    fid = str(item.get("id") or "")
    m = re.search(r"(\d+)$", fid)
    return (int(m.group(1)) if m else -1, fid)


def load_release_status(root: Path = ROOT) -> dict[str, Any] | None:
    raw = _read_json_optional(_release_path(root))
    if not isinstance(raw, dict):
        return None
    return {
        "version": raw.get("version"),
        "inProgress": bool(raw.get("in_progress")),
        "startedAt": raw.get("started_at"),
        "startedBy": raw.get("started_by"),
        "lastPromotedVersion": raw.get("last_promoted_version"),
        "lastPromotedAt": raw.get("last_promoted_at"),
    }


def load_backlog_features(root: Path = ROOT) -> list[dict[str, Any]]:
    raw = _read_json_optional(_backlog_catalog_path(root))
    if not isinstance(raw, list):
        return []
    release = load_release_status(root)
    active_ver = release.get("version") if release and release.get("inProgress") else None
    out: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict) or not entry.get("id"):
            continue
        fid = str(entry["id"])
        rv = entry.get("release_version")
        status = str(entry.get("status") or "unknown")
        out.append(
            {
                "id": fid,
                "title": str(entry.get("title") or fid),
                "fromIdea": entry.get("from_idea"),
                "status": status,
                "releaseVersion": rv,
                "inActiveRelease": bool(active_ver and rv == active_ver),
                "claimedBy": entry.get("claimed_by"),
                "createdAt": entry.get("created_at"),
                "claimedAt": entry.get("claimed_at"),
                "shippedAt": entry.get("shipped_at"),
                "promotedAt": entry.get("promoted_at"),
                "shippedSha": entry.get("shipped_sha"),
            }
        )
    out.sort(key=_feature_sort_key, reverse=True)
    return out


def query_work_index(
    *,
    root: Path = ROOT,
    status: str = "",
    release_version: str = "",
    q: str = "",
    limit: int | None = None,
) -> dict[str, Any]:
    release = load_release_status(root)
    features = load_backlog_features(root)
    active_ver = release.get("version") if release and release.get("inProgress") else None

    by_status = dict(sorted(Counter(f["status"] for f in features).items()))
    active_features = [f for f in features if f["inActiveRelease"]]
    active_by_status = dict(sorted(Counter(f["status"] for f in active_features).items()))

    filtered = features
    status_norm = (status or "").strip().lower()
    if status_norm == "active":
        filtered = [f for f in filtered if f["status"] in ("open", "claimed", "shipped")]
    elif status_norm:
        wanted = {s.strip() for s in status_norm.split(",") if s.strip()}
        filtered = [f for f in filtered if f["status"].lower() in wanted]

    rv_norm = (release_version or "").strip()
    if rv_norm.lower() == "current":
        if active_ver:
            filtered = [f for f in filtered if f["releaseVersion"] == active_ver]
        else:
            filtered = []
    elif rv_norm:
        filtered = [f for f in filtered if str(f["releaseVersion"] or "") == rv_norm]

    q_norm = (q or "").strip().lower()
    if q_norm:
        filtered = [
            f
            for f in filtered
            if q_norm in f["id"].lower()
            or q_norm in f["title"].lower()
            or q_norm in str(f.get("fromIdea") or "").lower()
            or q_norm in str(f.get("claimedBy") or "").lower()
        ]

    total_matched = len(filtered)
    if limit is not None and limit > 0:
        filtered = filtered[:limit]

    return {
        "release": release,
        "counts": {
            "total": len(features),
            "matched": total_matched,
            "byStatus": by_status,
            "activeRelease": {
                "version": active_ver,
                "total": len(active_features),
                "byStatus": active_by_status,
            },
        },
        "features": filtered,
    }


def _load_budgets(root: Path = ROOT) -> dict[str, dict[str, Any]]:
    raw = _read_json_optional(_forge_config_path(root))
    if not isinstance(raw, dict):
        return {}
    kinds = raw.get("kinds")
    if not isinstance(kinds, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for kind, cfg in kinds.items():
        if not isinstance(cfg, dict):
            continue
        out[str(kind)] = {
            "heightRange": cfg.get("heightRange"),
            "maxTriangles": cfg.get("maxTriangles"),
            "maxTextureSize": cfg.get("maxTextureSize"),
            "maxBytes": cfg.get("maxBytes"),
            "requiredStates": cfg.get("requiredStates"),
        }
    return out


def _index_manifest_entries(manifest_path: Path, manifest_label: str) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    raw = _read_json_optional(manifest_path)
    by_rel_assets: dict[str, list[dict[str, Any]]] = {}
    all_glb_entries: list[dict[str, Any]] = []
    if not isinstance(raw, dict):
        return by_rel_assets, all_glb_entries
    entries = raw.get("entries")
    if not isinstance(entries, dict):
        return by_rel_assets, all_glb_entries
    for key, val in entries.items():
        if not isinstance(val, dict):
            continue
        scene = str(val.get("scene") or "")
        if not scene.lower().endswith(".glb"):
            continue
        rec = {
            "manifest": manifest_label,
            "key": str(key),
            "scene": scene,
            "kind": val.get("kind"),
            "source": val.get("source"),
            "license": val.get("license"),
            "tier": val.get("tier"),
            "label": val.get("label"),
        }
        all_glb_entries.append(rec)
        if scene.startswith("res://assets/"):
            rel_id = scene[len("res://assets/") :]
            by_rel_assets.setdefault(rel_id, []).append(rec)
    return by_rel_assets, all_glb_entries


def load_glb_provenance(root: Path = ROOT) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, Any]]]:
    assets_dir = _assets_dir(root)
    budgets = _load_budgets(root)
    runtime_by_rel, runtime_all = _index_manifest_entries(assets_dir / "manifest.json", "runtime")
    catalog_by_rel, catalog_all = _index_manifest_entries(assets_dir / "catalog-manifest.json", "catalog")

    on_disk_ids: set[str] = set()
    assets: list[dict[str, Any]] = []

    if assets_dir.is_dir():
        for glb in sorted(assets_dir.rglob("*.glb")):
            if not glb.is_file():
                continue
            rel_id = glb.relative_to(assets_dir).as_posix()
            on_disk_ids.add(rel_id)
            rel_repo = os.path.relpath(glb, root).replace("\\", "/")
            parts = rel_id.split("/")
            category = parts[0] if len(parts) > 1 else "root"
            size_bytes = glb.stat().st_size
            has_import = glb.with_name(glb.name + ".import").is_file()

            rt_entries = runtime_by_rel.get(rel_id, [])
            cat_entries = catalog_by_rel.get(rel_id, [])
            combined = rt_entries + cat_entries

            if rt_entries:
                prov_status = "tracked"
            elif cat_entries:
                prov_status = "catalog_only"
            else:
                prov_status = "untracked"

            primary = rt_entries[0] if rt_entries else (cat_entries[0] if cat_entries else {})
            kind = primary.get("kind")
            source = primary.get("source")
            license_str = primary.get("license")
            tier = primary.get("tier")
            label = primary.get("label") or glb.stem.replace("_", " ").replace("-", " ")

            budget = budgets.get(str(kind)) if kind else None
            max_bytes = budget.get("maxBytes") if budget else None
            bytes_ok = (size_bytes <= int(max_bytes)) if max_bytes is not None else None

            assets.append(
                {
                    "id": rel_id,
                    "label": str(label),
                    "path": rel_repo,
                    "resPath": f"res://assets/{rel_id}",
                    "assetUrl": f"/game-client/assets/{rel_id}",
                    "category": category,
                    "bytes": size_bytes,
                    "provenanceStatus": prov_status,
                    "kind": kind,
                    "source": source,
                    "license": license_str,
                    "tier": tier,
                    "hasImport": has_import,
                    "manifestEntries": combined,
                    "budget": budget,
                    "bytesOk": bytes_ok,
                }
            )

    missing_or_external: list[dict[str, Any]] = []
    for entry in runtime_all + catalog_all:
        scene = entry["scene"]
        if scene.startswith("res://assets/"):
            rel_id = scene[len("res://assets/") :]
            if rel_id not in on_disk_ids:
                missing_or_external.append({**entry, "reason": "missing_on_disk"})
        else:
            missing_or_external.append({**entry, "reason": "external_or_cache"})

    return assets, missing_or_external, budgets


def query_asset_provenance(
    *,
    root: Path = ROOT,
    category: str = "",
    status: str = "",
    kind: str = "",
    source: str = "",
    tier: str = "",
    q: str = "",
    over_budget: bool = False,
    limit: int | None = None,
) -> dict[str, Any]:
    assets, missing_or_external, budgets = load_glb_provenance(root)

    by_prov = dict(sorted(Counter(a["provenanceStatus"] for a in assets).items()))
    by_cat = dict(sorted(Counter(a["category"] for a in assets).items()))
    by_src = dict(sorted(Counter(str(a["source"] or "unknown") for a in assets).items()))
    by_tier = dict(sorted(Counter(str(a["tier"] or "unknown") for a in assets).items()))
    over_byte_count = sum(1 for a in assets if a["bytesOk"] is False)

    filtered = assets
    if category.strip():
        c = category.strip().lower()
        filtered = [a for a in filtered if a["category"].lower() == c]
    if status.strip():
        s = status.strip().lower()
        filtered = [a for a in filtered if a["provenanceStatus"].lower() == s]
    if kind.strip():
        k = kind.strip().lower()
        filtered = [a for a in filtered if str(a.get("kind") or "").lower() == k]
    if source.strip():
        src = source.strip().lower()
        filtered = [a for a in filtered if src in str(a.get("source") or "").lower()]
    if tier.strip():
        t = tier.strip().lower()
        filtered = [a for a in filtered if str(a.get("tier") or "").lower() == t]
    if over_budget:
        filtered = [a for a in filtered if a["bytesOk"] is False]
    if q.strip():
        qn = q.strip().lower()
        filtered = [
            a
            for a in filtered
            if qn in a["id"].lower()
            or qn in a["label"].lower()
            or qn in str(a.get("source") or "").lower()
            or any(qn in e["key"].lower() for e in a["manifestEntries"])
        ]

    total_matched = len(filtered)
    if limit is not None and limit > 0:
        filtered = filtered[:limit]

    return {
        "counts": {
            "totalGlb": len(assets),
            "matched": total_matched,
            "byProvenance": by_prov,
            "byCategory": by_cat,
            "bySource": by_src,
            "byTier": by_tier,
            "overByteBudget": over_byte_count,
            "missingOrExternalManifestEntries": len(missing_or_external),
        },
        "budgets": budgets,
        "assets": filtered,
        "missingOrExternal": missing_or_external,
    }
