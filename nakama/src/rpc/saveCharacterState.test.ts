import { STORAGE_KEY } from '@atlas/contracts';
import { CHARACTER_STATE_COLLECTION, saveCharacterState } from './saveCharacterState';

function stubLogger(): nkruntime.Logger {
  return { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as nkruntime.Logger;
}

function stubCtx(userId = ''): nkruntime.Context {
  return { userId } as unknown as nkruntime.Context;
}

function stubNk(overrides: {
  storageRead?: jest.Mock;
  storageWrite?: jest.Mock;
}): nkruntime.Nakama {
  return {
    storageRead: overrides.storageRead ?? jest.fn(() => []),
    storageWrite: overrides.storageWrite ?? jest.fn(() => [{ version: 'v-next' }]),
  } as unknown as nkruntime.Nakama;
}

describe('saveCharacterState', () => {
  it('rejects authenticated client calls (S2S only)', () => {
    const nk = stubNk({});
    expect(() =>
      saveCharacterState(
        stubCtx('user-1'),
        stubLogger(),
        nk,
        JSON.stringify({ userId: 'user-1', mapId: 'map-for-play', x: 100, y: 200, health: 90, seq: 1 }),
      ),
    ).toThrow(/server-only/);
  });

  it('writes character state with CAS and dedupes stale seq', () => {
    const storageWrite = jest.fn(() => [{ version: 'v-1' }]);
    const nk1 = stubNk({ storageWrite });

    const res1 = JSON.parse(
      saveCharacterState(
        stubCtx(''),
        stubLogger(),
        nk1,
        JSON.stringify({ userId: 'user-1', mapId: 'map-for-play', x: 325.5, y: 410.25, health: 85, seq: 10 }),
      ) as string,
    );
    expect(res1).toEqual({ deduped: false, seq: 10 });
    expect(storageWrite).toHaveBeenCalledWith([
      {
        collection: CHARACTER_STATE_COLLECTION,
        key: STORAGE_KEY,
        userId: 'user-1',
        value: {
          schemaVersion: 1,
          mapId: 'map-for-play',
          x: 325.5,
          y: 410.25,
          health: 85,
          seq: 10,
        },
        version: '*',
        permissionRead: 2,
        permissionWrite: 0,
      },
    ]);

    const storageRead = jest.fn(() => [
      {
        collection: CHARACTER_STATE_COLLECTION,
        key: STORAGE_KEY,
        userId: 'user-1',
        version: 'v-1',
        value: {
          schemaVersion: 1,
          mapId: 'map-for-play',
          x: 325.5,
          y: 410.25,
          health: 85,
          seq: 10,
        },
      },
    ]);
    const storageWrite2 = jest.fn();
    const nk2 = stubNk({ storageRead, storageWrite: storageWrite2 });

    const staleRes = JSON.parse(
      saveCharacterState(
        stubCtx(''),
        stubLogger(),
        nk2,
        JSON.stringify({ userId: 'user-1', mapId: 'map-for-play', x: 10, y: 10, health: 10, seq: 9 }),
      ) as string,
    );
    expect(staleRes).toEqual({ deduped: true, seq: 10 });
    expect(storageWrite2).not.toHaveBeenCalled();
  });
});
