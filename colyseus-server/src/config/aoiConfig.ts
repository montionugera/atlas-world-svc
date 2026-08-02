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

export const AOI_CONFIG = {
  /** World units. Entities within this distance of a viewer become visible. */
  radius: num('AOI_RADIUS', 150),
  /** Entities stay visible out to radius * hysteresis. Must be >= 1. */
  hysteresis: num('AOI_HYSTERESIS', 1.15),
  /** Recompute visible sets every Nth simulation tick. 1 = every tick. */
  updateIntervalTicks: num('AOI_UPDATE_INTERVAL_TICKS', 1),
  /** Spatial hash cell size. Sized to the radius so a query scans ~9 cells. */
  cellSize: num('AOI_CELL_SIZE', 150),
}
