import { renderHook, act } from "@testing-library/react";
import { TextEncoder, TextDecoder } from "util";
import * as flatbuffers from "flatbuffers";
import { useServerRsClient, skillSlotFor, fnv1a32 } from "./useServerRsClient";
import { WorldSnapshot } from "../protocol/generated/atlas/protocol/world-snapshot";
import { EntityDelta } from "../protocol/generated/atlas/protocol/entity-delta";
import { EntityType } from "../protocol/generated/atlas/protocol/entity-type";
import { Vec2 } from "../protocol/generated/atlas/protocol/vec2";
import { ClientInput } from "../protocol/generated/atlas/protocol/client-input";
import { GameEvent } from "../protocol/generated/atlas/protocol/game-event";
import { GameEventKind } from "../protocol/generated/atlas/protocol/game-event-kind";
import {
  STATE_FLAG_ALIVE,
  STATE_FLAG_BOT,
} from "../protocol/BinaryDeltaDecoder";
import { getMobDisplayName } from "../utils/mobUtils";
import { perfTimings, timingGate } from "../utils/frameTiming";

(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  /** When set, sockets stay CONNECTING until a test opens them by hand. */
  static manualOpen = false;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  binaryType: string = "blob";
  readyState: number = MockWebSocket.manualOpen ? 0 : 1; // OPEN unless manual
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  sentMessages: any[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (!MockWebSocket.manualOpen && this.onopen) this.onopen();
    }, 0);
  }

  send(data: any) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
}

(global as any).WebSocket = MockWebSocket;

function createTestSnapshotBuffer(tick: number): Uint8Array {
  const fbb = new flatbuffers.Builder(256);
  EntityDelta.startEntityDelta(fbb);
  EntityDelta.addId(fbb, 101);
  EntityDelta.addEntityType(fbb, EntityType.Player);
  EntityDelta.addPos(fbb, Vec2.createVec2(fbb, 500, 500));
  EntityDelta.addVel(fbb, Vec2.createVec2(fbb, 1, 0));
  EntityDelta.addHealth(fbb, 100);
  EntityDelta.addMaxHealth(fbb, 100);
  const playerOffset = EntityDelta.endEntityDelta(fbb);

  EntityDelta.startEntityDelta(fbb);
  EntityDelta.addId(fbb, 202);
  EntityDelta.addEntityType(fbb, EntityType.Mob);
  EntityDelta.addPos(fbb, Vec2.createVec2(fbb, 300, 400));
  EntityDelta.addVel(fbb, Vec2.createVec2(fbb, 0, 1));
  EntityDelta.addHealth(fbb, 50);
  EntityDelta.addMaxHealth(fbb, 50);
  const mobOffset = EntityDelta.endEntityDelta(fbb);

  const entitiesVec = WorldSnapshot.createEntitiesVector(fbb, [
    playerOffset,
    mobOffset,
  ]);
  const removedVec = WorldSnapshot.createRemovedIdsVector(fbb, []);

  WorldSnapshot.startWorldSnapshot(fbb);
  WorldSnapshot.addTick(fbb, tick);
  WorldSnapshot.addServerTimeMs(fbb, BigInt(1700000000000));
  WorldSnapshot.addEntities(fbb, entitiesVec);
  WorldSnapshot.addRemovedIds(fbb, removedVec);
  const snapshotOffset = WorldSnapshot.endWorldSnapshot(fbb);
  fbb.finish(snapshotOffset);

  return fbb.asUint8Array();
}

describe("useServerRsClient", () => {
  let clock: number;
  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.manualOpen = false;
    localStorage.clear();
    // Snapshots reach React state at most every 150 ms; unless a test drives the
    // clock itself, every look at it is a second later, so each one is published.
    clock = 0;
    jest.spyOn(performance, "now").mockImplementation(() => (clock += 1000));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("initializes in disconnected state", () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
      }),
    );

    expect(result.current.isConnected).toBe(false);
    expect(result.current.gameState).toBeNull();
    expect(result.current.updateCount).toBe(0);
  });

  it("connects to server-rs WebSocket gateway and processes binary snapshot", async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
        token: "test-jwt-token",
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain("token=test-jwt-token");

    // Simulate incoming FlatBuffers snapshot
    const testSnapshot = createTestSnapshotBuffer(42);
    act(() => {
      const ws = MockWebSocket.instances[0];
      if (ws.onmessage) {
        ws.onmessage({
          data: testSnapshot.buffer.slice(
            testSnapshot.byteOffset,
            testSnapshot.byteOffset + testSnapshot.byteLength,
          ),
        });
      }
    });

    expect(result.current.updateCount).toBe(1);
    expect(result.current.gameState?.tick).toBe(42);
    expect(result.current.gameState?.players.has("101")).toBe(true);
    expect(result.current.gameState?.players.get("101")?.x).toBe(500);
    expect(result.current.gameState?.mobs.has("202")).toBe(true);
    expect(result.current.gameState?.mobs.get("202")?.y).toBe(400);
  });

  it("sends FlatBuffers ClientInput on updatePlayerInput", async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      result.current.updatePlayerInput(1.5, -2.0);
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages.length).toBe(2);

    // Initial frame on open
    const initialBytes: Uint8Array = ws.sentMessages[0];
    const initialInput = ClientInput.getRootAsClientInput(
      new flatbuffers.ByteBuffer(initialBytes),
    );
    expect(initialInput.moveX()).toBe(0);
    expect(initialInput.moveY()).toBe(0);

    // Movement frame
    const sentBytes: Uint8Array = ws.sentMessages[1];
    const bb = new flatbuffers.ByteBuffer(sentBytes);
    const decodedInput = ClientInput.getRootAsClientInput(bb);

    expect(decodedInput.moveX()).toBeCloseTo(1.5, 3);
    expect(decodedInput.moveY()).toBeCloseTo(-2.0, 3);
    expect(decodedInput.attack()).toBe(false);
  });

  it("disconnects and resets state cleanly", async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.gameState).toBeNull();
  });

  const decode = (bytes: Uint8Array) =>
    ClientInput.getRootAsClientInput(new flatbuffers.ByteBuffer(bytes));
  const connected = async (token?: string) => {
    const view = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
        token,
      }),
    );
    await act(async () => {
      await view.result.current.connect();
    });
    return view;
  };

  it("keeps the held move vector when attacking (regression: attack cancelled movement)", async () => {
    const { result } = await connected();
    act(() => {
      result.current.updatePlayerInput(2, 0);
      result.current.sendPlayerAction("attack", true);
    });
    const last = decode(MockWebSocket.instances[0].sentMessages.at(-1));
    expect(last.moveX()).toBeCloseTo(2);
    expect(last.attack()).toBe(true);
  });

  it("keeps attack held while the move vector changes, and releases it", async () => {
    const { result } = await connected();
    act(() => {
      result.current.sendPlayerAction("attack", true);
      result.current.updatePlayerInput(0, -2);
    });
    const ws = MockWebSocket.instances[0];
    let last = decode(ws.sentMessages.at(-1));
    expect(last.moveY()).toBeCloseTo(-2);
    expect(last.attack()).toBe(true);

    act(() => {
      result.current.sendPlayerAction("attack", false);
    });
    last = decode(ws.sentMessages.at(-1));
    expect(last.attack()).toBe(false);
    expect(last.moveY()).toBeCloseTo(-2);
  });

  it("maps skills (incl. dash) to server slots and keeps movement", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      result.current.updatePlayerInput(0, 2);
    });
    for (const [skillId, slot] of [
      ["skill_1", 1],
      ["skill_4", 4],
      ["skill_dash", 5],
    ] as const) {
      act(() => {
        result.current.sendPlayerAction("useSkill", true, { skillId });
      });
      const last = decode(ws.sentMessages.at(-1));
      expect(last.skillSlot()).toBe(slot);
      expect(last.moveY()).toBeCloseTo(2);
    }
  });

  it("skillSlotFor handles unknown ids and explicit slots", () => {
    expect(skillSlotFor({ skillId: "nope" })).toBe(0);
    expect(skillSlotFor({ skillSlot: 3 })).toBe(3);
    expect(skillSlotFor(undefined)).toBe(0);
  });

  it('tags only the local session as "Player (YOU)"', async () => {
    // fnv1a32('dev-player') === 4026785618 matches the server's id hash
    expect(fnv1a32("dev-player")).toBe(4026785618);
    const { result } = await connected("dev-token:alice");
    const me = fnv1a32("alice");
    expect(result.current.playerId).toBe(String(me));
    const fbb = new flatbuffers.Builder(256);
    const mk = (id: number) => {
      EntityDelta.startEntityDelta(fbb);
      EntityDelta.addId(fbb, id);
      EntityDelta.addEntityType(fbb, EntityType.Player);
      EntityDelta.addPos(fbb, Vec2.createVec2(fbb, 1, 2));
      EntityDelta.addHealth(fbb, 80);
      EntityDelta.addMaxHealth(fbb, 100);
      return EntityDelta.endEntityDelta(fbb);
    };
    const a = mk(me);
    const b = mk(12345);
    const ents = WorldSnapshot.createEntitiesVector(fbb, [a, b]);
    WorldSnapshot.startWorldSnapshot(fbb);
    WorldSnapshot.addTick(fbb, 1);
    WorldSnapshot.addEntities(fbb, ents);
    fbb.finish(WorldSnapshot.endWorldSnapshot(fbb));
    const bytes = fbb.asUint8Array();
    act(() => {
      MockWebSocket.instances[0].onmessage?.({ data: bytes.slice().buffer });
    });
    const mine = result.current.gameState!.players.get(String(me))!;
    expect(mine.name).toBe("Player (YOU)");
    expect(mine.isBotMode).toBe(false);
    expect(mine.radius).toBeGreaterThan(0);
    expect(mine.currentHealth).toBe(80);
    // Regression: other humans were tagged [BOT]; only the server bot flag makes a bot.
    expect(result.current.gameState!.players.get("12345")!.isBotMode).toBe(
      false,
    );
  });

  it("disconnect during CONNECTING closes the socket (StrictMode double-mount leak)", async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
      }),
    );
    act(() => {
      result.current.connect();
      result.current.disconnect();
    });
    expect(MockWebSocket.instances[0].readyState).toBe(3);
  });

  it("joinRoom reflects the selected map in roomId and gameState", async () => {
    const { result } = await connected();
    await act(async () => {
      await result.current.joinRoom("map-for-test-projectile");
    });
    expect(result.current.roomId).toBe("server-rs-map-for-test-projectile");
    expect(result.current.gameState?.mapId).toBe("map-for-test-projectile");
  });

  it("rapid room switch before the first socket opens leaves one live socket on the LAST room", async () => {
    MockWebSocket.manualOpen = true;
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
      }),
    );
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.joinRoom("map-for-test-terrain");
      second = result.current.joinRoom("map-for-test-projectile");
    });
    const live = MockWebSocket.instances.filter((w) => w.readyState !== 3);
    expect(live).toHaveLength(1);
    expect(live[0].url).toContain("map=map-for-test-projectile");

    // A late open/close from the abandoned socket must not touch state.
    const abandoned = MockWebSocket.instances[0];
    act(() => {
      abandoned.readyState = 1;
      abandoned.onopen?.();
    });
    expect(result.current.isConnected).toBe(false);

    await act(async () => {
      live[0].readyState = 1;
      live[0].onopen?.();
      await Promise.all([first, second]);
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.roomId).toBe("server-rs-map-for-test-projectile");
    expect(result.current.gameState?.mapId).toBe("map-for-test-projectile");
  });

  it("a room switch drops the old room's target id and projectiles", async () => {
    const { result } = await connected();
    act(() => {
      result.current.sendPlayerAction("attack", true, {
        targetId: 77,
        x: 40,
        y: 50,
      });
      MockWebSocket.instances[0].onmessage?.(
        snap(1, [{ id: 900, type: EntityType.Projectile, x: 33, ownerId: 11 }]),
      );
    });
    expect(result.current.gameState!.projectiles!.size).toBe(1);
    await act(async () => {
      await result.current.joinRoom("map-for-test-terrain");
    });
    expect(result.current.gameState!.projectiles?.size ?? 0).toBe(0);
    expect(result.current.sentTargetRef.current).toEqual({ x: 0, y: 0 });
    const ws = MockWebSocket.instances[1];
    act(() => {
      result.current.updatePlayerInput(1, 0);
    });
    const last = ws.sentMessages[ws.sentMessages.length - 1];
    const input = ClientInput.getRootAsClientInput(
      new flatbuffers.ByteBuffer(last),
    );
    expect(input.targetId()).toBe(0);
    expect(input.targetX()).toBe(0);
  });

  it("respawn() carries the held move and attack instead of zeroing them", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      result.current.updatePlayerInput(1, 0);
      result.current.sendPlayerAction("attack", true);
      result.current.respawn();
    });
    const input = ClientInput.getRootAsClientInput(
      new flatbuffers.ByteBuffer(ws.sentMessages[ws.sentMessages.length - 1]),
    );
    expect(input.respawn()).toBe(true);
    expect(input.moveX()).toBe(1);
    expect(input.attack()).toBe(true);
  });

  const frame = (tick: number, mobX: number) => {
    const fbb = new flatbuffers.Builder(128);
    EntityDelta.startEntityDelta(fbb);
    EntityDelta.addId(fbb, 202);
    EntityDelta.addEntityType(fbb, EntityType.Mob);
    EntityDelta.addPos(fbb, Vec2.createVec2(fbb, mobX, 10));
    EntityDelta.addHealth(fbb, 40);
    EntityDelta.addMaxHealth(fbb, 50);
    const m = EntityDelta.endEntityDelta(fbb);
    const ents = WorldSnapshot.createEntitiesVector(fbb, [m]);
    WorldSnapshot.startWorldSnapshot(fbb);
    WorldSnapshot.addTick(fbb, tick);
    WorldSnapshot.addEntities(fbb, ents);
    fbb.finish(WorldSnapshot.endWorldSnapshot(fbb));
    return { data: fbb.asUint8Array().slice().buffer };
  };

  it("mob positions follow every snapshot (regression: ...existing spread last froze mobs)", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.(frame(1, 100));
    });
    act(() => {
      ws.onmessage?.(frame(2, 150));
    });
    expect(result.current.gameState!.mobs.get("202")!.x).toBe(150);
  });

  it("ignores frames from a socket that was disconnected", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      result.current.disconnect();
    });
    act(() => {
      ws.onmessage?.(frame(9, 100));
    });
    expect(result.current.gameState).toBeNull();
  });

  it("connect() settles when disconnected during CONNECTING (no hung promise)", async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: "localhost",
        serverPort: 2567,
        useSSL: false,
      }),
    );
    let p!: Promise<void>;
    act(() => {
      p = result.current.connect() as Promise<void>;
      result.current.disconnect();
    });
    await expect(p).resolves.toBeUndefined();
  });

  it("disconnect resets held input so a reconnect does not replay stale movement", async () => {
    const { result } = await connected();
    act(() => {
      result.current.updatePlayerInput(2, 0);
    });
    act(() => {
      result.current.disconnect();
    });
    await act(async () => {
      await result.current.connect();
    });
    act(() => {
      result.current.sendPlayerAction("attack", true);
    });
    const last = decode(MockWebSocket.instances[1].sentMessages.at(-1));
    expect(last.moveX()).toBe(0);
    expect(last.attack()).toBe(true);
  });

  // ---- Wave B: mob names, bots, dead state, projectiles, removals, events ----

  interface Ent {
    id: number;
    type: EntityType;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    flags?: number;
    health?: number;
    mobType?: string;
    ownerId?: number;
  }
  const snap = (
    tick: number,
    ents: Ent[],
    removed: number[] = [],
    events: {
      kind: GameEventKind;
      source: number;
      target: number;
      amount: number;
    }[] = [],
  ) => {
    const fbb = new flatbuffers.Builder(256);
    const offs = ents.map((e) => {
      const mt = e.mobType ? fbb.createString(e.mobType) : 0;
      EntityDelta.startEntityDelta(fbb);
      EntityDelta.addId(fbb, e.id);
      EntityDelta.addEntityType(fbb, e.type);
      EntityDelta.addPos(fbb, Vec2.createVec2(fbb, e.x ?? 10, e.y ?? 20));
      if (e.vx !== undefined || e.vy !== undefined) {
        EntityDelta.addVel(fbb, Vec2.createVec2(fbb, e.vx ?? 0, e.vy ?? 0));
      }
      EntityDelta.addHealth(fbb, e.health ?? 50);
      EntityDelta.addMaxHealth(fbb, 50);
      EntityDelta.addStateFlags(fbb, e.flags ?? STATE_FLAG_ALIVE);
      if (mt) EntityDelta.addMobType(fbb, mt);
      if (e.ownerId) EntityDelta.addOwnerId(fbb, e.ownerId);
      return EntityDelta.endEntityDelta(fbb);
    });
    const evOffs = events.map((ev) => {
      GameEvent.startGameEvent(fbb);
      GameEvent.addKind(fbb, ev.kind);
      GameEvent.addSourceId(fbb, ev.source);
      GameEvent.addTargetId(fbb, ev.target);
      GameEvent.addAmount(fbb, ev.amount);
      return GameEvent.endGameEvent(fbb);
    });
    const entsVec = WorldSnapshot.createEntitiesVector(fbb, offs);
    const remVec = WorldSnapshot.createRemovedIdsVector(fbb, removed);
    const evVec = WorldSnapshot.createEventsVector(fbb, evOffs);
    WorldSnapshot.startWorldSnapshot(fbb);
    WorldSnapshot.addTick(fbb, tick);
    WorldSnapshot.addEntities(fbb, entsVec);
    WorldSnapshot.addRemovedIds(fbb, remVec);
    WorldSnapshot.addEvents(fbb, evVec);
    fbb.finish(WorldSnapshot.endWorldSnapshot(fbb));
    return { data: fbb.asUint8Array().slice().buffer };
  };

  it('labels mobs with their bestiary name from the wire mob_type (not "Unknown Mob")', async () => {
    const { result } = await connected();
    act(() => {
      MockWebSocket.instances[0].onmessage?.(
        snap(1, [
          { id: 7, type: EntityType.Mob, mobType: "mob-millpond-gnawer" },
        ]),
      );
    });
    const mob = result.current.gameState!.mobs.get("7")!;
    expect(mob.mobTypeId).toBe("mob-millpond-gnawer");
    expect(getMobDisplayName(mob)).toBe("Millpond Gnawer");
  });

  it("getMobDisplayName falls back to a readable id for types missing from the bestiary", () => {
    expect(getMobDisplayName({ mobTypeId: "mob-brand-new-thing" })).toBe(
      "Brand New Thing",
    );
  });

  it("tags only server bots (state_flags bot bit) as bots, never other humans", async () => {
    const { result } = await connected("dev-token:alice");
    act(() => {
      MockWebSocket.instances[0].onmessage?.(
        snap(1, [
          { id: 11, type: EntityType.Player, flags: STATE_FLAG_ALIVE },
          {
            id: 12,
            type: EntityType.Player,
            flags: STATE_FLAG_ALIVE | STATE_FLAG_BOT,
          },
        ]),
      );
    });
    expect(result.current.gameState!.players.get("11")!.isBotMode).toBe(false);
    expect(result.current.gameState!.players.get("12")!.isBotMode).toBe(true);
  });

  it("shows the dead state from the alive flag (corpse at 0 hp) and deletes removed ids", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.(
        snap(1, [
          { id: 7, type: EntityType.Mob, mobType: "mob-millpond-gnawer" },
        ]),
      );
    });
    expect(result.current.gameState!.mobs.get("7")!.isAlive).toBe(true);
    act(() => {
      ws.onmessage?.(
        snap(2, [{ id: 7, type: EntityType.Mob, flags: 0, health: 0 }]),
      );
    });
    const corpse = result.current.gameState!.mobs.get("7")!;
    expect(corpse.isAlive).toBe(false);
    expect(corpse.mobTypeId).toBe("mob-millpond-gnawer"); // kept across frames
    act(() => {
      ws.onmessage?.(snap(3, [], [7]));
    });
    expect(result.current.gameState!.mobs.has("7")).toBe(false);
  });

  it("renders projectiles from the snapshot and drops them when they leave it", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.(
        snap(1, [{ id: 900, type: EntityType.Projectile, x: 33, ownerId: 11 }]),
      );
    });
    const proj = result.current.gameState!.projectiles!.get("900")!;
    expect(proj.x).toBe(33);
    expect(proj.ownerId).toBe("11");
    expect(proj.radius).toBeGreaterThan(0);
    expect(result.current.gameState!.mobs.has("900")).toBe(false);
    // Gone from the snapshot, but the picture is ~100 ms behind: it stays, marked
    // with the simulation time of its last position, until that has surely passed.
    act(() => {
      ws.onmessage?.(snap(2, []));
    });
    const leaving = result.current.gameState!.projectiles!.get("900")!;
    expect(leaving.x).toBe(33);
    expect(leaving.endsAt).toBe(50);
    act(() => {
      ws.onmessage?.(snap(7, []));
    });
    expect(result.current.gameState!.projectiles!.get("900")!.endsAt).toBe(50);
    act(() => {
      ws.onmessage?.(snap(8, []));
    });
    expect(result.current.gameState!.projectiles!.size).toBe(0);
  });

  it("starts a projectile's history afresh after a room switch", async () => {
    const { result } = await connected();
    const proj = { id: 900, type: EntityType.Projectile, x: 33, ownerId: 11 };
    act(() => {
      MockWebSocket.instances[0].onmessage?.(snap(1, [proj]));
    });
    await act(async () => {
      await result.current.joinRoom("map-for-test-terrain");
    });
    act(() => {
      MockWebSocket.instances[1].onmessage?.(snap(2, [{ ...proj, x: 40 }]));
    });
    expect(
      result.current.gameState!.projectiles!.get("900")!.samples,
    ).toHaveLength(1);
  });

  it("publishes snapshots to React a few times a second, keeping the newest in a ref", async () => {
    const { result } = await connected("dev-token:alice");
    const ws = MockWebSocket.instances[0];
    const me = fnv1a32("alice");
    const seen: number[] = [];
    const unsubscribe = result.current.onSnapshot((s) => seen.push(s.tick));
    let t = 10_000;
    jest.spyOn(performance, "now").mockImplementation(() => t);
    const at = (ms: number, tick: number, flags = STATE_FLAG_ALIVE) => {
      t = ms;
      act(() => {
        ws.onmessage?.(
          snap(tick, [{ id: me, type: EntityType.Player, flags }]),
        );
      });
    };

    at(10_000, 1);
    expect(result.current.gameState!.tick).toBe(1);
    // 20 snapshots a second do not each re-render the app...
    at(10_050, 2);
    at(10_100, 3);
    expect(result.current.gameState!.tick).toBe(1);
    expect(result.current.updateCount).toBe(1);
    // ...but the canvas reads the newest one from the ref, and listeners get all.
    expect(result.current.gameStateRef.current!.tick).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
    at(10_150, 4);
    expect(result.current.gameState!.tick).toBe(4);
    expect(result.current.updateCount).toBe(4);

    // Dying (and coming back) must show at once, not up to 150 ms later.
    at(10_200, 5, 0);
    expect(result.current.gameState!.tick).toBe(5);
    at(10_250, 6, STATE_FLAG_ALIVE);
    expect(result.current.gameState!.tick).toBe(6);

    unsubscribe();
    at(10_300, 7);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("queues combat events from every snapshot until they are drained", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    const hit = (amount: number) => ({
      kind: GameEventKind.Hit,
      source: 11,
      target: 7,
      amount,
    });
    // Two snapshots land before the next frame.
    act(() => {
      ws.onmessage?.(snap(1, [], [], [hit(12)]));
      ws.onmessage?.(snap(2, [], [], [hit(30)]));
    });
    expect(result.current.drainEvents().map((e) => e.amount)).toEqual([12, 30]);
    expect(result.current.drainEvents()).toEqual([]);

    // A long-hidden tab keeps only the newest few.
    act(() => {
      for (let tick = 3; tick < 103; tick++) {
        ws.onmessage?.(snap(tick, [], [], [hit(tick), hit(tick)]));
      }
    });
    const kept = result.current.drainEvents();
    // Exactly the cap, and the newest: ticks 71..102, two hits each.
    expect(kept).toHaveLength(64);
    expect(kept.map((e) => e.amount)).toEqual(
      Array.from({ length: 32 }, (_, i) => [71 + i, 71 + i]).flat(),
    );
  });

  it("publishes the latest state shortly after snapshots stop, and not after a disconnect", async () => {
    const { result } = await connected("dev-token:alice");
    const ws = MockWebSocket.instances[0];
    const me = fnv1a32("alice");
    jest.useFakeTimers();
    let t = 10_000;
    jest.spyOn(performance, "now").mockImplementation(() => t);
    const at = (ms: number, tick: number) => {
      t = ms;
      act(() => {
        ws.onmessage?.(snap(tick, [{ id: me, type: EntityType.Player }]));
      });
    };
    at(10_000, 1);
    at(10_050, 2);
    at(10_100, 3);
    expect(result.current.gameState!.tick).toBe(1);

    // Snapshots stop; the socket stays open. React still catches up.
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(result.current.gameState!.tick).toBe(3);
    expect(result.current.updateCount).toBe(3);

    // A pending catch-up is dropped by a disconnect.
    at(10_200, 4);
    at(10_250, 5);
    act(() => result.current.disconnect());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.gameState).toBeNull();
  });

  it("times decode and update only while the debug readout is on", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    perfTimings.clear();
    timingGate.on = false;
    act(() => {
      ws.onmessage?.(snap(1, []));
    });
    expect(perfTimings.has("decode")).toBe(false);
    expect(perfTimings.has("update")).toBe(false);
    timingGate.on = true;
    act(() => {
      ws.onmessage?.(snap(2, []));
    });
    expect(perfTimings.get("decode")).toHaveLength(1);
    expect(perfTimings.get("update")).toHaveLength(1);
    expect(result.current.isConnected).toBe(true);
    timingGate.on = false;
  });

  it("starts a new position history when an entity comes back to life", async () => {
    const { result } = await connected("dev-token:alice");
    const ws = MockWebSocket.instances[0];
    const me = fnv1a32("alice");
    const send = (tick: number, flags: number, x: number) =>
      act(() => {
        ws.onmessage?.(
          snap(tick, [
            { id: me, type: EntityType.Player, flags, x },
            { id: 7, type: EntityType.Mob, flags, x },
          ]),
        );
      });
    const samples = () => {
      const s = result.current.gameStateRef.current!;
      return [
        s.players.get(String(me))!.samples!.length,
        s.mobs.get("7")!.samples!.length,
      ];
    };
    send(1, STATE_FLAG_ALIVE, 10);
    send(2, 0, 10);
    expect(samples()).toEqual([2, 2]);
    // Respawn 50 units away: under the teleport distance, still a cut, not a glide.
    send(3, STATE_FLAG_ALIVE, 60);
    expect(samples()).toEqual([1, 1]);
  });

  it("decodes combat events into gameState.events", async () => {
    const { result } = await connected();
    act(() => {
      MockWebSocket.instances[0].onmessage?.(
        snap(
          1,
          [],
          [],
          [
            { kind: GameEventKind.Hit, source: 11, target: 7, amount: 12 },
            { kind: GameEventKind.Kill, source: 11, target: 7, amount: 0 },
          ],
        ),
      );
    });
    expect(result.current.gameState!.events).toEqual([
      { kind: GameEventKind.Hit, sourceId: 11, targetId: 7, amount: 12 },
      { kind: GameEventKind.Kill, sourceId: 11, targetId: 7, amount: 0 },
    ]);
  });

  it("respawn() sends a ClientInput packet with respawn = true", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    const initialMsgCount = ws.sentMessages.length;

    act(() => {
      result.current.respawn();
    });

    expect(ws.sentMessages.length).toBe(initialMsgCount + 1);
    const lastMsg = ws.sentMessages[ws.sentMessages.length - 1];
    const bb = new flatbuffers.ByteBuffer(lastMsg);
    const input = ClientInput.getRootAsClientInput(bb);

    expect(input.respawn()).toBe(true);
  });

  it("sendPlayerAction with skill sends skill slot and mouse aim coordinates", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.sendPlayerAction("useSkill", true, {
        skillId: "skill_1",
        x: 350.5,
        y: 420.25,
        targetId: 77,
      });
    });

    const lastMsg = ws.sentMessages[ws.sentMessages.length - 1];
    const bb = new flatbuffers.ByteBuffer(lastMsg);
    const input = ClientInput.getRootAsClientInput(bb);

    expect(input.skillSlot()).toBe(1);
    expect(input.targetId()).toBe(77);
    expect(input.targetX()).toBeCloseTo(350.5);
    expect(input.targetY()).toBeCloseTo(420.25);
    expect(input.respawn()).toBe(false);
  });

  it("tracks the last non-zero target actually sent (server keeps it for AoE impact)", async () => {
    const { result } = await connected();
    expect(result.current.sentTargetRef.current).toEqual({ x: 0, y: 0 });
    act(() => {
      result.current.sendPlayerAction("useSkill", true, {
        skillId: "skill_1",
        x: 350,
        y: 420,
      });
    });
    expect(result.current.sentTargetRef.current).toEqual({ x: 350, y: 420 });
    // A later packet with a different target (e.g. attack press) replaces it.
    act(() => {
      result.current.sendPlayerAction("attack", true, { x: 10, y: 20 });
    });
    expect(result.current.sentTargetRef.current).toEqual({ x: 10, y: 20 });
    // Movement packets resend the same held aim, so it is unchanged.
    act(() => {
      result.current.updatePlayerInput(1, 0);
    });
    expect(result.current.sentTargetRef.current).toEqual({ x: 10, y: 20 });
  });

  it("stamps decoded players, mobs and projectiles with a finite receivedAt", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.(
        snap(1, [
          { id: 11, type: EntityType.Player, x: 1 },
          { id: 12, type: EntityType.Mob, x: 2 },
          { id: 13, type: EntityType.Projectile, x: 3, ownerId: 11 },
        ]),
      );
    });
    const gs = result.current.gameState!;
    for (const e of [
      gs.players.get("11")!,
      gs.mobs.get("12")!,
      gs.projectiles!.get("13")!,
    ]) {
      expect(Number.isFinite(e.receivedAt)).toBe(true);
    }
  });

  it("keeps a per-entity sample history on the server timeline", async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    const ents = (x: number) => [
      { id: 11, type: EntityType.Player, x },
      { id: 12, type: EntityType.Mob, x },
      { id: 13, type: EntityType.Projectile, x, ownerId: 11 },
    ];
    act(() => {
      ws.onmessage?.(snap(1, ents(1)));
      ws.onmessage?.(snap(2, ents(2)));
    });
    const gs = result.current.gameState!;
    expect(gs.renderClock).toBeDefined();
    for (const e of [
      gs.players.get("11")!,
      gs.mobs.get("12")!,
      gs.projectiles!.get("13")!,
    ]) {
      expect(e.samples!.map((s) => [s.t, s.x])).toEqual([
        [50, 1],
        [100, 2],
      ]);
    }
  });

  it("sets isAttacking and heading toward mouse aim on local player", async () => {
    const { result } = await connected("dev-token:alice");
    const ws = MockWebSocket.instances[0];
    const localId = result.current.playerId;

    // Send snapshot with local player at (100, 100) stationary
    act(() => {
      ws.onmessage?.(
        snap(1, [
          {
            id: Number(localId),
            type: EntityType.Player,
            x: 100,
            y: 100,
            vx: 0,
            vy: 0,
            flags: STATE_FLAG_ALIVE,
          },
        ]),
      );
    });

    let player = result.current.gameState!.players.get(localId)!;
    expect(player.isAttacking).toBe(false);

    // Aim at (100, 200) (directly down, dy = 100, dx = 0 => heading = PI/2) and start attack
    act(() => {
      result.current.sendPlayerAction("attack", true, { x: 100, y: 200 });
    });

    // Next frame update reflects attacking state and heading
    act(() => {
      ws.onmessage?.(
        snap(2, [
          {
            id: Number(localId),
            type: EntityType.Player,
            x: 100,
            y: 100,
            vx: 0,
            vy: 0,
            flags: STATE_FLAG_ALIVE,
          },
        ]),
      );
    });

    player = result.current.gameState!.players.get(localId)!;
    expect(player.isAttacking).toBe(true);
    expect(player.heading).toBeCloseTo(Math.PI / 2);
    expect(player.attackRange).toBe(40);
  });

  it("preserves heading when stopping movement and not attacking", async () => {
    const { result } = await connected("dev-token:alice");
    const ws = MockWebSocket.instances[0];
    const localId = result.current.playerId;

    // 1. Moving left: vx = -200, vy = 0 -> heading is PI (-3.14159)
    act(() => {
      ws.onmessage?.(
        snap(1, [
          {
            id: Number(localId),
            type: EntityType.Player,
            x: 200,
            y: 200,
            vx: -200,
            vy: 0,
            flags: STATE_FLAG_ALIVE,
          },
        ]),
      );
    });

    let player = result.current.gameState!.players.get(localId)!;
    expect(player.heading).toBeCloseTo(Math.PI);

    // 2. Stop moving: vx = 0, vy = 0, attack = false -> heading MUST STAY PI (facing left)
    act(() => {
      ws.onmessage?.(
        snap(2, [
          {
            id: Number(localId),
            type: EntityType.Player,
            x: 190,
            y: 200,
            vx: 0,
            vy: 0,
            flags: STATE_FLAG_ALIVE,
          },
        ]),
      );
    });

    player = result.current.gameState!.players.get(localId)!;
    expect(player.heading).toBeCloseTo(Math.PI);
  });
});
