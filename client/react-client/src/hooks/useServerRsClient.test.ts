import { renderHook, act } from '@testing-library/react';
import { TextEncoder, TextDecoder } from 'util';
import * as flatbuffers from 'flatbuffers';
import { useServerRsClient, skillSlotFor, fnv1a32 } from './useServerRsClient';
import { WorldSnapshot } from '../protocol/generated/atlas/protocol/world-snapshot';
import { EntityDelta } from '../protocol/generated/atlas/protocol/entity-delta';
import { EntityType } from '../protocol/generated/atlas/protocol/entity-type';
import { Vec2 } from '../protocol/generated/atlas/protocol/vec2';
import { ClientInput } from '../protocol/generated/atlas/protocol/client-input';

(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  binaryType: string = 'blob';
  readyState: number = 1; // OPEN
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  sentMessages: any[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
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

  const entitiesVec = WorldSnapshot.createEntitiesVector(fbb, [playerOffset, mobOffset]);
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

describe('useServerRsClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    localStorage.clear();
  });

  it('initializes in disconnected state', () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: 'localhost',
        serverPort: 2567,
        useSSL: false,
      })
    );

    expect(result.current.isConnected).toBe(false);
    expect(result.current.gameState).toBeNull();
    expect(result.current.updateCount).toBe(0);
  });

  it('connects to server-rs WebSocket gateway and processes binary snapshot', async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: 'localhost',
        serverPort: 2567,
        useSSL: false,
        token: 'test-jwt-token',
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain('token=test-jwt-token');

    // Simulate incoming FlatBuffers snapshot
    const testSnapshot = createTestSnapshotBuffer(42);
    act(() => {
      const ws = MockWebSocket.instances[0];
      if (ws.onmessage) {
        ws.onmessage({ data: testSnapshot.buffer.slice(testSnapshot.byteOffset, testSnapshot.byteOffset + testSnapshot.byteLength) });
      }
    });

    expect(result.current.updateCount).toBe(1);
    expect(result.current.gameState?.tick).toBe(42);
    expect(result.current.gameState?.players.has('101')).toBe(true);
    expect(result.current.gameState?.players.get('101')?.x).toBe(500);
    expect(result.current.gameState?.mobs.has('202')).toBe(true);
    expect(result.current.gameState?.mobs.get('202')?.y).toBe(400);
  });

  it('sends FlatBuffers ClientInput on updatePlayerInput', async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: 'localhost',
        serverPort: 2567,
        useSSL: false,
      })
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
    const initialInput = ClientInput.getRootAsClientInput(new flatbuffers.ByteBuffer(initialBytes));
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

  it('disconnects and resets state cleanly', async () => {
    const { result } = renderHook(() =>
      useServerRsClient({
        serverHost: 'localhost',
        serverPort: 2567,
        useSSL: false,
      })
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

  const decode = (bytes: Uint8Array) => ClientInput.getRootAsClientInput(new flatbuffers.ByteBuffer(bytes));
  const connected = async (token?: string) => {
    const view = renderHook(() =>
      useServerRsClient({ serverHost: 'localhost', serverPort: 2567, useSSL: false, token })
    );
    await act(async () => {
      await view.result.current.connect();
    });
    return view;
  };

  it('keeps the held move vector when attacking (regression: attack cancelled movement)', async () => {
    const { result } = await connected();
    act(() => {
      result.current.updatePlayerInput(2, 0);
      result.current.sendPlayerAction('attack', true);
    });
    const last = decode(MockWebSocket.instances[0].sentMessages.at(-1));
    expect(last.moveX()).toBeCloseTo(2);
    expect(last.attack()).toBe(true);
  });

  it('keeps attack held while the move vector changes, and releases it', async () => {
    const { result } = await connected();
    act(() => {
      result.current.sendPlayerAction('attack', true);
      result.current.updatePlayerInput(0, -2);
    });
    const ws = MockWebSocket.instances[0];
    let last = decode(ws.sentMessages.at(-1));
    expect(last.moveY()).toBeCloseTo(-2);
    expect(last.attack()).toBe(true);

    act(() => {
      result.current.sendPlayerAction('attack', false);
    });
    last = decode(ws.sentMessages.at(-1));
    expect(last.attack()).toBe(false);
    expect(last.moveY()).toBeCloseTo(-2);
  });

  it('maps skills (incl. dash) to server slots and keeps movement', async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      result.current.updatePlayerInput(0, 2);
    });
    for (const [skillId, slot] of [['skill_1', 1], ['skill_4', 4], ['skill_dash', 5]] as const) {
      act(() => {
      result.current.sendPlayerAction('useSkill', true, { skillId });
    });
      const last = decode(ws.sentMessages.at(-1));
      expect(last.skillSlot()).toBe(slot);
      expect(last.moveY()).toBeCloseTo(2);
    }
  });

  it('skillSlotFor handles unknown ids and explicit slots', () => {
    expect(skillSlotFor({ skillId: 'nope' })).toBe(0);
    expect(skillSlotFor({ skillSlot: 3 })).toBe(3);
    expect(skillSlotFor(undefined)).toBe(0);
  });

  it('tags only the local session as "Player (YOU)"', async () => {
    // fnv1a32('dev-player') === 4026785618 matches the server's id hash
    expect(fnv1a32('dev-player')).toBe(4026785618);
    const { result } = await connected('dev-token:alice');
    const me = fnv1a32('alice');
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
    expect(mine.name).toBe('Player (YOU)');
    expect(mine.isBotMode).toBe(false);
    expect(mine.radius).toBeGreaterThan(0);
    expect(mine.currentHealth).toBe(80);
    expect(result.current.gameState!.players.get('12345')!.isBotMode).toBe(true);
  });

  it('disconnect during CONNECTING closes the socket (StrictMode double-mount leak)', async () => {
    const { result } = renderHook(() =>
      useServerRsClient({ serverHost: 'localhost', serverPort: 2567, useSSL: false })
    );
    act(() => {
      result.current.connect();
      result.current.disconnect();
    });
    expect(MockWebSocket.instances[0].readyState).toBe(3);
  });

  it('joinRoom reflects the selected map in roomId and gameState', async () => {
    const { result } = await connected();
    await act(async () => {
      await result.current.joinRoom('map-for-test-projectile');
    });
    expect(result.current.roomId).toBe('server-rs-map-for-test-projectile');
    expect(result.current.gameState?.mapId).toBe('map-for-test-projectile');
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

  it('mob positions follow every snapshot (regression: ...existing spread last froze mobs)', async () => {
    const { result } = await connected();
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onmessage?.(frame(1, 100));
    });
    act(() => {
      ws.onmessage?.(frame(2, 150));
    });
    expect(result.current.gameState!.mobs.get('202')!.x).toBe(150);
  });

  it('ignores frames from a socket that was disconnected', async () => {
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

  it('connect() settles when disconnected during CONNECTING (no hung promise)', async () => {
    const { result } = renderHook(() =>
      useServerRsClient({ serverHost: 'localhost', serverPort: 2567, useSSL: false })
    );
    let p!: Promise<void>;
    act(() => {
      p = result.current.connect() as Promise<void>;
      result.current.disconnect();
    });
    await expect(p).resolves.toBeUndefined();
  });

  it('disconnect resets held input so a reconnect does not replay stale movement', async () => {
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
      result.current.sendPlayerAction('attack', true);
    });
    const last = decode(MockWebSocket.instances[1].sentMessages.at(-1));
    expect(last.moveX()).toBe(0);
    expect(last.attack()).toBe(true);
  });
});
