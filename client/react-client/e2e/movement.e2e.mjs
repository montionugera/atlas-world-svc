// E2E: real Chromium drives the React client against a live server-rs.
// Proves keyboard input → WS ClientInput → server sim → snapshot → client state.
//
// Prereqs: server-rs on :2567 and `npm start` (react-client) on :3000.
// Run:     node client/react-client/e2e/movement.e2e.mjs
// Env:     E2E_URL (default http://localhost:3000), HEADED=1 to watch.
import { chromium } from 'playwright';

const BASE = process.env.E2E_URL ?? 'http://localhost:3000';
const player = `e2e-${Date.now()}`;
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ headless: !process.env.HEADED });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?player=${player}`);

  // Wait until our own avatar appears in replicated state.
  await page.waitForFunction(
    () => window.__gameState?.players?.get(window.__playerId) !== undefined,
    null,
    { timeout: 15000 },
  );
  const pos = () =>
    page.evaluate(() => {
      const p = window.__gameState.players.get(window.__playerId);
      return { x: p.x, y: p.y };
    });
  const settle = () => page.waitForTimeout(250);
  await page.locator('canvas').first().click(); // focus the game like a user would

  // 1. Hold D → +x
  let a = await pos();
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  await page.keyboard.up('d');
  await settle();
  let b = await pos();
  check('hold D moves right', b.x - a.x > 20, `dx=${(b.x - a.x).toFixed(1)}`);
  // Scale guard: a 0.4s hold must be visible on screen — neither sub-pixel nor
  // flying off-screen (server-rs units vs a 50-unit legacy camera made a tap move
  // 40% of the screen and movement looked frozen behind the follow-camera).
  const viewport = await page.evaluate(() => window.__gameState.viewportSize ?? 50);
  const frac = (b.x - a.x) / viewport;
  check('0.4s hold moves a visible 5–50% of the screen', frac > 0.05 && frac < 0.5, `${(frac * 100).toFixed(0)}% of ${viewport}u`);

  // 2. Release → stops
  a = await pos();
  await page.waitForTimeout(400);
  b = await pos();
  check('release stops movement', Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) < 1);

  // 3. Hold S → +y, W → -y, A → -x
  for (const [key, axis, sign] of [['s', 'y', 1], ['w', 'y', -1], ['a', 'x', -1]]) {
    a = await pos();
    await page.keyboard.down(key);
    await page.waitForTimeout(300);
    await page.keyboard.up(key);
    await settle();
    b = await pos();
    const d = (b[axis] - a[axis]) * sign;
    check(`hold ${key.toUpperCase()} moves ${sign > 0 ? '+' : '-'}${axis}`, d > 15, `d=${d.toFixed(1)}`);
  }

  // 4. Attacking (Space) while holding D must not cancel movement (regression).
  a = await pos();
  await page.keyboard.down('d');
  await page.waitForTimeout(100);
  await page.keyboard.down(' ');
  await page.waitForTimeout(300);
  await page.keyboard.up(' ');
  await page.keyboard.up('d');
  await settle();
  b = await pos();
  check('attack while moving keeps moving', b.x - a.x > 25, `dx=${(b.x - a.x).toFixed(1)}`);

  // 5. A single quick tap still moves (no 'stuck' or swallowed input).
  a = await pos();
  await page.keyboard.press('d', { delay: 80 });
  await settle();
  b = await pos();
  check('tap D moves', b.x - a.x > 3, `dx=${(b.x - a.x).toFixed(1)}`);

  // 6. Stuck modifiers (macOS Cmd+Ctrl+Shift+4 screenshot swallows keyups) must not block WASD.
  await page.evaluate(() => {
    for (const key of ['Meta', 'Control', 'Shift']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, ctrlKey: true, shiftKey: true }));
    }
  });
  await page.waitForTimeout(700); // let any dash/cooldown from the synthetic Shift settle
  a = await pos();
  await page.keyboard.down('s');
  await page.waitForTimeout(300);
  await page.keyboard.up('s');
  await settle();
  b = await pos();
  check('WASD works after swallowed modifier keyups', b.y - a.y > 15, `dy=${(b.y - a.y).toFixed(1)}`);
  const stuck = await page.locator('text=Keys:').first().textContent().catch(() => '');
  check('stuck modifiers cleared from input debug', !/meta|control|shift/.test(stuck ?? ''), stuck ?? '');

  // 7. Map switch gives visible feedback.
  await page.getByLabel('Projectile').check();
  await page.waitForTimeout(300);
  const roomText = await page.locator('header').textContent();
  check('map switch updates room badge', roomText.includes('server-rs-map-for-test-projectile'), roomText);

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
