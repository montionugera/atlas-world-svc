import * as fs from 'fs';
import * as path from 'path';
import * as flatbuffers from 'flatbuffers';
import {
  BinaryDeltaDecoder,
  EntityType,
  WorldSnapshot,
  EntityDelta,
  Vec2,
} from './index';

describe('Cross-Language Binary Parity & Bandwidth Assertion (Task 4)', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/snapshot_test.bin');

  it('ingests snapshot_test.bin from server-rs and verifies exact field parity', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const buffer = fs.readFileSync(fixturePath);

    // Bandwidth check for full 60-entity frame
    expect(buffer.length).toBeLessThan(2560); // < 2.5 KB
    const bytesPerEntity = buffer.length / 60;
    expect(bytesPerEntity).toBeLessThan(40.0); // < 40 bytes per entity delta

    const decoded = BinaryDeltaDecoder.decode(buffer);

    expect(decoded.tick).toBe(1000);
    expect(decoded.serverTimeMs).toBe(1728001000);
    expect(decoded.entities.length).toBe(60);

    // Verify 10 Players
    for (let i = 1; i <= 10; i++) {
      const player = decoded.entities[i - 1];
      expect(player.id).toBe(i);
      expect(player.entityType).toBe(EntityType.Player);
      expect(player.x).toBeCloseTo(100.0 + i * 10.0, 4);
      expect(player.y).toBeCloseTo(200.0 + i * 5.0, 4);
      expect(player.vx).toBeCloseTo(1.5, 4);
      expect(player.vy).toBeCloseTo(-0.5, 4);
      expect(player.health).toBeCloseTo(100.0 - i * 2.0, 4);
      expect(player.maxHealth).toBeCloseTo(100.0, 4);
      expect(player.stateFlags).toBe(i & 3);
      expect(player.targetId).toBe(i > 1 ? i - 1 : 0);
    }

    // Verify 50 Mobs
    for (let j = 1; j <= 50; j++) {
      const mob = decoded.entities[10 + j - 1];
      expect(mob.id).toBe(100 + j);
      expect(mob.entityType).toBe(EntityType.Mob);
      expect(mob.x).toBeCloseTo(500.0 + j * 2.0, 4);
      expect(mob.y).toBeCloseTo(600.0 - j * 3.0, 4);
      expect(mob.vx).toBeCloseTo(0.0, 4);
      expect(mob.vy).toBeCloseTo(0.0, 4);
      expect(mob.health).toBeCloseTo(50.0, 4);
      expect(mob.maxHealth).toBeCloseTo(50.0, 4);
      expect(mob.stateFlags).toBe(0);
      expect(mob.targetId).toBe((j % 10) + 1);
    }

    // Verify Removed IDs
    expect(decoded.removedIds).toEqual([9001, 9002, 9003]);
  });

  it('asserts wire bandwidth for typical delta update (15 entities in AOI view) is <= 250 bytes (<= 5 KB/s at 20 Hz)', () => {
    // In an AOI view of 15 entities, delta culling replicates active/dirty entities
    // (~20% dirty rate = 3 active entities per 50ms tick).
    const builder = new flatbuffers.Builder(512);

    const activeEntities = [
      {
        id: 1,
        entityType: EntityType.Player,
        x: 101.5,
        y: 201.0,
        vx: 1.5,
        vy: 0.0,
        health: 98.0,
        maxHealth: 100.0,
        stateFlags: 1,
        targetId: 101,
      },
      {
        id: 101,
        entityType: EntityType.Mob,
        x: 105.0,
        y: 200.0,
        vx: -0.5,
        vy: 0.0,
        health: 45.0,
        maxHealth: 50.0,
        stateFlags: 0,
        targetId: 1,
      },
      {
        id: 201,
        entityType: EntityType.Projectile,
        x: 103.0,
        y: 200.5,
        vx: 10.0,
        vy: 0.0,
        health: 1.0,
        maxHealth: 1.0,
        stateFlags: 0,
        targetId: 101,
      },
    ];

    const entityOffsets: flatbuffers.Offset[] = [];
    for (const e of activeEntities) {
      EntityDelta.startEntityDelta(builder);
      EntityDelta.addId(builder, e.id);
      EntityDelta.addEntityType(builder, e.entityType);
      EntityDelta.addPos(builder, Vec2.createVec2(builder, e.x, e.y));
      if (e.vx !== 0 || e.vy !== 0) {
        EntityDelta.addVel(builder, Vec2.createVec2(builder, e.vx, e.vy));
      }
      EntityDelta.addHealth(builder, e.health);
      EntityDelta.addMaxHealth(builder, e.maxHealth);
      EntityDelta.addStateFlags(builder, e.stateFlags);
      EntityDelta.addTargetId(builder, e.targetId);
      entityOffsets.push(EntityDelta.endEntityDelta(builder));
    }

    const entitiesVec = WorldSnapshot.createEntitiesVector(builder, entityOffsets);

    WorldSnapshot.startWorldSnapshot(builder);
    WorldSnapshot.addTick(builder, 1001);
    WorldSnapshot.addServerTimeMs(builder, BigInt(1728001050));
    WorldSnapshot.addEntities(builder, entitiesVec);
    const root = WorldSnapshot.endWorldSnapshot(builder);
    WorldSnapshot.finishWorldSnapshotBuffer(builder, root);

    const deltaBytes = builder.asUint8Array();

    // Wire bandwidth assertion
    expect(deltaBytes.length).toBeLessThanOrEqual(250); // <= 250 bytes

    const bandwidth20Hz = deltaBytes.length * 20; // 20 updates per second
    expect(bandwidth20Hz).toBeLessThanOrEqual(5000); // <= 5 KB/s (5000 bytes/s)

    // Decode and verify field correctness
    const decoded = BinaryDeltaDecoder.decode(deltaBytes);
    expect(decoded.tick).toBe(1001);
    expect(decoded.entities.length).toBe(3);
    expect(decoded.entities[0].id).toBe(1);
    expect(decoded.entities[0].vx).toBeCloseTo(1.5, 4);
    expect(decoded.entities[1].id).toBe(101);
    expect(decoded.entities[2].id).toBe(201);
  });
});
