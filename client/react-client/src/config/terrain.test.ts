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
      ["ice", 0, 0, 100, 25],
      ["forest", 68, 24, 32, 52],
      ["sand", 54, 39, 15, 22],
      ["mud", 39, 59, 23, 17],
      ["road", 48.5, 0, 3, 39],
      ["road", 48.5, 61, 3, 39],
      ["road", 0, 48.5, 39, 3],
      ["road", 61, 48.5, 39, 3],
      ["road", 39, 39, 22, 22],
      ["road", 0, 17.2, 19.5, 1.6],
      ["road", 18.8, 17, 3, 2],
    ]);
  });

  it("map-for-test-terrain strips and blocks", () => {
    expect(rects("map-for-test-terrain")).toEqual([
      ["road", 5, 0, 15, 70],
      ["grass", 20, 0, 15, 70],
      ["forest", 35, 0, 15, 70],
      ["sand", 50, 0, 15, 70],
      ["ice", 65, 0, 15, 70],
      ["mud", 80, 0, 15, 70],
    ]);
    expect(staticBlocksFor("map-for-test-terrain")).toEqual([
      { x: 30, y: 76, width: 4, height: 4 },
      { x: 66, y: 76, width: 4, height: 4 },
    ]);
    expect(staticBlocksFor("map-for-play")).toEqual([]);
  });

  it("map-for-test-large zones (MapConfig::large_test_map), in paint order", () => {
    expect(rects("map-for-test-large")).toEqual([
      ["ice", 0, 0, 140, 80],
      ["ice", 260, 320, 140, 80],
      ["ice", 150, 30, 90, 50],
      ["forest", 270, 10, 120, 110],
      ["forest", 10, 270, 110, 120],
      ["forest", 140, 310, 90, 70],
      ["sand", 10, 110, 80, 120],
      ["sand", 310, 150, 80, 130],
      ["sand", 220, 220, 60, 60],
      ["mud", 120, 120, 60, 60],
      ["mud", 220, 110, 70, 50],
      ["mud", 110, 220, 70, 70],
      ["road", 197, 0, 6, 400],
      ["road", 0, 197, 400, 6],
      ["road", 100, 97, 200, 6],
      ["road", 100, 297, 200, 6],
      ["road", 97, 100, 6, 200],
      ["road", 297, 100, 6, 200],
      ["road", 185, 185, 30, 30],
    ]);
  });

  it("map-for-test-large blocks: four clusters of four", () => {
    const blocks = staticBlocksFor("map-for-test-large");
    expect(blocks.map((b) => [b.x, b.y])).toEqual([
      [120, 120],
      [129, 122],
      [123, 130],
      [133, 131],
      [280, 120],
      [289, 122],
      [283, 130],
      [293, 131],
      [120, 280],
      [129, 282],
      [123, 290],
      [133, 291],
      [280, 280],
      [289, 282],
      [283, 290],
      [293, 291],
    ]);
    for (const b of blocks) expect([b.width, b.height]).toEqual([4, 4]);
  });

  it("resolves the large map's overlaps: roads over biomes, grass where bare", () => {
    const large = terrainZonesFor("map-for-test-large") ?? [];
    expect(terrainAt(large, 200, 200).id).toBe("road"); // plaza at the spawn
    expect(terrainAt(large, 200, 50).id).toBe("road"); // cross over ice
    expect(terrainAt(large, 150, 100).id).toBe("road"); // ring over mud
    expect(terrainAt(large, 160, 50).id).toBe("ice");
    expect(terrainAt(large, 300, 50).id).toBe("forest");
    expect(terrainAt(large, 50, 150).id).toBe("sand");
    expect(terrainAt(large, 150, 150).id).toBe("mud");
    expect(terrainAt(large, 250, 180).id).toBe("grass");
  });

  it("resolves the play map's overlaps the way the server does (last painted wins)", () => {
    const play = terrainZonesFor("map-for-play") ?? [];
    expect(terrainAt(play, 50, 10).id).toBe("road"); // north road over ice
    expect(terrainAt(play, 60, 40).id).toBe("road"); // plaza over sand
    expect(terrainAt(play, 68.5, 24.5).id).toBe("forest"); // forest over ice
    expect(terrainAt(play, 68.5, 50).id).toBe("road"); // east road over forest and sand
    expect(terrainAt(play, 65, 45).id).toBe("sand");
    expect(terrainAt(play, 30, 30).id).toBe("grass");
    expect(terrainAt(play, 10, 18).id).toBe("road"); // trade road over ice
    expect(terrainAt(play, 21, 17.1).id).toBe("road"); // bridge over ice
    expect(terrainAt(play, 10, 16).id).toBe("ice");
  });

  it("reference run speed is the 0-AGI walking speed", () => {
    expect(REFERENCE_RUN_SPEED).toBe(3);
  });
});
