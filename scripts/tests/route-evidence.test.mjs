import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Release cleanup moves a shipped feature folder into _archive/<version>/, so
// look in the live backlog first, then in any archived release.
const F169 = 'F-169-simplify-atlas-web-one-read-only-page-ag/route-evidence.md';
const BACKLOG = path.join(ROOT, '.claude/refined_backlog');
const ARCHIVE = path.join(BACKLOG, '_archive');
const EVIDENCE_PATH = [path.join(BACKLOG, F169),
  ...(existsSync(ARCHIVE) ? readdirSync(ARCHIVE).sort().map((v) => path.join(ARCHIVE, v, F169)) : [])]
  .find((p) => existsSync(p)) ?? path.join(BACKLOG, F169);

test('route-evidence.md exists and documents all 14 write routes with explicit dispositions', () => {
  assert.ok(existsSync(EVIDENCE_PATH), 'route-evidence.md must exist in the backlog directory');
  const content = readFileSync(EVIDENCE_PATH, 'utf8');

  // Verify KEEP routes (3 groups)
  assert.match(content, /\/api\/map-builder\/\*[\s\S]*?\*\*KEEP\*\*/);
  assert.match(content, /\/api\/review-queue\/asset-verdicts[\s\S]*?\*\*KEEP\*\*/);
  assert.match(content, /\/api\/review-queue\/work-orders[\s\S]*?\*\*KEEP\*\*/);

  // Verify REMOVE routes (11 routes)
  const removeRoutes = [
    '/api/rebuild',
    '/api/sim',
    '/api/review-queue/verdict',
    '/api/palette/toggle-asset',
    '/api/studio/undo',
    '/api/studio/ai-edit',
    '/api/map/update-structure',
    '/api/studio/launch-3d',
    '/api/studio/rationale/update',
    '/api/studio/generate-children',
    '/api/studio/map-layers',
  ];

  for (const r of removeRoutes) {
    const pattern = new RegExp(`${r.replace(/\//g, '\\/').replace(/\*/g, '\\*')}[\\s\\S]*?\\*\\*REMOVE\\*\\*`);
    assert.match(content, pattern, `Expected route ${r} to be documented and marked REMOVE`);
  }

  // Count total decisions in table
  const keepMatches = content.match(/\|\s*\*\*KEEP\*\*\s*\|/g) || [];
  const removeMatches = content.match(/\|\s*\*\*REMOVE\*\*\s*\|/g) || [];
  assert.equal(keepMatches.length, 3, 'Expected exactly 3 KEEP route entries in evidence table');
  assert.equal(removeMatches.length, 11, 'Expected exactly 11 REMOVE route entries in evidence table');
});
