/**
 * F-018 Phase 5 / Task 5.2, re-gated by F-023.
 *
 * ── HISTORY ──────────────────────────────────────────────────────────────────
 * This file originally measured whether nearest-opposite-team targeting plus
 * knockback was enough to make a boss rotate targets. It was not: 21 of 24 swings
 * landed on ONE player (87.5% of damage), in every geometry tried. The finding was
 * pinned, and an even-spread assertion was parked as `it.failing` so it would turn
 * red the moment target rotation started working.
 *
 * ── WHY THAT ASSERTION IS GONE ───────────────────────────────────────────────
 * F-023 replaced distance-based selection with a THREAT TABLE. A threat system
 * does not spread a boss's damage — it CONCENTRATES it, deliberately, on whoever
 * holds aggro. That is what threat is for. So the even-spread bound was never the
 * right acceptance signal for this design: passing it would have meant the threat
 * system was NOT working.
 *
 * Two further reasons it could not have worked as written:
 *   - Players in this test never attack (`input.attack = false`, so wind-up does
 *     not deflect incoming melee). Damage-threat is therefore identically zero for
 *     all four, the table stays empty, and selection falls back to distance —
 *     leaving the measurement unchanged. Gates that need threat seed it explicitly.
 *   - The model's `÷n` even-spread branch is the NO-HEALER reading
 *     (tools/combat-lab/CHECKLIST.md:291-295). Under the trinity roles this game
 *     targets, CHECKLIST.md:129's sustain equation governs instead.
 *
 * The even-spread assertion is therefore DELETED rather than inverted, and replaced
 * by the mechanism gates below. See
 * docs/superpowers/specs/2026-07-31-boss-threat-aggro-design.md.
 *
 * ── WHAT IS STILL UNVERIFIED ─────────────────────────────────────────────────
 * Healer, mana and healing do not exist yet, so the boss branch of the balance
 * model remains unverified against the simulation. These gates prove the MECHANISM
 * is correct. They do NOT prove the NUMBERS are. Do not read a green run here as a
 * validated boss ladder.
 */
import {
  addPlayerAt,
  buildTestRoom,
  DamageLedger,
  landEverySwing,
  makeUnkillable,
  seedRandom,
  spawnRealMob,
  Swing,
  TestEnv,
  tickRoom,
  TICK_MS,
} from './f018-harness'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { THREAT_CONFIG } from '../config/combat/threat'

const ROOM_ID = 'f018-boss'
const PARTY = 4
/** 60 s of simulated time at the real 50 ms tick. */
const TICKS = 1200
/**
 * Melee reach for the spawned mob is attackRange + its radius + player radius
 * (1.5 + 4 + 1.3 = 6.8), so a ring at 6 puts every player inside reach at t=0 and
 * leaves target choice entirely to the AI rather than to who happens to be close.
 */
const RING = 6

describe('F-018 boss: how one boss distributes its damage across the party', () => {
  let env: TestEnv
  let players: Player[]
  let boss: Mob
  let swings: Swing[]
  let restoreRandom: () => void

  beforeEach(() => {
    jest.useFakeTimers()
    restoreRandom = seedRandom()
    env = buildTestRoom(ROOM_ID)
    players = []

    const cx = env.state.width / 2
    const cy = env.state.height / 2

    // A stock spawned mob stands in for the boss. Its magnitudes are irrelevant to a
    // SPREAD measurement — what makes it a boss for this test is the shape of the
    // encounter: one attacker facing n targets, which is exactly what the ladder's
    // boss branch divides by n.
    boss = spawnRealMob(env, cx, cy)
    makeUnkillable(boss)

    for (let i = 0; i < PARTY; i++) {
      const angle = (i / PARTY) * Math.PI * 2
      const player = addPlayerAt(
        env,
        `p${i}`,
        cx + Math.cos(angle) * RING,
        cy + Math.sin(angle) * RING
      )
      makeUnkillable(player)
      // Players never swing: a player in wind-up deflects incoming melee, which
      // would silence the damage being measured.
      player.input.attack = false
      players.push(player)
    }

    swings = landEverySwing(env, boss)
  })

  afterEach(() => {
    env.dispose()
    restoreRandom()
    jest.useRealTimers()
  })

  async function fight(): Promise<{ ledger: DamageLedger; perTarget: Map<string, number> }> {
    const ledger = new DamageLedger(players)
    for (let t = 0; t < TICKS; t++) {
      await tickRoom(env, TICK_MS)
      ledger.sample()
    }
    const perTarget = new Map<string, number>()
    for (const s of swings) perTarget.set(s.targetId, (perTarget.get(s.targetId) ?? 0) + 1)

    console.log(
      `[F-018 boss] ${swings.length} swings over ${((TICKS * TICK_MS) / 1000).toFixed(0)}s — ` +
        `worst share ${(ledger.worstShare().share * 100).toFixed(1)}% on ${ledger.worstShare().id} ` +
        `— ${ledger.report()}`
    )
    console.log(
      `[F-018 boss] swings per victim: ${[...perTarget.entries()].map(([t, n]) => `${t}x${n}`).join(' ')}`
    )
    return { ledger, perTarget }
  }

  /**
   * The id F-023's selection layer currently picks for the boss.
   *
   * Read from the AI environment rather than from `boss.currentAttackTarget`,
   * because that schema field is only populated while AttackBehavior is the active
   * behaviour — it is `''` on every tick the boss spends chasing. Selection is what
   * these gates are about, so they assert on selection.
   */
  function selectedTargetId(): string | undefined {
    return env.state.worldInterface.buildAgentEnvironment(boss, 50).preferredTarget?.id
  }

  // Concentration is now INTENTIONAL: threat picks a victim and hysteresis keeps it
  // there. This test is retained to prove the boss still commits to a target rather
  // than dithering — the failure mode a badly-tuned switchMargin would produce.
  it('the boss commits to one victim rather than dithering', async () => {
    const { ledger, perTarget } = await fight()

    // Not vacuous: the boss really swung, damage really landed, and every player was
    // reachable — each one takes at least the opening swing, so nobody is missing from
    // the measurement for want of being in range.
    expect(swings.length).toBeGreaterThan(0)
    expect(ledger.total).toBeGreaterThan(0)
    expect(perTarget.size).toBe(PARTY)
    for (const p of players) {
      expect(ledger.taken.get(p.id) ?? 0).toBeGreaterThan(0)
    }

    const swingsOnWorst = perTarget.get(ledger.worstShare().id) ?? 0
    expect(swingsOnWorst / swings.length).toBeGreaterThan(0.8)
    expect(ledger.worstShare().share).toBeGreaterThan(0.8)
    const others = [...perTarget.entries()].filter(([id]) => id !== ledger.worstShare().id)
    expect(others).toHaveLength(PARTY - 1)
    for (const [, n] of others) expect(n).toBeLessThanOrEqual(2)
  })

  it('GATE 1: threat decides — the threatening player is targeted over the nearer one', async () => {
    // Nothing else can generate threat here (players never attack), so this seeded
    // entry is the only one in the table — and it must beat pure proximity.
    const threatening = players[2]
    env.state.threatRegistry
      .forAgent({ agentId: boss.id })
      .add({ entityId: threatening.id, amount: 1e6, now: performance.now() })

    const { ledger } = await fight()
    expect(ledger.worstShare().id).toBe(threatening.id)
  })

  it('GATE 2: taunt transfers the target and holds it', async () => {
    const tank = players[1]
    const dps = players[3]
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    table.add({ entityId: dps.id, amount: 10_000, now: performance.now() })

    env.battleManager.applyTaunt({ tauntingEntityId: tank.id, targetAgentId: boss.id })

    for (let t = 0; t < 5; t++) await tickRoom(env, TICK_MS)

    expect(table.tauntedTarget({ now: performance.now() })).toBe(tank.id)
    expect(selectedTargetId()).toBe(tank.id)
  })

  it('GATE 3: the lock pins the target even against higher threat, then releases it', async () => {
    const tank = players[1]
    const dps = players[3]
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    table.add({ entityId: dps.id, amount: 1000, now: performance.now() })

    env.battleManager.applyTaunt({ tauntingEntityId: tank.id, targetAgentId: boss.id })
    for (let t = 0; t < 5; t++) await tickRoom(env, TICK_MS)
    expect(selectedTargetId()).toBe(tank.id)

    // Overwhelm the tank's threat WHILE the lock is still up. Selection must ignore
    // it -- this is what distinguishes the lock from mere threat ordering. (Without
    // the lock, taunt would only ever be a 1.5x nudge and a DPS spike would peel the
    // boss straight off the tank.)
    table.add({ entityId: dps.id, amount: 1e9, now: performance.now() })
    await tickRoom(env, TICK_MS)
    expect(table.isTauntLocked({ now: performance.now() })).toBe(true)
    expect(selectedTargetId()).toBe(tank.id)

    // Once the lock lapses, raw threat governs again and the dps takes it.
    const ticksPastLock = Math.ceil(THREAT_CONFIG.tauntLockMs / TICK_MS) + 20
    for (let t = 0; t < ticksPastLock; t++) await tickRoom(env, TICK_MS)

    expect(table.tauntedTarget({ now: performance.now() })).toBeNull()
    expect(selectedTargetId()).toBe(dps.id)
  })

  it('GATE 4: a zero-threat party still falls back to nearest', async () => {
    // No threat is seeded at all. This pins pre-F-023 behaviour: the boss must
    // still pick SOMEBODY and still land damage, exactly as it did before.
    expect(env.state.threatRegistry.peek({ agentId: boss.id })).toBeNull()

    const { ledger, perTarget } = await fight()
    expect(swings.length).toBeGreaterThan(0)
    expect(ledger.total).toBeGreaterThan(0)
    expect(perTarget.size).toBe(PARTY)
  })

  it('GATE 5: threat inside switchMargin does not flip the target tick-to-tick', async () => {
    const now = performance.now()
    const table = env.state.threatRegistry.forAgent({ agentId: boss.id })
    table.add({ entityId: players[0].id, amount: 1000, now })
    // Deliberately just inside the margin — must NOT steal the target back and forth.
    table.add({
      entityId: players[1].id,
      amount: 1000 * THREAT_CONFIG.switchMargin - 1,
      now,
    })

    for (let t = 0; t < 5; t++) await tickRoom(env, TICK_MS)
    const settled = selectedTargetId()
    expect(settled).toBeDefined()

    const seen = new Set<string>()
    for (let t = 0; t < 40; t++) {
      await tickRoom(env, TICK_MS)
      seen.add(selectedTargetId() ?? '')
    }

    expect(seen.size).toBe(1)
    expect(seen.has(settled!)).toBe(true)
  })
})
