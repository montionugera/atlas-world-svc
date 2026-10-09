import { TerrainZone, terrainAt, terrainZonesFor } from "../config/terrain";
import { CAPTURE } from "./__fixtures__/snapshotCapture";
import {
  HELD_INPUT_MS,
  PredictionState,
  advancePrediction,
  createPrediction,
  lockMovement,
  noteDash,
  noteSent,
  observeServer,
  resetPrediction,
  restartPrediction,
  setHeldInput,
} from "./localPrediction";
import {
  PosSample,
  SNAPSHOT_INTERVAL_MS,
  SnapshotClock,
  observeSnapshot,
  pushSample,
  renderTimeAt,
  samplePosition,
} from "./snapshotInterpolation";

const FRAME_MS = 1000 / 60;
const TICK_SEC = SNAPSHOT_INTERVAL_MS / 1000;
const WORLD = 1000;

/** Arrival ms, tick, x, y, vx, vy, alive, and the input the tick ran on (`input_ack`). */
type Snap = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  boolean,
  number,
];
/** A change of the movement keys. */
interface Key {
  t: number;
  vx: number;
  vy: number;
  /** This message alone takes so much longer to reach the server (ms). */
  late?: number;
}
/** An input as sent: a change of keys, or the held keys again (`repeat`). */
interface Sent extends Key {
  seq: number;
  repeat: boolean;
}
/**
 * The inputs the client sends up to `until`. As in useServerRsClient the connection's
 * first input (number 1, no keys) is sent on open, so these count from 2; as in
 * ColyseusGameCanvas held keys are sent again every HELD_INPUT_MS, by a timer that
 * runs whatever the keys do (`repeats` false: a client from before that).
 */
function sendsOf(keys: readonly Key[], until: number, repeats = true): Sent[] {
  const sends: Sent[] = [];
  keys.forEach((k, i) => {
    sends.push({ ...k, seq: sends.length + 2, repeat: false });
    if (!repeats || (k.vx === 0 && k.vy === 0)) return;
    const end = Math.min(keys[i + 1]?.t ?? Infinity, until);
    const first = (Math.floor(k.t / HELD_INPUT_MS) + 1) * HELD_INPUT_MS;
    for (let t = first; t < end; t += HELD_INPUT_MS) {
      sends.push({
        t,
        vx: k.vx,
        vy: k.vy,
        seq: sends.length + 2,
        repeat: true,
      });
    }
  });
  return sends;
}
interface ServerOptions {
  /** Walking speed on grass. */
  speed?: number;
  start?: { x: number; y: number };
  /** Side of the square world. */
  world?: number;
  zones?: readonly TerrainZone[];
  /** One-way delays and extra, uneven snapshot lateness (ms). */
  uplink?: number;
  downlink?: number;
  jitter?: number;
  /** The uplink delay of inputs sent at or after `at`. */
  uplinkFrom?: { at: number; uplink: number };
  /** Each input takes a pseudo-random part of this longer to reach the server (ms). */
  uplinkJitter?: number;
  /** Which draw of `uplinkJitter`: the same link on another day. */
  seed?: number;
  /** `false`: a server without `input_ack`. A number: added to it (another socket's count). */
  echo?: false | number;
  /** `false`: the client does not send held keys again. */
  repeats?: false;
  /** Server time of tick 0. */
  phase?: number;
  /**
   * The first tick due at or after `at` runs `by` ms late, taking the inputs that
   * arrived meanwhile. As the server's timer does, the ticks after it keep their
   * schedule, less the whole ticks that one overran.
   */
  lateTick?: { at: number; by: number };
  stun?: { from: number; to: number };
  knockback?: { from: number; to: number; vx: number; vy: number };
  dash?: { from: number; dirX: number };
  dead?: { from: number; to: number };
  teleport?: { at: number; x: number; y: number };
}

/**
 * The server's walking rule (player_input.rs + physics.rs) at 20 ticks a second: each
 * tick runs on the newest input that has reached it (inputs arrive in the order sent, as
 * on one socket, each after `uplink` plus a pseudo-random part of `uplinkJitter`) and
 * echoes its number, and its snapshot reaches the client `downlink` plus a pseudo-random
 * part of `jitter` later.
 */
function serve(keys: readonly Key[], until: number, o: ServerOptions): Snap[] {
  const speed = o.speed ?? 200;
  const world = o.world ?? WORLD;
  const sends = sendsOf(keys, until, o.repeats);
  let reached = -Infinity;
  let draw = 11 + (o.seed ?? 0);
  const arrivals = sends.map((k) => {
    const from = o.uplinkFrom;
    const up = from && k.t >= from.at ? from.uplink : (o.uplink ?? 0);
    draw = (draw * 1103515245 + 12345) % 2147483648;
    const held = (o.uplinkJitter ?? 0) * (draw / 2147483648);
    reached = Math.max(reached, k.t + up + held + (k.late ?? 0));
    return reached;
  });
  let { x, y } = o.start ?? { x: 500, y: 500 };
  let seed = 7;
  let knock: { vx: number; vy: number } | null = null;
  let dashLeft = 0;
  let lastArrival = -Infinity;
  const snaps: Snap[] = [];
  let overrun = 0;
  let lateTick = o.lateTick;
  for (let tick = 0; ; tick++) {
    let time = tick * SNAPSHOT_INTERVAL_MS + (o.phase ?? 0) + overrun;
    if (time > until) return snaps;
    if (lateTick && time >= lateTick.at) {
      time += lateTick.by;
      overrun +=
        Math.floor(lateTick.by / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS;
      lateTick = undefined;
    }
    let mx = 0;
    let my = 0;
    let ack = 1;
    sends.forEach((k, i) => {
      if (arrivals[i] <= time) {
        const len = Math.max(Math.hypot(k.vx, k.vy), 1);
        mx = k.vx / len;
        my = k.vy / len;
        ack = k.seq;
      }
    });
    const within = (w?: { from: number; to: number }) =>
      !!w && time >= w.from && time < w.to;
    const dead = within(o.dead);
    const mult = o.zones ? terrainAt(o.zones, x, y).speedMultiplier : 1;
    let vx = mx * speed * mult;
    let vy = my * speed * mult;
    if (o.teleport && Math.abs(time - o.teleport.at) < 1) {
      x = o.teleport.x;
      y = o.teleport.y;
    }
    if (o.dash && Math.abs(time - o.dash.from) < 1) dashLeft = 0.22;
    if (dead || within(o.stun)) {
      vx = vy = 0;
    } else if (o.knockback && within(o.knockback)) {
      knock = knock ?? { vx: o.knockback.vx, vy: o.knockback.vy };
      knock.vx *= Math.exp(-6 * TICK_SEC);
      knock.vy *= Math.exp(-6 * TICK_SEC);
      vx = knock.vx;
      vy = knock.vy;
    } else if (dashLeft > 0 && (dashLeft -= TICK_SEC) > 0) {
      const base = speed * mult;
      vx = (o.dash?.dirX ?? 1) * (base + (450 - base) * (dashLeft / 0.22));
      vy = 0;
    }
    x = Math.min(Math.max(x + vx * TICK_SEC, 0), world);
    y = Math.min(Math.max(y + vy * TICK_SEC, 0), world);
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const late = (o.jitter ?? 0) * (seed / 2147483648);
    lastArrival = Math.max(lastArrival, time + (o.downlink ?? 0) + late);
    const echo = o.echo === false ? 0 : ack + (o.echo ?? 0);
    snaps.push([lastArrival, tick, x, y, vx, vy, !dead, echo]);
  }
}

/**
 * Where the simulated server has the player at server time `t`: the reference the
 * drawn position is judged against (part-way through a tick: part-way along its step).
 */
function serverAt(
  snaps: readonly Snap[],
  o: ServerOptions,
  t: number,
): { x: number; y: number } {
  const at = (t - (o.phase ?? 0)) / SNAPSHOT_INTERVAL_MS;
  const i = Math.min(Math.max(Math.floor(at), 0), snaps.length - 2);
  const k = Math.min(Math.max(at - i, 0), 1);
  const [, , ax, ay] = snaps[i];
  const [, , bx, by] = snaps[i + 1];
  return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k };
}

interface Frame {
  now: number;
  /** Drawn with prediction. */
  x: number;
  y: number;
  /** Drawn without: the interpolated timeline. */
  offX: number;
  offY: number;
  /** Newest snapshot. */
  serverX: number;
  serverY: number;
  /**
   * How far (x) the drawn position trails where the simulated server will be when an
   * input sent this frame reaches it (`now + uplink`); negative is ahead of it.
   * Needs `PlayOptions.server`.
   */
  behind: number;
  /** The module's own figure: distance to the target it computed. */
  error: number;
  yielding: PredictionState["yielding"];
}

interface PlayOptions {
  /** The options the snapshots were served with (link and world), for `behind`. */
  server?: ServerOptions;
  /** Client terrain; defaults to the server's. `null`: the client has none. */
  zones?: readonly TerrainZone[] | null;
  fps?: number;
  /** One frame this long (ms) at or after `at`: a hitch, or a tab coming back. */
  hitch?: { at: number; ms: number };
  from?: number;
  state?: PredictionState;
  casts?: ReadonlyArray<{ t: number; until: number }>;
  dashes?: readonly number[];
}

/** Feed snapshots and key changes to the client and draw at `fps` (60 by default). */
function play(
  snaps: readonly Snap[],
  keys: readonly Key[],
  o: PlayOptions = {},
): { frames: Frame[]; state: PredictionState } {
  const state = o.state ?? createPrediction();
  const server = o.server ?? {};
  const zones = o.zones === undefined ? (server.zones ?? null) : o.zones;
  const side = server.world ?? WORLD;
  const world = { zones, width: side, height: side };
  const frameMs = 1000 / (o.fps ?? 60);
  let hitch = o.hitch;
  const nextFrame = (now: number) => {
    if (!hitch || now < hitch.at) return frameMs;
    const ms = hitch.ms;
    hitch = undefined;
    return ms;
  };
  const frames: Frame[] = [];
  let clock: SnapshotClock | undefined;
  let samples: PosSample[] | undefined;
  let me = { x: 0, y: 0, isAlive: true, samples };
  let wasAlive = true;
  let s = 0;
  let k = 0;
  let c = 0;
  let d = 0;
  const end = snaps[snaps.length - 1][0];
  const sends = sendsOf(keys, end, server.repeats);
  for (let now = o.from ?? snaps[0][0] + 3; now <= end; now += nextFrame(now)) {
    for (; k < sends.length && sends[k].t <= now; k++) {
      const { t, vx, vy, seq, repeat } = sends[k];
      if (repeat) noteSent(state, t, seq);
      else setHeldInput(state, t, vx, vy, seq);
    }
    for (; o.casts && c < o.casts.length && o.casts[c].t <= now; c++) {
      lockMovement(state, o.casts[c].t, o.casts[c].until);
    }
    for (; o.dashes && d < o.dashes.length && o.dashes[d] <= now; d++) {
      noteDash(state, o.dashes[d]);
    }
    for (; s < snaps.length && snaps[s][0] <= now; s++) {
      const [arrival, tick, x, y, vx, vy, alive, ack] = snaps[s];
      const simTime = tick * SNAPSHOT_INTERVAL_MS;
      clock = observeSnapshot(clock, simTime, arrival);
      // As useServerRsClient does: a revived player starts a new history.
      samples = pushSample(alive && !wasAlive ? undefined : samples, {
        t: simTime,
        x,
        y,
      });
      wasAlive = alive;
      me = { x, y, isAlive: alive, samples };
      observeServer(
        state,
        { simTime, x, y, vx, vy, alive, ack, sent: k + 1 },
        clock.offsets,
        zones,
      );
    }
    if (!clock) continue;
    advancePrediction(state, now, me, world);
    const off = samplePosition(me, renderTimeAt(clock, now));
    const truth = serverAt(snaps, server, now + (server.uplink ?? 0));
    // As GameRenderer does: with nothing predicted the interpolated position is drawn.
    frames.push({
      now,
      x: state.ready ? state.x : off.x,
      y: state.ready ? state.y : off.y,
      offX: off.x,
      offY: off.y,
      serverX: me.x,
      serverY: me.y,
      behind: o.server ? truth.x - state.x : NaN,
      error: state.error,
      yielding: state.yielding,
    });
  }
  return { frames, state };
}

const between = (frames: Frame[], from: number, to: number) =>
  frames.filter((f) => f.now >= from && f.now <= to);
const stepsOf = (frames: Frame[], axis: "x" | "y" = "x") =>
  frames.slice(1).map((f, i) => f[axis] - frames[i][axis]);
const jumpsOf = (frames: Frame[]) =>
  frames
    .slice(1)
    .map((f, i) => Math.hypot(f.x - frames[i].x, f.y - frames[i].y));
const last = <T>(items: T[]) => items[items.length - 1];
/** Largest increase from one step to the next: 0 or less means the speed only fell. */
const riseOf = (steps: number[]) =>
  Math.max(...steps.slice(1).map((step, i) => step - steps[i]));
/** A millionth of a unit: below anything drawn, above floating-point residue. */
const EPS = 1e-6;
/** Serve and play one scenario on the same link, so `behind` is measured. */
const run = (
  keys: readonly Key[],
  until: number,
  server: ServerOptions,
  o: PlayOptions = {},
) => play(serve(keys, until, server), keys, { ...o, server });
/** Distance walked in one frame at 200 u/s. */
const WALK_STEP = (200 * FRAME_MS) / 1000;

const RIGHT = { vx: 2, vy: 0 };
const LEFT = { vx: -2, vy: 0 };
const STOP = { vx: 0, vy: 0 };
/** 50-130 ms between snapshots, 20 ms each way. */
const JITTERY = { uplink: 20, downlink: 20, jitter: 80 };

describe("input-to-motion delay", () => {
  const keys = [{ t: 1000, ...RIGHT }];
  const { frames } = play(serve(keys, 2500, JITTERY), keys);
  const firstMove = (axis: "x" | "offX") =>
    frames.find((f) => f[axis] > 500.01)!.now - 1000;

  it("moves the predicted player on the first frame after the key", () => {
    expect(firstMove("x")).toBeLessThanOrEqual(FRAME_MS);
  });

  it("is at least the interpolation delay without prediction", () => {
    expect(firstMove("offX")).toBeGreaterThanOrEqual(100);
  });
});

/** Nothing, the test link, and a slow one (120 ms round trip). */
const LINKS: ReadonlyArray<[string, ServerOptions]> = [
  ["no latency", {}],
  ["a jittered link", JITTERY],
  ["a slow link", { uplink: 60, downlink: 60, jitter: 30 }],
];

describe.each([30, 60, 144])(
  "against the simulated server at %i fps",
  (fps) => {
    const keys = [{ t: 1000, ...RIGHT }];
    const start = { x: 50, y: 500 };
    const walk = 200 / fps;

    it.each(LINKS)("moves within one frame of the key on %s", (_, link) => {
      const { frames } = run(keys, 2500, { ...link, start }, { fps });
      const moved = frames.find((f) => f.x > 50.01)!;
      expect(moved.now - 1000).toBeLessThanOrEqual(1000 / fps);
      // And that first step is a walking step, not a nudge.
      expect(moved.x - 50).toBeGreaterThan(walk * 0.7);
    });

    it.each(LINKS)(
      "trails the server by under a tick and a half on %s, never ahead",
      (_, link) => {
        const { frames } = run(keys, 5000, { ...link, start }, { fps });
        const behind = between(frames, 1500, 4800).map((f) => f.behind);
        // One tick of walking is 10 units: the input waits up to that long for a tick.
        expect(Math.min(...behind)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...behind)).toBeLessThan(15);
      },
    );

    it.each(LINKS)(
      "walks at the server's speed every frame on %s",
      (_, link) => {
        const { frames } = run(keys, 5000, { ...link, start }, { fps });
        const steps = stepsOf(between(frames, 1500, 4800));
        expect(Math.min(...steps)).toBeGreaterThan(walk * 0.95);
        expect(Math.max(...steps)).toBeLessThan(walk * 1.05);
      },
    );

    it.each(LINKS)(
      "covers a 250 ms frame in one step of that length on %s, with no catch-up",
      (_, link) => {
        const hitch = { at: 3000, ms: 250 };
        const { frames } = run(keys, 5000, { ...link, start }, { fps, hitch });
        const steps = stepsOf(between(frames, 2900, 3700));
        const long = Math.max(...steps);
        // 250 ms of walking at 200 u/s, as the server did meanwhile.
        expect(long).toBeGreaterThan(45);
        expect(long).toBeLessThan(55);
        const others = steps.filter((step) => step !== long);
        expect(Math.min(...others)).toBeGreaterThan(walk * 0.95);
        expect(Math.max(...others)).toBeLessThan(walk * 1.05);
        const behind = between(frames, 3250, 3700).map((f) => f.behind);
        expect(Math.min(...behind)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...behind)).toBeLessThan(15);
      },
    );
  },
);

describe("steady walking on jittered snapshots", () => {
  const keys = [{ t: 1000, ...RIGHT }];
  const start = { x: 50, y: 500 };
  const { frames, state } = play(
    serve(keys, 5000, { ...JITTERY, start }),
    keys,
  );
  const steady = between(frames, 1500, 5000);

  it("stays close to the server's path", () => {
    expect(Math.max(...steady.map((f) => f.error))).toBeLessThan(2);
    expect(state.yielding).toBeNull();
  });

  it("advances evenly every frame", () => {
    const steps = stepsOf(steady);
    expect(Math.min(...steps)).toBeGreaterThan(WALK_STEP * 0.8);
    expect(Math.max(...steps)).toBeLessThan(WALK_STEP * 1.2);
  });

  it("is drawn ahead of the interpolated timeline", () => {
    expect(last(steady).x - last(steady).offX).toBeGreaterThan(10);
  });
});

describe("stopping", () => {
  const keys = [
    { t: 1000, ...RIGHT },
    { t: 3000, ...STOP },
  ];
  const { frames } = play(serve(keys, 4500, JITTERY), keys);
  const after = between(frames, 3000, 4500);

  it("slows from walking speed and never speeds up again", () => {
    const steps = stepsOf(between(frames, 3000 - 2 * FRAME_MS, 4500));
    expect(steps[0]).toBeCloseTo(WALK_STEP, 1);
    expect(riseOf(steps)).toBeLessThanOrEqual(EPS);
  });

  it("never steps backwards", () => {
    expect(Math.min(...stepsOf(after))).toBeGreaterThanOrEqual(0);
  });

  it("eases the last few units out without a jump", () => {
    expect(last(after).x - after[0].x).toBeLessThan(15);
    expect(Math.max(...stepsOf(after))).toBeLessThan(WALK_STEP * 1.01);
  });

  it("settles exactly on the server's position within half a second", () => {
    const settled = after.find((f) => f.x === last(frames).serverX)!;
    expect(settled.now - 3000).toBeLessThan(500);
    expect(last(frames).x).toBe(last(frames).serverX);
    expect(last(frames).y).toBe(last(frames).serverY);
  });

  it("does not drift while standing on jittered snapshots", () => {
    const idle = play(serve([], 3000, JITTERY), []).frames;
    expect(new Set(idle.map((f) => `${f.x},${f.y}`))).toEqual(
      new Set(["500,500"]),
    );
  });
});

describe.each([30, 60, 144])(
  "stopping at %i fps, at every tick phase",
  (fps) => {
    const frameMs = 1000 / fps;
    // Where in a tick the release falls decides how far the server still walks.
    const stops = [0, 10, 20, 30, 40].flatMap((phase) =>
      [3000, 3013, 3027, 3041].map((release) => {
        const keys = [
          { t: 1000, ...RIGHT },
          { t: release, ...STOP },
        ];
        const { frames } = run(keys, 4500, { phase }, { fps });
        return {
          frames,
          release,
          steps: stepsOf(between(frames, release - 2 * frameMs, 4500)),
        };
      }),
    );

    it("slows monotonically to zero", () => {
      for (const { steps } of stops) {
        expect(steps[0]).toBeCloseTo(200 / fps, 1);
        expect(riseOf(steps)).toBeLessThanOrEqual(EPS);
        expect(last(steps)).toBe(0);
      }
    });

    it("never steps backwards", () => {
      for (const { steps } of stops) {
        expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
      }
    });

    it("ends on the server's rest position within 400 ms", () => {
      for (const { frames, release } of stops) {
        const end = last(frames);
        expect([end.x, end.y]).toEqual([end.serverX, end.serverY]);
        expect(end.behind).toBe(0);
        const landed = frames.find((f) => f.now > release && f.x === end.x)!;
        expect(landed.now - release).toBeLessThan(400);
      }
    });
  },
);

describe("a release the server takes one tick later than estimated", () => {
  // Until its echo arrives a release is placed by its send time, and the tick deadline
  // is an estimate, taken late: a release is assumed to make the earlier of two ticks.
  // When it makes the tick after, the rest point moves on 10 units after the stop
  // began: the one case where the speed may rise again, and only to the floor.
  const link = { uplink: 60, downlink: 60, jitter: 30 };
  const FLOOR_STEP = (60 * FRAME_MS) / 1000;
  const stops = [0, 10, 20, 30, 40].flatMap((phase) =>
    [3000, 3013, 3027, 3041].map((release) => {
      const keys = [
        { t: 1000, ...RIGHT },
        { t: release, ...STOP },
      ];
      const { frames } = run(keys, 4500, { ...link, phase });
      return {
        frames,
        release,
        steps: stepsOf(between(frames, release, 4500)),
      };
    }),
  );

  it("is among the cases", () => {
    expect(stops.some(({ steps }) => riseOf(steps) > EPS)).toBe(true);
  });

  it("never steps backwards and ends on the server's rest position", () => {
    for (const { frames, steps } of stops) {
      expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
      expect(last(frames).x).toBe(last(frames).serverX);
      expect(last(frames).behind).toBe(0);
    }
  });

  it("speeds up again to the floor at most, and is over within 600 ms", () => {
    for (const { frames, release, steps } of stops) {
      const slowed = steps.findIndex((step) => step <= FLOOR_STEP);
      expect(Math.max(...steps.slice(slowed))).toBeLessThanOrEqual(
        FLOOR_STEP + EPS,
      );
      const landed = frames.find(
        (f) => f.now > release && f.x === last(frames).x,
      )!;
      expect(landed.now - release).toBeLessThan(600);
    }
  });
});

describe("reversing direction", () => {
  const keys = [
    { t: 1000, ...RIGHT },
    { t: 3000, ...LEFT },
  ];
  const { frames } = play(serve(keys, 4500, JITTERY), keys);
  const after = between(frames, 3000, 4500);

  it("turns on the frame the key changes", () => {
    expect(stepsOf(after)[0]).toBeLessThan(0);
  });

  it("never jumps, and never goes back the old way", () => {
    const steps = stepsOf(after);
    expect(Math.max(...steps)).toBeLessThanOrEqual(0);
    expect(Math.min(...steps)).toBeGreaterThan(-WALK_STEP * 1.2);
  });

  it("is back on the server's path", () => {
    expect(last(after).error).toBeLessThan(2);
  });
});

describe("crossing a terrain boundary", () => {
  // Grass, then mud (x0.5) from x = 600.
  const zones: TerrainZone[] = [
    { terrain: "mud", x: 600, y: 0, width: 400, height: 1000 },
  ];
  const keys = [{ t: 1000, ...RIGHT }];
  const { frames, state } = play(
    serve(keys, 4000, { ...JITTERY, zones }),
    keys,
    {
      zones,
    },
  );
  const walking = between(frames, 1500, 4000);

  it("slows to the mud speed without oscillating", () => {
    const steps = stepsOf(walking);
    expect(Math.min(...steps)).toBeGreaterThan(WALK_STEP * 0.4);
    expect(Math.max(...steps)).toBeLessThan(WALK_STEP * 1.2);
    const mud = stepsOf(walking.filter((f) => f.x > 620));
    expect(Math.max(...mud)).toBeLessThan(WALK_STEP * 0.6);
  });

  it("converges on the server's path and keeps predicting", () => {
    expect(Math.max(...walking.map((f) => f.error))).toBeLessThan(3);
    expect(walking.every((f) => f.yielding === null)).toBe(true);
    expect(state.baseSpeed).toBeCloseTo(200, 0);
  });
});

describe("the large test map (map-for-test-large)", () => {
  // Grass from the ring road at x = 1030, mud (x0.5) from x = 1200.
  const table = terrainZonesFor("map-for-test-large");
  const zones = table ?? [];
  const keys = [
    { t: 1000, ...RIGHT },
    { t: 3800, ...STOP },
  ];
  const server = {
    ...JITTERY,
    zones,
    world: 4000,
    start: { x: 1060, y: 1500 },
  };

  it("predicts through the mud edge with the client's zone table", () => {
    expect(table).not.toBeNull();
    const { frames } = run(keys, 4800, server);
    const walking = between(frames, 1500, 3800);
    expect(last(walking).x).toBeGreaterThan(1300);
    const steps = stepsOf(walking);
    expect(Math.min(...steps)).toBeGreaterThan(WALK_STEP * 0.45);
    expect(Math.max(...steps)).toBeLessThan(WALK_STEP * 1.05);
    expect(walking.every((f) => f.yielding === null)).toBe(true);
    const behind = walking.map((f) => f.behind);
    expect(Math.min(...behind)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...behind)).toBeLessThan(15);
  });

  it("without a zone table still predicts, and never steps backwards", () => {
    const { frames } = run(keys, 4800, server, { zones: null });
    expect(frames.every((f) => f.yielding === null)).toBe(true);
    expect(Math.min(...stepsOf(frames))).toBeGreaterThanOrEqual(0);
    expect(last(frames).x).toBe(last(frames).serverX);
  });
});

describe("when the server stops obeying the keys", () => {
  const keys = [{ t: 1000, ...RIGHT }];
  const start = { x: 100, y: 500 };

  it("yields to a knockback and returns without a pop", () => {
    const knockback = { from: 2000, to: 2400, vx: 0, vy: 240 };
    const { frames } = play(
      serve(keys, 4000, { ...JITTERY, start, knockback }),
      keys,
    );
    const yielded = frames.filter((f) => f.yielding === "diverged");
    expect(yielded[0].now).toBeLessThan(2300);
    expect(last(yielded).now).toBeLessThan(2700);
    // Pushed down the screen with the server, then walking right again.
    expect(last(frames).y - 500).toBeGreaterThan(30);
    expect(Math.abs(last(frames).y - last(frames).serverY)).toBeLessThan(0.5);
    expect(last(frames).error).toBeLessThan(2);
    expect(Math.max(...jumpsOf(between(frames, 1500, 4000)))).toBeLessThan(
      WALK_STEP * 1.6,
    );
  });

  it("yields to a stun, holds where the server holds, and resumes", () => {
    const stun = { from: 2000, to: 3200 };
    const { frames } = play(serve(keys, 4500, { ...JITTERY, stun }), keys);
    const held = between(frames, 2600, 3200);
    expect(held.every((f) => f.yielding === "diverged")).toBe(true);
    expect(Math.abs(last(held).x - last(held).serverX)).toBeLessThan(0.5);
    expect(last(frames).yielding).toBeNull();
    expect(last(frames).error).toBeLessThan(2);
    expect(Math.max(...jumpsOf(between(frames, 1500, 4500)))).toBeLessThan(
      WALK_STEP * 1.6,
    );
  });

  it("hands a dash to the server and takes it back without a pop", () => {
    const dash = { from: 2050, dirX: 1 };
    const { frames } = play(
      serve(keys, 3500, { ...JITTERY, start, dash }),
      keys,
      {
        dashes: [2000],
      },
    );
    expect(
      between(frames, 2000, 2300).every((f) => f.yielding === "dash"),
    ).toBe(true);
    expect(last(frames).yielding).toBeNull();
    expect(last(frames).error).toBeLessThan(2);
    const steps = stepsOf(between(frames, 1500, 3500));
    expect(Math.min(...steps)).toBeGreaterThan(0);
    // Never faster than the dash itself (450 u/s).
    expect(Math.max(...steps)).toBeLessThan((450 * FRAME_MS) / 1000);
  });

  it("stops for a local cast on that frame and walks on when it ends", () => {
    const stun = { from: 2000, to: 2500 }; // the server's cast lock
    const { frames } = play(serve(keys, 3500, { ...JITTERY, stun }), keys, {
      casts: [{ t: 1975, until: 2475 }],
    });
    const casting = between(frames, 1975, 2475);
    expect(stepsOf(casting)[0]).toBeLessThan(WALK_STEP * 0.5);
    expect(Math.min(...stepsOf(casting))).toBeGreaterThanOrEqual(0);
    expect(frames.every((f) => f.yielding === null)).toBe(true);
    expect(stepsOf(between(frames, 2475, 2520))[0]).toBeGreaterThan(
      WALK_STEP * 0.5,
    );
    expect(last(frames).error).toBeLessThan(2);
  });
});

describe("death, respawn and teleport", () => {
  it("snaps to a teleport instead of sliding across the map", () => {
    const teleport = { at: 2000, x: 100, y: 800 };
    const { frames } = play(serve([], 3000, { ...JITTERY, teleport }), []);
    const moved = frames.findIndex((f) => f.serverX === 100);
    expect(frames[moved].x).toBe(100);
    expect(frames[moved].y).toBe(800);
    expect(frames[moved - 1].x).toBe(500);
  });

  it.each([
    ["standing", 500, []],
    ["walking", 300, [{ t: 1000, ...RIGHT }]],
  ])("snaps to a short debug teleport while %s", (_, x, keys) => {
    // From about (500, 500), 50 units: under the 100-unit rule, far beyond a tick.
    const start = { x, y: 500 };
    const teleport = { at: 2000, x: 540, y: 530 };
    const { frames } = play(
      serve(keys, 3000, { ...JITTERY, start, teleport }),
      keys,
    );
    const moved = frames.findIndex((f) => f.serverY === 530);
    expect(Math.abs(frames[moved - 1].y - 500)).toBeLessThan(0.01);
    expect(Math.abs(frames[moved].y - 530)).toBeLessThan(0.01);
    expect(Math.abs(frames[moved].x - frames[moved].serverX)).toBeLessThan(25);
    // And nothing left to ease out afterwards.
    expect(Math.max(...jumpsOf(frames.slice(moved)))).toBeLessThan(
      WALK_STEP * 1.2,
    );
  });

  it("follows the server while dead and snaps to the respawn point", () => {
    const keys = [{ t: 1000, ...RIGHT }];
    const { frames } = play(
      serve(keys, 4000, {
        ...JITTERY,
        dead: { from: 2000, to: 3000 },
        teleport: { at: 3000, x: 610, y: 500 },
      }),
      keys,
    );
    const dead = between(frames, 2400, 2900);
    expect(dead.every((f) => f.yielding === "dead")).toBe(true);
    expect(Math.abs(last(dead).x - last(dead).serverX)).toBeLessThan(0.5);
    // Revived some 80 units back: too near for the teleport rule, still a snap.
    const revived = frames.findIndex(
      (f) => f.now > 3000 && f.yielding === null,
    );
    const moved = frames[revived - 1].x - frames[revived].x;
    expect(moved).toBeGreaterThan(50);
    expect(moved).toBeLessThan(100);
    expect(Math.abs(frames[revived].x - frames[revived].serverX)).toBeLessThan(
      25,
    );
  });

  it("starts over in a new room with the keys still held", () => {
    const state = createPrediction();
    setHeldInput(state, 0, 2, 0, 2);
    state.x = 900;
    state.ready = true;
    resetPrediction(state, 5000);
    expect(state.ready).toBe(false);
    expect(state.history).toEqual([
      { t: 5000, mx: 1, my: 0, seq: 0, due: 5000 },
    ]);
  });

  it("starts a new connection with no key held and nothing known of its link", () => {
    const state = createPrediction();
    setHeldInput(state, 0, 2, 0, 2);
    state.marks = [-180, -190];
    state.ack = 2;
    state.ready = true;
    restartPrediction(state, 5000);
    expect(state.ready).toBe(false);
    expect([state.heldX, state.heldY, state.ack]).toEqual([0, 0, 0]);
    expect(state.marks).toEqual([]);
    expect(state.history).toEqual([]);
  });
});

describe("base speed calibration", () => {
  const keys = [{ t: 1000, ...RIGHT }];
  const start = { x: 100, y: 500 };

  it("converges from 200 on the server's real walking speed", () => {
    const { frames, state } = play(
      serve(keys, 4000, { ...JITTERY, start, speed: 260 }),
      keys,
    );
    expect(state.calibrated).toBe(true);
    expect(state.baseSpeed).toBeCloseTo(260, 0);
    expect(last(frames).error).toBeLessThan(2);
  });

  it("divides the terrain multiplier out", () => {
    const zones: TerrainZone[] = [
      { terrain: "mud", x: 0, y: 0, width: 1000, height: 1000 },
    ];
    const { state } = play(
      serve(keys, 4000, { ...JITTERY, start, speed: 260, zones }),
      keys,
      { zones },
    );
    expect(state.baseSpeed).toBeCloseTo(260, 0);
  });

  it("is not calibrated by standing still", () => {
    const { state } = play(serve([], 2000, JITTERY), []);
    expect(state.calibrated).toBe(false);
    expect(state.baseSpeed).toBe(200);
  });
});

describe("tick deadline", () => {
  const still = { x: 0, y: 0, vx: 0, vy: 0, alive: true };
  /** Feed ticks `from`..`to`; the server has input `ack` from tick `at` on. */
  const feed = (
    state: PredictionState,
    ticks: { from: number; to: number; at: number; ack: number },
    base: number,
  ) => {
    for (let tick = ticks.from; tick <= ticks.to; tick++) {
      const ack = tick >= ticks.at ? ticks.ack : ticks.ack - 1;
      observeServer(
        state,
        { ...still, simTime: tick * 50, ack, sent: ticks.ack },
        [base],
        null,
      );
    }
  };

  it("is the snapshot's arrival until an input has been acknowledged", () => {
    const state = createPrediction();
    feed(state, { from: 0, to: 3, at: 0, ack: 1 }, 40);
    expect(state.deadline).toBe(40);
  });

  it("is under a tick after an input that made its tick", () => {
    const state = createPrediction();
    feed(state, { from: 0, to: 1, at: 0, ack: 1 }, 400);
    // Sent at 130, first in the tick at 200: the deadline of tick 0 is in [-70, -20).
    setHeldInput(state, 130, 0, 2, 2);
    feed(state, { from: 2, to: 5, at: 4, ack: 2 }, 400);
    expect(state.marks).toEqual([-70]);
    expect(state.deadline).toBeCloseTo(-20, 2);
    expect(state.deadline).toBeLessThan(-20);
    expect(state.rtt).toBeCloseTo(420, 2);
  });

  it("is placed by every acknowledged input, not only a change of keys", () => {
    const state = createPrediction();
    feed(state, { from: 0, to: 1, at: 0, ack: 1 }, 400);
    noteSent(state, 130, 2);
    feed(state, { from: 2, to: 4, at: 4, ack: 2 }, 400);
    // Sent at 225, first in the tick at 250: the deadline is in [-25, -20).
    noteSent(state, 225, 3);
    feed(state, { from: 5, to: 6, at: 5, ack: 3 }, 400);
    expect(state.marks).toEqual([-70, -25]);
    expect(state.history).toEqual([]);
    // Taken a margin after the fastest input, not at the end of what they allow.
    expect(state.deadline).toBeGreaterThan(-20);
    expect(state.deadline).toBeLessThan(-5);
  });

  it("is not moved by a delayed input, and follows a link that got faster", () => {
    const state = createPrediction();
    feed(state, { from: 0, to: 1, at: 0, ack: 1 }, 400);
    setHeldInput(state, 130, 0, 2, 2);
    feed(state, { from: 2, to: 5, at: 4, ack: 2 }, 400);
    // Sent at 300 but only in the tick at 500: held up on the way, not a later deadline.
    setHeldInput(state, 300, 0, 0, 3);
    feed(state, { from: 6, to: 11, at: 10, ack: 3 }, 400);
    expect(state.deadline).toBeCloseTo(-20, 2);
    // Sent at 640 and in the tick at 650: the deadline is 60 ms later than it was, so
    // what the slower link showed no longer bounds it.
    setHeldInput(state, 640, 0, 2, 4);
    feed(state, { from: 12, to: 14, at: 13, ack: 4 }, 400);
    expect(state.deadline).toBeCloseTo(40, 2);
  });

  it("moves with the simulation clock when the server skipped a tick", () => {
    const state = createPrediction();
    feed(state, { from: 0, to: 1, at: 0, ack: 1 }, 400);
    setHeldInput(state, 130, 0, 2, 2);
    feed(state, { from: 2, to: 5, at: 4, ack: 2 }, 400);
    // The server stalled for a tick: every tick now runs, and arrives, 50 ms later
    // than its number says (a few ms either way is only the link's jitter).
    feed(state, { from: 6, to: 7, at: 0, ack: 2 }, 453);
    expect(state.deadline).toBeCloseTo(30, 2);
    feed(state, { from: 8, to: 9, at: 0, ack: 2 }, 396);
    expect(state.deadline).toBeCloseTo(-20, 2);
  });

  it("takes no mark from an input first seen after a gap in the snapshots", () => {
    const state = createPrediction();
    feed(state, { from: 0, to: 1, at: 0, ack: 1 }, 400);
    setHeldInput(state, 130, 0, 2, 2);
    feed(state, { from: 6, to: 7, at: 6, ack: 2 }, 400);
    expect(state.marks).toEqual([]);
    expect(state.history).toHaveLength(1);
  });

  it("does not take a slow drift at rest for disobedience", () => {
    const state = createPrediction();
    for (let tick = 0; tick < 10; tick++) {
      observeServer(
        state,
        {
          simTime: tick * 50,
          x: 0,
          y: 0,
          vx: 0.3,
          vy: 0,
          alive: true,
          ack: 1,
          sent: 1,
        },
        [0],
        null,
      );
    }
    expect(state.diverged).toBe(false);
  });

  it("is never before the real one, and closes in on it from a few key changes", () => {
    const keys: Key[] = [];
    for (let i = 0; i < 12; i++) {
      keys.push({ t: 1000 + i * 437, ...(i % 2 ? STOP : RIGHT) });
    }
    const { state } = play(
      serve(keys, 7000, { uplink: 60, downlink: 60, jitter: 30 }),
      keys,
    );
    // An input sent by `S - 60` is in the tick at `S`.
    expect(state.deadline).toBeGreaterThanOrEqual(-60);
    expect(state.deadline).toBeLessThan(-45);
    expect(state.history).toHaveLength(1);
  });
});

describe("a server whose echo cannot be used", () => {
  const keys = [
    { t: 1000, ...RIGHT },
    { t: 3000, ...STOP },
  ];

  it.each<[string, false | number]>([
    ["sends none (an older server)", false],
    ["counts another socket's inputs", 1000],
  ])("draws the server's position when it %s", (_, echo) => {
    const { frames, state } = run(keys, 4500, { ...JITTERY, echo });
    expect(frames.every((f) => f.yielding === "unacked")).toBe(true);
    expect(state.ready).toBe(false);
    expect(state.marks).toEqual([]);
    // Exactly what is drawn with prediction off, to the server's rest position.
    expect(frames.every((f) => f.x === f.offX && f.y === f.offY)).toBe(true);
    expect(last(frames).x).toBe(last(frames).serverX);
    expect(last(frames).x).toBeGreaterThan(800);
  });

  it("predicts again from the first echo that is its own", () => {
    const state = createPrediction();
    const old = serve(keys.slice(0, 1), 2000, { ...JITTERY, echo: false });
    play(old, keys.slice(0, 1), { state });
    expect(state.yielding).toBe("unacked");
    const snaps = serve(keys.slice(0, 1), 4000, JITTERY).slice(old.length);
    const { frames } = play(snaps, keys.slice(0, 1), { state });
    expect(last(frames).yielding).toBeNull();
    expect(last(frames).error).toBeLessThan(2);
  });
});

describe("input normalisation (server rule)", () => {
  it("scales the client's doubled vector down to a unit direction", () => {
    const state = createPrediction();
    setHeldInput(state, 0, Math.SQRT2, -Math.SQRT2, 2);
    expect(Math.hypot(state.heldX, state.heldY)).toBeCloseTo(1, 6);
    setHeldInput(state, 1, 0.005, 0, 3);
    expect(state.heldX).toBe(0);
    expect(state.history).toHaveLength(2);
  });

  it("takes a non-finite vector for no input", () => {
    const state = createPrediction();
    setHeldInput(state, 0, 2, 0, 2);
    setHeldInput(state, 1, NaN, 0, 3);
    expect([state.heldX, state.heldY]).toEqual([0, 0]);
    setHeldInput(state, 2, 0, Infinity, 4);
    expect([state.heldX, state.heldY]).toEqual([0, 0]);
  });

  it("recovers from a non-finite drawn position on the next frame", () => {
    const keys = [{ t: 1000, ...RIGHT }];
    const snaps = serve(keys, 3000, JITTERY);
    const { state } = play(snaps.slice(0, 30), keys);
    state.x = NaN;
    const { frames } = play(snaps, keys, { state, from: 1600 });
    expect(Number.isFinite(frames[0].x)).toBe(true);
  });

  it("records a change only when the input in effect changes", () => {
    const state = createPrediction();
    setHeldInput(state, 0, 2, 0, 2);
    setHeldInput(state, 5, 2, 0, 3);
    expect(state.history).toHaveLength(1);
  });
});

describe("a real jittered capture (map-for-test-terrain)", () => {
  // Inputs as documented in the fixture.
  const keys: Key[] = [
    { t: 865, ...RIGHT },
    { t: 5365, ...STOP },
    { t: 6365, ...RIGHT },
    { t: 7365, ...LEFT },
    { t: 8365, ...RIGHT },
    { t: 8866, ...STOP },
    { t: 9865, vx: 0, vy: 2 },
    { t: 10564, ...STOP },
  ];
  const zones: TerrainZone[] = [
    { terrain: "road", x: 50, y: 0, width: 150, height: 700 },
    { terrain: "grass", x: 200, y: 0, width: 150, height: 700 },
    { terrain: "forest", x: 350, y: 0, width: 150, height: 700 },
    { terrain: "sand", x: 500, y: 0, width: 150, height: 700 },
    { terrain: "ice", x: 650, y: 0, width: 150, height: 700 },
    { terrain: "mud", x: 800, y: 0, width: 150, height: 700 },
  ];
  // The capture predates `input_ack`: each key is taken as applied by the first tick
  // that moves its way.
  let applied = 0;
  const snaps = CAPTURE.map((r): Snap => {
    const next = keys[applied];
    if (
      next &&
      r[0] >= next.t &&
      Math.sign(r[4]) === Math.sign(next.vx) &&
      Math.sign(r[5]) === Math.sign(next.vy)
    ) {
      applied++;
    }
    return [...r, true, applied + 1];
  });
  const { frames, state } = play(snaps, keys, {
    zones,
    server: { repeats: false },
  });

  it("responds within a frame where interpolation took over 100 ms", () => {
    const moved = (axis: "x" | "offX") =>
      frames.find((f) => f[axis] > 25.01)!.now - 865;
    expect(moved("x")).toBeLessThanOrEqual(FRAME_MS);
    expect(moved("offX")).toBeGreaterThan(100);
  });

  it("calibrates the real base speed and stays on the server's path", () => {
    expect(state.baseSpeed).toBeCloseTo(201, 0);
    const walking = between(frames, 1400, 5300);
    const errors = walking.map((f) => f.error).sort((a, b) => a - b);
    expect(errors[errors.length >> 1]).toBeLessThan(2);
  });

  it("ends every stop exactly on the server's position", () => {
    for (const t of [6300, 9800, 11300]) {
      const f = last(between(frames, 0, t));
      expect([f.x, f.y]).toEqual([f.serverX, f.serverY]);
    }
  });
});

describe("a server tick that runs late on a local link", () => {
  // The price of never walking back from a stop made during it: the walk waits for
  // the tick, as the server's own player does, instead of gliding on ahead of it.
  const keys = [{ t: 1000, ...RIGHT }];

  it.each([30, 80])("waits out a tick %i ms late and walks on", (by) => {
    const { frames } = run(keys, 4000, {
      uplinkJitter: 5,
      jitter: 5,
      lateTick: { at: 3000, by },
    });
    const steps = stepsOf(between(frames, 2950, 3400));
    const waiting = steps.filter((step) => step < WALK_STEP * 0.5);
    expect(Math.min(...steps)).toBeGreaterThan(0);
    expect(waiting.length * FRAME_MS).toBeLessThanOrEqual(by + FRAME_MS);
    expect(Math.max(...steps)).toBeLessThan(WALK_STEP * 1.25);
    expect(last(steps)).toBeCloseTo(WALK_STEP, 1);
  });
});

/**
 * Every stop measured the same way: a walk to the right, a release at each of 8 points
 * of a tick, the server's ticks at each of 10 phases, drawn at 30, 60 and 144 fps, each
 * of the 240 with its own draw of the uplink jitter.
 */
describe("stop sweep", () => {
  const PHASES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];
  const RELEASES = [0, 7, 13, 19, 27, 33, 41, 47];
  const slow = { uplink: 60, downlink: 60, jitter: 30 };
  const fell = { ...slow, uplinkFrom: { at: 2000, uplink: 5 } };
  /** A local link: each way takes up to 5 ms. */
  const local = { uplinkJitter: 5, jitter: 5 };
  /** `link` with the server tick due around the release run `by` ms late. */
  const lateTick =
    (link: ServerOptions, by: number) =>
    (release: number): ServerOptions => ({
      ...link,
      lateTick: { at: release - 40, by },
    });
  const oneWalk = (release: number, late?: number): Key[] => [
    { t: 1000, ...RIGHT },
    { t: release, ...STOP, late },
  ];
  /** A first walk and stop, then the walk whose stop is measured. */
  const twoWalks = (release: number, late?: number): Key[] => [
    { t: 1000, ...RIGHT },
    { t: 1613, ...STOP },
    { t: 2231, ...RIGHT, late },
    { t: release, ...STOP },
  ];
  /** `link` with every input before the measured release `ms` longer on its way. */
  const sooner =
    (link: ServerOptions, ms: number) =>
    (release: number): ServerOptions => ({
      ...link,
      uplink: (link.uplink ?? 0) + ms,
      uplinkFrom: { at: release, uplink: link.uplink ?? 0 },
    });
  interface Broken {
    /** The drawn player stepped back the way it came. */
    backward: number;
    /** It was drawn beyond where the server came to rest. */
    overshoot: number;
    /** Its speed was higher than the frame before, at any point after the release. */
    rise: number;
    /** It did not end exactly on the server's rest position. */
    astray: number;
  }
  /** How many of the 240 stops break each rule. */
  const sweep = (
    keysFor: (release: number) => Key[],
    linkFor: ServerOptions | ((release: number) => ServerOptions),
  ): Broken => {
    const broken = { backward: 0, overshoot: 0, rise: 0, astray: 0 };
    let seed = 0;
    for (const fps of [30, 60, 144]) {
      for (const phase of PHASES) {
        for (const r of RELEASES) {
          const release = 3200 + r;
          const link =
            typeof linkFor === "function" ? linkFor(release) : linkFor;
          const { frames } = run(
            keysFor(release),
            release + 1500,
            { ...link, phase, seed: seed++ },
            { fps },
          );
          const rest = last(frames).serverX;
          const after = between(frames, release - 1000 / fps, Infinity);
          if (Math.min(...stepsOf(after)) < -EPS) broken.backward++;
          if (Math.max(...after.map((f) => f.x)) - rest > EPS) {
            broken.overshoot++;
          }
          if (riseOf(stepsOf(between(frames, release, Infinity))) > EPS) {
            broken.rise++;
          }
          if (last(frames).x !== rest) broken.astray++;
        }
      }
    }
    return broken;
  };
  const count = (
    backward: number,
    overshoot: number,
    rise: number,
    astray: number,
  ): Broken => ({ backward, overshoot, rise, astray });

  // Stops of 240 that walk backward, overshoot, speed up again, or end off the rest
  // position. Every count above zero is what the code does today: a measured ceiling,
  // not a target, and one that may only be edited downwards. The speed rises where the
  // release was assumed to make the earlier of two ticks and made the later (the
  // deadline's margin, 14 ms of every 50); a stop walks back only where the release
  // was faster than every input of the walk before it, by more than that margin.
  it.each<
    [
      string,
      (release: number) => Key[],
      ServerOptions | ((release: number) => ServerOptions),
      Broken,
    ]
  >([
    ["no latency", oneWalk, {}, count(0, 0, 0, 0)],
    ["5 ms each way", oneWalk, { uplink: 5, downlink: 5 }, count(0, 0, 0, 0)],
    ["a jittered link", oneWalk, JITTERY, count(0, 0, 52, 0)],
    ["a slow link", oneWalk, slow, count(0, 0, 69, 0)],
    [
      "a slow link, the key press 120 ms late",
      (release) => twoWalks(release, 120),
      slow,
      count(0, 0, 69, 0),
    ],
    [
      "a slow link, the release 120 ms late",
      (release) => oneWalk(release, 120),
      slow,
      count(0, 0, 240, 0),
    ],
    [
      "an uplink that fell from 60 ms to 5 ms before the walk",
      twoWalks,
      fell,
      count(0, 0, 67, 0),
    ],
    [
      "an uplink that fell from 60 ms to 5 ms during the walk",
      oneWalk,
      fell,
      count(0, 0, 67, 0),
    ],
    [
      "10 ms up and 2 ms down, inputs up to 10 ms longer",
      oneWalk,
      { uplink: 10, downlink: 2, uplinkJitter: 10 },
      count(0, 0, 0, 0),
    ],
    [
      "a jittered link, inputs up to 15 ms longer",
      oneWalk,
      { ...JITTERY, uplinkJitter: 15 },
      count(0, 0, 51, 0),
    ],
    [
      "a jittered link, inputs up to 15 ms longer, after an earlier walk",
      twoWalks,
      { ...JITTERY, uplinkJitter: 15 },
      count(0, 0, 49, 0),
    ],
    [
      "a slow link, inputs up to 30 ms longer",
      oneWalk,
      { ...slow, uplinkJitter: 30 },
      count(0, 0, 91, 0),
    ],
    [
      "a jittered link, the release 15 ms sooner than the walk's inputs",
      oneWalk,
      sooner(JITTERY, 15),
      count(3, 3, 6, 0),
    ],
    [
      "a jittered link, the release 15 ms sooner, after an earlier walk",
      twoWalks,
      sooner(JITTERY, 15),
      count(3, 3, 6, 0),
    ],
    [
      "a slow link, the release 30 ms sooner than the walk's inputs",
      oneWalk,
      sooner(slow, 30),
      count(42, 42, 45, 0),
    ],
    ["a local link", oneWalk, local, count(0, 0, 0, 0)],
    [
      "a local link, the tick at the release 30 ms late",
      oneWalk,
      lateTick(local, 30),
      count(0, 0, 0, 0),
    ],
    [
      "a local link, the tick at the release 55 ms late",
      oneWalk,
      lateTick(local, 55),
      count(0, 0, 0, 0),
    ],
    [
      "a local link, the tick at the release 80 ms late",
      oneWalk,
      lateTick(local, 80),
      count(0, 0, 0, 0),
    ],
  ])("%s", (_, keysFor, link, ceiling) => {
    expect(sweep(keysFor, link)).toEqual(ceiling);
  });
});
