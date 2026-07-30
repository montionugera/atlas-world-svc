/**
 * F-018 Phase 5 / Task 5.2 — the boss test: one boss, n players, even spread.
 *
 * The boss branch of the ladder solver divides a boss's danger by the party size:
 *
 *     rankDanger = 100 * aspd / (swings * (shape === 'boss' ? n : 1))
 *
 * i.e. `swings` still means "swings to kill ONE player", but the boss's damage is
 * assumed to be SHARED across the party, so one player's share is 1/n of it
 * (index.html rankDanger(), spec §8). R = R_solo * n² leans on the same reading.
 *
 * If a boss instead parked on one player, that player would die in `swings` swings
 * while the model priced the fight as though the pain were spread n ways — S/SS/SSS
 * would be lethal at 1/8, 1/20 and 1/50 of their designed pressure per victim.
 *
 * There is no threat/aggro system (spec §12 lists aggro as unbuilt), so the only
 * mechanism that can rotate a single attacker's target is emergent:
 * nearest-opposite-team plus knockback pushing the current victim out of reach.
 * This test measures whether that is enough.
 *
 * ── RESULT: IT IS NOT. THE BOSS FOCUS-FIRES. ─────────────────────────────────
 *
 * Measured over 60 s with four players all starting inside the boss's reach:
 * **21 of 24 swings land on ONE player, 87.5% of the damage**; the other three take
 * one swing each, in the first moments before the AI settles. The victim's identity
 * changes with the geometry (ring 5 / 6 / 6.8 pick p2, p2, p3) but the concentration
 * does not — it is 21/24 in every configuration tried, so this is structural rather
 * than a seed artefact.
 *
 * The mechanism is self-reinforcing: nearest-opposite-team picks a victim, knockback
 * pushes that victim away, and the boss then CHASES the victim it just hit — which
 * keeps that victim nearest. Nothing in the loop ever hands the target to anyone else.
 *
 * What it costs the model: the boss branch prices a rank as though its damage were
 * split n ways, so at S (n=8), SS (n=20) and SSS (n=50) the real victim absorbs 8x,
 * 20x and 50x the intended pressure and dies in `swings` swings — 7, 6 and 5
 * respectively — while the party's other members are untouched. No arithmetic in the
 * lab can fix this; it needs the aggro/threat system the foundation spec describes,
 * or bosses need multi-target attacks. That is a design decision and is not taken
 * here.
 *
 * The even-spread assertion is therefore marked `it.failing`: Jest inverts it, so it
 * passes while the boss focus-fires and turns RED the moment target rotation starts
 * working. The bound is untouched — still the spec's (1+eps)/n. Alongside it, a plain
 * `it` PINS the concentration that was measured, so the finding is machine-checked
 * and a harness that stopped producing damage could not be mistaken for it.
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

/** Same bound and the same reasoning as the pack test: 37.5% for a party of four. */
const EPS = 0.5

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
        `(bound ${(((1 + EPS) / PARTY) * 100).toFixed(1)}%) — ${ledger.report()}`
    )
    console.log(
      `[F-018 boss] swings per victim: ${[...perTarget.entries()].map(([t, n]) => `${t}x${n}`).join(' ')}`
    )
    return { ledger, perTarget }
  }

  it('PINNED FINDING: the boss parks on one victim instead of rotating', async () => {
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

    // The finding itself, pinned: one victim takes the overwhelming majority of both
    // the swings and the damage. Both halves are asserted because a swing count alone
    // would not show how lopsided the damage is.
    const swingsOnWorst = perTarget.get(ledger.worstShare().id) ?? 0
    expect(swingsOnWorst / swings.length).toBeGreaterThan(0.8)
    expect(ledger.worstShare().share).toBeGreaterThan(0.8)
    // …and the other three are left effectively untouched, one opening swing each.
    const others = [...perTarget.entries()].filter(([id]) => id !== ledger.worstShare().id)
    expect(others).toHaveLength(PARTY - 1)
    for (const [, n] of others) expect(n).toBeLessThanOrEqual(2)
  })

  // Jest inverts this: it passes while the boss focus-fires, and goes RED once target
  // rotation works. The bound is the spec's, unmodified — see the header.
  it.failing(
    `PINNED DIVERGENCE — the boss does NOT spread its damage within (1+${EPS})/${PARTY}`,
    async () => {
      const { ledger } = await fight()
      expect(ledger.worstShare().share).toBeLessThanOrEqual((1 + EPS) / PARTY)
    }
  )
})
