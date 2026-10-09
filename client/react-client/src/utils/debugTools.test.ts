import {
  DEFAULT_DEBUG_TOGGLES,
  EMPTY_TRACKER,
  advanceTracker,
  formatReadout,
  isTextEntryTarget,
  loadDebugToggles,
  saveDebugToggles,
  smoothSpeed,
  snapshotRateHz,
  speedOf,
} from "./debugTools";

describe("speedOf", () => {
  it("is the velocity magnitude in units/second", () => {
    expect(speedOf(3, 4)).toBe(5);
    expect(speedOf(-200, 0)).toBe(200);
    expect(speedOf(0, 0)).toBe(0);
  });

  it("is 0 for missing or non-finite velocity", () => {
    expect(speedOf(undefined, 4)).toBe(0);
    expect(speedOf(NaN, 4)).toBe(0);
    expect(speedOf(Infinity, 0)).toBe(0);
  });
});

describe("smoothSpeed", () => {
  it("starts at the first sample", () => {
    expect(smoothSpeed(null, 200)).toBe(200);
  });

  it("moves a fraction alpha toward each new sample", () => {
    expect(smoothSpeed(100, 200, 0.5)).toBe(150);
    expect(smoothSpeed(200, 100, 0.25)).toBe(175);
  });

  it("snaps to exactly 0 when stopped instead of decaying forever", () => {
    expect(smoothSpeed(200, 0)).toBe(0);
  });

  it("converges on a steady speed", () => {
    let s: number | null = null;
    for (let i = 0; i < 40; i++) s = smoothSpeed(s, 100);
    expect(s).toBeCloseTo(100, 6);
  });
});

describe("snapshotRateHz", () => {
  it("is null until two arrivals exist", () => {
    expect(snapshotRateHz([])).toBeNull();
    expect(snapshotRateHz([10])).toBeNull();
  });

  it("is intervals per second over the window", () => {
    expect(snapshotRateHz([0, 50, 100, 150, 200])).toBe(20);
    expect(snapshotRateHz([1000, 1100])).toBe(10);
  });

  it("is null for a zero or negative span", () => {
    expect(snapshotRateHz([5, 5])).toBeNull();
    expect(snapshotRateHz([10, 5])).toBeNull();
  });
});

describe("advanceTracker", () => {
  it("records one arrival and speed sample per new snapshot", () => {
    const t1 = advanceTracker(EMPTY_TRACKER, { vx: 200, vy: 0, receivedAt: 0 });
    expect(t1.rawSpeed).toBe(200);
    expect(t1.smoothedSpeed).toBe(200);
    expect(t1.arrivals).toEqual([0]);
  });

  it("ignores a repeat of the same snapshot (same receivedAt)", () => {
    const t1 = advanceTracker(EMPTY_TRACKER, { vx: 200, vy: 0, receivedAt: 7 });
    expect(advanceTracker(t1, { vx: 0, vy: 0, receivedAt: 7 })).toBe(t1);
  });

  it("ignores a sample with no arrival stamp", () => {
    expect(advanceTracker(EMPTY_TRACKER, { vx: 1, vy: 1 })).toBe(EMPTY_TRACKER);
  });

  it("keeps a bounded arrival window and does not mutate its input", () => {
    let t = EMPTY_TRACKER;
    for (let i = 0; i < 100; i++) {
      t = advanceTracker(t, { vx: 100, vy: 0, receivedAt: i * 50 });
    }
    expect(t.arrivals.length).toBe(20);
    expect(snapshotRateHz(t.arrivals)).toBe(20);
    expect(EMPTY_TRACKER.arrivals).toEqual([]);
  });
});

describe("formatReadout", () => {
  const base = {
    mapId: "map-for-play",
    tick: 42,
    player: {
      x: 123.44,
      y: 500.06,
      vx: 120,
      vy: 160,
      receivedAt: 1000,
      isAlive: true,
      currentHealth: 80,
      maxHealth: 100,
      isBotMode: false,
      currentAttackTarget: "77",
    },
    tracker: {
      arrivals: [900, 950, 1000],
      rawSpeed: 200,
      smoothedSpeed: 187.6,
    },
    terrain: { label: "Sand", speedMultiplier: 0.7 },
    referenceRunSpeed: 200,
    latency: { pingMs: 12, jitterMs: 3 },
    counts: { players: 2, mobs: 5, projectiles: 1 },
    castingSkill: "Blizzard",
    attackHeld: true,
  };
  const rows = (input: Parameters<typeof formatReadout>[0], now = 1030) =>
    Object.fromEntries(formatReadout(input, now));

  it("shows position, smoothed speed, terrain and its multiplier", () => {
    const r = rows(base);
    expect(r["pos"]).toBe("123.4, 500.1");
    expect(r["speed"]).toBe("188 u/s  (raw 200)");
    expect(r["terrain"]).toBe("Sand  x0.70");
    expect(r["expect"]).toBe("140 u/s walking  (200 x0.70, 0 AGI)");
  });

  it("shows frame and snapshot cost once they are measured", () => {
    expect(rows(base)["frame"]).toBeUndefined();
    const r = rows({
      ...base,
      perf: new Map([
        ["total", [4]],
        ["decode", [0.2]],
        ["update", [0.5]],
      ]),
    });
    expect(r["frame"]).toBe("4.0 ms (max 4.0)");
    expect(r["snap cost"]).toBe(
      "decode 0.2 ms (max 0.2)  update 0.5 ms (max 0.5)",
    );
  });

  it("shows snapshot rate, snapshot age and latency", () => {
    const r = rows(base);
    expect(r["snap"]).toBe("20.0 Hz  age 30 ms");
    expect(r["net"]).toBe("clock offset 12 ms  jitter 3 ms");
  });

  it("shows only state the snapshot or the client really has", () => {
    const r = rows(base);
    expect(r["hp"]).toBe("80 / 100");
    expect(r["state"]).toBe("alive  target#77");
    expect(r["client"]).toBe("atk-held  cast:Blizzard");
    expect(r["entities"]).toBe("2 P  5 M  1 proj");
    expect(r["room"]).toBe("map-for-play  tick 42");
  });

  it("shows the local prediction state, its error and the calibrated speed", () => {
    const prediction = {
      enabled: true,
      yielding: null as string | null,
      error: 0.42,
      errorMax: 6.25,
      baseSpeed: 201.3,
      calibrated: true,
      rtt: 12.4,
    };
    expect(rows(base)["predict"]).toBeUndefined();
    expect(rows({ ...base, prediction })["predict"]).toBe(
      "on  err 0.4 u (max 6.3)  base 201 u/s  rtt 12 ms",
    );
    expect(
      rows({
        ...base,
        prediction: { ...prediction, yielding: "dash", calibrated: false },
      })["predict"],
    ).toBe("yielding (dash)  err 0.4 u (max 6.3)  base 201 u/s?  rtt 12 ms");
    expect(
      rows({ ...base, prediction: { ...prediction, enabled: false } })[
        "predict"
      ],
    ).toBe("off (interpolated)");
  });

  it("says so plainly when there is no terrain data for the map", () => {
    expect(rows({ ...base, terrain: null })["terrain"]).toBe(
      "no client terrain data",
    );
    expect(rows({ ...base, terrain: null })["expect"]).toBeUndefined();
  });

  it("marks a dead bot and an idle client", () => {
    const r = rows({
      ...base,
      player: {
        ...base.player,
        isAlive: false,
        isBotMode: true,
        currentAttackTarget: undefined,
      },
      castingSkill: null,
      attackHeld: false,
    });
    expect(r["state"]).toBe("DEAD  bot");
    expect(r["client"]).toBe("idle");
  });

  it("degrades to placeholders before the local player exists", () => {
    const r = rows({ ...base, player: undefined, tracker: EMPTY_TRACKER });
    expect(r["pos"]).toBe("no local player");
    expect(r["snap"]).toBe("-- Hz  age --");
    expect(r["speed"]).toBeUndefined();
  });
});

describe("isTextEntryTarget", () => {
  const el = (tag: string, attrs: Record<string, string> = {}) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  it("is true for text inputs, textareas, selects and editable content", () => {
    expect(isTextEntryTarget(el("input"))).toBe(true);
    expect(isTextEntryTarget(el("input", { type: "number" }))).toBe(true);
    expect(isTextEntryTarget(el("textarea"))).toBe(true);
    expect(isTextEntryTarget(el("select"))).toBe(true);
    expect(isTextEntryTarget(el("div", { contenteditable: "true" }))).toBe(
      true,
    );
  });

  it("is false for buttons, non-text inputs, the canvas and null", () => {
    expect(isTextEntryTarget(el("button"))).toBe(false);
    expect(isTextEntryTarget(el("input", { type: "radio" }))).toBe(false);
    expect(isTextEntryTarget(el("input", { type: "checkbox" }))).toBe(false);
    expect(isTextEntryTarget(el("canvas"))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(window)).toBe(false);
  });
});

describe("debug toggle persistence", () => {
  const memoryStorage = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      data,
    };
  };

  it("defaults every toggle ON", () => {
    expect(DEFAULT_DEBUG_TOGGLES).toEqual({
      overlay: true,
      world: true,
      terrain: true,
      prediction: true,
    });
    expect(loadDebugToggles(memoryStorage())).toEqual(DEFAULT_DEBUG_TOGGLES);
  });

  it("round-trips saved toggles", () => {
    const s = memoryStorage();
    saveDebugToggles(
      { overlay: false, world: true, terrain: false, prediction: false },
      s,
    );
    expect(loadDebugToggles(s)).toEqual({
      overlay: false,
      world: true,
      terrain: false,
      prediction: false,
    });
  });

  it("falls back to defaults on garbage, wrong types or missing keys", () => {
    expect(
      loadDebugToggles(memoryStorage({ "atlas-debug-toggles": "{nope" })),
    ).toEqual(DEFAULT_DEBUG_TOGGLES);
    expect(
      loadDebugToggles(
        memoryStorage({
          "atlas-debug-toggles": '{"overlay":"no","world":false}',
        }),
      ),
    ).toEqual({ overlay: true, world: false, terrain: true, prediction: true });
    expect(
      loadDebugToggles(memoryStorage({ "atlas-debug-toggles": "null" })),
    ).toEqual(DEFAULT_DEBUG_TOGGLES);
  });

  it("survives a storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadDebugToggles(broken)).toEqual(DEFAULT_DEBUG_TOGGLES);
    expect(() => saveDebugToggles(DEFAULT_DEBUG_TOGGLES, broken)).not.toThrow();
  });
});
