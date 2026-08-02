/**
 * Area-of-interest configuration.
 *
 * Deliberately separate from GAME_CONFIG: that object is declared `as const`
 * (config/gameConfig.ts:25) and is consumed widely, so adding mutable
 * env-overridable keys to it would change its type for every consumer.
 *
 * `radius` has NO defensible default yet — the number must come from the
 * Stage 1 load harness (see spec risk R1). The value below is a placeholder
 * for local development only and is expected to change once measured.
 */
const num = (envKey: string, fallback: number): number => {
  const raw = process.env[envKey]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface AoiConfig {
  radius: number
  hysteresis: number
  updateIntervalTicks: number
  cellSize: number
}

/**
 * Fails loudly at boot rather than silently at runtime. `num()` accepts any
 * finite number, including 0, negatives, and non-integers — an invalid
 * `updateIntervalTicks` (e.g. 0 or 2.5) makes `tick % updateIntervalTicks`
 * evaluate to NaN in GameSimulationSystem.updateInterest(), which is `!== 0`
 * forever, so InterestManager.update() is never called and every connected
 * client renders an empty world with no throw and no log. Same pattern as
 * SpatialHash (throws on cellSize <= 0) and createDistancePredicate (throws
 * on hysteresis < 1) — this just applies it at config-load time instead of
 * at first use.
 */
export function validateAoiConfig(config: AoiConfig): AoiConfig {
  if (!(config.radius > 0)) {
    throw new Error(`AOI_CONFIG.radius must be > 0, got ${config.radius}`)
  }
  if (!(config.hysteresis >= 1)) {
    throw new Error(`AOI_CONFIG.hysteresis must be >= 1, got ${config.hysteresis}`)
  }
  if (!Number.isInteger(config.updateIntervalTicks) || config.updateIntervalTicks < 1) {
    throw new Error(
      `AOI_CONFIG.updateIntervalTicks must be an integer >= 1, got ${config.updateIntervalTicks}`
    )
  }
  if (!(config.cellSize > 0)) {
    throw new Error(`AOI_CONFIG.cellSize must be > 0, got ${config.cellSize}`)
  }
  return config
}

export const AOI_CONFIG: AoiConfig = validateAoiConfig({
  /** World units. Entities within this distance of a viewer become visible. */
  radius: num('AOI_RADIUS', 150),
  /** Entities stay visible out to radius * hysteresis. Must be >= 1. */
  hysteresis: num('AOI_HYSTERESIS', 1.15),
  /** Recompute visible sets every Nth simulation tick. 1 = every tick. */
  updateIntervalTicks: num('AOI_UPDATE_INTERVAL_TICKS', 1),
  /** Spatial hash cell size. Sized to the radius so a query scans ~9 cells. */
  cellSize: num('AOI_CELL_SIZE', 150),
})
