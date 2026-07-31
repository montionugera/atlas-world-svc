/**
 * Threat / aggro tuning (F-023).
 *
 * Threat is written only on resolved hits and decayed lazily at read time, so a
 * quiet tick costs nothing. `maxEntries` bounds memory regardless of party size --
 * the README targets 150-300 players per instance and a mob still holds at most
 * this many entries.
 */
export const THREAT_CONFIG = {
  /** Threat halves every this many ms, so a disengaging player sheds aggro. */
  halfLifeMs: 10_000,
  /** Hard cap on tracked entities per mob; lowest-threat entry is evicted on overflow. */
  maxEntries: 32,
  /** A challenger must exceed the current target by this factor to steal it (anti-thrash). */
  switchMargin: 1.1,
  /** A taunt sets threat to this multiple of the current highest. */
  tauntMultiplier: 1.5,
  /** A taunt also pins the target outright for this long, regardless of threat. */
  tauntLockMs: 5_000,
} as const
