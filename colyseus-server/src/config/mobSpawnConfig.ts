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
    desiredCount: 1, // DEBUG: Only 1 mob for debugging
    maxMobs: 1, // DEBUG: Only 1 mob for debugging
    spawnIntervalMs: 800,
    respawnDelayMs: 5000, // 5 seconds for this map
  },
}

export function getMobSettingsForMap(mapId: string): MobSpawnSettings {
  const override = MAP_MOB_SETTINGS[mapId] || {}
  return { ...DEFAULT_SETTINGS, ...override }
}


