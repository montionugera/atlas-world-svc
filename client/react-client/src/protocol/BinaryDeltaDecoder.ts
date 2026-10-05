import * as flatbuffers from 'flatbuffers';
import { WorldSnapshot } from './generated/atlas/protocol/world-snapshot';
import { EntityDelta } from './generated/atlas/protocol/entity-delta';
import { EntityType } from './generated/atlas/protocol/entity-type';

export { EntityType };

export interface DecodedEntityDelta {
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
}

export interface DecodedSnapshot {
  tick: number;
  serverTimeMs: number;
  entities: DecodedEntityDelta[];
  removedIds: number[];
}

export class BinaryDeltaDecoder {
  /**
   * Decodes a binary FlatBuffers buffer into a DecodedSnapshot.
   *
   * @param buffer Raw binary buffer (Uint8Array or ArrayBufferLike) containing a WorldSnapshot
   * @returns Clean parsed DecodedSnapshot
   */
  static decode(buffer: Uint8Array | ArrayBufferLike): DecodedSnapshot {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
    const bb = new flatbuffers.ByteBuffer(uint8);
    const snapshot = WorldSnapshot.getRootAsWorldSnapshot(bb);

    const entitiesLength = snapshot.entitiesLength();
    const entities: DecodedEntityDelta[] = new Array(entitiesLength);

    // Reusable EntityDelta accessor to minimize garbage collection
    let entityAccessor = new EntityDelta();

    for (let i = 0; i < entitiesLength; i++) {
      const entity = snapshot.entities(i, entityAccessor);
      if (!entity) continue;

      const pos = entity.pos();
      const vel = entity.vel();

      entities[i] = {
        id: entity.id(),
        entityType: entity.entityType(),
        x: pos ? pos.x() : 0,
        y: pos ? pos.y() : 0,
        vx: vel ? vel.x() : 0,
        vy: vel ? vel.y() : 0,
        health: entity.health(),
        maxHealth: entity.maxHealth(),
        stateFlags: entity.stateFlags(),
        targetId: entity.targetId(),
      };
    }

    const removedLength = snapshot.removedIdsLength();
    const removedIds: number[] = new Array(removedLength);
    for (let i = 0; i < removedLength; i++) {
      removedIds[i] = snapshot.removedIds(i) ?? 0;
    }

    return {
      tick: snapshot.tick(),
      serverTimeMs: Number(snapshot.serverTimeMs()),
      entities,
      removedIds,
    };
  }

  /**
   * Instance method for decode.
   */
  decode(buffer: Uint8Array | ArrayBufferLike): DecodedSnapshot {
    return BinaryDeltaDecoder.decode(buffer);
  }
}

export function decodeSnapshot(buffer: Uint8Array | ArrayBufferLike): DecodedSnapshot {
  return BinaryDeltaDecoder.decode(buffer);
}
