import { MatchEvent } from '@atlas/contracts'
import { FakeMetaBackend } from '../meta/FakeMetaBackend'
import { MetaEventReporter } from '../meta/MetaEventReporter'

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
