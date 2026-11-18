"""Read-only queries over the record index that build_catalog_db.py writes (F-216 S1)."""
from __future__ import annotations

import re
import sqlite3

from . import runtime

MAX_RESULTS = 20
# Shown on the page of the record a link points AT. "Map" has no inverse: the map already
# says "Part of" its node.
INVERSE = {"Part of": "Contains", "Drops": "Dropped by", "Connects to": "Connects to",
           "Home town": "Home of", "Lives in": "Residents", "Studio node": "Canon town"}
LABEL_ORDER = ["Part of", "Contains", "Map", "Connects to", "Drops", "Dropped by",
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
    groups: dict[str, list[dict]] = {}
    seen: set[tuple] = set()
    for label, k, i, title in forward + [(INVERSE.get(rel), k, i, t) for rel, k, i, t in inverse]:
        if label is None or (k, i) in seen:  # one record is listed once, under its forward label
            continue
        seen.add((k, i))
        groups.setdefault(label, []).append({"kind": k, "id": i, "title": title})
    return {
        "record": dict(zip(("kind", "id", "title", "summary", "concept", "sourceFile", "viewUrl"), row)),
        "tags": tags,
        "relations": [{"label": name, "items": groups[name]} for name in LABEL_ORDER if name in groups],
    }
