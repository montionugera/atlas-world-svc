/**
 * Client-side prediction for the LOCAL player.
 *
 * Every other entity is drawn on the interpolated server timeline, 100-180 ms in the
 * past. Drawing the local player there too makes every key press feel late, so its
 * drawn position is instead advanced each frame from the input held right now, using
 * the server's own walking rule (server-rs/src/systems/player_input.rs), and pulled
 * towards where the server's path says it should be.
 *
 * Each snapshot echoes the number of the last input its tick ran on (`input_ack`), so
 * what the server has done is known exactly: the path is the newest snapshot with the
 * inputs it has not acknowledged replayed on top. Those are placed on the ticks still to
 * come by time: an input sent at client time `c` makes the first tick whose simulation
 * time `S` satisfies `c <= S + deadline`, and `deadline` is itself read off the echoes
 * (which tick each earlier input made; held keys are sent again every HELD_INPUT_MS so
 * that there are always recent ones). The target is the server's path played one tick
 * behind that, which is as early as it can be known: it follows input 0-50 ms late (tick
 * quantisation).
 *
 * The deadline is an estimate, a margin later than the fastest recent input showed. An
 * input slower than that makes the tick after the one assumed: a stop then comes to
 * rest a tick short and walks on when the snapshot shows it. Only an input faster than
 * every recent one by more than the margin makes the tick before, and that stop
 * overshoots and walks back.
 *
 * A server that sends no echo (or one that is not ours: a second socket on the session)
 * gets no prediction: `ready` stays false and the interpolated position is drawn.
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

/** A longer frame gap is a hitch or a hidden tab: jump to the server's path. */
const MAX_FRAME_MS = 100;
/** Time constant of the pull towards the server's path. */
const BLEND_MS = 100;
/** Time constant of the stop: the last `speed x this` units are eased out. */
const STOP_MS = 50;
/** The ease ends at this speed (u/s), so a stop arrives instead of creeping. */
const STOP_MIN_SPEED = 6;
/** A stop whose rest point moved on may speed up again, to this at most (u/s). */
const STOP_FLOOR_SPEED = 60;
/** A larger error is a teleport (respawn / reset): same rule as the sample history. */
const TELEPORT_UNITS = 100;
/** A snapshot this far beyond what its velocity explains moved the player by fiat. */
const WARP_UNITS = 20;
/** Slower than this is standing still (u/s). */
const STILL_SPEED = 5;
/** Server speed may differ from the expected speed by this fraction before it disagrees. */
const SPEED_TOLERANCE = 0.25;
/** Consecutive disagreeing snapshots before the server takes over. */
const DIVERGE_SNAPSHOTS = 2;
/** The end of a cast is placed by time: this close to a tick it may or may not be in it. */
const AMBIGUOUS_MS = 75;
/** Ticks replayed past the newest snapshot; beyond that the target holds (a stall). */
const MAX_REPLAY_TICKS = 6;
/** Longest the server-driven path is extrapolated with the server's own velocity. */
const MAX_EXTRAPOLATE_MS = 100;
/**
 * While a movement key is held the same input is sent again this often, so the tick
 * deadline is measured all through a walk: 7/10 of a server tick, which steps through
 * every 5 ms of a tick in ten sends.
 */
export const HELD_INPUT_MS = 35;
/** Acknowledged inputs kept for the tick deadline: under a second of a walk. */
const MARK_WINDOW = 24;
/** Inputs whose send time is kept until they are acknowledged. */
const SENT_WINDOW = 64;
/** The deadline is this much after the fastest input seen: the next may be faster. */
const DEADLINE_MARGIN_MS = 14;
/** An input that missed a tick was sent after its deadline, by at least this (ms). */
const MISSED_BY_MS = 0.001;
const HISTORY = 32;
/** Server dash: 0.22 s, plus the time the server takes to start it. */
const DASH_YIELD_MS = 320;
/** Weight of one snapshot in the base-speed estimate. */
const CALIBRATE_ALPHA = 0.3;
const TICK_SEC = SNAPSHOT_INTERVAL_MS / 1000;

export type YieldReason = "dead" | "dash" | "unacked" | "diverged";

/** Movement input in effect from client time `t`, normalised as the server does. */
export interface InputChange {
  t: number;
  mx: number;
  my: number;
  /** `client_tick` of the input that carried it; 0 when no input did (a cast's lock). */
  seq: number;
  /**
   * Simulation time of the first tick `t` was in time for, by the deadline as it was
   * then: a deadline learnt later must not move a stop already begun back a tick.
   */
  due: number;
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
  /** Client -> server -> client delay the deadline implies (readout only). */
  rtt: number;
  /** `arrival - simTime` of the most punctual recent snapshot. */
  base: number;
  /** Newest input the server has acknowledged; 0: unknown, so nothing is predicted. */
  ack: number;
  /** An input sent by client time `S + deadline` is in the tick at simulation time `S`. */
  deadline: number;
  /** `sent - simTime` of recent inputs and the first tick that had them. */
  marks: number[];
  /** Number and send time of recent inputs, at `number % SENT_WINDOW`. */
  sentSeq: number[];
  sentAt: number[];
  /** `base` the marks are relative to: they follow it when it moves by whole ticks. */
  markBase: number;
  /** Changes of the input in effect, oldest first. */
  history: InputChange[];
  /** Keys held, kept through a cast lock. */
  heldX: number;
  heldY: number;
  /** The local cast locks movement until this client time (0: no cast). */
  lockUntil: number;
  dashUntil: number;
  disagree: number;
  diverged: boolean;
  /** Time, position, velocity, speed and terrain multiplier of the newest snapshot. */
  serverAt: number;
  serverX: number;
  serverY: number;
  serverVx: number;
  serverVy: number;
  serverSpeed: number;
  serverMult: number;
  wasAlive: boolean;
  /** Drawn speed (u/s) while no key is held: a stop only ever slows down. */
  stopSpeed: number;
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
    base: 0,
    ack: 0,
    deadline: 0,
    marks: [],
    sentSeq: new Array<number>(SENT_WINDOW).fill(0),
    sentAt: new Array<number>(SENT_WINDOW).fill(0),
    markBase: 0,
    history: [],
    heldX: 0,
    heldY: 0,
    lockUntil: 0,
    dashUntil: 0,
    disagree: 0,
    diverged: false,
    serverAt: 0,
    serverX: 0,
    serverY: 0,
    serverVx: 0,
    serverVy: 0,
    serverSpeed: 0,
    serverMult: 1,
    wasAlive: true,
    stopSpeed: 0,
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
  s.ack = 0;
  s.disagree = 0;
  s.diverged = false;
  s.serverVx = 0;
  s.serverVy = 0;
  s.serverSpeed = 0;
  s.yielding = null;
  s.error = 0;
  s.errorMax = 0;
  pushEffective(s, now, 0);
}

/** A new connection: the server holds no key for it, and its link is unknown. */
export function restartPrediction(s: PredictionState, now: number): void {
  s.heldX = 0;
  s.heldY = 0;
  s.marks = [];
  s.rtt = 0;
  resetPrediction(s, now);
}

const NO_INPUT: InputChange = {
  t: -Infinity,
  mx: 0,
  my: 0,
  seq: 0,
  due: -Infinity,
};

/**
 * Input the tick at simulation time `simTime` runs on. An acknowledged input is in
 * effect whatever the clock says; one not yet acknowledged can only make a tick the
 * server has still to run (`ahead`), and which one is told by time, as is the end of a
 * cast.
 */
function inputForTick(
  s: PredictionState,
  simTime: number,
  ahead: boolean,
): InputChange {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const e = s.history[i];
    if (e.seq !== 0 && e.seq <= s.ack) return e;
    if ((e.seq === 0 || ahead) && e.due <= simTime) return e;
  }
  return NO_INPUT;
}

/** Whether a change placed by time falls too near the tick at `simTime` to tell its tick. */
function unsureNear(s: PredictionState, simTime: number): boolean {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const d = s.history[i].due - simTime;
    if (d < -AMBIGUOUS_MS) return false;
    if (d < AMBIGUOUS_MS && s.history[i].seq === 0) return true;
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

/**
 * Walking speed at (x, y). On a map with no client terrain the multiplier is unknown,
 * so the speed the server last walked at stands in for it.
 */
function walkSpeedAt(
  s: PredictionState,
  zones: readonly TerrainZone[] | null,
  x: number,
  y: number,
): number {
  if (zones) return s.baseSpeed * terrainAt(zones, x, y).speedMultiplier;
  return s.serverSpeed >= STILL_SPEED ? s.serverSpeed : s.baseSpeed;
}

/**
 * Record the input in effect from `t` (held keys, or none during a cast); `seq` is the
 * input that carries it to the server, 0 when the server changes it by itself.
 */
function pushEffective(s: PredictionState, t: number, seq: number): void {
  const locked = s.lockUntil > t;
  const mx = locked ? 0 : s.heldX;
  const my = locked ? 0 : s.heldY;
  const last = s.history[s.history.length - 1] ?? NO_INPUT;
  if (last.mx === mx && last.my === my) return;
  s.history.push({ t, mx, my, seq, due: t - s.deadline });
  if (s.history.length > HISTORY) s.history.shift();
}

/**
 * Input number `seq` was sent at client time `now`. Every input counts, a repeat or an
 * attack as much as a change of keys: each one acknowledged places the tick deadline.
 */
export function noteSent(s: PredictionState, now: number, seq: number): void {
  if (seq === 0) return;
  s.sentSeq[seq % SENT_WINDOW] = seq;
  s.sentAt[seq % SENT_WINDOW] = now;
}

/**
 * The movement keys changed at client time `now` (raw vector, as sent to the server in
 * input number `seq`).
 */
export function setHeldInput(
  s: PredictionState,
  now: number,
  vx: number,
  vy: number,
  seq: number,
): void {
  // Server rule: no input below 0.01 length, direction scaled down to unit length.
  const lenSq = vx * vx + vy * vy;
  // A non-finite vector is no input (and `NaN * 0` would stay NaN).
  const held = Number.isFinite(lenSq) && lenSq > 0.0001;
  const inv = held ? 1 / Math.max(Math.sqrt(lenSq), 1) : 0;
  s.heldX = held ? vx * inv : 0;
  s.heldY = held ? vy * inv : 0;
  noteSent(s, now, seq);
  pushEffective(s, now, seq);
}

/** A local cast started: the server ignores movement until `until` (client time). */
export function lockMovement(
  s: PredictionState,
  now: number,
  until: number,
): void {
  s.lockUntil = until;
  pushEffective(s, now, 0);
}

/** The local cast ended or was dropped. */
export function unlockMovement(s: PredictionState, now: number): void {
  if (s.lockUntil === 0) return;
  s.lockUntil = 0;
  pushEffective(s, now, 0);
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
  /** The player's `input_ack`, and the newest input this client has sent. */
  ack: number;
  sent: number;
}

/**
 * Fold one snapshot of the local player in: which inputs it includes, the tick
 * deadline, base-speed calibration, and whether the server is still obeying the input.
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
  // A server that stalls skips ticks, so simulation time falls whole ticks behind,
  // and the marks made before it with it.
  const skipped =
    Math.round((s.base - s.markBase) / SNAPSHOT_INTERVAL_MS) *
    SNAPSHOT_INTERVAL_MS;
  if (s.marks.length === 0) {
    s.markBase = s.base;
  } else if (skipped !== 0) {
    s.markBase += skipped;
    for (let i = 0; i < s.marks.length; i++) s.marks[i] += skipped;
    for (let i = 0; i < s.history.length; i++) s.history[i].due -= skipped;
  }
  // 0 is no echo (an older server); beyond what was sent it counts another socket.
  const ack = snap.ack <= snap.sent ? snap.ack : 0;
  if (ack !== 0) {
    // An input this tick is the first to include was sent before its deadline and
    // after the previous tick's (when that snapshot was seen, with an echo of ours).
    const first =
      s.ack !== 0 && snap.simTime - s.serverAt === SNAPSHOT_INTERVAL_MS;
    const oldest = Math.max(s.ack, ack - SENT_WINDOW) + 1;
    for (let seq = oldest; first && seq <= ack; seq++) {
      if (s.sentSeq[seq % SENT_WINDOW] !== seq) continue;
      s.marks.push(s.sentAt[seq % SENT_WINDOW] - snap.simTime);
      if (s.marks.length > MARK_WINDOW) s.marks.shift();
    }
    let newest = -1;
    for (let i = 0; i < s.history.length; i++) {
      const e = s.history[i];
      if (e.seq !== 0 && e.seq <= ack) newest = i;
    }
    // Everything before the acknowledged input in effect is history.
    if (newest > 0) s.history.splice(0, newest);
  }
  const unplaced = s.ack === 0;
  s.ack = ack;
  // The deadline is no earlier than any input that made its tick (`top`: the fastest
  // seen), less than a tick after any that did, and before the snapshot of that tick
  // arrives. The latest of those is taken, and never closer to `top` than the margin:
  // an input assumed to make the earlier tick stops short and walks on, one assumed to
  // make the later tick overshoots and has to walk back. A mark a whole tick below
  // `top` was a slower input, and bounds nothing.
  let top = -Infinity;
  for (let i = 0; i < s.marks.length; i++) {
    if (s.marks[i] > top) top = s.marks[i];
  }
  let deadline = s.base;
  for (let i = 0; i < s.marks.length; i++) {
    const hi = s.marks[i] + SNAPSHOT_INTERVAL_MS - MISSED_BY_MS;
    if (hi > top && hi < deadline) deadline = hi;
  }
  deadline = Math.min(Math.max(deadline, top + DEADLINE_MARGIN_MS), s.base);
  s.deadline = deadline;
  s.rtt = s.base - deadline;
  // Whatever was sent before the first echo was placed with no deadline to go by.
  for (let i = 0; unplaced && i < s.history.length; i++) {
    s.history[i].due = s.history[i].t - deadline;
  }
  const speed = Math.hypot(snap.vx, snap.vy);
  const mult = multAt(zones, snap.x, snap.y);
  // Moved further than its velocity explains (debug teleport, reset to spawn): the
  // next frame starts over on the new position instead of easing across.
  const reach =
    (2 * Math.max(speed, s.serverSpeed) * (snap.simTime - s.serverAt)) / 1000;
  if (
    !(Math.hypot(snap.x - s.serverX, snap.y - s.serverY) <= reach + WARP_UNITS)
  ) {
    s.ready = false;
  }

  if (!snap.alive || ack === 0) {
    s.disagree = 0;
    s.diverged = false;
  } else {
    // Input this tick ran on, unless a cast ended too close to it to tell.
    if (!unsureNear(s, snap.simTime)) {
      const input = inputForTick(s, snap.simTime, false);
      const len = Math.hypot(input.mx, input.my);
      const expected = s.baseSpeed * mult * len;
      // Standing still has no speed to compare: under STILL_SPEED is still.
      // Without terrain data there is no expected speed either: direction only.
      const obeyed =
        sameWay(snap.vx, snap.vy, input.mx, input.my, 0.95) &&
        (len === 0 ||
          !zones ||
          Math.abs(speed - expected) <= SPEED_TOLERANCE * expected);
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
  s.serverAt = snap.simTime;
  s.serverX = snap.x;
  s.serverY = snap.y;
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
 * server's own velocity (`replay` false) or the unacknowledged inputs replayed tick by
 * tick.
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
      const input = inputForTick(s, t + SNAPSHOT_INTERVAL_MS, true);
      const part = Math.min((simNow - t) / SNAPSHOT_INTERVAL_MS, 1);
      const step = walkSpeedAt(s, world.zones, x, y) * TICK_SEC * part;
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
 * path, so entering and leaving that state never jumps. With no key held it walks on
 * to where the server is expected to come to rest, slowing all the way, and on again
 * if the server walked a tick more.
 */
export function advancePrediction(
  s: PredictionState,
  now: number,
  me: ServerPlayer,
  world: PredictionWorld,
): void {
  const dt = Math.max(now - s.at, 0);
  s.at = now;
  if (s.lockUntil !== 0 && now >= s.lockUntil) {
    const ended = s.lockUntil;
    s.lockUntil = 0;
    pushEffective(s, ended, 0);
  }
  const alive = me.isAlive !== false;
  const revived = alive && !s.wasAlive;
  s.wasAlive = alive;
  if (s.ack === 0) {
    // No echo to reconcile with: nothing is predicted, and the caller draws the
    // interpolated position as it does with prediction off.
    s.yielding = "unacked";
    s.ready = false;
    s.error = 0;
    return;
  }
  s.yielding = !alive
    ? "dead"
    : now < s.dashUntil
      ? "dash"
      : s.diverged
        ? "diverged"
        : null;

  const input = s.history[s.history.length - 1] ?? NO_INPUT;
  const moving = s.yielding === null && (input.mx !== 0 || input.my !== 0);
  const idle = s.yielding === null && !moving;
  // With no key held the target is where the server will come to rest: the replay
  // runs on until the tick that takes the release.
  const simNow = idle ? Infinity : now - s.deadline - SNAPSHOT_INTERVAL_MS;
  serverPathAt(s, me, world, simNow, s.yielding === null);
  if (
    !s.ready ||
    revived ||
    dt > MAX_FRAME_MS ||
    !(Math.hypot(target.x - s.x, target.y - s.y) <= TELEPORT_UNITS)
  ) {
    s.ready = true;
    s.x = target.x;
    s.y = target.y;
    s.error = 0;
    return;
  }

  const walkSpeed = walkSpeedAt(s, world.zones, s.x, s.y);
  if (moving) {
    const step = (walkSpeed * dt) / 1000;
    s.x = clamp(s.x + input.mx * step, world.width);
    s.y = clamp(s.y + input.my * step, world.height);
  }

  const ex = target.x - s.x;
  const ey = target.y - s.y;
  const error = Math.hypot(ex, ey);
  s.error = error;
  s.errorMax = Math.max(error, s.errorMax * Math.exp(-dt / 2000));
  if (idle) {
    // Stopping: walk on to the rest point, easing the last stretch, and never faster
    // than the frame before. Only a rest point that moved on (the release made a
    // later tick than its send time said) may raise the speed again, up to the floor;
    // until the release is acknowledged the ease ends there, so walking on from a
    // stop a few frames old is no faster than the stop was.
    const least = input.seq > s.ack ? STOP_FLOOR_SPEED : STOP_MIN_SPEED;
    s.stopSpeed = Math.min(
      Math.max((error * 1000) / STOP_MS, least),
      Math.max(s.stopSpeed, STOP_FLOOR_SPEED),
    );
    const k = (s.stopSpeed * dt) / 1000 / error;
    // Until the release is acknowledged the rest point is where it is expected, not
    // where it is: one behind the drawn position is waited out, never walked back to.
    const walked = s.history[s.history.length - 2];
    if (input.seq > s.ack && walked && ex * walked.mx + ey * walked.my < 0) {
      s.stopSpeed = 0;
      return;
    }
    // Arrived: exactly the server's position, so standing still can never drift.
    s.x = k < 1 ? s.x + ex * k : target.x;
    s.y = k < 1 ? s.y + ey * k : target.y;
  } else {
    s.stopSpeed = walkSpeed;
    const k = 1 - Math.exp(-dt / BLEND_MS);
    s.x += ex * k;
    s.y += ey * k;
  }
}
