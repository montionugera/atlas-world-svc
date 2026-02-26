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

  afterEach(() => {
    if (gameState) {
      gameState.stopAI()
    }
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  test('should execute attack when behavior is attack', () => {
    // Mock EventBus
    const emitSpy = jest.spyOn(eventBus, 'emitRoomEvent')
    
    jest.useFakeTimers()
    jest.setSystemTime(Date.now())
    
    // Set player behavior to attack
    player.currentBehavior = 'attack'
    player.currentAttackTarget = mob.id
    player.heading = 0 // Face the mob
    player.lastAttackTime = -99999 // Bypass cooldown
    
    // Update player with game state (Starts wind-up)
    player.update(16, { mobs: gameState.mobs, roomId: gameState.roomId })
    // Verify attack event emitted - wait for wind-up
    // Advance time past the wind up (100ms)
    jest.setSystemTime(Date.now() + 150)
    player.update(16, { mobs: gameState.mobs, roomId: gameState.roomId })

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
    jest.useRealTimers()
  })

  test('should not attack if cooldown active', () => {
    const emitSpy = jest.spyOn(eventBus, 'emitRoomEvent')
    
    player.currentBehavior = 'attack'
    player.currentAttackTarget = mob.id
    player.lastAttackTime = performance.now() // Just attacked
    
    player.update(16, { mobs: gameState.mobs, roomId: gameState.roomId })
    
    expect(emitSpy).not.toHaveBeenCalled()
    
    emitSpy.mockRestore()
  })
})
