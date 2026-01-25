// Game configuration constants
const tickRate = 50 // ms per tick
const serverFPS = 1000 / 50
export const GAME_CONFIG = {
  serverFPS,
  tickRate, // ms per tick (1000 / serverFPS)
  worldWidth: 1000,
  worldHeight: 1000,
  mobCount: 1, // Reduced for debugging
  mobSpeedRange: 60, // pixels per second (3x faster)
  mobSpawnMargin: 10, // pixels from edges

  // Impulse calculation constants
  // Impulse calculation constants
  attackImpulseMultiplier: 20, // Impulse = damage * multiplier (Doubled to 20 for impactful knockback)
  recoilImpulseMultiplier: 10, // Recoil = damage * multiplier
  minImpulse: 1, // Minimum impulse force
  maxImpulse: 2000, // Maximum impulse force
} as const
