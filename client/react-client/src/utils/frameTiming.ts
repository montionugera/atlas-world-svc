/**
 * Rolling durations (ms) of the frame loop's stages and of snapshot handling, shown in
 * the debug readout so client cost can be read off on the machine that is running it.
 */

/** Stages of one drawn frame, in draw order. */
export const FRAME_STAGES = [
  "interp",
  "terrain",
  "tint+grid",
  "entities",
  "debug",
  "hud",
] as const;
/** A frame stage, the whole frame, the gap between frames, or a snapshot step. */
export type TimingKey =
  (typeof FRAME_STAGES)[number] | "total" | "interval" | "decode" | "update";

export type Timings = Map<TimingKey, number[]>;

/** Samples kept per key: two seconds of frames. */
const WINDOW = 120;

/** Timings of the running client (the frame loop and the snapshot handler write here). */
export const perfTimings: Timings = new Map();

export function recordTiming(
  timings: Timings,
  key: TimingKey,
  ms: number,
): void {
  let samples = timings.get(key);
  if (!samples) timings.set(key, (samples = []));
  samples.push(ms);
  if (samples.length > WINDOW) samples.shift();
}

export function timingSummary(samples: readonly number[] = []): {
  p50: number;
  max: number;
} {
  if (samples.length === 0) return { p50: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50: sorted[sorted.length >> 1], max: sorted[sorted.length - 1] };
}

const p50Max = (samples?: readonly number[]): string => {
  const { p50, max } = timingSummary(samples);
  return `${p50.toFixed(1)} ms (max ${max.toFixed(1)})`;
};

/** Label/value rows for the debug readout; a row appears once it has been measured. */
export function formatPerfRows(timings: Timings): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (timings.has("total")) {
    const interval = timingSummary(timings.get("interval")).p50;
    let slowest = "";
    let slowestMs = -1;
    for (const stage of FRAME_STAGES) {
      const ms = timingSummary(timings.get(stage)).p50;
      if (timings.has(stage) && ms > slowestMs) {
        slowest = stage;
        slowestMs = ms;
      }
    }
    rows.push([
      "frame",
      [
        p50Max(timings.get("total")),
        interval > 0 ? `${Math.round(1000 / interval)} fps` : "",
        slowest ? `slowest ${slowest} ${slowestMs.toFixed(1)}` : "",
      ]
        .filter(Boolean)
        .join("  "),
    ]);
  }
  if (timings.has("decode") || timings.has("update")) {
    rows.push([
      "snap cost",
      `decode ${p50Max(timings.get("decode"))}  update ${p50Max(timings.get("update"))}`,
    ]);
  }
  return rows;
}
