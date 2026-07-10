import {
  COLLECTIONS,
  STORAGE_KEY,
  defaultDoc,
  type ProfileDoc,
  type InventoryDoc,
  type EquipmentDoc,
  type SkillsDoc,
  type QuestsDoc,
} from '@atlas/contracts';

/**
 * Local mirror of contracts' internal collection->doc-type map. Contracts
 * only exports the generic `defaultDoc<K>` function, not the map type
 * itself, so this small structural duplicate lets storage.ts stay generic
 * over `COLLECTIONS` instead of hand-writing five near-identical overloads.
 */
type CollectionDocs = {
  [COLLECTIONS.profile]: ProfileDoc;
  [COLLECTIONS.inventory]: InventoryDoc;
  [COLLECTIONS.equipment]: EquipmentDoc;
  [COLLECTIONS.skills]: SkillsDoc;
  [COLLECTIONS.quests]: QuestsDoc;
};

export type CollectionKey = keyof CollectionDocs;

/** No collection has ever shipped a schema past version 1 yet. */
const CURRENT_SCHEMA_VERSION = 1;

/** Sentinel version passed to writeDoc for a doc that doesn't exist yet (create-only CAS). */
export const NEW_DOC_VERSION = '*';

export interface DocRead<K extends CollectionKey> {
  doc: CollectionDocs[K];
  version: string;
}

/**
 * Migrates a raw storage value up to CURRENT_SCHEMA_VERSION. Since only
 * version 1 has ever existed, anything already at 1 passes through
 * unchanged; anything older/malformed (missing or non-numeric
 * schemaVersion) is untrusted and reset to the collection default rather
 * than guessed at. Extend this switch when schema v2 ships.
 */
function migrateDoc<K extends CollectionKey>(
  collection: K,
  raw: Record<string, unknown>,
): CollectionDocs[K] {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version >= CURRENT_SCHEMA_VERSION) {
    return raw as unknown as CollectionDocs[K];
  }
  return defaultDoc(collection);
}

/**
 * Reads a player's doc for `collection`, creating (in memory only — not
 * persisted) a fresh default on miss. Callers that want the default
 * persisted must writeDoc with NEW_DOC_VERSION.
 */
export function readDoc<K extends CollectionKey>(
  nk: nkruntime.Nakama,
  userId: string,
  collection: K,
): DocRead<K> {
  const objects = nk.storageRead([{ collection, key: STORAGE_KEY, userId }]);
  if (objects.length === 0) {
    return { doc: defaultDoc(collection), version: NEW_DOC_VERSION };
  }
  const migrated = migrateDoc(collection, objects[0].value as Record<string, unknown>);
  return { doc: migrated, version: objects[0].version };
}

/**
 * Conditional write: the server-authoritative write path for all meta
 * collections. `version` must be either NEW_DOC_VERSION (create-only) or a
 * version string previously returned by readDoc/writeDoc (optimistic
 * concurrency). Nakama throws on a version mismatch/conflict; callers are
 * expected to re-read and retry once (see rpc/grantXp.ts for the pattern).
 * Client read/write permissions are fixed: read=2 (owner), write=0 (server
 * only) — all mutation goes through RPCs, never direct client writes.
 */
export function writeDoc<K extends CollectionKey>(
  nk: nkruntime.Nakama,
  userId: string,
  collection: K,
  doc: CollectionDocs[K],
  version: string,
): string {
  const acks = nk.storageWrite([
    {
      collection,
      key: STORAGE_KEY,
      userId,
      value: doc as unknown as { [key: string]: unknown },
      version,
      permissionRead: 2,
      permissionWrite: 0,
    },
  ]);
  return acks[0].version;
}
