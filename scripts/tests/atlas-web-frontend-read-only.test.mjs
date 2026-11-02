import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONT = path.join(ROOT, 'scripts/atlas_world_web/frontend');
const slices = readdirSync(FRONT).map((f) => [f, readFileSync(path.join(FRONT, f), 'utf8')]);
const shell = slices.find(([f]) => f.startsWith('01_'))[1];
const all = slices.map(([, s]) => s).join('\n');
const panel = (p) => readFileSync(path.join(ROOT, 'atelier/atlas-world-panels/js', p), 'utf8');

// spec "Hidden controls", in spec order. Every handler that previously reached a write route.
const REMOVED_HANDLERS = [
  'rebuildDb', 'triggerBalanceSim', 'submitReviewVerdict', 'togglePaletteAsset',
  'undoStudioSnapshot', 'runAiStudioAgent', 'applyInteractiveMapStructure', 'launch3dClient',
  'saveStudioRationaleForm', 'toggleStudioQualityPillar', 'triggerStudioChildGeneration',
  'saveIncrementalComposableFeaturesToDisk',
];

// Every event attribute (onclick, onchange, onkeydown, ...) in the slices whose value calls `handler(`.
function eventAttrsCalling(handler) {
  const attrs = new Set();
  for (const m of all.matchAll(/\b(on[a-z]+)\s*=\s*"([^"]*)"/g)) {
    if (m[2].includes(`${handler}(`)) attrs.add(m[1]);
  }
  return attrs;
}

test('read-only stylesheet hides data-write-control', () => {
  const rule = shell.slice(shell.indexOf('/* read-only controls */'), shell.indexOf('/* end read-only controls */'));
  assert.ok(rule.includes('body[data-read-only] [data-write-control] { display: none !important; }'));
});

test('no removed write handlers appear in frontend event attributes', () => {
  for (const h of REMOVED_HANDLERS) {
    const attrs = eventAttrsCalling(h);
    assert.equal(attrs.size, 0, `${h} still exists in event attributes: ${[...attrs].join(', ')}`);
  }
});

test('no removed studio write routes appear anywhere in frontend slices', () => {
  const removedRoutes = [
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
  for (const [file, sliceContent] of slices) {
    for (const route of removedRoutes) {
      assert.ok(!sliceContent.includes(route), `Frontend slice ${file} still references deleted route ${route}`);
    }
  }
});

test('loadRuntime formats read-only badge with release/commit and editable badge with host', () => {
  const code = slices.find(([f]) => f.startsWith('02_state'))[1];
  assert.ok(code.includes('Read-only · ${rt.release} · ${String(rt.commit).slice(0, 7)}'), 'Must format read-only release status');
  assert.ok(code.includes("Editable · ${location.host || 'local'}") || (code.includes('Editable · ') && code.includes('location.host')), 'Must format editable status with host');
});

test('panel write controls carry the marker', () => {
  for (const p of ['forge/forge.mjs', 'review/ui.mjs']) {
    assert.ok(panel(p).includes('data-write-control') || panel(p).includes('writeControl'), p);
  }
});

test('no frontend slice writes outside atlasWrite', () => {
  for (const [f, s] of slices) {
    const direct = s.split('\n').filter((l) => /\bfetch\(/.test(l) && /'POST'|"POST"|'DELETE'/.test(l));
    assert.deepEqual(direct, [], f);
    const multi = [...s.matchAll(/\bfetch\([^)]*?\{\s*method:/g)].filter((m) => !m[0].includes('GET'));
    assert.equal(multi.length, 0, f);
  }
});

test('the verdict sync starts in one place, and never on a read-only page', () => {
  assert.doesNotMatch(panel('panels/assets.mjs'), /startVerdictSync/);
  assert.match(panel('review/ui.mjs'), /hosted\(\) && !document\.body\.hasAttribute\("data-read-only"\)/);
});

test('the excluded Map Builder tab renders its message and offers no recheck', () => {
  const src = panel('map-builder.mjs');
  const guard = src.slice(src.indexOf('hasAttribute("data-read-only")'), src.indexOf('await checkHealth(apiBase)'));
  assert.ok(guard.includes('main.appendChild(section)'));
  assert.ok(guard.includes('excluded: true'));
  assert.match(panel('panels/map-builder.mjs'), /!result\.ready && !result\.excluded/);
});

test('status line is announced to screen readers', () => {
  assert.match(shell, /id="topbarStatus"[^>]*role="status"/);
});

test('status version link is styled for readability and mobile tap target', () => {
  assert.match(shell, /#topbarStatus a\s*\{[^}]*color:\s*inherit;[^}]*text-decoration:\s*underline;[^}]*text-underline-offset:\s*2px;?[^}]*\}/);
  assert.match(shell, /#topbarStatus a\s*\{[^}]*padding:\s*16px 0;[^}]*margin:\s*-16px 0;[^}]*display:\s*inline-block;?[^}]*\}/);
});

test('map layer save no longer swallows failure', () => {
  assert.doesNotMatch(all, /map-layers[\s\S]{0,200}\.catch\(\(\) => \{\}\)/);
});

test('read-only review bars never claim marks are saved or saving', () => {
  const verdicts = panel('panels/review-verdicts.mjs');
  assert.match(verdicts, /data-read-only[\s\S]{0,200}not saved here/);
  assert.match(panel('review/ui.mjs'), /hosted\(\) && document\.body\.hasAttribute\("data-read-only"\)\) \{[^}]*bar\.hidden = true/);
});

test('both forge write-control markers survive', () => {
  assert.ok((panel('forge/forge.mjs').match(/data-write-control|writeControl/g) || []).length >= 2);
});
