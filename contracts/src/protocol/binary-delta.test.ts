import * as flatbuffers from 'flatbuffers';
import {
  BinaryDeltaDecoder,
  decodeSnapshot,
  DecodedEntityDelta,
} from './BinaryDeltaDecoder';
import {
  WorldSnapshot,
  EntityDelta,
  EntityType,
  Vec2,
} from './index';

function createSyntheticSnapshot(
  tick: number,
  serverTimeMs: number,
  entities: Array<{
    id: number;
    entityType: EntityType;
    x: number;
    y: number;
    vx: number;
    vy: number;
    health: number;
    maxHealth: number;
    stateFlags: number;
    targetId: number;
  }>,
  removedIds: number[]
): Uint8Array {
  const builder = new flatbuffers.Builder(1024);

  // Build entity deltas in reverse order for vector construction
  const entityOffsets: flatbuffers.Offset[] = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    EntityDelta.startEntityDelta(builder);
    EntityDelta.addId(builder, e.id);
    EntityDelta.addEntityType(builder, e.entityType);
    EntityDelta.addPos(builder, Vec2.createVec2(builder, e.x, e.y));
    EntityDelta.addVel(builder, Vec2.createVec2(builder, e.vx, e.vy));
    EntityDelta.addHealth(builder, e.health);
    EntityDelta.addMaxHealth(builder, e.maxHealth);
    EntityDelta.addStateFlags(builder, e.stateFlags);
    EntityDelta.addTargetId(builder, e.targetId);
    const offset = EntityDelta.endEntityDelta(builder);
    entityOffsets.push(offset);
  }

  const entitiesVec = entities.length > 0
    ? WorldSnapshot.createEntitiesVector(builder, entityOffsets)
    : 0;

  const removedVec = removedIds.length > 0
    ? WorldSnapshot.createRemovedIdsVector(builder, removedIds)
    : 0;

  WorldSnapshot.startWorldSnapshot(builder);
  WorldSnapshot.addTick(builder, tick);
  WorldSnapshot.addServerTimeMs(builder, BigInt(serverTimeMs));
  if (entities.length > 0) {
    WorldSnapshot.addEntities(builder, entitiesVec);
  }
  if (removedIds.length > 0) {
    WorldSnapshot.addRemovedIds(builder, removedVec);
  }
  const root = WorldSnapshot.endWorldSnapshot(builder);
  WorldSnapshot.finishWorldSnapshotBuffer(builder, root);

  return builder.asUint8Array();
}

describe('BinaryDeltaDecoder', () => {
  it('decodes an empty snapshot with no entities or removed IDs', () => {
    const buffer = createSyntheticSnapshot(1, 1000, [], []);
    const decoded = BinaryDeltaDecoder.decode(buffer);

    expect(decoded.tick).toBe(1);
    expect(decoded.serverTimeMs).toBe(1000);
    expect(decoded.entities).toEqual([]);
    expect(decoded.removedIds).toEqual([]);
  });

  it('decodes entities with full field parity and precision', () => {
    const testEntities = [
      {
        id: 10,
        entityType: EntityType.Player,
        x: 100.5,
        y: -250.25,
        vx: 1.5,
        vy: -3.0,
        health: 85.5,
        maxHealth: 100.0,
        stateFlags: 0b00000011,
        targetId: 42,
      },
      {
        id: 20,
        entityType: EntityType.Mob,
        x: 0.0,
        y: 50.0,
        vx: 0.0,
        vy: 0.0,
        health: 30.0,
        maxHealth: 50.0,
        stateFlags: 0,
        targetId: 10,
      },
      {
        id: 30,
        entityType: EntityType.Projectile,
        x: 12.0,
        y: 34.0,
        vx: 10.0,
        vy: 20.0,
        health: 1.0,
        maxHealth: 1.0,
        stateFlags: 0,
        targetId: 20,
      },
    ];
    const testRemoved = [99, 100, 101];

    const buffer = createSyntheticSnapshot(128, 1728000500, testEntities, testRemoved);
    const decoded = BinaryDeltaDecoder.decode(buffer);

    expect(decoded.tick).toBe(128);
    expect(decoded.serverTimeMs).toBe(1728000500);
    expect(decoded.entities.length).toBe(3);

    const [e0, e1, e2] = decoded.entities;

    expect(e0.id).toBe(10);
    expect(e0.entityType).toBe(EntityType.Player);
    expect(e0.x).toBeCloseTo(100.5, 4);
    expect(e0.y).toBeCloseTo(-250.25, 4);
    expect(e0.vx).toBeCloseTo(1.5, 4);
    expect(e0.vy).toBeCloseTo(-3.0, 4);
    expect(e0.health).toBeCloseTo(85.5, 4);
    expect(e0.maxHealth).toBeCloseTo(100.0, 4);
    expect(e0.stateFlags).toBe(3);
    expect(e0.targetId).toBe(42);

    expect(e1.id).toBe(20);
    expect(e1.entityType).toBe(EntityType.Mob);
    expect(e1.health).toBeCloseTo(30.0, 4);
    expect(e1.targetId).toBe(10);

    expect(e2.id).toBe(30);
    expect(e2.entityType).toBe(EntityType.Projectile);

    expect(decoded.removedIds).toEqual([99, 100, 101]);
  });

  it('accepts ArrayBuffer directly as input', () => {
    const uint8 = createSyntheticSnapshot(5, 500, [], [7]);
    const arrayBuffer = uint8.buffer.slice(
      uint8.byteOffset,
      uint8.byteOffset + uint8.byteLength
    );

    const decoded = BinaryDeltaDecoder.decode(arrayBuffer);
    expect(decoded.tick).toBe(5);
    expect(decoded.removedIds).toEqual([7]);
  });

  it('works via helper function decodeSnapshot and instance decode()', () => {
    const buffer = createSyntheticSnapshot(9, 9000, [], []);

    const viaHelper = decodeSnapshot(buffer);
    expect(viaHelper.tick).toBe(9);

    const decoderInstance = new BinaryDeltaDecoder();
    const viaInstance = decoderInstance.decode(buffer);
    expect(viaInstance.tick).toBe(9);
  });
});
