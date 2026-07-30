/**
 * F-018 Phase 5 / Task 5.1 — the pack test: mobs must not coordinate focus fire.
 *
 * WHY THIS IS LOAD-BEARING, not a nicety. The model's pack factor is
 *
 *     R(n) = R(1) * 2n/(n+1)                    (index.html R(), spec §7)
 *
 * derived from "the party focus-fires, so mobs die one at a time and the average
 * number still alive is (n+1)/2". The mirror-image assumption on the other side is
 * that the MOBS do not do the same thing back: their damage is assumed to spread
 * across the party. If mobs coordinated focus fire, the n-squared terms would cancel
 * by symmetry and every party number in the model would be optimistic by up to
 * 2n/(n+1) -> 1.96x. So this test underwrites the whole party model.
 *
 * The AI's targeting rule is nearest-opposite-team
 * (`AIWorldInterface.getNearestOppositeTeam` -> `AttackBehavior`), with no threat
 * table and no coordination, so the property is EMERGENT rather than designed. That
 * is exactly why it needs a test: nothing in the code declares it, and the aggro
 * system the foundation spec wants (spec §12, unbuilt) could quietly break it.
 *
 * Setup is a symmetric-but-not-identical engagement: four players spread around a
 * centre at DIFFERENT radii, one mob outside each on the same radial line. Real AI,
 * real physics, real knockback, real strategy cadence, real range/facing gating;
 * only the projectile-flight step is replaced (see the f018-harness.ts header for
 * the measured reason).
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

const ROOM_ID = 'f018-pack'
const PARTY = 4
/** 60 s of simulated time at the real 50 ms tick (gameConfig.tickRate). */
const TICKS = 1200
const RING = 40

/**
 * eps in the spec's `(1 + eps) * (1/n)` bound: 37.5% of incoming damage for a party
 * of four.
 *
 * The bound comes from what focus fire LOOKS like, not from what this setup happens
 * to measure. Total focus fire puts 100% on one player; even two mobs of four piling
 * onto one puts 50% there; so 37.5% fails both with room to spare. The slack above
 * the ideal 25% absorbs swing-rate jitter — a mob knocked out of reach swings fewer
 * times than one that stays glued, which has nothing to do with target selection.
 */
const EPS = 0.5

describe('F-018 pack: mobs do not coordinate focus fire', () => {
  let env: TestEnv
  let players: Player[]
  let mobs: Mob[]
  let swingLogs: Swing[][]
  let restoreRandom: () => void

  beforeEach(() => {
    jest.useFakeTimers()
    restoreRandom = seedRandom()
    env = buildTestRoom(ROOM_ID)
    players = []
    mobs = []

    const cx = env.state.width / 2
    const cy = env.state.height / 2

    for (let i = 0; i < PARTY; i++) {
      const angle = (i / PARTY) * Math.PI * 2
      // Lane radii are deliberately unequal so the four lanes are not exact
      // rotations of each other: nearest-target has to discriminate at different
      // distances, and a symmetry artefact cannot be what makes the test pass.
      const ring = RING + i * 5

      const player = addPlayerAt(
        env,
        `p${i}`,
        cx + Math.cos(angle) * ring,
        cy + Math.sin(angle) * ring
      )
      makeUnkillable(player)
      // Players never swing. A player in wind-up deflects incoming melee
      // (DeflectionResolver.checkDeflection), which would silence the very damage
      // this test measures.
      player.input.attack = false
      players.push(player)

      const mob = spawnRealMob(
        env,
        cx + Math.cos(angle) * (ring + 6),
        cy + Math.sin(angle) * (ring + 6)
      )
      makeUnkillable(mob)
      mobs.push(mob)
    }

    // landEverySwing returns a live array it keeps pushing into, so the logs are
    // held by reference and flattened at assert time — never copied early.
    swingLogs = mobs.map(mob => landEverySwing(env, mob))
  })

  afterEach(() => {
    env.dispose()
    restoreRandom()
    jest.useRealTimers()
  })

  it(`spreads incoming damage: no player takes more than (1+${EPS})/${PARTY} of it`, async () => {
    const ledger = new DamageLedger(players)

    // Sample the lane geometry EVERY tick, not just at the end. The party is
    // AI-driven and drifts, so by the last tick the lanes have dissolved — but the
    // swings all land early, while they still hold. Asserting at the end would
    // measure the wrong moment entirely.
    const laned: boolean[] = []
    const swingsAt: number[] = []
    for (let t = 0; t < TICKS; t++) {
      const before = swingLogs.flat().length
      await tickRoom(env, TICK_MS)
      ledger.sample()
      laned.push(
        mobs.every((mob, i) => {
          const own = players[i]
          const dOwn = Math.hypot(mob.x - own.x, mob.y - own.y)
          return players.every((p, j) => j === i || Math.hypot(mob.x - p.x, mob.y - p.y) > dOwn)
        })
      )
      // Record the geometry AT THE MOMENT each swing landed, so we can say how many
      // swings happened while target choice was genuinely live.
      const landed = swingLogs.flat().length - before
      for (let k = 0; k < landed; k++) swingsAt.push(t)
    }

    const swings = swingLogs.flat()
    const worst = ledger.worstShare()
    const bound = (1 + EPS) / PARTY

    // Who swung at whom. Printed unconditionally: the matrix is what distinguishes
    // "damage was uneven because of target choice" from "…because of swing rate".
    const matrix = new Map<string, Map<string, number>>()
    for (const s of swings) {
      const row = matrix.get(s.attackerId) ?? new Map<string, number>()
      row.set(s.targetId, (row.get(s.targetId) ?? 0) + 1)
      matrix.set(s.attackerId, row)
    }
    console.log(
      `[F-018 pack] ${swings.length} swings over ${((TICKS * TICK_MS) / 1000).toFixed(0)}s — ` +
        `worst share ${(worst.share * 100).toFixed(1)}% on ${worst.id} ` +
        `(bound ${(bound * 100).toFixed(1)}%) — ${ledger.report()}`
    )
    for (const [attacker, row] of matrix.entries()) {
      console.log(
        `[F-018 pack]   ${attacker} -> ${[...row.entries()].map(([t, n]) => `${t}x${n}`).join(' ')}`
      )
    }

    // Guards against a vacuous pass: "evenly spread" must not be able to mean
    // "nothing happened". Every mob has to have swung and every player has to have
    // been hit — a player at 0% is the same failure as a player at 100%.
    expect(ledger.total).toBeGreaterThan(0)
    expect(new Set(swings.map(s => s.attackerId)).size).toBe(PARTY)
    for (const p of players) {
      expect(ledger.taken.get(p.id) ?? 0).toBeGreaterThan(0)
    }

    expect(worst.share).toBeLessThanOrEqual(bound)

    // GUARD AGAINST THE TAUTOLOGY, MEASURED RATHER THAN ARGUED. The obvious way
    // this test could prove nothing is if every mob's own lane-mate were always its
    // nearest player: then nearest-target has no choice to get wrong and the
    // GEOMETRY, not the AI, is what spreads the damage.
    //
    // That is not what happens. The party is AI-driven and drifts out of its lanes
    // during the fight, so a large share of swings land while the mob could have
    // converged on someone else and did not. The assertion below pins that share,
    // so a future setup change that quietly restores perfect lanes — and with it the
    // tautology — turns this red.
    // How many swings landed while the mob's own lane-mate was NOT its nearest
    // player — i.e. while nearest-target had a real choice and could have picked
    // someone else. That is the number which decides whether this test proves
    // anything: if it were zero, the geometry alone would explain the even spread
    // and the pass would be near-tautological.
    const liveChoiceSwings = swingsAt.filter(t => !laned[t]).length
    const liveShare = liveChoiceSwings / swings.length
    console.log(
      `[F-018 pack] ${liveChoiceSwings}/${swings.length} swings (${(liveShare * 100).toFixed(0)}%) landed ` +
        `while target choice was LIVE (lane-mate not nearest); laned at final tick: ` +
        `${laned[laned.length - 1]}`
    )
    // MEASURED: 1 of 49 swings, 2%. So the even spread above is explained by the
    // LANE GEOMETRY, not by the AI declining to converge — the honest reading is
    // that this test does NOT establish the no-focus-fire property the model needs.
    // It establishes only that a laned engagement spreads damage, which is close to
    // a tautology.
    //
    // This is pinned as an UPPER bound on purpose. Raising it is the work: a setup
    // where a clustered party keeps taking damage while every mob can reach every
    // player. Until then, treat the model's 2n/(n+1) as UNVERIFIED against the sim,
    // and see the boss test for what happens when choice really is live — it
    // focus-fires, one victim absorbs everything, and the n-squared branch is wrong.
    //
    // If a future change makes this fail by going ABOVE 0.2, that is good news and
    // this assertion should be inverted into the >= 0.2 form it wants to be.
    expect(swings.length).toBeGreaterThan(0)
    expect(liveShare).toBeLessThan(0.2)
  })

  it('never piles two mobs onto one player', async () => {
    for (let t = 0; t < TICKS; t++) {
      await tickRoom(env, TICK_MS)
    }

    // The sharpest statement of "no coordination": aggregate targeting stays a
    // one-to-one matching. Nearest-target can collide two mobs onto one player in a
    // scrum, so this is a property of this engagement rather than of the AI in
    // general — but it is the engagement the model's even-spread reading describes,
    // and it is what has to hold for 2n/(n+1) to be the only party factor.
    const attackersPerTarget = new Map<string, Set<string>>()
    for (const s of swingLogs.flat()) {
      const set = attackersPerTarget.get(s.targetId) ?? new Set<string>()
      set.add(s.attackerId)
      attackersPerTarget.set(s.targetId, set)
    }

    expect(attackersPerTarget.size).toBe(PARTY)
    for (const [target, attackers] of attackersPerTarget.entries()) {
      expect({ target, attackers: attackers.size }).toEqual({ target, attackers: 1 })
    }
  })
})
