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
