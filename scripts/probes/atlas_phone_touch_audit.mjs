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
}
try { await main(); } catch (e) { console.error('SETUP ERROR:', e.message); process.exit(e.message === 'CHROME_MISSING' ? 3 : 2); }
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} assertions passed`);
process.exit(failed ? 1 : 0);
