// Map configuration with different terrain types and friction zones

export interface TerrainZone {
  x: number;
  y: number;
  width: number;
  height: number;
  friction: number; // 0 = ice (no friction), 1 = normal, 2 = high friction
  name: string;
}

export const MAP_CONFIG = {
  // Define different terrain zones on the map
  terrainZones: [
    // Ice zone (low friction)
    {
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      friction: 0.2,
      name: 'ice'
    },
    // Normal zone (standard friction)
    {
      x: 200,
      y: 0,
      width: 200,
      height: 300,
      friction: 0.8,
      name: 'grass'
    },
    // Mud zone (high friction)
    {
      x: 0,
      y: 150,
      width: 200,
      height: 150,
      friction: 1.5,
      name: 'mud'
    },
    // Sand zone (medium friction)
    {
      x: 400,
      y: 0,
      width: 200,
      height: 300,
      friction: 1.2,
      name: 'sand'
    }
  ] as TerrainZone[],

  // Get friction coefficient for a position
  getFrictionAtPosition(x: number, y: number): number {
    for (const zone of MAP_CONFIG.terrainZones) {
      if (x >= zone.x && x <= zone.x + zone.width &&
          y >= zone.y && y <= zone.y + zone.height) {
        return zone.friction;
      }
    }
    // Default friction if not in any zone
    return 0.8;
  },

  // Get terrain name for a position
  getTerrainAtPosition(x: number, y: number): string {
    for (const zone of MAP_CONFIG.terrainZones) {
      if (x >= zone.x && x <= zone.x + zone.width &&
          y >= zone.y && y <= zone.y + zone.height) {
        return zone.name;
      }
    }
    return 'default';
  }
};
