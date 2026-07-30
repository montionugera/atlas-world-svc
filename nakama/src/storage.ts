import {
  COLLECTIONS,
  STORAGE_KEY,
  defaultDoc,
  type PrimaryStats,
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

/**
 * Current schema version PER COLLECTION. This is deliberately not one global
 * constant: `profile` went to v2 when `dex` joined PrimaryStats, while every
 * other collection is still v1 and its `schemaVersion` field is typed as the
 * literal `1`. A single global would force those collections to a version their
 * own type forbids, and would send their perfectly-current docs down the
 * migration path for no reason.
 */
const SCHEMA_VERSIONS = {
  [COLLECTIONS.profile]: 2,
  [COLLECTIONS.inventory]: 1,
  [COLLECTIONS.equipment]: 1,
  [COLLECTIONS.skills]: 1,
  [COLLECTIONS.quests]: 1,
} as const satisfies Record<CollectionKey, number>;

/** Sentinel version passed to writeDoc for a doc that doesn't exist yet (create-only CAS). */
export const NEW_DOC_VERSION = '*';

export interface DocRead<K extends CollectionKey> {
  doc: CollectionDocs[K];
  version: string;
}

/**
 * Migrates a raw storage value up to its collection's current schema version.
 * A doc already at (or past) that version passes through unchanged.
 *
 * Anything older gets an EXPLICIT migration case. The `defaultDoc` fallback at
 * the bottom is only for docs that are untrusted — a missing or non-numeric
 * `schemaVersion` — because those cannot be interpreted at all. Reaching that
 * fallback with real progression in hand would DISCARD level/xp/statPoints, so
 * every version that has ever shipped must be handled above it.
 */
function migrateDoc<K extends CollectionKey>(
  collection: K,
  raw: Record<string, unknown>,
): CollectionDocs[K] {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version >= SCHEMA_VERSIONS[collection]) {
    return raw as unknown as CollectionDocs[K];
  }

  // v1 -> v2: `profile` gained `dex`. No other collection changed shape, and
  // none of them is past v1, so they never reach here.
  if (version === 1 && collection === COLLECTIONS.profile) {
    const allocated = (raw.allocated ?? {}) as Partial<PrimaryStats>;
    return {
      ...raw,
      schemaVersion: 2,
      // Default to 1, matching DEFAULT_PROFILE — never overwrite a dex that is
      // somehow already present.
      allocated: { ...allocated, dex: allocated.dex ?? 1 },
    } as unknown as CollectionDocs[K];
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
