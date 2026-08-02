import { SimClock } from '../time/SimClock'

describe('SimClock', () => {
  it('starts at zero', () => {
    expect(new SimClock().now()).toBe(0)
  })

  it('accumulates advances', () => {
    const clock = new SimClock()
    clock.advance(50)
    clock.advance(50)
    expect(clock.now()).toBe(100)
  })

  it('is unaffected by wall-clock time', () => {
    const clock = new SimClock()
    const before = clock.now()
    const spin = Date.now()
    while (Date.now() - spin < 20) {
      /* burn real time without advancing the clock */
    }
    expect(clock.now()).toBe(before)
  })

  it('is monotonic — rejects negative deltas', () => {
    const clock = new SimClock()
    clock.advance(50)
    expect(() => clock.advance(-1)).toThrow(RangeError)
    expect(clock.now()).toBe(50)
  })

  it('rejects non-finite deltas', () => {
    const clock = new SimClock()
    expect(() => clock.advance(NaN)).toThrow(RangeError)
    expect(() => clock.advance(Infinity)).toThrow(RangeError)
    expect(clock.now()).toBe(0)
  })

  it('accepts a zero delta', () => {
    const clock = new SimClock()
    clock.advance(0)
    expect(clock.now()).toBe(0)
  })
})
