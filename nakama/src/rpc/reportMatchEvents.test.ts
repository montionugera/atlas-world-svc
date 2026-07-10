import { COLLECTIONS, STORAGE_KEY } from '@atlas/contracts';
import { reportMatchEvents } from './reportMatchEvents';

const QUESTS_SEQ_COLLECTION = 'quests_seq';

function stubLogger(): nkruntime.Logger {
  return { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as nkruntime.Logger;
}

function stubCtx(userId = ''): nkruntime.Context {
  return { userId } as unknown as nkruntime.Context;
}

function stubNk(overrides: {
  storageRead?: jest.Mock;
  multiUpdate?: jest.Mock;
  notificationSend?: jest.Mock;
}): nkruntime.Nakama {
  return {
    storageRead: overrides.storageRead ?? jest.fn(() => []),
    multiUpdate:
      overrides.multiUpdate ?? jest.fn(() => ({ storageWriteAcks: [], walletUpdateAcks: [] })),
    notificationSend: overrides.notificationSend ?? jest.fn(),
  } as unknown as nkruntime.Nakama;
}

function payload(overrides: Partial<{ userId: string; matchId: string; seq: number; events: unknown[] }> = {}) {
  return JSON.stringify({
    userId: 'user-1',
    matchId: 'match-1',
    seq: 0,
    events: [{ type: 'MOB_KILLED', userId: 'user-1', targetId: 'boar', count: 1 }],
    ...overrides,
  });
}

describe('reportMatchEvents', () => {
  it('rejects calls carrying an authenticated ctx.userId (S2S only)', () => {
    const nk = stubNk({});
    expect(() => reportMatchEvents(stubCtx('some-authenticated-user'), stubLogger(), nk, payload())).toThrow(
      /server-only/,
    );
  });

  it('dedupes a batch whose seq is <= the last-applied seq, and performs no writes', () => {
    const storageRead = jest.fn((reqs: { collection: string }[]) => {
      if (reqs[0].collection === QUESTS_SEQ_COLLECTION) {
        return [
          {
            collection: QUESTS_SEQ_COLLECTION,
            key: STORAGE_KEY,
            userId: 'user-1',
            version: 'v-seq',
            value: { 'match-1': 5 },
          },
        ];
      }
      return [];
    });
    const multiUpdate = jest.fn(() => ({ storageWriteAcks: [], walletUpdateAcks: [] }));
    const nk = stubNk({ storageRead, multiUpdate });

    const result = reportMatchEvents(stubCtx(''), stubLogger(), nk, payload({ seq: 5 })) as string;

    expect(JSON.parse(result)).toEqual({ deduped: true });
    expect(multiUpdate).not.toHaveBeenCalled();
  });

  it('rejects a batch containing an event.userId that does not match the batch userId', () => {
    const nk = stubNk({});

    expect(() =>
      reportMatchEvents(
        stubCtx(''),
        stubLogger(),
        nk,
        payload({
          userId: 'user-1',
          events: [{ type: 'MOB_KILLED', userId: 'someone-else', targetId: 'boar', count: 1 }],
        }),
      ),
    ).toThrow(/does not match batch userId/);
  });

  it('applies a new batch via a single atomic multiUpdate (quests doc + seq doc together)', () => {
    const storageRead = jest.fn((reqs: { collection: string }[]) => {
      if (reqs[0].collection === QUESTS_SEQ_COLLECTION) {
        return []; // no seq doc yet -> lastSeq = -1
      }
      if (reqs[0].collection === COLLECTIONS.quests) {
        return [
          {
            collection: COLLECTIONS.quests,
            key: STORAGE_KEY,
            userId: 'user-1',
            version: 'v-quests',
            value: {
              schemaVersion: 1,
              active: [{ questId: 'q_boar_5', startedAt: 0, objectives: { kill_boars: 0 } }],
              completed: [],
            },
          },
        ];
      }
      return [];
    });
    const multiUpdate = jest.fn(
      (
        _accountUpdates: unknown,
        _storageWrites: { collection: string; version: string }[],
        _storageDeletes: unknown,
        _walletUpdates: unknown,
      ) => ({ storageWriteAcks: [], walletUpdateAcks: [] }),
    );
    const notificationSend = jest.fn();
    const nk = stubNk({ storageRead, multiUpdate, notificationSend });

    const result = reportMatchEvents(stubCtx(''), stubLogger(), nk, payload({ seq: 0 })) as string;
    const parsed = JSON.parse(result);

    expect(parsed.deduped).toBe(false);
    expect(parsed.progressed).toEqual(['q_boar_5']);
    expect(parsed.completedNow).toEqual([]);

    // Exactly one multiUpdate call carrying both writes — never two separate
    // storageWrite calls that could partially fail.
    expect(multiUpdate).toHaveBeenCalledTimes(1);
    const [accountUpdates, storageWrites, storageDeletes, walletUpdates] = multiUpdate.mock.calls[0];
    expect(accountUpdates).toBeNull();
    expect(storageDeletes).toBeNull();
    expect(walletUpdates).toBeNull();
    expect(storageWrites).toHaveLength(2);
    expect(storageWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: COLLECTIONS.quests, version: 'v-quests' }),
        expect.objectContaining({ collection: QUESTS_SEQ_COLLECTION, version: '*' }),
      ]),
    );

    expect(notificationSend).toHaveBeenCalledWith(
      'user-1',
      'quest_progress',
      { questId: 'q_boar_5', objectives: { kill_boars: 1 } },
      1,
    );
  });
});
