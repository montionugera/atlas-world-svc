/** Snapshots arrive every 50 ms; cap extrapolation at ~2 intervals. */
export const MAX_EXTRAPOLATION_MS = 100;

interface Extrapolatable {
  x: number;
  y: number;
  /** World units per second (server integrates `pos += vel * dt`). */
  vx?: number;
  vy?: number;
  /** performance.now() timestamp at which the snapshot arrived. */
  receivedAt?: number;
}

/** Position `now` ms after the snapshot, projected along velocity (capped). */
export function extrapolatePosition(
  e: Extrapolatable,
  now: number,
): { x: number; y: number } {
  const { x, y, vx, vy, receivedAt } = e;
  if (
    receivedAt === undefined ||
    !Number.isFinite(receivedAt) ||
    vx === undefined ||
    vy === undefined ||
    !Number.isFinite(vx) ||
    !Number.isFinite(vy)
  ) {
    return { x, y };
  }
  const dtMs = Math.min(Math.max(now - receivedAt, 0), MAX_EXTRAPOLATION_MS);
  const dt = dtMs / 1000;
  return { x: x + vx * dt, y: y + vy * dt };
}

/** Copy of `entities` with each position extrapolated to `now`. */
export function extrapolateEntities<T extends Extrapolatable>(
  entities: Map<string, T>,
  now: number,
): Map<string, T> {
  const out = new Map<string, T>();
  entities.forEach((e, id) =>
    out.set(id, { ...e, ...extrapolatePosition(e, now) }),
  );
  return out;
}
