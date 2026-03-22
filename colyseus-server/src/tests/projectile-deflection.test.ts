import { Projectile } from '../schemas/Projectile'
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { eventBus } from '../events/EventBus'
import { Player } from '../schemas/Player'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'

describe('Projectile Deflection System', () => {
    let gameState: GameState
    let battleModule: BattleModule
    let projectileManager: ProjectileManager

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room-deflect')
        battleModule = new BattleModule(gameState)
    projectileManager = new ProjectileManager(gameState, battleModule)
        
        // Mock event bus to avoid errors
        jest.spyOn(eventBus, 'emitRoomEvent').mockImplementation(() => {})
    })

    test('Equal Level: Both projectiles are destroyed', () => {
        const p1 = new Projectile('p1', 0, 0, 0, 0, 'owner1', 10)
        const p2 = new Projectile('p2', 0, 0, 0, 0, 'owner2', 10)

        projectileManager.handleProjectileCollision(p1, p2)

        // stuckAt > 0 implies destroyed/stopped
        expect(p1.stuckAt).toBeGreaterThan(0)
        expect(p2.stuckAt).toBeGreaterThan(0)
    })

    test('Different teams projectiles are destroyed', () => {
        const pStrong = new Projectile('strong', 0, 0, 0, 0, 'owner1', 10, 'physical', 'spear', 100, 4, 1000, 'team1')
        const pWeak = new Projectile('weak', 0, 0, 0, 0, 'owner2', 10, 'physical', 'spear', 100, 4, 1000, 'team2')

        projectileManager.handleProjectileCollision(pStrong, pWeak)

        // Both are destroyed because they clash
        expect(pStrong.stuckAt).toBeGreaterThan(0)
        expect(pWeak.stuckAt).toBeGreaterThan(0)
    })

    test('Same team projectiles ignore each other', () => {
        const pStrong = new Projectile('strong', 0, 0, 0, 0, 'owner1', 10, 'physical', 'spear', 100, 4, 1000, 'team1')
        const pWeak = new Projectile('weak', 0, 0, 0, 0, 'owner2', 10, 'physical', 'spear', 100, 4, 1000, 'team1')

        // Swap arguments
        projectileManager.handleProjectileCollision(pWeak, pStrong)

        expect(pStrong.stuckAt).toBe(0)
        expect(pWeak.stuckAt).toBe(0)
    })
    
    test('Dead projectile should not trigger collision again', () => {
        const pDead = new Projectile('dead', 0, 0, 0, 0, 'owner1', 10, 'physical', 'spear', 100, 4, 1000, 'team1')
        pDead.stick() // Already dead
        pDead.hitTargets.add('clash') // Marks it as having already resolved collision
        
        const pLive = new Projectile('live', 0, 0, 0, 0, 'owner2', 10, 'physical', 'spear', 100, 4, 1000, 'team2')
        
        projectileManager.handleProjectileCollision(pDead, pLive)
        
        // Live should remain live
        expect(pLive.stuckAt).toBe(0)
    })

  test('syncEntityToBody keeps physics body velocity aligned after deflect', () => {
    const physicsManager = new PlanckPhysicsManager()

    // Create a projectile with an associated physics body
    const projectile = new Projectile('proj-sync', 0, 0, 5, 0, 'owner1', 10)
    gameState.projectiles.set(projectile.id, projectile)
    physicsManager.createProjectileBody(projectile)

    // Player attacker that can deflect
    const attacker = new Player('player-1', 'TestPlayer', 0, 0)
    attacker.heading = 0
    attacker.isAttacking = true
    attacker.attackRange = 5
    attacker.radius = 1
    attacker.teamId = 'team-a'

    // Place projectile within range/cone
    projectile.x = 3
    projectile.y = 0

    const vxBefore = projectile.vx

    const deflected = projectileManager.checkDeflection(projectile, attacker)
    expect(deflected).toBe(true)
    expect(projectile.vx).not.toBe(vxBefore)

    // Sync physics body to new projectile velocity
    physicsManager.syncEntityToBody(projectile, projectile.id)

    const body = physicsManager.getBody(projectile.id)
    const bodyVel = body!.getLinearVelocity()

    // Body velocity should match projectile velocity after sync
    expect(bodyVel.x).toBeCloseTo(projectile.vx)
    expect(bodyVel.y).toBeCloseTo(projectile.vy)

    physicsManager.removeBody(projectile.id)
  })

  test('removeBody + createProjectileBody keeps physics body aligned after deflect', () => {
    const physicsManager = new PlanckPhysicsManager()

    const projectile = new Projectile('proj-recreate', 0, 0, 5, 0, 'owner1', 10)
    gameState.projectiles.set(projectile.id, projectile)
    physicsManager.createProjectileBody(projectile)

    const attacker = new Player('player-1', 'TestPlayer', 0, 0)
    attacker.heading = 0
    attacker.isAttacking = true
    attacker.attackRange = 5
    attacker.radius = 1
    attacker.teamId = 'team-a'

    projectile.x = 3
    projectile.y = 0

    const deflected = projectileManager.checkDeflection(projectile, attacker)
    expect(deflected).toBe(true)

    // Apply the runtime change: destroy stale body and recreate it from deflected fields.
    physicsManager.removeBody(projectile.id)
    physicsManager.createProjectileBody(projectile)

    const body = physicsManager.getBody(projectile.id)
    expect(body).toBeDefined()

    const bodyVel = body!.getLinearVelocity()
    expect(bodyVel.x).toBeCloseTo(projectile.vx)
    expect(bodyVel.y).toBeCloseTo(projectile.vy)

    physicsManager.removeBody(projectile.id)
  })

  test('geometric contact-point reflection correctly deflects projectile diagonally', () => {
    const projectile = new Projectile('proj-angle', 3, 4, -3, -4, 'owner1', 10, 'physical', 'spear')
    gameState.projectiles.set(projectile.id, projectile)

    const attacker = new Player('player-1', 'TestPlayer', 0, 0)
    // Needs to face the projectile to satisfy the cone angle check
    attacker.heading = Math.atan2(4, 3) 
    attacker.isAttacking = true
    attacker.attackRange = 5
    attacker.radius = 1
    attacker.teamId = 'team-a'

    // Projectile is at (3, 4) moving toward (0, 0) with velocity (-3, -4)
    // Distance from player (0,0) is 5.
    // Normal vector is (3/5, 4/5) = (0.6, 0.8)
    // Velocity is (-3, -4)
    // dot = (-3)*(0.6) + (-4)*(0.8) = -1.8 - 3.2 = -5.0
    // Vector reflection: V_new = (-3, -4) - 2*(-5)*(0.6, 0.8) 
    // V_new = (-3, -4) + 10*(0.6, 0.8) = (-3, -4) + (6, 8) = (3, 4)
    // Speed boost 1.2 applies -> vx = 3.6, vy = 4.8
    
    const deflected = projectileManager.checkDeflection(projectile, attacker)
    expect(deflected).toBe(true)
    
    expect(projectile.vx).toBeCloseTo(3.6, 1)
    expect(projectile.vy).toBeCloseTo(4.8, 1)
  })
})
