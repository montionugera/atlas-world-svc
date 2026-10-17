/**
 * Test-only reader of the server's map tables, straight from the Rust source
 * (server-rs/src/content/map.rs), so the client's hand-kept mirror is pinned to the
 * real thing. Strict on purpose: any shape it does not recognise throws, so a
 * restructured map.rs turns the test red instead of quietly matching nothing.
 */
import fs from "fs";
import path from "path";

export const SERVER_MAP_SOURCE_PATH = path.resolve(
  __dirname,
  "../../../../../server-rs/src/content/map.rs",
);

export type ServerZone = [
  terrain: string,
  x: number,
  y: number,
  width: number,
  height: number,
];

export interface ServerRoom {
  width: number;
  height: number;
  /** Where joining players appear (the arena centre when the server says `None`). */
  spawn: { x: number; y: number };
  /** In paint order. */
  zones: ServerZone[];
}

export interface ServerMaps {
  /** Terrain name (lower case) to speed multiplier. */
  multipliers: Record<string, number>;
  rooms: Record<string, ServerRoom>;
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const RECT_CALL = "TerrainZone::rect(";

const fail = (what: string): never => {
  throw new Error(`map.rs: ${what} (${SERVER_MAP_SOURCE_PATH})`);
};

/** The one match of `re` in `text`; none or several is an error. */
function only(text: string, re: RegExp, what: string): RegExpMatchArray {
  const found = Array.from(text.matchAll(new RegExp(re.source, "g")));
  if (found.length !== 1) fail(`expected one ${what}, found ${found.length}`);
  return found[0];
}

/** `text` from just after `open` to the next `close`. */
function section(text: string, open: string, close: string, what: string) {
  const start = text.indexOf(open);
  const end = start < 0 ? -1 : text.indexOf(close, start + open.length);
  if (end < 0) fail(`cannot find ${what}`);
  return text.slice(start + open.length, end);
}

const occurrences = (text: string, part: string) => text.split(part).length - 1;

export function parseServerMaps(source: string): ServerMaps {
  // Whitespace-insensitive, comments dropped: rustfmt may re-wrap any of this.
  const src = source.replace(/(^|\s)\/\/.*$/gm, "$1").replace(/\s+/g, " ");

  const variants = section(
    src,
    "pub enum TerrainType {",
    "}",
    "enum TerrainType",
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (variants.length === 0) fail("enum TerrainType has no variants");
  const terrain = (name: string): string =>
    variants.includes(name)
      ? name.toLowerCase()
      : fail(`unknown terrain ${name}`);

  const multipliers: Record<string, number> = {};
  const arms = section(
    src,
    "pub fn speed_multiplier(self) -> f32 { match self {",
    "}",
    "fn speed_multiplier",
  );
  const armList = Array.from(
    arms.matchAll(new RegExp(`TerrainType::(\\w+) => ${NUM},`, "g")),
  );
  armList.forEach((m) => {
    multipliers[terrain(m[1])] = Number(m[2]);
  });
  if (
    armList.length !== variants.length ||
    Object.keys(multipliers).length !== variants.length
  ) {
    fail("speed_multiplier does not cover every TerrainType exactly once");
  }

  const all = section(
    src,
    "pub const ALL: [TerrainType;",
    "];",
    "TerrainType::ALL",
  )
    .split("=")[1]
    .replace("[", "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => terrain(v.replace("TerrainType::", "")));

  const ids = Array.from(
    section(src, "pub const ROOM_IDS:", "];", "ROOM_IDS").matchAll(
      /"([^"]+)"/g,
    ),
    (m) => m[1],
  );
  if (ids.length === 0) fail("ROOM_IDS lists no rooms");

  const load = src.slice(src.indexOf("pub fn load(map_id: &str) -> Self {"));
  if (!load.startsWith("pub fn load")) fail("cannot find MapConfig::load");
  const fallback = load.indexOf("_ => {");
  if (fallback < 0) fail("MapConfig::load has no default arm");

  let rectsRead = 0;
  const readZones = (body: string): ServerZone[] => {
    let field = only(
      body,
      /terrain_zones: (.*?), player_spawn:/,
      "terrain_zones",
    )[1];
    if (field === "Vec::new()") return [];
    const zoneHelper = field.match(/^Self::(\w+)\(\)$/);
    if (zoneHelper) {
      field = section(
        src,
        `fn ${zoneHelper[1]}() -> Vec<TerrainZone> {`,
        "}",
        `fn ${zoneHelper[1]}`,
      ).trim();
    }
    const rect = new RegExp(
      `TerrainZone::rect\\((?:TerrainType::)?(\\w+), ${NUM}, ${NUM}, ${NUM}, ${NUM}\\),?`,
      "g",
    );
    const list = field.match(/^vec!\[(.*)\]$/);
    if (list) {
      if (list[1].replace(rect, "").trim() !== "") {
        fail(`unreadable entry in a terrain_zones list: ${list[1]}`);
      }
      const zones = Array.from(list[1].matchAll(rect), (m): ServerZone => [
        terrain(m[1]),
        +m[2],
        +m[3],
        +m[4],
        +m[5],
      ]);
      rectsRead += zones.length;
      return zones;
    }
    // One strip per terrain type, in TerrainType::ALL order.
    const strips = field.match(
      new RegExp(
        String.raw`^TerrainType::ALL ?\.iter\(\) ?\.enumerate\(\) ?\.map\(\|\(i, &terrain\)\| \{? ?` +
          String.raw`TerrainZone::rect\(terrain, ${NUM} \+ ${NUM} \* i as f32, ${NUM}, ${NUM}, ${NUM}\)` +
          String.raw` ?\}?\) ?\.collect\(\)$`,
      ),
    );
    if (strips) {
      rectsRead += 1;
      const [x0, step, y, width, height] = strips.slice(1).map(Number);
      return all.map((t, i): ServerZone => [
        t,
        x0 + step * i,
        y,
        width,
        height,
      ]);
    }
    return fail(`unrecognised terrain_zones form: ${field}`);
  };

  // Rooms that share a config (the default arm) share one reading of its zones.
  const zonesByBody = new Map<string, ServerZone[]>();
  const zonesOf = (body: string): ServerZone[] => {
    const zones = zonesByBody.get(body) ?? readZones(body);
    zonesByBody.set(body, zones);
    return zones;
  };

  const rooms: Record<string, ServerRoom> = {};
  for (const id of ids) {
    // A room's config is its own match arm, a helper that arm calls, or the default arm.
    let body = load.slice(fallback);
    const arm = load.indexOf(`"${id}" => `);
    if (arm >= 0) {
      const rest = load.slice(arm + `"${id}" => `.length);
      const helper = rest.match(/^Self::(\w+)\(map_id\),/);
      if (helper) {
        const open = `fn ${helper[1]}(map_id: &str) -> Self {`;
        body = section(src, open, " fn ", `fn ${helper[1]}`);
      } else if (rest.startsWith("Self {")) {
        const next = rest.search(/\}, (?:"[^"]+"|_) => /);
        if (next < 0) fail(`cannot find the end of the ${id} arm`);
        body = rest.slice(0, next);
      } else {
        fail(`unrecognised match arm for ${id}`);
      }
    }
    const size = only(
      body,
      new RegExp(
        `map_id: map_id\\.to_string\\(\\), width: ${NUM}, height: ${NUM},`,
      ),
      `width/height for ${id}`,
    );
    const width = Number(size[1]);
    const height = Number(size[2]);
    const spawn = only(
      body,
      new RegExp(`player_spawn: (?:None|Some\\(\\(${NUM}, ${NUM}\\)\\)),`),
      `player_spawn for ${id}`,
    );
    rooms[id] = {
      width,
      height,
      spawn: spawn[1]
        ? { x: Number(spawn[1]), y: Number(spawn[2]) }
        : { x: width / 2, y: height / 2 },
      zones: zonesOf(body),
    };
  }

  // Every zone constructed anywhere in the file was read into some room.
  if (rectsRead === 0) fail("no terrain zones found");
  if (rectsRead !== occurrences(src, RECT_CALL)) {
    fail(
      `read ${rectsRead} of ${occurrences(src, RECT_CALL)} ${RECT_CALL}...) calls`,
    );
  }
  return { multipliers, rooms };
}

export const readServerMapSource = (): string =>
  fs.readFileSync(SERVER_MAP_SOURCE_PATH, "utf8");
