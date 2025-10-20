// Physics engine configuration constants
export const PHYSICS_CONFIG = {
  // Planck.js engine settings
  engine: {
    gravity: { x: 0, y: 0 }, // Zero gravity for top-down game
    timeStep: 1 / 60, // 60 FPS physics step
    velocityIterations: 6,
    positionIterations: 2,
  },

  // World boundaries
  world: {
    width: 100,
    height: 100,
    boundaryThickness: 5,
  },

  // Entity physics properties
  entities: {
    player: {
      radius: 4,
      mass: 1,
      friction: 0.1,
      frictionAir: 0.01,
      restitution: 0.3, // Bounce factor
      density: 0.001,
      collisionFilter: {
        category: 0x0001, // PLAYER category
        mask: 0x0002 | 0x0004, // Collide with MOB and BOUNDARY
        group: 0,
      },
    },
    mob: {
      radius: 4,
      mass: 0.8,
      friction: 0.1, // Low friction for smooth movement
      frictionAir: 0.01, // Low air resistance
      restitution: 0.8, // High bounce for collision response
      density: 1.0,
      collisionFilter: {
        category: 0x0002, // MOB category
        mask: 0x0001 | 0x0004, // Collide with PLAYER and BOUNDARY
        group: 0,
      },
    },
    boundary: {
      isStatic: true,
      collisionFilter: {
        category: 0x0004, // BOUNDARY category
        mask: 0x0001 | 0x0002, // Collide with PLAYER and MOB
        group: 0,
      },
    },
  },

  // Collision categories (bit flags)
  collisionCategories: {
    PLAYER: 0x0001,
    MOB: 0x0002,
    BOUNDARY: 0x0004,
    PROJECTILE: 0x0008,
    POWERUP: 0x0010,
  },

  // Physics update settings
  update: {
    deltaTime: 16.67, // ~60 FPS
    maxDeltaTime: 50, // Prevent large time jumps
    iterations: 6, // Physics solver iterations
    positionIterations: 4,
    velocityIterations: 4,
  },

  // Performance settings
  performance: {
    enableBroadphase: true,
    broadphase: 'SAP', // Sweep and Prune
    enableSleeping: false,
    enableFriction: true,
    enableRestitution: true,
  },
} as const

// Physics event types
export const PHYSICS_EVENTS = {
  COLLISION_START: 'collisionStart',
  COLLISION_ACTIVE: 'collisionActive',
  COLLISION_END: 'collisionEnd',
  AFTER_UPDATE: 'afterUpdate',
  BEFORE_UPDATE: 'beforeUpdate',
} as const

// Helper function to create collision filter
export function createCollisionFilter(category: number, mask?: number, group?: number) {
  return {
    category,
    mask: mask || 0xffffffff,
    group: group || 0,
  }
}

// Helper function to check if two categories should collide
export function shouldCollide(
  categoryA: number,
  categoryB: number,
  maskA: number,
  maskB: number
): boolean {
  return (categoryA & maskB) !== 0 && (categoryB & maskA) !== 0
}
