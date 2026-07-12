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
