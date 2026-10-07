import { renderHook, act } from '@testing-library/react';
import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

import * as flatbuffers from 'flatbuffers';
import { useServerRsClient } from './useServerRsClient';
import { WorldSnapshot } from '../protocol/generated/atlas/protocol/world-snapshot';
import { EntityDelta } from '../protocol/generated/atlas/protocol/entity-delta';
import { EntityType } from '../protocol/generated/atlas/protocol/entity-type';
import { Vec2 } from '../protocol/generated/atlas/protocol/vec2';
import { ClientInput } from '../protocol/generated/atlas/protocol/client-input';

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
});
