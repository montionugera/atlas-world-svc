
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { Projectile } from '../schemas/Projectile'
import { COLLISION_CATEGORIES, PHYSICS_CONFIG } from '../config/physicsConfig'
import * as planck from 'planck'

console.log('--- START DEBUG ---')
const physicsManager = new PlanckPhysicsManager()
const mgrAny = physicsManager as any

console.log('Categories:', COLLISION_CATEGORIES)

// Create Player Projectile
const projectile = new Projectile('p1-pvp', 100, 100, 10, 0, { id: 'p1', group: 'player' } as any, 10)
physicsManager.createProjectileBody(projectile, true) // PvP mode

const pBody = physicsManager.getBody(projectile.id)!
const pFixture = pBody.getFixtureList()!
console.log('Projectile Filter:', pFixture.getFilterCategoryBits(), pFixture.getFilterMaskBits())
console.log('Projectile Sensor:', pFixture.isSensor())

// Create Player Body
const playerBody = mgrAny.world.createBody({
    position: planck.Vec2(100.5, 100),
    type: 'dynamic'
})
playerBody.createFixture({
    shape: planck.Circle(1.0),
    filterCategoryBits: COLLISION_CATEGORIES.PLAYER,
    filterMaskBits: COLLISION_CATEGORIES.PLAYER_PROJECTILE
})
const plFixture = playerBody.getFixtureList()!
console.log('Player Filter:', plFixture.getFilterCategoryBits(), plFixture.getFilterMaskBits())

// Register callback
physicsManager.onCollision('projectile', 'player', () => {
    console.log('!!! COLLISION DETECTED !!!')
})
mgrAny.entityDataByBody.set(playerBody, { type: 'player', id: 'target-player' })

// Step
console.log('Stepping...')
mgrAny.world.step(1/60)
console.log('Step done.')

console.log('--- END DEBUG ---')
