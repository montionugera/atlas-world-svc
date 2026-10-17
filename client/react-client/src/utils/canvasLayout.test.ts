import {
  backingSize,
  clientToWorld,
  fitCanvasSize,
  snapToDevicePixel,
} from "./canvasLayout";

describe("fitCanvasSize", () => {
  it("fills the space beside the side column on a 1440 px laptop", () => {
    expect(fitCanvasSize(980, 600, 2)).toEqual({
      width: 980,
      height: 600,
      pixelRatio: 2,
    });
  });

  it("never gets narrower than 4:3 or wider than 2:1", () => {
    expect(fitCanvasSize(600, 2000, 1)).toMatchObject({
      width: 600,
      height: 450,
    });
    expect(fitCanvasSize(3000, 700, 1)).toMatchObject({
      width: 1400,
      height: 700,
    });
  });

  it("keeps a usable size when the space is unknown or tiny", () => {
    const view = fitCanvasSize(0, 0, 1);
    expect(view.width).toBeGreaterThanOrEqual(320);
    expect(view.height).toBeGreaterThanOrEqual(160);
    expect(fitCanvasSize(NaN, NaN, NaN).pixelRatio).toBe(1);
  });

  it("uses the screen's density, capped so the short side stays within 1600 px", () => {
    expect(fitCanvasSize(800, 600, 1).pixelRatio).toBe(1);
    expect(fitCanvasSize(800, 600, 0.5).pixelRatio).toBe(1);
    const big = fitCanvasSize(1800, 1000, 2);
    expect(big.pixelRatio).toBe(1.6);
    expect(backingSize(big)).toEqual({ width: 2880, height: 1600 });
  });

  it("rounds the backing store to whole device pixels", () => {
    expect(backingSize({ width: 333, height: 250, pixelRatio: 1.5 })).toEqual({
      width: 500,
      height: 375,
    });
  });
});

describe("clientToWorld", () => {
  const view = { width: 1000, height: 600 };
  const camera = { x: 500, y: 400 };

  it("maps the centre of the canvas to the camera", () => {
    const rect = { left: 40, top: 60, width: 1000, height: 600 };
    expect(clientToWorld(540, 360, rect, view, 1.5, camera)).toEqual(camera);
  });

  it("is independent of the backing-store ratio (logical pixels only)", () => {
    // A 2x backing store changes canvas.width, not the rect or the view.
    const rect = { left: 0, top: 0, width: 1000, height: 600 };
    expect(clientToWorld(800, 150, rect, view, 1.5, camera)).toEqual({
      x: 700,
      y: 300,
    });
  });

  it("follows a canvas that CSS has scaled away from its logical size", () => {
    const rect = { left: 10, top: 20, width: 500, height: 300 };
    expect(clientToWorld(410, 95, rect, view, 1.5, camera)).toEqual({
      x: 700,
      y: 300,
    });
  });

  it("does not divide by a zero-sized rect", () => {
    const rect = { left: 0, top: 0, width: 0, height: 0 };
    const p = clientToWorld(500, 300, rect, view, 2, camera);
    expect(p).toEqual(camera);
  });
});

describe("snapToDevicePixel", () => {
  it("lands on whole device pixels at any ratio", () => {
    expect(snapToDevicePixel(10.3, 1)).toBe(10);
    expect(snapToDevicePixel(10.3, 2)).toBe(10.5);
    expect(snapToDevicePixel(10.3, 2) * 2).toBe(21);
  });
});
