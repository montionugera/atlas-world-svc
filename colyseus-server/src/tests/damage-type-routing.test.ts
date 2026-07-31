/**
 * damageType routing through the attack payload (F-018 Phase 0 / I-027).
 *
 * The split `pDef` / `mDef` only executes if the projectile's `damageType`
 * survives the trip:
 *
 *   Projectile.damageType
 *     -> ProjectileCollisionResolver.handleEntityCollision
 *     -> BattleManager.createAttackMessage  (AttackActionPayload.damageType)
 *     -> BattleManager.processActionMessages
 *     -> BattleModule.processAttack
 *     -> DamageCalculator  (picks target.mDef vs target.pDef)
 *
 * Before this fix `createAttackMessage` had no `damageType` at all, so
 * `BattleModule` defaulted every queued hit to 'physical' and a magic staff's
 * damage was mitigated by `pDef`. These tests pin both channels so the
 * regression cannot come back silently.
 *
 * Structure follows src/tests/element-combat-integration.test.ts. Elements are
 * held at 'neutral' everywhere so the only variable is the defence channel.
 */

import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import type { AttackActionPayload } from '../modules/BattleActionMessage'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { Projectile } from '../schemas/Projectile'
import { GameState } from '../schemas/GameState'
import { ProjectileCollisionResolver } from '../modules/projectile/ProjectileCollisionResolver'
import { DeflectionResolver } from '../modules/projectile/DeflectionResolver'

/** Asymmetric on purpose: whichever channel is read shows up in the number. */
const P_DEF = 40
const M_DEF = 10
const BASE_DAMAGE = 100

describe('createAttackMessage carries damageType', () => {
  it('puts the supplied damageType on the payload', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
      damageType: 'magical',
      element: 'neutral',
    })
    expect((msg.actionPayload as AttackActionPayload).damageType).toBe('magical')
  })

  it('defaults to physical when no damageType is supplied', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
    })
    expect((msg.actionPayload as AttackActionPayload).damageType).toBe('physical')
  })

  it('mirrors the damageType onto projectileDetail so the two copies cannot diverge', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
      damageType: 'magical',
      element: 'neutral',
      projectileDetail: { id: 'p1', type: 'spear', damage: 10 },
    })
    const payload = msg.actionPayload as AttackActionPayload
    expect(payload.projectileDetail?.damageType).toBe('magical')
  })
})

describe('ProjectileCollisionResolver routes damageType to the right defence', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let owner: Player
  let mob: Mob

  const makeProjectile = (id: string, damageType: 'physical' | 'magical'): Projectile =>
    new Projectile(id, 105, 100, 1, 0, owner.id, BASE_DAMAGE, damageType)

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-damage-type')
    battleModule = new BattleModule(gameState)
    owner = new Player('owner-session', 'Owner', 100, 100)
    mob = new Mob({
      id: 'thick-skinned-mob',
      x: 105,
      y: 100,
      maxHealth: 5000,
      pDef: P_DEF,
      mDef: M_DEF,
      armor: 0,
      element: 'neutral',
    })
    gameState.players.set(owner.id, owner)
    gameState.mobs.set(mob.id, mob)
  })

  afterEach(() => {
    gameState.stopAI()
  })

  /** Drives the real queue path: resolver -> BattleManager -> BattleModule. */
  const queuedHitDamage = async (damageType: 'physical' | 'magical'): Promise<number> => {
    const battleManager = new BattleManager(gameState.roomId, gameState)
    try {
      const resolver = new ProjectileCollisionResolver(
        gameState,
        battleModule,
        battleManager,
        new DeflectionResolver(gameState)
      )
      const before = mob.currentHealth
      resolver.handleEntityCollision(makeProjectile(`proj-${damageType}`, damageType), mob)
      await battleManager.processActionMessages()
      return before - mob.currentHealth
    } finally {
      battleManager.cleanup()
    }
  }

  it('mitigates a magical hit with mDef, not pDef (BattleManager queue path)', async () => {
    // 100 base - mDef 10 = 90. The bug produced 100 - pDef 40 = 60.
    expect(await queuedHitDamage('magical')).toBe(BASE_DAMAGE - M_DEF)
  })

  it('still mitigates a physical hit with pDef (BattleManager queue path)', async () => {
    expect(await queuedHitDamage('physical')).toBe(BASE_DAMAGE - P_DEF)
  })

  it('mitigates a magical hit with mDef on the direct-damage fallback path', () => {
    const resolver = new ProjectileCollisionResolver(
      gameState,
      battleModule,
      undefined,
      new DeflectionResolver(gameState)
    )
    resolver.handleEntityCollision(makeProjectile('proj-fallback-m', 'magical'), mob)
    expect(mob.maxHealth - mob.currentHealth).toBe(BASE_DAMAGE - M_DEF)
  })

  it('still mitigates a physical hit with pDef on the direct-damage fallback path', () => {
    const resolver = new ProjectileCollisionResolver(
      gameState,
      battleModule,
      undefined,
      new DeflectionResolver(gameState)
    )
    resolver.handleEntityCollision(makeProjectile('proj-fallback-p', 'physical'), mob)
    expect(mob.maxHealth - mob.currentHealth).toBe(BASE_DAMAGE - P_DEF)
  })
})
