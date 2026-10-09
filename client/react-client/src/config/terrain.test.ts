import {
  REFERENCE_RUN_SPEED,
  TERRAIN_TYPES,
  TerrainZone,
  staticBlocksFor,
  terrainAt,
  terrainLegend,
  terrainZonesFor,
} from "./terrain";

const zones: TerrainZone[] = [
  { terrain: "ice", x: 0, y: 0, width: 100, height: 50 },
  { terrain: "road", x: 40, y: 0, width: 20, height: 100 },
];

describe("terrainAt", () => {
  it("returns the zone containing the point", () => {
    expect(terrainAt(zones, 10, 10).id).toBe("ice");
  });

  it("lets a later zone paint over an earlier one (server order)", () => {
    expect(terrainAt(zones, 50, 10).id).toBe("road");
  });

  it("is grass where no zone covers the ground", () => {
    expect(terrainAt(zones, 10, 90).id).toBe("grass");
    expect(terrainAt([], 0, 0).id).toBe("grass");
  });

  it("includes the min edge and excludes the max edge, like the server", () => {
    expect(terrainAt(zones, 0, 0).id).toBe("ice");
    expect(terrainAt(zones, 39.999, 49.999).id).toBe("ice");
    expect(terrainAt(zones, 10, 50).id).toBe("grass");
    expect(terrainAt(zones, 100, 10).id).toBe("grass");
    expect(terrainAt(zones, 60, 10).id).toBe("ice");
  });

  it("is grass for non-finite positions", () => {
    expect(terrainAt(zones, NaN, 10).id).toBe("grass");
  });
});

describe("terrain tables", () => {
  it("gives every terrain type a distinct colour and a positive multiplier", () => {
    const defs = Object.values(TERRAIN_TYPES);
    expect(new Set(defs.map((d) => d.color)).size).toBe(defs.length);
    for (const d of defs) expect(d.speedMultiplier).toBeGreaterThan(0);
    expect(TERRAIN_TYPES.grass.speedMultiplier).toBe(1);
  });

  it("legend lists every type fastest first with its multiplier text", () => {
    const legend = terrainLegend();
    expect(legend.length).toBe(Object.keys(TERRAIN_TYPES).length);
    const mults = legend.map((l) => l.speedMultiplier);
    expect(mults).toEqual([...mults].sort((a, b) => b - a));
    expect(legend[0]).toEqual({
      id: "road",
      label: "Road",
      color: TERRAIN_TYPES.road.color,
      speedMultiplier: 1.3,
      multiplierText: "x1.30",
    });
  });

  it("has zones for every known room and none for unknown rooms", () => {
    expect(terrainZonesFor("map-for-test-projectile")).toEqual([]);
    expect(terrainZonesFor("map-for-test-deflect")).toEqual([]);
    expect(terrainZonesFor("map-nope")).toBeNull();
  });
});

// Nothing on the wire carries terrain: these tables are a hand-kept copy of
// server-rs/src/content/map.rs (`TerrainType::speed_multiplier`, `MapConfig::load`).
// If the server changes, this test must be changed with it.
describe("client terrain tables match server-rs/src/content/map.rs", () => {
  const rects = (mapId: string) =>
    (terrainZonesFor(mapId) ?? []).map((z) => [
      z.terrain,
      z.x,
      z.y,
      z.width,
      z.height,
    ]);

  it("speed multipliers", () => {
    expect(
      Object.fromEntries(
        Object.values(TERRAIN_TYPES).map((t) => [t.id, t.speedMultiplier]),
      ),
    ).toEqual({
      road: 1.3,
      grass: 1,
      forest: 0.8,
      sand: 0.7,
      ice: 0.6,
      mud: 0.5,
    });
  });

  it("map-for-play zones, in paint order", () => {
    expect(rects("map-for-play")).toEqual([
      ["ice", 0, 0, 1000, 250],
      ["forest", 680, 240, 320, 520],
      ["sand", 540, 390, 150, 220],
      ["mud", 390, 590, 230, 170],
      ["road", 485, 0, 30, 390],
      ["road", 485, 610, 30, 390],
      ["road", 0, 485, 390, 30],
      ["road", 610, 485, 390, 30],
      ["road", 390, 390, 220, 220],
      ["road", 0, 172, 195, 16],
      ["road", 188, 170, 30, 20],
    ]);
  });

  it("map-for-test-terrain strips and blocks", () => {
    expect(rects("map-for-test-terrain")).toEqual([
      ["road", 50, 0, 150, 700],
      ["grass", 200, 0, 150, 700],
      ["forest", 350, 0, 150, 700],
      ["sand", 500, 0, 150, 700],
      ["ice", 650, 0, 150, 700],
      ["mud", 800, 0, 150, 700],
    ]);
    expect(staticBlocksFor("map-for-test-terrain")).toEqual([
      { x: 300, y: 760, width: 40, height: 40 },
      { x: 660, y: 760, width: 40, height: 40 },
    ]);
    expect(staticBlocksFor("map-for-play")).toEqual([]);
  });

  it("map-for-test-large zones (MapConfig::large_test_map), in paint order", () => {
    expect(rects("map-for-test-large")).toEqual([
      ["ice", 0, 0, 1400, 800],
      ["ice", 2600, 3200, 1400, 800],
      ["ice", 1500, 300, 900, 500],
      ["forest", 2700, 100, 1200, 1100],
      ["forest", 100, 2700, 1100, 1200],
      ["forest", 1400, 3100, 900, 700],
      ["sand", 100, 1100, 800, 1200],
      ["sand", 3100, 1500, 800, 1300],
      ["sand", 2200, 2200, 600, 600],
      ["mud", 1200, 1200, 600, 600],
      ["mud", 2200, 1100, 700, 500],
      ["mud", 1100, 2200, 700, 700],
      ["road", 1970, 0, 60, 4000],
      ["road", 0, 1970, 4000, 60],
      ["road", 1000, 970, 2000, 60],
      ["road", 1000, 2970, 2000, 60],
      ["road", 970, 1000, 60, 2000],
      ["road", 2970, 1000, 60, 2000],
      ["road", 1850, 1850, 300, 300],
    ]);
  });

  it("map-for-test-large blocks: four clusters of four", () => {
    const blocks = staticBlocksFor("map-for-test-large");
    expect(blocks.map((b) => [b.x, b.y])).toEqual([
      [1200, 1200],
      [1290, 1220],
      [1230, 1300],
      [1330, 1310],
      [2800, 1200],
      [2890, 1220],
      [2830, 1300],
      [2930, 1310],
      [1200, 2800],
      [1290, 2820],
      [1230, 2900],
      [1330, 2910],
      [2800, 2800],
      [2890, 2820],
      [2830, 2900],
      [2930, 2910],
    ]);
    for (const b of blocks) expect([b.width, b.height]).toEqual([40, 40]);
  });

  it("resolves the large map's overlaps: roads over biomes, grass where bare", () => {
    const large = terrainZonesFor("map-for-test-large") ?? [];
    expect(terrainAt(large, 2000, 2000).id).toBe("road"); // plaza at the spawn
    expect(terrainAt(large, 2000, 500).id).toBe("road"); // cross over ice
    expect(terrainAt(large, 1500, 1000).id).toBe("road"); // ring over mud
    expect(terrainAt(large, 1600, 500).id).toBe("ice");
    expect(terrainAt(large, 3000, 500).id).toBe("forest");
    expect(terrainAt(large, 500, 1500).id).toBe("sand");
    expect(terrainAt(large, 1500, 1500).id).toBe("mud");
    expect(terrainAt(large, 2500, 1800).id).toBe("grass");
  });

  it("resolves the play map's overlaps the way the server does (last painted wins)", () => {
    const play = terrainZonesFor("map-for-play") ?? [];
    expect(terrainAt(play, 500, 100).id).toBe("road"); // north road over ice
    expect(terrainAt(play, 600, 400).id).toBe("road"); // plaza over sand
    expect(terrainAt(play, 685, 245).id).toBe("forest"); // forest over ice
    expect(terrainAt(play, 685, 500).id).toBe("road"); // east road over forest and sand
    expect(terrainAt(play, 650, 450).id).toBe("sand");
    expect(terrainAt(play, 300, 300).id).toBe("grass");
    expect(terrainAt(play, 100, 180).id).toBe("road"); // trade road over ice
    expect(terrainAt(play, 210, 171).id).toBe("road"); // bridge over ice
    expect(terrainAt(play, 100, 160).id).toBe("ice");
  });

  it("reference run speed is the 0-AGI walking speed", () => {
    expect(REFERENCE_RUN_SPEED).toBe(200);
  });
});
