// scripts/tests/atlas-web-verify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/verify-atlas-web.sh');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const version = JSON.parse(execFileSync('git', ['show', 'HEAD:.release.json'], { cwd: ROOT, encoding: 'utf8' })).version;

function stub({ commit = head, release = version, sqlCount = null, artBody = null } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/runtime') {
      res.end(JSON.stringify({ readOnly: true, release, commit }));
    } else if (url.pathname === '/api/sql') {
      res.end(JSON.stringify({ ok: true, rows: [[sqlCount ?? -1]] }));
    } else {
      res.end(artBody ?? readFileSync(path.join(ROOT, url.pathname)));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Async on purpose: the stub lives in this process, and spawnSync would stop it answering.
function run(port) {
  return new Promise((resolve) => {
    const child = spawn(SCRIPT, {
      env: { ...process.env, ATLAS_WEB_URL: `http://127.0.0.1:${port}`, ATLAS_WEB_RETRY_SECONDS: '2' },
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stdout += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr: '' }));
  });
}

test('a wrong commit fails and names both commits', async (t) => {
  const s = await stub({ commit: 'b'.repeat(40) });
  t.after(() => s.close());
  const r = await run(s.address().port);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, new RegExp('b'.repeat(40)));
  assert.match(r.stdout + r.stderr, new RegExp(head));
});

test('an unreachable host fails with the word unreachable', () => {
  const r = spawnSync(SCRIPT, {
    encoding: 'utf8',
    env: { ...process.env, ATLAS_WEB_URL: 'http://127.0.0.1:9', ATLAS_WEB_RETRY_SECONDS: '1' },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /unreachable/);
});

test('changed art fails', async (t) => {
  const s = await stub({ artBody: 'not the art', sqlCount: 1 });
  t.after(() => s.close());
  const r = await run(s.address().port);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /md5/);
});

test('a wrong count fails naming the expected count, and the right count passes', async (t) => {
  const bad = await stub({ sqlCount: -1 });
  t.after(() => bad.close());
  const first = await run(bad.address().port);
  assert.notEqual(first.status, 0);
  const want = first.stdout.match(/from HEAD has (\d+)/);
  assert.ok(want, first.stdout);
  const good = await stub({ sqlCount: Number(want[1]) });
  t.after(() => good.close());
  const second = await run(good.address().port);
  assert.equal(second.status, 0, second.stdout);
  assert.match(second.stdout, /✅ atlas web serves/);
});

test('every read uses the one resolved commit', () => {
  assert.doesNotMatch(readFileSync(SCRIPT, 'utf8'), /(show "?HEAD:|archive[^\n]* HEAD )/);
});

test('the art sample is not an LFS path', () => {
  assert.match(
    readFileSync(SCRIPT, 'utf8'),
    /ls-tree -r --name-only "\$WANT_COMMIT" -- content\/concept-art\/images \| grep -E "\\\.webp\$"/,
  );
});
