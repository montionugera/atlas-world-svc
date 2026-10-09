/** Pure helpers behind the test client's debug overlay (no DOM writes, no canvas). */
import { Timings, formatPerfRows } from "./frameTiming";

/** Velocity magnitude in world units/second; 0 for missing or non-finite input. */
export function speedOf(vx?: number, vy?: number): number {
  if (vx === undefined || vy === undefined) return 0;
  const s = Math.hypot(vx, vy);
  return Number.isFinite(s) ? s : 0;
}

/** Exponential moving average; a stopped sample reads exactly 0. */
export function smoothSpeed(
  prev: number | null,
  sample: number,
  alpha: number = 0.3,
): number {
  if (prev === null || sample === 0) return sample;
  return prev + (sample - prev) * alpha;
}

/** Snapshots per second across a window of arrival stamps (ms); null if unknown. */
export function snapshotRateHz(arrivals: readonly number[]): number | null {
  if (arrivals.length < 2) return null;
  const span = arrivals[arrivals.length - 1] - arrivals[0];
  if (!(span > 0)) return null;
  return ((arrivals.length - 1) * 1000) / span;
}

const ARRIVAL_WINDOW = 20;

export interface DebugTracker {
  /** performance.now() stamps of the most recent snapshots. */
  arrivals: readonly number[];
  rawSpeed: number;
  smoothedSpeed: number | null;
}

export const EMPTY_TRACKER: DebugTracker = {
  arrivals: [],
  rawSpeed: 0,
  smoothedSpeed: null,
};

/** Fold the local player's latest snapshot into the tracker (one sample per snapshot). */
export function advanceTracker(
  tracker: DebugTracker,
  sample: { vx?: number; vy?: number; receivedAt?: number },
): DebugTracker {
  const { receivedAt } = sample;
  if (receivedAt === undefined) return tracker;
  if (tracker.arrivals[tracker.arrivals.length - 1] === receivedAt) {
    return tracker;
  }
  const rawSpeed = speedOf(sample.vx, sample.vy);
  return {
    arrivals: [...tracker.arrivals, receivedAt].slice(-ARRIVAL_WINDOW),
    rawSpeed,
    smoothedSpeed: smoothSpeed(tracker.smoothedSpeed, rawSpeed),
  };
}

export interface ReadoutInput {
  mapId: string;
  tick: number;
  player?: {
    x: number;
    y: number;
    receivedAt?: number;
    isAlive?: boolean;
    currentHealth?: number;
    maxHealth?: number;
    isBotMode?: boolean;
    currentAttackTarget?: string;
  };
  tracker: DebugTracker;
  /** Terrain under the player, or null when the client has no data for this map. */
  terrain: { label: string; speedMultiplier: number } | null;
  /** `pingMs` is the client-clock minus server-clock delta, not a round trip. */
  /** Grass walking speed the expectation is built from (see config/terrain.ts). */
  referenceRunSpeed: number;
  latency?: { pingMs: number; jitterMs: number };
  /** Frame-loop and snapshot-handling cost. */
  perf?: Timings;
  counts: { players: number; mobs: number; projectiles: number };
  /** Client-side prediction, not carried by the snapshot. */
  castingSkill: string | null;
  attackHeld: boolean;
  /** Local-player prediction (utils/localPrediction.ts), read live. */
  prediction?: {
    enabled: boolean;
    yielding: string | null;
    error: number;
    errorMax: number;
    baseSpeed: number;
    calibrated: boolean;
    rtt: number;
  };
}

/** Label/value rows for the debug readout, top to bottom. */
export function formatReadout(
  input: ReadoutInput,
  now: number,
): Array<[string, string]> {
  const { player, tracker, terrain, latency, counts } = input;
  const rows: Array<[string, string]> = [];
  const hz = snapshotRateHz(tracker.arrivals);
  const lastArrival = tracker.arrivals[tracker.arrivals.length - 1];
  const age =
    lastArrival === undefined
      ? "--"
      : `${Math.max(0, Math.round(now - lastArrival))} ms`;

  if (player) {
    rows.push(["pos", `${player.x.toFixed(1)}, ${player.y.toFixed(1)}`]);
    rows.push([
      "speed",
      `${Math.round(tracker.smoothedSpeed ?? 0)} u/s  (raw ${Math.round(tracker.rawSpeed)})`,
    ]);
    rows.push([
      "terrain",
      terrain
        ? `${terrain.label}  x${terrain.speedMultiplier.toFixed(2)}`
        : "no client terrain data",
    ]);
    if (terrain) {
      rows.push([
        "expect",
        `${Math.round(input.referenceRunSpeed * terrain.speedMultiplier)} u/s walking  (${input.referenceRunSpeed} x${terrain.speedMultiplier.toFixed(2)}, 0 AGI)`,
      ]);
    }
    rows.push([
      "hp",
      `${Math.round(player.currentHealth ?? 0)} / ${Math.round(player.maxHealth ?? 0)}`,
    ]);
    rows.push([
      "state",
      [
        player.isAlive ? "alive" : "DEAD",
        player.isBotMode ? "bot" : "",
        player.currentAttackTarget
          ? `target#${player.currentAttackTarget}`
          : "",
      ]
        .filter(Boolean)
        .join("  "),
    ]);
    rows.push([
      "client",
      [
        input.attackHeld ? "atk-held" : "",
        input.castingSkill ? `cast:${input.castingSkill}` : "",
      ]
        .filter(Boolean)
        .join("  ") || "idle",
    ]);
  } else {
    rows.push(["pos", "no local player"]);
  }
  const predict = input.prediction;
  if (predict) {
    rows.push([
      "predict",
      predict.enabled
        ? [
            predict.yielding ? `yielding (${predict.yielding})` : "on",
            `err ${predict.error.toFixed(1)} u (max ${predict.errorMax.toFixed(1)})`,
            `base ${Math.round(predict.baseSpeed)} u/s${predict.calibrated ? "" : "?"}`,
            `rtt ${Math.round(predict.rtt)} ms`,
          ].join("  ")
        : "off (interpolated)",
    ]);
  }

  rows.push(["snap", `${hz === null ? "--" : hz.toFixed(1)} Hz  age ${age}`]);
  if (latency) {
    rows.push([
      "net",
      `clock offset ${Math.round(latency.pingMs)} ms  jitter ${Math.round(latency.jitterMs)} ms`,
    ]);
  }
  if (input.perf) rows.push(...formatPerfRows(input.perf));
  rows.push([
    "entities",
    `${counts.players} P  ${counts.mobs} M  ${counts.projectiles} proj`,
  ]);
  rows.push(["room", `${input.mapId}  tick ${input.tick}`]);
  return rows;
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
]);

/** True when a key event is aimed at something the user types into. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type);
  }
  return (
    target.isContentEditable ||
    target.getAttribute("contenteditable") === "true"
  );
}

export interface DebugToggles {
  /** Text readout panel. */
  overlay: boolean;
  /** World-space rings, grid, velocity vectors. */
  world: boolean;
  /** Terrain zone tint, labels and legend. */
  terrain: boolean;
  /** Draw the local player from its own input instead of the delayed timeline. */
  prediction: boolean;
}

export const DEFAULT_DEBUG_TOGGLES: DebugToggles = {
  overlay: true,
  world: true,
  terrain: true,
  prediction: true,
};

const TOGGLES_KEY = "atlas-debug-toggles";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

const browserStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function loadDebugToggles(
  storage: ReadStorage | undefined = browserStorage(),
): DebugToggles {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(TOGGLES_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_DEBUG_TOGGLES;
    }
    const saved = parsed as Record<string, unknown>;
    const pick = (k: keyof DebugToggles): boolean => {
      const v = saved[k];
      return typeof v === "boolean" ? v : DEFAULT_DEBUG_TOGGLES[k];
    };
    return {
      overlay: pick("overlay"),
      world: pick("world"),
      terrain: pick("terrain"),
      prediction: pick("prediction"),
    };
  } catch {
    return DEFAULT_DEBUG_TOGGLES;
  }
}

export function saveDebugToggles(
  toggles: DebugToggles,
  storage: WriteStorage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(TOGGLES_KEY, JSON.stringify(toggles));
  } catch {
    // Storage unavailable (private mode / quota): toggles just don't persist.
  }
}
