import { CAPTURE } from "./__fixtures__/snapshotCapture";
import {
  PosSample,
  SNAPSHOT_INTERVAL_MS,
  SnapshotClock,
  interpolateEntities,
  observeSnapshot,
  pushSample,
  renderTimeAt,
  samplePosition,
} from "./snapshotInterpolation";

type Row = readonly [number, number, number, number, number, number];
interface Frame {
  now: number;
  t: number;
  x: number;
  y: number;
}

const FRAME_MS = 1000 / 60;

/** Feed `rows` through the clock + sample buffer and draw at 60 fps. */
function replay(rows: ReadonlyArray<Row>, untilMs?: number): Frame[] {
  const frames: Frame[] = [];
  let clock: SnapshotClock | undefined;
  let samples: PosSample[] | undefined;
  let i = 0;
  const end = untilMs ?? rows[rows.length - 1][0];
  for (let now = rows[0][0] + 3; now <= end; now += FRAME_MS) {
    while (i < rows.length && rows[i][0] <= now) {
      const [arrival, tick, x, y] = rows[i++];
      const t = tick * SNAPSHOT_INTERVAL_MS;
      clock = observeSnapshot(clock, t, arrival);
      samples = pushSample(samples, { t, x, y });
    }
    const t = renderTimeAt(clock, now);
    frames.push({ now, t, ...samplePosition({ x: 0, y: 0, samples }, t) });
  }
  return frames;
}

const between = (frames: Frame[], from: number, to: number) =>
  frames.filter((f) => f.now >= from && f.now <= to);
const steps = (frames: Frame[], axis: "x" | "y") =>
  frames.slice(1).map((f, i) => f[axis] - frames[i][axis]);

/** Steady +x walk at 200 u/s, one snapshot per tick, with the given arrival times. */
function walk(arrivals: number[]): Row[] {
  return arrivals.map((a, tick) => [a, tick, tick * 10, 0, 200, 0] as const);
}

describe("snapshot interpolation on a real jittered capture", () => {
  const frames = replay(CAPTURE);

  it("never runs render time backwards", () => {
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].t).toBeGreaterThanOrEqual(frames[i - 1].t);
    }
  });

  it("moves a steadily walking entity forward every frame, without jumps", () => {
    // +x held from 865 ms to 5365 ms, crossing terrain strips (100-261 u/s).
    const d = steps(between(frames, 1300, 5300), "x");
    expect(Math.min(...d)).toBeGreaterThan(0);
    // 261 u/s * 16.7 ms = 4.35 u; playback may run up to 10% fast.
    expect(Math.max(...d)).toBeLessThan(4.35 * 1.1 + 0.01);
  });

  it("keeps frame-to-frame displacement variance low on constant-speed ground", () => {
    // 100.5 u/s strip: ideal step is 1.675 u per frame.
    const d = steps(between(frames, 7000, 7350), "x");
    const mean = d.reduce((s, v) => s + v, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length);
    expect(sd).toBeLessThan(0.2);
  });

  it.each([
    ["x", 5365, 773.71],
    ["x", 8866, 829.99],
    ["y", 10564, 420.35],
  ] as const)(
    "stops on %s at %d ms without overshoot or snap-back",
    (axis, stopAt, finalPos) => {
      const window = between(frames, stopAt - 200, stopAt + 900);
      for (const f of window)
        expect(f[axis]).toBeLessThanOrEqual(finalPos + 1e-6);
      expect(Math.min(...steps(window, axis))).toBeGreaterThanOrEqual(0);
      expect(window[window.length - 1][axis]).toBeCloseTo(finalPos, 5);
    },
  );

  it.each([7365, 8365])("turns around at %d ms without a jump", (at) => {
    const d = steps(between(frames, at - 100, at + 600), "x");
    // 120.6 u/s * 16.7 ms = 2.01 u per frame, +10% playback slew.
    expect(Math.max(...d.map(Math.abs))).toBeLessThan(2.01 * 1.1 + 0.01);
  });
});

describe("late and missing snapshots", () => {
  it("holds, then resumes without a jump, when a snapshot is one interval late", () => {
    const arrivals = Array.from({ length: 40 }, (_, k) => k * 50);
    arrivals[20] += 50; // tick 20 arrives together with tick 21
    const d = steps(between(replay(walk(arrivals)), 500, 1900), "x");
    expect(Math.min(...d)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...d)).toBeLessThan(3.34 * 1.1 + 0.01);
    // The delay then covers that lateness: the same thing again is not a hold.
    arrivals[30] += 50;
    const again = steps(between(replay(walk(arrivals)), 1300, 1900), "x");
    expect(Math.min(...again)).toBeGreaterThan(0);
  });

  it("stops without overshoot or snap-back when the stopping snapshot is late", () => {
    // Walking +x at 200 u/s; the key is released during tick 20 (the server stops
    // the player at x=193) and that snapshot arrives 80 ms late.
    const rows = walk(Array.from({ length: 20 }, (_, k) => k * 50));
    for (let k = 20; k < 40; k++) rows.push([k * 50 + 80, k, 193, 0, 0, 0]);
    const frames = between(replay(rows), 800, 1900);
    for (const f of frames) expect(f.x).toBeLessThanOrEqual(193 + 1e-6);
    expect(Math.min(...steps(frames, "x"))).toBeGreaterThanOrEqual(0);
    expect(frames[frames.length - 1].x).toBeCloseTo(193, 5);
  });

  it("holds through a long stall, then resumes from where it held", () => {
    const arrivals = Array.from({ length: 60 }, (_, k) => k * 50);
    // 250 ms stall before tick 20 (the most the delay covers), then a catch-up burst.
    for (let k = 20; k < 25; k++) arrivals[k] = 1250 + (k - 20) * 2;
    const d = steps(between(replay(walk(arrivals)), 500, 2900), "x");
    expect(Math.min(...d)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...d)).toBeLessThan(3.34 * 1.1 + 0.01);
  });

  it("snaps back to the normal delay after a stall longer than the buffer covers", () => {
    const arrivals = Array.from({ length: 80 }, (_, k) => k * 50);
    // 600 ms main-thread hitch before tick 20: twelve snapshots land together.
    for (let k = 20; k < 32; k++) arrivals[k] = 1600 + (k - 20) * 0.1;
    const frames = replay(walk(arrivals));
    const lag = (f: Frame) => f.now - f.t;
    const normal = Math.max(...between(frames, 500, 950).map(lag));
    // No slow-motion replay of the backlog: the very next frames are back to normal.
    for (const f of between(frames, 1620, 3900)) {
      expect(lag(f)).toBeLessThanOrEqual(normal + 1);
    }
    expect(
      Math.min(...steps(between(frames, 1620, 3900), "x")),
    ).toBeGreaterThan(0);
  });

  it("re-bases when the server timeline itself shifts (skipped ticks)", () => {
    // The server stalls 600 ms and skips the missed ticks: every later snapshot is
    // 600 ms "late" for good, with no burst.
    const arrivals = Array.from({ length: 80 }, (_, k) =>
      k < 20 ? k * 50 : k * 50 + 600,
    );
    const frames = replay(walk(arrivals));
    const after = between(frames, 1800, 3900);
    expect(Math.min(...steps(after, "x"))).toBeGreaterThan(0);
    for (const f of after) expect(f.now - f.t).toBeLessThanOrEqual(600 + 101);
  });

  it("never holds the picture more than 300 ms behind the newest snapshot", () => {
    let clock: SnapshotClock | undefined;
    let worst = 0;
    const feed = (t: number, arrival: number) => {
      clock = observeSnapshot(clock, t, arrival);
      worst = Math.max(worst, clock.newest - renderTimeAt(clock, arrival));
    };
    for (let k = 0; k < 20; k++) feed(k * 50, k * 50);
    // Six snapshots 290 ms late in one burst, then a seventh on time.
    for (let k = 20; k < 26; k++) feed(k * 50, 1290 + (k - 20));
    for (let k = 26; k < 40; k++) feed(k * 50, k * 50);
    expect(worst).toBeLessThanOrEqual(300);
  });

  it("holds at the newest sample when the buffer is dry", () => {
    const samples = [{ t: 1000, x: 10, y: 0 }];
    expect(samplePosition({ x: 0, y: 0, samples }, 1020).x).toBe(10);
    expect(samplePosition({ x: 0, y: 0, samples }, 5000).x).toBe(10);
    const clock = observeSnapshot(undefined, 1000, 2000);
    expect(renderTimeAt(clock, 9000)).toBe(1000);
  });
});

describe("samplePosition / pushSample / clock", () => {
  const a = { t: 1000, x: 0, y: 0 };
  const b = { t: 1050, x: 10, y: 4 };

  it("interpolates between the bracketing samples", () => {
    const p = samplePosition({ x: 99, y: 99, samples: [a, b] }, 1025);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(2);
  });

  it("clamps to the oldest sample and stays put once stopped", () => {
    expect(samplePosition({ x: 99, y: 99, samples: [a, b] }, 900)).toEqual({
      x: 0,
      y: 0,
    });
    expect(samplePosition({ x: 99, y: 99, samples: [a, b] }, 1080)).toEqual({
      x: 10,
      y: 4,
    });
  });

  it("falls back to the raw position without samples or a finite time", () => {
    expect(samplePosition({ x: 3, y: 4 }, 100)).toEqual({ x: 3, y: 4 });
    expect(samplePosition({ x: 3, y: 4, samples: [a] }, NaN)).toEqual({
      x: 3,
      y: 4,
    });
  });

  it("starts a new history when time does not move forward", () => {
    expect(pushSample([a, b], { ...a, t: 1050 })).toHaveLength(1);
    expect(pushSample([a], b)).toEqual([a, b]);
    let h: PosSample[] | undefined;
    for (let k = 0; k < 50; k++) h = pushSample(h, { ...a, t: k * 50 });
    expect(h!.length).toBeLessThanOrEqual(12);
    expect(h![h!.length - 1].t).toBe(49 * 50);
  });

  it("starts a new history on a teleport (respawn / reset), not on a dash", () => {
    // Dash: 450 u/s = 22.5 u per tick. Respawn: across the map in one tick.
    expect(pushSample([a], { t: 1050, x: 22.5, y: 0 })).toHaveLength(2);
    expect(pushSample([a], { t: 1050, x: 60, y: 80 })).toHaveLength(2);
    const respawned = pushSample([a, b], { t: 1100, x: 500, y: 500 });
    expect(respawned).toEqual([{ t: 1100, x: 500, y: 500 }]);
    // Nothing is drawn part-way between the old and the new place.
    expect(samplePosition({ x: 0, y: 0, samples: respawned }, 1075)).toEqual({
      x: 500,
      y: 500,
    });
  });

  it("never lets a non-finite sample reach a drawn position", () => {
    for (const bad of [
      { t: 1100, x: NaN, y: 4 },
      { t: 1100, x: 10, y: Infinity },
      { t: NaN, x: 10, y: 4 },
    ]) {
      const samples = pushSample([a, b], bad);
      for (const t of [1025, 1075, 1100, 1200]) {
        const p = samplePosition({ x: 10, y: 4, samples }, t);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
    expect(pushSample(undefined, { t: 1, x: NaN, y: 0 })).toEqual([]);
  });

  it("resynchronises when the timeline changes (reconnect / room switch)", () => {
    let clock = observeSnapshot(undefined, 1000, 5000);
    clock = observeSnapshot(clock, 900000, 5050);
    expect(clock.offsets).toHaveLength(1);
    expect(renderTimeAt(clock, 5050)).toBeLessThanOrEqual(900000);
    expect(renderTimeAt(undefined, 123)).toBe(123);
  });

  it("reuses its output across frames and still follows the entities", () => {
    type E = {
      id: string;
      x: number;
      y: number;
      hp: number;
      samples: PosSample[];
    };
    const src = new Map<string, E>([
      ["a", { id: "a", x: 10, y: 4, hp: 5, samples: [a, b] }],
      ["gone", { id: "gone", x: 1, y: 1, hp: 1, samples: [a] }],
    ]);
    const out = interpolateEntities(src, 1025);
    const view = out.get("a")!;

    // Next frame: same map, same entry, new position; nothing new is allocated.
    src.delete("gone");
    expect(interpolateEntities(src, 1040, out)).toBe(out);
    expect(out.get("a")).toBe(view);
    expect(view.x).toBeCloseTo(8);
    expect(out.has("gone")).toBe(false);
    expect(src.get("a")!.x).toBe(10);

    // A snapshot replaced the entity: the entry shows the new one, not stale fields.
    src.set("a", { id: "a", x: 20, y: 4, hp: 3, samples: [b] });
    interpolateEntities(src, 1040, out);
    expect(out.get("a")!.hp).toBe(3);
    expect(out.get("a")!.x).toBe(10);
  });

  it("interpolates a map without mutating the originals", () => {
    const src = new Map([["a", { id: "a", x: 10, y: 4, samples: [a, b] }]]);
    const out = interpolateEntities(src, 1025);
    expect(out.get("a")!.x).toBeCloseTo(5);
    expect(out.get("a")!.id).toBe("a");
    expect(src.get("a")!.x).toBe(10);
  });
});
