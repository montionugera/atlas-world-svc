
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'

describe('Mob Projectile Aiming Behavior', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let projectileManager: ProjectileManager
  let mob: Mob
  let player: Player

  beforeEach(() => {
    gameState = new GameState('map-01-sector-a', 'test-room')
    battleModule = new BattleModule(gameState)
    projectileManager = new ProjectileManager(gameState, battleModule)

    mob = new Mob({
        id: 'mob-caster',
        x: 100, 
        y: 100,
        // Using spear throw which has a cast time (default 500ms)
        attackStrategies: [new SpearThrowAttackStrategy(projectileManager, gameState)]
    })
    
    player = new Player('player-target', 'Target', 110, 100)
    gameState.players.set(player.id, player)
  })
  
  test('Projectile should (currently) fly towards moved target despite locked heading', () => {
    // 1. Setup attack
    mob.currentBehavior = 'attack'
    mob.currentAttackTarget = player.id
    mob.lastAttackTime = -999999 // Ensure cooldown is ready
    
    // 2. Initial update to start casting (target at 110, 100) -> Heading 0
    mob.update(16, gameState)
    expect(mob.isCasting).toBe(true)
    expect(mob.heading).toBeCloseTo(0)
    
    // 3. Move target significantly (to 100, 110) -> Angle PI/2
    player.x = 100
    player.y = 110
    
    // 4. Update until cast finish (500ms)
    // We need to simulate enough time passing. 
    // Mob update uses Date.now() for cast check. 
    // We can't easily mock Date.now() inside the module structure without complex setup, 
    // but we can manipulate mob.castStartTime.
    mob.castStartTime = Date.now() - 600 // Force cast completion
    
    // 5. Update to execute attack
    mob.update(16, gameState)
    
    expect(mob.isCasting).toBe(false)
    expect(gameState.projectiles.size).toBe(1)
    
    const projectile = Array.from(gameState.projectiles.values())[0]
    
    // Calculate projectile angle
    const projAngle = Math.atan2(projectile.vy, projectile.vx)
    
    // CURRENT BEHAVIOR: Projectile aims at CURRENT target position (PI/2)
    // even though heading is locked at 0.
    const targetAngle = Math.PI / 2
    const mobHeading = 0
    
    // Verify specific bug: Projectile angle matches new target angle, ignored mob heading
    // FIXED BEHAVIOR: Projectile aims at locked heading (0)
    expect(projAngle).toBeCloseTo(mobHeading, 1) // Should be 0
    expect(projAngle).not.toBeCloseTo(targetAngle, 1) // Should NOT be PI/2
  })
})
