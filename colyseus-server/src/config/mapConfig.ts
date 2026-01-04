// Map configuration with different terrain types and friction zones

export interface TerrainZone {
  x: number
  y: number
  width: number
  height: number
  friction: number // 0 = ice (no friction), 1 = normal, 2 = high friction
  name: string
}

export interface MobSpawnArea {
  id: string
  x: number
  y: number
  width: number
  height: number
  mobType: string // Must match an id in mobTypesConfig
  count: number // Number of mobs to maintain in this area
  spawnIntervalMs?: number // Optional override for spawn timing
}

export const MAP_CONFIG = {
  // Define mob spawn areas
  mobSpawnAreas: [
    // Center area - balanced mobs
    {
      id: 'center_courtyard',
      x: 350,
      y: 250,
      width: 300,
      height: 300,
      mobType: 'balanced',
      count: 3
    },
    {
      id: 'boss_area',
      x: 450,
      y: 350,
      width: 100,
      height: 100,
      mobType: 'double_attacker',
      count: 3
    },
    // North icy area - aggressive mobs
    {
      id: 'north_ice_fields',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      mobType: 'aggressive',
      count: 2
    },
    // South mud pit - defensive mobs
    {
      id: 'south_mud_pit',
      x: 100,
      y: 700,
      width: 250,
      height: 200,
      mobType: 'defensive',
      count: 2
    },
    // East sand dunes - spear throwers
    {
      id: 'east_dunes',
      x: 700,
      y: 300,
      width: 200,
      height: 400,
      mobType: 'spear_thrower',
      count: 4
    }
  ] as MobSpawnArea[],

  // Define different terrain zones on the map
  terrainZones: [
    // Ice zone (low friction)
    {
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      friction: 0.2,
      name: 'ice',
    },
    // Normal zone (standard friction)
    {
      x: 200,
      y: 0,
      width: 200,
      height: 300,
      friction: 0.8,
      name: 'grass',
    },
    // Mud zone (high friction)
    {
      x: 0,
      y: 150,
      width: 200,
      height: 150,
      friction: 1.5,
      name: 'mud',
    },
    // Sand zone (medium friction)
    {
      x: 400,
      y: 0,
      width: 200,
      height: 300,
      friction: 1.2,
      name: 'sand',
    },
  ] as TerrainZone[],

  // Get friction coefficient for a position
  getFrictionAtPosition(x: number, y: number): number {
    for (const zone of MAP_CONFIG.terrainZones) {
      if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) {
        return zone.friction
      }
    }
    // Default friction if not in any zone
    return 0.8
  },

  // Get terrain name for a position
  getTerrainAtPosition(x: number, y: number): string {
    for (const zone of MAP_CONFIG.terrainZones) {
      if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) {
        return zone.name
      }
    }
    return 'default'
  },
}
