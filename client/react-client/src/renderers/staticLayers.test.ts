import {
  StaticLayerSpec,
  drawStaticOver,
  drawStaticUnder,
} from "./staticLayers";

type Call = [string, ...unknown[]];

/** Canvas 2D stand-in that records method calls. */
function recorder(calls: Call[]): CanvasRenderingContext2D {
  const handler: ProxyHandler<() => void> = {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        calls.push([String(name), ...args]);
      },
    set: () => true,
  };
  return new Proxy(
    () => undefined,
    handler,
  ) as unknown as CanvasRenderingContext2D;
}

const count = (calls: Call[], method: string) =>
  calls.filter(([m]) => m === method).length;

const spec: StaticLayerSpec = {
  mapId: "map-for-play",
  width: 1000,
  height: 1000,
  scale: 1.5,
  terrainTint: true,
  gridSize: 80,
};

describe("static world layers", () => {
  let screen: Call[];
  let offscreen: Call[];
  let getContext: jest.SpyInstance;
  const frame = (s: StaticLayerSpec) => {
    screen.length = 0;
    const ctx = recorder(screen);
    drawStaticUnder(ctx, s);
    drawStaticOver(ctx, s);
  };

  beforeEach(() => {
    screen = [];
    offscreen = [];
    getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => recorder(offscreen));
    // Each test starts from a room nothing has been painted for.
    frame({ ...spec, mapId: "map-for-test-deflect", width: 100, height: 100 });
    offscreen.length = 0;
  });
  afterEach(() => jest.restoreAllMocks());

  it("paints the layers once, then only blits them", () => {
    frame(spec);
    const painted = offscreen.length;
    expect(count(offscreen, "fillRect")).toBeGreaterThan(20);
    expect(count(offscreen, "fillText")).toBeGreaterThan(10);

    for (let i = 0; i < 5; i++) frame(spec);
    expect(offscreen.length).toBe(painted);
    // A frame is two blits and nothing else.
    expect(screen.map(([m]) => m)).toEqual(["drawImage", "drawImage"]);
  });

  it("blits a layer pixel for pixel at the world origin", () => {
    frame(spec);
    const [, canvas, x, y, w, h] = screen[0] as [
      string,
      HTMLCanvasElement,
      number,
      number,
      number,
      number,
    ];
    // World units on screen = layer pixels / scale, so nothing is resized...
    expect(w * spec.scale).toBeCloseTo(canvas.width);
    expect(h * spec.scale).toBeCloseTo(canvas.height);
    // ...and the world's (0,0) sits where it was painted, inside a small border
    // that keeps the strokes along the world edge.
    expect(x).toBeLessThan(0);
    expect(x).toBe(y);
    expect(canvas.width).toBe(Math.round(1000 * 1.5 - 2 * x * 1.5));
    const translate = offscreen.find(([m]) => m === "translate")!;
    expect(translate[1]).toBeCloseTo(-x * 1.5);
    expect(translate[2]).toBeCloseTo(-y * 1.5);
    expect(offscreen).toContainEqual(["scale", 1.5, 1.5]);
  });

  it.each([
    ["room", { mapId: "map-for-test-terrain" }],
    ["world size", { width: 800 }],
    ["scale", { scale: 2 }],
    ["terrain tint", { terrainTint: false }],
    ["grid", { gridSize: 0 }],
  ])("repaints when the %s changes", (_, change) => {
    frame(spec);
    offscreen.length = 0;
    frame({ ...spec, ...change });
    expect(offscreen.length).toBeGreaterThan(0);
    offscreen.length = 0;
    frame({ ...spec, ...change });
    expect(offscreen.length).toBe(0);
  });

  it("draws straight to the screen when there is no offscreen canvas", () => {
    getContext.mockImplementation(() => null);
    frame({ ...spec, scale: 3 });
    expect(count(screen, "drawImage")).toBe(0);
    expect(count(screen, "fillRect")).toBeGreaterThan(20);
  });
});
