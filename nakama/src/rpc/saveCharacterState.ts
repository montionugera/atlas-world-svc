import { STORAGE_KEY, characterStateDocSchema, type CharacterStateDoc } from '@atlas/contracts';

export const CHARACTER_STATE_COLLECTION = 'character_state';

interface SaveCharacterStatePayload {
  userId: string;
  mapId: string;
  x: number;
  y: number;
  health: number;
  seq: number;
}

function parsePayload(raw: string): SaveCharacterStatePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('save_character_state: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('save_character_state: payload must be a JSON object');
  }
  const { userId, mapId, x, y, health, seq } = parsed as Record<string, unknown>;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('save_character_state: userId must be a non-empty string');
  }
  if (typeof mapId !== 'string' || mapId.length === 0) {
    throw new Error('save_character_state: mapId must be a non-empty string');
  }
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error('save_character_state: x must be a finite number');
  }
  if (typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error('save_character_state: y must be a finite number');
  }
  if (typeof health !== 'number' || !Number.isFinite(health) || health < 0) {
    throw new Error('save_character_state: health must be a non-negative finite number');
  }
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    throw new Error('save_character_state: seq must be a non-negative integer');
  }
  return { userId, mapId, x, y, health, seq };
}

export function readCharacterStateDoc(
  nk: nkruntime.Nakama,
  userId: string,
): { doc: CharacterStateDoc | undefined; version: string } {
  const objects = nk.storageRead([
    { collection: CHARACTER_STATE_COLLECTION, key: STORAGE_KEY, userId },
  ]);
  if (objects.length === 0) {
    return { doc: undefined, version: '*' };
  }
  const parsed = characterStateDocSchema.safeParse(objects[0].value);
  if (!parsed.success) {
    return { doc: undefined, version: objects[0].version };
  }
  return { doc: parsed.data, version: objects[0].version };
}

/**
 * save_character_state — S2S only. Persists the player's world position and
 * current health with CAS and monotonic `seq` ordering so out-of-order HTTP
 * writes or crash-recovery replays never overwrite newer state.
 */
export const saveCharacterState: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (ctx.userId) {
    throw new Error(
      'save_character_state is server-only (S2S http_key) and cannot be called by an authenticated client',
    );
  }
  const { userId, mapId, x, y, health, seq } = parsePayload(payload);

  const current = readCharacterStateDoc(nk, userId);
  if (current.doc && seq <= current.doc.seq) {
    return JSON.stringify({ deduped: true, seq: current.doc.seq });
  }

  const nextDoc: CharacterStateDoc = {
    schemaVersion: 1,
    mapId,
    x,
    y,
    health,
    seq,
  };
  characterStateDocSchema.parse(nextDoc);

  nk.storageWrite([
    {
      collection: CHARACTER_STATE_COLLECTION,
      key: STORAGE_KEY,
      userId,
      value: nextDoc as unknown as { [key: string]: unknown },
      version: current.version,
      permissionRead: 2,
      permissionWrite: 0,
    },
  ]);

  return JSON.stringify({ deduped: false, seq });
};
