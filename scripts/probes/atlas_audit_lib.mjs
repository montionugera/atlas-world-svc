// Raw-CDP headless Chrome helpers shared by the atlas phone/touch audit probe (F-156). No npm deps.
// CHROME_BIN overrides the Chrome path.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
process.setMaxListeners(100);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const chromeAvailable = () => existsSync(CHROME);
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
export class Cdp {
  constructor(ws) { this.ws = new WebSocket(ws); this.id = 0; this.pending = new Map(); this.ls = [];
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) {
        if (m.method === 'Runtime.executionContextsCleared' || m.method === 'Runtime.executionContextDestroyed') {
          for (const [k, p] of this.pending.entries()) {
            if (p.method === 'Runtime.evaluate') {
              this.pending.delete(k);
              p.rej(new Error('Execution context cleared during navigation'));
            }
          }
        }
        this.ls.forEach(f => f(m));
      }
    };
  }
  open() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}, timeoutMs = 60000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
      t.unref?.();
      this.pending.set(id, { method, res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
  }
  async eval(expr, timeoutMs = 60000) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeoutMs); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n' + expr.slice(0, 160)); return r.result.value; }
}

let _sharedBrowser = null;
async function ensureSharedBrowser() {
  if (_sharedBrowser) return _sharedBrowser;
  if (!existsSync(CHROME)) throw new Error('CHROME_MISSING');
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'atlas-aud-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND,MAP fonts.gstatic.com ~NOTFOUND',
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore', detached: true });
  chrome.unref();
  const cleanup = () => {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);
  let info = null;
  for (let i = 0; i < 100; i++) {
    try {
      info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await sleep(150);
    }
  }
  // Browser-level CDP connection: lets every launch() own an isolated browser context.
  if (!info) {
    info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  }
  const cdp = new Cdp(info.webSocketDebuggerUrl);
  await cdp.open();
  _sharedBrowser = { port, chrome, profile, cleanup, cdp };
  return _sharedBrowser;
}

// Each launch() gets its OWN browser context (separate cookies/localStorage/cache), so concurrent
// tabs of one Chrome cannot see each other's persisted app state; kill() disposes the context.
async function openIsolatedPage(browser) {
  const { browserContextId } = await browser.cdp.send('Target.createBrowserContext', {}, 5000);
  const { targetId } = await browser.cdp.send('Target.createTarget', { url: 'about:blank', browserContextId }, 5000);
  return { browserContextId, page: { id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:${browser.port}/devtools/page/${targetId}` } };
}
export function closeSharedBrowser() {
  const b = _sharedBrowser; _sharedBrowser = null;
  if (!b) return;
  try { b.cdp.ws.close(); } catch {}
  try { b.cleanup(); } catch {}
}
export async function launch({ w, h, dpr = 1, mobile = false, touch = false, url }) {
  let browser = await ensureSharedBrowser();
  let page, browserContextId;
  try {
    ({ page, browserContextId } = await openIsolatedPage(browser));
  } catch {
    closeSharedBrowser();
    browser = await ensureSharedBrowser();
    ({ page, browserContextId } = await openIsolatedPage(browser));
  }
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  cdp.errors = [];
  cdp.ls.push(m => { if (m.method === 'Runtime.exceptionThrown') cdp.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (touch) { await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  if (url && url !== 'about:blank') {
    await cdp.send('Page.navigate', { url });
    // condition wait (not a fixed sleep): the atlas svg and its zoom API exist
    await waitFor(cdp, `!!document.getElementById('dedicatedWorldAtlasSvg') && typeof zoomStudioMap==='function'`, 15000);
  }
  cdp.kill = async () => {
    try { cdp?.ws?.close(); } catch {}
    await browser.cdp.send('Target.disposeBrowserContext', { browserContextId }, 3000).catch(() => {});
  };
  cdp.shot = async (path) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.data, 'base64')); };
  return cdp;
}
// In-page condition poll (30 ms timer, bounded). Resolves true when `expr` is truthy, false on expiry; it never throws on
// a timeout, so the caller's assertion still reads the real state and FAILS if the condition was not reached.
export async function waitFor(c, expr, timeoutMs = 8000) {
  const body = `new Promise(res=>{const t0=performance.now(); const f=()=>{let v=false; try{v=!!(${expr})}catch(_e){} if(v) res(true); else if(performance.now()-t0>${timeoutMs}) res(false); else setTimeout(f,30)}; f()})`;
  for (let i = 0; i < 3; i++) {
    try { return await c.eval(body, timeoutMs + 5000); }
    catch (e) { if (!/Execution context cleared|Cannot find context/.test(e.message)) return false; await sleep(100); } // navigation in flight: retry
  }
  return false;
}
// Layout settled: the rects of `sel` (default: body) identical for 3 consecutive 40 ms samples (bounded 3 s).
export const settle = (c, sel = 'body') => waitFor(c, `(()=>{const s=JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel)})].map(e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]})); const w=(window.__aSet=window.__aSet||{s:'',n:0,t:0}); const now=performance.now(); if(now-w.t<35) return w.n>=3; w.t=now; if(w.s===s) w.n++; else {w.s=s; w.n=0} return w.n>=3})()`, 3000);
// Navigate/reload and wait for the NEW document: loadEventFired, then the atlas API is present (bounded, never throws).
export async function navigate(c, url, reload = false) {
  const loaded = new Promise(res => { const t = setTimeout(() => res(false), 20000); t.unref?.(); const f = m => { if (m.method === 'Page.loadEventFired') { clearTimeout(t); c.ls = c.ls.filter(x => x !== f); res(true); } }; c.ls.push(f); });
  await (reload ? c.send('Page.reload') : c.send('Page.navigate', { url }));
  await loaded;
  return waitFor(c, `!!document.getElementById('dedicatedWorldAtlasSvg') && typeof zoomStudioMap==='function'`, 15000);
}
export async function tap(c, x, y) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(c); // handlers ran and layout is stable; callers waitFor the state their assertion needs
}
export async function touchSeq(c, pts0, pts1, steps = 8, hold = 0) {
  // pts: arrays of {x,y}; interpolates each finger linearly
  const mk = (t) => pts0.map((p, i) => ({ x: p.x + (pts1[i].x - p.x) * t, y: p.y + (pts1[i].y - p.y) * t, id: i + 1 }));
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: mk(0) });
  for (let i = 1; i <= steps; i++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: mk(i / steps) });
  if (hold) await sleep(hold);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(c);
}
