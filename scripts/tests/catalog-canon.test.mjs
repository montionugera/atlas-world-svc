import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('catalog DB carries canon_entries and concept_art', () => {
  execFileSync('python3', ['scripts/build_catalog_db.py'], { cwd: root, stdio: 'pipe' });
  const q = `import sqlite3,json;c=sqlite3.connect('build/catalog.sqlite');print(json.dumps({'k':dict(c.execute('select kind,count(*) from canon_entries group by kind').fetchall()),'a':c.execute('select count(*) from concept_art').fetchone()[0]}))`;
  const out = JSON.parse(execFileSync('python3', ['-I', '-c', q], { cwd: root }).toString());
  const g = JSON.parse(readFileSync(path.join(root, 'content/studio/canon/glossary.json'), 'utf8'));
  const art = JSON.parse(readFileSync(path.join(root, 'content/concept-art/index.json'), 'utf8'));
  assert.equal(out.k.chapter, g.chapters.length);
  assert.equal(out.k.god, g.gods.length);
  assert.equal(out.k.race, g.races.length);
  assert.equal(out.a, art.items.length);
});

test('decision ledger: loaded into DB, ids unique, applied rows point at real files', () => {
  const led = JSON.parse(readFileSync(path.join(root, 'content/studio/canon/decisions.json'), 'utf8')).decisions;
  assert.equal(new Set(led.map((d) => d.id)).size, led.length, 'duplicate decision id');
  for (const d of led.filter((x) => x.status === 'applied')) {
    assert.ok(d.applied_in && existsSync(path.join(root, d.applied_in)), `${d.id}: applied_in missing`);
  }
  const by = (s) => led.filter((d) => d.status === s).length;
  assert.ok(by('applied') >= 5 && by('decided') >= 3 && by('proposed') >= 1);
  execFileSync('python3', ['scripts/build_catalog_db.py'], { cwd: root, stdio: 'pipe' });
  const q = `import sqlite3;print(sqlite3.connect('build/catalog.sqlite').execute('select count(*) from canon_decisions').fetchone()[0])`;
  assert.equal(Number(execFileSync('python3', ['-I', '-c', q], { cwd: root }).toString()), led.length);
});

test('F-231 glossary contract: towns, casts, hooks, region kinds, rules', () => {
  const g = JSON.parse(readFileSync(path.join(root, 'content/studio/canon/glossary.json'), 'utf8'));
  const ok = new Set(['canon', 'chosen', 'proposed']);
  assert.equal(g.towns.length, 7);
  for (const t of g.towns) assert.ok(ok.has(t.status) && t.source, t.id);
  const raceIds = new Set(g.races.map((r) => r.id));
  assert.equal(g.towns.filter((t) => raceIds.has(t.race)).length, 6);
  const casts = Object.entries(g.npcs.town);
  const locked = new Set([...g.npcs.travellers.map((t) => t.name), ...g.npcs.scar_renames.map((r) => r.name)]);
  assert.equal(casts.length, 6);
  for (const [town, list] of casts) {
    assert.ok(list.length >= 3, town);
    if (town === 'maro_bell') continue;
    for (const n of list) {
      // a locked traveller or a scar rename is canon; the cast role is what is proposed. Everyone else is new.
      if (locked.has(n.name)) assert.deepEqual([n.status, n.role_status], ['canon', 'proposed'], n.name);
      else assert.deepEqual([n.status, n.role_status], ['proposed', undefined], n.name);
    }
  }
  for (const r of g.races) assert.ok(r.hook.motive, r.id);
  for (const r of g.regions) assert.ok(['chapter_region', 'kiln_site', 'hub'].includes(r.kind), r.name);
  for (const r of g.races) {
    assert.ok(r.hook.resolution && r.culture.text && r.culture.status === 'proposed' && r.culture.source, r.id);
  }
  for (const t of g.towns.filter((x) => x.race)) assert.ok(t.geography && t.geography.source, t.id);
  const silme = g.towns.find((t) => t.id === 'silme_echo');
  assert.equal(silme.look_status, 'older proposal');
  assert.ok(g.npcs.town.linde_glaze.find((n) => n.name === 'Sera').name_flag);
  const rule = (id) => g.world_model.rules.find((r) => r.id === id);
  assert.equal(rule('hooks_converge').status, 'chosen');
  assert.equal(rule('scale_conflict').status, 'proposed');
  assert.ok(!rule('spatial_gap_ids'), 'decision gpt-open-10 is applied, so the rule is not also proposed');
  assert.ok(g.world_model.rules.length >= 10);
  for (const r of g.world_model.rules) assert.ok(ok.has(r.status) && r.source, r.id);
});

test('F-231 db: a traveller row is canon (not proposed); a cast on an unknown town fails the build', () => {
  execFileSync('python3', ['scripts/build_catalog_db.py'], { cwd: root, stdio: 'pipe' });
  const q = `import sqlite3;print(sqlite3.connect('build/catalog.sqlite').execute("select status from canon_entries where kind='npc' and id in ('Mika','Pip') order by id").fetchall())`;
  assert.equal(execFileSync('python3', ['-I', '-c', q], { cwd: root }).toString().trim(), "[('canon',), ('canon',)]");
  const py = `import sys,json;sys.path.insert(0,'scripts');import build_catalog_db as b
g=json.load(open('content/studio/canon/glossary.json'));g['npcs']['town']['nowhere']=[{'name':'X'}]
try: b.canon_rows(g)
except ValueError as e: print('ERR',e)`;
  assert.match(execFileSync('python3', ['-I', '-c', py], { cwd: root }).toString(), /ERR .*nowhere/);
});
