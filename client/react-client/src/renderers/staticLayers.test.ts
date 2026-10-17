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
    ["pixel ratio", { pixelRatio: 2 }],
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

  it("paints at device density and still blits pixel for pixel", () => {
    frame({ ...spec, pixelRatio: 2 });
    const [, canvas, x, , w] = screen[0] as [
      string,
      HTMLCanvasElement,
      number,
      number,
      number,
    ];
    // 3 layer pixels per world unit: twice the logical scale.
    expect(offscreen).toContainEqual(["scale", 3, 3]);
    expect(w * 3).toBeCloseTo(canvas.width);
    expect(canvas.width).toBe(Math.round(1000 * 3 - 2 * x * 3));
  });

  describe("a world too big to hold whole (4000 units at 4 px each)", () => {
    const large: StaticLayerSpec = {
      mapId: "map-for-test-large",
      width: 4000,
      height: 4000,
      scale: 4,
      terrainTint: false,
      gridSize: 0,
    };
    const seen = (minX: number) => ({
      ...large,
      visible: { minX, minY: 1900, maxX: minX + 400, maxY: 2200 },
    });
    const blitted = () => screen[0][1] as HTMLCanvasElement;

    it("caches only the region around the view, not the whole world", () => {
      frame(seen(1800));
      expect(screen.map(([m]) => m)).toEqual(["drawImage", "drawImage"]);
      // The 1600x1200 px view plus a margin: nowhere near 16000x16000.
      expect(blitted().width).toBeLessThan(2400);
      expect(blitted().height).toBeLessThan(2000);
      // Blitted where it was painted: the region starts left of the view.
      const [, , x, y, w] = screen[0] as [
        string,
        unknown,
        number,
        number,
        number,
      ];
      expect(x).toBeLessThan(1800);
      expect(y).toBeLessThan(1900);
      expect(x + w).toBeGreaterThan(2200);
      expect(offscreen).toContainEqual(["translate", -x * 4, -y * 4]);
    });

    it("blits the same region while the view stays inside it", () => {
      frame(seen(1800));
      const canvas = blitted();
      offscreen.length = 0;
      for (const minX of [1810, 1850, 1790, 1745]) frame(seen(minX));
      expect(offscreen.length).toBe(0);
      expect(blitted()).toBe(canvas);
    });

    it("repaints the same canvases around the view once it leaves the region", () => {
      frame(seen(1800));
      const canvas = blitted();
      const before = screen[0][2] as number;
      offscreen.length = 0;
      frame(seen(1900));
      expect(count(offscreen, "clearRect")).toBe(2);
      expect(count(offscreen, "fillRect")).toBeGreaterThan(0);
      expect(blitted()).toBe(canvas);
      expect((screen[0][2] as number) - before).toBeCloseTo(100);
    });

    it("draws straight to the screen when it is not told what is visible", () => {
      frame(large);
      expect(count(screen, "drawImage")).toBe(0);
      expect(count(screen, "fillRect")).toBeGreaterThan(0);
    });
  });

  it("draws straight to the screen when there is no offscreen canvas", () => {
    getContext.mockImplementation(() => null);
    frame({ ...spec, scale: 3 });
    expect(count(screen, "drawImage")).toBe(0);
    expect(count(screen, "fillRect")).toBeGreaterThan(20);
  });
});
