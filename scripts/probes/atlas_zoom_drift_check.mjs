#!/usr/bin/env node
// Atlas zoom drift check — real headless Chrome over CDP, no npm dependencies.
//
// Verifies that World Atlas 2D SVG pins (landmarks, mob/boss pins, race-spawn
// and dungeon-warp badges) stay glued to their world anchor at every zoom,
// that wheel zoom keeps the world point under the cursor fixed, and that the
// wheel does not teleport STUDIO_MAP_LOC or flip the zoom tier to field/town.
//
// Usage:
//   node scripts/probes/atlas_zoom_drift_check.mjs [--url http://127.0.0.1:8788/] [--out result.json] [--keep]
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
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
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

async function main() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'atlas-qa-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1440,900', '--force-device-scale-factor=2', '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', 'about:blank'
  ], { stdio: 'ignore' });
  const cleanup = () => {
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
  const assert = (name, pass, detail) => result.assertions.push({ name, status: pass ? 'PASS' : 'FAIL', detail });
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
