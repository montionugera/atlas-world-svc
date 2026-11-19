"""Read-only queries over the record index that build_catalog_db.py writes (F-216 S1)."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path

from . import record_map, runtime

MAX_RESULTS = 20
# Shown on the page of the record a link points AT. "Map" has no inverse: the map already
# says "Part of" its node.
INVERSE = {"Part of": "Contains", "Drops": "Dropped by", "Connects to": "Connects to", "Route to": "Route to", "Transport to": "Transport to",
           "Home town": "Home of", "Lives in": "Residents", "Studio node": "Canon town"}
LABEL_ORDER = ["Part of", "Contains", "Map", "Connects to", "Route to", "Transport to", "Drops", "Dropped by",
               "Home town", "Home of", "Lives in", "Residents", "Studio node", "Canon town"]


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(f"file:{runtime.catalog_db_path()}?mode=ro", uri=True)


def search(q: str, include_archive: bool = False) -> list[dict]:
    q = (q or "").strip()
    terms = re.findall(r"\w+", q.lower())
    if len(q) < 2 or not terms:
        return []
    match = " ".join(f'"{t}"*' for t in terms)  # quoted prefix terms: user text never reaches FTS syntax
    sql = (
        "SELECT f.kind, f.id, f.title, f.summary, f.concept, r.view_url "
        "FROM records_fts f JOIN records r ON r.kind = f.kind AND r.id = f.id "
        "WHERE records_fts MATCH ? " + ("" if include_archive else "AND f.concept != 'legacy' ") +
        "ORDER BY (lower(f.title) LIKE ? ESCAPE '\\') DESC, bm25(records_fts, 0.0, 0.0, 0.0, 10.0, 2.0, 1.0), f.title "
        "LIMIT ?"
    )
    prefix = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    with _connect() as conn:
        rows = conn.execute(sql, (match, prefix, MAX_RESULTS)).fetchall()
    return [dict(zip(("kind", "id", "title", "summary", "concept", "viewUrl"), row)) for row in rows]


def counts() -> list[dict]:
    """Records per kind for Home, current concept only. viewUrl is one sample link: it names the kind's tab."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT kind, count(*), max(view_url) FROM records WHERE concept != 'legacy' "
            "GROUP BY kind ORDER BY count(*) DESC, kind"
        ).fetchall()
    return [dict(zip(("kind", "n", "viewUrl"), row)) for row in rows]


def _studio_dir() -> Path:
    return Path(os.environ.get("ATLAS_STUDIO_DIR", Path(__file__).resolve().parents[2] / "content" / "studio"))


def _load_all(folder: Path) -> list[dict]:
    """Studio files are read on every request (no cache), so an edited level shows on the next reload."""
    out = []
    for p in sorted(folder.rglob("*.json")):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            continue
    return out


def build_map(kind: str, id_: str) -> dict | None:
    studio = _studio_dir()
    if kind == "district":
        districts = {d["id"]: d for d in _load_all(studio / "districts") if "id" in d}
        d = districts.get(id_)
        if d is None:
            return None
        nodes = {n["id"]: n for n in _load_all(studio / "nodes" / d.get("parent_continent_id", "")) if "id" in n}
        mine = {i: n for i, n in nodes.items() if n.get("parent_district_id") == id_}
        return record_map.district_map(mine, nodes, {i: x.get("name", i) for i, x in districts.items()})
    if kind == "continent":
        districts = [d for d in _load_all(studio / "districts" / id_) if "id" in d]
        files = [c for c in _load_all(studio / "continents") if c.get("id") == id_]
        if not files:
            return None
        towns = {}
        for n in _load_all(studio / "nodes" / id_):
            if n.get("node_type") == "town":
                towns.setdefault(n.get("parent_district_id"), n.get("name"))
        return record_map.continent_map(districts, files[0].get("district_links") or [], towns)
    return None


def record(kind: str, id_: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT kind, id, title, summary, concept, source_file, view_url FROM records WHERE kind = ? AND id = ?",
            (kind, id_)).fetchone()
        if row is None:
            return None
        tags = [t for (t,) in conn.execute("SELECT tag FROM record_tags WHERE kind = ? AND id = ? ORDER BY tag", (kind, id_))]
        forward = conn.execute(
            "SELECT l.relation, r.kind, r.id, r.title FROM links l JOIN records r ON r.kind = l.to_kind AND r.id = l.to_id "
            "WHERE l.from_kind = ? AND l.from_id = ? ORDER BY r.title", (kind, id_)).fetchall()
        inverse = conn.execute(
            "SELECT l.relation, r.kind, r.id, r.title FROM links l JOIN records r ON r.kind = l.from_kind AND r.id = l.from_id "
            "WHERE l.to_kind = ? AND l.to_id = ? ORDER BY r.title", (kind, id_)).fetchall()
        feature_row = None
        asset_row = None
        if kind == "feature":
            try:
                feature_row = conn.execute("SELECT raw_json FROM backlog_features WHERE id = ?", (id_,)).fetchone()
            except sqlite3.Error:
                feature_row = None
        elif kind == "asset_3d":
            try:
                asset_row = conn.execute("SELECT raw_json FROM asset_3d_provenance WHERE id = ?", (id_,)).fetchone()
            except sqlite3.Error:
                asset_row = None
    groups: dict[str, list[dict]] = {}
    seen: set[tuple] = set()
    for label, k, i, title in forward + [(INVERSE.get(rel), k, i, t) for rel, k, i, t in inverse]:
        if label is None or (k, i) in seen:  # one record is listed once, under its forward label
            continue
        seen.add((k, i))
        groups.setdefault(label, []).append({"kind": k, "id": i, "title": title})
    out = {
        "record": dict(zip(("kind", "id", "title", "summary", "concept", "sourceFile", "viewUrl"), row)),
        "tags": tags,
        "relations": [{"label": name, "items": groups[name]} for name in LABEL_ORDER if name in groups],
    }
    if feature_row and feature_row[0]:
        out["feature"] = json.loads(feature_row[0])
    if asset_row and asset_row[0]:
        out["assetProvenance"] = json.loads(asset_row[0])
    m = build_map(kind, id_)
    if m:
        out["map"] = m
    if kind == "district":
        d = next((x for x in _load_all(_studio_dir() / "districts") if x.get("id") == id_), None)
        if d and (d.get("geography") or {}).get("gameplay"):
            out["gameplay"] = d["geography"]["gameplay"]
    return out
