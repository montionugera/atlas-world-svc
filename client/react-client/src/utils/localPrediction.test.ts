import { TerrainZone, terrainAt, terrainZonesFor } from "../config/terrain";
import { CAPTURE } from "./__fixtures__/snapshotCapture";
import {
  PredictionState,
  advancePrediction,
  createPrediction,
  lockMovement,
  noteDash,
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

/** Arrival ms, tick, x, y, vx, vy, alive. */
type Snap = readonly [number, number, number, number, number, number, boolean];
interface Key {
  t: number;
  vx: number;
  vy: number;
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
  /** Server time of tick 0. */
  phase?: number;
  stun?: { from: number; to: number };
  knockback?: { from: number; to: number; vx: number; vy: number };
  dash?: { from: number; dirX: number };
  dead?: { from: number; to: number };
  teleport?: { at: number; x: number; y: number };
}

/**
 * The server's walking rule (player_input.rs + physics.rs) at 20 ticks a second: each
 * tick runs on the newest input that has reached it, and its snapshot reaches the
 * client `downlink` plus a pseudo-random part of `jitter` later.
 */
function serve(keys: readonly Key[], until: number, o: ServerOptions): Snap[] {
  const speed = o.speed ?? 200;
  const up = o.uplink ?? 0;
  const world = o.world ?? WORLD;
  let { x, y } = o.start ?? { x: 500, y: 500 };
  let seed = 7;
  let knock: { vx: number; vy: number } | null = null;
  let dashLeft = 0;
  let lastArrival = -Infinity;
  const snaps: Snap[] = [];
  for (let tick = 0; ; tick++) {
    const time = tick * SNAPSHOT_INTERVAL_MS + (o.phase ?? 0);
    if (time > until) return snaps;
    let mx = 0;
    let my = 0;
    for (const k of keys) {
      if (k.t + up <= time) {
        const len = Math.max(Math.hypot(k.vx, k.vy), 1);
        mx = k.vx / len;
        my = k.vy / len;
      }
    }
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
    snaps.push([lastArrival, tick, x, y, vx, vy, !dead]);
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
  for (let now = o.from ?? snaps[0][0] + 3; now <= end; now += nextFrame(now)) {
    for (; k < keys.length && keys[k].t <= now; k++) {
      setHeldInput(state, keys[k].t, keys[k].vx, keys[k].vy);
    }
    for (; o.casts && c < o.casts.length && o.casts[c].t <= now; c++) {
      lockMovement(state, o.casts[c].t, o.casts[c].until);
    }
    for (; o.dashes && d < o.dashes.length && o.dashes[d] <= now; d++) {
      noteDash(state, o.dashes[d]);
    }
    for (; s < snaps.length && snaps[s][0] <= now; s++) {
      const [arrival, tick, x, y, vx, vy, alive] = snaps[s];
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
        { simTime, x, y, vx, vy, alive },
        clock.offsets,
        zones,
      );
    }
    if (!clock) continue;
    advancePrediction(state, now, me, world);
    const off = samplePosition(me, renderTimeAt(clock, now));
    const truth = serverAt(snaps, server, now + (server.uplink ?? 0));
    frames.push({
      now,
      x: state.x,
      y: state.y,
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
  // The round trip is only known to within a tick, and is taken low so a stop never
  // overshoots. When that is a tick short the rest point moves on 10 units after the
  // stop began: the one case where the speed may rise again, and only to the floor.
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
    setHeldInput(state, 0, 2, 0);
    state.x = 900;
    state.ready = true;
    resetPrediction(state, 5000);
    expect(state.ready).toBe(false);
    expect(state.history).toEqual([{ t: 5000, mx: 1, my: 0 }]);
  });

  it("starts a new connection with no key held and no round trip", () => {
    const state = createPrediction();
    setHeldInput(state, 0, 2, 0);
    state.delays = [180, 190];
    state.rtt = 140;
    state.ready = true;
    restartPrediction(state, 5000);
    expect(state.ready).toBe(false);
    expect([state.heldX, state.heldY, state.rtt]).toEqual([0, 0, 0]);
    expect(state.delays).toEqual([]);
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

describe("round-trip estimate", () => {
  it("is not thrown by one slow sample among normal ones", () => {
    const state = createPrediction();
    const offsets = [0];
    const still = { x: 0, y: 0, vx: 0, vy: 0, alive: true };
    // Key changes seen 30 ms later, except one seen 290 ms later.
    [30, 30, 290, 30, 30].forEach((delay, i) => {
      const t = 1000 * (i + 1);
      setHeldInput(state, t, i % 2 ? 0 : 2, 0);
      const seen = i % 2 ? still : { ...still, vx: 200 };
      observeServer(state, { ...seen, simTime: t + delay }, offsets, null);
    });
    expect(state.delays).toHaveLength(5);
    expect(state.rtt).toBe(0);
  });

  it("does not take a slow drift at rest for disobedience", () => {
    const state = createPrediction();
    for (let tick = 0; tick < 10; tick++) {
      observeServer(
        state,
        { simTime: tick * 50, x: 0, y: 0, vx: 0.3, vy: 0, alive: true },
        [0],
        null,
      );
    }
    expect(state.diverged).toBe(false);
  });

  it("never exceeds the real round trip, and finds it from a few key changes", () => {
    const keys: Key[] = [];
    for (let i = 0; i < 12; i++) {
      keys.push({ t: 1000 + i * 437, ...(i % 2 ? STOP : RIGHT) });
    }
    const { state } = play(
      serve(keys, 7000, { uplink: 60, downlink: 60, jitter: 30 }),
      keys,
    );
    expect(state.rtt).toBeLessThanOrEqual(120);
    expect(state.rtt).toBeGreaterThan(90);
  });
});

describe("input normalisation (server rule)", () => {
  it("scales the client's doubled vector down to a unit direction", () => {
    const state = createPrediction();
    setHeldInput(state, 0, Math.SQRT2, -Math.SQRT2);
    expect(Math.hypot(state.heldX, state.heldY)).toBeCloseTo(1, 6);
    setHeldInput(state, 1, 0.005, 0);
    expect(state.heldX).toBe(0);
    expect(state.history).toHaveLength(2);
  });

  it("takes a non-finite vector for no input", () => {
    const state = createPrediction();
    setHeldInput(state, 0, 2, 0);
    setHeldInput(state, 1, NaN, 0);
    expect([state.heldX, state.heldY]).toEqual([0, 0]);
    setHeldInput(state, 2, 0, Infinity);
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
    setHeldInput(state, 0, 2, 0);
    setHeldInput(state, 5, 2, 0);
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
  const snaps = CAPTURE.map((r): Snap => [...r, true]);
  const { frames, state } = play(snaps, keys, { zones });

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
