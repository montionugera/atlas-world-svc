/**
 * Snapshot interpolation on the SERVER timeline.
 *
 * The server advances every entity by exactly one 50 ms step per tick, but ticks reach
 * us in bursts (measured gaps of 2–300 ms on a loaded dev box). Rendering against
 * arrival time therefore stutters however it is smoothed. Instead each snapshot is
 * placed at `tick * 50 ms` and the renderer plays that timeline back a little in the
 * past, far enough behind that the snapshots bracketing the render time have usually
 * already arrived.
 */

/** Simulation time covered by one server tick. */
export const SNAPSHOT_INTERVAL_MS = 50;
/**
 * On top of the worst recent lateness: one interval, so the snapshot after the one
 * being drawn towards has arrived by the time it is needed.
 */
const MARGIN_MS = 50;
/**
 * Most lateness the delay is sized for. With MARGIN_MS on top, the picture is never
 * held more than 300 ms behind the newest snapshot; anything later is a stall.
 */
export const MAX_DELAY_MS = 250;
/** Lateness window: 3 s of snapshots. */
const WINDOW = 60;
/** Playback slows by at most this fraction while the delay grows... */
const GROW_RATE = 0.25;
/** ...and speeds up by at most this fraction while it shrinks. */
const SHRINK_RATE = 0.1;
/** A clock error this large means a new timeline (reconnect / room switch). */
const RESYNC_MS = 1000;
/** Samples kept per entity (covers MAX_DELAY_MS plus a burst). */
const MAX_SAMPLES = 12;
/**
 * A larger move in one snapshot is a teleport (respawn / reset), not motion: over 4x
 * the fastest real step (dash, 450 u/s = 22.5 u per tick).
 */
const TELEPORT_UNITS = 100;

/** Position of an entity at simulation time `t` (ms). */
export interface PosSample {
  t: number;
  x: number;
  y: number;
}

/**
 * Maps `performance.now()` onto the server timeline. `lag` is `now - renderTime`; it
 * drifts towards `target` at a bounded rate so render time never runs backwards.
 */
export interface SnapshotClock {
  /** Recent `arrival - simTime` values, newest last. */
  offsets: number[];
  /** Lag at time `at`. */
  lag: number;
  at: number;
  target: number;
  /** Simulation time of the newest snapshot. */
  newest: number;
  /** The backlog of a stall is still landing. */
  stalled?: boolean;
}

function lagAt(clock: SnapshotClock, now: number): number {
  const dt = Math.max(now - clock.at, 0);
  const step = Math.min(
    Math.max(clock.target - clock.lag, -SHRINK_RATE * dt),
    GROW_RATE * dt,
  );
  return clock.lag + step;
}

/** Fold one snapshot (simulation time `simTime`, arrived at `arrival`) into the clock. */
export function observeSnapshot(
  clock: SnapshotClock | undefined,
  simTime: number,
  arrival: number,
): SnapshotClock {
  const offset = arrival - simTime;
  // Where the picture actually is: time it was held for (a stall) becomes lag, so
  // playback resumes from the held frame instead of jumping to catch up.
  const lag = clock ? arrival - renderTimeAt(clock, arrival) : NaN;
  if (!clock || !(Math.abs(offset - lag) < RESYNC_MS)) {
    const fresh = offset + MARGIN_MS;
    return {
      offsets: [offset],
      lag: fresh,
      at: arrival,
      target: fresh,
      newest: simTime,
    };
  }
  const newest = Math.max(clock.newest, simTime);
  const cap = MAX_DELAY_MS + MARGIN_MS;
  const late = offset - Math.min(...clock.offsets) > MAX_DELAY_MS;
  const burst = arrival - clock.at < SNAPSHOT_INTERVAL_MS / 2;
  if (clock.stalled ? burst : late) {
    // A stall longer than the delay covers; its backlog lands in one burst. Snap to
    // the normal delay (one visible jump, no seconds of lag behind input) and keep
    // it out of the lateness window: it is not jitter to size the delay for.
    return {
      ...clock,
      lag: Math.min(lag, clock.target),
      at: arrival,
      newest,
      stalled: true,
    };
  }
  // Still late once the burst is over: the timeline itself moved (the server skips
  // the ticks it missed), so start over from this snapshot.
  if (late) return observeSnapshot(undefined, simTime, arrival);
  const offsets = [...clock.offsets, offset].slice(-WINDOW);
  const target =
    Math.min(Math.max(...offsets), offset + MAX_DELAY_MS) + MARGIN_MS;
  return {
    offsets,
    lag: Math.min(lag, offset + cap),
    at: arrival,
    target,
    newest,
  };
}

/**
 * Simulation time to draw at `now`. Held at the newest snapshot when the buffer runs
 * dry: guessing ahead overshoots a stop and then snaps back.
 */
export function renderTimeAt(
  clock: SnapshotClock | undefined,
  now: number,
): number {
  if (!clock) return now;
  return Math.min(now - lagAt(clock, now), clock.newest);
}

/**
 * Append a sample. One that does not move time forward, or that teleports, starts a
 * new history; a non-finite one is dropped.
 */
export function pushSample(
  samples: readonly PosSample[] | undefined,
  sample: PosSample,
): PosSample[] {
  if (
    !Number.isFinite(sample.t) ||
    !Number.isFinite(sample.x) ||
    !Number.isFinite(sample.y)
  ) {
    return samples ? [...samples] : [];
  }
  if (!samples || samples.length === 0) return [sample];
  const last = samples[samples.length - 1];
  if (sample.t <= last.t) return [sample];
  if (Math.hypot(sample.x - last.x, sample.y - last.y) > TELEPORT_UNITS) {
    return [sample];
  }
  return [...samples, sample].slice(-MAX_SAMPLES);
}

interface Sampled {
  x: number;
  y: number;
  samples?: readonly PosSample[];
}

/** Position at simulation time `t`: interpolated, or the newest sample when dry. */
export function samplePosition(
  e: Sampled,
  t: number,
): { x: number; y: number } {
  const s = e.samples;
  if (!s || s.length === 0 || !Number.isFinite(t)) return { x: e.x, y: e.y };
  const last = s[s.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  for (let i = s.length - 2; i >= 0; i--) {
    const a = s[i];
    if (t >= a.t) {
      const b = s[i + 1];
      const k = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return { x: s[0].x, y: s[0].y };
}

/** Copy of `entities` with each position sampled at simulation time `t`. */
export function interpolateEntities<T extends Sampled>(
  entities: Map<string, T>,
  t: number,
): Map<string, T> {
  const out = new Map<string, T>();
  entities.forEach((e, id) => out.set(id, { ...e, ...samplePosition(e, t) }));
  return out;
}
