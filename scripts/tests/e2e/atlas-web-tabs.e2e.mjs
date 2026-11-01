// Real-click check for all tabs in the atlas web release app and stale tab write refusal.
// Real mouse only: no app function is ever called from the page.
// Run: ATLAS_WEB_URL=http://atlas-world.joymify.local.com node scripts/tests/e2e/atlas-web-tabs.e2e.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const req = createRequire(path.join(ROOT, 'client/react-client/package.json'));
let pw;
for (const name of ['@playwright/test', 'playwright']) {
  try { pw = req(name); break; } catch { /* try next */ }
}
if (!pw) { console.error('Playwright not found. Run npm ci in client/react-client.'); process.exit(2); }
const { chromium } = pw;

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
}

const BASE = process.env.ATLAS_WEB_URL || 'http://atlas-world.joymify.local.com';

async function getFreePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

function spawnServer(port, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  return spawn('python3', ['scripts/catalog_explorer_web.py', '--port', String(port)], {
    cwd: ROOT,
    env,
    stdio: 'ignore',
  });
}

async function waitUp(base) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return true;
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${base} failed to start`);
}

const browser = await chromium.launch();

try {
  // ---------- Part 1: All tabs real-click pass against BASE ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const failedRequests = [];
  const writes = [];
  const errors = [];
  const placeholders = [];
  const placeholdersByTab = new Map();
  let currentTab = '';

  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
    if (r.headers()['x-thumb-missing']) {
      placeholders.push(r.url());
      const tab = currentTab || '(initial)';
      placeholdersByTab.set(tab, (placeholdersByTab.get(tab) || 0) + 1);
    }
  });
  page.on('request', (r) => {
    if (['POST', 'DELETE'].includes(r.method())) writes.push(r.url());
  });

  await page.goto(BASE);
  const navSel = '#sidebarNav button, #sidebarNav .nav-item';
  await page.waitForSelector(navSel);
  const count = await page.locator(navSel).count();

  for (let i = 0; i < count; i += 1) {
    let clicked = false;
    for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
      try {
        const item = page.locator(navSel).nth(i);
        const label = ((await item.locator('span').first().innerText().catch(() => ''))
          || (await item.innerText()).split('\n')[0]).trim();
        currentTab = label;
        await item.scrollIntoViewIfNeeded();
        await item.click();
        clicked = true;
      } catch (e) {
        if (attempt === 2) throw e;
        await page.waitForTimeout(150);
      }
    }
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  }

  // C3: Forge renders live in the checkout that made them; only this path may 404.
  // Briefs without a recorded run 404 on ledger fetch.
  const unexpected = failedRequests.filter((u) => {
    if (u.includes('/atelier/art-forge/out/')) return false;
    if (u.startsWith('404 ') && /\/atelier\/art-forge\/runs\/[^/]+\.json$/.test(u) && !u.includes('_index.json')) return false;
    return true;
  });
  check('every tab opened', count > 10, String(count));
  check('no uncaught exception', errors.length === 0, errors.join(' | '));
  check('no failed request', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
  check('no write request', writes.length === 0, writes.join(' | '));
  check('top bar shows the release', /^Read-only · \d+\.\d+ · [0-9a-f]{7}$/.test(await page.locator('#topbarStatus').innerText()));

  const distinctFiles = [...new Set(placeholders.map((u) => {
    try {
      return path.basename(new URL(u).pathname);
    } catch {
      return u.split('/').pop().split('?')[0];
    }
  }))];
  console.log(`placeholder thumbs: ${placeholders.length} requests, ${distinctFiles.length} distinct`);
  for (const [tab, c] of placeholdersByTab.entries()) {
    console.log(`  ${tab}: ${c}`);
  }
  console.log('first 15 distinct:');
  for (const file of distinctFiles.slice(0, 15)) {
    console.log(`  ${file}`);
  }

  await page.locator(navSel, { hasText: 'Map Builder' }).click();
  const excluded = page.locator('.empty-state', { hasText: 'Not in this release image.' });
  check('Map Builder shows the excluded message', await excluded.isVisible());
  check('Map Builder links to the edit site', (await excluded.locator('a').getAttribute('href')).includes('atlas-edit'));
  check('Map Builder offers no recheck', (await page.getByRole('button', { name: 'Check again' }).count()) === 0);

  await ctx.close();

  // ---------- Part 2: Stale tab on a free port ----------
  const stalePort = await getFreePort();
  let server = spawnServer(stalePort, { ATLAS_READ_ONLY: '' });
  const STALE_BASE = `http://127.0.0.1:${stalePort}`;
  try {
    await waitUp(STALE_BASE);
    const staleCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const stalePage = await staleCtx.newPage();

    const stalePosts = [];
    stalePage.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/review-queue/asset-verdicts')) {
        stalePosts.push(r.url());
      }
    });

    await stalePage.goto(`${STALE_BASE}/?tab=assets`);
    await stalePage.waitForSelector('.verdict-btn-reject', { timeout: 15000 });

    // Restart the server on the same port with ATLAS_READ_ONLY=1
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    server = spawnServer(stalePort, { ATLAS_READ_ONLY: '1' });
    await waitUp(STALE_BASE);

    // Real click on verdict control
    const rejectBtn = stalePage.locator('.verdict-btn-reject').first();
    await rejectBtn.scrollIntoViewIfNeeded();
    await rejectBtn.click();

    const noteInput = stalePage.locator('.verdict-note').first();
    await noteInput.waitFor({ timeout: 5000 });
    await noteInput.fill('e2e test reject');

    const saveBtn = stalePage.locator('.verdict-btn-save').first();
    await saveBtn.click();

    await stalePage.waitForFunction(
      () => document.getElementById('topbarStatus')?.textContent?.includes('Not saved:'),
      null,
      { timeout: 5000 },
    );

    const statusText = (await stalePage.locator('#topbarStatus').innerText()).trim();
    check(
      'stale tab shows not-saved line',
      statusText === 'Not saved: this is a read-only release page. Reload to see the current release.',
      statusText,
    );
    check('stale tab sent exactly one POST', stalePosts.length === 1, String(stalePosts.length));

    await stalePage.waitForTimeout(2000);
    check('stale tab sent no second POST after 2s', stalePosts.length === 1, String(stalePosts.length));

    fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
    await stalePage.screenshot({ path: path.join(ROOT, 'build/stale-tab-refusal.png') });

    await staleCtx.close();
  } finally {
    server.kill();
  }
} catch (e) {
  console.log(`FAIL  uncaught: ${e.message.split('\n')[0]}`);
  failures += 1;
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
