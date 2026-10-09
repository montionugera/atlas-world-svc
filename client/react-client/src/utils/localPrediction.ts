/**
 * Client-side prediction for the LOCAL player.
 *
 * Every other entity is drawn on the interpolated server timeline, 100-180 ms in the
 * past. Drawing the local player there too makes every key press feel late, so its
 * drawn position is instead advanced each frame from the input held right now, using
 * the server's own walking rule (server-rs/src/systems/player_input.rs), and pulled
 * towards where the server's path says it should be.
 *
 * The wire does not echo which input a snapshot has processed, so that path is placed
 * by time: an input issued at client time `c` is consumed by the first tick whose
 * simulation time `S` satisfies `S + base >= c + rtt`, where `base` is the arrival
 * offset of the most punctual recent snapshot. The target is the server's path played
 * `50 ms - rtt` behind that, which is as early as it can be known: it follows input
 * 0-50 ms late (tick quantisation), built from real snapshots, with the ticks not
 * yet received replayed from the input history.
 *
 * All functions take time as an argument and mutate a caller-owned state object, so
 * a frame allocates nothing.
 */
import { REFERENCE_RUN_SPEED, TerrainZone, terrainAt } from "../config/terrain";
import {
  PosSample,
  SNAPSHOT_INTERVAL_MS,
  sampleInto,
} from "./snapshotInterpolation";

/** A longer frame gap is a hidden tab, not motion to integrate. */
const MAX_FRAME_MS = 100;
/** Time constant of the pull towards the server's path. */
const BLEND_MS = 100;
/** Slowest the pull runs once no key is held, so a stop finishes instead of creeping. */
const SETTLE_UNITS_PER_SEC = 20;
/** Within this of a resting server position the drawn position lands on it exactly. */
const SETTLE_UNITS = 0.1;
/** A larger error is a teleport (respawn / reset): same rule as the sample history. */
const TELEPORT_UNITS = 100;
/** Slower than this is standing still (u/s). */
const STILL_SPEED = 5;
/** Server speed may differ from the expected speed by this fraction before it disagrees. */
const SPEED_TOLERANCE = 0.25;
/** Consecutive disagreeing snapshots before the server takes over. */
const DIVERGE_SNAPSHOTS = 2;
/** An input change this close to a tick may or may not have been in it. */
const AMBIGUOUS_MS = 75;
/** Ticks replayed past the newest snapshot; beyond that the target holds (a stall). */
const MAX_REPLAY_TICKS = 6;
/** Longest the server-driven path is extrapolated with the server's own velocity. */
const MAX_EXTRAPOLATE_MS = 100;
/** Input-to-snapshot delays kept for the round-trip estimate. */
const DELAY_WINDOW = 8;
/** A change not seen in a snapshot within this long was refused (stun, cast lock). */
const MAX_PROBE_MS = 400;
const MAX_RTT_MS = 250;
const HISTORY = 32;
/** Server dash: 0.22 s, plus the time the server takes to start it. */
const DASH_YIELD_MS = 320;
/** Weight of one snapshot in the base-speed estimate. */
const CALIBRATE_ALPHA = 0.3;
const TICK_SEC = SNAPSHOT_INTERVAL_MS / 1000;

export type YieldReason = "dead" | "dash" | "diverged";

/** Movement input in effect from client time `t`, normalised as the server does. */
export interface InputChange {
  t: number;
  mx: number;
  my: number;
}

export interface PredictionState {
  /** Debug toggle; when false the renderer draws the interpolated position. */
  enabled: boolean;
  ready: boolean;
  /** Drawn position, and the client time it was advanced to. */
  x: number;
  y: number;
  at: number;
  /** Walking speed on grass (u/s), calibrated from the server-reported speed. */
  baseSpeed: number;
  calibrated: boolean;
  /** Estimated client -> server -> client delay, excluding the wait for a tick. */
  rtt: number;
  delays: number[];
  /** `arrival - simTime` of the most punctual recent snapshot. */
  base: number;
  /** Changes of the input in effect, oldest first. */
  history: InputChange[];
  /** Keys held, kept through a cast lock. */
  heldX: number;
  heldY: number;
  /** The local cast locks movement until this client time (0: no cast). */
  lockUntil: number;
  dashUntil: number;
  /** Input change not yet seen in a snapshot (measures the round trip). */
  pending: InputChange | null;
  disagree: number;
  diverged: boolean;
  /** Velocity, speed and terrain multiplier of the newest snapshot. */
  serverVx: number;
  serverVy: number;
  serverSpeed: number;
  serverMult: number;
  wasAlive: boolean;
  /** Why the server-driven position is drawn this frame, or null when predicting. */
  yielding: YieldReason | null;
  /** Distance to the server's path before this frame's correction, and its recent max. */
  error: number;
  errorMax: number;
}

export function createPrediction(): PredictionState {
  return {
    enabled: true,
    ready: false,
    x: 0,
    y: 0,
    at: 0,
    baseSpeed: REFERENCE_RUN_SPEED,
    calibrated: false,
    rtt: 0,
    delays: [],
    base: 0,
    history: [],
    heldX: 0,
    heldY: 0,
    lockUntil: 0,
    dashUntil: 0,
    pending: null,
    disagree: 0,
    diverged: false,
    serverVx: 0,
    serverVy: 0,
    serverSpeed: 0,
    serverMult: 1,
    wasAlive: true,
    yielding: null,
    error: 0,
    errorMax: 0,
  };
}

/** Start over in a new room: keys still held stay held, calibration is kept. */
export function resetPrediction(s: PredictionState, now: number): void {
  s.ready = false;
  s.history = [];
  s.lockUntil = 0;
  s.dashUntil = 0;
  s.pending = null;
  s.disagree = 0;
  s.diverged = false;
  s.serverVx = 0;
  s.serverVy = 0;
  s.serverSpeed = 0;
  s.yielding = null;
  s.error = 0;
  s.errorMax = 0;
  pushEffective(s, now);
}

const NO_INPUT: InputChange = { t: -Infinity, mx: 0, my: 0 };

/** Input in effect at client time `t`. */
function inputAt(s: PredictionState, t: number): InputChange {
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (s.history[i].t <= t) return s.history[i];
  }
  return NO_INPUT;
}

function changedNear(s: PredictionState, t: number): boolean {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const d = s.history[i].t - t;
    if (d < -AMBIGUOUS_MS) return false;
    if (d < AMBIGUOUS_MS) return true;
  }
  return false;
}

/** Whether velocity (vx, vy) is what input (mx, my) asks for: still, or that way. */
function sameWay(
  vx: number,
  vy: number,
  mx: number,
  my: number,
  minDot: number,
): boolean {
  const speed = Math.hypot(vx, vy);
  const len = Math.hypot(mx, my);
  if (len === 0) return speed < STILL_SPEED;
  return speed >= STILL_SPEED && (vx * mx + vy * my) / (speed * len) > minDot;
}

function multAt(
  zones: readonly TerrainZone[] | null,
  x: number,
  y: number,
): number {
  return zones ? terrainAt(zones, x, y).speedMultiplier : 1;
}

/** Record the input in effect from `t` (held keys, or none during a cast). */
function pushEffective(s: PredictionState, t: number): void {
  const locked = s.lockUntil > t;
  const mx = locked ? 0 : s.heldX;
  const my = locked ? 0 : s.heldY;
  const last = s.history[s.history.length - 1] ?? NO_INPUT;
  if (last.mx === mx && last.my === my) return;
  const change = { t, mx, my };
  s.history.push(change);
  if (s.history.length > HISTORY) s.history.shift();
  // Time it to its first snapshot, unless the server is already doing this.
  s.pending = sameWay(s.serverVx, s.serverVy, mx, my, 0.95) ? null : change;
}

/** The movement keys changed at client time `now` (raw vector, as sent to the server). */
export function setHeldInput(
  s: PredictionState,
  now: number,
  vx: number,
  vy: number,
): void {
  // Server rule: no input below 0.01 length, direction scaled down to unit length.
  const lenSq = vx * vx + vy * vy;
  const inv = lenSq > 0.0001 ? 1 / Math.max(Math.sqrt(lenSq), 1) : 0;
  s.heldX = vx * inv;
  s.heldY = vy * inv;
  pushEffective(s, now);
}

/** A local cast started: the server ignores movement until `until` (client time). */
export function lockMovement(
  s: PredictionState,
  now: number,
  until: number,
): void {
  s.lockUntil = until;
  pushEffective(s, now);
}

/** The local cast ended or was dropped. */
export function unlockMovement(s: PredictionState, now: number): void {
  if (s.lockUntil === 0) return;
  s.lockUntil = 0;
  pushEffective(s, now);
}

/** A dash was sent: the server drives the position until it is over. */
export function noteDash(s: PredictionState, now: number): void {
  s.dashUntil = now + DASH_YIELD_MS;
}

export interface ServerSample {
  /** `tick * SNAPSHOT_INTERVAL_MS`. */
  simTime: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

/**
 * Fold one snapshot of the local player in: round-trip estimate, base-speed
 * calibration, and whether the server is still obeying the input.
 * `offsets` are the snapshot clock's recent `arrival - simTime` values.
 */
export function observeServer(
  s: PredictionState,
  snap: ServerSample,
  offsets: readonly number[],
  zones: readonly TerrainZone[] | null,
): void {
  if (offsets.length > 0) {
    let base = offsets[0];
    for (let i = 1; i < offsets.length; i++) {
      if (offsets[i] < base) base = offsets[i];
    }
    s.base = base;
  }
  const speed = Math.hypot(snap.vx, snap.vy);
  const mult = multAt(zones, snap.x, snap.y);

  if (!snap.alive) {
    s.pending = null;
    s.disagree = 0;
    s.diverged = false;
  } else {
    const pending = s.pending;
    if (pending) {
      // First snapshot showing the change: it took `rtt` plus 0-50 ms to reach a tick.
      const delay = snap.simTime + s.base - pending.t;
      if (delay > MAX_PROBE_MS) {
        s.pending = null;
      } else if (
        delay >= 0 &&
        sameWay(snap.vx, snap.vy, pending.mx, pending.my, 0.95)
      ) {
        s.pending = null;
        s.delays.push(delay);
        if (s.delays.length > DELAY_WINDOW) s.delays.shift();
        // The longest wait was a just-missed tick, so rtt is at least 50 ms less.
        // Erring low keeps a stop from overshooting where the server ends up.
        let longest = 0;
        for (const d of s.delays) longest = Math.max(longest, d);
        s.rtt = Math.min(
          Math.max(longest - SNAPSHOT_INTERVAL_MS, 0),
          MAX_RTT_MS,
        );
      }
    }

    // Input this tick ran on, unless a change landed too close to it to tell.
    const inputTime = snap.simTime + s.base - s.rtt;
    if (!changedNear(s, inputTime)) {
      const input = inputAt(s, inputTime);
      const len = Math.hypot(input.mx, input.my);
      const expected = s.baseSpeed * mult * len;
      const obeyed =
        sameWay(snap.vx, snap.vy, input.mx, input.my, 0.95) &&
        Math.abs(speed - expected) <= SPEED_TOLERANCE * expected;
      if (obeyed) {
        s.disagree = 0;
        s.diverged = false;
      } else if (++s.disagree >= DIVERGE_SNAPSHOTS) {
        s.diverged = true;
      }
      // Walking steadily the way the keys point, on one terrain: that speed is
      // base x multiplier. A dash decays every tick, so it never looks steady.
      const estimate = speed / mult;
      if (
        len === 1 &&
        mult === s.serverMult &&
        Math.abs(speed - s.serverSpeed) < 1 &&
        estimate > 100 &&
        estimate < 800 &&
        sameWay(snap.vx, snap.vy, input.mx, input.my, 0.99)
      ) {
        s.baseSpeed += (estimate - s.baseSpeed) * CALIBRATE_ALPHA;
        s.calibrated = true;
      }
    }
  }
  s.serverVx = snap.vx;
  s.serverVy = snap.vy;
  s.serverSpeed = speed;
  s.serverMult = mult;
}

/** The local player as the newest snapshot has it. */
export interface ServerPlayer {
  x: number;
  y: number;
  isAlive?: boolean;
  samples?: readonly PosSample[];
}

export interface PredictionWorld {
  zones: readonly TerrainZone[] | null;
  width: number;
  height: number;
}

const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);

const target = { x: 0, y: 0 };

/**
 * Where the server's path is at simulation time `simNow`, written into `target`:
 * from real snapshots where they reach, beyond them either one more stretch at the
 * server's own velocity (`replay` false) or the input history replayed tick by tick.
 */
function serverPathAt(
  s: PredictionState,
  me: ServerPlayer,
  world: PredictionWorld,
  simNow: number,
  replay: boolean,
): void {
  const samples = me.samples;
  const newest =
    samples && samples.length > 0 ? samples[samples.length - 1] : undefined;
  if (!newest || !(simNow > newest.t)) {
    sampleInto(me, simNow, target);
    return;
  }
  let x = newest.x;
  let y = newest.y;
  if (!replay) {
    const sec = Math.min(simNow - newest.t, MAX_EXTRAPOLATE_MS) / 1000;
    x += s.serverVx * sec;
    y += s.serverVy * sec;
  } else {
    let t = newest.t;
    for (let i = 0; i < MAX_REPLAY_TICKS && t < simNow; i++) {
      // The tick after `t` runs on the input that reached the server by then.
      const input = inputAt(s, t + SNAPSHOT_INTERVAL_MS + s.base - s.rtt);
      const part = Math.min((simNow - t) / SNAPSHOT_INTERVAL_MS, 1);
      const step = s.baseSpeed * multAt(world.zones, x, y) * TICK_SEC * part;
      x = clamp(x + input.mx * step, world.width);
      y = clamp(y + input.my * step, world.height);
      t += SNAPSHOT_INTERVAL_MS;
    }
  }
  target.x = clamp(x, world.width);
  target.y = clamp(y, world.height);
}

/**
 * Advance the drawn position to client time `now` (once per frame): move by the input
 * held now, then close part of the gap to the server's path. While the server is not
 * obeying walking input (`yielding`) only the second half runs, on the server-driven
 * path, so entering and leaving that state never jumps.
 */
export function advancePrediction(
  s: PredictionState,
  now: number,
  me: ServerPlayer,
  world: PredictionWorld,
): void {
  const dt = Math.min(Math.max(now - s.at, 0), MAX_FRAME_MS);
  s.at = now;
  if (s.lockUntil !== 0 && now >= s.lockUntil) {
    const ended = s.lockUntil;
    s.lockUntil = 0;
    pushEffective(s, ended);
  }
  const alive = me.isAlive !== false;
  const revived = alive && !s.wasAlive;
  s.wasAlive = alive;
  s.yielding = !alive
    ? "dead"
    : now < s.dashUntil
      ? "dash"
      : s.diverged
        ? "diverged"
        : null;

  const simNow = now - s.base + s.rtt - SNAPSHOT_INTERVAL_MS;
  serverPathAt(s, me, world, simNow, s.yielding === null);
  if (
    !s.ready ||
    revived ||
    Math.hypot(target.x - s.x, target.y - s.y) > TELEPORT_UNITS
  ) {
    s.ready = true;
    s.x = target.x;
    s.y = target.y;
    s.error = 0;
    return;
  }

  const input = s.history[s.history.length - 1] ?? NO_INPUT;
  const moving = s.yielding === null && (input.mx !== 0 || input.my !== 0);
  if (moving) {
    const step = (s.baseSpeed * multAt(world.zones, s.x, s.y) * dt) / 1000;
    s.x = clamp(s.x + input.mx * step, world.width);
    s.y = clamp(s.y + input.my * step, world.height);
  }

  const ex = target.x - s.x;
  const ey = target.y - s.y;
  const error = Math.hypot(ex, ey);
  s.error = error;
  s.errorMax = Math.max(error, s.errorMax * Math.exp(-dt / 2000));
  const idle = s.yielding === null && !moving;
  if (
    idle &&
    s.serverSpeed < STILL_SPEED &&
    Math.hypot(me.x - s.x, me.y - s.y) < SETTLE_UNITS
  ) {
    // Standing still: exactly the server's position, so it can never drift.
    s.x = me.x;
    s.y = me.y;
  } else if (error > 0) {
    let step = error * (1 - Math.exp(-dt / BLEND_MS));
    if (idle) step = Math.max(step, (SETTLE_UNITS_PER_SEC * dt) / 1000);
    const k = Math.min(step / error, 1);
    s.x += ex * k;
    s.y += ey * k;
  }
}
