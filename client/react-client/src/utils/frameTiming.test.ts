import {
  Timings,
  formatPerfRows,
  recordTiming,
  timingSummary,
} from "./frameTiming";

describe("frame timing", () => {
  it("summarises a window as median and worst", () => {
    expect(timingSummary([3, 1, 2, 10, 2])).toEqual({ p50: 2, max: 10 });
    expect(timingSummary([])).toEqual({ p50: 0, max: 0 });
  });

  it("keeps only the most recent samples per stage", () => {
    const timings: Timings = new Map();
    for (let i = 0; i < 500; i++) recordTiming(timings, "total", i);
    const kept = timings.get("total")!;
    expect(kept.length).toBeLessThanOrEqual(120);
    expect(kept[kept.length - 1]).toBe(499);
    expect(timingSummary(kept).max).toBe(499);
  });

  it("formats a frame line with fps and the slowest stage, and a snapshot line", () => {
    const timings: Timings = new Map();
    for (const ms of [4, 5, 9]) recordTiming(timings, "total", ms);
    for (const ms of [16, 17, 16]) recordTiming(timings, "interval", ms);
    for (const ms of [3, 3.4, 6]) recordTiming(timings, "terrain", ms);
    for (const ms of [1, 1, 1]) recordTiming(timings, "entities", ms);
    for (const ms of [0.2, 0.3, 0.9]) recordTiming(timings, "decode", ms);
    for (const ms of [0.5, 0.6, 2]) recordTiming(timings, "update", ms);
    expect(formatPerfRows(timings)).toEqual([
      ["frame", "5.0 ms (max 9.0)  63 fps  slowest terrain 3.4"],
      ["snap cost", "decode 0.3 ms (max 0.9)  update 0.6 ms (max 2.0)"],
    ]);
  });

  it("shows nothing for what has not been measured", () => {
    expect(formatPerfRows(new Map())).toEqual([]);
    const timings: Timings = new Map();
    recordTiming(timings, "decode", 0.25);
    recordTiming(timings, "update", 1);
    expect(formatPerfRows(timings).map(([label]) => label)).toEqual([
      "snap cost",
    ]);
  });
});
