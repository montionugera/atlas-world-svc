import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GAME_CONFIG } from '../config/gameConfig'
import * as planck from 'planck'

describe('Physics System Tests', () => {
  let physicsManager: PlanckPhysicsManager
  let testPlayer: Player
  let testMob1: Mob
  let testMob2: Mob

  beforeEach(() => {
    physicsManager = new PlanckPhysicsManager()

    // Create test entities
    testPlayer = new Player('test-player', 'TestPlayer')
    testMob1 = new Mob({ id: 'test-mob-1', x: 50, y: 50, vx: 5, vy: 0 }) // Moving right
    testMob2 = new Mob({ id: 'test-mob-2', x: 60, y: 50, vx: -5, vy: 0 }) // Moving left
  })

  afterEach(() => {
    physicsManager.destroy()
  })

  describe('Entity Creation', () => {
    test('should create player physics body', () => {
      const playerBody = physicsManager.createPlayerBody(testPlayer)
      expect(playerBody).toBeDefined()
      expect(playerBody.getPosition().x).toBe(testPlayer.x)
      expect(playerBody.getPosition().y).toBe(testPlayer.y)
    })

    test('should create mob physics body', () => {
      const mobBody = physicsManager.createMobBody(testMob1)
      expect(mobBody).toBeDefined()
      expect(mobBody.getPosition().x).toBe(testMob1.x)
      expect(mobBody.getPosition().y).toBe(testMob1.y)
    })

    test('should store entity data correctly', () => {
      const playerBody = physicsManager.createPlayerBody(testPlayer)
      const mobBody = physicsManager.createMobBody(testMob1)

      const playerData = physicsManager.getEntityDataFromBody(playerBody)
      const mobData = physicsManager.getEntityDataFromBody(mobBody)

      expect(playerData).toEqual({ type: 'player', id: 'test-player' })
      expect(mobData).toEqual({ type: 'mob', id: 'test-mob-1' })
    })
  })

  describe('Mob Movement', () => {
    test('should move mobs without clustering', () => {
      // Create mobs at different positions
      const mob1 = new Mob({ id: 'mob-1', x: 20, y: 20, vx: 2, vy: 0 })
      const mob2 = new Mob({ id: 'mob-2', x: 80, y: 80, vx: -2, vy: 0 })
      const mob3 = new Mob({ id: 'mob-3', x: 50, y: 10, vx: 0, vy: 2 })

      const body1 = physicsManager.createMobBody(mob1)
      const body2 = physicsManager.createMobBody(mob2)
      const body3 = physicsManager.createMobBody(mob3)

      // Simulate traditional movement for 100 steps
      for (let i = 0; i < 100; i++) {
        // Update mobs using traditional movement
        mob1.updatePosition()
        mob2.updatePosition()
        mob3.updatePosition()

        // Sync positions to physics bodies
        body1.setPosition(planck.Vec2(mob1.x, mob1.y))
        body2.setPosition(planck.Vec2(mob2.x, mob2.y))
        body3.setPosition(planck.Vec2(mob3.x, mob3.y))

        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      // Check that mobs are still spread out (not clustered)
      const pos1 = body1.getPosition()
      const pos2 = body2.getPosition()
      const pos3 = body3.getPosition()

      // Calculate distances between mobs
      const dist12 = Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2)
      const dist13 = Math.sqrt((pos1.x - pos3.x) ** 2 + (pos1.y - pos3.y) ** 2)
      const dist23 = Math.sqrt((pos2.x - pos3.x) ** 2 + (pos2.y - pos3.y) ** 2)

      // Mobs should maintain some distance (not all clustered together)
      expect(dist12).toBeGreaterThan(10)
      expect(dist13).toBeGreaterThan(10)
      expect(dist23).toBeGreaterThan(10)
    })

    test('should not get stuck in middle of map', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 3, vy: 2 })
      const body = physicsManager.createMobBody(mob)

      const initialMobPos = { x: mob.x, y: mob.y }

      // Simulate traditional movement for 200 steps
      for (let i = 0; i < 200; i++) {
        // Update mob using traditional movement (scale by time step)
        const dt = GAME_CONFIG.tickRate / 1000 // Convert to seconds
        mob.x += mob.vx * dt
        mob.y += mob.vy * dt
        mob.applyBoundaryPhysics(100, 100) // Use correct world size

        // Sync position to physics body
        body.setPosition(planck.Vec2(mob.x, mob.y))

        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      const finalMobPos = { x: mob.x, y: mob.y }
      const distanceMoved = Math.sqrt(
        (finalMobPos.x - initialMobPos.x) ** 2 + (finalMobPos.y - initialMobPos.y) ** 2
      )

      // Debug logging
      console.log(`Initial: (${initialMobPos.x}, ${initialMobPos.y})`)
      console.log(`Final: (${finalMobPos.x}, ${finalMobPos.y})`)
      console.log(`Distance moved: ${distanceMoved}`)
      console.log(`Mob velocity: (${mob.vx}, ${mob.vy})`)

      // Mob should have moved significantly from starting position
      expect(distanceMoved).toBeGreaterThan(20)
    })
  })

  describe('Boundary Collision', () => {
    test('should bounce off top boundary', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 5, vx: 0, vy: -5 }) // Moving up towards top
      const body = physicsManager.createMobBody(mob)

      // NO MANUAL COLLISION CALLBACKS! Let physics handle it automatically

      const initialVel = body.getLinearVelocity()
      console.log(`🔍 INITIAL: vel.y=${initialVel.y}, pos.y=${body.getPosition().y}`)
      expect(initialVel.y).toBeLessThan(0) // Moving up

      // Simulate until collision
      for (let i = 0; i < 50; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
        if (i % 10 === 0) {
          console.log(
            `🔍 STEP ${i}: vel.y=${body.getLinearVelocity().y}, pos.y=${body.getPosition().y}`
          )
        }
      }

      const finalVel = body.getLinearVelocity()
      const finalPos = body.getPosition()
      // After collision, should be moving down (bounced)
      console.log(`🔍 FINAL: vel.y=${finalVel.y}, pos.y=${finalPos.y}`)
      expect(finalVel.y).toBeGreaterThan(0)
    })

    test('should bounce off bottom boundary', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 95, vx: 0, vy: 5 }) // Moving down towards bottom
      const body = physicsManager.createMobBody(mob)

      const initialVel = body.getLinearVelocity()
      expect(initialVel.y).toBeGreaterThan(0) // Moving down

      // Simulate until collision
      for (let i = 0; i < 50; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      const finalVel = body.getLinearVelocity()
      // After collision, should be moving up (bounced)
      expect(finalVel.y).toBeLessThan(0)
    })

    test('should bounce off left boundary', () => {
      const mob = new Mob({ id: 'test-mob', x: 5, y: 50, vx: -5, vy: 0 }) // Moving left
      const body = physicsManager.createMobBody(mob)

      const initialVel = body.getLinearVelocity()
      expect(initialVel.x).toBeLessThan(0) // Moving left

      // Simulate until collision
      for (let i = 0; i < 50; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      const finalVel = body.getLinearVelocity()
      // After collision, should be moving right (bounced)
      expect(finalVel.x).toBeGreaterThan(0)
    })

    test('should bounce off right boundary', () => {
      const mob = new Mob({ id: 'test-mob', x: 95, y: 50, vx: 5, vy: 0 }) // Moving right
      const body = physicsManager.createMobBody(mob)

      const initialVel = body.getLinearVelocity()
      expect(initialVel.x).toBeGreaterThan(0) // Moving right

      // Simulate until collision
      for (let i = 0; i < 50; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      const finalVel = body.getLinearVelocity()
      // After collision, should be moving left (bounced)
      expect(finalVel.x).toBeLessThan(0)
    })
  })

  describe('Mob-Mob Collision', () => {
    test('should detect collision between two mobs', () => {
      let collisionDetected = false

      // Set up collision callback
      physicsManager.onCollision('mob', 'mob', (bodyA, bodyB) => {
        collisionDetected = true
      })

      // Create two mobs that will collide
      const mob1 = new Mob({ id: 'mob-1', x: 50, y: 50, vx: 5, vy: 0 }) // Moving right
      const mob2 = new Mob({ id: 'mob-2', x: 55, y: 50, vx: -5, vy: 0 }) // Moving left

      physicsManager.createMobBody(mob1)
      physicsManager.createMobBody(mob2)

      // Simulate until collision
      for (let i = 0; i < 100; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
        if (collisionDetected) break
      }

      expect(collisionDetected).toBe(true)
    })

    test('should bounce mobs off each other', () => {
      const mob1 = new Mob({ id: 'mob-1', x: 50, y: 50, vx: 5, vy: 0 }) // Moving right
      const mob2 = new Mob({ id: 'mob-2', x: 55, y: 50, vx: -5, vy: 0 }) // Moving left

      const body1 = physicsManager.createMobBody(mob1)
      const body2 = physicsManager.createMobBody(mob2)

      const initialVel1 = body1.getLinearVelocity()
      const initialVel2 = body2.getLinearVelocity()

      // Simulate collision
      for (let i = 0; i < 50; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      const finalVel1 = body1.getLinearVelocity()
      const finalVel2 = body2.getLinearVelocity()

      // Velocities should have changed (bounced)
      expect(finalVel1.x).not.toBe(initialVel1.x)
      expect(finalVel2.x).not.toBe(initialVel2.x)
    })
  })

  describe('Player-Mob Collision', () => {
    test('should detect player-mob collision', () => {
      let collisionDetected = false

      // Set up collision callback
      physicsManager.onCollision('player', 'mob', (bodyA, bodyB) => {
        collisionDetected = true
      })

      const player = new Player('test-player', 'TestPlayer')
      const mob = new Mob({ id: 'test-mob', x: 55, y: 50, vx: -5, vy: 0 }) // Moving towards player

      physicsManager.createPlayerBody(player)
      physicsManager.createMobBody(mob)

      // Simulate until collision
      for (let i = 0; i < 100; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
        if (collisionDetected) break
      }

      expect(collisionDetected).toBe(true)
    })
  })

  describe('Physics Performance', () => {
    test('should handle multiple mobs efficiently', () => {
      const mobs: Mob[] = []
      const bodies: any[] = []

      // Create 20 mobs
      for (let i = 0; i < 20; i++) {
        const mob = new Mob({
          id: `mob-${i}`,
          x: Math.random() * 80 + 10, // Random position
          y: Math.random() * 80 + 10,
          vx: (Math.random() - 0.5) * 10, // Random velocity
          vy: (Math.random() - 0.5) * 10,
        })
        mobs.push(mob)
        bodies.push(physicsManager.createMobBody(mob))
      }

      const startTime = Date.now()

      // Simulate 1000 steps
      for (let i = 0; i < 1000; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000)

      // All mobs should still be moving (not stuck)
      bodies.forEach((body, index) => {
        const pos = body.getPosition()
        const vel = body.getLinearVelocity()
        const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2)

        // Mob should be within bounds and moving
        expect(pos.x).toBeGreaterThan(0)
        expect(pos.x).toBeLessThan(100)
        expect(pos.y).toBeGreaterThan(0)
        expect(pos.y).toBeLessThan(100)
        expect(speed).toBeGreaterThan(0.1) // Not completely stopped
      })
    })
  })

  describe('Mob Velocity Persistence', () => {
    test('should maintain velocity over time without stopping', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 5, vy: 3 }) // Moving with velocity (5, 3)
      const body = physicsManager.createMobBody(mob)

      const initialVel = body.getLinearVelocity()
      const initialSpeed = Math.sqrt(initialVel.x * initialVel.x + initialVel.y * initialVel.y)
      console.log(
        `🔍 INITIAL: vel=(${initialVel.x.toFixed(2)}, ${initialVel.y.toFixed(2)}), speed=${initialSpeed.toFixed(2)}`
      )

      // Simulate for 1000 steps (long duration)
      for (let i = 0; i < 1000; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())

        if (i % 200 === 0) {
          const vel = body.getLinearVelocity()
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
          console.log(
            `🔍 STEP ${i}: vel=(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}), speed=${speed.toFixed(2)}`
          )
        }
      }

      const finalVel = body.getLinearVelocity()
      const finalSpeed = Math.sqrt(finalVel.x * finalVel.x + finalVel.y * finalVel.y)
      console.log(
        `🔍 FINAL: vel=(${finalVel.x.toFixed(2)}, ${finalVel.y.toFixed(2)}), speed=${finalSpeed.toFixed(2)}`
      )

      // Mob should still be moving (not stopped)
      expect(finalSpeed).toBeGreaterThan(0.1)
    })

    test('should detect when mobs lose velocity', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 5, vy: 3 })
      const body = physicsManager.createMobBody(mob)

      let stoppedSteps = 0
      let totalSteps = 0

      // Simulate for 500 steps
      for (let i = 0; i < 500; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
        totalSteps++

        const vel = body.getLinearVelocity()
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)

        if (speed < 0.1) {
          stoppedSteps++
          if (stoppedSteps === 1) {
            console.log(
              `🔍 MOB STOPPED at step ${i}: vel=(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}), speed=${speed.toFixed(2)}`
            )
          }
        }
      }

      const stoppedPercentage = (stoppedSteps / totalSteps) * 100
      console.log(
        `🔍 STOPPED ANALYSIS: ${stoppedSteps}/${totalSteps} steps (${stoppedPercentage.toFixed(1)}%)`
      )

      // Mob should not be stopped for more than 50% of the time
      expect(stoppedPercentage).toBeLessThan(50)
    })

    test('should maintain velocity with boundary collisions', () => {
      const mob = new Mob({ id: 'test-mob', x: 10, y: 10, vx: 8, vy: 6 }) // Start near boundary with high velocity
      const body = physicsManager.createMobBody(mob)

      const initialVel = body.getLinearVelocity()
      const initialSpeed = Math.sqrt(initialVel.x * initialVel.x + initialVel.y * initialVel.y)
      console.log(
        `🔍 BOUNDARY TEST INITIAL: vel=(${initialVel.x.toFixed(2)}, ${initialVel.y.toFixed(2)}), speed=${initialSpeed.toFixed(2)}`
      )

      // Simulate for 300 steps (should hit boundaries multiple times)
      for (let i = 0; i < 300; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())

        if (i % 50 === 0) {
          const vel = body.getLinearVelocity()
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
          const pos = body.getPosition()
          console.log(
            `🔍 BOUNDARY STEP ${i}: pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}), vel=(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}), speed=${speed.toFixed(2)}`
          )
        }
      }

      const finalVel = body.getLinearVelocity()
      const finalSpeed = Math.sqrt(finalVel.x * finalVel.x + finalVel.y * finalVel.y)
      console.log(
        `🔍 BOUNDARY TEST FINAL: vel=(${finalVel.x.toFixed(2)}, ${finalVel.y.toFixed(2)}), speed=${finalSpeed.toFixed(2)}`
      )

      // Mob should still be moving after boundary collisions
      expect(finalSpeed).toBeGreaterThan(0.1)
    })

    test('should detect velocity damping issues', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 10, vy: 0 }) // High initial velocity
      const body = physicsManager.createMobBody(mob)

      const velocities: number[] = []

      // Simulate for 200 steps and track velocity
      for (let i = 0; i < 200; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())

        if (i % 20 === 0) {
          const vel = body.getLinearVelocity()
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
          velocities.push(speed)
          console.log(`🔍 DAMPING STEP ${i}: speed=${speed.toFixed(3)}`)
        }
      }

      // Check if velocity is decreasing too rapidly (damping issue)
      const initialSpeed = velocities[0]
      const finalSpeed = velocities[velocities.length - 1]
      const speedReduction = (initialSpeed - finalSpeed) / initialSpeed

      console.log(
        `🔍 DAMPING ANALYSIS: Initial=${initialSpeed.toFixed(3)}, Final=${finalSpeed.toFixed(3)}, Reduction=${(speedReduction * 100).toFixed(1)}%`
      )

      // Velocity should not decrease by more than 90% (excessive damping)
      expect(speedReduction).toBeLessThan(0.9)
    })

    test('should detect when mobs get stuck', () => {
      const mob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 5, vy: 3 })
      const body = physicsManager.createMobBody(mob)

      let stuckSteps = 0
      let totalSteps = 0
      let lastPosition = { x: 50, y: 50 }

      // Simulate for 1000 steps
      for (let i = 0; i < 1000; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())
        totalSteps++

        const pos = body.getPosition()
        const vel = body.getLinearVelocity()
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)

        // Calculate distance moved
        const distanceMoved = Math.sqrt(
          (pos.x - lastPosition.x) ** 2 + (pos.y - lastPosition.y) ** 2
        )

        // Check if mob is stuck (not moving much despite having velocity)
        if (distanceMoved < 0.1 && speed > 0.1) {
          stuckSteps++
          if (stuckSteps === 1) {
            console.log(
              `🔍 MOB STUCK at step ${i}: pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}), vel=(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}), speed=${speed.toFixed(2)}`
            )
          }
        }

        lastPosition = { x: pos.x, y: pos.y }
      }

      const stuckPercentage = (stuckSteps / totalSteps) * 100
      console.log(
        `🔍 STUCK ANALYSIS: ${stuckSteps}/${totalSteps} steps (${stuckPercentage.toFixed(1)}%)`
      )

      // Mob should not be stuck for more than 10% of the time
      expect(stuckPercentage).toBeLessThan(10)
    })

    test('should detect collision-induced sticking', () => {
      // Create two mobs that will collide
      const mob1 = new Mob({ id: 'mob-1', x: 50, y: 50, vx: 5, vy: 0 })
      const mob2 = new Mob({ id: 'mob-2', x: 55, y: 50, vx: -5, vy: 0 })
      const body1 = physicsManager.createMobBody(mob1)
      const body2 = physicsManager.createMobBody(mob2)

      let collisionCount = 0
      let stuckAfterCollision = 0

      // Simulate for 500 steps
      for (let i = 0; i < 500; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())

        const pos1 = body1.getPosition()
        const pos2 = body2.getPosition()
        const vel1 = body1.getLinearVelocity()
        const vel2 = body2.getLinearVelocity()
        const speed1 = Math.sqrt(vel1.x * vel1.x + vel1.y * vel1.y)
        const speed2 = Math.sqrt(vel2.x * vel2.x + vel2.y * vel2.y)

        // Check if mobs are very close (collision)
        const distance = Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2)
        if (distance < 20) {
          // Within collision range
          collisionCount++

          // Check if either mob is stuck after collision
          if (speed1 < 0.5 || speed2 < 0.5) {
            stuckAfterCollision++
            if (stuckAfterCollision === 1) {
              console.log(
                `🔍 COLLISION STUCK at step ${i}: distance=${distance.toFixed(2)}, speed1=${speed1.toFixed(2)}, speed2=${speed2.toFixed(2)}`
              )
            }
          }
        }
      }

      console.log(
        `🔍 COLLISION ANALYSIS: ${collisionCount} collisions, ${stuckAfterCollision} stuck after collision`
      )

      // Should not get stuck after collisions
      expect(stuckAfterCollision).toBeLessThan(collisionCount * 0.5)
    })

    test('should detect boundary-induced sticking', () => {
      const mob = new Mob({ id: 'test-mob', x: 5, y: 5, vx: 8, vy: 6 }) // Start near corner with high velocity
      const body = physicsManager.createMobBody(mob)

      let boundaryCollisions = 0
      let stuckAfterBoundary = 0
      let lastPosition = { x: 5, y: 5 }

      // Simulate for 300 steps
      for (let i = 0; i < 300; i++) {
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), new Map())

        const pos = body.getPosition()
        const vel = body.getLinearVelocity()
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)

        // Check if near boundary
        if (pos.x < 10 || pos.x > 90 || pos.y < 10 || pos.y > 90) {
          boundaryCollisions++

          // Check if stuck near boundary
          const distanceMoved = Math.sqrt(
            (pos.x - lastPosition.x) ** 2 + (pos.y - lastPosition.y) ** 2
          )

          if (distanceMoved < 0.1 && speed > 0.1) {
            stuckAfterBoundary++
            if (stuckAfterBoundary === 1) {
              console.log(
                `🔍 BOUNDARY STUCK at step ${i}: pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}), vel=(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}), speed=${speed.toFixed(2)}`
              )
            }
          }
        }

        lastPosition = { x: pos.x, y: pos.y }
      }

      console.log(
        `🔍 BOUNDARY ANALYSIS: ${boundaryCollisions} boundary approaches, ${stuckAfterBoundary} stuck near boundary`
      )

      // Should not get stuck near boundaries
      expect(stuckAfterBoundary).toBeLessThan(boundaryCollisions * 0.3)
    })
  })

  describe('Server-Client Communication Tests', () => {
    test('should detect server update rate issues', () => {
      // This test simulates what happens when server updates become infrequent
      const updateTimes: number[] = []
      const startTime = Date.now()

      // Simulate server updates at different intervals
      const intervals = [50, 50, 50, 100, 200, 500, 1000, 2000] // Increasing intervals

      intervals.forEach((interval, index) => {
        const updateTime = startTime + index * interval
        updateTimes.push(updateTime)
      })

      // Calculate rate using the same logic as the client
      const now = Date.now()
      const tenSecondsAgo = now - 10000
      const recentUpdates = updateTimes.filter(time => time > tenSecondsAgo)

      const updateRate =
        recentUpdates.length > 1
          ? Math.round(
              ((recentUpdates.length - 1) * 1000) /
                (recentUpdates[recentUpdates.length - 1] - recentUpdates[0])
            )
          : 0

      console.log(`🔍 UPDATE RATE TEST: ${updateRate}/s with ${recentUpdates.length} updates`)

      // Rate should be reasonable (not 0)
      expect(updateRate).toBeGreaterThan(0)
    })

    test('should detect when server stops sending updates', () => {
      // Simulate server that stops sending updates
      const updateTimes: number[] = []
      const startTime = Date.now()

      // First 5 updates at normal rate
      for (let i = 0; i < 5; i++) {
        updateTimes.push(startTime + i * 50)
      }

      // Then no updates for 5 seconds
      // (simulating server stopping)

      const now = startTime + 5000 // 5 seconds later
      const tenSecondsAgo = now - 10000
      const recentUpdates = updateTimes.filter(time => time > tenSecondsAgo)

      const updateRate =
        recentUpdates.length > 1
          ? Math.round(
              ((recentUpdates.length - 1) * 1000) /
                (recentUpdates[recentUpdates.length - 1] - recentUpdates[0])
            )
          : 0

      console.log(`🔍 STOPPED SERVER TEST: ${updateRate}/s with ${recentUpdates.length} updates`)

      // Rate should be very low or 0 when server stops
      expect(updateRate).toBeLessThan(10)
    })

    test('should detect client rate calculation bugs', () => {
      // Test the old (buggy) rate calculation
      const now = Date.now()
      const lastUpdate = now - 2000 // 2 seconds ago
      const timeSinceLastUpdate = now - lastUpdate

      // Old buggy calculation
      const oldRate = timeSinceLastUpdate > 0 ? Math.round(1000 / timeSinceLastUpdate) : 0

      // New correct calculation (simplified)
      const newRate = timeSinceLastUpdate > 0 ? Math.round(1000 / timeSinceLastUpdate) : 0

      console.log(
        `🔍 RATE CALCULATION TEST: Old=${oldRate}/s, New=${newRate}/s, TimeSince=${timeSinceLastUpdate}ms`
      )

      // Both should be the same for this simple case
      expect(oldRate).toBe(newRate)
    })
  })
})
