# Game DB slice S1 "Findable" Implementation Plan (F-216)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner types a name such as "Hearthbloom" in one search box in the top bar, from any tab on a Mac or a phone, clicks a result and lands on that record's page with its related records; the game DB holds the studio world and rebuilds itself safely when content is newer.

**Architecture:** `scripts/build_catalog_db.py` stays the only writer of the derived DB. It now builds into a temp file and replaces the DB only on success, then calls a new index pass (`catalog_index.py`) that fills `records`, `links`, `record_tags` and `records_fts` from the studio files and the tables that already exist. The explorer gets a startup freshness check, two read-only GET routes backed by `records.py`, and a small frontend module for the search popover and the record page that reuses the existing URL-state code.

**Tech Stack:** Python 3 stdlib (`sqlite3` with FTS5, `http.server`), vanilla JS in `scripts/atlas_world_web/frontend/`, `node --test`, the CDP probe library `scripts/probes/atlas_audit_lib.mjs`.

**Spec:** `.claude/refined_backlog/F-216-game-db-from-the-studio-world-slim-catal/spec.md` (approved 2026-11-15). This plan covers **slice S1 only**: R1, R1a, R1f, R2, R2f, R3, R3f, R4, R4f, R5, R6, R6f, R6g, R7, R7f, R8, R9 and acceptance A1-A10 (minus A7-A9's S2 parts), A14, A15. S2 (11-entry sidebar, Home counts by kind), S3 and S4 get their own plans later.

## Global Constraints

- Work only in the F-216 feature worktree created by `psrw claim F-216`. Never edit the main checkout or `_release`.
- `content/` stays the only source of truth; the DB is derived and untracked. No tab is removed in S1. Nothing in the existing panels' look changes in S1.
- The Studio tab's own command bar (`#atlasOmniSearchInput`) is not touched; two Gate 1 probes assert it.
- The search input keeps the id `globalSearch` (Cmd/Ctrl+K, `/`, and the per-tab filter `SEARCH_QUERY` already bind to it).
- Exact user-facing strings (copied from the spec, do not reword): `Game DB is out of date: rebuild failed`, `No record matches '<query>'`, `Search is unavailable`, `Retry`, `Searching...`, `No such record: <kind>:<id>`, `Nothing is linked to this yet`, `Old concept`, `Include archive`, `Open in <entry>`.
- Search needs 2 or more characters, returns at most 20 results, and leaves `concept = 'legacy'` out unless `include_archive=1`.
- The read-only release app never rebuilds the DB (already true: `ensure_catalog_db()` returns first when `web_runtime.read_only()`); keep `scripts/tests/atlas-web-read-only.test.mjs` green.
- Python: stdlib only, no new dependency. JS: no framework, no new dependency.
- Run `./scripts/fastcheck.sh` while editing; Gate 1 is `./scripts/precheck.sh --no-install`.
- Keep cargo and test concurrency light: one subagent at a time (swap was 86-93% full on 2026-11-14).

## Facts checked against the code on 2026-11-15 (corrections to the spec)

1. `district.portal_edges` entries are **node to node** (`from_node_id`, `to_node_id`), 96 edges, all resolve. So "Connects to" links are `node -> Connects to -> node`, not district to district.
2. The `maps` table has 46 rows, not 45: `MAPS_DIR.glob("*.json")` (`build_catalog_db.py:106`) also ingests `_manifest.runtime.json` as a map with id `_manifest.runtime`. Task 1 fixes the glob.
3. The 15 `canon_entries` rows of kind `retired_name` (Millcross, Undertow, ...) get `concept = 'legacy'`, so default search does not surface retired names. All other canon rows are `studio`.
4. Old `maps` ids and the 97 playable `mapId`s do not overlap (0 common ids), so `map` and `studio_map` are separate kinds with no collision.
5. R1 says "when the edit host starts": the freshness walk (983 files, 14 ms) runs once in `main()`, not on every `ensure_catalog_db()` call.
6. Parallel tests start several explorers at once. The temp file is therefore `<db name>.<pid>.tmp`, not a shared `<path>.tmp`, so two rebuilds cannot write the same file. `os.replace` keeps the swap atomic.
7. `castles`, `elements`, `handbook`, `boss_encounters`, `enchanting_rules` and `races_catalog` have no kind in the spec's list and get no `records` rows. Races come from `canon_entries` (kind `race`).
8. Three test seams are added to the builder, all env vars: `ATLAS_STUDIO_DIR` (studio tree to read), `ATLAS_TAGS_FILE` (hand-tag file), `ATLAS_CATALOG_BUILD_FAIL` (force exit 1). `ATLAS_CATALOG_DB` already exists in the explorer (`catalog_explorer_web.py:40`).

## File structure

| File | Responsibility |
|---|---|
| `scripts/atlas_world_web/runtime.py` (modify) | add `catalog_db_path()`, the one place the DB path and `ATLAS_CATALOG_DB` are read |
| `scripts/atlas_world_web/catalog_index.py` (create) | `build_index()`: create and fill `records`, `links`, `record_tags`, `records_fts`; raise `CatalogIndexError` |
| `scripts/build_catalog_db.py` (modify) | env paths, temp-then-replace, `load_json` names the file, map glob fix, call `build_index()` |
| `scripts/atlas_world_web/records.py` (create) | `search()` and `record()`: read-only queries over the index |
| `scripts/atlas_world_web/routes.py` (modify) | `GET /api/search`, `GET /api/record` |
| `scripts/catalog_explorer_web.py` (modify) | startup freshness, failure state, banner on `/` |
| `scripts/atlas_world_web/frontend/01_shell_and_styles.html` (modify) | search box moves to the top bar; popover, record page and banner markup and CSS |
| `scripts/atlas_world_web/frontend/02c_records_search.js` (create) | popover, record page, `openRecord()` |
| `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js` (modify) | `CURRENT_RECORD` in URL state and `render()` |
| `scripts/atlas_world_web/frontend_loader.py` (modify) | list `02c_records_search.js` after `02b_cartography_pipeline.js` |
| `scripts/tests/catalog-records.test.mjs` (create) | builder tests: A2 (file half), A3, A4, A5, R2f |
| `scripts/tests/atlas-web-records.test.mjs` (create) | server tests: A1, A2 (banner half), A6, A8 (API), A10 |
| `scripts/probes/atlas_records_probe.mjs` (create) | real-browser checks: A7, A8, A9, A14 (box visible at 390 px) |
| `scripts/precheck.sh` (modify) | run the two new checks in Gate 1 |
| `README.md` (modify) | search, record links, env vars, rebuild behaviour |
| `<feature folder>/design-brief.md`, `critique.md` (create) | design gate inputs for `psrw ship` |

---

### Task 0: Design brief (controller step, not a worker step)

**Files:**
- Create: `.claude/refined_backlog/F-216-game-db-from-the-studio-world-slim-catal/design-brief.md`

- [ ] **Step 1:** The controller loads the `impeccable` skill and runs `impeccable shape` for three surfaces: the top-bar search box with its "Include archive" checkbox, the result popover, and the record page (plus the stale-DB banner). Inputs: the spec's "UI state matrix" and "UI" paragraph, and these constraints found in the code:
  - Below 768 px the top bar is `flex-wrap: nowrap; overflow-x: auto; max-height: 44px` (`01_shell_and_styles.html:2332`). The search box must be visible at 390 px **without scrolling the top bar and without opening the nav drawer**, so it sits directly after the `Menu` button there; the title and status badge may hide on a phone.
  - A popover placed inside the top bar would be clipped by `overflow-x: auto`. The popover is a sibling of `.main`'s header, `position: fixed`, placed from the input's `getBoundingClientRect()`.
  - Reuse what exists: `joy-badge`, `joy-button`, the `.sidebar-search__*` input styles (`:94-135`), tokens `--joy-surface-sunken`, `--joy-border-default`, `--joy-text-secondary`, `--hub-topbar-bg`. No new colour literals.
  - Touch targets at least 44 px on a phone; popover rows are one line of title plus one line of summary, truncated with ellipsis.
- [ ] **Step 2:** Write `design-brief.md`: layout at 390 and 1280, tokens, the components reused, every state from the UI state matrix, the exact strings from Global Constraints, focus order (search box, "Include archive", results, page content).
- [ ] **Step 3:** Commit: `git add .claude/refined_backlog/F-216-*/design-brief.md && git commit -m "docs(F-216): design brief for search box, popover and record page"`

---

### Task 1: Builder: safe output, studio ingest, index tables

**Files:**
- Modify: `scripts/atlas_world_web/runtime.py` (append one function)
- Create: `scripts/atlas_world_web/catalog_index.py`
- Modify: `scripts/build_catalog_db.py:19-45,89-92,104-106,470,1268,1307,1357-1368`
- Modify: `scripts/catalog_explorer_web.py:40`
- Modify: `scripts/precheck.sh:513`
- Test: `scripts/tests/catalog-records.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `atlas_world_web.runtime.catalog_db_path() -> pathlib.Path`
  - `atlas_world_web.catalog_index.build_index(conn: sqlite3.Connection, root: Path, studio_dir: Path, manifest_path: Path, tags_path: Path) -> None`, raises `catalog_index.CatalogIndexError(str)`
  - Tables: `records(kind, id, title, summary, concept, source_file, view_url)` PK `(kind, id)`; `links(from_kind, from_id, relation, to_kind, to_id)`; `record_tags(kind, id, tag)`; FTS5 `records_fts(kind, id, concept, title, summary, tags)`.
  - Relation strings stored in `links.relation`: `Part of`, `Map`, `Connects to`, `Drops`.

- [ ] **Step 1: Write the failing test**

```js test:scripts/tests/catalog-records.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STUDIO = path.join(ROOT, 'content/studio');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'catalog-records-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

const build = (name, env = {}) => {
  const db = path.join(tmp, `${name}.sqlite`);
  const r = spawnSync('python3', ['scripts/build_catalog_db.py'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_CATALOG_DB: db, ...env },
  });
  return { db, status: r.status, stderr: r.stderr, stdout: r.stdout };
};
const sql = (db, q) => JSON.parse(execFileSync('python3', ['-I', '-c',
  'import sqlite3,json,sys;print(json.dumps(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]).fetchall()))', db, q]).toString());
const one = (db, q) => sql(db, q)[0][0];
const jsonFiles = (dir) => readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.json')).length;
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const studioCopy = (name) => {
  const dir = path.join(tmp, name);
  cpSync(STUDIO, dir, { recursive: true, filter: (src) => !src.endsWith('.png') });
  return dir;
};

const good = build('good');

test('A3: one studio record per continent, district, node, playable map and plate', () => {
  assert.equal(good.status, 0, good.stderr);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'content/maps/_manifest.runtime.json'), 'utf8'));
  const want = {
    continent: jsonFiles(path.join(STUDIO, 'continents')),
    district: jsonFiles(path.join(STUDIO, 'districts')),
    node: jsonFiles(path.join(STUDIO, 'nodes')),
    studio_map: manifest.playableMaps.length,
    map_plate: readdirSync(path.join(STUDIO, 'maps')).filter((f) => f.endsWith('.png')).length,
  };
  for (const [kind, n] of Object.entries(want)) {
    assert.ok(n > 0, `${kind} source count is 0`);
    assert.equal(one(good.db, `select count(*) from records where concept='studio' and kind='${kind}'`), n, kind);
  }
});

test('runtime maps: one record per content/maps file, the manifest is not a map', () => {
  const files = readdirSync(path.join(ROOT, 'content/maps')).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  assert.equal(one(good.db, "select count(*) from records where kind='map' and concept='studio'"), files.length);
  assert.equal(one(good.db, "select count(*) from record_tags where kind='map' and tag='unbound-to-studio-world'"), files.length);
  assert.equal(one(good.db, "select count(*) from maps where id like '\\_%' escape '\\'"), 0);
});

test('A4: hierarchy and map links, one per source field', () => {
  const n = (rel, fk, tk) => one(good.db, `select count(*) from links where relation='${rel}' and from_kind='${fk}' and to_kind='${tk}'`);
  assert.equal(n('Part of', 'district', 'continent'), jsonFiles(path.join(STUDIO, 'districts')));
  assert.equal(n('Part of', 'node', 'district'), jsonFiles(path.join(STUDIO, 'nodes')));
  assert.equal(n('Map', 'node', 'studio_map'), one(good.db, "select count(*) from records where kind='studio_map'"));
  assert.ok(n('Connects to', 'node', 'node') > 0);
  assert.equal(n('Drops', 'mob', 'item'), one(good.db, 'select count(*) from mob_drops'));
  assert.match(good.stdout, /links: .*unresolved 0/);
});

test('A4 / R3f: a district with a bad parent fails the build and names the reference', () => {
  const dir = studioCopy('bad-parent');
  const f = path.join(dir, 'districts/continent-01-hearthbloom-basin/district-amber-root-hollows.json');
  const d = JSON.parse(readFileSync(f, 'utf8'));
  d.parent_continent_id = 'continent-nope';
  writeFileSync(f, JSON.stringify(d));
  const r = build('bad-parent-db', { ATLAS_STUDIO_DIR: dir });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /district:district-amber-root-hollows -> Part of -> continent-nope/);
  assert.equal(existsSync(r.db), false, 'a failed build must not leave a DB');
});

test('R2f: an unparsable studio file fails the build and names the file', () => {
  const dir = studioCopy('bad-json');
  writeFileSync(path.join(dir, 'continents/continent-01-hearthbloom-basin.json'), '{ not json');
  const r = build('bad-json-db', { ATLAS_STUDIO_DIR: dir });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /continent-01-hearthbloom-basin\.json/);
});

test('A5: hand tags are added; an unknown key fails the build and is named', () => {
  const tags = path.join(tmp, 'tags.json');
  writeFileSync(tags, JSON.stringify({ 'continent:continent-01-hearthbloom-basin': ['owner-favourite'] }));
  const ok = build('tags-ok', { ATLAS_TAGS_FILE: tags });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(one(ok.db, "select count(*) from record_tags where tag='owner-favourite'"), 1);
  writeFileSync(tags, JSON.stringify({ 'continent:nope': ['x'] }));
  const bad = build('tags-bad', { ATLAS_TAGS_FILE: tags });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /continent:nope/);
});

test('A2 (file half): a failed rebuild leaves the previous DB byte-identical and no temp file', () => {
  const before = sha(good.db);
  const r = build('good', { ATLAS_CATALOG_BUILD_FAIL: '1' });
  assert.equal(r.status, 1);
  assert.equal(sha(good.db), before);
  assert.deepEqual(readdirSync(tmp).filter((f) => f.endsWith('.tmp')), []);
});

test('search index: every record is in records_fts, retired names are legacy', () => {
  assert.equal(one(good.db, 'select count(*) from records_fts'), one(good.db, 'select count(*) from records'));
  assert.equal(one(good.db, "select count(*) from records where kind='canon' and concept='legacy'"),
    one(good.db, "select count(*) from canon_entries where kind='retired_name'"));
  assert.ok(one(good.db, "select count(*) from records where concept='legacy' and kind='bestiary'") > 0);
});
```

Verify-Cmd: cd scripts && node --test tests/catalog-records.test.mjs

- [ ] **Step 2: Run the test and see it fail for the right reason**

Run: `cd scripts && node --test tests/catalog-records.test.mjs`
Expected: FAIL. The first test fails with `no such table: records` (the builder ignores `ATLAS_CATALOG_DB` today, so `good.db` does not exist: the python helper raises `unable to open` or `no such table`).

- [ ] **Step 3: Add `catalog_db_path()` to `scripts/atlas_world_web/runtime.py`** (append at the end; add `import os` and `from pathlib import Path` at the top only if the file does not import them yet)

```python
def catalog_db_path() -> Path:
    """The one place the derived game DB path is decided. ATLAS_CATALOG_DB lets tests and the
    image build point somewhere else."""
    default = Path(__file__).resolve().parent.parent.parent / "build" / "catalog.sqlite"
    return Path(os.environ.get("ATLAS_CATALOG_DB", str(default)))
```

Then in `scripts/catalog_explorer_web.py:40` replace the line
`DB_PATH = Path(os.environ.get("ATLAS_CATALOG_DB", str(ROOT / "build" / "catalog.sqlite")))`
with `DB_PATH = web_runtime.catalog_db_path()`. If `web_runtime` is imported after line 40, move this one line to directly below the import block at `:33-36`.

- [ ] **Step 4: Create `scripts/atlas_world_web/catalog_index.py`**

```python
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
    ("concept_art", "studio", "SELECT id, title, caption FROM concept_art", "/?tab=concept-arts&focus={id}"),
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
        recs.append(("continent", d["id"], d["name"], d.get("core_rationale", ""), "studio", rel(p), f"/?tab=studio&continent={d['id']}"))
        tag("continent", d["id"], d.get("status"))
    for p in sorted((studio_dir / "districts").rglob("*.json")):
        d = _load(p)
        cid = d.get("parent_continent_id", "")
        recs.append(("district", d["id"], d["name"], d.get("core_rationale", ""), "studio", rel(p),
                     f"/?tab=studio&continent={cid}&district={d['id']}"))
        tag("district", d["id"], d.get("status"), cid, *_levels(d.get("level_range")))
        refs.append(("district", d["id"], "Part of", "continent", cid))
        for e in d.get("portal_edges") or []:
            refs.append(("node", e["from_node_id"], "Connects to", "node", e["to_node_id"]))
    for p in sorted((studio_dir / "nodes").rglob("*.json")):
        d = _load(p)
        cid, did = d.get("parent_continent_id", ""), d.get("parent_district_id", "")
        recs.append(("node", d["id"], d["name"], d.get("core_rationale", ""), "studio", rel(p),
                     f"/?tab=studio&continent={cid}&district={did}&node={d['id']}"))
        tag("node", d["id"], d.get("status"), d.get("node_type"), cid, *_levels(d.get("level_range")))
        refs.append(("node", d["id"], "Part of", "district", did))
        if d.get("map_id"):
            refs.append(("node", d["id"], "Map", "studio_map", d["map_id"]))
    for m in _load(manifest_path).get("playableMaps", []):
        lv = m.get("levelRange") or []
        summary = m.get("nodeType", "") + (f" · levels {lv[0]}-{lv[1]}" if len(lv) == 2 else "")
        recs.append(("studio_map", m["mapId"], m["name"], summary, "studio", rel(manifest_path),
                     f"/?tab=studio&continent={m.get('continentId', '')}&district={m.get('districtId', '')}&node={m['nodeId']}"))
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
```

- [ ] **Step 5: Edit `scripts/build_catalog_db.py`**

a. Imports and paths (`:19-40`). Add `import os`. Mirror the explorer's import (`catalog_explorer_web.py:33-36`) for the package, then replace the three path lines:

```python
try:
    from scripts.atlas_world_web import catalog_index, runtime as web_runtime
except ImportError:
    from atlas_world_web import catalog_index, runtime as web_runtime  # type: ignore

STUDIO_DIR = Path(os.environ.get("ATLAS_STUDIO_DIR", str(ROOT / "content" / "studio")))   # test seam
TAGS_PATH = Path(os.environ.get("ATLAS_TAGS_FILE", str(ROOT / "content" / "tags.json")))  # test seam
DB_PATH = web_runtime.catalog_db_path()
BUILD_DIR = DB_PATH.parent
TMP_PATH = DB_PATH.with_name(f"{DB_PATH.name}.{os.getpid()}.tmp")  # per process: parallel rebuilds must not share it
SUMMARY_PATH = DB_PATH.with_name(f"{DB_PATH.stem}_summary.json")   # default path gives build/catalog_summary.json
```

`STUDIO_DIR` is already defined at `:32` from `ROOT`; replace that definition, do not add a second one. `CANON_PATH` and `DECISIONS_PATH` keep deriving from `STUDIO_DIR`.

b. `load_json` (`:43-45`) names the file it cannot read, for every caller:

```python
def load_json(path: Path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except ValueError as exc:
        raise SystemExit(f"[catalog_db] cannot parse {path}: {exc}") from None
```

c. Rename `def main() -> int:` (`:89`) to `def _build(db_path: Path) -> int:` and delete its first three lines (`BUILD_DIR.mkdir`, `if DB_PATH.exists(): DB_PATH.unlink()`). In it:
   - `:106` `MAPS_DIR.glob("*.json")` becomes `MAPS_DIR.glob("[!_]*.json")` (the manifest is not a map).
   - `:470` `sqlite3.connect(str(DB_PATH))` becomes `sqlite3.connect(str(db_path))`, followed by:

```python
    if os.environ.get("ATLAS_CATALOG_BUILD_FAIL"):  # test seam for R1f / A2
        raise SystemExit("[catalog_db] forced failure (ATLAS_CATALOG_BUILD_FAIL is set)")
```

   - directly after `conn.commit()` at `:1268` add:

```python
    catalog_index.build_index(conn, ROOT, STUDIO_DIR, MAPS_DIR / "_manifest.runtime.json", TAGS_PATH)
    conn.commit()
```

   - `:1307` and `:1362`: `DB_PATH.relative_to(ROOT)` and `SUMMARY_PATH.relative_to(ROOT)` become `os.path.relpath(DB_PATH, ROOT)` and `os.path.relpath(SUMMARY_PATH, ROOT)` (a DB outside the repo must not crash the print).

d. New `main()`:

```python
def main() -> int:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        rc = _build(TMP_PATH)
        os.replace(TMP_PATH, DB_PATH)  # the old DB is replaced only by a finished build (R1a)
        return rc
    except catalog_index.CatalogIndexError as exc:
        print(f"[catalog_db] {exc}", file=sys.stderr)
        return 1
    finally:
        TMP_PATH.unlink(missing_ok=True)
```

Before editing, run `grep -n "STUDIO_DIR\|MAPS_DIR.glob\|maps)" scripts/build_catalog_db.py` and `git grep -n "_manifest.runtime'\|46 maps\|maps=46" -- scripts tests atelier` to confirm no reader depends on the manifest being counted as a map; if one does, fix that reader in this task.

- [ ] **Step 6: Run the test and see it pass**

Run: `cd scripts && node --test tests/catalog-records.test.mjs`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 7: Put the test in Gate 1**

`scripts/precheck.sh:513`: change `tests/atlas-web-*.test.mjs` to `tests/atlas-web-*.test.mjs tests/catalog-records.test.mjs`.
Run: `python3 scripts/build_catalog_db.py && cd scripts && node --test tests/atlas-web-*.test.mjs tests/catalog-canon.test.mjs tests/catalog-records.test.mjs`
Expected: `# fail 0` (the image, read-only and canon tests still pass with the new paths).

- [ ] **Step 8: Commit**

```bash
git add scripts/atlas_world_web/runtime.py scripts/atlas_world_web/catalog_index.py scripts/build_catalog_db.py scripts/catalog_explorer_web.py scripts/precheck.sh scripts/tests/catalog-records.test.mjs
git commit -m "feat(catalog): safe rebuild, studio ingest and a record index (F-216 S1)"
```

---

### Task 2: Explorer: freshness, failure banner, `/api/search`, `/api/record`

**Files:**
- Create: `scripts/atlas_world_web/records.py`
- Modify: `scripts/atlas_world_web/routes.py:9-13,125-131`
- Modify: `scripts/catalog_explorer_web.py:413-427,828-835,963`
- Test: `scripts/tests/atlas-web-records.test.mjs`

**Interfaces:**
- Consumes: the tables and `runtime.catalog_db_path()` from Task 1; `ATLAS_CATALOG_BUILD_FAIL`.
- Produces:
  - `GET /api/search?q=<text>&include_archive=0|1` returns 200 `{"ok": true, "results": [{"kind","id","title","summary","concept","viewUrl"}]}` (at most 20; fewer than 2 characters gives an empty list).
  - `GET /api/record?kind=<k>&id=<id>` returns 200 `{"ok": true, "record": {"kind","id","title","summary","concept","sourceFile","viewUrl"}, "tags": [str], "relations": [{"label": str, "items": [{"kind","id","title"}]}]}` or 404 `{"ok": false, "error": "No such record: <kind>:<id>"}`.
  - Relation labels on the wire: `Part of`, `Contains`, `Map`, `Connects to`, `Drops`, `Dropped by`.
  - `GET /` contains `<div id="catalogStaleBanner"` with `Game DB is out of date: rebuild failed` when the startup rebuild failed.

- [ ] **Step 1: Write the failing test**

```js test:scripts/tests/atlas-web-records.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, utimesSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-web-records-'));
const DB = path.join(tmp, 'catalog.sqlite');
test.after(() => rmSync(tmp, { recursive: true, force: true }));
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const OLD = new Date('2000-01-01T00:00:00Z');

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
// Same shape as startServer in atlas-web-read-only.test.mjs.
async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn('python3', ['scripts/catalog_explorer_web.py', '--port', String(port)], {
    cwd: ROOT, env: { ...process.env, ATLAS_READ_ONLY: '', ATLAS_CATALOG_DB: DB, ...env }, stdio: 'ignore',
  });
  for (let i = 0; i < 600; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('server did not start');
}
const get = async (srv, p) => { const res = await fetch(srv.url + p); return { status: res.status, body: await res.json() }; };

test.before(() => {
  const r = spawnSync('python3', ['scripts/build_catalog_db.py'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_CATALOG_DB: DB } });
  assert.equal(r.status, 0, r.stderr);
});

test('A6 + A10 + A8 (API): search ranks the continent first, hides the archive, records carry relations', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const hit = await get(srv, '/api/search?q=hearthbloom');
  assert.equal(hit.status, 200);
  assert.equal(hit.body.ok, true);
  assert.ok(hit.body.results.length > 0 && hit.body.results.length <= 20);
  assert.deepEqual([hit.body.results[0].kind, hit.body.results[0].id], ['continent', 'continent-01-hearthbloom-basin']);
  for (const k of ['kind', 'id', 'title', 'summary', 'concept', 'viewUrl']) assert.ok(k in hit.body.results[0], k);

  const short = await get(srv, '/api/search?q=h');
  assert.deepEqual([short.status, short.body.results], [200, []]);
  const odd = await get(srv, `/api/search?q=${encodeURIComponent('"(*: AND NOT')}`);
  assert.equal(odd.status, 200, 'punctuation in a query must not reach FTS syntax');

  const plain = await get(srv, '/api/search?q=millcross');
  assert.equal(plain.body.results.filter((r) => r.concept === 'legacy').length, 0);
  const archive = await get(srv, '/api/search?q=millcross&include_archive=1');
  assert.ok(archive.body.results.some((r) => r.concept === 'legacy'));

  const rec = await get(srv, '/api/record?kind=district&id=district-amber-root-hollows');
  assert.equal(rec.status, 200);
  assert.equal(rec.body.record.title, 'Amber-Root Hollows');
  const group = (label) => (rec.body.relations.find((g) => g.label === label) || { items: [] }).items;
  assert.deepEqual(group('Part of').map((i) => i.id), ['continent-01-hearthbloom-basin']);
  assert.ok(group('Contains').length > 0 && group('Contains').every((i) => i.kind === 'node' && i.title));
  assert.ok(rec.body.tags.includes('district'));

  const node = await get(srv, '/api/record?kind=node&id=dungeon-sap-heart-cistern');
  const labels = node.body.relations.map((g) => g.label);
  assert.ok(labels.includes('Map'));
  assert.ok(!labels.includes('Contains'), 'a node must not list its map twice');

  const none = await get(srv, '/api/record?kind=district&id=nope');
  assert.deepEqual([none.status, none.body], [404, { ok: false, error: 'No such record: district:nope' }]);
});

test('A1: a DB older than the content is rebuilt before the edit host serves', async (t) => {
  utimesSync(DB, OLD, OLD);
  const t0 = Date.now();
  const srv = await startServer();
  t.after(() => srv.stop());
  assert.ok(statSync(DB).mtimeMs > t0 - 2000, 'the DB was not rebuilt');
  assert.doesNotMatch(await (await fetch(srv.url)).text(), /catalogStaleBanner/);
});

test('A2 (banner half): a failed rebuild keeps the old DB and says so on the page', async (t) => {
  utimesSync(DB, OLD, OLD);
  const before = sha(DB);
  const srv = await startServer({ ATLAS_CATALOG_BUILD_FAIL: '1' });
  t.after(() => srv.stop());
  assert.equal(sha(DB), before);
  const res = await fetch(srv.url);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /id="catalogStaleBanner"/);
  assert.match(html, /Game DB is out of date: rebuild failed/);
  assert.match(html, /forced failure/);
  assert.equal((await get(srv, '/api/search?q=hearthbloom')).body.results.length > 0, true, 'the old DB must still serve search');
});
```

Verify-Cmd: cd scripts && node --test tests/atlas-web-records.test.mjs

- [ ] **Step 2: Run the test and see it fail for the right reason**

Run: `cd scripts && node --test tests/atlas-web-records.test.mjs`
Expected: FAIL. Test 1 gets 404 for `/api/search`; test 2 fails with `the DB was not rebuilt`; test 3 fails because the server runs the builder with `check=True`, dies, and `server did not start`.

- [ ] **Step 3: Create `scripts/atlas_world_web/records.py`**

```python
"""Read-only queries over the record index that build_catalog_db.py writes (F-216 S1)."""
from __future__ import annotations

import re
import sqlite3

from . import runtime

MAX_RESULTS = 20
# Shown on the page of the record a link points AT. "Map" has no inverse: the map already
# says "Part of" its node.
INVERSE = {"Part of": "Contains", "Drops": "Dropped by", "Connects to": "Connects to"}
LABEL_ORDER = ["Part of", "Contains", "Map", "Connects to", "Drops", "Dropped by"]


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
```

- [ ] **Step 4: Add the two routes in `scripts/atlas_world_web/routes.py`**

Imports (`:9-13`): add `import sqlite3`, change `from urllib.parse import urlsplit` to `from urllib.parse import parse_qs, urlsplit`, and add `records` to the `from . import ...` line. Add above `ROUTES`:

```python
def _query(handler) -> dict:
    return {k: v[0] for k, v in parse_qs(urlsplit(handler.path).query).items()}


def _search(handler, path: str, *, head: bool = False) -> None:
    qs = _query(handler)
    try:
        results = records.search(qs.get("q", ""), qs.get("include_archive") == "1")
    except sqlite3.Error as exc:  # an old DB without the index: say so instead of a 500 page
        _send_json(handler, {"ok": False, "error": f"Search is unavailable: {exc}"}, 503, head=head)
        return
    _send_json(handler, {"ok": True, "results": results}, head=head)


def _record(handler, path: str, *, head: bool = False) -> None:
    qs = _query(handler)
    kind, id_ = qs.get("kind", ""), qs.get("id", "")
    try:
        found = records.record(kind, id_)
    except sqlite3.Error as exc:
        _send_json(handler, {"ok": False, "error": f"Search is unavailable: {exc}"}, 503, head=head)
        return
    if found is None:
        _send_json(handler, {"ok": False, "error": f"No such record: {kind}:{id_}"}, 404, head=head)
        return
    _send_json(handler, {"ok": True, **found}, head=head)
```

In `ROUTES["GET"]` add `("/api/search", _search),` and `("/api/record", _record),` after `("/api/runtime", _runtime),`.

- [ ] **Step 5: Freshness and the banner in `scripts/catalog_explorer_web.py`**

Add `import html` to the imports. Replace `ensure_catalog_db()` (`:413-427`) with:

```python
CATALOG_BUILD_ERROR = ""  # last line of a failed startup rebuild; shown on "/" (R1f)
_FRESHNESS_FILES = (BUILD_SCRIPT, ROOT / "scripts" / "atlas_world_web" / "catalog_index.py")
_FRESHNESS_DIRS = (ROOT / "content", ROOT / "contracts" / "content")


def _inputs_newer_than(db_mtime: float) -> bool:
    if any(f.stat().st_mtime > db_mtime for f in _FRESHNESS_FILES):
        return True
    return any(
        os.stat(os.path.join(dirpath, name)).st_mtime > db_mtime
        for root in _FRESHNESS_DIRS for dirpath, _dirs, names in os.walk(root) for name in names)


def ensure_catalog_db(check_fresh: bool = False) -> None:
    """Build the DB when it is missing or unusable; with check_fresh (startup only) also when
    any input is newer. A failed rebuild keeps the previous DB and records why."""
    global CATALOG_BUILD_ERROR
    if web_runtime.read_only():
        return
    have = DB_PATH.exists()
    needs_build = not have
    if have:
        try:
            conn = sqlite3.connect(str(DB_PATH))
            row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='world_continents'").fetchone()
            conn.close()
            needs_build = not row
        except Exception:
            needs_build = True
    if not needs_build and check_fresh:
        needs_build = _inputs_newer_than(DB_PATH.stat().st_mtime)
    if not needs_build:
        return
    proc = subprocess.run([sys.executable, str(BUILD_SCRIPT)], capture_output=True, text=True)
    if proc.returncode == 0:
        CATALOG_BUILD_ERROR = ""
        return
    last = ([line for line in proc.stderr.splitlines() if line.strip()] or [f"builder exited {proc.returncode}"])[-1]
    if not have:
        raise RuntimeError(f"catalog build failed and there is no previous DB: {last}")
    CATALOG_BUILD_ERROR = last
    print(f"[catalog_explorer_web] Game DB is out of date: rebuild failed: {last}", file=sys.stderr)
```

In `main()` (`:963`) change `ensure_catalog_db()` to `ensure_catalog_db(check_fresh=True)`. Every other caller keeps the cheap default.

In `do_GET` (`:828-829`) replace the `raw = ...` line with:

```python
            page = web_runtime.mark_body(load_modular_index_html())
            if CATALOG_BUILD_ERROR:
                banner = ('<div id="catalogStaleBanner" class="catalog-stale-banner" role="alert">'
                          'Game DB is out of date: rebuild failed'
                          f'<code>{html.escape(CATALOG_BUILD_ERROR)}</code></div>')
                page = page.replace('<header class="topbar">', banner + '<header class="topbar">', 1)
            raw = page.encode("utf-8")
```

Check that `os` is imported in this file (`grep -n "^import os" scripts/catalog_explorer_web.py`); add it if not.

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd scripts && node --test tests/atlas-web-records.test.mjs tests/atlas-web-read-only.test.mjs tests/catalog-records.test.mjs`
Expected: `# fail 0`. If `atlas-web-read-only.test.mjs:105` reports `server did not start`, re-run once (known port race, I-300) before debugging.
Run: `python3 tests/test_studio_web_perspectives.py` (or the command at `scripts/precheck.sh:563`). Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add scripts/atlas_world_web/records.py scripts/atlas_world_web/routes.py scripts/catalog_explorer_web.py scripts/tests/atlas-web-records.test.mjs
git commit -m "feat(explorer): rebuild a stale game DB at start, add /api/search and /api/record (F-216 S1)"
```

- [ ] **Step 8: Phase gate for Tasks 1-2** (rule 7): `./scripts/precheck.sh --no-install` green; one `code-reviewer` + `python-reviewer` pass on the two commits; ONE fix round; `/simplify`; re-run the three test files.

---

### Task 3: Top-bar search, result popover, record page

**Files:**
- Modify: `scripts/atlas_world_web/frontend/01_shell_and_styles.html:94-135,2504-2518,2532-2564` (move the search box; CSS and markup from `design-brief.md`)
- Create: `scripts/atlas_world_web/frontend/02c_records_search.js`
- Modify: `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js:100,355-400,519-523,617-626,694-700,729-736,794-830`
- Modify: `scripts/atlas_world_web/frontend_loader.py:13-23`
- Create: `scripts/probes/atlas_records_probe.mjs`
- Modify: `scripts/precheck.sh:563,596-640` (run the probe)
- Modify: `README.md`
- Create: `<feature folder>/critique.md`

**Interfaces:**
- Consumes: `GET /api/search`, `GET /api/record` (Task 2, shapes above); `design-brief.md` (Task 0) as the styling spec; existing globals `CURRENT_TAB`, `SEARCH_QUERY`, `NAV_GROUPS`, `writeUrlState()`, `syncUrlState()`, `render()`, `escapeHtml()`.
- Produces: DOM ids the probe reads: `#globalSearch`, `#searchIncludeArchive`, `#searchPopover` (rows are `[data-record="<kind>:<id>"]`, the message row is `.search-popover__message`, the retry button is `#searchRetryBtn`), `#recordPage` (title in `h1`, groups are `section[data-relation="<label>"]`, the open link is `#recordOpenLink`). Global functions `openRecord(kind, id)`, `closeSearchPopover()`, `renderRecordPage(main)`. URL parameter `r=<kind>:<id>`.

- [ ] **Step 1: Write the failing browser probe**

```js test:scripts/probes/atlas_records_probe.mjs
// F-216 S1: search box, result popover and record page in a real Chrome, desktop and phone.
// usage: node scripts/probes/atlas_records_probe.mjs [--url http://127.0.0.1:8788/]
// Needs a running catalog_explorer_web.py. Exit: 0 pass, 1 assertion failed, 2 setup error, 3 Chrome missing.
import { launch, waitFor, settle, navigate, tap, chromeAvailable } from './atlas_audit_lib.mjs';

const argv = process.argv.slice(2);
const ui = argv.indexOf('--url');
const BASE = (ui >= 0 ? argv[ui + 1] : 'http://127.0.0.1:8788/').replace(/\/?(\?.*)?$/, '/');
if (!chromeAvailable()) { console.error('SKIP: Chrome not found (set CHROME_BIN)'); process.exit(3); }

const rows = [];
const ck = (name, ok, detail = '') => { rows.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} | ${detail}`); };
const rect = (c, sel) => c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+r.height/2; const top=document.elementFromPoint(x,y); return {x,y,w:r.width,h:r.height,left:r.left,right:r.right,vw:innerWidth,hit:!!top&&(top===e||e.contains(top)||top.contains(e))}})()`);
const click = async (c, p, touch) => {
  if (touch) return tap(c, p.x, p.y);
  for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
};
const typeInto = async (c, touch, text) => {
  await click(c, await rect(c, '#globalSearch'), touch);
  await c.eval(`(()=>{const i=document.getElementById('globalSearch'); i.select(); 0})()`);
  await c.send('Input.insertText', { text });
};
const back = async (c) => {  // what the browser Back button does
  const h = await c.send('Page.getNavigationHistory');
  await c.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id });
};
const FIRST = `#searchPopover:not([hidden]) [data-record]`;
const MSG = `#searchPopover:not([hidden]) .search-popover__message`;

for (const v of [{ name: 'desktop 1280x800', w: 1280, h: 800, dpr: 1 }, { name: 'phone 390x844', w: 390, h: 844, dpr: 2, mobile: true, touch: true }]) {
  let c;
  try {
    c = await launch({ ...v, url: `${BASE}?tab=mobs` });
    await waitFor(c, `typeof DATA !== 'undefined' && !!DATA && !!document.getElementById('globalSearch')`, 20000);
    await settle(c);

    const box = await rect(c, '#globalSearch');
    ck(`A14 ${v.name}: search box is on screen and on top without opening the nav drawer`,
      box && box.h > 0 && box.left >= 0 && box.right <= box.vw && box.hit && (await c.eval(`document.body.getAttribute('data-mobile-nav-open')!=='true'`)), JSON.stringify(box));

    await typeInto(c, v.touch, 'hearthbloom');
    await waitFor(c, `!!document.querySelector(${JSON.stringify(FIRST)})`, 8000);
    const first = await c.eval(`(document.querySelector(${JSON.stringify(FIRST)})||{dataset:{}}).dataset.record||''`);
    ck(`R6 ${v.name}: typing shows ranked results, the continent first`, first === 'continent:continent-01-hearthbloom-basin', first);
    const pop = await rect(c, '#searchPopover');
    ck(`R6 ${v.name}: the popover fits the viewport`, pop && pop.left >= 0 && pop.right <= pop.vw + 1, JSON.stringify(pop));
    ck(`R6 ${v.name}: the tab under the popover stays mounted`, await c.eval(`CURRENT_TAB==='mobs' && !document.getElementById('recordPage')`));

    await click(c, await rect(c, FIRST), v.touch);
    await waitFor(c, `!!document.querySelector('#recordPage h1')`, 8000);
    ck(`R7 ${v.name}: a real click opens the record page`,
      await c.eval(`document.querySelector('#recordPage h1').textContent.includes('Hearthbloom Basin') && new URLSearchParams(location.search||location.hash.slice(1)).get('r')==='continent:continent-01-hearthbloom-basin'`),
      await c.eval('location.href'));
    ck(`R7 ${v.name}: related records are grouped, with an "Open in" link`,
      await c.eval(`document.querySelectorAll('#recordPage section[data-relation="Contains"] [data-record]').length>0 && /^Open in /.test((document.getElementById('recordOpenLink')||{}).textContent||'')`));

    await back(c);
    await waitFor(c, `!document.getElementById('recordPage')`, 8000);
    ck(`A9 ${v.name}: browser Back restores the previous tab and query`,
      await c.eval(`CURRENT_TAB==='mobs' && document.getElementById('globalSearch').value==='hearthbloom' && !document.getElementById('recordPage')`),
      await c.eval('location.href'));

    await typeInto(c, v.touch, 'zzqqxxnomatch');
    await waitFor(c, `!!document.querySelector(${JSON.stringify(MSG)})`, 8000);
    ck(`R6f ${v.name}: nothing matches`, (await c.eval(`document.querySelector(${JSON.stringify(MSG)}).textContent`)).includes(`No record matches 'zzqqxxnomatch'`));

    await c.send('Network.enable');
    await c.send('Network.setBlockedURLs', { urls: ['*/api/search*'] });
    await typeInto(c, v.touch, 'hearth');
    await waitFor(c, `!!document.getElementById('searchRetryBtn')`, 8000);
    ck(`R6g ${v.name}: a failed search says so and offers Retry`,
      await c.eval(`(document.querySelector(${JSON.stringify(MSG)})||{textContent:''}).textContent.includes('Search is unavailable') && document.getElementById('searchRetryBtn').textContent.trim()==='Retry'`));
    await c.send('Network.setBlockedURLs', { urls: [] });

    await navigate(c, `${BASE}?r=district:district-amber-root-hollows`);
    await waitFor(c, `!!document.querySelector('#recordPage section[data-relation="Part of"]')`, 20000);
    ck(`A8 ${v.name}: a record link shows "Part of" and "Contains"`,
      await c.eval(`document.querySelector('#recordPage section[data-relation="Part of"]').textContent.includes('Hearthbloom Basin') && document.querySelectorAll('#recordPage section[data-relation="Contains"] [data-record]').length>0`));
    ck(`A8 ${v.name}: the record page does not overflow sideways`, await c.eval(`document.documentElement.scrollWidth<=innerWidth+1`), await c.eval(`document.documentElement.scrollWidth+'/'+innerWidth`));

    await navigate(c, `${BASE}?r=district:nope`);
    await waitFor(c, `!!document.getElementById('recordPage')`, 20000);
    await settle(c);
    ck(`R7f ${v.name}: an unknown record says so and focuses the search box`,
      await c.eval(`document.getElementById('recordPage').textContent.includes('No such record: district:nope') && document.activeElement===document.getElementById('globalSearch')`));
  } catch (e) {
    console.error('SETUP ERROR:', e.message); await c?.kill(); process.exit(e.message === 'CHROME_MISSING' ? 3 : 2);
  }
  await c.kill();
}
const failed = rows.filter((x) => !x).length;
console.log(`\n${rows.length - failed}/${rows.length} assertions passed`);
process.exit(failed ? 1 : 0);
```

Verify-Cmd: python3 scripts/catalog_explorer_web.py --port 8791 & pid=$!; for i in $(seq 1 40); do curl -fs http://127.0.0.1:8791/healthz >/dev/null && break; sleep 0.5; done; node scripts/probes/atlas_records_probe.mjs --url http://127.0.0.1:8791/; rc=$?; kill $pid; exit $rc

- [ ] **Step 2: Run the probe and see it fail for the right reason**

Run the Verify-Cmd. Expected: the first assertion on the phone FAILS (`A14 phone 390x844` with the box off-screen in the closed drawer), then exit 2 on the popover wait (`#searchPopover` does not exist). If `launch`, `navigate` or `c.kill` do not match these calls, read `scripts/probes/atlas_audit_lib.mjs:104-166` and fix the probe's calls, never the library.

- [ ] **Step 3: Move the search box into the top bar (`01_shell_and_styles.html`)**

Cut the `<div class="sidebar-search" role="search">...</div>` block (`:2504-2518`) and paste it inside `<header class="topbar">` where `design-brief.md` places it. Whatever the desktop position, below 768 px it must come directly after `#mobileNavMenuBtn` (DOM order or CSS `order`), because the phone top bar scrolls sideways and the box has to be on screen without scrolling. Keep the class names. Then, inside it after the `<kbd>`, add the checkbox, and add the popover as a sibling directly after `</header>` (`:2564`):

```html
        <label class="topbar-search__archive"><input type="checkbox" id="searchIncludeArchive" /> Include archive</label>
```

```html
    <div id="searchPopover" class="search-popover" role="listbox" aria-label="Search results" hidden></div>
```

Set the input's `placeholder` to `Search every record...` and add `aria-controls="searchPopover"` and `aria-label="Search every record"`. Rename nothing else. Write the CSS for `.topbar-search__archive`, `.search-popover`, `.search-popover__row`, `.search-popover__message`, `.record-page`, `.catalog-stale-banner` exactly as `design-brief.md` specifies, next to the existing `.sidebar-search` rules (`:94-135`); the phone rules go in the existing `@media (max-width: 767px)` block at `:2310`.

- [ ] **Step 4: Create `scripts/atlas_world_web/frontend/02c_records_search.js`**

```js
// 02c_records_search.js — F-216 S1: one search over every record, and the record page.
// Server: GET /api/search, GET /api/record (scripts/atlas_world_web/records.py).
let CURRENT_RECORD = '';           // "<kind>:<id>" while a record page is open, else ''
let SEARCH_POPOVER_SEQ = 0;        // drops answers that arrive after a newer keystroke
let SEARCH_POPOVER_TIMER = 0;

function recordEntryLabel(viewUrl) {
  const tab = new URLSearchParams((viewUrl.split('?')[1] || '')).get('tab');
  const item = NAV_GROUPS.flatMap(g => g.items).find(it => it.id === tab);
  return item ? item.label : 'image';
}

function closeSearchPopover() {
  const pop = document.getElementById('searchPopover');
  if (pop) { pop.hidden = true; pop.innerHTML = ''; }
}

function placeSearchPopover() {
  const pop = document.getElementById('searchPopover');
  const r = document.getElementById('globalSearch').getBoundingClientRect();
  const width = Math.min(480, window.innerWidth - 16);
  pop.style.top = `${Math.round(r.bottom + 6)}px`;
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - width - 8)))}px`;
  pop.style.width = `${width}px`;
}

function showSearchMessage(html) {
  const pop = document.getElementById('searchPopover');
  pop.innerHTML = `<div class="search-popover__message" role="status">${html}</div>`;
  placeSearchPopover();
  pop.hidden = false;
}

async function runRecordSearch(query) {
  const seq = ++SEARCH_POPOVER_SEQ;
  clearTimeout(SEARCH_POPOVER_TIMER);
  if (query.trim().length < 2) { closeSearchPopover(); return; }
  SEARCH_POPOVER_TIMER = setTimeout(() => { if (seq === SEARCH_POPOVER_SEQ) showSearchMessage('Searching...'); }, 150);
  const archive = document.getElementById('searchIncludeArchive').checked ? '1' : '0';
  let body;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&include_archive=${archive}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    body = await res.json();
  } catch (err) {
    if (seq !== SEARCH_POPOVER_SEQ) return;
    clearTimeout(SEARCH_POPOVER_TIMER);
    showSearchMessage('Search is unavailable <button type="button" id="searchRetryBtn" class="joy-button joy-button--outline joy-button--sm">Retry</button>');
    document.getElementById('searchRetryBtn').onclick = () => runRecordSearch(document.getElementById('globalSearch').value);
    return;
  }
  if (seq !== SEARCH_POPOVER_SEQ) return;
  clearTimeout(SEARCH_POPOVER_TIMER);
  if (!body.results.length) { showSearchMessage(`No record matches '${escapeHtml(query.trim())}'`); return; }
  const pop = document.getElementById('searchPopover');
  pop.innerHTML = body.results.map((r, i) => `
    <button type="button" class="search-popover__row" role="option" aria-selected="${i === 0}" data-record="${escapeHtml(r.kind + ':' + r.id)}">
      <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(r.kind.replace(/_/g, ' '))}</span>
      <span class="search-popover__title">${escapeHtml(r.title)}</span>
      ${r.concept === 'legacy' ? '<span class="joy-badge joy-badge--neutral joy-badge--sm">Old concept</span>' : ''}
      <span class="search-popover__summary">${escapeHtml(r.summary)}</span>
    </button>`).join('');
  placeSearchPopover();
  pop.hidden = false;
}

function openRecord(kind, id) {
  CURRENT_RECORD = `${kind}:${id}`;
  closeSearchPopover();
  writeUrlState();
  render();
  const st = document.getElementById('scrollStage');
  if (st) st.scrollTop = 0;
}

function openRecordFromEl(el) {
  const key = el.dataset.record;
  const cut = key.indexOf(':');
  openRecord(key.slice(0, cut), key.slice(cut + 1));
}

async function renderRecordPage(main) {
  const key = CURRENT_RECORD;
  if (main.dataset.record === key) return;   // typing in the box re-renders; do not refetch the same page
  main.dataset.record = key;
  const cut = key.indexOf(':');
  const kind = cut < 0 ? key : key.slice(0, cut), id = cut < 0 ? '' : key.slice(cut + 1);
  document.getElementById('topbarTitle').textContent = 'Record';
  main.innerHTML = `<article id="recordPage" class="record-page" aria-busy="true"><h1 class="record-page__skeleton">&nbsp;</h1></article>`;
  let res, body;
  try {
    res = await fetch(`/api/record?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
    body = await res.json();
  } catch (err) { body = { ok: false, error: 'Search is unavailable' }; }
  if (CURRENT_RECORD !== key) return;         // the user moved on while this was loading
  if (!body.ok) {
    main.innerHTML = `<article id="recordPage" class="record-page"><p role="alert">${escapeHtml(res && res.status === 404 ? `No such record: ${key}` : body.error)}</p></article>`;
    document.getElementById('globalSearch').focus();
    return;
  }
  const r = body.record;
  const groups = body.relations.map(g => `
    <section data-relation="${escapeHtml(g.label)}">
      <h2>${escapeHtml(g.label)} <span class="nav-section-count">${g.items.length}</span></h2>
      <ul>${g.items.map(it => `<li><button type="button" class="rms-link" data-record="${escapeHtml(it.kind + ':' + it.id)}" onclick="openRecordFromEl(this)"><span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(it.kind.replace(/_/g, ' '))}</span> ${escapeHtml(it.title)}</button></li>`).join('')}</ul>
    </section>`).join('');
  main.innerHTML = `
    <article id="recordPage" class="record-page">
      <div class="page-hero__eyebrow">${escapeHtml(r.kind.replace(/_/g, ' '))}${r.concept === 'legacy' ? ' · <span class="joy-badge joy-badge--neutral joy-badge--sm">Old concept</span>' : ''}</div>
      <h1>${escapeHtml(r.title)}</h1>
      ${r.summary ? `<p class="record-page__summary">${escapeHtml(r.summary)}</p>` : ''}
      <p class="record-page__tags">${body.tags.map(t => `<span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(t)}</span>`).join(' ')}</p>
      ${r.viewUrl ? `<p><a id="recordOpenLink" class="joy-button joy-button--outline joy-button--sm" href="${escapeHtml(r.viewUrl)}">Open in ${escapeHtml(recordEntryLabel(r.viewUrl))}</a></p>` : ''}
      ${groups || '<p class="record-page__empty">Nothing is linked to this yet</p>'}
      ${r.sourceFile ? `<p class="mono record-page__source">${escapeHtml(r.sourceFile)}</p>` : ''}
    </article>`;
  document.getElementById('topbarTitle').textContent = r.title;
}

function initRecordSearch() {
  const input = document.getElementById('globalSearch');
  const pop = document.getElementById('searchPopover');
  input.addEventListener('input', () => runRecordSearch(input.value));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) runRecordSearch(input.value); });
  document.getElementById('searchIncludeArchive').addEventListener('change', () => runRecordSearch(input.value));
  pop.addEventListener('click', e => { const row = e.target.closest('[data-record]'); if (row) openRecordFromEl(row); });
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.sidebar-search')) closeSearchPopover();
  });
  window.addEventListener('resize', () => { if (!pop.hidden) placeSearchPopover(); });
  input.addEventListener('keydown', e => {
    const rows = [...pop.querySelectorAll('[data-record]')];
    const at = rows.findIndex(row => row.getAttribute('aria-selected') === 'true');
    if (e.key === 'Escape') { closeSearchPopover(); return; }
    if (pop.hidden || !rows.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === next)));
      rows[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openRecordFromEl(rows[Math.max(0, at)]);
    }
  });
}
```

Add `"02c_records_search.js",` to `FRONTEND_MODULE_FILES` in `scripts/atlas_world_web/frontend_loader.py` directly after `"02b_cartography_pipeline.js",` (the last file closes `</script>`, so a new file cannot be appended at the end).

- [ ] **Step 5: Wire `CURRENT_RECORD` into the URL state and `render()` (`02_state_and_composable_layers.js`)**

Five small edits. Each one is a single line unless shown.
- `syncUrlState()` after `const q = params.get('q');` (`:361`): `CURRENT_RECORD = params.get('r') || '';` (always assigned, so Back to a URL without `r` leaves the record page).
- `writeUrlState()` after `if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);` (`:522`): `if (CURRENT_RECORD) params.set('r', CURRENT_RECORD);`
- `jumpToEntity()` (`:617`) and `switchTab()` (`:729`): add `CURRENT_RECORD = '';` as the first line of each.
- `render()` (`:794`), directly after `const main = document.getElementById('mainContent');`:

```js
  if (CURRENT_RECORD) {
    const bar = document.getElementById('subViewBar');
    if (bar) bar.hidden = true;
    const host = document.getElementById('panelHost');
    if (host) host.hidden = true;
    main.hidden = false;
    renderRecordPage(main);
    return;
  }
  delete main.dataset.record;
```

  Before writing this, read `panelDispatch()` and `renderSubViewBar()` (`grep -n "function panelDispatch\|function renderSubViewBar" scripts/atlas_world_web/frontend/*.js`) and mirror how they show and hide `#panelHost`, `#mainContent` and `#subViewBar`, so leaving a record page for a panel tab restores the panel.
- `init()` (`:694-700`): after the existing `searchInput.addEventListener('input', ...)` block add `initRecordSearch();`. In the existing global `keydown` handler's `Escape` branch (`:710`) add `closeSearchPopover();`.

- [ ] **Step 6: Run the probe and see it pass**

Run the Verify-Cmd from Step 1. Expected: `24/24 assertions passed`, exit 0.
Run: `./scripts/fastcheck.sh`. Expected: PASS.

- [ ] **Step 7: Put the probe in Gate 1 (`scripts/precheck.sh`)**

- `:563` `EXPLORER_PROBE_PATHS`: add `scripts/build_catalog_db\.py|` after the opening `^(`.
- In `explorer_probes()` (`:596-640`) add a third probe the same way the two existing ones run: declare `rec_out="$log.rec" rec_rc="$log.rec.rc"` and `rp=""`; `start_probe "$REPO_ROOT/scripts/probes/atlas_records_probe.mjs" "http://127.0.0.1:$port/" "$rec_out" "$rec_rc"; rp=$!`; add `"$rp"` to the `wait` and to `kill_tree` in the `INT TERM` trap; print `echo "--- atlas_records_probe.mjs"; grep -E "^FAIL" "$rec_out" || true; tail -9 "$rec_out"`; add `[ "$(cat "$rec_rc" 2>/dev/null)" = "0" ] || rc=1`; add both files to the `rm -f`. Read how exit code 3 (Chrome missing) is treated for the existing probes in this function and treat the new one the same.

Run: `./scripts/precheck.sh --no-install`. Expected: `RESULT: GATE 1 PASS`, with `atlas web: node --test suite` and `atlas explorer: UX + touch probes (F-156)` both PASS.

- [ ] **Step 8: Update `README.md`**

In the edit-host section (`README.md:277-292`) add a short "Game DB search and record links" subsection: the search box in the top bar and Cmd/Ctrl+K; record links `/?r=<kind>:<id>`; `GET /api/search?q=&include_archive=`, `GET /api/record?kind=&id=`; the DB rebuilds at edit-host start when `scripts/build_catalog_db.py`, `content/` or `contracts/content/` is newer, and a failed rebuild keeps the old DB and shows a banner; env vars `ATLAS_CATALOG_DB`, and the test-only `ATLAS_STUDIO_DIR`, `ATLAS_TAGS_FILE`, `ATLAS_CATALOG_BUILD_FAIL`; hand tags in `content/tags.json` as `{"<kind>:<id>": ["tag"]}`.

- [ ] **Step 9: Commit**

```bash
git add scripts/atlas_world_web/frontend scripts/atlas_world_web/frontend_loader.py scripts/probes/atlas_records_probe.mjs scripts/precheck.sh README.md
git commit -m "feat(explorer): top-bar search over every record and record pages with links (F-216 S1)"
```

- [ ] **Step 10: Phase gate and live check (controller)**

1. Restart the edit host from the feature worktree on `:8788` and check where the owner looks: `curl -s "http://atlas-edit.joymify.local.com/api/search?q=hearthbloom" | head -c 300` shows the continent first; `curl -sL -o /dev/null -w "%{http_code} %{url_effective}\n" "http://atlas-edit.joymify.local.com/?r=continent:continent-01-hearthbloom-basin"` gives 200.
2. `ui-visual-verify`: `~/.claude/skills/ui-visual-verify/shoot.mjs` at 390x844 and 1280x800, light and dark, for Home (`/?tab=overview`), the open popover and a record page. Read the images. Fix every lint finding.
3. `impeccable critique` on those screenshots, written to `<feature folder>/critique.md`; fix every P0 and P1; re-shoot.
4. Reviews: `code-reviewer` + `typescript-reviewer` on Task 3's commit; ONE fix round; `/simplify`; re-run the probe and `./scripts/precheck.sh --no-install`.
5. Check the "Open in <entry>" link by a real click on one continent, one node and one mob record: the Studio tab opens with that continent or node selected, the Monsters tab with that mob. If a tab ignores `focus=`, the link still has to open the right tab; record what it does in the audit trail.
6. Show the owner the final phone and desktop screenshots with the direct link `http://atlas-edit.joymify.local.com/?r=continent:continent-01-hearthbloom-basin` (A14), then `psrw ship`.

---

## Out of scope for this plan

- S2: 11-entry sidebar, sub-view pills, Home with counts by kind, removing the concept-art tab's own search box, `DESIGN.md` / `PRODUCT.md`.
- S3: dropping dead tables and views, the Archive entry, the 4 dangling `spineNodeId` values, A12.
- S4: review inbox, verdicts, work orders, `/api/studio/self-evaluation`, A13.
- A relation graph view, a tag editing UI, shrinking `/api/bundle`.

## Self-review (2026-11-15)

- Spec coverage for S1: R1 (Task 2 Step 5, A1 test), R1a (Task 1 Step 5d, A2 file test), R1f (Task 2 Step 5, A2 banner test), R2 (Task 1 Step 4, A3 test), R2f (Task 1 Steps 4-5b, R2f test), R3 / R3f (Task 1 Step 4, A4 tests), R4 / R4f (Task 1 Step 4, A5 test), R5 (unchanged guard, existing read-only test), R6 / R6f / R6g (Tasks 2-3, A6 test, probe), R7 / R7f (Tasks 2-3, A8 test, probe), R8 (Task 3 Step 5, probe A9), R9 (Tasks 1-3, A10 test, "Old concept" label), A14 (probe + Step 10), A15 (Step 7 and Step 10).
- No architecture diagram exists for the explorer, so none is updated; the README step covers the new routes and env vars.
- Types and names are consistent across tasks: `catalog_db_path`, `build_index`, `CatalogIndexError`, `records.search`, `records.record`, `openRecord`, `CURRENT_RECORD`, the DOM ids in Task 3's Interfaces block.
