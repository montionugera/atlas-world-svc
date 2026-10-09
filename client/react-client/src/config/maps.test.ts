import { DEFAULT_MAP_ID, MAPS, mapDef, mapIdFromSearch } from "./maps";

describe("maps config", () => {
  // World sizes are a hand-kept copy of `MapConfig::load` (server-rs/src/content/map.rs).
  it("offers the five server rooms, each with the server's world size", () => {
    expect(MAPS.map((m) => [m.id, m.width, m.height])).toEqual([
      ["map-for-play", 1000, 1000],
      ["map-for-test-terrain", 1000, 1000],
      ["map-for-test-projectile", 1000, 1000],
      ["map-for-test-deflect", 100, 100],
      ["map-for-test-large", 4000, 4000],
    ]);
  });

  it("mapDef returns the room, or the default room for unknown ids", () => {
    expect(mapDef("map-for-test-deflect")).toMatchObject({
      width: 100,
      height: 100,
      viewportSize: 100,
    });
    expect(mapDef("map-for-test-large")).toMatchObject({
      width: 4000,
      height: 4000,
      art: "plain",
    });
    expect(mapDef("bogus").id).toBe(DEFAULT_MAP_ID);
  });

  it("mapIdFromSearch reads ?map= and rejects unknown rooms", () => {
    expect(mapIdFromSearch("?map=map-for-test-terrain")).toBe(
      "map-for-test-terrain",
    );
    expect(mapIdFromSearch("?player=a&map=map-for-test-deflect")).toBe(
      "map-for-test-deflect",
    );
    expect(mapIdFromSearch("?map=map-for-test-large")).toBe(
      "map-for-test-large",
    );
    expect(mapIdFromSearch("?map=evil")).toBe(DEFAULT_MAP_ID);
    expect(mapIdFromSearch("")).toBe(DEFAULT_MAP_ID);
  });
});
