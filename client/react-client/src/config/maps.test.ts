import { DEFAULT_MAP_ID, MAPS, mapDef, mapIdFromSearch } from "./maps";

describe("maps config", () => {
  it("offers the four server rooms with unique ids", () => {
    expect(MAPS.map((m) => m.id)).toEqual([
      "map-for-play",
      "map-for-test-terrain",
      "map-for-test-projectile",
      "map-for-test-deflect",
    ]);
  });

  it("mapDef returns the room, or the default room for unknown ids", () => {
    expect(mapDef("map-for-test-deflect")).toMatchObject({
      width: 100,
      height: 100,
      viewportSize: 100,
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
    expect(mapIdFromSearch("?map=evil")).toBe(DEFAULT_MAP_ID);
    expect(mapIdFromSearch("")).toBe(DEFAULT_MAP_ID);
  });
});
