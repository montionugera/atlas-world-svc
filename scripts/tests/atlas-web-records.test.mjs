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
