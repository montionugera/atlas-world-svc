"""Index layer of the derived game DB (F-216 S1): one row per game record, the links between
records, tags, and a full-text table. Filled last, from the studio files and from tables the
builder has already written. Nothing here reads a table it does not name below."""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path


class CatalogIndexError(Exception):
    """A studio file, a reference or a hand tag is wrong. The message is what the owner reads."""


SCHEMA = """
CREATE TABLE records (
  kind TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
  concept TEXT NOT NULL CHECK (concept IN ('studio', 'legacy')),
  source_file TEXT NOT NULL DEFAULT '', view_url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (kind, id));
CREATE TABLE links (
  from_kind TEXT NOT NULL, from_id TEXT NOT NULL, relation TEXT NOT NULL,
  to_kind TEXT NOT NULL, to_id TEXT NOT NULL,
  PRIMARY KEY (from_kind, from_id, relation, to_kind, to_id));
CREATE INDEX links_to ON links (to_kind, to_id);
CREATE TABLE record_tags (kind TEXT NOT NULL, id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (kind, id, tag));
CREATE VIRTUAL TABLE records_fts USING fts5(kind UNINDEXED, id UNINDEXED, concept UNINDEXED, title, summary, tags);
"""

# (kind, concept, "SELECT id, title, summary FROM <table the builder already filled>", view_url)
# view_url may use {id}. Tab ids are the ones in NAV_GROUPS (02_state_and_composable_layers.js:135).
TABLE_KINDS = [
    ("map", "studio", "SELECT id, name, biome || ' · levels ' || level_min || '-' || level_max FROM maps", "/?tab=maps&focus={id}"),
    ("mob", "studio", "SELECT id, name, 'Level ' || level || ' · ' || element || ' · ' || race FROM mobs", "/?tab=mobs&mob={id}"),
    ("item", "studio", "SELECT id, name, kind FROM items", "/?tab=gear&focus={id}"),
    ("card", "studio", "SELECT id, name, 'Card · ' || slot FROM cards", "/?tab=gear&focus={id}"),
    ("job", "studio", "SELECT id, name, 'Tier ' || tier FROM jobs", "/?tab=jobs&focus={id}"),
    ("skill", "studio", "SELECT id, name, 'Max level ' || max_level FROM skills", "/?tab=jobs&focus={id}"),
    ("quest", "studio", "SELECT id, title, category FROM quest_board", "/?tab=quests&focus={id}"),
    ("race", "studio", "SELECT id, name, 'Race' FROM canon_entries WHERE kind = 'race'", "/?tab=races"),
    ("canon", "studio", "SELECT kind || ':' || id, name, kind FROM canon_entries WHERE kind NOT IN ('race', 'retired_name')", "/?tab=lore"),
    ("canon", "legacy", "SELECT kind || ':' || id, name, 'Retired name' FROM canon_entries WHERE kind = 'retired_name'", "/?tab=lore"),
    ("decision", "studio", "SELECT id, id, text FROM canon_decisions", "/?tab=lore"),
    # an index item marked "concept": "legacy" is an old design: out of search unless "Include archive"
    ("concept_art", "studio", "SELECT id, title, caption FROM concept_art WHERE json_extract(raw_json, '$.concept') IS NOT 'legacy'", "/?tab=concept-arts&focus={id}"),
    ("concept_art", "legacy", "SELECT id, title, caption FROM concept_art WHERE json_extract(raw_json, '$.concept') IS 'legacy'", "/?tab=concept-arts&focus={id}"),
    ("bestiary", "legacy", "SELECT id, name, lore FROM world_bestiary", "/?tab=bestiary&focus={id}"),
    ("dungeon", "legacy", "SELECT id, title, lore_note FROM world_dungeons", "/?tab=dungeons&focus={id}"),
    ("legacy_continent", "legacy", "SELECT id, title, structural_idea FROM world_continents", "/?tab=world"),
    ("place", "legacy", "SELECT id, title, why_or_note FROM world_places", "/?tab=world"),
    ("zone", "legacy", "SELECT id, id, reason_to_go FROM world_zones", "/?tab=world"),
    ("spine_node", "legacy", "SELECT id, title, lore_reason FROM spine_nodes", "/?tab=world"),
    ("story", "legacy", "SELECT id, title, summary FROM story_nodes", "/?tab=story&focus={id}"),
]


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CatalogIndexError(f"cannot parse {path}: {exc}") from None


def _levels(pair) -> list[str]:
    return [f"levels-{pair[0]}-{pair[1]}"] if isinstance(pair, list) and len(pair) == 2 else []


def build_index(conn: sqlite3.Connection, root: Path, studio_dir: Path, manifest_path: Path, tags_path: Path) -> None:
    conn.executescript(SCHEMA)
    rel = lambda p: os.path.relpath(p, root)
    recs: list[tuple] = []   # (kind, id, title, summary, concept, source_file, view_url)
    tags: list[tuple] = []   # (kind, id, tag)
    refs: list[tuple] = []   # (from_kind, from_id, relation, to_kind, to_id)

    def tag(kind: str, id_: str, *values) -> None:
        tags.extend((kind, id_, str(v)) for v in values if v)

    for p in sorted((studio_dir / "continents").rglob("*.json")):
        d = _load(p)
        recs.append(("continent", d["id"], d["name"], d.get("core_rationale", ""), "studio", rel(p), f"/?tab=studio&perspective=continent&continent={d['id']}"))
        tag("continent", d["id"], d.get("status"))
    for p in sorted((studio_dir / "districts").rglob("*.json")):
        d = _load(p)
        cid = d.get("parent_continent_id", "")
        recs.append(("district", d["id"], d["name"], d.get("core_rationale", ""), "studio", rel(p),
                     f"/?tab=studio&perspective=district&continent={cid}&district={d['id']}"))
        tag("district", d["id"], d.get("status"), cid, *_levels(d.get("level_range")))
        refs.append(("district", d["id"], "Part of", "continent", cid))
        for e in d.get("portal_edges") or []:
            refs.append(("node", e["from_node_id"], "Connects to", "node", e["to_node_id"]))
    for p in sorted((studio_dir / "nodes").rglob("*.json")):
        d = _load(p)
        cid, did = d.get("parent_continent_id", ""), d.get("parent_district_id", "")
        recs.append(("node", d["id"], d["name"], d.get("core_rationale", ""), "studio", rel(p),
                     f"/?tab=studio&perspective=town-or-hunting-area&continent={cid}&district={did}&node={d['id']}"))
        tag("node", d["id"], d.get("status"), d.get("node_type"), cid, *_levels(d.get("level_range")))
        refs.append(("node", d["id"], "Part of", "district", did))
        if d.get("map_id"):
            refs.append(("node", d["id"], "Map", "studio_map", d["map_id"]))
    for m in _load(manifest_path).get("playableMaps", []):
        lv = m.get("levelRange") or []
        summary = m.get("nodeType", "") + (f" · levels {lv[0]}-{lv[1]}" if len(lv) == 2 else "")
        recs.append(("studio_map", m["mapId"], m["name"], summary, "studio", rel(manifest_path),
                     f"/?tab=studio&perspective=town-or-hunting-area&continent={m.get('continentId', '')}&district={m.get('districtId', '')}&node={m['nodeId']}"))
        tag("studio_map", m["mapId"], m.get("status"), m.get("nodeType"), m.get("continentId"), *_levels(lv))
        refs.append(("studio_map", m["mapId"], "Part of", "node", m["nodeId"]))
    for p in sorted((studio_dir / "maps").glob("*.png")):
        recs.append(("map_plate", p.stem, p.stem.replace("_", " "), "Map plate image", "studio", rel(p), f"/studio-maps/{p.name}"))

    for kind, concept, select, url in TABLE_KINDS:
        for id_, title, summary in conn.execute(select):
            recs.append((kind, str(id_), title or str(id_), summary or "", concept, "", url.format(id=id_)))
    for kind, id_ in conn.execute("SELECT 'map', id FROM maps"):
        tag(kind, id_, "unbound-to-studio-world")
    refs.extend(("mob", m, "Drops", "item", i) for m, i in conn.execute("SELECT mob_id, item_id FROM mob_drops"))

    conn.executemany("INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?)", recs)
    have = {(r[0], r[1]) for r in recs}
    for kind, id_, *_rest, concept, _src, _url in recs:
        tag(kind, id_, kind, concept)

    # Every reference in S1 joins two studio records, so one that does not resolve fails the build (R3f).
    bad = [r for r in refs if (r[0], r[1]) not in have or (r[3], r[4]) not in have]
    relations = sorted({r[2] for r in refs})
    print("[catalog_db] links: " + ", ".join(
        f"{name}={sum(1 for r in refs if r[2] == name)} (unresolved {sum(1 for r in bad if r[2] == name)})" for name in relations))
    if bad:
        raise CatalogIndexError("unresolved references:\n" + "\n".join(f"{r[0]}:{r[1]} -> {r[2]} -> {r[4]}" for r in bad))
    conn.executemany("INSERT OR IGNORE INTO links VALUES (?, ?, ?, ?, ?)", refs)

    if tags_path.exists():
        for key, values in _load(tags_path).items():
            kind, _, id_ = key.partition(":")
            if (kind, id_) not in have:
                raise CatalogIndexError(f"{tags_path}: no such record: {key}")
            tag(kind, id_, *values)
    conn.executemany("INSERT OR IGNORE INTO record_tags VALUES (?, ?, ?)", tags)
    conn.execute(
        "INSERT INTO records_fts (kind, id, concept, title, summary, tags) "
        "SELECT r.kind, r.id, r.concept, r.title, r.summary, "
        "COALESCE((SELECT group_concat(t.tag, ' ') FROM record_tags t WHERE t.kind = r.kind AND t.id = r.id), '') "
        "FROM records r")
