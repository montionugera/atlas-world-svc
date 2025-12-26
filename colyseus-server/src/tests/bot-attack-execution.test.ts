import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { eventBus, RoomEventType } from '../events/EventBus'

describe('Player Bot Attack Execution', () => {
  let player: Player
  let gameState: GameState
  let mob: Mob

  beforeEach(() => {
    gameState = new GameState('test-map', 'test-room')
    player = new Player('p1', 'BotPlayer', 100, 100)
    player.setBotMode(true)
    
    mob = new Mob({ id: 'm1', x: 105, y: 100 }) // Within attack range
    gameState.mobs.set(mob.id, mob)
  })

  test('should execute attack when behavior is attack', () => {
    // Mock EventBus
    const emitSpy = jest.spyOn(eventBus, 'emitRoomEvent')
    
    // Set player behavior to attack
    player.currentBehavior = 'attack'
    player.currentAttackTarget = mob.id
    
    // Update player with game state
    player.update(16, gameState)
    
    // Verify attack event emitted
    expect(emitSpy).toHaveBeenCalledWith(
      'test-room',
      RoomEventType.BATTLE_ATTACK,
      expect.objectContaining({
        actorId: player.id,
        targetId: mob.id
      })
    )
    
    expect(player.isAttacking).toBe(true)
    
    emitSpy.mockRestore()
  })

  test('should not attack if cooldown active', () => {
    const emitSpy = jest.spyOn(eventBus, 'emitRoomEvent')
    
    player.currentBehavior = 'attack'
    player.currentAttackTarget = mob.id
    player.lastAttackTime = performance.now() // Just attacked
    
    player.update(16, gameState)
    
    expect(emitSpy).not.toHaveBeenCalled()
    
    emitSpy.mockRestore()
  })
})
