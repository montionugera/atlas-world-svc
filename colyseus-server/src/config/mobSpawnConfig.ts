export interface MobSpawnSettings {
  desiredCount: number
  maxMobs?: number
  autoSpawn: boolean
  spawnIntervalMs: number
  batchSize?: number
  spawnMargin?: number
  respawnDelayMs?: number // Delay before removing dead mobs (default: 5000ms)
}

const DEFAULT_SETTINGS: MobSpawnSettings = {
  desiredCount: 5,
  maxMobs: 8,
  autoSpawn: true,
  spawnIntervalMs: 1000,
  batchSize: 1,
  respawnDelayMs: 5000, // 5 seconds default
}

// Per-map overrides
const MAP_MOB_SETTINGS: Record<string, Partial<MobSpawnSettings>> = {
  'map-01-sector-a': {
    desiredCount: 5,
    maxMobs: 8,
    spawnIntervalMs: 800,
    respawnDelayMs: 5000, // 5 seconds for this map
  },
  // Frontend "map-for-play" uses the same mob tuning as the old map-01-sector-a
  'map-for-play': {
    desiredCount: 5,
    maxMobs: 8,
    spawnIntervalMs: 800,
    respawnDelayMs: 5000,
  },
  // Projectile-only test map (used by the frontend map picker)
  'map-for-test-projectile': {
    desiredCount: 6,
    maxMobs: 10,
    spawnIntervalMs: 900,
    respawnDelayMs: 5000,
  },
}

export function getMobSettingsForMap(mapId: string): MobSpawnSettings {
  const override = MAP_MOB_SETTINGS[mapId] || {}
  return { ...DEFAULT_SETTINGS, ...override }
}


