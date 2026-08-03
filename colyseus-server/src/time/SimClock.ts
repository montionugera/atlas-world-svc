/**
 * Monotonic simulated-time clock.
 *
 * The simulation takes time as an INPUT rather than reading a global clock, so
 * a room behaves identically whether it is driven at production speed, faster
 * than real time (load harness, replay), or stepped by hand in a test.
 *
 * Deliberately has no access to Date.now() or performance.now(). Advancing is
 * the caller's job — GameSimulationSystem.update() does it once per tick with
 * the same fixed delta every other system receives (see GameRoom.ts:260-264).
 */
export class SimClock {
  private elapsedMs = 0

  /** Simulated milliseconds since the room started. Never decreases. */
  now(): number {
    return this.elapsedMs
  }

  /** Advance simulated time. Rejects anything that would break monotonicity. */
  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError(`SimClock.advance requires a finite, non-negative delta, got ${deltaMs}`)
    }
    this.elapsedMs += deltaMs
  }
}
