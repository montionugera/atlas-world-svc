import { validateAoiConfig, AoiConfig } from '../../config/aoiConfig'

const baseline: AoiConfig = {
  radius: 150,
  hysteresis: 1.15,
  updateIntervalTicks: 1,
  cellSize: 150,
}

describe('validateAoiConfig', () => {
  test('accepts the baseline config unchanged', () => {
    expect(validateAoiConfig(baseline)).toEqual(baseline)
  })

  test('rejects updateIntervalTicks = 0 (the tick % 0 = NaN blackout)', () => {
    expect(() => validateAoiConfig({ ...baseline, updateIntervalTicks: 0 })).toThrow(
      /updateIntervalTicks/
    )
  })

  test('rejects a non-integer updateIntervalTicks', () => {
    expect(() => validateAoiConfig({ ...baseline, updateIntervalTicks: 2.5 })).toThrow(
      /updateIntervalTicks/
    )
  })

  test('rejects a negative updateIntervalTicks', () => {
    expect(() => validateAoiConfig({ ...baseline, updateIntervalTicks: -1 })).toThrow(
      /updateIntervalTicks/
    )
  })

  test('rejects radius = 0', () => {
    expect(() => validateAoiConfig({ ...baseline, radius: 0 })).toThrow(/radius/)
  })

  test('rejects a negative radius', () => {
    expect(() => validateAoiConfig({ ...baseline, radius: -10 })).toThrow(/radius/)
  })

  test('rejects hysteresis < 1', () => {
    expect(() => validateAoiConfig({ ...baseline, hysteresis: 0.5 })).toThrow(/hysteresis/)
  })

  test('rejects cellSize = 0', () => {
    expect(() => validateAoiConfig({ ...baseline, cellSize: 0 })).toThrow(/cellSize/)
  })

  test('rejects a negative cellSize', () => {
    expect(() => validateAoiConfig({ ...baseline, cellSize: -150 })).toThrow(/cellSize/)
  })
})
