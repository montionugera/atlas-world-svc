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

// spec "Hidden controls", in spec order. Every handler that reaches a write route.
const HIDDEN_HANDLERS = [
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

test('every listed write control is hidden by the read-only rule, for every event attribute', () => {
  const rule = shell.slice(shell.indexOf('/* read-only controls */'), shell.indexOf('/* end read-only controls */'));
  assert.ok(rule.includes('body[data-read-only]'));
  for (const h of HIDDEN_HANDLERS) {
    const attrs = eventAttrsCalling(h);
    assert.ok(attrs.size > 0, `${h} no longer exists in an event attribute`);
    for (const attr of attrs) {
      assert.ok(rule.includes(`[${attr}*="${h}"]`), `${h} is called from ${attr} but no selector hides it`);
    }
  }
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
