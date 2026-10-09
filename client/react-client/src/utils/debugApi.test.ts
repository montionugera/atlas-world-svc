import {
  DEBUG_DISABLED_MESSAGE,
  DebugRoomState,
  buildDebugRequest,
  sendDebugCommand,
} from "./debugApi";

const target = {
  baseUrl: "http://localhost:2567",
  map: "map-for-test-large",
  player: "dev-player",
};

const state: DebugRoomState = {
  tick: 7,
  width: 4000,
  height: 4000,
  player_spawn: { x: 2000, y: 2000 },
  players: 1,
  bots: 10,
  mobs: 200,
  mobs_respawning: 2,
  projectiles: 0,
  mobs_paused: false,
  bots_paused: true,
  invulnerable: ["dev-player"],
  limits: { max_bots: 300, max_mobs: 1000 },
};

describe("buildDebugRequest", () => {
  it("reads state with a GET naming the room", () => {
    expect(buildDebugRequest({ target, command: { cmd: "state" } })).toEqual({
      url: "http://localhost:2567/debug/state?map=map-for-test-large",
      init: { method: "GET" },
    });
  });

  it("posts a command with its fields beside the room and the caller", () => {
    const { url, init } = buildDebugRequest({
      target,
      command: { cmd: "spawn_mobs", mob_type: "mob-veil-cub", count: 3 },
    });
    expect(url).toBe("http://localhost:2567/debug/command");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      map: "map-for-test-large",
      player: "dev-player",
      cmd: "spawn_mobs",
      mob_type: "mob-veil-cub",
      count: 3,
    });
  });

  it("posts as JSON: the server answers anything else 415", () => {
    const { init } = buildDebugRequest({
      target,
      command: { cmd: "clear_mobs" },
    });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("leaves the caller out when there is none", () => {
    const { init } = buildDebugRequest({
      target: { baseUrl: target.baseUrl, map: target.map },
      command: { cmd: "set_bots", count: 40 },
    });
    expect(JSON.parse(init.body as string)).toEqual({
      map: "map-for-test-large",
      cmd: "set_bots",
      count: 40,
    });
  });
});

describe("sendDebugCommand", () => {
  const realFetch = global.fetch;
  const answer = (status: number, body: unknown) => {
    const fetchMock = jest.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === undefined) throw new SyntaxError("not json");
        return body;
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const send = () =>
    sendDebugCommand({ target, command: { cmd: "add_bots", delta: 10 } });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns the room state of a 200", async () => {
    const fetchMock = answer(200, { ok: true, state });
    expect(await send()).toEqual({ ok: true, state });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:2567/debug/command",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns the server's reason for a 400", async () => {
    answer(400, { ok: false, error: "unknown mob_type mob-nope" });
    expect(await send()).toEqual({
      ok: false,
      kind: "rejected",
      error: "unknown mob_type mob-nope",
    });
  });

  it("returns the server's reason for another refusal (415)", async () => {
    answer(415, { ok: false, error: "Content-Type must be application/json" });
    expect(await send()).toEqual({
      ok: false,
      kind: "rejected",
      error: "Content-Type must be application/json",
    });
  });

  it("reports a 404 as debug mode being off", async () => {
    answer(404, { ok: false, error: "not found" });
    expect(await send()).toEqual({
      ok: false,
      kind: "disabled",
      error: DEBUG_DISABLED_MESSAGE,
    });
  });

  it("reports a 503 as the server being busy", async () => {
    answer(503, { ok: false, error: "tick loop did not answer" });
    expect(await send()).toEqual({
      ok: false,
      kind: "busy",
      error: "tick loop did not answer",
    });
  });

  it("does not throw when the server cannot be reached", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new TypeError("Failed to fetch"),
      ) as unknown as typeof fetch;
    expect(await send()).toEqual({
      ok: false,
      kind: "network",
      error: "cannot reach the game server",
    });
  });

  it("does not throw on an answer that is not JSON", async () => {
    answer(502, undefined);
    expect(await send()).toEqual({
      ok: false,
      kind: "network",
      error: "unexpected answer (HTTP 502)",
    });
  });
});
