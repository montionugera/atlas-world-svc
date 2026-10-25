#!/usr/bin/env node
// Atlas zoom drift check — real headless Chrome over CDP, no npm dependencies.
//
// Verifies that World Atlas 2D SVG pins (landmarks, mob/boss pins, race-spawn
// and dungeon-warp badges) stay glued to their world anchor at every zoom,
// that wheel zoom keeps the world point under the cursor fixed, and that the
// wheel does not teleport STUDIO_MAP_LOC or flip the zoom tier to field/town.
//
// F-155 adds engine parity: every landmark both 2D engines draw sits at the same SVG-space point (OL
// geometry [x, 500 - y] vs SVG inner translate(x,y), < 0.5px), SVG and OL show the same zone set and count for
// every filter at 1x/2.8x/6x, and the URL round-trips route planner + 3D camera + lens default overlay.
//
// Usage:
//   node scripts/probes/atlas_zoom_drift_check.mjs [--url http://127.0.0.1:8788/] [--out result.json] [--keep]
//   test-the-test: --simulate-landmark-drift | --simulate-count-drift | --simulate-url-drop
// F-155 also audits OL declutter (pins always drawn, core labels monotonic), the ruler layer, OL 8x range,
// theater geometry, Esc order and touch pan/pinch (2D SVG + 3D). Those go red against the pre-F-155 build.
// Exit 0 = all assertions PASS, 1 = any FAIL, 2 = harness error.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const URL_ARG = argVal('--url', 'http://127.0.0.1:8788/');
const OUT = argVal('--out', '');
const CHROME = argVal('--chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const TOL = 0.5; // CSS px
const SIMULATE_FIX = args.includes('--simulate-fix');
const SIMULATE_BUG = args.includes('--simulate-bug');
const MIN_LANDMARKS = 10;
const MIN_MOBS = 1;
const ZOOMS = [1.0, 1.5, 2.05, 3.0, 4.5, 6.0];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });
}

async function fetchJson(u, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(200);
  }
  throw new Error(`unreachable: ${u}`);
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) {
        if (m.method === "Runtime.executionContextsCleared" || m.method === "Runtime.executionContextDestroyed") {
          for (const [k, p] of this.pending.entries()) {
            if (p.method === "Runtime.evaluate") {
              this.pending.delete(k);
              p.rej(new Error("Execution context cleared during navigation"));
            }
          }
        }
        this.listeners.forEach(fn => fn(m));
      }
    };
  }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP timeout: ${method}`)); }, 45000);
      t.unref?.();
      this.pending.set(id, { method, res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n${expr.slice(0, 200)}`);
    return r.result.value;
  }
}

// ---------------------------------------------------------------- in-page code
// Classifies every .atlas-screen-pin inside #studioCartoViewport and measures
// drift = |actual anchor on screen - expected anchor on screen|.
//   expected = DOMPoint(worldX, worldY) x viewportGroup.getScreenCTM()
//   actual   = marker.getBoundingClientRect() at the anchor's fractional
//              position inside marker.getBBox() (user-space, untransformed).
// Since pins are only scaled+translated, the fraction is zoom-invariant;
// at zoom 1.0 (inv-zoom = 1) actual == expected by construction (sanity row).
const PAGE_HELPERS = String.raw`
window.__qaFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
window.__qaLandmarkKind = (inner) => {
  const h = inner.innerHTML;
  if (h.includes('L-4,-18 L0,-25')) return 'tower';
  if (h.includes('rx="25" ry="13"')) return 'town';
  if (h.includes('L-22,12 L-22,-6')) return 'castle';
  if (h.includes('L-14,9 L-12,-5')) return 'fortress';
  if (h.includes('-11,9 -7,-4 7,-4 11,9')) return 'catacomb';
  if (h.includes('M-15,-4 Q-19,-15')) return 'lair';
  if (h.includes('-7,10 -4,-6 4,-6 7,10')) return 'windmill';
  return 'landmark_other';
};
window.__qaMeasure = () => {
  const vp = document.getElementById('studioCartoViewport');
  const svg = document.getElementById('dedicatedWorldAtlasSvg');
  if (!vp || !svg) return { error: 'viewport/svg missing' };
  const ctm = vp.getScreenCTM();
  const sr = svg.getBoundingClientRect();
  const pins = [];
  const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  // Ground-truth anchors come from geometry the app does NOT use for pivoting:
  //   landmark -> inner g translate(x,y); mob -> circle cx,cy;
  //   race/warp badge -> its parent landmark's translate(x,y) (the landmark pin
  //   that immediately precedes it in DOM order; rect centre x must match).
  // Drift is measured against ground truth, and the pin's inline
  // transform-origin is separately asserted to equal it.
  let lastLandmark = null;
  vp.querySelectorAll('.atlas-screen-pin').forEach(pin => {
    if (pin.hasAttribute('data-atlas-toast')) return;
    let type, marker, gx, gy, key, parent = null, tx = 0, ty = 0;
    const inner = Array.from(pin.children).find(c => c.tagName === 'g' && /^translate\(/.test(c.getAttribute('transform') || ''));
    const circle = Array.from(pin.children).find(c => c.tagName === 'circle' && !c.getAttribute('stroke-dasharray'));
    const rect = Array.from(pin.children).find(c => c.tagName === 'rect');
    if (inner) {
      const m = inner.getAttribute('transform').match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/);
      type = 'landmark:' + window.__qaLandmarkKind(inner);
      marker = inner;
      gx = +m[1]; gy = +m[2]; tx = gx; ty = gy;
      key = (pin.getAttribute('aria-label') || txt(pin.querySelector(':scope > text'))) + '@' + gx + ',' + gy;
      lastLandmark = { x: gx, y: gy, key };
    } else if (circle && pin.getAttribute('aria-label')) {
      const t = pin.getAttribute('aria-label') || '';
      type = t.includes('👑') ? 'mob:mvp' : (t.includes('🔥') ? 'mob:raid' : (t.includes('⚔') ? 'mob:mini_boss' : 'mob:monster'));
      marker = circle;
      gx = +circle.getAttribute('cx'); gy = +circle.getAttribute('cy');
      key = t + '@' + gx + ',' + gy;
    } else if (rect) {
      const t = txt(pin);
      type = /SPAWN/.test(t) ? 'badge:race_spawn' : (/WARP/.test(t) ? 'badge:dungeon_warp' : 'badge:other');
      marker = rect;
      parent = lastLandmark;
      const rcx = +rect.getAttribute('x') + +rect.getAttribute('width') / 2;
      if (!parent || Math.abs(parent.x - rcx) > 0.01) {
        pins.push({ key: t, type, groundTruthError: 'no parent landmark aligned with badge (rect centre x=' + rcx + ', parent=' + (parent && parent.key) + ')', drift: Infinity, originOk: false });
        return;
      }
      gx = parent.x; gy = parent.y;
      key = t + '@' + gx + ',' + gy;
    } else {
      return;
    }
    const om = (pin.style.transformOrigin || '').match(/([-\d.]+)px\s+([-\d.]+)px/);
    const origin = om ? { x: +om[1], y: +om[2] } : null;
    const originOk = !!origin && Math.abs(origin.x - gx) < 0.01 && Math.abs(origin.y - gy) < 0.01;
    const bb = marker.getBBox();
    if (!(bb.width > 0 && bb.height > 0)) { pins.push({ key, type, drift: Infinity, originOk, groundTruthError: 'zero bbox' }); return; }
    const fx = (gx - tx - bb.x) / bb.width;
    const fy = (gy - ty - bb.y) / bb.height;
    const cr = marker.getBoundingClientRect();
    if (!(cr.width > 0 && cr.height > 0)) { pins.push({ key, type, drift: Infinity, originOk, groundTruthError: 'zero client rect' }); return; }
    const actual = { x: cr.left + fx * cr.width, y: cr.top + fy * cr.height };
    const exp = new DOMPoint(gx, gy).matrixTransform(ctm);
    const onScreen = exp.x >= sr.left && exp.x <= sr.right && exp.y >= sr.top && exp.y <= sr.bottom;
    pins.push({
      key, type, worldX: gx, worldY: gy, onScreen, originOk,
      parent: parent ? parent.key : undefined,
      expected: { x: +exp.x.toFixed(2), y: +exp.y.toFixed(2) },
      actual: { x: +actual.x.toFixed(2), y: +actual.y.toFixed(2) },
      drift: +Math.hypot(actual.x - exp.x, actual.y - exp.y).toFixed(3),
      renderedWidth: +cr.width.toFixed(2),
      transformOrigin: pin.style.transformOrigin || ''
    });
  });
  const landmarkLabels = Array.from(vp.querySelectorAll('.atlas-screen-pin'))
    .filter(p => Array.from(p.children).some(c => c.tagName === 'g' && /^translate\(/.test(c.getAttribute('transform') || '')))
    .map(p => p.querySelector(':scope > text'))
    .filter(t => t && t.textContent.trim().length > 0).length;
  return {
    zoom: STUDIO_MAP_ZOOM,
    lodTier: getSemanticZoomLodTier(STUDIO_MAP_ZOOM),
    vpTransform: vp.getAttribute('transform'),
    invZoom: getComputedStyle(svg).getPropertyValue('--atlas-inv-zoom').trim(),
    landmarkLabels,
    pins
  };
};
window.__qaState = () => ({
  zoom: STUDIO_MAP_ZOOM,
  loc: JSON.parse(JSON.stringify(STUDIO_MAP_LOC)),
  pan: [STUDIO_MAP_PAN_X, STUDIO_MAP_PAN_Y],
  lodTier: getSemanticZoomLodTier(STUDIO_MAP_ZOOM),
  zoomTierVar: (typeof STUDIO_MAP_ZOOM_TIER !== 'undefined') ? STUDIO_MAP_ZOOM_TIER : null,
  activeTownId: ATLAS_STATE_STORE.activeTownId || '',
  activeFieldOrFortId: ATLAS_STATE_STORE.activeFieldOrFortId || '',
  activeDungeonId: ATLAS_STATE_STORE.activeDungeonId || '',
  overlandPins: document.querySelectorAll('#studioCartoViewport .atlas-screen-pin').length,
  vpTransform: (document.getElementById('studioCartoViewport') || {}).getAttribute ? document.getElementById('studioCartoViewport').getAttribute('transform') : null
});
window.__qaClientToWorld = (cx, cy) => {
  const vp = document.getElementById('studioCartoViewport');
  const p = new DOMPoint(cx, cy).matrixTransform(vp.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
};
window.__qaWorldToClient = (wx, wy) => {
  const vp = document.getElementById('studioCartoViewport');
  const p = new DOMPoint(wx, wy).matrixTransform(vp.getScreenCTM());
  return { x: p.x, y: p.y };
};
true;
`;

// Tier as the user experiences it. Prefer the app's own STUDIO_MAP_ZOOM_TIER
// when it exists; otherwise derive: LOD tier 3 or an auto-selected town/field
// focus means the wheel has left the overland map.
function tierName(st, baseline) {
  if (st.zoomTierVar) return String(st.zoomTierVar);
  if (st.activeDungeonId) return 'dungeon';
  if (st.overlandPins === 0) return 'town';
  if (st.activeFieldOrFortId && st.activeFieldOrFortId !== baseline.activeFieldOrFortId) return 'field';
  if (st.activeTownId !== baseline.activeTownId) return 'town';
  return 'overland';
}

// Per-zoom core-label audit (shared by the 1440 run and the F-159 768/375 viewport runs). Page-context source.
const OL_LABEL_ROWS_FN = `async (m, v, k, c0) => {
    const rows = [];
    for (const s of [1, 1.5, 2.2, 3.2, 4.5]) {
      v.setCenter(c0); v.setResolution(1 / (k * s));
      await new Promise(r => { m.once('rendercomplete', r); m.render(); });
      const size = m.getSize(); const F = buildAtlasspatialFeaturesList();
      const row = { s, inView: 0, pinsHit: 0, coreInView: [], coreLabeled: [] };
      F.forEach(f => {
        const p = m.getPixelFromCoordinate([f.x, 500 - f.y]);
        if (!p || p[0] < 10 || p[1] < 10 || p[0] > size[0] - 10 || p[1] > size[1] - 30) return;
        row.inView++;
        let pin = false; m.forEachFeatureAtPixel(p, ft => { const z = ft.get('zoneMeta'); if (z && z.id === f.id) pin = true; }, { hitTolerance: 1 });
        if (pin) row.pinsHit++;
        if (f.actionType === 'town' || f.actionType === 'dungeon' || f.actionType === 'fortress') {
          row.coreInView.push(f.id);
          let lab = false; m.forEachFeatureAtPixel([p[0], p[1] + 14], ft => { const z = ft.get('labelMeta') || ft.get('zoneMeta'); if (z && z.id === f.id) lab = true; }, { hitTolerance: 2 });
          if (lab) row.coreLabeled.push(f.id);
        }
      });
      rows.push(row);
    }
    return rows;
  }`;

async function main() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'atlas-qa-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1440,900', '--force-device-scale-factor=2', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND,MAP fonts.gstatic.com ~NOTFOUND',
    '--disable-gpu', 'about:blank'
  ], { stdio: 'ignore', detached: true });
  chrome.unref();
  const cleanup = () => {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);

  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find(t => t.type === 'page');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();

  const consoleErrors = [];
  let phase = 'load';
  cdp.on(m => {
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push({ phase, kind: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push({ phase, kind: 'console.error', text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ') });
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/\/favicon\.ico$/.test(m.params.entry.url || '')) {
      consoleErrors.push({ phase, kind: 'log', text: `${m.params.entry.text} ${m.params.entry.url || ''}`.trim() });
    }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

  // Load (retry: the server may be restarted by a concurrent fixer).
  let loaded = false;
  for (let attempt = 0; attempt < 15 && !loaded; attempt++) {
    try {
      await cdp.send('Page.navigate', { url: URL_ARG });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        const ok = await cdp.eval(`!!document.getElementById('dedicatedWorldAtlasSvg') && !!document.getElementById('studioCartoViewport') && typeof zoomStudioMap === 'function'`).catch(() => false);
        if (ok) { loaded = true; break; }
      }
    } catch {}
    if (!loaded) await sleep(1000);
  }
  if (!loaded) throw new Error(`World Atlas SVG (#dedicatedWorldAtlasSvg) never appeared at ${URL_ARG}`);
  await cdp.eval(PAGE_HELPERS);
  if (SIMULATE_FIX) {
    // Test-the-test only: candidate CSS fix injected at runtime (server file untouched).
    await cdp.eval(`(() => { const st = document.createElement('style'); st.id = 'qaSimFix'; st.textContent = '.atlas-screen-pin{transform-box:view-box !important}'; document.head.appendChild(st); return true; })()`);
  }
  if (SIMULATE_BUG) {
    // Test-the-test only: re-inject the pre-fix pin CSS (pivot resolved against fill-box).
    await cdp.eval(`(() => { const st = document.createElement('style'); st.id = 'qaSimBug'; st.textContent = '.atlas-screen-pin{transform-box:fill-box !important;transform-origin:center}'; document.head.appendChild(st); return true; })()`);
  }
  if (args.includes('--simulate-bad-origin')) {
    // Test-the-test only: shift every badge's inline origin to the old lm.y-26 pivot.
    await cdp.eval(`(() => { const shift = () => document.querySelectorAll('#studioCartoViewport .atlas-screen-pin').forEach(p => {
        if (p.dataset.qaShifted || !Array.from(p.children).some(c => c.tagName === 'rect') || Array.from(p.children).some(c => c.tagName === 'g')) return;
        const m = (p.style.transformOrigin || '').match(/([-\\d.]+)px\\s+([-\\d.]+)px/); if (!m) return;
        p.style.transformOrigin = m[1] + 'px ' + (+m[2] - 26) + 'px'; p.dataset.qaShifted = '1'; });
      new MutationObserver(shift).observe(document.body, { childList: true, subtree: true }); shift(); return true; })()`);
  }
  // Start from a clean macro view; make sure the boss/mob pins are drawn.
  await cdp.eval(`(async () => { zoomStudioMap(0, true); await __qaFrame(); return true; })()`);
  await cdp.eval(PAGE_HELPERS); // re-install if render() replaced nothing global (idempotent)

  const result = { url: URL_ARG, simulateFix: SIMULATE_FIX, simulateBug: SIMULATE_BUG, tolerancePx: TOL, viewport: '1440x900@2x', zoomRuns: [], wheel: null, assertions: [] };
  const tStart = Date.now(); const assert = (name, pass, detail) => { console.error(((Date.now()-tStart)/1000).toFixed(1)+"s", pass ? 'PASS' : 'FAIL', name); result.assertions.push({ name, status: pass ? 'PASS' : 'FAIL', detail }); };
  const skip = (name, detail) => result.assertions.push({ name, status: 'SKIP', detail });

  // ---------------------------------------------------------------- 1+2. drift per zoom
  phase = 'zoom';
  for (const z of ZOOMS) {
    const m = await cdp.eval(`(async () => { zoomStudioMap(0, false, ${z}); await __qaFrame(); return __qaMeasure(); })()`);
    if (m.error) throw new Error(m.error);
    const byType = {};
    const originMismatches = [];
    for (const p of m.pins) {
      const t = byType[p.type] || (byType[p.type] = { count: 0, onScreen: 0, maxDrift: 0, worst: null });
      t.count++;
      if (p.onScreen) t.onScreen++;
      if (!p.originOk) originMismatches.push(`${p.key.slice(0, 40)} origin=${p.transformOrigin || 'none'} truth=${p.worldX},${p.worldY}${p.groundTruthError ? ' ' + p.groundTruthError : ''}`);
      if (p.drift >= t.maxDrift) { t.maxDrift = p.drift; t.worst = p; }
    }
    result.zoomRuns.push({ originMismatches, zoom: m.zoom, requested: z, lodTier: m.lodTier, invZoom: m.invZoom, vpTransform: m.vpTransform, landmarkLabels: m.landmarkLabels, pinCount: m.pins.length, byType });
  }

  // exemplar pins tracked by key across zooms (tower, town, boss, badges)
  const run1 = result.zoomRuns[0];
  const required = ['landmark:tower', 'landmark:town'];
  const anyMob = Object.keys(run1.byType).filter(t => t.startsWith('mob:'));
  for (const t of required) assert(`coverage: ${t} pin rendered at zoom 1.0`, !!run1.byType[t], run1.byType[t] ? `${run1.byType[t].count} on screen` : 'none found');
  assert('coverage: boss/mob pin rendered at zoom 1.0', anyMob.length > 0, anyMob.join(',') || 'none found');
  assert('sanity: drift at zoom 1.0 is ~0 (measurement is self-consistent)',
    Object.values(run1.byType).every(t => t.maxDrift < TOL),
    Object.fromEntries(Object.entries(run1.byType).map(([k, v]) => [k, v.maxDrift])));
  for (const r of result.zoomRuns) {
    if (r.requested === 4.5) {
      assert('overland pins still rendered at zoom 4.5 (no tier swap)', r.pinCount > 0,
        `${r.pinCount} pins, LOD ${r.lodTier}, viewport ${r.vpTransform}`);
    }
    const nLandmark = Object.entries(r.byType).filter(([k]) => k.startsWith('landmark:')).reduce((a, [, v]) => a + v.count, 0);
    const nMob = Object.entries(r.byType).filter(([k]) => k.startsWith('mob:')).reduce((a, [, v]) => a + v.count, 0);
    const nOn = Object.values(r.byType).reduce((a, v) => a + v.onScreen, 0);
    if ([1.0, 3.0, 4.5, 6.0].includes(r.requested)) {
      assert(`coverage: >= ${MIN_LANDMARKS} landmarks + >= ${MIN_MOBS} mob pins measured at zoom ${r.requested}`,
        nLandmark >= MIN_LANDMARKS && nMob >= MIN_MOBS && nOn >= 1,
        `landmarks=${nLandmark} mobs=${nMob} onScreen=${nOn} (LOD ${r.lodTier}, viewport ${r.vpTransform})`);
    }
    assert(`transform-origin == ground-truth anchor for every pin at zoom ${r.requested}`,
      r.pinCount > 0 && r.originMismatches.length === 0,
      r.pinCount === 0 ? 'no pins' : (r.originMismatches.length ? r.originMismatches.slice(0, 6) : `all ${r.pinCount} match`));
    const bad = Object.entries(r.byType).filter(([, v]) => v.maxDrift >= TOL);
    const measuredTypes = Object.keys(r.byType).length;
    assert(`pin drift < ${TOL}px at zoom ${r.requested} (actual ${r.zoom}, LOD ${r.lodTier})`,
      measuredTypes > 0 && bad.length === 0,
      measuredTypes === 0 ? `FAIL: no pins measured (LOD ${r.lodTier}) — (LOD ${r.lodTier}, viewport ${r.vpTransform})` : Object.fromEntries(Object.entries(r.byType).map(([k, v]) => [k, `n=${v.count} max=${v.maxDrift}px`])));
  }
  const upTo45 = result.zoomRuns.filter(r => r.requested <= 4.5);
  const labelSeq = upTo45.map(r => r.landmarkLabels);
  assert('core landmark label count non-decreasing 1.0→4.5', labelSeq.every((v, i) => i === 0 || v >= labelSeq[i - 1]), labelSeq.join(' → '));

  // ---------------------------------------------------------------- 3. real wheel
  phase = 'wheel';
  await cdp.eval(`(async () => { zoomStudioMap(0, true); await __qaFrame(); return true; })()`);
  await cdp.eval(PAGE_HELPERS);
  const svgRect = await cdp.eval(`(() => { const r = document.getElementById('dedicatedWorldAtlasSvg').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  // off-centre cursor so a wrong pivot cannot pass by symmetry
  const cur = { x: Math.round(svgRect.left + svgRect.width * 0.34), y: Math.round(svgRect.top + svgRect.height * 0.42) };
  const baseline = await cdp.eval('__qaState()');
  const steps = [];
  for (let i = 0; i < 16; i++) {
    const before = await cdp.eval('__qaState()');
    if (before.zoom >= 6.0) break;
    const w = await cdp.eval(`__qaClientToWorld(${cur.x}, ${cur.y})`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cur.x, y: cur.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cur.x, y: cur.y, deltaX: 0, deltaY: -100 });
    await cdp.eval('__qaFrame()');
    const after = await cdp.eval('__qaState()');
    const back = await cdp.eval(`__qaWorldToClient(${w.x}, ${w.y})`);
    const wm = await cdp.eval('__qaMeasure()');
    const onPins = wm.pins || [];
    const worstPin = onPins.reduce((a, p) => (!a || p.drift > a.drift ? p : a), null);
    steps.push({
      from: before.zoom, to: after.zoom, lodTier: after.lodTier,
      cursorWorld: { x: +w.x.toFixed(2), y: +w.y.toFixed(2) },
      cursorShiftPx: +Math.hypot(back.x - cur.x, back.y - cur.y).toFixed(3),
      locChanged: JSON.stringify(after.loc) !== JSON.stringify(baseline.loc),
      loc: after.loc, tier: tierName(after, baseline),
      activeTownId: after.activeTownId, activeFieldOrFortId: after.activeFieldOrFortId,
      vpTransform: after.vpTransform,
      pinsOnScreen: onPins.length,
      maxPinDriftPx: worstPin ? worstPin.drift : null,
      worstPin: worstPin ? `${worstPin.type} ${worstPin.key.slice(0, 40)}` : null
    });
    if (after.zoom === before.zoom) break;
  }
  result.wheel = { cursor: cur, baselineLoc: baseline.loc, baselineTown: baseline.activeTownId, steps };
  const reached = steps.length ? steps[steps.length - 1].to : 1;
  assert('wheel: zoom reaches >= 4.5', reached >= 4.5, `max zoom ${reached}`);
  const shifts = steps.filter(s => s.to !== s.from);
  const badShift = shifts.filter(s => s.cursorShiftPx >= TOL);
  assert(`wheel: world point under cursor stationary (< ${TOL}px)`, shifts.length > 0 && badShift.length === 0,
    shifts.map(s => `${s.from}→${s.to}: ${s.cursorShiftPx}px`).join('; '));
  const wheelDrift = steps.filter(s => s.pinsOnScreen > 0);
  assert(`wheel: pin drift < ${TOL}px after every wheel step`, wheelDrift.length > 0 && wheelDrift.every(s => s.maxPinDriftPx < TOL),
    wheelDrift.map(s => `${s.to}: ${s.maxPinDriftPx}px (${s.worstPin})`).join('; '));
  const locMoves = steps.filter(s => s.locChanged);
  assert('wheel: STUDIO_MAP_LOC unchanged', locMoves.length === 0,
    locMoves.length ? `baseline ${JSON.stringify(baseline.loc)}; changed at ${locMoves.map(s => `${s.from}→${s.to} => ${JSON.stringify(s.loc)}`).join('; ')}` : 'unchanged');
  const nonOverland = steps.filter(s => s.tier !== 'overland');
  assert('wheel: zoom tier stays overland through >= 4.5', reached >= 4.5 && nonOverland.length === 0,
    nonOverland.length ? nonOverland.map(s => `${s.from}→${s.to}: ${s.tier} (lod ${s.lodTier}, town=${s.activeTownId}, field=${s.activeFieldOrFortId})`).join('; ') : `overland to ${reached}`);


  // ---------------------------------------------------------------- 5. F-155 engine parity (OL vs SVG)
  phase = 'parity';
  const SIM_LM = args.includes('--simulate-landmark-drift');
  const SIM_COUNT = args.includes('--simulate-count-drift');
  const SIM_URL = args.includes('--simulate-url-drop');
  if (SIM_LM) {
    // Test-the-test: reintroduce the pre-F-155 two-table state (SVG Kilnwatch at y=308, OL at 318).
    await cdp.eval(`(() => { const orig = getAtlasLandmarkAnchor; getAtlasLandmarkAnchor = id => id === 'town-kilnwatch-bastion' ? { x: 618, y: 308 } : orig(id); return true; })()`);
  }
  if (SIM_COUNT) {
    // Test-the-test: drop one SVG zone mark after every render (SVG under-reports one zone).
    await cdp.eval(`(() => { const drop = () => { const m = document.querySelector('#atlasSvgZoneFilterLayer .atlas-zone-mark'); if (m) m.remove(); };
      new MutationObserver(() => { if (!document.querySelector('#atlasSvgZoneFilterLayer[data-qa-dropped]')) { const l = document.getElementById('atlasSvgZoneFilterLayer'); if (l) { l.setAttribute('data-qa-dropped', '1'); drop(); } } }).observe(document.body, { childList: true, subtree: true }); return true; })()`);
  }
  if (SIM_URL) {
    // Test-the-test: the URL writer loses the route planner and 3D camera params.
    await cdp.eval(`(() => { const strip = u => { const s = String(u); return s.replace(/[&?#](route|routeFrom|routeTo|zoom3d|yaw3d|pitch3d|pan3d)=[^&#]*/g, ''); };
      const rs = history.replaceState.bind(history), ps = history.pushState.bind(history);
      history.replaceState = (a, b, u) => rs(a, b, strip(u)); history.pushState = (a, b, u) => ps(a, b, strip(u)); return true; })()`);
  }
  const PARITY_HELPERS = String.raw`
window.__qaWaitOl = async () => { for (let i = 0; i < 80; i++) { const m = window.__ATLAS_OL_MAP_INSTANCE; if (m && m.getLayers) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
window.__qaOlZonePoints = () => {
  const m = window.__ATLAS_OL_MAP_INSTANCE; if (!m) return null;
  const out = [];
  m.getLayers().getArray().forEach(l => { const src = l.getSource && l.getSource(); if (!src || !src.getFeatures) return;
    src.getFeatures().forEach(f => { const meta = f.get('zoneMeta'); if (!meta) return; const c = f.getGeometry().getCoordinates(); out.push({ id: meta.id, x: c[0], y: 500 - c[1] }); }); });
  return out;
};
window.__qaSvgLandmarks = () => [...document.querySelectorAll('#studioCartoViewport .atlas-screen-pin[data-landmark-id]')].map(p => {
  const g = [...p.children].find(c => c.tagName === 'g' && /^translate\(/.test(c.getAttribute('transform') || ''));
  const m = g && g.getAttribute('transform').match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/);
  return { id: p.getAttribute('data-landmark-id'), x: m ? +m[1] : NaN, y: m ? +m[2] : NaN };
});
window.__qaSvgZoneMarks = () => [...document.querySelectorAll('#studioCartoViewport #atlasSvgZoneFilterLayer .atlas-zone-mark')]
  .map(c => ({ id: c.getAttribute('data-zone-id'), x: +c.getAttribute('cx'), y: +c.getAttribute('cy') }));
window.__qaBadge = () => { const b = document.querySelector('.joy-context-filter-bar__count'); return b ? +b.textContent.trim() : null; };
true;`;
  await cdp.eval(PARITY_HELPERS);
  await cdp.eval(`(async () => { setAtlasEngineMode('2d_svg'); ATLAS_STATE_STORE.levelBand = 'All'; setAtlasFilter('All'); zoomStudioMap(0, true); await __qaFrame(); return true; })()`);
  const svgLms = await cdp.eval('__qaSvgLandmarks()');
  const joinTable = await cdp.eval(`typeof ATLAS_OVERLAND_LANDMARK_ANCHORS === 'undefined' ? [] : ATLAS_OVERLAND_LANDMARK_ANCHORS.map(e => ({ landmarkId: e.landmarkId, zoneId: e.zoneId }))`);
  await cdp.eval(`(async () => { setAtlasEngineMode('2d_ol'); await __qaWaitOl(); await __qaFrame(); return true; })()`);
  const olAll = await cdp.eval('__qaOlZonePoints()');
  const olById = Object.fromEntries((olAll || []).map(p => [p.id, p]));
  const parityRows = svgLms.map(lm => {
    const j = joinTable.find(e => e.landmarkId === lm.id);
    const o = j && olById[j.zoneId];
    return { landmark: lm.id, zone: j ? j.zoneId : null, svg: [lm.x, lm.y], ol: o ? [+o.x.toFixed(3), +o.y.toFixed(3)] : null, dPx: o ? +Math.hypot(o.x - lm.x, o.y - lm.y).toFixed(3) : null };
  });
  const unmatched = parityRows.filter(r => r.dPx === null).map(r => r.landmark);
  const worst = parityRows.reduce((a, r) => (r.dPx !== null && r.dPx > a ? r.dPx : a), 0);
  result.parity = { landmarks: parityRows };
  assert('parity: OL live map mounted with zone features', Array.isArray(olAll) && olAll.length > 0, `${olAll ? olAll.length : 0} OL zone points`);
  assert(`parity: every SVG landmark has an OL zone partner (>= ${MIN_LANDMARKS} landmarks)`, svgLms.length >= MIN_LANDMARKS && unmatched.length === 0,
    unmatched.length ? `unmatched: ${unmatched.join(', ')}` : `${svgLms.length} landmarks joined`);
  assert(`parity: OL vs SVG landmark coordinate delta < ${TOL}px for all shared landmarks`, parityRows.length > 0 && unmatched.length === 0 && worst < TOL,
    parityRows.filter(r => r.dPx === null || r.dPx >= TOL).map(r => `${r.landmark}: svg ${r.svg} ol ${r.ol} d=${r.dPx}`).join('; ') || `max ${worst}px over ${parityRows.length}`);

  const FILTERS = ['All', 'RaceSpawns', 'TownMarks', 'Monster', 'Mini-Boss', 'Raid', 'MVP'];
  const countRows = [];
  for (const f of FILTERS) {
    const ol = await cdp.eval(`(async () => { setAtlasEngineMode('2d_ol'); setAtlasFilter('${f}'); await __qaWaitOl(); await __qaFrame(); return { pts: __qaOlZonePoints(), badge: __qaBadge() }; })()`);
    const row = { filter: f, ol: ol.pts ? ol.pts.length : null, olBadge: ol.badge, svg: {}, svgBadge: null, idMismatch: [], posMismatch: 0 };
    const olIds = new Set((ol.pts || []).map(p => p.id));
    const olPos = Object.fromEntries((ol.pts || []).map(p => [p.id, p]));
    for (const z of [1.0, 2.8, 6.0]) {
      const sv = await cdp.eval(`(async () => { setAtlasEngineMode('2d_svg'); setAtlasFilter('${f}'); zoomStudioMap(0, false, ${z}); await __qaFrame(); return { marks: __qaSvgZoneMarks(), badge: __qaBadge() }; })()`);
      row.svg[z] = sv.marks.length;
      row.svgBadge = sv.badge;
      const svIds = new Set(sv.marks.map(m => m.id));
      const diff = [...olIds].filter(i => !svIds.has(i)).concat([...svIds].filter(i => !olIds.has(i)));
      if (diff.length) row.idMismatch.push(`${z}x: ${diff.slice(0, 4).join(',')}`);
      row.posMismatch += sv.marks.filter(m => !olPos[m.id] || Math.hypot(olPos[m.id].x - m.x, olPos[m.id].y - m.y) >= TOL).length;
    }
    countRows.push(row);
  }
  await cdp.eval(`(async () => { setAtlasFilter('All'); setAtlasEngineMode('2d_svg'); zoomStudioMap(0, true); await __qaFrame(); return true; })()`);
  result.parity.zoneCounts = countRows;
  for (const r of countRows) {
    const svgCounts = Object.values(r.svg);
    assert(`zone filter '${r.filter}': SVG marks == OL zones == badge at 1x/2.8x/6x`,
      r.ol > 0 && svgCounts.every(n => n === r.ol) && r.olBadge === r.ol && r.svgBadge === r.ol && r.idMismatch.length === 0 && r.posMismatch === 0,
      `OL=${r.ol} SVG=${JSON.stringify(r.svg)} badge(ol/svg)=${r.olBadge}/${r.svgBadge}${r.idMismatch.length ? ' ids≠ ' + r.idMismatch.join('; ') : ''}${r.posMismatch ? ' posMismatch=' + r.posMismatch : ''}`);
  }

  // ---------------------------------------------------------------- 7. F-155 OL declutter / ruler / zoom range, theater, Esc, touch
  phase = 'ol-audit';
  await cdp.eval(`(async () => { setAtlasEngineMode('2d_ol'); setAtlasFilter('All'); zoomStudioMap(0, true); await __qaWaitOl(); return true; })()`);
  // Hit detection respects decluttering: a decluttered-away pin or label is not hit at its own pixel.
  const olAudit = await cdp.eval(`(async () => {
    const m = window.__ATLAS_OL_MAP_INSTANCE; const v = m.getView();
    const k = getAtlasOlCameraFromApp(m.getTargetElement()).k;
    const c0 = v.getCenter();
    const rows = await (${OL_LABEL_ROWS_FN})(m, v, k, c0);
    v.setResolution(1e-6); await new Promise(r => setTimeout(r, 200));
    const maxZoom = +(1 / (v.getResolution() * k)).toFixed(3);
    v.setCenter(c0); v.setResolution(1 / k);
    await new Promise(r => setTimeout(r, 300));
    zoomStudioMap(0, true);
    // Ruler: one start point must be drawn (own non-decluttered layer, on top of zone pins).
    // Audited repro: ruler A on Lantern Hollow, B on Porcelain Loom at 2.5x. With the ruler in the decluttered
    // zone layer, adding B made the A marker vanish. Both markers must stay painted.
    ATLAS_OL_RULER_ACTIVE = true; ATLAS_OL_RULER_POINTS = [];
    const FL = buildAtlasspatialFeaturesList();
    const FA = FL.find(f => f.id === 'zone-town-lantern-hollow'), FB = FL.find(f => f.id === 'zone-town-porcelain-loom');
    initOrUpdateAtlasOpenLayersEngine();
    const m1 = window.__ATLAS_OL_MAP_INSTANCE;
    await new Promise(r => { m1.once('rendercomplete', r); m1.render(); });
    m1.getView().setCenter([488, 500 - 413]); m1.getView().setResolution(m1.getView().getResolution() / 2.5);
    await new Promise(r => setTimeout(r, 500));
    ATLAS_OL_RULER_POINTS.push({ x: FA.x, y: FA.y }, { x: FB.x, y: FB.y });
    initOrUpdateAtlasOpenLayersEngine();
    const m2 = window.__ATLAS_OL_MAP_INSTANCE;
    await new Promise(r => { m2.once('rendercomplete', r); m2.render(); });
    // Pixel truth: each marker's red fill (#ef4444) must be on the canvas at its own pixel.
    const vp = m2.getTargetElement(); const vr = vp.getBoundingClientRect();
    const redAt = rp => { let seen = false; vp.querySelectorAll('canvas').forEach(c => { const r = c.getBoundingClientRect(); if (!r.width) return; const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
      const sx = Math.round((vr.left + rp[0] - r.left) * c.width / r.width), sy = Math.round((vr.top + rp[1] - r.top) * c.height / r.height);
      const d = ctx.getImageData(sx - 2, sy - 2, 5, 5).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 100 && d[i + 2] < 100 && d[i + 3] > 200) seen = true; }); return seen; };
    const rulerMarks = [FA, FB].map(f => redAt(m2.getPixelFromCoordinate([f.x, 500 - f.y])));
    const rulerHit = rulerMarks.every(Boolean);
    ATLAS_OL_RULER_POINTS = []; initOrUpdateAtlasOpenLayersEngine();
    const m3 = window.__ATLAS_OL_MAP_INSTANCE;
    await new Promise(r => { m3.once('rendercomplete', r); m3.render(); }); // moveend only fires after a first frame
    m3.getView().setResolution(m3.getView().getMinResolution());
    await new Promise(r => setTimeout(r, 400));
    const tr = m3.getTargetElement().getBoundingClientRect();
    // A click point that is really on the OL canvas (not under a HUD panel), with room for a second click 24px right.
    const tgt = m3.getTargetElement();
    let clickAt = null;
    for (const fy of [0.55, 0.65, 0.45, 0.75, 0.35]) for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      if (clickAt) break;
      const x = tr.left + tr.width * fx + 0.37, y = tr.top + tr.height * fy + 0.29;
      const e1 = document.elementFromPoint(x, y), e2 = document.elementFromPoint(x + 24, y);
      if (e1 && e2 && tgt.contains(e1) && tgt.contains(e2) && e1.tagName === 'CANVAS' && e2.tagName === 'CANVAS') clickAt = { x, y };
    }
    return { rows, maxZoom, rulerHit, rulerMarks, clickAt: clickAt || { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 }, clickOnCanvas: !!clickAt, resBefore: m3.getView().getResolution() };
  })()`);
  // Two quick real clicks in ruler mode: both become ruler points with fractional world coords, no double-click zoom.
  const clickOnce = async (x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await clickOnce(olAudit.clickAt.x, olAudit.clickAt.y);
  await sleep(60);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: olAudit.clickAt.x + 24, y: olAudit.clickAt.y, button: 'left', clickCount: 2 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: olAudit.clickAt.x + 24, y: olAudit.clickAt.y, button: 'left', clickCount: 2 });
  await sleep(900);
  const rc = await cdp.eval(`({ pts: ATLAS_OL_RULER_POINTS.map(p => [p.x, p.y]), res: window.__ATLAS_OL_MAP_INSTANCE ? window.__ATLAS_OL_MAP_INSTANCE.getView().getResolution() : null })`);
  olAudit.rulerClicks = rc;
  olAudit.rulerKeptFraction = rc.pts.length >= 1 && rc.pts.some(p => p[0] % 1 !== 0 || p[1] % 1 !== 0);
  olAudit.dblZoomOk = rc.pts.length === 2 && rc.res !== null && Math.abs(rc.res - olAudit.resBefore) < 1e-9;
  await cdp.eval(`(() => { ATLAS_OL_RULER_ACTIVE = false; ATLAS_OL_RULER_POINTS = []; zoomStudioMap(0, true); syncAtlasActiveSpatialEngine(); return true; })()`);
  result.olAudit = olAudit;
  const pinRows = olAudit.rows.map(r => `${r.s}x ${r.pinsHit}/${r.inView}`);
  assert('OL: every zone pin in view is drawn (pins never declutter) at 1x..4.5x', olAudit.rows.every(r => r.inView > 0 ? r.pinsHit === r.inView : true) && olAudit.rows[0].inView >= 40, pinRows.join('; '));
  const lostCore = [];
  for (let i = 1; i < olAudit.rows.length; i++) {
    const prev = olAudit.rows[i - 1], cur = olAudit.rows[i];
    prev.coreLabeled.filter(id => cur.coreInView.includes(id) && !cur.coreLabeled.includes(id)).forEach(id => lostCore.push(`${prev.s}→${cur.s}: ${id}`));
  }
  assert('OL: core landmark labels never vanish while zooming in (monotonic 1x→4.5x)', lostCore.length === 0 && olAudit.rows[0].coreLabeled.length > 0,
    lostCore.length ? lostCore.slice(0, 6) : olAudit.rows.map(r => `${r.s}x ${r.coreLabeled.length}/${r.coreInView.length}`).join('; '));
  // F-159: the same monotonic label check at tablet and phone widths (it used to run at 1440 only).
  for (const [vw, vh] of [[1440, 900], [768, 1024], [375, 812]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 2, mobile: vw < 600 });
    const vrows = await cdp.eval(`(async () => { window.dispatchEvent(new Event('resize')); zoomStudioMap(0, true); syncAtlasActiveSpatialEngine(); await __qaWaitOl();
      const m = window.__ATLAS_OL_MAP_INSTANCE; m.updateSize(); const v = m.getView();
      const k = getAtlasOlCameraFromApp(m.getTargetElement()).k; const c0 = v.getCenter();
      const rows = await (${OL_LABEL_ROWS_FN})(m, v, k, c0);
      v.setCenter(c0); v.setResolution(1 / k); return rows; })()`);
    const lost = [];
    for (let i = 1; i < vrows.length; i++) {
      const prev = vrows[i - 1], cur = vrows[i];
      prev.coreLabeled.filter(id => cur.coreInView.includes(id) && !cur.coreLabeled.includes(id)).forEach(id => lost.push(`${prev.s}→${cur.s}: ${id}`));
    }
    assert(`OL: core landmark labels never vanish while zooming in at ${vw}x${vh}`, lost.length === 0 && vrows[0].coreLabeled.length > 0,
      lost.length ? lost.slice(0, 8) : vrows.map(r => `${r.s}x ${r.coreLabeled.length}/${r.coreInView.length}`).join('; '));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await cdp.eval(`(async () => { window.dispatchEvent(new Event('resize')); zoomStudioMap(0, true); syncAtlasActiveSpatialEngine(); await __qaWaitOl(); window.__ATLAS_OL_MAP_INSTANCE.updateSize(); return true; })()`);
  assert('OL: both ruler markers stay drawn after the 2nd point (start marker not decluttered)', olAudit.rulerHit === true, `markers painted [A,B]=${JSON.stringify(olAudit.rulerMarks)}`);
  assert('OL: two quick ruler clicks = 2 fractional points, no double-click zoom', olAudit.rulerKeptFraction === true && olAudit.dblZoomOk === true,
    JSON.stringify({ ...olAudit.rulerClicks, resBefore: olAudit.resBefore }));
  assert('OL: zoom range reaches the app max 8x', olAudit.maxZoom >= 7.99, `max ${olAudit.maxZoom}x`);

  // One real wheel notch over the OL map is one ladder step (not a 0.85x->8x jump).
  const olBox = await cdp.eval(`(async () => { zoomStudioMap(0, true); syncAtlasActiveSpatialEngine(); await __qaWaitOl(); const m = window.__ATLAS_OL_MAP_INSTANCE;
    await new Promise(r => { m.once('rendercomplete', r); m.render(); }); const r = m.getTargetElement().getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), z: STUDIO_MAP_ZOOM }; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: olBox.x, y: olBox.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: olBox.x, y: olBox.y, deltaX: 0, deltaY: -100 });
  await sleep(1200);
  const olNotch = await cdp.eval('STUDIO_MAP_ZOOM');
  assert('OL: one wheel notch zooms one step (x1.1-x2.4), not the whole range', olNotch / olBox.z >= 1.1 && olNotch / olBox.z <= 2.4, `${olBox.z}x -> ${olNotch}x`);

  // Esc: first press clears the ruler, second leaves theater (real key events).
  phase = 'theater';
  const esc = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(250);
  };
  await cdp.eval(`(async () => { setAtlasEngineMode('2d_ol'); ATLAS_OL_RULER_ACTIVE = true; ATLAS_OL_RULER_POINTS = [{ x: 400.5, y: 300.5 }]; syncAtlasActiveSpatialEngine(); if (!ATLAS_THEATER_MODE) toggleAtlasTheaterMode(); await new Promise(r => setTimeout(r, 300)); document.activeElement && document.activeElement.blur && document.activeElement.blur(); return true; })()`);
  await esc();
  const esc1 = await cdp.eval(`({ ruler: ATLAS_OL_RULER_ACTIVE || ATLAS_OL_RULER_POINTS.length > 0, theater: ATLAS_THEATER_MODE })`);
  await esc();
  const esc2 = await cdp.eval(`({ theater: ATLAS_THEATER_MODE })`);
  assert('Esc clears the OL ruler first, then exits theater', esc1.ruler === false && esc1.theater === true && esc2.theater === false,
    `after 1st Esc ${JSON.stringify(esc1)}, after 2nd ${JSON.stringify(esc2)}`);
  const theater = await cdp.eval(`(async () => { setAtlasEngineMode('2d_svg'); if (!ATLAS_THEATER_MODE) toggleAtlasTheaterMode(); await new Promise(r => setTimeout(r, 300));
    const sh = document.querySelector('.joy-spatial-shell').getBoundingClientRect(); const cv = document.querySelector('.joy-spatial-shell__canvas').getBoundingClientRect();
    const out = { ih: innerHeight, iw: innerWidth, shell: [sh.top, sh.height, sh.width], canvasBottom: cv.bottom, scrollH: document.documentElement.scrollHeight };
    toggleAtlasTheaterMode(); return out; })()`);
  assert('theater: shell fills the viewport exactly (no page strip, no overflow)', Math.abs(theater.shell[0]) < 0.5 && Math.abs(theater.shell[1] - theater.ih) < 0.5
    && Math.abs(theater.shell[2] - theater.iw) < 0.5 && theater.canvasBottom <= theater.ih + 0.5 && theater.scrollH <= theater.ih, JSON.stringify(theater));

  // Touch: one-finger pan + two-finger pinch on the 2D SVG and the 3D canvas (CDP touch events).
  phase = 'touch';
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touchSeq = async (cx, cy, mode) => {
    const pts = (d) => mode === 'pinch' ? [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] : [{ x: cx + d, y: cy, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(mode === 'pinch' ? 40 : 0) });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(mode === 'pinch' ? 40 + i * 12 : i * 15) }); await sleep(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };
  await cdp.eval(`(async () => { setAtlasEngineMode('2d_svg'); zoomStudioMap(0, false, 2); await __qaFrame(); return true; })()`);
  const svgBox = await cdp.eval(`(() => { const r = document.getElementById('dedicatedWorldAtlasSvg').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.45), y: Math.round(r.top + r.height * 0.6), ta: getComputedStyle(document.getElementById('dedicatedWorldAtlasSvg')).touchAction }; })()`);
  const t0 = await cdp.eval('({ z: STUDIO_MAP_ZOOM, px: STUDIO_MAP_PAN_X })');
  await touchSeq(svgBox.x, svgBox.y, 'pan');
  const t1 = await cdp.eval('({ z: STUDIO_MAP_ZOOM, px: STUDIO_MAP_PAN_X })');
  await touchSeq(svgBox.x, svgBox.y, 'pinch');
  const t2 = await cdp.eval('({ z: STUDIO_MAP_ZOOM, px: STUDIO_MAP_PAN_X })');
  assert('touch (2D SVG): one-finger drag pans, two-finger pinch zooms in; touch-action none', t1.px > t0.px + 5 && t2.z > t1.z + 0.3 && svgBox.ta === 'none',
    `pan ${t0.px.toFixed(1)}→${t1.px.toFixed(1)}, zoom ${t1.z}→${t2.z}, touch-action=${svgBox.ta}`);
  await cdp.eval(`(async () => { zoomStudioMap(0, true); setAtlasEngineMode('3d_map3d'); await new Promise(r => setTimeout(r, 600)); return true; })()`);
  const cvBox = await cdp.eval(`(() => { const c = document.getElementById('atlasMap3dCanvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.55), z: ATLAS_3D_STATE.zoom, yaw: ATLAS_3D_STATE.yaw }; })()`);
  let d3 = null;
  if (cvBox) {
    await touchSeq(cvBox.x, cvBox.y, 'pan');
    const a = await cdp.eval('({ z: ATLAS_3D_STATE.zoom, yaw: ATLAS_3D_STATE.yaw })');
    await touchSeq(cvBox.x, cvBox.y, 'pinch');
    const b = await cdp.eval('({ z: ATLAS_3D_STATE.zoom, yaw: ATLAS_3D_STATE.yaw })');
    d3 = { before: cvBox, afterPan: a, afterPinch: b };
  }
  assert('touch (3D): one-finger drag orbits, two-finger pinch zooms in', !!d3 && Math.abs(d3.afterPan.yaw - d3.before.yaw) > 0.05 && d3.afterPinch.z > d3.afterPan.z + 0.1, JSON.stringify(d3));
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.eval(`(async () => { setAtlasEngineMode('2d_svg'); zoomStudioMap(0, true); return true; })()`);

  // ---------------------------------------------------------------- 6. F-155 URL round-trip
  phase = 'url';
  const want = { route: true, from: 'zone-town-kilnwatch-bastion', to: 'zone-dungeon-pendulum-shaft', zoom: 1.734, yaw: 0.913, pitch: 1.2, panX: 12.5, panY: -7.25 };
  const href = await cdp.eval(`(async () => {
    if (!ATLAS_ROUTE_PLANNER_OPEN) toggleAtlasRoutePlanner();
    setAtlasRouteEndpoints('${want.from}', '${want.to}');
    setAtlasEngineMode('3d_map3d'); await new Promise(r => setTimeout(r, 400));
    Object.assign(ATLAS_3D_STATE, { zoom: ${want.zoom}, yaw: ${want.yaw}, pitch: ${want.pitch}, panX: ${want.panX}, panY: ${want.panY} });
    if (typeof scheduleAtlas3dCameraUrlWrite === 'function') scheduleAtlas3dCameraUrlWrite(); else writeUrlState(false);
    await new Promise(r => setTimeout(r, 300));
    return location.href; })()`);
  const readBack = async u => {
    // Leave the document first: navigating to the current URL with a #hash is a same-document jump, not a reload.
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await cdp.send('Page.navigate', { url: u });
    for (let i = 0; i < 60; i++) { await sleep(250); if (await cdp.eval(`typeof zoomStudioMap === 'function' && !!document.getElementById('joyPersonaLensBar')`).catch(() => false)) break; }
    return cdp.eval(`({ route: ATLAS_ROUTE_PLANNER_OPEN, from: ATLAS_ROUTE_FROM_ID, to: ATLAS_ROUTE_TO_ID, zoom: ATLAS_3D_STATE.zoom, yaw: ATLAS_3D_STATE.yaw, pitch: ATLAS_3D_STATE.pitch, panX: ATLAS_3D_STATE.panX, panY: ATLAS_3D_STATE.panY, engine: ATLAS_ENGINE_MODE,
      lens: ATLAS_PERSONA_LENS, bar: ATLAS_ACTIVE_STUDIO_BAR, storeBar: ATLAS_STATE_STORE.activeStudioBar, defaultBar: ATLAS_LENS_DEFAULT_BAR[ATLAS_PERSONA_LENS], dimDrawer: ATLAS_DIMENSION_DRAWER_OPEN, leftDrawer: ATLAS_LEFT_DRAWER_OPEN })`);
  };
  const back = await readBack(href);
  const urlBad = Object.keys(want).filter(k => (typeof want[k] === 'number' ? Math.abs(back[k] - want[k]) > 1e-6 : back[k] !== want[k]));
  result.urlRoundTrip = { href, back };
  assert('url: route planner (open/origin/dest) + 3D camera (zoom/yaw/pitch/pan) survive a reload', urlBad.length === 0,
    urlBad.length ? urlBad.map(k => `${k}: want ${want[k]} got ${back[k]}`).join('; ') : `restored from ${href.split('?')[1] || href}`);
  const base = URL_ARG.replace(/[?#].*$/, '');
  const lensBack = await readBack(`${base}?tab=studio&perspective=world-history-and-concept&lens=liveops`);
  result.urlLens = lensBack;
  assert('url: lens restored from URL applies its default overlay + drawers', lensBack.lens === 'liveops' && lensBack.bar === lensBack.defaultBar
    && lensBack.storeBar === lensBack.defaultBar && lensBack.dimDrawer === true && lensBack.leftDrawer === true,
    `bar=${lensBack.bar} store=${lensBack.storeBar} default=${lensBack.defaultBar} dim=${lensBack.dimDrawer} left=${lensBack.leftDrawer}`);
  const ovBack = await readBack(`${base}?tab=studio&perspective=world-history-and-concept&lens=liveops&overlay=tools_squad`);
  assert('url: explicit overlay param wins over the lens default', ovBack.bar === 'tools_squad' && ovBack.storeBar === 'tools_squad',
    `bar=${ovBack.bar} store=${ovBack.storeBar}`);
  const junk = await readBack(`${base}?tab=studio&perspective=world-history-and-concept&zoom3d=NaN&yaw3d=abc&pitch3d=99&pan3d=1:&routeFrom=%3Cx%3E`);
  assert('url: junk 3D/route params fall back to defaults or clamp (NaN-safe)', junk.zoom === 1 && junk.yaw === -0.62 && junk.pitch === 1.45 && junk.panX === 0 && junk.panY === 0
    && junk.from === 'zone-town-lantern-hollow' && junk.route === false,
    JSON.stringify({ zoom: junk.zoom, yaw: junk.yaw, pitch: junk.pitch, pan: [junk.panX, junk.panY], from: junk.from, route: junk.route }));

  // ---------------------------------------------------------------- 7. F-158 3D blockout is the 2D map in 3D
  phase = 'f158-3d';
  const f158 = await cdp.eval(`(async () => {
    setAtlasEngineMode('3d_map3d'); setAtlas3dOption('contextOverride', 'overland'); await new Promise(r => setTimeout(r, 500));
    if (typeof svgTo3dWorld !== 'function') return { hasProjection: false };
    const scene = buildAtlas3dBlockoutScene();
    const top = m => m.y + m.h / 2;
    const lms = ATLAS_OVERLAND_LANDMARK_ANCHORS.map(a => {
      const parts = scene.meshes.filter(m => m.landmarkId === a.landmarkId);
      const prim = parts.find(m => m.landmarkPrimary);
      const e = svgTo3dWorld(a.x, a.y);
      const foot = parts.reduce((s, m) => Math.max(s, Math.max(m.w, m.d)), 0);
      const maxTop = parts.reduce((s, m) => Math.max(s, top(m)), -Infinity);
      return { id: a.landmarkId, kind: prim ? prim.landmarkKind : null, d: prim ? Math.hypot(prim.x - e.x, prim.z - e.z) : null,
        aspect: prim ? (maxTop - prim.baseY) / foot : null, roles: Array.from(new Set(parts.map(m => m.part))).sort().join('+') };
    });
    const grp = k => lms.filter(l => k.includes(l.kind));
    const sig = rs => new Set(rs.map(r => r.roles));
    const comp = grp(['town', 'castle', 'fortress']), tow = grp(['tower']), cry = grp(['catacomb', 'lair']);
    const overlap = (a, b) => [...a].some(x => b.has(x));
    return { hasProjection: true, lms, nComp: comp.length, nTower: tow.length, nCrypt: cry.length,
      sigsDistinct: !overlap(sig(comp), sig(tow)) && !overlap(sig(comp), sig(cry)) && !overlap(sig(tow), sig(cry)),
      aspectOk: comp.every(l => l.aspect <= 1.0) && tow.every(l => l.aspect >= 1.8) && cry.every(l => l.aspect < 0.6),
      sea: scene.meshes.filter(m => /^Sea_/.test(m.name)).length, mountains: scene.meshes.filter(m => m.part === 'mountain').length,
      continents: scene.meshes.filter(m => m.part === 'continent' && m.pts && m.pts.length >= 4).length, meshCount: scene.meshes.length };
  })()`);
  result.f158 = f158;
  const f158Bad = (f158.lms || []).filter(l => l.d === null || l.d >= 0.5).map(l => `${l.id}:${l.d === null ? 'missing' : l.d.toFixed(2)}`);
  assert('F-158: svgTo3dWorld exists and all 13 landmarks sit within 0.5 units of their projected 2D anchor', f158.hasProjection === true && (f158.lms || []).length === 13 && f158Bad.length === 0,
    f158.hasProjection ? (f158Bad.join(', ') || 'max delta ok') : 'svgTo3dWorld missing');
  assert('F-158: castle/town, tower and dungeon/catacomb landmarks have three distinct geometry signatures', f158.hasProjection === true && f158.nComp >= 6 && f158.nTower === 2 && f158.nCrypt === 2 && f158.sigsDistinct && f158.aspectOk,
    JSON.stringify({ nComp: f158.nComp, nTower: f158.nTower, nCrypt: f158.nCrypt, distinct: f158.sigsDistinct, aspect: f158.aspectOk }));
  assert('F-158: sea plane, polygon-extruded continents and mountain meshes are present', f158.hasProjection === true && f158.sea >= 1 && f158.continents >= 3 && f158.mountains >= 5,
    JSON.stringify({ sea: f158.sea, continents: f158.continents, mountains: f158.mountains }));
  await cdp.eval(`(async () => { setAtlas3dOption('contextOverride', ''); setAtlasEngineMode('2d_svg'); zoomStudioMap(0, true); return true; })()`);

  // ---------------------------------------------------------------- 8. F-157 / V-11 layout: clip frame, app sidebar, drawer, lens bar
  {
    const metrics = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const canvasW = () => cdp.eval(`Math.round(document.querySelector('.joy-spatial-shell__canvas').getBoundingClientRect().width)`);
    const sideW = () => cdp.eval(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)`);
    await metrics(1440, 900);
    await cdp.eval(`(()=>{ try { localStorage.removeItem('atlas-sidebar-collapsed'); } catch (e) {} setAtlasEngineMode('2d_svg'); ATLAS_RASTER_RELIEF_OVERLAY = true; STUDIO_MAP_SELECTED_POI = null; ATLAS_LEFT_DRAWER_OPEN = false; render(); return 1; })()`);
    await sleep(500);
    const clip = await cdp.eval(`(()=>{ const c = document.getElementById('atlasWorldFrameClip'); const r = c && c.querySelector('rect'); const vp = document.getElementById('studioCartoViewport'); const g = vp && vp.parentElement;
      return { exists: !!c, tag: c && c.tagName, rect: r ? [r.getAttribute('x'), r.getAttribute('y'), r.getAttribute('width'), r.getAttribute('height')].map(Number) : null, wrapped: !!(g && g.tagName.toLowerCase() === 'g' && /atlasWorldFrameClip/.test(g.getAttribute('clip-path') || '')), insideSvg: !!(c && c.closest('#dedicatedWorldAtlasSvg')) }; })()`);
    assert('F-157 clipPath #atlasWorldFrameClip (0 0 1040 500) wraps #studioCartoViewport inside the atlas svg',
      clip.exists && clip.insideSvg && clip.wrapped && clip.rect && clip.rect[0] === 0 && clip.rect[1] === 0 && clip.rect[2] === 1040 && clip.rect[3] === 500, JSON.stringify(clip));

    // app sidebar: collapse, widen >= 240, hotkey, persistence, visible reopen control
    const hasFn = await cdp.eval(`typeof toggleAppSidebar === 'function'`);
    let sb = { hasFn };
    if (hasFn) {
      sb.w0 = await canvasW(); sb.side0 = await sideW();
      await cdp.eval(`toggleAppSidebar(); 0`); await sleep(400);
      sb.w1 = await canvasW(); sb.side1 = await sideW();
      sb.reopen = await cdp.eval(`(()=>{ const b = document.getElementById('appSidebarReopenTab'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8 && getComputedStyle(b).visibility !== 'hidden' && r.left >= 0 && r.left < innerWidth; })()`);
      sb.stored = await cdp.eval(`(()=>{ try { return localStorage.getItem('atlas-sidebar-collapsed'); } catch (e) { return 'err'; } })()`);
      sb.url = await cdp.eval(`location.search.includes('sidebar=0')`);
      await cdp.send('Page.reload'); await sleep(2500);
      sb.afterReload = await sideW();
      for (const t of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type: t, key: '[', code: 'BracketLeft', text: t === 'keyDown' ? '[' : undefined });
      await sleep(400);
      sb.afterHotkey = await sideW();
      for (const t of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type: t, key: '[', code: 'BracketLeft', text: t === 'keyDown' ? '[' : undefined });
      await sleep(400);
      sb.afterHotkey2 = await sideW();
    }
    assert('F-157 toggleAppSidebar() collapses .sidebar to 0px, widens the map >=240px, persists (localStorage + URL), [ hotkey toggles, re-open tab visible',
      hasFn && sb.side0 > 200 && sb.side1 === 0 && sb.w1 - sb.w0 >= 240 && sb.reopen === true && sb.stored === '1' && sb.url === true && sb.afterReload === 0 && sb.afterHotkey > 200 && sb.afterHotkey2 === 0, JSON.stringify(sb));
    if (hasFn) await cdp.eval(`(()=>{ if (typeof APP_SIDEBAR_COLLAPSED !== 'undefined' && APP_SIDEBAR_COLLAPSED) toggleAppSidebar(); return 1; })()`);
    await sleep(300);

    // place inspector: closing it must hand its column back to the map (>= 300px at 1440)
    await cdp.eval(`(()=>{ setAtlasEngineMode('2d_svg'); STUDIO_MAP_SELECTED_POI = { title: 'Probe Place', category: 'Probe' }; ATLAS_LEFT_DRAWER_OPEN = true; render(); return 1; })()`);
    await sleep(400);
    const dw0 = await canvasW();
    await cdp.eval(`closeStudioMapPoi(); 0`); await sleep(400);
    const dw1 = await canvasW();
    assert('F-157 closing the Place Inspector widens the map canvas >=300px (drawer area collapses)', dw1 - dw0 >= 300, `open=${dw0} closed=${dw1}`);

    // lens bar: no truncated or clipped button at tablet/desktop widths
    const lensBad = [];
    for (const w of [900, 1024, 1080, 1180, 1280]) {
      await metrics(w, 800); await sleep(500);
      const bad = await cdp.eval(`(()=>{ const bar = document.getElementById('joyPersonaLensBar'); const br = bar.getBoundingClientRect();
        return [...bar.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); if (r.width === 0) return false; const cs = getComputedStyle(b);
          return b.scrollWidth > b.clientWidth || cs.textOverflow === 'ellipsis' || r.left < br.left - 0.5 || r.right > br.right + 0.5 || r.right > innerWidth + 0.5; }).map(b => (b.textContent || '').trim().slice(0, 14)); })()`);
      if (bad.length) lensBad.push(`${w}px: ${bad.join(',')}`);
    }
    assert('F-157 #joyPersonaLensBar has zero truncated/clipped buttons at 900/1024/1080/1180/1280px', lensBad.length === 0, lensBad.join(' | ') || 'ok');
    await metrics(1440, 900); await sleep(300);
  }

  // ---------------------------------------------------------------- 9. F-158 polish: header status pill never truncates; legend visible without scrolling at 1080x810 / 1024x768
  {
    const metrics = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const pillBad = [];
    for (const [w, h] of [[1024, 768], [1080, 810], [1440, 900]]) {
      await metrics(w, h); await sleep(500);
      const r = await cdp.eval(`(()=>{ const p = document.getElementById('topbarStatus'); const b = p.getBoundingClientRect(); const cs = getComputedStyle(p);
        return { sw: p.scrollWidth, cw: p.clientWidth, ell: cs.textOverflow === 'ellipsis' && p.scrollWidth > p.clientWidth, shrink: cs.flexShrink, ws: cs.whiteSpace, w: Math.round(b.width), right: Math.round(b.right), vw: innerWidth }; })()`);
      if (!(r.sw <= r.cw && !r.ell && r.shrink === '0' && r.ws === 'nowrap' && r.right <= r.vw)) pillBad.push(`${w}: ${JSON.stringify(r)}`);
    }
    assert('F-158 #topbarStatus (Ready pill) is never truncated at 1024/1080/1440px (scrollWidth<=clientWidth, no ellipsis, nowrap, no shrink)', pillBad.length === 0, pillBad.join(' | ') || 'ok');
    const legBad = [];
    for (const [w, h] of [[1080, 810], [1024, 768]]) {
      for (const mode of ['2d_svg', '3d_map3d']) {
        await metrics(w, h);
        await cdp.eval(`(()=>{ try { localStorage.removeItem('atlas-sidebar-collapsed'); } catch (e) {} if (typeof APP_SIDEBAR_COLLAPSED !== 'undefined' && APP_SIDEBAR_COLLAPSED) toggleAppSidebar(false); setAtlasEngineMode('${mode}'); render(); window.scrollTo(0, 0); return 1; })()`);
        await sleep(900);
        const r = await cdp.eval(`(()=>{ const l = document.querySelector('.atlas-map-legend'); if (!l) return { missing: true }; const b = l.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight, side: Math.round(document.querySelector('.sidebar').getBoundingClientRect().width), docH: document.documentElement.scrollHeight }; })()`);
        if (r.missing || !(r.bottom <= r.vh && r.side > 100)) legBad.push(`${w}x${h} ${mode}: ${JSON.stringify(r)}`);
      }
    }
    assert('F-158 bottom legend bar is fully inside the viewport (no scroll) at 1080x810 and 1024x768, sidebar open, in 2d_svg and 3d_map3d', legBad.length === 0, legBad.join(' | ') || 'ok');
    const f162 = await cdp.eval(`(()=>{
      const tatlas = (DATA && DATA.studioPerspectives && DATA.studioPerspectives.tShapedWorldAtlas) || {};
      const zones = getAllAtlas63Zones(tatlas);
      const placed = getAtlasPlacedZonePoints(tatlas, zones);
      let maxDrift = 0;
      zones.forEach(z => {
        const p = placed[z.zone_id];
        const f = resolveAtlasFocusLoc(z.loc_coord, z.zone_id, z.studio_node_id);
        const d = p ? Math.hypot((f.svgX || 0) - p.x, (f.svgY || 0) - p.y) : 999;
        if (d > maxDrift) maxDrift = d;
        const r = computeShortestAtlasZonePath('zone-town-lantern-hollow', z.zone_id, tatlas);
        (r.hops || []).forEach(h => {
          const hp = placed[h.zoneId];
          const hd = hp ? Math.hypot((h.svgX || 0) - hp.x, (h.svgY || 0) - hp.y) : 999;
          if (hd > maxDrift) maxDrift = hd;
        });
      });
      return { zones: zones.length, maxDrift: Math.round(maxDrift * 100) / 100 };
    })()`);
    assert('F-162 all 63 zones have 0px drift between getAtlasPlacedZonePoints, resolveAtlasFocusLoc, and computeShortestAtlasZonePath hops', f162.zones === 63 && f162.maxDrift === 0, JSON.stringify(f162));
    const f163 = await cdp.eval(`(async () => {
      const tatlas = (DATA && DATA.studioPerspectives && DATA.studioPerspectives.tShapedWorldAtlas) || {};
      const firstRace = ((tatlas.race_growth_routes || [])[0] || {}).race_label || 'Human';
      ATLAS_STATE_STORE.activeFieldOrFortId = '';
      ATLAS_STATE_STORE.levelBand = 'All';
      setAtlasFilter('All');
      ATLAS_ROUTE_PLANNER_OPEN = true;
      setAtlasRouteEndpoints('zone-town-lantern-hollow', 'zone-town-kilnwatch-bastion');
      ATLAS_STATE_STORE.raceGrowthRoute = firstRace;
      setAtlasEngineMode('2d_ol');
      render();
      for (let i = 0; i < 60; i++) { if (window.__ATLAS_OL_MAP_INSTANCE && window.__ATLAS_OL_MAP_INSTANCE.getLayers) break; await new Promise(r => setTimeout(r, 50)); }
      const m = window.__ATLAS_OL_MAP_INSTANCE;
      const layers = m ? m.getLayers().getArray() : [];
      const mobLayer = layers.find(l => l.get && l.get('atlasRole') === 'mob_pins');
      const routeLayer = layers.find(l => l.get && l.get('atlasRole') === 'routes');
      const olMobCount = mobLayer && mobLayer.getSource ? mobLayer.getSource().getFeatures().length : 0;
      const olRouteFeatures = routeLayer && routeLayer.getSource ? routeLayer.getSource().getFeatures().length : 0;
      setAtlasEngineMode('3d_map3d');
      setAtlas3dOption('contextOverride', 'overland');
      const overlandScene = buildAtlas3dBlockoutScene();
      const bfs3d = overlandScene.meshes.filter(x => x.part === 'bfs_route_segment').length;
      const race3d = overlandScene.meshes.filter(x => x.part === 'race_route_segment').length;
      setAtlas3dOption('contextOverride', 'field');
      const fieldScene = buildAtlas3dBlockoutScene();
      const fieldGround = fieldScene.meshes.some(x => x.name === 'Field_Terrain_Ground');
      const fieldPillars = fieldScene.meshes.filter(x => x.part === 'spawn_pillar').length;
      ATLAS_ROUTE_PLANNER_OPEN = false;
      ATLAS_STATE_STORE.raceGrowthRoute = 'All';
      setAtlas3dOption('contextOverride', '');
      return { olMobCount, olRouteFeatures, bfs3d, race3d, fieldGround, fieldPillars };
    })()`);
    assert('F-163 cross-engine parity: 2d_ol renders mob_pins + routes layers, 3d_map3d renders overland routes + dedicated field tactical scene',
      f163.olMobCount === 10 && f163.olRouteFeatures >= 4 && f163.bfs3d >= 2 && f163.race3d > 0 && f163.fieldGround === true && f163.fieldPillars >= 3,
      JSON.stringify(f163));
    await cdp.eval(`(()=>{ setAtlasEngineMode('2d_svg'); render(); return 1; })()`);
    await metrics(1440, 900); await sleep(300);
  }

  // ---------------------------------------------------------------- 4. console
  await sleep(300);
  result.consoleErrors = consoleErrors;
  assert('0 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 8).map(e => `[${e.phase}] ${e.kind}: ${String(e.text).slice(0, 160)}`));

  result.failed = result.assertions.filter(a => a.status === 'FAIL').length;
  result.verdict = result.failed ? 'FAIL' : 'PASS';
  const json = JSON.stringify(result, null, 2);
  if (OUT) writeFileSync(OUT, json);
  console.log(json);
  console.error('\n' + result.assertions.map(a => `${a.status}  ${a.name}`).join('\n'));
  console.error(`\nVERDICT: ${result.verdict} (${result.failed} failed)`);
  cdp.ws.close();
  cleanup();
  process.exit(result.failed ? 1 : 0);
}

main().catch(e => {
  console.error('HARNESS ERROR:', e.stack || e);
  process.exit(2);
});
