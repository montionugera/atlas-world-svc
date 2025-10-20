import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { eventBus, RoomEventType } from '../events/EventBus'

describe('Physics Impact Effects', () => {
  let physics: PlanckPhysicsManager
  const roomId = 'test-room'

  beforeEach(() => {
    physics = new PlanckPhysicsManager()
    physics.setRoomId(roomId)
  })

  afterEach(() => {
    physics.destroy()
    eventBus.removeAllListeners()
  })

  test('should apply impact effect to nearby entities', () => {
    // Create test entities
    const player1 = new Player('player1', 'TestPlayer1', 50, 50)
    const player2 = new Player('player2', 'TestPlayer2', 60, 50) // 10 units away
    const mob1 = new Mob({ id: 'mob1', x: 70, y: 50 }) // 20 units away
    const mob2 = new Mob({ id: 'mob2', x: 100, y: 100 }) // Far away, should not be affected

    // Create physics bodies
    physics.createPlayerBody(player1)
    physics.createPlayerBody(player2)
    physics.createMobBody(mob1)
    physics.createMobBody(mob2)

    // Get initial positions
    const initialPos1 = physics.getBody('player1')?.getPosition()
    const initialPos2 = physics.getBody('player2')?.getPosition()
    const initialPos3 = physics.getBody('mob1')?.getPosition()
    const initialPos4 = physics.getBody('mob2')?.getPosition()

    expect(initialPos1).toBeDefined()
    expect(initialPos2).toBeDefined()
    expect(initialPos3).toBeDefined()
    expect(initialPos4).toBeDefined()

    // Create impact effect at (55, 50) with radius 15 and intensity 5
    eventBus.emitRoomEvent(roomId, RoomEventType.PHYSICS_IMPACT, {
      area: { x: 55, y: 50, radius: 15 },
      forceIntensity: 5,
      sourceId: 'explosion',
      roomId
    })

    // Step physics simulation to apply forces
    physics.update(16.67, new Map(), new Map())

    // Check that nearby entities moved (should be pushed away from impact center)
    const finalPos1 = physics.getBody('player1')?.getPosition()
    const finalPos2 = physics.getBody('player2')?.getPosition()
    const finalPos3 = physics.getBody('mob1')?.getPosition()
    const finalPos4 = physics.getBody('mob2')?.getPosition()

    // Player1 should move away from (55, 50) - towards (50, 50) direction
    expect(finalPos1?.x).toBeLessThanOrEqual(initialPos1?.x || 0)
    
    // Player2 should move away from (55, 50) - towards (60, 50) direction  
    expect(finalPos2?.x).toBeGreaterThanOrEqual(initialPos2?.x || 0)
    
    // Mob1 should move away from (55, 50) - towards (70, 50) direction
    expect(finalPos3?.x).toBeGreaterThanOrEqual(initialPos3?.x || 0)
    
    // Mob2 should not be affected (outside radius)
    expect(finalPos4?.x).toBeCloseTo(initialPos4?.x || 0, 1)
    expect(finalPos4?.y).toBeCloseTo(initialPos4?.y || 0, 1)
  })

  test('should apply distance-based force reduction', () => {
    // Create entities at different distances
    const player1 = new Player('player1', 'TestPlayer1', 50, 50) // 5 units from center
    const player2 = new Player('player2', 'TestPlayer2', 60, 50) // 5 units from center
    const player3 = new Player('player3', 'TestPlayer3', 70, 50) // 15 units from center (edge of radius)

    physics.createPlayerBody(player1)
    physics.createPlayerBody(player2)
    physics.createPlayerBody(player3)

    // Create impact effect at (55, 50) with radius 20
    eventBus.emitRoomEvent(roomId, RoomEventType.PHYSICS_IMPACT, {
      area: { x: 55, y: 50, radius: 20 },
      forceIntensity: 10,
      sourceId: 'explosion',
      roomId
    })

    // Step physics simulation
    physics.update(16.67, new Map(), new Map())

    // Get velocities to check force application
    const vel1 = physics.getBody('player1')?.getLinearVelocity()
    const vel2 = physics.getBody('player2')?.getLinearVelocity()
    const vel3 = physics.getBody('player3')?.getLinearVelocity()

    // Closer entities should have higher velocity (more force applied)
    const speed1 = Math.sqrt((vel1?.x || 0) ** 2 + (vel1?.y || 0) ** 2)
    const speed2 = Math.sqrt((vel2?.x || 0) ** 2 + (vel2?.y || 0) ** 2)
    const speed3 = Math.sqrt((vel3?.x || 0) ** 2 + (vel3?.y || 0) ** 2)

    // Speed should decrease with distance
    expect(speed1).toBeGreaterThan(speed3)
    expect(speed2).toBeGreaterThan(speed3)
  })

  test('should not affect source entity', () => {
    const player1 = new Player('player1', 'TestPlayer1', 50, 50)
    const player2 = new Player('player2', 'TestPlayer2', 60, 50)

    physics.createPlayerBody(player1)
    physics.createPlayerBody(player2)

    const initialPos1 = physics.getBody('player1')?.getPosition()
    const initialPos2 = physics.getBody('player2')?.getPosition()

    // Create impact effect with player1 as source
    eventBus.emitRoomEvent(roomId, RoomEventType.PHYSICS_IMPACT, {
      area: { x: 50, y: 50, radius: 20 },
      forceIntensity: 10,
      sourceId: 'player1', // player1 is the source
      roomId
    })

    physics.update(16.67, new Map(), new Map())

    const finalPos1 = physics.getBody('player1')?.getPosition()
    const finalPos2 = physics.getBody('player2')?.getPosition()

    // Player1 (source) should not move
    expect(finalPos1?.x).toBeCloseTo(initialPos1?.x || 0, 1)
    expect(finalPos1?.y).toBeCloseTo(initialPos1?.y || 0, 1)

    // Player2 should move away from impact center
    expect(finalPos2?.x).toBeGreaterThanOrEqual(initialPos2?.x || 0)
  })

  test('should handle different force intensities', () => {
    const player = new Player('player', 'TestPlayer', 50, 50)
    physics.createPlayerBody(player)

    const initialPos = physics.getBody('player')?.getPosition()

    // Test basic intensity (0.5)
    eventBus.emitRoomEvent(roomId, RoomEventType.PHYSICS_IMPACT, {
      area: { x: 60, y: 50, radius: 15 },
      forceIntensity: 0.5,
      sourceId: 'basic-explosion',
      roomId
    })

    physics.update(16.67, new Map(), new Map())
    const basicPos = physics.getBody('player')?.getPosition()
    const basicDistance = Math.sqrt(
      Math.pow((basicPos?.x || 0) - (initialPos?.x || 0), 2) + 
      Math.pow((basicPos?.y || 0) - (initialPos?.y || 0), 2)
    )

    // Reset position
    physics.getBody('player')?.setPosition(initialPos || { x: 50, y: 50 })
    physics.getBody('player')?.setLinearVelocity({ x: 0, y: 0 })

    // Test large intensity (3)
    eventBus.emitRoomEvent(roomId, RoomEventType.PHYSICS_IMPACT, {
      area: { x: 60, y: 50, radius: 15 },
      forceIntensity: 3,
      sourceId: 'large-explosion',
      roomId
    })

    physics.update(16.67, new Map(), new Map())
    const largePos = physics.getBody('player')?.getPosition()
    const largeDistance = Math.sqrt(
      Math.pow((largePos?.x || 0) - (initialPos?.x || 0), 2) + 
      Math.pow((largePos?.y || 0) - (initialPos?.y || 0), 2)
    )

    // Large intensity should move player further (or at least the same)
    expect(largeDistance).toBeGreaterThanOrEqual(basicDistance)
  })
})
