import { ProcessedEventTracker } from '../modules/combat/ProcessedEventTracker'

describe('ProcessedEventTracker', () => {
  let tracker: ProcessedEventTracker

  beforeEach(() => {
    tracker = new ProcessedEventTracker()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('validate returns true the first time and false on repeat', () => {
    expect(tracker.validate('e1', 'evt-a')).toBe(true)
    expect(tracker.validate('e1', 'evt-a')).toBe(false)
  })

  it('tracks events independently per entity', () => {
    expect(tracker.validate('e1', 'evt-a')).toBe(true)
    expect(tracker.validate('e2', 'evt-a')).toBe(true)
    expect(tracker.validate('e1', 'evt-a')).toBe(false)
  })

  it('clear removes an entity\'s tracked events so they validate again', () => {
    expect(tracker.validate('e1', 'evt-a')).toBe(true)
    tracker.clear('e1')
    expect(tracker.validate('e1', 'evt-a')).toBe(true)
  })

  it('cleanupExpired drops entries older than the 2s TTL', () => {
    jest.useFakeTimers()
    const base = Date.now()
    jest.setSystemTime(base)

    expect(tracker.validate('e1', 'evt-old')).toBe(true)

    // Advance beyond the global cleanup throttle (5s) and the 2s entry TTL.
    jest.setSystemTime(base + 6000)
    tracker.cleanupExpired()

    // Old entry is gone -> it validates as new again.
    expect(tracker.validate('e1', 'evt-old')).toBe(true)
  })

  it('cleanupExpired is throttled: a call before the 5s interval is a no-op', () => {
    jest.useFakeTimers()
    const base = Date.now()
    jest.setSystemTime(base)

    // Prime lastCleanupTime (it starts at 0, so the very first sweep always runs).
    tracker.cleanupExpired()

    expect(tracker.validate('e1', 'evt-old')).toBe(true)

    // Entry is older than its 2s TTL, but only 3s have passed since the last
    // cleanup, so the throttle skips the sweep entirely and the entry survives.
    jest.setSystemTime(base + 3000)
    tracker.cleanupExpired()

    expect(tracker.validate('e1', 'evt-old')).toBe(false)
  })
})
