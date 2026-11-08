import fs from "fs";
import path from "path";
import {
  ServerMaps,
  parseServerMaps,
  readServerMapSource,
} from "./__fixtures__/serverMapSource";
import { GENERATED_REGION_MAPS, MAPS, mapDef, mapIdFromSearch } from "./maps";
import {
  TERRAIN_TYPES,
  playerSpawnFor,
  spawnAreasFor,
  staticBlocksFor,
  terrainZonesFor,
} from "./terrain";
import { MILLCROSS_BUILDINGS } from "../renderers/terrainRenderer";

/** The client's tables, in the shape the server's source is read into. */
function clientMaps(): Pick<ServerMaps, "multipliers"> & {
  rooms: Record<string, { width: number; height: number; zones: unknown[] }>;
} {
  return {
    multipliers: Object.fromEntries(
      Object.values(TERRAIN_TYPES).map((t) => [t.id, t.speedMultiplier]),
    ),
    rooms: Object.fromEntries(
      MAPS.map((m) => [
        m.id,
        {
          width: m.width,
          height: m.height,
          zones: (terrainZonesFor(m.id) ?? []).map((z) => [
            z.terrain,
            z.x,
            z.y,
            z.width,
            z.height,
          ]),
        },
      ]),
    ),
  };
}

/** What the client mirrors of the server's tables (it keeps no spawn points). */
function mirrored(server: ServerMaps): ReturnType<typeof clientMaps> {
  return {
    multipliers: server.multipliers,
    rooms: Object.fromEntries(
      Object.entries(server.rooms).map(([id, r]) => [
        id,
        { width: r.width, height: r.height, zones: r.zones },
      ]),
    ),
  };
}

describe("client map tables match server-rs/src/content/map.rs, read from disk", () => {
  const source = readServerMapSource();
  const server = parseServerMaps(source);

  it("reads every room, with zones, out of the Rust source", () => {
    expect(Object.keys(server.rooms).length).toBeGreaterThanOrEqual(5);
    const zones = Object.values(server.rooms).flatMap((r) => r.zones);
    expect(zones.length).toBeGreaterThanOrEqual(36);
    expect(Object.keys(server.multipliers)).toHaveLength(6);
  });

  it("has the server's rooms, world sizes, zone rects (in paint order) and speed multipliers", () => {
    expect(clientMaps()).toEqual(mirrored(server));
  });

  it("puts every server spawn point inside the client's world", () => {
    for (const m of MAPS) {
      const { spawn } = server.rooms[m.id];
      expect(spawn.x).toBeGreaterThanOrEqual(0);
      expect(spawn.x).toBeLessThan(m.width);
      expect(spawn.y).toBeGreaterThanOrEqual(0);
      expect(spawn.y).toBeLessThan(m.height);
    }
    expect(server.rooms["map-for-test-large"].spawn).toEqual({
      x: 200,
      y: 200,
    });
    expect(server.rooms["map-for-test-deflect"].spawn).toEqual({
      x: 5,
      y: 5,
    });
  });

  it("derives Millcross town buildings and generated-world obstacles/spawns from the shared source with zero diff", () => {
    const repoRoot = path.resolve(__dirname, "../../../../");
    const townDoc = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "content/towns/town-millcross.json"),
        "utf8",
      ),
    );
    const expectedFootprints = townDoc.footprints.map(
      (fp: { id: string; rect: number[] }) => {
        const minX = (Math.min(fp.rect[0], fp.rect[2]) + 100) / 10;
        const minY = (Math.min(fp.rect[1], fp.rect[3]) + 100) / 10;
        const maxX = (Math.max(fp.rect[0], fp.rect[2]) + 100) / 10;
        const maxY = (Math.max(fp.rect[1], fp.rect[3]) + 100) / 10;
        return {
          id: fp.id,
          x: Number(minX.toFixed(1)),
          y: Number(minY.toFixed(1)),
          width: Number((maxX - minX).toFixed(1)),
          height: Number((maxY - minY).toFixed(1)),
        };
      },
    );
    expect(
      MILLCROSS_BUILDINGS.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      })),
    ).toEqual(expectedFootprints);

    expect(playerSpawnFor("map-for-play")).toEqual(
      server.rooms["map-for-play"].spawn,
    );
    expect(spawnAreasFor("map-for-play").length).toBeGreaterThanOrEqual(8);

    expect(GENERATED_REGION_MAPS.length).toBe(9);
    for (const region of GENERATED_REGION_MAPS) {
      expect(mapIdFromSearch(`?map=${region.id}`)).toBe(region.id);
      expect(mapDef(region.id)).toMatchObject({
        id: region.id,
        width: 400,
        height: 400,
      });

      const diskMap = JSON.parse(
        fs.readFileSync(
          path.join(repoRoot, `content/maps/${region.id}.json`),
          "utf8",
        ),
      );
      const expectedBlocks = diskMap.staticObstacles.map(
        (obs: {
          min_x: number;
          min_y: number;
          max_x: number;
          max_y: number;
        }) => ({
          x: obs.min_x,
          y: obs.min_y,
          width: Number((obs.max_x - obs.min_x).toFixed(1)),
          height: Number((obs.max_y - obs.min_y).toFixed(1)),
        }),
      );
      expect(staticBlocksFor(region.id)).toEqual(expectedBlocks);
      expect(spawnAreasFor(region.id)).toEqual(diskMap.spawnAreas);
      expect(playerSpawnFor(region.id)).toEqual({
        x: diskMap.width / 2,
        y: diskMap.height / 2,
      });
    }
  });

  // The pin bites: each of these is one edit to map.rs, made to a copy in memory.
  const edits: [string, string, string][] = [
    [
      "a zone rect of the large map",
      "Ice, 0.0, 0.0, 140.0, 80.0",
      "Ice, 0.0, 0.0, 140.0, 90.0",
    ],
    [
      "a zone rect of the play map",
      "TerrainType::Mud, 39.0, 59.0",
      "TerrainType::Mud, 38.0, 59.0",
    ],
    ["a zone's terrain", "rect(Sand, 220.0", "rect(Mud, 220.0"],
    [
      "the terrain test map's strips",
      "5.0 + 15.0 * i as f32",
      "5.0 + 14.0 * i as f32",
    ],
    [
      "a speed multiplier",
      "TerrainType::Mud => 0.5",
      "TerrainType::Mud => 0.4",
    ],
    ["a world size", "width: 400.0,", "width: 500.0,"],
    ["paint order", "TerrainZone::rect(Road, 197.0, 0.0, 6.0, 400.0),", ""],
    ["a room id", '"map-for-test-deflect",', '"map-for-test-parry",'],
  ];
  it.each(edits)("goes red when map.rs changes %s", (_, from, to) => {
    expect(source.split(from)).toHaveLength(2);
    const edited = parseServerMaps(source.replace(from, to));
    expect(clientMaps()).not.toEqual(mirrored(edited));
  });

  // Nor can it pass by reading nothing.
  const unreadable: [string, (s: string) => string][] = [
    ["an empty file", () => ""],
    ["no rooms", (s) => s.replace(/"map-for-[a-z-]+",\n/g, "")],
    [
      "a zone list in a shape it does not know",
      (s) =>
        s.replace("terrain_zones: vec![", "terrain_zones: zones_from_file(&["),
    ],
    [
      "a zone built outside a room's list",
      (s) =>
        s.replace(
          "let mut spawn_areas = Vec::new();",
          "let extra = TerrainZone::rect(Ice, 1.0, 2.0, 3.0, 4.0);",
        ),
    ],
    ["a number it cannot read", (s) => s.replace("140.0, 80.0", "W, 80.0")],
    [
      "a terrain the enum does not have",
      (s) => s.replace("rect(Sand, 220.0", "rect(Lava, 220.0"),
    ],
    [
      "a room with two sizes",
      (s) =>
        s.replace(
          "height: 400.0,",
          "height: 400.0, map_id: map_id.to_string(), width: 1.0, height: 1.0,",
        ),
    ],
  ];
  it.each(unreadable)("throws on %s", (_, edit) => {
    const edited = edit(source);
    expect(edited).not.toBe(source);
    expect(() => parseServerMaps(edited)).toThrow(/map\.rs/);
  });
});
