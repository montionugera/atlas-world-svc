import { PHYSICS_CONFIG, shouldCollide } from '../config/physicsConfig'

describe('Projectile Collision Configuration', () => {
  test('Projectiles should collide with other Projectiles', () => {
    const projCategory = PHYSICS_CONFIG.entities.projectile.collisionFilter.category
    const projMask = PHYSICS_CONFIG.entities.projectile.collisionFilter.mask

    // Check strict bitmask logic
    // shouldCollide returns true if (catA & maskB) && (catB & maskA)
    const collides = shouldCollide(projCategory, projCategory, projMask, projMask)
    
    expect(collides).toBe(true)
  })

  test('Projectiles should collide with Players', () => {
    const projCategory = PHYSICS_CONFIG.entities.projectile.collisionFilter.category
    const projMask = PHYSICS_CONFIG.entities.projectile.collisionFilter.mask

    const playerCategory = PHYSICS_CONFIG.entities.player.collisionFilter.category
    const playerMask = PHYSICS_CONFIG.entities.player.collisionFilter.mask

    const collides = shouldCollide(projCategory, playerCategory, projMask, playerMask)
    
    expect(collides).toBe(true)
  })

  test('Projectiles should collide with Mobs', () => {
    const projCategory = PHYSICS_CONFIG.entities.projectile.collisionFilter.category
    const projMask = PHYSICS_CONFIG.entities.projectile.collisionFilter.mask

    const mobCategory = PHYSICS_CONFIG.entities.mob.collisionFilter.category
    const mobMask = PHYSICS_CONFIG.entities.mob.collisionFilter.mask

    const collides = shouldCollide(projCategory, mobCategory, projMask, mobMask)
    
    expect(collides).toBe(true)
  })

  test('Projectiles should collide with Boundaries', () => {
    const projCategory = PHYSICS_CONFIG.entities.projectile.collisionFilter.category
    const projMask = PHYSICS_CONFIG.entities.projectile.collisionFilter.mask

    const boundaryCategory = PHYSICS_CONFIG.entities.boundary.collisionFilter.category
    const boundaryMask = PHYSICS_CONFIG.entities.boundary.collisionFilter.mask

    const collides = shouldCollide(projCategory, boundaryCategory, projMask, boundaryMask)
    
    expect(collides).toBe(true)
  })
})
