export interface TerrainZone {
  x: number;
  y: number;
  width: number;
  height: number;
  friction: number;
  name: string;
}

export interface MobSpawnArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mobType: string;
  count: number;
  spawnIntervalMs?: number;
}

export interface MapConfig {
  mobSpawnAreas: MobSpawnArea[];
  terrainZones: TerrainZone[];
}
