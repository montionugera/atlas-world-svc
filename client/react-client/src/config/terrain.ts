import generatedWorldMaps from "../data/generatedWorldMaps.json";

/**
 * Client mirror of the terrain tables in server-rs/src/content/map.rs
 * (`TerrainType::speed_multiplier`, `MapConfig::load` terrain_zones) plus
 * shared generated-world obstacles and spawn areas from `generatedWorldMaps.json`.
 */
export type TerrainTypeId =
  "road" | "grass" | "forest" | "sand" | "ice" | "mud";

export interface TerrainTypeDef {
  id: TerrainTypeId;
  label: string;
  /** Debug colour, chosen to be told apart at a glance (not art). */
  color: string;
  /** Multiplier on voluntary movement speed; dash and knockback are not scaled. */
  speedMultiplier: number;
}

export const TERRAIN_TYPES: Record<TerrainTypeId, TerrainTypeDef> = {
  road: { id: "road", label: "Road", color: "#c8ccd4", speedMultiplier: 1.3 },
  grass: {
    id: "grass",
    label: "Grass",
    color: "#43a047",
    speedMultiplier: 1.0,
  },
  forest: {
    id: "forest",
    label: "Forest",
    color: "#0f766e",
    speedMultiplier: 0.8,
  },
  sand: { id: "sand", label: "Sand", color: "#e6c35c", speedMultiplier: 0.7 },
  ice: { id: "ice", label: "Ice", color: "#7fd8ff", speedMultiplier: 0.6 },
  mud: { id: "mud", label: "Mud", color: "#8d5a2b", speedMultiplier: 0.5 },
};

export interface TerrainZone {
  terrain: TerrainTypeId;
  x: number;
  y: number;
  width: number;
  height: number;
}

const zone = (
  terrain: TerrainTypeId,
  x: number,
  y: number,
  width: number,
  height: number,
): TerrainZone => ({ terrain, x, y, width, height });

/** Paint order matters: later zones cover earlier ones. Uncovered ground is grass. */
const TERRAIN_ZONES_BY_MAP: Record<string, readonly TerrainZone[]> = {
  "map-for-play": [
    zone("ice", 0, 0, 100, 25),
    zone("forest", 68, 24, 32, 52),
    zone("sand", 54, 39, 15, 22),
    zone("mud", 39, 59, 23, 17),
    zone("road", 48.5, 0, 3, 39),
    zone("road", 48.5, 61, 3, 39),
    zone("road", 0, 48.5, 39, 3),
    zone("road", 61, 48.5, 39, 3),
    zone("road", 39, 39, 22, 22),
    // Town trade road and bridge (the river itself is visual only: no speed effect).
    zone("road", 0, 17.2, 19.5, 1.6),
    zone("road", 18.8, 17, 3, 2),
  ],
  // Six 150-wide strips, y 0..700, from x=50: TerrainType::ALL order.
  "map-for-test-terrain": [
    zone("road", 5, 0, 15, 70),
    zone("grass", 20, 0, 15, 70),
    zone("forest", 35, 0, 15, 70),
    zone("sand", 50, 0, 15, 70),
    zone("ice", 65, 0, 15, 70),
    zone("mud", 80, 0, 15, 70),
  ],
  "map-for-test-projectile": [],
  "map-for-test-deflect": [],
  // `MapConfig::large_test_map`: biome patches, then the roads over everything.
  "map-for-test-large": [
    zone("ice", 0, 0, 140, 80),
    zone("ice", 260, 320, 140, 80),
    zone("ice", 150, 30, 90, 50),
    zone("forest", 270, 10, 120, 110),
    zone("forest", 10, 270, 110, 120),
    zone("forest", 140, 310, 90, 70),
    zone("sand", 10, 110, 80, 120),
    zone("sand", 310, 150, 80, 130),
    zone("sand", 220, 220, 60, 60),
    zone("mud", 120, 120, 60, 60),
    zone("mud", 220, 110, 70, 50),
    zone("mud", 110, 220, 70, 70),
    // The cross, the ring, the plaza.
    zone("road", 197, 0, 6, 400),
    zone("road", 0, 197, 400, 6),
    zone("road", 100, 97, 200, 6),
    zone("road", 100, 297, 200, 6),
    zone("road", 97, 100, 6, 200),
    zone("road", 297, 100, 6, 200),
    zone("road", 185, 185, 30, 30),
  ],
};

/** Solid blocks (server `static_obstacles`) worth drawing on the plain/generated maps. */
export interface StaticBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapSpawnAreaDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mobType: string;
  count: number;
}

type GeneratedRegionEntry = {
  id: string;
  name: string;
  width: number;
  height: number;
  playerSpawn: { x: number; y: number };
  staticObstacles: {
    id: string;
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
  }[];
  spawnAreas: MapSpawnAreaDef[];
};

const GENERATED_REGIONS = generatedWorldMaps.regions as Record<
  string,
  GeneratedRegionEntry
>;

const STATIC_BLOCKS_BY_MAP: Record<string, readonly StaticBlock[]> = {
  "map-for-test-terrain": [
    { x: 30, y: 76, width: 4, height: 4 },
    { x: 66, y: 76, width: 4, height: 4 },
  ],
  // Four clusters of four 40x40 blocks, one inside each corner of the ring road.
  "map-for-test-large": [
    [120, 120],
    [280, 120],
    [120, 280],
    [280, 280],
  ].flatMap(([cx, cy]) =>
    [
      [0, 0],
      [9, 2],
      [3, 10],
      [13, 11],
    ].map(([dx, dy]) => ({ x: cx + dx, y: cy + dy, width: 4, height: 4 })),
  ),
  ...Object.fromEntries(
    Object.entries(GENERATED_REGIONS).map(([regionId, region]) => [
      regionId,
      region.staticObstacles.map((obs) => ({
        x: obs.min_x,
        y: obs.min_y,
        width: Number((obs.max_x - obs.min_x).toFixed(1)),
        height: Number((obs.max_y - obs.min_y).toFixed(1)),
      })),
    ]),
  ),
};

export function staticBlocksFor(mapId: string): readonly StaticBlock[] {
  return STATIC_BLOCKS_BY_MAP[mapId] ?? [];
}

/** Spawn areas derived directly from the shared generated world-map manifest. */
export function spawnAreasFor(mapId: string): readonly MapSpawnAreaDef[] {
  if (mapId === "map-for-play") {
    return generatedWorldMaps.playMapSpawnAreas;
  }
  return GENERATED_REGIONS[mapId]?.spawnAreas ?? [];
}

/** Authoritative player spawn point derived from the shared generated world-map manifest. */
export function playerSpawnFor(mapId: string): { x: number; y: number } | null {
  if (mapId === "map-for-play") {
    return generatedWorldMaps.playMapPlayerSpawn;
  }
  return GENERATED_REGIONS[mapId]?.playerSpawn ?? null;
}

/**
 * Walking speed of a player with 0 AGI on grass: server `10 * (20 + 0.2 * agi) * SPEED_SCALE`
 * (content/stats.rs, core/speed.rs, F-185: 1 u = 1 m, 3 m/s = 3 u/s). AGI is not on the wire, so expected
 * speeds built from this are a reference, low by 0.03 u/s per AGI point.
 */
export const REFERENCE_RUN_SPEED = 3;

/** Zones for a map, or null when the client has no terrain data for it. */
export function terrainZonesFor(mapId: string): readonly TerrainZone[] | null {
  if (mapId in TERRAIN_ZONES_BY_MAP) {
    return TERRAIN_ZONES_BY_MAP[mapId];
  }
  if (mapId in GENERATED_REGIONS) {
    return TERRAIN_ZONES_BY_MAP["map-for-play"];
  }
  return null;
}

/** Terrain under a world point (min edge inclusive, max edge exclusive, like the server). */
export function terrainAt(
  zones: readonly TerrainZone[],
  x: number,
  y: number,
): TerrainTypeDef {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (x >= z.x && x < z.x + z.width && y >= z.y && y < z.y + z.height) {
      return TERRAIN_TYPES[z.terrain];
    }
  }
  return TERRAIN_TYPES.grass;
}

export interface TerrainLegendEntry extends TerrainTypeDef {
  multiplierText: string;
}

/** Every terrain type, fastest first. */
export function terrainLegend(): TerrainLegendEntry[] {
  return Object.values(TERRAIN_TYPES)
    .sort((a, b) => b.speedMultiplier - a.speedMultiplier)
    .map((t) => ({ ...t, multiplierText: `x${t.speedMultiplier.toFixed(2)}` }));
}
