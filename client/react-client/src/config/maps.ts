/**
 * Rooms the server-rs gateway accepts via `?map=` (server-rs/src/net/ws.rs) with the
 * world sizes from `MapConfig::load` (server-rs/src/content/map.rs). The gateway is a
 * bare WebSocket with no room-listing endpoint, so this list is maintained by hand.
 */
export interface MapDef {
  id: string;
  label: string;
  width: number;
  height: number;
  /** World units across the camera; omitted = the client default. */
  viewportSize?: number;
  /** "frontier" draws the Millcross world art; "plain" draws only terrain zones and blocks. */
  art: "frontier" | "plain";
}

export const MAPS: readonly MapDef[] = [
  {
    id: "map-for-play",
    label: "Play",
    width: 1000,
    height: 1000,
    art: "frontier",
  },
  {
    id: "map-for-test-terrain",
    label: "Terrain test",
    width: 1000,
    height: 1000,
    art: "plain",
  },
  {
    id: "map-for-test-projectile",
    label: "Projectile test",
    width: 1000,
    height: 1000,
    art: "plain",
  },
  {
    id: "map-for-test-deflect",
    label: "Deflect test",
    width: 100,
    height: 100,
    viewportSize: 100,
    art: "plain",
  },
];

export const DEFAULT_MAP_ID = MAPS[0].id;

export function mapDef(mapId: string): MapDef {
  return MAPS.find((m) => m.id === mapId) ?? MAPS[0];
}

/** Room named by the page's `?map=` query, or the default room. */
export function mapIdFromSearch(search: string): string {
  const requested = new URLSearchParams(search).get("map");
  return MAPS.some((m) => m.id === requested)
    ? (requested as string)
    : DEFAULT_MAP_ID;
}
