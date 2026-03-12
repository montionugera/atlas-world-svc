import { GAME_CONFIG } from './gameConfig'

// Global gravity constant for projectile physics (simulated in 2D top-down)
export const PROJECTILE_GRAVITY = 7 // units/sec²

// Collision categories (bit flags)
export const COLLISION_CATEGORIES = {
  PLAYER: 0x0001,
  MOB: 0x0002,
  BOUNDARY: 0x0004,
  PROJECTILE: 0x0008,
  POWERUP: 0x0010,
  NPC: 0x0020,
} as const

// Physics engine configuration constants
export const PHYSICS_CONFIG = {
  // Planck.js engine settings
  engine: {
    gravity: { x: 0, y: 0 }, // Zero gravity for top-down game (Planck world)
    timeStep: 1 / 60, // 60 FPS physics step
    velocityIterations: 6,
    positionIterations: 2,
  },

  // World boundaries
  world: {
    width: GAME_CONFIG.worldWidth,
    height: GAME_CONFIG.worldHeight,
    boundaryThickness: 5,
  },

  // Entity physics properties
  entities: {
    player: {
      radius: 1.3, // Player radius must not exceed 1.3
      mass: 1,
      friction: 0.1,
      frictionAir: 0.01,
      restitution: 0.3, // Bounce factor
      density: 0.001,
      collisionFilter: {
        category: COLLISION_CATEGORIES.PLAYER,
        mask: COLLISION_CATEGORIES.MOB | COLLISION_CATEGORIES.BOUNDARY | COLLISION_CATEGORIES.PROJECTILE,
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
        category: COLLISION_CATEGORIES.MOB,
        mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.BOUNDARY | COLLISION_CATEGORIES.PROJECTILE | COLLISION_CATEGORIES.NPC,
        group: 0,
      },
    },
    npc: {
      radius: 3,
      mass: 0.8,
      friction: 0.1,
      frictionAir: 0.01,
      restitution: 0.3, // Match player bounce
      density: 1.0,
      collisionFilter: {
        category: COLLISION_CATEGORIES.NPC,
        mask: COLLISION_CATEGORIES.MOB | COLLISION_CATEGORIES.BOUNDARY | COLLISION_CATEGORIES.PROJECTILE, // No PLAYER collision
        group: 0,
      },
    },
    boundary: {
      isStatic: true,
      collisionFilter: {
        category: COLLISION_CATEGORIES.BOUNDARY,
        mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.MOB | COLLISION_CATEGORIES.PROJECTILE,
        group: 0,
      },
    },
    projectile: {
      radius: 0.5,
      mass: 0.1,
      friction: 0,
      frictionAir: 0,
      restitution: 0, // No bounce
      density: 0.1,
      collisionFilter: {
        category: COLLISION_CATEGORIES.PROJECTILE,
        mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.MOB | COLLISION_CATEGORIES.BOUNDARY | COLLISION_CATEGORIES.PROJECTILE,
        group: 0,
      },
    },
  },

  // Collision categories (bit flags)
  collisionCategories: COLLISION_CATEGORIES,

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
