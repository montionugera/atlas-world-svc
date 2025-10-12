// Game configuration constants
const tickRate = 50
const serverFPS = 1000/50
export const GAME_CONFIG = {
  serverFPS,
  tickRate, // ms per tick (1000 / serverFPS)
  worldWidth: 100,
  worldHeight: 100,
  mobCount: 1, // Reduced for debugging
  mobSpeedRange: 60, // pixels per second (3x faster)
  mobSpawnMargin: 10, // pixels from edges
  
  // Impulse calculation constants
  attackImpulseMultiplier: 0.5, // Impulse = damage * multiplier
  recoilImpulseMultiplier: 0.2, // Recoil = damage * multiplier
  minImpulse: 1, // Minimum impulse force
  maxImpulse: 20, // Maximum impulse force
} as const;
