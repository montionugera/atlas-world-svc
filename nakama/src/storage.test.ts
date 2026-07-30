import { COLLECTIONS, STORAGE_KEY, DEFAULT_PROFILE } from '@atlas/contracts';
import { NEW_DOC_VERSION, readDoc, writeDoc } from './storage';

/** Minimal stub of the subset of nkruntime.Nakama storage.ts touches. */
function stubNk(overrides: {
  storageRead?: jest.Mock;
  storageWrite?: jest.Mock;
}): nkruntime.Nakama {
  return {
    storageRead: overrides.storageRead ?? jest.fn(() => []),
    storageWrite: overrides.storageWrite ?? jest.fn(() => [{ version: 'v1' }]),
  } as unknown as nkruntime.Nakama;
}

describe('readDoc', () => {
  it('returns a fresh default doc with NEW_DOC_VERSION on storage miss', () => {
    const nk = stubNk({ storageRead: jest.fn(() => []) });
    const { doc, version } = readDoc(nk, 'user-1', COLLECTIONS.profile);
    expect(doc).toEqual(DEFAULT_PROFILE);
    expect(version).toBe(NEW_DOC_VERSION);
  });

  it('passes through a doc already at the current schema version', () => {
    const stored = { ...DEFAULT_PROFILE, level: 5 };
    const nk = stubNk({
      storageRead: jest.fn(() => [
        { collection: COLLECTIONS.profile, key: STORAGE_KEY, userId: 'user-1', version: 'v7', value: stored },
      ]),
    });
    const { doc, version } = readDoc(nk, 'user-1', COLLECTIONS.profile);
    expect(doc).toEqual(stored);
    expect(version).toBe('v7');
  });

  it('resets to the collection default when schemaVersion is missing/older', () => {
    const corrupt = { level: 5 }; // no schemaVersion at all
    const nk = stubNk({
      storageRead: jest.fn(() => [
        { collection: COLLECTIONS.profile, key: STORAGE_KEY, userId: 'user-1', version: 'v3', value: corrupt },
      ]),
    });
    const { doc } = readDoc(nk, 'user-1', COLLECTIONS.profile);
    expect(doc).toEqual(DEFAULT_PROFILE);
  });
});

describe('migrateDoc v1 -> v2 (dex added to PrimaryStats)', () => {
  /** A profile exactly as v1 persisted it: no `dex`, real progression. */
  const V1_PROFILE = {
    schemaVersion: 1,
    level: 27,
    xp: 4310,
    statPoints: 9,
    allocated: { str: 40, agi: 12, int: 3, vit: 25 },
  };

  /** storageRead stub returning one stored value at CAS version 'v9'. */
  function nkWith(collection: string, value: unknown) {
    return stubNk({
      storageRead: jest.fn(() => [
        { collection, key: STORAGE_KEY, userId: 'user-1', version: 'v9', value },
      ]),
    });
  }

  it('migrates a v1 profile to v2 with dex 1 and KEEPS level, xp and statPoints', () => {
    const nk = nkWith(COLLECTIONS.profile, V1_PROFILE);
    const { doc, version } = readDoc(nk, 'user-1', COLLECTIONS.profile);
    expect(doc.schemaVersion).toBe(2);
    // The whole point: falling through to defaultDoc here would silently wipe
    // every player's progression.
    expect(doc.level).toBe(27);
    expect(doc.xp).toBe(4310);
    expect(doc.statPoints).toBe(9);
    expect(doc.allocated).toEqual({ str: 40, agi: 12, int: 3, vit: 25, dex: 1 });
    // A migration must not consume the CAS version — the caller still needs it.
    expect(version).toBe('v9');
  });

  it('leaves an existing dex value alone rather than resetting it to 1', () => {
    const nk = nkWith(COLLECTIONS.profile, {
      ...V1_PROFILE,
      allocated: { ...V1_PROFILE.allocated, dex: 17 },
    });
    const { doc } = readDoc(nk, 'user-1', COLLECTIONS.profile);
    expect(doc.allocated.dex).toBe(17);
  });

  it('passes a v1 doc of an unchanged collection straight through', () => {
    const nk = nkWith(COLLECTIONS.inventory, {
      schemaVersion: 1,
      stackables: [{ itemId: 'potion_minor', qty: 3 }],
      uniques: [],
    });
    const { doc } = readDoc(nk, 'user-1', COLLECTIONS.inventory);
    expect(doc.stackables).toEqual([{ itemId: 'potion_minor', qty: 3 }]);
    // inventory never went to v2 — its own current version is still 1, so this
    // is a passthrough, not a migration.
    expect(doc.schemaVersion).toBe(1);
  });

  it('still resets a doc with no schemaVersion at all — untrusted, not migratable', () => {
    const nk = nkWith(COLLECTIONS.profile, { level: 99, xp: 1 });
    const { doc } = readDoc(nk, 'user-1', COLLECTIONS.profile);
    expect(doc).toEqual(DEFAULT_PROFILE);
    expect(doc.allocated.dex).toBe(1);
  });
});

describe('writeDoc', () => {
  it('writes with owner-read/no-client-write permissions and the given version', () => {
    const write = jest.fn(() => [{ version: 'v2' }]);
    const nk = stubNk({ storageWrite: write });
    const newVersion = writeDoc(nk, 'user-1', COLLECTIONS.profile, DEFAULT_PROFILE, NEW_DOC_VERSION);
    expect(newVersion).toBe('v2');
    expect(write).toHaveBeenCalledWith([
      expect.objectContaining({
        collection: COLLECTIONS.profile,
        key: STORAGE_KEY,
        userId: 'user-1',
        value: DEFAULT_PROFILE,
        version: NEW_DOC_VERSION,
        permissionRead: 2,
        permissionWrite: 0,
      }),
    ]);
  });
});
