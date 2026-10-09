// E2E: real Chromium drives the React client against a LIVE server-rs and checks gameplay
// parity (plan 2026-10-09 server-rs live parity, Wave B): mob AI, names, combat, death /
// removal / respawn, body collision, projectiles and wire events.
//
// Prereqs: server-rs running and `npm start` (react-client) on :3000.
// Run:     node client/react-client/e2e/gameplay.e2e.mjs   (or `npm run e2e` for both files)
// Env:     E2E_URL (default http://localhost:3000)
//          E2E_SERVER=host:port  point the client at another server-rs (adds ?server=)
//          HEADED=1 to watch.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.E2E_URL ?? 'http://localhost:3000';
const SERVER_Q = process.env.E2E_SERVER ? `&server=${process.env.E2E_SERVER}` : '';
const player = `e2e-gp-${Date.now()}`;
const BODY_GAP = 12 + 14; // player + mob body radius (server-rs)
const bestiary = JSON.parse(readFileSync(new URL('../src/data/bestiaryNames.json', import.meta.url), 'utf8'));

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
  await page.goto(`${BASE}/?player=${player}${SERVER_Q}`);
  await page.waitForFunction(
    () => window.__gameState?.players?.get(window.__playerId) !== undefined && window.__gameState.mobs.size > 0,
    null,
    { timeout: 15000 },
  );
  await page.locator('canvas').first().click(); // focus the game like a user would

  const state = () =>
    page.evaluate(() => {
      const gs = window.__gameState;
      const me = gs.players.get(window.__playerId);
      return {
        me: me && { id: me.id, x: me.x, y: me.y, isAlive: me.isAlive, isBotMode: me.isBotMode },
        mobs: [...gs.mobs.values()].map((m) => ({
          id: m.id, x: m.x, y: m.y, isAlive: m.isAlive, hp: m.currentHealth, max: m.maxHealth, type: m.mobTypeId,
        })),
        bots: [...gs.players.values()].filter((p) => p.isBotMode).length,
        projectiles: [...(gs.projectiles?.values() ?? [])].map((p) => ({ id: p.id, owner: p.ownerId })),
      };
    });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const releaseAll = async () => {
    for (const k of ['w', 'a', 's', 'd']) await page.keyboard.up(k);
  };
  /** Pulse WASD toward a mob until within `stop` units. Returns the last state. */
  const steerTo = async (mobId, stop, timeoutMs, { attack = false, onSample } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let s = await state();
    while (Date.now() < deadline) {
      s = await state();
      onSample?.(s);
      const mob = s.mobs.find((m) => m.id === mobId);
      if (!mob || !s.me) break;
      const dx = mob.x - s.me.x;
      const dy = mob.y - s.me.y;
      if (Math.hypot(dx, dy) <= stop) {
        await releaseAll();
        if (!attack) break;
        await page.waitForTimeout(100);
        continue;
      }
      const keys = [];
      if (Math.abs(dx) > 8) keys.push(dx > 0 ? 'd' : 'a');
      if (Math.abs(dy) > 8) keys.push(dy > 0 ? 's' : 'w');
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(90);
      for (const k of keys) await page.keyboard.up(k);
    }
    await releaseAll();
    return s;
  };
  const nearestMob = (s, filter = () => true) =>
    s.mobs.filter((m) => m.isAlive && filter(m)).sort((a, b) => dist(a, s.me) - dist(b, s.me))[0];

  // 1. Mobs move on their own over 3s (wander / chase).
  const s0 = await state();
  await page.waitForTimeout(3000);
  const s1 = await state();
  const moved = s0.mobs.filter((m) => {
    const later = s1.mobs.find((n) => n.id === m.id);
    return later && dist(m, later) > 1;
  }).length;
  check('mobs move over 3s', moved >= s0.mobs.length / 2, `${moved}/${s0.mobs.length} moved`);

  // 2. Every mob carries a bestiary type → labelled by name, never "Unknown Mob".
  const unnamed = s1.mobs.filter((m) => !m.type || !bestiary[m.type]);
  check('no mob labelled "Unknown Mob" (all have a bestiary mob_type)', unnamed.length === 0,
    unnamed.length ? `untyped: ${unnamed.slice(0, 3).map((m) => m.id).join(',')}` : `${s1.mobs.length} typed`);

  // 3. Only server bots are flagged as bots; this human is not.
  check('local human is not tagged [BOT]', s1.me.isBotMode === false, `bots on wire: ${s1.bots}`);

  // 4. A mob near the player approaches: walk to ~120u of the nearest mob, stand still.
  let target = nearestMob(s1);
  let s = await steerTo(target.id, 120, 10000);
  const near0 = s.mobs.filter((m) => m.isAlive && dist(m, s.me) < 200);
  await page.waitForTimeout(1500);
  const s2 = await state();
  const approached = near0.filter((m) => {
    const later = s2.mobs.find((n) => n.id === m.id);
    return later && dist(later, s2.me) < dist(m, s.me) - 10;
  });
  check('a mob near the player approaches it', approached.length > 0,
    `${approached.length}/${near0.length} mobs within 200u closed in`);

  // 5. Hold Space next to a mob: its health drops, it dies, its id is removed, mobs respawn.
  //    Sample body distances the whole time (collision must keep bodies apart).
  let minGap = Infinity;
  const sampleGap = (st) => {
    if (!st.me?.isAlive) return;
    for (const m of st.mobs) {
      if (m.isAlive) minGap = Math.min(minGap, dist(m, st.me));
      if (m.id === target.id && m.hp < m.max) damaged = true;
    }
  };
  target = nearestMob(s2);
  const idsAtStart = new Set(s2.mobs.map((m) => m.id));
  let damaged = false;
  let removed = false;
  const fightDeadline = Date.now() + 40000;
  while (!removed && Date.now() < fightDeadline) {
    const currTargetId = target.id;
    await page.keyboard.down(' ');
    const st = await steerTo(currTargetId, 36, 1500, { attack: true, onSample: sampleGap });
    await page.keyboard.up(' ');
    const mob = st.mobs.find((m) => m.id === currTargetId);
    if (mob && mob.hp < mob.max) damaged = true;
    if (!mob) {
      const now = await state();
      removed = !now.mobs.some((m) => m.id === currTargetId);
      if (!removed) continue;
    }
    // Target died by someone else's hand before we hurt it: pick another.
    if (!removed && mob && !mob.isAlive && !damaged) target = nearestMob(st) ?? target;
  }
  const events = await page.evaluate(() => window.__gameEvents ?? []);
  const myId = Number(s2.me.id);
  damaged = damaged || events.some((e) => e.kind === 0 && e.sourceId === myId);
  check('holding Space next to a mob reduces its health', damaged);
  check('the killed mob id is removed from the client', removed, target.id);
  check(`bodies never overlap (player vs mob >= ${BODY_GAP - 1})`, minGap >= BODY_GAP - 1, `min ${minGap.toFixed(1)}`);
  check('hit + kill events from this player arrive on the wire',
    events.some((e) => e.kind === 0 && e.sourceId === myId) && events.some((e) => e.kind === 1 && e.sourceId === myId),
    `${events.length} events buffered`);
  const respawned = await page
    .waitForFunction(
      (seen) => [...window.__gameState.mobs.keys()].some((id) => !seen.includes(id)),
      [...idsAtStart],
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);
  check('mobs respawn after deaths (new mob ids appear)', respawned);

  // 6. Using a skill spawns visible projectiles owned by this player.
  // If player was killed in combat, wait for auto-respawn first.
  await page.waitForFunction(
    () => window.__gameState?.players?.get(window.__playerId)?.isAlive === true,
    null,
    { timeout: 10000 },
  );
  target = nearestMob(await state());
  await steerTo(target.id, 120, 8000);
  let sawProjectile = false;
  for (let i = 0; i < 4 && !sawProjectile; i++) {
    await page.keyboard.press('1');
    sawProjectile = await page
      .waitForFunction(
        () => (
          [...(window.__gameState.projectiles?.values() ?? [])].some((p) => p.ownerId === window.__playerId) ||
          (window.__seenProjectiles ?? []).some((p) => p.ownerId === window.__playerId)
        ),
        null,
        { timeout: 3500 },
      )
      .then(() => true)
      .catch(() => false);
  }
  check('skill key (1) shows this player\'s projectiles', sawProjectile);

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
