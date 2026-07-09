import { MatchEvent, MatchEventBatch } from '@atlas/contracts'
import { FakeMetaBackend } from '../meta/FakeMetaBackend'
import { MetaEventReporter } from '../meta/MetaEventReporter'
import { IMetaBackend } from '../meta/IMetaBackend'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function mobKilled(targetId: string, userId = 'user-1'): MatchEvent {
  return { type: 'MOB_KILLED', userId, targetId, count: 1 }
}

describe('MetaEventReporter', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('advances seq monotonically only on ok/deduped flushes', async () => {
    const backend = new FakeMetaBackend()
    const reporter = new MetaEventReporter({ backend, matchId: 'match-1' })

    reporter.record(mobKilled('mob-a'))
    await reporter.flush()
    expect(backend.batches).toHaveLength(1)
    expect(backend.batches[0].seq).toBe(0)

    reporter.record(mobKilled('mob-b'))
    await reporter.flush()
    expect(backend.batches).toHaveLength(2)
    expect(backend.batches[1].seq).toBe(1)
  })

  it('keeps events buffered and does not advance seq on a failed flush', async () => {
    const backend = new FakeMetaBackend()
    backend.failNextN = 1
    const reporter = new MetaEventReporter({ backend, matchId: 'match-1' })

    reporter.record(mobKilled('mob-a'))
    await reporter.flush()

    expect(backend.batches).toHaveLength(0) // failed report never recorded by the fake

    // Next flush retries the same buffered event and succeeds.
    await reporter.flush()
    expect(backend.batches).toHaveLength(1)
    expect(backend.batches[0].seq).toBe(0) // seq did not advance on the failed attempt
    expect(backend.batches[0].events).toHaveLength(1)
  })

  it('drops the oldest event past maxBuffer and warns once with the dropped count', async () => {
    const backend = new FakeMetaBackend()
    const reporter = new MetaEventReporter({ backend, matchId: 'match-1', maxBuffer: 3 })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    for (let i = 0; i < 5; i++) {
      reporter.record(mobKilled(`mob-${i}`))
    }
    expect(warnSpy).not.toHaveBeenCalled() // warning is coalesced until the next flush

    await reporter.flush()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('dropped 2')

    // Only the 3 most recent events survive the drop.
    expect(backend.batches[0].events.map(e => e.targetId)).toEqual(['mob-2', 'mob-3', 'mob-4'])

    warnSpy.mockRestore()
  })

  it('does not let a thrown backend error escape flush(); buffer is retained like a failed result', async () => {
    const backend: IMetaBackend = {
      verifySession: async () => null,
      getLoadout: async () => null,
      reportMatchEvents: async () => {
        throw new Error('network exploded')
      },
    }
    const reporter = new MetaEventReporter({ backend, matchId: 'match-1' })
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    reporter.record(mobKilled('mob-a'))
    await expect(reporter.flush()).resolves.toBeUndefined()

    // Buffer untouched, seq did not advance — safe to retry verbatim.
    reporter.record(mobKilled('mob-b'))
    await expect(reporter.flush()).resolves.toBeUndefined()

    errSpy.mockRestore()
  })

  it('a dispose-time flush() waits out an in-flight flush, then re-flushes anything recorded since', async () => {
    const calls: (MatchEventBatch & { userId: string })[] = []
    const first = deferred<'ok'>()
    let callCount = 0
    const backend: IMetaBackend = {
      verifySession: async () => null,
      getLoadout: async () => null,
      reportMatchEvents: async batch => {
        callCount += 1
        calls.push(batch)
        if (callCount === 1) return first.promise
        return 'ok'
      },
    }
    const reporter = new MetaEventReporter({ backend, matchId: 'match-1' })

    reporter.record(mobKilled('mob-a'))
    const periodicFlush = reporter.flush() // in-flight, unresolved until first.resolve()

    // Recorded after the in-flight snapshot was taken — must not be stranded.
    reporter.record(mobKilled('mob-b'))

    // Mirrors GameRoom.onDispose calling flush() while a periodic flush is in progress.
    const disposeFlush = reporter.flush()

    first.resolve('ok')
    await periodicFlush
    await disposeFlush

    expect(calls).toHaveLength(2)
    expect(calls[0].events.map(e => e.targetId)).toEqual(['mob-a'])
    expect(calls[1].events.map(e => e.targetId)).toEqual(['mob-b'])
  })

  it('start() schedules periodic flushes and stop() cancels them', async () => {
    jest.useFakeTimers()
    const backend = new FakeMetaBackend()
    const reporter = new MetaEventReporter({ backend, matchId: 'match-1', flushIntervalMs: 1000 })
    const flushSpy = jest.spyOn(reporter, 'flush')

    reporter.start()
    reporter.record(mobKilled('mob-a'))

    await jest.advanceTimersByTimeAsync(1000)
    expect(flushSpy).toHaveBeenCalledTimes(1)

    reporter.stop()
    await jest.advanceTimersByTimeAsync(5000)
    expect(flushSpy).toHaveBeenCalledTimes(1) // no further flushes after stop()

    flushSpy.mockRestore()
  })
})
