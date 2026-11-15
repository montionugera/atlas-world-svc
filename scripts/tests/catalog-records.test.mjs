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

test('old-concept concept art is a legacy record, the rest stays studio', () => {
  const legacy = sql(good.db, "select id from records where kind='concept_art' and concept='legacy' order by id").map((r) => r[0]);
  assert.deepEqual(legacy, [
    'character-race-dwarf-kiln-artisan',
    'character-race-dwarf-ondo-base-body-female',
    'character-race-furral-galvanic-scout-sheet',
    'character-race-furral-galvanic-scout-turnaround',
  ]);
  assert.equal(one(good.db, "select count(*) from records where kind='concept_art'"), one(good.db, 'select count(*) from concept_art'));
});
