// Game configuration constants
const tickRate = 50
const serverFPS = 1000/50
export const GAME_CONFIG = {
  serverFPS,
  tickRate, // ms per tick (1000 / serverFPS)
  worldWidth: 100,
  worldHeight: 100,
  mobCount: 5, // Reduced for debugging
  mobSpeedRange: 60, // pixels per second (3x faster)
  mobSpawnMargin: 10, // pixels from edges
} as const;
