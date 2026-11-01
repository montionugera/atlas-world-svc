// Real-click check for the "Upright monster" toggle in the atlas spawn matrix.
// Real mouse and keyboard only: no app function is ever called from the page.
// Run: node scripts/tests/e2e/atlas-upright-toggle.e2e.mjs   (needs client/react-client/node_modules)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

// ---- expected numbers, read from the atlas JSON in this same run
const atlas = JSON.parse(readFileSync(path.join(ROOT, 'content/studio/t_shaped_world_atlas.json'), 'utf8'));
const tierCount = { Normal: 0, 'Mini-boss': 0, Raid: 0, MVP: 0 };
let tagged = 0; let total = 0; let band21to40 = 0;
for (const d of atlas.multi_floor_dungeons) for (const f of d.floors) for (const s of f.spawns || []) {
  total += 1;
  if (s.body_plan !== 'upright_monster') continue;
  tagged += 1;
  if (s.level >= 21 && s.level <= 40) band21to40 += 1;
  const t = s.entity_type === 'RaidBoss' ? 'Raid' : s.entity_type;
  tierCount[{ Monster: 'Normal', 'Mini-Boss': 'Mini-boss' }[t] || t] += 1;
}
const split = (c) => `Normal ${c.Normal} · Mini-boss ${c['Mini-boss']} · Raid ${c.Raid} · MVP ${c.MVP}`;
const fullLine = `Showing ${tagged} of ${total} dungeon rows · ${split(tierCount)}`;
const monsterLine = `Showing ${tierCount.Normal} of ${total} dungeon rows · Normal ${tierCount.Normal} · Mini-boss 0 · Raid 0 · MVP 0`;

// ---- own server on a free port, never 8788
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('python3', ['scripts/catalog_explorer_web.py', '--port', String(port)], { cwd: ROOT, stdio: 'ignore' });
const BASE = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i += 1) {
  try { if ((await fetch(`${BASE}/`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

const URL0 = `${BASE}/?tab=studio`;
const MATRIX = '#studioAtlasFilteredEntityMatrix';
const TOGGLE = '#atlasShapeToggle';
const browser = await chromium.launch();

async function openPage({ mutate } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  if (mutate) {
    await page.route('**/api/bundle', async (route) => {
      const resp = await route.fetch();
      const json = await resp.json();
      mutate(json);
      await route.fulfill({ response: resp, json });
    });
  }
  return { ctx, page };
}
const liveText = (page) => page.locator('#atlasShapeLive').textContent().then((s) => s.trim());
const waitLive = (page, want) => page.waitForFunction(
  (t) => document.getElementById('atlasShapeLive').textContent.trim() === t, want, { timeout: 3000 },
).catch(() => {});
const focusedId = (page) => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
const strip = (node, keys) => {
  if (Array.isArray(node)) node.forEach((n) => strip(n, keys));
  else if (node && typeof node === 'object') for (const k of Object.keys(node)) { if (keys.includes(k)) delete node[k]; else strip(node[k], keys); }
};

try {
  // ---------- main flow, real mouse
  const { ctx, page } = await openPage();
  await page.goto(URL0);
  const toggle = page.locator(TOGGLE);
  await toggle.waitFor({ timeout: 15000 });
  check('toggle label shows tagged count', (await toggle.innerText()).trim() === `Upright monster (${tagged})`, await toggle.innerText());
  check('toggle starts off', (await toggle.getAttribute('aria-pressed')) === 'false');
  await toggle.click();
  check('aria-pressed true after click', (await toggle.getAttribute('aria-pressed')) === 'true');
  check('URL has shape=upright', page.url().includes('shape=upright'), page.url());
  const status = page.locator('#atlasShapeCount');
  check('status line equals computed count and split', (await status.innerText()).trim() === fullLine, await status.innerText());
  await waitLive(page, fullLine);
  check('live region carries same text', (await liveText(page)) === fullLine, await liveText(page));
  check(`DOM holds ${tagged} row cards`, (await page.locator(`${MATRIX} .atlas-row-card`).count()) === tagged, String(await page.locator(`${MATRIX} .atlas-row-card`).count()));
  check('Queen Ant Ash-Brood Sovereign absent', (await page.locator(MATRIX).innerText()).indexOf('Queen Ant Ash-Brood Sovereign') === -1);
  check('Upright badge on cards', (await page.locator(`${MATRIX} .atlas-row-card`, { hasText: 'Upright · ' }).count()) === tagged);
  check('badge uses plain words', !(await page.locator(MATRIX).innerText()).includes('_kin'));
  check('focus stays on toggle', (await focusedId(page)) === 'atlasShapeToggle');
  const headerCount = (await page.locator('#atlasMatrixTitleCount').innerText()).trim();
  check('header count equals status count', headerCount === String(tagged), headerCount);

  await page.reload();
  await page.locator(TOGGLE).waitFor({ timeout: 15000 });
  check('reload: still on', (await page.locator(TOGGLE).getAttribute('aria-pressed')) === 'true');
  check('reload: matrix open with rows', (await page.locator(`${MATRIX} .atlas-row-card`).count()) === tagged);

  // a link with no tab param still opens on Studio, so shape must apply there too
  await page.goto(`${BASE}/?shape=upright`);
  await page.locator(TOGGLE).waitFor({ timeout: 15000 });
  check('link without tab: toggle on', (await page.locator(TOGGLE).getAttribute('aria-pressed')) === 'true');
  await page.goto(`${URL0}&shape=upright`);
  await page.locator(TOGGLE).waitFor({ timeout: 15000 });

  // tier tab (entity_type Monster, displayed as Normal)
  await page.locator('.atlas-shape-target', { hasText: 'Monster' }).first().click();
  check('tier tab narrows rows', (await page.locator(`${MATRIX} .atlas-row-card`).count()) === tierCount.Normal, String(await page.locator(`${MATRIX} .atlas-row-card`).count()));
  check('status follows the tier tab', (await status.innerText()).trim() === monsterLine, await status.innerText());

  // level band combines with the toggle
  await page.locator('.atlas-shape-target', { hasText: 'All Entities' }).first().click();
  await page.locator('select[aria-label="Level Band"]').selectOption('21-40');
  check('level band narrows tagged rows', (await page.locator(`${MATRIX} .atlas-row-card`).count()) === band21to40, String(await page.locator(`${MATRIX} .atlas-row-card`).count()));
  await page.locator('select[aria-label="Level Band"]').selectOption('All');
  await page.locator('.atlas-shape-target', { hasText: 'Monster' }).first().click();

  // filter to nothing with a search, then Clear filters
  await page.locator('#atlasOmniSearchInput').click();
  await page.keyboard.type('zzzz-no-such-mob');
  await page.keyboard.press('Enter');
  const emptyCopy = 'No upright monsters match these filters';
  const emptyShown = await page.locator(MATRIX).getByText(emptyCopy).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('empty state copy', emptyShown);
  await waitLive(page, emptyCopy);
  check('empty state reaches the live region', (await liveText(page)) === emptyCopy, await liveText(page));
  await page.getByRole('button', { name: 'Clear filters' }).click();
  check('clear: all filters reset, rows back', (await page.locator(`${MATRIX} .atlas-row-card`).count()) === tagged);
  check('clear: tier and search reset, shape view kept', (await status.innerText()).trim() === fullLine && (await page.locator(TOGGLE).getAttribute('aria-pressed')) === 'true', await status.innerText());
  check('clear: focus on toggle', (await focusedId(page)) === 'atlasShapeToggle');

  // tab away and return through history keeps the toggle on
  await page.locator('.nav-item', { hasText: 'Lore and History' }).first().click();
  await page.goBack();
  await page.goForward();
  await page.locator('.nav-item', { hasText: 'Top-Down World Studio' }).first().click();
  await page.locator(TOGGLE).waitFor({ timeout: 15000 });
  check('history: toggle still on after leaving and returning', (await page.locator(TOGGLE).getAttribute('aria-pressed')) === 'true', page.url());

  // toggling off restores the capped list
  await page.locator(TOGGLE).click();
  check('off: aria-pressed false', (await page.locator(TOGGLE).getAttribute('aria-pressed')) === 'false');
  check('off: shape gone from URL', !page.url().includes('shape='), page.url());
  check('off: 18-row cap restored', (await page.locator(`${MATRIX} .atlas-row-card`).count()) === 18, String(await page.locator(`${MATRIX} .atlas-row-card`).count()));
  await ctx.close();

  // ---------- partial: no tags
  {
    const { ctx: c, page: p } = await openPage({ mutate: (j) => strip(j, ['body_plan', 'body_kin']) });
    await p.goto(URL0);
    await p.locator(TOGGLE).waitFor({ timeout: 15000 });
    check('partial: toggle disabled', await p.locator(TOGGLE).isDisabled());
    check('partial: copy on a default load', (await p.locator('#atlasShapeNotice').innerText()).trim() === 'No rows carry a shape tag yet.');
    await p.goto(`${URL0}&shape=upright`);
    await p.locator(TOGGLE).waitFor({ timeout: 15000 });
    check('partial: not pressed with shape in the URL', (await p.locator(TOGGLE).getAttribute('aria-pressed')) === 'false');
    await c.close();
  }
  // ---------- error: atlas dungeons missing
  {
    const { ctx: c, page: p } = await openPage({ mutate: (j) => strip(j, ['multi_floor_dungeons']) });
    await p.goto(URL0);
    await p.locator(TOGGLE).waitFor({ timeout: 15000 });
    check('error: toggle disabled', await p.locator(TOGGLE).isDisabled());
    check('error: copy on a default load', (await p.locator('#atlasShapeNotice').innerText()).trim() === 'Monster list unavailable. Reload the page.');
    await c.close();
  }

  // ---------- touch targets on a phone
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await c.newPage();
    await p.goto(`${URL0}&shape=upright`);
    await p.locator(TOGGLE).waitFor({ timeout: 15000 });
    const tall = async (loc) => ((await loc.boundingBox()) || { height: 0 }).height >= 44;
    check('touch: toggle at least 44px', await tall(p.locator(TOGGLE)));
    check('touch: tier tab at least 44px', await tall(p.locator('.atlas-shape-target', { hasText: 'Monster' }).first()));
    check('touch: locate at least 44px', await tall(p.locator('.atlas-locate-btn').first()));
    await p.goto(`${URL0}&shape=upright&filter=RaceSpawns`);
    const clear = p.getByRole('button', { name: 'Clear filters' });
    await clear.waitFor({ timeout: 15000 });
    check('touch: Clear filters at least 44px', await tall(clear));
    await c.close();
  }

  // ---------- keyboard only
  {
    const { ctx: c, page: p } = await openPage();
    await p.goto(URL0);
    await p.locator(TOGGLE).waitFor({ timeout: 15000 });
    let reached = false;
    for (let i = 0; i < 600 && !reached; i += 1) { await p.keyboard.press('Tab'); reached = (await focusedId(p)) === 'atlasShapeToggle'; }
    check('Tab reaches the toggle', reached);
    await p.keyboard.press('Space');
    check('Space presses it', (await p.locator(TOGGLE).getAttribute('aria-pressed')) === 'true');
    check('focus still on toggle', (await focusedId(p)) === 'atlasShapeToggle');
    let onLocate = false;
    for (let i = 0; i < 40 && !onLocate; i += 1) {
      await p.keyboard.press('Tab');
      onLocate = await p.evaluate(() => { const a = document.activeElement; return !!(a && a.classList.contains('atlas-locate-btn')); });
    }
    check('Tab reaches a row locate button', onLocate);
    const urlBefore = p.url();
    await p.keyboard.press('Enter');
    await p.waitForURL((u) => u.href !== urlBefore, { timeout: 5000 }).catch(() => {});
    const urlAfter = p.url();
    check('Enter opened the floor (URL changed)', urlAfter !== urlBefore, urlAfter);
    await p.goBack();
    await p.locator(TOGGLE).waitFor({ timeout: 15000 });
    check('Back returns, toggle still on', (await p.locator(TOGGLE).getAttribute('aria-pressed')) === 'true', p.url());
    check('Back: URL returned and floor closed', p.url() === urlBefore, p.url());
    await c.close();
  }
} catch (e) {
  console.log(`FAIL  uncaught: ${e.message.split('\n')[0]}`);
  failures += 1;
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
