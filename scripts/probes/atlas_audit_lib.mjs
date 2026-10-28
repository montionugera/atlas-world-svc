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
  for (let i = 0; i < 50; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await sleep(150);
    }
  }
  _sharedBrowser = { port, chrome, profile, cleanup };
  return _sharedBrowser;
}

export async function launch({ w, h, dpr = 1, mobile = false, touch = false, url }) {
  let browser = await ensureSharedBrowser();
  let page;
  try {
    page = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(5000) })).json();
  } catch {
    try { browser.cleanup(); } catch {}
    _sharedBrowser = null;
    browser = await ensureSharedBrowser();
    page = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(5000) })).json();
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
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      const ok = await cdp.eval(`!!document.getElementById('dedicatedWorldAtlasSvg') && typeof zoomStudioMap==='function'`, 3000).catch(() => false);
      if (ok) break;
    }
  }
  await sleep(150);
  cdp.kill = async () => {
    try { await cdp.eval(`try{localStorage.clear()}catch(_e){}`, 1000); } catch {}
    try { cdp?.ws?.close(); } catch {}
    await fetch(`http://127.0.0.1:${browser.port}/json/close/${page.id}`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  };
  cdp.shot = async (path) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.data, 'base64')); };
  return cdp;
}
export async function tap(c, x, y) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(40);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
}
export async function touchSeq(c, pts0, pts1, steps = 8, hold = 0) {
  // pts: arrays of {x,y}; interpolates each finger linearly
  const mk = (t) => pts0.map((p, i) => ({ x: p.x + (pts1[i].x - p.x) * t, y: p.y + (pts1[i].y - p.y) * t, id: i + 1 }));
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: mk(0) });
  for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: mk(i / steps) }); await sleep(25); }
  if (hold) await sleep(hold);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
}
