import { DEFAULT_PROFILE, COLLECTIONS, STORAGE_KEY } from '@atlas/contracts';
import { grantXp } from './grantXp';

function stubLogger(): nkruntime.Logger {
  return { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as nkruntime.Logger;
}

function stubCtx(userId = ''): nkruntime.Context {
  return { userId } as unknown as nkruntime.Context;
}

function stubNk(overrides: { storageRead?: jest.Mock; storageWrite?: jest.Mock }): nkruntime.Nakama {
  return {
    storageRead: overrides.storageRead ?? jest.fn(() => []),
    storageWrite: overrides.storageWrite ?? jest.fn(() => [{ version: 'v1' }]),
  } as unknown as nkruntime.Nakama;
}

describe('grantXp', () => {
  it('rejects calls carrying an authenticated ctx.userId', () => {
    const nk = stubNk({});
    expect(() =>
      grantXp(stubCtx('some-authenticated-user'), stubLogger(), nk, JSON.stringify({ userId: 'u1', amount: 10 })),
    ).toThrow(/server-only/);
  });

  it('rejects malformed payloads', () => {
    const nk = stubNk({});
    expect(() => grantXp(stubCtx(''), stubLogger(), nk, JSON.stringify({ amount: 10 }))).toThrow(/userId/);
    expect(() => grantXp(stubCtx(''), stubLogger(), nk, JSON.stringify({ userId: 'u1', amount: -5 }))).toThrow(
      /amount/,
    );
  });

  it('reads, applies xp, and writes back on the first attempt', () => {
    const write = jest.fn(() => [{ version: 'v2' }]);
    const nk = stubNk({
      storageRead: jest.fn(() => [
        { collection: COLLECTIONS.profile, key: STORAGE_KEY, userId: 'u1', version: 'v1', value: DEFAULT_PROFILE },
      ]),
      storageWrite: write,
    });

    const result = grantXp(stubCtx(''), stubLogger(), nk, JSON.stringify({ userId: 'u1', amount: 250 })) as string;

    expect(JSON.parse(result)).toEqual({
      schemaVersion: 1,
      level: 2,
      xp: 150,
      statPoints: 3,
      allocated: DEFAULT_PROFILE.allocated,
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([expect.objectContaining({ version: 'v1' })]);
  });

  it('retries once on a version conflict then succeeds', () => {
    const read = jest.fn(() => [
      { collection: COLLECTIONS.profile, key: STORAGE_KEY, userId: 'u1', version: 'v1', value: DEFAULT_PROFILE },
    ]);
    const write = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('version mismatch');
      })
      .mockImplementationOnce(() => [{ version: 'v2' }]);
    const nk = stubNk({ storageRead: read, storageWrite: write });

    const result = grantXp(stubCtx(''), stubLogger(), nk, JSON.stringify({ userId: 'u1', amount: 50 })) as string;

    expect(JSON.parse(result).xp).toBe(50);
    expect(write).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every write conflicts', () => {
    const nk = stubNk({
      storageRead: jest.fn(() => [
        { collection: COLLECTIONS.profile, key: STORAGE_KEY, userId: 'u1', version: 'v1', value: DEFAULT_PROFILE },
      ]),
      storageWrite: jest.fn(() => {
        throw new Error('version mismatch');
      }),
    });

    expect(() => grantXp(stubCtx(''), stubLogger(), nk, JSON.stringify({ userId: 'u1', amount: 50 }))).toThrow(
      /version mismatch/,
    );
  });
});
