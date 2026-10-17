import {
  cacheRegion,
  cullInto,
  regionCovers,
  visibleWorldRect,
} from "./viewport";

describe("visibleWorldRect", () => {
  it("is the view, in world units, centred on the camera", () => {
    expect(
      visibleWorldRect({
        camera: { x: 2000, y: 1000 },
        view: { width: 800, height: 400 },
        scale: 2,
      }),
    ).toEqual({ minX: 1800, minY: 900, maxX: 2200, maxY: 1100 });
  });
});

describe("cullInto", () => {
  const rect = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
  const cull = (
    entities: Array<{ id: string; x: number; y: number; radius?: number }>,
    margin = 10,
  ) =>
    Array.from(
      cullInto({
        source: new Map(entities.map((e) => [e.id, e])),
        into: new Map(),
        rect,
        margin,
      }).keys(),
    );

  it("keeps what is on screen and drops what is far outside", () => {
    expect(
      cull([
        { id: "in", x: 150, y: 150 },
        { id: "left", x: 50, y: 150 },
        { id: "right", x: 250, y: 150 },
        { id: "above", x: 150, y: 50 },
        { id: "below", x: 150, y: 250 },
      ]),
    ).toEqual(["in"]);
  });

  it("keeps an entity within the margin of an edge, and no further", () => {
    expect(
      cull([
        { id: "near", x: 210, y: 150 },
        { id: "far", x: 210.5, y: 150 },
      ]),
    ).toEqual(["near"]);
    expect(cull([{ id: "near", x: 210, y: 150 }], 0)).toEqual([]);
  });

  it("counts an entity's radius: a big one pokes into view from further away", () => {
    expect(
      cull([
        { id: "big", x: 240, y: 150, radius: 30 },
        { id: "small", x: 240, y: 150, radius: 5 },
      ]),
    ).toEqual(["big"]);
  });

  it("empties the reused map first and returns it", () => {
    const into = new Map([["stale", { x: 150, y: 150 }]]);
    const out = cullInto({
      source: new Map([["fresh", { x: 150, y: 150 }]]),
      into,
      rect,
      margin: 0,
    });
    expect(out).toBe(into);
    expect(Array.from(into.keys())).toEqual(["fresh"]);
  });
});

describe("cached region of a big world", () => {
  const visible = { minX: 1800.3, minY: 900.3, maxX: 2200.3, maxY: 1100.3 };
  const layerScale = 4;
  const region = cacheRegion({ visible, layerScale, marginPx: 256 });

  it("is the visible rectangle plus the margin, in whole layer pixels", () => {
    expect(region).toEqual({ x: 6945, y: 3345, width: 2113, height: 1313 });
  });

  it("is far smaller than the whole world", () => {
    expect(region.width * region.height).toBeLessThan(
      (4000 * layerScale) ** 2 / 50,
    );
  });

  it("keeps its size wherever the camera is", () => {
    const moved = cacheRegion({
      visible: { minX: 31.7, minY: -12.2, maxX: 431.7, maxY: 187.8 },
      layerScale,
      marginPx: 256,
    });
    expect([moved.width, moved.height]).toEqual([region.width, region.height]);
    expect([moved.x, moved.y]).toEqual([-130, -305]);
  });

  it("covers the view until the camera has travelled the margin", () => {
    const shifted = (dx: number) => ({
      ...visible,
      minX: visible.minX + dx,
      maxX: visible.maxX + dx,
    });
    const covers = (dx: number) =>
      regionCovers({ region, visible: shifted(dx), layerScale });
    expect(covers(0)).toBe(true);
    // 256 px = 64 world units either way.
    expect(covers(63)).toBe(true);
    expect(covers(-63)).toBe(true);
    expect(covers(65)).toBe(false);
    expect(covers(-65)).toBe(false);
  });

  it("stops covering when the view leaves it vertically", () => {
    expect(
      regionCovers({
        region,
        visible: {
          ...visible,
          minY: visible.minY + 65,
          maxY: visible.maxY + 65,
        },
        layerScale,
      }),
    ).toBe(false);
  });
});
