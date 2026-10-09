import {
  extrapolateEntities,
  extrapolatePosition,
  MAX_EXTRAPOLATION_MS,
} from "./deadReckoning";

describe("extrapolatePosition", () => {
  it("renders exactly at the snapshot for zero velocity", () => {
    expect(
      extrapolatePosition({ x: 5, y: 7, vx: 0, vy: 0, receivedAt: 100 }, 140),
    ).toEqual({ x: 5, y: 7 });
  });

  it("advances by velocity (units/second) * elapsed seconds", () => {
    const p = extrapolatePosition(
      { x: 10, y: 20, vx: 200, vy: -100, receivedAt: 1000 },
      1030,
    );
    expect(p.x).toBeCloseTo(16);
    expect(p.y).toBeCloseTo(17);
  });

  it("clamps elapsed time to MAX_EXTRAPOLATION_MS", () => {
    const p = extrapolatePosition(
      { x: 0, y: 0, vx: 1000, vy: 0, receivedAt: 0 },
      5000,
    );
    expect(p.x).toBeCloseTo((1000 * MAX_EXTRAPOLATION_MS) / 1000);
  });

  it("does not extrapolate backwards when the clock is behind the stamp", () => {
    expect(
      extrapolatePosition({ x: 1, y: 2, vx: 50, vy: 50, receivedAt: 500 }, 400),
    ).toEqual({ x: 1, y: 2 });
  });

  it("falls back to the snapshot for missing or NaN velocity/stamp", () => {
    expect(extrapolatePosition({ x: 3, y: 4 }, 100)).toEqual({ x: 3, y: 4 });
    expect(
      extrapolatePosition({ x: 3, y: 4, vx: NaN, vy: 5, receivedAt: 0 }, 50),
    ).toEqual({ x: 3, y: 4 });
    expect(
      extrapolatePosition({ x: 3, y: 4, vx: 5, vy: 5, receivedAt: NaN }, 50),
    ).toEqual({ x: 3, y: 4 });
  });
});

describe("extrapolateEntities", () => {
  it("returns a new map with extrapolated positions and leaves input intact", () => {
    const src = new Map([
      ["a", { id: "a", x: 0, y: 0, vx: 100, vy: 0, receivedAt: 0 }],
    ]);
    const out = extrapolateEntities(src, 50);
    expect(out.get("a")?.x).toBeCloseTo(5);
    expect(src.get("a")?.x).toBe(0);
  });
});
