/**
 * Client for server-rs's dev-only debug controls: plain HTTP on the game port
 * (server-rs/src/debug.rs, `serve_debug_http` in server-rs/src/net/ws.rs). Every route
 * answers 404 when the server's debug mode is off.
 */

/** Room state returned by every successful call (`debug_state` on the server). */
export interface DebugRoomState {
  tick: number;
  width: number;
  height: number;
  player_spawn: { x: number; y: number };
  players: number;
  bots: number;
  mobs: number;
  mobs_respawning: number;
  projectiles: number;
  mobs_paused: boolean;
  bots_paused: boolean;
  /** Session ids of the players that take no damage. */
  invulnerable: string[];
  limits: { max_bots: number; max_mobs: number };
}

/** `DebugCommand` on the server; counts past the room's limits are clamped there. */
export type DebugCommand =
  | { cmd: "state" }
  | { cmd: "set_bots"; count: number }
  | { cmd: "add_bots"; delta: number }
  | { cmd: "set_mobs"; count: number }
  | { cmd: "add_mobs"; delta: number }
  /** Around the calling player when x/y are left out. */
  | {
      cmd: "spawn_mobs";
      mob_type: string;
      count: number;
      x?: number;
      y?: number;
    }
  | { cmd: "clear_mobs" }
  | { cmd: "pause_mobs"; paused: boolean }
  | { cmd: "pause_bots"; paused: boolean }
  | { cmd: "set_invulnerable"; enabled: boolean }
  | { cmd: "teleport"; x: number; y: number };

export interface DebugTarget {
  /** `http://host:port` of the game server. */
  baseUrl: string;
  /** Room id (`?map=`). */
  map: string;
  /** Session id of the caller; needed by the commands that act on a player. */
  player?: string;
}

export type DebugFailure =
  /** 404: the server runs without debug mode. */
  | "disabled"
  /** 400: the server refused the command; `error` is its reason. */
  | "rejected"
  /** 503: the tick loop did not answer in time. */
  | "busy"
  /** No answer at all, or one that is not the debug protocol. */
  | "network";

export type DebugResult =
  | { ok: true; state: DebugRoomState }
  | { ok: false; kind: DebugFailure; error: string };

export const DEBUG_DISABLED_MESSAGE = "debug mode is off on this server";

export interface DebugRequestOptions {
  target: DebugTarget;
  command: DebugCommand;
}

/** URL and fetch options for a command; `state` is a GET, everything else a POST. */
export function buildDebugRequest({ target, command }: DebugRequestOptions): {
  url: string;
  init: RequestInit;
} {
  if (command.cmd === "state") {
    return {
      url: `${target.baseUrl}/debug/state?map=${encodeURIComponent(target.map)}`,
      init: { method: "GET" },
    };
  }
  // No Content-Type header: the body goes out as text/plain, which needs no CORS
  // preflight (a debug-off server answers the preflight 404, hiding the real 404).
  return {
    url: `${target.baseUrl}/debug/command`,
    init: {
      method: "POST",
      body: JSON.stringify({
        map: target.map,
        ...(target.player ? { player: target.player } : {}),
        ...command,
      }),
    },
  };
}

const failure = (kind: DebugFailure, error: string): DebugResult => ({
  ok: false,
  kind,
  error,
});

/** Send one command. Never throws: every failure comes back as a result. */
export async function sendDebugCommand(
  options: DebugRequestOptions,
): Promise<DebugResult> {
  const { url, init } = buildDebugRequest(options);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return failure("network", "cannot reach the game server");
  }
  if (response.status === 404)
    return failure("disabled", DEBUG_DISABLED_MESSAGE);
  let body: { ok?: boolean; state?: DebugRoomState; error?: string } | null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 503) {
    return failure("busy", body?.error ?? "server did not answer in time");
  }
  if (response.ok && body?.ok && body.state) {
    return { ok: true, state: body.state };
  }
  if (response.status === 400) {
    return failure("rejected", body?.error ?? "bad request");
  }
  return failure("network", `unexpected answer (HTTP ${response.status})`);
}
