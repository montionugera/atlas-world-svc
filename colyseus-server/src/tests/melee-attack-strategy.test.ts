import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'

describe('MeleeAttackStrategy', () => {
  let strategy: MeleeAttackStrategy
  let mob: Mob
  let player: Player
  let mockProjectileManager: any
  let mockGameState: any

  beforeEach(() => {
    // Mock GameState
    mockGameState = {
      projectiles: new Map()
    }

    // Mock ProjectileManager
    mockProjectileManager = {
      createMelee: jest.fn().mockImplementation((owner, x, y, damage) => {
        return {
          id: 'proj-' + Date.now(),
          ownerId: owner.id,
          x: x,
          y: y,
          damage: damage
        }
      })
    }

    strategy = new MeleeAttackStrategy(mockProjectileManager, mockGameState)

    // Setup entities
    mob = new Mob({ id: 'mob-1', x: 100, y: 100, radius: 10, attackRange: 20 })
    player = new Player('player-1', 'Player 1', 110, 100) // Within range (10 distance < 10+20+radius)
    player.radius = 5
    
    // Ensure mob can attack (cooldowns reset)
    mob.lastAttackTime = 0
    mob.isAlive = true
    player.isAlive = true
    
    // Mock canAttack to true by default
    mob.canAttack = jest.fn().mockReturnValue(true)
  })

  test('should have correct name', () => {
    expect(strategy.name).toBe('melee')
  })

  test('should have 0 cast time', () => {
    expect(strategy.getCastTime()).toBe(0)
  })

  describe('canExecute', () => {
    test('should return true when in range and cooldown ready', () => {
      expect(strategy.canExecute(mob, player)).toBe(true)
    })

    test('should return false when target is dead', () => {
      player.isAlive = false
      expect(strategy.canExecute(mob, player)).toBe(false)
    })

    test('should return false when mob cannot attack (dead)', () => {
      // Logic inside Strategy: if (!mob.canAttack()) return false
      // mob.canAttack usually checks isAlive.
      // But we mocked it to return true.
      // We should mock it to return false OR checking isAlive inside Strategy?
      // Strategy.canExecute check: if (!target.isAlive) ... if (!mob.canAttack()) ...
      
      // So if we want to test "mob cannot attack", we set mock to false.
      (mob.canAttack as jest.Mock).mockReturnValue(false)
      expect(strategy.canExecute(mob, player)).toBe(false)
    })
    
    test('should return false when mob cannot attack (cooldown)', () => {
       (mob.canAttack as jest.Mock).mockReturnValue(false)
       expect(strategy.canExecute(mob, player)).toBe(false)
    })

    test('should return false when out of range', () => {
      player.x = 200 // Far away
      expect(strategy.canExecute(mob, player)).toBe(false)
    })
  })

  describe('execute', () => {
    test('should fail if dependencies missing', () => {
      const brokenStrategy = new MeleeAttackStrategy(undefined, undefined)
      expect(brokenStrategy.execute(mob, player, 'room-1')).toBe(false)
    })
    
    test('should execute and create projectile', () => {
      const result = strategy.execute(mob, player, 'room-1')
      
      expect(result).toBe(true)
      expect(mockProjectileManager.createMelee).toHaveBeenCalled()
      expect(mockGameState.projectiles.size).toBe(1)
    })
  })

  describe('attemptExecute', () => {
     test('should return executed=true for valid attack', () => {
        const result = strategy.attemptExecute(mob, player, 'room-1')
        
        expect(result.canExecute).toBe(true)
        expect(result.executed).toBe(true)
        expect(result.needsCasting).toBe(false)
        expect(result.targetId).toBe(player.id)
     })
     
     test('should return failed result when cannot execute', () => {
         player.x = 999
         const result = strategy.attemptExecute(mob, player, 'room-1')
         
         expect(result.canExecute).toBe(false)
         expect(result.executed).toBe(false)
     })
  })
})
