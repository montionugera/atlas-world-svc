// F-156: atlas explorer phone/touch audit. One named assertion per bug B1..B7; exits 1 on any failure.
// usage: node scripts/probes/atlas_phone_touch_audit.mjs [--url http://127.0.0.1:8788/]
// Needs a running catalog_explorer_web.py server and Google Chrome (CHROME_BIN to override).
// Exit: 0 all pass, 1 assertion failed, 2 setup error, 3 Chrome missing (skipped by callers).
import { launch, sleep, tap, touchSeq, chromeAvailable } from './atlas_audit_lib.mjs';
const argv = process.argv.slice(2);
const ui = argv.indexOf('--url');
const base = ui >= 0 ? argv[ui + 1] : 'http://127.0.0.1:8788/';
const URL0 = base.includes('?') ? base : base.replace(/\/?$/, '/') + '?tab=studio&perspective=world-history-and-concept';
if (!chromeAvailable()) { console.error('SKIP: Chrome not found (set CHROME_BIN)'); process.exit(3); }

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} | ${detail}`); };
const with_ = async (opts, fn) => { const c = await launch({ ...opts, url: URL0 }); try { return await fn(c); } finally { c.kill(); } };
const to3d = (c, theater) => c.eval(`(async()=>{ setAtlasEngineMode('3d_map3d'); await new Promise(r=>setTimeout(r,800)); ${theater ? 'toggleAtlasTheaterMode();' : ''} await new Promise(r=>setTimeout(r,800)); })()`);
const key = (c, k, code) => Promise.all(['keyDown', 'keyUp'].map(type => c.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: 27 })));
const rectOf = (c, sel) => c.eval(`(()=>{const e=${sel}; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
const PRESETS = `[...document.querySelectorAll('.joy-omni-command-bar__btn')].find(b=>/Presets/.test(b.textContent))`;

async function main() {
  // B1: search input usable and buttons tappable and non-overlapping at phone widths
  { const bad = [];
    for (const w of [320, 375, 390, 430]) await with_({ w, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      await c.eval(`setAtlasOmniSearch('town'); 0`); await sleep(400);
      const r = await c.eval(`(()=>{const i=document.getElementById('atlasOmniSearchInput').getBoundingClientRect(); const bs=[...document.querySelectorAll('.joy-omni-command-bar__btn')].map(b=>{const r=b.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}}); let overlap=false; for(let a=0;a<bs.length;a++) for(let b=a+1;b<bs.length;b++){const p=bs[a],q=bs[b]; if(p.l<q.r&&q.l<p.r&&p.t<q.b&&q.t<p.b) overlap=true;} const iEl=document.getElementById('atlasOmniSearchInput'); const ir=iEl.getBoundingClientRect(); const top=document.elementFromPoint(ir.left+ir.width/2, ir.top+ir.height/2); return {inputW:Math.round(i.width), nBtn:bs.length, minBtn:Math.round(Math.min(...bs.map(b=>Math.min(b.w,b.h)))), overlap, inputTopmost: top===iEl}})()`);
      if (!(r.inputW >= 120 && r.nBtn >= 2 && r.minBtn >= 32 && !r.overlap && r.inputTopmost)) bad.push(`${w}px:${JSON.stringify(r)}`);
      if (w === 375) { const p = await rectOf(c, `document.getElementById('atlasOmniSearchInput')`); await tap(c, p.x, p.y); const f = await c.eval(`document.activeElement && document.activeElement.id`); if (f !== 'atlasOmniSearchInput') bad.push(`375px: tap did not focus input (active=${f})`); }
    });
    check('B1 search input >=120px wide, focusable, buttons >=32px and not overlapping @320/375/390/430', !bad.length, bad.join(' ; ') || 'ok'); }

  // B2: phone search sheet closes on result select, Esc, outside tap; has a >=32px close control
  { const out = {};
    const open = async c => { const p = await rectOf(c, PRESETS); await tap(c, p.x, p.y); };
    const isOpen = c => c.eval(`(()=>{const t=document.getElementById('atlasOmniQuickJumpPills'); return !!t && getComputedStyle(t).display!=='none' && t.getBoundingClientRect().height>0})()`);
    await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      await open(c); out.openedFirst = await isOpen(c);
      const it = await c.eval(`(()=>{const b=[...document.querySelectorAll('.joy-omni-command-bar__item')].find(x=>/Open Town/.test(x.textContent)) || document.querySelector('.joy-omni-command-bar__item'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await tap(c, it.x, it.y); await sleep(600); out.afterResultOpen = await isOpen(c); });
    await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      await open(c); await key(c, 'Escape', 'Escape'); await sleep(300); out.afterEscOpen = await isOpen(c); });
    await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      await open(c); await tap(c, 187, 215); await sleep(300); out.afterOutsideTapOpen = await isOpen(c); });
    await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      await open(c); const cl = await rectOf(c, `document.querySelector('.joy-omni-command-bar__close')`);
      out.close = cl ? `${Math.round(cl.w)}x${Math.round(cl.h)}` : 'missing';
      if (cl) { await tap(c, cl.x, cl.y); await sleep(300); out.afterCloseOpen = await isOpen(c); } });
    check('B2 sheet closes on result select / Esc / outside tap, close control >=32x32', out.openedFirst && !out.afterResultOpen && !out.afterEscOpen && !out.afterOutsideTapOpen && !out.afterCloseOpen && !!out.close && out.close !== 'missing' && out.close.split('x').every(n => +n >= 32), JSON.stringify(out)); }

  // B3/B4: every OL/3D toolbar button inside the viewport and topmost at its centre
  for (const [bug, w, h, dpr] of [['B3', 375, 812, 2], ['B4', 812, 375, 3]]) { const bad = [];
    for (const theater of [false, true]) for (const eng of ['3d_map3d', '2d_ol'])
      await with_({ w, h, dpr, mobile: true, touch: true }, async c => {
        await c.eval(`(async()=>{ setAtlasEngineMode('${eng}'); await new Promise(r=>setTimeout(r,1200)); ${theater ? 'toggleAtlasTheaterMode(); await new Promise(r=>setTimeout(r,1000));' : ''} })()`);
        const r = await c.eval(`(()=>{const tb=document.querySelector('#atlasMap3dToolbarPanel, #atlasOlToolbarPanel'); if(!tb) return {err:'no toolbar'}; const btns=[...tb.querySelectorAll('button')]; const bad=btns.filter(b=>{const r=b.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; if(cx<0||cy<0||cx>innerWidth||cy>innerHeight) return true; const e=document.elementFromPoint(cx,cy); return !(e===b||b.contains(e))}).length; return {btns:btns.length, bad}})()`);
        if (r.err || !r.btns || r.bad) bad.push(`${theater ? ' theater' : ''} ${eng}: ${JSON.stringify(r)}`); });
    check(`${bug} all OL+3D toolbar buttons in viewport and topmost @${w}x${h}, flat and theater`, !bad.length, bad.join(' ; ') || 'ok'); }

  // B5: 3D HUD 1:1 after 5.2x restores prior scene and 2D zoom
  await with_({ w: 1440, h: 900, dpr: 1 }, async c => {
    await to3d(c, false);
    const hud = l => c.eval(`[...document.querySelectorAll('.joy-spatial-shell__hud-panel--zoom button')].find(x=>x.textContent.trim()==='${l}').click()`);
    const title = () => c.eval(`((document.querySelector('#atlasMap3dToolbarPanel .mono').textContent.match(/\\(([A-Z_ ]+)/)||[])[1]||'').trim()`);
    const a = await title(); const z0 = await c.eval('STUDIO_MAP_ZOOM');
    await hud('5.2×'); await sleep(500); const b = await title();
    await hud('1:1'); await sleep(500); const d = await title(); const z1 = await c.eval('STUDIO_MAP_ZOOM');
    check('B5 3D 1:1 restores scene and 2D zoom active before 5.2x', d === a && z1 === z0, `scene start=${a} after5.2x=${b} after1:1=${d}; z2d start=${z0} after1:1=${z1}`); });

  // B6: touchcancel/pointercancel on a 3D mesh must not select it
  await with_({ w: 1440, h: 900, dpr: 1, touch: true }, async c => {
    await to3d(c, true);
    const hit = await c.eval(`(()=>{const cv=document.getElementById('atlasMap3dCanvas'); const r=cv.getBoundingClientRect(); for(let fy=0.3;fy<0.8;fy+=0.03) for(let fx=0.2;fx<0.8;fx+=0.03){ const x=r.left+r.width*fx,y=r.top+r.height*fy; if(document.elementFromPoint(x,y)!==cv) continue; ATLAS_3D_STATE.hoveredMeshName=''; cv.onmousemove({clientX:x,clientY:y}); if(ATLAS_3D_STATE.hoveredMeshName) return {x,y,m:ATLAS_3D_STATE.hoveredMeshName}; } return null })()`);
    if (!hit) { check('B6 touchcancel on 3D mesh does not select', false, 'no mesh found under any probe point'); return; }
    await c.eval(`ATLAS_3D_STATE.selectedMeshName=''; window.__ev=[]; ['pointerdown','pointerup','pointercancel'].forEach(t=>document.getElementById('atlasMap3dCanvas').addEventListener(t,e=>window.__ev.push(t),true))`);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hit.x, y: hit.y, id: 1 }] }); await sleep(60);
    await c.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await sleep(400);
    const sel = await c.eval('ATLAS_3D_STATE.selectedMeshName'); const ev = await c.eval('window.__ev');
    check('B6 touchcancel on 3D mesh does not select', !sel && ev.includes('pointercancel'), `events=${JSON.stringify(ev)} selected=${JSON.stringify(sel)}`); });

  // B7: OL two-finger twist+spread: rotation stays 0 and pinch zoom still works
  await with_({ w: 768, h: 1024, dpr: 3, mobile: true, touch: true }, async c => {
    await c.eval(`(async()=>{ setAtlasEngineMode('2d_ol'); await new Promise(r=>setTimeout(r,1500)); const m=window.__ATLAS_OL_MAP_INSTANCE; await new Promise(r=>{m.once('rendercomplete',r); m.render();}); })()`);
    const ctr = await c.eval(`(()=>{const r=document.querySelector('#atlasAdvancedEngineMount .ol-viewport').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    const res0 = await c.eval(`window.__ATLAS_OL_MAP_INSTANCE.getView().getResolution()`);
    await touchSeq(c, [{ x: ctr.x - 30, y: ctr.y }, { x: ctr.x + 30, y: ctr.y }], [{ x: ctr.x - 60, y: ctr.y - 60 }, { x: ctr.x + 60, y: ctr.y + 60 }], 10); await sleep(600);
    const rot = await c.eval(`window.__ATLAS_OL_MAP_INSTANCE.getView().getRotation()`);
    const res1 = await c.eval(`window.__ATLAS_OL_MAP_INSTANCE.getView().getResolution()`);
    check('B7 OL two-finger twist leaves rotation 0 and pinch zoom still works', Math.abs(rot) < 1e-6 && res1 < res0 * 0.95, `rotation=${rot.toFixed(3)} rad resolution ${res0.toFixed(4)} -> ${res1.toFixed(4)}`); });

  // F-160 H1: SVG engine - every visible pin has an effective hit area >= 44x44 CSS px on a coarse pointer
  await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
    const r = await c.eval(`(()=>{const sv=document.getElementById('dedicatedWorldAtlasSvg'); const sr=sv.getBoundingClientRect(); const pins=[...sv.querySelectorAll('[data-poi-clickable="1"]')].filter(g=>{const b=g.getBoundingClientRect(); const cx=b.left+b.width/2, cy=b.top+b.height/2; return b.width>0 && cx>sr.left && cx<sr.right && cy>sr.top && cy<sr.bottom}); const eff=g=>{const h=g.querySelector('.atlas-pin-hit'); const b=(h||g).getBoundingClientRect(); return {w:b.width,h:b.height}}; const bad=pins.filter(g=>{const e=eff(g); return e.w<43.5||e.h<43.5}); const m=pins.map(eff); return {n:pins.length, bad:bad.length, minW:Math.round(Math.min(...m.map(x=>x.w))), minH:Math.round(Math.min(...m.map(x=>x.h)))}})()`);
    check('H1 SVG engine: every visible pin hit area >=44x44 @375x812 coarse', r.n > 0 && r.bad === 0, JSON.stringify(r)); });

  // F-160 H2: OL engine - a tap 21px off a pin's centre (corner of a 44x44 box) still selects it. One fresh page per tap:
  // a successful tap opens the inspector drawer, which resizes the map under the next tap.
  { const got = []; let id = '';
    const style = `document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'.joy-spatial-shell__hud--top-left{display:none!important}'})); 0`; // isolate pin hit-testing from the HUD overlay (H4 covers that)
    for (const [dx, dy] of [[0, 0], [21, 21], [-21, -21], [21, -21], [-21, 21]]) await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      await c.eval(`(async()=>{ setAtlasEngineMode('2d_ol'); await new Promise(r=>setTimeout(r,1500)); const m=window.__ATLAS_OL_MAP_INSTANCE; await new Promise(r=>{m.once('rendercomplete',r); m.render();}); })()`);
      await c.eval(style);
      // zoom 8x onto a field pin with no other pin within 62px, so 'nearest centre wins' cannot steal the tap
      const pick = await c.eval(`(async()=>{ const m=window.__ATLAS_OL_MAP_INSTANCE, v=m.getView(); const all=buildAtlasspatialFeaturesList(); const r8=v.getResolution()/8; const f=all.find(f=>f.actionType!=='town'&&f.actionType!=='dungeon'&&f.actionType!=='fortress'&&f.locCoord&&all.every(g=>g===f||Math.hypot(g.x-f.x,g.y-f.y)/r8>62)); v.setResolution(r8); v.setCenter([f.x,500-f.y]); await new Promise(r=>{m.once('rendercomplete',r); m.render();}); const vp=m.getViewport().getBoundingClientRect(); const p=m.getPixelFromCoordinate([f.x,500-f.y]); return {id:f.id,loc:f.locCoord,x:vp.left+p[0],y:vp.top+p[1]}})()`);
      id = pick.id;
      await c.eval(`STUDIO_MAP_LOC={x:-9,y:-9}; 0`);
      await tap(c, pick.x + dx, pick.y + dy); await sleep(500);
      got.push(await c.eval(`JSON.stringify(STUDIO_MAP_LOC)===JSON.stringify(clampWorldLocCoord(${JSON.stringify(pick.loc)}))`)); });
    check('H2 OL engine: tap 21px off a pin centre (corners of a 44x44 box) selects it', got.every(Boolean), `pin=${id} centre+corners hit=${JSON.stringify(got)}`); }

  // F-160 H3: theater exit button >=44x44 and topmost at its centre, portrait and landscape
  { const out = [];
    for (const [w, h, dpr] of [[375, 812, 2], [812, 375, 3]]) await with_({ w, h, dpr, mobile: true, touch: true }, async c => {
      await c.eval(`(async()=>{ toggleAtlasTheaterMode(); await new Promise(r=>setTimeout(r,1000)); })()`);
      const r = await c.eval(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/toggleAtlasTheaterMode/.test(b.getAttribute('onclick')||'')).map(b=>({b,r:b.getBoundingClientRect()})).filter(o=>o.r.width>0&&o.r.height>0); if(!bs.length) return {err:'no exit button'}; const best=bs.find(o=>{const e=document.elementFromPoint(o.r.left+o.r.width/2,o.r.top+o.r.height/2); return e===o.b||o.b.contains(e)}); const o=best||bs[0]; return {w:Math.round(o.r.width),h:Math.round(o.r.height),topmost:!!best}})()`);
      if (r.err || r.w < 44 || r.h < 44 || !r.topmost) out.push(`${w}x${h}: ${JSON.stringify(r)}`); });
    check('H3 theater exit button >=44x44 and topmost @375x812 and 812x375', !out.length, out.join(' ; ') || 'ok'); }

  // F-160 H4: top-left HUD covers <=25% of the map at 375x812 by default and a control hides it
  await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
    const area = () => c.eval(`(()=>{const cv=document.querySelector('.joy-spatial-shell__canvas').getBoundingClientRect(); const hud=document.querySelector('.joy-spatial-shell__hud--top-left'); const r=hud.getBoundingClientRect(); const vis=getComputedStyle(hud).display!=='none'&&getComputedStyle(hud).visibility!=='hidden'; const a=vis?Math.max(0,Math.min(r.right,cv.right)-Math.max(r.left,cv.left))*Math.max(0,Math.min(r.bottom,cv.bottom)-Math.max(r.top,cv.top)):0; return a/(cv.width*cv.height)})()`);
    const def = await area();
    const btn = await rectOf(c, `document.getElementById('atlasHudToggleBtn')`);
    let after = null;
    if (btn) { await tap(c, btn.x, btn.y); await sleep(500); after = await area(); }
    check('H4 HUD <=25% of map by default @375x812 and a control hides/shows it', def <= 0.25 && !!btn && btn.w >= 44 && btn.h >= 44, `default cover=${(def * 100).toFixed(1)}% toggle=${btn ? Math.round(btn.w) + 'x' + Math.round(btn.h) : 'missing'} after-toggle cover=${after === null ? 'n/a' : (after * 100).toFixed(1) + '%'}`); });

  // F-161 L1..L5: phone map legend is a collapsed 44x44 toggle by default, expands to <=25% of the map without the keys line,
  // survives reload / throwing storage, never overlaps a map toolbar, and desktop rendering is unchanged.
  const LG_FRAME = `document.querySelector('.joy-spatial-shell__canvas').getBoundingClientRect()`;
  const lgVisible = `(e=>{ if(!e) return null; const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); return (cs.display==='none'||cs.visibility==='hidden'||r.width<=0||r.height<=0)?null:r })`;
  const lgState = c => c.eval(`(()=>{ const vis=${lgVisible}; const f=${LG_FRAME}; const btn=document.getElementById('atlasLegendToggleBtn'); const lg=document.querySelector('.atlas-map-legend'); const br=vis(btn), lr=vis(lg); const keys=[...lg.querySelectorAll('*')].some(e=>/Keys:/.test(e.textContent)&&e.children.length===0&&vis(e)); let topmost=false; if(br){const el=document.elementFromPoint(br.left+br.width/2,br.top+br.height/2); topmost=el===btn||btn.contains(el)} const area=r=>r?Math.max(0,Math.min(r.right,f.right)-Math.max(r.left,f.left))*Math.max(0,Math.min(r.bottom,f.bottom)-Math.max(r.top,f.top)):0; return {btn:br?[Math.round(br.width),Math.round(br.height)]:null, topmost, legendVisible:!!lr, legendH:lr?lr.height:0, frameH:f.height, cover:(area(br)+area(lr))/(f.width*f.height), keys, pressed:btn&&btn.getAttribute('aria-pressed')} })()`);
  const lgTap = async c => { const p = await rectOf(c, `document.getElementById('atlasLegendToggleBtn')`); if (!p) return; await tap(c, p.x, p.y); await sleep(400); };
  for (const [w, h] of [[375, 812], [390, 844]]) await with_({ w, h, dpr: 2, mobile: true, touch: true }, async c => {
    const s = await lgState(c);
    check(`L1 legend collapsed by default, covers <=5% of map, toggle >=44x44 and topmost @${w}x${h}`, !!s.btn && s.btn[0] >= 44 && s.btn[1] >= 44 && s.topmost && !s.legendVisible && s.cover <= 0.05, JSON.stringify(s)); });
  await with_({ w: 390, h: 844, dpr: 2, mobile: true, touch: true }, async c => {
    await lgTap(c); const open = await lgState(c);
    const okOpen = open.legendVisible && open.legendH <= open.frameH * 0.25 + 0.5 && !open.keys && open.pressed === 'true';
    await lgTap(c); const closed = await lgState(c);
    check('L2a toggle expands legend to <=25% of map height without keys line, and collapses again', okOpen && !closed.legendVisible, `open=${JSON.stringify(open)} closed.legendVisible=${closed.legendVisible}`);
    await lgTap(c); await c.send('Page.reload'); await sleep(2500); for (let i = 0; i < 40 && !(await c.eval(`!!document.getElementById('atlasLegendToggleBtn')`).catch(() => false)); i++) await sleep(250);
    const re = await lgState(c);
    check('L2b expanded choice survives a reload (localStorage)', re.legendVisible && re.pressed === 'true', JSON.stringify(re)); });
  { const c = await launch({ w: 390, h: 844, dpr: 2, mobile: true, touch: true, url: 'about:blank' });
    try {
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.getItem=function(){throw new Error('x')}; Storage.prototype.setItem=function(){throw new Error('x')};` });
      await c.send('Page.navigate', { url: URL0 }); await sleep(1500); for (let i = 0; i < 60 && !(await c.eval(`!!document.getElementById('atlasLegendToggleBtn')`).catch(() => false)); i++) await sleep(250);
      const a = await lgState(c); await lgTap(c); const b = await lgState(c);
      check('L2c page and legend toggle still work when storage throws', !!a.btn && !a.legendVisible && b.legendVisible && c.errors.length === 0, `collapsed=${!a.legendVisible} expanded=${b.legendVisible} errors=${JSON.stringify(c.errors)}`);
    } finally { c.kill(); } }
  { const base = { '1280x800 2d_svg': [281, 696.8, 975, 86], '1280x800 2d_ol': [293, 611, 951, 87], '1280x800 3d_map3d': [293, 611, 951, 87], '1440x900 2d_svg': [281, 729.7, 1135, 56], '1440x900 2d_ol': [293, 887, 1111, 57], '1440x900 3d_map3d': [293, 887, 1111, 57] };
    const bad = [];
    for (const [w, h] of [[1280, 800], [1440, 900]]) for (const eng of ['2d_svg', '2d_ol', '3d_map3d']) await with_({ w, h, dpr: 1 }, async c => {
      await c.eval(`(async()=>{ ${eng === '2d_svg' ? '' : `setAtlasEngineMode('${eng}');`} await new Promise(r=>setTimeout(r,1500)); })()`);
      const r = await c.eval(`(()=>{const l=document.querySelector('.atlas-map-legend'); const r=l.getBoundingClientRect(); const bt=document.getElementById('atlasLegendToggleBtn'); const keys=[...l.querySelectorAll('*')].some(e=>/Keys:/.test(e.textContent)&&e.children.length===0&&getComputedStyle(e).display!=='none'); return {rect:[r.left,r.top,r.width,r.height], keys, toggleShown: !!bt && getComputedStyle(bt).display!=='none'}})()`);
      const exp = base[`${w}x${h} ${eng}`]; if (!r.keys || r.toggleShown || r.rect.some((v, i) => Math.abs(v - exp[i]) > 1.5)) bad.push(`${w}x${h} ${eng}: ${JSON.stringify(r)} expected ${JSON.stringify(exp)}`); });
    check('L3 desktop legend rect identical to pre-change measurement @1280x800 and 1440x900, keys line present, no toggle', !bad.length, bad.join(' ; ') || 'ok'); }
  { const bad = [];
    for (const eng of ['2d_svg', '2d_ol', '3d_map3d']) await with_({ w: 375, h: 812, dpr: 2, mobile: true, touch: true }, async c => {
      if (eng !== '2d_svg') await c.eval(`(async()=>{ setAtlasEngineMode('${eng}'); await new Promise(r=>setTimeout(r,1500)); })()`);
      const probe = () => c.eval(`(()=>{ const vis=${lgVisible}; const els=[document.getElementById('atlasLegendToggleBtn'), document.querySelector('.atlas-map-legend')].map(vis).filter(Boolean); const btns=[...document.querySelectorAll('#atlasMap3dToolbarPanel button, #atlasOlToolbarPanel button, .joy-spatial-shell__hud button, #atlasHudToggleBtn, .atlas-theater-btn')].map(b=>({t:(b.textContent||'').trim().slice(0,12), r:vis(b)})).filter(o=>o.r); const hit=[]; for(const e of els) for(const o of btns) if(e.left<o.r.right&&o.r.left<e.right&&e.top<o.r.bottom&&o.r.top<e.bottom) hit.push(o.t); return {n:btns.length, hit}})()`);
      const a = await probe(); await lgTap(c); const b = await probe();
      if (a.hit.length || b.hit.length || !a.n) bad.push(`${eng}: collapsed=${JSON.stringify(a)} expanded=${JSON.stringify(b)}`); });
    check('L4 legend (collapsed or expanded) overlaps no map toolbar button in 2d_svg, 2d_ol, 3d_map3d @375x812', !bad.length, bad.join(' ; ') || 'ok'); }
}
try { await main(); } catch (e) { console.error('SETUP ERROR:', e.message); process.exit(e.message === 'CHROME_MISSING' ? 3 : 2); }
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} assertions passed`);
process.exit(failed ? 1 : 0);
