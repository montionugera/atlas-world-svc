/**
 * Client mirror of the terrain tables in server-rs/src/content/map.rs
 * (`TerrainType::speed_multiplier`, `MapConfig::load` terrain_zones).
 * The wire protocol carries no terrain, so these must be kept in step by hand;
 * the debug readout's measured speed is the server's truth, this is the expectation.
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
    zone("ice", 0, 0, 1000, 250),
    zone("forest", 680, 240, 320, 520),
    zone("sand", 540, 390, 150, 220),
    zone("mud", 390, 590, 230, 170),
    zone("road", 485, 0, 30, 390),
    zone("road", 485, 610, 30, 390),
    zone("road", 0, 485, 390, 30),
    zone("road", 610, 485, 390, 30),
    zone("road", 390, 390, 220, 220),
    // Town trade road and bridge (the river itself is visual only: no speed effect).
    zone("road", 0, 172, 195, 16),
    zone("road", 188, 170, 30, 20),
  ],
  // Six 150-wide strips, y 0..700, from x=50: TerrainType::ALL order.
  "map-for-test-terrain": [
    zone("road", 50, 0, 150, 700),
    zone("grass", 200, 0, 150, 700),
    zone("forest", 350, 0, 150, 700),
    zone("sand", 500, 0, 150, 700),
    zone("ice", 650, 0, 150, 700),
    zone("mud", 800, 0, 150, 700),
  ],
  "map-for-test-projectile": [],
  "map-for-test-deflect": [],
};

/** Solid blocks (server `static_obstacles`) worth drawing on the plain test maps. */
export interface StaticBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STATIC_BLOCKS_BY_MAP: Record<string, readonly StaticBlock[]> = {
  "map-for-test-terrain": [
    { x: 300, y: 760, width: 40, height: 40 },
    { x: 660, y: 760, width: 40, height: 40 },
  ],
};

export function staticBlocksFor(mapId: string): readonly StaticBlock[] {
  return STATIC_BLOCKS_BY_MAP[mapId] ?? [];
}

/**
 * Walking speed of a player with 0 AGI on grass: server `(20 + 0.2 * agi) * 10`
 * (content/stats.rs, simulation.rs). AGI is not on the wire, so expected speeds
 * built from this are a reference, low by 2 u/s per AGI point.
 */
export const REFERENCE_RUN_SPEED = 200;

/** Zones for a map, or null when the client has no terrain data for it. */
export function terrainZonesFor(mapId: string): readonly TerrainZone[] | null {
  return TERRAIN_ZONES_BY_MAP[mapId] ?? null;
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
