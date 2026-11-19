import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'observatory-work-assets-'));
const DB = path.join(tmp, 'catalog.sqlite');
test.after(() => rmSync(tmp, { recursive: true, force: true }));

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn('python3', ['scripts/catalog_explorer_web.py', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, ATLAS_READ_ONLY: '', ATLAS_CATALOG_DB: DB, ...env },
    stdio: 'ignore',
  });
  for (let i = 0; i < 600; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) {
        return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
      }
    } catch { /* waiting for startup */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('server did not start');
}

const get = async (srv, p) => {
  const res = await fetch(srv.url + p);
  return { status: res.status, body: await res.json() };
};

test.before(() => {
  const r = spawnSync('python3', ['scripts/build_catalog_db.py'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ATLAS_CATALOG_DB: DB },
  });
  assert.equal(r.status, 0, r.stderr);
});

test('SQLite index populates backlog_features, asset_3d_provenance, and records_fts', () => {
  const catalog = JSON.parse(readFileSync(path.join(ROOT, '.claude/refined_backlog/_catalog.json'), 'utf8'));
  const q = spawnSync('python3', ['-I', '-c',
    `import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1])
print(json.dumps({
  "features_tbl": c.execute("SELECT count(*) FROM backlog_features").fetchone()[0],
  "features_rec": c.execute("SELECT count(*) FROM records WHERE kind='feature'").fetchone()[0],
  "assets_tbl": c.execute("SELECT count(*) FROM asset_3d_provenance").fetchone()[0],
  "assets_rec": c.execute("SELECT count(*) FROM records WHERE kind='asset_3d'").fetchone()[0],
  "fts_eq": c.execute("SELECT count(*) FROM records_fts").fetchone()[0] == c.execute("SELECT count(*) FROM records").fetchone()[0],
}))`, DB], { encoding: 'utf8' });
  assert.equal(q.status, 0, q.stderr);
  const got = JSON.parse(q.stdout);
  assert.equal(got.features_tbl, catalog.length);
  assert.equal(got.features_rec, catalog.length);
  assert.ok(got.assets_tbl > 0, 'expected on-disk .glb assets to be indexed');
  assert.equal(got.assets_rec, got.assets_tbl);
  assert.equal(got.fts_eq, true);
});

test('GET /api/work-index exposes active release and filters F-* features', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const releaseJson = JSON.parse(readFileSync(path.join(ROOT, '.release.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(path.join(ROOT, '.claude/refined_backlog/_catalog.json'), 'utf8'));

  const all = await get(srv, '/api/work-index');
  assert.equal(all.status, 200);
  assert.equal(all.body.ok, true);
  assert.equal(all.body.release.version, releaseJson.version);
  assert.equal(all.body.release.inProgress, Boolean(releaseJson.in_progress));
  assert.equal(all.body.counts.total, catalog.length);
  assert.equal(all.body.features.length, catalog.length);

  const active = await get(srv, '/api/work-index?status=active');
  assert.equal(active.status, 200);
  assert.ok(active.body.features.length > 0);
  for (const f of active.body.features) {
    assert.ok(['open', 'claimed', 'shipped'].includes(f.status), `unexpected status: ${f.status}`);
  }

  const current = await get(srv, '/api/work-index?release=current&limit=5');
  assert.equal(current.status, 200);
  assert.ok(current.body.features.length > 0 && current.body.features.length <= 5);
  for (const f of current.body.features) {
    assert.equal(f.releaseVersion, releaseJson.version);
    assert.equal(f.inActiveRelease, true);
  }

  const byQuery = await get(srv, '/api/work-index?q=F-239');
  assert.equal(byQuery.status, 200);
  assert.ok(byQuery.body.features.some((f) => f.id === 'F-239'));
});

test('GET /api/assets/provenance maps on-disk .glb files to manifest, source, and budgets', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const all = await get(srv, '/api/assets/provenance?limit=10');
  assert.equal(all.status, 200);
  assert.equal(all.body.ok, true);
  assert.ok(all.body.counts.totalGlb >= 600, `expected >= 600 glb files, got ${all.body.counts.totalGlb}`);
  assert.equal(all.body.assets.length, 10);
  assert.ok(all.body.budgets.character.maxTriangles === 10000);
  assert.ok(Array.isArray(all.body.missingOrExternal));

  const knight = await get(srv, '/api/assets/provenance?q=player_knight');
  assert.equal(knight.status, 200);
  const hit = knight.body.assets.find((a) => a.id === 'characters/player_knight.glb');
  assert.ok(hit, 'characters/player_knight.glb should be present');
  assert.equal(hit.provenanceStatus, 'tracked');
  assert.equal(hit.kind, 'character');
  assert.equal(hit.source, 'internal');
  assert.equal(hit.tier, 'bespoke');
  assert.equal(hit.budget.maxTriangles, 10000);
  assert.equal(hit.budget.maxTextureSize, 1024);
  assert.ok(hit.bytes > 0);
  assert.ok(hit.manifestEntries.some((e) => e.manifest === 'runtime' && e.key === 'player'));

  const untracked = await get(srv, '/api/assets/provenance?status=untracked');
  assert.equal(untracked.status, 200);
  for (const a of untracked.body.assets) {
    assert.equal(a.provenanceStatus, 'untracked');
    assert.equal(a.manifestEntries.length, 0);
  }
});

test('Unified /api/search and /api/record expose feature and asset_3d provenance', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const fSearch = await get(srv, '/api/search?q=F-239');
  assert.equal(fSearch.status, 200);
  assert.ok(fSearch.body.results.some((r) => r.kind === 'feature' && r.id === 'F-239'));

  const fRec = await get(srv, '/api/record?kind=feature&id=F-239');
  assert.equal(fRec.status, 200);
  assert.equal(fRec.body.record.kind, 'feature');
  assert.equal(fRec.body.feature.id, 'F-239');
  assert.equal(fRec.body.feature.fromIdea, 'I-324');

  const aSearch = await get(srv, '/api/search?q=player_knight');
  assert.equal(aSearch.status, 200);
  assert.ok(aSearch.body.results.some((r) => r.kind === 'asset_3d' && r.id === 'characters/player_knight.glb'));

  const aRec = await get(srv, '/api/record?kind=asset_3d&id=characters/player_knight.glb');
  assert.equal(aRec.status, 200);
  assert.equal(aRec.body.record.kind, 'asset_3d');
  assert.equal(aRec.body.assetProvenance.provenanceStatus, 'tracked');
  assert.equal(aRec.body.assetProvenance.budget.maxTriangles, 10000);
});

test('Over-byte-budget detection and graceful fallback when optional files are absent', async (t) => {
  const synthAssets = path.join(tmp, 'synth-assets');
  mkdirSync(path.join(synthAssets, 'characters'), { recursive: true });
  writeFileSync(path.join(synthAssets, 'characters/heavy.glb'), Buffer.alloc(2048, 1));
  writeFileSync(path.join(synthAssets, 'manifest.json'), JSON.stringify({
    version: 2,
    entries: {
      heavy_hero: {
        scene: 'res://assets/characters/heavy.glb',
        kind: 'pipelineCharacter',
        source: 'internal',
        license: 'CC0',
        tier: 'bespoke',
      },
    },
  }));
  const synthForge = path.join(tmp, 'forge.config.json');
  writeFileSync(synthForge, JSON.stringify({
    kinds: {
      pipelineCharacter: { maxTriangles: 15000, maxTextureSize: 1024, maxBytes: 1024 },
    },
  }));

  const srv = await startServer({
    ATLAS_ASSETS_DIR: synthAssets,
    ATLAS_FORGE_CONFIG: synthForge,
    ATLAS_RELEASE_FILE: path.join(tmp, 'nonexistent-release.json'),
    ATLAS_BACKLOG_CATALOG: path.join(tmp, 'nonexistent-catalog.json'),
  });
  t.after(() => srv.stop());

  const work = await get(srv, '/api/work-index');
  assert.equal(work.status, 200);
  assert.equal(work.body.release, null);
  assert.deepEqual(work.body.features, []);

  const prov = await get(srv, '/api/assets/provenance?over_budget=1');
  assert.equal(prov.status, 200);
  assert.equal(prov.body.counts.overByteBudget, 1);
  assert.equal(prov.body.assets.length, 1);
  assert.equal(prov.body.assets[0].id, 'characters/heavy.glb');
  assert.equal(prov.body.assets[0].bytesOk, false);
});
