import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'
import { GAME_CONFIG } from '../config/gameConfig'

describe('Mob Facing Attack Requirement', () => {
  let mob: Mob
  let player: Player
  let gameState: GameState
  let projectileManager: ProjectileManager
  let meleeStrategy: MeleeAttackStrategy

  beforeEach(() => {
    gameState = new GameState('test-map', 'test-room')
    projectileManager = new ProjectileManager(gameState, new BattleModule(gameState))
    
    player = new Player('p1', 'Target', 200, 200)
    gameState.players.set(player.id, player)
    
    // Mob close to player (Target at 200, 200).
    // Place at 195, 200. Distance = 5.
    // Default mob radius ~2, player ~1, range ~2. Total ~5.
    // Explicitly set large attack range to be safe.
    mob = new Mob({ 
        id: 'm1', 
        x: 195, 
        y: 200, 
        attackRange: 10,
        rotationSpeed: Math.PI, // 180 degrees per second
    })
    gameState.mobs.set(mob.id, mob)
    
    // Assign Melee Strategy
    meleeStrategy = new MeleeAttackStrategy(projectileManager, gameState, { castTime: 0 })
    mob.attackStrategies = [meleeStrategy]
    mob.currentAttackStrategy = null
    
    // Set initial heading to PI (Left), keeping it AWAY from target (Right)
    mob.heading = Math.PI 
  })

  test('should NOT attack when facing away from target', () => {
    // Setup attack intent
    mob.currentBehavior = 'attack'
    mob.currentAttackTarget = player.id
    
    // Mock strategy execute
    const executeSpy = jest.spyOn(meleeStrategy, 'execute')
    
    // Update mob (delta time small enough to turn only slightly)
    // Rotation speed PI rad/s.
    // 100ms -> PI * 0.1 = 0.314 rad rotation.
    // Initial heading PI. Target 0.
    // New heading will be PI - 0.314 (turning towards 0).
    // Still far from facing 0.
    
    // We need to call `update` which calls `updateAttack` which calls `combatSystem.update` which calls strategy
    mob.update(100, gameState)
    
    // Check if executed
    // Should NOT execute because not facing target
    expect(executeSpy).not.toHaveBeenCalled()
    
    // Should have started rotating
    // Expect heading to have changed from PI
    expect(mob.heading).not.toBe(Math.PI)
    
    executeSpy.mockRestore()
  })

  test('should attack when facing target', () => {
    // Setup attack intent
    mob.currentBehavior = 'attack'
    mob.currentAttackTarget = player.id

    // Face the target (0 radians)
    mob.heading = 0 
    
    const executeSpy = jest.spyOn(meleeStrategy, 'execute')
    
    // Update
    mob.update(100, gameState)
    
    // Should execute immediately
    expect(executeSpy).toHaveBeenCalled()
    
    executeSpy.mockRestore()
  })

  test('should rotate until facing then attack', () => {
    // Initial: Facing Away (PI)
    mob.heading = Math.PI 
    mob.currentBehavior = 'attack'
    mob.currentAttackTarget = player.id
    
    const executeSpy = jest.spyOn(meleeStrategy, 'execute')

    // Simulate loop until facing
    // Need approx 1 sec to turn PI radians at PI speed.
    // Let's step 20 steps of 100ms
    
    let attacked = false
    for (let i = 0; i < 20; i++) {
        mob.update(100, gameState)
        if (executeSpy.mock.calls.length > 0) {
            attacked = true
            break
        }
    }
    
    expect(attacked).toBe(true)
    
    // Verify heading is close to 0
    // Normalized check
    let heading = mob.heading
    if (heading > Math.PI) heading -= 2*Math.PI
    
    expect(Math.abs(heading)).toBeLessThan(0.5) // Tolerance used in check
    
    executeSpy.mockRestore()
  })
})
