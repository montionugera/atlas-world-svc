/**
 * BATTLE_ATTACK must carry its damage channel and element (I-037).
 *
 *   eventBus.emit(BATTLE_ATTACK)
 *     -> BattleManager listener
 *     -> BattleManager.createAttackMessage  (AttackActionPayload.damageType)
 *     -> BattleManager.processActionMessages
 *     -> BattleModule.processAttack
 *     -> DamageCalculator  (picks target.mDef vs target.pDef)
 *
 * Before this fix the listener dropped both fields, so every queued hit on this
 * path resolved as physical/neutral no matter what the emitter intended.
 *
 * Asserted via asymmetric pDef/mDef so the resulting number identifies which
 * channel was read. `damage` is passed explicitly and never sourced from mAtk —
 * after F-019 a blade yields mAtk of exactly 0, so a wrong-channel hit and a
 * correct-but-zero hit would otherwise be indistinguishable.
 */

import { BattleManager } from '../modules/BattleManager'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'

/** Asymmetric on purpose: whichever channel is read shows up in the number. */
const P_DEF = 40
const M_DEF = 10
const BASE_DAMAGE = 100

describe('BATTLE_ATTACK carries the damage channel to DamageCalculator', () => {
  let gameState: GameState
  let attacker: Player
  let mob: Mob
  let battleManager: BattleManager

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-battle-attack-channel')
    // Adjacent: this path is attackType 'melee', so canAttack DOES apply the range
    // check (only 'projectile' bypasses it). The attacker is a Player, so the
    // cooldown check is bypassed by tag.
    attacker = new Player('attacker-session', 'Attacker', 100, 100)
    mob = new Mob({
      id: 'thick-skinned-mob',
      x: 101,
      y: 100,
      maxHealth: 5000,
      pDef: P_DEF,
      mDef: M_DEF,
      armor: 0,
      element: 'neutral',
    })
    gameState.players.set(attacker.id, attacker)
    gameState.mobs.set(mob.id, mob)
    battleManager = new BattleManager(gameState.roomId, gameState)
  })

  afterEach(() => {
    battleManager.cleanup()
    gameState.stopAI()
  })

  const emittedHitDamage = async (damageType: 'physical' | 'magical'): Promise<number> => {
    const attackData: BattleAttackData = {
      actorId: attacker.id,
      targetId: mob.id,
      damage: BASE_DAMAGE,
      damageType,
      element: 'neutral',
      range: attacker.attackRange,
      roomId: gameState.roomId,
    }
    const before = mob.currentHealth
    eventBus.emitRoomEvent(gameState.roomId, RoomEventType.BATTLE_ATTACK, attackData)
    await battleManager.processActionMessages()
    return before - mob.currentHealth
  }

  it('mitigates a magical BATTLE_ATTACK with mDef, not pDef', async () => {
    // 100 base - mDef 10 = 90. The defect produces 100 - pDef 40 = 60.
    expect(await emittedHitDamage('magical')).toBe(BASE_DAMAGE - M_DEF)
  })

  it('still mitigates a physical BATTLE_ATTACK with pDef', async () => {
    expect(await emittedHitDamage('physical')).toBe(BASE_DAMAGE - P_DEF)
  })
})
