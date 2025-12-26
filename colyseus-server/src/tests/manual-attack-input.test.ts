import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { eventBus } from '../events/EventBus'

// Mock event bus
jest.mock('../events/EventBus', () => ({
  eventBus: {
    emitRoomEvent: jest.fn()
  },
  RoomEventType: {
    BATTLE_ATTACK: 'BATTLE_ATTACK'
  }
}))

const mockEmitRoomEvent = eventBus.emitRoomEvent as jest.Mock

describe('Manual Attack Input Tests', () => {
  let player: Player
  let mob: Mob

  beforeEach(() => {
    player = new Player('session-1', 'Test Player', 100, 100)
    mob = new Mob({ id: 'mob-1', x: 105, y: 100 }) // 5 units away (in range)
    mockEmitRoomEvent.mockClear()
  })

  test('Should allow manual attack when Bot Mode is DISABLED', () => {
    player.setBotMode(false)
    player.input.attack = true
    player.heading = 0 // Facing right towards mob
    
    // Mock canAttack to return true
    jest.spyOn(player, 'canAttack').mockReturnValue(true)
    
    const result = player.processAttackInput(new Map([['mob-1', mob]]), 'room-1')
    
    expect(result).toBe(true)
    expect(mockEmitRoomEvent).toHaveBeenCalled()
  })

  test('Should BLOCK manual attack when Bot Mode is ENABLED', () => {
    player.setBotMode(true)
    player.input.attack = true
    player.heading = 0
    
    jest.spyOn(player, 'canAttack').mockReturnValue(true)
    
    const result = player.processAttackInput(new Map([['mob-1', mob]]), 'room-1')
    
    expect(result).toBe(false)
    expect(mockEmitRoomEvent).not.toHaveBeenCalled()
  })

  test('Should allow manual attack after disabling Bot Mode', () => {
    // Enable bot mode first
    player.setBotMode(true)
    player.input.attack = true
    
    jest.spyOn(player, 'canAttack').mockReturnValue(true)
    
    let result = player.processAttackInput(new Map([['mob-1', mob]]), 'room-1')
    expect(result).toBe(false)
    expect(mockEmitRoomEvent).not.toHaveBeenCalled()
    
    // Disable bot mode
    player.setBotMode(false)
    
    // Try attack again
    result = player.processAttackInput(new Map([['mob-1', mob]]), 'room-1')
    expect(result).toBe(true)
    expect(mockEmitRoomEvent).toHaveBeenCalled()
  })
})
