// Game configuration constants
const tickRate = 50
const serverFPS = 1000/50
export const GAME_CONFIG = {
  serverFPS,
  tickRate, // ms per tick (1000 / serverFPS)
  worldWidth: 100,
  worldHeight: 100,
  mobCount: 25,
  mobSpeedRange: 2, // pixels per second
  mobSpawnMargin: 10, // pixels from edges
} as const;
