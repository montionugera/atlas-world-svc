import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, statSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'scripts/catalog_explorer_web.py'), 'utf8');
const ROUTES_SRC = readFileSync(path.join(ROOT, 'scripts/atlas_world_web/routes.py'), 'utf8');

function writeRoutes() {
  const body = SRC.slice(SRC.indexOf('def do_POST'), SRC.indexOf('def main()'));
  const fromChain = [...body.matchAll(/parsed\.path == "([^"]+)"/g)].map((m) => m[1]);
  const postTable = ROUTES_SRC.slice(ROUTES_SRC.indexOf('"POST": ['), ROUTES_SRC.indexOf('"DELETE"'));
  const fromTable = [...postTable.matchAll(/\("(\/api\/[^"]+)"/g)].map((m) => m[1]);
  return [...fromChain, ...fromTable.map((p) => (p.endsWith('/') ? `${p}x` : p))];
}

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function startServer(env) {
  const port = await freePort();
  const child = spawn('python3', ['scripts/catalog_explorer_web.py', '--port', String(port)], {
    cwd: ROOT, env: { ...process.env, ATLAS_READ_ONLY: '', ...env }, stdio: 'ignore',
  });
  // 60s: with the flag unset, a fresh worktree builds the catalog before it listens.
  for (let i = 0; i < 600; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) {
        return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('server did not start');
}

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const s = statSync(p); h.update(`${p}:${s.size}:${s.mtimeMs}\n`); }
    }
  };
  walk(dir);
  return h.digest('hex');
}

test('write route list is derived and non-trivial', () => {
  const routes = writeRoutes();
  assert.ok(routes.includes('/api/rebuild'));
  assert.ok(routes.includes('/api/review-queue/asset-verdicts'));
  assert.ok(routes.includes('/api/map-builder/x'));
  assert.ok(routes.length >= 14, String(routes.length));
});

test('read-only refuses every write, leaves the tree alone', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1', ATLAS_RELEASE: '9.9', ATLAS_COMMIT: 'a'.repeat(40) });
  t.after(() => srv.stop());
  const before = treeHash(path.join(ROOT, 'content'));
  for (const route of [...writeRoutes(), '/api/not-a-route']) {
    const res = await fetch(srv.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 403, route);
    const body = await res.json();
    assert.equal(body.ok, false, route);
    assert.equal(body.error.code, 'read_only', route);
  }
  const del = await fetch(`${srv.url}/api/map-builder/x`, { method: 'DELETE' });
  assert.equal(del.status, 403);
  assert.equal(treeHash(path.join(ROOT, 'content')), before);
});

test('read-only reports the baked version, marks the body, never rebuilds', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1', ATLAS_RELEASE: '9.9', ATLAS_COMMIT: 'a'.repeat(40) });
  t.after(() => srv.stop());
  assert.deepEqual(await (await fetch(`${srv.url}/api/runtime`)).json(),
    { readOnly: true, release: '9.9', commit: 'a'.repeat(40) });
  assert.match(await (await fetch(srv.url)).text(), /<body data-read-only="1">/);
});

test('read-only never builds the catalog database, even when it is missing', async (t) => {
  // The guard in ensure_catalog_db runs before the server listens, so the DB must be
  // absent at start for the test to be able to fail. build/ is untracked.
  const db = path.join(ROOT, 'build/catalog.sqlite');
  const aside = `${db}.f168-aside`;
  const had = existsSync(db);
  if (had) renameSync(db, aside);
  t.after(() => { if (had) renameSync(aside, db); }); // renameSync replaces a rebuilt copy
  const srv = await startServer({ ATLAS_READ_ONLY: '1' });
  t.after(() => srv.stop());
  await fetch(`${srv.url}/api/sql?q=${encodeURIComponent('SELECT 1')}`);
  assert.equal(existsSync(db), false, 'read-only mode built build/catalog.sqlite');
});

test('read-only caches vendor files by ETag only', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1' });
  t.after(() => srv.stop());
  const res = await fetch(`${srv.url}/vendor/ol.css`);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(`${srv.url}/vendor/ol.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('read-only caches real thumb files by ETag only and responds 304 on match', async (t) => {
  const thumbsDir = path.join(ROOT, 'game-client/assets/.thumbs');
  const realThumb = readdirSync(thumbsDir).find((f) => f.endsWith('.webp'));
  assert.ok(realThumb, 'at least one real thumb exists');
  const srv = await startServer({ ATLAS_READ_ONLY: '1' });
  t.after(() => srv.stop());
  const res = await fetch(`${srv.url}/thumbs/${realThumb}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(`${srv.url}/thumbs/${realThumb}`, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('read-only answers a missing thumb with the placeholder, never a substitute', async (t) => {
  const srv = await startServer({ ATLAS_READ_ONLY: '1' });
  t.after(() => srv.stop());
  const res = await fetch(`${srv.url}/thumbs/0000000000000000.webp`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-thumb-missing'), '1');
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  const strict = await fetch(`${srv.url}/thumbs/0000000000000000.webp?strict=1`);
  assert.equal(strict.status, 404);
});

test('flag unset keeps behaviour', async (t) => {
  const srv = await startServer({});
  t.after(() => srv.stop());
  assert.deepEqual(await (await fetch(`${srv.url}/api/runtime`)).json(),
    { readOnly: false, release: null, commit: null });
  const res = await fetch(`${srv.url}/api/not-a-route`, { method: 'POST' });
  assert.equal(res.status, 404);
  const vendor = await fetch(`${srv.url}/vendor/ol.css`);
  assert.equal(vendor.headers.get('cache-control'), 'public, max-age=86400');
  const thumb = await fetch(`${srv.url}/thumbs/0000000000000000.webp`);
  assert.equal(thumb.headers.get('x-thumb-missing'), null);
  assert.doesNotMatch(await (await fetch(srv.url)).text(), /data-read-only="1">/);
});
