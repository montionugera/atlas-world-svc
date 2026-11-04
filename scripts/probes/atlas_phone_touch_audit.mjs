// F-156: atlas explorer phone/touch audit. One named assertion per bug B1..B7; exits 1 on any failure.
// usage: node scripts/probes/atlas_phone_touch_audit.mjs [--url http://127.0.0.1:8788/]
// Needs a running catalog_explorer_web.py server and Google Chrome (CHROME_BIN to override).
// Exit: 0 all pass, 1 assertion failed, 2 setup error, 3 Chrome missing (skipped by callers).
import { launch, sleep, tap, touchSeq, chromeAvailable, waitFor, settle, navigate } from './atlas_audit_lib.mjs';
const argv = process.argv.slice(2);
const ui = argv.indexOf('--url');
const base = ui >= 0 ? argv[ui + 1] : 'http://127.0.0.1:8788/';
const URL0 = base.includes('?') ? base : base.replace(/\/?$/, '/') + '?tab=studio&perspective=world-history-and-concept';
if (!chromeAvailable()) { console.error('SKIP: Chrome not found (set CHROME_BIN)'); process.exit(3); }

// Scenarios are independent fresh tabs in one Chrome. Blocks run concurrently (at most ATLAS_PROBE_TABS tabs open, default 4);
// each block collects its own assertions and they are printed in declaration order, so the PASS/FAIL list is deterministic.
const MAX_TABS = Math.max(1, Math.min(4, +process.env.ATLAS_PROBE_TABS || 4));
let slots = MAX_TABS; const waiters = [];
const acquire = () => slots > 0 ? (slots--, Promise.resolve()) : new Promise(r => waiters.push(r));
const release = () => { const w = waiters.shift(); if (w) w(); else slots++; };
const with_ = async (opts, fn) => { await acquire(); let c; try { c = await launch({ ...opts, url: URL0 }); return await fn(c); } finally { try { await c?.kill(); } finally { release(); } } };
// Readiness of each engine = the DOM the assertions measure exists (condition wait; bounded, expiry just falls through to the assertion).
const READY = {
  '2d_svg': `!!document.querySelector('.atlas-map-legend')`,
  '2d_ol': `!!(window.__ATLAS_OL_MAP_INSTANCE && document.querySelector('#atlasAdvancedEngineMount .ol-viewport') && document.querySelector('#atlasOlToolbarPanel button'))`,
  '3d_map3d': `!!(document.getElementById('atlasMap3dCanvas') && document.querySelector('#atlasMap3dToolbarPanel button'))`
};
const toEngine = async (c, eng) => { if (eng !== '2d_svg') await c.eval(`setAtlasEngineMode('${eng}'); 0`); await waitFor(c, READY[eng], 15000); await settle(c); };
const toTheater = async c => { await c.eval(`if(!ATLAS_THEATER_MODE) toggleAtlasTheaterMode(); 0`); await waitFor(c, 'ATLAS_THEATER_MODE===true', 5000); await settle(c); };
const to3d = async (c, theater) => { await toEngine(c, '3d_map3d'); if (theater) await toTheater(c); };
const olRendered = c => c.eval(`new Promise(r=>{const m=window.__ATLAS_OL_MAP_INSTANCE; m.once('rendercomplete',()=>r(true)); m.render(); setTimeout(()=>r(false),10000)})`);
const key = (c, k, code) => Promise.all(['keyDown', 'keyUp'].map(type => c.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: 27 })));
const rectOf = (c, sel) => c.eval(`(()=>{const e=${sel}; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
const PRESETS = `[...document.querySelectorAll('.joy-omni-command-bar__btn')].find(b=>/Presets/.test(b.textContent))`;

const IS_OPEN = `(()=>{const t=document.getElementById('atlasOmniQuickJumpPills'); return !!t && getComputedStyle(t).display!=='none' && t.getBoundingClientRect().height>0})()`;
const isOpen = c => c.eval(IS_OPEN);
// legend helpers (F-161)
const LG_FRAME = `document.querySelector('.joy-spatial-shell__canvas').getBoundingClientRect()`;
const lgVisible = `(e=>{ if(!e) return null; const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); return (cs.display==='none'||cs.visibility==='hidden'||r.width<=0||r.height<=0)?null:r })`;
const lgReady = c => waitFor(c, `!!document.getElementById('atlasLegendToggleBtn') && !!document.querySelector('.joy-spatial-shell__canvas')`, 10000).then(() => settle(c));
const lgState = c => c.eval(`(()=>{ const vis=${lgVisible}; const f=${LG_FRAME}; const btn=document.getElementById('atlasLegendToggleBtn'); const lg=document.querySelector('.atlas-map-legend'); const br=vis(btn), lr=vis(lg); const keys=[...lg.querySelectorAll('*')].some(e=>/Keys:/.test(e.textContent)&&e.children.length===0&&vis(e)); let topmost=false; if(br){const el=document.elementFromPoint(br.left+br.width/2,br.top+br.height/2); topmost=el===btn||btn.contains(el)} const area=r=>r?Math.max(0,Math.min(r.right,f.right)-Math.max(r.left,f.left))*Math.max(0,Math.min(r.bottom,f.bottom)-Math.max(r.top,f.top)):0; return {btn:br?[Math.round(br.width),Math.round(br.height)]:null, topmost, legendVisible:!!lr, legendH:lr?lr.height:0, frameH:f.height, cover:(area(br)+area(lr))/(f.width*f.height), keys, pressed:btn&&btn.getAttribute('aria-pressed')} })()`);
// tap the legend toggle, then wait for aria-pressed to flip (the state change the assertions read), then layout settle
const lgTap = async c => { const p = await rectOf(c, `document.getElementById('atlasLegendToggleBtn')`); if (!p) return; const p0 = await c.eval(`document.getElementById('atlasLegendToggleBtn').getAttribute('aria-pressed')`); await tap(c, p.x, p.y); await waitFor(c, `document.getElementById('atlasLegendToggleBtn').getAttribute('aria-pressed')!==${JSON.stringify(p0)}`, 4000); await settle(c); };
const par = (items, fn) => Promise.all(items.map(fn));

// Each block: async ck => {...}; ck(name, ok, detail) records one assertion. Blocks start together, tabs capped by with_.
const blocks = [];

// B1: search input usable and buttons tappable and non-overlapping at phone widths
blocks.push(async ck => {
  const per = await par([320, 375, 390, 430], w => with_({ w, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
    const bad = [];
    await c.eval(`setAtlasOmniSearch('town'); 0`);
    await waitFor(c, `(document.getElementById('atlasOmniSearchInput')||{}).value==='town' && document.querySelectorAll('.joy-omni-command-bar__btn').length>=2`, 8000); await settle(c);
    const r = await c.eval(`(()=>{const i=document.getElementById('atlasOmniSearchInput').getBoundingClientRect(); const bs=[...document.querySelectorAll('.joy-omni-command-bar__btn')].map(b=>{const r=b.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}}); let overlap=false; for(let a=0;a<bs.length;a++) for(let b=a+1;b<bs.length;b++){const p=bs[a],q=bs[b]; if(p.l<q.r&&q.l<p.r&&p.t<q.b&&q.t<p.b) overlap=true;} const iEl=document.getElementById('atlasOmniSearchInput'); const ir=iEl.getBoundingClientRect(); const top=document.elementFromPoint(ir.left+ir.width/2, ir.top+ir.height/2); return {inputW:Math.round(i.width), nBtn:bs.length, minBtn:Math.round(Math.min(...bs.map(b=>Math.min(b.w,b.h)))), overlap, inputTopmost: top===iEl}})()`);
    if (!(r.inputW >= 120 && r.nBtn >= 2 && r.minBtn >= 32 && !r.overlap && r.inputTopmost)) bad.push(`${w}px:${JSON.stringify(r)}`);
    if (w === 375) { const p = await rectOf(c, `document.getElementById('atlasOmniSearchInput')`); await tap(c, p.x, p.y); await waitFor(c, `document.activeElement && document.activeElement.id==='atlasOmniSearchInput'`, 3000); const f = await c.eval(`document.activeElement && document.activeElement.id`); if (f !== 'atlasOmniSearchInput') bad.push(`375px: tap did not focus input (active=${f})`); }
    return bad; }));
  const bad = per.flat();
  ck('B1 search input >=120px wide, focusable, buttons >=32px and not overlapping @320/375/390/430', !bad.length, bad.join(' ; ') || 'ok');
});

// B2: phone search sheet closes on result select, Esc, outside tap; has a >=32px close control
blocks.push(async ck => {
  const P = { w: 375, h: 812, dpr: 2, mobile: true, touch: true };
  const open = async c => { const p = await rectOf(c, PRESETS); await tap(c, p.x, p.y); await waitFor(c, IS_OPEN, 4000); };
  const closed = c => waitFor(c, `!(${IS_OPEN})`, 4000);
  const parts = await par(['result', 'esc', 'outside', 'close'], kind => with_(P, async c => {
    const o = {};
    await open(c);
    if (kind === 'result') {
      o.openedFirst = await isOpen(c);
      const it = await c.eval(`(()=>{const b=[...document.querySelectorAll('.joy-omni-command-bar__item')].find(x=>/Open Town/.test(x.textContent)) || document.querySelector('.joy-omni-command-bar__item'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await tap(c, it.x, it.y); await closed(c); o.afterResultOpen = await isOpen(c);
    } else if (kind === 'esc') { await key(c, 'Escape', 'Escape'); await closed(c); o.afterEscOpen = await isOpen(c); }
    else if (kind === 'outside') { await tap(c, 187, 215); await closed(c); o.afterOutsideTapOpen = await isOpen(c); }
    else { const cl = await rectOf(c, `document.querySelector('.joy-omni-command-bar__close')`);
      o.close = cl ? `${Math.round(cl.w)}x${Math.round(cl.h)}` : 'missing';
      if (cl) { await tap(c, cl.x, cl.y); await closed(c); o.afterCloseOpen = await isOpen(c); } }
    return o; }));
  const out = Object.assign({}, ...parts);
  const ordered = { openedFirst: out.openedFirst, afterResultOpen: out.afterResultOpen, afterEscOpen: out.afterEscOpen, afterOutsideTapOpen: out.afterOutsideTapOpen, close: out.close, afterCloseOpen: out.afterCloseOpen };
  ck('B2 sheet closes on result select / Esc / outside tap, close control >=32x32', out.openedFirst && !out.afterResultOpen && !out.afterEscOpen && !out.afterOutsideTapOpen && !out.afterCloseOpen && !!out.close && out.close !== 'missing' && out.close.split('x').every(n => +n >= 32), JSON.stringify(ordered));
});

// B3/B4: every OL/3D toolbar button inside the viewport and topmost at its centre
for (const [bug, w, h, dpr] of [['B3', 375, 812, 2], ['B4', 812, 375, 3]]) blocks.push(async ck => {
  const combos = []; for (const theater of [false, true]) for (const eng of ['3d_map3d', '2d_ol']) combos.push([theater, eng]);
  const per = await par(combos, ([theater, eng]) => with_({ w, h, dpr, mobile: true, touch: true }, async c => {
    await toEngine(c, eng); if (theater) await toTheater(c);
    await settle(c, '#atlasMap3dToolbarPanel button, #atlasOlToolbarPanel button');
    const r = await c.eval(`(()=>{const tb=document.querySelector('#atlasMap3dToolbarPanel, #atlasOlToolbarPanel'); if(!tb) return {err:'no toolbar'}; const btns=[...tb.querySelectorAll('button')]; const bad=btns.filter(b=>{const r=b.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; if(cx<0||cy<0||cx>innerWidth||cy>innerHeight) return true; const e=document.elementFromPoint(cx,cy); return !(e===b||b.contains(e))}).length; return {btns:btns.length, bad}})()`);
    return (r.err || !r.btns || r.bad) ? [`${theater ? ' theater' : ''} ${eng}: ${JSON.stringify(r)}`] : []; }));
  const bad = per.flat();
  ck(`${bug} all OL+3D toolbar buttons in viewport and topmost @${w}x${h}, flat and theater`, !bad.length, bad.join(' ; ') || 'ok');
});

// B5: 3D HUD 1:1 after 5.2x restores prior scene and 2D zoom
blocks.push(ck => with_({ w: 1440, h: 900, dpr: 1 }, async c => {
  await to3d(c, false);
  const hud = l => c.eval(`[...document.querySelectorAll('.joy-spatial-shell__hud-panel--zoom button')].find(x=>x.textContent.trim()==='${l}').click()`);
  const title = () => c.eval(`((document.querySelector('#atlasMap3dToolbarPanel .mono').textContent.match(/\\(([A-Z_ ]+)/)||[])[1]||'').trim()`);
  await waitFor(c, `/\\(([A-Z_ ]+)/.test((document.querySelector('#atlasMap3dToolbarPanel .mono')||{}).textContent||'') && document.querySelector('.joy-spatial-shell__hud-panel--zoom button')`, 8000);
  const a = await title(); const z0 = await c.eval('STUDIO_MAP_ZOOM');
  await hud('5.2×'); await waitFor(c, 'ATLAS_3D_STATE.zoom===2.6', 4000); await settle(c); const b = await title();
  await hud('1:1'); await waitFor(c, `((document.querySelector('#atlasMap3dToolbarPanel .mono').textContent.match(/\\(([A-Z_ ]+)/)||[])[1]||'').trim()===${JSON.stringify(a)} && STUDIO_MAP_ZOOM===${JSON.stringify(z0)}`, 5000); await settle(c);
  const d = await title(); const z1 = await c.eval('STUDIO_MAP_ZOOM');
  ck('B5 3D 1:1 restores scene and 2D zoom active before 5.2x', d === a && z1 === z0, `scene start=${a} after5.2x=${b} after1:1=${d}; z2d start=${z0} after1:1=${z1}`); }));

// B6: touchcancel/pointercancel on a 3D mesh must not select it
blocks.push(ck => with_({ w: 1440, h: 900, dpr: 1, touch: true }, async c => {
  await to3d(c, true);
  const find = () => c.eval(`(()=>{const cv=document.getElementById('atlasMap3dCanvas'); const r=cv.getBoundingClientRect(); for(let fy=0.3;fy<0.8;fy+=0.03) for(let fx=0.2;fx<0.8;fx+=0.03){ const x=r.left+r.width*fx,y=r.top+r.height*fy; if(document.elementFromPoint(x,y)!==cv) continue; ATLAS_3D_STATE.hoveredMeshName=''; cv.onmousemove({clientX:x,clientY:y}); if(ATLAS_3D_STATE.hoveredMeshName) return {x,y,m:ATLAS_3D_STATE.hoveredMeshName}; } return null })()`);
  let hit = null; for (let i = 0; i < 60 && !hit; i++) { hit = await find(); if (!hit) await sleep(150); } // mesh appears when the scene has loaded
  if (!hit) { ck('B6 touchcancel on 3D mesh does not select', false, 'no mesh found under any probe point'); return; }
  await c.eval(`ATLAS_3D_STATE.selectedMeshName=''; window.__ev=[]; ['pointerdown','pointerup','pointercancel'].forEach(t=>document.getElementById('atlasMap3dCanvas').addEventListener(t,e=>window.__ev.push(t),true))`);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hit.x, y: hit.y, id: 1 }] }); await waitFor(c, `window.__ev.includes('pointerdown')`, 3000);
  await c.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await waitFor(c, `window.__ev.includes('pointercancel')`, 3000); await sleep(150); // dwell: a wrongly-selecting handler would have fired by now
  const sel = await c.eval('ATLAS_3D_STATE.selectedMeshName'); const ev = await c.eval('window.__ev');
  ck('B6 touchcancel on 3D mesh does not select', !sel && ev.includes('pointercancel'), `events=${JSON.stringify(ev)} selected=${JSON.stringify(sel)}`); }));

// B7: OL two-finger twist+spread: rotation stays 0 and pinch zoom still works
blocks.push(ck => with_({ w: 768, h: 1024, dpr: 3, mobile: true, touch: true }, async c => {
  await toEngine(c, '2d_ol'); await olRendered(c);
  const ctr = await c.eval(`(()=>{const r=document.querySelector('#atlasAdvancedEngineMount .ol-viewport').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  const res0 = await c.eval(`window.__ATLAS_OL_MAP_INSTANCE.getView().getResolution()`);
  await touchSeq(c, [{ x: ctr.x - 30, y: ctr.y }, { x: ctr.x + 30, y: ctr.y }], [{ x: ctr.x - 60, y: ctr.y - 60 }, { x: ctr.x + 60, y: ctr.y + 60 }], 10);
  await waitFor(c, `window.__ATLAS_OL_MAP_INSTANCE.getView().getResolution() < ${res0 * 0.95}`, 4000); await settle(c);
  const rot = await c.eval(`window.__ATLAS_OL_MAP_INSTANCE.getView().getRotation()`);
  const res1 = await c.eval(`window.__ATLAS_OL_MAP_INSTANCE.getView().getResolution()`);
  ck('B7 OL two-finger twist leaves rotation 0 and pinch zoom still works', Math.abs(rot) < 1e-6 && res1 < res0 * 0.95, `rotation=${rot.toFixed(3)} rad resolution ${res0.toFixed(4)} -> ${res1.toFixed(4)}`); }));

// F-160 H1: SVG engine - every visible pin has an effective hit area >= 44x44 CSS px on a coarse pointer
blocks.push(ck => with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
  await waitFor(c, `document.querySelectorAll('#dedicatedWorldAtlasSvg [data-poi-clickable="1"]').length>0`, 8000); await settle(c);
  const r = await c.eval(`(()=>{const sv=document.getElementById('dedicatedWorldAtlasSvg'); const sr=sv.getBoundingClientRect(); const pins=[...sv.querySelectorAll('[data-poi-clickable="1"]')].filter(g=>{const b=g.getBoundingClientRect(); const cx=b.left+b.width/2, cy=b.top+b.height/2; return b.width>0 && cx>sr.left && cx<sr.right && cy>sr.top && cy<sr.bottom}); const eff=g=>{const h=g.querySelector('.atlas-pin-hit'); const b=(h||g).getBoundingClientRect(); return {w:b.width,h:b.height}}; const bad=pins.filter(g=>{const e=eff(g); return e.w<43.5||e.h<43.5}); const m=pins.map(eff); return {n:pins.length, bad:bad.length, minW:Math.round(Math.min(...m.map(x=>x.w))), minH:Math.round(Math.min(...m.map(x=>x.h)))}})()`);
  ck('H1 SVG engine: every visible pin hit area >=44x44 @375x812 coarse', r.n > 0 && r.bad === 0, JSON.stringify(r)); }));

// F-160 H2: OL engine - a tap 21px off a pin's centre (corner of a 44x44 box) still selects it. One fresh page per tap:
// a successful tap opens the inspector drawer, which resizes the map under the next tap.
blocks.push(async ck => {
  const style = `document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'.joy-spatial-shell__hud--top-left{display:none!important}'})); 0`; // isolate pin hit-testing from the HUD overlay (H4 covers that)
  const per = await par([[0, 0], [21, 21], [-21, -21], [21, -21], [-21, 21]], ([dx, dy]) => with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
    await toEngine(c, '2d_ol'); await olRendered(c);
    await c.eval(style);
    // zoom 8x onto a field pin with no other pin within 62px, so 'nearest centre wins' cannot steal the tap
    const pick = await c.eval(`(async()=>{ const m=window.__ATLAS_OL_MAP_INSTANCE, v=m.getView(); const all=buildAtlasspatialFeaturesList(); const r8=v.getResolution()/8; const f=all.find(f=>f.actionType!=='town'&&f.actionType!=='dungeon'&&f.actionType!=='fortress'&&f.locCoord&&all.every(g=>g===f||Math.hypot(g.x-f.x,g.y-f.y)/r8>62)); v.setResolution(r8); v.setCenter([f.x,500-f.y]); await new Promise(r=>{m.once('rendercomplete',r); m.render();}); const vp=m.getViewport().getBoundingClientRect(); const p=m.getPixelFromCoordinate([f.x,500-f.y]); return {id:f.id,loc:f.locCoord,x:vp.left+p[0],y:vp.top+p[1]}})()`);
    await c.eval(`STUDIO_MAP_LOC={x:-9,y:-9}; 0`);
    const want = `JSON.stringify(STUDIO_MAP_LOC)===JSON.stringify(clampWorldLocCoord(${JSON.stringify(pick.loc)}))`;
    await tap(c, pick.x + dx, pick.y + dy); await waitFor(c, want, 4000);
    return { id: pick.id, ok: await c.eval(want) }; }));
  const id = per[per.length - 1].id; const got = per.map(x => x.ok);
  ck('H2 OL engine: tap 21px off a pin centre (corners of a 44x44 box) selects it', got.every(Boolean), `pin=${id} centre+corners hit=${JSON.stringify(got)}`);
});

// F-160 H3: theater exit button >=44x44 and topmost at its centre, portrait and landscape
blocks.push(async ck => {
  const per = await par([[375, 812, 2], [812, 375, 3]], ([w, h, dpr]) => with_({ w, h, dpr, mobile: true, touch: true }, async c => {
    await toTheater(c);
    await waitFor(c, `[...document.querySelectorAll('button')].some(b=>/toggleAtlasTheaterMode/.test(b.getAttribute('onclick')||'') && b.getBoundingClientRect().width>0)`, 5000); await settle(c);
    const r = await c.eval(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/toggleAtlasTheaterMode/.test(b.getAttribute('onclick')||'')).map(b=>({b,r:b.getBoundingClientRect()})).filter(o=>o.r.width>0&&o.r.height>0); if(!bs.length) return {err:'no exit button'}; const best=bs.find(o=>{const e=document.elementFromPoint(o.r.left+o.r.width/2,o.r.top+o.r.height/2); return e===o.b||o.b.contains(e)}); const o=best||bs[0]; return {w:Math.round(o.r.width),h:Math.round(o.r.height),topmost:!!best}})()`);
    return (r.err || r.w < 44 || r.h < 44 || !r.topmost) ? [`${w}x${h}: ${JSON.stringify(r)}`] : []; }));
  const out = per.flat();
  ck('H3 theater exit button >=44x44 and topmost @375x812 and 812x375', !out.length, out.join(' ; ') || 'ok');
});

// F-160 H4: top-left HUD covers <=25% of the map at 375x812 by default and a control hides it
blocks.push(ck => with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
  await waitFor(c, `!!document.querySelector('.joy-spatial-shell__hud--top-left') && !!document.getElementById('atlasHudToggleBtn')`, 8000); await settle(c);
  const area = () => c.eval(`(()=>{const cv=document.querySelector('.joy-spatial-shell__canvas').getBoundingClientRect(); const hud=document.querySelector('.joy-spatial-shell__hud--top-left'); const r=hud.getBoundingClientRect(); const vis=getComputedStyle(hud).display!=='none'&&getComputedStyle(hud).visibility!=='hidden'; const a=vis?Math.max(0,Math.min(r.right,cv.right)-Math.max(r.left,cv.left))*Math.max(0,Math.min(r.bottom,cv.bottom)-Math.max(r.top,cv.top)):0; return a/(cv.width*cv.height)})()`);
  const def = await area();
  const btn = await rectOf(c, `document.getElementById('atlasHudToggleBtn')`);
  let after = null;
  if (btn) { await tap(c, btn.x, btn.y); await waitFor(c, `(()=>{const h=document.querySelector('.joy-spatial-shell__hud--top-left'); return getComputedStyle(h).display==='none'||getComputedStyle(h).visibility==='hidden'||h.getBoundingClientRect().height===0})()`, 3000); await settle(c); after = await area(); }
  ck('H4 HUD <=25% of map by default @375x812 and a control hides/shows it', def <= 0.25 && !!btn && btn.w >= 44 && btn.h >= 44, `default cover=${(def * 100).toFixed(1)}% toggle=${btn ? Math.round(btn.w) + 'x' + Math.round(btn.h) : 'missing'} after-toggle cover=${after === null ? 'n/a' : (after * 100).toFixed(1) + '%'}`); }));

// F-161 L1..L5: phone map legend is a collapsed 44x44 toggle by default, expands to <=25% of the map without the keys line,
// survives reload / throwing storage, never overlaps a map toolbar, and desktop rendering is unchanged.
blocks.push(async ck => {
  const per = await par([[375, 812], [390, 844]], ([w, h]) => with_({ w, h, dpr: 2, mobile: true, touch: true }, async c => { await lgReady(c); return [w, h, await lgState(c)]; }));
  for (const [w, h, s] of per) ck(`L1 legend collapsed by default, covers <=5% of map, toggle >=44x44 and topmost @${w}x${h}`, !!s.btn && s.btn[0] >= 44 && s.btn[1] >= 44 && s.topmost && !s.legendVisible && s.cover <= 0.05, JSON.stringify(s));
});
blocks.push(ck => with_({ w: 390, h: 844, dpr: 2, mobile: true, touch: true }, async c => {
  await lgReady(c);
  await lgTap(c); const open = await lgState(c);
  const okOpen = open.legendVisible && open.legendH <= open.frameH * 0.25 + 0.5 && !open.keys && open.pressed === 'true';
  await lgTap(c); const closed = await lgState(c);
  ck('L2a toggle expands legend to <=25% of map height without keys line, and collapses again', okOpen && !closed.legendVisible, `open=${JSON.stringify(open)} closed.legendVisible=${closed.legendVisible}`);
  await lgTap(c); await navigate(c, URL0, true); await lgReady(c);
  const re = await lgState(c);
  ck('L2b expanded choice survives a reload (localStorage)', re.legendVisible && re.pressed === 'true', JSON.stringify(re)); }));
blocks.push(async ck => {
  await acquire(); let c;
  try {
    c = await launch({ w: 390, h: 844, dpr: 2, mobile: true, touch: true, url: 'about:blank' });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.getItem=function(){throw new Error('x')}; Storage.prototype.setItem=function(){throw new Error('x')};` });
    await navigate(c, URL0); await lgReady(c);
    const a = await lgState(c); await lgTap(c); const b = await lgState(c);
    ck('L2c page and legend toggle still work when storage throws', !!a.btn && !a.legendVisible && b.legendVisible && c.errors.length === 0, `collapsed=${!a.legendVisible} expanded=${b.legendVisible} errors=${JSON.stringify(c.errors)}`);
  } finally { try { await c?.kill(); } finally { release(); } }
});
blocks.push(async ck => {
  const base = { '1280x800 2d_svg': [281, 652.75, 975, 86], '1280x800 2d_ol': [293, 567, 951, 87], '1280x800 3d_map3d': [293, 567, 951, 87], '1440x900 2d_svg': [281, 729.7, 1135, 56], '1440x900 2d_ol': [293, 887, 1111, 57], '1440x900 3d_map3d': [293, 887, 1111, 57] };
  const combos = []; for (const [w, h] of [[1280, 800], [1440, 900]]) for (const eng of ['2d_svg', '2d_ol', '3d_map3d']) combos.push([w, h, eng]);
  const per = await par(combos, ([w, h, eng]) => with_({ w, h, dpr: 1 }, async c => {
    await toEngine(c, eng); await settle(c, '.atlas-map-legend');
    const r = await c.eval(`(()=>{const l=document.querySelector('.atlas-map-legend'); const r=l.getBoundingClientRect(); const bt=document.getElementById('atlasLegendToggleBtn'); const keys=[...l.querySelectorAll('*')].some(e=>/Keys:/.test(e.textContent)&&e.children.length===0&&getComputedStyle(e).display!=='none'); return {rect:[r.left,r.top,r.width,r.height], keys, toggleShown: !!bt && getComputedStyle(bt).display!=='none'}})()`);
    const exp = base[`${w}x${h} ${eng}`]; return (!r.keys || r.toggleShown || r.rect.some((v, i) => Math.abs(v - exp[i]) > 1.5)) ? [`${w}x${h} ${eng}: ${JSON.stringify(r)} expected ${JSON.stringify(exp)}`] : []; }));
  const bad = per.flat();
  ck('L3 desktop legend rect identical to pre-change measurement @1280x800 and 1440x900, keys line present, no toggle', !bad.length, bad.join(' ; ') || 'ok');
});
blocks.push(async ck => {
  const per = await par(['2d_svg', '2d_ol', '3d_map3d'], eng => with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
    await lgReady(c); await toEngine(c, eng);
    const probe = () => c.eval(`(()=>{ const vis=${lgVisible}; const els=[document.getElementById('atlasLegendToggleBtn'), document.querySelector('.atlas-map-legend')].map(vis).filter(Boolean); const btns=[...document.querySelectorAll('#atlasMap3dToolbarPanel button, #atlasOlToolbarPanel button, .joy-spatial-shell__hud button, #atlasHudToggleBtn, .atlas-theater-btn')].map(b=>({t:(b.textContent||'').trim().slice(0,12), r:vis(b)})).filter(o=>o.r); const hit=[]; for(const e of els) for(const o of btns) if(e.left<o.r.right&&o.r.left<e.right&&e.top<o.r.bottom&&o.r.top<e.bottom) hit.push(o.t); return {n:btns.length, hit}})()`);
    const a = await probe(); await lgTap(c); const b = await probe();
    return (a.hit.length || b.hit.length || !a.n) ? [`${eng}: collapsed=${JSON.stringify(a)} expanded=${JSON.stringify(b)}`] : []; }));
  const bad = per.flat();
  ck('L4 legend (collapsed or expanded) overlaps no map toolbar button in 2d_svg, 2d_ol, 3d_map3d @375x812', !bad.length, bad.join(' ; ') || 'ok');
});
// F-162 L5: in 2d_ol on phones, built-in .ol-zoom must not overlap #atlasHudToggleBtn or #atlasLegendToggleBtn
blocks.push(async ck => {
  const per = await par([[375, 812], [390, 844]], ([w, h]) => with_({ w, h, dpr: 2, mobile: true, touch: true }, async c => {
    await toEngine(c, '2d_ol'); await settle(c, '.ol-zoom, #atlasHudToggleBtn, #atlasLegendToggleBtn');
    const r = await c.eval(`(()=>{ const vis=${lgVisible}; const oz=vis(document.querySelector('.ol-zoom')); const btns=[document.getElementById('atlasHudToggleBtn'), document.getElementById('atlasLegendToggleBtn')].map(vis).filter(Boolean); const hit=[]; if(oz) for(const b of btns) if(oz.left<b.right&&b.left<oz.right&&oz.top<b.bottom&&b.top<oz.bottom) hit.push({oz,b}); return {oz:!!oz, hit:hit.length}})()`);
    return (r.oz || r.hit) ? [`${w}x${h}: ${JSON.stringify(r)}`] : []; }));
  const bad = per.flat();
  ck('L5 OL engine: no built-in .ol-zoom overlap with phone HUD/Legend toggles @375x812 and 390x844', !bad.length, bad.join(' ; ') || 'ok');
});

const results = []; const timings = [];
try {
  const done = await Promise.all(blocks.map(async (fn, i) => { const t0 = Date.now(); const rows = []; await fn((name, ok, detail) => rows.push({ name, ok: !!ok, detail })); timings.push(`[probe-timing] block${i + 1} ${rows.map(r => r.name.split(' ')[0]).join('+')} ${Date.now() - t0}ms`); return rows; }));
  for (const rows of done) for (const r of rows) { results.push(r.ok); console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} | ${r.detail}`); }
} catch (e) { console.error('SETUP ERROR:', e.message); process.exit(e.message === 'CHROME_MISSING' ? 3 : 2); }
timings.forEach(t => console.log(t));
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} assertions passed`);
process.exit(failed ? 1 : 0);
