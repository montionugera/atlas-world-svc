import { getMobSettingsForMap } from '../config/mobSpawnConfig'

describe('mobSpawnConfig', () => {
  test('should apply overrides for map-for-play', () => {
    const settings = getMobSettingsForMap('map-for-play')
    expect(settings.desiredCount).toBe(5)
    expect(settings.maxMobs).toBe(8)
    expect(settings.spawnIntervalMs).toBe(800)
    expect(settings.respawnDelayMs).toBe(5000)
  })

  test('should apply overrides for map-for-test-projectile', () => {
    const settings = getMobSettingsForMap('map-for-test-projectile')
    expect(settings.desiredCount).toBe(6)
    expect(settings.maxMobs).toBe(10)
    expect(settings.spawnIntervalMs).toBe(900)
    // respawnDelayMs should still exist (override)
    expect(settings.respawnDelayMs).toBe(5000)
  })

  test('should fall back to defaults for unknown maps', () => {
    const settings = getMobSettingsForMap('unknown-map')
    expect(settings.desiredCount).toBe(5)
    expect(settings.maxMobs).toBe(8)
    expect(settings.spawnIntervalMs).toBe(1000)
  })
})

